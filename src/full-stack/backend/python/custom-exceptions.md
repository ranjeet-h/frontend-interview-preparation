# Designing Custom Exceptions in Python: Exception Hierarchies, Chaining (`from`), and Domain Modeling

## 1. Why This Exists — The Problem First

Imagine your checkout microservice fails midway through processing an order. The API handler catches a generic `ValueError("Payment failed: insufficient funds")` raised deep inside the banking integration client. Because the original developer used `ValueError` for every possible problem—invalid credit card numbers, insufficient account balances, network socket timeouts, and unsupported currencies—the only way your API handler can determine what went wrong is by scraping error strings: `if "insufficient funds" in str(e): return 402`. Two weeks later, another developer cleans up the payment client and rewords the message to `"Account balance is too low"`. The string match silently fails, and your checkout endpoint suddenly starts returning generic `500 Internal Server Error` responses to paying customers.

Worse, suppose that same developer caught an internal `psycopg2.OperationalError: connection timed out` inside the database repository and re-raised it as `raise PaymentProcessingError("Order processing failed")` without chaining. In production, your error monitoring platform (Sentry or Datadog) registers a vague `PaymentProcessingError`, but the original database traceback and socket metadata have been completely destroyed. Your on-call engineering team spends four hours debugging payment gateway logic before discovering that the database connection pool was simply exhausted.

Generic exceptions force calling code into fragile string scraping, while unchained re-raises destroy forensic debugging evidence. Custom exceptions, structured domain hierarchies, and explicit exception chaining (`raise ... from ...`) exist to establish typed, machine-readable contracts between error producers and error consumers without blinding your production observability tools.

## 2. The Analogy — Make It Obvious

Think of how a modern hospital manages emergency medical incidents and patient charts.

If a triage nurse rushed into the main hallway simply yelling "Something went wrong!" (raising a generic `Exception`), the hospital would grind to a halt. Nobody knows whether a patient suffered cardiac arrest, a medication vial was dropped, or the printer ran out of label paper.

Instead, hospitals use a strictly categorized incident classification system:
1. **The Root Category:** "Clinical Incident" (`AppError`).
2. **The Department Category:** "Cardiology Complication" (`CardiologyError`) versus "Pharmacy Dispatch Failure" (`PharmacyError`).
3. **The Specific Leaf Issue:** "Acute Arrhythmia" (`ArrhythmiaError`) or "Medication Dosage Mismatch" (`DosageMismatchError`).

When a monitoring sensor detects irregular heart rhythm, the nurse files an "Acute Arrhythmia" incident. A cardiology specialist catches that specific `ArrhythmiaError` immediately to administer medication. Meanwhile, hospital management catches all general `ClinicalIncident` reports at the end of the month to generate compliance audit dashboards.

Now consider the incident paper trail:
- **Explicit Chaining (`from`):** If a defibrillator battery fails and directly causes a cardiac emergency, the medical chart states: *"Cardiac arrest occurred BECAUSE OF defibrillator power failure"* (`raise CardiacArrestError from BatteryFailureError`). The technician staples the raw battery diagnostic report directly behind the cardiac arrest incident sheet. When medical investigators review the case, the complete forensic chain of causality is intact.
- **Suppressed Chaining (`from None`):** When the hospital generates a patient-facing bill or insurance claim, they do not attach the internal wiring schematics of the broken defibrillator. They translate the internal mechanical incident into a clean, sanitized billing statement and redact internal technical diagnostics (`raise BillingAdjustmentError from None`).

## 3. How It Actually Works — The Full Explanation

Python treats exceptions as first-class objects organized into an inheritance tree. When an error occurs, Python unwinds the call stack until it finds an `except` block whose target type matches the raised instance.

**The Exception Hierarchy: Why `BaseException` Is Forbidden for App Code**

At the very top of Python's runtime hierarchy sits `BaseException`. Directly inheriting from `BaseException` are only four built-in classes:
1. `SystemExit`: Raised by `sys.exit()` to terminate the Python process cleanly.
2. `KeyboardInterrupt`: Raised when a user or orchestration tool sends a SIGINT (Ctrl+C).
3. `GeneratorExit`: Raised inside generators and coroutines when their `close()` method is called.
4. `Exception`: The base class for all non-exit, application-level errors.

