# DB Sessions in FastAPI

## Detailed explanation

DB sessions should be opened per request, committed or rolled back deliberately, and closed reliably. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

One request gets one managed DB session.

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

#### How should you manage database sessions in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Use a yield dependency to provide one session per request: `def get_db(): db = SessionLocal(); try: yield db; finally: db.close()`. The session is created when the dependency is called, yielded to the endpoint, and closed after the response (even if an exception occurred). Endpoints inject the session: `def get_items(db: Session = Depends(get_db))`. This ensures: one session per request, automatic cleanup, and no shared state between requests. The session is scoped to the request lifecycle — created at request start, closed at request end.
- **The Unforgettable Mental Model:** The **Disposable Camera**. Each request gets a fresh camera (session). You take photos (run queries), then the camera is developed and discarded (closed). The next request gets a new camera — no mixed-up photos between requests.
- **The Trap**: Creating a session at module level and sharing it. Shared sessions cause data leakage between requests, thread-safety issues, and connection pool problems.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a yield dependency that creates a session, yields it, and closes it in cleanup. One session per request, always closed. Endpoints inject it with Depends(get_db). I never share sessions between requests — each request gets a fresh session."

#### Why one session per request?
- **The Engine Mechanism (Why it behaves this way):** One session per request ensures: (1) **Isolation** — changes in one request don't affect another, (2) **Clean state** — each request starts with a fresh session, no stale data from previous requests, (3) **Proper transaction boundaries** — the session's transaction covers exactly one request, (4) **Connection pool efficiency** — sessions return connections to the pool after each request, (5) **Thread safety** — SQLAlchemy sessions are not thread-safe; sharing them across requests causes race conditions. A session is a unit of work — it should cover exactly one request's work.
- **The Unforgettable Mental Model:** The **Restaurant Table**. Each party (request) gets their own table (session). They order, eat, and leave. The table is cleaned for the next party. Sharing a table between parties causes mixed-up orders and dirty plates.
- **The Trap**: Reusing sessions across requests for "performance." The performance gain is negligible — session creation is cheap. The risk of data leakage and race conditions is significant.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: One session per request ensures isolation, clean state, proper transaction boundaries, and thread safety. Session creation is cheap — the performance gain from reusing sessions is negligible compared to the risk of data leakage and race conditions."

#### How do you commit and rollback database changes?
- **The Engine Mechanism (Why it behaves this way):** In the endpoint or service layer: `try: db.add(item); db.commit(); return item; except Exception: db.rollback(); raise`. `commit()` persists changes to the database. `rollback()` undoes uncommitted changes if an error occurs. FastAPI's dependency cleanup closes the session after the response, but doesn't commit or rollback — that's the endpoint's responsibility. For a cleaner pattern, use a service layer that handles commit/rollback, keeping the endpoint thin.
- **The Unforgettable Mental Model:** The **Save Button**. commit() is hitting save — changes are permanent. rollback() is Ctrl+Z — changes are undone. If you don't hit save or Ctrl+Z, the changes disappear when you close the document (session closes).
- **The Trap**: Not rolling back on error. If an exception occurs after some changes but before commit, the session may have pending changes. Always rollback on error to ensure clean state.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I commit changes in the endpoint or service layer with db.commit(). If an exception occurs, I rollback with db.rollback(). The dependency cleanup closes the session but doesn't commit or rollback — that's the application's responsibility. I prefer a service layer that handles commit/rollback, keeping endpoints thin."

#### How do you handle read-only vs. write sessions?
- **The Engine Mechanism (Why it behaves this way):** For read-only endpoints, you can use a session with `expire_on_commit=False` or a read replica connection. Create separate dependencies: `def get_read_db(): db = ReadSessionLocal(); try: yield db; finally: db.close()`. Read replicas distribute load — write queries go to the primary, read queries go to replicas. For simple apps, a single session handles both reads and writes. The key is consistency — don't read from a replica immediately after writing to the primary (replication lag).
- **The Unforgettable Mental Model:** The **Library System**. The main library (primary DB) accepts book returns and new acquisitions (writes). Branch libraries (read replicas) only lend books (reads). You don't check a branch for a book you just returned to the main library (replication lag).
- **The Trap**: Reading from a replica immediately after writing to the primary. Replication lag means the replica may not have the latest data. Route read-after-write to the primary.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For simple apps, I use a single session for reads and writes. For high-traffic apps, I use read replicas with separate dependencies. I route read-after-write queries to the primary to avoid replication lag issues. The key is matching the session type to the query pattern."

