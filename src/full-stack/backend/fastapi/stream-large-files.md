# Stream Large Files

## Detailed explanation

Streaming large files sends data in chunks to avoid memory spikes. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Stream chunks instead of loading whole files.

## 2. Problem it solves

It keeps FastAPI applications predictable by making contracts, shared logic, validation, or runtime behavior explicit instead of scattering framework code across handlers.

## 3. Core idea

- Use Python type hints as API contracts.
- Keep route handlers thin and delegate business logic to services.
- Use dependencies for shared request-time behavior.
- Return explicit response models and status codes.
- Test behavior through HTTP calls and dependency overrides.

## 4. Visual / analogy

```txt
Request -> dependency resolution -> validation -> endpoint -> service/database -> response model -> response
```

## 5. Minimal example

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str

@app.post("/items")
def create_item(item: Item):
    return {"data": item}
```

## 6. Real-world example

A production FastAPI service uses routers per domain, Pydantic schemas for input/output, dependencies for auth and DB sessions, exception handlers for consistent errors, and tests with dependency overrides.

## 7. Common interview questions

#### How do you stream large files in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Use `StreamingResponse` from FastAPI to send data in chunks instead of loading the entire file into memory. Return a generator or async generator that yields chunks: `async def file_generator(): with open("large.mp4", "rb") as f: while chunk := f.read(1024 * 1024): yield chunk; return StreamingResponse(file_generator(), media_type="video/mp4")`. The server sends each chunk as it's produced, keeping memory usage constant regardless of file size. The client receives a continuous stream.
- **The Unforgettable Mental Model:** The **Water Pipe**. Instead of filling a bucket (memory) with the entire lake (file) and then pouring it, you connect a pipe (streaming) and let water flow continuously. The pipe size (chunk size) determines flow rate, not lake size.
- **The Trap:** Using `FileResponse` for dynamically generated content. `FileResponse` is for static files on disk. For generated or processed content, use `StreamingResponse` with a generator.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use StreamingResponse with a generator that yields chunks of data. This keeps memory usage constant regardless of file size. I read files in 1MB chunks and yield them. The server sends each chunk as it's produced, and the client receives a continuous stream."

#### What is the difference between FileResponse and StreamingResponse?
- **The Engine Mechanism (Why it behaves this way):** `FileResponse` serves static files from disk — it handles the file path, determines content type from extension, sets content length, and supports range requests (partial downloads). `StreamingResponse` sends data from a generator — it's for dynamically generated content, processed files, or files from non-disk sources (database blobs, external APIs). FileResponse is optimized for static files; StreamingResponse is flexible for any data source. Both stream data to avoid loading everything into memory.
- **The Unforgettable Mental Model:** The **Vending Machine vs. the Chef**. FileResponse is a vending machine — it dispenses pre-packaged items (static files). StreamingResponse is a chef — it prepares and serves food on demand (dynamic content).
- **The Trap:** Using StreamingResponse for static files when FileResponse would work. FileResponse handles content-type detection, content-length headers, and range requests automatically.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FileResponse is for static files on disk — it handles content-type, content-length, and range requests automatically. StreamingResponse is for dynamic content from generators — processed files, database blobs, or API responses. I use FileResponse for static files and StreamingResponse for everything else."

#### How do you set headers for streamed responses?
- **The Engine Mechanism (Why it behaves this way):** Pass headers to StreamingResponse: `StreamingResponse(generator, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=report.pdf"})`. Common headers: `Content-Disposition` (inline vs. attachment with filename), `Cache-Control` (caching behavior), `Content-Length` (if known in advance), `Accept-Ranges` (for partial downloads). Headers are sent before the first chunk, so they must be known before streaming begins.
- **The Unforgettable Mental Model:** The **Shipping Label**. Before the package (stream) leaves the warehouse, you attach a label (headers) telling the carrier how to handle it — deliver to door (attachment), keep in truck (inline), fragile (cache-control).
- **The Trap:** Trying to set headers after streaming begins. Headers are sent before the first chunk. Once streaming starts, headers can't be modified.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I set headers on StreamingResponse before streaming begins — Content-Disposition for download behavior, Cache-Control for caching, Content-Length if known. Headers are sent before the first chunk, so they must be determined upfront."

#### How do you handle partial downloads (range requests)?
- **The Engine Mechanism (Why it behaves this way):** `FileResponse` automatically handles HTTP Range requests for partial downloads (used by video players and download managers). It reads the `Range` header, serves the requested byte range, and returns 206 Partial Content. `StreamingResponse` does not handle range requests automatically — you must implement range parsing manually. For large media files, use FileResponse or a dedicated media server (nginx, CDN) that handles range requests efficiently.
- **The Unforgettable Mental Model:** The **Book Index Reader**. Instead of reading the entire book, the reader says "give me pages 50-75." FileResponse knows how to serve specific page ranges. StreamingResponse reads from page 1 onward.
- **The Trap:** Using StreamingResponse for video files without range support. Video players rely on range requests for seeking. Without range support, users can't skip ahead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FileResponse handles range requests automatically for partial downloads — essential for video players. StreamingResponse doesn't — you must implement range parsing manually. For media files, I use FileResponse or a CDN that handles range requests."

#### How do you stream data from a database?
- **The Engine Mechanism (Why it behaves this way):** Use server-side cursors or chunked queries to stream database results: `async def generate_rows(): async with session.stream(select(Model)) as result: async for row in result: yield json.dumps(row.to_dict()) + "\n"; return StreamingResponse(generate_rows(), media_type="application/json")`. This avoids loading all rows into memory. For PostgreSQL, use `stream()` from SQLAlchemy 2.0. For large exports, consider CSV or newline-delimited JSON format.
- **The Unforgettable Mental Model:** The **Assembly Line**. Instead of building all products and storing them in a warehouse (loading all rows), the assembly line (stream) produces and ships each product as it's made.
- **The Trap:** Using `session.execute(select(Model)).all()` for large datasets. This loads all rows into memory, causing OOM for large tables. Always use streaming for large exports.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I stream database results using server-side cursors — session.stream() in SQLAlchemy 2.0. This avoids loading all rows into memory. I yield each row as JSON or CSV. For large exports, I use newline-delimited JSON or CSV format for efficient streaming."

#### How does streaming affect production reliability?
- **The Engine Mechanism (Why it behaves this way):** Streaming improves reliability by: (1) **Constant memory** — memory usage doesn't grow with file size, (2) **Faster time-to-first-byte** — clients start receiving data immediately, (3) **Graceful degradation** — if the client disconnects, the generator stops (handle `asyncio.CancelledError`). However, streaming introduces challenges: (1) **Connection timeouts** — long streams may hit proxy timeouts, (2) **No retry** — if the stream fails mid-way, the client must restart, (3) **Monitoring** — streaming responses are harder to monitor than fixed-size responses.
- **The Unforgettable Mental Model:** The **Live Broadcast**. Streaming is like a live TV broadcast — viewers start watching immediately (fast TTFB), memory is constant (signal doesn't grow), but if the signal drops (disconnect), viewers must reconnect.
- **The Trap:** Not handling client disconnection. If the client disconnects mid-stream, the generator keeps running until it raises CancelledError. Handle this gracefully to free resources.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Streaming keeps memory constant and starts sending data immediately. But I handle client disconnection by catching CancelledError, configure appropriate timeouts for long streams, and monitor streaming endpoints separately. For very large files, I prefer CDN delivery over application streaming."

## 8. Active recall test

1. **How do you stream large files in FastAPI?**
   - **Explanation:** Use StreamingResponse with a generator that yields chunks. Read files in chunks (e.g., 1MB) and yield them. Memory stays constant regardless of file size.

2. **What's the difference between FileResponse and StreamingResponse?**
   - **Explanation:** FileResponse serves static files from disk with automatic content-type, content-length, and range support. StreamingResponse sends dynamic data from a generator for any data source.

3. **How do FileResponse and StreamingResponse handle range requests?**
   - **Explanation:** FileResponse handles range requests automatically (206 Partial Content). StreamingResponse does not — you must implement range parsing manually.

4. **How do you stream database results?**
   - **Explanation:** Use server-side cursors (session.stream() in SQLAlchemy 2.0). Yield each row as JSON or CSV. Avoid .all() which loads all rows into memory.

5. **What headers can you set on StreamingResponse?**
   - **Explanation:** Content-Disposition (download behavior), Cache-Control (caching), Content-Length (if known). Headers must be set before streaming begins — they can't be modified after.

6. **How do you handle client disconnection during streaming?**
   - **Explanation:** Catch asyncio.CancelledError in the generator. This fires when the client disconnects, allowing you to clean up resources gracefully.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Stream Large Files should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Stream Large Files, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Stream Large Files.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
