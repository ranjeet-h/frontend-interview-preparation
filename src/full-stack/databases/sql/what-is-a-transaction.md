# What Is a Transaction?

## 1. The Real-World Problem — When You Actually Hit This

It's 11:42 on a Tuesday night. Your payments app has been running quietly for months. Then reconciliation flags something impossible: the total money across all accounts dropped by ₹15,000 today, and no customer complained about a failed payment.

You dig into the logs and find one request from 3:14 PM. A user transferred ₹15,000. Your code did two things: subtract ₹15,000 from their account, then add ₹15,000 to the recipient's account. Between those two updates, the server's process got killed during a deploy. The first update was already permanently saved. The second never ran. Fifteen thousand rupees stopped existing. Not stolen — gone. There is no row anywhere that says where it went, because the operation that would have recorded it never happened.

Here's the uncomfortable part: every individual statement worked correctly. The debit was a perfectly valid UPDATE. The crash was nobody's bug. The problem was that you told the database "save this change forever now" when you actually meant "save these two changes together or neither." That unit-of-work guarantee is exactly what a transaction gives you — and until you've lost real money to its absence, it sounds like an academic nicety.

## 2. The Analogy — Make the Mechanic Obvious

Picture an old-school bank counter with one rule: nothing gets written into the official ledger until the teller has finished the entire job.

When you ask the teller to move money between two accounts, she doesn't touch the ledger right away. She picks up a scratch slip and writes both entries on it — the debit here, the credit there. While she's working, other tellers walking past can still read the ledger, and they see the old numbers, because her slip isn't part of the ledger yet. Her half-finished work is invisible to everyone else.

If she finishes and everything checks out, she copies the whole slip into the official ledger in one go and stamps it. From that instant, every teller sees both new balances, and there is no in-between moment where one was updated and the other wasn't. If anything goes wrong mid-job — insufficient funds, a smudged figure, a suspicious signature — she crumples the slip, throws it away, and the ledger is exactly as it was before she started. Zero cleanup needed, because she never wrote to the real thing.

Now map every piece:

- The scratch slip is the transaction's private staging area — the changes exist for her but aren't visible or permanent.
- Copying to the ledger with a stamp is COMMIT — the moment all staged changes become visible and permanent together.
- Crumpling the slip is ROLLBACK — discard everything, as if the work never started.
- Her little tick marks after each section of the slip ("fee calculated, verified") are SAVEPOINTs — places she can back up to without throwing away the whole job.
- One-line deposits that go straight into the ledger, no slip, are AUTOCOMMIT — simple single statements that become permanent immediately.
- Other tellers being unable to see her slip while she works is ISOLATION — concurrent work doesn't leak into each other.
- Hogging the counter and the shared pen while she does a twenty-minute job is LOCK RETENTION — everyone behind her waits, and the longer she takes, the worse the queue gets.
- The manager who shreds old slips nightly but must keep any slip a still-open job might need — that's why long transactions cause bloat, which we'll get to.

Once you hold this picture, the technical vocabulary below is just naming parts of the slip you've already understood.

## 3. The Full Explanation — How It Actually Works

A transaction is a way of telling the database: "treat the next several operations as one single unit of work. Either every one of them becomes permanent, or none of them do." That all-or-nothing promise is called atomicity, and it's the A in ACID ([the full ACID breakdown lives on its own page](what-are-acid-properties.md)). Alongside atomicity you get durability (once committed, it survives a crash) and isolation behavior (how much of other people's unfinished work you can see), which we'll separate out shortly.

**The three commands.** `BEGIN` starts the staging area. Every statement after it writes privately — new row versions, changed pages — but readers elsewhere see none of it. `COMMIT` is the stamp: the engine flushes the changes so they're permanent and visible atomically. Under the hood most engines do this with a write-ahead log — they first record "these changes happened" sequentially on disk, so even if power dies a millisecond later, recovery can replay that log and your commit survives. `ROLLBACK` is the crumpled slip: the engine discards the private changes, and the data looks like you never began.

**Autocommit — the mode you're in without knowing.** If you run an UPDATE without a BEGIN around it, the database doesn't leave the change dangling. It wraps that single statement in its own tiny transaction and commits it instantly. That default is called autocommit mode, and it explains demo 4 below: the debit committed itself the moment it finished, so when the process died before the second update, there was nothing to undo. Autocommit means *every statement is safe individually and unsafe collectively*. Any multi-step invariant — transfer, booking, inventory decrement — must be wrapped explicitly.

