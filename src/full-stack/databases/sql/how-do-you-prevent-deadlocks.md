# How Do You Prevent Deadlocks

## 1. The Real-World Problem — When You Actually Hit This

It's 11pm on a Tuesday. Your payments service has been running quietly for months, and suddenly alerts fire: dozens of transfers are failing with `deadlock detected` (PostgreSQL error code `40P01`) or `Deadlock found when trying to get lock; try restarting transaction` (MySQL error 1213). The queries themselves look innocent. Each one touches two account rows. Nothing is slow, nothing is broken — yet twice a minute, two transfers walk into each other and the database shoots one of them.

You dig into the logs and find the pattern. Your transfer worker moves money out of account A and into account B, in that order. A new reconciliation job you deployed last week does the exact reverse: it tops up B first, then debits A. Worker one grabs a lock on A. Job two grabs a lock on B. Worker one now waits for B. Job two now waits for A. Neither will ever finish, because each is holding the thing the other needs.

That is a deadlock. And here's the uncomfortable truth you learn that night: you cannot make it impossible. Databases give you tools that make deadlocks rare, plus a clean way to recover when they happen anyway. Senior engineers know both halves. This page teaches both.

## 2. The Analogy — Make the Mechanic Obvious

Picture a small kitchen with exactly two seasonings on one shelf: the salt shaker and the pepper shaker. A rule of this kitchen: to season a dish you must hold *both* shakers at once, and you don't put one down until your dish is done.

Two cooks start at the same time. Cook A grabs salt first, then reaches for pepper. Cook B, working on a different dish, grabbed pepper first, and now reaches for salt. Each is holding one shaker and waiting politely for the other. Neither will ever let go — letting go means starting their dish over. Dinner stalls forever. This is precisely a deadlock: not rudeness, not slowness, just a circular wait.

Now watch how the kitchen actually recovers. The head chef walks past, sees the standoff, confiscates the pepper from Cook B, and sends B back to the start of their dish. Cook A finishes normally; B restarts later. That's the database's deadlock detector picking a *victim* and rolling it back.

Prevention is just kitchen rules that stop the standoff from forming:

- **House rule: everyone grabs salt before pepper.** Every cook requests shakers in the same fixed order. If everyone follows it, the circular wait physically cannot form — the second cook to arrive is simply waiting in line for salt, like everyone else. That maps to locking rows in a consistent order.
- **Announce your shakers up front, in shelf order.** Before starting, a cook says "I'll need salt, then pepper," and collects both in one pass. Nobody is left mid-dish holding half their needs. That maps to `SELECT ... FOR UPDATE` on all needed rows, sorted, at the start of the transaction.
- **Season quickly and put the shakers back.** Holding seasonings while you chat on the phone blocks the whole kitchen. That maps to keeping transactions short — never hold locks while making an HTTP call.
- **A well-stocked second shelf.** If there were a pepper shaker per station, nobody would fight. That maps to good indexes, which shrink how many rows a query grabs.

Every prevention technique below is one of these four rules wearing a technical name.

## 3. The Full Explanation — How It Actually Works

First, the mechanic itself. When a transaction writes a row (`UPDATE` or `DELETE`), the database puts a lock on that row and holds it until the transaction commits or rolls back. If another transaction tries to write that same row, it blocks and waits. Waiting is normal and healthy — it's how consistency is enforced. Locks only become a problem when the waiting forms a *circle*: T1 holds row X and wants Y, while T2 holds Y and wants X. No amount of patience breaks a circle, so the database has to intervene.

Databases intervene by actively looking for circles. They maintain a "who is waiting for whom" graph, and when they find a cycle, they declare a deadlock, pick one transaction as the victim, roll it back completely, and return an error to its client. The other transaction proceeds untouched. The specifics differ by engine, and interviewers like hearing that you know this:

