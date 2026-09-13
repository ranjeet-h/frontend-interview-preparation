# Streaming Large Files in FastAPI: `StreamingResponse`, Async Iterators, and Memory-Efficient Downloads

## 1. Why This Exists — The Problem First

Your FastAPI application is humming along in production until someone in finance clicks "Export Full Year Audit Log" or a mobile client requests a 1.5GB raw video recording. 

In a naive implementation, your endpoint queries all 2 million rows, converts them into a giant 600MB CSV string in RAM, or calls `f.read()` on the video file and returns a standard `Response(content=large_data)`. The moment five users trigger that download simultaneously, Python's heap spikes by over 3GB. The Linux kernel's Out-Of-Memory (OOM) killer immediately fires `SIGKILL` at your Uvicorn worker process. Every other user request currently handled by that worker drops dead with a `502 Bad Gateway`.

Even without an OOM crash, buffering the entire payload introduces catastrophic latency. The client sits staring at a spinner with a massive Time-To-First-Byte (TTFB) while the server builds the entire file in memory before transmitting the very first byte. If the user gives up and closes the browser tab after two seconds, your server continues burning CPU and memory generating hundreds of megabytes for a connection that no longer exists.

`StreamingResponse` exists to turn an $O(N)$ memory problem into an $O(1)$ memory pipeline. By streaming data in small, fixed-size chunks (e.g., 64KB) straight through Python async generators to the network socket, memory consumption stays flat whether the file is 50 kilobytes or 50 gigabytes.

## 2. The Analogy — Make It Obvious

Think of delivering water to your neighbor.

A standard buffered response is like filling a 500-gallon bathtub in your living room before delivery. You turn on the faucet, wait hours for the tub to fill completely, and only when the last drop is in do you haul the entire tub over to your neighbor. If five neighbors ask for water at once, your living room floor collapses under the weight of five bathtubs. If a neighbor walks away after one gallon, you still wasted the water and energy filling all 500 gallons.

`StreamingResponse` is a garden hose.

You connect one end to the municipal supply (your database, disk, or S3 bucket) and hand the other end to your neighbor. Water starts flowing through the 1-inch pipe immediately (near-instant TTFB). Your living room stays bone dry because you never hold 500 gallons at once—you only hold the tiny volume of water currently passing through the pipe at any given millisecond ($O(1)$ memory). If your neighbor lets go of the hose (client disconnect), you immediately turn off the spigot.

## 3. How It Actually Works — The Full Explanation

FastAPI is built on top of Starlette and the Asynchronous Server Gateway Interface (ASGI) specification. Understanding how `StreamingResponse` works requires looking at how ASGI communicates with the underlying HTTP server (such as Uvicorn).

**The ASGI Response Lifecycle**

In the ASGI standard, an HTTP response is delivered to the client across the network using two distinct message types sent over the ASGI `send` callable:

1. `http.response.start`: Sends the HTTP status code and response headers.
2. `http.response.body`: Sends chunks of raw bytes. This message carries a boolean flag named `more_body`.

When you return a standard `Response(content=data)`, Starlette calculates the exact `Content-Length`, sends `http.response.start`, and then sends a single `http.response.body` message containing the entire payload with `more_body=False`.

When you return a `StreamingResponse(content=generator)`, Starlette immediately sends `http.response.start`. Then, it enters an internal loop over your generator. Every time your generator yields a chunk of bytes, Starlette dispatches an `http.response.body` message with `more_body=True`. The HTTP server flushes that chunk directly to the client's TCP socket. When the generator is exhausted and returns, Starlette sends a final `http.response.body` message containing an empty byte string `b""` and `more_body=False`, signaling the end of the HTTP response.

**HTTP Chunked Transfer Encoding vs. Content-Length**

When streaming data over HTTP/1.1, the server faces a dilemma: how does the client know when the download is finished if the server doesn't know the total file size in advance?

- **Chunked Transfer Encoding (`Transfer-Encoding: chunked`):** When generating dynamic content (like database query streams or LLM tokens), the total byte size is unknown upfront. The server omits the `Content-Length` header and sets `Transfer-Encoding: chunked`. In this mode, the HTTP protocol prefixes each transmitted chunk with its hex-encoded length and a CRLF (`\r\n`), followed by the raw data. A zero-length chunk (`0\r\n\r\n`) tells the client the stream is complete.
- **Fixed-Size Streaming (`Content-Length` provided):** If you are streaming a known static file from disk or an object store where the total size is known, you can pass an explicit `Content-Length` header to `StreamingResponse`. In this case, chunked encoding is bypassed, the client receives an exact byte target (enabling browser download progress bars), and the server still streams in $O(1)$ memory chunks.

