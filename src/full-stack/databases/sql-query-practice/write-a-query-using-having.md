# Write a Query Using `HAVING` in SQL: Post-Aggregation Filtering vs `WHERE` Clause

## 1. What the Interviewer Is Really Testing

When an interviewer asks you to write a query using `HAVING`, they are rarely checking if you know the spelling of a SQL keyword. They are testing whether you understand the database engine's logical query processing pipeline.

Specifically, the interviewer evaluates:
- **Lifecycle timing:** Do you understand that `WHERE` filters individual rows *before* aggregation occurs, while `HAVING` filters materialized group summaries *after* aggregation occurs?
- **Index pruning versus full grouping:** Do you know the catastrophic performance cost of putting row-level predicates into a `HAVING` clause instead of a `WHERE` clause?
- **Correct SQL grammar constraints:** Do you know why aggregate functions like `SUM()` and `COUNT()` are illegal in `WHERE` clauses?
- **Multi-clause composition:** Can you seamlessly combine row-level indexing (`WHERE`), category bucketing (`GROUP BY`), metric thresholding (`HAVING`), and final sorting (`ORDER BY`) into an optimal, production-grade query?

## 2. Think Before You Code — The Senior Dev Thought Process

Here is the exact practical problem presented:

> *"Write an SQL query to identify VIP power customers who have placed more than 5 completed orders totaling over $1,000 in the current year (2024), sorted by their lifetime value descending."*

When approaching this problem, trace the physical data path through the database engine before typing any SQL.

First, consider the naive instinct: Why can't we just filter everything in a `WHERE` clause like this?

```sql
-- WRONG: Syntax error in standard SQL
SELECT customer_id, COUNT(id), SUM(total_amount)
FROM Orders
WHERE order_date >= '2024-01-01'
  AND status = 'COMPLETED'
  AND COUNT(id) > 5
  AND SUM(total_amount) > 1000.00
GROUP BY customer_id;
```

This immediately fails with a syntax error (`aggregate functions are not allowed in WHERE`). In the SQL execution lifecycle, the database processes clauses in this strict order:

1. `FROM`: Identify and join source tables.
2. `WHERE`: Filter individual base rows.
3. `GROUP BY`: Bucket surviving rows into groups.
4. `HAVING`: Filter grouped summary buckets.
5. `SELECT`: Evaluate projections, expressions, and aliases.
6. `ORDER BY`: Sort the final result set.
7. `LIMIT` / `OFFSET`: Truncate output rows.

When step 2 (`WHERE`) runs, the rows have not yet been grouped. The concept of `COUNT(id)` or `SUM(total_amount)` for a customer does not exist yet because grouping happens in step 3.

Second, consider the opposite mistake: What happens if we dump all filters into `HAVING`?

```sql
-- DANGEROUS: Compiles, but destroys database performance
SELECT customer_id, COUNT(id), SUM(total_amount)
FROM Orders
GROUP BY customer_id
HAVING order_date >= '2024-01-01'
   AND status = 'COMPLETED'
   AND COUNT(id) > 5
   AND SUM(total_amount) > 1000.00;
```

In engines that allow non-aggregated columns in `HAVING` or if rewritten with aggregate wrappers, this is an architectural disaster. Filtering `order_date` in `WHERE` allows the optimizer to use a B-Tree index on `(status, order_date)` to discard 90% or more of historical records from disk immediately. Moving `order_date` and `status` to `HAVING` forces the engine to load millions of historical, cancelled, and pending orders into memory, allocate hash table buckets for every customer in company history, calculate sums, and only then discard the groups.

The optimal strategy separates row-level filters from group-level filters:
- Row-level predicates (`order_date >= '2024-01-01'` and `status = 'COMPLETED'`) belong in `WHERE` to prune the scan volume early.
- Group aggregations (`COUNT(id) > 5` and `SUM(total_amount) > 1000.00`) belong in `HAVING` to prune the aggregated customer buckets.

## 3. The Solution — Fully Explained Code

```sql
SELECT
    customer_id,
    COUNT(id) AS completed_orders,
    SUM(total_amount) AS lifetime_value
FROM Orders
WHERE order_date >= '2024-01-01'
  AND status = 'COMPLETED'
GROUP BY customer_id
HAVING COUNT(id) > 5
   AND SUM(total_amount) > 1000.00
ORDER BY lifetime_value DESC;
```

**Why this query is structured this way:**

- `FROM Orders`: Specifies the source table.
- `WHERE order_date >= '2024-01-01' AND status = 'COMPLETED'`: Evaluates first at the row level. If an index on `(status, order_date, customer_id, total_amount)` exists, the engine performs an index range scan, discarding uncompleted orders and older transactions before allocating grouping memory.
- `GROUP BY customer_id`: Gathers all pre-filtered rows into distinct memory buckets per customer.
- `COUNT(id) AS completed_orders` & `SUM(total_amount) AS lifetime_value`: Computes aggregate metrics across each customer's qualifying 2024 completed orders. `COUNT(id)` counts non-null order IDs; `SUM(total_amount)` accumulates their dollar totals.
- `HAVING COUNT(id) > 5 AND SUM(total_amount) > 1000.00`: Filters out aggregated customer buckets that fail either threshold.
- `ORDER BY lifetime_value DESC`: Sorts the surviving VIP customers so the highest spenders appear first.

