# How to Create and Configure Database Sessions in SQLAlchemy 2.0

## 1. Why This Exists — The Problem First

Imagine deploying an API that runs smoothly in local tests with 10 users, but crashes within two minutes of your first product launch. The logs fill with `psycopg2.OperationalError: FATAL: remaining connection slots are reserved for non-replication superuser connections`. 

When you inspect the code, you find that a developer placed `engine = create_engine(DATABASE_URL)` inside the route handler or helper function called on every incoming HTTP request. Every single request created a brand-new connection pool, opened fresh TCP sockets to PostgreSQL, and exhausted the database's 100-connection ceiling almost instantly.

The alternative mistake is just as disastrous: another developer tries to "optimize" by instantiating a single global `session = Session(engine)` at the module level and importing it across all route handlers. When two concurrent requests hit the server, Request A begins modifying a user's record, while Request B hits a validation failure and calls `session.rollback()`. Request B's rollback silently destroys Request A's uncommitted transaction, and both requests crash with `InvalidRequestError: This Session's transaction has been rolled back`.

To build reliable backend services, you must separate **connection pooling** (expensive, process-wide, persistent) from **transactional units of work** (lightweight, isolated, short-lived). SQLAlchemy 2.0 provides this separation through the Engine, the Session Factory, and the Session instance.

---

## 2. The Analogy — Make It Obvious

Think of your database access layer as a **Car Rental Agency**:

```txt
┌────────────────────────────────────────────────────────┐
│  The Engine (The Fleet Depot & Parking Lot)            │
│  - Built once when the business opens                  │
│  - Owns the physical cars and keys (Connection Pool)    │
│  - Lives for the entire lifetime of the agency         │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│  sessionmaker (The Rental Desk Policy & Template)      │
│  - Configured once with standard rules                 │
│  - Defines defaults (insurance, fuel rules, cleanup)   │
│  - Creates new contracts on demand                     │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│  Session (The Individual Rental Agreement)             │
│  - Handed to ONE driver for ONE specific trip          │
│  - Checks out a car from the pool when driving starts  │
│  - Records all mileage and stops (Unit of Work)        │
│  - Returns car to the lot and is shredded upon return  │
└────────────────────────────────────────────────────────┘
```

- **The Engine is the Fleet Depot:** It owns the physical cars (database connections), the parking lot (the pool), and the mechanics (connection dialect). Building a new depot takes heavy machinery and land. You build it once at application startup and keep it running.
- **The `sessionmaker` is the Rental Agreement Template:** It defines the default contract parameters (e.g., auto-inspection enabled, return rules). It does not hold a car itself; it produces standardized rental contracts on demand.
- **The `Session` is an Individual Rental Agreement:** It is handed to a single customer for a single trip (one HTTP request). It grabs a car from the depot only when the driver turns the ignition key (the first database query), tracks everything that happens on that trip (Identity Map and Unit of Work), returns the car to the lot when done, and gets shredded (closed).

Two drivers never share the same rental contract, and the agency never bulldozes and rebuilds its parking lot for every customer.

---

## 3. How It Actually Works — The Full Explanation

SQLAlchemy 2.0 organizes database access into three distinct layers: the **Engine**, the **Session Factory**, and the **Session**.

### The Three-Tier Architecture

1. **The Global Engine (`create_engine` / `create_async_engine`):**
   - Instantiated once per application process at startup.
   - Manages the underlying DBAPI driver (such as `psycopg`, `asyncpg`, or `sqlite3`) and maintains the connection pool (`QueuePool`).
   - The Engine does not represent an active transaction or an open connection in your Python code. It is a conduit and pool manager.
2. **The Session Factory (`sessionmaker` / `async_sessionmaker`):**
   - A configurable factory class that standardizes how sessions are created across your application.
   - Stores fixed parameters such as the bound engine, transaction flushing behavior, and object expiration rules.
   - Calling the factory produces a brand-new `Session` or `AsyncSession` instance configured with those defaults.
3. **The Session (`Session` / `AsyncSession`):**
   - An in-memory workspace implementing the **Unit of Work** and **Identity Map** patterns.
   - **Identity Map:** Ensures that within a single session, querying the same primary key multiple times returns the exact same Python object instance in memory, preventing duplicate conflicting object states.
   - **Unit of Work:** Accumulates pending inserts, updates, and deletes in memory. It tracks dirty attributes and flushes them to the database in a single coordinated SQL transaction when required.
   - **Connection Lifecycle:** The session does not hold a database connection when created. It checks out a connection from the Engine's pool lazily—only when the first SQL statement is executed—and holds that connection until the transaction commits, rolls back, or the session closes.

```txt
HTTP Request Arrives
       │
       ▼
