# Write a Query to Count Users by Role

## 1. What the Interviewer Is Really Testing

Give a product manager a quick report: how many admins, how many editors, how many viewers do we have? It sounds like a 10-second query. You write `GROUP BY role`, you get numbers back, you move on.

Then the dashboard ships and something is off. The "Auditor" role you just added last week does not appear at all. The total users number does not match the sum of the role counts. And on Postgres the counts for `admin` and `Admin` show up as two separate rows, while on MySQL they collapsed into one. Nothing threw an error, but the answers are quietly wrong.

That is exactly why interviewers ask this question. They are not checking if you can spell `GROUP BY`. They are checking whether you understand what grouping actually does under the hood and what `COUNT` really counts.

Four things are being measured at once. First, grouping mechanics — do you know that `GROUP BY role` collapses all rows with the same role into buckets, and that the database then runs one aggregate per bucket? Second, the `COUNT(*) vs COUNT(column)` distinction — `COUNT(*)` counts every row in the bucket, even if it is a ghost row full of NULLs, while `COUNT(u.id)` looks at a specific column and skips NULLs. Third, handling missing categories — in any real schema roles live in their own `roles` table, and a naive `GROUP BY users.role` or `INNER JOIN` will silently drop roles that currently have zero users, which breaks any dashboard that expects a `0` row. Solving that needs a `LEFT JOIN` from `roles` to `users` plus `COUNT(u.id)`. Fourth, output shape — sometimes the frontend wants vertical rows (one per role) and sometimes it wants one horizontal row with `admin_count`, `editor_count` pivoted into columns, which needs conditional aggregation. Miss any of those and you get a query that runs but lies.

## 2. Think Before You Code — The Senior Dev Thought Process

The first thing I notice when I see this prompt is that the answer depends entirely on the schema, so I never just start typing. I ask: is `role` a plain text column on `users`, or are we normalized with `roles(id, name)` and `users(role_id)`? The interview is usually testing the normalized case even if they phrase it casually as "count users by role", because that is the real-world shape.

My naive instinct is `SELECT role, COUNT(*) FROM users GROUP BY role`. That works for the denormalized case, and it is O(N) — one pass over the table, hash or sort into K buckets where K is the number of distinct roles. But then I pause: what about a role that exists in `roles` but has no users yet? If I group only on `users`, that role never appears. For an analytics screen that is a bug — the PM expects to see `Auditor: 0`, not a missing row. So I need to flip the driving table. The left side has to be `roles`, the complete list of categories, left-joined to `users`.

As soon as I decide on `LEFT JOIN`, the next trap pops up. A `LEFT JOIN` always produces at least one row per left-side row, even when there is no match — the user columns are just NULL-padded. If I then write `COUNT(*)`, that single NULL-padded row counts as 1, so my empty role reports `1` instead of `0`. That is a classic off-by-one that passes code review if you are not looking. The fix is `COUNT(u.id)` or `COUNT(u.role_id)` because `COUNT(column)` skips NULLs by definition, so the empty bucket correctly returns 0.

Then I think about output format. Does the caller want a tall result (one row per role) or a wide result (one row with many columns)? If they say "give me counts for each role as columns for a dashboard widget", I need conditional aggregation — `COUNT(CASE WHEN role='admin' THEN 1 END)` in standard SQL or `COUNT(*) FILTER (WHERE role='admin')` in Postgres — not three separate queries.

Finally I sanity-check filters. If the spec says "only active users", I cannot put `WHERE u.is_active = true` after a `LEFT JOIN` because that filters out the NULL-padded rows and turns it back into an `INNER JOIN`. That condition has to go into the `ON` clause. With those pieces sorted — grouping column, left table, COUNT target, filter placement, and pivot choice — I have the whole plan before writing a single line of SQL.

## 3. The Solution — Fully Explained Code

