# What Is a Non-Repeatable Read

## 1. The Real-World Problem — When You Actually Hit This

It's 2 a.m. and your payouts job is doing its nightly run. For each pending payout it opens a database transaction, reads the row for payout #42, and sees an amount of $950. Then it calls the bank's API to move the money — that call takes a few seconds. Before marking the payout done, the job re-reads the same row to write the audit entry. This time it gets $1,050.

What happened in those few seconds? A finance manager spotted a typo earlier that day, changed the amount from $950 to $1,050, and hit save. Her update committed right between your job's two reads. Same row, same transaction, two different values.

Your job already decided to pay $950 based on the first read. The audit table now claims $1,050 went out. Reconciliation is off by a hundred dollars, and the morning standup is about your "buggy" job — even though every single thing the database did was completely legal.

That gap — reading the same row twice inside one transaction and getting different values, because another transaction committed an update to that row in between — is a **non-repeatable read**. It's not corruption. It's not a bug in your SQL. It's the intended behavior of the isolation level your database is running at. Whether it can happen to you depends entirely on that setting, so let's build the mental model.

## 2. The Analogy — Make the Mechanic Obvious

Your company runs on one giant shared spreadsheet. But here's the thing: you never look at the live screen. Anytime you need a number, you print the sheet and read from your paper copy.

The office has two standing rules:

1. **You can only print what's been saved.** If someone has typed an edit but hasn't hit Save yet, their half-done work simply does not exist as far as your printout is concerned. This is why dirty reads don't happen in serious databases — uncommitted changes are invisible, period.
2. **Printouts are frozen.** Once your paper is in your hands, later saves don't magically rewrite it.

Now, *when* you're allowed to print — that's the isolation level.

Under the **"fresh print before every look"** policy (READ COMMITTED), you walk to the printer each time you want to check anything. Finance hits Save between your two trips to the printer, and your two papers disagree. That's the non-repeatable read. This policy only ever promised you: "everything on your paper was saved at print time." It said nothing about the paper staying true tomorrow, or ten seconds later.

Under the **"one print per task"** policy (REPEATABLE READ), you print once when you start and work from that paper until you finish. Finance's save lands after your printout exists, so it's invisible to you. Both your looks agree. Your little world stayed consistent.

And the printer room has a quiet hero that makes this cheap: it keeps old versions of the sheet around instead of shredding them, so your frozen printout stays readable while everybody else works from newer versions. That's exactly what a database's multi-version storage (MVCC) does — it archives old row versions instead of forcing you to lock the live sheet.

One last office rule: sometimes *you* need to make the change, and a paper isn't good enough. So you walk to the screen, put your finger physically on the cell so nobody else can edit it, and read the live saved value. That's `SELECT ... FOR UPDATE` — it skips the printout entirely, reads the latest committed value, and locks the row.

## 3. The Full Explanation — How It Actually Works

Here's the raw sequence, stripped of everything else:

```txt
T1: BEGIN
T1: SELECT amount FROM payouts WHERE id = 42      -- reads 950
T2: UPDATE payouts SET amount = 1050 WHERE id = 42
T2: COMMIT                                        -- T2's change is now permanent
T1: SELECT amount FROM payouts WHERE id = 42      -- reads ???
T1: COMMIT
```

Everything hinges on what T1's second SELECT is allowed to see.

At **READ COMMITTED**, the database's only promise is: every value you read was committed at the moment you read it. Internally, most engines implement this by giving *each statement* its own fresh snapshot of the data. T1's first SELECT ran against a world where the amount was 950. T1's second SELECT ran against a world where T2 had already committed 1050. Different statements, different snapshots, different answers. Perfectly legal — the promise was never broken.

At **REPEATABLE READ**, the promise upgrades to: once you've read a row inside your transaction, re-reading it returns the same values, no matter what anybody else commits in the meantime. Engines deliver this by taking *one* snapshot at the start of your transaction (technically at your first data-reading statement) and reusing it for every read until you commit or roll back. T2's committed update lands in newer versions of the row — versions your snapshot simply doesn't cover.

So how is this cheap? Because of **MVCC — multi-version concurrency control**. Instead of locking rows so nobody can change them while you read (which would murder concurrency), the engine keeps multiple versions of each row side by side:

- **PostgreSQL** stores every row version with the ID of the transaction that created it and the ID of the transaction that superseded it. Deciding what your query sees is just a visibility check against your snapshot: "is this version's creator committed, and is it visible from my point in time?"
- **MySQL's InnoDB** keeps the current row in the table plus older versions reconstructed on demand from the undo log. Your transaction holds a "read view" — essentially the same list — built at your first plain SELECT.

