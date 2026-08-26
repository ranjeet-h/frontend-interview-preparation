# How Do You Debug a Slow Query

## 1. The Real-World Problem — When You Actually Hit This

It's 2pm on a Tuesday. Support pings the engineering channel: "checkout feels slow." You open the dashboard and the p95 for `/api/orders` has drifted from 120ms to 4 seconds over three weeks. Nothing deployed in that window touched that endpoint. You pull the same query out of the code, run it against your local database, and it returns in 28ms. Locally it's fine. Production is dying. Your manager asks the worst possible question: "Is the database slow?"

Here's the part nobody says out loud: most engineers' only move at this moment is "add an index." Sometimes that works, by luck. Often they add the index, deploy, watch p95 barely move, and now they've spent a deploy cycle and gained nothing while the real cause keeps bleeding. The difference between a mid-level engineer and a senior one in this moment is not database trivia — it's having a repeatable loop: capture the evidence, reproduce it, read the plan, form one hypothesis, change one thing, verify. That loop is what this page teaches.

## 2. The Analogy — Make the Mechanic Obvious

Think about how a good doctor diagnoses a patient. Someone walks in and says "I'm tired all the time." That is a symptom, not a diagnosis. A bad doctor hears "tired" and immediately prescribes iron pills. A good doctor asks where and when, runs blood work, checks vitals, looks at the results, forms one hypothesis, treats that one thing, and books a follow-up to see if it actually helped.

Query debugging is that exact process with different tools:

- "The app is slow" is the vague symptom. Your job is to turn it into a specific complaint: which endpoint, which single query, since when.
- The slow query log and `pg_stat_statements` are the vital signs monitor — they tell you which patient to look at first.
- `EXPLAIN ANALYZE` is the blood panel. It shows what's happening inside, not what you assume is happening inside.
- The query plan is the X-ray — it reveals the actual structure underneath the symptom.
- Changing one thing at a time is the medical rule that a doctor never starts two medications at once, because then you can't tell which one fixed the problem or caused the rash.
- Re-measuring after the deploy is the follow-up appointment. Treatment that isn't verified is just hope.

And the misdiagnosis risk maps too: lock contention, a missing index, and an ORM firing 400 tiny queries can all present as the same symptom — "slow" — but their tests and treatments are completely different. Prescribing iron pills for sleep apnea doesn't help anyone.

## 3. The Full Explanation — How It Actually Works

The whole discipline fits in five moves. Learn the moves, and any slow query becomes a puzzle instead of a panic.

**Move 1: Capture — find the actual culprit query.** "The app is slow" is never actionable. You need the specific SQL text. Three tools do this. First, the slow query log: PostgreSQL writes any statement exceeding `log_min_duration_statement` to its log; MySQL has the same idea with `long_query_time`. Second, aggregate views: PostgreSQL's `pg_stat_statements` records cumulative time per query shape — and here's the insight juniors miss: rank by *total* time, not mean time. A query taking 2ms but called 100,000 times an hour is eating 200 seconds of database time per hour; a 2-second cron query called once matters far less. Total time = frequency × duration. Third, APM tracing on the app side tells you which endpoints contribute to user-visible p95 — sometimes the slowest query isn't on the slowest endpoint, and you want to know which one actually hurts customers.

**Move 2: Reproduce it honestly.** Take the captured SQL and run it yourself, but reproduce the *data shape*, not just the statement. Two things make dev environments lie. Small tables make every access pattern look instant — scanning 5,000 rows and seeking 5 million rows are different universes. And warm caches flatter everything: in production the hot pages compete for buffer pool memory with every other query. Before forming any theory, get the basics: row count of the main table, size of the result set, and whether the production table has grown recently. "It got slow three weeks ago" plus "our orders table crossed 2 million rows three weeks ago" is already half your diagnosis.

