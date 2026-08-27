# FastAPI Server Workers Are Blocked — How Will You Debug It

## 1. The Real-World Problem — When You Actually Hit This

It is Tuesday at 10:14 AM. Your FastAPI service has been running fine for three months. Then Slack lights up: "Checkout is hanging." You check Grafana. P95 latency was 80 ms all morning. Now it is 8 seconds. P99 is 30 seconds. Some requests time out completely. The health check endpoint `/health` is timing out too, so the load balancer starts marking instances unhealthy and pulling them out. Users see a spinner that never stops, hit refresh, and make it worse.

You SSH into a pod. CPU is 15% — almost idle. Memory is flat. No recent deploy. No DB CPU spike. You try a `curl` to a simple `GET /products/1` and it takes 12 seconds. Then you notice the scary pattern: when you send one request at a time locally it is fast, but as soon as 30 concurrent requests hit one Uvicorn worker, everything freezes together. It feels like the server can still hear you, but nobody inside is answering.

That exact shape — low CPU, high latency, all endpoints slow at the same time, gets worse with concurrency, recovers briefly after restart then blocks again — is the classic FastAPI worker blocked problem. It is almost always one of two things: something inside an `async def` endpoint is doing a blocking sync call and freezing the single event loop thread, or all 40 threads in the threadpool are busy waiting on a slow sync call and the 41st request has nowhere to go. In an interview, they want to hear how you prove which one it is with data, not guesses, and how you fix it without creating a new outage.

## 2. The Analogy — Make the Mechanic Obvious

Think of a FastAPI worker process as a small airport with one air traffic controller and a ground crew of 40.

The air traffic controller is the event loop. She never lands planes herself. She talks on the radio, gives clearances, and moves to the next plane while a plane is in the air. A plane taking off or landing is like network I/O — waiting for the database or an external API. The controller says "cleared to land, call me when you touch down" (`await`), and immediately handles the next 500 planes. One controller can safely coordinate thousands of flights because most of a flight is waiting in the air.

The ground crew of 40 is the threadpool. When a plane needs manual baggage loading that the controller cannot do over the radio (a synchronous blocking library like `requests`, `psycopg2`, old `boto3`, `time.sleep`, or a big `pandas` CSV parse), the controller does not leave the tower. She writes a slip and hands it to the ground crew. A crew member walks over, does the heavy work, and brings the result back. While that crew member is busy, the controller stays in the tower handling radios.

Now two failures map exactly to real code:

Failure 1 — The controller leaves the tower. An engineer writes `async def` but puts a synchronous blocking call inside it, like `requests.get()` or `time.sleep(5)`. That is the controller climbing down from the tower to push a plane herself. While she is on the runway, no radio calls get answered. Every plane in the sky, even ones on other runways, circles and waits. One slow endpoint freezes every endpoint on that worker, including `/health`.

Failure 2 — The ground crew is all busy. An engineer writes correct `def` endpoints, but the downstream database is slow or a third-party API takes 4 seconds, and 50 concurrent users arrive at once. All 40 crew members are occupied pushing planes. The 41st plane lands and has no crew to meet it, so it sits on the taxiway. The controller is still talking, but latency spikes because requests are queued waiting for a free thread. CPU is still idle because everyone is just waiting.

If you understand which person is stuck — the controller or the crew — you know exactly where to look and what to fix.

## 3. The Full Explanation — How It Actually Works

FastAPI sits on Starlette, which sits on ASGI, which runs inside Uvicorn. Uvicorn runs one event loop per worker process, usually powered by `uvloop` in C. That loop is a single OS thread that spins forever: check for incoming bytes, run ready callbacks, sleep until the OS says a socket is readable.

FastAPI makes a routing decision based on the keyword you used when you defined the handler.

When you write `async def`, FastAPI runs it directly on the event loop thread. It assumes everything inside will be non-blocking and will say `await` when it needs to wait. When Python hits `await client.get()` using an async driver, Python registers the socket with the kernel's `epoll` or `kqueue`, parks the coroutine, and returns control to the loop. The loop then runs other requests. When the kernel says bytes arrived, the loop resumes that exact coroutine after the `await`.

When you write plain `def`, FastAPI assumes you might block. It does not run your function on the loop. It calls `anyio.to_thread.run_sync(your_function)` and hands it to a shared `ThreadPoolExecutor`. The default size is 40 threads per process. The event loop stays free while that thread sleeps on a socket or on disk. When the thread finishes, the result is passed back to the loop and sent as the HTTP response.

