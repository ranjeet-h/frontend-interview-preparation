# How Decorators Work Under the Hood: Parameterized Decorators, Class Decorators, and Stacking Order

## 1. Why This Exists — The Problem First

In any real-world backend service, you inevitably find yourself repeating identical infrastructure logic across dozens of endpoints: authenticating incoming requests, validating permission tokens, timing database operations, retrying flaky external API calls, and enforcing rate limits. If you write this logic directly inside every function, your core business code gets buried under twenty lines of defensive boilerplate. When security policies change or you need to adjust a retry threshold, you are forced to edit fifty separate functions.

The moment you attempt to extract this logic into reusable decorators with custom configurations—such as `@rate_limit(max_requests=100, window=60)` or `@retry(attempts=3)`—you run straight into Python's closure rules. Without a crystal-clear mental model of how Python evaluates decorators at import time versus call time, developers get lost in nested scopes, accidentally execute logic during server startup instead of per request, or write synchronous wrappers that silently break asynchronous endpoints.

Even worse is stacking multiple decorators in production. If an engineer stacks `@cache` above `@auth_required` on a sensitive endpoint, they often assume the decorator closest to the function runs first. But Python evaluates outer wrappers first on invocation. Unauthenticated requests hit the outer cache wrapper, bypass authentication entirely, and receive cached private financial data belonging to an entirely different user. Decorators are not magical annotations; they are raw higher-order functions that replace callables at import time.

## 2. The Analogy — Make It Obvious

Think of a function as an **expensive smartphone** being packaged and shipped at a high-security fulfillment warehouse:

1. **The Original Function (`func`):** The bare smartphone. It knows how to do its primary job (make calls, run apps, return data), but it has zero protection or telemetry of its own.
2. **A Simple Decorator (`decorator`):** A standard bubble-wrap machine. You slide the bare phone into the machine once. The machine encases the phone inside a protective bubble-wrap sleeve (`wrapper`) and copies the phone's serial number and label onto the outside (`functools.wraps`). When a customer receives the package and taps the screen (calls the function), they are physically interacting with the outer bubble wrap first. The bubble wrap checks the seal, triggers the phone inside, and hands the phone's output to the customer.
3. **A Parameterized Decorator (Decorator Factory):** A custom machine builder. You do not have a fixed bubble-wrap machine yet; you have a control panel where you dial in custom settings: *"3 layers of padding, fragile label, 24-hour express stamp"* (`factory(padding=3, stamp="express")`). Submitting those settings builds a bespoke wrapping machine (`decorator(func)`). That newly built machine then takes the phone and seals it into the final container (`wrapper(*args, **kwargs)`).
4. **Stacked Decorators (Nested Gift Boxes):** Placing the phone inside a padded box, and then placing that padded box inside a waterproof wooden crate. At packaging time (import time), you must place the phone into the inner box first, and then wrap that inside the outer crate. But when the customer opens the delivery at runtime (call time), they must unlock the outer wooden crate first before they can ever touch the inner padded box and the phone.
5. **Class-Based Decorators:** An automated robotic kiosk with persistent memory. Instead of a disposable sleeve, the phone is housed in a permanent smart station with an odometer that increments a digital counter every time a user touches the device.

## 3. How It Actually Works — The Full Explanation

### The Syntactic Sugar Desugared
When Python encounters the `@` symbol above a function definition, it evaluates an expression and immediately rebinds the function's name to the result.

Writing this:
```python
@my_decorator
def calculate_tax(amount):
    return amount * 0.2
```
Is byte-for-byte identical to:
```python
def calculate_tax(amount):
    return amount * 0.2

calculate_tax = my_decorator(calculate_tax)
```
This reassignment happens **once at module load / import time** when Python parses the `def` statement, NOT when `calculate_tax()` is called during a web request. `my_decorator` receives the function object `calculate_tax`, executes its outer body, and returns a replacement callable (usually an inner `wrapper` function). Python binds the identifier `calculate_tax` to this replacement.

