# Production FastAPI Project Structure: Architecture, Clean Architecture, and Scalable Layouts

## 1. Why This Exists — The Problem First

Starting a new project in FastAPI feels almost effortless. In fewer than forty lines inside a single `main.py` file, you can define a Pydantic model, spin up an `@app.post("/orders")` endpoint, connect an inline database session, commit a row, and return JSON. The interactive Swagger docs render immediately, requests succeed with sub-millisecond response times, and the entire team celebrates how quickly the prototype shipped.

Then twelve months pass. The application expands to 60,000 lines of code across fifteen engineers, supporting fifty database tables and dozens of third-party integrations.

That same `main.py` file has now fragmented into several sprawling, thousand-line router files where every endpoint function is a dense, tangled mess. In a single route handler, the code parses HTTP headers, decodes JWT tokens, queries the database with complex raw joins, executes discount calculation rules, makes outbound HTTP calls to Stripe, triggers email background tasks, and directly mutates ORM objects.

When a codebase reaches this state, production grinds to a halt:
- **Unit testing is virtually impossible:** You cannot test whether a discount calculation works without spinning up a live test database and mocking the entire FastAPI `Request` object and HTTP transport layer.
- **Database schema leaks into public APIs:** Handlers return raw database entities. When a backend engineer renames a database column or adds an internal field like `password_hash` or `stripe_customer_id`, it immediately leaks into public API responses, breaking frontend clients or exposing sensitive data.
- **Circular import deadlocks crash the server:** As modules import helpers, models, and routers from one another in an ad-hoc web, Python's import system deadlocks, crashing Uvicorn on startup with cryptic `ImportError: cannot import name ... from partially initialized module` errors.
- **Database transactions fracture:** If an endpoint needs to create an order, decrement inventory, and log an audit entry, but each helper function manages its own database session and auto-commits midway, a failure during payment leaves corrupted, half-persisted data in the database.

A disciplined, layered architecture exists to solve this exact collapse. It creates strict boundaries between HTTP transport, domain business rules, and database persistence so that each layer can evolve, be refactored, and be tested in total isolation.

## 2. The Analogy — Make It Obvious

Think of a production FastAPI architecture as a **high-end commercial restaurant kitchen**.

A restaurant does not function by having one person take an order at the front desk, run back to the freezer, butcher a steak, sauté vegetables, wash the dishes, and charge the customer's credit card. That approach collapses the moment more than three customers walk through the door. Instead, the kitchen divides responsibilities into specialized stations with strict communication protocols:

- **The Front of House & Waitstaff (`app/api/` and `app/schemas/`):** The waiter greets guests at the table, hands them a standardized menu, takes their order, checks that the items exist and are formatted properly, and handles the billing. The waiter speaks "customer language" (HTTP status codes, JSON request/response bodies). The waiter never cooks the food, never handles raw butchery, and never enters the walk-in freezer.
- **The Executive Chef (`app/services/`):** The chef stands in the center of the kitchen and receives the standardized order ticket from the waiter. The chef enforces the kitchen's recipes and culinary rules: how long to age the meat, what combinations are allowed, when to apply a promotional discount, and the exact sequence of preparation. The chef does not care whether the order came from a VIP dine-in table, a takeaway app, or a phone call. The business rules remain identical regardless of the channel.
- **The Pantry Manager & Line Cooks (`app/repositories/` or `app/crud/`):** When the chef needs ingredients, they do not dig through the warehouse themselves. They turn to the pantry manager and say: "Give me cut #12 ribeye for table 4." The pantry manager knows exactly where the meat is stored, how the cold storage operates, and how to query the physical inventory.
- **The Storage Bins & Cold Vaults (`app/models/`):** This is the physical inventory layout—the raw crates, shelves, and containers where data lives on disk. In software, these are your SQLAlchemy ORM entities representing tables and foreign key constraints.
- **The Utility Grid (`app/core/` and `app/dependencies/`):** The water pipes, gas lines, electricity, and sanitation stations that supply every station with power and clean tools. In FastAPI, this is your configuration management, security utilities, database connection pools, and dependency injection providers (`get_db`, `get_current_user`).

The golden rule of the kitchen is **unidirectional flow**: Waiters talk to Chefs, Chefs talk to Pantry Managers, and Pantry Managers access Storage. If a waiter bypasses the chef, sprints into the walk-in freezer, fries raw beef on a prep station, and hands it directly to a customer, the kitchen descends into chaos.

