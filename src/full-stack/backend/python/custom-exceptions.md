# Custom Exceptions

## Detailed explanation

Custom exceptions represent domain-specific failure states with clearer handling and messages. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

Custom exception gives a business error a name.

## 2. Problem it solves

This concept helps Python backend code stay predictable under real service conditions: request handling, validation, database access, async work, tests, dependency management, and production debugging.

## 3. Core idea

- Understand the language behavior before applying a framework.
- Use explicit contracts where possible.
- Avoid hidden mutation and hidden dependencies.
- Choose concurrency tools based on I/O-bound vs CPU-bound work.
- Write code that is easy to test and debug.

## 4. Visual / analogy

```txt
Python concept -> service code behavior -> API reliability -> production debugging
```

## 5. Minimal example

```python
def example(value):
    return value
```

## 6. Real-world example

In a FastAPI or Django backend, custom exceptions affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### What are custom exceptions in Python?
- **The Engine Mechanism (Why it behaves this way):** Custom exceptions are user-defined exception classes that inherit from `Exception` (or a more specific built-in exception). They allow domain-specific error handling — instead of catching generic `ValueError`, you catch `InvalidEmailError`. Custom exceptions can carry additional context (status codes, error details, field names) beyond the message. They're defined like regular classes: `class APIError(Exception): def __init__(self, status: int, message: str): self.status = status; self.message = message; super().__init__(message)`. Exception hierarchies enable catching groups of related errors: `class ServiceError(Exception): ...; class DatabaseError(ServiceError): ...; class NetworkError(ServiceError): ...` — catching `ServiceError` catches both subclasses.
- **The Unforgettable Mental Model:** The **Custom Warning Labels**. Built-in exceptions are generic warning labels ("Caution: Hot"). Custom exceptions are specific labels ("Caution: Surface temperature 200°C — causes instant burns"). They tell you exactly what went wrong.
- **The Trap:** Inheriting from `BaseException` instead of `Exception`. `BaseException` includes system-exit exceptions that shouldn't be caught by application code.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Custom exceptions are exception classes tailored to my application's domain. Instead of catching generic `ValueError` or `RuntimeError`, I define `InvalidEmailError`, `PaymentFailedError`, `RateLimitExceeded` — each carrying specific context. I build exception hierarchies so I can catch groups of related errors at the right level. In backend services, custom exceptions enable structured error responses — an `APIError` carries an HTTP status code and error details, which the exception handler converts to a JSON response. This keeps error handling clean and consistent."

#### Why do custom exceptions matter in backend Python services?
- **The Engine Mechanism (Why it behaves this way):** Backend services need structured error handling across layers — validation errors, database errors, external API errors, business logic errors. Custom exceptions provide a consistent error taxonomy. FastAPI and Django use custom exceptions for HTTP error responses. A `NotFoundError` maps to 404, `ValidationError` to 422, `AuthError` to 401. Custom exceptions carry context — which field failed validation, which external service timed out, what retry-after header to set. Exception hierarchies enable layered error handling — catch specific errors at the service layer, catch broad errors at the API layer.
- **The Unforgettable Mental Model:** The **Emergency Code System**. Custom exceptions are like emergency codes in a hospital — "Code Blue" (cardiac), "Code Red" (fire). Each code triggers a specific response protocol.
- **The Trap:** Creating too many custom exceptions — one per error case. This creates maintenance overhead. Group related errors into hierarchies.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Custom exceptions provide a structured error taxonomy for backend services. I define exceptions for each error category — validation, authentication, database, external API — with hierarchies for grouping. Each exception carries context: HTTP status codes, error messages, field names, retry-after values. In FastAPI, I register exception handlers that convert custom exceptions to structured JSON responses. This keeps error handling consistent across the service — every error follows the same pattern, making the API predictable for clients."

#### What bug can happen if you misunderstand custom exceptions?
- **The Engine Mechanism (Why it behaves this way):** The inheritance bug: inheriting from `BaseException` catches system-exit exceptions, preventing graceful shutdown. The missing `super().__init__()` bug: not calling `super().__init__(message)` means the exception's `args` and `str()` don't work correctly. The mutable default bug: `class APIError(Exception): def __init__(self, details: dict = {}):` — shares the same dict across instances. The exception hierarchy bug: catching a parent exception before a child exception — `except ServiceError:` before `except DatabaseError:` means `DatabaseError` is never caught specifically. The pickle bug: custom exceptions with complex `__init__` arguments may not pickle correctly, breaking multiprocessing.
- **The Unforgettable Mental Model:** The **Wrong Filing Cabinet**. Catching a parent exception before a child is like filing a document in "Finance" before checking if it belongs in "Finance > Taxes" — the specific category is never used.
- **The Trap:** Not calling `super().__init__()` — the exception's message and args don't work correctly, breaking logging and debugging.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most common custom exception bug is not calling `super().__init__(message)` — this breaks the exception's `str()` representation and `args` attribute, making logging and debugging harder. Another bug is catching parent exceptions before child exceptions — the child is never reached. I also avoid inheriting from `BaseException` — it catches system-exit exceptions. For exceptions with complex data, I ensure they're picklable (for multiprocessing). And I avoid mutable defaults in `__init__` — same bug as with dataclasses."

