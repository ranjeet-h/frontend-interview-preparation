# Next-Key Locks in MySQL InnoDB: Record + Gap Locking, Range Protection, and Lock Downgrade Rules

## 1. The Real-World Problem — When You Actually Hit This

Imagine you run a high-volume payment service on MySQL with the default isolation level `REPEATABLE READ`. You start a transaction to reserve all pending orders in a batch range:

```sql
SELECT * FROM orders WHERE order_id BETWEEN 100 AND 200 FOR UPDATE;
```

At that moment only two orders exist in that range: `105` and `190`. Your mental model says: "I locked rows 105 and 190. Anything else is free."

A second later a background worker tries to insert a brand new order right in the middle:

```sql
INSERT INTO orders (order_id, amount) VALUES (150, 49.99);
```

Order 150 did not exist when you started. No row was selected. There is nothing to lock. Yet the insert hangs, the worker thread freezes, and eventually you get:

```text
ERROR 1205 (HY000): Lock wait timeout exceeded; try restarting transaction
```

Why does inserting into empty space get blocked by a query that only touched existing rows?

If InnoDB only locked existing rows, a concurrent transaction could slip a new row into your range and commit. Run the same `SELECT ... FOR UPDATE` again inside your transaction and a new phantom row suddenly appears inside what was supposed to be a repeatable read. For snapshot reads (`SELECT` without locking) MVCC hides phantoms, but for locking reads that must see the latest committed data, that phantom breaks isolation. With statement-based replication it gets worse — replaying those two transactions on a replica in commit order would apply your update on top of that new row and leave the replica with different data than the primary.

That is the exact failure next-key locks were built to prevent. They lock empty space alongside real records, which also means if you do not understand where those locked gaps are, you will see mystery blocks and deadlocks that look like they touch completely unrelated rows.

## 2. The Analogy — Make the Mechanic Obvious

Picture a VIP valet lane where cars are parked at fixed meter posts along a single driveway. Right now only three cars are parked: at meter 10, meter 20, and meter 30.

```txt
Entry --[gap 1 to 9]-- (Car 10) --[gap 11 to 19]-- (Car 20) --[gap 21 to 29]-- (Car 30) --[gap 31 to ∞]--> End Post (supremum)
```

A security guard who wants to secure Car 20 has three tools:

A **record lock** is a wheel clamp on Car 20 itself. No one can move or repaint that car, but anyone can still pull a new car into the empty asphalt at meter 15.

A **gap lock** is orange cones across the empty stretch from meter 11 to 19. No one can park in that empty stretch, but Car 20 itself is untouched — someone could still repaint it.

A **next-key lock** does both at once: cones across 11 to 19 **and** a clamp on Car 20. In interval math that is the half-open interval `(10, 20]` — the gap after 10, up to and including 20.

Every *next* car defines the *key* interval that ends with it, plus the gap that leads up to it. That is literally why it is called next-key.

Try to park a new car at meter 15 and you hit cones. Try to update Car 20 and you hit the clamp. Either way you wait. The empty asphalt after the last car at 30 is handled the same way — InnoDB keeps a fake boundary post called the `supremum` at the end of the driveway, so a lock on `(30, +∞)` with that post blocks inserts beyond the maximum key.

## 3. The Full Explanation — How It Actually Works

In InnoDB locks are never placed on the table as an abstract idea. They are placed on **index records inside the B+Tree**. Even a lock that says "block inserts between 10 and 20" lives on the index entry for 20.

The composition is simple:

Next-Key Lock = Record Lock on the index entry + Gap Lock on the gap immediately before that entry.

A record lock stops `UPDATE` and `DELETE` on that row. A gap lock stops `INSERT` into the empty space. A next-key lock stops both for its interval `(previous_key, current_key]`.

With keys `5, 10, 15, 20` in the index, InnoDB partitions the whole key space as:

- `(-∞, 5]` — gap before 5 plus record 5
- `(5, 10]` — gap between 5 and 10 plus record 10
- `(10, 15]` — gap between 10 and 15 plus record 15
- `(15, 20]` — gap between 15 and 20 plus record 20
- `(20, +∞)` — gap after 20 up to the `supremum` pseudo-record

Under the default `REPEATABLE READ`, any locking read (`SELECT ... FOR UPDATE`, `SELECT ... FOR SHARE`) or write (`UPDATE`, `DELETE`) uses next-key locks by default as it walks the B+Tree. It does this because only by freezing both the matching records and the gaps between them can it guarantee a later insert cannot create a phantom that would have matched the same `WHERE` filter.

To avoid locking more than needed, InnoDB automatically narrows the lock when it can prove phantoms are impossible. These downgrade rules are what you need to predict blocking.

**Rule 1: Unique index, equality match, row exists — downgrade to record lock.** Example `SELECT * FROM users WHERE id = 10 FOR UPDATE` where `id` is the primary key and row 10 exists. No one can insert another row with `id = 10` anyway — the unique constraint would reject it. InnoDB does not need to guard the preceding gap `(5, 10)`, so it drops the gap part and keeps a pure record lock `[10]`. Inserting `id = 8` in that gap does not block.

**Rule 2: Unique index, equality match, row does not exist — downgrade to gap lock.** Example `SELECT * FROM users WHERE id = 7 FOR UPDATE` where rows 5 and 10 exist but 7 does not. InnoDB walks the tree to the first key greater than 7, which is 10, and initially prepares `(5, 10]`. Since there is no record 7 to clamp and row 10 was not the target, it keeps only the gap `(5, 10)`. Record 10 stays unlocked and can be updated, but inserting `id = 7` or `8` blocks.

**Rule 3: Non-unique secondary index, equality match — keep next-key and add an extra gap.** Example `SELECT * FROM users WHERE age = 25 FOR UPDATE` where `age` has a non-unique index with values 20, 25, 30. Because duplicates are allowed, a new row with `age = 25` could be inserted just before or just after the existing 25s. InnoDB places a next-key lock `(20, 25]` on the secondary index, scans to the next key 30 and adds a gap lock `(25, 30)`, and places pure record locks on the corresponding primary key rows. Inserting a new row with `age = 25` or `27` blocks.

**Rule 4: Range scan — keep next-key across the whole scan.** Example `SELECT * FROM users WHERE id >= 10 AND id < 15 FOR UPDATE`. A range could gain phantoms anywhere inside it, so InnoDB locks every interval it touches: `(5, 10]`, `(10, 15]`, and if it must inspect 20 to know the range ends, it also locks the gap leading to 20. Even a row just outside your filter can remain locked.

Two other behaviors matter every day. If your `WHERE` does not use an index, InnoDB falls back to a full clustered index scan and puts a next-key lock on every record and gap up to `supremum` — effectively the whole table blocks. And `READ COMMITTED` disables gap and next-key locks for most searches, which removes phantom protection for locking reads and requires `binlog_format=ROW` for safe replication.

## 4. See It In Practice — Real Code or Queries

Set up a table with a primary key and a secondary index so we can see locks via `performance_schema.data_locks` on MySQL 8.0:

```sql
CREATE TABLE accounts (
    id INT PRIMARY KEY,
    user_code INT NOT NULL,
    balance DECIMAL(10,2) NOT NULL,
    INDEX idx_user_code (user_code)
) ENGINE=InnoDB;

-- Distinct key values so gaps are visible
INSERT INTO accounts (id, user_code, balance) VALUES
(5,  100,  500.00),
(10, 200, 1000.00),
(15, 300, 1500.00),
(20, 400, 2000.00);
```

**Scenario A — Equality on existing primary key (downgrade to record lock):**

