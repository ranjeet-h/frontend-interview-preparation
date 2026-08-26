# What Is Table-Level Locking

## 1. The Real-World Problem — When You Actually Hit This

It's a normal Tuesday afternoon. Your e-commerce app has been healthy for months, and then support lights up: product pages won't load, carts won't update, checkout is dead. You open the database and find a queue of sessions stretched out the door, every one of them waiting on the same table. The culprit is a stats job someone rescheduled from 3am to noon — one bulk `UPDATE` that has been chewing through `customer_stats` for six minutes. Every other writer to that table is frozen. So is every reader.

You call the team, and someone says the thing every team says: "But we use InnoDB, we have row-level locking." And they do — except this one table, created years ago and carried through two migrations, is still running **MyISAM**. MyISAM has no row locks at all. Every statement it touches claims the *entire table*, so a six-minute bulk update turned a hot table into a single-file line.

That's table-level locking in one painful sentence: one lock on the whole table means everyone who wants anything on that table — read or write — waits.

And here's the twist that catches even modern, well-run teams: switching to InnoDB does not retire this class of outage. Table-level locking never went away. It hides inside DDL, inside explicit `LOCK TABLES`, and inside SQLite's entire design. Run one careless `ALTER TABLE` during business hours on a busy InnoDB table and you will relive this exact incident — with an engine that "does row locking." Interviewers love asking which operations still take table locks, because the candidates who've lived through a migration outage light up, and the ones who haven't say "none, we use InnoDB."

## 2. The Analogy — Make the Mechanic Obvious

Picture an open-plan office. The room is your table. Each desk is a row. People drift in all day, sit at their own desks, and get work done.

There are two ways to control access here, and the difference between them is this entire topic.

**Desk tags** are row-level locking. Someone puts a small "reserved — back at 3pm" sign on desk 14, and life continues: thirty-nine other people keep working at their own desks, completely unaffected. The cost is bookkeeping — somebody has to print signs, hang them, take them down, and occasionally untangle two workers who each grabbed a desk the other one needs. That's the row-level world, and it has its own full page ([row-level locking](what-is-row-level-locking.md)).

**The door bolt** is table-level locking. Instead of marking individual desks, you slide a bolt across the room's only door. Now nobody enters — not to sit at desk 14, not to sit at the empty desk in the corner, not even to stand by the notice board and read. Whoever holds the bolt owns the room.

Why would anyone choose the bolt? Because sometimes it's exactly the right tool. If you're repainting the entire office tonight, you needed everyone out anyway — and one bolt beats hanging four hundred desk signs. If the room holds three interns, a bolt costs nothing and desk-tag bureaucracy buys you nothing. The bolt is also *simple*: one key, one holder, no way for two people to quietly entangle their claims. That's the genuine upside of coarse locking, and it's why engines haven't dropped it.

The catastrophe is equally clear. Take that same door bolt and impose it on a busy office where fifty people each edit their own desk all day. Productivity collapses to one-person-at-a-time, even though nobody's work overlaps. Nobody touched anybody else's desk — the policy punished them anyway.

Now the part that surprises InnoDB users, mapped honestly onto the picture: the modern office uses desk tags for daily work, **but still slides the bolt across the door for renovations**. You cannot repaint half-used desks — the renovation (an `ALTER TABLE`) genuinely needs the room empty. And here's the nasty detail: the renovation crew is *polite*. They wait at the door for the very last employee to wander out. But while they stand there waiting, they're standing *in the doorway* — so every person who arrives queues up behind them, unable to enter, even though the renovation hasn't started. One employee who lingers at his desk all afternoon (an idle open transaction) plus one polite renovation crew (your migration) equals an office that looks busy but accomplishes nothing. That exact dynamic is the most common table-level-locking outage in modern systems, and we'll recreate it below.

## 3. The Full Explanation — How It Actually Works

Start with the mechanic in plain words: a table lock is a single claim recorded once, on the table as a whole, rather than one claim per row. It comes in two basic flavors. A **shared (read) lock** says "people may come look, but nobody may change anything" — many readers can hold it at once, and every writer waits. An **exclusive (write) lock** says "mine alone" — one holder, and both readers and writers queue. PostgreSQL exposes a whole ladder of modes between these poles, but shared-versus-exclusive is the mental core.

