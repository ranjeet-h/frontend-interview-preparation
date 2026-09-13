# How Will You Migrate a Large Table Without Downtime

## 1. The Real-World Problem — When You Actually Hit This

Your `orders` table has 80 million rows. It has been running fine for two years. Now product wants a new `status_v2` column and an index on `customer_id, created_at` because the customer dashboard is slow.

A junior runs this on production:

```sql
ALTER TABLE orders ADD COLUMN status_v2 VARCHAR(20) NOT NULL DEFAULT 'pending';
CREATE INDEX idx_customer_created ON orders(customer_id, created_at);
```

Within seconds, the app freezes. Writes queue up. Reads time out. The deploy dashboard goes red. What happened is simple: that `ALTER TABLE` tried to rewrite the entire table while holding an exclusive lock. Every new order insert waits. Every dashboard query waits. On a small table with 1,000 rows this finishes in milliseconds and you never notice. On 80 million rows it runs for 30 minutes, and your site is down for 30 minutes.

Rolling it back is not faster — now you need to undo a half-finished copy. The real lesson hits you here: on a large table, any migration that locks writes, copies the whole table at once, or assumes you can just take a short downtime window is a production incident waiting to happen.

You need a way to change the shape of a table that is actively being read and written to, without anyone noticing.

## 2. The Analogy — Make the Mechanic Obvious

Think of a busy four-lane highway that you need to resurface.

The naive way is to close the whole highway, kick every car off, lay new asphalt across all four lanes, then reopen. Fast for the crew, terrible for the city. That is a blocking `ALTER TABLE`.

The zero-downtime way is how real highway crews work. They build a temporary parallel lane next to the highway. Traffic keeps flowing on the old lanes. At night they copy the road markings onto the new lane in small sections. As cars keep driving, a flagger copies any new cars that entered onto the new lane too, so nothing is lost. Once the new lane is fully ready and catches every car, they swing a sign: all traffic now uses the new lane. They close the old one. No car ever had to stop.

That maps exactly:

* The old highway is your original table.
* The new parallel lane is the shadow or ghost table.
* Traffic is your live reads and writes — they never stop.
* Copying markings in small sections at night is a batched backfill — you copy rows in small chunks so you don't overwhelm the road.
* The flagger who mirrors new cars is a trigger or binlog tailer — it captures writes that happen while you are copying and replays them to the new table.
* Swinging the sign is the atomic cutover — a single fast rename that swaps the tables.

If any step fails, you just keep traffic on the old highway. Nothing is lost.

## 3. The Full Explanation — How It Actually Works

There are really only three ideas you combine. Everything else is a tool that implements them.

**Idea 1: Never take an exclusive lock on the live table.**

A normal `ALTER TABLE` in MySQL InnoDB or PostgreSQL often needs an `ACCESS EXCLUSIVE` lock at some point. Even if the database says it supports "online DDL," a big rewrite still blocks writes or creates massive replication lag. The zero-downtime rule is: your migration must allow concurrent reads and writes the entire time. If a tool cannot promise that, do not use it on a large table.

**Idea 2: Expand then contract. Never change readers and writers at the same time.**

This is the expand-contract pattern and it is the safest mental model:

1.  Expand — add the new thing alongside the old thing in a way that is backward compatible. Add a nullable column, add a new table, create a new index concurrently. Do not remove anything yet. Old code still works.
2.  Migrate — copy or backfill data in small batches and make new writes go to both places if needed.
3.  Contract — once every row is correct and every service reads from the new place, remove the old column, old index, or old table.

You never have a moment where old code expects a column that is gone, or new code expects a column that is not fully filled.

**Idea 3: Copy in small batches and mirror live writes.**

You never `UPDATE orders SET status_v2 = status` in one statement — that scans 80 million rows, holds locks, bloats WAL, and kills replicas. Instead you copy in batches of 500 to 5,000 rows, sleep briefly between batches, and capture any writes that happened while you were copying.

