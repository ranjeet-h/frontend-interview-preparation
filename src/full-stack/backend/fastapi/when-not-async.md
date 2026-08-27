# When NOT to Use `async def` in FastAPI: CPU-Bound Tasks, Blocking Drivers, and Threadpools

## 1. Why This Exists — The Problem First

A team migrates their microservice to FastAPI because they read that asynchronous Python is lightning fast. Excited by modern `async/await` syntax, the developers declare every single route handler as `async def`. One of these endpoints accepts an avatar upload, resizes the image using Pillow (PIL), and uploads the processed file to AWS S3 using `boto3`.

During local development with one developer sending one request at a time, the endpoint responds in 350 milliseconds. Everything seems fine.

Then the service hits production. Under peak load with 2,500 active concurrent WebSocket and HTTP connections, multiple users upload avatars simultaneously. Because the route handler is declared with `async def`, Python's single-threaded asyncio event loop executes the image resizing loops and the synchronous S3 upload directly on the main thread. For 700 milliseconds, the event loop thread is completely locked, computing pixel transformations and waiting on synchronous OS socket I/O.

During those 700 milliseconds, the event loop cannot process any incoming network packets. It cannot complete TLS handshakes, cannot accept new TCP connections, and cannot respond to Kubernetes `/healthz` liveness probes. Kubernetes misses three consecutive health checks, assumes the pod has deadlocked, sends a `SIGKILL`, and restarts the container. Traffic immediately shifts to the surviving pods, which get hammered with the same avatar uploads, freeze their own event loops, fail their health checks, and cascade into a cluster-wide outage.

All of this happens because of two misunderstood words: `async def`.

## 2. The Analogy — Make It Obvious

Imagine a busy restaurant with a single master expeditor standing at the kitchen counter. This expeditor is the asyncio event loop on Python's main thread.

When a customer orders a pizza that bakes in a smart automated oven (a true non-blocking asynchronous operation, like an `await asyncpg.fetch(...)` query), the expeditor slides the pizza into the oven, sets a digital timer, and immediately turns around to greet twenty other customers and hand out drinks. When the oven timer dings, the expeditor grabs the pizza and serves it. One person effortlessly manages hundreds of simultaneous orders because they never stand idle waiting for an oven.

Now imagine a customer orders a hand-sculpted ice swan (a CPU-bound task like Pillow image resizing or Pandas data crunching) or asks the expeditor to personally drive across town to buy fresh mushrooms from a farm that only takes cash (a synchronous blocking I/O call like `requests.get()` or `psycopg2`).

If the expeditor personally starts chiseling the ice or leaves the building to drive across town (writing blocking code inside `async def`), the entire restaurant comes to a dead stop. No drinks are poured, no orders are taken, and pizzas burn in the ovens. The health inspector walks in, sees an unattended kitchen, and shuts the restaurant down.

To run the restaurant properly, the expeditor needs two delegation systems:

1. **The Kitchen Prep Crew (The AnyIO Threadpool):** When a task requires standard manual labor or waiting on synchronous suppliers (like `boto3` or standard file reads), the expeditor delegates it to a prep worker in the back room. The expeditor stays at the counter handling all customer traffic. In FastAPI, declaring a normal `def` endpoint automatically hands the request to this threadpool!
2. **An Outside Industrial Factory (ProcessPoolExecutor or Celery Workers):** When a task requires massive physical machinery and raw compute power that would shake the entire building (heavy multi-core CPU computation that fights Python's Global Interpreter Lock), the expeditor sends the job to a separate dedicated facility.

## 3. How It Actually Works — The Full Explanation

FastAPI is built on top of Starlette and AnyIO. To use it correctly in production, you must understand exactly how the runtime routes `async def` versus standard `def` functions.

**How FastAPI Executes `async def` Handlers**

When you write `@app.get("/items") async def get_items():`, FastAPI registers the endpoint as a native Python coroutine. When an HTTP request arrives, the main asyncio event loop runs that coroutine directly on the main application thread using `await get_items()`.

This model is exceptionally fast for I/O-bound operations that use non-blocking asynchronous drivers (such as `httpx.AsyncClient`, `asyncpg`, or `redis.asyncio`). Whenever the code hits an `await`, it yields control back to the event loop. While the operating system waits for bytes to travel across the network, the event loop processes thousands of other requests.

However, cooperative multitasking requires cooperation. If your `async def` function executes a synchronous blocking call (like `time.sleep(5)` or `requests.get("https://api.com")`), there is no `await` yielding control. The main thread halts everything until that blocking function returns.

**How FastAPI Executes Standard `def` Handlers**

When you write `@app.get("/items") def get_items():` (without the `async` keyword), FastAPI recognizes that this is a synchronous function. Instead of running it on the main event loop, FastAPI automatically offloads it to a worker threadpool managed by AnyIO using `anyio.to_thread.run_sync`.

The event loop on the main thread remains completely free to accept new incoming connections, run lightweight async routes, and handle health checks, while separate OS worker threads execute the synchronous blocking code in parallel.

**The Three Scenarios Where `async def` Is an Anti-Pattern**

1. **CPU-Bound Computation:** Image manipulation (Pillow, OpenCV), machine learning model inference (scikit-learn, PyTorch, TensorFlow), cryptography (bcrypt, argon2 password hashing, RSA key generation), data parsing (heavy Pandas or Polars dataframe transformations), and compression (zlib, gzip, brotli). In these tasks, the CPU is running intensive mathematical loops. If run inside `async def`, the single event loop thread cannot switch tasks because no I/O yield occurs.
2. **Synchronous Blocking I/O Libraries:** Legacy database drivers (`psycopg2`, `pymysql`, `cx_Oracle`, SQLite via synchronous SQLAlchemy `Session`), synchronous HTTP clients (`requests`, `urllib3`), cloud SDKs (`boto3`, Google Cloud client libraries without async variants), and synchronous file access (`open()`, `pathlib.Path.read_bytes()`). These libraries block the calling OS thread while waiting for sockets or disk controllers.
3. **C-Extensions Holding the Global Interpreter Lock (GIL):** Python threads are governed by the GIL. If heavy CPU code runs in pure Python or inside C-extensions that do not release the GIL, running them in worker threads will still throttle CPU throughput across cores. While offloading to threads protects the event loop from total starvation, true multi-core parallel speedup requires separate processes.

**The Four Architectural Solutions for Non-Async Workloads**

- **Pattern 1: Declare a Standard `def` Route:**
  For endpoints dominated by synchronous libraries (such as a legacy SQLAlchemy sync session or `boto3`), simply omit `async`. FastAPI runs the whole route in AnyIO's threadpool (which defaults to a capacity of around 40 threads, customizable via AnyIO settings).
- **Pattern 2: Explicit Thread Offloading with `run_in_threadpool` or `asyncio.to_thread`:**
  When 95% of your endpoint is async (you fetch data from Postgres via `asyncpg` and call external microservices via `httpx`), but you need one synchronous operation (like verifying a password with `bcrypt.checkpw` or generating a signed JWT with a CPU-heavy crypto library), keep the route `async def` and wrap only the blocking call using `await fastapi.concurrency.run_in_threadpool(sync_function, *args)` or Python's native `await asyncio.to_thread(sync_function, *args)`.
- **Pattern 3: ProcessPoolExecutor for Heavy CPU Math:**
  When an endpoint performs intensive CPU computations (like resizing high-resolution photos or running a scikit-learn model), threadpools hit the GIL barrier. Spawning worker processes via `concurrent.futures.ProcessPoolExecutor` gives each worker its own Python interpreter and dedicated CPU core, bypassing the GIL while keeping the main FastAPI event loop completely responsive.
- **Pattern 4: Background Distributed Task Queues (Celery, ARQ, SAQ):**
  When a task takes longer than 500 milliseconds (generating a 100-page PDF, processing video chunks, batch syncing 10,000 records), it should never run inside the web server's request-response lifecycle. The FastAPI endpoint should validate the input, push a job message to Redis/RabbitMQ/SQS, and immediately return an HTTP `202 Accepted` status with a task ID.

## 4. Real Code — See It Working

Here are the four standard production patterns for handling blocking and CPU-bound work in FastAPI without destroying event loop concurrency.

**Example 1: The Wrong Way vs The Right Way for Synchronous I/O**

```python
import time
import requests
from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool

app = FastAPI()

# ❌ ANTI-PATTERN: Blocking synchronous I/O inside an async route.
# While requests.get waits 2 seconds for a remote server, the entire
# event loop is frozen. No other user can connect or get a response.
@app.get("/bad-sync-in-async")
async def bad_sync_in_async():
    # Calling synchronous network I/O on the event loop thread
    response = requests.get("https://httpbin.org/delay/2")
    return {"status": response.status_code}

# ✅ SOLUTION A: Declare as normal def.
# FastAPI automatically runs this inside the AnyIO worker threadpool.
# The main event loop remains free to process other concurrent requests.
@app.get("/good-sync-def")
def good_sync_def():
    response = requests.get("https://httpbin.org/delay/2")
    return {"status": response.status_code}

# ✅ SOLUTION B: Selective thread offloading inside an async route.
# Used when the route is mostly async, but contains one synchronous step.
@app.get("/good-selective-offload")
async def good_selective_offload():
    # Imagine an async database query happened here:
    # user = await db.fetch_user(user_id)

    # We wrap only the synchronous blocking call in a threadpool worker
    response = await run_in_threadpool(requests.get, "https://httpbin.org/delay/2")
    return {"status": response.status_code}
```

**Example 2: CPU-Bound Image Processing with `ProcessPoolExecutor`**

```python
import io
import asyncio
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager
from PIL import Image, ImageOps
from fastapi import FastAPI, UploadFile, File, Response

# Top-level pure function executed inside worker processes.
# It runs in a completely separate OS process with its own Python interpreter and GIL.
def transform_image_cpu(image_bytes: bytes, target_size: tuple[int, int]) -> bytes:
    with Image.open(io.BytesIO(image_bytes)) as img:
        # Heavy CPU operations: resize, grayscale conversion, and auto-contrast
        processed = ImageOps.fit(img, target_size, method=Image.Resampling.LANCZOS)
        processed = ImageOps.grayscale(processed)

        output_buffer = io.BytesIO()
        processed.save(output_buffer, format="JPEG", quality=85)
        return output_buffer.getvalue()

# Manage the lifecycle of the ProcessPoolExecutor across application startup/shutdown
process_pool: ProcessPoolExecutor | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global process_pool
    # Allocate worker processes matching available physical CPU cores
    process_pool = ProcessPoolExecutor(max_workers=4)
    yield
    # Gracefully shut down worker processes on server termination
    process_pool.shutdown(wait=True)

app = FastAPI(lifespan=lifespan)

@app.post("/resize-avatar")
async def resize_avatar(file: UploadFile = File(...)):
    raw_bytes = await file.read()

    loop = asyncio.get_running_loop()
    # Offload the CPU computation to the process pool.
    # The event loop awaits the future without locking the main thread.
    result_bytes = await loop.run_in_executor(
        process_pool,
        transform_image_cpu,
        raw_bytes,
        (256, 256)
    )

    return Response(content=result_bytes, media_type="image/jpeg")
```

**Example 3: Password Hashing with `run_in_threadpool`**

```python
import bcrypt
from fastapi import FastAPI, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

app = FastAPI()

class UserRegister(BaseModel):
    username: str
    password: str

def compute_password_hash_sync(raw_password: str) -> str:
    # bcrypt uses intentional CPU-intensive key stretching (work factor).
    # Running this on the event loop would block other requests for ~100ms per registration.
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(raw_password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

@app.post("/register", status_code=status.HTTP_201_CREATED)
async def register_user(payload: UserRegister):
    # Offload the CPU-heavy hashing to a threadpool worker
    hashed_password = await run_in_threadpool(compute_password_hash_sync, payload.password)

    # Now continue with non-blocking async database operations:
    # await async_db.users.insert(username=payload.username, password=hashed_password)

    return {"message": "User registered successfully", "username": payload.username}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why does putting a synchronous `requests.get()` or `time.sleep()` inside an `async def` route freeze the entire FastAPI application?**

Python's asyncio event loop runs in a single thread and relies on cooperative multitasking. When a function is declared with `async def`, the event loop executes its bytecode instruction by instruction on that main thread. The event loop only pauses that task and switches to other incoming HTTP requests when it encounters an explicit `await` on an awaitable object that yields control (such as an asynchronous socket read).

Functions like `requests.get()`, `time.sleep()`, or `psycopg2.connect()` are written for synchronous execution. They do not know about asyncio and have no `await` yield points. Instead, they make synchronous operating system calls that put the OS thread to sleep while waiting for network packets or timers. Because this occurs directly on the main event loop thread, the entire event loop halts. No other coroutine can execute, no new TCP connections can be accepted, and no health-check probes can be answered until the blocking call returns.

**Q: How does FastAPI internally handle a standard `def` route differently from an `async def` route?**

FastAPI inspects route functions at application startup. If a route handler is declared with `async def`, FastAPI schedules and awaits it directly on the main asyncio event loop.

If a route handler is declared with standard `def`, FastAPI recognizes that the code may contain synchronous blocking operations. When a request hits that endpoint, FastAPI delegates the execution of the handler to AnyIO's worker threadpool using `anyio.to_thread.run_sync`. The event loop immediately resumes listening for network I/O, while a separate background OS thread executes the route logic. Once the thread completes its work, AnyIO notifies the event loop with the return value, which serializes the response and sends it back to the client.

**Q: If standard `def` routes run in a threadpool, why not declare every single route as `def`? What is the trade-off?**

While standard `def` routes safely prevent event loop starvation for synchronous code, relying entirely on threadpools has significant scalability limits compared to true asynchronous I/O:

1. **Memory Overhead per Connection:** Every OS thread in a threadpool consumes dedicated memory (typically 8MB stack allocation by default on Linux, though Python threads share process heap, the OS thread control structures still add overhead). An asyncio event loop can hold 50,000 concurrent sleeping connections with minimal RAM, whereas 50,000 OS threads would crash the server with an out-of-memory error.
2. **Context Switching Costs:** When hundreds of OS threads compete for CPU cores, the OS kernel spends significant CPU cycles saving and restoring CPU register states (preemptive context switching). Asyncio uses lightweight user-space task switching, which has virtually zero kernel overhead.
3. **Threadpool Saturation:** The default AnyIO threadpool is capped (defaulting to 40 threads). If 40 clients make slow 3-second database calls simultaneously, all 40 threads are occupied. The 41st request must wait in an internal queue before execution even begins, destroying throughput under heavy concurrency.

The rule of thumb: Use `async def` with native async libraries (`httpx`, `asyncpg`, `aiofiles`) for high-concurrency I/O-bound routes. Use `def` only when forced to use synchronous blocking libraries.

**Q: Why does running heavy CPU-bound code in a threadpool still fail to scale in Python, and how does `ProcessPoolExecutor` solve it?**

In standard CPython, the Global Interpreter Lock (GIL) ensures that only one native OS thread executes Python bytecode at any given instant within a single process.

When you offload a CPU-heavy Python calculation (such as looping over a 500,000-row list or computing statistical aggregates in pure Python) to a threadpool, you protect the main event loop from total lockup because the OS will preemptively switch between the worker thread and the event loop thread. However, the worker thread and the main thread still compete for the exact same single CPU core due to the GIL. If you run four CPU-heavy worker threads on an 8-core server, your CPU utilization will remain stuck at ~100% of one core instead of scaling across all eight cores.

`ProcessPoolExecutor` solves this by spawning completely separate OS processes. Each process runs its own independent CPython interpreter, has its own memory space, and has its own GIL. This enables true hardware parallelism across all available CPU cores without throttling the main web server process.

**Q: How do you detect and monitor blocking calls in an async FastAPI application?**

There are three primary ways to detect event loop blockage:

1. **Python Asyncio Debug Mode:** Set the environment variable `PYTHONASYNCIODEBUG=1` or run `loop.set_debug(True)`. You can configure `loop.slow_callback_duration = 0.05` (50ms). Whenever an event loop callback takes longer than 50ms without yielding, asyncio prints a warning with the exact filename, line number, and stack trace to stderr.
2. **Event Loop Lag Metrics in Production:** Use Prometheus instrumentation (such as `aioprometheus` or custom middleware) to measure the delay of a recurrent background canary timer. If a timer scheduled to run every 100ms takes 600ms to fire, your event loop lag is 500ms, indicating that a route handler is blocking the main thread.
3. **Sampling Profilers (py-spy):** Run `py-spy dump --pid <fastapi_pid>` in staging or production under load. `py-spy` inspects the CPython stack frames from outside the process without pausing execution, instantly revealing if the main event loop thread is stuck in synchronous socket reads, disk I/O, or PIL loops.

**Q: When should you use `fastapi.concurrency.run_in_threadpool` instead of changing the route signature to standard `def`?**

Use `run_in_threadpool` (or `asyncio.to_thread`) when the route handler is predominantly asynchronous and needs to perform multiple non-blocking async operations, but has a single isolated synchronous step.

For example, consider an endpoint that:
1. Authenticates an incoming request by reading a session from Redis with `await redis.get()`.
2. Fetches account records from PostgreSQL using `await asyncpg.fetch()`.
3. Validates a complex legacy XML signature using a synchronous C-library (`xmlsec`).
4. Sends an audit notification over HTTP using `await httpx_client.post()`.

If you converted this entire route to standard `def`, steps 1, 2, and 4 would lose all async efficiency and tie up a threadpool worker for the entire request duration. By keeping the route `async def` and wrapping only step 3 in `await run_in_threadpool(validate_xml_signature, data)`, you get maximum async concurrency for all I/O while safely isolating the synchronous CPU/blocking call.

## 6. The Traps — What Goes Wrong

**Trap 1: The "Async Everything" Cargo Cult**

- **The Wrong Assumption:** Many developers assume that changing `def` to `async def` makes any Python code magically faster.
- **Why It Is Wrong:** `async def` does not speed up computation or convert blocking libraries into async ones. If the underlying code does not use non-blocking I/O with `await`, `async def` makes performance significantly worse under load because it moves execution from a multi-threaded pool to the single-threaded event loop, serializing all concurrent traffic.
- **What Happens in Production:** An endpoint handling 50 requests per second with standard `def` suddenly drops to 2 requests per second when converted to `async def` with synchronous database queries, causing request timeouts.

**Trap 2: Hidden Blocking in Standard Library Utilities and ORMs**

- **The Wrong Assumption:** Developers believe that because they are in an `async def` route, standard calls like `open("config.json").read()`, `logging.info()`, or `db_session.query(User).all()` are safe.
- **Why It Is Wrong:** Standard Python file operations (`open`), standard logging handlers that write to disk, DNS lookups via `socket.gethostbyname()`, and classic SQLAlchemy sync sessions perform synchronous blocking system calls.
- **The Fix:** Use `aiofiles` for asynchronous file reading, `asyncpg` / `SQLAlchemy.ext.asyncio` for database queries, or offload the synchronous ORM queries by declaring the route as standard `def`.

**Trap 3: Threadpool Exhaustion and Starvation with Standard `def`**

- **The Wrong Assumption:** Believing that declaring standard `def` solves all concurrency problems for slow synchronous external API calls.
- **Why It Is Wrong:** AnyIO's threadpool has a finite size (defaulting to 40 worker threads). If an endpoint calls a slow third-party API that takes 10 seconds to respond, and 40 concurrent requests arrive, all 40 worker threads are locked waiting on remote responses. The 41st request cannot be picked up by the threadpool and sits in an execution backlog, causing client timeouts.
- **The Fix:** If external I/O is slow, use a truly asynchronous HTTP client (`httpx.AsyncClient`) inside `async def`, or increase the AnyIO threadpool limiter capacity using `anyio.to_thread.current_default_thread_limiter().total_tokens = 200`.

**Trap 4: Instantiating `ProcessPoolExecutor()` Inside Route Handlers**

- **The Wrong Assumption:** Writing `with ProcessPoolExecutor() as executor: await loop.run_in_executor(executor, ...)` inside the endpoint handler.
- **Why It Is Wrong:** Creating a new `ProcessPoolExecutor` on every incoming HTTP request forces the operating system to fork/spawn new processes, duplicate memory structures, and initialize new Python interpreters for every single request.
- **What Happens in Production:** The operating system runs out of process IDs (PIDs), memory spikes instantly to 100%, and the server kernel triggers an Out-Of-Memory (OOM) kill.
- **The Fix:** Initialize a single global `ProcessPoolExecutor` during application startup in FastAPI's `lifespan` context manager, reuse it across all requests, and shut it down cleanly during application termination.

**Trap 5: Passing Async Database Sessions Across Thread Boundaries**

- **The Wrong Assumption:** Calling `await run_in_threadpool(sync_helper, async_session)` to mix sync helpers with async database sessions.
- **Why It Is Wrong:** Async database objects (like SQLAlchemy's `AsyncSession` or `asyncpg.Connection`) are bound to the specific asyncio event loop of the main thread. Accessing or closing them inside a background worker thread raises greenlet errors or `IllegalStateError: Attached to a different loop`.
- **The Fix:** Keep async sessions strictly on the main event loop thread. Pass only plain Python primitives or detached Pydantic data schemas into threadpool workers.

## 7. Compare With Related Concepts

**Execution Model Comparison**

| Mechanism | Concurrency Model | Best Suited For | Failure Mode If Misused |
|---|---|---|---|
| **`async def` on Event Loop** | Single-threaded cooperative multitasking | High-concurrency I/O using native async libraries (`asyncpg`, `httpx`, `redis.asyncio`) | A single blocking call freezes the entire server for all users |
| **Standard `def` (AnyIO Threadpool)** | Multi-threaded OS worker pool (managed by FastAPI) | Existing synchronous libraries (`psycopg2`, `boto3`, sync file I/O, sync SQLAlchemy) | Threadpool exhaustion under massive concurrent slow I/O |
| **`ProcessPoolExecutor`** | Multi-process separate CPython interpreters | CPU-bound math, image processing, model inference, compression (bypasses GIL) | High memory usage if too many worker processes are spawned |
| **Distributed Task Queue (Celery/ARQ)** | Separate worker cluster via message broker (Redis/RabbitMQ) | Long-running tasks (>500ms), batch imports, email delivery, video encoding | Architectural complexity; requires broker and worker monitoring |

**Thread Offloading Helpers: When to Use Which**

- **`fastapi.concurrency.run_in_threadpool(func, *args)` vs `asyncio.to_thread(func, *args)`:**
  `asyncio.to_thread` was introduced in Python 3.9 as a built-in standard library function. `fastapi.concurrency.run_in_threadpool` is Starlette's AnyIO wrapper that preserves context variables (`contextvars`). In modern FastAPI applications running Python 3.10+, both work seamlessly; prefer `run_in_threadpool` if you rely heavily on Starlette context propagation, or `asyncio.to_thread` for standard library purity.
- **Rule of Thumb:**
  - If the whole route is sync: Declare it as `def`.
  - If the route is async with one sync step: Use `await run_in_threadpool(sync_step)`.
  - If the route does heavy CPU crunching: Use `await loop.run_in_executor(process_pool, cpu_func)`.
  - If the task takes seconds or minutes: Push to Celery / ARQ and return `HTTP 202 Accepted`.

## 8. 🧠 The Memory Hook — What Sticks

If an operation does not have an `await` that genuinely yields control during waiting, never put it in `async def`. Let FastAPI threadpool standard `def` for synchronous I/O, spawn a `ProcessPoolExecutor` for heavy CPU math, and keep your event loop running uninterrupted.
