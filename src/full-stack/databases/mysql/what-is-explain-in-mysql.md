# `EXPLAIN` and `EXPLAIN ANALYZE` in MySQL: Execution Plan Anatomy, Join Types, and Performance Diagnostics

## 1. Why This Exists — The Problem First

A reporting query runs in 15 milliseconds on your local laptop against 500 rows of mock data. The feature passes code review, gets merged, and deploys to production. Three days later, database CPU utilization hits 100%, query latency spikes to 45 seconds, connection pools exhaust across every backend pod, and the application starts throwing 504 Gateway Timeouts during peak traffic.

In production, the `orders` table holds 12 million rows and the `users` table holds 2 million rows. Because of an innocuous column type mismatch or an unindexed sort column, the MySQL query optimizer abandoned your secondary indexes and performed a nested-loop full table scan across tens of millions of disk pages. 

When queries crawl in production, developers who guess make things worse: they add random single-column indexes, allocate more RAM to the database instance, or rewrite working SQL into multiple round-trip queries. `EXPLAIN` and `EXPLAIN ANALYZE` exist to eliminate the guesswork. They expose the database engine's internal execution plan, showing you exactly how the optimizer joins tables, which indexes it selects or ignores, how many bytes of a composite index it uses, where it allocates temporary memory buffers, and where every millisecond is spent.

## 2. The Analogy — Make It Obvious

Think of `EXPLAIN` and `EXPLAIN ANALYZE` like planning a road trip with GPS versus driving it with an onboard flight data recorder.

When you type a destination into your GPS app, it calculates an estimated route before your car moves an inch: *"Take Highway 101, merge onto Route 84, distance 35 miles, estimated travel time 42 minutes based on historical speed limits."* 

This estimated route is traditional `EXPLAIN`. It evaluates table statistics, estimates how many cars are on each road segment (`rows`), chooses which roads to take (`key`), and flags potential bottlenecks like toll booths or unpaved detour roads (`Using filesort` or `Using temporary`). But the GPS does not actually drive the car. If real-world road conditions differ from historical averages—such as unexpected flash flooding or stale traffic data—the 42-minute estimate might actually take 4 hours.

`EXPLAIN ANALYZE` is putting a telemetry tracker in the car and actually driving the route. It executes the journey, recording the exact millisecond the car cleared each interchange, how many actual cars were passed versus the estimate, and how many times the car looped around searching for parking. It provides ground-truth runtime verification against the optimizer's initial prediction.

## 3. How It Actually Works — The Full Explanation

When a client sends a SQL query to MySQL, the server passes it through a parser, preprocessor, and cost-based query optimizer before handing it to the storage engine (InnoDB). The optimizer evaluates multiple candidate access paths—calculating estimated I/O and CPU costs using data page and index statistics stored in `mysql.innodb_table_stats` and `mysql.innodb_index_stats`—and selects the plan with the lowest numeric cost.

`EXPLAIN` outputs this selected plan without running the query. Since MySQL 8.0.18, `EXPLAIN ANALYZE` runs the plan through MySQL's Volcano iterator execution engine, measuring real elapsed times, row counts, and loop iterations at every tree node while discarding the final result set.

Understanding an execution plan requires mastering the tabular columns, the join type hierarchy, index prefix lengths, and execution formats.

The critical output columns in a standard tabular `EXPLAIN` return one row for each table referenced in the query:

- `id`: The sequential identifier of the `SELECT` block. Operations with the same `id` are part of the same join stage and execute top-to-bottom. Higher `id` values execute first (such as nested subqueries or derived tables).
- `select_type`: The role of the query block. `SIMPLE` indicates a flat query without subqueries or `UNION`s. `PRIMARY` represents the outermost query block. `DERIVED` represents a subquery inside a `FROM` clause. `SUBQUERY` represents an independent subquery in a `SELECT` or `WHERE` clause. `UNION` represents the second or later statement in a `UNION`.
- `table`: The table name, alias, or temporary derived table identifier (such as `<derived2>`) being accessed.
- `partitions`: The specific table partitions scanned when partition pruning is active.
- `type`: The join access type. This is the single most important column in the output, indicating how InnoDB reads the table.
- `possible_keys`: All candidate indexes the optimizer considered based on query predicates.
- `key`: The specific index the optimizer selected, or `NULL` if no index was used.
- `key_len`: The length in bytes of the chosen key used by MySQL. This reveals the exact prefix depth used in composite indexes.
- `ref`: The constants or columns compared against the chosen index to look up rows.
- `rows`: The optimizer's statistical estimate of how many rows must be examined from this table.
- `filtered`: The estimated percentage of examined rows that will satisfy remaining table predicates. An examined row count of 1,000 with `filtered: 10.00` means the optimizer expects only 100 rows to survive to the next pipeline stage.
- `Extra`: Critical flags detailing sorting mechanisms, index usage, and internal temporary tables.

