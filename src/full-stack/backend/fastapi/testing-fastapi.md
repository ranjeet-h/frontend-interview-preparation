# Testing FastAPI APIs

## Detailed explanation

FastAPI APIs are tested with TestClient, httpx, dependency overrides, fixtures, and test databases. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Test the route contract and dependency behavior.

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

#### How do you test FastAPI applications?
- **The Engine Mechanism (Why it behaves this way):** Use `TestClient` from `fastapi.testclient` (built on httpx) to make HTTP calls against the app without starting a real server: `from fastapi.testclient import TestClient; client = TestClient(app); response = client.get("/items"); assert response.status_code == 200`. TestClient runs the full FastAPI pipeline — routing, validation, dependency resolution, and response serialization. Use pytest for test organization and fixtures for setup/teardown. Test both happy paths and error cases.
- **The Unforgettable Mental Model:** The **Flight Simulator**. Instead of flying a real plane (production server), you test everything in a simulator (TestClient) that behaves identically but lets you control conditions (mock dependencies, test data).
- **The Trap**: Testing only the endpoint function directly without TestClient. This bypasses routing, validation, middleware, and dependency resolution — the very things that can break in production.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use TestClient with pytest to make HTTP calls through the full FastAPI pipeline. I test happy paths, error cases, validation errors, and auth failures. I override dependencies to mock databases and external services. This ensures routing, validation, serialization, and business logic all work together."

#### What is the difference between unit tests and integration tests for FastAPI?
- **The Engine Mechanism (Why it behaves this way):** **Unit tests** test individual components in isolation — service functions, validation logic, dependency functions — without HTTP or database. They're fast (milliseconds) and pinpoint failures. **Integration tests** test the full HTTP pipeline with TestClient — routing, validation, dependencies, database queries, response serialization. They're slower (seconds) but verify end-to-end behavior. Both are needed: unit tests for fast feedback on business logic, integration tests for confidence that everything works together.
- **The Unforgettable Mental Model:** The **Car Testing**. Unit tests check individual parts — engine, brakes, steering — on a bench. Integration tests drive the whole car on a track. You need both: bench tests find specific defects, track tests verify the car works as a whole.
- **The Trap**: Only writing integration tests. They're slow and make it hard to identify which component caused a failure. Unit tests catch business logic bugs quickly.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I write both unit tests (services, validators, dependencies) and integration tests (full HTTP pipeline with TestClient). Unit tests are fast and pinpoint failures. Integration tests verify end-to-end behavior. I aim for a pyramid — many unit tests, fewer integration tests."

#### How do you set up a test database?
- **The Engine Mechanism (Why it behaves this way):** Create a separate test database (SQLite in-memory or PostgreSQL test instance) and override the DB dependency: `@pytest.fixture def test_db(): engine = create_engine("sqlite:///test.db"); SessionLocal = sessionmaker(bind=engine); Base.metadata.create_all(engine); yield SessionLocal; Base.metadata.drop_all(engine)`. Override the dependency: `app.dependency_overrides[get_db] = lambda: test_db()`. Each test gets a clean database. Use transactions with rollback for faster tests — create data in a transaction and rollback after each test instead of recreating tables.
- **The Unforgettable Mental Model:** The **Test Kitchen**. Instead of cooking in the main kitchen (production DB), you use a test kitchen (test DB) with the same equipment (schema). After each recipe (test), you clean everything (rollback/drop).
- **The Trap**: Sharing a test database across tests without isolation. One test's data affects another, causing flaky tests. Each test needs its own clean state.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a separate test database with dependency overrides. For speed, I use transactions with rollback — create data in a transaction, test, then rollback. This is faster than dropping and recreating tables. Each test gets a clean database state."

