# Middleware in FastAPI: Onion Architecture, `BaseHTTPMiddleware`, and Pure ASGI Middleware

## 1. Why This Exists — The Problem First

Imagine you are running a production FastAPI service with fifty API endpoints. Your infrastructure team asks for three global requirements: every request must carry a unique `X-Request-ID` correlation header for distributed tracing, every response must report its execution latency via `X-Process-Time`, and all responses must include strict security headers like `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`.

If you try to implement this inside route handlers or endpoint dependencies, you have to manually wire the logic into all fifty routes. The moment an engineer adds a new `/checkout` endpoint and forgets the dependency, your observability pipeline loses trace correlation for payment flows. Worse, if a request triggers an early 404 or a routing failure before reaching your endpoint, route dependencies never execute, returning a raw error response with missing trace and security headers.

To solve this globally, you might reach for FastAPI's `@app.middleware("http")` decorator. It works in staging, but in production, high-throughput endpoints streaming gigabyte-sized CSV exports or Server-Sent Events (SSE) suddenly freeze or exhaust server memory. You discover that Starlette's `BaseHTTPMiddleware` wraps request execution inside an internal task group, buffering response streams, breaking Python `contextvars` propagation across async tasks, and adding measurable latency overhead to every request.

Middleware exists to solve cross-cutting transport-level concerns once at the application perimeter. It wraps the entire HTTP lifecycle so that logging, security headers, CORS negotiation, compression, and error normalization happen uniformly around every incoming request and outgoing response.

## 2. The Analogy — Make It Obvious

Think of your FastAPI application as a secure international airport terminal, and an incoming HTTP request as a traveler.

The route handler is the airplane seat at the departure gate—the specific destination the traveler wants to reach. But before any passenger can sit on a plane, they must pass through the airport's concentric perimeter layers:

First, at the outer highway checkpoint (CORS Middleware), security checks whether vehicles from specific origins are permitted onto the airport grounds. If an origin is forbidden, the car is turned around immediately without bothering airline staff.

Second, at the entrance turnstile (Pure ASGI / Logging Middleware), a security officer stamps a tracking barcode (`X-Request-ID`) onto the traveler's boarding jacket and starts a stopwatch.

Third, at the central metal detector (Authentication / Route Dependencies), the officer inspects the traveler's specific passport and ticket for that individual flight.

When the flight concludes and the passenger leaves, they exit through those exact same concentric perimeters in reverse order. At the exit turnstile, the officer reads the barcode, stops the stopwatch, records the total duration (`X-Process-Time`), and hands the passenger their completed travel manifest.

The outer turnstiles do not know or care whether the traveler is flying to Tokyo or London—they treat all passengers identically. That is middleware. The gate agent who checks specific seat assignments and baggage limits for Flight 402 is a route dependency.

## 3. How It Actually Works — The Full Explanation

FastAPI is built on top of Starlette and the Asynchronous Server Gateway Interface (ASGI) specification. An ASGI application is an asynchronous callable that takes three parameters: `scope` (a dictionary containing connection metadata like method, path, headers, and protocol type), `receive` (an async callable to listen for incoming message packets such as request body chunks), and `send` (an async callable to transmit response message packets such as HTTP status, headers, and body chunks back to the client).

Understanding FastAPI middleware requires understanding four core mechanics: the Onion Execution Model, built-in Starlette middlewares, the high-level `BaseHTTPMiddleware` abstraction, and pure low-level ASGI middleware.

The Onion Execution Model:

When you register multiple middlewares on a FastAPI application using `app.add_middleware()`, each middleware wraps the application instance beneath it. This creates a nested onion architecture.

The registration order is inverted during execution: the **last** middleware added to the application becomes the **outermost** layer of the onion.

```txt
Incoming Request ──▶ [ Middleware 2 (Outer) ] ──▶ [ Middleware 1 (Inner) ] ──▶ [ Route Handler ]
                                                                                      │
Outgoing Response ◀── [ Middleware 2 (Outer) ] ◀── [ Middleware 1 (Inner) ] ◀─────────┘
```