- **PostgreSQL** checks for cycles lazily — a process that has waited longer than `deadlock_timeout` (default 1 second) triggers a cycle check. If a cycle exists, Postgres picks the transaction that is cheapest to abort and raises an error with SQLSTATE `40P01`.
- **MySQL (InnoDB)** runs detection much more eagerly through its lock system and usually reports the deadlock almost instantly with error 1213 (`ER_LOCK_DEADLOCK`). It prints a report of the two clashing statements under `SHOW ENGINE INNODB STATUS` in the `LATEST DETECTED DEADLOCK` section — that report is gold during incident response. Don't confuse this with error 1205, which is a plain lock-wait timeout (someone waited too long for a single lock) — that's a queue problem, not a circle problem.
- **SQLite** doesn't have row locks at all — the whole database file takes one writer at a time — so you never get classic deadlocks there. You get `SQLITE_BUSY` ("database is locked") when writers overlap. Different mechanism, similar lesson: serialize your writes.

Now, why can't you just prevent deadlocks outright? Because some collisions depend on timing you don't control. Two perfectly well-written transactions can still deadlock if they legitimately need overlapping data and arrive interleaved. So the professional strategy is layered: *minimize* deadlocks with design rules, and *survive* the remainder with retries. The design rules:

**Rule 1: Touch objects in a consistent, global order.** This is the big one, and it comes straight from the salt-before-pepper rule. A cycle needs two transactions to request locks in *opposite* orders. If every piece of code in your system updates rows in ascending primary-key order — regardless of what the business logic happens to call "first" — no cycle can form. In practice: collect the IDs you're going to modify, sort them, then apply changes in that sorted sequence. Same idea across tables: if transfer code always touches `accounts` before `ledger_entries`, and nothing anywhere does the reverse, cross-table deadlocks vanish too.

**Rule 2: Acquire all your locks up front, in that order.** Instead of drifting through a transaction picking up locks as you go, ask for everything at the start with `SELECT ... WHERE id IN (...) ORDER BY id FOR UPDATE`. Every competing transaction then queues in the same order behind the same set, instead of interlocking halfway through. This converts a potential deadlock into an ordinary, harmless wait.

**Rule 3: Keep transactions short.** Locks live as long as the transaction. A transaction that commits in 5 milliseconds gives conflicts a tiny window; a transaction that sits open for 4 seconds — especially one doing an external API call or waiting on user input while holding row locks — invites trouble all over the database, not just at the rows it touched. Move validation, HTTP calls, emails, and heavy computation outside the transaction boundary. Fetch what you need, transact, commit, then do the slow stuff.

**Rule 4: Make single-row mutations atomic.** Many accidental multi-lock dances come from read-modify-write patterns: `SELECT` a balance, compute in application code, `UPDATE` with the result. That's two round trips, a longer lock window, and a lost-update risk on top. `UPDATE accounts SET balance = balance - 10 WHERE id = 1` does the whole thing in one locked instant and needs no explicit lock at all.

**Rule 5: Index the columns your writes filter on.** This surprises people. In MySQL InnoDB under REPEATABLE READ, an `UPDATE ... WHERE email = 'x'` with no index on `email` scans and gap-locks far more of the table than the one row you meant — and two such wide-locking statements can collide in ways that look totally unrelated to the rows they change. A missing index turns a surgical lock into a sweep. Indexes aren't just a read-performance tool; they control the *shape* of your write locks.

And the survival layer, because rules reduce probability but never reach zero: catch the deadlock error in your application, restart the *entire transaction* from scratch (not just the failed statement — the rollback undid everything), ideally with a short randomized backoff so concurrent victims don't stampede again in lockstep. Deadlock errors are among the few database errors that are genuinely safe to retry, because the victim was rolled back cleanly and left no partial state.

One more dial people reach for: isolation levels. Looser isolation (READ COMMITTED instead of REPEATABLE READ/SERIALIZABLE) removes gap-lock behavior in MySQL and generally shrinks the conflict surface — it genuinely helps with certain deadlock families. But it fixes nothing about the classic opposite-order row deadlock, which happens at every isolation level. Ordering fixes that family; isolation tuning doesn't.

## 4. See It In Practice — Real Code or Queries

**The deadlock, reproduced.** Two sessions in PostgreSQL or MySQL (InnoDB). Read the columns as alternating turns — Session 1 does a step, then Session 2 does a step:

```sql
-- Session 1                                          -- Session 2
BEGIN;

UPDATE accounts
SET balance = balance - 10
WHERE id = 1;        -- S1 holds a row lock on id = 1

                                                     BEGIN;

                                                     UPDATE accounts
                                                     SET balance = balance - 20
                                                     WHERE id = 2;   -- S2 holds id = 2

UPDATE accounts
SET balance = balance + 10
WHERE id = 2;
-- S1 now BLOCKS, waiting for S2's lock on id = 2

                                                     UPDATE accounts
                                                     SET balance = balance + 20
                                                     WHERE id = 1;
                                                     -- CIRCLE COMPLETE.
                                                     -- PostgreSQL: ERROR 40P01 deadlock detected
                                                     --   (after deadlock_timeout, default 1s)
                                                     -- MySQL InnoDB: ERROR 1213
                                                     --   (detected near-instantly)
```

Whichever engine detects it first kills one transaction — say S2. S2's `-20` update vanishes (rolled back cleanly), S1 continues to completion. The client talking to S2 receives the deadlock error and must decide what to do. Note this script is deliberately two-session theater — SQLite won't reproduce it because SQLite serializes writers at the file level.

**Fix 1: one global order.** The reconciliation job stops doing B-then-A and sorts IDs before writing. This is the version you can paste straight into `sqlite3 :memory:` — the syntax is dialect-neutral, and the discipline is what matters:

```sql
CREATE TABLE accounts (
  id      INTEGER PRIMARY KEY,
  balance INTEGER NOT NULL
);
INSERT INTO accounts (id, balance) VALUES (1, 100), (2, 200), (3, 300);

-- Business says "top up 3, then debit 1" — we STILL write in id order.
BEGIN;
UPDATE accounts SET balance = balance - 10 WHERE id = 1;   -- smallest id first, always
UPDATE accounts SET balance = balance + 10 WHERE id = 3;
COMMIT;

SELECT id, balance FROM accounts ORDER BY id;
-- 1 | 90      (100 - 10)
-- 2 | 200
-- 3 | 310     (300 + 10)
```

If two workers both follow "ascending id, everywhere, no exceptions," they can still *wait* for each other, but they can never *circle* — the later worker is just queued behind an earlier one at id 1.

**Fix 2: lock the whole set up front, sorted.** For transactions that need several specific rows, grab them all at the start so you never acquire locks piecemeal mid-flight. Supported by PostgreSQL and MySQL; SQLite has no `FOR UPDATE` because it doesn't do row locks — there, the single-writer model plays this role for you:

```sql
BEGIN;
-- Take every lock we will need, in sorted order, before touching anything.
SELECT id FROM accounts WHERE id IN (1, 3) ORDER BY id FOR UPDATE;

UPDATE accounts SET balance = balance - 10 WHERE id = 1;
UPDATE accounts SET balance = balance + 10 WHERE id = 3;
COMMIT;
```

Any competing transaction running the same shape queues behind the first lock instead of interlocking with it.

**Fix 3: atomic single-statement mutation.** Kills the read-modify-write dance entirely — no application-side computation, minimal lock window:

```sql
-- Instead of: SELECT balance -> compute in app -> UPDATE with computed value
UPDATE accounts SET balance = balance - 10 WHERE id = 1;
```

**The safety net: retry the whole transaction.** Even perfect discipline gets surprised sometimes, so wrap transactional units of work in a retry that recognizes deadlock errors specifically:

```js
// Node.js — works with node-postgres or mysql2 style drivers
async function runWithDeadlockRetry(work, maxAttempts = 3) {
  let attempt = 0;
  while (true) {
    try {
      return await work();            // work() must BEGIN, do everything, COMMIT itself
    } catch (err) {
      attempt++;
      const isDeadlock =
        err.code === '40P01' ||           // PostgreSQL: deadlock_detected
        err.code === 'ER_LOCK_DEADLOCK';  // MySQL/mysql2: errno 1213
      if (!isDeadlock || attempt >= maxAttempts) throw err;
      // Exponential backoff + jitter: retried jobs shouldn't collide in lockstep again
      await new Promise((r) => setTimeout(r, 50 * 2 ** attempt + Math.random() * 100));
    }
  }
}

// Usage: the callback owns the FULL transaction, so a retry replays everything cleanly
await runWithDeadlockRetry(() => transferFunds(fromId, toId, 10));
```

Two details that matter in review: the retry re-runs the *entire* unit of work (the rollback erased it all), and the operations should be safe to replay — a funds transfer expressed as relative deltas (`balance = balance - 10`) replays safely; a blind absolute write may not.

