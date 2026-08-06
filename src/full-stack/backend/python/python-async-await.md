# async/await in Python

## Detailed explanation

`async` defines coroutines and `await` pauses until an awaitable completes without blocking the event loop. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

await yields control while I/O waits.

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

In a FastAPI or Django backend, async/await in python affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### What do `async` and `await` do in Python?
- **The Engine Mechanism (Why it behaves this way):** `async def` defines a coroutine function — calling it returns a coroutine object without executing the body. `await` pauses the coroutine, yielding control to the event loop, and resumes when the awaited operation completes. The awaited object must be "awaitable" — a coroutine, a Task, or an object implementing `__await__`. When `await` is reached, Python saves the coroutine's execution frame (local variables, instruction pointer) and schedules it for resumption when the awaited operation signals completion. The event loop monitors I/O operations and resumes coroutines when their I/O is ready. `async` and `await` are keywords (Python 3.5+, PEP 492) that replaced generator-based coroutines (`yield from`).
- **The Unforgettable Mental Model:** The **Pause and Resume Button**. `async` labels a function as pausable. `await` presses the pause button — the function stops here, the event loop does other work, and when the awaited operation finishes, the function resumes from exactly this point.
- **The Trap:** Thinking `async def` runs asynchronously when called. It doesn't — it returns a coroutine object. You must `await` it or schedule it as a task for it to execute.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `async def` defines a coroutine — a function that can be paused and resumed. Calling an async function returns a coroutine object; it doesn't execute. `await` pauses the coroutine, yields control to the event loop, and resumes when the awaited operation completes. The key insight is that `await` is a cooperation point — the coroutine voluntarily gives up control, allowing the event loop to run other coroutines. This is how a single thread handles thousands of concurrent I/O operations."

