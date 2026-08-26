# What Is a Phantom Read

## 1. The Real-World Problem — When You Actually Hit This

It's 11pm and your finance report job is running. Inside one transaction, it counts all payments above ₹1,000 for August: 412 rows, total ₹9,84,300. Then it joins a few tables, recalculates the total as a sanity check before writing the summary row — same query, same transaction — and gets 414 rows, ₹10,12,800. The job writes a summary that doesn't match its own detail rows. Nobody edited the report. Two new large payments were simply committed by live traffic *between* the two identical queries.

That's a phantom read. You ran the exact same range query twice inside one transaction and got different row sets, because another transaction inserted rows that match your `WHERE` clause in between. It also works in reverse: someone deletes matching rows mid-report and your count shrinks. The data isn't corrupt — each individual read was valid. What broke is your assumption that "same transaction" means "same view of the world."

The reason this deserves interview time is that the fix is not obvious. Locking the rows you already read does nothing — the new rows didn't exist when you took the locks. How databases actually solve this (or don't) differs per engine, and that's exactly where senior answers separate from textbook ones.

## 2. The Analogy — Make the Mechanic Obvious

You're counting people wearing red shirts in a food court. You walk in, count 20, go grab coffee, come back and recount the same food court. Now there are 23. Three more people in red shirts walked in while you were away. None of your original 20 changed — they're all still there, still wearing red. New matching people just appeared. That's the phantom.

Now notice what it would take to guarantee your second count equals your first, because every one of these maps directly to a real database mechanism:

- **Take a photo of the room when you enter, and count from the photo every time.** Your count never changes no matter who walks in. But your photo is stale — if you act on it (walk up to "the person near the door") and they've left, you're acting on outdated reality. That's snapshot isolation.
- **Have a guard lock the entrances against anyone in a red shirt until you finish.** New red shirts physically can't enter, so recounts are safe. But now everyone else queues at the door waiting for you. That's range locking (gap locks).
- **Clear the entire food court so only you are in it until you're done counting.** Perfectly consistent, catastrophically slow during rush hour. That's full serializability taken literally.

One more mapping to lock in: if one of your original 20 had changed their red shirt to blue while you were away, that's a *non-repeatable* read — an existing thing you counted changed under you. New people walking in is the phantom. Different problems, different fixes.

## 3. The Full Explanation — How It Actually Works

A phantom read happens when two identical queries with the same search condition run inside one transaction, and rows that match the condition appear or disappear between them because some other transaction committed an `INSERT` or `DELETE` in between. The row you see the second time was never one you read the first time — hence "phantom." It's about *set membership* changing: how many rows match my predicate?

Here's why ordinary locking doesn't fix it. When your transaction reads rows, most engines either lock those specific rows or give you a private copy (snapshot) of them. Both mechanisms protect things that existed at read time. Neither says anything about a brand-new row committed later that happens to fall inside your range — there was nothing to lock and nothing in your snapshot. To stop phantoms, the engine has to do something extra: lock the *gaps* where such a row could be inserted, freeze your whole view via a snapshot, or detect the conflict when you write.

The SQL standard defines four isolation levels, and by its letter, only the strictest one prevents phantoms:

| Isolation level | Non-repeatable read | Phantom read |
|---|---|---|
| READ UNCOMMITTED | possible | possible |
| READ COMMITTED | prevented | possible |
| REPEATABLE READ | prevented | possible per standard |
| SERIALIZABLE | prevented | prevented |

But the standard is a floor, not a description of real engines. Every major engine handles phantoms differently at REPEATABLE READ, and being precise about this is the senior part of the answer:

**PostgreSQL** uses MVCC snapshots. At REPEATABLE READ, your transaction takes one snapshot at its first query and every read after that sees exactly that snapshot — newly committed rows are invisible, so plain `SELECT`s never show phantoms. The catch is writes: if your transaction tries to `UPDATE` or `DELETE` a row that another transaction modified after your snapshot began, PostgreSQL refuses with `ERROR: could not serialize access due to concurrent update` (SQLSTATE `40001`). So Postgres doesn't silently mix old and new worlds — it makes you retry instead. True `SERIALIZABLE` in Postgres goes further with Serializable Snapshot Isolation, which tracks read-write dependencies and aborts one transaction when their interleaving couldn't have happened serially.

**MySQL InnoDB** defaults to REPEATABLE READ and largely prevents phantoms through two mechanisms. Plain `SELECT`s use consistent non-locking reads from a snapshot established at your first read, so new commits stay invisible. Locking reads (`SELECT ... FOR UPDATE`) and DML (`UPDATE`/`DELETE`) use next-key locks — a lock on the index record plus the gap before it — which blocks other transactions from inserting into your scanned range until you commit. If another session tries, its `INSERT` hangs until your commit, or until it exceeds `innodb_lock_wait_timeout` (default 50s) and fails with error 1205. Caveats worth knowing: in READ COMMITTED, InnoDB disables gap locks (except for foreign-key and duplicate-key checks), so phantoms are back; and gap locking depends on your predicate using an index — a query with no usable index can lock far more than you intended.

**SQL Server** is the engine that behaves most like the textbook: REPEATABLE READ takes shared locks on the rows you read and holds them until commit, which stops existing rows from being modified but does *not* block inserts of new matching rows — phantoms happen. To prevent them you must ask explicitly: `WITH (SERIALIZABLE)` / `WITH (HOLDLOCK)` table hints take key-range locks over the predicate's index range. Alternatively, SNAPSHOT isolation gives you Postgres-style snapshot semantics — no phantoms in reads, update conflicts raise errors.

So the honest summary: the standard says REPEATABLE READ doesn't prevent phantoms, but modern engines mostly do anyway — via snapshots for readers (Postgres, SQL Server SNAPSHOT, InnoDB plain selects) plus range locks for writers (InnoDB next-key locks, SQL Server key-range locks) — and the price you pay shifts from "wrong numbers" to "errors you must retry."

Where does this actually matter? Three production shapes: reports and aggregates computed twice in one transaction while writes continue; "check-then-insert" logic (count matching rows, insert only if zero) where a concurrent insert creates a duplicate the check never saw; and reconciliation jobs whose totals drift from their details. Note the last one is often acceptable — a report being off by transactions that landed mid-run is frequently fine business-wise. Choosing to accept bounded staleness is a legitimate decision; being surprised by it is not.

## 4. See It In Practice — Real Code or Queries

Setup (works in Postgres and MySQL):

```sql
CREATE TABLE payments (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT        NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

INSERT INTO payments (customer_id, amount) VALUES
  (1, 1500.00),
  (2, 2500.00);
-- MySQL note: use DATETIME DEFAULT CURRENT_TIMESTAMP instead of TIMESTAMPTZ
```

**The anomaly — Postgres default (READ COMMITTED).** Two sessions, run interleaved:

```sql
-- Session A (the reporting transaction)
BEGIN;
SELECT count(*), sum(amount) FROM payments WHERE amount >= 1000;
-- count |    sum
--     2 | 4000.00

-- Session B (live traffic)
BEGIN;
INSERT INTO payments (customer_id, amount) VALUES (3, 5000.00);
COMMIT;

-- Session A continues, same transaction, same query:
SELECT count(*), sum(amount) FROM payments WHERE amount >= 1000;
-- count |    sum
--     3 | 9000.00   <- the 5000 payment appeared mid-report
COMMIT;
```

At READ COMMITTED every statement gets a fresh snapshot, so even non-repeatable *and* phantom effects show immediately. This is the default in Postgres, Oracle, and SQL Server (READ COMMITTED variants differ), which means most production systems run at a level where this demo reproduces as-is.

**Fix variant 1 — Postgres REPEATABLE READ (snapshot):**