#### How do you test validation errors?
- **The Engine Mechanism (Why it behaves this way):** Send invalid requests and assert on 422 status and error structure: `response = client.post("/items", json={"name": 123}); assert response.status_code == 422; errors = response.json()["detail"]; assert any(e["loc"] == ["body", "name"] for e in errors)`. Test missing required fields, wrong types, constraint violations (too short, out of range), and nested model errors. Assert on loc, msg, and type to ensure the error format is correct and frontend-compatible.
- **The Unforgettable Mental Model:** The **Stress Test**. Instead of testing what happens when everything works, test what happens when everything breaks. The system should fail gracefully with clear error messages.
- **The Trap**: Only testing happy paths. Validation error tests are as important as success tests — they ensure the API contract is enforced and clients get useful feedback.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test validation by sending invalid requests and asserting on 422 status and error structure. I test missing fields, wrong types, constraint violations, and nested errors. I assert on loc, msg, and type to ensure frontend-compatible error responses."

#### How do you test async endpoints?
- **The Engine Mechanism (Why it behaves this way):** TestClient handles async endpoints automatically — you don't need to await anything in tests: `response = client.get("/async-items")`. TestClient runs the async event loop internally. For testing async dependencies, use async mock functions: `async def mock_async_dep(): return mock_data`. TestClient works with both sync and async endpoints transparently. For testing async behavior (concurrency, timeouts), use `httpx.AsyncClient` directly with `pytest-asyncio`.
- **The Unforgettable Mental Model:** The **Universal Remote**. TestClient works with both sync and async endpoints — you press the same buttons (make the same calls) regardless of what's happening behind the scenes.
- **The Trap**: Trying to await TestClient calls. TestClient is synchronous — it handles the async event loop internally. Don't use `await client.get()` — use `client.get()`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: TestClient handles async endpoints automatically — I don't need to await anything. For testing async behavior like concurrency or timeouts, I use httpx.AsyncClient with pytest-asyncio. But for most endpoint tests, TestClient works transparently with both sync and async."

#### How do you organize FastAPI tests?
- **The Engine Mechanism (Why it behaves this way):** Organize tests to mirror the application structure: `tests/test_items.py`, `tests/test_users.py`, `tests/test_auth.py`. Use pytest fixtures for shared setup (test client, test DB, mock user). Use conftest.py for fixtures shared across test files. Separate unit tests (`tests/unit/`) from integration tests (`tests/integration/`). Use test markers (`@pytest.mark.slow`) to categorize tests and run subsets. Keep test files focused — one test file per domain or feature.
- **The Unforgettable Mental Model:** The **Filing System**. Tests are filed the same way as the code they test. Items routes → test_items.py. Auth dependencies → test_auth.py. Shared tools (fixtures) are in the common drawer (conftest.py).
- **The Trap**: Putting all tests in one file. As the app grows, a single test file becomes unmanageable. Mirror the application structure for maintainability.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I organize tests to mirror the application structure — one test file per domain. I use conftest.py for shared fixtures, separate unit from integration tests, and use pytest markers for test categorization. This keeps tests maintainable as the app grows."

## 8. Active recall test

1. **How do you test FastAPI applications?**
   - **Explanation:** Use TestClient with pytest. TestClient makes HTTP calls through the full FastAPI pipeline — routing, validation, dependencies, and serialization.

2. **What's the difference between unit and integration tests?**
   - **Explanation:** Unit tests test individual components in isolation (fast, pinpoint failures). Integration tests test the full HTTP pipeline (slower, end-to-end confidence).

3. **How do you set up a test database?**
   - **Explanation:** Create a separate test DB, override get_db dependency, and use transactions with rollback for fast isolation. Each test gets a clean state.

4. **How do you test validation errors?**
   - **Explanation:** Send invalid requests, assert 422 status, and verify error structure (loc, msg, type). Test missing fields, wrong types, and constraint violations.

5. **How do you test async endpoints?**
   - **Explanation:** TestClient handles async automatically — no await needed. For concurrency/timeout testing, use httpx.AsyncClient with pytest-asyncio.

6. **How should you organize FastAPI tests?**
   - **Explanation:** Mirror application structure — one test file per domain. Use conftest.py for shared fixtures. Separate unit from integration tests. Use pytest markers.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Testing FastAPI APIs should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Testing FastAPI APIs, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Testing FastAPI APIs.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
