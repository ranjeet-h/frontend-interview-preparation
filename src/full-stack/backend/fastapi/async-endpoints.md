# Async Endpoints

## Detailed explanation

Async endpoints use `async def` for non-blocking I/O with async libraries. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Use async when awaiting I/O.

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

#### When should you use async endpoints in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Use `async def` endpoints when the handler performs I/O-bound operations with async libraries: async database drivers (asyncpg, databases), async HTTP clients (httpx.AsyncClient), async file I/O (aiofiles), or async message queues. Async endpoints run on the event loop — while awaiting I/O, the event loop processes other requests, enabling high concurrency. If the endpoint only does CPU-bound work or calls sync libraries, use `def` (sync) — FastAPI runs sync endpoints in a threadpool automatically.
- **The Unforgettable Mental Model:** The **Juggling Chef**. An async chef (async endpoint) starts cooking, waits for the oven (I/O), switches to another dish, and comes back when the oven dings. A sync chef (sync endpoint) stands and waits for the oven — doing nothing else. But if the chef needs to chop vegetables (CPU work), they must focus — no juggling.
- **The Trap**: Making every endpoint async by default. If the endpoint calls sync libraries (most ORMs, requests), async provides zero benefit and can cause subtle bugs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use async def only when the endpoint and all its dependencies use async libraries — async DB drivers, httpx, aiofiles. If any part of the call chain is sync, I use def and let FastAPI run it in a threadpool. Making everything async with sync libraries gives no benefit and can block the event loop."

#### What happens if you block the event loop in an async endpoint?
- **The Engine Mechanism (Why it behaves this way):** If an async endpoint performs CPU-bound work or calls a blocking function (time.sleep, synchronous DB query, requests.get), it blocks the entire event loop. All other concurrent requests stall until the blocking code completes. This is because the event loop is single-threaded — it can only process one task at a time. Blocking code prevents the loop from switching to other tasks. The result is degraded performance for all requests, not just the blocking one.
- **The Unforgettable Mental Model:** The **Single-Lane Bridge**. The event loop is a bridge that only allows one car at a time. Async cars yield and let others pass while waiting. A blocking call is a car that parks in the middle — nothing else can cross until it moves.
- **The Trap**: Using time.sleep() in async code for testing. This blocks the event loop and can cause test timeouts. Use asyncio.sleep() instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Blocking the event loop in an async endpoint stalls all other concurrent requests. The event loop is single-threaded — blocking code prevents it from switching to other tasks. I use def for sync code so FastAPI runs it in a threadpool, and async def only when all dependencies are truly async."

#### How do you call sync code from an async endpoint?
- **The Engine Mechanism (Why it behaves this way):** Use `asyncio.to_thread()` (Python 3.9+) to run sync code in a threadpool: `result = await asyncio.to_thread(sync_function, arg1, arg2)`. Alternatively, use a sync endpoint (`def`) — FastAPI automatically runs it in a threadpool. For database operations with sync ORMs (SQLAlchemy sync session), use a sync endpoint or wrap the call in `to_thread()`. Don't call sync code directly in async endpoints — it blocks the event loop.
- **The Unforgettable Mental Model:** The **Delegation**. The async manager (async endpoint) delegates the manual labor (sync code) to a worker (threadpool) and continues managing other tasks. When the worker finishes, the manager gets the result.
- **The Trap**: Using `loop.run_in_executor()` directly instead of `asyncio.to_thread()`. `to_thread()` is the modern, simpler API. `run_in_executor()` requires managing an executor manually.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use asyncio.to_thread() to run sync code from async endpoints, or I use a sync endpoint (def) which FastAPI runs in a threadpool automatically. For sync ORM operations, I prefer sync endpoints — they're simpler and FastAPI handles the threadpool."

