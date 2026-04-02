# FastAPI / Python Backend Interview Question Bank

A focused collection of **50 real-world FastAPI interview questions** covering everything from core fundamentals to production deployment. Each answer is concise, practical, and packed with code examples and interviewer takeaways.

---

## Question Index

| # | Question | Group |
|---|----------|-------|
| 1 | What is FastAPI and what makes it different from Flask/Django? | Core Fundamentals |
| 2 | What is ASGI and how does it differ from WSGI? | Core Fundamentals |
| 3 | What is Starlette and what role does it play in FastAPI? | Core Fundamentals |
| 4 | How does FastAPI generate OpenAPI docs automatically? | Core Fundamentals |
| 5 | What are path parameters vs query parameters in FastAPI? | Core Fundamentals |
| 6 | What is Pydantic and why does FastAPI use it? | Pydantic & Validation |
| 7 | How do you validate nested models with Pydantic? | Pydantic & Validation |
| 8 | What is `Field()` in Pydantic and when would you use it? | Pydantic & Validation |
| 9 | How do you create custom validators in Pydantic v2? | Pydantic & Validation |
| 10 | What is `response_model` and how does it protect your API? | Pydantic & Validation |
| 11 | What is dependency injection in FastAPI? | Dependency Injection |
| 12 | How do you share a database session across a request using DI? | Dependency Injection |
| 13 | What is `Depends` and how does dependency caching work? | Dependency Injection |
| 14 | How do you create reusable security dependencies? | Dependency Injection |
| 15 | What are class-based dependencies and when are they useful? | Dependency Injection |
| 16 | How does FastAPI handle async endpoints? | Async & Concurrency |
| 17 | When should you use `async def` vs `def` in FastAPI? | Async & Concurrency |
| 18 | What are background tasks and how do you use them? | Async & Concurrency |
| 19 | How do you run CPU-bound work without blocking the event loop? | Async & Concurrency |
| 20 | What is the lifespan context manager in FastAPI? | Async & Concurrency |
| 21 | How do you implement JWT authentication in FastAPI? | Auth & Security |
| 22 | What is OAuth2 with Password flow in FastAPI? | Auth & Security |
| 23 | How do you protect routes with role-based access control? | Auth & Security |
| 24 | How do you add CORS middleware in FastAPI? | Auth & Security |
| 25 | What are security best practices for FastAPI APIs? | Auth & Security |
| 26 | How do you write custom middleware in FastAPI? | Middleware & Error Handling |
| 27 | How does FastAPI error handling work with `HTTPException`? | Middleware & Error Handling |
| 28 | How do you create custom exception handlers? | Middleware & Error Handling |
| 29 | What is request validation error handling? | Middleware & Error Handling |
| 30 | How do you add request ID / logging middleware? | Middleware & Error Handling |
| 31 | How do you integrate SQLAlchemy with FastAPI? | Database & ORM |
| 32 | How do you handle async database access with SQLAlchemy? | Database & ORM |
| 33 | What is Alembic and how do you manage migrations? | Database & ORM |
| 34 | What is the repository pattern and why use it with FastAPI? | Database & ORM |
| 35 | How do you handle database connection pooling? | Database & ORM |
| 36 | How do you test FastAPI endpoints? | Testing |
| 37 | How do you mock dependencies in FastAPI tests? | Testing |
| 38 | How do you test async endpoints with `pytest-asyncio`? | Testing |
| 39 | How do you test authentication-protected endpoints? | Testing |
| 40 | What is TestClient and how does it differ from `httpx.AsyncClient`? | Testing |
| 41 | How do you serve FastAPI with Uvicorn in production? | Deployment & Performance |
| 42 | How do you configure Gunicorn + Uvicorn workers? | Deployment & Performance |
| 43 | How do you containerize a FastAPI app with Docker? | Deployment & Performance |
| 44 | How do you implement rate limiting in FastAPI? | Deployment & Performance |
| 45 | How do you add health check and readiness endpoints? | Deployment & Performance |
| 46 | How do you structure a large FastAPI application? | Advanced Patterns |
| 47 | How do you implement WebSocket endpoints in FastAPI? | Advanced Patterns |
| 48 | How do you stream large responses in FastAPI? | Advanced Patterns |
| 49 | How do you use FastAPI with an event-driven architecture? | Advanced Patterns |
| 50 | How do you version a FastAPI API? | Advanced Patterns |

---

## Group 1 — Core Fundamentals

### Q1. What is FastAPI and what makes it different from Flask/Django?

**Summary:** FastAPI is a modern, high-performance Python web framework built on top of Starlette and Pydantic. It uses Python type hints to drive automatic validation, serialisation, and interactive documentation.

**Key differences:**

| Feature | FastAPI | Flask | Django |
|---------|---------|-------|--------|
| Type safety | ✅ Built-in via type hints | ❌ Manual | ❌ Manual |
| Auto docs (OpenAPI) | ✅ Out of the box | ❌ Plugin needed | ❌ Plugin needed |
| Async support | ✅ First-class | ⚠️ Extension | ⚠️ Limited |
| Performance | 🚀 Very high (ASGI) | Medium (WSGI) | Medium (WSGI) |
| Built-in validation | ✅ Pydantic | ❌ | ✅ (forms/serialisers) |
| DI system | ✅ Built-in | ❌ | ❌ |

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str
    price: float

@app.post("/items/", response_model=Item)
async def create_item(item: Item):
    return item
