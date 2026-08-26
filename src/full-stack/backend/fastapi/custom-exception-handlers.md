# Custom Exception Handlers in FastAPI: `HTTPException`, Domain Exceptions, and Standard Error Envelopes

## 1. Why This Exists — The Problem First

When engineering teams scale a FastAPI backend, a messy pattern quickly emerges: developers start sprinkling `raise HTTPException(status_code=404, detail="User not found")` and `raise HTTPException(status_code=400, detail="Insufficient funds")` deep inside database repositories, business logic classes, and payment services.

This creates severe architectural coupling. Your core domain logic now depends directly on the HTTP transport layer. If you later invoke that payment logic from a background Celery worker, a CLI script, or a Kafka event consumer, you are stuck dealing with HTTP status codes in non-HTTP environments.

Worse, when unhandled exceptions occur—like an unexpected database constraint failure or a third-party gateway timeout—FastAPI defaults to returning an unformatted `500 Internal Server Error` or leaking raw database schema details in debug mode. Meanwhile, frontend applications have to parse three completely different error formats: Pydantic validation errors (`{"detail": [...]}`), raw `HTTPException` responses (`{"detail": "..."}`), and unhandled server crashes.

Custom exception handlers solve this by creating a clean boundary at the edge of your API. Business services raise pure, transport-agnostic Python domain exceptions, and centralized handlers translate them into predictable, machine-readable JSON error envelopes with tracking IDs.

## 2. The Analogy — Make It Obvious

Think of your backend as an international manufacturing warehouse:

- **The Assembly Floor (Domain & Service Layer):** The factory workers only care about internal mechanics: "Part out of stock", "Machine calibration failed", "Material defective". They do not speak foreign languages or deal with customs laws. If something breaks, they attach an internal red incident tag (`DomainException`) describing the exact component and issue.
- **The Factory Gate & Customs Office (`FastAPI Exception Handlers`):** Located at the perimeter of the factory. The customs officer intercepts any incident tag leaving the floor, determines the appropriate international trade code (`HTTP 404`, `HTTP 402`, `HTTP 409`), and seals it inside a standardized shipping container (`Unified JSON Error Envelope`) complete with a stamped customs tracking number (`Request ID`).
- **The Outside Courier (The Client / Frontend):** The courier never sees internal factory jargon or raw hazardous spill debris (`Internal Tracebacks`). Every package received at the gate adheres to the exact same standardized label format regardless of which factory machine failed.

If a vendor's external forklift breaks inside the plant (a third-party library error like SQLAlchemy `IntegrityError`), the customs officer intercepts the mechanical failure, files an internal incident report for the engineering team, and hands the courier a polite, sanitized delivery delay notification.

## 3. How It Actually Works — The Full Explanation

FastAPI's error handling infrastructure runs on top of Starlette's exception middleware. When an exception occurs during the lifecycle of a request—whether inside a route handler, a dependency, or payload validation—the framework catches it and traverses the registered exception handlers using Python's method resolution order (MRO) to find the most specific match.

The Decoupling Pattern: Domain Exceptions

Instead of importing `fastapi.HTTPException` into your service layers, define pure Python exceptions that represent business rules:

```python
class DomainError(Exception):
    """Base exception for all domain business errors."""
    def __init__(self, message: str, code: str = "DOMAIN_ERROR", details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}

class PaymentDeclinedError(DomainError):
    def __init__(self, reason: str, card_last4: str):
        super().__init__(
            message=f"Payment declined: {reason}",
            code="PAYMENT_DECLINED",
            details={"reason": reason, "card_last4": card_last4},
        )
```

Your service functions raise `PaymentDeclinedError` without knowing whether the request originated from an HTTP POST route, a GraphQL query, or a queue worker. A dedicated FastAPI exception handler registered at the application level catches `DomainError` and translates it into an HTTP response.

`fastapi.HTTPException` vs `starlette.exceptions.HTTPException`

FastAPI provides its own `HTTPException` class (`from fastapi import HTTPException`), which is a direct subclass of Starlette's `HTTPException` (`from starlette.exceptions import HTTPException`).

