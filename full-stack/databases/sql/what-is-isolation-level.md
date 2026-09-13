# What is an isolation level

## 1. The Real-World Problem — When You Actually Hit This

A wallet platform runs a nightly reconciliation job. The job picks an account, reads the balance, sends the account through a fraud-scoring API that takes a couple of seconds, then reads the balance again and compares. If the two numbers differ, it files a "ledger mismatch" ticket for the finance team to investigate.

For months this worked fine. Then a referral campaign tripled payout volume, and the finance team started drowning in mismatch tickets. Two weeks of panic followed — people suspected data corruption, then a hacker. The truth was dumber and more instructive. The payout pipeline debited the source account in one statement and credited the destination in another *outside any transaction*, so for a few hundred milliseconds every reader saw a transfer that was half-done: money had left one account and not yet arrived anywhere. And here's the part that matters for this page — even after someone wrapped the payout in a proper transaction, tickets kept coming at a lower rate. Because now the transfers were committing *between* the job's two reads. The transfers were complete and legal; the world just changed while the job stood in the middle of its own work.

That second wave is the moment the team learned what an isolation level actually is. It's not vocabulary. It's the answer to a question nobody on that team had consciously asked: **while my transaction runs, how much is the rest of the database allowed to move under my feet?** If you never ask that question, the database's default answers it for you — and the default was chosen for generic web traffic, not for your reconciliation job.

## 2. The Analogy — Make the Mechanic Obvious

Picture yourself as an auditor walking the third floor of a hotel with a checklist: inspect every room, note its state. Your walk is your transaction. The rooms are rows. The cleaning crew working room by room is other transactions writing.

Every isolation level is a different set of house rules about what can happen around you during your walk.

At the loosest setting — READ UNCOMMITTED — you inspect rooms while cleaners are still inside mid-job. You note "TV broken" in room 305 when the cleaner was actually replacing that TV at that exact moment. You wrote down a fact about unfinished work that might get finished differently or undone entirely. That's a dirty read: you observed someone's half-done work as if it were final.

At READ COMMITTED, the rule becomes: you may only enter rooms where the cleaner has finished and left. Everything you see is settled. But nothing stops the crew from re-cleaning room 305 after you've checked it and moved on. If your checklist brings you back to 305 later, it may look completely different the second time. Both observations were true; neither was stable. That's a non-repeatable read.

REPEATABLE READ changes the mechanics: the moment you start your walk, the hotel hands you a stamped copy of every room's state, and re-checking any room shows your stamped copy — re-cleanings don't touch it. One leak remains: if the hotel builds a brand-new room on floor three halfway through your walk, your stamped list doesn't include it. You counted eleven rooms; now there are twelve. A row appeared inside a range you thought you knew. That's a phantom read. (InnoDB goes one step further: for certain locking reads it also tapes off the empty spaces along the corridor where a new room could appear, so nothing can be built into your range until your audit ends. Those tapes are gap locks.)

SERIALIZABLE closes the entire floor until your walk finishes. Nobody checks in, nobody cleans, nobody builds. Your result is guaranteed correct because you effectively had the hotel to yourself — the database pretends all transactions lined up and ran one at a time. Perfectly accurate, and expensive: the whole point of concurrency was having many guests at once.

Modern engines add one beautiful trick the old lock-based hotels didn't have. Instead of physically freezing anything, they photograph every room the instant you start walking and hand you the album. Cleaners keep working freely behind you; you're looking at pictures, not live rooms. That album is MVCC — multi-version concurrency control — and it's why PostgreSQL readers never block writers and writers never block readers.

## 3. The Full Explanation — How It Actually Works

Strip away the jargon and a transaction is you doing several steps of work while quietly assuming the rest of the database holds still. It doesn't hold still — dozens of connections are committing constantly. An isolation level is the contract saying which kinds of interference you've agreed to tolerate and which the engine promises to prevent.

There are exactly three classic ways the ground moves under a reader, and the industry named them decades ago so we can talk about them precisely.

A dirty read means you saw another transaction's uncommitted change and that change later rolled back — you made decisions about data that retroactively never existed. Deep dive: [what is a dirty read](what-is-dirty-read.md).

