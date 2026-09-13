# Write a Query to Update Records Using Join in SQL

## 1. What the Interviewer Is Really Testing

Updating records in one table based on criteria or values from another table looks like a basic syntax check on the surface. In reality, senior interviewers use this problem to evaluate three critical database engineering competencies:

First, **dialect divergence and standard compliance**. While `SELECT` statements are largely standardized across relational database management systems, multi-table `UPDATE` syntax is notoriously fragmented. MySQL supports direct `UPDATE ... JOIN` syntax, PostgreSQL rejects `JOIN` entirely in favor of `UPDATE ... FROM`, SQL Server uses a proprietary `UPDATE target FROM source JOIN` dialect, and ANSI SQL relies on correlated subqueries. Assuming all SQL engines share identical write semantics reveals a lack of multi-database production experience.

Second, **the 1:N cardinality update hazard (non-deterministic updates)**. When a parent row matches multiple rows in the joined table, a `SELECT` query simply returns multiple rows. But an `UPDATE` statement must write a single, concrete set of bytes to a physical disk page. How does the engine decide which child row's value to apply? MySQL and PostgreSQL pick an arbitrary matching row non-deterministically, leading to silent data corruption, while ANSI correlated subqueries fail at runtime with cardinality violation errors. Interviewers want to see whether you proactively verify table relationships and aggregate 1:N data before attempting a join update.

Third, **concurrency, locking blast radius, and defense**. Updating via joins requires acquiring exclusive row locks (`X-locks`) on target rows while reading and locking secondary tables. If two transactions join the same tables in reverse order or scan large unindexed datasets, the update escalates lock contention and triggers deadlocks. A strong candidate demonstrates defensive SQL habits: scoping `WHERE` conditions strictly, preventing null-coercion bugs, and avoiding accidental full-table overwrites.

## 2. Think Before You Code — The Senior Dev Thought Process

When faced with updating a table based on another table, here is how an experienced engineer breaks down the problem:

The first question to ask is: **What engine is this query running on, and what is the relationship between these two tables?**

Suppose the requirement is: "Deduct promotional discount amounts from active customer account balances based on their discount tier."

If the database is MySQL, the natural instinct is to write an `INNER JOIN` directly into the `UPDATE` clause:
`UPDATE accounts a INNER JOIN discounts d ON a.tier_id = d.tier_id SET a.balance = a.balance - d.amount WHERE d.is_active = 1;`

If the database is PostgreSQL, that exact query crashes immediately with a syntax error because PostgreSQL does not support `JOIN` after `UPDATE`. In Postgres, the syntax shifts to:
`UPDATE accounts a SET balance = a.balance - d.amount FROM discounts d WHERE a.tier_id = d.tier_id AND d.is_active = true;`

Notice the critical PostgreSQL syntax trap: the target table column in the `SET` clause must never be prefixed with a table alias (`SET balance = ...`, not `SET a.balance = ...`), and the target table must never be repeated in the `FROM` list. Repeating `accounts` in the `FROM` list produces an accidental cross product (Cartesian join) that updates every row against every row.

Next, examine the data model cardinality:
- If each `tier_id` maps to exactly one active discount row (1:1 or N:1), the direct join/from update is safe.
- If a tier can have multiple active discounts (1:N), updating `balance = balance - d.amount` will not sum the discounts. Instead, the database will pick one discount row at random, apply it once, and discard the rest. To handle 1:N relationships correctly, the child table must be aggregated with `GROUP BY` inside a subquery or Common Table Expression (CTE) before joining.

Finally, consider the ANSI standard correlated subquery approach. If portability across SQLite, Oracle, PostgreSQL, and MySQL is required:
`UPDATE accounts SET balance = balance - (SELECT amount FROM discounts WHERE ...) WHERE EXISTS (SELECT 1 FROM discounts WHERE ...);`

Why is the `WHERE EXISTS` clause mandatory here? Without it, any account whose tier has no active discount evaluates the subquery to `NULL`. In SQL arithmetic, `balance - NULL` equals `NULL`, which silently wipes out the balance for every non-discounted customer in the entire table.

## 3. The Solution — Fully Explained Code

Below are the production solutions across the major SQL dialects, followed by the aggregated 1:N pattern and complexity characteristics.

**Schema Context:**
- `accounts (account_id INT PRIMARY KEY, tier_id VARCHAR(10), balance DECIMAL(10,2))`
- `discounts (tier_id VARCHAR(10), amount DECIMAL(10,2), is_active BOOLEAN)`

