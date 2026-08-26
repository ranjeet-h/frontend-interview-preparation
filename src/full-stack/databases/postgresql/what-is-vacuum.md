# What is VACUUM

## 1. The Real-World Problem — When You Actually Hit This

Your app has been live for four months. Nothing changed in code, but the orders table keeps getting slower. A query that took 80ms in staging now takes 3 seconds. `SELECT COUNT(*)` says you have 2 million live rows, but `pg_total_relation_size` says the table is 40GB — twice what it should be. You deleted 500k old rows last week and the disk usage did not move at all. And then a scarier message shows up in the logs: `warning: database "prod" must be vacuumed within 998071 transactions`.

None of this is a query bug. It is dead tuples piling up. Every UPDATE and DELETE in PostgreSQL leaves the old row version behind. Those dead versions stay on disk, clog every sequential scan, make indexes point at garbage, and hold onto old transaction IDs that will eventually force the database to stop accepting writes to avoid corrupting data. This is the exact moment VACUUM exists for — cleaning up the dead weight before the table drowns in it. If you lean on the sibling pages, [what-is-mvcc.md](what-is-mvcc.md) explains *why* the dead tuples appear and [what-is-autovacuum.md](what-is-autovacuum.md) explains the automatic scheduler; this page is about the VACUUM command itself and what it actually does to the heap.

## 2. The Analogy — Make the Mechanic Obvious

Imagine an office where no one is allowed to erase.

When someone wants to fix a form, they do not erase the old one. They fill out a fresh copy, put it in the same filing cabinet drawer, and stamp the old copy VOID. When they delete a form, they just stamp it VOID and leave it there. The cabinet drawer gets thicker every day, even though half the sheets inside are voided.

Now comes the janitor. His job is not to throw away the whole cabinet. He walks the drawer, checks each VOID sheet, and asks: is there anyone in the building who might still need to read this version? If no active reader could need it, he pulls the sheet, shreds it, and leaves the empty slot marked reusable — tomorrow's new form can slide right into that slot. He also updates the drawer label that says which pages are completely clean, so the next person searching can skip the messy pages. And he stamps very old sheets with a permanent FROZEN mark so their serial numbers can be recycled without the record disappearing.

That janitor is VACUUM. The VOID sheets are dead tuples. The reusable slots are free space tracked in the free space map. The drawer label is the visibility map. The FROZEN stamp is transaction ID freezing that prevents wraparound. And VACUUM FULL is the other janitor who, instead of tidying the drawer, pulls every live sheet out, throws the cabinet away, buys a smaller cabinet, and puts the live sheets back in tight — but he locks the whole office while he does it.

## 3. The Full Explanation — How It Actually Works

Start with why Postgres creates garbage at all. PostgreSQL uses heap-based MVCC. The table — the heap — stores full row versions. An UPDATE is really a delete plus an insert: Postgres marks the old tuple's `xmax` and writes a brand new tuple with the new values and your transaction's `xmin`. A DELETE just marks `xmax`. Nothing is removed on the spot. What is left behind is a dead tuple — a version that is logically invisible to any future transaction but still sits on the page until cleanup proves no old snapshot could still see it. That nuance is the whole foundation of [what-is-mvcc.md](what-is-mvcc.md). Readers never block writers because readers can keep seeing the old version, but the price is bloat.

VACUUM is the tool that decides when a dead tuple is truly safe to reclaim. It scans the table, checks each dead tuple against the oldest active snapshot horizon in the whole cluster, and if no running transaction could need it, it unlinks it and records the free space in the free space map (FSM) so the next INSERT or UPDATE on that same table can reuse that slot. It also sets hint bits on live tuples and updates the visibility map — the per-page flag that says "every tuple on this page is visible to everyone." That map is why a later index-only scan can answer without touching the heap. VACUUM also updates the freeze map and the table's `relfrozenxid`, the marker of the oldest transaction ID still unfrozen in that table.

Here is what VACUUM does not do, and this confuses most people the first time. Normal VACUUM does not give disk space back to the operating system. It makes space reusable inside the same table file. Your 40GB file stays 40GB after VACUUM, it just has 20GB of reusable holes inside. The only time it can shrink the file is if whole pages at the very end of the file become completely empty — then it can truncate them off. If you actually need the file smaller, that is a different operation.