#### How do custom exceptions affect testing?
- **The Engine Mechanism (Why it behaves this way):** Custom exceptions make testing more precise — `pytest.raises(InvalidEmailError)` is more specific than `pytest.raises(Exception)`. Testing exception hierarchies requires verifying that catching a parent catches children. Testing exception context requires verifying that custom attributes (status codes, field names) are set correctly. Testing exception handlers requires raising custom exceptions and verifying the correct HTTP response. Testing exception chaining requires verifying `__cause__` is set correctly.
- **The Unforgettable Mental Model:** The **Precision Target**. Custom exceptions are like precision targets — `pytest.raises(InvalidEmailError)` hits exactly the right exception, not any exception.
- **The Trap:** Not testing exception context — verifying the exception is raised but not checking its custom attributes (status code, error details).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Custom exceptions make testing more precise. I use `pytest.raises(SpecificError)` instead of `pytest.raises(Exception)`. I test exception context by verifying custom attributes — `assert exc_info.value.status == 422`. I test exception hierarchies by raising a child exception and catching the parent. I test exception handlers by raising custom exceptions and verifying the correct HTTP response. The key is to test both that the exception is raised and that it carries the correct context."

#### How do custom exceptions affect performance?
- **The Engine Mechanism (Why it behaves this way):** Custom exceptions have the same performance characteristics as built-in exceptions — zero overhead for the happy path, creation overhead when raised. The overhead is in creating the exception object and building the traceback, not in the class definition. Custom exceptions with complex `__init__` (computing error messages, formatting details) add overhead during exception creation, but this is negligible compared to the I/O operations in backend services. Exception hierarchies have no performance impact — `isinstance` checks are fast.
- **The Unforgettable Mental Model:** The **Custom Envelope**. A custom exception is like a custom-designed envelope — it costs the same to send as a standard envelope. The design doesn't affect the postage cost.
- **The Trap:** Adding expensive computation in `__init__` — if the exception is raised frequently, the computation adds up.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Custom exceptions have the same performance as built-in exceptions — zero overhead for the happy path, creation overhead when raised. I avoid expensive computation in `__init__` — if an exception is raised frequently (like in a validation loop), the computation adds up. For rare errors (database failures, API timeouts), the overhead is negligible. Exception hierarchies have no performance impact — `isinstance` checks are fast. The key principle: custom exceptions are about clarity and structure, not performance."

#### How would you explain custom exceptions with code?
- **The Engine Mechanism (Why it behaves this way):** Show basic custom exception: `class ValidationError(Exception): def __init__(self, field: str, message: str): self.field = field; self.message = message; super().__init__(message)`. Show hierarchy: `class APIError(Exception): ...; class NotFoundError(APIError): status = 404; class ValidationError(APIError): status = 422`. Show usage: `if not email: raise ValidationError("email", "required")`. Show exception handler: `@app.exception_handler(APIError): async def handle(request, exc): return JSONResponse({"error": exc.message}, status_code=exc.status)`. Show catching hierarchy: `try: ...; except NotFoundError: ...; except APIError: ...`.
- **The Unforgettable Mental Model:** The **Exception Hierarchy Tree**. Show how exceptions form a tree — catching a parent catches all children, but catching a child first allows specific handling.
- **The Trap:** Not showing the exception handler integration — custom exceptions are most powerful when integrated with the framework's error handling.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate custom exceptions with three examples. First, a `ValidationError` with field and message — shows custom context. Second, an exception hierarchy — `APIError` as parent, `NotFoundError` and `ValidationError` as children with HTTP status codes. Third, a FastAPI exception handler that converts custom exceptions to JSON responses. I also show the catching order — specific exceptions first, then broader ones. This shows the full lifecycle: define, raise, catch, and handle."

## 8. Active recall test

1. **Why should custom exceptions inherit from `Exception` not `BaseException`?**
   - **Explanation:** `BaseException` includes `SystemExit`, `KeyboardInterrupt`, and `GeneratorExit` — system-level exceptions that shouldn't be caught by application code. `Exception` excludes these.

2. **Why call `super().__init__(message)` in a custom exception?**
   - **Explanation:** It sets the exception's `args` attribute and enables `str(exception)` to return the message. Without it, logging and debugging tools can't read the exception message.

3. **How do exception hierarchies work?**
   - **Explanation:** Child exceptions inherit from parent exceptions. Catching a parent catches all children. This enables layered error handling — catch specific errors at low levels, broad errors at high levels.

4. **What order should you catch exceptions in a hierarchy?**
   - **Explanation:** Most specific first, then broader. `except NotFoundError:` before `except APIError:` — otherwise `NotFoundError` is caught by `APIError` and never reaches its specific handler.

5. **How do custom exceptions integrate with FastAPI?**
   - **Explanation:** Register exception handlers with `@app.exception_handler(CustomError)`. When the exception is raised, the handler converts it to an HTTP response with the appropriate status code and body.

6. **Are custom exceptions slower than built-in exceptions?**
   - **Explanation:** No. They have the same performance characteristics — zero overhead for the happy path, creation overhead when raised. Only complex `__init__` logic adds overhead.

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare Custom Exceptions with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain Custom Exceptions and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define Custom Exceptions.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
