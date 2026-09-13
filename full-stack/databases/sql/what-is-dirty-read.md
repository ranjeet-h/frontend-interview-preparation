# What Is a Dirty Read

## 1. The Real-World Problem — When You Actually Hit This

A payments service starts moving $800 out of account #42. The first half of the transfer runs — `balance = balance - 800`, so 5,000 becomes 4,200 — but the transaction stays open because the credit into the destination account hasn't happened yet. Meanwhile, an independent fraud-check job reads that account's balance. It sees 4,200, decides "sudden unexplained drop," freezes the customer's card, and drops a case into the support queue. Two seconds later the transfer's second leg fails (the destination account was closed), so the whole transaction rolls back. The balance snaps back to 5,000 like nothing ever happened.

But the card stays frozen. The support ticket stays open. Every one of those actions was taken based on money that never actually moved. That's a dirty read: your query read another transaction's change while that change was still pending — and when that transaction rolled back, you were left holding decisions about data that never existed. The nastiest part is that nothing will look broken afterward. The database recovered perfectly. Your application just made real-world commitments off numbers that were never true.

## 2. The Analogy — Make the Mechanic Obvious

Picture a budget meeting. One colleague is working through numbers on a whiteboard, mid-calculation, and writes "Marketing: cut $50k." You glance over, copy that number into your slide deck, and email it to your VP before leaving the room. Ten minutes later your colleague steps back, finds they were working from a stale spreadsheet, and erases the entire board: "Ignore all of that." Your email can't be unsent. You reported a decision that was never made — not because anyone lied to you, but because you read something that wasn't final yet.

Every piece of this maps onto the real mechanic. The whiteboard scribbling mid-calculation is an open transaction writing changes it hasn't committed. Erasing everything is a rollback. Copying the number off the half-finished board is the dirty read. Emailing your VP is application logic acting on the read — the part where damage escapes into the world. The house rule "only copy figures marked FINAL" is exactly what the READ COMMITTED isolation level enforces. And two more pieces of this meeting map beautifully onto modern databases: if everyone gets handed their own printed snapshot of the last approved deck when they walk in, nobody needs to squint at the half-edited board at all — that printed snapshot is what MVCC gives every reader. The one person who insists on photographing the board mid-erasure anyway? That's someone running at READ UNCOMMITTED.

The core insight hiding in the analogy: writing on the board isn't lying. Uncommitted data isn't false — but it isn't true either. It's undecided. A dirty read treats an undecided value as fact.

## 3. The Full Explanation — How It Actually Works

Start with what physically happens inside a lock-based engine like SQL Server's default mode. When a transaction updates a row, the new value lands in memory and on disk right away — but the engine holds an exclusive lock on that row until the transaction commits or rolls back. Other sessions can't normally touch the row; their reads queue up waiting for that lock. The waiting is the protection. If the writer rolls back, the waiter then reads the restored value and never knew anything else existed. A dirty read happens only when a session is allowed to skip the wait — to peek past the lock and read the pending value directly.

Why is that peek so dangerous? Because a rollback makes the write retroactively never-have-happened. Stale data is annoying; dirty data is worse — it's data that may be logically false forever. Three concrete failure shapes: money decisions, like the card freeze above. Lost work, where transaction A inserts an order row, transaction B sees it and skips creating its own copy, then A rolls back — and now the order exists nowhere, though both apps did their jobs correctly. And cascading aborts, the classic theory consequence: once B has made decisions based on A's pending write, B's own work is contaminated, so if A rolls back, B has to roll back too. In systems that allow dirty reads, one aborted transaction can drag others down with it.

This is why the isolation ladder exists. The SQL standard defines four [isolation levels](what-is-isolation-level.md), and each one bans a specific set of anomalies:

| Isolation level | Dirty read | Non-repeatable read | Phantom read |
|---|---|---|---|
| READ UNCOMMITTED | possible | possible | possible |
| READ COMMITTED | **prevented** | possible | possible |
| REPEATABLE READ | prevented | prevented | possible* |
| SERIALIZABLE | prevented | prevented | prevented |

