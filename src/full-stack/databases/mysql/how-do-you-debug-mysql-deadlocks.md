# How Do You Debug MySQL Deadlocks

## 1. The Real-World Problem — When You Actually Hit This

Your prod logs start spiking with `ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction`. It is not constant. It happens for 2% of checkout requests, only under load, never in development, and retries sometimes make it worse. The order service does two things in one transaction: decrement inventory, then create the order row. The warehouse sync job does the opposite order: update orders, then adjust inventory. Each transaction alone is fast and correct. Together they sometimes freeze and MySQL kills one of them. Users see a random 500. Support says "the database is flaky." It is not flaky. Two transactions each held a lock the other needed, so MySQL had to pick a victim. If you do not know how to read the deadlock report, you will guess for weeks and add sleeps or random retries that hide the real problem.

## 2. The Analogy — Make the Mechanic Obvious

Think of a small library with two study rooms, A and B. Each room has one key.

Transaction 1 is Alex. Transaction 2 is Bailey. Alex checks out the key for room A. Bailey checks out the key for room B. Now Alex needs room B to finish work, and Bailey needs room A to finish work. Each stands outside the other's room waiting for the key. Neither will put their own key down until they get the other key. They are stuck forever.

That stuck circle is a deadlock. In MySQL, the keys are row locks held by InnoDB. The students are transactions. Waiting outside the door is a lock wait.

MySQL has a librarian whose only job is to watch for these circles. That is the deadlock detector. It builds a waits-for graph: Alex waits for Bailey, Bailey waits for Alex. When it sees a circle, it picks one transaction to be the victim, rolls it back, and tells your app error 1213. The other transaction goes on and finishes. The victim must start over from the beginning. If you only retry the last statement, you are sneaking back into the library and demanding the same room without giving your first key back. It will not work. You have to return all keys, leave, and come back for a new attempt.

Good fixes map directly to the analogy: make everyone grab keys in the same order so two people never cross, make keys more precise so you lock one chair not the whole room, and when the librarian kicks you out, restart your whole visit, not just the last step.

## 3. The Full Explanation — How It Actually Works

InnoDB locks rows, not tables, but it only locks precisely when it knows which rows you mean.

When you run `UPDATE inventory SET qty = qty - 1 WHERE sku = 'ABC'` inside a transaction, InnoDB takes an exclusive lock on the index record for that sku. Other transactions that want the same row must wait. Locks are held until the transaction commits or rolls back, not until the statement finishes. That is why the order of statements across two transactions matters so much. Each transaction can hold one lock while waiting for another.

InnoDB also does gap locking on secondary indexes and when there is no good index, it can lock many more rows than you expected. If you write `UPDATE inventory SET qty = 10 WHERE category = 'shoes'` and there is no index on `category`, MySQL scans the table and locks every row it examines. Now two transactions updating different shoes can still block each other and deadlock, even though they touched different logical rows.

Deadlock detection works by keeping a waits-for graph in memory. Every time a transaction waits for a lock, MySQL adds an edge: waiter waits for holder. If adding an edge creates a cycle, MySQL has a deadlock. It must break the cycle by choosing a victim. It usually picks the transaction with the fewest rows changed, because that is cheapest to roll back. You can see the choice as `WE ROLL BACK TRANSACTION (2)` in the report. You cannot control the victim directly.

There are three places to see what happened.

First, `SHOW ENGINE INNODB STATUS` has a section called `LATEST DETECTED DEADLOCK`. This is the fastest way to debug. It shows the two transactions, the queries they last ran, what each was waiting for, and what locks each already held. The report is overwritten by the next deadlock, so you should capture it quickly or log it on error 1213.

A typical excerpt looks like this: Transaction 1 holds an exclusive lock on `inventory sku ABC` and waits for `orders id 101`. Transaction 2 holds an exclusive lock on `orders id 101` and waits for `inventory sku ABC`. That cross is the cycle. The headings to learn are `*** (1) TRANSACTION:`, `*** (1) WAITING FOR THIS LOCK TO BE GRANTED:`, `*** (1) HOLDS THE LOCK(S):`, and the same for `(2)`. The `WAITING` line tells you the row and lock mode, the `HOLDS` line tells you what that transaction already owns.

