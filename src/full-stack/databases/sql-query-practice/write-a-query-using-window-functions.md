# Write a Query Using Window Functions in SQL: Navigation, Framing, and Aggregation

## 1. What the Interviewer Is Really Testing

Give a junior two SQL questions and they look almost identical: "give me the total pages per session" and "show each page view with the total pages in its session." The first one is a `GROUP BY`. The second one is a window function. If you use `GROUP BY` for the second, you collapse ten rows into one and lose the detail you were asked to keep.

That difference is what the interviewer is listening for.

When they say "write a query using window functions," they are not checking if you can spell `ROW_NUMBER()`. They are checking if you can think in terms of "compute across related rows while keeping every row."

They listen for five things at once.

First, do you see when a window is the right tool versus `GROUP BY`. `GROUP BY` collapses. `OVER()` keeps rows and appends a calculation. If the prompt says "for each row, also show..." or "without losing the original rows," that is a window.

Second, can you read and build `FUNCTION() OVER (PARTITION BY ... ORDER BY ... frame)` out loud. `PARTITION BY` splits the table into independent buckets. `ORDER BY` sorts inside each bucket. The frame says how many rows around the current row to look at. If you can say which part does what, you can write any window.

Third, can you navigate between rows without a self-join. Juniors join a table to itself on `session_id` and a timestamp inequality to find the previous page. That works on 100 rows and dies on 10 million. Seniors use `LAG()` and `LEAD()` and do it in one scan.

Fourth, do you know the ranking family and when each one lies. `ROW_NUMBER()` gives 1,2,3,4 no matter what. `RANK()` gives 1,2,2,4 and skips. `DENSE_RANK()` gives 1,2,2,3 and does not skip. If you mix them up, "top 3 per category" returns the wrong rows.

Fifth, do you know the default frame trap. As soon as you add `ORDER BY`, the database quietly adds `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. That makes `LAST_VALUE()` return the current row instead of the last row in the partition unless you override the frame. People who have only seen examples get bitten here live.

If you can explain those five, the syntax is just typing.

## 2. Think Before You Code — The Senior Dev Thought Process

The interviewer says: "We have `PageViews(id, session_id, page_url, visited_at)`. For every single page view, return the previous page timestamp, the next page URL, seconds spent on the current page, and the total pages in that whole session."

My first thought is how I would do it without windows, just to see why it hurts.

I could get the previous visit with a self-join: join `PageViews t1` to `PageViews t2` on `t2.session_id = t1.session_id AND t2.visited_at = MAX(visited_at) WHERE visited_at < t1.visited_at`. Same for next page but with `MIN()` and `>`. For total per session I could do a separate `SELECT session_id, COUNT(*) FROM PageViews GROUP BY session_id` and join it back. That is three joins plus an aggregation.

Why I throw that away: on a clickstream table those inequalities are not equality joins, they force a nested loop or a huge hash. It is O(N squared) in the worst case inside each session. It also gets messy at the edges — first page has no previous, last page has no next, so every join has to be a `LEFT JOIN` with `COALESCE`. And the query is 40+ lines for something conceptually simple.

What pattern am I actually looking at? Every calculation resets per `session_id` and depends on time order. That is the exact phrase that should trigger "window partitioned by session, ordered by time." The words "previous" and "next" map to `LAG()` and `LEAD()`. "Total for the whole session while keeping every row" maps to `COUNT(*) OVER (PARTITION BY session_id)` with no `ORDER BY`. "Time on page" is just the gap between this row and the next row, so `LEAD(visited_at) - visited_at`.

So the high-level plan before I type is: one window `w AS (PARTITION BY session_id ORDER BY visited_at, id)` reused for the navigation columns, and a separate partition-only window for the total. `LAG` looks back one, `LEAD` looks forward one, both return `NULL` naturally at the partition edges which is exactly what we want for entry and exit pages. If I have an index on `(session_id, visited_at, id)`, the engine can read in order and do this in a single streaming pass instead of sorting.

That is what I would say out loud before writing code. It tells the interviewer I recognized the shape, not just the function name.

## 3. The Solution — Fully Explained Code

Here is a complete, runnable example. The main query runs on PostgreSQL, MySQL 8+, and SQLite 3.25+ — all three support `OVER()` and the `WINDOW` clause. The duration math differs by dialect, so both versions are shown.

```sql
-- Schema
CREATE TABLE PageViews (
    id         INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,
    page_url   TEXT NOT NULL,
    visited_at TEXT NOT NULL  -- ISO-8601 timestamp, e.g. '2026-08-26 10:00:00'
);