Every custom exception you ever write must inherit from `Exception` (or one of its subclasses), **never** directly from `BaseException`. If you subclass `BaseException` for application errors, broad exception handlers or domain-level catches will accidentally intercept `KeyboardInterrupt` and `SystemExit`. This makes your Python service immune to SIGINT/SIGTERM termination in Docker or Kubernetes, prevents clean shutdowns, and breaks coroutine lifecycle management in `asyncio` (since Python 3.8+, `asyncio.CancelledError` inherits directly from `BaseException` to prevent accidental swallowing by `except Exception:`).

**Exception Matching Mechanics: `isinstance` Semantics**

When Python executes a `try...except TargetError as e:` block, it checks whether the raised exception instance is an instance of `TargetError` using standard inheritance rules (`isinstance(raised_instance, TargetError)`).
Python evaluates `except` clauses strictly from top to bottom and halts execution at the first matching clause. If a broad parent class is placed before a specific child class in the `except` chain, the parent intercepts the exception every time, rendering the child handler dead code.

**Designing Domain Exception Taxonomies**

In scalable backend systems, exceptions should be structured like an inverted pyramid with three distinct layers:
- **Tier 1 — Root Application Exception (`AppError(Exception)`):** The single root for your entire application or library. Top-level API middleware can catch `AppError` to ensure any known, handled application failure is cleanly converted to an error response, while unhandled programming bugs (`TypeError`, `AttributeError`, `ZeroDivisionError`) bubble up to trigger 500 alerts.
- **Tier 2 — Architectural Subdomains (`DomainError`, `InfrastructureError`, `AuthError`):** Intermediate base classes that group failures by architectural concern. Business logic rules inherit from `DomainError` (mapping to HTTP 4xx), while external service timeouts, database disconnections, and disk errors inherit from `InfrastructureError` (mapping to HTTP 5xx).
- **Tier 3 — Specific Leaf Exceptions (`UserNotFoundError`, `InsufficientFundsError`, `PaymentGatewayTimeoutError`):** Concrete, actionable errors that provide exact semantic meaning and domain-specific attributes.

This structure allows different layers of your system to catch errors at the exact granularity they need. A payment retry worker catches `PaymentGatewayTimeoutError` to retry an HTTP request, a checkout coordinator catches `DomainError` to abort a saga, and a global web middleware catches `AppError` to format the final JSON response.

**Structured Exception Attributes and `super().__init__`**

Production exceptions should be data-rich. Instead of embedding IDs and numbers into raw strings that require regex parsing later, store them as first-class attributes on the exception instance (`error_code`, `entity_id`, `http_status`, `details`).

When overriding `__init__` in a custom exception, you must always call `super().__init__(message)`. Calling `super().__init__` initializes Python's internal `args` tuple on the base exception. This guarantees that `str(e)`, `repr(e)`, standard logging formatters, traceback generators, and APM SDKs (like Sentry) can automatically extract and display your error message without crashing.

**Exception Chaining Mechanics (PEP 3134)**

When moving across architectural boundaries (e.g., from an infrastructure repository to a domain service), low-level technical errors must often be converted into domain errors. Python manages the relationship between the original error and the new error using three mechanisms:

**1. Explicit Chaining (`raise NewError(...) from original_err`):**
Using `from original_err` sets the `__cause__` attribute on `NewError` to reference `original_err` and sets `__suppress_context__ = True`.
When an unhandled exception prints to the terminal or an APM tool records it, Python outputs:
`The above exception was the direct cause of the following exception:`
This preserves the full causal graph across layers: your logs clearly show that `CheckoutFailedError` was directly caused by `psycopg2.OperationalError: SSL connection dropped`.

**2. Implicit Chaining (`__context__`):**
If an exception is raised inside an `except` or `finally` block without using the `from` keyword, Python automatically sets the `__context__` attribute of the new exception to the active exception being handled.
Python outputs:
`During handling of the above exception, another exception occurred:`
This prevents original errors from being lost if an error handler itself crashes unexpectedly.

