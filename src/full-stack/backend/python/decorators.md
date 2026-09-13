# Decorators in Python: First-Class Functions, Closures, and Metadata Preservation (`functools.wraps`)

## 1. Why This Exists — The Problem First

Imagine you are maintaining a production Python backend with 50 REST API endpoints. Every endpoint must perform the same three operational requirements: verify an incoming authentication token, log execution latency to Prometheus, and retry on intermittent database timeouts.

If you implement this inline inside every endpoint function, your codebase quickly degrades into repetitive boilerplate. Every route handler ends up wrapped in identical `try/except` retry loops, timestamp calculations (`time.perf_counter()`), and token inspection checks:

```python
# The boilerplate nightmare: 50 endpoints with identical cross-cutting logic
def get_user_profile(user_id: int):
    # 1. Auth check
    token = get_current_token()
    if not token or not token.is_valid:
        raise PermissionError("Unauthorized")
    
    # 2. Timing logic
    start_time = time.perf_counter()
    
    # 3. Retry loop
    attempts = 0
    while attempts < 3:
        try:
            profile = db.query_user(user_id)  # Actual business logic (1 line!)
            duration = time.perf_counter() - start_time
            metrics.record("user_profile_latency", duration)
            return profile
        except DatabaseTimeout:
            attempts += 1
            if attempts == 3:
                raise
```

Your single line of business logic is buried under fifteen lines of operational plumbing. When security asks you to change token validation, you have to find and patch 50 different functions. If an engineer forgets the retry block on endpoint #42, that endpoint crashes on routine database failovers.