**Move 3: Read the plan.** This is the heart of the skill. Every relational database has an optimizer that, before running your query, computes a strategy — which indexes to use, in what order to join tables, whether to sort in memory. That strategy is the query execution plan ([full breakdown here](what-is-query-execution-plan.md)). `EXPLAIN` prints the plan the database *intends* to use, cheaply and safely ([details](what-is-explain.md)). `EXPLAIN ANALYZE` goes further: it *actually executes* the query and reports real timings next to the estimates ([details](what-is-explain-analyze.md)). The single most important line to read in any analyzed plan is **estimated rows versus actual rows**. If the planner guessed 3 rows and reality was 40,000, every downstream decision — join order, join algorithm, memory allocation — was built on fiction, and the usual cause is stale statistics. Fix: run `ANALYZE` (PostgreSQL) or `ANALYZE TABLE` (MySQL) to refresh them.

While reading, watch four things. Scan type: a full table scan (PostgreSQL says `Seq Scan`, MySQL says `type: ALL`) over a huge filtered table usually means "no usable index." Join algorithm: a nested loop probes the inner table once per outer row — brilliant when the inner side has an index and few rows match, catastrophic when it repeats a full scan 50,000 times; a hash join builds an in-memory hash of the smaller side and probes it once — the choice for large unordered sets. Sorts: a sort spilling to disk is thousands of times slower than one in memory. Filters: a `Filter` step that discards 99% of rows *after* fetching them means the database fetched data it didn't need — the filtering should have happened in the index.

**Move 4: Form one hypothesis.** Plans funnel down to a handful of recurring causes. No index on the filter, join, or sort columns — the classic case, covered in [how indexes improve query performance](how-does-an-index-improve-query-performance.md). A predicate that quietly disables an existing index — wrapping the column in a function like `WHERE DATE(created_at) = '2026-03-01'`, a leading-wildcard `LIKE '%smith'`, or in MySQL an implicit type cast where a string column is compared to a number. Selectivity: if your `WHERE status = 'active'` matches 92% of the table, the planner is *right* to ignore the index — reading the whole table sequentially beats hopping through an index to fetch almost every row in random order. Stale statistics, as above. Deep pagination: `LIMIT 20 OFFSET 500000` forces the database to walk and discard half a million rows every page. And two application-side causes that produce "slow" without any single query being slow: the ORM N+1 problem, and lock waits.

**Move 5: Change one thing, then prove it worked.** Add the one index you believe in. Re-run the plan and confirm your index's name actually appears in it — if the plan didn't change, the fix didn't land, and stacking a second guess on top of an unverifiable first one is how debugging becomes superstition. Then close the loop where you opened it: watch p95 for that endpoint after the deploy. Remember the trade-off before adding indexes casually — every index taxes every write and consumes memory, which is why [indexes can hurt performance](when-can-indexes-hurt-performance.md) when scattered carelessly.

Two surrounding-system interactions matter because they impersonate slow queries. Connection pool exhaustion: your query might execute in 5ms but sit queued in the application waiting for a free connection for 900ms — the endpoint is slow, the database is innocent, and the fix is [connection pooling](what-is-connection-pooling.md) configuration, not indexing. Lock contention: the same query that returns in 30ms in isolation crawls in production because another transaction holds the rows it wants — the plan is perfect, the wait is the problem, and the trail leads toward [locks and deadlocks](what-is-deadlock.md). This is exactly why you reproduce with production-shaped concurrency, not just production-shaped data volume.

## 4. See It In Practice — Real Code or Queries

First, a complete loop you can run right now on any machine — the whole demo below works on `sqlite3 :memory:`. We build a 202,500-row table, watch the plan admit it's scanning everything, add an index, and watch the plan change.

