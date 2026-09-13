# `def` vs `async def` in FastAPI: Event Loop Internals, Threadpool Offloading, and Execution Flow

## 1. Why This Exists — The Problem First

You deploy a high-throughput FastAPI service to production. You write all your endpoints with `async def` because common wisdom says "async in Python is always faster." Inside one of those endpoints, you make a quick HTTP call using `requests.get()` to fetch user metadata, or you query a legacy database using a synchronous driver like `psycopg2`.

In local testing with one request at a time, the endpoint responds in 150 milliseconds and looks completely fine. But under production load with 200 concurrent users, disaster strikes: the entire service grinds to an absolute halt. Not just the endpoint making the external call—every single endpoint across the entire application, including lightweight `/health` check endpoints, stops responding. The load balancer marks your instances unhealthy, traffic drops, and pods begin crashing in cascades.

This happens because `async def` tells FastAPI: "Run this coroutine directly on the single-threaded asyncio event loop." When `requests.get()` or `time.sleep()` blocks waiting for network packets or OS timers, the single CPU thread running the event loop freezes completely. Nothing else can tick. All 200 concurrent requests sit stranded in line behind a locked event loop thread.

On the other end of the mistake, developers who get burned by this start marking every route with standard `def`, even when using modern non-blocking drivers like `asyncpg` or `httpx`. Every request now burns a dedicated operating system worker thread from a finite thread pool (defaulting to 40 threads), exhausting the pool and causing severe latency spikes under modest concurrency.

FastAPI is uniquely designed to handle both synchronous and asynchronous execution models side-by-side without crashing, but only if you understand which keyword routes execution to the event loop versus the worker threadpool.

## 2. The Analogy — Make It Obvious

Think of a FastAPI application as a busy restaurant run by a **Master Head Chef** standing at the pass, assisted by a team of **Prep Assistants in the back kitchen**.

The **Main Event Loop** is the **Master Head Chef**. The chef is blazingly fast, handles thousands of incoming orders, coordinates tickets, plates finished food, and interacts with customers at the counter.

An **`async def` route** is like an order that uses an automated smart oven (non-blocking I/O). The head chef places the tray in the oven, sets the timer (`await`), and immediately turns around to take the next customer's order or plate someone else's salad. When the oven dings, the chef grabs the finished tray and hands it over. Because the chef never waits idly, one chef can effortlessly coordinate 10,000 active dishes at the same time.

A **synchronous blocking call** inside an `async def` route is like asking that same head chef to stand still and manually stir a pot of sauce with a wooden spoon for 5 seconds without looking away. While the chef is stirring that pot, no tickets are checked, no salads are plated, and no new orders can enter the kitchen. The entire restaurant freezes.

A **standard `def` route** is FastAPI's safety valve for manual work: instead of making the head chef stir the pot, FastAPI takes the entire ticket and hands it off to one of the **Prep Assistants in the back kitchen** (the worker threadpool). The head chef delegates the task, stays at the counter handling incoming traffic, and only collects the finished dish once the prep assistant completes the job.

The catch? The kitchen only has **40 prep assistants** (the default AnyIO threadpool size). If 100 customers simultaneously order dishes that require manual prep, 40 assistants get busy immediately, and the remaining 60 customers must wait outside the kitchen until an assistant finishes and frees up.

## 3. How It Actually Works — The Full Explanation

FastAPI is built on top of Starlette and AnyIO. When an incoming HTTP request hits an endpoint, FastAPI inspects the function signature of your route handler before executing it.

**1. The `async def` Execution Path (Direct on the Event Loop)**
When you declare an endpoint with `async def`, FastAPI treats it as a native coroutine:
- The handler is scheduled and executed directly on the main OS thread running the `asyncio` event loop.
- When Python encounters an `await` statement (such as `await client.get()` with `httpx` or `await session.execute()` with an async database driver), Python registers a callback on the operating system socket notification system (like `epoll` on Linux or `kqueue` on macOS) and yields control back to the event loop.
- The event loop immediately switches to processing other incoming HTTP requests, running other coroutines, or sending finished responses over the wire.
- Once the operating system signals that the network bytes or disk data have arrived, the event loop resumes your coroutine right after the `await` keyword.
- **The Golden Rule of `async def`:** You must NEVER run blocking synchronous code inside an `async def` function. Any blocking call (`time.sleep()`, synchronous file `open()`, CPU-heavy loops, or blocking network clients like `requests` and `psycopg2`) keeps the single event loop thread captive. While that thread is blocked, zero other requests can progress.

