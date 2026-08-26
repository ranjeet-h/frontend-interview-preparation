# What Are ACID Properties

## 1. The Real-World Problem — When You Actually Hit This

Your payments service has been running quietly for months. One night the app server gets OOM-killed by Kubernetes, mid-request, while moving ₹500 from account A to account B. Your code did two things: subtract 500 from A, then add 500 to B. The process died between those two lines.

The debit was already written to the database. The credit never happened. ₹500 just left the universe. Nobody's balance matches the payment gateway, the audit team spends two days reconciling, and a customer files a complaint with screenshots.

Here's the part that stings: the developer had wrapped both queries in a `try/catch`. It didn't help, because there was no error to catch. The process simply stopped existing. A `try/catch` protects you from *errors*. It does nothing when the machine dies halfway through your work.

This exact gap is why every serious relational database gives you ACID. Four promises the database makes so that "the server died mid-operation" stops being a data-loss event and becomes a non-event. And it's also why interviewers love this topic: your answer tells them whether you understand what the database is actually doing for you, or whether you think it's magic.

## 2. The Analogy — Make the Mechanic Obvious

Picture an old-school bank branch with one teller behind the counter.

You want to move money from account A to account B. The teller doesn't scribble directly into the big account books. She fills out a **transfer slip** with both lines pre-written on it: "A: −500" and "B: +500". Nothing official has happened yet — the slip is just paper on her desk.

On the wall hangs a printed **house rule**: "No account may ever go below zero." Before she stamps anything, she checks your slip against that rule.

When everything checks out, she stamps the slip and copies both entries, in ink, into the **official ledger** — a heavy sequential register kept in a fireproof cabinet. Only after the ink entry exists does she say "done" and hand you a receipt.

Later in the day, a clerk neatly transfers entries from the ledger onto the individual **account cards** customers see. That copying can lag behind — nobody cares, because the ledger is the source of truth.

Now watch how every ACID property falls out of this setup naturally:

- Filling out the slip and tearing it up on any problem is **Atomicity**: both lines happen or neither does. There is no such thing as "half a slip" filed in the ledger.
- Checking the slip against the house rule before stamping is **Consistency**: a rule that held yesterday cannot suddenly become false today because of one transaction.
- Working one slip at a time — so two customers' paperwork never bleeds into each other — is **Isolation**. Even during a busy hour, the final books look exactly as if every slip was processed alone, in some order.
- Writing ink-on-paper into the cabinet *before* saying "done", and re-copying cards from the ledger after any flood, is **Durability**: once she says "done", a fire cannot un-happen your transfer.

Every piece maps to a real mechanism, and the next section names them.

## 3. The Full Explanation — How It Actually Works

ACID stands for **Atomicity, Consistency, Isolation, Durability**. Let's take them one at a time — plain idea first, real mechanism second.

**Atomicity — all or nothing.**

A transaction is a group of statements that must succeed or fail *as one unit*. In our analogy, the slip holds both lines. In the database, you wrap the statements in `BEGIN` ... `COMMIT`. While the transaction is open, the changes exist only in a private working area — other sessions can't see them, and nothing is final. On `COMMIT`, they all become visible at once. On `ROLLBACK`, or on a crash mid-flight, the database discards every uncommitted change using its undo records — it literally knows how to reverse each half-done step.

Without atomicity, every multi-step operation becomes your problem: you'd write "undo scripts" to compensate for failures, and those scripts themselves can fail or never run (like when the process is dead). With atomicity, the crash between the two `UPDATE`s leaves account A untouched — the database rolls back on restart because the transaction never reached its commit point.

**Consistency — the rules never break.**

The house rule on the wall. The database enforces every rule you *declared*: primary keys, foreign keys, `UNIQUE`, `NOT NULL`, `CHECK`, triggers. At commit time, a transaction that would push the data into an illegal state is rejected outright.

But here's the part most people miss: the database can only enforce rules it was told about. "The total money across all accounts stays the same during a transfer" is a business invariant — the database doesn't know it unless your queries are structured to preserve it. So the "C" is a partnership: declare what the schema can express (like `CHECK (balance >= 0)`), and design the transactions so the undeclared invariants hold too. Without consistency enforcement, you get orphaned rows pointing at deleted users, negative balances, duplicate emails — silent corruption that surfaces months later in reports.

**Isolation — concurrent transactions don't trample each other.**