**Solution 1: MySQL Multi-Table Update Syntax**

```sql
-- MySQL allows explicit JOIN clauses directly within the UPDATE statement.
UPDATE accounts a
INNER JOIN discounts d
  ON a.tier_id = d.tier_id
SET a.balance = a.balance - d.amount
WHERE d.is_active = 1;
```

How it works:
- `UPDATE accounts a` identifies the target table to be modified, assigning alias `a`.
- `INNER JOIN discounts d ON a.tier_id = d.tier_id` matches accounts to discount tiers. Unmatched accounts are excluded from the candidate update set.
- `SET a.balance = a.balance - d.amount` recalculates the new balance using columns from both joined tables.
- `WHERE d.is_active = 1` filters the joined rows so only active discounts are applied.

**Solution 2: PostgreSQL `UPDATE ... FROM` Syntax**

```sql
-- PostgreSQL uses a FROM clause to bring in secondary tables.
UPDATE accounts a
SET balance = a.balance - d.amount
FROM discounts d
WHERE a.tier_id = d.tier_id
  AND d.is_active = true;
```

How it works:
- `UPDATE accounts a` declares the primary table being updated.
- `SET balance = ...` specifies the target column. In PostgreSQL, column names on the left side of the assignment must be unqualified (writing `a.balance =` throws a syntax error).
- `FROM discounts d` introduces the joined source table.
- `WHERE a.tier_id = d.tier_id AND d.is_active = true` establishes both the join predicate and the active status filter.

**Solution 3: ANSI SQL Correlated Subquery (Engine-Agnostic & Portable)**

```sql
-- ANSI Standard: Portable across SQLite, Oracle, SQL Server, MySQL, and PostgreSQL.
UPDATE accounts
SET balance = balance - (
  SELECT d.amount
  FROM discounts d
  WHERE d.tier_id = accounts.tier_id
    AND d.is_active = true
)
WHERE EXISTS (
  SELECT 1
  FROM discounts d
  WHERE d.tier_id = accounts.tier_id
    AND d.is_active = true
);
```

How it works:
- The scalar subquery inside `SET` computes the exact discount amount for the current account's tier.
- The outer `WHERE EXISTS (...)` ensures that only accounts matching an active discount are updated. If an account has no active discount, it is skipped entirely rather than being updated to `NULL`.

**Solution 4: The 1:N Aggregation Pattern (Summing Multiple Matching Rows)**

When a tier has multiple active discounts that must all be deducted, join against a pre-aggregated subquery:

```sql
-- PostgreSQL / MySQL subquery join for 1:N relationships
UPDATE accounts a
SET balance = a.balance - agg.total_discount
FROM (
  SELECT tier_id, SUM(amount) AS total_discount
  FROM discounts
  WHERE is_active = true
  GROUP BY tier_id
) agg
WHERE a.tier_id = agg.tier_id;
```

**Complexity Analysis:**
- **Time Complexity:** O(N + M) with a Hash Join or O(N log M) with an Index Nested Loop Join, where N is the number of rows in `accounts` and M is the number of rows in `discounts`. If `tier_id` is indexed on both tables, the database planner matches rows in near O(1) time per candidate row.
- **Space Complexity:** O(W) where W is the number of modified rows written to the database Write-Ahead Log (WAL) or Undo Log buffer within the active transaction. Memory overhead for in-flight hash tables depends on `work_mem` or engine buffer pool configuration.

## 4. Dry Run — Walk Through a Real Example

Let us trace the PostgreSQL `UPDATE ... FROM` query through a concrete dataset.

**Initial State:**

Table: `accounts`
| account_id | tier_id | balance |
|---|---|---|
| 101 | GOLD | 500.00 |
| 102 | SILVER | 300.00 |
| 103 | BRONZE | 150.00 |
| 104 | PLATINUM | 1000.00 |

Table: `discounts`
| tier_id | amount | is_active |
|---|---|---|
| GOLD | 50.00 | true |
| SILVER | 20.00 | true |
| BRONZE | 10.00 | false |
| DIAMOND | 100.00 | true |