Second, for live debugging without waiting for a deadlock, query the lock tables. In MySQL 5.7 and earlier you use `INFORMATION_SCHEMA.INNODB_TRX`, `INNODB_LOCKS`, and `INNODB_LOCK_WAITS`. In MySQL 8.0+, those are gone and replaced by `performance_schema.data_locks` and `performance_schema.data_lock_waits` plus `INFORMATION_SCHEMA.INNODB_TRX` still for transaction info. Joining waiting transaction id to blocking transaction id shows you who blocks whom in real time. Enable `performance_schema` if it is off, and remember these views show only current waits, not history.

Third, error codes tell you what kind of failure it was. Error 1213 means deadlock victim. The transaction was rolled back and you must retry the whole transaction from the start. Error 1205 means lock wait timeout. There was no cycle, just one transaction waiting longer than `innodb_lock_wait_timeout` seconds and MySQL gave up. You do not retry 1205 the same way, you investigate why the holder ran so long or why it held so many locks, and you fix query time or transaction length. Treating 1205 as a deadlock and blindly retrying can make contention worse.

Fixes flow from those facts. The most reliable fix is to make every code path lock resources in the same order. If every transaction updates `inventory` before `orders`, the cross can never happen. Sort ids before updating when you touch many rows. The next fix is to narrow locks with correct indexes so you lock one row instead of a range. If you update by primary key, you lock one row. If you update by an unindexed column, you lock a huge swath. Keep transactions short, do not hold locks while calling external APIs or waiting for user input, fetch what you need, then begin the transaction, do writes, commit quickly. Choose the right isolation level сознательно. `REPEATABLE READ` is InnoDB default and needs more gap locks than `READ COMMITTED`, so if you do not need gap protection for your use case, the change can reduce deadlocks, but you must understand the tradeoff in phantom read behavior and replication.

For observability, log 1213 with the transaction name, the queries in the transaction, and the output of `SHOW ENGINE INNODB STATUS` or a query of `data_lock_waits` if you can collect it. Alert when victim rate crosses a threshold, not on one occurrence, because a few deadlocks at peak load are normal. Track `Innodb_row_lock_waits` and `Innodb_deadlocks` status counters for trends.

## 4. See It In Practice — Real Code or Queries

These examples use InnoDB and MySQL 8.0 syntax. The same ideas work on 5.7 with the older `INFORMATION_SCHEMA` tables.

Classic deadlock you can reproduce in two terminals.

In terminal 1:

```sql
-- Transaction A
BEGIN;
UPDATE inventory SET qty = qty - 1 WHERE sku = 'ABC'; -- locks ABC
-- pause, then in terminal 2 run its first UPDATE
UPDATE orders SET status = 'paid' WHERE id = 101; -- will wait for B's lock
COMMIT;
```

In terminal 2, run this while terminal 1 is still open:

```sql
-- Transaction B
BEGIN;
UPDATE orders SET status = 'paid' WHERE id = 101; -- locks 101
UPDATE inventory SET qty = qty - 1 WHERE sku = 'ABC'; -- deadlocks with A
COMMIT;
```

Whichever hits the cycle second becomes the victim and gets error 1213 immediately. The other commits.

Reading the report right after the victim error:

```sql
SHOW ENGINE INNODB STATUS\G
-- scroll to LATEST DETECTED DEADLOCK
-- You will see something like:
-- *** (1) TRANSACTION: ... ACTIVE 3 sec
-- *** (1) WAITING FOR THIS LOCK TO BE GRANTED:
-- RECORD LOCKS space id 12 page 4 ... index PRIMARY of table `shop`.`inventory`
-- *** (1) HOLDS THE LOCK(S):
-- RECORD LOCKS ... index PRIMARY of table `shop`.`orders`
-- *** (2) TRANSACTION: ... ACTIVE 2 sec
-- *** (2) WAITING FOR THIS LOCK TO BE GRANTED:
-- RECORD LOCKS ... table `shop`.`orders` ...
-- *** (2) HOLDS THE LOCK(S):
-- RECORD LOCKS ... table `shop`.`inventory` ...
-- *** WE ROLL BACK TRANSACTION (1)
```

