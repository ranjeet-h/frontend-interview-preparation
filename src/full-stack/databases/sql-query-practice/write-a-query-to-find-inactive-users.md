# Write a Query to Find Inactive Users in SQL

## 1. What the Interviewer Is Really Testing

This looks like a simple "show me inactive users" filter, but the interviewer is not testing whether you can write `WHERE status = 'inactive'`.

They are testing whether you know how to find what is missing. In real apps inactive often means "a user who has no orders in the last N days" or "a user whose status is inactive." The first definition is the interesting one, because there is no row to find — you have to prove that no matching row exists in another table.

That is called an anti-join, and the interviewer wants to see if you naturally reach for `NOT EXISTS` or `LEFT JOIN ... WHERE ... IS NULL`, if you avoid the broken `NOT IN` trap with NULLs, and if you handle edge cases like users who never logged in or users who only have very old orders. Anyone can filter a status column. A senior knows how to ask the database for "everyone with no recent activity" correctly and fast.

## 2. Think Before You Code — The Senior Dev Thought Process

The first thing I notice is the phrase inactive users has two common meanings, and I need to clarify which one the interviewer wants. Is it a status column on `users`, or is it behavioral — no orders, no logins in the last 90 days? Most interviews mean the behavioral one, and that is the harder problem, so I will prepare for both.

My instinct for the behavioral version is to look in the `orders` table, but the naive move is to use `NOT IN`. Something like `WHERE id NOT IN (SELECT user_id FROM orders WHERE created_at >= ...)`. I stop myself because I know `NOT IN` breaks if that subquery ever returns a single NULL — then the whole query returns zero rows and I will spend an hour debugging an empty result.

The brute force mental model is also to fetch all users and then loop in code to check each user's orders. That is O(users * orders) work and it moves the job out of the database where an index could do it in milliseconds. The database should do this.

What pattern makes this efficient? I need an anti-join. I want users for whom no matching recent order exists. I recognize that phrase from the problem wording: "find X with no Y in the last N days" always maps to anti-join. That gives me two good tools: `NOT EXISTS` and `LEFT JOIN WHERE NULL`. Both say the same thing — keep the user only if the join finds nothing.

I also think about time. I will not wrap the column in a function like `DATEDIFF(created_at) > 90` because that forces the database to run a function on every row instead of using an index. I will keep the column alone on one side and compare it to a single cutoff value like `created_at >= '2026-03-03'`. And I need an index on `orders(user_id, created_at)` so the database can check each user with a quick index seek and stop as soon as it finds one recent order.

At a high level my plan is: compute one cutoff date for 90 days ago, then select from `users` where either `status = 'inactive'` or where no order exists for that user after the cutoff. I will show the `NOT EXISTS` version as the primary answer because its intent is clearest, and I will mention the `LEFT JOIN` version as the equivalent alternative.

## 3. The Solution — Fully Explained Code

This is runnable SQL. The examples use SQLite syntax `DATE('now', '-90 days')`. For MySQL or Postgres replace that with `NOW() - INTERVAL 90 DAY` — the anti-join shape stays identical.

```sql
-- Setup for a runnable example (SQLite)
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,        -- 'active' or 'inactive'
  created_at TEXT NOT NULL,    -- ISO date string like '2025-02-01'
  last_login_at TEXT           -- can be NULL if user never logged in
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Helpful indexes for real data. The database uses these to check
-- "does a recent order exist?" without scanning the whole table.
CREATE INDEX idx_orders_user_date ON orders(user_id, created_at);
CREATE INDEX idx_users_last_login ON users(last_login_at);
```

**Solution A — Inactive by status column.** Use this when the app explicitly marks users.

```sql
-- Direct status check. Keep this simple when the column exists.
SELECT id, name, status
FROM users
WHERE status = 'inactive';
```

**Solution B — Inactive by no orders in the last 90 days using NOT EXISTS.** This is the anti-join pattern interviewers expect.

