# Write a Query to Find Inactive Users in SQL

## 1. What the Interviewer Is Really Testing

This looks like a simple date-filtering exercise, but interviewers use it to probe three foundational database engineering skills that separate junior scriptwriters from production engineers:

- **Date arithmetic and SARGability (Search Argument Able):** Can you write temporal filters that allow the query optimizer to perform a fast B-Tree index seek, or do you wrap columns in scalar functions like `DATEDIFF()` and force a full table scan across millions of rows?
- **Three-Valued Logic (3VL) and `NULL` handling:** In SQL, `NULL < date` evaluates to `UNKNOWN` rather than `TRUE` or `FALSE`. If a user registered but never logged in, their `last_login_at` is `NULL`. Naive `<` queries silently drop these users—the exact cohort that is most inactive.
- **Cross-table event correlation:** Real systems define inactivity across multiple event streams (logins, orders, comments, subscriptions). The interviewer wants to see whether you reach for `NOT EXISTS`, anti-joins (`LEFT JOIN ... WHERE ... IS NULL`), or window functions over unified audit logs, and whether you understand the performance implications of each.

## 2. Think Before You Code — The Senior Dev Thought Process

When approaching this problem in an interview, here is the architectural thought process to step through before typing a single character:

First, look at the naive implementation most candidates rush to write:

```sql
-- The Naive / Broken Approach
SELECT id, name, last_login_at 
FROM users 
WHERE DATEDIFF(NOW(), last_login_at) > 90;
```

Why is this a red flag in a production environment?

1. **It misses the most inactive users:** If `last_login_at` is `NULL` (the user never logged in after creating their account), `DATEDIFF(NOW(), NULL)` yields `NULL`. In SQL `WHERE` clauses, `NULL` resolves to `UNKNOWN`, which gets discarded. You just excluded the users who have been dormant since day one.
2. **It destroys index performance (Non-SARGable):** By wrapping the column inside `DATEDIFF()`, the database engine cannot traverse an index on `last_login_at`. It has to deserialize every single row in the `users` table and execute the function row by row ($O(N)$ full table scan).

To make the query SARGable, isolate the column on the left side of the operator:

$$\text{last\_login\_at} < \text{NOW}() - \text{INTERVAL 90 DAY}$$

Now the right side evaluates to a single constant timestamp at the start of query execution. If there is a B-Tree index on `last_login_at`, the storage engine jumps directly to that timestamp in $O(\log N)$ time and scans backwards.

Next, consider the schema reality:

- **Single-table scenario:** The `users` table contains a denormalized timestamp like `last_login_at`. We filter with an explicit `OR last_login_at IS NULL` check (or qualify by `created_at`).
- **Multi-table scenario:** Activity is split across distinct transactional tables (`logins`, `orders`, `user_actions`). We need an anti-join pattern. We choose `NOT EXISTS` over `NOT IN` because `NOT IN` fails silently if the subquery returns any `NULL` values, and `NOT EXISTS` short-circuits the moment a single recent event is found.
- **Unified audit log scenario:** All interactions log to an append-only stream. We use an aggregation or window function (`ROW_NUMBER()` or `MAX()`) to determine the latest interaction per user.

## 3. The Solution — Fully Explained Code

Here are the three production-grade solutions, ranging from single-table filtering to multi-table event streams.

### Solution 1: Single-Table SARGable Query with NULL Handling

Used when the user profile stores the latest login timestamp directly.

```sql
-- Solution 1: SARGable single-table filter handling NULL timestamps
-- Compatible with MySQL / PostgreSQL (use standard ANSI interval syntax)
SELECT 
    id, 
    name, 
    email, 
    last_login_at,
    created_at
FROM users
WHERE 
    -- 1. Isolate the column so the B-Tree index on last_login_at is used for an index range seek
    last_login_at < NOW() - INTERVAL 90 DAY
    -- 2. Explicitly capture users who registered over 90 days ago but never logged in
    OR (last_login_at IS NULL AND created_at < NOW() - INTERVAL 90 DAY);
```

**Complexity Analysis:**
- **Time Complexity:** $O(\log N + K)$, where $N$ is the total number of users and $K$ is the number of inactive users returned. With an index on `(last_login_at)`, the engine seeks the cutoff date in $O(\log N)$ and scans qualifying leaves.
- **Space Complexity:** $O(K)$ to hold and stream the matching result set buffer.

---

### Solution 2: Multi-Table Activity Check Using `NOT EXISTS`

Used in normalized systems where logins and transactions live in separate append-only event tables. A user is inactive if they have had no logins AND no orders in the last 90 days.

