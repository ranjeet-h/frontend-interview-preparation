# Decorators

## Detailed explanation

Decorators wrap functions or classes to add behavior without changing the original definition body. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

Decorator is a function that returns an enhanced function.

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

In a FastAPI or Django backend, decorators affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### What are decorators in Python?
- **The Engine Mechanism (Why it behaves this way):** A decorator is a callable that takes a function (or class) as input and returns a modified version. The `@decorator` syntax is syntactic sugar for `func = decorator(func)`. The decorator receives the original function object, creates a wrapper function (usually using `*args, **kwargs`), and returns the wrapper. When the decorated function is called, the wrapper executes — it can run code before, after, or around the original function, modify arguments, modify the return value, or even skip calling the original entirely. `functools.wraps` copies metadata (`__name__`, `__doc__`, `__module__`) from the original to the wrapper, preserving introspection.
- **The Unforgettable Mental Model:** The **Gift Wrapping**. The original function is the gift. The decorator is the wrapping paper and bow — it doesn't change what's inside, but it adds presentation (logging, auth, caching) around it. The recipient (caller) sees the wrapped version.
- **The Trap:** Forgetting `functools.wraps` — without it, `func.__name__` returns `"wrapper"` instead of the original function name, breaking debugging, logging, and documentation tools.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A decorator is a function that takes another function and returns an enhanced version. It's syntactic sugar for function composition — `@decorator` is equivalent to `func = decorator(func)`. The wrapper can add behavior like logging, authentication, caching, or timing without modifying the original function. I always use `functools.wraps` to preserve the original function's metadata, which is critical for debugging and documentation. In FastAPI, decorators are used extensively for route definitions, dependency injection, and middleware."

#### Why do decorators matter in backend Python services?
- **The Engine Mechanism (Why it behaves this way):** Decorators provide cross-cutting concern separation — authentication, rate limiting, logging, error handling, and caching are applied declaratively without cluttering business logic. In FastAPI, `@app.get("/users")` is a decorator that registers the function as a route handler. In Django, `@login_required` and `@csrf_exempt` control access. Custom decorators like `@retry`, `@cache`, and `@timing` add operational concerns. Because decorators execute at import time (when the module is loaded), they can register functions, build routing tables, and configure behavior before any request is handled.
- **The Unforgettable Mental Model:** The **Security Checkpoint**. Instead of checking every employee's ID at their desk (inline auth checks), you place a checkpoint at the building entrance (decorator). Every request passes through it automatically.
- **The Trap:** Decorators run at import time, not call time. If a decorator has side effects (like database queries or network calls), they execute when the module is imported, not when the function is called.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Decorators are essential for separating cross-cutting concerns from business logic. In backend services, I use them for authentication (`@require_auth`), rate limiting (`@rate_limit`), caching (`@cache`), retry logic (`@retry`), and error handling (`@handle_errors`). They make code cleaner — the business function focuses on its core logic, while decorators handle operational concerns. In FastAPI, the entire routing system is decorator-based. I'm careful to keep decorators import-time safe — no side effects during decoration, only setup."

#### What bug can happen if you misunderstand decorators?
- **The Engine Mechanism (Why it behaves this way):** The metadata loss bug: without `@functools.wraps`, the decorated function loses its `__name__`, `__doc__`, and signature — breaking introspection, help(), and tools like Sphinx. The argument mismatch bug: a decorator wrapper that uses `def wrapper(arg)` instead of `def wrapper(*args, **kwargs)` breaks functions with different signatures. The import-time side effect bug: a decorator that makes a database connection at decoration time fails during testing or CLI commands that import the module. The async decorator bug: decorating an async function with a sync wrapper breaks it — you need `async def wrapper` and `await func(*args, **kwargs)`.
- **The Unforgettable Mental Model:** The **Identity Theft**. Without `functools.wraps`, the decorated function loses its identity — it looks like "wrapper" to every introspection tool. It's like someone wearing a mask to a party — nobody knows who they really are.
- **The Trap:** Writing a decorator that works for sync functions but breaks async ones. Async functions need async-aware decorators.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most common decorator bugs are: forgetting `functools.wraps`, which breaks introspection and debugging; using fixed signatures in the wrapper instead of `*args, **kwargs`, which breaks functions with different parameters; and writing sync decorators for async functions, which breaks the event loop. I also watch for import-time side effects — decorators should only set up behavior, not execute it. For async decorators, I use `async def wrapper` and `await func(*args, **kwargs)`, or I use libraries like `asgiref.sync.sync_to_async`."

