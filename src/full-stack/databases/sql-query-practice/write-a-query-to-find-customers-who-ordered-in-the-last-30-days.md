# Write a Query to Find Customers Who Ordered in the Last 30 Days in SQL

## 1. What the Interviewer Is Really Testing

This looks like an introductory SQL filter question, but it is actually a diagnostic test of three core database engineering principles:

First, how you handle one-to-many relationships without triggering duplicate row explosion. When a customer places twenty orders in a month, a standard `JOIN` produces twenty duplicate customer rows that must be collapsed with `DISTINCT`. The interviewer wants to see if you instinctively reach for `EXISTS` to avoid generating and deduplicating those rows.

Second, whether your date filtering predicates are SARGable (Search Argument Able). Wrapping timestamp columns in database functions like `DATE(order_date)` or `DATEDIFF()` destroys the database engine's ability to use indexes, turning an instant B-Tree seek into a table-wide disk scan.

Third, your grasp of composite B-tree indexing on foreign keys and timestamps to make queries run in constant memory and minimal I/O.

## 2. Think Before You Code — The Senior Dev Thought Process

The naive reaction to this problem is joining `customers` and `orders` on `customer_id` and applying a date filter in the `WHERE` clause:

```sql
-- The naive brute-force approach
SELECT DISTINCT c.id, c.name, c.email
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE o.order_date >= NOW() - INTERVAL 30 DAY;
```

Why is this suboptimal for a production system?

The `customers` to `orders` relationship is 1:N. An active e-commerce customer might have 50 completed orders in the last 30 days. Joining these tables forces the database engine to construct an intermediate result set containing 50 identical rows for that single customer. Afterwards, the `DISTINCT` operator forces the query engine to allocate a hash table in memory or run an expensive disk filesort to discard the 49 duplicates it just created.

The realization: the final output requires attributes strictly from the `customers` table. We do not need any column values from `orders` in our `SELECT` projection. We only need to answer a boolean question: does at least one qualifying order exist for this customer?

When checking for existence across a 1:N relationship without projecting child columns, a correlated `WHERE EXISTS` subquery is the optimal pattern. `EXISTS` executes a semi-join: the query engine inspects the orders index for a given customer and halts (short-circuits) the moment it encounters the very first matching record. It never scans the remaining 49 orders, produces zero duplicate rows, and requires zero deduplication memory.

To keep the filter SARGable, the column `o.order_date` must stand alone on one side of the comparison operator against the computed cutoff timestamp (`NOW() - INTERVAL 30 DAY`).

## 3. The Solution — Fully Explained Code

The production standard solution uses a correlated `EXISTS` subquery with a SARGable date condition and order status validation.

```sql
-- Approach 1: Correlated EXISTS (Production Standard)
-- Dialect: MySQL (For PostgreSQL, use INTERVAL '30 days')
SELECT 
    c.id, 
    c.name, 
    c.email 
FROM customers c 
WHERE EXISTS (
    SELECT 1 
    FROM orders o 
    WHERE o.customer_id = c.id 
      AND o.order_date >= NOW() - INTERVAL 30 DAY 
      AND o.status = 'COMPLETED'
);
```

Let's break down how this works:
- `SELECT c.id, c.name, c.email`: Projects only the customer attributes needed by the client.
- `WHERE EXISTS (...)`: Returns `TRUE` the moment the subquery matches a single row for that customer.
- `SELECT 1`: A standard convention. The query optimizer ignores the `SELECT` list inside an `EXISTS` clause because it checks for row existence, not projected values.
- `o.customer_id = c.id`: Correlates the inner query with the outer customer record.
- `o.order_date >= NOW() - INTERVAL 30 DAY`: Compares the raw indexed column against the date boundary computed once per query execution.
- `o.status = 'COMPLETED'`: Ensures pending, cancelled, or failed checkouts are not counted as valid orders.

If the interviewer asks for metrics from the orders table (such as total spend or order count), pivot to an `INNER JOIN` with `GROUP BY`:

```sql
-- Approach 2: INNER JOIN with Aggregation (When order metrics are required)
SELECT 
    c.id, 
    c.name, 
    c.email, 
    COUNT(o.id) AS order_count, 
    MAX(o.order_date) AS latest_order 
FROM customers c 
INNER JOIN orders o 
    ON c.id = o.customer_id 
WHERE o.order_date >= NOW() - INTERVAL 30 DAY 
  AND o.status = 'COMPLETED'
GROUP BY c.id, c.name, c.email;
```

**Performance & Engine Execution Complexity:**

With the composite index `orders(customer_id, order_date, status)`:
- Time Complexity: O(C * log K) where `C` is the number of customers and `K` is the number of orders per customer in the index. The database performs an index seek per customer and short-circuits on the first matching leaf.
- Space Complexity: O(1) auxiliary memory. No temporary tables, hash tables, or sort buffers are created.

Without an index:
- Time Complexity: O(C * O) where `O` is the total row count in `orders`.
- `JOIN + DISTINCT` Complexity: O(M log M) where `M` is the total matching order rows, requiring memory allocation proportional to all matching orders to sort and deduplicate.

**The Supporting Index:**

To make this query instant at scale, create a composite covering index on the `orders` table:

```sql
CREATE INDEX idx_orders_customer_date_status 
ON orders (customer_id, order_date, status);
```

Column order in this B-Tree index is deliberate:
1. `customer_id` (Equality): Instantly navigates to the customer's subset of orders in the B-Tree.
2. `order_date` (Range): Allows range scanning only the orders placed within the last 30 days.
3. `status` (Covering filter): Evaluates order completion directly inside the index page, eliminating table heap page lookups (an index-only scan).

## 4. Dry Run — Walk Through a Real Example

Consider the following sample dataset where today's date is `2026-08-26`. The 30-day cutoff timestamp (`NOW() - INTERVAL 30 DAY`) is `2026-07-27`.

`customers` table:
| id | name | email |
|---|---|---|
| 1 | Alice | alice@example.com |
| 2 | Bob | bob@example.com |
| 3 | Charlie | charlie@example.com |
| 4 | Diana | diana@example.com |

`orders` table:
| id | customer_id | order_date | status |
|---|---|---|---|
| 101 | 1 | 2026-08-20 | COMPLETED |
| 102 | 1 | 2026-08-01 | COMPLETED |
| 103 | 3 | 2026-05-10 | COMPLETED |
| 104 | 4 | 2026-08-15 | CANCELLED |

Execution trace of the `EXISTS` query:

Step 1: The database evaluates Customer 1 (Alice).
- The subquery searches `orders` for `customer_id = 1 AND order_date >= '2026-07-27' AND status = 'COMPLETED'`.
- The index seek inspects order `101`. Date `2026-08-20 >= 2026-07-27` is `TRUE`, and `status = 'COMPLETED'` is `TRUE`.
- A match is found. `EXISTS` returns `TRUE` immediately and short-circuits. Order `102` is never read.
- Alice is emitted to the output stream.

Step 2: The database evaluates Customer 2 (Bob).
- The subquery searches `orders` for `customer_id = 2`.
- The index seek finds 0 records for `customer_id = 2`.
- `EXISTS` evaluates to `FALSE`. Bob is excluded.

Step 3: The database evaluates Customer 3 (Charlie).
- The subquery searches `orders` for `customer_id = 3`.
- Order `103` is found. Date check: `2026-05-10 >= 2026-07-27` evaluates to `FALSE`.
- No further orders exist for Charlie. `EXISTS` evaluates to `FALSE`. Charlie is excluded.

Step 4: The database evaluates Customer 4 (Diana).
- The subquery searches `orders` for `customer_id = 4`.
- Order `104` is found with date `2026-08-15` (passes date filter), but `status = 'CANCELLED'` fails the `status = 'COMPLETED'` check.
- `EXISTS` evaluates to `FALSE`. Diana is excluded.