### The Standard 2-Level Function Decorator
A basic decorator uses two levels of functions:
1. **Outer Function (`my_decorator`):** Runs once during import. It accepts the target function `func` as an argument.
2. **Inner Function (`wrapper`):** Defined inside `my_decorator`. Because it is defined in the outer function's scope, it creates a **closure** holding a reference to `func` in its `__closure__` attribute.
3. When someone calls `calculate_tax(100)` later, they execute `wrapper(100)`. Inside `wrapper`, you execute pre-call logic, call `func(*args, **kwargs)`, capture the return value, run post-call logic, and return the result.

### Metadata Preservation and `functools.wraps`
When a function is replaced by an inner `wrapper`, its identity is obscured. Introspecting `calculate_tax.__name__` returns `"wrapper"`, `calculate_tax.__doc__` returns `None`, and web frameworks (like Flask or FastAPI) that register routes based on endpoint names or type signatures can crash due to duplicate names.

`functools.wraps` is a helper decorator applied directly to `wrapper`. Internally, it calls `functools.update_wrapper()`, which copies `__name__`, `__doc__`, `__module__`, `__qualname__`, `__annotations__`, and `__dict__` from `func` to `wrapper`. It also creates a pointer `wrapper.__wrapped__ = func`, allowing callers, debuggers, and test suites to access the original, undecorated function directly.

### Parameterized Decorators: The 3-Level Function Architecture
When a decorator accepts configuration arguments—such as `@retry(max_retries=3, delay=1.0)`—Python cannot simply pass `func` to `retry`, because `retry` already consumed `max_retries` and `delay`.

Python desugars `@retry(max_retries=3)` into:
```python
calculate_tax = retry(max_retries=3)(calculate_tax)
```
Because there are two consecutive function calls, you need three nested levels:
1. **Level 1 — Decorator Factory (`retry`):** Receives the configuration parameters (`max_retries`, `delay`) and returns the actual decorator function.
2. **Level 2 — The Decorator (`decorator`):** Receives the target function `func` and returns the runtime wrapper.
3. **Level 3 — The Wrapper (`wrapper`):** Receives `*args, **kwargs` when the decorated function is invoked at runtime. It has access to both `func` and the configuration parameters through lexical closures.

```python
def retry(max_retries=3, delay=1.0):      # Level 1: Factory (takes config)
    def decorator(func):                  # Level 2: Decorator (takes func)
        @functools.wraps(func)
        def wrapper(*args, **kwargs):      # Level 3: Wrapper (runtime call)
            for attempt in range(1, max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except Exception:
                    if attempt == max_retries:
                        raise
                    time.sleep(delay)
        return wrapper
    return decorator
```

### Class-Based Decorators: Two Architectural Patterns
Any Python object that implements the `__call__` method can be invoked like a function. This makes classes powerful tools for writing stateful decorators.

**Pattern A: Class Decorator Without Arguments (Stateful Wrapper)**
When decorating with `@CountCalls`, the class constructor receives `func` directly:
- `__init__(self, func)` runs at import time, storing `self.func = func` and initializing state (e.g., `self.count = 0`).
- `__call__(self, *args, **kwargs)` runs at runtime whenever the decorated function is called.

**Pattern B: Class Decorator With Arguments (Configurable Class Factory)**
When decorating with `@RateLimit(calls=5, period=60)`:
- `__init__(self, calls, period)` runs when arguments are passed, storing configuration on `self`.
- `__call__(self, func)` runs when Python passes the target function. It defines, wraps, and returns an inner `wrapper` function.

### Decorator Stacking Order (The Onion Execution Flow)
When multiple decorators are stacked on a single function:
```python
@auth_required
@log_metrics
@cache_result
def get_user_profile(user_id):
    return db.query(user_id)
```
Python desugars this from the inside out:
```python
get_user_profile = auth_required(log_metrics(cache_result(get_user_profile)))
```
This creates two distinct phases with opposite directional flows:
1. **Decoration Time (Import / Definition Time):** Evaluated from **bottom to top**.
   - `cache_result` wraps `get_user_profile` first and produces `wrapper_cache`.
   - `log_metrics` wraps `wrapper_cache` and produces `wrapper_log`.
   - `auth_required` wraps `wrapper_log` and produces `wrapper_auth`.