The join type hierarchy in the `type` column dictates the computational complexity of the access path, ranked from best to worst:

1. `system`: The table has exactly one row (a special system table). Constant-time O(1).
2. `const`: The table has at most one matching row, resolved at the start of the query by matching a `PRIMARY KEY` or unique non-nullable index against constant values (for example, `WHERE id = 105`). O(1) lookup.
3. `eq_ref`: Exactly one row is fetched from this table for each row combination produced by preceding tables, using a `PRIMARY KEY` or unique non-nullable index. This is the most efficient join type for multi-table queries.
4. `ref`: All matching rows are fetched using a non-unique index or index prefix (for example, `WHERE tenant_id = 4` on a secondary index).
5. `fulltext`: The lookup uses a `FULLTEXT` index via `MATCH() AGAINST()`.
6. `ref_or_null`: Similar to `ref`, but InnoDB performs an extra search pass to locate `NULL` values.
7. `index_merge`: The optimizer uses two or more separate single-column indexes on the same table and merges their row pointers (via intersection or union). This frequently signals that a composite index is missing.
8. `unique_subquery` / `index_subquery`: Replaces `IN (SELECT ...)` subqueries with efficient unique or non-unique index lookups.
9. `range`: An index range scan that retrieves rows within specific boundaries using operators like `<`, `>`, `BETWEEN`, `IN()`, or `IS NULL`. The engine traverses the B-Tree root-to-leaf once, then walks the leaf node linked list.
10. `index`: Full Index Scan. The storage engine scans every leaf page of the index B-Tree from beginning to end. It is faster than a full table scan only because secondary index trees are typically smaller in byte size than the clustered table data, but it still reads O(N) index entries.
11. `ALL`: Full Table Scan. The engine scans every data page on disk in the clustered index. This is the slowest access path and causes catastrophic I/O bottlenecks on large datasets.

Decoding `key_len` arithmetic allows you to determine exactly which parts of a composite index are active. To decode it, sum the byte allocations for each data type:

- `TINYINT`: 1 byte (+1 byte if nullable)
- `SMALLINT`: 2 bytes (+1 byte if nullable)
- `INT`: 4 bytes (+1 byte if nullable)
- `BIGINT`: 8 bytes (+1 byte if nullable)
- `DATETIME` (MySQL 5.6.4+): 5 bytes (+1 byte if nullable, + fractional second storage: 1–3 bytes)
- `TIMESTAMP`: 4 bytes (+1 byte if nullable)
- `VARCHAR(N)` with character set `utf8mb4`: `(N * 4) + 2` bytes for the length prefix (+1 byte if nullable)
- `CHAR(N)` with character set `utf8mb4`: `(N * 4)` bytes (+1 byte if nullable)

For a composite index on `(tenant_id INT NOT NULL, status VARCHAR(20) NOT NULL, created_at DATETIME NULL)` using `utf8mb4`:
- `tenant_id` contributes 4 bytes.
- `status` contributes `(20 * 4) + 2 = 82` bytes.
- `created_at` contributes `5 + 1 = 6` bytes.
- Total index length is `4 + 82 + 6 = 92` bytes.

If `EXPLAIN` displays `key_len: 4`, only `tenant_id` is being utilized for index lookup. If it displays `key_len: 86`, the query is matching `tenant_id` and `status`, but not `created_at`.

Decoding critical `Extra` field values provides direct clues to query efficiency:

- `Using index`: Covering Index. The query retrieved all requested columns directly from the secondary index B-Tree leaf pages without performing a secondary lookup into the clustered primary index table.
- `Using index condition` (Index Condition Pushdown - ICP): The storage engine evaluates `WHERE` predicates on index columns directly inside InnoDB before constructing full table rows, drastically reducing storage engine to MySQL server memory transfers and disk I/O.
- `Using where`: The MySQL server layer applies a filter to rows after reading them from the storage engine.
- `Using filesort`: The query requires a sort pass (such as `ORDER BY`) that cannot be satisfied by natural index order. MySQL sorts rows in memory using `sort_buffer_size` or spills sorted runs to temporary files on disk.
- `Using temporary`: MySQL creates an internal memory or disk temporary table to hold intermediate rows during `GROUP BY`, `DISTINCT`, or multi-table sorting operations.
- `Using join buffer (Hash Join / Block Nested Loop)`: Tables are joined without an index on the join key, forcing MySQL to load rows from the driving table into a memory buffer to match against the joined table.

