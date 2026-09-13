# How do you handle migrations in MySQL

## 1. The Real-World Problem — When You Actually Hit This

You ship a small change. You add one column to the `orders` table:

```sql
ALTER TABLE orders ADD COLUMN priority VARCHAR(20) DEFAULT 'normal';
```

On your laptop with 500 rows, it finishes in 20 milliseconds. You deploy to production where that table has 18 million rows. MySQL locks the table, starts copying every row into a new table file, and holds that lock for 8 minutes. While it copies, every query that touches `orders` piles up. Your API latency goes from 80ms to 30 seconds. Health checks fail. You try to kill the ALTER, but the table is still locked. Customers see 500s until the copy finally finishes.

That is the classic MySQL migration failure. It did not happen because your SQL was wrong. It happened because you treated a schema change like code that rolls out instantly, when in MySQL a schema change can be a long, locking, data-copying operation. Handling migrations in MySQL means answering: how do you evolve the schema safely, in order, without locking production and without leaving two environments on different schemas.

## 2. The Analogy — Make the Mechanic Obvious

Think of your database as an apartment building where tenants live on every floor and never leave.

A migration is a numbered renovation permit. `V001` says build the lobby, `V002` says add a balcony to every unit on floor 10, `V003` says rewire the elevators. Three rules make renovations safe.

First, permits have numbers and must be done in order. You cannot apply `V003` before `V002` or two buildings that started identical will end up different. That is ordering.

Second, once a permit is approved and done, you cannot white-out the text and change what it meant. An inspector keeps a photocopy and compares it before starting work. If the copy does not match, work stops. That is the checksum.

Third, some renovations are quick — swapping a nameplate on a door only needs a screwdriver while tenants walk past. Other renovations require closing the whole hallway, moving furniture out, rebuilding, and moving it back in while nobody can pass. That is MySQL DDL locking history: same request, completely different cost depending on the MySQL version and the exact ALTER you asked for.

Tools like gh-ost and pt-online-schema-change are the workaround for big hallways: instead of closing the hallway, you quietly build an identical hallway next door, move people over one family at a time, keep both hallways in sync with walkie-talkies, and then swap the signs overnight.

## 3. The Full Explanation — How It Actually Works

In plain words: a migration is a versioned SQL file that moves the schema from one known state to the next, tracked in a table so every environment applies the same files in the same order exactly once.

Here is how teams actually run that in MySQL and why MySQL makes it tricky.

**Versioned files, ordering, and checksums.** Tools like Flyway, Liquibase, golang-migrate, Rails Active Record, and Prisma Migrate all do the same idea. You do not run random SQL by hand on production. You commit a file like `V001__create_orders.sql`, then `V002__add_priority_to_orders.sql`. When the app starts or CI deploys, the migrator connects, checks a tracking table like `flyway_schema_history` or `schema_migrations`, sees which versions already ran, and runs only the new ones in numeric order inside a transaction where possible. Each file gets a checksum when it first runs. If someone edits an already-applied file, the checksum mismatches and the migrator fails loudly instead of silently leaving staging and production on different schemas. The rule is simple: never edit an applied migration. Write a new one that fixes it.

MySQL adds a wrinkle here: unlike Postgres, MySQL does not run DDL inside a real transaction you can roll back. Every `ALTER TABLE`, `CREATE INDEX`, `DROP COLUMN` does an implicit commit. If migration `V005` has three alters and the second fails, the first is already committed. Good migrators therefore keep each migration small and make each statement idempotent or clearly forward-only, and you must test rollback as a separate forward migration, not as a transaction rollback.

**MySQL DDL locking history — why the same ALTER behaves differently by version.** This is what interviewers probe for.

Before MySQL 5.6, almost every `ALTER TABLE` did a full table copy. MySQL created an empty new table with the new structure, copied every row one by one, rebuilt all indexes, locked the original table for writes the whole time and often for reads at the start and end, then swapped the files. Adding a column or index to a 50M-row table meant minutes to hours of downtime.

MySQL 5.6 introduced Online DDL with explicit `ALGORITHM` and `LOCK` clauses. You could now say how MySQL should do the work and how much to lock:

```sql
ALTER TABLE orders ADD INDEX idx_priority (priority), ALGORITHM=INPLACE, LOCK=NONE;
```

