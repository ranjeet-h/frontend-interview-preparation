# Next-Key Locks in MySQL InnoDB: Record + Gap Locking, Range Protection, and Lock Downgrade Rules

## 1. Why This Exists — The Problem First

Imagine running a high-volume payment or order processing system on MySQL using the default isolation level (`REPEATABLE READ`). You initiate a transaction to process and reserve all pending orders in a given batch range:

```sql
SELECT * FROM orders WHERE order_id BETWEEN 100 AND 200 FOR UPDATE;
```

At that moment, only two orders exist in that range: order `105` and order `190`. Your mental model tells you: "I am running an exclusive row lock, so MySQL will lock row 105 and row 190. Other transactions are free to do whatever they want elsewhere."

A second later, a background worker attempts to insert a brand new order with ID `150`:

```sql
INSERT INTO orders (order_id, amount) VALUES (150, 49.99);
```

Order 150 did not exist when your first transaction started. It was not selected. It has no row data. Yet, the insert hangs indefinitely, freezes the worker thread, and eventually crashes with:

```text
ERROR 1205 (HY000): Lock wait timeout exceeded; try restarting transaction
```

Why does inserting into an empty, non-existent row get blocked by a query that only selected existing rows?

If a database engine only locked existing physical rows (Record Locks), a concurrent transaction could slip new rows into that scanned range and commit. If the first transaction ran the same `SELECT ... FOR UPDATE` again, new "phantom" rows would suddenly appear inside what was supposed to be an isolated, repeatable read transaction. Worse, in database replication using statement-based binary logging, replaying these transactions in parallel would cause replicas to diverge from the master, corrupting financial ledgers and inventory balances.

MySQL's InnoDB storage engine solves this phantom read and replication dilemma using **Next-Key Locks**. But because Next-Key Locks protect empty space alongside real records, developers who do not understand their exact boundaries constantly cause unexplained deadlocks and lock wait timeouts in production.

## 2. The Analogy — Make It Obvious

Think of a VIP valet parking lane where cars are parked at marked meter posts along a single-lane driveway. Currently, only three cars are parked: at meter #10, meter #20, and meter #30.

```txt
Driveway Entry ----[Gap: 1 to 9]---- (Car #10) ----[Gap: 11 to 19]---- (Car #20) ----[Gap: 21 to 29]---- (Car #30) ----[Gap: 31 to ∞]----> End Post (Supremum)
```

If a security guard wants to secure car #20, they have three choices:

1. **Record Lock**: Put a wheel clamp on Car #20. Other drivers can still pull into the empty asphalt in front of car #20 (meters 11 through 19).
2. **Gap Lock**: Place orange traffic cones across the empty driveway from meter #11 up to meter #19. No one can park in that empty stretch, but Car #20 itself is untouched.
3. **Next-Key Lock**: The guard places traffic cones across the entire driveway stretch leading up to car #20 (meters 11 to 19) **AND** clamps the wheel of Car #20 itself.

The Next-Key Lock secures the physical record plus the entire empty approach lane immediately preceding it. It is a half-open interval: `(10, 20]`. 

If someone tries to drive a new car into meter #15, they hit the cones and must wait. If someone tries to modify Car #20, they hit the wheel clamp and must wait. 

