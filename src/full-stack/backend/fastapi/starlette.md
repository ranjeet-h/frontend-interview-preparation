# What is Starlette: The Lightweight ASGI Toolkit Underpinning FastAPI

## 1. Why This Exists — The Problem First

Imagine you are tasked with building a high-throughput, asynchronous microservice in Python from scratch using raw ASGI (Asynchronous Server Gateway Interface). In raw ASGI, your application is just a single asynchronous callable that receives three parameters: a `scope` dictionary representing the connection, a `receive` coroutine for incoming data chunks, and a `send` coroutine for outgoing data chunks.

```python
async def raw_asgi_app(scope, receive, send):
    if scope["type"] == "http" and scope["path"] == "/health":
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [[b"content-type", b"text/plain"]],
        })
        await send({
            "type": "http.response.body",
            "body": b"OK",
        })
```

If you try to scale this to a real production API, you immediately hit severe pain. You have to manually parse URL paths and regex patterns to extract path parameters. You have to buffer raw byte streams to extract multipart forms or JSON payloads. You have to construct header lists by hand, manage cookie serialization, coordinate WebSocket handshakes, handle streaming file downloads, wrap error handlers around unhandled exceptions, and figure out how to trigger background tasks after a response finishes without blocking the client.

Writing that plumbing yourself is error-prone, tedious, and invites subtle security and concurrency bugs.

This is why **Starlette** exists. Starlette is the foundational, high-performance ASGI toolkit for Python. It provides the battle-tested HTTP abstraction layer: a fast URL router, request and response wrappers, streaming responses, WebSocket connection lifecycles, composable ASGI middleware, and in-memory background tasks. 

Many developers encounter FastAPI and assume it built all this web networking infrastructure from scratch. In reality, FastAPI inherits directly from Starlette (`class FastAPI(Starlette)`). Starlette is the robust web engine underneath; FastAPI is the ergonomic developer suite layered directly on top of it.

## 2. The Analogy — Make It Obvious

Think of building a modern office building:

- **Raw ASGI (`scope`, `receive`, `send`)** is the bare city utility grid. It supplies raw high-voltage electricity cables, high-pressure water mains, and raw sewage pipes. It has zero convenience: you cannot plug a laptop directly into an uninsulated 10,000-volt power line.
- **Starlette** is the structural engineering of the building itself. It installs the concrete floors, standard 120V/240V wall outlets, internal plumbing, fire doors, hallway directional signs (routing), security checkpoints at the front gate (middleware), the freight elevator for bulk cargo (streaming responses), and the internal phone intercoms (WebSockets). The building is fully functional, safe, ultra-fast, and ready for occupants.
- **FastAPI** is the fully furnished, turnkey smart-office suite installed inside that building. It adds biometric badge scanners that validate your ID against HR records before letting you sit at a desk (Pydantic type validation), an automated office assistant that delivers coffee and database connections to your desk on demand (Dependency Injection with `Depends`), and a digital floor-plan directory in the lobby that automatically updates whenever a new desk is added (OpenAPI and Swagger UI documentation).

If you take away the luxury office furniture and automated badge scanners, the building itself (Starlette) stands strong, fully capable of routing people and managing utilities with peak efficiency. Whenever you use FastAPI, your requests are walking on Starlette's concrete foundation and drawing power from Starlette's electrical sockets.

## 3. How It Actually Works — The Full Explanation

To understand Starlette, you need to see both what it provides as an independent ASGI toolkit and how FastAPI subclasses it to form a complete framework.

### The ASGI Foundation

An ASGI server like Uvicorn listens on a socket, parses raw TCP bytes into HTTP or WebSocket protocols, and invokes an ASGI application. The ASGI interface specification requires a callable with this signature:

`async def app(scope: dict, receive: callable, send: callable) -> None`

- `scope`: A dictionary containing metadata about the incoming connection (protocol type, HTTP method, path, headers, client IP).
- `receive`: An async function called by the app to receive incoming message events (such as request body byte chunks or incoming WebSocket frames).
- `send`: An async function called by the app to send outgoing message events (status codes, headers, response body chunks, or outgoing WebSocket frames).

