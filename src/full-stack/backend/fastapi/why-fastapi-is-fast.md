# Why FastAPI Is Fast

## 1. The Real-World Problem — When You Actually Hit This

You ship your first Python API with Flask. It works fine for ten users in dev. Then it hits production with 800 concurrent users during a sale. Latency climbs from 40ms to 4 seconds. The server spawns a thread per request, each thread waits on the same database, memory blows up, and a deploy that should add one field to an endpoint takes half a day because every route has hand-written checks, manual JSON parsing, and docs that drift from the code.

You do not have a slow language problem. You have a concurrency model problem, a validation cost problem, and a developer speed problem all at once. That is the exact moment "why FastAPI is fast" matters, and the answer is not one trick. It is three different kinds of fast that solve three different pains.

First, your server needs to juggle thousands of waiting connections without hiring a thread for each one. Second, every request pays a tax for checking types, parsing JSON, and serializing the response, and that tax dominates latency on small I/O APIs. Third, your team needs to ship correct endpoints fast without writing the same validation and docs twice. Miss any one of these and you will either be slow under load, slow per request, or slow to ship.

And there is honesty required. FastAPI is not fast at everything. If your endpoint resizes images, runs a big pandas transform, or calls a sync database driver inside an async handler, that one request will freeze the whole process and make every other request wait.

## 2. The Analogy — Make the Mechanic Obvious

Picture a city courier dispatch hub.

One dispatcher sits at a wall of radios. She does not ride a bike herself. She takes a call, looks up the address, hands the slip to the next free rider, and immediately takes the next call. While riders are stuck at traffic lights or waiting at building lobbies, she keeps dispatching. She never stands idle just because a rider is waiting. That dispatcher is Starlette on top of ASGI and asyncio. One event loop handles many connections by switching to another request the moment one waits on I/O.

Next to her is a laser parcel scanner. Every incoming parcel slides through it. The scanner checks weight, dimensions, reads the barcode, and rejects anything that does not match the label in a fraction of a second. A person with a tape measure could do the same job, but slowly and with mistakes. That scanner is Pydantic with pydantic-core. It was rewritten in Rust so the same validation that used to run as interpreted Python now runs as compiled code.

On the wall is a stack of pre-printed waybills. The address boxes, phone boxes, and weight boxes are already there. The rider just fills values into the right boxes, and the same form automatically becomes the customer receipt and the tracking page. That stack is Python type hints in FastAPI. You describe the shape once with a Pydantic model, and FastAPI reuses it for validation, for serialization, and for generating OpenAPI docs. You do not write three copies.

A hub has a fourth lesson too. If a rider brings a couch that needs assembly, the dispatcher does not ask that rider to build it at the radio desk. She sends it to the workshop out back where a separate crew handles heavy work without blocking the radios. That workshop is FastAPI's threadpool for sync `def` routes and `run_in_threadpool`. CPU work that would block the dispatcher must run elsewhere, or the whole hub stalls.

One dispatcher juggling many riders is concurrency. One laser scanner is validation speed. Pre-printed waybills are developer velocity. The workshop rule is the honesty about CPU-bound work.

## 3. The Full Explanation — How It Actually Works

"Fast" in FastAPI points to three separate layers. If you mix them up in an interview, you sound like you memorized a tagline. If you separate them, you sound like you have run it in production.

The three meanings, plainly: concurrency fast means one process handles many simultaneous I/O waits without a thread per request. Validation fast means parsing and serializing each request costs far less CPU. Developer velocity fast means you define contracts once and get runtime checks, filtered responses, and correct docs for free.

Layer 1 is Starlette and ASGI handling many waits at once.

Most Python web history is WSGI: Flask and Django under gunicorn or uWSGI. WSGI is a sync interface. Each incoming request gets a thread or process. The thread runs your handler top to bottom. If the handler waits 40ms for Postgres, that thread just sits and holds memory. To serve 1000 concurrent waits you need roughly 1000 threads. Threads are heavy and context switches cost.

ASGI is the async successor. Starlette is a lightweight ASGI toolkit that FastAPI is built on. It owns routing, request and response objects, middleware, WebSockets, and background tasks, all on top of `asyncio`. Uvicorn is the ASGI server that drives Starlette. It runs an event loop on a single thread. When your `async def` endpoint hits `await` on a real async I/O operation like `await db.fetch()` or `await httpx.get()`, it voluntarily gives control back to the loop. The loop runs other requests while that one waits. When the database replies, the loop resumes that handler exactly where it paused.

