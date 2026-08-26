# What is EXPLAIN ANALYZE in PostgreSQL

## 1. The Real-World Problem — When You Actually Hit This

It's 9:40 AM. The p99 latency alert fires on your order-history endpoint. You pull the query, run `EXPLAIN ANALYZE` on staging, and stare at 1.8 seconds of perfectly reasonable-looking output — every node says "Index Scan," the costs look small, nothing screams. You shrug, close the tab, and the alert fires again tomorrow.

Then a senior engineer glances over your shoulder and asks four questions in ten seconds: "Did you request BUFFERS? Was any of that time actually temp spill to disk? Did you adjust for loops? And is prod even running the same plan, or does it have different settings?" You realize two things. First, plain `EXPLAIN ANALYZE` is just the entry ticket — PostgreSQL gives you a whole instrument panel around it, and you flew with one dial. Second, some of those dials (`BUFFERS`, `WAL`, `SETTINGS`) only record data if you switch them on **before** the run. The information you needed this morning was never captured, and it's unrecoverable now.

One boundary note before we go deeper: the general story — why estimated rows drift from actual rows, what the planner's statistics are, how MySQL and SQLite differ — lives in [what-is-explain-analyze.md](../sql/what-is-explain-analyze.md), alongside [what-is-explain.md](../sql/what-is-explain.md) and [what-is-query-execution-plan.md](../sql/what-is-query-execution-plan.md) for the plan vocabulary itself. This page is the PostgreSQL-specific deep dive: the option flags you attach to `EXPLAIN`, and how to actually read the numbers Postgres hands back.

## 2. The Analogy — Make the Mechanic Obvious

Think of a race team testing a car. The driver knows the track from notes pinned in the garage — corner-by-corner memories of last season. Before any lap, he tells the pit wall his planned route and his predicted lap time. That's the query plan: intentions built from possibly-stale notes.

Now the test lap. `EXPLAIN ANALYZE` means you strap sensors on and he actually drives. Every section of the track reports real measurements afterward: planned 4 seconds through turn three, took 40. The notes lied, and now you have proof of where.

The `EXPLAIN` options are the sensor channels, and this is the part of the analogy that matters most: **you choose the channels before the lap**. Fuel draw per corner (`BUFFERS`). Full camera coverage with every gauge labeled (`VERBOSE`). Whether the pit wall shows the driver's own confidence score (`COSTS`). A tire-wear and brake-wear recorder for the parts of the lap that consume material (`WAL`). A printout listing every knob the crew set differently from the factory default (`SETTINGS`). A raw digital feed piped straight to the pit computer instead of human eyes (`FORMAT JSON`). If you didn't switch a channel on, that data does not exist after the lap — nobody can tell you afterward how much fuel turn three burned. Same with Postgres: forget `BUFFERS` and re-running the query later measures a *different* lap, on a warm engine, under today's conditions.

And one more mapping: the lap happens on the real circuit with real tires. `EXPLAIN ANALYZE` on an `UPDATE` doesn't simulate the pit stop — it changes the tires. You'll see below how Postgres lets you do the lap and then un-happen it.

## 3. The Full Explanation — How It Actually Works

Recap in one breath: the planner builds a tree of operations, guessing rows and cost for each node from statistics (the track notes). `EXPLAIN` prints the tree and stops. `EXPLAIN ANALYZE` executes the statement for real, instruments every node, and appends ground truth: `actual time`, `actual rows`, `loops`. Everything else on this page is about *which* truth you asked it to collect.

**`ANALYZE` — the on/off switch for reality.** Without it, pure guess-print, zero risk. With it, the statement runs. On a `SELECT` that's just load. On an `UPDATE` or `DELETE` it performs the write — the standard safety net is wrapping it so the work gets undone:

```sql
BEGIN;
EXPLAIN ANALYZE UPDATE invoices SET status = 'void' WHERE id = 42;
ROLLBACK;
```

