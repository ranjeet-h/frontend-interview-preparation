# Integrating SQLAlchemy 2.0 with FastAPI: Async ORM, Declarative Models, and CRUD Repository Patterns

## 1. Why This Exists — The Problem First

Imagine deploying a brand-new FastAPI service designed to handle 5,000 concurrent requests per second. You write your endpoints as `async def`, feeling confident in Python's asynchronous event loop. Inside the route, you drop in familiar legacy SQLAlchemy code: `db.query(User).filter_by(id=user_id).first()`. Under standard development traffic with one developer, everything works smoothly. 

Then load hits staging. P99 latency suddenly rockets from 15 milliseconds to 14 seconds. The CPU usage sits at barely 8%, yet requests are timing out across the board. 

What went wrong? You used a synchronous database driver (`psycopg2` or standard `sqlite3`) and blocking SQLAlchemy 1.x session methods inside an asynchronous coroutine. Every time a database query runs, it blocks the single-threaded asyncio event loop dead in its tracks. All other 4,999 concurrent requests freeze, waiting for that single database network socket to finish reading bytes.

You attempt a quick fix: you switch to `AsyncSession` with `asyncpg`, run an async `select()`, and return the ORM object to a Pydantic response schema. Immediately, your logs explode with:
`sqlalchemy.exc.MissingGreenlet: greenlet_spawn has not been called; can't call __init__() with this Session in async_fallback_mode`. 

The response schema tried to read `user.orders`. In synchronous code, SQLAlchemy would silently fire a secondary `SELECT` query under the hood (lazy loading). But in asynchronous code, Python property lookups cannot magically perform hidden, un-awaited I/O calls without crashing.

FastAPI combined with modern SQLAlchemy 2.0 exists to eliminate this entire class of bugs: it enforces non-blocking async database operations, provides compile-time type safety via modern `Mapped` declarative models, eliminates hidden lazy-loading crashes through explicit loader strategies, and isolates connection management cleanly using FastAPI's dependency injection system.

## 2. The Analogy — Make It Obvious

Think of a busy, high-end restaurant with an open kitchen:

- **The FastAPI Event Loop** is the executive chef standing at the pass, coordinating hundreds of orders simultaneously.
- **Synchronous Database Calls** are like the executive chef leaving the plating station, walking deep into the walk-in cellar, churning butter by hand for 10 seconds, and walking back. While the chef is away, every single customer ticket in the dining room stops moving.
- **Asynchronous Database Calls (`asyncpg` + `AsyncSession`)** are like the chef clipping an ingredient order ticket onto a pneumatic tube (`await session.execute(...)`) and immediately turning around to sear a steak or garnish a soup for another table. When the pantry runner returns with the ingredients, an alert dings, and the chef resumes that specific dish.
- **Lazy Loading (`MissingGreenlet` Error)** is like handing a plate to a waiter without the side sauce, assuming the waiter can summon sauce out of thin air in the middle of the dining room. In an async kitchen, spontaneous teleportation is forbidden. If the dish needs sauce, the chef must explicitly load the sauce onto the prep tray before it leaves the kitchen counter.
- **Eager Loading (`selectinload` / `joinedload`)** is putting the main dish and all required sides onto the same delivery cart up front, so the waiter never has to walk back to the pantry during service.
- **FastAPI's Request-Scoped Dependency (`yield` session)** is the dedicated prep cart assigned to a single order. When the ticket is finished or cancelled, the porter immediately clears the cart, washes the tools, and returns the station to the pool for the next order.

## 3. How It Actually Works — The Full Explanation

Integrating modern SQLAlchemy 2.0 with FastAPI requires understanding five interconnected layers: the async engine architecture, typed declarative models, the request session lifecycle, explicit relationship loading, and the repository pattern.

```txt
┌────────────────────────────────────────────────────────────────────────┐
│                        FastAPI Request Lifecycle                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                       1. HTTP Request Arrives
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │  FastAPI Dependency: get_db()                           │
       │  - Borrows physical socket from AsyncEngine pool        │
       │  - Yields AsyncSession(expire_on_commit=False)          │
       └────────────────────────────┬────────────────────────────┘
                                    │
                      2. Injects session into Repository
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │  Async Repository Layer                                 │
       │  - Constructs 2.0 Query: select(User).options(...)      │
       │  - Executes via async driver (asyncpg / aiosqlite)      │
       │  - Awaits non-blocking I/O (Event loop serves others)   │
       └────────────────────────────┬────────────────────────────┘
                                    │
                      3. Returns Type-Safe ORM Entity
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │  Route Handler / Pydantic Serialization                 │
       │  - Validates against UserResponse schema                │
       │  - Uses pre-loaded relationships (no MissingGreenlet)   │
       └────────────────────────────┬────────────────────────────┘
                                    │
                      4. HTTP Response Dispatched
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │  Dependency Teardown (finally block)                    │
       │  - Commits or rolls back transaction                    │
       │  - Closes session & returns connection back to pool     │
       └─────────────────────────────────────────────────────────┘
```