2. **Call Time (Runtime Invocation):** Evaluated from **top to bottom** on entry, and **bottom to top** on exit.
   - The caller invokes `wrapper_auth` (the outermost layer).
   - `wrapper_auth` verifies credentials, then calls `wrapper_log`.
   - `wrapper_log` starts a timer, then calls `wrapper_cache`.
   - `wrapper_cache` checks cache. On a miss, it calls `get_user_profile`.
   - The database returns data up through `wrapper_cache`, which saves it to Redis and returns up to `wrapper_log`, which records execution time and returns up to `wrapper_auth`, which returns the final payload to the caller.

### Decorating Async Functions (`async def`)
In asynchronous frameworks like FastAPI or aiohttp, endpoints are coroutine functions. When you call an `async def` function, Python does not execute its body immediately; it returns a `coroutine` object that must be `await`ed.

If you wrap an async function in a standard synchronous wrapper:
```python
def broken_decorator(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)  # BUG: Returns unawaited coroutine!
        print(f"Elapsed: {time.perf_counter() - start}")
        return result
    return wrapper
```
The synchronous wrapper calls `func()`, which immediately produces an unawaited coroutine. The elapsed time prints `0.00001s` because no work happened, and the caller receives a raw coroutine object instead of the resolved data.

To properly decorate async functions, the wrapper must be declared with `async def` and must `await` the inner call:
```python
def async_decorator(func):
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = await func(*args, **kwargs)
        print(f"Elapsed: {time.perf_counter() - start}")
        return result
    return wrapper
```
To support both synchronous and asynchronous functions in one decorator, you inspect the target callable with `inspect.iscoroutinefunction(func)` and return the appropriate wrapper.

## 4. Real Code — See It Working

### Example 1: Parameterized Decorator Factory with Exponential Backoff
```python
import functools
import time
import logging
from typing import Callable, Any, Tuple, Type

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("retry_service")

def retry(
    max_attempts: int = 3,
    initial_delay: float = 0.5,
    backoff_factor: float = 2.0,
    retry_exceptions: Tuple[Type[Exception], ...] = (Exception,)
) -> Callable:
    """
    Level 1: Decorator Factory.
    Captures configuration arguments and returns the decorator.
    """
    def decorator(func: Callable) -> Callable:
        """
        Level 2: The Decorator.
        Captures the target function and returns the wrapper.
        """
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            """
            Level 3: The Wrapper.
            Executes on every call at runtime with full access to config and func.
            """
            delay = initial_delay
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except retry_exceptions as err:
                    if attempt == max_attempts:
                        logger.error(
                            f"Function '{func.__name__}' failed after {max_attempts} attempts. Raising."
                        )
                        raise
                    
                    logger.warning(
                        f"Attempt {attempt}/{max_attempts} for '{func.__name__}' failed: {err}. "
                        f"Retrying in {delay:.2f}s..."
                    )
                    time.sleep(delay)
                    delay *= backoff_factor
        return wrapper
    return decorator

# Usage
@retry(max_attempts=3, initial_delay=0.1, backoff_factor=2.0, retry_exceptions=(ConnectionError, TimeoutError))
def fetch_payment_status(transaction_id: str) -> dict:
    # Simulating a flaky payment gateway call
    logger.info(f"Checking transaction {transaction_id}...")
    raise ConnectionError("Payment gateway timed out")
```