The rollback really does put the rows back — that's MVCC doing its job; the old row versions never became visible to anyone else ([what-is-mvcc.md](./what-is-mvcc.md)). But "rolled back" is not "nothing happened": you held locks the entire run, any `nextval()` calls burned sequence numbers permanently (sequences aren't transactional), triggers fired along the way and anything *they* did outside the database — an HTTP call, a queue publish, a metrics increment — stays done, and the abandoned row versions sit around as dead tuples until vacuum cleans them ([what-is-vacuum.md](./what-is-vacuum.md)). So `BEGIN … ROLLBACK` is the right reflex, not a license to profile destructive statements against live production mid-day.

**`BUFFERS` — where the time physically went.** This is the flag that answers "CPU problem or I/O problem?" Postgres reads table and index data through a fixed-size RAM cache called `shared_buffers`. When a plan node needs a page (an 8 kB block), either it's already cached — `shared hit` — or Postgres had to go get it — `shared read`. Reads are the expensive ones; hits are nearly free. The output also reports `shared dirtied`/`shared written` (pages this statement modified or flushed) and — crucially for sorts and hash joins — `temp read`/`temp written`, which mean the operation ran out of working memory and spilled to disk. `BUFFERS` pairs with `ANALYZE`, because buffer access only happens during execution (very recent Postgres releases can also report a few planning-time buffers, but the numbers that matter come from the run). If you take one habit from this page, it's `EXPLAIN (ANALYZE, BUFFERS)` as your default starting command.

**`VERBOSE` — the fully-labeled output.** Adds three things: each node shows which columns it outputs (great for checking whether an index could cover a query), table names become schema-qualified, and trigger names with individual timings appear at the bottom. Reach for it when you're arguing about column sets or trigger overhead; leave it off for everyday reading.

**`COSTS` — the planner's confidence score.** On by default. `COSTS OFF` strips the `cost=…` numbers, which sounds like a loss but is often a win: costs are abstract ranking units meant for comparing candidate plans *of the same query at planning time*, and people chronically misread them as milliseconds. They also shift whenever statistics shift, so `COSTS OFF` gives you clean, comparable output when diffing plans across environments or pasting into a bug report.

**`SETTINGS` — the environment confession.** Added in Postgres 12, and it's the single best answer to "same query, different plan on staging vs prod." When enabled, the output ends with a list of every non-default setting that influenced this plan — `work_mem`, `random_page_cost`, `enable_seqscan`, whatever the DBA tuned. Without it you're guessing what the planner knew; with it, the knobs are printed in black and white.

**`WAL` — the write-side receipt.** Every modifying statement produces write-ahead log records (and full-page images) — the traffic that replication ships downstream and that fills your archive. `EXPLAIN (ANALYZE, WAL)` counts them for the measured statement: records generated, bytes, full-page images. Use it when sizing a bulk update, predicting replication lag from a migration, or explaining to the platform team why last night's backfill ate the WAL disk.

**`FORMAT JSON` — the machine-readable feed.** Default format is human-oriented text. `FORMAT JSON` (also XML/YAML) emits structured output where every node carries typed fields like `"Node Type"`, `"Actual Rows"`, `"Rows Removed by Filter"`, `"Shared Hit Blocks"`. Two production uses: paste-ready input for plan visualizers like explain.depesz.com or explain.dalibo.com, and automated checks — a CI job that runs critical queries with `EXPLAIN (FORMAT JSON)` after migrations and fails the build if a hot-path query suddenly starts scanning.

Two smaller dials worth knowing: `TIMING OFF` skips per-node stopwatches (measuring time itself distorts very fast nodes, and skipping it makes repeated benchmarks cheaper) while keeping row and buffer counts; and on Postgres 16+, `GENERIC_PLAN` shows the plan a prepared statement would get without binding parameters.

**Reading the numbers — the four skills.**

First, estimates vs actuals. Every node shows the planner's `rows=` guess next to reality. Close numbers mean the planner understands your data and you can trust the plan shape. Numbers diverging by 10x+ mean the statistics are fiction, and every structural choice above that node was made against fantasy — the usual cure is refreshing stats (`ANALYZE table_name;`), and autovacuum normally does this for you, but bulk loads routinely outrun it ([what-is-autovacuum.md](./what-is-autovacuum.md)).

