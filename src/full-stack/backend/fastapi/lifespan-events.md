# Lifespan Events in FastAPI: `asynccontextmanager`, Startup State, and Graceful Teardown

## 1. Why This Exists — The Problem First

Imagine deploying a high-throughput FastAPI service that classifies incoming user text with a 2GB machine learning model and logs transactions into PostgreSQL. If you instantiate the database connection pool or load that 2GB model weights tensor inside a standard route handler or a naive per-request dependency, every incoming HTTP request pays a 4-to-5-second penalty just to allocate memory and negotiate network handshakes. When 200 concurrent requests land on your service, the server attempts to open 200 simultaneous connection pools and allocate 400GB of RAM, immediately triggering the Linux Out-Of-Memory (OOM) killer and crashing your container.

To work around this, developers historically leaned on global module-level variables or the legacy `@app.on_event("startup")` and `@app.on_event("shutdown")` hooks. But that created a different architectural failure: startup and shutdown were completely disconnected functions. If startup initialized three external services inside a `try` block and failed on the third, the shutdown function had no clean way of knowing which resources were active and which were never created. Sharing state required polluting module namespaces with global variables, and if the database password was wrong during startup, error handling was awkward and could leave the ASGI worker in an unresponsive zombie state.

FastAPI lifespan events exist to solve this lifecycle problem cleanly. By using Python's standard `@asynccontextmanager`, lifespan provides a single, unified, asynchronous boundary that sets up shared infrastructure once before the server starts receiving traffic, yields control while requests are processed, and guarantees clean, deterministic resource teardown when the process shuts down.

## 2. The Analogy — Make It Obvious

Think of running an industrial bakery.

Before the bakery opens its doors to customers in the morning (the **startup phase**), the bakers execute their opening prep: they ignite the massive commercial ovens, calibrate the dough mixers, test the refrigeration units, and verify the main gas lines. You would never rebuild an oven or run new gas pipes from the street every single time a customer walks in to buy a single croissant.

During the workday (the **`yield` phase**), the front doors unlock. Hundreds of customers walk in, place orders, and receive fresh bread. Every baker uses the already-hot ovens and running mixers that were prepped in the morning.

At the end of the day (the **shutdown phase**), the bakery locks its front doors to new customers, finishes baking the remaining loaves already in the ovens, turns off the gas valves, cleans the mixers, and shuts down the facility. If a gas leak is detected during morning prep, the bakery halts immediately and never unlocks the doors to the public. And at night, nobody cuts the building's electrical power while dough is still inside a running mixer.

In FastAPI:
- The **morning prep** is the code before `yield` in your lifespan context manager: initializing database connection pools, instantiating shared HTTP client sessions, connecting to Redis, or loading machine learning models into memory.
- The **open business hours** are the `yield` statement: execution pauses here while FastAPI and your ASGI server (like Uvicorn) process thousands of incoming HTTP requests using the shared application state.
- The **closing checklist** is the code after `yield` inside a `finally` block: closing database connection pools, draining background queues, disconnecting message brokers, and releasing sockets cleanly without leaking memory or dropping in-flight queries.

## 3. How It Actually Works — The Full Explanation

FastAPI lifespan events are built directly on Starlette and adhere to the ASGI (Asynchronous Server Gateway Interface) Lifespan Protocol specification.

When you start an ASGI server like Uvicorn (`uvicorn main:app`), Uvicorn boots its `asyncio` event loop and communicates with FastAPI through ASGI messages. Before opening the network port to accept incoming TCP connections, Uvicorn sends an ASGI message of type `{"type": "lifespan.startup"}` to FastAPI.

FastAPI intercepts this message and enters your `@asynccontextmanager` function.

**Phase 1: Startup (Before `yield`)**
Execution enters the lifespan function and runs all code prior to the `yield` keyword. Here, you perform asynchronous setup: establishing connection pools via `asyncpg` or `SQLAlchemy`, initializing a `redis.asyncio` client, or setting up a long-lived `httpx.AsyncClient`. 

If everything initializes successfully, execution reaches `yield`. At this exact instant, FastAPI sends an ASGI message `{"type": "lifespan.startup.complete"}` back to Uvicorn. Uvicorn receives the confirmation, binds to its host and port, and begins accepting HTTP requests.

If any line before `yield` raises an unhandled exception (for instance, the PostgreSQL server is unreachable), the exception propagates out. FastAPI catches it and responds to Uvicorn with `{"type": "lifespan.startup.failed", "message": str(exc)}`. Uvicorn logs the traceback and aborts startup immediately. The server process exits with a non-zero exit code, preventing a broken container from passing health checks in Kubernetes or Docker.

