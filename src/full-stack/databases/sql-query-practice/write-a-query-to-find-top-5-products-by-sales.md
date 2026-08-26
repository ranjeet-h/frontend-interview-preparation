# Write a Query to Find Top 5 Products by Sales in SQL

## 1. What the Interviewer Is Really Testing

On the surface, this looks like a basic SQL syntax test where you write `SELECT ... ORDER BY ... LIMIT 5`. In reality, interviewers use this question to separate engineers who just know SQL syntax from those who understand database engines, business integrity, and production performance.

They are evaluating four core competencies:

1. **Business Metric Definition:** Do you calculate total revenue (`SUM(quantity * unit_price)`) or sales volume (`SUM(quantity)`)? Do you use the historical price recorded on `order_items` at purchase time, or do you make the junior mistake of joining the current price from `products`?
2. **Order Lifecycle Filtering:** In any production database, orders have states (`completed`, `cancelled`, `refunded`, `pending`). If you do not filter out non-completed orders, your sales figures are wrong.
3. **Tie-Handling Mechanics:** What happens if the 5th, 6th, and 7th products all have the exact same revenue? A naive `LIMIT 5` arbitrarily cuts off products based on physical disk layout. An interviewer expects you to contrast `LIMIT 5` with `DENSE_RANK()`.
4. **Execution Performance and Indexing at Scale:** On a table with 50 million order items, joining `products` before aggregating creates 50 million intermediate rows in memory. An experienced engineer pre-aggregates sales per product first, joins the smaller set, and specifies covering indexes to eliminate table lookups.

## 2. Think Before You Code — The Senior Dev Thought Process

When approaching this problem, clarify the schema and business constraints before writing any query:

**Schema Context:**
- `products`: `product_id (PK)`, `name`, `category_id`
- `orders`: `order_id (PK)`, `status`, `created_at`
- `order_items`: `item_id (PK)`, `order_id (FK)`, `product_id (FK)`, `quantity`, `unit_price`

**The Initial Instinct (And Why It Is Incomplete):**
A quick draft joins `products` to `order_items`, groups by `product_id`, sums `quantity * unit_price`, and slaps `LIMIT 5` at the end.

```sql
-- Naive query
SELECT p.product_id, p.name, SUM(oi.quantity * oi.unit_price) AS total_revenue
FROM products p
JOIN order_items oi ON p.product_id = oi.product_id
GROUP BY p.product_id, p.name
ORDER BY total_revenue DESC
LIMIT 5;
```

Why is this not production-ready?
1. It counts cancelled, fraudulent, and refunded orders because it never checks `orders.status`.
2. It assumes `LIMIT 5` is always acceptable, ignoring business rules about ties.
3. If `order_items` has 50 million rows and `products` has 20,000 rows, this query joins all 50 million rows first, creates huge intermediate hash tables, and then aggregates.

**The Strategic Plan:**
1. Filter orders strictly for successful transactions (`status = 'completed'`).
2. Decide between standard top-K (`LIMIT 5`) and tie-inclusive ranking (`DENSE_RANK()`).
3. Optimize execution: Aggregate `order_items` by `product_id` first to reduce millions of rows down to distinct product totals, then join `products` once for names.
4. Support the follow-up: Be ready to partition by category (`PARTITION BY category_id`).

## 3. The Solution — Fully Explained Code

**Solution 1: Standard Top 5 by Revenue (`LIMIT 5` with Order Status Filter)**

Use this when the requirement strictly demands 5 output rows, with a secondary sort key to ensure deterministic results.

```sql
SELECT 
    p.product_id,
    p.name AS product_name,
    SUM(oi.quantity * oi.unit_price) AS total_revenue
FROM products p
JOIN order_items oi 
    ON p.product_id = oi.product_id
JOIN orders o 
    ON oi.order_id = o.order_id
WHERE o.status = 'completed'
GROUP BY p.product_id, p.name
-- Secondary sort on product_id ensures deterministic output when revenues tie
ORDER BY total_revenue DESC, p.product_id ASC
LIMIT 5;
```

**Solution 2: Tie-Preserving Top 5 Using a Window Function (`DENSE_RANK`)**

Use this when any product tied for ranks 1 through 5 must be included in the report. Window functions evaluate after `WHERE` and `GROUP BY`, so we calculate the rank inside a Common Table Expression (CTE) and filter in the outer query.

```sql
WITH product_sales AS (
    SELECT 
        p.product_id,
        p.name AS product_name,
        SUM(oi.quantity * oi.unit_price) AS total_revenue,
        DENSE_RANK() OVER (
            ORDER BY SUM(oi.quantity * oi.unit_price) DESC
        ) AS sales_rank
    FROM products p
    JOIN order_items oi 
        ON p.product_id = oi.product_id
    JOIN orders o 
        ON oi.order_id = o.order_id
    WHERE o.status = 'completed'
    GROUP BY p.product_id, p.name
)
SELECT 
    product_id,
    product_name,
    total_revenue,
    sales_rank
FROM product_sales
WHERE sales_rank <= 5
ORDER BY sales_rank ASC, product_name ASC;
```

