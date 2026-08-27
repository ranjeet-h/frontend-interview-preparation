# API Is Slow in Production — How Will You Debug It

## 1. The Real-World Problem — When You Actually Hit This

It is Tuesday afternoon. Support is pinging you: "Customers say checkout is slow." You open your dashboard and p95 latency for `POST /api/orders` jumped from 180ms to 2.4 seconds. Not every request — p50 is still fine at 120ms. But the slowest 5% of users are waiting forever, some are hitting timeouts, and a few are double-clicking and creating duplicate orders. It worked perfectly on your laptop with 50 test orders. Production has 2 million orders, real network hops, a connection pool shared by 20 app instances, and a cache you assumed was warm.

You cannot just restart the servers or add more of them and hope. You need to prove where the time is actually going, fix that one bottleneck, and make sure it does not come back tomorrow. That is what this page is about — how to debug a slow API in production without guessing.

## 2. The Analogy — Make the Mechanic Obvious

Think of a single API request like a pizza delivery run.

The customer calls (the user taps "place order"). A driver leaves the store (your server receives the request). The driver has to: get through city traffic (network and CDN), wait at the kitchen window (your app code), ask the stockroom for ingredients (the database), and drive back.

If deliveries are suddenly late, you do not yell "buy more scooters." You check where drivers actually got stuck.

You give every driver a GPS tracker that logs how long they spent at each stop — that is distributed tracing. You put cameras at the intersections that count cars per minute and average wait time — that is metrics (p95, throughput, queue depth). You ask drivers to write a short note when something weird happens — "stockroom took 4 minutes, shelf was a mess" — that is structured logs with a request ID.

When you look at the tracker for a slow delivery, you see: traffic was fine, kitchen was fine, but the stockroom took 2.1 seconds. Now you zoom into the stockroom. Was the ingredient hard to find because nothing was labeled (missing index)? Did five drivers arrive at once but only one door was open (connection pool saturated)? Was one worker chopping a giant block of cheese and nobody could get past (event loop blocked)? Or was the freezer set to defrost and everything paused (GC pause)?

In production debugging, metrics tell you something is slow, traces tell you which stop is slow, logs and profiler details tell you why that stop is slow, and the database's own explain plan tells you exactly what the stockroom did. You always go in that order — evidence first, hypothesis second, fix last.

## 3. The Full Explanation — How It Actually Works

Start with what you measure before you touch any code. In production you have three sources of truth and you need all three.

Metrics tell you if the problem is real and how wide it is. Do not look at average latency. Averages hide the pain — if nine requests take 100ms and one takes 5 seconds, the average is still 590ms and looks okay. Percentiles tell the truth. p50 is the middle. p95 is what your slowest 5% of users feel. p99 is your worst 1%. When p95 spikes but p50 is flat, tail latency is your problem — a few requests are doing something expensive. Also check RED: rate (requests per second), errors, duration. And USE for resources: utilization of CPU, saturation of queues and pools, errors in logs. If throughput spiked at the same time, you may have a load problem. If error rate is flat, you have a slowness problem, not a failure problem.

Traces tell you where in the request life the time went. A distributed trace breaks one API call into spans: CDN -> load balancer -> app handler -> auth middleware -> business logic -> database query -> cache -> external payment call -> response serialization. A good APM tool like Datadog, New Relic, OpenTelemetry with Jaeger, or AWS X-Ray shows you this as a waterfall. The longest span is your hot path. If the database span is 1.8 seconds inside a 2.4 second request, you chase the database. If the trace shows 400ms gap between spans on the same instance where no child span is recorded, your app thread was blocked and could not even create a span — that points to event loop or CPU.

Logs fill the gap between those two. Metrics and traces show you which request was slow and where. Logs show you why, from the code's point of view. But logs are useless in production without a correlation ID. Every request that enters your system should get a unique `x-request-id`, and every log line produced while handling that request must carry it. Then you can go from a slow trace ID to the exact logs for that one request and see "cache miss, falling back to DB" or "slow query warning: 2100ms" or "connection pool: waited 450ms for free connection."

Once you know the hot path, you narrow by layer.

