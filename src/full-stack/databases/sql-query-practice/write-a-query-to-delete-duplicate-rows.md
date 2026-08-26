# Write a Query to Delete Duplicate Rows in SQL

## 1. What the Interviewer Is Really Testing

Deleting duplicate rows sounds like an introductory SQL exercise, but in a senior interview, it is a multi-layered test of mutating Data Manipulation Language (`DELETE`) mechanics, database engine query planning, and operational safety.

The interviewer is evaluating whether you understand:

1. **Deterministic Retention:** How to reliably keep the original record (minimum `id`) or newest record (maximum `id`) while discarding redundant copies.
2. **Database Engine Mutation Restrictions:** In MySQL, writing a naive `DELETE FROM Person WHERE id NOT IN (SELECT MIN(id) FROM Person GROUP BY email)` immediately crashes with `ERROR 1093 (HY000): You can't specify target table 'Person' for update in FROM clause`. An experienced engineer knows why this lock conflict happens and how to bypass it using an in-memory derived table.
3. **Dialect-Specific DML Syntax:** The difference between MySQL multi-table `DELETE` joins (`DELETE p1 FROM Person p1 INNER JOIN ...`), PostgreSQL `DELETE ... USING`, and ANSI SQL CTEs with window functions (`ROW_NUMBER() OVER (PARTITION BY ...)`).
4. **Keyless Deduplication (`ctid` / `ROWID`):** How to eliminate true duplicate records when a table lacks a primary key or surrogate ID.
5. **Production Scale Mechanics (10,000,000 Rows):** Why a single monolithic `DELETE` will exhaust the InnoDB undo log / Postgres WAL, trigger table-level lock escalation, and stall replication replicas—and how to implement chunked batching in chunks of 5,000 rows over a composite index `(email, id)`.

---

## 2. Think Before You Code — The Senior Dev Thought Process

When I see this problem, the first thing I recognize is that this is a destructive write operation (`DELETE`), not a read-only query (`SELECT DISTINCT`). Once rows are removed, any mistake alters production data permanently.

Here is how I reason through the solution before writing a single line of SQL:

### 1. Identify the Matching Criteria and Survival Rule
We need to group records by the duplicate criteria (e.g., `email`) and decide which row survives. Typically, we keep the row with the lowest `id` (the earliest record created) and delete every row with a higher `id` that shares that same email.

### 2. The Naive Subquery Trap
My initial thought might be to write:
```sql
-- Fails in MySQL with Error 1093!
DELETE FROM Person
WHERE id NOT IN (
    SELECT MIN(id)
    FROM Person
    GROUP BY email
);
```
Why does this fail? MySQL locks the target table `Person` for writing during the `DELETE`. When the nested subquery in the `FROM` clause tries to read from the very same table being modified, MySQL aborts to prevent reading an inconsistent, actively mutating state.

To make this work in MySQL, we must wrap the subquery inside a secondary derived table (`SELECT min_id FROM (...) AS temp`), which forces the query engine to evaluate and materialize the distinct IDs into a temporary in-memory table before executing the deletion.

### 3. The Idiomatic Self-Join Approach
Can we do this without subqueries? Yes. If we join `Person` to itself on `email`:
- `p1.email = p2.email`
- `p1.id > p2.id`

For any given email, if `p1` has an `id` greater than another row `p2` with the same email, `p1` is a duplicate that came later. If we delete `p1`, every duplicate with a higher `id` gets wiped out. The row with the minimum `id` will never have an `id` greater than any existing sibling record, so it never matches the condition and survives.

### 4. Window Functions and Common Table Expressions (CTEs)
In PostgreSQL, SQL Server, and SQLite 3.25+, window functions provide the cleanest abstraction:
- Group and order rows with `ROW_NUMBER() OVER (PARTITION BY email ORDER BY id ASC)`.
- The surviving row gets rank `1`.
- Every duplicate gets rank `2, 3, ... N`.
- Delete all rows where `rn > 1`.

### 5. Production Reality Check
If the table has 10 million rows and 2 million duplicates, running a single `DELETE` statement will:
- Acquire long-running row and gap locks, blocking incoming inserts and updates.
- Fill the database undo log / Write-Ahead Log (WAL), risking transaction buffer overflow.
- Cause severe replication lag on read replicas.

