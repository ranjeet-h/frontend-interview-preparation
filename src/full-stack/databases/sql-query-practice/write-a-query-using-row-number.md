# Write a Query Using `ROW_NUMBER()` in SQL: Deduplication, Pagination, and Top-N per Group

## 1. What the Interviewer Is Really Testing

When an interviewer asks you to write a query using `ROW_NUMBER()`, they are rarely checking if you simply know the function name. They are testing whether you understand the **Greatest-N-Per-Group** pattern and row-level window partitioning. Specifically, they evaluate:

- **Window Projection vs. Aggregation Collapsing:** Knowing when to use `ROW_NUMBER() OVER (...)` versus `GROUP BY`. An aggregate `GROUP BY` collapses multiple rows into a single summary row, losing non-aggregated column details unless joined back to the base table. Window functions evaluate partitions while preserving every individual row's distinct identity and attributes.
- **Strict Sequential Enumeration ($1, 2, 3, \dots, N$):** Understanding that `ROW_NUMBER()` assigns contiguous, unique integers to every row within a partition regardless of duplicate values in the sort key—unlike `RANK()` (which creates gaps on ties) or `DENSE_RANK()` (which shares ranks on ties).
- **Deterministic Sorting and Tiebreaking:** Recognizing that sorting on non-unique columns (such as timestamps) creates non-deterministic results across executions, database engines, or replica nodes. Adding a secondary unique column (`id DESC`) guarantees stable, reproducible rankings.
- **SQL Processing Order Scoping:** Knowing why window functions cannot be placed directly in a `WHERE` or `HAVING` clause due to SQL's logical execution pipeline (`FROM` $\rightarrow$ `WHERE` $\rightarrow$ `GROUP BY` $\rightarrow$ `HAVING` $\rightarrow$ `SELECT / WINDOW` $\rightarrow$ `ORDER BY`), necessitating a Common Table Expression (CTE) or derived subquery.
- **Data Mutation Patterns:** Applying `ROW_NUMBER()` safely for in-place table deduplication and data-cleaning pipelines.

---

## 2. Think Before You Code — The Senior Dev Thought Process

When presented with "find the latest status update for each device" or "remove duplicate user records keeping only the newest entry," an experienced developer systematically evaluates the trade-offs:

### The Naive Instinct: Subqueries with `GROUP BY` and Self-Joins

A common first instinct is to find the maximum timestamp per group and join it back:

```sql
-- The Naive / Fragile Approach
SELECT * 
FROM DeviceLogs 
WHERE (device_id, recorded_at) IN (
    SELECT device_id, MAX(recorded_at) 
    FROM DeviceLogs 
    GROUP BY device_id
);
```

**Why this breaks:**
1. **The Tie Trap:** If a device has two distinct log entries with the exact same maximum `recorded_at` timestamp, the `IN` subquery matches and returns *both* rows. It violates the "Top-1" requirement.
2. **Performance Penalty:** Self-joins and correlated subqueries on large, unindexed datasets require multiple passes over the table, scaling at $O(N^2)$ or $O(N \cdot M)$ time complexity.

### The Optimal Pattern: Window Partitioning with `ROW_NUMBER()`

Instead of scanning the dataset multiple times, we process the table in a single pass:

1. **Partition:** Divide the table into isolated logical buckets per entity (`PARTITION BY device_id`).
2. **Order with a Deterministic Tiebreaker:** Order rows inside each bucket by the primary business dimension descending (`ORDER BY recorded_at DESC`), followed by a unique surrogate key (`id DESC`) to break ties deterministically.
3. **Rank:** Assign a sequential integer `rn` starting at 1 for each partition.
4. **Filter:** Wrap the window calculation in a Common Table Expression (CTE) or subquery and extract rows where `rn = 1` (for latest status) or delete rows where `rn > 1` (for deduplication).

---

## 3. The Solution — Fully Explained Code

### Problem 1: Top-1 Latest Status Update per Device (Greatest-N-Per-Group)

Given a table `DeviceLogs(id, device_id, status, recorded_at)`:

```sql
WITH LatestUpdates AS (
    SELECT 
        device_id,
        status,
        recorded_at,
        -- Assign contiguous integers starting at 1 within each device's partition.
        -- 'recorded_at DESC' sorts newest first.
        -- 'id DESC' guarantees deterministic tiebreaking if timestamps match.
        ROW_NUMBER() OVER (
            PARTITION BY device_id 
            ORDER BY recorded_at DESC, id DESC
        ) AS rn
    FROM DeviceLogs
)
SELECT 
    device_id, 
    status, 
    recorded_at
FROM LatestUpdates
-- Filter in the outer query because window functions execute in the SELECT phase
WHERE rn = 1;
```

