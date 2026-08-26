# Write a Query to Calculate Monthly Revenue in SQL

## 1. What the Interviewer Is Really Testing

On the surface, calculating monthly revenue looks like a simple `GROUP BY` aggregation query. In reality, interviewers use this question as an immediate filter to separate candidates who only know textbook SQL syntax from engineers who have run queries on real-world production databases.

The interviewer is evaluating four core competencies:

1. **Temporal Grouping & The Cross-Year Aggregation Bug:** Junior candidates frequently write `GROUP BY MONTH(order_date)`. This disastrously merges January 2023 with January 2024 into a single bucket. You must demonstrate how to group by compound year-month units or truncate timestamps (`DATE_FORMAT(order_date, '%Y-%m')` in MySQL, `TO_CHAR(order_date, 'YYYY-MM')` or `DATE_TRUNC('month', order_date)` in PostgreSQL).
2. **The Zero-Revenue Gap Problem:** If your store records zero completed orders in February, a standard `GROUP BY` completely omits February from the output rows. Downstream consumers like analytics dashboards or financial reports will have broken time series. Can you generate a continuous date dimension using a recursive CTE or calendar table and `LEFT JOIN` the transactional data?
3. **Transaction State Filtering:** Revenue cannot be calculated by blindly summing all rows. You must filter strictly on successful, settled states (`status = 'COMPLETED'`) to avoid counting failed payments, pending orders, or refunds.
4. **Performance & Indexing Strategy:** When querying tens of millions of rows, wrapping columns in functions inside the `WHERE` or `GROUP BY` clause can prevent standard B-tree index lookups. You must understand composite covering indexes like `INDEX(status, order_date, amount)` to enable lightning-fast index-only scans.

## 2. Think Before You Code — The Senior Dev Thought Process

When approaching this problem, the first step is clarifying the schema and business definitions. Assume an `orders` table with columns: `id` (BIGINT), `order_date` (DATETIME / TIMESTAMP), `status` (VARCHAR), and `amount` (DECIMAL).

The naive instinct is to write a single-pass aggregation:
```sql
SELECT MONTH(order_date), SUM(amount) 
FROM orders 
WHERE status = 'COMPLETED' 
GROUP BY MONTH(order_date);
```

This immediately fails across multi-year data. `MONTH('2023-01-10')` and `MONTH('2024-01-15')` both return `1`, causing two completely different years to add together into a single corrupted sum. To preserve unique monthly buckets, we must format the date to `'YYYY-MM'` or truncate the date to the first of each month.

The next consideration is calendar gaps. If no sales occurred in a given month, a plain `GROUP BY` skips that month entirely. If the business requests a report for the full calendar year 2024, the output must contain all 12 rows from `2024-01` to `2024-12`, with missing months displaying `$0.00` rather than disappearing. We achieve this by building a Recursive Common Table Expression (CTE) to generate all target months, then `LEFT JOIN` our aggregated sales.

Finally, if the interviewer asks for Month-over-Month (MoM) growth trajectory, we use the `LAG()` window function to retrieve the previous month's revenue and compute percentage growth.

## 3. The Solution — Fully Explained Code

**Solution 1: Direct Grouping by Year-Month (Standard MySQL / PostgreSQL)**

This query groups all completed orders into distinct year-month buckets and sorts chronologically.

```sql
-- Solution 1: Direct grouping by Year-Month (MySQL dialect)
SELECT 
    DATE_FORMAT(order_date, '%Y-%m') AS month,
    SUM(amount) AS total_revenue
FROM 
    orders
WHERE 
    status = 'COMPLETED'
GROUP BY 
    DATE_FORMAT(order_date, '%Y-%m')
ORDER BY 
    month ASC;
```

```sql
-- Solution 1: PostgreSQL equivalent using TO_CHAR
SELECT 
    TO_CHAR(order_date, 'YYYY-MM') AS month,
    SUM(amount) AS total_revenue
FROM 
    orders
WHERE 
    status = 'COMPLETED'
GROUP BY 
    TO_CHAR(order_date, 'YYYY-MM')
ORDER BY 
    month ASC;
```

**Solution 2: Continuous Month Calendar with Zero-Filled Gaps (Production-Grade CTE)**

This query generates every calendar month in a target range using a Recursive CTE, ensuring months with zero sales return `$0.00` instead of dropping out.

```sql
-- Solution 2: Guaranteed continuous months using a Recursive CTE (MySQL 8.0+ / PostgreSQL)
WITH RECURSIVE month_series AS (
    -- Anchor query: First month of the target reporting period
    SELECT CAST('2024-01-01' AS DATE) AS month_date
    UNION ALL
    -- Recursive step: Advance by 1 month until reaching the end of the year
    SELECT DATE_ADD(month_date, INTERVAL 1 MONTH)
    FROM month_series
    WHERE month_date < '2024-12-01'
),
monthly_sales AS (
    -- Pre-aggregate sales to ensure 1 row per month before joining
    SELECT 
        DATE_FORMAT(order_date, '%Y-%m') AS order_month,
        SUM(amount) AS revenue
    FROM 
        orders
    WHERE 
        status = 'COMPLETED'
        AND order_date >= '2024-01-01'
        AND order_date < '2025-01-01'
    GROUP BY 
        DATE_FORMAT(order_date, '%Y-%m')
)
SELECT 
    DATE_FORMAT(ms.month_date, '%Y-%m') AS month,
    -- COALESCE replaces NULL with 0.00 for months without transactions
    COALESCE(s.revenue, 0.00) AS total_revenue
FROM 
    month_series ms
LEFT JOIN 
    monthly_sales s ON DATE_FORMAT(ms.month_date, '%Y-%m') = s.order_month
ORDER BY 
    month ASC;
```