This section shows three shapes you will actually use in production. All of them are standard SQL and run as-is in SQLite, Postgres, and MySQL. Where Postgres has nicer syntax it is called out.

**Solution 1 — Direct GROUP BY when role lives on users (denormalized)**

Use this when `users` has its own `role` text column. It is the simplest shape and the right answer if there is no separate `roles` table.

```sql
-- Setup for a runnable demo (SQLite / Postgres / MySQL)
CREATE TABLE users_simple (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT
);

INSERT INTO users_simple (id, name, role) VALUES
  (101, 'Alice',   'admin'),
  (102, 'Bob',     'admin'),
  (103, 'Charlie', 'editor'),
  (104, 'Dave',    'viewer'),
  (105, 'Eve',     NULL);

-- The query: one bucket per distinct role, count rows in each bucket
SELECT
  role,
  COUNT(*) AS user_count
FROM users_simple
WHERE role IS NOT NULL          -- drop the NULL bucket; use COALESCE if you want to label it
GROUP BY role
ORDER BY user_count DESC, role ASC;
-- Result: admin 2, editor 1, viewer 1. Eve (NULL) is excluded.
```

Why `COUNT(*)` here is fine: every row in `users_simple` is a real user row, there is no outer-join ghost row to miscount. The `WHERE` before `GROUP BY` removes unassigned users so they do not create a `NULL` group. If you need to keep them, replace the select with `COALESCE(role, 'UNASSIGNED')`.

Time complexity is O(N) where N is the number of users — one scan, hash into K buckets. Space is O(K) for the aggregation hash. With an index on `users_simple(role)` the engine can often do an index-only scan.

**Solution 2 — Normalized schema with LEFT JOIN to preserve zero-count roles (production standard)**

Use this when roles live in `roles(id, name)` and `users` points at it. This is the shape interviewers want you to reach for unprompted.

```sql
-- Normalized schema: roles is the source of truth for categories
CREATE TABLE roles (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE users (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  role_id INTEGER REFERENCES roles(id)
);

INSERT INTO roles (id, name) VALUES
  (1, 'Admin'),
  (2, 'Editor'),
  (3, 'Viewer'),
  (4, 'Auditor');  -- Auditor has zero users on purpose

INSERT INTO users (id, name, role_id) VALUES
  (101, 'Alice',   1),
  (102, 'Bob',     1),
  (103, 'Charlie', 2),
  (104, 'Dave',    3);

-- LEFT JOIN from roles preserves Auditor with a count of 0
-- COUNT(u.id) skips NULLs, so the ghost row for Auditor counts as 0 not 1
SELECT
  r.id   AS role_id,
  r.name AS role_name,
  COUNT(u.id) AS user_count   -- never COUNT(*) here
FROM roles r
LEFT JOIN users u
  ON r.id = u.role_id
GROUP BY r.id, r.name
ORDER BY user_count DESC, r.name ASC;
```

Why this exact combination: `roles` must be on the left because it is the complete category list. `LEFT JOIN` keeps every role even when the join finds nothing. `COUNT(u.id)` is the critical detail — it counts only matched user rows. `COUNT(*)` would count the single NULL-padded row for Auditor as 1, which is the most common wrong answer in interviews. Grouping by `r.id, r.name` covers both the key and the display name so the `SELECT` is valid under strict `GROUP BY` rules in Postgres and MySQL with `ONLY_FULL_GROUP_BY`.

Time complexity is O(R + N) where R is the number of roles, assuming an index on `users(role_id)` for the join. Space is O(R) for the hash table.

Filtering belongs in the ON clause when you still want zero-count rows:

```sql
-- Correct: keeps Auditor at 0 even when filtering to active users
SELECT r.name, COUNT(u.id) AS user_count
FROM roles r
LEFT JOIN users u
  ON r.id = u.role_id
 AND u.is_active = 1        -- or u.deleted_at IS NULL
GROUP BY r.id, r.name;

-- Wrong: WHERE turns the outer join into an inner join and Auditor disappears
-- WHERE u.is_active = 1  -- do not do this after a LEFT JOIN if you need zeros
```