```

**Interview takeaway:** FastAPI is not opinionated about project structure (like Flask) but adds auto-validation and docs generation that Flask lacks, while being faster than both because it is ASGI-native.

---

### Q2. What is ASGI and how does it differ from WSGI?

**Summary:** ASGI (Asynchronous Server Gateway Interface) is the successor to WSGI that supports async I/O, WebSockets, and HTTP/2. WSGI is synchronous — one request at a time per thread.

**Details:**

- **WSGI** (PEP 3333): synchronous `def application(environ, start_response)`. Servers like Gunicorn spawn multiple synchronous workers.
- **ASGI** (spec): `async def application(scope, receive, send)`. A single process can handle thousands of concurrent connections by yielding the event loop during I/O.

```python
# Minimal ASGI app (no framework)
async def app(scope, receive, send):
    if scope["type"] == "http":
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"Hello"})
```

**Common pitfall:** Mixing blocking (synchronous) code inside `async def` handlers stalls the event loop. Always `await` I/O operations or offload CPU work to a thread pool.

---

### Q3. What is Starlette and what role does it play in FastAPI?

**Summary:** Starlette is a lightweight ASGI toolkit. FastAPI *inherits* from `Starlette`, using it for routing, middleware, WebSockets, background tasks, static files, and the test client.

**Details:**

- FastAPI adds the Pydantic-powered request/response layer, OpenAPI generation, and the `Depends` DI system on top of Starlette.
- You can use raw `starlette.responses`, `starlette.requests`, `starlette.middleware`, etc. directly inside a FastAPI app.

```python
from starlette.responses import PlainTextResponse
from fastapi import FastAPI

app = FastAPI()

@app.get("/raw")
async def raw():
    return PlainTextResponse("Hello from Starlette!")
```

**Interview takeaway:** FastAPI ≈ Starlette + Pydantic + OpenAPI generation. Understanding Starlette helps you work with lower-level constructs like middleware and background tasks.

---

### Q4. How does FastAPI generate OpenAPI docs automatically?

**Summary:** FastAPI inspects function signatures, type annotations, `response_model`, docstrings, and Pydantic models at startup to build a JSON OpenAPI schema, served at `/openapi.json`. Swagger UI (`/docs`) and ReDoc (`/redoc`) are rendered from this schema.

```python
@app.get(
    "/users/{user_id}",
    summary="Get user by ID",
    response_model=UserOut,
    responses={404: {"description": "User not found"}},
)
async def get_user(user_id: int):
    """Return a single user. Raises 404 if not found."""
    ...
```

**Customising:**
```python
app = FastAPI(
    title="My API",
    version="1.0.0",
    openapi_url="/api/v1/openapi.json",
    docs_url="/api/v1/docs",
)
```

**Interview takeaway:** You can disable docs in production with `docs_url=None, redoc_url=None`. OpenAPI schema can be extended via `openapi_extra` on individual routes.

---

### Q5. What are path parameters vs query parameters in FastAPI?

**Summary:** Path parameters are part of the URL path (`/items/{item_id}`). Query parameters are key-value pairs after `?` (`/items?skip=0&limit=10`). FastAPI differentiates them purely from the function signature.

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/items/{item_id}")
async def read_item(
    item_id: int,          # path parameter — appears in the URL path
    q: str | None = None,  # query parameter — optional, after ?
    limit: int = 10,       # query parameter — with default
):
    return {"item_id": item_id, "q": q, "limit": limit}
```

**Common pitfalls:**
- Declare path parameters with matching names in the decorator and function.
- Use `Path(ge=1)` for extra path-parameter validation.
- Optional query params use `= None`; required ones have no default.

```python
from fastapi import Path, Query

@app.get("/items/{item_id}")
async def read_item(
    item_id: int = Path(..., ge=1, description="Must be positive"),
    q: str = Query(None, min_length=3),
):
    ...
```

---

## Group 2 — Pydantic & Validation

### Q6. What is Pydantic and why does FastAPI use it?

**Summary:** Pydantic is a data validation library that uses Python type annotations to parse and validate data at runtime. FastAPI uses it to automatically parse request bodies, validate inputs, and serialise responses.

```python
from pydantic import BaseModel, EmailStr
from datetime import datetime

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    age: int
    created_at: datetime = None

# FastAPI auto-parses JSON → UserCreate, returning 422 on failure
@app.post("/users/")
async def create_user(user: UserCreate):
    return user
```

**Interview takeaway:** Pydantic v2 (used by FastAPI ≥ 0.100) is implemented in Rust — validation is ~5–50× faster than v1. Models are immutable by default in v2; use `model_config = ConfigDict(frozen=False)` to allow mutation.

---

### Q7. How do you validate nested models with Pydantic?

**Summary:** Nest one Pydantic model inside another as a field type. Pydantic recursively validates and serialises the entire object tree.

```python
from pydantic import BaseModel
from typing import List

class Address(BaseModel):
    street: str
    city: str
    zip_code: str

class Order(BaseModel):
    id: int
    items: List[str]
    shipping_address: Address  # nested model

# Accepts:
# {"id": 1, "items": ["book"], "shipping_address": {"street": "1 Main St", "city": "NYC", "zip_code": "10001"}}
```

**Common pitfalls:**
- Deep nesting increases serialisation overhead — flatten where possible.
- Use `model_validate` (v2) or `parse_obj` (v1) to construct from dicts.
- Circular references require `model_rebuild()` after all classes are defined.

---

