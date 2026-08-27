# Write a Query Using `HAVING` in SQL: Post-Aggregation Filtering vs `WHERE` Clause

## 1. What the Interviewer Is Really Testing

This looks like a syntax question — do you know the word HAVING — but it is really a test of whether you understand when the database does what.

An interviewer asks for HAVING to see if you know the logical order a query runs in. WHERE filters single rows before any grouping happens. HAVING filters whole groups after the GROUP BY has done its work. If you mix those up, you either get a syntax error (putting an aggregate in WHERE) or a query that technically runs but scans millions of rows and builds giant hash tables for no reason.

They are also checking whether you can combine four clauses cleanly in one production-grade query — WHERE for index-friendly row pruning, GROUP BY for bucketing, HAVING for metric thresholds like COUNT(*) > 1 or SUM() > 1000, and ORDER BY for the final sort — and whether you know why aggregates are illegal in WHERE in the first place.

## 2. Think Before You Code — The Senior Dev Thought Process

The prompt we will solve is concrete:

> "Find VIP customers who placed more than 5 completed orders totaling over $1,000 in 2024, sorted by lifetime value descending."

My first instinct is to write one WHERE with everything, because that is how we filter every day:

```sql
-- WRONG: standard SQL throws "aggregate functions are not allowed in WHERE"
SELECT customer_id, COUNT(id), SUM(total_amount)
FROM Orders
WHERE order_date >= '2024-01-01'
  AND status = 'COMPLETED'
  AND COUNT(id) > 5
  AND SUM(total_amount) > 1000
GROUP BY customer_id;
```

This fails immediately. The database runs clauses in a fixed logical order, not the order we type them:

1. FROM — pick the source table and joins
2. WHERE — throw away individual rows that do not qualify
3. GROUP BY — bucket the surviving rows into groups
4. HAVING — throw away whole groups that do not qualify
5. SELECT — compute the final columns and aliases
6. ORDER BY — sort what is left
7. LIMIT / OFFSET — trim the result

When WHERE runs in step 2, there are no groups yet. COUNT() and SUM() do not exist yet, so the engine has nothing to compare.

The opposite mistake is just as common — putting everything in HAVING so it at least compiles:

```sql
-- DANGEROUS: compiles in some dialects, but kills performance
SELECT customer_id, COUNT(id), SUM(total_amount)
FROM Orders
GROUP BY customer_id
HAVING status = 'COMPLETED'
   AND order_date >= '2024-01-01'
   AND COUNT(id) > 5
   AND SUM(total_amount) > 1000;
```

If you do this, the optimizer cannot use an index on (status, order_date) to skip old or cancelled rows. Instead it reads every row in the table, builds a hash bucket for every customer who ever ordered, computes sums for all of them, and only then discards 90 percent of the work. On a table with 50 million rows that spills to disk.

The senior split is obvious once you see the pipeline: row-level predicates go in WHERE so the scan stays small, group-level predicates go in HAVING so only meaningful buckets survive. That is the whole decision — WHERE prunes rows before the blender, HAVING prunes smoothies after.

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
   AND SUM(total_amount) > 1000