Session Created (No connection checked out yet)
       │
       ▼
First Query Executed ──► Checks out Connection from Engine Pool
       │
       ▼
Unit of Work (Track changes, query models, stage inserts)
       │
       ▼
Commit / Rollback ──► Flushes SQL, ends DB transaction
       │
       ▼
Session Closed ──► Returns Connection to Pool, clears Identity Map
```

---

### Critical Session Configuration Flags

When configuring `sessionmaker` or `async_sessionmaker`, three flags define how the session behaves:

#### 1. `bind=engine`
Binds the factory to the specific engine managing your target database. All sessions produced by this factory will check out connections from this engine's pool.

#### 2. `expire_on_commit=False`
In SQLAlchemy 1.x, the default behavior was to mark all model attributes as "expired" immediately after `session.commit()`. The next time your code accessed `user.email`, SQLAlchemy emitted a transparent `SELECT` query to refresh the data from the database.

In modern applications—especially asynchronous frameworks like FastAPI—`expire_on_commit=True` causes severe runtime bugs:
- If a route commits a transaction and returns an ORM model to FastAPI's Pydantic response serializer, accessing attributes on an expired model outside the active transaction triggers `MissingGreenlet: await_only() can only be called from a greenlet context` or `sqlalchemy.orm.exc.DetachedInstanceError`.
- Setting `expire_on_commit=False` leaves the committed in-memory attributes intact on the Python object. You can safely read attributes, serialize models to JSON, and pass objects across function boundaries without triggering unexpected database queries.

#### 3. `autoflush=True`
When `autoflush=True` (the default), the session automatically issues a `flush()` (sending pending `INSERT`, `UPDATE`, and `DELETE` statements to the database within the current uncommitted transaction) before executing any subsequent `SELECT` query.

This guarantees that queries always see the latest state of pending in-memory modifications. For example, if you create a new `User(id=42)` and then immediately execute `session.scalars(select(User).where(User.id == 42))`, autoflush writes the user to the database transaction first so the query successfully finds the row.

---

### Contextual Sessions: WSGI vs ASGI Lifecycle

How sessions are scoped depends on whether your server is synchronous (WSGI like Flask) or asynchronous (ASGI like FastAPI):

| Framework Paradigm | Session Management Strategy | Mechanism |
|---|---|---|
| **Sync / WSGI (Flask, Django)** | `scoped_session` or Request Teardown | Uses thread-local storage (`threading.local`) to associate one session per OS thread. |
| **Async / ASGI (FastAPI, Starlette)** | Dependency Injection with Generator | Creates a fresh `AsyncSession` per request via `async with`, yielding it to route handlers and closing it in cleanup. |

In ASGI applications, an asynchronous request can pause at `await` and resume execution on a completely different worker thread from the thread pool. Because threads are shared dynamically among coroutines, **`scoped_session` based on thread-local storage is unsafe in async Python**. Instead, dependency injection tied to the request lifecycle is the standard pattern.

---

## 4. Real Code — See It Working

### Pattern 1: Production Async SQLAlchemy 2.0 with FastAPI

Here is the complete, modern async session setup used in production FastAPI services:

```python
# database.py
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import String, select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

DATABASE_URL = "postgresql+asyncpg://app_user:secret_pass@localhost:5432/production_db"

# 1. Global Engine: Configured ONCE per application process
engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    echo=False,               # Set True only in local debugging for SQL logging
    pool_size=10,             # Keep up to 10 persistent connections in pool
    max_overflow=20,          # Allow up to 20 additional surge connections
    pool_timeout=30,          # Fail if a connection cannot be acquired in 30s
    pool_pre_ping=True,       # Test connection liveness before checkout (avoids stale sockets)
)

