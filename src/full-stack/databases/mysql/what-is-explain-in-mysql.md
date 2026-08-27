# `EXPLAIN` and `EXPLAIN ANALYZE` in MySQL: Execution Plan Anatomy, Join Types, and Performance Diagnostics

## 1. The Real-World Problem — When You Actually Hit This

Your order history query runs in 15 milliseconds on your laptop. 500 rows in `orders`, a couple of indexes that looked fine, tests pass, you ship it.

Three days later in production, `orders` has 12 million rows and `users` has 2 million. The same query now takes 45 seconds. Database CPU sits at 100 percent, your connection pool drains across every pod, and users start seeing 504s during peak traffic.

What happened? MySQL's optimizer decided your index wasn't worth using — maybe a column type mismatch, maybe a sort column that breaks index ordering, maybe stale statistics that made it think a full scan would be faster. So instead of a quick index lookup, it did a nested-loop scan across tens of millions of disk pages.

This is when you need `EXPLAIN`. And when the estimate looks fine but the query is still slow, you need `EXPLAIN ANALYZE`. Without them you are guessing: you add a random single-column index, you bump instance RAM, you split one good SQL query into three round trips. With them you see exactly what the database decided to do, which index it picked or ignored, how many rows it thought it would touch versus how many it actually touched, and where every millisecond went.

## 2. The Analogy — Make the Mechanic Obvious

Think of a road trip with two different GPS modes.

Traditional `EXPLAIN` is the GPS preview before you drive. You type in the destination and it says: "Take Highway 101, then Route 84, about 35 miles, estimated 42 minutes based on usual traffic." It estimates distance (`rows`), picks roads (`key`), and warns you about toll booths or unpaved detours (`Using filesort`, `Using temporary`). It never starts the car. If its traffic data is stale, that 42-minute estimate can really be four hours.

`EXPLAIN ANALYZE` is driving the trip with a telemetry tracker in the car. It actually drives every road, records when you cleared each interchange, how many cars you really passed versus the estimate, and how many times you looped around looking for parking. Same route, but now with real stopwatch times, real row counts, and real loop counts at every step.

That is the exact difference in MySQL. The optimizer is the GPS routing engine. Table and index statistics stored in `mysql.innodb_table_stats` are the historical traffic data. `EXPLAIN` shows the planned route with estimates. `EXPLAIN ANALYZE`, added in MySQL 8.0.18, runs the plan through the Volcano iterator engine and shows what actually happened.

If you remember preview versus drive, you will never confuse the two again.

## 3. The Full Explanation — How It Actually Works

When MySQL receives your SQL, the parser and preprocessor check syntax, then the cost-based optimizer scores many possible ways to read the tables. It estimates I/O and CPU cost for each path using sampled index statistics and picks the cheapest plan. `EXPLAIN` prints that picked plan without running it. `EXPLAIN ANALYZE` then runs it and decorates every iterator node with real timings.

Every row in traditional tabular `EXPLAIN` is one table access in the join order. The columns you must know cold are:

`id` is the order of SELECT blocks. Same `id` means same join stage, read top to bottom. A larger `id` runs first — that is usually a subquery or derived table.

`select_type` tells the role of the block. `SIMPLE` is a flat query with no subqueries or UNIONs. `PRIMARY` is the outermost block. `DERIVED` is a subquery in a FROM clause. `SUBQUERY` is a standalone subquery in SELECT or WHERE. `UNION` is the second or later part of a UNION.

`table` is the table, alias, or temporary name like `<derived2>` being read in that row.

`partitions` shows which partitions were actually pruned when partitioning is enabled.

`type` is the join access type. This is the single most important column. It tells you the algorithm used to read this table. From fastest to slowest, the ones you see in interviews are:

`system` means the table has one row total. Think constant table, O(1).

`const` means MySQL matched a PRIMARY KEY or unique not-null index against a constant like `WHERE id = 105` before the join even started. At most one row, O(1). You see this when you look up a single user by primary key.

`eq_ref` means for each row from the previous tables, MySQL fetches exactly one row from this table using a PRIMARY KEY or unique not-null index. This is the best join type for multi-table queries. You want to see `eq_ref` on the joined table when you join `orders.user_id = users.id`.

`ref` means all rows that share a value are fetched using a non-unique index or a leftmost prefix, like `WHERE tenant_id = 42`. Many matching rows, but still an index walk, not a scan.

`range` means an index range scan. MySQL walks the B-Tree once to the start of the range, then walks leaf pages through `<`, `>`, `BETWEEN`, `IN()`, or `IS NULL`. Efficient when the range is selective.

