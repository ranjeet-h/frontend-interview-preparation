# PostgreSQL Query Is Slow — How Will You Optimize It

## 1. The Real-World Problem — When You Actually Hit This

Your app ran fine for six months. In development you had 800 orders in the table and the order history page loaded in 90ms. Now you have 2.1 million orders in production. A customer opens their order history and the spinner runs for 8 seconds. Your p95 latency graph jumps from 200ms to 4 seconds. The API times out. Postgres CPU sits at 95%. The on-call engineer restarts the app and nothing changes.

You did not change the code. The data grew. What was a tiny table scan in development became a full table scan across millions of rows in production. And the worst part, you have no idea which query is actually slow until you look. The app has 40 different queries touching the orders table. Guessing and adding random indexes will make it worse, lock the table, and slow down writes.

This is the moment every backend engineer hits. The question in the interview is not "do you know what an index is" — it is "can you go from 'everything is slow' to 'this exact query is slow for this exact reason, here is the evidence, here is the safe fix, and here is how I know it worked.'"

## 2. The Analogy — Make the Mechanic Obvious

Think of a Postgres table as a huge library where books are tossed on shelves in the order they arrived, not sorted by topic.

A query without an index is like asking the librarian to "find every book by Haruki Murakami." She has no catalog. She has to walk every aisle and flip every book — that is a sequential scan. It is fine when there are 100 books. It is a disaster with 2 million.

An index is a card catalog — a separate, sorted list that says "Murakami books are at shelves 42, 108, 719." The librarian goes straight there. That is an index scan. The catalog itself takes space on the wall and someone has to keep it updated every time a new book arrives. That is the write cost of an index.

Now the other mechanics map cleanly:

The librarian's desk is memory. Buffers are how many books she can hold on the desk at once. If the result fits on the desk, it is fast. If not, she keeps walking back to the shelves — that is disk I/O.

work_mem is the size of her desk for one job like sorting or hashing. If you ask her to sort 100,000 books alphabetically but her desk only fits 1,000, she has to spill the rest onto the floor and sort in batches. Slower, more shuffling. Give her a bigger desk for that one job and she finishes on the desk without touching the floor.

Vacuum and analyze are the cleanup crew. When books are returned or removed, the card still says they are there until someone pulls the old card. Postgres marks old row versions as dead but does not wipe them immediately. Vacuum reclaims that space. Analyze counts what is actually on the shelves so the planner knows which plan is faster — catalog lookup or walking the aisles.

EXPLAIN ANALYZE is asking the librarian to do the search with a stopwatch and a notepad, then tell you "I walked every aisle, looked at 2.1 million books, held 45,000 pages on my desk, spilled to the floor twice, and it took 6.8 seconds." Without that notepad you are just guessing.

pg_stat_statements is the security camera that records every request over the last hour and ranks them by total time. It tells you which query to chase first instead of chasing the one someone complained about the loudest.

And N+1 is a classic failure in this library. Instead of asking for "all 50 books for these 50 customers in one catalog lookup," you send a junior assistant 50 separate times to find one customer's book each time. 50 trips instead of one.

## 3. The Full Explanation — How It Actually Works

Start with how Postgres actually runs a query, in plain language, then add the terms.

When you send SQL, Postgres does three things. First it parses it. Then it plans it — it looks at table sizes, indexes, and statistics and guesses which path will be fastest. Then it executes that plan and reads pages from disk or from memory. The planner is often right, but only if its information is fresh and the right helpers exist. When information is stale or helpers are missing, it picks a slow plan confidently.

That is why slow-query work always starts with evidence, not fixes.

Finding the slow query comes first. In production you do not guess. You ask Postgres what it has been spending time on. The quickest wins are pg_stat_statements and the slow query log. pg_stat_statements is an extension that tracks every normalized query shape, how many times it ran, and its average and total time. Sort by total_exec_time and you find the query that hurts the system most. Sort by mean_exec_time and you find the query that hurts one user the most. pg_stat_activity shows what is running right now and whether it is waiting on a lock or on disk. Enables you to separate "this query is slow" from "this query is blocked by something else."

