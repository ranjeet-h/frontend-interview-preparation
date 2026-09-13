# Database CPU Is High — How Will You Debug It

## 1. The Real-World Problem — When You Actually Hit This

It is 2:13 PM on a Tuesday. Your app has been running fine for six months. Then PagerDuty fires: API latency p95 jumped from 180ms to 4 seconds. The frontend team says every page that touches the orders table is timing out. You open your cloud dashboard and the database CPU chart is pinned at 92 to 98 percent and has been for twenty minutes. It was 25 percent yesterday at the same time.

Nothing was deployed today. Traffic is only up 15 percent. But the database suddenly cannot keep up, and because your Node or Python app waits on the database for almost every request, the whole product feels down. Requests pile up, your app servers run out of connections, users retry, and that makes the database even hotter. If you just reboot the database or throw a bigger instance at it, you burn money and the problem comes back tomorrow. If you guess wrong and add an index that locks the table at peak, you make the outage worse.

This is what the interview is really asking: when the database is melting and the whole product is suffering, how do you find the real cause with evidence, calm the system down without breaking it further, and fix the root cause so it does not happen again.

## 2. The Analogy — Make the Mechanic Obvious

Think of your database as a busy restaurant kitchen.

The CPU is the head chef. Every query is a ticket that comes in from the dining room. Some tickets are simple: "give me order 9041" — the chef walks straight to the right shelf, grabs it, done. Some tickets are messy: "bring me every order from last year where the customer name contains an A" — the chef has to open every box in the pantry and read every label.

An index is like labels and organized shelves. With a good label, the chef walks straight to the shelf. Without it, the chef scans every box. That scanning is what burns CPU.

An N+1 query is like a waiter who, instead of bringing one tray with 30 dishes, makes 30 separate trips to the kitchen for one dish at a time. The kitchen does 30 times the work for the same result.

A lock is two cooks fighting over the same cutting board. Neither can finish. They just stand there, both busy but nothing gets plated. The kitchen looks 100 percent busy but throughput is zero.

Autovacuum and bloat are like trash piling up on the counters because no one took it out. The kitchen gets slower and slower until it is full of garbage that has to be stepped around.

The connection pool is the doorway into the kitchen. If you let 500 waiters crowd the doorway at once, no one can move, even though the chefs could handle orders if they came in batches of 20. A small, controlled doorway keeps flow steady.

The cache is the pass where finished plates sit under heat lamps. If the dish is already on the pass, you do not need to cook it again. If nothing is on the pass, every request forces a full cook from scratch.

Debugging high CPU is not staring at the chef sweating. It is reading the ticket rail to see which tickets are most common, which take the longest, which are waiting for a cutting board, and whether the shelves are labeled.

## 3. The Full Explanation — How It Actually Works

You debug database CPU in a strict order: prove it is really the database, find the expensive work with data, understand why that work is expensive, reduce pain, then fix safely.

Start with confirming the signal. A high CPU graph alone lies. Check whether it is user CPU (actual query work) or system/wait CPU, whether it correlates with slow queries, active connections, and lock waits. On AWS that is RDS Performance Insights or CloudWatch `CPUUtilization` plus `DatabaseLoad`. On self-hosted Postgres it is `top`, `pg_stat_activity`, and `pg_stat_statements`. You want to know: is the database actually doing work, or is it stuck waiting and spinning?

The most reliable source of truth is a sorted list of queries by total time and mean time. In Postgres that is the extension `pg_stat_statements`. On MySQL it is the slow query log with `long_query_time` and `log_queries_not_using_indexes`, or Performance Schema. These tell you what to look at first. Without them you are guessing.

Once you have the top queries, you explain them. `EXPLAIN` shows the plan the database intends to use. `EXPLAIN ANALYZE` actually runs the query and shows the real plan plus timing and row counts. `EXPLAIN ANALYZE` is more truthful but it runs the query, so you do not run it with `ANALYZE` on a huge production write at peak on the primary. Run it on a replica, on a sampled query, or use `EXPLAIN` plus `BUFFERS` and timing from `pg_stat_statements`.

What you are looking for in the plan is simple: is the database scanning every row to find a few? A `Seq Scan` on a million-row table that returns 10 rows is the classic CPU burner. It means an index is missing, or the wrong index is used, or the filter is not selective, or a function on the column like `WHERE lower(email) = ...` prevents index use. An `Index Scan` or `Index Only Scan` that touches only the rows you need is usually much cheaper in CPU. The tradeoff is that indexes cost you on writes and storage. Every `INSERT` and `UPDATE` now has to update the index too, and a table with eight indexes writes much slower than one with two.