#### How do you configure the database connection pool?
- **The Engine Mechanism (Why it behaves this way):** Configure pool settings on the engine: `engine = create_engine(url, pool_size=20, max_overflow=10, pool_timeout=30, pool_recycle=1800)`. `pool_size` — base number of connections. `max_overflow` — additional connections when pool is exhausted. `pool_timeout` — seconds to wait for a connection before raising an error. `pool_recycle` — seconds before recycling a connection (prevents stale connections). Tune these based on your database's max connections and your app's concurrency needs. Monitor pool usage in production.
- **The Unforgettable Mental Model:** The **Parking Lot**. pool_size is the regular spots, max_overflow is the overflow lot, pool_timeout is how long you wait for a spot before leaving, pool_recycle is how often you rotate cars to prevent battery drain.
- **The Trap**: Setting pool_size too high. Each connection consumes database resources. If pool_size × workers exceeds the database's max connections, new connections are rejected.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I configure pool_size, max_overflow, pool_timeout, and pool_recycle based on the database's max connections and the app's concurrency needs. I ensure pool_size × workers doesn't exceed the database's max connections. I monitor pool usage in production and adjust based on actual load."

#### How do you test database session management?
- **The Engine Mechanism (Why it behaves this way):** Test that sessions are properly created and closed: use a mock session factory that tracks create/close calls. Test commit/rollback behavior: make the endpoint raise an exception and verify rollback was called. Test that sessions are isolated: create data in one request, verify it's visible in another request. Use TestClient with dependency overrides to inject test sessions. Verify that session cleanup runs even when endpoints raise exceptions.
- **The Unforgettable Mental Model:** The **Inspector**. The inspector (test) checks: was a new camera issued (session created)? Was it returned (session closed)? Were the photos saved (commit) or discarded (rollback)? Did the next customer get a fresh camera (isolation)?
- **The Trap**: Not testing exception paths. Test that sessions are closed and rolled back even when endpoints raise exceptions. This is where session leaks happen.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test session creation, closure, commit, and rollback. I test exception paths — verify sessions are closed and rolled back even when endpoints raise errors. I test isolation — data from one request is visible in subsequent requests. I use mock session factories to track create/close calls."

## 8. Active recall test

1. **How should you manage DB sessions in FastAPI?**
   - **Explanation:** Use a yield dependency: create session, yield it, close in cleanup. One session per request, always closed. Inject with Depends(get_db).

2. **Why one session per request?**
   - **Explanation:** Ensures isolation, clean state, proper transaction boundaries, connection pool efficiency, and thread safety. Session creation is cheap; reuse risks are significant.

3. **How do you commit and rollback?**
   - **Explanation:** db.commit() persists changes. db.rollback() undoes uncommitted changes on error. The dependency closes the session but doesn't commit/rollback — that's the app's responsibility.

4. **How do you handle read-only vs. write sessions?**
   - **Explanation:** Use separate dependencies for read replicas. Route read-after-write to the primary to avoid replication lag. For simple apps, one session handles both.

5. **How do you configure the connection pool?**
   - **Explanation:** Set pool_size, max_overflow, pool_timeout, pool_recycle on the engine. Ensure pool_size × workers doesn't exceed the database's max connections.

6. **How do you test session management?**
   - **Explanation:** Test session creation, closure, commit, rollback. Test exception paths — verify cleanup runs even on errors. Test isolation between requests.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

DB Sessions in FastAPI should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain DB Sessions in FastAPI, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define DB Sessions in FastAPI.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
