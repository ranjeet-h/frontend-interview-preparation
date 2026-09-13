# What Is Autovacuum

## 1. The Real-World Problem — When You Actually Hit This

Your orders service has been running fine for months. Then support tickets start coming in: order history takes six seconds to load. You run `EXPLAIN` and nothing changed — same plan, same query. Meanwhile `du -sh` shows the database has tripled in size even though your row counts are flat. Someone deleted a million test orders last week and the disk usage didn't drop a single byte. Everyone starts blaming the ORM.

Then it gets worse. At 3am the primary starts throwing `database is not accepting commands to avoid wraparound data loss` and refuses every write. The app is effectively down, and nobody on the team has ever heard of that error. Both failures have the same root cause: PostgreSQL was quietly leaving garbage behind with every UPDATE and DELETE, and the automatic cleanup process — autovacuum — either couldn't keep up or had been turned off because "it caused IO spikes." This page is about that process: why Postgres needs it, how it decides when to clean, and how teams get burned when they ignore it.

## 2. The Analogy — Make the Mechanic Obvious

Picture an office where nobody is allowed to erase anything. When an employee fixes a mistake on a form, they don't edit the form — they fill out a brand new copy and stamp the old one "VOID". When someone cancels a form entirely, they just stamp it VOID too. The filing cabinet still holds every voided sheet. This is exactly how PostgreSQL's [MVCC](what-is-mvcc.md) works: readers never block writers and writers never block readers, but every update and delete leaves an invisible dead copy behind.

Now picture the night janitor. After everyone goes home, he walks through the departments, pulls out the VOID sheets, and frees up that folder space so tomorrow's forms can use it. He doesn't sell the empty folders back to the stationery store — the space just becomes reusable. That's autovacuum reclaiming dead tuple space inside the table's files.

The janitor is also smart about scheduling. Each department has a counter of voided sheets. If a small department has 5% of its sheets voided, that's noticeable, so he cleans. His rule isn't "clean every night" — it's "clean when the void count crosses a line based on how much paperwork the department holds." That's the per-table trigger formula we'll see below.

Two more details make the analogy complete. First, the janitor also rewrites each department's summary index card — the one that says roughly how many active forms exist and what they look like — because stale summaries make everyone slower when searching. That's `ANALYZE`, which refreshes the planner's statistics. Second, the building stamps forms with sequential serial numbers from a stamp that only has four billion digits. Old forms' serial numbers can't be retired unless someone officially marks them as "done, number recycled." Once in a very long while the janitor does a mandatory sweep to do exactly that, because if the building ever reuses a serial number while an old form is still readable, records get corrupted. That sweep is the anti-wraparound vacuum, and skipping janitor shifts for years is how you end up with a database refusing writes at 3am.

## 3. The Full Explanation — How It Actually Works

Start with the core fact everything else follows from: **PostgreSQL never edits a row in place**. An `UPDATE` writes a new physical version of the row and leaves the old version behind, marked so that only older transactions can still see it. A `DELETE` doesn't remove anything either — it just marks the row as invisible to future transactions. These invisible leftovers are called **dead tuples**, and the versioning system that makes this concurrency style work is MVCC (multi-version concurrency control). The trade-off you accept for "readers never block writers" is that cleanup is a separate job.

That job is `VACUUM`. Plain `VACUUM` scans a table, finds dead tuples, and marks the space they occupied as free for *reuse by that same table*. This is the detail most people miss: normal vacuum does not shrink the file on disk and does not hand memory or disk back to the operating system. The table's size on disk usually stays exactly the same; the space inside it just becomes available again for new inserts and updates. (One exception: if whole pages at the very end of the table become completely empty, vacuum can truncate them off.)

Autovacuum is the background system that runs this automatically. It's a launcher process plus a pool of worker processes (`autovacuum_max_workers`, default 3). Roughly once a minute (`autovacuum_naptime`) the launcher picks a database and sends a worker to check its tables against PostgreSQL's running counters of inserted, updated, and deleted tuples. A table gets vacuumed when its estimated dead tuples cross this line:

```txt
dead tuples > autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor × live rows estimate
```

With the defaults (threshold 50, scale factor 0.2), a 10-million-row table needs over 2 million dead tuples before anyone comes to clean it. On top of that, workers deliberately slow themselves down — tiny sleeps between pages, controlled by cost settings like `autovacuum_vacuum_cost_delay` — so cleanup never crushes production IO. That politeness is also why a badly bloated table can take hours to clean.

The same pass (or a sibling pass) runs `ANALYZE`, which samples the table and refreshes the statistics the query planner uses to pick plans. Stale stats are why a query that was fine yesterday suddenly chooses a terrible index scan today. Autovacuum triggers analyze with its own, tighter formula (`autovacuum_analyze_threshold + autovacuum_analyze_scale_factor × rows`, defaults 50 and 0.1), because bad plans hurt faster than bloat does.

Now the scary part: transaction ID wraparound. Every transaction gets an ID from a 32-bit counter, so there are only about 4.29 billion IDs, and PostgreSQL compares them with wraparound-aware arithmetic. To stop old rows from becoming "in the future" and vanishing when the counter wraps, vacuum *freezes* rows whose transaction IDs are old enough, replacing the ID with a special marker meaning "this row is visible to everyone, forever, no comparison needed." Autovacuum proactively does this whenever a table's oldest unfrozen transaction ID exceeds `autovacuum_freeze_max_age` (default 200 million) — even if the table has zero dead tuples. If a database ignores this and creeps toward the edge of the ID space, PostgreSQL escalates: first warnings in logs, then it refuses to assign new transaction IDs — every write fails with the wraparound error — until someone vacuums. In older setups this looked like the server shutting itself down. It's not a bug; it's the database refusing to risk corrupting your data, and the fix is always vacuum, run aggressively, sometimes from single-user mode in the worst cases.

What about the tables that are already badly bloated? Plain vacuum makes the space reusable, but the file stays big. `VACUUM FULL` is the sledgehammer: it copies every live row into a fresh compacted copy of the table and swaps them, genuinely returning disk to the OS. The price is an `ACCESS EXCLUSIVE` lock — no reads, no writes, nothing — for the duration, which on a large hot table means a full outage of that table. That's why autovacuum is the everyday tool and `VACUUM FULL` is a scheduled-maintenance event, with tools like `pg_repack` existing to get the compaction without the lock.

Tuning enters the picture because the default formula fits medium tables, not hot giants. For a 500-million-row events table, 20% means 100 million dead tuples accumulate before cleanup even starts — unacceptable. So you override per table with `ALTER TABLE ... SET (...)`: lower the scale factor (or set it near zero and control things with a fixed threshold), maybe raise the cost limit so the worker can move faster, and let the rest of the database keep the sane defaults. Per-table settings are the normal way real systems run; global-only tuning is a smell.

Finally, observability. `pg_stat_user_tables` tells you the truth about every table: estimated live and dead tuples (`n_live_tup`, `n_dead_tup`), when autovacuum last ran (`last_autovacuum`), how many times it ran, and rows modified since the last analyze (`n_mod_since_analyze`). Set `log_autovacuum_min_duration` so every nontrivial vacuum lands in the logs with its timings and tuple counts, and watch the database-level `age(datfrozenxid)` as your wraparound safety margin. If those numbers are visible, none of this ever surprises you at 3am.

## 4. See It In Practice — Real Code or Queries

First, find your worst offenders. This is the query I'd run on any Postgres box that feels bloated or slow on writes:

```sql
-- Which tables are hoarding dead tuples and getting neglected by autovacuum?
SELECT relname,
       n_live_tup,
       n_dead_tup,
       ROUND(n_dead_tup * 100.0 / GREATEST(n_live_tup + n_dead_tup, 1), 1) AS dead_pct,
       last_autovacuum,
       n_mod_since_analyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 10;
```

