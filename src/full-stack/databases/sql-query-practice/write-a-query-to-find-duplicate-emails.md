# Write a Query to Find Duplicate Emails in SQL

## 1. What the Interviewer Is Really Testing

This query looks simple on the surface, but interviewers use it to evaluate whether you understand how database engines group and filter data under the hood.

First, it tests your command of SQL logical query processing order: `FROM` -> `WHERE` -> `GROUP BY` -> `HAVING` -> `SELECT`. Candidates who do not understand this order often try to write `WHERE COUNT(*) > 1`, which fails because the `WHERE` clause filters individual rows before any grouping or aggregation takes place. The `HAVING` clause exists specifically to filter aggregate buckets after groups are formed.

Second, it tests whether you know multiple paths to the same result and can articulate their trade-offs. You can solve this with `GROUP BY ... HAVING`, a self-join (`INNER JOIN` on `email` with differing `id` values), or an analytical window function (`COUNT(*) OVER (PARTITION BY email)`). Each approach produces a different query execution plan.

Third, it tests your awareness of storage engines, index utilization, and character collations. A naive `GROUP BY` on an unindexed table forces a full table scan and an expensive in-memory hash aggregate or disk-backed temporary filesort. Adding a B+Tree index on `email` transforms the query into an index-only covering stream aggregation. Furthermore, whether `'john@example.com'` and `'John@example.com'` collide depends entirely on your database collation (`utf8mb4_0900_ai_ci` case-insensitive vs `utf8mb4_bin` binary collation) and whether your schema allows `NULL` values.

## 2. Think Before You Code — The Senior Dev Thought Process

When presented with the `Person` table schema containing `id` (primary key) and `email` (varchar), here is how to break down the solution systematically:

My first instinct is to think about how duplicate values reveal themselves in relational algebra. If an email appears more than once, grouping the table by that email will create a group containing two or more rows.

The naive self-join approach comes to mind first for developers used to row-by-row comparisons: join `Person p1` to `Person p2` where `p1.email = p2.email` and `p1.id != p2.id`. But I immediately recognize why that is suboptimal. A self-join generates an intermediate Cartesian-like cross product for matching rows. If an email repeats 10 times, the join produces 90 paired rows before `SELECT DISTINCT` deduplicates them back down to 1. That burns unnecessary CPU and memory.

Next, I consider derived tables or subqueries: group by `email`, select `email` and `COUNT(*)`, and wrap it in an outer query with `WHERE count > 1`. While correct, SQL provides a cleaner, first-class construct for this exact pattern: `HAVING`.

The optimal query groups rows by `email` and applies `HAVING COUNT(email) > 1`.

Why `COUNT(email)` instead of `COUNT(*)`? `COUNT(*)` counts every row in the partition, including `NULL` values. If the schema allows nullable emails and multiple rows contain `NULL`, `COUNT(*)` treats all `NULL`s as a duplicate group and outputs `NULL`. In contrast, `COUNT(email)` ignores `NULL`s within the group, evaluating to 0.

Finally, I think about the physical execution plan. If `email` has no index, the database engine must scan every page of the table and build a hash table or sort the data into temporary buffers. If we place a B+Tree index on `email`, the index leaf pages are already stored in sorted order. The query planner can stream through the index leaves sequentially, count consecutive duplicate keys, and emit duplicates immediately with zero heap table lookups and $O(1)$ working memory.

## 3. The Solution — Fully Explained Code

Here is the canonical aggregation solution alongside the self-join and window function alternatives.

**Approach 1: Canonical Aggregation with GROUP BY and HAVING (Recommended)**

```sql
-- Approach 1: Canonical Grouping & Aggregate Filter
-- Collapses identical emails into buckets and retains buckets with > 1 row
SELECT
    email
FROM
    Person
GROUP BY
    email
HAVING
    COUNT(email) > 1;
```

How it works:
1. `FROM Person`: Gathers rows from the storage engine.
2. `GROUP BY email`: Hashes or sorts rows by `email` into distinct buckets.
3. `HAVING COUNT(email) > 1`: Evaluates the non-null count per bucket and discards unique rows.
4. `SELECT email`: Projects only the qualifying email keys.

Complexity:
- Time Complexity:
  - Without an index: $O(N)$ using hash aggregation (e.g., PostgreSQL HashAggregate / MySQL 8.0 hash table) or $O(N \log N)$ if the engine uses sort-based aggregation (filesort).
  - With a B+Tree index on `email`: $O(N)$ index-only stream scan. The engine reads pre-sorted index leaf pages sequentially and counts contiguous matches without scanning table data pages (`Using index` in MySQL `EXPLAIN`, `Index Only Scan` in PostgreSQL).
