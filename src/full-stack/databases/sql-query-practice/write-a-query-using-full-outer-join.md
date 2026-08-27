# Write a Query Using FULL OUTER JOIN

## 1. What the Interviewer Is Really Testing

You get asked to produce a report that shows every user and every order in one result — users who have never ordered, orders that somehow point at a deleted or missing user, and the normal matched pairs in between. Someone writes an INNER JOIN and the report looks clean in dev. In production it quietly drops the exact rows you needed to see — the orphaned orders that indicate a bug, the inactive users that marketing wants to target. That silent data loss is the pain this question is hunting for.

When an interviewer asks for a FULL OUTER JOIN they are not testing whether you can memorize join syntax. They are testing outer join completeness — do you know the difference between keeping only the overlap and keeping everything.

They want to hear three things without you being prompted. First, that a FULL OUTER JOIN means all rows from both sides, with NULL padded wherever there is no match, not just the matched rows. Second, that you know which databases actually support it and what to do when they do not — MySQL to this day has no FULL OUTER JOIN syntax, so you have to fake it with a UNION of a LEFT JOIN and a RIGHT JOIN, or a LEFT JOIN plus an anti-join. Third, that you can project the result defensively so the report is usable — COALESCE for the key so the unmatched side does not produce a NULL identifier, AND a CASE that checks IS NULL before comparing values.

If you answer with an INNER JOIN or a single LEFT JOIN you have failed the completeness test even if the query runs.

## 2. Think Before You Code — The Senior Dev Thought Process

The first thing I notice is the word all. The prompt says all users and all orders, or all bank transactions and all ledger records. The moment I hear all on both sides I know INNER JOIN is out — it keeps only the intersection. LEFT JOIN keeps all of one side but drops orphans on the other.

My instinct for reconciliation problems is to line things up side-by-side on the join key so I can compare columns in the same row. UNION stacks rows vertically and does not give me that side-by-side comparison, so it is the wrong shape even though it also keeps all rows.

The brute force mental model is to run two queries — one LEFT JOIN and one RIGHT JOIN — and then eyeball the results. That works for debugging but it is not a query you can hand to an application. It also double-counts the matched rows if you are not careful about deduplication.

The pattern that clicks is FULL OUTER JOIN. It is the only join that says keep every row from the left and every row from the right, merge the ones that match on the key, and fill the empty side with NULLs. Once I see that, the high-level plan is simple: join on the key, use COALESCE to pick the non-NULL identifier, and use a CASE that branches on IS NULL first and only then compares amounts or other attributes.

Then I remember the dialect trap. If this is PostgreSQL, SQL Server, Oracle, or a recent SQLite, I can write FULL OUTER JOIN directly. If the interviewer says MySQL — and many do on purpose — I need to emulate it. MySQL has no FULL OUTER JOIN keyword at all. The cheapest correct emulation is LEFT JOIN from table A to table B UNION ALL the anti-join — the rows from table B that have no match in A, found by a second LEFT JOIN with WHERE A.key IS NULL. Using UNION ALL instead of UNION matters because the two halves are already disjoint, so UNION would force an unnecessary sort and deduplication.

Before writing code I also ask what happens with duplicates and filters. If the join key is not unique the join will fan out, and if I put a WHERE filter on a column from one side after the join I will accidentally turn the outer join back into an inner join because NULL fails the predicate.

## 3. The Solution — Fully Explained Code

This example uses users and orders because it makes the three result shapes obvious — matched, left-only, right-only — and the same pattern works for any two tables you need to reconcile.

```sql
-- Schema: users (every person) and orders (every purchase)
-- An order may point at a user_id that no longer exists, and a user may have no orders
CREATE TABLE users (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE orders (
    id      INTEGER PRIMARY KEY,
    user_id INTEGER,
    amount  NUMERIC(10,2) NOT NULL
    -- In production you would add FOREIGN KEY (user_id) REFERENCES users(id)
    -- but the orphan case is exactly why we need FULL OUTER JOIN to find violations
);

-- Sample data — keep it tiny so you can trace it by hand
INSERT INTO users (id, name) VALUES
    (1, 'Alice'),
    (2, 'Bob'),
    (3, 'Carol');

INSERT INTO orders (id, user_id, amount) VALUES
    (101, 1,  50.00),   -- matches Alice
    (102, 2,  30.00),   -- matches Bob
    (103, 99, 20.00);   -- orphan: user_id 99 does not exist in users
-- Carol (id 3) has no orders — she will appear as left-only
-- Order 103 has no matching user — it will appear as right-only
```

