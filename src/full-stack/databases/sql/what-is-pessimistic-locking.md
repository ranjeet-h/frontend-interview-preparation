# What Is Pessimistic Locking

## 1. The Real-World Problem — When You Actually Hit This

Your store has exactly one PlayStation 6 left. At 10:00:00 sharp, two buyers hit "Buy" within milliseconds of each other. Request A reads the stock row: `qty = 1`, fine. Request B reads the same row half a heartbeat later: `qty = 1`, fine. Both pass the check, both run `UPDATE inventory SET qty = qty - 1`, both charge the card. Your stock column now says `-1`. You've sold a console you don't have, charged two people, and one of them is about to become a very angry support ticket.

Nothing crashed. No exception fired. Both transactions committed successfully and the data is simply wrong. That's the nastiest kind of bug — a check-then-act race where the check was true when you made it and false by the time you acted on it. Every developer hits this eventually: shopping carts overselling, double-booked hotel rooms, a wallet debited twice, two cron workers grabbing the same job. The database happily runs both writes because nobody ever told it these two requests were competing for the same thing.

Pessimistic locking is the formal way of telling the database: "these requests ARE competing — make them line up."

## 2. The Analogy — Make the Mechanic Obvious

Think of a single-stall bathroom with a physical bolt on the door.

You walk up, try the handle, it opens, you step in, and you slide the bolt. From that instant until you slide it back, the stall is yours alone. Anyone who wanders up finds the door won't open, and they wait. They don't argue, they don't barge in — the bolt physically prevents it. When you're done, you unbolt and leave, and the next person walks straight in.

Every piece maps onto the real mechanic:

- **Sliding the bolt** is `SELECT ... FOR UPDATE` — you grab exclusive access *before* doing anything, not after.
- **Using the stall** is your critical section — re-checking stock, applying the decrement, whatever must happen alone.
- **Unbolting the door** is `COMMIT` (or `ROLLBACK`). Here's the crucial part: the bolt stays slid until YOU unslide it. If you stand in front of the mirror for twenty minutes, the line grows for twenty minutes. The database holds your row lock from the moment of the `FOR UPDATE` until your transaction ends — nothing releases it early, no matter how long your code takes afterward.
- **People waiting outside** are other transactions whose `FOR UPDATE` / `UPDATE` statements block until you commit.
- **A person who faints inside and never comes out** is a hung transaction holding locks forever — until staff intervenes. In database terms: lock wait timeouts, or a DBA killing the session, which releases its locks.
- **A hallway full of people all needing the same single stall** is your throughput collapsing when every request contends for the same hot row.

Two refinements make this analogy genuinely accurate. First: people who are just *walking past* the bathroom — glancing in without needing the stall — aren't blocked at all. That's exactly how ordinary `SELECT`s behave under MVCC in Postgres and MySQL: readers never queue behind a lock holder. Only people who need the stall itself (writers, other lockers) wait. Second: some bathrooms post rules. "If occupied, leave immediately" is `NOWAIT` — you find out instantly instead of standing in line. And a restroom with five stalls where the sign says "take any FREE stall, ignore occupied ones" is `SKIP LOCKED` — each person claims a different free resource without ever queuing behind anyone. Hold onto that image; it's precisely the job-queue pattern we'll build later.

## 3. The Full Explanation — How It Actually Works

Plain English first: pessimistic locking assumes a collision *will* happen, so it locks the target row before acting on it. The name sounds negative, but it's just honest — if two buyers really are racing for one unit, pretending they won't collide is the naive position.

Here's the actual sequence. Inside a transaction, you run:

```sql
BEGIN;
SELECT qty FROM inventory WHERE sku = 'PS6-CONSOLE' FOR UPDATE;
```

The moment the engine fetches that row, it attaches an exclusive lock to it. From now until your transaction finishes, any other transaction trying to `SELECT ... FOR UPDATE`, `UPDATE`, or `DELETE` that same row stops and waits. Not fails — waits, like the line outside the bathroom. Meanwhile your application, still inside the same transaction, re-checks the business rule (`qty > 0`?), runs the `UPDATE`, and commits. The lock evaporates at commit, and the next waiter wakes up and sees your *committed* value. Buyer B no longer reads a stale `qty = 1`; they read the truth.

Three properties of this mechanism matter enormously, and interviews love probing them:

**Lock lifetime equals transaction lifetime — nothing less, nothing more.** The lock isn't released when your function returns, when the HTTP response is sent, or when your ORM object goes out of scope. Only `COMMIT` or `ROLLBACK` ends it. This is why wrapping a slow operation in the same transaction is dangerous: the lock duration is your transaction duration, period. And because transactions live on a pooled connection, a forgotten open transaction pins a connection hostage too — the lock problem and the pool problem compound ([connection pooling](what-is-connection-pooling.md)).

**Who blocks whom.** Writers block writers: `FOR UPDATE` conflicts with another `FOR UPDATE`, an `UPDATE`, or a `DELETE` on the same row. But under MVCC (both Postgres and InnoDB), plain `SELECT`s never block on anything — they read a consistent snapshot of the last committed data. So pessimistic locking costs you write concurrency on the hot row, not read concurrency. People overestimate this cost constantly.

**Waiting has limits, and limits differ by engine.** A blocked transaction doesn't necessarily wait forever. MySQL's `innodb_lock_wait_timeout` (default: 50 seconds) aborts the waiting *statement* with a lock-wait-timeout error — and by default (`innodb_rollback_on_timeout = OFF`) only that statement is rolled back; the transaction stays open, still holding whatever locks it already had. That default bites people. Postgres's equivalent, `lock_timeout`, defaults to disabled — zero, wait forever — so a sensible production setup sets it explicitly. Separately, both engines detect true deadlocks (T1 holds row A, wants row B; T2 holds row B, wants row A) and kill one side with a deadlock error you must retry ([deadlocks](what-is-deadlock.md)). Detection isn't prevention — ordering your lock acquisitions consistently is ([preventing deadlocks](how-do-you-prevent-deadlocks.md)).

**When pessimistic beats optimistic.** The choice is pure contention math. Optimistic locking reads freely and validates a version number at update time — cheap when collisions are rare, terrible when they're constant, because every collision means a failed update and a retry. Under a flash sale, hundreds of concurrent buyers hitting one row would mean near-total retry churn. Pessimistic locking turns that churn into an orderly queue: everyone gets their turn, nobody's work is wasted. It shines when three conditions hold together — high contention on specific rows, a *short* critical section (a decrement, a status flip), and correctness that matters more than raw latency (inventory, seat booking, balance debits). Flip any condition — low contention, long-running logic, retries acceptable — and optimism usually wins ([optimistic locking](what-is-optimistic-locking.md)).

**The price you pay.** Serialization is a throughput ceiling: if every request must pass through one row lock and each holds it for 50ms, your hard maximum is about 20 of those operations per second, globally, forever. Long transactions multiply the damage — every extra millisecond inside the critical section widens every queue behind you, raises deadlock probability, and pressures the connection pool. This is the entire operational discipline of pessimistic locking: keep the critical section embarrassingly small.

**Dialect reality check.** Syntax differs more than most developers expect:

- **PostgreSQL**: `SELECT ... FOR UPDATE`, plus `NOWAIT` (fail fast instead of queueing) and `SKIP LOCKED` (since 9.5).
- **MySQL/InnoDB**: `SELECT ... FOR UPDATE`; `NOWAIT` and `SKIP LOCKED` arrived in MySQL 8.0.
- **SQL Server**: no `FOR UPDATE` — you use table hints: `SELECT ... WITH (UPDLOCK, ROWLOCK)`.
- **SQLite**: no `FOR UPDATE` at all. It locks the whole database for writes, and `BEGIN IMMEDIATE` grabs that write lock up front — coarse-grained, but the same philosophy: seize the lock before you act.
- **Oracle**: `FOR UPDATE` with optional `NOWAIT`.

`SKIP LOCKED` deserves special attention because it unlocked a whole pattern: modern job queues. Workers run `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 10`, and each worker silently skips jobs another worker is already processing — no waiting, no double-processing, no Redis-based locking hack required. If an interviewer asks how you'd build a Postgres-backed queue, this clause is the answer.

## 4. See It In Practice — Real Code or Queries

**The canonical correct inventory decrement (PostgreSQL):**

