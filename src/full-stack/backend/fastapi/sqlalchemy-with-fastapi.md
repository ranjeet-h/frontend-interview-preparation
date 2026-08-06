# SQLAlchemy With FastAPI

## Detailed explanation

FastAPI commonly uses dependencies to provide SQLAlchemy sessions to route and service layers. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

DB sessions enter through dependencies.

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

#### How do you integrate SQLAlchemy with FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Create a SQLAlchemy engine and session factory, then provide sessions via a dependency: `engine = create_engine(settings.database_url); SessionLocal = sessionmaker(bind=engine); def get_db(): db = SessionLocal(); try: yield db; finally: db.close()`. Endpoints inject the session: `def get_items(db: Session = Depends(get_db)): return db.query(Item).all()`. The dependency creates a new session per request, yields it to the endpoint, and closes it after the response. This ensures sessions are properly managed — one session per request, always closed.
- **The Unforgettable Mental Model:** The **Rental Car Desk**. Each customer (request) gets their own car (session) from the desk (dependency). They drive it (run queries), then return it (cleanup). The desk ensures every car is returned, even if the customer had an accident (exception).
- **The Trap**: Creating a global session and sharing it across requests. This causes data leakage between requests, connection pool exhaustion, and thread-safety issues.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create a session factory and provide sessions via a yield dependency. Each request gets its own session, which is closed after the response. Endpoints inject the session with Depends(get_db). I never share sessions across requests — each request gets a fresh session."

#### Should you use sync or async SQLAlchemy with FastAPI?
- **The Engine Mechanism (Why it behaves this way):** **Sync SQLAlchemy** (`Session`) works with `def` routes — FastAPI runs them in a threadpool. It's mature, well-documented, and works with all database drivers. **Async SQLAlchemy** (`AsyncSession`) works with `async def` routes and async drivers (asyncpg). It enables higher concurrency but requires the entire call chain to be async. For most applications, sync SQLAlchemy is simpler and sufficient. Use async SQLAlchemy when you need maximum concurrency and have async-compatible dependencies throughout.
- **The Unforgettable Mental Model:** The **Manual vs. Automatic Transmission**. Sync SQLAlchemy is automatic — it works everywhere, easy to use. Async SQLAlchemy is manual — more control, higher performance, but requires skill (async throughout the chain).
- **The Trap**: Using async SQLAlchemy with sync dependencies. If any dependency in the chain is sync, async SQLAlchemy provides no benefit and adds complexity.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I default to sync SQLAlchemy with def routes — it's simpler and sufficient for most apps. I use async SQLAlchemy with async def routes only when the entire call chain is async and I need maximum concurrency. The async ecosystem is maturing but sync is still more battle-tested."

#### How do you structure SQLAlchemy models with FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Keep SQLAlchemy models (ORM classes) separate from Pydantic schemas (API contracts). Models define database tables: `class Item(Base): __tablename__ = "items"; id = Column(Integer, primary_key=True); name = Column(String)`. Pydantic schemas define API input/output: `class ItemCreate(BaseModel): name: str; class ItemResponse(BaseModel): id: int; name: str; model_config = ConfigDict(from_attributes=True)`. Use `from_attributes=True` to serialize ORM objects to Pydantic models. Never expose SQLAlchemy models directly in API responses — they may leak internal fields.
- **The Unforgettable Mental Model:** The **Warehouse vs. the Storefront**. The warehouse (SQLAlchemy model) stores everything — raw materials, internal codes, supplier info. The storefront (Pydantic schema) displays only what customers should see — product name, price, description.
- **The Trap**: Returning SQLAlchemy models directly from endpoints. This leaks internal fields (hashed passwords, audit timestamps) and couples the API contract to the database schema.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I keep SQLAlchemy models separate from Pydantic schemas. Models define database tables; schemas define API contracts. I use from_attributes=True to serialize ORM objects to response schemas. I never return SQLAlchemy models directly — they may leak internal fields."