Either way, plain reads take **zero locks**. Readers never block writers, writers never block readers. T2 didn't wait for your payouts job; it updated and committed freely. You just never saw it. The price is storage: old versions must be kept alive as long as *any* open snapshot might need them, and cleanup (VACUUM in Postgres, the purge thread in InnoDB) can't reclaim them until you finish. Long transactions are what make MVCC expensive.

Where the SQL standard levels land:

| Isolation level | Dirty read | Non-repeatable read | Phantom rows |
|---|---|---|---|
| READ UNCOMMITTED | possible | possible | possible |
| READ COMMITTED | prevented | possible | possible |
| REPEATABLE READ | prevented | prevented | possible per the standard* |
| SERIALIZABLE | prevented | prevented | prevented |

\* The standard permits phantoms at REPEATABLE READ, but real engines mostly prevent them too: Postgres implements RR as snapshot isolation (its plain SELECTs can't see newly inserted rows either), and InnoDB largely blocks phantoms with next-key locking. The details differ per engine, which is exactly why "which database, which level" matters in interviews.

Defaults matter enormously here: **PostgreSQL runs at READ COMMITTED by default** — so yes, this anomaly is possible in vanilla Postgres out of the box. **MySQL's InnoDB defaults to REPEATABLE READ** — so by default it won't happen to you there. Same app code, different database, different exposure.

## 4. See It In Practice — Real Code or Queries

Reproduce it in two terminal windows. Environment: PostgreSQL, whose default level is READ COMMITTED.

**Demo 1 — trigger the anomaly at READ COMMITTED:**

```sql
-- Session A
BEGIN;
SELECT amount FROM payouts WHERE id = 42;   -- returns 950.00

-- Session B, while A is still open:
-- UPDATE payouts SET amount = 1050 WHERE id = 42;
-- COMMIT;

-- Back in Session A:
SELECT amount FROM payouts WHERE id = 42;   -- returns 1050.00 ← non-repeatable read
COMMIT;
```

Session A did nothing wrong. The level simply handed each statement its own snapshot.

**Demo 2 — kill it with REPEATABLE READ (and meet the surprise waiting inside):**

```sql
-- Session A
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT amount FROM payouts WHERE id = 42;   -- returns 950.00; snapshot taken HERE

-- Session B updates the row and commits again.

SELECT amount FROM payouts WHERE id = 42;   -- still 950.00. Stable.
SHOW transaction_isolation;                 -- confirms: repeatable read

-- But now Session A tries to write to that same row:
UPDATE payouts SET status = 'processing' WHERE id = 42;
-- ERROR: could not serialize access due to concurrent update
```

That error is snapshot isolation doing its real job: Postgres refuses to let A overwrite a row that changed after A's snapshot, because A would be silently clobbering B's update (a lost update). The application's fix is to roll back and retry the transaction — a pattern you should be able to describe unprompted in an interview.

**Demo 3 — MySQL/InnoDB specifics:**

```sql
-- MySQL 8, InnoDB. RR is the default, so the anomaly is already off:
SELECT @@transaction_isolation;              -- REPEATABLE READ

START TRANSACTION WITH CONSISTENT SNAPSHOT;  -- pin the snapshot NOW,
                                             -- not at your first SELECT
SELECT amount FROM payouts WHERE id = 42;    -- 950.00

-- A locking read deliberately leaves the snapshot and reads the
-- latest committed value, locking the row while we're at it:
SELECT amount FROM payouts WHERE id = 42 FOR UPDATE;  -- 1050.00, row locked
COMMIT;
```

Notice the last query: even at REPEATABLE READ, a locking read shows you the newest committed data. That combination — plain SELECTs from the snapshot, locking reads from reality — is a genuine InnoDB behavior, not a contradiction, and it trips people constantly (see the traps below).

## 5. Interview Questions — All of Them, Done Properly

**Q: Walk me through what a non-repeatable read actually is.**

Inside one transaction, you read a row, and later in the same transaction you read the exact same row again — and get a different value. That can only happen if some other transaction updated that row and committed between your two reads. The key ingredients are: same row, same transaction of yours, and an intervening *committed* update by someone else. It's called "non-repeatable" because the read literally failed to repeat itself. A concrete example sells it: your job reads a payout of $950, a finance edit to $1,050 commits mid-flight, your re-read sees $1,050, and your audit log now disagrees with the payment you actually sent.

**Q: Which isolation levels allow it, and which prevent it?**

Per the SQL standard, READ UNCOMMITTED and READ COMMITTED allow non-repeatable reads; REPEATABLE READ and SERIALIZABLE prevent them. READ COMMITTED only guarantees you never see uncommitted data — each statement gets a fresh view of the world, so the ground can shift between your statements. REPEATABLE READ pins one view for the whole transaction. One nuance worth volunteering: the defaults differ by engine — Postgres defaults to READ COMMITTED (anomaly possible by default), MySQL InnoDB to REPEATABLE READ (not possible by default). Naming the defaults is the fastest way to show you've actually run these systems.

**Q: How do databases prevent it without locking everything?**

MVCC. Rather than freezing rows with locks, the engine keeps multiple versions of each row. Your transaction holds a snapshot — in Postgres, a fixed point taken at your first statement under REPEATABLE READ; in InnoDB, a read view built at your first plain SELECT — and every read filters versions through that snapshot's visibility rules. Other transactions keep updating and committing into newer versions that you simply never see. Plain reads take no locks at all, so readers and writers never block each other. The cost is deferred cleanup: old versions stay alive until your transaction ends, which is why marathon transactions cause table bloat in Postgres and a growing history list in InnoDB.

**Q: Does REPEATABLE READ stop other transactions from updating the row?**

No — and confusing this is a red flag. REPEATABLE READ changes what *you see*, not what *they can do*. Other transactions can update and commit that row freely while yours is open; you just keep seeing the old version. There's no lock on plain reads in Postgres or InnoDB. The collision only surfaces when *your* transaction tries to write to a row that changed since your snapshot — Postgres rejects that write with a serialization error to prevent a lost update, and InnoDB's UPDATE operates on the latest committed version (blocking on locks where needed). Repeatable reads are about your view, not your authority.

**Q: How is this different from a dirty read and a phantom read?**

All three are anomalies about *what your reads show*, but they differ in what moved. A dirty read is seeing data another transaction has written but *not committed* — if it rolls back, you read information that never officially existed. A non-repeatable read only ever involves committed data: it was real both times, it just changed between your looks. A phantom read isn't about one row's value at all — it's about a *set*: you run the same filtered query twice and rows appear or disappear because another transaction inserted or deleted rows matching your predicate and committed. Quick self-test: same row, different value → non-repeatable read. Same query, different membership of results → phantom.

**Q: How would you demonstrate this live in an interview?**

Two psql or mysql sessions. Session A: `BEGIN`, select a row, note the value. Session B: update that row, `COMMIT`. Session A: select again. On default Postgres you'll see the new value — anomaly demonstrated. Then rerun with `BEGIN ISOLATION LEVEL REPEATABLE READ` and show the second select returning the original value, and optionally show the serialization error when A tries its own update. Being able to run this from muscle memory beats reciting the definition, and it naturally leads the interviewer toward MVCC, which is where the senior-level conversation lives.

**Q: When would you deliberately stay at READ COMMITTED despite this exposure?**

When transactions are short and each decision rests on a single read, the window for a mid-transaction commit is milliseconds and the anomaly is theoretical. READ COMMITTED is also friendlier operationally: it never throws Postgres's `could not serialize access` retry-errors at you the way REPEATABLE READ can when writes collide, so you avoid building retry loops. Most CRUD apps with per-request transactions are fine there. Reach for REPEATABLE READ when one transaction reads the same data more than once and *acts on the relationship between those reads* — reporting over multiple tables, reconciliation jobs, anything where internal consistency of one pass matters. And whatever you choose, keep the transaction short so the snapshot cost stays trivial.

## 6. The Traps — What Goes Wrong in Production

**"REPEATABLE READ locks the rows I read, so nobody can change them."**
Wrong assumption, and the most common one. People picture RR as holding read locks until commit, like an old textbook diagram. Real engines don't: MVCC gives you a private snapshot instead, so other transactions happily update and commit your rows while you read them. What actually happens: your reads stay stable, the world moves on, and the only friction appears when your transaction writes to a changed row — Postgres throws a serialization error, InnoDB updates the latest version. The fix is conceptual: say "my view is frozen," never "the rows are frozen," and design for retry-on-conflict when you write.

**Mixing plain SELECTs with SELECT ... FOR UPDATE inside one InnoDB transaction.**
The assumption: "I'm at REPEATABLE READ, so every read in this transaction agrees with every other read." Not with locking reads in the picture. `FOR UPDATE` is a current read — it bypasses your read view entirely and fetches the latest committed row, locking it. So within one RR transaction, a plain SELECT says 950 and the very next `FOR UPDATE` says 1050. Nothing is broken; the two read types have different contracts. The fix: know that InnoDB has snapshot reads (plain SELECT) and current reads (FOR UPDATE / FOR SHARE, and also UPDATE/DELETE), and don't build logic that assumes they agree mid-transaction.

**Assuming the snapshot is taken at BEGIN.**
People believe the moment you type `START TRANSACTION`, your consistent view is pinned. In InnoDB, the read view is created at your first *read*, not at BEGIN; in Postgres, at your first data-reading statement. Usually harmless — until it isn't: you begin a transaction, another process commits a big change, your first SELECT runs afterward and includes changes you assumed were "after your snapshot." Tools care about this precisely: `mysqldump --single-transaction` issues `START TRANSACTION WITH CONSISTENT SNAPSHOT` explicitly to pin the view at a known instant. The fix: when the exact boundary moment matters, take the snapshot deliberately instead of letting the first read define it.

**Long-running transactions on top of MVCC.**
The assumption: "snapshots are free, so I'll keep this analytics transaction open all afternoon." Every version your snapshot might need must be preserved — Postgres can't VACUUM away dead tuples your transaction could theoretically still see, and InnoDB's undo history grows. What actually happens: table and index bloat, slower scans everywhere (even for unrelated sessions in Postgres), and in extreme cases a full database stall. The fix is boring and absolute: keep transactions short. Snapshot isolation is a loan, and interest accrues by the minute.

**Answering as if non-repeatable reads involve uncommitted data.**
Interviewers hear this constantly: "a non-repeatable read is when you read data that wasn't committed yet." That's the definition of a *dirty read*. If your first answer conflates them, the follow-ups get harder, because the interviewer now has to recalibrate everything else you say. The clean separation: dirty read = the source transaction hadn't committed (and might roll back); non-repeatable read = the interfering transaction fully committed, and your problem is purely that your second look disagrees with your first. Bonus nugget that lands well: in Postgres, READ UNCOMMITTED is literally an alias for READ COMMITTED — dirty reads cannot happen there at all — whereas InnoDB really does expose uncommitted data at READ UNCOMMITTED.

**"My ORM wraps everything, so transaction boundaries are handled."**
The assumption: frameworks make this someone else's problem. What actually happens: most ORMs run in autocommit by default — every statement is its own micro-transaction at READ COMMITTED, so there's no "repeat" to fail. The danger arrives the moment someone slaps `@Transactional` (or an equivalent) on a method that reads, calls a slow external API, then reads again — recreating the payouts-job story exactly, now hidden behind a decorator. The fix: always know where your transaction begins and ends, and treat "multiple reads inside one transaction" as a design decision, not boilerplate.

## 7. Compare With Related Concepts

**Versus a dirty read.** A dirty read shows you data another transaction has written but *not yet committed* — if that transaction rolls back, you acted on facts that never existed. A non-repeatable read only involves committed changes; the pain is that your own transaction contradicts itself across two looks. One-line rule: dirty read = you saw something that may never have been real; non-repeatable read = everything you saw was real, it just moved.

**Versus a phantom read.** A non-repeatable read is about one specific row whose *value* changed between two reads in your transaction. A phantom read is about a *set of rows*: you run the same predicate query twice and the membership changes — new rows appear or old rows vanish, because another transaction inserted/deleted matching rows and committed. One-line rule: same row, different value → non-repeatable; same query, different rows → phantom.

**Versus a lost update.** Adjacent but distinct, and worth offering proactively: a lost update happens when two transactions both read a value, compute a new one, and write it back — the second write silently erases the first. REPEATABLE READ (as implemented by Postgres and InnoDB) is exactly what protects you here: Postgres converts the conflict into a serialization error you must retry; InnoDB's UPDATE reads the latest committed version under lock instead of your stale snapshot. One-line rule: if you read-then-write a row across a long transaction, you're relying on REPEATABLE READ semantics whether you know it or not.

## 8. 🧠 The Memory Hook

One transaction reads the same row twice and gets two different answers — that's a non-repeatable read, meaning somebody committed an update to that row between your looks. READ COMMITTED hands you a fresh snapshot for every statement, so reality can shift beneath you; REPEATABLE READ hands you one snapshot for the whole trip, and MVCC makes that nearly free — old row versions just stay archived instead of anyone taking locks.
