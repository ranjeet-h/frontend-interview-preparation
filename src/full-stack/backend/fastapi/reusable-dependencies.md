# Reusable Dependencies in FastAPI: Composition, Common Pagination, and Filtering Schemas

## 1. Why This Exists — The Problem First

Imagine building a backend that starts with three listing endpoints. On day one, you write query parameters directly in the route signature: `page: int = 1, page_size: int = 20`. It feels quick and harmless.

Six months later, the service has grown to 45 endpoints across users, orders, invoices, inventory, and audit logs. Four distinct developers have touched the codebase:
- `/orders` expects `page` and `page_size`.
- `/products` expects `skip` and `limit`.
- `/invoices` expects `offset` and `count`, but forgot to enforce a maximum cap. A single scraper requests `count=1000000`, pulling two million rows into RAM and crashing the worker process with an out-of-memory error.
- `/audit-logs` accepts `start_date` and `end_date`, but because someone forgot to validate that `start_date <= end_date`, inverted ranges trigger 500 server errors deep in the SQL layer.
- Auth token extraction, organization boundary checks, and database session lifecycles are copy-pasted across dozens of route files. When a security patch requires checking revoked API tokens, you have to modify 45 different handlers and pray you did not miss one.

Reusable dependencies exist to eliminate this chaos. Instead of repeating parameter extraction, validation, authentication, and resource management across individual route functions, FastAPI lets you package these behaviors into modular, composable, and testable units that plug directly into your endpoints.

---

## 2. The Analogy — Make It Obvious

Think of a commercial kitchen in a high-volume restaurant:

```txt
Incoming Order Ticket (HTTP Request: Query, Headers, Body)
                         │
                         ▼
        ┌──────────────────────────────────┐
        │  Station 1: ID & Security Check  │ ──► Reusable Auth Dependency
        └──────────────────────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │  Station 2: Prep Station Trays   │ ──► Composed Filter Dependency
        │  ├── Standard Portioning (Page)  │
        │  ├── Date Inspection (Range)     │
        │  └── Sort Station (Order)        │
        └──────────────────────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │  Station 3: Clean Cookware       │ ──► Yield Database Session
        └──────────────────────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │   Head Chef Assembly Station     │ ──► Endpoint Route Handler
        │   (Receives all prepped items)   │
        └──────────────────────────────────┘
                         │
                         ▼
     Finished Dish Served (Response Returned)
                         │
                         ▼
        ┌──────────────────────────────────┐
        │   Pot Wash Station Closes Up     │ ──► Dependency Cleanup (Post-Yield)
        └──────────────────────────────────┘
```

The head chef (your route handler) should only care about cooking the specific meal (the business logic). 

If the head chef had to leave the stove on every ticket to verify the customer's credit card, wash the vegetables, measure exact portion sizes, and sanitize the pan after cooking, service would grind to a halt. 

Instead, prep stations handle specific jobs:
- The **Prep Station** packages standardized portions (pagination parameters).
- The **Inspection Station** verifies dietary clearances and ticket authenticity (security and authentication).
- The **Dishwashing Station** hands over a clean sauté pan before cooking starts and takes it away for sanitizing once the meal is plated (database session with setup and teardown).

