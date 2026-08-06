# FastAPI Dependency Injection

## Detailed explanation

FastAPI dependency injection runs reusable functions for auth, DB sessions, settings, and shared request logic. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Depends lets routes ask for reusable request-time values.

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

#### What is dependency injection in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** FastAPI's dependency injection system uses `Depends()` to declare that an endpoint (or another dependency) needs a value produced by a callable. When a request arrives, FastAPI builds a dependency graph, resolves dependencies in topological order (dependencies of dependencies first), calls each dependency function, caches results for shared dependencies, and injects the return values into the endpoint. Dependencies can be sync or async, can depend on other dependencies, and can perform cleanup via `yield`. This eliminates global state, makes testing easy through `app.dependency_overrides`, and keeps route handlers focused on business logic.
- **The Unforgettable Mental Model:** The **Restaurant Supply Chain**. The chef (endpoint) doesn't grow vegetables or raise cattle — they request ingredients (dependencies) from suppliers. The kitchen manager (FastAPI) ensures all ingredients arrive in the right order, fresh, and ready to use. If a supplier is unavailable, the manager swaps in a substitute (dependency override).
- **The Trap:** Using dependency injection for everything. Dependencies are for request-scoped shared logic (auth, DB sessions, settings). Don't use them for pure utility functions — just import and call those directly.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI's dependency injection uses Depends() to declare that an endpoint needs a value from a callable. FastAPI resolves the dependency graph before the endpoint runs, caches shared dependencies, and supports cleanup via yield. This keeps handlers thin, eliminates global state, and makes testing easy through dependency overrides."

#### How does the dependency resolution order work?
- **The Engine Mechanism (Why it behaves this way):** FastAPI builds a directed acyclic graph (DAG) of all dependencies declared on an endpoint and its dependencies. It resolves them in topological order — leaf dependencies (those with no dependencies of their own) are called first, then their dependents, and so on. If the same dependency is declared multiple times (e.g., on both the router and the endpoint), FastAPI calls it once and caches the result for the request. The resolution happens before validation and before the endpoint is called.
- **The Unforgettable Mental Model:** The **Domino Setup**. You can't knock down domino C before B, and B before A. FastAPI sets up the dominos in the right order (topological sort) so each dependency has what it needs before it runs.
- **The Trap:** Creating circular dependencies (A depends on B, B depends on A). FastAPI detects this and raises an error. Design your dependency graph as a DAG — no cycles.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI resolves dependencies in topological order — leaf dependencies first, then their dependents. Shared dependencies are called once per request and cached. Circular dependencies are detected and rejected. This means I design dependencies as a directed acyclic graph, with foundational deps (settings, DB) at the leaves and composite deps (current user, permissions) at the top."

#### How do you use yield for dependency cleanup?
- **The Engine Mechanism (Why it behaves this way):** A dependency function that uses `yield` instead of `return` provides a value before the `yield` statement and executes cleanup code after it. FastAPI calls the dependency up to the `yield`, injects the yielded value into the endpoint, runs the endpoint, and then resumes the dependency after the `yield` to execute cleanup — even if the endpoint raised an exception. This is ideal for database sessions (open session → yield → close session), file handles, and temporary resources. The cleanup runs in reverse order of dependency resolution.
- **The Unforgettable Mental Model:** The **Bookend Technique**. The code before `yield` opens the book (creates the resource). The code after `yield` closes it (cleans up). No matter what happens in the middle (endpoint logic, exceptions), the book always gets closed.
- **The Trap:** Using `return` instead of `yield` when cleanup is needed. `return` exits the function immediately — cleanup code after `return` never runs. Only `yield` guarantees post-endpoint execution.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use yield dependencies for resources that need cleanup — database sessions, file handles, temporary directories. The code before yield creates the resource, the code after yield cleans it up. FastAPI guarantees the cleanup runs even if the endpoint raises an exception, which prevents resource leaks."

