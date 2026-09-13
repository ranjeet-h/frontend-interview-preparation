# What Is a Database Migration

## 1. The Real-World Problem — When You Actually Hit This

It's Friday, 6pm. A deploy goes out. Ten minutes later, every checkout request is failing with `column "discount_cents" does not exist`. The engineer who built the feature added that column to staging last week — manually, straight into a terminal while debugging. Production never got it, because nothing carried the change over. The app code went through git, review, CI, and a careful rollout. The schema change went through one guy's memory.

Then the cleanup makes things worse. Two engineers each write their own "fix" SQL against production. One of them also tweaks staging slightly differently. Three weeks later, nobody can tell you what the real difference is between the two schemas, and a fresh staging environment behaves mysteriously wrong. That silent drift — where every environment has a slightly different idea of what the database looks like — is the exact disease migrations were invented to cure.

The insight underneath it all: your application code lives in version-controlled files with history, review, and reproducible builds, while your schema lived in people's heads and terminals. A migration system drags the schema into the same world. Every change becomes a numbered file, reviewed like code, applied in order, and recorded somewhere the database itself remembers.

## 2. The Analogy — Make the Mechanic Obvious

Think of your production database as an office building that's being renovated while hundreds of employees keep working inside it. Nobody is going to kick everyone out for six weeks. So the facilities team runs renovations through a strict system:

Every piece of work is written on a **numbered work order card**. Card #7 says "install new wiring on floor 3." Card #8 says "mount the new sockets where the wiring from #7 goes." The cards are numbered because #8 physically assumes #7 already happened. Run them out of order and you're drilling into walls with no wires behind them. Those cards are your migration files — each one describes exactly one step, and the steps build on each other, so the order is not decoration, it's load-bearing.

There's a **logbook bolted to the wall inside the building**, and the foreman checks it before touching anything. It records which cards have been completed. If the logbook says the last completed card is #6, the crew starts at #7 — not from the beginning, not from memory. Crucially, the logbook lives *in the building*, not at the facilities office. Any competent crew from any company can walk in, read the logbook, and know the building's exact state. That's your migration history table sitting inside the database itself.

When a card is completed, the foreman also staples a **fingerprint of the card's text** into the logbook. Months later, if someone edits card #5's wording, the next audit catches it instantly — the fingerprint in the logbook doesn't match the card anymore. Nobody trusts that building's history now. That's the checksum your migration tool stores: edit a migration after it ran, and the tool refuses to continue because your recorded history is now a lie.

Each card is **two-sided**. The front says what to do; the back says how to reverse it. But notice something: the back of card #7 might honestly say "remove the wiring" — yet if the crew has already drilled channels through twenty walls based on that wiring, "undo" is a fantasy on paper. The front side is always trustworthy. The back side is often optimistic fiction. Hold that thought; it becomes important when we talk about down migrations.

Finally, some jobs need the **main hallway closed** — and while it's closed, everyone queues at the doors getting angrier by the minute. A good facilities team either does hallway work at 2am, or — much better — figures out how to renovate *around* traffic: build the new corridor beside the old one, move everyone through it, and only then knock down the old wall. That last trick is the expand-contract pattern, and it's the difference between a smooth release and an outage.

Two branch offices of the same company, built by crews that only replayed the cards from card #1 with nothing else, end up **identical down to the wiring**. No hand-taped fixes, no mystery differences. That's what healthy staging and production look like.

## 3. The Full Explanation — How It Actually Works

Strip away the tools and a migration system is just three things: a folder of small files, each describing one schema change; an ordering scheme so they always apply in sequence; and a table inside the database that remembers which ones already ran.

Why not just keep a folder of SQL scripts and run them by hand? Because hand-running answers none of the questions that burned us in section 1. Which of these scripts has already been applied to production? Did staging get the same ones? Did anyone modify a script after applying it? A migration tool turns those guesses into mechanical checks: it compares the files in your folder against the history table, figures out exactly which ones are pending, and applies just those, in order.

**Versioning and ordering.** Files get names that sort correctly — `0001_create_users.sql`, `0002_add_orders.sql` — or timestamps, and the tool applies them lowest-first. Each migration is written assuming the previous one's result. Two hard rules fall out of this. First, never edit an already-applied migration; environments that already ran the old version will never pick up your edit, and tools that store checksums will scream at the ones keeping records. If it's wrong, write a new migration that fixes it. Second, watch for collisions: two developers both create "migration 0007" on different branches, merge, and now the tool finds two different cards claiming the same number. Good tools refuse to run and make you resolve it — rename one and reconcile. Different tools handle this differently: Flyway wants strictly ordered version numbers like `V2__add_orders.sql`; Alembic (the Python/SQLAlchemy tool) chains revisions into a graph where each migration explicitly names its parent via a `down_revision` pointer, so branching conflicts show up as graph forks you must merge.