```sql
-- Session 1:
START TRANSACTION;
SELECT * FROM accounts WHERE id = 10 FOR UPDATE;

-- In another session, inspect locks:
SELECT INDEX_NAME, LOCK_TYPE, LOCK_MODE, LOCK_DATA
FROM performance_schema.data_locks
WHERE OBJECT_NAME = 'accounts';

-- Result:
-- INDEX_NAME | LOCK_TYPE | LOCK_MODE     | LOCK_DATA
-- PRIMARY    | RECORD    | X,REC_NOT_GAP | 10
-- Meaning: X,REC_NOT_GAP proves the next-key downgraded to a pure record lock.

-- Session 2: insert into the preceding gap succeeds immediately
START TRANSACTION;
INSERT INTO accounts (id, user_code, balance) VALUES (8, 180, 750.00);
-- Query OK, 1 row affected — no blocking because gap (5,10) is not locked
COMMIT;

ROLLBACK; -- Session 1
```

**Scenario B — Equality on non-existent primary key (downgrade to gap lock):**

```sql
-- Session 1: search for id 12 which does not exist (neighbors are 10 and 15)
START TRANSACTION;
SELECT * FROM accounts WHERE id = 12 FOR UPDATE;

-- Inspect locks:
SELECT INDEX_NAME, LOCK_TYPE, LOCK_MODE, LOCK_DATA
FROM performance_schema.data_locks
WHERE OBJECT_NAME = 'accounts';

-- Result:
-- INDEX_NAME | LOCK_TYPE | LOCK_MODE | LOCK_DATA
-- PRIMARY    | RECORD    | X,GAP     | 15
-- Meaning: X,GAP on 15 means only the gap (10, 15) is locked, not record 15 itself.

-- Session 2: insert inside the gap blocks
START TRANSACTION;
INSERT INTO accounts (id, user_code, balance) VALUES (11, 220, 300.00);
-- BLOCKED until Session 1 commits or rolls back

-- Session 3: updating row 15 itself still succeeds
UPDATE accounts SET balance = 1600.00 WHERE id = 15;
-- Query OK — the record 15 was not locked, only the gap before it

ROLLBACK; -- Session 1
ROLLBACK; -- Session 2
```

**Scenario C — Equality on non-unique secondary index (full next-key plus extra gap):**

```sql
-- Session 1: lock by secondary index value 200 (non-unique)
START TRANSACTION;
SELECT * FROM accounts WHERE user_code = 200 FOR UPDATE;

-- Inspect locks:
SELECT INDEX_NAME, LOCK_TYPE, LOCK_MODE, LOCK_DATA
FROM performance_schema.data_locks
WHERE OBJECT_NAME = 'accounts';

-- Result:
-- INDEX_NAME    | LOCK_TYPE | LOCK_MODE     | LOCK_DATA
-- idx_user_code | RECORD    | X             | 200, 10   -- next-key (100, 200] on secondary
-- PRIMARY       | RECORD    | X,REC_NOT_GAP | 10        -- record lock on clustered index
-- idx_user_code | RECORD    | X,GAP         | 300, 15   -- gap lock (200, 300) on next secondary entry

-- Session 2: insert with user_code inside the next gap blocks
INSERT INTO accounts (id, user_code, balance) VALUES (12, 250, 400.00);
-- BLOCKED — falls inside the (200, 300) gap lock on idx_user_code

ROLLBACK;
```

**Scenario D — No index used (table-wide freeze):**

