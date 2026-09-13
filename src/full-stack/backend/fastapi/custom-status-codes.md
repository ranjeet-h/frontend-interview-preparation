# Custom Status Codes in FastAPI: `status_code`, `Response` Parameter, and Dynamic HTTP Statuses

## 1. Why This Exists — The Problem First

Imagine an e-commerce checkout endpoint. A customer submits their credit card, but the transaction fails due to insufficient funds. The backend catches the exception, packages a payload like `{"success": false, "error": "Insufficient funds"}`, and sends it back with the default HTTP `200 OK` status.

In production, this causes an immediate chain reaction of subtle bugs:

1. **Frontend error handlers fail to trigger:** Client-side HTTP libraries like Axios, Fetch, or React Query rely on non-2xx status codes (4xx and 5xx) to automatically reject promises and route responses into `catch` blocks or error states. With a `200 OK`, the frontend treats the failed transaction as a successful checkout and transitions the user to an "Order Confirmed" screen.
2. **Caches store broken data:** CDNs (Cloudflare, Fastly), reverse proxies (Nginx), and browser caches interpret `200 OK` as valid, cacheable content. An error payload or an unauthenticated response stamped with `200 OK` gets cached at the edge and served to subsequent users.
3. **Observability and alerting go blind:** Sentry, Datadog, and AWS CloudWatch track error rates by monitoring 4xx and 5xx HTTP response distributions. If every route returns `200 OK`, your HTTP error rate dashboard sits at a pristine 0.0% while thousands of payment transactions crash silently.
4. **REST contracts break:** Automated API consumers cannot tell whether a `POST` created a new record (`201 Created`), updated an existing one (`200 OK`), or queued an asynchronous task for background processing (`202 Accepted`) without parsing arbitrary JSON body schemas.

FastAPI exists to make HTTP status codes explicit, type-safe, and self-documenting. It gives you static declarations on route decorators for clear OpenAPI schemas, dynamic runtime overrides through dependency-injected `Response` objects, low-level `JSONResponse` objects, and short-circuiting `HTTPException` primitives.

---

## 2. The Analogy — Make It Obvious

Think of an international airport terminal and its flight dispatch board:

```txt
┌────────────────────────────────────────────────────────────────────────┐
│                        AIRPORT STATUS DISPATCH                         │
├──────────────┬─────────────────────────────────────────────────────────┤
│ 2xx Green    │ 200 OK: Boarding pass printed. Here is your seat.       │
│ Clear Gate   │ 201 Created: New passenger profile issued & registered. │
│              │ 202 Accepted: Luggage tagged; queued for cargo hold.    │
│              │ 204 No Content: Baggage tag shredded. Gate cleared.     │
├──────────────┼─────────────────────────────────────────────────────────┤
│ 3xx Yellow   │ 304 Not Modified: Gate board unchanged. Use old slip.   │
├──────────────┼─────────────────────────────────────────────────────────┤
│ 4xx Red      │ 400 Bad Request: Ticket barcode is torn and unreadable. │
│ Passenger    │ 401 Unauthorized: No passport presented (who are you?). │
│ Issue        │ 403 Forbidden: Valid ticket, but trying to enter VIP.   │
│              │ 404 Not Found: Flight number does not exist.            │
│              │ 409 Conflict: Seat 14B was just booked by another user. │
│              │ 422 Unprocessable: Valid passport, but letters in DOB.  │
│              │ 429 Too Many Requests: Swiped badge 50 times in 2s.     │
├──────────────┼─────────────────────────────────────────────────────────┤
│ 5xx Siren    │ 500 Internal Error: Baggage conveyor belt broke.        │
│ Airport Fail │ 503 Service Unavailable: Radar down for maintenance.    │
└──────────────┴─────────────────────────────────────────────────────────┘
```