## 3. How It Actually Works — The Full Explanation

A production FastAPI application organizes code into distinct architectural layers where dependencies flow in a single direction: from the outer transport layer down to the inner domain and data layers. 

### The Standard Production Directory Layout

In enterprise Python codebases, the standard layout separates concerns by layer while grouping domain routers logically:

```text
my_fastapi_app/
├── alembic/                         # Database schema migrations
│   ├── versions/
│   └── env.py
├── app/
│   ├── __init__.py
│   ├── main.py                      # Application factory, middleware, exception handlers, router inclusion
│   ├── core/                        # Application-wide singletons and primitives
│   │   ├── __init__.py
│   │   ├── config.py                # Pydantic BaseSettings (environment variables, secrets, DB URLs)
│   │   ├── database.py              # SQLAlchemy async engine, session factory, base class
│   │   ├── security.py              # Password hashing (argon2/bcrypt), JWT creation & verification
│   │   └── exceptions.py            # Custom domain exception classes
│   ├── dependencies/                # Reusable FastAPI dependency injection providers
│   │   ├── __init__.py
│   │   ├── auth.py                  # get_current_user, require_admin, permissions
│   │   └── database.py              # get_db session generator yielding AsyncSession
│   ├── models/                      # SQLAlchemy ORM declarative models (database table definitions)
│   │   ├── __init__.py              # Re-exports all models for Alembic auto-discovery
│   │   ├── base.py                  # Common base class with ID and timestamp mixins
│   │   ├── user.py                  # UserModel
│   │   └── order.py                 # OrderModel, OrderItemModel
│   ├── schemas/                     # Pydantic validation & serialization models (DTOs)
│   │   ├── __init__.py
│   │   ├── common.py                # PaginationParams, StandardResponse envelope
│   │   ├── user.py                  # UserCreate, UserUpdate, UserRead, UserInDB
│   │   └── order.py                 # OrderCreate, OrderUpdate, OrderRead, OrderSummary
│   ├── repositories/                # Data Access Layer (CRUD and direct database queries)
│   │   ├── __init__.py
│   │   ├── base.py                  # Generic base repository with standard CRUD methods
│   │   ├── user_repository.py       # UserRepository (queries on UserModel)
│   │   └── order_repository.py      # OrderRepository (complex joins, aggregates on OrderModel)
│   ├── services/                    # Pure Domain & Business Logic Layer
│   │   ├── __init__.py
│   │   ├── user_service.py          # Registration, password reset, account verification
│   │   ├── order_service.py         # Checkout orchestration, stock checks, discount rules
│   │   └── payment_service.py       # External Stripe/payment gateway client wrapper
│   └── api/                         # Presentation Layer (HTTP Controllers / Route handlers)
│       ├── __init__.py
│       ├── router.py                # Top-level API router merging all versioned sub-routers
│       └── v1/
│           ├── __init__.py
│           ├── api.py               # Aggregates endpoints under /api/v1 prefix
│           └── endpoints/
│               ├── __init__.py
│               ├── auth.py          # /login, /refresh, /logout
│               ├── users.py         # /users endpoints
│               └── orders.py        # /orders endpoints
├── tests/
│   ├── conftest.py                  # Pytest fixtures (async test engine, client, auth tokens)
│   ├── unit/                        # Fast unit tests for services with mocked repositories
│   ├── integration/                 # Repository and database query tests against real DB
│   └── e2e/                         # HTTP endpoint tests using httpx.AsyncClient
├── pyproject.toml                   # Project metadata and dependencies
├── .env.example                     # Environment template
└── Dockerfile
```

### Deep Dive: Responsibilities of Each Layer

**1. The Presentation Layer (`app/api/`):**
Routers serve as thin HTTP controllers. Their sole responsibility is to translate HTTP concerns into Python domain calls. A router endpoint parses path parameters, query strings, and JSON request bodies (validated automatically via Pydantic schemas), invokes dependencies to authenticate the caller, calls the appropriate method on a Service, and returns a Pydantic schema with an explicit HTTP status code. Routers must never contain SQL queries, raw ORM manipulation, or complex calculations.