**Sync vs. Async Generators Under the Hood**

FastAPI accepts both regular synchronous generators (`def` with `yield`) and asynchronous generators (`async def` with `yield`):

- **Asynchronous Generators (`async def`):** This is the ideal pattern. The generator awaits async I/O (such as `await aiofiles_file.read()`, `await session.stream()`, or `await httpx_client.aiter_bytes()`). It runs directly on the main event loop, yielding control to other concurrent requests while waiting for I/O.
- **Synchronous Generators (`def`):** If you pass a blocking sync generator (e.g., using standard `open()` or `time.sleep()`), Starlette wraps the generator iteration in AnyIO's threadpool (`anyio.to_thread.run_sync`). While this prevents the main event loop from freezing, running many concurrent sync streams can quickly exhaust the threadpool. Always prefer `async def` generators in production.

**Client Disconnection and Cancellation**

When a client closes their browser, cancels a download, or drops connection, the TCP socket breaks. Uvicorn detects the closed socket and cancels the running ASGI task. 

In Python's `asyncio`, task cancellation raises an `asyncio.CancelledError` inside the currently suspended `await` expression of your generator. If your streaming generator wraps its work in a `try...finally` block or an `async with` context manager, Python guarantees that cleanup code (closing database cursors, closing file descriptors, or releasing HTTP connection pool slots) runs immediately. You can also proactively inspect `await request.is_disconnected()` to abort expensive data generation loops early.

## 4. Real Code — See It Working

Here are the four standard production patterns for streaming in FastAPI.

**Pattern 1: Streaming a Dynamic Database Export as a CSV**

This streams millions of database rows directly to the client without ever loading more than one batch into memory.

```python
import csv
import io
from collections.abc import AsyncGenerator
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from myapp.database import get_db
from myapp.models import Transaction

router = APIRouter()

async def transaction_csv_generator(
    db: AsyncSession,
    request: Request,
    batch_size: int = 1000
) -> AsyncGenerator[str, None]:
    # String buffer to allow standard csv.writer to format CSV rows in memory
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    # Yield the CSV header row first
    writer.writerow(["Transaction ID", "User ID", "Amount", "Timestamp", "Status"])
    yield buffer.getvalue()
    buffer.seek(0)
    buffer.truncate(0)

    # Stream query results in chunks from PostgreSQL via server-side cursor
    query = select(Transaction).order_by(Transaction.id)
    stream_result = await db.stream(query)

    async for row in stream_result.yield_per(batch_size):
        # Stop processing immediately if the client closed the tab
        if await request.is_disconnected():
            break

        tx = row[0]
        writer.writerow([tx.id, tx.user_id, str(tx.amount), tx.created_at.isoformat(), tx.status])
        yield buffer.getvalue()
        
        # Reset the reusable single-line buffer to keep memory O(1)
        buffer.seek(0)
        buffer.truncate(0)

@router.get("/export/transactions.csv")
async def export_transactions(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    return StreamingResponse(
        transaction_csv_generator(db, request),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=transactions_export.csv",
            "Cache-Control": "no-cache"
        }
    )
```

**Pattern 2: Streaming Large Files from Disk with `aiofiles`**

This reads a large file in 64KB binary chunks asynchronously, including the `Content-Length` header so the browser shows a real progress bar.

```python
import os
from collections.abc import AsyncGenerator
import aiofiles
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter()
CHUNK_SIZE = 64 * 1024  # 64 KB per chunk

async def read_file_chunks(path: str) -> AsyncGenerator[bytes, None]:
    async with aiofiles.open(path, mode="rb") as file_handle:
        while True:
            chunk = await file_handle.read(CHUNK_SIZE)
            if not chunk:
                break
            yield chunk

@router.get("/downloads/{filename}")
async def download_large_archive(filename: str):
    file_path = os.path.join("/var/storage/archives", filename)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    file_size = os.path.getsize(file_path)

    return StreamingResponse(
        read_file_chunks(file_path),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Length": str(file_size),  # Known size: enables browser progress bar
        }
    )
```

**Pattern 3: Streaming LLM Tokens via Server-Sent Events (SSE)**

