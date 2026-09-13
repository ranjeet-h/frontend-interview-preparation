# How to Validate Request Body in FastAPI: Advanced Pydantic Constraints, Cross-Field Rules, and Sanitization

## 1. Why This Exists — The Problem First

Imagine deploying a user onboarding endpoint without strict request body validation. A client sends what seems like a valid registration payload:

```json
{
  "email": "   Alice.Smith@Example.COM  ",
  "phone_number": "123-abc-callme",
  "password": "123",
  "confirm_password": "secretPassword99",
  "subscription_seats": -5,
  "start_date": "2026-06-01T00:00:00Z",
  "end_date": "2025-01-01T00:00:00Z"
}
```

Without a structured validation boundary, your route handler starts executing immediately. The application stores an untrimmed, mixed-case email string in the database—causing future login queries for `alice.smith@example.com` to fail. It inserts mismatched passwords and negative seat counts that crash billing calculations downstream. The `end_date` is earlier than the `start_date`, breaking scheduling cron jobs. When downstream services crash, database driver errors bubble up as vague `500 Internal Server Error` responses, leaving client developers with no clue what went wrong.

To fix this defensively, engineers often write 50 lines of repetitive `if-else` boilerplate at the top of every endpoint:

```python
# The manual validation nightmare
if not payload.get("email") or "@" not in payload["email"]:
    return {"error": "Invalid email"}, 400
if payload.get("password") != payload.get("confirm_password"):
    return {"error": "Passwords do not match"}, 400
if payload.get("subscription_seats", 0) <= 0:
    return {"error": "Seats must be positive"}, 400
```

This manual approach pollutes route handlers with input sanitization, leads to inconsistent error formats across team members, and inevitably misses critical edge cases. FastAPI solves this problem at the protocol boundary by integrating deeply with Pydantic V2. It gives you a declarative, multi-layered validation system that validates, normalizes, and sanitizes complex request bodies before your route handler ever executes.

---

## 2. The Analogy — Make It Obvious

Think of FastAPI request validation as an **Airport Security and Customs Checkpoint** before an international flight:

```txt
Incoming Request (Passenger with Luggage)
   │
   ├── 1. Luggage Sizer (Pydantic Field Constraints)
   │      Checks length, numeric bounds, regex patterns
   │
   ├── 2. Pre-Wash & Decontamination (@field_validator mode='before')
   │      Strips whitespace, cleans up formatting quirks
   │
   ├── 3. Document Verification (@field_validator mode='after')
   │      Enforces strong password rules, canonicalizes types
   │
   ├── 4. Manifest Cross-Check (@model_validator mode='after')
   │      Verifies passwords match and end_date > start_date
   │
   └── 5. The Boarding Gate (FastAPI Route Handler)
          Executes business logic with 100% clean, trusted data
```

1. **The Luggage Sizer (`Field` Constraints):** The metal frame at the gate. If your bag exceeds 50 cm or weighs more than 25 kg (`min_length`, `max_length`, `gt`, `le`), you are stopped immediately.
2. **Decontamination (`@field_validator(mode='before')`):** Before inspecting individual passport details, customs sweeps away mud and packaging. In code, this strips leading/trailing whitespace from raw strings or removes hyphens from phone numbers before type checking begins.
3. **Item Inspection (`@field_validator(mode='after')`):** The officer inspects your stamped visa to ensure it meets international security standards (e.g. verifying password complexity regex).
4. **Manifest Cross-Check (`@model_validator(mode='after')`):** The officer looks at your passport and boarding pass side by side. Do the names match (`password == confirm_password`)? Is your return flight date after your arrival flight date (`end_date > start_date`)?
5. **The Boarding Gate (Your Route Handler):** The pilot in the cockpit (the route handler) never has to check passports or weigh luggage. If a passenger reaches the cockpit, security has already guaranteed that every single piece of data is safe, normalized, and valid.

---

## 3. How It Actually Works — The Full Explanation

### The Request Lifecycle & Validation Pipeline

When an HTTP request hits a FastAPI route expecting a Pydantic schema:

1. **Body Deserialization:** FastAPI reads the raw streaming bytes from the HTTP connection and parses them as JSON into a Python dictionary. If the JSON is malformed, FastAPI immediately short-circuits with a `400 Bad Request` or `422 Unprocessable Entity`.
2. **Pydantic V2 Core Engine:** FastAPI passes the raw dictionary into `pydantic-core` (written in Rust for near-C speed).
3. **Stage 1 — Raw Field Pre-Validation (`mode='before'`):** Any `@field_validator(..., mode='before')` runs on the raw incoming values before Pydantic attempts type coercion. This is where you sanitize dirty inputs (e.g., stripping whitespace or converting empty strings `""` to `None`).
4. **Stage 2 — Type Coercion & `Field(...)` Constraints:** Pydantic converts raw inputs into their annotated Python types (`int`, `str`, `datetime`, `UUID`, `EmailStr`) and applies primitive bounds:
   - `min_length`, `max_length`: String and collection size limits.
   - `gt`, `ge`, `lt`, `le`: Numeric bounds (greater than, less than or equal to).
   - `pattern`: Regular expression pattern matching.
   - `multiple_of`: Numeric interval constraints.
5. **Stage 3 — Post-Field Validation (`mode='after'`):** Any `@field_validator(..., mode='after')` (the default mode) executes on the strongly-typed Python object.
6. **Stage 4 — Cross-Field Model Validation (`@model_validator(mode='after')`):** Once every individual field passes, Pydantic constructs the model instance (`self`) and runs whole-model validators to check relationships between multiple fields.
7. **Error Aggregation or Handler Injection:**
   - If any validation step fails, Pydantic does **not** stop at the first error. It collects every violation across all fields into a single `ValidationError`. FastAPI catches this and returns an HTTP `422 Unprocessable Entity` containing a structured JSON list of every invalid field, its path, and the specific failure reason.
   - If all validations pass, FastAPI injects the fully populated, strongly-typed model instance directly into your route function parameters.

```txt
Raw HTTP Request Body
       │
       ▼
JSON Deserialization
       │
       ▼
@field_validator(mode='before')   ──► Sanitizes raw input (strip whitespace)
       │
       ▼
Pydantic Type Coercion + Field()  ──► Checks types, regex, length, numeric bounds
       │
       ▼
@field_validator(mode='after')    ──► Validates parsed field values (password strength)
       │
       ▼
@model_validator(mode='after')    ──► Checks multi-field logic (passwords match, dates)
       │
   ┌───┴────────────────────────┐
   │                            │
   ▼ Success                    ▼ Failure
Inject into Route Handler    Return HTTP 422 with full error array
```

---

## 4. Real Code — See It Working

### Complete Production Registration & Booking Schema

Here is a production-grade FastAPI example featuring advanced `Field` constraints, string sanitization, password complexity enforcement, and cross-field date validation.