`ALGORITHM=COPY` is the old table-copy path. `ALGORITHM=INPLACE` avoids the full copy for many operations by modifying the table in place and only rebuilding what is needed — for example, adding a secondary index could be done without copying all row data, and concurrent reads and writes could continue. `LOCK=NONE` means allow reads and writes during the DDL, `LOCK=SHARED` allows reads but blocks writes, `LOCK=EXCLUSIVE` blocks everything. If you ask for `LOCK=NONE` but the operation cannot support it, MySQL errors instead of silently locking you.

MySQL 5.7 expanded which operations could be INPLACE, but many still needed a copy.

MySQL 8.0 added `ALGORITHM=INSTANT` for a narrow set of operations that only need a metadata change. The headline one is `ADD COLUMN` as the last column. That is now truly instant — no row copy, no rebuild, just a dictionary update, even on a huge table, and it finishes in milliseconds:

```sql
-- Instant in MySQL 8.0: adding as last column, no copy
ALTER TABLE orders ADD COLUMN priority VARCHAR(20) DEFAULT 'normal', ALGORITHM=INSTANT;
```

But INSTANT has strict limits, and forgetting them is a common production trap. Adding a column that is not last — using `AFTER` or `FIRST` — is not instant and falls back to INPLACE or COPY and copies the table. Combining `ADD COLUMN` with other alters in the same statement often disqualifies INSTANT. Certain row formats, very large row size after the add, or adding a column with specific constraints can also force a copy. If you do not specify `ALGORITHM=INSTANT` explicitly, MySQL will silently pick the next cheapest algorithm that works, which may still lock and copy for minutes. Senior teams always check with `ALGORITHM=INSTANT` first in staging and read the error if MySQL says it cannot be instant, rather than assuming every ADD COLUMN is free.

For `ADD COLUMN ... DEFAULT` specifically: in old versions, adding a column with a DEFAULT rewrote every row to materialize that default — the worst case for a big table. In 8.0 with INSTANT for a last-column add, the default is stored in metadata and rows get the value lazily when read, so it stays instant. But that optimization only applies to the instant-eligible path. If your ADD COLUMN falls off the instant path for any reason, you are back to rewriting the table.

**How you rename a column without downtime — expand and contract.** Never do `ALTER TABLE orders RENAME COLUMN priority TO urgency` on a live MySQL table with old app servers still running. Half your fleet will query the old name and crash. The safe pattern is three small migrations over two deploys:

1. Expand: add the new column, keep the old one. Deploy code that writes to both and reads from the new column with fallback to old.
2. Migrate: backfill existing rows in batches (not one giant UPDATE that locks).
3. Contract: once all readers use the new column, deploy code that stops using the old column, then drop the old column in a later migration.

Each step is backward compatible. At no point do old and new code disagree about which column exists.

**Zero-downtime changes for large tables — gh-ost and pt-online-schema-change.** For any change that would copy a huge table — large ADD COLUMN that is not instant, adding an index to a 100M-row table, changing a column type — you do not run a bare ALTER on the primary. You use an online schema change tool.

`pt-online-schema-change` (Percona) creates a shadow table with the new schema, copies rows in small chunks, uses triggers on the original table to replay ongoing writes to the shadow, then swaps the tables with an atomic RENAME.

`gh-ost` (GitHub) does the same chunk copy but replays changes by tailing the binlog instead of triggers, so it puts less load on the primary and works better where triggers are not allowed. Both let you throttle, pause, and cancel, and they keep writes flowing with only a brief metadata lock at the final cutover. The tradeoff is time and complexity: a migration that would take 20 minutes of lock with a direct ALTER now takes longer end-to-end but with no downtime, plus you need to monitor replication lag and handle foreign keys carefully.

**Testing migrations on a replica or clone before touching the primary.** You never learn how long an ALTER will take by running it on an empty dev database. Senior teams test on a host with production-like size and shape: a delayed replica, a restored snapshot, or a thin clone. You measure wall-clock time, check which algorithm MySQL actually chose with `SHOW PROCESSLIST` or Performance Schema, watch for `Waiting for table metadata lock` caused by a long-running transaction holding the table open, verify replication does not lag, and run your app's read and write queries during the migration to see real impact. For risky changes you also test the rollback migration forward — dropping what you added — on the same clone.

## 4. See It In Practice — Real Code or Queries

**Versioned files and the tracking table.**

```sql
-- V1__create_orders.sql
CREATE TABLE orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB;

-- V2__add_priority_to_orders.sql  (instant-eligible in 8.0)
ALTER TABLE orders ADD COLUMN priority VARCHAR(20) DEFAULT 'normal', ALGORITHM=INSTANT;

-- flyway_schema_history after two deploys looks like:
-- version | description          | checksum   | installed_on
-- V1      | create orders        | a3f9...    | 2026-08-20
-- V2      | add priority         | 7c1e...    | 2026-08-21
```