Second, loop multiplication. A nested loop's inner node executes once per outer row, and Postgres reports `actual time` on such nodes as the **average per loop**, not the total. `actual time=0.033` with `loops=50000` is 1.65 seconds wearing a disguise. Multiply before you judge: total ≈ per-loop time × loops. The parent node's actual time is cumulative (children included), so impossible-looking parents usually point at a looping child.

Third, `Rows Removed by Filter`. When Postgres scans rows and throws most away, it tells you exactly how many. `rows=1` beside `Rows Removed by Filter: 999999` is the signature of reading a million rows to keep one — the loudest possible signal that the filter column lacks a usable index. Its cousin `Rows Removed by Index Recheck` appears on bitmap scans that had to re-verify rows after a lossy in-memory pass.

Fourth, the extras. An expensive statement may show a `JIT` block — Postgres compiled parts of the query to machine code at runtime because the estimated cost crossed a threshold (default behavior via `jit_above_cost`). Great for multi-second analytics, wasted setup for millisecond OLTP queries, where people commonly disable it (`SET jit = off`) and win back tens of milliseconds. And the footer always reports `Planning Time` and `Execution Time` separately — if planning takes 200 ms on a query that runs in 5 ms and you execute it thousands of times a minute, your problem is planning, not execution.

## 4. See It In Practice — Real Code or Queries

All examples are PostgreSQL 15-style syntax; timings and buffer counts will differ on your hardware — treat the *shape* as the lesson.

**Example 1 — the default habit: `(ANALYZE, BUFFERS)` on a filter with no index**

```sql
CREATE TABLE shipments (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_email text        NOT NULL,
  status         text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- imagine 1,000,000 rows loaded here

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM shipments WHERE customer_email = 'ana@example.com';
```

```txt
Seq Scan on shipments  (cost=0.00..21385.00 rows=1 width=64)
                       (actual time=0.214..189.772 rows=1 loops=1)
  Filter: (customer_email = 'ana@example.com'::text)
  Rows Removed by Filter: 999999
  Buffers: shared hit=5120 read=5378
Planning Time: 0.088 ms
Execution Time: 189.826 ms
```

Read it out loud: "the whole table lives in 10,498 pages; 5,378 came from disk, the rest were already cached; every one of the million rows got checked and 999,999 thrown away, to hand back one row." Now the fix and the re-test — same command, because you want apples-to-apples:

```sql
CREATE INDEX idx_shipments_email ON shipments (customer_email);

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM shipments WHERE customer_email = 'ana@example.com';
```

```txt
Index Scan using idx_shipments_email on shipments
                       (cost=0.42..8.45 rows=1 width=64)
                       (actual time=0.031..0.034 rows=1 loops=1)
  Index Cond: (customer_email = 'ana@example.com'::text)
  Buffers: shared hit=4
Planning Time: 0.146 ms
Execution Time: 0.056 ms
```

Four buffer touches instead of ten thousand. Notice what proved it wasn't the cost numbers — it was `Rows Removed by Filter` collapsing from 999,999 to nothing, and the buffer count falling off a cliff.

If the filter had been a function call — `WHERE lower(customer_email) = …` — the plain b-tree above would sit unused, and the same scan-and-dump shape would persist; that's the cue for an index on the expression ([what-is-expression-index.md](./what-is-expression-index.md)), or a partial index when you only ever query one hot slice of the values ([what-is-partial-index.md](./what-is-partial-index.md)).

**Example 2 — `(ANALYZE, BUFFERS, SETTINGS)` catches an environment difference**

Same query, fast on the dev laptop, mysteriously slow on prod-like staging:

```sql
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT customer_id, sum(total_amount) AS revenue
FROM order_items
GROUP BY customer_id
ORDER BY revenue DESC;
```

```txt
Sort  (cost=48531.74..48562.07 rows=12133 width=16)
      (actual time=412.661..413.104 rows=12133 loops=1)
  Sort Key: (sum(total_amount)) DESC
  Sort Method: external merge  Disk: 9360kB
  Buffers: shared hit=1421 read=88, temp read=1170 written=1176
  ->  HashAggregate  (cost=38233.00..38354.33 rows=12133 width=16)
                     (actual time=398.220..405.930 rows=12133 loops=1)
        Buffers: shared hit=1421 read=88
Settings: work_mem = '4MB'
Planning Time: 0.192 ms
Execution Time: 415.208 ms
```