**2. The Data Transfer Objects (`app/schemas/`):**
Pydantic schemas define the strict contract between the outside world and the FastAPI application. They validate incoming data before it ever touches business logic and serialize outgoing responses before they leave the server. By maintaining distinct schemas for creation (`OrderCreate`), updating (`OrderUpdate`), and reading (`OrderRead`), the internal database schema remains fully decoupled from the public API shape.

**3. The Business Logic Layer (`app/services/`):**
Services encapsulate pure business rules. A service coordinates operations across multiple repositories, calculates pricing or tax rules, initiates payment requests via third-party SDKs, and enforces business invariants (such as "an order cannot be cancelled if it has already shipped"). Crucially, services are completely protocol-agnostic: they never import FastAPI `Request`, `Response`, or `HTTPException` objects. If a rule fails, the service raises a plain domain exception (e.g., `InsufficientStockError`).

**4. The Data Access Layer (`app/repositories/`):**
Repositories isolate database query mechanics from business rules. A repository accepts an active database session (`AsyncSession`) and executes SQLAlchemy queries, filtering, joining, and ordering records. If the underlying persistence layer changes—such as migrating a query from a relational table to a Redis cache or changing SQLAlchemy query syntax—only the repository file changes. Services remain completely untouched.

**5. The Persistence Models (`app/models/`):**
SQLAlchemy ORM models define the physical database schema: table names, column data types, foreign keys, indexes, and relationship cascades. They represent the data at rest in PostgreSQL or MySQL.

**6. Core Infrastructure & Dependencies (`app/core/` and `app/dependencies/`):**
`core/` manages global application configuration using `pydantic-settings`, reading environment variables into a strongly typed `Settings` object, and sets up database connection engines. `dependencies/` defines FastAPI dependency functions that yield database sessions per request, extract and verify JWT tokens from `Authorization` headers, and enforce role-based access control.

### The Strict Dependency Flow Rule

Data and control flow in a strict, irreversible hierarchy:

```text
HTTP Request
    │
    ▼
[ app/api/ ] (Routers / Controllers)
    │  Uses schemas for request parsing
    ▼
[ app/services/ ] (Pure Business Logic)
    │  Orchestrates domain rules & external APIs
    ▼
[ app/repositories/ ] (Data Access Layer)
    │  Executes SQLAlchemy queries on sessions
    ▼
[ app/models/ ] (ORM Entities / Database Tables)
    │
    ▼
PostgreSQL / MySQL Database
```

**The Non-Negotiable Flow Invariants:**
1. **`api` may import from `services`, `schemas`, `dependencies`, and `core`.** `api` must never import `repositories` or execute queries on `models` directly.
2. **`services` may import from `repositories`, `models`, `schemas`, and `core`.** `services` must never import `api` or FastAPI HTTP constructs (`HTTPException`, `Request`, `Response`, `Depends`).
3. **`repositories` may import from `models`, `schemas`, and `core`.** `repositories` must never import `services` or `api`.
4. **`models` must never import anything from outer layers.** They only depend on SQLAlchemy base classes and Python standard types.

Following this unidirectional rule completely eliminates circular imports, ensures clear ownership of code, and makes unit testing effortless.

## 4. Real Code — See It Working

Let us trace a production feature—creating a customer order with inventory validation and coupon discounts—across every architectural layer.

### Layer 1: The Database Model (`app/models/order.py`)

```python
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class OrderModel(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), index=True, nullable=False)
    item_sku: Mapped[str] = mapped_column(String(64), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
```

### Layer 2: The Pydantic Schemas (`app/schemas/order.py`)

```python
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field

class OrderCreate(BaseModel):
    # Strict validation on inbound request payload
    item_sku: str = Field(..., min_length=3, max_length=64, description="Stock keeping unit")
    quantity: int = Field(..., gt=0, le=100, description="Quantity must be between 1 and 100")
    coupon_code: str | None = Field(default=None, max_length=32)

class OrderRead(BaseModel):
    # Outbound response DTO - separates internal DB layout from client contract
    id: int
    user_id: int
    item_sku: str
    quantity: int
    total_amount: Decimal
    status: str
    created_at: datetime

    # Pydantic V2 configuration to allow automatic reading from ORM model attributes
    model_config = ConfigDict(from_attributes=True)
```

### Layer 3: The Data Access Repository (`app/repositories/order_repository.py`)

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.order import OrderModel

