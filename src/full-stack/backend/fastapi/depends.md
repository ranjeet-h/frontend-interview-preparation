# Depends

## Detailed explanation

`Depends` declares a dependency that FastAPI resolves before calling the endpoint. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

`Depends` wires reusable request logic into routes.

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

#### What does Depends() do and when should you use it?
- **The Engine Mechanism (Why it behaves this way):** `Depends()` is a FastAPI function that declares a dependency — a callable whose return value should be injected into an endpoint or another dependency. When FastAPI processes a request, it builds a dependency graph from all `Depends()` declarations, resolves dependencies in topological order, calls each dependency function, caches results for shared dependencies, and injects the return values. Use `Depends()` for shared request-time logic: authentication, database sessions, pagination, settings, rate limiting, feature flags. Don't use it for pure utility functions — just import those directly.
- **The Unforgettable Mental Model:** The **Vending Machine Slot**. You insert a coin (Depends declaration), the machine dispenses a product (dependency return value). You don't need to know how the machine works internally — you just put in the coin and get what you need.
- **The Trap:** Using Depends() for everything, including simple utility functions. Depends() adds overhead (graph resolution, caching) and couples the function to FastAPI's request context. Pure functions should be imported directly.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Depends() declares that an endpoint needs a value from a callable. FastAPI resolves the dependency graph, calls each dependency, caches shared results, and injects values. I use it for request-scoped shared logic — auth, DB sessions, pagination — not for pure utility functions which I import directly."

#### How does Depends() differ from calling a function directly?
- **The Engine Mechanism (Why it behaves this way):** When you call a function directly (`db = get_db()`), you're responsible for calling it, passing arguments, and managing its lifecycle. With `Depends(get_db)`, FastAPI: (1) automatically calls the function at the right time in the request lifecycle, (2) resolves its own dependencies recursively, (3) caches the result for shared use within the request, (4) runs cleanup code after the endpoint (if using yield), (5) allows test overrides via `app.dependency_overrides`. The dependency is managed by the framework, not by your code.
- **The Unforgettable Mental Model:** The **Concierge vs. DIY**. Calling a function directly is DIY — you find the tool, use it, put it away. Depends() is a concierge — you request the tool, the concierge finds it, hands it to you, and puts it away when you're done.
- **The Trap:** Not understanding that dependencies are called per-request. A dependency that creates a resource (DB session) creates a new one for each request, not once at startup.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Depends() gives FastAPI control over when and how the function is called. It handles dependency resolution, caching, cleanup via yield, and test overrides. Direct function calls require manual lifecycle management. I use Depends() for request-scoped resources and direct calls for stateless utilities."