When a client sends an HTTP request:
1. The request enters the outermost middleware (the one registered last).
2. The outer middleware runs its pre-processing logic (e.g., extracting headers, recording the start time).
3. It passes control to the inner middleware via `call_next()` or by calling the next ASGI app.
4. Control cascades through all inner middlewares until it reaches FastAPI's router and route dependencies.
5. The endpoint executes and produces a response.
6. The response travels back outward through the inner middleware first, and finally through the outermost middleware.
7. Post-processing logic runs in reverse order (e.g., attaching the elapsed time header, compressing the payload).

Because of this order, `CORSMiddleware` must almost always be the outermost layer. If an authentication or header validation middleware sits outside CORS, browser preflight `OPTIONS` requests will get rejected by the auth layer before CORS headers can ever be attached, causing cross-origin browser requests to fail.

Built-in Middlewares in FastAPI and Starlette:

FastAPI exposes several battle-tested middleware components inherited directly from Starlette:
- `CORSMiddleware`: Intercepts cross-origin requests, validates `Origin` headers against allowed lists, handles HTTP `OPTIONS` preflight requests automatically, and injects `Access-Control-Allow-*` headers into responses.
- `GZipMiddleware`: Intercepts outbound responses and applies gzip compression if the client includes `Accept-Encoding: gzip` and the response body exceeds a configurable byte threshold (default 500 bytes).
- `TrustedHostMiddleware`: Enforces that the incoming `Host` header matches an allowed whitelist of domains or IP patterns, protecting the application against HTTP Host Header poisoning attacks.
- `HTTPSRedirectMiddleware`: Redirects all standard `http://` and `ws://` connections to their secure `https://` and `wss://` counterparts with a 307 or 301 status code.

Custom Middleware: `@app.middleware("http")` vs `BaseHTTPMiddleware`:

FastAPI provides the `@app.middleware("http")` decorator for writing quick custom middleware functions. Under the hood, this decorator creates a subclass of Starlette's `BaseHTTPMiddleware`.

`BaseHTTPMiddleware` provides a clean, synchronous-feeling async interface: it accepts a Starlette `Request` object and a `call_next` function, and expects an HTTP `Response` object in return.

However, `BaseHTTPMiddleware` has architectural limitations in high-load production environments:
- It creates an `anyio` task group per request to run the endpoint in a separate async task.
- This task boundary can break or isolate Python's standard `contextvars` context, meaning changes made to request-scoped context variables inside the endpoint might not propagate back to the middleware cleanly.
- It intercepts response body generation and buffers chunks in memory, which degrades streaming performance for `StreamingResponse`, Server-Sent Events, or large file transfers.
- It introduces memory and CPU overhead under extreme request volumes due to task creation and object wrapping.

Pure ASGI Middleware: Zero Overhead and Streaming-Safe:

When building high-throughput systems, custom logging, correlation ID injection, or metric instrumentation, writing a Pure ASGI Middleware is the gold standard.

A pure ASGI middleware is a standard Python class with an `async def __call__(self, scope, receive, send)` method. It operates directly on raw ASGI event dictionaries:
- `http.response.start`: Sent when the endpoint specifies the HTTP status code and response headers.
- `http.response.body`: Sent one or more times with byte chunks of the response body.

By intercepting `send`, pure ASGI middleware can inject headers or measure duration without wrapping coroutines in task groups or buffering streaming response bodies.

## 4. Real Code — See It Working

Here is a complete, runnable FastAPI implementation demonstrating built-in security middlewares, a standard HTTP timing middleware, and a production-grade pure ASGI correlation ID middleware.

