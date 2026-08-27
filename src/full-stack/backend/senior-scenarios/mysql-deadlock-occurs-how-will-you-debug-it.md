# MySQL Deadlock — How Will You Debug It

## 1. The Real-World Problem — When You Actually Hit This

Your checkout service has been fine for months. Then Black Friday hits. Two customers pay at the same instant, or a background job updates order status while a user cancels. Suddenly your logs fill with:

```
ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction
```

The request didn't hang. It failed instantly. One transaction was killed, the other went through. If you just show "something went wrong," the user retries and pays twice. If you don't handle it, the job crashes and leaves an order half-updated.

It worked in dev with one user. It fails in prod with concurrency. The query looks innocent — two UPDATEs — but the order they touch rows is different. This is the moment you need to read InnoDB's deadlock report and fix the locking, not just add a retry and hope.

You get this interview question because every senior has been on call for that page at 2am. They want to hear how you find evidence, read the lock graph, and remove the root cause.

## 2. The Analogy — Make the Mechanic Obvious

Think of InnoDB rows as lockers in a school hallway.

A transaction is a student who needs to open lockers. To update locker 10, you put your padlock on it. No one else can open it until you're done.

A deadlock is two students blocking each other. Student A locks locker 10 and needs locker 20. Student B already locked locker 20 and now needs locker 10. Both stand there holding one locker, waiting for the other. Nobody can move. The hall monitor (InnoDB) picks one student, takes their padlock away, and tells them to start over. The other student finishes.

Gap locks are the twist that surprises people. In MySQL's default isolation level, you don't just lock the lockers that exist — you also tape off the empty floor between lockers so no one can slide a new locker in while you're counting. Imagine Student A says "I'm going to update every locker between 10 and 20," so they tape the whole gap. Student B tries to insert a new locker 15 in that gap and has to wait. That taped gap is a gap lock. A next-key lock is the locker plus the gap right before it — that's the default in REPEATABLE READ.

So deadlocks come from two things: locking existing rows in opposite order, or trying to insert into a gap someone else has taped off. Once you see the hallway, `SHOW ENGINE INNODB STATUS` just tells you who was holding which padlock and who was waiting for which gap.

## 3. The Full Explanation — How It Actually Works

A MySQL deadlock is not a slow query. It is two or more transactions each holding a lock that the other one needs. InnoDB detects the circle quickly — usually in under a second — picks a victim, rolls it back, and lets the other transaction continue. The victim gets error 1213.

InnoDB locks are row-level by default, but the details matter:

Row locks come in shared (S) and exclusive (X). SELECT ... FOR UPDATE or UPDATE needs X. SELECT ... LOCK IN SHARE MODE needs S. X conflicts with everything, S conflicts only with X.

Table-level intention locks (IS, IX) just say "I plan to lock rows in this table." You rarely think about them, but they show up in the deadlock report.

The deadlock-specific locks are gap locks, next-key locks, and insert intention locks. A gap lock locks the empty space between two rows. A next-key lock locks a row plus the gap before it. InnoDB uses them in REPEATABLE READ to stop phantom reads — so a range query doesn't see new rows appear mid-transaction. An insert intention lock is a lighter signal that says "I want to insert into this gap." Gap locks don't block other gap locks, but they do block insert intention locks.

When does each appear? If you do `SELECT ... FOR UPDATE WHERE id = 5` and `id` is a unique index, you lock just that row. If you do `SELECT ... FOR UPDATE WHERE status = 'pending'` with no index, InnoDB can't lock by index so it scans and locks many rows plus gaps — often the whole table. If you do a range like `WHERE id BETWEEN 10 AND 20 FOR UPDATE`, you lock the rows plus the gaps between them. Two transactions inserting into the same gap will deadlock with gap locks even if they touch different values.

