# How Decorators Work

## Detailed explanation

A decorator receives a function, creates a wrapper, and reassigns the original name to the wrapper. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

`@decorator` is syntax for function replacement.

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

In a FastAPI or Django backend, how decorators work affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### How do decorators work under the hood?
- **The Engine Mechanism (Why it behaves this way):** When Python encounters `@decorator` above a function definition, it: (1) creates the function object, (2) calls `decorator(function_object)`, (3) assigns the return value back to the function's name. The decorator is just a function call that happens during module import. The returned wrapper is a closure — it captures the original function in its enclosing scope. When you call the decorated function, you're calling the wrapper, which has access to the original via the closure. The wrapper typically uses `*args, **kwargs` to accept any signature and forwards them to the original with `return func(*args, **kwargs)`.
- **The Unforgettable Mental Model:** The **Factory Assembly Line**. The function is built on the assembly line (def statement), then passes through a quality-check station (decorator) that adds a protective casing (wrapper), and finally gets placed on the shelf (name binding). The customer (caller) only sees the cased version.
- **The Trap:** Thinking decorators modify the original function. They don't — they replace it with a new function (the wrapper). The original still exists, captured in the wrapper's closure.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Decorators work through function composition at import time. When Python sees `@decorator`, it creates the function object, passes it to the decorator, and rebinds the name to whatever the decorator returns. The decorator typically returns a wrapper function — a closure that captures the original function. When you call the decorated function, you're calling the wrapper, which can execute code before and after calling the original. The key insight is that decorators don't modify the original function; they replace it with a new one that wraps the original."

#### What is the execution flow of a decorated function?
- **The Engine Mechanism (Why it behaves this way):** There are two phases: decoration time (import) and call time (runtime). At decoration time: the decorator function is called with the original function as argument, and it returns a wrapper. This happens once when the module is imported. At call time: the wrapper is invoked with the caller's arguments, the wrapper executes its pre-logic, calls the original function with the arguments, executes its post-logic, and returns the result. For stacked decorators, the call flows through each wrapper layer: caller → outer_wrapper → middle_wrapper → inner_wrapper → original_function.
- **The Unforgettable Mental Model:** The **Russian Doll**. Calling a decorated function is like opening nested dolls — you open the outer one (outer decorator), then the next (middle decorator), then the inner one (inner decorator), until you reach the core (original function). Each doll can add something before passing to the next.
- **The Trap:** Confusing decoration-time execution with call-time execution. Code in the decorator body (outside the wrapper) runs at import time. Code inside the wrapper runs at call time.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: There are two distinct phases. Decoration happens at import time — the decorator receives the function and returns a wrapper. This runs once. Call time happens every time you invoke the decorated function — the wrapper executes, optionally runs pre-logic, calls the original, runs post-logic, and returns. For stacked decorators, the call flows through each wrapper layer from outermost to innermost, reaches the original function, then returns back through the layers. Understanding this two-phase model is critical for writing correct decorators — especially avoiding import-time side effects."

#### What is the difference between a decorator and a decorator factory?
- **The Engine Mechanism (Why it behaves this way):** A simple decorator takes a function and returns a wrapper: `def decorator(func): def wrapper(*args, **kwargs): ...; return wrapper; return wrapper`. A decorator factory (parameterized decorator) takes arguments and returns a decorator: `def factory(arg): def decorator(func): def wrapper(*args, **kwargs): ...; return wrapper; return decorator; return factory`. The factory has three levels of nesting: arguments → decorator → wrapper. When you write `@factory("value")`, Python calls `factory("value")` which returns the decorator, then applies that decorator to the function.
- **The Unforgettable Mental Model:** The **Vending Machine**. A simple decorator is like a vending machine that always gives the same snack. A decorator factory is like a vending machine where you first select the snack type (parameter), then it gives you a machine that dispenses that specific snack.
- **The Trap:** Forgetting the extra level of nesting. `@decorator` applies `decorator(func)`. `@decorator(arg)` applies `decorator(arg)(func)` — the decorator must return a decorator, not a wrapper.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A simple decorator takes a function and returns a wrapper — two levels. A decorator factory takes arguments and returns a decorator that takes a function and returns a wrapper — three levels. The key difference is the extra nesting: `def factory(arg): def decorator(func): def wrapper(...): ...; return wrapper; return decorator`. When you write `@factory(3)`, Python calls `factory(3)` to get the decorator, then applies it to the function. I use decorator factories for configurable behavior like `@retry(max_attempts=3)` or `@cache(ttl=60)`."