- **The Route Decorator (`status_code=...`)** is the **printed flight timetable**. It advertises the default expected outcome to everyone before boarding starts.
- **The Injected `Response` Parameter** is the **gate agent's stamp**. When an edge case occurs during boarding (for example, upgrading an economy passenger to business class on the fly), the agent modifies the status code dynamically on the outbound pass.
- **`JSONResponse`** is a **custom manual manifest**. You hand-craft the exact envelope, status code, and headers from scratch, bypassing the standard conveyor belt.
- **`HTTPException`** is the **security officer**. When an unrecoverable violation occurs (like a forged passport), security halts the line immediately, sends the passenger away with a red slip, and stops all downstream boarding procedures.

---

## 3. How It Actually Works — The Full Explanation

FastAPI offers four primary ways to control HTTP status codes. Each serves a specific architectural layer.

```txt
                              HTTP Request
                                   │
                                   ▼
                       ┌───────────────────────┐
                       │  FastAPI Route Match  │
                       └───────────┬───────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
        [Normal Execution Path]         [Error / Guard Path]
                    │                             │
    ┌───────────────┴───────────────┐     raise HTTPException(4xx/5xx)
    │                               │             │
    ▼                               ▼             ▼
Route Decorator Default    Dynamic Override    FastAPI Exception Handler
@app.post(status_code=201)  response.status_code = 202   │
    │                               │             ▼
    └───────────────┬───────────────┘       JSONResponse(status_code=...,
                    │                            content={"detail": ...})
                    ▼                             │
        Serialize via Pydantic                    │
                    │                             │
                    ▼                             │
        Starlette Response Stream ◄───────────────┘
                    │
                    ▼
               HTTP Client
```