A non-repeatable read means you read the same row twice inside one transaction and got different values, because another transaction updated it and committed between your reads. Nothing you saw was false — both values really existed — but your facts weren't stable across your own transaction. Full treatment: [what is a non-repeatable read](what-is-non-repeatable-read.md).

A phantom read means you ran the same range query twice — "all pending orders" — and got a different *set* of rows back, because another transaction inserted or deleted matching rows in between. Individual rows kept their values; the population itself changed. See [what is a phantom read](what-is-phantom-read.md).

The SQL standard lines up four isolation levels against these three anomalies, each level banning everything below it plus one more:

| Isolation level | Dirty read | Non-repeatable read | Phantom read |
|---|---|---|---|
| READ UNCOMMITTED | possible | possible | possible |
| READ COMMITTED | prevented | possible | possible |
| REPEATABLE READ | prevented | prevented | permitted by the standard* |
| SERIALIZABLE | prevented | prevented | prevented |

\* The standard permits phantoms at REPEATABLE READ. Real engines are stricter than their own labels, and that gap between label and behavior is where most interview questions live.

Now the part most candidates miss: the standard only defines a menu. Each engine implements that menu differently, and the differences change what code you can safely write. Here is the honest map of the engines you'll be asked about.

PostgreSQL defaults to **READ COMMITTED**, implemented with MVCC. Every UPDATE creates a new row version rather than overwriting in place, and each *statement* gets a snapshot of committed data as of the moment that statement started. Within one query you see perfectly consistent data; but two queries in the same transaction can disagree, because each gets a fresh snapshot — the non-repeatable read is alive at the default. Bump to **REPEATABLE READ** and Postgres takes the snapshot once, at your first statement, and holds it for the whole transaction. That's stronger than the standard's RR: plain SELECTs stop seeing phantoms too, because new rows simply aren't in your frozen snapshot. What Postgres RR will not do is silently let you write over a changed world — if another transaction commits an update to a row after your snapshot began and you then try to modify that same row, Postgres aborts you with `could not serialize access due to concurrent update` (SQLSTATE 40001). At **SERIALIZABLE**, Postgres runs Serializable Snapshot Isolation (SSI): transactions proceed optimistically, the engine watches for dangerous overlap patterns, and aborts anyone whose result could have been wrong — again SQLSTATE 40001. So SERIALIZABLE is only usable if your application retries aborted transactions. One quirk worth saying out loud in interviews: Postgres accepts `ISOLATION LEVEL READ UNCOMMITTED` without complaint but silently runs READ COMMITTED — a dirty read is architecturally impossible in Postgres because uncommitted versions aren't in anyone's snapshot.

MySQL with InnoDB defaults to **REPEATABLE READ**, and it behaves differently from Postgres RR in ways that matter. Plain SELECTs are snapshot ("consistent") reads: the first read establishes the snapshot and later plain SELECTs keep seeing it — no non-repeatable reads, no phantoms visible through snapshots. But InnoDB distinguishes those from locking reads — `SELECT ... FOR UPDATE` / `FOR SHARE` — and from writes, which are "current" reads that see the latest committed data, not your snapshot. To keep phantoms out of those current reads, InnoDB uses next-key locks: the matched record plus the gap before it, so no qualifying row can slip into a range you're actively using. Gap locks are powerful and famously deadlock-prone — details at [MySQL gap locks](../mysql/what-is-gap-lock.md) and [MySQL isolation levels](../mysql/what-are-mysql-isolation-levels.md). Dropping InnoDB to READ COMMITTED disables most gap locking, which is a common contention fix.

SQL Server defaults to **READ COMMITTED** implemented with classic read/write locks, not snapshots. Readers take shared locks that block writers and vice versa — correctness through waiting, which costs concurrency. SQL Server offers two escape hatches: the database-level `READ_COMMITTED_SNAPSHOT` option converts READ COMMITTED to statement-level versioning (what the NOLOCK-hint crowd should use instead), and a separate SNAPSHOT isolation level gives transaction-level snapshots, aborting with a conflict error if a snapshot-era write collides with a concurrent commit. SERIALIZABLE takes key-range locks — the physical-lock version of taping off corridor gaps.

