# Write a Query to Calculate Running Total (Cumulative Sum) in SQL

## 1. What the Interviewer Is Really Testing

Imagine you have an orders table and a product manager asks for a running balance on every row — not just the total at the end, but the total so far after each order. It looks like simple addition. The interviewer is not testing whether you can add.

They are testing four things at once.

First, do you know the modern way versus the naive way. The naive way is a correlated subquery that sums everything before the current row for every row. It works, but it is O(N squared) and will kill a production database. The modern way is a window function that streams once in O(N) after a sort. If you jump straight to the subquery, the interviewer knows you have not kept up since SQL got window functions in 2003 and MySQL got them in 8.0.

Second, do you understand window frame syntax. Most people write `SUM(amount) OVER (ORDER BY order_date)` and think they are done. The default frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, which groups rows with the same order_date as peers and gives them the same total. In real data where two orders land on the same day, that is wrong. A senior engineer writes `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` and adds a tiebreaker like `order_id`.

Third, can you keep one user's total from leaking into the next user's total. A global running sum is almost never what the business wants. You need `PARTITION BY user_id` so the counter resets per customer.

Fourth, do you know how the database actually runs it. With a composite index on `(user_id, order_date, order_id, amount)` the engine can read rows already sorted and just keep a single accumulator in memory. Without that thinking, your query sorts on disk and creates temp files.

If you get all four right in your answer, you sound like someone who has shipped this before.

## 2. Think Before You Code — The Senior Dev Thought Process

The first thing I notice is the phrase "running total" or "cumulative sum." That tells me I need to keep history while keeping every row. This is not a `GROUP BY` — `GROUP BY` would collapse rows. I need a window.

My next thought is: what is the naive way and why is it bad. In old MySQL 5.7 I would have to write something like `SELECT o1.amount, (SELECT SUM(o2.amount) FROM Orders o2 WHERE o2.user_id = o1.user_id AND o2.order_date <= o1.order_date) FROM Orders o1`. For each of N rows, the database runs a sum over up to N rows. That is about N squared comparisons. For 10,000 orders that is 50 million row visits. At one million rows the query never finishes and holds locks. I mention this in the interview so the reviewer sees I know the cost, but I do not ship it.

So I reach for `SUM(amount) OVER (...)`. The pattern is always `SUM() OVER (PARTITION BY entity ORDER BY time ROWS ...)`. I ask myself three questions before I type it. What is the entity that resets the total. Here it is `user_id`, so I need `PARTITION BY user_id`. What is the order that defines "before" and "after". Here it is `order_date`, but dates repeat. If user 101 has two orders on 2026-01-02, ordering only by date is non-deterministic and `RANGE` will merge them. So I add the primary key as a tiebreaker: `ORDER BY order_date, order_id`. What is the frame. I want every row from the start of the partition up to the current row, row by row, so I must write `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. If I leave it out, the database uses `RANGE`, which is the trap.

Finally I think about speed. If this query runs on a big table, the database has to sort by `(user_id, order_date, order_id)` before it can stream the sum. If I build an index that matches that order and also covers `amount`, the sort disappears. The engine can walk the index leaves in order and just add to a running variable.

In an interview I would say all of this before writing code. It shows I choose the window because of cost, not because I memorized syntax.

## 3. The Solution — Fully Explained Code

This SQL runs in PostgreSQL, MySQL 8.0+, SQLite 3.25+, SQL Server, Oracle, and Snowflake. You can copy it into `sqlite3 :memory:` and run it as is.

**Solution 1 — Window function. This is what you should write today.**

```sql
-- Sample data so you can run this directly in SQLite
CREATE TABLE Orders (
  order_id   INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  order_date TEXT NOT NULL,   -- use DATE in Postgres/MySQL, TEXT in SQLite
  amount     REAL
);

INSERT INTO Orders VALUES (1, 101, '2026-01-01', 50.00);
INSERT INTO Orders VALUES (2, 101, '2026-01-02', 25.00);
INSERT INTO Orders VALUES (3, 101, '2026-01-02', 15.00);
INSERT INTO Orders VALUES (4, 101, '2026-01-03', 100.00);
INSERT INTO Orders VALUES (5, 102, '2026-01-01', 200.00);
INSERT INTO Orders VALUES (6, 102, '2026-01-02', 50.00);