The critical difference lies in headers and default handling:
- `starlette.exceptions.HTTPException` takes only `status_code` and `detail`.
- `fastapi.HTTPException` extends Starlette's class by adding an optional `headers` dictionary argument. This is essential for HTTP specifications that require custom response headers on failure, such as returning `WWW-Authenticate` on `401 Unauthorized` or `Retry-After` on `429 Too Many Requests`.
- FastAPI registers a default exception handler specifically for its own `fastapi.HTTPException` that ensures those custom headers are attached to the outgoing `JSONResponse`. If you raise Starlette's raw `HTTPException` without headers, it still works, but you bypass FastAPI's header injection.

Standard Error Envelopes

In production APIs, every failure response should follow a predictable schema so client applications can handle errors systematically without defensive parsing. A standard error envelope contains:

1. `code`: A machine-readable string identifier (e.g., `ORDER_ALREADY_PAID`, `VALIDATION_FAILED`) allowing frontend code to trigger localized UI states.
2. `message`: A human-readable description explaining what went wrong.
3. `details`: Structured context such as invalid field paths or resource IDs.
4. `timestamp`: ISO-8601 UTC timestamp of when the failure occurred.
5. `request_id`: A unique correlation ID matching the server logs for end-to-end tracing.

```json
{
  "error": {
    "code": "PAYMENT_DECLINED",
    "message": "Payment declined: Card expired",
    "details": {
      "reason": "Card expired",
      "card_last4": "4242"
    },
    "timestamp": "2026-08-26T16:35:00Z",
    "request_id": "req_01j6k8m2p9v4b7n1"
  }
}
```

Intercepting Third-Party & Infrastructure Exceptions

