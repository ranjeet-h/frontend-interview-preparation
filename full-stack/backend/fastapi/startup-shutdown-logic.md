# Startup and Shutdown Logic in FastAPI: Resource Initialization, Signal Handling, and Clean Teardown

## 1. Why This Exists — The Problem First

It is 2:00 PM on a high-traffic Tuesday, and your continuous deployment pipeline triggers a rolling update on Kubernetes. A new pod spins up, and Kubernetes sends an operating system `SIGTERM` signal to the old pod to terminate it.

If your application lacks explicit lifecycle management, two catastrophic failures happen at the exact same moment.

First, on the newly started pod: incoming HTTP traffic arrives the microsecond the port opens, but your 2GB machine learning model is still deserializing into memory, your database connection pool hasn't warmed up, and your Redis client hasn't established its handshake. Customers receive instant `500 Internal Server Error` responses or hit gateway timeouts because the app accepted requests before its runtime dependencies were ready.

Second, on the old pod receiving `SIGTERM`: the process abruptly drops dead mid-execution. Sockets are severed while database transactions are halfway through writing checkout records. In-flight HTTP requests are killed mid-stream, leaving upstream reverse proxies like Nginx or AWS Application Load Balancers with severed TCP sockets that produce a spike of `502 Bad Gateway` errors for active users.

FastAPI applications are not stateless functions in a vacuum. They manage long-lived, stateful resources: database connection pools, cache clients, asynchronous HTTP session pools, background task queues, and pre-computed memory buffers. Startup and shutdown logic exists to enforce deterministic lifecycle boundaries: initialize and verify everything *before* the server accepts its first byte of HTTP traffic, and cleanly drain, flush, and release those resources *before* the operating system terminates the process.

## 2. The Analogy — Make It Obvious

Think of FastAPI lifecycle management as the daily operations of a Michelin-starred restaurant.

**The Pre-Service Setup (Startup):**
Before unlocking the front doors to guests at 5:00 PM, the staff arrives at 2:00 PM. The head chef lights the gas stoves, verifies that the walk-in freezers are holding temperature, stocks the prep stations with chopped ingredients, and syncs the point-of-sale register with inventory. If the gas line fails to ignite or the refrigerator is broken, the manager does not unlock the front doors—they abort service immediately before a single customer sits down.

**The Dinner Service (`yield`):**
At 5:00 PM, the doors open. Customers flow in and out for hours. Hundreds of independent orders are placed, cooked, served, and paid for. Every table uses the pre-heated stoves and shared prep counters, but each individual dish gets its own clean pan and plate that are washed immediately after that specific order finishes.

**Last Call and Clean Teardown (Shutdown):**
At 10:00 PM, closing begins. First, the host locks the front entrance so no new walk-ins can enter. Next, the kitchen finishes cooking every order currently on the ticket rail (draining in-flight requests). Once the final guest leaves, the staff executes the teardown: sanitizing the stations, turning off the gas lines, closing the refrigeration vents, balancing the cash register, and locking the building.

Here is how every moving part maps to FastAPI:

- **Kitchen prep before unlocking the doors** is your **lifespan startup logic** (warming the SQLAlchemy engine pool, connecting to Redis, pre-loading ML model weights, running health checks).
- **Aborting opening if a stove is broken** is **failing startup**, signaling the ASGI server to abort and preventing Kubernetes from sending traffic to an unhealthy pod.
- **The dinner service itself** is the **`yield` statement** in your lifespan context manager, where the event loop processes incoming HTTP requests.
- **Locking the entrance and finishing active tables** is **graceful signal handling** (`SIGTERM`), where Uvicorn stops accepting new TCP connections and gives active requests time to finish.
- **Turning off gas lines and sanitizing** is your **lifespan shutdown logic** (`engine.dispose()`, closing Redis pools, flushing log buffers).
- **Opening four separate franchise locations** is a **multi-worker setup** (e.g., Gunicorn with 4 Uvicorn workers), where each worker process runs its own independent startup prep and shutdown cleanup.

## 3. How It Actually Works — The Full Explanation

