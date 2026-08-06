# FastAPI Lifespan Events

## Detailed explanation

Lifespan events manage startup and shutdown resources like DB pools, clients, and caches. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Lifespan opens and closes app resources.

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

#### What are lifespan events in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Lifespan events manage application-level resources that need setup before the app handles requests and cleanup after it stops. Use the `@asynccontextmanager` pattern with `lifespan`: `@asynccontextmanager async def lifespan(app: FastAPI): setup(); yield; cleanup(); app = FastAPI(lifespan=lifespan)`. The code before `yield` runs on startup, the code after `yield` runs on shutdown. Lifespan replaces the deprecated `@app.on_event("startup")` and `@app.on_event("shutdown")` decorators. It ensures cleanup runs even if startup fails or the app crashes.
- **The Unforgettable Mental Model:** The **Store Opening/Closing**. Before opening (startup): unlock doors, turn on lights, stock shelves. After closing (shutdown): lock doors, turn off lights, secure cash. The lifespan context manager ensures closing procedures always run, even if the day was chaotic.
- **The Trap:** Using the deprecated `@app.on_event("startup")` decorator. It's deprecated in favor of the lifespan context manager, which provides better error handling and cleanup guarantees.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Lifespan events manage app-level resources using an async context manager. Code before yield runs on startup, code after yield runs on shutdown. It replaces the deprecated on_event decorators and ensures cleanup runs even if startup fails. I use it for DB pool initialization, cache setup, and external client connections."

#### What resources should you manage with lifespan?
- **The Engine Mechanism (Why it behaves this way):** Lifespan manages application-scoped resources: (1) **Database connection pools** — create pool on startup, close on shutdown, (2) **HTTP client sessions** — create async HTTP client (httpx.AsyncClient) on startup, close on shutdown, (3) **Cache connections** — connect to Redis/Memcached on startup, disconnect on shutdown, (4) **Message queue connections** — connect to RabbitMQ/Kafka on startup, close on shutdown, (5) **Scheduled tasks** — start schedulers on startup, stop on shutdown. These resources are shared across all requests and should not be created per-request.
- **The Unforgettable Mental Model:** The **Shared Infrastructure**. The building's power grid (DB pool), water supply (HTTP client), and security system (cache) are set up before anyone arrives and shut down after everyone leaves. They're shared by everyone in the building.
- **The Trap:** Creating per-request resources in lifespan. Lifespan is for app-scoped resources, not request-scoped ones. Request-scoped resources (DB sessions) belong in dependencies with yield.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use lifespan for app-scoped resources — DB connection pools, HTTP client sessions, cache connections, message queue connections. These are shared across all requests. Request-scoped resources like DB sessions belong in dependencies with yield, not in lifespan."

#### How does lifespan differ from dependencies with yield?
- **The Engine Mechanism (Why it behaves this way):** Lifespan runs once per application lifecycle (startup and shutdown). Dependencies with yield run once per request (setup before endpoint, cleanup after response). Lifespan is for app-scoped resources (connection pools, caches). Dependencies are for request-scoped resources (DB sessions, current user). Lifespan resources are stored on `app.state` and accessed by dependencies. Dependencies create per-request instances from app-scoped resources.
- **The Unforgettable Mental Model:** The **Power Plant vs. the Light Switch**. Lifespan is the power plant — it runs once and provides electricity (connection pool) to the entire city (app). Dependencies are light switches — each room (request) turns on its own light (DB session) using the shared power.
- **The Trap:** Mixing lifespan and dependency scopes. Don't create request-scoped resources in lifespan (they'll be shared across requests, causing data leakage). Don't create app-scoped resources in dependencies (they'll be recreated per request, wasting resources).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Lifespan runs once per app lifecycle — for app-scoped resources like connection pools. Dependencies with yield run once per request — for request-scoped resources like DB sessions. Lifespan resources are stored on app.state and accessed by dependencies. They complement each other."