### 1. The Modern SQLAlchemy 2.0 Paradigm

In SQLAlchemy 1.x, querying used the query API: `session.query(User).filter(...)`. This mixed querying, execution, and ORM internals into an untyped interface.

SQLAlchemy 2.0 unifies Core and ORM around the executable statement pattern:
- You build a query object using top-level functions: `stmt = select(User).where(User.is_active == True)`.
- You pass that statement explicitly to the async session: `result = await session.execute(stmt)`.
- You extract models using explicit scalar extractors: `users = result.scalars().all()`.

This makes queries pure data structures that can be inspected, cached, composed, and executed asynchronously without implicit hidden behavior.

### 2. The Async Engine and Connection Pooling

The engine manages a pool of raw database socket connections. In an async stack:
- You use an async dialect driver prefix, such as `postgresql+asyncpg://` or `sqlite+aiosqlite:///`.
- You configure `pool_size` (number of persistent sockets) and `max_overflow` (extra connections permitted during traffic spikes).
- `pool_pre_ping=True` is essential: it sends a lightweight `SELECT 1` heartbeat before checking out a connection, preventing 500 errors caused by firewall drops or database restarts killing idle sockets.
- The session maker must be configured with `expire_on_commit=False`. By default, SQLAlchemy expires all model attributes after a `session.commit()`. If you access `user.id` or `user.email` after committing in async code, SQLAlchemy will try to re-query the database synchronously and crash. Setting `expire_on_commit=False` keeps the in-memory data intact after writing.

### 3. Type-Safe 2.0 Declarative Models

Instead of legacy `Column(Integer, primary_key=True)`, SQLAlchemy 2.0 introduces `Mapped[T]` and `mapped_column()`:

```python
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    orders: Mapped[list["Order"]] = relationship(back_populates="user")
```

This design gives static type checkers like Mypy and Pyright complete visibility into your model types. `user.id` is known to be a real Python `int`, not a dynamic `Column` descriptor.

### 4. The Request-Scoped Session Lifecycle (`yield` Dependencies)

Database sessions are unit-of-work trackers. They must **never** be shared across concurrent requests, because:
1. Sessions are not thread-safe or task-safe. Concurrent transactions will corrupt the internal identity map.
2. A rollback in one request would abort an unrelated customer's purchase.

FastAPI solves this with generator dependencies (`yield`):
```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```
When a request begins, FastAPI enters `get_db()`, creates a clean `AsyncSession`, and hands it to the route. When the route completes, execution returns to the generator, committing the transaction and returning the underlying database connection to the pool. If an exception occurs, it rolls back safely.

### 5. Demystifying Relationship Loading in Async

Because Python property lookups like `user.orders` cannot run `await` behind the scenes, you must instruct SQLAlchemy how to fetch relationships at query time:

- **`selectinload` (Recommended for 1-to-Many & Many-to-Many):** Emits two queries. First `SELECT * FROM users WHERE id IN (1, 2)`. Then `SELECT * FROM orders WHERE user_id IN (1, 2)`. It stitches the collections in memory. This avoids multiplying row counts through SQL Cartesian products.
- **`joinedload` (Recommended for Many-to-1 & 1-to-1):** Emits a single `LEFT OUTER JOIN` query. Ideal when fetching a child record that belongs to a single parent (e.g., loading an `Order` and its single `User`).
- **`contains_eager`:** Used when you manually write `.join(User.orders)` in your query for filtering purposes and want SQLAlchemy to populate the `.orders` relationship directly from those already-joined columns instead of issuing a second query.
- **`raiseload('*')`:** A best-practice defensive option. It tells SQLAlchemy to instantly raise an explicit exception if any un-loaded relationship is accessed, catching lazy-loading bugs during development instead of in production.

### 6. The Repository / CRUD Pattern

Directly embedding `select()` and `session.commit()` calls inside route handlers couples your HTTP transport layer to database query logic. 

The Repository Pattern wraps raw database operations behind a domain-focused class:
- Route handlers only care about HTTP parameters, status codes, and returning Pydantic schemas.
- The Repository accepts an `AsyncSession`, builds queries, applies filtering/pagination, handles database-specific exceptions, and returns typed ORM objects.
- This decoupling allows you to mock the database effortlessly during unit testing.