Hundreds of transactions run at the same time. Without protection, bad interleavings cause real damage: one session reads another's *uncommitted* data which then gets rolled back (a dirty read); a booking system reads "1 seat left" twice and sells two seats for one seat (a lost update). In our analogy, the teller processes slips so the final books match one-at-a-time processing.

Real databases rarely process transactions literally one at a time — that would waste the hardware. Instead they offer **isolation levels**, trading strictness against concurrency:

- **READ UNCOMMITTED** — you can see other transactions' unfinished work. Almost never what you want.
- **READ COMMITTED** — you only see committed data, but two reads in your own transaction can return different results if someone commits in between.
- **REPEATABLE READ** — repeated reads of the same rows give the same answer inside your transaction.
- **SERIALIZABLE** — the strongest level: the result is guaranteed equivalent to running everything one at a time, in some order.

Underneath, modern engines use **MVCC** (multi-version concurrency control): instead of locking rows for every reader, the engine keeps multiple versions of each row and hands each transaction a consistent *snapshot* to read from. Readers stop blocking writers and writers stop blocking readers — that's why busy Postgres or MySQL systems can have heavy reporting queries alongside live writes.

Dialect note, because it matters in interviews: Postgres defaults to READ COMMITTED; MySQL's InnoDB defaults to REPEATABLE READ; SQLite allows only one writer at a time, so these races mostly disappear — at the cost of write throughput. Isolation is deep enough to deserve its own study page, linked below.

**Durability — "committed" survives anything.**

In the analogy, the teller puts ink in the fireproof-cabinet ledger *before* handing you the receipt. Databases do the same trick with a **write-ahead log (WAL)**: before a changed data page is written to its home on disk, the engine appends a small record describing the change to a sequential log file and forces it to physical disk (`fsync`). Only then does it acknowledge your commit. Data pages themselves are flushed lazily in the background — that's safe, because after a crash the engine replays the log: redo every committed transaction, discard every incomplete one.

This is why a commit is slow-ish (it waits on a disk sync) but trustworthy. And it's tunable: MySQL's `innodb_flush_log_at_trx_commit=2` or Postgres' `synchronous_commit=off` skip the immediate disk sync to gain speed — buying maybe a second of throughput at the cost of losing the last moments of committed transactions in a hard crash. Fine for analytics logs; unacceptable for payments.

Put the four together and you get the actual contract: you can crash mid-write, run a thousand concurrent writers, lose power — and the database comes back with every rule intact, every committed write present, and no half-finished work anywhere.

## 4. See It In Practice — Real Code or Queries

Everything below runs on standard SQL (verified on SQLite); dialect differences are called out where they exist.

**Setup — the rules declared upfront:**

```sql
CREATE TABLE accounts (
  id      INTEGER PRIMARY KEY,
  owner   TEXT    NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0)  -- the "house rule"
);
```

**The transfer — atomicity and application-level consistency together:**

```sql
BEGIN;

-- Subtract first, guarded: this UPDATE only touches the row if funds exist,
-- so the overdraft rule is protected even before the CHECK constraint sees it.
UPDATE accounts
SET balance = balance - 500
WHERE id = 1 AND balance >= 500;

-- If the previous statement matched 0 rows (insufficient funds / no account),
-- the app must detect it and ROLLBACK — the database won't guess your intent.
UPDATE accounts
SET balance = balance + 500
WHERE id = 2;

COMMIT;
```

Two details worth noticing. First, we wrote `SET balance = balance - 500` — a relative update computed inside the database — rather than reading the balance into the app and writing back a new absolute number. The relative form cannot suffer a lost update the way the read-then-write form can. Second, the invariant "money moves, total stays equal" holds because both statements sit inside one transaction; split them and it silently stops holding.

**What a mid-transaction failure actually does — and the dialect trap:**

```sql
BEGIN;
INSERT INTO accounts (id, owner, balance) VALUES (2, 'Sneaked', 50); -- succeeds
UPDATE accounts SET balance = balance - 1500 WHERE id = 1;           -- CHECK fires!
```

Run this on SQLite and you'll see `CHECK constraint failed: balance >= 0`. Now the surprising part — query the table and the `Sneaked` row is *still there*. SQLite (and MySQL/InnoDB behave the same way) rolls back only the failing **statement**; your transaction stays open with earlier statements intact. PostgreSQL is stricter: any error poisons the whole transaction, and every subsequent command fails with "current transaction is aborted" until you issue `ROLLBACK`.