#### How do you store lifespan resources for use in endpoints?
- **The Engine Mechanism (Why it behaves this way):** Store resources on `app.state` during lifespan setup: `@asynccontextmanager async def lifespan(app: FastAPI): app.state.db_pool = await create_pool(); yield; await app.state.db_pool.close()`. Access them in dependencies: `def get_db(app: FastAPI = Depends(lambda: app)): return app.state.db_pool.acquire()`. Or access directly in endpoints via `Request.app.state`. The cleanest approach is to create a dependency that reads from app.state and returns the resource.
- **The Unforgettable Mental Model:** The **Shared Fridge**. The lifespan stocks the fridge (app.state) with ingredients (resources). Dependencies and endpoints reach into the fridge to get what they need for each meal (request).
- **The Trap:** Using global variables for lifespan resources. Global variables make testing hard and create hidden dependencies. Use app.state — it's accessible through the app object and can be mocked in tests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I store lifespan resources on app.state during setup. Dependencies read from app.state and return per-request instances. I avoid global variables — app.state is accessible through the app object and can be mocked in tests. This keeps the architecture clean and testable."

#### How do you handle lifespan startup failures?
- **The Engine Mechanism (Why it behaves this way):** If startup code (before yield) raises an exception, the app fails to start and the server exits with an error. The shutdown code (after yield) does NOT run because yield was never reached. To handle startup failures gracefully: (1) Wrap startup code in try/except, (2) Log the error, (3) Decide whether to fail fast (exit) or start in degraded mode (yield anyway). For production, fail fast is usually preferred — a partially initialized app is dangerous.
- **The Unforgettable Mental Model:** The **Pre-Flight Check**. If the plane fails pre-flight checks (startup), it doesn't take off. The post-flight checklist (shutdown) doesn't run because the flight never happened. Better to fail on the ground than in the air.
- **The Trap:** Silently swallowing startup errors. If the DB pool fails to initialize and you continue, every request will fail. Fail fast and let the orchestrator (Kubernetes, Docker) restart the app.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: If startup fails, the app doesn't start and shutdown doesn't run. I prefer fail-fast — if the DB pool can't initialize, the app shouldn't start. I log the error and let the orchestrator restart. Silently swallowing startup errors creates a partially initialized app that fails on every request."

#### How do you test lifespan events?
- **The Engine Mechanism (Why it behaves this way):** TestClient automatically triggers lifespan events: startup runs when the client is created, shutdown runs when the client closes. Use it as a context manager: `with TestClient(app) as client: # startup has run; ...; # shutdown runs on exit`. Test that resources are initialized correctly by checking app.state. Test shutdown by verifying resources are cleaned up (connections closed, files removed). For testing startup failures, mock the resource creation to raise an exception and verify the app doesn't start.
- **The Unforgettable Mental Model:** The **Dress Rehearsal**. TestClient runs the full opening and closing ceremony (lifespan) so you can verify everything works before the actual performance (production).
- **The Trap:** Not using TestClient as a context manager. If you create TestClient without `with`, shutdown may not run. Always use the context manager pattern.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: TestClient triggers lifespan events automatically. I use it as a context manager — startup runs on entry, shutdown on exit. I verify resources are initialized by checking app.state, and I verify cleanup by checking that connections are closed. I always use the context manager pattern."

## 8. Active recall test

1. **What are lifespan events?**
   - **Explanation:** An async context manager that runs setup code before the app handles requests and cleanup code after it stops. Replaces deprecated @app.on_event decorators.

2. **What resources should you manage with lifespan?**
   - **Explanation:** App-scoped resources: DB connection pools, HTTP client sessions, cache connections, message queue connections. Not request-scoped resources.

3. **How does lifespan differ from dependencies with yield?**
   - **Explanation:** Lifespan runs once per app lifecycle (app-scoped resources). Dependencies with yield run once per request (request-scoped resources). They complement each other.

4. **How do you store lifespan resources for endpoint access?**
   - **Explanation:** Store on app.state during setup. Dependencies read from app.state and return per-request instances. Avoid global variables.

5. **What happens if lifespan startup fails?**
   - **Explanation:** The app fails to start, shutdown code doesn't run (yield was never reached). Prefer fail-fast — let the orchestrator restart the app.

6. **How do you test lifespan events?**
   - **Explanation:** Use TestClient as a context manager. Startup runs on entry, shutdown on exit. Verify resources are initialized and cleaned up correctly.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

FastAPI Lifespan Events should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain FastAPI Lifespan Events, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define FastAPI Lifespan Events.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