Running `EXPLAIN FORMAT=TREE` displays the physical iterator tree introduced in MySQL 8.0:

```text
-> Filter: (orders.total_amount > 100.00)
    -> Index lookup on orders using idx_tenant_status (tenant_id=1, status='PAID')
```

Running `EXPLAIN FORMAT=JSON` outputs detailed cost calculations, including `query_cost`, `read_cost`, `eval_cost`, `sort_cost`, and memory buffer sizes.

`EXPLAIN ANALYZE` takes the tree format and decorates every node with actual execution statistics:

```text
-> Filter: (orders.total_amount > 100.00)  (cost=12.50 rows=10) (actual time=0.045..0.120 rows=8 loops=1)
    -> Index lookup on orders using idx_tenant_status (tenant_id=1, status='PAID')  (cost=10.25 rows=25) (actual time=0.038..0.095 rows=25 loops=1)
```

The metrics `(actual time=0.045..0.120 rows=8 loops=1)` represent:
- `0.045`: Time in milliseconds to read the first row from this iterator.
- `0.120`: Time in milliseconds to read all rows from this iterator.
- `rows=8`: Total number of rows actually produced by this iterator across all loops.
- `loops=1`: Number of times the parent iterator invoked this child iterator.

## 4. Real Code — See It Working

Let us look at a realistic e-commerce database schema and analyze how query performance changes before and after reading execution plans.

```sql
-- Production schema for orders and order items
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

Suppose we want to fetch the 10 most recent paid orders for tenant 42 along with the customer's email address:

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

Output for this query in standard tabular `EXPLAIN`:

| id | select_type | table | type | possible_keys | key | key_len | ref | rows | filtered | Extra |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | SIMPLE | o | ref | idx_user_id,idx_tenant_status_created | idx_tenant_status_created | 134 | const,const | 45000 | 100.00 | Backward index scan; Using where |
| 1 | SIMPLE | u | eq_ref | PRIMARY | PRIMARY | 8 | o.user_id | 1 | 100.00 | Using where |

Analyzing the execution flow:
1. For table `o` (orders), the optimizer picked `idx_tenant_status_created`.
2. Calculating `key_len`: `tenant_id` (4 bytes) + `status` (`32 * 4 + 2 = 130` bytes) = 134 bytes.
3. Because `status` was matched with equality (`= 'PAID'`), the third index column `created_at` was naturally sorted in B-Tree index order. The optimizer used `Backward index scan` to satisfy `ORDER BY o.created_at DESC` without needing an extra sorting step (`Using filesort` is absent).
4. For table `u` (users), the optimizer matched `u.id` using `type: eq_ref` with `key: PRIMARY` (`key_len: 8`). For every single order row, it does a single O(1) primary key lookup.

Now observe what happens when a developer queries a range of statuses:

```sql
EXPLAIN
SELECT o.id, o.total_cents, o.created_at
FROM orders o
WHERE o.tenant_id = 42
  AND o.status IN ('PAID', 'PROCESSING', 'SHIPPED')
ORDER BY o.created_at DESC
LIMIT 10;
```

Output resulting from the range predicate:

| id | select_type | table | type | possible_keys | key | key_len | ref | rows | filtered | Extra |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | SIMPLE | o | range | idx_tenant_status_created | idx_tenant_status_created | 134 | NULL | 120000 | 100.00 | Using index condition; Using filesort |

Because `status` used an `IN (...)` range condition across three distinct values, the index entries for different statuses are located in separate B-Tree ranges. Within each status value, `created_at` is sorted, but across multiple status values, rows are not in global `created_at` order. The engine must scan all matching index entries, extract them, and perform an in-memory or disk sort (`Using filesort`).

Let us run `EXPLAIN ANALYZE` on this query to see actual execution times:

```sql
EXPLAIN ANALYZE
SELECT o.id, o.total_cents, o.created_at
FROM orders o
WHERE o.tenant_id = 42
  AND o.status IN ('PAID', 'PROCESSING', 'SHIPPED')