Once you have a candidate, you run EXPLAIN ANALYZE. This runs the query for real and shows the chosen plan step by step. Do not run plain EXPLAIN — that only shows the planner's guess without running anything. EXPLAIN ANALYZE shows actual time and actual row counts. Add BUFFERS to see how much came from memory versus disk. You will see lines like Seq Scan on orders or Index Scan using idx_orders_user_id. A Seq Scan means "I read every row." On a 10-row table that is fine. On a 2-million row table that is usually the smoking gun. You will also see costs, but focus on actual time and buffers. Cost is the planner's estimate in imaginary units. Actual time is real.

The planner's estimates versus reality tell you a lot. If it estimated 100 rows and got back 80,000, its statistics are stale. That is when you run ANALYZE or check if autovacuum is keeping up. Postgres keeps statistics about value distribution in pg_statistic. After a big bulk load or a lot of deletes, those stats are wrong and the planner may refuse to use a good index because it thinks the index will be slower.

Missing or wrong indexes are the most common root cause. If your WHERE filters on user_id but there is no index on user_id, expect a Seq Scan. If you have an index on (status) but your query filters on user_id and sorts by created_at, that single-column index does not help much. Composite indexes help but order matters — put the column you filter with equality first, then the column you sort or range-filter on. If you always query WHERE user_id = $1 AND status = 'paid', an index on (user_id, status) is exactly right. If you query WHERE email = $1 but you wrote WHERE lower(email) = lower($1), a plain index on email is useless. You need an expression index like (lower(email)). Same with LIKE — WHERE name LIKE 'An%' can use a btree index, WHERE name LIKE '%An%' cannot. These are places where the shape of the query breaks the helper.

Reading data is only one cost. Sorting and hashing have their own memory budget. When Postgres needs to sort for ORDER BY or build a hash for a JOIN or GROUP BY, it uses work_mem for that one operation. If the data to sort is larger than work_mem, Postgres spills to disk and you will see "Sort Method: external merge Disk: 4120kB" in EXPLAIN ANALYZE. That spill is slow. You do not fix that by adding an index on everything. Sometimes you fix it by supporting the sort with an index that delivers rows pre-sorted, sometimes by reducing the sort size with a better WHERE or LIMIT, sometimes by raising work_mem for that one session or query, not globally. Raising work_mem globally sounds generous but each concurrent query and each sort node inside a query can use that much. Set it too high and 100 concurrent queries can OOM the server.

Bloat and vacuum are the quiet killer. Postgres uses MVCC, which means an UPDATE does not overwrite the old row in place. It creates a new version and marks the old one dead. Dead rows stay on the page until VACUUM cleans them up. If your table gets many updates or deletes and vacuum cannot keep up, your table and indexes bloat. EXPLAIN shows buffers that are huge even though the live row count is small. That is a bloat signal. Autovacuum usually handles this, but on very busy tables you may need to tune it to run sooner or manually run VACUUM ANALYZE after a large batch change. Without that, an index scan still reads all the dead pages.

The trickiest production slow-down is N+1. Your ORM loads 50 users in one query, then loops and does SELECT * FROM orders WHERE user_id = $1 fifty separate times. Each one is fast alone, like 3ms, but 50 times is 150ms plus 50 network round trips. In observability it hides because no single query is slow. pg_stat_statements reveals it as one query shape called thousands of times. Fix it by fetching in one shot — a JOIN or a single WHERE user_id IN (...) or the ORM's eager load like include or joinedload. The fix is usually one line and cuts total time by 90 percent.

The safe fix order should be this. Measure first to find the one query that matters most. Explain it to see seq scan versus index, buffers, and sorts that spill. Check row estimate versus reality and last_analyze. Fix the query shape if it defeats indexes. Add the right index with CONCURRENTLY so you do not lock writes. Run ANALYZE. Retest with EXPLAIN ANALYZE to confirm buffers dropped and time fell. Then watch pg_stat_statements after deploy to confirm mean time and total time both improved. Any step skipped is a trap.

Every index you add helps reads and hurts writes. Each INSERT, UPDATE, or DELETE has to update each index on that table. Two or three well-chosen indexes is normal. Twelve indexes on a write-heavy table is a warning sign. Partial indexes like WHERE status = 'active' and covering indexes with INCLUDE save space and write cost when only a subset matters. Use them instead of indexing everything.