```sql
-- PostgreSQL. Everything between BEGIN and COMMIT is one unit.
BEGIN;

-- Grab exclusive access to the row FIRST. Other writers now queue.
SELECT sku, qty
FROM inventory
WHERE sku = 'PS6-CONSOLE'
FOR UPDATE;                       -- row locked until commit/rollback

-- Application code (same transaction, same connection):
--   if qty < 1 -> ROLLBACK and tell the user "sold out".
--   else continue:

UPDATE inventory
SET qty = qty - 1,
    reserved_by = 'order_84721'
WHERE sku = 'PS6-CONSOLE';

INSERT INTO orders (order_id, sku) VALUES ('order_84721', 'PS6-CONSOLE');

COMMIT;                           -- bolt slides open; next buyer proceeds
```

Notice what the lock bought us: buyer B's `SELECT ... FOR UPDATE` cannot return until buyer A commits, so B reads the post-decrement quantity. The race window is gone — not narrowed, gone.

**Fail fast with `NOWAIT` (PostgreSQL; MySQL 8+ syntax identical):**

```sql
-- Flash-sale endpoint: better to tell the user "try again" in 5ms
-- than to have thousands of HTTP requests parked in a lock queue.
SELECT qty FROM inventory WHERE sku = 'PS6-CONSOLE' FOR UPDATE NOWAIT;
-- If another txn holds the row: ERROR 55P03 (could_not_obtain_lock).
-- Catch it, return HTTP 409/429, let the frontend show "too hot, retry".
```

**The job-queue pattern with `SKIP LOCKED` (PostgreSQL 9.5+, MySQL 8+):**

```sql
-- Each worker claims DIFFERENT jobs; nobody waits for anybody.
BEGIN;

UPDATE jobs
SET status = 'processing', claimed_by = 'worker-7'
WHERE id IN (
    SELECT id FROM jobs
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT 10
    FOR UPDATE SKIP LOCKED      -- skip rows other workers hold
)
RETURNING id;

COMMIT;
```

Run this on eight workers simultaneously and every pending job gets claimed by exactly one worker — the `UPDATE ... RETURNING` hands each worker its own batch atomically.

**A fully runnable demonstration (SQLite — labeled honestly: no `FOR UPDATE` here).** SQLite serializes all writers at the database level, and `BEGIN IMMEDIATE` acquires that write lock eagerly — the same "bolt the door first" philosophy, coarser grained. This script ran for real; here it is verbatim with its actual output:

```python
import sqlite3, time

DB = "/tmp/lockdemo.db"
setup = sqlite3.connect(DB)
setup.executescript("""
DROP TABLE IF EXISTS inventory;
CREATE TABLE inventory (sku TEXT PRIMARY KEY, qty INTEGER NOT NULL);
INSERT INTO inventory VALUES ('PS6-CONSOLE', 1);
""")
setup.close()

# Two buyers hitting the same database concurrently.
t1 = sqlite3.connect(DB, isolation_level=None)              # manual txn control
t2 = sqlite3.connect(DB, isolation_level=None, timeout=0)   # fail fast == NOWAIT spirit

c1, c2 = t1.cursor(), t2.cursor()

c1.execute("BEGIN IMMEDIATE")                               # T1 grabs THE write lock
c1.execute("UPDATE inventory SET qty = qty - 1 WHERE sku = 'PS6-CONSOLE'")
print("T1: holds the lock, reserved the unit, charging card (~2s)")
time.sleep(2)                                               # simulated slow payment work

try:
    c2.execute("BEGIN IMMEDIATE")                           # T2 tries to enter
    print("T2: unexpectedly got in!")
except sqlite3.OperationalError as e:
    print(f"T2: stopped at the door -> {e}")

c1.execute("COMMIT")
print("T1: committed, sale done")

t2.execute("PRAGMA busy_timeout = 3000")                    # now T2 queues politely
c2.execute("BEGIN IMMEDIATE")
cur = c2.execute(
    "UPDATE inventory SET qty = qty - 1 "
    "WHERE sku = 'PS6-CONSOLE' AND qty > 0"                 # business check lives HERE
)
print(f"T2: got the lock, but its UPDATE matched {cur.rowcount} rows -> sold out")
t2.commit()

print(f"final qty = {list(t1.execute('SELECT qty FROM inventory'))[0][0]}")
```

Output:

```txt
T1: holds the lock, reserved the unit, charging card (~2s)
T2: stopped at the door -> database is locked
T1: committed, sale done
T2: got the lock, but its UPDATE matched 0 rows -> sold out
final qty = 0
```