```sql
-- No index on status, and the table has thousands of rows
START TRANSACTION;
UPDATE orders SET status = 'ARCHIVED' WHERE status = 'PENDING_REVIEW';
-- Without an index, InnoDB scans the clustered index and places
-- next-key locks from the first record to supremum.
-- Every concurrent INSERT/UPDATE/DELETE on this table now blocks
-- until this transaction commits.

-- Fix pattern: first collect primary keys without locking, then update by PK:
SELECT id FROM orders WHERE status = 'PENDING_REVIEW' LIMIT 100;
UPDATE orders SET status = 'ARCHIVED' WHERE id IN (...); -- uses PK, narrow locks
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a next-key lock and why is it the default in InnoDB REPEATABLE READ?**

It is a record lock on an index entry plus a gap lock on the empty space immediately before that entry, written as the half-open interval `(previous, current]`. InnoDB uses it as the default for locking reads (`SELECT ... FOR UPDATE`, `SELECT ... FOR SHARE`, and writes like `UPDATE`/`DELETE`) under `REPEATABLE READ` for two reasons. First, snapshot reads can avoid phantoms with MVCC, but locking reads must see the latest committed data — without freezing gaps a concurrent insert could create a row that would have matched your `WHERE` filter, so a second locking read would see a phantom. Second, with statement-based binary logging, replicas replay transactions in commit order; if your range update and a concurrent insert into that range were not serialized by locks, the replica would apply the update over data that looked different on the primary and diverge.

**Q: What is the composition — record lock plus gap lock — and when does each part block inserts?**

The record part clamps the index entry and blocks `UPDATE`/`DELETE` on that exact row. The gap part puts cones across the open interval before that entry and blocks `INSERT` of any new key that would sort into that gap. So an insert whose key falls in `(10, 20)` is blocked by a gap or next-key lock covering that interval, but it is not blocked by a pure record lock on 20 alone. That is why the non-existent key case in Scenario B blocks inserts but still allows updating row 15.

**Q: When does InnoDB downgrade a next-key lock to a pure record lock or pure gap lock?**

Three clear cases. It downgrades to a pure record lock `[key]` when you do an exact equality lookup on a unique index or primary key and the row exists — the gap is unnecessary because the unique constraint already prevents a phantom with the same key. It downgrades to a pure gap lock `(prev, next)` when you do an exact equality on a unique index and the row does not exist — there is no record to clamp, so it only freezes the gap where that key would have gone. It does not downgrade for non-unique secondary indexes or range scans — there it keeps the full next-key lock and often adds an extra gap lock on the key after the range to block phantoms that sort after existing matches.

**Q: What happens if a FOR UPDATE query uses a column with no index?**

This is one of the most expensive mistakes in InnoDB. Because locks live on index records, without a usable index MySQL must scan the entire clustered index. In `REPEATABLE READ` it puts a next-key lock on every record and every gap from the first row to supremum. That effectively locks the whole table for writes — all concurrent inserts, updates, and deletes block until the scanning transaction commits. The fix is to index the filtered columns or break the work into PK-driven batches.

**Q: Why do two concurrent gap locks on the same range not block each other, and how does that create a deadlock?**

Gap locks are purely inhibitory — they only conflict with incoming `INSERT_INTENTION` locks, not with each other. Two transactions can both hold an X gap lock on `(10, 20)` at the same time. Neither waits until one tries to insert. When both then try to insert into the same gap, each insert needs to wait for the other's gap lock to be released, so both wait for each other and MySQL must kill one as a deadlock. The classic case is two transactions that both run `SELECT ... FOR UPDATE` on the same non-existent key and then both try to `INSERT` that key.

**Q: What is the supremum pseudo-record?**

In the B+Tree leaf page, keys are ordered low to high. To represent "everything after the largest real key," InnoDB keeps a fake internal record called `supremum` at the end. A lock on supremum means the interval `(max_key, +∞)` is frozen. Any query whose range extends beyond the current maximum — like `WHERE id > 100` when the max id is 50 — will place a next-key lock on supremum and block inserts greater than 50.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: The missing-index table freeze.** You write what feels like a small admin fix: `UPDATE orders SET status = 'ARCHIVED' WHERE status = 'PENDING_REVIEW'` and assume only pending rows are touched. If `status` has no index, InnoDB scans the clustered index and attaches next-key locks to every row and every gap in the whole table. All checkout inserts hang until you commit. You discover it by querying `performance_schema.data_locks` and seeing locks on every primary key plus `supremum`. Fix it by adding an index on `status`, or by first selecting the PKs without locking and then updating by PK in small batches.

**Trap 2: The duplicate-insert deadlock on a gap.** Many APIs do "check if not exists, then create": two concurrent requests both run `SELECT id FROM subscriptions WHERE user_id = 999 FOR UPDATE` when 999 does not exist, then both try `INSERT INTO subscriptions (user_id) VALUES (999)`. Step one succeeds for both because gap locks on `(500, 1000)` are compatible. Step two deadlocks because each insert needs an `INSERT_INTENTION` lock on that gap and waits for the other gap lock. MySQL detects the cycle and rolls back one transaction. The right fix is not to use `FOR UPDATE` to guard inserts — put a unique constraint on `user_id` and use `INSERT ... ON DUPLICATE KEY UPDATE` or catch the duplicate-key error in application code.

**Trap 3: Locking past your filter on a secondary index range.** With an index on `status_code` containing `[10, 20, 30, 40]`, running `SELECT * FROM tasks WHERE status_code <= 20 FOR UPDATE` feels like it should lock only 10 and 20. But to know the range is complete InnoDB must read forward to the first key that violates the condition, 30, and in doing so it acquires a next-key lock on `(20, 30]`. An unrelated insert with `status_code = 25` now blocks even though 25 was outside your filter. You notice it when a narrow range query blocks inserts that look irrelevant. Mitigations include using a more selective index, narrowing the range predicate, or moving to `READ COMMITTED` with row-based replication if you can tolerate phantom reads for locking reads.

**Trap 4: Assuming READ COMMITTED behaves the same.** If you test gap behavior in `REPEATABLE READ` and then deploy to a service that runs `READ COMMITTED`, your phantom protection disappears for locking reads and your deadlock pattern changes. In `READ COMMITTED` InnoDB releases many locks right after evaluating the row and does not take gap locks for most searches. You must run `binlog_format=ROW` in that mode for safe replication.

## 7. Compare With Related Concepts

**Next-key lock vs record lock.** A record lock clamps one index entry `[key]` and only blocks updates or deletes to that exact row. A next-key lock clamps that entry plus the gap before it `(prev, key]` and blocks both updates to the row and inserts into the preceding gap. Use a pure record lock when you can prove no phantom can appear with that key — typically an equality lookup on a unique index where the row exists. Expect a next-key lock everywhere else in `REPEATABLE READ` — ranges and non-unique indexes.

**Next-key lock vs gap lock.** A gap lock covers the open interval `(a, b)` — the empty space, boundary record `b` is untouched. A next-key lock covers `(a, b]` — the same empty space plus the boundary record `b`. A gap lock never conflicts with another gap lock; the record portion of a next-key lock does conflict with other record locks. Think "cones only" versus "cones plus clamp."

**Next-key locking in REPEATABLE READ vs READ COMMITTED.** In `REPEATABLE READ` (the default) gap and next-key locks are fully active for locking reads and writes, giving phantom protection for both snapshot and locking reads at the cost of higher contention and more deadlocks. In `READ COMMITTED` those locks are disabled for most searches and rows that fail the `WHERE` predicate are unlocked quickly, so contention drops and deadlocks reduce, but phantom reads become possible for locking reads and you must use `binlog_format=ROW` to keep replication consistent.

**Row lock vs table lock.** InnoDB next-key, gap, and record locks are all row-level in the sense that they live on index entries, but a table scan without an index turns row-level locks into a de facto table lock because every gap and record from first row to supremum gets locked. The scope is not declared — it is a consequence of how many index intervals your scan touches.

## 8. 🧠 The Memory Hook

A next-key lock is the cones **and** the clamp — the half-open interval `(gap, record]` that freezes empty space so no phantom row can sneak into your range, and locks the bounding record so no one can pull it out from under you while you hold it.
