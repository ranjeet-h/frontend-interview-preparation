# What Is Transaction Isolation in PostgreSQL

## 1. The Real-World Problem — When You Actually Hit This

Your wallet service has been live for months. A user has $100. They open two tabs and hit "Pay $100" at the same instant. Request A starts a transaction, reads balance = $100, checks it's enough, and is about to subtract. Request B starts a fraction of a millisecond later, also reads balance = $100 — because A hasn't committed yet — also thinks it's enough, and also subtracts. Both commit. You just let someone spend the same $100 twice, and your ledger is now -$100 or missing an order. No bug in your JavaScript. No missing validation. The reads were correct in isolation, but they saw inconsistent data because two transactions were running concurrently.

That is why isolation exists. Without rules about what one in-flight transaction can see of another, concurrent requests quietly break invariants that look solid when you test with one user at a time. PostgreSQL gives you a dial for this — the isolation level — that trades visibility guarantees for concurrency and retry cost.

## 2. The Analogy — Make the Mechanic Obvious

Think of PostgreSQL as a busy bank with one huge paper ledger.

Every transaction is a teller who needs to do work without tripping over other tellers. PostgreSQL doesn't let tellers scribble on the original pages while others read. Instead it uses photocopies. This is MVCC — each teller works from a snapshot, and the real ledger only reflects committed changes.

The isolation level is the rule for which photocopy you get:

In our analogy, the teller for "withdraw $100" needs to know the current balance. Under **READ COMMITTED**, the teller walks to the ledger and takes a fresh photocopy of the balance page every single time they look. If they look twice in the same transaction, they might get two different photocopies because someone else committed in between.

Under **REPEATABLE READ**, the teller takes one full photocopy of the entire ledger the moment they start, and they use only that copy for the whole transaction. Every re-read sees the exact same numbers, plus their own hand-written edits. They never see other tellers' commits that happened after they started, even by looking again.

Under **SERIALIZABLE**, the teller also works from that single starting photocopy, but now a supervisor follows them around with a notebook tracking who read what and who wrote what. If the supervisor spots a pattern that could not have happened if tellers had worked one at a time in a line, they tap one teller on the shoulder and say "stop, start over" — that is a serialization failure. You must retry the whole transaction.

And **READ UNCOMMITTED** in this analogy would mean letting a teller read another teller's pencil marks before they are inked. PostgreSQL simply refuses to do this. If you ask for READ UNCOMMITTED, it quietly hands you READ COMMITTED instead — a fresh photocopy of only committed pages. You never see dirty pencil marks.

That mapping — fresh copy per statement vs. one copy per transaction vs. one copy with a supervisor who aborts impossible histories — is exactly how PostgreSQL implements the levels.

## 3. The Full Explanation — How It Actually Works

In plain words, isolation is the answer to "when two transactions run at the same time, what does each one get to see of the other's work?" PostgreSQL answers that with snapshots, not locks by default.

Under the hood PostgreSQL keeps multiple versions of rows. Every row has hidden markers for which transaction created it and which transaction deleted or updated it. When you start a transaction or a statement, PostgreSQL decides which row versions are visible to you based on a snapshot of which transactions had committed at that moment. You never see uncommitted data from other transactions. That is why PostgreSQL has no dirty reads at any level.

From there the levels diverge:

**READ COMMITTED is the default.** Each statement inside the transaction gets its own new snapshot. So `SELECT balance FROM wallets WHERE id=1` at the start of your transaction sees everything committed before that SELECT ran. If you run the same SELECT again five milliseconds later, it takes a new snapshot and can see a different balance if another transaction committed in between. In Postgres terms this is a statement snapshot. It guarantees you only see committed data, but it does not guarantee the same answer twice. You can get non-repeatable reads (same row looks different on re-read) and phantom reads (a new row appears that matches your WHERE clause). This is fine for most web requests because each request is often a single short transaction, and holding a snapshot longer hurts concurrency. The trade-off is you must not assume two reads in one transaction will match, and you must use explicit locking if a read-then-write must be atomic.