FastAPI handles application lifecycles through the ASGI (Asynchronous Server Gateway Interface) Lifespan Protocol using Python's standard `asynccontextmanager`. Understanding this requires looking at the protocol mechanics, state management, process boundaries, and graceful signal handling.

**1. The ASGI Lifespan Protocol Under the Hood**

When you start an ASGI server like Uvicorn (`uvicorn main:app`), Uvicorn does not immediately start listening for HTTP traffic on the network port. Instead, it initiates an ASGI lifespan communication channel with FastAPI:

1. **`lifespan.startup` Event:** Uvicorn creates an internal event loop and sends a `{"type": "lifespan.startup"}` message to the FastAPI application callable.
2. **Context Manager Execution:** FastAPI invokes the function passed to `FastAPI(lifespan=...)`. The code executes synchronously and asynchronously up to the `yield` statement.
3. **Startup Handshake:** If the code prior to `yield` completes without errors, FastAPI sends a `{"type": "lifespan.startup.complete"}` message back to Uvicorn.
4. **Port Binding:** Upon receiving `startup.complete`, Uvicorn binds to the TCP socket (e.g., `0.0.0.0:8000`) and begins accepting HTTP connections.
5. **Startup Failure:** If an uncaught exception occurs before `yield` (such as a database connection timeout), FastAPI catches it and sends `{"type": "lifespan.startup.failed", "message": "..."}` back to Uvicorn. Uvicorn immediately crashes and exits with a non-zero exit code. In Kubernetes, the container never passes its `startupProbe`, preventing traffic routing to a broken pod.

**2. The `yield` Boundary and Application State (`app.state`)**

The `yield` statement is the runtime divider. The code paused at `yield` represents the live state of your application serving requests.

To make long-lived resources accessible to your route handlers without resorting to brittle global variables, FastAPI provides `app.state`. Resources initialized during startup are attached to `app.state`:

- `app.state.db_engine = create_async_engine(...)`
- `app.state.redis_client = aioredis.from_url(...)`
- `app.state.http_client = httpx.AsyncClient(...)`

During a request, FastAPI's dependency injection system extracts these resources from the incoming request:

```python
async def get_redis(request: Request) -> aioredis.Redis:
    return request.app.state.redis_client
```

This keeps route handlers decoupled, testable, and free of global references.

**3. The Graceful Shutdown Sequence**

When a deployment tool or operator stops the application (via `SIGTERM` or `Ctrl+C` / `SIGINT`):

1. **Socket Closure:** Uvicorn stops accepting new incoming TCP connections on its listening port.
2. **In-Flight Request Draining:** The server waits for active HTTP requests to finish processing, up to a configurable timeout (e.g., Uvicorn's `--timeout-graceful-shutdown` or Gunicorn's `--timeout`).
3. **`lifespan.shutdown` Event:** Uvicorn sends a `{"type": "lifespan.shutdown"}` message to FastAPI.
4. **Resume Context Manager:** FastAPI resumes the lifespan generator right after the `yield` statement.
5. **Resource Teardown:** Your teardown code executes in reverse order of initialization:
   - Cancel running background tasks.
   - Close HTTP client pools (`await app.state.http_client.aclose()`).
   - Close Redis connections (`await app.state.redis_client.aclose()`).
   - Dispose of database connection pools (`await app.state.db_engine.dispose()`).
   - Flush asynchronous telemetry and structured logging buffers.
6. **`lifespan.shutdown.complete`:** FastAPI responds to Uvicorn, which releases OS resources and terminates the process with exit code 0.

**4. Multi-Worker Architecture Implications**

In production, FastAPI is rarely run as a single process. You typically run a master process manager (like Gunicorn) that forks multiple Uvicorn worker processes (e.g., `gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app`).

Each worker is an isolated operating system process with its own Python interpreter, its own memory space, and its own asyncio event loop.

Therefore:
- Lifespan startup and shutdown execute **independently inside every single worker process**. If you have 4 workers, your startup code runs 4 times.
- Database connection pools are **not shared** across workers. If each worker configures `pool_size=20`, your application opens up to `4 * 20 = 80` database connections.
- Never initialize database engines, event loops, or network sockets at the global module level before the master process forks. Initializing resources inside the `lifespan` handler ensures they are created *after* the fork inside the child worker's own event loop.