This work touches everything around the query. Connection pools can hide or amplify slowness — if queries get slower, connections are held longer, the pool exhausts, and new requests queue even though Postgres still has capacity. Timeouts matter — a client timeout that is too generous turns one slow query into a pile-up. Retries without idempotency can turn a 1-second slow query into three identical slow queries. And observability is part of the fix — if you do not leave behind pg_stat_statements monitoring, slow log thresholds, and a dashboard on buffers and sequential scans, the same query will get slow again quietly.

## 4. See It In Practice — Real Code or Queries

These examples are Postgres syntax. Run them in psql or any Postgres client. Comments call out why each line is there.

Start with a realistic table. This is what a slow order history often looks like.

```sql
-- A typical orders table that grew from thousands to millions
CREATE TABLE orders (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL,
  status      text NOT NULL,        -- 'pending', 'paid', 'shipped'
  total_cents int NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed some data for the demo (skip in production)
INSERT INTO orders (user_id, status, total_cents, created_at)
SELECT
  (random()*50000)::bigint,
  (ARRAY['paid','pending','shipped'])[ceil(random()*3)],
  (random()*5000)::int,
  now() - (random()*365 || ' days')::interval
FROM generate_series(1, 200000);
```

Find the worst queries first. Do this before you touch any plan.

```sql
-- 1. You need this extension once per database (needs restart config in some setups)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 2. Top 5 queries by total time — these hurt the system most
SELECT
  calls,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(total_exec_time::numeric, 2) AS total_ms,
  left(query, 120) AS query_preview
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 5;

-- 3. What is running right now and is it waiting?
SELECT pid, now() - query_start AS duration, wait_event_type, wait_event, left(query, 100)
FROM pg_stat_activity
WHERE state = 'active' AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC;
```

Now reproduce the slow path with real evidence. This is the runnable diagnosis.

```sql
-- The slow user-facing query: "show my last 20 paid orders, newest first"
-- In development with 800 rows this feels instant even without an index.

-- Run with ANALYZE to execute it for real, BUFFERS to see disk vs memory
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, status, total_cents, created_at
FROM orders
WHERE user_id = 42 AND status = 'paid'
ORDER BY created_at DESC
LIMIT 20;
```

Without a good index you will see something like this in the output (numbers will differ):

```txt
Limit  (cost=41234.00..41234.05 rows=20 width=32) (actual time=182.401..182.410 rows=20 loops=1)
  Buffers: shared hit=102 read=18420
  ->  Sort  (cost=41234.00..41245.00 rows=4400 width=32) (actual time=182.398..182.405 rows=20 loops=1)
        Sort Key: created_at DESC
        Sort Method: external merge  Disk: 3520kB
        Buffers: shared hit=102 read=18420
        ->  Seq Scan on public.orders  (cost=0.00..41100.00 rows=4400 width=32) (actual time=0.015..175.301 rows=4821 loops=1)
              Filter: ((user_id = 42) AND (status = 'paid'::text))
              Rows Removed by Filter: 1995179
              Buffers: shared hit=12 read=18420
Planning Time: 0.412 ms
Execution Time: 182.815 ms
```

Read it like this. Seq Scan on 2 million rows means no useful index. Rows Removed by Filter: 1,995,179 means it read almost everything and threw it away. Buffers read=18420 means it touched a huge number of 8kB pages from disk, not cache. Sort Method external merge Disk means the sort spilled past work_mem to disk. Execution Time 182ms on a warm test can be 2 to 8 seconds cold or under load.

Fix the query and add the right index safely. Order matters inside a composite index.

```sql
-- Good composite index: equality columns first (user_id, status), then sort column
-- Use CONCURRENTLY in production so you do not lock writes on the table
-- Do not use CONCURRENTLY inside a transaction block
CREATE INDEX CONCURRENTLY idx_orders_user_status_created
  ON orders (user_id, status, created_at DESC);

-- Let the planner see the new index stats right away
ANALYZE orders;

-- Re-run the same EXPLAIN to prove it worked
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, status, total_cents, created_at
FROM orders
WHERE user_id = 42 AND status = 'paid'
ORDER BY created_at DESC
LIMIT 20;
```

After the fix the plan flips:

```txt
Limit  (cost=8.44..8.60 rows=20 width=32) (actual time=0.041..0.048 rows=20 loops=1)
  Buffers: shared hit=28
  ->  Index Scan using idx_orders_user_status_created on public.orders
        (cost=0.42..42.10 rows=4400 width=32) (actual time=0.038..0.044 rows=20 loops=1)
        Index Cond: ((user_id = 42) AND (status = 'paid'::text))
        Buffers: shared hit=28
Planning Time: 0.321 ms
Execution Time: 0.072 ms
```