If the hot path is the database, your next tools are the database's own explain plan and its slow log. `EXPLAIN ANALYZE` in PostgreSQL (or `EXPLAIN ANALYZE` / `EXPLAIN FORMAT=TREE` in MySQL) does not guess — it actually runs the query and tells you how many rows it scanned, whether it used an index, and where it spent time. A query that was fast with 1,000 rows can become a sequential scan over 2 million rows in production. The slow query log (Postgres `log_min_duration_statement`, MySQL `slow_query_log`) surfaces the exact queries that cross your threshold without you hunting manually.

Two database traps live here: the N+1 and the pool. N+1 means your handler fetched a list of 100 orders and then for each order fired one more query to fetch the customer — 101 queries instead of one join or one batched fetch. It feels fine with 5 orders locally, it kills you with 100 in production, and APM will show 100 tiny database spans under one request. Connection pool saturation means the query itself is fast but requests queue waiting to borrow a connection. Your DB metrics will show active connections at max, wait queue growing, and app traces will show a big gap before the query span even starts.

If the hot path is the application itself, you reach for a CPU profile and a flame graph. A flame graph stacks function calls by how much time the CPU spent in them. A wide, flat plateau is the bottleneck. In Node.js specifically, check event loop lag. Node runs your JavaScript on one main thread. If you do something blocking — `JSON.parse` on a 20MB payload, a synchronous `crypto` call, regex backtracking, or a huge `for` loop — the loop cannot pick up the next request. The metric `eventLoopLag` (via `perf_hooks.monitorEventLoopDelay` or APM) will spike to hundreds of milliseconds. Garbage collection pauses are the other hidden cause. When your heap is large and you allocate a lot of short-lived objects, the garbage collector has to stop the world and clean up. You see this as periodic latency spikes with no obvious code span, high GC time in Node metrics, and often correlated with memory sawteeth.

If the hot path is network or cache, you check different signals. A CDN or Redis cache looks like a bimodal trace: cached requests are fast, misses are slow. Check cache hit ratio — if it dropped from 92% to 40% after a deploy, every request is hitting origin. Check `Cache-Control`, `ETag`, and `X-Cache` headers — a missing header or a deployment that changed the cache key can silently bust the cache. For network, look at time to first byte vs server processing time. If the load balancer reports request duration much larger than app duration, time is spent on the wire. DNS, TLS handshakes, and cold starts in serverless also show here.

The order matters. You never start with "add Redis" or "add an index." You start by reproducing the slowness in a way that matches production data shape. You collect metrics to confirm the tail, you find the hot path in a trace, you zoom into that layer with the right instrument — explain plan, profile, cache headers, pool stats — and only then do you change one thing, measure again, and guard it with an alert so it wakes you next time instead of a customer.

## 4. See It In Practice — Real Code or Queries

These are the checks you actually run. They look like production work because they are production work.

Pick the hot path from a trace. Imagine a waterfall where one request shows:

```
POST /api/orders  2,420ms total
  ├─ auth middleware          8ms
  ├─ handler logic           22ms
  ├─ db: SELECT * FROM orders WHERE user_id = ?  1,850ms   ← hot path
  ├─ cache get                3ms (miss)
  └─ response serialize       12ms
```

Every other slow request looks the same. That tells you to look at the database first, not the app.

Check whether the query used an index. In PostgreSQL:

```sql
-- Run this in psql against production replica or captured query
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders WHERE user_id = 'abc-123' AND status = 'pending';

-- Bad plan (what you see before the fix):
-- Seq Scan on orders  (cost=0.00..48210.00 rows=12 width=96) (actual time=12.5..1845.2 rows=8 loops=1)
--   Filter: (user_id = 'abc-123' AND status = 'pending')
--   Rows Removed by Filter: 1999988
--   Buffers: shared hit=102 read=18420
-- Planning Time: 0.8 ms
-- Execution Time: 1850.1 ms

-- Good plan after adding the index:
-- Index Scan using idx_orders_user_status on orders  (cost=0.42..24.1 rows=12 width=96) (actual time=0.3..1.8 rows=8 loops=1)
--   Index Cond: (user_id = 'abc-123' AND status = 'pending')
--   Buffers: shared hit=14
--   Execution Time: 2.1 ms
```