### Example 2: Class-Based Decorators (Stateful Call Counter & Parameterized Rate Limiter)
```python
import functools
import time
from typing import Callable, Any, List

# Pattern A: Class Decorator Without Arguments (Stateful Counter with Method Support)
class TrackInvocations:
    def __init__(self, func: Callable):
        self.func = func
        self.call_count = 0
        # Preserve function metadata on the class instance
        functools.update_wrapper(self, func)

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        self.call_count += 1
        print(f"[{self.func.__name__}] Total invocations so far: {self.call_count}")
        return self.func(*args, **kwargs)

    def __get__(self, instance, owner):
        # Descriptors protocol: binds 'self' properly if used on a class method
        if instance is None:
            return self
        return functools.partial(self.__call__, instance)

# Pattern B: Class Decorator With Arguments (Sliding Window Rate Limiter)
class SlidingWindowRateLimit:
    def __init__(self, max_requests: int, window_seconds: float):
        # Level 1: Configuration captured in instance attributes
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    def __call__(self, func: Callable) -> Callable:
        # Level 2: Decorator execution returning the wrapper
        history: List[float] = []

        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            now = time.time()
            nonlocal history
            # Remove timestamps outside the sliding window
            history = [ts for ts in history if now - ts < self.window_seconds]

            if len(history) >= self.max_requests:
                raise RuntimeError(
                    f"Rate limit of {self.max_requests} calls per {self.window_seconds}s exceeded."
                )

            history.append(now)
            return func(*args, **kwargs)

        return wrapper

# Usage
@TrackInvocations
def calculate_hash(data: str) -> str:
    return f"hash_{data}"

@SlidingWindowRateLimit(max_requests=2, window_seconds=1.0)
def generate_token(user_id: int) -> str:
    return f"token_for_{user_id}"
```

### Example 3: Demonstrating Decorator Stacking Order and Execution Flow
```python
import functools

def auth_check(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        print(" -> [1. Auth Check] Verifying user permissions...")
        user = kwargs.get("user", "anonymous")
        if user != "admin":
            print(" <- [1. Auth Check] Denied! Halting pipeline.")
            raise PermissionError("Unauthorized access")
        print(" -> [1. Auth Check] Authorized. Passing to next layer.")
        result = func(*args, **kwargs)
        print(" <- [1. Auth Check] Cleaning up auth context.")
        return result
    return wrapper

def audit_log(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        print("   -> [2. Audit Log] Writing entry: function call started.")
        result = func(*args, **kwargs)
        print("   <- [2. Audit Log] Writing entry: function call completed.")
        return result
    return wrapper

# Stacking Order: auth_check wraps audit_log, which wraps get_secure_vault
@auth_check
@audit_log
def get_secure_vault(vault_id: str, user: str = "anonymous"):
    print(f"     => [3. Target Function] Accessing secure vault: {vault_id}")
    return {"vault_id": vault_id, "balance": 5000000}

# Calling with admin:
# Output:
#  -> [1. Auth Check] Verifying user permissions...
#  -> [1. Auth Check] Authorized. Passing to next layer.
#    -> [2. Audit Log] Writing entry: function call started.
#      => [3. Target Function] Accessing secure vault: vault_99
#    <- [2. Audit Log] Writing entry: function call completed.
#  <- [1. Auth Check] Cleaning up auth context.
```