```python
import time
import uuid
from typing import Callable
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

app = FastAPI(title="Production Middleware Pipeline")


# 1. Pure ASGI Middleware: High-performance Correlation ID Injector
class CorrelationIdMiddleware:
    """
    Pure ASGI middleware that injects X-Request-ID without BaseHTTPMiddleware overhead.
    Guarantees compatibility with streaming responses and preserves contextvars.
    """
    def __init__(self, app: ASGIApp, header_name: str = "X-Request-ID"):
        self.app = app
        self.header_name = header_name.lower().encode("latin-1")
        self.header_name_str = header_name

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Only process standard HTTP traffic; pass WebSockets and lifespan events through
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Extract incoming request ID or generate a new UUID4
        request_id = None
        for key, value in scope.get("headers", []):
            if key.lower() == self.header_name:
                request_id = value.decode("latin-1")
                break

        if not request_id:
            request_id = str(uuid.uuid4())

        # Store in scope state so downstream endpoints and dependencies can read it
        scope.setdefault("state", {})["request_id"] = request_id

        # Wrap the ASGI send callable to inject the header on response start
        async def send_wrapper(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((self.header_name, request_id.encode("latin-1")))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)


# 2. HTTP Decorator Middleware: Request Duration Logger
@app.middleware("http")
async def add_process_time_header(request: Request, call_next: Callable) -> Response:
    """
    Standard BaseHTTPMiddleware-based hook for timing request processing.
    """
    start_time = time.perf_counter()
    response = await call_next(request)
    process_time = time.perf_counter() - start_time
    response.headers["X-Process-Time"] = f"{process_time:.6f}"
    return response


# 3. Register Middlewares in Exact Order
# Remember: The LAST middleware added is executed FIRST on incoming requests.

# Inner Layer: Gzip compression for payloads over 1KB
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Middle Layer: Pure ASGI Request-ID tracking
app.add_middleware(CorrelationIdMiddleware)

# Outer Layer: Restrict allowed HTTP Host headers
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["api.example.com", "localhost", "127.0.0.1", "testserver"],
)

# Outermost Layer: CORS must be added last so it evaluates first
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://frontend.example.com", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check(request: Request):
    # Access state populated by CorrelationIdMiddleware
    request_id = request.state.request_id
    return {
        "status": "healthy",
        "correlation_id": request_id,
        "payload": "FastAPI middleware pipeline operational."
    }
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does the middleware execution order work in FastAPI, and why does registration order matter?**

FastAPI builds its middleware stack using an onion architecture derived from Starlette. When you call `app.add_middleware(MiddlewareClass)`, Starlette wraps the current ASGI application inside the newly added middleware. This means middleware executes in reverse order of registration for incoming requests, and in direct order of registration for outgoing responses.

The last middleware registered with `app.add_middleware()` is the outermost layer of the application. An incoming request hits this outermost middleware first, cascades inwards to the innermost middleware, and then reaches routing and route handlers. The response travels outwards from the innermost middleware back to the outermost middleware before reaching the client.

Registration order is critical because outer middlewares execute before inner middlewares. `CORSMiddleware` must almost always be added last so that it sits as the outermost layer. If CORS is added first (making it the innermost layer), an outer authentication or host validation middleware might intercept an unauthenticated browser preflight `OPTIONS` request and return a 401 or 400 error before `CORSMiddleware` ever has a chance to attach required `Access-Control-Allow-Origin` headers. The browser then drops the response due to a CORS violation.

**Q: What are the fundamental differences between FastAPI Middleware and FastAPI Dependencies (`Depends`)?**

Middleware and dependencies operate at different lifecycle stages and serve different architectural purposes:

First, execution scope: Middleware runs globally for every HTTP request hitting the server, before routing resolves which path or function matches. Dependencies run only after the router successfully matches the request path to a specific endpoint.

Second, granularity and typing: Dependencies integrate with FastAPI's dependency injection system, granting access to parsed path parameters, query parameters, headers, and validated Pydantic request bodies. Middleware operates at the raw ASGI/HTTP protocol level and has no direct knowledge of Pydantic models, endpoint signatures, or security scopes.

Third, resource cleanup: Dependencies support `yield` statements, making them ideal for managing transactional lifecycles such as opening a database session, committing if no exception occurred, and guaranteeing session closure. Middleware wraps the whole HTTP request, making it ideal for transport concerns like CORS, gzip compression, request timing, and correlation IDs.

**Q: Why does `BaseHTTPMiddleware` cause issues with streaming responses and Python `contextvars`, and how do you solve it?**

`BaseHTTPMiddleware` relies on an internal `anyio` task group to run the downstream application (`call_next`) inside a separate asynchronous task. This design creates two major production problems:

First, streaming breakage: When an endpoint returns a `StreamingResponse` (such as a multi-gigabyte file export or an SSE connection), `BaseHTTPMiddleware` intercepts the stream to construct a full Starlette `Response` object. In doing so, it can buffer chunks in memory or fail to propagate client disconnect signals cleanly, leading to memory bloat and broken real-time streaming connections.

Second, `contextvars` isolation: Python's `contextvars` module manages context local to the current async task. Because `BaseHTTPMiddleware` executes `call_next` inside a spawned task, modifications made to context variables inside the endpoint handler or dependencies do not propagate back to the middleware's post-processing code, and background tasks spawned downstream can lose access to request context.

To solve this, write a Pure ASGI Middleware using the standard `async def __call__(self, scope, receive, send)` signature. Pure ASGI middleware runs directly in the main request coroutine without task switching, intercepts ASGI messages directly on the wire, and handles streaming responses with zero memory buffering.

**Q: Why do unhandled exceptions inside route handlers sometimes bypass custom middleware response logic?**

When an unhandled exception occurs inside a route handler, FastAPI's exception handlers (such as `@app.exception_handler(Exception)`) catch the exception and convert it into an HTTP `Response` (typically a 500 JSON response).

Because FastAPI's internal exception handling sits inside the ASGI application wrapped by middleware, the exception is caught, handled, and returned as a normal `Response` object through `call_next()`. As a result, your middleware's post-processing logic (after `call_next`) still executes for application-level errors.

However, if an exception is thrown inside the middleware itself (either before `call_next` or after `call_next`), it bypasses FastAPI's router exception handlers entirely. The exception bubbles up directly to the ASGI server (Uvicorn), which terminates the request with a raw 500 internal server error. Any middleware sitting outside the failing middleware will see the exception bubble up unless wrapped in a `try...except` block.

**Q: How do you read or log the request body inside middleware without breaking downstream route parameter parsing?**

In ASGI, the request body is delivered as an asynchronous stream consumed chunk by chunk via the `receive` callable. Once the stream is read, the data is consumed and cannot be read a second time by downstream route handlers or Pydantic parsers.

If a middleware calls `await request.body()`, it exhausts the stream. To allow downstream endpoints to access the body, the middleware must buffer the bytes and monkey-patch or replace the `receive` callable so subsequent consumers receive the buffered data:

```python
async def custom_body_logging_middleware(request: Request, call_next: Callable):
    body_bytes = await request.body()

    # Reconstruct receive so downstream route handlers can read the body
    async def receive():
        return {"type": "http.request", "body": body_bytes, "more_body": False}

    request = Request(request.scope, receive=receive)
    response = await call_next(request)
    return response