class OrderRepository:
    """Isolates all SQLAlchemy queries for orders behind clean Python methods."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, order_id: int) -> OrderModel | None:
        stmt = select(OrderModel).where(OrderModel.id == order_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, order: OrderModel) -> OrderModel:
        # Note: We do NOT commit here. The transaction boundary belongs to the unit of work / service.
        self.session.add(order)
        await self.session.flush()
        await self.session.refresh(order)
        return order
```

### Layer 4: Custom Domain Exceptions (`app/core/exceptions.py`)

```python
class DomainException(Exception):
    """Base class for all business domain errors."""
    pass

class InsufficientStockException(DomainException):
    def __init__(self, sku: str, requested: int, available: int) -> None:
        super().__init__(f"Insufficient inventory for SKU '{sku}': requested {requested}, available {available}")
        self.sku = sku
        self.requested = requested
        self.available = available

class InvalidCouponException(DomainException):
    def __init__(self, code: str) -> None:
        super().__init__(f"Coupon '{code}' is expired or invalid")
        self.code = code
```

### Layer 5: The Business Logic Service (`app/services/order_service.py`)

```python
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import InsufficientStockException, InvalidCouponException
from app.models.order import OrderModel
from app.repositories.order_repository import OrderRepository
from app.schemas.order import OrderCreate

class OrderService:
    """Contains pure business logic. Fully decoupled from HTTP requests and status codes."""

    def __init__(self, order_repo: OrderRepository, session: AsyncSession) -> None:
        self.order_repo = order_repo
        self.session = session

    async def place_order(self, user_id: int, payload: OrderCreate) -> OrderModel:
        # 1. Enforce business rule: Check inventory (simulated lookup)
        available_stock = 10
        if payload.quantity > available_stock:
            raise InsufficientStockException(payload.item_sku, payload.quantity, available_stock)

        # 2. Enforce business rule: Calculate pricing and coupons
        unit_price = Decimal("49.99")
        subtotal = unit_price * payload.quantity
        discount = Decimal("0.00")

        if payload.coupon_code:
            if payload.coupon_code.upper() == "SAVE10":
                discount = subtotal * Decimal("0.10")
            else:
                raise InvalidCouponException(payload.coupon_code)

        final_total = subtotal - discount

        # 3. Instantiate domain entity
        order = OrderModel(
            user_id=user_id,
            item_sku=payload.item_sku,
            quantity=payload.quantity,
            total_amount=final_total,
            status="confirmed",
        )

        # 4. Persist via repository within a transactional boundary
        created_order = await self.order_repo.create(order)
        await self.session.commit()
        return created_order
```

### Layer 6: Dependency Providers (`app/dependencies/database.py`)

```python
from collections.abc import AsyncGenerator
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.repositories.order_repository import OrderRepository
from app.services.order_service import OrderService

DATABASE_URL = "postgresql+asyncpg://user:pass@localhost:5432/app_db"
engine = create_async_engine(DATABASE_URL, pool_pre_ping=True, pool_size=20)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Yields a database session per HTTP request and guarantees cleanup."""
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise

def get_order_service(session: AsyncSession = Depends(get_db_session)) -> OrderService:
    """Factory dependency injecting repository and active session into the service."""
    order_repo = OrderRepository(session)
    return OrderService(order_repo=order_repo, session=session)
```

### Layer 7: The Thin API Controller (`app/api/v1/endpoints/orders.py`)

```python
from fastapi import APIRouter, Depends, status
from app.dependencies.database import get_order_service
from app.schemas.order import OrderCreate, OrderRead
from app.services.order_service import OrderService

router = APIRouter(prefix="/orders", tags=["Orders"])

@router.post(
    "",
    response_model=OrderRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a customer order",
)
async def create_order(
    payload: OrderCreate,
    service: OrderService = Depends(get_order_service),
    # In a real app, current_user would be injected via get_current_user dependency
) -> OrderRead:
    current_user_id = 42
    # The router does not calculate prices or manage DB transactions. It delegates to the service.
    order = await service.place_order(user_id=current_user_id, payload=payload)
    return order
```

### Layer 8: App Factory and Exception Mapping (`app/main.py`)

```python
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from app.api.v1.endpoints.orders import router as orders_router
from app.core.exceptions import InsufficientStockException, InvalidCouponException

