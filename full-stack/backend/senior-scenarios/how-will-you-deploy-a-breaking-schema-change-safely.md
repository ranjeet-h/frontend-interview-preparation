# How will you deploy a breaking schema change safely

## 1. The Real-World Problem — When You Actually Hit This

You rename `users.name` to `users.display_name` in your codebase and in a migration. You deploy both together. For eight minutes your rolling deploy has old code and new code running at the same time against the same database. The new code writes to `display_name` but the old code still reads `name`. The column `name` is gone, so every request that hits an old server throws a 500. Your error rate spikes to 40%, checkout breaks, and you roll back — but the migration already dropped the old column so rollback makes it worse.

That is what a breaking schema change does. It is any change where the database and the app disagree for even a few seconds: renaming a column or table, splitting one column into two, changing a type from string to enum, adding a NOT NULL constraint to an existing column, or deleting a column that old code still reads. In production you never deploy to zero users. There are always two versions of your code alive during a deploy. If the schema only works with one version, the other version crashes.

Safe deployment means you keep the database compatible with both old and new code at every step.

## 2. The Analogy — Make the Mechanic Obvious

Think about rebuilding a highway bridge while cars keep driving on it.

You cannot close the bridge, tear it down, and build a new one. Traffic never stops. So you do it in phases.

First you build a new lane right next to the old one. Both lanes exist. Cars can drive on either. That is expand — you add the new structure without removing the old.

Then you slowly move cars onto the new lane. You put up cones, repaint lines, and let a few cars try the new lane. If it is rough, you move them back to the old lane. You also tow any cars still parked on the old lane over to the new one. That is dual-write and backfill.

Once every car is happily using the new lane and you have watched traffic for a while, you close the old lane and tear it down. That is contract.

Renaming a database column is exactly the same. The old column is the old lane. The new column is the new lane. Dual-write is letting your app write to both lanes. Backfill is towing parked cars. Feature flags are the traffic cones that let you switch a little traffic at a time. You never have a moment where a car has nowhere to drive. The same rule applies to the database: there is never a moment where a running version of your code finds a column it expects missing.

## 3. The Full Explanation — How It Actually Works

The pattern that solves this is called expand-contract. Some teams call it expand-migrate-contract. The name does not matter. The order matters.

**The core rule is backward compatibility.** At any moment during a deploy, the database must work with the previous code and the next code. You achieve that by making every change in at least two deploys, not one.

Here is the sequence for a rename. The same phases apply to almost any breaking change.

**Phase 1 — Expand: add the new thing without breaking the old.** You add the new column as nullable with no constraint. You do not drop or rename the old column yet. Old code does not know the new column exists, and that is fine. New column being nullable means old code inserting rows will not fail.

```sql
-- Expand: safe, fast, no lock on writes beyond a brief catalog change
ALTER TABLE users ADD COLUMN display_name TEXT;
-- No NOT NULL yet. No default that rewrites the whole table.
```

You deploy this migration by itself or with code that does nothing new yet. The database now has both `name` and `display_name`.

**Phase 2 — Dual-write and backfill: keep both in sync.** You deploy application code that writes to both columns on every create and update. It still reads from the old column so behavior does not change for users. Then you backfill existing rows so old data appears in the new column.

Dual-write code looks like this in your app layer, not in the migration. The migration is only for schema. The code handles syncing:

```js
// writes to both, reads old — safe during rollout
await db.query(
  `UPDATE users SET name = $1, display_name = $1 WHERE id = $2`,
  [newName, userId]
);
```

Backfill runs separately, in batches, so you do not lock the table for minutes:

```sql
-- Backfill in batches, not one giant UPDATE
UPDATE users SET display_name = name
WHERE display_name IS NULL AND id IN (
  SELECT id FROM users WHERE display_name IS NULL LIMIT 1000
);
-- Repeat until 0 rows updated. Run during low traffic or throttled.
```

You verify with a count query before moving on:

```sql
SELECT count(*) FROM users WHERE display_name IS NULL;
-- Must be 0 before you switch reads
```