This split is why debugging starts by asking: are we blocking the loop, or are we exhausting the pool?

A blocking call inside `async def` is catastrophic. `time.sleep(2)`, `requests.get()`, `psycopg2` queries, `open().read()` on a large file, or `boto3` calls all hold the loop thread. While that thread is held, the loop does not tick. Timers do not fire, `epoll_wait` does not get called, and coroutines for other users never resume. If 10 requests hit that endpoint at once and each blocks for 2 seconds, the worker freezes for 20 seconds serialized on the loop. Latency graphs show a flat line that jumps on all routes at the same instant, while CPU stays low because the work is waiting, not computing.

Threadpool exhaustion looks different. The loop itself is healthy. `async def` routes are still fast. But every `def` route that uses the threadpool queues. The 40 threads are each waiting on a slow dependency — often a database without `asyncpg`, or a downstream service that slowed from 100 ms to 3 seconds. The 41st `def` request waits in an in-memory queue until a thread frees. You see high latency only on `def` routes, request queue depth climbing, and normal CPU. Raising the pool to 200 feels tempting but just opens 200 DB connections and kills Postgres, or burns 200 x 8 MB of thread stack memory.

The fix layer depends on the root cause. If the call chain can be fully async — `httpx.AsyncClient` instead of `requests`, `asyncpg` with SQLAlchemy `AsyncEngine` instead of `psycopg2`, `redis.asyncio` instead of `redis` sync, `aiofiles` for files — keep `async def` and `await` every hop. If any library in the chain is sync and you cannot replace it today, either keep the handler as plain `def` so FastAPI offloads it automatically, or keep the handler as `async def` and wrap just that one blocking call with `await asyncio.to_thread(blocking_fn)` or `await anyio.to_thread.run_sync(blocking_fn)` or Starlette's `run_in_threadpool`. That parks the blocking work on a pool thread and keeps the loop free.

For debugging, you need evidence from four places. Metrics tell you the shape. Logs tell you which route is slow. Traces tell you which downstream call inside that route is slow. And an event loop lag or threadpool depth gauge tells you whether the loop or the pool is saturated. Without those signals you are guessing.

Good production instrumentation to add before you need it: a middleware that logs method, path, status, and wall time for every request and flags anything over 1 second; Prometheus histograms for `http_request_duration_seconds` with route labels, plus gauges for `threadpool_queue_depth` and `threadpool_active_threads`, plus a simple event loop lag metric that periodically does `await asyncio.sleep(0.01)` and measures how late it actually woke up — 15 ms late means the loop is blocked. Database pool metrics like `pool_wait_time` and downstream timeout counters tell you if the threads are blocked on the DB.

The safe debugging order in production is: confirm symptoms with metrics not hunches, reduce blast radius (scale out one extra replica or shed load), isolate the blocking route or dependency with logs and traces, ship the smallest fix that unblocks the loop or frees threads, then harden with timeouts, async drivers, and alerts so it cannot silently return.

## 4. See It In Practice — Real Code or Queries

These examples are real Python you can run. The first shows the two broken patterns and their fixes. The second shows how to see the problem with instrumentation.

**Example 1 — The two ways workers get blocked and the minimal fix for each**

```python
from fastapi import FastAPI
import time
import asyncio
import anyio.to_thread
import httpx
import requests
from starlette.concurrency import run_in_threadpool

app = FastAPI()

# --- BROKEN 1: Sync blocking call inside async def freezes the event loop ---
# Every concurrent user stalls for 2 seconds, including /health on this worker.
@app.get("/broken-loop")
async def broken_loop():
    time.sleep(2)  # blocks the single event loop thread
    resp = requests.get("https://api.example.com/data", timeout=5)  # also blocking
    return resp.json()

# --- FIXED 1A: Keep async def, use fully async drivers ---
@app.get("/fixed-loop-async")
async def fixed_loop_async():
    await asyncio.sleep(2)  # yields back to the loop, other requests keep running
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get("https://api.example.com/data")
    return resp.json()

# --- FIXED 1B: Keep async def, but offload a single unavoidable sync call ---
def legacy_sync_call(user_id: int) -> dict:
    # suppose this is a legacy SDK with no async version
    time.sleep(0.2)
    return {"user_id": user_id, "legacy": True}

@app.get("/fixed-loop-offload")
async def fixed_loop_offload(user_id: int):
    # Moves the blocking work to the threadpool, loop stays free.
    # This is the run_in_threadpool pattern interviewers want to hear.
    result = await asyncio.to_thread(legacy_sync_call, user_id)
    # Equivalent alternatives:
    # result = await anyio.to_thread.run_sync(legacy_sync_call, user_id)
    # result = await run_in_threadpool(legacy_sync_call, user_id)
    return result

# --- BROKEN 2: Many def routes pile up when downstream is slow ---
# With 40 pool threads and a 3-second downstream, 50 concurrent hits queue.
@app.get("/broken-pool")
def broken_pool(user_id: int):
    # This runs on the threadpool, which is correct for sync code.
    # But if the downstream is slow, all 40 threads end up waiting.
    return requests.get(f"https://slow.internal/users/{user_id}", timeout=6).json()

# --- FIXED 2: Add timeout, use async properly, or increase capacity consciously ---
@app.get("/fixed-pool-timeout")
async def fixed_pool_timeout(user_id: int):
    # If you can go async, this avoids pool queuing entirely.
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(2.0, connect=0.5)) as client:
            resp = await client.get(f"https://slow.internal/users/{user_id}")
            return resp.json()
    except httpx.TimeoutException:
        # Fail fast so threads do not stay occupied for 6 seconds
        from fastapi import HTTPException
        raise HTTPException(status_code=504, detail="Upstream timeout")
```