def create_app() -> FastAPI:
    app = FastAPI(title="Production Order API", version="1.0.0")

    # Include versioned API routers
    app.include_router(orders_router, prefix="/api/v1")

    # Global domain exception handlers translate domain errors into HTTP status codes
    @app.exception_handler(InsufficientStockException)
    async def insufficient_stock_handler(request: Request, exc: InsufficientStockException) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "error": "INSUFFICIENT_STOCK",
                "message": str(exc),
                "sku": exc.sku,
                "requested": exc.requested,
                "available": exc.available,
            },
        )

    @app.exception_handler(InvalidCouponException)
    async def invalid_coupon_handler(request: Request, exc: InvalidCouponException) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"error": "INVALID_COUPON", "message": str(exc), "code": exc.code},
        )

    return app

app = create_app()
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why must Pydantic schemas and SQLAlchemy ORM models be kept separate instead of using one unified class?**

Pydantic schemas and SQLAlchemy models solve two fundamentally different problems that change for different reasons.

SQLAlchemy models represent data persistence: tables, foreign key constraints, column indices, and database-level cascades. They reflect how data is stored on disk in PostgreSQL or MySQL. Pydantic schemas represent the public API contract: validating incoming JSON payloads, stripping unrecognized fields, and formatting outgoing responses.

Coupling them into a single structure causes severe production defects:
1. **Security and data leaks:** If your endpoint returns an ORM model directly, newly added database columns—such as `hashed_password`, `internal_risk_score`, or `tenant_id`—are automatically serialized and exposed to external consumers.
2. **Asymmetric payloads:** Creating an entity requires different fields than reading or updating it. For example, `UserCreate` requires a raw `password` string but has no `id` or `created_at`. `UserRead` contains an `id` and `created_at` timestamp, but must never contain the `password`. A single class cannot represent these three states cleanly.
3. **Database decoupling:** When you refactor a database table (e.g., splitting a monolithic `users` table into `users` and `user_profiles`), you can update your ORM models and repository mapping without breaking the existing public API contract expected by mobile and web frontends.

---

**Q: How does this layered architecture dramatically simplify unit testing?**

In a tightly coupled application where route handlers execute SQL queries directly, writing a unit test requires spinning up a PostgreSQL test container, seeding database tables, making live HTTP requests via `TestClient`, and verifying rows in the database. These integration tests are slow, brittle, and difficult to parallelize.

In a clean layered architecture, the test pyramid becomes practical:
1. **Lightning-fast unit tests for business logic:** Because `OrderService` accepts an `OrderRepository` interface and has no dependency on FastAPI or HTTP transport, you can test every edge case—such as coupon expiration, discount tiers, or out-of-stock branches—in pure Python in less than two milliseconds using a mock or in-memory fake repository without touching a database or network socket.
2. **Isolated repository tests:** You test database queries, complex SQL joins, and pagination logic against a real PostgreSQL test database in `tests/integration/` without needing to simulate HTTP headers or auth tokens.
3. **Focused router and E2E tests:** Using FastAPI's `app.dependency_overrides`, you can test HTTP status codes, header parsing, and serialization in `tests/e2e/` by overriding `get_order_service` with a stubbed service, testing the HTTP layer in complete isolation.

---

**Q: How do you prevent circular imports in a growing FastAPI codebase?**

Circular imports in Python occur when Module A imports Module B at the top level while Module B imports Module A during initialization. In FastAPI, this typically happens when router files import the `app` instance from `main.py`, or when services and models cross-import each other.

You prevent circular imports with four architectural practices:
1. **Strict unidirectional dependencies:** Enforce the rule that dependencies only flow downward (`api -> services -> repositories -> models`). A lower layer must never import from an upper layer.
2. **Decoupled router registration:** Router files must never import `app` from `main.py`. Instead, each endpoint file creates its own independent `APIRouter()` instance. The top-level `main.py` imports these routers and registers them onto the `app` using `app.include_router()`.
3. **Type checking guards:** When type annotations require a type from another module that would create a circular dependency at runtime, import it inside an `if TYPE_CHECKING:` block with `from typing import TYPE_CHECKING` and quote the type annotation string (e.g., `"UserModel"`).
4. **Dedicated common/core modules:** Shared utilities, database session factories, and base models live in `app/core/` and `app/models/base.py`, where any module can import them without dragging in domain routers or services.