**The history table and checksums.** Inside your database sit tables like Flyway's `flyway_schema_history`, Liquibase's `DATABASECHANGELOG`, Knex's `knex_migrations`, or Alembic's single-row `alembic_version`. They record which versions ran, when, by whom, and usually a checksum of the file's contents at apply time. This is the logbook. It's also your early-warning system: a checksum mismatch means somebody edited history, and the safest response is to figure out what happened before letting deployments proceed, not to blindly regenerate the checksum.

**Up and down — and why down is often fake safety.** Most tools want each migration defined twice: `up` applies the change, `down` reverses it. Sounds comforting. In practice, treat the down side with suspicion. Structural changes reverse cleanly: `ADD COLUMN` undoes with `DROP COLUMN`. Data changes don't: if a migration dropped a column holding six months of user data, the down migration can faithfully recreate the *empty* column and nothing else. That data is gone. Same for any migration that transforms rows. So mature teams operate roll-forward: when a migration causes trouble in production, you don't rewind the database, you ship another migration that fixes the situation going forward. Rolling back the application code is normal; rolling back the schema is rare and usually impossible without data loss. The honest framing for interviews: down migrations are great for wiping and resetting local dev environments, weak as a production safety net. Plan your production safety with expand-contract instead, not with the back of the card.

**Zero-downtime changes and expand-contract.** Here's the constraint that shapes everything: deploys and schema changes don't happen atomically. During a typical rolling deploy, old-code instances and new-code instances serve traffic at the same time, and *both* talk to the same database. So the schema must be valid for two versions of your application simultaneously. The expand-contract pattern (also called parallel change) respects that:

1. **Expand** — make an additive change that breaks nothing: add the new columns or table alongside the old ones.
2. **Migrate** — deploy code that writes to both shapes (so old instances still work), backfill historical data in small batches, and start reading from the new shape with a fallback to the old one.
3. **Contract** — in a later release, once every instance runs new code and you're confident you won't need the old shape, remove it.

Say you're splitting `users.name` into `first_name` and `last_name`. You never rename in one shot — a rename is simultaneous add-and-drop, which means for a window of time half your app instances query a column that no longer exists. You add the two new columns first, dual-write for a release or two, backfill, switch reads, and only then drop `name`. The cost is temporary messiness in the code; the alternative is a user-facing outage during deploy. The same discipline protects external API consumers — a mobile app in the wild can't be force-upgraded, so removing a field the old clients read is the contract step, done late and deliberately.

**Why `ADD COLUMN` is instant sometimes and brutal other times.** This is where engine internals matter, and where dialect differences are real. When you alter a table, the naive-sounding approach is to visit every row and physically write the new value into it — a full table rewrite, which takes minutes-to-hours on large tables and holds heavy locks the whole time. Modern engines cheat brilliantly for common cases:

In **PostgreSQL 11 and newer**, `ADD COLUMN ... NOT NULL DEFAULT <constant>` is a metadata-only operation. The default is recorded in the system catalog as a "missing value," and existing rows logically return it without ever being rewritten. The same `ALTER` on PostgreSQL 10 or older rewrote the entire table. Two caveats keep this honest: the fast path only works for *constant* defaults — a per-row-computed default like `now()` forces a rewrite — and adding a `NOT NULL` column *without* a default on a populated table isn't a rewrite, but it does require a full scan to validate, so it still holds its lock for a while. Type changes generally rewrite the table too.

**MySQL 8.0** has its own lever: `ALGORITHM=INSTANT` makes `ADD COLUMN` a data-dictionary-only change — near-instant regardless of table size. (Since 8.0.29 it even supports adding at any position and instant drops; earlier 8.0 releases restricted instant adds to the last column.) If instant isn't possible, MySQL tries `INPLACE`, which rebuilds the table but lets reads and most writes continue — better than blocking, still expensive on huge tables — and worst case `COPY`, which rebuilds while blocking writes. Naming the algorithm explicitly is a nice habit: `ALGORITHM=INSTANT` fails *immediately* with an error when unsupported, instead of silently kicking off a two-hour rebuild you didn't budget for. One MySQL quirk worth knowing: `TEXT`/`BLOB` columns can't take plain defaults, so reach for `VARCHAR` when you want an instant-add with a default.

