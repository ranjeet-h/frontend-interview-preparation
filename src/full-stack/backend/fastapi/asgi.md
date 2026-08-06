# ASGI

## Detailed explanation

ASGI is the asynchronous Python server interface that allows frameworks to handle HTTP, WebSocket, and async workloads. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

ASGI is the async contract between Python web servers and apps.

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

#### What is ASGI and why does it matter?
- **The Engine Mechanism (Why it behaves this way):** ASGI (Asynchronous Server Gateway Interface) is a specification for how asynchronous Python web servers communicate with web applications. It defines a callable that receives a `scope` dictionary (request metadata), an `receive` coroutine (to read incoming data), and a `send` coroutine (to write outgoing data). Unlike WSGI which is synchronous and request-per-thread, ASGI supports async/await, long-lived connections (WebSockets, Server-Sent Events), and HTTP/2. FastAPI, Starlette, Django Channels, and Quart all implement ASGI.
- **The Unforgettable Mental Model:** The **Universal Translator**. WSGI is like a translator who only handles phone calls (request-response). ASGI is a translator who handles phone calls, video chats, live streams, and walkie-talkie conversations — any type of communication, sustained or instant.
- **The Trap:** Thinking ASGI is just "async WSGI." ASGI is a fundamentally different protocol that supports bidirectional, long-lived connections that WSGI cannot handle at all.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: ASGI is the asynchronous successor to WSGI. It defines how async Python servers talk to applications, supporting not just HTTP request-response but also WebSockets, Server-Sent Events, and HTTP/2. FastAPI uses ASGI through Starlette, which is why it can handle thousands of concurrent connections and real-time protocols that WSGI frameworks like Flask cannot."

#### How does ASGI differ from WSGI?
- **The Engine Mechanism (Why it behaves this way):** WSGI is synchronous: each request blocks a thread until the response is complete. The server must maintain a thread pool, and each thread consumes ~8MB of memory. ASGI is asynchronous: a single event loop handles many connections concurrently by yielding control during I/O waits. ASGI also supports bidirectional communication through `receive` and `send` coroutines, enabling WebSockets and streaming. WSGI's interface is `application(environ, start_response)` — synchronous and one-directional. ASGI's interface is `async def application(scope, receive, send)` — async and bidirectional.
- **The Unforgettable Mental Model:** The **Restaurant Comparison**. WSGI is a restaurant where each table gets its own dedicated waiter who stands there doing nothing while the kitchen cooks. ASGI is a restaurant where one waiter takes orders from all tables, checks on the kitchen, and serves when food is ready — handling many tables efficiently.
- **The Trap:** Assuming you can run ASGI apps on WSGI servers (Gunicorn with sync workers, uWSGI in WSGI mode). ASGI requires an ASGI server like Uvicorn, Daphne, or Hypercorn.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: WSGI is synchronous and thread-per-request, limiting concurrency and memory efficiency. ASGI is asynchronous with an event loop, handling many concurrent connections in a single thread. ASGI also supports WebSockets and streaming, which WSGI cannot. FastAPI requires ASGI, which is why it runs on Uvicorn, not Gunicorn's WSGI workers."

