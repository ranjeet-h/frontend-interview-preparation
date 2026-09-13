# How Do You Optimize Slow PostgreSQL Queries

## 1. The Real-World Problem — When You Actually Hit This

It's 4pm on a Tuesday. Support pings you: customers say their order-history page sometimes takes eight seconds to load. You pull the same query up locally — it returns in 40 milliseconds. Nothing deployed today. No schema change in weeks. The database CPU looks fine. And yet production users are watching spinners while your local copy of the exact same query breezes through.

This is the moment that separates developers who guess from developers who diagnose. Guessing sounds like "let's add an index" or "let's bump the instance size" — expensive changes applied blind, often fixing nothing. Diagnosing means following a loop: find out which queries actually cost the most time across the whole system, watch one of them really execute and see where the time goes, check what else the database is busy doing right now, check whether the table has quietly filled up with dead row versions, and only then apply a fix — usually an index, sometimes a query rewrite, occasionally a vacuum. PostgreSQL gives you a precise tool for every one of those steps. This page teaches the loop itself, because "walk me through how you'd debug a slow query" is one of the most common senior interview questions there is.

## 2. The Analogy — Make the Mechanic Obvious

Think about how a good emergency-room doctor handles a patient who walks in saying "I feel awful." The doctor does not start operating. They work a diagnosis loop, and every tool in our loop has a direct counterpart.

First, the doctor reads the chart — the hospital's record of every visit this patient ever made, with dates, durations, and complaints. In PostgreSQL, that chart is `pg_stat_statements`: it remembers every shape of query the server has run, how many times, for how long in total. Before touching anything, the doctor finds the complaint that accounts for the most suffering overall — not necessarily the scariest single episode.

Second, the doctor orders a stress test: put sensors on the patient and make them actually run on the treadmill, then watch what happens. That is `EXPLAIN (ANALYZE, BUFFERS)` — the query genuinely executes while Postgres instruments every step. (Asking for a plain `EXPLAIN` is the doctor predicting what would happen on the treadmill without ever letting them on it. Predictions are useful, measurements are better.)

Third, the nurse checks the ward's live monitors — who's in which bed right now, whose heart rate is spiking, who's been waiting two hours for a room that's occupied. That's `pg_stat_activity`: every live database session, what it's doing, and crucially, what it's waiting for. A lock wait is a patient stuck outside a room because someone else is still inside.

Fourth, the doctor notices a chronic condition: years of plaque buildup the body's own cleanup crew never fully cleared. Dead row versions are exactly that — leftovers from updates and deletes that pile up until scans wade through gunk. The cleanup crew is autovacuum, and it skips shifts whenever some long-open transaction keeps holding the door.

Only after all of that does the doctor treat the diagnosed cause — a stent where the blockage actually is, not a generic prescription for everything. An index is a stent: placed at the exact spot the evidence pointed to. And afterward, the doctor re-runs the test to confirm the fix. So does a good engineer.

## 3. The Full Explanation — How It Actually Works

Everything below is PostgreSQL-specific — the tool names, views, and syntax belong to Postgres, not to SQL in general. The loop has five named steps. Run them in order, because each one tells you whether the next one is even needed.

**Step 1 — Rank the suspects with `pg_stat_statements`.** Your slow endpoint told you one query hurts, but you don't actually know yet whether it's the biggest problem in the system — or whether ten other quiet queries are collectively eating your database alive. `pg_stat_statements` is an extension that records every distinct query *shape* (it collapses literal values into placeholders, so `customer_id = 42` and `customer_id = 99` count as one entry) along with call count, total time, mean time, rows returned, and whether sorts spilled to disk. It needs a small setup: `shared_preload_libraries = 'pg_stat_statements'` in the config plus a restart, then `CREATE EXTENSION pg_stat_statements;` in the database. Once it's on, sort by **total** time first, not mean time. A query that takes 5ms but runs 200,000 times an hour costs 1000 seconds of database time per hour; a query taking 8 seconds once a day barely registers in comparison. Mean time finds the dramatic outlier; total time finds where the server's life actually goes.

