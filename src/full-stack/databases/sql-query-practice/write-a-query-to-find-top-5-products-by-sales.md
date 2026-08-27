# Write a Query to Find Top 5 Products by Sales in SQL

## 1. What the Interviewer Is Really Testing

This looks like you are just writing `SELECT ... ORDER BY ... LIMIT 5`. It is not. The interviewer is using a tiny business question to check whether you actually understand how aggregation, sorting, and limiting work together in a real database.

What they are listening for is four things at once. First, can you define the sales number correctly — `SUM(quantity * unit_price)` from the order line items, using the price that was frozen at checkout, not the current price in the products table. Second, can you filter the business reality — only `completed` orders count, cancelled and refunded ones must be excluded or your totals are wrong. Third, do you know what `LIMIT 5` really does to ties, and when you need `DENSE_RANK()` instead. Fourth, can you explain the execution choice — `GROUP BY` first, then `ORDER BY` the aggregated total, then `LIMIT`, and why that order matters for correctness and speed.

If you nail those four, you have shown aggregation plus ordering plus limit, which is the whole pattern they are hiring for.

## 2. Think Before You Code — The Senior Dev Thought Process

First thing I notice when I see this prompt is the phrase “by sales.” I have to clarify what sales means before I type anything. Does the interviewer want total revenue or total units sold. Most of the time they mean revenue, so `quantity * unit_price` per line item, summed per product. I will say that out loud and confirm.

My brute-force instinct is to join `products` to `order_items`, group by product, sum the line totals, sort descending, and limit. It would work on a tiny dataset and it is the query most juniors write first:

```sql
-- Brute force: technically correct on clean data, wrong in production
SELECT p.product_id, p.name, SUM(oi.quantity * oi.unit_price) AS total_revenue
FROM products p
JOIN order_items oi ON p.product_id = oi.product_id
GROUP BY p.product_id, p.name
ORDER BY total_revenue DESC
LIMIT 5;
```

Why is that not good enough. It never touches the `orders` table, so it counts every line item even if the order was cancelled or refunded. It assumes `LIMIT 5` is always the right way to handle ranking, which falls apart when the 5th and 6th products tie. And at scale it joins the big fact table to the dimension table before shrinking the data, which creates a huge intermediate result just to throw most of it away.

The insight that makes this efficient is that this is a `GROUP BY` plus sort problem, not a join problem. I should filter to successful orders first, then collapse millions of line items down to one row per product with `SUM`, then sort those few product rows, then limit. The join to `products` is only needed at the end to get the name, or even just to enrich already-aggregated totals.

So my optimal plan before coding is: filter `orders.status = 'completed'`, group `order_items` by `product_id` and sum `quantity * unit_price`, order the sums descending, take 5. If the interviewer cares about ties, swap `LIMIT` for a window function that ranks the aggregated totals. If they want per-category top 5, add `PARTITION BY category_id` to that window.

## 3. The Solution — Fully Explained Code

Here is the full setup so you can run this anywhere. The SQL is standard and runs in SQLite, Postgres, and MySQL with no changes except the date function name.

```sql
-- Schema
CREATE TABLE products (
  product_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category_id INTEGER
);
CREATE TABLE orders (
  order_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL,          -- 'completed', 'cancelled', 'refunded', 'pending'
  created_at TEXT
);
CREATE TABLE order_items (
  item_id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(order_id),
  product_id INTEGER NOT NULL REFERENCES products(product_id),
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL        -- price frozen at time of purchase
);
```

Solution 1 is the standard answer when the spec says exactly 5 rows. The secondary sort on `product_id` makes the result deterministic when two products tie.

```sql
-- Solution 1: exactly 5 rows, deterministic tie break
SELECT
  p.product_id,
  p.name AS product_name,
  SUM(oi.quantity * oi.unit_price) AS total_revenue
FROM products p
JOIN order_items oi ON p.product_id = oi.product_id
JOIN orders o ON oi.order_id = o.order_id
WHERE o.status = 'completed'   -- exclude cancelled/refunded/pending before any math
GROUP BY p.product_id, p.name  -- one row per product
ORDER BY total_revenue DESC, p.product_id ASC
LIMIT 5;
```

Why each piece. The `WHERE` runs before `GROUP BY`, so cancelled orders never enter the sum. `SUM(oi.quantity * oi.unit_price)` uses the historical price from the line item, not `products.price`, otherwise a price change tomorrow would rewrite history. `GROUP BY p.product_id, p.name` collapses all line items for the same product into one total. `ORDER BY total_revenue DESC` sorts products by that total, and `LIMIT 5` keeps only the top.

Solution 2 is what you use when the business says any product tied for 5th place counts. `DENSE_RANK()` ranks the already-aggregated totals without gaps, so tied products share a rank.