### Q8. What is `Field()` in Pydantic and when would you use it?

**Summary:** `Field()` provides metadata and validation constraints beyond what type hints alone express: default values, aliases, min/max, regex patterns, descriptions for docs, and more.

```python
from pydantic import BaseModel, Field

class Product(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Product name")
    price: float = Field(..., gt=0, description="Must be positive")
    sku: str = Field(..., pattern=r"^[A-Z]{3}-\d{4}$")
    tags: list[str] = Field(default_factory=list)

    # Use alias when JSON key differs from Python attribute name
    external_id: str = Field(..., alias="externalId")
```

**Interview takeaway:** Use `alias` + `model_config = ConfigDict(populate_by_name=True)` in Pydantic v2 to accept both the alias and the Python name. This is essential when integrating with camelCase JavaScript clients.

---

### Q9. How do you create custom validators in Pydantic v2?

**Summary:** Use `@field_validator` for single-field validation and `@model_validator` for cross-field validation.

```python
from pydantic import BaseModel, field_validator, model_validator

class UserSignup(BaseModel):
    username: str
    password: str
    confirm_password: str

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not v.isalnum():
            raise ValueError("Username must be alphanumeric")
        return v.lower()

    @model_validator(mode="after")
    def passwords_match(self) -> "UserSignup":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self
```

**Common pitfalls:**
- `mode="before"` runs before type coercion; `mode="after"` runs after.
- In v2, `@field_validator` is a classmethod; in v1 it was `@validator`.
- `model_validator(mode="after")` receives the fully constructed model instance.

---

### Q10. What is `response_model` and how does it protect your API?

**Summary:** `response_model` tells FastAPI which Pydantic model to use when serialising the response. It strips any extra fields not in the model — preventing accidental data leaks (e.g., password hashes).

```python
class UserDB(BaseModel):
    id: int
    email: str
    hashed_password: str  # should never leave the server

class UserOut(BaseModel):
    id: int
    email: str

@app.get("/users/{user_id}", response_model=UserOut)
async def get_user(user_id: int):
    # Returns UserDB from DB, but FastAPI strips hashed_password
    return UserDB(id=user_id, email="a@b.com", hashed_password="secret")
```

**`response_model_exclude_unset=True`** — only serialise fields explicitly set, useful for PATCH endpoints.

**Interview takeaway:** Always define separate input and output models. Never return ORM objects directly without a `response_model` — it risks leaking sensitive fields.

---

## Group 3 — Dependency Injection

### Q11. What is dependency injection in FastAPI?

**Summary:** FastAPI's `Depends()` system lets you declare shared logic (DB sessions, auth, config) as reusable functions that are automatically called and injected into route handlers.

```python
from fastapi import Depends, FastAPI

app = FastAPI()

def get_current_user(token: str = Depends(oauth2_scheme)):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401)
    return user

@app.get("/profile")
async def profile(user = Depends(get_current_user)):
    return {"user": user.email}
```

**Benefits:**
- Separation of concerns
- Easy unit-test mocking via `app.dependency_overrides`
- Automatic cleanup with `yield` dependencies

---

### Q12. How do you share a database session across a request using DI?

**Summary:** Use a `yield` dependency. The session is created before the route runs, injected, then closed in the `finally` block after the response is sent.

```python
from sqlalchemy.orm import Session
from fastapi import Depends

def get_db():
    db = SessionLocal()
    try:
        yield db       # injected into the route handler
    finally:
        db.close()     # runs after response is sent

@app.get("/users/{user_id}")
def read_user(user_id: int, db: Session = Depends(get_db)):
    return db.query(User).filter(User.id == user_id).first()
```

**Common pitfalls:**
- Not closing the session leaks connections — always use `try/finally` or `with`.
- For async SQLAlchemy, use `AsyncSession` and `async_sessionmaker`.
- Don't use a module-level session; each request needs its own.

---

### Q13. What is `Depends` and how does dependency caching work?

**Summary:** Within a single request, FastAPI calls each `Depends` target **once** and reuses the result across all callers in that request (caching). Pass `use_cache=False` to force a fresh call.

```python
import uuid
from fastapi import Depends

def request_id():
    return str(uuid.uuid4())

# Both route params get the SAME request_id for one HTTP request
@app.get("/example")
async def example(
    id1: str = Depends(request_id),
    id2: str = Depends(request_id),  # cached — same value as id1
):
    return {"id1": id1, "id2": id2}  # identical

# Force fresh call per injection point:
async def example_no_cache(
    id1: str = Depends(request_id),
    id2: str = Depends(request_id, use_cache=False),  # new value
):
    ...
```

**Interview takeaway:** Dependency caching prevents redundant DB lookups (e.g., `get_current_user` called from both a route and a nested dependency resolves only once).

---

### Q14. How do you create reusable security dependencies?

**Summary:** Define auth logic as a dependency function and reuse it across routes or entire routers.

```python
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

bearer = HTTPBearer()

async def require_auth(
    credentials: HTTPAuthorizationCredentials = Security(bearer),
) -> dict:
    token = credentials.credentials
    payload = decode_jwt(token)  # your JWT decode logic
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload

# Apply to a single route
@app.get("/secure", dependencies=[Depends(require_auth)])
async def secure_route():
    return {"status": "ok"}

# Apply to ALL routes in a router
from fastapi import APIRouter
router = APIRouter(dependencies=[Depends(require_auth)])
```

---

### Q15. What are class-based dependencies and when are they useful?

