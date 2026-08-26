# What Is FastAPI

## 1. The Real-World Problem — When You Actually Hit This

You ship a Flask API and it works on day one. Then the team grows. A frontend dev sends `price: "12.99"` as a string and the endpoint silently saves it wrong. Another sends `items?limit=abc` and your handler crashes because you called `int()` without a try/except. You add manual `if "name" not in body: return 400` checks in every route and they start to drift. Docs are a separate Markdown file that someone forgot to update, so the frontend builds against a field that does not exist anymore.

The same week you copy-paste auth and DB-session code across ten handlers. One handler forgets to close the session. Another leaks an internal field like `hashed_password` because you returned the ORM object directly. You add a new field to the input model and now you need to touch validation, serialization, and documentation in three different places. Nothing is linked together, so everything can drift.

FastAPI exists for that exact pain. It makes your Python type hints the single contract that drives validation before your code runs, serialization before the response leaves, and documentation that never goes stale.

## 2. The Analogy — Make the Mechanic Obvious

Think of a symphony orchestra and its score.

The composer writes one master score with precise notation — every note, key, and tempo marked exactly. That score is the source of truth. In FastAPI, that score is your typed Python function signature: `def create_item(item: ItemCreate) -> ItemOut`.

Three different groups read that same score and do their job automatically:

The copyist checks every part against music theory before rehearsal starts. If a violin part has a note that does not exist on the instrument, it is rejected before anyone plays. That is Pydantic — it checks every incoming piece of data against your type hints and rejects bad requests with a detailed 422 before your endpoint runs.

The concert hall handles everything around the music — doors, seating, acoustics, stage lighting, and getting the audience to the right hall. That is Starlette — the ASGI layer that handles routing, request and response objects, middleware, and WebSockets.

The printed program booklet in the lobby lists every piece, movement, and performer so the audience knows exactly what will be played. That is the automatic OpenAPI docs at `/docs` and `/openapi.json` — generated from the same score, not written by hand.

You pin a piece to a slot in the evening's program — "Mozart at 8pm in Hall A." That pin is the path operation decorator `@app.post("/items")`. Writing that one line registers the function at a URL, tells the hall how to route people there, and tells the copyist and program printer what to validate and what to publish. Change the score, and the validation, the response shape, and the docs all change together because they all read the same page.

## 3. The Full Explanation — How It Actually Works

FastAPI is a thin, opinionated glue layer. It does not reimplement HTTP and it does not reimplement validation. It combines two mature libraries and adds the wiring that makes them feel like one framework: Starlette for the web layer and Pydantic for the data layer. If you understand what each one does, FastAPI stops feeling like magic.

Starlette is the ASGI foundation. It owns the lifecycle of a single HTTP request at the protocol level: reading the ASGI scope, matching the URL to a route, building `Request` and `Response` objects, running middleware in order, handling WebSockets, and sending bytes back through the ASGI server like Uvicorn. Starlette is fast because it is async from the ground up and it does very little beyond routing and I/O. FastAPI delegates all of that to Starlette and never tries to replace it.

Pydantic is the data foundation. It takes Python type hints and turns them into runtime checks. At import time Pydantic builds a validator for each `BaseModel` from its annotations. When data arrives it tries to coerce, validate, and apply defaults — `"42"` to `42` for an `int` field if that coercion is allowed, `"not-a-number"` rejected with a structured error, missing required fields reported with exact paths. On the way out it does the reverse: it takes whatever your endpoint returned and filters it through a `response_model`, dropping fields you did not declare, converting types, and applying config like `from_attributes=True` for ORM objects. Type hints alone do nothing at runtime in Python — Pydantic is what makes them enforceable.

FastAPI's job is the inspection and orchestration between the two. When you write:

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/items/{item_id}")
def get_item(item_id: int, limit: int = 10):
    return {"item_id": item_id, "limit": limit}
