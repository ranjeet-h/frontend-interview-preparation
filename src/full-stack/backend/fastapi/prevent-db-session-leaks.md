# Prevent DB Session Leaks

## Detailed explanation

Use dependency cleanup, context managers, and finally blocks to close sessions even on errors. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Always close request-scoped DB sessions.

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

#### What causes database session leaks in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Session leaks occur when a database session is created but never closed. Common causes: (1) **Not using yield dependencies** — creating sessions with `return` instead of `yield` means cleanup code after the endpoint never runs, (2) **Manual session management** — creating sessions in endpoints without proper try/finally blocks, (3) **Exception handling gaps** — exceptions bypass cleanup code if not wrapped in try/finally, (4) **Background tasks** — sessions created in background tasks that aren't properly closed, (5) **Middleware** — sessions created in middleware that aren't closed on error. Leaked sessions hold database connections, eventually exhausting the connection pool.
- **The Unforgettable Mental Model:** The **Open Faucet**. Each leaked session is a faucet left running. One faucet wastes a little water. Many faucets flood the house (exhaust the connection pool).
- **The Trap**: Thinking `db.close()` after the endpoint is enough. If the endpoint raises an exception, `db.close()` never runs. Only yield dependencies or try/finally guarantee cleanup.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Session leaks happen when sessions are created but not closed — usually from not using yield dependencies, manual session management without try/finally, or exception handling gaps. Leaked sessions hold database connections and eventually exhaust the connection pool. I always use yield dependencies to guarantee cleanup."

#### How do yield dependencies prevent session leaks?
- **The Engine Mechanism (Why it behaves this way):** A yield dependency guarantees cleanup runs after the endpoint completes, even if an exception occurred: `def get_db(): db = SessionLocal(); try: yield db; finally: db.close()`. FastAPI executes the code before yield (create session), runs the endpoint, then executes the code after yield (close session). The `finally` block runs regardless of whether the endpoint succeeded, raised an exception, or the client disconnected. This is the most reliable way to ensure sessions are always closed.
- **The Unforgettable Mental Model:** The **Bookend Guarantee**. The code before yield opens the book, the code after yield closes it. No matter what happens in the middle — success, error, or interruption — the book always gets closed.
- **The Trap**: Using `return` instead of `yield`. `return` exits the function immediately — cleanup code after `return` never runs. Only `yield` guarantees post-endpoint execution.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Yield dependencies guarantee cleanup runs after the endpoint, even on exceptions. The finally block after yield always executes — whether the endpoint succeeds, fails, or the client disconnects. This is the most reliable way to prevent session leaks. I never use return for resource management."

#### How do you detect session leaks in production?
- **The Engine Mechanism (Why it behaves this way):** Monitor: (1) **Connection pool usage** — if active connections grow over time without returning to baseline, sessions are leaking, (2) **Database connection count** — `SELECT count(*) FROM pg_stat_activity` (PostgreSQL) shows active connections. A growing count indicates leaks, (3) **Application logs** — log session creation and closure, alert if creation exceeds closure, (4) **Memory usage** — leaked sessions accumulate in memory, causing gradual memory growth. Set up alerts for connection pool exhaustion and abnormal connection counts. Use APM tools (Datadog, New Relic) to track connection metrics.
- **The Unforgettable Mental Model:** The **Water Meter**. The meter (monitoring) tracks water usage (connections). If usage keeps growing even when no one's using water (idle periods), there's a leak.
- **The Trap**: Only monitoring during peak hours. Session leaks are gradual — they show up as a slow creep in connection count over days or weeks. Monitor 24/7 and look at trends, not just snapshots.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor connection pool usage, database connection count, and memory usage. I set up alerts for growing connection counts and pool exhaustion. I log session creation and closure to detect imbalances. Session leaks are gradual — I look at trends over days, not just peak-hour snapshots."