N+1 lives above the database but shows up as database CPU. Your ORM loads 50 orders, then loops and fires one query per order to load its user: 1 + 50 queries instead of 1 joined query. Each query is fast alone, so it does not look slow in isolation, but together they do 50 times the planning, parsing, and round trips. You spot it because `pg_stat_statements` shows the same query shape with thousands of calls and low mean time but massive total time. The fix is a join, an `IN` batch, or an eager load like `include` or `populate`, not a faster database.

Locks make CPU look high while work is actually blocked. A long transaction holds a row lock, every other transaction queues behind it, they all sit active and burn CPU polling or spinning. Check `pg_stat_activity` for `wait_event_type = 'Lock'` and `state = 'active'` that have been running a long time, and join `pg_locks` to see who is blocking whom. Common causes are a forgotten `BEGIN` without `COMMIT` in application code, an `idle in transaction` connection held by an API handler, or a migration that took an `ACCESS EXCLUSIVE` lock. Fixing it means killing the blocker the right way or fixing the code that leaves transactions open, not just adding CPU.

Bloat and autovacuum make scans expensive even when the logic looks correct. In Postgres, `UPDATE` and `DELETE` do not remove the old row immediately. They leave a dead version that `VACUUM` later cleans up. If autovacuum cannot keep up — because writes are heavy, `autovacuum` is tuned too lazily, or a long transaction prevents cleanup — the table grows with dead rows. Now every `Seq Scan` or `Index Scan` has to walk over garbage. You will see table bloat, low cache hit ratio, and `last_autovacuum` far in the past. The fix is tuning `autovacuum_vacuum_scale_factor`, scheduling manual `VACUUM`, and most importantly closing long-running transactions that block vacuuming. Running `VACUUM FULL` at peak will lock the table, so you do that in a maintenance window.

Connection pressure is a separate CPU tax. If your app opens a new database connection per request and never pools, the database spends CPU just creating and tearing down connections and context switches. You will see `max_connections` approached, many connections in `idle` or `idle in transaction`, and CPU high even though query plans look fine. The fix is a pooler like PgBouncer in transaction mode, or a properly sized pool in your app (for Node `pg.Pool` with `max` 10 to 20 per app instance, not 100), plus setting `statement_timeout` and `idle_in_transaction_session_timeout` so bad code cannot hold connections forever.

Cache pressure is the last multiplier. If `shared_buffers` and the OS cache cannot hold your working set, every query hits disk and does more CPU work to decompress and sort. Check cache hit ratio with `blks_hit / (blks_hit + blks_read)` from `pg_stat_database` or `pg_statio_user_tables`. Below about 0.99 for an OLTP workload often means you are reading from disk too much. Big sorts that spill to disk because `work_mem` is tiny also spike CPU. Sometimes the cheapest win is not a new index but caching the result in Redis for a few seconds or adding a read replica for the heavy read path, because you avoid hitting the primary at all.

Putting it together, the order that keeps you safe is: confirm metric, capture top queries by total time, check active activity and locks, explain the top plans, decide whether it is a missing index, N+1, lock, bloat, pool, or cache problem, reduce load with a safe mitigation like a timeout or rate limit or cache, then ship the smallest fix that addresses the root cause and watch CPU, latency, and error rate confirm it.

## 4. See It In Practice — Real Code or Queries

These examples use Postgres because it has the richest debugging tooling. The same ideas map to MySQL slow log and Performance Schema. All queries are safe to run as read-only except where noted.

Find the expensive queries first with pg_stat_statements. This extension must be enabled once by an admin.

```sql
-- enable once (needs restart or shared_preload_libraries config)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- top queries by total time - the biggest CPU contributors overall
SELECT
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round((100 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 2) AS pct_total,
  left(query, 120) AS query_preview
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- same list sorted by mean time - finds the single slowest shape
SELECT
  calls,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(total_exec_time::numeric, 2) AS total_ms,
  left(query, 120) AS query_preview
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- reset stats after a fix so you can measure cleanly (admin only)
-- SELECT pg_stat_statements_reset();
```

Catch slow queries without that extension using the slow log. On MySQL this is equivalent to `SET GLOBAL slow_query_log = ON`.