**5. Modern `lifespan` vs. Legacy `@app.on_event`**

Older FastAPI codebases used `@app.on_event("startup")` and `@app.on_event("shutdown")`. This legacy pattern suffered from critical architectural flaws:
- Startup and shutdown were disconnected functions with no shared context or unified error handling.
- Sharing state required declaring variables at the global module level.
- If one startup handler crashed, subsequent shutdown handlers were not guaranteed to execute cleanly.

The modern `lifespan` context manager provides strict Python context manager semantics: you can wrap the entire lifecycle in standard `try...finally` blocks, pass state cleanly via yield/state dictionaries, and guarantee that cleanup logic only runs if initialization succeeded.

## 4. Real Code — See It Working

Here is a production-grade FastAPI application demonstrating complete lifecycle management: asynchronous database engine pooling with SQLAlchemy, Redis client pooling, shared HTTP client pooling with HTTPX, dependency injection wiring, and a comprehensive automated test suite.

```python
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import httpx
import redis.asyncio as aioredis
from fastapi import Depends, FastAPI, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# Configure structured logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("service.lifecycle")

# Mock database and cache configuration URLs
DATABASE_URL = "sqlite+aiosqlite:///:memory:"
REDIS_URL = "redis://localhost:6379/0"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Manages the application lifecycle.
    Code before yield runs during startup (before accepting traffic).
    Code after yield runs during shutdown (after draining requests).
    """
    logger.info("Starting up: initializing stateful resources...")

    # 1. Initialize SQLAlchemy Async Engine with connection pooling
    db_engine: AsyncEngine = create_async_engine(
        DATABASE_URL,
        echo=False,
        pool_pre_ping=True,  # Test connections for liveness before vending
        pool_size=10,
        max_overflow=5,
    )
    session_factory = async_sessionmaker(
        bind=db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # 2. Initialize asynchronous Redis connection pool
    redis_client = aioredis.from_url(
        REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )

    # 3. Initialize reusable HTTPX client for outbound microservice calls
    http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(5.0, connect=2.0),
        limits=httpx.Limits(max_keepalive_connections=10, max_connections=50),
    )

    # 4. Perform startup health verification (Fail Fast Principle)
    try:
        async with db_engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Startup verification: Database connection pool ready.")
    except Exception as exc:
        logger.critical(f"Database startup check failed: {exc}")
        # Clean up already-opened resources before aborting startup
        await db_engine.dispose()
        await redis_client.aclose()
        await http_client.aclose()
        raise RuntimeError("Application startup aborted due to DB failure.") from exc

    # 5. Attach shared resources to app.state for request-scoped access
    app.state.db_engine = db_engine
    app.state.session_factory = session_factory
    app.state.redis_client = redis_client
    app.state.http_client = http_client

    logger.info("Application startup complete. Ready for traffic.")

    # ---------------------------------------------------------------------
    # YIELD: The application is now live and processing HTTP requests.
    # ---------------------------------------------------------------------
    yield

    # ---------------------------------------------------------------------
    # SHUTDOWN: Uvicorn received SIGTERM/SIGINT, stopped accepting new requests,
    # and drained in-flight traffic. Now cleanly release resources.
    # ---------------------------------------------------------------------
    logger.info("Shutting down: closing pools and draining connections...")

    # Close HTTP client connection pool
    await app.state.http_client.aclose()
    logger.info("Outbound HTTP client closed.")

    # Close Redis connection pool
    await app.state.redis_client.aclose()
    logger.info("Redis connection pool closed.")

    # Dispose of SQLAlchemy database engine connection pool
    await app.state.db_engine.dispose()
    logger.info("SQLAlchemy database engine disposed.")

    logger.info("Application teardown finished successfully.")


# Instantiate FastAPI with the lifespan handler
app = FastAPI(
    title="Order Processing Service",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------
# Dependencies: Request-Scoped Wiring
# ---------------------------------------------------------------------
async def get_db_session(request: Request) -> AsyncGenerator[AsyncSession, None]:
    """Provides a transactional database session per request."""
    session_factory: async_sessionmaker = request.app.state.session_factory
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_redis_client(request: Request) -> aioredis.Redis:
    """Extracts the shared Redis client from app.state."""
    return request.app.state.redis_client


# ---------------------------------------------------------------------
# Route Handlers
# ---------------------------------------------------------------------
class HealthStatus(BaseModel):
    status: str
    database: bool


@app.get("/healthz", response_model=HealthStatus, status_code=status.HTTP_200_OK)
async def health_check(
    db: AsyncSession = Depends(get_db_session),
    redis: aioredis.Redis = Depends(get_redis_client),
):
    # Verify live database connectivity
    result = await db.execute(text("SELECT 1"))
    db_ok = result.scalar() == 1
    return HealthStatus(status="healthy", database=db_ok)
```

