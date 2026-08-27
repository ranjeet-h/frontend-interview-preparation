# Write a Query to Calculate Monthly Revenue in SQL

## 1. What the Interviewer Is Really Testing

Your PM says "show me revenue per month for the last two years." You write a quick `GROUP BY MONTH(order_date)` and the numbers look great in dev. Then you ship it and finance notices January 2023 and January 2024 are merged into one bucket, February is missing entirely because there were no sales, and refunds are counted as revenue.

This question looks like a basic `SUM` plus `GROUP BY`, but interviewers use it to filter for people who have actually shipped reporting queries. They are listening for four things:

1. **Do you group by year AND month, not just month?** Using `MONTH(order_date)` or `EXTRACT(MONTH FROM order_date)` collapses every January across all years into one row. You need a year-month key.
2. **Do you handle months with zero revenue?** A plain `GROUP BY` only returns months that have rows. Dashboards and finance reports need a continuous calendar — twelve rows for twelve months, with 0 for quiet months.
3. **Do you filter to real revenue?** You must only sum settled orders like `status = 'COMPLETED'`. Counting `PENDING`, `FAILED`, or `REFUNDED` rows inflates revenue.
4. **Do you know what kills performance?** Wrapping the date column in a function in `WHERE` can prevent index use. You need range filters and a sensible composite index.

## 2. Think Before You Code — The Senior Dev Thought Process

The first thing I notice is the schema. Assume an `orders` table with `id`, `order_date` (TIMESTAMP or DATETIME), `status`, and `amount` (DECIMAL). Some teams store `amount` per order, others store line items — but the prompt here is simple: one amount per order.

My brute-force instinct is:

```sql
SELECT MONTH(order_date), SUM(amount)
FROM orders WHERE status = 'COMPLETED' GROUP BY MONTH(order_date);
```

This is O(N) to scan and O(K log K) to sort K month groups, so it feels cheap. But it is wrong in three ways. First, `MONTH()` drops the year, so 2023-01 and 2024-01 collide. I need `YEAR + MONTH` together. Second, it skips months with no orders — February will not appear at all if there were zero completed orders. Third, it does not say which dialect's date function I am using, and each dialect does this slightly differently.

How do I recognize the right pattern? Any time the question says "per month" and the data spans more than a year, the signal is year-month truncation. PostgreSQL gives you `DATE_TRUNC('month', order_date)`, MySQL gives you `DATE_FORMAT(order_date, '%Y-%m')` or `EXTRACT(YEAR_MONTH)`, SQLite gives you `strftime('%Y-%m', order_date)`. All three do the same thing: snap a timestamp down to the first day of its month so every day in January 2024 maps to `2024-01-01` or the string `2024-01`.

For the missing-months problem, the pattern is calendar table plus `LEFT JOIN`. I can generate the months I want first, then left join the aggregated sales. That way a month with no sales still appears with `COALESCE(revenue, 0)`. The optimal plan at a high level is: filter completed orders in a date range, truncate each order_date to year-month, group and sum, and optionally left join against a generated month series for continuity. If the interviewer then asks for trends, I can layer a window function like `LAG()` on top without touching the base grouping.

## 3. The Solution — Fully Explained Code

**Solution 1: Basic monthly revenue — pick your dialect**

All three do the same thing: bucket by year-month, sum only completed orders.

```sql
-- Solution 1a: PostgreSQL — DATE_TRUNC snaps to first of month
-- WHY DATE_TRUNC: returns a real timestamp (2024-01-01 00:00:00) so sorting is chronological without string tricks
SELECT
    DATE_TRUNC('month', order_date) AS month,  -- truncation keeps year + month together
    SUM(amount) AS total_revenue
FROM orders
WHERE status = 'COMPLETED'
  -- WHY range filter: sargable — lets B-tree on order_date do an index range scan
  AND order_date >= '2024-01-01' AND order_date < '2025-01-01'
GROUP BY DATE_TRUNC('month', order_date)
ORDER BY month ASC;
```

```sql
-- Solution 1b: MySQL — DATE_FORMAT to year-month string
-- WHY DATE_FORMAT: MySQL has no DATE_TRUNC; formatting to '%Y-%m' keeps year and month together
SELECT
    DATE_FORMAT(order_date, '%Y-%m') AS month,
    SUM(amount) AS total_revenue
FROM orders
WHERE status = 'COMPLETED'
  AND order_date >= '2024-01-01' AND order_date < '2025-01-01'
GROUP BY DATE_FORMAT(order_date, '%Y-%m')
ORDER BY month ASC;
```