This is cooperative multitasking. It only helps when the waits are true I/O waits outside Python. Network calls, database queries over an async driver, and streaming bytes are wins. Pure Python loops, JSON transforms over huge payloads, or image encoding are not waits. They are work on the CPU, and they keep the loop occupied.

FastAPI adds a detail that prevents the most common footgun. If you write a handler with plain `def` instead of `async def`, FastAPI does not run it on the event loop. It runs it in a threadpool managed by Starlette (via `anyio`). That keeps a blocking call from freezing the dispatcher. The rule is simple: use `async def` only when you and every dependency you call are truly async end to end. If any link in the chain is sync, use `def` and let the threadpool handle it.

A single event loop uses a single CPU core because of the GIL. One Uvicorn worker will saturate one core. Production on a four-core machine needs multiple workers, either with `uvicorn --workers 4` or a process manager like gunicorn with `UvicornWorker`. Workers are separate processes with separate loops. You scale cores by adding workers, and you scale I/O concurrency by not blocking the loop inside each worker.

For neighboring detail, see [ASGI](asgi.md), [Starlette](starlette.md), and [Uvicorn](uvicorn.md). This page applies their mechanics to throughput rather than re-teaching them.

Layer 2 is Pydantic v2 with pydantic-core moving validation to Rust.

Even with perfect concurrency, each request still parses bytes to Python, checks types, coerces values, and serializes back to JSON. On small CRUD APIs that cost can be a third to a half of total CPU per request.

Pydantic v1 did that work in Python. Pydantic v2 moved it into `pydantic-core`, a Rust extension compiled to native code. Rust here does not change the rules, it just runs the same checks much faster: required fields, type coercion, `ge`/`le`/`max_length` constraints, nested models, unions, and `mode='serialization'` filtering.

The speedup is most visible on endpoints with nested models or lists. Benchmarks comparing v2 to v1 or to pure Python validators like marshmallow typically report 5x to 50x for validation alone, depending on schema shape. That per-request saving stacks under concurrency because you free the loop or the threadpool thread faster.

Pydantic also gives you security and correctness defaults. By default it fails closed. Unknown or wrongly typed input is rejected with a 422 and never reaches your handler. Output filtering through `response_model` strips private fields so you do not leak internal state. Those are production boundaries, not just convenience.

See [Pydantic](pydantic.md) and [Request Body Validation](request-body-validation.md) for the model mechanics themselves.

Layer 3 is developer velocity from type hints.

FastAPI treats your Pydantic models and Python type hints as the single source of truth. You write the contract once and three things happen automatically: request bodies and query params are validated and coerced, responses are filtered and serialized through the same model, and OpenAPI JSON plus Swagger UI at `/docs` are generated from the same types.

This is not a performance trick, but it is why teams say FastAPI is fast to build with, and it affects production speed indirectly. Validated clients fail loudly at the edge with 422 details instead of deep in business logic. Docs that match code means fewer integration round trips. Typed dependencies mean auth and session scoping are shared, tested patterns instead of copy pasted checks.

The honest edge is I/O-bound versus CPU-bound.

Use `async def` when the handler awaits async I/O: `asyncpg` for Postgres, `motor` for Mongo, `httpx.AsyncClient`, `aiofiles`, or another async library. You reclaim time the thread would have spent blocked.

Use `def` when the handler does CPU-bound work or must call a sync library like `psycopg2`, `pymongo`, `requests`, Pillow transforms, or heavy data crunching. Place intentional CPU work on the threadpool explicitly with `run_in_threadpool` if it appears inside an otherwise async flow. Never call a blocking function inside `async def` without moving it off the loop. The symptom of getting this wrong is not a single slow request. It is every concurrent request getting slow because the loop is parked on one computation.

What real production depends on is the plumbing around those layers.

Concurrency and Rust validation set the ceiling. Whether you hit it depends on plumbing around them. An async endpoint that awaits a sync database driver like `psycopg2` still blocks. Use `asyncpg` or `aiosqlite` for SQLite. Pool connections so you are not opening a new TCP connection per request. Keep middleware short, because it runs on every request. Keep responses small by returning a `response_model` that includes only the fields the client needs. Run multiple workers and put them behind a reverse proxy so connections are reused and cores are filled. Log correlation IDs and include trace context so a slow span under concurrency is attributable to the right downstream call.