## 4. Real Code — See It Working

Here is a complete, production-ready implementation of FastAPI with modern SQLAlchemy 2.0, demonstrating async connection setup, typed declarative models, explicit eager loading, and the repository pattern.

### Step 1: Database Setup and Connection Management (`database.py`)

```python
from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncAttrs,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = "sqlite+aiosqlite:///./production_sample.db"

# create_async_engine manages the socket pool
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Set to True for debugging SQL statements
    pool_pre_ping=True,  # Test connection health before checkout
)

# expire_on_commit=False prevents MissingGreenlet errors when reading
# attributes on committed objects after session commits
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

# Base class with AsyncAttrs to support async relationship inspection
class Base(AsyncAttrs, DeclarativeBase):
    pass

# FastAPI request-scoped dependency
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

### Step 2: Modern Typed Models (`models.py`)

```python
from datetime import datetime
from sqlalchemy import ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # One-to-many relationship
    orders: Mapped[list["Order"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )

class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    item_name: Mapped[str] = mapped_column(String(200), nullable=False)
    amount_cents: Mapped[int] = mapped_column(nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Many-to-one relationship
    user: Mapped["User"] = relationship(back_populates="orders")
```

### Step 3: Pydantic v2 Schemas (`schemas.py`)

```python
from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr

class OrderCreate(BaseModel):
    item_name: str
    amount_cents: int

class OrderResponse(BaseModel):
    id: int
    item_name: str
    amount_cents: int

    # Allows Pydantic to read directly from SQLAlchemy ORM attributes
    model_config = ConfigDict(from_attributes=True)

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    created_at: datetime
    orders: list[OrderResponse] = []

    model_config = ConfigDict(from_attributes=True)
```

### Step 4: Async Repository Pattern (`repositories.py`)

```python
from collections.abc import Sequence
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from models import Order, User
from schemas import OrderCreate, UserCreate

class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, user_id: int) -> User | None:
        # selectinload prevents MissingGreenlet when serializing user.orders
        stmt = (
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.orders))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_all(self, skip: int = 0, limit: int = 50) -> Sequence[User]:
        stmt = (
            select(User)
            .options(selectinload(User.orders))
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create(self, user_data: UserCreate) -> User:
        user = User(email=user_data.email, full_name=user_data.full_name)
        self.session.add(user)
        await self.session.flush()  # Populates user.id without committing transaction
        await self.session.refresh(user, attribute_names=["orders"])
        return user

    async def add_order(self, user_id: int, order_data: OrderCreate) -> Order:
        order = Order(
            item_name=order_data.item_name,
            amount_cents=order_data.amount_cents,
            user_id=user_id,
        )
        self.session.add(order)
        await self.session.flush()
        return order
```

### Step 5: FastAPI Application and Endpoints (`main.py`)

```python
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from database import Base, engine, get_db_session
from models import User
from repositories import UserRepository
from schemas import OrderCreate, OrderResponse, UserCreate, UserResponse

# Lifespan context to initialize database schema on startup
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()

app = FastAPI(title="FastAPI + SQLAlchemy 2.0 Async", lifespan=lifespan)

# Helper dependency to supply the repository
def get_user_repository(session: AsyncSession = Depends(get_db_session)) -> UserRepository:
    return UserRepository(session)

@app.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_in: UserCreate,
    repo: UserRepository = Depends(get_user_repository),
) -> User:
    existing = await repo.get_by_email(user_in.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )
    return await repo.create(user_in)

@app.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    repo: UserRepository = Depends(get_user_repository),
) -> User:
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found.",
        )
    return user

@app.post("/users/{user_id}/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order_for_user(
    user_id: int,
    order_in: OrderCreate,
    repo: UserRepository = Depends(get_user_repository),
):
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found.",
        )
    return await repo.add_order(user_id, order_in)
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why does SQLAlchemy raise `sqlalchemy.exc.MissingGreenlet` in async FastAPI apps, and what is the exact fix?**

In synchronous Python, accessing an unloaded relationship attribute like `user.orders` triggers an on-demand SQL query (`SELECT * FROM orders WHERE user_id = ?`) synchronously over the socket. 

In asynchronous Python, attribute access (like `user.orders` inside a Pydantic serializer) is fundamentally synchronous syntax. Python does not allow an attribute access operation to pause execution and `await` network I/O unless wrapped in an explicit greenlet context. Because no async event loop await was dispatched, SQLAlchemy throws `MissingGreenlet` to prevent an illegal blocking call.

