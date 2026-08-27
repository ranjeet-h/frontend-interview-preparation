# One endpoint randomly times out. How will you debug it

## 1. The Real-World Problem — When You Actually Hit This

It is Tuesday afternoon. Your app has been running fine for months. Then support pings you: "Some users say checkout is stuck." You check the dashboard. Every endpoint is green except `GET /api/orders?userId=...`. Its p99 latency just jumped from 180ms to 28 seconds, and 3% of calls return 504 Gateway Timeout. Not all calls — just random ones. You try it yourself and it works. You try again and it hangs for 30 seconds then dies. Staging is fine. Logs show nothing obvious because most requests succeed.

This is the worst kind of bug. It is not broken, it is randomly slow. And "randomly times out" almost never means random. It means something only happens under real production conditions — a lock that only appears when two users touch the same row, a downstream service that only slows down at peak traffic, a garbage collection pause that only happens when memory is full, or a load balancer that kills connections after 30 seconds while your app still thinks it is working. If you guess and just bump the timeout from 30s to 60s, you will hide the problem and make it worse.

The senior move is to treat a timeout like a crime scene. You do not guess. You narrow down where time is being spent, with evidence, until only one layer is left.

## 2. The Analogy — Make the Mechanic Obvious

Think of the request like ordering food at a busy restaurant.

You (the browser) tell the waiter (the network and load balancer) what you want. The waiter walks to the kitchen (your server), the kitchen asks the pantry (database) for ingredients and sometimes calls a supplier (downstream service) for a special item. The chef (the Node.js event loop) can only cook one dish at a time on the main stove, even though waiters can take many orders.

A timeout is when you have waited so long you leave the restaurant. But why did you wait?

- Maybe you never got a table because the front door was jammed — that is a client or network timeout. You gave up before the kitchen even started.
- Maybe the waiter was stuck at the bar and never delivered your order — that is a load balancer or proxy idle timeout. The connection was killed in the middle.
- Maybe the kitchen started your dish but the pantry locked the fridge because someone else was counting inventory — that is a database row lock or connection pool wait.
- Maybe the supplier's truck was late — that is a downstream service being slow.
- Maybe the chef stopped to deep-clean the entire stove for two minutes and no dishes moved — that is event loop blocking or a GC pause. Every order stalls, not just yours.
- Maybe the kitchen kept re-cooking your dish because the first attempt burned — that is retries creating a storm.

Each cause looks the same to you — "my food never came" — but the fix is completely different. You cannot fix it until you know which station is holding the ticket. That is what tracing, correlation IDs, and timing breakdowns do: they put a timestamp on every station so you see exactly where the order sat the longest.

## 3. The Full Explanation — How It Actually Works

A timeout is not an error that happens at one point. It is the end result of time running out while the request was waiting somewhere. Your job is to find where.

**Start by deciding where the timeout is observed**

The first question is not why it timed out, but who timed out first. Every hop has its own clock.

The client (browser or mobile app) might have a 10 second fetch timeout. The load balancer (NGINX, ALB, Cloudflare) might kill idle connections after 30 seconds. The Node server might have a 30 second `server.timeout`. The database driver might wait 5 seconds for a connection from the pool. The downstream HTTP call might have a 3 second timeout. The first clock to expire decides what the user sees.

If the client logs show `AbortError` after exactly 10 seconds but server logs show the request finishing in 12 seconds, the client gave up first — the server was still working. If the load balancer returns 504 after exactly 30 seconds but your server logs show the handler took 34 seconds with no error, the load balancer killed it. If the server logs show `DBTimeoutError: timed out acquiring connection after 5000ms`, the database pool is exhausted. You find this by lining up timestamps from all three places with the same request ID.

That is why the first thing you add, if it is not there already, is a correlation ID. It is a single unique ID generated at the edge (or by the client) and passed in a header like `x-request-id` through every layer — load balancer, API server, database query comment, downstream call, and log line. Without it you are comparing random log lines. With it you can filter all logs and traces for one timed-out request and see its full timeline.