# 2. Global Session Factory: Pre-configured factory for producing AsyncSession instances
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autoflush=True,           # Auto-flush in-memory mutations before queries
    expire_on_commit=False,   # Critical for FastAPI: keeps attributes readable after commit
)

# 3. Base ORM Model
class Base(DeclarativeBase):
    pass

class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255))

# 4. Dependency Injection: Request-scoped session generator
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields a dedicated AsyncSession per request
    and guarantees rollback on error and proper resource cleanup.
    """
    async with async_session_factory() as session:
        try:
            yield session
            # If the route handler completes without raising, we can commit or leave it to handler
        except Exception:
            await session.rollback()
            raise
        finally:
            # session.close() is automatically called by the 'async with' context manager,
            # returning the checked-out connection back to the engine's connection pool.
            pass
```

```python
# main.py
# 5. Pydantic Schemas
class UserCreate(BaseModel):
    username: str
    email: str

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str

# 6. Application Lifespan: Manage Engine Startup and Shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: e.g., verify connectivity or run lightweight readiness checks
    yield
    # Shutdown: Cleanly dispose of connection pool connections
    await engine.dispose()

app = FastAPI(lifespan=lifespan)

# 7. Route Handlers using Session Dependency
@app.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db_session),
):
    # Check for existing user
    stmt = select(UserModel).where(UserModel.username == payload.username)
    result = await db.scalars(stmt)
    if result.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already registered",
        )

    new_user = UserModel(username=payload.username, email=payload.email)
    db.add(new_user)
    await db.commit()
    # Because expire_on_commit=False, new_user.id, new_user.username, and new_user.email
    # are accessible in memory without triggering lazy-load queries during serialization.
    return new_user

@app.get("/users/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    stmt = select(UserModel).where(UserModel.id == user_id)
    user = (await db.scalars(stmt)).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user
```

---

### Pattern 2: Synchronous SQLAlchemy 2.0 Unit of Work

For synchronous batch workers, background tasks, or scripts, use the context manager pattern directly:

```python
# sync_worker.py
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

SYNC_DATABASE_URL = "postgresql+psycopg://app_user:secret_pass@localhost:5432/production_db"

sync_engine = create_engine(
    SYNC_DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    bind=sync_engine,
    autoflush=True,
    expire_on_commit=False,
)

def transfer_credits(sender_id: int, recipient_id: int, amount: int) -> None:
    # Use session.begin() to manage the transaction boundary automatically:
    # It issues a COMMIT on successful block exit, or ROLLBACK if an exception is raised.
    with SessionLocal() as session:
        with session.begin():
            sender = session.get(UserModel, sender_id)
            recipient = session.get(UserModel, recipient_id)

            if not sender or not recipient:
                raise ValueError("Sender or recipient not found")

            # Perform business logic...
            # Database flush and commit happen cleanly at the end of the with block.
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: How do you create and configure database sessions in SQLAlchemy 2.0?**

You follow a strict three-step factory pattern:
1. Initialize an `Engine` or `AsyncEngine` globally once per application process using `create_engine()` or `create_async_engine()`. This holds the connection pool and dialect configuration.
2. Initialize a session factory globally using `sessionmaker()` or `async_sessionmaker()`, passing `bind=engine`, `autoflush=True`, and `expire_on_commit=False`.
3. In request handlers or background tasks, instantiate short-lived sessions per unit of work using context managers (`with SessionLocal() as session:` or `async with async_session_factory() as session:`) or framework dependency injection.

This guarantees connection pooling efficiency while keeping transactions completely isolated per request.

---

**Q: What is the exact difference between `create_engine()`, `sessionmaker()`, and `Session()`?**

- `create_engine()` builds the infrastructure layer: it creates an `Engine` instance that manages the physical database connection pool and handles SQL dialect compilation. It knows nothing about ORM models, identity maps, or transactions.
- `sessionmaker()` is a factory function that produces a callable class. It pre-records session configuration settings so you do not have to repeat boilerplate configuration parameters every time you need a session.
- `Session()` is an individual instance produced by the factory. It manages a single logical transaction, tracks in-memory object states (dirty, clean, deleted, new), maintains the Identity Map, and checks out connections from the engine on demand.

---

**Q: Why is `expire_on_commit=False` critical when using SQLAlchemy with FastAPI and async drivers?**

By default, SQLAlchemy expires all attributes on committed objects, replacing their in-memory values with expired markers so the next read triggers a fresh `SELECT` from the database. 

In FastAPI, route handlers commit transactions and return ORM objects directly to FastAPI for Pydantic serialization. If `expire_on_commit=True`, reading attributes during serialization occurs after the database transaction has ended. In synchronous code, this causes hidden N+1 queries. In asynchronous code (`AsyncSession`), triggering lazy-load I/O outside of an explicit `await` call raises `MissingGreenlet: await_only() can only be called from a greenlet context` or `DetachedInstanceError`. Setting `expire_on_commit=False` preserves all committed attributes in memory, allowing safe serialization without extra database round-trips.

---

**Q: How does `autoflush` work, and what happens if you turn it off?**

`autoflush=True` instructs the session to automatically send all pending in-memory changes to the database (via SQL `INSERT`/`UPDATE`/`DELETE`) within the current open transaction immediately before executing any `select()`, `get()`, or raw query.

If you disable autoflush (`autoflush=False`), queries executed within the session will only see data that was previously flushed or committed. For instance, if you add a new model instance to the session and run a query filtering for that model's unique field without manually calling `session.flush()`, the query will return `None` because the database has not received the pending `INSERT` statement yet.

---

**Q: Why is `scoped_session` unsafe in async frameworks like FastAPI, and what replaces it?**

`scoped_session` relies on thread-local storage (`threading.local`) to map one active session to the current OS thread. 

In asynchronous frameworks running on ASGI servers (like Uvicorn), coroutines yield control whenever they await I/O. When the coroutine resumes, the event loop may schedule it on a different worker thread. Because coroutines share and hop between threads, thread-local storage creates cross-request state leakage, race conditions, and corrupted session states. 

FastAPI replaces `scoped_session` with **Dependency Injection**: a generator function (`get_db`) instantiates a new `AsyncSession` using an `async with` block, yields it to the specific request handler coroutine, and closes it when the request response finishes.

---

**Q: When does a Session actually check out a connection from the Engine pool, and when does it release it?**

The Session uses **lazy connection checkout**. When you instantiate `session = SessionLocal()`, zero database connections are acquired. 

The session only checks out a connection from the Engine's connection pool when it executes its first SQL statement (a `select()`, a manual `flush()`, or executing a raw statement). The session retains this checked-out connection for the duration of the transaction. When the transaction is completed (via `commit()` or `rollback()`) or when the session is closed via `session.close()`, the connection is returned back to the Engine's pool for other requests to reuse.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Creating Engines Inside Request Handlers (Connection Pool Explosion)

**The Mistake:**
Calling `create_engine()` inside route handlers or dependency functions:

```python
# ❌ BROKEN: Creates a new engine and connection pool on every HTTP request!
async def get_db():
    engine = create_async_engine(DATABASE_URL)
    async_session = async_sessionmaker(bind=engine)
    async with async_session() as session:
        yield session
```

**Why it fails:**
Each call to `create_async_engine()` allocates a new connection pool with its own min/max limits. None of these engines share state. Under moderate traffic, hundreds of uncoordinated connection pools are created, exhausting database connection limits in seconds and causing `Too many connections` errors.

**The Fix:**
Create `engine` and `async_sessionmaker` once at module level or during application lifespan startup.

---

### Trap 2: Sharing a Global Session Across Concurrent Requests (State Corruption)

**The Mistake:**
Creating one global `Session` instance and importing it everywhere:

```python
# ❌ BROKEN: Global session instance shared across all concurrent requests
engine = create_async_engine(DATABASE_URL)
global_session = AsyncSession(engine)

@app.get("/items")
async def read_items():
    return await global_session.scalars(select(Item))
```

**Why it fails:**
`Session` is strictly **not thread-safe or coroutine-safe**. Concurrent requests will mutate the same Identity Map, issue overlapping transactions, and roll back each other's state. When one request fails, its rollback terminates active queries in all other concurrent requests.

**The Fix:**
Always instantiate one fresh session per request or task using dependency injection or context managers.

---

### Trap 3: `DetachedInstanceError` from Expired Attributes

**The Mistake:**
Leaving `expire_on_commit=True` (the default in some legacy setups) and attempting to serialize or read model fields after the session closes:

```python
# ❌ BROKEN: Accessing expired attributes outside the session
async def get_user_name(user_id: int):
    async with async_session_factory() as session:
        user = await session.get(UserModel, user_id)
        await session.commit()
    # Session is now closed!
    return user.username  # 💥 Raises DetachedInstanceError or MissingGreenlet
```

**Why it fails:**
When `session.commit()` expires the object, accessing `user.username` attempts to trigger a lazy reload query. But the session is closed and the connection has been returned to the pool, making reload impossible.

**The Fix:**
Configure your session factory with `expire_on_commit=False` so attribute values stay in memory.

---

### Trap 4: Forgetting to Close Sessions on Exceptions (Connection Leaks)

**The Mistake:**
Creating sessions manually without a context manager or `try...finally` block:

```python
# ❌ BROKEN: Connection leaks if an exception occurs before close()
async def process_order(order_data):
    session = async_session_factory()
    order = OrderModel(**order_data)
    session.add(order)
    await session.commit()
    # If an exception happens above, session.close() NEVER runs!
    await session.close()
```

**Why it fails:**
If an exception occurs during `commit()`, the function exits immediately. The session is abandoned in an open state, holding onto its checked-out database connection and unreleased table/row locks until Python's garbage collector runs. The connection pool eventually starves.

**The Fix:**
Always use `async with async_session_factory() as session:` or `with SessionLocal() as session:`.

---

### Trap 5: Confusing `session.flush()` with `session.commit()`

**The Mistake:**
Calling `commit()` when you only needed database-generated primary keys, or calling `flush()` thinking data is permanently saved:

```python
# ❌ MISCONCEPTION: Calling commit prematurely during a multi-step operation
async with async_session_factory() as session:
    user = UserModel(name="Alice")
    session.add(user)
    await session.commit()  # Premature! Transaction is finalized.
    
    # If the payment step below fails, the user is already committed permanently!
    await charge_payment(user.id)
```

**Why it fails:**
`commit()` finalizes the transaction permanently. If a subsequent step in your business logic fails, you cannot roll back the earlier `commit()`.

**The Fix:**
Use `await session.flush()` if you need the database to execute `INSERT` and populate autoincremented IDs or server defaults without ending the transaction. Call `await session.commit()` only once at the end of the entire unit of work.

---

## 7. Compare With Related Concepts

| Concept A | Concept B | Key Difference | When to Use Which |
|---|---|---|---|
| **`Engine`** | **`Session`** | The Engine is a long-lived connection pool manager for the entire process; the Session is a short-lived transactional workspace for one request. | Use `Engine` once per process to manage database connectivity; use `Session` once per request to execute queries and mutations. |
| **`sessionmaker`** | **`Session`** | `sessionmaker` is a factory class that stores default configuration; `Session` is the actual instance that talks to the database. | Use `sessionmaker` once to define your application's session policies; call the factory to create active `Session` instances. |
| **`session.flush()`** | **`session.commit()`** | `flush()` sends SQL to the database within the current open transaction; `commit()` permanently writes changes and closes the transaction. | Use `flush()` when you need generated IDs or to trigger constraints mid-transaction; use `commit()` when the entire unit of work succeeds. |
| **`scoped_session`** | **FastAPI `Depends(get_db)`** | `scoped_session` binds sessions to OS threads (`threading.local`); `Depends(get_db)` binds sessions to async request coroutines. | Use `scoped_session` in multi-threaded synchronous WSGI apps (Flask); use `Depends(get_db)` in async ASGI apps (FastAPI). |
| **`expire_on_commit=True`** | **`expire_on_commit=False`** | `True` expires object attributes after commit (forcing re-query on access); `False` keeps loaded attributes in memory. | Keep `True` only in legacy sync apps wanting strict fresh reads; set `False` in FastAPI, async apps, and API backends returning serialized models. |

---

## 8. 🧠 The Memory Hook

> **The Engine is the power plant (build once per city), `sessionmaker` is the wiring blueprint, and the `Session` is your workbench for a single job.**  
>
> Never build a new power plant for every customer request, and never let two workers touch the same workbench at the same time. Open it, do the work, commit or roll back, and close it.