Now compare the cost model with row locks, because this is the actual engineering trade-off. A table lock is one entry in a lock table; a million row locks is a million entries. Coarse locking costs almost no memory, almost no CPU, and — this is underrated — it barely *interleaves*. Two table locks on the same table can't weave into the tangled hold-and-want patterns that create deadlocks, which is part of why MyISAM never bothered shipping deadlock detection at all. You give up all concurrency between unrelated operations, and in exchange you get simplicity, predictability, and speed for whoever holds the lock.

Which engines actually behave this way? Let's be engine-honest, because "databases do X" answers die in interviews.

**MyISAM (old MySQL default)** lives here full-time. Every statement — read or write — passes through table locks. A write statement takes the table exclusively for its entire duration: other writers wait, and readers wait too. Its historical niche was read-heavy websites where writes were rare, because a shared lock happily serves unlimited simultaneous readers. The moment writes became frequent, the model fell apart — and it has no transactions to soften the blow.

**SQLite** goes one step coarser: the *database file* is the room. One writer at a time, across every table, period. In its default journal mode a writer even excludes readers; in WAL mode readers keep reading a snapshot while one writer works, but there is still only ever one writer globally. That's a deliberate, sensible design for an app-local or embedded database — and a hard ceiling for a multi-writer web backend.

**InnoDB and PostgreSQL** use row locks for ordinary data changes — but table-level locks still show up in three places, and knowing them is the interview differentiator.

First, **intention locks**. Whenever a transaction locks rows in a table, the engine plants a small table-level flag: "someone is working at desks inside." It's the door sign version of checking desks — so that a whole-table request can ask *one* question ("anyone in there?") instead of inspecting every row. Intention locks don't block each other or normal row work; they only matter to requests that want the entire table.

Second, **explicit `LOCK TABLES`**. Any session can ask for a real, old-fashioned table lock — `LOCK TABLES inventory WRITE` — and everyone else queues until `UNLOCK TABLES`. One quirk bites people: MySQL requires you to name *every* table you'll touch while the lock is held, or you get "Table 'x' was not locked with LOCK TABLES" errors mid-query.

Third — and this is the one that causes production incidents — **schema changes**. `ALTER TABLE`, `DROP TABLE`, `TRUNCATE`: the engine cannot safely change a schema while queries are using the old one, so DDL demands near-total exclusion. PostgreSQL names its strongest mode precisely: **ACCESS EXCLUSIVE**, which blocks *everything*, including plain `SELECT`s. Even a metadata-only change like adding a column (fast since PG 11) still needs a brief ACCESS EXCLUSIVE moment. MySQL's implementation is **metadata locks (MDL)**: any open transaction that touched a table holds a shared MDL until it commits, DDL must wait for all of them, and — the renovator-in-the-doorway part — while the DDL waits, every *new* query on that table queues behind it. A migration that hasn't changed a single row can freeze a table completely. (There's a fourth, deeper cut: InnoDB's auto-increment counter takes a special table-level lock in some replication modes — worth knowing it exists.)

So what do you gain and pay? Gains: negligible overhead, no intra-table deadlock tangles, and perfect conditions for operations that legitimately want the whole table anyway. Costs: zero overlap between unrelated work, queue-shaped latency spikes, and a blast radius that spreads beyond the database — blocked sessions pile up, exhaust your connection pool, and start failing endpoints that never touch that table.

When is table-level locking *fine*, even good? **Bulk loads** — repainting the office — where you want exclusivity anyway and get maximum throughput for it. **Tiny lookup or config tables**, where row locks would protect rows nobody else is contesting. **Rebuild-and-swap patterns**: build a fresh table, swap names in one atomic instant, hold exclusivity for a blink instead of contending for an hour. Scheduled **maintenance windows** generally. When is it catastrophic? **Mixed OLTP**: interactive users and background jobs sharing a table, thousands of small independent operations that touch different rows and gain nothing from queuing. Legacy MyISAM in a hot path. Unbounded migrations during peak traffic.

It interacts with everything around it, too. Waiters hold connections hostage, so watch pool saturation alongside lock waits. Set timeouts so waits fail fast instead of stacking up forever — MySQL's `innodb_lock_wait_timeout` (default 50s) covers row locks and its `lock_wait_timeout` covers metadata locks but defaults to roughly a *year*; PostgreSQL's `lock_timeout` defaults to disabled. And know your windows into an incident: `SHOW PROCESSLIST` showing "Waiting for table metadata lock" or "Waiting for table level lock", `information_schema.innodb_trx` for long-open transactions, `sys.schema_table_lock_waits` in MySQL 8, and `pg_locks` joined with `pg_stat_activity` in PostgreSQL.