```

FastAPI reads the signature with `inspect` at startup. It learns that `item_id` comes from the path and must be an `int`, that `limit` comes from the query string with a default of `10`, and that a body argument annotated with a `BaseModel` must be parsed from JSON. It builds a dependency graph for any `Depends()` calls, figures out execution order, caches shared dependencies within a single request, and generates a JSON Schema for each model. That schema becomes both the runtime validator and the OpenAPI spec.

A request then flows through a fixed pipeline. The ASGI server hands the raw scope to Starlette. Starlette's router matches the path to your function. FastAPI extracts each parameter from the right place — path, query, header, cookie, or body — and hands it to Pydantic. If any extraction or validation fails, FastAPI returns a 422 with a machine-readable error and your endpoint is never called. That ordering matters for safety: malformed input never reaches business logic. If validation passes, FastAPI resolves `Depends()` in topological order, calls the endpoint (awaiting it if it is `async def`), takes the return value, validates it against `response_model` when you set one, serializes it to JSON, and Starlette sends the response. Middleware wraps the whole thing and runs before and after.

The path operation decorator is how a plain function becomes an HTTP endpoint. `@app.post("/items", response_model=ItemOut, status_code=201)` does three things at decoration time: it registers the URL and method with Starlette's router, it records the expected request and response shapes for Pydantic, and it adds an entry to the OpenAPI schema that Swagger UI and ReDoc render. No separate route table, schema file, and doc annotation to keep in sync.

Type-driven design is the workflow that falls out of this. You declare intent once with types and FastAPI derives behavior. That gives you editor autocompletion, `mypy` or `pyright` checking before you run, and runtime safety from the same annotations. It also explains the docs trick: `/docs`, `/redoc`, and `/openapi.json` are not artifacts you maintain. They are a live view of your type annotations. Add a field to a Pydantic model and it appears in docs immediately. Remove a field from `response_model` and it disappears from both the response and the docs because the same model drives both.

Async is a choice, not a default win. FastAPI lets you write `def` or `async def` handlers side by side. Use `async def` when the endpoint waits on I/O like a database or HTTP call — the event loop can serve other requests while it waits. Use plain `def` for CPU work or when you are calling a synchronous ORM. Mixing a blocking call like `time.sleep(2)` or a synchronous DB driver inside `async def` blocks the single event loop and slows every concurrent request, which is why the decision deserves thought rather than habit. For depth on that boundary, see [async-endpoints](async-endpoints.md) and [sync-vs-async-routes](sync-vs-async-routes.md).

Cross-cutting concerns fit the same pattern. Shared logic like auth, pagination, or a DB session is not copy-pasted — it is a dependency function injected with `Depends()`. Resource cleanup uses `yield` so Starlette can run teardown even when the request fails. Consistent errors come from exception handlers and `HTTPException`, not scattered `return {"error": ...}` blocks. Validation, dependency resolution, and response filtering are separate stages, which is why testing through the HTTP layer matters and why auth failures must close the request rather than let it continue. For the dependency pattern in detail, see [dependency-injection](dependency-injection.md) and [depends](depends.md). For the docs layer, see [swagger-docs](swagger-docs.md). For the underlying ASGI and Starlette pieces, see [asgi](asgi.md) and [starlette](starlette.md).

## 4. See It In Practice — Real Code or Queries

Every snippet below is a standalone, runnable example. Each has its own imports and matches FastAPI's real lifecycle — decorator registration, Pydantic models, and a Uvicorn entrypoint.

A single source of truth for request, response, and docs. One model change updates validation and Swagger together.

```python
from fastapi import FastAPI, Query
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="Inventory API")

class ItemCreate(BaseModel):
    name: str
    price: float
    in_stock: bool = True

class ItemOut(BaseModel):
    id: int
    name: str
    price: float
    in_stock: bool

# In-memory store for the example
_items: list[ItemOut] = []
_next_id = 1