**Solution 3 — Pivoted single-row summary with conditional aggregation**

Use this when the API or dashboard wants `{ admin_count: 2, editor_count: 1, ... }` instead of multiple rows.

```sql
-- Standard SQL: works in SQLite, MySQL, Postgres, SQL Server
-- CASE returns 1 for matching rows and NULL otherwise; COUNT skips NULLs
SELECT
  COUNT(CASE WHEN role = 'admin'  THEN 1 END) AS admin_count,
  COUNT(CASE WHEN role = 'editor' THEN 1 END) AS editor_count,
  COUNT(CASE WHEN role = 'viewer' THEN 1 END) AS viewer_count,
  COUNT(*)                                     AS total_users
FROM users_simple
WHERE role IS NOT NULL;

-- Postgres / SQLite 3.44+ cleaner syntax — identical plan, better readability
SELECT
  COUNT(*) FILTER (WHERE role = 'admin')  AS admin_count,
  COUNT(*) FILTER (WHERE role = 'editor') AS editor_count,
  COUNT(*) FILTER (WHERE role = 'viewer') AS viewer_count,
  COUNT(*)                                 AS total_users
FROM users_simple;
```

Both forms scan `users` once, O(N) time and O(1) space — no grouping hash across many rows, just a few counters. `SUM(CASE WHEN role='admin' THEN 1 ELSE 0 END)` is a common alternative, but `COUNT(CASE ... THEN 1 END)` is more idiomatic because it leans on the NULL-skipping rule you are already demonstrating.

## 4. Dry Run — Walk Through a Real Example

Let us trace Solution 2 step by step with the normalized tables from above, because that is where the `COUNT(*)` vs `COUNT(u.id)` difference actually shows up.

Sample data we start with:

roles has four rows: (1, Admin), (2, Editor), (3, Viewer), (4, Auditor).
users has four rows: Alice->1, Bob->1, Charlie->2, Dave->3. Auditor has nobody.

Step 1 — Evaluate FROM and LEFT JOIN. The engine walks each row in `roles` and looks for matching `users.role_id`. Where it finds matches it emits one joined row per match. Where it finds nothing it still emits one row with all `users` columns set to NULL.

The intermediate joined relation right before grouping looks like this:

r.id=1, r.name=Admin,  u.id=101, u.name=Alice,   u.role_id=1
r.id=1, r.name=Admin,  u.id=102, u.name=Bob,     u.role_id=1
r.id=2, r.name=Editor, u.id=103, u.name=Charlie, u.role_id=2
r.id=3, r.name=Viewer, u.id=104, u.name=Dave,    u.role_id=3
r.id=4, r.name=Auditor,u.id=NULL,u.name=NULL,   u.role_id=NULL

That last row is the ghost row. It exists solely because we used LEFT JOIN. An INNER JOIN would have dropped Auditor entirely and we would never get a chance to count it as zero.

Step 2 — Group and aggregate. The engine partitions that intermediate table by `(r.id, r.name)` into four buckets.

Bucket for Admin (id 1) holds two rows with u.id values [101, 102]. `COUNT(*)` sees two rows so returns 2. `COUNT(u.id)` sees two non-NULL ids so also returns 2. They agree here.

Bucket for Editor (id 2) holds one row with u.id [103]. Both counts return 1.

Bucket for Viewer (id 3) holds one row with u.id [104]. Both counts return 1.

Bucket for Auditor (id 4) holds one row with u.id [NULL]. This is the decisive bucket. `COUNT(*)` counts rows regardless of content — there is one row, so it returns 1, which is a lie. `COUNT(u.id)` counts only non-NULL values in the u.id column — the list is [NULL], so it returns 0, which is the truth.