```sql
-- Solution 2: include everyone tied for ranks 1 through 5
WITH product_sales AS (
  SELECT
    p.product_id,
    p.name AS product_name,
    SUM(oi.quantity * oi.unit_price) AS total_revenue,
    DENSE_RANK() OVER (ORDER BY SUM(oi.quantity * oi.unit_price) DESC) AS sales_rank
  FROM products p
  JOIN order_items oi ON p.product_id = oi.product_id
  JOIN orders o ON oi.order_id = o.order_id
  WHERE o.status = 'completed'
  GROUP BY p.product_id, p.name
)
SELECT product_id, product_name, total_revenue, sales_rank
FROM product_sales
WHERE sales_rank <= 5
ORDER BY sales_rank ASC, product_name ASC;
```

A window function like `DENSE_RANK()` runs after `GROUP BY` but before the outer `WHERE`, so we have to compute the rank inside a CTE and filter it outside. If the 5th and 6th products both have 150.00 revenue, they both get rank 5 and both are returned. Use `RANK()` if you want gaps after ties, or `ROW_NUMBER()` if you want exactly 5 rows with arbitrary tie breaking. `DENSE_RANK()` is the fair “top 5 distinct totals” choice.

Solution 3 is the same logic rewritten to be fast on large tables. It filters and aggregates the big table before joining the small one.

```sql
-- Solution 3: pre-aggregate first, then join (scale pattern)
WITH successful_orders AS (
  SELECT order_id FROM orders WHERE status = 'completed'
),
aggregated_sales AS (
  SELECT
    oi.product_id,
    SUM(oi.quantity * oi.unit_price) AS total_revenue
  FROM order_items oi
  JOIN successful_orders so ON oi.order_id = so.order_id
  GROUP BY oi.product_id
)
SELECT p.product_id, p.name AS product_name, a.total_revenue
FROM aggregated_sales a
JOIN products p ON a.product_id = p.product_id
ORDER BY a.total_revenue DESC
LIMIT 5;
```

Here we shrink 50 million line items down to maybe 20 thousand product totals before we ever touch `products`. Fewer rows joined means less memory and less sort work.

Time complexity is O(N + M log K) where N is the number of filtered line items you scan and sum, M is the number of distinct products, and K is 5. You scan once to aggregate, then you sort M totals to find the top K. Space is O(M) for the hash table that holds one sum per product.

For production indexes, you want to filter completed orders fast and cover the line-item math without touching the heap:

```sql
CREATE INDEX idx_orders_status ON orders(status, order_id);
CREATE INDEX idx_order_items_covering ON order_items(order_id, product_id, quantity, unit_price);
```

## 4. Dry Run — Walk Through a Real Example

Take this small dataset that has the exact traps an interviewer will test: a cancelled order with a huge total that must be ignored, and two products tied on revenue.

products:

| product_id | name | category_id |
|---|---|---|
| 101 | Laptop Pro | 1 |
| 102 | Wireless Mouse | 1 |
| 103 | Mechanical Keyboard | 1 |
| 104 | 4K Monitor | 2 |
| 105 | USB-C Hub | 2 |
| 106 | Desk Mat | 2 |

orders:

| order_id | status | created_at |
|---|---|---|
| 1 | completed | 2026-01-10 |
| 2 | completed | 2026-01-12 |
| 3 | cancelled | 2026-01-13 |

order_items:

| item_id | order_id | product_id | quantity | unit_price | line total |
|---|---|---|---|---|---|
| 1 | 1 | 101 | 2 | 1000.00 | 2000.00 |
| 2 | 1 | 102 | 5 | 20.00 | 100.00 |
| 3 | 1 | 103 | 1 | 150.00 | 150.00 |
| 4 | 2 | 104 | 2 | 400.00 | 800.00 |
| 5 | 2 | 105 | 3 | 50.00 | 150.00 |
| 6 | 3 | 106 | 100 | 30.00 | 3000.00 |

Step 1, filter. `WHERE o.status = 'completed'` keeps orders 1 and 2, drops order 3 entirely. Item 6 for Desk Mat, even though it is 3000.00, never enters the sum. That is the whole point of the join to `orders`.

Step 2, group and sum. The engine builds one bucket per product:

- 101 Laptop Pro: 2000.00
- 104 4K Monitor: 800.00
- 103 Mechanical Keyboard: 150.00
- 105 USB-C Hub: 150.00
- 102 Wireless Mouse: 100.00
- 106 Desk Mat: no bucket, nothing to sum

Step 3, order. Sorted descending by total_revenue:

1. 101 2000.00
2. 104 800.00
3. 103 150.00
3. 105 150.00 (tie)
4. 102 100.00