The lesson is uncomfortable but simple: **never assume a failed statement cleaned up for you**. Check for errors and roll back explicitly. If you need partial progress to survive a failure inside one transaction, that's what `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` is for.

**Killing the lost-update race — three escalating fixes:**

Two sessions both read `balance = 1000`, both compute `1000 - 500 = 500`, both write 500. One withdrawal vanished. Fixes, weakest to strongest:

```sql
-- Fix 1 (usually enough): compute in the database, guard in WHERE.
-- rowCount === 0 tells you it didn't apply.
UPDATE accounts SET balance = balance - 500 WHERE id = 1 AND balance >= 500;

-- Fix 2: pessimistic — lock the row before deciding (PostgreSQL / MySQL;
-- SQLite has no FOR UPDATE, it serializes writers anyway).
BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;
-- ...app logic decides...
UPDATE accounts SET balance = balance - 500 WHERE id = 1;
COMMIT;

-- Fix 3: optimistic — add a version column and refuse stale writes.
UPDATE accounts
SET balance = balance - 500, version = version + 1
WHERE id = 1 AND version = 7;   -- 0 rows updated? someone beat you: retry.
```

**What this looks like from application code** (Node.js with `node-postgres`; every driver has the same shape):

```js
async function transfer(client, fromId, toId, amount) {
  try {
    await client.query("BEGIN");
    // Guarded debit: 0 rows means insufficient funds or missing account.
    const res = await client.query(
      "UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND balance >= $1",
      [amount, fromId],
    );
    if (res.rowCount === 0) {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("insufficient funds"), { status: 400 });
    }
    await client.query(
      "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
      [amount, toId],
    );
    await client.query("COMMIT");
  } catch (err) {
    // If COMMIT itself threw, the tx is already doomed — a ROLLBACK here
    // just cleans up. Swallow only rollback failures, rethrow the real error.
    try { await client.query("ROLLBACK"); } catch {}
    throw err;
  }
}
```

One classic production bug hiding in plain sight: all statements must run on the **same connection**. Grabbing a new connection per query from the pool silently splits your "one transaction" into several autocommitted fragments. ORMs hide this plumbing — Sequelize wants a `transaction` object passed to every call, Prisma wraps it in `$transaction(async (tx) => ...)` — but underneath it's exactly this `BEGIN`/`COMMIT` dance.

## 5. Interview Questions — All of Them, Done Properly

**Q: What are the ACID properties? Explain each one with what breaks without it.**

They're the four guarantees a transactional database makes. Atomicity: a multi-step transaction applies completely or not at all — without it, a crash mid-transfer deletes money from one account without crediting the other. Consistency: declared rules (keys, unique, check, foreign keys) hold before and after every transaction — without it, you accumulate orphaned rows, negative balances, duplicate users. Isolation: concurrent transactions don't observe each other's intermediate states — without it, two agents selling the last ticket both see one seat available and oversell. Durability: once the database acknowledges a commit, it survives crashes and power loss — without it, "order confirmed" turns into "we lost your order" after a reboot. A strong answer walks through a concrete failure for each property, not just the acronym.

**Q: What's the difference between atomicity and consistency? They sound similar.**

Atomicity is about *how much of the transaction applies* — all steps or none. Consistency is about *what states are legal* — the data satisfies the rules. You can be perfectly atomic and still inconsistent: a single-statement `UPDATE accounts SET balance = -100` commits atomically and happily violates a business rule, unless a constraint blocks it. Conversely, constraints can't save a non-atomic pair of updates that leaves the invariant broken between them. One-line separation: atomicity is the delivery guarantee, consistency is the quality gate the result must pass.

**Q: And atomicity versus isolation?**

Atomicity covers failure; isolation covers concurrency. A solo transaction on an idle database still needs atomicity (the process could crash mid-way), but isolation problems need at least two transactions overlapping. Dirty reads, lost updates, phantom reads — those are isolation failures. Half-applied transfers — atomicity failures. Interviewers ask this because candidates recite the four words without being able to draw the boundary.

**Q: Does "consistency" in ACID mean the same thing as "consistency" in CAP theorem?**

