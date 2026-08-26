# What is row-level locking

## 1. The Real-World Problem — When You Actually Hit This

Your app has been fine for months. You have an `orders` table with 2 million rows. One day two customers try to pay for two completely different orders at the exact same second. Customer A updates order 1042 to `paid`. Customer B updates order 1043 to `paid`. Those rows have nothing to do with each other.

If the database locked the whole table for every `UPDATE`, Customer B would have to wait for Customer A to finish — even though they touched different rows. Multiply that by a busy checkout, a background job updating 100,000 rows, and an admin editing a single order, and the whole app freezes. Throughput collapses, latency spikes, and you get timeouts for no good reason.

Row-level locking is how PostgreSQL fixes that. Instead of locking the entire table, it locks only the specific row being changed — or the specific rows you explicitly ask to lock — so everyone else can keep working on all the other rows at the same time.

## 2. The Analogy — Make the Mechanic Obvious

Think of your table as an apartment building. Each row is one apartment. The table lock is the lock on the front entrance of the building. A row lock is the lock on a single apartment door.

If you lock the building entrance, nobody can enter any apartment. That is what a table-level lock does. Useful if you are renovating the whole building, terrible if you just want to repaint one kitchen.

If you lock only apartment 4B, the resident of 4C walks straight in. That is a row-level lock. Two electricians can work in two different apartments at the same time without ever meeting.

Now map the Postgres specifics:

In this building, just looking through a window does not require a key. That is MVCC — a plain `SELECT` peeks at a snapshot and never blocks anyone. If you want to actually reserve an apartment for remodeling, you have to put your name on that door. `SELECT ... FOR UPDATE` is you putting a "reserved, do not touch" sign on 4B. `SELECT ... FOR SHARE` is you putting a "you can look, but do not remodel until I am done" sign — others can also look, but nobody can start demolition.

Heavyweight locks are those door signs. They stay up until you check out at the front desk — that is `COMMIT` or `ROLLBACK`. Lightweight locks are the building manager's clipboard. The manager holds it for two seconds to update the guest log so two people do not get the same room assignment. You never see the clipboard as a door sign, but without it the internal bookkeeping would break.

And deadlocks: you have reserved 4B and want 4C, I have reserved 4C and want 4B. We both stand in the hallway forever. Postgres is the manager who notices and tells one of you to let go and try again.

## 3. The Full Explanation — How It Actually Works

In plain words, row-level locking means the database remembers "this transaction is working on these exact rows" instead of "this transaction owns the whole table." Any other transaction that wants to change the same rows has to wait. Any transaction that wants to touch different rows goes ahead normally.

Here is how PostgreSQL does it for real.

Postgres uses MVCC, which stands for multi-version concurrency control. Every row version has hidden `xmin` and `xmax` fields that say which transaction created it and which transaction deleted or updated it. When you run a plain `SELECT`, Postgres builds a snapshot of what the database looked like when your transaction started and shows you that snapshot. You do not take a lock to read, and your read does not block a writer. A writer creates a new version of the row and marks the old one as expired for future snapshots. Readers and writers do not block each other at all unless you explicitly ask for a lock.

You get a row lock automatically when you modify a row. `UPDATE`, `DELETE`, and `SELECT ... FOR UPDATE` acquire an exclusive row lock on each row they touch. The lock lives until the end of the transaction that acquired it. It is not released after the single statement — it stays until `COMMIT` or `ROLLBACK`. That is why long transactions are dangerous.

If you want to lock rows before you update them — the classic "check balance, then deduct" pattern — you do it explicitly:

`SELECT ... FOR UPDATE` takes an exclusive row lock. No other transaction can take any lock on those rows until you finish. Use it when you intend to `UPDATE` or `DELETE` the rows you just read.

`SELECT ... FOR NO KEY UPDATE` is a weaker exclusive lock that still blocks `FOR UPDATE` and `FOR SHARE` but allows other transactions to update non-key columns or take a `FOR KEY SHARE`. Postgres uses it internally to reduce blocking when you are not changing the primary key.