### 1. Static Status Codes via Route Decorators
When an endpoint has a fixed success outcome, declare `status_code` directly in the path operation decorator using the `fastapi.status` module (which re-exports Starlette's HTTP constants):

```python
from fastapi import FastAPI, status

app = FastAPI()

@app.post("/items", status_code=status.HTTP_201_CREATED)
def create_item(name: str):
    return {"id": 1, "name": name}
```

Under the hood:
- FastAPI registers `status_code=201` in the route's `APIRoute` definition.
- It writes `201` into the OpenAPI (Swagger) schema at `/openapi.json` as the default success response.
- When the handler finishes, FastAPI serializes the return value using the defined `response_model` and wraps it in a Starlette `Response` stamped with `201`.

### 2. Dynamic Status Codes via `response: Response` Parameter Injection
When the status code depends on runtime logic (such as an idempotent "upsert" that returns `201 Created` if a new record was inserted, but `200 OK` if an existing record was updated):

```python
from fastapi import FastAPI, Response, status

app = FastAPI()

@app.put("/items/{item_id}", status_code=status.HTTP_200_OK)
def upsert_item(item_id: int, name: str, response: Response):
    created, item = database_upsert(item_id, name)
    if created:
        response.status_code = status.HTTP_201_CREATED
    return item
```

Under the hood:
- FastAPI inspects the route handler's signature using Python's `inspect` module.
- It detects `response: Response` and instantiates a mutable Starlette `Response` object before calling your handler.
- Your handler modifies `response.status_code`.
- When your function returns, FastAPI retains your custom status code, merges any headers/cookies you set on `response`, serializes your returned data against your Pydantic `response_model`, and delivers the final response.

### 3. Returning Explicit `JSONResponse` Directly
When you need full control over headers, cookies, serialization, and status codes simultaneously:

```python
from fastapi import FastAPI, status
from fastapi.responses import JSONResponse

app = FastAPI()

@app.post("/tasks")
def trigger_task():
    task_id = "task_98765"
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={"task_id": task_id, "status": "queued"},
        headers={"Location": f"/tasks/{task_id}/status"}
    )
```

Under the hood:
- When a route handler returns an instance of `starlette.responses.Response` (or subclasses like `JSONResponse`, `PlainTextResponse`, `HTMLResponse`, `StreamingResponse`), FastAPI skips its internal serialization pipeline and outputs your response object directly.

### 4. Short-Circuiting Errors via `HTTPException`
For client and server error states (4xx/5xx), do not return error dictionaries with modified status codes. Raise `HTTPException`:

```python
from fastapi import FastAPI, HTTPException, status

app = FastAPI()

@app.get("/items/{item_id}")
def get_item(item_id: int):
    item = database_find(item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with ID {item_id} does not exist"
        )
    return item
```

Under the hood:
- Raising `HTTPException` interrupts handler execution immediately.
- FastAPI's default exception handler catches it and returns a `JSONResponse` with the specified status code and `{"detail": ...}` payload.

---

### The REST HTTP Status Standard Matrix for Backend APIs

Every senior engineer must know exactly when to apply each standard status code:

| Status Code | `fastapi.status` Constant | RFC Semantic Meaning | Standard Body Payload | Common REST Verbs |
|---|---|---|---|---|
| **`200 OK`** | `status.HTTP_200_OK` | Request succeeded; resource retrieved or modified. | Entity representation or confirmation payload. | `GET`, `PUT`, `PATCH`, `POST` (non-creation) |
| **`201 Created`** | `status.HTTP_201_CREATED` | New resource successfully created and persisted. | Newly created entity + optional `Location` header. | `POST`, `PUT` (when creating new ID) |
| **`202 Accepted`** | `status.HTTP_202_ACCEPTED` | Request accepted for async processing; not yet finished. | Job tracking ID + status check URL. | `POST`, `DELETE`, `PUT` |
| **`204 No Content`** | `status.HTTP_204_NO_CONTENT` | Action succeeded; no response body returned. | **Must be empty** (zero bytes). | `DELETE`, `POST` (actions with no return) |
| **`304 Not Modified`** | `status.HTTP_304_NOT_MODIFIED` | Cached version is current (ETag / If-None-Match match). | **Must be empty**. | `GET`, `HEAD` |
| **`400 Bad Request`** | `status.HTTP_400_BAD_REQUEST` | Malformed syntax, invalid query params, or broken headers. | Error details (`{"detail": ...}`). | Any |
| **`401 Unauthorized`** | `status.HTTP_401_UNAUTHORIZED` | Missing or invalid authentication credentials (identity unknown). | Error details + `WWW-Authenticate` header. | Any |
| **`403 Forbidden`** | `status.HTTP_403_FORBIDDEN` | Identity authenticated, but insufficient permissions/roles. | Error details. | Any |
| **`404 Not Found`** | `status.HTTP_404_NOT_FOUND` | Target resource URL does not exist. | Error details. | `GET`, `PUT`, `DELETE`, `PATCH` |
| **`409 Conflict`** | `status.HTTP_409_CONFLICT` | Mutation conflicts with current state (duplicate key, version mismatch). | Conflict explanation and conflicting ID. | `POST`, `PUT`, `PATCH` |
| **`422 Unprocessable Entity`** | `status.HTTP_422_UNPROCESSABLE_ENTITY` | Syntax is valid JSON, but fails schema/type/validation constraints. | FastAPI validation error array. | `POST`, `PUT`, `PATCH` |
| **`429 Too Many Requests`** | `status.HTTP_429_TOO_MANY_REQUESTS` | Rate limit exceeded. | Error message + `Retry-After` header. | Any |
| **`500 Internal Server Error`** | `status.HTTP_500_INTERNAL_SERVER_ERROR` | Unhandled exception crashed the server. | Generic error message (hide internal tracebacks). | Any |
| **`503 Service Unavailable`** | `status.HTTP_503_SERVICE_UNAVAILABLE` | Server overloaded or down for maintenance. | Downtime info + `Retry-After` header. | Any |

---

## 4. Real Code — See It Working

### Example 1: Static Status Codes (`201 Created` and `204 No Content`)

```python
from fastapi import FastAPI, status, HTTPException, Response
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict

app = FastAPI(title="User Management Service")

class UserCreate(BaseModel):
    username: str
    email: EmailStr

class UserResponse(BaseModel):
    id: int
    username: str
    email: EmailStr

# In-memory store for demonstration
db_users: Dict[int, dict] = {}
user_counter = 0

@app.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user"
)
def create_user(payload: UserCreate):
    global user_counter
    # Check for duplicate email
    for existing in db_users.values():
        if existing["email"] == payload.email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"User with email '{payload.email}' already exists"
            )
    
    user_counter += 1
    new_user = {"id": user_counter, "username": payload.username, "email": payload.email}
    db_users[user_counter] = new_user
    # FastAPI automatically wraps the returned dict in UserResponse and stamps 201 Created
    return new_user

@app.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a user"
)
def delete_user(user_id: int):
    if user_id not in db_users:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found"
        )
    del db_users[user_id]
    # For HTTP 204, return None or an empty Response object. No body bytes are sent.
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

### Example 2: Dynamic Status Modification via `Response` and OpenAPI Documentation

```python
from fastapi import FastAPI, Response, status
from pydantic import BaseModel

app = FastAPI()

class SettingPayload(BaseModel):
    value: str

class SettingResponse(BaseModel):
    key: str
    value: str
    is_new: bool

settings_store: dict[str, str] = {}

@app.put(
    "/settings/{key}",
    response_model=SettingResponse,
    status_code=status.HTTP_200_OK,
    # Document alternate dynamic status codes for OpenAPI / Swagger UI
    responses={
        status.HTTP_201_CREATED: {
            "description": "Setting was newly created (did not previously exist).",
            "model": SettingResponse
        },
        status.HTTP_200_OK: {
            "description": "Setting existed and was successfully updated.",
            "model": SettingResponse
        }
    }
)
def upsert_setting(key: str, payload: SettingPayload, response: Response):
    is_new = key not in settings_store
    settings_store[key] = payload.value
    
    if is_new:
        # Dynamically switch status code from default 200 to 201 Created
        response.status_code = status.HTTP_201_CREATED
    
    return SettingResponse(key=key, value=payload.value, is_new=is_new)
```

### Example 3: Asynchronous Long-Running Job (`202 Accepted` with `Location` Header)

```python
import uuid
from fastapi import FastAPI, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI()

class VideoTranscodeRequest(BaseModel):
    source_url: str
    target_format: str

@app.post(
    "/videos/transcode",
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        status.HTTP_202_ACCEPTED: {
            "description": "Transcoding job accepted and queued for processing."
        }
    }
)
def queue_transcoding_job(request: VideoTranscodeRequest):
    job_id = str(uuid.uuid4())
    # In production: enqueue job into Celery / Redis Queue / AWS SQS here
    
    # 202 Accepted should return a job tracking reference and a Location / status header
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={
            "job_id": job_id,
            "status": "queued",
            "message": "Video transcoding is being processed asynchronously."
        },
        headers={
            "Location": f"/videos/transcode/jobs/{job_id}",
            "Retry-After": "30"
        }
    )
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between setting `status_code` on the route decorator versus mutating `response.status_code` inside the route function?**