That different operation is VACUUM FULL. It rewrites the entire table into a new, compact file that contains only live tuples, then swaps it in and rebuilds the indexes from scratch. It genuinely returns disk to the OS. The cost is brutal: it takes an ACCESS EXCLUSIVE lock, which blocks every read and every write on that table for the entire rewrite. On a hot 50GB table that can mean minutes of total outage. It also needs roughly as much free disk as the table itself to build the copy. Never run it ad hoc on a production hot table. If you need online compaction without the lock, the community tool `pg_repack` exists for exactly that trade-off.

VACUUM and ANALYZE are siblings, not the same job. VACUUM cleans dead space and freezes IDs. ANALYZE samples the table and refreshes planner statistics in `pg_statistic` so the optimizer picks good plans. Autovacuum happens to run both on separate schedules — but `VACUUM` alone does not update statistics, and `ANALYZE` alone does not reclaim dead tuples. `VACUUM ANALYZE` does both in one pass, which is handy before a big report or after a bulk load. If queries suddenly choose a bad plan, think ANALYZE. If the table keeps growing and scans get slower, think VACUUM.

Most vacuuming in real life is not manual at all — it is autovacuum, covered in detail on [what-is-autovacuum.md](what-is-autovacuum.md). The autovacuum launcher wakes every `autovacuum_naptime` (default 1 minute) and checks each table's dead tuple counter against the threshold formula `autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor * live_rows`. With defaults 50 and 0.2, a 10 million row table needs 2 million dead tuples before autovacuum triggers, which is often too lazy for hot tables. That is why you tune per table with `ALTER TABLE ... SET (autovacuum_vacuum_scale_factor = 0.02)` and similar, or force a manual `VACUUM` when you know you just churned a million rows and do not want to wait. There is also the wraparound-forced vacuum: even a table with zero dead tuples will be vacuumed when its `age(relfrozenxid)` passes `autovacuum_freeze_max_age` (default 200 million) so its old transaction IDs can be frozen.

Monitoring is not optional. At the table level, `pg_stat_user_tables` tells you `n_live_tup`, `n_dead_tup`, `last_vacuum`, `last_autovacuum`, and `last_autoanalyze`. If `n_dead_tup` keeps climbing and `last_autovacuum` is old, cleanup is blocked or too slow. At the progress level, `pg_stat_progress_vacuum` shows what a running VACUUM is doing right now. At the cluster level, `SELECT datname, age(datfrozenxid) FROM pg_database` tells you how close you are to wraparound. And when you want real bloat numbers, the `pgstattuple` extension gives exact free-space estimates per table and index. If any of those numbers are invisible in your dashboards, vacuum will surprise you at the worst time.

## 4. See It In Practice — Real Code or Queries

All of these are real PostgreSQL SQL. Run them in `psql`. Assume a table like `orders(id serial primary key, status text, updated_at timestamptz)`.

Check which tables are bloated and whether autovacuum is keeping up:

```sql
-- Fast health check: dead tuple ratio and last autovacuum
SELECT relname,
       n_live_tup,
       n_dead_tup,
       ROUND(n_dead_tup * 100.0 / GREATEST(n_live_tup + n_dead_tup, 1), 1) AS dead_pct,
       last_autovacuum,
       last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 10;
-- If dead_pct is >10-15% or n_dead_tup is millions, that table is bloated.
-- If last_autovacuum is days old despite high dead count, something is blocking it.
```

Force cleanup now instead of waiting for the scheduler:

```sql
-- Lightweight, production-safe: reclaims reusable space, updates FSM and visibility map
-- Takes only ShareUpdateExclusiveLock, reads and writes continue.
VACUUM VERBOSE orders;

-- Do both jobs at once after a bulk update
VACUUM (ANALYZE, VERBOSE) orders;

-- Shrink the file and rebuild indexes — locks the table completely, do not run on hot prod
VACUUM FULL VERBOSE orders;
-- Every SELECT, INSERT, UPDATE, DELETE on orders blocks until this finishes.
```

Look at physical tuple metadata to see dead tuples exist:

```sql
-- ctid is physical location (page, slot), xmin/xmax are the MVCC stamps
SELECT ctid, xmin, xmax, id, status FROM orders WHERE id = 42;
-- After UPDATE orders SET status='shipped' WHERE id=42, ctid changes and old ctid slot becomes dead.

-- After many updates, VACUUM VERBOSE will print lines like
-- "removable cutoff: 18234" and "found 12040 removable, 430 nonremovable row versions"
-- "nonremovable" usually means a long-running transaction is pinning them.
```

Find who is blocking cleanup:

```sql
-- Any transaction older than a few minutes can pin dead tuples cluster-wide
SELECT pid, usename, state, xact_start, now() - xact_start AS age, query
FROM pg_stat_activity
WHERE state IN ('active', 'idle in transaction')
  AND xact_start IS NOT NULL
ORDER BY xact_start;
-- Kill or fix the app code that does BEGIN and then awaits an HTTP call.
```

Monitor wraparound margin — the number that triggers the shutdown story:

```sql
-- Per-database margin, 2 billion is the danger zone
SELECT datname, age(datfrozenxid) AS xid_age
FROM pg_database
ORDER BY xid_age DESC;

-- Per-table detail, including the relfrozenxid the task asked you to watch
SELECT relname, relfrozenxid, age(relfrozenxid) AS xid_age
FROM pg_class
WHERE relname = 'orders';

-- While a big vacuum is running, watch progress instead of guessing
SELECT * FROM pg_stat_progress_vacuum;
```

Tune a hot table so autovacuum cleans in small bites instead of huge infrequent waves:

```sql
-- A 200-million-row events table with defaults would wait for 40M dead tuples — way too late
ALTER TABLE orders SET (
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_vacuum_threshold = 10000,
    autovacuum_analyze_scale_factor = 0.01
);

-- Confirm it stuck (reloptions is the per-table override store)
SELECT relname, reloptions FROM pg_class WHERE relname = 'orders';
```

Measure true bloat when you need numbers for a maintenance window (requires pgstattuple):

