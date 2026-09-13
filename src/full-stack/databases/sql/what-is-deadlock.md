# What Is a Deadlock

## 1. The Real-World Problem — When You Actually Hit This

Your payments service has been running quietly for months. One Tuesday afternoon, support forwards a ticket: a customer tried to send money to a merchant, the spinner hung for about a second, then the app showed "something went wrong." At the same minute, the merchant tried to send money back. Both requests were doing a perfectly normal two-row update. Neither was slow. Yet both froze, and one of them died with a 500.

You pull the logs and find this line from PostgreSQL:

```txt
ERROR:  deadlock detected
DETAIL: Process 44 waits for ShareLock on transaction 39; blocked by process 45.
```

Here's what makes deadlocks nasty as a class of bug: they almost never reproduce locally. Staging has one tester clicking buttons. Production has thousands of requests interleaving, and a deadlock needs two transactions to grab locks in *just* the wrong order. It might happen once per million requests — which is rare in tests and completely routine in production. If you don't understand the mechanism, you'll stare at two innocent-looking queries wondering how either of them could fail.

## 2. The Analogy — Make the Mechanic Obvious

Picture two developers at an airport lounge, both with dying laptops. Ana has a USB-C cable and needs a Lightning cable. Ben has a Lightning cable and needs USB-C. Both are polite, so neither grabs — each says "I'll hand you mine as soon as you hand me yours." Ana holds her cable and waits for Ben's. Ben holds his and waits for Ana's. Nothing anyone says moves the situation. It stays stuck forever, not because anyone is slow, but because of the *structure* of who holds what.

That structure has a name in database theory — the Coffman conditions — and every one of them maps to something in the lounge:

- **One owner at a time** (mutual exclusion): a cable charges exactly one laptop. A row's write lock belongs to exactly one transaction.
- **Hold while you wait** (hold and wait): Ana won't put her cable down while waiting. Your transaction keeps its row locks until commit, even while it waits for the next lock.
- **Nobody takes it from you** (no preemption): the database never rips a lock out of a healthy transaction's hands mid-flight. Only you release your locks, by committing or rolling back.
- **Everyone waits on the next person in a loop** (circular wait): Ana waits for Ben, Ben waits for Ana. Draw arrows for "who waits for whom" and you get a circle.

All four present? Deadlock — permanently stuck, by construction. Now the fixes write themselves, because each one attacks a condition:

A **mutual friend** strolls over, figures out the circle, and takes the cable away from whoever loses the least by giving it up (say, the person whose laptop is at 80% battery anyway). That's deadlock *detection* and victim selection — forcibly breaking "nobody takes it from you."

Alternatively, each developer declares in advance: "if I don't get the other cable within 50 seconds, I give up." That's the *timeout* approach — cheaper than having a friend analyze the room, but cruder, because someone might give up when the wait was actually going somewhere.

And the **house rule**: "in this lounge, always acquire Lightning first, USB-C second." If both follow it, both go for Lightning simultaneously; one wins, the other simply waits in line. Waiting in line resolves itself. Only the circle is fatal — so break the circle and there is no deadlock, ever.

Keep this lounge picture. Every section below is it wearing database clothes.

## 3. The Full Explanation — How It Actually Works

**How two innocent transfers create a circle.** Say the table is `accounts(id, balance)` and two requests arrive within milliseconds of each other. Transaction 1 moves $50 from Alice (id 1) to Bob (id 2). Transaction 2 moves $30 from Bob back to Alice. When a transaction updates a row, the engine puts a write lock on that row and holds it until the transaction ends — that's how it guarantees nobody sees or overwrites half-done work ([transactions](what-is-a-transaction.md)). Now watch the order each transaction touches rows: T1 locks row 1, then asks for row 2. T2 locks row 2, then asks for row 1. If T1 gets row 1 before T2 does, and T2 gets row 2 before T1 asks for it, you've built the airport lounge: each holds one lock and waits for the other, and neither will ever proceed. This is the core mechanic — a deadlock is never caused by one bad statement, it's caused by two (or more) transactions whose lock-acquisition *orders* disagree.

**Detection: the waits-for graph.** Both major engines maintain, conceptually, a directed graph: nodes are transactions, and there's an arrow from T1 to T2 whenever T1 is waiting for a lock that T2 holds. A deadlock is exactly a cycle in this graph. The engines differ in when they look for cycles:

- **PostgreSQL** is lazy about it. A waiter sits quietly, and only after waiting longer than `deadlock_timeout` (default 1 second) does it wake up and search the graph for a cycle through itself. That's why the two transfers hang for roughly a second before the error appears. If it finds a cycle, it aborts the participant with the lowest `deadlock_priority` (with defaults, effectively the transaction that ran the detection), which receives `ERROR: deadlock detected`, SQLSTATE **40P01**.
- **MySQL/InnoDB** is eager. Every time a transaction is *about to* start waiting, InnoDB walks the graph right then and checks whether granting this wait would close a circle. Detection typically finishes in microseconds, and the losing transaction gets `ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction`.

Who gets killed — the "victim"? Both engines try to make it cheap. InnoDB picks the transaction that has modified the fewest rows, because rolling it back means undoing the least work. PostgreSQL uses the priority setting mentioned above. Either way, the victim's transaction is rolled back completely — every statement it made vanishes — and its connection receives the error. The other transaction suddenly gets its lock and carries on as if nothing happened.

**Timeout: the crude alternative.** You can skip graph analysis entirely and just say "never wait more than N seconds for a lock." InnoDB does this via `innodb_lock_wait_timeout` (default 50 seconds, error 1205); PostgreSQL has `lock_timeout`. Why would anyone prefer the dumb version? Because detection costs CPU on every wait, and at extreme concurrency on a handful of ultra-hot rows (think counters and inventory flash-sales), thousands of waiters constantly walking the graph becomes measurable overhead. That's exactly why InnoDB ships the `innodb_deadlock_detect = OFF` switch: turn detection off, rely on the timeout to eventually clear jams, and accept slower recovery. Rule of thumb: detection for normal workloads (fast, precise), timeout-only for pathological hot-row contention where the detection cost itself hurts.

Note these two failure modes produce *different errors*: 1213 means "cycle found, you were rolled back," while 1205 means "you waited too long, possibly just behind heavy traffic, no cycle involved." They need different reactions, so your code should distinguish them.

**Retry discipline: the part everyone gets wrong.** A deadlock error means "you lost this round, please play again" — it is expected, recoverable, and *safe to retry*. But the retry has rules. First, retry the **whole transaction**, from its very first statement — not just the statement that errored (more on why in the Traps section). Second, re-read any data you based decisions on, because the world moved on while you were rolled back. Third, back off with jitter — wait a random-ish 50–200ms — so ten deadlocked transactions don't all stampede back at the same instant and rebuild the same circle. Fourth, bound the attempts (3 is plenty) and surface a real error if you exhaust them. Fifth, anything with side effects outside the database — sending email, charging a card gateway — must happen *after* commit, otherwise a retried transaction sends the email twice. This pairs naturally with idempotency keys on payment endpoints: the client may legitimately see a timeout and resend, and your retry layer may replay the transaction — both must land as one charge.

**Prevention: attack the circular wait.** Since deadlock needs all four conditions, the practical engineering target is the fourth — the circle. The single highest-leverage habit: **touch rows in one global, consistent order everywhere in the codebase.** Almost always: ascending primary key. Before updating several accounts, sort their ids and update in that order; now every transaction acquires locks in the same sequence, and a cycle is structurally impossible — the lounge house rule. Supporting habits matter too: keep transactions short (every extra millisecond widens the window for interleaving), touch fewer rows, never do network calls or user-input waits inside a transaction (see [connection pooling](what-is-connection-pooling.md) for how long transactions strangle everything downstream), and make sure filtering columns are indexed — an `UPDATE` with no usable index makes InnoDB scan and next-key-lock far more rows than you intended, multiplying your deadlock surface. There's a fuller checklist on [preventing deadlocks](how-do-you-prevent-deadlocks.md).

**Where gap locks enter the picture.** InnoDB at its default REPEATABLE READ isolation does something special to stop phantom rows: besides locking the rows it touches, it locks the *gaps between* rows — the empty space where a new matching row could be inserted (these are gap and next-key locks; the deep dive lives on the [MySQL gap lock](../mysql/what-is-gap-lock.md) page). Here's the twist that produces famous deadlocks: **gap locks don't conflict with each other** — two transactions may hold gap locks on the very same gap simultaneously. But an *insert* into that gap must wait for every gap lock on it. So: T1 takes a gap lock on the space around id 50, T2 takes a gap lock on the same space (fine so far — shared), then T1 inserts id 50 and waits for T2's gap lock, while T2 inserts id 50 and waits for T1's. Circle. Instant deadlock. The standard fixes: drop to READ COMMITTED where the business allows it (InnoDB skips most gap locks there), and index your predicates so the locked gaps stay narrow. Debugging these specific patterns is its own skill — see [debugging MySQL deadlocks](../mysql/how-do-you-debug-mysql-deadlocks.md) and the InnoDB-specific [what is a deadlock in MySQL](../mysql/what-is-deadlock-in-mysql.md).