Reading the waits-for graph in MySQL 8.0 while a wait is happening:

```sql
-- Live view: who waits for whom right now
SELECT
  w.OBJECT_SCHEMA, w.OBJECT_NAME, w.INDEX_NAME,
  w.LOCK_TYPE, w.LOCK_MODE, w.LOCK_STATUS,
  w.THREAD_ID AS waiter_thread,
  b.THREAD_ID AS blocker_thread,
  t.trx_mysql_thread_id AS waiter_conn,
  bt.trx_mysql_thread_id AS blocker_conn,
  t.trx_query AS waiter_query
FROM performance_schema.data_lock_waits w
JOIN performance_schema.data_locks b
  ON w.BLOCKING_ENGINE_LOCK_ID = b.ENGINE_LOCK_ID
JOIN INFORMATION_SCHEMA.INNODB_TRX t
  ON t.trx_id = w.REQUESTING_ENGINE_TRANSACTION_ID
JOIN INFORMATION_SCHEMA.INNODB_TRX bt
  ON bt.trx_id = w.BLOCKING_ENGINE_TRANSACTION_ID\G
```

On MySQL 5.7 the same live query uses the older tables:

```sql
SELECT r.trx_id AS waiting_trx, r.trx_mysql_thread_id,
       r.trx_query AS waiting_query,
       b.trx_id AS blocking_trx, b.trx_query AS blocking_query,
       w.requested_lock_id, w.blocking_lock_id
FROM INFORMATION_SCHEMA.INNODB_LOCK_WAITS w
JOIN INFORMATION_SCHEMA.INNODB_TRX b ON b.trx_id = w.blocking_trx_id
JOIN INFORMATION_SCHEMA.INNODB_TRX r ON r.trx_id = w.requesting_trx_id;
```

Narrowing locks with an index. Without this index, the update below locks many rows:

```sql
-- Before: no index on category, this scans and can deadlock unrelated rows
-- UPDATE inventory SET qty = 0 WHERE category = 'shoes';

-- Fix: add an index so only matching rows are locked
ALTER TABLE inventory ADD INDEX idx_category (category);

-- Now verify the lock scope with EXPLAIN
EXPLAIN UPDATE inventory SET qty = 0 WHERE category = 'shoes';
-- With the index, type is range on idx_category, rows examined is small.
-- Without it, type is ALL and InnoDB locks far more.

-- Better still, update by primary key when you can
UPDATE inventory SET qty = qty - 1 WHERE sku = 'ABC';
-- sku is unique, so InnoDB locks exactly one record, not a gap
```

Ordering locks to prevent the cross. Sort ids before touching rows:

```sql
-- Bad inside app code: loop over items in user-supplied order
-- for sku in cart_items: UPDATE inventory SET qty = qty - 1 WHERE sku = sku

-- Good: sort so every transaction hits rows in the same order
-- for sku in sorted(cart_items): UPDATE inventory SET qty = qty - 1 WHERE sku = sku

-- Same for multi-row updates in one statement
UPDATE inventory SET qty = qty - 1 WHERE sku IN ('ABC', 'XYZ') ORDER BY sku;
```

Retrying the whole transaction in application code, not just the last statement. Node.js with mysql2:

```js
// retry the entire transaction, not just the failed query
async function withDeadlockRetry(pool, work, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn); // work does all reads and writes
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      const isDeadlock = err.errno === 1213 || err.code === 'ER_LOCK_DEADLOCK';
      const isRetryable = isDeadlock && attempt < maxRetries;
      if (!isRetryable) throw err;
      // small jittered backoff before retrying the whole transaction
      const delay = 20 * Math.pow(2, attempt) + Math.random() * 20;
      await new Promise(r => setTimeout(r, delay));
    } finally {
      conn.release();
    }
  }
}

// usage
await withDeadlockRetry(pool, async (conn) => {
  await conn.execute('UPDATE inventory SET qty = qty - 1 WHERE sku = ?', ['ABC']);
  await conn.execute(
    "UPDATE orders SET status = 'paid' WHERE id = ?", [101]
  );
});
```

