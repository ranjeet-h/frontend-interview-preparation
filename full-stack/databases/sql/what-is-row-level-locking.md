# What Is Row-Level Locking

## 1. The Real-World Problem — When You Actually Hit This

It's Black Friday eve. Your e-commerce app has been healthy for months. Then someone runs the nightly repricing job — one innocent-looking statement:

```sql
UPDATE products SET price = ROUND(price * 0.90, 2) WHERE clearance = 1;
```

Two minutes later the whole app is frozen. Product pages time out. Cart updates hang. Checkout fails. Support tickets pile up. And here's the confusing part: most customers were buying *different* products. Why did one bulk update stop everyone?

Because that statement ended up claiming essentially **every row** in the products table. Either the `clearance` column had no index, so the engine had to scan and lock every row it looked at — or the engine gave up on tracking thousands of individual locks and locked the entire table outright (more on which engines do that later). Either way, one background job turned the hottest table in your system into a single-file line.

Row-level locking is the feature that was supposed to prevent exactly this: the ability for thousands of users to write to *different* rows of the *same* table simultaneously, without queueing behind each other. It's why your OLTP database can handle a checkout storm at all. But as the story above shows, having row-level locking and *getting* row-level locking are different things — one bad query shape and the granularity quietly collapses back to "everything is locked."

Interviewers love this topic because it sits right between theory and outage postmortems. They're checking whether you understand what actually gets locked, when, for how long — and why "we use InnoDB, so we have row locks" is only half an answer.

## 2. The Analogy — Make the Mechanic Obvious

Think of a big hotel. The building is your table. Each room is a row.

When housekeeping repaints room 402, they hang a **"do not disturb" sign on door 402 only**. Guests checking into rooms 407, 512, and 388 don't even notice — life continues for everyone except whoever wanted that one specific room. That's the entire value proposition of row-level locking: your write claims *only the rooms it touches*, and everyone else checks out, checks in, and rearranges furniture in parallel.

Now the variations, because each one maps to something real:

**Shared locks** are two quality inspectors in the same room. Both want to *look* and take notes, and looking together is harmless — so both get in. But neither will tolerate the painter starting work while they're inside. Many readers can hold shared locks on the same row at once; a writer has to wait for all of them to leave.

**Exclusive locks** are the painter alone in the room. One at a time, no inspectors allowed, nobody else in. An `UPDATE` hangs this sign; so does `SELECT ... FOR UPDATE`.

**Table-level locking** is a hotel whose policy is: *if any room is being cleaned, close the entire entrance*. Absurd for a hotel, but that's literally how MyISAM works — and how SQLite works at the whole-database level. Every operation queues behind every other operation, even for totally unrelated rooms.

**Lock escalation** is a manager's cost-cutting policy. Hanging 5,000 little signs costs staff time and materials, so if housekeeping ends up working on thousands of rooms at once, the manager says: forget the individual signs, just hang *one banner across the main entrance*. Cheaper to administer — but now the whole hotel is closed, including the 400 rooms nobody was touching. That's SQL Server. InnoDB is the rival hotel that prints microscopic stickers costing essentially nothing per door, so it never needs the banner — and pays its bill differently, as you'll see next.

**The unindexed predicate** is housekeeping being told "clean every messy room" — with no list of which rooms are messy. She has to knock on *every door in the building*, hang a temporary hold-sign while she peeks inside, and move on — including the hundreds of rooms she decides are fine. One vague instruction, building-wide gridlock. That's `WHERE` on a column with no index in MySQL.

**The deadlock** is two cleaners: one holds keys to rooms 1–2 and needs room 3; the other holds room 3 and needs room 1. Neither will let go first. Security resolves it by voiding one cleaner's work order entirely — taking her keys back, restarting her route later — so the other can finish. More doors being worked at once means more chances for two routes to tangle.

## 3. The Full Explanation — How It Actually Works

The core mechanic is simple: when a statement touches a row inside a transaction, the engine writes down *"transaction T claims row R"* and keeps that claim until the transaction ends. Any other transaction wanting to modify that same row waits; anyone wanting a different row proceeds instantly. Locks are held until `COMMIT` or `ROLLBACK` — not until the statement finishes. That last part matters enormously: a statement takes half a millisecond, but a transaction that started ten seconds ago still holds every lock it acquired along the way.