This pipes real-time AI token generation to frontend web applications formatted as standard SSE events.

```python
import asyncio
import json
from collections.abc import AsyncGenerator
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter()

async def mock_llm_stream(prompt: str) -> AsyncGenerator[str, None]:
    # Simulating token-by-token generation from an external model API
    tokens = ["Deep", " architecture", " requires", " streaming", " for", " scale."]
    for token in tokens:
        await asyncio.sleep(0.1)  # Simulate network inference delay
        payload = json.dumps({"token": token})
        # Server-Sent Events format requires 'data: <content>\n\n'
        yield f"data: {payload}\n\n"
    yield "data: [DONE]\n\n"

@router.post("/chat/completions/stream")
async def chat_stream(request: Request):
    return StreamingResponse(
        mock_llm_stream("Explain streaming in FastAPI"),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disables proxy buffering in Nginx
        }
    )
```

**Pattern 4: Proxying S3 / Cloud Storage Streams with Safe Cleanup**

Piping binary streams from remote object storage without saving temporary files to disk.

```python
from collections.abc import AsyncGenerator
import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter()

async def stream_upstream_s3(presigned_s3_url: str) -> AsyncGenerator[bytes, None]:
    # Stream the remote binary data using an asynchronous HTTP client
    async with httpx.AsyncClient() as client:
        async with client.stream("GET", presigned_s3_url) as upstream_response:
            async for chunk in upstream_response.aiter_bytes(chunk_size=128 * 1024):
                yield chunk

@router.get("/media/proxy/{asset_id}")
async def proxy_media_asset(asset_id: str):
    presigned_url = f"https://my-internal-bucket.s3.amazonaws.com/{asset_id}.raw"
    return StreamingResponse(
        stream_upstream_s3(presigned_url),
        media_type="video/mp4"
    )
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does `StreamingResponse` work under the hood in FastAPI and ASGI?**

`StreamingResponse` is a Starlette response class that consumes an iterable or async generator. When FastAPI executes the route handler, it returns the `StreamingResponse` instance to the ASGI server (Uvicorn). The server immediately calls ASGI `send` with an `http.response.start` event containing HTTP status code and response headers. 

Next, Starlette enters an async loop over the generator provided in `content`. For every item yielded by the generator, Starlette calls `send` with an `http.response.body` message containing the raw byte chunk and `more_body=True`. The ASGI server flushes this chunk straight to the underlying TCP socket. When the generator terminates, Starlette sends a final `http.response.body` message with `more_body=False` to close the HTTP response stream.

**Q: What is the difference between `FileResponse` and `StreamingResponse`, and when should you choose each?**

`FileResponse` is specifically designed for static files existing on the server's local filesystem. Under the hood, it inspects the file, sets the `Content-Type` automatically from the file extension, determines `Content-Length`, sets the `Last-Modified` and `ETag` headers, and critically, supports HTTP `Range` requests (returning `206 Partial Content`). This makes `FileResponse` ideal for serving videos, audio, or resumable static downloads.

`StreamingResponse` is a generic wrapper for any sync or async generator. It is designed for dynamic content (database query exports, on-the-fly zip archives, LLM token streams) or data sourced from network streams (S3 proxies, external APIs). It does not automatically handle file metadata or HTTP byte-range slicing. 

Rule: Use `FileResponse` for static local files that need range support and caching; use `StreamingResponse` for dynamic generators, custom chunking, or non-disk streams.

**Q: How does HTTP Chunked Transfer Encoding work, and why does streaming sometimes prevent clients from seeing a download progress bar?**

Under HTTP/1.1, if a server does not provide a `Content-Length` header, it must use `Transfer-Encoding: chunked`. The server sends data in a series of self-delimiting chunks, where each chunk begins with its byte count in hexadecimal, followed by CRLF, the chunk body, and CRLF. The stream terminates with a 0-byte chunk.

Because `Content-Length` is omitted, the client browser receives data without knowing the total expected payload size. Consequently, browser download managers and frontend progress indicators cannot calculate a completion percentage—they can only display the total amount downloaded so far. To give users a progress bar during a stream, you must determine the total size beforehand (such as reading the file size or database record count) and explicitly pass the `Content-Length` header to `StreamingResponse`.

**Q: What happens if a client disconnects halfway through a 1GB file download, and how do you prevent resource leaks?**

When a client closes a connection, the TCP socket closes. The ASGI server catches this socket error and cancels the active `asyncio` task executing the streaming generator.

In Python, cancelling an async task raises `asyncio.CancelledError` at the exact point where the generator is currently awaiting I/O. If your generator uses standard Python context managers (`async with`) or `try...finally` blocks around database sessions, file handles, or network connections, the cleanup code executes cleanly during task unwinding. If you fail to use `try...finally` and rely on code written after the iteration loop, that trailing code will never execute when a client disconnects. Additionally, long-running CPU loops should periodically check `await request.is_disconnected()` to terminate generation early.

**Q: How do you stream dynamic data from a database without loading all records into Python memory?**

In SQLAlchemy 2.0 with async drivers (e.g., `asyncpg`), you must avoid `.all()`, `.scalars().all()`, or loading relationships that trigger eager memory fetches. Instead, execute your query using `await session.stream(query)`. 

This creates a database server-side cursor. You then call `.yield_per(batch_size)` on the stream result. This instructs the database driver to fetch only `batch_size` rows over the network per roundtrip. Inside your async generator, you loop over these rows with `async for row in stream_result.yield_per(1000):`, format each row into a string or bytes, yield it to `StreamingResponse`, and immediately discard the row from memory.

**Q: Why should you generally avoid streaming large static files through FastAPI in high-traffic production environments?**

While FastAPI handles streaming efficiently, streaming gigabytes of static media through Python application workers consumes worker concurrency and keeps Python processes tied to slow client network connections. 

In high-traffic production architectures, static assets and large downloads should be offloaded entirely from the application server:
1. **Cloud Object Storage Presigned URLs:** Generate a short-lived Amazon S3 or Google Cloud Storage presigned URL and redirect the client (`307 Temporary Redirect`). The client downloads directly from cloud storage.
2. **Reverse Proxy Offloading / X-Accel-Redirect:** Pass the request to Nginx or Cloudflare. Your FastAPI app handles authentication and then returns an empty response with an `X-Accel-Redirect` (or `X-Sendfile`) header pointing to the internal file path. Nginx handles the socket streaming at the C level, freeing the FastAPI worker immediately.

## 6. The Traps — What Goes Wrong

**Trap 1: Custom Middleware Buffering the Response Body and Killing Streaming**

The most insidious production bug with streaming occurs when someone adds custom logging, compression, or response-timing middleware.

```python
# BROKEN: This middleware silently destroys streaming across the entire app
@app.middleware("http")
async def log_response_body_middleware(request: Request, call_next):
    response = await call_next(request)
    
    # Consuming response.body_iterator reads ALL chunks into memory at once!
    body = [chunk async for chunk in response.body_iterator]
    print(f"Response size: {sum(len(b) for b in body)}")
    
    # Rebuilding the response turns it into a standard buffered Response
    return Response(
        content=b"".join(body),
        status_code=response.status_code,
        headers=dict(response.headers)
    )