`SELECT ... FOR SHARE` takes a shared lock. Many transactions can hold `FOR SHARE` on the same row at the same time, but none of them can take `FOR UPDATE` and no one can modify the row until all share holders are done.

`SELECT ... FOR KEY SHARE` is even weaker — it only blocks updates to the primary key or unique columns, which protects foreign key checks without blocking normal updates.

You can add `NOWAIT` to fail immediately if the row is already locked instead of waiting, and `SKIP LOCKED` to silently skip locked rows and return only unlocked ones. Both are essential for queues and job dispatchers.

Heavyweight locks versus lightweight locks is a distinction interviewers love. Heavyweight locks are the real transaction locks you see in `pg_locks`. They have a lock type, a mode, a target like `relation` or `tuple`, and they are held for a long time — potentially the whole transaction. Row-level locks are heavyweight locks. Table locks are also heavyweight, just at a coarser granularity. Lightweight locks, called LWLocks, are tiny internal spinlocks that protect shared memory structures like buffers, the WAL, or the lock table itself. They are held for microseconds, not for the transaction, and they never show up as blocked queries. If someone says "row locking is lightweight," they are mixing the two up.

Deadlocks happen because row locks wait in a queue. Transaction A locks row 1 and wants row 2. Transaction B locks row 2 and wants row 1. Neither can proceed. Postgres runs a deadlock detector every `deadlock_timeout` (default 1 second), finds the cycle in the waits-for graph, picks a victim, and aborts it with `deadlock detected`. The victim gets an error and must retry. The other transaction goes through. Your job is to make deadlocks rare by always locking rows in a consistent order and keeping transactions short.

Bulk `UPDATE`s create their own pain. Postgres does not escalate row locks to a table lock, even if you update five million rows — you will simply hold five million row locks until commit, which eats memory in the lock manager and creates a very long transaction. That long transaction blocks `VACUUM` from cleaning up dead tuples, bloats the table, holds WAL, and any other transaction trying `SELECT ... FOR UPDATE` on any of those rows will queue behind you. A single `UPDATE orders SET status = 'archived' WHERE created_at < '2023-01-01'` can stall the whole checkout flow for minutes. The fix is to batch: update 1,000 to 10,000 rows per transaction in a loop and commit between batches.

Row locks also interact with indexes. The lock is on the tuple, not the index entry. Even if you have a perfect index, the winning transaction still locks the heap row. And `SELECT ... FOR UPDATE` will lock the rows it touches, not the rows it scanned via the index but filtered out, unless Postgres had to visit them.

Use row-level locking when you need to enforce correctness under concurrency — inventory counts, balances, seat reservations, job claiming. Do not use it to protect a read-only report or a long user think-time. If the lock would be held while waiting for the user to click "confirm," you will block everyone else.

## 4. See It In Practice — Real Code or Queries

All queries below are PostgreSQL syntax. Run each transaction in a separate `psql` session to see the blocking.

Transaction holds a row lock until it ends. Plain reads do not block.

```sql
-- Session A: lock row 42 for an update
BEGIN;
SELECT id, balance FROM accounts WHERE id = 42 FOR UPDATE;
-- This row is now locked. No other FOR UPDATE or UPDATE on id = 42 can proceed.
-- But every other row in accounts is completely free.

-- Session B (at the same time): this reads fine, no block, thanks to MVCC
SELECT id, balance FROM accounts WHERE id = 42;
-- No FOR UPDATE, so it just reads the snapshot and returns instantly

-- Session B: this WILL block until Session A commits or rolls back
SELECT id, balance FROM accounts WHERE id = 42 FOR UPDATE;
-- or: UPDATE accounts SET balance = balance - 100 WHERE id = 42;

-- Session A: finish and release the lock
UPDATE accounts SET balance = balance - 100 WHERE id = 42;
COMMIT; -- or ROLLBACK; lock is released here, Session B unblocks
```

Choose the right lock strength for the job.

