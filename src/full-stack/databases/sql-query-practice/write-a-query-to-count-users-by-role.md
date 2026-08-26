# Write a Query to Count Users by Role in SQL

## 1. What the Interviewer Is Really Testing

Counting rows by category looks like a trivial five-second query on paper. In practice, interviewers use this question to instantly separate engineers who memorize SQL keywords from those who understand relational algebra, grouping semantics, and edge-case execution.

The interviewer is evaluating four core competencies:

1. **Aggregation Lifecycle and Grouping Mechanics**: Knowing how the SQL query engine processes data (`FROM` -> `JOIN` -> `WHERE` -> `GROUP BY` -> `HAVING` -> `SELECT` -> `ORDER BY`), and how individual rows collapse into distinct category buckets.
2. **The `COUNT(*)` vs `COUNT(column)` Invariant**: Knowing that `COUNT(*)` counts physical rows in a partition regardless of content, whereas `COUNT(expression)` evaluates each row and ignores `NULL` values.
3. **Relational Schema Awareness & The Zero-Count Trap**: In production systems, roles are rarely raw strings in the `users` table; they live in a normalized `roles` lookup table. If a newly created role has zero registered users, a naive query drops that role entirely. Solving this requires a `LEFT JOIN` combined with `COUNT(u.id)`—and avoiding the trap where `COUNT(*)` turns an empty role into `1`.
4. **Conditional Aggregation (Pivoting)**: Recognizing when the caller or frontend dashboard expects a single horizontal summary row (`admin_count`, `user_count`, `moderator_count`) instead of multiple vertical rows, solved via `CASE WHEN` or PostgreSQL `FILTER` clauses.

## 2. Think Before You Code — The Senior Dev Thought Process

When presented with this problem, a senior engineer does not immediately start typing `SELECT role, COUNT(*)...`. The first step is clarifying the underlying schema and data contract:

- **Step 1: Clarify the schema design.** Is the role a simple column on `users` (e.g. `users.role VARCHAR`), or is the database normalized with a separate `roles` table linked by a foreign key (`users.role_id`)?
- **Step 2: Identify missing categories (the 0-count problem).** If we aggregate solely on `users`, any role that exists in the system but has no assigned users will not appear in the result set. For an analytics dashboard, omitting a role is a bug—the UI expects every existing role to show up with a count of `0`.
- **Step 3: Choose the join and aggregation target.** To preserve all roles, `roles` must be the left table in a `LEFT JOIN` to `users`. When a role has zero users, the join generates a row with `roles` data and `NULL` for all `users` columns.
- **Step 4: Avoid the `COUNT(*)` outer join trap.** If we run `COUNT(*)` on a `LEFT JOIN`, that single `NULL`-padded row gets counted as `1`. To correctly report `0`, we must write `COUNT(u.id)` or `COUNT(u.role_id)` because `COUNT(column)` discards `NULL` values.
- **Step 5: Consider the output format.** If the consumer wants a breakdown list, return grouped rows. If an API endpoint or dashboard widget needs a single object with specific role totals, pivot using conditional aggregation.

## 3. The Solution — Fully Explained Code

### Solution 1: Direct Aggregation on Users Table (Simple / Denormalized Schema)

Use this when roles are stored directly as a string or enum column on the `users` table.

```sql
-- Direct aggregation on users table
-- Groups users by their role string and counts occurrences
SELECT
    role,
    COUNT(*) AS user_count
FROM users
WHERE role IS NOT NULL
GROUP BY role
ORDER BY user_count DESC, role ASC;
```

- **Time Complexity:** O(N) where N is the number of rows in `users`. With a B-Tree index on `users(role)`, the database performs a fast Index Scan or Index Only Scan.
- **Space Complexity:** O(K) temporary buffer memory where K is the number of unique roles.

### Solution 2: Normalized Schema with Zero-Count Preservation (Production Standard)

Use this when roles live in a dedicated `roles` table. This guarantees that roles with zero registered users are returned with `user_count = 0`.