-- Sample data (same data used in the dry run)
INSERT INTO PageViews (id, session_id, page_url, visited_at) VALUES
(1, 'S100', '/home',     '2026-08-26 10:00:00'),
(2, 'S100', '/pricing',  '2026-08-26 10:02:00'),
(3, 'S100', '/checkout', '2026-08-26 10:05:00'),
(4, 'S200', '/blog',     '2026-08-26 11:00:00'),
(5, 'S200', '/home',     '2026-08-26 11:00:45');

-- Main query: one reusable window + one partition-only aggregate
SELECT
    session_id,
    page_url,
    visited_at,
    -- look back one row inside this session, ordered by time
    LAG(visited_at) OVER w AS prev_visit,
    -- look forward one row inside this session
    LEAD(page_url) OVER w AS next_page,
    -- seconds on this page = next timestamp minus current timestamp
    -- SQLite version (exact integer seconds):
    CAST(strftime('%s', LEAD(visited_at) OVER w) - strftime('%s', visited_at) AS INTEGER)
        AS time_on_page_sec,
    -- whole-partition total: no ORDER BY, so frame = entire partition
    COUNT(*) OVER (PARTITION BY session_id) AS total_pages_in_session
FROM PageViews
WINDOW w AS (PARTITION BY session_id ORDER BY visited_at, id);
```

For MySQL you swap the duration expression. Everything else stays identical:

```sql
-- MySQL duration version (replace the CAST(julianday...) line):
TIMESTAMPDIFF(SECOND, visited_at, LEAD(visited_at) OVER w) AS time_on_page_sec
```

For PostgreSQL you can also write:

```sql
-- Postgres duration version:
EXTRACT(EPOCH FROM (LEAD(visited_at) OVER w::timestamp - visited_at::timestamp))::INT
    AS time_on_page_sec
```

Why each piece is there:

- `WINDOW w AS (PARTITION BY session_id ORDER BY visited_at, id)` defines the common spec once. `PARTITION BY session_id` says "restart all calculations when the session changes." `ORDER BY visited_at, id` sorts inside each session. The `id` tie-breaker makes the order deterministic when two events share the same timestamp.
- `LAG(visited_at) OVER w` reads the previous row in that sorted buffer. On the first row of a partition there is no previous row, so it returns `NULL` — which correctly means "this is the landing page."
- `LEAD(page_url) OVER w` reads the next row. On the last row it returns `NULL` — "this is the exit page."
- `COUNT(*) OVER (PARTITION BY session_id)` deliberately does not use `w`. No `ORDER BY` means the frame is the whole partition, so every row in S100 sees `3` and every row in S200 sees `2`. If you added `ORDER BY visited_at`, you would get a running count 1,2,3 instead of the total.
- The `WINDOW` clause is just an alias. It does not change semantics; it keeps the query from repeating the same `PARTITION BY ... ORDER BY` three times.

The `LAST_VALUE()` trap, shown separately because you will be asked about it:

```sql
-- Looks right, but LAST_VALUE silently returns the current row:
SELECT
    session_id,
    page_url,
    FIRST_VALUE(page_url) OVER w AS landing_page,  -- works: frame starts at first row
    LAST_VALUE(page_url) OVER w  AS broken_exit    -- broken: default frame ends at current row