**Why SQLite never deadlocks at all.** Worth knowing as a contrast, because it proves the mechanism. SQLite doesn't do row locks — it locks the entire database file for writing. One global lock cannot form a circle, so SQLite is structurally deadlock-free. The price is concurrency: writers queue behind writers globally. Run it and see the blocking half of our story (this is runnable today — two terminals, same db file):

```sql
-- Terminal 1: open a write transaction and leave it hanging
sqlite3 app.db
BEGIN;
UPDATE accounts SET balance = balance - 50 WHERE id = 1;

-- Terminal 2: try to write, allowing yourself 2s of patience
sqlite3 app.db
.timeout 2000
UPDATE accounts SET balance = balance - 30 WHERE id = 2;
-- waits 2 full seconds, then:
-- Error: stepping, database is locked (5)
```

Verified output: Terminal 2 blocks for 2000ms and dies with `database is locked (5)` — that's SQLite's version of a lock wait timeout, and it's the closest SQLite can ever get to a deadlock. Row-locking engines like PostgreSQL and InnoDB traded this limitation for fine-grained concurrency, and deadlocks are the tax on that trade.

## 4. See It In Practice — Real Code or Queries

First, the crime scene itself — the two transfers, annotated. Syntax is PostgreSQL; MySQL behaves identically for this scenario:

```sql
CREATE TABLE accounts (
  id      INTEGER PRIMARY KEY,
  owner   TEXT NOT NULL,
  balance INTEGER NOT NULL CHECK (balance >= 0)
);

INSERT INTO accounts VALUES (1, 'alice', 500), (2, 'bob', 300);

-- T1: alice pays bob $50                      -- T2: bob refunds alice $30
BEGIN;                                          BEGIN;
UPDATE accounts SET balance = balance - 50      UPDATE accounts SET balance = balance - 30
  WHERE id = 1;   -- locks row 1                 WHERE id = 2;   -- locks row 2

UPDATE accounts SET balance = balance + 50
  WHERE id = 2;   -- BLOCKED: row 2 owned by T2
                                                UPDATE accounts SET balance = balance + 30
                                                  WHERE id = 1;   -- BLOCKED: row 1 owned by T1

-- Both wait. ~1s later (PostgreSQL deadlock_timeout),
-- one side is chosen as victim and rolled back:
--
-- ERROR: deadlock detected
-- DETAIL: Process 44 waits for ShareLock on transaction 39; blocked by process 45.
-- SQLSTATE: 40P01
--
-- The survivor's blocked UPDATE completes; it COMMITs normally.
```

Run those two sessions side by side in any PostgreSQL instance and you will reproduce the incident from section 1, deterministically, in under two seconds. On MySQL 8 you'd instead see `ERROR 1213 (40001)` and can inspect the autopsy with `SHOW ENGINE INNODB STATUS\G` — look for the `LATEST DETECTED DEADLOCK` section, which prints both transactions, the exact locks each held, and which one got rolled back.

Now the application side — the retry wrapper every backend dealing with row locks should have. Node.js with `pg`; the shape translates directly to Python/SQLAlchemy:

```js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs `work` inside a transaction, retrying the WHOLE transaction when the
// database reports a deadlock or serialization failure. These errors mean
// "rolled back, safe to replay" — unlike constraint violations, which are not.
async function withDeadlockRetry(pool, work, { attempts = 3 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      // 40P01 = deadlock (Postgres), 40001 = serialization/deadlock (also
      // what MySQL returns for errno 1213). Both are retryable at the
      // transaction boundary.
      if ((err.code === '40P01' || err.code === '40001') && attempt < attempts) {
        await sleep(50 * 2 ** (attempt - 1) + Math.random() * 100); // backoff + jitter
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

// Usage: the fix for the incident — enforce ONE global lock order (ascending id).
await withDeadlockRetry(pool, async (client) => {
  const ids = [fromId, toId].sort((a, b) => a - b); // THE critical line
  for (const id of ids) {
    await client.query('SELECT balance FROM accounts WHERE id = $1 FOR UPDATE', [id]);
  }
  // ... debit/credit, then INSERT INTO ledger ...
});
```