The route decorator parameter (`@app.post(..., status_code=201)`) defines the **static default contract**. It tells FastAPI what status code to assign to successful executions when no other override occurs, and it writes that status code directly into the generated OpenAPI documentation and Swagger UI.

Mutating `response.status_code` via parameter injection (`response.status_code = 202`) is a **runtime dynamic override**. It modifies the HTTP status code of the outgoing response based on execution logic (for instance, returning `201 Created` if a record was newly inserted vs `200 OK` if it was updated). However, dynamic mutations inside the handler are invisible to FastAPI's static analyzer, so they will not appear in Swagger UI unless explicitly declared in the decorator's `responses={...}` dictionary.

---

**Q: What is the exact distinction between `401 Unauthorized` and `403 Forbidden`, and why does getting them wrong cause security and UX issues?**

`401 Unauthorized` means **Unauthenticated (Identity Missing or Invalid)**: The server does not know who the client is. The client either omitted the `Authorization` header, supplied an expired JWT, or provided bad API keys. The client can fix this by presenting valid credentials. In standard HTTP, a `401` response must include a `WWW-Authenticate` challenge header.

`403 Forbidden` means **Unauthorized (Identity Known, Permission Denied)**: The server successfully verified the client's identity (for example, user `alice`), but `alice` lacks the role or permission needed to access the requested resource (such as a standard user trying to access `/admin/billing`). Sending valid credentials again will not change the outcome.

