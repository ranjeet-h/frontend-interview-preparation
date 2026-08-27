# What Is Deadlock in MySQL

## 1. The Real-World Problem — When You Actually Hit This

Your checkout service has been running fine for months. Then flash-sale day hits and two users touch the same rows in the same second. Request 1 starts a transaction, locks Alice's wallet row to debit it, and then tries to lock Product B's stock row. At the exact same millisecond Request 2 starts another transaction, locks Product B's stock row first, and then tries to lock Alice's wallet row.

Neither transaction can move forward. Each is holding a lock the other needs. Without help both connections would hang forever, eating connection-pool slots until your whole app stops answering.

Instead MySQL kills one of them instantly with:

```
ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction
```

One user's checkout crashes, your error tracker lights up, and the logs show 1213s spiking under load. This is not a rare trivia question. Any high-concurrency system that updates rows in different orders will hit this. You need to know how InnoDB spots the circle, which transaction it sacrifices, what you see in diagnostics, and how to write code so deadlocks are rare and harmless when they do happen.

## 2. The Analogy — Make the Mechanic Obvious

Imagine two people, Priya and Jamal, each need the same two resources to finish a task: a laptop and a charger.

Priya picks up the laptop. Jamal picks up the charger at the exact same moment. Now Priya reaches for the charger, but Jamal is holding it and will not put it down until his work is done. Jamal reaches for the laptop, but Priya is holding it and will not put it down until her work is done.

Neither can finish. Neither will let go of what they already hold. That is hold-and-wait plus no-preemption plus a circle. The only way forward is for someone outside the standoff to step in, take one person's item away, tell them to start over, and let the other person finish.

In MySQL InnoDB:

- Priya and Jamal are two concurrent transactions.
- The laptop and charger are row-level locks (usually on primary-key records, but also gap locks on empty ranges).
- Holding one lock while waiting for another is hold-and-wait.
- Refusing to give up a lock until you commit or rollback is no-preemption.
- The outside person who spots the circle is the InnoDB deadlock detector. It keeps a waits-for graph, finds the cycle, picks a victim, rolls that victim back, frees its locks, and lets the survivor continue. Your app's job is to retry the victim's whole transaction from the beginning.

## 3. The Full Explanation — How It Actually Works

Think in plain words first: a deadlock is a circle of transactions where each one is holding something and blocking on something the next one holds. If you break any link in that circle, the system unblocks.

Computer science gives this four names, the Coffman conditions. All four must be true for a deadlock to exist. Mutual exclusion means a row locked exclusively by one transaction cannot be locked exclusively by another at the same time. Hold-and-wait means a transaction holds at least one lock while waiting for another. No preemption means MySQL cannot just steal a lock from a healthy transaction. Circular wait means there is a closed chain: Transaction 1 waits for Transaction 2, Transaction 2 waits for Transaction 1, or a longer ring T1 -> T2 -> T3 -> T1. Break any one condition and a deadlock cannot happen.

In InnoDB most ordinary reads are non-locking thanks to MVCC, so they do not participate in deadlocks. The trouble comes from writers and explicit locking reads: `UPDATE`, `DELETE`, and `SELECT ... FOR UPDATE` or `SELECT ... LOCK IN SHARE MODE`. Those take real locks on index records and on the gaps between them.

To track who is waiting for whom, InnoDB keeps an in-memory directed graph called the waits-for graph. Nodes are active transactions. A directed edge from A to B means A is waiting for a lock held by B. Every time a transaction tries to acquire a lock that is already held, and `innodb_deadlock_detect` is ON (the default), InnoDB runs a depth-first search starting from the waiting transaction. If the search walks back to a node already on the current path, it has found a cycle. That cycle is a deadlock right now, not a guess.

Once a cycle is found InnoDB must choose one transaction to sacrifice. It calculates a weight for each transaction in the cycle. Weight is mostly the number of undo log records the transaction has created, meaning how many rows it has inserted, updated, or deleted. The transaction that changed the fewest rows is cheapest to undo, so InnoDB picks it as the victim. It aborts that transaction, undoes its changes using the undo log, releases every lock it held, and returns `ERROR 1213 (40001)` to that client connection. The survivor immediately gets the lock it was waiting for and continues. This happens in milliseconds. You do not wait 50 seconds.

