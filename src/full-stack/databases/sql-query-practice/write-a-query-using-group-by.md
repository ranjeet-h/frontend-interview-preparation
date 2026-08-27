# Write a Query Using GROUP BY in SQL: Bucketing, Aggregation Pipeline, and ONLY_FULL_GROUP_BY

## 1. What the Interviewer Is Really Testing

Picture this: your dashboard query fetches ten million order rows into Node just to run `.reduce()` on the app server, the API times out after thirty seconds, and the reviewer asks why you did not let the database do the math. That is the moment GROUP BY stops being syntax and becomes survival.

When an interviewer says write a GROUP BY, they are not checking if you memorized the keyword order. They are checking four things at once, and they listen for you to name them without being prompted.

First, do you know the real execution order. You write `SELECT` first, but the engine runs `FROM` and `JOIN` first, then `WHERE` to throw away rows, then `GROUP BY` to collapse what is left into buckets, then `HAVING` to throw away buckets, and only then `SELECT` to compute expressions and aliases, then `ORDER BY` and `LIMIT`. If you think `WHERE SUM(amount) > 500` should work, you do not know where grouping happens.

Second, do you respect the determinism rule. Every column in `SELECT` must have one value per bucket. Either it is in the `GROUP BY` list so it labels the bucket, or it is wrapped in an aggregate like `COUNT`, `SUM`, `AVG`, `MIN`, `MAX` so all the values inside the bucket get melted into one number. If you select a bare `customer_id` while grouping by `country, category`, the database has two different customer IDs in the same bucket and no rule to pick. Modern MySQL calls this `ONLY_FULL_GROUP_BY` and throws Error 1055. Postgres and SQLite reject it the same way.

Third, can you do more than one dimension cleanly. Interviewers want `country` and `category` together, then subtotals per country and a grand total, in one scan. They watch whether you reach for three queries stitched with `UNION ALL` or for one `WITH ROLLUP` or `GROUPING SETS`.

Fourth, do you understand what the engine actually does and what makes it fast or slow. An unindexed `GROUP BY` forces a hash table or a filesort and spills to disk. A covering composite index lets the engine stream sorted rows and flush each group as soon as the key changes.

If you can explain those four, the syntax is the easy part.

## 2. Think Before You Code — The Senior Dev Thought Process

The first thing I notice when I see this problem is the grain shift. The raw `Sales` table is one row per order. The report the business wants is one row per `(country, category)` pair, plus extra rows for the rollup totals. So every raw row must land in exactly one base bucket, and then some buckets get folded into larger buckets. That immediately tells me this is a bucketing problem, not a row-filtering problem.

My brute-force instinct, especially on a take-home, would be to cheat and do it in JavaScript. Fetch everything with `SELECT * FROM Sales`, then loop and build a map. That works for the six rows in the example. It falls apart at ten million rows because I am paying network cost for every byte, holding all rows in memory, and burning GC time to do work the storage engine could have done next to the data pages. The interviewer will call that out.

The other naive path is to stay in SQL but write three separate queries. One for `GROUP BY country, category`, one for `GROUP BY country`, one for the grand total, then `UNION ALL` them. That gives correct numbers but it scans the table three times and repeats the same aggregation logic. It also leaves me to manually invent labels for the subtotal rows.

The pattern I am really looking for is single-pass hierarchical aggregation. If the interview wants subtotals and grand totals, I should reach for `GROUP BY country, category WITH ROLLUP` in MySQL, or `GROUP BY GROUPING SETS ((country, category), (country), ())` in Postgres, or the equivalent in SQLite. That tells the optimizer to compute base buckets, country buckets, and the global bucket in one pipeline. The engine will produce `NULL` in the collapsed column for the higher levels, so I need a plan for those NULLs. I will use `GROUPING()` to tell a real data NULL apart from a rollup NULL, or at least `COALESCE` to replace them with labels like `All Categories` before they hit the API.