**The systematic debug order**

Do not jump to a hypothesis. Go in order from wide to narrow.

First, confirm the blast radius. Is it one endpoint or many? One region or all? One user or random? What changed recently — a deploy, a migration, a new downstream? Check your metrics, not just logs: p50, p95, p99 latency for that endpoint, error rate, CPU and memory for the servers, database active connections, and downstream latency. Random timeouts that affect only one endpoint usually point to that endpoint's specific dependency — its query or its downstream call. Timeouts that affect many endpoints at the same time point to shared infrastructure — event loop, GC, database primary, or load balancer.

Second, get a trace. If you have distributed tracing (OpenTelemetry, Datadog APM, Jaeger), pull a trace for a timed-out request. A trace breaks the 30 seconds into spans: 2ms in middleware, 28 seconds in `db.query`, 15ms in JSON serialization. Without tracing, add temporary high-resolution timing logs: log at entry, before and after each await, and at exit, all with the correlation ID and elapsed milliseconds. What you are looking for is the single span where time disappears.

Third, test each layer with evidence.

**If the trace shows most time in the database:** you are likely looking at a lock, a slow query, or pool exhaustion. A row lock happens when two requests try to update the same row. One holds the lock, the other waits until `lock_timeout` or the statement timeout fires. It looks random because it only happens when two users collide. Check `pg_stat_activity` (Postgres) or `SHOW PROCESSLIST` (MySQL) during the incident. Look for `wait_event_type = Lock` and long-running transactions that forgot to commit. A slow query from a missing index looks random when the table just crossed a size threshold — it was fast with 10k rows, now it scans 2M. Check `EXPLAIN ANALYZE` for sequential scans. Pool exhaustion looks like every query is slow, but the time is actually spent waiting to get a connection. Check pool metrics: waiting count, checkout time, and active versus idle connections. A common cause is a transaction that holds a connection while making a downstream HTTP call.

**If the trace shows most time in a downstream call:** your service is waiting on another service. Pull that service's traces with the same correlation ID. Check if the downstream's p99 also spiked. Add a tight timeout and a circuit breaker around that call so one slow dependency does not hold your handler for 30 seconds. Log the downstream latency separately. If you retry that downstream call on timeout without a limit, you can turn one slow call into three and triple the load — that is a retry storm.

**If the trace shows time spread across everything or gaps with no span at all:** the Node.js event loop might be blocked or the process is paused. Node runs your JavaScript on one main thread. If a handler does `JSON.parse` on a 20MB payload, runs a heavy regex, or loops over a huge array synchronously, that code blocks the loop. While it runs, no other request can make progress — timers do not fire, downstream responses sit in the queue, and everything times out together. You detect this with event loop lag metrics (like `perf_hooks.monitorEventLoopDelay`) and CPU profiles. A GC pause looks similar: the whole process freezes while V8 cleans up memory. It correlates with heap spikes and long GC pause metrics. If you see periodic 500ms to 2 second freezes across all endpoints, suspect blocking code or memory pressure.

**If the timing does not add up — the server thinks it finished in 200ms but the client saw a 30 second timeout:** the time was lost in the network or load balancer. Check LB idle timeout settings. An ALB default of 30 seconds will return 504 if your server takes 31 seconds, even though the server eventually finishes and logs success. Check keep-alive and connection reuse — a misconfigured NGINX `proxy_read_timeout` or a closed keep-alive connection can look random. Compare `curl -w "%{time_total}"` from inside the VPC versus from the public internet. If it is only slow from outside, the edge is the problem.

**What you do after you find it**

Fix the layer you found, not the symptom. Add an index, fix the transaction scope, increase the pool size only if you have headroom, move heavy work off the event loop, fix the N+1 query, add a timeout and fallback for the downstream, or adjust the LB timeout to be slightly longer than the server timeout so the server always logs first. Then add the guardrail so it does not come back: an alert on p99 or p95 (not just average), a slow query log with a threshold, a dashboard for pool wait time and event loop lag, and a log line that always includes correlation ID, endpoint, user ID, elapsed time, and which dependency was slow.