In production, we must verify a composite index on `(email, id)` exists and delete duplicates in a loop with `LIMIT 5000`.

---

## 3. The Solution — Fully Explained Code

Let us assume the standard table schema:

```sql
CREATE TABLE Person (
    id INT PRIMARY KEY,
    email VARCHAR(255) NOT NULL
);
```

### Solution 1: Cross-Dialect Self-Join `DELETE` (MySQL & Standard Multi-Table)

This is the most popular interview solution for MySQL because it is concise, fast, and does not require subqueries.

```sql
DELETE p1
FROM Person p1
INNER JOIN Person p2
  ON p1.email = p2.email
 AND p1.id > p2.id;
```

**PostgreSQL Equivalent Syntax (`USING` clause):**
```sql
DELETE FROM Person p1
USING Person p2
WHERE p1.email = p2.email
  AND p1.id > p2.id;
```

#### Why it works:
- `DELETE p1`: Tells the engine to delete records from the `p1` instance of `Person`, leaving matching rows from `p2` intact.
- `ON p1.email = p2.email`: Pairs every person with all other records that share the same email address.
- `AND p1.id > p2.id`: Filters the joined pairs so that `p1` only matches if there exists a record `p2` with a strictly smaller `id`.
- The oldest record with `MIN(id)` has no record with a smaller `id`, so it is never targeted in `p1`.

---

### Solution 2: Subquery with Derived Table Materialization (MySQL 1093 Bypass)

If you prefer `GROUP BY`, you must isolate the read operation from the write target table using a nested derived table alias (`AS temp`).

```sql
DELETE FROM Person
WHERE id NOT IN (
    SELECT min_id
    FROM (
        -- Subquery 1: Extract minimum IDs per email
        SELECT MIN(id) AS min_id
        FROM Person
        GROUP BY email
    ) AS temp
);
```

#### Why it works:
- The innermost query groups by `email` and extracts the smallest `id` for each unique address.
- The intermediate `FROM (...) AS temp` creates an ephemeral derived table in memory.
- Because MySQL evaluates and closes the derived table before executing the outer `DELETE`, the lock conflict on `Person` is completely avoided.

---

### Solution 3: CTE with `ROW_NUMBER()` (PostgreSQL, SQL Server, SQLite)

Using Common Table Expressions and window functions is the standard enterprise pattern for databases that support CTE mutations.

```sql
WITH RankedDuplicates AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY email
            ORDER BY id ASC
        ) AS row_num
    FROM Person
)
DELETE FROM Person
WHERE id IN (
    SELECT id
    FROM RankedDuplicates
    WHERE row_num > 1
);
```

#### Case: Table Has No Primary Key (PostgreSQL `ctid` Physical Pointer)
If a legacy table has duplicate rows without any unique ID column, standard SQL cannot isolate rows by `id`. In PostgreSQL, we target the physical tuple identifier `ctid`:

```sql
WITH RankedDuplicates AS (
    SELECT
        ctid,
        ROW_NUMBER() OVER (
            PARTITION BY email
            ORDER BY ctid ASC
        ) AS row_num
    FROM Person
)
DELETE FROM Person
WHERE ctid IN (
    SELECT ctid
    FROM RankedDuplicates
    WHERE row_num > 1
);
```

---

### Solution 4: Production Scale Batching (10,000,000 Rows)

When deleting millions of rows on live traffic, execute chunked deletions inside an application loop or stored procedure:

```sql
-- Step 1: Create a composite index to avoid table scans during the join
CREATE INDEX idx_person_email_id ON Person(email, id);

-- Step 2: Delete in bounded chunks (MySQL stored procedure pattern)
DELIMITER $$

CREATE PROCEDURE PurgeDuplicateEmails()
BEGIN
    DECLARE rows_deleted INT DEFAULT 1;

    WHILE rows_deleted > 0 DO
        DELETE p1
        FROM Person p1
        INNER JOIN Person p2
          ON p1.email = p2.email
         AND p1.id > p2.id
        LIMIT 5000;

        -- Capture how many rows were affected in this batch
        SET rows_deleted = ROW_COUNT();

        -- Optional: Sleep 50ms to yield CPU and let replicas catch up
        DO SLEEP(0.05);
    END WHILE;
END$$

DELIMITER ;
```