FROM PageViews
WINDOW w AS (PARTITION BY session_id ORDER BY visited_at, id);

-- Correct: push the frame to the end of the partition
SELECT
    session_id,
    page_url,
    LAST_VALUE(page_url) OVER (
        PARTITION BY session_id ORDER BY visited_at, id
        ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING
    ) AS true_exit_page
FROM PageViews;
```

Why the trap exists: when `ORDER BY` is present and you do not write a frame, the SQL standard supplies `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. At row 2 of 3, "last value in the frame" is row 2, not row 3. You have to explicitly say you want through `UNBOUNDED FOLLOWING`.

Time complexity is O(N log N) for the sort on `PARTITION BY` + `ORDER BY`, where N is total rows scanned. With a composite index on `(session_id, visited_at, id)`, the engine can read in pre-sorted order and the window pass itself is O(N) — one streaming scan over the sorted input. Space complexity is O(M) where M is the size of the largest partition held in memory. If you partition by a low-cardinality key and one partition has millions of rows, that buffer is what spills to disk.

## 4. Dry Run — Walk Through a Real Example

Take the five rows we inserted. The engine first sorts by `session_id`, then `visited_at`, then `id` (already sorted).

Partition 1: `session_id = 'S100'` with 3 rows. The partition total `COUNT(*) OVER (PARTITION BY session_id)` is 3 for every row in this bucket. The window buffer for `w` is `[row1 /home 10:00:00, row2 /pricing 10:02:00, row3 /checkout 10:05:00]`.

Row 1 — `/home` at `10:00:00`: `LAG` looks before position 1, nothing there, so `prev_visit = NULL`. `LEAD` looks at position 2, sees `/pricing`, so `next_page = '/pricing'`. Time on page is `julianday('10:02:00') - julianday('10:00:00')` = 120 seconds. Total = 3.

Row 2 — `/pricing` at `10:02:00`: `LAG` sees position 1 timestamp `10:00:00`, so `prev_visit = '10:00:00'`. `LEAD` sees position 3 URL `/checkout`, so `next_page = '/checkout'`. Gap to next row is 180 seconds. Total = 3.

Row 3 — `/checkout` at `10:05:00`: `LAG` sees `10:02:00`. `LEAD` looks past the end of the buffer, nothing there, so `next_page = NULL` and the duration is `NULL` — we do not know when the session actually ended. Total = 3.

The engine hits the partition boundary. All buffers for S100 are released.

Partition 2: `session_id = 'S200'` with 2 rows. Partition total is 2. Buffer is `[row4 /blog 11:00:00, row5 /home 11:00:45]`.

Row 4 — `/blog` at `11:00:00`: this is the first row of a new partition, so `prev_visit = NULL` again even though S100 had rows before it — partitions are independent. `next_page = '/home'`. Gap is 45 seconds. Total = 2.

Row 5 — `/home` at `11:00:45`: `prev_visit = '11:00:00'`. `LEAD` is past the end, so `next_page = NULL` and duration `NULL`. Total = 2.

Final result:

| session_id | page_url | visited_at | prev_visit | next_page | time_on_page_sec | total_pages_in_session |
|---|---|---|---|---|---|---|
| S100 | /home | 10:00:00 | NULL | /pricing | 120 | 3 |
| S100 | /pricing | 10:02:00 | 10:00:00 | /checkout | 180 | 3 |
| S100 | /checkout | 10:05:00 | 10:02:00 | NULL | NULL | 3 |
| S200 | /blog | 11:00:00 | NULL | /home | 45 | 2 |
| S200 | /home | 11:00:45 | 11:00:00 | NULL | NULL | 2 |

If you wrap `time_on_page_sec` with `COALESCE(..., 0)`, the exit pages show 0 instead of NULL — that is a product decision, not a window mechanic.

## 5. Edge Cases — The Ones That Break Naive Solutions