```sql
-- Find users with no orders in the last 90 days
-- NOT EXISTS stops as soon as it finds one recent order, so it is fast.
SELECT u.id, u.name, u.status
FROM users u
WHERE NOT EXISTS (
  SELECT 1
  FROM orders o
  WHERE o.user_id = u.id
    AND o.created_at >= DATE('now', '-90 days')  -- single cutoff, column stays bare so index can be used
)
-- If inactive also means status = 'inactive', combine with OR:
-- WHERE u.status = 'inactive' OR NOT EXISTS (...)
;
```

**Solution C — Same anti-join written as LEFT JOIN WHERE NULL.** Many teams prefer this style. It returns the same rows.

```sql
-- LEFT JOIN keeps every user, then we keep only those where the join found nothing
SELECT u.id, u.name, u.status
FROM users u
LEFT JOIN orders o
  ON o.user_id = u.id
 AND o.created_at >= DATE('now', '-90 days')  -- put the date filter in the ON clause, not WHERE
WHERE o.user_id IS NULL;  -- NULL means no recent order was found
```

**When last_login lives on the users table itself**, handle NULL explicitly. A user who never logged in has `last_login_at IS NULL` and should count as inactive only if they are not brand new.

```sql
-- Inactive = last login older than 90 days, or never logged in and account is old
SELECT id, name, last_login_at, created_at
FROM users
WHERE last_login_at < DATE('now', '-90 days')
   OR (last_login_at IS NULL AND created_at < DATE('now', '-90 days'));
```

Time complexity: with an index on `orders(user_id, created_at)`, the `NOT EXISTS` check is an index seek per user, roughly O(log M) where M is orders, instead of scanning all orders. Without an index it degrades to a full scan per user. Space complexity: O(K) for the K inactive users returned — the anti-join does not build a large intermediate table.

## 4. Dry Run — Walk Through a Real Example

Assume today is `2026-06-01`, so cutoff is `2026-03-03` which is 90 days ago. Use Solution B.

Sample `users`:

| id | name | status | created_at |
|---|---|---|---|
| 1 | Alice | active | 2025-01-01 |
| 2 | Bob | active | 2025-05-10 |
| 3 | Charlie | active | 2025-02-01 |
| 4 | Diana | active | 2026-02-15 |

Sample `orders`:

| id | user_id | created_at |
|---|---|---|
| 101 | 1 | 2026-01-10 |
| 102 | 2 | 2026-05-20 |
| 103 | 4 | 2026-04-01 |

Now trace `NOT EXISTS` for each user. For each user the database runs the subquery: is there any order for this user with `created_at >= 2026-03-03`?

Alice, id 1: subquery finds order 101 with date `2026-01-10`. That date is before the cutoff, so the condition `>= 2026-03-03` is false. No matching row, so `NOT EXISTS` is true. Alice is returned. She only has an old order, so she is inactive.

Bob, id 2: subquery finds order 102 with date `2026-05-20`. That is after the cutoff, so a matching row exists. `NOT EXISTS` is false. Bob is not returned. He is active.

Charlie, id 3: subquery finds no rows at all for user 3. `NOT EXISTS` is true. Charlie is returned. He has never ordered.

Diana, id 4: subquery finds order 103 with date `2026-04-01`. That is after the cutoff, so a match exists. `NOT EXISTS` is false. Diana is not returned. She ordered 61 days ago.

Final result is Alice and Charlie. If we used the `LEFT JOIN` version, the join would attach Bob's recent order and Diana's recent order, leave Alice and Charlie with NULL on the order side, and the `WHERE o.user_id IS NULL` filter would keep exactly the same two rows.

## 5. Edge Cases — The Ones That Break Naive Solutions

A user with only old orders is the core edge case. If someone ordered 200 days ago and never again, they have rows in `orders`, but none after the cutoff. The anti-join correctly returns them because the date condition is inside the subquery or the JOIN's ON clause. If you put the date filter in a WHERE clause after a LEFT JOIN instead of in the ON clause, you turn it into an inner join and lose them. Keep the date filter with the join condition.