**Scope follows the connection, not your code.** This trips up almost everyone eventually: BEGIN/COMMIT is state on the database session, not braces in your programming language. Everything executed on that same connection between BEGIN and COMMIT is inside the transaction — regardless of functions, loops, or files the calls live in. Conversely, two different connections (say, two connections grabbed from a pool inside your request handler) are two independent sessions: wrapping "connection A's update and connection B's update" between BEGIN and COMMIT on A does absolutely nothing for B. One logical transaction = one connection, start to finish. This is also why [connection pooling](what-is-connection-pooling.md) matters here: forgetting to release a connection mid-transaction leaks an open transaction, not just a socket.

**Savepoints — partial undo inside a bigger unit.** Sometimes a multi-step job has optional or retryable steps. You're mid-transaction, you try something speculative, and you want to undo just that attempt while keeping everything before it. `SAVEPOINT name` marks a position; `ROLLBACK TO name` undoes everything since that mark but keeps the transaction open and everything before it intact. The outer transaction can still commit normally afterward. It's the difference between "erase the last section of my slip" and "crumple the whole slip." Typical use: trying several candidate rows in one batch and discarding individual failures instead of restarting the entire batch.

**Isolation — how invisible your slip really is.** Atomicity guarantees all-or-nothing at commit time. It does NOT automatically guarantee that other transactions can't see weird intermediate states while you work. How much they can see is decided by the isolation level — READ UNCOMMITTED, READ COMMITTED, REPEATABLE READ, SERIALIZABLE — which controls whether dirty reads, non-repeatable reads, and phantom reads are possible. The interplay is worth stating precisely: the transaction is the *boundary*, the isolation level is the *visibility rule inside that boundary*. Default levels differ by database — PostgreSQL defaults to READ COMMITTED, MySQL/InnoDB to REPEATABLE READ — so the same code can behave differently depending on the engine. The deep dive belongs to [the isolation level page](what-is-isolation-level.md); for this page, remember that saying "it's in a transaction" is not the same as saying "concurrency can't affect it."

**Locks — the price of working privately.** To keep your private changes consistent, the engine holds locks (row locks, gap locks, table locks depending on engine and statements) on the data you've touched, and it releases them only at COMMIT or ROLLBACK — never earlier, never lazily. That's the teller hogging the pen. A transaction that touches ten rows for three milliseconds is harmless. A transaction that holds row locks open for eight seconds while waiting on some slow subsystem turns every competing writer into a queue, and given the wrong interleaving, into [a deadlock](how-do-you-prevent-deadlocks.md).

**Long transactions — the quiet infrastructure killer.** Beyond lock retention, long-running transactions hurt in ways that show up hours later:

- In PostgreSQL, deleted and updated rows stay as dead tuples until vacuuming can prove no transaction might still need them. An hour-long open transaction forces vacuum to defer cleanup across the whole table for that entire hour. Tables bloat, queries get slower, and in extreme cases the oldest open transaction holds back the row-version horizon so badly that you approach transaction-ID wraparound warnings. Similarly, WAL segments that a long transaction still needs can't be recycled or removed, so disk fills with write-ahead logs.
- In any engine, a connection left "idle in transaction" — someone opened BEGIN and then went off to call a third-party API — is holding locks AND a pooled connection doing nothing. A handful of those and the pool is exhausted; every other request queues behind transactions that are making zero progress.
- Replication lag compounds it: replicas generally replay commits in order, so one giant uncommitted transaction delays visibility of everything queued behind it.

The operational rule that falls out: transactions should be short, touch few rows, and contain no human-scale waits. No HTTP calls, no email sending, no waiting on user input inside a transaction.

**When one database isn't enough — sagas.** What if the workflow spans services — debit wallet service, then create order in the orders service, then notify? You cannot wrap all of that in one database transaction; the databases belong to different services, and forcing coordination across them (classic two-phase commit) makes availability terrible: one slow participant blocks everyone. The standard pattern is a saga: split the workflow into a sequence of local transactions, each committing independently, plus compensating actions that semantically undo earlier steps when a later step fails ("refund the wallet because order creation failed"). Note the honest trade-off: a saga gives you eventual consistency and requires idempotent, reversible steps — it's more code and a weaker guarantee than a true transaction, which is exactly why you keep true transactions within one service boundary wherever possible.

