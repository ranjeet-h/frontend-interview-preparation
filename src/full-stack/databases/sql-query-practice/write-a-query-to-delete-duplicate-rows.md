# Write a Query to Delete Duplicate Rows in SQL

## 1. What the Interviewer Is Really Testing

You push a feature that lets users sign up with an email. In dev it works. In prod, a race condition or a missing constraint lets the same email get inserted three times. Now the Person table has three `john@example.com` rows with different ids. If you run a careless `DELETE`, you might wipe all three and lose the real account, or you might leave duplicates behind and break login, reporting, and billing.

This question looks like a simple `DELETE` query, but the interviewer is really testing whether you can delete safely. That means picking exactly which row survives, knowing why MySQL refuses to read from the table it is deleting from, knowing how different dialects spell the same idea, and knowing what blows up when the table is huge or has foreign keys pointing at it.

Concretely they listen for four things. First, deterministic retention — do you deliberately keep the lowest id (first created) and remove only the larger ids, not a random row. Second, engine safety — do you understand MySQL error 1093 `You can't specify target table for update in FROM clause` and how to break the read-write lock with a derived table. Third, dialect fluency — can you write the self-join `DELETE p1 FROM Person p1 INNER JOIN Person p2` for MySQL, the `DELETE ... USING` form for PostgreSQL, and the `ROW_NUMBER() OVER (PARTITION BY email ORDER BY id)` CTE for Postgres, SQL Server, and modern SQLite, plus the `ctid` trick when a table has no primary key at all. Fourth, production sense — what happens if you fire one giant `DELETE` on 10 million rows with indexes, undo log, and replicas.

A junior says DELETE duplicates. A senior says delete safely and leave exactly one correct survivor.

## 2. Think Before You Code — The Senior Dev Thought Process

The first thing I notice is this is a destructive write. I cannot just `SELECT DISTINCT`. Once I delete, the data is gone. So I need to be explicit about the survival rule before I write anything: for each duplicate group (same email), keep the smallest id and delete every row with a larger id in that group.

My brute force instinct says group by email, find MIN(id) per email, then delete where id is not in that list. Something like `DELETE FROM Person WHERE id NOT IN (SELECT MIN(id) FROM Person GROUP BY email)`. That describes the logic cleanly, and in Postgres it would actually run. But then I remember MySQL will throw error 1093 if I do that. MySQL locks Person for write and then the subquery tries to read Person again in the same statement — it aborts to avoid reading a table it is currently mutating.

So I ask myself how to break that dependency. I can force MySQL to materialize the survivor ids first by wrapping the subquery in another `SELECT ... FROM (...) AS temp`. The inner query finishes, MySQL puts the result in a temporary table, closes the read, and only then starts the delete. That is the safe subquery pattern.

But there is a more idiomatic way with no subquery at all: join the table to itself. If I alias Person as p1 and p2, join on `p1.email = p2.email` and require `p1.id > p2.id`, then p1 is always the later duplicate. Any row that finds a sibling with the same email and a smaller id must be a duplicate that should go. The row with MIN(id) for that email has no smaller sibling, so it never matches and survives. That self-join is fast when there is an index on `(email, id)` and it works cross-dialect with a small syntax tweak.

Then I think about the ranking approach. If the database supports window functions, dedup is a ranking problem: partition rows by email, order by id, number them 1, 2, 3. The survivor gets 1, everyone else gets >1. Delete where row number >1. That CTE with `ROW_NUMBER()` is the cleanest answer in PostgreSQL, SQL Server, and SQLite 3.25+. And if the table has no primary key at all, Postgres still lets me target the hidden physical row pointer `ctid` instead of id.

Finally I sanity check scale. If the table has millions of rows, one big DELETE will hold locks for seconds, flood the undo log or WAL, and lag replicas. So I plan to mention batching with `LIMIT 5000` in a loop and building an index on `(email, id)` first, and after cleanup I will suggest adding a unique constraint so the problem cannot return.