-- The actual running total query
SELECT
  order_id,
  user_id,
  order_date,
  amount,
  -- add amount to a running counter that restarts for each user
  SUM(amount) OVER (
    PARTITION BY user_id
    ORDER BY order_date, order_id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_total
FROM Orders
ORDER BY user_id, order_date, order_id;
```

Why each piece matters: `PARTITION BY user_id` splits the table into separate buckets, one per user, and the sum resets when the user changes. `ORDER BY order_date, order_id` puts rows in true chronological order and `order_id` breaks ties when two orders share a date so the result is deterministic. `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` tells the engine to build the frame row by row from the first row in the partition up to the current row. Using `ROWS` instead of the default `RANGE` prevents two rows with the same date from being added as a batch. The outer `ORDER BY` at the end does not affect the window calculation; it only guarantees the client sees rows in a nice order, because a window never promises final output order on its own.

Time complexity: O(N log N) if the database has to sort, or O(N) if an index already provides the order `user_id, order_date, order_id`. After sorting, the window itself is one linear streaming pass — each row is visited once and only a single accumulator is kept.

Space complexity: O(1) extra memory besides the output. The engine holds one running sum per partition and updates it as it walks.

Speed it up with a covering index that matches the window:

```sql
CREATE INDEX idx_orders_user_date ON Orders (user_id, order_date, order_id, amount);
```

With this index the engine can read rows already sorted off the index leaves, no filesort, no temp table.

**Solution 2 — Correlated subquery. Know it for legacy systems, do not prefer it.**

Before window functions, MySQL 5.7 and old codebases had to do this:

```sql
SELECT
  o1.order_id,
  o1.user_id,
  o1.order_date,
  o1.amount,
  (
    SELECT SUM(o2.amount)
    FROM Orders o2
    WHERE o2.user_id = o1.user_id
      AND (
        o2.order_date < o1.order_date
        OR (o2.order_date = o1.order_date AND o2.order_id <= o1.order_id)
      )
  ) AS running_total
FROM Orders o1
ORDER BY o1.user_id, o1.order_date, o1.order_id;
```

For every outer row `o1`, the inner query scans all earlier rows `o2` for the same user and adds them up. The compound condition `(date <) OR (date = AND id <=)` is the tiebreaker for same-day rows. It returns the correct numbers, so it is worth knowing for an interview when they ask "what if window functions were not available."

Time complexity: O(N squared) without a good index, or O(N log N) with the same composite index because each row does a range scan over its history. Either way it does far more I/O than the window.

Space complexity: O(1) per worker but with heavy buffer churn because the same early rows are summed over and over.

In an interview, show Solution 1 first, then say "if you were on MySQL 5.7 I would fall back to this subquery but I would expect it to be much slower."

## 4. Dry Run — Walk Through a Real Example

Take this input. User 101 has two orders on the same day, which is the trap that separates `ROWS` from `RANGE`.

| order_id | user_id | order_date | amount |
|---|---|---|---|
| 1 | 101 | 2026-01-01 | 50.00 |
| 2 | 101 | 2026-01-02 | 25.00 |
| 3 | 101 | 2026-01-02 | 15.00 |
| 4 | 101 | 2026-01-03 | 100.00 |
| 5 | 102 | 2026-01-01 | 200.00 |
| 6 | 102 | 2026-01-02 | 50.00 |

The engine first groups by `PARTITION BY user_id` and sorts each group by `order_date, order_id`. It keeps one accumulator variable `acc` that lives only inside the current partition.

Partition for `user_id = 101` starts with `acc = 0`.

Row 1 is `order_id 1, date 2026-01-01, amount 50.00`. The frame is rows from the start of partition 101 up to row 1, which is just row 1. So `acc = 0 + 50.00 = 50.00`. Output `running_total = 50.00`.

Row 2 is `order_id 2, date 2026-01-02, amount 25.00`. Frames grows to rows 1 through 2. `acc = 50.00 + 25.00 = 75.00`. Output `75.00`.

Row 3 is `order_id 3, same date 2026-01-02, amount 15.00`. Tie is broken by `order_id` and frame is `ROWS`, so frame is rows 1 through 3, not a peer group. `acc = 75.00 + 15.00 = 90.00`. Output `90.00`. If we had left the default `RANGE`, rows 2 and 3 would be peers on the same date and the engine would have given both rows `90.00`, skipping `75.00` entirely.

Row 4 is `order_id 4, date 2026-01-03, amount 100.00`. Frame rows 1 through 4. `acc = 90.00 + 100.00 = 190.00`. Output `190.00`.

Now the engine sees `user_id` change to 102. It resets `acc = 0` for the new partition.

Row 5 is `order_id 5, date 2026-01-01, amount 200.00`. Frame is only row 5 within partition 102. `acc = 0 + 200.00 = 200.00`.

Row 6 is `order_id 6, date 2026-01-02, amount 50.00`. Frame rows 5 through 6. `acc = 200.00 + 50.00 = 250.00`.

Final result comes back in the outer `ORDER BY` order:

| order_id | user_id | order_date | amount | running_total |
|---|---|---|---|---|
| 1 | 101 | 2026-01-01 | 50.00 | 50.00 |
| 2 | 101 | 2026-01-02 | 25.00 | 75.00 |
| 3 | 101 | 2026-01-02 | 15.00 | 90.00 |
| 4 | 101 | 2026-01-03 | 100.00 | 190.00 |
| 5 | 102 | 2026-01-01 | 200.00 | 200.00 |
| 6 | 102 | 2026-01-02 | 50.00 | 250.00 |

If you run the SQLite block in the previous section, you will see exactly these numbers.

## 5. Edge Cases — The Ones That Break Naive Solutions

**Ties on the same date is the classic breakage.** If you write only `ORDER BY order_date`, two rows with `2026-01-02` have identical sort keys. Default `RANGE` treats them as one peer group and adds them together in one jump, so both rows show the same total. Fix it by adding a unique column to the order, usually the primary key `order_id` or a precise timestamp, and force `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.

**NULL amounts silently change the total.** `SUM(amount)` in SQL ignores NULL, so `50.00 + NULL` stays `50.00`. That is often what you want, but if all rows so far are NULL, `SUM` returns NULL, not zero, and your application may show a blank balance. If you need zero instead, use `SUM(COALESCE(amount, 0)) OVER (...)` so NULL is treated as 0.

**Partition leakage.** If you forget `PARTITION BY user_id` and write only `SUM(amount) OVER (ORDER BY order_date ROWS ...)`, the sum never resets and user 102's first row will include user 101's totals. In production that looks like a user seeing someone else's money. Always check whether the business wants a global total or a per-entity total. Almost always it is per user, per account, or per tenant, so you need the partition.

**Empty table or single-row partition.** A single row just returns its own amount as the total, and an empty table returns no rows. Neither errors, but your UI should handle the empty result set without assuming a zero row exists.

**Missing outer ORDER BY.** The window calculates in the right logical order inside each partition, but the engine is free to return rows in any order across partitions if you omit the final `ORDER BY user_id, order_date, order_id`. Users will see scrambled dates in the app. Always add the outer order for display, even though it is not needed for the calculation.

**Negative amounts and refunds.** A running total is not always increasing. Refunds and debits are negative values and `SUM` subtracts them correctly, so the total can go down or even below zero. Make sure your column type and UI allow negative running totals if overdrafts are possible.

## 6. Variations and Follow-ups

**Running total per category instead of per user.** The interviewer often changes the grouping: "now do it per product category and per month." The structure does not change at all, only what you partition and order by. For an e-commerce table `Sales(category, sale_date, amount)` you write `SUM(amount) OVER (PARTITION BY category ORDER BY sale_date, sale_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`. You can also partition by two columns at once, for example `PARTITION BY user_id, category` if each user has separate totals per category.

```sql
SELECT
  category, sale_date, amount,
  SUM(amount) OVER (
    PARTITION BY category
    ORDER BY sale_date, sale_id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_total_per_category
FROM Sales
ORDER BY category, sale_date, sale_id;
```

**Reverse running total, from the end backwards.** "What is the remaining amount if I go backwards from the last row." You just flip the order to `DESC` and keep the same frame. Each row then shows the sum of itself plus everything after it. This is useful for "how much is left to collect" reports.

```sql
SELECT
  order_id, user_id, order_date, amount,
  SUM(amount) OVER (
    PARTITION BY user_id
    ORDER BY order_date DESC, order_id DESC
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS reverse_running_total
FROM Orders
ORDER BY user_id, order_date, order_id;
```

For user 101 from the earlier example, the reverse totals would read 190, 140, 115, 100 down the rows, with the last row showing only its own 100.

**Running average from inception.** Replace `SUM` with `AVG` and keep the same window. It shows average spend so far.

```sql
AVG(amount) OVER (
  PARTITION BY user_id
  ORDER BY order_date, order_id
  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
) AS running_avg
```

**Trailing N-row rolling sum, not from the start.** "Give me the sum of the last 3 orders only." You shrink the frame: `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW`. Each row looks back only two rows plus itself. For a 7-day calendar window in Postgres you would use `RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW` instead of `ROWS`, because there you really do want a time window, not a row count.

**Pagination trap.** If the interviewer says "show page 2 with LIMIT 20 OFFSET 20," do not apply the window after the limit — the total would restart from row 21. You need to compute the window in a subquery or CTE first, then filter: `WITH ranked AS (SELECT ..., SUM(...) OVER (...) AS rt, ROW_NUMBER() OVER (...) AS rn FROM Orders) SELECT * FROM ranked WHERE rn BETWEEN 21 AND 40`. For huge ledgers with millions of rows, scanning from the start each time is slow, so teams store monthly checkpoint balances and sum only the delta since the last checkpoint.

## 7. 🧠 The Memory Hook

If you remember one formula, remember this: `SUM(amount) OVER (PARTITION BY who ORDER BY when, id ROWS UNBOUNDED PRECEDING AND CURRENT ROW)`. `ROWS` makes it walk row by row, `PARTITION` makes it restart per person, and the `id` breaks ties. That single line turns a slow O(N squared) self-join into one fast streaming pass.