To fix it, you must eagerly load all required relationships at query time using loader options:
1. Use `.options(selectinload(User.orders))` for 1-to-Many and Many-to-Many relationships.
2. Use `.options(joinedload(Order.user))` for Many-to-1 and 1-to-1 relationships.
3. Configure `raiseload('*')` during testing to catch any missed eager loads early.

---

**Q: Why should `expire_on_commit=False` always be set on an `async_sessionmaker`?**

By default in synchronous SQLAlchemy, `expire_on_commit` is set to `True`. When you call `await session.commit()`, SQLAlchemy marks all object attributes as expired. The next time your code reads `user.id` or `user.email` (for example, when FastAPI converts the return value into JSON via Pydantic), SQLAlchemy discovers the expired state and attempts to emit a refresh `SELECT` query.

In an async session, this spontaneous refresh cannot run asynchronously without an explicit `await session.refresh(user)`. It triggers a `MissingGreenlet` error or crashes because the session has already been closed by the dependency cleanup. Setting `expire_on_commit=False` tells SQLAlchemy to preserve the in-memory cached attributes after committing, allowing safe post-commit serialization.

---

**Q: What is the architectural difference between `selectinload` and `joinedload`? When should you use which?**

`joinedload` performs a SQL `LEFT OUTER JOIN` in a single query. It is best suited for **Many-to-One** and **One-to-One** relationships (such as an `Order` loading its single parent `User`). If you use `joinedload` on a One-to-Many relationship where a user has 100 orders, the database returns 100 rows, duplicating the parent `User` columns across every single row. If you join two different One-to-Many collections, you create a Cartesian product explosion that devastates database memory and network bandwidth.

`selectinload` emits two separate queries:
1. `SELECT * FROM users WHERE id IN (1, 2, 3)`
2. `SELECT * FROM orders WHERE user_id IN (1, 2, 3)`

SQLAlchemy then matches and stitches the order collections into the user objects in Python memory. It avoids Cartesian products entirely and is the standard best practice for **One-to-Many** and **Many-to-Many** collections.

---

**Q: What happens if you run synchronous SQLAlchemy code inside an `async def` route versus a regular `def` route in FastAPI?**

FastAPI inspects route function signatures:
- If a route is declared as `def route_name()`, FastAPI offloads its execution to an internal `anyio` worker threadpool. Synchronous SQLAlchemy queries will block that specific worker thread, but the main asyncio event loop remains responsive.
- If a route is declared as `async def route_name()`, FastAPI executes it directly on the main event loop thread. If you run synchronous SQLAlchemy code (such as `db.query()`), the entire event loop is blocked. No other network requests, health checks, or WebSocket connections can be processed until that synchronous SQL socket read completes.

If you must use synchronous SQLAlchemy, you must declare your route as standard `def`. If you declare `async def`, you must use `AsyncSession` and `await` all database interactions.

---

**Q: How do you mock or override database sessions during FastAPI integration testing?**

FastAPI provides an explicit `dependency_overrides` dictionary on the `app` instance. In your test setup:
1. Create a dedicated test engine using an in-memory SQLite database (`sqlite+aiosqlite:///:memory:`) or a dedicated PostgreSQL test container.
2. Define a test session generator dependency `override_get_db()`.
3. Set `app.dependency_overrides[get_db_session] = override_get_db`.
4. In your test fixtures, wrap each test case in a nested transaction (`connection.begin_nested()`) and roll it back after the test completes. This provides 100% test isolation without the performance penalty of re-creating database tables on every test run.

---

**Q: How does proper connection pooling prevent pool exhaustion under load?**

A connection pool holds a finite number of active database sockets (defined by `pool_size` and `max_overflow`). If incoming request volume exceeds the available pool capacity, subsequent requests must wait up to `pool_timeout` seconds before raising a `TimeoutError`.

To prevent exhaustion:
1. **Always use request-scoped sessions:** Sessions must be yielded inside a `try...finally` block so that connections are guaranteed to be released back to the pool even when an endpoint throws an unhandled exception or a client drops the connection.
2. **Keep transactions short:** Never perform third-party HTTP API calls, image processing, or heavy computations while holding an open database transaction.
3. **Use `pool_pre_ping=True`:** Discards dead socket connections before handing them to a worker, preventing stalled requests.

## 6. The Traps — What Goes Wrong

