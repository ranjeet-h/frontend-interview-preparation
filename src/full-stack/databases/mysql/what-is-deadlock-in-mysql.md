# Deadlocks in MySQL: Wait-For Graphs, Detection Algorithms, and Prevention Strategies

## 1. Why This Exists — The Problem First

Imagine you are running the checkout backend for an e-commerce platform during a flash sale. Everything tested smoothly in staging when you ran requests one by one. But under production load, two users hit checkout at the exact same millisecond. 

Request 1 is processing an order for User A buying Product B: it begins a transaction, updates User A's wallet balance (locking User A's row), and then attempts to deduct stock from Product B (requesting a lock on Product B's row). At the exact same instant, Request 2 is a restock or promotional job: it begins a transaction, locks Product B's row, and then attempts to update User A's account.

Neither transaction can move forward. Transaction 1 is frozen waiting for Product B to unlock, while Transaction 2 is frozen waiting for User A to unlock. Without intervention, both database connections would hang indefinitely, consuming connection pool slots until your entire application stops answering HTTP requests. 

Instead, MySQL abruptly kills one of the requests with a fatal error: `ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction`. The user's checkout crashes, and your error monitoring lights up. 

Understanding deadlocks is not academic database trivia. High-concurrency systems run into lock contention daily. Knowing how the storage engine detects these cycles, how it chooses which transaction to sacrifice, and how to write code that avoids or gracefully handles deadlocks is fundamental to building resilient backend services.

## 2. The Analogy — Make It Obvious

Think of a busy restaurant kitchen with two chefs, Alice and Bob, and only two essential tools: a chef's knife and a cutting board.

Alice's recipe requires both the knife and the board. She picks up the knife first.
Bob's recipe also requires both the knife and the board. At that exact second, he picks up the cutting board.

Now Alice turns around to grab the cutting board, but Bob is holding it. She cannot start chopping, and she refuses to put down her knife until her dish is done.
Meanwhile, Bob turns around to grab the knife, but Alice is holding it. He cannot start prepping, and he refuses to put down his board until his dish is done.

They are stuck in a circular standstill. Neither chef can make progress, and neither will willingly surrender the tool they already hold.

In MySQL InnoDB:
- The chefs are concurrent database transactions.
- The kitchen tools are row-level and index locks.
- Holding a tool while waiting for another is the "hold-and-wait" condition.
- The kitchen head chef who steps in, takes the cutting board out of Bob's hands, tells Bob to wait a minute, and lets Alice finish her prep is the InnoDB Deadlock Detector.

The deadlock detector spots the circular wait, rolls back one transaction (the "victim"), releases its locks, and allows the other transaction to finish cleanly.

## 3. How It Actually Works — The Full Explanation

A deadlock occurs when two or more transactions hold locks that the other transactions need, creating a circular dependency where none can proceed.

Four conditions—known in computer science as the Coffman Conditions—must all be true simultaneously for a deadlock to exist:

1. Mutual Exclusion: A resource cannot be shared simultaneously. In InnoDB, when a transaction takes an exclusive lock (`X` lock) on an index record via `UPDATE`, `DELETE`, or `SELECT ... FOR UPDATE`, no other transaction can hold an exclusive lock on that same record.
2. Hold and Wait: A transaction currently holds at least one lock while requesting and waiting for additional locks held by other transactions.
3. No Preemption: MySQL cannot arbitrarily steal a lock away from a healthy, running transaction. Locks are held until the transaction explicitly executes `COMMIT` or `ROLLBACK`.
4. Circular Wait: A closed chain of transactions exists where Transaction 1 waits for a lock held by Transaction 2, and Transaction 2 waits for a lock held by Transaction 1 (or across a longer cycle: T1 -> T2 -> T3 -> T1).

If you break any single one of these four conditions, a deadlock cannot happen.

InnoDB manages concurrency through multi-version concurrency control (MVCC) for non-locking reads, but write operations and explicit locking reads require physical row and index locks. When multiple transactions lock rows in different orders, circular waits naturally emerge.

InnoDB maintains an in-memory directed graph called the Wait-For Graph (WFG). The nodes in this graph represent active transactions, and directed edges represent lock wait relationships: an edge points from Transaction A to Transaction B if Transaction A is waiting for a lock held by Transaction B.

When deadlock detection is enabled (`innodb_deadlock_detect = ON`, which is the default), every time a transaction tries to acquire a lock that is currently held by someone else, InnoDB initiates a depth-first search (DFS) traversal on the Wait-For Graph starting from the waiting transaction. 

If the traversal encounters a node already in the current search path, it has discovered a cycle. A cycle means a deadlock is present right now.

Once a cycle is detected, InnoDB cannot allow both transactions to hang. It must select one transaction as the "victim" to be aborted and rolled back.

To choose the victim, InnoDB calculates the "weight" of each transaction in the cycle. The transaction weight is primarily defined by the amount of work the transaction has already performed—specifically, the number of undo log records generated by `INSERT`, `UPDATE`, and `DELETE` operations.

InnoDB picks the transaction with the smallest weight (the fewest modified rows) as the victim. The reasoning is purely economic: rolling back a transaction that has modified only 1 row takes negligible CPU and disk I/O, whereas rolling back a transaction that has already modified 50,000 rows requires reading and applying thousands of undo log pages.

The selected victim transaction is immediately aborted, its changes are undone via the undo log, all of its acquired locks are released, and InnoDB returns `ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction` to the client connection. With the victim's locks freed, the surviving transaction immediately gets its requested lock and resumes execution.

If deadlock detection is turned off (`innodb_deadlock_detect = OFF`)—which high-scale systems sometimes do when hundreds of concurrent threads contend for the same locks to avoid the O(N^2) CPU cost of graph traversal—InnoDB relies on a fallback timer: `innodb_lock_wait_timeout` (default 50 seconds). Under this fallback, waiting transactions block until the timer expires, throwing `ERROR 1205 (HY000): Lock wait timeout exceeded; try restarting transaction`.

When a deadlock happens in production, you can inspect what went wrong using the MySQL administrative command `SHOW ENGINE INNODB STATUS\G`. Under the section `LATEST DETECTED DEADLOCK`, InnoDB prints:
- The exact SQL query executed by Transaction (1) and Transaction (2).
- The specific locks each transaction was holding (e.g., `lock mode S` or `lock_mode X`).
- The specific lock each transaction was waiting on (`lock_mode X waiting`), including the table name, index name, and the physical record identifier (heap number).
- The final verdict stating which transaction InnoDB chose to roll back (`*** WE ROLL BACK TRANSACTION (1)`).

To preserve history across multiple incidents, setting `innodb_print_all_deadlocks = ON` forces MySQL to write every detected deadlock report directly to the MySQL error log on disk.

Preventing deadlocks comes down to breaking the Coffman conditions in your application architecture:
- Maintain deterministic access ordering: Always lock resources in the exact same sequence across every query and microservice (e.g., always update `users` before `orders`, or sort IDs ascending before running batch updates).
- Keep transactions minimal: Perform HTTP requests, file uploads, hashing, and heavy business calculations outside of database transactions so locks are held for milliseconds instead of seconds.
- Index lookup columns properly: If an `UPDATE` or `DELETE` query does not hit an index, InnoDB must scan and lock every record in the table, dramatically increasing the surface area for lock collisions.
- Mind gap locks in `REPEATABLE READ`: InnoDB places gap locks between existing index values to prevent phantom rows. If two transactions both place gap locks on the same empty interval and then both try to `INSERT` a row into that gap, both will wait for the other's gap lock to release, deadlocking immediately.
- Use optimistic locking: For read-heavy records with occasional updates, compare-and-swap on a `version` column avoids holding exclusive pessimistic row locks entirely.

## 4. Real Code — See It Working

Let us look at a concrete SQL scenario reproducing a deadlock between two concurrent sessions, followed by the production application code required to handle it safely.

First, create a simple table with two bank accounts:

```sql
CREATE TABLE accounts (
    id INT PRIMARY KEY,
    owner VARCHAR(50) NOT NULL,
    balance DECIMAL(10, 2) NOT NULL
) ENGINE = InnoDB;

INSERT INTO accounts (id, owner, balance) VALUES 
(1, 'Alice', 1000.00),
(2, 'Bob', 500.00);
```

Now open two separate terminal connections to MySQL. Execute these statements in chronological order:

```sql
-- Step 1: Session 1 starts a transfer from Alice (id=1) to Bob (id=2)
-- Session 1 locks Alice's row exclusively
SESSION 1> START TRANSACTION;
SESSION 1> UPDATE accounts SET balance = balance - 100 WHERE id = 1;
-- Query OK, 1 row affected (locks row id=1 with an exclusive X-lock)

-- Step 2: Session 2 starts a concurrent transfer from Bob (id=2) to Alice (id=1)
-- Session 2 locks Bob's row exclusively
SESSION 2> START TRANSACTION;
SESSION 2> UPDATE accounts SET balance = balance - 50 WHERE id = 2;
-- Query OK, 1 row affected (locks row id=2 with an exclusive X-lock)

-- Step 3: Session 1 attempts to credit Bob's account (id=2)
-- Session 1 now requests an exclusive lock on row id=2, which Session 2 holds.
-- Session 1 blocks and waits.
SESSION 1> UPDATE accounts SET balance = balance + 100 WHERE id = 2;
-- (Session 1 is now waiting...)

-- Step 4: Session 2 attempts to credit Alice's account (id=1)
-- Session 2 requests an exclusive lock on row id=1, which Session 1 holds.
-- This completes the cycle: S1 waits for S2, S2 waits for S1.
SESSION 2> UPDATE accounts SET balance = balance + 50 WHERE id = 1;

-- INSTANT RESULT:
-- InnoDB detects the cycle in the Wait-For Graph and rolls back Session 2:
-- ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction

-- Meanwhile, Session 1 is instantly unblocked:
-- Query OK, 1 row affected (Session 1 can now COMMIT)
SESSION 1> COMMIT;
```

To diagnose what happened immediately after the crash, check the engine status:

```sql
SHOW ENGINE INNODB STATUS\G
```

In the output, locate the deadlock section:

```txt
------------------------
LATEST DETECTED DEADLOCK
------------------------
*** (1) TRANSACTION:
TRANSACTION 18402, ACTIVE 12 sec starting index read
mysql tables in use 1, locked 1
LOCK WAIT 2 lock struct(s), heap size 1128, 2 row lock(s)
MySQL thread id 14, OS thread handle 12314532, query id 82 localhost root updating
UPDATE accounts SET balance = balance + 100 WHERE id = 2
*** (1) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS space id 42 page no 4 n bits 72 index PRIMARY of table `bank`.`accounts` 
trx id 18402 lock_mode X locks rec but not gap waiting

*** (2) TRANSACTION:
TRANSACTION 18403, ACTIVE 8 sec starting index read
mysql tables in use 1, locked 1
2 lock struct(s), heap size 1128, 2 row lock(s), 1 undo rec(s)
MySQL thread id 15, OS thread handle 12314599, query id 85 localhost root updating
UPDATE accounts SET balance = balance + 50 WHERE id = 1
*** (2) HOLDS THE LOCK(S):
RECORD LOCKS space id 42 page no 4 n bits 72 index PRIMARY of table `bank`.`accounts` 
trx id 18403 lock_mode X locks rec but not gap
*** (2) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS space id 42 page no 4 n bits 72 index PRIMARY of table `bank`.`accounts` 
trx id 18403 lock_mode X locks rec but not gap waiting

*** WE ROLL BACK TRANSACTION (2)
```

Notice how Transaction (2) was chosen as the victim because it had only 1 undo record (`1 undo rec(s)`), matching the lowest cost calculation.

In production backend applications, deadlocks will occasionally happen no matter how carefully queries are designed. Applications must implement transparent retry wrappers with exponential backoff and jitter:

```python
import time
import random
import mysql.connector
from mysql.connector import errorcode

def execute_with_deadlock_retry(db_pool, operation_fn, max_retries=3, base_delay=0.05):
    """
    Executes a transactional unit of work with automatic retry on deadlock (1213)
    and lock wait timeout (1205).
    """
    attempt = 0
    while True:
        conn = db_pool.get_connection()
        try:
            conn.autocommit = False
            cursor = conn.cursor()
            
            # Execute the user-provided transactional logic
            result = operation_fn(cursor)
            
            conn.commit()
            return result
            
        except mysql.connector.Error as err:
            conn.rollback()
            
            # Error 1213 is Deadlock; Error 1205 is Lock Wait Timeout
            is_deadlock = err.errno in (errorcode.ER_LOCK_DEADLOCK, errorcode.ER_LOCK_WAIT_TIMEOUT)
            
            if is_deadlock and attempt < max_retries:
                attempt += 1
                # Exponential backoff with jitter prevents thundering herd retry collisions
                sleep_time = (base_delay * (2 ** attempt)) + (random.uniform(0, 0.05))
                time.sleep(sleep_time)
                continue
            else:
                # Re-raise if retries exhausted or if it is an unrelated error (e.g., syntax, FK constraint)
                raise
        finally:
            cursor.close()
            conn.close()
```

To eliminate the deadlock at the SQL level, sort the IDs before locking them. When both transfers lock the lower account ID first and the higher account ID second, circular wait is impossible:

```python
def transfer_funds(cursor, from_id, to_id, amount):
    # Enforce deterministic global ordering: always lock lowest ID first
    first_id = min(from_id, to_id)
    second_id = max(from_id, to_id)
    
    # Pessimistic locking in deterministic order
    cursor.execute("SELECT id, balance FROM accounts WHERE id = %s FOR UPDATE", (first_id,))
    cursor.execute("SELECT id, balance FROM accounts WHERE id = %s FOR UPDATE", (second_id,))
    
    # Execute debit and credit
    cursor.execute("UPDATE accounts SET balance = balance - %s WHERE id = %s", (amount, from_id))
    cursor.execute("UPDATE accounts SET balance = balance + %s WHERE id = %s", (amount, to_id))
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is a deadlock in MySQL and how does InnoDB detect it?**

A deadlock is a situation where two or more transactions cannot proceed because each holds a lock that another transaction needs, forming a circular dependency. InnoDB detects this by maintaining an in-memory Wait-For Graph where transactions are nodes and lock requests are directed edges. When `innodb_deadlock_detect = ON`, InnoDB runs a depth-first search on the graph whenever a transaction is blocked. If it finds a directed cycle, it identifies the deadlock immediately, chooses the transaction with the smallest weight (fewest modified rows) as the victim, rolls it back, and returns error code 1213 to the client while unblocking the remaining transactions.

**Q: How does InnoDB decide which transaction to kill when a deadlock occurs?**

InnoDB evaluates the "weight" of each transaction involved in the deadlock cycle. The weight reflects the cost of rolling back that transaction. Specifically, it counts the number of rows inserted, updated, or deleted by the transaction (visible as undo log records). The transaction that has modified the smallest number of rows is chosen as the victim. Rolling back a smaller transaction minimizes disk I/O and CPU overhead. If both transactions have modified the same number of rows, InnoDB falls back to internal heuristics such as transaction start time.

**Q: What is the difference between a deadlock (Error 1213) and a lock wait timeout (Error 1205)?**

A deadlock is an active, circular conflict where progress is mathematically impossible; InnoDB detects the cycle in the Wait-For Graph and aborts the victim transaction immediately (within milliseconds). A lock wait timeout occurs when a transaction waits for a lock held by another transaction that is simply taking too long (e.g., executing a slow query or blocked by an external call) without any circular dependency. InnoDB waits until the passive timer `innodb_lock_wait_timeout` (default 50s) expires before returning Error 1205. In a deadlock, the whole victim transaction is rolled back; on a lock wait timeout, by default only the single failing statement is rolled back unless `innodb_rollback_on_timeout = ON`.

**Q: How can Gap Locks and Next-Key Locks in Repeatable Read isolation cause deadlocks on INSERT statements?**

Under the default `REPEATABLE READ` isolation level, InnoDB uses Next-Key locking (a combination of a record lock and a gap lock on the space before the record) to prevent phantom reads. If Transaction 1 executes `SELECT * FROM items WHERE id = 10 FOR UPDATE` and row 10 does not exist, InnoDB places a gap lock on the range between the adjacent existing records (say, 5 to 15). If Transaction 2 executes `SELECT * FROM items WHERE id = 12 FOR UPDATE` on the same empty interval, it also successfully acquires a shared gap lock because gap locks do not conflict with other gap locks. However, when Transaction 1 subsequently tries to `INSERT INTO items (id) VALUES (10)`, it must acquire an Insert Intention lock on that gap, which blocks on Transaction 2's gap lock. When Transaction 2 simultaneously tries to `INSERT INTO items (id) VALUES (12)`, it blocks on Transaction 1's gap lock. This creates a circular wait on two inserts into the same gap, triggering a deadlock.

**Q: When would you ever consider disabling `innodb_deadlock_detect`?**

In extreme high-concurrency write workloads where hundreds or thousands of active connection threads are updating rows in the same hot tables, deadlock detection can become a massive CPU bottleneck. Every time a thread waits for a lock, InnoDB acquires a global lock system mutex and traverses the Wait-For Graph with O(N^2) complexity where N is the number of waiting threads. Under high concurrency, threads spend more time traversing lock graphs than executing SQL. Disabling deadlock detection (`innodb_deadlock_detect = OFF`) removes this CPU contention. When disabled, MySQL relies entirely on `innodb_lock_wait_timeout` (which should be dialed down from 50s to 1s or 2s) to break stuck transactions.

**Q: How should an application properly handle database deadlocks?**

Deadlocks are not application bugs that can be 100% prevented in complex distributed environments; they are normal operational concurrency events. Production applications should handle them defensively:
1. Catch MySQL error code 1213 (`ER_LOCK_DEADLOCK`) and 1205 (`ER_LOCK_WAIT_TIMEOUT`) at the database driver or repository layer.
2. Ensure the failed transaction is cleanly rolled back so the connection returns to a clean state.
3. Automatically retry the entire business transaction from the beginning up to a fixed limit (e.g., 3 to 5 times).
4. Apply exponential backoff with randomized jitter between retries to prevent competing threads from colliding again in lockstep.

## 6. The Traps — What Goes Wrong

**The Unordered Batch Update Trap**
A microservice receives a batch update request containing a list of IDs to modify: `[45, 12, 88]`. Another concurrent request receives a batch containing `[12, 45, 99]`. If the application loops through the arrays in the order received, Thread 1 locks row 45 then requests row 12, while Thread 2 locks row 12 then requests row 45. Even though the operations are identical updates, the non-deterministic lock acquisition order causes frequent production deadlocks. The fix is mandatory: always sort the IDs before initiating updates (`ids.sort()`) so every database connection locks rows in identical ascending numerical order.

**The External Network Call Inside Transactions Trap**
Developers frequently open a database transaction, lock a row with `SELECT ... FOR UPDATE`, and then invoke an external payment gateway, third-party webhook, or slow microservice HTTP call before issuing the final `UPDATE` and `COMMIT`. If the external network call takes 800 milliseconds, that database row lock is held for nearly a full second instead of 2 milliseconds. This dramatically inflates the probability of concurrent transactions colliding and forming deadlock cycles. Never hold database locks across network boundaries; fetch all necessary external data before starting the database transaction.

**The Missing Index Table-Scan Trap**
When an `UPDATE` or `DELETE` statement executes a `WHERE` clause on a column that lacks an index, MySQL cannot target individual row locks. Instead, InnoDB must perform a full clustered index scan, placing exclusive locks on every single record in the entire table (and all gaps between them). Two completely unrelated updates affecting completely different business entities will lock the entire table, crashing into each other and throwing deadlocks. Always verify with `EXPLAIN` that updating statements utilize specific, selective indexes.

**The Read-Modify-Write Without Locking Trap**
A service reads a record (`SELECT balance FROM accounts WHERE id = 1`), calculates a new balance in application memory, and then updates the row (`UPDATE accounts SET balance = ... WHERE id = 1`). Under concurrent requests, two threads read the same initial state, but when they attempt concurrent updates, one blocks. If they proceed to lock secondary tables in differing orders, they deadlock. Use atomic updates (`UPDATE accounts SET balance = balance - 100 WHERE id = 1 AND balance >= 100`) or explicit pessimistic locks (`SELECT ... FOR UPDATE`) to ensure state validity without interleaved steps.

**The Thundering Herd Retry Trap**
When a deadlock occurs, a naive application layer immediately catches error 1213 and retries the exact same query within 0 milliseconds. Because the competing transaction is often still executing its remaining statements, the retried transaction crashes straight back into the exact same lock, failing repeatedly until its retry limit is exhausted. Retries must always incorporate randomized backoff delays (e.g., `delay = base * 2^attempt + rand(0, 50ms)`) to allow the competing transaction sufficient time to commit and release its locks.

## 7. Compare With Related Concepts

**Deadlock vs. Lock Wait Timeout**
A deadlock is an active circular lock dependency detected instantly by InnoDB's Wait-For Graph algorithm, rolling back the lighter transaction with error 1213. A lock wait timeout is a passive timer expiring when a transaction waits longer than `innodb_lock_wait_timeout` for a single blocked resource without a cycle, returning error 1205.
Rule: Treat deadlocks as concurrency order collisions to be resolved with deterministic access ordering and retries; treat lock wait timeouts as symptoms of long-running transactions, missing indexes, or slow batch queries.

**Optimistic Locking vs. Pessimistic Locking**
Pessimistic locking takes physical database locks at the start of a transaction (`SELECT ... FOR UPDATE`), preventing any concurrent modifications but creating potential lock queues and deadlocks. Optimistic locking does not acquire database locks during reads; instead, it checks a `version` integer column upon write (`UPDATE ... WHERE id = ? AND version = ?`), failing if another writer modified the version first.
Rule: Use pessimistic locking when write contention is high and rolling back complex operations is expensive; use optimistic locking for web applications with high read-to-write ratios where conflicts are rare.

**Record Lock vs. Gap Lock vs. Next-Key Lock**
A Record Lock locks a specific, existing index entry. A Gap Lock locks the empty space between index records (or before the first / after the last record) to prevent concurrent inserts into that range. A Next-Key Lock is the default InnoDB locking mechanism in `REPEATABLE READ`, combining a record lock on an existing index entry with a gap lock on the gap immediately preceding it.
Rule: Target primary keys and unique indexes on exact equality lookups to acquire pure Record Locks; remember that range queries and queries on non-existent keys in `REPEATABLE READ` trigger Gap Locks that can deadlock concurrent inserts.

## 8. 🧠 The Memory Hook

A deadlock is a mutual hold-and-wait circle where Transaction A holds what Transaction B needs, and Transaction B holds what Transaction A needs. InnoDB breaks the circle by inspecting its Wait-For Graph and rolling back the transaction that modified the fewest rows.