## 4. See It In Practice — Real Code or Queries

These demos run verbatim against SQLite (`sqlite3 :memory:`). The transaction mechanics shown here — BEGIN/COMMIT/ROLLBACK, savepoints, autocommit — behave the same in PostgreSQL and MySQL unless flagged otherwise.

**A clean transfer — the whole point of transactions:**

```sql
CREATE TABLE accounts (
  id      TEXT PRIMARY KEY,
  balance INTEGER NOT NULL CHECK (balance >= 0)
);
INSERT INTO accounts VALUES ('alice', 500), ('bob', 200);

BEGIN;

UPDATE accounts SET balance = balance - 150 WHERE id = 'alice';
UPDATE accounts SET balance = balance + 150 WHERE id = 'bob';

COMMIT;

SELECT 'after commit' AS state, id, balance FROM accounts;
-- after commit | alice | 350
-- after commit | bob   | 350
```

Both updates became permanent together. At no observable moment did alice have 350 while bob still had 200.

**Rollback — the crash-proof undo.** Suppose we started moving ₹1,000 and realized mid-flight that alice doesn't have it:

```sql
BEGIN;

UPDATE accounts SET balance = balance - 500 WHERE id = 'alice'; -- oops, wrong amount

SELECT 'mid-transaction' AS state, id, balance FROM accounts;
-- shows alice at 0 ON THIS CONNECTION — our own private view

ROLLBACK;  -- crumple the slip

SELECT 'after rollback' AS state, id, balance FROM accounts;
-- after rollback | alice | 500
-- after rollback | bob   | 200
```

Note what ROLLBACK costs you: nothing. No compensating UPDATE, no restoring from backup. The engine simply discards work that was never made public.

**Savepoint — surgical undo inside a bigger job:**

```sql
BEGIN;
UPDATE accounts SET balance = balance + 150 WHERE id = 'bob';   -- keep this part

SAVEPOINT fee_step;

UPDATE accounts SET balance = balance + 25 WHERE id = 'bob';    -- wrong fee amount

ROLLBACK TO fee_step;                                           -- erase ONLY the fee line

UPDATE accounts SET balance = balance + 5 WHERE id = 'bob';     -- correct fee

COMMIT;
SELECT id, balance FROM accounts;
-- alice | 500   (untouched)
-- bob   | 355   (150 + 5, the 25 vanished with the savepoint rollback)
```

**Autocommit — how the ₹15,000 disappears:**

```sql
UPDATE accounts SET balance = balance - 150 WHERE id = 'alice';
-- no BEGIN anywhere: this committed itself the instant it finished.
-- process crashes here → bob never credited, and there is nothing to roll back.
SELECT id, balance FROM accounts;
-- alice | 350 | bob | 200   ← ₹150 has ceased to exist
```

**The production shape — Node.js with node-postgres.** This is the skeleton every money-moving endpoint should have:

```js
// One transaction = ONE checked-out client, start to finish.
const client = await pool.connect();
try {
  await client.query('BEGIN');

  const debit = await client.query(
    'UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING balance',
    [amount, senderId],
  );
  // The RETURNING + balance check replaces a separate SELECT:
  // if the debit matched zero rows, funds were insufficient — abort now.
  if (debit.rowCount === 0) throw new Error('insufficient_funds');

  await client.query(
    'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
    [amount, receiverId],
  );

  await client.query('COMMIT');   // stamp the ledger — both rows, atomically
} catch (err) {
  await client.query('ROLLBACK'); // discard everything since BEGIN
  throw err;
} finally {
  client.release();               // ALWAYS return the client — even after errors,
}                                 // otherwise the pool leaks an idle-in-transaction connection
```

Two dialect notes worth naming in an interview: in PostgreSQL with psycopg2 or SQLAlchemy Core, a transaction starts implicitly on the first statement and **nothing persists until you call `commit()`** — forget it and every change silently vanishes when the connection closes, with no error. And in MySQL, DDL statements (`ALTER TABLE`, `TRUNCATE`) cause an implicit commit of everything before them, so mixing schema changes into a data migration silently breaks your transaction boundary.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a transaction?**

A grouping mechanism the database offers: you mark a sequence of operations with BEGIN, and the database promises to treat them as one indivisible unit — either all of them become permanent and visible together (COMMIT), or none of them ever happened (ROLLBACK). The best answers don't stop at the definition; they anchor it in the failure it prevents: without it, a transfer that crashes between its debit and credit leaves money destroyed, because autocommit made each statement permanent independently. A transaction exists so multi-step invariants ("money moves, it doesn't vanish") survive crashes, errors, and concurrency.