**Step 2 — Watch the worst query really run with `EXPLAIN (ANALYZE, BUFFERS)`.** Now you take your top suspect onto the treadmill. Plain `EXPLAIN` shows the *plan* — the strategy Postgres' planner picked (sequential scan, index scan, nested loop, hash join, sort) based on statistics and guesses. Adding `ANALYZE` actually executes the statement and replaces those estimates with measured reality: real milliseconds per node, real row counts, real number of times each node looped. Adding `BUFFERS` shows the memory story — how many 8KB pages were served from Postgres' cache (`shared hit`) versus read from disk (`read`), and whether a sort spilled into temporary files (`temp written`) because it didn't fit in `work_mem`.

Three signals in that output carry most of the diagnostic weight. First, **estimated rows versus actual rows**: if the planner guessed 10 rows and reality was 500,000, its whole strategy choice was made on bad information — the fix is fresher statistics (`ANALYZE tablename;`), not an index. Second, **`Rows Removed by Filter`**: a sequential scan that reads 200,000 rows and throws away 196,000 of them is the classic fingerprint of a missing index. Third, **cache ratio and temp files**: lots of disk reads means the working set doesn't fit in cache; lots of temp blocks means sorts and hashes are hitting the disk and might want more `work_mem` for that specific case.

One safety rule before you run it: `ANALYZE` means the statement *really executes*. For a `SELECT` that's harmless. For an `UPDATE` or `DELETE`, wrap it in a transaction and roll back:

```sql
BEGIN;
EXPLAIN (ANALYZE, BUFFERS) DELETE FROM orders WHERE created_at < now() - interval '3 years';
ROLLBACK;
```

You get the full measured plan; the data survives. There is a small measurement tax too — instrumenting a query makes it slightly slower than uninstrumented — so compare relative shapes, not absolute gospel numbers.

**Step 3 — Check what the database is doing right now with `pg_stat_activity`.** Sometimes the query plan is innocent and the real story is contention. `pg_stat_activity` shows one row per live session: its state (`active`, `idle`, or the dangerous `idle in transaction`), its `wait_event_type` and `wait_event`, and how long it's been running. Two patterns jump out. If sessions sit in `active` with `wait_event_type = Lock`, they're queued behind someone else holding a lock — join against `pg_locks` to identify the blocker (query in section 4). If you see sessions lingering in `idle in transaction`, an application opened a transaction, did a bit of work, and walked away without committing. Those zombies hold locks *and* stop vacuum from cleaning up anywhere in the database, which connects directly to the next step. For an immediate unblock, `pg_cancel_backend(pid)` politely cancels one query; `pg_terminate_backend(pid)` drops the whole connection — stronger medicine, use it second.

**Step 4 — Weigh the dead rows with the bloat stats before blaming the query.** Postgres' MVCC design means an `UPDATE` doesn't overwrite a row — it writes a new version and leaves the old one behind as a corpse; deletes just mark rows dead. Vacuum is the crew that removes corpses so the space can be reused, and autovacuum runs it automatically in the background. When autovacuum falls behind — huge update bursts, or those `idle in transaction` sessions pinning old snapshots — tables swell with pages full of dead tuples. Every sequential scan and many index scans then read far more pages than live data justifies, so *every* query on that table drifts slower with zero code changes. `pg_stat_user_tables` shows the damage: `n_dead_tup` next to `n_live_tup`, plus `last_autovacuum`. A dead-to-live ratio above roughly 20% on a hot table is a finding, not a rounding error. The mechanics, tuning knobs, and the difference between regular `VACUUM` and the locking sledgehammer `VACUUM FULL` are covered properly on the [vacuum page](./what-is-vacuum.md) and [autovacuum page](./what-is-autovacuum.md) — this step is about *checking* the numbers as part of the loop.