Key point: never write `asyncio.run()` inside a FastAPI handler to call async code from a `def` route — it creates a new loop inside a pool thread and will error with "event loop already running" or deadlock. Pick one side: if the dependency is async, the route should be `async def`.

**Example 2 — Instrumentation that proves whether the loop or the pool is blocked**

```python
import time
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
import logging

logger = logging.getLogger("app.slowlog")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start a background task that measures event loop lag
    # If the loop is blocked, this sleep wakes up late.
    async def loop_lag_monitor():
        while True:
            start = time.perf_counter()
            await asyncio.sleep(0.1)
            lag_ms = (time.perf_counter() - start - 0.1) * 1000
            if lag_ms > 30:  # 30ms late means something blocked the loop
                logger.warning(f"event_loop_lag_ms={lag_ms:.1f} loop_is_blocked=true")

    task = asyncio.create_task(loop_lag_monitor())
    yield
    task.cancel()

app = FastAPI(lifespan=lifespan)

@app.middleware("http")
async def slow_request_logger(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    # Log every request so you can grep for the slow route
    logger.info(
        f"{request.method} {request.url.path} "
        f"status={response.status_code} elapsed_ms={elapsed_ms:.0f}"
    )
    if elapsed_ms > 1000:
        logger.warning(f"SLOW route={request.url.path} elapsed_ms={elapsed_ms:.0f}")
    # Optional: expose to Prometheus histogram here
    # REQUEST_DURATION.labels(route=request.url.path, method=request.method).observe(elapsed_ms / 1000)
    return response

# A cheap endpoint to test threadpool queue vs loop freeze
@app.get("/debug/ping")
async def debug_ping():
    # If this fast endpoint is also slow, the loop is blocked.
    # If this is fast but def routes are slow, the pool is exhausted.
    return {"pong": True}
```

How to use this during an incident: hit `GET /debug/ping` under load. If ping is slow too, you blocked the loop — look for `time.sleep` or `requests` inside `async def`. If ping is fast but `def` routes are slow, you exhausted the pool — look at DB pool wait time and downstream latency. Check `anyio.to_thread.current_default_thread_limiter().borrowed_tokens` or your Prometheus gauge to see active threads sitting at 40.

**Example 3 — Adjusting the pool deliberately, not blindly**