```

In high-throughput environments, consuming and buffering the entire request body in middleware should be avoided because it negates streaming uploads and increases memory pressure.

**Q: Where should `CORSMiddleware` sit in your middleware stack, and what happens if you place it incorrectly?**

`CORSMiddleware` should sit at the outermost layer of your middleware stack, meaning it must be added last using `app.add_middleware(CORSMiddleware)`.

When a web browser makes a cross-origin request involving custom headers or non-simple HTTP methods (like `PUT`, `DELETE`, or `POST` with `application/json`), it first sends an HTTP `OPTIONS` preflight request. This preflight request does not include authentication credentials (like bearer tokens or session cookies).

If an authentication, rate-limiting, or custom header validation middleware is placed outside `CORSMiddleware`, that outer middleware will inspect the unauthenticated `OPTIONS` request, fail validation, and return an HTTP 401, 403, or 400 response. Because `CORSMiddleware` never saw the request, the error response lacks `Access-Control-Allow-Origin` headers. The browser blocks the request with a CORS error, masking the underlying issue. Placing CORS as the outermost layer ensures preflight requests are answered immediately with status 200 and appropriate CORS headers.

## 6. The Traps — What Goes Wrong

### Trap 1: Reading Request Body Without Replaying the Stream
Developers often attempt to log request payloads by calling `body = await request.body()` inside `@app.middleware("http")`. When the request subsequently reaches the route handler, FastAPI's Pydantic validation fails with a validation error or hangs indefinitely waiting for body bytes. This happens because the underlying ASGI receive channel is a single-read stream. Once read, the buffer is empty. If you must inspect the body in middleware, you must synthesize a replacement async `receive` generator that replays the cached bytes to downstream layers.

### Trap 2: Using `BaseHTTPMiddleware` for File Streaming or WebSockets
Wrapping an application that serves Server-Sent Events, WebSockets, or multi-gigabyte file downloads with `BaseHTTPMiddleware` (or `@app.middleware("http")`) causes unexpected disconnects or massive memory spikes. `BaseHTTPMiddleware` wraps response bodies inside an iterator that does not forward WebSocket frames and buffers chunked streaming responses. For applications serving real-time streams or WebSockets, all custom middleware touching those paths must be implemented as Pure ASGI middleware.

### Trap 3: Inverting Middleware Registration Order
Because FastAPI registers middleware from the inside out, developers intuitively assume the first `app.add_middleware()` call runs first. Inverting this order—placing `GZipMiddleware` or custom authentication middleware outside `CORSMiddleware`—breaks browser clients. Always write out your middleware registration block deliberately: the innermost middleware (closest to the endpoint) is registered first; the outermost middleware (closest to the client, like CORS) is registered last.

### Trap 4: Attempting Route-Specific Authorization in Global Middleware
Engineers coming from Express or Django sometimes try to enforce role-based access control inside global middleware by parsing URL paths with regex:
```python
# Anti-pattern: Brittle and dangerous
if request.url.path.startswith("/admin") and not user.is_admin:
    return JSONResponse(status_code=403, content={"detail": "Forbidden"})
