# What Is a Schema Migration

## 1. The Real-World Problem — When You Actually Hit This

It's Tuesday, 10am. A team ships a profile-page feature that reads a new `avatar_url` column from the `users` table. The code went through review, CI passed, the deploy rolled out cleanly. Ninety seconds into the rolling restart, monitoring lights up: `column "avatar_url" of relation "users" does not exist` — Postgres error 42703 — and every request touching a profile is returning 500s. Across the whole fleet, because every instance is getting the new code.

What happened is embarrassingly simple: the migration that adds the column was written, but it never ran before the code did — it was sitting behind a manual DBA approval step while the app image sailed through the pipeline. The rollback takes six minutes and restores service instantly, because the old code never heard of `avatar_url` and doesn't miss it. The actual migration, when someone finally runs it by hand? Nine hundred milliseconds.

Nobody wrote bad code. Nobody wrote bad SQL. The *order* was broken — code that needs a column arrived before the column existed. That ordering problem is the entire reason schema migration is a discipline and not just "run some DDL." Your schema and your application code deploy on different trains, but neither runs without the other, and every deploy creates a stretch of track where old code and new code are both live against the same database. Schema migration is the craft of keeping every point of that journey working.

One boundary before we go further: this page teaches the *discipline* — how to evolve tables, columns, types, and constraints over time without breaking either version of your running app. The machinery that executes changes — numbered migration files, history tables, checksums, Flyway/Alembic/Knex specifics, down migrations — is its own deep topic and lives in [what is a database migration](./what-is-database-migration.md). Read that one for tooling mechanics; read this one for how to change structure safely while two versions of your code are alive at once.

## 2. The Analogy — Make the Mechanic Obvious

Think of your database as a highway that can never close. Cars are driving on it right now — those are your requests. The road layout is the schema. The GPS map each driver follows is your application code. And your migrations are the construction crew.

Now the rules of highway renovation under live traffic, which turn out to be exactly the rules of schema evolution:

**Crews never stop traffic to build. They build beside it.** You don't shut the highway to add an exit; you pave the new exit next to the live road while cars keep flowing. That's an additive schema change: add the nullable column, create the new table. Nothing already driving is affected.

**Pave first, publish the route second.** A new exit is useless — worse, dangerous — if drivers' maps send them down a ramp that ends in dirt. The pavement must physically exist before any map routes cars onto it. In our world: the schema change ships *before* the code that depends on it. Reversing that order is precisely Tuesday's 500-storm.

**Never demolish an exit while maps still route cars to it.** Closing an old exit requires that every published map has stopped sending traffic there first. And here's the catch: maps update slowly. Most cars get the update within minutes — that's your rolling deploy replacing instances. But paper-map trucks are still out there: mobile apps released months ago, cron jobs, ETL pipelines, analytics queries, other services reading the same table. Demolition waits for the slowest map, not the fastest one. That's why dropping a column happens in a release of its own, long after the code stopped using it.

**Narrowing a lane strands trucks already en route.** If you repaint a lane from truck-width to sedan-width while a truck is in it, you've made an accident. Widening a lane, though, hurts nobody — trucks and sedans both fit. Same with constraints and types: tightening (`NULL → NOT NULL`, widening→narrowing a type) is the dangerous direction; loosening is nearly free. Tighten only after you've verified nothing oversized is still coming.

**Cones and temporary shoulders come down after the switch.** During construction you tolerate some ugliness — a shoulder doing lane duty, cones everywhere. Once every car is on the new alignment, you sweep them. That's your dual-write shims and temporary nullable columns: transitional scaffolding, removed deliberately, never permanent.

**Demolition rubble cannot be un-rubbled.** Repainting a line is reversible; knocking down an overpass is not. Dropped columns take their data with them, permanently. Every rule above exists so you're never forced to demolish in a panic.

Hold this picture. Every technical term coming up — backward compatible, expand phase, contract step — is just naming a piece of it.