**You cannot put a window function in WHERE or GROUP BY.** SQL evaluates `WHERE` before `SELECT`, and windows are evaluated inside `SELECT`. Writing `WHERE LEAD(page_url) OVER w IS NULL` is a syntax error on every engine. The fix is to compute first, filter after — either a CTE or a subquery: `WITH t AS (SELECT ..., LEAD(...) OVER w AS next_page FROM PageViews) SELECT * FROM t WHERE next_page IS NULL`. That outer filter then correctly finds every exit page.

**The default frame makes `LAST_VALUE()` lie.** With `ORDER BY` and no explicit frame, the frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. `FIRST_VALUE` is safe because the first row is always in that frame, but `LAST_VALUE` returns the current row on every row. You must write `ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING` or equivalently `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` to see the true end. Interviewers love this question because it is silent — no error, just wrong answers.

**`RANGE` versus `ROWS` with duplicates.** `ROWS` counts physical rows. `RANGE` groups peers that share the same `ORDER BY` value. If three rows share `visited_at = '10:00:00'` and you write `SUM(amount) OVER (ORDER BY visited_at)`, the default `RANGE` frame puts all three peers in the same frame, so all three show the sum of all three. Change to `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` if you want row-by-row accumulation. This also explains why `RANGE` can only be used with a single `ORDER BY` expression on most engines.

**Duplicate timestamps need a tie-breaker.** `ORDER BY visited_at` alone is non-deterministic when two events have the same millisecond. Two runs of the same query can flip which page `LEAD` thinks is next. Always add a unique column: `ORDER BY visited_at, id`. Without it, navigation results are correct per the SQL spec but surprising in practice.

**Single-row partitions return NULL for navigation.** A bounce session with one page has `LAG = NULL`, `LEAD = NULL`, duration `NULL`, and `COUNT(*) = 1`. If your app treats `NULL` duration as 0, wrap it: `COALESCE(CAST((julianday(LEAD(...) OVER w) - julianday(visited_at))*86400 AS INTEGER), 0)`. The partition logic itself is correct — do not add special-case `CASE` branches for bounce sessions.

**One giant partition can spill.** Windows buffer the current partition. If a bot creates 10 million events under one `session_id`, that partition does not flush until the last row is processed. The engine exceeds `work_mem` (Postgres) or `sort_buffer` (MySQL) and spills to disk or temp files, and the query looks like it hung. In production, always bound the window with a `WHERE visited_at BETWEEN ...` or a date partition so no single `PARTITION BY` key can grow without limit.

## 6. Variations and Follow-ups

**Variation 1: Running total versus whole-partition total.**

This is the first follow-up and it tests whether you know what `ORDER BY` does inside `OVER`.

```sql
-- Whole-partition total: every row for this account shows the same final balance
SELECT account_id, transaction_date, amount,
       SUM(amount) OVER (PARTITION BY account_id) AS total_balance
FROM Transactions;

-- Running cumulative total: each row shows sum up to and including that row
SELECT account_id, transaction_date, amount,
       SUM(amount) OVER (PARTITION BY account_id ORDER BY transaction_date, id) AS running_balance
FROM Transactions;

-- Explicit frame for the running version (same as default when ORDER BY is present):
SUM(amount) OVER (
    PARTITION BY account_id ORDER BY transaction_date, id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
) AS running_balance
```

Adding `ORDER BY` changes the frame from "whole partition" to "from start through current row." Removing it goes back to the total. If you can say that sentence, you will not get this wrong.

**Variation 2: Top N per group.**

"What are the top 2 most recent page views per session?" or "cheapest 3 products per category?" This is `ROW_NUMBER()` or `RANK()` inside a CTE, filtered outside. Remember you cannot filter on a window in the same SELECT, same reason as the edge case above.