The key point in that helper is `rollback()` then call `work` again from the top. If you only resend the last `execute` without a new `beginTransaction`, you are still inside a rolled-back transaction and MySQL will reject the next statement.

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you debug a MySQL deadlock in production?**

Start with error 1213 in your app logs. When you catch 1213, log the business operation, the transaction contents, and capture `SHOW ENGINE INNODB STATUS` immediately. That status has `LATEST DETECTED DEADLOCK` with both transactions, the last query each ran, what each waited for and what each already held. Read the `WAITING FOR` and `HOLDS` sections to draw the cycle. Pair that with `performance_schema.data_locks` and `data_lock_waits` in 8.0+ or `INFORMATION_SCHEMA.INNODB_TRX / INNODB_LOCKS / INNODB_LOCK_WAITS` in older MySQL to see live blockers without waiting for the next deadlock. Look at what rows and indexes were locked, whether the WHERE clause used an index, and what order the two transactions touched tables. The fix depends on that reading, not on guessing.

**Q: What does `SHOW ENGINE INNODB STATUS` actually show for a deadlock?**

It shows the last deadlock only, overwritten by the next one. Inside `LATEST DETECTED DEADLOCK` you get two transaction blocks. Each block has `TRANSACTION` header with id and active seconds, the last SQL statement, `WAITING FOR THIS LOCK TO BE GRANTED` which tells you the exact table, index, record or gap, and lock mode the transaction wanted, and `HOLDS THE LOCK(S)` which tells you what that transaction already owned. At the end it says `WE ROLL BACK TRANSACTION (n)` to name the victim. You read it as a sentence: transaction 1 holds X and waits for Y while transaction 2 holds Y and waits for X. That cross is the cycle. If the status is empty, the deadlock was too old or `performance_schema` was not capturing, so you fall back to live lock wait queries and app-side logging.

**Q: What is the difference between `INFORMATION_SCHEMA.INNODB_TRX / INNODB_LOCKS / INNODB_LOCK_WAITS` and `performance_schema.data_locks / data_lock_waits`?**

They are the same idea across MySQL versions. In 5.7 and earlier, `INFORMATION_SCHEMA` held `INNODB_TRX` for transactions, `INNODB_LOCKS` for held and waiting locks, and `INNODB_LOCK_WAITS` for the waiter-to-blocker edge. In 8.0, Oracle removed `INNODB_LOCKS` and `INNODB_LOCK_WAITS` and moved lock info to `performance_schema.data_locks` and `data_lock_waits`. `INNODB_TRX` still exists. The query shape changes but the join is the same: find waiters, join to blockers, join both to `INNODB_TRX` to get the SQL and connection id. If you use the old names on 8.0 you get an empty set or an error, which is a common interview trap.

**Q: How do you read the waits-for graph excerpt?**

You reconstruct the sentence for each side. Suppose you see transaction 1 `WAITING FOR RECORD LOCKS on inventory PRIMARY sku ABC` and `HOLDS RECORD LOCKS on orders PRIMARY id 101`, while transaction 2 is the mirror. You say: 1 waits for ABC held by 2, 2 waits for 101 held by 1. Those two edges form a circle, so the detector fires. The lock mode matters too. `S` is shared read, `X` is exclusive write, `S,GAP` and `X,GAP` are gap locks that block inserts nearby. If you see gap locks around a range, the WHERE clause probably missed an index. The `heap size` and `lock struct` numbers are noise for this level of debugging. Focus on table, index, record, gap, and the SQL that caused it.

**Q: What is the correct retry discipline after error 1213?**

