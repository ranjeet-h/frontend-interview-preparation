# Write a Query to Find Customers Who Ordered in the Last 30 Days in SQL

## 1. What the Interviewer Is Really Testing

Your PM says "show me every customer who bought something in the last 30 days" for a dashboard widget. You write a quick JOIN, it works on your laptop with 200 orders, ships fine, then three months later the orders table has four million rows and the widget takes nine seconds and returns duplicate customers. The interviewer knows this story and is using this simple-sounding filter to see if you will repeat it.

This looks like a date filter question but it is really testing four things at once. First, do you know how a one-to-many relationship explodes when you JOIN, and whether you reach for EXISTS versus IN versus JOIN with DISTINCT or GROUP BY to collapse it. Second, do you write a date predicate the optimizer can actually use an index for, or do you wrap the column in a function and force a full scan. Third, can you write date math that works in the dialect you claim to know — MySQL, Postgres, and SQLite all spell "30 days ago" differently. Fourth, can you explain the tradeoff between a correlated subquery and a join when you only need to know that at least one child row exists.

If you answer "WHERE order_date >= NOW() - 30" you have shown you can filter. If you answer with a sargable EXISTS against a composite index and can explain why IN and JOIN + DISTINCT cost more, you have shown you can ship this in production.

## 2. Think Before You Code — The Senior Dev Thought Process

The first thing I notice is customers to orders is one-to-many. One customer can have dozens of orders in 30 days. If I JOIN customers to orders and filter by date, I will get one output row per matching order, not per customer. So I will have to deduplicate.

My instinct for the brute force is the obvious JOIN:

```sql
SELECT DISTINCT c.id, c.name
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days';
```

That works logically. Complexity wise, the JOIN builds all matching pairs first, then DISTINCT has to sort or hash them to remove duplicates. If a power buyer has 200 orders this month, I just created 200 identical customer rows to throw 199 away. For a table with millions of orders that is a lot of wasted work and memory.

What pattern fixes that? I only need columns from customers. I do not need any column from orders in the SELECT. I just need to answer yes or no — does at least one qualifying order exist for this customer? That is exactly what EXISTS is for. EXISTS is a semi-join — the engine can stop after the first match per customer instead of gathering every match.

Then I think about IN. I could write `WHERE c.id IN (SELECT customer_id FROM orders WHERE order_date >= ...)`. That also avoids duplicates without DISTINCT, but IN has two traps: if the subquery returns a NULL, the whole NOT IN variant breaks because of three-valued logic, and many optimizers materialize the IN list before probing. EXISTS correlates on `o.customer_id = c.id` and short-circuits, which is why most interviewers prefer it for this shape.

The last thing I check before coding is the date side. I need the column alone on one side of the comparison. If I write `WHERE DATE(o.order_date) >= ...` or `WHERE DATEDIFF(NOW(), o.order_date) <= 30`, I just wrapped the indexed column in a function. The optimizer cannot seek the B-tree anymore, it has to scan every row and compute the function. The right form is `o.order_date >= <cutoff>` where cutoff is computed once from the current date. And that cutoff spells differently per dialect, so I need to pick one and name the others.

So the plan: compute cutoff once, keep `o.order_date` bare on the left, correlate with EXISTS, and back it with an index on `(customer_id, order_date)`.

## 3. The Solution — Fully Explained Code

Here is the production standard. It is the same idea in every dialect, only the date math changes.

```sql
-- Standard pattern: correlated EXISTS, sargable predicate
-- Returns one row per customer who has at least one qualifying order
SELECT c.id, c.name, c.email
FROM customers c
WHERE EXISTS (
  SELECT 1
  FROM orders o
  WHERE o.customer_id = c.id
    AND o.order_date >= CURRENT_DATE - INTERVAL '30 days'  -- Postgres style, see variants below
    AND o.status = 'COMPLETED'
);
```

Why each piece is there:

- `WHERE EXISTS (SELECT 1 ...)` asks does at least one row satisfy the inner condition. `SELECT 1` is convention — the optimizer ignores the select list inside EXISTS, it only checks existence. The engine short-circuits after the first match per customer, so it never builds duplicates.
- `o.customer_id = c.id` correlates the subquery to the outer customer. Without this it would be a plain subquery that returns the same answer for every customer.
- `o.order_date >= <cutoff>` keeps the column bare. The cutoff is computed once, not per row, so the engine can do an index range seek on `order_date`.
- `o.status = 'COMPLETED'` excludes cancelled, pending, or refunded rows. Without it you count someone who abandoned checkout as an active buyer.