```
This is vulnerable to path traversal variations, URL normalization inconsistencies (e.g., `/admin/`, `//admin`, `/api/v1/../admin`), and ignores FastAPI's OpenAPI schema generation. Authorization must be handled through FastAPI Dependencies (`Depends()`) attached to routers or endpoints, where path parameters and security scopes are type-checked and reflected in Swagger documentation.

### Trap 5: Swallowing Exceptions in Middleware
If a developer wraps `response = await call_next(request)` in a broad `try...except Exception:` block inside middleware and returns a custom `JSONResponse(status_code=500)` without re-raising, they bypass FastAPI's registered exception handlers, Sentry logging integrations, and background task cleanup. Middleware should only catch exceptions it explicitly intends to handle, allowing all other errors to reach FastAPI's exception handling layer.

## 7. Compare With Related Concepts

| Dimension | FastAPI Middleware | FastAPI Dependencies (`Depends`) | Exception Handlers (`@app.exception_handler`) | Reverse Proxy (Nginx / Cloudflare) |
|---|---|---|---|---|
| **Execution Point** | Outer application layer; runs before router matches | Inner route layer; runs after route matching succeeds | Invoked when an exception bubbles out of routing/dependencies | External network edge before traffic reaches Python/Uvicorn |
| **Scope** | Global across all requests | Granular: per-route, per-router, or global | Triggered per exception class | Infrastructure-wide |
| **Data Access** | Raw ASGI scope, headers, raw byte stream | Parsed parameters, validated Pydantic models, auth context | The unhandled exception instance and request object | Raw TCP/HTTP packets |
| **Resource Cleanup** | Manual `try...finally` around `call_next` | Built-in Python generator `yield` cleanup | None (error response formatting only) | Connection termination |
| **Best Used For** | CORS, Gzip, correlation IDs, request timing, security headers | Auth, DB sessions, business permissions, input validation | Formatting consistent error payloads | TLS termination, DDoS mitigation, static asset caching |

### When to Use Which:
- Use **Middleware** when you need to inspect, modify, or measure every single HTTP transmission regardless of which route was requested (e.g., adding `X-Request-ID`, enforcing CORS, computing request duration).
- Use **Dependencies** when the operation requires parsed parameters, database transactions, user authentication, or applies only to a subset of routes.
- Use **Exception Handlers** when you need to translate specific Python exception classes into clean standardized JSON API error responses.
- Use a **Reverse Proxy** for infrastructure-level concerns like SSL/TLS termination, rate limiting by physical IP, and edge caching.

## 8. 🧠 The Memory Hook

Middleware is the airport's outer security perimeter: **the last checkpoint installed is the first one you walk through on entry, and the last one you pass on exit.**

Use **Pure ASGI Middleware** for global headers, timing, and transport wrapping where streaming and performance matter; use **Dependencies** the moment you need user identity, database sessions, or route-level business rules.
