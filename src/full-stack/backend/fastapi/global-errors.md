# Global Error Handling in FastAPI: Exception Handlers, Uncaught 500s, and Custom Exception Hierarchies

## 1. Why This Exists — The Problem First

Imagine your production payment service encounters a sudden database deadlock, an unmapped third-party API payload, or a typo where a junior developer wrote `account_dict["balance"]` instead of `.get("balance")`. In Python, that immediately raises an unhandled `KeyError` or `psycopg2.OperationalError`. 

Without a global error handling architecture, three catastrophic failures happen at once:

First, your ASGI server (Uvicorn/Starlette) catches the raw crash and dumps a 50-line Python stack trace straight into the HTTP response. That response exposes internal directory paths, ORM query structures, database usernames, and package versions to whoever sent the request. Malicious actors use those leaked tracebacks as a blueprint to probe your infrastructure.

Second, your API contract shatters. Web frontends and mobile apps expect structured JSON like `{"error": {"code": "PAYMENT_FAILED", "message": "..."}}`. Instead, when the server crashes without a global handler, it emits a raw `text/plain` string "Internal Server Error" or an HTML 500 error page. The mobile JSON parser instantly crashes with a deserialization failure before it can even display a friendly fallback banner to the user.

Third, the development team is left blind. Without centralized error interception, unhandled crashes scatter across raw console output without correlation IDs (`x-request-id`), without structured metadata, and without alerting monitoring systems. Developers end up littering hundreds of individual route handlers with repetitive, copy-pasted `try...except` blocks, mixing transport logic with business rules and creating an unmaintainable codebase.

Global error handling exists to provide an impenetrable safety net: intercepting every failure, masking sensitive internals, logging rich diagnostics with correlation IDs, and returning predictable, contract-compliant JSON responses for every error code.

## 2. The Analogy — Make It Obvious

Think of an enterprise FastAPI application as a major metropolitan hospital emergency department.

Incoming HTTP requests are patients arriving at the hospital entrance. Route handlers and business services are the attending doctors and surgical specialists.

When a patient arrives with a routine condition (missing insurance paperwork or an invalid appointment format), the front triage nurse catches it immediately. In FastAPI, this is request validation (HTTP 422) caught right at the gate.

When a specialist doctor discovers a known clinical complication during examination (for example, a patient requires blood transfusion but their blood group is incompatible), the doctor does not collapse in panic. They declare a specific, recognized medical condition. In FastAPI, this is a custom domain exception like `InsufficientFundsException` or `EntityNotFoundException`. The hospital has pre-printed protocol cards for these: exact care steps, structured billing records, and clear explanation letters handed to the patient.

Now imagine a sudden building emergency: a main power transformer explodes and the surgical suite goes dark. The surgeon cannot fix a transformer. 

This is an uncaught 500 exception (`RuntimeError` or `DatabaseConnectionError`).

Instead of the surgeon running out to the waiting room screaming, "The wiring behind room 402 burned out and transformer serial number #89-X is melted!", the hospital's Emergency Incident Protocol takes over. A hospital administrator steps forward, hands the family a clean, calm notification card stamped with an incident case number (`Request ID: #INC-8921`), and reassures them that the situation is being handled. 

Behind soundproof doors, the incident response team opens the black-box incident log, records the exact voltage spike, the blueprint location, the timestamp, and the full diagnostic readout for engineering to repair.

The patient's family receives a safe, dignified explanation with a reference tracking code, while the engineers receive full, unredacted telemetry.

## 3. How It Actually Works — The Full Explanation

FastAPI builds on top of Starlette's ASGI architecture. To master error handling, you need to understand the middleware execution pipeline, the exception hierarchy, and how Starlette resolves handlers.

**The Starlette Exception Pipeline**

When an HTTP request enters FastAPI, it travels through an onion-like stack of ASGI middlewares. Two built-in Starlette middlewares govern errors:

1. `ServerErrorMiddleware`: This sits near the outermost layer of the application. Its job is to catch any exception that bubbled completely out of the app, log it, and return a default HTTP 500 response (or display an interactive debugging page if `debug=True`).
2. `ExceptionMiddleware`: This sits inside the routing layer. It maintains a registry mapping Python exception classes to async handler functions.