```sql
-- Solution 1c: SQLite — strftime (runnable in sqlite3 :memory:)
-- WHY strftime: SQLite stores dates as text; strftime extracts year-month reliably
SELECT
    strftime('%Y-%m', order_date) AS month,  -- keeps year + month together
    SUM(amount) AS total_revenue
FROM orders
WHERE status = 'COMPLETED'
GROUP BY strftime('%Y-%m', order_date)
ORDER BY month ASC;
```

```sql
-- Solution 1d: Portable YEAR() + MONTH() variant (MySQL / SQL Server style)
-- WHY YEAR/MONTH pair: explicit, avoids formatting, same bucket logic
SELECT
    YEAR(order_date) AS yr,
    MONTH(order_date) AS mon,
    SUM(amount) AS total_revenue
FROM orders
WHERE status = 'COMPLETED'
GROUP BY YEAR(order_date), MONTH(order_date)
ORDER BY yr ASC, mon ASC;
```

Time complexity: O(N) to scan the filtered rows plus O(K log K) to sort K month buckets, where N is matching orders and K is distinct months. Space complexity: O(K) for the aggregation hash table — one entry per month.

Index tip: on a large table (millions of rows) create `CREATE INDEX idx_orders_status_date_amount ON orders(status, order_date, amount)`. Filtering on `status` and a range on `order_date` can then be an index-only scan — the engine never touches the heap.

**Solution 2: Continuous calendar with zero-filled gaps (production grade)**

This is the version you ship when finance says "I need every month, even the quiet ones, with 0 instead of a missing row."

```sql
-- Solution 2: Recursive CTE calendar + LEFT JOIN (MySQL 8.0+ / PostgreSQL)
WITH RECURSIVE month_series AS (
    -- anchor: first month we want in the report
    SELECT CAST('2024-01-01' AS DATE) AS month_date
    UNION ALL
    -- step: add one month until we reach December
    SELECT DATE_ADD(month_date, INTERVAL 1 MONTH)
    FROM month_series
    WHERE month_date < '2024-12-01'
),
monthly_sales AS (
    -- pre-aggregate so we have exactly one row per month before joining
    SELECT
        DATE_FORMAT(order_date, '%Y-%m') AS order_month,
        SUM(amount) AS revenue
    FROM orders
    WHERE status = 'COMPLETED'
      AND order_date >= '2024-01-01' AND order_date < '2025-01-01'
    GROUP BY DATE_FORMAT(order_date, '%Y-%m')
)
SELECT
    DATE_FORMAT(ms.month_date, '%Y-%m') AS month,
    COALESCE(s.revenue, 0.00) AS total_revenue  -- WHY COALESCE: LEFT JOIN gives NULL for months with no sales
FROM month_series ms
LEFT JOIN monthly_sales s ON DATE_FORMAT(ms.month_date, '%Y-%m') = s.order_month
ORDER BY month ASC;
```

PostgreSQL variant of the same idea uses `DATE_TRUNC('month', order_date)` and `generate_series('2024-01-01'::date, '2024-12-01'::date, '1 month')` instead of the recursive CTE. SQLite variant uses `date(month_date, '+1 month')` and `strftime`. The shape stays identical: build calendar, left join sales.

**Solution 3: With month-over-month growth**

```sql
-- Solution 3: MoM growth using LAG()
WITH monthly_revenue AS (
    SELECT DATE_FORMAT(order_date, '%Y-%m') AS month, SUM(amount) AS total_revenue
    FROM orders WHERE status = 'COMPLETED' GROUP BY DATE_FORMAT(order_date, '%Y-%m')
)
SELECT
    month,
    total_revenue,
    LAG(total_revenue, 1) OVER (ORDER BY month ASC) AS previous_month_revenue,  -- WHY LAG: peek at prior row in sorted month order
    ROUND(
        (total_revenue - LAG(total_revenue, 1) OVER (ORDER BY month ASC))
        / NULLIF(LAG(total_revenue, 1) OVER (ORDER BY month ASC), 0) * 100.0, 2  -- WHY NULLIF: avoid division by zero when prior month was 0
    ) AS mom_growth_percentage
FROM monthly_revenue
ORDER BY month ASC;
```

## 4. Dry Run — Walk Through a Real Example

Take the first quarter of 2024. Input `orders`:

| id | order_date | status | amount |
| :--- | :--- | :--- | :--- |
| 1 | 2024-01-10 09:30:00 | COMPLETED | 150.00 |
| 2 | 2024-01-25 14:15:00 | COMPLETED | 250.00 |
| 3 | 2024-01-30 18:00:00 | CANCELLED | 500.00 |
| 4 | 2024-02-14 11:20:00 | PENDING | 100.00 |
| 5 | 2024-03-05 08:00:00 | COMPLETED | 400.00 |
| 6 | 2024-03-22 16:45:00 | COMPLETED | 100.00 |

