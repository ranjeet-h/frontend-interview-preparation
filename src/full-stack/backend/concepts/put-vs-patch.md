# PUT vs PATCH: Complete Replacement vs Partial Mutation

## 1. Why This Exists — The Problem First

A mobile engineer builds a quick profile edit screen where users can update their phone number. When the user taps "Save", the app sends `PUT /api/users/42` with the body `{"phone": "+1-555-0199"}`. The server responds `200 OK`. Thirty seconds later, customer support gets bombarded with urgent tickets: the user can no longer log in, their display name is wiped clean, their shipping address is gone, their avatar reset to default, and their account role reverted to guest.

Why did this disaster happen? Because the backend developer implemented standard HTTP `PUT` semantics: `PUT` means **complete resource replacement**. The server took the incoming JSON, assumed it represented the entire desired state of user 42, replaced the existing database row with just the phone number, and set all unspecified fields to `NULL` or schema defaults.

Now consider the opposite failure. Two users collaborate on a shared dashboard. User A changes the dashboard title, so their client fetches the full resource, modifies `title`, and sends the full payload back via `PUT`. Simultaneously, User B toggles dark mode, fetches the full resource, modifies `theme`, and sends the full payload back via `PUT`. If User B's fetch happens before User A's update finishes saving, User B's `PUT` blindly overwrites User A's title change back to the old value. This is the classic "Lost Update" race condition caused by forcing clients to submit entire entity payloads for trivial field edits.

HTTP required two distinct verbs with strict architectural contracts: one that guarantees the server resource will mirror the exact complete representation sent in the payload (`PUT`), and one that applies a targeted delta or diff to an existing resource without disturbing untouched fields (`PATCH`).

## 2. The Analogy — Make It Obvious

Think of updating a document in a physical office filing cabinet.

**`PUT` is replacing an entire page in the binder.** 
If you want to update Page 12, you take out a fresh sheet of paper, write whatever you want on it, and hand it to the filing clerk. The clerk removes old Page 12, shreds it, and puts your new sheet in its place. If your new sheet only has your phone number written on it and nothing else, Page 12 now contains *only* a phone number. Your name, tax ID, and address that were on the old page are sitting in the shredder. 

**`PATCH` is handing the clerk a sticky note with red-pen corrections.**
You hand the clerk a note that says: *"On Page 12, line 4, erase the existing phone number and write +1-555-0199."* The clerk opens the binder, turns to Page 12, locates line 4, makes that exact change with a pencil, and leaves everything else on the page untouched.

This analogy also makes **idempotency** immediately clear:
- If you hand the clerk the exact same replacement sheet for Page 12 ten times in a row, the binder looks identical after request 1 as it does after request 10 (`PUT` is naturally idempotent).
- If your sticky note says *"Set phone number to X"*, applying it ten times also leaves the phone number as X. But if your sticky note says *"Add $10 to the balance on line 8"*, applying it ten times adds $100 instead of $10 (`PATCH` is non-idempotent by default because delta instructions can be relative).

## 3. How It Actually Works — The Full Explanation

HTTP methods are defined by strict Internet Engineering Task Force (IETF) RFC specifications. Understanding how servers, reverse proxies, and caching layers treat `PUT` and `PATCH` requires looking under the hood of these specifications.

**PUT Semantics (RFC 9110 / RFC 7231): Complete Resource Replacement & Upsert**

When a client sends a `PUT /resources/{id}` request, it sends a complete representation of how the target resource should look after the operation:
1. **Replacement**: If the resource already exists at `{id}`, the server replaces its entire state with the payload. Any attribute omitted from the request body is treated as intentionally deleted or reset to its default value.
2. **Creation (Upsert)**: If no resource exists at `{id}`, and the URI is client-assignable (for example, `PUT /articles/my-custom-slug`), the server creates a new resource with that exact URI and returns `201 Created`. If an existing entity was replaced, the server returns `200 OK` or `204 No Content`.
3. **Idempotency Guarantee**: RFC 9110 specifies that `PUT` must be idempotent. Calling `PUT /users/42` with `{ "name": "Jane", "email": "jane@work.com", "role": "admin" }` once, five times, or a hundred times must leave the server in the exact same logical state. This makes `PUT` safe for automatic client and proxy retries when network drops occur.