When a route handler, dependency, or service raises an exception, Python's normal execution halts and the exception unwinds the call stack until it reaches `ExceptionMiddleware`.

`ExceptionMiddleware` checks the type of the raised exception and searches its internal dictionary for a registered handler. It evaluates the exception's Method Resolution Order (MRO). If an exact type match is found, that handler runs. If not, it walks up the inheritance tree to find the nearest parent exception handler (such as a base `AppException` or ultimately `Exception`).

The matched handler returns an ASGI `Response` (typically a `JSONResponse`). `ExceptionMiddleware` catches that response and passes it back down the middleware chain as a normal HTTP response.

**Domain Exception Hierarchy vs. HTTPException**

A common architectural flaw in junior backend code is scattering `raise HTTPException(status_code=404, detail="User not found")` throughout database repositories and service classes. 

This tightly couples pure business logic to the HTTP transport layer. If you ever reuse that service class in a background Celery worker, an event-driven Kafka consumer, or a CLI script, raising an `HTTPException` makes no sense because there is no HTTP request.

Clean Architecture solves this by establishing a pure domain exception hierarchy:

- `Exception` (Standard Python root)
  - `AppException` (Base domain exception carrying machine codes and log metadata)
    - `EntityNotFoundException` (Resource missing: User, Order, Invoice)
    - `BusinessRuleViolationException` (Illegal state transition, insufficient balance)
    - `UnauthorizedAccessException` (Missing permissions or expired session)
    - `ExternalServiceException` (Payment gateway timeout, third-party webhook failure)

Your services raise pure domain exceptions. Your FastAPI transport layer registers handlers that translate domain exceptions into appropriate HTTP status codes (404, 400, 403, 502) and uniform JSON payloads.

**Unified Error Response Contract**

Every error response from your API — whether it is a 422 Pydantic schema validation failure, a 404 domain entity lookup, a 401 unauthorized token, or an unhandled 500 server crash — should follow an identical JSON schema:

```json
{
  "success": false,
  "error": {
    "code": "ENTITY_NOT_FOUND",
    "message": "User with ID 'usr_108' was not found.",
    "details": {
      "entity": "User",
      "id": "usr_108"
    },
    "request_id": "req_98a7f21d-40c2"
  }
}
```

This predictability allows frontend API clients (Axios, TanStack Query, mobile SDKs) to implement a single, global error interceptor rather than writing defensive parsing logic for every endpoint.

**Correlation IDs (Request Tracing) and Observability**

To debug production failures without leaking sensitive data to clients:

1. An early ASGI middleware generates or extracts an `X-Request-ID` header for every incoming request and attaches it to `request.state.request_id`.
2. When any exception handler runs, it extracts `request.state.request_id`.
3. The catch-all 500 handler logs the full stack trace (`exc_info=True`) along with the `request_id`, HTTP method, path, and user ID to structured logging (JSON logs shipped to Datadog, CloudWatch, or Grafana Loki).
4. The client receives only the generic message and the `request_id`. When a user contacts support with that ID, engineers search the central log index and instantly pull up the exact stack trace.

**Overriding FastAPI Built-in Handlers**

By default, FastAPI ships with its own handlers for `RequestValidationError` (Pydantic payload errors) and `StarletteHTTPException` (framework 404s, 405s). These return default shapes like `{"detail": [...]}`. 

To maintain a unified contract, you explicitly override both built-in handlers using `@app.exception_handler(RequestValidationError)` and `@app.exception_handler(StarletteHTTPException)` so that even framework-level errors are wrapped in your standard error envelope.

## 4. Real Code — See It Working

Here is a complete, production-grade implementation featuring custom domain hierarchies, request tracking, schema normalization, and catch-all 500 protection.