With the sort in place, both directions of transfer lock row 1 before row 2. T2 can no longer hold row 2 while wanting row 1 — the circle can't close. The retry wrapper remains as a seatbelt for cases ordering can't cover (multi-table foreign key chains, gap lock surprises, code paths you don't control yet). For the deeper playbook, see [row-level locking](what-is-row-level-locking.md) and the PostgreSQL-specific [row-level locking page](../postgresql/what-is-row-level-locking.md).

## 5. Interview Questions — All of Them, Done Properly

**Q: What exactly is a deadlock, and how is it different from just "slow because of locks"?**

A deadlock is when two or more transactions each hold a lock the others need, forming a waiting circle none of them can exit alone — they would wait literally forever, so the engine must intervene. Ordinary lock contention is different: T2 wants a row T1 holds, waits, and T1 *finishes*, releasing it. Someone is always making progress. The test question to ask yourself: "draw the waits-for arrows — is there a cycle?" Cycle means deadlock; a chain that ends somewhere means mere queuing.

**Q: Walk me through how two bank transfers deadlock each other.**

T1 transfers from account A to B: it updates A (locking that row), then updates B. T2 transfers from B to A: it updates B (locking it), then updates A. If the scheduler interleaves them so T1 locks A first and T2 locks B first, T1's second statement blocks on B and T2's second blocks on A. Each now waits for a lock held by the other, indefinitely, because neither will release its own lock until its transaction ends — and it can't end while it's waiting. About a second later PostgreSQL detects the cycle and rolls one side back with SQLSTATE 40P01; InnoDB would have caught it near-instantly with error 1213. The key insight interviewers want: the deadlock comes from *opposite lock acquisition order*, not from anything being wrong with either query individually.

**Q: How does the database actually detect a deadlock?**

It maintains a waits-for graph — nodes are active transactions, edges point from waiter to holder. A deadlock exists iff the graph has a cycle. PostgreSQL checks for cycles lazily: only when a waiter has been stuck longer than `deadlock_timeout` (default 1s) does it search for a cycle through itself, keeping the overhead near zero for short waits. InnoDB checks eagerly: before entering any lock wait it walks the graph to see whether this new edge closes a circle, catching deadlocks in microseconds. Same data structure, different polling discipline — and the discipline explains observable behavior differences (Postgres victims feel a ~1s stall; InnoDB feels instant).

**Q: What happens to the "loser"? What error reaches the application?**

The engine picks a victim and rolls its transaction back entirely — all its statements undone, its locks released — letting the other transaction proceed. InnoDB chooses the transaction that modified the fewest rows, since that's cheapest to undo. PostgreSQL honors `deadlock_priority`, canceling the lowest-priority participant. The application receives a precise, retryable error: PostgreSQL reports `deadlock detected` with SQLSTATE 40P01; MySQL returns errno 1213, SQLSTATE 40001, "try restarting transaction." That message text is a direct instruction: the engine has already cleaned up; replay the whole unit of work.

**Q: How should the application handle a deadlock error?**

Catch it at the transaction boundary and retry the entire transaction — fresh reads, fresh writes — not just the failing statement. Add exponential backoff with jitter so concurrent losers don't regroup into the same collision, cap retries around three, and treat exhaustion as a real 5xx. Anything non-repeatable (emails, third-party charges) moves after commit, ideally guarded by an idempotency key, since both engine retries and client retries replay work. Also distinguish 1213/40P01 (cycle — retry confidently) from 1205/`lock wait timeout` (gave up waiting — retryable too, but frequent occurrences signal contention that needs a structural fix, not blind retries).

**Q: How do you prevent deadlocks in a busy codebase?**

Attack the circular-wait condition, because it's the one you can remove without giving anything up. Enforce a global lock order — sort ids ascending before touching multiple rows, in every code path, forever. Keep transactions short and narrow: fewest rows, fewest statements, zero network calls inside. Index every filtered column so updates lock only intended rows (an unindexed predicate in InnoDB at REPEATABLE READ next-key-locks whole swaths of the table). Where the business tolerates it, run InnoDB at READ COMMITTED to eliminate most gap locks. And wrap hot paths in the whole-transaction retry so residual deadlocks become invisible latency spikes instead of user-facing errors. Ordering makes them rare; retry makes them harmless.

**Q: What are the Coffman conditions, and why should a backend dev care?**

They're the four conditions that must all hold simultaneously for a deadlock to exist: mutual exclusion (a lock has one holder), hold-and-wait (you keep locks while waiting for more), no preemption (locks are only released voluntarily at commit/rollback), and circular wait (the waiting forms a loop). Backend devs should care because each condition names a lever: you can't give up mutual exclusion or no-preemption (they protect correctness), but you can break hold-and-wait partially (acquire all locks upfront via ordered `FOR UPDATE`s) or break circular wait entirely (global ordering). Naming these four turns "deadlocks are mysterious" into "here are the four switches."

**Q: Why do gap locks in InnoDB cause deadlocks even when transactions touch "nothing in common"?**

Because under REPEATABLE READ, InnoDB locks gaps, not just rows, to prevent phantoms — and gap locks have a perverse property: two transactions can hold gap locks on the *same* gap without conflict, yet each *insert* into that gap must wait out all existing gap locks. So T1 and T2 both range-check the same gap (each takes a gap lock — compatible), then both try to insert into it: T1's insert waits for T2's gap lock, T2's waits for T1's. Neither touched a common *row*, yet they deadlock over empty space. Mitigations: READ COMMITTED (drops most gap locks), tight indexes so gaps are tiny, or serializing inserts through an explicit lock. This question is a favorite because it exposes who has actually read `SHOW ENGINE INNODB STATUS` output versus who memorized "deadlock = two updates in wrong order."

**Q: Detection versus timeout — when would you deliberately choose the timeout?**

When detection's cost exceeds its benefit. Waits-for-graph analysis burns CPU on every wait, and in workloads with enormous concurrency funneled onto a handful of rows (counters, flash-sale stock), thousands of simultaneous waiters repeatedly walking the graph becomes real overhead — InnoDB documents exactly this case and provides `innodb_deadlock_detect = OFF` so you lean on `innodb_lock_wait_timeout` instead. The trade: detection recovers in milliseconds and kills only true participants; the timeout is cheap but blunt — it recovers slowly (tune the timeout down) and may abort transactions that were queued behind legitimate traffic rather than a genuine cycle.

**Q: How would you test for deadlocks, and what do you monitor in production?**

Testing: deadlocks are scheduling accidents, so single-threaded tests never find them — you must drive concurrency deliberately. Write an integration test that opens two real connections and executes the suspicious interleaving step by step with explicit synchronization, asserting that one side receives 40P01/1213 and the retry wrapper recovers. For continuous safety, stress hot endpoints with parallel load in CI and fail on deadlock-counter deltas. Monitoring: track the engine's counters (`pg_stat_database`.`deadlocks` in PostgreSQL; `SHOW GLOBAL STATUS LIKE 'Innodb_deadlocks'` in MySQL), alert on rate-of-change rather than totals, and log the full `LATEST DETECTED DEADLOCK` report so each incident identifies the two offending query shapes. On the frontend contract side: map these errors to a retryable 409/503 (never a scary generic 500), rely on idempotency keys so automatic retries can't double-charge, and instrument retry counts — rising retries are your early-warning light before users notice anything.

## 6. The Traps — What Goes Wrong in Production

**Retrying only the statement that failed.** Wrong assumption: "the third UPDATE threw 1213, so I'll rerun that UPDATE." Why it's wrong: the engine rolled back the *entire transaction* — the first two successful statements are gone, and in PostgreSQL the connection is left in "aborted transaction" state where every further command errors until ROLLBACK. What actually happens: teams either spam errors on a poisoned connection or silently commit half a money transfer when the retry "works" in autocommit mode. The fix: structure code so the retry boundary *is* the transaction boundary — the wrapper in section 4 — and replay from the first statement, re-reading any rows your logic depended on.

**Treating the deadlock as a database bug or a fluke.** Wrong assumption: "Postgres killed my perfectly valid transaction; the DB is misbehaving." Why it's wrong: the engine did exactly its job — the application acquired locks in conflicting orders, and the engine broke the only kind of jam it legally can. What actually happens: the team adds `retry` sprinkles and moves on, while the underlying ordering flaw keeps generating incidents at whatever frequency traffic dictates. The fix: read the deadlock report (both engines print the competing statements), find the ordering disagreement, normalize it — usually one missing sort — and only then consider the problem closed. Retry handles the symptom; ordering removes the disease.

**Making transactions "safer" by making them bigger.** Wrong assumption: wrapping more work in one big transaction protects consistency, so the transaction should span validation calls, API invocations, and several tables. Why it's wrong: a transaction holds every lock from BEGIN to COMMIT, so duration equals exposure — the longer and wider, the more likely two big transactions overlap in the wrong order, and meanwhile each one pins a pooled connection hostage. What actually happens: deadlock rates climb together with pool exhaustion, and latency spreads to endpoints that share nothing but the pool ([why that's deadly](what-is-connection-pooling.md)). The fix: shrink transactions to pure database work, move external calls and heavy computation outside, and reserve big transactions for genuinely atomic multi-row invariants.