The fix is one migration, not a bigger server:

```sql
CREATE INDEX CONCURRENTLY idx_orders_user_status ON orders (user_id, status);
-- CONCURRENTLY avoids locking the table in production Postgres. On MySQL use ALGORITHM=INPLACE.
```

Find the slow queries without guessing by asking the database what it already saw:

```sql
-- Postgres: queries that crossed 500ms threshold (requires log_min_duration_statement = 500)
-- In practice you read this from your log aggregator, not by querying pg_stat.
-- pg_stat_statements gives you the aggregates:
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 5;

-- MySQL: enable slow log and then inspect
-- SET GLOBAL slow_query_log = ON;
-- SET GLOBAL long_query_time = 0.5;
```

Catch an N+1 before it catches you. This is what it looks like in Node with Prisma/Mongoose/SQL, and what the trace reveals:

```javascript
// Bad: one query for the list + one query per item — 1 + N queries
// Trace shows 101 tiny db spans under one request — classic N+1
app.get('/api/orders', async (req, res) => {
  const orders = await db.orders.findMany({ where: { userId: req.user.id } }); // 1 query
  const enriched = [];
  for (const order of orders) {
    // This runs inside the loop — every iteration is a new query
    const customer = await db.customers.findUnique({ where: { id: order.customerId } });
    enriched.push({ ...order, customer });
  }
  res.json(enriched);
});

// Good: one query with a join / include — the trace shows one wider db span
app.get('/api/orders', async (req, res) => {
  // Prisma include does a JOIN; raw SQL would use JOIN or WHERE id IN (...)
  const orders = await db.orders.findMany({
    where: { userId: req.user.id },
    include: { customer: true },
  });
  res.json(orders);
});

// Raw SQL alternative — single round trip
// SELECT o.*, c.name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.user_id = ?
```

Check if you are waiting for a connection instead of waiting for the query:

```javascript
// Expose pool stats on your /metrics or APM
// Example with pg (node-postgres) or generic pool
import { Pool } from 'pg';
const pool = new Pool({ max: 20, idleTimeoutMillis: 30000 });

// Log this every 10s or expose via Prometheus gauge
setInterval(() => {
  console.log({
    total: pool.totalCount,   // connections created
    idle: pool.idleCount,     // free right now
    waiting: pool.waitingCount, // requests queued waiting for a connection
  });
  // If waiting > 0 for sustained periods, your hot path is the pool, not the query.
  // Fixes: raise max within DB limit, shorten transaction hold time, move slow work out of transaction.
}, 10000);

// Also check from Postgres itself:
// SELECT count(*), state FROM pg_stat_activity GROUP BY state;
// If many rows are 'idle in transaction', code is holding connections too long.
```

Check if the bottleneck is the Node event loop or garbage collection:

```javascript
// Measure event loop lag properly (built-in since Node 16)
import { monitorEventLoopDelay } from 'node:perf_hooks';

const h = monitorEventLoopDelay({ resolution: 10 });
h.enable();

setInterval(() => {
  const p95LagMs = h.percentile(95) / 1e6; // nanoseconds to milliseconds
  const maxLagMs = h.max / 1e6;
  console.log({ p95LagMs, maxLagMs });
  h.reset();
  // If p95Lag is > 50ms and your API p95 is spiking at the same time,
  // the thread is blocked. Look for sync work, giant JSON, or heavy regex.
}, 5000);

// Common blocker you will find in a flame graph:
// const data = JSON.parse(hugePayload);          // blocks
// const html = renderHugeTemplate(orders);       // blocks
// Fix: stream, paginate, or move to worker thread
import { Worker } from 'node:worker_threads';
// Offload heavy CPU work so the main thread stays free to serve requests.
```

Check the cache before you blame the database:

```bash
# Hit the same endpoint and look at what the CDN/cache says
curl -i https://api.example.com/api/products?ids=1,2,3

# Look for:
# x-cache: HIT     ← response came from cache, fast
# x-cache: MISS    ← went to origin, slow
# cache-control: max-age=60, stale-while-revalidate=30

# If you use Redis:
# redis-cli INFO stats | grep -E "keyspace_hits|keyspace_misses"
# hit_ratio = hits / (hits + misses) — a drop from 0.90 to 0.40 explains a p95 spike.
```