**REPEATABLE READ gives you a transaction snapshot.** The first read or write that needs a snapshot freezes the view for the whole transaction. Every later SELECT sees the database exactly as it was at transaction start, plus your own uncommitted changes. Other transactions can commit, but you won't see them. This prevents non-repeatable and phantom reads from your perspective — you get a frozen world. But PostgreSQL still detects write conflicts. If you try to update a row that another transaction concurrently updated after your snapshot started, PostgreSQL will not silently overwrite it. It aborts your transaction with `ERROR: could not serialize access due to concurrent update` (SQLSTATE 40001). You did not get a lock wait like in some other databases; you got a serialization error you must handle by retrying. That error is not a bug — it is the level doing its job to keep your frozen view honest.

**SERIALIZABLE is REPEATABLE READ plus a referee.** It also uses a transaction snapshot, but it adds Serializable Snapshot Isolation — SSI. While your transaction runs, PostgreSQL tracks read-write dependencies: "Transaction A read rows that Transaction B later wrote" and vice versa. If those dependencies form a cycle that could not happen if transactions ran one after another, PostgreSQL aborts one of them with `ERROR: could not serialize access due to read/write dependencies among transactions` (again SQLSTATE 40001). The aborted transaction could have run successfully on its snapshot, but allowing it to commit would have created a history that looks like nothing serial. You must retry the whole transaction from the beginning. SERIALIZABLE is the only level that truly guarantees the result is as if transactions ran one by one. You pay for it with more aborts under contention and you must write retry logic.

**READ UNCOMMITTED does not exist in PostgreSQL.** The SQL standard defines it as allowing dirty reads, but PostgreSQL documents this clearly: `READ UNCOMMITTED` is treated as `READ COMMITTED`. You can write `BEGIN TRANSACTION ISOLATION LEVEL READ UNCOMMITTED` and it will succeed without error, but `SHOW transaction_isolation` will still say `read committed` and you still will never see uncommitted rows. If you are coming from MySQL or SQL Server where READ UNCOMMITTED actually shows dirty data for performance, this quiet upgrade is important — you are not getting the behavior you asked for, you are just getting the default.

When to use which? Use READ COMMITTED for almost everything — short API transactions, single-statement reads, typical CRUD. Use REPEATABLE READ when a transaction does multiple reads that must agree, like generating a report or checking a balance then creating an order in the same transaction, and you cannot tolerate seeing half-committed progress. Use SERIALIZABLE when correctness depends on the illusion of serial execution — ledger transfers, inventory decrements, unique booking slots — and you are willing to add retry logic to handle aborts. Do not use READ UNCOMMITTED hoping for speed; in PostgreSQL it changes nothing.

All of this interacts with transactions themselves. Without `BEGIN`, each statement runs in its own transaction at READ COMMITTED. Snapshots matter only once you wrap work in `BEGIN ... COMMIT`. Long snapshots, especially at REPEATABLE READ or SERIALIZABLE, also hold back `VACUUM` because old row versions must be kept visible to your snapshot. That is an operational cost — a long reporting transaction can cause table bloat.

For the full level definitions and PostgreSQL-specific notes, see the official docs: https://www.postgresql.org/docs/current/transaction-iso.html

## 4. See It In Practice — Real Code or Queries

All examples are PostgreSQL SQL. The retry example is shown for Node.js with `pg` — the pattern is identical in Python, Go, or any driver; only the error-code check matters.

How to set the level. Do it per transaction, not globally:

```sql
-- Default: READ COMMITTED, statement snapshot
BEGIN;
SELECT balance FROM wallets WHERE id = 1; -- snapshot taken here
-- another transaction commits a new balance here
SELECT balance FROM wallets WHERE id = 1; -- new snapshot, may see different value
COMMIT;

-- REPEATABLE READ: transaction snapshot
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM wallets WHERE id = 1; -- snapshot frozen at first read
SELECT balance FROM wallets WHERE id = 1; -- same result, even if someone committed
-- your own writes are visible to you:
UPDATE wallets SET balance = balance - 100 WHERE id = 1;
SELECT balance FROM wallets WHERE id = 1; -- sees your own -100
COMMIT;

-- SERIALIZABLE: same frozen view, but aborts on serialization anomalies
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT sum(balance) FROM wallets WHERE owner = 'alice';
-- concurrent transaction modifies one of those wallets and commits
UPDATE wallets SET balance = balance - 10 WHERE id = 7; -- may later get 40001 on commit
COMMIT; -- or COMMIT may be the point where SSI detects the cycle and aborts

-- READ UNCOMMITTED is quietly upgraded — this is still READ COMMITTED
BEGIN TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
SHOW transaction_isolation; -- returns 'read committed'
COMMIT;
```

The double-spend that READ COMMITTED allows, and how to fix it:

```sql
-- Session A and B both run this at READ COMMITTED at the same time, balance starts at 100
BEGIN; -- READ COMMITTED
SELECT balance FROM wallets WHERE id = 1; -- both read 100

-- Each thinks 100 >= 100, so each does:
UPDATE wallets SET balance = balance - 100 WHERE id = 1;
COMMIT;
-- Result: balance goes 100 -> 0 -> -100 or second update overwrites first,
-- depending on row locking. The check and the write were not atomic.

-- Fix 1: make check-and-write atomic with a single statement
BEGIN; -- READ COMMITTED is fine if write is conditional
UPDATE wallets SET balance = balance - 100
 WHERE id = 1 AND balance >= 100
RETURNING balance;
-- check row_count = 1 in app code; if 0, it was insufficient funds or race lost
COMMIT;

-- Fix 2: lock the row you checked
BEGIN;
SELECT balance FROM wallets WHERE id = 1 FOR UPDATE; -- row lock, other waiter blocks
-- now safe to check in app, then update
UPDATE wallets SET balance = balance - 100 WHERE id = 1;
COMMIT;

-- Fix 3: use higher isolation and handle retry
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM wallets WHERE id = 1; -- frozen snapshot
-- if another transaction updated balance concurrently, this next line will get 40001
UPDATE wallets SET balance = balance - 100 WHERE id = 1;
COMMIT;
```

Handling serialization failures (40001) in application code — you must retry the entire transaction:

```js
// Node.js with pg — same idea in any language: retry on SQLSTATE 40001
import { Pool } from 'pg';
const pool = new Pool();

async function transfer(fromId, toId, amount) {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      const { rows } = await client.query(
        'SELECT balance FROM wallets WHERE id = $1',
        [fromId]
      );
      if (rows[0].balance < amount) {
        await client.query('ROLLBACK');
        throw new Error('insufficient funds');
      }
      await client.query('UPDATE wallets SET balance = balance - $1 WHERE id = $2', [amount, fromId]);
      await client.query('UPDATE wallets SET balance = balance + $1 WHERE id = $2', [amount, toId]);
      await client.query('COMMIT');
      return; // success, exit retry loop
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      // 40001 = serialization_failure, 40P01 = deadlock_detected — both retryable
      const isRetryable = err.code === '40001' || err.code === '40P01';
      if (!isRetryable || attempt === maxRetries) throw err;
      // small jittered backoff before retry — don't hammer
      await new Promise(r => setTimeout(r, 50 * attempt + Math.random() * 50));
    } finally {
      client.release();
    }
  }
}
```

Checking what you actually got:

```sql
SHOW default_transaction_isolation; -- cluster default, usually 'read committed'
SHOW transaction_isolation;         -- current transaction's level
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is transaction isolation in PostgreSQL?**

It is the set of rules that decides what data one running transaction can see from other concurrent transactions. In PostgreSQL all levels hide uncommitted data — you never see dirty writes — but they differ in how long your snapshot lasts and whether impossible concurrent histories are allowed to commit. At READ COMMITTED each statement sees a fresh snapshot of committed data. At REPEATABLE READ you see one frozen snapshot for the whole transaction. At SERIALIZABLE you see the same frozen snapshot but PostgreSQL also tracks read-write dependencies and will abort a transaction if committing it would create a history that could not happen serially. You use it to prevent bugs like double-spend where two concurrent reads both think funds are available.

**Q: What isolation level does PostgreSQL use by default, and what does it guarantee?**

The default is READ COMMITTED with a statement snapshot. Each statement sees all data committed before that statement started, plus your own uncommitted writes. It guarantees no dirty reads, but it does not guarantee repeatable reads. If you SELECT the same row twice in one transaction, you can get different answers because a new snapshot is taken for the second SELECT. It also does not prevent phantoms — a second SELECT with the same WHERE can return new rows that another transaction inserted and committed in between. Most apps live happily at this level because transactions are short.

**Q: Does PostgreSQL support READ UNCOMMITTED? Can I use it for faster reads?**

You can write the syntax, but PostgreSQL quietly upgrades it to READ COMMITTED. There are no dirty reads in PostgreSQL at any level, so READ UNCOMMITTED gives you no speed benefit and no weaker guarantee. `BEGIN TRANSACTION ISOLATION LEVEL READ UNCOMMITTED` parses and runs, but `SHOW transaction_isolation` will report `read committed` and behavior is identical to READ COMMITTED. If you are optimizing for performance, look at proper indexes, short transactions, or removing unnecessary locking — not at changing to READ UNCOMMITTED.

**Q: What is the difference between READ COMMITTED and REPEATABLE READ in PostgreSQL?**

The snapshot lifetime. READ COMMITTED takes a new snapshot per statement, so re-reads can see new commits. REPEATABLE READ takes one snapshot at the first snapshot-taking statement and reuses it. So in REPEATABLE READ two SELECTs with the same query always return the same rows, even if another transaction committed changes in between. REPEATABLE READ also changes write behavior: if you try to update or delete a row that was updated by a concurrent transaction after your snapshot started, you get a serialization error 40001 instead of silently overwriting or waiting. That error tells you to retry the whole transaction.

**Q: How does PostgreSQL's REPEATABLE READ differ from other databases? Isn't REPEATABLE READ supposed to allow phantoms?**

This is the most common confusion. The SQL standard says REPEATABLE READ should still allow phantom reads (new rows appearing). MySQL's InnoDB at REPEATABLE READ implements it with gap locks and mostly prevents phantoms anyway, but still behaves differently. PostgreSQL's REPEATABLE READ actually gives you snapshot isolation: the transaction snapshot means phantoms do not appear — you keep seeing the same set of rows for the same query. But the standard also says REPEATABLE READ does not have to be serializable, and PostgreSQL honors that — two concurrent REPEATABLE READ transactions can still create a write-skew anomaly that would be impossible serially, and PostgreSQL will not abort the first committer, only the second one that hits a write conflict. If you need the guarantee that no such anomaly commits, you need SERIALIZABLE, not REPEATABLE READ.

**Q: What is SERIALIZABLE in PostgreSQL and what is SSI? What is error 40001?**

SERIALIZABLE in PostgreSQL uses Serializable Snapshot Isolation (SSI). It keeps the same transaction snapshot as REPEATABLE READ, but it also records which transactions read which data and which transactions wrote which data. If it detects a cycle — like A read data that B wrote, and B read data that A wrote — that means the two transactions overlapping in time produced a result that no serial order could explain, so it aborts one with SQLSTATE 40001 `serialization_failure`. Other conflicts like updating a concurrently modified row also raise 40001, and deadlocks raise 40P01. Both mean your transaction did not commit and did not change the database. Your application must catch 40001 and retry the whole transaction from the beginning, not just the failed statement. SSI gives true serializability without heavyweight table locks, at the cost of more retries under contention.

**Q: What anomalies does each level prevent?**

All PostgreSQL levels prevent dirty reads. READ COMMITTED allows non-repeatable reads and phantoms and of course serialization anomalies — it only hides uncommitted data. REPEATABLE READ prevents non-repeatable reads and phantoms for your snapshot view, but still allows serialization anomalies like write skew where two transactions each read a constraint, each think it is safe to write, and together they break the constraint. SERIALIZABLE prevents all of them, including serialization anomalies, by aborting. A quick way to remember: READ COMMITTED hides dirty data, REPEATABLE READ freezes your view, SERIALIZABLE guarantees the frozen view could have happened one transaction at a time.

**Q: When should I use SERIALIZABLE vs. handling it in the application with SELECT FOR UPDATE?**

Use SERIALIZABLE when the invariant touches multiple rows or tables and you would otherwise need to remember to lock every row you read. Classic cases are double-book a seat, inventory go negative, or transfer funds between two accounts where the check and the writes span rows. SSI lets you write straightforward `SELECT then UPDATE` logic and rely on retries instead of manually locking. Use explicit `SELECT ... FOR UPDATE` or a single conditional `UPDATE ... WHERE balance >= $1` when the contention is on a single well-known row and you want blocking instead of aborts — FOR UPDATE makes the second transaction wait for the lock rather than failing. If contention is high and retries would be frequent, pessimistic locking often gives more predictable latency than optimistic SERIALIZABLE retries. Many production systems use READ COMMITTED plus careful row locking by default and reserve SERIALIZABLE for the few workflows where the invariant truly needs it.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Thinking REPEATABLE READ works the same in every database.** People read that REPEATABLE READ allows phantoms in textbooks or see MySQL's gap-lock behavior and assume PostgreSQL is identical. In PostgreSQL REPEATABLE READ is really snapshot isolation — a repeated SELECT with the same WHERE will not see new rows committed after your transaction started. If you write code expecting phantoms at REPEATABLE READ and test only on Postgres, you will think you are safe, then get surprised on MySQL, or vice versa. And the bigger trap is thinking PostgreSQL's REPEATABLE READ is serializable because it hides phantoms. It is not. Two REPEATABLE READ transactions can still both read `SELECT count(*) FROM bookings WHERE slot = '9am'`, both see zero, both insert, and both commit — now you double-booked. Only SERIALIZABLE would abort one. Always name which guarantee you actually need.

**Trap 2: Forgetting to retry on 40001.** At REPEATABLE READ and SERIALIZABLE, `could not serialize access due to concurrent update` and `could not serialize access due to read/write dependencies` are normal, not crashes. If you surface that error directly to the user as a 500, every busy period will show random failures. The fix is mandatory retry logic at the transaction boundary — rollback, jittered backoff, retry the whole transaction, with a limit like three attempts. Also retry on 40P01 `deadlock_detected`, which can appear at any level when row locks deadlock. Do not retry by re-running just the failed query; you must start a brand new `BEGIN` because the snapshot was invalidated.

**Trap 3: Believing isolation removes the need for locking.** Isolation controls visibility, not mutual exclusion. At READ COMMITTED two concurrent transactions can both `SELECT balance` then both `UPDATE balance = balance - 100` and the second one will overwrite the first's check. Isolation did not stop it because each UPDATE locks the row at write time, but the check happened before the lock. If you need read-then-write to be atomic, either make it a single statement (`UPDATE ... WHERE balance >= 100 RETURNING`), use `SELECT ... FOR UPDATE` to lock before checking, or move to SERIALIZABLE with retries. Higher isolation alone does not make a naive `read, check in app, then write` safe.

**Trap 4: Reading the same data twice in one READ COMMITTED transaction and assuming it matches.** A common pattern is to `SELECT` to validate, call a helper that `SELECT`s again, and compare. At READ COMMITTED those two SELECTs can return different data if another transaction committed between them. Your validation passes on the first read but acts on the second, or vice versa. If that matters, either use REPEATABLE READ for that transaction, or do the validation and the write in the same statement, or keep the transaction very short so re-reads are unnecessary.

**Trap 5: Holding a REPEATABLE READ or SERIALIZABLE transaction open for a long time.** Because the snapshot must stay available, PostgreSQL cannot vacuum away old row versions that your transaction might still need to see. A dashboard export or an admin session that holds a REPEATABLE READ transaction for minutes while you paginate through data can bloat tables, bloat indexes, and slow vacuuming for the whole database. Keep those transactions short, or use a cursor, or use `READ COMMITTED` for long read-only analytics and accept that the report is eventually consistent.

**Trap 6: Assuming READ UNCOMMITTED is a performance trick.** In SQL Server or MySQL you might use `READ UNCOMMITTED` to avoid locking overhead for a dirty dashboard. In PostgreSQL the hint does nothing — you still take snapshots and you still pay the same cost. If you added `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED` hoping to speed up a slow query from an ORM, you have changed nothing and the query is still slow because it needs an index or a shorter transaction, not a weaker level.

**Trap 7: Mixing ORM autocommit assumptions with explicit isolation.** Many ORMs and drivers run each statement in its own implicit transaction unless you explicitly begin one. Setting `default_transaction_isolation` globally or per session but then relying on autocommit means each statement still gets its own snapshot anyway, so REPEATABLE READ has no effect. You must actually wrap the sequence in `BEGIN ISOLATION LEVEL ...` on the same connection. A frequent bug is opening a connection from a pool, setting the level on one connection, returning it, then running the real work on a different checkout — the setting is lost. Use `BEGIN TRANSACTION ISOLATION LEVEL ...` as the first statement of the work you want isolated, on the same client checkout you commit on.

## 7. Compare With Related Concepts

**Isolation vs. locking — the one interviewers test together.** Isolation decides what you can see. Locking decides who gets to write and who waits. PostgreSQL defaults to MVCC snapshots for visibility, so readers never block writers and writers never block readers. Locks only appear when you actually try to modify the same row, or when you explicitly ask with `SELECT ... FOR UPDATE`. So you can have high isolation with little locking (SERIALIZABLE still uses snapshots, not table locks) and low isolation with heavy locking (READ COMMITTED with `FOR UPDATE` will lock aggressively). Rule: reach for isolation when the problem is stale or inconsistent reads across multiple statements; reach for explicit locking when the problem is two writers fighting over the same row and you want one to wait instead of failing.

**READ COMMITTED vs. REPEATABLE READ vs. SERIALIZABLE.** READ COMMITTED is a fresh snapshot per statement — cheap, never needs retry except deadlocks, but you can read moving targets. REPEATABLE READ is one snapshot per transaction — stable view within the transaction, but you must handle concurrent-update serialization errors. SERIALIZABLE is one snapshot per transaction plus SSI tracking — truly serial guarantee, but more 40001 aborts to retry under contention. Rule: default to READ COMMITTED. Move to REPEATABLE READ when a single transaction must see a consistent frozen world. Move to SERIALIZABLE when even REPEATABLE READ could let two concurrent transactions together break an invariant.

**Isolation vs. atomicity.** Atomicity means all statements in a transaction commit or none do. Isolation means concurrent transactions do not see each other's half-done work in confusing ways. You need both for correctness — atomicity without isolation still lets double-spends through because each transaction is atomic alone but their reads interleaved. Do not say "we use transactions so we are safe" — say which isolation level you used and how you handle its failures.

**PostgreSQL MVCC snapshot vs. MySQL gap locks.** Both aim to provide REPEATABLE READ without full table locks, but they do it differently. PostgreSQL keeps old row versions and shows you the right version for your snapshot. MySQL's InnoDB holds next-key and gap locks to stop new rows appearing. That difference is why the same isolation name behaves differently, why deadlocks look different, and why PostgreSQL's REPEATABLE READ does not block inserts while MySQL's might. Rule: never answer an isolation question with just the level name. Name the database, because the implementation changes the trade-off.

## 8. 🧠 The Memory Hook

PostgreSQL never lets you see pencil marks — every level hides uncommitted data. READ COMMITTED gives you fresh glasses for every query. REPEATABLE READ gives you one photograph taken when you started. SERIALIZABLE gives you the same photograph but adds a referee who blows the whistle with 40001 and makes you retake the shot if your story couldn't have happened one teller at a time. If you asked for READ UNCOMMITTED, you just got READ COMMITTED with a different label.