```python
from datetime import datetime, timezone
import re
from typing import Annotated
from fastapi import FastAPI, status
from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

app = FastAPI(title="User & Booking Management API")


class UserRegistrationRequest(BaseModel):
    # Enforce strict field bounds, regex patterns, and OpenAPI documentation
    email: EmailStr = Field(
        description="User email address, normalized to lowercase"
    )
    username: str = Field(
        min_length=3,
        max_length=30,
        pattern=r"^[a-zA-Z0-9_-]+$",
        description="Alphanumeric username allowing underscores and hyphens"
    )
    phone_number: str = Field(
        pattern=r"^\+[1-9]\d{1,14}$",
        description="International phone number in strict E.164 format (e.g. +14155552671)"
    )
    password: str = Field(
        min_length=8,
        max_length=128,
        description="Plaintext password meeting complexity requirements"
    )
    confirm_password: str = Field(
        min_length=8,
        max_length=128,
        description="Must match password exactly"
    )
    subscription_seats: int = Field(
        default=1,
        gt=0,
        le=500,
        description="Number of licensed seats (between 1 and 500)"
    )
    start_date: datetime = Field(
        description="Booking start timestamp in UTC"
    )
    end_date: datetime = Field(
        description="Booking conclusion timestamp in UTC"
    )

    # 1. Sanitization Validator (mode='before'): Runs on raw input before type validation
    @field_validator("username", "phone_number", mode="before")
    @classmethod
    def strip_whitespace_and_formatting(cls, value: object) -> object:
        if isinstance(value, str):
            # Strip outer whitespace and internal spaces
            return value.strip()
        return value

    # 2. Field Normalization & Complexity Validator (mode='after'): Runs on typed value
    @field_validator("password")
    @classmethod
    def validate_password_complexity(cls, password: str) -> str:
        if not re.search(r"[A-Z]", password):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[a-z]", password):
            raise ValueError("Password must contain at least one lowercase letter.")
        if not re.search(r"\d", password):
            raise ValueError("Password must contain at least one numeric digit.")
        if not re.search(r"[@$!%*?&#^()_-]", password):
            raise ValueError("Password must contain at least one special character.")
        return password

    # 3. Cross-Field Model Validator (mode='after'): Evaluates relationships across all fields
    @model_validator(mode="after")
    def validate_cross_field_rules(self) -> "UserRegistrationRequest":
        # Rule A: Passwords must match
        if self.password != self.confirm_password:
            raise ValueError("confirm_password does not match password.")

        # Rule B: Booking end_date must be strictly after start_date
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be strictly after start_date.")

        return self


@app.post("/api/v1/register", status_code=status.HTTP_201_CREATED)
async def register_user(payload: UserRegistrationRequest):
    # When execution reaches this point, the data is guaranteed to be 100% valid
    return {
        "status": "success",
        "data": {
            "username": payload.username,
            "email": payload.email,
            "phone_number": payload.phone_number,
            "seats": payload.subscription_seats,
            "duration_hours": (payload.end_date - payload.start_date).total_seconds() / 3600,
        },
    }
```

### Partial Updates (HTTP PATCH) with `model_dump(exclude_unset=True)`

For partial updates, you cannot use the creation schema because missing fields would trigger validation errors. Instead, create an update schema where all fields are optional, and use `exclude_unset=True` to update only the fields the client explicitly provided:

```python
class UserUpdateRequest(BaseModel):
    # Optional fields default to None
    username: str | None = Field(
        default=None,
        min_length=3,
        max_length=30,
        pattern=r"^[a-zA-Z0-9_-]+$"
    )
    phone_number: str | None = Field(
        default=None,
        pattern=r"^\+[1-9]\d{1,14}$"
    )
    subscription_seats: int | None = Field(
        default=None,
        gt=0,
        le=500
    )


@app.patch("/api/v1/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdateRequest):
    # exclude_unset=True only extracts keys sent in the actual HTTP request
    # It differentiates between "field omitted" vs "field sent as null"
    update_data = payload.model_dump(exclude_unset=True)

    if not update_data:
        return {"status": "no_changes_requested"}

    # Pass update_data directly to the database update query
    return {
        "status": "updated",
        "user_id": user_id,
        "fields_modified": list(update_data.keys()),
    }
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the exact sequence of events when FastAPI validates an incoming request body?**

FastAPI follows a strict, deterministic sequence:
1. The ASGI server receives the HTTP request and passes the stream to FastAPI.
2. FastAPI extracts the raw body bytes and deserializes the JSON string into standard Python types (dictionaries and lists).
3. The raw data enters Pydantic V2's Rust validation engine.
4. `@field_validator(mode='before')` methods run first on raw values, enabling string stripping, type casting, or default mutations.
5. Pydantic performs standard type conversion and enforces `Field(...)` constraints (`min_length`, `pattern`, `gt`, `le`).
6. `@field_validator(mode='after')` methods execute on the validated, typed Python values.
7. If all individual fields pass, `@model_validator(mode='after')` executes on the fully instantiated model instance to evaluate cross-field constraints.
8. If any failure occurs at any stage, Pydantic aggregates all errors into a `ValidationError`. FastAPI catches this and responds with HTTP `422 Unprocessable Entity` containing an array of error locations and messages.
9. If all validations pass, the validated Pydantic model is injected into the route handler.

---

**Q: What is the difference between `@field_validator(mode='before')` and `@field_validator(mode='after')` in Pydantic V2?**

The difference lies in **when the validator runs** relative to Pydantic's core type coercion:
- **`mode='before'`:** Receives the **raw, unparsed input** before Pydantic checks types or applies `Field` constraints. The input value can be of any type (e.g. `str`, `int`, `None`, `dict`). Use this mode for sanitization, such as stripping whitespace, parsing comma-separated strings into lists, or converting legacy input formats.
- **`mode='after'` (Default):** Receives the **already-parsed, strongly-typed Python value**. If a field is typed as `datetime`, the validator receives a validated `datetime` object, not a string. Use this mode for domain-specific business rules, regex checks on validated strings, or value normalization (e.g., lowercasing an email).

---

**Q: How do you validate cross-field dependencies, and why can't you use `@field_validator` for them?**

You validate cross-field rules using `@model_validator(mode='after')`. In this mode, the validator receives `self`, which represents the fully constructed model containing every validated field.

You cannot reliably use `@field_validator` for cross-field checks for two reasons:
1. `@field_validator` only inspects one field at a time. In Pydantic V2, it does not have access to other populated model fields in a reliable way.
2. Field execution order is not guaranteed. If field `B` depends on field `A`, and field `A` has not been validated yet (or failed validation), checking them inside a single field validator leads to `KeyError` or invalid state bugs. `@model_validator(mode='after')` guarantees that every single field has already passed its own type and constraint checks before cross-field logic runs.

---

**Q: Should you perform database queries (e.g. checking if an email or SKU exists) inside Pydantic validators?**

No. Pydantic validators should remain **pure, synchronous, CPU-bound functions**. Performing database lookups or HTTP calls inside Pydantic validators is an architectural anti-pattern for three reasons:
1. **Coupling:** It couples your data serialization schema directly to database sessions and network state, making unit testing painful.
2. **Async Blocking:** Pydantic validators run synchronously. If you make a synchronous database query inside a validator on an async FastAPI route, you block the event loop.
3. **Separation of Concerns:** Pydantic handles **syntactic validation** (data shape, types, formats, internal coherence). FastAPI `Depends(...)` or service layers handle **semantic validation** (business rules, database entity existence, authorization, tenant isolation).

---

**Q: How do you handle partial updates (HTTP PATCH) without overwriting omitted fields or forcing clients to send complete records?**

In a PATCH request, all fields must be optional (`field: str | None = None`). When updating the database:
1. Use `payload.model_dump(exclude_unset=True)`.
2. `exclude_unset=True` ensures that the resulting dictionary only includes fields that the client **explicitly included** in the HTTP request payload.
3. This critical distinction prevents two major bugs:
   - It ignores omitted fields so they don't overwrite existing database columns with `None`.
   - It allows the client to explicitly pass `{"bio": null}` if they want to clear an existing value in the database, because `"bio"` was explicitly set in the request.

---

**Q: How does FastAPI aggregate multiple validation errors?**

FastAPI and Pydantic V2 do not fail-fast on the first invalid field. Instead, Pydantic continues validating all remaining fields and collects every violation into a comprehensive error list.

When errors occur, FastAPI automatically serializes this list into an HTTP `422 Unprocessable Entity` response:

```json
{
  "detail": [
    {
      "type": "string_too_short",
      "loc": ["body", "username"],
      "msg": "String should have at least 3 characters",
      "input": "al",
      "ctx": {"min_length": 3}
    },
    {
      "type": "value_error",
      "loc": ["body", "password"],
      "msg": "Value error, Password must contain at least one uppercase letter.",
      "input": "password123"
    }
  ]
}
```

This structured response lets frontend clients display validation errors next to every invalid form input simultaneously in a single round-trip.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Using `exclude_none=True` Instead of `exclude_unset=True` in PATCH Endpoints

**The Wrong Assumption:** Developers often assume `payload.model_dump(exclude_none=True)` is the right way to strip unprovided fields for a database update.

**Why It Fails:** If a user wants to intentionally remove their phone number by sending `{"phone_number": null}`, `exclude_none=True` strips `phone_number` from the update dictionary. The database record is never updated, and the user cannot delete their data.

```python
# WRONG: Cannot clear fields to null
update_data = payload.model_dump(exclude_none=True)