Where do these locks come from? Three places:

First, **every write takes exclusive row locks**. `INSERT`, `UPDATE`, `DELETE` — each marks the rows it touches as claimed-for-writing. Nobody else may write those rows, or explicitly lock them for reading, until you commit.

Second, **reads usually don't lock anything at all**. This surprises people. Modern engines (InnoDB, PostgreSQL) use MVCC — multi-version concurrency control — where plain `SELECT`s read a snapshot of recently committed data instead of waiting for writers. Your report query doesn't block, and isn't blocked by, the checkout transaction running next to it. Writers keep the old version around precisely so readers never need to queue.

Third, **you can ask for a lock on purpose**, when reading isn't enough — when you need the guarantee that a row won't change between your read and your subsequent write. `SELECT ... FOR UPDATE` takes an exclusive lock (the painter's room: nobody else reads-to-write or writes it until you're done). `SELECT ... FOR SHARE` takes a shared lock (the inspectors' room: others may share the read-lock, writers must wait; older MySQL called this `LOCK IN SHARE MODE`, PostgreSQL adds flavors like `FOR NO KEY UPDATE`). This is the mechanism behind [pessimistic locking](what-is-pessimistic-locking.md) — the read-modify-write pattern for inventory decrements and balance debits.

So the lock types form a simple compatibility grid: many **shared** locks coexist happily; a **shared** lock blocks any **exclusive** lock; an **exclusive** lock blocks everything. And remember the exception — none of this affects *plain* `SELECT`s under MVCC, which sail past uncommitted writers seeing the old committed version.

Which engines actually deliver row-level locking? InnoDB (MySQL's default engine), PostgreSQL, Oracle, and SQL Server do. MyISAM (the old MySQL default) offers only table locks. SQLite locks the *entire database* for one writer at a time — there are no row locks to be had, period. Knowing which one you're on is step zero of every debugging session.

Now the escalation split, which is the sharpest interview differentiator. Every individual lock costs the server memory — roughly a hundred bytes apiece in SQL Server. If one statement updates 500,000 rows, half a million lock entries start adding up to real RAM. So **SQL Server counts**: once a single statement accumulates roughly five thousand locks on one table, it throws away all the fine-grained locks and replaces them with **one table lock**. Memory saved — but the side effect is brutal: a statement touching 0.25% of the rows now blocks *everyone*, exactly like our opening incident. (Since SQL Server 2016 it may escalate to a partition instead, if the table is partitioned.)

**InnoDB never escalates. Ever.** Its trick: lock information lives as tiny bits attached to the index records themselves, so the marginal cost of locking a million rows is negligible compared to locking one. No manager ever needs the banner. But the bill doesn't vanish — it moves. Thousands of fine-grained locks create thousands of opportunities for two transactions to hold what the other needs, which is why **deadlock risk rises with the number of locks you take**. InnoDB detects the cycle, picks the transaction that did less work as the victim, rolls it back with error 1213, and expects your application to retry. There's a full treatment of the circle-of-waits on the [deadlock](what-is-deadlock.md) page. On top of that, InnoDB at its default REPEATABLE READ isolation adds **gap locks** — it locks not just matching rows but the empty spaces between them, preventing phantom inserts into ranges you're actively using. Powerful for correctness, notorious for surprise contention; the deep dive lives on the [gap lock](../mysql/what-is-gap-lock.md) page.

And that brings us to the trap from the opening story, stated precisely: **in MySQL, the rows you lock are the rows your query *visits*, not the rows it changes.** InnoDB implements row locks on index records, so it finds target rows by walking an index. If your `WHERE` clause has no usable index, the walk covers every row in the table — and every visited row gets locked (plus gaps, at REPEATABLE READ) until you commit. An update matching 50 rows can pin a 2-million-row table for the duration of your transaction. At READ COMMITTED, InnoDB softens this by releasing locks on rows that turn out not to match; at the default REPEATABLE READ, they're all held. The fix is the same either way: index the column you filter on, so the engine seeks straight to the 50 rooms it actually needs to enter.

The overall trade-off ledger: row-level locking buys maximum write concurrency and charges you lock-management bookkeeping, a larger deadlock surface, and the discipline of short transactions with predictable access paths. Coarser locking flips the deal — simpler internals and no deadlock detection needed (a table lock can't participate in a subtle cycle the way a web of row locks can), at the price of serializing unrelated work. Bulk jobs that legitimately touch huge fractions of a table often belong *outside* peak hours precisely because fine-grained locking's benefits evaporate at that scale.

## 4. See It In Practice — Real Code or Queries

**Example 1 — prove the granularity in MySQL (two terminals against the same InnoDB table):**

```sql
CREATE TABLE inventory (
  sku       VARCHAR(32) PRIMARY KEY,
  available INT NOT NULL
);
INSERT INTO inventory VALUES ('TS-BLUE-M', 100), ('TS-GREEN-L', 50);
```

Session A claims one row and stays uncommitted:

```sql
BEGIN;
SELECT available FROM inventory WHERE sku = 'TS-BLUE-M' FOR UPDATE;
UPDATE inventory SET available = available - 1 WHERE sku = 'TS-BLUE-M';
-- deliberately NOT committing yet
```

Session B, meanwhile:

```sql
BEGIN;
-- Different row: goes through INSTANTLY. This is row-level locking working.
UPDATE inventory SET available = available - 1 WHERE sku = 'TS-GREEN-L';

-- Same row A holds: WAITS. Hangs until Session A commits or rolls back.
UPDATE inventory SET available = available - 1 WHERE sku = 'TS-BLUE-M';
```

Watch it happen: the green-L update returns immediately while blue-M spins. Commit in session A and B's waiting update completes. That asymmetry — same table, one row free and one row blocked — is the demonstration interviewers want to hear described. If you'd tried this on MyISAM, even the green-L update would have waited.

**Example 2 — the honest contrast: what *not*-row-level feels like in SQLite.**

SQLite has no row locks at all; one writer holds the whole database. Run this in terminal 1:

```sql
BEGIN IMMEDIATE;   -- grabs THE database-wide write lock right now
UPDATE stock SET qty = qty - 1 WHERE id = 1;
-- leave it open
```

Then terminal 2, while terminal 1 is still open:

```sql
.timeout 2000      -- wait at most 2 seconds before giving up
BEGIN IMMEDIATE;
-- Error: database is locked
```

I ran exactly this pairing to verify: the second session gets `Error: database is locked` after its 2-second timeout — and crucially, even `UPDATE stock SET qty = 99 WHERE id = 2;` on a completely untouched row is blocked too, because the lock isn't on a row, it's on everything. `BEGIN IMMEDIATE` is also just useful knowledge: plain `BEGIN` in SQLite defers lock acquisition to first write, which produces confusing "locked" failures mid-script, whereas `IMMEDIATE` fails fast and predictably at the top.

**Example 3 — the production pattern: a safe inventory decrement in Node.js.**

```js
const conn = await pool.getConnection();   // one connection for the whole transaction
try {
  await conn.beginTransaction();

  // Claim ONLY this row. Other SKUs remain fully writable by other requests.
  const [rows] = await conn.query(
    'SELECT available FROM inventory WHERE sku = ? FOR UPDATE',
    [sku]
  );

  if (rows.length === 0 || rows[0].available < qtyWanted) {
    throw new OutOfStockError(sku);
  }

  await conn.query(
    'UPDATE inventory SET available = available - ? WHERE sku = ?',
    [qtyWanted, sku]
  );

  await conn.commit();
} catch (err) {
  await conn.rollback();
  if (err.errno === 1213) {
    // InnoDB chose this transaction as deadlock victim — RETRY, don't crash.
    return sellItem(sku, qtyWanted);
  }
  throw err;
} finally {
  conn.release();   // returning the connection returns it clean; holding locks pins connections
}
```

Note what this pattern buys: the check-and-decrement is atomic *because* the row was locked at read time. Without `FOR UPDATE`, two requests could both read `available = 1` and both pass the check — the lost-update race. (A slicker single-statement alternative exists — `UPDATE ... SET available = available - ? WHERE sku = ? AND available >= ?` followed by checking affected rows — and [optimistic locking](what-is-optimistic-locking.md) is a third route; comparisons below.)

**Example 4 — the opening bug, fixed.**

```sql
-- The incident: clearance has NO index. InnoDB scans all 2M rows,
-- locking every one it visits (plus gaps) until commit. Table-wide freeze.
UPDATE products SET price = ROUND(price * 0.90, 2) WHERE clearance = 1;

-- The fix: let the engine SEEK to the targets instead of visiting everything.
ALTER TABLE products ADD INDEX idx_clearance (clearance);

-- Now the plan is a range scan over matching entries only,
-- and only those rows (plus their gaps) are locked.
UPDATE products SET price = ROUND(price * 0.90, 2) WHERE clearance = 1;
```

Verify with `EXPLAIN` before and after ([how](what-is-explain.md)): you want to see the index being used, not a full table scan. To inspect live lock traffic in MySQL 8, `performance_schema.data_locks` shows exactly which records which transaction holds, and `information_schema.innodb_trx` reveals long-running transactions — the two views you'll live in during a lock-contention incident. `SHOW ENGINE INNODB STATUS` summarizes recent deadlocks.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is row-level locking and why does it matter?**

It's the finest lock granularity a relational engine offers: when a transaction modifies a row, only that row is claimed until the transaction commits, so unrelated rows stay fully writable by everyone else. It matters because OLTP systems are built on the assumption that concurrent users mostly touch *different* rows of the same tables — two shoppers, same products table, zero interference. Scale that to thousands of sessions and row-level locking is the difference between a database and a single-file queue. The senior-level caveat: the guarantee is only as good as your query shapes. The engine locks the rows it *visits*; give it a filter without an index and it visits everything.

**Q: Do plain SELECT statements take row locks?**

No — and explaining *why* is what separates a good answer from a great one. In MVCC engines like InnoDB and PostgreSQL, a plain `SELECT` reads a snapshot of committed data: if a writer holds an uncommitted change to a row, the reader doesn't wait, it reconstructs the last committed version. Readers and writers therefore don't block each other at all for ordinary reads. Locking only enters the picture for writes, or when you explicitly demand stability with `SELECT ... FOR UPDATE` (exclusive) or `FOR SHARE` (shared) — the moment you need "this row cannot change between my read and my write," you opt into the locking world on purpose.

**Q: Explain shared versus exclusive locks.**

A shared (S) lock says "I'm reading this row for decision-making purposes; nobody may modify it, but fellow readers are welcome" — many transactions can hold S locks on the same row simultaneously. An exclusive (X) lock says "I own this row until commit" — one at a time, blocks writers and locking-readers alike. The compatibility matrix falls out naturally: S+S compatible, S+X conflict, X+X conflict. Writes always take X locks; `SELECT ... FOR UPDATE` takes X; `SELECT ... FOR SHARE` takes S. The subtlety worth volunteering: plain `SELECT`s take neither, thanks to MVCC snapshots — S and X only matter among transactions that have opted into locking semantics.

**Q: If one statement updates 100,000 rows, do engines really track 100,000 separate locks? What does SQL Server do differently from MySQL?**

This is the escalation question and it's a genuine differentiator. SQL Server tracks individual row/page locks, each costing memory (~100 bytes) — and when a single statement amasses roughly 5,000 locks on one object, it *escalates*: discards the fine locks and takes one table-level lock instead (partition-level on partitioned tables since 2016). Memory problem solved, concurrency problem created — that statement now blocks the whole table. InnoDB never escalates, at any count: it stores lock markers as bits directly on index records, so the overhead of a million row locks is trivially small. Instead, InnoDB pays elsewhere — a wider deadlock surface (mitigated by cycle detection that rolls back a victim with error 1213), longer waiter chains, and gap locks at REPEATABLE READ making ranges sticky. So the punchline: SQL Server converts *too much fine-grained locking* into *coarse blocking*; InnoDB lets you keep fine-grained locking forever but hands you the operational responsibility for deadlocks.

**Q: How can an UPDATE matching 50 rows freeze a 2-million-row table in MySQL?**

Because InnoDB locks what the execution *touches*. With an index on the filtered column, the engine seeks to ~50 entries and locks ~50 rows. Without one, the plan is a full scan: it evaluates the predicate against every row, and every evaluated row gets locked (with next-key/gap locks at the default REPEATABLE READ) until the transaction ends — 2 million locked rows for a 50-row update. Anyone else's update to any of those rows queues behind your transaction. Fixes, in order of preference: index the predicate column so the plan seeks; drop the transaction's isolation to READ COMMITTED, where InnoDB releases locks on non-matching rows after evaluating them; or restructure the bulk job into smaller committed batches so no single transaction pins the table long. Diagnose it live with `performance_schema.data_locks` — you'll see one transaction holding an absurd number of record locks.

**Q: How do row locks relate to deadlocks, and what would you do about them?**

Deadlocks are the tax on fine-grained locking. Every additional lock is another chance for two transactions to hold overlapping sets in conflicting orders — T1 locks rows A,B then wants C while T2 holds C and wants A. Coarse table locking makes deadlocks nearly impossible (there's rarely a cycle when everyone lines up at one gate); row-level locking creates rich possibilities, which is why InnoDB ships a deadlock detector that breaks cycles by rolling back the cheaper transaction (error 1213). The engineering response is layered: acquire rows in one globally consistent order everywhere (sort by primary key before batch-updating), keep transactions short, never make network calls inside one, ensure filter columns are indexed so you lock fewer rows — and treat 1213 as a *retry signal* in application code, because detection recovers the database, not your business operation. The full prevention checklist is on the [deadlock prevention](how-do-you-prevent-deadlocks.md) page.

**Q: When would you deliberately choose coarser locking than row-level?**

Three honest cases. One: your workload genuinely serializes anyway — a tiny config table or a single hot counter row means row locks buy nothing over a table lock, and the coarse path is simpler with less machinery to go wrong. Two: bulk maintenance windows — a nightly job rewriting half a table will trip escalation in SQL Server or pile up enormous deadlock surface in InnoDB regardless; batching it or running it off-peak acknowledges the concurrency win doesn't apply. Three: embedded or lightweight contexts where SQLite's whole-database model is a deliberate feature — one process, simple durability guarantees, zero tuning. The mistake isn't choosing coarse locking; it's *assuming* you have row-level locking without verifying the engine, then discovering during an incident that you never did.

## 6. The Traps — What Goes Wrong in Production

**Assuming your engine locks rows at all.** Wrong assumption: "it's SQL, so it does row-level locking." Why it's wrong: locking granularity belongs to the storage engine, not SQL — MyISAM tables take table locks for every write, SQLite takes one database-wide write lock. What actually happens: teams build queuing-style logic expecting parallel row writes, then can't explain why throughput collapses to one-at-a-time under load, and the answer is `SHOW TABLE STATUS` revealing `Engine: MyISAM`. Fix: know your engine before designing concurrency, and treat engine choice (InnoDB over MyISAM, for instance) as a locking decision.

**The unindexed predicate that locks the world.** Wrong assumption: "InnoDB is row-level, so my `UPDATE ... WHERE legacy_flag = 0` only locks matching rows." Why it's wrong: with no index on `legacy_flag`, the execution visits every row to evaluate the condition — and locks every visited row until commit (plus gaps, at REPEATABLE READ). What actually happens: your 200-row update behaves as a table lock for the duration of the transaction; every unrelated write stalls; dashboards fill with lock-wait timeouts. Fix: index the columns you filter on in write statements — verify the plan with EXPLAIN, not hope — and break monster jobs into batches that commit incrementally.

**Doing slow work while holding the lock.** Wrong assumption: "`FOR UPDATE` reserves the row, so I might as well call the payment API, send the email, then finish the transaction." Why it's wrong: row locks live until COMMIT/ROLLBACK — the lock duration equals your *entire transaction*, network calls included. What actually happens: a 300ms payment provider latency becomes 300ms during which that product row is frozen for everyone; multiply by traffic and you've built a global throttle keyed on Stripe's worst latency day — plus connection-pool exhaustion as transactions pile up. Fix: lock, mutate, commit — fast. External calls go outside the transaction, with the row's state transition done in milliseconds and side effects dispatched afterward.

**Believing readers and writers always block each other.** Wrong assumption carried over from textbook two-phase locking: "an uncommitted UPDATE blocks SELECTs on that row." Why it's wrong: MVCC engines serve plain SELECTs from versioned snapshots, so ordinary reads never wait on writers. What actually happens: people add pointless `FOR SHARE` calls to reporting queries "for safety," converting non-blocking snapshot reads into lock-acquiring ones — manufacturing contention that didn't exist. Fix: reach for explicit locking only when you have a read-modify-write invariant to protect, not for general reading.

**Treating deadlock errors as crashes instead of signals.** Wrong assumption: "error 1213 means something is broken." Why it's wrong: with row-level locking, occasional deadlocks are *normal operation* — the detector did its job, picked a victim, and kept the system consistent. What actually happens: teams alert on every deadlock and page engineers at 3am, or worse, let the exception bubble up and fail customer requests that a simple retry would have completed. Fix: wrap transactions in retry logic (2–3 attempts with jitter), reserve paging for deadlock *rates*, and prevent structurally with consistent lock ordering — details in [preventing deadlocks](how-do-you-prevent-deadlocks.md).

**Running migrations and bulk rewrites as one giant transaction.** Wrong assumption: "wrap the whole backfill in one transaction so it's atomic." Why it's wrong: atomicity is preserved, but every row touched joins the lock set until the final commit — hours of accumulated locks, undo-log growth in InnoDB, guaranteed escalation in SQL Server. What actually happens: the migration starts fine, then the entire table hard-freezes at minute four while the job is 3% done. Fix: chunk the work into bounded transactions (say, 1,000 rows each), accepting that the overall operation is resumable rather than single-shot atomic — and schedule it away from peak anyway.

## 7. Compare With Related Concepts

**Row-level locking vs [table-level locking](what-is-table-level-locking.md).** Same tool, different granularity. Row-level lets transactions touching distinct rows proceed fully in parallel, and pays for it with per-row bookkeeping and a wide deadlock surface; table-level serializes all writers to a table but needs almost no coordination machinery — MyISAM doesn't even implement deadlock detection because its locks barely interleave. Rule: OLTP tables with many concurrent writers on different rows demand row-level; tiny lookup tables or bulk-only tables lose nothing with coarse locks and gain simplicity.

**Pessimistic row locks vs [optimistic locking](what-is-optimistic-locking.md).** Two ways to protect the same read-modify-write sequence. Pessimistic (`SELECT ... FOR UPDATE`) reserves the row *before* deciding — guaranteed exclusivity, at the cost of queuing everyone else behind your critical section. Optimistic skips locks entirely: read freely, then `UPDATE ... WHERE version = <as-read>` and detect conflicts at write time, retrying losers. Rule: hot, genuinely contested rows with short critical sections (inventory flash-sale decrements) favor pessimistic row locks; mostly-uncontended data where collisions are rare favors optimistic — pay only on the rare conflict instead of taxing every request.

**Row locks vs MVCC snapshot reads.** Not competitors — layers. MVCC is the reason plain `SELECT`s never need row locks: readers get consistent committed versions without waiting for writers, which is where the vast majority of your query traffic lives. Row locks govern the narrower world of writes and deliberate read-before-write sequences. Rule: rely on MVCC for visibility, spend row locks only where correctness requires exclusivity — and if you can't articulate which invariant a `FOR UPDATE` protects, you probably don't need it.

## 8. 🧠 The Memory Hook

A row lock is a **"do not disturb" sign on one hotel-room door** — hung when you touch the row, taken down when you commit, invisible to everyone entering other rooms. The two facts that save you in interviews and incidents alike: *your lock footprint is every row your query visits, not just the rows it changes* (index your filters!), and *when the signs get too numerous, SQL Server closes the whole hotel while InnoDB never does — it just accepts that more open doors mean more chances for two housekeepers to block each other.*
