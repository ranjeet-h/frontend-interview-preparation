# What is MVCC

## 1. The Real-World Problem — When You Actually Hit This

Imagine your shop has one shared price list taped to the wall. Every time someone updates a price, they scribble over the old number. And every time someone is reading the list, they lock the wall so no one can write. That is how a database without MVCC feels.

Two things go wrong fast. First, readers block writers. A long report that scans a million orders blocks the checkout that just needs to update one row. Second, writers block readers. While that checkout is writing, every product page query waits.

You ship to production and it is fine with 100 test rows. Then Black Friday hits, you have concurrent checkouts and dashboards running at the same time, and suddenly your API latency spikes not because queries are slow, but because they are waiting in line for each other. Users see spinning wheels, checkouts time out, and your error rate climbs even though CPU is idle.

Postgres solves this by refusing to overwrite rows in place. It keeps old versions around so readers can keep reading the version that was true when they started, while writers quietly create new versions next to them. No waiting in line. That trick is MVCC — Multi-Version Concurrency Control.

## 2. The Analogy — Make the Mechanic Obvious

Think of an office where every shared document is never erased, only copied.

The team keeps one folder for the "orders" document. When you want to change row 42, you do not erase row 42. You photocopy the page, write the new values on the copy, and add your copy to the folder with two stamps: "created by transaction 101" and later, when someone replaces it again, "replaced by transaction 105."

The folder now has multiple drafts of the same row, each stamped with who created it and who invalidated it. That is exactly what Postgres does. Each row version has an `xmin` stamp — the transaction that created it — and an `xmax` stamp — the transaction that deleted or replaced it.

Now picture two people. Alice starts reading at 10:00. She gets a photocopy of the whole folder as it looked at 10:00 — her snapshot. Bob writes a new draft at 10:01 and adds it to the folder. Alice does not see Bob's draft because her photocopy was frozen at 10:00. She keeps reading the old draft. No one stood over her shoulder and took the paper away.

Later a janitor walks by. The janitor is `VACUUM`. He is allowed to throw away old drafts, but only if no one is still holding a photocopy that might need them. If Alice leaves her photocopy on her desk for three hours — that is a long-running or idle-in-transaction session — the janitor cannot clean up. The folder just keeps getting fatter with old drafts. That fat is table bloat.

This is why Postgres UPDATE feels different from editing a Google Doc inline. You are not overwriting. You are appending a new draft and marking the old one as expired, and cleanup only happens when it is safe.

## 3. The Full Explanation — How It Actually Works

In plain words, MVCC lets many transactions see different versions of the same row at the same time, so reads never wait for writes and writes never wait for reads.

Here is how Postgres actually does it.

Every row version — called a tuple — lives in the table heap and carries two hidden system columns: `xmin` and `xmax`. `xmin` is the ID of the transaction that inserted the version. `xmax` is the ID of the transaction that deleted it or replaced it with a newer version. If `xmax` is zero or empty, no one has deleted it yet.

When your transaction starts, Postgres gives you a snapshot. Think of the snapshot as two things: the list of transactions that were still running when you started, and a horizon number that says "you can only see transactions that finished before this." A row version is visible to you only if its `xmin` is committed and not in your snapshot's active list, and its `xmax` is either empty or belongs to a transaction that had not committed when your snapshot was taken.

That visibility rule is why a long SELECT does not block. It just ignores newer versions that fail the check.

Now the write path. `INSERT` creates a brand new tuple with your `xmin` and an empty `xmax`. `DELETE` does not remove the row. It just stamps the old tuple's `xmax` with your transaction ID — a logical delete. `UPDATE` is really a `DELETE` plus an `INSERT` tied together: Postgres marks the old tuple as expired with your `xmax` and inserts a completely new tuple with the new values and your `xmin`. The old tuple stays on disk right next to the new one until cleanup.

Because of this, the table accumulates dead tuples. They are rows where `xmax` says they are expired, but some older snapshot might still need them, or `VACUUM` simply has not cleaned them yet. Every Postgres table therefore needs `VACUUM`. `VACUUM` scans the heap, checks which dead tuples are not visible to any active snapshot anymore, marks their space reusable, and updates the visibility map. `VACUUM FULL` rewrites the table to actually shrink it, but normal `VACUUM` just makes space reusable inside the same file. `AUTOVACUUM` does this in the background, tuned by thresholds like how many dead tuples have piled up.