**Complexity and Resource Cost:**

- **Time Complexity:** O(N) index scan or table scan to filter N total rows down to R candidate rows, followed by O(R) hash aggregation (or O(R log R) sort aggregation) to build M customer groups, and O(M log M) to sort the qualifying groups in `ORDER BY`. With proper indexing on `(status, order_date)`, R << N, making the query run in milliseconds even on tables with tens of millions of rows.
- **Space Complexity:** O(M) working memory (`work_mem` in PostgreSQL or tempdb/sort buffer in MySQL) to maintain the hash map of M unique `customer_id` groups and their running `COUNT` and `SUM` accumulators during aggregation.

## 4. Dry Run — Walk Through a Real Example

Consider the following `Orders` table data:

| id | customer_id | order_date | status | total_amount |
| :--- | :--- | :--- | :--- | :--- |
| 1 | 101 | 2024-01-15 | COMPLETED | 250.00 |
| 2 | 101 | 2024-02-10 | COMPLETED | 300.00 |
| 3 | 101 | 2024-03-05 | COMPLETED | 150.00 |
| 4 | 101 | 2024-04-12 | CANCELLED | 500.00 |
| 5 | 101 | 2024-05-18 | COMPLETED | 200.00 |
| 6 | 101 | 2024-06-20 | COMPLETED | 150.00 |
| 7 | 101 | 2024-07-22 | COMPLETED | 400.00 |
| 8 | 102 | 2023-11-05 | COMPLETED | 1200.00 |
| 9 | 102 | 2024-02-01 | COMPLETED | 100.00 |
| 10 | 103 | 2024-01-20 | COMPLETED | 3500.00 |
| 11 | 103 | 2024-03-15 | COMPLETED | 800.00 |
| 12 | 104 | 2024-01-10 | COMPLETED | 80.00 |
| 13 | 104 | 2024-02-14 | COMPLETED | 70.00 |
| 14 | 104 | 2024-03-01 | COMPLETED | 60.00 |
| 15 | 104 | 2024-04-10 | COMPLETED | 90.00 |
| 16 | 104 | 2024-05-05 | COMPLETED | 50.00 |
| 17 | 104 | 2024-06-18 | COMPLETED | 100.00 |

**Stage 1: `WHERE` Clause Filter (Row Pruning)**

The engine evaluates `order_date >= '2024-01-01' AND status = 'COMPLETED'` on every row:
- Row 4 (Customer 101, CANCELLED): Dropped.
- Row 8 (Customer 102, from 2023): Dropped.
- All other 15 rows pass.

**Stage 2: `GROUP BY customer_id` (Aggregate Accumulation)**

The surviving rows are aggregated into customer buckets:

| customer_id | Rows Included (id) | `COUNT(id)` | `SUM(total_amount)` |
| :--- | :--- | :--- | :--- |
| **101** | 1, 2, 3, 5, 6, 7 | 6 | $1,450.00 |
| **102** | 9 | 1 | $100.00 |
| **103** | 10, 11 | 2 | $4,300.00 |
| **104** | 12, 13, 14, 15, 16, 17 | 6 | $450.00 |

**Stage 3: `HAVING` Clause Filter (Group Pruning)**

The engine checks `COUNT(id) > 5 AND SUM(total_amount) > 1000.00` on each bucket:
- **Customer 101:** `COUNT` = 6 (> 5: TRUE), `SUM` = $1,450.00 (> 1000.00: TRUE) -> **PASSES**
- **Customer 102:** `COUNT` = 1 (FALSE), `SUM` = $100.00 (FALSE) -> **DROPPED**
- **Customer 103:** `COUNT` = 2 (FALSE: does not have > 5 orders, despite high spending) -> **DROPPED**
- **Customer 104:** `COUNT` = 6 (TRUE), `SUM` = $450.00 (FALSE: under $1,000 threshold) -> **DROPPED**

**Stage 4: `SELECT` Projection & `ORDER BY`**

Only Customer 101 survives. The engine formats the output:

| customer_id | completed_orders | lifetime_value |
| :--- | :--- | :--- |
| 101 | 6 | 1450.00 |

## 5. Edge Cases — The Ones That Break Naive Solutions

