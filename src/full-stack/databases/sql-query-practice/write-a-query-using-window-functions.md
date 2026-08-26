# Write a Query Using Window Functions in SQL: Navigation, Framing, and Aggregation

## 1. What the Interviewer Is Really Testing

When an interviewer asks you to write a query using window functions, they are rarely testing whether you know that `ROW_NUMBER()` exists. They are testing whether you understand how to compute values across a related set of rows without destroying row identity.

Specifically, they are listening for four architectural concepts:

First, **Window Function Anatomy**. Can you fluently deconstruct `FUNCTION() OVER (PARTITION BY ... ORDER BY ... FRAME)`? Partitioning divides the dataset into independent calculation buckets; ordering establishes the sequence within each bucket; framing defines the sliding window of physical rows or logical ranges evaluated relative to the current row.

Second, **Row Preservation vs. Aggregation Collapse**. An aggregate query with `GROUP BY` collapses ten rows in a group into a single summary row. A window function calculates that exact same aggregation while preserving all ten original rows and appending the computed summary to each one.

Third, **Inter-Row Navigation Without Self-Joins**. Junior developers attempt to compare adjacent events using expensive, quadratic $O(N^2)$ self-joins (`JOIN table t2 ON t1.id = t2.prev_id`). Senior developers reach for `LEAD()` and `LAG()` to navigate time-series deltas and state transitions in a single scan.

Fourth, **Value Peeking and the `LAST_VALUE()` Default Frame Trap**. Knowing why functions like `FIRST_VALUE()` seem to work effortlessly while `LAST_VALUE()` silently returns the current row unless you explicitly override the default window frame.

## 2. Think Before You Code — The Senior Dev Thought Process

Imagine the interviewer gives you this problem:

"We have a clickstream table named `PageViews` that records every page visited by users (`id`, `session_id`, `page_url`, `visited_at`). Write a query that reports for every single page view: the timestamp of the previous page visit, the URL of the next page they went to, the time spent on the current page in seconds, and the total number of pages visited within that entire session."

Here is how an experienced engineer breaks this down before writing any SQL:

The naive approach is to write subqueries and self-joins. To get the previous and next visits, you could join `PageViews` to itself twice on matching `session_id` and timestamp inequality filters, taking `MAX()` and `MIN()`. To get the total pages in the session, you would join a separate `GROUP BY session_id` subquery back to the main table.

Why is the naive approach rejected?
- Performance: Self-joining an analytics table with millions of rows on non-equality conditions causes nested loop scans or massive hash joins, grinding the database to a halt.
- Correctness: Handling first visits, exit pages, and ties in timestamps with self-joins requires fragile `LEFT JOIN` and `COALESCE` workarounds.
- Readability: Three joins and an aggregation subquery turn a simple requirement into fifty lines of unreadable SQL.

The optimal approach uses SQL Window Functions over a partitioned stream:
- Partitioning: All calculations reset per user session, so our partition key is `session_id`.
- Ordering: Navigation (`LAG`, `LEAD`) depends on time sequence, so our ordering key is `visited_at`.
- Time Delta: The duration on the current page is the timestamp difference between the current row's `visited_at` and the next row's `visited_at` obtained via `LEAD()`.
- Session-Wide Count: Computing the total page count for the session is simply `SUM(1) OVER (PARTITION BY session_id)` or `COUNT(*) OVER (PARTITION BY session_id)`. Crucially, omitting `ORDER BY` in this specific window tells the database to evaluate the entire partition rather than a running cumulative total.
- Named Window: Because three of our calculations share the exact same partition and order specifications, we can define a reusable `WINDOW w AS (...)` clause at the end of the query to keep the code clean and maintainable.

## 3. The Solution — Fully Explained Code

Here is the database schema and the complete, production-ready SQL solution:

```sql
-- Schema definition
CREATE TABLE PageViews (
    id INT PRIMARY KEY,
    session_id VARCHAR(50) NOT NULL,
    page_url VARCHAR(255) NOT NULL,
    visited_at TIMESTAMP NOT NULL
);

-- Production Analytical Query
SELECT
    session_id,
    page_url,
    visited_at,
    -- 1. Previous page timestamp in the session (returns NULL for the landing page)
    LAG(visited_at) OVER w AS prev_visit,
    -- 2. Next page URL in the session (returns NULL for the exit page)
    LEAD(page_url) OVER w AS next_page,
    -- 3. Time spent on the current page in seconds
    TIMESTAMPDIFF(SECOND, visited_at, LEAD(visited_at) OVER w) AS time_on_page_sec,
    -- 4. Total pages visited in the entire session (retains all individual rows)
    SUM(1) OVER (PARTITION BY session_id) AS total_pages_in_session
FROM PageViews
WINDOW w AS (PARTITION BY session_id ORDER BY visited_at);
```

For PostgreSQL environments where `TIMESTAMPDIFF` is not a native keyword, the duration expression is written using standard epoch extraction:

```sql
EXTRACT(EPOCH FROM (LEAD(visited_at) OVER w - visited_at))::INT AS time_on_page_sec
```

Understanding how the database engine executes this:

1. `WINDOW w AS (PARTITION BY session_id ORDER BY visited_at)` defines our common window specification. The database sorts rows by `session_id` and then by `visited_at`.
2. `LAG(visited_at) OVER w` looks backward 1 row in the sorted partition buffer. On the first page of a session, there is no previous row, so it evaluates to `NULL`.
3. `LEAD(page_url) OVER w` looks forward 1 row in the partition buffer. On the final page of a session, there is no subsequent row, so it evaluates to `NULL`.
4. `TIMESTAMPDIFF(SECOND, visited_at, LEAD(visited_at) OVER w)` calculates the duration between the current row's timestamp and the next row's timestamp. The final page evaluates to `NULL` because `LEAD()` is `NULL`, correctly signaling an unknown session termination duration.
5. `SUM(1) OVER (PARTITION BY session_id)` intentionally does not use `w` because it omits `ORDER BY`. When `ORDER BY` is omitted from an aggregation window, the frame spans the entire partition, returning the total session count for every single row without collapsing them.

**The `LAST_VALUE()` Default Frame Trap:**

If the interviewer asks you to retrieve the landing page URL and the final exit page URL for each row, candidates often write:

```sql
-- DANGEROUS MISTAKE:
FIRST_VALUE(page_url) OVER w AS landing_page,
LAST_VALUE(page_url) OVER w AS exit_page
```

`FIRST_VALUE()` works as expected, but `LAST_VALUE()` fails silently and returns the current row's `page_url` on every row!

Why? Whenever `ORDER BY` is present in a window specification, the SQL standard applies a default window frame:
`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`

At any given row, the evaluation window starts at the beginning of the partition and stops at the **current row**. Therefore, the "last value" in that window is always the current row.

To make `LAST_VALUE()` return the true final row of the partition, you must explicitly expand the frame to the end of the partition:

```sql
LAST_VALUE(page_url) OVER (
    PARTITION BY session_id
    ORDER BY visited_at
    ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING
) AS true_exit_page
```

**Complexity Analysis:**

- **Time Complexity:** $O(N \log N)$ where $N$ is the total number of rows. Sorting the table by `PARTITION BY` and `ORDER BY` columns dominates execution time. If a composite index on `(session_id, visited_at)` exists, the database reads the index directly in pre-sorted order, reducing time complexity to $O(N)$ linear streaming scan.
- **Space Complexity:** $O(M)$ where $M$ is the number of rows in the largest single session partition, required to buffer the partition in memory during window evaluation.

## 4. Dry Run — Walk Through a Real Example

Let us trace the query execution across a sample dataset containing two distinct sessions:

Raw `PageViews` table:

| id | session_id | page_url | visited_at |
| :--- | :--- | :--- | :--- |
| 1 | S100 | /home | 2026-08-26 10:00:00 |
| 2 | S100 | /pricing | 2026-08-26 10:02:00 |
| 3 | S100 | /checkout | 2026-08-26 10:05:00 |
| 4 | S200 | /blog | 2026-08-26 11:00:00 |
| 5 | S200 | /home | 2026-08-26 11:00:45 |

Execution Step-by-Step:

**Partition 1: `session_id = 'S100'` (3 rows total)**
The engine reads all rows for `S100` ordered by `visited_at`. It computes the partition total: `SUM(1) = 3`.

- **Row 1 (`/home`, `10:00:00`):**
  - `prev_visit`: No preceding row $\rightarrow$ `NULL`
  - `next_page`: Next row's URL $\rightarrow$ `/pricing`
  - `time_on_page_sec`: Difference between `10:00:00` and `10:02:00` $\rightarrow$ `120` seconds
  - `total_pages_in_session`: Partition count $\rightarrow$ `3`

- **Row 2 (`/pricing`, `10:02:00`):**
  - `prev_visit`: Preceding row's timestamp $\rightarrow$ `10:00:00`
  - `next_page`: Next row's URL $\rightarrow$ `/checkout`
  - `time_on_page_sec`: Difference between `10:02:00` and `10:05:00` $\rightarrow$ `180` seconds
  - `total_pages_in_session`: Partition count $\rightarrow$ `3`

- **Row 3 (`/checkout`, `10:05:00`):**
  - `prev_visit`: Preceding row's timestamp $\rightarrow$ `10:02:00`
  - `next_page`: No following row $\rightarrow$ `NULL`
  - `time_on_page_sec`: Next timestamp is `NULL` $\rightarrow$ `NULL`
  - `total_pages_in_session`: Partition count $\rightarrow$ `3`

**Partition 2: `session_id = 'S200'` (2 rows total)**
The engine crosses the partition boundary. All window buffers reset. Partition total: `SUM(1) = 2`.

- **Row 4 (`/blog`, `11:00:00`):**
  - `prev_visit`: Partition reset, no preceding row $\rightarrow$ `NULL`
  - `next_page`: Next row's URL $\rightarrow$ `/home`
  - `time_on_page_sec`: Difference between `11:00:00` and `11:00:45` $\rightarrow$ `45` seconds
  - `total_pages_in_session`: Partition count $\rightarrow$ `2`

- **Row 5 (`/home`, `11:00:45`):**
  - `prev_visit`: Preceding row's timestamp $\rightarrow$ `11:00:00`
  - `next_page`: No following row $\rightarrow$ `NULL`
  - `time_on_page_sec`: `NULL`
  - `total_pages_in_session`: Partition count $\rightarrow$ `2`

Final Result Set:

| session_id | page_url | visited_at | prev_visit | next_page | time_on_page_sec | total_pages_in_session |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| S100 | /home | 10:00:00 | NULL | /pricing | 120 | 3 |
| S100 | /pricing | 10:02:00 | 10:00:00 | /checkout | 180 | 3 |
| S100 | /checkout | 10:05:00 | 10:02:00 | NULL | NULL | 3 |
| S200 | /blog | 11:00:00 | NULL | /home | 45 | 2 |
| S200 | /home | 11:00:45 | 11:00:00 | NULL | NULL | 2 |

## 5. Edge Cases — The Ones That Break Naive Solutions

**1. Single-Page Bounce Sessions**
When a user visits only one page and immediately leaves, `LAG()` is `NULL`, `LEAD()` is `NULL`, and `time_on_page_sec` evaluates to `NULL`. The total page count must still correctly evaluate to `1`. If your application contract requires a fallback duration (such as 0), wrap the expression in `COALESCE(TIMESTAMPDIFF(...), 0)`.