ORDER BY o.created_at DESC
LIMIT 10;
```

The resulting iterator tree output shows the exact bottleneck:

```text
-> Limit: 10 row(s)  (cost=24150.25 rows=10) (actual time=84.120..84.125 rows=10 loops=1)
    -> Sort: o.created_at DESC, limit input to 10 row(s)  (cost=24150.25 rows=120000) (actual time=84.118..84.121 rows=10 loops=1)
        -> Index range scan on o using idx_tenant_status_created over (tenant_id = 42 AND status = 'PAID') OR (tenant_id = 42 AND status = 'PROCESSING') OR (tenant_id = 42 AND status = 'SHIPPED'), with index condition: (o.status in ('PAID','PROCESSING','SHIPPED'))  (cost=12150.25 rows=120000) (actual time=0.082..62.450 rows=118420 loops=1)
```

The output proves that the index range scan took 62.4 milliseconds reading 118,420 rows, followed by an 84.1 millisecond sort step just to return 10 rows.

To make this query execute in under 1 millisecond, we reorder the index columns to place the equality and sort keys first, and include `total_cents` to create a covering index:

```sql
-- New covering composite index
ALTER TABLE orders ADD INDEX idx_tenant_created_status_covered (tenant_id, created_at, status, total_cents, id);

EXPLAIN ANALYZE
SELECT o.id, o.total_cents, o.created_at
FROM orders o
WHERE o.tenant_id = 42
  AND o.status IN ('PAID', 'PROCESSING', 'SHIPPED')
ORDER BY o.created_at DESC
LIMIT 10;
```

The new iterator tree output confirms the dramatic improvement:

```text
-> Limit: 10 row(s)  (cost=1.25 rows=10) (actual time=0.035..0.048 rows=10 loops=1)
    -> Filter: (o.status in ('PAID','PROCESSING','SHIPPED'))  (cost=1.25 rows=10) (actual time=0.034..0.046 rows=10 loops=1)
        -> Index range scan on o using idx_tenant_created_status_covered over (tenant_id = 42) reverse  (cost=1.25 rows=15) (actual time=0.031..0.041 rows=14 loops=1)
