# What Is FastAPI

## Detailed explanation

FastAPI is a Python web framework for building APIs with type hints, automatic validation, dependency injection, and OpenAPI documentation. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

FastAPI turns typed Python functions into validated HTTP APIs.

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

#### What is FastAPI and what problem does it solve?
- **The Engine Mechanism (Why it behaves this way):** FastAPI is a modern Python web framework that uses Python type hints to automatically validate request data, serialize responses, generate OpenAPI schemas, and power interactive documentation. Under the hood, it combines Starlette for ASGI handling (routing, middleware, WebSockets) and Pydantic for data validation/serialization. When a request arrives, FastAPI extracts parameters from the path, query, headers, cookies, and body, validates them against type-annotated function signatures using Pydantic, resolves any `Depends()` dependencies, calls the endpoint, validates the return value against `response_model` if specified, and serializes the result to JSON.
- **The Unforgettable Mental Model:** The **Vending Machine**. You insert coins (request data), the machine validates them (Pydantic), checks if you have permission (dependencies), dispenses the product (endpoint logic), and gives you change (response model). Everything is automatic — no manual validation, no manual serialization.
- **The Trap:** Thinking FastAPI is "just another Flask." FastAPI's type-driven validation, automatic dependency injection, async-first design, and built-in OpenAPI docs fundamentally change how you structure and test APIs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI is a Python web framework that uses type hints as the single source of truth for API contracts. It automatically validates incoming request data with Pydantic, resolves shared logic through dependency injection, serializes responses, and generates OpenAPI documentation — all from the same type annotations. This eliminates boilerplate, reduces bugs, and makes APIs self-documenting."

#### How does FastAPI fit into the request lifecycle?
- **The Engine Mechanism (Why it behaves this way):** FastAPI processes each request through a defined pipeline: (1) ASGI server receives the HTTP request, (2) Starlette routing matches the URL to an endpoint, (3) FastAPI extracts and validates path/query/body parameters via Pydantic, (4) dependency graph is resolved (with caching for shared dependencies), (5) the endpoint function executes, (6) the return value is validated against `response_model`, (7) the result is serialized to JSON and returned. Middleware wraps this entire pipeline, running before and after.
- **The Unforgettable Mental Model:** The **Airport Security Checkpoint**. Your request goes through multiple stations: ticket check (routing), ID verification (validation), baggage scan (dependency resolution), boarding (endpoint execution), and final gate check (response serialization). Each station has a specific job and rejects you if something is wrong.
- **The Trap:** Assuming validation happens inside the endpoint. Validation occurs *before* your endpoint code runs — if validation fails, the endpoint is never called.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI processes requests through a pipeline: routing matches the URL, Pydantic validates all parameters before the endpoint runs, dependencies are resolved in topological order, the endpoint executes, and the return value is validated against the response model. This means invalid requests are rejected before any business logic runs, which is a key security and reliability pattern."