## 4. See It In Practice — Real Code or Queries

The examples below are runnable FastAPI patterns. Each snippet includes its own imports. Copy either file into a fresh folder, install `fastapi`, `uvicorn`, `pydantic`, and `httpx`, and it compiles and runs as shown. The third snippet shows the uvicorn entrypoint and the threadpool rule.

First, the core pattern: an async endpoint that validates with Pydantic, awaits real async I/O, and handles its own failure. It also shows how a sync route is handled without blocking the loop.

```python
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI()


class OrderIn(BaseModel):
    product_id: int = Field(ge=1)
    qty: int = Field(ge=1, le=100)


class OrderOut(BaseModel):
    order_id: int
    product_id: int
    qty: int


def get_api_key(api_key: str = "") -> str:
    # Fail closed: missing or wrong key never reaches the handler.
    if api_key != "secret-test-key":
        raise HTTPException(status_code=401, detail="invalid api key")
    return api_key


@app.post("/orders", response_model=OrderOut, status_code=201)
async def create_order(
    payload: OrderIn,
    api_key: Annotated[str, Depends(get_api_key)],
) -> OrderOut:
    # payload is already validated by pydantic-core (Rust).
    # Any type error or constraint violation would have returned 422
    # before this line runs.
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://httpbin.org/json",
                headers={"x-api-key": api_key},
            )
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        # Do not leak internal details. Convert to a safe client error.
        raise HTTPException(status_code=502, detail="upstream unavailable") from exc

    # Simulate an inserted id after the I/O wait.
    return OrderOut(order_id=101, product_id=payload.product_id, qty=payload.qty)


@app.get("/health")
def health() -> dict[str, str]:
    # Sync route: FastAPI runs this in a threadpool so it never
    # blocks the main event loop, even if it does small sync work.
    return {"status": "ok"}
```

Next, the rule for CPU-bound work. The first endpoint blocks the loop and is the trap. The second endpoint offloads the same work correctly. Pick the second shape in production.

```python
import asyncio
import time

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

app = FastAPI()


class ResizeIn(BaseModel):
    pixels: int


def heavy_resize(pixels: int) -> int:
    # Stands in for real CPU work like image or data transforms.
    # time.sleep here simulates work that holds the GIL.
    time.sleep(0.05)
    return pixels * 2


@app.post("/resize-bad")
async def resize_bad(payload: ResizeIn) -> dict[str, int]:
    # Trap: this blocks the event loop. Every concurrent request
    # stalls while heavy_resize holds the loop thread.
    result = heavy_resize(payload.pixels)
    return {"result": result}


@app.post("/resize-good")
async def resize_good(payload: ResizeIn) -> dict[str, int]:
    # Correct: move CPU work to the threadpool and await the result.
    # The loop is free to serve other requests while this runs.
    result = await run_in_threadpool(heavy_resize, payload.pixels)
    return {"result": result}


@app.post("/resize-sync-route")
def resize_sync_route(payload: ResizeIn) -> dict[str, int]:
    # Also correct: plain def routes already run in the threadpool.
    # Use this shape when the whole handler is CPU-bound or calls
    # only sync libraries.
    return {"result": heavy_resize(payload.pixels)}


# Uvicorn entrypoint for local run and for showing the worker rule.
# In production on a 4-core box you would run:
#   uvicorn app:app --host 0.0.0.0 --port 8000 --workers 4
# or gunicorn with UvicornWorker. One worker uses one core.
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False, workers=1)
```

A few notes that interviewers check in this code. Validation fails closed with a 422 produced by Pydantic before your handler runs, and auth via `Depends(get_api_key)` fails closed with 401. The async handler awaits only async I/O (`httpx.AsyncClient`) and wraps it so an upstream failure becomes a controlled 502 instead of an unhandled rejection. The response uses `response_model=OrderOut` so only declared fields are serialized, which keeps payloads small and avoids leaking internal columns. The CPU example shows exactly when to prefer `def` or `run_in_threadpool` over `async def` that blocks.

## 5. Interview Questions — All of Them, Done Properly

**Q: Why is FastAPI fast? What are the three meanings of fast?**