Dialect variants for the cutoff — same logic, different spelling:

```sql
-- MySQL / MariaDB
WHERE o.order_date >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
-- also common: NOW() - INTERVAL 30 DAY  (uses datetime, includes time-of-day)

-- PostgreSQL
WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days'
-- or: NOW() - INTERVAL '30 days'

-- SQLite
WHERE o.order_date >= date('now', '-30 days')
-- SQLite has no INTERVAL type; date() does the arithmetic

-- SQL Server
WHERE o.order_date >= DATEADD(day, -30, CAST(GETDATE() AS date))
```

Pick the one your interview uses and say the other two out loud — interviewers love that you know they differ.

When you do need JOIN — and the alternative shapes to compare:

```sql
-- JOIN + DISTINCT: works, but builds duplicates then deduplicates
SELECT DISTINCT c.id, c.name, c.email
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days'
  AND o.status = 'COMPLETED';

-- JOIN + GROUP BY: needed when you also want order metrics
SELECT c.id, c.name, c.email,
       COUNT(o.id) AS order_count,
       MAX(o.order_date) AS latest_order
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days'
  AND o.status = 'COMPLETED'
GROUP BY c.id, c.name, c.email;

-- IN: works for the basic case, but watch NULLs and materialization
SELECT c.id, c.name, c.email
FROM customers c
WHERE c.id IN (
  SELECT o.customer_id
  FROM orders o
  WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days'
    AND o.status = 'COMPLETED'
);
-- If you later flip to NOT IN and the subquery contains a NULL, every row is filtered out
-- because x NOT IN (1, 2, NULL) evaluates to UNKNOWN. NOT EXISTS does not have this trap.
```

Sargable versus non-sargable — the performance killer:

```sql
-- Sargable (good): column stands alone, index can be used
WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days'

-- Non-sargable (bad): function on column, forces full scan even with an index
WHERE DATE(o.order_date) >= CURRENT_DATE - INTERVAL '30 days'
WHERE DATEDIFF(CURRENT_DATE, o.order_date) <= 30
WHERE CAST(o.order_date AS DATE) >= CURRENT_DATE - INTERVAL '30 days'
```

The second group applies a function to every row before comparing, so the B-tree on `order_date` cannot be seeked. On a million-row orders table that is the difference between a few index pages and a full table scan.

The index that makes this instant:

```sql
CREATE INDEX idx_orders_customer_date_status
ON orders (customer_id, order_date, status);
```

Order matters. `customer_id` first lets the engine jump to one customer's slice of the B-tree. `order_date` second lets it range-scan only the last 30 days within that slice. `status` third lets it filter inside the index without visiting the heap. With this index the EXISTS probe is an index-only seek per customer.

Runnable SQLite example you can paste into `sqlite3 :memory:`:

```sql
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, order_date TEXT, status TEXT);

INSERT INTO customers VALUES (1,'Alice','alice@example.com'), (2,'Bob','bob@example.com'), (3,'Charlie','charlie@example.com');
INSERT INTO orders VALUES
  (101, 1, date('now','-5 days'),  'COMPLETED'),
  (102, 1, date('now','-25 days'), 'COMPLETED'),
  (103, 3, date('now','-40 days'), 'COMPLETED'),
  (104, 3, date('now','-2 days'),  'CANCELLED');

-- The actual query
SELECT c.id, c.name
FROM customers c
WHERE EXISTS (
  SELECT 1 FROM orders o
  WHERE o.customer_id = c.id
    AND o.order_date >= date('now','-30 days')
    AND o.status = 'COMPLETED'
);
-- Returns only Alice (id 1). Bob has no orders. Charlie's only recent order is CANCELLED.
```

Time complexity with the composite index: O(C * log K) where C is number of customers scanned and K is orders per customer in the index — one seek per customer that stops at the first match. Space is O(1) besides the output — no hash table for DISTINCT, no sort buffer. Without the index it degrades to O(C * O) scans, and JOIN + DISTINCT adds O(M log M) for deduplication where M is total matching order rows.