SQLite sidesteps the ladder entirely: exactly one writer at a time against the whole file. In rollback-journal mode a writer excludes readers too; in WAL mode readers get consistent snapshots while a single writer works. Either way transactions effectively execute one at a time — serializable by construction through the single-writer design. A nice interview contrast: Postgres buys concurrency with MVCC machinery; SQLite refuses parallel writers so the problem never arises.

So the ladder is universal, the implementations are not. Every step up has a price — just not always the same price. Lock-based engines pay in blocking: queries wait. MVCC engines pay in storage: old versions pile up until cleanup (Postgres vacuum, InnoDB purge), and long-running transactions keep old versions alive longer. SERIALIZABLE pays in aborted work: the engine bets conflicts are rare and makes you redo transactions when the bet fails. On modern MVCC engines stronger isolation rarely makes individual reads slower; what changes is how often your transactions collide, wait, or get thrown away.

That leads to the operational heart of this topic: serialization failures and retry loops. When Postgres aborts your transaction with SQLSTATE 40001 at SERIALIZABLE (or at RR on a write-write conflict), that is not a bug — it's the engine saying "your result might have been wrong given what others committed; run it again." The correct application response always has the same shape: catch that specific error, roll back, retry the ENTIRE transaction — fresh snapshot, fresh reads, fresh decisions, not just the failing statement — with a small cap and exponential backoff plus jitter so simultaneous losers don't regroup into the same collision. Anything non-repeatable (emails sent, third-party charges) must move after commit behind an idempotency key, because retries replay work. The same machinery handles MySQL deadlock error 1213, which is retryable too. Choose SERIALIZABLE and you have signed up for retry logic on every path that touches it.

How do you choose? Start from anomalies, not vibes. Name the corruption you cannot tolerate, then buy the cheapest ban that prevents it. Generic CRUD screens, dashboards, feeds — READ COMMITTED is fine; users accept that a refresh shows newer numbers. Flows that must see one consistent picture across multiple reads — reports, reconciliation, audit exports — want REPEATABLE READ. Money-touching read-modify-write paths need SERIALIZABLE far less often than candidates claim: a guarded atomic update (`SET balance = balance - 100 WHERE balance >= 100`) or an explicit row lock usually does the job cheaper. Reach for SERIALIZABLE when the invariant spans multiple rows and neither trick can express it — and ship retries with it.

## 4. See It In Practice — Real Code or Queries

All PostgreSQL demos run as-is in `psql` with two sessions open side by side; MySQL demos need any InnoDB table. Sessions are labeled because this topic is impossible to learn without playing both roles yourself.

Demo 1 — the non-repeatable read that created the incident (PostgreSQL, default READ COMMITTED):

```sql
-- Session A: the reconciliation job
BEGIN;
SELECT balance FROM accounts WHERE id = 42;
-- → 5000

-- Session B, meanwhile:
--   BEGIN;
--   UPDATE accounts SET balance = 4200 WHERE id = 42;
--   COMMIT;

SELECT balance FROM accounts WHERE id = 42;
-- → 4200   ← same transaction, different number. Ticket generated.
COMMIT;
```

Session B did nothing wrong — it committed fully. Session A's facts still changed mid-flight, because at READ COMMITTED every statement gets a fresh snapshot of committed data.

Demo 2 — the same script at REPEATABLE READ (PostgreSQL):

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM accounts WHERE id = 42;
-- → 5000   ← this read fixes the snapshot for the whole transaction

-- Session B commits balance = 4200 here

SELECT balance FROM accounts WHERE id = 42;
-- → 5000   ← stable. You are reading the photo album.

UPDATE accounts SET balance = balance - 300 WHERE id = 42;
-- ERROR: could not serialize access due to concurrent update (SQLSTATE 40001)
```

The last line is the lesson inside the lesson: Postgres RR keeps your reads consistent AND refuses to let you write blindly over a world that moved. Your application must handle 40001 by retrying.

Demo 3 — InnoDB's two kinds of reads (MySQL, default REPEATABLE READ):

```sql
START TRANSACTION;
SELECT COUNT(*) FROM orders WHERE status = 'pending';
-- → 11    ← first read establishes the snapshot

-- Session B inserts a new pending order and commits

