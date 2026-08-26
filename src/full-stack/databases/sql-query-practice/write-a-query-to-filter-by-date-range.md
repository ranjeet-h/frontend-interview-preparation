# Write a Query to Filter by Date Range in SQL: SARGability, Half-Open Intervals, and Timezone Traps

## 1. What the Interviewer Is Really Testing

On the surface, asking you to "write a query to fetch records between two dates" sounds like a freshman SQL syntax test. In a senior interview, it is a diagnostic probe for how you handle silent data corruption, index utilization, and distributed time semantics.

The interviewer is checking four specific engineering competencies:

First, they want to see if you fall into the infamous **`BETWEEN` trap on timestamp columns**. When a developer writes `BETWEEN '2024-01-01' AND '2024-01-31'`, SQL implicitly casts the end date to `'2024-01-31 00:00:00'`. Any order placed at 09:30 AM or 11:59 PM on January 31st is silently dropped from the result set. You just under-reported monthly revenue to the finance team without throwing a single database error.

Second, they are testing your understanding of **SARGability** (Search ARGument Able). Junior engineers frequently wrap columns in scalar functions like `WHERE DATE(created_at) = '2024-01-15'` or `WHERE EXTRACT(month FROM created_at) = 1`. This forces the database engine to execute a row-by-row function evaluation across tens of millions of records via a full table scan, completely bypassing your B-Tree index.

Third, they want to see whether you naturally default to the mathematical **half-open interval standard `[start, end)`** (`created_at >= '2024-01-01' AND created_at < '2024-02-01'`). This pattern eliminates sub-second precision guessing (`.999` vs `.999999`), prevents accidental boundary gaps, and works uniformly across all SQL dialects and timestamp precisions.

Fourth, they want to observe how you handle **timezone normalization**. Storing dates in UTC while querying localized user inputs requires converting the search window to UTC before hitting the database, rather than applying runtime timezone conversions on the indexed column inside the SQL engine.

---

## 2. Think Before You Code — The Senior Dev Thought Process

When presented with the requirement: *"Retrieve all user orders placed during the entire month of January 2024,"* here is how an experienced engineer deconstructs the problem:

The first instinct of a junior developer is to use the English-sounding `BETWEEN` keyword:
`WHERE created_at BETWEEN '2024-01-01' AND '2024-01-31'`

I immediately reject this. In SQL, `BETWEEN` is inclusive on both boundaries (`a >= start AND a <= end`). When `created_at` is a `TIMESTAMP` or `DATETIME` type, string literal `'2024-01-31'` parses to `'2024-01-31 00:00:00.000000'`. Any transaction occurring after midnight on the final day of the month fails the `<=` check. It discards 23 hours, 59 minutes, and 59 seconds of real transactions.

The second attempt people often try is manual timestamp padding:
`WHERE created_at BETWEEN '2024-01-01 00:00:00' AND '2024-01-31 23:59:59'`

I reject this because it creates a catastrophic sub-second precision gap. An order placed at `23:59:59.450` falls into no-man's-land and disappears. If you try to pad milliseconds with `.999`, Microsoft SQL Server rounds `.999` up to the next tick (`2024-02-01 00:00:00`), leaking records into the next month. Meanwhile, PostgreSQL and MySQL support microsecond precision down to `.999999`, making hardcoded sub-second padding fragile and dialect-dependent.

The third attempt people reach for is date stripping:
`WHERE DATE(created_at) >= '2024-01-01' AND DATE(created_at) <= '2024-01-31'`

This correctly includes all rows, but it destroys query performance. Wrapping `created_at` inside `DATE()` means the database cannot search the sorted B-Tree index keys directly. It must calculate `DATE()` on every single row in the table, turning an `O(log N)` index seek into an `O(N)` disk-thrashing full table scan.

The clean, unassailable architectural solution is the **Half-Open Interval**:
- Lower bound is inclusive: `>= '2024-01-01 00:00:00'`
- Upper bound is strictly exclusive to the first instant of the next period: `< '2024-02-01 00:00:00'`