```python
import logging
import uuid
from typing import Any, Dict, Optional
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

# Configure structured logging output
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api.errors")


# ============================================================================
# 1. DOMAIN EXCEPTION HIERARCHY (Transport-Agnostic)
# ============================================================================

class AppException(Exception):
    """Base exception for all application-specific domain errors."""
    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_APP_ERROR",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}


class EntityNotFoundException(AppException):
    """Raised when a requested database entity or resource does not exist."""
    def __init__(self, entity_name: str, entity_id: Any):
        super().__init__(
            message=f"{entity_name} with id '{entity_id}' was not found.",
            code="ENTITY_NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
            details={"entity": entity_name, "id": str(entity_id)},
        )


class InsufficientFundsException(AppException):
    """Raised when a wallet or account lacks the balance for a transaction."""
    def __init__(self, account_id: str, requested: float, available: float):
        super().__init__(
            message=f"Account '{account_id}' has insufficient funds.",
            code="INSUFFICIENT_FUNDS",
            status_code=status.HTTP_400_BAD_REQUEST,
            details={"account_id": account_id, "requested": requested, "available": available},
        )


# ============================================================================
# 2. STANDARDIZED ENVELOPE HELPER
# ============================================================================

def build_error_response(
    status_code: int,
    code: str,
    message: str,
    request_id: str,
    details: Optional[Dict[str, Any]] = None,
) -> JSONResponse:
    """Guarantees every error returned by the API matches the exact same schema."""
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "error": {
                "code": code,
                "message": message,
                "details": details or {},
                "request_id": request_id,
            },
        },
        headers={"X-Request-ID": request_id},
    )


# ============================================================================
# 3. FASTAPI APP & EXCEPTION HANDLERS
# ============================================================================

app = FastAPI(title="Fintech Ledger Service")


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Generates or propagates a unique correlation ID for every HTTP transaction."""
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id

    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Catches all domain business exceptions and maps them to standard JSON."""
    request_id = getattr(request.state, "request_id", "unknown")
    logger.warning(
        f"Domain error [{exc.code}] on {request.method} {request.url.path} "
        f"(ReqID: {request_id}): {exc.message}"
    )
    return build_error_response(
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        request_id=request_id,
        details=exc.details,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Overrides default 422 handler to convert Pydantic errors into our uniform envelope."""
    request_id = getattr(request.state, "request_id", "unknown")
    field_errors = []
    for err in exc.errors():
        location = " -> ".join(str(loc) for loc in err.get("loc", []))
        field_errors.append({"field": location, "issue": err.get("msg")})

    logger.info(f"Validation failure on {request.method} {request.url.path} (ReqID: {request_id})")
    return build_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        code="VALIDATION_ERROR",
        message="Request payload failed schema validation.",
        request_id=request_id,
        details={"errors": field_errors},
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Overrides framework HTTP exceptions (e.g. 404 Not Found, 405 Method Not Allowed)."""
    request_id = getattr(request.state, "request_id", "unknown")
    return build_error_response(
        status_code=exc.status_code,
        code=f"HTTP_{exc.status_code}",
        message=str(exc.detail),
        request_id=request_id,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Ultimate catch-all safety net for unexpected crashes (500s). Masks internal details."""
    request_id = getattr(request.state, "request_id", "unknown")
    # Log full traceback internally for engineering investigation
    logger.error(
        f"CRITICAL: Unhandled crash on {request.method} {request.url.path} (ReqID: {request_id}): {exc}",
        exc_info=True,
    )
    # Return sanitized generic error with correlation ID to the caller
    return build_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected internal error occurred. Quote the request_id to support.",
        request_id=request_id,
    )


# ============================================================================
# 4. BUSINESS DOMAIN SERVICES & ENDPOINTS
# ============================================================================

class AccountService:
    """Pure business logic with zero HTTP dependencies."""
    def __init__(self):
        self._db = {"acc_101": 250.0}

    def withdraw(self, account_id: str, amount: float) -> float:
        if account_id not in self._db:
            raise EntityNotFoundException(entity_name="Account", entity_id=account_id)
        current_balance = self._db[account_id]
        if amount > current_balance:
            raise InsufficientFundsException(
                account_id=account_id,
                requested=amount,
                available=current_balance,
            )
        self._db[account_id] -= amount
        return self._db[account_id]


service = AccountService()


class WithdrawRequest(BaseModel):
    amount: float = Field(gt=0, description="Withdrawal amount must be strictly positive")


@app.post("/accounts/{account_id}/withdraw")
async def withdraw_funds(account_id: str, payload: WithdrawRequest):
    # Notice: Zero try/except boilerplate needed in the route handler
    remaining = service.withdraw(account_id=account_id, amount=payload.amount)
    return {
        "success": True,
        "data": {"account_id": account_id, "remaining_balance": remaining},
    }


@app.get("/unhandled-bug")
async def trigger_server_bug():
    # Simulates an unhandled zero division or unhandled library crash
    result = 100 / 0
    return {"result": result}


## 5. The Interview Questions — All of Them, Done Properly

**Q: How does FastAPI's exception handling mechanism work internally under the hood?**

FastAPI builds upon Starlette's ASGI routing and middleware stack. When a request executes, route handlers and dependency functions run inside a call stack monitored by Starlette's `ExceptionMiddleware`. 

If any function in that path raises an exception, the exception bubbles up to `ExceptionMiddleware`. The middleware inspects its internal handler registry, which maps Python classes to async callable handlers. It performs a type lookup matching the exception against registered types using Python's Method Resolution Order (MRO). 

If a specific custom handler like `@app.exception_handler(EntityNotFoundException)` is registered, it executes and returns an ASGI `Response`. If no specific type matches, it checks parent classes until it matches `@app.exception_handler(AppException)` or the fallback `@app.exception_handler(Exception)`. 

If an exception escapes `ExceptionMiddleware` without any matching handler (or if an error happens in an outer middleware before reaching routing), the outermost `ServerErrorMiddleware` catches it and emits a default 500 response.

**Q: Why is raising `HTTPException` inside service or repository layers considered an anti-pattern?**

Raising `HTTPException` directly in domain services or data access repositories violates the Separation of Concerns and Clean Architecture principles. It couples your business layer to the HTTP transport protocol. 

If your application needs to execute the same business logic from an asynchronous message queue consumer (e.g. Celery, RabbitMQ, ARQ), a scheduled cron job, a WebSocket handler, or a CLI command, concepts like HTTP status codes (`404`, `422`) and HTTP headers are completely meaningless and out of place.

Instead, service layers should raise pure, transport-agnostic domain exceptions (`EntityNotFoundException`, `InsufficientFundsException`). The API presentation layer (FastAPI route handlers and registered exception handlers) acts as an adapter, catching those domain exceptions and translating them into HTTP status codes, headers, and formatted JSON response bodies.

**Q: Why do you need to register handlers for both `RequestValidationError` and `StarletteHTTPException` when standardizing error responses?**

FastAPI provides pre-configured default exception handlers for two critical built-in classes: `fastapi.exceptions.RequestValidationError` (which triggers when incoming query parameters, path params, or request bodies fail Pydantic schema validation) and `starlette.exceptions.HTTPException` (which triggers on built-in routing failures like 404 Route Not Found or 405 Method Not Allowed).

By default, these built-in handlers return responses in a specific format like `{"detail": [...]}`. If your application defines a standard company-wide error envelope (e.g. `{"success": false, "error": {"code": "...", "message": "..."}}`), client applications will fail whenever a 404 or 422 occurs because the payload structure differs from your custom error format. 

Registering explicit handlers for both `RequestValidationError` and `StarletteHTTPException` overrides FastAPI's defaults, ensuring that every single response emitted by your server adheres to your unified error contract.

**Q: How do you implement end-to-end request tracing / correlation IDs with global exception handlers across distributed systems?**

Correlation tracing requires three coordinated steps:

1. **Middleware Generation & Propagation:** An early HTTP middleware checks incoming request headers for `X-Request-ID` (or `traceparent` for W3C distributed tracing). If absent, it generates a fresh UUID. It stores this ID in `request.state.request_id` and sets it on the outgoing response headers.
2. **Contextual Logging in Handlers:** When an unhandled error occurs, the global exception handler reads `request.state.request_id` and logs the failure using structured logging (`logger.error("Unhandled error", exc_info=True, extra={"request_id": request_id})`). If you use distributed tracing libraries like OpenTelemetry, you also record the exception on the active span.
3. **Client Error Masking:** The global error handler returns a generic 500 JSON response containing the exact `request_id`. When users encounter an issue, customer support collects this `request_id`. Engineers search the centralized logging system (Datadog, Elastic, Loki) with that ID to instantly locate the full traceback and request parameters.

**Q: What is the architectural difference between Starlette's `ServerErrorMiddleware` and FastAPI's `@app.exception_handler(Exception)`?**

The difference lies in where they sit in the ASGI middleware pipeline.

`ExceptionMiddleware` (where `@app.exception_handler` handlers live) sits *inside* the routing layer. It intercepts exceptions raised by route endpoints, dependencies, and sub-routers, converting them into responses while allowing outer middlewares to still inspect the resulting `Response` object.

`ServerErrorMiddleware` sits at the outermost boundary of the ASGI application. It is the absolute last line of defense. It catches exceptions that occur *outside* the routing layer — for instance, if a custom middleware running before `ExceptionMiddleware` throws an unhandled error. 

If you register `@app.exception_handler(Exception)`, it handles exceptions that bubble out of routes and dependencies within `ExceptionMiddleware`. However, if an exception is raised inside an outer middleware during request preprocessing, `@app.exception_handler(Exception)` will not catch it; it will bubble up to `ServerErrorMiddleware`.

**Q: How do you ensure database transactions rollback and connection pools do not leak when an endpoint raises an unhandled exception?**

FastAPI's dependency injection system uses Python context managers (`yield` dependencies) to manage resource lifecycles.

When you inject a database session via a dependency like:

```python
async def get_db():
    session = AsyncSessionLocal()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
