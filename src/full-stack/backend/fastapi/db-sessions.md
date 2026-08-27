# Database Sessions in FastAPI: `AsyncSession`, Connection Pooling, and Scoped Dependency Injection

## 1. Why This Exists — The Problem First

Imagine deploying a high-throughput FastAPI application where an engineer initialized a single global database session at the top of the file: `db = AsyncSession(engine)`. In local development with one test request at a time, every endpoint returned `200 OK`. 

The moment the application faced concurrent production traffic, everything collapsed. User A sent a checkout request to buy an item. Concurrently, User B initiated a password reset. Because both async coroutines shared the same global `AsyncSession` instance, User B's operations attached directly to User A's uncommitted transaction. When User B's token validation failed and triggered a rollback, User A's checkout vanished from the transaction. Worse, when User A committed, unverified changes from User B were permanently written to the database.

When the team attempted a quick fix by instantiating `db = AsyncSession(engine)` directly inside each route function without automated lifecycle cleanup, an unhandled exception before `await db.close()` leaked the underlying socket. Within twenty minutes, the connection pool was completely starved. Every subsequent HTTP request hung indefinitely until the database rejected all traffic with `FATAL: remaining connection slots are reserved for non-replication superuser connections`.

FastAPI's scoped dependency injection paired with SQLAlchemy's `AsyncSession` lifecycle exists to solve both problems: it guarantees that every incoming HTTP request receives its own isolated unit of work that borrows a connection from a shared pool, executes safely, and releases its resources back to the pool the moment the response leaves the server—even if the handler crashes.

## 2. The Analogy — Make It Obvious

Think of a busy bank with a master vault, a security key tray, and personal consultation clipboards:

- **The Database Engine (`create_async_engine`)** is the bank's vault door and security infrastructure. You construct it once when the bank opens for business (application startup). It defines the location of the vault, the dialect spoken, and the security rules.
- **The Connection Pool (`QueuePool`)** is a security desk holding a fixed tray of master keys (e.g., 20 regular keys and 10 overflow keys). Forging a brand-new physical TCP socket over TLS with database authentication is like cutting a brass key from raw metal—expensive, slow, and resource-heavy. So the bank pre-forges a fixed set of keys and keeps them in the tray ready for immediate checkout.
- **The `AsyncSession`** is a private consultation clipboard handed to each customer (each HTTP request) when they walk through the door:
  1. The customer records their pending changes on their private clipboard (the session's in-memory Identity Map and state tracker).
  2. When the customer actually needs to read or write data inside the vault, the teller borrows a brass key from the tray (checks out a connection from the pool), performs the read or write, and records the pending changes.
  3. When the consultation ends, the customer signs off on all their changes at once (`commit`) or tears up the slip (`rollback`).
  4. The clipboard is shredded (`session.close()`), and the brass key is wiped clean and placed back in the tray for the next customer in line.

If you forced all customers in the lobby to scribble on a single shared clipboard, their deposits and withdrawals would overwrite each other. If customers walked out the door with the brass keys in their pockets, the key tray would be empty within minutes and the bank would grind to a halt.

## 3. How It Actually Works — The Full Explanation

**The Architectural Layers: Engine vs. Pool vs. Session**

Understanding database management in FastAPI requires separating three distinct components:

1. **Engine (`create_async_engine`):** The long-lived singleton representing the database connectivity definition. It binds the connection string (e.g., `postgresql+asyncpg://...`), the async driver, and the connection pool. You create one engine for the entire lifetime of your application process.
2. **Connection Pool (`QueuePool` / `AsyncAdaptedQueuePool`):** The manager of persistent, open TCP sockets to the database server. Instead of opening a new TCP connection per HTTP request (which adds 20–100ms of latency per query), the pool maintains active connections ready for reuse. Its core tuning parameters are:
   - `pool_size`: The steady-state number of persistent connections held open.
   - `max_overflow`: The maximum number of temporary connections created during traffic bursts above `pool_size`. Total peak capacity is `pool_size + max_overflow`.
   - `pool_timeout`: The number of seconds a request will wait for an available connection before raising a timeout error.
   - `pool_recycle`: The maximum age in seconds of a connection before it is recycled. This prevents firewalls or cloud load balancers from silently terminating idle TCP sockets.
   - `pool_pre_ping=True`: Emits a lightweight `SELECT 1` heartbeat test before handing an idle connection to a session. If the socket was silently severed, the pool discards it and reconnects seamlessly.
3. **`AsyncSession`:** The short-lived unit-of-work container. It maintains an **Identity Map** (caching loaded ORM objects by primary key so the same database row maps to a single Python object in memory), tracks pending object changes (dirty, new, deleted), manages transaction boundaries, and checks out a connection from the pool only when SQL queries are executed.

**The Request Lifecycle via FastAPI `yield` Dependencies**

FastAPI uses Python's asynchronous generator mechanism (`yield`) to manage request-scoped dependencies. Here is the step-by-step execution flow:

```txt
Incoming HTTP Request
       │
       ▼
1. FastAPI invokes dependency: `get_db_session()`
       │  - `async_session_factory()` instantiates an `AsyncSession`
       │  - Enters `async with` context manager
       ▼
2. `yield session` suspends generator; injects session into Route Handler
       │
       ▼
3. Route Handler executes:
       │  - Executes queries (`await db.execute(...)`)
       │  - Checks out a connection from the Pool on demand
       │  - Modifies ORM objects & calls `await db.commit()`
       ▼
4. Route Handler returns data -> FastAPI serializes Pydantic response model
       │
       ▼
5. Execution resumes after `yield` in `get_db_session()`
       │  - `async with` exits
       │  - `await session.close()` is called
       │  - Any uncommitted dirty state is rolled back
       │  - Physical connection is returned to the Connection Pool
       ▼
HTTP Response Sent to Client
```

If an unhandled exception or an `HTTPException` occurs inside the route handler, FastAPI propagates the error into the generator at the `yield` statement. The surrounding `try...except` or context manager catches it, rolls back the transaction, and executes the `finally` block to return the connection safely to the pool.

**Why `expire_on_commit=False` is Mandatory in Async Python**

In synchronous SQLAlchemy, calling `session.commit()` expires all attributes on loaded ORM instances by default so that subsequent access fetches fresh data from the database. In sync code, accessing `user.email` after commit transparently issues a synchronous SQL query behind the scenes.

In asynchronous Python, synchronous I/O inside the event loop is strictly forbidden. SQLAlchemy's async extension runs inside a greenlet runner. When FastAPI attempts to serialize an ORM instance into a Pydantic schema *after* `await db.commit()`, reading `user.email` attempts a lazy-load on an expired attribute. Because there is no active `await` expression during attribute access, SQLAlchemy crashes with:

```text
sqlalchemy.exc.MissingGreenlet: greenlet_spawn has not been called; can't call await_only() here
```

Setting `expire_on_commit=False` on `async_sessionmaker` tells SQLAlchemy to keep the in-memory Python attributes intact after committing. This allows Pydantic and route handlers to read properties instantly without triggering un-awaited lazy queries.

## 4. Real Code — See It Working

**1. Database Infrastructure (`database.py`)**

```python
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = "postgresql+asyncpg://app_user:secret_pass@localhost:5432/app_db"

# Engine manages connection pooling across the entire application lifetime
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=10,          # Base number of persistent connections
    max_overflow=20,       # Burst capacity during traffic spikes
    pool_timeout=30.0,     # Max wait time for a connection before failing
    pool_recycle=1800,     # Recycle connections every 30 minutes
    pool_pre_ping=True,    # Test connections with a heartbeat before use
)

# Sessionmaker produces request-scoped AsyncSession instances
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # CRITICAL: Prevents MissingGreenlet during serialization
    autocommit=False,
    autoflush=False,
)

class Base(DeclarativeBase):
    """Base declarative class for all SQLAlchemy ORM models."""
    pass

async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields a request-scoped AsyncSession.
    Guarantees session closure and connection release on request completion.
    """
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

**2. Models and Schemas (`models.py`, `schemas.py`)**

```python
# models.py
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from database import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(100), unique=True)
    is_active: Mapped[bool] = mapped_column(default=True)

# schemas.py
from pydantic import BaseModel, ConfigDict, EmailStr

class UserCreate(BaseModel):
    username: str
    email: EmailStr

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # Enables reading SQLAlchemy ORM objects

    id: int
    username: str
    email: str
    is_active: bool
```

**3. Route Handlers with Scoped Dependency (`main.py`)**

```python
from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db_session
from models import User
from schemas import UserCreate, UserResponse