This guarantees every microsecond of January 31st is captured, nothing from February 1st enters, no sub-second guessing is needed, and the raw column remains completely unmanipulated, allowing the database query planner to perform an optimal B-Tree index range seek.

---

## 3. The Solution — Fully Explained Code

Given a high-throughput production schema:

```sql
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

-- Essential index for chronological range scans
CREATE INDEX idx_orders_created_at ON orders(created_at);
```

**Solution 1: The Production Gold Standard (Half-Open Interval)**

This query retrieves all orders for January 2024 with zero data loss and maximum index efficiency:

```sql
SELECT 
    id,
    customer_id,
    total_amount,
    status,
    created_at
FROM orders
WHERE created_at >= '2024-01-01 00:00:00+00'
  AND created_at <  '2024-02-01 00:00:00+00';
```

- **Time Complexity:** `O(log N + K)` where `N` is the total rows in the table and `K` is the number of matching rows in the date range. The B-Tree index performs a tree seek to find the first record in `O(log N)` time, then reads sequentially along the leaf pages until reaching the upper bound `K`.
- **Space Complexity:** `O(1)` auxiliary memory in the database engine, as results stream directly from the index leaf nodes without temporary sort buffers.

**Solution 2: Dynamic Rolling Date Ranges (Interval Arithmetic)**

When building dashboards that query dynamic rolling windows (such as "orders in the last 7 days" or "current month to date"), apply interval calculations to the parameter literal, leaving the database column untouched:

```sql
-- PostgreSQL Syntax: SARGable rolling 7-day window
SELECT 
    id,
    customer_id,
    total_amount,
    created_at
FROM orders
WHERE created_at >= NOW() - INTERVAL '7 days';

-- MySQL Syntax: SARGable rolling 7-day window
SELECT 
    id,
    customer_id,
    total_amount,
    created_at
FROM orders
WHERE created_at >= NOW() - INTERVAL 7 DAY;

-- PostgreSQL Syntax: Dynamic current calendar month (start of month to now)
SELECT 
    id,
    customer_id,
    total_amount,
    created_at
FROM orders
WHERE created_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP)
  AND created_at <  DATE_TRUNC('month', CURRENT_TIMESTAMP) + INTERVAL '1 month';
```

**Solution 3: The Non-SARGable Anti-Pattern vs The SARGable Fix**

Understanding why the wrong code fails is just as important as writing the right code:

```sql
-- ============================================================================
-- ANTI-PATTERN: Non-SARGable (Forces Full Table Scan / Seq Scan)
-- ============================================================================
-- The database must execute DATE() on every single row before comparing.
-- If the table has 50,000,000 rows, it computes DATE() 50,000,000 times.
SELECT * 
FROM orders 
WHERE DATE(created_at) = '2024-01-15';

-- ============================================================================
-- PRODUCTION FIX: SARGable Single-Day Range Scan
-- ============================================================================
-- Leaves the column un-wrapped. The engine seeks directly to '2024-01-15 00:00:00'
-- and scans forward until '2024-01-16 00:00:00' using the B-Tree index.
SELECT * 
FROM orders 
WHERE created_at >= '2024-01-15 00:00:00'
  AND created_at <  '2024-01-16 00:00:00';
```

---

## 4. Dry Run — Walk Through a Real Example

Let us trace how the database engine executes our query against a table of 10,000,000 rows with a B-Tree index on `created_at`.

Suppose our table contains these representative timestamp records:

| Order ID | `created_at` (UTC) | In Jan 2024? |
| :--- | :--- | :--- |
| Row 101 | `2023-12-31 23:59:59.999` | ❌ Outside (Too early) |
| Row 102 | `2024-01-01 00:00:00.000` | ✅ Inside (First instant) |
| Row 103 | `2024-01-15 14:22:10.500` | ✅ Inside |
| Row 104 | `2024-01-31 23:59:59.999` | ✅ Inside (Last microsecond) |
| Row 105 | `2024-02-01 00:00:00.000` | ❌ Outside (First instant of Feb) |
| Row 106 | `2024-02-01 08:30:00.000` | ❌ Outside (Too late) |

