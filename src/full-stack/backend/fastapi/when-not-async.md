# When Not To Use Async Routes

## Detailed explanation

Do not use async routes with blocking DB, file, or network libraries unless moved off the event loop. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Async plus blocking code hurts concurrency.

## 2. Problem it solves

It keeps FastAPI applications predictable by making contracts, shared logic, validation, or runtime behavior explicit instead of scattering framework code across handlers.

## 3. Core idea

- Use Python type hints as API contracts.
- Keep route handlers thin and delegate business logic to services.
- Use dependencies for shared request-time behavior.
- Return explicit response models and status codes.
- Test behavior through HTTP calls and dependency overrides.

## 4. Visual / analogy

```txt
Request -> dependency resolution -> validation -> endpoint -> service/database -> response model -> response
```

## 5. Minimal example

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str

@app.post("/items")
def create_item(item: Item):
    return {"data": item}
```

## 6. Real-world example

A production FastAPI service uses routers per domain, Pydantic schemas for input/output, dependencies for auth and DB sessions, exception handlers for consistent errors, and tests with dependency overrides.

## 7. Common interview questions

#### When should you NOT use async routes in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Don't use `async def` when the endpoint or any dependency performs blocking operations: synchronous database queries (SQLAlchemy sync session, psycopg2), synchronous HTTP calls (requests), synchronous file I/O (open(), pathlib.read_text()), or CPU-bound work (image processing, data transformations). Blocking code in async routes freezes the entire event loop, stalling all concurrent requests. Use `def` (sync) routes instead — FastAPI runs them in a threadpool, preventing event loop blocking.
- **The Unforgettable Mental Model:** The **Wrong Tool**. Using async routes with sync libraries is like using a race car (event loop) on a dirt road (blocking code). The race car is fast on the track (async I/O) but gets stuck in the mud (blocking calls). A truck (threadpool) handles the dirt road better.
- **The Trap**: Making every route async because "async is faster." Async is only faster for I/O-bound workloads with async libraries. For sync libraries, async is slower due to overhead and blocking risk.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I don't use async routes when the call chain includes any blocking code — sync DB drivers, requests library, file I/O, or CPU-bound work. Blocking code in async routes freezes the event loop for all concurrent requests. I use def routes for sync code — FastAPI runs them in a threadpool automatically."

#### What are common blocking operations that break async routes?
- **The Engine Mechanism (Why it behaves this way):** Common blockers: (1) **Sync database drivers** — psycopg2, pymysql, sqlite3, SQLAlchemy sync session. These block during query execution. (2) **Sync HTTP clients** — requests, urllib. These block during network I/O. (3) **Sync file I/O** — open(), os.path, shutil. These block during disk operations. (4) **CPU-bound work** — image processing (Pillow), data transformations (pandas), encryption. These block during computation. (5) **time.sleep()** — blocks the thread. Use asyncio.sleep() instead. Each of these blocks the event loop when called from an async route.
- **The Unforgettable Mental Model:** The **Traffic Jam**. Each blocking operation is a car that parks in the middle of the highway (event loop). One parked car stops all traffic. Multiple parked cars make it worse.
- **The Trap**: Assuming ORM queries are async. Most Python ORMs (SQLAlchemy sync, Django ORM) are synchronous. Even in an async route, `session.query().all()` blocks the event loop.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Common blockers include sync database drivers, the requests library, file I/O, CPU-bound work, and time.sleep(). I check every dependency in the call chain — if any is sync, I use a def route. The most common mistake is using sync ORM queries in async routes."

#### How do you use sync libraries in an async app?
- **The Engine Mechanism (Why it behaves this way):** Three approaches: (1) **Use def routes** — FastAPI runs them in a threadpool, the simplest approach. (2) **Use asyncio.to_thread()** — wrap sync calls: `result = await asyncio.to_thread(sync_function, args)`. This runs the sync code in a threadpool from within an async context. (3) **Use async alternatives** — replace sync libraries with async equivalents: asyncpg instead of psycopg2, httpx instead of requests, aiofiles instead of open(). The best approach depends on how much of the call chain is sync — if most is sync, use def routes; if most is async with a few sync calls, use to_thread().
- **The Unforgettable Mental Model:** The **Bridge**. When the async highway meets a sync road, you need a bridge. def routes are a full bridge (entire route in threadpool). to_thread() is a small footbridge (specific calls in threadpool). Async alternatives are building a new highway.
- **The Trap**: Using loop.run_in_executor() directly. asyncio.to_thread() is the modern, simpler API that handles the executor automatically.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I have three options: def routes for mostly sync code, asyncio.to_thread() for a few sync calls in an async context, or async library alternatives for full async. I choose based on how much of the call chain is sync. For SQLAlchemy sync sessions, I use def routes — it's the simplest and most reliable."

#### How do you detect blocking code in async routes?
- **The Engine Mechanism (Why it behaves this way):** Use profiling tools: (1) **asyncio debug mode** — set `PYTHONASYNCIODEBUG=1` to log slow callbacks, (2) **aiodebug** — detects event loop blocking, (3) **py-spy** — profiles running processes to identify blocking calls, (4) **Custom middleware** — measure request latency and log requests that exceed a threshold. In production, monitor event loop latency metrics — high latency indicates blocking code. Load testing with concurrent requests reveals blocking behavior — if throughput doesn't scale with concurrency, blocking code is likely the culprit.
- **The Unforgettable Mental Model:** The **Smoke Detector**. Blocking code is like smoke — you might not see it directly, but detectors (profiling tools) alert you when the air (event loop) gets thick.
- **The Trap**: Only testing with single requests. Blocking code doesn't show up with one request — it reveals itself under concurrent load. Always load test with multiple concurrent requests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I detect blocking code with asyncio debug mode, aiodebug, and py-spy profiling. In production, I monitor event loop latency metrics. Load testing with concurrent requests reveals blocking — if throughput doesn't scale with concurrency, blocking code is the culprit. I always test under load, not just single requests."

#### What is the performance impact of blocking async routes?
- **The Engine Mechanism (Why it behaves this way):** A single blocking call in an async route blocks ALL concurrent requests on that event loop. If a route takes 1 second for a blocking DB query, and 10 concurrent requests hit that route, the total time is 10 seconds (sequential) instead of ~1 second (concurrent). This is worse than sync routes — sync routes run in parallel threads, so 10 concurrent requests take ~1 second. Blocking async routes destroy the concurrency benefit and perform worse than sync.
- **The Unforgettable Mental Model:** The **Single Checkout Lane**. A store with 10 checkout lanes (sync threads) serves 10 customers in parallel. A store with one lane that claims to handle everyone (async) but stops to count coins (blocking) serves customers one at a time.
- **The Trap**: Assuming async is always better under load. Blocking async routes perform WORSE than sync routes under concurrent load because they serialize instead of parallelize.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Blocking async routes perform worse than sync routes under concurrent load. A 1-second blocking call with 10 concurrent requests takes 10 seconds sequentially instead of 1 second in parallel. Sync routes run in threads and parallelize naturally. Blocking async routes serialize — they destroy the concurrency benefit."

#### How do you migrate from sync to async routes?
- **The Engine Mechanism (Why it behaves this way):** Migration steps: (1) **Identify async-compatible libraries** — replace sync DB drivers with asyncpg, requests with httpx, file I/O with aiofiles, (2) **Update dependencies** — create async versions of dependency functions, (3) **Change route signatures** — def to async def, (4) **Test thoroughly** — verify behavior matches, load test for performance, (5) **Monitor** — watch event loop latency and throughput. Migrate incrementally — one endpoint at a time. Don't migrate everything at once. Keep sync routes for endpoints that still use sync libraries.
- **The Unforgettable Mental Model:** The **Road Resurfacing**. You don't close the entire highway (app) to resurface. You close one lane (endpoint) at a time, resurface it (migrate to async), and reopen it. Traffic flows through the other lanes.
- **The Trap**: Migrating all routes at once. This creates a large, risky change that's hard to debug. Migrate incrementally — one endpoint at a time.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I migrate incrementally — one endpoint at a time. First, replace sync libraries with async alternatives. Then update dependencies and route signatures. Test thoroughly and load test for performance. I keep sync routes for endpoints that still use sync libraries. Mixed sync and async routes work fine in the same app."

## 8. Active recall test

1. **When should you NOT use async routes?**
   - **Explanation:** When the endpoint or any dependency performs blocking operations — sync DB drivers, requests, file I/O, CPU-bound work, or time.sleep().

2. **What are common blocking operations in async routes?**
   - **Explanation:** Sync database drivers (psycopg2, SQLAlchemy sync), requests library, sync file I/O, CPU-bound work (image processing, pandas), and time.sleep().

3. **How do you use sync libraries in an async app?**
   - **Explanation:** Three options: def routes (simplest), asyncio.to_thread() for specific calls, or async library alternatives. Choose based on how much of the call chain is sync.

4. **How do you detect blocking code?**
   - **Explanation:** Use asyncio debug mode, aiodebug, py-spy profiling, and event loop latency monitoring. Load test with concurrent requests — if throughput doesn't scale, blocking code is likely.

5. **What's the performance impact of blocking async routes?**
   - **Explanation:** Worse than sync routes under concurrent load. Blocking serializes requests instead of parallelizing them. 10 concurrent 1-second requests take 10 seconds instead of 1.

6. **How do you migrate from sync to async?**
   - **Explanation:** Incrementally — one endpoint at a time. Replace sync libraries with async alternatives, update dependencies, change route signatures, test, and monitor.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

When Not To Use Async Routes should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain When Not To Use Async Routes, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define When Not To Use Async Routes.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