### Example 4: Universal Dual-Mode Sync & Async Decorator
```python
import inspect
import functools
import time
import asyncio
from typing import Callable, Any

def profile_execution(func: Callable) -> Callable:
    """
    Universal decorator that dynamically inspects whether the target
    is synchronous or an async coroutine, applying the correct wrapper.
    """
    if inspect.iscoroutinefunction(func):
        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            start = time.perf_counter()
            try:
                return await func(*args, **kwargs)
            finally:
                elapsed = time.perf_counter() - start
                print(f"[Async Metric] {func.__qualname__} completed in {elapsed * 1000:.3f}ms")
        return async_wrapper
    else:
        @functools.wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            start = time.perf_counter()
            try:
                return func(*args, **kwargs)
            finally:
                elapsed = time.perf_counter() - start
                print(f"[Sync Metric] {func.__qualname__} completed in {elapsed * 1000:.3f}ms")
        return sync_wrapper

# Sync endpoint
@profile_execution
def compute_heavy_factors(n: int) -> int:
    time.sleep(0.05)
    return n * 2

# Async endpoint
@profile_execution
async def fetch_remote_user(user_id: int) -> dict:
    await asyncio.sleep(0.05)
    return {"id": user_id, "username": "alice"}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How do Python decorators work under the hood, and when does decoration occur?**

Decorators operate through higher-order function composition and name rebinding. When the Python interpreter parses `@decorator` above a function definition `def func(): ...`, it executes two separate phases:
1. **Decoration Time (Import / Definition Time):** As soon as the module is loaded, Python creates the original function object `func`, passes it to `decorator(func)`, and rebinds the symbol `func` in the local/module namespace to whatever object `decorator` returns (typically a wrapper function). This happens once at startup.
2. **Call Time (Runtime):** Every time `func(*args, **kwargs)` is called in the application, the caller invokes the wrapper returned during the decoration phase. The wrapper has access to the original function through its closure (`__closure__`), allowing it to execute code before calling `func`, inspect or modify incoming arguments, catch exceptions, and transform return values.

**Q: Why does a parameterized decorator require three levels of nested functions?**

A standard decorator takes a function and returns a wrapper (2 levels). However, when you write `@decorator_factory(arg1, arg2)`, Python syntax treats the `@` expression as an invocation that must return the actual decorator. 

Desugared, `@factory(x)` on `def func()` becomes:
`func = factory(x)(func)`

This requires two sequential calls, necessitating three distinct functional layers:
- **Level 1 (Factory):** Accepts configuration parameters (`x`, `y`) and returns Level 2.
- **Level 2 (Decorator):** Accepts the target function `func` and returns Level 3.
- **Level 3 (Wrapper):** Accepts `*args, **kwargs` at runtime during actual invocations, executing pre/post logic around `func` while retaining access to both `func` and the Level 1 configuration through nested lexical closures.

**Q: What is the exact execution flow when stacking multiple decorators?**

When multiple decorators are stacked on a function:
```python
@dec_a
@dec_b
def target():
    pass
```
Python evaluates them at definition time from **bottom to top**: `target = dec_a(dec_b(target))`. `dec_b` wraps `target` first, and `dec_a` wraps the result of `dec_b`.

At runtime call time, execution flows like an onion:
1. **Entry (Top to Bottom):** The caller invokes `dec_a`'s wrapper. `dec_a` runs its pre-logic, then calls `dec_b`'s wrapper. `dec_b` runs its pre-logic, then calls the original `target`.
2. **Core:** `target` executes its business logic and produces a return value.
3. **Exit (Bottom to Top):** `dec_b` receives the return value, runs its post-logic, and returns to `dec_a`. `dec_a` runs its post-logic and returns the final result to the caller.

**Q: What does `functools.wraps` do, and what breaks in production if you omit it?**

When a decorator returns an inner `wrapper` function, the wrapper replaces the original function in the namespace. By default, the wrapper has its own metadata: `wrapper.__name__ == "wrapper"`, `wrapper.__doc__ == None`, and its own `__annotations__`.

`functools.wraps` is a decorator applied to the inner wrapper that copies the original function's metadata (`__name__`, `__doc__`, `__module__`, `__qualname__`, `__annotations__`, and `__dict__`) to the wrapper. It also sets `__wrapped__` pointing to the raw original function.

If omitted in production:
1. **Route Name Collisions:** Frameworks like Flask that identify routes by `func.__name__` crash on startup with `AssertionError: View function mapping is overwriting an existing endpoint function: wrapper`.
2. **Broken Schema & Docs:** FastAPI, Pydantic, and Swagger/OpenAPI generators rely on `__annotations__` and `__doc__` to build API contracts; without `wraps`, documentation becomes blank or distorted.
3. **Impaired Debugging & Testing:** Stack traces show generic `wrapper` lines instead of the real function name, and test suites cannot use `func.__wrapped__` to test isolated business logic without decorator interference.

**Q: How do you implement a class-based decorator, and what is the difference between passing arguments vs not passing arguments?**

A class-based decorator leverages instances of a class implementing `__call__`:
- **Without arguments (`@ClassDec`):** The class constructor `__init__(self, func)` receives the function directly at import time. The class instance itself replaces the function. When called at runtime, `__call__(self, *args, **kwargs)` executes. This pattern is ideal for stateful decorators (such as keeping an in-memory invocation counter).
- **With arguments (`@ClassDec(arg1, arg2)`):** The class acts as a factory. The constructor `__init__(self, arg1, arg2)` receives the configuration arguments. When Python passes the function, it calls `__call__(self, func)`. Inside `__call__`, the class defines and returns a traditional `wrapper` function with `functools.wraps(func)`.

**Q: Why does decorating an instance method with a class-based decorator break `self`, and how is it fixed?**

When you decorate a method inside a class using a class-based decorator:
```python
class MyService:
    @ClassDecoratorWithoutArgs
    def process_order(self, order_id):
        ...
