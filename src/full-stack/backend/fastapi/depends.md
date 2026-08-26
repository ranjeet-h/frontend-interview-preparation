# `Depends()` in FastAPI: Callables, Classes as Dependencies, and `Annotated` Type Hints

## 1. Why This Exists — The Problem First

Imagine building a REST API that starts with 5 simple endpoints and quickly grows to 50. Every single endpoint needs to extract an `Authorization` header, decode and validate a JWT, look up the user in a database, check tenant permissions, open a database session, and parse pagination parameters like `skip` and `limit`.

Without a dependency injection system, the first 15 to 20 lines of every single route handler become copy-pasted boilerplate:

```python
# The nightmare: Manual wiring in every route
@app.get("/invoices")
async def get_invoices(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing auth header")
    token = auth_header.replace("Bearer ", "")
    user = verify_jwt_and_fetch_user(token)
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Inactive user")

    db = SessionLocal()
    try:
        skip = int(request.query_params.get("skip", 0))
        limit = min(int(request.query_params.get("limit", 20)), 100)
        return db.query(Invoice).filter(Invoice.org_id == user.org_id).offset(skip).limit(limit).all()
    finally:
        db.close()
```

This pattern breaks down in three disastrous ways:

1. **Resource Leaks**: If one developer forgets the `try...finally` block in just one endpoint, database connections stay open. Under load, the connection pool exhausts itself and the entire application freezes.
2. **Security Inconsistencies**: If authentication or permission logic is modified, you must find and update 50 different handlers. Miss one, and you have created a security vulnerability.
3. **Untestable Code**: You cannot unit-test the business logic of `get_invoices` in isolation. To test this function, you must mock HTTP `Request` objects, JWT decoders, headers, and database engines globally.

Traditional Python decorators (`@require_auth`, `@with_db`) solve part of the duplication problem, but they cannot easily pass calculated return values (like the authenticated `user` object or the open `db` session) into the route handler's arguments, they cannot declare sub-dependencies cleanly, and they are invisible to OpenAPI schema generation.

FastAPI created `Depends()` to solve all of this: declarative parameter extraction, hierarchical sub-dependency resolution, automatic request-scoped lifecycle cleanup, OpenAPI documentation synchronization, and test-time dependency overriding.

---

## 2. The Analogy — Make It Obvious

Think of FastAPI's `Depends()` as the **Mise en Place Prep Crew** in a high-end commercial restaurant kitchen.

When a customer orders a signature seafood risotto (an incoming HTTP request), the Executive Chef at the cooking station (your route handler) should not have to leave the stove, walk to the walk-in cooler, butcher a fish, wash and chop leeks, simmer fish stock for two hours, and sanitize cutting boards. If the executive chef had to do all of that manual prep inside every single recipe, ticket times would explode, kitchen hygiene checks would get skipped during rush hour, and you could never change seafood suppliers without retraining the head chef.

Instead, the kitchen relies on a dedicated **prep crew** (the Dependency Injection system):

- **The Recipe Declaration (`Depends`)**: The chef posts a recipe card at the station stating: *"To cook this dish, I need 200g arborio rice, 1 cup simmering seafood stock, and an authenticated station clearance."*
- **Hierarchical Prep (Sub-dependencies)**: The prep crew sees that the seafood stock itself requires roasted fish bones, mirepoix, and filtered water. The prep crew prepares those foundational items first, brews the stock, and brings the finished cup to the chef.
- **Sharing Prep Work (`use_cache=True`)**: If three orders on the same table require the same seafood stock, the prep crew brews one batch and portions it out across all three stations instead of running three separate stockpots.
- **Quality Control Gate (Validation & Auth)**: If the fish smells spoiled or the health inspection token is expired, the prep station halts the order immediately. The ticket is rejected before the executive chef ever touches a pan (a `401 Unauthorized` or `422 Unprocessable Entity` response).
- **Cleanup and Breakdown (`yield` Teardown)**: Once the chef finishes plating the dish and hands it to the server (the HTTP response is sent), the prep crew sweeps the station, washes the pans, and turns off the gas burners (`finally: db.close()`).

The Executive Chef focuses purely on cooking the dish using pre-validated, pre-assembled ingredients.

---

## 3. How It Actually Works — The Full Explanation