Put it together in one runbook you can actually follow when the alert fires: confirm the spike in metrics, open a trace for a slow request and name the longest span, zoom into that layer with the instrument that matches (EXPLAIN ANALYZE for DB, flame graph plus eventLoopDelay for CPU, pool stats for connections, hit ratio and headers for cache, TTFB vs server time for network), fix one cause, re-measure p95, then add an alert on the thing that actually broke — slow query duration, pool wait time, or event loop lag — not just a generic "API slow" alert.

## 5. Interview Questions — All of Them, Done Properly

**Q: API is slow in production — walk me through how you would debug it step by step.**

Start with evidence, not guesses. First I confirm the problem in metrics — p50, p95, p99, throughput, error rate, and when the spike started, and whether it correlates with a deploy or traffic change. Then I open distributed traces for slow requests and find the longest span — that is the hot path. Every slow request sharing the same hot path points to one bottleneck. From there I zoom into that layer with the right instrument: if the database span is longest, I use `EXPLAIN ANALYZE` and the slow query log; if the app span has unexplained gaps, I take a CPU profile and check event loop lag and GC metrics; if cache hit ratio dropped, I check cache headers and key patterns; if TTFB is large but server time is small, I check network and CDN. I fix the one thing the evidence points to, re-measure p95 on that endpoint, and add an alert on the specific cause so it does not silently regress. I never start by scaling up or adding cache before I know what is slow.

**Q: How do you tell if the slowness is coming from the database, the application, or the network?**

I let the trace decide. If the database span is 70 to 90 percent of total request time, it is the database. If the trace shows large gaps where no child span exists on the same process, the app thread was blocked — that is application or CPU. If the load balancer or CDN reports request duration significantly larger than the application reports, time is on the network. I also cross-check with supporting metrics. Database slowness comes with high query latency in `pg_stat_statements` or slow logs, pool wait queues, or sequential scans in `EXPLAIN`. Application blocking comes with high event loop lag, high CPU, or GC pause metrics and a wide plateau in the flame graph. Network slowness shows in CDN cache MISS rate, DNS lookup time, or geographically correlated latency. No single metric is enough — the trace tells me where to look, and the layer-specific instrument confirms it.

**Q: Why do you look at p95 and p99 instead of average latency?**

Because averages hide what real users experience. An average is pulled toward the middle — a few very slow requests get smoothed out. If 95 requests take 100ms and 5 requests take 3 seconds, the average is about 245ms and looks acceptable, but 5 percent of your users are having a terrible experience. p95 means 95 percent of requests are faster than this number and 5 percent are slower — it tells you the tail. p99 tells you the very worst. In production the tail is usually where the bugs live: a query missing an index that is only slow for certain user IDs, cold cache misses that affect a few requests, or GC pauses that hit periodically. Interviewers want to hear that you alert on p95, not on averages.

**Q: How do you use EXPLAIN ANALYZE and the slow query log in practice?**

`EXPLAIN ANALYZE` actually executes the query and shows the real plan the database chose, with actual time per node, rows scanned, and buffer hits. I look for `Seq Scan` on a large table where I expected an `Index Scan`, a huge `Rows Removed by Filter`, or a nested loop that runs thousands of times. `BUFFERS` tells me if it read from disk vs memory. The slow query log is the passive counterpart — it continuously records every query that crosses a threshold like 500ms, so I do not have to guess which query to explain. In Postgres that is `log_min_duration_statement = 500` plus `pg_stat_statements` for aggregates by query shape; in MySQL it is `slow_query_log` with `long_query_time`. The workflow is: slow log surfaces the candidate query, `EXPLAIN ANALYZE` on a replica with production-like data explains why it is slow, and the fix is usually an index, a rewritten query, or pagination — verified by running `EXPLAIN ANALYZE` again.

**Q: What is an N+1 query and how do you detect it?**