---

### Complexity Analysis

- **Time Complexity:**
  - **With Index on `(email, id)`:** $O(N \log N)$ or $O(N)$. The B-Tree index keeps emails grouped and IDs ordered, allowing the database to scan matching keys without full table scans or sorting overhead.
  - **Without Index:** $O(N^2)$ for nested loop self-joins or $O(N \log N)$ with disk-based external merge sorts for `GROUP BY` / Window functions.
- **Space Complexity:**
  - **Self-Join:** $O(1)$ auxiliary storage when backed by an index.
  - **Derived Table / CTE:** $O(U)$ memory where $U$ is the count of distinct emails stored in the temporary table or CTE buffer.

---

## 4. Dry Run — Walk Through a Real Example

Let us trace the Self-Join `DELETE` on a concrete dataset:

### Initial `Person` Table

| id | email |
|---|---|
| `1` | `john@example.com` |
| `2` | `bob@example.com` |
| `3` | `john@example.com` |
| `4` | `john@example.com` |
| `5` | `bob@example.com` |

### Step 1: Evaluate `Person p1 INNER JOIN Person p2 ON p1.email = p2.email`

The database creates matches between records sharing an email:

| `p1.id` | `p1.email` | `p2.id` | `p2.email` | `p1.id > p2.id` | Action on `p1` |
|---|---|---|---|---|---|
| `1` | `john@example.com` | `1` | `john@example.com` | `1 > 1` (False) | Kept |
| `1` | `john@example.com` | `3` | `john@example.com` | `1 > 3` (False) | Kept |
| `1` | `john@example.com` | `4` | `john@example.com` | `1 > 4` (False) | Kept |
| `2` | `bob@example.com` | `2` | `bob@example.com` | `2 > 2` (False) | Kept |
| `2` | `bob@example.com` | `5` | `bob@example.com` | `2 > 5` (False) | Kept |
| `3` | `john@example.com` | `1` | `john@example.com` | `3 > 1` (**TRUE**) | **DELETE** |
| `3` | `john@example.com` | `3` | `john@example.com` | `3 > 3` (False) | - |
| `3` | `john@example.com` | `4` | `john@example.com` | `3 > 4` (False) | - |
| `4` | `john@example.com` | `1` | `john@example.com` | `4 > 1` (**TRUE**) | **DELETE** |
| `4` | `john@example.com` | `3` | `john@example.com` | `4 > 3` (**TRUE**) | **DELETE** |
| `4` | `john@example.com` | `4` | `john@example.com` | `4 > 4` (False) | - |
| `5` | `bob@example.com` | `2` | `bob@example.com` | `5 > 2` (**TRUE**) | **DELETE** |
| `5` | `bob@example.com` | `5` | `bob@example.com` | `5 > 5` (False) | - |

### Step 2: Distinct Rows Selected for Deletion
The rows matching `p1.id > p2.id` at least once are `id = 3`, `id = 4`, and `id = 5`.

### Resulting `Person` Table

| id | email |
|---|---|
| `1` | `john@example.com` |
| `2` | `bob@example.com` |

Both unique emails are preserved with their original, lowest `id`.

---

## 5. Edge Cases — The Ones That Break Naive Solutions

### 1. Triplicates and N-Tuples (More Than 2 Duplicates)
- **The Risk:** In our example, `john@example.com` appeared 3 times (`id = 1, 3, 4`). `id = 4` matched both `p2.id = 1` and `p2.id = 3`.
- **How It Is Handled:** A `DELETE` statement processes unique target rows. Even if `p1.id = 4` matches the join criteria twice, the row `id = 4` is marked for deletion once. The lowest ID (`id = 1`) never matches because no smaller ID exists for that email.