A high `n_dead_tup` with an old or null `last_autovacuum` is the smoking gun. Either autovacuum hasn't crossed its threshold yet (scale factor too loose for this table), or something is blocking cleanup — more on that in the traps.

Next, understand the trigger math with the defaults so tuning decisions aren't guesses:

```sql
SHOW autovacuum_vacuum_threshold;      -- 50
SHOW autovacuum_vacuum_scale_factor;   -- 0.2

-- A 10,000,000-row table vacuums only after:
--   50 + 0.2 * 10,000,000 ≈ 2,000,000 dead tuples
-- A 500,000,000-row table? 100,000,000 dead tuples. Unacceptable for a hot table.
```

So give hot or giant tables their own settings. This is the standard fix, and it survives restarts because it's stored with the table:

```sql
ALTER TABLE orders SET (
    autovacuum_vacuum_scale_factor = 0.02,  -- clean after ~2% churn instead of 20%
    autovacuum_vacuum_threshold    = 10000, -- and never wait beyond 10k dead rows
    autovacuum_analyze_scale_factor = 0.01  -- refresh planner stats more eagerly
);

-- Verify it stuck:
SELECT relname, reloptions FROM pg_class WHERE relname = 'orders';
```

When you're mid-incident and need cleanup now instead of waiting for the launcher:

```sql
VACUUM (ANALYZE) orders;
-- Reclaims dead-tuple space for reuse AND refreshes planner stats.
-- Takes only a ShareUpdateExclusiveLock: reads and writes continue fine.

VACUUM FULL orders;
-- Compacts the table and returns disk to the OS — but takes ACCESS EXCLUSIVE.
-- Zero reads, zero writes until it finishes. Schedule it, never improvise it.

-- While a big vacuum runs, watch its progress instead of guessing:
SELECT * FROM pg_stat_progress_vacuum;

-- And keep an eye on your wraparound safety margin across databases:
SELECT datname, age(datfrozenxid) AS xid_age FROM pg_database ORDER BY xid_age DESC;
```

If `xid_age` starts climbing past a few hundred million on some database, treat it as an incident, not a curiosity — that number approaching two billion is what produces the refuse-writes emergency from the opening story.

## 5. Interview Questions — All of Them, Done Properly

**Q: Why does PostgreSQL need vacuum at all? Other databases don't seem to have this.**

Because of how Postgres implements MVCC. When you update or delete a row, Postgres doesn't touch the original — it writes a new version (or a tombstone marker) and relies on transaction visibility rules so each reader sees the correct snapshot. Readers never wait on writers and vice versa, which is a massive concurrency win. The cost is that dead versions physically pile up inside the table until something removes them, and that something is vacuum. Databases like MySQL/InnoDB take the opposite trade-off: undo-based cleanup with different pain points. Neither design is free — they've just chosen where the bill arrives.

**Q: When exactly does autovacuum decide to clean a table?**

Per table, when the tracked number of dead tuples exceeds `autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor × (estimated live rows)`. Defaults are 50 and 0.2. The launcher wakes every `autovacuum_naptime` (one minute), hands tables to worker processes, and each worker compares the counters against that line. Separately, a table whose oldest unfrozen transaction ID passes `autovacuum_freeze_max_age` (200 million) gets an aggressive anti-wraparound vacuum regardless of dead tuples. Knowing both triggers — bloat-driven and wraparound-driven — is what separates a real answer from a memorized one.

**Q: What's the actual difference between VACUUM and VACUUM FULL?**

Plain `VACUUM` marks dead tuples' space as reusable within the table. It runs concurrently with normal reads and writes (only a ShareUpdateExclusive lock, so it coexists with everything except other vacuums and DDL on that table). The file doesn't shrink. `VACUUM FULL` rewrites the entire table into a compacted copy and swaps it in, genuinely shrinking the file and returning disk to the OS — while holding an ACCESS EXCLUSIVE lock that blocks every single query against the table until it finishes. Rule of thumb: vacuum is hygiene, VACUUM FULL is surgery you schedule.