Final Result Set:
| id | name | email |
|---|---|---|
| 1 | Alice | alice@example.com |

## 5. Edge Cases — The Ones That Break Naive Solutions

Frequent buyers with hundreds of orders:
In high-volume systems, power buyers or wholesale accounts may place hundreds of orders per month. A naive `INNER JOIN + DISTINCT` generates hundreds of intermediate rows for every power buyer, inflating memory consumption and spilling sort buffers to disk. `EXISTS` eliminates this issue entirely by stopping at the first match.

Non-SARGable date functions:
Writing `WHERE DATEDIFF(NOW(), o.order_date) <= 30` or `WHERE DATE(o.order_date) >= ...` applies a function transformation to every single row in the `orders` table. Even with a B-tree index on `order_date`, the database engine cannot perform an index range scan on a wrapped column and is forced to run a full table scan. Keeping `o.order_date` unwrapped on the left side preserves index seek capabilities.

Order status and soft deletes:
Customers who initiated checkouts that failed, were abandoned, or were refunded did not complete an order. Omitting `o.status = 'COMPLETED'` or `o.deleted_at IS NULL` falsely categorizes inactive or churned users as active buyers.

Three-valued logic trap with `NOT IN` vs `NOT EXISTS`:
If an interviewer flips the question to "Find customers who did NOT order in the last 30 days", using `WHERE c.id NOT IN (SELECT customer_id FROM orders ...)` will return zero rows if even a single `customer_id` in the `orders` subquery is `NULL`. In SQL three-valued logic, `value NOT IN (1, 2, NULL)` evaluates to `UNKNOWN`, filtering out all records. `NOT EXISTS` safely handles `NULL` values.

Timezone boundaries and server clock skew:
Using `NOW()` evaluates against the database server's local system time. In distributed cloud architectures where timestamps are stored in UTC, compare against `CURRENT_TIMESTAMP AT TIME ZONE 'UTC'` (or `UTC_TIMESTAMP()`) to avoid boundary clipping for international customers.

## 6. Variations and Follow-ups

Variation 1: Find churned customers who ordered in the past, but placed zero orders in the last 30 days.
Solution: Combine customer registration age with a `NOT EXISTS` clause:

```sql
SELECT 
    c.id, 
    c.name, 
    c.email 
FROM customers c 
WHERE c.created_at < NOW() - INTERVAL 30 DAY 
  AND NOT EXISTS (
      SELECT 1 
      FROM orders o 
      WHERE o.customer_id = c.id 
        AND o.order_date >= NOW() - INTERVAL 30 DAY 
        AND o.status = 'COMPLETED'
  );
```

Variation 2: Return the top 5 highest-spending customers in the last 30 days.
Solution: Switch to `INNER JOIN`, calculate revenue with `SUM()`, and rank with `ORDER BY ... DESC LIMIT`:

```sql
SELECT 
    c.id, 
    c.name, 
    c.email, 
    SUM(o.total_amount) AS total_spent 
FROM customers c 
INNER JOIN orders o 
    ON c.id = o.customer_id 
WHERE o.order_date >= NOW() - INTERVAL 30 DAY 
  AND o.status = 'COMPLETED' 
GROUP BY c.id, c.name, c.email 
ORDER BY total_spent DESC 
LIMIT 5;
```

Variation 3: Efficient pagination for admin dashboards over millions of customers.
Solution: Avoid `OFFSET` because it requires scanning and discarding prior rows. Use keyset pagination with cursor filtering:

```sql
SELECT 
    c.id, 
    c.name, 
    c.email 
FROM customers c 
WHERE c.id > :last_seen_id 
  AND EXISTS (
      SELECT 1 
      FROM orders o 
      WHERE o.customer_id = c.id 
        AND o.order_date >= NOW() - INTERVAL 30 DAY 
        AND o.status = 'COMPLETED'
  )
ORDER BY c.id ASC 
LIMIT 25;
```

## 7. 🧠 The Memory Hook

`EXISTS` checks presence and stops at one; `JOIN` duplicates rows and forces a sort.