**Summary:** A class with `__call__` (or a callable instance) can be used as a dependency. This is useful for parameterised dependencies where you want to pass configuration at definition time.

```python
from fastapi import Depends

class Paginator:
    def __init__(self, max_limit: int = 100):
        self.max_limit = max_limit

    def __call__(self, skip: int = 0, limit: int = 10):
        if limit > self.max_limit:
            limit = self.max_limit
        return {"skip": skip, "limit": limit}

strict_paginator = Paginator(max_limit=20)
loose_paginator = Paginator(max_limit=500)

@app.get("/items/")
async def list_items(pagination=Depends(strict_paginator)):
    return pagination
```

**Interview takeaway:** Class-based dependencies avoid closures and make dependencies easier to test (just instantiate and call). They're also useful for injecting external clients (Redis, S3) once at startup.

---

## Group 4 — Async & Concurrency

### Q16. How does FastAPI handle async endpoints?

**Summary:** FastAPI runs `async def` endpoints directly in the asyncio event loop. Regular `def` endpoints are run in a separate thread pool to avoid blocking the loop.

```python
import asyncio
import httpx

@app.get("/async-data")
async def async_data():
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api.example.com/data")
    return response.json()
```

**Under the hood:** FastAPI uses `anyio` to manage the event loop, making it compatible with both `asyncio` and `trio` backends.

**Common pitfalls:**
- Calling a synchronous blocking library (e.g., `requests.get`) inside `async def` blocks the entire event loop.
- Use `httpx.AsyncClient`, `aiofiles`, and async DB drivers in async routes.

---

### Q17. When should you use `async def` vs `def` in FastAPI?

**Summary:** Use `async def` when your code does async I/O (DB, HTTP, file). Use `def` for CPU-bound or synchronous library code — FastAPI will run it in a thread pool automatically.

| Scenario | Use |
|----------|-----|
| Async ORM (SQLAlchemy async) | `async def` |
| Sync ORM (SQLAlchemy sync) | `def` (auto thread pool) |
| `httpx.AsyncClient` | `async def` |
| `requests` library | `def` |
| CPU computation | `def` or offload explicitly |
| Pure logic, no I/O | Either (prefer `async def`) |

```python
# ✅ Correct — sync ORM with def
@app.get("/items/{id}")
def get_item(id: int, db: Session = Depends(get_db)):
    return db.query(Item).get(id)

# ✅ Correct — async ORM with async def
@app.get("/items/{id}")
async def get_item_async(id: int, db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(Item).where(Item.id == id))
    return result.scalar_one_or_none()
```

---

### Q18. What are background tasks and how do you use them?

**Summary:** `BackgroundTasks` lets you run functions *after* returning the HTTP response — ideal for sending emails, writing audit logs, or triggering notifications without making the client wait.

```python
from fastapi import BackgroundTasks

def send_welcome_email(email: str):
    # blocking email send — runs in thread pool
    email_client.send(to=email, subject="Welcome!")

@app.post("/register")
async def register(
    user: UserCreate,
    background_tasks: BackgroundTasks,
):
    created = create_user(user)
    background_tasks.add_task(send_welcome_email, email=user.email)
    return created  # returned immediately; email sent after
```

**Common pitfalls:**
- Background tasks run in the same process — a server restart cancels them.
- For reliability, use a proper task queue (Celery, ARQ, RQ) for production workloads.
- Pass all data by value (not DB sessions) since the session may be closed when the task runs.

---

### Q19. How do you run CPU-bound work without blocking the event loop?

**Summary:** Use `asyncio.run_in_executor` with `ProcessPoolExecutor` for CPU-heavy tasks (ML inference, image processing), or `loop.run_in_executor` with `ThreadPoolExecutor` for blocking I/O-bound sync libraries.

```python
import asyncio
from concurrent.futures import ProcessPoolExecutor

executor = ProcessPoolExecutor()

def heavy_computation(data: list) -> int:
    return sum(x ** 2 for x in data)  # CPU-bound

@app.post("/compute")
async def compute(data: list[int]):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, heavy_computation, data)
    return {"result": result}
```

**Interview takeaway:** Never use `multiprocessing.Pool` directly inside async code. `ProcessPoolExecutor` integrates with asyncio. For simple blocking calls, FastAPI's thread pool (used for `def` endpoints) is sufficient.

---

### Q20. What is the lifespan context manager in FastAPI?

**Summary:** The `lifespan` parameter replaces the deprecated `@app.on_event("startup"/"shutdown")`. It uses an `asynccontextmanager` to run setup code before startup and teardown code on shutdown.

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialise resources
    await database.connect()
    load_ml_model()
    print("App started")
    yield
    # Shutdown: clean up resources
    await database.disconnect()
    print("App stopped")

app = FastAPI(lifespan=lifespan)
```

**Interview takeaway:** `lifespan` is the recommended approach since FastAPI 0.93. It keeps startup and shutdown logic co-located and supports storing shared state on `app.state`.

---

## Group 5 — Auth & Security

### Q21. How do you implement JWT authentication in FastAPI?

**Summary:** Use `python-jose` (or `PyJWT`) to create/verify tokens, and FastAPI's `OAuth2PasswordBearer` to extract the token from the `Authorization: Bearer` header.

```python
from datetime import datetime, timedelta
from jose import JWTError, jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

SECRET_KEY = "your-secret-key"
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")