Confusing these two breaks client-side auth interceptors. When a frontend receives `401`, it initiates token refresh workflows or redirects to `/login`. If the server incorrectly returns `401` instead of `403` for a permission issue, the frontend enters an infinite login loop because logging in again still will not grant admin rights.

---

**Q: Why does FastAPI default to `422 Unprocessable Entity` for request validation failures instead of `400 Bad Request`?**

`400 Bad Request` indicates a low-level syntactic failure: the client sent malformed data that the HTTP server cannot parse (such as truncated JSON with missing closing brackets, invalid HTTP framing, or corrupt URL encoding).

`422 Unprocessable Entity` (defined in RFC 4918 / RFC 9110) indicates that the request syntax is perfectly valid (the server successfully parsed the JSON body), but the payload contains semantic validation errors. For example, an `email` field is formatted as `"not-an-email"`, or an `age` field receives a negative integer. FastAPI and Pydantic use `422` because it communicates that the payload was read and understood, but failed business domain rules.

---

**Q: What happens if a FastAPI route returns a JSON body when configured with `status_code=204`?**

HTTP `204 No Content` is defined by RFC 9110 as a response that **must not contain a message body**.

If you return a dictionary or Pydantic model from a route with `status_code=status.HTTP_204_NO_CONTENT`, FastAPI will attempt to send it, but standard HTTP compliance causes problems:
1. Proxies, HTTP client libraries, and browsers may strip the body automatically or drop the connection due to protocol violations (such as having a `Content-Length > 0` with a 204).
2. The correct FastAPI implementation for `204` is to return `Response(status_code=status.HTTP_204_NO_CONTENT)` or `None`, ensuring zero wire bytes are sent in the body.

---

**Q: How do you document dynamic or error status codes in OpenAPI when using FastAPI?**

FastAPI automatically documents the default `status_code` and built-in `422` validation schemas. To document additional status codes returned dynamically or via `HTTPException`, use the `responses` parameter on the path decorator:

```python
@app.post(
    "/items",
    status_code=status.HTTP_201_CREATED,
    responses={
        status.HTTP_409_CONFLICT: {
            "description": "Item SKU already exists in inventory.",
            "content": {"application/json": {"example": {"detail": "SKU_EXISTS"}}}
        },
        status.HTTP_429_TOO_MANY_REQUESTS: {
            "description": "Rate limit exceeded for creation requests."
        }
    }
)
```

This merges the additional status codes into the OpenAPI specification so API consumers and documentation tools see all potential outcomes.

---

**Q: When should you raise `HTTPException` versus returning a `JSONResponse(status_code=...)`?**

Raise `HTTPException` when encountering an **exceptional condition or failure** that should abort further handler execution (such as missing entities, failed authentication, or rate limits). It short-circuits internal logic, triggers centralized exception handling, and maintains consistent error response formatting across your entire application.

Return `JSONResponse` when you need to construct a **custom successful or non-error response** with specific headers (like `Location`, `ETag`, or custom tracking cookies) or when bypassing Pydantic serialization for pre-serialized raw JSON payloads.

---

## 6. The Traps — What Goes Wrong

### Trap 1: The "Soft 200" Antipattern
- **The Wrong Assumption:** "I'll return `200 OK` with `{"error": "Unauthorized"}` so the client always gets a parseable JSON response."
- **Why It Fails:** It breaks HTTP semantic routing. API gateways, reverse proxies, and frontend interceptors rely on the HTTP status line. A soft 200 gets cached by CDNs, prevents Axios/Fetch from throwing errors into `.catch()` blocks, and fools uptime monitors into reporting 100% health during total outages.
- **The Fix:** Always use the appropriate 4xx or 5xx code via `raise HTTPException(status_code=..., detail=...)`.

