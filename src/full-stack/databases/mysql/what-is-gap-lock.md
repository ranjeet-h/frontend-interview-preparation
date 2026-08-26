# Gap Locks in MySQL InnoDB: Mechanics, Phantom Read Prevention, and Concurrency Trade-offs

## 1. Why This Exists — The Problem First

Imagine you are running a financial reconciliation batch job in a banking system. Your transaction runs:

```sql
SELECT * FROM accounts WHERE balance > 1000 FOR UPDATE;
```

This query finds three qualifying accounts with IDs 10, 20, and 30. Your transaction locks those three rows so you can calculate audit totals and apply regulatory interest without anyone modifying them.

If the database engine only placed locks on those three specific physical rows (record locks), a massive problem occurs. While your transaction is still calculating, a concurrent user executes:

```sql
INSERT INTO accounts (id, balance) VALUES (25, 5000.00);
```

Because row 25 did not exist when you ran your query, no record lock existed to stop this insert. The insert succeeds and commits immediately. Seconds later, your transaction re-runs the query or executes an update across that range—and suddenly row 25 appears out of thin air inside the exact same transaction.

This is a classic **Phantom Read**: rows that did not exist during your initial locked read suddenly materialize mid-transaction, breaking repeatable read guarantees.

In MySQL replication, the problem gets even worse. Under statement-based replication (`binlog_format=STATEMENT`), SQL statements are written to the binary log in commit order. If the insert commits before your range transaction finishes, replicas execute the statements in a different relative order than the primary database, resulting in data drift between primary and replica nodes.

To solve this, InnoDB cannot just lock data that already exists. It must also lock the empty space where data *could* be inserted. That locked empty space is a **Gap Lock**.

However, gap locks introduce a heavy engineering trade-off: background scans and locks on secondary indexes routinely lock vast stretches of empty index space, blocking completely unrelated inserts and triggering confusing production deadlocks.

## 2. The Analogy — Make It Obvious

Think of a row lock like putting a physical padlock on an occupied locker in a gym locker room. If lockers #10, #20, and #30 are rented out, you lock those specific three lockers. Nobody else can open or modify them.

Now, imagine there is empty wall space between locker #10 and locker #20 where new lockers could potentially be built. 

A **Gap Lock** is like stringing bright caution tape across the empty wall space between #10 and #20 with a sign: *"Reserved Zone — No New Lockers Allowed Here."*