```
`process_order` becomes an instance of `ClassDecoratorWithoutArgs`. When you invoke `service_instance.process_order(123)`, Python attempts to call `ClassDecoratorWithoutArgs.__call__(123)`. Because `ClassDecoratorWithoutArgs` is a standard class instance stored on the class, Python does not automatically bind `service_instance` as the first argument (`self`), causing a `TypeError: missing 1 required positional argument`.

To fix this, the class decorator must implement the **Descriptor Protocol** by adding a `__get__` method:
```python
def __get__(self, instance, owner):
    if instance is None:
        return self
    return functools.partial(self.__call__, instance)
```
When accessed via `service_instance.process_order`, `__get__` binds `instance` to `self.__call__`, ensuring `self` is passed as the first parameter to the decorated method.

**Q: What happens if you apply a synchronous decorator wrapper to an `async def` function, and how do you write a universal decorator?**

In Python, calling an `async def` function returns an unawaited `coroutine` object. If a synchronous decorator calls `result = func(*args, **kwargs)`, `result` is the unexecuted coroutine. The decorator's post-call logic and timing run immediately before any async work executes, and the caller receives an unawaited coroutine, often triggering `RuntimeWarning: coroutine was never awaited`.

To write a universal decorator that handles both:
1. Inspect the function at decoration time with `inspect.iscoroutinefunction(func)`.
2. If `True`, return an `async def wrapper(*args, **kwargs)` that uses `await func(*args, **kwargs)`.
3. If `False`, return a standard `def wrapper(*args, **kwargs)` that uses `func(*args, **kwargs)`.

## 6. The Traps — What Goes Wrong

### Trap 1: The Inverted Stacking Order Vulnerability (Cache Outside Auth)
Developers often read top-to-bottom and write:
```python
# VULNERABLE CODE
@cache_response(ttl=300)
@require_authentication
def get_user_financials(user_id: str):
    return query_financial_records(user_id)
```
**Why it fails:** At runtime, the top decorator (`cache_response`) executes first. When User A requests their financials, they authenticate, and the response is cached under the endpoint key. When User B (or an unauthenticated attacker) makes a request, `cache_response` intercepts the call, finds the cached response, and returns User A's private financial records immediately—bypassing `@require_authentication` completely.

**The Fix:** Stack security, authentication, and validation on the **outside** (top), and caching/rate-limiting on the **inside** (closer to the function) unless rate-limiting is explicitly intended to protect against unauthenticated DDoS:
```python
# SECURE CODE
@require_authentication
@cache_response(ttl=300)
def get_user_financials(user_id: str):
    return query_financial_records(user_id)
```

### Trap 2: The Import-Time Execution Trap
Placing dynamic, request-time logic outside the inner `wrapper`:
```python
# BROKEN CODE
def set_request_context(func):
    current_time = time.time()  # Evaluated ONCE during server boot!
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        return func(*args, current_time=current_time, **kwargs)
    return wrapper