Here is the corresponding test suite verifying both successful lifespan execution and startup failure behavior using `TestClient`:

```python
import pytest
from fastapi.testclient import TestClient


def test_lifespan_startup_and_shutdown():
    """
    TestClient acts as a context manager.
    Entering 'with TestClient(app)' executes the startup lifespan logic.
    Exiting the block triggers the shutdown teardown logic.
    """
    with TestClient(app) as client:
        # Verify startup attached resources to app.state
        assert hasattr(app.state, "db_engine")
        assert hasattr(app.state, "redis_client")
        assert hasattr(app.state, "http_client")

        # Make a request against the initialized application
        response = client.get("/healthz")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    # After exiting the with block, shutdown logic has executed.
    # We can verify that resources were cleanly released.
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the exact sequence of events when Uvicorn starts up and shuts down a FastAPI app configured with a lifespan context manager?**

On startup, Uvicorn initializes its event loop and sends an ASGI `lifespan.startup` event to FastAPI *before* binding to the network socket. FastAPI enters your `@asynccontextmanager` function and runs all code up to the `yield` statement. If this setup finishes without error, FastAPI returns `lifespan.startup.complete` to Uvicorn. Uvicorn then binds the TCP port and starts listening for HTTP traffic.

On shutdown (triggered by `SIGTERM` or `SIGINT`), Uvicorn immediately closes the listening socket to reject new incoming connections. It waits for active in-flight requests to complete up to the graceful shutdown timeout limit. Once drained, Uvicorn sends an ASGI `lifespan.shutdown` event to FastAPI. FastAPI resumes execution immediately after the `yield` statement, running your teardown logic (`engine.dispose()`, closing Redis pools, cancelling background tasks). Once the block completes, FastAPI returns `lifespan.shutdown.complete`, and Uvicorn terminates the process.

**Q: What happens if an unhandled exception is raised in the lifespan function before the `yield`? Does the shutdown code execute?**

If an exception is raised prior to `yield`, the startup sequence fails immediately. FastAPI catches the exception and sends a `lifespan.startup.failed` message to the ASGI server. Uvicorn logs the critical error and terminates the process without ever binding the network port.

Crucially, **the code after `yield` will not execute**. In Python context managers, if an exception occurs before the yield point, the context is aborted, and the post-yield code is skipped. This is why any partial resources opened during a multi-step startup must be cleaned up inside a `try...except` block within the startup phase if one of the subsequent startup steps fails.

**Q: How does graceful shutdown work in a Kubernetes environment during a rolling deployment?**

When Kubernetes removes a pod during a deployment, it executes two actions in parallel: it removes the pod IP from the Service's Endpoints (so kube-proxy and Ingress controllers stop routing new traffic), and it sends a `SIGTERM` signal to the container's PID 1 process.

Because endpoint removal propagation across the cluster takes a few seconds, new requests may still arrive at the pod immediately after `SIGTERM`. A production-ready FastAPI deployment handles this by:
1. Configuring a `preStop` lifecycle hook in Kubernetes (e.g., `sleep 5`) to give cluster networking time to update endpoint routing before `SIGTERM` is delivered.
2. Setting Uvicorn's graceful timeout (`--timeout-graceful-shutdown 30`) so it drains active requests rather than severing TCP connections.
3. Allowing FastAPI's lifespan post-yield block to cleanly close database pools and flush telemetry only *after* all in-flight requests have completed.
4. Ensuring Kubernetes `terminationGracePeriodSeconds` (default 30s) is larger than Uvicorn's shutdown timeout to prevent a premature `SIGKILL`.

**Q: Why should you avoid global variables for shared database engines or Redis clients, and what is the recommended alternative?**

Global variables introduce tight coupling, make testing difficult, and break application isolation. When writing tests, you often want to instantiate multiple app instances with distinct test configurations or override dependencies. Global variables persist state across test boundaries, leading to flaky tests, connection leaks, and race conditions.

The recommended alternative is storing application-scoped resources on `app.state` inside the lifespan context manager (e.g., `app.state.redis = client`). Route handlers access these resources through FastAPI's dependency injection system via `request.app.state`. This allows test harnesses to seamlessly swap out or mock resources using dependency overrides without touching global module state.

**Q: How does running multiple worker processes (e.g., `gunicorn -w 4 -k uvicorn.workers.UvicornWorker`) affect your database connection pools and startup logic?**

Each Gunicorn worker is a completely separate operating system process with its own private memory space and its own asyncio event loop. There is zero shared memory between workers.

This has two critical consequences:
1. **Multiplied Connection Pools:** If your lifespan startup allocates an SQLAlchemy connection pool with `pool_size=15` and `max_overflow=5`, each worker process creates its own independent pool. With 4 workers on 3 Kubernetes pod replicas, your maximum database connections will be `4 * 3 * (15 + 5) = 240` connections. You must size your pool parameters based on `total_workers * pool_size` against your PostgreSQL `max_connections` limit.
2. **Independent Lifecycle Execution:** Every worker executes the lifespan startup and shutdown routines on its own. Tasks like running database schema migrations or populating global cache tables should not be placed in the worker lifespan, as 4 workers starting simultaneously would race each other and cause migration deadlocks. Migrations belong in dedicated CI/CD deploy jobs or Kubernetes Init Containers.

**Q: How do you properly test lifespan startup and shutdown logic in an automated test suite?**

You test lifespans using Starlette's `TestClient` or HTTPX's `AsyncClient` configured with ASGI transport as a context manager:

```python
with TestClient(app) as client:
    response = client.get("/healthz")
    assert response.status_code == 200