**3. Suppressing Chaining (`raise NewError(...) from None`):**
Writing `from None` sets `__cause__ = None` and sets `__suppress_context__ = True`.
Python suppresses the display of any previous exception context. Use this when converting internal, sensitive, or noisy low-level implementation details (such as raw cryptography errors, internal dictionary index misses, or regex syntax errors) into clean, public-facing domain exceptions.

## 4. Real Code — See It Working

Here is a complete, production-grade domain exception architecture for an e-commerce checkout service, demonstrating hierarchical categorization, structured machine-readable metadata, explicit chaining, suppression, and centralized API error dispatch.

```python
from typing import Any, Dict, Optional

# =====================================================================
# 1. THE ENTERPRISE EXCEPTION TAXONOMY
# =====================================================================

class AppError(Exception):
    """Root exception for all domain and infrastructure errors across the service."""
    def __init__(
        self,
        message: str,
        *,
        error_code: str = "INTERNAL_APP_ERROR",
        http_status: int = 500,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        # Crucial: pass message to super() so str(self) and args tuple are properly initialized
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.http_status = http_status
        self.details = details or {}

    def to_dict(self) -> Dict[str, Any]:
        """Serializes the error into a structured RFC-compliant JSON payload."""
        return {
            "error_code": self.error_code,
            "message": self.message,
            "details": self.details,
        }


class DomainError(AppError):
    """Base class for all business invariant violations (maps to HTTP 4xx)."""
    def __init__(
        self,
        message: str,
        *,
        error_code: str = "DOMAIN_RULE_VIOLATION",
        http_status: int = 400,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message, error_code=error_code, http_status=http_status, details=details)


class InsufficientFundsError(DomainError):
    """Raised when an account balance cannot cover a requested debit amount."""
    def __init__(self, account_id: str, required_amount: float, available_balance: float) -> None:
        super().__init__(
            message=f"Account '{account_id}' requires ${required_amount:.2f} but only has ${available_balance:.2f}.",
            error_code="INSUFFICIENT_FUNDS",
            http_status=402,
            details={
                "account_id": account_id,
                "required_amount": required_amount,
                "available_balance": available_balance,
            },
        )
        # Store individual attributes for direct programmatic access in callers
        self.account_id = account_id
        self.required_amount = required_amount
        self.available_balance = available_balance


class InfrastructureError(AppError):
    """Base class for third-party, network, and database failures (maps to HTTP 5xx)."""
    def __init__(
        self,
        message: str,
        *,
        error_code: str = "INFRASTRUCTURE_FAILURE",
        http_status: int = 503,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message, error_code=error_code, http_status=http_status, details=details)


class PaymentGatewayTimeoutError(InfrastructureError):
    """Raised when an external payment processor fails to respond within the SLA window."""
    def __init__(self, gateway_name: str, timeout_seconds: float) -> None:
        super().__init__(
            message=f"Payment gateway '{gateway_name}' timed out after {timeout_seconds}s.",
            error_code="PAYMENT_GATEWAY_TIMEOUT",
            http_status=504,
            details={"gateway": gateway_name, "timeout_seconds": timeout_seconds},
        )
        self.gateway_name = gateway_name
        self.timeout_seconds = timeout_seconds


class InvalidAuthTokenError(DomainError):
    """Raised when a client passes an unparseable, malformed, or forged security token."""
    def __init__(self) -> None:
        super().__init__(
            message="The provided authentication token is malformed or invalid.",
            error_code="INVALID_AUTH_TOKEN",
            http_status=401,
        )


# =====================================================================
# 2. LOW-LEVEL ADAPTERS & DRIVERS (DEMONSTRATING CHAINING & SUPPRESSION)
# =====================================================================

class RawSocketTimeoutError(Exception):
    """Simulates a low-level socket exception from an external SDK or C-extension."""
    pass


def call_stripe_gateway_sdk(amount: float) -> None:
    # Simulate a raw network-level socket failure deep inside a vendor library
    raise RawSocketTimeoutError("TCP connection reset by peer during TLS handshake on port 443")


def parse_jwt_segment(raw_token: str) -> str:
    # Low-level string splitting that might raise raw IndexErrors
    try:
        segments = raw_token.split(".")
        if len(segments) < 2:
            raise IndexError("Token segment missing")
        return segments[1]
    except IndexError:
        # Suppressed chaining: hide internal string parsing mechanics from public tracebacks
        raise InvalidAuthTokenError() from None


# =====================================================================
# 3. DOMAIN SERVICE LAYER
# =====================================================================

class CheckoutService:
    def execute_checkout(self, account_id: str, balance: float, order_total: float) -> str:
        # 1. Pure domain rule validation
        if balance < order_total:
            raise InsufficientFundsError(
                account_id=account_id,
                required_amount=order_total,
                available_balance=balance,
            )

        # 2. External interaction with explicit chaining (`from`)
        try:
            call_stripe_gateway_sdk(order_total)
        except RawSocketTimeoutError as raw_err:
            # Explicit chaining: preserve the low-level socket error in __cause__
            raise PaymentGatewayTimeoutError(
                gateway_name="Stripe",
                timeout_seconds=5.0,
            ) from raw_err

        return "CHECKOUT_COMPLETE"


# =====================================================================
# 4. CONTROLLER / GLOBAL DISPATCH LAYER
# =====================================================================

def handle_checkout_request(auth_header: str, account_id: str, balance: float, total: float) -> dict:
    service = CheckoutService()
    try:
        # Step 1: Validate authentication token (suppressed chaining)
        parse_jwt_segment(auth_header)

        # Step 2: Process checkout business logic
        confirmation = service.execute_checkout(account_id, balance, total)
        return {"status": 200, "data": {"confirmation": confirmation}}

    except AppError as app_err:
        # Centralized handling: catch any known application error via the root class
        response = {
            "status": app_err.http_status,
            "body": app_err.to_dict(),
        }
        # In production, check __cause__ to attach diagnostic root causes to your APM logs
        if app_err.__cause__:
            response["_debug_root_cause"] = str(app_err.__cause__)
        return response

    except Exception:
        # Catch unexpected Python runtime bugs (AttributeError, TypeError) to prevent process crashes
        return {
            "status": 500,
            "body": {
                "error_code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected fatal system error occurred.",
            },
        }


# =====================================================================
# 5. EXECUTING SCENARIOS
# =====================================================================

if __name__ == "__main__":
    # Scenario A: Domain business rule failure (Insufficient funds -> 402)
    result_a = handle_checkout_request("valid.jwt.token", "acc_1001", balance=40.0, total=150.0)
    print("Scenario A (Domain Error):", result_a)

    # Scenario B: Infrastructure failure with explicit causal chaining (Gateway Timeout -> 504)
    result_b = handle_checkout_request("valid.jwt.token", "acc_1001", balance=500.0, total=150.0)
    print("Scenario B (Chained Infra Error):", result_b)

    # Scenario C: Token parse failure with suppressed chaining (Invalid Token -> 401)
    result_c = handle_checkout_request("bad_token", "acc_1001", balance=500.0, total=150.0)
    print("Scenario C (Suppressed Token Error):", result_c)
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why must custom application exceptions inherit from `Exception` rather than `BaseException`?**

Inheriting from `BaseException` is one of the most dangerous anti-patterns in Python backend engineering. `BaseException` is reserved exclusively for system-level, out-of-band events that must bypass normal application error-handling logic: `SystemExit`, `KeyboardInterrupt`, `GeneratorExit`, and (in modern Python versions) `asyncio.CancelledError`.

When developers write defensive application code, they catch `Exception` (`except Exception:`) to handle unexpected runtime failures without terminating the entire worker process. If a custom application exception subclasses `BaseException` directly, catching `Exception` will not catch your custom exception, causing it to bubble up and kill the server worker.

Conversely, if code attempts to catch your custom exception's base class and that base class inherits from `BaseException`, catching it will accidentally catch `KeyboardInterrupt` and `SystemExit`. This makes your application unkillable via standard POSIX signals (SIGINT / SIGTERM), prevents Kubernetes pods from gracefully terminating, and breaks coroutine cancellation loops in async frameworks like FastAPI and AsyncIO.

**Q: What is the mechanical difference between explicit chaining (`from err`), implicit chaining, and suppressed chaining (`from None`)?**

Python introduces explicit exception relationships via PEP 3134 through three distinct mechanisms:

1. **Explicit Chaining (`raise NewError() from original_err`):** This explicitly assigns `original_err` to the `__cause__` attribute of `NewError` and sets `__suppress_context__ = True`. When printing the traceback or exporting events to APM tools (Sentry/Datadog), Python explicitly notes: `"The above exception was the direct cause of the following exception:"`. Use this when translating low-level technical errors (like database connection drops) into domain errors while preserving forensic causality.
2. **Implicit Chaining (`__context__`):** When an exception is raised inside an `except` or `finally` block without using `from`, Python automatically assigns the active exception to the new exception's `__context__` attribute. The traceback prints: `"During handling of the above exception, another exception occurred:"`. This serves as an automatic safety net so developers can see what was happening if an error handler itself broke.
3. **Suppressed Chaining (`raise NewError() from None`):** Setting `from None` sets `__cause__ = None` and sets `__suppress_context__ = True`. This completely hides the previous exception from the traceback and logging output. Use this when converting internal implementation quirks (e.g., regex compilation errors or dictionary lookup failures) into public-facing domain errors where the internal stack trace would leak sensitive details or create useless log noise.

**Q: Why is calling `super().__init__(message)` mandatory when overriding `__init__` in custom exceptions?**

When Python instantiates an exception, the base `BaseException.__init__` method initializes the internal `args` tuple attribute on the instance.
If you override `__init__` in a custom exception subclass and fail to call `super().__init__(message)`:
- `self.args` remains empty or uninitialized.
- `str(exc)` and `repr(exc)` will return an empty string instead of your descriptive error message.
- Standard library logging formatters (`logger.exception("Error occurred")`) and observability SDKs (Sentry, OpenTelemetry) rely on `str(exc)` or `exc.args[0]` to populate incident titles; without `super().__init__`, incidents will be logged with blank descriptions.
- Serialization and pickling mechanisms used by distributed task queues (such as Celery or Python's `multiprocessing` library) will fail or reconstruct the exception with empty arguments on remote worker nodes.

**Q: How do you design an exception hierarchy for a multi-tiered enterprise backend service?**

An enterprise exception hierarchy should be organized into a three-tier tree structure:
1. **Single Service Root (`AppError`):** Every custom exception in the service or package inherits from this single root. This enables top-level framework middlewares and external consumer packages to catch all known errors produced by the service with a single `except AppError:` clause.
2. **Architectural Subdomain Bases (`DomainError`, `InfrastructureError`, `SecurityError`):** These intermediate classes partition errors by architectural boundary. `DomainError` represents invalid business state (e.g., overdraft, account locked) and carries HTTP 4xx semantics. `InfrastructureError` represents external system failures (e.g., database timeout, Redis connection loss) and carries HTTP 5xx semantics with retryability metadata.
3. **Actionable Leaf Exceptions (`OrderNotFoundError`, `RateLimitExceededError`):** Concrete classes with explicit, typed constructor arguments.

This design enables precision error handling: repository adapters catch raw driver errors and re-raise chained `InfrastructureError` subclasses; domain services catch infrastructure errors or raise specific `DomainError` subclasses; and centralized web controllers catch the top-level categories to automatically map exceptions to standardized HTTP responses without code duplication.

**Q: How do custom exceptions interact with centralized error handlers in web frameworks like FastAPI, Django, or Flask?**

Instead of scattering repetitive `try...except` blocks across every route or controller, centralized error handling uses framework middleware or exception handlers registered against your exception hierarchy:

In FastAPI, you register handlers on the base classes:
```python
@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError):
    return JSONResponse(
        status_code=exc.http_status,
        content=exc.to_dict(),
    )

