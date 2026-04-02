# PostgreSQL Interview Question Bank

A curated set of **50 frequently asked PostgreSQL interview questions** covering everything from core internals to production performance tuning. Questions are grouped into thematic sections of five for easy navigation.

---

## Table of Contents

| # | Question |
|---|----------|
| **Group 1 – Architecture & Internals** | |
| 1 | [What is the PostgreSQL process architecture?](#q1) |
| 2 | [How does MVCC work in PostgreSQL?](#q2) |
| 3 | [What are transaction isolation levels in PostgreSQL?](#q3) |
| 4 | [What is the Write-Ahead Log (WAL) and why does it matter?](#q4) |
| 5 | [What is the shared buffer pool and how does it affect performance?](#q5) |
| **Group 2 – Indexing** | |
| 6 | [What index types does PostgreSQL support?](#q6) |
| 7 | [When should you use a B-tree index vs. a GIN index?](#q7) |
| 8 | [What is a GiST index and when is it useful?](#q8) |
| 9 | [What is a BRIN index and when does it outperform B-tree?](#q9) |
| 10 | [What are partial and expression indexes?](#q10) |
| **Group 3 – Query Planning & Optimization** | |
| 11 | [How does the PostgreSQL query planner choose an execution plan?](#q11) |
| 12 | [How do you read and interpret EXPLAIN ANALYZE output?](#q12) |
| 13 | [What are the most important planner cost parameters?](#q13) |
| 14 | [What causes a sequential scan when an index exists?](#q14) |
| 15 | [What are statistics, and how does ANALYZE improve them?](#q15) |
| **Group 4 – Advanced SQL** | |
| 16 | [What are Common Table Expressions (CTEs) and when should you use them?](#q16) |
| 17 | [What are window functions and how do they differ from GROUP BY?](#q17) |
| 18 | [How does LATERAL join work?](#q18) |
| 19 | [What is the difference between UNION and UNION ALL?](#q19) |
| 20 | [How do you perform upserts with INSERT … ON CONFLICT?](#q20) |
| **Group 5 – JSONB & Semi-structured Data** | |
| 21 | [What is the difference between JSON and JSONB in PostgreSQL?](#q21) |
| 22 | [How do you index JSONB columns?](#q22) |
| 23 | [What JSONB operators and functions are most commonly used?](#q23) |
| 24 | [How do you update a nested key inside a JSONB document?](#q24) |
| 25 | [What are the trade-offs of storing data in JSONB vs. normalised tables?](#q25) |
| **Group 6 – Partitioning** | |
| 26 | [What is declarative table partitioning and what strategies are available?](#q26) |
| 27 | [How does partition pruning work?](#q27) |
| 28 | [What is the difference between range and list partitioning?](#q28) |
| 29 | [How do you attach and detach partitions safely in production?](#q29) |
| 30 | [What are the limitations of partitioning in PostgreSQL?](#q30) |
| **Group 7 – Full-Text Search** | |
| 31 | [How does full-text search work in PostgreSQL?](#q31) |
| 32 | [What is a tsvector and a tsquery?](#q32) |
| 33 | [How do you rank full-text search results?](#q33) |
| 34 | [How do you build a performant full-text search system in PostgreSQL?](#q34) |
| 35 | [When should you use pg_trgm instead of tsvector?](#q35) |
| **Group 8 – Vacuum, Autovacuum & Maintenance** | |
| 36 | [Why does PostgreSQL need VACUUM?](#q36) |
| 37 | [What is table bloat and how do you monitor it?](#q37) |
| 38 | [How does autovacuum decide when to run?](#q38) |
| 39 | [What is VACUUM FULL and when should you use it?](#q39) |
| 40 | [What is transaction ID wraparound and how do you prevent it?](#q40) |
| **Group 9 – Replication & High Availability** | |
| 41 | [What types of replication does PostgreSQL support?](#q41) |
| 42 | [What is streaming replication and how does it work?](#q42) |
| 43 | [What is logical replication and how does it differ from physical replication?](#q43) |
| 44 | [What is replication lag and how do you monitor and reduce it?](#q44) |
| 45 | [What is the role of synchronous_commit and what are the trade-offs?](#q45) |
| **Group 10 – Extensions & Ecosystem** | |
| 46 | [What are the most important PostgreSQL extensions?](#q46) |
| 47 | [How does pg_stat_statements help performance tuning?](#q47) |
| 48 | [What is the difference between schemas and databases in PostgreSQL?](#q48) |
| 49 | [How do row-level security (RLS) policies work?](#q49) |
| 50 | [How do you design a connection-pooling strategy with PgBouncer?](#q50) |

---

## Group 1 – Architecture & Internals

### Q1: What is the PostgreSQL process architecture? {#q1}

**Answer summary:** PostgreSQL uses a multi-process model where each client connection spawns a dedicated backend process. Core background processes handle I/O, checkpointing, vacuuming, and WAL archiving.

**Details:**
- **Postmaster** is the supervisor process; it accepts connections and forks backend workers.
- Each **backend process** handles exactly one client session — no shared memory for query state between backends.
- Key background processes: `checkpointer`, `bgwriter`, `walwriter`, `autovacuum launcher`, `stats collector`, `archiver`.
- Shared memory (shared buffers, WAL buffers, lock tables) is the main communication channel between processes.

**Interview takeaway:** Unlike MySQL's thread-per-connection model, PostgreSQL's process model offers better isolation but higher per-connection overhead — which is why connection poolers like PgBouncer are essential at scale.

---

### Q2: How does MVCC work in PostgreSQL? {#q2}

**Answer summary:** Multi-Version Concurrency Control keeps multiple physical versions of each row so readers never block writers and vice versa.

**Details:**
Each row has hidden system columns:
- `xmin` — transaction ID that inserted this row version.
- `xmax` — transaction ID that deleted/updated it (0 if still live).

When a row is updated, the old version is left in place with `xmax` set; the new version is inserted with a new `xmin`. A transaction sees a row if its snapshot's visibility rules deem the version "live" at snapshot time.

**Example:**
```sql
-- Inspect the hidden columns for a table
SELECT xmin, xmax, * FROM orders WHERE id = 42;
```

**Pitfalls:**
- Dead row versions accumulate and must be reclaimed by VACUUM. High update/delete workloads without adequate vacuuming leads to table bloat.
- Long-running transactions prevent VACUUM from cleaning dead rows because older snapshots might still need them.

---

### Q3: What are transaction isolation levels in PostgreSQL? {#q3}

**Answer summary:** PostgreSQL implements four SQL standard isolation levels, though its MVCC engine gives stronger-than-specified guarantees for some.

| Level | Dirty Read | Non-Repeatable Read | Phantom Read | Serialization Anomaly |
|---|---|---|---|---|
| Read Uncommitted | Not possible* | Possible | Possible | Possible |
| Read Committed (default) | Not possible | Possible | Possible | Possible |
| Repeatable Read | Not possible | Not possible | Not possible* | Possible |
| Serializable | Not possible | Not possible | Not possible | Not possible |

\* PostgreSQL does not allow dirty reads even at Read Uncommitted. Repeatable Read also prevents phantoms.

**Example:**
```sql
BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM accounts WHERE id = 1; -- snapshot taken here
-- Another session updates the balance; this session still sees the old value
SELECT balance FROM accounts WHERE id = 1; -- same result
COMMIT;
```

**Interview takeaway:** `SERIALIZABLE` uses Serializable Snapshot Isolation (SSI), which detects anomalies at commit time and rolls back conflicting transactions rather than using range locks.

---

### Q4: What is the Write-Ahead Log (WAL) and why does it matter? {#q4}

**Answer summary:** WAL ensures durability and crash recovery by writing changes to a sequential log *before* the actual data pages are flushed to disk.

**Details:**
- Every change is first recorded as a WAL record; the corresponding heap/index page is modified in shared buffers and eventually written to disk asynchronously.
- On crash, PostgreSQL replays WAL from the last checkpoint to restore consistency.
- WAL is also the foundation for streaming and logical replication.
- WAL files live in `pg_wal/` and are segmented (default 16 MB each).

**Key parameters:**
```
wal_level          = replica | logical
wal_buffers        = 64MB      -- increase for write-heavy workloads
checkpoint_timeout = 5min
max_wal_size       = 1GB
```

**Interview takeaway:** Understanding WAL is prerequisite to understanding replication, point-in-time recovery (PITR), and `fsync` trade-offs.

---

### Q5: What is the shared buffer pool and how does it affect performance? {#q5}

**Answer summary:** `shared_buffers` is PostgreSQL's in-process page cache. Increasing it reduces disk I/O by keeping hot pages in memory.

**Details:**
- Default is 128 MB; the common recommendation for a dedicated database server is 25% of RAM.
- PostgreSQL also relies on the OS page cache. Doubling up (both in `shared_buffers` and OS cache) is normal but wasteful if `shared_buffers` is too large.
- `effective_cache_size` tells the planner how much memory is available for caching (including OS cache) without actually allocating it.

**Example:**
```sql
-- Check cache hit ratio (aim for > 99%)
SELECT
  sum(heap_blks_read)  AS heap_read,
  sum(heap_blks_hit)   AS heap_hit,
  round(100.0 * sum(heap_blks_hit) /
    nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) AS cache_hit_ratio
FROM pg_statio_user_tables;
```

**Pitfall:** Setting `shared_buffers` too high can cause OOM on the OS level because PostgreSQL needs additional memory for sort operations, work memory, connections, etc.

---

## Group 2 – Indexing

### Q6: What index types does PostgreSQL support? {#q6}

**Answer summary:** PostgreSQL ships with B-tree (default), Hash, GiST, SP-GiST, GIN, and BRIN. Each is optimised for a different data shape or query pattern.

| Type | Best for |
|---|---|
| B-tree | Equality, range, sorting on scalars |
| Hash | Equality-only lookups (no range, no sort) |
| GiST | Geometric types, full-text (tsvector), range types |
| SP-GiST | Non-balanced trees: IP prefixes, points |
| GIN | Multi-valued columns: arrays, JSONB, tsvector |
| BRIN | Very large, naturally ordered tables (e.g., time-series) |

**Example:**
```sql
CREATE INDEX idx_name_btree  ON employees (last_name);
CREATE INDEX idx_tags_gin    ON articles  USING GIN  (tags);
CREATE INDEX idx_created_brin ON events   USING BRIN (created_at);
```

**Interview takeaway:** Choosing the wrong index type is a common mistake. GIN is almost always better than B-tree for JSONB key searches and array containment.

---

### Q7: When should you use a B-tree index vs. a GIN index? {#q7}

**Answer summary:** Use B-tree for single-value columns queried with `=`, `<`, `>`, `BETWEEN`, or `ORDER BY`. Use GIN for multi-valued data (arrays, JSONB, `tsvector`) queried with containment or membership operators.

**Details:**
- B-tree is the default and works well for most scalar columns.
- GIN stores a posting list per element, making it efficient for `@>` (contains), `&&` (overlaps), and `@@` (FTS match).
- GIN indexes are larger and slower to update than B-tree, but dramatically faster for membership queries on multi-valued data.

**Example:**
```sql
-- GIN for JSONB containment
CREATE INDEX idx_meta_gin ON products USING GIN (metadata);
SELECT * FROM products WHERE metadata @> '{"color": "red"}';

-- B-tree for range on a scalar
CREATE INDEX idx_price ON products (price);
SELECT * FROM products WHERE price BETWEEN 10 AND 50;
```

**Pitfall:** Using a B-tree on a JSONB column and then querying with `@>` will not use the index. You must use GIN.

---

### Q8: What is a GiST index and when is it useful? {#q8}

**Answer summary:** Generalized Search Tree (GiST) is a flexible framework for building custom index access methods. PostgreSQL uses it for geometric types, range types, and as an alternative for `tsvector`.

**Details:**
- GiST supports lossy storage (false positives possible; a recheck is performed on the heap).
- Excellent for PostGIS spatial queries (`&&`, `<->` distance operators).
- Supports `EXCLUDE` constraints (e.g., no overlapping booking periods).

**Example:**
```sql
-- Exclusion constraint with GiST to prevent overlapping reservations
CREATE TABLE reservations (
  room_id  INT,
  during   TSRANGE,
  EXCLUDE USING GIST (room_id WITH =, during WITH &&)
);
```

**Interview takeaway:** GiST is the backbone of PostGIS. If your application does geospatial work, understanding GiST is mandatory.

---

### Q9: What is a BRIN index and when does it outperform B-tree? {#q9}

**Answer summary:** Block Range INdex stores min/max summaries per range of physical pages. It is tiny in size and very fast to build, but only useful when the indexed column is strongly correlated with physical storage order.

**Details:**
- A BRIN index on 1 billion rows can be under 1 MB; an equivalent B-tree would be gigabytes.
- Ideal for append-only tables like IoT sensor readings, logs, or event streams ordered by `created_at`.
- The planner uses BRIN to skip entire block ranges, effectively doing a smarter sequential scan.

**Example:**
```sql
CREATE INDEX idx_ts_brin ON sensor_readings USING BRIN (recorded_at)
  WITH (pages_per_range = 128);
```

**Pitfall:** BRIN gives no benefit when rows are inserted in random order relative to the indexed column. Always check correlation with `pg_stats.correlation`.

---

### Q10: What are partial and expression indexes? {#q10}

**Answer summary:** A **partial index** only indexes rows matching a `WHERE` predicate. An **expression index** indexes a computed value rather than a raw column.

**Details:**
- Partial indexes reduce index size and maintenance cost while accelerating specific query patterns.
- Expression indexes allow the planner to use an index on `lower(email)` for case-insensitive lookups.

**Example:**
```sql
-- Partial index: only index active, unshipped orders
CREATE INDEX idx_pending_orders
  ON orders (created_at)
  WHERE status = 'pending' AND shipped = false;

-- Expression index for case-insensitive email lookups
CREATE INDEX idx_email_lower ON users (lower(email));

-- Query that uses the expression index
SELECT * FROM users WHERE lower(email) = 'alice@example.com';
```

**Interview takeaway:** Partial indexes are one of the highest-ROI optimizations available — they're smaller, faster to update, and often hit a fraction of the table. Always check if the `WHERE` clause in your query can be encoded in the index definition.

---

## Group 3 – Query Planning & Optimization

### Q11: How does the PostgreSQL query planner choose an execution plan? {#q11}

**Answer summary:** The planner enumerates candidate plans, estimates their cost using statistics from `pg_statistic`, and selects the lowest-cost plan.

**Details:**
1. **Parse** — SQL → parse tree.
2. **Rewrite** — apply rules and views.
3. **Plan/Optimize** — generate candidate plans, estimate rows and costs, pick the cheapest.
4. **Execute** — run the chosen plan.

Cost estimates use `seq_page_cost`, `random_page_cost`, `cpu_tuple_cost`, etc. Row estimates come from `pg_statistic` (histogram bounds, MCV lists, correlation).

**Interview takeaway:** When `EXPLAIN` shows a bad plan, the root cause is almost always stale or insufficient statistics. Run `ANALYZE` first, then consider adjusting `statistics` targets or planner cost parameters.

---

### Q12: How do you read and interpret EXPLAIN ANALYZE output? {#q12}

**Answer summary:** `EXPLAIN ANALYZE` executes the query and shows actual vs. estimated rows, actual time, and node-level costs, revealing where estimates are wrong and where time is spent.

**Example:**
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.id, c.name
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'pending';
```

**Key fields to read:**
- `rows=X` (estimate) vs. `actual rows=Y` — large divergence signals bad statistics.
- `actual time=a..b` — startup time vs. total time per node.
- `Buffers: shared hit=X read=Y` — cache hits vs. disk reads.
- `loops=N` — node executed N times (common in nested loop joins).

**Pitfalls:**
- `EXPLAIN` without `ANALYZE` shows only estimates; the plan is not executed.
- Nested loop nodes report time *per loop* — multiply by `loops` for the true total.

---

### Q13: What are the most important planner cost parameters? {#q13}

**Answer summary:** Planner cost parameters translate physical I/O and CPU operations into a dimensionless "cost" unit. Wrong defaults lead to suboptimal plan choices.

| Parameter | Default | Tune when |
|---|---|---|
| `seq_page_cost` | 1.0 | Baseline; rarely changed |
| `random_page_cost` | 4.0 | Lower to 1.1–2.0 on SSDs |
| `cpu_tuple_cost` | 0.01 | Increase on CPU-bound systems |
| `effective_cache_size` | 4GB | Set to OS free + shared_buffers |
| `work_mem` | 4MB | Increase to avoid spilling sorts/hashes to disk |

**Example:**
```sql
-- Per-session override for an expensive analytics query
SET work_mem = '256MB';
SET random_page_cost = 1.1;
```

**Interview takeaway:** On modern NVMe SSDs, `random_page_cost` should be close to `seq_page_cost`. Leaving it at 4.0 on SSD causes the planner to prefer sequential scans and merge joins over index scans and hash joins unnecessarily.

---

### Q14: What causes a sequential scan when an index exists? {#q14}

**Answer summary:** The planner chooses a sequential scan when it estimates that fetching a large fraction of the table makes random I/O via the index more expensive than a linear sweep.

**Common reasons:**
1. **High selectivity estimate** — planner thinks many rows match; statistics are outdated.
2. **`random_page_cost` too high** — makes index scans look expensive.
3. **Small table** — seq scan fits in a few pages; index overhead isn't worth it.
4. **Missing or wrong statistics** — run `ANALYZE`.
5. **Function wrapping the column** — `WHERE upper(name) = 'BOB'` won't use an index on `name`; create an expression index.
6. **Type mismatch** — `WHERE id = '42'` (text literal on int column) may force a cast.

**Example:**
```sql
-- Force the planner to use an index to compare plans
SET enable_seqscan = off;
EXPLAIN ANALYZE SELECT * FROM large_table WHERE status = 'active';
SET enable_seqscan = on;  -- always reset after testing
```

**Pitfall:** Never disable planner switches in production — use them only to diagnose alternatives.

---

### Q15: What are statistics, and how does ANALYZE improve them? {#q15}

**Answer summary:** Statistics are row-count estimates and column value distributions stored in `pg_statistic`, used by the planner for cost estimation. `ANALYZE` samples the table and updates these statistics.

**Details:**
- Each column gets: `null_frac`, `avg_width`, `n_distinct`, Most Common Values (MCV) list, and a histogram.
- Default statistics target is 100 samples; increase for skewed or large tables.
- `pg_stats` is a user-readable view over `pg_statistic`.

**Example:**
```sql
-- Raise statistics target for a high-cardinality column
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 500;
ANALYZE orders;

-- Inspect the statistics
SELECT attname, n_distinct, most_common_vals, histogram_bounds
FROM pg_stats
WHERE tablename = 'orders' AND attname = 'status';
```

**Interview takeaway:** Autovacuum runs `ANALYZE` automatically, but after bulk loads or large deletes, run it manually before executing expensive queries.

---

## Group 4 – Advanced SQL

### Q16: What are Common Table Expressions (CTEs) and when should you use them? {#q16}

**Answer summary:** CTEs (`WITH` clauses) give a named subquery scope within a statement. They improve readability and enable recursive queries.

**Details:**
- In PostgreSQL ≤ 11, CTEs are **optimization fences** — the planner cannot push predicates into them.
- From PostgreSQL 12+, non-recursive, non-data-modifying CTEs are inlined by default (use `MATERIALIZED` to force the old behavior).
- Recursive CTEs use `WITH RECURSIVE` and require a base case + recursive term.

**Example:**
```sql
-- Recursive CTE: org-chart traversal
WITH RECURSIVE org_tree AS (
  SELECT id, name, manager_id, 1 AS depth
  FROM employees WHERE manager_id IS NULL        -- root
  UNION ALL
  SELECT e.id, e.name, e.manager_id, ot.depth + 1
  FROM employees e
  JOIN org_tree ot ON e.manager_id = ot.id
)
SELECT * FROM org_tree ORDER BY depth, name;
```

**Pitfall:** In PG ≤ 11, wrapping a CTE around a subquery you intend to be pushed into a join prevents index use. Either inline the subquery or upgrade.

---

### Q17: What are window functions and how do they differ from GROUP BY? {#q17}

**Answer summary:** Window functions compute an aggregate-style value over a set of rows related to the current row, *without* collapsing rows into groups.

**Details:**
- Syntax: `function() OVER (PARTITION BY … ORDER BY … ROWS/RANGE …)`
- Common functions: `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `LAG`, `LEAD`, `FIRST_VALUE`, `LAST_VALUE`, `SUM`, `AVG`.
- `GROUP BY` reduces N rows to one row per group; window functions leave all rows in the result.

**Example:**
```sql
-- Running total and rank within each department
SELECT
  employee_id,
  department,
  salary,
  SUM(salary) OVER (PARTITION BY department ORDER BY hire_date) AS running_total,
  RANK()      OVER (PARTITION BY department ORDER BY salary DESC) AS pay_rank
FROM employees;
```

**Interview takeaway:** Window functions are evaluated *after* `WHERE` and `GROUP BY` but *before* `ORDER BY` and `LIMIT`. You cannot filter on a window function result in the same query — wrap it in a subquery or CTE.

---

### Q18: How does LATERAL join work? {#q18}

**Answer summary:** `LATERAL` allows a subquery in the `FROM` clause to reference columns from preceding tables in the same `FROM` list, effectively acting like a correlated subquery that produces a table result.

**Example:**
```sql
-- Return the 3 most recent orders for each customer
SELECT c.id, c.name, recent.order_id, recent.created_at
FROM customers c
JOIN LATERAL (
  SELECT order_id, created_at
  FROM orders
  WHERE customer_id = c.id       -- references c.id from outer FROM
  ORDER BY created_at DESC
  LIMIT 3
) recent ON true;
```

**When to use it:**
- Top-N per group without window functions.
- Calling set-returning functions per row (e.g., `unnest`, `json_array_elements`).
- Parameterizing a subquery with values from another table.

**Pitfall:** `LATERAL` with `JOIN` (not `LEFT JOIN LATERAL`) will silently drop customers with no orders. Use `LEFT JOIN LATERAL … ON true` to keep all outer rows.

---

### Q19: What is the difference between UNION and UNION ALL? {#q19}

**Answer summary:** `UNION` deduplicates rows (sorts + hashes); `UNION ALL` appends results as-is. Always prefer `UNION ALL` when duplicates are impossible or acceptable.

**Example:**
```sql
-- UNION ALL is faster; use when sets are known to be disjoint
SELECT id FROM active_users
UNION ALL
SELECT id FROM archived_users;

-- UNION deduplicates — incurs a sort/hash operation
SELECT tag FROM article_tags
UNION
SELECT tag FROM product_tags;
```

**Performance impact:** `UNION` implicitly applies `DISTINCT` across the combined result set, adding a sort or hash-aggregate step proportional to the total row count.

**Pitfall:** Using `UNION` "just to be safe" on large result sets is a common performance mistake. Profile with `EXPLAIN` if uncertain.

---

### Q20: How do you perform upserts with INSERT … ON CONFLICT? {#q20}

**Answer summary:** PostgreSQL's `ON CONFLICT` clause handles insert-or-update (upsert) atomically without the race conditions of application-level check-then-insert.

**Example:**
```sql
-- Insert or update email if username already exists
INSERT INTO users (username, email, updated_at)
VALUES ('alice', 'alice@new.com', now())
ON CONFLICT (username) DO UPDATE
  SET email      = EXCLUDED.email,
      updated_at = EXCLUDED.updated_at
WHERE users.email <> EXCLUDED.email;  -- only update if changed

-- Silently skip on conflict
INSERT INTO event_log (event_id, payload)
VALUES (123, '{"type":"click"}')
ON CONFLICT (event_id) DO NOTHING;
```

**Details:**
- `EXCLUDED` refers to the row that was proposed for insertion.
- The conflict target must match an existing unique constraint or unique index.
- Wrap in a transaction if you need to combine with other DML atomically.

**Interview takeaway:** Unlike the older `INSERT … SELECT … WHERE NOT EXISTS` pattern, `ON CONFLICT` is atomic under concurrent load.

---

## Group 5 – JSONB & Semi-structured Data

### Q21: What is the difference between JSON and JSONB in PostgreSQL? {#q21}

**Answer summary:** `JSON` stores the raw text verbatim; `JSONB` stores a parsed binary representation that supports indexing and is faster to query. Always prefer `JSONB` unless you need exact whitespace/key-order preservation.

| Feature | JSON | JSONB |
|---|---|---|
| Storage | Raw text | Binary decomposed |
| Input speed | Faster | Slower (parsing) |
| Query speed | Slower (re-parse) | Faster |
| Indexable | No | Yes (GIN, expression) |
| Key order preserved | Yes | No |
| Duplicate keys | Preserved (last wins on read) | Deduplicated |

**Interview takeaway:** In almost every production use case, use `JSONB`. The only reason to use `JSON` is if downstream consumers require exact key ordering or duplicate key preservation.

---

### Q22: How do you index JSONB columns? {#q22}

**Answer summary:** Use a GIN index for general containment/key-existence queries. Use an expression B-tree index for repeated access to a specific key.

**Example:**
```sql
-- Full GIN index: supports @>, ?, ?|, ?&
CREATE INDEX idx_data_gin ON events USING GIN (data);

-- jsonb_path_ops: smaller index, only supports @>
CREATE INDEX idx_data_path ON events USING GIN (data jsonb_path_ops);

-- Expression B-tree on a specific key
CREATE INDEX idx_event_type ON events ((data->>'type'));

-- Query that uses the expression index
SELECT * FROM events WHERE data->>'type' = 'purchase';
```

**`jsonb_path_ops` vs default:**
- Default GIN supports `@>`, `?`, `?|`, `?&`.
- `jsonb_path_ops` only supports `@>` but produces a 2–3x smaller index.

---

### Q23: What JSONB operators and functions are most commonly used? {#q23}

**Answer summary:** The core operators for navigation and containment are `->`, `->>`, `#>`, `#>>`, `@>`, `?`, `||`, and `-`.

| Operator | Returns | Example |
|---|---|---|
| `->` | JSONB sub-value | `data->'address'` |
| `->>` | Text sub-value | `data->>'name'` |
| `#>` | JSONB at path array | `data#>'{addr,city}'` |
| `#>>` | Text at path array | `data#>>'{addr,city}'` |
| `@>` | Contains? | `data @> '{"role":"admin"}'` |
| `?` | Key exists? | `data ? 'email'` |
| `\|\|` | Merge/concat | `data \|\| '{"active":true}'` |
| `-` | Remove key | `data - 'password'` |

**Example:**
```sql
SELECT data->>'name', data#>>'{address,city}'
FROM users
WHERE data @> '{"role": "admin"}' AND data ? 'phone';
```

---

### Q24: How do you update a nested key inside a JSONB document? {#q24}

**Answer summary:** Use `jsonb_set()` to surgically update a nested key, or the `||` operator to merge top-level keys.

**Example:**
```sql
-- Update a nested key: profile.settings.theme = 'dark'
UPDATE users
SET profile = jsonb_set(profile, '{settings,theme}', '"dark"', true)
WHERE id = 42;

-- Merge top-level keys (upserts existing keys, adds new ones)
UPDATE users
SET profile = profile || '{"last_login": "2024-01-15"}'
WHERE id = 42;

-- Remove a nested key
UPDATE users
SET profile = profile #- '{settings,deprecated_flag}'
WHERE id = 42;
```

**Pitfall:** `jsonb_set` with a non-existent path will only create it if the 4th argument (`create_missing`) is `true`. Without it, the update silently does nothing for missing paths.

---

### Q25: What are the trade-offs of storing data in JSONB vs. normalised tables? {#q25}

**Answer summary:** JSONB offers schema flexibility and avoids ALTER TABLE migrations but sacrifices referential integrity, join performance, and type safety.

| Concern | Normalised tables | JSONB |
|---|---|---|
| Schema enforcement | Strict (DDL) | None (app-level) |
| Foreign keys | Supported | Not supported |
| Query ergonomics | Clean SQL | More verbose operators |
| Index efficiency | B-tree per column | GIN over entire doc |
| Partial updates | Efficient | Rewrites entire cell |
| Evolving schema | Requires migration | Free |

**Best practice:** Use normalised columns for frequently queried, typed attributes (IDs, dates, amounts). Use JSONB for optional, varying, or user-defined attributes that would otherwise require EAV tables or dozens of nullable columns.

---

## Group 6 – Partitioning

### Q26: What is declarative table partitioning and what strategies are available? {#q26}

**Answer summary:** Declarative partitioning (introduced in PG 10) lets you split a table's data across child tables automatically. PostgreSQL supports RANGE, LIST, and HASH strategies.

**Example:**
```sql
-- Range partition by month
CREATE TABLE measurements (
  sensor_id   INT,
  recorded_at TIMESTAMPTZ,
  value       NUMERIC
) PARTITION BY RANGE (recorded_at);

CREATE TABLE measurements_2024_01
  PARTITION OF measurements
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE measurements_2024_02
  PARTITION OF measurements
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
```

**When to partition:**
- Tables exceeding hundreds of millions of rows.
- Need to bulk-drop old data (detach + drop is instant vs. `DELETE`).
- Partition pruning can eliminate most partitions from a query.

---

### Q27: How does partition pruning work? {#q27}

**Answer summary:** The planner (and executor for dynamic cases) eliminates partitions whose ranges/lists cannot satisfy the query's WHERE clause, scanning only relevant child tables.

**Details:**
- **Static pruning** happens at plan time when the predicate is a constant.
- **Dynamic pruning** (PG 11+) happens at execution time for parameterised queries.
- Enable with `enable_partition_pruning = on` (default).

**Example:**
```sql
-- With partition key in WHERE, only the 2024-01 partition is scanned
EXPLAIN SELECT * FROM measurements
WHERE recorded_at >= '2024-01-01' AND recorded_at < '2024-02-01';
-- Output: "Append -> Seq Scan on measurements_2024_01"
```

**Pitfall:** Pruning only works if the partition key column appears directly in the WHERE clause. Wrapping it in a function (`date_trunc('month', recorded_at)`) disables pruning.

---

### Q28: What is the difference between range and list partitioning? {#q28}

**Answer summary:** Range partitioning assigns rows to partitions by a continuous range of values (dates, IDs). List partitioning maps discrete values to specific partitions.

- **Range:** Best for time-series, sequential IDs, numeric bands.
- **List:** Best for categorical data with a known, finite set of values (region, status, tenant ID).
- **Hash:** Best for even distribution without a natural ordering key.

**Example:**
```sql
-- List partition by region
CREATE TABLE orders (
  id INT, region TEXT, amount NUMERIC
) PARTITION BY LIST (region);

CREATE TABLE orders_us   PARTITION OF orders FOR VALUES IN ('US', 'CA');
CREATE TABLE orders_eu   PARTITION OF orders FOR VALUES IN ('DE', 'FR', 'GB');
CREATE TABLE orders_apac PARTITION OF orders FOR VALUES IN ('JP', 'AU', 'SG');
```

**Pitfall:** List partitioning requires a `DEFAULT` partition or explicit mapping for every value; otherwise `INSERT` fails for an unmapped value.

---

### Q29: How do you attach and detach partitions safely in production? {#q29}

**Answer summary:** Use `ATTACH PARTITION` and `DETACH PARTITION` to add or remove partitions. In PG 14+, `DETACH PARTITION … CONCURRENTLY` avoids long locks.

**Example:**
```sql
-- Prepare new partition before attaching (avoids lock contention)
CREATE TABLE measurements_2024_03 (LIKE measurements INCLUDING ALL);

-- Attach (takes a brief ShareUpdateExclusiveLock)
ALTER TABLE measurements
  ATTACH PARTITION measurements_2024_03
  FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

-- Non-blocking detach (PG 14+)
ALTER TABLE measurements
  DETACH PARTITION measurements_2023_01 CONCURRENTLY;

-- Instantly drop the old data
DROP TABLE measurements_2023_01;
```

**Interview takeaway:** Bulk data deletion via detach + drop is orders of magnitude faster than `DELETE` because it avoids generating dead tuples and WAL for every row.

---

### Q30: What are the limitations of partitioning in PostgreSQL? {#q30}

**Answer summary:** Partitioning improves certain workloads dramatically but comes with real trade-offs and constraints.

**Key limitations:**
1. **Unique indexes must include the partition key** — global unique constraints across all partitions are not supported.
2. **Foreign keys cannot reference partitioned tables** (as of PG 16; partial support still evolving).
3. **INSERT routing overhead** — each insert must evaluate which partition to target.
4. **Query planning overhead** — with hundreds of partitions, planning time grows linearly.
5. **Partition pruning requires direct comparison** — functions on the partition key disable it.
6. **No row-level triggers on the parent** directly — use partition-level triggers.

**Interview takeaway:** Partition counts above ~1000 can cause planning-time regressions. Use sub-partitioning or reconsider the partition granularity.

---

## Group 7 – Full-Text Search

### Q31: How does full-text search work in PostgreSQL? {#q31}

**Answer summary:** PostgreSQL's FTS converts documents into `tsvector` (a sorted list of normalised lexemes) and queries into `tsquery`, then uses the `@@` operator to match them.

**Pipeline:**
1. Parse document → tokens.
2. Normalise tokens (lowercase, stem) using a text search configuration (e.g., `english`).
3. Store as `tsvector`.
4. Convert search phrase to `tsquery`.
5. Match with `@@`.

**Example:**
```sql
-- Ad-hoc query
SELECT title
FROM articles
WHERE to_tsvector('english', title || ' ' || body) @@
      to_tsquery('english', 'postgresql & index');

-- Using a stored tsvector column for performance
ALTER TABLE articles ADD COLUMN fts_doc TSVECTOR;
UPDATE articles SET fts_doc = to_tsvector('english', title || ' ' || body);
CREATE INDEX idx_fts ON articles USING GIN (fts_doc);
```

---

### Q32: What is a tsvector and a tsquery? {#q32}

**Answer summary:** `tsvector` is a pre-processed document representation; `tsquery` is a parsed search expression. Together they power FTS matching.

**Details:**
- `tsvector`: `'cat':1 'dog':3 'jump':2` — each lexeme with its position(s).
- `tsquery`: Boolean expressions — `'cat' & 'dog'`, `'cat' | 'dog'`, `!'cat'`, `'jump':*` (prefix).
- `phraseto_tsquery` preserves word order and matches only consecutive terms.

**Example:**
```sql
SELECT to_tsvector('english', 'The quick brown fox jumps');
-- 'brown':3 'fox':4 'jump':5 'quick':2
-- Stop words ('The') are removed; 'jumps' is stemmed to 'jump'

SELECT to_tsvector('english', 'The quick brown fox jumps') @@
       to_tsquery('english', 'jump & fox');
-- true
```

---

### Q33: How do you rank full-text search results? {#q33}

**Answer summary:** Use `ts_rank()` or `ts_rank_cd()` to assign a relevance score based on lexeme frequency and position, then `ORDER BY` the score.

**Example:**
```sql
SELECT
  title,
  ts_rank(fts_doc, query)         AS rank,
  ts_headline('english', body, query,
    'MaxWords=35, MinWords=15')   AS snippet
FROM
  articles,
  to_tsquery('english', 'postgresql & performance') query
WHERE fts_doc @@ query
ORDER BY rank DESC
LIMIT 20;
```

**`ts_rank` vs `ts_rank_cd`:**
- `ts_rank` uses lexeme frequency.
- `ts_rank_cd` (cover density) considers proximity of matching terms; often more relevant for multi-word queries.

**Pitfall:** Ranking is computed for every matched row. For high-traffic search, materialise the `tsvector` column and consider a covering index.

---

### Q34: How do you build a performant full-text search system in PostgreSQL? {#q34}

**Answer summary:** Store a `tsvector` in a dedicated generated column and index it with GIN to get automatic updates and fast queries without triggers.

**Example:**
```sql
-- PG 12+: generated stored column keeps tsvector always current
ALTER TABLE articles ADD COLUMN fts_doc TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(body, ''))
  ) STORED;

CREATE INDEX idx_articles_fts ON articles USING GIN (fts_doc);
```

**Performance notes:**
- `GENERATED … STORED` (PG 12+) keeps the column auto-updated without a trigger.
- GIN index makes `@@` queries O(log n).
- For incremental updates, `fastupdate = on` (default) batches GIN updates; flush with `gin_clean_pending_list()` if needed.
- Set `default_text_search_config` to avoid repeating the language in every query.

---

### Q35: When should you use pg_trgm instead of tsvector? {#q35}

**Answer summary:** Use `pg_trgm` (trigram matching) for fuzzy/substring/similarity search and LIKE/ILIKE acceleration. Use `tsvector` for natural-language word search with stemming and stop-words.

| Feature | tsvector/tsquery | pg_trgm |
|---|---|---|
| Word stemming | Yes | No |
| Stop words | Yes | No |
| Substring match | No | Yes |
| LIKE/ILIKE acceleration | No | Yes |
| Typo tolerance | No | Yes (similarity threshold) |
| Language-agnostic | No | Yes |

**Example:**
```sql
CREATE EXTENSION pg_trgm;
CREATE INDEX idx_name_trgm ON users USING GIN (name gin_trgm_ops);

-- ILIKE now uses the trigram index
SELECT * FROM users WHERE name ILIKE '%alice%';

-- Similarity search
SELECT name, similarity(name, 'alise') AS sim
FROM users
WHERE name % 'alise'
ORDER BY sim DESC;
```

---

## Group 8 – Vacuum, Autovacuum & Maintenance

### Q36: Why does PostgreSQL need VACUUM? {#q36}

**Answer summary:** Because of MVCC, deleted and updated rows leave dead tuple versions in heap pages. VACUUM reclaims that space, prevents transaction ID wraparound, and updates the visibility map for index-only scans.

**What VACUUM does:**
1. Marks dead tuples as free space in the Free Space Map (FSM).
2. Updates the visibility map (VM) — pages where all tuples are visible to all transactions allow index-only scans.
3. Advances `pg_database.datfrozenxid` to prevent XID wraparound.
4. Does **not** return space to the OS (use `VACUUM FULL` or `pg_squeeze` for that).

**Interview takeaway:** Lack of vacuuming is one of the most common causes of performance degradation in PostgreSQL. Monitor `n_dead_tup` in `pg_stat_user_tables`.

---

### Q37: What is table bloat and how do you monitor it? {#q37}

**Answer summary:** Table bloat is the accumulation of dead tuples and empty space inside heap/index pages that VACUUM hasn't reclaimed. It wastes I/O by scanning unneeded pages.

**Monitor with:**
```sql
-- Quick bloat estimate
SELECT
  relname,
  n_live_tup,
  n_dead_tup,
  round(100.0 * n_dead_tup /
    nullif(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
  last_autovacuum,
  last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 20;

-- Detailed bloat via pgstattuple extension
CREATE EXTENSION pgstattuple;
SELECT * FROM pgstattuple('my_large_table');
```

**Resolution:**
- Tune autovacuum to run more aggressively on high-churn tables.
- Use `pg_repack` or `pg_squeeze` to reclaim space online without an `ACCESS EXCLUSIVE` lock.

---

### Q38: How does autovacuum decide when to run? {#q38}

**Answer summary:** Autovacuum triggers when dead tuples (or changed tuples for ANALYZE) exceed a threshold plus a fraction of the total table size.

**Trigger formula:**
```
vacuum trigger  = autovacuum_vacuum_threshold  + autovacuum_vacuum_scale_factor  * n_live_tup
analyze trigger = autovacuum_analyze_threshold + autovacuum_analyze_scale_factor * n_live_tup
```

Defaults: `vacuum_threshold = 50`, `vacuum_scale_factor = 0.20` — on a 1M-row table, VACUUM triggers after 200,050 dead tuples.

**Per-table override for high-churn tables:**
```sql
ALTER TABLE orders SET (
  autovacuum_vacuum_scale_factor  = 0.01,
  autovacuum_vacuum_threshold     = 100,
  autovacuum_analyze_scale_factor = 0.005
);
```

**Pitfall:** Long-running transactions pin the oldest transaction snapshot, preventing VACUUM from removing dead tuples even if autovacuum runs correctly.

---

### Q39: What is VACUUM FULL and when should you use it? {#q39}

**Answer summary:** `VACUUM FULL` rewrites the entire table into a new heap file, returning all free space to the OS. It requires an `ACCESS EXCLUSIVE` lock, blocking all reads and writes.

**When to use it:**
- Table is severely bloated and `pg_repack`/`pg_squeeze` are not available.
- After a one-time massive delete that freed most of the table.
- During a maintenance window where downtime is acceptable.

**Alternatives (online, minimal locking):**
- `pg_repack` — full online table rewrite.
- `pg_squeeze` — uses logical replication internally.
- `CLUSTER` — rewrites in index order; useful for sequential range queries.

**Example:**
```sql
-- Only during maintenance windows!
VACUUM FULL ANALYZE orders;
```

---

### Q40: What is transaction ID wraparound and how do you prevent it? {#q40}

**Answer summary:** PostgreSQL uses 32-bit transaction IDs (XIDs). When the counter approaches 2 billion, old XID values appear "in the future," causing data to appear invisible. VACUUM must freeze old XIDs before wraparound occurs.

**Details:**
- PostgreSQL warns at `vacuum_warn_age` (200M XIDs before wraparound) and forces an emergency autovacuum at `autovacuum_freeze_max_age` (default 200M).
- `VACUUM FREEZE` sets row XIDs to `FrozenTransactionId` — a special value visible to all transactions.

**Monitor:**
```sql
SELECT datname,
       age(datfrozenxid)              AS xid_age,
       2000000000 - age(datfrozenxid) AS xids_remaining
FROM pg_database
ORDER BY xid_age DESC;
```

**Pitfall:** A database brought back online after years of dormancy can trigger an emergency autovacuum that monopolises I/O until all tables are frozen. Plan capacity accordingly.

---

## Group 9 – Replication & High Availability

### Q41: What types of replication does PostgreSQL support? {#q41}

**Answer summary:** PostgreSQL supports physical (streaming + file-based) and logical replication. Physical replication copies the entire cluster byte-for-byte; logical replication streams row-level changes.

| Type | Granularity | Cross-version | Use case |
|---|---|---|---|
| File-based (WAL archiving) | Physical blocks | No | PITR, cold standby |
| Streaming replication | Physical blocks | No | Hot standby, HA |
| Logical replication | Table row changes | Yes (within limits) | Selective sync, upgrades |
| pglogical / Debezium | Logical (extension) | Yes | CDC, heterogeneous |

**Interview takeaway:** Physical replication is simpler and more complete (replicates all objects). Logical replication is more flexible but requires tables to have primary keys and doesn't replicate DDL automatically.

---

### Q42: What is streaming replication and how does it work? {#q42}

**Answer summary:** The primary sends WAL records to one or more standby servers in near real-time via a persistent TCP connection. Standbys replay WAL to stay in sync.

**Architecture:**
1. Primary: `wal_level = replica`, `max_wal_senders > 0`.
2. Standby: `primary_conninfo` points to primary; `hot_standby = on` for read-only queries.
3. WAL sender process on primary → WAL receiver process on standby.
4. Optional replication slot prevents WAL from being recycled before standby consumes it.

**Key config (primary `postgresql.conf`):**
```
wal_level       = replica
max_wal_senders = 5
wal_keep_size   = 1GB   # buffer for slow standbys without slots
```

**Interview takeaway:** Replication slots guarantee no WAL is discarded before the standby catches up — but an offline standby with an active slot can cause `pg_wal/` to fill the disk and crash the primary.

---

### Q43: What is logical replication and how does it differ from physical replication? {#q43}

**Answer summary:** Logical replication streams decoded row-level changes (INSERT/UPDATE/DELETE) for specific tables rather than raw WAL blocks, enabling selective sync and cross-version replication.

**Setup:**
```sql
-- On publisher
ALTER SYSTEM SET wal_level = logical;
SELECT pg_reload_conf();
CREATE PUBLICATION my_pub FOR TABLE orders, customers;

-- On subscriber (table schema must exist already)
CREATE SUBSCRIPTION my_sub
  CONNECTION 'host=primary port=5432 dbname=mydb user=repl'
  PUBLICATION my_pub;
```

**Key differences from physical:**
- Replicates only listed tables (not system catalogs, sequences, DDL).
- Subscriber can be a different PostgreSQL major version.
- Subscriber can have additional indexes, triggers, or columns.
- Useful for zero-downtime major-version upgrades.

---

### Q44: What is replication lag and how do you monitor and reduce it? {#q44}

**Answer summary:** Replication lag is the delay between a change committed on the primary and its visibility on the standby. Lag can be measured in bytes (WAL distance) or wall-clock time.

**Monitor:**
```sql
-- On primary: lag per standby
SELECT client_addr, state,
       write_lag, flush_lag, replay_lag
FROM pg_stat_replication;

-- On standby: time behind primary
SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;
```

**Reduce lag:**
- Ensure standby I/O and CPU can match the primary's write rate.
- Avoid long-running queries on the standby that cause Hot Standby conflict waits.
- Use `synchronous_commit = off` on the primary if write latency is the bottleneck.
- Increase `wal_receiver_status_interval` if feedback round-trips are slow.

---

### Q45: What is the role of synchronous_commit and what are the trade-offs? {#q45}

**Answer summary:** `synchronous_commit` controls whether a transaction waits for WAL to be flushed (and optionally replicated) before returning success to the client. Turning it off trades durability for lower write latency.

| Setting | Behaviour | Durability risk |
|---|---|---|
| `on` (default) | Wait for local WAL flush | None |
| `remote_write` | Wait for standby to receive (not flush) | Small (standby crash) |
| `remote_apply` | Wait for standby to apply | None (higher latency) |
| `local` | Local flush only (ignore standbys) | None locally |
| `off` | Return immediately; WAL flushed async | Up to ~200ms data loss on crash |

**Example:**
```sql
-- Per-transaction override for a bulk load where minor loss is acceptable
SET LOCAL synchronous_commit = off;
INSERT INTO event_log SELECT * FROM generate_series(1, 1000000) s(n);
```

**Interview takeaway:** `synchronous_commit = off` does **not** risk database corruption — only the loss of a small window of committed transactions on a crash. The database always remains consistent.

---

## Group 10 – Extensions & Ecosystem

### Q46: What are the most important PostgreSQL extensions? {#q46}

**Answer summary:** PostgreSQL's extension ecosystem is vast. These are the most interview-relevant:

| Extension | Purpose |
|---|---|
| `pg_stat_statements` | Track per-query execution statistics |
| `pgcrypto` | Encryption and hashing functions |
| `uuid-ossp` / `gen_random_uuid()` | UUID generation (built-in from PG 13) |
| `pg_trgm` | Trigram similarity and ILIKE indexing |
| `PostGIS` | Geospatial data types and functions |
| `pg_partman` | Automated partition management |
| `timescaledb` | Time-series hypertables |
| `pgvector` | Vector embeddings for AI/ML workloads |
| `pg_repack` | Online table/index bloat removal |
| `hstore` | Key-value pairs (largely superseded by JSONB) |

**Example:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SELECT gen_random_uuid();  -- no extension needed in PG 13+
```

---

### Q47: How does pg_stat_statements help performance tuning? {#q47}

**Answer summary:** `pg_stat_statements` tracks execution statistics for every distinct query shape (literals replaced with `$1`, `$2`…), exposing total time, call counts, rows processed, and I/O.

**Setup (`postgresql.conf`):**
```
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all
```

**Useful queries:**
```sql
-- Top 10 queries by total execution time
SELECT
  round(total_exec_time::numeric, 2)  AS total_ms,
  calls,
  round(mean_exec_time::numeric, 2)   AS avg_ms,
  round(stddev_exec_time::numeric, 2) AS stddev_ms,
  left(query, 80)                     AS query_snippet
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Reset after tuning to measure impact cleanly
SELECT pg_stat_statements_reset();
```

**Interview takeaway:** Always check `pg_stat_statements` before and after an optimisation. Look for high `mean_exec_time` (slow individual queries) and high `total_exec_time` (frequent moderate queries that add up).

---

### Q48: What is the difference between schemas and databases in PostgreSQL? {#q48}

**Answer summary:** A **database** is a fully isolated unit with its own system catalogs, connection target, and transaction scope. A **schema** is a namespace within a database — objects in different schemas share the same catalog, connection, and transactions.

| Feature | Database | Schema |
|---|---|---|
| Isolation | Complete | Namespace only |
| Cross-object queries | Requires `dblink`/FDW | Direct SQL (no special syntax) |
| Separate connection required | Yes | No |
| Shared roles | No (per-cluster) | Yes |
| `search_path` applies | N/A | Yes |

**Example:**
```sql
-- Schema-based multi-tenancy within one database
CREATE SCHEMA tenant_abc;
SET search_path = tenant_abc, public;
CREATE TABLE orders (id SERIAL PRIMARY KEY, amount NUMERIC);
-- Creates tenant_abc.orders, not public.orders
```

**Interview takeaway:** Schemas are the right tool for multi-tenancy within a single database. Separate databases are appropriate when tenants need complete isolation or different PostgreSQL configuration settings.

---

### Q49: How do row-level security (RLS) policies work? {#q49}

**Answer summary:** RLS lets you define per-role `USING` and `WITH CHECK` expressions on a table so that different users automatically see different subsets of rows — enforced at the database level without application-level filtering.

**Example:**
```sql
-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policy: session can only see its own tenant's rows
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.current_tenant_id')::INT);

-- Set context in connection setup (e.g., via application middleware)
SET app.current_tenant_id = '42';

-- Automatically filtered to tenant 42
SELECT * FROM orders;
```

**Details:**
- `USING` filters on SELECT/UPDATE/DELETE.
- `WITH CHECK` validates rows on INSERT/UPDATE.
- Superusers bypass RLS; use `SET ROLE` + RLS for internal services.
- Combine with `SECURITY DEFINER` functions to expose controlled access.

**Pitfall:** Table owners bypass RLS by default. Use `ALTER TABLE … FORCE ROW LEVEL SECURITY` to apply policies to the owner too.

---

### Q50: How do you design a connection-pooling strategy with PgBouncer? {#q50}

**Answer summary:** PgBouncer sits between the application and PostgreSQL, multiplexing many application connections onto a smaller set of server connections. Choose the pooling mode based on your application's use of session-state features.

**Pooling modes:**

| Mode | Server connection held | Use case |
|---|---|---|
| Session | Until client disconnects | Apps using `SET`, temp tables, `LISTEN` |
| Transaction | Duration of transaction | Most web apps (recommended default) |
| Statement | Per statement | Stateless, auto-commit only |

**Key PgBouncer config (`pgbouncer.ini`):**
```ini
[databases]
mydb = host=127.0.0.1 port=5432 dbname=mydb

[pgbouncer]
pool_mode         = transaction
max_client_conn   = 10000
default_pool_size = 25        ; server connections per user/db pair
server_idle_timeout = 600
```

**Sizing the pool:**
- PostgreSQL performs best with server connections ≈ `2 × CPU cores`.
- A pool of 25–100 server connections can serve thousands of application connections in transaction mode.

**Pitfall:** Transaction mode is incompatible with session-level `SET`, named prepared statements (unless `server_reset_query` clears them), and `LISTEN/NOTIFY`. Audit your app thoroughly before switching modes.

---

*End of PostgreSQL Interview Question Bank — 50 questions across 10 thematic groups.*