The smoking guns: `Sort Method: external merge Disk: 9360kB` and `temp read=1170 written=1176` — the aggregation result didn't fit in the 4 MB the server allows for sorts, so Postgres spilled to disk and merged. `Settings` names the knob outright. On dev, someone had `SET work_mem = '64MB'` and the same plan sorts entirely in RAM, which is why "it works on my machine" was technically true. The fix conversation is now concrete: raise `work_mem` for this session/report role, or reshape the query — not vague hand-waving about "database tuning."

**Example 3 — `FORMAT JSON` feeding tooling**

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM shipments WHERE customer_email = 'ana@example.com';
```

```json
[ { "Plan": {
      "Node Type": "Index Scan",
      "Relation Name": "shipments",
      "Index Name": "idx_shipments_email",
      "Actual Rows": 1,
      "Actual Loops": 1,
      "Shared Hit Blocks": 4,
      "Shared Read Blocks": 0 } } ]
```

Paste the whole thing into explain.depesz.com or explain.dalibo.com for a color-coded time breakdown, or grep it in CI: after every migration script, assert that the checkout hot-path plan still says `"Index Scan"` and hasn't regressed to `"Seq Scan"` with `"Rows Removed by Filter"` in the hundreds of thousands. Plans regress silently; a five-line check catches it before customers do.

**Example 4 — profiling a destructive write safely**

```sql
BEGIN;
EXPLAIN (ANALYZE, BUFFERS, WAL)
DELETE FROM shipments
WHERE created_at < now() - interval '24 months';
ROLLBACK;
```

```txt
Delete on shipments  (cost=0.00..27468.00 rows=112340 width=6)
                     (actual time=894.211..894.214 rows=0 loops=1)
  ->  Seq Scan on shipments  (cost=0.00..27468.00 rows=112340 width=6)
                             (actual time=0.014..612.480 rows=112340 loops=1)
        Filter: (created_at < (now() - '24 mons'::interval))
        Rows Removed by Filter: 887660
  WAL: records=118420 bytes=12458210 fpi=312
  Buffers: shared hit=9822 read=1404 dirtied=11480