You must retry the whole transaction from `BEGIN`, not just the failed statement. Error 1213 means your transaction was rolled back entirely and no longer exists. If you resend only the last UPDATE, MySQL will say there is no active transaction or will treat it as a new implicit transaction that still lacks your earlier writes and locks, so business invariants break. Use a helper that does `BEGIN`, runs all steps, `COMMIT`, and on 1213 does `ROLLBACK` and starts over including reads. Add a small jittered backoff, limit retries to 3 or so, and only retry deadlocks, not all errors, otherwise you can retry non-idempotent side effects twice.

**Q: Why does ordering locks consistently prevent deadlocks?**

Deadlocks require a circle. If every transaction touches tables and rows in the same order, a circle cannot form. Imagine all code does `inventory` then `orders`, and within a table hits rows sorted by primary key. Then if two transactions both need ABC and 101, both will ask for ABC first. One gets it, the other waits, then the first finishes and releases ABC, and the second proceeds. No cross. If one path does `orders` first and another does `inventory` first, they can each grab their first and wait for the other's first, which is exactly the library cross. So you enforce ordering at the application layer by sorting ids and standardizing which DAO method touches which table first.

**Q: How does indexing reduce deadlocks?**

Indexes narrow which rows InnoDB must lock. Point lookups on a unique index lock one record. Range scans on a non-unique index lock the range looked at. Full table scans with no index lock every row examined, which can be the whole table. If you have two concurrent updates that logically touch different rows but neither uses an index, they can still lock overlapping scanned rows and deadlock even though the business rows are disjoint. Adding a precise index turns a wide lock into a narrow lock. You can prove it with `EXPLAIN`: a good index shows `type: const` or `range` with low rows, a missing index shows `type: ALL` with high rows, which hints at wide locking.

**Q: What is the difference between error 1205 and 1213, and why does it matter?**

Error 1213 is deadlock victim. InnoDB detected a cycle and chose you to roll back immediately. Retry of the whole transaction is correct. Error 1205 is lock wait timeout. You waited for a lock for `innodb_lock_wait_timeout` seconds and gave up, no cycle involved. The holder just ran too long or held too many locks. Retrying 1205 blindly can pile more waiters onto an already overloaded holder. For 1205 you look at slow queries, long transactions, missing indexes, and whether the app holds a transaction open while calling outside services. For 1213 you look at conflicting lock order and index precision. Logging both with the same retry code hides the real problem.

## 6. The Traps — What Goes Wrong in Production

**Retry the last statement instead of the whole transaction.** After 1213, InnoDB has already rolled back every statement in your transaction. If your code catches the error and just resends the one UPDATE that failed, that UPDATE now runs as a new autocommit statement without the earlier writes. Your invariant breaks. Inventory can go negative or an order can stay unpaid. You will not see an error for the resend, so the bug is silent. The fix is to wrap the entire read-modify-write sequence in a retry helper that calls `BEGIN` again and re-executes the reads.

**Treating 1205 and 1213 as the same error.** Teams see lock errors and add `if (err) retry()` for both. That makes 1205 storms worse. If a report query holds a lock for 8 seconds and you have 50 web workers retrying every 2 seconds, you turn one slow transaction into a thundering herd. Separate the codes. Retry only 1213 with jitter and a cap. For 1205, shorten or split the holder, add indexes, and avoid big batch updates inside a single transaction.

**Deadlocks that appear only after removing an index or changing a query.** A query that once used a covering index starts scanning the table after someone drops or renames that index, and suddenly unrelated updates start deadlocking each other. The code did not change, the lock footprint did. The trap is blaming app logic when the change was a migration. Always `EXPLAIN` the exact UPDATE and DELETE statements involved in the deadlock, not just SELECTs, and diff lock footprint before and after a migration.

**Leaving `performance_schema` disabled and wondering why `data_locks` is empty.** On many managed databases the schema is off by default for performance. If you query `data_lock_waits` and get nothing during a real wait, check `SHOW VARIABLES LIKE 'performance_schema'` and `performance_schema.setup`. You can enable instruments for `wait/lock/table/sql/handler` and `memory/innodb/lock` at the cost of a little overhead. Log without that and you are flying blind.