### 1. The Global Session Singleton Trap
**The Mistake:** Creating a single global `AsyncSession` instance at the module level and importing it across multiple route handlers.
```python
# BROKEN ANTI-PATTERN
global_session = AsyncSession(engine)

@app.get("/users")
async def get_users():
    result = await global_session.execute(select(User))
    return result.scalars().all()
```
**Why it fails:** `AsyncSession` is not concurrency-safe. When multiple requests hit the server simultaneously, they share the exact same transaction state and identity map. One request calling `rollback()` will wipe out another user's pending transaction mid-flight, and data will leak between tenants.
**The Fix:** Always inject sessions using FastAPI's dependency injection system with `Depends(get_db_session)` to ensure each concurrent request receives its own isolated session instance.

---

### 2. The Unhandled Post-Commit Lazy Load Trap
**The Mistake:** Committing a newly created record and immediately trying to access a generated or default field without refreshing.
```python
# BROKEN
user = User(email="test@example.com", full_name="Alice")
session.add(user)
await session.commit()
return user.created_at  # May trigger MissingGreenlet if expired
```
**Why it fails:** If `expire_on_commit=True`, committing expires the object. Accessing `user.created_at` forces a synchronous reload.
**The Fix:** Set `expire_on_commit=False` in `async_sessionmaker`, or explicitly call `await session.refresh(user)` before returning the object.

---

### 3. The Chained Joinedload Cartesian Explosion
**The Mistake:** Applying multiple `joinedload()` calls across several one-to-many relationships in a single query.
```python
# BROKEN: Severe performance degradation
stmt = (
    select(User)
    .options(
        joinedload(User.orders),
        joinedload(User.support_tickets),
        joinedload(User.login_history),
    )
)
```
**Why it fails:** Joining three one-to-many relationships with 10 orders, 10 tickets, and 10 logins produces $1 \times 10 \times 10 \times 10 = 1,000$ rows transferred over the network for a single user record.
**The Fix:** Use `selectinload()` for collections. It emits 4 small, linear queries totaling only 31 rows of data and stitches them cleanly in memory.

---

### 4. Leaking Database Models Directly to the API Contract
**The Mistake:** Returning raw SQLAlchemy ORM model objects directly from endpoints without specifying a Pydantic `response_model`.
**Why it fails:** ORM models contain internal state, database metadata, and sensitive columns (like `hashed_password` or internal audit logs). Furthermore, if FastAPI attempts to serialize relationships that were not eagerly loaded, it will crash with `MissingGreenlet`.
**The Fix:** Define explicit Pydantic response schemas with `model_config = ConfigDict(from_attributes=True)` and set `response_model=UserResponse` on every route.

## 7. Compare With Related Concepts

| Feature / Architecture | SQLAlchemy 2.0 Async ORM | SQLAlchemy Core (Async) | Tortoise ORM | Sync SQLAlchemy (1.4/2.0 Sync) |
| :--- | :--- | :--- | :--- | :--- |
| **Execution Model** | Full Async/Await (`AsyncSession`) | Full Async/Await (`AsyncConnection`) | Native Async (Django-like) | Synchronous / Threadpool blocking |
| **Model Definition** | `Mapped[T]` & `mapped_column()` | `Table()`, `Column()` | `Model` with custom fields | Legacy `Column()` or Modern `Mapped[T]` |
| **Relationship Handling** | Explicit (`selectinload`, `joinedload`) | Manual SQL Joins | Auto/Explicit async fetch | Implicit Lazy Loading (Automatic) |
| **FastAPI Concurrency** | Native non-blocking event loop | Native non-blocking event loop | Native non-blocking event loop | Requires `def` routes & threadpool |
| **Type Safety & Tooling** | Industry-standard Mypy/Pyright | Partial | Moderate | Partial |
| **Ecosystem Maturity** | Extreme (Industry Standard) | Extreme | Moderate | Legacy standard |

### Decision Rules:
1. **Choose SQLAlchemy 2.0 Async ORM** when building production-grade FastAPI microservices that require high concurrency, complex relational schemas, type safety, and clean domain architecture via the Repository pattern.
2. **Choose SQLAlchemy Core** when you need raw query speed for heavy analytical aggregations, bulk ETL operations, or dynamic SQL compilation without ORM mapping overhead.
3. **Choose Sync SQLAlchemy with `def` routes** only when working with legacy codebases or database engines that lack reliable async drivers (such as older Oracle or MSSQL ODBC drivers).

## 8. 🧠 The Memory Hook

> **"Async routes demand async sockets, explicit carts, and clean stations: use `create_async_engine` with `asyncpg` so the event loop never stalls, pack all relationship data up front with `selectinload` so serialization never crashes, and yield every session through a FastAPI dependency so no connection is ever left behind."**
