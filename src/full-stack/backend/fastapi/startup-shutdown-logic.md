# Startup and Shutdown Logic

## Detailed explanation

Startup and shutdown logic initializes and cleans resources safely across app lifecycle. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Start resources before traffic, close them before exit.

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

#### How do you implement startup and shutdown logic in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Use the lifespan context manager: `from contextlib import asynccontextmanager; @asynccontextmanager async def lifespan(app: FastAPI): # startup: create resources; yield; # shutdown: clean resources; app = FastAPI(lifespan=lifespan)`. The code before `yield` runs when the server starts (before handling requests). The code after `yield` runs when the server shuts down (after handling all in-flight requests). This is the modern approach, replacing the deprecated `@app.on_event("startup")` and `@app.on_event("shutdown")` decorators.
- **The Unforgettable Mental Model:** The **Theater Curtain**. Before the curtain rises (startup): lights on, actors in position, props set. After the curtain falls (shutdown): lights off, actors exit, props stored. The yield is the performance itself.
- **The Trap:** Using the deprecated on_event decorators. They don't guarantee cleanup if startup fails and are being phased out. Always use the lifespan context manager.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use the lifespan context manager with @asynccontextmanager. Code before yield runs on startup, code after yield runs on shutdown. This replaces the deprecated on_event decorators and guarantees cleanup even if startup fails. I use it for DB pools, HTTP clients, and cache connections."

#### What is the difference between startup/shutdown and per-request setup/cleanup?
- **The Engine Mechanism (Why it behaves this way):** Startup/shutdown (lifespan) runs once per application lifecycle — for resources shared across all requests (connection pools, caches). Per-request setup/cleanup (dependencies with yield) runs once per request — for resources scoped to a single request (DB sessions, current user). Lifespan resources are created once and reused; dependency resources are created fresh for each request. Mixing them causes issues: per-request resources in lifespan are shared across requests (data leakage), app-scoped resources in dependencies are recreated per request (performance waste).
- **The Unforgettable Mental Model:** The **City Water System vs. the Faucet**. The water treatment plant (lifespan) runs once and provides water to the entire city. Each home's faucet (dependency) turns on/off per use. You don't build a new treatment plant for each faucet use.
- **The Trap:** Creating a new DB connection in lifespan and sharing it across requests. This causes connection state leakage between requests. Use a connection pool in lifespan and per-request sessions from the pool in dependencies.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Lifespan is for app-scoped resources — created once, shared across all requests. Dependencies with yield are for request-scoped resources — created fresh per request. I create a DB connection pool in lifespan and per-request sessions from the pool in dependencies. Mixing scopes causes data leakage or performance issues."

#### How do you ensure shutdown cleanup runs reliably?
- **The Engine Mechanism (Why it behaves this way):** The lifespan context manager guarantees shutdown code runs after yield, even if the endpoint raised an exception. However, shutdown code only runs if yield was reached — if startup fails before yield, shutdown doesn't run. To ensure reliable cleanup: (1) Keep startup code minimal and robust, (2) Use try/finally in startup for partial cleanup, (3) Use yield dependencies for request-scoped cleanup (they run even if startup partially failed), (4) Configure graceful shutdown timeout in the server (Uvicorn's --timeout).
- **The Unforgettable Mental Model:** The **Emergency Evacuation Plan**. The plan (shutdown code) only works if the building was successfully occupied (yield reached). If the building never opened (startup failed), there's no evacuation needed. But each floor (dependency) has its own exit plan.
- **The Trap:** Putting critical cleanup in startup's try block instead of after yield. Cleanup belongs after yield — that's where it's guaranteed to run after the app has served requests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Shutdown cleanup runs after yield in the lifespan context manager. It's guaranteed to run if yield was reached. I keep startup minimal to reduce failure risk, use try/finally for partial startup cleanup, and rely on yield dependencies for request-scoped cleanup. I also configure graceful shutdown timeouts."