SELECT COUNT(*) FROM orders WHERE status = 'pending';
-- → 11    ← snapshot read: the new order is invisible

SELECT COUNT(*) FROM orders WHERE status = 'pending' FOR UPDATE;
-- → 12    ← current read: sees latest committed data, and next-key locks
--            that range so no NEW pending order can appear until you commit
COMMIT;
```

Plain SELECTs read the past; locking reads read the present and defend the range. Mixing them up casually is how teams get counts that "don't match" between two queries in one transaction — that's InnoDB preventing phantoms exactly where it promised to.

Demo 4 — why the default doesn't protect read-modify-write, and three real fixes:

```sql
-- At READ COMMITTED, two sessions both do: read balance → subtract → write back.
-- A: SELECT balance → 1000      B: SELECT balance → 1000
-- A: UPDATE ... SET balance = 900     B: UPDATE ... SET balance = 950
-- Final balance: 950. A's debit vanished entirely. That's a lost update.

-- Fix 1: make the decision atomic — no read-then-write window at all
UPDATE accounts
SET balance = balance - 100
WHERE id = 42 AND balance >= 100;
-- 0 rows affected ⇒ insufficient funds, decided atomically

-- Fix 2: pessimistic — lock the row before deciding
BEGIN;
SELECT balance FROM accounts WHERE id = 42 FOR UPDATE; -- others block here
UPDATE accounts SET balance = balance - 100 WHERE id = 42;
COMMIT;