```python
import anyio.to_thread

# At startup, if your workload is legitimately sync-heavy and DB can handle it:
limiter = anyio.to_thread.current_default_thread_limiter()
limiter.total_tokens = 100  # default is 40; raising burns more memory and DB connections

# Better for many services: run more Uvicorn worker processes instead of huge threadpools
# gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker
# or: uvicorn main:app --workers 4
# And keep DB pool per worker small so total connections stays bounded.
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Users report every endpoint is slow at the same time, but CPU is low. How do you start debugging?**

You do not guess. You open Grafana and confirm the shape. Low CPU plus high latency on all routes at once means waiting, not computing. Check `http_request_duration_seconds` P95/P99 by route. If every route jumped together on one worker at the same time, that is loop blocking or an upstream shared dependency. Curl `GET /debug/ping` — a trivial async endpoint with no I/O. If even ping is slow, the event loop is blocked. If ping is fast and only `def` routes are slow, the threadpool is full. Then open traces: find the span where wall time is spent. Check logs for slow-request warnings with elapsed time, and check DB and downstream latency dashboards. The goal in the first five minutes is to narrow to loop vs pool vs downstream, with numbers.

**Q: How does FastAPI decide whether to run a handler on the event loop or on the threadpool?**

FastAPI checks the function signature at startup. If you defined the handler with `async def`, it schedules the coroutine directly on the main `asyncio` event loop. It assumes every `await` will yield properly. If you defined it with plain `def`, it wraps the call with `anyio.to_thread.run_sync` and runs it on the shared `ThreadPoolExecutor`. The same rule applies to dependencies: a `def` dependency inside an `async def` route is also offloaded, and an `async def` dependency inside a `def` route is awaited on the loop before your sync handler runs. So the keyword you pick is not style — it is a routing instruction.

**Q: What exactly happens when someone calls `time.sleep(2)` or `requests.get()` inside an `async def` endpoint?**

The single thread driving the event loop stops executing Python. `time.sleep` asks the OS to pause the thread; `requests.get` blocks on a socket read. While that thread is paused, the loop cannot iterate. It cannot process new TCP accepts, cannot fire timers, cannot resume any coroutine waiting with `await`. Every other request assigned to that worker, even a 1 ms `/health` check, sits frozen until the sleep or socket returns. Under concurrency this serializes: 20 concurrent hits each sleeping 2 seconds can stall the worker for 40 seconds of wall time even though the CPU was idle.

**Q: How do you fix a blocking call when you cannot replace the library with an async one?**

You keep the event loop free by moving just that call to the threadpool. Inside an `async def` route, wrap it: `result = await asyncio.to_thread(sync_function, arg)` or `await anyio.to_thread.run_sync(sync_function, arg)` or `await run_in_threadpool(sync_function, arg)` from Starlette. All three do the same thing — run the function on a pool thread and return a coroutine the loop can await. Alternatively, change the whole handler to plain `def` so FastAPI does the offloading automatically. Do not call `asyncio.run()` inside a handler; it tries to create a nested event loop and will crash or deadlock.

**Q: When should you actually use `async def` versus `def`?**

Follow the dependency chain. If every I/O call in the handler and its dependencies has a real non-blocking async driver — `httpx.AsyncClient`, `asyncpg` or `aiomysql`, `motor` for Mongo, `redis.asyncio` — use `async def` and `await` every call. You will handle thousands of concurrent connections with tiny memory. If any call in the chain is sync-only — `requests`, `psycopg2`, `pymongo` sync, `boto3`, `pandas`, or plain `open().read()` on large files — use `def` so FastAPI routes it to the pool, or use `asyncio.to_thread` for that one call. For pure CPU work like hashing or image transforms, async gives no speedup; use `def` for small work or push heavy jobs to a background queue like Celery or ARQ and run them in a separate process.

**Q: What metrics and alerts prove workers are blocked versus a slow database?**

Blocking and DB slowness look similar to users but different on dashboards. For loop blocking, alert on event loop lag over 50 ms, `http_request_duration` spiking on all routes together including trivial ping, and throughput dropping while CPU stays flat. For threadpool exhaustion, monitor `threadpool_active_threads` sitting at 40, `threadpool_queue_depth` growing, and latency spiking only on `def` routes while `async` ping stays fast. For slow DB, you will see `db_pool_wait_time` high, `db_query_duration` P99 up, DB CPU or cache hit ratio moving, and traces showing most time inside the `pg.query` span. Your runbook should capture all four so you do not fix the wrong layer.

**Q: A candidate says "just increase the threadpool to 200 and add more Uvicorn workers." What is wrong with that?**

Both can help but both have a hard ceiling. Each pool thread costs about 8 MB of virtual stack plus Python object overhead, so 200 threads is 1.6 GB just for stacks. More importantly, each thread often holds a DB connection; 4 workers times 100 threads times 10 connections can open 4,000 connections and crash Postgres, which defaults to around 100. More workers also multiply connection pools and memory per worker. The right answer is to fix the blocking source first — swap to an async driver or set a tight timeout and fail fast — then size pools based on downstream capacity and DB `max_connections`, and scale horizontally with more small pods rather than one giant pool.

## 6. The Traps — What Goes Wrong in Production

**Trap 1 — Declaring everything `async def` because "async is always faster."**

It feels modern, so teams mark every handler async. Then someone leaves one `requests.get()` or `time.sleep()` inside. Locally with one user it passes. Under load the whole worker freezes and the health check fails, so the orchestrator restarts the pod, which immediately freezes again when traffic returns. The fix is not to make everything async; it is to make the choice match the driver. If the driver is sync, use `def` or `asyncio.to_thread`.

**Trap 2 — Calling `asyncio.run()` or creating a new event loop inside a handler.**

When a `def` handler needs an async library, an engineer writes `asyncio.run(fetch())`. Inside FastAPI the loop is already running on the main thread, and `asyncio.run` tries to start a second one on a pool thread, raising `RuntimeError: asyncio.run() cannot be called from a running event loop` or deadlocking. Use `await` from an `async def` handler, or if you are already in `def`, keep everything sync in that scope.

**Trap 3 — Raising the threadpool or DB pool until the database falls over.**

Seeing queue depth hit 40, the instinct is to raise `total_tokens` to 200. Latency improves for an hour, then Postgres starts rejecting connections with `too many connections` or `remaining connection slots are reserved`. Now you have two outages. Backpressure is a feature, not a bug. Set aggressive timeouts (for example 2 seconds for downstream calls), return 504 quickly, and keep pool sizes derived from `max_connections / worker_count`.

**Trap 4 — Restarting without fixing the blocked call, so the freeze comes back instantly.**

A restart drops all queued requests and looks like a fix for five minutes. Then 30 users hit the same slow endpoint, threads fill again, or the loop blocks again. Without a code fix, restarts just add churn and lost traces. Always capture which route was slow from logs, keep a flamegraph or `py-spy` profile if available, and patch the route before scaling.

**Trap 5 — Forgetting that plain file I/O is blocking.**

`open("big.csv").read()` or `json.load(open("data.json"))` looks cheap but on a cold disk or a network mount it blocks for hundreds of milliseconds. Inside `async def` that is enough to create visible jitter. Use `aiofiles` or `await run_in_threadpool(lambda: open(...).read())` for anything larger than a few kilobytes, or keep that handler as `def`.

**Trap 6 — Swallowing cancellation when a client disconnects.**

When a user closes the tab, Uvicorn cancels the coroutine with `asyncio.CancelledError`. If code catches `except Exception` and logs without re-raising `CancelledError`, the server keeps working on a response nobody will read, holding a thread or DB connection for seconds longer than needed. Always let `CancelledError` propagate, or catch it explicitly and roll back.

## 7. Compare With Related Concepts

**Sync `def` versus async `async def` in FastAPI**

The difference is execution site, not speed by itself. `async def` runs on the single event loop thread and scales to tens of thousands of concurrent I/O waits with almost no memory per connection, but any single blocking call freezes all of them. `def` runs on a threadpool of 40 threads, so one blocking call only blocks one thread, but you can only handle about 40 concurrent blocking requests per worker before queuing. Rule: if every driver in the chain is truly async, use `async def`; if any driver is sync, use `def` or wrap that one call with `asyncio.to_thread`.

**Event loop blocking versus threadpool exhaustion**

Both show high latency and low CPU, but the blast radius differs. Loop blocking makes every route slow at the same instant — even a zero-I/O ping — because the one thread that drives everything is paused. Threadpool exhaustion makes only `def` routes slow while `async` ping stays fast, because the loop is still ticking but `def` requests wait for a free thread. Rule: check ping latency first; ping slow equals loop, ping fast plus `def` slow equals pool.

**Threadpool exhaustion versus DB connection pool exhaustion**

Threadpool waits are for a free OS thread; DB pool waits are for a free database connection. A full threadpool shows `threadpool_queue_depth` high and DB `pool_wait_time` normal, while a full DB pool shows the reverse — threads are waiting inside `await pool.acquire()` or `get_db()`. They can cascade: waiting threads hold DB connections longer, which fills the DB pool faster. Rule: watch both gauges side by side; fixing only one often just moves the queue to the other.

**Blocking I/O versus CPU-bound work**

Blocking I/O waits for a socket or disk and should be offloaded to a thread because threads are good at waiting. CPU-bound work like large JSON parsing, Pillow image resize, or ML inference actually burns CPU cycles. Threads share one GIL in CPython so many Python threads still fight for one core. Rule: use thread offload for waiting; use background workers or a `ProcessPoolExecutor` for heavy computation.

## 8. 🧠 The Memory Hook

**One controller in the tower, forty crew on the ground.** If the controller climbs down to push a plane, the whole airport stops — keep `async def` truly non-blocking. If the crew is all busy, planes queue on the taxiway — give blocking work a short timeout, a real async driver, or more planes in the sky, not just more crew.