**PATCH Semantics (RFC 5789): Partial Resource Modification**

`PATCH` was introduced in RFC 5789 specifically to fix the bandwidth and race-condition issues of `PUT`. Instead of sending the full resource representation, the client sends a set of instructions describing how an existing resource should be transformed:
1. **Targeted Mutation**: The server loads the existing resource, applies only the supplied changes, and persists the merged result. Fields not mentioned in the request remain untouched.
2. **Missing Resource Handling**: Unlike `PUT`, `PATCH` cannot create a resource if it does not exist. If the target URI does not exist, the server must return `404 Not Found`.
3. **Non-Idempotent by Specification**: RFC 5789 explicitly defines `PATCH` as non-idempotent. While setting static key-value pairs is practically idempotent, patch payloads can contain relative operations (such as incrementing counters or appending to arrays) where repeating the request produces cumulative side-effects.

**The Two Standard PATCH Payload Formats**

In production, partial updates generally follow one of two standardized formats:

1. **JSON Merge Patch (RFC 7386) — `Content-Type: application/merge-patch+json`**
The payload is a standard JSON object containing only the keys to change. If a key is present with a value, it updates that key. If a key is explicitly set to `null`, the server removes that property. If a key is omitted, it remains unchanged.
- *Limitation*: You cannot store a literal `null` in a database column because `null` means "delete this field". Updating items inside arrays requires sending the entire modified array.

2. **JSON Patch (RFC 6902) — `Content-Type: application/json-patch+json`**
The payload is an array of explicit mutation operations. Each operation specifies an action (`add`, `remove`, `replace`, `move`, `copy`, or `test`), a JSON pointer `path`, and a `value`.
```json
[
  { "op": "test", "path": "/version", "value": 3 },
  { "op": "replace", "path": "/email", "value": "new@example.com" },
  { "op": "add", "path": "/tags/-", "value": "premium" }
]
```
JSON Patch operations execute atomically: if the `"test"` operation fails (meaning someone else modified the resource first), the entire batch aborts with no changes applied.

**Concurrency Control: Optimistic Locking with ETag and If-Match**

Because both `PUT` and `PATCH` can overwrite concurrent changes, production APIs use HTTP Conditional Requests to prevent lost updates:
1. When a client reads a resource via `GET /users/42`, the server returns an `ETag` header containing a hash or version token of the current state: `ETag: "v3-9f8a2"`.
2. When the client sends `PUT` or `PATCH`, it passes that token back in the `If-Match` request header: `If-Match: "v3-9f8a2"`.
3. The server compares the header against the current resource hash in the database. If another client updated the record in the meantime, the hashes do not match. The server aborts the update and returns `412 Precondition Failed`. The client must fetch the latest version and re-apply its changes.

## 4. Real Code — See It Working

Here is how production servers implement `PUT` vs `PATCH` with strict semantics, validation, and concurrency checks.

**Example 1: Python / FastAPI with Pydantic & Optimistic Locking**