**2. The Standard `def` Execution Path (AnyIO Threadpool Offloading)**
When you declare an endpoint with standard `def`, FastAPI recognizes that this handler might contain blocking operations:
- Instead of running it on the main event loop, FastAPI uses AnyIO under the hood: `anyio.to_thread.run_sync(route_handler, *args)`.
- This dispatches the function call to an external worker thread in a managed threadpool.
- The event loop remains completely free and responsive to other incoming requests while the worker thread sits blocked waiting on disk, network sockets, or synchronous CPU calculations.
- Once the worker thread finishes executing the function, AnyIO passes the return value back to the event loop, which serializes the response and sends it to the client.

**3. Threadpool Limits and Thread Saturation**
FastAPI uses AnyIO's default worker threadpool, which defaults to **40 worker threads** per Uvicorn worker process.
- If 40 concurrent requests arrive for synchronous `def` routes that take 1 second each to query a database, all 40 threads are instantly occupied.
- The 41st request cannot be picked up by a worker thread immediately; it waits in an in-memory queue until one of the 40 threads finishes and returns to the pool.
- While the event loop itself stays alive and continues serving `async def` endpoints, the latency for synchronous `def` endpoints climbs sharply under threadpool saturation.
- You can adjust the capacity at application startup via `anyio.to_thread.current_default_thread_limiter().total_tokens = 100`, but threads consume OS memory (typically 8MB virtual stack space per thread) and increase CPU context-switching overhead.

**4. The Cardinal Decision Matrix**
- If your libraries support non-blocking `async/await` (`httpx`, `asyncpg`, `aiofiles`, `motor`, `redis-py` async): declare `async def` and `await` every I/O operation.
- If your libraries are synchronous or blocking (`requests`, `psycopg2`, `SQLAlchemy` standard Session, `boto3`, `pandas`, `open()`, `stripe` sync SDK): declare standard `def`. FastAPI will safely offload them to worker threads.
- If doing heavy CPU-bound computation (image transformations with PIL, machine learning inference, large data parsing): declare standard `def` for small jobs to protect the event loop, or offload to background task queues (Celery, RQ, ARQ) or a `ProcessPoolExecutor` for heavy processing.

## 4. Real Code — See It Working

Let's look at how to properly structure async routes, sync routes, manual thread offloading, and mixed dependencies.

**Example 1: Proper Async Route (Non-Blocking I/O)**

```python
from fastapi import FastAPI
import httpx

app = FastAPI()

# Declared with 'async def': Runs directly on the asyncio event loop.
# All I/O calls MUST use non-blocking libraries and 'await'.
@app.get("/users/{user_id}/async")
async def get_user_async(user_id: int):
    # httpx.AsyncClient yields execution back to the event loop while waiting for network bytes
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.example.com/users/{user_id}",
            timeout=5.0
        )
    return {"user_id": user_id, "data": response.json()}
```

**Example 2: Proper Sync Route (FastAPI Automatically Offloads to Threadpool)**

```python
from fastapi import FastAPI
import requests
import time

app = FastAPI()

# Declared with standard 'def': FastAPI automatically runs this inside a worker thread
# via anyio.to_thread.run_sync, keeping the main event loop responsive.
@app.get("/users/{user_id}/sync")
def get_user_sync(user_id: int):
    # requests.get blocks the thread, but it only blocks ONE worker thread in the pool
    response = requests.get(
        f"https://api.example.com/users/{user_id}",
        timeout=5.0
    )
    # time.sleep is safe here because it only sleeps this isolated worker thread
    time.sleep(0.05)
    return {"user_id": user_id, "data": response.json()}
```

**Example 3: Offloading a Specific Sync Task From Inside an Async Route**

