# FastAPI Middleware

## Detailed explanation

FastAPI middleware wraps requests and responses for logging, CORS, timing, headers, or cross-cutting behavior. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Middleware surrounds every matching request.

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

#### What is middleware in FastAPI and when should you use it?
- **The Engine Mechanism (Why it behaves this way):** Middleware is a function that wraps every request and response in the application. It runs before the request reaches routing/validation and after the response leaves the endpoint. FastAPI middleware follows the ASGI middleware pattern — it receives the request, can modify it, passes it to the next layer, receives the response, can modify it, and returns it. Use middleware for cross-cutting concerns that apply to ALL requests: CORS, request logging, timing, security headers, compression. Don't use middleware for logic that applies to specific routes — use dependencies instead.
- **The Unforgettable Mental Model:** The **Building's Front Door**. Every person (request) entering or leaving (response) passes through the front door (middleware). The doorman checks IDs (CORS), logs entries (logging), and timestamps visits (timing). But the doorman doesn't decide what happens inside each room — that's the room's job (dependencies/endpoints).
- **The Trap:** Using middleware for route-specific logic. Middleware runs for EVERY request, including static files and health checks. If logic only applies to certain routes, use a dependency instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Middleware wraps every request and response in the application. I use it for cross-cutting concerns like CORS, logging, timing, and security headers. For route-specific logic like auth or pagination, I use dependencies instead — middleware is too broad for targeted concerns."

#### How does middleware ordering work?
- **The Engine Mechanism (Why it behaves this way):** Middleware is applied in reverse order of addition — the last middleware added is the outermost layer. When a request arrives, it passes through middleware from outermost to innermost. When a response returns, it passes through middleware from innermost to outermost. This means the first middleware you add is closest to the endpoint, and the last middleware you add is closest to the client. CORS should typically be outermost (added last) to handle preflight requests before any other middleware runs.
- **The Unforgettable Mental Model:** The **Onion Layers**. Each middleware is an onion layer. The last layer added is the outermost skin. Requests peel through from outside in; responses build back from inside out.
- **The Trap:** Adding CORS middleware first (innermost). CORS needs to be outermost to handle browser preflight OPTIONS requests before auth or routing runs. Add CORS last.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Middleware runs in reverse order of addition — the last added is the outermost layer. I always add CORS last so it's outermost and handles preflight requests before auth or routing. Logging is also typically outermost to capture all requests including errors."

#### What is the difference between middleware and dependencies?
- **The Engine Mechanism (Why it behaves this way):** Middleware runs for EVERY request regardless of route matching — it wraps the entire ASGI application. Dependencies run only for routes that declare them — they're resolved after routing matches. Middleware operates at the raw ASGI level (scope, receive, send); dependencies operate at the FastAPI level (typed parameters, Pydantic models). Middleware is for cross-cutting concerns (CORS, logging); dependencies are for route-specific concerns (auth, DB sessions, pagination). Middleware cannot access Pydantic-validated data; dependencies can.
- **The Unforgettable Mental Model:** The **Security Perimeter vs. Room Access**. Middleware is the building's security perimeter — everyone passes through it. Dependencies are individual room locks — only people going to that room need the key.
- **The Trap:** Using middleware for auth. Middleware runs before routing, so it can't easily apply different auth rules to different routes. Use dependencies for route-specific auth.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Middleware runs for every request at the ASGI level — good for CORS, logging, headers. Dependencies run only for routes that declare them at the FastAPI level — good for auth, DB sessions, pagination. I use middleware for cross-cutting concerns and dependencies for route-specific concerns."