## 5. Interview Questions — All of Them, Done Properly

**Q: What exactly is a deadlock, and how is it different from a transaction just waiting on a lock?**

A normal wait is a line: transaction B wants row 1, transaction A holds row 1, B stands behind A until A commits. Annoying if A is slow, but progress happens. A deadlock is a circle: A holds something B needs while B holds something A needs. Lines always drain; circles never move. That structural difference is why the database treats them differently — a long line just times out eventually, but a circle triggers active detection and a forced rollback of one member. If you answer "it's when two transactions block each other," add the circle part explicitly — the cyclic wait is the actual definition.

**Q: How does the database detect a deadlock, and how does it choose the victim?**

The engine tracks a waits-for graph: nodes are transactions, edges point from a waiter to the holder blocking it. A deadlock is literally a cycle in that graph. PostgreSQL runs a cycle search when a waiter exceeds `deadlock_timeout` (default 1 second — it delays checking to avoid flagging merely slow-but-moving situations). InnoDB's lock subsystem watches continuously and usually detects the cycle almost immediately. Once a cycle is confirmed, the engine picks the transaction cheapest to unwind — InnoDB favors the one that has modified fewer rows, since less undo work means faster recovery — kills it, rolls it back entirely, and returns an error (`40P01` in Postgres, 1213 in MySQL). The surviving transaction never knows anything happened. Worth adding in an interview: the victim choice is about minimizing cost, and your app can't predict or influence which one dies — which is exactly why every client needs retry handling.

**Q: How would you prevent deadlocks in a service you own?**

I'd say most of it is one discipline plus hygiene. The discipline: a single, documented, global lock order — every writer touches rows (and tables) in ascending primary-key order, collected and sorted before the transaction starts, no exceptions for business convenience, enforced in code review. The hygiene: keep transactions milliseconds-short by pushing HTTP calls, emails, and heavy computation outside the transaction boundary; mutate with atomic statements like `SET balance = balance - 10` instead of select-compute-write; make sure every column used in an UPDATE/DELETE's WHERE clause is indexed, because unindexed filters widen the lock footprint (especially InnoDB gap locks under REPEATABLE READ); and chunk giant batch updates into smaller committed batches so no single transaction squats on thousands of rows. Then, honestly: none of that reaches zero, so I'd also ship a retry wrapper that catches `40P01`/`1213`, replays the whole transaction with jittered backoff, and alerts me if retry rates climb — because a rising rate means an ordering bug appeared somewhere.

**Q: Can deadlocks be fully prevented?**

Within one carefully controlled codebase, ordering discipline makes them practically disappear. Across a busy system with many services, ad-hoc analyst queries, ORMs generating plans you didn't hand-review, and schema migrations changing access patterns — no. Timing-dependent interleavings can always surprise you. That's why the mature position is "drive the rate toward zero, and make the remainder boring": deadlocks should show up as a rare, automatically-retried, logged blip — never a user-facing failure. Claiming "we eliminated deadlocks" sounds naive in an interview; claiming "we made them rare and self-healing, and we alarm on the rate" sounds like someone who has carried a pager.

**Q: Production just paged you with deadlock errors. Walk me through your response.**

First, confirm scope: is this a spike tied to a deploy, or steady background noise? Steady low rates that auto-retry are often acceptable; spikes mean something changed. Second, identify the exact combatants. On MySQL, `SHOW ENGINE INNODB STATUS` includes a `LATEST DETECTED DEADLOCK` section showing both statements, the locks held and wanted — often the whole mystery solved in one screen. On PostgreSQL, I'd pull the failing statements from application logs (the error message names both queries involved) and correlate with `pg_stat_activity` if it's ongoing. Third, look for the ordering violation: two code paths touching the same rows or tables in different sequences — commonly a batch job versus an API endpoint, or an ORM's implicit save order differing from raw SQL elsewhere. Fourth, fix the ordering (or add upfront `FOR UPDATE`), and finally make sure the retry path exists and measure whether the error rate drops. What I would *not* do is silently swallow the error or just bump `deadlock_timeout` higher — that hides the symptom.

**Q: How do isolation levels relate to deadlocks?**

