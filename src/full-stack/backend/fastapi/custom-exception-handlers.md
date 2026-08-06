# Custom Exception Handlers

## Detailed explanation

Custom exception handlers turn application exceptions into consistent API error responses. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Exception handlers standardize failures.

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

#### What are custom exception handlers in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Custom exception handlers are functions registered with `@app.exception_handler(ExceptionType)` that catch specific exceptions and return custom HTTP responses. When an exception of the registered type is raised anywhere in the application (endpoint, dependency, middleware), FastAPI calls the handler instead of returning a default 500 error. The handler receives the request and exception, and must return a Response object (typically JSONResponse). This enables consistent error response formats across the entire application.
- **The Unforgettable Mental Model:** The **Emergency Response Team**. When a specific type of emergency happens (exception), the specialized response team (handler) takes over — they know exactly what to do, what to say (error message), and how to document it (logging).
- **The Trap:** Registering handlers for too many exception types. Handle specific exceptions you expect (ValueError, NotFoundError) and let a catch-all handler deal with everything else. Don't register handlers for every possible exception.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Custom exception handlers catch specific exceptions and return consistent error responses. I register them with @app.exception_handler(ExceptionType). They receive the request and exception, and return a JSONResponse. I handle specific expected exceptions and use a catch-all for everything else."

#### How do you register an exception handler?
- **The Engine Mechanism (Why it behaves this way):** Use the `@app.exception_handler()` decorator with the exception class: `@app.exception_handler(UserNotFoundError) async def user_not_found_handler(request: Request, exc: UserNotFoundError): return JSONResponse(status_code=404, content={"error": "User not found", "detail": str(exc)})`. The handler function must accept `request` and `exc` parameters and return a Response. You can register handlers for built-in exceptions (ValueError, KeyError), HTTPException, or custom exception classes. Handlers are matched by exception type hierarchy — the most specific handler wins.
- **The Unforgettable Mental Model:** The **911 Dispatcher**. You tell the dispatcher what type of emergency (exception class), and they assign the right response team (handler). The team knows the protocol (response format) for that emergency type.
- **The Trap:** Forgetting that handlers must return a Response object. Returning a dict or string causes a server error. Always return JSONResponse or Response.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I register handlers with @app.exception_handler(ExceptionType). The handler receives request and exc, and returns a JSONResponse with the appropriate status code and error body. Handlers match by exception type — the most specific handler wins. I always return a Response object, never a raw dict."

#### How do you create custom exception classes?
- **The Engine Mechanism (Why it behaves this way):** Define a custom exception class that inherits from Exception or a more specific base: `class ResourceNotFoundError(Exception): def __init__(self, resource: str, id: str): self.resource = resource; self.id = id; super().__init__(f"{resource} with id {id} not found")`. Custom exceptions carry structured data (resource name, ID) that the exception handler can use to build detailed error responses. Raise them in services or repositories: `raise ResourceNotFoundError("User", user_id)`. The handler catches them and formats the response.
- **The Unforgettable Mental Model:** The **Incident Report**. Instead of just saying "error," a custom exception is a structured incident report — what happened, where, and what was involved. The handler uses this report to write the public statement.
- **The Trap:** Putting HTTP status codes in exception classes. Exceptions should be domain-level (ResourceNotFoundError), not HTTP-level (NotFoundException). The handler maps domain exceptions to HTTP status codes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create custom exception classes that carry structured data — resource name, ID, error details. They're domain-level, not HTTP-level. The exception handler maps them to HTTP status codes. This keeps business logic decoupled from HTTP concerns."