**Standard SQL — works on PostgreSQL, SQL Server, Oracle, SQLite 3.39+**

```sql
SELECT
    COALESCE(u.id, o.user_id) AS person_id,  -- COALESCE keeps the identifier even when one side is NULL
    u.name,
    o.id     AS order_id,
    o.amount,
    CASE
        WHEN u.id IS NULL THEN 'orphan order — no matching user'
        WHEN o.id IS NULL THEN 'user with no orders'
        ELSE 'matched'
    END AS row_type
FROM users  u
FULL OUTER JOIN orders o
    ON u.id = o.user_id
ORDER BY person_id, order_id;
```

Why this shape: FULL OUTER JOIN keeps all rows from both tables. Rows where u.id equals o.user_id become one merged row. Rows where there is no partner are kept and the other side is padded with NULLs. COALESCE picks whichever identifier survived so the report never shows a NULL key for an orphan. The CASE checks IS NULL before anything else — that avoids three-valued logic surprises when comparing nullable columns.

If your reconciliation is bank transactions versus ledger records, the same structure applies with a value comparison:

```sql
-- Generic reconciliation shape — same FULL OUTER JOIN, just comparing amounts
SELECT
    COALESCE(b.id, l.id) AS record_id,
    b.amount AS bank_amount,
    l.amount AS ledger_amount,
    CASE
        WHEN b.id IS NULL THEN 'Missing in Bank'
        WHEN l.id IS NULL THEN 'Missing in Ledger'
        WHEN b.amount <> l.amount THEN 'Amount Mismatch'
        ELSE 'Reconciled'
    END AS status
FROM bank_transactions b
FULL OUTER JOIN ledger_records l
    ON b.id = l.id
ORDER BY record_id;
```

**MySQL workaround — no FULL OUTER JOIN keyword exists in MySQL 5.7, 8.0, or 8.4**

MySQL simply does not parse FULL OUTER JOIN. The interview-ready emulation is a LEFT JOIN plus an anti-join combined with UNION ALL. The two halves are disjoint so UNION ALL avoids a costly distinct sort.

```sql
-- Part 1: every user plus matching orders, NULL where user has no order
SELECT
    u.id AS person_id,
    u.name,
    o.id AS order_id,
    o.amount
FROM users u
LEFT JOIN orders o
    ON u.id = o.user_id

UNION ALL

-- Part 2: only the orders that had no matching user (the anti-join)
SELECT
    o.user_id AS person_id,
    NULL      AS name,
    o.id      AS order_id,
    o.amount
FROM orders o
LEFT JOIN users u
    ON u.id = o.user_id
WHERE u.id IS NULL
ORDER BY person_id, order_id;
```

You will also see this written as LEFT JOIN UNION ALL RIGHT JOIN. That is equivalent — a RIGHT JOIN is just a LEFT JOIN with the tables swapped. The LEFT + anti-join form is preferred in MySQL because older MySQL versions did not optimize RIGHT JOIN well, and the WHERE IS NULL makes the intent explicit.

A second runnable variant using RIGHT JOIN, for when the interviewer explicitly asks for it:

```sql
SELECT u.id, u.name, o.id, o.amount FROM users u LEFT  JOIN orders o ON u.id = o.user_id
UNION ALL
SELECT u.id, u.name, o.id, o.amount FROM users u RIGHT JOIN orders o ON u.id = o.user_id WHERE u.id IS NULL;
```

Dialect notes you should say out loud: PostgreSQL, SQL Server, Oracle, and SQLite 3.39 and later support FULL OUTER JOIN natively. MySQL and MariaDB do not — you must emulate. If you write FULL OUTER JOIN against MySQL it is a syntax error, not an empty result.

Time complexity: Standard FULL OUTER JOIN is O(N + M) with a hash join — the engine builds a hash table on the smaller table and streams the larger table once, then emits unmatched leftovers. Merge join is also O(N + M) if both inputs are already sorted on the join key via an index.

Space complexity: O(min(N, M)) for the hash table or sort buffers, where N and M are row counts of the two tables. The emulation with UNION ALL runs two indexed joins, so it is two O(N log M) lookups instead of one hash pass, but still avoids a distinct sort because the halves do not overlap.