Extracting these concerns into helper functions helps, but manually passing functions into wrapper functions (`get_user_profile = apply_retries(apply_timing(apply_auth(get_user_profile)))`) is awkward, error-prone, and destroys function metadata. Without explicit metadata management, `get_user_profile.__name__` becomes `"wrapper"`, docstrings disappear, and parameter signatures are wiped out. As a result, automated OpenAPI documentation tools (like FastAPI's Swagger UI), debugging stack traces, and serialization schemas break completely.

Python decorators exist to solve this exact problem: they provide a clean, declarative syntax for wrapping functions with reusable cross-cutting behaviors while preserving function identity, signatures, and runtime predictability.

---

## 2. The Analogy — Make It Obvious

Think of a decorator like an **Airport Security and Boarding Gate Checkpoint**:

```txt
┌──────────────────────────────────────────────────────────────────┐
│                   AIRPORT BOARDING GATE (Wrapper)                │
│                                                                  │
│  [Passenger Arrives]                                             │
│          │                                                       │
│          ▼                                                       │
│  1. Check Boarding Pass (Authentication Pre-Check)               │
│  2. Start Boarding Timer (Metrics / Latency Tracking)            │
│          │                                                       │
│          ▼                                                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                AIRPLANE FLIGHT (Core Function)             │  │
│  │              Passengers fly to their destination           │  │
│  └────────────────────────────────────────────────────────────┘  │
│          │                                                       │
│          ▼                                                       │
│  3. Stop Timer & Log Manifest (Post-Execution Logging)           │
│  4. Catch In-Flight Turbulence / Divert (Error Handling/Retry)   │
│          │                                                       │
│          ▼                                                       │
│  [Passenger Exits at Destination]                                │
└──────────────────────────────────────────────────────────────────┘
```

Here is how each part of the analogy maps to Python internals:

1. **The Flight (`Core Function`):** The pilot's sole job is flying passengers from Point A to Point B. The flight does not care how tickets were scanned or how security screening was handled.
2. **The Gate & Attendants (`Decorator Wrapper`):** The security gate stands in front of the airplane. It checks identification before boarding, starts a timer, lets the passenger board, and handles passenger issues if the flight is delayed.
3. **Setting Up the Gate (`Decorator Definition Time`):** The airport sets up the physical gate once when the terminal opens (module load / definition time). It does not rebuild the gate every time an individual passenger boards.
4. **The Flight Number & Manifest (`functools.wraps`):** If the security team stamps their own name on the boarding pass instead of the flight's destination, air traffic control and passengers will have no idea what plane they are on. `@functools.wraps` ensures the flight number, departure time, and pilot identity remain intact on the ticket, even though passengers walk through the security gate.

---

## 3. How It Actually Works — The Full Explanation

### First-Class Functions and Higher-Order Functions

In Python, functions are **first-class objects** (`PyFunctionObject`). This means functions are instances of the `function` class, just like integers or strings. You can:
- Assign a function to a variable (`alias = my_func`)
- Pass a function as an argument to another function (`run(my_func)`)
- Return a function from inside another function (`return my_func`)
- Store functions in data structures like dictionaries or lists

A function that takes another function as an argument or returns a function is called a **higher-order function**. A decorator is simply a higher-order function that takes a callable and returns a replacement callable.

---

### The Syntactic Sugar: `@decorator`

The `@` symbol is syntactic sugar introduced in PEP 318. When Python's parser encounters `@decorator` above a function definition:

```python
@timer
def calculate_metrics(data):
    return sum(data)
```

The Python interpreter translates this at **import/definition time** into:

```python
def calculate_metrics(data):
    return sum(data)

calculate_metrics = timer(calculate_metrics)
```

The original function object is passed into `timer()`. The name `calculate_metrics` in the local/global scope is immediately rebound to whatever `timer()` returns (typically an inner `wrapper` function).

---

### Closures and Lexical Scoping

When a decorator defines an inner function, it creates a **closure**. A closure is an inner function that remembers and retains access to variables from its enclosing lexical scope, even after the outer function has finished executing:

```python
def my_decorator(func):
    # 'func' is in the enclosing scope of 'wrapper'
    def wrapper(*args, **kwargs):
        # 'wrapper' retains access to 'func' via its closure
        return func(*args, **kwargs)
    return wrapper
```

Under the hood, CPython creates a cell object in `wrapper.__closure__` that references the original `func`. When the outer `my_decorator` returns, the execution frame of `my_decorator` is destroyed, but the memory allocated for `func` is kept alive because the cell in `wrapper.__closure__` holds a reference to it:

```txt
┌────────────────────────────────────────────────────────┐
│ Global Scope: calculate_metrics ──────────┐            │
└───────────────────────────────────────────│────────────┘
                                            ▼
┌────────────────────────────────────────────────────────┐
│ Wrapper Function Object                                │
│   __name__: 'wrapper' (without wraps)                  │
│   __closure__: (<cell: points to original func>,)      │
│                     │                                  │
│                     ▼                                  │
│   ┌──────────────────────────────────────────────────┐ │
│   │ Original Function Object (calculate_metrics)    │ │
│   │   __name__: 'calculate_metrics'                  │ │
│   │   __doc__: 'Sums data elements'                  │ │
│   │   __code__: <bytecode of original function>      │ │
│   └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

---

### Why `functools.wraps` Is Essential

When you replace a function with a wrapper function:

```python
def naive_decorator(func):
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper

@naive_decorator
def fetch_user(user_id: int) -> dict:
    """Fetch user record by ID."""
    return {"id": user_id}
```

Because `fetch_user` now points to `wrapper`, all introspection metadata belongs to `wrapper`:
- `fetch_user.__name__` returns `'wrapper'` (instead of `'fetch_user'`)
- `fetch_user.__doc__` returns `None` (instead of `'Fetch user record by ID.'`)
- `fetch_user.__annotations__` returns `{}` (type hints are lost)
- `inspect.signature(fetch_user)` returns `(*args, **kwargs)` (parameter list is destroyed)

This breaks:
1. **API Documentation:** FastAPI, Flask-RESTful, and Sphinx use `__doc__`, `__name__`, and `__annotations__` to generate OpenAPI documentation and route schemas.
2. **Debugging and Profiling:** Stack traces and APM tools (Datadog, New Relic, Sentry) log error locations as `wrapper` instead of the actual endpoint name.
3. **Unit Testing & Mocking:** You cannot easily inspect or bypass decorators without access to the underlying function.

`@functools.wraps(func)` solves this by calling `functools.update_wrapper()`. It copies the standard metadata attributes (`WRAPPER_ASSIGNMENTS`: `__module__`, `__name__`, `__qualname__`, `__doc__`, `__annotations__`), updates `WRAPPER_UPDATES` (`__dict__`), and sets the `__wrapped__` attribute pointing directly to the original function:

```python
from functools import wraps

def proper_decorator(func):
    @wraps(func)  # Preserves __name__, __doc__, __annotations__, and sets __wrapped__
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper
```

---

### Parameterized Decorators (Decorators with Arguments)

When a decorator takes arguments (e.g., `@retry(max_attempts=3, delay=1.5)`), Python needs an extra layer of function nesting. Python evaluates the outer call first:

```python
@retry(max_attempts=3, delay=1.5)
def send_payload(payload):
    pass
```

Is translated by Python to:

```python
# 1. Call retry(...) with configuration parameters -> returns the actual decorator
decorator_func = retry(max_attempts=3, delay=1.5)

# 2. Apply decorator to the function -> returns wrapper
send_payload = decorator_func(send_payload)
```

This architecture requires three nested function layers:
1. **Outer Factory:** Accepts decorator arguments (`max_attempts`, `delay`) and returns the decorator.
2. **Middle Decorator:** Accepts the function (`func`) and returns the wrapper.
3. **Inner Wrapper:** Accepts the runtime arguments (`*args`, `**kwargs`), executes pre/post logic, and calls `func`.

```txt
Layer 1: retry(max_attempts=3)          -> Configuration scope
   │
   └── Layer 2: decorator(func)         -> Decoration scope (receives function)
          │
          └── Layer 3: wrapper(*args)   -> Call scope (runs on every invocation)
```

---

### Stacking Decorators (Order of Execution)

When multiple decorators are stacked above a function:

```python
@auth_required
@log_metrics
@rate_limit
def process_order(order_id):
    return f"Order {order_id} processed"
```

Python evaluates them **bottom-up at definition time** and **top-down at runtime**:

```python
# Definition Time (Wrapping from inner to outer):
process_order = auth_required(log_metrics(rate_limit(process_order)))
```

1. **Definition Time:** `rate_limit` wraps `process_order` first. Then `log_metrics` wraps that result. Finally, `auth_required` wraps the entire chain.
2. **Runtime Execution:** When a caller invokes `process_order()`, it hits the outermost wrapper (`auth_required`) first:
   - `auth_required` wrapper runs pre-check -> calls next wrapper
   - `log_metrics` wrapper starts timer -> calls next wrapper
   - `rate_limit` wrapper checks token bucket -> calls original `process_order`
   - `process_order` executes
   - `rate_limit` completes post-action -> returns to `log_metrics`
   - `log_metrics` logs latency -> returns to `auth_required`
   - `auth_required` returns final response to caller

---

### Built-in Python Decorators and Descriptors

Python includes several core decorators that rely on Python's **Descriptor Protocol** (`__get__`, `__set__`, `__delete__`):

1. **`@property`:** Converts a method into a descriptor, allowing getter, setter, and deleter access via attribute syntax (`user.full_name` instead of `user.full_name()`).
2. **`@classmethod`:** Converts a method into a descriptor that passes the class object (`cls`) as the first argument instead of the instance (`self`).
3. **`@staticmethod`:** Disables method binding completely, leaving the function as a plain function attached to the class namespace without passing `self` or `cls`.
4. **`@functools.lru_cache`:** Implements memoization around pure functions. It caches return values in an internal hash table using arguments as the cache key, evicting the least recently used entries when `maxsize` is exceeded.

---

## 4. Real Code — See It Working

### Example 1: Universal Execution Timing Decorator with Metrics

```python
import functools
import time
import logging
from typing import Callable, Any

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("api.metrics")

def measure_latency(metric_name: str | None = None) -> Callable:
    """
    Measures and logs function execution latency.
    Supports custom metric names and preserves full metadata.
    """
    def decorator(func: Callable) -> Callable:
        # Resolve metric name at definition time
        name = metric_name or func.__name__

        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            # High-resolution monotonic clock for latency benchmarking
            start_time = time.perf_counter()
            try:
                # Call the wrapped function with forwarded arguments
                return func(*args, **kwargs)
            finally:
                elapsed = time.perf_counter() - start_time
                logger.info(f"Metric '{name}' executed in {elapsed * 1000:.2f}ms")

        return wrapper
    return decorator


@measure_latency(metric_name="database_user_lookup")
def get_user_record(user_id: int) -> dict:
    """Fetch user record from database."""
    time.sleep(0.05)  # Simulate I/O latency
    return {"id": user_id, "username": "alex_dev"}


# Verification:
result = get_user_record(42)
print(f"Result: {result}")
print(f"Preserved function name: {get_user_record.__name__}")
print(f"Preserved docstring: {get_user_record.__doc__}")
```

---

### Example 2: Parameterized Retry Decorator with Exponential Backoff and Jitter

```python
import functools
import time
import random
import logging
from typing import Callable, Type, Tuple, Any

logger = logging.getLogger("resilience")

def retry(
    max_attempts: int = 3,
    base_delay: float = 0.1,
    backoff_factor: float = 2.0,
    jitter: bool = True,
    retry_exceptions: Tuple[Type[Exception], ...] = (Exception,)
) -> Callable:
    """
    Retries an operation on failure with exponential backoff and randomized jitter.
    """
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1")

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            delay = base_delay
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except retry_exceptions as exc:
                    if attempt == max_attempts:
                        logger.error(
                            f"Function '{func.__name__}' failed after {max_attempts} attempts. Raising error."
                        )
                        raise

                    # Calculate exponential backoff with optional full jitter
                    sleep_time = delay * (1 + random.uniform(0, 0.5) if jitter else 1)
                    logger.warning(
                        f"Attempt {attempt}/{max_attempts} failed for '{func.__name__}': {exc}. "
                        f"Retrying in {sleep_time:.3f}s..."
                    )
                    time.sleep(sleep_time)
                    delay *= backoff_factor

        return wrapper
    return decorator


# Simulate an unstable external network call
attempt_counter = 0

@retry(max_attempts=3, base_delay=0.05, retry_exceptions=(ConnectionError,))
def call_external_payment_gateway(account_id: str) -> str:
    global attempt_counter
    attempt_counter += 1
    if attempt_counter < 3:
        raise ConnectionError("Gateway timeout (504)")
    return f"Payment authorized for {account_id}"


print(call_external_payment_gateway("acc_9921"))
```

---

### Example 3: Role-Based Authorization Guard Decorator

```python
import functools
from typing import Callable, List, Any

# Mock context object representing current authenticated request
current_user = {
    "username": "sarah_admin",
    "roles": ["editor", "billing_admin"]
}

class InsufficientPermissionsError(Exception):
    pass

def require_roles(*required_roles: str) -> Callable:
    """
    Restricts endpoint execution to users with specific roles.
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            user_roles = set(current_user.get("roles", []))
            needed_roles = set(required_roles)

            # Check if user has at least one matching required role
            if not needed_roles.intersection(user_roles):
                missing = list(needed_roles - user_roles)
                raise InsufficientPermissionsError(
                    f"Access denied for user '{current_user.get('username')}'. Missing required role(s): {missing}"
                )
            
            # Auth passed; execute original handler
            return func(*args, **kwargs)

        return wrapper
    return decorator


@require_roles("admin", "billing_admin")
def refund_transaction(transaction_id: str, amount_cents: int) -> dict:
    """Issues a monetary refund to a customer account."""
    return {"status": "success", "tx_id": transaction_id, "refunded": amount_cents}


print(refund_transaction("tx_4001", 5000))
```

---

### Example 4: Dual Sync/Async Compatible Decorator

In modern backend frameworks like FastAPI, services mix synchronous helper functions and `async def` route handlers. A naive synchronous decorator breaks coroutines. Here is how to handle both cleanly:

```python
import asyncio
import functools
import inspect
import time
from typing import Callable, Any

def audit_log(action_name: str) -> Callable:
    """
    A decorator that inspects whether the wrapped target is a coroutine function
    and returns either an async wrapper or a sync wrapper accordingly.
    """
    def decorator(func: Callable) -> Callable:
        # Check if the target is an async coroutine function
        if inspect.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                print(f"[AUDIT-ASYNC START] Action: {action_name} | Target: {func.__name__}")
                start = time.perf_counter()
                result = await func(*args, **kwargs)  # Crucial: await the coroutine!
                print(f"[AUDIT-ASYNC END] Action: {action_name} | Elapsed: {(time.perf_counter()-start)*1000:.2f}ms")
                return result
            return async_wrapper
        else:
            @functools.wraps(func)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                print(f"[AUDIT-SYNC START] Action: {action_name} | Target: {func.__name__}")
                start = time.perf_counter()
                result = func(*args, **kwargs)
                print(f"[AUDIT-SYNC END] Action: {action_name} | Elapsed: {(time.perf_counter()-start)*1000:.2f}ms")
                return result
            return sync_wrapper

    return decorator


@audit_log("FETCH_USER_ASYNC")
async def async_fetch_data(item_id: int):
    await asyncio.sleep(0.01)
    return {"item": item_id}

@audit_log("PARSE_PAYLOAD_SYNC")
def sync_parse_data(raw_str: str):
    return raw_str.strip().upper()


# Test both sync and async execution paths
async def main():
    sync_res = sync_parse_data("  order_confirmed  ")
    async_res = await async_fetch_data(101)
    print(f"Sync result: {sync_res}")
    print(f"Async result: {async_res}")

asyncio.run(main())
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does the `@decorator` syntax actually do under the hood, and when does it execute?**

The `@decorator` syntax is pure syntactic sugar for function rebinding:

```python
@my_decorator
def target_func(): pass

# Is strictly equivalent to:
def target_func(): pass
target_func = my_decorator(target_func)
```

The decorator function executes at **module definition/import time**, not at function call time. When Python loads or imports a module, it evaluates the `@decorator` expression immediately, invokes the decorator callable with the original function as an argument, and reassigns the function name to the returned object (usually an inner `wrapper`). 

The inner `wrapper` function, however, executes at **call time** whenever someone invokes `target_func()`.

---

**Q: Why is `@functools.wraps` essential, and what breaks in production if you omit it?**

When you decorate a function without `@functools.wraps`, the original function is replaced by the inner wrapper. Consequently:
1. `func.__name__` becomes `"wrapper"` instead of the original name.
2. `func.__doc__` becomes `None` or the wrapper's docstring.
3. `func.__annotations__` (type hints) are erased.
4. `inspect.signature(func)` returns `(*args, **kwargs)` instead of the explicit argument names and defaults.

In production:
- **FastAPI / Swagger / OpenAPI:** Schema generators inspect type annotations and docstrings to build API documentation and validate request payloads. Without `wraps`, endpoints fail schema validation or show blank documentation.
- **APM Tools & Sentry:** Stack traces and error monitors group all exceptions under the name `wrapper`, obscuring the real failing function.
- **Testing:** You cannot access the undecorated original function via `func.__wrapped__`.

`@functools.wraps(func)` copies `__module__`, `__name__`, `__qualname__`, `__doc__`, and `__annotations__` from the target to the wrapper, and sets `wrapper.__wrapped__ = func`.

---

**Q: How does Python retain access to the original function inside the wrapper?**

Through **closures and lexical scoping**. When `decorator(func)` is called, `func` is a local parameter in the decorator's scope. The inner `wrapper` references `func`. 

When `decorator` finishes and returns `wrapper`, CPython creates a cell object in `wrapper.__closure__` containing a pointer to the original `func`. Even though the decorator's stack frame is popped off the call stack, the `cell` object keeps the reference alive in memory. When `wrapper()` is called later, Python retrieves `func` from `wrapper.__closure__[0].cell_contents`.

---

**Q: In what exact order do stacked decorators execute?**

Decorator application (definition time) occurs **bottom-up**, while execution (runtime call time) occurs **top-down** (outside-in).

Given:
```python
@decorator_a
@decorator_b
def my_func(): pass
```

At definition time:
```python
my_func = decorator_a(decorator_b(my_func))
```
`decorator_b` executes first on the raw function, and `decorator_a` executes on the result returned by `decorator_b`.

At runtime:
When `my_func()` is called, `decorator_a`'s wrapper runs first, performs its pre-processing, calls `decorator_b`'s wrapper, which runs its pre-processing, and finally calls the core function. Post-processing happens in reverse on the return path (inside-out).

---

**Q: How do parameterized decorators work under the hood, and why do they require three function levels?**

A regular decorator takes a function as its only argument (`def dec(func): ...`). A parameterized decorator (e.g. `@retry(max_attempts=3)`) takes arguments for configuration.

When Python sees `@retry(max_attempts=3)`, it must first evaluate `retry(max_attempts=3)`. That call must return an actual decorator function that can accept `func`.

This requires three nested layers:
1. **Outer Function (Factory):** Accepts configuration parameters (`max_attempts=3`) and returns the decorator callable.
2. **Middle Function (Decorator):** Accepts the target function (`func`) and returns the wrapper callable.
3. **Inner Function (Wrapper):** Accepts runtime arguments (`*args, **kwargs`), performs pre/post logic, and invokes `func`.

---

**Q: How do built-in decorators like `@property`, `@classmethod`, and `@staticmethod` work under the hood?**

They are implemented using Python's **Descriptor Protocol** (`__get__`, `__set__`, `__delete__`):

- **`@property`:** Wraps a method in a `property` object. When accessed on an instance (`obj.attr`), the property descriptor's `__get__` method is triggered, calling the underlying method and returning the computed value.
- **`@classmethod`:** Wraps a method so that when accessed via an instance or class (`obj.method()` or `Cls.method()`), its `__get__` method binds the class object (`type(obj)` or `Cls`) as the first argument (`cls`).
- **`@staticmethod`:** Wraps a method so that its `__get__` method returns the plain, unbound function without inserting `self` or `cls`.

---

**Q: How do you write a decorator that works with both synchronous and asynchronous functions?**

A synchronous wrapper cannot `await` an async function, and calling an async function without `await` merely returns an un-awaited coroutine object.

To support both:
1. Use `inspect.iscoroutinefunction(func)` inside the decorator body at definition time.
2. If `True`, define and return an `async def wrapper(*args, **kwargs): ... result = await func(*args, **kwargs)` wrapper.
3. If `False`, define and return a standard `def wrapper(*args, **kwargs): ... result = func(*args, **kwargs)` wrapper.
4. Apply `@functools.wraps(func)` to both wrappers.

---

**Q: How can you bypass or unit test a decorated function without triggering decorator side effects?**

If the decorator used `@functools.wraps`, Python stores a direct reference to the original, undecorated function on the `__wrapped__` attribute.

In unit tests:
```python
# To test business logic in isolation without triggering auth or rate-limiting:
raw_function = my_decorated_endpoint.__wrapped__
result = raw_function(test_user_id=123)
```

If multiple decorators were stacked with `@functools.wraps`, `__wrapped__` chains backwards to unwrapped layers. Python 3.4+ provides `inspect.unwrap(func)` to unwrap all decorator layers in one call down to the original function.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Omitting `@functools.wraps` (Masked Identity and Broken Schemas)

**The Mistake:** Writing custom wrappers without `@functools.wraps(func)`.

```python
# BAD
def log_call(func):
    def wrapper(*args, **kwargs):
        print(f"Calling {func.__name__}")
        return func(*args, **kwargs)
    return wrapper

@log_call
def create_invoice(invoice_id: str, amount: float) -> bool:
    """Generates customer invoice."""
    return True

print(create_invoice.__name__)  # 'wrapper' (Function name is lost!)
print(create_invoice.__doc__)   # None (Docstring is lost!)
```

**Why It Fails:** FastAPI, Celery, and Sphinx rely on `__name__` and `__doc__` for routing, task registration, and API generation. With Celery, two tasks decorated without `wraps` will both be named `"wrapper"`, causing task collisions and silent message routing failures.

**The Fix:** Always decorate the inner wrapper with `@functools.wraps(func)`.

---

### Trap 2: Side Effects at Import/Definition Time

**The Mistake:** Executing heavy operations (database connections, network requests, reading environment variables) directly inside the decorator body rather than inside the wrapper.

```python
# DANGEROUS BUG
def requires_db_connection(func):
    # This runs at MODULE IMPORT TIME when Python loads the file!
    db_conn = create_production_db_connection()  # Crashes during unit tests or CLI builds!
    
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        return func(db_conn, *args, **kwargs)
    return wrapper
```

**Why It Fails:** The code inside the decorator body executes the moment the Python file is imported, even during test discovery (e.g. `pytest`), linting, or building Docker images. If the database is not reachable at build/test time, imports crash.

**The Fix:** Move all connection creation and dynamic evaluation inside the inner `wrapper` function, or pass connection pools lazily.

---

### Trap 3: Decorating `async def` Functions with Synchronous Wrappers

**The Mistake:** Applying a standard synchronous decorator to an `async def` coroutine function.

```python
# BROKEN
def sync_timer(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)  # BUG: Returns a coroutine object; does NOT await it!
        print(f"Elapsed: {time.perf_counter() - start}s")
        return result  # Returns un-awaited coroutine; time measured is 0.00001s
    return wrapper

@sync_timer
async def fetch_remote_data():
    await asyncio.sleep(2)
    return "Data"
```

**Why It Fails:** Calling an `async def` function without `await` returns a coroutine object immediately without executing its body. The timing decorator reports 0ms elapsed time, and the caller receives an un-awaited coroutine, throwing `RuntimeWarning: coroutine 'fetch_remote_data' was never awaited`.

**The Fix:** Inspect with `inspect.iscoroutinefunction(func)` and provide an `async def wrapper` that uses `await func(*args, **kwargs)`.

---

### Trap 4: Mutable State Leaking in Decorator Scope

**The Mistake:** Storing mutable data structures (like lists or dicts) in the decorator function's scope to track state across calls without synchronization.

```python
# THREAD-UNSAFE TRAP
def simple_cache(func):
    cache = {}  # Shared across all threads and requests
    
    @functools.wraps(func)
    def wrapper(*args):
        if args not in cache:
            cache[args] = func(*args)
        return cache[args]
    return wrapper
```

**Why It Fails:** 
1. `cache` grows indefinitely without an eviction policy (TTL or LRU), creating a memory leak.
2. In multi-threaded ASGI/WSGI servers (e.g., Gunicorn with threads), concurrent dictionary mutations can corrupt state or cause race conditions.
3. Arguments that are mutable (lists, dicts) are not hashable and will raise `TypeError: unhashable type: 'dict'`.

**The Fix:** Use thread-safe, bounded caching mechanisms like `@functools.lru_cache` or Redis for backend service caching.

---

### Trap 5: Hardcoding Wrapper Signatures

**The Mistake:** Defining wrappers that don't accept `*args, **kwargs` or that discard keyword arguments.

```python
# BAD
def validate_inputs(func):
    @functools.wraps(func)
    def wrapper(arg1, arg2):  # Breaks any function with != 2 positional arguments!
        return func(arg1, arg2)
    return wrapper
```

**Why It Fails:** The decorator cannot be reused on functions with keyword-only arguments, variable arguments, or different parameter counts.

**The Fix:** Always use `def wrapper(*args: Any, **kwargs: Any) -> Any:` unless the decorator explicitly needs to inspect and validate specific keyword arguments via `inspect.signature`.

---

## 7. Compare With Related Concepts

| Concept | Key Difference | When to Use Which |
| :--- | :--- | :--- |
| **Python Decorator** | Wraps individual functions or classes at definition time using closure composition. | Use for fine-grained, endpoint-specific or method-specific cross-cutting logic (e.g. `@retry`, `@lru_cache`, `@require_roles("admin")`). |
| **ASGI / WSGI Middleware** | Intercepts the entire HTTP request/response pipeline at the server boundary before routing occurs. | Use for global, application-wide concerns that apply to every incoming request (e.g. CORS headers, GZip compression, request ID injection, global exception handlers). |
| **Higher-Order Function (HOF)** | Any function that accepts or returns a function (e.g. `map()`, `filter()`, `sorted(key=...)`). | Use when passing functional transforms inline; a decorator is simply a specialized HOF with syntactic sugar (`@`). |
| **Class Inheritance / Template Method** | Uses OOP polymorphism and subclassing to override specific lifecycle steps. | Use when building reusable component hierarchies with shared internal state; avoid when you only need to wrap independent standalone functions. |
| **Monkey Patching** | Dynamically modifies a module or class attribute at runtime from external code. | Use only in testing (e.g. `unittest.mock.patch`) to stub out network calls; strictly avoid in production application code. |

---

## 8. 🧠 The Memory Hook

> **`@decorator` is just `func = decorator(func)` evaluated once at import time.** The wrapper is the security guard at the gate; `@functools.wraps(func)` is the badge that keeps the original function's name and identity intact so debugging and API tools don't see a ghost.