That gives you the three practical approaches, from simplest to most robust:

**Approach A: Native online operations for safe changes.**

PostgreSQL and modern MySQL can do some changes without a full copy if you use the right syntax.

* PostgreSQL: `ADD COLUMN ... DEFAULT` was rewritten to not copy the table since PG 11 if the default is a constant — it just stores the default in the catalog. `CREATE INDEX CONCURRENTLY` builds the index without locking writes. `ADD COLUMN IF NOT EXISTS` with no default is instant.
* MySQL 5.6+: `ALGORITHM=INPLACE, LOCK=NONE` can add a nullable column or secondary index without copying the table, but adding a `NOT NULL DEFAULT` or changing column type still copies.

Use this when the change is additive and the database truly supports it online. Verify with `EXPLAIN` or dry-run on a replica size dataset first.

**Approach B: Batched backfill with dual writes in application code.**

When you need to change data, not just shape, you control the copy yourself:

1.  Add the new column as nullable with no backfill: `ADD COLUMN status_v2 VARCHAR(20)`.
2.  Deploy code that writes to both `status` and `status_v2` on every create and update. Still reads from `status`.
3.  Run a backfill job that updates old rows in small batches ordered by primary key, with a pause between batches.
4.  Verify row counts and checksums match.
5.  Deploy code that reads from `status_v2`.
6.  Later, drop the old column or stop dual writes.

This is boring and safe. It costs two deploys but never needs triggers or extra disk for a ghost table.

**Approach C: Shadow table with trigger or binlog replay — gh-ost and pt-online-schema-change.**

For heavy shape changes like changing a column type, adding a primary key, or rebuilding a huge table, you let a tool do the highway trick:

* `pt-online-schema-change` creates a shadow table with the new schema, installs triggers on the original to mirror inserts, updates, and deletes, copies rows in chunks, then does an atomic `RENAME`.
* `gh-ost` does the same but without triggers — it tails the MySQL binlog to replay writes, which is lighter on the primary and lets you throttle or pause replication lag.
* PostgreSQL equivalent is `pg_repack` or doing it manually with logical replication.

The cutover itself is a single atomic rename that takes milliseconds. If replication lag spikes, both tools can throttle or abort and you are still on the old table.

What you gain and what you pay: you gain zero blocked writes and an abort that leaves the original untouched. You pay extra disk space for two copies of the table, extra write load from the copy and triggers, and time — a 100 GB table might take hours to copy even though users see no downtime. You must run it during lower traffic, monitor replica lag, and have enough disk.

The surrounding system concerns are where seniors show depth:

* **Transactions:** Each batch is its own transaction. Never wrap 80 million rows in one transaction or you will bloat WAL, hold locks, and risk an out-of-memory rollback.
* **Indexes and constraints:** Adding an index concurrently avoids locking, but it still scans the whole table and can fail if a duplicate violates uniqueness. Foreign keys are the hardest — `gh-ost` and `pt-osc` need special handling because the shadow table cannot have the same foreign key name.
* **Replication:** The copy is heavy on replicas. Watch `replica_lag` and throttle. Test on a staging replica with similar data size.
* **Idempotency and resume:** Batches must be resumable. Order by primary key, remember the last id, and handle a job that restarts halfway.
* **Observability:** Log batch progress, lag, error count, and time per chunk. Alert if lag exceeds 5 seconds or deadlocks spike.
* **Rollback:** With expand-contract, rollback is just "keep reading from the old place." With a ghost table, rollback is "do not cut over." Never make the migration irreversible until you have verified.

## 4. See It In Practice — Real Code or Queries

These examples are MySQL and PostgreSQL as labeled. The batch logic works in any language.

**Example 1: What not to do — the blocking migration**