#### What is the ASGI application signature?
- **The Engine Mechanism (Why it behaves this way):** An ASGI application is an async callable with three parameters: `scope` (a dict containing request type, path, headers, query strings, and connection info), `receive` (an async function that returns messages from the client), and `send` (an async function that sends messages to the client). The application processes the `scope`, calls `receive()` to read the request body, and calls `send()` with response messages. This low-level interface is what servers call directly — frameworks like FastAPI wrap it in higher-level abstractions.
- **The Unforgettable Mental Model:** The **Three-Part Contract**. `scope` is the envelope (what's this about?), `receive` is the mailbox (what's the client saying?), and `send` is the reply slot (here's my response). Every ASGI app follows this same contract regardless of framework.
- **The Trap:** Writing raw ASGI applications in production. While possible, it's error-prone. Frameworks like FastAPI/Starlette handle edge cases (chunked encoding, connection closure, protocol errors) that raw ASGI code often misses.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: An ASGI app is an async callable receiving three arguments: scope (request metadata as a dict), receive (async function to read client messages), and send (async function to write response messages). Frameworks like FastAPI build on this low-level interface, providing routing, validation, and middleware so you don't interact with ASGI directly."

#### Can ASGI handle WebSockets?
- **The Engine Mechanism (Why it behaves this way):** Yes — ASGI natively supports WebSockets through the `websocket` connection type in the scope. When a WebSocket connection is established, the server sends `websocket.connect` messages, the app calls `send({"type": "websocket.accept"})` to accept, then exchanges `websocket.receive` and `websocket.send` messages for bidirectional communication. WSGI cannot handle WebSockets because its request-response model doesn't support long-lived, bidirectional connections.
- **The Unforgettable Mental Model:** The **Two-Way Radio**. HTTP is like sending letters — you write, mail it, wait for a reply. WebSockets via ASGI is like a walkie-talkie — both sides can talk and listen simultaneously over an open channel.
- **The Trap:** Assuming WebSocket handling is the same as HTTP in FastAPI. WebSockets require explicit `accept()` calls, different message types, and careful connection lifecycle management (handling disconnects, reconnection).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: ASGI natively supports WebSockets through its bidirectional receive/send interface. When a WebSocket connects, the app must explicitly accept it, then exchange messages asynchronously. This is impossible in WSGI, which only supports synchronous request-response. FastAPI provides a clean WebSocket API on top of ASGI's low-level message passing."

#### What ASGI servers are available for FastAPI?
- **The Engine Mechanism (Why it behaves this way):** The main ASGI servers are: **Uvicorn** — the most popular, built on `uvloop` (fast event loop) and `httptools` (fast HTTP parser), used for development and production with multiple workers. **Gunicorn with Uvicorn workers** — Gunicorn manages worker processes while Uvicorn handles async within each worker, providing robust process management. **Hypercorn** — supports HTTP/1.1, HTTP/2, and WebSockets, with a focus on protocol correctness. **Daphne** — originally built for Django Channels, supports HTTP/1.1, HTTP/2, and WebSockets.
- **The Unforgettable Mental Model:** The **Vehicle Fleet**. Uvicorn is a sports car (fast, popular). Gunicorn + Uvicorn workers is a bus fleet (Gunicorn manages the fleet, Uvicorn drives each bus). Hypercorn is a luxury sedan (protocol-correct, feature-rich). Daphne is a reliable truck (battle-tested, Django ecosystem).
- **The Trap:** Running Uvicorn with a single worker in production. This uses only one CPU core. Production deployments should use Gunicorn with Uvicorn workers or Uvicorn's `--workers` flag.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For development, I use Uvicorn directly. For production, I use Gunicorn with Uvicorn workers — Gunicorn manages process lifecycle and restarts while Uvicorn handles async within each worker. This gives both process-level reliability and async performance. Hypercorn is an alternative with HTTP/2 support."

#### How does the ASGI event loop affect request handling?
- **The Engine Mechanism (Why it behaves this way):** The ASGI event loop (usually `asyncio` or `uvloop`) runs a single-threaded loop that processes tasks cooperatively. When an async function awaits I/O (database query, HTTP call, file read), it yields control back to the loop, which processes other pending tasks. This allows one thread to handle thousands of concurrent connections. However, if any code performs CPU-bound work or calls a blocking function without `await`, it freezes the entire loop — all other requests stall until the blocking code completes.
- **The Unforgettable Mental Model:** The **Juggling Chef**. The event loop is a chef juggling multiple pots. When one pot needs to simmer (I/O wait), the chef switches to another pot. But if the chef stops to chop vegetables for 10 minutes (CPU-bound work), every pot burns because no one is checking them.
- **The Trap:** Mixing blocking code in async routes. Even one `time.sleep()` or synchronous database call in an `async def` route blocks all other requests on that event loop.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The ASGI event loop handles concurrency cooperatively — async functions yield control during I/O waits, allowing the loop to process other requests. But blocking code freezes everything. That's why I use `async def` only with async libraries, and `def` for sync code so FastAPI runs it in a threadpool instead of blocking the event loop."

## 8. Active recall test

1. **What does ASGI stand for and what does it define?**
   - **Explanation:** Asynchronous Server Gateway Interface. It defines a standard interface (`async def app(scope, receive, send)`) for async Python web servers to communicate with applications, supporting HTTP, WebSockets, and other protocols.

2. **What are the three parameters of an ASGI application?**
   - **Explanation:** `scope` (dict with request metadata like path, headers, type), `receive` (async function to read messages from the client), and `send` (async function to send messages to the client).

3. **Why can't WSGI handle WebSockets?**
   - **Explanation:** WSGI is a synchronous, request-response-only protocol. It has no mechanism for long-lived, bidirectional connections. ASGI's `receive`/`send` coroutines enable the persistent connection WebSockets require.

4. **What is the recommended production deployment for FastAPI?**
   - **Explanation:** Gunicorn with Uvicorn workers. Gunicorn manages process lifecycle (restarts, graceful shutdown) while Uvicorn workers handle async request processing within each process.

5. **What happens if you run blocking code in an async route?**
   - **Explanation:** It blocks the entire event loop, freezing all other concurrent requests until the blocking code completes. This is why sync libraries should be used with `def` routes, not `async def`.

6. **What is uvloop and why does it matter?**
   - **Explanation:** uvloop is a fast drop-in replacement for Python's asyncio event loop, built on libuv (the same library powering Node.js). It's 2-4x faster than the standard asyncio loop, and Uvicorn uses it by default.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

ASGI should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain ASGI, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define ASGI.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