---

**Q: Should a large FastAPI project be structured "by layer" (horizontal) or "by feature" (vertical slice)? What are the tradeoffs?**

Both approaches are valid, but they optimize for different team sizes and architectural scales:

- **Package-by-Layer (Horizontal):** Organizes files by architectural role (`app/routers/`, `app/services/`, `app/repositories/`, `app/models/`). This works exceptionally well for small to medium-sized teams (up to 10–15 engineers) and applications with 20–40 domain entities. It establishes clear architectural consistency because every developer knows exactly where repositories and schemas live.
- **Package-by-Feature / Domain (Vertical Slice):** Organizes the project into isolated domain packages (`app/modules/users/`, `app/modules/billing/`, `app/modules/inventory/`), where each module contains its own `router.py`, `service.py`, `repository.py`, and `schemas.py`. This structure scales better for large engineering organizations (20+ engineers across multiple squads) because each squad has strict ownership of their domain directory with minimal merge conflicts.

A common industry standard is a **hybrid approach**: top-level shared infrastructure (`core/`, `dependencies/`) with domain-driven packages for complex business modules.

---

**Q: Where should database transaction boundaries (`commit` and `rollback`) be managed?**

Database transaction boundaries must be managed in the **Service layer** or at the **HTTP request lifecycle boundary**, never inside individual repository methods.

A repository method represents a single data access operation (e.g., `add()`, `get_by_id()`, `update()`). If a repository method calls `await session.commit()` internally, it destroys the atomicity of multi-step business transactions. 

For example, if a service must debit a user's wallet balance and create an order record within one atomic unit of work:
- If the repository auto-commits after debiting the wallet, and the subsequent order creation throws an exception, the user's money is permanently deducted with no order created.
- By having repositories only execute `session.add()` and `await session.flush()` (which generates database IDs without closing the transaction), the `OrderService` retains full control to call `await session.commit()` only after all operations succeed, or trigger `await session.rollback()` if any business rule fails.
- Furthermore, the `get_db_session` dependency acts as a safety net: if an unhandled exception escapes the route, the context manager automatically calls `await session.rollback()`.

---

**Q: How should custom business domain exceptions be handled without polluting services with HTTP knowledge?**

Services should never raise FastAPI's `HTTPException(status_code=404, detail="...")`. Importing `HTTPException` into a service couples your core business logic to the HTTP transport protocol. If you later reuse that same service in a Celery background worker, an AWS Lambda event handler, a Kafka stream consumer, or a CLI command, the HTTP exception makes no sense.

The clean architecture solution is:
1. Define custom, pure Python domain exception classes in `app/core/exceptions.py` (e.g., `EntityNotFoundException`, `InsufficientFundsException`, `DuplicateEmailException`).
2. Have your services raise these domain exceptions whenever a business invariant is violated.
3. In `app/main.py`, register global FastAPI exception handlers using `@app.exception_handler(DomainException)` that catch these domain errors at the boundary and translate them into standardized HTTP responses with appropriate status codes (e.g., mapping `InsufficientFundsException` to `422 Unprocessable Entity` or `409 Conflict`).

## 6. The Traps — What Goes Wrong

### Trap 1: The Fat Controller (Leaking SQL and Business Logic into Routers)
- **The Mistake:** Writing raw database queries, discount algorithms, and payment calls directly inside the `@router.post` endpoint function.
- **Why It Fails:** The route handler becomes impossible to test without simulating HTTP requests. The logic cannot be reused by background tasks, WebSockets, or cron jobs.
- **The Fix:** Treat route handlers as pure dispatchers: validate input via schemas, pass data to a service method, and return the formatted response.

### Trap 2: The Self-Committing Repository
- **The Mistake:** Placing `await session.commit()` inside repository methods like `UserRepository.create()`.
- **Why It Fails:** It shatters atomic transactions. If a business workflow requires inserting three rows across three tables, auto-committing on the first insert makes rollback impossible when the third insert fails.
- **The Fix:** Use `session.add()` and `await session.flush()` in repositories. Let the service layer or the request session context manager govern `await session.commit()`.