**Q: Does vacuum give disk space back to the operating system?**

Almost never, and this trips up nearly everyone. Plain vacuum frees space *inside* the table's files for future inserts and updates in that table — disk usage shown by `df` won't move. Only wholly-empty trailing pages get truncated occasionally. If you actually need the disk back, it's `VACUUM FULL`, or the online alternative `pg_repack`. In an interview, saying "vacuum reclaims space for reuse, not for the OS, and here's why that distinction matters operationally" signals you've operated a database, not just read about one.

**Q: Explain transaction ID wraparound and what Postgres does to prevent it.**

Transaction IDs are 32 bits — about 4.29 billion values — and Postgres compares row versions using ID arithmetic, so if the counter wrapped around, ancient rows would suddenly appear to be from the future and disappear from view. Data corruption by arithmetic. The defense is freezing: vacuum replaces sufficiently old transaction IDs on rows with a frozen marker that needs no comparison. Autovacuum forces this work whenever a table's oldest XID age passes 200 million. And Postgres protects itself with escalating alarms: warnings in logs well before danger, then outright refusal to assign new transaction IDs (every write fails) when the remaining safe margin is nearly gone. That forced write-stop is the "wraparound shutdown" war story — the database choosing temporary downtime over silent corruption.

**Q: Your hottest table is 400 million rows and constantly updated. Default autovacuum is failing it. What do you do?**

Don't touch the globals — fix that table specifically. With the default 0.2 scale factor it waits for ~80 million dead tuples, so lower the scale factor (something like 0.01–0.02) or push it near zero and rely on a fixed threshold, then let autovacuum run far more often but in smaller bites. Consider raising `autovacuum_vacuum_cost_limit` or lowering `autovacuum_vacuum_cost_delay` for that table so workers clean faster without hurting neighbors. Check whether updates could use a lower `fillfactor` so HOT updates stay on the same page and generate less index churn. And confirm autovacuum isn't being starved by long transactions — tuning is pointless if cleanup is blocked anyway.

**Q: How do you monitor autovacuum health in production?**

Three layers. Table level: `pg_stat_user_tables` gives `n_dead_tup`, `last_autovacuum`, `autovacuum_count`, and `n_mod_since_analyze`; alert when dead tuples trend upward or a normally-vacuumed table hasn't been touched in days. Process level: `pg_stat_progress_vacuum` shows what a currently running vacuum is doing, and `log_autovacuum_min_duration` puts completion details in the logs. Fleet level: `age(datfrozenxid)` per database as the wraparound margin, plus disk growth rate as a lagging indicator of bloat. Also verify the foundation is on: autovacuum depends on the statistics collector (`track_counts`) — without it, the triggers never fire.

**Q: Dead tuples keep growing even though autovacuum runs. What's going on?**

Vacuum can only remove tuples that no possible transaction might still need to see. Its cleanup horizon is the oldest transaction snapshot in the cluster — the xmin horizon. One forgotten transaction left open since Tuesday (a psql session someone abandoned, a stuck batch job, an application in a hung state) pins every dead tuple created after it started. Same effect from an orphaned replication slot or, on standby servers, unapplied hot standby feedback. The fix is finding the holder: `pg_stat_activity` ordered by `xact_start`, `pg_replication_slots` for stale slots. This question is popular precisely because the answer shows whether you understand vacuum's limits, not just its purpose.

## 6. The Traps — What Goes Wrong in Production

**Disabling autovacuum on busy tables because "it causes IO spikes."** The wrong assumption: autovacuum is overhead you can switch off and deal with manually. Reality: manual vacuuming never happens reliably at 3am, so on a high-churn table dead tuples pile up fast. The table bloats, sequential scans read mostly garbage, indexes fill with entries pointing at dead rows, queries degrade, and — the part people forget — the table stops having its transaction IDs frozen, quietly walking toward the wraparound wall. The right move is the opposite of disabling: tune the table so autovacuum runs *more often in smaller chunks*, and adjust cost settings so it's gentler per second. If a team disabled it, the honest diagnosis is usually that defaults were wrong for that table, not that autovacuum is the enemy.