## 4. See It In Practice — Real Code or Queries

These are the pieces you actually wire up in a Node.js/Express service to make random timeouts debuggable instead of mysterious.

**Correlation ID from edge to logs**

This middleware makes sure every request has an ID and every log line carries it. It also passes the ID downstream.

```js
// middleware/requestContext.js
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const requestStore = new AsyncLocalStorage();

export function requestContext(req, res, next) {
  // Use the ID from the LB/client if present, otherwise create one
  const requestId = req.headers['x-request-id'] || randomUUID();

  // Echo it back so the frontend can include it in bug reports
  res.setHeader('x-request-id', requestId);

  // Make it available to any code in this request without passing it manually
  requestStore.run({ requestId, startTime: Date.now() }, () => next());
}

// logger.js — structured JSON logger that always includes the request ID
import pino from 'pino';

export const logger = pino({
  level: 'info',
  formatters: {
    // Automatically add requestId from the async context to every log line
    log(obj) {
      const ctx = requestStore.getStore();
      if (ctx?.requestId) obj.requestId = ctx.requestId;
      return obj;
    },
  },
});
```

Use it early in your Express app, before any other middleware:

```js
import express from 'express';
import { requestContext } from './middleware/requestContext.js';
import { logger } from './logger.js';

const app = express();
app.use(requestContext);

// Log entry and exit with elapsed time — this is your poor man's trace
app.use((req, res, next) => {
  const start = Date.now();
  logger.info({ method: req.method, url: req.url }, 'request started');

  res.on('finish', () => {
    const elapsed = Date.now() - start;
    logger.info(
      { statusCode: res.statusCode, elapsedMs: elapsed },
      'request finished'
    );
    // Alert on slow requests even if they eventually succeed
    if (elapsed > 2000) {
      logger.warn({ elapsedMs: elapsed, url: req.url }, 'slow request');
    }
  });
  next();
});
```

Now when a user reports a timeout, you ask for the `x-request-id` from their response header (or find it by timestamp and userId) and filter logs to that one ID across all services.

**Timing each await so the slow span is obvious**

When you do not yet have full tracing, wrap the suspicious handler with explicit timing:

```js
// handlers/orders.js
import { logger } from '../logger.js';

export async function getOrders(req, res) {
  const t0 = Date.now();
  const lap = (label) => logger.info({ elapsedMs: Date.now() - t0, label }, 'lap');

  lap('handler start');

  // Pass requestId downstream so the next service can log it too
  const headers = { 'x-request-id': req.headers['x-request-id'] };

  lap('before db query');
  // Add a statement timeout so a slow query fails fast instead of hanging 30s
  const orders = await db.query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.query.userId]
  );
  lap('after db query');

  lap('before downstream call');
  // Tight timeout + no blind retry on the downstream call
  const profile = await fetchWithTimeout(
    `https://user-service.internal/profiles/${req.query.userId}`,
    { headers, timeoutMs: 2000 }
  );
  lap('after downstream call');

  lap('before serialize');
  res.json({ orders, profile });
  lap('handler end');
}