#### How do you prevent session leaks in background tasks?
- **The Engine Mechanism (Why it behaves this way):** Background tasks run after the response is sent, outside the request lifecycle. Dependencies with yield don't apply to background tasks. Create and close sessions explicitly within the task: `def background_task(): db = SessionLocal(); try: process_data(db); db.commit(); finally: db.close()`. Or use a context manager: `with SessionLocal() as db: process_data(db)`. Never rely on request-scoped dependencies in background tasks — they don't exist in that context.
- **The Unforgettable Mental Model:** The **After-Hours Crew**. The regular staff (request dependencies) goes home after closing. The after-hours crew (background tasks) needs their own keys (sessions) and must lock up (close sessions) when done.
- **The Trap**: Trying to use request-scoped DB sessions in background tasks. The request is already complete — the session may be closed. Background tasks must create their own sessions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Background tasks run outside the request lifecycle — yield dependencies don't apply. I create and close sessions explicitly within the task using try/finally or context managers. I never rely on request-scoped sessions in background tasks."

#### How do you prevent session leaks in middleware?
- **The Engine Mechanism (Why it behaves this way):** If middleware creates database sessions, it must close them in all code paths: `async def middleware(request, call_next): db = SessionLocal(); try: request.state.db = db; response = await call_next(request); return response; finally: db.close()`. The `finally` block ensures the session is closed even if `call_next` raises an exception. However, it's better to avoid creating sessions in middleware — use dependencies instead. Middleware should handle cross-cutting concerns (logging, CORS), not data access.
- **The Unforgettable Mental Model:** The **Security Guard's Logbook**. The guard (middleware) opens a logbook (session), records entries, and must close it when done. If the guard gets called away (exception), the logbook must still be closed.
- **The Trap**: Creating sessions in middleware without proper cleanup. Middleware exceptions bypass normal flow — only try/finally guarantees cleanup.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: If middleware creates sessions, I wrap them in try/finally to guarantee cleanup. But I prefer to avoid sessions in middleware — use dependencies for data access. Middleware should handle cross-cutting concerns like logging and CORS, not database operations."

#### What are the symptoms of session leaks?
- **The Engine Mechanism (Why it behaves this way):** Symptoms: (1) **Connection pool exhaustion** — requests hang waiting for available connections, (2) **"Too many connections" errors** — database rejects new connections, (3) **Gradual memory growth** — leaked sessions accumulate in memory, (4) **Slow response times** — requests queue waiting for connections, (5) **Database connection count grows over time** — more connections than expected based on active requests. These symptoms worsen over time as more sessions leak. Restarting the app temporarily fixes the issue, but leaks resume.
- **The Unforgettable Mental Model:** The **Slow Leak Tire**. The tire (connection pool) slowly loses air (connections). The car (app) still runs but gets slower. Eventually, it stops. Refilling (restarting) helps temporarily, but the leak continues.
- **The Trap**: Restarting the app as a permanent fix. Restarting clears leaked sessions temporarily but doesn't fix the root cause. The leak resumes immediately.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Session leak symptoms include connection pool exhaustion, 'too many connections' errors, gradual memory growth, slow response times, and growing database connection counts. Restarting temporarily fixes it but doesn't address the root cause. I fix the leak at the source — always use yield dependencies with proper cleanup."

## 8. Active recall test

1. **What causes database session leaks?**
   - **Explanation:** Not using yield dependencies (using return instead), manual session management without try/finally, exception handling gaps, and sessions in background tasks or middleware without proper cleanup.

2. **How do yield dependencies prevent leaks?**
   - **Explanation:** The finally block after yield always runs — whether the endpoint succeeds, fails, or the client disconnects. This guarantees session cleanup.

3. **How do you detect session leaks in production?**
   - **Explanation:** Monitor connection pool usage, database connection count, and memory usage. Look for growing trends over time. Log session creation/closure to detect imbalances.

4. **How do you prevent leaks in background tasks?**
   - **Explanation:** Background tasks run outside the request lifecycle. Create and close sessions explicitly with try/finally or context managers. Don't rely on request-scoped dependencies.

5. **How do you prevent leaks in middleware?**
   - **Explanation:** Wrap session creation in try/finally. But prefer to avoid sessions in middleware — use dependencies for data access instead.

6. **What are the symptoms of session leaks?**
   - **Explanation:** Connection pool exhaustion, "too many connections" errors, gradual memory growth, slow response times, and growing database connection counts over time.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Prevent DB Session Leaks should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Prevent DB Session Leaks, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Prevent DB Session Leaks.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