(*The standard permits phantoms at REPEATABLE READ; real engines differ — PostgreSQL's implementation blocks them too. Details belong to the isolation-level page.)

Dirty reads are permitted at exactly one level: READ UNCOMMITTED, the bottom rung. Everything above bans them. So under any sane default configuration, you don't get dirty reads — the danger enters when someone explicitly asks for them.

Now the part that surprises people: some of the most popular databases won't give you dirty reads at any price. PostgreSQL implements multi-version concurrency control (MVCC): instead of overwriting rows in place and locking readers out, every UPDATE creates a new row version, and each reader gets a snapshot containing only transactions that had committed as of a specific moment. An uncommitted row written by someone else simply isn't in your snapshot — there is no mechanism through which you could see it. The result is precise and worth saying exactly: PostgreSQL accepts the syntax `ISOLATION LEVEL READ UNCOMMITTED` without complaint, but silently runs it as READ COMMITTED, and `SHOW transaction_isolation` confirms `read committed`. There is no way to make PostgreSQL show you another transaction's uncommitted data. Oracle made the same choice years ago.

MySQL's InnoDB also builds on MVCC — plain SELECTs read the last committed version of a row from its undo history, never pending changes — but unlike PostgreSQL, InnoDB genuinely honors READ UNCOMMITTED if you set it explicitly. SQL Server honors it too, because its default READ COMMITTED is lock-based rather than snapshot-based: readers really would block behind writers, and READ UNCOMMITTED exists as an escape hatch from that blocking.

That escape hatch is also the honest answer to "why does READ UNCOMMITTED even exist?" In lock-based engines, reporting queries scanning millions of rows used to collide with writers constantly. Reading without taking locks removed the queuing — at the cost of correctness. MVCC engines made that trade-off obsolete: snapshots give you zero blocking and full commit-only visibility simultaneously. That's why the newest major engines dropped the dirty level entirely.

One more piece of vocabulary you'll need: snapshot timing. Under READ COMMITTED, each statement gets a fresh snapshot of committed data — so a writer committing between two of your statements is visible, which is a different anomaly called a non-repeatable read. Under REPEATABLE READ and SERIALIZABLE, the snapshot is fixed once for your whole transaction, so repeated reads agree. Either way, the snapshot contains only commits — the snapshot model and dirty reads are fundamentally incompatible, which is exactly why MVCC engines never offered them.

## 4. See It In Practice — Real Code or Queries

**Example 1 — manufacturing a dirty read in SQL Server.** SQL Server's default READ COMMITTED takes locks, so it's one of the few places you can demonstrate the anomaly for real. Open two sessions against the same database.

Session A starts a transfer and deliberately leaves it hanging:

```sql
-- Session A (SQL Server)
BEGIN TRANSACTION;

UPDATE accounts
SET balance = balance - 800        -- 5000 becomes 4200, but only inside this open transaction
WHERE account_id = 42;
-- no COMMIT yet — we're holding the exclusive row lock on purpose
```

Session B asks to skip the wait:

```sql
-- Session B (SQL Server)
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

SELECT account_id, balance
FROM accounts
WHERE account_id = 42;
-- returns 4200 immediately — a value Session A might still take back
```

Then Session A fails on the second leg of the transfer:

```sql
-- Session A (SQL Server)
ROLLBACK;                           -- balance snaps back to 5000
-- Session B already acted on 4200. Money that never existed.
```

**Example 2 — the same read, done safely.** Remove the `SET TRANSACTION ISOLATION LEVEL` line and Session B runs at the default READ COMMITTED. Now the `SELECT` simply waits — for as long as Session A's transaction stays open — and afterwards reports whatever is actually true (5,000 after the rollback, or the committed new balance if A commits). Waiting is the feature. It's the database telling you "that value hasn't been decided yet."

**Example 3 — proving PostgreSQL can't play along.** Run this on any modern PostgreSQL:

```sql
BEGIN TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
SHOW transaction_isolation;
-- --> read committed
```

Postgres took the request and quietly upgraded it. Watch what a concurrent reader sees while another session holds an uncommitted update:

```sql
-- Session A (PostgreSQL)
BEGIN;
UPDATE accounts SET balance = 4200 WHERE account_id = 42;

-- Session B (separate connection, default settings)
BEGIN;
SELECT balance FROM accounts WHERE account_id = 42;   -- --> 5000, the last committed value
COMMIT;

ROLLBACK;  -- back on Session A: abandon the transfer entirely
```

Session B saw 5,000 the whole time — the snapshot only includes commits, so Session A's pending change was structurally invisible. When you need lock-free reading in Postgres, you never reach for a dirty level; the default already gives you readers that never block writers and writers that never block readers.

InnoDB sits between these worlds: its plain `SELECT`s behave like Postgres's (committed snapshots via the undo log), but `SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED` genuinely opens the door to dirty reads if someone sets it.

## 5. Interview Questions — All of Them, Done Properly

**Q: What exactly is a dirty read, and why is it called "dirty"?**

It's when one transaction reads a change that another transaction wrote but hasn't committed yet. The name captures why it's a problem rather than just a curiosity: the data you read isn't established fact. Commit means "this is real now"; until then, the writer can still reverse course with a rollback, and if they do, everything you read evaporates retroactively. You didn't read stale data — stale data at least was true once. You read a maybe. Any decision built on it — a frozen card, a skipped insert, an applied fee — is built on something that, in the final record, never happened. The word "dirty" is doing real work: it says the data itself is contaminated, not merely old.

**Q: Which isolation levels allow dirty reads? Do all databases behave the same there?**

Only READ UNCOMMITTED, the lowest level in the SQL standard's ladder, permits dirty reads. READ COMMITTED and everything above ban them. But engine behavior differs in an important way: SQL Server and MySQL/InnoDB genuinely implement READ UNCOMMITTED, while PostgreSQL and Oracle don't implement it at all — Postgres accepts the syntax and runs READ COMMITTED instead, so a dirty read is impossible at any setting. That difference matters in interviews because the generic answer "READ UNCOMMITTED allows dirty reads" is only half right; the complete answer names which engines can actually produce one.

**Q: Walk me through how a dirty read causes real production damage.**

Take the transfer example from the top of this page. Transaction A debits $800 from an account but hasn't committed. A fraud job reads the reduced balance, concludes something suspicious is happening, and freezes the card — a side effect outside the database. Then A rolls back because the transfer's other leg failed. The database is now perfectly consistent: balance 5,000, as if nothing happened. But the card is still frozen, the support ticket still open, the customer still angry. The damage escaped through the application layer, and rollbacks can't follow it there. Worse variants exist internally too: if transaction B sees A's inserted-but-uncommitted row and skips inserting its own, A's rollback silently loses B's work. That's how a dirty read turns into missing data with no error anywhere.

**Q: Does PostgreSQL allow dirty reads? Why not?**

No, at any isolation level — even if you literally request READ UNCOMMITTED, Postgres runs READ COMMITTED instead. The reason is architectural: PostgreSQL uses MVCC, where updates create new row versions and readers take a snapshot of committed data at a point in time. Another transaction's pending change simply doesn't exist in your snapshot — there's no knob that makes it visible. This design also buys the property everyone wants anyway: readers never block writers and writers never block readers, without ever exposing unfinished data. So Postgres didn't lose anything by dropping READ UNCOMMITTED; the level solves a problem (reader-writer blocking) that MVCC had already solved cleanly.

**Q: How do databases actually prevent dirty reads — locking versus MVCC?**

Two different strategies for the same guarantee. Lock-based engines (SQL Server's default mode) hold exclusive locks on modified rows until commit, and readers must acquire shared locks before touching those rows — so a reader physically waits until the writer finishes, then reads only decided values. MVCC engines (PostgreSQL, Oracle, InnoDB for consistent reads) never make readers wait at all: writers create new versions, readers get a snapshot filtered to committed transactions only, and pending versions are invisible by construction. Same outcome, different cost profile — locking trades reader latency for simplicity, MVCC trades storage overhead (old versions kept around until cleanup) for concurrency. Both make dirty reads impossible below the READ UNCOMMITTED level.

**Q: What's the difference between a dirty read, a non-repeatable read, and a phantom read?**

All three are anomalies about what concurrent transactions can do to you, but they fail differently. A dirty read: you read data another transaction hasn't committed, and it might never become real. A [non-repeatable read](what-is-non-repeatable-read.md): you read the same row twice within your transaction and get different values, because another transaction updated it *and committed* between your two reads — both values were genuinely true at some point, they just weren't stable. A [phantom read](what-is-phantom-read.md): you run the same range query twice and the set of matching rows changes, because another transaction inserted or deleted qualifying rows and committed — the membership changed, not a known row's value. The clean way to remember it: dirty reads show you a future that may never happen; non-repeatable reads show you two different pasts that both really happened; phantoms show you that the population itself shifted.

**Q: Is WITH (NOLOCK) in SQL Server safe to sprinkle on reporting queries?**

No, and this is a trap worth stating strongly. `WITH (NOLOCK)` is shorthand equivalent to running at READ UNCOMMITTED, so it carries the same dirty-read exposure. But it's actually worse than people expect, because NOLOCK doesn't just relax lock-taking — it lets the scan ignore the internal bookkeeping that keeps reads coherent while data moves underneath them. During page splits or allocations caused by concurrent writes, a NOLOCK scan can skip rows it should have seen, return the same rows twice, or in edge cases fail outright with a data-movement error. So your report isn't just possibly-dirty — it's possibly incomplete or duplicated, and nothing marks which parts are suspect. The right tool in modern SQL Server is enabling READ_COMMITTED_SNAPSHOT, which gives you MVCC-style behavior: no reader-writer blocking, and strictly committed data.

**Q: If dirty reads are so dangerous, why does READ UNCOMMITTED exist? Would you ever use it?**

Historical necessity plus one legitimate niche. In purely lock-based engines, big reporting scans used to either block behind writers or block writers behind them — READ UNCOMMITTED was the pressure valve. Once MVCC arrived, that reason mostly vanished, which is why Postgres and Oracle dropped the level. The surviving niche: approximate answers where being roughly right, soon, beats being exactly right, later — "about how many orders exist right now?" on a dashboard. Even there, you're accepting not just fuzziness but logical impossibility (counts including rows that will be rolled back), so it needs an explicit, documented decision, never a habit. For anything involving money, inventory, permissions, or state machines, the answer is never.

**Q: How would you reproduce or catch this class of bug in a real system?**

Reproduce it deliberately: two sessions, one holding an open transaction with an UPDATE, one reading at READ UNCOMMITTED or with NOLOCK — exactly the demo in section 4, scripted into an integration test against SQL Server or MySQL. Catching it in the wild is harder precisely because the database recovers cleanly; nothing errors. What leaks is downstream inconsistency: a reconciliation job finds a fee applied to a balance that never changed, or a report total disagrees with an audit count. That's why financial systems run cross-checks between derived artifacts and source-of-truth tables — those checks are your dirty-read detector, since the anomaly leaves no trace in the database's own logs.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: "NOLOCK is a free performance boost."** The wrong assumption: adding `WITH (NOLOCK)` to queries reduces blocking with no downside, so teams sprinkle it across an ORM or reporting layer as a tuning step. Why it's wrong: NOLOCK doesn't make locking cheaper — it removes the correctness guarantees. What actually happens: the query can return uncommitted values (dirty reads), skip rows during page splits, duplicate rows, or throw a data-movement error — and none of these are flagged in the output. On a financial report, that's silently wrong numbers presented as authoritative. The fix: turn on `READ_COMMITTED_SNAPSHOT` at the database level and delete the hints; you keep non-blocking reads and regain commit-only visibility.

**Trap 2: "Every database behaves the same at READ UNCOMMITTED."** The wrong assumption: the SQL standard defines the levels, so requesting READ UNCOMMITTED means dirty reads everywhere. Why it's wrong: the standard defines minimum behaviors, and several engines go further — PostgreSQL and Oracle don't implement the level at all, quietly substituting READ COMMITTED. What actually happens: an engineer writes "dirty reads are possible here" in a design doc, picks Postgres, and either worries unnecessarily or — the dangerous direction — assumes their SQL Server habits port over when they later migrate. The fix: name your engine when discussing anomalies. "Dirty read" claims are always engine-plus-isolation claims, never SQL-in-general claims.

**Trap 3: "A dirty read is basically stale data — how bad can it be?"** The wrong assumption: dirty and stale are the same category, just freshness degrees. Why it's wrong: a read replica lagging three seconds serves you a real past — every value it shows genuinely was committed at some point. A dirty read shows you a future that never arrives — the value was never valid and never will be. What actually happens: teams treat dirty-read exposure as acceptable "eventual consistency" and ship decisions about balances, stock counts, or permissions based on events that roll back. Eventual consistency converges toward truth; dirty reads converge toward nothing. The fix: reserve "eventual consistency" language for replication and caching lag, and treat uncommitted-data reads as a categorically different risk.

**Trap 4: "Rollback undoes everything, so no harm done."** The wrong assumption: a rollback restores the world to pre-transaction state. Why it's wrong: it restores the *database*, not the world. What actually happens: any side effect triggered by a dirty read — an email, an API call, a fee, a frozen card, a skipped insert — survives the rollback happily, because it lives outside the transaction's scope. Add cascading aborts in lock-based systems: transactions that consumed the rolled-back data must themselves unwind. The fix: keep external side effects out of code paths that read at weak isolation, and let transactions wrap database work only — the same boundary discipline that protects you from holding locks across slow API calls.

## 7. Compare With Related Concepts

**Dirty read vs non-repeatable read.** Both involve reading the same data twice with trouble in between, but the trouble differs fundamentally. Dirty read: your first read saw *uncommitted* data, which may vanish on rollback. Non-repeatable read: both reads saw *committed* data — it just changed between them because another transaction updated and committed in the middle of your transaction. Nothing you read was ever false; it just wasn't stable. Rule: dirty = possibly never true; non-repeatable = twice-true but inconsistent.

**Dirty read vs phantom read.** A phantom isn't about a row's value changing — it's about the result *set* changing. Run `SELECT * FROM orders WHERE created_at > today` twice in one transaction; if another transaction commits a new order in between, the second run shows a row the first didn't. The original rows are untouched; the population grew. Dirty reads concern the validity of individual values; phantoms concern set membership under range predicates. Rule: value of a known row changed → non-repeatable; new/disappeared rows in a filtered result → phantom.

**Dirty read vs the isolation level ladder generally.** The ladder ([full page here](what-is-isolation-level.md)) is a menu of which anomalies you've chosen to forbid. Dirty reads sit at the bottom: banning them costs almost nothing, which is why READ COMMITTED is the floor nearly everyone lives on, and why the two flagship MVCC engines banned them everywhere. Each step up (REPEATABLE READ, SERIALIZABLE) bans progressively subtler anomalies at progressively higher concurrency cost. Rule: know the anomaly you're defending against, then pick the cheapest rung that forbids it — don't buy SERIALIZABLE to solve a problem READ COMMITTED already solved.

**Dirty read vs replica lag / stale caches.** Both deliver "data that isn't current," so people conflate them. But a lagging [read replica](what-is-read-replica.md) or expired cache serves committed facts slightly out of date — a real past. A dirty read serves uncommitted speculation — a probable non-future. Different severity, different mitigations: staleness is bounded by replication delay and handled with read-your-own-writes routing; dirtiness is unbounded in impact and handled by refusing the isolation level entirely. Rule: stale data ages toward truth; dirty data was never on the path to truth.

## 8. 🧠 The Memory Hook

Uncommitted data is a rumor: it might come true, it might die in five seconds — never build on a rumor. Or in meeting terms: never copy numbers off a whiteboard that's still being edited; wait for the FINAL stamp (commit), or work from your own approved printout (MVCC snapshot) — and remember Postgres won't even let you photograph the board.
