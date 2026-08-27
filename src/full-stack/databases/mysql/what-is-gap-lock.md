# Gap Lock in MySQL InnoDB

## 1. The Real-World Problem — When You Actually Hit This

Your checkout service runs fine for months. Then one afternoon, two users try to place an order at the exact same second and one of them hangs for 30 seconds before the app throws `Deadlock found when trying to get lock`.

You look at the logs. Transaction A did this:

```sql
SELECT * FROM accounts WHERE id = 15 FOR UPDATE;
```

It returned zero rows. Nothing to lock, you think. So Transaction A decides it is safe to insert `id = 15`.

At the same moment Transaction B did:

```sql
SELECT * FROM accounts WHERE id = 16 FOR UPDATE;
```

Also zero rows. Also looked harmless.

Then Transaction A tries to `INSERT id = 15` and just blocks. Transaction B tries to `INSERT id = 16` and the database kills one of them with a deadlock. Neither insert touched the same row. Neither insert conflicted with an existing row. Both inserted different IDs. So why were they blocked on each other?

That is the gap lock surprise. In MySQL's default `REPEATABLE READ`, InnoDB does not just lock rows that exist. It locks the empty spaces *between* rows where a new row could appear. If you only locked existing rows, a second transaction could slip a new row into that empty space between your first read and your next write. That phantom row would make your repeatable read not repeatable and it would break statement-based replication. So InnoDB says: if you asked for a locking read over a range or a missing key, I will lock the gap itself.

It feels wrong until you see it: an `INSERT` can be blocked even though no conflicting row exists, because someone else is guarding the empty pavement where that row would be parked.

## 2. The Analogy — Make the Mechanic Obvious

Think of an InnoDB index as a street with parked cars.

Each parked car is an existing index record. Say cars are parked at positions 10, 20, and 30 along the curb. The curb has four empty stretches: before car 10, between 10 and 20, between 20 and 30, and after car 30 stretching to infinity.

A **record lock** is putting a boot on one specific parked car. Nobody can move or repaint that car while the boot is on, but anyone can still park in the empty stretches.

A **gap lock** is putting traffic cones across an empty stretch of curb between two cars. You are not touching either car. You are just roping off the empty pavement and saying "nobody parks here." You can cone off `(10, 20)` and that does not lock car 10 or car 20, only the empty space where car 15 would go.

A **next-key lock** is the combination: the boot on a car plus the cones on the empty stretch right before it. If you next-key lock car 20, you locked car 20 itself plus the gap `(10, 20]` — the half-open interval that includes the car at the end but not the car at the start.

Here is why the deadlock makes sense in this picture. Two traffic officers can put their own cones on the *exact same* empty stretch at the same time and not fight. Their job is identical: keep it empty. So two transactions can both hold a gap lock on `(10, 20)` together — gap locks never conflict with each other, not even exclusive ones.

But a driver who turns on their blinker and tries to pull into that stretch — that is an **insert intention lock**. The driver is saying "I want to park here." The cones block the blinker. The driver has to wait until every officer removes their cones. Now imagine Officer A and Officer B both coned the same stretch, and then both drivers behind them want to park there. A waits for B's cones, B waits for A's cones. Deadlock. One of them has to give up.

That is exactly how `SELECT ... FOR UPDATE` on a missing key plus a later `INSERT` deadlocks in production.

## 3. The Full Explanation — How It Actually Works

Gap locks are an InnoDB thing, and they only exist because of how InnoDB indexes and isolation work.

All InnoDB locks are index locks — they live on the B+Tree index you searched, not on the table as a heap. When you do a locking read, InnoDB walks the index and decides, for each index entry it looks at, do I lock the record, the gap before it, or both.

In plain words, a gap is just the open interval between two adjacent index keys. With keys `[10, 20, 30]` the gaps are `(-infinity, 10)`, `(10, 20)`, `(20, 30)`, and `(30, +infinity)`. That last gap after the final key is real — InnoDB implements it as a gap lock on a hidden system record at the end of the index called the supremum pseudo-record.

Why does InnoDB lock those gaps? Two reasons. First, to stop phantom reads for locking reads. A phantom read is when you run `SELECT ... FOR UPDATE WHERE balance > 1000` and get three rows, then another transaction inserts a fourth row with `balance = 5000`, and your next query in the same transaction suddenly sees four rows. Your repeatable read was not repeatable. To prevent that, InnoDB locks not just the three rows it found, but every gap where a new matching row could be inserted. Second, for statement-based replication, replicas must replay statements in an order that produces the same rows. If phantoms were allowed, the primary and replica could diverge.