`index` means a full index scan. MySQL reads every leaf page of a secondary index from start to finish. It is often a little cheaper than a full table scan because the secondary index is smaller than the clustered table, but it is still O(N) and still painful at scale.

`ALL` means a full table scan. MySQL reads every data page of the clustered index. On millions of rows this is the catastrophe you are trying to avoid.

You will also see `fulltext` for MATCH ... AGAINST, `ref_or_null` which is like `ref` with an extra pass for NULLs, `index_merge` which merges two single-column indexes with an intersection or union and usually screams missing composite index, and `unique_subquery` or `index_subquery` for IN subquery rewrites.

`possible_keys` lists every index the optimizer looked at. `key` is the one it actually chose, or NULL if it chose none. Never stop at `possible_keys`. Only `key` tells you what will really run.

`key_len` tells you how many bytes of a composite index were used. This is how you know whether your whole index is working or just its left edge. You add the bytes per column: `TINYINT` 1 byte, `SMALLINT` 2, `INT` 4, `BIGINT` 8, `DATETIME` 5, `TIMESTAMP` 4, plus 1 byte if the column is nullable, plus for `VARCHAR(N)` in `utf8mb4` it is `N * 4 + 2` for the length prefix, and for `CHAR(N)` in `utf8mb4` it is `N * 4`. Then add per-column nullable byte. For example a composite index on `(tenant_id INT NOT NULL, status VARCHAR(32) NOT NULL, created_at DATETIME NULL)` has size 4 + (32*4+2)=130 + (5+1)=6, total 140. If `EXPLAIN` says `key_len: 4`, only `tenant_id` was used. If it says `134`, it used `tenant_id` plus `status` but skipped `created_at`. That tells you instantly where the left-to-right rule broke.

`ref` shows what was compared to the index — a constant like `const` or a column like `orders.user_id`.

`rows` is the optimizer's estimate of how many rows it must examine from this table. It is an estimate from sampled pages, not the truth. `filtered` is the estimated percent of those rows that survive remaining WHERE filters. So `rows: 1000` with `filtered: 10.00` means roughly 100 rows go to the next stage. Low `filtered` with large `rows` means MySQL is reading a lot and throwing most away.

`Extra` is where MySQL confesses what else it did. The flags you must recognize are `Using index`, which means a covering index — every column you asked for came straight from the secondary index leaf pages, no lookup back to the clustered table; `Using index condition` which is Index Condition Pushdown, where InnoDB evaluates WHERE conditions on indexed columns before building full rows, saving I/O; `Using where` which means the server layer filtered rows after the storage engine returned them; `Using filesort` which means the rows could not be delivered in ORDER BY order from an index, so MySQL must sort them in memory via `sort_buffer_size` or spill to disk; `Using temporary` which means MySQL built an internal temporary table for GROUP BY, DISTINCT, or multi-table sorting; and `Using join buffer` which means a join had no index on the join key and MySQL buffered rows from the driving table in memory to match, either as Block Nested Loop or Hash Join.

Output formats matter. Traditional `EXPLAIN` in table form is the quick check you run dozens of times a day. `EXPLAIN FORMAT=TREE` shows the Volcano iterator tree that MySQL 8.0 actually executes, like `-> Filter: (orders.total_amount > 100) -> Index lookup on orders using idx_tenant_status`. `EXPLAIN FORMAT=JSON` adds precise cost numbers: `query_cost`, `read_cost`, `eval_cost`, `sort_cost`, and buffer sizes. `EXPLAIN ANALYZE`, since 8.0.18, runs the query and annotates each iterator with `(actual time=0.045..0.120 rows=8 loops=1)` where 0.045 is milliseconds to the first row, 0.120 is time to the last row, `rows=8` is real rows produced, and `loops=1` is how many times the parent called this child. The costs are still estimates; the actual numbers are truth. If `rows` says 25 but actual `rows` says 118000, your statistics are stale or your selectivity assumption is wrong.

## 4. See It In Practice — Real Code or Queries

Everything below runs on InnoDB with `utf8mb4`. You can paste it into a local MySQL 8.0 and follow along. Comments explain why each line matters.

First, a realistic multi-tenant schema:

```sql
-- Clean start
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL,
    KEY idx_tenant_email (tenant_id, email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    user_id BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL,
    total_cents INT NOT NULL,
    created_at DATETIME NOT NULL,
    KEY idx_user_id (user_id),
    KEY idx_tenant_status_created (tenant_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Case 1 — A healthy plan that uses composite order and a covering-style join. We want the 10 most recent paid orders for tenant 42 with the customer email:

```sql
EXPLAIN
SELECT o.id, o.total_cents, o.created_at, u.email
FROM orders o
JOIN users u ON o.user_id = u.id
WHERE o.tenant_id = 42
  AND o.status = 'PAID'
ORDER BY o.created_at DESC
LIMIT 10;
```

What a good tabular plan looks like for this query:

```
id | select_type | table | type   | possible_keys                        | key                          | key_len | ref       | rows  | filtered | Extra
1  | SIMPLE      | o     | ref    | idx_user_id, idx_tenant_status_created | idx_tenant_status_created | 134     | const,const | 45000 | 100.00   | Backward index scan; Using where
1  | SIMPLE      | u     | eq_ref | PRIMARY                              | PRIMARY                      | 8       | o.user_id | 1     | 100.00   | NULL
```

Reading it: `o` uses `idx_tenant_status_created` with `key_len 134`. That is exactly `tenant_id` 4 bytes plus `status` 130 bytes (32*4+2), so the first two columns of the index matched the two equality predicates. Because `status` was an equality match, the third column `created_at` stays sorted, so the optimizer can walk the index backward to satisfy `ORDER BY o.created_at DESC` with no `Using filesort`. Note the `Backward index scan` — MySQL is reading the B-Tree in reverse. The joined table `u` is `eq_ref` on `PRIMARY` with `key_len 8` for the BIGINT, meaning one primary key lookup per outer row. That is the pattern you want.

Case 2 — The same table with a range that breaks sorting. Now the status predicate becomes a range:

```sql
EXPLAIN
SELECT o.id, o.total_cents, o.created_at
FROM orders o
WHERE o.tenant_id = 42
  AND o.status IN ('PAID', 'PROCESSING', 'SHIPPED')
ORDER BY o.created_at DESC
LIMIT 10;
```

```
id | select_type | table | type  | key                          | key_len | rows   | filtered | Extra
1  | SIMPLE      | o     | range | idx_tenant_status_created     | 134     | 120000 | 100.00   | Using index condition; Using filesort
```

`type` drops from `ref` to `range` and `Extra` now shows `Using index condition` plus `Using filesort`. Why? With a single `status` value the entries for `created_at` are globally sorted. With three values the index has three separate ranges — each internally sorted on `created_at`, but not globally. MySQL must collect all matching rows across ranges and then sort. That sort is what you see.

Run it for real and the cost becomes obvious:

```sql
EXPLAIN ANALYZE
SELECT o.id, o.total_cents, o.created_at
FROM orders o
WHERE o.tenant_id = 42
  AND o.status IN ('PAID', 'PROCESSING', 'SHIPPED')
ORDER BY o.created_at DESC
LIMIT 10;
```

```
-> Limit: 10 row(s)  (cost=24150.25 rows=10) (actual time=84.120..84.125 rows=10 loops=1)
    -> Sort: o.created_at DESC, limit input to 10 row(s)  (cost=24150.25 rows=120000) (actual time=84.118..84.121 rows=10 loops=1)
        -> Index range scan on o using idx_tenant_status_created over (tenant_id=42 AND status IN (...))  (cost=12150.25 rows=120000) (actual time=0.082..62.450 rows=118420 loops=1)
```

The range scan read 118,420 rows in 62 milliseconds and the sort took the total to 84 milliseconds just to return 10 rows. Estimates and actuals almost match here because statistics are fresh, but the plan itself is wrong for the ORDER BY.

Fix it by letting the sort column lead and keeping the index covering so InnoDB never touches the table:

```sql
-- Put the sort key before the range column, and cover the SELECT list
ALTER TABLE orders ADD INDEX idx_tenant_created_status_covered
    (tenant_id, created_at, status, total_cents, id);

EXPLAIN ANALYZE
SELECT o.id, o.total_cents, o.created_at
FROM orders o
WHERE o.tenant_id = 42
  AND o.status IN ('PAID', 'PROCESSING', 'SHIPPED')
ORDER BY o.created_at DESC
LIMIT 10;
```

```
-> Limit: 10 row(s)  (cost=1.25 rows=10) (actual time=0.035..0.048 rows=10 loops=1)
    -> Filter: (o.status IN (...))  (cost=1.25 rows=10) (actual time=0.034..0.046 rows=10 loops=1)
        -> Index range scan on o using idx_tenant_created_status_covered over (tenant_id=42) reverse  (cost=1.25 rows=15) (actual time=0.031..0.041 rows=14 loops=1)
