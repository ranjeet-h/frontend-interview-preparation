# `asyncio` in Python: Event Loop Architecture, Coroutines, and Cooperative Multitasking

## 1. Why This Exists — The Problem First

Imagine you are deploying a real-time notification backend or an API gateway in Python. Your service needs to maintain 5,000 open client connections—mostly idle WebSocket sessions or HTTP long-polls waiting for occasional server events.

If you build this service using traditional multi-threading with one OS thread per connection, your server crashes long before reaching scale:
1. **Memory Explosion:** On Linux, each operating system thread allocates an 8MB virtual stack by default. Even if restricted to a smaller size, 5,000 threads consume gigabytes of RAM just to maintain empty call stacks and kernel control blocks.
2. **Kernel Thrashing and Context-Switching:** The OS kernel scheduler must constantly pause threads, save CPU registers, switch memory page tables, and restore state thousands of times per millisecond. The CPU burns almost all its clock cycles deciding *which* idle thread to check next rather than running application logic.
3. **The CPython GIL Bottleneck:** Because CPython uses a Global Interpreter Lock (GIL), those 5,000 threads cannot execute Python bytecode simultaneously on multiple CPU cores anyway. You pay the full memory and context-switching tax of OS threads without gaining true multicore parallelism.

A thread holding an entire OS stack just to sit idle 99.9% of the time waiting for network packets is catastrophic waste. 

`asyncio` exists to eliminate this overhead. Instead of 5,000 threads each waiting on one network socket, a single OS thread registers all 5,000 non-blocking sockets with the kernel's native event multiplexer (`epoll` on Linux, `kqueue` on macOS/BSD). The OS wakes up your Python thread only when bytes actually arrive on the wire. All 5,000 concurrent connections run inside a single thread using less than 100MB of RAM with virtually zero CPU context-switch penalty.

## 2. The Analogy — Make It Obvious

Think of concurrency like running a busy short-order breakfast diner.

**The Multi-Threaded Approach (Hiring 100 Inflexible Line Cooks):**
To serve 100 diners, the owner hires 100 separate cooks in a small kitchen. 
- Cook #1 drops bread into the toaster and stands frozen, staring at the bread for 3 minutes.
- Cook #2 drops hash browns into the deep fryer and stares at the oil for 5 minutes.
- Cook #3 puts a kettle on the stove and stares at the water for 4 minutes.

The kitchen is completely jammed with cooks bumping into each other (memory overhead). Moving between workstations requires shoving through the crowd (CPU context-switching). The kitchen collapses under its own weight even though almost nobody is actively cutting, stirring, or plating.