@app.post("/items", response_model=ItemOut, status_code=201)
def create_item(item: ItemCreate):
    # Validation already happened before this line.
    # If price was "not-a-number", Pydantic returned 422 and we never got here.
    global _next_id
    created = ItemOut(id=_next_id, **item.model_dump())
    _items.append(created)
    _next_id += 1
    return created

@app.get("/items/{item_id}", response_model=ItemOut)
def get_item(item_id: int, verbose: bool = Query(default=False)):
    # item_id is already an int. If the client sent /items/abc,
    # FastAPI returned 422 before this function ran.
    for item in _items:
        if item.id == item_id:
            return item
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail="Item not found")

@app.get("/items", response_model=list[ItemOut])
def list_items(limit: int = Query(default=10, ge=1, le=100)):
    # limit is validated: ge=1 and le=100 are enforced by Pydantic
    return _items[:limit]

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)

# Docs are live at http://127.0.0.1:8000/docs
# Raw schema at http://127.0.0.1:8000/openapi.json
```

Shared logic through dependencies. Auth fails closed and DB sessions always close, even on errors.

```python
from typing import Annotated
from fastapi import FastAPI, Depends, Header, HTTPException, status
from pydantic import BaseModel
import uvicorn

app = FastAPI()

class User(BaseModel):
    user_id: str
    role: str

def get_current_user(authorization: Annotated[str | None, Header()] = None) -> User:
    # Fail closed: missing or wrong token never returns a user
    if authorization != "Bearer secret-token":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return User(user_id="u_123", role="member")

def get_db():
    # Real apps yield a SQLAlchemy Session here
    db = {"session": "open"}
    try:
        yield db
    finally:
        # This runs even if the endpoint raised
        db["session"] = "closed"

@app.get("/profile")
def read_profile(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[dict, Depends(get_db)],
):
    # Only reached if auth passed and db was provided
    return {"user_id": current_user.user_id, "db_state": db["session"]}

@app.get("/admin/ping")
def admin_ping(current_user: Annotated[User, Depends(get_current_user)]):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return {"ok": True}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
```

Async when you wait on I/O, sync when you do not. Do not block the event loop inside `async def`.

```python
from fastapi import FastAPI
from pydantic import BaseModel
import asyncio
import uvicorn

app = FastAPI()

class JobOut(BaseModel):
    job_id: str
    status: str

async def fetch_status_from_service(job_id: str) -> str:
    # Simulate an async I/O call like httpx or async DB driver
    await asyncio.sleep(0.05)
    return "done"

@app.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(job_id: str):
    # async def is correct here because we await I/O
    job_status = await fetch_status_from_service(job_id)
    return JobOut(job_id=job_id, status=job_status)

@app.get("/health")
def health():
    # Plain def is correct for non-I/O work
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is FastAPI and what problem does it solve?**

FastAPI is a Python API framework that uses type hints as the contract for everything. You write a normal typed function and FastAPI derives validation, serialization, dependency wiring, and docs from that signature. It solves the drift problem: in untyped frameworks you maintain validation, serialization, and documentation in three places and they diverge. With FastAPI one change to a `BaseModel` updates all three, malformed requests are rejected before your code runs, and the docs are always accurate because they are generated from the same types. Underneath it is Starlette for ASGI routing and middleware plus Pydantic for data validation — FastAPI is the glue that inspects signatures and connects the two.

**Q: What are Starlette and Pydantic responsible for, and what does FastAPI add?**

Starlette handles the web layer: ASGI interface, routing, `Request` and `Response`, middleware, background tasks, and WebSockets. Pydantic handles the data layer: parsing raw JSON into typed models, coercing and validating fields, applying defaults and constraints, and serializing models back to JSON. FastAPI adds the introspection that ties them together — reading the function signature, deciding that `item_id: int` in the path is a path param and `item: ItemCreate` in the body is JSON, building the `Depends` graph, generating JSON Schema and OpenAPI, and enforcing that pipeline on every request.