FastAPI is called fast for three independent reasons and you should name all three. First, concurrency fast from Starlette and ASGI: one event loop multiplexes many I/O waits, so a single process handles hundreds of simultaneous connections without a thread per request. Second, per-request fast from Pydantic v2 and `pydantic-core`: validation and serialization run as compiled Rust, often 5 to 50 times faster than pure Python validators, and that stage can dominate cost on small JSON APIs. Third, developer velocity fast: you describe the contract once with type hints and Pydantic models and get runtime validation, response filtering, and correct OpenAPI docs from the same source. An answer that names only one layer sounds incomplete.

**Q: What does Starlette do for FastAPI's performance?**

Starlette is the ASGI foundation FastAPI builds on, not just a router. It provides the async request and response objects, path routing, middleware chain, WebSocket handling, and background tasks, all on `asyncio`. Because it is ASGI, it works with an async server like Uvicorn that runs a single event loop per worker. FastAPI then adds typed validation, dependency injection, and OpenAPI generation on top. Thinking Starlette is only routing understates what FastAPI inherits.

**Q: How does Pydantic-core make FastAPI faster, concretely?**

Pydantic v2 moved its hot path into `pydantic-core`, a Rust crate compiled as a Python extension. Every field check, coercion, length or range constraint, nested model parse, and JSON serialization now runs as native code. For a typical API where validation and serialization are a third to a half of the CPU per request, removing Python loop overhead for that stage is a direct throughput win. The effect is largest on complex schemas with nesting and lists. Compare [Pydantic](pydantic.md) versus a manual marshmallow chain to see the same API shape validated in both.

**Q: When should you not use `async def` in FastAPI?**

Use `async def` only when that handler and every dependency it calls are truly async end to end. If any part is sync, prefer `def`. An `async def` that calls `psycopg2`, `pymongo`, `requests`, or does heavy Python computation holds the event loop hostage. Every other request on that worker waits until that one finishes. A plain `def` handler runs in a threadpool and keeps the loop free. If you must call a blocking piece from inside an otherwise async handler, wrap it with `await run_in_threadpool(blocking_fn, ...)`. The interview signal is that you can name the boundary condition, not just recite "async is faster."

**Q: How does FastAPI compare to Flask and Django on performance?**

The core difference is the concurrency model. Flask and Django are WSGI. Under a traditional server each request occupies a thread or process while it waits on I/O. That costs memory and forces the OS to schedule many threads. FastAPI is ASGI. One thread runs an event loop and many requests share it cooperatively. Under concurrent I/O-bound load, FastAPI typically sustains higher throughput with less memory because waiting costs almost nothing. Add Pydantic-core versus Django forms or manual Flask validation and the per-request gap widens. For CPU-bound work the gap disappears, because all three share the GIL. The honest comparison is high throughput for I/O-bound APIs, similar ceiling for CPU-bound ones, which is why you still offload CPU work and scale with multiple workers regardless of framework.

**Q: If FastAPI is fast by design, what makes a real deployment slow anyway?**

Five things wipe out the framework advantage. One, the database driver: `psycopg2` in an async handler blocks the loop, while `asyncpg` does not. Two, missing pooling: opening a new connection per request adds tens of milliseconds. Three, large response bodies: returning whole ORM objects without a `response_model` filter dominates response time and bandwidth. Four, heavy or ordered middleware that runs on every request. Five, running one Uvicorn worker on a multi-core box, since one loop uses one core. Fix these before you blame the framework. Run async drivers, pool, filter responses, trim middleware, and deploy `workers = cores` behind a reverse proxy with connection reuse. Those are the levers that turn the ceiling into actual latency numbers.

## 6. The Traps — What Goes Wrong in Production

**Making every route `async def` by default.** The mental model is "async is always faster." It is not. An `async def` that calls a sync library provides zero benefit and creates a worse failure mode: it blocks the loop and stalls every concurrent request on that worker. Check the call chain. If any dependency is sync, make the handler `def` or explicitly offload with `run_in_threadpool`. The code in the previous section shows the bad and good shapes side by side.

**Putting a sync database driver behind an async endpoint.** `psycopg2` or `pymongo` inside `await`-style code still blocks the thread that runs the loop. The request looks async but behaves like Flask with one busy thread. The symptom is spiky p99 under load that disappears on low traffic. Use `asyncpg` with Postgres, `motor` with Mongo, or keep the route as `def` and let FastAPI's threadpool carry the blocking driver. Choose per route, not per app.