**The `asyncio` Approach (One Master Short-Order Chef with a Kitchen Timer Board):**
The diner hires **one elite chef** (the Event Loop / single OS thread) equipped with a wall of digital timers (the OS kernel's `epoll` / `kqueue` multiplexer).
- The chef puts bread in the toaster, sets a timer on the wall, and immediately turns around (`await`).
- Without missing a beat, the chef drops hash browns in the fryer, sets another timer, and immediately turns to assemble a club sandwich for Diner #4.
- When a timer dings (a network socket receives data), the chef sets down the knife at a clean transition point, pulls the golden toast from the toaster, and moves to the next ready dish.

One person effortlessly manages 100 meals at once because 95% of cooking time is just waiting on heat (I/O). The chef only works when there is active work to do.

**The Breakdown Rule:** If someone walks in and orders the master chef to hand-carve a massive 50kg ice sculpture (a CPU-heavy task or a synchronous blocking call like `time.sleep()`), the entire diner grinds to a halt. All timers ding unnoticed because the single chef is stuck chopping ice.

## 3. How It Actually Works — The Full Explanation

### The I/O Multiplexing Foundation (`epoll` and `kqueue`)
At the operating system level, standard network sockets are blocking: calling `socket.recv()` pauses the OS thread until data arrives. If you switch a socket to non-blocking mode (`socket.setblocking(False)`), `recv()` returns immediately with an `EAGAIN` or `EWOULDBLOCK` error if no data is ready.

Rather than continuously looping through thousands of non-blocking sockets (which would burn 100% CPU in a busy-wait), operating systems provide event notification mechanisms:
- **`select` / `poll` (Historical):** The program passes an array of file descriptors to the kernel. The kernel scans every descriptor sequentially ($O(N)$ overhead) to check for readiness.
- **`epoll` (Linux) / `kqueue` (macOS & BSD):** The program registers interest in a file descriptor once. The kernel maintains an active ready-list and returns only the file descriptors that have received events in $O(1)$ constant time.

Python's `selectors` standard library module wraps these OS-specific mechanisms under a unified interface. `asyncio` builds its event loop on top of `selectors`.

```txt
┌──────────────────────────────────────────────────────────────────┐
│                      Python asyncio Event Loop                   │
│                                                                  │
│  ┌────────────────────┐    FIFO Run Queue    ┌─────────────────┐ │
│  │ Ready Tasks Queue  │ ───────────────────> │ Current Running │ │
│  │ [Task A, Task B]   │                      │ Coroutine       │ │
│  └────────────────────┘                      └────────┬────────┘ │
│            ▲                                          │          │
│            │ Event fires                              │ await    │
│            │ (Task unblocked)                         ▼          │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │               OS I/O Multiplexer (epoll / kqueue)           │ │
│  │   Socket #1 (DB read)   Socket #2 (HTTP)   Socket #3 (Redis) │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### The Four Core Moving Parts

1. **The Event Loop (`asyncio.AbstractEventLoop`):**
   The continuous supervisor running on your thread. In an infinite cycle, it:
   - Queries the OS selector for network sockets that became readable or writable.
   - Dispatches callbacks for completed I/O events.
   - Executes runnable tasks from its internal FIFO queue one by one until they hit an `await`.
   - Processes scheduled timer delays (`call_later`, `call_at`).

2. **Coroutines (`async def`):**
   When you define a function with `async def` and invoke it (`coro = fetch_data()`), Python does **not** run the function body immediately. It returns a coroutine object. Coroutines are stateful generators under the hood that implement the `__await__()` protocol. They can pause execution at an `await` expression and resume later with their local variables intact.

3. **Futures (`asyncio.Future`):**
   A low-level object representing an eventual result of an asynchronous operation. A future starts in state `PENDING`. When an I/O operation finishes, the event loop marks the future as `FINISHED` and sets its result or exception via `future.set_result(value)`. Any coroutine awaiting that future is then re-queued for execution.

4. **Tasks (`asyncio.Task`):**
   A task is a wrapper around a coroutine that inherits from `Future`. Creating a task with `asyncio.create_task(coro)` registers the coroutine with the event loop's active run queue immediately. The task repeatedly drives the coroutine forward by calling its internal `.send(None)` method each time the event loop yields control back to it.

### Cooperative Multitasking & The `await` Contract
Python `asyncio` is **cooperative**, not preemptive. 
- In **preemptive multitasking** (like OS threads), the operating system forcibly pauses a thread at arbitrary bytecode boundaries to let another thread run.
- In **cooperative multitasking**, a running coroutine retains 100% control of the CPU until it **voluntarily yields** control by executing an `await` statement on an awaitable object (a Coroutine, Task, or Future).

If a function performs a heavy computation or calls a blocking standard library function (like `time.sleep()` or synchronous database queries), it never yields. The event loop remains frozen, and all other 4,999 tasks are starved of CPU time.

### Structured Concurrency: `asyncio.TaskGroup` (Python 3.11+) vs `asyncio.gather`
For years, Python developers ran concurrent operations using `asyncio.gather(*tasks)`. While `gather` works for simple happy-path scenarios, it represents unstructured concurrency: if one task fails with an unhandled exception, sibling tasks continue running orphaned in the background without clean lifecycle management (a task leak).

Python 3.11 introduced `asyncio.TaskGroup` as a context manager for structured concurrency:
- All child tasks spawned within `async with asyncio.TaskGroup() as tg:` are strictly bound to the context block scope.
- If any child task raises an exception, `TaskGroup` automatically cancels all other running tasks inside the group, waits for them to cleanly shut down, and raises an `ExceptionGroup` containing all errors.
- The context manager guarantees no dangling background tasks survive past the exiting block boundary.

### Cancellation and Timeouts
Cancellation in `asyncio` is cooperative. Calling `task.cancel()` does not forcibly terminate the task. Instead:
1. The event loop injects an `asyncio.CancelledError` exception directly into the coroutine at its current `await` suspension point on the next tick.
2. The coroutine can intercept this in a `try...finally` block or `except asyncio.CancelledError:` block to release locks, close database transactions, or flush buffers.
3. Unless the coroutine explicitly suppresses the error, `CancelledError` propagates up, marking the task as cancelled.

Python 3.11 introduced `asyncio.timeout(delay)` as an async context manager, providing a cleaner, more reliable replacement for `asyncio.wait_for()`.

### Bridging Synchronous and Asynchronous Code
Real-world applications often need to call legacy synchronous libraries (like `boto3`, `requests`, or OpenCV) or run heavy CPU algorithms (hashing, JSON parsing large payloads). Calling these directly on the event loop blocks all concurrent traffic.

To bridge this safely:
- **`asyncio.to_thread(func, *args)` (Python 3.9+):** Runs synchronous I/O-bound functions in a separate OS thread managed by Python's internal `ThreadPoolExecutor`, returning an awaitable future to the event loop.
- **`loop.run_in_executor(ProcessPoolExecutor, func, *args)`:** Offloads CPU-heavy computations to an entirely separate OS process, completely bypassing the CPython GIL.

## 4. Real Code — See It Working

### 1. Modern Structured Concurrency with `TaskGroup`, Rate Limiting, and Timeouts
This production-grade pattern fetches multiple external API endpoints concurrently, enforces a concurrency limit using an `asyncio.Semaphore`, and bounds the total execution time using `asyncio.timeout`.

```python
import asyncio
import time
from typing import Any

# Simulate an asynchronous external API call
async def fetch_user_profile(user_id: int, semaphore: asyncio.Semaphore) -> dict[str, Any]:
    # Acquire semaphore to avoid exhausting network connection pools
    async with semaphore:
        # Simulate network latency (0.2 seconds)
        await asyncio.sleep(0.2)
        if user_id == 13:
            raise ValueError(f"User {user_id} account suspended")
        return {"user_id": user_id, "status": "active", "timestamp": time.time()}

async def main() -> None:
    # Allow at most 3 concurrent outbound requests at any moment
    rate_limiter = asyncio.Semaphore(3)
    user_ids = [1, 2, 3, 4, 5]
    results: list[dict[str, Any]] = []

    try:
        # Enforce an overall deadline of 1.5 seconds for the entire operation
        async with asyncio.timeout(1.5):
            # TaskGroup ensures all spawned tasks are bound to this context
            async with asyncio.TaskGroup() as tg:
                task_list = [
                    tg.create_task(fetch_user_profile(uid, rate_limiter))
                    for uid in user_ids
                ]

            # If execution reaches here, every task completed successfully
            results = [task.result() for task in task_list]
            print(f"Successfully fetched {len(results)} profiles concurrently.")
            for r in results:
                print("  ->", r)

    except TimeoutError:
        print("Batch operation exceeded deadline; all remaining requests cancelled.")
    except* ValueError as eg:
        # ExceptionGroup handling (Python 3.11+)
        print(f"Caught handled error within group: {eg.exceptions}")

if __name__ == "__main__":
    asyncio.run(main())
```

### 2. Graceful Resource Cleanup During Task Cancellation
This example demonstrates how an async worker responds cleanly when cancelled by an external signal or shutdown event.

```python
import asyncio

async def background_event_listener(queue_name: str) -> None:
    print(f"[{queue_name}] Connecting to event stream...")
    await asyncio.sleep(0.1) # Simulate connection handshake
    print(f"[{queue_name}] Connected. Listening for events...")

    try:
        while True:
            # Simulate waiting for incoming message packets
            await asyncio.sleep(1.0)
            print(f"[{queue_name}] Heartbeat received.")
    except asyncio.CancelledError:
        # Intercept cancellation to execute clean graceful teardown
        print(f"[{queue_name}] Cancellation signal received! Flushing state...")
        # Simulating cleanup work (closing socket, acknowledging messages)
        await asyncio.sleep(0.05)
        print(f"[{queue_name}] Cleanup complete. Re-raising to acknowledge exit.")
        # ALWAYS re-raise CancelledError to allow proper task finalization
        raise
    finally:
        print(f"[{queue_name}] Worker fully stopped.")

async def run_server() -> None:
    worker_task = asyncio.create_task(background_event_listener("events_v1"))
    
    # Let the worker run for a brief moment
    await asyncio.sleep(0.5)
    
    print("[Server] Shutting down service. Cancelling worker...")
    worker_task.cancel()

    try:
        await worker_task
    except asyncio.CancelledError:
        print("[Server] Worker acknowledged cancellation cleanly.")

if __name__ == "__main__":
    asyncio.run(run_server())
```

### 3. Offloading Blocking Sync and CPU-Bound Work Safely
This shows how to run blocking synchronous libraries and CPU-intensive calculations without freezing the async web event loop.

```python
import asyncio
import hashlib
import time

# 1. Blocking legacy I/O function (e.g., legacy disk write or boto3 upload)
def legacy_blocking_file_write(filename: str, content: str) -> int:
    time.sleep(0.3)  # Simulates blocking disk I/O
    return len(content)

# 2. CPU-heavy function (burns CPU cycles; would block the GIL)
def compute_heavy_hash(data: str, iterations: int = 2_000_000) -> str:
    current = data.encode("utf-8")
    for _ in range(iterations):
        current = hashlib.sha256(current).digest()
    return current.hex()

async def async_healthcheck() -> None:
    for i in range(4):
        print(f"[Event Loop Active] Healthcheck ping {i+1} responsive.")
        await asyncio.sleep(0.1)

async def main_orchestrator() -> None:
    print("[App] Starting orchestrator...")

    # Start healthcheck to prove the event loop never freezes
    health_task = asyncio.create_task(async_healthcheck())

    # Offload blocking I/O to a background thread pool (Python 3.9+)
    bytes_written = await asyncio.to_thread(
        legacy_blocking_file_write, "audit.log", "important data payload"
    )
    print(f"[App] Wrote {bytes_written} bytes via background thread.")

    # Await the healthcheck to verify non-blocking progress
    await health_task
    print("[App] All tasks finished cleanly.")

if __name__ == "__main__":
    asyncio.run(main_orchestrator())
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the exact difference between concurrency and parallelism in Python, and how does the Global Interpreter Lock (GIL) relate to `asyncio`?**

Concurrency is about *dealing with* lots of things at once (structure); parallelism is about *doing* lots of things at once (simultaneous execution on physical hardware). 

`asyncio` provides concurrency within a single OS thread. It manages thousands of interleaved tasks by switching between them during waiting periods (I/O idle time), but only one line of Python bytecode executes at any given microsecond. Because `asyncio` runs entirely on a single thread, the CPython GIL is completely irrelevant during normal operation—there is no thread contention, mutex overhead, or GIL switching between tasks. 

If you have CPU-bound tasks that require true multi-core parallelism (such as video transcoding, cryptography, or machine learning), `asyncio` alone cannot parallelize them. You must offload those calculations to separate OS processes via `ProcessPoolExecutor` or use C-extensions that release the GIL.

---

**Q: Since `asyncio` is single-threaded, is shared state automatically thread-safe? Do we ever need `asyncio.Lock`?**

No, shared state is **not** automatically safe from race conditions. 

While synchronous operations between two points without an `await` run atomically (because the thread cannot be interrupted by another coroutine mid-expression), race conditions happen across `await` suspension points.

Consider this bank withdrawal example:
```python
async def withdraw(amount: float):
    # Step 1: Read balance (atomic)
    balance = await db.get_balance()  # <-- SUSPENSION POINT
    # Another coroutine can run here and also read the old balance!
    if balance >= amount:
        # Step 2: Write new balance
        await db.set_balance(balance - amount) # <-- SUSPENSION POINT
```
If two requests enter `withdraw()` concurrently, both read the original balance before either updates it, resulting in a double-spend bug. 

You must protect critical sections that span across `await` statements using an `asyncio.Lock` to ensure mutual exclusion.

---

**Q: Why should modern Python code use `asyncio.TaskGroup` instead of `asyncio.gather()`?**

`asyncio.gather()` represents unstructured concurrency. When running multiple coroutines with `gather()`, if one coroutine crashes with an unhandled exception:
1. `gather()` immediately raises that exception to the caller.
2. The remaining sibling tasks keep running detached in the background. They become zombie tasks that leak network sockets, hold database connections, or continue writing stale data.

`asyncio.TaskGroup` (introduced in Python 3.11) implements structured concurrency. When used in an `async with asyncio.TaskGroup() as tg:` block:
1. If any task in the group raises an unhandled exception, `TaskGroup` immediately signals cancellation to all other sibling tasks within the group.
2. It pauses and waits for all sibling tasks to complete their cancellation cleanup before exiting the block.
3. It bundles all collected exceptions into an `ExceptionGroup`, ensuring zero unhandled errors are silently dropped and zero orphaned tasks escape into the background.

---

**Q: What happens internally when `task.cancel()` is called? Can a coroutine refuse to be cancelled?**

When `task.cancel()` is called, the event loop does not kill the OS thread or force-terminate the Python frame. Instead, it marks the task for cancellation and schedules an `asyncio.CancelledError` to be thrown into the coroutine at its active `await` expression via the generator `.throw()` mechanism.

Because it is delivered as a regular Python exception, a coroutine *can* technically catch `asyncio.CancelledError` and refuse to yield or re-raise it:
```python
try:
    await asyncio.sleep(10)
except asyncio.CancelledError:
    # Anti-pattern: Silently ignoring cancellation
    print("I refuse to die!")
```
If a coroutine catches `CancelledError` and continues executing without re-raising it, the task will return a normal value instead of cancelling. In well-architected applications, you should only catch `CancelledError` to perform brief cleanup inside `try...finally` or clean up and immediately re-raise the exception.

---

**Q: How does `await asyncio.sleep(5)` differ from `time.sleep(5)` under the hood?**

`time.sleep(5)` is a C-level blocking system call that tells the operating system kernel to pause the entire OS thread for 5 seconds. Because the single thread running the `asyncio` event loop is frozen, the event loop cannot check sockets, fire timer callbacks, or execute any other coroutines. All thousands of connected clients freeze.

`await asyncio.sleep(5)` creates an internal `asyncio.Future` and registers a timer with the event loop's priority queue to resolve that future after 5 seconds (`loop.call_later(5, future.set_result, None)`). The coroutine yields execution control back to the event loop immediately. During those 5 seconds, the event loop continues processing thousands of other requests at full speed. When the 5-second timer expires, the future resolves, and the sleeping coroutine is placed back into the runnable queue.

---

**Q: How do you properly test asynchronous code with `pytest` and mock async dependencies?**

Testing async code requires an async-aware test runner like `pytest-asyncio`. 
1. Test functions are defined with `async def` and decorated with `@pytest.mark.asyncio` (or configured via `asyncio_mode = "auto"` in `pytest.ini`).
2. When mocking async functions or methods, you must use `unittest.mock.AsyncMock` instead of the standard `Mock` or `MagicMock`. A standard `Mock` returns a synchronous value or another mock object, which causes `await mock_func()` to crash with a `TypeError: object MagicMock can't be used in 'await' expression`. `AsyncMock` returns an awaitable coroutine object that resolves to the specified return value when awaited.

## 6. The Traps — What Goes Wrong

### Trap 1: Calling Synchronous Blocking I/O Inside Async Handlers
The most destructive bug in Python async services is importing a synchronous I/O library (like `requests`, `urllib`, `psycopg2`, or standard `open()`) inside an `async def` route.

```python
# BROKEN: Freezes the entire server for all connected clients
@app.get("/users/{user_id}")
async def get_user(user_id: int):
    # requests.get is blocking! The entire event loop halts here for 500ms
    response = requests.get(f"https://auth.internal/users/{user_id}")
    return response.json()

# FIXED: Use a non-blocking async client like httpx
@app.get("/users/{user_id}")
async def get_user(user_id: int):
    async with httpx.AsyncClient() as client:
        response = await client.get(f"https://auth.internal/users/{user_id}")
        return response.json()
```
*Why it happens:* Developers assume that writing `async def` automatically makes all code inside the function asynchronous. It does not. An async function is only non-blocking if every I/O operation inside it explicitly awaits non-blocking drivers.

---

### Trap 2: The "Fire-and-Forget" Task Garbage Collection Leak
When developers spawn a background task without saving a reference to it, Python's garbage collector can silently destroy the task before it finishes running.

```python
# BROKEN: The task object has no strong reference and may be GC'd mid-execution
async def process_webhook(payload: dict):
    # create_task schedules work, but returns a Task object that nobody stores
    asyncio.create_task(send_analytics_event(payload))

# FIXED: Maintain a strong reference set, removing tasks on completion
background_tasks = set()

async def process_webhook(payload: dict):
    task = asyncio.create_task(send_analytics_event(payload))
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)
```
*Why it happens:* `asyncio.create_task()` only holds a weak reference inside the event loop. If a garbage collection cycle runs while the task is suspended at an `await`, Python destroys the unreferenced task object, raising a warning and leaving the background job half-finished.

---

### Trap 3: The "Unawaited Coroutine" Silent Bug
Calling an `async def` function without `await` does not execute the function.

```python
# BROKEN: The query is never executed; logs a RuntimeWarning
async def record_audit_log(user_id: int, action: str):
    await db.execute("INSERT INTO logs ...", user_id, action)

async def handle_request(user_id: int):
    # Bug: Forgot 'await'. record_audit_log returns a coroutine object without running!
    record_audit_log(user_id, "LOGIN")
    return {"status": "ok"}
```
*Why it happens:* In synchronous Python, calling `func()` executes it immediately. In async Python, calling an `async def` function merely constructs the coroutine generator object. It never runs unless it is explicitly `await`ed or wrapped in `asyncio.create_task()`.

---

### Trap 4: Swallowing `asyncio.CancelledError` in Bare Except Blocks
Catching broad exceptions often unintentionally intercepts task cancellation signals, preventing graceful server shutdowns.

```python
# BROKEN: Catches CancelledError and prevents the service from stopping
async def poll_queue():
    while True:
        try:
            await fetch_next_message()
        except Exception as e:
            # CancelledError inherits from Exception in Python 3.8+!
            # The worker logs an error and resumes looping forever instead of exiting
            print(f"Error occurred: {e}")

# FIXED: Explicitly allow CancelledError to propagate
async def poll_queue():
    while True:
        try:
            await fetch_next_message()
        except asyncio.CancelledError:
            raise  # Re-raise cancellation signal immediately
        except Exception as e:
            print(f"Handled operational error: {e}")
```

## 7. Compare With Related Concepts

| Mechanism | Concurrency Model | CPU Bound vs I/O Bound | Memory Overhead per Worker | Shared Memory Safety |
| :--- | :--- | :--- | :--- | :--- |
| **`asyncio`** | Single-threaded cooperative event loop (`epoll`/`kqueue`) | Ideal for high-concurrency **I/O-bound** network services | Extremely low (~1KB per coroutine) | Single thread; safe between awaits, requires `asyncio.Lock` across awaits |
| **`threading` (OS Threads)** | Multi-threaded preemptive multitasking (Kernel managed) | Suitable for I/O-bound tasks with blocking legacy libraries | Moderate (~2MB–8MB stack per thread) | Shared heap memory; subject to race conditions and GIL serialization |
| **`multiprocessing`** | Multi-process true parallelism (Separate OS processes) | Required for heavy **CPU-bound** processing | High (Duplicates Python process image, ~30MB–100MB+ each) | Isolated memory; requires IPC, pipes, or Redis queues |
| **Gevent / Greenlets** | Single-threaded cooperative via implicit C monkey-patching | Legacy I/O-bound concurrency | Low (~4KB per greenlet) | Single thread; implicit context switches at monkey-patched standard library calls |

### Key Decision Rules:
- **Choose `asyncio`** when building high-concurrency I/O-bound services (WebSockets, microservice gateways, chat servers, async database querying with FastAPI) where thousands of connections wait on network packets.
- **Choose `threading` (or `asyncio.to_thread`)** when integrating with legacy third-party C-extensions or blocking Python libraries that cannot be rewritten with async drivers.
- **Choose `multiprocessing`** when doing heavy CPU-bound computations (image processing, data crunching with Pandas/NumPy, cryptography) to utilize all available physical CPU cores and bypass the GIL.
- **Choose `asyncio.TaskGroup` over `asyncio.gather`** in all modern Python (3.11+) applications to guarantee structured concurrency with automatic child task cancellation on failures.

## 8. 🧠 The Memory Hook

> **One master chef with a wall of timers beats 5,000 frozen cooks.**
> 
> `asyncio` is not about making individual operations run faster—it is about never wasting a single CPU cycle waiting on an idle network socket. When you `await`, you surrender the stage so thousands of others can perform.