Step 3 — ORDER BY. After aggregation we sort by user_count descending, then name ascending, so the final output is:

role_id 1, Admin,   2
role_id 2, Editor,  1
role_id 3, Viewer,  1
role_id 4, Auditor, 0

If we had used the denormalized query on `users_simple`, there would be no roles table to drive the LEFT JOIN, and Auditor would be impossible to represent — that is why normalization matters. The dry run makes it obvious that `LEFT JOIN + COUNT(child.id)` is not a stylistic choice, it is the only way to get zeros right.

## 5. Edge Cases — The Ones That Break Naive Solutions

**No users for a role — the zero-count trap.** This is the number one reason candidates fail this question. If you write `SELECT role, COUNT(*) FROM users GROUP BY role`, roles that exist but have no users never appear because there is simply no row to group. If you fix that with `roles LEFT JOIN users` but keep `COUNT(*)`, the ghost row turns the zero into a one. The fix is the pair: drive from `roles` with `LEFT JOIN`, and count `COUNT(u.id)` not `COUNT(*)`. In an interview, say both parts out loud — interviewers listen for the pair.

**Users with NULL or unassigned roles.** In the denormalized model, `INSERT INTO users_simple VALUES (105, 'Eve', NULL)` is valid. `GROUP BY role` will create a bucket where `role IS NULL` and show `NULL | 1`, which looks like a bug to a PM. You have to decide the product rule: either exclude them with `WHERE role IS NOT NULL`, or label them explicitly with `SELECT COALESCE(role, 'UNASSIGNED') AS role, COUNT(*) ... GROUP BY COALESCE(role, 'UNASSIGNED')`. For the normalized model the orphan case is `users.role_id IS NULL` — those users join to nothing, so they do not inflate any role count, but they are also invisible in the LEFT JOIN result. If you need to surface them, add a second query or a `UNION ALL` for unassigned users, or report `total_users - SUM(user_count)` as an unassigned count.

**Case sensitivity — admin vs Admin vs ADMIN.** This quietly splits or merges buckets depending on your collation. Postgres is case-sensitive by default, so `'admin'` and `'Admin'` are different groups — you get two rows when you expected one. MySQL with `utf8mb4_general_ci` is case-insensitive, so they collapse. SQLite `TEXT` comparison is case-sensitive unless you add `COLLATE NOCASE`. The safe interview answer is to call it out and normalize: either clean the data at write time with a `CHECK (role = lower(role))` or an enum, or normalize at read time with `GROUP BY LOWER(role)` and `COUNT(CASE WHEN LOWER(role)='admin' THEN 1 END)`. For the normalized schema this problem moves to `roles.name` — enforce a unique index on `lower(name)` so you cannot insert both Admin and admin as separate roles.

**Soft-deleted or inactive users turning the outer join back into an inner join.** If `users` has `is_deleted` or `deleted_at`, writing `LEFT JOIN users u ON r.id = u.role_id WHERE u.is_deleted = false` looks correct but deletes every ghost row because `NULL = false` is not true, so Auditor disappears again. The predicate has to live in the `ON` clause: `LEFT JOIN users u ON r.id = u.role_id AND u.is_deleted = false`. Mentioning this distinction in an interview immediately signals that you have debugged this in production.

**Many-to-many roles via a junction table and duplicate assignments.** When a user can have multiple roles, you have `user_roles(user_id, role_id)` between the two tables. Counting then needs `COUNT(DISTINCT ur.user_id)` per role, otherwise a duplicate `(user_id, role_id)` pair — easy to create with a missing unique constraint — double-counts the same person. Adding `UNIQUE(user_id, role_id)` on the junction table prevents the problem at the source, and `COUNT(DISTINCT ...)` defends the query even if the constraint is missing.

## 6. Variations and Follow-ups

