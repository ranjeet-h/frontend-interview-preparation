# Why FastAPI Is Fast

## Detailed explanation

FastAPI is fast because it is built on Starlette for ASGI networking and Pydantic for efficient validation and serialization. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

FastAPI combines async ASGI foundations with typed validation.

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

#### Why is FastAPI fast compared to other Python frameworks?
- **The Engine Mechanism (Why it behaves this way):** FastAPI's speed comes from three layers: (1) **Starlette** provides an ASGI foundation that handles concurrent connections without thread-per-request overhead, (2) **Pydantic** uses Rust-based `pydantic-core` for validation and serialization, which is significantly faster than pure Python validation, and (3) **async/await** allows a single Python process to handle thousands of concurrent I/O-bound requests by yielding control during network/database waits instead of blocking threads. Benchmarks show FastAPI competing with Node.js and Go for I/O-bound workloads.
- **The Unforgettable Mental Model:** The **Formula 1 Pit Crew**. Traditional frameworks are like a single mechanic changing all four tires sequentially. FastAPI is a full pit crew — Starlette coordinates the team (ASGI concurrency), Pydantic-core is the pneumatic wrench (Rust-speed validation), and async is the driver who keeps the engine running while tires change (non-blocking I/O).
- **The Trap:** Assuming FastAPI is fast for CPU-bound tasks. The async advantage only applies to I/O-bound workloads. Heavy computation still blocks the event loop and degrades all concurrent requests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI is fast because it combines three performance layers: Starlette's ASGI foundation for concurrent connection handling, Pydantic's Rust-based core for fast validation and serialization, and async/await for non-blocking I/O. For I/O-bound APIs, this means a single process can handle thousands of concurrent requests without thread overhead."

#### What role does Starlette play in FastAPI's performance?
- **The Engine Mechanism (Why it behaves this way):** Starlette is a lightweight ASGI framework that provides the networking layer FastAPI builds on. It handles HTTP request parsing, routing, middleware chains, WebSocket connections, and background tasks — all asynchronously. Unlike WSGI frameworks that spawn a thread per request, Starlette uses a single-threaded event loop with `asyncio`, allowing it to handle many concurrent connections with minimal memory overhead. FastAPI inherits all of Starlette's routing and middleware performance.
- **The Unforgettable Mental Model:** The **Highway System**. Starlette is the road infrastructure — lanes (connections), on-ramps (routing), toll booths (middleware), and traffic lights (event loop). FastAPI is the car that drives on it. A good highway lets many cars travel simultaneously without collisions.
- **The Trap:** Thinking Starlette is just a routing library. It's a full ASGI toolkit with middleware, WebSockets, background tasks, and request/response objects — FastAPI adds type-driven validation and dependency injection on top.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Starlette provides FastAPI's ASGI networking foundation — routing, middleware, request/response handling, and WebSocket support — all built on asyncio's event loop. This means FastAPI inherits Starlette's ability to handle thousands of concurrent connections with minimal memory, unlike thread-per-request WSGI frameworks."

#### How does Pydantic-core contribute to FastAPI's speed?
- **The Engine Mechanism (Why it behaves this way):** Pydantic v2 rewrote its validation engine in Rust as `pydantic-core`. This compiled extension handles type coercion, constraint validation, nested model parsing, and JSON serialization at near-C speeds. For a typical API request, validation and serialization can consume 30-50% of total processing time — moving this to Rust provides a significant speedup over pure Python alternatives like marshmallow or manual validation.
- **The Unforgettable Mental Model:** The **Industrial Sorting Machine**. Pure Python validation is like a person manually checking each item on a conveyor belt. Pydantic-core is an automated optical sorter — it inspects, measures, and categorizes items at machine speed because the logic runs in compiled Rust, not interpreted Python.
- **The Trap:** Assuming Pydantic v1 and v2 have similar performance. Pydantic v2 with pydantic-core is 5-50x faster than v1 for validation, depending on schema complexity.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Pydantic v2 uses pydantic-core, a Rust-based validation engine that handles type checking, coercion, and JSON serialization at compiled speeds. Since validation and serialization can consume half of an API request's processing time, this Rust layer provides a massive performance boost over pure Python validation libraries."

#### When should you NOT use async routes in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Async routes run on the main event loop. If an async route performs CPU-bound work (heavy computation, large data transformations, image processing) or uses a blocking library (synchronous database driver, `requests` instead of `httpx`), it blocks the entire event loop, freezing all other requests. FastAPI runs sync routes in a thread pool to prevent this, but mixing sync calls inside async routes defeats the purpose. Use `def` (sync) routes when the handler does CPU-bound work or calls blocking libraries — FastAPI will run them in a threadpool automatically.
- **The Unforgettable Mental Model:** The **Single-Lane Bridge**. The event loop is a bridge that only allows one car at a time. Async routes are cars that yield and let others pass while waiting. A blocking call is a car that parks in the middle of the bridge — nothing else can cross until it moves.
- **The Trap:** Making every route `async def` by default. If the route calls a sync library (like most database ORMs), `async def` provides zero benefit and can cause subtle bugs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use `async def` only when the route and all its dependencies are truly async — async database drivers, async HTTP clients, async file I/O. If any part of the call chain is synchronous, I use `def` and let FastAPI run it in a threadpool. Making everything async when using sync libraries gives no performance benefit and can block the event loop."