**Solution 3: Performance-Optimized Pre-Aggregation (Scale Pattern)**

When querying massive datasets, aggregate the line items before joining dimension tables. This shrinks millions of rows down to a compact summary table before running the join against `products`.

```sql
WITH successful_orders AS (
    -- Step 1: Filter valid orders first (uses index on orders.status)
    SELECT order_id
    FROM orders
    WHERE status = 'completed'
),
aggregated_sales AS (
    -- Step 2: Sum revenue per product on the filtered set
    SELECT 
        oi.product_id,
        SUM(oi.quantity * oi.unit_price) AS total_revenue
    FROM order_items oi
    JOIN successful_orders so 
        ON oi.order_id = so.order_id
    GROUP BY oi.product_id
)
-- Step 3: Join products once on the small aggregated result
SELECT 
    p.product_id,
    p.name AS product_name,
    a.total_revenue
FROM aggregated_sales a
JOIN products p 
    ON a.product_id = p.product_id
ORDER BY a.total_revenue DESC
LIMIT 5;
```

**Complexity and Indexing Analysis:**

- **Time Complexity:** $O(N + M \log K)$ where $N$ is the number of filtered order items, $M$ is the number of unique products, and $K$ is the limit ($K=5$). With an index on `(order_id, status)` and a covering index on `order_items (order_id, product_id, quantity, unit_price)`, the database performs index scans without touching raw table pages.
- **Space Complexity:** $O(M)$ working memory in the database engine to maintain the aggregation hash table for $M$ unique products before sorting the top 5.

**Recommended Production Indexes:**
```sql
-- 1. Quickly isolate completed orders
CREATE INDEX idx_orders_status ON orders (status, order_id);

-- 2. Covering index on order_items to compute revenue directly from index leaf pages
CREATE INDEX idx_order_items_covering ON order_items (order_id, product_id, quantity, unit_price);

-- 3. Fast lookup for product names
CREATE INDEX idx_products_id_name ON products (product_id, name);
```

## 4. Dry Run — Walk Through a Real Example

Let us trace the query execution on a sample dataset with completed orders, cancelled orders, and ties.

**Sample Data:**

`products`:
| product_id | name |
|---|---|
| 101 | Laptop Pro |
| 102 | Wireless Mouse |
| 103 | Mechanical Keyboard |
| 104 | 4K Monitor |
| 105 | USB-C Hub |
| 106 | Desk Mat |

`orders`:
| order_id | status |
|---|---|
| 1 | completed |
| 2 | completed |
| 3 | cancelled |

`order_items`:
| item_id | order_id | product_id | quantity | unit_price | Line Total |
|---|---|---|---|---|---|
| 1 | 1 | 101 | 2 | 1000.00 | $2000.00 |
| 2 | 1 | 102 | 5 | 20.00 | $100.00 |
| 3 | 1 | 103 | 1 | 150.00 | $150.00 |
| 4 | 2 | 104 | 2 | 400.00 | $800.00 |
| 5 | 2 | 105 | 3 | 50.00 | $150.00 |
| 6 | 3 | 106 | 100 | 30.00 | $3000.00 (Cancelled order!) |

**Step 1: Filter valid orders (`orders.status = 'completed'`)**
- Order 3 is discarded. Item 6 (Desk Mat, $3000.00) is completely excluded from sales calculations.

**Step 2: Group by product and compute total revenue**
- Product 101 (Laptop Pro): $2000.00
- Product 104 (4K Monitor): $800.00
- Product 103 (Mechanical Keyboard): $150.00
- Product 105 (USB-C Hub): $150.00
- Product 102 (Wireless Mouse): $100.00
- Product 106 (Desk Mat): $0.00 (all orders cancelled)

**Step 3: Rank Assignment (`DENSE_RANK()`)**
| product_id | name | total_revenue | DENSE_RANK |
|---|---|---|---|
| 101 | Laptop Pro | $2000.00 | 1 |
| 104 | 4K Monitor | $800.00 | 2 |
| 103 | Mechanical Keyboard | $150.00 | 3 |
| 105 | USB-C Hub | $150.00 | 3 (Tied with 103) |
| 102 | Wireless Mouse | $100.00 | 4 |

**Step 4: Output Evaluation**
- Both Keyboard and Hub share Rank 3 because of the tie.
- With `DENSE_RANK() <= 5`, all 5 active products are returned correctly.
- With `LIMIT 5`, all 5 products are also returned, but the secondary sort `ORDER BY total_revenue DESC, product_id ASC` guarantees that Keyboard (103) appears before Hub (105) deterministically.

