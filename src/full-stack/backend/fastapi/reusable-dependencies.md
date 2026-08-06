# Reusable Dependencies

## Detailed explanation

Reusable dependencies package shared logic like current user, database session, pagination, or permissions. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Reusable dependencies keep route handlers focused.

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

#### What are reusable dependencies and why use them?
- **The Engine Mechanism (Why it behaves this way):** Reusable dependencies are functions decorated with `Depends()` that encapsulate shared request-time logic — authentication, database sessions, pagination, permission checks, feature flags, rate limiting. Instead of duplicating this logic across endpoints, you define it once as a dependency and reference it wherever needed. FastAPI resolves the dependency graph, caches shared dependencies per request, and injects results into endpoints. This follows the DRY principle and makes the codebase maintainable.
- **The Unforgettable Mental Model:** The **Shared Tool Library**. Instead of every carpenter buying their own hammer, the shop has one hammer library. Any carpenter can check out a hammer (dependency) when needed, use it, and return it (cleanup). The shop manages the inventory.
- **The Trap:** Making dependencies too broad. A dependency that does "auth + pagination + logging + rate limiting" is hard to test and reuse. Split into focused, single-responsibility dependencies.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Reusable dependencies encapsulate shared request-time logic like auth, DB sessions, and pagination. I define them once and reference them with Depends() across endpoints. This eliminates duplication, makes testing easy through overrides, and keeps route handlers focused on business logic."

#### How do you create a dependency for the current user?
- **The Engine Mechanism (Why it behaves this way):** A `get_current_user` dependency extracts the authentication token from the request (via header, cookie, or query param), validates it (JWT decode, session lookup), queries the database for the user, and returns the user object. If the token is invalid or the user doesn't exist, it raises `HTTPException(status_code=401)`. Endpoints declare `current_user: User = Depends(get_current_user)` to require authentication. The dependency can itself depend on `get_db` for database access and `get_token` for token extraction.
- **The Unforgettable Mental Model:** The **ID Check**. The bouncer (get_current_user) asks for ID (token), verifies it's real (JWT decode), checks the guest list (database lookup), and either lets you in (returns user) or kicks you out (401 error).
- **The Trap:** Returning `None` for unauthenticated users instead of raising an exception. Returning `None` means the endpoint runs with `current_user=None`, which can cause subtle bugs or security issues. Always raise 401.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create get_current_user as a dependency that extracts the token, validates it, looks up the user in the database, and returns the user object. If validation fails, I raise HTTPException(401) — never return None. Endpoints declare it with Depends() to require authentication."

#### How do you create a dependency for database sessions?
- **The Engine Mechanism (Why it behaves this way):** A `get_db` dependency creates a database session, yields it to the endpoint, and closes it in the cleanup phase. Using `yield` ensures the session is closed even if the endpoint raises an exception. The session is scoped to the request — each request gets its own session, preventing cross-request data leakage. With SQLAlchemy, this is typically `SessionLocal()` for creation and `session.close()` for cleanup. FastAPI's dependency caching ensures the same session is used throughout the request even if multiple dependencies need it.
- **The Unforgettable Mental Model:** The **Rental Car**. Each driver (request) gets their own car (session). They drive it (run queries), then return it (cleanup). The rental agency (dependency) ensures the car is cleaned and ready for the next driver.
- **The Trap:** Not closing the session on exception. Using `return` instead of `yield` means cleanup code after the endpoint never runs if an exception occurs, causing session leaks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a yield dependency for database sessions — create the session, yield it, then close it in cleanup. This ensures sessions are always closed, even on exceptions. FastAPI's caching means the same session is shared across all dependencies in a request, preventing multiple open sessions."