InnoDB builds a wait-for graph: Transaction 1 waits for Transaction 2, Transaction 2 waits for Transaction 1 — that's a cycle. A background thread checks for cycles constantly. When it finds one, it chooses a victim with the lowest cost to roll back — usually the transaction that changed fewer rows. The victim is rolled back entirely, not just the last statement. `innodb_print_all_deadlocks = ON` writes every deadlock to the MySQL error log so you don't have to catch it live.

Isolation changes this a lot. MySQL's default is REPEATABLE READ, which uses gap and next-key locks aggressively. READ COMMITTED disables gap locking for most cases (except foreign-key checks). So moving a hot transaction to READ COMMITTED can remove gap-lock deadlocks, but you lose the phantom-read protection. That is a deliberate trade-off.

Your debugging evidence comes from three places. First, `SHOW ENGINE INNODB STATUS` — scroll to `LATEST DETECTED DEADLOCK`. It shows for each transaction: the SQL it ran, what locks it HOLDS, and what it is WAITING FOR. Second, `performance_schema.data_locks` and `data_lock_waits` — they show live held and waited locks with index names and lock type (RECORD, GAP, NEXT-KEY). Third, `EXPLAIN` on the queries — tells you if a query did a full table scan and therefore locked far more than you thought. Slow query log and metrics like `Innodb_row_lock_waits` and a counter of 1213 errors give you frequency and timing.

The fixes flow from the evidence:

Order locks consistently. If every code path updates rows sorted by `id` ascending, two transactions can't grab the same rows in opposite order. This is the single most effective fix.

Add the right index. A query that filters on `user_id` without an index on `user_id` locks too many rows. Add the index, `EXPLAIN` shows `ref` instead of `ALL`, and the lock range shrinks to just matching rows.

Shrink the transaction. Hold locks for the shortest time. Don't do HTTP calls, file uploads, or heavy compute inside a transaction. Fetch data, then BEGIN, then update, then COMMIT quickly.

Retry the whole transaction, not just the failed statement. The victim was rolled back, so its earlier writes are gone. Your app must catch 1213, and also 1205 for lock wait timeout, and restart the entire transaction from the beginning with a short backoff and jitter. Make sure retry is safe — the transaction should be idempotent or guarded by an idempotency key so a retry doesn't create two orders.

Consider isolation only where it helps. If gap locks are the culprit and phantom reads don't matter for that transaction, running it as `SET TRANSACTION ISOLATION LEVEL READ COMMITTED` removes most gap locks. Don't change the global default lightly.

For hot counters or queues, split the row. Updating a single `counter = counter + 1` row from many threads will always contend. Use sharded counters or `INSERT ... ON DUPLICATE KEY UPDATE` patterns instead.

You also need to think beyond the fix: you need correct error handling on the frontend — 409 or a retryable error so the client can retry with an idempotency key — and observability: log the victim query, emit a metric `mysql_deadlocks_total`, alert if it spikes, and keep `innodb_print_all_deadlocks` on in production so you have the report after the fact.

## 4. See It In Practice — Real Code or Queries

A classic deadlock needs two transactions touching two rows in opposite order.

Setup:

```sql
-- orders table, InnoDB, REPEATABLE READ by default
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB;

INSERT INTO orders VALUES (10, 1, 'pending'), (20, 1, 'pending');
```

Two concurrent transactions:

```sql
-- Connection A
BEGIN;
UPDATE orders SET status = 'processing' WHERE id = 10;
-- holds X lock on id=10

-- Connection B (at same time)
BEGIN;
UPDATE orders SET status = 'processing' WHERE id = 20;
-- holds X lock on id=20

-- Connection A continues
UPDATE orders SET status = 'done' WHERE id = 20;
-- waits for B's lock on 20

-- Connection B continues
UPDATE orders SET status = 'done' WHERE id = 10;
-- waits for A's lock on 10 -> cycle -> deadlock, one gets 1213
```

In production you won't see this live. You run this right after the error:

```sql
SHOW ENGINE INNODB STATUS\G
```

Look for `LATEST DETECTED DEADLOCK`. A real report looks like this (trimmed):

```txt
LATEST DETECTED DEADLOCK
------------------------
2026-08-27 02:14:10 0x70000
*** (1) TRANSACTION:
TRANSACTION 4211, ACTIVE 0 sec starting index read
mysql tables in use 1, locked 1
LOCK WAIT 2 lock struct(s), heap size 1136, 1 row lock(s)
MySQL thread id 18, query id 201 localhost app
UPDATE orders SET status = 'done' WHERE id = 20
*** (1) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS space id 5 page no 3 n bits 72 index PRIMARY of table `app`.`orders`
  trx id 4211 lock_mode X locks rec but not gap waiting
  Record lock, heap no 2 PHYSICAL RECORD: n_fields 5; compact format; info bits 0

*** (2) TRANSACTION:
TRANSACTION 4212, ACTIVE 0 sec starting index read
2 lock struct(s), heap size 1136, 1 row lock(s)
MySQL thread id 19, query id 202 localhost app
UPDATE orders SET status = 'done' WHERE id = 10
*** (2) HOLDS THE LOCK(S):
RECORD LOCKS space id 5 page no 3 n bits 72 index PRIMARY
  trx id 4212 lock_mode X locks rec but not gap
  Record lock, heap no 2
*** (2) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS ... index PRIMARY ... heap no 3
  trx id 4212 lock_mode X waiting
*** WE ROLL BACK TRANSACTION (1)
```

Read it like this: Transaction 2 holds the lock on `id=10`, waits for `id=20`. Transaction 1 holds nothing useful yet and waits for `id=20`. Wait-for cycle, transaction 1 rolled back.

For live debugging without waiting for a deadlock:

```sql
-- requires performance_schema enabled
SELECT
  r.trx_id waiting_trx, r.trx_mysql_thread_id waiting_thread,
  r.trx_query waiting_query,
  b.trx_id blocking_trx, b.trx_query blocking_query
FROM performance_schema.data_lock_waits w
JOIN information_schema.innodb_trx b ON b.trx_id = w.blocking_engine_transaction_id
JOIN information_schema.innodb_trx r ON r.trx_id = w.requesting_engine_transaction_id;

SELECT THREAD_ID, OBJECT_NAME, INDEX_NAME, LOCK_TYPE, LOCK_MODE, LOCK_STATUS, LOCK_DATA
FROM performance_schema.data_locks;
-- LOCK_TYPE: RECORD, GAP, NEXT-KEY — tells you if it's a gap lock
-- LOCK_DATA: the actual key value or "supremum pseudo-record" for end-of-index gap
```

Check if a missing index caused a wide lock:

```sql
-- This query has no index on status, so it locks more than you expect
EXPLAIN SELECT * FROM orders WHERE status = 'pending' FOR UPDATE;
-- If Extra shows full scan or type = ALL, every row plus gaps gets locked

-- Fix: add index, then re-check
CREATE INDEX idx_status ON orders(status);
EXPLAIN SELECT * FROM orders WHERE status = 'pending' FOR UPDATE;
-- now type = ref, key = idx_status, locks only matching rows
```

Gap-lock insert deadlock example — two inserts into the same gap:

```sql
-- Table t: id INT PRIMARY KEY, no other rows between 10 and 20
-- Connection A: locks gap (10,20) with a range
BEGIN;
SELECT * FROM t WHERE id BETWEEN 10 AND 20 FOR UPDATE;
-- holds GAP lock on (10, 20)

-- Connection B at same time:
BEGIN;
SELECT * FROM t WHERE id BETWEEN 10 AND 20 FOR UPDATE;
-- also holds GAP lock — gap locks don't block each other

-- Both try to insert 15:
-- Connection A:
INSERT INTO t VALUES (15, 'a'); -- waits for insert intention lock
-- Connection B:
INSERT INTO t VALUES (16, 'b'); -- deadlock: both wait for each other's gap
```