### Trap 3: Passing HTTP Primitives to Services and Repositories
- **The Mistake:** Passing FastAPI `Request`, `Response`, `Header`, or `UploadFile` objects directly as parameters into service or repository methods.
- **Why It Fails:** It permanently locks your core business rules to the FastAPI framework and HTTP protocol. You cannot invoke that service from a message queue consumer or a standalone script.
- **The Fix:** Extract the primitive data (e.g., `user_id: int`, `raw_bytes: bytes`, `client_ip: str`) in the router endpoint and pass only plain Python primitives or Pydantic DTOs into the service.

### Trap 4: Direct ORM Model Exposure (Detached Instance Errors & Data Leaks)
- **The Mistake:** Returning raw SQLAlchemy ORM instances from endpoints without defining a Pydantic `response_model`.
- **Why It Fails:** Two catastrophic issues occur: first, internal database columns leak to the API consumer. Second, when FastAPI attempts to serialize lazy-loaded relationship attributes after the database session has closed at the end of the request, SQLAlchemy crashes with `sqlalchemy.orm.exc.DetachedInstanceError`.
- **The Fix:** Always specify `response_model=MySchemaRead` on route definitions and use Pydantic V2's `model_config = ConfigDict(from_attributes=True)` to safely extract only declared fields while the session is alive.

### Trap 5: Global Session Singletons
- **The Mistake:** Creating a single global `session = Session()` at the module level and importing it across routers.
- **Why It Fails:** SQLAlchemy sessions are **not thread-safe or task-safe**. When concurrent async requests share a single session object, transactions collide, queries execute within other users' transaction contexts, and the database driver crashes with `InvalidRequestError: Session is already flushing`.
- **The Fix:** Always generate request-scoped sessions using FastAPI's dependency injection system with `async with async_session_factory() as session: yield session`.

## 7. Compare With Related Concepts

### FastAPI Clean Architecture vs Django "Apps" Architecture
- **Django:** Enforces a rigid, batteries-included structure where every domain is a Django "App" containing `models.py`, `views.py`, `urls.py`, and `admin.py`. Django's built-in ORM uses the **Active Record** pattern, where business methods and queries are frequently attached directly to the model classes.
- **FastAPI Clean Architecture:** Unopinionated and lightweight. It favors the **Data Mapper** pattern (separating data representations in `models/` from query logic in `repositories/` and domain rules in `services/`).
- **When to Choose Which:** Use Django's app architecture when building monolithic web applications that rely heavily on Django's built-in admin panel, session-based authentication, and templating. Use FastAPI Clean Architecture when building high-concurrency, asynchronous APIs and microservices that require strict modular boundaries and independent layer testability.

### FastAPI Layered Architecture vs NestJS / Spring Boot Modules
- **NestJS & Spring Boot:** Enforce modular boundaries using heavy class-based decorators, compile-time metadata, and built-in Inversion of Control (IoC) dependency injection containers (`@Module`, `@Injectable`, `@Controller`).
- **FastAPI:** Implements dependency injection through Python callables using `Depends()`. It avoids mandatory class-based decorators and XML/metadata configuration in favor of idiomatic Python functions, generators, and type annotations.
- **When to Choose Which:** NestJS and Spring Boot force strict enterprise modularity by default through framework guardrails. FastAPI allows the same clean architecture with significantly less boilerplate and faster execution, but requires team discipline to maintain structural conventions.

### Horizontal (Layer-by-Type) vs Vertical Slice (Feature-by-Domain)
- **Horizontal (`routers/`, `services/`, `repositories/`):** Groups files by technical role. Best for small-to-medium systems (<20 domain entities) where shared tooling and standard patterns allow any developer to navigate any layer quickly.
- **Vertical Slice (`users/`, `orders/`, `billing/`):** Groups all layers for a single business capability inside a self-contained domain folder. Best for large codebases maintained by multiple autonomous squads who need to deploy and refactor features without stepping on other teams' files.
- **Decision Rule:** Start with Horizontal Layered Architecture for single-team applications; transition to Vertical Slice modularity when domain boundaries diverge or multiple squads share the same repository.

## 8. 🧠 The Memory Hook — What Sticks

Traffic flows in strictly one direction: **Waiters (API)** take the order, **Chefs (Services)** enforce the recipe, **Pantry (Repositories)** fetch ingredients from **Storage (Models)**. Never let the waiter cook, never put HTTP exceptions in your business logic, and never commit the database until the entire meal is prepared.