A gap lock's key trade-off is concurrency for correctness. You gain a guarantee that no phantom appears inside a locking read that ran in `REPEATABLE READ`. You pay with more blocking. Any `INSERT` that wants to land in a locked gap has to wait, even if it is inserting a logically unrelated row that happens to sort into the same gap. And because gap locks do not block each other, you can build up a hidden pile of waiters that only explodes when someone finally tries to insert.

Crucially, gap locks are not for normal reads. A plain `SELECT` without `FOR UPDATE` or `LOCK IN SHARE MODE` takes no locks at all in InnoDB. It reads a snapshot through MVCC from undo logs. Gap locks only appear for locking reads — `SELECT ... FOR UPDATE`, `SELECT ... LOCK IN SHARE MODE` — and for writes like `UPDATE` and `DELETE` that must lock what they scan. If you are not doing a locking read, you are not holding gap locks.

The compatibility rule is what surprises most developers. A shared gap lock and an exclusive gap lock mean the same thing and they are compatible with each other. Both just mean "keep this empty." The only thing they block is an insert intention lock, which is the special gap-like lock an `INSERT` asks for right before it writes, meaning "I intend to park at this exact position in the gap." Multiple gap locks can coexist. One gap lock plus one insert intention lock cannot.

When are gap locks created? Under `REPEATABLE READ`, which is MySQL's default, any locking read that scans a range — `WHERE id BETWEEN 10 AND 30 FOR UPDATE`, `WHERE balance > 1000 FOR UPDATE`, `WHERE status = 'pending' FOR UPDATE` on a non-unique index — will take next-key locks across the scanned index entries. Locking a non-existent key on a unique index also takes a gap lock on the interval where that key would sort. Even `WHERE id = 15 FOR UPDATE` where 15 does not exist locks `(10, 20)` if 10 and 20 are the neighbors.

When does InnoDB skip the gap part? There is one big optimization. If you do an exact equality lookup on a unique index or primary key and the row exists — `WHERE id = 20 FOR UPDATE` and row 20 is really there — InnoDB knows no other row can ever have `id = 20` because the uniqueness constraint guarantees it. So there is no phantom to prevent for that value. InnoDB downgrades the next-key lock `(10, 20]` to just a record lock on `20` and leaves the gap `(10, 20)` unlocked. If the row does not exist, or if the index is non-unique, that optimization does not apply and the gap stays locked.

How do you turn gap locks off? You switch the isolation level to `READ COMMITTED`. In `READ COMMITTED`, InnoDB disables gap locking for search and index scans and only locks the actual records it touches. That is the standard fix for high-throughput OLTP where gap locks cause too many deadlocks. You pair it with `binlog_format = ROW` so replication ships row changes rather than replaying range statements, which keeps replicas consistent without needing gap locks. A legacy knob `innodb_locks_unsafe_for_binlog` used to do this while staying in `REPEATABLE READ`, but it is deprecated — use `READ COMMITTED` instead. Note that even in `READ COMMITTED`, InnoDB still takes brief gap locks for foreign key checks and for duplicate-key checks, so you cannot claim gap locks disappear entirely.

## 4. See It In Practice — Real Code or Queries

Set up an index with deliberate gaps so the behavior is visible.

```sql
-- Schema: primary key is the clustered index, plus a non-unique secondary index
CREATE TABLE accounts (
    id INT PRIMARY KEY,
    user_id INT NOT NULL,
    balance DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    KEY idx_status (status)
) ENGINE=InnoDB;

-- Seed rows at 10, 20, 30 — gaps are (-inf,10), (10,20), (20,30), (30,+inf)
INSERT INTO accounts (id, user_id, balance, status) VALUES
(10, 101, 1500.00, 'active'),
(20, 102, 2500.00, 'active'),
(30, 103, 4000.00, 'suspended');
```

Locking a missing key blocks an unrelated insert in the same gap:

```sql
-- SESSION 1: ask for a row that does not exist, but ask with a lock
START TRANSACTION;
SELECT * FROM accounts WHERE id = 15 FOR UPDATE;
-- Returns 0 rows. InnoDB took an X gap lock on (10, 20) — shown as X,GAP on record 20.

-- SESSION 2 (while SESSION 1 is still open): try to insert a different id in same gap
START TRANSACTION;
INSERT INTO accounts (id, user_id, balance, status) VALUES (14, 104, 800.00, 'active');
-- Result: BLOCKED. Session 2 requested X,GAP,INSERT_INTENTION on (10,20) and must wait.

-- Inspect locks from a third connection (MySQL 8.0):
SELECT ENGINE_TRANSACTION_ID, OBJECT_NAME, INDEX_NAME, LOCK_TYPE, LOCK_MODE, LOCK_STATUS, LOCK_DATA
FROM performance_schema.data_locks;
-- SESSION 1 holds: LOCK_TYPE=RECORD, LOCK_MODE=X,GAP, LOCK_DATA=20, STATUS=GRANTED
-- SESSION 2 waits: LOCK_TYPE=RECORD, LOCK_MODE=X,GAP,INSERT_INTENTION, LOCK_DATA=20, STATUS=WAITING

-- SESSION 1 releases the gap:
COMMIT;
-- SESSION 2 instantly succeeds: Query OK, 1 row affected
COMMIT;
```

The classic deadlock that comes from gaps being compatible with each other:

```sql
-- SESSION 1: check if 15 exists
START TRANSACTION;
SELECT * FROM accounts WHERE id = 15 FOR UPDATE;
-- Acquires X gap lock on (10, 20). Succeeds immediately.

-- SESSION 2: at the same time, check if 16 exists
START TRANSACTION;
SELECT * FROM accounts WHERE id = 16 FOR UPDATE;
-- Also acquires X gap lock on (10, 20). Succeeds immediately because X gap locks are compatible.

-- SESSION 1 now decides to create its row:
INSERT INTO accounts (id, user_id, balance, status) VALUES (15, 105, 300.00, 'active');
-- BLOCKED. Needs INSERT_INTENTION on (10,20), but SESSION 2 holds a gap lock there.

-- SESSION 2 now decides to create its row:
INSERT INTO accounts (id, user_id, balance, status) VALUES (16, 106, 600.00, 'active');
-- DEADLOCK. Needs INSERT_INTENTION on (10,20), but SESSION 1 holds a gap lock there.
-- InnoDB detects the cycle A waits for B, B waits for A and throws:
-- ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction
-- One transaction is rolled back, the other completes.
```

A range query also takes next-key locks across every index entry it touches:

```sql
-- Locks every record it scans plus the gap before each one
START TRANSACTION;
SELECT * FROM accounts WHERE balance > 1000 FOR UPDATE;
-- If the secondary index scan touches rows 10, 20, 30 and the supremum gap,
-- InnoDB holds next-key locks that effectively block inserts into all those gaps.

-- Plain SELECT does not block at all — no gap locks, snapshot via MVCC
START TRANSACTION;
SELECT * FROM accounts WHERE balance > 1000;
-- Zero locks. Other sessions can insert freely.
COMMIT;
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a gap lock and why doesn't InnoDB just lock the rows it found?**

A gap lock is a lock on the empty interval between two adjacent index records, or before the first record or after the last record. InnoDB needs it in `REPEATABLE READ` because row locks alone cannot stop phantoms. If you run `SELECT * FROM accounts WHERE balance > 1000 FOR UPDATE` and InnoDB only locked the three rows it returned, another transaction could `INSERT` a fourth row with `balance = 5000` right into the scanned range. When you re-read, you would see a new phantom row in the same transaction. InnoDB also needs phantoms blocked for statement-based replication — otherwise the primary and replica could execute the same statements in different orders and diverge. The gap lock says "nothing new can appear in this empty stretch" until your transaction ends.

**Q: Do plain SELECTs take gap locks?**

No. A plain `SELECT` in InnoDB is a non-locking consistent read. It uses MVCC to read a snapshot from undo logs based on your transaction's read view. It takes zero record locks, zero gap locks, zero next-key locks. Gap locks only appear when you explicitly ask for a locking read — `FOR UPDATE` or `LOCK IN SHARE MODE` — or when you run `UPDATE`, `DELETE`, or `INSERT` that must lock the index entries they touch.

**Q: What is the difference between a record lock, a gap lock, and a next-key lock?**

A record lock guards one existing physical index record — it blocks updates and deletes to that exact row. A gap lock guards only the empty space between two records — it blocks inserts into that empty space and nothing else. A next-key lock is the combination that InnoDB actually uses by default in `REPEATABLE READ` range scans: it locks the gap before a record plus the record itself, representing the half-open interval `(previous_key, current_key]`. For example, with keys `[10, 20, 30]`, a next-key lock on `20` locks both record `20` and gap `(10, 20)`.

**Q: Why can two transactions both hold an exclusive gap lock on the same gap?**

Because a gap lock's only purpose is to keep the gap empty. Two transactions saying "keep (10, 20) empty" are not in conflict — they want the same outcome. So an `X` gap lock does not block another `S` or `X` gap lock on the same gap. The only thing a gap lock blocks is an insert intention lock, which means "I want to put a row right here in this gap." That is why two `SELECT ... WHERE id = 15 FOR UPDATE` queries on the same missing key can both succeed instantly, and why they then deadlock when both try to insert — each insert needs an insert intention lock that is blocked by the other's gap lock.

**Q: When does InnoDB skip the gap lock and just take a record lock?**

When you do an exact equality search on a unique index or primary key and the row actually exists. For `SELECT * FROM accounts WHERE id = 20 FOR UPDATE` where `id` is the primary key and row 20 exists, InnoDB downgrades the next-key lock `(10, 20]` to a pure record lock on `20`. The reasoning is simple: uniqueness guarantees no other transaction can insert a second row with `id = 20`, so there is no phantom to block in that gap. If the row does not exist, or if the index is non-unique (like `status`), there could be a phantom, so the gap lock is kept.

**Q: How does a gap lock cause a deadlock even when inserts use different keys?**

Because gap locks are compatible with each other but not with inserts. Two concurrent transactions both do `SELECT ... FOR UPDATE` on different missing keys that happen to sort into the same gap — say `id = 15` and `id = 16` both fall in `(10, 20)`. Both get a gap lock on `(10, 20)` without waiting. Then each transaction tries to `INSERT` its key. Each insert asks for an insert intention lock on `(10, 20)` and each is blocked by the other's gap lock. That creates a circular wait: A waits for B, B waits for A. InnoDB's deadlock detector fires and rolls back one transaction with `ERROR 1213`.

**Q: How do you reduce or disable gap locks without breaking correctness?**

Set the isolation level to `READ COMMITTED` and use row-based replication. In `READ COMMITTED`, InnoDB does not take gap locks for search and range scans — it locks only the index records it actually matches. That removes the biggest source of gap-lock blocking and deadlocks. You pair it with `binlog_format = ROW` so replicas apply exact row changes instead of re-executing range statements, which preserves replica consistency without gap locks. This is the standard high-throughput OLTP setup. Note that foreign key constraint checks and duplicate-key checks still take brief gap locks even in `READ COMMITTED`, so gap locks are minimized, not literally zero.

**Q: What is an insert intention lock and how is it different from a gap lock?**

A gap lock is held by a reading or writing transaction to keep a range empty. An insert intention lock is requested by an `INSERT` right before it writes to say "I intend to insert at this precise position inside this gap." They are both gap-like, but gap locks can coexist with each other and both block insert intention locks. Multiple transactions can each request insert intention locks on the same gap without blocking each other if no gap lock is held — they only block when a real gap lock is in the way.

## 6. The Traps — What Goes Wrong in Production

**Treating a locking read that returns zero rows as "no lock was taken."** The most common production bug is a pattern like `SELECT * FROM distributed_locks WHERE lock_name = 'order_123' FOR UPDATE; if empty then INSERT`. When the row does not exist, developers assume zero side effects. In reality InnoDB just locked the gap where `'order_123'` would sort, between its neighboring keys. Every other thread trying to insert any `lock_name` that sorts into that same gap now blocks. Under load this serializes unrelated inserts and looks like a mysterious global slowdown. The fix is to avoid `FOR UPDATE` on a missing key when you only want to check existence, or handle the duplicate-key error optimistically with `INSERT ... ON DUPLICATE KEY` and retry, or move to `READ COMMITTED` if your business logic does not need phantom protection.

**Assuming an exclusive gap lock gives you exclusive ownership of the gap.** Developers see `FOR UPDATE` and think the second transaction will queue. It will not queue for gap locks — `X` gap locks are compatible. Two workers both run `SELECT ... WHERE id = 15 FOR UPDATE`, both succeed instantly, both think they own the gap, both try to insert, and you get a deadlock instead of orderly waiting. If you need mutual exclusion on a missing key, do not rely on gap locks alone. Use `INSERT ... ON DUPLICATE KEY UPDATE`, use `GET_LOCK()`, use a unique constraint and handle the error, or serialize the critical section at the application layer.

**Locking far more than you expected via a non-unique secondary index.** A query like `SELECT * FROM orders WHERE status = 'pending' LIMIT 1 FOR UPDATE` feels like it locks one row. On a non-unique index like `status`, InnoDB cannot know where `'pending'` values end, so it locks the gaps between all `'pending'` entries it scans plus the gap leading to the next distinct `status` value. It also takes record locks on the corresponding primary keys. Under concurrent inserts of any `status` that sorts near `'pending'`, those inserts block. The fix is to add a more selective index, use `READ COMMITTED`, or avoid `FOR UPDATE` on secondary indexes when you only need one row — fetch the id first, then lock by primary key.

**Accidentally locking the supremum and blocking all future inserts.** A range like `SELECT * FROM accounts WHERE id > 100 FOR UPDATE` where 100 is beyond the current max (`30`) locks gap `(30, +infinity)` on the supremum pseudo-record. That blocks every future `INSERT` with an ascending id until your transaction commits. Auto-increment tables are especially vulnerable — one long-running range lock can stall all writes. The fix is to keep locking range scans short, avoid `FOR UPDATE` with open-ended ranges that exceed current keys, and commit promptly.

**Believing READ COMMITTED removes every gap lock.** Teams switch to `READ COMMITTED` to kill gap-lock deadlocks and then are surprised when `SHOW ENGINE INNODB STATUS` still shows gap locks. InnoDB still uses gap locks in `READ COMMITTED` for foreign key parent checks and for duplicate-key detection. For example, checking a foreign key on insert must ensure no phantom parent appears, so a brief gap lock is taken. The switch still removes the vast majority of gap locks — the ones taken for search and range scans — but if you expected literally zero gap locks, you will misdiagnose the remaining foreign-key cases.

## 7. Compare With Related Concepts

**Gap lock vs Record lock.** A record lock boots one parked car — it stops anyone from updating or deleting that exact row. A gap lock cones off the empty pavement between two cars — it only stops anyone from parking a new row in that gap. They live on the same index but protect different things. A locking read on an existing unique key downgrades to just a record lock because gaps need no protection there. A locking read on a missing key or a range needs a gap lock because the empty space is what needs protection. Rule of thumb: if the row exists and you queried by unique key, you get a record lock; if the row is missing or you scanned a range, you get a gap lock.

**Gap lock vs Next-key lock.** A gap lock is the open interval `(A, B)`. A next-key lock is `(A, B]` — the same gap plus the boot on record `B` at the right end. InnoDB's default in `REPEATABLE READ` is next-key locks during range scans, which prevents both inserts into the gap and updates to the boundary row. You can think of next-key as the production building block and gap as its empty-space half. Rule of thumb: InnoDB says next-key when it scans; it says pure gap only when the boundary row does not exist or when showing the gap piece separately in `performance_schema`.

**Gap lock vs Insert intention lock.** A gap lock says "nobody parks here." An insert intention lock says "I want to park here at this precise spot." Gap locks are held by readers and updaters to keep space empty. Insert intention locks are requested by inserters before they write. Multiple gap locks coexist. Multiple insert intention locks coexist when no gap lock blocks them. But a gap lock always blocks an insert intention lock on the same gap. Rule of thumb: if your `INSERT` is hanging with `WAITING` and `INSERT_INTENTION`, some other transaction is coning off your gap.

**REPEATABLE READ gap locking vs READ COMMITTED record-only locking.** `REPEATABLE READ` with gap and next-key locks gives you phantom protection for locking reads at the cost of more blocking and more deadlocks, and it works with statement-based replication. `READ COMMITTED` drops gap locks for scans to maximize concurrency and relies on row-based replication to keep replicas consistent. Rule of thumb: stay in `REPEATABLE READ` if your transaction logic depends on the database guaranteeing no phantom appears between your `FOR UPDATE` and your later write; move to `READ COMMITTED` plus `ROW` binlog when your workload is insert-heavy and phantom protection is not worth the deadlock price.

## 8. 🧠 The Memory Hook

A record lock boots the parked car; a gap lock cones off the empty pavement between cars so nobody can park a new one. Two officers can cone the same empty stretch without fighting, but the moment either tries to actually park a car there, they collide — that is why gap locks look harmless until the inserts arrive and deadlock.
