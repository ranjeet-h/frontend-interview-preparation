# Mock Dependencies in FastAPI Tests

## Detailed explanation

FastAPI dependency overrides replace real dependencies with test doubles. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Override dependencies to isolate tests.

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

#### What are dependency overrides and why use them?
- **The Engine Mechanism (Why it behaves this way):** `app.dependency_overrides` is a dictionary that maps original dependency callables to replacement callables. During testing, you replace real dependencies with test doubles: `app.dependency_overrides[get_db] = override_get_db; app.dependency_overrides[get_current_user] = lambda: mock_user`. FastAPI uses the override instead of the original for all requests. This allows testing endpoints in isolation without real databases, external services, or authentication. After tests, clear overrides: `app.dependency_overrides.clear()`.
- **The Unforgettable Mental Model:** The **Stunt Double**. The script (endpoint) calls for the lead actor (real dependency). The director (FastAPI) substitutes the stunt double (mock) for dangerous scenes (tests). The script doesn't change — only the performer does.
- **The Trap**: Forgetting to clear overrides between tests. Stale overrides cause one test to affect another, leading to flaky tests. Always clear in teardown.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Dependency overrides replace real dependencies with test doubles during testing. I override get_db for test databases, get_current_user for mock users, and external service dependencies for stubs. I always clear overrides after each test to prevent cross-test contamination."

#### How do you override a database dependency?
- **The Engine Mechanism (Why it behaves this way):** Create a test database session generator: `def override_get_db(): db = TestingSessionLocal(); try: yield db; finally: db.close()`. Override it: `app.dependency_overrides[get_db] = override_get_db`. The override uses a test database (SQLite in-memory or PostgreSQL test instance). Use transactions with rollback for faster tests: `def override_get_db(): connection = engine.connect(); transaction = connection.begin(); session = Session(bind=connection); yield session; transaction.rollback()`. This creates data in a transaction and rolls back after each test — no need to drop and recreate tables.
- **The Unforgettable Mental Model:** The **Sandbox**. Instead of building in the real city (production DB), you build in a sandbox (test DB). After each creation (test), you smooth the sand (rollback) — ready for the next creation.
- **The Trap**: Using the production database for tests. Tests may delete or corrupt production data. Always use a separate test database.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I override get_db with a test session that uses a separate test database. For speed, I use transactions with rollback — create data in a transaction, test, then rollback. This is faster than dropping and recreating tables. I never use the production database for tests."

#### How do you override authentication dependencies?
- **The Engine Mechanism (Why it behaves this way):** Override the auth dependency to return a mock user: `app.dependency_overrides[get_current_user] = lambda: User(id=1, username="testuser", roles=["admin"])`. This bypasses JWT verification and returns a predefined user. Test different roles by changing the mock: `app.dependency_overrides[get_current_user] = lambda: User(id=2, username="regular", roles=["user"])`. For testing unauthenticated access, override to raise HTTPException(401): `app.dependency_overrides[get_current_user] = lambda: (_ for _ in ()).throw(HTTPException(401))`.
- **The Unforgettable Mental Model:** The **Disguise Kit**. Instead of going through the real ID check (JWT verification), you put on a disguise (mock user) that the checkpoint accepts. Change the disguise to test different access levels.
- **The Trap**: Testing only with admin users. Test with regular users, wrong roles, and unauthenticated access. Each should get the appropriate response.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I override get_current_user with mock users of different roles — admin, regular user, no roles. I also test unauthenticated access by overriding to raise 401. This tests both the endpoint logic and the authorization layer without real JWT tokens."