#### How do you handle graceful shutdown?
- **The Engine Mechanism (Why it behaves this way):** Graceful shutdown means: (1) Stop accepting new connections, (2) Wait for in-flight requests to complete (up to a timeout), (3) Run lifespan shutdown code, (4) Exit. Uvicorn handles this on SIGTERM: it stops accepting connections, waits for requests (configurable timeout), then triggers lifespan shutdown. Configure the timeout with `--timeout-keep-alive` (Uvicorn) or `--timeout` (Gunicorn). In lifespan shutdown, close connection pools, flush caches, and drain background tasks.
- **The Unforgettable Mental Model:** The **Restaurant Last Call**. The host stops seating new guests (stop accepting connections), finishes serving existing tables (in-flight requests), then the staff cleans up (shutdown code) and locks the doors (exit).
- **The Trap:** Not configuring shutdown timeout. The default timeout may be too short for long-running requests, causing them to be killed mid-processing. Set an appropriate timeout for your workload.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Graceful shutdown stops accepting new connections, waits for in-flight requests, runs lifespan cleanup, and exits. I configure appropriate timeouts for my workload. In lifespan shutdown, I close connection pools, flush caches, and drain background tasks. This ensures zero-downtime deployments."

#### How do you initialize external services on startup?
- **The Engine Mechanism (Why it behaves this way):** In the lifespan startup section, initialize external services and store them on app.state: `@asynccontextmanager async def lifespan(app: FastAPI): app.state.http_client = httpx.AsyncClient(); app.state.redis = await aioredis.create_redis_pool("redis://localhost"); yield; await app.state.redis.close(); await app.state.http_client.aclose()`. Services should be initialized with connection pooling and health checks. If a service is unavailable, decide whether to fail fast (exit) or start in degraded mode (skip that service).
- **The Unforgettable Mental Model:** The **Tool Setup**. Before work begins, the worker lays out all tools (external services) on the bench (app.state). Each tool is checked (health check) before use. After work, tools are cleaned and stored (shutdown cleanup).
- **The Trap:** Initializing services synchronously in an async lifespan. Use async initialization methods to avoid blocking the event loop during startup.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I initialize external services in lifespan startup and store them on app.state. I use async initialization methods, connection pooling, and health checks. If a service is unavailable, I fail fast for critical services and start in degraded mode for non-critical ones. All services are cleaned up in shutdown."

#### How do you test startup and shutdown logic?
- **The Engine Mechanism (Why it behaves this way):** TestClient triggers lifespan events automatically. Use it as a context manager: `with TestClient(app) as client: assert app.state.db_pool is not None; # verify startup; # shutdown runs on exit; assert app.state.db_pool.is_closed`. Test startup by verifying resources are initialized. Test shutdown by verifying resources are cleaned up. Test startup failures by mocking resource creation to raise exceptions and verifying the app doesn't start. Use pytest fixtures to manage TestClient lifecycle.
- **The Unforgettable Mental Model:** The **Opening Night Rehearsal**. Before the real show, you run through the full opening (startup) and closing (shutdown) sequence to verify everything works.
- **The Trap:** Testing startup and shutdown separately. They're a pair — startup creates what shutdown cleans. Test them together with TestClient's context manager.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test lifespan with TestClient as a context manager — startup runs on entry, shutdown on exit. I verify resources are initialized after startup and cleaned up after shutdown. I test startup failures by mocking resource creation to raise exceptions. I always test startup and shutdown together."

## 8. Active recall test

1. **How do you implement startup/shutdown in modern FastAPI?**
   - **Explanation:** Use @asynccontextmanager with lifespan parameter on FastAPI(). Code before yield runs on startup, code after yield runs on shutdown.

2. **What's the difference between lifespan and dependency cleanup?**
   - **Explanation:** Lifespan runs once per app lifecycle (app-scoped resources). Dependencies with yield run once per request (request-scoped resources).

3. **When does shutdown code NOT run?**
   - **Explanation:** If startup fails before yield is reached. Shutdown only runs if yield was reached — meaning the app successfully started.

4. **What does graceful shutdown do?**
   - **Explanation:** Stops accepting new connections, waits for in-flight requests (up to timeout), runs lifespan shutdown code, then exits.

5. **Where should you store initialized external services?**
   - **Explanation:** On app.state. Dependencies read from app.state and return per-request instances. Avoid global variables.

6. **How do you test startup and shutdown?**
   - **Explanation:** Use TestClient as a context manager. Startup runs on entry, shutdown on exit. Verify resources are initialized and cleaned up.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Startup and Shutdown Logic should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Startup and Shutdown Logic, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Startup and Shutdown Logic.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