Exceptions from database drivers (e.g., SQLAlchemy's `IntegrityError`), external SDKs, or cloud services must never leak unformatted to clients. Registering exception handlers for these external exception classes allows you to map database constraint violations directly to `409 Conflict` status codes while preventing database schema details from leaking.

Catch-All Exception Fallback

A top-level handler for Python's base `Exception` ensures that unexpected crashes (e.g., `ZeroDivisionError`, `AttributeError`) are logged with full stack traces internally alongside the `request_id`, while the client receives a clean, non-leaking `500 Internal Server Error` envelope.

## 4. Real Code — See It Working

Here is a complete, production-grade implementation showing domain exception decoupling, custom error envelopes, validation overrides, and third-party error mapping.

```python
from datetime import datetime, timezone
from typing import Any
import uuid
import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("api.errors")

# ---------------------------------------------------------
# 1. Standard Error Envelope Response Builder
# ---------------------------------------------------------
def create_error_response(
    status_code: int,
    code: str,
    message: str,
    request: Request,
    details: Any | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """Builds a consistent, structured JSON error response across all routes."""
    # Retrieve request correlation ID attached by middleware
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

    envelope = {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "request_id": request_id,
        }
    }
    return JSONResponse(
        status_code=status_code,
        content=envelope,
        headers=headers,
    )


# ---------------------------------------------------------
# 2. Pure Domain Exceptions (No HTTP knowledge)
# ---------------------------------------------------------
class DomainError(Exception):
    """Base domain exception raised inside business logic services."""
    def __init__(self, message: str, code: str = "DOMAIN_ERROR", details: Any | None = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details


class EntityNotFoundError(DomainError):
    def __init__(self, entity_name: str, entity_id: str):
        super().__init__(
            message=f"{entity_name} with id '{entity_id}' was not found.",
            code=f"{entity_name.upper()}_NOT_FOUND",
            details={"entity": entity_name, "id": entity_id},
        )


class PaymentDeclinedError(DomainError):
    def __init__(self, reason: str, card_last4: str):
        super().__init__(
            message=f"Payment declined: {reason}",
            code="PAYMENT_DECLINED",
            details={"reason": reason, "card_last4": card_last4},
        )


class DuplicateResourceError(DomainError):
    def __init__(self, resource: str, field: str, value: str):
        super().__init__(
            message=f"{resource} with {field} '{value}' already exists.",
            code="DUPLICATE_RESOURCE",
            details={"resource": resource, "field": field, "value": value},
        )


# Simulated third-party exception (e.g. from an ORM or external SDK)
class MockDatabaseIntegrityError(Exception):
    def __init__(self, raw_db_error: str):
        super().__init__(raw_db_error)
        self.raw_db_error = raw_db_error


# ---------------------------------------------------------
# 3. FastAPI App & Exception Handler Registrations
# ---------------------------------------------------------
app = FastAPI(title="Checkout API")


@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    """Ensures every incoming request has a traceable correlation ID."""
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


# Handler 1: Translate all Domain Exceptions to appropriate HTTP codes
@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    # Map domain subclasses to standard HTTP status codes
    status_mapping = {
        EntityNotFoundError: status.HTTP_404_NOT_FOUND,
        PaymentDeclinedError: status.HTTP_402_PAYMENT_REQUIRED,
        DuplicateResourceError: status.HTTP_409_CONFLICT,
    }
    http_status = status_mapping.get(type(exc), status.HTTP_400_BAD_REQUEST)

    return create_error_response(
        status_code=http_status,
        code=exc.code,
        message=exc.message,
        request=request,
        details=exc.details,
    )


# Handler 2: Override FastAPI's RequestValidationError (Pydantic 422 errors)
@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Transform raw Pydantic error list into clean, client-friendly error items
    formatted_errors = [
        {
            "field": ".".join(str(loc) for loc in err["loc"] if loc != "body"),
            "issue": err["msg"],
            "type": err["type"],
        }
        for err in exc.errors()
    ]
    return create_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        code="VALIDATION_FAILED",
        message="The request payload failed validation.",
        request=request,
        details=formatted_errors,
    )


# Handler 3: Intercept Third-Party Database Errors (Sanitize internal schema)
@app.exception_handler(MockDatabaseIntegrityError)
async def database_integrity_handler(
    request: Request, exc: MockDatabaseIntegrityError
) -> JSONResponse:
    # Log raw database constraint details internally for engineers
    logger.warning("DB Constraint violation on request %s: %s", request.state.request_id, exc)

    # Return a safe, sanitized conflict response without exposing table/column names
    return create_error_response(
        status_code=status.HTTP_409_CONFLICT,
        code="RESOURCE_CONFLICT",
        message="A resource with the provided unique identifier already exists.",
        request=request,
    )


# Handler 4: Catch-All for Unhandled Server Errors (500)
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Capture complete traceback internally with the request correlation ID
    logger.error("Unhandled crash on request %s: %s", request.state.request_id, exc, exc_info=True)

    return create_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected server error occurred. Please contact support.",
        request=request,
    )


# ---------------------------------------------------------
# 4. Service Layer & Router Implementation
# ---------------------------------------------------------
class CheckoutPayload(BaseModel):
    order_id: str = Field(min_length=3)
    amount: float = Field(gt=0)
    card_number: str = Field(min_length=16, max_length=16)


class PaymentProcessingService:
    """Pure domain service: completely decoupled from web frameworks."""

    def execute_payment(self, order_id: str, amount: float, card_number: str) -> dict:
        if order_id == "ord_missing":
            raise EntityNotFoundError(entity_name="Order", entity_id=order_id)

        if card_number.endswith("0000"):
            raise PaymentDeclinedError(reason="Card expired", card_last4="0000")

        if order_id == "ord_duplicate":
            # Simulate a database unique constraint collision
            raise MockDatabaseIntegrityError("unique_order_key violation on table 'orders'")

        return {"transaction_id": "txn_987123", "status": "COMPLETED", "amount": amount}


payment_service = PaymentProcessingService()


@app.post("/orders/checkout", status_code=status.HTTP_200_OK)
async def checkout_endpoint(payload: CheckoutPayload):
    # Route handler remains thin: simply forwards to the domain service
    result = payment_service.execute_payment(
        order_id=payload.order_id,
        amount=payload.amount,
        card_number=payload.card_number,
    )
    return {"data": result}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the technical difference between `fastapi.HTTPException` and `starlette.exceptions.HTTPException`?**

`fastapi.HTTPException` is a direct subclass of `starlette.exceptions.HTTPException`. The primary difference is that FastAPI's subclass accepts an optional `headers: dict[str, str] | None = None` argument in its constructor, whereas Starlette's version only accepts `status_code` and `detail`.

FastAPI registers a default exception handler for `fastapi.HTTPException` that extracts `exc.headers` and applies them to the outgoing `JSONResponse`. This is essential for HTTP status codes that require specific response headers by RFC specifications, such as providing `WWW-Authenticate: Bearer` on a `401 Unauthorized` response or `Retry-After: 60` on a `429 Too Many Requests` response. If you raise Starlette's `HTTPException` instead, those custom headers cannot be passed through the exception constructor.

**Q: Why should service layers raise Domain Exceptions instead of `HTTPException`?**

Raising `HTTPException` directly inside business logic couples your domain layer to HTTP transport semantics. This violates clean architecture and hexagonal architecture principles.

When your service layer raises pure domain exceptions (such as `OrderNotFoundError` or `InsufficientBalanceError`):
1. **Transport Agnostic:** The exact same service function can be invoked by HTTP route handlers, background worker queues (Celery/ARQ), CLI commands, WebSockets, or gRPC endpoints without handling irrelevant HTTP concepts.
2. **Simplified Testing:** Unit tests for business logic do not need to inspect HTTP status codes or parse JSON response payloads—they assert domain exception types and attributes directly.
3. **Centralized Protocol Translation:** The web boundary (FastAPI exception handlers) maintains sole responsibility for deciding whether an `InsufficientBalanceError` maps to HTTP `402 Payment Required` or `400 Bad Request`.

**Q: How does FastAPI determine handler precedence when multiple exception handlers match an exception class hierarchy?**

FastAPI relies on Python's class inheritance hierarchy and Method Resolution Order (MRO) when routing caught exceptions to registered handlers.

When an exception occurs, FastAPI checks the registered handlers in order from most specific to least specific:
1. Exact match on the raised exception class (e.g., `@app.exception_handler(PaymentDeclinedError)`).
2. Direct parent class matches in the inheritance chain (e.g., `@app.exception_handler(DomainError)`).
3. Base classes higher in the hierarchy (e.g., `@app.exception_handler(Exception)`).

The most specific registered handler always wins. If an exception matches both a registered `DomainError` handler and a registered catch-all `Exception` handler, FastAPI executes the `DomainError` handler.

**Q: How do you handle unhandled 500 errors and database exceptions without leaking sensitive infrastructure details?**

By registering a global fallback handler for Python's base `Exception` and specific handlers for database driver errors (like SQLAlchemy `IntegrityError` or `DBAPIError`).

To prevent security leaks while maintaining observability:
1. Generate or extract a unique correlation ID (`request_id`) for every request via middleware.
2. Inside the exception handler, log the full exception stack trace, request parameters, and `request_id` to an internal logging aggregator (e.g., Datadog, Sentry, CloudWatch).
3. Return a generic, sanitized JSON envelope to the client containing only the `request_id`, a high-level error code (`INTERNAL_SERVER_ERROR`), and a generic message. Never pass raw `str(exc)` from database or system errors to the client response, as this exposes table schemas, foreign key names, and SQL queries.

**Q: How do you override FastAPI's default 422 `RequestValidationError` handler to enforce a company-wide error envelope?**

FastAPI automatically raises `fastapi.exceptions.RequestValidationError` whenever request bodies, query params, path variables, or headers fail Pydantic validation. By default, it returns a 422 status code with a raw `{"detail": [...]}` list.

To standardize this into your team's error envelope, register a custom handler for `RequestValidationError`:
```python
@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    errors = [
        {
            "field": ".".join(str(loc) for loc in err["loc"] if loc != "body"),
            "message": err["msg"],
            "type": err["type"],
        }
        for err in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Invalid request payload",
                "details": errors,
                "request_id": getattr(request.state, "request_id", "unknown"),
            }
        },
    )