#### How do you override external service dependencies?
- **The Engine Mechanism (Why it behaves this way):** Replace external service dependencies with mock functions that return predefined data: `async def mock_email_service(to: str, subject: str): return {"status": "sent"}; app.dependency_overrides[get_email_service] = mock_email_service`. For testing failures, make the mock raise exceptions: `async def mock_email_service_fail(*args): raise ConnectionError("Service down"); app.dependency_overrides[get_email_service] = mock_email_service_fail`. This tests how the endpoint handles service failures without actually calling external services.
- **The Unforgettable Mental Model:** The **Stand-In Actor**. The scene (endpoint) calls for a specific actor (external service). The stand-in (mock) delivers the same lines (returns same data type) but doesn't require the real actor's presence (network call).
- **The Trap**: Mocking at the wrong level. Mock the dependency function, not the internal implementation of the service. The dependency is the contract between the endpoint and the service.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I override external service dependencies with mock functions that return predefined data or raise exceptions. This tests the endpoint's handling of service responses and failures without making real network calls. I mock at the dependency level, not the service implementation level."

#### How do you verify that a dependency was called?
- **The Engine Mechanism (Why it behaves this way):** Use `unittest.mock.MagicMock` as the override: `mock_send_email = MagicMock(); app.dependency_overrides[get_email_service] = mock_send_email`. After the test, verify the call: `mock_send_email.assert_called_once()`, `mock_send_email.assert_called_with(to="user@test.com", subject="Welcome")`. MagicMock records all calls, arguments, and return values. This verifies that the endpoint triggered the expected dependency behavior.
- **The Unforgettable Mental Model:** The **Security Camera**. The camera (MagicMock) records every time someone (endpoint) interacts with the door (dependency). After the test, you review the footage to verify the interaction happened correctly.
- **The Trap**: Using MagicMock for dependencies that use yield. MagicMock doesn't support yield semantics. For yield dependencies, create a generator function that also records calls.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use MagicMock as the dependency override to verify calls. After the test, I assert_called_once() or assert_called_with() to verify the dependency was called with the right arguments. For yield dependencies, I create a generator function that records calls."

#### How do you clean up dependency overrides?
- **The Engine Mechanism (Why it behaves this way):** Clear overrides after each test: `@pytest.fixture(autouse=True) def cleanup_overrides(): yield; app.dependency_overrides.clear()`. The `autouse=True` fixture runs for every test, clearing overrides in teardown. Alternatively, clear overrides in each test's teardown: `def teardown_method(self): app.dependency_overrides.clear()`. Without cleanup, overrides from one test persist to the next, causing flaky tests where a test's mock affects another test's behavior.
- **The Unforgettable Mental Model:** The **Reset Button**. After each test scene, you hit reset (clear overrides) so the next scene starts with the original cast (real dependencies).
- **The Trap**: Clearing overrides at the wrong time. Clear in teardown (after the test), not in setup (before the test). Setup should set overrides; teardown should clear them.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use an autouse pytest fixture that clears app.dependency_overrides in teardown after every test. This prevents stale overrides from affecting subsequent tests. Setup sets overrides; teardown clears them."

## 8. Active recall test

1. **What are dependency overrides?**
   - **Explanation:** A dictionary (app.dependency_overrides) that maps original dependency callables to replacement callables. Used to replace real dependencies with test doubles.

2. **How do you override a database dependency for tests?**
   - **Explanation:** Create a test session generator and assign it to app.dependency_overrides[get_db]. Use transactions with rollback for fast, isolated tests.

3. **How do you override authentication for tests?**
   - **Explanation:** Override get_current_user with a lambda returning a mock user. Change the mock's roles to test different authorization levels.

4. **How do you verify a dependency was called?**
   - **Explanation:** Use MagicMock as the override. After the test, assert_called_once() or assert_called_with() to verify the call.

5. **How do you test external service failures?**
   - **Explanation:** Override the service dependency with a mock that raises exceptions (ConnectionError, TimeoutError). Verify the endpoint handles the failure gracefully.

6. **How do you clean up dependency overrides?**
   - **Explanation:** Use an autouse pytest fixture that clears app.dependency_overrides in teardown after every test. Prevents stale overrides from affecting subsequent tests.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Mock Dependencies in FastAPI Tests should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Mock Dependencies in FastAPI Tests, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Mock Dependencies in FastAPI Tests.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