#### How do async endpoints affect testing?
- **The Engine Mechanism (Why it behaves this way):** TestClient handles async endpoints transparently — you don't need to await anything: `response = client.get("/async-items")`. TestClient runs the async event loop internally. For testing async behavior (concurrency, race conditions), use `httpx.AsyncClient` with `pytest-asyncio`: `@pytest.mark.asyncio; async def test_concurrent_requests(): async with httpx.AsyncClient(app=app) as client: results = await asyncio.gather(client.get("/items"), client.get("/items"))`. TestClient is sufficient for most tests; AsyncClient is needed for concurrency testing.
- **The Unforgettable Mental Model:** The **Dual-Purpose Tool**. TestClient is a Swiss Army knife — it handles both sync and async endpoints for standard tests. AsyncClient is a specialized tool — needed when you need to test async-specific behavior like concurrency.
- **The Trap**: Using TestClient for concurrency tests. TestClient is synchronous — it can't test concurrent requests. Use httpx.AsyncClient with pytest-asyncio for concurrency testing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: TestClient handles async endpoints transparently for standard tests. For concurrency testing, I use httpx.AsyncClient with pytest-asyncio. I test that concurrent requests don't block each other and that shared state is handled correctly."

#### How do you handle async dependencies?
- **The Engine Mechanism (Why it behaves this way):** Async dependencies are defined with `async def` and awaited by FastAPI: `async def get_async_db(): async with AsyncSessionLocal() as session: yield session`. FastAPI detects async dependencies and awaits them. Async dependencies can depend on other async or sync dependencies. The resolution order is the same as sync dependencies — topological order with caching. Async dependencies with yield run cleanup after the endpoint, just like sync yield dependencies.
- **The Unforgettable Mental Model:** The **Relay Race**. Each async dependency is a runner. The baton (request context) passes from runner to runner in order. Each runner does their part (setup), hands off (yield), and finishes (cleanup) after the race (endpoint).
- **The Trap**: Mixing async and sync dependencies incorrectly. An async dependency can depend on a sync dependency, but a sync dependency cannot await an async dependency. Design the dependency graph accordingly.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Async dependencies use async def with yield, just like sync dependencies. FastAPI detects and awaits them automatically. Async dependencies can depend on sync ones, but not vice versa. I keep the dependency graph clean — async at the top, sync at the bottom."

#### What are the performance implications of async endpoints?
- **The Engine Mechanism (Why it behaves this way):** Async endpoints improve throughput for I/O-bound workloads — a single process can handle thousands of concurrent connections. However, async adds overhead: coroutine creation, event loop scheduling, and context switching. For CPU-bound workloads, async is slower than sync because of this overhead. The sweet spot is I/O-bound APIs with async libraries — database queries, HTTP calls, file I/O. Benchmark your specific workload to determine if async provides a benefit.
- **The Unforgettable Mental Model:** The **Highway vs. the Race Track**. Async is a highway — great for many cars traveling at moderate speed (I/O-bound). Sync is a race track — fewer cars but each goes as fast as possible (CPU-bound). Using a highway for racing (CPU work) is slower.
- **The Trap**: Assuming async is always faster. For CPU-bound work, async is slower due to overhead. Benchmark your workload before choosing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Async improves throughput for I/O-bound workloads by handling many concurrent connections in a single process. But it adds overhead for CPU-bound work. I benchmark my specific workload — if it's I/O-bound with async libraries, async wins. If it's CPU-bound, sync is better."

## 8. Active recall test

1. **When should you use async endpoints?**
   - **Explanation:** When the endpoint and all dependencies use async libraries — async DB drivers, httpx, aiofiles. If any part is sync, use def instead.

2. **What happens if you block the event loop?**
   - **Explanation:** All other concurrent requests stall. The event loop is single-threaded — blocking code prevents it from switching to other tasks.

3. **How do you call sync code from an async endpoint?**
   - **Explanation:** Use asyncio.to_thread() to run sync code in a threadpool, or use a sync endpoint (def) which FastAPI runs in a threadpool automatically.

4. **How do you test async endpoints?**
   - **Explanation:** TestClient handles them transparently for standard tests. For concurrency testing, use httpx.AsyncClient with pytest-asyncio.

5. **How do async dependencies work?**
   - **Explanation:** Defined with async def and yield. FastAPI detects and awaits them. Async deps can depend on sync deps, but not vice versa.

6. **Is async always faster than sync?**
   - **Explanation:** No. Async improves throughput for I/O-bound workloads but adds overhead for CPU-bound work. Benchmark your specific workload.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Async Endpoints should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Async Endpoints, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Async Endpoints.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