FastAPI's dependency injection system operates on **callables**, builds a **Directed Acyclic Graph (DAG)** of dependencies at startup, resolves them concurrently or sequentially per request, caches results within the request scope, and handles teardown via Python context managers.

```
Incoming Request
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ FastAPI Dependency Graph (DAG) Resolution                   │
│                                                             │
│         get_settings()                                      │
│               │                                             │
│               ▼                                             │
│         get_db_engine()                                     │
│               │                                             │
│               ▼                                             │
│         get_db_session() (yield setup) ──┐                  │
│               │                          │ (Shared Session) │
│               ▼                          │                  │
│    get_current_user(token, db) ◄─────────┘                  │
│               │                                             │
│               ▼                                             │
│    check_permissions(user)                                  │
└─────────────────────────────────────────────────────────────┘
       │ (All dependencies resolved & validated)
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Route Handler Execution: get_invoices(db, user)             │
│ (Executes core business logic, returns data)                │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Response Serialization & Teardown Execution                 │
│ (Executes code after `yield` in reverse order: db.close())  │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
Outgoing HTTP Response
```

**1. What Qualifies as a Dependency?**

In FastAPI, a dependency is **any Python callable**. This includes:
- **Standard functions** (`def` or `async def`): A function that takes request parameters and returns a value.
- **Generator functions** (`yield`): A function that yields a value for the route handler and runs cleanup code after the response is sent.
- **Classes**: In Python, classes are callables (calling `MyClass()` executes `__new__` and `__init__`). FastAPI inspects the `__init__` signature and extracts parameters from the request.
- **Class instances with `__call__`**: An instantiated object with state that acts like a function, perfect for parameterized dependencies (such as permission checkers configured with specific role lists).

**2. Dependency Graph and Sub-Dependencies**

Dependencies can depend on other dependencies. When you write:

```python
def get_db(): ...
def get_current_user(token: Annotated[str, Header()], db: Annotated[Session, Depends(get_db)]): ...
def get_current_active_user(current_user: Annotated[User, Depends(get_current_user)]): ...
```

FastAPI uses Python's `inspect` module and Pydantic field reflection at application startup to build a dependency graph. For every incoming request:
- It inspects what parameters the leaf dependencies need (headers, cookies, query parameters, path parameters, or body payloads).
- It parses and validates those inputs using Pydantic.
- It calls the lowest-level dependencies first, passing their return values up the chain.
- If any dependency raises an `HTTPException`, execution stops immediately, and FastAPI returns the error response without executing the route handler or any further dependencies.

**3. Per-Request Result Caching (`use_cache=True`)**

By default, `Depends(dependency_callable, use_cache=True)` is enabled. 

If three different dependencies in your graph (or the route handler itself) all require `Depends(get_db)`, FastAPI will invoke `get_db()` **only once per HTTP request**. It stores the return value in an internal dictionary keyed by the callable and passes that exact same reference to all consumers within that request.

If you have a stateful dependency that must produce a fresh value every time it is evaluated in the graph, you explicitly pass `use_cache=False`.

**4. Generator Dependencies (`yield`) and the Exit Lifecycle**

When a dependency manages a resource that requires cleanup (like a database transaction, an open file, or a network socket), you write it as a generator using `yield`:

```python
def get_db():
    db = SessionLocal()
    try:
        yield db  # <-- Handed to the endpoint
    finally:
        db.close()  # <-- Executed after response is sent
```

FastAPI wraps generator dependencies in an internal Python `AsyncExitStack`. The lifecycle proceeds in strict order:
- Code before the `yield` runs prior to the endpoint execution.
- The yielded value is injected into the endpoint (and any sub-dependencies).
- The route handler runs and produces a response.
- The response is sent to the client (or an exception is caught).
- Code after the `yield` (inside the `finally` block) executes, cleaning up the resource in reverse order of creation (Last-In, First-Out / LIFO).

**5. Modern `Annotated` Type Hints vs Legacy Default Arguments**

In older FastAPI codebases, dependencies were declared as default argument values:

```python
# Legacy syntax (discouraged in modern FastAPI)
@app.get("/items")
def read_items(db: Session = Depends(get_db)):
    ...
```

Modern Python (3.9+ via `typing.Annotated` or `typing_extensions.Annotated`) enables placing the dependency metadata directly inside the type hint:

```python
# Modern syntax (standard)
from typing import Annotated

@app.get("/items")
def read_items(db: Annotated[Session, Depends(get_db)]):
    ...
```

Why `Annotated` is objectively superior:
- **Clean Signatures for Pure Unit Testing**: In the legacy syntax, the default value of `db` is a `params.Depends` object at runtime. If you want to call `read_items(mock_db)` in a pure unit test without FastAPI's test client, you cannot rely on standard keyword argument defaults properly. With `Annotated`, the parameter has no default value; it is recognized as a required `Session` object by your IDE, linter, and static type checker (MyPy/Pyright).
- **Reusable Domain Type Aliases**: You can define your dependencies once in a central types module and reuse them across hundreds of routes:
  ```python
  DatabaseSession = Annotated[Session, Depends(get_db)]
  CurrentUser = Annotated[User, Depends(get_current_user)]
  PaginationParams = Annotated[Pagination, Depends(Pagination)]

  @app.get("/items")
  def read_items(db: DatabaseSession, user: CurrentUser, page: PaginationParams):
      ...
  ```
  Route signatures become exceptionally clean, expressive, and self-documenting.

**6. Dependency Scopes: Endpoint vs Router vs Global**

FastAPI supports dependency injection at four distinct levels:
- **Endpoint Parameter (`Annotated[T, Depends(...)]`)**: Runs for that specific route and injects its return value directly into the handler's parameters.
- **Route Decorator (`@app.get("/path", dependencies=[Depends(...)])`)**: Runs for that specific route for side-effects (e.g., authentication, IP filtering, request logging). The return value is **not** injected into the function.
- **Router Level (`APIRouter(dependencies=[Depends(...)])`)**: Applied to every endpoint mounted on that `APIRouter`. Perfect for domain-level security (e.g., securing all `/admin` routes with an admin role check).
- **Application Global Level (`FastAPI(dependencies=[Depends(...)])`)**: Runs on every single request entering the entire application before any router or endpoint logic executes.

---

## 4. Real Code — See It Working

Here is a complete, production-grade example demonstrating function dependencies with `yield`, sub-dependencies, modern `Annotated` type aliases, parameterized class-based security checkers, and test overrides.

```python
from typing import Annotated, Generator, List
from fastapi import FastAPI, Depends, HTTPException, Header, status, APIRouter
from pydantic import BaseModel

app = FastAPI(title="Inventory API")

# --- Mock Database & Models ---
class User(BaseModel):
    username: str
    roles: List[str]

class Item(BaseModel):
    id: int
    name: str
    owner: str

class FakeDBSession:
    """Simulates a database session with transaction management and cleanup."""
    def __init__(self):
        self.closed = False

    def close(self):
        self.closed = True

# --- 1. Generator Dependency (Database Lifecycle) ---
def get_db() -> Generator[FakeDBSession, None, None]:
    db = FakeDBSession()
    try:
        # Setup phase: runs before route handler
        yield db
    finally:
        # Teardown phase: guaranteed to run after response serialization
        db.close()

# Reusable Type Alias
DbSession = Annotated[FakeDBSession, Depends(get_db)]

# --- 2. Sub-Dependency (Authentication & Token Extraction) ---
def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: DbSession = None,
) -> User:
    # Header validation
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = authorization.split(" ")[1]
    
    # Simulate user lookup using the injected db session
    if token == "admin-token":
        return User(username="alice_admin", roles=["admin", "user"])
    elif token == "user-token":
        return User(username="bob_user", roles=["user"])
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication token",
    )

CurrentUser = Annotated[User, Depends(get_current_user)]

# --- 3. Parameterized Class Dependency (Role-Based Access Control) ---
class RequireRole:
    """Callable class enabling parameterized dependency injection."""
    def __init__(self, allowed_roles: List[str]):
        # Store configuration state during instantiation
        self.allowed_roles = allowed_roles

    def __call__(self, user: CurrentUser) -> User:
        # Evaluated on every request when FastAPI invokes the instance
        if not any(role in self.allowed_roles for role in user.roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation requires one of the following roles: {self.allowed_roles}",
            )
        return user

# --- 4. Class-Based Common Query Parameters ---
class PaginationParams:
    """Class dependency where FastAPI extracts query params into __init__."""
    def __init__(self, skip: int = 0, limit: int = 20):
        self.skip = max(0, skip)
        self.limit = min(max(1, limit), 100)

Pagination = Annotated[PaginationParams, Depends(PaginationParams)]

# --- 5. Routers with Layered Dependencies ---
admin_router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    # Router-level dependency: guards all routes inside this router
    dependencies=[Depends(RequireRole(["admin"]))],
)

@admin_router.get("/metrics")
def get_system_metrics(db: DbSession):
    return {"status": "healthy", "db_closed": db.closed}

app.include_router(admin_router)

# --- 6. Endpoints Using Reusable Type Aliases ---
@app.get("/items", response_model=List[Item])
def list_items(
    db: DbSession,
    user: CurrentUser,
    page: Pagination,
):
    # Route logic is clean: zero manual header parsing, zero auth code, zero db cleanup
    all_items = [
        Item(id=1, name="Laptop", owner="alice_admin"),
        Item(id=2, name="Monitor", owner="bob_user"),
        Item(id=3, name="Keyboard", owner="bob_user"),
    ]
    return all_items[page.skip : page.skip + page.limit]

@app.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: int,
    db: DbSession,
    # Specific endpoint-level permission check
    admin_user: Annotated[User, Depends(RequireRole(["admin"]))],
):
    # Only reachable if caller has 'admin' role
    return None
```