Read that output twice, because it teaches the deepest lesson on this page. The lock did exactly its job — T2 couldn't touch the row until T1 finished. But when T2 finally got in, the unit was already gone, and only the `AND qty > 0` predicate saved the invariant. **The lock serializes access; it does not perform your business validation.** You always need both: the lock to eliminate the race, and the check to enforce the rule.

**What the waiting side looks like in MySQL**, for completeness:

```sql
-- MySQL 8. Session B blocks on A's lock...
SELECT qty FROM inventory WHERE sku = 'PS6-CONSOLE' FOR UPDATE;
-- ERROR 3572 (HY000): Statement aborted because lock(s) could not be
-- acquired at the end of innodb_lock_wait_timeout (default 50s).
-- Trap: with innodb_rollback_on_timeout=OFF, ONLY this statement rolled
-- back -- B's transaction is STILL OPEN, still holding earlier locks.
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is pessimistic locking, and when would you actually choose it?**

It's locking a row (or rows) *before* reading-and-writing them, inside a transaction, so no concurrent transaction can touch them until you commit. The typical vehicle is `SELECT ... FOR UPDATE`. You choose it when contention on specific rows is high and your critical section is short — inventory decrements, seat booking, wallet debits — because optimistic approaches degrade into endless failed-update retries under exactly that load, while pessimistic locking degrades into an orderly queue. The mental shortcut: pessimism buys fairness and certainty at the price of throughput; optimism buys throughput at the price of retry chaos under contention.

**Q: Walk me through exactly how `SELECT ... FOR UPDATE` works. When is the lock released?**

The engine locates the row(s) matching your predicate and places an exclusive lock on each as it reads them. From that moment, other transactions attempting `FOR UPDATE`, `UPDATE`, or `DELETE` on those rows block. The lock is held until YOUR transaction issues `COMMIT` or `ROLLBACK` — not when your query finishes, not when your function returns, not when the HTTP response goes out. Transaction end is the only unlock event. This is precisely why the surrounding transaction must be kept tiny: lock duration is transaction duration.

**Q: Does `FOR UPDATE` block regular `SELECT`s too?**

No — and this separates seniors from juniors. In Postgres and InnoDB, ordinary `SELECT`s run under MVCC: they read a snapshot of last-committed data and never wait for locks. So while buyer A holds the row exclusively, buyer C can still view the product page and read the old quantity without blocking. Only competing *writers* queue. The practical implication: pessimistic locking hurts write throughput on the hot row, not read availability around it. (Caveat worth volunteering: explicitly locking reads like `FOR SHARE` do conflict, and in Postgres a plain `SELECT` inside `SERIALIZABLE` can fail for other reasons — but vanilla reads at normal isolation levels sail past.)

**Q: Pessimistic vs optimistic locking — how do you decide?**

Optimistic locking adds a `version` column; you read freely, then `UPDATE ... SET version = version + 1 WHERE id = ? AND version = ?` — if zero rows changed, someone beat you and you retry. Zero lock contention when traffic is mostly uncontended, which is most tables. Pessimistic locking guarantees progress-per-waiter but caps throughput at the serialized rate. Decision rule: measure or estimate the collision rate on the specific row. Rarely contested, retry-cheap → optimistic. Hotly contested (flash sales, popular seats), short critical section, retries expensive or user-hostile → pessimistic. Many systems use both: optimistic for 95% of entities, pessimistic for the handful of notorious hot rows.

**Q: What happens if a transaction holding a lock hangs — say, a network call inside the transaction stalls?**

Everything behind that lock stacks up: blocked queries pile onto the row, each occupying a pooled connection, and the pool drains — now unrelated endpoints time out too, because they can't get connections. Blast radius spreads far past the original bug. Defenses, layered: set `statement_timeout` / `lock_timeout` (Postgres) or rely on `innodb_lock_wait_timeout` (MySQL, default 50s — often too generous) so waiters give up; set `idle_in_transaction_session_timeout` (Postgres) so a stuck-open transaction gets killed server-side; alert on lock-wait counts and longest-active-transaction metrics; and structurally, never put external I/O inside the transaction (see Traps below).

**Q: Can pessimistic locking cause deadlocks? How do you handle that?**

Yes — it's the main self-inflicted wound. Locks are the raw material deadlocks are made of: T1 locks row 1 and wants row 2 while T2 locks row 2 and wants row 1. Both InnoDB and Postgres detect the cycle and abort one transaction with a deadlock error, so the system recovers — but your code must treat deadlock errors as retryable, not fatal. Prevention beats cure: acquire locks in one globally consistent order (ascending ID everywhere), touch fewer rows, keep transactions short, ensure filter columns are indexed. There's a fuller treatment on the [deadlock](what-is-deadlock.md) page.

**Q: What is `SKIP LOCKED`, and where does it earn its keep?**

An option (Postgres 9.5+, MySQL 8+) meaning: when scanning for rows to lock, silently skip rows already locked by others instead of waiting. Its killer application is database-backed job queues: ten workers all run `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 10` and each claims a disjoint batch atomically — no double-processing, no blocking, no external locking service. It converts "contended rows are a bottleneck" into "contended rows are somebody else's work," which is exactly what a queue wants. Pair it with idempotent job handlers anyway, because at-least-once delivery survives at the edges (worker crash after claim, before completion).

**Q: Does every database support this? What would you do in SQLite?**

No — `FOR UPDATE` is Postgres/MySQL/Oracle lineage. SQL Server expresses the intent with hints (`UPDLOCK, ROWLOCK`). SQLite has no row locks at all: it locks the entire database for writes, and the idiom is `BEGIN IMMEDIATE`, which seizes the write lock at `BEGIN` time instead of at first write — turning a mid-transaction `SQLITE_BUSY` surprise into a clean, early refusal. Same philosophy, blunter instrument. The transferable skill is recognizing *where* the lock is acquired in each engine, because that determines your race window.

**Q: How would you test and monitor a pessimistic-locking implementation?**

Testing: integration tests that open two real transactions on two real connections, advance one to just before commit, attempt the contending operation on the second, and assert it blocks (with a short timeout) — then commit the first and assert the second observes the new value or fails cleanly on `NOWAIT`/timeout. Unit tests can't catch races by definition. Monitoring: lock-wait counts and total wait time (`pg_stat_activity` wait events, `data_locks`/`performance_schema` in MySQL), deadlock rate (should hover near zero — spikes mean lock-order regressions), longest open transaction, and pool saturation. A sudden rise in lock waits after a deploy usually means new code lengthened a critical section or dropped an index off a locking query's predicate.

## 6. The Traps — What Goes Wrong in Production

**Holding the lock across an external API call.** Wrong assumption: "the reservation should stay open while I charge the card, so nobody can buy it meanwhile." Why it's wrong: the card network takes 500ms–5s, sometimes 30s — and your row lock lasts exactly as long. Every competing buyer's request queues behind a payment provider's latency; each queued request occupies a pooled connection; the pool empties; endpoints sharing the pool start failing; your lock wait timeouts fire and cascade into user-facing errors. One slow Stripe call becomes an app-wide outage. What actually happens in the wild: p99 latency on the product page quietly climbs, then everything falls over during the sale — the exact event the locking was meant to protect. The fix: shrink the transaction to pure database work. Reserve atomically (`UPDATE ... SET status='reserved', reserved_until = now() + interval '5 minutes' WHERE id=? AND status='available'`), **commit**, then call the payment API, then flip to `paid` — with a background sweeper expiring abandoned reservations. You've traded "hold the row" for "hold a *state*," which scales.

**A broad or unindexed `WHERE` clause locking far more rows than intended.** Wrong assumption: "`FOR UPDATE` locks just the row I want." Why it's wrong: it locks every row the query *touches* while locating matches. With no usable index, InnoDB at REPEATABLE READ scans — and locks — every row it examines, plus gap locks around them; a million-row scan is a million-row lockdown. Even Postgres, which is tidier about it, will lock all matching rows along a sequential scan path. What actually happens: a routine "reserve this SKU" call freezes writes to half the table, deadlocks spike, and nobody connects it to the missing index. The fix: locking queries must hit a unique index or primary key — `WHERE id = $1` or `WHERE sku = $1` — and code review should treat any non-key locking predicate as a production incident waiting to happen.

**Running `FOR UPDATE` outside a transaction.** Wrong assumption: "I added `FOR UPDATE`, I'm safe now." Why it's wrong: in autocommit mode (JDBC's default, many ORMs', plain `psql` one-liners) every statement is its own micro-transaction — the lock is acquired and released the instant the `SELECT` returns, long before your subsequent `UPDATE` runs. You built a bathroom door that unlocks itself the moment you stop touching the handle. What actually happens: tests pass (single-threaded tests never expose it), production oversells anyway, and the code *looks* correct. The fix: verify the transaction boundary in the driver/framework layer — explicit `BEGIN`, all statements on the *same* connection, explicit `COMMIT` — and add the two-connection integration test from the previous section so this class of bug can't silently return.

**Believing the lock enforces your business rule.** Wrong assumption: "with `FOR UPDATE`, the database guarantees I can't oversell." It guarantees only that access to the row is serialized — the demonstrated SQLite output above proved it: T2 got the lock fairly, then had to discover via `rowcount = 0` that the goods were gone. What actually happens without the in-transaction recheck: perfectly serialized, perfectly orderly overselling. The fix: the business predicate lives in the same transaction as the lock — either re-check the selected values in application code, or push it into SQL (`AND qty > 0` on the `UPDATE`, then branch on affected-row count).

**Treating a MySQL lock-wait timeout as a full rollback.** Wrong assumption: "the statement timed out, the transaction cleaned itself up." With `innodb_rollback_on_timeout = OFF` (the default), MySQL rolls back only the timed-out *statement*; the transaction stays open, still clutching every lock it acquired earlier. What actually happens: your catch-block retries the operation on the same connection, stacking a second attempt's locks inside a zombie transaction, and the mess compounds until something crashes or a human kills the session. The fix: on lock-wait errors, issue an explicit `ROLLBACK` before any retry — or set `innodb_rollback_on_timeout = ON` so the failure semantics match your intuition.

## 7. Compare With Related Concepts

**Pessimistic vs optimistic locking.** Opposite bets about the world. Pessimistic assumes collision and pays upfront — every contender queues, even when no collision would have occurred. Optimistic assumes no collision and pays on failure — everyone proceeds freely, and losers redo work via retries. Concretely: pessimistic is `SELECT ... FOR UPDATE` inside a transaction; optimistic is a version/stamp column checked in the `UPDATE`'s `WHERE` clause. One-line rule: high, sustained contention on identifiable hot rows with short critical sections → pessimistic; mostly-uncontended data where retries are rare and cheap → optimistic. Full mechanics on the [optimistic locking](what-is-optimistic-locking.md) page.

**Pessimistic locking vs isolation levels.** Different layers of the same building. An [isolation level](what-is-isolation-level.md) is an ambient setting governing *visibility* — what anomalies (dirty reads, phantoms, lost updates) your transaction can suffer across ALL its statements. Pessimistic locking is a targeted instrument applied to named rows for one critical section. Key insight: bumping the isolation level is usually the wrong tool for the oversell problem — even REPEATABLE READ permits the lost-update race, and SERIALIZABLE buys blanket protection at blanket cost plus serialization-failure retries. One-line rule: pick the isolation level for the anomaly profile of your workload; reach for explicit row locks when one specific invariant (this row must not change while I decide) needs a guarantee the ambient level doesn't provide.

**Row locks vs table locks (and why granularity matters here).** `FOR UPDATE` *asks* for row-level locking, and engines like InnoDB and Postgres deliver it — thousands of transactions can hold locks on different rows simultaneously. Coarser engines (MyISAM historically, SQLite's whole-database write lock) lock the entire table or database, turning any pessimistic scheme into a global queue. Granularity determines your ceiling: one-line rule — row locks scale with distinct rows touched; anything coarser serializes unrelated work. Details on [row-level](what-is-row-level-locking.md) and [table-level locking](what-is-table-level-locking.md).

**Database row locks vs distributed locks (Redis/ZooKeeper).** A `FOR UPDATE` lock guards a row within one database's authority; a Redis lock coordinates processes that might not share a database at all (or span shards where no single node sees both parties). They overlap in job-queue territory, and `SKIP LOCKED` has largely retired the Redis hack *when* your queue lives in Postgres/MySQL anyway. One-line rule: if all contenders share one database transaction, use the database's lock; if they don't share anything, you need a shared external arbiter.

## 8. 🧠 The Memory Hook

Pessimistic locking is bolting the bathroom door before you use it: the bolt slides open only when you commit, people who merely walk past (readers) are never blocked, and if you move in and refuse to leave, the line outside becomes everyone's emergency. And the lock only keeps people out — it never checks whether there's toilet paper; your `qty > 0` check still has to ride inside the stall with you.