- Space Complexity:
  - Without an index: $O(U)$ memory to hold the hash table of $U$ unique emails.
  - With a B+Tree index: $O(1)$ auxiliary memory since the engine streams sorted keys and only tracks a running counter for the current key.

**Approach 2: Self-Join with Unique ID Comparison**

```sql
-- Approach 2: Self-Join on Matching Email and Differing IDs
-- Pairs duplicate records and deduplicates the final projection
SELECT DISTINCT
    p1.email
FROM
    Person p1
INNER JOIN
    Person p2
    ON p1.email = p2.email
    AND p1.id != p2.id;
```

How it works:
- Every row `p1` joins against every row `p2` that shares the same email but has a different primary key.
- `SELECT DISTINCT` is mandatory. If an email is repeated 3 times across IDs 1, 2, and 3, ID 1 pairs with 2 and 3, ID 2 pairs with 1 and 3, and ID 3 pairs with 1 and 2, producing 6 raw joined rows.
- Complexity: $O(N^2)$ worst-case for nested-loop joins without indexes; $O(N + K)$ with a hash join where $K$ is the number of duplicate join matches. Space complexity is $O(K)$ for the intermediate join buffers.

**Approach 3: Window Function (Analytic Partitioning) with a CTE**

```sql
-- Approach 3: Window Function via Common Table Expression (CTE)
-- Computes the partition frequency across rows before filtering
WITH EmailFrequencies AS (
    SELECT
        email,
        COUNT(*) OVER (PARTITION BY email) AS email_count
    FROM
        Person
    WHERE
        email IS NOT NULL
)
SELECT DISTINCT
    email
FROM
    EmailFrequencies
WHERE
    email_count > 1;
```

How it works:
- `COUNT(*) OVER (PARTITION BY email)` assigns the total count of each email to every single row without collapsing the rows.
- The outer query filters rows with `email_count > 1` and uses `DISTINCT` to eliminate duplicates from the output.
- While heavier for finding emails alone, window functions are the preferred pattern when you need to select accompanying columns like `id` or `created_at` alongside the duplicate count.
- Complexity: $O(N \log N)$ time to sort partitions; $O(N)$ space to materialize window state.

## 4. Dry Run — Walk Through a Real Example

Let us trace the canonical `GROUP BY ... HAVING` solution on a sample `Person` table.

**Input Table:**

| id | email |
| :--- | :--- |
| 1 | `alice@example.com` |
| 2 | `bob@example.com` |
| 3 | `alice@example.com` |
| 4 | `charlie@example.com` |
| 5 | `bob@example.com` |
| 6 | `alice@example.com` |

**Execution Step by Step:**

Step 1 (`FROM Person`):
The database reads the 6 rows from the table or index.

Step 2 (`GROUP BY email`):
The engine partitions rows by their `email` value into distinct aggregate groups:
- Group 1: `'alice@example.com'` -> Rows `[id: 1, id: 3, id: 6]`
- Group 2: `'bob@example.com'` -> Rows `[id: 2, id: 5]`
- Group 3: `'charlie@example.com'` -> Row `[id: 4]`

Step 3 (`HAVING COUNT(email) > 1`):
The engine evaluates the aggregate condition on each group bucket:
- Group 1 (`alice@example.com`): `COUNT(email) = 3`. Predicate `3 > 1` is `TRUE`. (Bucket Kept)
- Group 2 (`bob@example.com`): `COUNT(email) = 2`. Predicate `2 > 1` is `TRUE`. (Bucket Kept)
- Group 3 (`charlie@example.com`): `COUNT(email) = 1`. Predicate `1 > 1` is `FALSE`. (Bucket Discarded)

Step 4 (`SELECT email`):
The engine outputs the surviving keys.

**Final Result Set:**

| email |
| :--- |
| `alice@example.com` |
| `bob@example.com` |

## 5. Edge Cases — The Ones That Break Naive Solutions

Here are the critical real-world edge cases that expose bugs in naive queries:

1. **Empty Table (0 rows):**
   If the `Person` table has no rows, the query returns an empty result set (0 rows), not `NULL`. `GROUP BY` over an empty set produces 0 groups, and `HAVING` filters nothing.

2. **All Emails Are Unique:**
   If every row has a distinct email, every group has a count of exactly 1. `HAVING COUNT(email) > 1` evaluates to `FALSE` for every group. The query safely returns an empty result set.

