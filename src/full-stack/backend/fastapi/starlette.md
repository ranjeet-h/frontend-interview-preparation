# Starlette

## Detailed explanation

Starlette is the lightweight ASGI toolkit underneath FastAPI for routing, middleware, requests, responses, and WebSockets. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Starlette is FastAPI’s web foundation.

## 2. Problem it solves

It keeps FastAPI applications predictable by making contracts, shared logic, validation, or runtime behavior explicit instead of scattering framework code across handlers.

## 3. Core idea

- Use Python type hints as API contracts.
- Keep route handlers thin and delegate business logic to services.
- Use dependencies for shared request-time behavior.
- Return explicit response models and status codes.
- Test behavior through HTTP calls and dependency overrides.

## 4. Visual / analogy

```txt
Request -> dependency resolution -> validation -> endpoint -> service/database -> response model -> response
```

## 5. Minimal example

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str

@app.post("/items")
def create_item(item: Item):
    return {"data": item}
```

## 6. Real-world example

A production FastAPI service uses routers per domain, Pydantic schemas for input/output, dependencies for auth and DB sessions, exception handlers for consistent errors, and tests with dependency overrides.

## 7. Common interview questions

#### What is Starlette and how does it relate to FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Starlette is a lightweight ASGI framework that provides the foundational web layer for FastAPI. It handles routing, middleware, request/response objects, WebSocket support, background tasks, and static file serving. FastAPI inherits all of Starlette's web capabilities and adds type-driven request validation, dependency injection, automatic OpenAPI schema generation, and response serialization via Pydantic. FastAPI is essentially Starlette + Pydantic + developer ergonomics.
- **The Unforgettable Mental Model:** The **Foundation and the House**. Starlette is the concrete foundation, plumbing, and electrical wiring. FastAPI is the finished house built on top — it uses the foundation but adds interior design (validation), smart home features (dependency injection), and a blueprint reader (OpenAPI docs).
- **The Trap:** Thinking Starlette and FastAPI are competitors. FastAPI depends on Starlette — you cannot use FastAPI without it. Starlette can be used alone for simpler apps that don't need Pydantic validation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Starlette is the ASGI web framework that FastAPI builds on. It provides routing, middleware, request/response handling, and WebSocket support. FastAPI adds Pydantic-based validation, dependency injection, and automatic OpenAPI docs on top of Starlette's foundation. When you use FastAPI, you're always using Starlette underneath."

#### What features does Starlette provide that FastAPI uses?
- **The Engine Mechanism (Why it behaves this way):** Starlette provides: (1) **Routing** — URL pattern matching with path parameters, (2) **Request/Response objects** — typed access to headers, body, cookies, query params, (3) **Middleware** — composable request/response processing chain, (4) **WebSockets** — bidirectional async communication, (5) **Background tasks** — fire-and-forget async functions, (6) **Static files** — serving files from disk, (7) **Exception handling** — mapping exceptions to HTTP responses, (8) **Lifespan** — startup/shutdown events. FastAPI uses all of these and adds its own layer of type-driven features.
- **The Unforgettable Mental Model:** The **Toolbox**. Starlette is a complete toolbox with hammers, screwdrivers, wrenches, and drills. FastAPI takes that toolbox and adds a laser level (validation), a power adapter (dependency injection), and an instruction manual (OpenAPI docs).
- **The Trap:** Assuming FastAPI replaces all Starlette features. FastAPI extends Starlette; it doesn't replace it. You can access Starlette's `Request` object directly in FastAPI endpoints when needed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Starlette provides routing, request/response objects, middleware, WebSocket support, background tasks, static file serving, exception handling, and lifespan events. FastAPI uses all of these and adds Pydantic validation, dependency injection, and automatic OpenAPI generation. You can access Starlette's Request object directly in FastAPI when you need low-level access."

#### Can you use Starlette without FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Yes — Starlette is a standalone ASGI framework. You can build complete web applications with just Starlette, using its routing, middleware, and request/response system. However, you lose FastAPI's type-driven validation (you'd need manual validation or another library), dependency injection (you'd need to wire dependencies manually), and automatic OpenAPI docs (you'd need to write them manually or use a separate tool). Starlette is useful for simple APIs, WebSocket servers, or when you want minimal overhead without Pydantic.
- **The Unforgettable Mental Model:** The **Bare Bones Car**. Starlette is a car with an engine, wheels, and steering — it drives. FastAPI is the same car with GPS (validation), cruise control (dependency injection), and a dashboard (OpenAPI docs). You can drive without them, but they make the journey much easier.
- **The Trap:** Using Starlette for complex APIs that need validation. Without Pydantic, you'll write manual validation code that FastAPI would generate automatically — reinventing the wheel.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Yes, Starlette works standalone. I'd use it for simple APIs, WebSocket servers, or when Pydantic validation isn't needed. But for production APIs with complex validation, dependency injection, and documentation needs, FastAPI is the better choice because it automates what you'd otherwise build manually on Starlette."

#### How does Starlette's routing work?
- **The Engine Mechanism (Why it behaves this way):** Starlette's routing matches incoming request paths against a list of `Route` objects. Each route has a path pattern (e.g., `/items/{item_id}`), an HTTP method, and a handler function. Path parameters are extracted using `{name}` syntax and passed as keyword arguments to the handler. Routes are evaluated in order — the first match wins. Starlette also supports `Mount` for sub-applications and `Host` for domain-based routing. FastAPI's `APIRouter` builds on Starlette's routing with additional features like tags and dependency inheritance.
- **The Unforgettable Mental Model:** The **Mail Sorting Facility**. Each route is a sorting bin labeled with a pattern. Incoming mail (requests) goes down the conveyor belt and drops into the first bin whose label matches. The bin's worker (handler) processes the mail.
- **The Trap:** Route ordering matters. A catch-all route (`/{path}`) placed before specific routes (`/items/{id}`) will shadow the specific routes. Always define specific routes before generic ones.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Starlette routes match URL patterns in order, extracting path parameters from `{name}` segments. FastAPI builds on this with APIRouter for modular route grouping, automatic type conversion of path params, and OpenAPI schema generation. Route ordering matters — specific routes must come before catch-all patterns."

#### What is Starlette's middleware system?
- **The Engine Mechanism (Why it behaves this way):** Starlette middleware follows the ASGI middleware pattern: each middleware is an ASGI app that wraps another ASGI app. It receives the `scope`, `receive`, and `send` parameters, can modify the request before passing it downstream, and can modify the response before returning it upstream. Middleware is applied in reverse order of addition (like an onion — the last middleware added is the outermost layer). Common middleware includes CORS, authentication, logging, and compression. FastAPI exposes Starlette's middleware through `app.add_middleware()`.
- **The Unforgettable Mental Model:** The **Security Checkpoint Layers**. Each middleware is a checkpoint: the outermost checks IDs (CORS), the next scans bags (auth), the next verifies tickets (logging). Request passes through all checkpoints going in; response passes through them coming out in reverse order.
- **The Trap:** Middleware order matters critically. CORS must be outermost to handle preflight requests before auth runs. Logging should be outermost to capture all requests including errors.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Starlette middleware wraps the ASGI app in layers, with each layer able to inspect and modify requests and responses. Middleware runs in reverse order of addition — the last added is the outermost layer. I always put CORS first (outermost) to handle preflight requests, then auth, then logging to capture everything."

#### How does Starlette handle WebSockets?
- **The Engine Mechanism (Why it behaves this way):** Starlette provides a `WebSocket` class that wraps the ASGI WebSocket protocol. The connection lifecycle is: (1) client initiates WebSocket handshake, (2) server receives `websocket.connect` message, (3) app calls `websocket.accept()` to complete the handshake, (4) bidirectional message exchange via `websocket.receive_text()`, `websocket.receive_json()`, `websocket.send_text()`, `websocket.send_json()`, (5) connection closes via `websocket.close()` or client disconnect. FastAPI exposes this through `@app.websocket()` decorators with dependency injection support.
- **The Unforgettable Mental Model:** The **Phone Call**. HTTP is like sending a text message — one message, one response. WebSocket is like a phone call — you dial (connect), the other party answers (accept), you talk back and forth (send/receive), and someone hangs up (close).
- **The Trap:** Forgetting to call `accept()`. If you don't explicitly accept a WebSocket connection, it remains in a pending state and the client will timeout. Also, WebSocket handlers cannot return standard responses — they must use the WebSocket API exclusively.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Starlette handles WebSockets through an explicit lifecycle: connect, accept, exchange messages, close. The app must call `accept()` to complete the handshake, then uses `receive_*` and `send_*` methods for bidirectional communication. FastAPI adds dependency injection to WebSocket handlers, allowing auth and DB sessions in real-time connections."

## 8. Active recall test

1. **What is the relationship between Starlette and FastAPI?**
   - **Explanation:** FastAPI is built on top of Starlette. Starlette provides the ASGI web layer (routing, middleware, request/response, WebSockets), and FastAPI adds Pydantic validation, dependency injection, and OpenAPI docs.

2. **Can Starlette be used without FastAPI?**
   - **Explanation:** Yes, Starlette is a standalone ASGI framework. It's useful for simple APIs or WebSocket servers that don't need Pydantic validation or automatic documentation.

3. **How does Starlette middleware ordering work?**
   - **Explanation:** Middleware is applied in reverse order — the last middleware added is the outermost layer. Requests pass through middleware from outermost to innermost; responses pass from innermost to outermost.

4. **What is the WebSocket lifecycle in Starlette?**
   - **Explanation:** Connect → accept() → send/receive messages → close(). The app must explicitly call accept() to complete the handshake, or the connection times out.

5. **What routing features does Starlette provide?**
   - **Explanation:** Path-based routing with `{param}` extraction, HTTP method matching, route ordering (first match wins), Mount for sub-applications, and Host for domain-based routing.

6. **Why is CORS middleware typically added first?**
   - **Explanation:** CORS must be the outermost middleware to handle browser preflight OPTIONS requests before any auth or business logic runs. If auth runs first, it may reject the preflight request.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Starlette should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Starlette, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Starlette.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