@app.exception_handler(InfrastructureError)
async def infrastructure_error_handler(request: Request, exc: InfrastructureError):
    logger.error("Infrastructure failure: %s", exc, exc_info=exc)
    return JSONResponse(
        status_code=exc.http_status,
        content=exc.to_dict(),
    )
```
Because FastAPI's exception dispatcher traverses the inheritance hierarchy, raising any child exception (like `InsufficientFundsError` or `PaymentGatewayTimeoutError`) automatically routes to the appropriate handler, extracts the structured metadata, logs causality via `__cause__`, and returns an RFC 7807-compliant JSON response without cluttering route handlers.

**Q: What is the performance impact of raising exceptions in Python, and why shouldn't they be used for routine control flow?**

Python follows the EAFP ("Easier to Ask for Forgiveness than Permission") philosophy, meaning `try...except` blocks with no exceptions raised have zero runtime overhead in Python 3.11+ (due to "zero-cost exceptions" where exception tables are stored out-of-band in bytecode).

However, *raising* an exception has significant runtime cost. When `raise` executes, the CPython interpreter must:
1. Allocate an exception object on the heap.
2. Inspect the current C call stack and Python frame stack.
3. Construct a linked list of `traceback` objects containing frame references, line numbers, and local variable scopes.
4. Unwind the stack frame by frame until a matching handler is found.

Raising an exception is roughly 50 to 100 times slower than a simple boolean branch or returning `None`. In high-throughput hot loops (e.g., parsing millions of records or running numerical algorithms), using exceptions for normal loop termination or expected branching creates severe CPU bottlenecks and memory churn.

**Q: What happens when custom exceptions are passed across process boundaries (e.g., Celery, `multiprocessing`)?**

When background task workers (like Celery or `multiprocessing.Pool`) encounter an unhandled exception, they must serialize (pickle) the exception object and transmit it back to the parent process or message broker.

For an exception to survive pickling and unpickling across process boundaries:
1. The custom exception class must be importable at the top level of a module (it cannot be defined dynamically inside a function).
2. The `__init__` constructor must accept the arguments returned by `__reduce__` or stored in `self.args`. If `__init__` requires mandatory keyword-only arguments that are not passed to `super().__init__()`, the unpickler will crash with `TypeError: __init__() missing required keyword argument`.
3. The exception instance must not contain unpicklable attributes, such as open file descriptors, database connection sockets, or lambda functions.

## 6. The Traps — What Goes Wrong

**Trap 1: Catching or Subclassing `BaseException`**

*The Mistake:* Subclassing `BaseException` for application errors or writing bare `except:` / `except BaseException:`.
*Why It's Dangerous:* Subclassing `BaseException` bypasses `except Exception:` catches, causing unhandled worker crashes. Catching `BaseException` intercepts `KeyboardInterrupt`, `SystemExit`, and `asyncio.CancelledError`. If your worker is running in Docker and Kubernetes sends a SIGTERM, a service catching `BaseException` will swallow the signal, ignore termination, and force Kubernetes to forcefully SIGKILL the container after 30 seconds, corrupting in-flight transactions.
*The Fix:* Always subclass `Exception` and catch `Exception` exclusively.

**Trap 2: Inverted Catch Order in Exception Hierarchies**

*The Mistake:* Placing a broader parent exception handler above a specific child handler in a `try...except` block:
```python
# BROKEN: The specific handler is unreachable
try:
    process_payment()