They interact, but weaker than people assume. Isolation level controls how aggressively a database locks or versions data *during reads* and range scans. MySQL's REPEATABLE READ adds next-key and gap locks, which famously produce insert-intention deadlocks when two sessions insert the same missing key — dropping to READ COMMITTED removes most gap locking and genuinely kills that deadlock family. PostgreSQL uses MVCC with no read locks at any level, so lowering isolation buys you much less deadlock reduction there. But the core write-write, opposite-order deadlock — the transfer-versus-reconciliation kind — happens at every isolation level, including READ COMMITTED and even SERIALIZABLE-with-retries. So the accurate one-liner: isolation tuning reshapes which deadlock families are possible; consistent ordering is what eliminates the fundamental one. And note the trade in the other direction — SERIALIZABLE trades deadlocks-and-aborts for guaranteed correctness guarantees, which some systems happily accept.

**Q: Why did our DBA say a missing index caused our deadlocks? The queries touch different rows.**

Because without an index, the engine can't aim. An `UPDATE ... WHERE email = ?` on an unindexed column forces a full scan, and along the way the engine locks every candidate row it examines — in InnoDB under REPEATABLE READ, also the gaps between them. Now imagine two such statements scanning in different physical directions, or overlapping ranges in different orders: they deadlock over rows neither query actually intended to change. The fix is embarrassingly satisfying — index `email`, the scan collapses to one row, each transaction locks exactly its target, and the deadlocks evaporate. General lesson for interviews: lock footprint follows access path, so index design is concurrency design, not just a speed knob.

**Q: Where do optimistic and pessimistic locking fit into all this?**

Pessimistic locking (`SELECT ... FOR UPDATE`) is the traditional toolkit this page lives in: take real locks, hold them to commit. It prevents lost updates deterministically but creates contention, waits, and deadlock risk — hence all the ordering rules above. Optimistic locking avoids taking write locks at all: you read a version number, and the update succeeds only if the version hasn't moved (`UPDATE ... WHERE id = 1 AND version = 7`). Conflicts surface as a zero-rows-updated result you retry in the application. Optimistic schemes have no database locks to deadlock over — the failure mode shifts to wasted work under high contention. Rule of thumb I'd give: low-contention rows (most user profiles, config) suit optimistic; hot contended rows (wallet balances, inventory counters) suit pessimistic with careful ordering, or better, atomic single-statement increments that sidestep both.

## 6. The Traps — What Goes Wrong in Production

**"Retry the failed statement and carry on."** The wrong assumption: the deadlock error refers to just the last statement, so resending that one UPDATE is enough. It's wrong because the engine rolled back the *whole victim transaction* — every earlier INSERT and UPDATE in it is gone. What actually happens if you retry only the last statement: you resume halfway through a logical operation, producing half-applied business state (a debit without its credit) that no rollback will ever clean up. The fix: the retry must re-run the entire unit of work — begin a fresh transaction and replay everything. Structure your code so "one business operation = one function that owns its whole transaction," and retry at that boundary.

**"We got a deadlock error, so something is broken."** The wrong assumption: deadlocks indicate corruption or a serious defect, triggering fire-drill energy. Reality: under real concurrency, occasional deadlocks are a statistical certainty — two legitimate operations needing overlapping data can always arrive interleaved. Well-run systems expect them, retry automatically, and only alert when the *rate* rises. The fix in judgment terms: alert on deadlock *rate trends*, treat isolated occurrences as routine telemetry. Conversely — and this is the senior flip side — a sudden jump from "a few a day" to "hundreds" is a genuine incident that almost always means a new code path violates the lock-order convention.

**"Holding a transaction open during an API call is fine — the DB is just idle."** The wrong assumption: nothing is being written during the call, so no harm. Wrong because the *locks* stay held regardless of activity — the transaction, not the statement, owns them until commit. A 2-second payment-provider call while holding locks on two wallet rows turns every other transfer touching those rows into a waiter, multiplies collision windows enormously, and makes deadlock circles vastly likelier — while also wrecking throughput for everyone. What actually happens in the wild: latency spikes in one feature mysteriously degrade an unrelated one. Fix: draw the transaction boundary tightly around database work only — read what you need, commit, call the external service, then open a short second transaction to apply results (with a re-check or optimistic guard, since the world may have moved).