def create_access_token(data: dict, expires_delta: timedelta = timedelta(minutes=30)):
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + expires_delta
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.get("/me")
async def read_me(user_id: str = Depends(get_current_user)):
    return {"user_id": user_id}
```

---

### Q22. What is OAuth2 with Password flow in FastAPI?

**Summary:** OAuth2 Password flow accepts `username` + `password` via a form POST to `/token` and returns a JWT access token. FastAPI has first-class support via `OAuth2PasswordRequestForm`.

```python
from fastapi.security import OAuth2PasswordRequestForm
from fastapi import Depends

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect credentials")
    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}
```

**Common pitfalls:**
- Password flow is only recommended for first-party apps — never third-party OAuth.
- Always hash passwords with `bcrypt` (via `passlib`), never store plaintext.
- Add a refresh token mechanism for production use.

---

### Q23. How do you protect routes with role-based access control?

**Summary:** Extend your `get_current_user` dependency to return a user object with roles, then create role-checking dependencies that raise 403 if roles don't match.

```python
from fastapi import Depends, HTTPException

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    return verify_and_load_user(token)

def require_role(*roles: str):
    async def checker(user: User = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return checker

@app.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin: User = Depends(require_role("admin", "superuser")),
):
    ...
```

**Interview takeaway:** Keep role-checking in dependencies, not inside route handlers. This keeps the route body focused on business logic and makes access control easy to audit.

---

### Q24. How do you add CORS middleware in FastAPI?

**Summary:** Use `CORSMiddleware` from Starlette to control which origins can call your API from a browser.

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://myapp.com", "https://staging.myapp.com"],
    allow_credentials=True,    # needed for cookies/auth headers
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

**Common pitfalls:**
- `allow_origins=["*"]` with `allow_credentials=True` raises a CORS error — browsers reject wildcard + credentials.
- In development, `allow_origins=["*"]` is fine; restrict in production.
- Order matters: add CORS middleware *before* other middleware that might short-circuit the response.

---

### Q25. What are security best practices for FastAPI APIs?

**Summary:** A checklist of must-haves for production FastAPI deployments.

```python
# 1. Disable docs in production
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

# 2. Use HTTPS (configure at reverse proxy level — Nginx / Caddy)

# 3. Hash passwords with bcrypt
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
hashed = pwd_context.hash(plain_password)

# 4. Rate limiting (slowapi)
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

# 5. Validate Content-Type and payload size
from fastapi import Request
@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    if int(request.headers.get("content-length", 0)) > 10_000_000:
        return Response(status_code=413)
    return await call_next(request)

# 6. Use short-lived JWT tokens + refresh tokens
# 7. Store secrets in env vars, not source code
```

**Interview takeaway:** Security is layered. FastAPI handles input validation and auth; the infrastructure (TLS, firewall, rate limits) must be configured at the deployment level.

---

## Group 6 — Middleware & Error Handling

### Q26. How do you write custom middleware in FastAPI?

**Summary:** You can write middleware as a function using `@app.middleware("http")` or as a Starlette `BaseHTTPMiddleware` class. Middleware wraps every request/response cycle.

```python
import time
from fastapi import Request

# Function-based middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start
    response.headers["X-Process-Time"] = f"{duration:.4f}s"
    return response

# Class-based middleware (more reusable)
from starlette.middleware.base import BaseHTTPMiddleware

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Process-Time"] = f"{time.perf_counter() - start:.4f}s"
        return response

app.add_middleware(TimingMiddleware)
```

**Common pitfalls:** `call_next` consumes the request body stream. If you need to read the body in middleware, you must buffer it and reconstruct the request.

---

### Q27. How does FastAPI error handling work with `HTTPException`?

**Summary:** Raise `HTTPException` anywhere in your route or dependency. FastAPI catches it and returns a JSON error response with the given status code and detail.

```python
from fastapi import HTTPException

@app.get("/items/{item_id}")
async def get_item(item_id: int):
    item = fetch_item(item_id)
    if item is None:
        raise HTTPException(
            status_code=404,
            detail=f"Item {item_id} not found",
            headers={"X-Error": "resource-missing"},  # optional custom headers
        )
    return item
```

**Default response shape:**
```json
{"detail": "Item 42 not found"}
```

**Interview takeaway:** `HTTPException` is a regular Python exception — it can be raised inside dependencies, utilities, or anywhere in the call stack. FastAPI's exception handler catches it globally.

---

### Q28. How do you create custom exception handlers?

**Summary:** Use `@app.exception_handler(ExceptionType)` to override how specific exceptions are formatted in the response.

```python
from fastapi import Request
from fastapi.responses import JSONResponse

class InsufficientFundsError(Exception):
    def __init__(self, balance: float, amount: float):
        self.balance = balance
        self.amount = amount

@app.exception_handler(InsufficientFundsError)
async def insufficient_funds_handler(
    request: Request, exc: InsufficientFundsError
):
    return JSONResponse(
        status_code=402,
        content={
            "error": "insufficient_funds",
            "balance": exc.balance,
            "required": exc.amount,
        },
    )

@app.post("/pay")
async def pay(amount: float):
    if amount > get_balance():
        raise InsufficientFundsError(balance=get_balance(), amount=amount)
    return {"status": "paid"}
```

---

### Q29. What is request validation error handling?

**Summary:** When Pydantic validation fails on a request, FastAPI raises `RequestValidationError` and returns a 422 Unprocessable Entity with detailed field-level errors. You can override this handler.

```python
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for error in exc.errors():
        errors.append({
            "field": " → ".join(str(x) for x in error["loc"]),
            "message": error["msg"],
            "type": error["type"],
        })
    return JSONResponse(
        status_code=422,
        content={"errors": errors},
    )
