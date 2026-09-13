# What are MySQL isolation levels

## 1. The Real-World Problem — When You Actually Hit This

Your app has been running fine for months on MySQL. Then under real traffic, two things start happening that make no sense. First, an update that touches a range of rows — like `UPDATE orders SET status = 'processing' WHERE amount BETWEEN 100 AND 200` — suddenly blocks an entirely unrelated `INSERT` of amount 150 in another transaction, and sometimes both transactions deadlock and one gets killed. Second, a long-running report transaction that just does `SELECT` queries starts making simple writes elsewhere slower, and your undo history keeps growing.

Nobody changed any code. The problem is the default you never thought about: MySQL InnoDB defaults to `REPEATABLE READ`. In that level, InnoDB does something Postgres never does — it locks the gaps between rows to stop phantom rows from appearing. That gap locking is invisible until it blocks or deadlocks a concurrent insert that looked completely safe.

This is when isolation levels stop being textbook definitions and become a production debugging skill. You need to know what each level promises, what it locks, and why MySQL's default is surprising if you came from Postgres.

## 2. The Analogy — Make the Mechanic Obvious

Think of your table as a long hallway of lockers numbered by your index, say `amount` values 10, 20, 30. Some lockers have stuff, most numbers are empty spaces between lockers.

A transaction is a person walking the hallway, looking at or changing lockers.

- `READ UNCOMMITTED` is like you are allowed to peek at someone's locker even while they are still holding the item in their hand and haven't put it away yet. If they change their mind and put it back, you saw something that never really happened. That's a dirty read.

- `READ COMMITTED` is like you only see what's been fully put away and the locker closed. But if you walk the hallway twice, someone might have put something away between your two walks. You see a different result the second time. That's a non-repeatable read. And if you counted "how many lockers have amount between 10 and 20" twice, a new locker could have been inserted between visits.

- `REPEATABLE READ` in MySQL is like you take a photo of the whole hallway the first time you look, and every time you look again during that visit, you look at the photo, not the live hallway. So you always see the same result. But MySQL goes further for writes and locking reads: when you say "I'm going to work on lockers 10 to 20" with `SELECT ... FOR UPDATE`, you not only lock those lockers, you put tape on the empty floor between them so nobody can wheel in a new locker in that range while you are there. That tape is a gap lock. Locker plus tape together is a next-key lock. That's how MySQL stops phantoms, even though the SQL standard says `REPEATABLE READ` shouldn't have to.

- `SERIALIZABLE` is like you put a guard at the hallway entrance. Even a plain `SELECT` without `FOR UPDATE` blocks anyone from changing the lockers you looked at until you leave. Everything runs as if one person at a time.

In our hallway, the interesting surprise is that gap tape. Postgres uses a completely different trick for phantoms — it never uses tape. It just keeps giving everyone a fresh or transaction-level photo and detects conflicts at commit time. That is why the same app can behave differently on MySQL and Postgres.

## 3. The Full Explanation — How It Actually Works

Isolation is about what one transaction is allowed to see while other transactions are running at the same time. The SQL standard defines three bad things you might see:

Dirty read is reading data another transaction wrote but hasn't committed yet, which could be rolled back. Non-repeatable read is reading the same row twice in one transaction and getting different values because someone else updated and committed in between. Phantom read is running the same range query twice, like `WHERE amount BETWEEN 10 AND 20`, and getting a different number of rows because someone inserted or deleted a row that matches.

The four levels promise to hide more of those as you go up: `READ UNCOMMITTED` hides nothing, `READ COMMITTED` hides dirty reads, `REPEATABLE READ` hides dirty and non-repeatable reads, `SERIALIZABLE` hides all three. MySQL InnoDB follows that ladder, but with its own InnoDB-specific implementation.

Underneath, InnoDB uses Multi-Version Concurrency Control, MVCC, plus locks. When a transaction updates a row, InnoDB doesn't overwrite the old row immediately. It writes a new version and keeps the old version in the undo log. Other transactions see the version that was visible to them based on a read view, which is basically a list of transaction IDs that were active when your transaction started.

In plain words, your transaction gets a snapshot. What snapshot you get depends on the level.

`READ UNCOMMITTED` in InnoDB lets a plain `SELECT` see uncommitted versions. It does almost no extra work to hide dirty reads. In practice you almost never use it. InnoDB still does row-level locking for writes, but reads don't block writes. There is no gap locking advantage here, and the performance gain over `READ COMMITTED` is negligible. If you think you need it for speed, you are almost always wrong.