Buffers dropped from 18,000 reads to 28 hits. No sort at all — the index already delivers rows in created_at DESC order. Execution time fell from 180ms to under 0.1ms. That difference gets multiplied by every concurrent user.

Two more small fixes that come up constantly.

Fix a query that defeats its own index with a function. A plain index on email cannot serve lower(email).

```sql
-- Slow: function on the column prevents index use -> Seq Scan
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM users WHERE lower(email) = lower('An@Example.COM');

-- Fix: index the expression you actually query
CREATE INDEX CONCURRENTLY idx_users_lower_email ON users (lower(email));
ANALYZE users;
-- Now re-run the same SELECT and you will see an Index Scan / Bitmap Index Scan
```

Fix a work_mem spill without touching global settings.

```sql
-- See the spill first
EXPLAIN (ANALYZE, BUFFERS)
SELECT user_id, count(*) FROM orders GROUP BY user_id ORDER BY count(*) DESC LIMIT 10;
-- If you see "Sort Method: external merge  Disk: ...", try per-session tuning

-- Raise only for this session or transaction, not globally
SET LOCAL work_mem = '64MB';  -- inside a transaction, or SET work_mem = '64MB' for the session
EXPLAIN (ANALYZE, BUFFERS)
SELECT user_id, count(*) FROM orders GROUP BY user_id ORDER BY count(*) DESC LIMIT 10;
-- If Buffers and Execution Time drop and the sort becomes "quicksort  Memory:",
-- you found the bottleneck. Consider whether an index or smaller result set is still the better long-term fix.

-- Check bloat and stale stats for a busy table
SELECT relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum, last_analyze, last_autoanalyze
FROM pg_stat_all_tables WHERE relname = 'orders';

-- If n_dead_tup is large or last_analyze is old after a bulk load:
VACUUM ANALYZE orders;  -- reclaims dead rows and refreshes statistics
```

N+1 in application code. This is not a slow query plan, it is a chatty app. pg_stat_statements shows it as one shape called thousands of times.

```js
// Slow: 1 query for users + N queries for orders (N+1)
// Each find is fast, but 50 users means 51 round trips
const users = await db.query('SELECT id, name FROM users LIMIT 50');
for (const u of users.rows) {
  // called 50 times — this is the N+1
  const orders = await db.query('SELECT id, total_cents FROM orders WHERE user_id = $1', [u.id]);
  u.orders = orders.rows;
}

// Fast: one query for everything — one round trip, one plan
const rows = await db.query(`
  SELECT u.id AS user_id, u.name, o.id AS order_id, o.total_cents
  FROM users u
  LEFT JOIN orders o ON o.user_id = u.id
  WHERE u.id IN (SELECT id FROM users LIMIT 50)
  ORDER BY u.id, o.created_at DESC
`);
// Or with an ORM eager load (example: Prisma / Sequelize / SQLAlchemy equivalent):
// prisma.user.findMany({ include: { orders: true }, take: 50 })
// Make sure this emits a JOIN or WHERE user_id IN (...), not a hidden loop
```

Keyset pagination for deep pages. OFFSET gets slower the further you go because Postgres still reads and discards all prior rows.

```sql
-- Slow on page 5000: reads 100,000 rows then throws away 99,980
SELECT id, created_at FROM orders ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET 100000;

-- Fast: remember the last seen (created_at, id) from the previous page
SELECT id, created_at FROM orders
WHERE (created_at, id) < ('2025-11-01 10:00:00+00', 98123)
ORDER BY created_at DESC, id DESC
LIMIT 20;
-- Needs an index on (created_at DESC, id DESC) to be an Index Scan, not a sort
```

## 5. Interview Questions — All of Them, Done Properly

**Q: A query is slow only in production. Where do you start?**

You do not start by adding an index. You start by proving which query is slow and why. Turn on or check pg_stat_statements sorted by total_exec_time and mean_exec_time and check pg_stat_activity for what is actually running and waiting. Look at logs for slow query threshold, APM traces, and error rates. Pick the one query that costs the system the most total time. Then run EXPLAIN ANALYZE with BUFFERS on that exact query shape against production-sized data, not your empty dev database. Without that, you are guessing and you may optimize a fast query while the real bottleneck stays hidden.