```

Why it fails: Consuming `response.body_iterator` forces Python to evaluate the entire generator immediately in RAM. The streaming benefits vanish, memory spikes to $O(N)$, and the client receives nothing until the entire stream is buffered.

The Fix: Always check if the response is a `StreamingResponse` before attempting to read bodies in middleware, and bypass body logging for streaming endpoints.

```python
# CORRECT: Pass streaming responses through untouched
from starlette.responses import StreamingResponse

@app.middleware("http")
async def safe_middleware(request: Request, call_next):
    response = await call_next(request)
    if isinstance(response, StreamingResponse):
        return response  # Do not touch body_iterator
    # Process regular responses...
    return response
```

**Trap 2: Synchronous File or Network I/O Inside an `async def` Generator**

Using synchronous blocking calls inside an async generator freezes the single-threaded event loop for all concurrent users.

```python
# BROKEN: open() and f.read() block the entire FastAPI event loop
async def blocking_generator():
    with open("massive_file.bin", "rb") as f:
        while chunk := f.read(1024 * 1024):  # Synchronous disk read freezes server
            yield chunk
```

Why it fails: Even though the function is defined with `async def`, `f.read()` is a blocking C call. If the disk is slow or under high load, the event loop cannot process any other HTTP requests while reading the chunk.

The Fix: Use `aiofiles` for async disk I/O, or use a plain sync generator `def blocking_generator()` which Starlette will safely offload to a background threadpool.

**Trap 3: Attempting to Modify Headers or Status Codes Mid-Stream**

Developers often attempt to catch errors during streaming and change the HTTP status code to 500.

```python
# BROKEN: HTTP headers are already committed before this exception is caught
async def faulty_generator():
    yield b"Header line\n"
    raise ValueError("Database connection died mid-query!")

