# Global Errors in FastAPI

## Detailed explanation

Global error handling catches unexpected exceptions, logs them, and returns safe error responses. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Global errors prevent raw crashes from leaking.

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

#### What is global error handling in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Global error handling catches unhandled exceptions that bubble up from endpoints, dependencies, or middleware and converts them into safe, consistent HTTP responses. Register a catch-all handler with `@app.exception_handler(Exception)` to catch any exception not handled by more specific handlers. The handler should log the exception (with stack trace for debugging), return a generic error message (no internal details), and use a 500 status code. This prevents raw stack traces from reaching clients and ensures every error gets a structured response.
- **The Unforgettable Mental Model:** The **Safety Net**. Specific handlers catch known trapeze acts (expected exceptions). The global handler is the safety net below — it catches anything that falls through, preventing a catastrophic crash.
- **The Trap:** Returning detailed error messages in the global handler. The global handler catches unexpected errors — their details may include sensitive information (DB credentials, internal paths). Always return a generic message.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Global error handling catches unhandled exceptions with @app.exception_handler(Exception). The handler logs the full error for debugging and returns a generic 500 response to clients — no internal details. It's the safety net that prevents raw stack traces from leaking."

#### How do you implement a global error handler?
- **The Engine Mechanism (Why it behaves this way):** `@app.exception_handler(Exception) async def global_exception_handler(request: Request, exc: Exception): logger.error(f"Unhandled error on {request.url}: {exc}", exc_info=True); return JSONResponse(status_code=500, content={"error": "Internal server error", "request_id": request.headers.get("x-request-id", "unknown")})`. The handler logs the exception with `exc_info=True` to include the stack trace, returns a generic error message, and optionally includes a request ID for correlation with logs. The handler must not re-raise the exception — it must return a Response.
- **The Unforgettable Mental Model:** The **Incident Commander**. When an unexpected incident occurs, the commander (handler) does three things: documents it (logs), contains it (generic response), and tags it (request ID) for later investigation.
- **The Trap:** Re-raising the exception in the global handler. This defeats the purpose — the exception bubbles up to the server, which returns a raw error page. Always return a Response.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement a global handler with @app.exception_handler(Exception). It logs the error with exc_info=True for the stack trace, returns a generic 500 response, and includes a request ID for log correlation. I never re-raise — the handler must return a Response to prevent raw error pages."

#### What should a global error handler log?
- **The Engine Mechanism (Why it behaves this way):** Log: the exception type and message, the full stack trace (exc_info=True), the request URL, method, and headers (excluding sensitive headers like Authorization), the request body (if available and not too large), and a request ID for correlation. Don't log: passwords, tokens, PII, or large request bodies. Use structured logging (JSON format) for easy searching and alerting. The log level should be ERROR for unhandled exceptions.
- **The Unforgettable Mental Model:** The **Black Box Recorder**. Like an airplane's black box, the error handler records everything needed to reconstruct the incident — but not sensitive passenger data.
- **The Trap:** Logging sensitive data in error handlers. Authorization headers, request bodies with passwords, or PII in error logs create security and compliance risks. Filter sensitive fields.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The global handler logs the exception type, message, stack trace, request URL, method, and a request ID. I use structured JSON logging. I filter sensitive data — no passwords, tokens, or PII in logs. The log level is ERROR for unhandled exceptions."

#### How does global error handling interact with specific handlers?
- **The Engine Mechanism (Why it behaves this way):** Specific handlers (for ValueError, HTTPException, RequestValidationError) take priority over the global Exception handler. When an exception is raised, FastAPI finds the most specific registered handler. Only if no specific handler matches does the global handler catch it. This means the global handler only catches truly unexpected errors — bugs, infrastructure failures, unhandled edge cases. Expected errors (validation, not found, unauthorized) are handled by their specific handlers.
- **The Unforgettable Mental Model:** The **Triage System**. Specific handlers are specialists — cardiologist, neurologist, orthopedist. The global handler is the ER generalist who handles anything the specialists don't cover.
- **The Trap:** Registering the global handler before specific handlers. Handler registration order matters — later registrations override earlier ones for the same type. Register specific handlers first, then the global catch-all.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Specific handlers take priority over the global handler by type hierarchy. The global handler only catches truly unexpected errors — bugs and infrastructure failures. Expected errors like validation or not-found are handled by their specific handlers. I register specific handlers first, then the global catch-all."

#### How do you include request IDs in error responses?
- **The Engine Mechanism (Why it behaves this way):** Generate a unique request ID in middleware (or use one from the client's x-request-id header), attach it to the request state (`request.state.request_id = request_id`), and include it in error responses. This allows correlating client error responses with server logs. Middleware generates the ID before the request reaches any handler; the global error handler reads it from request state and includes it in the response.
- **The Unforgettable Mental Model:** The **Tracking Number**. Like a package tracking number, the request ID lets you trace a specific request through the entire system — from client to server to logs to response.
- **The Trap:** Generating the request ID in the error handler. By then, the logs from the request processing don't have the ID. Generate it in middleware before any processing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I generate a request ID in middleware (or use the client's x-request-id header), store it in request.state, and include it in all error responses. This correlates client errors with server logs. The ID must be generated in middleware — before any processing — so all logs include it."

#### How do you test global error handling?
- **The Engine Mechanism (Why it behaves this way):** Trigger an unhandled exception in an endpoint and assert on the 500 response: `@app.get("/crash"); def crash(): raise RuntimeError("test error")`. Use TestClient to call the endpoint and verify: status code is 500, response body contains the generic error message, no stack trace is exposed, and the request ID is present. Also verify that the error was logged (capture log output in tests). Test that specific exceptions (HTTPException, ValidationError) are NOT caught by the global handler.
- **The Unforgettable Mental Model:** The **Fire Drill**. You intentionally start a small fire (raise exception) to test that the sprinkler system (global handler) works correctly — contains the fire, alerts the right people (logs), and doesn't flood the wrong areas (no stack trace leak).
- **The Trap:** Not testing that specific handlers still work. After adding a global handler, verify that HTTPException and ValidationError are still caught by their specific handlers, not the global one.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test global error handling by triggering unhandled exceptions and asserting on 500 status, generic error message, no stack trace, and request ID presence. I also verify that specific handlers (HTTPException, ValidationError) still work — the global handler shouldn't catch them. I capture log output to verify errors are logged."

## 8. Active recall test

1. **What does a global error handler catch?**
   - **Explanation:** Any exception not caught by more specific handlers — unexpected bugs, infrastructure failures, unhandled edge cases. Expected errors are handled by their specific handlers.

2. **What should a global error handler return to clients?**
   - **Explanation:** A generic 500 response with no internal details. Include a request ID for log correlation. Never return stack traces or sensitive information.

3. **What should a global error handler log?**
   - **Explanation:** Exception type, message, full stack trace (exc_info=True), request URL, method, and request ID. Filter sensitive data — no passwords, tokens, or PII.

4. **How do you generate request IDs for error correlation?**
   - **Explanation:** Generate in middleware before any processing, store in request.state, and include in error responses. This correlates client errors with server logs.

5. **How does the global handler interact with specific handlers?**
   - **Explanation:** Specific handlers take priority by type hierarchy. The global handler only catches exceptions with no specific handler. Register specific handlers first, then the global catch-all.

6. **How do you test global error handling?**
   - **Explanation:** Trigger unhandled exceptions, assert 500 status, generic message, no stack trace, request ID present. Verify specific handlers still work. Capture logs to verify error logging.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Global Errors in FastAPI should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Global Errors in FastAPI, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Global Errors in FastAPI.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
