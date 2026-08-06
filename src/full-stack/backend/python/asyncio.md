# asyncio

## Detailed explanation

asyncio is Python’s standard library for cooperative async I/O with event loops, tasks, and coroutines. For backend interviews, explain how this affects API correctness, performance, testing, reliability, and maintainability in Python services.

## 1. One-line mental model

asyncio runs many waiting I/O tasks on one thread.

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

In a FastAPI or Django backend, asyncio affects how request data is represented, how dependencies are passed, how resources are cleaned up, and how code behaves under load.

## 7. Common interview questions

#### What is asyncio in Python?
- **The Engine Mechanism (Why it behaves this way):** `asyncio` is Python's standard library for asynchronous I/O using an event loop, coroutines, tasks, and futures. The event loop is a single-threaded scheduler that runs coroutines, switching between them when they `await` an I/O operation. When a coroutine awaits (e.g., `await asyncio.sleep(1)` or `await response.read()`), it yields control back to the event loop, which runs other ready coroutines. When the I/O completes, the awaiting coroutine is resumed. Tasks (`asyncio.create_task()`) wrap coroutines and run them concurrently. `asyncio.gather()` runs multiple coroutines concurrently and collects results. The event loop uses OS-level I/O multiplexing (epoll on Linux, kqueue on macOS) to monitor many file descriptors efficiently.
- **The Unforgettable Mental Model:** The **Restaurant Chef**. A single chef (event loop) manages multiple orders (coroutines). When one order goes in the oven (I/O wait), the chef works on another order. When the oven timer rings (I/O complete), the chef returns to that order. One chef, many orders, no idle time.
- **The Trap:** Thinking asyncio provides parallelism. It provides concurrency — multiple tasks overlap in time, but only one executes at any instant (single-threaded).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: asyncio is Python's framework for cooperative concurrency using an event loop. Coroutines voluntarily yield control with `await` when waiting for I/O, allowing the event loop to run other coroutines. This enables a single thread to handle thousands of concurrent I/O operations — perfect for web servers, API clients, and database drivers. Unlike threading, there's no GIL contention and no thread-safety concerns for shared state (since only one coroutine runs at a time). I use asyncio in FastAPI for high-concurrency I/O-bound services."

#### Why does asyncio matter in backend Python services?
- **The Engine Mechanism (Why it behaves this way):** Backend services are typically I/O-bound — waiting for databases, external APIs, file systems, and network responses. Threading has overhead (memory per thread, context switching, GIL contention). Asyncio handles thousands of concurrent connections with a single thread, using minimal memory. ASGI servers like Uvicorn and Hypercorn use asyncio to serve many requests concurrently. Async database drivers (asyncpg, databases) and HTTP clients (httpx, aiohttp) integrate with the event loop. The result is higher throughput and lower memory usage compared to thread-based servers.
- **The Unforgettable Mental Model:** The **Highway vs. Train**. Threading is like adding more lanes (threads) to a highway — each lane costs money (memory). Asyncio is like a high-speed train — one track (thread), many cars (coroutines), efficient and fast.
- **The Trap:** Using asyncio for CPU-bound work. CPU-bound tasks block the event loop, freezing all other coroutines. Use `run_in_executor` or multiprocessing for CPU work.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: asyncio matters in backend services because they're I/O-bound — waiting for databases, APIs, and files. Asyncio handles thousands of concurrent connections with a single thread, using far less memory than threading. ASGI servers like Uvicorn use asyncio natively. I use async database drivers (asyncpg) and HTTP clients (httpx) to keep the event loop moving. The key rule: asyncio for I/O-bound work, multiprocessing for CPU-bound work. Mixing them requires care — CPU work blocks the event loop, so I offload it to `run_in_executor`."