```

**Interview takeaway:** Custom validation error handlers are useful when you want consistent API error shapes across your entire service (e.g., camelCase fields, different HTTP codes).

---

### Q30. How do you add request ID / logging middleware?

**Summary:** Generate a unique request ID per request, attach it to the response headers, and include it in structured logs for distributed tracing.

```python
import uuid
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        logger.info(
            "Request started",
            extra={"request_id": request_id, "path": request.url.path},
        )
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "Request completed",
            extra={"request_id": request_id, "status": response.status_code},
        )
        return response

app.add_middleware(RequestIDMiddleware)
```

**Interview takeaway:** In production, use `structlog` or `python-json-logger` for machine-parseable logs. The `X-Request-ID` header lets clients correlate frontend errors with backend logs.

---

## Group 7 — Database & ORM

### Q31. How do you integrate SQLAlchemy with FastAPI?

**Summary:** Create an `engine` and `SessionLocal` factory, define models extending `Base`, and inject a session per request using a `yield` dependency.

```python
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from fastapi import Depends

DATABASE_URL = "postgresql://user:pass@localhost/db"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/users/{user_id}")
def read_user(user_id: int, db: Session = Depends(get_db)):
    return db.query(User).filter(User.id == user_id).first()
```

---

### Q32. How do you handle async database access with SQLAlchemy?

**Summary:** Use `sqlalchemy.ext.asyncio` with `create_async_engine` and `AsyncSession`. Replace `psycopg2` with `asyncpg` as the driver.

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select

DATABASE_URL = "postgresql+asyncpg://user:pass@localhost/db"

engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_async_db():
    async with AsyncSessionLocal() as session:
        yield session

@app.get("/users/{user_id}")
async def read_user_async(user_id: int, db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
```

**Common pitfalls:**
- `expire_on_commit=False` prevents `DetachedInstanceError` when accessing attributes after commit.
- Use `asyncpg` for PostgreSQL, `aiosqlite` for SQLite in tests.

---

### Q33. What is Alembic and how do you manage migrations?

**Summary:** Alembic is SQLAlchemy's migration tool. It tracks schema changes as versioned migration scripts and applies them incrementally.

```bash
# Initialise Alembic
alembic init alembic

# alembic/env.py — point to your metadata
from app.models import Base
target_metadata = Base.metadata

# Auto-generate a migration from model changes
alembic revision --autogenerate -m "add users table"

# Apply all pending migrations
alembic upgrade head

# Roll back one migration
alembic downgrade -1

# View migration history
alembic history --verbose
```

**Interview takeaway:** Always review autogenerated migrations before applying — Alembic doesn't detect renames or complex constraint changes perfectly. Commit migration files to version control alongside model changes.

---

### Q34. What is the repository pattern and why use it with FastAPI?

**Summary:** The repository pattern abstracts database access behind an interface. Route handlers call repository methods instead of writing raw queries — making business logic testable without a real DB.

```python
from sqlalchemy.orm import Session
from app.models import User

class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, user_id: int) -> User | None:
        return self.db.query(User).filter(User.id == user_id).first()

    def create(self, email: str) -> User:
        user = User(email=email)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

# Dependency
def get_user_repo(db: Session = Depends(get_db)):
    return UserRepository(db)

@app.get("/users/{user_id}")
def get_user(user_id: int, repo: UserRepository = Depends(get_user_repo)):
    return repo.get_by_id(user_id)
```

**Interview takeaway:** The repository pattern makes it trivial to swap your DB (e.g., SQLite ↔ PostgreSQL) or mock data access in tests by overriding the dependency.

---

### Q35. How do you handle database connection pooling?

**Summary:** SQLAlchemy manages a connection pool automatically. Tune it with `pool_size`, `max_overflow`, and `pool_pre_ping` to match your database server's limits.

```python
engine = create_engine(
    DATABASE_URL,
    pool_size=10,          # maintained connections
    max_overflow=20,       # allowed burst above pool_size
    pool_pre_ping=True,    # test connections before use (handles DB restarts)
    pool_recycle=3600,     # recycle connections after 1 hour
)
```

**For async:**
```python
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)
```

**Common pitfalls:**
- `pool_size + max_overflow` must not exceed your PostgreSQL `max_connections` (default 100).
- With multiple Uvicorn/Gunicorn workers, each worker has its own pool — multiply accordingly.
- Use `NullPool` in test environments to avoid connection leaks between test cases.

---

## Group 8 — Testing

### Q36. How do you test FastAPI endpoints?

**Summary:** Use `TestClient` from `starlette.testclient` (synchronous) or `httpx.AsyncClient` for async tests. Both work without running a real server.

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_create_item():
    response = client.post("/items/", json={"name": "Foo", "price": 9.99})
    assert response.status_code == 200
    assert response.json()["name"] == "Foo"

def test_get_item_not_found():
    response = client.get("/items/9999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Item 9999 not found"
```

**Interview takeaway:** `TestClient` runs the full ASGI app in-process, including middleware and dependency injection. It's the fastest way to test without spinning up a server.

---

### Q37. How do you mock dependencies in FastAPI tests?

**Summary:** Use `app.dependency_overrides` to replace a dependency with a mock during tests. Reset overrides after each test.

```python
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.dependencies import get_current_user

client = TestClient(app)

def mock_user():
    return {"id": 1, "email": "test@example.com", "role": "admin"}

@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user] = mock_user
    yield
    app.dependency_overrides.clear()