**Believing a higher isolation level eliminates deadlocks.** Wrong assumption: "we upgraded to SERIALIZABLE, so concurrency problems are gone." Why it's wrong: stronger isolation generally means *more* locking or more conflict detection, not less — SERIALIZABLE in the classic lock-based implementations takes broader locks earlier, widening collision windows (PostgreSQL's SSI variant avoids some of this by aborting on suspected-dangerous overlaps instead, but it still aborts — you just trade deadlock errors for serialization failures, which demand the same retry machinery). What actually happens: the team pays throughput for isolation and still implements retries. The fix: pick isolation for *correctness against anomalies* ([the isolation ladder](what-is-isolation-level.md)), pick lock ordering plus retries for *deadlock immunity*, and stop expecting one dial to do both jobs.

**Confusing lock wait timeouts with deadlocks when reading alerts.** Wrong assumption: "timeout error 1205 means we deadlocked again." Why it's wrong: 1205 means a waiter exceeded its patience limit — possibly just queued behind legitimate heavy traffic — while 1213/40P01 means an actual cycle was found. What actually happens: the team applies deadlock fixes (ordering, retries) to a problem that was really an unindexed query holding a lock for eight seconds, and the timeouts continue. The fix: classify first — 1213/40P01 → ordering/replay work; 1205/timeout storms → find the long lock holder via `information_schema.innodb_trx` or `pg_locks`, and shorten or index that query.

