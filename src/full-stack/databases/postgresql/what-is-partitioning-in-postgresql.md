# What Is Partitioning in PostgreSQL

## 1. The Real-World Problem — When You Actually Hit This

Your `events` table has been fine for a year. It has 300 million rows now. Every dashboard query filters by `created_at`, but it still scans a massive index. Autovacuum never finishes. The table is bloated to 400 GB.

Then product says "delete everything older than 90 days."

You run `DELETE FROM events WHERE created_at < NOW() - INTERVAL '90 days'` and everything stops. The delete takes hours, holds locks, bloats the table even more because every deleted row is just marked dead until vacuum cleans it, and every index has to be updated row by row. Roll it back and you have wasted all that work. Do it again next month and you pay the same price again.

This is the moment partitioning exists for. Instead of one giant heap you have to surgically delete from, you have many small, independent tables hidden behind one logical table. Dropping a month of data becomes dropping or detaching one partition — instant, no bloat, no massive vacuum.

## 2. The Analogy — Make the Mechanic Obvious

Think of a warehouse that stores paper invoices.

Without partitioning, you throw every invoice from every year into one giant pile in the middle of the warehouse. To find invoices from March 2025 you dig through the whole pile. To throw away 2023 you have to pick through the pile one sheet at a time.

With partitioning, you put labeled filing cabinets along the wall. One drawer per month: `events_2025_01`, `events_2025_02`, and so on. The front desk has a single sign that says "Invoices" — that is the parent table. You still ask the front desk for "invoices from March 2025" but the clerk knows exactly which drawer to open and ignores all the others.

Each drawer has its own index tabs inside it. A drawer can be removed whole, archived to cold storage, or thrown away without touching any other drawer. The key on each drawer is the partition key — the column you used to decide which drawer a sheet belongs in, like `created_at` or `country_code` or a hash of `user_id`. If you forget to label the drawer, the clerk has to open every single one.

That is declarative partitioning. One logical table, many physical drawers, and the planner is the clerk who prunes the drawers you do not need.

## 3. The Full Explanation — How It Actually Works

In plain words: partitioning splits one logical table into many real tables called partitions. You still write `SELECT * FROM events WHERE created_at = '2025-03-15'` like normal. Postgres figures out which child tables could possibly hold that row and only touches those.

Under the hood, you declare a partitioned parent with `PARTITION BY`. The parent holds no rows itself — it is just the routing rule and the shared schema. Each partition is a normal table with a bound that says what it stores.

**The three strategies — RANGE, LIST, and HASH — are just three ways to draw the boundaries:**

RANGE is for ordered values, almost always time. "January goes here, February goes there." Perfect for time-series, logs, orders, events. This is the one you will use 80% of the time.

LIST is for known categories. "Rows where `region = 'EU'` go here, `region = 'US'` goes there." Great when you have a small set of discrete values like region, tenant tier, or status.

HASH is for spreading load evenly when there is no natural range. Postgres hashes the key and mods it into N buckets. You do it when you want to break up a huge table by `user_id` so each partition is similar in size, even though no query can prune to one month.

**How pruning works:** When you query with a filter on the partition key, the planner can prove that most partitions cannot contain matching rows and skips them entirely before execution. You can see it in `EXPLAIN`: it will show only one or two partitions scanned instead of all 36. If your `WHERE` does not mention the partition key, there is nothing to prove — Postgres has to check every partition. That is the most common performance trap.

**Why the primary key must include the partition key:** A uniqueness constraint has to be enforceable without scanning every partition. If you try `PRIMARY KEY (id)` on a table partitioned by `created_at`, Postgres cannot know whether that `id` exists in another partition without checking them all, so it refuses. You must define `PRIMARY KEY (id, created_at)`. Same rule applies to `UNIQUE` constraints. If you truly need global uniqueness on just `id`, you need another mechanism outside partitioning.

**DETACH vs DROP vs DELETE for archival:** `DELETE` is row-by-row and creates bloat — exactly what you were trying to escape. `DROP` instantly destroys the partition and its data. `DETACH PARTITION` instantly disconnects the partition from the parent but keeps it as a standalone table. You can then attach it to an archive database, dump it to S3, or drop it later with zero impact on the live table. For "keep 90 days," the pattern is: create monthly partitions ahead of time, and once a month `ALTER TABLE events DETACH PARTITION events_2025_01` and then `DROP TABLE events_2025_01` or archive it. No locks on the other partitions.