**Q: What does EXPLAIN ANALYZE tell you that EXPLAIN alone does not?**

Plain EXPLAIN shows the planner's guess: what plan it would pick, estimated cost, estimated rows. It never runs the query, so its numbers may be fantasy. EXPLAIN ANALYZE actually runs the query and shows real time per node, real row counts, and with BUFFERS, real disk versus memory behavior. The gap between estimated rows and actual rows is the diagnosis — if it estimated 100 rows and got 80,000, its statistics are stale and it likely chose the wrong plan. Buffers tells you whether you are memory-bound or disk-bound. Cost alone cannot tell you that.

**Q: What does a Seq Scan mean and when is it actually okay?**

Seq Scan means Postgres read every row in the table or partition and applied your filter. It is the simplest plan and the slowest on a large table without a selective filter. It is okay when the table is tiny, when you genuinely need most rows like SELECT count(*) on a small table, or when the filter matches a huge fraction of rows so an index would just add extra hops. If you see Seq Scan on a 2-million row table returning 20 rows, you are almost certainly missing an index or the query shape prevented index use.

**Q: Why would Postgres ignore an existing index?**

Several reasons, and each looks different in EXPLAIN. The query may wrap the indexed column in a function like lower(email) or use LIKE '%foo' where the wildcard is on the left — the btree index cannot help there. The index may be on the wrong column order for a composite case. Statistics may be stale so the planner thinks the table is small. The query may ask for a huge fraction of rows, and the planner correctly decides a Seq Scan is cheaper than chasing index pointers plus heap lookups. Or the table is so small that the overhead of using the index outweighs the scan. Fix the matching one: create an expression index, rebuild the query to be index-friendly, run ANALYZE, or add a partial index.

**Q: What is pg_stat_statements and how do you use it?**

It is an extension that records every normalized query shape, not every literal. SELECT * FROM orders WHERE user_id = 42 and SELECT * FROM orders WHERE user_id = 99 count as the same query with different parameters. It tracks calls, total time, mean time, and rows. Order by total_exec_time DESC to find the query that loads the whole system. Order by mean_exec_time DESC to find the query that tortures one user. Check calls too — a query called 80,000 times at 3ms each looks fast alone but is 240 seconds of total time and likely an N+1. It also lets you confirm a fix actually worked after deploy by watching mean time drop.

**Q: What do VACUUM and ANALYZE do and why do they affect speed?**

Because of MVCC, UPDATE creates a new row version and marks the old one dead. DELETE marks rows dead. Dead rows sit on pages taking space and I/O until VACUUM reclaims them. If vacuum falls behind, the table bloats and even an index scan reads many dead pages — Buffers stays high. ANALYZE is separate — it samples the table and refreshes statistics about value distribution so the planner's row estimates are accurate. After a big data load, a bulk delete, or a new index, run ANALYZE so the planner knows the new shape. Autovacuum handles both automatically in most installations, but very busy or very large tables often need tuning so it triggers sooner, and large batch jobs often need a manual VACUUM ANALYZE right after.

**Q: What is work_mem and when do you change it?**

work_mem is how much memory one sort or hash operation can use before spilling to disk. It is per operation, not per query or per connection, so one query with three sorts can use three times work_mem. When you see Sort Method: external merge Disk in EXPLAIN ANALYZE, you are spilling. You can fix the spill by raising work_mem for that session, by creating an index that avoids the sort, or by shrinking the data you sort. Never raise work_mem globally to a huge value to fix one slow report — 100 concurrent queries each doing a hash join at 256MB would try to use 25GB. Use SET LOCAL or a per-role setting for the heavy job and fix the query itself if you can.

**Q: What does Buffers in EXPLAIN ANALYZE BUFFERS tell you?**

Buffers shows shared blocks hit versus read plus temp blocks. hit means the page was already in shared_buffers or OS cache — fast. read means it came from disk — slow on first call, faster once cached. temp read and written means temp files for sorts or hashes that spilled — slow. If Buffers shows high read on repeated runs, your working set does not fit in memory or the index is reading huge bloat. If hit is high but execution time is still bad, you are CPU-bound or lock-bound, not I/O-bound. Buffers is what separates "the plan looks cheap" from "the plan actually moved a lot of data."

