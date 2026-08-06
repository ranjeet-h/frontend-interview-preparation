# FastAPI File Uploads

## Detailed explanation

FastAPI handles uploads with `UploadFile`, streaming file objects, and multipart form parsing. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

UploadFile receives files without loading everything as plain JSON.

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

#### How does FastAPI handle file uploads?
- **The Engine Mechanism (Why it behaves this way):** FastAPI uses `UploadFile` to handle file uploads via multipart form data. `UploadFile` wraps a SpooledTemporaryFile that stores small files in memory and spills to disk for larger files. It provides async methods: `read()`, `write()`, `seek()`, `close()`. The file is accessible via `file.file` (the underlying Python file object). FastAPI parses the multipart form, extracts the file, and passes it as an UploadFile parameter. You can access metadata: `file.filename`, `file.content_type`, `file.size` (after reading).
- **The Unforgettable Mental Model:** The **Package Receiving Dock**. Packages (files) arrive at the dock. Small packages stay on the counter (memory). Large packages go to the warehouse (disk). The dock manager (UploadFile) tracks each package's label (filename), type (content_type), and size.
- **The Trap:** Reading the entire file into memory with `file.read()` for large files. This causes memory exhaustion. Stream the file or check size before reading.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI handles file uploads with UploadFile, which wraps a SpooledTemporaryFile — small files in memory, large files on disk. I access metadata like filename and content_type, and I stream large files instead of reading them entirely into memory to prevent memory exhaustion."

#### How do you validate uploaded files?
- **The Engine Mechanism (Why it behaves this way):** Validate file type via `file.content_type` (check against allowed MIME types), file size via reading chunks or checking Content-Length header, and file content via magic number detection (python-magic library) or reading the first bytes. For image files, you can use Pillow to verify the file is a valid image. Validation happens in the endpoint or a dependency — Pydantic doesn't validate UploadFile directly. Reject invalid files with `HTTPException(status_code=400, detail="Invalid file type")`.
- **The Unforgettable Mental Model:** The **Security Scanner**. The scanner checks: is this the right type of package (MIME type)? Is it within size limits? Does the contents match the label (magic numbers)? If any check fails, the package is rejected.
- **The Trap:** Trusting the client-provided content_type. Clients can spoof MIME types. Always verify with magic number detection or file content analysis.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate files by checking content_type against allowed MIME types, enforcing size limits, and verifying content with magic number detection. I don't trust the client-provided content_type — it can be spoofed. Invalid files are rejected with 400 errors."

#### How do you handle multiple file uploads?
- **The Engine Mechanism (Why it behaves this way):** Use `list[UploadFile]` as the parameter type: `def upload(files: list[UploadFile])`. FastAPI parses multiple files from the multipart form and passes them as a list. You can also combine files with form fields: `def upload(files: list[UploadFile] = File(...), description: str = Form(...))`. Process each file in a loop, validating and storing them individually. Be careful with memory — processing many large files simultaneously can cause memory spikes.
- **The Unforgettable Mental Model:** The **Conveyor Belt**. Multiple packages arrive on a belt. Each one is inspected, processed, and stored individually. The belt keeps moving — you don't stop to process all at once.
- **The Trap:** Processing all files simultaneously in memory. For many large files, process them one at a time or in small batches to avoid memory spikes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use list[UploadFile] for multiple file uploads. I process files one at a time or in small batches to avoid memory spikes. Each file is validated and stored individually. I combine with Form() for additional metadata like descriptions."

#### How do you save uploaded files?
- **The Engine Mechanism (Why it behaves this way):** Read the file in chunks and write to disk or cloud storage: `async def save_file(file: UploadFile, destination: Path): with open(destination, "wb") as f: while content := await file.read(1024 * 1024): f.write(content)`. For cloud storage (S3, GCS), use the SDK's streaming upload methods. Generate unique filenames (UUID, timestamp) to prevent collisions. Store the file path or URL in the database for later retrieval. Clean up temporary files if processing fails.
- **The Unforgettable Mental Model:** The **Filing Cabinet**. Each file gets a unique label (UUID filename), is placed in the right drawer (destination path), and the cabinet index (database) records where it is for future retrieval.
- **The Trap:** Using the client-provided filename directly. This can cause path traversal attacks (`../../../etc/passwd`) or filename collisions. Always sanitize and generate unique filenames.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I save files by reading them in chunks and writing to disk or cloud storage. I generate unique filenames with UUID to prevent collisions and path traversal. I store the file path in the database and clean up temp files on failure. For production, I use cloud storage like S3."