Starlette wraps this raw trio into rich, intuitive Python objects and routing structures.

### What Starlette Provides

Starlette gives you seven core architectural building blocks:

1. **Routing (`Router`, `Route`, `WebSocketRoute`, `Mount`)**: Starlette matches incoming URL paths using declarative patterns like `/users/{user_id:int}`. It handles parameter type conversion (integers, floats, strings, UUIDs), HTTP method dispatching (GET, POST, PUT, DELETE), and sub-application mounting (attaching static file directories or isolated sub-routers).
2. **Request and Response Abstractions**: Starlette provides a `Request` class that wraps the `scope` and `receive` stream to provide clean, lazy-loaded properties: `request.query_params`, `request.headers`, `request.cookies`, `await request.json()`, and `await request.form()`. On the outgoing side, it provides specialized response classes: `Response`, `JSONResponse`, `HTMLResponse`, `PlainTextResponse`, `StreamingResponse`, `FileResponse`, and `RedirectResponse`.
3. **Background Tasks (`BackgroundTasks`)**: Starlette allows you to attach lightweight, in-memory async or sync functions to a response (`response.background = tasks`). The ASGI server finishes flushing the HTTP response payload to the client first, and then Starlette executes the background function in the same process without blocking the client's round-trip latency.
4. **Middleware Architecture (`BaseHTTPMiddleware` and ASGI Middleware)**: Starlette provides an onion-layered middleware system. You can write custom middlewares that intercept incoming requests before they hit route handlers, modify headers, enforce security policies, or log request/response metrics.
5. **WebSocket Lifecycle (`WebSocket`)**: Starlette manages bidirectional WebSocket connections with an explicit lifecycle: client initiates connection (`websocket.connect`), application accepts the handshake (`await websocket.accept()`), data exchanges occur (`await websocket.receive_text()`, `await websocket.send_json()`), and the connection terminates cleanly (`await websocket.close()`).
6. **Exception Handling (`ExceptionMiddleware`)**: It provides centralized exception mapping. You can register custom exception handlers for specific Python exception classes or HTTP status codes, converting internal application crashes into standardized JSON or HTML error responses.
7. **Lifespan Context Management**: Starlette supports ASGI Lifespan events, allowing you to define an async context manager that runs startup code (e.g., initializing a database connection pool or loading a machine learning model into memory) before accepting traffic, and teardown code (closing connections) upon graceful shutdown.

### What FastAPI Adds on Top of Starlette

FastAPI does not rewrite any of Starlette's networking or routing infrastructure. Instead, FastAPI inherits directly from Starlette:

```python
# fastapi/applications.py (simplified architecture)
from starlette.applications import Starlette

class FastAPI(Starlette):
    def __init__(self, ...):
        super().__init__(...)
        # Initializes OpenAPI schema generator, dependency graphs, and Pydantic encoders
```

FastAPI layers four major features directly over Starlette's primitives:

1. **Pydantic Validation and Serialization**: While Starlette expects you to manually inspect `await request.json()` and validate Python dictionaries yourself, FastAPI automatically parses request bodies into Pydantic models, validates query and path parameters against type annotations, returns automatic 422 Unprocessable Entity errors on schema mismatch, and filters outgoing data using response models.
2. **Dependency Injection System (`Depends`)**: FastAPI introduces a hierarchical dependency graph. It resolves database sessions, authentication credentials, permissions, and configuration objects before calling your endpoint function, managing both setup and teardown (`yield` dependencies) automatically.
3. **Automatic OpenAPI Schema Generation**: FastAPI inspects your route signatures, Pydantic models, and status codes to dynamically build an OpenAPI 3.x-compliant JSON schema document.
4. **Interactive Documentation UIs**: FastAPI bundles and serves Swagger UI (`/docs`) and ReDoc (`/redoc`) directly from the generated OpenAPI schema.

## 4. Real Code — See It Working

Let's look at how pure Starlette solves a web service problem, and then compare it with the exact FastAPI equivalent to see the architectural boundary in action.

### Pure Starlette Application