**Phase 2: Request Processing (During `yield`)**
While the application is alive and serving traffic, the lifespan generator remains suspended at the `yield` statement.

To make initialized resources accessible to route handlers without global variables, FastAPI supports two approaches:
1. **Attaching to `app.state`:** The lifespan function receives `app: FastAPI` as its parameter. You assign resources to `app.state`, such as `app.state.db_pool = pool`. Inside endpoints or dependencies, you read from `request.app.state.db_pool`.
2. **Yielding a State Mapping:** Modern Starlette and FastAPI allow you to yield a dictionary: `yield {"db_pool": pool, "redis": redis_client}`. FastAPI automatically merges the yielded dictionary into `request.state` for every incoming HTTP request.

**Phase 3: Graceful Shutdown (After `yield`)**
When the server receives an OS termination signal (`SIGINT` via Ctrl+C, or `SIGTERM` from a Kubernetes rolling deployment), Uvicorn stops accepting new incoming TCP connections. It allows in-flight requests a configurable grace period to finish executing.

Once active requests complete, Uvicorn sends an ASGI message `{"type": "lifespan.shutdown"}` to FastAPI. FastAPI resumes the suspended lifespan generator right after the `yield` statement.

Your teardown logic runs sequentially: closing the database connection pool, terminating open HTTP client connections, flushing buffered logs, and disconnecting message brokers. When the lifespan function exits cleanly, FastAPI sends `{"type": "lifespan.shutdown.complete"}` back to Uvicorn. Uvicorn terminates the event loop, and the Python process exits with exit code 0.

**Why the Old `@app.on_event` Hooks Were Deprecated**
In older versions of FastAPI, startup and shutdown were handled via separate decorators:
```python
# DEPRECATED: Do not use in modern FastAPI
@app.on_event("startup")
async def startup_event():
    ...

@app.on_event("shutdown")
async def shutdown_event():
    ...
```
These were deprecated for three major architectural reasons:
1. **Disconnected Execution Context:** Startup and shutdown could not share local variables. You had to declare variables as module-level globals to access them during shutdown.
2. **Brittle Teardown Guarantees:** If you had three startup hooks and the second crashed, the shutdown hooks might still fire and attempt to disconnect uninitialized resources, leading to cascading `AttributeError` or `NoneType` crashes during crash reporting.
3. **No Native Context Manager Support:** Context managers (`async with`) provide deterministic resource cleanup through Python's native `try...finally` syntax. The `@asynccontextmanager` model aligns FastAPI with standard Python async idioms and the ASGI 3.0 lifespan specification.

## 4. Real Code — See It Working

Here is a complete, production-grade example managing an asynchronous database connection pool, a shared HTTP client, and a Redis cache with `app.state` and FastAPI dependencies.

```python
from contextlib import asynccontextmanager
from typing import AsyncGenerator
import asyncpg
import httpx
from fastapi import FastAPI, Depends, Request, HTTPException, status
from pydantic import BaseModel

# Mock config for demonstration
DATABASE_URL = "postgresql://postgres:secret@localhost:5432/production_db"
REDIS_HOST = "localhost"


# --- 1. Lifespan Definition ---
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # STARTUP PHASE: Runs before Uvicorn accepts any incoming HTTP requests
    print(" Lifespan Startup: Initializing shared infrastructure...")

    # Initialize async database connection pool
    # In real production, wrap in try/except if fallback or custom logging is needed
    db_pool = await asyncpg.create_pool(
        dsn=DATABASE_URL,
        min_size=5,
        max_size=20,
        timeout=10.0,
    )
    app.state.db_pool = db_pool

    # Initialize long-lived HTTP client for external third-party API calls
    http_client = httpx.AsyncClient(timeout=5.0)
    app.state.http_client = http_client

    print(" Lifespan Startup: Database pool and HTTP client ready.")

    try:
        # APP IS RUNNING: Execution pauses here while the server handles requests
        yield
    finally:
        # SHUTDOWN PHASE: Runs when SIGINT/SIGTERM is received
        print(" Lifespan Shutdown: Commencing graceful resource teardown...")

        # Close HTTP client sessions cleanly to avoid leaking sockets
        await http_client.aclose()
        print(" Lifespan Shutdown: HTTP client closed.")

        # Close all active database connections in the pool
        if db_pool is not None:
            await db_pool.close()
            print(" Lifespan Shutdown: Database connection pool terminated.")


# --- 2. FastAPI App Instantiation ---
app = FastAPI(
    title="High-Throughput Order Service",
    lifespan=lifespan,
)


# --- 3. Clean Dependencies for Endpoints ---
def get_db_pool(request: Request) -> asyncpg.Pool:
    # Safely extract the pool from app.state without globals
    pool: asyncpg.Pool = request.app.state.db_pool
    if pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database pool is not available",
        )
    return pool


def get_http_client(request: Request) -> httpx.AsyncClient:
    return request.app.state.http_client


# --- 4. Route Handlers Consuming the Lifespan Resources ---
class OrderResponse(BaseModel):
    order_id: int
    user_id: int
    status: str


@app.get("/orders/{order_id}", response_model=OrderResponse)
async def fetch_order(
    order_id: int,
    db: asyncpg.Pool = Depends(get_db_pool),
):
    # Acquire a connection from the pre-warmed pool for this request only
    async with db.acquire() as connection:
        row = await connection.fetchrow(
            "SELECT id, user_id, status FROM orders WHERE id = $1", order_id
        )
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found",
            )
        return OrderResponse(
            order_id=row["id"],
            user_id=row["user_id"],
            status=row["status"],
        )


@app.get("/health")
async def health_check(db: asyncpg.Pool = Depends(get_db_pool)):
    # Verify pool connectivity on health probes
    async with db.acquire() as connection:
        await connection.execute("SELECT 1")
    return {"status": "healthy", "database": "connected"}
```