**Q: Why does it matter in backend/full-stack systems?**

Because nearly every meaningful backend operation is multi-step. Checkout decrements inventory, creates an order, and charges payment — if any step fails, the others must not linger as half-state. Without transactions you build correctness yourself: audit tables, cleanup jobs, "orphaned orders" dashboards. With them, you push that burden into the engine, which implements it with write-ahead logging and crash recovery that has been battle-tested for decades. It also defines your consistency boundary in APIs: a client either sees the pre-transfer world or the post-transfer world, never the middle.

**Q: What do BEGIN, COMMIT, and ROLLBACK actually do internally?**

BEGIN opens a private workspace: subsequent changes are recorded (in the write-ahead log and buffer pages) but marked uncommitted, so other sessions' snapshots exclude them. COMMIT does the durability flip: the engine ensures the log records for this transaction are flushed to stable storage, then publishes the changes — readers from that instant see all of them, and a crash right after commit loses nothing because recovery replays the log. ROLLBACK discards the private changes using the log's undo information or by dropping uncommitted versions, returning data to its pre-BEGIN state. Crucially, locks acquired along the way are held until whichever of the two endings occurs.

**Q: What is autocommit mode?**

The default behavior where every standalone statement is wrapped in its own implicit transaction and committed the moment it completes. It's convenient for one-statement writes and dangerous for multi-step logic, because each step becomes permanent immediately — there is no group to roll back. Most drivers let you disable it (psycopg2 effectively runs with autocommit off and requires explicit `commit()`; node-postgres leaves autocommit on until you issue BEGIN). Knowing which mode your driver uses is genuinely interview-worthy, because it determines whether a forgotten commit silently discards data or prematurely saves it.

**Q: What are savepoints and when would you use them?**

Named markers inside an open transaction that allow partial rollback. `ROLLBACK TO sp` undoes only work performed after the marker, keeping the transaction alive and earlier work staged. Use them when a transaction contains retryable or speculative sub-steps: processing a batch of inserts where individual failures shouldn't kill the batch, or attempting an optional enrichment whose failure shouldn't abort the core operation. They reduce the cost of failure inside long logical jobs without sacrificing the single-commit guarantee.

**Q: Does transaction scope follow my function's braces?**