## 4. See It In Practice — Real Code or Queries

**Example 1 — feel a table lock (two terminals, any MySQL engine).**

Terminal A grabs the whole table and keeps it:

```sql
LOCK TABLES inventory WRITE;

UPDATE inventory SET available = available - 1
WHERE sku = 'TS-BLUE-M';

-- deliberately NOT unlocking yet
```

Terminal B, meanwhile, tries something completely unrelated:

```sql
SELECT available FROM inventory WHERE sku = 'TS-GREEN-L';
-- Hangs. Not because of the SKU — because the DOOR is bolted.
```

The moment Terminal A runs `UNLOCK TABLES;`, Terminal B returns instantly. Now run the same pair using `BEGIN` + `SELECT ... FOR UPDATE` on one row instead of `LOCK TABLES`, and Terminal B sails straight through — that contrast *is* the granularity lesson. And note: on MyISAM you'd get the blocking behavior implicitly for every write statement, no `LOCK TABLES` required.

**Example 2 — the migration outage, recreated in MySQL.**

```sql
-- Terminal 1: an innocent read, left open
BEGIN;
SELECT * FROM orders WHERE id = 7;
-- Walk away. This holds a SHARED metadata lock on orders until COMMIT/ROLLBACK.

-- Terminal 2, a minute later: the migration
ALTER TABLE orders ADD COLUMN gift_note VARCHAR(200);
-- Needs exclusive metadata. Waits politely for Terminal 1.

-- Terminal 3, a minute after that: any query at all
SELECT COUNT(*) FROM orders;
-- HANGS TOO. It queues BEHIND the pending ALTER.
```

Nothing has been modified, yet the table is fully frozen — one idle transaction plus one pending DDL. The guardrail that prevents this: give the migration a deadline so it fails fast instead of becoming the doorway blocker.

```sql
-- Same session that will run the DDL, immediately before it:
SET SESSION lock_wait_timeout = 5;   -- seconds; the default is ~1 YEAR

ALTER TABLE orders ADD COLUMN gift_note VARCHAR(200);
-- If it can't get the lock in 5s: error out, alert, retry off-peak.
```

**Example 3 — the same story in PostgreSQL, with its precise vocabulary.**

```sql
-- Terminal 1
BEGIN;
SELECT * FROM orders WHERE id = 7;   -- takes ACCESS SHARE, held until commit
```

```sql
-- Terminal 2: the guarded migration
SET lock_timeout = '3s';             -- default is disabled = wait FOREVER
ALTER TABLE orders ADD COLUMN gift_note text;
-- ERROR: canceling statement due to lock timeout (55P03 lock_not_available)
-- Failed in 3 seconds instead of freezing every reader on the table.
```

Related knob: plain `CREATE INDEX` takes a SHARE lock — writes block, reads continue — while `CREATE INDEX CONCURRENTLY` blocks neither, at the cost of taking longer and occasionally leaving an INVALID index you must drop and retry. Same theme everywhere: DDL wants exclusion; your job is to bound how long it will *wait* for it.

**Example 4 — when the bolt is the RIGHT tool: the nightly rebuild.**

```sql
-- Reporting table rebuilt from scratch at 3am. Exclusivity is the point.
-- Note BOTH tables listed — MySQL refuses queries on unlocked tables.
LOCK TABLES report_daily WRITE, events READ;

TRUNCATE report_daily;
INSERT INTO report_daily (day, revenue)
  SELECT DATE(created_at), SUM(amount)
  FROM events
  GROUP BY DATE(created_at);

UNLOCK TABLES;
```

Nobody suffers, because at 3am nobody else wants those desks. The PostgreSQL-flavored upgrade is rebuild-and-swap — build `report_daily_new` beside the original, then flip names inside one transaction:

```sql
BEGIN;
ALTER TABLE report_daily RENAME TO report_daily_old;
ALTER TABLE report_daily_new RENAME TO report_daily;
COMMIT;
```

Two brief ACCESS EXCLUSIVE blinks instead of a long contention window. That's the pattern for turning a coarse-lock necessity into a non-event.

**Example 5 — the application side: never let a migration wait forever.**