That 50-second number matters for the fallback path. If you turn deadlock detection off with `innodb_deadlock_detect = OFF`, InnoDB stops doing graph searches. That saves CPU when hundreds of threads fight over the same hot rows, because each search has to take a global lock-system mutex and can cost O(N^2) when many threads are waiting. With detection off, InnoDB just lets waiters block until `innodb_lock_wait_timeout` fires. The default is 50 seconds, which is an eternity for a user-facing request. Teams that disable detection therefore lower the timeout to 1 or 2 seconds. When the timer fires InnoDB returns `ERROR 1205 (HY000): Lock wait timeout exceeded; try restarting transaction`. By default that rolls back only the single waiting statement, not the whole transaction, unless you have set `innodb_rollback_on_timeout = ON`.

When a deadlock does happen you have a diagnostic window. Run:

```
SHOW ENGINE INNODB STATUS\G
```

and look for `LATEST DETECTED DEADLOCK`. InnoDB prints both transactions with their thread IDs, how long they were active, the SQL they ran, what locks they were holding (`lock_mode X locks rec but not gap`), what they were waiting for (`lock_mode X waiting`), the table and index name, and the final line `*** WE ROLL BACK TRANSACTION (2)` telling you who was chosen. That victim line is usually the transaction with `1 undo rec(s)` versus more in the survivor. To keep history beyond the latest one, set `innodb_print_all_deadlocks = ON` and every deadlock is also written to the MySQL error log on disk.

Prevention is about breaking the Coffman conditions in your own code. The most reliable technique is deterministic ordering: always lock resources in the same global order. If two transfers touch accounts 1 and 2, sort the IDs and lock the smaller first no matter which direction the money flows. That makes a circle impossible. Keep transactions tiny. Do not hold locks across network calls to a payment gateway, email service, or another microservice. Fetch that data before you begin the transaction so locks are held for milliseconds not seconds. Make sure `WHERE` clauses in updates hit an index. Without an index InnoDB must scan and lock many rows and gaps, which multiplies the chance of collision. Understand gap locks. Under the default `REPEATABLE READ` isolation, InnoDB locks not just existing rows but the empty gap before a record to prevent phantom inserts. Two transactions can each hold a gap lock on the same empty interval, and then both try to insert into that gap and block on each other. That is a real insert-insert deadlock. Finally, consider optimistic locking for hot read-mostly rows. Instead of `SELECT ... FOR UPDATE`, add a `version` column and do `UPDATE accounts SET balance = balance - 100, version = version + 1 WHERE id = ? AND version = ?`. If another writer beat you, the update affects zero rows and you retry without ever having held a pessimistic lock.

Deadlocks are not bugs you can banish 100 percent. In a complex service they are normal concurrency events. The fix is to make them rare and to handle the survivors correctly in code.

## 4. See It In Practice — Real Code or Queries

Start with a tiny accounts table and reproduce the circle with two separate MySQL sessions.

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

Run these statements in order across two terminals. The comments tell you what locks are held.

```sql
-- Session 1 starts a transfer from Alice to Bob and locks Alice
SESSION 1> START TRANSACTION;
SESSION 1> UPDATE accounts SET balance = balance - 100 WHERE id = 1;
-- locks row id=1 with an exclusive X-lock

-- Session 2 starts a concurrent transfer from Bob to Alice and locks Bob
SESSION 2> START TRANSACTION;
SESSION 2> UPDATE accounts SET balance = balance - 50 WHERE id = 2;
-- locks row id=2 with an exclusive X-lock

-- Session 1 now wants Bob, but Session 2 holds Bob, so Session 1 waits
SESSION 1> UPDATE accounts SET balance = balance + 100 WHERE id = 2;
-- Session 1 is now BLOCKED waiting for Session 2

-- Session 2 now wants Alice, but Session 1 holds Alice.
-- This closes the circle: S1 waits for S2, S2 waits for S1
SESSION 2> UPDATE accounts SET balance = balance + 50 WHERE id = 1;

-- InnoDB detects the cycle in the waits-for graph and instantly rolls back Session 2
-- ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction
-- Session 1 is unblocked and can COMMIT
SESSION 1> COMMIT;
```

Immediately after, diagnose what happened:

```sql
SHOW ENGINE INNODB STATUS\G
```

Look for the deadlock section. It shows both transactions, the queries they ran, what they held and what they waited for, and who was rolled back:

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