**Assuming vacuum returns space to the OS.** The wrong assumption: `DELETE` ten million rows, run `VACUUM`, watch `df` show free disk again. What actually happens: vacuum marks that space reusable *within the table's files* — total file size barely moves, so the disk stays full and the next migration or WAL spike fails with ENOSPC anyway. Teams discover this mid-emergency. Fix: know which tool does what — plain vacuum for reuse, `VACUUM FULL` or `pg_repack` for genuine shrinkage — and monitor table-level bloat (`n_dead_tup`) rather than assuming deleted rows mean free bytes.

**Trusting the 20% default on a huge table.** The wrong assumption: PostgreSQL's defaults are sensible for my workload. They were calibrated for medium-sized tables. On a 500-million-row table, 20% is 100 million dead rows accumulating before the cleaner even shows up — hundreds of gigabytes of garbage slowing every scan along the way. What happens in practice is a sawtooth: weeks of degradation, then one painful emergency `VACUUM FULL`. Fix: any table above tens of millions of rows with regular updates deserves explicit per-table `autovacuum_*` settings decided by its churn rate, not by the global default.

**Leaving transactions open and wondering why nothing gets cleaned.** The wrong assumption: vacuum removes all dead tuples when it runs. It can't — anything newer than the oldest still-open snapshot must survive, because that transaction is legally allowed to read it. One idle-in-transaction connection, one abandoned `BEGIN` in a terminal, one stuck analytics job, and dead tuples accumulate everywhere in the database despite perfectly tuned autovacuum. Fix: set `idle_in_transaction_session_timeout`, alert on long `xact_start` ages, and audit replication slots. Cleanup capacity is jointly determined by autovacuum's speed *and* the shortest-lived transaction in your fleet — interviews love probing this boundary.

## 7. Compare With Related Concepts

**Autovacuum vs manual VACUUM.** Autovacuum is the always-on background janitor driven by thresholds; manual `VACUUM` is you deciding cleanup timing explicitly. Rule: rely on autovacuum for daily life, go manual for incident response or right before known-heavy operations.

**Plain VACUUM vs VACUUM FULL.** Plain vacuum reclaims space for reuse while reads and writes continue; VACUUM FULL compacts the file and returns disk to the OS but locks the table against everything. Rule: plain vacuum routinely, VACUUM FULL only in a scheduled window when bloat is genuinely unrecoverable otherwise.

**VACUUM FULL vs REINDEX.** VACUUM FULL rebuilds the whole table including its indexes; `REINDEX` rebuilds just the indexes, fixing index bloat (from heavy updates, random UUID inserts, killed index builds) without touching the heap. Rule: bloated data files → VACUUM FULL/pg_repack; degraded index performance with healthy table size → REINDEX (prefer `REINDEX CONCURRENTLY` on modern Postgres to avoid the exclusive lock).

**Vacuum vs ANALYZE.** Vacuum handles storage hygiene — dead tuple removal and XID freezing; ANALYZE handles planner knowledge — sampling data distributions into the statistics the query optimizer uses. Rule: slow queries with bad plans point at ANALYZE/stale stats; growing tables and disks point at VACUUM. Autovacuum conveniently runs both, which is exactly why turning it off silently breaks both halves.

Both foundations have their own pages if you want depth beyond this one: [what-is-vacuum](what-is-vacuum.md) covers the manual command's mechanics, and [what-is-mvcc](what-is-mvcc.md) covers the versioning model that creates the dead tuples in the first place.

## 8. 🧠 The Memory Hook

Postgres never erases anything — every update and delete just leaves a stamped-VOID copy behind, and autovacuum is the night janitor who clears those out so the shelf space can be reused, tidies the summary cards so searches stay fast, and occasionally does a mandatory sweep so the serial-number stamp never runs out. Turn the janitor away from your busiest room, and eventually the building fills with voided paper and slams shut until someone cleans it.