except AppError as e:
    handle_generic_error(e)
except InsufficientFundsError as e:  # DEAD CODE!
    prompt_user_for_deposit(e)
```
*Why It's Dangerous:* Python matches exceptions top-to-bottom using `isinstance()`. Since `InsufficientFundsError` is an instance of `AppError`, the first block intercepts the error every time. The specific deposit prompt logic is never executed.
*The Fix:* Always arrange `except` clauses from most specific leaf class to most general base class.

**Trap 3: Masking Root Cause Tracebacks by Re-raising Without Chaining**

*The Mistake:* Catching a low-level error and raising a new domain exception without using `from`:
```python
# BROKEN: Destroys original root cause in production logs
try:
    db.execute(query)
except DatabaseDriverError:
    raise OrderPlacementError("Failed to store order")
```
*Why It's Dangerous:* When this occurs, Python detaches the original `DatabaseDriverError` stack trace in some execution contexts or treats it as an unrelated secondary error. In APM platforms, the incident title shows `OrderPlacementError`, but the database host, query parameters, and socket timeout details are lost.
*The Fix:* Always use explicit chaining: `raise OrderPlacementError("Failed to store order") from db_err`.

**Trap 4: String Scraping Instead of Structured Attributes**

*The Mistake:* Inspecting error strings to determine recovery logic:
```python
# BROKEN: Fragile string parsing
try:
    service.charge(user_id, 100)