A NULL last_login breaks a simple comparison. `last_login_at < DATE('now', '-90 days')` evaluates to UNKNOWN when `last_login_at` is NULL, so the row is silently dropped. That hides the most inactive users — people who registered and never came back. You must add `OR (last_login_at IS NULL AND created_at < DATE('now', '-90 days'))` and also decide if a brand new user with NULL login should count. Usually you only want accounts older than N days, otherwise you flag someone who signed up yesterday.

The NOT IN NULL trap breaks everything. `WHERE id NOT IN (SELECT user_id FROM orders ...)` looks correct, but if even one `user_id` in that subquery is NULL, the whole expression becomes UNKNOWN for every user and you get zero rows back. Use `NOT EXISTS` or `LEFT JOIN WHERE NULL` instead, or at least add `WHERE user_id IS NOT NULL` inside the subquery. Interviewers bring this up to see if you know three-valued logic.

New users look inactive but are not. A user created 4 days ago with no orders will satisfy `NOT EXISTS` and look inactive. If your business rule is "inactive means dormant for 90 days," you also need `AND created_at < DATE('now', '-90 days')` so you do not email brand new signups as churned users.

Soft-deleted and blocked accounts pollute the result. If you run a re-engagement campaign off this query without `AND deleted_at IS NULL AND status != 'suspended'`, you will email banned or deleted users. Always filter lifecycle columns.

Timezone and cutoff consistency matters at the boundary. Using `NOW()` directly inside a long-running query can give slightly different cutoffs if the query runs across midnight. Compute the cutoff once, store it in a variable or CTE, and compare every row to that same value.

## 6. Variations and Follow-ups

**What if I need inactive per product category?** The interviewer is testing whether you can extend the anti-join with an extra condition. For example, find users who have not ordered anything from the 'books' category in the last 90 days, even if they ordered electronics. You add the category filter inside the anti-join, not outside.

```sql
-- Users with no 'books' orders in the last 90 days
SELECT u.id, u.name
FROM users u
WHERE NOT EXISTS (
  SELECT 1
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN products p ON p.id = oi.product_id
  WHERE o.user_id = u.id
    AND o.created_at >= DATE('now', '-90 days')
    AND p.category = 'books'
);
```

With `LEFT JOIN` it looks similar — join to the filtered order set and keep NULLs. The key is the category goes inside the subquery or the ON clause. If you put `p.category = 'books'` in the outer WHERE, you filter after the anti-join and get the wrong answer.

**What if inactive means different windows for different tiers?** VIPs might be inactive after 30 days, free users after 180. You can compute the cutoff per row with a CASE.

```sql
SELECT u.id, u.name, u.tier
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM orders o
  WHERE o.user_id = u.id
    AND o.created_at >= DATE('now',
      CASE WHEN u.tier = 'enterprise' THEN '-30 days'
           WHEN u.tier = 'pro' THEN '-60 days'
           ELSE '-180 days' END)
);
```

**What if I need a count of inactive users per month for a churn report?** Instead of returning users, group by the month they went quiet. Use the anti-join as a filter, then aggregate. Or compute churn as users active last month but with no activity this month by joining two distinct sets and keeping `WHERE this_month.user_id IS NULL`.

**What if the table has 10 million users and the query is slow?** Do not try to return all inactive users in one giant result. Batch with keyset pagination using the indexed `id` column and the same cutoff, processing 1,000 rows at a time in a background job. And make sure the composite index `orders(user_id, created_at)` exists — without it the database scans.

## 7. 🧠 The Memory Hook

Inactive means missing. If the question is "find X with no Y," think anti-join: `NOT EXISTS` or `LEFT JOIN ... WHERE ... IS NULL`. Keep the column bare against a single cutoff, and remember NULL never equals anything — you have to ask for it directly.