```sql
-- sqlite3 :memory:

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  customer_id INTEGER,
  status      TEXT,
  created_at  TEXT
);

-- Seed ~200k rows. SQLite caps recursive CTEs at 1000 iterations by default,
-- so one tall recursive CTE would fail; instead we cross-join two shallow
-- ones (450 x 450 = 202,500 rows), which stays comfortably under the cap.
WITH RECURSIVE
  a(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM a WHERE n < 450),
  b(m) AS (SELECT 1 UNION ALL SELECT m + 1 FROM b WHERE m < 450)
INSERT INTO orders (customer_id, status, created_at)
SELECT
  (a.n * 451 + b.m) % 5000,                                        -- 5000 customers, ~40 orders each
  CASE WHEN (a.n + b.m) % 10 = 0 THEN 'shipped' ELSE 'pending' END,
  date('2026-01-01', '+' || ((a.n * 451 + b.m) % 365) || ' days')
FROM a CROSS JOIN b;

.timer on

SELECT COUNT(*) FROM orders WHERE customer_id = 42;
-- Correct answer, ~40 rows — but the whole 202,500-row table was read to find them.

EXPLAIN QUERY PLAN
SELECT * FROM orders WHERE customer_id = 42;
-- Output (SQLite 3.36+; older versions print "SCAN TABLE orders"):
--   QUERY PLAN
--   `--SCAN orders
-- That is the plan admitting: no usable index, full table scan.

CREATE INDEX idx_orders_customer ON orders(customer_id);

EXPLAIN QUERY PLAN
SELECT * FROM orders WHERE customer_id = 42;
-- Output:
--   QUERY PLAN
--   `--SEARCH orders USING INDEX idx_orders_customer (customer_id=?)
-- Same query, same data — the plan flipped from SCAN to SEARCH.

SELECT COUNT(*) FROM orders WHERE customer_id = 42;
-- Now it seeks straight to the matching rows. In-memory SQLite keeps raw
-- times in the low milliseconds; the point is the plan flip — that same
-- flip is the difference between milliseconds and minutes once the table
-- lives on disk behind a network.
```

Now the same hunt with a wrap-around trap — a predicate that silently kills the brand-new index (still `sqlite3 :memory:`):

```sql
EXPLAIN QUERY PLAN
SELECT * FROM orders WHERE CAST(customer_id AS TEXT) = '42';
-- Back to:
--   QUERY PLAN
--   `--SCAN orders
-- The planner can only use the index when the bare column is compared to a
-- value. Wrapping the column in a function hides it. Rewrite so the function
-- sits on the other side, or drop the cast entirely.
```

Next, the production-grade PostgreSQL workflow. Syntax and views here are PostgreSQL-specific:

```sql
-- Which queries cost the most total time? (requires the extension)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;  -- also needs it in shared_preload_libraries

SELECT query, calls, mean_exec_time, total_exec_time   -- PG 13+ names; older: total_time/mean_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC                          -- frequency x duration, not just mean
LIMIT 10;

-- Who is running right now, and are they computing or waiting?
SELECT pid,
       now() - query_start AS running_for,
       wait_event_type,                               -- NULL = working; "Lock" = stuck on someone else
       left(query, 80) AS query_head
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY query_start;

-- Confirm the fix with real timings (numbers below are abridged and illustrative):
EXPLAIN ANALYZE
SELECT id, status, created_at
FROM orders
WHERE customer_id = 42
ORDER BY created_at DESC
LIMIT 20;

--   Limit (cost=...) (actual time=0.081..0.084 rows=20 loops=1)
--     -> Sort ... Sort Method: top-N heapsort  Memory: 26kB
--        -> Index Scan using idx_orders_customer on orders
--           (actual time=0.021..0.061 rows=40 loops=1)
--           Index Cond: (customer_id = 42)
--
-- The lesson hiding in this output: the planner ESTIMATED rows=3 but ACTUAL
-- was rows=40. Small here, but when estimates miss badly (guess 10, get
-- 100,000), every join and memory decision downstream is built on fiction.
-- Refresh stats with:  ANALYZE orders;