```

Now MySQL walks `idx_tenant_created_status_covered` backward for just `tenant_id = 42`, reads 14 index entries in order, filters out 4 that don't match the status set, hits LIMIT 10, and stops. No `Using filesort`, no `Using temporary`, and because `total_cents` and `id` are in the index, `Extra` would show `Using index` for a fully covering read with zero table lookups. Reported time drops from 84 milliseconds to 0.05 milliseconds.

To see the other two formats for teaching:

```sql
-- Tree format shows the iterator shape without running the query
EXPLAIN FORMAT=TREE
SELECT o.id FROM orders o WHERE o.tenant_id = 42 AND o.status = 'PAID';

-- JSON format shows costs you can reason about in code review
EXPLAIN FORMAT=JSON
SELECT o.id FROM orders o WHERE o.tenant_id = 42 AND o.status = 'PAID';
-- Look for "query_cost", "read_cost", "eval_cost" and "used_key_parts" in the JSON output
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is the fundamental difference between `EXPLAIN` and `EXPLAIN ANALYZE`?**

`EXPLAIN` never runs the query. It asks the optimizer to score candidate plans against table and index statistics and prints the winner with estimated `rows`, `filtered`, and cost. Those numbers can be wrong if statistics are stale or data is skewed. `EXPLAIN ANALYZE`, available since MySQL 8.0.18, actually executes the query through InnoDB's Volcano iterators, measures the true time to first and last row, the true row count, and how many times each iterator was looped, then discards the result rows. Use `EXPLAIN` for fast daily checks and `EXPLAIN ANALYZE` when the estimate says fast but reality says slow. Remember that `EXPLAIN ANALYZE` does mutate data if you run it on an UPDATE or DELETE, so never run it on a write in production without a transaction guard.

**Q: How do you use `key_len` to know whether a composite index is fully used?**

Add up the byte width of the columns from the left. An `INT NOT NULL` is 4 bytes. A `BIGINT` is 8. A `DATETIME` is 5 plus 1 if nullable. A `VARCHAR(32) NOT NULL` in `utf8mb4` is 32*4+2 = 130 bytes including the length prefix. Then compare the sum to `key_len`. For `idx_tenant_status_created (tenant_id INT NOT NULL, status VARCHAR(32) NOT NULL, created_at DATETIME NULL)` the full width is 4 + 130 + 6 = 140. If `EXPLAIN` reports `key_len 4`, only `tenant_id` filtered via the index. If it reports `134`, the lookup used `tenant_id` and `status` but not `created_at`. If it reports `140`, all three participated. That arithmetic is how you prove to an interviewer you understand leftmost-prefix behavior, not just that you can name it.

**Q: What is the difference between `type: index` and `type: ALL`, and why is `index` still bad?**

`ALL` is a full clustered table scan — every data page. `index` is a full secondary index scan — every leaf page of one index. `index` is usually a little smaller on disk because secondary index rows are narrower, so it may read fewer bytes than `ALL`. But it is still O(N) on the table. On a 50 million row table, `type: index` still reads 50 million entries and still thrashes buffer pool and CPU. Treat `index` and `ALL` as equally disqualifying for OLTP lookups. You want `const`, `eq_ref`, `ref`, or `range` with a small `rows` count.

**Q: What causes `Using filesort` and `Using temporary`, and how do you fix them?**

`Using filesort` means MySQL cannot return rows in the requested ORDER BY order from an index traversal, so it must collect rows and sort them. The sort fits in `sort_buffer_size` per connection if small, otherwise it spills to disk, but either way it costs CPU and blocks streaming results. Fix it by making a composite index whose equality columns come first, then the ORDER BY columns in the same direction, and keep the range predicate out of the middle of that order. `Using temporary` means MySQL needed an internal temp table for GROUP BY, DISTINCT, or ordering on a non-driving table. Fix it by ensuring GROUP BY or DISTINCT columns are a prefix of a single index, or by reordering joins so the sorted-to table is the driving table, or by removing `DISTINCT` that hides a missing join condition. In both cases, `EXPLAIN FORMAT=TREE` will show you a `Sort` or `Temporary table` iterator where the cost lives.

**Q: What is Index Condition Pushdown and where do you see it?**