**Step-by-Step B-Tree Traversal:**

```txt
                       [Root Node: 2024-01-01]
                            /              \
            [Branch: < 2024-01-01]    [Branch: >= 2024-01-01]
                                          /               \
                       [Leaf: Jan 01 - Jan 15] <-> [Leaf: Jan 16 - Jan 31] <-> [Leaf: Feb 01+]
```

1. **Root-to-Leaf Seek (`O(log N)`):** The query planner inspects the predicate `created_at >= '2024-01-01 00:00:00'`. It navigates down the B-Tree hierarchy from root to branch to the exact leaf node containing `'2024-01-01 00:00:00.000'` (Row 102). It skips all preceding millions of historical records in a handful of memory reads.
2. **Sequential Leaf Page Scan (`O(K)`):** Because leaf nodes in a B-Tree index are linked as a doubly-linked list, the storage engine reads forward through the pages sequentially. It collects Row 102, Row 103, and Row 104 without needing to navigate the tree again.
3. **Hard Stop Condition:** As soon as the scan hits Row 105 (`2024-02-01 00:00:00.000`), it evaluates the condition `< '2024-02-01 00:00:00'`. The condition evaluates to `FALSE`. Because index keys are strictly ordered, the engine knows with mathematical certainty that no subsequent row can ever match. It immediately terminates the scan.
4. **Execution Plan Proof:**
   Running `EXPLAIN ANALYZE` in PostgreSQL shows:
   `Index Scan using idx_orders_created_at on orders (cost=0.43..128.50 rows=1520 width=48)`
   `Index Cond: ((created_at >= '2024-01-01 00:00:00+00'::timestamp with time zone) AND (created_at < '2024-02-01 00:00:00+00'::timestamp with time zone))`
   `Execution Time: 0.82 ms` (vs `1450.00 ms` for a `DATE(created_at)` sequential scan).

---

## 5. Edge Cases — The Ones That Break Naive Solutions

**1. The Sub-Second Precision Rounding Trap**

Different SQL database engines store sub-second timestamps with varying precision:
- PostgreSQL `TIMESTAMPTZ`: Microsecond precision (6 decimal places, e.g., `23:59:59.999999`).
- MySQL `DATETIME(6)`: Microsecond precision.
- Microsoft SQL Server `DATETIME`: Rounds time to increments of `.000`, `.003`, or `.007` seconds. If you write `23:59:59.999`, SQL Server rounds it up to `00:00:00.000` of the next day, pulling in February 1st data.
- The half-open interval `< '2024-02-01 00:00:00'` is mathematically immune to precision differences. It does not care whether your database stores milliseconds, microseconds, or nanoseconds.

**2. Timezone Normalization and Client Offset Mismatches**

Databases should always store timestamps in UTC (`TIMESTAMPTZ` in Postgres or UTC `DATETIME` in MySQL). However, users query data from their local timezone.

If a manager in New York (`America/New_York`, UTC-5 in winter) requests "all orders for January 1st", January 1st in New York spans from `2024-01-01 00:00:00 -05:00` to `2024-01-02 00:00:00 -05:00`. In UTC, this corresponds to `2024-01-01 05:00:00+00` through `2024-01-02 05:00:00+00`.

Converting the column in SQL with `DATE(created_at AT TIME ZONE 'America/New_York') = '2024-01-01'` breaks the B-Tree index. The correct production pattern is to compute the UTC boundary timestamps in your application service layer (Node.js, Go, Python) and pass raw UTC values to the query:
`WHERE created_at >= '2024-01-01 05:00:00+00' AND created_at < '2024-01-02 05:00:00+00'`

**3. Handling NULL Values in Date Columns**