## 5. Edge Cases — The Ones That Break Naive Solutions

**1. Ties at the 5th Place Boundary**
If products at positions 5, 6, and 7 all generated $10,000 in sales, a raw `LIMIT 5` will pick one product unpredictably based on storage page order. Two consecutive query runs might return different products.
- *Fix:* Always clarify with the interviewer whether ties expand the result (`DENSE_RANK() <= 5`) or if strict 5 rows are required with a deterministic tie-breaker (`ORDER BY total_revenue DESC, product_id ASC`).

**2. Calculating Sales from `products.price` Instead of `order_items.unit_price`**
Products change prices over time (e.g., discounts, inflation, seasonal sales). If you multiply `order_items.quantity` by `products.current_price`, you calculate what past items would sell for today, not what customers actually paid.
- *Fix:* Always compute revenue using the historical snapshot price recorded in `order_items.unit_price`.

**3. Products with Zero Sales (When "All Products" are Requested)**
An `INNER JOIN` silently drops products that have never been purchased. If the requirement changes to "Rank all products including unsold ones", an `INNER JOIN` fails.
- *Fix:* Use a `LEFT JOIN` from `products` to `order_items` and wrap the aggregate in `COALESCE`:
```sql
COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_revenue
```

**4. Returns and Refunds in Negative Quantities**
Some enterprise schemas record refunds as negative quantities in `order_items` or separate `refunds` tables.
- *Fix:* Ensure the `SUM` handles signed quantities or subtracts refund line items explicitly.

**5. Non-Sargable Date Filters**
When asked for top products "this year", filtering with `WHERE YEAR(o.created_at) = 2026` prevents the database from using an index on `created_at`.
- *Fix:* Write sargable range predicates:
```sql
WHERE o.created_at >= '2026-01-01 00:00:00' 
  AND o.created_at < '2027-01-01 00:00:00'
```

## 6. Variations and Follow-ups

**Variation 1: Find Top 5 Products per Category**
The most common follow-up question. A simple `LIMIT 5` fails because it limits the entire result set, not per group. You must use `ROW_NUMBER()` or `DENSE_RANK()` with `PARTITION BY category_id`.

```sql
WITH category_ranked_sales AS (
    SELECT 
        p.category_id,
        p.product_id,
        p.name AS product_name,
        SUM(oi.quantity * oi.unit_price) AS total_revenue,
        ROW_NUMBER() OVER (
            PARTITION BY p.category_id 
            ORDER BY SUM(oi.quantity * oi.unit_price) DESC
        ) AS rank_in_category
    FROM products p
    JOIN order_items oi ON p.product_id = oi.product_id
    JOIN orders o ON oi.order_id = o.order_id
    WHERE o.status = 'completed'
    GROUP BY p.category_id, p.product_id, p.name
)
SELECT 
    category_id,
    product_id,
    product_name,
    total_revenue,
    rank_in_category
FROM category_ranked_sales
WHERE rank_in_category <= 5
ORDER BY category_id ASC, rank_in_category ASC;
```

**Variation 2: Top 5 by Units Sold vs Top 5 by Revenue**
- *By Sales Revenue:* `SUM(oi.quantity * oi.unit_price)` — highlights high-value goods (e.g., laptops).
- *By Units Sold (Volume):* `SUM(oi.quantity)` — highlights high-frequency consumable goods (e.g., charging cables).

**Variation 3: Top 5 Over a Rolling Time Window (e.g., Last 30 Days)**
Add a dynamic date filter on the orders table:
```sql
WHERE o.status = 'completed'
  AND o.created_at >= NOW() - INTERVAL '30 days'
```

**Variation 4: Real-Time High-Traffic Scale (OLAP vs OLTP)**
When asked: *"How do we run this query on a storefront homepage getting 50,000 requests per second across 100 million orders?"*
- Explain that running live aggregations on an OLTP database will degrade database throughput.
- Propose architectural alternatives:
  1. **Materialized View:** Refresh every 15 minutes (`REFRESH MATERIALIZED VIEW CONCURRENTLY`).
  2. **Cache in Redis:** Store the top product IDs in a Redis Sorted Set (`ZREVRANGE product_sales_leaderboard 0 4`).
  3. **OLAP Columnar Store:** Replicate events to ClickHouse or Snowflake where vector aggregates compute millions of rows in milliseconds.

## 7. 🧠 The Memory Hook

To ace the top-K query in an interview, remember the **F-A-R-M** sequence:
- **F**ilter order status first (`WHERE status = 'completed'`).
- **A**ggregate historical item totals (`SUM(quantity * unit_price)` from `order_items`, never current product price).
- **R**ank with `LIMIT 5` for fixed rows, or `DENSE_RANK()` for fair tie-handling.
- **M**inimize join payload by aggregating order items before joining product metadata.