No, and confusing them is a known red flag. ACID's C is about integrity rules: constraints and invariants hold across transactions, on a single node. CAP's C is about replication: every read on a distributed system reflects the most recent write, with no stale copies. You can have a fully ACID single-node database (trivially CAP-consistent, since there's one copy), and you can have a distributed store that is CP in CAP terms while enforcing almost no ACID-style constraints. Same word, completely different questions.

**Q: How does a database actually make a commit durable?**

Through write-ahead logging. Before any changed data page goes to its final location on disk, the engine appends a description of the change to a sequential log file and forces that file to physical storage with an fsync. Your `COMMIT` returns only after that sync succeeds. Data pages are flushed lazily by background checkpointing; if the machine dies in between, restart recovery replays the log from the last checkpoint — redoing committed work, discarding uncommitted work. Sequential log appends are cheap compared to random page writes, which is the engineering insight that makes durability affordable. Mention `innodb_flush_log_at_trx_commit` or Postgres' `synchronous_commit` and you've shown you've operated this in production, not just read about it.

**Q: A statement fails inside a multi-statement transaction. Is everything automatically rolled back?**

It depends on the database, and this is where most candidates get caught. In PostgreSQL, yes — any error aborts the whole transaction; further statements fail until you `ROLLBACK`. In MySQL and SQLite, no — the failing statement is undone, but earlier statements in the transaction remain applied and the transaction stays open. If your code ignores the error and continues, it commits partial work. The safe pattern on any engine: treat any error inside a transaction as fatal to that transaction, roll back explicitly, and retry the whole unit if appropriate. Use savepoints when you genuinely need to keep earlier work.

**Q: Walk me through choosing an isolation level for a payments system.**

Start from what corruption costs. For payments, a lost update or an oversell is money, so I want repeatable reads at minimum, with the write paths structured as guarded single-statement updates or explicit row locks (`SELECT ... FOR UPDATE`) so two concurrent debits serialize correctly. READ COMMITTED is acceptable for read-mostly screens and dashboards, accepting that numbers can shift within one page view. Full SERIALIZABLE buys provable correctness at real concurrency cost — Postgres implements it via Serializable Snapshot Isolation and will abort transactions that could have gone bad, so you need retry logic. My default: default level for general traffic, deliberate locks or serializable retried transactions for the money-touching hot path, and tests that actually run concurrent operations rather than trusting the default.

**Q: Do NoSQL databases support ACID?**

Not traditionally as a whole-store promise, but the picture has nuances. MongoDB has always been atomic per document, and since 4.0 offers real multi-document ACID transactions (replica sets; sharded clusters since 4.2) — with performance caveats. Many NoSQL stores deliberately chose the looser cousin, BASE (Basically Available, Soft state, Eventually consistent): keep writes fast and highly available, converge replicas eventually, and push reconciliation logic to the application. The honest interview answer: single-document atomicity covers many use cases if you model data accordingly; cross-entity invariants either need transactions, careful modeling, or application-level compensation.

**Q: We use asynchronous replication. Are committed writes durable?**

On the primary, yes — the WAL was synced locally before the ack. Surviving the *loss of the primary*, no — an async replica can be seconds behind, and a failover promotes whatever it has, losing the tail of committed transactions. If losing acknowledged writes is unacceptable, use synchronous replication to at least one replica (`synchronous_commit` / `synchronous_standby_names` in Postgres; semi-sync in MySQL), and pay the latency. This distinction — durable on the node versus durable through failover — is exactly the kind of precision that separates senior answers.

**Q: Where do transactions stop helping?**

At process boundaries they don't span. A transaction can make two table updates atomic inside one database, but it cannot make "update my DB + charge Stripe + send email" atomic — if the process dies after the external call, the transaction never commits and you've charged a card for an order that doesn't exist. The pattern there is different: write an intent record in a local transaction, perform the external side effect, mark completion, and reconcile — a saga. Relatedly, retries demand idempotency keys, because a transaction that committed but whose acknowledgment got lost will be retried. Transactions are the right tool within one database; across services you need designed workflows, not longer `BEGIN`s.

## 6. The Traps — What Goes Wrong in Production

**Relying on autocommit for multi-step flows.** Every driver defaults to autocommit: each statement outside an explicit transaction commits immediately. Two `INSERT`s issued naively aren't atomic at all — the first is visible to everyone before the second even starts, and a failure between them ships half an order. People get burned because their test passed (no failure injected) and the bug waits for a real outage. Fix: explicit transaction boundaries around every multi-step unit, ideally enforced in one repository/service layer so nobody forgets.

**Assuming a failed statement rolls back the transaction everywhere.** As shown above, Postgres kills the transaction on error, but MySQL and SQLite only kill the statement. The wrong code pattern is `try { insert(); update(); } catch { log }` followed by more statements and a `COMMIT` — on MySQL you've just committed the insert without the update. What actually happens in incidents: silent partial state, discovered weeks later. Fix: on any error, `ROLLBACK` explicitly; verify affected-row counts yourself; reach for savepoints only deliberately.

**Keeping transactions open across slow external calls.** Calling a payment gateway, sending an email, or waiting on a third-party API while a transaction holds row locks. Lock wait times balloon, other requests queue behind the locks, the connection pool exhausts, and you've built a self-inflicted outage — often with deadlock errors as a bonus. Fix: transactions should be milliseconds: lock, mutate local data, commit. External effects happen outside, coordinated by an intent record or saga step.

**Read-modify-write in application code.** `SELECT balance`, compute in JS, `UPDATE ... SET balance = <computed>` — the textbook lost update. Under READ COMMITTED nothing stops two sessions from doing this simultaneously; the last write wins and the earlier one evaporates. It feels safe because it fails only under load. Fix: relative updates with guards (`balance = balance - x WHERE balance >= x`), or pessimistic `FOR UPDATE`, or optimistic version columns with retries.

**Treating "commit succeeded" as "survived everything".** Committed means durable on that node per your flush settings — not replicated synchronously, not immune to a tuned-down `innodb_flush_log_at_trx_commit`, not exempt from failover lag. Teams discover this during the first real failover drill. Fix: know your flush and replication settings per environment; make the durability tier explicit (payments: full sync; click analytics: relaxed).

**Declaring victory on consistency the schema can't enforce.** Adding `CHECK (balance >= 0)` feels safe, but if the transfer logic reads the balance, decides in the app, then writes blindly, the constraint just converts races into random 500s instead of preventing them. Constraints are the last line of defense; the transaction structure is the defense. Design both, and test them concurrently — sequential tests never exercise these bugs.

## 7. Compare With Related Concepts

**Atomicity vs Isolation.** Atomicity is about crashing alone: one transaction, all-or-nothing. Isolation is about coexisting: many transactions, none seeing another's mess. Rule of thumb: if the bug reproduces with one request and a killed process, suspect atomicity; if it takes two simultaneous requests, suspect isolation.

**Consistency (ACID) vs Consistency (CAP).** ACID-C: rules and invariants hold across transactions on a node. CAP-C: replicas agree on the latest write in a distributed system. Rule of thumb: constraints and foreign keys are ACID-C territory; replica lag and quorum reads are CAP-C territory.

**Transactions vs Idempotency.** A transaction makes a group of operations indivisible; idempotency makes repeating an operation harmless. They solve different halves of the same reliability story: a network timeout after commit means the client doesn't know it succeeded and will retry — only an idempotency key stops the double charge. Rule of thumb: transactions protect against internal failure, idempotency protects against external retries; production payment flows need both.

**ACID vs BASE.** ACID trades availability and raw speed for strict correctness per transaction, typically on a single-node or tightly-replicated relational engine. BASE (Basically Available, Soft state, Eventually consistent) accepts temporarily inconsistent views to stay fast and available at scale, pushing conflict handling into the app. Rule of thumb: balances, inventory, and ledgers demand ACID; social feeds, counters, and caches tolerate BASE.

**Rollback vs Compensation (saga).** Rollback is the database undoing uncommitted work instantly and reliably. Compensation is application code undoing *already-committed* work across services (refund the payment, release the seat) — best-effort, order-sensitive, and much harder. Rule of thumb: within one database, roll back; across services, plan compensating actions up front, because `ROLLBACK` doesn't exist there.

Deep neighbors worth studying next, since each builds directly on this page: [transactions](what-is-a-transaction.md) themselves, the [isolation levels](what-is-isolation-level.md) ladder, the specific anomalies — [dirty reads](what-is-dirty-read.md), [non-repeatable reads](what-is-non-repeatable-read.md), [phantom reads](what-is-phantom-read.md) — plus [optimistic locking](what-is-optimistic-locking.md), [pessimistic locking](what-is-pessimistic-locking.md), and how these interactions produce [deadlocks](what-is-deadlock.md).

## 8. 🧠 The Memory Hook

The teller's promise: the whole slip happens or none of it does, the wall rules were checked before the stamp, your paperwork never tangled with anyone else's, and the moment she says "done," your entry is already in ink inside the fireproof cabinet — floods can't unwrite it. Or in one breath: **a transaction either fully happened or fully didn't, and once the database says "committed," no crash, power cut, or concurrent request can ever un-happen it.**