```sql
-- Solution 2: Multi-table activity correlation with short-circuiting NOT EXISTS
SELECT 
    u.id, 
    u.name, 
    u.email
FROM users u
WHERE 
    -- Ensure the user account itself is at least 90 days old
    u.created_at < NOW() - INTERVAL 90 DAY
    
    -- Subquery 1: Check for any recent logins
    AND NOT EXISTS (
        SELECT 1 
        FROM user_logins l 
        WHERE l.user_id = u.id 
          AND l.logged_in_at >= NOW() - INTERVAL 90 DAY
    )
    
    -- Subquery 2: Check for any recent purchase activity
    AND NOT EXISTS (
        SELECT 1 
        FROM orders o 
        WHERE o.user_id = u.id 
          AND o.created_at >= NOW() - INTERVAL 90 DAY
    );
```

**Complexity Analysis:**
- **Time Complexity:** $O(U \cdot (\log L + \log O))$, where $U$ is candidate users, $L$ is rows in `user_logins`, and $O$ is rows in `orders`. With composite indexes on `user_logins(user_id, logged_in_at)` and `orders(user_id, created_at)`, `NOT EXISTS` stops scanning the index the millisecond it finds one row matching the condition (semi-join short-circuit).
- **Space Complexity:** $O(K)$ where $K$ is the filtered output set. No massive temporary join tables are materialized in memory.

---

### Solution 3: Window Function Over Unified Activity Audit Stream

Used when all user actions flow into an append-only event stream table (`user_events`).

```sql
-- Solution 3: CTE with Window Function to rank events across unified logs
WITH LatestUserEvents AS (
    SELECT 
        u.id AS user_id,
        u.name,
        u.email,
        e.event_timestamp,
        -- Rank events per user from newest to oldest
        ROW_NUMBER() OVER (
            PARTITION BY u.id 
            ORDER BY e.event_timestamp DESC
        ) AS event_rank
    FROM users u
    LEFT JOIN user_events e ON u.id = e.user_id
    WHERE u.created_at < NOW() - INTERVAL 90 DAY
)
SELECT 
    user_id,
    name,
    email,
    event_timestamp AS last_activity_at
FROM LatestUserEvents
WHERE event_rank = 1 
  AND (event_timestamp < NOW() - INTERVAL 90 DAY OR event_timestamp IS NULL);
```

**Complexity Analysis:**
- **Time Complexity:** $O(E \log E)$, where $E$ is the total number of event records for candidate users. The window function partitions and sorts rows per user.
- **Space Complexity:** $O(E)$ memory buffer during the CTE sort and partitioning step before filtering down to $K$ rows.

## 4. Dry Run — Walk Through a Real Example

Let us trace Solution 1 and Solution 2 against a concrete sample dataset with a cutoff threshold of 90 days before today (`2026-06-01 00:00:00`).

Assume current timestamp `NOW()` = `2026-06-01 00:00:00`.
Cutoff date (`NOW() - INTERVAL 90 DAY`) = `2026-03-03 00:00:00`.

### Sample Table: `users`

| id | name | created_at | last_login_at |
| :--- | :--- | :--- | :--- |
| **1** | Alice | 2025-01-01 | 2026-01-15 |
| **2** | Bob | 2025-05-10 | 2026-05-20 |
| **3** | Charlie | 2025-02-01 | `NULL` |
| **4** | Diana | 2026-02-15 | 2026-04-01 |
| **5** | Evan | 2026-05-28 | `NULL` |

### Step-by-Step Evaluation (Solution 1)

1. **User 1 (Alice):**
   - `last_login_at` (`2026-01-15`) < Cutoff (`2026-03-03`): **TRUE**.
   - Output row: Alice is selected (Inactive for 137 days).

2. **User 2 (Bob):**
   - `last_login_at` (`2026-05-20`) < Cutoff (`2026-03-03`): **FALSE**.
   - `last_login_at IS NULL`: **FALSE**.
   - Discarded: Bob logged in 12 days ago (Active).

3. **User 3 (Charlie):**
   - `last_login_at` (`NULL`) < Cutoff (`2026-03-03`): **UNKNOWN**.
   - Next clause: `last_login_at IS NULL` (**TRUE**) AND `created_at` (`2025-02-01`) < Cutoff (**TRUE**): **TRUE**.
   - Output row: Charlie is selected (Registered over a year ago, never logged in).

4. **User 4 (Diana):**
   - `last_login_at` (`2026-04-01`) < Cutoff (`2026-03-03`): **FALSE** (April 1 is after March 3).
   - `last_login_at IS NULL`: **FALSE**.
   - Discarded: Diana logged in 61 days ago (Active).

5. **User 5 (Evan):**
   - `last_login_at` (`NULL`) < Cutoff: **UNKNOWN**.
   - Next clause: `last_login_at IS NULL` (**TRUE**), BUT `created_at` (`2026-05-28`) < Cutoff: **FALSE** (Evan signed up only 4 days ago).
   - Discarded: Evan is a brand-new user, not a lapsed inactive user.

### Final Result Set

| id | name | email | last_login_at | created_at |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Alice | alice@example.com | 2026-01-15 | 2025-01-01 |
| **3** | Charlie | charlie@example.com | `NULL` | 2025-02-01 |

## 5. Edge Cases — The Ones That Break Naive Solutions