3. **All Rows Share the Exact Same Email:**
   If all 100 rows have `test@example.com`, the engine creates exactly one group with a count of 100. The query outputs exactly one row: `test@example.com`.

4. **NULL Values in the Email Column:**
   If the column is nullable and multiple rows have `email = NULL`, SQL grouping places all `NULL` values into a single group.
   - If you write `HAVING COUNT(*) > 1`, `COUNT(*)` counts `NULL` rows, returns a count >= 2, and mistakenly outputs `NULL` as a duplicate email.
   - If you write `HAVING COUNT(email) > 1`, `COUNT(email)` ignores `NULL` entries, yields a count of 0, and correctly discards the `NULL` bucket.
   - Best practice: Add `WHERE email IS NOT NULL` before `GROUP BY` to filter out `NULL` rows before grouping even begins.

5. **Case-Sensitivity and Collation Pitfalls:**
   Suppose the table contains `'alex@example.com'` and `'Alex@example.com'`:
   - Under a case-insensitive collation (like MySQL default `utf8mb4_0900_ai_ci` or `utf8mb4_general_ci`), the engine treats `'alex@example.com'` and `'Alex@example.com'` as identical strings and groups them together as duplicates.
   - Under a case-sensitive or binary collation (PostgreSQL default `C` or `utf8`, or MySQL `utf8mb4_bin`), the engine treats them as two distinct strings, each with count 1, and fails to catch the duplicate.
   - Production fix: Normalize comparisons explicitly using `GROUP BY LOWER(email) HAVING COUNT(LOWER(email)) > 1` or define a functional/expression index on `LOWER(email)`.

## 6. Variations and Follow-ups

Interviewers frequently pivot from this question to harder, practical variations.

**Variation 1: Return the Duplicate Emails with Their Frequency Count**

The interviewer asks: "Can you return the duplicate email along with how many times it appears, sorted by most frequent first?"

```sql
SELECT
    email,
    COUNT(email) AS occurrence_count
FROM
    Person
WHERE
    email IS NOT NULL
GROUP BY
    email
HAVING
    COUNT(email) > 1
ORDER BY
    occurrence_count DESC;
```

**Variation 2: Return Full User Profiles for Duplicate Emails**

The interviewer asks: "Instead of just the email string, return all columns (`id`, `email`, `created_at`) for every row that belongs to a duplicate email."

Using a window function is the cleanest, single-pass solution:

```sql
WITH RankedDuplicates AS (
    SELECT
        id,
        email,
        created_at,
        COUNT(*) OVER (PARTITION BY email) AS freq
    FROM
        Person
    WHERE
        email IS NOT NULL
)
SELECT
    id,
    email,
    created_at
FROM
    RankedDuplicates
WHERE
    freq > 1
ORDER BY
    email, id;
```

**Variation 3: Delete Duplicate Emails, Keeping Only the Smallest ID (LeetCode 196)**

The interviewer asks: "Write a query to remove all duplicate emails from `Person`, keeping only one unique email with the smallest `id`."

In MySQL using a self-join `DELETE`:
```sql
DELETE p1
FROM Person p1
INNER JOIN Person p2
    ON p1.email = p2.email
    AND p1.id > p2.id;
```

In PostgreSQL or standard SQL using a subquery:
```sql
DELETE FROM Person
WHERE id NOT IN (
    SELECT MIN(id)
    FROM Person
    GROUP BY email
);
```

**Variation 4: Optimize for 100 Million Rows in Production**

The interviewer asks: "The `Person` table has 100 million rows and this query is timing out. How do you fix it?"

1. **Covering B+Tree Index:** Add `CREATE INDEX idx_person_email ON Person (email);`. Because the index is ordered, the query engine performs an index-only stream aggregation. It scans the index leaves sequentially without touching heap table pages or allocating a temporary table.
2. **Chunking / Range Partitioning:** If modifying schema is not immediately possible, partition the workload by email prefix (e.g. `WHERE email >= 'a' AND email < 'b'`) or hash bucket, processing each slice in parallel background worker tasks.

## 7. 🧠 The Memory Hook

Group by the key, count the non-nulls, and filter the buckets with `HAVING`.

Remember the cardinal SQL rule: `WHERE` filters rows before grouping occurs; `HAVING` filters groups after counts are calculated. Always use `COUNT(email)` instead of `COUNT(*)` so `NULL` values never masquerade as duplicates.