def test_protected_route():
    response = client.get("/profile")
    assert response.status_code == 200

def test_db_override():
    fake_db = []
    app.dependency_overrides[get_db] = lambda: iter(fake_db)
    response = client.get("/users/1")
    app.dependency_overrides.clear()
    assert response.status_code == 404
```

---

### Q38. How do you test async endpoints with `pytest-asyncio`?

**Summary:** Use `pytest-asyncio` with `httpx.AsyncClient` for true async tests. Set `asyncio_mode = "auto"` in `pytest.ini` to avoid decorating every test.

```python
# pytest.ini
# [pytest]
# asyncio_mode = auto

import pytest
import httpx
from app.main import app

@pytest.mark.asyncio
async def test_async_endpoint():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        response = await client.get("/async-data")
    assert response.status_code == 200
```

**Common pitfalls:**
- `TestClient` runs the event loop synchronously — it can't be used inside `async def` tests.
- Prefer `httpx.AsyncClient` for async routes that use `await` internally.
- Use a separate test database with fixtures to prevent state bleed.

---

### Q39. How do you test authentication-protected endpoints?

**Summary:** Either override the auth dependency with `dependency_overrides`, or generate a real test token and pass it in the `Authorization` header.

```python
from fastapi.testclient import TestClient
from app.auth import create_access_token
from app.main import app

client = TestClient(app)

def get_auth_headers(user_id: int = 1) -> dict:
    token = create_access_token({"sub": str(user_id)})
    return {"Authorization": f"Bearer {token}"}

def test_protected_get():
    headers = get_auth_headers()
    response = client.get("/me", headers=headers)
    assert response.status_code == 200

def test_unauthenticated():
    response = client.get("/me")
    assert response.status_code == 401
```

**Interview takeaway:** Testing with real tokens verifies the full auth pipeline including JWT decoding. Use `dependency_overrides` when you want to skip auth entirely and focus on business logic.

---

### Q40. What is TestClient and how does it differ from `httpx.AsyncClient`?

**Summary:**

| Feature | `TestClient` | `httpx.AsyncClient` |
|---------|-------------|---------------------|
| Based on | `requests` | `httpx` |
| Sync/Async | Synchronous | Asynchronous |
| Use in `async def` test | ❌ | ✅ |
| WebSocket support | ✅ | ❌ |
| Startup/shutdown hooks | ✅ | ✅ |
| When to use | Most tests | When testing async code |

```python
# TestClient — simple, synchronous
def test_sync():
    with TestClient(app) as client:
        r = client.get("/")
    assert r.status_code == 200

# AsyncClient — for async tests
async def test_async():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        r = await client.get("/")
    assert r.status_code == 200
```

---

## Group 9 — Deployment & Performance

### Q41. How do you serve FastAPI with Uvicorn in production?

**Summary:** Uvicorn is an ASGI server. Run it with multiple workers for production to utilise multiple CPU cores.

```bash
# Single worker (development)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Multiple workers (production)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

# With SSL
uvicorn app.main:app --host 0.0.0.0 --port 443 \
  --ssl-keyfile ./key.pem --ssl-certfile ./cert.pem
```

**Interview takeaway:** Use `--workers` only with Uvicorn directly, not when fronted by Gunicorn (which manages workers itself). `--reload` is for development only — it adds overhead and watches files.

---

### Q42. How do you configure Gunicorn + Uvicorn workers?

**Summary:** Gunicorn manages worker processes while Uvicorn provides the ASGI worker class. This combination gives you process supervision and multi-core utilisation.

```bash
gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --timeout 120 \
  --keepalive 5 \
  --access-logfile - \
  --error-logfile -
```

**Worker count formula:** `(2 × CPU_cores) + 1` — e.g., 4 cores → 9 workers.

```python
# gunicorn.conf.py
import multiprocessing
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "uvicorn.workers.UvicornWorker"
bind = "0.0.0.0:8000"
timeout = 120
```

---

### Q43. How do you containerize a FastAPI app with Docker?

**Summary:** Use a multi-stage Dockerfile to produce a small, production-ready image.

```dockerfile
# Stage 1: builder
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: runtime
FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /install /usr/local
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

```yaml
# docker-compose.yml
services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://user:pass@db/app
    depends_on:
      - db
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: pass
```

**Common pitfalls:** Don't run as root inside the container — add `USER nonroot`. Don't copy `.env` files into the image.

---

### Q44. How do you implement rate limiting in FastAPI?

**Summary:** Use `slowapi` (a FastAPI-compatible wrapper around `limits`) or implement middleware-based rate limiting.

```python
from fastapi import FastAPI, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.get("/search")
@limiter.limit("10/minute")
async def search(request: Request, q: str):
    return {"results": []}

# Per-user rate limiting using the authenticated user as key
def get_user_id(request: Request) -> str:
    return request.state.user_id  # set by auth middleware

user_limiter = Limiter(key_func=get_user_id)
```

**Interview takeaway:** For distributed rate limiting (multiple pods), back `slowapi` with Redis so limits are shared across instances.

---

### Q45. How do you add health check and readiness endpoints?

**Summary:** Health (`/health`) confirms the process is alive. Readiness (`/ready`) confirms dependencies (DB, cache) are reachable. Kubernetes uses both for pod management.