**Phase 3 — Switch reads: move traffic to the new lane.** Once backfill is done and dual-write has been running for a deploy or two, you deploy code that reads from the new column. The safest way is behind a feature flag so you can flip a small percentage first and roll back instantly without a new deploy.

```js
// reads new, writes both — flag controls which read path is live
const name = flagEnabled('read-display-name', userId)
  ? row.display_name
  : row.name;
```

You still keep writing to both for one more release. That way if you need to flip the flag off, old data is still fresh.

When reads from the new column look healthy in logs and metrics for a full release cycle, you deploy code that only writes to the new column.

**Phase 4 — Contract: remove the old thing.** Only now do you drop the old column. And even here you do it in two steps if the column had a NOT NULL constraint. First you make it nullable if it was not, then you drop it after you are sure no old code or old background job still references it.

```sql
-- Contract: only after no code reads or writes 'name' anywhere
ALTER TABLE users DROP COLUMN name;
```

Changing a type or adding a NOT NULL follows the same phasing. You cannot add `NOT NULL` to a column that has nulls. So you add the column nullable, backfill, verify zero nulls, then add the constraint in a separate deployment:

```sql
-- Only after backfill verified
ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;
-- Postgres 12+ can do this without a full rewrite if you add a CHECK then validate
```

For large tables you also avoid dangerous defaults like `ADD COLUMN status TEXT NOT NULL DEFAULT 'active'` on older Postgres versions that rewrites every row and holds an ACCESS EXCLUSIVE lock. Add nullable, backfill, then set constraint.

**Why this prevents the 500s.** During a rolling deploy, old servers read `name` and new servers read `name` at first. Both succeed because both columns exist. When you later switch to reading `display_name`, old servers have already been replaced. At no point does a live server query a column that does not exist.

**Transactions, locks, and observability matter here.** Schema migrations run in transactions where your database supports it, but long-running DDL holds locks. Keep each migration tiny — one ADD or one DROP — so it finishes in milliseconds. Run backfills outside the migration transaction in batches. Watch the same signals you watch on any deploy: error rate by version, p95 latency for queries touching that table, dead-letter rate for jobs, and the specific query `SELECT count(*) WHERE new_col IS NULL` that tells you if backfill drifted.

**Rollback is built in.** If Phase 3 causes errors, you flip the flag back to reading the old column. No schema rollback needed because the old column is still there. If you had dropped the column in the same deploy, rollback would require restoring data.

## 4. See It In Practice — Real Code or Queries

This is the full safe rename from `name` to `display_name` in PostgreSQL. Each block is a separate deploy. Do not combine them.

**Deploy 1 — Expand migration only**

```sql
-- 001_expand_add_display_name.sql — PostgreSQL
-- Fast operation: adds nullable column, no table rewrite
ALTER TABLE users ADD COLUMN display_name TEXT;

-- Verify
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'users' AND column_name IN ('name', 'display_name');
```

No code change yet, or only code that ignores the new column. This deploy cannot break old code.

**Deploy 2 — Dual-write code + batched backfill**

Application code now writes both:

```js
// Node.js / Postgres example — dual-write
async function updateDisplayName(pool, userId, newName) {
  // Write both columns so old and new stay in sync
  await pool.query(
    `UPDATE users SET name = $1, display_name = $1, updated_at = now() WHERE id = $2`,
    [newName, userId]
  );
}

async function createUser(pool, newName) {
  await pool.query(
    `INSERT INTO users (name, display_name) VALUES ($1, $1)`,
    [newName]
  );
}
```

Backfill runs as a separate job or manual script, throttled:

```sql
-- backfill.sql — run repeatedly until 0 rows affected
UPDATE users
SET display_name = name
WHERE id IN (
  SELECT id FROM users
  WHERE display_name IS NULL
  LIMIT 1000
);

-- check progress
SELECT count(*) AS remaining FROM users WHERE display_name IS NULL;
```

If you use an ORM like Prisma, the same idea: add `displayName` as optional in the schema, map it to `display_name`, and write both fields in the service layer for this release.