**Step 1: Join and Filter Evaluation**
The engine evaluates the join condition `a.tier_id = d.tier_id AND d.is_active = true`:
- Account 101 (`tier_id = 'GOLD'`): Matches discount row `('GOLD', 50.00, true)`. Condition met. Candidate for update.
- Account 102 (`tier_id = 'SILVER'`): Matches discount row `('SILVER', 20.00, true)`. Condition met. Candidate for update.
- Account 103 (`tier_id = 'BRONZE'`): Matches discount row `('BRONZE', 10.00, false)`, but `is_active` is `false`. Condition fails. Excluded.
- Account 104 (`tier_id = 'PLATINUM'`): No corresponding row in `discounts`. Condition fails. Excluded.
- Discount row `('DIAMOND', 100.00, true)`: No corresponding account in `accounts`. Excluded.

**Step 2: Lock Acquisition and Tuple Modification**
- Account 101: Acquires exclusive row lock. Calculates `500.00 - 50.00 = 450.00`.
- Account 102: Acquires exclusive row lock. Calculates `300.00 - 20.00 = 280.00`.

**Step 3: Final Commit State**

Table: `accounts` (After Query Execution)
| account_id | tier_id | balance | Status Note |
|---|---|---|---|
| 101 | GOLD | **450.00** | Deducted 50.00 (Active Gold tier) |
| 102 | SILVER | **280.00** | Deducted 20.00 (Active Silver tier) |
| 103 | BRONZE | 150.00 | Unchanged (Bronze discount is inactive) |
| 104 | PLATINUM | 1000.00 | Unchanged (No platinum discount exists) |

## 5. Edge Cases — The Ones That Break Naive Solutions

**1. The 1:N Non-Deterministic Overwrite Trap**
If the `discounts` table contains two active rows for `'GOLD'` (`amount = 50.00` and `amount = 30.00`), a direct join does not subtract 80.00. In PostgreSQL, the official documentation states that when a target row matches more than one row in the `FROM` clause, only one source row is used to update the target row, and which one is chosen is non-deterministic. Account 101 becomes either 450.00 or 470.00 depending on storage layout and scan order. In MySQL, the engine executes repeated updates on the same row during the scan, leaving whichever row was processed last. Always use a pre-aggregated subquery (`GROUP BY tier_id`) whenever the joined table can have multiple matches.

**2. The Missing `WHERE EXISTS` Disaster in Correlated Updates**
Writing `UPDATE accounts SET balance = balance - (SELECT amount FROM discounts WHERE tier_id = accounts.tier_id);` without an outer `WHERE EXISTS` clause is an outage-level bug. When the engine evaluates account 104 (PLATINUM), the subquery returns zero rows, which evaluates to SQL `NULL`. Because `1000.00 - NULL = NULL`, account 104's balance is overwritten with `NULL`. Every customer without a discount loses their balance. Always attach `WHERE EXISTS` when using correlated subqueries in `UPDATE` statements.

**3. The PostgreSQL Self-Join Cartesian Explosion**
In PostgreSQL, developers transitioning from MySQL often write:
`UPDATE accounts a SET balance = a.balance - d.amount FROM accounts a2 JOIN discounts d ON a2.tier_id = d.tier_id;`
Including the target table `accounts` again in the `FROM` list causes PostgreSQL to treat `a` and `a2` as two independent table instances, creating a full Cartesian product. Every single row in `accounts` will be updated repeatedly against every matching row in `a2`, locking the entire table and producing corrupted values.

**4. `NULL` Values in Join Keys and Arithmetic Columns**
If an account has `tier_id = NULL`, the standard SQL equality `a.tier_id = d.tier_id` evaluates to `UNKNOWN`, safely skipping the row. However, if a discount record exists with `amount = NULL`, computing `a.balance - d.amount` results in `NULL`. Defend against nullable source columns by using `COALESCE(d.amount, 0)`.

**5. Deadlocks and Transaction Log Saturation on Huge Tables**
Executing a multi-table update across millions of rows locks large index ranges and table pages. If another concurrent background worker updates `discounts` or accesses `accounts` in a different key order, a database deadlock occurs. Furthermore, updating 5 million rows in a single query exhausts WAL space, spikes replication lag to read replicas, and risks rolling back hours of work on timeout. Large-scale updates must be chunked in batches using indexed primary keys (e.g., updating 5,000 rows per transaction with `WHERE account_id BETWEEN ? AND ?`).

## 6. Variations and Follow-ups