#### How does exception handler priority work?
- **The Engine Mechanism (Why it behaves this way):** FastAPI matches exception handlers by type hierarchy — the most specific handler wins. If you have handlers for both `Exception` and `ValueError`, a `ValueError` is caught by the `ValueError` handler, not the `Exception` handler. Built-in handlers (for `RequestValidationError`, `HTTPException`) have higher priority than custom handlers for the same types unless you explicitly override them. Handlers registered later override earlier handlers for the same exception type.
- **The Unforgettable Mental Model:** The **Specialist vs. Generalist Doctor**. A heart specialist (ValueError handler) treats heart issues before the general practitioner (Exception handler). The most specific expert always gets first priority.
- **The Trap:** Registering a catch-all Exception handler that shadows more specific handlers. Register specific handlers first, then the catch-all. Or rely on type hierarchy — specific types are matched before general types.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI matches handlers by type hierarchy — the most specific handler wins. ValueError is caught by a ValueError handler before an Exception handler. I register specific handlers for expected exceptions and a catch-all Exception handler for everything else. The catch-all logs the error and returns a generic 500 response."

#### How do you override FastAPI's default exception handlers?
- **The Engine Mechanism (Why it behaves this way):** FastAPI has built-in handlers for `RequestValidationError` (422 responses) and `HTTPException` (custom status codes with detail). To override them, register your own handler for the same exception type: `@app.exception_handler(RequestValidationError) async def validation_error_handler(request: Request, exc: RequestValidationError): return JSONResponse(status_code=400, content={"error": "Invalid request", "details": exc.errors()})`. This replaces FastAPI's default 422 format with your custom format. Be careful — overriding default handlers changes behavior for all endpoints.
- **The Unforgettable Mental Model:** The **Company Policy Override**. The default policy (FastAPI's handler) applies everywhere. But the company can issue a new policy (custom handler) that replaces the default for everyone.
- **The Trap:** Overriding RequestValidationError and losing the structured error format. FastAPI's default 422 format is frontend-friendly. If you override it, replicate the structure or frontend forms will break.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I override default handlers by registering my own for the same exception type. But I'm careful with RequestValidationError — FastAPI's default 422 format is frontend-friendly. If I override it, I replicate the loc/msg/type structure so frontend error handling still works."

#### How do exception handlers improve production reliability?
- **The Engine Mechanism (Why it behaves this way):** Exception handlers prevent raw stack traces from reaching clients (security risk), ensure consistent error response formats (frontend reliability), log errors with context (debugging), and map domain exceptions to appropriate HTTP status codes (API correctness). Without handlers, uncaught exceptions return generic 500 errors with no useful information. With handlers, every error type gets a structured, informative response that clients can handle programmatically.
- **The Unforgettable Mental Model:** The **Customer Service Desk**. Without a desk, angry customers (errors) storm the kitchen (stack traces). With a desk, trained staff (handlers) calm customers, explain the issue, and offer solutions (structured errors).
- **The Trap:** Swallowing exceptions without logging. Handlers should always log the exception before returning a response. Silent failures are the hardest to debug in production.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Exception handlers prevent stack trace leaks, ensure consistent error formats, log errors with context, and map domain exceptions to HTTP status codes. Every handler logs the exception before returning a response. This gives clients structured errors they can handle and gives engineers the context they need to debug."

## 8. Active recall test

1. **What does @app.exception_handler do?**
   - **Explanation:** Registers a function to catch a specific exception type and return a custom HTTP response. The handler receives the request and exception, and must return a Response object.

2. **How does handler priority work?**
   - **Explanation:** Most specific handler wins by type hierarchy. ValueError is caught by a ValueError handler before an Exception handler. Later registrations override earlier ones for the same type.

3. **Why create custom exception classes instead of using HTTPException?**
   - **Explanation:** Custom exceptions carry domain-level structured data (resource name, ID) and keep business logic decoupled from HTTP. The handler maps domain exceptions to HTTP status codes.

4. **What must an exception handler return?**
   - **Explanation:** A Response object (typically JSONResponse). Returning a dict or string causes a server error.

5. **Should you override FastAPI's default RequestValidationError handler?**
   - **Explanation:** Only if necessary, and replicate the loc/msg/type structure. The default 422 format is frontend-friendly — changing it breaks frontend error handling.

6. **What should every exception handler do before returning a response?**
   - **Explanation:** Log the exception with context. Silent failures are the hardest to debug in production.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Custom Exception Handlers should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Custom Exception Handlers, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Custom Exception Handlers.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