**Q: How does a path operation decorator like `@app.get("/items/{item_id}")` actually work?**

The decorator runs at import time. It calls Starlette's router to register the path pattern and HTTP method, stores metadata about expected parameters and response model, and registers an OpenAPI path entry. At startup FastAPI also builds Pydantic validators for that endpoint from the signature. At request time Starlette matches the URL, FastAPI extracts each argument from its source, validates with Pydantic, resolves dependencies, and then invokes the function. The decorator is registration, not just syntactic sugar — it is what makes the function reachable over HTTP and documentable.

**Q: When does validation happen and why does ordering matter?**

Before the endpoint, always. Path, query, header, cookie, and body values are parsed and validated by Pydantic before FastAPI calls your function. If validation fails, FastAPI returns 422 and your handler never executes. That ordering is a security and reliability choice: you never run business logic on malformed input, you never open a DB transaction for a request that will be rejected, and you give the client a precise error that points to the exact field that failed.

**Q: What does type-driven design mean in practice?**

You declare intent once with types and get three results. Write `limit: int = Query(ge=1, le=100)` and you get runtime validation that rejects 0 or 101, correct OpenAPI with minimum and maximum in Swagger UI, and autocomplete plus static checks in the editor. Write `response_model=ItemOut` and you get output filtering so internal fields never leak, plus a documented response schema. The type is not a comment — it is the implementation of the contract.

**Q: Where does automatic documentation come from?**

From the same JSON Schema that Pydantic builds for validation. FastAPI emits the OpenAPI spec at `/openapi.json` and serves Swagger UI at `/docs` and ReDoc at `/redoc` by default. Every path, parameter, body schema, response schema, and validation constraint you declared with types appears there without extra decorators or YAML. If you change a model, the docs change on the next reload. For project-level customization of those docs, see [swagger-docs](swagger-docs.md).

**Q: How do you test a FastAPI app properly?**

Through the HTTP layer with `TestClient` and dependency overrides, not by calling handler functions directly. `TestClient` sends real requests through routing, validation, dependencies, and serialization without starting a network server. You replace real resources with `app.dependency_overrides`, for example swapping a DB session dependency for an in-memory fake or bypassing auth. That way you assert on status codes and JSON shapes the client actually sees, and you prove the whole pipeline works, not just the business function. See [testing-fastapi](testing-fastapi.md) and [mock-dependencies](mock-dependencies.md) for the full pattern.

**Q: When would you choose FastAPI over Flask or Django?**

Choose FastAPI when you are building a typed, high-throughput API where docs and validation matter and you want async I/O, automatic OpenAPI, and dependency injection without extra libraries. Flask is smaller and more flexible for simple services or when you want to assemble your own validation and docs, but you will hand-roll what FastAPI gives you for free and docs will drift if you do not maintain them. Django with Django REST Framework is stronger when you need Django's ORM, admin, migrations, and batteries-included auth for a monolith — it is heavier and less suited to lightweight async microservices. FastAPI is not faster because of the framework alone; it is fast when you pair it with an async stack and use it for I/O-bound work.

## 6. The Traps — What Goes Wrong in Production

**Thinking type hints validate by themselves.** Writing `def handler(name: str)` in plain Python does nothing at runtime — `name` can still be any type. Validation only happens because FastAPI hands the value to Pydantic. If you bypass FastAPI or bypass a `BaseModel` and read `request.json()` manually, you lose that safety. Always let FastAPI parse typed parameters or wrap data in a Pydantic model.

**Putting business logic in the route handler and reusing one model for everything.** A handler that queries the DB, applies business rules, and formats the response is hard to test and hard to reuse. Using the same Pydantic model for input, ORM, and output leaks internal fields and couples the API to the schema. Keep handlers thin — parse, delegate to a service, return a `response_model`. Maintain separate `ItemCreate`, `ItemInDB`, and `ItemOut` models even if they look similar at first.