**Variation 1: Conditional Update — Different Values Per Row (CASE WHEN)**
Interviewers often follow up with "what if gold members get 15% off but silver gets 10%?" You do not write three separate updates. You put the logic in the SET with a CASE, still driven by the join.
```sql
-- MySQL: conditional amount inside UPDATE ... JOIN
UPDATE accounts a
INNER JOIN discounts d ON a.tier_id = d.tier_id
SET a.balance = CASE
  WHEN d.tier_id = 'GOLD' THEN a.balance - d.amount * 1.5
  WHEN d.tier_id = 'SILVER' THEN a.balance - d.amount
  ELSE a.balance
END
WHERE d.is_active = 1;

-- PostgreSQL: same logic with UPDATE ... FROM
UPDATE accounts a
SET balance = CASE
  WHEN d.tier_id = 'GOLD' THEN a.balance - d.amount * 1.5
  WHEN d.tier_id = 'SILVER' THEN a.balance - d.amount
  ELSE a.balance
END
FROM discounts d
WHERE a.tier_id = d.tier_id
  AND d.is_active = true;
```
You could also filter with WHERE instead of CASE when you want to skip rows entirely. CASE is for when every matched row stays matched but gets a different new value.

**Variation 2: Upsert — "Update If Exists, Insert If Not"**
"What if some tier adjustments come from a staging table and you need to create the account discount row when it does not exist?" That is not an UPDATE JOIN, that is an upsert. Do not force it through a join update.
```sql
-- PostgreSQL: INSERT ... ON CONFLICT DO UPDATE (requires a unique constraint on tier_id)
INSERT INTO account_discounts (account_id, tier_id, discount_applied)
SELECT a.account_id, a.tier_id, d.amount
FROM accounts a JOIN discounts d ON a.tier_id = d.tier_id
WHERE d.is_active = true
ON CONFLICT (account_id) DO UPDATE
SET discount_applied = EXCLUDED.discount_applied,
    updated_at = NOW();

-- MySQL: INSERT ... ON DUPLICATE KEY UPDATE
INSERT INTO account_discounts (account_id, tier_id, discount_applied)
SELECT a.account_id, a.tier_id, d.amount
FROM accounts a JOIN discounts d ON a.tier_id = d.tier_id
WHERE d.is_active = 1
ON DUPLICATE KEY UPDATE
  discount_applied = VALUES(discount_applied),
  updated_at = NOW();
```
Rule of thumb for the interview: if the question says "update existing rows based on another table" use UPDATE JOIN / UPDATE FROM. If it says "make sure every source row ends up in the target, updating the ones that already exist" say upsert and name the correct syntax for the dialect.

**Variation 3: Updating Based on a LEFT JOIN — When No Match Exists**
What if you want to set an account status to 'UNASSIGNED' if it has no corresponding discount row?
```sql
-- MySQL: LEFT JOIN directly in the update
UPDATE accounts a
LEFT JOIN discounts d ON a.tier_id = d.tier_id
SET a.status = 'UNASSIGNED'
WHERE d.tier_id IS NULL;

-- PostgreSQL / ANSI: clean NOT EXISTS version
UPDATE accounts a
SET status = 'UNASSIGNED'
WHERE NOT EXISTS (
  SELECT 1 FROM discounts d WHERE d.tier_id = a.tier_id
);
```
This is the mirror of the main pattern. The main pattern says "update where a match exists." This says "update where no match exists." Interviewers use it to check you know INNER JOIN skips non-matches and LEFT JOIN preserves them.

**Variation 4: Updating Two Tables Atomically and How the Planner Runs It**
MySQL lets you update two tables in one statement, Postgres does not.
```sql
-- MySQL: update two tables at once
UPDATE accounts a JOIN user_stats s ON a.user_id = s.user_id
SET a.balance = 0, s.is_flagged = 1
WHERE a.is_suspended = 1;

-- PostgreSQL: writable CTE for the same atomic effect
WITH updated_accounts AS (
  UPDATE accounts
  SET balance = 0
  WHERE is_suspended = true
  RETURNING user_id
)
UPDATE user_stats s
SET is_flagged = true
FROM updated_accounts ua
WHERE s.user_id = ua.user_id;
```
When you run EXPLAIN on any join update, the engine does three things underneath: it builds a join plan between target and source using available indexes (Nested Loop, Hash Join, or Merge Join), it collects the physical row identifiers for the target rows (CTID in Postgres, clustered key / RowID in MySQL InnoDB), then it takes exclusive row locks, writes before and after images to the WAL and undo log, and updates the heap and any indexes on changed columns. Knowing that sequence is how you explain why chunking large updates matters.

## 7. 🧠 The Memory Hook

**Postgres uses `FROM`, MySQL uses `JOIN`, ANSI uses `EXISTS`. And if one parent row matches multiple child rows, NEVER join directly — aggregate first, or the database gambles on which row wins.**