#### What is the difference between `async def` and `def`?
- **The Engine Mechanism (Why it behaves this way):** A regular `def` function executes synchronously — it runs to completion (or raises) before returning. An `async def` function, when called, returns a coroutine object immediately without executing. The body only runs when the coroutine is awaited or scheduled as a task. Inside an `async def`, you can use `await` to pause and yield control. Inside a regular `def`, you cannot use `await` — it's a syntax error. An `async def` can be called from a regular `def`, but the caller gets a coroutine object and can't await it (unless they're also async or use `asyncio.run()`).
- **The Unforgettable Mental Model:** The **Regular Phone vs. Walkie-Talkie**. A regular function is like a phone call — you talk until you hang up. An async function is like a walkie-talkie — you say your piece, release the button (`await`), let others talk, then press again to continue.
- **The Trap:** Calling an async function from a sync function and expecting it to run. It returns a coroutine object that must be awaited or scheduled.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A regular `def` runs synchronously to completion. An `async def` returns a coroutine object when called — the body only runs when awaited. Inside `async def`, you can use `await` to yield control to the event loop. Inside regular `def`, you cannot use `await`. The practical implication: once you go async, you stay async — async functions call async functions, all the way up to the entry point (FastAPI handler, `asyncio.run()`). Mixing sync and async requires care — I use `asyncio.run()` to bridge the gap or `run_in_executor` to run sync code in a thread pool."

#### What can you `await` in Python?
- **The Engine Mechanism (Why it behaves this way):** You can `await` any "awaitable" object: coroutines (from `async def`), Tasks (from `asyncio.create_task()`), Futures (from `asyncio.Future`), and objects implementing `__await__`. Common awaitables: `asyncio.sleep()`, async HTTP client methods (`await client.get()`), async database queries (`await conn.fetch()`), `asyncio.gather()`, `asyncio.wait()`, `asyncio.Queue.get()`, `asyncio.Lock.acquire()`. You cannot await regular functions, regular values, or sync I/O operations — they must be wrapped in async equivalents. `await` on a non-awaitable raises `TypeError: object X can't be used in 'await' expression`.
- **The Unforgettable Mental Model:** The **VIP List**. Only objects on the awaitable VIP list can enter the `await` club: coroutines, tasks, futures, and objects with `__await__`. Everyone else gets turned away with a TypeError.
- **The Trap:** Trying to `await` a regular function call — `await requests.get(url)` fails because `requests.get()` returns a Response, not a coroutine. Use `await httpx.AsyncClient().get(url)`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: You can `await` coroutines, Tasks, Futures, and any object implementing `__await__`. Common examples: `asyncio.sleep()`, async HTTP clients, async database queries, `asyncio.gather()`. You cannot await regular functions or sync I/O — `await requests.get()` fails because requests is synchronous. I use async equivalents: httpx instead of requests, asyncpg instead of psycopg2. The rule is simple: if it's not a coroutine, task, or future, you can't await it."

#### What bug can happen if you misunderstand `async/await`?
- **The Engine Mechanism (Why it behaves this way):** The unawaited coroutine bug: `result = async_func()` — `result` is a coroutine object, not the function's return value. The coroutine warning appears in Python 3.11+: "coroutine 'async_func' was never awaited." The blocking await bug: `await sync_func()` where `sync_func` does CPU work — blocks the event loop. The nested async bug: defining `async def` inside `async def` and forgetting to await the inner one. The `await` in sync context bug: using `await` outside an `async def` raises `SyntaxError`. The `asyncio.run()` multiple calls bug: calling `asyncio.run()` twice in the same thread raises `RuntimeError` — it creates and closes an event loop.
- **The Unforgettable Mental Model:** The **Unopened Envelope**. Calling an async function without `await` is like receiving an envelope but never opening it — the contents (result) are there, but you never see them.
- **The Trap:** Not awaiting a coroutine and not realizing it — the code "works" but the async function never executes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most common async/await bug is forgetting `await` — `result = async_func()` gives you a coroutine object, not the result. Python 3.11+ warns about this, but earlier versions silently ignore it. Another bug is blocking the event loop with sync code inside async functions — `await` doesn't make sync code async. I also watch for `asyncio.run()` — it can only be called once per thread, as it creates and closes an event loop. For nested async calls, I ensure every async function is awaited or scheduled as a task."

#### How does `async/await` affect testing?
- **The Engine Mechanism (Why it behaves this way):** Testing async functions requires an async test runner (`pytest-asyncio`). Test functions must be `async def` and use `await` for async calls. Mocking async functions requires `AsyncMock`. Testing concurrent behavior requires `asyncio.gather` or `asyncio.create_task`. Testing that `await` yields correctly requires timing assertions — two concurrent 1-second sleeps should complete in ~1 second. Testing error handling in async code uses `pytest.raises` with `await`: `with pytest.raises(SomeError): await async_func()`.
- **The Unforgettable Mental Model:** The **Async Test Lab**. Testing async code is the same as testing sync code, but everything is wrapped in `await` and the test runner is async-aware.
- **The Trap:** Using regular `Mock` for async functions — the mock returns a non-awaitable, causing `TypeError` when awaited.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test async functions with `pytest-asyncio` — async test functions with `@pytest.mark.asyncio`. I use `await` for all async calls and `AsyncMock` for mocking async dependencies. I test concurrency by running multiple coroutines with `asyncio.gather` and verifying timing. I test error handling with `pytest.raises` around `await` calls. The key difference from sync testing is the async runner and the need to await everything — but the testing principles are the same."

#### How would you explain `async/await` with code?
- **The Engine Mechanism (Why it behaves this way):** Show basic async: `async def greet(name): await asyncio.sleep(1); return f"Hello, {name}"`. Show calling: `coro = greet("Alice"); result = await coro`. Show concurrency: `async def main(): results = await asyncio.gather(greet("A"), greet("B"), greet("C"))`. Show timing: three 1-second sleeps in ~1 second. Show the unawaited bug: `coro = greet("Alice"); print(coro)` — prints `<coroutine object greet at 0x...>`, not the result. Show sync vs async call chain: `async def handler(): data = await fetch(); processed = await process(data); return processed`.
- **The Unforgettable Mental Model:** The **Coroutine Object Demo**. Show that calling an async function returns a coroutine object, not the result — this is the most fundamental concept.
- **The Trap:** Not demonstrating the timing difference between sequential and concurrent awaits.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate async/await with three examples. First, calling an async function shows it returns a coroutine object — `print(greet('Alice'))` shows `<coroutine object>`, not the result. You must `await` it. Second, concurrent execution with `asyncio.gather` — three 1-second sleeps complete in ~1 second. Third, the async call chain — `await fetch()`, then `await process()`, showing how async functions compose. These examples cover the core concepts: coroutine objects, awaiting, and concurrency."

## 8. Active recall test

1. **What does `async def` do when called?**
   - **Explanation:** It returns a coroutine object without executing the body. The body only runs when the coroutine is awaited or scheduled as a task.

2. **Can you use `await` inside a regular `def` function?**
   - **Explanation:** No. `await` is a syntax error outside `async def`. Regular functions cannot pause and yield control to an event loop.

3. **What happens if you forget to `await` a coroutine?**
   - **Explanation:** The coroutine is never executed. You get a coroutine object instead of the result. Python 3.11+ emits a runtime warning about unawaited coroutines.

4. **What types of objects can you `await`?**
   - **Explanation:** Coroutines (from `async def`), Tasks (from `asyncio.create_task()`), Futures, and any object implementing `__await__`.

5. **How do you run an async function from sync code?**
   - **Explanation:** Use `asyncio.run(async_func())` to create an event loop, run the coroutine, and close the loop. Can only be called once per thread.

6. **Does `await` make synchronous code asynchronous?**
   - **Explanation:** No. `await sync_func()` doesn't work — `sync_func` must return an awaitable. `await` only works with coroutines, tasks, futures, and objects implementing `__await__`.

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare async/await in Python with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain async/await in Python and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define async/await in Python.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