**Holding locks while calling outside services.** Pattern: `BEGIN`, `UPDATE inventory`, call payment API over HTTP for 2 seconds, then `UPDATE orders`, `COMMIT`. The inventory lock is held for the full HTTP time, so any concurrent inventory update will wait and potentially deadlock. Move external calls outside the transaction. Do the call first, then begin the transaction, do fast writes, commit. If you need atomicity with outside side effects, use an outbox table and a background worker.

**Large batch updates in one transaction.** Updating 10,000 rows in one transaction holds 10,000 row locks plus gaps. Any concurrent transaction that touches overlapping ranges will deadlock. Split batches into smaller chunks with commits in between, and sort each chunk by primary key. You trade atomicity of the huge batch for availability. If the batch must be atomic, schedule it off-peak and increase `innodb_lock_wait_timeout` cautiously rather than hiding deadlocks.

**Relying on `SELECT ... FOR UPDATE` order that is not deterministic.** Writing `SELECT ... FOR UPDATE WHERE sku IN ('Z','A')` without `ORDER BY` may lock rows in whatever order the index returns that day. Two transactions with the same set in different client-supplied order can still deadlock. Add `ORDER BY sku` or sort ids in app code so the lock acquisition order is deterministic.

## 7. Compare With Related Concepts

**Deadlock vs lock wait timeout.** A deadlock is a cycle that InnoDB detects quickly and breaks by killing one transaction with error 1213. A lock wait timeout is one transaction waiting for another that is simply slow, no cycle, killed after `innodb_lock_wait_timeout` seconds with error 1205. Retry the victim for deadlock, fix the holder for timeout. Confusing them leads to wrong retry behavior.

**Deadlock vs serialization failure in optimistic locking.** InnoDB deadlocks come from pessimistic row locks held while waiting. Optimistic locking with a version column fails at commit time with a different error when someone else changed the row. Both need a retry of the whole business operation, but optimistic conflicts are detected by your version check, not by a waits-for graph, and they never block. Use pessimistic locking when contention is high and you want blocking, optimistic when contention is low and you want to avoid locks.

**Gap lock deadlocks vs row lock deadlocks.** Row locks block only the exact record. Gap locks block the space between records and are needed to prevent inserts that would create phantom rows under `REPEATABLE READ`. Gap deadlocks often show up as `lock_mode X,GAP` and involve two transactions inserting nearby keys in opposite order. Switching that table or transaction to `READ COMMITTED` removes most gap locks but changes phantom protection, so you must be sure your invariant does not rely on it.

**`SHOW ENGINE INNODB STATUS` vs `performance_schema`.** The status report is history of the last deadlock, rich and human readable, but overwritten fast and only available interactively. `performance_schema` is live state, queryable, joinable to find current blockers, but has no history beyond now. Use the status for post-mortem of a deadlock and `performance_schema` for in-flight waits. Good runbooks collect both: log the status on 1213, poll `data_lock_waits` on 1205.

**InnoDB vs MyISAM locking for this topic.** InnoDB uses row-level locks with a deadlock detector. MyISAM uses table-level locks with no detector because a table lock cannot deadlock in the same way, it just queues. If someone says deadlocks prove the database is broken, they often expect MyISAM behavior. Moving to InnoDB gave concurrency but introduced the need to reason about lock order and index precision. You cannot fix an InnoDB deadlock by blaming the database, you fix it with ordered access and narrow indexes.

## 8. 🧠 The Memory Hook

Deadlock is two transactions that each grabbed one key and now stare at the other's door. InnoDB draws the waiting circle and throws one person out with error 1213. You debug by reading `SHOW ENGINE INNODB STATUS` as who holds what and who waits for what, live through `data_locks` and `data_lock_waits`, and you fix it by always grabbing keys in the same sorted order, locking one narrow row with a real index instead of the whole hallway, and retrying the whole visit from the beginning, not just the last door.