```js
const { Pool } = require('pg');
const pool = new Pool();

async function safeMigrate(client, sql, attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      // Bound the DDL's patience BEFORE running it — this is the whole trick.
      await client.query("SET lock_timeout = '3s'");
      await client.query(sql);
      return;
    } catch (err) {
      if (err.code === '55P03' && i < attempts) {
        // Couldn't get the lock: back off and try again later,
        // rather than parking in the doorway and freezing the table.
        await new Promise((r) => setTimeout(r, 30_000));
        continue;
      }
      throw err;
    }
  }
}
```

Pair this with keeping application transactions short — an ORM session left open after a request finishes is the lingering desk-employee from the analogy, and every future migration pays for it.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is table-level locking, and how does it differ from row-level locking?**

It's a claim recorded on an entire table rather than on individual rows: one lock, two basic flavors (shared for readers, exclusive for a lone writer), and everyone wanting that table queues behind the holder. Row-level locking records a claim per row, so transactions touching different rows of the same table proceed fully in parallel — at the price of tracking many locks and managing deadlocks between them. The one-line version: table locks maximize *simplicity*, row locks maximize *concurrency*. The senior caveat is that these aren't competing products — every row-level engine still takes table-level locks for DDL and whole-table requests, so you need to understand both no matter which engine you run.

**Q: Which databases actually use table-level locking?**

Three honest tiers. MyISAM is all-in: every statement goes through table locks, so one slow write blocks all readers and writers on that table. SQLite is even coarser — one write lock for the entire database file, softened only by WAL mode letting readers proceed alongside the single writer. InnoDB and PostgreSQL are row-level for data changes but still take table-level locks in specific situations: intention flags on the table whenever row locks are held, explicit `LOCK TABLES`, and — most importantly in practice — DDL, where PostgreSQL takes ACCESS EXCLUSIVE (blocks even SELECTs) and MySQL takes exclusive metadata locks that additionally cause every new query to queue behind a *waiting* DDL. Answering "we use InnoDB so we never see table locks" is how this question separates candidates who've run production from those who've read about it.

**Q: We run InnoDB everywhere. Explain how an ALTER TABLE took the site down.**