```python
import hashlib
import json
from typing import Optional
from fastapi import FastAPI, Header, HTTPException, Response, status
from pydantic import BaseModel, EmailStr

app = FastAPI()

# Simulated database store
database = {
    42: {
        "id": 42,
        "username": "alex99",
        "email": "alex@example.com",
        "bio": "Distributed systems engineer",
        "phone": "+1-555-0100",
        "role": "member",
        "version": 1,
    }
}

class UserPutRequest(BaseModel):
    # In PUT, all mutable representation fields are mandatory.
    # Optional fields default to None, meaning the client explicitly clears them if omitted.
    email: EmailStr
    bio: Optional[str] = None
    phone: Optional[str] = None

class UserPatchRequest(BaseModel):
    # In PATCH, all fields are optional. We must track which keys were explicitly provided.
    email: Optional[EmailStr] = None
    bio: Optional[str] = None
    phone: Optional[str] = None

def calculate_etag(record: dict) -> str:
    serialized = json.dumps(record, sort_keys=True)
    return f'"{hashlib.sha256(serialized.encode()).hexdigest()[:16]}"'

@app.put("/api/users/{user_id}")
def replace_user(
    user_id: int,
    payload: UserPutRequest,
    if_match: Optional[str] = Header(None),
):
    if user_id not in database:
        raise HTTPException(status_code=404, detail="User does not exist")

    current = database[user_id]
    current_etag = calculate_etag(current)

    # Prevent lost updates via conditional header check
    if if_match and if_match != current_etag:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail="Resource version conflict. Fetch latest state before updating.",
        )

    # Complete Replacement: System-controlled fields remain intact;
    # all mutable fields are replaced with payload values (clearing omitted optionals to None).
    replaced_user = {
        "id": user_id,
        "username": current["username"],  # immutable key
        "role": current["role"],          # protected domain field
        "email": payload.email,
        "bio": payload.bio,              # explicitly sets to None if omitted
        "phone": payload.phone,          # explicitly sets to None if omitted
        "version": current["version"] + 1,
    }

    database[user_id] = replaced_user
    new_etag = calculate_etag(replaced_user)

    return Response(
        content=json.dumps(replaced_user),
        media_type="application/json",
        headers={"ETag": new_etag},
    )

@app.patch("/api/users/{user_id}")
def modify_user(
    user_id: int,
    payload: UserPatchRequest,
    if_match: Optional[str] = Header(None),
):
    if user_id not in database:
        raise HTTPException(status_code=404, detail="User does not exist")

    current = database[user_id]
    current_etag = calculate_etag(current)

    if if_match and if_match != current_etag:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail="Resource version conflict. Fetch latest state before updating.",
        )

    # exclude_unset=True is the key: extracts ONLY fields explicitly passed in the HTTP request body
    patch_fields = payload.model_dump(exclude_unset=True)
    if not patch_fields:
        raise HTTPException(status_code=400, detail="PATCH payload contains no fields to update")

    # Apply partial mutation strictly to provided keys
    for field, value in patch_fields.items():
        current[field] = value

    current["version"] += 1
    database[user_id] = current
    new_etag = calculate_etag(current)

    return Response(
        content=json.dumps(current),
        media_type="application/json",
        headers={"ETag": new_etag},
    )
```

**Example 2: Node.js / Express & SQL Layer Distinction**