Without pushdown, InnoDB uses the index to find row pointers, fetches each full row from the clustered index, and hands it to the server layer to test remaining WHERE conditions. Many full rows are fetched only to be discarded. With Index Condition Pushdown, the server pushes predicates that involve indexed columns down into InnoDB, so InnoDB tests them against the index leaf entry before fetching the table row. If the condition fails, the row fetch is skipped entirely. You see it as `Using index condition` in `Extra`. It is not the same as `Using index`, which means every selected column came from the index alone without any table read.

**Q: Why would the optimizer pick `type: ALL` even though a perfectly good index exists?**

The optimizer does math, not wishes. A secondary index read is not free — each matching index entry typically needs a random I/O lookup back to the clustered index to fetch unincluded columns. If the optimizer estimates that 20 or 30 percent of the table matches, sequential scan of the whole table can be cheaper than millions of random lookups. It will also skip the index if you wrapped the column in a function like `WHERE DATE(created_at) = '2026-08-25'`, if there is an implicit character set or type conversion such as comparing a `utf8mb4` column to a `latin1` literal, if the column is nullable and you query `IS NOT NULL` without help, or if statistics are badly stale and the estimate of selectivity is fiction. In interviews, mention both the threshold reason and the function-wrapping and charset reasons — that shows production experience.

**Q: How do you read join order from `EXPLAIN`, and why does it matter?**

MySQL lists tables top to bottom in the order it will execute the nested loop. The first table is the driving table. The optimizer tries to put the table with the smallest filtered row set first so the loops that follow multiply less work. For each row in the driving table, it does a lookup into the next table. If the first table returns 100,000 rows and the second access is not `eq_ref` or `ref` with a good `key_len`, you multiply to huge cost. You can verify join order by reading the tabular `EXPLAIN` top to bottom or the `EXPLAIN FORMAT=TREE` parent-child nesting. You can force an order with `STRAIGHT_JOIN`, but the better fix is usually `ANALYZE TABLE` to refresh stats or an index on the join key, so the optimizer naturally chooses a small driving set and efficient lookups.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Thinking `possible_keys` means the index was used.** `possible_keys` is just a list of candidates the optimizer glanced at during planning. Only `key` tells you what will run. If `possible_keys` shows your new index but `key` is NULL and `type` is `ALL`, the optimizer looked at it and rejected it. Always read `key` and `type` together. This is the single most common misread in code review.

**Trap 2: Running `EXPLAIN ANALYZE DELETE` or `UPDATE` on production.** Plain `EXPLAIN` is safe everywhere because it never executes. `EXPLAIN ANALYZE` actually runs the statement and only discards the SELECT result. If you run `EXPLAIN ANALYZE DELETE FROM orders WHERE status = 'CANCELLED'` on a live database, those rows are deleted. For writes, wrap it in a transaction you immediately roll back and do it on a replica or staging if you can: `START TRANSACTION; EXPLAIN ANALYZE DELETE ...; ROLLBACK;`. Never trust that protection on the primary during peak writes.

**Trap 3: Panicking about `Using filesort` as if it always means disk I/O.** The name is historical. If the sort payload fits in the per-connection `sort_buffer_size`, it sorts entirely in memory with quicksort. But it is still bad for hot paths because it burns CPU, prevents the server from streaming rows as they are read, and will spill to disk as `Created_tmp_disk_tables` once your data grows past the buffer. Use `EXPLAIN ANALYZE` to see the real `actual time` spent in the `Sort` iterator rather than assuming disaster or dismissing the warning.

**Trap 4: Trusting `rows` and `filtered` as if they were counts, and ignoring estimate drift.** `rows` and `filtered` are opinions based on sampled index pages. On a table with heavy inserts, bulk loads, or large deletes since the last `ANALYZE TABLE`, InnoDB's cached stats drift. The optimizer may estimate `rows: 25` when `EXPLAIN ANALYZE` later shows `rows=118420`. When `EXPLAIN` disagrees with what you know about the data, the next step is not a new index, it is `ANALYZE TABLE orders;` to rebuild histograms, then re-run `EXPLAIN` and compare.

**Trap 5: Cheering when `filtered: 100.00` appears on a full scan.** `filtered: 100.00` on `type: ALL` does not mean selective. It means after scanning every row, nothing extra was filtered. `type: ALL`, `rows: 5000000`, `filtered: 100.00` means MySQL read five million disk rows and sent them all upward. Good `filtered` only helps when the access type is already `ref`, `eq_ref`, or a narrow `range` with a tiny `rows`.