Because of metadata locks and the queue effect. Any open transaction that touched the table — even a plain SELECT — holds a shared metadata lock until commit. The `ALTER` needs exclusive access, so it waits for every one of them to finish. Here's the killer: while the ALTER waits, every *new* query on that table queues behind it, because the engine honors lock-request order. So one transaction left idle-in-transaction, plus one migration, equals a complete freeze in which the ALTER hasn't actually done anything yet. The defenses are mechanical: set `lock_wait_timeout` (MySQL) or `lock_timeout` (PostgreSQL) to seconds before every migration so it fails fast instead of blocking indefinitely; hunt down idle-in-transaction sessions (PostgreSQL's `idle_in_transaction_session_timeout` helps); run DDL off-peak; use online-schema-change tooling for big tables (`gh-ost`, `pt-online-schema-change` on MySQL; `CONCURRENTLY` variants on PostgreSQL); and prefer fast algorithms where they exist (`ALGORITHM=INSTANT` for many MySQL 8 changes, metadata-only column adds in PG 11+).

**Q: When would you deliberately choose table-level locking over finer locking?**

Four legitimate cases. Bulk loads, where you're rewriting most of the table anyway — exclusivity is what you wanted, and one lock is faster than administering a million row locks. Tiny lookup or config tables, where row locks protect against contention that doesn't exist and coarse locking is strictly simpler. Rebuild-and-swap patterns, where you build a fresh table offline and swap names atomically, converting an hour of potential contention into a millisecond of exclusivity. And serialized-by-design workloads — a single-writer job queue, a nightly aggregate. The mistake is never choosing coarse locking; it's running mixed interactive traffic on a table that behaves like it's coarse (legacy MyISAM) or discovering during an incident that your "row-level" engine takes table locks exactly when you can least afford them.

**Q: What's the difference between a read lock and a write lock on a table?**

A read (shared) lock says "look, don't touch": any number of sessions can hold it simultaneously, which is why read-heavy workloads loved MyISAM — unlimited parallel readers. A write (exclusive) lock says "mine alone": one holder, and both readers and writers wait. The compatibility grid falls out of those sentences — read+read fine, read+write conflict, write+write conflict. PostgreSQL refines this into a spectrum: `SELECT` takes ACCESS SHARE, `INSERT`/`UPDATE`/`DELETE` take ROW EXCLUSIVE, `CREATE INDEX` takes SHARE (blocks writes, permits reads), and DDL like `ALTER`/`DROP`/`TRUNCATE` takes ACCESS EXCLUSIVE, which conflicts with *everything* — that's why even plain SELECTs can end up queued behind a migration. The practical takeaway: the mode a statement requests determines not just who waits for it, but who waits *behind it* while it waits.

**Q: Production is frozen and everything says "waiting." How do you actually diagnose a lock pile-up?**

Start from the symptoms, because they mislead: when waiters stack up they consume connection-pool slots, so unrelated endpoints start timing out and the app tier looks guilty. On the database: in MySQL, `SHOW PROCESSLIST` reveals sessions stuck in "Waiting for table metadata lock" or "Waiting for table level lock"; `information_schema.innodb_trx` surfaces long-open transactions (the lingering blocker); MySQL 8's `sys.schema_table_lock_waits` directly names who blocks whom. In PostgreSQL, join `pg_stat_activity` with `pg_locks`, or use `pg_blocking_pids(pid)` to get the culprit chain instantly. Then decide: usually the right move is killing or committing the *blocker* (the idle transaction), not the crowd of victims — killing victims just empties the queue while the doorway stays blocked. Afterwards, add the guardrails so the same incident can't recur: lock timeouts on DDL, idle-transaction timeouts, and alerts on long-running transactions rather than on lock waits alone.

**Q: Do table locks cause deadlocks?**

Barely — and that's one of their quiet advantages. A deadlock needs a cycle: A holds something B wants while B holds something A wants. Within a single table there's nothing to interleave — one lock, one holder — which is why MyISAM ships no deadlock detection at all. The exception is multiple tables: two sessions running `LOCK TABLES` in opposite orders (A grabs `orders` then wants `inventory`; B grabs `inventory` then wants `orders`) can absolutely wedge each other, and the cure is boring discipline — always acquire tables in one consistent order, alphabetical is fine, in every script that locks more than one. That same ordering principle, applied to rows instead of tables, is the backbone of [deadlock prevention](how-do-you-prevent-deadlocks.md) in fine-grained engines.

## 6. The Traps — What Goes Wrong in Production

**"InnoDB does row locking, so we never take table locks."** Wrong assumption: engine choice retires coarse locking. Why it's wrong: InnoDB and PostgreSQL take table-level locks for DDL, honor explicit `LOCK TABLES`, and plant table-level intention flags for every row-locking transaction. What actually happens: the team schedules a routine migration during business hours, it parks behind some idle transaction, every new query queues behind *it*, and you get the full-site outage described above — from an engine doing exactly what it was designed to do. Fix: treat DDL as a coarse-lock operation in every engine — wrap it in lock timeouts, schedule it, and use online-schema-change tooling for big tables.

**"My tiny SELECT can't hurt anyone."** Wrong assumption: reads are harmless bystanders to locking problems. Why it's wrong: a read inside an open transaction holds a shared metadata lock (or PostgreSQL's ACCESS SHARE) until that transaction *commits* — not until the statement returns. What actually happens: a developer leaves a transaction open on a prod replica while at lunch, the 2pm migration starts waiting on them, and every query after the migration queues behind it — the whole table freezes because of one abandoned SELECT. Fix: never leave transactions idle-in-transaction, close ORM sessions promptly, and set `idle_in_transaction_session_timeout` in PostgreSQL so the database defends itself.

**"ALTER TABLE is quick — we'll just run it live."** Wrong assumption: schema changes are metadata tweaks that finish instantly. Why it's wrong: on large tables many ALTERs copy or rewrite rows (hours of work), several need a fully exclusive phase regardless, and even the "instant" ones still queue for exclusive access — meaning their wall-clock time includes waiting for every open transaction to drain. What actually happens: a long-running ALTER blocks all reads and writes on the table for its entire duration, dashboards freeze, and the connection pool fills with victims. Fix: measure table size before writing the migration, choose `ALGORITHM=INSTANT`/`INPLACE` where MySQL supports it, use `CONCURRENTLY` variants in PostgreSQL, bound everything with a lock timeout, and reach for `gh-ost` or `pt-online-schema-change` when the table is big enough that "how long?" has a scary answer.