Planning Time: 0.121 ms
Execution Time: 894.301 ms
Query Identifier: ...
```

The delete truly ran — 112,340 rows walked and marked deleted, 11,480 pages dirtied, ~12 MB of WAL generated — and then the rollback un-happened it. From this one output you've learned the delete currently seq-scans (index the `created_at` column or batch the deletes by range), roughly what WAL volume the real run would ship to replicas, and you did it without touching a single survivor row. Remember the fine print from section 3: locks were held, dead tuples now await vacuum, and any `nextval` burned during the run stays burned.

## 5. Interview Questions — All of Them, Done Properly

**Q: What options can you pass to EXPLAIN in PostgreSQL, and when do you actually use each?**

The everyday baseline is `EXPLAIN (ANALYZE, BUFFERS)` — real execution plus the cache/disk story, which together answer "is this slow, and is it slow because of I/O?" Around that: `SETTINGS` when a plan differs between environments, because it prints every non-default setting that shaped the plan; `VERBOSE` when you need output columns, schema-qualified names, or trigger timings; `WAL` when measuring a write-heavy statement's replication and archival footprint; `COSTS OFF` when diffing plans across environments or sharing output, since cost units shift with statistics and invite misreading; `FORMAT JSON` when feeding plan visualizers or automated plan-regression checks; `TIMING OFF` when you want row and buffer counts from repeated benchmarks without stopwatch overhead; and `GENERIC_PLAN` on 16+ to preview a prepared statement's plan without parameters. The key framing: these are sensor channels you must request before execution — nothing is recorded retroactively.

**Q: What's the difference between `shared hit` and `shared read` in the BUFFERS output?**

Postgres keeps table and index pages in a process-shared RAM area, `shared_buffers`. When a plan node requests a page, a `hit` means it was already there — memory-speed access, essentially free at these scales. A `read` means Postgres had to fetch the page from the operating system (which may itself serve it from the OS file cache, but it's still a syscall-level trip and potentially real disk I/O). So a plan dominated by `read` is I/O-bound and a candidate for better indexes, bigger cache, or accepting cold-cache reality; a plan dominated by `hit` with high time elsewhere is spending its life on CPU — filtering, sorting, joining — not waiting on storage. Watch `temp read`/`written` too: those indicate sorts or hash operations spilling to disk because `work_mem` couldn't hold the data, which is often the actual bottleneck hiding behind decent hit rates.

**Q: What does "Rows Removed by Filter" tell you, and what do you do about it?**

It's the count of rows a node examined and discarded applying a filter condition. A sequential scan returning 1 row while removing 999,999 means the database read the entire table to find one — the definition of a missing or unusable index, and it scales linearly with table growth, so a query that's tolerable today becomes a slow one purely as data accumulates. The response ladder: add a b-tree on the filtered column; if the predicate wraps the column in a function (`lower(email) = …`), build an expression index so the planner can match the transformed form; if only a small, hot subset of values is ever queried, a partial index keeps it tiny and fast. There's also `Rows Removed by Index Recheck` on bitmap heap scans — the index matched fuzzily in memory and the table row had to be re-checked — which points at lossy bitmap behavior on large workloads rather than a missing index.

**Q: Why can the "actual time" figure lie to you, and how do you read it correctly?**

Because on any node that executed more than once, Postgres reports the average per execution. Nested-loop inner scans are the classic case: `loops=50` on the inner index scan means that innocent `actual time=0.033` happened fifty times — roughly 1.65 ms total, not a third of a tenth of a millisecond. I've seen reviews bless plans containing a node at `0.02 ms × 50,000 loops` — a full second hiding in one small number. The reflex is multiply: per-loop time times loops equals the node's true contribution. Cross-check against the parent, since parent actual times are cumulative and include their children — a parent claiming 800 ms while all visible children claim microseconds means some looping child is carrying the weight.

**Q: How do you measure how expensive an UPDATE or DELETE will be without changing data?**

In Postgres: wrap it in a transaction and roll it back — `BEGIN; EXPLAIN (ANALYZE, BUFFERS, WAL) <statement>; ROLLBACK;`. The statement genuinely executes with real timings, buffer churn, and WAL generation; the rollback then restores the data, because row changes in an uncommitted transaction simply never become visible to others. But be precise about what rollback does *not* undo: locks were held throughout the run, sequence increments are permanent (they're deliberately non-transactional), triggers fired and anything they did outside the database — publishing to a queue, calling an HTTP endpoint — remains done, and the aborted row versions linger as dead tuples for vacuum to reclaim. So the pattern is safe-by-default, not consequence-free: run it on staging or a quiet window for anything serious, and never rely on it as an excuse to fire destructive statements casually on the primary.

**Q: Production and staging return different plans for the same query. Walk me through your investigation.**

Start with `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` in both places — the `SETTINGS` block immediately surfaces configuration drift like `work_mem`, `random_page_cost`, or a disabled scan type that silently reshapes the plan. Next, compare the estimates against actuals in both outputs: if prod's estimates are wildly off, its statistics are stale — check `last_analyze`/`last_autoanalyze` in `pg_stat_user_tables`, because bulk loads regularly outrun autovacuum's thresholds. Third, remember scale differences change the math honestly: the seq-scan-versus-index crossover moves with table size, so a plan that's optimal at 100k dev rows can be wrong at 200M prod rows — that's the planner working, not malfunctioning. Fourth, if the query runs through a prepared statement or an ORM, consider the generic-plan switch: after a few executions Postgres may lock in one plan for all parameter values, which fits some values terribly. And finally resist comparing `cost` numbers across servers — they're internal ranking units derived from each environment's statistics and settings, not transferable measurements.

**Q: Your EXPLAIN output contains a JIT block. What is it and do you want it?**

Postgres can compile parts of query execution into machine code at runtime — Just-In-Time compilation — and it kicks in automatically when the estimated cost exceeds a threshold (controlled by `jit_above_cost`). The output block shows how many functions were compiled and the time spent doing it. For long analytical queries the compilation pays for itself in tighter expression evaluation loops. For short OLTP queries it's pure overhead: the query finishes in 2 ms but spent 8 ms compiling, and the standard fix is disabling it — `SET jit = off` globally for OLTP roles or per-session — which visibly drops tail latencies. It's also a great interview tell: recognizing that the block exists, what triggered it, and that it can be counterproductive separates people who've actually read plans from people who've read ABOUT plans.

**Q: When would you use FORMAT JSON instead of the default text output?**

Whenever a machine, not a human, consumes the plan. Two patterns in practice: interactive analysis — the JSON output pastes directly into plan visualizers like explain.depesz.com or explain.dalibo.com, which highlight the expensive nodes and compute per-node share-of-total far faster than eyeballing indentation; and automation — a CI job that runs the application's critical queries with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` after migrations and parses the structured fields to enforce rules: no sequential scans on the checkout path, no node with actual rows diverging from estimated by more than 100x, no new sort spills. Text output is for understanding; JSON output is for guarding.