**Indexes are per partition.** When you create an index on the parent, Postgres creates the same index on every partition automatically. Each index is smaller and faster to vacuum than one giant index would be. But there are no global indexes across all partitions except the unique constraints that include the partition key.

**What changed in PG 11 and later vs the old inheritance trick:** Before PG 10, people faked partitioning with inheritance, check constraints, and trigger functions to route inserts. It worked but it was manual, slow, and the planner could not prune well.

Declarative partitioning fixed that in stages: PG 10 introduced `PARTITION BY` with basic routing. PG 11 made it actually production-ready — hash partitioning, a default partition for rows that match no bound, fast tuple routing, the ability to create indexes and foreign keys on the parent, and `UPDATE` that can move a row to a different partition when you change its partition key. PG 12+ added better pruning at execution time, partition-wise joins and aggregation, and faster `ATTACH`/`DETACH`. Today there is no reason to use the old inheritance approach for new tables.

**When to use it and when not to:** Use it when the table is very large (tens of millions plus), you have a clear partition key that most queries filter on, and you need fast bulk deletes or archival. Do not use it for a 100k-row table — you will add planning overhead and make queries slower. Do not use it as a substitute for a missing index — a bad query that scans a whole partition is still a bad query.

## 4. See It In Practice — Real Code or Queries

All syntax below is real PostgreSQL 11+ declarative partitioning.

```sql
-- Parent: one logical table, partitioned by month (RANGE on created_at)
CREATE TABLE events (
  id         BIGINT,
  user_id    BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  payload    JSONB,
  -- PK must include partition key (created_at)
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Index on parent -> created on every partition automatically
CREATE INDEX ON events (user_id, created_at);

-- Monthly partitions (bounds are inclusive lower, exclusive upper)
CREATE TABLE events_2025_01 PARTITION OF events
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE events_2025_02 PARTITION OF events
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE events_2025_03 PARTITION OF events
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- A default partition catches rows that match no bound (PG 11+)
CREATE TABLE events_default PARTITION OF events DEFAULT;

-- Inserts are automatically routed by created_at
INSERT INTO events (id, user_id, event_type, created_at, payload)
VALUES (1, 42, 'page_view', '2025-02-15 10:00:00+00', '{"url": "/pricing"}');
-- This row lands in events_2025_02 with no application logic
```

```sql
-- Pruning: planner only scans the relevant partition
EXPLAIN SELECT * FROM events
WHERE created_at >= '2025-02-01' AND created_at < '2025-03-01'
AND user_id = 42;
-- Append
--   -> Index Scan on events_2025_02  (only this partition appears)
-- No scan of events_2025_01 or events_2025_03

-- No pruning when you forget the partition key
EXPLAIN SELECT * FROM events WHERE user_id = 42;
-- Append
--   -> Index Scan on events_2025_01
--   -> Index Scan on events_2025_02
--   -> Index Scan on events_2025_03
--   -> Seq Scan on events_default
-- Every partition is touched -- you pay planning + execution for all of them
```

```sql
-- LIST partitioning: split by region
CREATE TABLE orders (
  id         BIGINT,
  region     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  amount     NUMERIC NOT NULL,
  PRIMARY KEY (id, region)
) PARTITION BY LIST (region);

CREATE TABLE orders_us PARTITION OF orders FOR VALUES IN ('us');
CREATE TABLE orders_eu PARTITION OF orders FOR VALUES IN ('eu');
CREATE TABLE orders_apac PARTITION OF orders FOR VALUES IN ('apac');

-- HASH partitioning: spread evenly by user_id (no time pruning, just size)
CREATE TABLE page_views (
  id      BIGINT,
  user_id BIGINT NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id, user_id)
) PARTITION BY HASH (user_id);

CREATE TABLE page_views_0 PARTITION OF page_views
  FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE page_views_1 PARTITION OF page_views
  FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE page_views_2 PARTITION OF page_views
  FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE page_views_3 PARTITION OF page_views
  FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

```sql
-- Archival: DETACH keeps data, DROP destroys it, DELETE is the slow path

-- Detach January to archive it (instant, no bloat)
ALTER TABLE events DETACH PARTITION events_2025_01;
-- events_2025_01 is now a normal table -- dump it, move it, or drop it later
-- e.g. pg_dump -t events_2025_01 | psql archive_db
DROP TABLE events_2025_01; -- when you are sure