#### How do you write a decorator that works with both sync and async functions?
- **The Engine Mechanism (Why it behaves this way):** You need to detect whether the wrapped function is a coroutine function using `inspect.iscoroutinefunction(func)`. If it is, return an async wrapper that awaits the original. If not, return a sync wrapper. Alternatively, use `asyncio.iscoroutinefunction(func)`. The wrapper must match the original's async/sync nature — an async wrapper around a sync function works (it just wraps the result in a coroutine), but a sync wrapper around an async function breaks (it returns a coroutine without awaiting it, so the original never executes).
- **The Unforgettable Mental Model:** The **Universal Adapter**. A sync-async decorator is like a power adapter that detects whether the device needs AC or DC and adjusts accordingly. It works with both, but the internal wiring is different.
- **The Trap:** Using a sync wrapper for an async function — the wrapper returns the coroutine object without awaiting it, so the function's code never runs. The caller gets a coroutine they must await, but the decorator's pre/post logic never executes around the actual function body.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I check `inspect.iscoroutinefunction(func)` to determine if the wrapped function is async. If it is, I return an `async def wrapper` that awaits the original. If not, I return a regular `def wrapper`. This ensures the decorator works correctly in both contexts. I also use libraries like `asgiref` or `functools.wraps` to handle the metadata copying. In FastAPI, where mixed sync/async endpoints are common, this pattern is essential for reusable middleware decorators."

#### How does `functools.wraps` work internally?
- **The Engine Mechanism (Why it behaves this way):** `functools.wraps` is itself a decorator that copies attributes from the original function to the wrapper. It updates the wrapper's `__module__`, `__name__`, `__qualname__`, `__annotations__`, `__doc__`, and `__dict__` from the original. It also sets `__wrapped__` to point to the original function, enabling access to the undecorated version. Internally, it uses `functools.update_wrapper`, which does the attribute copying. Without `wraps`, the wrapper has its own identity (name="wrapper", doc=None), breaking `help()`, `repr()`, debuggers, and documentation generators.
- **The Unforgettable Mental Model:** The **Identity Transfer**. `functools.wraps` is like transferring the original function's ID card to the wrapper — same name, same description, same credentials. The wrapper looks identical to the original from the outside.
- **The Trap:** Thinking `wraps` copies the function's code or behavior. It only copies metadata attributes. The wrapper's code (the actual logic) remains unchanged.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `functools.wraps` copies metadata attributes from the original function to the wrapper: `__name__`, `__doc__`, `__module__`, `__qualname__`, `__annotations__`, and `__dict__`. It also sets `__wrapped__` to reference the original, allowing access to the undecorated function. This is critical for debugging — without it, stack traces show 'wrapper' instead of the actual function name. It's also essential for tools like Sphinx, pytest, and IDEs that rely on function metadata. I always use it in every decorator I write."

#### How would you demonstrate decorator mechanics with code?
- **The Engine Mechanism (Why it behaves this way):** Show the two-phase execution: `print("import time"); def deco(func): print("decoration time"); def wrapper(*args, **kwargs): print("call time"); return func(*args, **kwargs); return wrapper; @deco def hello(): print("hello body")` — output shows "import time", "decoration time" during import, then "call time", "hello body" when called. Show `__wrapped__`: `hello.__wrapped__()` calls the original directly. Show the closure: `hello.__closure__[0].cell_contents` is the original function. Show decorator stacking order with print statements in each wrapper.
- **The Unforgettable Mental Model:** The **Print Trail**. Adding print statements at each stage (import, decoration, call, wrapper pre, original, wrapper post) creates a visible trail of execution that makes the abstract concrete.
- **The Trap:** Not demonstrating the difference between decoration-time and call-time clearly enough. The print statement approach makes it obvious.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate decorators with a print-trace example. I add print statements at import time, decoration time, and call time. Running the code shows that decoration happens once during import, while the wrapper executes on every call. I also show `__wrapped__` to access the original function, and `__closure__` to inspect what the wrapper captured. For stacked decorators, I add unique print statements to each wrapper and show the call order — outer to inner on the way in, inner to outer on the way out. This makes the execution flow completely transparent."

## 8. Active recall test

1. **When does the decorator function execute?**
   - **Explanation:** At import time, when the module is loaded. Python calls the decorator with the function object and rebinds the name to the return value. This happens once, not on every function call.

2. **What is a closure and how does it relate to decorators?**
   - **Explanation:** A closure is a function that captures variables from its enclosing scope. The decorator's wrapper is a closure that captures the original function. This allows the wrapper to call the original even though it's not passed as an argument.

3. **What is the difference between `@deco` and `@deco(arg)`?**
   - **Explanation:** `@deco` calls `deco(func)`. `@deco(arg)` calls `deco(arg)(func)` — the first call returns a decorator, which is then applied to the function. `@deco(arg)` requires three levels of nesting.

4. **How do you access the original undecorated function?**
   - **Explanation:** Via `func.__wrapped__`, which is set by `functools.wraps`. This allows testing the original logic without decorator interference.

5. **What happens if you use a sync wrapper for an async function?**
   - **Explanation:** The wrapper returns the coroutine object without awaiting it. The original function's code never executes — the caller gets an unexecuted coroutine. The decorator's pre/post logic also doesn't wrap the actual execution.

6. **In what order do stacked decorators execute?**
   - **Explanation:** Call time: outermost to innermost (top to bottom in source). Return time: innermost to outermost. Decoration time: bottom to top (innermost decorator applies first).

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare How Decorators Work with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain How Decorators Work and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define How Decorators Work.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