-- Fix 3: optimistic — detect the race with a version column
UPDATE accounts
SET balance = balance - 100, version = version + 1
WHERE id = 42 AND version = 7;
-- 0 rows affected ⇒ someone moved first ⇒ reload and retry
```

Fixes 2 and 3 are [row-level locking](what-is-row-level-locking.md) strategies in pessimistic and optimistic flavors — per-transaction tools that buy stronger behavior without raising the global isolation level.

Demo 5 — SERIALIZABLE done properly, with the retry loop (Node.js + node-postgres):

```js
async function runSerializable(pool, work, maxAttempts = 4) {
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    try {
      // Per-transaction BEGIN ... ISOLATION LEVEL: safe with connection pools
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const out = await work(client);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      // 40001 = serialization failure: not a bug, an invitation to try again.
      // Retry the WHOLE transaction — fresh snapshot, fresh decisions.
      if (err.code === "40001" && attempt < maxAttempts) {
        continue; // finally{} releases this client; the loop grabs a fresh one
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
// The same shape handles MySQL deadlock errno 1213 — also retryable.
```

Verify what level you're actually running on — production debugging needs this as often as interviews do:

```sql
SHOW transaction_isolation;          -- PostgreSQL
SELECT @@transaction_isolation;      -- MySQL
DBCC USEROPTIONS;                    -- SQL Server
PRAGMA journal_mode;                 -- sqlite → 'wal' or 'delete'
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is an isolation level, really?**

It's the contract a database offers about how much concurrent activity you'll be exposed to while your transaction runs. Every transaction implicitly assumes the rest of the database holds still; it never does. The isolation level defines which interferences get engineered away — reading uncommitted data, watching values you already read change, seeing new rows appear inside a range you queried — and which ones become your problem. Levels exist because perfect isolation (running everything one at a time) would destroy throughput, so databases sell correctness in four strengths and make you pick. The senior version of the answer names the actual decision: "choosing an isolation level means naming the anomaly that would corrupt my business logic and paying the cheapest price that forbids it."

**Q: Walk me through the four standard levels and what each prevents.**

READ UNCOMMITTED bans nothing: you can see uncommitted changes (dirty reads), watch committed values shift under you (non-repeatable reads), and watch rows appear in ranges you queried (phantom reads). READ COMMITTED adds one guarantee — everything you see has been committed — but your own transaction can still watch facts change between statements. REPEATABLE READ additionally guarantees that once you've read a value, re-reading it returns the same thing, though the classic standard still permits phantom rows in range results. SERIALIZABLE guarantees your outcome matches some world where all transactions ran strictly one after another — no anomaly survives. Then add the caveat that separates seniors from memorizers: the standard is a menu, engines implement it differently, and the differences matter more than the table.

**Q: What's the difference between a non-repeatable read and a phantom read?**

Both mean "the same query disagreed with itself inside my transaction." A non-repeatable read is about a row whose identity you know coming back with a different value, because someone updated and committed between your reads. A phantom is about the set of rows in a range result changing, because someone inserted or deleted matching rows — the original rows untouched, the population shifted. Self-test: `SELECT balance FROM accounts WHERE id = 42` returning 5000 then 4200 is non-repeatable; `SELECT COUNT(*) FROM orders WHERE status = 'pending'` returning 11 then 12 is a phantom. Value of a known row changed versus membership of a filtered result changed.

**Q: What are the defaults in the databases you've actually used?**

PostgreSQL: READ COMMITTED on MVCC — every statement sees a fresh committed snapshot, readers never block writers. MySQL InnoDB: REPEATABLE READ — plain SELECTs use a transaction-start snapshot while next-key locks protect locking reads and DML from phantoms. SQL Server: READ COMMITTED with real shared/exclusive locks — readers and writers block each other unless READ_COMMITTED_SNAPSHOT is enabled. SQLite: serializable in effect, because only one writer may touch the file at a time. Interviewers ask this not for trivia but to check whether you know that your app's correctness story is whatever your production engine actually does, not what the standard says.

**Q: Why doesn't READ COMMITTED prevent lost updates, and what do I do about it?**

Because its promise is per-statement, not per-workflow. Each individual read sees committed data — nothing protects the gap between your read and your write. Two sessions both read balance 1000, both compute, both write; the second write wins and the first debit evaporates. Fix the pattern instead of raising the global level: put the decision inside the statement (`UPDATE ... SET balance = balance - 100 WHERE balance >= 100`, check affected rows), take an explicit row lock first (`SELECT ... FOR UPDATE`), or use an optimistic version column and retry on miss. Those map to [pessimistic locking](what-is-pessimistic-locking.md) and [optimistic locking](what-is-optimistic-locking.md).

**Q: Is REPEATABLE READ the same thing in PostgreSQL and MySQL?**

No, and this question exists to catch people who learned one engine. Both give you a stable transaction snapshot for plain reads. But Postgres RR is snapshot isolation: if you try to update a row that someone else changed after your snapshot began, Postgres aborts you with SQLSTATE 40001 — conflicts surface as errors demanding retries. InnoDB RR never aborts like that; instead its writes and locking reads operate on latest data guarded by next-key locks, which prevent phantoms on those paths at the cost of deadlock-prone gap locks (two transactions can hold gap locks on the same gap, then deadlock inserting into it). Same label on the menu, completely different kitchen. The safe interview answer: "REPEATABLE READ is where engines disagree most; name the engine before making claims."

**Q: What happens at SERIALIZABLE, and what must my application do differently?**

At SERIALIZABLE the engine guarantees your committed outcome is equivalent to some serial execution — no interleaving could have produced something different. Postgres implements it as Serializable Snapshot Isolation: transactions run optimistically against snapshots, the engine tracks dangerous read-write overlap patterns, and aborts suspect transactions before commit with SQLSTATE 40001 ("could not serialize access"). Lock-based engines approximate it with broad key-range locks that cause waiting instead. Either way the application contract changes: serialization failures are normal operation, so every SERIALIZABLE path needs a retry loop wrapping the entire transaction, with backoff, jitter, and a retry cap. Side effects like emails or third-party charges move outside the transaction behind idempotency keys, since retries replay work. If you can't ship retries, you can't ship SERIALIZABLE.

**Q: How does MVCC relate to isolation levels?**

MVCC is the machinery; isolation levels are what the machinery is configured to expose. Multi-version concurrency control keeps old row versions around so readers can see data as of some point in time without blocking writers, who create new versions instead of overwriting. Which versions a reader sees defines its isolation: Postgres READ COMMITTED picks a fresh "as of statement start" snapshot per query; REPEATABLE READ freezes one "as of transaction start" snapshot. So MVCC delivers strong isolation almost for free in read cost — the bills arrive elsewhere, in version storage, vacuum/purge pressure, and aborted write conflicts. Engines without MVCC (SQL Server's default mode) deliver isolation with shared locks instead: simpler model, worse concurrency, because readers physically wait for writers.

**Q: Where do I set isolation levels, and what breaks in production?**

Three scopes exist: global/server default, session, and per-transaction. The production landmine is the session scope combined with [connection pooling](what-is-connection-pooling.md): `SET SESSION CHARACTERISTICS ...` on Postgres or `SET SESSION TRANSACTION ISOLATION LEVEL` on MySQL modifies the connection, and pooled connections are recycled — your setting now leaks into unrelated requests that borrow that connection later. The safe patterns: set the level per transaction (`BEGIN ISOLATION LEVEL SERIALIZABLE`, or `SET LOCAL` inside the transaction on Postgres), or reset it explicitly when releasing. JDBC's `Connection.setTransactionIsolation` has the same trap — it applies to the connection object the pool hands you. Rule: treat isolation like any other connection state — scope it to the work that needs it, never assume a clean slate from the pool.

**Q: How would you pick a level for a real service?**

Start by listing the flows whose correctness depends on multi-read consistency or race-free writes. Dashboards and CRUD screens: leave READ COMMITTED — a refresh showing newer numbers is fine. Reconciliation, reporting, audit exports: REPEATABLE READ so one run sees one world. Money and inventory hot paths: usually an atomic guarded update or explicit row lock beats raising the level globally. Genuinely multi-row invariants that neither trick expresses: SERIALIZABLE on just those transactions, with retries shipped and tested under load. Then verify behaviorally — write tests that fire real concurrent operations, because isolation bugs reproduce roughly zero percent of the time in sequential test suites.

## 6. The Traps — What Goes Wrong in Production

Trap 1: "REPEATABLE READ means the same thing everywhere." The wrong assumption: the SQL standard defines the level, so Postgres RR and MySQL RR behave identically. Why it's wrong: the standard defines a minimum contract, and both engines exceed it in opposite directions — Postgres RR is snapshot isolation that *aborts* conflicting writes with 40001; InnoDB RR uses snapshot reads plus next-key gap locks that never abort but deadlock over empty gaps instead. What actually happens: an engineer migrates a service from MySQL to Postgres (or documents one while working on the other), keeps code written for InnoDB semantics, and starts seeing serialization errors in production paths that previously deadlocked or silently succeeded. The fix: whenever you say "at REPEATABLE READ this happens," attach the engine name to the sentence. Anomaly claims are always engine-plus-level claims, never SQL-in-general claims.

Trap 2: "I set the isolation level once at startup, done." The wrong assumption: isolation is application configuration like a feature flag. Why it's wrong: on most drivers it's connection state, and production apps get connections from pools that recycle them across thousands of unrelated requests. What actually happens: one admin job sets its connection to SERIALIZABLE and releases it back; the next borrower inherits serializable behavior it was never designed for — mystery 40001 errors appear in endpoints that have nothing to do with that job, hours later. The fix: scope isolation per transaction (`BEGIN ISOLATION LEVEL ...` / `SET LOCAL`) or reset it on release, and add an assertion in staging that logs `transaction_isolation` for unexpected levels.

Trap 3: "The default protects my read-then-write logic." The wrong assumption: being at a sane default (READ COMMITTED) means concurrent read-modify-write sequences are safe. Why it's wrong: the default only guarantees each statement sees committed data — the window between your read and your write is unprotected, so two interleaved workflows lose updates silently. What actually happens: exactly Demo 4 — two support agents adjust the same balance, the second write erases the first, no error anywhere, and the audit trail shows both operations succeeding. Lost updates are the most expensive silent bug in this whole topic because nothing fails; money just disappears. The fix: atomic guarded updates, `SELECT ... FOR UPDATE`, or optimistic version columns on every read-modify-write path — decide per path, don't raise the global level.

Trap 4: "Let's turn on SERIALIZABLE everywhere to be safe." The wrong assumption: maximum correctness is free if the database offers it. Why it's wrong: SERIALIZABLE converts concurrency conflicts into aborted transactions, so throughput now depends on your conflict rate — under load, large fractions of work get thrown away and redone. What actually happens: latency spikes, error rates jump with SQLSTATE 40001, and any side effects inside those transactions (emails, charges) replay on retry unless they were moved out. Teams then roll the level back globally in a panic. The fix: escalate deliberately, only on flows whose invariants demand it, with the retry loop shipped first and load-tested before the flag flips.

Trap 5: "We tested it sequentially and it passed." The wrong assumption: correctness verified by normal test suites carries over to production. Why it's wrong: anomalies are timing-dependent interleavings; sequential tests execute exactly the one schedule where nothing can collide. What actually happens: the reconciliation bug pattern, the lost update, the phantom count — all invisible in CI, all appearing within days of real traffic. The fix: write tests that create genuine concurrency — fire N parallel workers against the same rows/ranges and assert the invariant holds — and run them against the same engine and isolation level as production, not H2/SQLite stand-ins.

## 7. Compare With Related Concepts

Isolation levels versus consistency models. These get conflated because both are about "seeing correct data," but they operate at different layers. Isolation levels govern how concurrent transactions interleave inside one database node — what a transaction may notice about others' activity. Consistency models (linearizability, eventual consistency, read-your-owns) govern visibility and recency guarantees across distributed components — replicas, caches, multiple regions. A perfectly SERIALIZABLE primary with lagging read replicas still serves stale data to users routed there. Rule: pick the isolation level for intra-database transactional correctness; pick replication and caching strategy for cross-node freshness — neither substitutes for the other.

Isolation versus atomicity (its ACID sibling). Atomicity is about crashing alone: one transaction's steps succeed or vanish as a unit — the incident at the top had this problem when debits and credits ran as separate statements. Isolation is about coexisting: many healthy transactions must not corrupt each other through interleaving. Quick diagnostic: if the bug reproduces with one request plus a killed process mid-flight, suspect atomicity; if it takes two simultaneous requests, suspect isolation. Background: [what are ACID properties](what-are-acid-properties.md), built on [transactions](what-is-a-transaction.md).

The ladder versus the anomaly pages. The levels are the menu; the anomalies are the dishes each rung refuses to serve. [Dirty read](what-is-dirty-read.md) is banned cheapest and nearly universally; [non-repeatable read](what-is-non-repeatable-read.md) is banned from REPEATABLE READ up; [phantom read](what-is-phantom-read.md) is fully banned only at SERIALIZABLE — except engines cheat upward, which is why the anomaly pages carry engine tables rather than trusting the standard. Rule: learn the anomalies as behaviors, the levels as purchase decisions.

Isolation levels versus explicit locking. Raising the isolation level changes engine-wide default behavior; explicit locks (`FOR UPDATE`, version columns, advisory locks) are per-transaction tools that buy specific stronger behavior without touching anything else. Most real systems run a weak cheap default plus targeted locks on hot paths, rather than a strong expensive default. Rule: global level sets the floor for everyone; targeted locking buys ceiling behavior where the business demands it.

Stronger isolation versus deadlocks. They're related more than candidates expect: stronger isolation generally means more locking or conflict detection, which widens collision surfaces — InnoDB's phantom prevention via gap locks is the classic source of deadlocks between transactions that never touched the same row. See [what is a deadlock](what-is-deadlock.md). Postgres SSI trades deadlock errors for serialization failures, which demand the same retry machinery. Rule: isolation level chooses which anomalies can't happen; lock ordering plus retries choose whether concurrency errors take down your service.

Snapshot isolation versus REPEATABLE READ. Snapshot isolation names the mechanism — reads see one fixed point-in-time version set; REPEATABLE READ names the standard's menu slot. Postgres implements its RR as snapshot isolation plus write-conflict detection; SQL Server literally has a level called SNAPSHOT; InnoDB delivers snapshot reads within RR. When an interviewer says "snapshot isolation," they're usually testing whether you know it's the implementation concept underneath the label.

## 8. 🧠 The Memory Hook

An isolation level is the hotel's answer to "what can change around the auditor during his walk?" READ COMMITTED shows you only settled rooms but lets rooms change behind you; REPEATABLE READ hands you the photo album; SERIALIZABLE closes the floor. Choose by naming the anomaly that would actually hurt your business logic — then buy the cheapest ban that prevents it, and remember: the album is MVCC, the taped-off gaps are gap locks, and the moment you hear "serialization failure," you should already be writing the retry loop.