#### How would you test a FastAPI application?
- **The Engine Mechanism (Why it behaves this way):** FastAPI provides `TestClient` (built on Starlette's `TestClient` which uses `httpx`) to make HTTP calls against the app without starting a real server. Tests use `pytest` and can override dependencies via `app.dependency_overrides` to replace database sessions, auth checks, or external services with mocks. Each test makes real HTTP calls through the full FastAPI pipeline — routing, validation, dependency resolution, and response serialization — ensuring end-to-end correctness.
- **The Unforgettable Mental Model:** The **Flight Simulator**. Instead of putting a real plane in the air (production server), you test everything in a simulator (TestClient) that behaves identically but lets you swap out the engine (dependencies) and weather conditions (mock data).
- **The Trap:** Testing only the endpoint function directly without going through `TestClient`. This bypasses routing, validation, middleware, and dependency resolution — the very things that can break in production.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test FastAPI using TestClient with pytest, making real HTTP calls through the full pipeline. I override dependencies to mock database sessions and external services, test both happy paths and error cases, and assert on status codes, response bodies, and headers. This ensures routing, validation, serialization, and business logic all work together correctly."

#### What mistake do developers commonly make with FastAPI?
- **The Engine Mechanism (Why it behaves this way):** The most common mistake is putting business logic directly in route handlers. This couples HTTP concerns (request parsing, response formatting) with domain logic, making code untestable without HTTP mocks, hard to reuse across endpoints, and difficult to maintain as the application grows. Another common mistake is mixing Pydantic models — using the same model for request input, database ORM, and response output — which creates tight coupling and leaks internal fields to clients.
- **The Unforgettable Mental Model:** The **Swiss Army Knife Problem**. A route handler that does validation, auth, business logic, database queries, and response formatting is like a Swiss Army knife — it can do everything, but nothing well. Each tool should be separate.
- **The Trap:** Thinking "it works" means "it's correct." A bloated route handler may pass manual testing but will fail under code review, become impossible to unit test, and create maintenance nightmares.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most common FastAPI mistake is putting business logic in route handlers and mixing Pydantic models for input, database, and output. I keep handlers thin — they delegate to service layers — and I maintain separate schemas for request input, response output, and database models. This makes code testable, reusable, and secure."

#### How does FastAPI affect validation and serialization?
- **The Engine Mechanism (Why it behaves this way):** FastAPI uses Pydantic's validation engine to parse and validate all incoming data against type hints. Pydantic performs type coercion (e.g., string "42" to int 42), constraint checking (min/max length, regex patterns, range limits), nested model validation, and custom validators. For serialization, `response_model` filters the output through a Pydantic model, stripping internal fields, converting types, and applying `model_config` settings like `from_attributes=True` for ORM compatibility.
- **The Unforgettable Mental Model:** The **Customs Border Agent**. Every piece of data entering or leaving your API goes through customs. Incoming data gets inspected, measured, and either approved or rejected with a detailed report. Outgoing data gets filtered — sensitive items stay inside, only approved items leave.
- **The Trap:** Assuming Pydantic validation is the same as Python type checking. Type hints alone don't validate at runtime — Pydantic actively parses, coerces, and validates data. A `str` type hint in a regular function does nothing; in a Pydantic model, it rejects non-string values.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI delegates validation and serialization to Pydantic, which uses type hints as runtime contracts. Incoming data is parsed, coerced, and validated before the endpoint runs. Outgoing data is filtered through response models to ensure only intended fields reach the client. This eliminates manual validation code and prevents data leakage."

#### How does FastAPI affect production reliability?
- **The Engine Mechanism (Why it behaves this way):** FastAPI improves production reliability through several mechanisms: automatic validation rejects malformed requests before they hit business logic; dependency injection with cleanup (via `yield`) prevents resource leaks (DB sessions, file handles); structured error handling via exception handlers provides consistent error responses; async support enables high concurrency for I/O-bound workloads; and OpenAPI docs keep frontend-backend contracts synchronized, reducing integration bugs.
- **The Unforgettable Mental Model:** The **Seatbelt System**. FastAPI doesn't just let you drive fast — it wraps you in seatbelts (validation), airbags (error handling), and ABS brakes (async concurrency) so you can go fast safely.
- **The Trap:** Assuming async means "automatically faster." Async only helps with I/O-bound workloads. CPU-bound tasks still block the event loop and degrade performance for all concurrent requests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI improves production reliability by validating requests before business logic runs, managing resources through dependency cleanup, providing consistent error handling, and enabling high concurrency through async. Combined with proper testing and dependency overrides, it creates a system where most bugs are caught at the contract level before they reach production."

## 8. Active recall test

1. **What is FastAPI's core value proposition?**
   - **Explanation:** FastAPI uses Python type hints as the single source of truth for API contracts, automatically providing request validation, response serialization, dependency injection, and OpenAPI documentation — eliminating boilerplate and reducing bugs.

2. **What are the two main libraries FastAPI is built on?**
   - **Explanation:** Starlette handles ASGI networking (routing, middleware, WebSockets, requests/responses) and Pydantic handles data validation and serialization using Python type hints.

3. **When does request validation happen in FastAPI?**
   - **Explanation:** Validation happens before the endpoint function is called. If Pydantic validation fails, FastAPI returns a 422 error and the endpoint code never executes.

4. **How do you test FastAPI without a running server?**
   - **Explanation:** Use `TestClient` from `fastapi.testclient` with pytest. It makes HTTP calls through the full FastAPI pipeline. Override dependencies via `app.dependency_overrides` to mock databases and external services.

5. **What is the most common architectural mistake in FastAPI?**
   - **Explanation:** Putting business logic in route handlers and mixing Pydantic models for input, database, and output. Handlers should be thin and delegate to service layers; separate schemas should be used for each concern.

6. **How does FastAPI prevent data leakage in responses?**
   - **Explanation:** The `response_model` parameter filters the endpoint's return value through a Pydantic model, stripping any fields not defined in the model. This ensures internal fields (passwords, internal IDs) never reach the client.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

What Is FastAPI should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain What Is FastAPI, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define What Is FastAPI.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