#### What bug can happen if you misunderstand asyncio?
- **The Engine Mechanism (Why it behaves this way):** The blocking call bug: `await asyncio.sleep(1)` yields control; `time.sleep(1)` blocks the entire event loop — all coroutines freeze. The unawaited coroutine bug: `coro = some_async_func()` creates a coroutine object but doesn't run it — you must `await coro` or `asyncio.create_task(coro)`. The shared state bug: while asyncio is single-threaded, `await` points create concurrency windows — two coroutines can interleave at `await` points, causing race conditions on shared mutable state. The event loop closed bug: calling async code from sync context without a running event loop raises `RuntimeError`. The `asyncio.gather` error handling bug: by default, `gather` cancels remaining tasks on first error — use `return_exceptions=True` to collect all results.
- **The Unforgettable Mental Model:** The **Traffic Block**. A blocking call (`time.sleep`, synchronous HTTP request) in an async function is like a car stopping in the middle of a one-lane tunnel — nothing behind it can move.
- **The Trap:** Forgetting `await` — the coroutine is created but never executed. Python 3.11+ warns about unawaited coroutines, but earlier versions silently ignore them.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The most common asyncio bug is calling blocking code in an async function — `time.sleep()` or synchronous HTTP requests block the entire event loop. Use `await asyncio.sleep()` and async HTTP clients (httpx). Another bug is forgetting `await` — the coroutine is created but never runs. Shared state is also tricky — even though asyncio is single-threaded, `await` points create concurrency windows where other coroutines can interleave. I use `asyncio.Lock` for shared mutable state. For error handling, I use `asyncio.gather(..., return_exceptions=True)` to collect all results instead of cancelling on first error."

#### How does asyncio affect testing?
- **The Engine Mechanism (Why it behaves this way):** Testing async code requires an async test runner. `pytest-asyncio` provides `@pytest.mark.asyncio` to run async test functions. Tests must `await` async functions. Mocking async functions requires `AsyncMock` (from `unittest.mock`), not regular `Mock` — `AsyncMock` returns an awaitable. Testing concurrent behavior requires `asyncio.gather` or `asyncio.create_task` to run multiple coroutines. Testing timeouts uses `asyncio.wait_for(coro, timeout)`. Testing that the event loop isn't blocked requires measuring execution time — if two 1-second sleeps run concurrently in ~1 second, the event loop is working correctly.
- **The Unforgettable Mental Model:** The **Async Mirror**. Testing async code is like testing in a mirror world — everything is the same, but you need `await` and `AsyncMock` instead of regular calls and mocks.
- **The Trap:** Using regular `Mock` for async functions — calling an async mock without `await` returns the mock object, not the awaited result.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test async code with `pytest-asyncio` — marking tests with `@pytest.mark.asyncio` and using `await` for async calls. I use `AsyncMock` for mocking async functions, which returns awaitables. I test concurrency by running multiple coroutines with `asyncio.gather` and verifying they complete in the expected time (e.g., two 1-second sleeps in ~1 second, not 2). I test timeouts with `asyncio.wait_for` and verify `asyncio.TimeoutError` is raised. The key is to test both the async behavior and the concurrency properties."

#### How does asyncio affect performance or memory?
- **The Engine Mechanism (Why it behaves this way):** Asyncio uses minimal memory per connection — a coroutine frame is ~1KB, compared to ~8MB per thread. This allows handling 10,000+ concurrent connections with ~10MB of memory. The event loop has low overhead — switching between coroutines is a context switch in Python, not an OS context switch. However, asyncio doesn't speed up individual operations — a single HTTP request takes the same time async or sync. The benefit is throughput: handling many requests concurrently. CPU-bound operations block the event loop, degrading performance for all coroutines.
- **The Unforgettable Mental Model:** The **Apartment Building vs. Houses**. Threading is like building separate houses (threads) — each needs its own land (memory). Asyncio is like an apartment building — many units (coroutines) share the same foundation (thread), using far less land.
- **The Trap:** Expecting asyncio to make individual operations faster. It doesn't — it makes concurrent operations more efficient.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Asyncio's performance benefit is in throughput, not latency. A single HTTP request takes the same time async or sync. But asyncio can handle 10,000 concurrent connections with ~10MB of memory, while threading would need ~80GB. The event loop switches between coroutines with minimal overhead — Python-level context switches, not OS-level. For CPU-bound work, asyncio is the wrong tool — it blocks the event loop. I use `run_in_executor` to offload CPU work to a thread pool, or I use multiprocessing. The key metric is connections per second, not requests per second for a single connection."