Here is how the moving parts map together:
- **Existing Lockers (#10, #20, #30):** The index records that currently exist in the B+ Tree.
- **Empty Wall Space between #10 and #20:** The gap between adjacent index records.
- **Caution Tape (Gap Lock):** A lock placed purely on the empty gap between keys. It does not lock locker #10 or locker #20; it only protects the empty span `(10, 20)`.
- **Security Guards Posting Caution Tape:** Multiple inspectors can place their own caution tape over the *exact same empty wall space* at the same time. Shared and exclusive gap locks do not block each other because their only goal is to keep the space empty.
- **A Contractor Wheelbarrowing in Locker #15 (Insert Intention Lock):** When someone tries to install a new locker in that empty space, the guard blocks the wheelbarrow until all caution tape is removed (the holding transactions commit or roll back).

## 3. How It Actually Works — The Full Explanation

In MySQL InnoDB, all locks are index-based locks. When InnoDB traverses a B+ Tree index during an explicit locking read (`FOR UPDATE` or `LOCK IN SHARE MODE`) or a write operation (`UPDATE` or `DELETE`), it evaluates index records and the spaces between them.

InnoDB uses three primary lock types on index entries:

1. **Record Lock:** Locks an exact, existing physical index record (e.g., lock row `id = 10`).
2. **Gap Lock:** Locks the open interval *between* two index records, or before the first record, or after the last record. It does not lock the boundary records themselves.
3. **Next-Key Lock:** A combination of a Gap Lock on the gap preceding the record plus a Record Lock on the record itself. It represents a half-open interval `(gap_start, record_value]`.

### Where Gaps Live in an Index

Suppose an index on column `id` contains values `[10, 20, 30]`. InnoDB divides the index space into four distinct intervals:

- `(-∞, 10)`: Gap before the first record.
- `(10, 20)`: Gap between 10 and 20.
- `(20, 30)`: Gap between 20 and 30.
- `(30, +∞)`: Gap after the last record. InnoDB implements this by placing a gap lock on a special system pseudo-record at the end of every index page called the `supremum` pseudo-record.

### The Gap Lock Compatibility Matrix

Gap locks have one of the most surprising compatibility rules in relational databases:

**Shared (S) gap locks and Exclusive (X) gap locks are functionally identical.**

In standard row locking, an exclusive lock (X) blocks other transactions from acquiring shared (S) or exclusive (X) locks on that row. But for gap locks, there is no conflict between S and X gap locks:

| Held Lock \ Requested Lock | S Gap Lock | X Gap Lock | Insert Intention Lock |
| :--- | :--- | :--- | :--- |
| **S Gap Lock** | Compatible | Compatible | **Blocked** |
| **X Gap Lock** | Compatible | Compatible | **Blocked** |
| **Insert Intention Lock** | Compatible | Compatible | Compatible |

Transaction A can hold an `X` gap lock on `(10, 20)` and Transaction B can hold an `X` gap lock on `(10, 20)` simultaneously. Neither transaction blocks the other.

Why? Because gap locks are purely *inhibitory against inserts*. Their only job is to stop other transactions from inserting into the gap. Transaction A holding a gap lock means "nobody insert here." Transaction B holding a gap lock also means "nobody insert here." Their intents do not conflict.

The only lock that a gap lock conflicts with is an **Insert Intention Lock**. An insert intention lock is a special type of gap lock requested by an `INSERT` operation before inserting a row, signaling its intent to place a record at a specific point in the gap. If any transaction holds a gap lock on that interval, the insert intention lock is blocked, forcing the `INSERT` to wait.

### When Gap Locks Are Created

Under InnoDB's default isolation level, `REPEATABLE READ`, gap locks (and next-key locks) are generated in several standard situations:

1. **Range Scans:** Any query with range predicates (`BETWEEN`, `>`, `<`, `>=`) that locks rows using `FOR UPDATE`, `LOCK IN SHARE MODE`, `UPDATE`, or `DELETE`.
2. **Locking Non-Existent Records on Unique Indexes:** If you execute `SELECT * FROM accounts WHERE id = 15 FOR UPDATE` on a primary key where `id = 15` does not exist (and surrounding IDs are 10 and 20), InnoDB cannot place a record lock on 15. Instead, it places a gap lock on `(10, 20)`. This guarantees no other transaction can insert `id = 15` while your transaction is open.
3. **Searches on Non-Unique Secondary Indexes:** When searching on a secondary index (like `WHERE status = 'pending' FOR UPDATE`), even an exact match must place next-key locks and gap locks on the secondary index. Because multiple rows can share the value `'pending'`, InnoDB must lock the gaps around matching records and the gap leading to the next distinct value to prevent new `'pending'` records from being inserted.

### When Gap Locks Are Skipped or Downgraded

InnoDB will skip or downgrade gap locks in two specific cases:

1. **Exact Matches on Unique Indexes / Primary Keys for Existing Rows:** If you run `SELECT * FROM accounts WHERE id = 20 FOR UPDATE` and row 20 exists, InnoDB knows that because `id` is unique, no second row with `id = 20` can ever be inserted. InnoDB optimizes this by downgrading the Next-Key Lock `(10, 20]` to a pure Record Lock on `20`. The gap `(10, 20)` is left completely unlocked.
2. **Non-Locking Consistent Reads:** Plain `SELECT` queries without locking clauses do not acquire any locks at all. They use Multi-Version Concurrency Control (MVCC) snapshot reads, reading undo logs rather than acquiring locks.

### How to Disable Gap Locks

In high-concurrency OLTP architectures, gap locks frequently cause lock contention and deadlocks. You can disable gap locking using two approaches:

1. **Switch to `READ COMMITTED` Isolation Level:** This is the industry-standard solution. Under `READ COMMITTED`, InnoDB disables gap locks for search and index scans. It locks only the actual index records matching the query filter. Gap locks are only retained for foreign key constraint validation and duplicate key checks.
2. **Set `innodb_locks_unsafe_for_binlog=1`:** A legacy MySQL parameter (deprecated and removed in newer versions) that disabled gap locks while keeping `REPEATABLE READ`. The modern, safe pattern is using `READ COMMITTED` paired with row-based replication (`binlog_format=ROW`).

## 4. Real Code — See It Working

Let us set up an accounts table and demonstrate gap locking, insert blocking, and a classic deadlock.

```sql
-- Schema setup
CREATE TABLE accounts (
    id INT PRIMARY KEY,
    user_id INT NOT NULL,
    balance DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    KEY idx_status (status)
) ENGINE=InnoDB;

-- Insert seed records (leaving gaps: (-∞, 10), (10, 20), (20, 30), (30, +∞))
INSERT INTO accounts (id, user_id, balance, status) VALUES 
(10, 101, 1500.00, 'active'),
(20, 102, 2500.00, 'active'),
(30, 103, 4000.00, 'suspended');
```

### Scenario A: Locking a Missing Record Blocks Nearby Inserts

Watch what happens when Session 1 queries a non-existent primary key:

```sql
-- SESSION 1: Search for missing record id = 15
START TRANSACTION;
SELECT * FROM accounts WHERE id = 15 FOR UPDATE;
-- Query returns Empty set (0.00 sec).
-- InnoDB places an Exclusive Gap Lock on interval (10, 20).
```

While Session 1 remains open, Session 2 attempts to insert a completely different ID:

```sql
-- SESSION 2: Attempt insert inside the locked gap (10, 20)
START TRANSACTION;
INSERT INTO accounts (id, user_id, balance, status) VALUES (14, 104, 800.00, 'active');
-- Result: BLOCKED! Session 2 hangs waiting for the Insert Intention Lock.
```

To see the lock in MySQL 8.0, query the performance schema from a third connection:

```sql
SELECT ENGINE_TRANSACTION_ID, OBJECT_NAME, INDEX_NAME, LOCK_TYPE, LOCK_MODE, LOCK_STATUS, LOCK_DATA 
FROM performance_schema.data_locks;
```

The output shows:
- Session 1 holds `LOCK_TYPE = 'RECORD'`, `LOCK_MODE = 'X,GAP'`, `LOCK_DATA = '20'`. (Meaning an X-gap lock on the space before record 20).
- Session 2 is waiting (`LOCK_STATUS = 'WAITING'`) with `LOCK_MODE = 'X,GAP,INSERT_INTENTION'`, `LOCK_DATA = '20'`.

```sql
-- SESSION 1: Commits
COMMIT;

-- SESSION 2: Instantly unblocks and completes
-- Query OK, 1 row affected (0.00 sec)
COMMIT;
```

### Scenario B: The Classic Gap Lock Deadlock

Because multiple transactions can hold gap locks on the same gap simultaneously, concurrent `SELECT ... FOR UPDATE` followed by `INSERT` is the most common source of application deadlocks.

```sql
-- Step 1: Session 1 checks if id = 15 exists before creating it
-- SESSION 1:
START TRANSACTION;
SELECT * FROM accounts WHERE id = 15 FOR UPDATE;
-- Empty set. Session 1 acquires Gap Lock on (10, 20).

-- Step 2: Session 2 simultaneously checks if id = 16 exists
-- SESSION 2:
START TRANSACTION;
SELECT * FROM accounts WHERE id = 16 FOR UPDATE;
-- Empty set. Session 2 ALSO acquires Gap Lock on (10, 20).
-- This succeeds immediately because X Gap Locks are compatible!

-- Step 3: Session 1 decides to insert id = 15
-- SESSION 1:
INSERT INTO accounts (id, user_id, balance, status) VALUES (15, 105, 300.00, 'active');
-- Result: BLOCKED! Session 1 requests an Insert Intention Lock on (10, 20),
-- but Session 2 holds a Gap Lock on that exact range.

-- Step 4: Session 2 decides to insert id = 16
-- SESSION 2:
INSERT INTO accounts (id, user_id, balance, status) VALUES (16, 106, 600.00, 'active');
-- Result: DEADLOCK DETECTED!
-- Session 2 needs an Insert Intention Lock on (10, 20), which is blocked by Session 1's Gap Lock.
-- Session 1 is waiting on Session 2; Session 2 is waiting on Session 1.
```

MySQL's background lock manager detects the cycle immediately and terminates one transaction:

```text
ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction
```

Session 1 unblocks and completes its insert, while Session 2 receives the deadlock exception and must roll back.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a gap lock, and why does InnoDB use it instead of just locking rows?**

A gap lock is a lock placed on the empty space *between* index records, or on the gap before the first record or after the last record in a B+ Tree index. InnoDB uses gap locks in `REPEATABLE READ` isolation to solve the phantom read problem and ensure binary log consistency for replication. If InnoDB only locked existing rows (record locks), another concurrent transaction could insert new rows matching a range query filter while the first transaction is still running. By locking the gap itself, InnoDB blocks any concurrent `INSERT` operations that would fall into that range.

**Q: Why does InnoDB allow two different transactions to hold exclusive (X) gap locks on the same gap simultaneously?**

Gap locks have a purely negative purpose: to prevent other transactions from inserting into a gap. An exclusive (X) gap lock does not prevent other transactions from reading, nor does it prevent them from holding their own gap lock on that same interval. Because Transaction A's gap lock means "keep this space empty" and Transaction B's gap lock also means "keep this space empty," their goals are completely aligned. The only lock that conflicts with a gap lock is an Insert Intention Lock.

**Q: When does MySQL InnoDB downgrade a Next-Key Lock to a pure Record Lock without a gap lock?**

InnoDB downgrades a Next-Key Lock to a pure Record Lock when querying with an exact equality condition (`WHERE column = value`) on a **Primary Key or Unique Index**, provided the target record actually exists. Because the index column is unique, it is mathematically impossible for a concurrent transaction to insert a second row with that same key value. Since no phantom duplicate could ever be inserted, locking the preceding gap is unnecessary, so InnoDB locks only the record itself. If the record does *not* exist, or if the index is a non-unique secondary index, the gap lock must be retained.

**Q: How does a gap lock lead to deadlocks during concurrent INSERT operations?**

The deadlock occurs because gap locks are compatible with each other, but incompatible with insert intention locks. When two concurrent transactions execute `SELECT ... WHERE id = non_existent_key FOR UPDATE`, both transactions successfully acquire a gap lock on the same range. When Transaction A subsequently attempts to `INSERT` a row into that range, it requests an Insert Intention Lock and is blocked by Transaction B's gap lock. When Transaction B then attempts to `INSERT` into the same range, it is blocked by Transaction A's gap lock. This creates an immediate circular wait condition (A waits for B, B waits for A), triggering InnoDB's deadlock detector to roll back one of the transactions.

**Q: How do you eliminate gap locks in a high-throughput production database without breaking data integrity?**

You eliminate gap locks by setting the transaction isolation level to `READ COMMITTED` (`SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;` or globally in `my.cnf`) and configuring the binary log format to `ROW` (`binlog_format=ROW`). Under `READ COMMITTED`, InnoDB disables gap locking for search and range scans, locking only the physical records matched by the query. Using row-based replication ensures replicas replicate exact row modifications rather than re-executing non-deterministic range statements, preserving data consistency across replicas.

**Q: Does a plain `SELECT ... FROM accounts WHERE balance > 1000` acquire gap locks in MySQL REPEATABLE READ?**

No. A standard `SELECT` statement in InnoDB is a non-locking consistent read. It uses Multi-Version Concurrency Control (MVCC) to read an isolated snapshot of the data from the undo logs based on the transaction's read view. It acquires zero locks—no record locks, no gap locks, and no next-key locks. Gap locks are only acquired by locking reads (`FOR UPDATE`, `LOCK IN SHARE MODE`) or data modification statements (`UPDATE`, `DELETE`, `INSERT`).

## 6. The Traps — What Goes Wrong

### Trap 1: Believing `FOR UPDATE` on a Missing Row is a Harmless No-Op

Developers often write code like:

```sql
-- Check if lock exists before inserting
SELECT * FROM distributed_locks WHERE lock_name = 'order_123' FOR UPDATE;
-- If empty, run INSERT INTO distributed_locks ...
```

If `lock_name = 'order_123'` does not exist, developers assume no lock is taken because zero rows returned. In reality, InnoDB locks the entire gap between the adjacent keys surrounding `'order_123'`. Any other thread trying to insert a lock with a name that alphabetically falls into that same gap gets blocked. Under high traffic, this serializes unrelated tasks and causes massive thread pool starvation.

### Trap 2: Believing Exclusive Gap Locks Prevent Other Transactions From Locking the Same Gap

Because standard `X` row locks are mutually exclusive, engineers assume an `X` gap lock gives them exclusive ownership of a range. They run `SELECT ... WHERE id = 15 FOR UPDATE` in two parallel workers, expecting the second worker to queue up. Instead, both workers acquire the gap lock instantly without waiting, and then both try to insert, triggering an immediate deadlock.

### Trap 3: Not Realizing Non-Unique Index Scans Lock Broad Ranges

When locking rows using a non-unique secondary index (such as `status` or `created_at`):

```sql
SELECT * FROM orders WHERE status = 'pending' LIMIT 1 FOR UPDATE;
```

InnoDB does not just lock the single row returned by `LIMIT 1`. It locks the matching index records, all gaps between them, and the gap extending to the next distinct value in the secondary index B+ Tree. Furthermore, it acquires record locks on the primary key for all inspected rows. This locks large swaths of the table from concurrent inserts.

### Trap 4: The Supremum Lock Blocking All Future Inserts

When you execute a range query that extends past the highest existing key in a table:

```sql
SELECT * FROM accounts WHERE id > 100 FOR UPDATE;
```

If the highest existing `id` is 30, InnoDB locks the gap `(30, +∞)` by placing a gap lock on the index's `supremum` pseudo-record. This locks all future inserts with an `id > 30` until the transaction commits, completely halting auto-increment or ascending ID inserts across the table.

### Trap 5: Assuming `READ COMMITTED` Eliminates All Possible Gap Locks

While `READ COMMITTED` disables gap locking for queries and updates, InnoDB still uses gap locks in `READ COMMITTED` during foreign key constraint validation and duplicate key error checks (such as `INSERT ... ON DUPLICATE KEY UPDATE` or unique index conflicts) to ensure referential integrity.

## 7. Compare With Related Concepts

### Gap Lock vs Record Lock
- **What is locked:** A Record Lock locks an existing physical index row. A Gap Lock locks the empty space *between* index rows.
- **Key difference:** Record locks prevent other transactions from updating or deleting that specific row. Gap locks only prevent other transactions from inserting a new row into the gap.
- **Rule of thumb:** If the row exists and you query by unique key, you get a Record Lock. If the row does not exist or you query a range, you get a Gap Lock.

### Gap Lock vs Next-Key Lock
- **What is locked:** A Gap Lock locks strictly the open interval `(A, B)`. A Next-Key Lock locks the gap *plus* the right-hand boundary record `(A, B]`.
- **Key difference:** A next-key lock blocks both inserts into the preceding gap and updates/deletes to the boundary record itself.
- **Rule of thumb:** InnoDB defaults to Next-Key Locks during range scans in `REPEATABLE READ`, which break down into a Gap Lock plus a Record Lock.

### Gap Lock vs Insert Intention Lock
- **What is locked:** A Gap Lock is held by reading/updating transactions to keep a range empty. An Insert Intention Lock is requested by an `INSERT` operation right before writing a new row into a gap.
- **Key difference:** Multiple transactions can hold gap locks on the same range concurrently. An insert intention lock cannot proceed if any gap lock exists on that range.
- **Rule of thumb:** Gap locks say "do not insert here"; insert intention locks say "I want to insert here."

### REPEATABLE READ vs READ COMMITTED Locking
- **Locking behavior:** `REPEATABLE READ` uses Gap Locks and Next-Key Locks to eliminate phantom reads. `READ COMMITTED` uses only Record Locks for queries and DML, eliminating gap locks on scans.
- **Key difference:** `REPEATABLE READ` provides snapshot isolation and prevents phantom reads at the cost of higher lock contention and deadlocks. `READ COMMITTED` maximizes concurrency and reduces deadlocks, but requires row-based replication (`binlog_format=ROW`).
- **Rule of thumb:** Use `READ COMMITTED` + `binlog_format=ROW` for high-throughput OLTP systems unless your application business logic strictly relies on database-enforced phantom read prevention.

## 8. 🧠 The Memory Hook

A record lock guards a chair; a gap lock ropes off the empty floor between chairs so nobody can place a new one. Two guards can watch the same empty floor without fighting, but the instant either tries to set a chair down, they crash into a deadlock.