```

The query now walks `idx_tenant_created_status_covered` in reverse order for `tenant_id = 42`. It reads only 14 index rows, filters out 4 that did not match the status filter, reaches its `LIMIT 10`, and terminates in 0.048 milliseconds. No filesort occurred, and no table data pages were accessed.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the fundamental difference between `EXPLAIN` and `EXPLAIN ANALYZE` in MySQL?**

`EXPLAIN` generates the optimizer's estimated execution plan using catalog and index statistics without running the query. It produces row estimates and cost calculations that may be inaccurate if table statistics are stale. `EXPLAIN ANALYZE` (available in MySQL 8.0.18+) actually executes the query against the database storage engine. It tracks the real-time execution flow through the iterator tree, reporting the actual time to fetch the first and last row at each operator, the actual number of rows processed, and the loop count. Crucially, `EXPLAIN ANALYZE` discards the result set, but it will execute any side effects if run on data-modifying queries.

**Q: How do you use `key_len` to determine if all columns in a composite index are being used?**

`key_len` displays the total byte length of the index prefix used for filtering. To evaluate it, calculate the byte size of each constituent column based on its data type, nullability flag (+1 byte if nullable), and character set length prefix (+2 bytes for variable-length types like `VARCHAR`). Compare the calculated sum against the `key_len` value in `EXPLAIN`. If a composite index consists of `col1 INT NOT NULL` (4 bytes) and `col2 VARCHAR(50) NOT NULL` with `utf8mb4` (202 bytes), a `key_len` of 4 indicates that only `col1` is used for index filtering, while a `key_len` of 206 confirms that both `col1` and `col2` are actively participating in the index lookup.

**Q: What is the difference between `type: index` and `type: ALL`, and why is `type: index` often dangerous?**

`type: ALL` is a full table scan where the storage engine reads all data rows from the clustered index on disk. `type: index` is a full index scan where the storage engine scans all leaf nodes of a secondary index B-Tree from start to finish. `type: index` is technically faster than `type: ALL` because a secondary index contains fewer columns and occupies fewer disk pages than the full table row. However, `type: index` is still an O(N) operation that reads every single indexed entry in the table. On a table with 50 million rows, `type: index` still causes severe disk I/O and memory pressure and should never be considered an optimized access path.

**Q: What causes `Using filesort` and `Using temporary` in the `Extra` column, and how do you resolve them?**

`Using filesort` indicates that MySQL cannot retrieve rows in the order requested by `ORDER BY` directly from an index, requiring a separate sorting pass in memory (`sort_buffer_size`) or on temporary disk files. To fix it, design a composite index that matches the `WHERE` equality columns first, followed immediately by the `ORDER BY` columns in the matching sort direction.

`Using temporary` means MySQL had to create an internal temporary table to perform aggregations (`GROUP BY`), deduplication (`DISTINCT`), or multi-table sorting (sorting on columns from a non-driving join table). To resolve it, ensure all `GROUP BY` or `DISTINCT` columns match a composite index prefix, or ensure the query sorts only by columns belonging to the driving table in the join.

**Q: What is Index Condition Pushdown (ICP), and how does it appear in `EXPLAIN`?**

Index Condition Pushdown is an optimization where the MySQL server pushes the evaluation of `WHERE` predicates involving secondary index columns down to the storage engine (InnoDB). Without ICP, InnoDB uses the index to locate rows, fetches the full clustered table row from disk, and passes it to the MySQL server layer to evaluate the remaining conditions. With ICP, InnoDB evaluates the condition directly against the secondary index leaf node; if the condition fails, it skips reading the full table row entirely. It appears in the `Extra` column as `Using index condition`.

**Q: Why would the MySQL optimizer choose a Full Table Scan (`ALL`) even when a secondary index exists on the filtered column?**

The optimizer chooses a full table scan if it estimates that a secondary index lookup will match a large percentage of the table (typically 15% to 30% or more). Because secondary index scans require a random I/O "bookmark lookup" to the clustered index for each matching row to fetch non-indexed columns, reading 25% of the table via random I/O is mathematically more expensive than scanning 100% of the table sequentially using sequential read-ahead I/O. The optimizer will also ignore an index if the column is wrapped in a function (such as `WHERE DATE(created_at) = '2026-08-25'`), if there is an implicit character set or data type conversion, or if table statistics are severely outdated.

**Q: How do you determine the join order chosen by MySQL, and how does join ordering affect performance?**

In a standard tabular `EXPLAIN`, MySQL lists tables in the exact order it joins them, from top to bottom. The first table listed is the "driving table." MySQL selects the driving table by evaluating which table produces the smallest filtered row set to begin the nested-loop join. For every row in the driving table, MySQL performs a lookup into the next table. If the optimizer chooses a large driving table or fails to use an `eq_ref` lookup on subsequent tables, intermediate row multiplication causes the query to scan millions of unnecessary combinations. You can force a specific join order using `STRAIGHT_JOIN`, though fixing table statistics with `ANALYZE TABLE` or adding foreign key indexes is the preferred long-term solution.

## 6. The Traps — What Goes Wrong

### Trap 1: Assuming `possible_keys` Means the Index Was Used

A common mistake is glancing at `possible_keys`, seeing your newly created index listed, and assuming the query is optimized. `possible_keys` only lists indexes the optimizer considered during query compilation. You must inspect the `key` column to verify which index was actually selected. If `possible_keys` lists an index but `key` is `NULL`, the optimizer rejected your index in favor of a full table scan.

### Trap 2: Running `EXPLAIN ANALYZE` on Mutating Queries

`EXPLAIN` is safe to run on any statement because it never executes the query. However, `EXPLAIN ANALYZE` actually executes the query to collect timing metrics. If you run `EXPLAIN ANALYZE DELETE FROM orders WHERE status = 'CANCELLED'` in a production database, it will permanently delete those records. Always wrap mutating statements in a transaction with an immediate rollback when analyzing DML queries:

```sql
START TRANSACTION;
EXPLAIN ANALYZE DELETE FROM orders WHERE status = 'CANCELLED';
ROLLBACK;
```

### Trap 3: Believing `Using filesort` Always Writes to Disk

Developers often panic when seeing `Using filesort`, assuming the database is performing disk thrashing. In reality, MySQL allocates a memory buffer defined by `sort_buffer_size` per connection. If the sorted payload fits within this buffer, the sort completes entirely in RAM using quicksort. However, `Using filesort` is still an anti-pattern for high-throughput OLTP queries because it consumes CPU, prevents pipelined streaming of result rows to the client, and will spill to temporary disk files (`Created_tmp_disk_tables`) if the payload exceeds the buffer limit.

### Trap 4: Trusting Stale `rows` Estimates Without Checking Statistics

The `rows` and `filtered` values in `EXPLAIN` are statistical estimations based on random index page sampling. If a table undergoes heavy writes, bulk inserts, or large deletions, InnoDB's cached statistics become stale. The optimizer may estimate 10 rows when the actual count is 500,000, leading to disastrous join order decisions. When `EXPLAIN` output defies expectations, run `ANALYZE TABLE table_name;` to rebuild InnoDB index histograms and sample distributions before modifying queries.

### Trap 5: Misinterpreting `filtered: 100.00%` on Full Table Scans

Seeing `filtered: 100.00%` sounds positive, but if the access `type` is `ALL`, it means MySQL examined every single row in the table and every single row matched the filter (or no additional server-level filtering was applied). A query with `type: ALL`, `rows: 5000000`, and `filtered: 100.00%` scanned five million rows off disk. High `filtered` percentages are only good when the underlying access `type` is `ref`, `eq_ref`, or `range` with a small initial `rows` count.

### Trap 6: Missing Prefix Disqualification from Left-to-Right Index Rules

If you have a composite index on `(tenant_id, status, created_at)` and write:

```sql
SELECT * FROM orders 
WHERE tenant_id = 42 
  AND created_at >= '2026-08-01';