## 4. Dry Run — Walk Through a Real Example

Use a fixed today so the math is clear. Let today be 2026-08-27, so the 30-day cutoff is 2026-07-28. Any order_date >= 2026-07-28 counts. We treat the cutoff as start-of-day.

customers:

| id | name    | email               |
|----|---------|---------------------|
| 1  | Alice   | alice@example.com   |
| 2  | Bob     | bob@example.com     |
| 3  | Charlie | charlie@example.com |
| 4  | Diana   | diana@example.com   |

orders:

| id  | customer_id | order_date | status    |
|-----|-------------|------------|-----------|
| 101 | 1           | 2026-08-20 | COMPLETED |
| 102 | 1           | 2026-08-01 | COMPLETED |
| 103 | 3           | 2026-05-10 | COMPLETED |
| 104 | 4           | 2026-08-15 | CANCELLED |
| 105 | 4           | 2026-07-28 | COMPLETED |
| 106 | 4           | 2026-09-01 | COMPLETED |

Notice Diana has three rows to test boundary, status, and future-date handling. Bob has no rows at all.

Run `WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.order_date >= '2026-07-28' AND o.status = 'COMPLETED')`:

Alice (id 1): Probe orders for customer_id = 1. The index finds order 101 first. Check 2026-08-20 >= 2026-07-28 is true, status is COMPLETED is true. EXISTS is true immediately. The engine stops here — order 102 is never read. Alice is kept.

Bob (id 2): Probe orders for customer_id = 2. No rows in the index slice. EXISTS is false. Bob is dropped. This is the no-orders edge.

Charlie (id 3): Probe orders for customer_id = 3. Only order 103 exists. Check 2026-05-10 >= 2026-07-28 is false. No more rows for Charlie. EXISTS is false. Charlie is dropped even though he is a past customer.

Diana (id 4): Probe orders for customer_id = 4. The scan in order_date order hits 106 first if the index is on (customer_id, order_date). Check 2026-09-01 >= 2026-07-28 is true but this is a future date — see edge cases below, most teams exclude it with `AND o.order_date <= CURRENT_DATE`. If you exclude futures, this row is filtered and the scan continues. Next is 104: 2026-08-15 >= 2026-07-28 true but status CANCELLED fails. Next is 105: 2026-07-28 >= 2026-07-28 true and status COMPLETED true. EXISTS becomes true. Diana is kept because of the exact-boundary order. If you use `>` instead of `>=`, Diana would be incorrectly dropped.

Result with future dates allowed: Alice and Diana. Result if you add `AND o.order_date <= CURRENT_DATE`: same, Alice and Diana, because Diana still has the boundary row. If you had dropped order 105, Diana would be excluded.

## 5. Edge Cases — The Ones That Break Naive Solutions

Customers with no orders at all: This is why you do not write `FROM orders JOIN customers` and filter only on orders. Customers with zero orders never appear in the JOIN, but with NOT EXISTS they appear correctly, and with EXISTS they are correctly excluded without a NULL trap. Your test data must include a Bob with zero orders.

Orders exactly on the 30-day boundary: If today is 2026-08-27 and cutoff is 2026-07-28, an order stamped 2026-07-28 00:00:00 should count when you use `>=` and should not count when you use `>`. Interviewers check whether you thought about inclusive versus exclusive. Also watch time-of-day: `CURRENT_DATE - INTERVAL '30 days'` is midnight 30 days ago, but `NOW() - INTERVAL '30 days'` is the exact time 30 days ago. An order at 09:00 on the boundary day counts with CURRENT_DATE but might not with NOW(). State which you mean.

Future-dated orders: Bad clocks, pre-orders, or future ship dates can create rows with order_date tomorrow. `o.order_date >= cutoff` alone includes them. Most production queries add `AND o.order_date <= CURRENT_DATE` or `AND o.order_date <= NOW()` to cap the window to the last 30 real days. Decide and say it out loud.

Sargability trap: Wrapping the column like `DATE(o.order_date) >= cutoff` or `DATEDIFF(NOW(), o.order_date) <= 30` forces a full scan even if you built the perfect index. Keep the column bare. Compute the cutoff once on the right side.