```sql
-- You intend to update: use FOR UPDATE (exclusive)
BEGIN;
SELECT stock FROM products WHERE id = 7 FOR UPDATE;
-- check stock in app code, then
UPDATE products SET stock = stock - 1 WHERE id = 7;
COMMIT;

-- You only need to prevent writes while you read: use FOR SHARE
BEGIN;
SELECT * FROM products WHERE id = 7 FOR SHARE;
-- Others can also take FOR SHARE, but no one can FOR UPDATE or UPDATE until you commit
COMMIT;

-- Queue / job dispatcher: skip rows that are already being processed
-- Multiple workers can run this at once and never grab the same job
BEGIN;
SELECT id FROM jobs
WHERE status = 'pending'
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 1;

UPDATE jobs SET status = 'processing' WHERE id = :job_id;
COMMIT;

-- Fail fast instead of waiting: useful for UI that should not hang
SELECT id FROM accounts WHERE id = 42 FOR UPDATE NOWAIT;
-- If already locked, you get immediately: ERROR: could not obtain lock on row
```

Batch bulk updates so you do not hold millions of row locks in one transaction.

```sql
-- Bad: one giant transaction that holds locks on every old order for minutes
-- UPDATE orders SET status = 'archived' WHERE created_at < '2023-01-01';

-- Good: loop in app code or in a DO block, commit between batches
DO $$
DECLARE
  batch int;
BEGIN
  LOOP
    WITH cte AS (
      SELECT id FROM orders
      WHERE status = 'old' AND created_at < '2023-01-01'
      LIMIT 5000
      FOR UPDATE SKIP LOCKED
    )
    UPDATE orders SET status = 'archived'
    WHERE id IN (SELECT id FROM cte);

    GET DIAGNOSTICS batch = ROW_COUNT;
    EXIT WHEN batch = 0;
    COMMIT; -- release row locks every 5k rows so others can proceed
  END LOOP;
END $$;
```

Inspect what is locked right now.