```

The optimizer uses the index only for `tenant_id` (`key_len: 4`). Because `status` was omitted from the query, the B-Tree chain is broken, and `created_at` cannot be used as an index range boundary. The query examines every order for tenant 42 and evaluates `created_at` in the server layer.

## 7. Compare With Related Concepts

### `EXPLAIN` vs `EXPLAIN ANALYZE`

| Dimension | `EXPLAIN` | `EXPLAIN ANALYZE` |
| :--- | :--- | :--- |
| **Execution** | Static plan generation; query is not executed | Executes query to completion; discards result set |
| **Data Source** | Optimizer cost model and InnoDB index statistics | Real runtime telemetry from iterator execution engine |
| **Output Format** | Tabular, JSON, or Tree format | Hierarchical Tree format with cost and actual timing |
| **Production Safety** | 100% safe on all `SELECT`, `UPDATE`, `DELETE` queries | Safe for `SELECT`; mutates data on `UPDATE`, `DELETE`, `INSERT` |
| **Primary Use Case** | Quick sanity check for index usage and join order | Deep profiling of slow queries and identifying estimate drift |

### MySQL `EXPLAIN` vs PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)`

MySQL's traditional `EXPLAIN` focuses on join types (`const`, `ref`, `range`, `ALL`) and storage engine flags (`Using index`, `Using filesort`). PostgreSQL's `EXPLAIN` outputs a tree-structured plan by default with explicit node types (`Index Scan`, `Bitmap Index Scan`, `Seq Scan`, `Hash Join`, `Merge Join`). When run with `(ANALYZE, BUFFERS)`, PostgreSQL provides exact shared buffer cache hits, disk read blocks, and memory consumption for sorting hashes, whereas MySQL `EXPLAIN ANALYZE` focuses on iterator time ranges and row loop counts.

### `EXPLAIN` vs MySQL Slow Query Log

The Slow Query Log is a passive, asynchronous diagnostic tool that records executed queries whose total execution time exceeded `long_query_time` or that did not use indexes (`log_queries_not_using_indexes`). It tells you *which* queries are slow in production. `EXPLAIN` is an active, synchronous investigative tool used to analyze *why* a specific query identified by the slow query log is performing poorly.

### `EXPLAIN` vs Performance Schema (`events_statements_summary_by_digest`)

MySQL Performance Schema aggregates execution metrics across normalized query patterns (digests), tracking historical total execution time, lock wait times, rows examined versus rows sent, and temporary table creation counts. Performance Schema provides the macro-level view of which query patterns consume the highest cumulative CPU and I/O across the entire database cluster, while `EXPLAIN` provides the micro-level view of an individual query's internal execution path.

## 8. 🧠 The Memory Hook

`EXPLAIN` is the GPS route preview before you drive; `EXPLAIN ANALYZE` is the stopwatch in the car during the trip. In the tabular output, remember the health checklist: `type` must beat `ALL` and `index`, `key` must be non-null, `key_len` must cover your composite predicates, and `Extra` should celebrate `Using index` while avoiding `Using filesort` and `Using temporary`.
