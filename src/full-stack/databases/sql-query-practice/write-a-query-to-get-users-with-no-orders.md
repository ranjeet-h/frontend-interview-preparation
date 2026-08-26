# Write a Query to Find Users With No Orders in SQL

## 1. What the Interviewer Is Really Testing

This looks like a beginner SQL filtering exercise, but senior interviewers use it as an immediate litmus test for relational set theory, anti-join mechanics, and SQL three-valued logic.

Specifically, the interviewer is evaluating four core proficiencies:

- **Anti-Join Patterns:** Can you find records in set A that have no corresponding relationship in set B? Do you understand the trade-offs between `LEFT JOIN ... WHERE IS NULL`, `NOT EXISTS`, and `NOT IN`?
- **The SQL NULL Trap (Three-Valued Logic):** Do you know why a naive `NOT IN` query silently breaks in production when a single `NULL` exists in the subquery, returning zero rows even when thousands of users have no orders?
- **Query Optimizer Execution Plans:** Do you understand how relational database management systems (PostgreSQL, MySQL, SQL Server) execute anti-joins under the hood using Hash Anti-Join, Nested Loops with Index Scan, or Merge Anti-Join?
- **Predicate Placement in Outer Joins:** Do you understand where date filters and status conditions belong in outer joins without accidentally converting a `LEFT JOIN` back into an `INNER JOIN`?

## 2. Think Before You Code — The Senior Dev Thought Process

When presented with the `Users` and `Orders` tables, the initial mental model is straightforward: we have a one-to-many relationship where a user may have zero, one, or many orders. We want the subset of users whose order count is zero.

The first instinct for many developers is to write a subquery with `NOT IN`:

```sql
-- DANGEROUS: The naive approach
SELECT id, name
FROM Users
WHERE id NOT IN (SELECT user_id FROM Orders);
```

As a senior engineer, alarm bells go off immediately. If the `Orders` table allows nullable `user_id` values (for example, guest checkouts, orphaned records, or anonymous carts), this query fails catastrophically. In SQL, `NOT IN (1, 2, NULL)` evaluates to `id != 1 AND id != 2 AND id != NULL`. Because any comparison with `NULL` yields `UNKNOWN`, the entire boolean expression evaluates to `UNKNOWN` (or `FALSE` in a `WHERE` filter). The query returns zero rows across the board.

To solve this robustly, we consider two production-grade anti-join patterns:

1. **`NOT EXISTS` (Correlated Anti-Join):** We test for the absence of matching rows in `Orders`. `EXISTS` only checks for row presence (cardinality > 0); it does not evaluate column equality against `NULL`. Furthermore, database engines short-circuit: the moment the engine finds the first matching order for a user, it stops scanning for that user and moves on.
2. **`LEFT JOIN ... WHERE o.user_id IS NULL` (Classic Outer Anti-Join):** We perform a `LEFT JOIN` between `Users` and `Orders`. For users without orders, all columns from `Orders` evaluate to `NULL`. We filter with `WHERE o.user_id IS NULL` (or any non-nullable column from the right table, like `o.id`) to isolate unmatched records.

Between these two, `NOT EXISTS` is generally preferred in enterprise systems because its intent is declarative, it is completely immune to `NULL` semantics, and it avoids wide row projection before filtering.

## 3. The Solution — Fully Explained Code

Given the following relational schema:

```sql
-- Users table: primary entity
-- id: INT PRIMARY KEY, name: VARCHAR(100), email: VARCHAR(100)

-- Orders table: dependent entity (0..N per user)
-- id: INT PRIMARY KEY, user_id: INT (NULLABLE FK -> Users.id), order_date: TIMESTAMP, amount: DECIMAL(10,2)
```

Here are the three canonical patterns, along with their mechanics and execution strategies.

**Pattern 1: `NOT EXISTS` Correlated Anti-Join (Senior Recommended)**

```sql
SELECT
    u.id,
    u.name
FROM Users u
WHERE NOT EXISTS (
    -- Subquery returns 1 if at least one order matches the user
    -- The query engine short-circuits as soon as a single match is found
    SELECT 1
    FROM Orders o
    WHERE o.user_id = u.id
);
```

The correlated subquery searches for any record in `Orders` where `o.user_id = u.id`. The `SELECT 1` (or `SELECT *`) is purely illustrative; the SQL query engine does not project any columns—it only tests boolean row existence. If no row matches, `NOT EXISTS` evaluates to `TRUE` and the user is included in the final result.

**Pattern 2: `LEFT JOIN / IS NULL` Anti-Join**

```sql
SELECT
    u.id,
    u.name
FROM Users u
LEFT JOIN Orders o
    ON u.id = o.user_id
-- We filter for rows where the right-hand primary key / join key is NULL
-- This guarantees that no matching order existed in the right table
WHERE o.user_id IS NULL;
```