Here is a second pattern demonstrating how to yield a state dictionary mapping and consume it in tests using Starlette's `TestClient`:

```python
from contextlib import asynccontextmanager
from typing import AsyncGenerator, TypedDict
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient


class AppState(TypedDict):
    service_name: str
    rate_limiter_active: bool


@asynccontextmanager
async def dict_lifespan(app: FastAPI) -> AsyncGenerator[AppState, None]:
    # Yielding a dictionary merges keys directly into request.state
    state_payload: AppState = {
        "service_name": "PaymentGateway",
        "rate_limiter_active": True,
    }
    yield state_payload
    # Teardown logic here if needed


test_app = FastAPI(lifespan=dict_lifespan)


@test_app.get("/info")
async def get_info(request: Request):
    # Accessed directly on request.state
    return {
        "service": request.state.service_name,
        "rate_limiter": request.state.rate_limiter_active,
    }


# Testing lifespan execution
def test_lifespan_state():
    # TestClient used as a context manager triggers lifespan startup and shutdown
    with TestClient(test_app) as client:
        response = client.get("/info")
        assert response.status_code == 200
        assert response.json() == {
            "service": "PaymentGateway",
            "rate_limiter": True,
        }
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are lifespan events in FastAPI, and why did they replace `@app.on_event("startup")` and `@app.on_event("shutdown")`?**

Lifespan events define the asynchronous lifecycle of a FastAPI application using Python's `@asynccontextmanager`. Code before `yield` executes during server startup, and code after `yield` executes during server shutdown.

They replaced `@app.on_event` because the legacy decorators treated startup and shutdown as isolated, uncoordinated functions. This forced developers to rely on global mutable variables to share state, made error recovery during failed initialization brittle, and prevented the use of standard Python context managers (`async with`) for nested resource acquisition. Lifespan unifies the lifecycle into a single function with standard `try...finally` teardown guarantees and complies natively with the ASGI 3.0 Lifespan protocol.

**Q: How do you share resources initialized during lifespan with your route handlers?**

There are two recommended patterns:
1. **Assigning to `app.state`:** The lifespan function receives `app: FastAPI`. You attach resources directly to `app.state` (for example, `app.state.pool = pool`). Inside route handlers or dependency functions, you inject `Request` and read `request.app.state.pool`.
2. **Yielding a state mapping:** The lifespan context manager can yield a mapping (`yield {"pool": pool}`). FastAPI automatically injects these keys into `request.state` on every incoming request (`request.state.pool`).

Best practice is to wrap access to `app.state` or `request.state` inside a FastAPI dependency (`Depends`). This keeps route handlers decoupled from framework internals and makes mocking trivial in unit tests.

**Q: What happens if an unhandled exception is raised during the lifespan startup phase?**

If an exception is raised before `yield`, the startup sequence fails immediately. FastAPI catches the unhandled exception and returns an ASGI `lifespan.startup.failed` message to the ASGI server (such as Uvicorn or Hypercorn). The ASGI server logs the error traceback and terminates the process with a non-zero exit code without opening the network port to accept HTTP requests.

Because `yield` was never reached, the post-`yield` shutdown logic does not execute. This "fail-fast" behavior is essential in containerized environments like Kubernetes: it ensures an improperly configured or unauthenticated pod fails its readiness check immediately instead of entering a zombie state where it returns 500 errors to end users.

**Q: How does FastAPI lifespan interact with multi-worker ASGI deployments (e.g., Uvicorn with `--workers 4` or Gunicorn with `UvicornWorker`)?**

In a multi-worker setup, the master process (Gunicorn or Uvicorn manager) forks multiple independent OS worker processes. Each worker process instantiates its own Python interpreter, its own `asyncio` event loop, its own FastAPI `app` instance, and runs its own separate lifespan function.

If you have 4 workers and each worker's lifespan creates a database pool with a maximum size of 20 connections, your application will open up to 80 total database connections (4 workers × 20 connections). Lifespan state (`app.state`) is process-local and is never shared across worker processes via shared memory.

**Q: How do you properly test FastAPI applications that rely on lifespan events?**

When writing tests with `fastapi.testclient.TestClient` or `httpx.AsyncClient`, lifespan events only trigger if you use the client as a context manager:
- With `TestClient`:
  ```python
  with TestClient(app) as client:
      response = client.get("/health")
      assert response.status_code == 200
  ```
  Entering the `with` block triggers the startup lifespan; exiting the `with` block triggers the shutdown lifespan.
- With `httpx.AsyncClient` (async testing with `pytest-asyncio`):
  ```python
  from httpx import ASGITransport, AsyncClient

  async with AsyncClient(
      transport=ASGITransport(app=app), base_url="http://test"
  ) as client:
      response = await client.get("/health")
      assert response.status_code == 200
  ```
If you instantiate `client = TestClient(app)` without entering its context manager, lifespan startup never runs, `app.state` remains unpopulated, and routes relying on lifespan resources will fail with `AttributeError`.

**Q: How does a lifespan context manager differ from a FastAPI dependency that uses `yield` (`Depends`)?**

Lifespan is **application-scoped**: it runs exactly once during the entire lifespan of the process (once on startup, once on shutdown) and manages heavy, shared infrastructure (database pools, cache clients, ML models).

A dependency with `yield` is **request-scoped**: it runs once per HTTP request (executing before the route handler, and executing teardown after the response is sent back to the client). Dependencies manage request-specific resources, such as checking out a single database transaction/connection from the shared pool and committing or rolling back when the request completes.

## 6. The Traps — What Goes Wrong

- **Trap 1: Initializing request-scoped or user-specific state in lifespan.**
  *The Mistake:* Creating request-level objects (like an active database transaction, a user authentication token, or a per-request scratchpad) inside the lifespan context manager and storing it on `app.state`.
  *Why It Fails:* Because lifespan runs once at boot, every incoming concurrent request shares the exact same instance. If two requests execute database queries simultaneously on a shared transaction object, they corrupt each other's state, throw concurrent transaction errors, or cause cross-tenant data leaks. Lifespan is strictly for shared, thread-safe/async-safe pools and clients.

- **Trap 2: Performing blocking synchronous I/O in the async lifespan.**
  *The Mistake:* Calling synchronous libraries (such as `time.sleep()`, synchronous `psycopg2.connect()`, or blocking `requests.get()`) directly inside `async def lifespan(app: FastAPI):`.
  *Why It Fails:* Because `lifespan` runs on the primary `asyncio` event loop, blocking the thread halts the entire event loop. If your ASGI server has readiness/liveness probes or startup timeout alarms (like Kubernetes `startupProbe`), the blocked event loop cannot respond to heartbeats, causing the orchestrator to repeatedly kill the container before it finishes booting. Use async-native clients (`asyncpg`, `httpx`, `redis.asyncio`) or wrap synchronous calls in `anyio.to_thread.run_sync` / `asyncio.to_thread`.

- **Trap 3: Forgetting `try...finally` around the `yield` statement.**
  *The Mistake:* Writing teardown logic directly after `yield` without a `try...finally` block.
  *Why It Fails:* If a signal or cancellation exception interrupts the application while it is running, execution might bypass unguarded post-`yield` lines. Wrapping your lifespan in `try: yield finally: ...` guarantees that connection pools, file handles, and background workers are reliably terminated regardless of how the runtime signals termination.

- **Trap 4: Instantiating `TestClient` without entering its context manager.**
  *The Mistake:* Writing test suites like `client = TestClient(app)` globally or inside fixtures without using `with TestClient(app) as client:`.
  *Why It Fails:* The `TestClient` constructor does not run lifespan startup on instantiation. If you call `client.get("/api")` directly, `app.state` attributes configured in lifespan will be missing, causing cryptic `AttributeError: 'State' object has no attribute 'db_pool'` failures in tests.

- **Trap 5: Assuming lifespan state is shared across multiple Uvicorn workers.**
  *The Mistake:* Initializing an in-memory dictionary or cache in lifespan and assuming updates made by a request in Worker 1 will be visible to a request handled by Worker 2.
  *Why It Fails:* Multi-worker deployments run separate OS processes with isolated memory spaces. An in-memory object attached to `app.state` exists only within that specific worker process. For shared state across workers, use an external distributed store like Redis.

- **Trap 6: Sub-application lifespan mounting surprises.**
  *The Mistake:* Defining a lifespan context manager on a sub-app mounted via `app.mount("/sub", sub_app)` and expecting it to execute when the main application starts.
  *Why It Fails:* In Starlette and FastAPI, mounting a sub-app creates an isolated ASGI routing boundary; the parent application's lifespan runner does not automatically invoke the lifespan of mounted sub-applications. If a sub-app requires its own lifespan initialization, its lifecycle must be explicitly composed and driven by the parent application's lifespan.

## 7. Compare With Related Concepts

- **Lifespan (`@asynccontextmanager`) vs. Request Dependency (`Depends` with `yield`)**
  *The Difference:* Lifespan executes once per process lifecycle at boot and shutdown to manage persistent application-level resources (database connection pools, cache clients, loaded ML models). A dependency with `yield` executes on every individual HTTP request to manage transient, request-level resources (checking out a single connection/transaction from the pool, authenticating a token, closing a session).
  *When to use which:* Use Lifespan for resources shared across all requests; use Dependencies for resources scoped to a single request or requiring per-request cleanup.

- **Lifespan vs. ASGI Middleware (`BaseHTTPMiddleware`)**
  *The Difference:* Lifespan hooks into server startup and shutdown ASGI messages before and after HTTP traffic is served. Middleware wraps around every HTTP request/response cycle while the server is active, inspecting headers, modifying request bodies, or measuring execution latency.
  *When to use which:* Use Lifespan to initialize resources that endpoints need; use Middleware to apply global HTTP behavior (CORS headers, timing headers, distributed tracing trace IDs).

- **Lifespan vs. BackgroundTasks (`BackgroundTasks`)**
  *The Difference:* Lifespan manages server-level lifecycle boundaries. `BackgroundTasks` are small asynchronous or synchronous tasks scheduled inside an endpoint to execute right after returning an HTTP response to the client (such as sending a welcome email or writing an audit log).
  *When to use which:* Use Lifespan for application infrastructure that must outlive individual requests; use `BackgroundTasks` for lightweight post-response work triggered by a specific request.

- **Modern `lifespan` vs. Deprecated `@app.on_event("startup" / "shutdown")`**
  *The Difference:* `@app.on_event` split initialization and cleanup into separate uncoordinated functions requiring global variables, with brittle error handling if startup failed partway through. Modern `lifespan` uses Python's standard `@asynccontextmanager`, sharing local scope across startup and teardown, guaranteeing cleanup with `try...finally`, and adhering to ASGI 3.0 lifespan specifications.
  *When to use which:* Always use `lifespan`; `@app.on_event` is deprecated in FastAPI and Starlette.

**Quick Decision Rules:**
- **Use Lifespan** when you need to initialize something once at boot and close it once at shutdown (e.g., `asyncpg.create_pool()`, `httpx.AsyncClient()`, loading ML weights).
- **Use Dependencies with `yield`** when you need a resource created or checked out for the duration of a single HTTP request (e.g., `async with db_pool.acquire() as conn: yield conn`).
- **Use Middleware** when you need to inspect headers, measure latency, or modify responses for every single HTTP route without explicit per-route injection.

## 8. 🧠 The Memory Hook

**Lifespan is the building's main power grid, not the room's light switch.** 

Code before `yield` powers up the entire facility before anyone enters in the morning; the `yield` is the business day while people work inside; and code after `yield` inside a `finally` block cuts the main power safely after everyone has left. You never rebuild the power grid for an individual room, and you never lock up at night with the gas valves open.