## 6. The Traps — What Goes Wrong in Production

**Running bare `EXPLAIN ANALYZE` on an UPDATE or DELETE and assuming "explain" means inspect-only.** The wrong assumption: the word "explain" promises observation without participation. Wrong because `ANALYZE` in this compound means *execute and measure* — and the moment the statement finishes in autocommit mode, the write is committed for real. What happens: triggers fire, rows mutate, locks queue up behind you, and on a busy table you've changed production data to satisfy curiosity — sometimes irreversibly if external systems reacted. The fix: the `BEGIN … ROLLBACK` wrapper from section 4, every time, ideally against staging for anything heavyweight.

**Expecting buffer and timing details after the fact.** The wrong assumption: the data is collected anyway and options just control display. Wrong because instrumentation is attached at execution start — no `BUFFERS` requested means no buffer counters were ever maintained for that run. What happens: during an incident someone says "rerun it and show me the buffer counts," and the rerun measures a different world — caches now warm, data volumes shifted, autovacuum mid-flight — producing confidently wrong conclusions about the original slowdown. The fix: standardize on the full flag set (`ANALYZE, BUFFERS` minimum) as your team's default explain command, so the recording is always on when you need the tape.

**Reading a high `shared read` count as "the disk is failing."** The wrong assumption: reads are failures and hits are successes. Wrong because a read just means the page wasn't in `shared_buffers` *this time* — a freshly restarted database or a rarely-accessed table produces reads on a perfectly healthy system. What happens: teams panic over cold-cache baselines, or worse, celebrate a near-total hit rate while ignoring `temp written` showing the real problem — sorts spilling to disk because `work_mem` is starved. The fix: interpret reads against context (time since restart, table size, access pattern) and treat persistent `temp read/written` on hot queries as the actionable signal it is.

**Trusting per-node `actual time` without checking `loops`.** The wrong assumption: the number shown is the node's total cost. Wrong because Postgres averages per execution, and inner nodes of nested loops execute once per outer row. What happens: the review focuses on the biggest displayed numbers while a `0.03 ms × 50,000 loops` node quietly accounts for 1.5 seconds. The fix: multiply time by loops before judging any node, and sanity-check children against their cumulative parents.

**Comparing `cost` figures across databases or across weeks.** The wrong assumption: cost is a universal currency — cost 50000 is twice as bad as 25000, everywhere, forever. Wrong because costs are the planner's internal model, computed from that database's current statistics and cost-parameter settings, existing solely to rank candidate plans for one query at one planning moment. What happens: a migration "verifies" performance by comparing cost outputs, declares victory on a lower number, and users feel zero difference — or the reverse, a rejected plan with a scarier number that was actually faster. The fix: judge real performance exclusively by `Execution Time`, actual times, and buffer counts; use costs only to understand why the planner chose what it chose.