NULL customer_id in orders: If the orders table allows NULL customer_id (guest checkouts), `WHERE c.id IN (SELECT customer_id FROM orders ...)` can return unexpected NULL handling, and `NOT IN` breaks entirely — a single NULL in the subquery makes `x NOT IN (1, 2, NULL)` evaluate to UNKNOWN for every row, returning zero results. EXISTS and NOT EXISTS do not have this problem because they correlate and test existence, not list membership.

Duplicate explosion with JOIN: A JOIN without DISTINCT or GROUP BY returns one row per order, not per customer. A customer with 50 orders appears 50 times. DISTINCT fixes the display but costs a hash or sort over all matching rows. EXISTS never creates the duplicates in the first place.

Cancelled and soft-deleted orders: Filters like `status = 'COMPLETED'` and `deleted_at IS NULL` belong inside the EXISTS subquery, not only in the outer WHERE. Otherwise you count abandoned carts as active customers.

Timezone mismatch: If order_date is stored as UTC timestamp but you compare with `CURRENT_DATE` in the database's local timezone, customers near midnight get clipped. In Postgres use `NOW() AT TIME ZONE 'UTC'` or store and compare consistently in UTC, and mention it in the interview.

## 6. Variations and Follow-ups

Variation 1 — Customers who ordered every month for the last 3 months (relational division): The interviewer wants to see if you know GROUP BY with HAVING and COUNT DISTINCT over a date bucket.

```sql
-- Postgres
SELECT c.id, c.name
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.order_date >= CURRENT_DATE - INTERVAL '3 months'
  AND o.status = 'COMPLETED'
GROUP BY c.id, c.name
HAVING COUNT(DISTINCT date_trunc('month', o.order_date)) = 3;

-- MySQL equivalent of the bucket
-- HAVING COUNT(DISTINCT DATE_FORMAT(o.order_date, '%Y-%m')) = 3

-- SQLite equivalent
-- HAVING COUNT(DISTINCT strftime('%Y-%m', o.order_date)) = 3
```

You bucket each order by month, count distinct months per customer, and keep only those with 3. Note this is one place where JOIN + GROUP BY is the right tool — EXISTS alone cannot count months.

Variation 2 — Customers who did NOT order in the last 30 days (churned or dormant): Flip EXISTS to NOT EXISTS. Do not use NOT IN.

```sql
SELECT c.id, c.name
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM orders o
  WHERE o.customer_id = c.id
    AND o.order_date >= CURRENT_DATE - INTERVAL '30 days'
    AND o.status = 'COMPLETED'
);
```

If you write `c.id NOT IN (SELECT customer_id FROM orders WHERE ...)` and one customer_id is NULL, the query returns zero rows because of three-valued logic. NOT EXISTS is safe.

Variation 3 — Need order metrics too, like count and total spent: Now you do want JOIN, because you need aggregates from the child table.

```sql
SELECT c.id, c.name,
       COUNT(o.id) AS order_count,
       SUM(o.total_amount) AS total_spent,
       MAX(o.order_date) AS latest_order
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days'
  AND o.order_date <= CURRENT_DATE
  AND o.status = 'COMPLETED'
GROUP BY c.id, c.name
ORDER BY total_spent DESC
LIMIT 5;
```

Variation 4 — Large admin page that pages through results: OFFSET gets slower as you go deeper because the engine still scans the skipped rows. Use keyset pagination on the customer id.

```sql
SELECT c.id, c.name
FROM customers c
WHERE c.id > :last_seen_id
  AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.customer_id = c.id
      AND o.order_date >= CURRENT_DATE - INTERVAL '30 days'
      AND o.status = 'COMPLETED'
  )
ORDER BY c.id
LIMIT 25;
```

Variation 5 — Include the order count alongside the exists check without JOINing the whole table: Use a lateral aggregate or a counted EXISTS depending on dialect. In Postgres you can also use a correlated count in the SELECT list, but for just the filter EXISTS remains the cheapest path.

## 7. 🧠 The Memory Hook

JOIN makes copies then cleans them up, IN makes a list then checks it, EXISTS just peeks and stops — when you only need to know that one recent order exists, peek and stop with a bare column `o.order_date >= cutoff` so the index can actually answer.