Transaction 2 had only `1 undo rec(s)` so it was cheapest to undo and was chosen as victim.

In application code you must retry the whole business transaction, not just the last statement, with backoff and jitter so two retries do not collide again at the same instant:

```python
import time
import random
import mysql.connector
from mysql.connector import errorcode

def execute_with_deadlock_retry(db_pool, operation_fn, max_retries=3, base_delay=0.05):
    """
    Runs a transactional unit of work and retries the ENTIRE transaction
    on deadlock (1213) or lock wait timeout (1205).
    operation_fn receives a cursor and should contain all SQL for one business action.
    """
    attempt = 0
    while True:
        conn = db_pool.get_connection()
        try:
            conn.autocommit = False
            cursor = conn.cursor()
            result = operation_fn(cursor)  # do all reads and writes inside here
            conn.commit()
            return result
        except mysql.connector.Error as err:
            conn.rollback()
            is_retryable = err.errno in (errorcode.ER_LOCK_DEADLOCK, errorcode.ER_LOCK_WAIT_TIMEOUT)
            if is_retryable and attempt < max_retries:
                attempt += 1
                # exponential backoff plus jitter avoids thundering-herd retries
                sleep_time = (base_delay * (2 ** attempt)) + random.uniform(0, 0.05)
                time.sleep(sleep_time)
                continue
            raise
        finally:
            cursor.close()
            conn.close()
```

The lock-order fix that makes the circle impossible is to sort IDs before you lock:

```python
def transfer_funds(cursor, from_id, to_id, amount):
    # Always lock the smaller id first - every code path must follow this order
    first_id = min(from_id, to_id)
    second_id = max(from_id, to_id)

    cursor.execute("SELECT id, balance FROM accounts WHERE id = %s FOR UPDATE", (first_id,))
    cursor.execute("SELECT id, balance FROM accounts WHERE id = %s FOR UPDATE", (second_id,))

    cursor.execute("UPDATE accounts SET balance = balance - %s WHERE id = %s", (amount, from_id))
    cursor.execute("UPDATE accounts SET balance = balance + %s WHERE id = %s", (amount, to_id))
```

When every path locks low then high, two transactions touching the same two rows never form a circle. The waits-for graph may get a single wait edge, but never a cycle.

A gap-lock deadlock looks similar but without existing rows. Under `REPEATABLE READ`, if two transactions both do `SELECT ... WHERE id = 10 FOR UPDATE` where 10 does not exist, each gets a gap lock on the same empty interval between adjacent keys. Gap locks do not block each other, so both succeed. Then both try to `INSERT` into that gap. Each insert needs an insert-intention lock that conflicts with the other's gap lock, so each waits for the other. Cycle, then 1213.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a deadlock in MySQL and how does InnoDB detect it?**

A deadlock is a circle where two or more transactions each hold a lock the next one needs, so none can make progress. InnoDB tracks this with an in-memory waits-for graph where nodes are transactions and edges are waits-for relationships. When `innodb_deadlock_detect` is ON, which is the default, every time a transaction blocks on a lock held by someone else InnoDB runs a depth-first search from the waiting transaction. If the search comes back to a node already on the path, it found a directed cycle and declares a deadlock immediately, within milliseconds. It then picks a victim, rolls it back, and returns error 1213 to that connection while the survivor gets its lock and continues. If detection is OFF, InnoDB does not search at all and just waits for `innodb_lock_wait_timeout` to fire.

**Q: How does InnoDB choose which transaction to kill as the victim?**

It picks the cheapest transaction to undo. Weight is mainly the number of rows the transaction has already changed, visible as undo log records. A transaction that did one `UPDATE` has one undo record and is cheap to roll back. One that did 50,000 updates is expensive. InnoDB chooses the transaction with the smallest weight so the rollback is fast and wastes the least work. If two transactions have the same weight, InnoDB falls back to internal heuristics. You see this in `SHOW ENGINE INNODB STATUS` as `1 undo rec(s)` on the rolled-back transaction. The choice is economic, not about which transaction started later or which connection is more important.

**Q: What is the difference between error 1213 and error 1205, and how should my retry logic differ?**