#### How do you create custom middleware?
- **The Engine Mechanism (Why it behaves this way):** Use `@app.middleware("http")` decorator for HTTP middleware: `@app.middleware("http") async def log_requests(request: Request, call_next): start = time.time(); response = await call_next(request); duration = time.time() - start; response.headers["X-Process-Time"] = str(duration); return response`. The `call_next` function passes the request to the next middleware/endpoint and returns the response. You can modify the request before `call_next` and the response after. For lower-level control, implement a Starlette `BaseHTTPMiddleware` subclass.
- **The Unforgettable Mental Model:** The **Sandwich Maker**. Before `call_next` is the bottom bread (modify request). `call_next` is the filling (endpoint processes). After `call_next` is the top bread (modify response). The sandwich is complete.
- **The Trap:** Forgetting to await call_next. In async middleware, `call_next` is a coroutine — you must `await` it. Without await, you get a coroutine object, not a response.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create HTTP middleware with @app.middleware('http') decorator. The function receives the request and call_next. I modify the request before await call_next(request), then modify the response after. I always await call_next — it's a coroutine. For complex middleware, I use Starlette's BaseHTTPMiddleware subclass."

#### How does middleware affect performance?
- **The Engine Mechanism (Why it behaves this way):** Each middleware adds a small overhead — an additional function call and potential request/response processing. For most middleware (logging, headers), this overhead is negligible (microseconds). However, middleware that performs I/O (database queries, external API calls) or heavy computation blocks every request and can significantly degrade performance. Middleware that reads the request body consumes it — subsequent middleware or the endpoint may not be able to read it again. Always profile middleware impact in production-like conditions.
- **The Unforgettable Mental Model:** The **Toll Booths**. Each toll booth (middleware) adds a small delay. One or two toll booths are fine. But if each booth requires a full vehicle inspection (I/O), traffic backs up quickly.
- **The Trap:** Reading the request body in middleware. The body can only be read once — if middleware consumes it, the endpoint can't access it. Use `request.body()` carefully or clone the body.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Middleware adds minimal overhead for simple operations like logging or headers. But I/O in middleware blocks every request. I avoid database queries or external API calls in middleware. I also avoid reading the request body — it can only be read once. I profile middleware impact before deploying to production."

#### How do you test middleware?
- **The Engine Mechanism (Why it behaves this way):** Middleware is tested automatically through integration tests with TestClient — every request goes through the middleware chain. For unit testing specific middleware behavior, you can test the middleware function directly by creating mock Request and Response objects. To test middleware in isolation, create a minimal FastAPI app with only the middleware and a simple endpoint, then use TestClient to verify request/response modifications. Test both the request modification (before call_next) and response modification (after call_next).
- **The Unforgettable Mental Model:** The **Water Quality Test**. Instead of testing the entire water treatment plant (full app), you test one filter (middleware) by running water through it and checking what comes out.
- **The Trap:** Only testing middleware through full-app tests. Full-app tests are slow. Create minimal test apps with just the middleware for fast, focused middleware tests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test middleware through integration tests with TestClient — every request goes through the middleware chain. For focused testing, I create minimal FastAPI apps with just the middleware and a simple endpoint. I verify both request modifications before call_next and response modifications after call_next."

## 8. Active recall test

1. **What is middleware in FastAPI?**
   - **Explanation:** A function that wraps every request and response in the application. It runs before routing/validation and after the endpoint, operating at the ASGI level.

2. **When should you use middleware vs. dependencies?**
   - **Explanation:** Middleware for cross-cutting concerns that apply to ALL requests (CORS, logging, headers). Dependencies for route-specific concerns (auth, DB sessions, pagination).

3. **How does middleware ordering work?**
   - **Explanation:** Reverse order of addition — the last middleware added is the outermost layer. Requests pass from outermost to innermost; responses pass from innermost to outermost.

4. **Why should CORS middleware be added last?**
   - **Explanation:** So it's the outermost layer and handles browser preflight OPTIONS requests before auth or routing runs.

5. **What happens if middleware reads the request body?**
   - **Explanation:** The body can only be read once. If middleware consumes it, the endpoint can't access it. Clone the body or avoid reading it in middleware.

6. **How do you test middleware?**
   - **Explanation:** Through integration tests with TestClient (automatic) or by creating minimal FastAPI apps with just the middleware for focused unit testing.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

FastAPI Middleware should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain FastAPI Middleware, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define FastAPI Middleware.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