```sql
-- See heavyweight locks (row and table) held or waited on
SELECT locktype, database, relation::regclass, mode, granted, pid
FROM pg_locks
WHERE locktype = 'tuple';

-- See who is blocking whom (Postgres 14+)
SELECT * FROM pg_stat_activity WHERE wait_event_type = 'Lock';

-- Check a specific row's lock holder
SELECT * FROM pg_locks WHERE transactionid IS NOT NULL;
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is row-level locking and why does PostgreSQL use it instead of just locking the whole table?**

Row-level locking means the database locks only the individual rows a transaction is actually changing or has explicitly reserved with `FOR UPDATE`, not the entire table. PostgreSQL uses it because table-level locks kill concurrency. If every `UPDATE` locked the whole table, two transactions updating different rows would serialize and throughput would collapse under any real load. Row locks let Postgres allow thousands of concurrent writers as long as they touch different rows. Table locks still exist in Postgres, but they are for DDL and explicit `LOCK TABLE` — normal DML aims for the narrowest lock possible.

**Q: How do you explicitly take a row lock in PostgreSQL? What is the difference between `FOR UPDATE` and `FOR SHARE`?**

You take it with `SELECT ... FOR UPDATE` or `SELECT ... FOR SHARE` inside a transaction. `FOR UPDATE` is exclusive — once you hold it, no other transaction can take `FOR UPDATE`, `FOR SHARE`, or modify that row until you commit or roll back. Use it when you read a row and plan to update or delete it right after, like checking a balance before deducting. `FOR SHARE` is shared — many transactions can hold it at once, but nobody can take `FOR UPDATE` or modify the row while any share lock is held. Use it when you need to make sure the row does not change while you read it, but you are not going to change it yourself, such as validating a foreign key reference across multiple statements.

**Q: Does a plain `SELECT` block or get blocked by row locks?**

No, and that is the whole point of MVCC. A plain `SELECT` without any `FOR ...` clause never takes a row lock and never waits for row locks. It reads from a snapshot taken at the start of the query or transaction. Writers create new versions of rows; readers see the last committed version visible to their snapshot. The only `SELECT`s that block are those with `FOR UPDATE`, `FOR SHARE`, and their variants, because they explicitly asked to reserve the row for a future write or to prevent a write.

**Q: What is the difference between heavyweight locks and lightweight locks (LWLocks) in PostgreSQL?**

Heavyweight locks are the transactional locks managed by the lock manager. They protect database objects — tables, rows, advisory locks — have modes like `RowExclusiveLock` or `ShareLock`, appear in `pg_locks` and `pg_stat_activity`, can block for seconds or minutes, and are held until transaction end. Row-level locks are heavyweight. LWLocks are internal spinlocks that protect shared memory data structures like buffer pages, the WAL insert pointer, or the lock table itself. They are held for microseconds while a backend updates a memory structure, never show up as a row-lock wait, and are not tied to a transaction. Confusing the two makes it sound like row locks are cheap internal latches — they are not.

**Q: What causes a deadlock with row-level locks and how does PostgreSQL handle it?**

A deadlock needs a cycle. The classic case is two transactions updating the same two rows in opposite order: A locks row 1 and wants row 2, B locks row 2 and wants row 1. Neither can proceed. Another common case is a bulk job and an interactive transaction touching overlapping rows. PostgreSQL detects this by building a waits-for graph every `deadlock_timeout`. When it finds a cycle, it aborts one transaction — the victim — with `ERROR: deadlock detected`, rolls it back, and lets the other continue. The victim must retry. You reduce deadlocks by always locking rows in a consistent order (`ORDER BY id`), keeping transactions short, and batching bulk updates.

**Q: Why is a bulk `UPDATE` that touches millions of rows dangerous even though PostgreSQL uses row-level locking?**

Because PostgreSQL does not escalate row locks to a table lock. Each of those millions of rows gets its own row lock held until the transaction commits. That one long transaction bloats `pg_locks`, generates a huge amount of WAL, prevents `VACUUM` from cleaning up dead tuples created by the update, and blocks any concurrent `SELECT ... FOR UPDATE` or `UPDATE` that wants any of those same rows. The whole table feels frozen. The fix is to do the work in small batches — say 1,000 to 10,000 rows — and `COMMIT` between batches so locks are released quickly. Add `SKIP LOCKED` if multiple workers batch in parallel.

**Q: What do `NOWAIT` and `SKIP LOCKED` do?**

Both change what happens when the row you want is already locked. `FOR UPDATE NOWAIT` says "if the row is locked, fail immediately with an error instead of waiting." Good for UIs where you would rather show "someone else is editing this" than hang. `FOR UPDATE SKIP LOCKED` says "if the row is locked, pretend it does not exist and give me the next unlocked row." That is the building block for work queues — every worker runs `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1` and they naturally divide the work without ever blocking each other.

## 6. The Traps — What Goes Wrong in Production

**Holding `FOR UPDATE` across user think time.** You start a transaction, do `SELECT ... FOR UPDATE`, then call an external API or wait for the user to click confirm before you `COMMIT`. That row lock is held the whole time. Every other transaction that needs that row queues. Latency climbs, connections pile up, and you exhaust the pool. Never hold a row lock while waiting on a human or a network call. Read, decide, and write in one short transaction.

**Updating without a consistent lock order.** Transaction A does `UPDATE accounts SET balance = balance - 10 WHERE id IN (2,1)` and transaction B does `WHERE id IN (1,2)`. Internally Postgres locks rows in the order they are visited, which can differ. They deadlock even though they touch the same rows. Always `ORDER BY id` when you `SELECT ... FOR UPDATE` on multiple rows so every transaction locks in the same order.

**One giant `UPDATE` for a backfill.** `UPDATE orders SET status = 'archived' WHERE created_at < '2022-01-01'` looks simple and then runs for 10 minutes holding millions of row locks, blocks vacuum, bloats the table with dead tuples, and stalls every checkout that needs any of those rows. Batch it, add a `WHERE` that uses an index, and commit between batches. Monitor `pg_stat_activity` and `pg_locks` while the backfill runs.

**Forgetting that row locks live until commit, not until the statement ends.** Developers assume the lock goes away after the `UPDATE` finishes. In Postgres the heavyweight row lock is transaction-scoped. If you are in an explicit `BEGIN ... COMMIT` block, the lock stays until `COMMIT`. An uncommitted idle transaction in a connection pool can hold row locks indefinitely. Set `idle_in_transaction_session_timeout` and always return connections cleanly.

**Using `FOR UPDATE` without considering `SKIP LOCKED` for queues.** A job table where every worker does `SELECT ... FOR UPDATE LIMIT 1` will serialize — only one worker gets a job, the rest wait. Workers appear hung and throughput drops to one. For queues, the correct pattern is `FOR UPDATE SKIP LOCKED` with `ORDER BY` so workers skip busy rows.

**Thinking `SELECT` needs a lock to be "safe."** Wrapping every read in `FOR SHARE` or `FOR UPDATE` "just in case" turns a system that could scale via MVCC into one where reads block writes for no benefit. Only lock when you have a read-modify-write cycle that needs to prevent a race. Otherwise trust the snapshot.

## 7. Compare With Related Concepts

**Row-level lock vs table-level lock.** A row lock pins one tuple; a table lock pins the whole relation. Postgres takes a weak table lock (`RowExclusiveLock`) on every `INSERT`/`UPDATE`/`DELETE` so DDL knows someone is writing, but it does not block other writers to different rows. An explicit `LOCK TABLE users IN ACCESS EXCLUSIVE MODE` blocks everything — reads and writes — and is for migrations or manual maintenance. Rule: use row locks for concurrency, table locks only when you are changing the structure or need to freeze the whole table.

**Row-level lock vs page-level lock.** Some databases lock an entire 8KB data page to protect nearby rows. PostgreSQL does not use page-level locks for concurrency control on rows — it goes finer and locks the tuple itself. Page-level concepts still exist for internal buffer management via LWLocks, but that is memory protection, not transaction isolation. Rule: if you hear "page lock" in Postgres, think buffer pin and LWLock, not a user-visible transaction lock.

**Row-level lock vs advisory lock.** Row locks are tied to actual rows — you cannot lock a row that does not exist, and the lock goes away at commit. Advisory locks (`pg_advisory_lock`, `pg_advisory_xact_lock`) are application-level mutexes identified by a number you invent. They can protect a business concept that has no row, like "only one report generator at a time" or "lock user 42 across multiple tables." They must be released explicitly or at transaction end. Rule: if you are protecting a real row you just read, use `FOR UPDATE`. If you are protecting a workflow, a resource name, or a gap that has no row, use an advisory lock.

**`FOR UPDATE` vs `FOR SHARE` vs `FOR KEY SHARE`.** All three are row-level, but they block differently. `FOR UPDATE` blocks everything. `FOR SHARE` lets other `FOR SHARE` holders in but blocks `FOR UPDATE` and writes. `FOR KEY SHARE` only blocks changes to the primary key or unique columns, so foreign key checks can run without blocking normal updates. Rule: need to update the row next — `FOR UPDATE`. Need to make sure nobody changes it while you look — `FOR SHARE`. Only need to make sure the key does not disappear for a FK check — `FOR KEY SHARE`.

**Row lock vs optimistic locking.** Row locks are pessimistic — you lock first, then work, and anyone else waits. Optimistic locking uses a `version` or `updated_at` column, lets everyone read freely, and checks at write time whether someone else changed the row in the meantime (`UPDATE ... WHERE version = $oldVersion`). If the check fails, you retry. Optimistic is faster under low contention and across user think time; pessimistic with `FOR UPDATE` is faster when contention is high and retries would be constant. Rule: user-facing edit with think time — optimistic. Hot inventory row inside a short transaction — pessimistic row lock.

## 8. 🧠 The Memory Hook

Row-level locking is a lock on one apartment, not the whole building. In Postgres, `SELECT ... FOR UPDATE` puts your name on that door until you check out with `COMMIT`, plain `SELECT`s just look through the window thanks to MVCC, and `SKIP LOCKED` lets the next worker take the next free apartment instead of waiting in the hall.