### Trap 2: Returning Data on a `204 No Content` Route
- **The Wrong Assumption:** Returning `{"status": "deleted"}` while setting `status_code=204`.
- **Why It Fails:** RFC 9110 forbids a body on 204 responses. Sending a body with `204` causes some reverse proxies (like AWS CloudFront or Nginx) to either strip the body, alter the status code to 200, or raise HTTP framing errors.
- **The Fix:**
  ```python
  # WRONG
  @app.delete("/items/{id}", status_code=204)
  def delete_item(id: int):
      return {"message": "deleted"}

  # CORRECT
  @app.delete("/items/{id}", status_code=status.HTTP_204_NO_CONTENT)
  def delete_item(id: int):
      # perform deletion
      return Response(status_code=status.HTTP_204_NO_CONTENT)
  ```

### Trap 3: Expecting `response.status_code` to Auto-Update Swagger Docs
- **The Wrong Assumption:** Changing `response.status_code = 202` inside the route function will automatically update the Swagger UI documentation.
- **Why It Fails:** FastAPI generates the OpenAPI schema during application startup by inspecting route decorators and type annotations. It does not execute your handler code to determine what status codes might be assigned dynamically at runtime.
- **The Fix:** Always declare alternate status codes using the `responses={...}` dictionary in the route decorator.

### Trap 4: Mutating `response.status_code` After Raising an Exception
- **The Wrong Assumption:** Setting `response.status_code = 404` and then raising an exception or returning a custom `JSONResponse`.
- **Why It Fails:** When an exception is raised, standard execution halts immediately. FastAPI delegates to the exception handler, which builds an entirely new `Response` object. Your modifications to the injected `response` parameter are discarded.
- **The Fix:** Pass the status code directly into the exception constructor: `raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="...")`.

### Trap 5: Using Magic Numbers Instead of Named Constants
- **The Wrong Assumption:** Hardcoding raw integers throughout route handlers (`status_code=201`, `status_code=422`, `status_code=409`).
- **Why It Fails:** Magic numbers reduce code readability, increase typos (such as typing `402` instead of `422`), and make global code searches for specific HTTP status handlers unreliable.
- **The Fix:** Import and use `from fastapi import status` with constants like `status.HTTP_201_CREATED` and `status.HTTP_409_CONFLICT`.

---

## 7. Compare With Related Concepts

| Mechanism | Scope / Execution Stage | Use Case | Affects OpenAPI Docs Automatically? | Allows Body Serialization? |
|---|---|---|---|---|
| **Decorator `status_code`** | Route definition (static) | Fixed, predictable success responses (e.g., `201 Created` for POST, `204 No Content` for DELETE). | Yes (sets the default 2xx schema). | Yes (via Pydantic `response_model`). |
| **Injected `response: Response`** | Inside handler (dynamic) | Runtime conditional success codes (e.g., `201` for insert vs `200` for update in an upsert). | No (requires manual `responses={...}` declaration). | Yes (FastAPI still serializes the return value). |
| **Explicit `JSONResponse`** | Return statement (bypasses pipeline) | Low-level control of headers (`Location`, `Set-Cookie`), status codes, and raw JSON payloads. | No (requires manual `responses={...}` declaration). | Manual serialization only (bypasses Pydantic model). |
| **`HTTPException`** | Interrupt / Error stage | Short-circuiting error flows (401, 403, 404, 409, 500) before completing business logic. | Partial (FastAPI registers standard error formats, custom codes need `responses={...}`). | Default error format `{"detail": ...}`. |
| **Custom `@app.exception_handler`** | Global application middleware level | Catching domain exceptions (e.g., `EntityNotFoundError`, `PaymentFailedError`) and translating them into standard HTTP status codes app-wide. | No (requires explicit schema documentation). | Fully custom via handler implementation. |

---

## 8. 🧠 The Memory Hook

> **The decorator sets the contract on the board, the `Response` parameter lets the referee change the call on the field, and `HTTPException` blows the whistle to stop the play immediately.**
> Never disguise an error in a `200 OK` jersey, or your clients, caches, and monitoring dashboards will celebrate a disaster.