Trace Solution 2 plus the LAG logic:

**Step 1: Calendar CTE builds the months we want.** Anchor `2024-01-01`, then add one month each iteration: `2024-02-01`, `2024-03-01`. Result month_series is three rows: 2024-01, 2024-02, 2024-03.

**Step 2: Filter and group into monthly_sales.** Row 1 and 2 both truncate to `2024-01` and are COMPLETED, so they stay. Row 3 is CANCELLED — dropped. Row 4 is PENDING — dropped. Rows 5 and 6 truncate to `2024-03` and are COMPLETED — they stay. Grouped sums: `2024-01` = 150 + 250 = 400.00. `2024-03` = 400 + 100 = 500.00. There is no row for `2024-02` at all.

**Step 3: LEFT JOIN calendar to sales.** `2024-01` finds 400.00. `2024-02` finds no match, so `s.revenue` is NULL and `COALESCE(NULL, 0.00)` becomes 0.00. `2024-03` finds 500.00. This is why finance sees a proper 0 for February instead of a missing row.

**Step 4: Window evaluation for MoM.** Order by month. For `2024-01`: LAG is NULL, growth is NULL (no prior month). For `2024-02`: revenue 0.00, LAG is 400.00, growth = (0 - 400)/400 * 100 = -100.00%. For `2024-03`: revenue 500.00, LAG is 0.00, `NULLIF(0,0)` returns NULL so the division yields NULL — we avoid a division-by-zero error and return NULL for growth instead of crashing.

Final result:

| month | total_revenue | previous_month_revenue | mom_growth_percentage |
| :--- | :--- | :--- | :--- |
| 2024-01 | 400.00 | NULL | NULL |
| 2024-02 | 0.00 | 400.00 | -100.00 |
| 2024-03 | 500.00 | 0.00 | NULL |

## 5. Edge Cases — The Ones That Break Naive Solutions

**Multi-year merging.** Using `GROUP BY MONTH(order_date)` puts every January from 2022, 2023, and 2024 into one bucket. Real reporting must keep year and month together. Fix by truncating: `DATE_TRUNC('month', order_date)` in PostgreSQL, `DATE_FORMAT(order_date, '%Y-%m')` in MySQL, `strftime('%Y-%m', order_date)` in SQLite, or grouping by `YEAR(order_date), MONTH(order_date)`.

**Months with no orders.** A plain GROUP BY never invents rows. If February had zero completed orders, February simply disappears. Dashboards then show a broken timeline. Fix by building the month list first with a recursive CTE or a calendar table and LEFT JOINing the aggregated sales, then `COALESCE(SUM(amount), 0)`.

**Timezone shifts.** If you store UTC, an order at `2024-01-31 23:30:00 UTC` is still January in UTC but `2024-02-01 08:30:00` in Tokyo. Grouping on raw UTC puts it in the wrong month for the business. Fix by converting before truncating: MySQL `CONVERT_TZ(order_date, '+00:00', 'America/New_York')`, PostgreSQL `order_date AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York'`, then truncate.

**Partial current month.** If you run the report on March 15, March is only half done. Comparing a half-month of March against a full February looks like revenue collapsed. Fix by either excluding the in-progress month with `WHERE order_date < DATE_TRUNC('month', NOW())`, or explicitly flagging it as partial so readers know it is incomplete, or filtering to `order_date < start_of_next_month`.

**NULL amounts and refunds.** `SUM()` ignores NULL, so a few NULL amounts silently undercount revenue without an error. Refunds sometimes appear as negative amounts or as separate `REFUNDED` rows. Fix by deciding the business rule up front: either filter refunds out with `status = 'COMPLETED'` or handle them explicitly with `SUM(CASE WHEN status = 'COMPLETED' THEN amount WHEN status = 'REFUNDED' THEN -amount ELSE 0 END)`, and add a `CHECK(amount IS NOT NULL)` or `COALESCE(amount, 0)` if your schema allows NULLs.

**Non-sargable filters.** Writing `WHERE DATE_FORMAT(order_date, '%Y-%m') = '2024-01'` forces the engine to run the function on every row and skips any index on `order_date`. On a 50-million-row table that is a full scan. Fix by using range predicates: `WHERE order_date >= '2024-01-01' AND order_date < '2024-02-01'` or `WHERE order_date >= '2024-01-01' AND order_date < '2025-01-01'` for a full year.

## 6. Variations and Follow-ups

**Rolling 3-month average.** "Show a smoothed trend, not just spikes." Use `AVG()` over a window frame. This averages the current month and the two before it, which flattens one-off spikes.