#### How do you handle database relationships in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Define relationships in SQLAlchemy models: `class User(Base): items = relationship("Item", back_populates="owner")`. In Pydantic response schemas, use nested models: `class ItemResponse(BaseModel): id: int; name: str`. For eager loading (prevent N+1 queries), use `joinedload` or `selectinload` in the query: `db.query(User).options(joinedload(User.items)).all()`. For lazy loading, access the relationship in the endpoint — but this triggers additional queries. Always be explicit about loading strategy to avoid N+1 problems.
- **The Unforgettable Mental Model:** The **Family Tree**. The parent (User) has children (Items). You can either bring the whole family to the photo (eager loading — one query) or call each child individually when needed (lazy loading — N+1 queries).
- **The Trap**: Not considering N+1 queries with relationships. Lazy loading triggers a separate query for each parent object. Use eager loading for relationships you know you'll need.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I define relationships in SQLAlchemy models and use nested Pydantic schemas for responses. I'm explicit about loading strategy — eager loading (joinedload) for relationships I need, lazy loading for optional ones. I always consider N+1 queries and use eager loading to prevent them."

#### How do you test SQLAlchemy with FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Use an in-memory SQLite database or a PostgreSQL test instance. Override the DB dependency: `engine = create_engine("sqlite:///test.db"); TestingSessionLocal = sessionmaker(bind=engine); def override_get_db(): db = TestingSessionLocal(); try: yield db; finally: db.close(); app.dependency_overrides[get_db] = override_get_db`. Create tables before tests: `Base.metadata.create_all(engine)`. Drop tables after tests: `Base.metadata.drop_all(engine)`. For faster tests, use transactions with rollback — create data in a transaction, test, then rollback instead of dropping and recreating tables.
- **The Unforgettable Mental Model:** The **Test Track**. Instead of testing on the real highway (production DB), you use a test track (test DB) with the same road conditions (schema). After each test drive, you reset the track (rollback).
- **The Trap**: Using the production database for tests. Tests may delete or corrupt production data. Always use a separate test database.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a separate test database with dependency overrides. For speed, I use transactions with rollback — create data in a transaction, test, then rollback. I create tables before the test session and drop them after. I never use the production database for tests."

#### How does SQLAlchemy integration affect production reliability?
- **The Engine Mechanism (Why it behaves this way):** Proper SQLAlchemy integration prevents: (1) **Session leaks** — yield dependencies ensure sessions are always closed, (2) **Connection pool exhaustion** — one session per request, properly closed, returns connections to the pool, (3) **Data leakage between requests** — each request gets its own session, (4) **N+1 queries** — explicit loading strategies prevent query explosions, (5) **Schema drift** — Alembic migrations keep the database schema in sync with code. Without proper integration, sessions leak, pools exhaust, and queries become unpredictable under load.
- **The Unforgettable Mental Model:** The **Plumbing System**. Proper integration is like good plumbing — water (data) flows correctly, drains (sessions) close properly, and pipes (connections) don't burst under pressure. Bad plumbing floods the house (production).
- **The Trap**: Not monitoring connection pool usage. Under load, pool exhaustion causes requests to hang waiting for connections. Monitor pool size and wait times.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Proper SQLAlchemy integration prevents session leaks, connection pool exhaustion, data leakage, and N+1 queries. I use yield dependencies for session management, explicit loading strategies for relationships, and Alembic for schema migrations. I monitor connection pool usage in production to catch exhaustion before it affects users."

## 8. Active recall test

1. **How do you integrate SQLAlchemy with FastAPI?**
   - **Explanation:** Create a session factory and provide sessions via a yield dependency. Each request gets its own session, closed after the response. Endpoints inject with Depends(get_db).

2. **Should you use sync or async SQLAlchemy?**
   - **Explanation:** Default to sync with def routes — simpler and sufficient. Use async with async def routes only when the entire call chain is async and you need maximum concurrency.

3. **Why separate SQLAlchemy models from Pydantic schemas?**
   - **Explanation:** Models define database tables; schemas define API contracts. Returning models directly leaks internal fields and couples API to database schema.

4. **How do you prevent N+1 queries with relationships?**
   - **Explanation:** Use eager loading (joinedload, selectinload) for relationships you need. Be explicit about loading strategy — don't rely on lazy loading for known relationships.

5. **How do you test SQLAlchemy with FastAPI?**
   - **Explanation:** Use a test database with dependency overrides. Use transactions with rollback for fast isolation. Create tables before tests, drop after.

6. **What production issues does proper SQLAlchemy integration prevent?**
   - **Explanation:** Session leaks, connection pool exhaustion, data leakage between requests, N+1 queries, and schema drift. Monitor pool usage in production.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

SQLAlchemy With FastAPI should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain SQLAlchemy With FastAPI, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define SQLAlchemy With FastAPI.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