Next I pick the aggregates. For volume I want `COUNT(*)` because I care how many rows are in the bucket. `COUNT(order_id)` gives the same answer here because `order_id` is a non-nullable primary key, but `COUNT(discount_code)` would be different because it skips nulls. For revenue I want `SUM(amount)`. For average basket I want `AVG(amount)` and I will `ROUND(..., 2)` because money should not show four decimal places. I also decide up front to use `HAVING` for bucket filters like `HAVING SUM(amount) >= 10000` and `WHERE` only for row filters like `WHERE order_date >= '2026-01-01'`, because mixing them is a common failure.

Finally I think about speed. Ten million rows with no index means a hash table sized by the number of unique `(country, category)` pairs and possibly a disk spill. A composite index on `(country, category, amount)` is a covering index for this query. The data arrives pre-sorted by country then category, so the engine can keep running totals for the current group, emit the row when the key changes, and never hold more than one group's state.

So before I type `SELECT`, I already know the grain, the single-pass rollup shape, the three aggregates, how I will label the NULLs, where `WHERE` stops and `HAVING` starts, and what index would make it stream.

## 3. The Solution — Fully Explained Code

This is a complete, runnable example. It runs as-is in SQLite, and the same shapes work in MySQL 8 and Postgres with the dialect notes inline.

**Setup — the Sales table and sample data**

```sql
-- Works in SQLite, MySQL, Postgres
CREATE TABLE Sales (
    order_id    INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    country     TEXT NOT NULL,
    category    TEXT NOT NULL,
    amount      REAL NOT NULL,
    order_date  TEXT NOT NULL
);

INSERT INTO Sales (order_id, customer_id, country, category, amount, order_date) VALUES
(101, 1, 'US', 'Electronics', 300.00, '2026-01-01'),
(102, 2, 'US', 'Electronics', 700.00, '2026-01-02'),
(103, 3, 'US', 'Apparel',     150.00, '2026-01-03'),
(104, 4, 'DE', 'Electronics', 400.00, '2026-01-04'),
(105, 5, 'DE', 'Apparel',     200.00, '2026-01-05'),
(106, 6, 'DE', 'Apparel',     100.00, '2026-01-06');
```

**Query 1 — basic GROUP BY with COUNT, SUM, AVG**

This is the core report: one row per country and category.

```sql
-- One row per (country, category). Every SELECT column is either grouped or aggregated.
SELECT
    country,
    category,
    COUNT(*)              AS order_count,      -- counts rows in the bucket
    SUM(amount)           AS total_revenue,    -- melts all amounts in the bucket into one sum
    ROUND(AVG(amount), 2) AS avg_order_value  -- melts amounts into one average, rounded for money
FROM Sales
GROUP BY country, category
ORDER BY country ASC, total_revenue DESC;
```

Why these aggregates and not others. `COUNT(*)` counts rows no matter what is null, which is what we want for order volume. `SUM` and `AVG` look at `amount` only. If `amount` could be null, `AVG` would ignore those nulls, so a bucket with amounts 100, null, 200 would average to 150, not 100. That is worth calling out in an interview.

**Query 2 — filtering buckets with HAVING vs filtering rows with WHERE**

`WHERE` runs before buckets exist. `HAVING` runs after.

```sql
-- WHERE throws away rows before grouping, HAVING throws away buckets after grouping
SELECT
    country,
    SUM(amount) AS total_revenue
FROM Sales
WHERE order_date >= '2026-01-01'   -- row filter: do this first, it shrinks the input
GROUP BY country
HAVING SUM(amount) >= 500;         -- bucket filter: only keep country buckets that earned 500+
```

If you write `WHERE SUM(amount) >= 500` you get Error 1111 in MySQL or a similar error elsewhere, because at the `WHERE` stage `SUM(amount)` does not exist yet. Use `HAVING` for anything that mentions an aggregate, and prefer putting row predicates in `WHERE` so the grouping has less work to do.

**Query 3 — one-scan subtotals and grand total**

MySQL prefers `WITH ROLLUP`. Postgres and SQL Server prefer `GROUPING SETS` (also available in recent SQLite builds where enabled). They compute the same result without three scans or a `UNION ALL`.