```sql
-- Top 2 latest pages per session (ROW_NUMBER = exactly 2 rows, ties broken arbitrarily)
WITH ranked AS (
    SELECT
        session_id, page_url, visited_at,
        ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY visited_at DESC, id DESC) AS rn
    FROM PageViews
)
SELECT session_id, page_url, visited_at
FROM ranked
WHERE rn <= 2
ORDER BY session_id, rn;

-- If ties should count — e.g. "top 2 distinct view counts, keep all ties" — use RANK or DENSE_RANK
-- Suppose you rank products by price per category, lowest first:
-- ROW_NUMBER: 1,2,3,4 (no ties, picks arbitrarily among equal prices)
-- RANK:       1,1,3,4 (ties share rank, skips numbers, so rank 2 may have zero rows)
-- DENSE_RANK: 1,1,2,3 (ties share rank, no gaps, so "WHERE rank <= 2" may return 3+ rows)

WITH ranked AS (
    SELECT category, product_name, price,
           RANK() OVER (PARTITION BY category ORDER BY price ASC) AS rnk
    FROM Products
)
SELECT category, product_name, price
FROM ranked
WHERE rnk <= 3;  -- with RANK, you may get more than 3 rows per category when prices tie
```

The nuance to say in the interview: use `ROW_NUMBER` when you need exactly N rows. Use `RANK` or `DENSE_RANK` when ties should stay together and you are okay returning more than N rows.

**Variation 3: Year-over-year or period-over-period with LAG.**

"For each region and year, show sales and the change from the previous year." This is `LAG` partitioned by the dimension and ordered by time, exactly like the PageViews example but with arithmetic on the lag value.

```sql
CREATE TABLE RegionalSales (
    region TEXT NOT NULL,
    year   INTEGER NOT NULL,
    sales  INTEGER NOT NULL,
    PRIMARY KEY (region, year)
);

INSERT INTO RegionalSales VALUES
('West', 2021, 100), ('West', 2022, 140), ('West', 2023, 130),
('East', 2021,  80), ('East', 2022,  80), ('East', 2023, 110);

SELECT
    region,
    year,
    sales,
    LAG(sales) OVER (PARTITION BY region ORDER BY year) AS prev_year_sales,
    sales - LAG(sales) OVER (PARTITION BY region ORDER BY year) AS yoy_delta,
    ROUND(
        100.0 * (sales - LAG(sales) OVER (PARTITION BY region ORDER BY year))
        / NULLIF(LAG(sales) OVER (PARTITION BY region ORDER BY year), 0)
    , 1) AS yoy_percent
FROM RegionalSales
ORDER BY region, year;
```

Result for West: 2021 `prev NULL, delta NULL`, 2022 `prev 100, delta 40, 40.0%`, 2023 `prev 140, delta -10, -7.1%`. Partitioning by `region` keeps East and West independent; ordering by `year` makes `LAG` step back exactly one year. The `NULLIF` guards division by zero if a previous year had 0 sales. If years can be missing (no row for 2022), `LAG` still steps to the previous existing row — it does not know about calendar gaps. For true calendar-year comparison, left-join a calendar table first, then window over it.

A common follow-up is "what if the interviewer wants a 3-year moving average instead?" Same pattern, just change the frame:

```sql
AVG(sales) OVER (
    PARTITION BY region ORDER BY year
    ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
) AS moving_avg_3y
```

**Other follow-ups you should be ready for:** "Do it without `WINDOW` alias" — just inline the `PARTITION BY ... ORDER BY` each time; "Why not use a correlated subquery?" — because the window is one sort and one scan while the subquery is N index lookups; "Need distinct window specs in one query?" — you can define multiple windows: `WINDOW w1 AS (...), w2 AS (...)`.

## 7. 🧠 The Memory Hook

`GROUP BY` collapses rows to make a summary. Window functions keep every row standing and tape the summary next to it.

If you remember one rule, remember this: adding `ORDER BY` inside `OVER()` turns a whole-partition answer into a running answer — and the moment you add `ORDER BY`, the frame shrinks to "through current row," so `LAST_VALUE` only tells the truth if you stretch the frame to `UNBOUNDED FOLLOWING`.