-- Compare with the anti-pattern you are escaping:
-- DELETE FROM events WHERE created_at < '2025-02-01'; -- hours, bloat, vacuum pain

-- Creating next month's partition ahead of time (automate with pg_partman or a cron)
CREATE TABLE events_2025_04 PARTITION OF events
  FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is partitioning in PostgreSQL and why would you use it?**

Postgres partitioning is splitting one logical table into many physical tables called partitions, hidden behind a single parent table. You use it not to make a small table faster, but to make a huge table manageable. It keeps indexes smaller, lets vacuum and autovacuum work on one partition at a time, lets the planner skip irrelevant partitions when you filter on the partition key, and lets you delete or archive old data by detaching or dropping a partition instead of running a massive `DELETE` that bloats the table. The parent holds the schema and routing rule, the partitions hold the actual rows.

**Q: What are RANGE, LIST, and HASH partitioning, and how do you choose?**

RANGE partitions by ordered boundaries — almost always time like `FOR VALUES FROM ('2025-01-01') TO ('2025-02-01')`. Use it for time-series, events, logs, and orders where queries filter by a date range and you want to drop old time slices.

LIST partitions by explicit values — `FOR VALUES IN ('us', 'eu')`. Use it when you have a small, known set of categories like region, tenant plan, or environment, and queries filter by that category.

HASH partitions by hashing the key and taking the modulus — `FOR VALUES WITH (MODULUS 4, REMAINDER 0)`. The hash decides the partition, not the value itself. Use it when you have no natural range but the table is too large for one physical file and you want to spread writes and index size evenly, for example partitioning `page_views` by `user_id` hash. HASH helps with write distribution and index size, not with pruning by time.

**Q: How does partition pruning work and how do you verify it?**

When your `WHERE` clause filters on the partition key, the planner can prove that certain partitions cannot possibly contain matching rows and removes them from the plan before execution. For a range-partitioned table on `created_at`, a query with `WHERE created_at >= '2025-02-01' AND created_at < '2025-03-01'` will only scan the February partition. You verify it with `EXPLAIN` — you should see only the relevant partition names under the Append node, not all partitions. If the `WHERE` does not mention the partition key, no pruning happens and every partition is scanned.

**Q: Why must the primary key include the partition key?**

Postgres enforces uniqueness per partition. If you declared `PRIMARY KEY (id)` on a table partitioned by `created_at`, Postgres would have to check every partition to be sure an `id` is not duplicated in another partition, so it refuses to create the constraint. By requiring `PRIMARY KEY (id, created_at)`, uniqueness can be checked inside a single partition — the one where `created_at` routes the row. The same rule applies to any `UNIQUE` constraint or `UNIQUE` index. If you need global uniqueness on just `id`, you need to enforce it at the application layer or use a different table design.

**Q: What is the difference between DETACH, DROP, and DELETE for removing old data?**

`DELETE` removes rows one by one, writes dead tuples, bloats the table and indexes, and needs vacuum to clean up — slow and expensive for millions of rows. `DROP TABLE partition_name` instantly deletes the partition file and its data with no bloat. `ALTER TABLE parent DETACH PARTITION partition_name` instantly disconnects the partition but keeps it as a standalone table so you can archive it, dump it, reattach it elsewhere, or drop it later. For retention like "keep 90 days," the standard pattern is `DETACH` then archive or `DROP` — never a bulk `DELETE` on the parent.

**Q: How is modern declarative partitioning different from the old inheritance approach?**

Before PG 10, you faked partitioning by creating child tables that inherited from a parent, adding `CHECK` constraints, and writing trigger functions to route inserts. Pruning was limited, routing was slow, and you managed everything by hand.

Declarative partitioning (`PARTITION BY`) is built into the engine. PG 10 introduced it. PG 11 made it usable: hash and default partitions, fast tuple routing, indexes and foreign keys defined on the parent automatically propagating to children, and `UPDATE` that moves a row to a different partition when you change its partition key. PG 12 and later added execution-time pruning, partition-wise joins and aggregation, and faster `ATTACH`/`DETACH`. Today you should use declarative partitioning for new designs — inheritance is only for legacy tables.

**Q: Does partitioning automatically make queries faster?**