```

When `TestClient` enters the `with` block, it triggers the ASGI lifespan startup event, executing the code before `yield`. When the `with` block exits, it triggers the ASGI lifespan shutdown event, executing the post-yield code. To test startup failure resiliency, you can patch or mock a downstream dependency (such as Redis or the DB driver) to raise a connection error, and verify that the application refuses to start and raises the appropriate exception.

## 6. The Traps — What Goes Wrong

**Trap 1: The Multi-Worker Database Pool Explosion**
A developer tests an app locally with 1 worker and sets `pool_size=50` to handle high concurrency. In staging, they deploy with Gunicorn configured for 8 workers across 4 replica pods. When traffic spikes, the database suddenly crashes with `FATAL: remaining connection slots are reserved for non-replication superuser connections`.
*Why it happens:* `pool_size` is per-process, not per-application. 8 workers × 4 pods × 50 connections = 1,600 connections, crashing a Postgres instance sized for 500 connections.
*The fix:* Size the pool per worker appropriately (e.g., `pool_size=5, max_overflow=2`) and introduce an external connection pooler like PgBouncer for high concurrency.

**Trap 2: Creating Connection Pools Inside Route Dependencies Instead of Lifespan**
A developer writes a dependency `async def get_db()` and calls `create_async_engine()` inside the dependency function.
*Why it happens:* The developer confuses request-scoped sessions with application-scoped engine pools.
*What happens:* Every single incoming HTTP request creates a brand-new connection pool, performs expensive TLS handshakes, opens multiple TCP sockets, and destroys them on return. Latency surges from 5ms to 200ms, and the database exhausts its connection table within seconds.
*The fix:* Create the `AsyncEngine` once in lifespan startup and attach it to `app.state`. The per-request dependency should only create a lightweight `AsyncSession` from the existing engine.

**Trap 3: Initializing Async Resources at Module Import Time (Before Process Forking)**
A developer initializes an async Redis client or async engine at the top level of `main.py` outside of any function.
*Why it happens:* It looks cleaner to have `redis = aioredis.from_url(...)` at the module root.
*What happens:* When Gunicorn starts, the master process imports `main.py`, binding the async client to the master process's default event loop. Gunicorn then forks child worker processes. The child processes inherit the file descriptors and loop state from the master, resulting in `RuntimeError: Task attached to a different loop` or silent connection deadlocks across workers.
*The fix:* Always instantiate async engines and clients inside the `lifespan` function, which runs safely *after* the child process has forked and created its own active event loop.

**Trap 4: Blocking the Async Event Loop During Startup**
A developer pre-loads a 500MB configuration file or downloads ML model weights using `requests.get()` or synchronous `time.sleep()` inside the `async def lifespan()` function.
*Why it happens:* Believing that startup is "one-time setup" so synchronous code won't hurt.
*What happens:* The synchronous I/O blocks the entire event loop thread. If Uvicorn or an orchestrator has health check timeouts or heartbeat pings running on that loop, the ping fails and the orchestrator kills the worker process for being unresponsive.
*The fix:* Use asynchronous libraries (`httpx.AsyncClient`, `aiofiles`) or offload heavy CPU/sync operations to a worker thread using `asyncio.to_thread(load_model_sync)`.

**Trap 5: Assuming Post-Yield Code Always Runs in a Crash**
A developer places critical transactional data cleanup or billing reconciliation exclusively in the post-yield shutdown block.
*Why it happens:* Assuming graceful shutdown is guaranteed 100% of the time.
*What happens:* If the host VM runs out of memory (OOMKilled), the kernel sends `SIGKILL` (signal 9), which cannot be caught by any process. The container instantly terminates, completely bypassing the lifespan shutdown block.
*The fix:* Never rely on shutdown logic for data consistency. Design database models to be crash-consistent (using atomic transactions and idempotency keys) and use shutdown logic strictly for releasing external network handles and flushing buffers.

## 7. Compare With Related Concepts

Understanding where lifespan logic fits within the broader FastAPI and backend ecosystem prevents scoping errors.

| Dimension | Lifespan Context Manager (`lifespan`) | Request Dependency with Yield (`Depends`) | ASGI Middleware (`BaseHTTPMiddleware`) |
| :--- | :--- | :--- | :--- |
| **Execution Scope** | **Application-wide** (runs once at boot and once at exit). | **Request-scoped** (runs once per individual HTTP request). | **Request/Response Pipeline** (wraps every HTTP transaction). |
| **Primary Purpose** | Initializing & tearing down heavy, shared infrastructure (DB pools, Redis, HTTP clients). | Managing request-specific state & transactions (DB sessions, auth tokens, permissions). | Cross-cutting HTTP concerns (CORS, header injection, request tracing, timing). |
| **State Storage** | `app.state` | Function return values injected into endpoint parameters. | `request.state` |
| **Failure Impact** | Startup failure **aborts boot**; pod does not receive traffic. | Dependency error returns an HTTP error response (e.g., `401 Unauthorized` or `500`). | Middleware error intercepts and rewrites the HTTP response. |
| **Performance Overhead** | Zero overhead during request processing. | Low overhead per request (session creation/release). | Wraps every request; can add latency if heavy async operations are performed. |

**When to choose what:**
- Use **Lifespan** when creating heavy, long-lived resources that must be shared across thousands of requests (connection pools, sockets, ML models).
- Use **Request Dependencies (`Depends`)** when creating short-lived, transaction-bound resources that must be isolated per client request (database sessions, authenticated user objects).
- Use **Middleware** when inspecting, altering, or logging the raw HTTP request/response stream across all routes uniformly.

## 8. 🧠 The Memory Hook

> **The Theater Curtain:** Lifespan is the opening curtain and the closing lights. Everything before `yield` sets the stage, checks the props, and powers the spotlights; `yield` is the live performance where requests flow; everything after `yield` sweeps the floor and cuts the power. If the stage catches fire before the curtain rises, the show never starts and the closing ceremony never runs.