**Leaking resources because teardown is missed.** A dependency that opens a DB session or file must use `yield` and a `try/finally` so cleanup runs on success and on exception. Returning a session without `yield` or forgetting the `finally` means a failed request can leave connections open and slowly exhaust the pool. The pattern in [prevent-db-session-leaks](prevent-db-session-leaks.md) is the correct template.

**Blocking the event loop inside `async def`.** Calling a synchronous DB driver, `time.sleep`, or heavy CPU work inside `async def` blocks the single thread that serves all concurrent requests. The symptom is sudden latency spikes under load even though CPU looks idle. Rule: if the endpoint waits on I/O and your driver is async, use `async def`. If the work is synchronous or CPU-bound, use plain `def` or `run_in_threadpool`.

**Leaking internal fields or raw errors to the client.** Returning an ORM object without `response_model` exposes columns like `hashed_password` or internal IDs. Returning `str(exc)` from a caught exception exposes stack details. Always set `response_model` on endpoints that return domain objects and map unexpected errors to a generic 500 with logging, keeping details server-side.

**Letting auth logic fail open.** A dependency like `get_current_user` that returns `None` on missing credentials and leaves the check to the endpoint is a bug waiting to happen — one handler will forget the check. Raise `HTTPException(status_code=401)` directly inside the dependency so the request stops before the endpoint runs. Permission checks like admin-only work the same way.

**Assuming docs or validation are handled manually.** Teams new to FastAPI sometimes still maintain a hand-written OpenAPI YAML or add manual `if not body.get("name")` checks. That duplicates what the framework already does from types and creates a second source of truth that drifts. Trust the typed models and let the generated `/openapi.json` be the contract you share with frontend and code generators.

## 7. Compare With Related Concepts

**FastAPI vs Flask.** Flask is a minimal WSGI microframework: one decorator registers a route, you read `request.json` yourself, you validate by hand or with an extension like Marshmallow, and docs are whatever you maintain. FastAPI is ASGI-first, expects typed signatures, validates with Pydantic automatically, and generates OpenAPI without extra code. Flask gives you freedom and a smaller surface to learn; FastAPI gives you a stricter, faster-moving contract where the type system does repetitive work for you. Choose Flask for small, flexible services where you want explicit control. Choose FastAPI for typed APIs where contract drift and repetitive validation are the main risk.

**FastAPI vs Django / Django REST Framework.** Django is a full monolith framework — ORM, admin, migrations, auth, sessions, and templating come built in. DRF adds serializers and viewsets on top. That integration is powerful when your app needs those pieces and benefits from one coherent stack. FastAPI is an API-only layer that leaves persistence, admin, and frontend choices to you. It starts faster for microservices and async workloads but asks you to bring your own ORM and project structure. See [large-project-structure](large-project-structure.md) for how a larger FastAPI codebase is typically organized to avoid the single-file trap.

**FastAPI vs using Starlette or Pydantic alone.** Use Starlette directly when you need a lightweight ASGI app and want to own validation and schema yourself. Use Pydantic alone when you need data validation without HTTP — settings, queues, or scripts that parse untrusted JSON. FastAPI is the right layer when you need both together and want the signature-driven wiring and automatic docs. If you peel FastAPI apart, you see the seam: Starlette for bytes on the wire, Pydantic for shapes in memory.

**FastAPI's `@app.get` vs class-based or router-heavy patterns in other frameworks.** Express or Flask blueprints and Django viewsets group routes by object or namespace. FastAPI does the same with `APIRouter` for domain grouping and prefix/include, but each endpoint remains a plain decorated function. The decorator style keeps validation colocated with the parameter it validates, rather than in a separate serializer class, which makes small endpoints very readable and makes large apps depend on router organization instead of inheritance hierarchies.

## 8. 🧠 The Memory Hook

FastAPI is the composer's score — one typed page that the copyist, the hall, and the printed program all read. Write the score correctly and validation passes, the request finds its seat, and the docs print themselves without anyone copying by hand.