The `LEFT JOIN` preserves every row from `Users`. For users who have placed orders, `o.user_id` holds their integer ID. For users who have placed zero orders, the engine fills all `Orders` columns with `NULL`. Filtering by `WHERE o.user_id IS NULL` discards all users with orders and keeps only users with no orders.

**Pattern 3: `NOT IN` with Explicit NULL Guard**

```sql
SELECT
    u.id,
    u.name
FROM Users u
WHERE u.id NOT IN (
    -- You MUST explicitly filter out NULLs to prevent three-valued logic failure
    SELECT o.user_id
    FROM Orders o
    WHERE o.user_id IS NOT NULL
);
```

Adding `WHERE o.user_id IS NOT NULL` inside the subquery ensures the resulting set contains only concrete integers. This eliminates the risk of an `UNKNOWN` evaluation collapsing the outer `WHERE` clause.

**Complexity & Database Optimizer Execution Plans:**

- **With Index on `Orders(user_id)`:**
  - **Time Complexity:** `O(U * log O)` for **Index Nested Loops Anti-Join**, where `U` is the number of users and `O` is the number of orders. The engine iterates through each user and performs an index seek on `Orders(user_id)`. The moment one index entry is found, it terminates the probe.
  - **Space Complexity:** `O(1)` additional memory beyond buffer pool caches.
- **Without Index on `Orders(user_id)` (or on large table scans):**
  - **Time Complexity:** `O(U + O)` for **Hash Anti-Join**. The optimizer builds an in-memory hash table of all `user_id`s from `Orders`, then streams `Users` through the hash table, keeping only keys that have zero hash hits.
  - **Space Complexity:** `O(min(U, O))` memory to store the hash table in `work_mem` or temp db buffers.

Modern optimizers (PostgreSQL planner, MySQL 8.0+, SQL Server Query Optimizer) frequently rewrite both Pattern 1 (`NOT EXISTS`) and Pattern 2 (`LEFT JOIN ... WHERE IS NULL`) into the exact same physical operator plan (a Hash Anti-Join or Merge Anti-Join). However, `NOT EXISTS` remains the cleaner semantic choice in complex multi-table queries.

## 4. Dry Run — Walk Through a Real Example

Let us trace execution using a concrete dataset containing active users, users without orders, and guest orders with `NULL` foreign keys.

**Sample Data:**

`Users` Table (`u`):

| id | name |
|---|---|
| 1 | Alice |
| 2 | Bob |
| 3 | Charlie |
| 4 | Diana |

`Orders` Table (`o`):

| id | user_id | amount |
|---|---|---|
| 101 | 1 | 49.99 |
| 102 | 2 | 19.99 |
| 103 | 1 | 89.00 |
| 104 | NULL | 15.00 |

**Step-by-Step Execution: `NOT EXISTS`**

1. **User 1 (Alice):** Engine checks `Orders` for `o.user_id = 1`. Row `101` matches immediately. Engine short-circuits. `EXISTS` is `TRUE` -> `NOT EXISTS` is `FALSE`. Alice is **discarded**.
2. **User 2 (Bob):** Engine checks `Orders` for `o.user_id = 2`. Row `102` matches. Engine short-circuits. `EXISTS` is `TRUE` -> `NOT EXISTS` is `FALSE`. Bob is **discarded**.
3. **User 3 (Charlie):** Engine scans `Orders` for `o.user_id = 3`. No rows match. `EXISTS` is `FALSE` -> `NOT EXISTS` is `TRUE`. Charlie is **retained**.
4. **User 4 (Diana):** Engine scans `Orders` for `o.user_id = 4`. No rows match. `EXISTS` is `FALSE` -> `NOT EXISTS` is `TRUE`. Diana is **retained**.

Result Set:

| id | name |
|---|---|
| 3 | Charlie |
| 4 | Diana |

**Step-by-Step Execution: `LEFT JOIN / IS NULL`**

The `LEFT JOIN` builds the intermediate joined table:

| u.id | u.name | o.id | o.user_id |
|---|---|---|---|
| 1 | Alice | 101 | 1 |
| 1 | Alice | 103 | 1 |
| 2 | Bob | 102 | 2 |
| 3 | Charlie | NULL | NULL |
| 4 | Diana | NULL | NULL |

Applying `WHERE o.user_id IS NULL` filters out Alice (rows with `o.user_id = 1`) and Bob (row with `o.user_id = 2`), leaving Charlie and Diana.

**Why Naive `NOT IN` Fails on This Data:**

The subquery `SELECT user_id FROM Orders` produces the list: `{1, 2, 1, NULL}`.

When the database evaluates User 3 (Charlie, `id = 3`):