### 1. The `NOT IN` with `NULL` Trap
If you write:
```sql
-- CRITICAL DEFECT: If any login has user_id = NULL, this returns 0 rows!
SELECT id, name FROM users 
WHERE id NOT IN (SELECT user_id FROM user_logins WHERE logged_in_at >= NOW() - INTERVAL 90 DAY);
```
If the subquery returns even a single row where `user_id` is `NULL` (e.g., failed anonymous login attempts logged without an ID), the expression `u.id NOT IN (1, 2, NULL)` evaluates to `UNKNOWN` for every single user in the table. The entire query returns an empty result set. Always use `NOT EXISTS` or ensure `user_id IS NOT NULL` inside `NOT IN`.

### 2. Timezone Drift and Daylight Saving Time (DST)
Comparing server local time `NOW()` against UTC timestamps stored in database columns leads to false classifications near the boundary threshold. If database records store `TIMESTAMP WITH TIME ZONE` or UTC epoch, write:
```sql
-- PostgreSQL
last_login_at < (NOW() AT TIME ZONE 'UTC' - INTERVAL '90 days')
-- MySQL
last_login_at < UTC_TIMESTAMP() - INTERVAL 90 DAY
```

### 3. Conflating "New Users" with "Inactive Users"
A user who registered yesterday and has not logged in today has `last_login_at IS NULL`. If your query simply checks `last_login_at IS NULL`, you will flag brand-new registrations as churned accounts. Always guard with `AND created_at < NOW() - INTERVAL 90 DAY`.

### 4. Soft-Deleted or Suspended Accounts
Batch marketing or re-engagement scripts targeting inactive users will accidentally email banned or deleted users if you omit lifecycle statuses. Always filter `deleted_at IS NULL` and `account_status = 'active'`.

### 5. Non-Deterministic Date Boundaries
Using functions like `NOW()` or `CURRENT_TIMESTAMP` inside subqueries or large batch updates can cause inconsistent cuts across long-running queries. Setting a fixed cutoff variable (`SET @cutoff = NOW() - INTERVAL 90 DAY;`) guarantees deterministic results across multiple statements.

## 6. Variations and Follow-ups

### Follow-up 1: "How do you batch process 10 million inactive users for account archiving without locking tables?"
Running `DELETE FROM users WHERE last_login_at < ...` on 10 million rows will exhaust rollback segments, bloat the undo log, lock index pages, and saturate database replication.

Use cursor-based keyset batching in a background worker script:

```sql
-- Keyset pagination batching: Process 1,000 rows at a time using indexed keys
SELECT id, last_login_at 
FROM users 
WHERE (last_login_at < @cutoff_timestamp OR (last_login_at IS NULL AND created_at < @cutoff_timestamp))
  AND id > @last_processed_id
ORDER BY id ASC
LIMIT 1000;
```

### Follow-up 2: "What if inactivity rules differ by subscription tier (VIPs inactive after 30 days, Free users after 180 days)?"
Compute the variable threshold dynamically per row:

```sql
SELECT id, name, tier, last_login_at
FROM users
WHERE last_login_at < NOW() - (
    CASE 
        WHEN tier = 'enterprise' THEN INTERVAL 30 DAY
        WHEN tier = 'pro'        THEN INTERVAL 60 DAY
        ELSE                          INTERVAL 180 DAY
    END
)
OR (
    last_login_at IS NULL 
    AND created_at < NOW() - (
        CASE 
            WHEN tier = 'enterprise' THEN INTERVAL 30 DAY
            WHEN tier = 'pro'        THEN INTERVAL 60 DAY
            ELSE                          INTERVAL 180 DAY
        END
    )
);
```

### Follow-up 3: "How do you calculate User Churn Rate over specific rolling windows?"
To find users who were active in month $M-1$ but had zero activity in month $M$:

```sql
-- Month-over-month churn identification
SELECT 
    prev_month.user_id
FROM (
    SELECT DISTINCT user_id 
    FROM user_events 
    WHERE event_timestamp >= '2026-04-01' AND event_timestamp < '2026-05-01'
) AS prev_month
LEFT JOIN (
    SELECT DISTINCT user_id 
    FROM user_events 
    WHERE event_timestamp >= '2026-05-01' AND event_timestamp < '2026-06-01'
) AS curr_month ON prev_month.user_id = curr_month.user_id
WHERE curr_month.user_id IS NULL;
```

## 7. 🧠 The Memory Hook

> **"SARGable on the right, NULLs kept in sight, `NOT EXISTS` keeps joins light."**
> 
> 1. **SARGable on the right:** Keep the column naked (`last_login_at < NOW() - INTERVAL 90 DAY`) so B-Tree indexes seek rather than scan.
> 2. **NULLs kept in sight:** Never let `NULL` evaluate to `UNKNOWN` silently; account for dormant users who never logged in.
> 3. **`NOT EXISTS` keeps joins light:** Correlate across multiple activity tables with `NOT EXISTS` to short-circuit immediately on the first active record and avoid the `NOT IN` null-trap.