```python
from fastapi import FastAPI
import anyio.to_thread
import pandas as pd

app = FastAPI()

def parse_heavy_csv_file(file_path: str) -> dict:
    # Synchronous disk read and CPU calculation
    df = pd.read_csv(file_path)
    return df.describe().to_dict()

@app.post("/analytics/summarize")
async def summarize_analytics(file_path: str):
    # The route is async def for fast async network handling,
    # but we manually offload the blocking pandas call to the AnyIO threadpool.
    metrics = await anyio.to_thread.run_sync(parse_heavy_csv_file, file_path)
    
    return {"status": "success", "metrics": metrics}
```

**Example 4: Handling Sync vs Async Database Dependencies**

```python
from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

app = FastAPI()

# Synchronous DB session dependency (standard def)
def get_sync_db():
    db = SyncSessionLocal()
    try:
        yield db
    finally:
        db.close()

# Asynchronous DB session dependency (async def)
async def get_async_db():
    async with AsyncSessionLocal() as session:
        yield session

# Sync endpoint with sync dependency: both run in worker threadpool
@app.get("/items/sync")
def read_items_sync(db: Session = Depends(get_sync_db)):
    return db.query(ItemModel).all()

# Async endpoint with async dependency: both run on main event loop
@app.get("/items/async")
async def read_items_async(db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(ItemModel))
    return result.scalars().all()
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the fundamental difference between `def` and `async def` route handlers in FastAPI?**

FastAPI executes `async def` route handlers directly on the application's single-threaded asyncio event loop. Because it runs on the event loop, all I/O within the handler must be non-blocking and explicitly awaited. In contrast, when FastAPI encounters a standard synchronous `def` route handler, it automatically wraps and offloads the function call to a worker thread from an AnyIO threadpool (`anyio.to_thread.run_sync`). This ensures that synchronous, blocking operations (like standard ORM queries, disk reads, or third-party SDK calls) do not freeze the main event loop.

**Q: What happens internally if you call a blocking function like `time.sleep(5)` or `requests.get()` inside an `async def` route?**

The single operating system thread running the Python asyncio event loop is blocked for the entire 5 seconds. Because the event loop is single-threaded, it cannot process any incoming network packets, cannot advance timers, and cannot resume any other coroutines awaiting I/O. Every other concurrent request in the application—even fast in-memory endpoints or `/health` checks—stalls completely until that synchronous call finishes.

**Q: Why does FastAPI default to offloading standard `def` routes to a threadpool instead of running them on the main thread?**

Traditional WSGI frameworks (like Flask or Django before ASGI) run each request on its own dedicated worker process or thread. In an ASGI framework like FastAPI, everything starts on the asyncio event loop. If FastAPI ran standard `def` functions directly on the main event loop thread, any standard Python blocking library would instantly freeze the entire server. By automatically delegating `def` handlers to a threadpool, FastAPI provides safety: developers can write standard synchronous Python without accidentally breaking concurrency for the rest of the application.

**Q: What is the default size of FastAPI's threadpool, and what happens when it gets saturated?**

FastAPI relies on AnyIO's default threadpool limiter, which defaults to 40 worker threads per process. When 40 concurrent requests are executing synchronous `def` routes simultaneously, the threadpool is saturated. Any new request targeting a `def` route must wait in an in-memory queue until an existing thread finishes its work and returns to the pool. While the event loop remains responsive for async routes, synchronous route latency will spike dramatically as queue wait times accumulate.

**Q: Can you use a synchronous dependency inside an `async def` route, or an async dependency inside a `def` route?**

FastAPI resolves dependencies intelligently based on their individual signatures. If an `async def` route depends on a standard `def` dependency, FastAPI runs that dependency in the threadpool and awaits its result before calling your route on the event loop. If a `def` route depends on an `async def` dependency, FastAPI runs the async dependency on the event loop and then passes the result to your synchronous route in the threadpool. However, you should avoid passing thread-unsafe objects (like a synchronous database `Session`) into an `async def` route where they might be accessed concurrently across tasks.

**Q: How does CPU-bound work behave in `async def` vs `def` routes?**

`async def` provides zero concurrency benefits for CPU-bound computation (such as cryptographic hashing, large JSON transformations, or image processing) because CPU-bound code does not yield control via `await`. Running CPU-heavy code inside `async def` freezes the event loop completely. Running it inside a standard `def` route offloads the calculation to a worker thread; however, because of Python's Global Interpreter Lock (GIL), multiple threads performing pure Python computation will still contend for the same CPU core. For heavy CPU workloads, you should offload the task to a background worker process via Celery, ARQ, or Python's `ProcessPoolExecutor`.

**Q: How do you choose between `def` and `async def` when designing a production FastAPI architecture?**

Follow the call chain. If every dependency in your request lifecycle provides an async interface (async database driver like `asyncpg`, async HTTP client like `httpx`, async Redis client), use `async def` to achieve massive I/O concurrency with minimal memory overhead. If any critical dependency is synchronous (such as `requests`, `boto3`, legacy SQLAlchemy `Session`, or `pandas`), use standard `def` so FastAPI handles thread offloading safely. Never choose `async def` solely for aesthetics if your underlying libraries block.

## 6. The Traps — What Goes Wrong

- **Trap 1: Writing `async def` and using synchronous database or HTTP libraries.**
  The wrong assumption is that declaring `async def` automatically makes all operations inside it asynchronous. It does not. If you call `requests.get()`, `psycopg2.connect()`, `time.sleep()`, or standard `boto3` inside an `async def` handler, the event loop stops dead. If you have synchronous dependencies, you must declare the route with standard `def`, or use `anyio.to_thread.run_sync()`.

- **Trap 2: Declaring `def` for async database drivers or calling `asyncio.run()`.**
  The wrong assumption is that `def` is always safer. If you declare `def` but try to call an async library by running `asyncio.run(async_query())` inside it, you create a new event loop on every threadpool execution or crash with `RuntimeError: This event loop is already running`. If your driver is async (e.g. `AsyncSession` with SQLAlchemy, `asyncpg`, `httpx`), use `async def` and native `await`.

- **Trap 3: Under-provisioning threads for sync-heavy applications.**
  Assuming that standard `def` can handle thousands of concurrent requests without tuning. Because the default AnyIO threadpool has 40 threads, an application with slow synchronous queries (e.g. 500ms database calls) can only sustain a theoretical maximum of 80 requests per second per Uvicorn worker (40 threads / 0.5s) before queuing begins. For sync-heavy workloads, increase the Uvicorn worker process count (`--workers`) or adjust the AnyIO thread limiter tokens.

- **Trap 4: Leaking synchronous file system operations into async routes.**
  Standard Python `open()`, `file.read()`, and `file.write()` are blocking system calls. While small files in OS cache return quickly, reading a 50MB file or accessing a network-mounted drive (NFS/EFS) inside `async def` blocks the event loop for hundreds of milliseconds. Use `aiofiles` or offload the file read via `anyio.to_thread.run_sync`.

## 7. Compare With Related Concepts

- **`async def` in FastAPI vs `async def` in Flask/Django:**
  In FastAPI, `async def` runs on the native ASGI event loop, and standard `def` is automatically pushed to a threadpool. In older Flask WSGI versions, all routes ran synchronously in worker threads; modern Flask and Django ASGI support async routes, but their thread-safety boundaries and ORM integration require careful sync-to-async adapters (`asgiref.sync.sync_to_async`).
  *Rule:* In FastAPI, you don't need manual sync-to-async wrappers for route handlers—just pick `def` for sync code and `async def` for async code.

- **FastAPI Threadpool Offloading vs BackgroundTasks (`BackgroundTasks.add_task`):**
  FastAPI's threadpool offloading for `def` routes happens *during* the request lifecycle—the client waits for the response until the thread completes. `BackgroundTasks` executes a function *after* the HTTP response has already been sent over the wire to the client.
  *Rule:* Use standard `def` when the client needs the result of a blocking call; use `BackgroundTasks` for fire-and-forget actions like sending an email after signup.

- **AnyIO Threadpool (`to_thread.run_sync`) vs `ProcessPoolExecutor`:**
  The AnyIO threadpool runs tasks within the same process on separate threads, sharing memory but subject to Python's GIL. `ProcessPoolExecutor` spawns separate OS processes with independent Python interpreters and memory spaces, bypassing the GIL entirely.
  *Rule:* Use threadpool offloading (`def` or AnyIO) for I/O-bound blocking calls; use process pools for heavy CPU-bound computation.

## 8. 🧠 The Memory Hook

If you write `await`, write `async def`—you are the conductor on the event loop. If you call blocking libraries, write standard `def`—FastAPI hires a worker thread so the conductor never has to put down the baton.