```
**Why it fails:** Code placed inside the decorator body but outside `wrapper` runs exactly once when Python imports the module. `current_time` will hold the timestamp of when the application server started, not when the endpoint was called.

**The Fix:** Always place per-call dynamic evaluation inside the inner `wrapper`:
```python
def set_request_context(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        current_time = time.time()  # Evaluated on every single invocation
        return func(*args, current_time=current_time, **kwargs)
    return wrapper
```

### Trap 3: Swallowing Return Values
Forgetting to capture and return the result of `func`:
```python
# BROKEN CODE
def log_call(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        print(f"Calling {func.__name__}")
        func(*args, **kwargs)  # Return value is discarded!
    return wrapper
```
**Why it fails:** In Python, a function without an explicit `return` returns `None`. Decorating `def add(a, b): return a + b` with this decorator causes `add(2, 3)` to return `None`.

**The Fix:** Always capture and return the result: `return func(*args, **kwargs)`.

### Trap 4: Decorating Async Functions with Sync Wrappers
Applying synchronous wrappers to async endpoints in FastAPI or Django Async views:
```python
# BROKEN CODE
def measure_time(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        res = func(*args, **kwargs)  # res is a Coroutine, not the value!
        print(f"Time: {time.perf_counter() - start}")
        return res
    return wrapper

@app.get("/users")
@measure_time
async def list_users():
    await asyncio.sleep(1.0)
    return [{"id": 1}]
```
**Why it fails:** The timer prints `0.0001s` because creating a coroutine is near-instant. The coroutine is returned unawaited to FastAPI's route handler, breaking internal middleware or triggering unhandled event loop warnings.

**The Fix:** Inspect with `inspect.iscoroutinefunction(func)` and define an `async def wrapper` that uses `await func(*args, **kwargs)`.

## 7. Compare With Related Concepts

### Decorators vs Higher-Order Functions
- **Comparison:** All decorators are higher-order functions (functions that accept or return other functions). The difference is purely syntax and intent.
- **Key Difference:** Manual higher-order functions require you to explicitly wrap calls at invocation sites (`result = log_wrapper(fetch_data)(user_id)`). The `@` decorator syntax performs the wrapping once at definition time, keeping call sites completely transparent (`result = fetch_data(user_id)`).
- **Rule:** Use decorators for static, declarative cross-cutting behavior applied consistently across all calls; use manual higher-order functions when wrapping behavior must be conditionally decided at runtime per invocation.

### Function Decorators vs Class Decorators
- **Comparison:** Function decorators wrap functions/methods (`@deco def f(): ...`). Class decorators wrap class definitions (`@deco class MyClass: ...`).
- **Key Difference:** A class decorator receives a class constructor (`cls`) as its argument. It can mutate class attributes, attach new methods, wrap `__init__`, or register the class in a central service registry (like `@dataclass` or `@pydantic.dataclasses.dataclass`).
- **Rule:** Use function decorators to wrap individual units of execution; use class decorators to inspect, transform, or register entire classes and their type hierarchies.

### Decorators vs ASGI / WSGI Middleware
- **Comparison:** Both intercept requests, perform pre/post processing, and can short-circuit execution.
- **Key Difference:** Middleware sits at the boundary of the HTTP server, executing uniformly across every single incoming HTTP request before routing takes place. Decorators are applied explicitly to specific functions or route handlers.
- **Rule:** Use middleware for global HTTP lifecycle concerns (CORS headers, gzip compression, request ID tagging); use decorators for endpoint-specific concerns (role-based access control, caching specific queries, custom rate limits).

### Decorators vs Context Managers (`with` block)
- **Comparison:** Both execute setup logic before code runs and cleanup logic after code finishes.
- **Key Difference:** Context managers wrap an arbitrary, localized block of code within a function using `__enter__` and `__exit__`. Decorators wrap an entire function boundary.
- **Rule:** Use context managers when managing localized resources (closing file descriptors, acquiring database locks, managing transaction rollbacks); use decorators when augmenting a callable's interface or lifecycle across all callers.

## 8. 🧠 The Memory Hook

**Decorate inside-out at import time; execute outside-in at call time. If your decorator takes arguments, use three levels: Factory builds the Decorator, Decorator wraps the Function, Wrapper runs the Call.**