N+1 happens when you fetch a list with one query and then for each item in the list you fetch something related with another query — for 100 orders you fire 101 queries. It is invisible with 5 rows on your laptop and devastating with 100 rows in production. In a trace it looks unmistakable: one handler span with dozens or hundreds of tiny identical database spans underneath it, each fetching one row by ID. You can also spot it in logs by a burst of identical query shapes with different IDs, or in `pg_stat_statements` by an unusually high call count for a point lookup. The fix is to fetch in bulk: a JOIN, a `WHERE id IN (...)`, or an ORM `include`/`eager load` that does one round trip. If you must keep separate calls, batch them with a DataLoader-style batcher so N individual requests become one batched request. After the fix the trace goes from N thin spans to one wide span and p95 drops immediately.

**Q: How do you detect event loop blocking and garbage collection pauses in Node.js?**

Node runs your JavaScript on a single main thread with an event loop. If that thread is occupied — parsing a huge JSON payload, running a heavy regex, or looping over a million items — no other request can make progress, even though CPU looks busy and no database query is slow. Two signals give this away. One is flame graph: a CPU profile shows a wide, flat tower of synchronous code at the top of the hot path happening inside the handler span. The other is `monitorEventLoopDelay` from `node:perf_hooks`, which histograms how late the loop is — if p95 lag is 80ms when your API p95 spikes, you found the correlation. For garbage collection, watch Node GC metrics — GC pause time, heap used vs heap limit, and memory sawteeth in your dashboard. When heap is large and pause time correlates with latency spikes, you are pausing to clean up. Fixes are different: for blocking, paginate payloads, stream instead of buffering, or move heavy work to a `worker_thread`; for GC, reduce allocations, reuse buffers, and avoid creating large throwaway objects per request.

**Q: You found the bottleneck and shipped a fix. How do you know the fix worked and that it will not come back?**

I re-measure the same signals that led me to the root cause, not just "does it feel faster." That means p95 for that one endpoint by route, not global p95; the same span that was hot now shorter in sampled traces; `EXPLAIN ANALYZE` showing an index scan with few buffer reads; pool `waitingCount` back to zero; cache hit ratio restored; event loop lag back under 20ms. I deploy the fix behind a flag or to a canary and compare metrics side by side before full rollout. Then I lock the gain: add an alert on the specific cause (slow query threshold, pool queue depth, cache hit ratio, event loop lag) with a realistic threshold, add a test that would have caught the regression (a perf-aware integration test with realistic data volume for N+1, a lint rule that flags `await` inside a loop), and record the finding in a short incident note so the next deploy that breaks the same assumption trips the alert before a user does.

## 6. The Traps — What Goes Wrong in Production

**Trap: Jumping to scale - "just add more servers or a bigger database" before profiling.**
Wrong assumption is that slow means overloaded. Why it is wrong is that many latency bugs are not throughput problems — a missing index makes one query scan 2 million rows regardless of how many app instances you have. What actually happens is you double your fleet and p95 barely moves because every instance still waits on the same slow query or the same connection pool limit on the database side. Fix is to profile first, then scale only if the evidence shows CPU or concurrency saturation with healthy per-request efficiency. Speak in an interview as "I measure first: if the trace shows one span dominating, scaling will not help — I fix the bottleneck first, then re-evaluate capacity."

**Trap: Tuning the average instead of the tail.**
Wrong assumption is that a decent average latency means users are fine. Why it is wrong is that averages collapse a distribution — a handful of very slow requests near timeouts disappear into the mean but dominate user complaints and retries. What actually happens is you celebrate a 300ms average while 5 percent of users still see 3 seconds, retry, create duplicate orders, and trigger cascading load. Fix is to alert and optimize on p95 and p99 per route, and to sample and trace slow requests specifically, not random ones.

**Trap: Adding a cache without fixing the thing the cache hides.**
Wrong assumption is that any slow query can be solved with Redis. Why it is wrong is that cache helps read-heavy, repeatable, low-churn data. What actually happens if you cache blindly is the origin still collapses on cache misses, cold starts after a deploy hammer the database, you add stale-data bugs because you never defined invalidation, and the N+1 is still there underneath the cache warming delay. Fix is to fix the query itself first, then add cache with an explicit policy — narrow key, accurate TTL, `stale-while-revalidate` for graceful misses, and warmup on deploy — and alert on hit ratio so a key change does not silently bust everything.