```sql
-- MySQL style: ROLLUP adds country subtotals and a grand total automatically
SELECT
    CASE WHEN GROUPING(country) = 1 THEN 'Global Total' ELSE country END AS country,
    CASE
        WHEN GROUPING(category) = 1 AND GROUPING(country) = 0 THEN 'All Categories (Subtotal)'
        WHEN GROUPING(category) = 1 AND GROUPING(country) = 1 THEN 'All Categories'
        ELSE category
    END AS category,
    COUNT(*)              AS order_count,
    SUM(amount)           AS total_revenue,
    ROUND(AVG(amount), 2) AS avg_order_value
FROM Sales
GROUP BY country, category WITH ROLLUP;
```

```sql
-- Postgres / SQL Server style (SQLite 3.44+ where enabled): you name exactly which levels you want
SELECT
    country,
    category,
    COUNT(*)   AS order_count,
    SUM(amount) AS total_revenue
FROM Sales
GROUP BY GROUPING SETS (
    (country, category),  -- base level
    (country),            -- country subtotal
    ()                    -- grand total
);
```

When the engine collapses a dimension for a subtotal, it puts `NULL` in that column. `GROUPING(col)` returns 1 for a rollup NULL and 0 for a real data NULL, so you can replace them with readable labels instead of sending ambiguous nulls to the frontend. If your SQLite build does not have `GROUPING()`, use `COALESCE(category, 'All Categories')` for the simple case and know you are conflating the two kinds of nulls.

**Index that makes grouping stream instead of hash**

```sql
-- Covering composite index: grouping keys first, then the payload column
-- MySQL / Postgres / SQLite (B-Tree)
CREATE INDEX idx_sales_country_category_amount
ON Sales (country, category, amount);
```

With this index the optimizer can do an index-only scan. Rows come out already ordered by `country, category`, so the engine accumulates totals for the current key and flushes the result the instant the key changes. That is `O(1)` extra memory instead of a hash table sized by all unique groups.

Time complexity is `O(N log N)` if the engine has to sort first, `O(N)` if it can hash, and `O(N)` with a tight index scan but without the sort cost. Here `N` is rows scanned. Space is `O(U)` hash entries for unique groups without the index, and `O(1)` streaming state with the covering index, where `U` is number of distinct `(country, category)` pairs.

## 4. Dry Run — Walk Through a Real Example

Take the six rows we inserted. We will run Query 1, `GROUP BY country, category`, and then add the ROLLUP step on top.

**The input**

| order_id | country | category    | amount |
| :------- | :------ | :---------- | :----- |
| 101      | US      | Electronics | 300.00 |
| 102      | US      | Electronics | 700.00 |
| 103      | US      | Apparel     | 150.00 |
| 104      | DE      | Electronics | 400.00 |
| 105      | DE      | Apparel     | 200.00 |
| 106      | DE      | Apparel     | 100.00 |

**Step through the pipeline exactly as the engine does**

The engine does `FROM Sales` and streams six rows. `WHERE` does nothing because we have no row filter. `GROUP BY country, category` creates an accumulator per key as rows arrive.

Imagine the engine sees rows in storage order:

- Row 101 is `US / Electronics`. No bucket for that key yet, so create one: count 1, sum 300.
- Row 102 is also `US / Electronics`. Same bucket, update it: count 2, sum 1000.
- Row 103 is `US / Apparel`. New key, new bucket: count 1, sum 150.
- Row 104 is `DE / Electronics`. New bucket: count 1, sum 400.
- Row 105 is `DE / Apparel`. New bucket: count 1, sum 200.
- Row 106 is also `DE / Apparel`. Existing bucket, update: count 2, sum 300.

If there is no sorted index, those buckets live in a hash table until all rows are seen. If there is the covering index, the rows arrive ordered by `country, category` and the engine can flush each group when the key changes instead of holding all groups.

After grouping, the four base buckets hold:

- `DE / Apparel` has orders 105, 106, count 2, sum 300.00, avg 150.00
- `DE / Electronics` has order 104, count 1, sum 400.00, avg 400.00
- `US / Apparel` has order 103, count 1, sum 150.00, avg 150.00
- `US / Electronics` has orders 101, 102, count 2, sum 1000.00, avg 500.00

`HAVING` would filter buckets here if we had one. `SELECT` then computes `COUNT`, `SUM`, `AVG` for each bucket and `ORDER BY` sorts.

**Add ROLLUP to that result**

`WITH ROLLUP` folds the base buckets upward without rescanning the table:

- DE subtotal merges `DE / Apparel` and `DE / Electronics`: count 3, sum 700.00, avg 233.33
- US subtotal merges `US / Apparel` and `US / Electronics`: count 3, sum 1150.00, avg 383.33
- Grand total merges everything: count 6, sum 1850.00, avg 308.33

The final projection replaces the rollup nulls with labels, so you see:

| country      | category                     | order_count | total_revenue | avg_order_value |
| :----------- | :--------------------------- | :---------- | :------------ | :-------------- |
| DE           | Apparel                      | 2           | 300.00        | 150.00          |
| DE           | Electronics                  | 1           | 400.00        | 400.00          |
| DE           | All Categories (Subtotal)    | 3           | 700.00        | 233.33          |
| US           | Apparel                      | 1           | 150.00        | 150.00          |
| US           | Electronics                  | 2           | 1000.00       | 500.00          |
| US           | All Categories (Subtotal)    | 3           | 1150.00       | 383.33          |
| Global Total | All Categories               | 6           | 1850.00       | 308.33          |

That is exactly what the interviewer wants to see you trace on a whiteboard.

## 5. Edge Cases — The Ones That Break Naive Solutions

**NULL values in the grouping column get their own bucket**

In normal comparisons `NULL = NULL` is `UNKNOWN`, but `GROUP BY` treats all nulls as equal for bucketing. If 50 rows have `country IS NULL`, they all collapse into one row with `country IS NULL`. That surprises people who expect nulls to be dropped. They are not dropped. That one null group can break a frontend that assumes country is always a string. Fix it by filtering up front with `WHERE country IS NOT NULL`, or by grouping on `COALESCE(country, 'Unknown')` so the label is explicit.

**Mixing a non-aggregated column without grouping is an error**

This query fails in every modern database:

```sql
-- Fails: customer_id is neither grouped nor aggregated
SELECT country, category, customer_id, SUM(amount)
FROM Sales
GROUP BY country, category;
```

For `US / Electronics` there are two rows with customer IDs 1 and 2. The engine has no deterministic rule to pick one, so it throws `Error 1055` in MySQL or `column must appear in GROUP BY` in Postgres and SQLite. Fix it three ways depending on intent: add the column to `GROUP BY` if it is part of the grain, wrap it in an aggregate like `MIN(customer_id)` or `GROUP_CONCAT(customer_id)` or `ARRAY_AGG(customer_id)` if you need a summary, or keep rows intact with a window function if you need row detail plus group math.

**Empty input: GROUP BY returns zero rows, bare aggregates return one row**

This difference catches full-stack code that assumes `data[0]` exists:

```sql
SELECT COUNT(*) FROM Sales WHERE 1 = 0;
-- returns 1 row with 0

SELECT country, COUNT(*) FROM Sales WHERE 1 = 0 GROUP BY country;
-- returns 0 rows, empty result set
```

If your UI does `rows[0].total_revenue` on the second query you crash. Handle the empty-group case on the client, or use a left join from a countries dimension table if you need zeroes for missing groups.

**COUNT star versus COUNT column versus COUNT DISTINCT**

`COUNT(*)` counts rows in the bucket. `COUNT(country)` counts non-null values of that column. `COUNT(DISTINCT country)` counts distinct non-null values. If a column can be null, `COUNT(*)` and `COUNT(col)` diverge. If you want order volume, use `COUNT(*)`. If you want how many distinct customers bought in that bucket, use `COUNT(DISTINCT customer_id)`.

**WHERE versus HAVING placement changes results and performance**