If someone edits `V2` after it was applied, the next deploy fails with a checksum mismatch instead of silently diverging.

**Being explicit about algorithm and lock — fail fast instead of locking prod.**

```sql
-- Try instant first. If MySQL cannot do it instantly, it errors instead of copying for 10 minutes.
ALTER TABLE orders ADD COLUMN notes TEXT, ALGORITHM=INSTANT;

-- For an index where instant is not possible, ask for INPLACE with no locking. If it cannot do LOCK=NONE, it errors.
ALTER TABLE orders ADD INDEX idx_status_priority (status, priority), ALGORITHM=INPLACE, LOCK=NONE;

-- What NOT to do on a big table without checking — MySQL picks whatever works, which may be COPY:
ALTER TABLE orders ADD COLUMN priority2 VARCHAR(20) DEFAULT 'normal' AFTER status;
-- This AFTER makes it non-instant even on 8.0. It will copy. Prefer adding last, then reorder logically in app if needed.
```

How to see what MySQL actually did while testing on a clone:

```sql
-- Before running, check for long transactions that will block your DDL
SELECT * FROM information_schema.PROCESSLIST WHERE COMMAND != 'Sleep';

-- During the ALTER on MySQL 8.0, check Performance Schema or SHOW
SHOW PROCESSLIST;
-- Look for state like "copy to tmp table" (bad, copying) vs instant completion
```

**Expand-contract for a column rename (zero-downtime).**

```sql
-- Migration V3: expand — add new column, keep old
ALTER TABLE orders ADD COLUMN urgency VARCHAR(20), ALGORITHM=INSTANT;

-- App code after V3 deploy (writes both, reads new with fallback):
-- INSERT INTO orders (user_id, amount, status, priority, urgency) VALUES (?, ?, ?, ?, ?)
-- SELECT COALESCE(urgency, priority) AS urgency FROM orders WHERE id = ?

-- Migration V4: backfill in batches (do not UPDATE without LIMIT on 20M rows)
-- Run from a script, throttled, checking replica lag between batches
UPDATE orders SET urgency = priority WHERE urgency IS NULL AND id BETWEEN 1 AND 100000;
UPDATE orders SET urgency = priority WHERE urgency IS NULL AND id BETWEEN 100001 AND 200000;
-- repeat ...

-- Migration V5 (next deploy, after all readers use urgency): contract — drop old
ALTER TABLE orders DROP COLUMN priority, ALGORITHM=INPLACE, LOCK=NONE;
```

**Large-table change with gh-ost (no triggers, binlog-based).**

```bash
# Dry run on a replica clone first, then on primary with throttling
gh-ost \
  --host=primary.db.internal \
  --database=shop --table=orders \
  --alter="ADD COLUMN notes TEXT" \
  --allow-on-master \
  --max-load=Threads_running=25 \
  --critical-load=Threads_running=50 \
  --throttle-flag-file=/tmp/gh-ost.throttle \
  --execute
# gh-ost creates _orders_gho, copies in chunks, tails binlog to keep it in sync,
# then does atomic RENAME TABLE orders TO _orders_old, _orders_gho TO orders
```

`pt-online-schema-change` equivalent is similar but uses triggers:

```bash
pt-online-schema-change --alter "ADD COLUMN notes TEXT" D=shop,t=orders --execute
```

**What a good migration runner looks like in Node.js (golang-migrate style is similar).**