**Deploy 3 — Switch reads behind a flag**

```js
// reads new when flag is on, falls back to old otherwise
async function getDisplayName(pool, userId, flags) {
  const row = await pool.query(
    `SELECT name, display_name FROM users WHERE id = $1`,
    [userId]
  );
  const u = row.rows[0];
  if (!u) return null;
  // Flag lets you roll back instantly without a deploy
  return flags.isEnabled('use-display-name-column') ? u.display_name : u.name;
}
```

You still write both here. Monitor error rates per flag variant. When stable at 100% for a full deploy cycle, ship a follow-up that only writes `display_name`.

**Deploy 4 — Add constraint, then contract**

Only after `SELECT count(*) WHERE display_name IS NULL` returns 0 and no old code remains:

```sql
-- 002_add_not_null.sql
ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;

-- 003_contract_drop_old.sql — last step, after you grep the codebase and jobs
ALTER TABLE users DROP COLUMN name;
```

**The broken version you must not do:**

```sql
-- DANGEROUS: single big-bang migration — breaks rolling deploys
ALTER TABLE users RENAME COLUMN name TO display_name;
-- Old code still does SELECT name FROM users -> 500 errors
-- Rollback requires renaming back and you have already lost traffic
```

A safer alternative for the constraint on very large tables is to add a CHECK constraint as NOT VALID then validate later to avoid long locks:

```sql
ALTER TABLE users ADD CONSTRAINT chk_display_name_not_null CHECK (display_name IS NOT NULL) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT chk_display_name_not_null;
-- Then set NOT NULL once validated, or keep the check constraint
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you deploy a breaking schema change with zero downtime?**

Do not deploy code and schema together. Use expand-contract in at least three deploys. First deploy adds the new column or table as nullable and keeps the old one. Second deploy dual-writes to both and backfills old rows. Third deploy switches reads to the new column behind a feature flag, verifies, then drops the old column in a later deploy. At every step the database works with both the previous and the next version of the code. That is what gives you zero downtime and instant rollback.

**Q: Why can't you just rename a column in one migration and deploy the new code at the same time?**

Because deploys are rolling, not instant. For several minutes old and new app servers run side by side against the same database. If you rename `name` to `display_name` in the same deploy, old servers query `name` and crash with undefined column errors. New servers query `display_name` and also crash if you roll back the migration but not the code. One atomic deploy cannot exist when multiple app versions share one database.

**Q: What does dual-write mean and how long do you keep it?**

Dual-write means every create and update writes the same value to both the old and new column. You keep it for at least one full deploy cycle after you switch reads, ideally longer. That way if reading from the new column causes an issue you can flip the feature flag back to the old column and no data is stale. You only stop dual-write after you have confirmed no code, job, or report still reads the old column.

**Q: How do you backfill millions of rows without locking the table?**

You do not run one giant `UPDATE` in the migration. You run a batched update in a separate job that touches 500 to 2000 rows at a time and sleeps briefly between batches. Each batch locks only those rows for a short time. You add the column nullable first so inserts from live traffic do not fail, and you make the backfill idempotent — `WHERE display_name IS NULL` — so you can rerun it safely if it is interrupted.

**Q: How do feature flags make schema migrations safer?**

A flag decouples the code deploy from the behavior change. You deploy code that can read both columns but only activates the new read path when the flag is on. You turn the flag on for 1% of traffic, watch error rates and latency, then ramp to 100%. If something breaks you turn the flag off in seconds with no new deploy and no schema rollback. Without a flag your only rollback is another code deploy, which is slower.

**Q: How do you add a NOT NULL constraint or change a column type safely?**

Never add NOT NULL to an existing column before the data is clean. Add the new column nullable, backfill every row, verify zero nulls, then add the constraint in a later deploy. For type changes like string to enum, add a new column with the new type, dual-write with a conversion, backfill with the same conversion, switch reads, then drop the old. On huge tables add a `CHECK (col IS NOT NULL) NOT VALID` and `VALIDATE CONSTRAINT` to avoid a long full-table lock before setting NOT NULL.

**Q: How do you know it is safe to drop the old column?**

Three checks: a codebase search shows no reference to the old column name in app code, background workers, or analytics queries. Your metrics show the feature flag reading the new column has been at 100% for at least one full release with no fallback. And `SELECT count(*) FROM old_column WHERE` or grep on query logs shows no recent access to that column. Only then do you run `DROP COLUMN` in its own deploy.

## 6. The Traps — What Goes Wrong in Production

**Deploying code and schema in one pull request.** This is the most common failure. The migration drops or renames something the still-running old code needs. The fix is to never drop and switch in the same deploy. Add first, move code later, drop last. Each step must leave the database compatible with the previous code.

**Adding NOT NULL or a default that rewrites the whole table.** On Postgres before version 11, `ADD COLUMN ... NOT NULL DEFAULT 'x'` rewrites every row and holds a lock that blocks writes. Even on newer versions, a restrictive constraint on millions of rows can hold a long lock and queue every query. Add nullable, backfill in batches, then add the constraint in a separate step after verification.

**Running an unbattched backfill inside the migration.** A single `UPDATE users SET display_name = name` on a 10 million row table will run for minutes, bloat WAL, and block autovacuum, or even timeout and leave half the rows converted. Batch it, make it idempotent, and run it outside the DDL transaction.

**Dropping the old column too early.** A background job, a cron report, or an old container you forgot about still reads `name`. You drop it and that job starts failing at 3am. Search every repo and dashboard, check query logs, and keep the old column for at least one full release after the switch before contracting.

**Forgetting to make the backfill idempotent.** If the job crashes halfway and the update is not idempotent, rerunning it produces duplicates or overwrites new data. Always use `WHERE new_col IS NULL` or a cursor on `id > lastId` and write the same deterministic value. Dual-write also keeps live writes from racing the backfill.

**No feature flag, no fast rollback.** You switch reads by deploying new code. Production errors spike. Your only option is another deploy, which takes 10 minutes and makes the outage longer. A flag lets you revert behavior in seconds without touching the schema.

**Changing the contract without telling the frontend.** If the API used to return `{ name: "..." }` and now returns `{ displayName: "..." }`, older cached frontends or mobile apps parsing `name` break even if the database is fine. Keep the API backward compatible too — return both fields for one release — or version the API.

## 7. Compare With Related Concepts

**Expand-contract versus big-bang migration.** Big-bang does everything at once: one migration renames the column and one deploy switches all code. It is simple and works on a dev machine with one server and no traffic. In production with rolling deploys and multiple app versions sharing one database, it guarantees a window where some servers crash. Expand-contract is four small safe steps with a window of zero incompatibility. Use big-bang only when you can take real downtime with zero app servers running. For any zero-downtime requirement, expand-contract wins.

**Expand-contract versus blue-green deployment.** Blue-green switches all traffic from the old environment to the new environment at once by flipping a router. It still shares one database, so if the new schema is incompatible with the old code, a quick rollback to green still hits the new schema and breaks. Blue-green solves the code rollout, not the schema compatibility. You still need expand-contract for the database. The two techniques combine well: expand-contract for the schema, blue-green for the code cutover.

**Backward-compatible schema versus versioned API.** Both are about not breaking consumers during a change, but at different layers. Versioned APIs keep old clients working while you ship a new response shape. Expand-contract keeps old server code working while you shift the storage shape. If you rename a database column but also change the API field name, you need both: keep both columns in the database and both fields in the API response until every client has migrated.

**Online DDL tools like pg_repack, gh-ost, or pt-online-schema-change versus plain ALTER TABLE.** These tools rebuild large tables with minimal locking by copying to a shadow table. They solve the lock problem for huge tables. They do not solve the app compatibility problem. Even with an online rebuild you still need expand-contract if the column name or type changes, because the app code still needs a window where both shapes work.

## 8. 🧠 The Memory Hook

Never close the old lane before every car is on the new one — expand, dual-write and backfill, switch reads behind a flag, then contract. If at any moment a live server could ask for a column that is gone, your deploy is still big-bang.