#### Determinism Warning: The Danger of Omitting Tiebreakers

If you write `ORDER BY recorded_at DESC` without `id DESC`, and two rows share the same timestamp:
- The SQL standard does not define which row receives `rn = 1`.
- The database optimizer may return row $A$ on one run, and row $B$ on another run after an index rebuild, parallel scan, or vacuum operation.
- Always include an immutable, unique column (such as primary key `id`) in the `ORDER BY` clause to guarantee total ordering.

---

### Problem 2: In-Place Table Deduplication (Deleting Redundant Rows)

To clean up duplicate records while preserving the oldest (lowest `id`) original entry:

#### PostgreSQL / SQLite (Using CTE with Primary Key)

```sql
WITH RankedDuplicates AS (
    SELECT 
        id,
        ROW_NUMBER() OVER (
            PARTITION BY device_id, status, recorded_at 
            ORDER BY id ASC
        ) AS rn
    FROM DeviceLogs
)
DELETE FROM DeviceLogs
WHERE id IN (
    SELECT id 
    FROM RankedDuplicates 
    WHERE rn > 1
);
```

#### SQL Server (Updatable CTE)

In SQL Server, Common Table Expressions are directly updatable, allowing you to delete directly against the CTE:

```sql
WITH RankedDuplicates AS (
    SELECT 
        ROW_NUMBER() OVER (
            PARTITION BY device_id, status, recorded_at 
            ORDER BY id ASC
        ) AS rn
    FROM DeviceLogs
)
DELETE FROM RankedDuplicates
WHERE rn > 1;
```

---

### Complexity Analysis

- **Time Complexity:** $O(N \log N)$ where $N$ is the total number of rows. If a composite B-tree index exists on `(device_id, recorded_at DESC, id DESC)`, the database engine skips sorting entirely and performs an index scan in $O(N)$ time.
- **Space Complexity:** $O(N)$ transient memory space for window partition buffers during query execution (or $O(1)$ auxiliary memory if streamed over an indexed path).

---

## 4. Dry Run — Walk Through a Real Example

Consider the following records in `DeviceLogs`:

| id | device_id | status | recorded_at |
| :--- | :--- | :--- | :--- |
| **1** | DEV-101 | OFFLINE | 2026-03-01 10:00:00 |
| **2** | DEV-101 | ONLINE | 2026-03-01 12:00:00 |
| **3** | DEV-101 | ERROR | 2026-03-01 12:00:00 |
| **4** | DEV-202 | ONLINE | 2026-03-01 09:00:00 |
| **5** | DEV-202 | OFFLINE | 2026-03-01 11:30:00 |

Notice that for `DEV-101`, rows 2 and 3 share the **exact same timestamp** (`12:00:00`).

### Step 1: Partitioning and Window Sorting

The engine partitions the data by `device_id` and sorts each partition by `recorded_at DESC, id DESC`:

#### Partition: `device_id = 'DEV-101'`
1. Row 3: `recorded_at = 12:00:00`, `id = 3` $\rightarrow$ Assigned `rn = 1` (Higher `id` breaks tie)
2. Row 2: `recorded_at = 12:00:00`, `id = 2` $\rightarrow$ Assigned `rn = 2`
3. Row 1: `recorded_at = 10:00:00`, `id = 1` $\rightarrow$ Assigned `rn = 3`

#### Partition: `device_id = 'DEV-202'`
1. Row 5: `recorded_at = 11:30:00`, `id = 5` $\rightarrow$ Assigned `rn = 1`
2. Row 4: `recorded_at = 09:00:00`, `id = 4` $\rightarrow$ Assigned `rn = 2`

### Step 2: Intermediate Projected Dataset (`LatestUpdates`)

| id | device_id | status | recorded_at | rn |
| :--- | :--- | :--- | :--- | :--- |
| 3 | DEV-101 | ERROR | 2026-03-01 12:00:00 | **1** |
| 2 | DEV-101 | ONLINE | 2026-03-01 12:00:00 | 2 |
| 1 | DEV-101 | OFFLINE | 2026-03-01 10:00:00 | 3 |
| 5 | DEV-202 | OFFLINE | 2026-03-01 11:30:00 | **1** |
| 4 | DEV-202 | ONLINE | 2026-03-01 09:00:00 | 2 |

### Step 3: Outer Filter (`WHERE rn = 1`)

The outer query filters out all rows where `rn > 1`, leaving exactly one deterministic row per device:

| device_id | status | recorded_at |
| :--- | :--- | :--- |
| **DEV-101** | ERROR | 2026-03-01 12:00:00 |
| **DEV-202** | OFFLINE | 2026-03-01 11:30:00 |

---

## 5. Edge Cases — The Ones That Break Naive Solutions