In pure Starlette, you work directly with `Request`, `JSONResponse`, and `BackgroundTasks`. Notice that you are responsible for parsing and validating data manually.

```python
# app_starlette.py
# Run with: uvicorn app_starlette:app --port 8000
import asyncio
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, StreamingResponse
from starlette.routing import Route
from starlette.background import BackgroundTasks
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware

# 1. Custom ASGI Middleware using Starlette's BaseHTTPMiddleware
class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Executes before the route handler
        response = await call_next(request)
        # Adds a custom header on the way out
        response.headers["X-Powered-By"] = "Pure-Starlette"
        return response

# 2. Background task function to run after the response is sent
async def send_welcome_email(email: str):
    await asyncio.sleep(1) # Simulating an external email API call
    print(f"[BACKGROUND] Welcome email sent to {email}")

# 3. HTTP Route Handler
async def create_user(request: Request) -> JSONResponse:
    # Starlette requires manual payload extraction
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)
    
    email = body.get("email")
    if not email or "@" not in email:
        # Starlette requires manual field validation
        return JSONResponse({"error": "Valid email is required"}, status_code=422)

    # Attach background task to execute after client gets the 201 response
    tasks = BackgroundTasks()
    tasks.add_task(send_welcome_email, email=email)

    return JSONResponse(
        {"id": 101, "email": email, "status": "created"},
        status_code=201,
        background=tasks
    )

# 4. Streaming Response Handler (Server-Sent Events or large chunks)
async def event_generator():
    for count in range(1, 4):
        await asyncio.sleep(0.5)
        yield f"data: message {count}\n\n"

async def stream_events(request: Request) -> StreamingResponse:
    return StreamingResponse(event_generator(), media_type="text/event-stream")

# 5. Declarative Routing Table
routes = [
    Route("/users", endpoint=create_user, methods=["POST"]),
    Route("/events", endpoint=stream_events, methods=["GET"]),
]

# 6. Starlette Application Instance
app = Starlette(
    debug=True,
    routes=routes,
    middleware=[Middleware(RequestLoggingMiddleware)]
)
```

### The FastAPI Equivalent (Built on Top of Starlette)

Here is how FastAPI takes the exact same Starlette foundation and overlays type validation, dependency injection, and automatic documentation:

```python
# app_fastapi.py
# Run with: uvicorn app_fastapi:app --port 8000
import asyncio
from fastapi import FastAPI, BackgroundTasks, Depends, status, HTTPException
from fastapi.responses import StreamingResponse # Re-exported directly from Starlette
from pydantic import BaseModel, EmailStr

app = FastAPI(title="User Microservice")

# 1. Pydantic Model replaces manual JSON parsing and dictionary inspection
class UserCreate(BaseModel):
    email: EmailStr # Automatic validation and 422 error generation

class UserResponse(BaseModel):
    id: int
    email: str
    status: str

# 2. Dependency Injection for shared resources
async def verify_api_key():
    # Simulated auth check
    return "authorized_token"

async def send_welcome_email(email: str):
    await asyncio.sleep(1)
    print(f"[BACKGROUND] Welcome email sent to {email}")

# 3. Route Handler: Notice BackgroundTasks is Starlette's class under the hood
@app.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user: UserCreate, 
    background_tasks: BackgroundTasks, 
    token: str = Depends(verify_api_key)
):
    # Data is already parsed, validated, and typed. No manual try/except needed.
    background_tasks.add_task(send_welcome_email, email=user.email)
    
    return {"id": 101, "email": user.email, "status": "created"}

# 4. FastAPI uses Starlette's StreamingResponse directly
async def event_generator():
    for count in range(1, 4):
        await asyncio.sleep(0.5)
        yield f"data: message {count}\n\n"

@app.get("/events")
async def stream_events():
    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

When you query `/docs` on the FastAPI server, FastAPI generates the interactive Swagger UI by inspecting `UserCreate`, `UserResponse`, and status codes. But when the HTTP request actually hits `/users`, Starlette's router matches the path, parses the ASGI connection, and coordinates the response and background task.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the exact architectural relationship between Starlette and FastAPI?**

FastAPI is not an alternative ASGI framework that competes with Starlette; it is a direct extension of Starlette. In Python's object model, `class FastAPI(Starlette)` inherits directly from Starlette's application class. 

Starlette handles all the lower-level web networking primitives: the ASGI specification interface, URL pattern routing, HTTP `Request` and `Response` objects, WebSocket connection handling, middleware execution pipelines, exception mapping, and background task execution. 

FastAPI sits on top of this foundation and adds data validation via Pydantic, a dependency injection system via `Depends`, automatic OpenAPI schema generation, and documentation endpoints (`/docs` and `/redoc`). When you write an endpoint in FastAPI, you are executing within a Starlette application.

**Q: Can you access Starlette primitives directly inside a FastAPI application?**

Yes, and this is a standard senior design pattern. FastAPI deliberately re-exports and exposes Starlette's core components so you never have to bypass the framework. 

For example:
- You can inject Starlette's raw `Request` or `WebSocket` object directly into any FastAPI endpoint signature (`async def my_endpoint(request: Request)`).
- You can return any Starlette response type directly, including `StreamingResponse`, `FileResponse`, `HTMLResponse`, or `RedirectResponse`.
- You can attach Starlette's `BackgroundTasks` directly to route parameters.
- You can add custom Starlette ASGI middlewares to a FastAPI app using `app.add_middleware()`.
- You can catch and handle Starlette's `HTTPException` alongside FastAPI's subclassed `HTTPException`.

**Q: When would an engineering team choose pure Starlette over FastAPI?**

You should choose pure Starlette when you need maximum raw ASGI throughput and minimal memory overhead, and your service does not benefit from Pydantic schema validation or OpenAPI documentation.

Typical scenarios include:
1. **High-Volume Proxy or Gateway Microservices**: Services that inspect headers, perform routing, and proxy byte streams without validating or deserializing complex JSON payloads.
2. **Dedicated Real-Time WebSocket Servers**: Chat hubs, live game state servers, or telemetry ingestion services where communication consists of lightweight binary or raw string messages.
3. **Resource-Constrained Environments**: Micro-containers or serverless functions where dependency size and cold-start times must be kept strictly minimal (omitting Pydantic reduces packaging footprint).
4. **Custom Internal Frameworks**: Teams building a proprietary internal web framework who want a solid ASGI routing engine without being locked into FastAPI's opinionated dependency injection or validation conventions.

**Q: How does Starlette's middleware stack work, and in what order does it execute?**

Starlette middlewares operate on an "onion" wrapping model based on ASGI specifications. Each middleware is an ASGI application that wraps the next ASGI application in the chain.

When you add middlewares to an application:
```python
app.add_middleware(MiddlewareA) # Added first -> Innermost layer
app.add_middleware(MiddlewareB) # Added second -> Outermost layer
```

Middlewares execute in **reverse order of addition** for incoming requests, and in **forward order** for outgoing responses:
1. An incoming HTTP request first enters `MiddlewareB` (the outermost layer).
2. `MiddlewareB` processes request headers and passes control to `MiddlewareA`.
3. `MiddlewareA` processes the request and passes control to the router and route handler.
4. The route handler returns a response.
5. The response passes back through `MiddlewareA` (which can alter response headers or status).
6. The response passes out through `MiddlewareB` back to the ASGI server (Uvicorn).

This order is critical: middlewares that must catch all errors or handle preflight requests (like `CORSMiddleware`) must be added last so they reside at the outermost layer.

**Q: How do Starlette's `BackgroundTasks` differ from a distributed task queue like Celery or Redis Queue (RQ)?**

Starlette's `BackgroundTasks` execute **in-process** within the same Python asyncio event loop (or thread pool for sync functions) immediately after the HTTP response has been sent to the client. 

The key differences are:
- **Infrastructure**: Starlette `BackgroundTasks` require zero external infrastructure (no Redis, RabbitMQ, or worker processes). Celery requires a dedicated message broker and worker fleet.
- **Durability and Reliability**: Starlette tasks live in server memory. If the server process crashes, restarts, or runs out of memory while the task is executing, the task is permanently lost. Celery tasks are persisted in a message broker and support automatic retries, acknowledgment, and dead-letter queues.
- **Resource Contention**: Heavy CPU or I/O tasks in Starlette `BackgroundTasks` share the CPU and event loop with active web requests, which can degrade API response times. Celery offloads computation to completely separate worker machines.

Rule of thumb: Use Starlette `BackgroundTasks` for quick, non-critical operations (sending an analytics ping, updating an in-memory cache, writing an audit log). Use Celery/RQ for business-critical jobs, heavy data processing, long-running exports, or operations requiring guaranteed execution.

## 6. The Traps — What Goes Wrong

### Trap 1: Using `BaseHTTPMiddleware` and Breaking Streaming Responses or ContextVars

Starlette provides `BaseHTTPMiddleware` to simplify writing custom middleware. However, `BaseHTTPMiddleware` works by intercepting the ASGI call, consuming the response stream into a temporary buffer, and re-wrapping it.

```python
# THE TRAP:
from starlette.middleware.base import BaseHTTPMiddleware

class BadStreamingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        # BaseHTTPMiddleware forces streaming responses into memory buffers,
        # destroying infinite streams, SSE connections, or large file transfers!
        return response
```

**Why it fails:** `BaseHTTPMiddleware` creates subtle bugs: it breaks streaming responses (like Server-Sent Events or multi-gigabyte file downloads) by buffering chunks, and in earlier Python/Starlette versions, it resets `contextvars` context, breaking distributed tracing spans.

**The Fix:** For high-performance logging or stream-safe middleware, write a pure ASGI middleware class instead of inheriting from `BaseHTTPMiddleware`:

```python
# THE FIX: Pure ASGI Middleware
class PureASGIMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def custom_send(message):
            if message["type"] == "http.response.start":
                # Safely inspect or inject headers without buffering the body stream
                headers = list(message.get("headers", []))
                headers.append((b"x-audit-marker", b"verified"))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, custom_send)
```

### Trap 2: Incorrect Middleware Registration Order

A common bug in FastAPI/Starlette applications occurs when authentication or custom security middleware is added *after* CORS middleware, expecting CORS to run first.

```python
# THE TRAP:
app.add_middleware(CORSMiddleware, allow_origins=["*"])
app.add_middleware(StrictAuthMiddleware) # Registered after CORS!
```

**Why it fails:** Remember that middlewares wrap like an onion. The last middleware registered becomes the outermost layer. In the buggy code above, `StrictAuthMiddleware` is the outermost layer. When a browser sends an unauthenticated `OPTIONS` preflight request, `StrictAuthMiddleware` intercepts it first, sees no auth token, and rejects it with a `401 Unauthorized`. The `CORSMiddleware` never gets to process the preflight check, causing the frontend browser to fail with a cryptic CORS error.

**The Fix:** Always register `CORSMiddleware` last so it sits at the outermost boundary:

```python
# THE FIX:
app.add_middleware(StrictAuthMiddleware) # Inner layer: handles authenticated traffic
app.add_middleware(CORSMiddleware, allow_origins=["*"]) # Outermost layer: answers OPTIONS preflights first
```

### Trap 3: Multiple Reads of `request.body()` in Custom Middlewares

In ASGI, the incoming request body is a stream consumed by calling the `receive()` coroutine. Once the stream has been read to the end, the stream is exhausted.

```python
# THE TRAP:
class RequestInspectionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Reading request.body() consumes the ASGI receive stream
        body = await request.body()
        print(f"Payload: {body}")
        
        # When route handlers or Pydantic models try to read request.json(),
        # the stream is already empty! The request hangs or crashes.
        response = await call_next(request)
        return response