**Q: How do you fix N+1 and how do you spot it?**

Spot it in pg_stat_statements as a simple point query like SELECT ... WHERE user_id = $1 with an enormous call count, or in APM traces as 50 identical queries inside one request. Spot it in code as a loop that awaits a query per item. Fix it by doing one query instead of N: use JOIN, use WHERE user_id IN (...), or use the ORM's eager loading option and verify the SQL it emits is actually a single query, not a hidden loop. After the fix, pg_stat_statements calls for that shape should collapse and the endpoint latency should drop visibly even though no single query got faster.

**Q: How do you add an index safely on a busy production table?**

Use CREATE INDEX CONCURRENTLY. A normal CREATE INDEX takes a lock that blocks writes to the table while it builds. CONCURRENTLY builds without that long lock, so writes keep flowing. It takes longer and uses more resources, but it does not cause an outage. Do it during a quieter window, watch disk and CPU, then run ANALYZE on the table. Always test the index on a staging copy with EXPLAIN ANALYZE to confirm the plan actually switches from Seq Scan to Index Scan and Buffers drops. Then monitor pg_stat_statements after deploy to confirm the query's mean and total time fell and that write latency did not spike.

## 6. The Traps — What Goes Wrong in Production

**Adding an index without CONCURRENTLY and locking the table.** The naive CREATE INDEX takes an AccessExclusive-style lock that blocks writes until the build finishes. On a million-row table that can be many seconds or minutes, orders stop getting inserted and users see errors. The fix is CONCURRENTLY outside a transaction block. It is easy to forget under pressure and cause the bad outage you were trying to prevent.

**Creating the wrong index shape and wondering why nothing changed.** A common mistake is indexing one column when the query filters on two. An index on (user_id) alone still forces a filter on status and may not support the ORDER BY. Another mistake is putting the range or sort column first in a composite index when equality columns should come first. If your WHERE is user_id = $1 AND status = 'paid' ORDER BY created_at, the index should be (user_id, status, created_at DESC), not (created_at, user_id). Check the plan after every index change.

**Indexing everything and slowing down writes.** Each index is another structure to update on every INSERT, UPDATE, and DELETE, more WAL to replicate, more vacuum work, and more memory. A table with 12 indexes on a write-heavy path can be slower after "optimization" because every write got 30 percent more expensive. Prefer two or three precise indexes, use partial indexes like WHERE status = 'paid' when only a subset is queried, and use INCLUDE for covering indexes instead of bloating the key with columns you only need to return.

**Trusting EXPLAIN without ANALYZE, without BUFFERS, or against tiny dev data.** Plain EXPLAIN without ANALYZE hides the actual row count mismatch. EXPLAIN without BUFFERS hides the disk versus memory story. And running against a dev database with 800 rows will never show a Seq Scan problem because 800 rows is cheap to scan. Always test against realistic row counts and look at actual rows, actual time, and buffers together. A cheap-looking cost can still move 20,000 pages.

**Forgetting ANALYZE after a bulk load so the planner keeps using the old plan.** You bulk inserted 500,000 rows, but last_analyze was three days ago. The planner still thinks the table has 100,000 rows and keeps choosing a Seq Scan. One ANALYZE fixes it instantly. Teams chase missing indexes for hours when the real fix was refreshing statistics. Make ANALYZE part of your batch job's final step.

**Fixing the wrong level for a work_mem spill.** Raising work_mem globally to 256MB hides the spill for one report but risks OOM when many queries run at once, because work_mem is per operation, not per server. The better fix is often to avoid the sort entirely with an index that delivers rows in order, or to reduce the rows being sorted with a tighter WHERE. If you must raise work_mem, do it per transaction or per role, not for the whole cluster.

**Hiding N+1 behind an ORM and calling the query slow.** The single query SELECT * FROM orders WHERE user_id = $1 at 2ms looks innocent. The problem is it ran 400 times in one request for 800ms total. Profiling one query at a time misses it. You spot it by call count in pg_stat_statements or by counting queries per request in APM or by reading the loop in code. If your ORM fix still emits a loop, verify the SQL log — some include options still issue separate queries under the hood.