If a date column is nullable (such as `shipped_at`), standard comparison operators (`>=`, `<`, `BETWEEN`) evaluate to `UNKNOWN` when encountering `NULL`. Rows with `NULL` values are silently omitted from the result set. If the business requirement requires records that match the date range or have not yet been shipped, you must explicitly declare the null condition:
`WHERE (shipped_at >= '2024-01-01' AND shipped_at < '2024-02-01') OR shipped_at IS NULL`

**4. Leap Years and Month Endings**

Hardcoding day offsets (such as `+ INTERVAL 30 DAY`) produces incorrect date boundaries for February and 31-day months. Always use date arithmetic with calendar month intervals (`+ INTERVAL '1 month'`) or compute explicit calendar start dates on the caller side.

---

## 6. Variations and Follow-ups

**Variation 1: Partition Pruning on Massive Datasets**

In high-volume databases with hundreds of millions of rows, tables are often partitioned by date range:

```sql
CREATE TABLE orders (
    id BIGINT NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (created_at);

CREATE TABLE orders_2024_01 PARTITION OF orders
    FOR VALUES FROM ('2024-01-01 00:00:00+00') TO ('2024-02-01 00:00:00+00');
```

When you query with a half-open interval `created_at >= '2024-01-01' AND created_at < '2024-02-01'`, the database query optimizer performs **Partition Pruning**. It completely excludes all other monthly tables from disk I/O, reading only the single partition file. If you wrap the column in `DATE(created_at)`, partition pruning fails, forcing the engine to scan every historical partition table.

**Variation 2: Composite Index Ordering (Equality First, Range Last)**

When filtering by both a category and a date range (e.g., `WHERE customer_id = 42 AND created_at >= '2024-01-01' AND created_at < '2024-02-01'`):

```sql
-- CORRECT COMPOSITE INDEX:
CREATE INDEX idx_orders_customer_created ON orders(customer_id, created_at);

-- SUB-OPTIMAL COMPOSITE INDEX:
CREATE INDEX idx_orders_created_customer ON orders(created_at, customer_id);
```

A B-Tree index can only perform an index seek on columns up to the first range condition. With `(customer_id, created_at)`, the engine seeks directly to `customer_id = 42` and then performs an index range seek on `created_at`. With `(created_at, customer_id)`, the engine must scan all rows matching the date range across all customers and filter out non-matching `customer_id` values sequentially.

**Variation 3: Aggregating into Time Buckets while Keeping Filters Fast**

When grouping analytics by day or hour, format the buckets in the `SELECT` and `GROUP BY` clauses while keeping the `WHERE` clause untouched:

```sql
SELECT 
    DATE_TRUNC('day', created_at) AS order_day,
    COUNT(*) AS total_orders,
    SUM(total_amount) AS daily_revenue
FROM orders
WHERE created_at >= '2024-01-01 00:00:00+00'
  AND created_at <  '2024-02-01 00:00:00+00'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY order_day ASC;
```

Here, `DATE_TRUNC()` in `GROUP BY` organizes the output into daily buckets, while the raw `created_at` in `WHERE` preserves the fast B-Tree index scan.

**Variation 4: Finding Overlapping Date Ranges (The Overlap Theorem)**

A classic interview extension is finding overlapping schedules (e.g., hotel reservations, doctor appointments, or resource bookings).

Given an existing booking `(start_time, end_time)` and a requested window `(req_start, req_end)`, two intervals overlap if and only if:

```sql
SELECT * 
FROM bookings
WHERE start_time < :req_end
  AND end_time   > :req_start;
```

This two-clause condition handles every possible overlap permutation (full containment, partial left overlap, partial right overlap, and exact match) with complete mathematical correctness.

---

## 7. 🧠 The Memory Hook

Think of date filtering like cutting a loaf of bread: **slice cleanly at the start mark (`>= start`), slice cleanly before the next mark (`< end`), and never try to measure the crumbs at 23:59:59.999**.

Keep your column naked so the B-Tree index can run: **Function on the literal, never on the column.**