#### How do you override dependencies for testing?
- **The Engine Mechanism (Why it behaves this way):** FastAPI provides `app.dependency_overrides`, a dictionary that maps original dependency callables to replacement callables. During testing, you assign `app.dependency_overrides[get_db] = override_get_db` to replace the real database session with a test session. The override applies to all endpoints that use `Depends(get_db)`. After tests, clear the overrides with `app.dependency_overrides.clear()`. This allows testing endpoints in isolation without starting a real database or external service.
- **The Unforgettable Mental Model:** The ** stunt Double**. In a movie, a stunt double replaces the actor for dangerous scenes. The script (endpoint code) doesn't change — it still calls for "the actor" (dependency) — but the director (FastAPI) substitutes the stunt double (override) for that scene (test).
- **The Trap:** Forgetting to clear dependency overrides between tests. Stale overrides can cause one test to affect another, leading to flaky tests. Always clear in teardown or use a fixture.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use app.dependency_overrides to replace real dependencies with test doubles. For example, I override get_db to return a test database session, and I override get_current_user to return a mock user. I clear overrides after each test to prevent cross-test contamination. This lets me test endpoints in isolation."

#### Can dependencies depend on other dependencies?
- **The Engine Mechanism (Why it behaves this way):** Yes — dependencies can use `Depends()` to declare their own dependencies, creating a dependency chain. For example, `get_current_user` might depend on `get_db` (to look up the user) and `get_token` (to extract the auth token). FastAPI resolves the entire chain: first `get_db` and `get_token`, then `get_current_user`, then the endpoint. Each dependency in the chain can have its own cleanup via `yield`, and all cleanup runs in reverse order after the endpoint completes.
- **The Unforgettable Mental Model:** The **Supply Chain**. The restaurant (endpoint) needs ingredients from the chef (get_current_user), who needs supplies from the farmer (get_db) and the market (get_token). Each layer depends on the layer below it.
- **The Trap:** Deep dependency chains that are hard to understand. More than 3-4 levels of dependency nesting makes the code hard to follow. Flatten when possible.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Dependencies can depend on other dependencies, creating chains. I use this for composite logic — like get_current_user depending on get_db and get_token. But I keep chains shallow (2-3 levels) to maintain readability. Deep chains are refactored into fewer, more focused dependencies."

#### How does dependency caching work?
- **The Engine Mechanism (Why it behaves this way):** By default, FastAPI caches the result of each dependency per request. If the same dependency is declared multiple times in the dependency graph (e.g., on both the router and the endpoint, or as a dependency of multiple other dependencies), FastAPI calls it once and reuses the result. You can disable caching with `Depends(get_db, use_cache=False)`, which calls the dependency each time it's declared. Caching improves performance and ensures consistency — you get the same DB session throughout a request.
- **The Unforgettable Mental Model:** The **Memo**. If you ask the same question twice in a meeting, the answer is memoized — you get the cached answer instead of re-asking. `use_cache=False` is like saying "ask again, the answer might have changed."
- **The Trap:** Disabling cache unnecessarily. `use_cache=False` means the dependency runs multiple times per request, which can be expensive (multiple DB queries, multiple auth checks). Only disable when you genuinely need fresh values.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI caches dependency results per request by default. If the same dependency is used multiple times, it's called once and reused. I only disable caching with use_cache=False when I need fresh values each time — like a dependency that reads a changing configuration value."

## 8. Active recall test

1. **What does Depends() do in FastAPI?**
   - **Explanation:** Declares that an endpoint needs a value produced by a callable. FastAPI resolves the dependency before calling the endpoint, injects the return value, and supports cleanup via yield.

2. **In what order are dependencies resolved?**
   - **Explanation:** Topological order — leaf dependencies (no dependencies of their own) are called first, then their dependents, up to the endpoint. Shared dependencies are called once and cached.

3. **How does yield enable cleanup in dependencies?**
   - **Explanation:** Code before yield creates the resource and yields it to the endpoint. Code after yield runs cleanup after the endpoint completes, even if an exception occurred.

4. **How do you mock dependencies in tests?**
   - **Explanation:** Use `app.dependency_overrides[original_dep] = mock_dep` to replace real dependencies with test doubles. Clear overrides after each test.

5. **What happens if you create circular dependencies?**
   - **Explanation:** FastAPI detects circular dependencies and raises an error. Dependencies must form a directed acyclic graph (DAG).

6. **What does use_cache=False do?**
   - **Explanation:** Disables per-request caching for that dependency, causing it to be called every time it's declared in the dependency graph instead of reusing the cached result.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

FastAPI Dependency Injection should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain FastAPI Dependency Injection, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define FastAPI Dependency Injection.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