```

## 6. The Traps — What Goes Wrong

### Trap 1: Returning a raw dictionary or string instead of a `Response` object
- **Wrong Assumption:** Developers assume exception handlers work like route functions, where FastAPI automatically serializes returned dicts into JSON.
- **What Actually Happens:** FastAPI's exception middleware requires exception handlers to return an actual Starlette `Response` instance (such as `JSONResponse` or `Response`). Returning a raw dict `return {"error": "failed"}` causes Starlette to raise an internal server error or fail ASGI protocol compliance.
- **The Fix:** Always return an explicit `JSONResponse(status_code=..., content=...)`.

### Trap 2: Catching `Exception` inside service methods and swallowing domain errors
- **Wrong Assumption:** Wrapping entire service functions in `try ... except Exception:` blocks to prevent crashes.
- **What Actually Happens:** Blanket exception blocks catch custom domain exceptions before they can bubble up to registered FastAPI exception handlers. If the service catches a `PaymentDeclinedError` and re-raises a generic `HTTPException(500)` or returns `None`, the application loses granular error codes, breaks database transaction rollbacks, and destroys debugging context.
- **The Fix:** Let domain exceptions bubble up untouched to the API boundary. Use `try...except` in services only when performing specific recovery actions or translating low-level driver errors into domain exceptions.

### Trap 3: Exposing internal driver details in error responses
- **Wrong Assumption:** Passing `str(exc)` into the error envelope `message` field makes frontend debugging easier.
- **What Actually Happens:** When a database constraint fails, `str(exc)` contains table names, column constraints, and SQL statements. Exposing this information in production creates a security vulnerability by giving attackers a direct blueprint of your database schema.
- **The Fix:** Log raw error details internally with the `request_id`, and send a clean, generalized message (e.g., `A record with this email already exists`) to the client.

### Trap 4: Assuming exception handlers catch errors inside custom ASGI middleware
- **Wrong Assumption:** Registering `@app.exception_handler(Exception)` will catch every possible crash in the entire application stack.
- **What Actually Happens:** Starlette's `ExceptionMiddleware` sits *inside* the middleware stack, directly wrapping the routing and endpoint pipeline. If a custom ASGI middleware executed before `ExceptionMiddleware` raises an unhandled exception, it bypasses your FastAPI exception handlers completely and causes Uvicorn to return an unformatted 500 error.
- **The Fix:** Wrap critical custom middleware code in internal `try...except` blocks and construct a direct `JSONResponse` if an error occurs at the outer middleware layer.

## 7. Compare With Related Concepts

### FastAPI Exception Handlers vs. Global HTTP Middleware
- **The Difference:** Exception handlers are declarative functions triggered when specific exception types bubble up through the request lifecycle, using class inheritance (MRO) to match the handler. Middleware is a pipeline layer that wraps every incoming HTTP request and outgoing response uniformly (for headers, CORS, timing, and session management) before routing takes place.
- **When to Use Which:** Use Exception Handlers for mapping business errors, domain exceptions, and validation failures into structured HTTP responses. Use Middleware for cross-cutting transport operations like correlation ID injection, security headers, and request logging.

### `fastapi.HTTPException` vs. Domain Exceptions + Exception Handlers
- **The Difference:** `HTTPException` is an HTTP-aware shortcut raised directly in route functions or FastAPI dependencies to abort request processing with a specific status code. Domain Exceptions are transport-agnostic Python classes (`class UserInactiveError(Exception)`) raised inside service layers with zero knowledge of HTTP.
- **When to Use Which:** Use `HTTPException` only for shallow, transport-specific edge checks (e.g., verifying an API key in a route dependency). Use Domain Exceptions + registered handlers for all core business logic, database transactions, and multi-step workflows.

### `RequestValidationError` vs. Pydantic `ValidationError`
- **The Difference:** `RequestValidationError` is a FastAPI-specific wrapper exception raised when incoming client data (query parameters, path variables, request bodies) violates Pydantic schema validation during request parsing. Pydantic's standard `ValidationError` is raised when validating models internally within Python code (e.g., response serialization or domain model instantiation).
- **When to Use Which:** FastAPI automatically catches `RequestValidationError` and routes it to 422 handlers. An uncaught internal `ValidationError` represents a server-side bug (such as an endpoint returning data that fails its own response model) and correctly triggers a 500 handler.

## 8. 🧠 The Memory Hook

**Raise pure domain errors in the engine room; let registered customs officers at the API gate stamp them into standardized, traceable HTTP envelopes.**