except Exception as e:
    if "insufficient funds" in str(e).lower():
        redirect_to_deposit()
```
*Why It's Dangerous:* Error messages are human-facing strings meant for debugging. The moment a developer modifies copy, fixes a typo, or translates the message for internationalization, the string check fails silently and routes the error into unexpected fallback logic.
*The Fix:* Define typed leaf exceptions with structured attributes (`exc.available_balance`) and match on the class type.

**Trap 5: Mutable Default Arguments and Pickling Failures in Custom `__init__`**

*The Mistake:* Defining `__init__` with mutable defaults (`details: dict = {}`) or non-serializable fields:
```python
# BROKEN: Mutable shared dict across instances
class CustomError(Exception):
    def __init__(self, message: str, details: dict = {}):
        self.details = details
        super().__init__(message)
```
*Why It's Dangerous:* In Python, default argument expressions are evaluated once when the function is defined, not each time it is called. If code mutates `exc.details["retry"] = True`, all future instances of `CustomError` created without explicit details will share that exact same dictionary.
*The Fix:* Default to `None` and initialize inside the constructor (`self.details = details or {}`).

**Trap 6: Using Exceptions for Normal Loop and Branch Control Flow**

*The Mistake:* Using `try...except` to break out of loops or handle frequent, expected missing values in high-throughput data processing:
```python
# BROKEN: Severe performance degradation in hot loops
for row in large_dataset:
    try:
        val = row["optional_column"]
    except KeyError:
        val = default_val