```javascript
const express = require('express');
const app = express();
app.use(express.json());

// PUT: Full resource replacement at the SQL layer
app.put('/api/users/:id', async (req, res) => {
  const userId = req.params.id;
  const { email, name, bio, phone } = req.body;

  // Complete representation requires required fields to be present
  if (!email || !name) {
    return res.status(400).json({ error: 'PUT requires full representation: email and name are mandatory' });
  }

  // All columns are overwritten. Any missing optional field is written as NULL.
  const query = `
    UPDATE users
    SET email = $1,
        name = $2,
        bio = $3,
        phone = $4,
        updated_at = NOW()
    WHERE id = $5
    RETURNING id, email, name, bio, phone, updated_at;
  `;
  const values = [email, name, bio ?? null, phone ?? null, userId];

  const result = await db.query(query, values);
  if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  return res.status(200).json(result.rows[0]);
});

// PATCH: Dynamic partial update (JSON Merge Patch semantics)
app.patch('/api/users/:id', async (req, res) => {
  const userId = req.params.id;
  const patchPayload = req.body;

  // Whitelist writable fields to block Mass Assignment vulnerabilities
  const ALLOWED_COLUMNS = ['email', 'name', 'bio', 'phone'];
  const fieldsToUpdate = Object.keys(patchPayload).filter(key => ALLOWED_COLUMNS.includes(key));

  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ error: 'No valid writable fields provided' });
  }

  // Dynamically build SET clause for only the provided fields: "name" = $1, "bio" = $2
  const setClauses = fieldsToUpdate.map((col, idx) => `"${col}" = $${idx + 1}`);
  const values = fieldsToUpdate.map(col => patchPayload[col]);

  // Append user ID as the final parameter for the WHERE clause
  values.push(userId);
  const idIndex = values.length;

  const query = `
    UPDATE users
    SET ${setClauses.join(', ')}, updated_at = NOW()
    WHERE id = $${idIndex}
    RETURNING id, email, name, bio, phone, updated_at;
  `;

  const result = await db.query(query, values);
  if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  return res.status(200).json(result.rows[0]);
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the primary semantic difference between PUT and PATCH?**

`PUT` is defined by RFC 9110 as a full resource replacement. The client provides the complete representation of the resource. Any field omitted in the payload is treated as cleared, set to `null`, or reset to default. If the resource does not exist and the URI is client-assigned, `PUT` can create it (upsert).

`PATCH` is defined by RFC 5789 as a partial resource modification. The client sends only a diff or delta describing changes to make to an existing resource. The server merges the provided fields into the existing record, leaving all omitted fields unchanged. If the resource does not exist, `PATCH` returns `404 Not Found`.

**Q: Why is PUT guaranteed to be idempotent while PATCH is not?**

An operation is idempotent if executing it multiple times produces the exact same server state as executing it once ($f(f(x)) = f(x)$).

`PUT` is inherently idempotent because the request body contains the complete desired end-state of the resource. Sending `{ "name": "Alice", "role": "admin" }` to `PUT /users/1` ten times always replaces the record with that exact state.

`PATCH` is not guaranteed to be idempotent because its payload describes *how to modify* the resource rather than *what the entire final state must be*. While a key-value replace (`{ "status": "active" }`) is idempotent in practice, a PATCH instruction can describe relative transformations, such as `{ "balance": { "$increment": 25 } }` or JSON Patch operations like `[{ "op": "add", "path": "/items/-", "value": "book" }]`. Executing that request three times adds $75 or appends three separate books to the list.

**Q: How should a backend handle omitted fields in a PUT vs a PATCH request?**

In a `PUT` request, omitted fields signify that the client wants those fields removed or set to their default values. The server must not preserve old values for omitted fields unless those fields are immutable system metadata (like `id` or `created_at`).

In a `PATCH` request, omitted fields mean "do not modify". The server must only update columns or properties explicitly listed in the request payload.

**Q: What is the difference between JSON Merge Patch (RFC 7386) and JSON Patch (RFC 6902)?**

JSON Merge Patch uses a standard JSON object containing key-value updates. If a key is passed with `null`, the property is deleted. Its advantages are simplicity and readability. Its drawbacks are that you cannot store a literal `null` value in the database, and updating array elements requires sending the entire updated array.

JSON Patch represents changes as an ordered sequence of explicit operation objects (`add`, `remove`, `replace`, `move`, `copy`, `test`) targeting specific JSON pointers (e.g., `"/addresses/0/zip"`). It executes atomically, allows targeting individual array indices without replacing the whole array, and supports conditional execution via the `"test"` operation.

**Q: How do you prevent lost updates during concurrent PUT or PATCH calls?**

Use Optimistic Concurrency Control with HTTP Conditional Headers:
1. The server includes an `ETag` header (a hash or version number) on read responses: `ETag: "686897696a7c7647"`.
2. When submitting a `PUT` or `PATCH`, the client includes the header `If-Match: "686897696a7c7647"`.
3. If another request updated the resource first, the server's current ETag will no longer match the incoming `If-Match` header.
4. The server rejects the mutation with `412 Precondition Failed`. The client must fetch the new state, resolve conflicts, and retry.

**Q: Should a status transition like canceling an order use PATCH or a dedicated POST endpoint?**

If the status change is a purely administrative property edit with no side effects, `PATCH /orders/123` with `{ "status": "cancelled" }` is acceptable.

However, if canceling an order triggers domain business logic — processing a credit card refund, returning inventory to the warehouse, issuing cancellation emails, and writing audit log records — modeling it as a command endpoint like `POST /orders/123/cancel` is superior. Dedicated command endpoints make intent explicit, allow specialized input validation (such as requiring a cancellation reason), and clearly represent workflow transitions rather than simple property modifications.

**Q: What HTTP response status codes should PUT and PATCH return?**

- `200 OK`: Returned when the server successfully updates the resource and returns the updated entity in the response body.
- `201 Created`: Returned exclusively by `PUT` when creating a new resource at a client-specified URI.
- `204 No Content`: Returned when the update succeeds and the server chooses not to return an entity body.
- `400 Bad Request`: Returned when the request payload is malformed or invalid.
- `404 Not Found`: Returned when attempting to `PATCH` a non-existent resource, or when attempting to `PUT` to a non-existent parent path.
- `412 Precondition Failed`: Returned when an `If-Match` header does not match the current resource `ETag`.
- `422 Unprocessable Entity`: Returned when the payload syntax is valid JSON, but violates domain validation rules (e.g., invalid email format or disallowed state transition).

## 6. The Traps — What Goes Wrong

**1. The "Lazy PUT" Anti-Pattern (Implementing PUT as a PATCH)**

Many frameworks and developers write `app.put('/users/:id')` and implement it using an ORM merge: `Object.assign(existingUser, req.body)`. 

*Why it fails*: The endpoint is labeled `PUT`, but behaves like `PATCH`. If a client sends a payload omitting `address` with the expectation of deleting an obsolete shipping address, the address remains untouched in the database. Worse, if the team later updates the backend to comply with standard PUT semantics, existing frontend clients that were only sending partial data will suddenly wipe out user records in production.

**2. Accidental Mass Assignment on Partial Updates**

When accepting a dynamic dictionary for `PATCH`, naive code directly iterates over keys: `for (let key in req.body) dbUser[key] = req.body[key]`.

*Why it fails*: An attacker sends `PATCH /api/users/42` with `{ "role": "superadmin", "is_verified": true, "balance": 999999 }`. Because the backend does not validate against a strict update whitelist schema, the attacker escalates privileges. Always validate PATCH payloads against a dedicated schema that only exposes safe, client-updatable fields.

**3. Blindly Retrying Non-Idempotent PATCH Requests**

Frontend HTTP clients (such as Axios with retry interceptors or Service Workers) often configure automatic retries on network timeouts (`504 Gateway Timeout` or connection reset).

*Why it fails*: `PUT` requests can always be retried safely. But if a client sends a non-idempotent `PATCH` that appends an item to an order or increments a value, and the server processed the request before the network dropped on the return path, the automatic retry will execute the increment a second time, charging or modifying the user twice. Never attach automatic retry interceptors to `PATCH` without idempotency keys.

**4. Conflating "Omitted" with "Null" in Partial Updates**

In JavaScript and JSON serialization:
- `{}` (omitted property) means *leave existing database value alone*.
- `{ "bio": null }` means *explicitly clear the existing bio to null*.
- `{ "bio": "" }` means *set the bio to an empty string*.

*Why it fails*: If the backend parser uses naive falsy checks (`if (!req.body.bio)`), it treats all three cases identically. It may accidentally wipe out existing data when a field was simply omitted, or refuse to let a user clear a field to `null`. In Python/Pydantic, use `model_dump(exclude_unset=True)` to distinguish between omitted fields and explicitly passed `None` values.

## 7. Compare With Related Concepts

**PUT vs POST**
- `POST` creates a subordinate resource under a collection (`POST /articles`), letting the server assign the new resource ID and URI, or executes an arbitrary domain action. It is neither safe nor idempotent.
- `PUT` targets a specific, known URI (`PUT /articles/docker-guide`) and completely replaces or creates that exact resource representation. It is idempotent.
- *Rule of thumb*: Use `POST` when you don't know the exact URI of the new item yet or are triggering an operation; use `PUT` when you know the exact URI and want to set its entire state.

**PATCH vs RPC / Command Endpoints (POST /resource/:id/action)**
- `PATCH` modifies structural fields on a resource representation (`PATCH /accounts/1` with `{ "tier": "gold" }`).
- `POST /resource/:id/action` executes a domain workflow with complex multi-step side effects (`POST /accounts/1/upgrade-to-gold`).
- *Rule of thumb*: Use `PATCH` for simple field updates; use dedicated `POST` command actions when state transitions trigger external webhooks, billing events, emails, or complex validations.

**JSON Merge Patch (RFC 7386) vs JSON Patch (RFC 6902)**
- JSON Merge Patch is a simple dictionary of replacement values where `null` signifies deletion.
- JSON Patch is an array of explicit atomic operations (`add`, `remove`, `replace`, `test`) evaluated against JSON pointer paths.
- *Rule of thumb*: Use JSON Merge Patch for simple CRUD property updates; use JSON Patch when you need atomic multi-field operations, modifications to specific array indices, or conditional validation checks.

## 8. 🧠 The Memory Hook

`PUT` is replacing the entire sheet of paper in the binder—whatever you left off the new sheet is gone forever. `PATCH` is handing the clerk a sticky note with line-by-line pencil corrections—only the marked lines change.