`WHERE` filters rows before they are bucketed, so it reduces work. `HAVING` filters buckets after aggregation, so it can use `SUM` and `COUNT`. Putting an aggregate in `WHERE` always fails. Putting a row predicate in `HAVING` works but is wasteful because you built buckets you then threw away. The rule is short: row predicates in `WHERE`, bucket predicates in `HAVING`.

## 6. Variations and Follow-ups

**Filtering groups cleverly**

The interviewer often follows up with what if you only want large buckets. That is a `HAVING` question. They also check if you know you can reuse the alias in `HAVING` in MySQL and Postgres but not in every dialect, and that putting the same condition in `WHERE` would be wrong.

```sql
-- Only countries that sold more than 500 in total, after row filter
SELECT country, SUM(amount) AS total_revenue
FROM Sales
WHERE order_date >= '2026-01-01'
GROUP BY country
HAVING SUM(amount) > 500
ORDER BY total_revenue DESC;
```

If they ask to keep groups whose average is above overall average, you either nest the query or use a window in `HAVING` with a subquery. There is no shortcut that avoids computing the overall number first.

**ROLLUP, CUBE, and GROUPING SETS**

`ROLLUP` is a hierarchy. `GROUP BY country, category WITH ROLLUP` gives you `(country, category)`, then `(country)`, then `()`. It is perfect for drill-down reports.

`CUBE` is every combination. `GROUP BY CUBE (country, category)` gives you `(country, category)`, `(country)`, `(category)`, and `()`. That answers what if you want both country subtotals and category subtotals independent of each other.

`GROUPING SETS` is you name the levels you want explicitly. That is useful when you want country and category totals but not the grand total, or when you want two unrelated groupings in one scan without a cross-product you do not need.

```sql
-- Postgres / SQLite style: category totals plus country totals, no cross, no grand total
SELECT country, category, SUM(amount) AS total_revenue
FROM Sales
GROUP BY GROUPING SETS (
    (country),
    (category)
);
```

The interview signal is knowing `ROLLUP` is for hierarchies, `CUBE` is for all combos, and `GROUPING SETS` is for arbitrary picks, and that all three are single scans versus hand-rolled `UNION ALL`.

**Pivoting with conditional aggregation**

What if they want categories as columns instead of rows. You do not need multiple queries or joins. You use `SUM(CASE WHEN ...)`.

```sql
-- One scan, categories become columns
SELECT
    country,
    SUM(CASE WHEN category = 'Electronics' THEN amount ELSE 0 END) AS electronics_revenue,
    SUM(CASE WHEN category = 'Apparel'     THEN amount ELSE 0 END) AS apparel_revenue,
    SUM(amount) AS total_revenue
FROM Sales
GROUP BY country;
```

In Postgres you can also write `SUM(amount) FILTER (WHERE category = 'Electronics')` which is clearer and avoids the `ELSE 0` question.

**When not to use GROUP BY at all — keep rows with a window**

If the follow-up is show every order but also show the country total next to each row, `GROUP BY` is the wrong tool because it collapses rows. Use a window.

```sql
-- No collapsing: every order stays, group totals repeat per row
SELECT
    order_id,
    country,
    category,
    amount,
    SUM(amount) OVER (PARTITION BY country, category) AS category_revenue,
    SUM(amount) OVER (PARTITION BY country)           AS country_revenue
FROM Sales;
```

The rule of thumb: `GROUP BY` turns `N` rows into `K` rows where `K <= N`. A window keeps `N` rows and appends group math.

## 7. 🧠 The Memory Hook

Think of `GROUP BY` as sorting laundry into labeled bins. `WHERE` throws away dirty socks before you sort. `GROUP BY` is putting clothes into bins by label. Everything you pull out of a bin must either be the label on the bin or something you melted down from everything inside the bin into one number like a count or a sum. `HAVING` throws away whole bins that are too light. And if you need subtotals, do not dump the bins out and resort three times. Tell the engine `ROLLUP` or `GROUPING SETS` and let it stack the bins in one pass.