```sql
-- Normalized schema: roles table left-joined with users table
-- COUNT(u.id) evaluates to 0 when no matching user rows exist (u.id IS NULL)
SELECT
    r.id AS role_id,
    r.name AS role_name,
    COUNT(u.id) AS user_count
FROM roles r
LEFT JOIN users u
    ON r.id = u.role_id
GROUP BY r.id, r.name
ORDER BY user_count DESC, r.name ASC;
```

- **Time Complexity:** O(R + N) where R is the number of roles and N is the number of users, assuming an index on `users(role_id)`.
- **Space Complexity:** O(R) memory for the hash aggregation table.

### Solution 3: Pivoted Column Count via Conditional Aggregation (Single-Row Summary)

Use this when a dashboard or API payload requires a single horizontal object containing explicit counts per role without running multiple queries.

```sql
-- Standard SQL: Conditional aggregation using CASE WHEN inside COUNT
-- Unmatched conditions return NULL, which COUNT ignores
SELECT
    COUNT(CASE WHEN role = 'ADMIN' THEN 1 END) AS admin_count,
    COUNT(CASE WHEN role = 'MODERATOR' THEN 1 END) AS moderator_count,
    COUNT(CASE WHEN role = 'USER' THEN 1 END) AS standard_user_count,
    COUNT(*) AS total_users
FROM users;
```

In PostgreSQL, you can use the standard `FILTER` syntax for cleaner readability and identical execution plans:

```sql
-- PostgreSQL modern syntax using FILTER clause
SELECT
    COUNT(*) FILTER (WHERE role = 'ADMIN') AS admin_count,
    COUNT(*) FILTER (WHERE role = 'MODERATOR') AS moderator_count,
    COUNT(*) FILTER (WHERE role = 'USER') AS standard_user_count,
    COUNT(*) AS total_users
FROM users;
```

- **Time Complexity:** O(N) single-pass scan over `users`.
- **Space Complexity:** O(1) memory since no hash grouping table across multiple rows is needed.

## 4. Dry Run — Walk Through a Real Example

Let us trace Solution 2 using a sample dataset to see why `COUNT(u.id)` works while `COUNT(*)` fails.

### Sample Data

**`roles` Table:**

| id | name |
| :--- | :--- |
| 1 | Admin |
| 2 | Editor |
| 3 | Viewer |
| 4 | Auditor |

**`users` Table:**

| id | name | role_id |
| :--- | :--- | :--- |
| 101 | Alice | 1 |
| 102 | Bob | 1 |
| 103 | Charlie | 2 |
| 104 | Dave | 3 |

*(Notice: Role 4 'Auditor' has 0 users assigned).*

### Step-by-Step Execution

**Step 1: Evaluate `FROM roles r LEFT JOIN users u ON r.id = u.role_id`**

The database produces the intermediate joined relation. For role 4 (`Auditor`), no matching user exists, so the engine pads the user columns with `NULL`:

| r.id | r.name | u.id | u.name | u.role_id |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Admin | 101 | Alice | 1 |
| 1 | Admin | 102 | Bob | 1 |
| 2 | Editor | 103 | Charlie | 2 |
| 3 | Viewer | 104 | Dave | 3 |
| 4 | Auditor | **NULL** | **NULL** | **NULL** |

**Step 2: Group rows by `(r.id, r.name)` and evaluate aggregate expressions**

The engine partitions the intermediate table into 4 buckets:

- **Bucket `(1, 'Admin')`**: Contains 2 rows with `u.id` values `[101, 102]`.
  - `COUNT(*)` = 2
  - `COUNT(u.id)` = 2
- **Bucket `(2, 'Editor')`**: Contains 1 row with `u.id` value `[103]`.
  - `COUNT(*)` = 1
  - `COUNT(u.id)` = 1
- **Bucket `(3, 'Viewer')`**: Contains 1 row with `u.id` value `[104]`.
  - `COUNT(*)` = 1
  - `COUNT(u.id)` = 1
- **Bucket `(4, 'Auditor')`**: Contains 1 row with `u.id` value `[NULL]`.
  - `COUNT(*)` evaluates row count -> **Returns 1 (WRONG: reports 1 user when there are 0)**.
  - `COUNT(u.id)` evaluates non-null values in `[NULL]` -> **Returns 0 (CORRECT)**.

### Final Result