### Dependency Overrides in Tests

To test the application above without generating real JWT tokens or connecting to a live database, FastAPI allows replacing any dependency callable in `app.dependency_overrides`:

```python
from fastapi.testclient import TestClient

client = TestClient(app)

def test_admin_metrics_with_override():
    # Define test double
    def mock_get_current_user():
        return User(username="test_admin", roles=["admin"])

    # Override the original dependency callable
    app.dependency_overrides[get_current_user] = mock_get_current_user

    try:
        response = client.get("/admin/metrics")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy", "db_closed": False}
    finally:
        # ALWAYS clear overrides to avoid polluting subsequent tests
        app.dependency_overrides.clear()
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is `Depends()` and how does FastAPI's Dependency Injection system work under the hood?**

`Depends()` is a function that marks a parameter as requiring resolution by FastAPI's dependency injection container. Under the hood, FastAPI analyzes all `Depends()` declarations at application startup using Python's `inspect` module and Pydantic. It builds a Directed Acyclic Graph (DAG) of callables. 

When an HTTP request arrives, FastAPI traverses this graph, extracts needed request data (headers, query params, cookies, body), validates them, and invokes each dependency in topological order. Results are cached per request by default (`use_cache=True`), ensuring shared sub-dependencies (like database sessions) execute only once. If any dependency raises an `HTTPException`, execution halts and returns the error immediately without executing subsequent nodes.

---

**Q: Why is `Annotated[Session, Depends(get_db)]` preferred over `db: Session = Depends(get_db)`?**

There are three major architectural advantages:
1. **Direct Unit Testing**: With the legacy default value syntax (`db: Session = Depends(get_db)`), the runtime default value of `db` is a framework object (`Depends`). If you call the function directly in a unit test without FastAPI (`my_endpoint(mock_session)`), type checkers complain and omitting parameters produces runtime errors. With `Annotated`, the parameter has no default value and behaves like a standard required argument.
2. **Static Typing Integrity**: `Annotated[Type, Metadata]` keeps the type signature purely as `Session`. Type checkers (Pyright, MyPy) and IDE auto-complete see `Session` rather than confusing it with a default framework assignment.
3. **Reusable Type Aliases**: You can define `DbSession = Annotated[Session, Depends(get_db)]` once in your codebase. Route signatures become clean and readable (`def read_users(db: DbSession)`), eliminating repetitive imports of `Depends` and `get_db` across route modules.

---

**Q: How do `yield` dependencies execute, and what guarantees does FastAPI make about cleanup?**

A `yield` dependency is a Python generator function used for resource management. FastAPI executes the code prior to the `yield` statement before calling the route handler. The yielded value is injected into the endpoint. 

Once the route handler returns a response and the response is sent to the client, FastAPI's internal `AsyncExitStack` resumes the generator, executing the code immediately following `yield` (the teardown block). If an unhandled exception occurs inside the route handler, FastAPI still guarantees execution of the `finally` block in the generator. Teardown runs in Last-In, First-Out (LIFO) order relative to dependency creation.

---

**Q: How does FastAPI's dependency caching (`use_cache=True`) work within a single request?**

When resolving dependencies for a request, FastAPI maintains a request-scoped dictionary of `{callable: return_value}`. If multiple sub-dependencies or endpoints request the same dependency function (for example, `get_db` is needed by `get_current_user`, `verify_tenant`, and the endpoint itself), FastAPI executes `get_db()` on the first encounter, stores the session object, and returns that cached instance for all subsequent requests in that same HTTP cycle. 

This guarantees that a single HTTP request operates within a single, consistent database transaction or identity map. Caching is scoped strictly to that individual request and is discarded when the response finishes. If you need a new instance every time (e.g., a unique request UUID or timestamp generator), you pass `Depends(get_uuid, use_cache=False)`.

---

**Q: How do you implement parameterized or stateful dependencies in FastAPI?**

You implement a class that stores configuration during instantiation (`__init__`) and implements the magic method `__call__`. 

Because Python instances with `__call__` are callable, they can be passed directly to `Depends(instance)`. For example, for role-based authorization, you create a `RoleChecker` class whose `__init__` accepts `allowed_roles: list[str]`, and whose `__call__` accepts `current_user: Annotated[User, Depends(get_current_user)]`. You instantiate reusable guards like `require_admin = RoleChecker(["admin"])` and use them in routes via `Depends(require_admin)`. FastAPI inspects the `__call__` method just like a normal function and resolves its sub-dependencies automatically.

---

**Q: What is the difference between route-level `dependencies=[Depends(...)]` and endpoint parameter `Depends(...)`?**

An endpoint parameter dependency (`def route(user: Annotated[User, Depends(...)])`) resolves the dependency and **injects its return value** directly into the handler function as a variable.

A route-level, router-level, or global dependency (`dependencies=[Depends(...)]`) executes the dependency for its **side effects** (such as authentication verification, rate limiting, request logging, or header validation). If the dependency raises an exception, the route is blocked; however, the dependency's return value is discarded and **not passed** into the route handler signature.

---

**Q: How does `app.dependency_overrides` work in testing, and what is the critical rule when using it?**

`app.dependency_overrides` is a Python dictionary provided by FastAPI that maps an original dependency callable to a replacement callable or mock function (`app.dependency_overrides[get_db] = override_get_db`). 

During test execution with `TestClient` or `AsyncClient`, FastAPI checks this dictionary before resolving any node in the dependency graph. If an override exists, it executes the replacement instead of the real dependency. 

The critical rule is that `app.dependency_overrides` modifies global application state. You must always clear it (`app.dependency_overrides.clear()`) in test teardown blocks or via pytest fixtures (`yield` fixture teardown) to prevent mock leakage and state contamination across test suites.

---

## 6. The Traps — What Goes Wrong

**Trap 1: Catching and Swallowing Exceptions in `yield` Dependencies**

If you write a `try...except Exception` block inside a `yield` dependency to catch database errors, you might accidentally catch Starlette's internal exceptions (like `HTTPException` or client disconnects) and prevent FastAPI from handling them:

```python
# BROKEN: Catches HTTPException raised by route handlers or sub-dependencies!
def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        # Trap: If an endpoint raises HTTPException(404), this catches it,
        # suppresses it, and doesn't re-raise, resulting in unhandled 500s or swallowed errors!
    finally:
        db.close()