**The lock trap that takes sites down.** Even an "instant" `ALTER` needs a brief exclusive metadata lock. Usually that's milliseconds. The disaster scenario: some long-running transaction — a stuck report query, an open-but-idle transaction in a misbehaving service — holds a shared lock on that table. Your `ALTER` queues behind it, politely waiting. And here's the poison: every ordinary `SELECT` and `INSERT` that arrives *after* your `ALTER` queues behind *it*, because they need the same lock the `ALTER` is holding a place for. Within seconds the entire application is timing out on a table whose alteration hadn't even started. The fix is defensive: before altering, check for long-running transactions (`pg_stat_activity` in PostgreSQL, `information_schema.innodb_trx` in MySQL); set a short lock timeout (`SET lock_timeout = '3s'` in PostgreSQL, `SET lock_wait_timeout` in MySQL) so the `ALTER` fails fast instead of becoming a plug in the pipe; retry in a loop; schedule genuinely heavy changes off-peak.

**How they actually run in production.** Migrations run as a deliberate pipeline step before the new code rolls out — from CI, a deploy hook, or a controlled startup task. One subtlety bites teams that auto-migrate on boot: if five app servers start simultaneously, all five see pending migrations and all five try to apply them. Tools guard this with database-level locks so only one wins and the rest wait, but know whether your setup does this — racing migrators corrupt history. And for big data backfills, never issue one giant `UPDATE`: it becomes one enormous transaction that bloats tables, hammers replication, and risks timeout. Update in bounded batches in a loop until nothing is left.

**The tools, briefly.** Alembic for Python/SQLAlchemy shops, Knex for Node.js, Flyway and Liquibase for JVM-centric teams and polyglot SQL pipelines. They differ in workflow (code-defined revisions versus versioned SQL files) but agree on the fundamentals: ordered files, a history table, and refusal to guess.

## 4. See It In Practice — Real Code or Queries

Our running example: split `users.name` into `first_name` and `last_name` on a live, heavily-used table, with zero downtime. Everything below is PostgreSQL unless labeled otherwise.

**Step 1 — the expand migration. Purely additive; old code doesn't care:**

```sql
-- 0001_expand_split_name.sql (PostgreSQL)
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name  TEXT;

-- Deliberately nullable for now. A NOT NULL constraint comes later,
-- once every row is guaranteed filled — otherwise the validation
-- scan fails on historical rows and the migration dies mid-deploy.
```

**Step 2 — deploy code that dual-writes, so old and new app instances coexist:**

```js
// New version of the update-profile handler (Node.js/postgres client)
async function updateUserProfile(db, userId, profile) {
  await db.query(
    // Write BOTH shapes in one statement. Old app instances still read
    // `name`; new instances read first_name/last_name. Both stay correct.
    `UPDATE users
        SET name        = $1,
            first_name  = $2,
            last_name   = $3
      WHERE id = $4`,
    [fullName(profile), profile.firstName, profile.lastName, userId]
  );
}

// New reads prefer the new columns but tolerate rows not yet backfilled:
function displayName(row) {
  return row.first_name ? `${row.first_name} ${row.last_name}` : row.name;
}
```

**Step 3 — backfill historical rows in batches, never one giant UPDATE:**

```sql
-- Run repeatedly (from a job/script) until it reports 0 rows affected.
UPDATE users
   SET first_name = split_part(name, ' ', 1),
       last_name  = split_part(name, ' ', -1)          -- -1 = last word
 WHERE id IN (
         SELECT id FROM users
          WHERE first_name IS NULL
          LIMIT 5000                                    -- small batches
       );

-- Why batches? Each one is a short transaction: locks are held briefly,
-- replication lag stays negligible, and a crash resumes cleanly instead of
-- rolling back a 40-million-row mega-transaction.
```

**Step 4 — tighten constraints, then contract in a later release:**

```sql
-- Later release: all rows are filled, reads are switched, old code is gone.
ALTER TABLE users
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name  SET NOT NULL;

ALTER TABLE users DROP COLUMN name;
-- The moment of no return. Everything before this had a way back;
-- after the drop, the old combined strings exist only in backups.
```

**Instant-versus-rewrites, labeled by engine:**