**Step 5 — Treat the diagnosed cause, then re-measure.** Most often the evidence points at an index. Match it precisely to the query shape: equality-filtered columns first in a composite index, the sort/range column last, and if a query only ever touches one narrow slice of the table — like `status = 'pending'` — a partial index covers it smaller and faster ([partial indexes](./what-is-partial-index.md)). Build it with `CREATE INDEX CONCURRENTLY` so live traffic isn't blocked while it builds. After any fix, re-run the Step 2 command: same query, new plan, new numbers. The proof of the fix is the before-and-after diff, exactly like a post-op test. And keep expectations honest: an index speeds up reads but taxes every write on that table and consumes storage — which is why you earn it with evidence instead of sprinkling indexes on every column.

## 4. See It In Practice — Real Code or Queries

All SQL in this section is **PostgreSQL**. Setup first, then the four diagnostic moves, then the fix.

**Turn on the history book** (one-time setup, superuser):

```sql
-- postgresql.conf:  shared_preload_libraries = 'pg_stat_statements'  (needs a restart)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top offenders by TOTAL time (PostgreSQL 13+ column names; pre-13 uses total_time/mean_time)
SELECT calls,
       round(total_exec_time::numeric)     AS total_ms,
       round(mean_exec_time::numeric, 1)   AS mean_ms,
       rows,
       temp_blks_written,                  -- high value => sorts/hashes spilling to disk
       left(query, 80)                     AS query
FROM   pg_stat_statements
ORDER  BY total_exec_time DESC
LIMIT  10;

-- pg_stat_statements_reset();  -- call after a fix so old history stops polluting new comparisons
```

**Watch the suspect run** — the order-history query from the opening story:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, total_cents, created_at
FROM   orders
WHERE  customer_id = 42
  AND  status      = 'pending'
ORDER  BY created_at DESC;
```

Realistic output, annotated line by line:

```txt
Sort  (cost=4512.90..4512.91 rows=3 width=24)
      (actual time=1842.11..1842.11 rows=2 loops=1)          -- 1.8s spent mostly BELOW this node
  Sort Key: created_at DESC
  Sort Method: quicksort  Memory: 25kB                       -- small sort; not the problem
  ->  Seq Scan on orders  (cost=0.00..4512.88 rows=3 width=24)
                          (actual time=0.041..1798.50 rows=2 loops=1)
        Filter: ((customer_id = 42) AND (status = 'pending'::order_status))
        Rows Removed by Filter: 1999998                      -- <-- THE finding: read 2M, kept 2
        Buffers: shared hit=21426 read=881                   -- 21k pages from cache, 881 from disk
Planning Time: 0.19 ms
Execution Time: 1842.34 ms
```

Read it bottom-up, the direction time actually flows. The sequential scan visited essentially the whole table, discarded all but two rows, and consumed nearly all the runtime. Estimates were accurate, so statistics are fine — the plan is simply the best available option for "no useful index exists." That's the missing-index fingerprint.

**Check the live ward and the lock queue:**

```sql
-- Who is doing what right now, longest-running first
SELECT pid,
       state,
       wait_event_type || ':' || COALESCE(wait_event, '-') AS waiting_on,
       now() - query_start                                 AS running_for,
       left(query, 60)                                     AS query
FROM   pg_stat_activity
WHERE  state <> 'idle'
ORDER  BY query_start;

-- Who is blocked by whom (lock waits only)
SELECT blocked.pid     AS blocked_pid,
       left(blocked.query, 50)        AS blocked_query,
       blocking.pid    AS blocker_pid,
       left(blocking.query, 50)       AS blocker_query
FROM   pg_stat_activity blocked
JOIN   pg_locks bl ON bl.pid = blocked.pid AND NOT bl.granted
JOIN   pg_locks gl ON gl.locktype = bl.locktype
                  AND gl.relation IS NOT DISTINCT FROM bl.relation
                  AND gl.granted
JOIN   pg_stat_activity blocking ON blocking.pid = gl.pid;