```js
// migrate.js — run on deploy, forward-only, checksum-verified
import { createConnection } from 'mysql2/promise';
import fs from 'fs';

const conn = await createConnection(process.env.DATABASE_URL);

// migrator creates schema_migrations if missing and checks checksums
// Never edit a file that already has a row in schema_migrations
const files = fs.readdirSync('./migrations').sort(); // V001, V002, ...
for (const file of files) {
  const alreadyApplied = await conn.query(
    'SELECT 1 FROM schema_migrations WHERE version = ?', [file]
  );
  if (alreadyApplied[0].length === 0) {
    const sql = fs.readFileSync(`./migrations/${file}`, 'utf8');
    console.log(`Applying ${file} with ALGORITHM checks...`);
    // Each file itself contains ALGORITHM=INSTANT / INPLACE + LOCK clauses
    await conn.query(sql);
    await conn.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
  }
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you handle migrations in MySQL in production?**

You version every schema change as a numbered file, committed to git, applied in order exactly once, tracked by a migration table and verified by checksums. You never run ad-hoc ALTERs on production by hand. Each migration is small, forward-only, and explicit about `ALGORITHM` and `LOCK` so MySQL fails fast if it cannot do the change without long locking instead of silently copying the table. For big tables you avoid direct ALTER and use an online tool like gh-ost or pt-osc, and you test every migration on a clone with production-sized data while measuring time, algorithm chosen, and replication lag. You also make schema changes backward compatible with the currently deployed app version, ideally using expand-contract for renames.

**Q: Why is ALTER TABLE dangerous on large MySQL tables and how has that changed across versions?**

Because ALTER can require copying the entire table and holding a metadata lock. Before 5.6, almost every ALTER did a full table copy with long exclusive locks. From 5.6, Online DDL added `ALGORITHM=INPLACE` and `LOCK=NONE` so many operations like adding a secondary index could run without copying all rows and while writes continued. MySQL 8.0 added `ALGORITHM=INSTANT` for metadata-only changes — adding a column as the last column is instant even on huge tables. But INSTANT only covers specific cases. If you use `AFTER`, combine multiple alters, or hit row-size limits, MySQL falls back to INPLACE or COPY and you are back to a long copy. So you must always be explicit and test which path MySQL actually takes.

**Q: What does ALGORITHM=INSTANT actually do and when does it not work for ADD COLUMN?**

INSTANT means MySQL only updates its data dictionary — it does not touch existing row data. Adding a column as the last column with a default stores the default in metadata and existing rows lazily return that default on read, so it completes in milliseconds. It does not work when you add the column not-last (`FIRST` or `AFTER`), when you combine ADD COLUMN with another schema change in the same ALTER, when row size would exceed limits, or for certain column types and constraints. In those cases MySQL cannot do INSTANT and will either do INPLACE or COPY unless you forced `ALGORITHM=INSTANT`, in which case it errors. That error is useful — it tells you this change is not free.

**Q: How do you rename a column with zero downtime?**

You do not rename in place. You do expand-contract. First migration adds the new column (instant if last). Deploy app code that writes to both old and new and reads new with fallback to old. Backfill old rows to new in small batches, throttled, checking lag. Deploy code that reads only the new column. Final migration drops the old column. At every step, both the old deployed version and the new version of the app can run against the database, so a rolling deploy never crashes on a missing column.

**Q: When would you use gh-ost or pt-online-schema-change instead of a direct ALTER?**

When the change would copy a large table or hold a long lock even with INPLACE — typical for adding a column not-last, changing a column type, rebuilding a primary key, or adding an index to a table with tens of millions of rows. Both tools build a shadow table, copy rows in chunks, keep it in sync via triggers or binlog tailing, and swap with a brief lock at the end. You trade longer total time for zero downtime, plus you get pause, throttle, and cancel. You skip them for instant-eligible changes on small tables where a direct `ALGORITHM=INSTANT` already finishes in milliseconds.

**Q: How do you test a migration before running it on production?**

You never test timing on dev with 1k rows. You restore a production snapshot to a staging host or use a delayed replica, run the exact ALTER with `ALGORITHM=INSTANT` or `INPLACE, LOCK=NONE` explicitly, time it, confirm which algorithm MySQL actually used, check for `Waiting for table metadata lock` caused by an open transaction, watch replication lag, and run your app's real queries concurrently to measure impact. You also test the forward rollback — the migration that undoes the change — the same way. If the migration would be slow or lock, you switch to a gh-ost plan and test that end-to-end on the clone too.

**Q: Are MySQL migrations transactional? Can you roll back a failed migration?**

No. In MySQL, DDL does an implicit commit. You cannot wrap three ALTERs in `BEGIN; ... ROLLBACK;` and have them undo. If the second ALTER fails, the first is already committed. That is why you keep migrations small and atomic, add checks like `ALGORITHM` that make failures happen before the copy starts, and treat rollback as a new forward migration that reverses the change rather than expecting the database to roll back the DDL.

## 6. The Traps — What Goes Wrong in Production

**ADD COLUMN with DEFAULT that rewrites the whole table on old versions or non-instant paths.** On MySQL 5.7 and earlier, `ADD COLUMN status VARCHAR(20) DEFAULT 'pending'` materialized that default into every existing row, so a metadata-only expectation turned into a full table rebuild. Even on 8.0, if the ADD is not last or combined with another change, you lose the instant optimization and still rewrite. The fix is to add the column last with `ALGORITHM=INSTANT` and keep defaults simple, or if you must do it on an old version, add the column without a default, backfill in batches, then set the default.

**Forgetting INSTANT limitations and assuming every ADD COLUMN is free.** Teams upgrade to 8.0, hear that ADD COLUMN is instant, and then run `ADD COLUMN x INT AFTER y` on a 40M-row table in production. It copies for 15 minutes because `AFTER` disqualifies INSTANT. Always specify `ALGORITHM=INSTANT` when you expect instant — if MySQL cannot do it, you get an error immediately on your clone instead of a surprise copy on the primary. If you need a column in the middle for cosmetic reasons, add it last and handle ordering in SELECTs or views.

**Long-running transactions blocking every DDL with a metadata lock.** Even an instant ALTER needs a brief metadata lock to update the dictionary. If one connection has an open transaction that touched `orders` and never committed, your ALTER waits behind `Waiting for table metadata lock` and then every new query on `orders` queues behind the ALTER. Production tips over. Before migrating, check `PROCESSLIST` and `information_schema.INNODB_TRX` for idle transactions, kill the blocker if safe, and schedule migrations during low-traffic windows. Tools like gh-ost help but still need that final atomic RENAME which also needs the lock.

**Editing an already-applied migration file.** It feels harmless to fix a typo in `V002` that ran last week. The migrator sees a new checksum, refuses to run, and every environment is stuck. Or worse, you force it and now staging and prod have different schemas with the same version number. Never edit applied files. Add `V006` that corrects the issue.

**Giant backfills in one UPDATE.** `UPDATE orders SET urgency = priority` on 20M rows holds locks, fills undo logs, spikes replication lag, and can time out. Do batched updates with `LIMIT` or range on the primary key, sleep between batches, and monitor lag. Better, let the app lazily backfill on read for a while if business logic allows.

**Forgetting foreign keys, triggers, and row format.** Online tools and instant DDL interact badly with foreign keys — gh-ost needs extra care and sometimes `--alter-foreign-keys-method`. Adding a column that pushes row size over ~8126 bytes for COMPACT or hits the ~8000-byte instant limit will force a rebuild. Check `ROW_FORMAT=DYNAMIC` and test on a clone.

## 7. Compare With Related Concepts

**MySQL migrations vs Postgres migrations.** Two big differences matter in interviews. First, transactional DDL: Postgres can run many DDL statements inside a transaction and roll them all back if one fails. A migration with three alters either all applies or none does. MySQL cannot — each DDL commits immediately, so you must make migrations smaller and write explicit forward rollback migrations. Second, performance of common operations swaps: Postgres since version 11 makes `ADD COLUMN ... DEFAULT` fast by storing the default in the catalog without rewriting rows, and `CREATE INDEX CONCURRENTLY` lets writes continue while indexing — both similar in spirit to MySQL's INSTANT and INPLACE, but with different syntax and limits. Historically MySQL was more dangerous for ADD COLUMN with DEFAULT and Postgres was more dangerous for adding indexes without CONCURRENTLY. The rule for both is the same: know which operation is metadata-only in your version and which needs a rewrite, and be explicit.

**Versioned migrations vs ORM auto-sync (like `sequelize.sync()` or `synchronize: true`).** Auto-sync compares your model definitions to the live schema and issues whatever ALTERs it thinks are needed, with no file, no checksum, no review, and no safe algorithm choice. It is fine for local dev and demos. In production it is dangerous: it can drop a column that code still reads, run a copying ALTER without warning, and leave no history of what changed. Versioned migrations are slower but auditable, reviewable, ordered, and safe to rerun across every environment.

**Direct ALTER vs gh-ost/pt-osc.** Direct ALTER with the right ALGORITHM is simplest and fastest when it qualifies as INSTANT or quick INPLACE — use it. gh-ost/pt-osc are heavier — they copy longer and need monitoring — but they avoid long locks on big tables where direct ALTER would stall production. Choose by measuring on a clone: if the direct ALTER finishes quickly with no lock, use it; if it would copy for minutes, switch to the online tool.

## 8. 🧠 The Memory Hook

Migrations are numbered renovation permits with photocopies — order and checksum keep every building identical, MySQL makes you pay rent on hallway closures unless you ask for INSTANT and mean last-column, and for big hallways you build next door with gh-ost and swap the signs.