**Assuming FastAPI is fast for CPU-bound endpoints.** Resizing images, zipping files, running a large DataFrame transform, or computing embeddings will hold the GIL and block the loop. FastAPI cannot make CPU work async by itself. Offload it to a threadpool for moderate work or to a worker queue like Celery or ARQ for long jobs, and return 202 with a pollable result. See [When Not Async](when-not-async.md) and [Sync vs Async Routes](sync-vs-async-routes.md) for the full boundary.

**Running one Uvicorn worker in production.** It feels done because the app boots. On a four-core instance you leave three cores idle. Throughput plateaus at one core while latency looks fine at low load and then collapses. Deploy with `uvicorn --workers N` where N matches cores, or with gunicorn and `UvicornWorker`, and front it with nginx or an ALB for keep-alive reuse.

**Returning unfiltered ORM objects or large internal models.** Without `response_model` and `model_config` discipline, you serialize every column and relationship, including fields the client never uses and fields you did not intend to expose. That inflates payloads, burns CPU in serialization, and leaks data. Define an explicit output model per endpoint and return only what the contract promises.

**Letting middleware pile up without cost awareness.** Auth, logging, tracing, and compression middleware each add per-request work. Ordering matters and duplication hurts. Measure middleware latency in trace spans. Correlate by request ID so a slow middleware shows up as a consistent parent span, not as noise spread across handlers.

**Treating benchmarks of "hello world" as proof.** A bare `return {"ok": true}` benchmark flatters ASGI. Your real latency is dominated by your query, your payload shape, and your upstream calls. Test with realistic schemas and real drivers under concurrent load, not single-request microbenchmarks.

## 7. Compare With Related Concepts

**FastAPI (ASGI + Starlette + Pydantic) versus Flask or Django (WSGI).** Flask and Django use a thread or process per request. Memory grows with concurrency and waiting on I/O holds that thread. FastAPI on ASGI holds many waits on one loop and only spends a thread when a handler is declared as `def`. Rule: pick FastAPI when your API is I/O-bound with many concurrent waits and typed contracts. Keep Flask for tiny services where you explicitly want WSGI simplicity and sync libraries without bridging layers.

**FastAPI versus Go or Node for I/O concurrency.** Go's goroutines and Node's event loop reach similar concurrency economics to ASGI. The difference is less about raw throughput for I/O and more about ecosystem and CPU work. Go multiplexes CPU and I/O efficiently across cores. Python's GIL means one loop equals one core, so you scale CPU with workers. Rule: choose FastAPI when your team lives in Python and the domain is I/O-bound CRUD and integrations; choose Go when CPU multiplexing without worker hops is the primary constraint.

**Pydantic v2 with pydantic-core versus manual validation or marshmallow.** Manual `if not isinstance` chains and marshmallow run as Python loops per field. Pydantic v2 runs the same checks as compiled Rust and reuses the model for both validation and docs. Rule: use Pydantic models wherever FastAPI can see them. Reach for manual checks only at boundaries FastAPI does not own, like legacy message parsers.

**ASGI versus WSGI.** WSGI is a sync callable: `app(environ, start_response)`. It cannot pause and resume. ASGI is an async callable that speaks `scope`, `receive`, `send` and can await. That is what lets a single thread juggle waits. Rule: if you need WebSockets, background tasks, or high concurrent I/O without thread explosion, you need ASGI. WSGI cannot do those without extra machinery. For a closer look at the interfaces themselves, see [ASGI](asgi.md) and [Uvicorn](uvicorn.md).

**`async def` in FastAPI versus `async` in Node Express.** Express 4 does not handle a rejected promise from an async handler unless you catch or wrap it, and in Express 5 the framework does. FastAPI always handles it via its exception system, but both runtimes share the same trap: awaiting inside async and then calling a blocking library still blocks the loop. Rule: the async keyword does not make I/O non-blocking by itself. The driver and the work decide.

## 8. 🧠 The Memory Hook

One dispatcher juggling a hundred radios, one laser scanner that never blinks, one stack of pre-printed waybills, and a workshop out back for heavy lifting. That is FastAPI fast: Starlette's dispatcher for I/O concurrency, pydantic-core's scanner for Rust-speed validation, type hints for developer velocity, and the rule that anything heavy goes to the workshop so the radios never go silent.