# CORRECT: Let exceptions bubble or catch specific database driver errors
def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise  # Re-raise so FastAPI's exception handlers process the error properly
    finally:
        db.close()
```

**Trap 2: Blocking the Event Loop with Synchronous Code in `async def` Dependencies**

FastAPI handles `def` and `async def` dependencies differently:
- If a dependency is defined with regular `def`, FastAPI runs it in an external worker thread pool (via `anyio.to_thread.run_sync`), preventing it from blocking the main thread.
- If a dependency is defined with `async def`, FastAPI runs it directly on the main event loop thread.

If you put blocking, synchronous I/O (like `time.sleep()`, synchronous `requests.get()`, or blocking SQLAlchemy queries) inside an `async def` dependency, **you block the entire server event loop**. All concurrent user requests will freeze.

```python
# DEADLY: Sync I/O inside an async dependency
async def get_db_bad():
    db = SessionLocal() # Sync SQLAlchemy session creation
    time.sleep(1)       # Blocks the entire event loop for 1 second!
    try:
        yield db
    finally:
        db.close()

# FIXED: Use regular def for synchronous drivers
def get_db_sync():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

**Trap 3: Expecting `dependencies=[Depends(...)]` to Inject Parameter Values**

Developers frequently configure router-level authentication via `router = APIRouter(dependencies=[Depends(get_current_user)])` and then wonder why `user` is not available inside the router's endpoint handlers:

```python
# BROKEN EXPECTATION
router = APIRouter(dependencies=[Depends(get_current_user)])

@router.get("/profile")
def get_profile():
    # Error: get_current_user ran and verified the token,
    # but its returned User object was not injected into this function!
    return {"user": "Where is my user object?"}

# CORRECT: Combine router-level guards with endpoint injection if data is needed
@router.get("/profile")
def get_profile(current_user: CurrentUser):
    # Because use_cache=True, get_current_user does NOT execute twice;
    # it ran during router check and returns cached User here.
    return {"username": current_user.username}
```

**Trap 4: Mutating Shared Cached Dependencies with `use_cache=True`**

Because FastAPI shares the return value of a dependency across the entire request graph, mutating an object returned by a dependency in one place mutates it for all downstream consumers in that request:

```python
# DANGEROUS: Returning a mutable dict or object that gets modified downstream
def get_request_context():
    return {"tags": []}

def add_audit_tag(ctx: Annotated[dict, Depends(get_request_context)]):
    ctx["tags"].append("audited")
    return ctx

@app.get("/items")
def read_items(
    ctx1: Annotated[dict, Depends(get_request_context)],
    ctx2: Annotated[dict, Depends(add_audit_tag)],
):
    # ctx1 and ctx2 point to the EXACT SAME dictionary in memory!
    # ctx1["tags"] now unexpectedly contains ["audited"]
    ...
```

If you intend for a dependency to produce fresh, independent instances across sub-dependencies, explicitly declare `Depends(factory_function, use_cache=False)`.

---

## 7. Compare With Related Concepts

**`Depends()` vs Direct Function Calls**
- **Direct Function Call (`db = get_db()` inside route)**: Requires manual argument passing, manual sub-dependency retrieval, manual `try...finally` lifecycle management, manual request data extraction, and impossible test overriding without monkey-patching.
- **`Depends()`**: FastAPI manages the call timing, extracts request parameters automatically, validates inputs with Pydantic, shares identical instances across the request via caching, guarantees cleanup via `yield`, and provides `app.dependency_overrides`.
- **Rule**: Use direct function calls for pure, stateless business utility functions (e.g., `calculate_tax(amount)`). Use `Depends()` for anything that needs request context, headers, authentication, database sessions, or test mocking.

**`Depends()` vs Starlette Middleware (`BaseHTTPMiddleware`)**
- **Middleware**: Executes at the raw ASGI layer before routing happens. It wraps the entire request/response cycle globally. However, middleware cannot access route-specific type hints, cannot access path parameters (routing hasn't executed yet), does not reflect in OpenAPI docs, and introduces async context-switching overhead.
- **`Depends()`**: Executes at the routing layer after path parameters and endpoint signatures are known. Dependencies can be applied per-endpoint, per-router, or globally, have full access to validated Pydantic models, and automatically document required headers/query params in Swagger UI.
- **Rule**: Use Middleware for raw HTTP-level, route-agnostic concerns (CORS, GZip compression, Prometheus timing metrics, global correlation IDs). Use `Depends()` for business logic, authentication, authorization, database sessions, and data validation.

**`Depends()` vs Python Decorators (`@login_required`)**
- **Python Decorators**: Wrap function execution. While they can block execution, they struggle to cleanly inject return values into function arguments without messing up signature reflection, cannot declare sub-dependencies, and do not inform OpenAPI documentation generators.
- **`Depends()`**: Fully integrated with Python typing and OpenAPI. Injects validated return values directly into handler parameters and generates complete Swagger/Redoc documentation.
- **Rule**: In FastAPI, replace route-level decorators with `Depends()`.

---

## 8. 🧠 The Memory Hook

> **The Prep Crew Rule**: *Route handlers are executive chefs who only cook; `Depends()` is the prep crew that washes, slices, validates freshness, shares ingredients across orders, and washes the pans when dinner is served.*