### 2. `NULL` Values in the Comparison Column (`email IS NULL`)
- **The Risk:** In SQL standard three-valued logic, `NULL = NULL` evaluates to `UNKNOWN` (falsy). If two users have `NULL` emails, `p1.email = p2.email` fails to join, leaving all `NULL` rows intact.
- **How It Is Handled:** If business logic dictates that `NULL` emails should also be deduplicated, use null-safe equality:
  - MySQL: `ON p1.email <=> p2.email AND p1.id > p2.id`
  - PostgreSQL / ANSI: `ON p1.email IS NOT DISTINCT FROM p2.email AND p1.id > p2.id`

### 3. Reversing Retention: Keeping the Newest Record Instead
- **The Risk:** The problem prompt might ask to retain the most recently created record instead of the oldest.
- **How It Is Handled:** Invert the inequality operator:
  ```sql
  -- Deletes rows with smaller IDs, keeping MAX(id)
  DELETE p1
  FROM Person p1
  INNER JOIN Person p2
    ON p1.email = p2.email
   AND p1.id < p2.id;
  ```

### 4. Foreign Key Constraints (`ON DELETE RESTRICT` / `CASCADE`)
- **The Risk:** If an `Orders` table has a foreign key referencing `Person(id)`, deleting duplicate `Person` records will fail immediately with a foreign key constraint violation (or unintentionally purge orders under `CASCADE`).
- **How It Is Handled:** Before deleting duplicate `Person` records, run an `UPDATE` on dependent child tables to reassign `user_id` to the surviving `MIN(id)`:
  ```sql
  UPDATE Orders o
  JOIN Person p1 ON o.user_id = p1.id
  JOIN Person p2 ON p1.email = p2.email AND p1.id > p2.id
  SET o.user_id = p2.id;
  ```

---

## 6. Variations and Follow-ups

### Variation 1: Deduplicating Across Multiple Columns
**Question:** What if duplicates are defined as having the same `first_name`, `last_name`, AND `date_of_birth`?

**Self-Join Approach:**
```sql
DELETE p1
FROM Users p1
INNER JOIN Users p2
  ON p1.first_name = p2.first_name
 AND p1.last_name = p2.last_name
 AND p1.date_of_birth = p2.date_of_birth
 AND p1.id > p2.id;
```

**Window Function Approach:**
```sql
WITH Ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY first_name, last_name, date_of_birth
               ORDER BY id ASC
           ) as rn
    FROM Users
)
DELETE FROM Users
WHERE id IN (SELECT id FROM Ranked WHERE rn > 1);
```

---

### Variation 2: Permanent Prevention (Unique Constraints)
**Question:** How do you guarantee duplicates never re-enter the database?

Once the cleanup query finishes, enforce uniqueness at the storage engine level:
```sql
ALTER TABLE Person
ADD CONSTRAINT uq_person_email UNIQUE (email);
```

**Production Consideration:** On high-traffic systems, building a unique index locks the table against writes. In PostgreSQL, run `CREATE UNIQUE INDEX CONCURRENTLY idx_uq_person_email ON Person(email)`. In MySQL 8.0, specify `ALGORITHM=INPLACE, LOCK=NONE`.

---

### Variation 3: The "Table Swap" Strategy for Massive Data Purges
**Question:** If 60% of a 100-million-row table consists of duplicates, is running `DELETE` statements the fastest approach?

**Answer:** No. Individual row deletes cause massive index rebalancing, disk fragmentation, and WAL write amplification. The faster, cleaner approach is to copy distinct rows into a fresh table and swap table names:

```sql
-- Step 1: Create an identical clone
CREATE TABLE Person_New LIKE Person;

-- Step 2: Insert only the deduplicated rows (bulk append is fast and unfragmented)
INSERT INTO Person_New (id, email)
SELECT MIN(id), email
FROM Person
GROUP BY email;

-- Step 3: Atomic table swap
RENAME TABLE Person TO Person_Old, Person_New TO Person;

-- Step 4: Drop the old table to reclaim disk space immediately
DROP TABLE Person_Old;
```

---

## 7. 🧠 The Memory Hook

**"Join on the duplicate column, filter where self-ID is greater, and delete the larger twin."**

The minimum ID has no smaller sibling and always survives. When using subqueries in MySQL, always wrap the `GROUP BY` in a derived table alias to break the update lock.