-- CRITICAL: EXPLAIN ANALYZE truly EXECUTES the statement. On a write, wrap it
-- so nothing persists (same caution applies to MySQL 8's EXPLAIN ANALYZE):
BEGIN;
EXPLAIN ANALYZE UPDATE orders SET status = 'archived' WHERE customer_id = 42;
ROLLBACK;
```

And the MySQL side — enabling the slow log, plus the implicit-cast trap that is MySQL's signature version of "the index mysteriously stopped working":

```sql
-- MySQL: switch on the slow query log (anything over 200ms gets recorded)
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 0.2;

SHOW FULL PROCESSLIST;   -- who is connected and what they're doing right now

-- The trap: phone is VARCHAR(20) with an index, compared to a NUMBER.
-- MySQL casts the COLUMN to a number to compare -> index unusable -> full scan.
SELECT * FROM users WHERE phone = 5551234567;    -- slow: column-side cast
SELECT * FROM users WHERE phone = '5551234567';  -- fast: literal gets cast instead

-- PostgreSQL draws the line differently: comparing VARCHAR to an integer
-- errors outright ("operator does not exist"), so this trap is MySQL-flavored.
```

Finally, the pagination fix. `OFFSET 500000` walks and discards half a million rows per page. Remember the last-seen position instead (tuple comparison shown is PostgreSQL syntax; MySQL supports row constructors too):

```sql
-- Page after the item with created_at='2026-03-01 10:00:00', id=98341
SELECT id, created_at, status
FROM orders
WHERE customer_id = 42
  AND (created_at, id) < ('2026-03-01 10:00:00', 98341)
ORDER BY created_at DESC, id DESC
LIMIT 20;
-- With a composite index led by (customer_id, created_at, ...) the database
-- walks the index directly to the next page instead of re-scanning everything.
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Walk me through how you'd debug a slow query in production.**

I start by refusing to accept "the app is slow" as the problem statement. First I identify the exact query — from the slow query log threshold, from `pg_stat_statements` ranked by total execution time, or from an APM trace on the failing endpoint. Ranking by total time matters because frequency multiplies duration. Second, I reproduce it with production-shaped data volume, because a 5,000-row dev table makes every plan look instant. Third, I run `EXPLAIN ANALYZE` and read it: scan type first (sequential scan over a big filtered table means no usable index), then estimated-versus-actual row counts (a big gap means stale statistics), then join algorithms and any sort spilling to disk. Fourth, I form one hypothesis from the usual suspects — missing index, non-sargable predicate, stale stats, deep OFFSET, N+1 from the ORM, or lock waits. Fifth, I change exactly one thing, re-read the plan to confirm my index actually appears in it, and then watch p95 on the endpoint after deploy to prove the fix landed. If the plan didn't change, I stop and figure out why rather than piling on a second guess.

**Q: What's the difference between EXPLAIN and EXPLAIN ANALYZE?**

`EXPLAIN` shows the plan the optimizer *intends* to run — it's free, instant, and safe, because nothing executes. It's what you use to reason about a query and to sanity-check plans in code review or CI. `EXPLAIN ANALYZE` actually *runs the query*, then annotates the plan with real timings and real row counts. That's the only way to see the truth — including the crucial estimate-versus-reality gap that exposes stale statistics — but it comes with two costs: it spends the query's full runtime (potentially expensive on a heavy scan against production), and it genuinely executes writes, so `EXPLAIN ANALYZE UPDATE` modifies your data. The professional habit is `EXPLAIN` to explore, `EXPLAIN ANALYZE` to confirm, and for write statements always inside a transaction you roll back — in PostgreSQL with `BEGIN ... ROLLBACK`, and knowing that MySQL 8's `EXPLAIN ANALYZE` executes too.

**Q: An index exists on the column, but the query still scans the whole table. Why would the planner ignore the index?**

Because an index only helps if the query can use it, and several very normal things break that. The predicate wraps the column in a function or expression — `DATE(created_at) = ...`, `lower(email) = ...`, `CAST(x AS TEXT) = ...` — so the planner can't match it to the index; the rewrite is to move the function onto the value side or create a functional/expression index deliberately. MySQL adds the implicit-cast variant: comparing a string column to a number casts the column, killing the index. Leading-wildcard searches like `LIKE '%son'` can't walk a B-tree from the front. Low selectivity: if the predicate matches most of the table, the planner is correct to prefer a sequential scan, because random index hops across nearly every row are slower than one clean pass. And stale statistics can make the planner *believe* selectivity is terrible when it isn't — which is why `ANALYZE` is often the cheapest fix in the whole toolbox. The debugging move is the same every time: read the plan, find which of these applies, don't assume.

**Q: The query is fast when I run it manually but slow in production. What does that tell you?**

That the query itself probably isn't the problem — its environment is. The two big suspects are contention and caching. Contention: in production another transaction may hold locks on the rows or tables it touches, so the query spends its life waiting, not computing; `wait_event_type` in `pg_stat_activity` (or `SHOW PROCESSLIST` in MySQL) shows processes sitting in "Lock" waits, and that trail leads toward transaction design and deadlock avoidance rather than indexing. Caching cuts the other way: my manual run hits warm buffers and a tiny dev dataset, flattering the numbers. The third suspect lives outside the database entirely — connection pool exhaustion, where the query runs in 5ms but the request waited 900ms for a free connection; endpoint timing broken down into "time to acquire connection" versus "query time" exposes that instantly.

**Q: The endpoint is slow, but every individual query looks fast. Where's the time going?**

That combination almost always means quantity, not quality — the request fires far more queries than you think, and the classic cause is the ORM N+1 pattern: load 100 orders in one query, then lazily touch `order.customer` in a loop and fire 100 more. Each one is a 2ms indexed lookup, invisible in any slow query log, but 101 round trips × 2ms of database time plus 101 network latencies adds up to a visibly slow endpoint. The detection tools are query-count logging per request and APM traces showing hundreds of tiny sequential spans. The fixes, in order of preference: eager loading (a single join or a batched `IN` fetch), batching, or denormalizing a hot field. The reason this question is asked is to see whether you debug at the *request* level, not just the statement level.

**Q: How do you stop slow queries from becoming a recurring surprise?**

You make the database confess continuously instead of investigating emergencies. Leave `pg_stat_statements` (or MySQL's slow log plus performance schema) feeding a dashboard ranked by total time, with an alert when a known-cheap query shape crosses a threshold. Set `log_min_duration_statement` conservatively in production — log slow statements without drowning in noise. In code review and migrations, require that new query paths get exercised against realistic data volume, because a query tested on 200 rows proves nothing about 20 million. And when you do fix a query, record the plan before and after in the PR — it turns one engineer's debugging into the team's documentation.

**Q: The same query has gotten steadily slower over six months with no code change. What happened?**

The data grew, and the plan quietly changed. As tables grow, planners flip strategies — an index lookup that beat a scan at 100k rows loses at 50 million when the index depth grows and the hot pages no longer fit in memory, or the reverse: a query that used a narrow index now matches a much larger fraction of the table, so the planner correctly switches to a scan. Statistics drift as data distribution shifts, making estimates worse over time. Pagination is the stealth offender: the same `OFFSET` query gets linearly slower as users scroll deeper. None of these show up in the query text — which is exactly the point: the plan is the living thing, and steady degradation means you go look at how the plan evolved, not at the SQL.

## 6. The Traps — What Goes Wrong in Production

**Optimizing before measuring.** The wrong assumption: "it's the orders query, everyone knows that one is heavy." Why it's wrong: gut feeling attributes slowness to famous queries, while the real cost leader is often a boring 30ms query executed 50,000 times an hour. What actually happens: you tune the celebrity query, deploy, and p95 doesn't move, because you treated the wrong patient. The fix is mechanical: rank candidates by total time (calls × mean) before touching anything.

**Trusting dev timings.** The wrong assumption: "it returns in 28ms locally, so the query is fine and production must be misconfigured." Why it's wrong: dev tables are small, caches are warm, and nothing else competes for resources. What actually happens: the production plan differs — literally, a different join order — because the optimizer saw different table sizes and statistics. The fix: reproduce with production-scale row counts (seeded or anonymized) before drawing conclusions, and compare the production plan (`EXPLAIN` output from logs) against your local one.

**Adding the index and declaring victory.** The wrong assumption: "index added, therefore used." Why it's wrong: the planner re-decides on every execution, and stale statistics, a non-sargable predicate elsewhere in the query, or the ORM rewriting the SQL into a slightly different shape can leave the new index unused. What actually happens: the deploy ships, the plan is unchanged, and nobody notices for a week. The fix: after creating the index, re-run the plan and verify your index name appears in it — and in PostgreSQL, remember a freshly loaded table benefits from `ANALYZE` so the planner knows the new index's selectivity.

**Running EXPLAIN ANALYZE on a write against production data.** The wrong assumption: "EXPLAIN is a read-only analysis tool." Why it's wrong: `ANALYZE` means *execute*. What actually happens: `EXPLAIN ANALYZE DELETE FROM orders WHERE ...` performs the deletion, for real, at whatever scale the predicate matches. The fix: for any INSERT/UPDATE/DELETE, wrap it — `BEGIN; EXPLAIN ANALYZE ...; ROLLBACK;` in PostgreSQL — and treat MySQL 8's `EXPLAIN ANALYZE` with the same respect.

**Chasing the wrong layer when the pool is the bottleneck.** The wrong assumption: slow endpoint + database involved = slow query. Why it's wrong: the request timeline includes waiting for a pooled connection, and under traffic spikes every request queues there. What actually happens: you spend days optimizing queries whose individual timings were already fine, while requests pile up waiting for connections. The fix: split request latency into acquisition time versus query time in your instrumentation; if acquisition dominates, the work moves to pool sizing and connection leaks — see [connection pooling](what-is-connection-pooling.md).

**Indexing as a reflex.** The wrong assumption: every slow query ends with `CREATE INDEX`. Why it's wrong: every index is a second data structure updated on every write, and unused or low-value indexes tax inserts and updates forever. What actually happens: six months later the write-heavy tables crawl and nobody remembers which of the forty indexes are earning their keep. The fix: index deliberately — filter, join, and sort columns with real selectivity, composites ordered by the query's equality-then-range pattern ([composite index rules](what-is-a-composite-index.md)), and revisit [when indexes hurt](when-can-indexes-hurt-performance.md).

## 7. Compare With Related Concepts

**Debugging a slow query vs. adding an index.** Indexing is one possible *treatment*; debugging is the *diagnosis* that tells you whether treatment is needed and which one. Teams that conflate them ship indexes for problems that were lock waits, N+1s, or stale stats. Rule: never propose a fix until a plan has told you what the database actually did.

**EXPLAIN vs. EXPLAIN ANALYZE.** `EXPLAIN` is the intention — cheap, safe, sometimes fictional. `EXPLAIN ANALYZE` is the observed reality — truthful, costly, dangerous on writes. Rule: `EXPLAIN` to think, `EXPLAIN ANALYZE` to confirm, transactions around anything that writes.

**Slow query vs. slow endpoint.** A slow query is one statement taking too long; a slow endpoint may be a thousand fast statements (N+1), connection queuing, or serialization overhead. They share a symptom and have disjoint fixes. Rule: if every individual query is fast but the request isn't, stop reading plans and start counting round trips.

**Missing index vs. lock contention.** Both present as "this query is slow," but a missing index is slow *everywhere, always*, while lock contention is slow *only under concurrent load* and often vanishes the moment you run the query alone. Rule: same plan, different latency between quiet and peak hours — follow the locks, not the indexes.

**This workflow vs. reading a static plan.** Knowing how to [read a query execution plan](what-is-query-execution-plan.md) is vocabulary; this page is grammar. The plan page explains what `Seq Scan` or a hash join means; debugging is the disciplined loop that decides *which* plan to pull, *when*, and *what to change* afterward. Rule: learn the parts once, practice the loop forever.

## 8. 🧠 The Memory Hook

Diagnose before you prescribe: "slow" is a symptom, the plan is the X-ray, and estimated-versus-actual rows is the blood panel that catches the liar. One hypothesis, one change, verify the index's own name in the new plan — because a doctor who starts three meds at once learns nothing, and neither do you.