#### Can Depends() be used on router-level dependencies?
- **The Engine Mechanism (Why it behaves this way):** Yes — `APIRouter(dependencies=[Depends(require_auth)])` applies the dependency to all routes registered on that router. The dependency runs for every request to any route in the router, but its return value is not injected into the endpoint (unless also declared in the endpoint's signature). This is useful for "side effect" dependencies like auth checks, rate limiting, or logging that don't need to return a value to the endpoint. If the dependency raises an exception, all routes in the router are protected.
- **The Unforgettable Mental Model:** The **Building Security**. Instead of checking ID at every room (endpoint), you check it at the building entrance (router). Everyone entering the building is verified, but individual rooms don't need to re-check.
- **The Trap:** Assuming router-level dependencies inject values into endpoints. They run but don't inject unless also declared in the endpoint signature. Use both: router-level for side effects, endpoint-level for value injection.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Router-level dependencies run for every route in the router but don't inject values unless also declared in the endpoint. I use them for auth checks and rate limiting — side effects that protect all routes. For value injection (like current_user), I declare Depends() in the endpoint signature too."

#### How does Depends() support testing through overrides?
- **The Engine Mechanism (Why it behaves this way):** `app.dependency_overrides` is a dictionary mapping original dependency callables to replacement callables. During testing, you assign `app.dependency_overrides[get_db] = mock_get_db` to replace the real database session with a test session. FastAPI uses the override instead of the original dependency for all requests during the test. This works for any dependency — auth, external services, settings. After tests, clear overrides with `app.dependency_overrides.clear()` to prevent cross-test contamination.
- **The Unforgettable Mental Model:** The **Understudy**. In theater, an understudy replaces the lead actor for specific performances. The script (endpoint) doesn't change — it still calls for the lead (dependency) — but the director (FastAPI) substitutes the understudy (override).
- **The Trap:** Not clearing overrides between tests. Stale overrides cause flaky tests where one test's mock affects another test. Always clear in teardown or use pytest fixtures.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use app.dependency_overrides to replace dependencies with test doubles — mock DB sessions, fake users, stubbed external services. This tests endpoints in isolation. I always clear overrides after each test using a pytest fixture's teardown to prevent cross-test contamination."

#### What is the performance cost of Depends()?
- **The Engine Mechanism (Why it behaves this way):** Depends() has minimal overhead — FastAPI pre-computes the dependency graph at startup and caches it. At request time, resolving dependencies is essentially a dictionary lookup and function call. The caching mechanism ensures shared dependencies are called only once per request. The overhead is negligible compared to I/O operations (database queries, HTTP calls). The real performance concern is what the dependency does, not the Depends() mechanism itself.
- **The Unforgettable Mental Model:** The **Pre-Planned Route**. GPS pre-calculates the route (dependency graph) before you start driving. During the drive, following the route is fast — the computation happened upfront.
- **The Trap:** Blaming Depends() for slow endpoints. If an endpoint is slow, it's the dependency's logic (DB query, external API call), not the Depends() mechanism. Profile the dependency function, not the framework.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Depends() has negligible overhead — the dependency graph is pre-computed at startup and cached. Resolution at request time is a dictionary lookup. Performance issues come from what dependencies do (DB queries, API calls), not from Depends() itself. I profile the dependency logic, not the framework mechanism."

#### How do you create a dependency that only runs for side effects?
- **The Engine Mechanism (Why it behaves this way):** Declare a dependency without assigning its return value: `@app.get("/items", dependencies=[Depends(log_request)])`. The `dependencies` parameter (plural) on route decorators runs dependencies for their side effects without injecting values. The dependency function can log, rate-limit, or check permissions. If it raises an exception, the endpoint is never called. This is different from `Depends()` as a function parameter, which injects the return value.
- **The Unforgettable Mental Model:** The **Security Camera**. The camera (side-effect dependency) watches everyone who enters but doesn't interact with them. If it sees something suspicious, it triggers an alarm (exception) that stops everything.
- **The Trap:** Confusing `dependencies=[Depends(...)]` with `param: Type = Depends(...)`. The former runs for side effects only; the latter injects the return value into the endpoint.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For side-effect dependencies, I use the dependencies parameter on route decorators: dependencies=[Depends(log_request)]. This runs the dependency without injecting its return value. I use this for logging, rate limiting, and permission checks that don't need to pass data to the endpoint."

## 8. Active recall test

1. **What does Depends() do?**
   - **Explanation:** Declares a dependency whose return value FastAPI resolves and injects into the endpoint. FastAPI handles graph resolution, caching, cleanup via yield, and test overrides.

2. **When should you NOT use Depends()?**
   - **Explanation:** For pure utility functions that don't need request context. Import and call them directly — Depends() adds unnecessary overhead and couples to FastAPI.

3. **How do router-level dependencies differ from endpoint-level dependencies?**
   - **Explanation:** Router-level dependencies run for all routes but don't inject values (unless also declared in the endpoint). They're for side effects like auth checks. Endpoint-level dependencies inject return values.

4. **How do dependency overrides work in testing?**
   - **Explanation:** `app.dependency_overrides[original] = mock` replaces a dependency with a test double. Clear overrides after each test to prevent cross-test contamination.

5. **What is the performance cost of Depends()?**
   - **Explanation:** Negligible. The dependency graph is pre-computed at startup. Resolution is a dictionary lookup. Performance issues come from the dependency's logic, not the mechanism.

6. **How do you run a dependency for side effects only?**
   - **Explanation:** Use the `dependencies` parameter on route decorators: `@app.get("/items", dependencies=[Depends(log_request)])`. This runs the dependency without injecting its return value.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Depends should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Depends, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Depends.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