| role_id | role_name | user_count |
| :--- | :--- | :--- |
| 1 | Admin | 2 |
| 2 | Editor | 1 |
| 3 | Viewer | 1 |
| 4 | Auditor | 0 |

## 5. Edge Cases — The Ones That Break Naive Solutions

1. **Roles with Zero Users (The Outer Join Trap)**:
   - *The Failure:* Using `INNER JOIN` silently eliminates empty roles from the output. Using `LEFT JOIN` with `COUNT(*)` erroneously reports `1` user for empty roles because the outer join produces a single row containing `NULL` values.
   - *The Fix:* Always use `LEFT JOIN` from `roles` to `users` and aggregate with `COUNT(u.id)` or `COUNT(u.role_id)`.

2. **Users with `NULL` or Unassigned Roles**:
   - *The Failure:* In denormalized schemas, users might be registered without an assigned role (`role IS NULL`). A basic `GROUP BY role` will group these together and output a row with `role: NULL`.
   - *The Fix:* Clarify business requirements. Either filter them out using `WHERE role IS NOT NULL` or label them explicitly using `COALESCE(role, 'UNASSIGNED')`.

3. **Soft-Deleted or Inactive Users**:
   - *The Failure:* If your table tracks deleted accounts via `is_deleted = TRUE`, placing `WHERE u.is_deleted = FALSE` on a `LEFT JOIN` query turns the outer join back into an `INNER JOIN`! This happens because the `WHERE` clause filters out the `NULL`-padded rows of empty roles (since `NULL = FALSE` evaluates to `UNKNOWN`/`FALSE`).
   - *The Fix:* Put the status filter in the `ON` condition of the join:
     ```sql
     LEFT JOIN users u
         ON r.id = u.role_id
        AND u.is_deleted = FALSE
     ```

4. **Many-to-Many Role Relationships (`user_roles` junction table)**:
   - *The Failure:* In enterprise access-control schemas, a user can have multiple roles via a junction table `user_roles`. If the junction table accidentally contains duplicate pairs, `COUNT(ur.user_id)` overcounts.
   - *The Fix:* Use `COUNT(DISTINCT ur.user_id)` to count unique active users assigned to that role.

## 6. Variations and Follow-ups

### Variation 1: Filtering Roles by User Count Threshold (`HAVING` vs `WHERE`)

The interviewer asks: *"How do you modify the query to only return roles that have at least 10 users?"*

- **Solution:** Use the `HAVING` clause because `WHERE` filters rows before grouping occurs, while `HAVING` filters the aggregated groups after calculation:
  ```sql
  SELECT
      r.name AS role_name,
      COUNT(u.id) AS user_count
  FROM roles r
  LEFT JOIN users u ON r.id = u.role_id
  GROUP BY r.id, r.name
  HAVING COUNT(u.id) >= 10
  ORDER BY user_count DESC;
  ```

### Variation 2: Calculating Percentage Share of Total Users

The interviewer asks: *"Can you return each role's user count along with the percentage of the overall user base it represents in a single query?"*

- **Solution:** Combine grouping with an over-partition window function (`SUM(...) OVER ()`):
  ```sql
  SELECT
      role,
      COUNT(*) AS user_count,
      ROUND(
          COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (),
          2
      ) AS percentage_of_total
  FROM users
  WHERE role IS NOT NULL
  GROUP BY role
  ORDER BY user_count DESC;
  ```

### Variation 3: Indexing Strategy for High-Traffic Aggregations

The interviewer asks: *"What index would you add if this query runs frequently on a table with 50 million users?"*

- **Single Table Aggregation:** Create a B-Tree index on `users(role)`. If `users.id` is included or implicit, PostgreSQL/MySQL can perform an **Index Only Scan**, reading only the lightweight index pages from memory without touching the table heap.
- **Normalized Schema Join:** Ensure a foreign key index exists on `users(role_id)`. The query planner can then execute a Hash Aggregate or Index Merge Join across `roles.id = users.role_id`.

## 7. 🧠 The Memory Hook

When aggregating over a `LEFT JOIN`, never use `COUNT(*)`—it counts the ghost row generated by the join. Always use `COUNT(child_table.id)` so empty parent records cleanly resolve to `0`.
