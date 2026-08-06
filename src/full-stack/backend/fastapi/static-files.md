# Serve Static Files

## Detailed explanation

FastAPI can mount static file directories using Starlette StaticFiles. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

StaticFiles serves assets outside API handlers.

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

#### How do you serve static files in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Use Starlette's `StaticFiles` to serve files from a directory: `from fastapi.staticfiles import StaticFiles; app.mount("/static", StaticFiles(directory="static"), name="static")`. `mount()` registers a sub-application at the given path prefix. All requests to `/static/...` are handled by StaticFiles, which reads files from the directory, sets content-type based on file extension, and returns the file content. StaticFiles handles caching headers, directory listing (disabled by default), and 404 for missing files.
- **The Unforgettable Mental Model:** The **Library Reading Room**. Instead of the librarian (FastAPI endpoints) fetching each book manually, there's a self-service reading room (StaticFiles) where visitors browse shelves (directory) directly.
- **The Trap:** Mounting StaticFiles at the root path (`app.mount("/", ...)`). This shadows all API routes — every request is treated as a static file request. Always mount at a specific prefix like `/static`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I serve static files with StaticFiles mounted at a prefix: app.mount('/static', StaticFiles(directory='static')). This handles content-type detection, caching headers, and 404s automatically. I never mount at root — it shadows API routes."

#### What does mount() do in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** `mount()` registers a sub-application (ASGI app) at a path prefix. Requests matching the prefix are delegated to the sub-application. The sub-application receives the remaining path after the prefix. For example, `app.mount("/static", StaticFiles(directory="static"))` delegates `/static/css/style.css` to StaticFiles with path `/css/style.css`. Mounting is different from `include_router` — mount delegates to a separate ASGI app, while include_router merges routes into the same app.
- **The Unforgettable Mental Model:** The **Franchise Branch**. The main store (app) opens a branch (mounted app) at a specific location (prefix). Customers going to that location are served by the branch, not the main store.
- **The Trap:** Confusing mount() with include_router(). Mount delegates to a separate ASGI app; include_router merges routes. StaticFiles must be mounted, not included as a router.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: mount() registers a sub-application at a path prefix. Requests matching the prefix are delegated to the sub-application. StaticFiles is mounted, not included as a router. Mount delegates to a separate ASGI app; include_router merges routes into the same app."

#### How do you configure caching for static files?
- **The Engine Mechanism (Why it behaves this way):** StaticFiles sets caching headers automatically based on file modification time. You can customize caching with the `headers` parameter: `StaticFiles(directory="static", headers={"Cache-Control": "public, max-age=3600"})`. For production, use a CDN or reverse proxy (nginx) for static file caching — they're optimized for this. Set long cache times for versioned files (with hash in filename) and short times for files that change frequently.
- **The Unforgettable Mental Model:** The **Expiration Date**. Each static file gets a "best before" date (Cache-Control max-age). Versioned files (with hash) have a long shelf life — they never change. Unversioned files expire quickly — they might be updated.
- **The Trap:** Setting long cache times for unversioned files. If `style.css` is cached for a year and you update it, clients won't see the changes until the cache expires. Use versioned filenames for long caching.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I configure caching with headers on StaticFiles. For production, I use a CDN or nginx for static file caching. Versioned files (with hash in filename) get long cache times; unversioned files get short times. This balances performance with freshness."

#### Should you serve static files from FastAPI in production?
- **The Engine Mechanism (Why it behaves this way):** For development, StaticFiles in FastAPI is convenient. For production, it's better to serve static files from a CDN (CloudFront, Cloudflare) or reverse proxy (nginx). Reasons: (1) **Performance** — CDNs are optimized for static file delivery with edge caching, (2) **Offloading** — reduces load on the Python application, (3) **Features** — CDNs provide compression, HTTP/2, Brotli, and global distribution, (4) **Cost** — CDN bandwidth is cheaper than application server bandwidth. Use FastAPI's StaticFiles only for development or internal tools.
- **The Unforgettable Mental Model:** The **Specialist vs. Generalist**. FastAPI is a generalist — it handles API logic well. A CDN is a specialist — it's optimized for one thing: delivering static files fast. Use the specialist for the specialist job.
- **The Trap:** Serving large static files from FastAPI in production. This consumes application server resources (memory, CPU, connections) that should be used for API requests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For development, I use StaticFiles in FastAPI. For production, I serve static files from a CDN or nginx — they're optimized for static delivery, offload the application server, and provide edge caching, compression, and global distribution. FastAPI should focus on API logic."

#### How do you serve a single-page application (SPA) with FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Mount StaticFiles for the SPA's build output and configure a catch-all route to serve `index.html` for non-file paths: `app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="frontend")`. The `html=True` parameter tells StaticFiles to serve `index.html` for directory requests. For SPA routing (client-side routes like `/dashboard`), you need a fallback that serves `index.html` for any path that isn't a static file. This can be done with a catch-all route after the static mount.
- **The Unforgettable Mental Model:** The **Restaurant Host**. The host (StaticFiles) seats guests at tables (static files). If a guest asks for a table that doesn't exist (client-side route), the host says "sit at the main table" (index.html) and the restaurant's internal seating (client-side router) handles the rest.
- **The Trap:** Not handling SPA fallback routes. Without a catch-all for index.html, refreshing `/dashboard` returns 404 because the server doesn't have a `/dashboard` route.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I mount StaticFiles with html=True for the SPA build output. For client-side routes, I add a catch-all that serves index.html for any path that isn't a static file. This ensures SPA routing works on page refresh."

#### How do you test static file serving?
- **The Engine Mechanism (Why it behaves this way):** Use TestClient to request static file paths: `response = client.get("/static/test.txt"); assert response.status_code == 200; assert response.text == "expected content"`. Test existing files, missing files (404), and content-type headers. Create test files in a temporary directory for testing. For SPA fallback testing, request a non-existent path and verify index.html is returned.
- **The Unforgettable Mental Model:** The **Store Inspector**. The inspector (test) checks: are the products on the shelf (files exist)? Are they labeled correctly (content-type)? What happens when a product is missing (404)?
- **The Trap:** Testing static files without creating them first. Tests need actual files in the static directory. Use temporary directories with test files.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test static files with TestClient by requesting file paths and asserting on status code, content, and headers. I use temporary directories with test files. I test existing files, missing files (404), and SPA fallback routes."

## 8. Active recall test

1. **How do you serve static files in FastAPI?**
   - **Explanation:** Use `app.mount("/static", StaticFiles(directory="static"))`. This handles content-type detection, caching headers, and 404s automatically.

2. **What does mount() do?**
   - **Explanation:** Registers a sub-application (ASGI app) at a path prefix. Requests matching the prefix are delegated to the sub-application with the remaining path.

3. **Should you serve static files from FastAPI in production?**
   - **Explanation:** No — use a CDN or nginx. They're optimized for static delivery, offload the application server, and provide edge caching and compression.

4. **How do you serve an SPA with FastAPI?**
   - **Explanation:** Mount StaticFiles with html=True for the build output. Add a catch-all route to serve index.html for client-side routes that aren't static files.

5. **How do you configure caching for static files?**
   - **Explanation:** Use headers parameter on StaticFiles. Versioned files get long cache times; unversioned files get short times. For production, use CDN caching.

6. **Why shouldn't you mount StaticFiles at root?**
   - **Explanation:** It shadows all API routes — every request is treated as a static file request. Always mount at a specific prefix like /static.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Serve Static Files should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Serve Static Files, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Serve Static Files.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