The head chef simply requests the prepped tray (`Depends(CommonQueryParams)`). The kitchen manager (FastAPI's dependency resolution engine) resolves all sub-station tasks in the correct order and hands the chef exactly what is needed.

---

## 3. How It Actually Works — The Full Explanation

FastAPI's dependency injection system revolves around a single core primitive: `Depends()`. Under the hood, `Depends(callable)` accepts any standard Python callable — a function, an async function, a class, or a callable class instance.

### 1. How FastAPI Evaluates a Dependency

When a client sends an HTTP request, FastAPI inspects the endpoint's parameter list before running the route function:

1. **Signature Introspection:** FastAPI reads the type hints and default values of the dependency callable. If the dependency is a class (like `PaginationParams`), it inspects `__init__`. If it is a function, it inspects the function signature.
2. **Request Parsing:** FastAPI extracts matching query parameters, path variables, headers, cookies, or request bodies from the incoming HTTP request.
3. **Pydantic Validation:** All extracted values are validated against the type annotations and constraints (e.g., `ge=1`, `le=100`, `regex=...`). If validation fails, FastAPI immediately halts execution and returns a structured `422 Unprocessable Entity` response without touching the endpoint body.
4. **Execution and Injection:** FastAPI calls the dependency with the validated arguments and passes the returned value into the route handler's parameter.

### 2. The Three Reusable Dependency Styles

Depending on what you are trying to accomplish, FastAPI supports three primary dependency designs:

#### A. Class as a Dependency (`class CommonParams`)
A class is ideal for grouping related query parameters (like pagination, date ranges, or search filters). Because a class in Python is a callable that returns an instance of itself, FastAPI inspects `__init__`, parses the query string, and gives you a structured object with helper properties:

```python
class PaginationParams:
    def __init__(
        self,
        page: int = 1,
        page_size: int = 20,
    ):
        self.page = max(1, page)
        self.page_size = min(max(1, page_size), 100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size
```

When used in a route:
```python
@router.get("/items")
def list_items(pagination: PaginationParams = Depends()):
    # pagination is a validated instance of PaginationParams
    query = db.query(Item).offset(pagination.offset).limit(pagination.limit)
    return query.all()
```
Notice the shorthand `pagination: PaginationParams = Depends()`. When you do not pass a callable to `Depends()`, FastAPI uses the type annotation (`PaginationParams`) as the callable automatically.

#### B. Callable Functions and Generators (`yield` for Lifecycles)
A standard function is best for transient operations or resource management:
- **Async/Sync Functions:** Fetching current user tokens, checking permissions, validating headers.
- **Generator Functions with `yield`:** Managing resources that require cleanup (database sessions, transaction rollbacks, client connections). Code before `yield` runs before the route handler; code after `yield` runs after the response is generated.

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

#### C. Parameterized Callable Classes (Factory Pattern)
When dependencies need dynamic configuration (such as checking different permission roles or enforcing endpoint-specific rate limits), use a class with a `__call__` method:

```python
class RoleChecker:
    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_user)) -> User:
        if user.role not in self.allowed_roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user

# Reusable instances configured per route
require_admin = RoleChecker(allowed_roles=["admin"])
require_manager = RoleChecker(allowed_roles=["admin", "manager"])
```

### 3. Nested Dependency Composition (The Dependency Graph)

Dependencies can depend on other dependencies. When a route handler requests a top-level dependency, FastAPI constructs a Directed Acyclic Graph (DAG) of all required sub-dependencies and resolves them in topological order.

```txt
                       Route Handler
                             │
                  ┌──────────┴──────────┐
                  ▼                     ▼
          CommonQueryParams       DatabaseSession
           ┌──────┴──────┐              │
           ▼             ▼              ▼
    PaginationParams  DateFilter   PostgreSQL Pool
```

If `CommonQueryParams` requires `PaginationParams` and `DateFilterParams`, FastAPI:
1. Extracts `page` and `page_size`, validates them, and instantiates `PaginationParams`.
2. Extracts `start_date` and `end_date`, validates them, and instantiates `DateFilterParams`.
3. Passes both sub-objects into `CommonQueryParams`.
4. Injects the assembled `CommonQueryParams` into the route handler.

### 4. Dependency Caching (`use_cache=True`)

By default, FastAPI caches the result of each dependency per request. If three different sub-dependencies all require `get_current_user` or `get_db`, FastAPI runs `get_current_user` once on the first invocation, stores the return value in a request-scoped dictionary, and supplies that same cached instance to the other two dependencies.

If you have a dependency that must execute fresh every time it is referenced (for example, generating a unique timestamp or pulling a random salt), you explicitly disable caching with `Depends(my_dep, use_cache=False)`.

---

## 4. Real Code — See It Working

Here is a complete, production-grade example demonstrating class-based pagination, date filtering, nested composition, role authorization, and database session injection.

```python
from datetime import date
from typing import Annotated, Optional
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

app = FastAPI(title="Store API")

# ---------------------------------------------------------------------------
# 1. Reusable Class Dependencies (Pagination, Filtering, Sorting)
# ---------------------------------------------------------------------------

class PaginationParams:
    """Reusable query schema for consistent pagination across all list endpoints."""
    def __init__(
        self,
        page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
        page_size: int = Query(default=20, ge=1, le=100, description="Items per page (max 100)"),
    ):
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


class DateRangeFilter:
    """Reusable date boundary filter with cross-field validation."""
    def __init__(
        self,
        start_date: Optional[date] = Query(default=None, description="Start date (YYYY-MM-DD)"),
        end_date: Optional[date] = Query(default=None, description="End date (YYYY-MM-DD)"),
    ):
        if start_date and end_date and start_date > end_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="start_date cannot be after end_date",
            )
        self.start_date = start_date
        self.end_date = end_date


class OrderSortingParams:
    """Reusable sorting schema restricting sort fields to known safe columns."""
    def __init__(
        self,
        sort_by: str = Query(default="created_at", regex="^(created_at|total_amount|status)$"),
        order: str = Query(default="desc", regex="^(asc|desc)$"),
    ):
        self.sort_by = sort_by
        self.order = order


# ---------------------------------------------------------------------------
# 2. Nested Dependency Composition
# ---------------------------------------------------------------------------

class OrderListQuery:
    """Composite dependency grouping pagination, date ranges, and sorting."""
    def __init__(
        self,
        pagination: Annotated[PaginationParams, Depends()],
        date_range: Annotated[DateRangeFilter, Depends()],
        sorting: Annotated[OrderSortingParams, Depends()],
        search: Optional[str] = Query(default=None, max_length=50),
    ):
        self.pagination = pagination
        self.date_range = date_range
        self.sorting = sorting
        self.search = search


# ---------------------------------------------------------------------------
# 3. Parameterized Auth & RBAC Dependencies
# ---------------------------------------------------------------------------

class User(BaseModel):
    id: int
    username: str
    role: str


def get_current_user(token: str = Query(default="demo-token")) -> User:
    # In production: decode JWT, inspect header, verify user in DB
    if token == "admin-secret":
        return User(id=1, username="alice", role="admin")
    elif token == "user-secret":
        return User(id=2, username="bob", role="customer")
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication token",
    )


class RequireRole:
    """Callable class dependency factory for Role-Based Access Control."""
    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required roles: {self.allowed_roles}",
            )
        return user


# ---------------------------------------------------------------------------
# 4. Route Handlers Using Composed Dependencies
# ---------------------------------------------------------------------------

orders_router = APIRouter(prefix="/orders", tags=["Orders"])

# Mock database records
FAKE_ORDERS = [
    {"id": 1, "created_at": "2026-01-10", "total_amount": 150.0, "status": "completed"},
    {"id": 2, "created_at": "2026-02-15", "total_amount": 89.5, "status": "pending"},
    {"id": 3, "created_at": "2026-03-01", "total_amount": 420.0, "status": "completed"},
]

@orders_router.get("")
def list_orders(
    params: Annotated[OrderListQuery, Depends()],
    current_user: Annotated[User, Depends(RequireRole(["admin", "customer"]))],
):
    # Access composed sub-dependency properties with full type hinting
    offset = params.pagination.offset
    limit = params.pagination.limit
    
    # In real application: db.query(Order).filter(...).offset(offset).limit(limit)
    paginated_data = FAKE_ORDERS[offset : offset + limit]

    return {
        "user": current_user.username,
        "page": params.pagination.page,
        "page_size": params.pagination.page_size,
        "sort": f"{params.sorting.sort_by} {params.sorting.order}",
        "date_filter": {
            "start": params.date_range.start_date,
            "end": params.date_range.end_date,
        },
        "search_term": params.search,
        "data": paginated_data,
    }

app.include_router(orders_router)
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why use a class as a dependency instead of a simple standalone function?**

A function dependency works well for returning a single primitive or resource (like a database connection). However, classes shine when managing query schemas with multiple parameters for three reasons:
1. **Encapsulation of Helper Logic:** A `PaginationParams` class can define computed properties like `.offset`, `.limit`, or a method like `.apply_to_sqlalchemy(query)`. The route handler receives an active object rather than raw numbers.
2. **Cleaner Composition:** Classes cleanly receive sub-dependencies in their `__init__` methods, making large composite filters (combining pagination, date ranges, and search flags) clean and self-documenting.
3. **Inheritance and Extension:** You can create a base `PaginationParams` class and subclass it for domain-specific needs (e.g., `CursorPaginationParams`) without rewriting parameter definitions.

---

**Q: How does FastAPI resolve nested dependencies and what role does `use_cache` play?**

When an endpoint specifies dependencies, FastAPI constructs a dependency graph (a DAG). It resolves leaf dependencies first, validates all input data, and passes the resolved outputs to parent dependencies until the endpoint itself is invoked.

During this resolution, FastAPI checks an internal request-scoped cache. By default (`use_cache=True`), if five different dependencies in the tree all depend on `get_db` or `get_current_user`, FastAPI executes the dependency function once, stores the result, and injects that exact same object into all five locations. This avoids duplicate database connection lookups, redundant JWT decoding, and redundant user queries during a single HTTP request lifecycle.

---

**Q: What is the difference between declaring a dependency in `APIRouter(dependencies=[...])` vs inside a route function's parameters (`user: User = Depends(...)`)?**

- **Function Parameter (`user: User = Depends(get_current_user)`):** Use this when the endpoint handler *needs the return value* of the dependency (e.g., you need the user's ID to filter database rows).
- **Router or Path Decorator (`dependencies=[Depends(verify_api_key)]`):** Use this when the dependency performs an enforcement or side-effect (authentication check, rate-limiting, audit logging, header verification) and the route handler *does not need the returned value*. Applying it to `APIRouter` enforces the check across every route under that router prefix automatically.

---

**Q: How do you implement dynamic or parameterized dependencies (e.g., role checks for different endpoints)?**

Standard functions passed to `Depends()` cannot accept configuration arguments directly because FastAPI controls the invocation. To parameterize a dependency:
1. **Class with `__call__`:** Create a class whose `__init__` takes configuration parameters (e.g., `allowed_roles: list[str]`) and whose `__call__` method acts as the dependency function (accepting request dependencies like `current_user: User = Depends(...)`).
2. **Closure / Factory Function:** Create a function that takes arguments and returns another dependency function.

The `__call__` class approach is preferred in production because it produces clean, reusable, and type-annotated instances like `require_admin = RequireRole(["admin"])`.

---

**Q: How does `app.dependency_overrides` work in testing, and why is it superior to monkeypatching?**

In FastAPI, `app.dependency_overrides` is a dictionary that maps real dependency callables to mock or test callables.

When running integration tests with `pytest` and `httpx.AsyncClient` / `TestClient`, you can override external systems cleanly:
```python
def test_admin_route(client):
    # Override get_current_user to return a mock admin without touching auth servers
    app.dependency_overrides[get_current_user] = lambda: User(id=99, username="test_admin", role="admin")
    
    response = client.get("/admin/dashboard")
    assert response.status_code == 200
    
    # Always clean up overrides after the test
    app.dependency_overrides.clear()
```
This is superior to monkeypatching because:
- It tests the exact HTTP request pipeline, routing, request parsing, and response serialization.
- It is type-safe and framework-native.
- It scopes cleanly to test suites without mutating global module states or private variables.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Storing Request State on Singleton Class Instances

**The Mistake:** Storing request data inside instance attributes of a dependency class that is initialized once at startup.

```python
# BROKEN: Singleton state contamination
class BadTenantChecker:
    def __init__(self):
        self.tenant_id = None  # Shared across all incoming requests!

    def __call__(self, x_tenant_id: str = Header()):
        self.tenant_id = x_tenant_id
        return self

checker = BadTenantChecker()

@app.get("/data")
def get_data(dep: BadTenantChecker = Depends(checker)):
    # Under concurrent async traffic, request A overwrites request B's tenant_id!
    return {"tenant": dep.tenant_id}
```

**Why it breaks:** If you instantiate a class once (`checker = BadTenantChecker()`) and pass that instance to `Depends(checker)`, Python shares that single instance across all concurrent requests. Mutating `self.tenant_id` creates massive race conditions and data leaks across tenants.

**The Fix:** Keep dependency classes stateless, or let FastAPI instantiate the class per request by passing the class itself: `dep: TenantChecker = Depends(TenantChecker)`.

---

### Trap 2: Returning `None` for Unauthenticated Users

**The Mistake:** Catching an auth failure and returning `None` instead of raising `HTTPException`.

```python
# BROKEN: Silent failure propagation
def get_current_user(token: Optional[str] = Header(None)):
    if not token or token != "valid":
        return None  # Endpoint runs with user=None!
    return User(username="alice")

@app.delete("/account")
def delete_account(user: Optional[User] = Depends(get_current_user)):
    # If the developer forgets to check `if user is None:`, this executes for anonymous requests!
    db.delete_user(user.id)  # Crashes with AttributeError: 'NoneType' or deletes unassigned data
```

**Why it breaks:** If an authentication dependency returns `None`, the endpoint handler is still called. If the developer forgets to explicitly check for `None`, the endpoint executes in an unauthenticated context, potentially causing catastrophic authorization bypasses or runtime crashes.

**The Fix:** Always raise `HTTPException(status_code=401)` immediately inside the dependency. An endpoint requiring authentication should never be invoked if credentials are invalid.

---

### Trap 3: Uncapped Pagination Limits Causing OOM Crashes

**The Mistake:** Accepting `limit: int = 100` without a validation boundary.

```python
# BROKEN: Open to Memory Denial-of-Service
class UnsafePagination:
    def __init__(self, page: int = 1, limit: int = 20):
        self.page = page
        self.limit = limit
```

**Why it breaks:** A client can pass `?limit=5000000`. The server attempts to load five million rows from the database, exhausting server memory and killing the worker process.

**The Fix:** Use `Query(..., ge=1, le=100)` to force strict boundaries at the validation boundary before any database query executes:

```python
# FIXED: Strictly bounded parameters
class SafePagination:
    def __init__(
        self,
        page: int = Query(default=1, ge=1),
        limit: int = Query(default=20, ge=1, le=100),
    ):
        self.page = page
        self.limit = limit
```

---

### Trap 4: Swallowing Exceptions in `yield` Dependencies

**The Mistake:** Using a bare `except` block inside a database session generator.

```python
# BROKEN: Swallows endpoint exceptions and commits broken state
def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        # Forgetting to re-raise the exception!
    finally:
        db.close()
```

**Why it breaks:** If an endpoint raises an `HTTPException` or business error, the `yield` statement re-raises that error into the generator. If you catch it and do not re-raise it, FastAPI's error handlers cannot see the exception, and the client receives a 200 OK or hanging connection.

**The Fix:** Always re-raise or only use `finally:` for cleanup:

```python
# FIXED: Clean cleanup without masking errors
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

## 7. Compare With Related Concepts

Understanding where FastAPI dependencies sit relative to other architectures prevents misuse:

| Feature / Concept | FastAPI `Depends()` | Express.js / Koa Middleware | NestJS / Spring Boot DI Container |
| :--- | :--- | :--- | :--- |
| **Execution Scope** | Granular per endpoint, router, or global | Pipeline chain per request | Global or Scoped Service Containers |
| **Return Value Injection** | Directly into route parameter with full type safety | Attached to untyped `req` object (`req.user`) | Injected into class constructors |
| **Validation Integration** | Automatic validation via Pydantic & OpenAPI | Manual validation inside middleware | Handled via separate Validation Pipes |
| **Graph Resolution** | Resolves nested sub-dependencies and DAGs | Sequential waterfall (`next()`) | Hierarchical provider trees |
| **Clean Teardown** | Native via `yield` in generators | Requires hooking into `res.on('finish')` | Handled via framework lifecycle hooks |

### Quick Selection Rules

- **Use a Class Dependency (`class PaginationParams`)** when grouping related query parameters with validation and computed properties.
- **Use a Function Dependency (`def get_current_user`)** when returning a single validated entity or token.
- **Use a `yield` Function Dependency (`def get_db`)** when acquiring a resource that must be closed, committed, or rolled back after the request finishes.
- **Use a Parameterized Class (`RequireRole(["admin"])`)** when the dependency requires configuration per route.
- **Use Router-level `dependencies=[...]`** when applying side-effects (security guards, rate limiters) across an entire group of routes without needing their return values in handlers.

---

## 8. 🧠 The Memory Hook — What Sticks

> **Think of FastAPI dependencies as your endpoint's personal prep kitchen:**
>
> Route handlers only cook the meal. Use **Classes** for reusable query schemas, **Generators (`yield`)** for resources that need cleanup, and **Composed DAGs** to assemble complex requests from modular, testable building blocks.