ORDER BY lifetime_value DESC;
```

Why each piece sits where it does:

FROM Orders tells the engine which table to scan. WHERE order_date >= '2024-01-01' AND status = 'COMPLETED' runs first on every raw row. With an index on (status, order_date) — or better, a covering index on (status, order_date, customer_id, total_amount) — this becomes an index range scan that discards years of history and every pending or cancelled order before any memory is allocated for grouping.

GROUP BY customer_id then gathers the surviving rows into one bucket per customer. COUNT(id) counts non-null order ids in each bucket, SUM(total_amount) adds their amounts. Using COUNT(*) would count every row in the bucket including rows where id is null (rare for a primary key but the semantic difference matters). For duplicate detection the classic pattern is HAVING COUNT(*) > 1, which says "only keep groups where the same key appeared more than once."

HAVING COUNT(id) > 5 AND SUM(total_amount) > 1000 runs after the buckets are built and throws away customers who did not order often enough or spend enough. ORDER BY lifetime_value DESC sorts the survivors so the biggest spenders come first.

This query runs in any modern database. In SQLite you can paste it as-is with a TEXT date. In PostgreSQL and MySQL the same syntax applies, only the index type and work_mem tuning differ.

Time complexity: O(N) to scan N rows down to R survivors via the WHERE index, then O(R) hash aggregation to build M groups, then O(M log M) to sort the qualifiers. With a selective WHERE, R is much smaller than N, so the query stays fast even at tens of millions of rows.

Space complexity: O(M) working memory to hold the hash table of M customer_id groups and their running COUNT and SUM. If M exceeds work_mem (PostgreSQL) or the sort buffer (MySQL), the engine spills partitions to disk.

## 4. Dry Run — Walk Through a Real Example

Take this Orders data:

| id | customer_id | order_date | status    | total_amount |
|---:|---:|---|---:|---:|
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

Stage 1 — WHERE filters rows before grouping. The engine checks order_date >= '2024-01-01' AND status = 'COMPLETED' on each row. Row 4 is dropped because it is CANCELLED. Row 8 is dropped because its date is in 2023. The other 15 rows pass. This is the crucial difference: these two rows never reach the GROUP BY at all, so they never cost aggregation memory.

Stage 2 — GROUP BY buckets the survivors and computes aggregates:

| customer_id | row ids included | COUNT(id) | SUM(total_amount) |
|---:|---|---:|---:|
| 101 | 1, 2, 3, 5, 6, 7 | 6 | 1450.00 |
| 102 | 9 | 1 | 100.00 |
| 103 | 10, 11 | 2 | 4300.00 |
| 104 | 12, 13, 14, 15, 16, 17 | 6 | 450.00 |

Stage 3 — HAVING filters groups after aggregation. COUNT(id) > 5 AND SUM(total_amount) > 1000 is checked per bucket. Customer 101 has 6 and 1450 — passes. Customer 102 has 1 and 100 — fails. Customer 103 has 2 and 4300 — fails the count even though spend is huge. Customer 104 has 6 but only 450 — fails the sum. Only 101 survives.

Stage 4 — SELECT and ORDER BY project the final columns and sort. With one row left, the result is:

| customer_id | completed_orders | lifetime_value |
|---:|---:|---:|
| 101 | 6 | 1450.00 |

If we had swapped the filters and put the date in HAVING, stage 1 would have been empty, stage 2 would have built buckets for all four customers including the 2023 row and the cancelled row, and stage 3 would have had to discard them later after paying the full grouping cost. Same answer, much more work.

You can verify the runnable version in SQLite:

```sql
CREATE TABLE Orders(id INTEGER PRIMARY KEY, customer_id INT, order_date TEXT, status TEXT, total_amount REAL);
INSERT INTO Orders VALUES
 (1,101,'2024-01-15','COMPLETED',250),(2,101,'2024-02-10','COMPLETED',300),
 (3,101,'2024-03-05','COMPLETED',150),(4,101,'2024-04-12','CANCELLED',500),
 (5,101,'2024-05-18','COMPLETED',200),(6,101,'2024-06-20','COMPLETED',150),
 (7,101,'2024-07-22','COMPLETED',400),(8,102,'2023-11-05','COMPLETED',1200),
 (9,102,'2024-02-01','COMPLETED',100),(10,103,'2024-01-20','COMPLETED',3500),
 (11,103,'2024-03-15','COMPLETED',800),(12,104,'2024-01-10','COMPLETED',80),
 (13,104,'2024-02-14','COMPLETED',70),(14,104,'2024-03-01','COMPLETED',60),
 (15,104,'2024-04-10','COMPLETED',90),(16,104,'2024-05-05','COMPLETED',50),
 (17,104,'2024-06-18','COMPLETED',100);

