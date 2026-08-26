# Write a Query to Calculate Running Total (Cumulative Sum) in SQL

## 1. What the Interviewer Is Really Testing

Calculating a running total sounds like a basic arithmetic exercise, but interviewers use it to probe four deeper database engineering competencies:

First, do you understand SQL window functions and frame specifications? Many developers memorize `SUM(amount) OVER (ORDER BY order_date)` without realizing that omitting the explicit frame defaults to `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. In production, when two transactions happen on the exact same date or timestamp, default `RANGE` treats them as ties and aggregates both into a single combined sum for both rows. An experienced engineer knows to specify `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` and provide a deterministic tiebreaker.

Second, can you isolate partitions correctly? A global running total across an entire table is rarely what a business application needs. You must partition running balances per customer, bank account, or tenant using `PARTITION BY` so the accumulator resets across entity boundaries without leaking state.

Third, do you know the algorithmic cost of your SQL? Before window functions were standardized in ANSI SQL:2003 (and added to MySQL in 8.0), developers wrote running totals using self-joins or correlated subqueries. Those legacy approaches run in quadratic $O(N^2)$ time. A window function processes rows in a single streaming pass in $O(N)$ time.

Fourth, do you understand how database storage engines execute this query? With a composite B-tree index on `(user_id, order_date, order_id, amount)`, the database engine can stream pre-sorted rows straight off the index without allocating temporary sort buffers or disk-based workfiles.

## 2. Think Before You Code — The Senior Dev Thought Process

When I see a request for a running total or cumulative balance, my mind immediately steps through the calculation pipeline:

My naive first instinct—or what I would have had to write in legacy MySQL 5.7—is a correlated subquery: for every row in `Orders o1`, run a nested `SELECT SUM(o2.amount) FROM Orders o2 WHERE o2.user_id = o1.user_id AND o2.order_date <= o1.order_date`. But I reject this immediately for modern systems. For a customer with 10,000 orders, the database must execute 10,000 nested scans, performing roughly 50 million row comparisons. At 1 million total rows, this quadratic $O(N^2)$ workload locks tables, spikes CPU to 100%, and brings production databases to a halt.

Instead, I reach for a window function (`SUM(...) OVER (...)`). Window functions compute aggregated values over a sliding window of rows while preserving each individual row's identity in the output.

Next, I look for partition boundaries and ordering stability. If the requirement is "running total per user over time", I need `PARTITION BY user_id` and `ORDER BY order_date`. But dates often contain duplicates. If user 101 places two orders on `2026-01-02`, what happens? If I only order by `order_date`, the sort order between those two rows is non-deterministic, and standard `RANGE` framing will output the same combined total on both rows. To guarantee deterministic, row-by-row incremental accumulation, I must add the unique primary key `order_id` to the sort list (`ORDER BY order_date, order_id`) and explicitly declare the physical row frame `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.

Finally, I think about the physical access path. If this query runs frequently on large tables, scanning and sorting millions of rows in memory will create heavy filesort overhead. I design a composite index matching the `(PARTITION BY, ORDER BY, INCLUDE)` pattern: `(user_id, order_date, order_id, amount)`. The database engine scans the index in index-order, keeps a single running accumulator variable in memory, and emits each calculated row immediately as a stream.

## 3. The Solution — Fully Explained Code

### Solution 1: Standard ANSI SQL Window Function (Modern & Optimal)

This is the standard solution for PostgreSQL, MySQL 8.0+, SQLite 3.25+, SQL Server, Oracle, Snowflake, and BigQuery.

```sql
SELECT
  order_id,
  user_id,
  order_date,
  amount,
  -- Calculate cumulative sum per user ordered chronologically
  SUM(amount) OVER (
    PARTITION BY user_id
    ORDER BY order_date, order_id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_total
FROM Orders
ORDER BY user_id, order_date, order_id;
```

Line-by-line reasoning:
- `PARTITION BY user_id`: Divides the dataset into independent subsets per user. The running total accumulator resets to 0 whenever the query engine transitions to a new `user_id`.
- `ORDER BY order_date, order_id`: Orders rows within each partition chronologically. Including `order_id` breaks ties when multiple orders occur on the same date, guaranteeing deterministic results.
- `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`: Explicitly sets a physical row-based window frame starting from the very first row of the partition up to the current row being processed. This guarantees true row-by-row accumulation even if timestamp values collide.
- Outer `ORDER BY user_id, order_date, order_id`: Window functions do not guarantee the final presentation order of the result set unless the outer query has an explicit `ORDER BY`.

**Time Complexity:** $O(N)$ with an index, or $O(N \log N)$ without an index where the database engine must sort the rows before computing the window function. Once sorted, the engine computes the running sum in a single sequential scan ($N$ rows visited exactly once).