# CORRECT: Updates only what the client sent, allowing explicit nulls
update_data = payload.model_dump(exclude_unset=True)
```

---

### Trap 2: Mutating Pydantic Model Instances and Bypassing Validation

**The Wrong Assumption:** Developers assume that once a Pydantic model is created, updating its attributes will automatically trigger validation.

**Why It Fails:** By default, Pydantic only validates data during initialization. If you modify attributes directly on the model instance, invalid data can sneak into your business logic:

```python
user = UserRegistrationRequest(**valid_data)
user.subscription_seats = -99  # No validation error raised by default!
```

**The Fix:** Enable `validate_assignment=True` in the model configuration if you mutate model instances after creation:

```python
class StrictModel(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    subscription_seats: int = Field(gt=0)
```

---

### Trap 3: Assuming `mode='before'` Receives a Valid String

**The Wrong Assumption:** Writing `@field_validator('name', mode='before')` and immediately calling `.strip()` or string methods without checking the type.

**Why It Fails:** In `mode='before'`, the client might have sent an integer, a boolean, `None`, or a list. Calling `.strip()` directly raises an unhandled `AttributeError`, causing an unexpected `500 Internal Server Error` instead of a clean `422`.

```python
# WRONG: Crashes with 500 if client sends {"name": 12345}
@field_validator("name", mode="before")
@classmethod
def sanitize_name(cls, v):
    return v.strip()

# CORRECT: Safely handles non-string raw inputs
@field_validator("name", mode="before")
@classmethod
def sanitize_name(cls, v):
    if isinstance(v, str):
        return v.strip()
    return v
```

---

### Trap 4: Expecting `@model_validator(mode='after')` to Run When Single Fields Fail

**The Wrong Assumption:** Assuming cross-field validation rules will execute even if individual field types or regex constraints fail.

**Why It Fails:** Pydantic aborts whole-model construction if any individual field validation fails. If `start_date` fails to parse as a valid ISO-8601 timestamp, Pydantic never calls `@model_validator(mode='after')`. Your cross-field validator only executes when every single field is already valid in isolation.

---

## 7. Compare With Related Concepts

| Feature / Concept | Primary Role | Where It Executes | Best Used For |
| :--- | :--- | :--- | :--- |
| **Pydantic `Field(...)`** | Primitive constraints & OpenAPI metadata | Synchronous core Rust layer | Length, ranges (`gt`/`le`), regex patterns, field defaults, schema docs. |
| **`@field_validator`** | Single-field sanitization & custom validation | Python layer (before/after parsing) | Trimming whitespace, casing normalization, password complexity rules. |
| **`@model_validator`** | Cross-field relational validation | Python layer (after all fields parse) | Comparing fields (`password == confirm`), date ranges, conditional requirements. |
| **FastAPI `Depends(...)`** | Contextual logic & async I/O | FastAPI dependency injection pipeline | Database lookups (e.g. checking email uniqueness), auth tokens, permissions. |
| **`Query(...)` / `Path(...)`** | URL parameter validation | Request query/path parser | Single scalar values in GET requests (e.g. pagination `page`, `limit`, UUIDs). |

### Pydantic Validation vs. FastAPI Route Dependencies

- **Pydantic Validation:** Answers the question *"Is this payload internally well-formed, typed, and coherent?"* (CPU-bound, pure, in-memory).
- **FastAPI Dependencies (`Depends`):** Answers the question *"Is this client allowed to do this, and does this record exist in our database?"* (I/O-bound, database queries, authentication).

**Rule of Thumb:** If validation requires checking the shape or internal rules of the data, use **Pydantic**. If validation requires consulting an external source (database, cache, third-party service), use a **FastAPI Dependency**.

---

## 8. 🧠 The Memory Hook

> **Field constraints measure the items, Field Validators sanitize the pieces, and Model Validators verify the puzzle.**
>
> Pydantic guards the gate so your route handlers only deal with clean, guaranteed truth.