SELECT customer_id, COUNT(id) AS completed_orders, SUM(total_amount) AS lifetime_value
FROM Orders
WHERE order_date >= '2024-01-01' AND status = 'COMPLETED'
GROUP BY customer_id
HAVING COUNT(id) > 5 AND SUM(total_amount) > 1000
ORDER BY lifetime_value DESC;
-- returns 101 | 6 | 1450.0
```

## 5. Edge Cases — The Ones That Break Naive Solutions

HAVING without GROUP BY treats the whole result as one group. SELECT COUNT(*) FROM Orders HAVING COUNT(*) > 5 is valid SQL. Without a GROUP BY the engine aggregates all rows that passed WHERE into a single bucket, then HAVING decides whether to return one summary row or zero rows. Beginners expect an error, but the query runs and returns either one row or an empty set, not one row per input.

Using column aliases in HAVING breaks in strict SQL. The logical order is FROM -> WHERE -> GROUP BY -> HAVING -> SELECT, so when HAVING runs the SELECT aliases do not exist yet. PostgreSQL, Oracle, and SQL Server enforce this and throw "column completed_orders does not exist" if you write HAVING completed_orders > 5. You must repeat the expression HAVING COUNT(id) > 5. MySQL allows the alias as a non-standard extension, but writing the full aggregate keeps the query portable.

NULL values silently change aggregates. COUNT(id) skips null ids, COUNT(*) counts every row regardless of nulls — important when hunting duplicates with HAVING COUNT(*) > 1 versus HAVING COUNT(email) > 1. SUM(total_amount) ignores null amounts. If every row in a group has a null amount, SUM returns NULL, and NULL > 1000 evaluates to UNKNOWN which HAVING treats as false, so the group is dropped without an error.

Empty input after WHERE yields an empty set, not a zero row. When WHERE filters out every row, GROUP BY produces zero groups and the query returns zero rows. This is different from an ungrouped aggregate like SELECT COUNT(*) FROM Orders WHERE 1=0, which always returns one row containing 0. Forgetting this distinction causes off-by-one bugs in dashboards that expect a row.

Inclusive versus exclusive thresholds. The prompt says more than 5 and over $1,000, which is > 5 and > 1000. Writing >= 5 or >= 1000 silently includes customers sitting exactly on the boundary. In an interview, state the operator out loud and ask whether the boundary is inclusive.

Memory spill from missing WHERE. If you omit WHERE and filter dates in HAVING, a 50-million-row Orders table forces the engine to build hash entries for every customer in history. When that exceeds work_mem or the sort buffer, the database spills partitions to disk, the query goes from milliseconds to seconds, and concurrent queries suffer.

## 6. Variations and Follow-ups

Duplicate detection with HAVING COUNT(*) > 1. The most common follow-up is "find emails that appear more than once." The pattern is identical, just a different grouping key:

```sql
SELECT email, COUNT(*) AS occurrences
FROM Customers
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY occurrences DESC;
```

This shows you recognized the template: group by the thing you want to deduplicate, filter groups by count.

Joining customer details without bloating the group. If the business wants name and email alongside the metrics, you can join before grouping but then you must group by the customer columns:

```sql
SELECT c.id, c.name, c.email, COUNT(o.id) AS completed_orders, SUM(o.total_amount) AS lifetime_value
FROM Customers c
JOIN Orders o ON c.id = o.customer_id
WHERE o.order_date >= '2024-01-01' AND o.status = 'COMPLETED'
GROUP BY c.id, c.name, c.email
HAVING COUNT(o.id) > 5 AND SUM(o.total_amount) > 1000
ORDER BY lifetime_value DESC;
```

At scale it is cheaper to aggregate first and join only the survivors, keeping the hash table small:

```sql
WITH VipCustomers AS (
    SELECT customer_id, COUNT(id) AS completed_orders, SUM(total_amount) AS lifetime_value
    FROM Orders
    WHERE order_date >= '2024-01-01' AND status = 'COMPLETED'
    GROUP BY customer_id
    HAVING COUNT(id) > 5 AND SUM(total_amount) > 1000
)
SELECT c.id, c.name, c.email, v.completed_orders, v.lifetime_value
FROM VipCustomers v
JOIN Customers c ON v.customer_id = c.id
ORDER BY v.lifetime_value DESC;
```

Yearly VIP per customer with a dynamic grouping key. If the interviewer removes the hardcoded date and asks for VIP status per year:

```sql
SELECT customer_id, EXTRACT(YEAR FROM order_date) AS order_year,
       COUNT(id) AS completed_orders, SUM(total_amount) AS yearly_value
FROM Orders
WHERE status = 'COMPLETED'
GROUP BY customer_id, EXTRACT(YEAR FROM order_date)
HAVING COUNT(id) > 5 AND SUM(total_amount) > 1000
ORDER BY order_year DESC, yearly_value DESC;
-- SQLite variant: use strftime('%Y', order_date) instead of EXTRACT
```

The same two-stage filter remains — WHERE prunes by status, HAVING prunes by the per-year aggregates.

Keeping individual rows with window functions instead of HAVING. When the frontend needs every order line item on screen but only for VIP customers, GROUP BY + HAVING collapses rows and destroys detail. Use a window to compute the per-customer totals alongside each row, then filter rows:

```sql
WITH RankedOrders AS (
    SELECT id, customer_id, order_date, total_amount,
           COUNT(id) OVER (PARTITION BY customer_id) AS total_customer_orders,
           SUM(total_amount) OVER (PARTITION BY customer_id) AS total_customer_spend
    FROM Orders
    WHERE order_date >= '2024-01-01' AND status = 'COMPLETED'
)
SELECT id, customer_id, order_date, total_amount
FROM RankedOrders
WHERE total_customer_orders > 5 AND total_customer_spend > 1000;
```

HAVING cannot do this because HAVING must collapse to one row per group. Windows keep the granularity and still let you threshold on the aggregate. An interviewer who asks "what if you need the rows, not the summary" is testing exactly this distinction.

## 7. 🧠 The Memory Hook

WHERE filters ingredients before they go into the blender, HAVING filters smoothies after they are poured. If you can discard a row without measuring the whole group, put that test in WHERE so the blender does a fraction of the work.