#### How does FastAPI compare to Flask/Django in performance?
- **The Engine Mechanism (Why it behaves this way):** Flask and Django use WSGI, which processes each request in a separate thread or process. This has higher memory overhead and context-switching costs. FastAPI uses ASGI with asyncio, handling many requests in a single thread with cooperative multitasking. Additionally, Pydantic's Rust core validates faster than Flask's manual validation or Django's form validation. Benchmarks typically show FastAPI handling 2-10x more requests per second than Flask for I/O-bound workloads, with lower latency and memory usage.
- **The Unforgettable Mental Model:** The **Restaurant Kitchen**. WSGI (Flask/Django) is like hiring a new chef for every order — reliable but expensive and slow to scale. ASGI (FastAPI) is one chef who starts cooking, waits for the oven, starts another dish while the first bakes, and serves multiple orders simultaneously.
- **The Trap:** Comparing raw "Hello World" benchmarks. Real-world performance depends on database queries, external API calls, and business logic — the framework's networking model matters most under concurrent load.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI outperforms Flask and Django for concurrent I/O-bound workloads because ASGI handles many requests in a single event loop instead of spawning threads per request. Combined with Pydantic's Rust-based validation, FastAPI typically achieves 2-10x higher throughput. However, for CPU-bound workloads, the difference is negligible since all Python frameworks share the same GIL limitations."

#### What production factors affect FastAPI's real-world performance?
- **The Engine Mechanism (Why it behaves this way):** Real-world FastAPI performance depends on: (1) **Database driver** — sync drivers like `psycopg2` block the event loop; async drivers like `asyncpg` don't, (2) **Connection pooling** — proper pooling prevents connection creation overhead per request, (3) **Serialization size** — large response payloads dominate response time; use `response_model` to filter fields, (4) **Middleware chain** — each middleware adds latency, (5) **Deployment** — running multiple Uvicorn workers behind a reverse proxy (nginx) utilizes all CPU cores, since a single event loop uses only one core.
- **The Unforgettable Mental Model:** The **Restaurant Chain**. A single fast kitchen (one Uvicorn worker) can only serve so many customers. Open multiple branches (workers) behind a dispatcher (nginx) to handle real-world traffic. Each branch needs its own supply lines (connection pools) and efficient menus (filtered responses).
- **The Trap:** Running a single Uvicorn worker in production. Python's GIL means one event loop uses one CPU core. Multi-core servers need multiple workers (`uvicorn --workers N`).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Real-world FastAPI performance depends on the database driver (async vs sync), connection pooling, response payload size, middleware overhead, and deployment architecture. I use async database drivers, filter responses with response_model, minimize middleware, and deploy multiple Uvicorn workers behind nginx to utilize all CPU cores."

## 8. Active recall test

1. **What are the three performance layers of FastAPI?**
   - **Explanation:** Starlette (ASGI networking for concurrent connections), Pydantic-core (Rust-based validation/serialization), and async/await (non-blocking I/O for high concurrency).

2. **Why does Pydantic v2 perform better than v1?**
   - **Explanation:** Pydantic v2 uses pydantic-core, a validation engine written in Rust, which runs at compiled speeds. It's 5-50x faster than v1's pure Python implementation for validation and serialization.

3. **When should you use `def` instead of `async def` in FastAPI?**
   - **Explanation:** Use `def` when the route calls synchronous libraries (most database ORMs, `requests`, file I/O). FastAPI runs sync routes in a threadpool, preventing event loop blocking. Use `async def` only when all dependencies are truly async.

4. **How does ASGI differ from WSGI in handling concurrency?**
   - **Explanation:** WSGI spawns a thread or process per request, with higher memory and context-switching overhead. ASGI uses a single-threaded event loop with cooperative multitasking, handling many concurrent requests with minimal memory.

5. **Why should you run multiple Uvicorn workers in production?**
   - **Explanation:** Python's GIL limits a single event loop to one CPU core. Multiple workers (`uvicorn --workers N`) allow FastAPI to utilize all available cores, multiplying throughput.

6. **What database driver choice most impacts FastAPI async performance?**
   - **Explanation:** Sync drivers like `psycopg2` block the event loop, negating async benefits. Async drivers like `asyncpg` (PostgreSQL) or `aiosqlite` (SQLite) yield control during I/O, maintaining concurrency.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Why FastAPI Is Fast should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Why FastAPI Is Fast, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Why FastAPI Is Fast.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