```
*Why It's Dangerous:* When `KeyError` is raised millions of times, Python repeatedly allocates exception objects and builds stack traceframes. This can slow down a data ingestion pipeline by orders of magnitude.
*The Fix:* Use standard conditional logic (`val = row.get("optional_column", default_val)`) for routine, expected absence.

## 7. Compare With Related Concepts

**Custom Exceptions vs Returning `Result[T, E]` / Tuples (`(data, error)`)**
- **The Difference:** Custom exceptions interrupt the current execution thread and unwind the call stack until an explicit handler catches them. The `Result` pattern (common in Rust or Go) forces callers to explicitly check for and unpack errors at every single function call boundary.
- **The Rule:** In Python backend services, use custom exceptions for operational and domain failures across architectural layers (e.g., database outages, business rule violations). Use `Result` or `Optional[T]` only in high-throughput computational pipelines where stack unwinding overhead is prohibitive or when an empty result is a standard, non-exceptional outcome.

**Custom Exceptions vs Built-in Standard Exceptions (`ValueError`, `KeyError`, `RuntimeError`)**
- **The Difference:** Built-in exceptions represent generic Python language-level errors (type mismatches, missing keys, value range issues). Custom exceptions represent specific business domain concepts and carry structured metadata (`error_code`, `http_status`).
- **The Rule:** Use built-in exceptions inside utility functions and low-level algorithms. Use custom domain exceptions at the boundaries of your business logic, services, and external integrations.

**Custom Domain Exceptions vs Framework HTTP Exceptions (`fastapi.HTTPException`)**
- **The Difference:** Framework exceptions like `fastapi.HTTPException` couple your business logic directly to the HTTP transport layer (carrying HTTP status codes and headers). Custom domain exceptions are transport-agnostic and live in the core domain layer.
- **The Rule:** Never raise `fastapi.HTTPException` inside domain models or service layers. Raise custom domain exceptions in your core logic, and let centralized API exception handlers translate them into HTTP responses at the web boundary.

**`__cause__` (Explicit Chaining) vs `__context__` (Implicit Chaining)**
- **The Difference:** `__cause__` is set explicitly via `raise ... from original_err`, signaling that the new exception intentionally wraps and replaces the original error. `__context__` is set automatically by Python when an exception occurs inside an `except` block without `from`, preserving the active exception in case the handler itself crashed.
- **The Rule:** Always use `raise CustomError(...) from original_err` when intentionally translating low-level errors to domain errors, and `raise CustomError(...) from None` when deliberately hiding internal implementation details.

## 8. 🧠 The Memory Hook

> **Root with `Exception`, chain with `from`, hide with `None`.**  
> Never inherit from `BaseException` unless you want your service to ignore Ctrl+C, never raise generic strings when calling code needs typed contracts, and always use `raise DomainError from infra_err` so your APM sees the exact forensic root cause.