async function fetchWithTimeout(url, { headers, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`downstream ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
```

If the trace for a timed-out request shows 26 seconds between `before db query` and `after db query`, you know it is the database. If it shows 0ms gaps but total elapsed is 30 seconds, suspect event loop blocking or GC — the laps themselves were delayed.

**Database: fail fast and find the lock**

Add a statement timeout so a bad query does not hang the whole handler. In Postgres:

```sql
-- Set a per-request timeout so one slow query cannot hold the handler 30s
SET statement_timeout = '3s';

-- During the incident, look for what is actually waiting
SELECT pid, usename, query, state, wait_event_type, wait_event, now() - query_start AS age
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY age DESC;

-- Find the blocking lock
SELECT blocked.pid AS blocked_pid, blocked.query AS blocked_query,
       blocking.pid AS blocking_pid, blocking.query AS blocking_query
FROM pg_catalog.pg_locks bl
JOIN pg_stat_activity blocked ON blocked.pid = bl.pid
JOIN pg_stat_activity blocking ON blocking.pid = ANY(pg_blocking_pids(bl.pid))
WHERE NOT bl.granted;
```

Fixes depend on what you find. A missing index on `orders(user_id, created_at)` would cause a sequential scan that only becomes painful at 2M rows — adding the index drops the query from seconds to milliseconds. A transaction that held a row lock while calling an external API would be fixed by moving the API call outside the transaction. A pool that is too small would show high `pool.waitCount` — you fix it by releasing connections promptly and not holding them during network calls, and only then consider increasing pool size.

**Detecting event loop blocking and GC pauses**

```js
// observability/eventLoop.js
import { monitorEventLoopDelay } from 'node:perf_hooks';

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();

setInterval(() => {
  const lagMs = h.mean / 1e6; // mean delay in ms
  const p99Ms = h.percentile(99) / 1e6;
  if (p99Ms > 100) {
    logger.warn({ lagMs, p99Ms }, 'event loop lag high — possible blocking code');
  }
  h.reset();
}, 10000);

// Also track GC pauses if available (requires --expose-gc or perf_hooks)
import { PerformanceObserver } from 'node:perf_hooks';
const obs = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 200) {
      logger.warn({ kind: entry.kind, durationMs: entry.duration }, 'long GC pause');
    }
  }
});
obs.observe({ entryTypes: ['gc'] });
```

If this fires at the same time as your timeouts, look for synchronous heavy work in that endpoint's code path — large `JSON.parse`, unbounded loops, or regex on user input — and move it to a worker thread or paginate the data.

**Load balancer timeout alignment**

Make the timeouts form a clear hierarchy so you always know who killed the request. A good rule is client > LB > server > downstream, each slightly longer than the one before.

```txt
Client fetch timeout:   35s  (gives LB time to return a proper 504)
LB idle timeout:        30s  (ALB / NGINX proxy_read_timeout)
Node server timeout:    25s  (server.timeout = 25000)
Downstream call timeout: 3s  (fetch with AbortController)
DB statement timeout:    3s  (SET statement_timeout)
```

If the LB timeout is shorter than the server timeout, the LB will log the 504 and the server will log success — that mismatch is the clue.

## 5. Interview Questions — All of Them, Done Properly

**Q: One endpoint randomly times out. How do you debug it?**

Start with blast radius and evidence, not guesses. Check if it is one endpoint or many, whether it correlates with a deploy, and what p99 latency and error rate look like. Then trace a single failed request end-to-end. The goal is to break the 30 seconds into spans so you see where time went — middleware, database, downstream service, or a gap that suggests the event loop was blocked. Once you know the slow span, you dig into that layer: locks and slow queries for the database, latency and retries for downstream, event loop lag and GC for the runtime, or LB timeout settings for the network. Fix that layer, then add an alert and a dashboard so you will know next time before users do.

**Q: How do you distinguish a client timeout, a server timeout, and a network/load balancer timeout?**

Look at who logged the timeout and at what elapsed time. If the browser shows `AbortError` after exactly 10 seconds and the server logs show the request completing in 12 seconds, the client gave up first. If an ALB or NGINX returns 504 after exactly 30 seconds and your server logs eventually show `200 in 34000ms` with no error, the LB killed the idle connection. If the server log itself shows `TimeoutError` or `statement timeout` at 5 seconds, the server or database killed it. The easiest way to tell is to line up the same `x-request-id` across client, LB access logs, and server logs and compare their elapsed times and status codes. A fixed, exact timeout duration (always 30.0s, always 5.0s) is a strong hint about which configured timeout fired.

**Q: What is a correlation ID and why does it matter for timeouts?**

A correlation ID is a unique ID like `x-request-id` that you generate at the edge and pass through every hop — client, load balancer, API server, database query comment, downstream HTTP header, and every log line. For timeouts it is essential because you are otherwise comparing unrelated log lines and guessing which ones belong to the same failed request. With a correlation ID you can filter all systems for one timed-out request and reconstruct its timeline. Without it, tail latency bugs are nearly impossible to reproduce because you cannot isolate the one slow request out of thousands.

**Q: How can a database cause a random timeout?**

Three common ways. First, row-level locks: two requests update the same order or inventory row, one holds the lock, the other waits until the lock timeout. It only happens when two users collide, so it looks random. Second, a slow query from a missing index: `WHERE user_id = ?` without an index is fast at 1k rows and painful at 2M rows, so it only becomes a timeout after the table grows. Third, connection pool exhaustion: if all pool connections are checked out and held — for example inside a transaction that is waiting on a downstream API — new requests wait in a queue for a connection until the pool timeout fires. You distinguish them with `pg_stat_activity` wait events, `EXPLAIN ANALYZE`, and pool wait-time metrics.

**Q: How can a downstream service cause your endpoint to time out?**

If your handler awaits a call to another service and that service is slow, your handler is slow. The timeout you see is actually the downstream's latency bubbling up. Pull the downstream's traces with the same correlation ID — if its p99 also spiked, that is the root cause. The fix is to put a tight timeout on that call (like 2 to 3 seconds), fail fast with a fallback or a clear error, and avoid retrying blindly. Unlimited retries make it worse: one slow downstream call becomes three sequential slow calls, or many instances retry at once and overload the already slow service.

**Q: How does event loop blocking cause timeouts in Node.js?**

Node.js runs your JavaScript on a single main thread. Most I/O is non-blocking, but any synchronous CPU work — parsing a huge JSON body, running a complex regex, stringifying a massive object, or looping over a large array — blocks that thread. While it is blocked, no other request can progress: incoming requests queue up, timers do not fire, and responses from the database or downstream services sit waiting to be processed. The result is that many endpoints time out together for a few seconds, then recover. You detect it with event loop lag metrics (`monitorEventLoopDelay`) and CPU profiles. The fix is to make the work smaller (paginate, stream), move it to a `worker_threads` worker, or run it in a separate service.

**Q: What is a GC pause and how do you know it is the cause?**

Garbage collection is when V8 pauses your JavaScript to reclaim memory from objects you no longer need. Usually this is milliseconds, but if your heap is large or you allocate many short-lived objects per request, a pause can be hundreds of milliseconds or even seconds. During a pause, every request stalls — similar to event loop blocking. You suspect GC when timeouts are brief, affect many endpoints at once, and correlate with heap size spikes and `perf_hooks` GC duration metrics. The fixes are to reduce allocation churn, avoid holding large objects in memory, stream large payloads instead of buffering them, and ensure you have enough memory so GC does not run under pressure.

**Q: What role does the load balancer timeout play, and what mistakes do teams make with retries?**

Load balancers have an idle timeout — for example ALB defaults to 30 seconds, NGINX `proxy_read_timeout` defaults to 60 seconds. If your server takes longer than that to respond, the LB returns 504 to the client and closes the connection, but your server may keep running and eventually log success. Teams often misread this as a server bug. The rule is to keep LB timeout slightly longer than the server timeout so the server always has a chance to return its own error. With retries, the trap is retrying every failed request immediately. If the downstream is already overloaded, retries amplify the load and cause a cascade. Use bounded retries with jitter, idempotency keys for non-idempotent requests, and a circuit breaker that stops calling a failing downstream and returns a fast fallback instead.

## 6. The Traps — What Goes Wrong in Production

**Guessing and bumping the timeout.** The most common reaction is to increase the timeout from 30 to 60 seconds and hope it goes away. This hides the symptom, increases tail latency for users, and makes recovery harder because slow requests now hold connections and pool slots twice as long. The right fix is to find the slow span and make it fast or fail fast with a clear error.

**Not having a correlation ID.** Without it you are reading random log lines and cannot reconstruct a single request's journey. You will waste hours comparing timestamps. Generate the ID at the edge, forward it on every hop, attach it to every log line, and return it in the response header so bug reports include it. This is cheap and pays for itself on the first incident.

**Logging averages instead of tails.** Average latency can look fine while p95 and p99 are terrible. If you only alert on average or on error rate, random timeouts slip through because only 2% of users hit the slow path. Always dashboard and alert on p95 and p99 for each endpoint separately, not just globally.

**Looking only at application logs.** App logs show what your code did, but not what the database, downstream, or LB did. During a timeout, also check slow query logs, `pg_stat_activity` or `SHOW PROCESSLIST`, downstream latency dashboards, event loop lag, GC pause metrics, and LB access logs (which show the LB's view of elapsed time and status code). The answer is usually in the layer you did not check.

**Holding a database connection while waiting on the network.** Opening a transaction, then making an HTTP call to another service before committing, holds a pool connection hostage. Under load the pool drains and new requests queue for a connection until they time out. Keep transactions short and do network calls outside them. Return connections to the pool as quickly as possible.

**Treating all timeouts as the same error.** Teams often catch every timeout with a generic "try again" and add automatic retries on the frontend. Retries on non-idempotent endpoints like `POST /orders` can create duplicate orders. Retries without backoff can create a thundering herd that finishes off a recovering service. Retry only idempotent reads or writes protected by an idempotency key, add exponential backoff with jitter, and cap total attempts.

**Ignoring the event loop because "Node is async."** Async I/O does not make CPU work async. A single `JSON.parse(hugeBody)` or a runaway regex can stall the entire server for seconds. If your p99 spikes correlate with large payloads or specific user inputs, profile the handler and move heavy work off the main thread.

## 7. Compare With Related Concepts

**Timeout versus slow response.** These feel the same to a user but they are different signals. A slow response still returns — the request completed, just late. You can measure its latency, see it in traces, and optimize it. A timeout means someone gave up and killed the connection — the client, the LB, or the server itself decided not to wait. You get a 504 or an `AbortError` instead of data, and the server may still be doing work nobody will receive. A useful rule is: slow is a performance problem to optimize, timeout is a broken promise to debug with tracing and timeout hierarchy. If you see slow responses getting slower over weeks, expect timeouts next. Fix the slowness before the clock runs out.

**Timeout versus 500 internal error.** A 500 means the server tried and failed quickly — an unhandled exception, a validation crash, a bad deploy. It shows up immediately and is usually easy to find in error logs. A timeout means the server tried and took too long — the logic might be correct but a dependency was slow or locked. It shows up late, often with no error log because the server never threw. A good mental split is: 500 asks what code is wrong, timeout asks where time went.

**Random tail timeout versus consistent timeout.** If every request to an endpoint times out, the cause is usually obvious and deterministic — a bad deploy, a wrong URL, a missing table. If only 1 to 5 percent of requests time out, the cause is usually contention — locks, pool queuing, downstream tail latency, or GC — that only appears under load or when two requests collide. Random tail timeouts are harder and require percentiles, correlation IDs, and tracing to catch. Consistent timeouts are found with a single repro; tail timeouts require sampling many requests.

**Client-side retry versus server-side retry versus no retry.** Retrying on the client can improve perceived reliability for idempotent reads but can also amplify load if every client retries at once. Retrying inside the server (for a downstream call) is invisible to the client but can quietly triple latency. The rule is: retry only when the operation is idempotent or guarded by an idempotency key, bound the number of attempts, add jitter so retries do not all fire together, and use a circuit breaker to stop calling a downstream that is clearly down.

## 8. 🧠 The Memory Hook

A timeout is not a cause, it is an alarm clock going off. Someone's clock ran out while your request was waiting in line. Find which line it was stuck in — the database, the downstream, the event loop, or the load balancer — and that line is the bug.