**Shipping concurrency-untested code.** Wrong assumption: green unit tests mean the flow is safe. Why it's wrong: unit tests run one transaction at a time; a deadlock physically cannot occur in a world with a single actor. What actually happens: the feature passes CI, deploys, and produces its first deadlock three weeks later at 10x traffic, in code nobody remembers writing. The fix: for any endpoint touching multiple rows under real contention, add a two-connection interleaving test that asserts the error is caught and retried — it's twenty lines and it converts a production incident into a known behavior.

## 7. Compare With Related Concepts

**Deadlock vs lock contention (blocking).** Contention is normal life: transactions queue for a popular row, the holder finishes, the queue drains — slow, but always progressing. Deadlock is the pathological case where the queue loops on itself and progress is mathematically impossible without intervention. Same ingredient (waiting for row locks), different topology (chain vs cycle). One-line rule: contention costs latency, deadlock costs rollbacks — and if waits never self-resolve, draw the waits-for graph and look for the cycle.

**Deadlock vs lock wait timeout.** Both end with a rolled-back-or-failed transaction and an angry log line, but the mechanisms differ: detection found a genuine cycle (fast, precise, error 40P01/1213); the timeout gave up after N seconds of waiting regardless of cause (slow, blunt, error 1205 in InnoDB terms). One-line rule: treat 40P01/1213 as "replay me" and 1205 as "someone held a lock too long — go find out who."

**Pessimistic locking vs optimistic locking.** Pessimistic (`SELECT ... FOR UPDATE`) takes the row lock upfront, guaranteeing exclusive access at the cost of queuing — and queuing is the raw material deadlocks are made of. Optimistic (read freely, compare a version column at update) holds no locks while thinking, so it cannot deadlock; its conflicts surface as a failed conditional update that you retry — trading lock waits for occasional wasted work ([full comparison](what-is-optimistic-locking.md), and the pessimistic counterpart [here](what-is-pessimistic-locking.md)). One-line rule: hot, genuinely contested rows with short critical sections → pessimistic with strict lock ordering; mostly-uncontended rows where retries are cheap → optimistic, and enjoy the fact that deadlocks just left your vocabulary.

## 8. 🧠 The Memory Hook

A deadlock is two transactions each holding the cable the other one needs — nobody's greedy, nobody's slow, but the *circle* makes forever out of waiting. Detect it (walk the waits-for graph, roll back the cheapest victim, retry the whole transaction) or starve it (always grab locks in the same sorted order, and a circle can never form).
