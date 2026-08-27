# How to Prevent Database Session Leaks in FastAPI: Generator Lifecycles, Context Managers, and Pool Auditing

## 1. Why This Exists — The Problem First

It is 2:00 PM on a Friday. Your team deploys a new feature, and traffic looks completely normal for the first fifteen minutes. Then, out of nowhere, API latency spikes to thirty seconds across every single route. Seconds later, your monitoring dashboard lights up in red as every endpoint starts throwing HTTP 500 errors:

`TimeoutError: QueuePool limit of size 20 overflow 10 reached, connection timed out, timeout 30.00`

You check the database server. CPU usage is sitting at 2%, memory is fine, and disk I/O is practically zero. But when you inspect PostgreSQL activity with `SELECT count(*), state FROM pg_stat_activity GROUP BY state;`, all thirty allowed connection slots are occupied. Every single one is stuck in `idle in transaction` or `idle`.

What happened? A newly added endpoint threw an unhandled validation error halfway through its database work, or a mobile client disconnected while an async query was in-flight. Because the database session was created without a guaranteed cleanup mechanism, the session never closed. It held onto the underlying TCP socket connection, preventing it from returning to SQLAlchemy's connection pool. Within twenty minutes of steady production traffic, every available connection was locked up by dead requests, starving all other routes and bringing the entire backend down.

Database session leaks are silent killers. They do not crash your application immediately. Instead, they slowly drain your connection pool until your service falls off a cliff. Understanding session lifecycles, generator dependencies, and pool auditing is the only way to build resilient, leak-proof backend systems.

## 2. The Analogy — Make It Obvious

Think of a busy tool rental shop:

The **Connection Pool** is the shop's storage rack. It holds a fixed number of expensive power tools (say, 20 drills). Physical socket connections to a database are expensive to open and close, so the shop maintains a fixed set of ready-to-use tools.

The **Database Session** (`AsyncSession` or `Session`) is the rental clipboard agreement. It is not the physical drill itself; it is the active contract that borrows a specific drill from the rack to perform a job, tracks what changes were made, and manages the return.

The **FastAPI Request Lifecycle** is a contractor walking in to do a job. When the contractor arrives, FastAPI's dependency injection system visits the checkout counter (`Depends(get_db)`), checks out a drill from the rack, hands it to the worker, and lets them work.

Now, imagine what happens if you rely on the contractor to remember to walk back to the counter and hand the tool back when they are done. If the contractor finishes their work smoothly, they hand the tool back. But what if the contractor trips, injures themselves, or gets evacuated because of a fire alarm (an unhandled exception or a dropped client connection)? The worker vanishes, leaving the drill lying abandoned on the construction site floor. 

The shop still thinks the drill is in active use. After twenty contractors drop their drills and vanish, the shop's rack is completely bare. The next customer who walks in stands at the counter waiting thirty seconds until they give up and leave in frustration.

The **Bulletproof Generator Pattern** is an automatic spring-loaded tether attached to the drill. The moment the contractor leaves the workstation—whether they walked out happy, stormed out angry, or were carried out on a stretcher—the spring mechanism snaps the drill right off the floor, cancels any pending adjustments, and places it safely back on the rack.

## 3. How It Actually Works — The Full Explanation

To eliminate leaks, you have to understand the distinction between a database connection pool, an ORM session, and FastAPI's generator lifecycle.

### The Leak Anatomy: Pool Sockets vs ORM Sessions