At a high level my optimal plan is: self-join with `p1.id > p2.id` for the interview whiteboard, CTE with ROW_NUMBER for modern Postgres, derived-table wrapper if I must use GROUP BY in MySQL, and the ctid variant if there is no id column.

## 3. The Solution — Fully Explained Code

Assume this standard table. The id is the surrogate that decides survival.

```sql
CREATE TABLE Person (
    id INT PRIMARY KEY,
    email VARCHAR(255) NOT NULL
);

-- index that makes every solution below fast
CREATE INDEX idx_person_email_id ON Person(email, id);
```

**Solution A — Self-join delete (works everywhere with a small tweak)**

MySQL form:

```sql
-- Keep the smallest id per email, delete every later duplicate.
-- p1 is the candidate to delete, p2 is the proof a smaller sibling exists.
DELETE p1
FROM Person p1
INNER JOIN Person p2
  ON p1.email = p2.email
 AND p1.id > p2.id;
```

PostgreSQL equivalent using USING:

```sql
-- Same logic, Postgres spells the join with USING
DELETE FROM Person p1
USING Person p2
WHERE p1.email = p2.email
  AND p1.id > p2.id;
```

Why this works: the join pairs every row with all rows sharing its email. The condition `p1.id > p2.id` keeps only pairs where p1 is not the earliest. A row that is the MIN(id) for its email never satisfies the > test, so it is never in p1's deletion set. Every other row finds at least one smaller sibling and gets marked once for deletion.

**Solution B — MySQL safe subquery (bypasses error 1093)**

```sql
-- Naive version without the wrapper fails in MySQL:
-- DELETE FROM Person WHERE id NOT IN (SELECT MIN(id) FROM Person GROUP BY email)

-- Safe version: materialize the survivor ids into a derived table first
DELETE FROM Person
WHERE id NOT IN (
    SELECT min_id FROM (
        SELECT MIN(id) AS min_id
        FROM Person
        GROUP BY email
    ) AS temp
);
```

Why the extra wrapper: the innermost `GROUP BY` finds the survivor id per email. The middle `SELECT ... FROM (...) AS temp` forces MySQL to execute that read, store the ids in a temporary in-memory table called temp, and close the read. The outer DELETE then reads from temp, not directly from Person while Person is locked for write, so the lock conflict disappears.

**Solution C — CTE with ROW_NUMBER (PostgreSQL, SQL Server, SQLite 3.25+)**

```sql
WITH RankedDuplicates AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY email   -- restart numbering for each email group
            ORDER BY id ASC      -- smallest id gets 1, next gets 2, ...
        ) AS rn
    FROM Person
)
DELETE FROM Person
WHERE id IN (
    SELECT id FROM RankedDuplicates WHERE rn > 1
);
```

Why this works: `PARTITION BY email` creates one numbered list per email. `ORDER BY id ASC` guarantees the earliest row is 1. Deleting where rn > 1 keeps exactly one per group. Flip to `ORDER BY id DESC` if the spec says keep the newest.

**Solution D — When there is no primary key (PostgreSQL ctid)**

If a legacy table was created without an id and rows are truly identical, you cannot target id. Postgres exposes the physical tuple pointer `ctid`.

```sql
WITH RankedDuplicates AS (
    SELECT
        ctid,
        ROW_NUMBER() OVER (
            PARTITION BY email
            ORDER BY ctid ASC
        ) AS rn
    FROM Person
)
DELETE FROM Person
WHERE ctid IN (
    SELECT ctid FROM RankedDuplicates WHERE rn > 1
);
```

`ctid` is not stable across VACUUM or updates, but inside one statement it uniquely identifies each physical row, so it works for a one-time cleanup. After this, add a proper primary key.

**Solution E — Production batching for millions of rows**

Never run one giant DELETE on a live table. Loop in small chunks so locks are short and replicas can catch up.