**Solution 3: Month-over-Month (MoM) Growth Percentage with Window Functions**

This query computes both total revenue and the percentage change compared to the previous month using the `LAG()` window function.

```sql
-- Solution 3: Monthly revenue with Month-over-Month (MoM) Growth %
WITH monthly_revenue AS (
    SELECT 
        DATE_FORMAT(order_date, '%Y-%m') AS month,
        SUM(amount) AS total_revenue
    FROM 
        orders
    WHERE 
        status = 'COMPLETED'
    GROUP BY 
        DATE_FORMAT(order_date, '%Y-%m')
)
SELECT 
    month,
    total_revenue,
    -- Fetch the previous month's revenue
    LAG(total_revenue, 1) OVER (ORDER BY month ASC) AS previous_month_revenue,
    -- Calculate MoM Growth %, handling division by zero/null using NULLIF
    ROUND(
        (total_revenue - LAG(total_revenue, 1) OVER (ORDER BY month ASC)) 
        / NULLIF(LAG(total_revenue, 1) OVER (ORDER BY month ASC), 0) * 100.0, 
        2
    ) AS mom_growth_percentage
FROM 
    monthly_revenue
ORDER BY 
    month ASC;
```

**Complexity and Index Optimization:**

- **Time Complexity:** O(N log K), where N is the number of matching completed orders and K is the number of distinct months in the result. Filtering and scanning records takes O(N), grouping via hash table or sort takes O(N), and sorting the final K aggregated month rows takes O(K log K).
- **Space Complexity:** O(K) temporary space, where K is the number of distinct monthly summary buckets stored in the aggregation hash table.
- **Index Optimization:** On high-volume tables (e.g., 50 million orders), a composite covering index on `(status, order_date, amount)` enables an Index-Only Scan. The database engine filters on `status = 'COMPLETED'`, reads the timestamp range `order_date`, and accumulates `amount` directly from B-tree index leaf pages without performing random disk reads on the primary table data heap.

## 4. Dry Run — Walk Through a Real Example

Let us trace the complete execution of Solution 2 and Solution 3 using a representative dataset for the first quarter of 2024.

**Input `orders` Table:**

| id | order_date | status | amount |
| :--- | :--- | :--- | :--- |
| 1 | 2024-01-10 09:30:00 | COMPLETED | 150.00 |
| 2 | 2024-01-25 14:15:00 | COMPLETED | 250.00 |
| 3 | 2024-01-30 18:00:00 | CANCELLED | 500.00 |
| 4 | 2024-02-14 11:20:00 | PENDING | 100.00 |
| 5 | 2024-03-05 08:00:00 | COMPLETED | 400.00 |
| 6 | 2024-03-22 16:45:00 | COMPLETED | 100.00 |

**Step 1: Recursive CTE generates calendar month series**
- Iteration 0 (Anchor): `2024-01-01`
- Iteration 1: `2024-02-01`
- Iteration 2: `2024-03-01`
- Result `month_series`: `['2024-01-01', '2024-02-01', '2024-03-01']`

**Step 2: Filter and aggregate `monthly_sales` CTE**
- Row 1: `status = 'COMPLETED'`, month `2024-01`, amount `150.00` -> Included
- Row 2: `status = 'COMPLETED'`, month `2024-01`, amount `250.00` -> Included
- Row 3: `status = 'CANCELLED'` -> Filtered out
- Row 4: `status = 'PENDING'` -> Filtered out
- Row 5: `status = 'COMPLETED'`, month `2024-03`, amount `400.00` -> Included
- Row 6: `status = 'COMPLETED'`, month `2024-03`, amount `100.00` -> Included
- Grouped `monthly_sales`:
  - `2024-01`: `150.00 + 250.00 = 400.00`
  - `2024-03`: `400.00 + 100.00 = 500.00` (Note: `2024-02` has zero matching rows)

**Step 3: `LEFT JOIN` calendar series with sales aggregation**
- `2024-01` joins with sales -> `revenue = 400.00`
- `2024-02` finds no sales row (NULL) -> `COALESCE(NULL, 0.00) = 0.00`
- `2024-03` joins with sales -> `revenue = 500.00`

**Step 4: Window Function Evaluation (`LAG()` & Growth %)**
- Month `2024-01`: `total_revenue = 400.00`, `LAG = NULL`, `growth = NULL`
- Month `2024-02`: `total_revenue = 0.00`, `LAG = 400.00`, `growth = ((0.00 - 400.00) / 400.00) * 100 = -100.00%`
- Month `2024-03`: `total_revenue = 500.00`, `LAG = 0.00`, `NULLIF(0.00, 0)` produces NULL -> `growth = NULL` (prevents runtime division-by-zero exception)