A database engine maintains a pool of physical TCP connections (such as SQLAlchemy's `QueuePool`). Establishing a raw TCP connection with TLS handshakes and authentication to PostgreSQL or MySQL takes tens of milliseconds. The pool keeps a pool of open sockets alive so requests can check them out in microseconds.

An ORM session (`AsyncSession`) is a logical unit of work. When you instantiate a session, it does not immediately grab a physical connection. Instead, the moment you run your first query (`session.execute(...)`), the session checks out a socket from the pool and starts a transaction (`BEGIN`).

If code execution finishes without calling `session.close()` or `session.rollback()`:
- The session object is eventually garbage collected by Python, but the underlying socket remains checked out in the pool.
- On PostgreSQL, the server process remains in state `idle in transaction`. Any table or row locks acquired during the request remain active, blocking other queries and preventing autovacuum from cleaning dead tuples.
- The connection pool counter increments its checkout count. Once `pool_size + max_overflow` is reached, the pool blocks all subsequent checkouts. When the `pool_timeout` expires, the pool raises an error.

### FastAPI Dependency Injection Lifecycle with `yield`

FastAPI supports Python generator functions inside its dependency injection system (`Depends`). When a dependency uses `yield` instead of `return`, FastAPI integrates it into an asynchronous exit stack (built on Starlette's request lifecycle).

Here is the step-by-step sequence of an HTTP request using a generator dependency:

1. **Setup Phase (Before `yield`):** FastAPI enters the generator function. It creates an `AsyncSession` instance from the session factory.
2. **Yielding to the Route:** The generator yields the session object. FastAPI pauses the generator's execution state and passes the session into your route handler parameters.
3. **Route Execution:** Your route handler runs business logic, queries the database, commits changes, or prepares a response.
4. **Teardown Phase (After `yield`):** Once the route handler finishes and the HTTP response is serialized, FastAPI resumes the generator right after the `yield` statement. 
5. **Exception and Disconnect Propagation:** If the route handler raises an unhandled exception, FastAPI sends that exception back into the generator at the point of `yield` using `generator.athrow()`. If the generator wraps the `yield` inside a `try...finally` block, the cleanup code in `finally:` is guaranteed to execute.

### Client Disconnections and `asyncio.CancelledError`

In asynchronous Python (ASGI with Uvicorn or Hypercorn), when a user cancels an HTTP request (such as closing their browser tab or losing cell signal), the ASGI server cancels the underlying `asyncio.Task`.

Canceling a task raises an `asyncio.CancelledError` inside the running coroutine. In Python 3.8 and newer, `CancelledError` inherits from `BaseException`, not `Exception`. 

If your dependency uses a standard `except Exception:` block, it will not catch `CancelledError`. However, a `finally:` block catches everything—including `BaseException` and `CancelledError`. Wrapping your session in a `try...finally` or an `async with` context manager ensures that even when a client disconnects mid-query, the session rolls back and closes immediately.

### Connection Pool Auditing and Metrics

You cannot fix what you do not measure. SQLAlchemy engines provide real-time pool inspection methods:

- `engine.pool.size()`: The configured baseline pool size.
- `engine.pool.checkedin()`: The number of connections currently idle and available in the pool.
- `engine.pool.checkedout()`: The number of connections currently in active use by open sessions.
- `engine.pool.overflow()`: The number of temporary connections created above the baseline pool size (up to `max_overflow`).

In a healthy application, `checkedout` mirrors the number of concurrently executing database queries. If `checkedout` climbs steadily over time while active request concurrency is low, your application has a session leak.

## 4. Real Code — See It Working

Here is the complete, production-ready implementation of an asynchronous SQLAlchemy engine, a bulletproof session generator, a route handler, a safe background task, and a pool health monitoring endpoint.

### Database Engine and Bulletproof Generator (`database.py`)

```python
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/production_db"

# 1. Create the async engine with sensible pool limits and pre-ping
engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,          # Base number of connections kept open
    max_overflow=10,       # Allow up to 10 extra connections during load spikes
    pool_timeout=30.0,     # Seconds to wait for a connection before raising TimeoutError
    pool_recycle=1800,     # Recycle connections every 30 min to drop dead TCP sockets
    pool_pre_ping=True,    # Test connections with 'SELECT 1' before checkout
    echo=False,
)

# 2. Session factory: expire_on_commit=False prevents lazy-load errors after commit
async_session_maker = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

# 3. The Bulletproof Dependency
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency yielding a request-scoped database session.
    Guarantees rollback on error and proper closure on success,
    unhandled exceptions, or client disconnects.
    """
    async with async_session_maker() as session:
        try:
            yield session
        except Exception:
            # If the route raises an error, roll back all pending operations
            await session.rollback()
            raise
        finally:
            # finally runs even on asyncio.CancelledError or unhandled BaseException
            await session.close()
```

### Route Handlers and Background Task Isolation (`main.py`)

```python
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from pydantic import BaseModel
from database import get_db, async_session_maker, engine

app = FastAPI(title="Leak-Proof API")

class UserCreate(BaseModel):
    email: str
    username: str

# Safe Request-Scoped Endpoint
@app.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    # If this query fails or an error is raised, get_db's finally block closes the session
    query = text("INSERT INTO users (email, username) VALUES (:email, :username) RETURNING id")
    result = await db.execute(query, {"email": payload.email, "username": payload.username})
    await db.commit()
    user_id = result.scalar_one()
    return {"id": user_id, "email": payload.email}

# Background Task Function: Never pass request-scoped 'db' here!
async def log_user_activity(user_id: int, action: str):
    """
    Background tasks execute AFTER the HTTP response is sent.
    The request's get_db dependency has already closed its session.
    Background tasks must manage their own standalone session lifecycle.
    """
    async with async_session_maker() as session:
        try:
            audit_query = text(
                "INSERT INTO audit_logs (user_id, action) VALUES (:user_id, :action)"
            )
            await session.execute(audit_query, {"user_id": user_id, "action": action})
            await session.commit()
        except Exception:
            await session.rollback()
            # Log error in production monitoring
        finally:
            await session.close()

@app.post("/users/{user_id}/action")
async def trigger_action(
    user_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    # Enqueue background task with primitive parameters, not the request's db session
    background_tasks.add_task(log_user_activity, user_id, "LOGIN_ACTION")
    return {"status": "action recorded"}

# Connection Pool Metrics Endpoint for Observability
@app.get("/health/db-pool")
async def db_pool_health():
    """
    Expose connection pool metrics to Prometheus or health monitors.
    """
    pool = engine.pool
    return {
        "pool_size": pool.size(),
        "checked_in_available": pool.checkedin(),
        "checked_out_active": pool.checkedout(),
        "overflow_active": pool.overflow(),
        "total_active_connections": pool.checkedout() + max(0, pool.overflow()),
    }
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the exact sequence of events when a database session leaks in FastAPI?**

A database session leak happens when an ORM session checks out a raw connection from the engine's pool to execute a query, but never calls `session.close()` or `session.rollback()` before being discarded. 

When a query is run, SQLAlchemy's session checks out a socket and issues a `BEGIN` statement to the database. If the route throws an unhandled error or completes without closing the session, the socket remains checked out in the pool. On PostgreSQL, this socket enters the `idle in transaction` state. The database holds open table/row locks, and the pool cannot reassign the socket to another request. Over time, as more unclosed sessions accumulate, all connections in `pool_size` plus `max_overflow` become occupied. When new requests arrive, they wait for `pool_timeout` (default 30 seconds), fail to acquire a socket, and crash with a pool exhaustion timeout error.

**Q: Why does `yield` in a dependency guarantee cleanup whereas regular functions or manual cleanup fails?**

When you define a FastAPI dependency with `yield`, FastAPI wraps the execution of that dependency inside an asynchronous exit stack (`AsyncExitStack`). The code before `yield` runs before your endpoint is invoked. The yielded value is injected into the endpoint. 

Regardless of whether the endpoint returns a normal response, raises an `HTTPException`, throws an unexpected `RuntimeError`, or is canceled because the client disconnected, Starlette's exception handling and exit stack guarantee that execution returns to the generator after the `yield`. When wrapped in a `try...finally` block, the `finally:` clause is guaranteed by the Python runtime to execute before control leaves the stack frame, ensuring the session is closed under every possible outcome.

**Q: What happens if a client disconnects mid-flight, and how does that affect database sessions?**

When a client drops its connection (such as closing a browser window or switching networks on a phone), ASGI servers like Uvicorn detect the broken socket and cancel the running Python `asyncio.Task`. Canceling an `asyncio.Task` raises `asyncio.CancelledError` inside the executing coroutine.

Because `asyncio.CancelledError` inherits from `BaseException` rather than standard `Exception` in modern Python, any error-handling block that only catches `except Exception:` will completely miss it. If cleanup is written inside an `except Exception:` block without a `finally:`, the cleanup will never run. By using `try...finally` or `async with`, the `finally` block runs during task cancellation unwinding, rolling back the aborted transaction and returning the socket to the pool immediately.

**Q: Why is passing a request-scoped `db` session into FastAPI `BackgroundTasks` an anti-pattern?**

FastAPI executes `BackgroundTasks` after the HTTP response has been sent to the client. Because the response has already been delivered, FastAPI's dependency injection system has already executed the post-yield teardown of `get_db()`, closing the request-scoped session.

If a background task tries to use that same session, it will raise an error like `ResourceClosedError: This session is closed` or attempt to execute queries on an unmanaged connection. Furthermore, if the background task executes asynchronously while teardown is occurring, it creates a race condition where multiple coroutines access the same non-thread-safe session. Background tasks must always create their own independent session using `async with async_session_maker() as session:`.

**Q: How do you monitor and diagnose session leaks in a production environment?**

Diagnosing session leaks requires monitoring at both the application level and the database level:

At the application level, export SQLAlchemy pool metrics using `engine.pool.checkedin()`, `engine.pool.checkedout()`, and `engine.pool.overflow()` to Prometheus or Datadog. In a healthy system, `checkedout` drops back to baseline when traffic subsides. If `checkedout` continuously trends upward regardless of traffic, a leak is present.

At the database level, query PostgreSQL's system catalog:
```sql
SELECT pid, usename, client_addr, state, query_start, state_change - query_start AS duration, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;
```
If you see numerous connections with state `idle in transaction` whose queries started minutes or hours ago, you have unclosed sessions holding open transactions.

**Q: Does enabling `pool_pre_ping=True` in SQLAlchemy prevent session leaks?**

No. `pool_pre_ping=True` (also known as pessimistic disconnect handling) only detects stale or closed connections before handing them to a session. When a session asks the pool for a connection, `pool_pre_ping` issues a lightweight `SELECT 1` query to verify that the database server or firewall has not severed the socket. If the connection is dead, the pool discards it and creates a fresh one.

However, `pool_pre_ping` only runs when a connection is *checked out* from the pool. It does nothing to recover connections that were checked out and never returned due to a session leak.

## 6. The Traps — What Goes Wrong

### Trap 1: Using `return` Instead of `yield` in Dependencies

A developer creates a database dependency like this:

```python
# BROKEN: Never do this
async def get_db():
    session = async_session_maker()
    return session
    await session.close()  # Unreachable code!
```

Because `return` immediately exits the function, the cleanup code below `return` never executes. The session is returned to the route, the route finishes, and the session is left floating unclosed in memory until garbage collection. Every single request leaks a connection.

**The Fix:** Always use `yield` surrounded by `try...finally` or `async with`.

### Trap 2: Catching `Exception` and Swallowing Teardown

```python
# BROKEN: Does not handle BaseException or CancelledError properly
async def get_db():
    session = async_session_maker()
    try:
        yield session
        await session.commit()
    except Exception as e:
        await session.rollback()
        # Missing finally! If CancelledError occurs, close() never runs
        await session.close()
```

If an `asyncio.CancelledError` occurs, it bypasses `except Exception:`. The session is never rolled back or closed, leaving an open transaction on the database.

**The Fix:** Place `await session.close()` inside an unconditional `finally:` block or use `async with async_session_maker() as session:`.

### Trap 3: Passing Request Sessions to Background Tasks

```python
# BROKEN: Race condition and use-after-free
@app.post("/orders")
async def place_order(
    order_data: OrderSchema,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    order = await create_order(db, order_data)
    # Passing the request-scoped 'db' to a background task
    background_tasks.add_task(send_order_email, order.id, db)
    return {"status": "ok"}
```

As soon as `return {"status": "ok"}` executes, FastAPI completes the request and runs `get_db`'s `finally: await session.close()`. When `send_order_email` starts running half a second later, `db` is already closed.

**The Fix:** Pass only IDs or raw values to background tasks, and have the background task instantiate its own session using `async with async_session_maker() as session:`.

### Trap 4: Creating Database Sessions in Middleware Without `finally`

Developers often create sessions in custom middleware to record request logs or authenticate API tokens:

```python
# BROKEN: Leaks if call_next raises an unhandled error
@app.middleware("http")
async def db_session_middleware(request: Request, call_next):
    session = async_session_maker()
    request.state.db = session
    response = await call_next(request)  # If this raises an exception...
    await session.close()                # ...this line is skipped!
    return response
```

If any route handler or downstream middleware raises an exception that is not caught before reaching the middleware, `await session.close()` is skipped.

**The Fix:** Always wrap `call_next` in a `try...finally` block inside middleware:

```python
@app.middleware("http")
async def db_session_middleware(request: Request, call_next):
    async with async_session_maker() as session:
        request.state.db = session
        try:
            response = await call_next(request)
            return response
        finally:
            await session.close()
```

Better yet, avoid opening database sessions in middleware altogether. Use dependencies (`Depends`) so that database access is explicit and cleanly scoped to the endpoints that actually require it.

## 7. Compare With Related Concepts

### `AsyncSession` (ORM Unit of Work) vs `Engine / QueuePool` (Connection Pool)
- **`AsyncSession`:** A lightweight, request-scoped Python object representing a single logical transaction or unit of work. It manages identity maps, dirty object tracking, and pending changes.
- **`QueuePool`:** A long-lived, application-wide pool of physical OS-level TCP socket connections to the database server.
- **Rule of Thumb:** You create and destroy hundreds of `AsyncSession` instances per second; you keep a single `Engine` and `QueuePool` alive for the entire lifespan of the application process.

### FastAPI `yield` Dependency vs Python `@asynccontextmanager`
- **FastAPI `yield` Dependency:** Specifically designed for HTTP request lifecycles. FastAPI pauses the generator during route execution and guarantees post-yield execution when the HTTP response completes or an error occurs.
- **`@asynccontextmanager`:** Standard Python decorator for defining `async with` blocks. Ideal for background workers, CLI scripts, or standalone utility functions where no HTTP request lifecycle exists.
- **Rule of Thumb:** Use `yield` dependencies for route handlers; use `async with async_session_maker()` context managers for background tasks, Celery jobs, and cron scripts.

### Connection Pool Exhaustion vs Database Deadlock
- **Connection Pool Exhaustion:** A client-side / application-side bottleneck where all socket slots in SQLAlchemy's pool are checked out and unavailable. The database itself may have plenty of idle capacity.
- **Database Deadlock:** A server-side conflict where two concurrent transactions hold locks on rows that the other transaction needs to proceed, causing the database engine to abort one transaction.
- **Rule of Thumb:** If requests hang for 30 seconds before failing with `QueuePool limit reached`, it is pool exhaustion; if queries fail instantly with `deadlock detected`, it is a lock ordering issue in SQL.

## 8. 🧠 The Memory Hook

**"Sessions are clipboards, pools are drills, and `finally` is the bungee cord."**

Every request borrows a drill using a clipboard session. If you don't tether the drill with a `try...finally` generator, a single dropped request leaves the tool on the floor until the entire shop runs out of tools.