**Trap: Blaming the query when the pool is the bottleneck.**
Wrong assumption is that slow requests mean slow queries. Why it is wrong is that the query can be 5ms on the database while the application waits 400ms to borrow a connection from a saturated pool. What actually happens is you optimize SQL and see no improvement because `waitingCount` in your pool metrics is high and `pg_stat_activity` shows many sessions `idle in transaction` holding connections too long. Fix is to track pool queue depth, shorten how long you hold connections — keep transactions as tight as possible, do not do HTTP calls or heavy compute inside a DB transaction — and right-size `max` connections against the database limit instead of setting it arbitrarily.

**Trap: Testing the fix with tiny, local data and declaring victory.**
Wrong assumption is that if it is fast on localhost with 100 rows, it will be fast in production. Why it is wrong is that query plans, cache behavior, and pool contention all change with data volume and concurrency. What actually happens is you add an index that helps your 100-row table but the production plan still chooses a sequential scan due to skewed data, or your N+1 fix works for 10 items but still serializes fetches one by one instead of batching. Fix is to reproduce with production-like data shape — restore a sanitized dump to a staging replica or run `EXPLAIN ANALYZE` on the replica, and load test with realistic concurrency, not a single curl.

**Trap: Ignoring Node-specific causes because the database dashboard is green.**
Wrong assumption is that if database metrics look healthy, the problem must be downstream infrastructure. Why it is wrong is that a blocked event loop and GC pauses do not show up in database metrics at all — they show as gaps inside the application span and as elevated `eventLoopDelay` and GC pause time. What actually happens is you chase network and indexes while the flame graph shows 600ms in `JSON.parse` or a catastrophic regex on one endpoint. Fix is to instrument the runtime — `monitorEventLoopDelay`, GC timing, heap metrics, and a CPU profile on the slow endpoint — and treat the event loop as a layer to exclude just like you would the database or the network.

## 7. Compare With Related Concepts

**This vs "API works locally but fails in production."**
Both are "it worked on my machine" but they are different failures. "Works locally, fails in prod" is a correctness failure — wrong environment variable, missing CORS header, secret not mounted, database migration not run, path case sensitivity, firewall — the API returns a 500 or refuses to connect at all. "API is slow in production" is a performance failure — it returns the right data but too late. The first you debug with config, logs, health checks, and dependency differences between environments. The second you debug with percentiles, traces, profiles, and data-volume-aware query plans. Rule: if you get errors, diff environments and contracts; if you get latency, trace the hot path and measure.

**Slow API vs timed-out API.**
Slow is degraded latency where responses still return but violate your budget — p95 at 2 seconds instead of 300ms, users complain but data is correct. Timeout is a hard cut — the client or gateway gives up after N seconds, often causing retries and duplicate side effects. Slow is a warning that can become a timeout as tail latency creeps past the timeout setting. Rule: for slow, chase the bottleneck and re-establish an SLO for p95; for timeout, add timeouts and retries with jitter and idempotency at every layer so a slow request does not become a duplicate write.

**Slow API caused by database vs caused by application CPU.**
Both show elevated p95, but their signatures are opposites. Database slowness shows the database span dominating the trace, `EXPLAIN ANALYZE` revealing a scan or sort, and often high buffer reads or pool queuing. Application CPU slowness shows no single downstream span dominating, instead a long handler span with a flame graph plateau and elevated event loop lag, with database metrics healthy. Rule: if `EXPLAIN` is ugly, fix the query; if the flame graph is ugly, fix the code that blocks the thread.

**Caching as an optimization vs caching as a bandage.**
Sometimes caching is the right design — read-heavy reference data, repeated identical reads, content that tolerates slight staleness. Other times caching hides a problem you should solve directly — a query that lacks an index, a handler that does N+1. The test is whether a cold miss still meets your p95. Rule: make the cold path fast first, then add cache to make the hot path faster — never use cache to make a broken hot path merely less frequent.

## 8. 🧠 The Memory Hook — What Sticks

A slow API leaves a trail — metrics say something is wrong, traces say where, logs and profiles say why. If you skip straight to the fix, you are guessing in the dark with a flashlight pointed at yourself.