#### How do you test file upload endpoints?
- **The Engine Mechanism (Why it behaves this way):** Use TestClient with multipart form data: `from fastapi.testclient import TestClient; client = TestClient(app); with open("test.pdf", "rb") as f: response = client.post("/upload", files={"file": ("test.pdf", f, "application/pdf")})`. Assert on status code, response body, and verify the file was saved correctly. For testing without real files, use `io.BytesIO(b"file content")` as an in-memory file. Test valid files, invalid types, oversized files, and empty files.
- **The Unforgettable Mental Model:** The **Mock Shipping Department**. Instead of sending real packages, you send test packages with known contents and verify the receiving process handles them correctly.
- **The Trap:** Testing only with valid files. Test edge cases: empty files, oversized files, wrong types, and malformed multipart requests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test file uploads with TestClient using multipart form data. I use io.BytesIO for in-memory test files and real files for integration tests. I test valid uploads, invalid types, oversized files, and empty files. I verify the file was saved correctly and the response is accurate."

#### How do file uploads affect production reliability?
- **The Engine Mechanism (Why it behaves this way):** File uploads impact production through: (1) **Memory** — large files can cause OOM if read entirely into memory, (2) **Disk space** — uploaded files consume storage; implement cleanup policies, (3) **Request timeout** — large uploads take time; configure appropriate timeouts, (4) **Security** — malicious files (executables, scripts) can be uploaded; validate content type and scan files, (5) **Rate limiting** — unlimited uploads can fill storage; implement per-user quotas. Use cloud storage (S3) for scalable, reliable file storage instead of local disk.
- **The Unforgettable Mental Model:** The **Warehouse Management**. A warehouse needs: weight limits (memory), space management (disk), delivery time windows (timeouts), security screening (file scanning), and capacity limits (rate limiting). Without management, the warehouse overflows.
- **The Trap:** Storing uploaded files on the application server's local disk. This doesn't scale across multiple server instances and risks data loss on server restarts. Use cloud storage.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: File uploads affect memory, disk space, timeouts, security, and rate limiting. I stream files to prevent memory issues, use cloud storage for scalability, validate file content for security, and implement per-user quotas. I never store files on the local application server disk."

## 8. Active recall test

1. **What is UploadFile in FastAPI?**
   - **Explanation:** A wrapper around SpooledTemporaryFile that handles file uploads via multipart form data. Small files stay in memory; large files spill to disk. Provides async read/write/seek methods.

2. **How do you validate uploaded file types?**
   - **Explanation:** Check content_type against allowed MIME types, verify with magic number detection (python-magic), and don't trust the client-provided content_type which can be spoofed.

3. **How do you handle multiple file uploads?**
   - **Explanation:** Use `list[UploadFile]` as the parameter type. Process files one at a time or in small batches to avoid memory spikes.

4. **Why shouldn't you use client-provided filenames?**
   - **Explanation:** They can cause path traversal attacks (../../../etc/passwd) or filename collisions. Always sanitize and generate unique filenames with UUID.

5. **How do you test file upload endpoints?**
   - **Explanation:** Use TestClient with multipart form data. Use io.BytesIO for in-memory test files. Test valid uploads, invalid types, oversized files, and empty files.

6. **Where should uploaded files be stored in production?**
   - **Explanation:** Cloud storage (S3, GCS) — not local application server disk. Cloud storage scales across instances and survives server restarts.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

FastAPI File Uploads should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain FastAPI File Uploads, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define FastAPI File Uploads.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