Error 1213 is `ER_LOCK_DEADLOCK`. It means InnoDB found a real cycle in the waits-for graph and has already rolled back the entire victim transaction. You get it instantly. Error 1205 is `ER_LOCK_WAIT_TIMEOUT`. It means a transaction waited longer than `innodb_lock_wait_timeout` for a single lock without any cycle, usually because the holder is slow, holds locks across a network call, or scanned without an index. It fires after the timeout, default 50 seconds. Retry handling is different. For 1213 the transaction is already rolled back, so you must retry the whole business operation from the beginning. For 1205, by default only the last waiting statement was rolled back and the rest of the transaction is still open, unless you set `innodb_rollback_on_timeout = ON` which makes it roll back the whole transaction. Most application code treats both as retryable but always restarts the entire logical transaction and makes sure the connection is back in a clean state with an explicit rollback before retrying.

**Q: How can gap locks and next-key locks cause deadlocks even on INSERTs into empty ranges?**

Under `REPEATABLE READ`, which is MySQL's default isolation, InnoDB uses next-key locking to prevent phantom rows. Next-key is a record lock plus a gap lock on the empty space before that record. If you do `SELECT ... FOR UPDATE` on a value that does not exist, InnoDB does not find a record to lock, so it locks the gap between the surrounding existing keys. Gap locks do not conflict with other gap locks, so two transactions can each successfully lock the same empty gap. The deadlock comes on the next step. When each transaction tries to `INSERT` a row into that gap, it needs an insert-intention lock that does conflict with the other transaction's gap lock. Now each waits for the other, forming a cycle, and InnoDB reports 1213 even though no row existed before. Switching to `READ COMMITTED` disables gap locks for that case, or you can avoid the pattern by not using `FOR UPDATE` on empty ranges.

**Q: When would you ever turn off `innodb_deadlock_detect`, and what do you give up?**

At very high concurrency, hundreds of threads fighting over the same hot rows, deadlock detection itself becomes the bottleneck. Each time a thread blocks, InnoDB must take the global lock-system mutex and walk the waits-for graph, which can be O(N^2) in the number of waiters. With many waiters threads spend more time in detection than in real work. Turning detection OFF removes that CPU storm. The price is that real deadlocks are no longer caught instantly. They now wait out the full `innodb_lock_wait_timeout`. You must therefore lower that timeout from 50 seconds to 1 or 2 seconds, and you must still handle both 1213 and 1205 as retryable. You also lose the nice `LATEST DETECTED DEADLOCK` entry, so debugging gets harder. Leave detection ON unless profiling proves it is the actual top CPU consumer.

**Q: What is the correct way for an application to handle a deadlock?**

Treat deadlocks as normal operational events, not as bugs you can remove entirely. Handle them in the data-access layer, not deep in business logic. Catch error codes 1213 and 1205 explicitly, do a full rollback so the connection is clean, then retry the entire transaction from the start, not just the single failed statement, because the victim's whole transaction was undone. Retry a bounded number of times, three to five is common, with exponential backoff and random jitter so competing threads do not retry in lockstep and collide again. Log the retry and the original queries. If retries are exhausted, surface a user-friendly error and let the caller decide. Also fix the root order: sort keys before locking, keep transactions short, and add missing indexes, so retries become rare.

## 6. The Traps — What Goes Wrong in Production

**Trap: Retrying only the failed statement instead of the whole transaction.**

This is the most common mistake. When InnoDB picks a victim for 1213, it rolls back every change that transaction made, not just the last `UPDATE`. If your code catches the exception and re-executes only the last statement on the same connection, the earlier writes are gone and you produce partial, corrupt business state. For example, debiting Alice succeeded but crediting Bob failed and was rolled back, then retrying only the credit leaves Alice debited twice. The fix is to put all SQL for one business action inside a single function and retry that entire function on a fresh transaction. The Python wrapper above does exactly that: `operation_fn` is re-run from the top after a full rollback.

**Trap: Treating error 1205 as if the whole transaction was rolled back (or vice versa).**

Many developers handle 1213 and 1205 with the same catch block and assume both behave identically. They do not. For 1213 InnoDB has already undone the whole transaction. For 1205, by default MySQL only rolls back the last statement that timed out and leaves the transaction open with earlier locks still held. If you then immediately retry the statement without an explicit rollback, you keep those stale locks and likely hit another timeout or a deadlock. The safe pattern is to always call `ROLLBACK` explicitly before retrying either error, and to consider setting `innodb_rollback_on_timeout = ON` if you want both errors to have the same whole-transaction semantics.