#### How do you create a dependency for pagination?
- **The Engine Mechanism (Why it behaves this way):** A pagination dependency extracts `skip` and `limit` query parameters (with defaults like `skip=0, limit=100`), validates them (non-negative, max limit cap), and returns a pagination object. It can be declared on list endpoints: `def list_items(pagination: Pagination = Depends(get_pagination))`. The dependency caps `limit` to prevent abuse (e.g., `limit = min(limit, 100)`), validates `skip >= 0`, and returns a structured object with `skip`, `limit`, and optionally `offset` for cursor-based pagination.
- **The Unforgettable Mental Model:** The **Page Turner**. Instead of dumping the entire book on the reader's lap, the page turner gives them a specific number of pages at a time. The reader says "start at page 50, give me 10 pages" and the page turner delivers exactly that.
- **The Trap:** Not capping the maximum limit. Without a cap, a client can request `limit=1000000`, causing memory exhaustion and slow responses. Always enforce a maximum.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create a pagination dependency that extracts skip and limit from query params, validates them, caps the maximum limit, and returns a structured object. I always cap limit to prevent abuse — typically 100 items per page. The dependency is reusable across all list endpoints."

#### How do you compose multiple dependencies on a single endpoint?
- **The Engine Mechanism (Why it behaves this way):** An endpoint can declare multiple `Depends()` parameters, each providing a different value. For example: `def update_item(item_id: int, item: ItemUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user))`. FastAPI resolves all dependencies (db session, current user), validates path/body parameters, and calls the endpoint with all values. Dependencies can also be declared at the router level with `APIRouter(dependencies=[Depends(...)])` to apply to all routes in the router.
- **The Unforgettable Mental Model:** The **Crew Assembly**. Before a mission starts, the team assembles: the navigator (pagination), the medic (DB session), the scout (current user). Each has a specific role, and the mission (endpoint) doesn't start until everyone is in place.
- **The Trap:** Too many dependencies on a single endpoint. More than 4-5 dependencies suggests the endpoint is doing too much. Consider splitting into smaller endpoints or combining related dependencies.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I declare multiple Depends() parameters on endpoints for each shared concern — DB session, current user, pagination. I also use router-level dependencies for concerns that apply to all routes in a domain, like auth. I keep the total dependencies per endpoint under 5 to maintain readability."

#### How do reusable dependencies improve testability?
- **The Engine Mechanism (Why it behaves this way):** Because dependencies are separate functions, they can be individually unit tested. More importantly, `app.dependency_overrides` allows replacing any dependency with a mock during integration tests. You can override `get_db` to use an in-memory database, `get_current_user` to return a test user, and `get_external_service` to return mock data. This tests the endpoint logic in isolation without external dependencies, making tests fast, deterministic, and reliable.
- **The Unforgettable Mental Model:** The **Flight Simulator**. Instead of testing a pilot in a real plane (production dependencies), you test them in a simulator (mocked dependencies). The controls are the same, but you can simulate any condition — engine failure, bad weather, emergency landing.
- **The Trap:** Testing only with overridden dependencies and never testing with real ones. You need both: unit tests with mocks for fast feedback, and integration tests with real dependencies for end-to-end confidence.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Reusable dependencies are individually testable and can be overridden in tests via app.dependency_overrides. I use mocks for fast unit tests and real dependencies for integration tests. This gives both speed and confidence — mocks catch logic bugs quickly, real deps catch integration issues."

## 8. Active recall test

1. **What is a reusable dependency in FastAPI?**
   - **Explanation:** A function that encapsulates shared request-time logic (auth, DB sessions, pagination) and is referenced with Depends() across multiple endpoints, eliminating duplication.

2. **How do you ensure a database session is always closed?**
   - **Explanation:** Use a yield dependency: create session, yield it, close it after yield. FastAPI runs the cleanup code even if the endpoint raises an exception.

3. **What should get_current_user do when authentication fails?**
   - **Explanation:** Raise HTTPException(status_code=401). Never return None, as that allows the endpoint to run with an unauthenticated context.

4. **Why cap the maximum limit in pagination?**
   - **Explanation:** To prevent abuse — a client requesting limit=1000000 could cause memory exhaustion and slow responses. A cap (e.g., 100) protects the server.

5. **How do you apply a dependency to all routes in a router?**
   - **Explanation:** Use `APIRouter(dependencies=[Depends(some_dep)])`. This applies the dependency to all routes registered on that router.

6. **How do dependency overrides improve testing?**
   - **Explanation:** They replace real dependencies with mocks (test DB, fake user, stubbed external services), allowing fast, deterministic integration tests without external infrastructure.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Reusable Dependencies should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Reusable Dependencies, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Reusable Dependencies.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