`3 NOT IN (1, 2, NULL)` is rewritten as:
`NOT (3 = 1 OR 3 = 2 OR 3 = NULL)`
`NOT (FALSE OR FALSE OR UNKNOWN)`
`NOT (UNKNOWN)` = `UNKNOWN`

Because a `WHERE` clause only accepts rows where the condition evaluates strictly to `TRUE`, Charlie is rejected. The same evaluation occurs for Diana. The query produces `0 rows`, failing silently in production.

## 5. Edge Cases — The Ones That Break Naive Solutions

- **Nullable Foreign Keys (Guest Checkout):** When `Orders.user_id` allows `NULL`, naive `NOT IN` returns zero results. Always use `NOT EXISTS` or `LEFT JOIN ... WHERE IS NULL` to ensure immunity to `NULL` rows.
- **Multiple Orders Per User (Fan-Out):** A user with 1,000 orders produces 1,000 intermediate rows in a raw `LEFT JOIN`. If you omit `WHERE o.user_id IS NULL` or write grouping queries without care, the engine expends significant CPU and memory managing row explosion. `NOT EXISTS` never suffers from fan-out because it stops at the first match.
- **Empty `Orders` Table:** If no orders have ever been placed in the database, `NOT EXISTS` and `LEFT JOIN` both return all rows from `Users`.
- **Empty `Users` Table:** Returns zero rows immediately without throwing errors or running unbounded subqueries.
- **Soft-Deleted / Cancelled Orders:** If orders have a `status` column (such as `'CANCELLED'` or `'DELETED'`), users whose only orders were cancelled should still be counted as users with no active orders. How you filter these statuses determines whether the query remains an anti-join or breaks.

## 6. Variations and Follow-ups

**Variation 1: Users With No Orders in the Last 90 Days**

Interviewers frequently add a time window: *"Find all users who haven't placed an order in the last 90 days."* This includes users who never placed an order AND users who placed orders long ago.

*Solution using `NOT EXISTS` (Cleanest):*

```sql
SELECT
    u.id,
    u.name
FROM Users u
WHERE NOT EXISTS (
    SELECT 1
    FROM Orders o
    WHERE o.user_id = u.id
      AND o.order_date >= CURRENT_DATE - INTERVAL '90 days'
);
```

*Solution using `LEFT JOIN` (With Critical ON-Clause Trap):*

```sql
SELECT
    u.id,
    u.name
FROM Users u
LEFT JOIN Orders o
    ON u.id = o.user_id
   AND o.order_date >= CURRENT_DATE - INTERVAL '90 days'
WHERE o.user_id IS NULL;
```

*The Trap to Mention:* If you accidentally place `AND o.order_date >= CURRENT_DATE - INTERVAL '90 days'` in the `WHERE` clause instead of the `ON` clause, you convert the `LEFT JOIN` into an `INNER JOIN` (because `WHERE NULL >= ...` evaluates to `UNKNOWN`), completely eliminating users who never placed any orders at all.

**Variation 2: Finding Inactive Users via `GROUP BY ... HAVING`**

Interviewers may ask: *"Can you solve this using aggregation?"*

```sql
SELECT
    u.id,
    u.name
FROM Users u
LEFT JOIN Orders o
    ON u.id = o.user_id
GROUP BY
    u.id,
    u.name
HAVING COUNT(o.id) = 0;
```

*Key Distinction:* Notice the use of `COUNT(o.id)` instead of `COUNT(*)`. When a user has zero orders, the `LEFT JOIN` creates a single row with `NULL` for `o.id`. `COUNT(*)` counts that row as `1`, which would cause `HAVING COUNT(*) = 0` to return zero users! `COUNT(o.id)` specifically counts non-NULL values, correctly evaluating to `0`.

*Senior Trade-Off Analysis:* While correct, `GROUP BY ... HAVING` forces the database to sort and aggregate all rows across both tables before filtering, consuming significantly more memory and CPU than `NOT EXISTS` (which can short-circuit).

**Variation 3: Set Difference via `EXCEPT` / `MINUS`**

```sql
-- Returns distinct user IDs with no orders
SELECT id FROM Users
EXCEPT
SELECT user_id FROM Orders WHERE user_id IS NOT NULL;
```

*Trade-Off:* `EXCEPT` (or `MINUS` in Oracle) works well if you only need the primary key `id`. However, if you need to project multiple columns (`u.name`, `u.email`, `u.created_at`), `EXCEPT` requires wrapping the set operation in a secondary join back to `Users`, making it less practical than `NOT EXISTS`.

## 7. 🧠 The Memory Hook

When looking for records that do not exist, reach for **`NOT EXISTS`** or **`LEFT JOIN ... WHERE IS NULL`**. 

Never trust a naked **`NOT IN`** across tables—in SQL's three-valued logic, a single `NULL` in the subquery turns every comparison into `UNKNOWN` and wipes out your entire result set.