Application retry must wrap the whole transaction. Node.js example:

```js
// Correct: retry the whole transaction, not just the last query
async function withDeadlockRetry(pool, work, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Pass the transactional connection to your work, so all queries share it
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      // 1213 = deadlock, 1205 = lock wait timeout — both are retryable
      const isRetryable = err.errno === 1213 || err.errno === 1205;
      if (!isRetryable || attempt === maxRetries) throw err;
      // backoff with jitter so two victims don't retry in lockstep
      const delay = Math.pow(2, attempt) * 50 + Math.random() * 50;
      await new Promise(r => setTimeout(r, delay));
    } finally {
      conn.release();
    }
  }
}

// Usage: keep updates ordered to prevent the deadlock in the first place
await withDeadlockRetry(pool, async (trx) => {
  const ids = [orderIdA, orderIdB].sort((a, b) => a - b); // consistent order
  for (const id of ids) {
    await trx.execute('UPDATE orders SET status = ? WHERE id = ?', ['done', id]);
  }
});
```

Python (SQLAlchemy / PyMySQL) equivalent idea — same rule:

```python
import random, time
import pymysql

RETRYABLE = {1213, 1205}

def run_tx(conn, queries, max_retries=3):
    for attempt in range(max_retries + 1):
        try:
            conn.begin()
            cur = conn.cursor()
            for sql, params in queries:
                cur.execute(sql, params)
            conn.commit()
            return
        except pymysql.MySQLError as e:
            conn.rollback()
            if e.args[0] not in RETRYABLE or attempt == max_retries:
                raise
            time.sleep(2 ** attempt * 0.05 + random.random() * 0.05)
```

Production settings to enable evidence:

```sql
-- Write every deadlock to error log, not just last one in memory
SET GLOBAL innodb_print_all_deadlocks = ON;

-- Deadlock detection vs timeout: InnoDB detects cycles fast.
-- innodb_deadlock_detect = ON by default. Turning it OFF makes it fall back to timeout
-- (innodb_lock_wait_timeout, default 50s) — slower, rarely what you want.

-- Check current isolation
SELECT @@transaction_isolation; -- REPEATABLE-READ in MySQL 8.0 default
-- For a specific hot transaction where phantom reads are okay:
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
BEGIN;
-- gap locks mostly gone for this tx
UPDATE orders SET status = 'done' WHERE user_id = 42;
COMMIT;
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a MySQL deadlock and how is it different from a lock wait timeout?**

A deadlock is a cycle: two or more transactions each hold a lock the other needs. InnoDB detects it within about a second, picks a victim, rolls it back, and returns error 1213 to that victim. The other transaction keeps going. A lock wait timeout (error 1205) is not a cycle — one transaction just waits too long for a lock held by someone else and gives up after `innodb_lock_wait_timeout` seconds (default 50). Deadlock is instant and handled by detection; lock wait is slow and handled by timeout. You retry both, but deadlock means you have a locking order problem to fix, while timeout often means a long transaction holding locks too long.

**Q: How do you debug a deadlock in production? What exact command do you run?**

You start with `SHOW ENGINE INNODB STATUS` and read the `LATEST DETECTED DEADLOCK` section. It tells you the two transactions, their SQL, what locks they hold, and what they are waiting for — like `lock_mode X locks rec but not gap waiting` versus `RECORD LOCKS ... GAP`. That tells you row vs gap. Then you check `performance_schema.data_locks` and `data_lock_waits` if you catch it live, look at the slow query log for long transactions, and run `EXPLAIN` on both queries to see if they scans. You also check `innodb_print_all_deadlocks` — if it was on, the same report is in the error log even after `LATEST DETECTED DEADLOCK` gets overwritten by the next deadlock. You never guess which query caused it; you read the report.

**Q: What are gap locks and next-key locks, and when do they appear?**

A gap lock locks the empty space between two index records, not the records themselves. A next-key lock locks a record plus the gap before it. InnoDB uses them in REPEATABLE READ to prevent phantom reads for range queries. They appear on `SELECT ... FOR UPDATE`, `SELECT ... LOCK IN SHARE MODE`, and `UPDATE/DELETE` with a WHERE that uses a range or a non-unique index. A point lookup on a unique index (`WHERE id = 5`) locks only that row. A range (`WHERE id BETWEEN 10 AND 20 FOR UPDATE`) locks rows plus gaps. A query with no usable index locks many rows and gaps because InnoDB has to scan. Gap locks don't block each other, but they block insert intention locks — that's how two transactions each holding a gap lock can deadlock when both try to insert into the same gap.

**Q: Why does a missing index cause more deadlocks?**

Because without an index, InnoDB can't lock just the rows you meant. It scans the table or a large part of it and places locks on every row it visits plus gaps. A query like `UPDATE orders SET status = 'done' WHERE user_id = 42` without an index on `user_id` may lock the whole table. Now it collides with unrelated transactions that touch different users but same table. With an index on `user_id`, `EXPLAIN` shows `ref` access and only matching rows plus their gaps get locked. Rule: if you use `FOR UPDATE` or `UPDATE` with a WHERE, every column in that WHERE should be indexed or you are locking too much.

**Q: Do you retry the failed statement or the whole transaction when you get error 1213?**

The whole transaction. InnoDB rolled back the victim transaction entirely, not just the last statement. Any earlier writes in that transaction are gone. If you only retry the last `UPDATE`, you skip the first one and leave data half-written. Your app code must catch 1213 (and 1205), do a `ROLLBACK`, and restart the transaction from the `BEGIN`. That is why retry logic must wrap the entire work function and why the transaction needs to be idempotent — use an idempotency key or check-before-write so a retry doesn't double-apply.

**Q: How do you prevent deadlocks? List the practical fixes.**

First, lock rows in the same order everywhere. Sort IDs before updating — if every transaction updates `ORDER BY id`, no cycle can form. Second, add the missing index so you lock less. Third, make transactions short — don't hold locks while calling external APIs or doing heavy work. Fourth, handle gap locks: if phantom protection isn't needed, run that transaction as READ COMMITTED, or rewrite the query to avoid range locks. Fifth, lower contention on hot rows — shard counters or use queue tables instead of updating one row 100 times per second. Sixth, add retry with backoff around the whole transaction, but treat it as a safety net, not a fix — if you retry without ordering locks, you just deadlock again.

**Q: Does `READ COMMITTED` stop deadlocks? Should we change the global isolation?**

READ COMMITTED removes most gap locking, so it eliminates gap-lock deadlocks. That helps for workloads where phantom reads are harmless — e.g., incrementing a counter. But it doesn't stop row-order deadlocks, and it changes guarantees: another transaction can insert rows that would have been locked in REPEATABLE READ. Don't change the global default lightly. Set isolation per transaction for the hot path only: `SET TRANSACTION ISOLATION LEVEL READ COMMITTED` before that one `BEGIN`. And document why.

## 6. The Traps — What Goes Wrong in Production

**Retrying only the last statement.** You catch 1213 and re-run the `UPDATE` that failed. But the transaction was already rolled back, so the earlier `UPDATE` in the same transaction is lost. Now you have a partial update that no one notices until reconciliation fails. Fix: rollback and retry the whole transaction from the start.

**Retrying without idempotency.** You retry the whole transaction, but the first attempt already charged the card and the deadlock happened on the next query. The retry charges again. Fix: do side effects outside the transaction or guard them with an idempotency key stored in the same DB transaction, so the second attempt sees "already processed" and skips the charge.

**Forgetting that gap locks exist.** You test point updates with `WHERE id = 10` and see no deadlocks. In prod, a `WHERE status = 'pending' FOR UPDATE` without an index locks hundreds of rows plus gaps and deadlocks on inserts. Fix: `EXPLAIN` every `FOR UPDATE` query, add indexes, and check `data_locks` for `LOCK_MODE: X,GAP` surprises.

**Locking in random order.** One code path updates orders `[10, 20]`, another updates `[20, 10]`. Each works alone; together they deadlock. Fix: sort IDs before locking. Make it a helper function so no one forgets.

**Holding locks while doing slow work.** You do `BEGIN; SELECT ... FOR UPDATE; await fetchPaymentAPI(); UPDATE ...; COMMIT;`. The API takes 2 seconds, so you hold the row lock for 2 seconds and every concurrent transaction waits or deadlocks. Fix: fetch everything before `BEGIN`, then do only DB work inside the transaction.

**Assuming autocommit means no transactions.** With `autocommit = ON`, each statement is its own transaction. Two statements in a row are not atomic — another transaction can slip in between. If you need two updates to be atomic, use an explicit `BEGIN ... COMMIT`.

**Changing `innodb_deadlock_detect` to OFF without understanding.** Turning detection off doesn't remove deadlocks — it just makes InnoDB wait until `innodb_lock_wait_timeout` (50s) before timing out. Your p99 latency becomes 50s. Leave detection on unless you have thousands of threads contending on the same few rows and detection overhead is proven to be the problem.

**Only looking at `SHOW ENGINE INNODB STATUS` once.** That section only keeps the latest deadlock. If you had two deadlocks, the first one is gone. Fix: turn on `innodb_print_all_deadlocks` so every deadlock goes to the error log, and ship that log to your observability stack. Also emit a metric on every 1213 so you can graph frequency.

## 7. Compare With Related Concepts

**Deadlock vs lock wait timeout.** Both give you a retryable error, but deadlock (1213) is a detected cycle and happens fast. Lock wait timeout (1205) is one transaction holding a lock too long and the waiter giving up after 50 seconds. Deadlock tells you to fix lock ordering or gaps. Timeout tells you to shorten the holder transaction or add an index. Don't treat them as the same.

**Deadlock vs race condition.** A race condition is a logic bug where two threads interleave and produce a wrong result — no error is thrown. A deadlock is a lock conflict where InnoDB throws an error to break the cycle. Race conditions cause silent wrong data; deadlocks cause noisy failures that are actually protecting you.

**MySQL gap locks vs PostgreSQL.** Both run at REPEATABLE READ but they handle phantoms differently. MySQL InnoDB uses gap and next-key locks that block inserts. PostgreSQL uses MVCC snapshots and predicate checks without gap locks, so the same workload may deadlock in MySQL but throw a serialization failure in Postgres. Know your database — don't apply Postgres advice to MySQL gap tuning.

**Pessimistic locking (SELECT FOR UPDATE) vs optimistic locking (version column).** Pessimistic locks rows up front and is right when contention is high and you must win — like decrementing inventory. Optimistic locking adds a `version` column, reads without locking, and checks `WHERE id = ? AND version = ?` on update — if zero rows affected, someone else changed it, so you retry. Optimistic avoids deadlocks but fails more under high contention. Use pessimistic for hot, must-succeed updates; use optimistic for mostly non-conflicting edits.

**Retry with backoff vs ignoring.** Blindly retrying instantly can cause the same two transactions to deadlock again in lockstep. Fixed backoff without jitter has the same problem. Use exponential backoff with random jitter and a max retry count, and log every retry so you know if prevention failed.

## 8. 🧠 The Memory Hook

Deadlock is two people each holding a door the other needs. MySQL taps one on the shoulder, undoes everything they did, and says start over. Your job is to make them always grab doors in the same order, tape off fewer gaps with better indexes, and redo the whole trip when tapped — not just the last step.