**Final Result Set:**

| month | total_revenue | previous_month_revenue | mom_growth_percentage |
| :--- | :--- | :--- | :--- |
| 2024-01 | 400.00 | NULL | NULL |
| 2024-02 | 0.00 | 400.00 | -100.00 |
| 2024-03 | 500.00 | 0.00 | NULL |

## 5. Edge Cases — The Ones That Break Naive Solutions

**1. Multi-Year Merging Trap**
Using `GROUP BY MONTH(order_date)` or `EXTRACT(MONTH FROM order_date)` combines all historical January data into one bucket.
*Fix:* Always pair the year and month together using `DATE_FORMAT(order_date, '%Y-%m')`, `TO_CHAR(order_date, 'YYYY-MM')`, or `DATE_TRUNC('month', order_date)`.

**2. Missing Inactive Months**
A standard `GROUP BY` only returns groups that exist in the underlying table. If a business was closed for a month or launched in a quiet season, the month will simply vanish from the query result.
*Fix:* Generate a full date sequence using a Recursive CTE or a dedicated database calendar dimension table (`dim_calendar`), then `LEFT JOIN` the sales data with `COALESCE(SUM(amount), 0)`.

**3. Time Zone Discrepancies**
If timestamps are stored in UTC (`2024-01-31 23:30:00 UTC`), an order placed in New York (EST, UTC-5) actually occurred at `2024-01-31 18:30:00` (January), but an order placed in Tokyo (JST, UTC+9) occurred at `2024-02-01 08:30:00` (February).
*Fix:* Convert timestamps to the reporting boundary time zone before grouping, using `CONVERT_TZ(order_date, '+00:00', 'America/New_York')` in MySQL or `order_date AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York'` in PostgreSQL.

**4. Division by Zero in MoM Growth**
When calculating Month-over-Month percentage changes, a previous month with `$0.00` revenue will cause a fatal database error (`ERROR: division by zero`).
*Fix:* Wrap the denominator with `NULLIF(LAG(total_revenue, 1) OVER (...), 0)`. If the previous month is `0`, the denominator becomes `NULL`, cleanly returning `NULL` for the growth rate.

**5. Non-Sargable Date Functions on Large Tables**
Writing `WHERE DATE_FORMAT(order_date, '%Y') = '2024'` forces the engine to execute the format function on every single row in the table, ignoring any standard index on `order_date`.
*Fix:* Filter using explicit range boundaries: `WHERE order_date >= '2024-01-01' AND order_date < '2025-01-01'`. This preserves B-tree index range scan capability (Sargability).

## 6. Variations and Follow-ups

**Variation 1: Rolling 3-Month Moving Average Revenue**
Instead of just single-month totals, business analysts frequently request a smoothed 3-month trailing average to identify underlying growth trends.
*Solution:* Apply the `AVG()` window function over a rolling frame:
```sql
SELECT 
    month,
    total_revenue,
    ROUND(
        AVG(total_revenue) OVER (
            ORDER BY month ASC 
            ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
        ), 
        2
    ) AS rolling_3mo_avg_revenue
FROM 
    monthly_revenue;
```

**Variation 2: Cumulative Year-to-Date (YTD) Revenue**
Calculate running total revenue that resets at the beginning of each calendar year.
*Solution:* Partition the running sum window by calendar year:
```sql
SELECT 
    month,
    total_revenue,
    SUM(total_revenue) OVER (
        PARTITION BY LEFT(month, 4) 
        ORDER BY month ASC
    ) AS ytd_cumulative_revenue
FROM 
    monthly_revenue;
```

**Variation 3: Breakdown by Product Category per Month**
Calculate monthly revenue split across different product departments.
*Solution:* Add the secondary dimension `category_id` to both the `SELECT` and `GROUP BY` clauses:
```sql
SELECT 
    DATE_FORMAT(o.order_date, '%Y-%m') AS month,
    p.category_name,
    SUM(oi.quantity * oi.unit_price) AS category_revenue
FROM 
    orders o
JOIN 
    order_items oi ON o.id = oi.order_id
JOIN 
    products p ON oi.product_id = p.id
WHERE 
    o.status = 'COMPLETED'
GROUP BY 
    DATE_FORMAT(o.order_date, '%Y-%m'),
    p.category_name
ORDER BY 
    month ASC, 
    category_revenue DESC;
```

**Variation 4: High-Scale Materialization Strategy**
When the `orders` table scales into hundreds of millions of rows, running live aggregate queries over historical raw transactions becomes too slow for user-facing dashboards.
*Solution:* Maintain an automated daily/monthly rollup table (`monthly_revenue_summary`) populated via scheduled ETL/ELT pipelines, or use a database-native Materialized View refreshed concurrently.

## 7. 🧠 The Memory Hook

Time in SQL has two coordinates: Year and Month. If you only group by month, you collapse all of history into twelve buckets. When reporting over a timeline, always build the calendar first and left join your orders—otherwise the quiet months will silently vanish from your data.