```python
from fastapi import FastAPI
from sqlalchemy import text

app = FastAPI()

@app.get("/health", tags=["monitoring"])
async def health():
    """Liveness probe — is the process up?"""
    return {"status": "ok"}

@app.get("/ready", tags=["monitoring"])
async def ready(db: AsyncSession = Depends(get_async_db)):
    """Readiness probe — can the service handle traffic?"""
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB unavailable: {e}")
    return {"status": "ready", "db": "connected"}
```

**Interview takeaway:** Exclude these endpoints from authentication middleware and rate limiting. Kubernetes liveness probe failures trigger pod restarts; readiness probe failures remove the pod from the service load balancer.

---

## Group 10 — Advanced Patterns

### Q46. How do you structure a large FastAPI application?

**Summary:** Organise code into feature modules, each with its own router. Use a central `main.py` to assemble the app.

```
app/
├── main.py            # creates FastAPI app, registers routers
├── config.py          # settings via pydantic-settings
├── database.py        # engine, session factory
├── dependencies.py    # shared dependencies (get_db, get_current_user)
├── models/
│   ├── user.py        # SQLAlchemy ORM models
│   └── item.py
├── schemas/
│   ├── user.py        # Pydantic request/response models
│   └── item.py
├── routers/
│   ├── users.py       # APIRouter with /users routes
│   └── items.py
└── services/
    ├── user_service.py  # business logic
    └── item_service.py
```

```python
# app/main.py
from fastapi import FastAPI
from app.routers import users, items

app = FastAPI()
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(items.router, prefix="/items", tags=["items"])
```

**Interview takeaway:** Separate schemas from ORM models — they have different lifecycles. Schemas represent API contracts; models represent DB structure.

---

### Q47. How do you implement WebSocket endpoints in FastAPI?

**Summary:** Use `WebSocket` as a parameter type. FastAPI (via Starlette) handles the upgrade handshake automatically.

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import List

app = FastAPI()

class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, message: str):
        for ws in self.active:
            await ws.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(f"{client_id}: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast(f"{client_id} left the chat")
```

**Common pitfalls:** WebSocket connections are long-lived — use `try/except WebSocketDisconnect` to clean up. In multi-worker setups, use a pub/sub backend (Redis) to broadcast across workers.

---

### Q48. How do you stream large responses in FastAPI?

**Summary:** Use `StreamingResponse` to send data incrementally — useful for large file downloads, CSV exports, or server-sent events (SSE).

```python
import asyncio
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app = FastAPI()

# Stream a large CSV
async def generate_csv():
    yield "id,name,value\n"
    for i in range(1_000_000):
        yield f"{i},item_{i},{i * 1.5}\n"
        if i % 10_000 == 0:
            await asyncio.sleep(0)  # yield control to event loop

@app.get("/export/csv")
async def export_csv():
    return StreamingResponse(
        generate_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=data.csv"},
    )

# Server-Sent Events
async def event_stream():
    for i in range(10):
        yield f"data: update {i}\n\n"
        await asyncio.sleep(1)

@app.get("/events")
async def events():
    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

---

### Q49. How do you use FastAPI with an event-driven architecture?

**Summary:** FastAPI endpoints can publish events to a message broker (Kafka, RabbitMQ, Redis Streams). Consumers (separate services or workers) process events asynchronously.

```python
import json
from aiokafka import AIOKafkaProducer
from fastapi import FastAPI, Depends
from contextlib import asynccontextmanager

producer: AIOKafkaProducer = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global producer
    producer = AIOKafkaProducer(bootstrap_servers="localhost:9092")
    await producer.start()
    yield
    await producer.stop()

app = FastAPI(lifespan=lifespan)

@app.post("/orders/")
async def create_order(order: OrderCreate):
    saved_order = await save_order_to_db(order)
    # Publish event to Kafka
    await producer.send(
        "orders",
        key=str(saved_order.id).encode(),
        value=json.dumps(saved_order.dict()).encode(),
    )
    return saved_order
```

**Interview takeaway:** FastAPI handles the HTTP layer; message brokers handle async workloads. This pattern decouples services — the order service doesn't need to know who processes the event.

---

### Q50. How do you version a FastAPI API?

**Summary:** The most common strategies are URL prefixing (most explicit) and router-level versioning. Header-based versioning is also possible but adds complexity.

```python
# Strategy 1: URL prefix — cleanest, easiest to document
from fastapi import FastAPI, APIRouter

app = FastAPI()

v1_router = APIRouter(prefix="/api/v1")
v2_router = APIRouter(prefix="/api/v2")

@v1_router.get("/users/")
async def get_users_v1():
    return {"version": 1, "users": []}

@v2_router.get("/users/")
async def get_users_v2():
    return {"version": 2, "users": [], "total": 0}  # extended shape

app.include_router(v1_router)
app.include_router(v2_router)

# Strategy 2: Separate FastAPI apps mounted under a root app
from fastapi import FastAPI

v1 = FastAPI(title="API v1")
v2 = FastAPI(title="API v2")

root = FastAPI()
root.mount("/v1", v1)
root.mount("/v2", v2)
```

**Interview takeaway:** URL versioning is the industry standard for REST APIs — it's explicit in URLs, easy to document, and clients know exactly which contract they're using. Avoid removing v1 until all clients have migrated; use a deprecation header `Deprecation: true` as a soft signal.

---

*End of FastAPI Interview Question Bank — 50 Questions*