**Using OFFSET for deep pagination and watching latency grow linearly.** OFFSET 100000 means Postgres still reads 100,000 rows and throws them away to return 20. It gets linearly slower with page number. Users rarely notice on page 1 but page 500 is terrible. Switch to keyset pagination with WHERE (created_at, id) < ($last_created_at, $last_id) plus an index that matches the ORDER BY. It stays fast at any depth because it jumps instead of walking.

**Not monitoring after the fix and losing the win silently.** Indexes can degrade as data shape shifts, statistics drift, and new queries get deployed that miss the index by one column. If you do not leave a dashboard on pg_stat_statements mean time, sequential scan count from pg_stat_user_tables, and buffer read volume, the same query quietly gets slow again and no one notices until users complain.

## 7. Compare With Related Concepts

**Postgres EXPLAIN optimization versus MongoDB optimization.** They sound similar but the mechanics are different. In Postgres you read EXPLAIN ANALYZE, look for Seq Scan versus Index Scan or Bitmap Heap Scan, check row estimate versus actual, check Buffers for shared hit versus read plus temp spill, and fix with btree, partial, expression, or covering indexes plus ANALYZE and VACUUM hygiene. MongoDB has no JOIN planner, no MVCC dead-row bloat in the same way, and no work_mem spills, but it shows COLLSCAN versus IXSCAN in its explain output, and its pain points shift to collection scans, wrong compound index order, ESR rule violations, missing sorting strategy, and large embeddings that force many document fetches. Postgres optimization is largely about helping the planner pick the right path through statistics and access paths for relational joins. Mongo optimization is largely about picking the right compound index order, using covered queries with projection, avoiding collection scans with selective predicates, and modeling so you either embed or reference correctly to avoid extra round trips. Rule of thumb: when data is relational and queries join and filter on multiple columns with sorts, reach for Postgres index and planner reasoning. When data is document-shaped and access is mostly by one key with embedded arrays, reach for Mongo compound and multikey index reasoning. Do not apply one system's mental model to the other.

**Btree index versus hash versus GIN.** Postgres builds a btree by default, and btree handles equality, range, ORDER BY, and prefix searches. A hash index only does equality and was rarely worth it. GIN is for inverted search — inside JSONB, arrays, and full-text search where one column contains many values. If your slow query is WHERE metadata @> '{"tier":"paid"}', a btree on metadata is useless. You need GIN on metadata. Reach for GIN when you search inside the value, not on the whole value.

**Index versus partitioning versus materialized view.** An index speeds up finding existing rows. Partitioning speeds up finding rows by splitting a huge table into smaller pieces, usually by time, so queries that filter on the partition key skip whole partitions and vacuum and deletion get faster. A materialized view speeds up reading by precomputing an expensive join or aggregation and refreshing it on a schedule. If your slow query is a selective point lookup, add an index. If your table is 500 million rows and most queries filter by created_at month, partition. If your slow query is a heavy dashboard rollup that joins five tables, precompute it in a materialized view.

**Covering index with INCLUDE versus fat composite key versus partial index.** A covering index adds extra columns via INCLUDE so Postgres can answer the query from the index alone without going back to the heap — fast reads, but bigger index and more write cost for those included columns. A fat composite key puts many columns in the key itself, even bigger and more expensive. A partial index like WHERE status = 'paid' makes a tiny index over only the interesting subset — small, fast, cheap to maintain — but only helps queries that include that predicate. Rule: use partial when only a slice matters, use INCLUDE when you need a covering lookup for a specific hot query, do not bloat the key with columns you never filter on.

**work_mem tuning versus adding an index to avoid a sort.** Raising work_mem makes a sort or hash fit in memory. Adding an index can eliminate the sort entirely by delivering rows pre-sorted. work_mem is cheaper to try for a one-off report but does not scale with concurrency and hides the real cost. An index fixes the root cause permanently. Rule: if the sort is on a column you always sort by, prefer an index. If the spill is from an occasional large hash join, tune work_mem per session for that job.

## 8. 🧠 The Memory Hook

Slow Postgres is almost always "the librarian walked every aisle because you gave her no catalog, stale directions, or a desk too small for the job." Run EXPLAIN ANALYZE BUFFERS to catch which one, then give her the right catalog in the right order, fresh counts with ANALYZE, a clean floor with VACUUM, and a desk that fits only for the job that needs it. One precise index with proof beats ten guesses without evidence.