```sql
-- PostgreSQL 11+: INSTANT. The default is stored in the catalog as a
-- "missing value"; existing rows are not touched.
ALTER TABLE orders
  ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

-- The SAME statement on PostgreSQL 10 or older rewrites the entire table.
-- And even on 11+, a non-constant default forces the rewrite:
--   ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();  -- rewrites!
```

```sql
-- MySQL 8.0: request INSTANT explicitly. Fails fast with an error if the
-- engine can't do it metadata-only — instead of silently rebuilding.
ALTER TABLE orders
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ALGORITHM=INSTANT;
-- VARCHAR, not TEXT: MySQL TEXT columns can't carry a plain DEFAULT.
-- If INSTANT is impossible, INPLACE (online rebuild) is next-best; COPY blocks writes.
```

**The defensive pattern for risky ALTERs:**

```sql
-- PostgreSQL: fail in 3 seconds rather than plugging the lock queue.
SET lock_timeout = '3s';
ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
-- Wrap in a retry loop from the migration runner. Before running, check
-- pg_stat_activity for long-open transactions on this table — one idle-
-- in-transaction session will starve every ALTER you attempt.
```

**What these look like in a real tool — Alembic (Python/SQLAlchemy):**

```python
"""split users.name into first_name and last_name"""

def upgrade():
    # Expand only. The contract step ships as its OWN later revision,
    # so deploys can roll out in between.
    op.add_column("users", sa.Column("first_name", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.Text(), nullable=True))

def downgrade():
    # Honest downgrade: recreate structure, but the dropped strings'
    # content is unrecoverable — noted here so future-you doesn't trust it.
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
```

And the same shape in Knex (Node.js):

