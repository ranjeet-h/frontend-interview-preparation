# Write a Query Using `FULL OUTER JOIN` in SQL: Total Union, MySQL Emulation, and Data Reconciliation

## 1. What the Interviewer Is Really Testing

When an interviewer asks for a `FULL OUTER JOIN`, they are evaluating your ability to handle bidirectional data reconciliation, missing relational keys, and database dialect limitations. Specifically, they are testing:

- **Complete Set Union Semantics ($A \cup B$)**: Demonstrating that you know how to preserve all records from both Table A and Table B in a single result set. Matched records are merged into the same row, while unmatched records from either side are retained and padded with `NULL`s for the missing side.
- **Data Reconciliation and Discrepancy Auditing**: Writing queries that compare two disparate sources of truth (such as third-party payment gateway statements versus internal ledger entries) to isolate matched transactions, missing entries on either side, and value mismatches in a single pass.
- **The MySQL `FULL OUTER JOIN` Absence**: Recognizing that MySQL (even in versions 8.0 through 8.4+) does not support the `FULL OUTER JOIN` or `FULL JOIN` syntax. A senior engineer must immediately know how to emulate it using `LEFT JOIN` combined with a filtered `UNION ALL` anti-join.
- **Defensive Handling of `NULL` and Three-Valued Logic**: Using `COALESCE` to prevent missing primary keys in the projection and structuring `CASE` statements to avoid unexpected evaluation bugs caused by SQL's `UNKNOWN` truth value when comparing nullable columns.

---

## 2. Think Before You Code — The Senior Dev Thought Process

When presented with a data reconciliation problem, an experienced developer analyzes the data flow and dialect constraints before typing a single clause:

### Deconstructing the Problem
Suppose we have two systems tracking payments: `bank_transactions` (the external bank's record) and `ledger_records` (our internal accounting system). Both tables contain an `id` and an `amount`. We need to generate a single reconciliation report that compares every record across both tables and classifies each into one of four states:
1. `Reconciled`: Exists in both tables and amounts match.
2. `Amount Mismatch`: Exists in both tables, but amounts differ.
3. `Missing in Bank`: Exists in our internal ledger, but the bank has no record of it.
4. `Missing in Ledger`: The bank processed it, but our internal system never recorded it.

### Why Other Joins Fail
- **`INNER JOIN`**: Drops all unmatched rows. If a transaction exists in the bank but is missing in the ledger, an inner join silently discards it—hiding the exact financial anomaly we need to catch.
- **`LEFT JOIN`**: Preserves all bank transactions, but completely drops ledger records that failed to post to the bank.
- **`UNION` / `UNION ALL`**: Stacks rows vertically. It requires identical column structures and does not align matching IDs side-by-side on the same row to compare their amounts.

### The Architectural Choice
We need side-by-side column alignment for matching keys, plus row preservation for unmatched keys on both sides. This is the exact definition of a Full Outer Join.

```txt
Table A (Bank)            Table B (Ledger)
+---------+--------+      +---------+--------+
|   id    | amount |      |   id    | amount |
+---------+--------+      +---------+--------+
| TXN-101 | 500.00 | <--> | TXN-101 | 500.00 | -> Match & Amount Match ('Reconciled')
| TXN-102 | 120.50 | <--> | TXN-102 | 150.00 | -> Match & Amount Mismatch ('Amount Mismatch')
| TXN-104 | 300.00 |      | (none)  | (none) | -> Bank Only ('Missing in Ledger')
| (none)  | (none) |      | TXN-105 | 990.00 | -> Ledger Only ('Missing in Bank')
+---------+--------+      +---------+--------+
```

### Dialect Strategy
- If running on **PostgreSQL, SQL Server, Oracle, or SQLite (3.39+)**: Use standard `FULL OUTER JOIN`.
- If running on **MySQL**: Emulate using `LEFT JOIN` concatenated with `RIGHT JOIN ... WHERE b.id IS NULL` via `UNION ALL`. `UNION ALL` is chosen over `UNION` because the two subsets are mathematically disjoint, eliminating the need for an expensive temporary-table sort and deduplication pass.

---

## 3. The Solution — Fully Explained Code

### Schema Definition

```sql
-- Table A: Bank Transactions (External Source)
CREATE TABLE bank_transactions (
    id VARCHAR(32) PRIMARY KEY,
    amount NUMERIC(12, 2) NOT NULL,
    transacted_at TIMESTAMP NOT NULL
);

-- Table B: Ledger Records (Internal Accounting)
CREATE TABLE ledger_records (
    id VARCHAR(32) PRIMARY KEY,
    amount NUMERIC(12, 2) NOT NULL,
    recorded_at TIMESTAMP NOT NULL
);
```

### Solution 1: Standard ANSI SQL (PostgreSQL, SQL Server, Oracle, SQLite 3.39+)

```sql
SELECT
    -- Use COALESCE so we always get a valid ID regardless of which side is missing
    COALESCE(b.id, l.id) AS record_id,
    b.amount AS bank_amount,
    l.amount AS ledger_amount,
    CASE
        -- Check NULL keys first to safely identify single-sided records
        WHEN b.id IS NULL THEN 'Missing in Bank'
        WHEN l.id IS NULL THEN 'Missing in Ledger'
        -- When both IDs exist, compare the monetary amounts
        WHEN b.amount <> l.amount THEN 'Amount Mismatch'
        ELSE 'Reconciled'
    END AS status
FROM bank_transactions b
FULL OUTER JOIN ledger_records l
    ON b.id = l.id
ORDER BY record_id;
```

### Solution 2: MySQL Emulation Pattern (MySQL 5.7, 8.0, 8.4+)

Because MySQL does not implement `FULL OUTER JOIN`, we combine a standard `LEFT JOIN` (which produces all bank records plus matched ledger records) with an **anti-join** (which selects only ledger records that have no corresponding bank entry).

```sql
-- Step 1: All bank transactions + matching ledger records (or NULL if unmatched)
SELECT
    COALESCE(b.id, l.id) AS record_id,
    b.amount AS bank_amount,
    l.amount AS ledger_amount,
    CASE
        WHEN l.id IS NULL THEN 'Missing in Ledger'
        WHEN b.amount <> l.amount THEN 'Amount Mismatch'
        ELSE 'Reconciled'
    END AS status
FROM bank_transactions b
LEFT JOIN ledger_records l
    ON b.id = l.id

UNION ALL

-- Step 2: ONLY ledger records that have NO matching bank transaction (Anti-Join)
SELECT
    l.id AS record_id,
    NULL AS bank_amount,
    l.amount AS ledger_amount,
    'Missing in Bank' AS status
FROM ledger_records l
LEFT JOIN bank_transactions b
    ON l.id = b.id
WHERE b.id IS NULL;
```

### Complexity and Performance Analysis

- **Time Complexity**:
  - **Standard `FULL OUTER JOIN` (Hash Full Join)**: $O(N + M)$ time, where $N$ is the number of rows in `bank_transactions` and $M$ is the number of rows in `ledger_records`. The query engine builds an in-memory hash table on the smaller table, scans the larger table to emit matches and right-only rows, and then sweeps the hash table to emit unmatched left rows.
  - **Merge Full Join**: $O(N + M)$ if both tables are pre-sorted via a clustered index on `id`. If sorting is required, it takes $O(N \log N + M \log M)$.
  - **MySQL Emulation (`UNION ALL`)**: $O(N \log M + M \log N)$ when join keys are backed by B-Tree indexes. Using `UNION ALL` avoids a costly $O((N + M) \log(N + M))$ distinct sort step.
- **Space Complexity**:
  - $O(\min(N, M))$ memory buffer required by the database engine to maintain the in-memory hash table or stream buffers during query execution.

---

## 4. Dry Run — Walk Through a Real Example

### Sample Input Data

**`bank_transactions` (Table A)**

| id | amount | transacted_at |
| :--- | :--- | :--- |
| `TXN-101` | `500.00` | `2026-03-01 10:00:00` |
| `TXN-102` | `120.50` | `2026-03-01 11:30:00` |
| `TXN-103` | `75.00` | `2026-03-01 14:15:00` |
| `TXN-104` | `300.00` | `2026-03-01 16:00:00` |

**`ledger_records` (Table B)**

| id | amount | recorded_at |
| :--- | :--- | :--- |
| `TXN-101` | `500.00` | `2026-03-01 09:59:50` |
| `TXN-102` | `150.00` | `2026-03-01 11:28:00` |
| `TXN-103` | `75.00` | `2026-03-01 14:10:00` |
| `TXN-105` | `990.00` | `2026-03-01 18:00:00` |

---

### Step-by-Step Join Execution Trace

1. **Evaluate `TXN-101`**:
   - `b.id = 'TXN-101'`, `l.id = 'TXN-101'`.
   - `COALESCE('TXN-101', 'TXN-101')` $\rightarrow$ `'TXN-101'`.
   - Both IDs are non-null. `b.amount` (`500.00`) equals `l.amount` (`500.00`).
   - Evaluates to `ELSE 'Reconciled'`.

2. **Evaluate `TXN-102`**:
   - `b.id = 'TXN-102'`, `l.id = 'TXN-102'`.
   - Both IDs are non-null. `b.amount` (`120.50`) $\neq$ `l.amount` (`150.00`).
   - Condition `b.amount <> l.amount` evaluates to `TRUE`.
   - Evaluates to `'Amount Mismatch'`.

3. **Evaluate `TXN-103`**:
   - `b.id = 'TXN-103'`, `l.id = 'TXN-103'`.
   - Both IDs are non-null. `b.amount` (`75.00`) equals `l.amount` (`75.00`).
   - Evaluates to `ELSE 'Reconciled'`.

4. **Evaluate `TXN-104`**:
   - Exists only in `bank_transactions`.
   - `b.id = 'TXN-104'`, `l.id = NULL`, `l.amount = NULL`.
   - `COALESCE('TXN-104', NULL)` $\rightarrow$ `'TXN-104'`.
   - Condition `l.id IS NULL` evaluates to `TRUE`.
   - Evaluates to `'Missing in Ledger'`.

5. **Evaluate `TXN-105`**:
   - Exists only in `ledger_records`.
   - `b.id = NULL`, `b.amount = NULL`, `l.id = 'TXN-105'`.
   - `COALESCE(NULL, 'TXN-105')` $\rightarrow$ `'TXN-105'`.
   - Condition `b.id IS NULL` evaluates to `TRUE`.
   - Evaluates to `'Missing in Bank'`.

---

### Final Output Set

| record_id | bank_amount | ledger_amount | status |
| :--- | :--- | :--- | :--- |
| `TXN-101` | `500.00` | `500.00` | `Reconciled` |
| `TXN-102` | `120.50` | `150.00` | `Amount Mismatch` |
| `TXN-103` | `75.00` | `75.00` | `Reconciled` |
| `TXN-104` | `300.00` | `NULL` | `Missing in Ledger` |
| `TXN-105` | `NULL` | `990.00` | `Missing in Bank` |

---

## 5. Edge Cases — The Ones That Break Naive Solutions

### 1. Selecting `b.id` Directly Instead of `COALESCE(b.id, l.id)`
- **The Trap**: Writing `SELECT b.id AS record_id, ...`.
- **The Failure**: For rows that exist exclusively in `ledger_records` (like `TXN-105`), `b.id` is `NULL`. The reconciliation report outputs `NULL` as the transaction identifier, masking which ledger entry is broken.
- **The Fix**: Always project `COALESCE(b.id, l.id)` (or `COALESCE(left.key, right.key)`).

### 2. Three-Valued Logic in Comparison Predicates
- **The Trap**: Ordering the `CASE` statement with `WHEN b.amount <> l.amount THEN ...` before checking `WHEN b.id IS NULL`.
- **The Failure**: In SQL, comparing any value to `NULL` (e.g., `NULL <> 990.00`) evaluates to `UNKNOWN`, not `TRUE` or `FALSE`. If the query relies on negation or incorrect branching, missing records might fall through to unexpected branches.
- **The Fix**: Always check for `IS NULL` on join keys first before comparing attribute values.

### 3. Floating-Point Inaccuracies in Amount Comparisons
- **The Trap**: Storing monetary values as `FLOAT` or `DOUBLE PRECISION` and using `<>`.
- **The Failure**: Floating-point representation errors (e.g., `19.990000000000002` vs `19.99`) cause false-positive `'Amount Mismatch'` statuses on perfectly matching records.
- **The Fix**: Use fixed-point `NUMERIC(12, 2)` or `DECIMAL` types for currency, or use an explicit delta threshold: `ABS(b.amount - l.amount) > 0.001`.

### 4. Duplicate Keys and Cartesian Fanout
- **The Trap**: Running a `FULL OUTER JOIN` on tables where the join key is not unique (e.g., multiple ledger adjustments referencing the same bank transaction ID).
- **The Failure**: A 1-to-many relationship generates $1 \times K$ rows, duplicating the bank transaction amount across multiple rows and distorting sum aggregations.
- **The Fix**: Pre-aggregate records by key using Common Table Expressions (CTEs) before performing the outer join:

```sql
WITH agg_ledger AS (
    SELECT id, SUM(amount) AS total_amount
    FROM ledger_records
    GROUP BY id
)
SELECT
    COALESCE(b.id, l.id) AS record_id,
    b.amount AS bank_amount,
    l.total_amount AS ledger_amount
FROM bank_transactions b
FULL OUTER JOIN agg_ledger l
    ON b.id = l.id;
```

### 5. Collation and Case-Sensitivity Mismatches
- **The Trap**: Joining string-based IDs across databases or tables with differing collations (e.g., case-sensitive `latin1_general_cs` vs case-insensitive `utf8mb4_unicode_ci`).
- **The Failure**: `txn-101` and `TXN-101` fail to match, producing two orphan rows instead of one reconciled row.
- **The Fix**: Standardize identifiers at ingestion or join using normalized expressions: `ON LOWER(b.id) = LOWER(l.id)`.

---

## 6. Variations and Follow-ups

### Variation 1: The Exception-Only Audit Query (Finding Discrepancies)
**Question**: *"How do you modify the query so it returns only the rows that need human intervention, filtering out all successfully reconciled records?"*

**Answer**: Add a `WHERE` clause filtering for rows where either table is missing or their amounts do not match:

```sql
SELECT
    COALESCE(b.id, l.id) AS record_id,
    b.amount AS bank_amount,
    l.amount AS ledger_amount,
    CASE
        WHEN b.id IS NULL THEN 'Missing in Bank'
        WHEN l.id IS NULL THEN 'Missing in Ledger'
        ELSE 'Amount Mismatch'
    END AS discrepancy_type
FROM bank_transactions b
FULL OUTER JOIN ledger_records l
    ON b.id = l.id
WHERE b.id IS NULL
   OR l.id IS NULL
   OR b.amount <> l.amount;
```

---

### Variation 2: Three-Way System Reconciliation
**Question**: *"Suppose we need to reconcile three systems simultaneously: Payment Gateway (`stripe_charges`), Bank Account (`bank_txns`), and Internal Ledger (`ledger_entries`). How do you structure this?"*

**Answer**: Chain multiple `FULL OUTER JOIN` operations sequentially, cascading `COALESCE` across all three tables for the consolidated key:

```sql
SELECT
    COALESCE(s.id, b.id, l.id) AS transaction_id,
    s.amount AS stripe_amount,
    b.amount AS bank_amount,
    l.amount AS ledger_amount,
    CASE
        WHEN s.id IS NOT NULL AND b.id IS NOT NULL AND l.id IS NOT NULL
             AND s.amount = b.amount AND b.amount = l.amount THEN 'Fully Reconciled'
        ELSE 'Discrepancy Detected'
    END AS audit_status
FROM stripe_charges s
FULL OUTER JOIN bank_transactions b
    ON s.id = b.id
FULL OUTER JOIN ledger_records l
    ON COALESCE(s.id, b.id) = l.id;
```

---

## 7. 🧠 The Memory Hook

Think of `FULL OUTER JOIN` as a **Venn diagram zipper**:
- It **zips** matching elements together into a single row.
- For anything left over on the left or right, it **pads the empty slot with `NULL`**.
- Always remember: **MySQL has no zipper**—you have to stitch a `LEFT JOIN` to a `RIGHT JOIN ... WHERE IS NULL` anti-join using `UNION ALL`.