## 3. The Full Explanation — How It Actually Works

In plain language first: a schema migration is a deliberate, controlled change to the *shape* of your database — adding or removing columns and tables, changing a column's type, tightening or relaxing a constraint, adding an index — performed while the system keeps serving real traffic. The word people use for "shape" here is **schema**: which tables exist, what columns they have, what types and rules those columns obey.

Why does changing shape need a discipline? Because of one uncomfortable fact: **deploys are not atomic**. When you release new code, most teams do a rolling deploy — new instances start, pass health checks, receive traffic, old instances drain away. For several minutes, two different versions of your application serve users simultaneously, and *both talk to the same database*. So during every deploy there's a window where the schema must be correct for two versions of code at once. Call that window the compatibility window. Everything below is just managing it.

That gives us the two words interviewers love and engineers constantly mix up:

A change is **backward-compatible** if the *new* schema still works with the *old* code — old instances don't crash against it. Adding a nullable column is backward-compatible: old code never selects it, so it can't hurt anyone. A change is **forward-compatible** if the *old* schema still satisfies the *new* code — new instances tolerate what isn't there yet. New code that reads `total_cents ?? fallback_to_old_column` is forward-compatible. A zero-downtime rollout requires both properties to hold at every instant inside the compatibility window. Additive schema changes give you backward compatibility for free; forward compatibility is your new code's job, written as explicit fallbacks.

From those two definitions, the ordering rule falls out mechanically, and notice how it depends on the *direction* of the change:

Introducing something new? **Schema first, then code.** Deploy the additive migration, wait for it to land everywhere, then ship code that uses the new thing. Old code ignores the addition; new code finds it waiting. Reverse the order and you've rebuilt Tuesday's incident — code asking for a column that doesn't exist yet.