**"Lowering the isolation level will fix our deadlocks."** The wrong assumption: deadlocks are an isolation artifact, so READ COMMITTED removes them. Partially wrong: looser isolation does eliminate MySQL's gap-lock deadlock families and shrinks some conflict surfaces. But the canonical opposite-order write deadlock occurs identically under every isolation level — two transactions updating each other's already-updated rows don't care about snapshot rules. Teams have burned days tuning isolation while the reconciliation job kept colliding with the transfer worker. Fix: diagnose *which* deadlock family you have (statement shapes tell you — same-row swaps vs. insert-gap fights), and apply ordering for the row-swap family, isolation adjustment only for the gap family.

**"The database will kill the unimportant one."** The wrong assumption: victim selection respects business priority — the background batch dies, the checkout flow survives. Reality: engines pick on mechanical cost (roughly, fewest changes to undo), not semantics. Your critical checkout transaction can absolutely be the one rolled back. What actually happens when teams assume otherwise: checkout errors at random moments that "can't be reproduced." Fix: every transactional path — especially the customer-facing ones — gets deadlock-aware retry, because any transaction can lose the coin toss. Priority protection, if you truly need it, comes from application-level serialization (e.g., an advisory lock or queue per account) before the database ever sees contention.

**"Our ORM handles transactions, so lock ordering is handled too."** The wrong assumption: using SQLAlchemy sessions or an ORM's save methods means best-practice locking behavior. Reality: ORMs flush pending changes in an implementation-defined order (often insertion into the session, or relationship traversal order), which is rarely your global ID order — and mixing ORM-managed transactions with a raw SQL batch job is precisely how opposite-order pairs sneak in. What happens: deadlocks appear only in production paths where two different ORM call patterns meet. Fix: sort entity IDs yourself before flushing/updating within the unit of work, keep one documented order convention for hand-written SQL, and cover the hottest interaction pair with an integration test that runs both paths concurrently — deadlocks are one of the few bugs you can reliably reproduce in CI.

## 7. Compare With Related Concepts

**Deadlock vs. ordinary blocking (a lock wait).** Blocking is linear — one transaction waits behind another, and the line drains when the holder commits. Deadlock is circular — the wait can never resolve on its own. One-line rule: if removing the slow holder fixes it, it was blocking; if nobody can move at all, it was a deadlock.

**Deadlock (error 1213 / SQLSTATE 40P01) vs. lock wait timeout (MySQL error 1205, `innodb_lock_wait_timeout`).** These get conflated constantly because both surface as "lock errors." A deadlock is a detected circle, resolved instantly by killing a victim. A wait timeout means a transaction waited longer than its configured budget for a single lock and gave up — a queue/latency problem, usually caused by one fat transaction hogging rows. One-line rule: 1213/40P01 → reorder and retry; 1205/timeout → find and shorten whatever holds the lock that long.

**Prevention vs. detection-and-recovery.** Prevention means designing so cycles can't form (ordering, upfront locks, short transactions). Detection-and-recovery is the engine's built-in circle-breaking plus your application retries. You need both: prevention drives probability down, recovery absorbs reality. One-line rule: design as if you can prevent them, ship as if you can't.

**Pessimistic locking vs. optimistic locking.** Pessimistic (`FOR UPDATE`) takes real locks up front — deterministic protection, but contention and deadlock risk live in your lock discipline. Optimistic (version columns) takes no write locks — conflicts become cheap-to-detect failed updates you retry, and database deadlocks mostly leave the picture (though busy-retry loops bring their own thundering-herd problems). One-line rule: hot, genuinely contended rows earn pessimistic locks plus strict ordering; mostly-quiet rows are happier optimistic.

**Row-level locking vs. table-level locking.** Fine-grained row locks (Postgres, InnoDB) allow high concurrency and create the many-small-locks world where row-order deadlocks happen. Table-level locking (MyISAM historically, SQLite's file-level write lock) mostly eliminates deadlock-style circles by serializing writers, at the price of throughput. One-line rule: more concurrency granularity means more deadlock surface — that's the tax row locking pays for its parallelism.

## 8. 🧠 The Memory Hook

A deadlock is two cooks each holding the shaker the other needs — the fix is a kitchen rule: *everyone grabs salt before pepper*. Sort every write by ID, keep your hands on the shakers for milliseconds, and teach your code to apologize and cook again — because even with perfect manners, two chefs occasionally reach at the same instant.