```js
// migrations/20260826120000_expand_split_name.js
exports.up = (knex) =>
  knex.schema.table("users", (t) => {
    t.text("first_name").nullable();
    t.text("last_name").nullable();
  });

exports.down = (knex) =>
  knex.schema.table("users", (t) => {
    t.dropColumn("first_name");
    t.dropColumn("last_name");
  });
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a database migration, and why use a tool instead of just running SQL scripts?**

A migration is a small, ordered, version-controlled file describing one schema change, paired with a history table inside the database that records exactly which changes have been applied. The tool diffs your folder of migration files against that history table and applies only the pending ones, in order. Doing it with loose SQL scripts and human memory fails in predictable ways: nobody reliably knows which scripts ran on which environment, someone eventually edits an already-applied script so environments silently diverge, and nothing stops two people from applying conflicting changes. The tool converts all of that tribal knowledge into mechanical guarantees — which matters because a schema mistake in production is not a code bug you hotfix; it's state you may not be able to undo.

**Q: Walk me through what happens when the migration tool runs.**

It opens the history table (`flyway_schema_history`, `alembic_version`, `knex_migrations`, depending on stack) and reads the highest applied version — or the full applied set. It lists the migration files, validates them: versions must be unique, ordering must be consistent, and if the tool stores checksums it verifies each applied file's stored fingerprint still matches the file on disk — a mismatch halts everything. Then it takes a lock (database-level, so two runners can't race), applies each pending migration in ascending order inside its own transaction where the engine allows transactional DDL, records each success in the history table, and exits. On PostgreSQL, DDL is transactional, so a failed migration rolls back cleanly; on MySQL, most DDL causes implicit commits, so a failed multi-statement migration can leave you half-applied — a genuinely important operational difference.

**Q: How do you ship a breaking schema change with zero downtime?**

Expand-contract, always. Breaking changes fail because old and new application code run simultaneously during a rolling deploy, and the schema has to satisfy both. So: expand with an additive change (new columns/tables alongside old), deploy code that writes both shapes and reads the new with fallback, backfill historical data in small batched updates, then contract — remove the old shape in a later release, after every instance runs new code and you've decided you won't need to roll back to it. The rename trap illustrates why: renaming a column in one migration is really add-plus-drop, and between the deploy of that migration and the deploy of dependent code, old instances query a column that's gone. Never couple a schema removal to the same release that stops using it.

**Q: Why is ADD COLUMN instant in some cases and painfully slow in others?**

Because the engine either updates metadata or physically rewrites every row. PostgreSQL 11+ made constant-default additions metadata-only: the default is stored in the catalog and returned logically for old rows, no rewrite. Older PostgreSQL rewrote the table; non-constant defaults still do. MySQL 8.0 offers `ALGORITHM=INSTANT` for dictionary-only changes, falling back to `INPLACE` (concurrent-friendly rebuild, still expensive) or `COPY` (blocks writes). The practical senior answer: know your engine and version, request the fastest algorithm explicitly so failures are loud and immediate, and never assume a DDL statement's cost is proportional to how short it looks. A one-line `ALTER` on a 300-million-row table can be free or can be an hour-long lock-holding rebuild, depending entirely on these mechanics.

**Q: An ALTER TABLE on a big table froze the whole site, though the same ALTER took seconds in staging. What happened?**

Almost certainly a metadata-lock pile-up. Any `ALTER` needs a brief exclusive lock. If some long-lived transaction — an idle-in-transaction connection, a stuck analytics query — held a shared lock on the table, the `ALTER` waited. While waiting, it blocks every new query on that table behind it, because they all contend for compatible locks. Traffic times out across the board even though the `ALTER` itself hadn't begun doing work. Staging didn't reproduce it because nothing there holds long transactions. Prevention: check for long-running transactions before altering (`pg_stat_activity` / `innodb_trx`), set a small `lock_timeout` so the `ALTER` aborts instead of queueing, retry in a loop, run heavyweight changes off-peak, and fix whatever code leaves transactions open.

**Q: Do you rely on down migrations in production?**

No — I treat them as a dev convenience, not a safety net. Down migrations reliably reverse *structure* and reliably fail to reverse *data*: after dropping a column, the recreated empty column doesn't bring back six months of values, and transformed data can't be un-transformed. Production recovery is therefore roll-forward: fix with a new migration, restore from backups only for genuine disasters, and design safety into the release itself via expand-contract, which keeps a rollback path open at the application level precisely because the schema hasn't been contracted yet. Saying "we have down migrations so we can roll back" in an interview is a red flag; saying "down is for local resets, production safety comes from phased additive changes" shows you've operated a real system.

**Q: How do migrations fit into the deployment process? What runs first, and what breaks when they're out of sync?**

Migrations run before the new code rolls out — as a CI/CD pipeline step or a controlled startup command guarded by a lock so concurrent instances don't race. The subtle requirement is compatibility windows: after the migration runs, *old* code still serves traffic against the *new* schema, so every migration must leave the schema backward-compatible with the currently deployed code. That's why destructive changes are always deferred to a later contract release. When this breaks, it breaks loudly: deploy code that reads a column before the migration added it, and every request 500s — the exact Friday-evening incident this page opened with. The rule I follow: additive migration first, code second, cleanup migration last, each in its own release.

**Q: How would you test a risky migration before running it on production?**

Restore a production-sized snapshot into a staging database and run the migration there — timing on empty dev tables is meaningless, since the whole risk is proportional to row count and concurrency. Measure duration, watch lock waits, confirm replication lag behavior during batched backfills, and run the application against the migrated schema to catch missed dependencies. Test the failure path too: deliberately hold a long transaction and verify my `lock_timeout` guard aborts cleanly rather than piling up. For data transformations, spot-check results on the snapshot — counts, sums, sample rows — before trusting the script. And decide the abort criteria in advance: if staging takes 40 minutes, production at higher load may exceed the maintenance window, and I'd rather know that Tuesday than discover it mid-deploy.

**Q: What would you monitor around migrations?**

During the migration itself: duration against budget, lock waits and blocked queries, replication lag (bulk backfills flood replicas), and error rates. After the release: application error rate and latency on the affected tables — a migration that subtly changed types or indexes shows up as latency regressions within minutes. Ongoing hygiene signals matter too: divergence between environments (detectable by diffing schema dumps and comparing history tables), and any checksum-mismatch alerts from the migration tool, which indicate someone edited applied history. If a migration system's state can't be trusted, every future deploy inherits that doubt.

## 6. The Traps — What Goes Wrong in Production

**Editing an already-applied migration file.** The assumption: "it's just a file in the repo, fixing a typo is harmless." It's wrong because environments that already ran it applied the *old* SQL — your edit changes nothing there — while fresh environments will run the *new* SQL, so your environments permanently diverge, and tools storing checksums (Flyway, Liquibase) refuse to validate at all. What actually happens: a week later, staging mysteriously has a column production lacks, or the deploy pipeline halts on a checksum mismatch nobody can explain. The fix is absolute: applied migrations are immutable history. Change the schema again? New migration. If a bad edit already shipped, reconcile deliberately — decide the target truth, write a corrective migration, and align the history records consciously rather than hoping.

**Trusting down migrations as your production rollback plan.** Covered above, worth restating as a trap because it's the most common junior belief: the back of the card is fiction for anything involving data. What actually happens when you rely on it: the "rollback" executes, reports success, and you discover days later that customer data vanished with it. Fix: roll forward, design rollback paths into releases with expand-contract, and reserve down migrations for resetting local development.

**Running a heavy ALTER at peak on a big table because "it's a one-liner."** The wrong assumption: statement size predicts cost. Reality: cost depends on whether the engine rewrites the table and what locks are involved — and the metadata-lock queue can turn even an instant change into a site-wide stall if one long transaction is holding the table. What happens: queries pile up behind the waiting ALTER, connection pools exhaust, the incident channel lights up. Fix: check for long transactions first, set `lock_timeout`/`lock_wait_timeout` low with retries, prefer instant-capable operations (`DEFAULT` constants on PostgreSQL 11+, `ALGORITHM=INSTANT` on MySQL 8.0), schedule rebuilds off-peak, and rehearse on a production-sized snapshot.

**Dropping a column in the same release that stops using it.** Feels efficient: the code no longer references `legacy_token`, so remove it. Wrong because rolling deploys run old and new instances together — old instances still SELECT the column, and the moment the migration lands, they crash. What happens: partial outage during exactly the deploy window, worst timing possible. Fix: two releases minimum — first stop reading/writing it everywhere, then drop it in the next contract release.

**Two developers create conflicting migrations on parallel branches.** Both name theirs `0007_add_feature.sql`, both merge, CI passes (each branch alone was consistent), then the integrated deploy hits a duplicate-version error — or worse, with timestamp-based naming, two migrations interleave in an order neither author assumed. What happens: blocked pipelines and confusion about which order was "real." Fix: rebase frequently, let the tool's collision detection do its job, rename and re-verify ordering after resolving — never force-regenerate history tables to silence the error.

**One giant backfill UPDATE.** "Just set `first_name` for everyone" as a single statement becomes one massive transaction: minutes of row locks, replication lag spiking as replicas replay the monster, table bloat from dead tuples, and a timeout that discards all progress. Fix: batched updates in a loop (as shown in the code section), sized so each finishes in well under a second, monitored for replica lag, resumable from where it stopped.

## 7. Compare With Related Concepts

**Schema migration vs data migration.** A schema migration changes *structure* — tables, columns, indexes, constraints; the thing being reshaped is the container. A data migration moves or transforms *rows* — backfilling new columns from old ones, converting formats, relocating records between systems; the container stays, the contents change. They interleave constantly (our expand-contract example contains a data backfill between two schema migrations), but the skills and risks differ: schema migrations risk lock-outs and broken code; data migrations risk corruption, loss, and replication lag. Rule of thumb: changing the shape of the box is a schema migration; changing what's inside the box is a data migration.

**Schema migration vs "database migration" (moving the database).** The word "migration" collides badly here. Moving the database means transplanting the whole thing — new server, new region, new cloud provider, sometimes a new engine entirely (PostgreSQL to MySQL). Nothing about your schema design changes; you're relocating a running system, and the hard problems are cutover downtime, DNS/connection repointing, and keeping source and destination in sync until you flip. Schema migration, this whole page, is about evolving structure in place, repeatedly, forever. Rule of thumb: if the work ends when the app connects successfully to its new home, you moved the database; if the work produces another numbered file in your migrations folder, you evolved the schema.

**Migrations vs ad-hoc SQL scripts.** Ad-hoc scripts are one-off fixes run by hand — fine for local experiments, dangerous in shared environments because nothing records, orders, or reproduces them; they're how the staging/prod drift in our opening story began. Rule of thumb: if a schema change must exist on more than your machine, it becomes a migration — no exceptions. (For the deeper treatment of evolving table structures specifically, see [what-is-schema-migration](./what-is-schema-migration.md); the mechanics of the locks these changes contend for live in [what-is-pessimistic-locking](./what-is-pessimistic-locking.md) and [what-is-table-level-locking](./what-is-table-level-locking.md).)

## 8. 🧠 The Memory Hook

Your database is an occupied building being renovated through numbered work-order cards, with a logbook bolted inside that fingerprints every completed card — never edit a card that's been logged, never trust the "undo" side with real data, and never close the main hallway while the building is full: build the new corridor beside the old one, move everyone over, then demolish.