No — it follows the connection. BEGIN through COMMIT is session state on the database side. All statements issued on that one connection in that window are inside the transaction, no matter how your code is organized. Two different pooled connections cannot share a transaction, so code that grabs a client per query breaks atomicity even if a BEGIN was sent somewhere. The discipline: check out one connection (or use your ORM's session/unit-of-work, which enforces this), run all statements of the logical unit through it, commit or roll back, then return it to the pool.

**Q: How do isolation levels interact with transactions?**

The transaction draws the boundary; the isolation level sets the visibility rules inside it. At READ COMMITTED (PostgreSQL's default) each statement sees the latest committed data, so another transaction's commit between your two reads is visible — a non-repeatable read. At REPEATABLE READ (MySQL's default) your snapshot is fixed per transaction, so re-reads are stable but you still won't block phantoms the way SERIALIZABLE attempts to. So "we put it in a transaction" never automatically means "race conditions are solved": a lost update can still happen at READ COMMITTED unless you take a row lock (`SELECT ... FOR UPDATE`) or rely on atomic SQL like `balance = balance - 150`. Details live on [the isolation level page](what-is-isolation-level.md).

**Q: What happens if the application crashes mid-transaction?**

Nothing — by design. The connection dies, the database notices, and it rolls the incomplete transaction back as if BEGIN had been followed immediately by ROLLBACK. Uncommitted work was never published, so other sessions saw nothing to begin with. This is the payoff of the write-ahead-log design: crash recovery replays committed transactions and discards uncommitted ones, which is why "the process was OOM-killed" is never an excuse for half-applied financial state. The corollary trap: if your app crashed AFTER commit but before responding to the user, the transfer succeeded even though the user saw an error — which is why payment flows need idempotency keys on top of transactions.

**Q: Why are long transactions dangerous, and what would you monitor?**

Three escalating problems. First, locks: the engine holds every lock a transaction acquired until its end, so a five-minute transaction blocks writers for five minutes and raises deadlock odds. Second, bloat: in PostgreSQL, vacuum can't remove dead tuples that any open transaction might theoretically still read, so one forgotten session freezes cleanup for entire tables and inflates them; similarly WAL segments pile up. Third, resource starvation: an idle-in-transaction connection squats on a pooled slot while doing nothing. Monitor longest-running/open transaction duration, idle-in-transaction connection count, lock wait events, table bloat/vacuum age, and replication lag. Alert on transaction age, not just query latency — the damage comes from duration.

**Q: Should you ever make an HTTP call or send an email inside a transaction?**

Almost never. The network call's latency becomes lock-holding time for strangers, and a slow third party converts directly into pool exhaustion and blocked writers. Restructure instead: commit the database state that represents intent (e.g., status = 'pending_email'), then perform the external call afterward, driven either by the response handler or a background job that reads the committed state. If the external call fails, you handle it with retries or a compensating update — a small saga — rather than holding the database hostage. Same principle covers user confirmation dialogs and any human-paced wait: never inside.

**Q: What are nested transactions? Do databases support them?**

True nesting isn't supported — a database has one transaction state per session, and BEGIN inside a transaction is either an error or (as in SQL Server) a bookkeeping counter that doesn't create independence; the outer COMMIT decides everything. Savepoints are the sanctioned way to express "undo this inner part." ORMs often fake nesting by translating an inner "begin" into a savepoint (SQLAlchemy's `begin_nested()` does exactly this). The interview-grade answer names the mapping: nesting in application code compiles down to savepoints, and only the outermost commit makes anything durable.

**Q: When can't I use one database transaction, and what do I do instead?**

When the workflow spans services with separate storage — wallet service and order service can't share a BEGIN. Coordinating them with two-phase commit trades availability for atomicity: any participant hanging blocks all of them, so serious microservice systems avoid it. The standard replacement is a saga: each service performs a local transaction and emits an event; if a downstream step fails, previously completed steps are undone via compensating actions (refund, release reservation). That buys availability at the price of eventual consistency plus the obligation to make every step idempotent and compensable. Rule of thumb: prefer keeping the strongly-consistent core in one transaction inside one service, and reach for sagas only across boundaries you genuinely control separately.

**Q: How would you test transactional behavior?**

Test against a real database, not mocks — mocking removes the very thing under test (commit semantics, constraint interaction, lock waits). Three tiers: unit-level tests asserting rollback (force a failure after the first write and assert NO row changed); integration tests asserting atomicity and isolation (two concurrent transfers from one account must not overdraw — run them truly concurrently and assert final balance); and chaos-flavored tests (kill the connection mid-transaction, assert the database recovered to pre-BEGIN state and the pool healed). Also test the forgotten-commit class of bug deliberately in CI, because it produces no error — only missing data.

**Q: How does this affect frontend clients?**

Users experience transaction discipline as "no weird states." Because commit is atomic, the UI never polls mid-transfer and sees sender debited but recipient not credited. But the boundary creates a UX obligation: between BEGIN and COMMIT, a lock-holding transaction can make a competing request wait or fail, so frontends should expect and surface 409/timeout responses on contended resources instead of blind-retrying into a storm. And since a timeout ≠ failure (the transaction may have committed after the client gave up), frontend retry flows need idempotency keys so "retry" can't double-pay. The transaction is backend machinery; the contract it forces on clients — idempotent retries, no assumed ordering between requests — is very much full-stack.

## 6. The Traps — What Goes Wrong in Production

**Assuming every client library rolls back on error automatically.** The wrong assumption: "an exception happened mid-way, so the database cleaned up." Reality depends entirely on driver and database. With node-postgres, after an error you MUST issue ROLLBACK yourself — the transaction stays open on that connection, holding locks, until you do or the connection dies. Worse, PostgreSQL puts the session into an aborted state after an error inside a transaction: every subsequent command fails with "current transaction is aborted, commands ignored until end of transaction block," so naive catch-and-continue code turns one error into a wall of them. Fix: always pair BEGIN with try/catch-ROLLBACK-finally-release, exactly like the skeleton above. SQLite differs again — a constraint violation rolls back only the offending statement and the transaction stays usable — which proves the broader point: error-inside-transaction semantics are dialect-specific; know yours.

**Holding the transaction across an HTTP call or email send.** Wrong assumption: "the transaction is just protecting my code section, so calling Stripe inside it is fine." What actually happens: every lock you hold stays held for the full external-call duration — say 8 seconds of Stripe latency — during which every other writer touching those rows queues, deadlock probability climbs, and your pool drains toward exhaustion as requests pile up. One flaky third-party API becomes a site-wide outage. Fix: commit intent state first ('pending'), call outside, then update outcome; let a background job own the retry loop.

**Forgetting the commit with implicit-transaction drivers.** Wrong assumption: "my UPDATEs ran, the data is in." With psycopg2, SQLAlchemy Core, or Java JDBC with autocommit off, statements execute inside an implicitly opened transaction and NOTHING persists without an explicit commit. No error is raised — the changes just evaporate when the connection closes or returns to the pool. This produces the nastiest bug class in backend work: tests pass (same connection, commit at teardown sometimes hides it), production data silently missing. Fix: make commit part of the unit-of-work pattern (context managers, ORM sessions with explicit lifecycle), and write a CI test that asserts persistence across fresh connections.

**Believing the transaction alone defeats race conditions.** Wrong assumption: "BEGIN wraps it, therefore it's thread-safe." At READ COMMITTED, two concurrent withdrawals can both read balance 500 and both apply `SET balance = 400` — a lost update — with every statement technically inside its own tidy transaction. What actually protects you is the mechanism, not the wrapper: atomic in-SQL arithmetic (`balance = balance - x` with a CHECK or WHERE guard), `SELECT ... FOR UPDATE` to pin the row, optimistic version columns, or SERIALIZABLE. Fix: for any read-modify-write, name the concurrency mechanism explicitly in review; "it's in a transaction" is not a mechanism.

**Mixing DDL into data transactions on MySQL.** Wrong assumption: "my migration runs inside one transaction, so it's all-or-nothing." In MySQL, DDL statements (ALTER TABLE, TRUNCATE, CREATE INDEX historically) trigger an implicit commit — everything your transaction did before the ALTER is stamped permanently, right then. Your "atomic migration" silently became several checkpoints. Fix: separate schema changes from data backfills into distinct migrations, or use engines/dialects with transactional DDL (PostgreSQL) where that safety actually exists.

**Treating a timeout as failure and retrying blindly.** Wrong assumption: "the request timed out, so nothing happened." The transaction may have committed milliseconds after the client gave up. Retrying the same transfer then debits twice. The transaction guaranteed atomicity; it never promised the client knows the outcome. Fix: idempotency keys on any mutating endpoint, so a repeated attempt with the same key returns the original result instead of repeating the work.

## 7. Compare With Related Concepts

**Transaction vs isolation level.** The transaction is the container — the all-or-nothing boundary around a group of statements. The isolation level is a property of how that container interacts with other concurrent containers — which of their committed/uncommitted states you may observe mid-flight. People say "wrap it in a transaction" as if that solves races; the isolation level and locking strategy decide that. One-line rule: the transaction guarantees your unit succeeds or vanishes as a whole; the isolation level governs what weirdness from neighbors can appear inside it.

**Transaction vs locking (pessimistic or optimistic).** Locking is a mechanism transactions (and sometimes raw workflows) use; the transaction is the scope within which locks live. Pessimistic locking (`SELECT ... FOR UPDATE`) reserves rows inside your transaction so competitors wait; optimistic locking skips reservations and validates at write time via a version column, typically outside or lightly inside transactions. Locks are released when the transaction ends, which is why lock-heavy designs demand short transactions. One-line rule: reach for pessimistic locks inside short transactions when contention is hot and correctness demands serialization; use optimistic versions when conflicts are rare and you'd rather retry than queue.

**Transaction vs idempotency.** Atomicity is about internal completeness — did all steps land as one. Idempotency is about repetition safety — does running the same operation twice produce the same result as once. A perfect transaction does nothing for the client who times out and retries: the first attempt committed cleanly, and the retry will commit again. That's why payment APIs issue idempotency keys and why sagas require idempotent steps. One-line rule: transactions protect against partial failure inside the database; idempotency protects against duplicate execution across the network — real systems need both.

## 8. 🧠 The Memory Hook

A transaction is the bank teller's scratch slip: scribble everything privately, stamp the ledger once, or crumple the slip and walk away as if nothing happened — and while that slip is in your hand, you're the only one who can see it, you're hogging the pen, and the manager can't shred anything until you're done. Keep slips short; never leave one open while you go make a phone call.