#### How would you explain asyncio with code?
- **The Engine Mechanism (Why it behaves this way):** Show basic async: `async def fetch(url): async with httpx.AsyncClient() as client: return await client.get(url)`. Show concurrency: `async def main(): results = await asyncio.gather(fetch(url1), fetch(url2), fetch(url3))`. Show timing demo: `async def demo(): start = time.perf_counter(); await asyncio.gather(asyncio.sleep(1), asyncio.sleep(1), asyncio.sleep(1)); print(time.perf_counter() - start)` — prints ~1.0, not 3.0. Show blocking vs non-blocking: `async def bad(): time.sleep(1)` (blocks) vs `async def good(): await asyncio.sleep(1)` (yields). Show task creation: `task = asyncio.create_task(fetch(url)); ...; await task`.
- **The Unforgettable Mental Model:** The **Timing Demo**. The most convincing demo is three 1-second sleeps running concurrently in ~1 second total — this proves concurrency is working.
- **The Trap:** Not showing the difference between blocking and non-blocking calls. This is the most critical distinction.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I demonstrate asyncio with three examples. First, a basic async HTTP fetch using httpx. Second, concurrent execution with `asyncio.gather` — three 1-second sleeps complete in ~1 second, proving concurrency. Third, the blocking vs non-blocking demo — `time.sleep(1)` blocks the event loop (3 seconds total), while `await asyncio.sleep(1)` yields control (1 second total). This contrast makes the concept undeniable. I also show `asyncio.create_task` for fire-and-forget background tasks."

## 8. Active recall test

1. **What is the difference between concurrency and parallelism in asyncio?**
   - **Explanation:** Asyncio provides concurrency (tasks overlap in time) but not parallelism (tasks don't run simultaneously). Only one coroutine executes at any instant on a single thread.

2. **What happens if you call `time.sleep()` in an async function?**
   - **Explanation:** It blocks the entire event loop — all coroutines freeze for the sleep duration. Use `await asyncio.sleep()` instead, which yields control to the event loop.

3. **How do you run multiple async functions concurrently?**
   - **Explanation:** Use `asyncio.gather(coro1, coro2, coro3)` to run them concurrently and collect results. Or use `asyncio.create_task()` to schedule tasks individually.

4. **What is the memory cost of an asyncio coroutine vs. a thread?**
   - **Explanation:** A coroutine frame uses ~1KB. A thread uses ~8MB (stack size). Asyncio can handle 10,000+ connections with ~10MB; threading would need ~80GB.

5. **How do you mock an async function in tests?**
   - **Explanation:** Use `unittest.mock.AsyncMock` instead of `Mock`. `AsyncMock` returns an awaitable, so `await mock()` works correctly.

6. **How do you handle CPU-bound work in an asyncio application?**
   - **Explanation:** Use `loop.run_in_executor(None, cpu_func)` to offload to a thread pool, or use `ProcessPoolExecutor` for true parallelism. Never call CPU-bound code directly in an async function.

## 9. Mistakes / traps

- Memorizing syntax without explaining runtime behavior.
- Ignoring mutation, cleanup, or dependency boundaries.
- Using async/thread/process tools without matching the workload.
- Letting environment-specific dependency issues reach production.

## 10. Compare with related concepts

Compare asyncio with nearby Python concepts by asking whether it is about data structure choice, object lifetime, typing, resource cleanup, concurrency, packaging, or testing.

## 11. Summary from memory

Explain asyncio and connect it to one backend API or service example.

## 12. Spaced revision prompts

- Day 1: Define asyncio.
- Day 3: Write a small code example.
- Day 7: Explain one production bug.
- Day 14: Compare with a related Python concept.