### 1. Direct Filtering in `WHERE` Clause
Attempting to filter window functions in the same `SELECT` block:
```sql
-- SYNTAX ERROR: Window functions are not allowed in WHERE
SELECT device_id, status, ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY recorded_at DESC) AS rn
FROM DeviceLogs
WHERE ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY recorded_at DESC) = 1;
```
**Reason:** The `WHERE` clause executes to filter rows *before* the `SELECT` clause projects and computes window calculations. You must stage the window function inside a CTE or subquery.

### 2. `NULL` Values in `PARTITION BY` and `ORDER BY`
- **`PARTITION BY column_name` with `NULL` values:** In standard SQL, all rows where the partition key is `NULL` are grouped together into a single shared partition.
- **`ORDER BY column_name` with `NULL` values:** Database engines order `NULL`s differently by default (PostgreSQL treats `NULL`s as largest, placing them first in `DESC` order; MySQL and SQL Server treat `NULL`s as smallest, placing them last in `DESC` order). Explicitly specify `ORDER BY recorded_at DESC NULLS LAST, id DESC` in PostgreSQL to prevent `NULL` timestamps from dominating the top rank.

### 3. Large-Scale In-Place Deletions
Running `DELETE FROM table WHERE id IN (SELECT id FROM RankedDuplicates WHERE rn > 1)` on a table with 50 million rows can lock tables, exhaust transaction undo/WAL logs, and cause replication lag. For production-scale deduplication:
- Batch deletions in chunks of 5,000 to 50,000 rows using indexed ranges.
- Or create a new deduplicated table using `INSERT INTO NewTable SELECT ... WHERE rn = 1` and perform an atomic table swap (`ALTER TABLE ... RENAME`).

---

## 6. Variations and Follow-ups

### Variation 1: `ROW_NUMBER()` vs. `RANK()` vs. `DENSE_RANK()`

Interviewers frequently ask to compare the three core ranking functions on tie scores (e.g., scores `100, 90, 90, 80`):

| Score | `ROW_NUMBER()` | `RANK()` | `DENSE_RANK()` |
| :--- | :--- | :--- | :--- |
| **100** | 1 | 1 | 1 |
| **90** | 2 | 2 | 2 |
| **90** | 3 | 2 | 2 |
| **80** | 4 | 4 *(skips 3)* | 3 *(no gap)* |

- Use **`ROW_NUMBER()`** when you need strict row counting, pagination, deduplication, or exactly 1 row per entity.
- Use **`DENSE_RANK()`** for leaderboards, Olympic medals, or Top-N tiers (e.g., "Find all employees in the top 3 salary tiers per department", where tied salaries share a tier).
- Use **`RANK()`** when tied positions must increment the subsequent position counter by the number of ties.

---

### Variation 2: Top-N per Group (e.g., Top 3 Most Recent Logs per Device)

To fetch the Top-N records instead of Top-1, change the predicate from `= 1` to `<= N`:

```sql
WITH RankedLogs AS (
    SELECT 
        device_id,
        status,
        recorded_at,
        ROW_NUMBER() OVER (
            PARTITION BY device_id 
            ORDER BY recorded_at DESC, id DESC
        ) AS rn
    FROM DeviceLogs
)
SELECT device_id, status, recorded_at, rn
FROM RankedLogs
WHERE rn <= 3;
```

---

### Variation 3: The `QUALIFY` Clause (Modern Cloud Data Warehouses)

In engines like Snowflake, BigQuery, and Databricks, the `QUALIFY` clause filters window functions directly without requiring a CTE:

```sql
-- Snowflake / BigQuery / Databricks
SELECT 
    device_id, 
    status, 
    recorded_at
FROM DeviceLogs
QUALIFY ROW_NUMBER() OVER (
    PARTITION BY device_id 
    ORDER BY recorded_at DESC, id DESC
) = 1;
```

---

### Variation 4: PostgreSQL `DISTINCT ON`

PostgreSQL offers a proprietary, highly optimized alternative to `ROW_NUMBER() = 1`:

```sql
-- PostgreSQL Specific Optimization
SELECT DISTINCT ON (device_id) 
    device_id, 
    status, 
    recorded_at
FROM DeviceLogs
ORDER BY device_id, recorded_at DESC, id DESC;
```

`DISTINCT ON` keeps only the first row of each group according to the `ORDER BY`. While concise and faster for Top-1 in PostgreSQL, it is non-standard SQL and cannot be parameterized for Top-N ($N > 1$).

---

## 7. 🧠 The Memory Hook

> **`PARTITION BY` separates the rooms, `ORDER BY` lines up the queue with a tiebreaker badge, and `ROW_NUMBER()` hands out strict tickets: 1, 2, 3... no ties, no skips.**