-- Politely cancel one runaway query, or drop its whole connection:
-- SELECT pg_cancel_backend(4821);      -- SIGINT: cancels current query
-- SELECT pg_terminate_backend(4821);   -- SIGTERM: ends the session entirely
```

**Weigh the dead rows:**

```sql
SELECT relname,
       n_live_tup,
       n_dead_tup,
       round(n_dead_tup * 100.0 / nullif(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
       last_autovacuum
FROM   pg_stat_user_tables
WHERE  relname = 'orders';     -- drop the filter to survey the whole database
```

**Operate, then prove it worked:**

```sql
-- Equality column first, sort column last, and only the pending slice:
CREATE INDEX CONCURRENTLY idx_orders_customer_pending
ON orders (customer_id, created_at DESC)
WHERE status = 'pending';
-- CONCURRENTLY = no write-blocking while building. Cannot run inside a transaction block.
-- If it fails midway it leaves an INVALID index: DROP INDEX and retry.

-- Re-run the exact EXPLAIN (ANALYZE, BUFFERS) from before. Expected now:
--   Index Scan using idx_orders_customer_pending, rows=2, buffers in the dozens, ~0.1 ms
```

One honest environment note: reading query *plans* is a universal idea, not a Postgres invention — the only claim here runnable outside Postgres is that adding an index changes the plan, which even SQLite shows (`EXPLAIN QUERY PLAN` flips `SCAN orders` to `SEARCH orders USING INDEX idx_orders_customer` after `CREATE INDEX`). Everything else on this page — the extension, the views, `BUFFERS`, `CONCURRENTLY` — is PostgreSQL.

## 5. Interview Questions — All of Them, Done Properly

**Q: Walk me through how you'd debug a slow query in production.**

I follow a fixed loop instead of guessing. First I rank suspects with `pg_stat_statements`, sorted by total execution time, because my slow endpoint might not even be the biggest consumer — frequent medium queries often outweigh rare terrible ones. Then I take the top offender and run `EXPLAIN (ANALYZE, BUFFERS)` to see the real plan, real timings, and buffer usage — checking estimated-versus-actual rows, `Rows Removed by Filter`, and temp file spills. In parallel I check `pg_stat_activity` for lock waits and `idle in transaction` sessions, and `pg_stat_user_tables` for dead-tuple bloat, because a perfect plan over a bloated table is still slow. Only after that evidence do I fix — usually an index built `CONCURRENTLY`, matched to the query's shape — and then I re-run the same `EXPLAIN (ANALYZE, BUFFERS)` to prove the before/after difference. The discipline is: measure, treat, re-measure.

**Q: Why start with pg_stat_statements rather than just optimizing the query the user complained about?**

Because the complaint is an anecdote, not a ranking. One user hit one slow request; `pg_stat_statements` aggregates every query shape over time with call counts and cumulative durations. Sorting by total time surfaces the aggregate load — often a 5-millisecond logging query called hundreds of thousands of times costs far more than the 8-second report query that generated the ticket. Starting from the anecdote risks optimizing the wrong thing entirely. It also tells me scope: if total time is spread evenly across hundreds of shapes, the problem is systemic — caching, capacity, or bloat — not one bad query.

**Q: What does EXPLAIN (ANALYZE, BUFFERS) tell you that plain EXPLAIN doesn't?**

Plain `EXPLAIN` shows the planner's *intent*: the chosen plan with estimated costs and row counts derived from statistics — no execution, no truth. `ANALYZE` actually runs the statement and annotates every node with real elapsed time, real rows, and loop counts, which exposes where time truly went and where estimates diverged from reality. `BUFFERS` adds the I/O picture: pages served from cache versus read from disk, and temporary blocks written when sorts or hash tables didn't fit in memory. Together they turn "the planner thinks" into "here's what happened," which is the difference between a hypothesis and a diagnosis. The trade-offs: the statement genuinely executes (so wrap writes in `BEGIN`/`ROLLBACK`), and instrumentation adds overhead, so absolute timings are slightly pessimistic.

**Q: How do you tell from an EXPLAIN output that an index is missing?**

The signature is a `Seq Scan` node paired with a large `Rows Removed by Filter` number — the engine read tens or millions of rows and discarded almost all of them to satisfy the `Filter:` condition shown underneath. If the query filters a few rows out of a big table, that gap is wasted work an appropriately-shaped index would eliminate. Secondary clues: a `Sort` node on top of the scan (an index could deliver rows pre-sorted), and `Buffers: shared read` climbing when the table should fit in cache. The caveat worth stating: a sequential scan is *correct* for small tables or low-selectivity queries — if the filter matches half the table, walking it linearly beats random index hops. Missing-index findings are about the ratio, not the scan type alone.

**Q: A query was fast yesterday and is slow today with no code change. What do you check?**

Four usual suspects, in order. Data volume crossed a threshold — a table grew past the point where the planner's sequential-scan shortcut stopped being cheaper than an index, or a new value distribution made cached plans misfit (Postgres may switch a prepared statement to a generic plan after a few executions). Statistics went stale — a big batch insert without a subsequent analyze left the planner planning against fiction, visible as wildly wrong row estimates; fix is `ANALYZE <table>`. Bloat accumulated — check `n_dead_tup` in `pg_stat_user_tables`; a burst of updates or a long-open transaction blocking autovacuum inflates every scan. Or contention appeared — `pg_stat_activity` shows the query sitting in an `active` state with a `Lock` wait event, meaning the query didn't get slower; it's queueing behind someone else. None of these appear in application code, which is exactly why "no deploy changed anything" never rules out the database.

**Q: What does vacuuming have to do with query performance?**

Under MVCC, updates and deletes don't erase old row versions — they leave dead tuples that only vacuum reclaims. Until then, scans pay for corpses: a table that's 60% dead tuples forces every sequential scan and many index scans to chew through three times the live data. Vacuum also maintains the visibility map, which index-only scans depend on — a poorly-vacuumed table quietly loses its cheapest access path. So when a table drifts slower over weeks with no code change, I check `n_dead_tup` versus `n_live_tup` and `last_autovacuum` in `pg_stat_user_tables` before rewriting anything. The deeper cause is usually upstream: bulk-update storms or long-running transactions pinning old snapshots so autovacuum can't make progress. The full mechanism lives on the [MVCC page](./what-is-mvcc.md) and the [vacuum page](./what-is-vacuum.md).

**Q: How do you add an index to a large, busy production table safely?**

With `CREATE INDEX CONCURRENTLY`, which builds the index without taking the lock that blocks inserts, updates, and deletes — ordinary traffic continues throughout. Three caveats show real experience: it can't run inside a transaction block; it's slower and does two passes over the table; and if it fails partway (say, a deadlock or cancellation), it leaves an `INVALID` index behind that you must drop and rebuild — so check `\d` or `pg_indexes` after. I'd also name the index deliberately, run it off-peak anyway as insurance, and verify afterwards with `EXPLAIN` that the planner actually picked it. On a replica-first workflow, teams sometimes build on a replica promoted to primary to keep risk near zero. What we never do is bare `CREATE INDEX` during business hours — it blocks all writes for the entire build.

**Q: How would you know if slowness is lock contention rather than a bad plan? And what do you do about it?**

The tell is in `pg_stat_activity`: the session's state is `active` but its `wait_event_type` is `Lock` — the process isn't computing, it's queueing. A bad plan shows up in `EXPLAIN (ANALYZE, BUFFERS)` as time burned inside scan nodes; contention shows the query barely starting at all. To find the holder, join `pg_locks` granted and ungranted entries on the same relation (the query is in the practice section above). Immediate relief: `pg_cancel_backend` on the blocker if it's a runaway query, `pg_terminate_backend` if the whole session is wedged. Long-term fixes target the *cause*: short transactions (kill the `idle in transaction` pattern with `idle_in_transaction_session_timeout`), consistent lock ordering across code paths to prevent deadlocks, and `lock_timeout` on interactive paths so requests fail fast instead of stacking up. The deeper locking mechanics are on the [row-level locking page](./what-is-row-level-locking.md).

**Q: What would you monitor and alert on so you catch the next slowdown before users do?**

Four layers. Query-level: `log_min_duration_statement = '500ms'` logs every slow statement, and the `auto_explain` extension attaches its plan automatically — together they're a flight recorder. Aggregate-level: periodic snapshots of `pg_stat_statements` (reset between snapshots) trending total-time leaders week over week. Health-level: dead-tuple ratios and `last_autovacuum` from `pg_stat_user_tables`, cache hit ratios, and temp-file writes as an early bloat/memory alarm. Contention-level: alert on sessions in `Lock` waits longer than a few seconds and on `idle in transaction` age. The frontend impact rides on the same wire: slow queries become p95 latency, gateway timeouts, and retry storms that multiply load — so database alerts firing early are user-facing outage prevention, not hygiene.

## 6. The Traps — What Goes Wrong in Production

**Trusting plain EXPLAIN as the verdict.** The wrong assumption: "`EXPLAIN` showed me the plan, so I've seen what happened." Plain `EXPLAIN` is a prediction computed from statistics — the query never ran. People then "fix" problems that don't exist or miss ones that do, because the estimate said 5 rows when reality had 400,000 and the whole strategy choice was built on that lie. What actually happens: you ship an index the planner never uses, or worse, you skip investigating a genuinely broken plan. The fix: always conclude from `EXPLAIN (ANALYZE, BUFFERS)` — measured rows, measured time, measured buffers — treating the estimated numbers only as the planner's confession about what it believed.

**Running EXPLAIN ANALYZE on a write against production data.** `ANALYZE` means *execute*. Engineers copy the command onto an `UPDATE` or `DELETE`, watch it complete, and discover they really archived 40,000 orders — twice confused, because the output looked exactly like a dry run. The fix costs nothing: wrap it — `BEGIN; EXPLAIN (ANALYZE, BUFFERS) UPDATE ...; ROLLBACK;` — and you get the full measured plan while the rollback erases the effect. Reserve unwrapped `EXPLAIN ANALYZE` for reads, and even then prefer staging for heavyweight selects.

**Creating the index without CONCURRENTLY on a live table.** A plain `CREATE INDEX` takes a lock that blocks every insert, update, and delete for the entire build — seconds on a toy table, minutes-to-hours on a real one. What happens in production: the build starts, writes queue up, connection pools saturate, and the app-wide outage begins while someone stares at a progress bar. The fix is `CREATE INDEX CONCURRENTLY`, accepting that it's slower and can't run inside a transaction. Check the result afterwards — a failed concurrent build leaves an `INVALID` index that occupies space and never serves queries until you drop and rebuild it.

**Optimizing by mean time instead of total time.** The wrong assumption: "sort `pg_stat_statements` by average duration to find the worst query." The average hides frequency, and frequency is where database life goes. A 4ms query called 300,000 times per hour consumes twenty minutes of server time every hour; an 8-second query called twice a day is noise. Teams chase the dramatic outlier for a week while the cheap-hot query quietly owns the CPU. The fix: rank by `total_exec_time` first to allocate effort, then use `mean_exec_time` within a shape to judge individual outliers.

**Adding the right index and assuming the planner will use it.** The wrong assumption: "correct columns indexed, therefore fast." Planners refuse indexes for good reasons people forget: the filter wraps the column in a function or implicit cast (`WHERE lower(email) = ...`, or comparing a `varchar` column to a numeric parameter), the pattern is `LIKE '%term%'` with the wildcard up front, or the table is tiny enough that a sequential scan is honestly cheaper. Result: the new index sits unused, `EXPLAIN` still shows a `Seq Scan`, and everyone concludes Postgres is broken. The fix is matching the index to the expression: an expression index on `lower(email)`, a `gin` index with the `pg_trgm` extension for substring search, and `ANALYZE` after bulk loads so the planner knows the current data. Verify with `EXPLAIN (ANALYZE, BUFFERS)` — the plan, not your intention, is the truth.

**Cranking work_mem globally to fix one spilled sort.** Seeing `temp written` in the buffers output, someone raises `work_mem` in the global config. But `work_mem` is allowed *per sort or hash node, per connection* — 64MB globally can mean 64MB × 5 sort nodes × 200 connections under load. What happens next is the database OOM-killed at the next traffic spike, taking down every query including healthy ones. The fix: raise it surgically — `SET work_mem = '256MB';` inside the specific batch job or reporting session that needs it — and treat a global increase as a last resort justified by measured, sustained spill pressure across many workloads.

**Blaming the query when the table is bloated.** The wrong assumption: "the plan is unchanged, the query is the same, so the query is guilty." Under MVCC, a table can triple in physical size with zero visible rows added, because update-heavy churn leaves dead tuples autovacuum hasn't reclaimed — often because one forgotten `idle in transaction` session has pinned an ancient snapshot for hours. Every scan pays for the gunk, latency creeps up everywhere on that table, and engineers burn days rewriting perfectly innocent SQL. The fix is to check `n_dead_tup` versus `n_live_tup` and `last_autovacuum` in `pg_stat_user_tables` *early* in the loop, hunt down the pinning transaction via `pg_stat_activity`, and let vacuum catch up — the query was never sick; its room was filthy.

## 7. Compare With Related Concepts

**`pg_stat_statements` vs `EXPLAIN (ANALYZE, BUFFERS)`:** the history book versus the stress test — aggregate rankings over every past execution versus a deep measurement of one execution. Rule: rank with the history book, diagnose with the stress test, confirm the cure with another stress test.

**Plain `EXPLAIN` vs `EXPLAIN (ANALYZE)`:** forecast versus measurement — the planner's statistical guess versus ground truth with real rows and timings. Rule: forecasts choose what to investigate; only measurements justify conclusions.

**`VACUUM` vs `VACUUM FULL`:** routine cleanup that reclaims space within existing files versus a full table rewrite that actually shrinks the file but takes an exclusive lock blocking all reads and writes. Rule: default to `VACUUM` and fix autovacuum tuning; reserve `VACUUM FULL` (or online tools like pg_repack) for maintenance windows ([details](./what-is-vacuum.md)).

**B-tree vs GIN vs partial index:** B-tree for equality and range on scalar values, GIN for containment-style data like JSONB, arrays, and trigram text search, partial for queries that always slice one predicate-defined subset. Rule: match the index type and definition to the query's actual predicate shape ([B-tree](./what-is-b-tree-index.md), [GIN](./what-is-gin-index.md), [partial](./what-is-partial-index.md)).

**Slow queries vs connection-pool exhaustion:** symptoms overlap (requests hanging) but `pg_stat_activity` separates them — many `active` sessions grinding is compute trouble, while many `idle` sessions pinned at `max_connections` is pool trouble. Rule: ask whether the database is slow or merely full before optimizing anything ([pooling](./what-is-connection-pooling-with-pgbouncer.md)).

**This Postgres loop vs MySQL's equivalent:** MySQL reaches for `performance_schema`, the slow query log, and `EXPLAIN ANALYZE` (8.0+) instead of `pg_stat_statements`, `pg_stat_activity`, and `pg_stat_user_tables`. Rule: tool names are dialect details — measure-rank-inspect-check-bloat-fix transfers intact.

## 8. 🧠 The Memory Hook — What Sticks

A slow query is a symptom, not a diagnosis — so work the ER loop: read the chart (`pg_stat_statements`, sorted by total time), run the treadmill test (`EXPLAIN (ANALYZE, BUFFERS)` — it really executes), check the ward monitors (`pg_stat_activity` for lock waits and `idle in transaction`), weigh the plaque (`n_dead_tup` bloat), then place the stent (`CREATE INDEX CONCURRENTLY`) and re-run the test to prove it. Doctors who operate before diagnosing get sued; engineers who index before measuring get paged.