## 4. Dry Run — Walk Through a Real Example

Use the users and orders data from the schema above.

users table:

| id | name  |
|----|-------|
| 1  | Alice |
| 2  | Bob   |
| 3  | Carol |

orders table:

| id  | user_id | amount |
|-----|---------|--------|
| 101 | 1       | 50.00  |
| 102 | 2       | 30.00  |
| 103 | 99      | 20.00  |

We run the standard FULL OUTER JOIN query:

```sql
SELECT COALESCE(u.id, o.user_id) AS person_id, u.name, o.id AS order_id, o.amount
FROM users u FULL OUTER JOIN orders o ON u.id = o.user_id
ORDER BY person_id;
```

Step by step, the engine groups rows by the join condition u.id = o.user_id.

Start with Alice. u.id = 1 finds o.user_id = 1 in order 101. The keys match, so the engine emits one merged row: person_id is COALESCE(1, 1) which is 1, name is Alice, order_id is 101, amount is 50.00, row_type is matched.

Next is Bob. u.id = 2 finds o.user_id = 2 in order 102. Same logic — merged row with person_id 2, name Bob, order_id 102, amount 30.00, row_type matched.

Next is Carol. u.id = 3 scans orders for user_id 3 and finds nothing. This is left-only. The engine keeps the user row and pads the order side with NULLs. COALESCE(3, NULL) is 3, name is Carol, order_id is NULL, amount is NULL, row_type is user with no orders.

Finally, order 103 has user_id 99. No user has id 99, so this is right-only. The engine keeps the order row and pads the user side with NULLs. COALESCE(NULL, 99) is 99, name is NULL, order_id is 103, amount is 20.00, row_type is orphan order — no matching user. If we had used COALESCE(o.user_id, u.id) the value would still be 99, but projecting COALESCE(u.id, o.user_id) guarantees we never lose the orphan identifier even though u.id is NULL.

Final output in ORDER BY person_id order:

| person_id | name  | order_id | amount | row_type                     |
|-----------|-------|----------|--------|------------------------------|
| 1         | Alice | 101      | 50.00  | matched                      |
| 2         | Bob   | 102      | 30.00  | matched                      |
| 3         | Carol | NULL     | NULL   | user with no orders          |
| 99        | NULL  | 103      | 20.00  | orphan order — no matching user |

In MySQL, the UNION ALL emulation produces the exact same four rows. Part 1 LEFT JOIN emits Alice+101, Bob+102, and Carol+NULL. Part 2 anti-join emits only the order where u.id IS NULL after the join — that is the 99/103 orphan. UNION ALL concatenates them without deduplication.

## 5. Edge Cases — The Ones That Break Naive Solutions

**Both tables empty.** FULL OUTER JOIN of two empty tables returns zero rows, not one row of NULLs. Naive code that expects a placeholder row will misbehave. If you need a report that always returns at least one row for UI purposes, wrap it with application logic, not by relying on the join to invent a row.

**Asking for the key without COALESCE.** Writing SELECT u.id, o.id instead of SELECT COALESCE(u.id, o.user_id) means orphan rows have a NULL identifier. For order 103, u.id is NULL and o.user_id is 99 — without COALESCE you lose the 99 and the report says there is an orphan but not which user_id it belongs to. Always COALESCE the join key in the SELECT list when you use an outer join.

**Duplicate keys cause fanout.** If users had a duplicate id or orders had two rows with user_id = 1, FULL OUTER JOIN multiplies them. Two orders for Alice would produce two rows both showing Alice, each with a different order_id. If you then SUM(amount) you will count Alice twice. When the join key is not unique, pre-aggregate first in a CTE and then outer join the aggregates.

```sql
WITH orders_per_user AS (
    SELECT user_id, COUNT(*) AS order_count, SUM(amount) AS total_amount
    FROM orders GROUP BY user_id
)
SELECT COALESCE(u.id, o.user_id) AS person_id, u.name, o.order_count, o.total_amount
FROM users u FULL OUTER JOIN orders_per_user o ON u.id = o.user_id;
```

**A WHERE filter that silently turns the outer join into an inner join.** This is the most common production bug. After a FULL OUTER JOIN, right-only and left-only rows have NULLs on the opposite side. If you then write WHERE o.amount > 40, that predicate evaluates to UNKNOWN for every row where o.amount is NULL, and UNKNOWN is filtered out. Carol with no orders disappears and the orphan order with no user disappears if you filter on u.name. The outer join just became an inner join without any error.