What about the empty asphalt after the last car (#30)? The garage has a special boundary post at the very end of the lot called the `supremum`. Placing cones from Car #30 to that end post secures the open gap `(30, +∞)`.

## 3. How It Actually Works — The Full Explanation

In InnoDB, locks are never placed on arbitrary table rows in memory; they are always placed directly on **index records** within the B+Tree.

The core formula of a Next-Key Lock is:

$$\text{Next-Key Lock} = \text{Record Lock} + \text{Gap Lock}$$

A **Record Lock** locks the index entry itself (preventing `UPDATE` or `DELETE`). A **Gap Lock** locks the gap between index records (preventing `INSERT`). A **Next-Key Lock** combines both to lock an index record and the gap on the index tree right before it.

The B+Tree key space is partitioned into half-open intervals. When an index contains values `5`, `10`, `15`, and `20`, the intervals are:

- $(-\infty, 5]$ — The gap before 5, plus record 5.
- $(5, 10]$ — The gap between 5 and 10, plus record 10.
- $(10, 15]$ — The gap between 10 and 15, plus record 15.
- $(15, 20]$ — The gap between 15 and 20, plus record 20.
- $(20, +\infty)$ — The gap after 20 up to the pseudo-record `supremum`.

Under the default `REPEATABLE READ` isolation level, whenever InnoDB performs a locking read (`SELECT ... FOR UPDATE`, `SELECT ... FOR SHARE`) or a write (`UPDATE`, `DELETE`), its default locking strategy is to apply Next-Key Locks to every index record it inspects along the B+Tree scan path.

To maximize concurrency, InnoDB automatically **downgrades** Next-Key Locks to narrower locks whenever mathematical uniqueness guarantees that phantom inserts are impossible.

Understanding these downgrade rules is essential for diagnosing lock contention:

**Rule 1: Unique Index or Primary Key with Exact Equality Match on an Existing Row**
- Example: `SELECT * FROM users WHERE id = 10 FOR UPDATE;` (where `id` is primary key, and row 10 exists).
- Mechanism: Because `id` is unique, no other transaction can insert another row with `id = 10`. Any attempt to insert `id = 10` would immediately fail with a duplicate key error regardless of locks. Therefore, locking the preceding gap `(5, 10)` is unnecessary to prevent phantoms.
- Result: InnoDB **downgrades** the Next-Key lock `(5, 10]` to a pure **Record Lock** on `[10]`. The gap `(5, 10)` remains unlocked. Another transaction can insert `id = 8` immediately without blocking.

**Rule 2: Unique Index with Exact Equality Match on a Non-Existent Row**
- Example: `SELECT * FROM users WHERE id = 7 FOR UPDATE;` (where rows 5 and 10 exist, but 7 does not).
- Mechanism: InnoDB searches the B+Tree for 7. It navigates past 5 and reaches the first index record greater than 7, which is 10. It initially places a Next-Key lock on `(5, 10]`. However, because the target key 7 does not exist, there is no physical record 7 to lock, and row 10 was not the target of the query.
- Result: InnoDB **downgrades** the Next-Key lock to a pure **Gap Lock** on `(5, 10)`. The physical record 10 is not locked (other transactions can update or delete row 10), but the gap `(5, 10)` is blocked so no one can insert `id = 7` before this transaction commits.

**Rule 3: Non-Unique Secondary Index (Equality Match)**
- Example: `SELECT * FROM users WHERE age = 25 FOR UPDATE;` (where `age` is a non-unique secondary index, with existing values 20, 25, 30).
- Mechanism: Because `age` is not unique, multiple users can have `age = 25`. Another transaction could easily insert a new user with `age = 25` right before or right after existing 25 records.
- Result: InnoDB places a **Next-Key Lock** on `(20, 25]` on the secondary index. Furthermore, to prevent inserts with `age = 25` that sort after existing 25 records, InnoDB scans forward to the next index record (30) and places an additional **Gap Lock** on `(25, 30)`. Finally, it places pure **Record Locks** on the primary key rows corresponding to all matched records.

**Rule 4: Range Scans (Unique or Secondary Indexes)**
- Example: `SELECT * FROM users WHERE id >= 10 AND id < 15 FOR UPDATE;`
- Mechanism: Range queries cannot downgrade to record locks because new rows could appear anywhere within the scanned range.
- Result: InnoDB locks all traversed intervals: `(5, 10]`, `(10, 15]`, and if the scan has to inspect record 20 to determine the range boundary, it locks the gap leading to 20 as well.

## 4. Real Code — See It Working

Let us set up a concrete table with both a primary key and a secondary index to inspect lock behavior directly via MySQL 8.0's `performance_schema.data_locks`.

```sql
CREATE TABLE accounts (
    id INT PRIMARY KEY,
    user_code INT NOT NULL,
    balance DECIMAL(10,2) NOT NULL,
    INDEX idx_user_code (user_code)
) ENGINE=InnoDB;

-- Insert records with distinct gaps in both keys
INSERT INTO accounts (id, user_code, balance) VALUES
(5,  100,  500.00),
(10, 200, 1000.00),
(15, 300, 1500.00),
(20, 400, 2000.00);
```

### Scenario A: Equality on Existing Primary Key (Downgrade to Record Lock)

```sql
-- Session 1:
START TRANSACTION;
SELECT * FROM accounts WHERE id = 10 FOR UPDATE;

-- Inspect active locks in another session:
SELECT 
    INDEX_NAME, 
    LOCK_TYPE, 
    LOCK_MODE, 
    LOCK_DATA 
FROM performance_schema.data_locks 
WHERE OBJECT_NAME = 'accounts';

-- Output:
-- INDEX_NAME | LOCK_TYPE | LOCK_MODE        | LOCK_DATA
-- PRIMARY    | RECORD    | X,REC_NOT_GAP    | 10
-- Explanation: 'X,REC_NOT_GAP' proves the Next-Key lock downgraded to a pure Record Lock.

-- Session 2: Insert into the gap (id = 8) succeeds immediately!
START TRANSACTION;
INSERT INTO accounts (id, user_code, balance) VALUES (8, 180, 750.00);
-- Query OK, 1 row affected (No blocking!)
COMMIT;

-- Clean up Session 1:
ROLLBACK;
```

### Scenario B: Equality on Non-Existent Primary Key (Downgrade to Gap Lock)

```sql
-- Session 1: Search for non-existent id = 12
START TRANSACTION;
SELECT * FROM accounts WHERE id = 12 FOR UPDATE;

-- Inspect active locks:
SELECT 
    INDEX_NAME, 
    LOCK_TYPE, 
    LOCK_MODE, 
    LOCK_DATA 
FROM performance_schema.data_locks 
WHERE OBJECT_NAME = 'accounts';

-- Output:
-- INDEX_NAME | LOCK_TYPE | LOCK_MODE | LOCK_DATA
-- PRIMARY    | RECORD    | X,GAP     | 15
-- Explanation: 'X,GAP' on LOCK_DATA 15 means the gap (10, 15) is locked.

-- Session 2: Attempting to insert id = 11 blocks!
START TRANSACTION;
INSERT INTO accounts (id, user_code, balance) VALUES (11, 220, 300.00);
-- BLOCKED! Waits until Session 1 commits or rolls back.

-- Session 3: Updating existing record 15 succeeds!
UPDATE accounts SET balance = 1600.00 WHERE id = 15;
-- Query OK, 1 row affected (Record 15 itself was NOT locked, only the preceding gap!)

-- Clean up:
ROLLBACK; -- Session 1
ROLLBACK; -- Session 2
```

### Scenario C: Equality on Non-Unique Secondary Index (Full Next-Key + Gap Lock)

```sql
-- Session 1: Lock by secondary index value 200
START TRANSACTION;
SELECT * FROM accounts WHERE user_code = 200 FOR UPDATE;

-- Inspect active locks:
SELECT 
    INDEX_NAME, 
    LOCK_TYPE, 
    LOCK_MODE, 
    LOCK_DATA 
FROM performance_schema.data_locks 
WHERE OBJECT_NAME = 'accounts';

-- Output:
-- INDEX_NAME    | LOCK_TYPE | LOCK_MODE        | LOCK_DATA
-- idx_user_code | RECORD    | X                | 200, 10   (Next-Key lock on (100, 200])
-- PRIMARY       | RECORD    | X,REC_NOT_GAP    | 10        (Record lock on clustered index)
-- idx_user_code | RECORD    | X,GAP            | 300, 15   (Gap lock on next record (200, 300))

-- Session 2: Inserting user_code = 250 blocks!
INSERT INTO accounts (id, user_code, balance) VALUES (12, 250, 400.00);
-- BLOCKED! (Falls inside the (200, 300) gap lock on idx_user_code)

ROLLBACK;
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a Next-Key Lock, and why is it the default locking mechanism in InnoDB's `REPEATABLE READ`?**

A Next-Key Lock is a combination of a Record Lock on a specific index record and a Gap Lock on the gap immediately preceding that record, represented as the half-open interval `(previous_record, current_record]`.

InnoDB makes Next-Key Locking the default in `REPEATABLE READ` to eliminate two critical database anomalies:
1. **Phantom Reads in Locking Reads**: Standard snapshot reads (`SELECT ...`) avoid phantoms using MVCC read views. But locking reads (`SELECT ... FOR UPDATE`, `UPDATE`, `DELETE`) read current committed data. Without locking the empty gaps between rows, a concurrent transaction could insert a row matching the filter criteria midway through your transaction, creating a phantom row on subsequent locking reads.
2. **Statement-Based Replication Consistency**: When MySQL executes transactions under statement-based binary logging (`binlog_format=STATEMENT`), transactions are logged at commit time. If transaction A locks a range, updates it, and commits, but transaction B was allowed to insert a row into that range and commit earlier, the binlog replayed on replica servers in commit order would execute the update over B's newly inserted row, producing different data on replicas than on the primary master. Next-Key locking guarantees serializable execution ordering for range operations.

**Q: When does InnoDB downgrade a Next-Key Lock to a pure Record Lock or pure Gap Lock?**

InnoDB evaluates the query predicate against index uniqueness:
1. **Downgrade to Record Lock**: When performing an exact equality lookup (`WHERE column = value`) on a **unique index** or **primary key** and the matching record **exists**. Because the index is unique, duplicate values are structurally impossible, so phantom inserts cannot occur for that value. The gap portion is discarded.
2. **Downgrade to Gap Lock**: When performing an exact equality lookup (`WHERE column = value`) on a **unique index** or **primary key** and the record **does not exist**. InnoDB scans to the next existing record, locks the gap preceding it `(prev, next)`, but does not lock the `next` record itself.
3. **No Downgrade**: If the index is a non-unique secondary index or the query is a range scan (`BETWEEN`, `<`, `>`), InnoDB maintains full Next-Key locks and often acquires an extra gap lock on the record following the range.

**Q: What happens if a query with `FOR UPDATE` runs on a column with no index?**

This is one of the most severe performance disasters in MySQL. 

Because InnoDB only locks index records, if the `WHERE` clause does not utilize an index, MySQL must perform a full clustered index (primary key) table scan. In `REPEATABLE READ`, InnoDB locks every single primary key record with a Next-Key Lock, from the very first record all the way to the `supremum` pseudo-record.

This effectively locks every existing row AND every possible gap in the entire table. As a result, all concurrent `INSERT`, `UPDATE`, and `DELETE` operations on that table from all other transactions are completely blocked until the scanning transaction commits or rolls back.

**Q: Why do two concurrent transactions holding Gap Locks on the same range not block each other?**

Gap Locks in InnoDB have a unique compatibility rule: **Gap Locks are purely inhibitory, not exclusive**. 

Their only purpose is to prevent other transactions from *inserting* into the gap (which requests an `INSERT_INTENTION` lock). A Gap X lock does not conflict with another transaction's Gap S or Gap X lock on the exact same gap. 

Transaction A and Transaction B can both hold an exclusive Gap Lock on `(10, 20)` simultaneously. Neither blocks the other until one of them tries to execute an `INSERT` into `(10, 20)`. When Transaction A tries to insert, it must wait for Transaction B's gap lock to release; if Transaction B also tries to insert, both wait for each other, producing an instant deadlock.

**Q: What is the `supremum` pseudo-record in InnoDB lock logs?**

In a B+Tree leaf page, records are ordered from lowest to highest. To represent the open-ended boundary after the highest physical record in an index, InnoDB creates a fictitious internal record named `supremum`. 

When a query scans a range extending beyond the maximum existing key (e.g., `WHERE id > 100` when the max ID is 50), InnoDB places a Next-Key lock on the `supremum` record. This locks the interval `(50, +∞)`, blocking any transaction from inserting an ID greater than 50.

## 6. The Traps — What Goes Wrong

### Trap 1: The Missing Index Table-Wide Freeze

Developers often write an administrative update assuming they are only touching a handful of rows:

```sql
UPDATE orders SET status = 'ARCHIVED' WHERE status = 'PENDING_REVIEW';
```

If there is no index on `status`, InnoDB cannot pinpoint those rows on a B+Tree. It performs a full table scan, attaching Next-Key Locks to every single row and every gap between rows across the entire table. During the update, all checkout transactions inserting new orders hang and crash with lock wait timeouts.

**The Fix**: Always ensure any column referenced in `UPDATE`, `DELETE`, or `SELECT ... FOR UPDATE` has a covering index. If batch-updating unindexed fields, read the primary keys first using uncommitted/paginated reads, then update by primary key.

### Trap 2: The Concurrent Insert Deadlock on Non-Existent Keys

A common pattern in APIs is "check if record exists, if not create it":

```sql
-- Transaction 1:
SELECT id FROM subscriptions WHERE user_id = 999 FOR UPDATE; -- user 999 does not exist

-- Transaction 2:
SELECT id FROM subscriptions WHERE user_id = 999 FOR UPDATE; -- user 999 does not exist
```

1. Transaction 1 searches for `999`. Since it doesn't exist, it acquires a Gap Lock on the surrounding interval, say `(500, 1000)`.
2. Transaction 2 does the same and successfully acquires a Gap Lock on `(500, 1000)` (because gap locks are compatible with each other).
3. Transaction 1 executes `INSERT INTO subscriptions (user_id) VALUES (999);`. It requests an `INSERT_INTENTION` lock on `(500, 1000)` and gets blocked waiting for Transaction 2's gap lock.
4. Transaction 2 executes `INSERT INTO subscriptions (user_id) VALUES (999);`. It also requests an `INSERT_INTENTION` lock and gets blocked waiting for Transaction 1's gap lock.
5. **Deadlock detected**: MySQL is forced to kill and roll back one of the transactions.

**The Fix**: Do not use `SELECT ... FOR UPDATE` to guard inserts. Use a unique constraint on `user_id` and execute `INSERT INTO ... ON DUPLICATE KEY UPDATE` or handle the unique violation error directly in application code.

### Trap 3: Locking Past the Boundary on Secondary Index Range Scans

Consider an index on `status_code` with values `[10, 20, 30, 40]`. You run:

```sql
SELECT * FROM tasks WHERE status_code <= 20 FOR UPDATE;
```

Developers assume only `10` and `20` are locked. In reality, to verify that there are no other records with `status_code <= 20`, InnoDB's range iterator must read forward until it encounters the first record that violates the condition — record `30`. 

In doing so, InnoDB places a Next-Key Lock on `(20, 30]`. As a result, another transaction attempting to insert `status_code = 25` gets blocked, even though 25 is strictly outside your query filter!

## 7. Compare With Related Concepts

### Next-Key Lock vs. Record Lock

| Dimension | Record Lock | Next-Key Lock |
| :--- | :--- | :--- |
| **Locked Target** | The physical index entry itself (`[b]`) | The index entry **plus** preceding gap (`(a, b]`) |
| **Prevents** | Modifying or deleting the existing row | Modifying/deleting the row **AND** inserting into the gap |
| **Used For** | Exact equality queries on Unique Keys / PK | Range queries, non-unique indexes in `REPEATABLE READ` |

*Rule of thumb:* A Record Lock protects existing data identity; a Next-Key Lock protects range stability against newly arriving data.

### Next-Key Lock vs. Gap Lock

| Dimension | Gap Lock | Next-Key Lock |
| :--- | :--- | :--- |
| **Interval** | Open interval `(a, b)` | Half-open interval `(a, b]` |
| **Record Status** | The boundary record `b` is **unlocked** | The boundary record `b` is **locked** |
| **Conflict Behavior** | Gap locks do not conflict with other gap locks | The record lock portion conflicts with other record locks |

*Rule of thumb:* A Gap Lock only stops insertions in empty space; a Next-Key Lock stops insertions in empty space AND locks the bounding record.

### Next-Key Locking in `REPEATABLE READ` vs. `READ COMMITTED`

| Behavior | `REPEATABLE READ` (Default) | `READ COMMITTED` |
| :--- | :--- | :--- |
| **Gap / Next-Key Locks** | Fully active for all locking reads and writes | Disabled for regular search and scan queries |
| **Phantom Protection** | Prevented in both snapshot reads and locking reads | Prevented in snapshot reads, possible in locking reads |
| **Lock Contention / Deadlocks** | Higher due to gap locking | Significantly lower; locks released early after evaluation |
| **Replication Requirement** | Works with `STATEMENT`, `MIXED`, or `ROW` binlog | **Requires** `binlog_format=ROW` for safe replication |

*Rule of thumb:* If high-throughput OLTP systems experience severe gap-lock deadlocks, switching to `READ COMMITTED` with `binlog_format=ROW` safely removes Next-Key locking overhead.

## 8. 🧠 The Memory Hook

A **Next-Key Lock** is a half-open interval `(gap, record]` — it puts a wheel clamp on the parked car **and** sets up orange traffic cones across the empty driveway leading up to it. In `REPEATABLE READ`, InnoDB uses it to freeze empty space so phantom rows cannot sneak between your reads.