```sql
-- Run from application code or a stored procedure, 5000 at a time
DELETE p1
FROM Person p1
INNER JOIN Person p2
  ON p1.email = p2.email
 AND p1.id > p2.id
LIMIT 5000;
-- repeat until ROW_COUNT() = 0, sleep 50ms between batches
```

In Postgres you would use `DELETE FROM Person WHERE ctid IN (SELECT ctid FROM ... LIMIT 5000)` inside a loop or use `CREATE TABLE Person_New AS SELECT MIN(id), email FROM Person GROUP BY email` and swap tables if most rows are duplicates.

Time complexity with an index on `(email, id)` is about O(N log N) for the sort or B-tree scan, often close to O(N) because the index already groups emails and orders ids. Without that index the self-join degrades toward O(N squared) and the GROUP BY or window sort spills to disk. Space complexity is O(1) extra for the self-join, O(U) for the CTE or derived table where U is the number of distinct emails held in the temp buffer.

## 4. Dry Run — Walk Through a Real Example

Take this Person table before cleanup:

| id | email |
|---|---|
| 1 | john@example.com |
| 2 | bob@example.com |
| 3 | john@example.com |
| 4 | john@example.com |
| 5 | bob@example.com |

We want to keep id 1 for john and id 2 for bob, delete 3, 4, 5. Trace `DELETE p1 FROM Person p1 INNER JOIN Person p2 ON p1.email = p2.email AND p1.id > p2.id`.

Think of the join generating pairs and checking `p1.id > p2.id`.

p1 id 1 john joins with p2 id 1 john: 1 > 1 is false, keep. Joins with id 3 john: 1 > 3 false. Joins with id 4 john: 1 > 4 false. So id 1 is never marked.

p1 id 2 bob joins with p2 id 2 bob: 2 > 2 false. Joins with p2 id 5 bob: 2 > 5 false. So id 2 is never marked.

p1 id 3 john joins with p2 id 1 john: 3 > 1 is true, so id 3 is marked for deletion. It also joins with id 3 and 4 but one true is enough. The database deduplicates target rows, so id 3 is deleted once.

p1 id 4 john joins with p2 id 1 john: 4 > 1 true, marked. It also matches p2 id 3: 4 > 3 true, same target. So id 4 is deleted.

p1 id 5 bob joins with p2 id 2 bob: 5 > 2 true, marked for deletion.

Distinct p1 ids that matched at least once: 3, 4, 5. Those three rows are deleted.

Result after the statement:

| id | email |
|---|---|
| 1 | john@example.com |
| 2 | bob@example.com |

Exactly one survivor per email, the smallest id. If we had used the CTE, the same table would rank john ids 1,3,4 as rn 1,2,3 and bob ids 2,5 as rn 1,2, then delete rn > 1 and get the same result.

## 5. Edge Cases — The Ones That Break Naive Solutions

All rows are duplicates is a common trap. Imagine five rows all `a@test.com` with ids 10 to 14. The self-join still keeps only id 10 because every other id finds id 10 as a smaller sibling. The GROUP BY version keeps MIN(id) 10 and deletes 11 to 14. If you mistakenly used `DELETE FROM Person WHERE email IN (SELECT email FROM ... GROUP BY email HAVING COUNT(*) > 1)` you would delete all five, including the survivor, so never put the duplicate email list directly in a DELETE without the MIN(id) survivor filter.

No duplicates is the opposite surprise. If every email is unique, the join finds no pair where `p1.id > p2.id` because no two rows share an email, so zero rows are deleted. That is correct. A naive `DELETE WHERE id NOT IN (SELECT email ...)` with a type mismatch would delete the whole table, which is why matching types matters.