Step 4, rank and limit. With Solution 1, `ORDER BY total_revenue DESC, product_id ASC LIMIT 5` returns all five active products in deterministic order: 101, 104, 103, 105, 102. Keyboard (103) comes before Hub (105) because its product_id is smaller. With Solution 2, `DENSE_RANK()` gives both 103 and 105 rank 3, next rank is 4 for 102. `WHERE sales_rank <= 5` returns the same five rows, but if we had 8 products and three tied at rank 5, Solution 1 would arbitrarily cut one, Solution 2 would return 7 rows and be fair.

## 5. Edge Cases — The Ones That Break Naive Solutions

Ties for 5th place are the most common trap. If products at positions 5, 6, and 7 all have 10,000 revenue, a plain `LIMIT 5` will return whichever row the storage engine happened to read first. Two runs can return two different products. The fix is to ask the interviewer whether they want exactly 5 rows or all tied products. If exactly 5, add a deterministic second sort key like `product_id`. If fair, use `DENSE_RANK() <= 5` and explain you may return more than 5 rows.

No sales at all is the second trap. An `INNER JOIN` from `products` to `order_items` silently drops products that have never been ordered. If the question ever becomes “rank all products including unsold ones,” you need a `LEFT JOIN` and a `COALESCE`:

```sql
SELECT p.product_id, p.name, COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_revenue
FROM products p
LEFT JOIN order_items oi ON p.product_id = oi.product_id
LEFT JOIN orders o ON oi.order_id = o.order_id AND o.status = 'completed'
GROUP BY p.product_id, p.name
ORDER BY total_revenue DESC;
```

Without `COALESCE`, never-sold products show `NULL` instead of 0 and sort strangely.

Returns and refunds are the third trap. Some schemas store a refund as a negative quantity in `order_items`, others have a separate `refunds` table. If you just `SUM(quantity * unit_price)` and quantities can be -2, the math actually does the right thing and subtracts the refund. If refunds live elsewhere, you need to subtract them explicitly or filter them out. In an interview, say “I am assuming returns are either excluded by `status = 'completed'` or appear as negative quantities — if they are in another table I would join and subtract.” That answer shows you think about real order lifecycles.

Wrong price column is a silent correctness bug. If you write `SUM(oi.quantity * p.price)` you are multiplying today’s catalog price by yesterday’s quantity. A laptop that sold for 1200 last year and costs 1000 today will be misreported by 200 per unit. Always use `order_items.unit_price`, the snapshot from purchase time.

Non-sargable date filters bite you on follow-ups like “top 5 this year.” `WHERE YEAR(o.created_at) = 2026` cannot use an index on `created_at`. Write a range instead: `WHERE o.created_at >= '2026-01-01' AND o.created_at < '2027-01-01'`.

## 6. Variations and Follow-ups

Top 5 per category is the classic follow-up, and it is exactly why the interviewer taught you `LIMIT`. `LIMIT` cannot do per-group top K. You need a window function with `PARTITION BY`.

```sql
-- Variation: top 5 products per category by revenue
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
SELECT category_id, product_id, product_name, total_revenue, rank_in_category
FROM category_ranked_sales
WHERE rank_in_category <= 5
ORDER BY category_id ASC, rank_in_category ASC;
```

`PARTITION BY p.category_id` restarts the numbering inside each category. Use `ROW_NUMBER()` when you need exactly 5 per category, `DENSE_RANK()` when ties should expand the per-category list. The `GROUP BY` must include `category_id` now because you are partitioning by it.

Top 5 by units sold versus by revenue is just a change to the aggregate. Revenue is `SUM(oi.quantity * oi.unit_price)` and highlights expensive products. Volume is `SUM(oi.quantity)` and highlights cheap, high-velocity products like cables or mouse pads. Be ready to say which you would pick and why.

Top 5 in the last 30 days adds a time predicate before the aggregation:

```sql
WHERE o.status = 'completed'
  AND o.created_at >= datetime('now', '-30 days')
```

In Postgres that last line is `NOW() - INTERVAL '30 days'`, in MySQL `NOW() - INTERVAL 30 DAY`. The logic is identical — filter first, then group.

Real-time scale on a homepage with heavy traffic is the system-design follow-up. Running this aggregation live on an OLTP database at 50 thousand reads per second will hurt write latency. The senior answer is to not run it live: refresh a materialized view every few minutes, or maintain a Redis Sorted Set that you update on order completion with `ZINCRBY`, or replicate order events to an OLAP store like ClickHouse where columnar aggregation over millions of rows is milliseconds.

## 7. 🧠 The Memory Hook

Think F-A-R-M. Filter the right orders, Aggregate the frozen line price, Rank or Limit, Minimize the join by aggregating before you enrich. `GROUP BY` makes the buckets, `SUM(price*qty)` fills them, `ORDER BY total DESC` puts the biggest bucket on top, `LIMIT` or `DENSE_RANK` decides how fair you are about ties.