- **NULL values inside aggregated columns:** `COUNT(id)` counts non-null IDs, whereas `COUNT(*)` counts all rows in the group regardless of nulls. If `total_amount` is `NULL` for an unbilled order, `SUM(total_amount)` ignores that null row. If all rows for a group have `NULL` amounts, `SUM()` evaluates to `NULL`. In SQL three-valued logic, `NULL > 1000.00` evaluates to `UNKNOWN`, which is treated as false by `HAVING` and safely discards the group.
- **Using column aliases in `HAVING`:** Standard ANSI SQL (supported strictly by PostgreSQL, Oracle, and SQL Server) processes `HAVING` before `SELECT`. Referring to aliases like `HAVING completed_orders > 5` will throw `column "completed_orders" does not exist`. You must repeat the aggregate expression `HAVING COUNT(id) > 5`. MySQL supports aliases in `HAVING` as a non-standard extension, but writing standard aggregate expressions ensures database portability.
- **Zero matching rows from `WHERE`:** When `WHERE` filters out every row in the table, `GROUP BY customer_id` produces 0 rows (an empty result set). This differs from an ungrouped query (`SELECT COUNT(*) FROM Orders WHERE 1=0`), which returns 1 row containing `0`.
- **Strict inequality vs inclusive boundaries:** The prompt specifies "more than 5" (`> 5`) and "over $1,000" (`> 1000.00`). Using `>= 5` or `>= 1000.00` accidentally includes edge customers sitting exactly on the threshold boundary.
- **Memory exhaustion from missing `WHERE`:** If you omit `WHERE` and place all conditions in `HAVING`, an e-commerce table with 50 million orders will force the database to build hash table entries for millions of inactive or historical customers. When this exceeds `work_mem`, the database engine spills temporary partitions to disk, causing high I/O latency and query timeouts.

## 6. Variations and Follow-ups

**Variation 1: Joining Customer Profile Details Without Cartesian Duplication**

In production, the business usually wants the customer's `name` and `email` alongside their metrics. Joining the `Customers` table directly before `GROUP BY` requires grouping by all customer columns or primary keys:

```sql
SELECT
    c.id AS customer_id,
    c.name,
    c.email,
    COUNT(o.id) AS completed_orders,
    SUM(o.total_amount) AS lifetime_value
FROM Customers c
JOIN Orders o ON c.id = o.customer_id
WHERE o.order_date >= '2024-01-01'
  AND o.status = 'COMPLETED'
GROUP BY c.id, c.name, c.email
HAVING COUNT(o.id) > 5
   AND SUM(o.total_amount) > 1000.00
ORDER BY lifetime_value DESC;
```

A senior follow-up optimization: If the `Orders` table has millions of rows, aggregate first in a CTE or subquery to keep the aggregation hash table compact, then join `Customers` once for only the surviving VIP rows:

```sql
WITH VipCustomers AS (
    SELECT
        customer_id,
        COUNT(id) AS completed_orders,
        SUM(total_amount) AS lifetime_value
    FROM Orders
    WHERE order_date >= '2024-01-01'
      AND status = 'COMPLETED'
    GROUP BY customer_id
    HAVING COUNT(id) > 5
       AND SUM(total_amount) > 1000.00
)
SELECT
    c.id AS customer_id,
    c.name,
    c.email,
    v.completed_orders,
    v.lifetime_value
FROM VipCustomers v
JOIN Customers c ON v.customer_id = c.id
ORDER BY v.lifetime_value DESC;
```

**Variation 2: Dynamic Multi-Year Grouping**

If asked to calculate VIP status per customer per year without hardcoding a date filter:

```sql
SELECT
    customer_id,
    EXTRACT(YEAR FROM order_date) AS order_year,
    COUNT(id) AS completed_orders,
    SUM(total_amount) AS yearly_value
FROM Orders
WHERE status = 'COMPLETED'
GROUP BY customer_id, EXTRACT(YEAR FROM order_date)
HAVING COUNT(id) > 5
   AND SUM(total_amount) > 1000.00
ORDER BY order_year DESC, yearly_value DESC;
```

**Variation 3: Retaining Individual Order Rows (Window Functions vs `HAVING`)**

If the frontend needs to render every individual order line item on screen while flagging whether the customer is a VIP, `GROUP BY` + `HAVING` cannot be used because it collapses individual rows into a single summary row. You use window functions instead:

```sql
WITH RankedOrders AS (
    SELECT
        id,
        customer_id,
        order_date,
        total_amount,
        COUNT(id) OVER(PARTITION BY customer_id) AS total_customer_orders,
        SUM(total_amount) OVER(PARTITION BY customer_id) AS total_customer_spend
    FROM Orders
    WHERE order_date >= '2024-01-01'
      AND status = 'COMPLETED'
)
SELECT id, customer_id, order_date, total_amount
FROM RankedOrders
WHERE total_customer_orders > 5
  AND total_customer_spend > 1000.00;
```

## 7. 🧠 The Memory Hook

`WHERE` filters the raw ingredients before they go into the blender; `HAVING` filters the smoothies after they are poured. If a filter does not require measuring the whole smoothie, put it in `WHERE` so the blender does 90% less work.