NULL emails break equality. In standard SQL `NULL = NULL` is unknown, not true, so `p1.email = p2.email` never matches two NULLs and both survive as if they were distinct. If your business rule says NULL emails are also duplicates, use null-safe equality: MySQL `p1.email <=> p2.email` or Postgres `p1.email IS NOT DISTINCT FROM p2.email`. Otherwise leave the standard join and document that NULLs are not deduped.

Only two columns define the duplicate or only one column does is about scope. Our example groups by email only. If the spec says a duplicate is same name and date of birth, you must add all columns to both the join and the PARTITION BY, otherwise you will delete rows that are not real duplicates.

Foreign keys will block you. If an Orders table has `Orders.user_id` referencing `Person(id)` with `ON DELETE RESTRICT`, the delete fails with a foreign key violation even though the Person row is a duplicate. With `ON DELETE CASCADE` it succeeds but silently deletes orders, which is worse. The safe steps are to reassign child rows to the survivor before deleting, inside the same transaction: `UPDATE Orders SET user_id = survivor_id WHERE user_id IN (duplicate_ids)`, then delete the duplicates, then add the unique constraint.

Large tables cannot take one big DELETE. Even with the correct query, a single statement on 10 million rows holds row locks for a long time, fills the InnoDB undo log or Postgres WAL, and stalls replicas. The fix is to batch with LIMIT 5000 in a loop, or if more than half the table is duplicates, copy survivors to a new table with `CREATE TABLE Person_New LIKE Person; INSERT INTO Person_New SELECT MIN(id), email FROM Person GROUP BY email; RENAME TABLE Person TO Person_Old, Person_New TO Person;` which is faster because inserts are sequential and indexes are built once.

## 6. Variations and Follow-ups

**Keep the newest instead of the oldest** is the most common follow-up. Change one ordering. In the self-join flip the inequality to `p1.id < p2.id` so only the largest id never finds a larger sibling and survives. In the window version change to `ORDER BY id DESC` so rn = 1 goes to the newest. Nothing else changes, complexity stays the same.

**Add a unique index after cleanup** is what the interviewer wants to hear once you have deleted. The dedup query fixes history, the constraint prevents the future.

```sql
-- After deletes are done and table is clean
ALTER TABLE Person ADD CONSTRAINT uq_person_email UNIQUE (email);
```

On a live table this locks writes while the index builds. In Postgres prefer `CREATE UNIQUE INDEX CONCURRENTLY idx_uq_person_email ON Person(email)` which builds without blocking writes, then add the constraint. In MySQL 8 use `ALTER TABLE Person ADD UNIQUE INDEX idx_uq_person_email (email), ALGORITHM=INPLACE, LOCK=NONE`.

**Dedup on multiple columns** tests whether you remembered to expand the partition. If a duplicate means same first_name, last_name, and date_of_birth, the self-join becomes `ON p1.first_name = p2.first_name AND p1.last_name = p2.last_name AND p1.date_of_birth = p2.date_of_birth AND p1.id > p2.id` and the window becomes `PARTITION BY first_name, last_name, date_of_birth ORDER BY id`. Add a composite index matching those columns for speed.

**What if 60 percent of a 100 million row table is duplicates** tests the batching insight. Row-by-row deletes cause massive index rebalancing and WAL churn. The interview-ready answer is the table swap: create Person_New, insert `SELECT MIN(id), email FROM Person GROUP BY email` which writes sequentially, build the index once, then atomically rename Person to Person_Old and Person_New to Person. It is O(N log N) for the group and one index build, far faster than millions of individual deletes and with less fragmentation.

**Can you do it without id or ctid** is a trick. In MySQL you can add a temporary auto-increment column, run the self-join dedup, then drop it, or use a temporary table with `ROW_NUMBER` in MySQL 8. The point is you need a stable row identifier to target one survivor.

## 7. 🧠 The Memory Hook

Join each row to its own email twin, delete only when your id is bigger than your twin. The smallest id has no smaller twin, so it always survives. That one line explains the self-join, the flipped sign for keep-newest, and why RANK 1 is the survivor.