#### How do decorators affect testing?
- **The Engine Mechanism (Why it behaves this way):** Decorators can make testing harder if they add behavior you don't want in tests — like authentication checks, rate limiting, or network calls. You can test the undecorated function by accessing `func.__wrapped__` (set by `functools.wraps`). You can also use `unittest.mock.patch` to replace decorator behavior. When testing the decorator itself, you create a mock function, apply the decorator, and verify the wrapper's behavior. Parameterized decorators (like `@retry(times=3)`) need testing with different parameter combinations.
- **The Unforgettable Mental Model:** The **X-Ray Machine**. `__wrapped__` is like an X-ray — it lets you see through the decorator wrapping to test the original function underneath.
- **The Trap:** Testing only the decorated function without testing the decorator in isolation. The decorator might have bugs that only appear with certain function signatures.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test decorators in two ways. First, I test the decorator itself by applying it to mock functions and verifying the wrapper's behavior — does it call the original? Does it handle errors? Does it respect parameters? Second, I test the decorated function by accessing `func.__wrapped__` to bypass the decorator when I want to test the core logic in isolation. I also use `mock.patch` to replace external dependencies that decorators might use, like auth services or cache backends."

#### How do decorators affect performance?
- **The Engine Mechanism (Why it behaves this way):** Each decorator adds a function call layer — calling a decorated function means calling the wrapper, which then calls the original. This adds a small overhead (nanoseconds per call). For frequently-called functions in hot paths, stacking many decorators can add measurable overhead. However, decorators that add caching (`@lru_cache`) or skip execution (early returns for auth failures) can dramatically improve performance. The import-time cost of decorators is paid once when the module loads, not per request.
- **The Unforgettable Mental Model:** The **Toll Road**. Each decorator is a toll booth — a small delay per pass. But some toll booths (caching) give you a fast-pass that skips future tolls entirely.
- **The Trap:** Stacking too many decorators on hot-path functions. Five decorators means five function call layers per invocation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Decorators add a small per-call overhead — each wrapper is an extra function call. For most backend code, this is negligible. But for hot-path functions called millions of times, I'm mindful of decorator stacking. On the flip side, decorators like `@lru_cache` can dramatically improve performance by avoiding redundant computation. I profile with `cProfile` to identify if decorator overhead is significant, and I use `@lru_cache` strategically for expensive pure functions. The import-time cost is paid once and is rarely a concern."

#### How would you explain decorators with code?
- **The Engine Mechanism (Why it behaves this way):** Show a basic decorator: `def timing(func): def wrapper(*args, **kwargs): start = time.perf_counter(); result = func(*args, **kwargs); print(f"{func.__name__} took {time.perf_counter()-start:.4f}s"); return result; return wrapper`. Show `@functools.wraps`: add `@wraps(func)` above `wrapper`. Show a parameterized decorator: `def retry(max_attempts=3): def decorator(func): def wrapper(*args, **kwargs): ...; return wrapper; return decorator`. Show async decorator: `def async_timing(func): async def wrapper(*args, **kwargs): ...; return wrapper`. Show decorator stacking: `@auth @cache @timing def handler(): ...` — decorators apply bottom-up (`timing` first, then `cache`, then `auth`).
- **The Unforgettable Mental Model:** The **Layer Cake**. Stacking decorators is like building a cake — the bottom layer (closest to the function) executes first, then the next, then the next. The top layer (closest to the caller) is the first to receive the call.
- **The Trap:** Thinking decorators apply top-to-bottom. They apply bottom-to-bottom — `@a @b @c def f` is `f = a(b(c(f)))`, so `c` wraps first.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate decorators with four examples. First, a timing decorator that measures execution time — shows the basic wrapper pattern. Second, the same decorator with `@functools.wraps` — shows why metadata preservation matters. Third, a parameterized retry decorator — shows the three-level nesting pattern (parameter → decorator → wrapper). Fourth, an async-aware decorator — shows that async functions need async wrappers. I also explain decorator stacking order: `@a @b @c def f` applies `c` first, then `b`, then `a` — bottom-up."

## 8. Active recall test

1. **What does `@decorator` syntax actually do?**
   - **Explanation:** It's syntactic sugar for `func = decorator(func)`. The decorator receives the original function and returns a replacement (usually a wrapper). The original name is rebound to the wrapper.

2. **Why is `functools.wraps` important?**
   - **Explanation:** It copies metadata (`__name__`, `__doc__`, `__module__`, `__qualname__`, `__annotations__`, `__dict__`) from the original function to the wrapper. Without it, introspection tools see "wrapper" instead of the original function name.

3. **How do you test a function that has a decorator?**
   - **Explanation:** Access `func.__wrapped__` to get the original undecorated function. Or use `mock.patch` to replace the decorator's behavior. Test the decorator separately by applying it to mock functions.

4. **What is the order of decorator application when stacking?**
   - **Explanation:** Bottom-up. `@a @b @c def f` is equivalent to `f = a(b(c(f)))`. The decorator closest to the function (`c`) wraps first, then `b`, then `a`. The outermost decorator (`a`) is called first at runtime.

5. **How do you write a decorator for an async function?**
   - **Explanation:** The wrapper must also be async: `async def wrapper(*args, **kwargs): ... result = await func(*args, **kwargs); ...`. A sync wrapper around an async function returns a coroutine object without awaiting it.

6. **When does decorator code execute — at import time or call time?**
   - **Explanation:** The decorator function itself executes at import time (when the module is loaded). The wrapper function executes at call time (when the decorated function is invoked). Side effects in the decorator body happen at import time.

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare Decorators with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain Decorators and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define Decorators.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
