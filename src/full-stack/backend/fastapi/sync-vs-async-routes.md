# Sync vs Async Routes

## Detailed explanation

Sync routes run blocking code in a threadpool; async routes run in the event loop and must not block. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Async is for non-blocking I/O; sync is fine for blocking libraries.

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

#### What is the difference between sync and async routes in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Sync routes (`def`) are executed in a threadpool — FastAPI creates a pool of worker threads and assigns each sync request to a thread. Async routes (`async def`) are executed on the event loop — a single thread that switches between tasks during I/O waits. Sync routes are safe for blocking code (sync DB drivers, file I/O, requests). Async routes enable high concurrency for I/O-bound work but block the entire loop if any code is blocking. FastAPI automatically chooses the execution model based on the function type.
- **The Unforgettable Mental Model:** The **Two Lanes**. Sync lane (threadpool) has multiple lanes (threads) — each car (request) gets its own lane. Async lane (event loop) has one lane but cars yield to each other at rest stops (I/O waits). Sync is better for heavy trucks (CPU work); async is better for many small cars (I/O work).
- **The Trap**: Mixing sync calls in async routes. A single sync call in an async route blocks the entire event loop, degrading performance for all concurrent requests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Sync routes run in a threadpool — safe for blocking code. Async routes run on the event loop — high concurrency for I/O but blocks if any code is blocking. I use sync routes when calling sync libraries (most ORMs) and async routes when all dependencies are async."

#### How does FastAPI handle sync routes internally?
- **The Engine Mechanism (Why it behaves this way):** When you define a `def` endpoint, FastAPI wraps it and submits it to a threadpool (via `anyio.to_thread.run_sync` or `starlette.concurrency.run_in_threadpool`). The default threadpool size is 40 threads (configurable via `anyio`). Each sync request occupies a thread until completion. If all threads are busy, new requests queue until a thread is free. This prevents sync code from blocking the event loop — the event loop remains free to process async requests while sync requests run in threads.
- **The Unforgettable Mental Model:** The **Call Center**. Each sync request is a phone call assigned to an available agent (thread). If all agents are busy, calls queue. The receptionist (event loop) stays free to handle other tasks.
- **The Trap**: Assuming unlimited threadpool capacity. The default is 40 threads — if you have 40 long-running sync requests, new requests queue. Monitor threadpool usage in production.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI runs sync routes in a threadpool (default 40 threads). Each sync request occupies a thread until completion. If all threads are busy, new requests queue. This keeps the event loop free for async requests. I monitor threadpool usage and adjust the size based on workload."

#### How do you choose between sync and async routes?
- **The Engine Mechanism (Why it behaves this way):** Decision tree: (1) Does the endpoint call sync libraries (SQLAlchemy sync session, requests, file I/O)? → Use `def`. (2) Does it call async libraries (asyncpg, httpx, aiofiles)? → Use `async def`. (3) Does it do CPU-bound work? → Use `def` (or offload to a task queue). (4) Does it mix sync and async? → Use `def` and wrap async calls with `asyncio.run()`, or refactor to use all async. The key rule: the entire call chain must be async for `async def` to provide benefits.
- **The Unforgettable Mental Model:** The **Chain Rule**. A chain is only as strong as its weakest link. An async route is only as async as its most sync dependency. One sync call breaks the async chain.
- **The Trap**: Choosing async because it sounds "modern" or "faster." If the call chain has sync libraries, async provides zero benefit and adds complexity.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I choose based on the call chain. If all dependencies are async — async DB driver, httpx, aiofiles — I use async def. If any dependency is sync — most ORMs, requests — I use def. The entire chain must be async for async to provide benefits."