app = FastAPI(title="User Service")

@app.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db_session),
):
    # Check for existing user in isolated transaction
    query = select(User).where(User.username == payload.username)
    result = await db.execute(query)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already registered",
        )

    new_user = User(
        username=payload.username,
        email=payload.email,
    )
    db.add(new_user)
    
    # Commit persists changes; expire_on_commit=False keeps attributes loaded
    await db.commit()
    
    # Returning new_user directly serializes into UserResponse safely
    return new_user
```

**4. Integration Testing with Dependency Overrides (`test_main.py`)**

```python
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from main import app
from database import Base, get_db_session

# Dedicated in-memory SQLite engine for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
test_session_factory = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def override_get_db_session():
    async with test_session_factory() as session:
        yield session

# Swap production dependency with test dependency
app.dependency_overrides[get_db_session] = override_get_db_session

@pytest.mark.asyncio
async def test_create_user_success():
    # Setup clean schema in memory
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/users",
            json={"username": "alice", "email": "alice@example.com"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["username"] == "alice"
        assert data["id"] is not None

    # Teardown schema
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does FastAPI manage request-scoped database sessions using dependency injection with `yield`?**

FastAPI leverages Python asynchronous generator functions as context managers. When a route depends on `get_db_session` via `Depends()`, FastAPI executes the code preceding the `yield` statement before entering the endpoint handler. This instantiates an `AsyncSession` bound to the engine.

The session object is yielded to the route handler. Once the route handler completes and the response is formatted, FastAPI resumes generator execution immediately after `yield`. The surrounding `finally` block or `async with` exit logic executes `await session.close()`. This rolls back any uncommitted dirty state and returns the checked-out database connection back to the connection pool. If an unhandled exception occurs inside the handler, FastAPI re-raises it inside the generator at the `yield` point, ensuring error-handling blocks can roll back the transaction before closing.

**Q: Why is `expire_on_commit=False` essential when using `AsyncSession` with FastAPI and Pydantic?**

By default, SQLAlchemy expires all attributes on loaded ORM instances upon calling `session.commit()`. When attributes expire, the next time Python reads any attribute (like `user.username`), SQLAlchemy issues an implicit query to refresh the data from the database.

In FastAPI endpoints, after calling `await session.commit()`, the route handler returns the ORM instance to FastAPI so Pydantic can serialize it into JSON. When Pydantic accesses the model's attributes, SQLAlchemy detects that the attributes are expired and attempts to refresh them. However, Pydantic's attribute access is synchronous and occurs outside of an `await` call. Because async SQLAlchemy cannot perform synchronous I/O on the asyncio event loop, it raises a `sqlalchemy.exc.MissingGreenlet` error. Setting `expire_on_commit=False` keeps the loaded data cached in memory post-commit, enabling Pydantic to read attributes cleanly without triggering lazy loads.

**Q: What is the architectural difference between an Engine, a Connection Pool, and an `AsyncSession`?**

The **Engine** is a long-lived application-wide singleton that holds the database URL, driver dialect, and execution configuration. It owns the **Connection Pool**, which maintains a pool of open, persistent physical TCP sockets (`asyncpg` connections) to eliminate the overhead of repeated TCP/TLS handshakes.

The **`AsyncSession`** is a short-lived, request-scoped unit of work. It does not own a dedicated database connection. Instead, an `AsyncSession` holds an in-memory Identity Map and tracks modifications to ORM objects. It only checks out a physical connection from the Connection Pool when it needs to emit SQL statements (via `execute()`, `flush()`, or `commit()`), and releases that connection back to the pool once the transaction or session completes.

**Q: How do you properly size the SQLAlchemy connection pool when deploying with multi-worker ASGI servers like Uvicorn / Gunicorn?**

A common production failure occurs when developers configure `pool_size=20` and `max_overflow=10` on an engine and then deploy Uvicorn with 8 worker processes. Because each worker process is an independent OS process with its own separate Python memory space and SQLAlchemy engine, each worker creates its own connection pool.

The total maximum connections to the database equals:

$$\text{Total Max Connections} = \text{Worker Processes} \times (\text{pool\_size} + \text{max\_overflow})$$

With 8 workers, $8 \times (20 + 10) = 240$ potential connections. If PostgreSQL is configured with `max_connections = 100`, a traffic surge will exhaust database connection slots and crash the application. Sizing requires dividing the database's available connection budget (minus administrative reserves) across the number of worker processes, or placing an external connection pooler like **PgBouncer** in front of PostgreSQL.

**Q: Should database commits happen inside the route handler, the service layer, or the dependency itself?**

Commits should happen explicitly in the service layer or route handler, never automatically inside the `yield` dependency. A database session represents a transaction boundary. If the dependency automatically commits on exit, any handler that partially executed business logic before failing validation or raising an `HTTPException` risks committing incomplete or invalid state.

The correct architectural pattern is:
1. The dependency provides the session and guarantees cleanup/rollback on failure.
2. The service layer executes business logic, performs validations, and calls `await db.commit()` only when the entire business transaction succeeds.
3. The dependency's exit block ensures `await session.close()` runs, which issues an implicit `ROLLBACK` if no commit occurred.

**Q: How do you mock or override the database session dependency during automated integration tests?**

FastAPI provides the `app.dependency_overrides` dictionary specifically for testing. In your test setup:
1. Create a separate test engine (such as an in-memory SQLite async engine `sqlite+aiosqlite:///:memory:` or a dedicated test PostgreSQL database).
2. Define a test session generator `override_get_db_session`.
3. Set `app.dependency_overrides[get_db_session] = override_get_db_session`.

When your test client executes HTTP requests against the FastAPI app, FastAPI resolves `get_db_session` to your test generator instead of the production database provider, running tests with complete isolation and speed.

## 6. The Traps — What Goes Wrong

**Trap 1: The Shared Module-Level Session Singleton**

- **The Wrong Assumption:** Creating a single `db = AsyncSession(engine)` at the module level saves memory and avoids the overhead of instantiating sessions per request.
- **Why It's Wrong:** `AsyncSession` is not thread-safe or coroutine-safe. It maintains an internal mutable Identity Map and a single active transaction state.
- **What Happens:** When multiple concurrent requests run on the event loop, their queries share the same transaction. One request's rollback destroys another request's pending writes. Concurrent flushes produce race conditions and corrupted data.
- **The Fix:** Always use FastAPI's dependency injection (`Depends(get_db_session)`) to provide a fresh, isolated session per HTTP request.

**Trap 2: `MissingGreenlet` and `DetachedInstanceError` from Lazy Loading / Default Expiration**

- **The Wrong Assumption:** Leaving `expire_on_commit` at its default value (`True`) because "fresh data is always better."
- **Why It's Wrong:** When `commit()` expires attributes, accessing any field during Pydantic response serialization triggers a synchronous lazy-load. Async SQLAlchemy cannot run synchronous database I/O inside asyncio without an explicit greenlet context.
- **What Happens:** The route completes successfully, but FastAPI crashes with `sqlalchemy.exc.MissingGreenlet: greenlet_spawn has not been called; can't call await_only() here` right as it tries to return the HTTP response.
- **The Fix:** Always pass `expire_on_commit=False` when calling `async_sessionmaker(...)`. For relationship attributes, explicitly use eager loading (`selectinload` or `joinedload`).

**Trap 3: Connection Pool Starvation via Long-Running Async Tasks Holding Sessions**

- **The Wrong Assumption:** Passing the request's `db` session directly into an async background task (`BackgroundTasks.add_task(send_welcome_email_and_audit, db)`).
- **Why It's Wrong:** The HTTP request finishes and triggers the dependency cleanup, closing the session and returning the connection to the pool while the background task is still running. Alternatively, if the session is kept open, a slow network call (e.g., sending an email or calling a third-party webhook) holds a physical database connection checkout for seconds.
- **What Happens:** The background task crashes with `InterfaceError: connection is closed`, or pool connections remain checked out during external HTTP calls, causing `TimeoutError: QueuePool limit reached`.
- **The Fix:** Never pass request-scoped sessions to background tasks. Background tasks must create their own independent session using `async with async_session_factory() as session:`, and database operations should be executed strictly before or after long external HTTP calls.

**Trap 4: Multiplied Pool Limit Exceeding Database Capacity**

- **The Wrong Assumption:** Setting `pool_size=20` and `max_overflow=10` in code and running Gunicorn with 16 Uvicorn workers on a standard database tier.
- **Why It's Wrong:** Each worker process creates an isolated SQLAlchemy engine and pool. 16 workers $\times$ 30 connections = 480 connections.
- **What Happens:** During a traffic surge, PostgreSQL runs out of connection slots (`max_connections` exceeded) and starts refusing connections to all services, including health checks and migrations.
- **The Fix:** Calculate connection pool size based on: `(db_max_connections - reserved_connections) // num_workers`. For large worker counts, set small pools (`pool_size=3`, `max_overflow=2`) and deploy **PgBouncer** for transaction-level connection multiplexing.

**Trap 5: Relying on Implicit Rollback on Errors Without Handling Nested Transactions**

- **The Wrong Assumption:** Assuming that catching an exception inside a route handler allows you to continue using the same session to write an audit log or error record.
- **Why It's Wrong:** Once a SQL statement fails inside a database transaction (e.g., unique key violation), PostgreSQL marks the entire transaction as aborted.
- **What Happens:** Any subsequent query on that session fails with `InternalError: current transaction is aborted, commands ignored until end of transaction block`.
- **The Fix:** When an error occurs, explicitly call `await db.rollback()` before issuing any new queries on the session, or use nested transactions via `async with db.begin_nested():` (SQL savepoints).

## 7. Compare With Related Concepts

**`AsyncSession` vs. Raw Database Connection (`asyncpg.Connection`)**

| Feature | `AsyncSession` (SQLAlchemy) | Raw Connection (`asyncpg.Connection`) |
|---|---|---|
| **Abstraction Level** | High-level ORM and Unit of Work | Low-level direct socket driver |
| **State Tracking** | Identity Map, change tracking, object states | Stateless; executes raw SQL strings only |
| **Overhead** | Slight CPU overhead for ORM mapping | Near-zero overhead, fastest possible execution |
| **Type Safety** | Rich static typing via SQLAlchemy 2.0 `Mapped` | Returns raw records or dictionaries |
| **When to Choose** | Standard API business logic, domain models, relationships | High-throughput batch ingestion, analytics aggregations |

**Rule of Thumb:** Use `AsyncSession` for standard CRUD, complex domain models, and relational updates. Reach for raw `asyncpg` connections only when micro-benchmarking raw SQL throughput on bulk ingestion pipelines.

**Request-Scoped Dependency (`yield`) vs. HTTP Middleware Session Management**

| Dimension | Scoped Dependency (`yield`) | HTTP Middleware |
|---|---|---|
| **Granularity** | Scoped only to routes that declare `Depends(get_db_session)` | Runs unconditionally on every single HTTP request |
| **Performance** | Static routes, health checks, and cached endpoints touch zero DB resources | Wastes connection pool checkouts on health checks and static files |
| **Testing** | Easy to override per route with `dependency_overrides` | Requires global middleware mocking or conditional bypasses |
| **Error Handling** | Natural integration with FastAPI exception handlers | Runs outside FastAPI's route exception context |

**Rule of Thumb:** Always manage database sessions with FastAPI's `yield` dependencies. Never manage database sessions inside global HTTP middleware.

**Async SQLAlchemy (`asyncpg`) vs. Sync SQLAlchemy (`psycopg2`) in Threadpools**

| Dimension | Async SQLAlchemy (`asyncpg`) | Sync SQLAlchemy (`psycopg2`) in Threadpool |
|---|---|---|
| **Event Loop Integration** | Native non-blocking I/O on the main asyncio loop | Offloaded to `anyio` worker threadpool via `def` route |
| **Memory Footprint** | Extremely low; thousands of concurrent coroutines per worker | Limited by thread stack sizes and threadpool thread count |
| **Code Complexity** | Requires `await` on every query, `async_sessionmaker`, no sync lazy-loads | Standard Python syntax; supports synchronous lazy loading |
| **When to Choose** | High-concurrency I/O-bound modern microservices | Legacy codebases, CPU-bound tasks, or drivers lacking async support |

**Rule of Thumb:** For new FastAPI microservices, use Async SQLAlchemy (`asyncpg`). If working with third-party sync-only database drivers, declare route handlers as standard `def` functions so FastAPI offloads them to a threadpool.

## 8. 🧠 The Memory Hook

**The Engine is the Bank Vault (built once), the Pool is the Key Tray (shared brass keys), and the `AsyncSession` is the Customer's Clipboard (one per request, shredded at the exit). Never let customers share a clipboard, and always set `expire_on_commit=False` so you don't chase expired numbers when handing them their receipt.**