```sql
-- postgresql.conf or ALTER SYSTEM - log queries over 200ms
ALTER SYSTEM SET log_min_duration_statement = '200ms';
SELECT pg_reload_conf();

-- also log queries that do not use an index when you are hunting scans
-- ALTER SYSTEM SET log_min_duration_statement = 0 -- only briefly, very noisy
```

Explain the plan. Never run EXPLAIN ANALYZE with writes on the primary at peak. Prefer a replica or add BUFFERS to see cache behavior.

```sql
-- safe: just the plan, does not run the query
EXPLAIN SELECT * FROM orders WHERE user_id = 42 ORDER BY created_at DESC LIMIT 20;

-- truthful but runs the query: use on a replica or with a safe SELECT
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT * FROM orders WHERE user_id = 42 ORDER BY created_at DESC LIMIT 20;

-- before the fix you will often see:
-- Seq Scan on orders  (cost=0.00..48231.00 rows=12 width=96)
--   Filter: (user_id = 42)
--   Rows Removed by Filter: 1999988
-- Planning Time: 0.2 ms  Execution Time: 412.5 ms

-- after adding the right index you want:
-- Index Scan using idx_orders_user_created on orders
--   Index Cond: (user_id = 42)
--   Buffers: shared hit=45
--   Execution Time: 1.8 ms
```

Fix the missing index safely. In production always use CONCURRENTLY so you do not lock writes.

```sql
-- bad in production at peak: locks the table for writes while building
-- CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);

-- good: builds without blocking writes, takes longer but is safe
CREATE INDEX CONCURRENTLY idx_orders_user_created ON orders(user_id, created_at DESC);

-- check that the index is actually used and selective
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats WHERE tablename = 'orders' AND attname = 'user_id';

-- drop an unused index that is taxing writes
-- SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;
-- DROP INDEX CONCURRENTLY idx_orders_unused;
```

Spot N+1 at the app layer. The queries look innocent individually but the call count gives it away.

```js
// N+1 - 1 query for orders + N queries for users = CPU multiplied
// pg_stat_statements will show this SELECT with calls = number of orders
app.get('/orders', async (req, res) => {
  const orders = await db.query('SELECT id, user_id FROM orders WHERE status = $1 LIMIT 50', ['paid']);
  // this loop fires 50 more queries
  for (const order of orders.rows) {
    const user = await db.query('SELECT name FROM users WHERE id = $1', [order.user_id]);
    order.userName = user.rows[0]?.name;
  }
  res.json(orders.rows);
});

// fixed - one query does all the work, one plan, one round trip
app.get('/orders', async (req, res) => {
  const result = await db.query(`
    SELECT o.id, o.user_id, u.name AS user_name
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE o.status = $1
    ORDER BY o.created_at DESC
    LIMIT 50
  `, ['paid']);
  res.json(result.rows);
});

// with an ORM like Sequelize or Prisma, same idea: eager load
// const orders = await Order.findAll({ where: { status: 'paid' }, include: User, limit: 50 });
```

See locks and blocking. This is the first thing to check when CPU is high but throughput is near zero.

```sql
-- who is currently running, how long, and what are they waiting for
SELECT pid, now() - query_start AS duration, wait_event_type, wait_event, state, left(query, 100)
FROM pg_stat_activity
WHERE datname = current_database() AND state <> 'idle'
ORDER BY query_start;

-- who is blocking whom
SELECT
  blocked.pid AS blocked_pid,
  blocked.query AS blocked_query,
  blocking.pid AS blocking_pid,
  blocking.query AS blocking_query
FROM pg_catalog.pg_locks blocked
JOIN pg_catalog.pg_stat_activity blocked_act ON blocked.pid = blocked_act.pid
JOIN pg_catalog.pg_locks blocking ON blocking.transactionid = blocked.transactionid AND blocking.pid != blocked.pid
JOIN pg_catalog.pg_stat_activity blocking_act ON blocking.pid = blocking_act.pid
WHERE NOT blocked.granted;

-- kill only as a deliberate mitigation, after you know who the blocker is
-- SELECT pg_cancel_backend(12345);   -- polite cancel
-- SELECT pg_terminate_backend(12345); -- hard kill
```

Check autovacuum and bloat. A table that has not been vacuumed is a table full of dead rows.