# Client receives: HTTP 200 OK, followed by partial data, then a broken socket connection!
```

Why it fails: In HTTP streaming, the `http.response.start` message containing the `200 OK` status and headers is transmitted before the first chunk is sent. Once the first byte is on the wire, the status code is permanently committed. You cannot change a 200 to a 500 halfway through.

The Fix: Perform all validations, authorization checks, and initial database connections *before* returning `StreamingResponse`. If an error occurs during streaming, log it and terminate the generator so the client's parser detects an unexpected EOF.

**Trap 4: Missing `try...finally` Causing Database Connection Leaks on Disconnect**

If a client disconnects during a streaming database export, a naive generator will leak the database session.

```python
# BROKEN: If client disconnects, db.close() is never reached
async def leak_generator(db: AsyncSession):
    stream = await db.stream(select(Transaction))
    async for row in stream:
        yield str(row)
    await db.close()  # NEVER CALLED if client disconnects mid-stream!
```

Why it fails: When the client disconnects, an `asyncio.CancelledError` is raised at `yield str(row)`. Execution immediately exits the generator, skipping any statements following the loop.

The Fix: Always use `try...finally` or context managers:

```python
# CORRECT: Guaranteed cleanup on cancellation
async def safe_generator(db: AsyncSession):
    try:
        stream = await db.stream(select(Transaction))
        async for row in stream:
            yield str(row)
    finally:
        await db.close()  # Guaranteed to run even on CancelledError
```

**Trap 5: Using `StreamingResponse` for Video and Expecting Seeking to Work**

When you stream a video file using `StreamingResponse`, users report that scrubbing or skipping forward on the video player timeline fails completely.

Why it fails: Video players do not download video files sequentially from byte 0 to the end. When a user skips to minute 42, the browser sends an HTTP request with a `Range: bytes=44040192-` header. `StreamingResponse` ignores the `Range` header and streams the file from byte 0.

The Fix: Use `FileResponse` for video files stored on disk. `FileResponse` parses the `Range` header, seeks to the requested byte offset, calculates the partial content length, and responds with `HTTP 206 Partial Content`.

## 7. Compare With Related Concepts

| Feature / Concept | `StreamingResponse` | `FileResponse` | Standard `Response` / `JSONResponse` | Presigned URL / CDN Offload |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Data Source** | Async/sync generators, dynamic DB queries, live API/LLM streams | Static files located on local disk | In-memory Python objects, strings, dictionaries | Cloud storage (S3, GCS, Cloudflare R2) |
| **Memory Footprint (RAM)** | $O(1)$ constant (chunk size buffer) | $O(1)$ constant (chunked disk read) | $O(N)$ linear (entire response in RAM) | $0$ Python RAM (completely bypassed) |
| **HTTP Range Support (206)** | No (requires manual byte slicing) | Yes (built-in automatic range support) | No | Yes (handled by cloud storage/CDN) |
| **Content-Length Header** | Optional / omitted (`Transfer-Encoding: chunked`) | Automatically calculated from file size | Automatically calculated | Handled by storage provider |
| **Time-To-First-Byte (TTFB)** | Near-instant (sends as chunks arrive) | Near-instant | High (waits for full generation) | Instant redirect (`307`) |
| **Worker Concurrency Impact** | Ties up an async task for stream duration | Minimal | Brief (releases worker immediately) | Zero (worker freed after redirect) |

**When to choose what:**
- Choose **`StreamingResponse`** when data is dynamically generated on the fly (CSV exports, LLM token streams via SSE) or piped from an external network source.
- Choose **`FileResponse`** when serving static files directly from local container disk, especially media files requiring video seeking and range support.
- Choose **Standard `Response` / `JSONResponse`** for standard API endpoints where payloads are small (under a few megabytes).
- Choose **Presigned URLs / CDN Offloading** for high-volume, multi-megabyte file downloads in production systems to keep Python workers free for business logic.

## 8. 🧠 The Memory Hook

Never fill the bathtub in your server's RAM just to pour it down the network pipe. Connect a garden hose with `StreamingResponse` and let fixed-size droplets flow from source to socket with $O(1)$ memory.