**"MyISAM is lighter, let's use it for the hot table."** Wrong assumption: the old engine is a free performance win. Why it's wrong: MyISAM pays for its lightness with table locks on every write, no transactions, and no crash-safe recovery — a power cut mid-write can corrupt the table. What actually happens: benchmarks look great on a read-only test, then launch-day traffic mixes in writes, every write excludes every reader, and throughput falls off a cliff that no amount of hardware fixes. Fix: InnoDB by default; the honest case for MyISAM-style behavior today is a read-mostly archive, and even then you're trading durability for nostalgia.

**"Only that one table is locked, so the rest of the app is fine."** Wrong assumption: the blast radius equals the table. Why it's wrong: every waiter occupies a database connection, and connections are a finite pooled resource shared by the whole application. What actually happens: the locked table's waiters exhaust the pool, requests for *unrelated* features start failing with "timeout waiting for connection," retries pile on, and a single-table problem presents as a full-stack outage. Fix: timeouts at every layer so waiters give up quickly (`innodb_lock_wait_timeout`, `lock_timeout`, pool acquisition timeout), alert on pool saturation and long transactions, and kill the blocker decisively rather than watching victims multiply.

**"I'll just use LOCK TABLES in the app for extra safety."** Wrong assumption: a bigger lock is a safer lock. Why it's wrong: `LOCK TABLES` serializes the entire table, must name *every* table you'll touch (miss one and queries error mid-code), and releases only on `UNLOCK TABLES` or session end — in a pooled app, that means locks can live as long as the connection does. What actually happens: someone adds it "temporarily," a pooled connection leaks with the lock held, and the table is bolted until the app restarts. Fix: application concurrency belongs in transactions with row locks (`FOR UPDATE`) or optimistic version checks — reserve `LOCK TABLES` for batch scripts and maintenance windows where global serialization is genuinely the goal.

## 7. Compare With Related Concepts

**Table-level vs [row-level locking](what-is-row-level-locking.md).** Same tool, different granularity, opposite trade-offs. Table-level records one claim per table: nearly free to manage, impossible to tangle into deadlocks within a table, and devastating to concurrency — every operation queues, even for unrelated rows. Row-level records one claim per row: thousands of transactions work in parallel on distinct rows, paid for with lock bookkeeping, wider deadlock surface, and the requirement that your filters be indexed (you lock what you *visit*). Rule of thumb: many concurrent writers touching different rows demand row-level; whole-table batch work, tiny lookup tables, and rebuild-and-swap patterns lose nothing with table-level and gain simplicity.

**Table locks vs database-level locks (SQLite).** One step coarser on the same axis: SQLite's write lock covers the entire database file, not one table. The rule falls straight out of scope: an embedded or single-app database with occasional writers is SQLite's home turf and its coarse lock is a feature; a multi-writer web backend needs per-row granularity, which is why "just use SQLite in production" is a scaling conversation, not a syntax one.

**Data locks vs schema (metadata) locks.** People conflate these because both sit at "table altitude." Data locks arbitrate *rows*: governed by your isolation level and your `WHERE` clauses, resolved by shorter transactions and better indexing. Schema locks arbitrate *the table's definition*: demanded by DDL, held until surrounding transactions end, and bounded by lock timeouts and online-DDL tooling — no isolation level or index will save you from a pending `ALTER`. Rule: tuning data-lock behavior is an everyday OLTP skill; bounding metadata-lock waits is a migrations discipline, and you need both.

**Coarse locks vs [optimistic](what-is-optimistic-locking.md)/[pessimistic](what-is-pessimistic-locking.md) locking.** Different axes entirely. Optimistic and pessimistic describe *how you acquire protection for a read-modify-write sequence* — reserve first, or detect collisions at write time. Grain describes *how much you claim when you do*. You can run pessimistic row locks (`FOR UPDATE`), optimistic row locks (version columns), or pessimistic whole-table locks (`LOCK TABLES`) — the strategies compose with either granularity. Rule: pick grain from your workload's concurrency shape; pick strategy from your contention rate. Hot contested rows favor pessimism; rarely-colliding data favors optimism; nobody's favor is an unnecessary `LOCK TABLES`.

## 8. 🧠 The Memory Hook

A table lock hangs the bolt on the meeting-room door instead of tagging one chair: perfect when you need the whole room empty (repainting = bulk load, renovation = DDL), a catastrophe when fifty people just need their own desks (OLTP). And the fact that saves your pager: even InnoDB bolts the door for renovations — and while the polite renovator waits at the threshold for the last lingering employee, everyone else queues up behind him. Bound his patience with a lock timeout.