**2. Duplicate Timestamps in the Same Partition**
If a client logs two events at the exact same millisecond, `ORDER BY visited_at` has non-deterministic ordering. Different database query runs may flip the sequence of the two pages, causing erratic `LEAD` and `LAG` calculations. Always add a deterministic tie-breaker column to the window: `ORDER BY visited_at, id`.

**3. The `ROWS` vs. `RANGE` Frame Pitfall with Duplicate Values**
When `ORDER BY` contains duplicate values, the default `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` treats all duplicate values as "peer rows" and processes them as a single batch. If you are calculating a running sum `SUM(amount) OVER (ORDER BY created_at)` and three transactions share the same timestamp, all three will display the sum of all three transactions combined. To strictly calculate row-by-row accumulation, always specify `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.

**4. Filtering on Window Function Output (SQL Execution Order)**
A candidate will often try to filter for drop-off pages by writing:
`WHERE LEAD(page_url) OVER w IS NULL`
This fails with a syntax error. SQL engines evaluate `WHERE` before `SELECT` and window functions. To filter by window function results, you must compute them inside a Common Table Expression (CTE) or subquery first, and filter in the outer query:

```sql
WITH AnalyzedViews AS (
    SELECT
        session_id,
        page_url,
        LEAD(page_url) OVER (PARTITION BY session_id ORDER BY visited_at) AS next_page
    FROM PageViews
)
SELECT * FROM AnalyzedViews WHERE next_page IS NULL;
```

**5. Memory Pressure on Oversized Partitions**
If a runaway bot or scraper generates ten million events under a single `session_id`, the database engine cannot flush the partition until all ten million rows are processed. The database will exceed `work_mem` and spill temporary sort files to disk, creating severe I/O degradation. In production event streams, always combine window analytics with bounded date ranges in the `WHERE` clause.

## 6. Variations and Follow-ups

**Variation 1: Ranking Functions — `ROW_NUMBER()` vs. `RANK()` vs. `DENSE_RANK()`**
An interviewer will frequently ask you to identify the top three longest viewed pages per session or rank page view sequence. You must articulate the differences:
- `ROW_NUMBER()`: Assigns a strict sequential integer (1, 2, 3, 4, 5) with no ties, breaking ties arbitrarily if not specified.
- `RANK()`: Assigns the same rank to identical values, but skips subsequent rank numbers to maintain count parity (1, 2, 2, 4).
- `DENSE_RANK()`: Assigns the same rank to identical values without skipping numbers (1, 2, 2, 3).

**Variation 2: Cumulative Running Totals vs. Full Partition Aggregations**
Understanding the presence of `ORDER BY`:
- `SUM(amount) OVER (PARTITION BY account_id)` computes the static total balance across all rows for that account.
- `SUM(amount) OVER (PARTITION BY account_id ORDER BY transaction_date)` computes the running cumulative balance updated row-by-row up to the current transaction.

**Variation 3: Sessionization and Inactivity Detection (Gaps-and-Islands)**
What if `session_id` does not exist in the raw table, and you are asked to group events into sessions whenever there is a 30-minute gap of inactivity?
This classic senior follow-up is solved in three window steps:
1. Use `LAG(visited_at)` to find the time delta from the preceding event.
2. Flag new session starts using a conditional: `CASE WHEN time_delta > 30 MINUTES OR time_delta IS NULL THEN 1 ELSE 0 END AS is_new_session`.
3. Compute a running sum of the flag: `SUM(is_new_session) OVER (PARTITION BY user_id ORDER BY visited_at) AS generated_session_id`. Every time a gap exceeds 30 minutes, the counter increments, dynamically tagging subsequent events with the new session ID.

## 7. 🧠 The Memory Hook

`GROUP BY` collapses many rows into one; Window Functions calculate across rows while leaving every single row standing.

Remember the two `ORDER BY` rules:
1. Adding `ORDER BY` turns a whole-partition total into a running cumulative sum.
2. Adding `ORDER BY` turns `LAST_VALUE()` into `CURRENT_ROW` unless you explicitly push the frame to `UNBOUNDED FOLLOWING`.