```sql
-- Session A
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT count(*) FROM payments WHERE amount >= 1000;  -- 2

-- Session B inserts + commits 5000.00 in the meantime...

-- Session A, same transaction:
SELECT count(*) FROM payments WHERE amount >= 1000;  -- still 2
UPDATE payments SET amount = amount * 2 WHERE amount >= 1000;
-- ERROR: could not serialize access due to concurrent update
-- Postgres protects your view, and refuses to let you write on top of a
-- world that moved. The app must retry the transaction (SQLSTATE 40001).
```

**Fix variant 2 — MySQL InnoDB next-key locks (blocking the insert):**

```sql
-- Session A (InnoDB defaults to REPEATABLE READ)
START TRANSACTION;
SELECT * FROM payments WHERE amount >= 1000 FOR UPDATE;
-- Takes next-key locks on the matching records AND the gaps around them
-- in the index used for the predicate.

-- Session B, meanwhile:
INSERT INTO payments (customer_id, amount) VALUES (3, 5000.00);
-- BLOCKS. Sits waiting until Session A commits/rolls back,
-- or fails with ERROR 1205 after innodb_lock_wait_timeout (50s default).
```

Plain (non-locking) `SELECT`s in Session A wouldn't block anyone, but they'd also keep seeing the pre-insert snapshot — InnoDB hides phantoms for readers and blocks them for writers.

**Fix variant 3 — SQL Server needs the hint:**

```sql
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
BEGIN TRAN;
SELECT count(*) FROM payments WITH (SERIALIZABLE) WHERE amount >= 1000;
-- Without the SERIALIZABLE (or HOLDLOCK) hint, REPEATABLE READ here holds
-- shared locks on existing rows but lets Session B's INSERT straight in.
COMMIT;
```

A realistic application shape — making check-then-insert safe:

```sql
-- Node.js + mysql2, booking overlap guard without a unique constraint
const conn = await pool.getConnection();
await conn.beginTransaction();
try {
  // FOR UPDATE matters: a plain SELECT would take no gap locks and a
  // concurrent booking could slip in between this check and our insert.
  const [rows] = await conn.query(
    `SELECT id FROM bookings
      WHERE room_id = ? AND checkout > ? AND checkin < ?
      FOR UPDATE`,
    [roomId, checkin, checkout]
  );
  if (rows.length > 0) throw new ConflictError('Room already booked');
  await conn.query(
    `INSERT INTO bookings (room_id, checkin, checkout, guest_id) VALUES (?, ?, ?, ?)`,
    [roomId, checkin, checkout, guestId]
  );
  await conn.commit();
} catch (err) {
  await conn.rollback();
  throw err;
} finally {
  conn.release();
}
// Better yet: replace the check entirely with a Postgres exclusion
// constraint or a MySQL generated-column unique key, so the DB enforces it.
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a phantom read?**

It's an isolation anomaly where two identical queries with the same `WHERE` clause, run inside a single transaction, return different row sets because another transaction committed inserts or deletes of matching rows in between. Say your transaction counts high-value payments, does some work, then re-counts: if new payments landed in between, the second count includes rows that were never in your first result. The word "phantom" captures the mechanism — the row wasn't hidden or altered, it appeared like a ghost inside your range. Deletes create phantoms too: rows that matched vanish from the second result. The key phrase interviewers listen for is "matching my predicate" — it's about set membership changing, not a value changing.

**Q: What's the difference between a phantom read and a non-repeatable read?**

A non-repeatable read is about the *same row* changing: you read row 42, someone updates or deletes that exact row and commits, you read row 42 again and see a different value or find it gone. A phantom read is about the *set* of rows changing: every row you originally read may be untouched, but new rows matching your condition appeared (or matching rows you hadn't read were deleted). Concretely: `SELECT balance FROM accounts WHERE id = 42` returning 100 then 200 is non-repeatable. `SELECT count(*) FROM orders WHERE status = 'pending'` returning 15 then 18 is phantom. They're fixed at different levels: REPEATABLE READ fixes non-repeatable reads, and per the SQL standard only SERIALIZABLE fully fixes phantoms — which is why they're tested separately.

**Q: Which isolation level prevents phantom reads?**

By the SQL standard, SERIALIZABLE — REPEATABLE READ permits phantoms. Then immediately add the engine truth, because that's the real question behind the question. MySQL InnoDB largely prevents them at its default REPEATABLE READ using next-key (record-plus-gap) locks on locking reads and snapshot reads for plain selects. PostgreSQL's REPEATABLE READ gives you a stable snapshot, so reads never see phantoms, and write conflicts surface as serialization errors you must retry. SQL Server genuinely allows phantoms at REPEATABLE READ and requires the `SERIALIZABLE`/`HOLDLOCK` hint for key-range locking. So: "standard says SERIALIZABLE; in practice know what your engine does and what errors it hands you instead."

**Q: Why doesn't locking the rows I've already read prevent phantoms?**

Because locks protect things that exist, and the phantom didn't exist when you locked. If your transaction takes shared or exclusive locks on the 20 rows returned by your first query, those 20 rows are safe from modification. Nothing about those locks constrains another transaction inserting a brand-new row into the range — there's no row there to conflict with. Preventing that requires the engine to lock the *space* where the new row would go (gap/next-key/key-range locks) or to freeze your entire view with a snapshot. This is the core insight of the whole topic: phantoms are an insertion problem, and row locks are not insertion defenses.

**Q: How does MySQL InnoDB avoid phantoms at REPEATABLE READ when the standard says it shouldn't?**

Two mechanisms working together. For locking reads (`FOR UPDATE`/`FOR SHARE`) and DML, InnoDB uses next-key locks: each entry in the scanned index gets a record lock plus a gap lock covering the interval before it, so any `INSERT` that would land inside your scanned range has to wait for your transaction to end. For plain `SELECT`s, InnoDB uses consistent non-locking reads backed by undo logs — your transaction pins itself to the snapshot from its first read, so rows committed later are invisible rather than blocking anyone. Caveats that make the answer senior-grade: in READ COMMITTED, gap locks are disabled (except FK/duplicate-key checks), so phantoms return; and gap locking rides on indexes, so a predicate with no usable index can lock vastly more than intended or scan-lock the whole table.

**Q: How do MVCC snapshot databases handle phantoms without locking readers?**

They sidestep reads-side anomalies entirely: your transaction reads from one immutable snapshot (Postgres REPEATABLE READ takes it at the first statement; SQL Server SNAPSHOT similar), so concurrently committed inserts simply aren't visible to you. No read ever shows a phantom, and readers never block writers or vice versa. The cost moves to writes: if you try to modify a row that changed after your snapshot began, the engine detects the conflict and aborts your transaction — Postgres raises SQLSTATE 40001, SQL Server raises an update-conflict error — and correctness becomes your retry loop. And be careful with one claim: snapshot isolation is not serializability. It prevents read anomalies, but write-skew patterns can still pass; Postgres' true SERIALIZABLE adds dependency tracking to catch those too.

**Q: Where does a phantom read actually bite you in a real backend?**

Three recurring shapes. One: reporting and aggregation jobs that compute totals more than once per transaction while traffic keeps inserting — your summary won't reconcile with its own details. Two: check-then-insert guards — "select matching rows; if none, insert" — where two requests can both observe zero matches and both insert; classic duplicate-booking/duplicate-registration bugs. Three: batch processing that paginates or iterates a filtered set while the set changes underneath, causing skipped or double-processed items. The common thread is that you drew a conclusion from one query and acted on it later, trusting the set stayed put.

**Q: Does READ COMMITTED protect me from anything here?**

Almost nothing relevant to this anomaly — it's weaker than REPEATABLE READ, not stronger. Each statement gets its own fresh snapshot, so even the same row can change between two statements in your transaction, and phantoms appear just as easily. It's the default in Postgres, Oracle, and SQL Server's default mode, which means the typical production system runs exactly where this problem lives. Its appeal is real though: short lock hold times, no serialization errors, high throughput. The engineering move is deciding per workload — accept it and design checks accordingly, or escalate isolation deliberately for the few transactions that need it.

**Q: How would you test for phantom-read behavior?**

Deterministically, with two clients and explicit sequencing — never by hoping timing lines up in a test. Open two real connections (integration test against the actual engine, not SQLite, since behavior is engine-specific): begin transaction A, run the range query, pause A at a barrier; run B's insert and commit; release A, run the identical query again, assert on the result. Assert what matches your chosen level: at READ COMMITTED expect the count to change; at Postgres REPEATABLE READ expect it frozen and expect a 40001 if A tries a conflicting write; with InnoDB `FOR UPDATE` expect B's insert to block until A ends (bound the wait with `innodb_lock_wait_timeout` or assert on lock-wait state). Also test the retry path itself — inject a serialization failure and verify the transaction replays cleanly, because that loop is now part of your correctness story.

**Q: What would you monitor in production to catch this class of problem?**

You can't grep for "phantom read" — it leaves no single log line — so you monitor its fingerprints. On Postgres: rates of SQLSTATE 40001 serialization failures (a healthy retry loop shows up here; a missing one shows up as user-facing 500s), and long-running idle-in-transaction sessions that stretch snapshot age. On MySQL: lock wait timeouts (error 1205), `data_locks`/`innodb_lock_waits` during incidents, and transactions with long durations holding gap locks. Everywhere: reconciliation metrics — if a nightly job compares totals across sources, alert on mismatch, because unexplained drift is how phantoms surface in the wild. And log transaction duration alongside the business operation so you can correlate a bad report with concurrent write volume at that timestamp.

**Q: How does this affect the API/frontend contract?**

Subtly but really. A list endpoint computing `items` in one query and `total_count` in another within the same request can return pages whose totals don't cover their contents when writes interleave — users see "247 results" with 245 rows. A booking UI built on check-then-insert can double-confirm if two requests race. The frontend-facing fixes are usually backend ones: compute count and page from one snapshot (single query or one REPEATABLE READ transaction), enforce uniqueness in the schema rather than in app logic, and map serialization failures to safe responses (retry server-side, or a clean 409/Retry-After) instead of letting them bubble up as 500s.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: "We're on REPEATABLE READ, so our check-then-insert is race-free."**
Why people believe it: the name sounds like it guarantees repeatability of everything, and on MySQL it's the default so nobody ever chose it consciously. Why it's wrong: the standard's REPEATABLE READ permits phantoms, and even engines that stabilize your *reads* don't coordinate your *writes* unless locks or conflict detection are in play. What actually happens: two requests both select zero matching rows, both insert, you ship duplicates; on Postgres the second writer may get a 40001 your code never retries. Fix: enforce it in the schema (unique/exclusion constraints) where possible; otherwise take explicit locks (`FOR UPDATE`) knowing InnoDB will gap-lock the range while Postgres will hand you conflicts to retry.

**Trap 2: Confusing phantom read with dirty read.**
Wrong assumption: "phantom = I saw data I shouldn't have," lumping it with dirty reads. Reality is the opposite direction: a dirty read shows *uncommitted* data that might roll back out of existence — reading garbage. A phantom read involves fully *committed*, legitimate data that arrived inside your range between two of your own reads — the data is fine, your consistency assumption isn't. Fix: anchor on commit status. Dirty = never-committed visible too early (only READ UNCOMMITTED). Phantom = committed, appearing/disappearing across your identical queries.

**Trap 3: Treating snapshot isolation as serializable.**
Wrong assumption: "my reads are repeatable, therefore my transaction behaves as if it ran alone." Snapshots only fix what you *see*. What actually happens: your transaction reads a set, makes a decision, writes based on it — meanwhile a conflicting transaction did the same — Postgres aborts you with 40001 at write time, or worse, on engines without conflict detection you get write skew. The deeper miss: snapshot isolation doesn't track read-write dependencies, which is exactly what serializability requires. Fix: retry on serialization failures as designed behavior, and reach for true SERIALIZABLE when decisions depend on reads staying valid.

**Trap 4: Relying on gap locks while ignoring indexes and isolation settings.**
Wrong assumption: "InnoDB REPEATABLE READ always gap-locks my range." Gap locks attach to entries of the index your query actually uses. What actually happens: with no usable index, InnoDB scans and effectively locks every record and gap it touches — sudden cluster-wide lock contention from one sloppy query; and if someone flipped the session to READ COMMITTED (common for batch jobs to reduce lock pressure), gap locks are off entirely and your safety net vanishes silently. Fix: verify the predicate's index in the explain plan, pin the isolation level explicitly per transaction rather than trusting defaults, and load-test the locking path.

**Trap 5: Solving phantoms by making everything SERIALIZABLE.**
Wrong assumption: "correctness knob goes to max, done." What actually happens: under concurrency, serialization failures and lock waits spike, throughput craters, and now you're paging on 40001 storms instead of wrong totals. Fix: scope strictness narrowly — SERIALIZABLE or range locks only for the few transactions whose conclusions must hold (booking guards, reconciliations); snapshot reads or even READ COMMITTED with schema-enforced invariants everywhere else; keep transactions short so conflicts are rare; treat retries as a first-class code path, not an error.

## 7. Compare With Related Concepts

**Phantom read vs [non-repeatable read](what-is-non-repeatable-read.md):** non-repeatable is the *same row* changing value (or that one row disappearing) between your two reads; phantom is the *set of matching rows* changing because new rows appeared or other matching rows were deleted — every row you originally saw may be untouched. Rule of thumb: value of a row you held changed → non-repeatable; membership of the result set changed → phantom.

**Phantom read vs [dirty read](what-is-dirty-read.md):** dirty read shows another transaction's *uncommitted* data, which may roll back and never have existed — a correctness violation of what's real; a phantom read involves properly committed data that merely arrived mid-flight in your range — nothing unreal was shown, your two views just disagree. Rule: dirty = saw data that was never safely committed; phantom = saw committed data your earlier query couldn't know about.

**Phantom read vs MVCC snapshot semantics:** snapshots (Postgres REPEATABLE READ, SQL Server SNAPSHOT, InnoDB consistent reads) eliminate phantoms from *reads* by freezing one version of the world, but they don't coordinate writers — conflicting writes turn into serialization/update-conflict errors, and read-write-dependent conclusions can still be wrong unless the engine tracks them (true SERIALIZABLE). Rule: the snapshot protects what you see; serializability protects what you conclude from it.

**Phantom prevention vs [pessimistic locking](what-is-pessimistic-locking.md):** row locks alone can't stop inserts into a range; preventing phantoms pessimistically needs *range* locks (InnoDB next-key, SQL Server key-range), which trade concurrency for certainty by blocking unrelated inserts. Rule: guarding existing rows → row locks; guarding a predicate's future → range locks or snapshots-with-retries.

All of these sit inside the bigger frame of [transaction isolation levels](what-is-isolation-level.md) — phantoms are simply the top rung of the anomaly ladder that each level claims or concedes.

## 8. 🧠 The Memory Hook

Non-repeatable read: the person you counted changed their shirt. Phantom read: new people walked in wearing the shirt you're counting. Row locks guard people already in the room — only snapshots (your photo), gap locks (the guarded door), or clearing the hall (SERIALIZABLE) stop newcomers; and Postgres won't lie to you, it'll just refuse the write and make you retry.