```sql
-- MySQL / PostgreSQL — locks the table for the whole copy on large tables
-- On 80M rows this blocks writes for minutes to hours
ALTER TABLE orders ADD COLUMN status_v2 VARCHAR(20) NOT NULL DEFAULT 'pending';
CREATE INDEX idx_customer_created ON orders(customer_id, created_at);
```

**Example 2: Safe PostgreSQL — add column and index without locking writes**

```sql
-- Step 1: Add nullable column — instant, no table rewrite on PG 11+
ALTER TABLE orders ADD COLUMN status_v2 VARCHAR(20);

-- Step 2: Build index without blocking writes
-- CONCURRENTLY cannot run inside a transaction, takes longer but allows reads and writes
CREATE INDEX CONCURRENTLY idx_orders_customer_created
  ON orders(customer_id, created_at);

-- Step 3: Set default for new rows only — does not rewrite old rows
ALTER TABLE orders ALTER COLUMN status_v2 SET DEFAULT 'pending';

-- Later, after backfill, add NOT NULL safely
-- Will fail if any nulls remain, so validate first
ALTER TABLE orders ALTER COLUMN status_v2 SET NOT NULL;
```

**Example 3: Batched backfill — the core loop you run in production**

This is the pattern interviewers want you to write out. Order by primary key, small batches, pause.

```sql
-- PostgreSQL batched backfill — run this in a loop from application code
-- Each UPDATE touches at most 1000 rows and commits immediately

-- Check how many remain before starting
SELECT count(*) FROM orders WHERE status_v2 IS NULL;

-- The statement you execute per batch
UPDATE orders
SET status_v2 = status
WHERE id > $1          -- $1 is last_id from previous batch
  AND status_v2 IS NULL
ORDER BY id
LIMIT 1000;
-- In Postgres LIMIT in UPDATE needs a subquery; MySQL allows LIMIT directly
-- Postgres variant:
UPDATE orders
SET status_v2 = status
WHERE id IN (
  SELECT id FROM orders
  WHERE id > $1 AND status_v2 IS NULL
  ORDER BY id
  LIMIT 1000
);
```

Application runner that drives it. Works in Node.js or Python, same idea:

```javascript
// Node.js / TypeScript — batched backfill runner with throttling
async function backfillStatus(pool) {
  let lastId = 0;
  let affected = 1;

  while (affected > 0) {
    const result = await pool.query(
      `UPDATE orders SET status_v2 = status
       WHERE id IN (
         SELECT id FROM orders WHERE id > $1 AND status_v2 IS NULL
         ORDER BY id LIMIT 1000
       )`,
      [lastId]
    );
    affected = result.rowCount;

    if (affected > 0) {
      // Advance cursor to avoid re-scanning from start
      const row = await pool.query(
        `SELECT max(id) as max_id FROM (
           SELECT id FROM orders WHERE id > $1 AND status_v2 IS NOT NULL
           ORDER BY id LIMIT 1000
         ) s`, [lastId]
      );
      lastId = row.rows[0].max_id ?? lastId;

      // Throttle — protect replicas and give breathing room
      await new Promise(r => setTimeout(r, 100));

      // Check replica lag and pause if too high
      const lag = await getReplicaLagSeconds(pool);
      if (lag > 3) await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`Backfilled up to id ${lastId}, batch: ${affected}`);
  }
}
```

```python
# Python / SQLAlchemy — same pattern
import time

def backfill_status(session):
    last_id = 0
    while True:
        result = session.execute(
            text("""
                UPDATE orders SET status_v2 = status
                WHERE id IN (
                  SELECT id FROM orders
                  WHERE id > :last_id AND status_v2 IS NULL
                  ORDER BY id LIMIT 1000
                )
            """),
            {"last_id": last_id},
        )
        session.commit()
        if result.rowcount == 0:
            break
        # move cursor forward
        last_id = session.execute(
            text("SELECT MAX(id) FROM orders WHERE id > :lid AND status_v2 IS NOT NULL"),
            {"lid": last_id},
        ).scalar() or last_id
        time.sleep(0.1)
```