```sql
WITH monthly_revenue AS (
    SELECT DATE_FORMAT(order_date, '%Y-%m') AS month, SUM(amount) AS total_revenue
    FROM orders WHERE status = 'COMPLETED' GROUP BY DATE_FORMAT(order_date, '%Y-%m')
)
SELECT month, total_revenue,
       ROUND(AVG(total_revenue) OVER (ORDER BY month ASC ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS rolling_3mo_avg
FROM monthly_revenue ORDER BY month ASC;
```

If a month is missing from the base CTE, the window will average fewer than three points. That is why you usually build this on top of the zero-filled calendar query, not the bare GROUP BY.

**Year-over-year (YoY) same month last year.** "How did January 2024 do versus January 2023?" Two common ways. With contiguous months you can use `LAG(total_revenue, 12)`. More robustly, self-join on the same month number:

```sql
-- YoY using LAG when the calendar is continuous (12 rows per year)
WITH monthly_revenue AS (
    SELECT DATE_FORMAT(order_date, '%Y-%m') AS month, SUM(amount) AS total_revenue
    FROM orders WHERE status = 'COMPLETED' GROUP BY DATE_FORMAT(order_date, '%Y-%m')
)
SELECT month, total_revenue,
       LAG(total_revenue, 12) OVER (ORDER BY month ASC) AS same_month_last_year,
       ROUND((total_revenue - LAG(total_revenue, 12) OVER (ORDER BY month ASC)) * 100.0
             / NULLIF(LAG(total_revenue, 12) OVER (ORDER BY month ASC), 0), 2) AS yoy_growth_pct
FROM monthly_revenue ORDER BY month ASC;

-- YoY via self-join on month number (works even with gaps)
WITH monthly_revenue AS (
    SELECT DATE_FORMAT(order_date, '%Y-%m') AS month,
           EXTRACT(MONTH FROM order_date) AS mon,
           EXTRACT(YEAR FROM order_date) AS yr,
           SUM(amount) AS total_revenue
    FROM orders WHERE status = 'COMPLETED' GROUP BY yr, mon, month
)
SELECT cur.month, cur.total_revenue, prev.total_revenue AS same_month_last_year,
       ROUND((cur.total_revenue - prev.total_revenue) * 100.0 / NULLIF(prev.total_revenue, 0), 2) AS yoy_pct
FROM monthly_revenue cur LEFT JOIN monthly_revenue prev
  ON prev.mon = cur.mon AND prev.yr = cur.yr - 1
ORDER BY cur.month ASC;
```

**Fiscal year variant.** "Our fiscal year starts in April, not January." The business wants buckets like FY2023-2024 (Apr 2023 to Mar 2024). Shift the month before grouping:

```sql
-- MySQL: fiscal year starting April 1
SELECT
    CASE WHEN MONTH(order_date) >= 4
         THEN CONCAT(YEAR(order_date), '-', YEAR(order_date)+1)
         ELSE CONCAT(YEAR(order_date)-1, '-', YEAR(order_date))
    END AS fiscal_year,
    DATE_FORMAT(order_date, '%Y-%m') AS month,
    SUM(amount) AS total_revenue
FROM orders WHERE status = 'COMPLETED'
GROUP BY fiscal_year, month
ORDER BY month ASC;

-- PostgreSQL: same logic with DATE_TRUNC
SELECT
    CASE WHEN EXTRACT(MONTH FROM order_date) >= 4
         THEN EXTRACT(YEAR FROM order_date)::text || '-' || (EXTRACT(YEAR FROM order_date)+1)::text
         ELSE (EXTRACT(YEAR FROM order_date)-1)::text || '-' || EXTRACT(YEAR FROM order_date)::text
    END AS fiscal_year,
    DATE_TRUNC('month', order_date) AS month,
    SUM(amount) AS total_revenue
FROM orders WHERE status = 'COMPLETED'
GROUP BY fiscal_year, month
ORDER BY month ASC;
```

Change the `>= 4` to `>= 7` for a July-start fiscal year. The trick is the same: decide the fiscal year label before grouping.

**Other follow-ups interviewers like.** Cumulative year-to-date that resets each January: `SUM(total_revenue) OVER (PARTITION BY LEFT(month,4) ORDER BY month)`. Breakdown by product category: add `category_id` to both SELECT and GROUP BY and join through `order_items`. High-scale dashboard: pre-aggregate into a `monthly_revenue_summary` table or a materialized view refreshed nightly so the dashboard never scans raw orders.

## 7. 🧠 The Memory Hook

Month has two parts: year and month. If you group by only one, you collapse history. Build the calendar first, then left join your orders — that way the quiet months show 0 instead of vanishing, and every dialect is just a different spelling of "snap to first of month": `DATE_TRUNC` in Postgres, `DATE_FORMAT` in MySQL, `strftime` in SQLite.