```sql
-- when was each table last vacuumed and how many dead rows remain
SELECT relname, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze, last_vacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;

-- cache hit ratio - below ~0.99 on OLTP often means you are hitting disk too much
SELECT
  datname,
  round(blks_hit::numeric / NULLIF(blks_hit + blks_read, 0), 4) AS cache_hit_ratio
FROM pg_stat_database
WHERE datname = current_database();

-- work_mem pressure: sorts spilling to disk show up in EXPLAIN as "Sort Method: external merge Disk:"
-- fix per query or per role: SET work_mem = '64MB';
```

Check connection pressure and pooling.

```sql
-- how many connections by state - lots of idle in transaction is a code bug
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;

-- max vs current
SHOW max_connections;
SELECT count(*) AS current_connections FROM pg_stat_activity;
```

```js
// Node pg.Pool - small, bounded pool with timeouts
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  max: 15,                      // not 100 - small queue forces backpressure
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000,      // kill runaway queries at the DB, do not let them spin
  idle_in_transaction_session_timeout: 10000
});

// always release in finally, never leave idle in transaction
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const r = await client.query('SELECT * FROM orders WHERE user_id = $1', [userId]);
  await client.query('COMMIT');
  return r.rows;
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

Cache the hot read path so the database does less work at all.

```js
// cache-aside for a hot, read-heavy endpoint
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