```

**Why it fails:** Calling `await request.body()` reads all byte chunks from the underlying ASGI channel. When downstream route handlers or Pydantic parsers attempt to read the body, no bytes remain.

**The Fix:** If you must inspect raw request bytes in custom ASGI middleware, you must cache the bytes and override the `receive` callable so downstream consumers can re-read the data:

```python
# THE FIX:
class SafeInspectionMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            # Receive and buffer body bytes
            body = b""
            more_body = True
            while more_body:
                message = await receive()
                body += message.get("body", b"")
                more_body = message.get("more_body", False)

            # Log or inspect payload
            print(f"Logged payload length: {len(body)} bytes")

            # Create a synthetic receive callable that replays the buffered bytes
            async def replayed_receive():
                return {"type": "http.request", "body": body, "more_body": False}

            await self.app(scope, replayed_receive, send)
        else:
            await self.app(scope, receive, send)
```

### Trap 4: Forgetting `await websocket.accept()`

When writing real-time WebSocket endpoints in Starlette or FastAPI, developers often jump straight to reading incoming messages:

```python
# THE TRAP:
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Missing await websocket.accept()!
    data = await websocket.receive_text() # Client handshake is never completed!
    await websocket.send_text(f"Echo: {data}")
```

**Why it fails:** In the ASGI WebSocket protocol, receiving a connection request does not automatically accept the HTTP handshake. If you don't call `await websocket.accept()`, the connection remains in a pending handshake state, and client connections will eventually time out or be aborted.

**The Fix:** Always explicitly accept the connection before entering your message exchange loop:

```python
# THE FIX:
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept() # Complete the handshake
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Echo: {data}")
    except Exception:
        # Handle client disconnect cleanly
        pass
```

## 7. Compare With Related Concepts

Understanding where Starlette sits in the Python web ecosystem prevents architectural confusion.

### Starlette vs. FastAPI

| Feature / Responsibility | Starlette | FastAPI |
| :--- | :--- | :--- |
| **Primary Role** | Foundational ASGI toolkit & web engine | Full-featured API framework |
| **Routing & Method Dispatch** | Built-in (`Router`, `Route`) | Inherited directly from Starlette (`APIRouter`) |
| **Request / Response Classes** | Provides all core classes (`JSONResponse`, `StreamingResponse`, etc.) | Re-exports Starlette's response classes |
| **Data Validation** | None (manual dictionary parsing) | Automatic type validation via Pydantic |
| **Dependency Injection** | None | Built-in hierarchical DI (`Depends`) |
| **OpenAPI / Swagger Generation** | None | Automatic dynamic schema & UI generation |
| **Overhead** | Ultra-lightweight (minimal memory footprint) | Minor overhead for validation & schema reflection |

**Rule of Thumb:** Use pure Starlette for raw proxies, simple WebSocket routers, or microservices that do not need schema validation. Use FastAPI for standard production REST/JSON APIs where validation, documentation, and dependency management save hundreds of engineering hours.

### Starlette vs. Werkzeug

- **Werkzeug** is the foundational WSGI (synchronous) toolkit used by Flask. It processes one request per thread/process worker.
- **Starlette** is the foundational ASGI (asynchronous) toolkit used by FastAPI. It is built natively on Python's `asyncio` event loop to handle thousands of concurrent non-blocking connections, WebSockets, and asynchronous streaming.

**Rule of Thumb:** Werkzeug is for synchronous WSGI applications; Starlette is for modern asynchronous ASGI applications.

### Starlette vs. Uvicorn

- **Uvicorn** is an **ASGI Server**. It binds to network sockets, manages worker processes, and converts raw TCP/HTTP bytes into ASGI events (`scope`, `receive`, `send`).
- **Starlette** is an **ASGI Application Framework**. It sits behind Uvicorn and translates those raw ASGI events into route matching, Python request objects, and response generation.

**Rule of Thumb:** Uvicorn runs Starlette; Starlette does not run Uvicorn. You pass your Starlette `app` instance to Uvicorn to serve it on the network (`uvicorn main:app`).

## 8. 🧠 The Memory Hook

FastAPI is the sports car body, leather interior, and GPS dashboard (`Pydantic` + `Depends` + `OpenAPI`); **Starlette is the high-performance chassis, engine, and wheels (`ASGI` + `Routing` + `Request/Response` + `WebSockets`)** doing all the actual driving underneath.