Retiring something old? **Code first, then schema.** First stop reading and writing the old column in every code path — including background jobs, admin tools, and anything else that touches the table. Ship that as a complete release. Then, in a *later* release, drop the column. Reverse this order and the old instances still running mid-deploy query a column that vanished under them. And "later release" is not paranoia: it guarantees every long-lived straggler (a pod that missed the rollout, a nightly job, last quarter's mobile build) has rotated past the version that cared.

Which immediately explains the rename trap: renaming a column is secretly a retire-and-introduce done at once — add the new name, remove the old. Done directly (`ALTER TABLE ... RENAME COLUMN`), it breaks *every* old instance in the same instant. So renames are never one step; they're the full three-phase cycle below.

The three-phase cycle has a name: **expand–migrate–contract**, sometimes called parallel change. It's the general algorithm for any breaking shape change:

**Expand** — make a purely additive change the old code can't notice: add the new column alongside the old, nullable, no scary constraints yet. Backward compatibility guaranteed.

**Migrate** — teach the new code both languages: write to the old shape *and* the new shape in the same transaction (so whichever version of the app is running, data stays correct), backfill historical rows in small resumable batches, and switch reads over to the new shape with a fallback to the old one while the backfill finishes. This phase often rides behind a feature flag, so switching reads — or switching back after a bad surprise — is a config flip, not a redeploy.

**Contract** — once telemetry shows zero readers and writers of the old shape for a meaningful stretch, remove it: drop the old column, set the NOT NULL you deferred, delete the dual-write lines. This step travels alone, in its own release, because it's the point of no return.

Notice where the danger concentrates. Additive mistakes are cheap — drop the column you just added, nobody ever knew. It's the **destructive** steps that deserve fear: `DROP COLUMN`, `DROP TABLE`, narrowing a type, tightening NULL to NOT NULL. They're dangerous for two compounding reasons. First, irreversibility — a dropped column's data exists only in backups, and restoring backups is an outage, not a rollback. Second, hidden consumers — the column you believe is unused may still be referenced by a view or materialized view, a trigger or stored procedure, an ETL job, a BI dashboard querying directly, another microservice sharing the table, or the previous major version of your mobile app. You can't grep other teams' dashboards. That's why destructive changes ride last, alone, and only after observability confirms silence — error logs clean, query stats showing no reference to the old name across a full weekly cycle (weekly, because monthly jobs exist).

Two more realities shape the craft. First, schema evolution frequently carries *data evolution* inside it: adding `total_cents` is useless until historical rows get backfilled from `amount`. Backfills belong to the migrate phase, and their cardinal rules are small batches, resumability, and watching replication lag — a single giant `UPDATE` becomes one enormous transaction that bloats tables, floods replicas, and times out having accomplished nothing. The batching mechanics live in [what is a database migration](./what-is-database-migration.md); here, internalize *which phase* backfills belong to and why.

Second, identical SQL has wildly different cost depending on engine and version — widening a `VARCHAR` on PostgreSQL is a metadata-only instant change, while `INT → BIGINT` rewrites every row of the table under an exclusive lock, and MySQL 8.0 needs `ALGORITHM=INSTANT` requested explicitly to get metadata-only behavior. Those internals (and the metadata-lock pile-up that can stall a whole site during even an "instant" ALTER) are covered deeply in the sibling page. The discipline-level takeaway stands regardless: never assume a DDL statement's cost is proportional to how short it looks, and rehearse big changes on a production-sized snapshot before betting production on them.

## 4. See It In Practice — Real Code or Queries

Everything below is PostgreSQL unless labeled otherwise. Four scenarios, each showing the ordering rule in action.

**Scenario 1 — introducing a feature correctly: schema ships first.**

```sql
-- Release 1: ONLY this migration deploys. Purely additive.
-- Old code never references avatar_url, so a nullable column
-- costs it nothing. This is the "pave the exit first" step.
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- Indexes on the new column should also arrive here, built
-- concurrently so they don't block writes on a busy table.
-- Note: CONCURRENTLY cannot run inside a transaction block,
-- so it goes in its own migration, outside BEGIN/COMMIT.
CREATE INDEX CONCURRENTLY idx_users_avatar_url ON users (avatar_url);
```

```sql
-- Release 2 (the next deploy): application code starts
-- reading and writing avatar_url. Safe now — the column is
-- guaranteed present on every environment, because Release 1
-- shipped it everywhere before this code could possibly arrive.
```

If Releases 1 and 2 swap places, you get the opening incident. If they ship in the same pipeline run, you're trusting that "migrations run before app servers boot" is enforced and locked — know whether your setup actually guarantees that.

**Scenario 2 — rename plus type change: `invoices.amount NUMERIC` becomes `invoices.total_cents BIGINT`. Three releases, expand–migrate–contract.**

```sql
-- Release 1 — EXPAND. Additive only. Both shapes now exist;
-- old code keeps using amount and notices nothing.
ALTER TABLE invoices ADD COLUMN total_cents BIGINT;
```

```js
// Release 1/2 application code — MIGRATE. Write BOTH shapes in
// one statement, so old and new app instances observe consistent
// data no matter which column they read.
await db.query(
  `UPDATE invoices
      SET amount      = $1,
          total_cents = ROUND($1::NUMERIC * 100)::BIGINT
    WHERE id = $2`,
  [amountInput, invoiceId]
);

// Reads prefer the new column but fall back while the backfill
// catches up — that fallback IS the forward compatibility.
function totalCents(row) {
  return row.total_cents ?? Math.round(Number(row.amount) * 100);
}
```

```sql
-- Backfill, run repeatedly by a job until it reports 0 rows updated.
-- Small batches keep each transaction short: brief locks, replicas
-- stay caught up, and a crash resumes instead of discarding hours.
UPDATE invoices
   SET total_cents = ROUND(amount * 100)::BIGINT
 WHERE id IN (
         SELECT id FROM invoices
          WHERE total_cents IS NULL
          LIMIT 5000
       );
```

```sql
-- Release 2 or 3 — CONTRACT. Only after logs show zero references
-- to `amount` across a full job cycle:
ALTER TABLE invoices ALTER COLUMN total_cents SET NOT NULL;
ALTER TABLE invoices DROP COLUMN amount;
-- Point of no return. Everything before this had a way back.
```

**Scenario 3 — tightening a constraint safely: allowing NULLs stops.**

```sql
-- The naive way scans every row of orders while holding a lock
-- strong enough to block reads and writes. On a huge table, that's
-- an outage. PostgreSQL 12+ gives you a dance that avoids the scan:

-- 1. Add the check NOT VALID: instant, enforces it for NEW rows
--    only, existing rows untouched.
ALTER TABLE orders
  ADD CONSTRAINT orders_email_not_null CHECK (email IS NOT NULL) NOT VALID;

-- 2. VALIDATE walks the table under a weak lock (SHARE UPDATE
--    EXCLUSIVE) that lets normal traffic continue.
ALTER TABLE orders VALIDATE CONSTRAINT orders_email_not_null;

-- 3. Now SET NOT NULL skips its own scan — the validated check has
--    already proven null-freeness — so it's metadata-only. PG 12+
--    automatically consumes and drops the check here.
ALTER TABLE orders ALTER COLUMN email SET NOT NULL;

-- On older PostgreSQL, explicitly drop the helper afterwards:
-- ALTER TABLE orders DROP CONSTRAINT orders_email_not_null;
```

The general lesson: the *loosening* direction (`SET NULL`, widen a type, drop a default) is nearly always safe to ship directly; every *tightening* move needs a plan for the existing rows it suddenly applies to.

**Scenario 4 — type changes: know when the engine rewrites your table.**

```sql
-- Cheap on PostgreSQL: increasing VARCHAR length is a catalog-only
-- change. Instant on any table size.
ALTER TABLE products ALTER COLUMN sku TYPE VARCHAR(64);

-- Expensive on PostgreSQL: INT -> BIGINT rewrites every row of the
-- table while holding a lock that blocks reads AND writes. On a
-- large table, do NOT ship this directly — use the expand-migrate-
-- contract path from Scenario 2 (add bigint column, dual-write,
-- backfill, swap reads, drop the int).
ALTER TABLE products ALTER COLUMN view_count TYPE BIGINT;

-- MySQL note: MySQL refuses INPLACE for data-type changes entirely —
-- it copies the table while blocking writes. And MySQL 8.0's fast
-- path must be requested: ALGORITHM=INSTANT fails loudly and instantly
-- when unsupported, instead of silently starting a two-hour rebuild.
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a schema migration, and why do engineers treat it as risky?**

It's a deliberate change to the structure of the database — tables, columns, types, constraints, indexes — applied to a system that is live and serving traffic. The risk comes from two sources stacking. Coupling: during any rolling deploy, old and new application code run simultaneously against one schema, so every structural change must leave the database valid for two code versions at once — the compatibility window. Irreversibility: unlike code, where a revert is a redeploy, destructive schema changes destroy state — a dropped column's data is gone except for backups. So the craft is: make additive changes early and freely, make code changes tolerate both shapes, and make destructive changes late, alone, and only after evidence says nothing needs the old shape anymore.

**Q: Production 500'd because code referencing a new column deployed before the column existed. What happened, and how do you prevent it forever?**

The dependency pointed the wrong way: the code required a schema element that hadn't been applied, and since rolling deploys replace all instances, the failure was fleet-wide rather than partial. Prevention has layers. Process-wise, additive migrations must precede dependent code — ideally enforced in the pipeline (migration step gates the app rollout) rather than in human memory, because the human-memory version is exactly what failed here. Design-wise, the migration should have been purely additive and nullable, making it safe to apply ahead of the code with zero impact. Verification-wise, staging rehearses the full pipeline in order — migration then deploy — with a production-sized dataset, because a missing-column bug appears in seconds against real data. And detection-wise, had the migration simply failed to apply, a post-deploy smoke test hitting a real profile endpoint would have caught it before users did.

**Q: Which schema changes are safe to ship directly, and which need the phased treatment?**

Safe-directly are the additive and loosening moves: adding nullable columns, adding tables, adding indexes (concurrently on PostgreSQL), widening a VARCHAR on PostgreSQL, dropping defaults, relaxing constraints. Old code can't break on things it never looks at. Conditionally safe: adding a column with a NOT NULL + constant DEFAULT — instant on PostgreSQL 11+ and MySQL 8.0 INSTANT, but a full rewrite elsewhere or for non-constant defaults like `now()`. Also adding a foreign key, which validates existing rows via a full scan — on big tables, add it `NOT VALID`, then run `VALIDATE CONSTRAINT` as a separate step under its weaker lock. Needs phasing, always: drops of columns or tables, renames, type changes that rewrite (int→bigint), narrowing types, and NULL→NOT NULL tightening — every one of these either destroys something or invalidates the assumptions of currently-running code, so they go through expand–migrate–contract.

**Q: Walk me through renaming a column on a busy table with zero downtime.**

You never issue the rename. A direct rename is simultaneously an introduction and a removal, so it breaks every old instance mid-deploy. Instead: expand — add the new column alongside the old, nullable. Migrate — deploy code that writes both columns in one statement (so data stays coherent whichever version reads), backfill historical rows in small batched updates, and flip reads to the new name with a fallback to the old while backfill completes, optionally behind a feature flag so the flip is reversible without redeploying. Contract — after telemetry confirms zero references to the old name across at least a full weekly cycle (monthly jobs exist), drop the old column in a release of its own. Two releases minimum, three phases, and the destructive step always travels alone.

**Q: Why are destructive migrations singled out as dangerous? How do you drop a column safely?**

Asymmetry. If an additive change misbehaves, recovery is another trivial change. If a destructive change misbehaves, you've lost data — recoverable only from backups, which means an outage — or broken a consumer you didn't know about. The consumer list is longer than people think: views and materialized views, triggers, stored procedures, ETL and BI jobs, sibling services sharing the table, cached query plans, and mobile app builds in the wild that can't be force-upgraded. Safe removal: stop all reads and writes of the column in code first, ship that completely, watch logs and query statistics for stray references for a full business cycle, then drop in its own release. The observability gate matters more than the calendar — "nobody uses it" must be measured, not assumed.

**Q: How would you change a column's type on a table with hundreds of millions of rows?**

First question: does this engine/version rewrite the table for this change? PostgreSQL rewrites for int→bigint but not for widening varchar; MySQL blocks writes for type changes entirely. If it's a rewrite-class change, direct ALTER means an exclusive lock held for the duration — unacceptable live. So: expand-migrate-contract. Add a new column with the target type, nullable. Dual-write both columns transactionally. Backfill in bounded batches, watching replication lag. Switch reads to the new column with a fallback, ideally flag-gated. Contract: tighten the new column's constraints and drop the old one in a later release. If it's a genuinely metadata-only change on my engine, I still set a short `lock_timeout` and check for long-running transactions first, because even instant DDL queues behind whatever holds the table — and everything queues behind the queue.

**Q: How do you enforce NOT NULL on a column that used to allow NULLs?**

Backfill first — every NULL gets a real value, batched and resumable. Then verify completeness with a count query, not optimism. Then, on PostgreSQL 12+, the three-step trick: add a `CHECK (email IS NOT NULL) NOT VALID` constraint — instant, applies to new rows only; `VALIDATE CONSTRAINT` — walks existing rows under a weak lock while traffic continues; then `SET NOT NULL`, which recognizes the validated proof and skips its own blocking scan. Older engines or databases: run the SET NOT NULL off-peak knowing it holds a strong lock for the validation scan, sized beforehand against a production snapshot. The naive version — SET NOT NULL straight after backfill on a big table — holds a lock that stalls all traffic for the length of the scan.

**Q: How do schema changes affect frontend and API clients?**

Deeply, and through a chain people forget: the schema feeds the API response, the API response is the client's contract. Rename or drop a field at the database level and let it propagate, and every web client rendering that field breaks — plus mobile builds released months ago that will keep running for a year. Two defenses. Structural: put a versioned API layer between clients and schema, so client compatibility windows are governed by API versioning, not by when the database felt free to lose a column. Then client-facing fields get the longest contract timelines of anything — the contract step waits for the oldest supported mobile cohort, not just for your server fleet to rotate. Server fleet rotation takes minutes; a user who hasn't updated their phone since March takes months.

**Q: Where do feature flags fit into schema rollouts?**

They solve the reversibility gap in the migrate phase. Between expand and contract, your new code reads from the new shape with a fallback to the old — wrap that read-switch in a flag and the cutover becomes a config flip: instant to enable, instant to reverse, no redeploy, no migration to undo. That's exactly what you want during the risky middle of a rollout. What flags can't do is change what's true in the data — once dual-write has been running, the flag toggles which truth you *read*, not which truths exist. So the division of labor: flags control which code path executes; schema compatibility controls whether any code path can execute at all. Flag on top of incompatible schema equals 500s with extra steps.

**Q: How do you test a risky schema change, and what do you monitor around it?**

Testing: restore a production-sized snapshot into staging — timing on empty dev tables is fiction, because cost scales with row count and concurrency. Run the full sequence there: measure migration duration, watch lock waits, confirm replica lag stays sane during batched backfills, then run the application against the result and diff real endpoints. Test the failure path too: hold open a long transaction deliberately and confirm my `lock_timeout` guard aborts cleanly rather than plugging the queue. Monitoring during: duration against budget, blocked-query counts, replication lag. After: error rate and latency on affected endpoints — a change that altered types or dropped an index shows up as latency regression within minutes — plus log-scans confirming no process still references retired names. And divergence checks between environments: if staging and production schemas disagree, every future deploy inherits that doubt.

## 6. The Traps — What Goes Wrong in Production

**Assuming the deploy ships schema and code as one atomic unit.** The wrong assumption: "my PR includes a migration file and the code that uses it — they deploy together." Reality: migrations apply once at one moment; code rolls out gradually across many instances over many minutes; and nothing about the pipeline guarantees the migration ran unless someone built that gate. What actually happens: the opening incident — some instances (or all) serve code whose column doesn't exist. Fix: treat every deploy as a compatibility window, ship additive migrations ahead of dependent code as separate verifiable steps, and make the pipeline order explicit and tested rather than assumed.

**Treating a rename as one operation.** The wrong assumption: `RENAME COLUMN` is a tiny metadata change, so it's safe. It is indeed metadata-cheap — that's what makes it seductive. But semantically it's an add-and-drop fused together: the instant it lands, every old-code instance in the compatibility window queries a column that no longer exists. Fix: expand–migrate–contract — new name added, dual-write, backfill, read-switch, old name dropped in a later release. The rename command itself is reserved for pre-launch systems with exactly one code version in existence.

**Believing "no code references it anymore" makes a drop safe.** The wrong assumption: I grepped the repo, zero hits, ship the DROP. Why wrong: consumers live outside your repo — views, materialized views, triggers, stored procedures, ETL jobs, BI dashboards, other services sharing the table, and mobile builds from last year. What actually happens: the drop succeeds, then a monthly reporting job fails at 2am, or a materialized view refresh starts erroring, and the data you'd need to restore is only in backups. Fix: inventory consumers across the organization, stop access in code first, watch query statistics for references across a full business cycle, then drop alone in its own release.

**Assuming a one-line ALTER is cheap.** The wrong assumption: statement length predicts cost. Reality: cost depends on whether the engine rewrites the table and what locks contend — an `ADD COLUMN ... DEFAULT` that's instant on PostgreSQL 11+ rewrote entire tables on PostgreSQL 10, and even instant DDL queues behind whatever transaction currently holds the table, blocking every query behind *it*. Fix: learn the matrix for your engine and version, request the fast algorithm explicitly where MySQL offers one so failure is loud, set a small `lock_timeout`, check `pg_stat_activity` for idle-in-transaction sessions before altering, and rehearse on production-sized data. The deep mechanics live in [what is a database migration](./what-is-database-migration.md).

**Running the backfill as one giant UPDATE.** The wrong assumption: "set the value for everyone" is naturally one statement. One statement is one transaction: minutes-to-hours of row locks, replication lag spiking as replicas replay the monster, dead-tuple bloat, and a timeout that rolls back *all* progress. Fix: batched updates in a loop — each batch a short transaction selecting a bounded slice of un-backfilled rows — resumable after crashes, monitored against replica lag, sized so each finishes well under a second.

**Tightening to NOT NULL immediately after the backfill "to finish up."** The wrong assumption: the data is filled, so the constraint is a formality. Reality: SET NOT NULL validates by scanning every row under a lock strong enough to block reads and writes — the formality *is* the outage. Fix: on PostgreSQL 12+, the NOT VALID check-constraint dance shown in Scenario 3, which proves null-freeness under weak locks and makes the final step metadata-only; elsewhere, schedule the scan off-peak with a duration budget rehearsed on a snapshot.

**Contracting in the same release that migrated.** The wrong assumption: backfill finished, so drop the old column now, why wait. Why wrong: "now" still contains stragglers — an instance that missed the rollout, tonight's cron, the quarterly job — and the compatibility window only closes when the *next* release has fully rotated. What actually happens: a straggler reads the dropped column and errors, weeks after everyone forgot about the migration. Fix: contract rides the following release, gated on measured zero references, not on the calendar feeling right.

## 7. Compare With Related Concepts

**Schema migration vs data migration.** A schema migration changes the container — tables, columns, types, constraints. A data migration changes the contents — backfilling values, transforming formats, moving rows between tables or systems. They interleave constantly: the migrate phase of a schema rollout usually contains a data backfill filling the new shape from the old. Rule of thumb: reshaping the box is a schema migration; changing what's inside the box is a data migration.

**Schema migration vs database migration (the tooling sense).** These two pages are siblings, and the vocabulary collides on purpose. The [database migration](./what-is-database-migration.md) page covers the *machinery*: versioned migration files, history tables, checksums, Alembic/Flyway/Knex workflows, down migrations, and the engine internals of locks and instant-versus-rewrite DDL. This page covers the *discipline*: how to evolve structure over time such that every intermediate state serves both running code versions. Rule of thumb: "how do migration files work" is the sibling page; "in what order do I add this column, backfill it, and eventually drop the old one" is this one.

**Schema migration vs feature flags.** A flag gates behavior at runtime and is reversible in milliseconds — flip it back and the old path runs. A schema change reshapes permanent state and is expensive or impossible to reverse once data has accumulated. They complement each other: during expand–migrate–contract, the flag gates the read-cutover so reversal is cheap while the schema underneath stays compatible throughout. Rule of thumb: flags choose which code path runs; schema compatibility determines whether *any* code path can run.

**Schema migration vs ad-hoc SQL.** Hand-run SQL against shared environments is how environments drift — nothing records it, orders it, or reproduces it. Any structural change that must exist beyond your laptop belongs in a reviewed, ordered migration, no exceptions — the sibling page explains the machinery that enforces this.

## 8. 🧠 The Memory Hook

Never pave over cars: new schema arrives *before* the code that needs it, and old schema leaves *after* the last reader forgets it. Every zero-downtime change is just surviving the gap between those two moments — dual-writes, backfills, and flags are the scaffolding in the gap, and demolition (drops, renames' final step, tightened constraints) always waits for the slowest map and travels alone.