**Trap 6: Breaking composite index order and wondering why `key_len` collapses.** With `idx_tenant_status_created (tenant_id, status, created_at)`, a query that filters `WHERE tenant_id = 42 AND created_at >= '2026-08-01'` leaves `status` out of the middle. B-Tree order then breaks and MySQL can only use `tenant_id`, so `key_len` shows 4 and `created_at` is evaluated as a server-side `Using where` filter across all tenant 42 rows. The fix is either to query the prefix columns in order or to create an index whose order matches the query shape, such as `(tenant_id, created_at)`. Check `key_len` after every new WHERE or ORDER BY to catch this instantly.

**Trap 7: Forgetting that wrapping a column in a function hides the index.** `WHERE YEAR(created_at) = 2026` or `WHERE DATE(created_at) = '2026-08-25'` or a hidden collation conversion like comparing `utf8mb4` to `latin1` prevents the optimizer from using a range on that index. Rewrite to a range on the bare column like `WHERE created_at >= '2026-01-01' AND created_at < '2027-01-01'` and watch `type` move from `ALL` to `range` in `EXPLAIN`.

## 7. Compare With Related Concepts

**`EXPLAIN` versus `EXPLAIN ANALYZE` — preview versus truth.** `EXPLAIN` is cheap, static, and safe on writes. It reads costs and estimates from `INFORMATION_SCHEMA` and InnoDB stats. Output is tabular, tree, or JSON. Use it for rapid iteration while you design indexes. `EXPLAIN ANALYZE` is the truth pass since 8.0.18. It runs the iterators and prints both estimated cost and real time plus true row counts and loop counts. Use it when the quick preview looks healthy but latency does not match. Rule: iterate with `EXPLAIN`, confirm with `EXPLAIN ANALYZE` on SELECTs, and never point the latter at production writes.

**Traditional table versus `FORMAT=TREE` versus `FORMAT=JSON` — same plan, different lenses.** Traditional tabular output is the one you memorize — type, key, key_len, rows, filtered, Extra — ideal for spotting `ALL` or missing key_len in a glance. `FORMAT=TREE` is the physical iterator view the server actually executes, which makes join nesting and sort placement obvious. `FORMAT=JSON` is the machine-readable deep dive with `query_cost`, `read_cost`, `eval_cost`, and `used_key_parts` that you diff in pull requests or log for audit. Use table daily, tree when join order confuses you, JSON when you need to prove cost changed.

**MySQL `EXPLAIN` versus PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` — same job, different dialect.** MySQL frames performance around join types `const`, `eq_ref`, `ref`, `range`, `index`, `ALL` and Extra flags like `Using index` and `Using filesort`. PostgreSQL frames it as node types like `Seq Scan`, `Index Scan`, `Bitmap Index Scan`, `Hash Join`, `Merge Join`, and with `ANALYZE, BUFFERS` it reports shared buffer hits, disk reads, and memory used for sorts and hashes. The trigger is the same: stale statistics mislead cost. In Postgres you run `ANALYZE` and `EXPLAIN (ANALYZE, BUFFERS)`; in MySQL you run `ANALYZE TABLE` and `EXPLAIN ANALYZE`. Learn to translate `Using filesort` to Postgres `Sort` and `Using temporary` to materialization or hash aggregate.

**`EXPLAIN` versus the Slow Query Log — microscope versus security camera.** The slow query log is passive and asynchronous. It records every query that took longer than `long_query_time` or matched `log_queries_not_using_indexes` as production actually ran it. It answers which queries are slow and how often. `EXPLAIN` is active and synchronous. You pick one query and it answers why that query is slow — which table drove the join, which index was skipped, which Extra flag is burning time. The workflow senior engineers follow is log identifies the query fingerprint, then `EXPLAIN` and `EXPLAIN ANALYZE` dissect that fingerprint. `Performance Schema` sits in between, aggregating by digest in `events_statements_summary_by_digest` to show which normalized pattern burns the most total time, rows examined versus rows sent, and temp table counts across the fleet, while `EXPLAIN` zooms into one execution.

## 8. 🧠 The Memory Hook

`EXPLAIN` is the GPS preview, `EXPLAIN ANALYZE` is the drive with a stopwatch — and the real query plan is the drive, not the preview. When you read the table, chant the health check: `type` must beat `ALL` and `index`, `key` must not be NULL, `key_len` must cover your leftmost predicates, `rows` times `filtered` must be small, and `Extra` should show `Using index` and never make you pay `Using filesort` or `Using temporary` on a hot path. If estimate and reality diverge, refresh stats, then fix the index order to match the query order.