**Example 4: Zero-downtime heavy change with gh-ost (MySQL)**

```bash
# gh-ost creates ghost table, tails binlog, copies in chunks, then atomic rename
# No triggers on the primary — reads binlog instead

gh-ost \
  --user="migrator" \
  --host=primary.db.internal \
  --database="shop" \
  --table="orders" \
  --alter="ADD COLUMN status_v2 VARCHAR(20), ADD INDEX idx_customer_created (customer_id, created_at)" \
  --allow-on-master \
  --max-load=Threads_running=30 \
  --critical-load=Threads_running=60 \
  --chunk-size=1000 \
  --throttle-control-replicas="replica1.db.internal,replica2.db.internal" \
  --max-lag-millis=3000 \
  --cut-over=default \
  --execute

# If lag exceeds 3 seconds, gh-ost throttles automatically
# If you need to abort: gh-ost leaves original table untouched
```

pt-online-schema-change equivalent:

```bash
pt-online-schema-change \
  --alter "ADD COLUMN status_v2 VARCHAR(20), ADD INDEX idx_customer_created (customer_id, created_at)" \
  --execute --chunk-size 1000 --max-lag 3s \
  D=shop,t=orders,h=primary.db.internal
```

**Example 5: Verification before you declare done**

```sql
-- Are there still nulls?
SELECT count(*) FROM orders WHERE status_v2 IS NULL;

-- Do the two columns match for every row? Sample check
SELECT count(*) FROM orders WHERE status_v2 IS DISTINCT FROM status;
-- Should be 0

-- Checksum a range to catch silent drift
SELECT sum(hashtext(status_v2)) FROM orders WHERE id BETWEEN 1 AND 1000000;
SELECT sum(hashtext(status))    FROM orders WHERE id BETWEEN 1 AND 1000000;

-- Is the new index actually being used?
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders WHERE customer_id = 42 ORDER BY created_at LIMIT 20;
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How would you add a column to a table with 100 million rows without downtime?**

Add it as nullable first — `ADD COLUMN status_v2 VARCHAR(20)` — which is instant on PostgreSQL 11+ and MySQL with `ALGORITHM=INPLACE`. Do not add `NOT NULL DEFAULT` in the same statement on a large table because that forces a full rewrite. Deploy application code that dual-writes to both the old and new column. Then backfill old rows in batches ordered by primary key with sleeps between batches. Verify no nulls remain, then add the `NOT NULL` constraint and switch reads to the new column. The key is you never lock the table and you never have a moment where one version of the code cannot handle the schema.

**Q: Why is a single big UPDATE a bad idea for backfilling?**

Three reasons. First, it holds locks and generates a huge amount of WAL or binlog in one transaction, which spikes replica lag and can cause out-of-disk on replicas. Second, it scans and dirties every page at once, evicting hot cache and making every other query slow. Third, if it fails halfway you roll back the entire thing and lose all progress, or worse you leave the table in a half-migrated state. Batched updates each in their own small transaction fix all three: small lock scope, bounded replication impact, and resumable progress.

**Q: What are gh-ost and pt-online-schema-change and when would you use them?**

Both solve heavy DDL that would otherwise need a blocking table copy — changing a column type, adding a primary key, rebuilding a fragmented table. They create a shadow table with the new schema, copy rows in chunks, mirror live writes so the shadow stays current, and then do an atomic rename. `pt-osc` mirrors writes with triggers on the original table. `gh-ost` tails the MySQL binlog instead, so there are no triggers and less load on the primary, plus it can throttle based on replica lag and you can pause or abort cleanly. Use native online DDL for simple additive changes, batched backfill for data changes you control, and gh-ost or pt-osc when the shape change itself requires copying the whole table.

**Q: How do you handle indexes on a large table without blocking writes?**

In PostgreSQL, always use `CREATE INDEX CONCURRENTLY`. It does two table scans without an exclusive lock, allows writes throughout, and you can add it while traffic flows. The tradeoff is it takes longer, uses more resources, cannot run inside a transaction, and if it fails it leaves an invalid index you must drop. In MySQL, `ADD INDEX` with `ALGORITHM=INPLACE, LOCK=NONE` does a similar online build for secondary indexes. In both cases, create the index outside peak hours, monitor for duplicate-key failures, and test on a same-size staging copy to estimate time and temporary disk.

**Q: How do you handle foreign keys and constraints during a zero-downtime migration?**

Foreign keys are the hardest part. A shadow table cannot have the same foreign key name as the original, and copying rows must respect referential integrity. `gh-ost` has limited foreign key support and often requires you to use `ALTER` that drops and re-adds the key carefully. Often the safer path is to migrate in expand-contract steps that avoid needing a ghost table at all: add the new column without a foreign key, backfill, add the key with `NOT VALID` in PostgreSQL then `VALIDATE CONSTRAINT` separately so validation does not lock writes, or add the key as `DEFERRABLE` and validate later. Always check for orphaned rows before adding a constraint — `SELECT count(*) FROM orders LEFT JOIN customers ON orders.customer_id = customers.id WHERE customers.id IS NULL` — or the migration will fail partway through.

**Q: How do you make the cutover safe and how do you roll back?**

The cutover is a single atomic `RENAME TABLE orders TO orders_old, ghost_orders TO orders` in MySQL or a catalog swap in PostgreSQL. It takes milliseconds and the old table stays around as `orders_old` until you explicitly drop it. Rollback before cutover is trivial — just stop the tool and drop the ghost. Rollback after cutover but before you dropped the old table is a second atomic rename back. The rule is: never drop the old table or column until you have verified reads on the new schema in production, watched error rates and replication, and let it bake for at least one deploy cycle.

**Q: What do you monitor during a large migration?**

Replica lag is number one — if lag exceeds a few seconds, throttle or pause. Then `Threads_running` or `active_connections`, lock wait time, deadlocks, slow query count, error rate on the application side, disk usage on primary and replicas, and time per batch. For gh-ost specifically, watch the binlog lag and the ghost table row count versus the original. Alert on any of these crossing thresholds and have a runbook that says who can pause or abort.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Adding NOT NULL with a DEFAULT in one statement.**

`ALTER TABLE orders ADD COLUMN status_v2 VARCHAR(20) NOT NULL DEFAULT 'pending'` looks harmless. On PostgreSQL before 11 it rewrites every row. On MySQL it almost always triggers a full table copy. The fix is always two steps: add as nullable, backfill, then add `NOT NULL`. The extra step is not wasted time — it is the thing that prevents downtime.

**Trap 2: Backfilling without ordering by primary key or without a cursor.**

`UPDATE orders SET status_v2 = status WHERE status_v2 IS NULL LIMIT 1000` without `ORDER BY id` will do a full scan on every batch, get slower as the table fills, and may miss or revisit rows if new rows are inserted concurrently. Always order by the primary key and track `last_id`. Use an index on `id` plus the filter column so each batch is a cheap range scan.

**Trap 3: Running the backfill inside one big transaction.**

Wrapping the whole backfill in `BEGIN; ... COMMIT;` holds locks longer, bloats `pg_wal` or MySQL undo logs, and risks running out of disk or memory. Each batch should be its own committed transaction. If one batch fails, you retry that batch, not the whole migration.

**Trap 4: Forgetting dual writes, so new rows never get the new value.**

You backfill 80 million old rows perfectly, but the application still only writes to the old column. Every new order after the backfill started has `status_v2 = NULL`. Now you have a table that is half correct and no easy way to know which rows are wrong. Always deploy dual-write code before you start backfilling, and keep it until cutover is verified.

**Trap 5: Using OFFSET for batching.**

`OFFSET 1000000 LIMIT 1000` gets linearly slower because the database still scans and discards the offset rows. On a large table your last batches will take minutes each. Use keyset pagination — `WHERE id > last_id ORDER BY id LIMIT 1000` — which stays fast regardless of how far you are into the table.

**Trap 6: Not checking replica lag and disk space.**

The ghost table needs as much disk as the original. The copy generates massive binlog or WAL. If a replica is already near disk full or lagging, the migration will push it over. Check `pg_wal` size, `SHOW SLAVE STATUS`, and free disk on every node before starting. Set throttle thresholds so the tool pauses itself.

**Trap 7: Creating the index normally instead of concurrently.**

`CREATE INDEX` without `CONCURRENTLY` takes an `ACCESS EXCLUSIVE` lock at the end and blocks writes. On a large table that lock can last seconds to minutes. Always use `CONCURRENTLY` in PostgreSQL for production, handle the case where it leaves `INVALID` on failure, and be prepared to `DROP INDEX CONCURRENTLY` and retry.

**Trap 8: Dropping the old column or table too early.**

You cut over, everything looks green for 10 minutes, you drop the old column, then a background job that was still deployed on an old pod starts failing because it still reads the old column. Keep the old thing around for at least one full deploy cycle and after all consumers have been confirmed on the new schema. Dropping is a separate deploy, not part of the migration deploy.

## 7. Compare With Related Concepts

**Zero-downtime migration vs. blue-green deployment.**

Blue-green swaps entire environments — you deploy the new schema to the green database and switch traffic. Zero-downtime migration keeps one database and changes it in place while it serves traffic. Blue-green is simpler for stateless apps but doubles your database cost and needs careful data sync. In-place migration is cheaper and more common for databases, but requires batching and careful cutover. Use blue-green when you can afford the copy and want the cleanest rollback; use in-place batching when the table is too large to copy the whole database.

**gh-ost vs. pt-online-schema-change.**

Both create a shadow table and atomic swap. `pt-osc` uses triggers on the original table to mirror writes — simple but adds load to the primary and can conflict with existing triggers. `gh-ost` tails the binlog instead of using triggers, so it adds less load, works even when triggers are forbidden, and lets you throttle on replica lag from a replica host. `gh-ost` is usually preferred for busy MySQL primaries today. Choose `pt-osc` if your MySQL setup does not expose binlog row format or you need its wider set of alter handling.

**Expand-contract vs. single big ALTER.**

A single `ALTER` tries to do everything at once: add column, fill it, add index, enforce NOT NULL. It is one deploy and one statement but it locks, copies, and has no safe rollback. Expand-contract splits it into three safe phases: add nullable and keep old code working, backfill and dual-write, then switch reads and drop the old thing. It costs two or three deploys but each step is backward compatible and independently revertible. Always use expand-contract on any table you cannot afford to lock.

**CREATE INDEX CONCURRENTLY vs. normal CREATE INDEX.**

Normal `CREATE INDEX` is faster overall and runs inside a transaction, but it blocks writes at the start and end. `CONCURRENTLY` never blocks writes, which is why you use it in production, but it takes longer, cannot be in a transaction, and can leave an `INVALID` index if it hits a duplicate or is cancelled. Rule: use `CONCURRENTLY` on any live table, use normal index creation only on empty or offline tables and in tests.

**Batched backfill vs. logical replication for migration.**

Batched backfill is you writing a loop that copies data in place — simple, no extra infrastructure, good for adding a column or fixing data. Logical replication sets up a second cluster with the new schema and streams changes until you cut over — heavier but lets you change almost anything including PostgreSQL major versions with near-zero downtime. Use batched backfill for shape changes within one cluster; use logical replication when you need to move clusters or do a version upgrade that cannot be done in place.

## 8. 🧠 The Memory Hook

Never close the highway. Build the new lane next to it, copy traffic in small batches, mirror every new car, then swing the sign.

If you remember that image, you will never run a bare `ALTER TABLE` on a large production table again.