Only when the query filters on the partition key so pruning can happen, or when operating on a single partition reduces index size enough to matter. A query like `SELECT * FROM events WHERE user_id = 42` on a table partitioned by `created_at` will still scan every partition and will often be slower than the same query on a non-partitioned table with a good index, because you pay planning overhead for each partition. Partitioning is a data-management and pruning optimization, not a magic index. If your hot queries do not filter on the partition key, pick a different partition key, add an index, or do not partition.

## 6. The Traps — What Goes Wrong in Production

**Forgetting to include the partition key in the primary key or unique constraint.** You write `PRIMARY KEY (id)` on a table partitioned by `created_at`, Postgres errors with "insufficient columns in primary key," and you are stuck. Or worse, you drop the PK to make partitioning work and lose uniqueness entirely. The fix is to design the key as `PRIMARY KEY (id, created_at)` up front, which means every lookup by `id` alone now needs both columns or a separate unique enforcement.

**Every query scans all partitions because it never filters on the partition key.** You partition `events` by `created_at` but your most common query is `SELECT * FROM events WHERE user_id = $1`. EXPLAIN shows an Append over 36 partitions. Latency gets worse than before because you multiplied planning work and index scans by the partition count. Fix it by making the partition key match your pruning filter, or accept that this table should be partitioned by hash on `user_id` instead, or keep the time partitioning but add a separate lookup path.

**No default partition and inserts start failing.** You create monthly partitions through March, then April 1 arrives and inserts error with "no partition of relation found for row." You needed a `DEFAULT` partition or automation to create next month's partition before it is needed. Tools like `pg_partman` or a simple cron that creates next month's partition on the 25th prevent this.

**Creating an index only on one partition.** You manually create `events_2025_01` and add an index to it, then create `events_2025_02` and forget the index. One month is fast, the next is a sequential scan. Always create indexes on the parent — they propagate to all partitions automatically. After attaching a partition manually, verify its indexes match.

**Too many partitions.** Creating daily partitions for five years of data gives you 1,800 partitions. Planning time dominates, memory for partition metadata balloons, and `EXPLAIN` becomes unreadable. Size partitions so each holds a useful chunk — often monthly for event tables — and aim for tens to low hundreds of partitions, not thousands.

**Updates that move rows silently fail on old versions or surprise you on new ones.** On PG 11+ an `UPDATE events SET created_at = '2025-05-01' WHERE id = 1` will move the row from the January partition to the May partition. If you have triggers or foreign keys that assumed rows never move, they break. Test partition-key updates explicitly if your application ever changes that column.

## 7. Compare With Related Concepts

**Partitioning vs sharding.** Both split a large dataset, but the boundary is different. Partitioning splits a table inside one Postgres instance — the application still talks to one database and writes `SELECT * FROM events`. Postgres handles routing and pruning. Sharding splits data across multiple database servers — the application or a proxy must know which shard to talk to, handle cross-shard queries, rebalancing, and distributed transactions. Partitioning solves single-node manageability, bloat, and pruning. Sharding solves single-node capacity when one machine cannot hold the data or the write load anymore. Rule: partition first. Only shard when one instance cannot scale vertically anymore.

**Partitioning vs partial index.** A partial index like `CREATE INDEX ON events (user_id) WHERE created_at >= '2025-01-01'` makes a specific query fast by indexing only a subset of rows, but the table is still one giant heap — deletes still bloat, vacuum still struggles, and archival is still a bulk `DELETE`. Partitioning physically separates the heaps so management operations are partition-local. They are not exclusive — you often create partial-like indexes inside each partition after partitioning, or use a partial index instead of partitioning when the table is mid-sized and you only need to speed up one query pattern. Rule: use a partial index to speed up one query on a medium table. Use partitioning to manage lifecycle and pruning on a huge table.

**Partitioning vs inheritance.** Inheritance was the manual predecessor: child tables inherit columns, you add `CHECK (created_at >= '2025-01-01' AND created_at < '2025-02-01')`, and a trigger routes inserts. It can mimic partitioning but with worse pruning, slower routing, and manual bookkeeping. Declarative partitioning is the engine-supported replacement with optimized routing, constraint enforcement, and pruning. Rule: never start a new design with inheritance for partitioning — use `PARTITION BY`.

## 8. 🧠 The Memory Hook

Partitioning is labeled drawers behind one desk. You still ask the desk for data, but the clerk only opens the drawer whose label matches your `WHERE`. If you do not filter on the label, the clerk opens every drawer. If you want uniqueness, the label has to be part of the key. And when you want to throw away old data, yank the whole drawer — do not pick through it one sheet at a time.