```sql
CREATE EXTENSION IF NOT EXISTS pgstattuple;
SELECT * FROM pgstattuple('orders');
-- Look at dead_tuple_count, dead_tuple_len, free_space — that is bloat you can reclaim
-- but only VACUUM FULL or pg_repack will return it to the OS.
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is VACUUM and why does PostgreSQL need it at all?**

Because PostgreSQL never updates or deletes a row in place. An UPDATE writes a new full tuple and marks the old one dead, a DELETE just marks it dead. That heap-based MVCC design is why readers never block writers, but it leaves dead tuples littering every page. Without VACUUM those dead versions pile up, sequential scans get slower because they read dead rows only to ignore them, indexes accumulate pointers to dead heap slots, the table and its indexes bloat, and old transaction IDs stay unfrozen, walking the whole database toward wraparound. VACUUM is the cleanup pass that removes dead tuples you know no snapshot can see, makes the space reusable, updates the visibility map so later reads are faster, and freezes old IDs.

**Q: What exactly does a normal VACUUM do to the table files?**

It scans pages, and for each dead tuple it checks visibility against the global oldest horizon. If the tuple is dead to all snapshots, it unlinks it and inserts that slot into the free space map for reuse by the same table's future inserts and updates. It sets hint bits and updates the visibility map for pages that become all-visible, and it updates the freeze map and `relfrozenxid`. It does not rewrite the file and does not return space to the OS except for wholly empty pages at the tail it can truncate. Think reuse, not shrink.

**Q: What is the difference between VACUUM and VACUUM FULL?**

Normal VACUUM reclaims space for reuse inside the existing file, runs concurrently with reads and writes, and is cheap enough to run often. VACUUM FULL rewrites the entire table into a compact new file with only live tuples, truly shrinking the file and returning disk, but it takes an ACCESS EXCLUSIVE lock that blocks every read and write on that table until it finishes and needs extra disk to build the copy. Rule is simple: use normal VACUUM for daily hygiene, reserve VACUUM FULL for a planned maintenance window when bloat is catastrophic, and consider `pg_repack` if you cannot tolerate the lock.

**Q: What is the difference between VACUUM and ANALYZE?**

They solve different problems. VACUUM is storage hygiene — removing dead tuples and freezing transaction IDs. ANALYZE is planner knowledge — sampling the table to refresh statistics in `pg_statistic` that the query planner uses to choose indexes and join orders. A bloated slow scan points at missing VACUUM. A query that suddenly picks a terrible plan after data changed points at missing ANALYZE. `VACUUM ANALYZE` runs both together and autovacuum schedules them separately because the triggers are different.

**Q: How does autovacuum decide when to run, and when would you force a manual VACUUM?**

Autovacuum triggers per table when `n_dead_tup > autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor * n_live_tup` or when `age(relfrozenxid)` exceeds `autovacuum_freeze_max_age` for anti-wraparound, whichever comes first. You force a manual `VACUUM` after a known heavy operation — a bulk UPDATE that touched millions of rows, a large DELETE, or a data import — because you do not want to wait for the threshold to be crossed. You also tune busy tables per table with `ALTER TABLE ... SET (autovacuum_vacuum_scale_factor = 0.02)` so the threshold is tighter than the default 20 percent.

**Q: What is transaction ID wraparound and how does VACUUM prevent it?**

Transaction IDs are 32-bit, so there are about 4.29 billion values before the counter wraps. PostgreSQL compares IDs with wraparound-aware math, so if the counter actually wrapped, ancient rows would look as if they were from the future and disappear. To stop that, VACUUM freezes rows whose `xmin` is old enough, marking them with a special FrozenXID that means visible to everyone without comparison. Autovacuum forces this freeze when `age(relfrozenxid)` passes 200 million. If you ignore it long enough, Postgres escalates from log warnings to refusing new transaction IDs entirely, which looks like the database being down. The fix is always an aggressive VACUUM to advance `relfrozenxid`, and in severe cases you do it from single-user mode.

**Q: How do you tell if a table actually needs vacuuming?**

Check `pg_stat_user_tables` for `n_dead_tup` and its ratio to `n_live_tup`, and compare `last_autovacuum` to current `n_dead_tup`. A healthy busy table vacuums regularly so the dead count stays low. A sick table shows millions of dead tuples or a dead percentage above ~15 percent, and either a recent autovacuum that cannot keep up or an old one that never triggers. Then run `SELECT relname, age(relfrozenxid) FROM pg_class WHERE relname='...'` to check freeze age, and `pg_stat_progress_vacuum` while a vacuum is running to see phase and heap blocks processed. For precise numbers, `pgstattuple('tablename')` tells you exact dead tuple bytes and free space.

**Q: Why can VACUUM appear to do nothing — zero dead tuples removed — even though you know you deleted rows?**

Because something is pinning the horizon. VACUUM can only remove a dead tuple if no active snapshot could still need to see it. One `idle in transaction` backend, one long analytics SELECT, one orphaned prepared transaction, one stale replication slot, or on a standby `hot_standby_feedback` holding an old xmin — any of those keeps the global oldest xmin old, and every dead tuple newer than that horizon is stuck. `VACUUM VERBOSE` will say "dead row versions cannot be removed yet" and tell you the cutoff. Find the holder in `pg_stat_activity` ordered by `xact_start` or `pg_replication_slots` and fix the source — no amount of vacuuming helps until the horizon moves.

## 6. The Traps — What Goes Wrong in Production

Running VACUUM FULL on a production hot table to get disk back urgently. The wrong assumption is that VACUUM FULL is just a stronger VACUUM. It is a full rewrite behind an ACCESS EXCLUSIVE lock that blocks every read and write on that table. Teams run it at noon because `df` showed the disk full, and the whole orders page goes down until the rewrite finishes, which on a 100GB table can be 10 to 30 minutes with no graceful failover. They also forget it needs free disk to build the new file, so it can fail with out-of-disk halfway through. The fix is to never treat VACUUM FULL as emergency hygiene: use normal `VACUUM` for reuse, schedule `VACUUM FULL` or `pg_repack` in a maintenance window with a replica to test timing, and alert on bloat before the disk is full.

Disabling autovacuum on a busy table because it causes IO spikes. This is the most damaging shortcut in PostgreSQL operations. Autovacuum's I/O is not waste, it is the cost of MVCC. Turn it off and three things happen: the table bloats and every sequential scan slows down, the planner stats go stale so queries pick worse plans, and the table's `relfrozenxid` age silently climbs toward 200 million without a freeze pass. Weeks later you get both slow queries and a wraparound warning in the same incident, and the recovery vacuum now takes hours precisely because you deferred the small frequent cleanups. The right fix is the opposite: make autovacuum gentler per second by lowering `autovacuum_vacuum_cost_delay` or raising `autovacuum_vacuum_cost_limit`, and make it more frequent on the hot table by tuning scale factor down per table so each pass is small and short.

Expecting VACUUM to shrink the file after a big DELETE. You delete 10 million rows, run `VACUUM`, and `df -h` does not change, so you think VACUUM is broken and try again harder. It is not broken — normal VACUUM only marks space reusable inside the same file. The file stays big, the next migration that needs temporary disk still fails, and the pager goes off at 2am. The fix is to measure the right thing: watch `n_dead_tup` and `pgstattuple` free space for reusable space, and reserve VACUUM FULL or `pg_repack` for when you truly need the OS to see the bytes again.

Leaving a transaction open across application work so VACUUM can never make progress. A common pattern is `BEGIN; SELECT ...; await fetch('https://payment/...'); COMMIT;` inside a Node.js route. That transaction holds a snapshot across a network call, pinning the global horizon, so every dead tuple created anywhere in the database while that request is outstanding is immortal. Run a few hundred of those concurrently and `n_dead_tup` climbs on every table. The trap is that the vacuum logs look fine — autovacuum runs, finds dead tuples, reports nonremovable — but no space is reclaimed. Fix it by doing network I/O outside the transaction, setting `idle_in_transaction_session_timeout`, and alerting on `now() - xact_start` age in `pg_stat_activity`.

Forgetting that VACUUM alone does not fix planner regressions. After vacuuming a freshly bulk-loaded table you see sequential scans still choosing a bad plan and assume the vacuum failed. It did not — the table is clean, but ANALYZE never ran, so `pg_statistic` still describes the empty table. Run `ANALYZE` or `VACUUM ANALYZE`, or watch `last_autoanalyze` and `n_mod_since_analyze` in `pg_stat_user_tables` as closely as you watch dead tuples.

## 7. Compare With Related Concepts

**VACUUM vs TRUNCATE vs REINDEX.** These three get mixed up because all of them can make a table faster, but they do utterly different things to the data.

VACUUM cleans dead tuple slots inside the existing table file so future writes reuse them. Rows stay, indexes stay, reads and writes continue. Use it for steady-state churn. Rule: the everyday janitor — safe to run anytime.

VACUUM FULL rebuilds the entire table and its indexes into a compact new file. Live rows stay, bloat is gone, disk returns to the OS. But it locks the table for everything. Use it for catastrophic heap bloat when you can afford a maintenance window. Rule: surgery, not hygiene.

TRUNCATE instantly drops every row, resets the file to empty, and returns disk immediately, with a fast ACCESS EXCLUSIVE lock that usually completes in milliseconds because there is no row-by-row work or WAL per row. It does not care about dead tuples — there are no live rows left. Use it when you really want an empty table, like wiping a staging import table. Rule: TRUNCATE is atomic emptying, not garbage collection — never a substitute for VACUUM on a live production table you want to keep.

REINDEX rebuilds indexes, not the heap. Heavy updates, random UUID inserts, or a failed `CREATE INDEX` can leave indexes themselves bloated and fragmented even when the heap is reasonably clean. A bloated index has extra pages and dead heap pointers that slow lookups, and vacuuming the heap does not fully defragment it. `REINDEX CONCURRENTLY` on modern Postgres rebuilds the index without blocking writes and is the right answer when `pgstattuple` or `pg_stat_user_indexes` shows index bloat but `n_dead_tup` is low. Rule: slow index scans with healthy heap size point at REINDEX, slow sequential scans with high dead tuple counts point at VACUUM.

Put together: bloated data files with live data you want to keep point at VACUUM or, when dead space is huge and contiguous, VACUUM FULL or `pg_repack`. Bloated indexes with a clean-ish heap point at REINDEX. An emptying job that should be fast and reclaim disk at once points at TRUNCATE.

## 8. 🧠 The Memory Hook

Postgres never erases — every update or delete just leaves a VOID-stamped copy in the drawer. VACUUM is the janitor who shreds the VOID copies no one could still need and leaves the empty slots reusable, and VACUUM FULL is the janitor who locks the office and rebuilds the whole cabinet tight. Forget the janitor and the cabinet either bursts at the seams or the building shuts the doors when the serial numbers run out.