This design also explains isolation levels. In `READ COMMITTED`, which is the Postgres default, you get a fresh snapshot for every single statement, so a second SELECT in the same transaction can see rows committed after the first SELECT. In `REPEATABLE READ`, you get one snapshot for the whole transaction, so every query in that transaction sees the same frozen world, even if other transactions commit in between. In both cases MVCC is the mechanism underneath.

Why not just use row locks for everything? Locks guarantee correctness but they serialize access — every reader waits. MVCC trades some disk space and cleanup work for concurrency. You get high read throughput and no read-write blocking, but you pay with bloat, vacuum I/O, and the need to manage long-running transactions.

A key Postgres-specific detail is where versions live. In Postgres, every version is a full tuple in the main table heap. An `UPDATE` writes a full new row, and indexes keep pointing at heap tuples, so an `UPDATE` also needs to update indexes unless the HOT optimization can avoid it. In MySQL's InnoDB, the model is flipped: the table keeps only the latest row in place, and older versions are stored separately in undo logs as a chain off the primary index. Reads that need an old version walk the undo chain. That means InnoDB does not bloat the main table the way Postgres does, but it bloats undo space instead, and purging old undo has its own costs.

The practical consequence is this: in Postgres, a write-heavy table will physically grow and its indexes will grow unless vacuuming keeps up. Long transactions are dangerous because they pin the oldest snapshot horizon. As long as one session holds an old snapshot, `VACUUM` cannot remove any dead tuple created after that horizon, even if a million newer transactions have finished. If you wrap that in a connection pool that leaks `idle in transaction` sessions, you get the most classic Postgres production incident: table bloat, index bloat, slow sequential scans, and eventually transaction ID wraparound warnings.

MVCC interacts with everything else. Indexes point to heap tuples, so an `UPDATE` that cannot use HOT will create extra index entries too. `VACUUM` sets hint bits and the visibility map so later reads can skip checking visibility. Replication and `pg_dump` need to understand snapshots too, which is why long-running replicas can also delay cleanup on the primary when `hot_standby_feedback` is on.

Use MVCC as intended: keep transactions short, let `AUTOVACUUM` run, and expect that readers never block writers. Do not use MVCC as an excuse to leave transactions open while your app makes an HTTP call or waits for user input. The database will faithfully keep every old draft for you until you tell it you are done.

## 4. See It In Practice — Real Code or Queries

These examples are Postgres SQL you can run in `psql`. Open two `psql` sessions to see the concurrency.

Readers do not block writers — two concurrent transactions:

```sql
-- Session A: start a transaction and read
BEGIN;
-- Takes a snapshot at this moment
SELECT id, status FROM orders WHERE id = 42;
--  id | status
-- ----+--------
--  42 | pending
-- Leave this transaction open for a minute. Do not commit yet.

-- Session B: while A is still open, update the same row
-- This does NOT wait for A to finish.
BEGIN;
UPDATE orders SET status = 'shipped' WHERE id = 42;
COMMIT;
-- Session B succeeds immediately. In a locking-only system it would have blocked.

-- Back in Session A: read again
-- In READ COMMITTED, this second statement gets a NEW snapshot, so it sees shipped.
-- In REPEATABLE READ, it would still see pending from the first snapshot.
SELECT id, status FROM orders WHERE id = 42;
COMMIT;

-- After both commit, everyone sees the new version
SELECT id, status FROM orders WHERE id = 42;
--  42 | shipped
```

Every UPDATE creates a new tuple — see xmin, xmax, and ctid:

```sql
-- ctid is the physical location (page, slot). xmin/xmax are the MVCC stamps.
SELECT ctid, xmin, xmax, id, status FROM orders WHERE id = 42;
--   ctid  | xmin | xmax | id | status
-- ---------+------+------+----+---------
--  (0,2)  |  742 |    0 | 42 | pending

UPDATE orders SET status = 'shipped' WHERE id = 42;

SELECT ctid, xmin, xmax, id, status FROM orders WHERE id = 42;
--   ctid  | xmin | xmax | id | status
-- ---------+------+------+----+---------
--  (0,3)  |  743 |    0 | 42 | shipped

-- The old version is still on the page as a dead tuple until VACUUM reclaims it.
-- You can find bloat signals without extensions:
SELECT relname, n_live_tup, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables
WHERE relname = 'orders';
-- If n_dead_tup keeps climbing, VACUUM is not keeping up or a snapshot is pinned.
```