**Variation — Only show roles with at least N users (HAVING vs WHERE).** The interviewer asks: "Now only return roles that have 10 or more users." New candidates reach for `WHERE COUNT(*) >= 10`, which is a syntax error because `WHERE` runs before grouping and cannot see aggregates. The correct clause is `HAVING`, which filters after grouping.

```sql
-- Roles with 10+ active users, zero-count roles naturally excluded by the threshold
SELECT
  r.id,
  r.name AS role_name,
  COUNT(u.id) AS user_count
FROM roles r
LEFT JOIN users u
  ON r.id = u.role_id
 AND u.is_active = 1
GROUP BY r.id, r.name
HAVING COUNT(u.id) >= 10
ORDER BY user_count DESC;
```

If you also want to keep zero-count roles in the same report but flag the popular ones, keep the base query and add a boolean: `COUNT(u.id) >= 10 AS is_popular`.

**Variation — Pivot counts into columns for a dashboard widget.** The follow-up is: "The frontend wants one object `{ admin: 2, editor: 1, viewer: 1 }` not an array of rows — and do it in one query." That is conditional aggregation, not multiple round trips. Use `CASE` for portability and `FILTER` for clarity in Postgres.

```sql
-- Single-row wide result from the denormalized table
SELECT
  COUNT(CASE WHEN LOWER(role) = 'admin'  THEN 1 END) AS admin_count,
  COUNT(CASE WHEN LOWER(role) = 'editor' THEN 1 END) AS editor_count,
  COUNT(CASE WHEN LOWER(role) = 'viewer' THEN 1 END) AS viewer_count,
  COUNT(*) AS total_users
FROM users_simple
WHERE role IS NOT NULL;

-- Same pivot but driven from the normalized schema so zeros are explicit
SELECT
  COUNT(CASE WHEN r.name = 'Admin'  THEN u.id END) AS admin_count,
  COUNT(CASE WHEN r.name = 'Editor' THEN u.id END) AS editor_count,
  COUNT(CASE WHEN r.name = 'Viewer' THEN u.id END) AS viewer_count
FROM roles r
LEFT JOIN users u ON r.id = u.role_id;
```

Note the inside of the `CASE` matters: `COUNT` skips NULLs, so `THEN 1` with an implicit `ELSE NULL` is enough. Writing `THEN 0` would be wrong because `COUNT(0)` counts the zero. If you prefer `SUM`, you must write `SUM(CASE WHEN ... THEN 1 ELSE 0 END)`.

**Variation — Indexing for a table with 50 million users.** The interviewer asks what index you would add if this query runs every time the admin dashboard loads. For the denormalized `GROUP BY role` query, add `CREATE INDEX idx_users_role ON users_simple(role)`. With that index Postgres and MySQL can do an index-only scan — they read the compact index pages and never touch the heap table, which is a huge win when the table is wide. For the normalized join, ensure `CREATE INDEX idx_users_role_id ON users(role_id)` exists alongside the primary key on `roles(id)`. The planner then uses a hash aggregate or merge join instead of a sequential scan. If you are on Postgres and the dashboard always filters to active users, a partial index `CREATE INDEX idx_users_active_role ON users(role_id) WHERE is_active = true` makes the filtered LEFT JOIN even cheaper.

**Variation — Percentage share per role.** A bonus follow-up: "Show each role's share of total users in the same query." Use a window over the aggregates, no self-join needed.

```sql
SELECT
  role,
  COUNT(*) AS user_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS pct_of_total
FROM users_simple
WHERE role IS NOT NULL
GROUP BY role
ORDER BY user_count DESC;
```

`SUM(COUNT(*)) OVER ()` sums the per-bucket counts across all buckets after grouping, so each row can divide its own count by the grand total in one pass.

## 7. 🧠 The Memory Hook

If you need zeros to show up, the categories must drive the query — `FROM roles LEFT JOIN users` — and you must count the child, `COUNT(users.id)`, not the row, `COUNT(*)`, because only the child is NULL when nobody signed up for that role.