app.get('/products/:id', async (req, res) => {
  const key = `product:${req.params.id}`;
  const cached = await redis.get(key);
  if (cached) return res.json(JSON.parse(cached));

  const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'not found' });

  // short TTL - protects the DB during a spike, still stays fresh
  await redis.set(key, JSON.stringify(result.rows[0]), 'EX', 30);
  res.json(result.rows[0]);
});
```

## 5. Interview Questions — All of Them, Done Properly

**Q: The database CPU is at 95 percent right now. Walk me through your first ten minutes.**

You do four things in order and you do not guess. First, you confirm scope: is it really database CPU and not app CPU, is it one primary or all replicas, did latency and error rate spike at the same time as CPU. Second, you capture evidence before it scrolls away: snapshot `pg_stat_statements` top 10 by total time, `pg_stat_activity` for long-running and blocked queries, CPU and connection graphs, and recent deploys or cron jobs. Third, you reduce user impact without hiding the cause: set a short `statement_timeout`, throttle or cache the hottest endpoint, or shed non-critical background jobs, and if one bad query is clearly the culprit, cancel that pid with `pg_cancel_backend`. Fourth, you pick the smallest safe fix that addresses the root cause you can prove. You do not immediately scale the instance. A bigger box on top of a missing index just gives the bad query more room to run.

**Q: How do you find which query is burning CPU?**

You sort by total time, not just slow individual time. A query that takes 30ms but runs 20,000 times a minute burns more CPU than one that takes 2 seconds once an hour. In Postgres that is `pg_stat_statements` ordered by `total_exec_time`. In MySQL it is the slow log or `performance_schema.events_statements_summary_by_digest` ordered by `SUM_TIMER_WAIT`. You look at both `total_exec_time` and `calls` and `mean_exec_time`. High total with high calls is N+1 or a hot loop. High total with high mean is a missing index or bad plan. High calls with low mean still matters because planning overhead adds up. After you have the shape, you `EXPLAIN ANALYZE` that shape on a replica to see why it is expensive.

**Q: What is the difference between EXPLAIN and EXPLAIN ANALYZE, and when do you use each?**

`EXPLAIN` shows the plan the planner intends to use and its cost estimate without running the query. It is safe and fast but the estimate can be wrong if statistics are stale. `EXPLAIN ANALYZE` actually executes the query, shows the real row counts, real buffers hit or read, and real timing, so you see where the estimate diverged from reality. Because it runs the query, it adds load and can be dangerous on a huge write or on the production primary at peak. Use `EXPLAIN` first for a quick read, then `EXPLAIN (ANALYZE, BUFFERS)` on a replica or on a `SELECT` with a `LIMIT` when you need the truth. If `rows` estimated is 100 but actual is 800,000, your statistics or index choice is wrong.

**Q: You found a Seq Scan on a big table. Do you always add an index?**

No. An index speeds up reads but slows down every write and costs disk and cache. You add one when the filter is selective and frequent: many queries filter on `user_id = $1` and that returns a small slice of the table. You do not add one when the filter matches most rows, when the column has very low cardinality like a boolean, when the query uses a function on the column that defeats the index, or when the table is tiny. You also check column order. For `WHERE user_id = $1 ORDER BY created_at DESC` you want `(user_id, created_at DESC)`, not two separate indexes. And you create it with `CONCURRENTLY` so you do not take a write lock at peak. Sometimes the better fix is rewriting the query to be sargable, for example changing `WHERE lower(email) = lower($1)` to a case-insensitive index or `CITEXT`, or adding a partial index `WHERE status = 'active'` if only active rows are queried.

**Q: How does N+1 drive CPU high even when each query looks fast?**

Because the database does the same fixed work per query: parse, plan, execute, return. Fifty fast queries cost far more than one slightly slower join that returns the same data. In `pg_stat_statements` N+1 shows up as one query shape with an enormous `calls` count and modest `mean_exec_time` but huge `total_exec_time`. The app code shows a loop that awaits inside. The fix is to fetch in bulk: a `JOIN`, a `WHERE id IN (...)`, or an ORM eager load. You prove the fix by watching `calls` drop and `total_exec_time` for that shape collapse after deploy.

**Q: What do locks have to do with high CPU? The CPU graph is red but nothing is getting done.**

A blocked query still shows as active and the app keeps retrying, so CPU stays high while throughput is zero. A single long transaction that holds a lock forces every other transaction touching those rows to wait. You see it in `pg_stat_activity` as many queries stuck with `wait_event_type = 'Lock'` and a few old `idle in transaction` or long `active` backends. Joining `pg_locks` shows the blocker. The fix is not more CPU. It is finding the code that opened a transaction and never closed it — often a missing `commit`/`rollback` in a `try`/`finally` or an API handler that holds a transaction across an external HTTP call — and fixing that, plus setting `idle_in_transaction_session_timeout` so the database kills the bad holder next time.

**Q: What is autovacuum and why would it make CPU high?**

In Postgres, updating a row does not overwrite it. It writes a new version and marks the old one dead. Autovacuum is the background cleaner that reclaims dead rows so future scans do not have to walk over garbage. If autovacuum falls behind because the table has heavy writes, very low `autovacuum_vacuum_scale_factor`, or a long-running transaction that prevents cleanup, the table bloats. Now every scan touches many dead rows, does more CPU work, and cache hit ratio drops. You see `n_dead_tup` climbing and `last_autovacuum` old in `pg_stat_user_tables`. The fix is closing the long transaction that blocks vacuuming, tuning autovacuum to be more aggressive on hot tables, and scheduling vacuums in quiet hours. You do not run `VACUUM FULL` at peak because it locks the table.

**Q: How do connection pools affect database CPU?**

Each new connection costs memory and CPU to create, authenticate, and tear down, and each active connection competes for CPU. If your app creates a new connection per request or sets `pool.max` to 100 per pod with 10 pods, you can have 1,000 connections hammering a database configured for 100. The database spends CPU context switching instead of running queries. You see `current_connections` near `max_connections` and many `idle` or `idle in transaction`. The fix is a bounded pool per app instance (often 10 to 20), a pooler like PgBouncer in transaction mode in front of Postgres, and timeouts like `statement_timeout` and `idle_in_transaction_session_timeout`. A small queue that makes requests wait briefly is much cheaper than a connection storm.

**Q: When is caching the right fix for high CPU?**

When the hot data is read-heavy, recomputed identically many times, and slightly stale is acceptable. If the top CPU consumer is `SELECT * FROM products WHERE id = $1` called thousands of times a minute for the same few ids, a 10 to 30 second Redis cache in front drops database calls by 90 percent with no schema change. Caching is the wrong fix when the query is wrong. Caching a full table scan just hides a missing index until the cache misses at peak and the thundering herd hits the database at once. Prefer to fix the query first, then cache the correct result with a short TTL and a cache stampede guard like singleflight or `SET NX`.

**Q: How do you ship the fix safely while the database is hot?**

You mitigate first, then fix in the smallest step. Mitigation might be a feature flag that disables a heavy sort, a short cache TTL on the hot endpoint, or a `statement_timeout` that stops new 10-second queries from starting. For the schema fix, you test `EXPLAIN` on a replica, create indexes with `CONCURRENTLY`, avoid `VACUUM FULL` at peak, and deploy the N+1 code fix behind a flag with a quick rollback. After deploy you watch three things together: CPU drops, p95 latency drops, and error rate stays flat. If any one does not move, your diagnosis was incomplete.

## 6. The Traps — What Goes Wrong in Production

The most common trap is scaling the database before reading the queries. Doubling the instance size feels decisive and looks like action on a status page, but if the root cause is a `Seq Scan` or N+1, the bigger box just lets the bad query run faster and more expensively. You then have higher cost and the same cliff at a slightly higher traffic level. Always read `pg_stat_statements` before you resize.

The next trap is adding an index without `CONCURRENTLY` during an incident. `CREATE INDEX` without it takes a strong lock that blocks writes. At 95 percent CPU with users already timing out, that lock turns a slowdown into a full outage. The concurrent build takes longer and uses more resources but does not block. Plan it, run it on a replica first if you can, and monitor `pg_stat_progress_create_index`.

Killing queries blindly is another way to make things worse. Canceling a random pid can abort a transaction that was about to commit, leave an application in a half-written state, or just cause the app to retry the same heavy query instantly. Only cancel after you have identified the blocker or the single expensive shape, and fix the retry logic so it backs off.

Running `EXPLAIN ANALYZE` on the production primary for a query that touches millions of rows is itself an incident. It executes the query for real, adds many seconds of CPU, and can hold locks. Do that work on a replica or with a sampled filter and `LIMIT`.

Treating CPU high as only a query problem misses the pool and vacuum. Teams tune queries for hours while 800 idle connections churn or a table with 4 million dead tuples keeps scanning garbage. Check `pg_stat_activity` counts, `pg_stat_user_tables` dead tuples, and cache hit ratio in the same pass as query plans. The root cause often sits in a different column than you first looked.

Caching as a first resort without fixing the query hides the problem until the cache goes cold. When that cache key expires or the Redis node fails, every request hits the database at once in a thundering herd. Fix the plan, then add a short TTL cache with jitter and a singleflight guard so only one request recomputes at a time.

Forgetting timeouts after the incident guarantees the next incident. Without `statement_timeout`, `lock_timeout`, and `idle_in_transaction_session_timeout`, one bad deploy can hold a transaction open for minutes and pin CPU again. Timeouts are not a performance fix. They are a blast radius control that keeps one bad code path from taking the whole database down.

## 7. Compare With Related Concepts

**High DB CPU vs slow query.** A slow query is one query that takes a long time. High CPU is many queries together saturating the processor. A single slow query shows up with high `mean_exec_time` and modest `calls`. High CPU often shows up with enormous `total_exec_time` across a few hot shapes. You can have high CPU with no single query over 500ms because 5,000 fast queries per second still saturate a core. Rule: fix the hottest total time first, not just the slowest mean.

**High DB CPU vs high DB memory or IO wait.** CPU high means the database is computing: scans, sorts, hashes, JSON parsing. Memory pressure shows as low cache hit ratio and high disk reads. IO wait shows as `IO:DataFileRead` wait events and high `iowait` CPU. They often travel together because a miss in cache forces more CPU to read disk, but the fix differs. For IO wait you look at working set size and disk throughput. For CPU you look at plans and indexes. Rule: check `wait_event_type` and cache hit ratio to know which bottleneck you actually have.

**High DB CPU vs connection exhaustion.** Connection exhaustion looks similar from the app — timeouts everywhere — but in the database CPU may not be high at all. Instead `pg_stat_activity` shows `max_connections` reached and new connections refused. High CPU with connections well below max is a query or vacuum issue. High connections with moderate CPU is a pool sizing issue. Rule: count connections before you tune queries.

**High DB CPU on primary vs replica lag.** If the hot work is on the primary, you see CPU high there and replica lag is a symptom of write amplification. If the hot work is big analytics on the primary, the fix may be moving reads to a replica or a separate analytics store, not tuning the primary bigger. Rule: put expensive read-only work on replicas and keep the primary for writes and the critical OLTP reads.

**Adding an index vs rewriting the query vs caching.** Add an index when the access pattern is selective and repeated and you can afford write cost. Rewrite the query when the logic prevents index use or fetches too much data. Cache when the data is hot, read-often, and tolerates seconds of staleness. Rule: correct the plan first, then reduce how often you run it.

**pg_stat_statements vs slow query log.** `pg_stat_statements` aggregates all queries with counts and total time, which is what you need for CPU attribution. The slow log samples only queries over a threshold and misses many fast but frequent shapes that together dominate CPU. Use the aggregated view for CPU, use the slow log for tail latency outliers.

## 8. 🧠 The Memory Hook

High database CPU is never the disease. It is the fever that tells you the database is doing too much work for the answer you asked for — scanning every shelf, making thirty trips, waiting for the same cutting board, or wading through trash. Read the ticket rail, not the thermometer: sort queries by total time, explain the hottest one, and ask what work you can remove, not what bigger box you can buy.