**Treating `BEGIN … ROLLBACK` as a perfect undo button.** The wrong assumption: rollback restores the universe to its prior state. Wrong because several effects are deliberately outside transactional control: `nextval()` burns sequence values permanently (gaps in IDs after rollback are expected), locks were held for the whole run blocking concurrent writers, trigger side effects that escaped the database (queue messages, HTTP calls, third-party API writes) cannot be recalled, and the abandoned row versions accumulate as dead tuples that vacuum must later reclaim — a profiling session on a huge table leaves measurable bloat behind. The fix: reserve the pattern for genuinely valuable measurements, prefer staging for destructive-statement profiling, and schedule space for the vacuum aftermath on big tables.

**Benchmarking with one run on a warm cache and quoting the number.** The wrong assumption: EXPLAIN ANALYZE produces a stable, reproducible measurement like a unit test assertion. Wrong because every number depends on cache warmth, parallel workers (which split row counts across loops — `loops=3` with per-worker rows), concurrent autovacuum, and OS scheduling. What happens: two engineers run the same command and argue about a 20% difference that's pure noise, or a "fix" is validated on one lucky warm run and regresses Monday morning. The fix: run it several times, note first-run versus warm-run behavior, use `TIMING OFF` for relative comparisons to reduce measurement distortion, and confirm any claimed improvement survives fresh-cache conditions.

## 7. Compare With Related Concepts

**This page vs the general EXPLAIN ANALYZE page.** Deliberate division of labor: [what-is-explain-analyze.md](../sql/what-is-explain-analyze.md) teaches the universal idea — estimates versus reality, why stale statistics wreck plans, the chef-and-inventory mental model, and how MySQL and SQLite differ. This page owns the PostgreSQL instrument panel — the option flags and the art of reading Postgres's specific output numbers. Rule: reach for the SQL page to explain the *concept* in an interview; reach for this one when the follow-up is "okay, but which flags would you actually run?"

**`EXPLAIN ANALYZE` vs `pg_stat_statements`.** The microscope versus the census. `EXPLAIN ANALYZE` dissects one execution of one statement, right now, with per-node detail. `pg_stat_statements` aggregates every statement the server has run — total calls, total time, mean and max, rows — normalized across parameter values, with no plan detail at all. Rule: find your worst offenders in `pg_stat_statements` first (you can't explain-analyze every query in the app), then bring the microscope to the top few. They compose into a workflow, not compete.

**`EXPLAIN ANALYZE` vs the `auto_explain` module.** Manual snapshot versus always-on flight recorder. `auto_explain` is a Postgres extension that automatically logs the plan of any statement exceeding a duration threshold — catching the slow plans of *real production traffic*, with parameters you'd never dare plug in yourself. `EXPLAIN ANALYZE` gives controlled, repeatable, instrumented runs. Rule: run `auto_explain` in production to capture offenders as they happen; reproduce and dissect them with `EXPLAIN ANALYZE` somewhere safer.

**BUFFERS output vs `pg_buffercache`.** Per-statement accounting versus a photograph of the whole cache. The `BUFFERS` option reports what *your one query* touched. `pg_buffercache` inspects every page currently sitting in `shared_buffers` — which relations occupy the cache overall. Rule: BUFFERS answers "was my query I/O-bound?", `pg_buffercache` answers "is the cache sized and populated sensibly for the workload?"

**`EXPLAIN ANALYZE` vs bare `ANALYZE`.** The unfortunate name collision, handled fully on the SQL sibling page: bare `ANALYZE` refreshes statistics and improves future *plans*; `EXPLAIN ANALYZE` executes one statement and reports its *measurements*. One feeds the guesses; the other exposes them. For the surrounding debugging workflow — lock waits, N+1s from the app layer, the full triage order — see [how-do-you-debug-a-slow-query.md](../sql/how-do-you-debug-a-slow-query.md), and for the Postgres-side optimization playbook built on top of this tool, see [how-do-you-optimize-slow-postgresql-queries.md](./how-do-you-optimize-slow-postgresql-queries.md).

## 8. 🧠 The Memory Hook

You strap the sensors on **before** the lap — `BUFFERS`, `WAL`, `SETTINGS` requested after the run is data that was never recorded. Then remember what each number is whispering: estimates versus actuals tell you whether the planner's map matches the territory, `Rows Removed by Filter` counts everyone the bouncer turned away from a party that should never have been hosted, and `actual time` is a per-loop average — multiply by loops before you believe it.