**Space Complexity:** $O(1)$ auxiliary memory during execution because the engine only needs to maintain a single running accumulator register as it streams rows within each partition.

**Indexing for Zero-Sort Performance:**
```sql
CREATE INDEX idx_orders_user_date_cover 
ON Orders (user_id, order_date, order_id, amount);
```
With this composite index, the database engine reads the pre-sorted B-tree leaf pages in order, computes the window sum on the fly, and returns the result without touching the table heap or creating temporary sort files (`Using index; Backward/Forward index scan`).

---

### Solution 2: Correlated Subquery / Self-Join (Legacy SQL / Pre-8.0 MySQL)

If you are working with an older database engine (like MySQL 5.7) that lacks window function support, you must use a correlated subquery.

```sql
SELECT
  o1.order_id,
  o1.user_id,
  o1.order_date,
  o1.amount,
  (
    SELECT SUM(o2.amount)
    FROM Orders o2
    WHERE o2.user_id = o1.user_id
      AND (
        o2.order_date < o1.order_date
        OR (o2.order_date = o1.order_date AND o2.order_id <= o1.order_id)
      )
  ) AS running_total
FROM Orders o1
ORDER BY o1.user_id, o1.order_date, o1.order_id;
```

Line-by-line reasoning:
- For every outer row `o1`, the inner subquery scans all preceding rows `o2` belonging to the same `user_id`.
- The compound condition `(o2.order_date < o1.order_date OR (o2.order_date = o1.order_date AND o2.order_id <= o1.order_id))` cleanly handles same-day orders using `order_id` as the tiebreaker.

**Time Complexity:** $O(N^2)$ unindexed, or $O(N \log N)$ if a composite index on `(user_id, order_date, order_id, amount)` is present (each row performs a range scan over past rows in the B-tree).

**Space Complexity:** $O(1)$ auxiliary memory per worker, but generates massive disk I/O and buffer cache thrashing at scale.

## 4. Dry Run — Walk Through a Real Example

Let us trace the window function solution step by step using sample order data containing multiple users and duplicate dates.

### Input Table: `Orders`

| order_id | user_id | order_date | amount |
| :--- | :--- | :--- | :--- |
| 1 | 101 | 2026-01-01 | 50.00 |
| 2 | 101 | 2026-01-02 | 25.00 |
| 3 | 101 | 2026-01-02 | 15.00 |
| 4 | 101 | 2026-01-03 | 100.00 |
| 5 | 102 | 2026-01-01 | 200.00 |
| 6 | 102 | 2026-01-02 | 50.00 |

### Step-by-Step Execution Trace

The engine partitions the data by `user_id` and sorts each partition by `(order_date, order_id)`.

**Partition 1: `user_id = 101`** (Accumulator initialized: `acc = 0.00`)

1. **Row 1:** `(order_id: 1, date: '2026-01-01', amount: 50.00)`
   - Window Frame: Row 1
   - Calculation: `acc = 0.00 + 50.00 = 50.00`
   - Output `running_total`: **50.00**

2. **Row 2:** `(order_id: 2, date: '2026-01-02', amount: 25.00)`
   - Window Frame: Rows 1 through 2
   - Calculation: `acc = 50.00 + 25.00 = 75.00`
   - Output `running_total`: **75.00**

3. **Row 3:** `(order_id: 3, date: '2026-01-02', amount: 15.00)` *(Same date as Row 2, tie broken by `order_id`)*
   - Window Frame: Rows 1 through 3
   - Calculation: `acc = 75.00 + 15.00 = 90.00`
   - Output `running_total`: **90.00**
   - *Why explicit `ROWS` matters here:* If we had used default `RANGE`, Row 2 and Row 3 would both be considered peers on `2026-01-02`. The engine would have output `90.00` for both Row 2 and Row 3, skipping the intermediate state of `75.00`.

4. **Row 4:** `(order_id: 4, date: '2026-01-03', amount: 100.00)`
   - Window Frame: Rows 1 through 4
   - Calculation: `acc = 90.00 + 100.00 = 190.00`
   - Output `running_total`: **190.00**

**Partition Transition:** The engine detects a new `user_id = 102`. The accumulator resets to `acc = 0.00`.

**Partition 2: `user_id = 102`** (Accumulator initialized: `acc = 0.00`)

5. **Row 5:** `(order_id: 5, date: '2026-01-01', amount: 200.00)`
   - Window Frame: Row 5
   - Calculation: `acc = 0.00 + 200.00 = 200.00`
   - Output `running_total`: **200.00**

6. **Row 6:** `(order_id: 6, date: '2026-01-02', amount: 50.00)`
   - Window Frame: Rows 5 through 6
   - Calculation: `acc = 200.00 + 50.00 = 250.00`
   - Output `running_total`: **250.00**

### Final Result Set