```

If a route or service raises an unhandled exception, execution immediately halts in the route and jumps to the `except Exception:` block of the dependency. The dependency executes `session.rollback()`, cleans up the transaction, and re-raises the exception in its `finally:` block to release the connection back to the connection pool. The re-raised exception then bubbles up to `ExceptionMiddleware` and is caught by your global exception handler.

**Q: What happens if an exception is raised inside a custom exception handler itself?**

If your custom exception handler encounters an error while executing (for example, attempting to format a missing dictionary key or failing to connect to a logging database), Python raises a secondary unhandled exception.

Because `ExceptionMiddleware` is already in the middle of handling an error, it cannot re-enter its own handler dictionary. The secondary exception immediately escapes `ExceptionMiddleware` and bubbles straight to the top-level `ServerErrorMiddleware`. 

`ServerErrorMiddleware` logs a critical fallback error and returns a default, unformatted 500 response. For this reason, exception handlers must be kept completely defensive, minimal, and free of risky external I/O or unvalidated assumptions.

## 6. The Traps — What Goes Wrong

**Trap 1: Swallowing Exceptions or Catching `Exception` in Route Handlers**

- *The Wrong Assumption:* Developers write `try...except Exception as e:` inside route handlers and return `JSONResponse(status_code=500, content={"error": str(e)})` to "handle errors safely".
- *Why It Fails:* This breaks your centralized architecture. It bypasses global logging, duplicates error-envelope formatting in dozens of files, prevents dependencies from running their rollback cleanup blocks, and leaks raw internal error strings (`str(e)`) to the client.
- *The Fix:* Let exceptions bubble naturally out of the route handler. Trust the global exception handler to catch, log, and format them.

**Trap 2: Leaking Database Schemas and Stack Traces in Production**

- *The Wrong Assumption:* Returning `str(exc)` or `traceback.format_exc()` in error responses to help frontend developers debug issues during development, and forgetting to disable it in production.
- *Why It Fails:* In production, a database constraint failure or failed connection string might output `psycopg2.errors.UniqueViolation: Key (email)=(admin@corp.com) already exists` or include internal server hostnames and passwords.
- *The Fix:* In global 500 handlers, log the full traceback internally, but return only a safe, generic message (`"An unexpected error occurred"`) alongside a `request_id`. Use environment configuration (`settings.DEBUG`) if you wish to attach debug traces strictly in local development environments.

**Trap 3: Catching `fastapi.HTTPException` Instead of `starlette.exceptions.HTTPException` for Default Routing Errors**

- *The Wrong Assumption:* A developer registers `@app.exception_handler(fastapi.HTTPException)` thinking it will catch all HTTP errors including 404 Not Found and 405 Method Not Allowed.
- *Why It Fails:* When FastAPI's internal router fails to match a route, Starlette raises `starlette.exceptions.HTTPException`. Because `fastapi.HTTPException` inherits from `starlette.exceptions.HTTPException` (and not vice-versa), registering a handler only for `fastapi.HTTPException` misses Starlette's built-in 404 and 405 errors, causing them to slip into the default Starlette format.
- *The Fix:* Always register your HTTP exception handler against `starlette.exceptions.HTTPException` (or `StarletteHTTPException`). Because `fastapi.HTTPException` is a subclass, the Starlette handler catches both.

**Trap 4: Generating Request IDs Inside the Error Handler Instead of Early in ASGI Middleware**

- *The Wrong Assumption:* Generating `request_id = str(uuid.uuid4())` directly inside the exception handler when an error occurs.
- *Why It Fails:* All logs generated before the exception occurred (e.g. authentication checks, database query logs, request entry logs) will lack that `request_id`. You cannot correlate the error with the events that led up to it.
- *The Fix:* Generate the `request_id` in an HTTP middleware at the very beginning of the request lifecycle, store it on `request.state.request_id`, and reference that existing ID inside all exception handlers.

**Trap 5: Raising Exceptions Inside Custom Exception Handlers (Secondary Crashes)**

- *The Wrong Assumption:* Performing complex database logging or unsafe dictionary lookups inside an exception handler without defensive guards.
- *Why It Fails:* If the database is down, the exception handler itself crashes while trying to log to the database. This escapes `ExceptionMiddleware` and results in an ugly ASGI server crash.
- *The Fix:* Keep exception handlers pure, lightweight, and defensive. Use standard in-memory formatting and local loggers (which ship logs asynchronously via background agents). Never perform un-guarded risky I/O inside an exception handler.

**Trap 6: Assuming Exception Handlers Catch Failures in Outer Middleware Layers**

- *The Wrong Assumption:* Assuming `@app.exception_handler(Exception)` will catch crashes that occur inside custom ASGI middlewares.
- *Why It Fails:* Middlewares declared before `ExceptionMiddleware` execute before the exception handler registry is reached. If an outer middleware crashes, the exception bubbles directly to `ServerErrorMiddleware`, bypassing your custom JSON envelope.
- *The Fix:* Ensure custom middlewares have their own internal `try...except` safety blocks if they perform custom pre-processing before invoking `call_next(request)`.

## 7. Compare With Related Concepts

| Concept | Scope & Layer | Primary Purpose | When to Use |
| :--- | :--- | :--- | :--- |
| **Global Exception Handler** (`@app.exception_handler`) | Framework Routing Layer (`ExceptionMiddleware`) | Intercepts raised domain exceptions and unhandled errors; converts them to standardized HTTP JSON responses with logging. | **Always.** Use as the central presentation adapter for domain exceptions and the ultimate catch-all 500 safety net. |
| **Route-level `try...except`** | Endpoint Function | Catches specific local errors that can be immediately recovered or safely ignored within that single route. | **Rarely.** Only when a local failure has an immediate, route-specific fallback (e.g. attempting a cache read and falling back to database). |
| **FastAPI `HTTPException`** | Presentation / API Layer | Raises an immediate HTTP status code and message from within route handlers or API dependencies. | Use in simple APIs or route-level guards where domain layer abstraction is not required. Avoid in pure service layers. |
| **Custom Domain Exceptions** (`AppException`) | Domain / Service Layer | Expresses business rule violations and entity state failures in pure Python without HTTP knowledge. | **Always in production systems.** Use in service layers, repositories, and domain models to signal business failures. |
| **Starlette `ServerErrorMiddleware`** | Outer ASGI Boundary | Low-level ASGI fallback that catches any uncaught exception escaping the entire application stack. | Configured automatically by FastAPI/Starlette. Used to render raw 500 pages or developer debug screens (`debug=True`). |
| **ASGI Error Catching Middleware** | Outer Middleware Pipeline | Wraps `call_next()` in a `try...except` block across all incoming HTTP requests. | Use when you need to catch errors originating inside other middleware layers before request reaches FastAPI routing. |

## 8. 🧠 The Memory Hook

> **Domain exceptions are clean signals; global handlers are the airport baggage claim tag.**
> 
> Pure service layers raise transport-free domain exceptions (`EntityNotFoundException`, `InsufficientFundsException`). The global exception handler catches them at the border, prints a sanitized tracking ticket (`request_id`) for the passenger, and writes the full unredacted diagnostic black-box record to internal server logs.