`READ COMMITTED` gives you a new snapshot for every statement. Start a transaction, run `SELECT * FROM orders WHERE id = 1`, you see what was committed right before that statement. Run the same `SELECT` again five seconds later, you get a fresh snapshot that includes anything committed in between. That is why non-repeatable reads can happen. For locking reads like `SELECT ... FOR UPDATE`, InnoDB uses semi-consistent read and only locks the actual rows it finds, with no gap locks in most cases, except for foreign keys and unique checks which still need gap checks. Phantoms are allowed here because a new row can appear between two range queries.

`REPEATABLE READ` is the MySQL default, and this is the one to understand deeply. It gives you a snapshot once, at the first read in the transaction, and that snapshot stays the same for every plain `SELECT` in that transaction. So you will always read the same row value twice, and the same count twice, from your snapshot, even if other transactions commit changes. But that alone does not stop phantoms for writes. If you do `SELECT ... FOR UPDATE` or `UPDATE ... WHERE amount BETWEEN 10 AND 20`, InnoDB must make sure no new row can appear in that range and change the result of your locking read. It does that with gap locks and next-key locks. A gap lock locks the empty interval between two index entries. A next-key lock locks an index record plus the gap right after it. So a range query locks not just the rows it found but the gaps where a new row could be inserted. That's why an `INSERT` of 15 can block while another transaction holds a range lock on 10 to 20, even though 15 didn't exist before. This only happens on indexed columns and only for locking reads and range writes under `REPEATABLE READ` or `SERIALIZABLE`. Plain `SELECT` without `FOR UPDATE` never takes gap locks.

`SERIALIZABLE` is the strictest. In InnoDB, plain `SELECT` is implicitly turned into a locking read. It behaves like `SELECT ... LOCK IN SHARE MODE`, now written as `SELECT ... FOR SHARE` in MySQL 8.0. That means even a simple read blocks concurrent writes to the same rows or gaps. You get full isolation, but concurrency drops hard. You will see more lock waits and deadlocks. Use it only for tiny critical sections like ledger adjustments where you truly need to prevent any concurrent change.

Two practical mechanics you run into. Autocommit matters: in MySQL, every statement is its own transaction unless you run `BEGIN` or `START TRANSACTION` or turn off autocommit. Isolation only matters inside a multi-statement transaction. And scope matters: you set the level per transaction with `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`, per session with `SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED`, or globally. Setting it after you already ran `BEGIN` doesn't change the snapshot you already took.

Tradeoffs are straightforward. Lower isolation gives more concurrency, less locking, fewer deadlocks, but you accept more visibility anomalies in your business logic. Higher isolation gives correctness that matches what your code assumes — "if I read the count twice I'll get the same count" — but you pay with gap locks, lock waits, deadlocks, and longer undo history that can bloat and slow down reads if transactions stay open a long time. Most MySQL apps stay on the default `REPEATABLE READ` and learn to live with gap locks by keeping transactions short, indexing the columns they range-lock, and avoiding long reporting transactions in the same database as writes.

## 4. See It In Practice — Real Code or Queries

These examples assume InnoDB and MySQL 8.0 syntax. Run them with two MySQL sessions to see the blocking.

Check and set the level:

```sql
-- see current level for this session
SELECT @@transaction_isolation;

-- set for the next transaction only
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- set for whole session going forward
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- start a transaction and read with a locking read
START TRANSACTION;
SELECT * FROM orders WHERE amount BETWEEN 100 AND 200 FOR UPDATE;
-- or shared lock
SELECT * FROM orders WHERE amount BETWEEN 100 AND 200 FOR SHARE;
COMMIT;
```

Dirty read example — why READ UNCOMMITTED is dangerous:

```sql
-- Session A
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
START TRANSACTION;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
-- not yet committed

-- Session B at READ UNCOMMITTED sees the uncommitted -100
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
START TRANSACTION;
SELECT balance FROM accounts WHERE id = 1; -- sees the dirty value
-- if Session A rolls back, Session B acted on money that never existed
```

Non-repeatable read — allowed in READ COMMITTED, blocked by snapshot in REPEATABLE READ:

```sql
-- Session A stays in REPEATABLE READ
START TRANSACTION;
SELECT balance FROM accounts WHERE id = 1; -- snapshot taken here, say 1000

-- Session B commits an update
START TRANSACTION;
UPDATE accounts SET balance = 900 WHERE id = 1;
COMMIT;

-- Session A reads again
SELECT balance FROM accounts WHERE id = 1;
-- Under READ COMMITTED: sees 900 (new statement snapshot)
-- Under REPEATABLE READ: still sees 1000 (same transaction snapshot)
COMMIT;
```

Phantom prevention with gap locks — the MySQL-specific surprise:

```sql
-- table: orders(id PK, amount INT, INDEX idx_amount(amount))
-- Session A in default REPEATABLE READ
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;
-- This locks amount 10 and 20 and the gaps between them
SELECT * FROM orders WHERE amount BETWEEN 10 AND 20 FOR UPDATE;

-- Session B tries to insert in the gap, even though 15 didn't exist before
START TRANSACTION;
INSERT INTO orders (amount) VALUES (15); -- blocks under REPEATABLE READ
-- Under READ COMMITTED the same INSERT would succeed immediately

-- Check who is blocking whom
-- In a third session
SELECT * FROM performance_schema.data_locks\G
SHOW ENGINE INNODB STATUS\G
```

SERIALIZABLE turning plain reads into locks:

```sql
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
START TRANSACTION;
SELECT * FROM orders WHERE amount BETWEEN 10 AND 20; -- now acts like FOR SHARE
-- concurrent Session B that tries
-- UPDATE orders SET amount = 15 WHERE amount = 12
-- will block until Session A commits
COMMIT;
```

Keeping transactions short to avoid undo bloat:

```sql
-- bad: long report transaction holds old snapshot open for minutes
START TRANSACTION;
-- runs many SELECTs that reuse the same old snapshot
-- keeps undo log from being purged, history list grows
SELECT * FROM large_table WHERE created_at > '2024-01-01';
-- ... do application work for 30 seconds ...
COMMIT;

-- better: use READ COMMITTED for reporting, or single-statement autocommit selects
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
-- each SELECT gets fresh snapshot, undo can be cleaned sooner
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What are the four MySQL InnoDB isolation levels and what does each guarantee?**

All four hide dirty reads except `READ UNCOMMITTED`. `READ COMMITTED` hides dirty reads but allows non-repeatable and phantom reads. `REPEATABLE READ`, the MySQL default, hides dirty and non-repeatable reads and in InnoDB also hides phantoms for locking reads because of gap and next-key locks — plain `SELECT` phantoms are already hidden by the transaction snapshot. `SERIALIZABLE` hides everything by making plain reads act as locking reads, so no concurrent transaction can change what you read. The higher you go, the more locking and less concurrency.

**Q: What is the default isolation level in MySQL and why does that surprise people coming from Postgres?**

MySQL InnoDB defaults to `REPEATABLE READ`. Postgres defaults to `READ COMMITTED`. So a query that runs fine on Postgres in `READ COMMITTED` might deadlock or block on MySQL because MySQL's default adds gap locks on range locking reads. Also, MySQL's `READ UNCOMMITTED` actually allows dirty reads, while Postgres treats `READ UNCOMMITTED` as `READ COMMITTED` and never shows dirty reads. If you port an app without changing isolation thinking, you get different blocking behavior.

**Q: What is the difference between dirty read, non-repeatable read, and phantom read?**

Dirty read is reading someone else's uncommitted write that might roll back, so you read data that never officially existed. Non-repeatable read is reading the same row twice in one transaction and getting different column values because someone else updated that row and committed. Phantom read is running the same range query twice, like `WHERE status = 'pending'` or `WHERE amount BETWEEN 10 AND 20`, and getting a different set of rows because someone inserted or deleted a matching row. Dirty is about uncommitted data, non-repeatable is about changed data in an existing row, phantom is about a changed set of rows.

**Q: How does InnoDB REPEATABLE READ prevent phantoms if the SQL standard says it shouldn't have to?**

The standard says `REPEATABLE READ` may allow phantoms. Postgres follows that strictly and prevents phantoms only at `SERIALIZABLE`. InnoDB goes further. It combines MVCC snapshots for plain reads, which already hide phantoms from your snapshot, with gap and next-key locks for locking reads and range writes. When you do `SELECT ... FOR UPDATE` or `UPDATE ... WHERE indexed_col BETWEEN a AND b` under `REPEATABLE READ`, InnoDB locks the index gaps so no other transaction can insert a new row that would match the range. That extra locking is what prevents phantoms, and it is also why you get gap-lock deadlocks that the standard doesn't require.

**Q: What are gap locks and next-key locks and when do they appear?**

A gap lock locks the empty space between two index entries, or before the first entry, or after the last. A next-key lock is a record lock plus the gap right after it. They only appear in InnoDB when you use a locking read, `SELECT ... FOR UPDATE` or `SELECT ... FOR SHARE`, or a range `UPDATE` or `DELETE`, while in `REPEATABLE READ` or `SERIALIZABLE`, and only on indexed columns. A plain `SELECT` without `FOR UPDATE` or `FOR SHARE` never takes them. If you run a range query on a non-indexed column, InnoDB may have to lock a much larger gap, sometimes effectively the whole table, which is why a missing index can turn a small range lock into a big block.

**Q: How is MySQL REPEATABLE READ different from Postgres REPEATABLE READ?**

Both give you a transaction-level snapshot, so plain reads are repeatable. The difference is how they handle phantoms and writes. MySQL uses gap locks to block phantom inserts. Postgres never uses gap locks; it uses MVCC snapshots and at `SERIALIZABLE` uses Serializable Snapshot Isolation, SSI, which tracks read-write dependencies and aborts one transaction at commit time if a serial anomaly could occur, rather than blocking the insert immediately. So on MySQL you see blocking and gap deadlocks, on Postgres you see optimistic aborts with errors like "could not serialize access due to concurrent update" that your app must retry.

**Q: Does setting isolation to SERIALIZABLE make MySQL truly serial, and what is the cost?**

Yes, but by brute force. InnoDB turns every plain `SELECT` into a shared locking read, so any transaction that reads a range blocks anyone who wants to write that range until the reader commits. There are no anomalies, but concurrency drops a lot. Throughput falls, lock wait timeouts rise, and deadlocks become more common. Use it only for short critical sections. For most apps, `REPEATABLE READ` or even `READ COMMITTED` with careful application-level checks gives better throughput than making everything `SERIALIZABLE`.

**Q: When would you lower isolation from REPEATABLE READ to READ COMMITTED in a real MySQL app?**

When gap-lock blocking and deadlocks hurt more than the anomalies you would accept. High-concurrency write workloads, like order creation with frequent range updates or queue tables where you `SELECT ... FOR UPDATE SKIP LOCKED`, often run better on `READ COMMITTED` because it doesn't gap-lock, so inserts don't block range locks. Reporting workloads also prefer `READ COMMITTED` or autocommit reads because they don't hold a long snapshot open that keeps undo history alive. You switch when you can handle non-repeatable reads in application logic — for example, by re-reading rows after locking them or by using optimistic version checks — and you keep transactions very short.

## 6. The Traps — What Goes Wrong in Production

One common trap is assuming `REPEATABLE READ` on MySQL works the same as on Postgres. On MySQL, a `SELECT ... FOR UPDATE WHERE amount BETWEEN 10 AND 20` puts gap locks on that amount range. On Postgres it doesn't. So code tested on Postgres that does range locking reads suddenly deadlocks on MySQL with "Deadlock found when trying to get lock" or blocks with "Lock wait timeout exceeded" on an insert that looked unrelated. The fix is to know that MySQL range locking reads lock gaps: keep those transactions short, have an index on the range column, lock only the rows you need, and be ready to retry deadlocks.

Another trap is thinking `READ COMMITTED` prevents phantoms. It doesn't. If your business logic does a `SELECT COUNT(*) WHERE status = 'pending'` then inserts or updates based on that count, running that twice under `READ COMMITTED` can give you different counts because someone else can insert a pending row in between your two statements. If you need that count to stay stable, you need `REPEATABLE READ` with a locking read, or a unique constraint plus retry, or `SERIALIZABLE` for that small section.

A third trap is holding a `REPEATABLE READ` transaction open for a long time because you think plain `SELECT` is free. It isn't free for the database. That transaction's snapshot prevents InnoDB from purging old row versions in the undo log. The history list grows, storage grows, and other queries that need to reconstruct old versions get slower. You see it as steadily slower reads and a growing `History list length` in `SHOW ENGINE INNODB STATUS`. Fix it by committing quickly, not doing application work inside an open transaction, and using `READ COMMITTED` or autocommit for long reports.

A fourth trap is thinking a plain `SELECT` in `REPEATABLE READ` blocks writers. It doesn't. Only `SELECT ... FOR UPDATE` or `FOR SHARE` or an `UPDATE`/`DELETE` takes gap locks. A common bug is adding no lock to a check-then-act sequence: you `SELECT balance` to check if funds are available, then `UPDATE` later, but another transaction changes the balance in between because your read wasn't locking. Put `FOR UPDATE` on the check read if you need to hold the lock.

A fifth trap is setting isolation at the wrong scope. `SET TRANSACTION ISOLATION LEVEL` only affects the next transaction. `SET SESSION` affects future transactions in that connection. `SET GLOBAL` affects new connections. If you run `BEGIN`, then `SET TRANSACTION ISOLATION LEVEL READ COMMITTED`, your already-started transaction keeps the old snapshot. Order matters: set the level before `BEGIN`. And many connection pools run `SET SESSION` once on checkout, so one connection may have a different level than another if you aren't consistent.

A sixth trap is using `READ UNCOMMITTED` for performance. In InnoDB there is almost no gain. Writes still take row locks, MVCC still keeps versions, and you now risk reading rolled-back data. Don't do it to make things faster. Use proper indexes or `READ COMMITTED` instead.

A seventh trap is range-locking a column that has no index. Without an index, InnoDB can't lock a narrow gap — it has to lock wider, sometimes the whole table gap. A query like `UPDATE users SET status = 'x' WHERE non_indexed_col = 'y'` under `REPEATABLE READ` can block a huge number of concurrent inserts. Add an index on the column you lock by range.

## 7. Compare With Related Concepts

MySQL REPEATABLE READ vs Postgres READ COMMITTED defaults. MySQL's default keeps the same snapshot for the whole transaction and adds gap locks for locking reads. Postgres's default gives a fresh snapshot per statement and never uses gap locks. So MySQL prioritizes snapshot stability at the cost of blocking, Postgres prioritizes concurrency at the cost of allowing non-repeatable reads within a transaction. Rule: expect gap-lock surprises when moving a Postgres app to MySQL, and expect retry-on-serialization-error patterns when moving the other way.

MySQL gap locking vs Postgres Serializable Snapshot Isolation. MySQL blocks the conflicting insert immediately with a gap lock. Postgres lets both transactions proceed and aborts one at commit if the execution wouldn't have been possible serially. Rule: on MySQL tune lock order and indexes to avoid deadlocks, on Postgres add application retry for serialization failures.

Isolation level vs locking reads. Isolation controls what snapshot your plain `SELECT` sees. Locking reads are explicit pessimistic locks you add with `FOR UPDATE` or `FOR SHARE`. You can be in `READ COMMITTED` and still take strong gaps if you ask for them with `FOR UPDATE` on a unique check, and you can be in `REPEATABLE READ` and still not lock anything if you only use plain `SELECT`. Rule: set the level for the default snapshot policy, use locking reads for the rows and ranges you actually need to protect.

Isolation level vs autocommit. With autocommit on, each single `SELECT` is its own transaction, so `REPEATABLE READ` and `READ COMMITTED` look almost the same because there is only one statement per snapshot. The differences appear when you wrap multiple statements in `BEGIN ... COMMIT`. Rule: if you aren't using explicit transactions, isolation choice barely matters.

MVCC snapshot isolation vs two-phase locking. MVCC lets readers not block writers and writers not block readers by keeping old versions. Two-phase locking would make reads block writes. InnoDB mixes both: plain reads use MVCC snapshots, locking reads and writes use locks including gaps. Rule: use plain reads for concurrency, use locking reads only around the critical check-then-act moment.

## 8. 🧠 The Memory Hook

Isolation is whose photo you see and whose inserts you block. `READ COMMITTED` gives you a new photo per statement and lets anyone insert anywhere. MySQL `REPEATABLE READ` gives you one photo for the whole transaction and tapes closed the gaps in any range you lock — that tape is the gap lock. `SERIALIZABLE` makes even a plain photo put tape down. If your MySQL app deadlocks on an insert that "shouldn't conflict," check the tape — it's a gap lock from a `REPEATABLE READ` range lock in another transaction.