**Trap: Updating rows in nondeterministic order across code paths.**

One endpoint receives batch IDs `[45, 12, 88]` and loops in that order, locking 45 then 12. Another endpoint or job receives `[12, 45, 99]` and locks 12 then 45. Even though both updates touch the same two rows, the inconsistent order creates frequent cycles under load. This shows up as intermittent 1213s that vanish in staging with one user but appear in production with concurrency. Always sort IDs before any locking: `sorted_ids = sorted(ids)` and then iterate. Enforce the same low-to-high order in every service that touches those rows.

**Trap: Holding locks across network calls inside a transaction.**

Opening a transaction, doing `SELECT ... FOR UPDATE`, then calling a payment gateway, webhook, or another microservice before `COMMIT` holds row and gap locks for the entire HTTP round trip, maybe 500 milliseconds or seconds instead of 2 milliseconds. That widened hold window multiplies the chance another transaction sneaks in and forms a cycle, and it also turns deadlocks into long 1205 timeouts when detection is off. Do all external I/O before you start the transaction, or do it after you commit. Transactions should contain only database work.

**Trap: Missing indexes turning point updates into table scans.**

If `UPDATE orders SET status = 'paid' WHERE external_ref = 'abc'` runs without an index on `external_ref`, InnoDB cannot lock just the matching row. It scans the clustered index and tries to lock many rows and gaps, effectively locking the whole table. Two unrelated updates on different `external_ref` values then collide and deadlock. Always check `EXPLAIN` on updates and deletes. If you see a full scan, add the selective index before you tune retry logic.

**Trap: Retrying instantly with no backoff, causing a thundering herd.**

After a deadlock one transaction was just rolled back and the other is still committing. If the victim retries with zero delay, it slams back into the same lock the survivor still holds and fails again immediately, burning through all retries in milliseconds. The fix is exponential backoff with jitter: `delay = base * 2^attempt + random(0, 50ms)`. The randomness spreads competing retries apart so the survivor finishes and releases locks before the victim tries again.

## 7. Compare With Related Concepts

**Deadlock (1213) vs Lock Wait Timeout (1205)**

A deadlock is an active cycle found right away by searching the waits-for graph. InnoDB rolls back the lighter transaction immediately and returns 1213. A lock wait timeout is passive. One transaction simply waits longer than `innodb_lock_wait_timeout` for a lock held by a slow transaction without any cycle, and InnoDB returns 1205 after the timer fires. One is instant and whole-transaction, the other is delayed and by default statement-level. Rule: if you see bursts of 1213 under concurrency, fix ordering and index coverage and add whole-transaction retries. If you see steady 1205s, look for long transactions, missing indexes, or calls inside transactions.

**Pessimistic Locking vs Optimistic Locking**

Pessimistic locking takes real database locks up front with `SELECT ... FOR UPDATE` and holds them until commit. It prevents concurrent changes but creates lock waits and deadlocks. Optimistic locking takes no database lock on read. It adds a `version` column and writes with `UPDATE ... SET balance = balance - 100, version = version + 1 WHERE id = ? AND version = ?`. If another writer changed the version first, your update affects zero rows and you retry the read. No deadlock, but you must handle the zero-row retry. Rule: use pessimistic locking when contention is high and aborting complex work is expensive. Use optimistic locking for read-heavy web workloads where conflicts are rare and you want to avoid holding locks at all.

**Record Lock vs Gap Lock vs Next-Key Lock**

A record lock locks one existing index entry. A gap lock locks the empty space between two existing entries or before the first or after the last. A next-key lock is the `REPEATABLE READ` default that combines both: it locks an existing record and the gap just before it. Point lookups on a unique primary key with `WHERE id = 5` usually take only a record lock. Range scans and lookups on missing keys take gap or next-key locks. That is why inserts into empty ranges can deadlock. Rule: to minimize gap-lock deadlocks, use exact primary-key lookups where possible, keep isolation at `REPEATABLE READ` only if you need phantom protection, or switch that transaction to `READ COMMITTED`.

## 8. 🧠 The Memory Hook

Two transactions each holding what the other wants is a circle with no exit. InnoDB draws that circle as a waits-for graph and erases it by undoing the smallest transaction. Your job is to never draw the circle by locking in the same order, never widen the circle by holding locks across the network, and always be ready to redraw your work by retrying the whole transaction when MySQL tells you with 1213.