#### What happens when you mix sync and async in the same app?
- **The Engine Mechanism (Why it behaves this way):** FastAPI handles mixed sync and async routes seamlessly. Sync routes run in the threadpool; async routes run on the event loop. They can coexist in the same app without issues. However, shared resources (database connections, caches) must be thread-safe if accessed from both sync and async routes. For database sessions, use separate session factories — sync Session for sync routes, AsyncSession for async routes. Don't share session instances between sync and async contexts.
- **The Unforgettable Mental Model:** The **Bilingual Office**. Some employees speak English (sync), some speak Spanish (async). They work in the same office (app) but use different communication channels (threadpool vs. event loop). Shared resources (filing cabinets) need rules for both languages.
- **The Trap**: Sharing database sessions between sync and async routes. Sync Session and AsyncSession are not interchangeable. Use the right session type for each route.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI handles mixed sync and async routes seamlessly. But shared resources must be thread-safe. I use separate session factories — Session for sync routes, AsyncSession for async routes. I never share session instances between sync and async contexts."

#### How do sync and async routes affect deployment?
- **The Engine Mechanism (Why it behaves this way):** Both sync and async routes run on the same ASGI server (Uvicorn). The server's worker processes handle both types. For sync-heavy apps, you may need more workers or a larger threadpool to handle concurrent requests. For async-heavy apps, fewer workers can handle more concurrent requests. Monitor both threadpool usage (sync) and event loop latency (async) in production. The deployment configuration (workers, threadpool size) should match the route type distribution.
- **The Unforgettable Mental Model:** The **Restaurant Staffing**. A restaurant with mostly dine-in (sync) needs more waiters (threads). A restaurant with mostly takeout (async) needs fewer waiters but a faster kitchen (event loop). Staffing depends on the service mix.
- **The Trap**: Using the same deployment config for sync-heavy and async-heavy apps. Sync-heavy apps need more threads; async-heavy apps need fewer workers but a fast event loop.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Deployment config should match the route type distribution. Sync-heavy apps need more workers or larger threadpools. Async-heavy apps need fewer workers but a fast event loop (uvloop). I monitor both threadpool usage and event loop latency to tune the configuration."

#### How do you benchmark sync vs async performance?
- **The Engine Mechanism (Why it behaves this way):** Use load testing tools (locust, k6, wrk) to simulate concurrent requests and measure throughput (requests/second) and latency (p50, p95, p99). Test with realistic workloads — database queries, external API calls, file I/O. Compare sync and async versions of the same endpoint. For I/O-bound workloads, async typically achieves higher throughput with lower latency under concurrency. For CPU-bound workloads, sync may be faster due to lower overhead. Always benchmark with production-like data and infrastructure.
- **The Unforgettable Mental Model:** The **Wind Tunnel**. Instead of guessing which car design is more aerodynamic, you test both in a wind tunnel (load test) with real conditions (production-like workload).
- **The Trap**: Benchmarking with "Hello World" endpoints. Real-world performance depends on database queries, external API calls, and business logic. Benchmark with realistic workloads.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use load testing tools like locust or k6 to benchmark sync vs async with realistic workloads — database queries, external API calls, file I/O. I measure throughput and latency percentiles. For I/O-bound workloads, async typically wins. For CPU-bound, sync may be faster. I always benchmark with production-like data."

## 8. Active recall test

1. **What's the difference between sync and async routes?**
   - **Explanation:** Sync routes run in a threadpool (safe for blocking code). Async routes run on the event loop (high concurrency for I/O but blocks if any code is blocking).

2. **How does FastAPI handle sync routes?**
   - **Explanation:** Wraps them and submits to a threadpool (default 40 threads). Each sync request occupies a thread until completion. Keeps the event loop free.

3. **How do you choose between sync and async?**
   - **Explanation:** Based on the call chain. If all dependencies are async → async def. If any dependency is sync → def. The entire chain must be async for async to benefit.

4. **Can you mix sync and async routes in the same app?**
   - **Explanation:** Yes. FastAPI handles both seamlessly. But shared resources must be thread-safe. Use separate session factories for sync and async routes.

5. **How do sync vs async routes affect deployment?**
   - **Explanation:** Sync-heavy apps need more workers/threadpool. Async-heavy apps need fewer workers but a fast event loop. Monitor both to tune configuration.

6. **How do you benchmark sync vs async performance?**
   - **Explanation:** Use load testing tools (locust, k6) with realistic workloads. Measure throughput and latency percentiles. Don't benchmark with Hello World endpoints.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Sync vs Async Routes should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Sync vs Async Routes, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Sync vs Async Routes.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