Vacuum and dead tuples — what cleanup actually does:

```sql
-- Create bloat on purpose: update the same rows many times
BEGIN;
UPDATE orders SET status = 'processing' WHERE status = 'pending';
-- n_dead_tup jumps — each updated row left one dead tuple behind
COMMIT;

-- Normal VACUUM marks dead-tuple space reusable but does not shrink the file
VACUUM VERBOSE orders;
-- Look for "removable cutoff" and "dead row versions cannot be removed yet"
-- That message means some old snapshot is still pinning them.

-- Check who is pinning the horizon
SELECT pid, usename, state, xact_start, now() - xact_start AS age, query
FROM pg_stat_activity
WHERE state IN ('active', 'idle in transaction')
ORDER BY xact_start;
-- Any row with age of minutes or hours is a suspect. Terminate or fix the app code
-- that leaves transactions open across network calls.
```

Snapshot behavior across isolation levels:

```sql
-- Session A
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT * FROM orders WHERE id = 42; -- snapshot frozen here

-- Session B commits an update to 42

-- Session A again — still sees the old version, same snapshot
SELECT * FROM orders WHERE id = 42;
COMMIT; -- only after commit would a new transaction see B's change

-- Contrast with READ COMMITTED, where each SELECT gets a fresh snapshot
BEGIN ISOLATION LEVEL READ COMMITTED;
SELECT * FROM orders WHERE id = 42; -- snapshot 1
-- Session B commits
SELECT * FROM orders WHERE id = 42; -- snapshot 2, sees B's commit
COMMIT;
```

Application hint — keep transactions short in code:

```sql
-- Bad: transaction spans user input or an HTTP call (pseudo-code)
-- BEGIN; SELECT ...; await fetch('https://payment-gateway/...'); COMMIT;
-- The transaction holds its snapshot across the network wait, blocking VACUUM.

-- Good: do the network call outside the transaction, keep the DB part tight
-- const payment = await fetch('https://payment-gateway/...');
-- await db.query('BEGIN; UPDATE orders SET status=$1 WHERE id=$2; COMMIT;', [payment.status, id]);
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is MVCC and why does Postgres use it?**

MVCC means Postgres keeps multiple versions of each row so readers and writers do not block each other. Without it, a long-running report would lock rows and block checkouts, or checkouts would block the report. With MVCC, a reader sees the version that was visible when its snapshot was taken, while a writer creates a new version alongside it. Postgres uses it because real workloads are read-heavy and concurrent — you want dashboards, product pages, and analytics to run at the same time as writes without serializing everything through row locks.

**Q: How does MVCC work internally with xmin and xmax?**

Every row version carries `xmin`, the transaction that created it, and `xmax`, the transaction that expired it, or zero if it is still live. When your transaction starts, Postgres builds a snapshot that lists active transactions at that moment. A version is visible to you only if its `xmin` is committed and not in your active list and its `xmax` is either empty or belonged to a transaction that was still active or started after your snapshot. `INSERT` writes a new tuple with your `xmin`. `DELETE` stamps the old tuple's `xmax`. `UPDATE` does both — stamps the old tuple dead and inserts a new tuple with the new data. Nothing is overwritten.

**Q: Do readers block writers or writers block readers in Postgres?**

No, not in normal MVCC operation. Readers never block writers and writers never block readers because they operate on different row versions. A `SELECT` does not take a row lock that would stop an `UPDATE`, and an `UPDATE` does not block a concurrent `SELECT` — the select just sees the older version. The exception is explicit locking. If you write `SELECT ... FOR UPDATE` or `FOR SHARE`, you are asking for a lock and then you will block writers on purpose. DDL like `ALTER TABLE` also needs stronger locks that can block.

**Q: Does UPDATE modify a row in place? How is Postgres different from MySQL InnoDB here?**

In Postgres, `UPDATE` never modifies in place. It inserts a completely new tuple with the new values and marks the old tuple expired via `xmax`. Indexes must be updated too, unless the HOT optimization can keep the update on the same page without touching indexes. In MySQL InnoDB, `UPDATE` modifies the latest row in place on the clustered index and pushes the old version into a separate undo log chain. Readers that need the old version walk that chain. The trade-off is different bloat: Postgres bloats the heap and indexes until `VACUUM` cleans up, while InnoDB bloats undo and needs purging. If you run a batch that updates every row in Postgres, the table can temporarily double in size.

**Q: What are dead tuples and why do we need VACUUM?**

A dead tuple is a row version whose `xmax` says it is expired and whose visibility horizon has passed for all active snapshots, but whose disk space has not been reclaimed. They pile up after `UPDATE` and `DELETE`. `VACUUM` is the cleanup job that scans the heap, checks visibility against the oldest active snapshot, marks dead-tuple space reusable, freezes old transaction IDs, and updates the visibility map so future reads are faster. Without it, tables and indexes keep growing, sequential scans get slower, and autovacuum I/O spikes at awkward times. `VACUUM` does not normally shrink the file; `VACUUM FULL` or `pg_repack` does that by rewriting the table.

**Q: What happens if a transaction stays open for a long time or is idle in transaction?**

Its snapshot pins the horizon. `VACUUM` cannot remove any dead tuple created after that horizon because the old transaction might still need to see it. So even if you do thousands of updates, none of the dead tuples can be cleaned up until that one session commits or rolls back. The table bloats, indexes bloat, autovacuum works harder and longer, and query plans get slower. Worse, Postgres transaction IDs are 32-bit and wrap around — a very long-lived transaction brings you closer to the wraparound emergency where the database must stop accepting writes to prevent data loss. In production the most common cause is a connection pool checkout that did `BEGIN` and then leaked, staying `idle in transaction` for hours.

**Q: How does MVCC relate to isolation levels?**

MVCC is the mechanism, isolation levels decide how often you get a new snapshot. `READ COMMITTED` takes a fresh snapshot for every statement, so two selects in the same transaction can see different committed data. `REPEATABLE READ` takes one snapshot at the first query and reuses it for the whole transaction, so all selects see a consistent frozen view and will error with a serialization failure if a concurrent write would break repeatability. `SERIALIZABLE` adds extra SSI checks on top of snapshots to prevent anomalies like write skew, still using MVCC versions underneath. The key point is that MVCC visibility and isolation are linked — the isolation level just chooses the snapshot policy.

**Q: When is a snapshot taken, and what can it see?**

In `READ COMMITTED` the snapshot is taken at the start of each statement. In `REPEATABLE READ` and `SERIALIZABLE` it is taken at the start of the first query in the transaction and reused. The snapshot can see all transactions that committed before it was taken, and none that were still running or started after. It never sees uncommitted data from other transactions, and committed data becomes visible only to snapshots taken after the commit.

## 6. The Traps — What Goes Wrong in Production

You update every row in one massive transaction and the table doubles in size. A classic mistake is running `UPDATE orders SET status = 'archived' WHERE created_at < '2023-01-01'` on a table with 2 million rows in a single transaction, or doing it inside an ORM loop that never commits. Each updated row leaves a dead tuple, so you just created 2 million dead tuples in one shot. Autovacuum now needs to scan the whole table and clean it, concurrent queries slow down, WAL generation spikes, and replicas lag. The fix is to batch with pauses and frequent commits — for example 5k or 10k rows per batch, with a `VACUUM` or at least a pause between batches, or use a `CTAS` pattern or partitioning for truly huge rewrites. Keep the transaction window as small as the business allows.

A connection pool leak leaves a session idle in transaction and nothing can be vacuumed. You deploy, and the dashboard shows `n_dead_tup` climbing forever even though autovacuum claims to run. You check `pg_stat_activity` and see one connection with `state = idle in transaction` and `xact_start` from six hours ago, usually because application code did `BEGIN`, awaited an HTTP payment call, and then crashed before `COMMIT`. That one session pins the global `oldest xmin`, so vacuum cannot remove any dead tuple newer than it. The table and indexes bloat, `EXPLAIN` shows more heap fetches, and autovacuum runs longer each cycle. Fix it by never holding a transaction across network I/O, setting `idle_in_transaction_session_timeout`, and monitoring `max(xact_start)` age. Kill the offender and bloat stops growing immediately, though you still need a vacuum to reclaim space.

You assume UPDATE is cheap and in-place, so you model Postgres like MySQL. In MySQL you might update a counter column a hundred times a second and rely on the undo log to stay small. In Postgres each of those updates writes a full new tuple and touches every index on the table unless HOT applies, so write amplification is much higher and bloat arrives much faster. The fix is to reduce indexed columns you update frequently, consider `HOT`-friendly fillfactor, aggregate counters in a separate table or in Redis and flush periodically, or use `INSERT ... ON CONFLICT` with careful batching rather than row-by-row updates.

You forget that VACUUM is not free and autovacuum tuning matters. Out-of-the-box autovacuum thresholds can be too relaxed for a high-churn table, so dead tuples pile up faster than they are cleaned. You then run a manual `VACUUM FULL` in production and discover it takes an exclusive lock and blocks writes. The safer path is to tune per-table autovacuum settings like `autovacuum_vacuum_scale_factor` and `autovacuum_vacuum_threshold` for hot tables, schedule manual `VACUUM` not `VACUUM FULL` during low traffic, and watch `pg_stat_user_tables` for the gap between `n_dead_tup` and `last_autovacuum`.

You expect a REPEATABLE READ transaction to see fresh data. You start a `REPEATABLE READ` transaction, run a report query, then run a second query that should see orders placed while the report was running, but it does not. That is not a bug — the whole transaction shares one snapshot. If you needed fresh reads, you should have used `READ COMMITTED`, used separate transactions, or committed and started a new one between steps. The trap is mixing reporting convenience with correctness expectations without realizing MVCC snapshot reuse is the cause.

## 7. Compare With Related Concepts

MVCC versus explicit locking. Locking says "wait your turn." MVCC says "everyone gets the version from their moment in time." With locking, a read that needs a row locked by a write blocks until the write commits. With MVCC, the read just sees the older version and carries on. Use MVCC for the default high-concurrency case where reads and writes touch the same tables. Reach for explicit locks like `SELECT ... FOR UPDATE`, advisory locks, or `SERIALIZABLE` only when you have a correctness invariant that MVCC snapshots alone cannot enforce, such as a seat inventory that must not be double-booked. MVCC is faster for concurrency, locking is stronger for precise coordination, and you pay for locking with latency.

PostgreSQL MVCC versus MySQL InnoDB MVCC. Same idea, opposite storage. Postgres stores every version as a complete tuple in the heap, so the main table bloats and vacuum cleans it. InnoDB stores the latest row in the clustered index and chains older versions in undo logs off that row, so the main table stays compact but undo space bloats and the purge thread must clean it. In Postgres an `UPDATE` can double index work, in InnoDB it can lengthen the undo chain that long-running selects must walk. Rule of thumb: if you know Postgres, expect to tune vacuum and watch heap bloat. If you know MySQL, expect to watch undo size and long-running queries that traverse old versions. Porting update-heavy workloads between them without adjusting batching will surprise you.

Snapshot isolation versus serializable. MVCC gives you snapshot isolation, which means each transaction sees a consistent snapshot and phantom or non-repeatable reads are avoided in the snapshot's world. But snapshot isolation alone can still allow write skew — two concurrent transactions each read the same invariant, each thinks it is safe to write, and together they violate a rule neither saw. `SERIALIZABLE` in Postgres adds SSI tracking on top of MVCC snapshots to detect and abort one of those transactions. Use snapshot isolation for most work, and reach for serializable or explicit constraints when you have multi-row invariants like "at most one owner per seat" that could be broken by two snapshots racing.

## 8. 🧠 The Memory Hook

MVCC is the office that never erases, only adds new drafts. Each draft is stamped with who wrote it and who replaced it, every reader holds a photocopy from when they walked in, and the janitor can only trash old drafts no one is still holding. Leave your photocopy on the desk too long and the office fills with paper.