```sql
-- Broken: kills NULL-padded rows, outer join collapses to inner
SELECT * FROM users u FULL OUTER JOIN orders o ON u.id = o.user_id
WHERE o.amount > 40;

-- Fixed: move the filter into the ON clause so it applies before padding
SELECT * FROM users u FULL OUTER JOIN orders o ON u.id = o.user_id AND o.amount > 40;

-- Or keep it in WHERE but explicitly preserve NULL-padded rows
SELECT * FROM users u FULL OUTER JOIN orders o ON u.id = o.user_id
WHERE o.amount > 40 OR o.amount IS NULL;
```

**Three-valued logic with <> and amount comparisons.** In reconciliation queries, writing CASE WHEN b.amount <> l.amount before checking IS NULL is fragile. NULL <> anything is UNKNOWN, not TRUE, so the branch does not fire the way you expect for missing rows. Always check WHEN b.id IS NULL or WHEN l.id IS NULL first, then compare values only when both exist.

**Collation or type mismatches on the join key.** Joining a VARCHAR id with case-sensitive collation against a case-insensitive one means 'txn-101' and 'TXN-101' do not match. The join will produce two orphan rows instead of one matched row. Standardize with LOWER or a normalized key, or fix the type at ingestion.

## 6. Variations and Follow-ups

**Exclusive FULL OUTER JOIN — only the mismatches, no matched rows.** The interviewer often follows up with find rows that exist on only one side. You keep the FULL OUTER JOIN and add WHERE one side is NULL. This is the anti-join on both sides at once, sometimes called the exclusive outer join.

```sql
-- Only users with no orders plus only orders with no user
SELECT COALESCE(u.id, o.user_id) AS person_id, u.name, o.id AS order_id, o.amount
FROM users u FULL OUTER JOIN orders o ON u.id = o.user_id
WHERE u.id IS NULL OR o.id IS NULL;
```

Result on our data is two rows: Carol with NULL order, and the 99/103 orphan. Matched Alice and Bob are excluded. Complexity stays O(N + M). In MySQL you already have the exclusive result as the second half of the UNION — just run that half alone.

**Exception-only audit for reconciliation.** Same idea with a value mismatch added — show only rows that need human attention. This is the variation that uses WHERE b.id IS NULL OR l.id IS NULL OR b.amount <> l.amount after the FULL OUTER JOIN, filtering out every reconciled row.

**Count the gap instead of listing it.** Follow-up: how many users have never ordered, how many orphan orders exist.

```sql
SELECT
    COUNT(*) FILTER (WHERE o.id IS NULL) AS users_without_orders,
    COUNT(*) FILTER (WHERE u.id IS NULL) AS orphan_orders,
    COUNT(*) FILTER (WHERE u.id IS NOT NULL AND o.id IS NOT NULL) AS matched_pairs
FROM users u FULL OUTER JOIN orders o ON u.id = o.user_id;
```

In MySQL replace COUNT FILTER with SUM(CASE WHEN ... THEN 1 ELSE 0 END).

**What if I need distinct counts after duplicates.** Interviewers will ask what changes if user_id is not unique. Answer: the join fans out, so counts and sums without pre-aggregation are wrong. Fix by aggregating before the join as shown in the edge cases section, then outer join the aggregates. Complexity becomes O(N log N + M log M) for the GROUP BY plus O(N + M) for the join.

**FULL OUTER JOIN of three tables.** Chain them and cascade COALESCE: FULL OUTER JOIN table C ON COALESCE(a.key, b.key) = c.key. Every new table adds another FULL OUTER JOIN and another COALESCE layer. Mention that performance degrades quickly and that at three or more sources you usually switch to UNION ALL of normalized CTEs instead of chaining outer joins.

## 7. 🧠 The Memory Hook

FULL OUTER JOIN is keep everybody. INNER keeps only the overlap, LEFT keeps all of one side, FULL keeps all of both sides and writes NULL wherever a partner is missing. If the database is MySQL, there is no FULL — you build it yourself: LEFT JOIN to keep the left plus UNION ALL the anti-join that keeps only the right orphans. And never put a WHERE filter on an outer-joined column without remembering it will kill the NULLs you just asked to keep.