| order_id | user_id | order_date | amount | running_total |
| :--- | :--- | :--- | :--- | :--- |
| 1 | 101 | 2026-01-01 | 50.00 | 50.00 |
| 2 | 101 | 2026-01-02 | 25.00 | 75.00 |
| 3 | 101 | 2026-01-02 | 15.00 | 90.00 |
| 4 | 101 | 2026-01-03 | 100.00 | 190.00 |
| 5 | 102 | 2026-01-01 | 200.00 | 200.00 |
| 6 | 102 | 2026-01-02 | 50.00 | 250.00 |

## 5. Edge Cases — The Ones That Break Naive Solutions

- **Duplicate Timestamps / Same-Day Ties:** When multiple records share the same ordering value, standard SQL window functions with `ORDER BY` default to `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. `RANGE` groups identical sort values into peer groups, summing the entire peer group at once. If an account has five transactions on the same second, all five rows will display the identical final batch total instead of incrementing one transaction at a time. The fix is always two-fold: add a unique secondary column (like `order_id` or `created_at`) to the `ORDER BY` clause, and specify `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.
- **NULL Values in the Aggregated Column:** In SQL standard aggregate behavior, `SUM(amount)` ignores `NULL` entries. If row 3 has `amount = NULL`, the accumulator keeps the previous sum (`50.00 + NULL = 50.00`). However, if all rows up to the current row are `NULL`, `SUM()` returns `NULL`. If your business logic expects numeric `0.00` rather than `NULL`, wrap the column in `COALESCE`: `SUM(COALESCE(amount, 0)) OVER (...)`.
- **Negative Numbers (Refunds and Debits):** A running total is not strictly monotonic. If an e-commerce platform processes a return or a bank records a debit, `amount` may be negative (`-25.00`). `SUM()` correctly subtracts the value from the running accumulator. Ensure the frontend or database schema handles running totals that dip below zero if overdrafts or negative balances are possible.
- **Empty Tables or Single-Row Partitions:** If a partition contains only one row, the window frame consists solely of that row, returning `running_total = amount`. If the table is empty, the query returns an empty result set without errors.
- **Missing or Partial Outer `ORDER BY`:** Calculating a window function does not guarantee that the client receives rows in chronological order. Without an outer `ORDER BY user_id, order_date, order_id`, the database query planner is free to stream output rows across multiple parallel execution workers in arbitrary order, producing scrambled rows on the UI.

## 6. Variations and Follow-ups

### Variation 1: Running Average (Moving Average from Inception)
Instead of a cumulative sum, compute the running average spend of a user across all historical orders.

```sql
SELECT
  order_id,
  user_id,
  order_date,
  amount,
  AVG(amount) OVER (
    PARTITION BY user_id
    ORDER BY order_date, order_id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_avg
FROM Orders;
```

### Variation 2: Rolling N-Day Window (e.g., 7-Day Trailing Sum)
Compute the total revenue generated by a user in the last 7 calendar days relative to each order date. Here, we use `RANGE` deliberately because we want a time-based duration rather than a fixed row count.

```sql
-- PostgreSQL / Redshift syntax for calendar intervals
SELECT
  order_id,
  user_id,
  order_date,
  amount,
  SUM(amount) OVER (
    PARTITION BY user_id
    ORDER BY order_date
    RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW
  ) AS rolling_7day_total
FROM Orders;
```
If you need a rolling window of the last 3 *orders* (row-based) rather than calendar days:
```sql
SUM(amount) OVER (
  PARTITION BY user_id
  ORDER BY order_date, order_id
  ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
) AS rolling_3_orders_total
```

### Variation 3: Pagination with Running Totals (The Checkpoint Problem)
**Follow-up Question:** "How do you paginate running totals (e.g., viewing Page 5 of transactions) without scanning all historical rows from day one on every API request?"

If you simply run `WHERE user_id = 101 LIMIT 20 OFFSET 80`, applying the window function directly on the filtered slice would compute the running total starting from row 81 (resetting to row 81's amount). 

To solve this in high-scale ledger systems:
1. **Window Before Limit (Subquery/CTE):** Wrap the window calculation in a CTE, then filter `WHERE row_num BETWEEN 81 AND 100`. The database still scans the preceding 80 rows to accumulate the sum, which is acceptable for modest offsets.
2. **Snapshot / Checkpoint Pattern (High Scale):** For accounts with millions of transactions, store monthly checkpoint balances in an `AccountBalances` table. The query fetches the latest month-start balance snapshot and calculates the running total only across the delta of transactions since that checkpoint.

## 7. 🧠 The Memory Hook

**To run, specify `ROWS`!** Default `RANGE` bundles duplicate dates into batch jumps. 

Remember the standard formula:
`SUM(col) OVER (PARTITION BY entity_id ORDER BY event_time, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`
It transforms what would be an $O(N^2)$ table-locking subquery into a single $O(N)$ streaming scan.
