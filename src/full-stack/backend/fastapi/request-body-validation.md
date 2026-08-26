# Request Body Validation in FastAPI: Pydantic Schemas, Nested Payloads, and `Body()` Embeds

## 1. Why This Exists — The Problem First

Imagine building an e-commerce checkout endpoint. The client sends a complex JSON payload containing customer details, a list of purchased items (with product IDs, quantities, and applied discount codes), a nested shipping address, and payment token metadata.

In traditional web frameworks without automated schema validation, your route handler quickly degenerates into an unmaintainable maze of defensive checks:

```python
# The manual validation nightmare before automated schemas
if not request.json or "items" not in request.json:
    return {"error": "Missing items"}, 400
if not isinstance(request.json["items"], list) or len(request.json["items"]) == 0:
    return {"error": "Items must be a non-empty list"}, 400
for idx, item in enumerate(request.json["items"]):
    if "quantity" not in item or not isinstance(item["quantity"], int) or item["quantity"] <= 0:
        return {"error": f"Item at index {idx} has invalid quantity"}, 400
```

When a developer forgets a single check, corrupted data slips past the door. A client submits `{"quantity": -5}` or `{"price": "twenty"}`. The application does not crash immediately at the boundary. Instead, that malformed string travels deep into your business logic, triggers an unhandled `TypeError` inside your database transaction, leaves orphaned payment ledger entries, and blows up as a generic `500 Internal Server Error`.

Even when you do catch errors manually, returning vague `400 Bad Request` messages leaves frontend developers completely blind. If a payload has 40 fields across 3 nested levels, which field failed? What was wrong with it?

FastAPI eliminates this entire class of bugs by placing a strict, automated Pydantic schema validation gate in front of your route handler. If the incoming payload violates the expected schema by even a single nested property, your handler code is never executed. FastAPI immediately halts the request and responds with an HTTP `422 Unprocessable Entity`, providing an exact JSON pointer path—such as `["body", "items", 2, "quantity"]`—telling the client exactly what went wrong, where, and how to fix it.

## 2. The Analogy — Make It Obvious

Think of request body validation as an **Automated Airport Cargo Inspection Scanner**.

When freight carriers deliver shipping containers to an airport hub, cargo regulations demand strict adherence to manifest specifications: every crate must list weight limits, dimensions, hazardous material classifications, and sender identification.

Instead of the airplane pilot or warehouse crew opening every crate by hand inside the cargo hold:
1. **The Blueprint (Pydantic Schema):** The port authority publishes an exact electronic blueprint specifying what valid cargo looks like (e.g., each shipping container must contain a sender profile and a list of itemized crates, with crate weights between 1kg and 500kg).
2. **The Scanner Bay (FastAPI & Pydantic Engine):** Every incoming shipping container passes through a laser scanner at the intake gate before reaching the warehouse floor. The scanner reads the raw cargo structure, measures each crate, checks field types, and recursively scans nested boxes.
3. **The Rejection Manifest (HTTP 422 Response):** If crate #3 in container A is overweight or missing a barcode, the gate diverts the entire container right at the perimeter. The scanner prints a laser-precise rejection manifest: `Container -> Pallet 1 -> Crate 3 -> Weight: Exceeds 500kg limit`.
4. **The Warehouse Floor (Route Handler):** The warehouse team only handles containers that have passed 100% of the scanner checks. Inside the handler, you never need to ask "is this weight a number?" or "does this crate exist?"—it is guaranteed to be clean, typed, and valid.
5. **Multiple Containers vs Single Crate (`Body(embed=True)` vs Top-Level Body):** If the intake rule expects a single loose item, you drop the item on the belt. If the rule says every delivery must be labeled inside a named container (e.g., `{"item": {...}}`), the scanner rejects bare items unless they are properly boxed and labeled.

## 3. How It Actually Works — The Full Explanation

FastAPI combines Python type hints with Pydantic's data-parsing engine to inspect incoming HTTP requests, deserialize JSON payloads into strongly-typed objects, validate field constraints, and document the API contract automatically.

```txt
Incoming HTTP Request (JSON Body)
               │
               ▼
   ASGI Stream Deserialization
               │
               ▼
 FastAPI Parameter Resolution
 (Distinguishes Body from Path/Query via Type Hint)
               │
               ▼
 Pydantic Model Validation & Type Coercion
 ┌───────────────────────────────────────────────┐
 │  Validates:                                   │
 │  - Field types (int, str, UUID, datetime)     │
 │  - Numeric ranges (gt, lt, ge, le)            │
 │  - String patterns (regex, min/max length)    │
 │  - Nested schemas (recursive validation)      │
 │  - Extra fields policy (ignore / forbid)      │
 └──────────────────────┬────────────────────────┘
                        │
         ┌──────────────┴──────────────┐
         │                             │
    [Validation Passed]          [Validation Failed]
         │                             │
         ▼                             ▼
Route Handler Executes       Immediate 422 Response
(Receives Typed Python Objects) (Returns Structured JSON
                              with Exact "loc" Field Paths)
```

### 1. How FastAPI Knows a Parameter is from the Request Body

When FastAPI inspects a route handler signature, it checks the type annotation of each argument:
- If a parameter is a simple type (like `int`, `str`, `float`, `bool`, `UUID`) and is not listed in the URL path template, FastAPI treats it as a **query parameter**.
- If a parameter is annotated with a subclass of Pydantic's `BaseModel` (or wrapped in `Body(...)`), FastAPI automatically knows it must be extracted from the **HTTP request body** parsed from JSON.

```python
@app.post("/items")
def create_item(item: ItemSchema):  # <-- Subclass of BaseModel: read from JSON body
    ...
```

FastAPI reads the raw request byte stream from the ASGI server (Uvicorn), parses the bytes as JSON into a Python dictionary, and hands that dictionary to the Pydantic model for instantiation.

### 2. Type Coercion vs Strict Validation

By default, Pydantic performs smart type coercion:
- If a model expects an `int` and the client sends `"42"` (a string containing digits), Pydantic parses and converts it to the integer `42`.
- If a model expects a `datetime` and the client sends an ISO 8601 string `"2026-08-26T12:00:00Z"`, Pydantic instantiates a real Python `datetime` object.
- If a value cannot be coerced (e.g., `"abc"` for an `int`), validation fails immediately.

If you want to prevent automatic string-to-number coercion, Pydantic V2 allows strict typing using `StrictInt`, `StrictStr`, or setting `model_config = ConfigDict(strict=True)` on the model.

### 3. Single Body vs Multiple Body Parameters vs `Body(embed=True)`

The way you declare parameters in your function signature changes the expected JSON structure:

1. **Single Pydantic Model (Flat Body):**
   ```python
   @app.post("/items")
   def create_item(item: Item):
   ```
   FastAPI expects the JSON body to match `Item` directly at the top level:
   ```json
   { "name": "Mechanical Keyboard", "price": 120.0 }
   ```

2. **Multiple Pydantic Models (Keyed Body):**
   ```python
   @app.post("/items")
   def create_item(user: User, item: Item):
   ```
   FastAPI expects a single JSON body where the top-level keys match the parameter names:
   ```json
   {
     "user": { "username": "alex", "email": "alex@example.com" },
     "item": { "name": "Mechanical Keyboard", "price": 120.0 }
   }
   ```

3. **Single Model with `Body(embed=True)`:**
   When you only have one Pydantic model, but you still want the client to nest it under a key in the JSON payload, use `Body(embed=True)`:
   ```python
   from fastapi import Body

   @app.post("/items")
   def create_item(item: Item = Body(embed=True)):
   ```
   Now the expected JSON body is:
   ```json
   {
     "item": { "name": "Mechanical Keyboard", "price": 120.0 }
   }
   ```

4. **Mixing Pydantic Models with Singular Body Fields:**
   You can combine complex models with individual scalar body values using `Body(...)`:
   ```python
   @app.post("/items")
   def create_item(item: Item, priority: int = Body(gt=0, le=5)):
   ```
   Expected JSON:
   ```json
   {
     "item": { "name": "Keyboard", "price": 120.0 },
     "priority": 1
   }
   ```

### 4. Nested Models and Collections

Pydantic models can nest other Pydantic models to arbitrary depths. When an incoming payload arrives, Pydantic traverses the object tree recursively:
- `shipping_address: Address` validates a nested JSON object.
- `items: list[OrderItem]` validates an array of JSON objects, verifying each element against the `OrderItem` schema.
- `tags: set[str]` validates an array and automatically eliminates duplicates.
- `metadata: dict[str, str]` validates key-value string maps.

If an error occurs deep inside the hierarchy (e.g., the 4th item in a list has a negative price), Pydantic tracks the exact index and field path.

### 5. Handling Extra and Unexpected Fields (`extra='forbid'`)

By default in Pydantic V2, extra fields sent in the request body that are not defined in the model are silently ignored (`extra='ignore'`). They are stripped away and will not appear on the validated model instance.

In security-critical APIs or strict enterprise contracts, allowing client applications to send unknown fields can mask frontend bugs or introduce mass-assignment vulnerabilities. You can configure Pydantic to strictly reject any payload containing unexpected fields:

```python
from pydantic import BaseModel, ConfigDict

class StrictItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    price: float
```

If a client sends `{"name": "Desk", "price": 250.0, "discount": 10}`, FastAPI rejects the request with an `extra_forbidden` validation error.

### 6. Anatomy of an HTTP 422 Validation Error

When validation fails, FastAPI automatically serializes the Pydantic `ValidationError` into a JSON response with status code `422 Unprocessable Entity`:

```json
{
  "detail": [
    {
      "type": "greater_than",
      "loc": ["body", "items", 2, "quantity"],
      "msg": "Input should be greater than 0",
      "input": -5,
      "ctx": {
        "gt": 0
      }
    }
  ]
}
```

Every error object in the `detail` array contains:
- `loc` (Location): A list of path segments showing where the failure occurred. `["body", "items", 2, "quantity"]` points directly to `body -> items array -> index 2 -> quantity field`.
- `msg` (Message): A human-readable description of the validation failure.
- `type` (Error Type): A machine-readable string identifier (e.g., `"greater_than"`, `"missing"`, `"string_type"`, `"value_error"`).
- `input`: The raw value that caused the failure.
- `ctx` (Context): Optional dictionary with constraint parameters, such as the minimum value allowed.

## 4. Real Code — See It Working

Here is a complete, runnable FastAPI application demonstrating nested schemas, field constraints, multiple body parameters, `Body(embed=True)`, and strict extra-field rejection.

```python
from enum import Enum
from typing import Annotated
from uuid import UUID, uuid4
from fastapi import FastAPI, Body, status
from pydantic import BaseModel, Field, EmailStr, ConfigDict

app = FastAPI(title="Order Processing API")


class PaymentMethod(str, Enum):
    CREDIT_CARD = "credit_card"
    BANK_TRANSFER = "bank_transfer"
    CRYPTO = "crypto"


class Address(BaseModel):
    model_config = ConfigDict(extra="forbid")
    street: str = Field(min_length=3, max_length=100)
    city: str = Field(min_length=2, max_length=50)
    postal_code: str = Field(pattern=r"^\d{5}(-\d{4})?$")
    country: str = Field(min_length=2, max_length=2)  # ISO 2-letter country code


class OrderItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_id: UUID
    quantity: int = Field(gt=0, le=100, description="Quantity must be between 1 and 100")
    unit_price: float = Field(gt=0.0, description="Price must be positive")


class CustomerProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: str = Field(min_length=1, max_length=70)
    email: EmailStr
    is_vip: bool = False


# 1. Complex Nested Request Schema
class OrderCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customer: CustomerProfile
    shipping_address: Address
    items: list[OrderItem] = Field(min_length=1, description="Order must contain at least one item")
    payment_method: PaymentMethod
    notes: str | None = Field(default=None, max_length=500)


# Endpoint 1: Standard nested body payload
@app.post("/orders", status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreateRequest):
    # Calculate total safely; all fields are guaranteed valid and typed
    total_amount = sum(item.quantity * item.unit_price for item in payload.items)
    
    order_id = uuid4()
    return {
        "order_id": order_id,
        "customer_email": payload.customer.email,
        "total_amount": round(total_amount, 2),
        "item_count": len(payload.items),
        "status": "confirmed",
    }


# Endpoint 2: Single model embedded under a root key using Body(embed=True)
class AddressUpdate(BaseModel):
    street: str
    city: str
    postal_code: str


@app.put("/orders/{order_id}/shipping-address")
def update_shipping_address(
    order_id: UUID,
    # Forces incoming JSON to be {"address": {"street": "...", ...}}
    address: Annotated[AddressUpdate, Body(embed=True)],
):
    return {
        "order_id": order_id,
        "updated_address": address.model_dump(),
    }


# Endpoint 3: Multiple body parameters + scalar body field
class AuditInfo(BaseModel):
    actor_id: str
    reason: str


@app.post("/orders/{order_id}/cancel")
def cancel_order(
    order_id: UUID,
    # Multiple models in signature force keyed JSON body:
    # {"audit": {...}, "refund_amount": 99.50, "notify_customer": true}
    audit: AuditInfo,
    refund_amount: Annotated[float, Body(gt=0)],
    notify_customer: Annotated[bool, Body()] = True,
):
    return {
        "order_id": order_id,
        "actor": audit.actor_id,
        "refunded": refund_amount,
        "notified": notify_customer,
        "status": "cancelled",
    }
```

### Valid Request Example for `/orders`

```json
{
  "customer": {
    "full_name": "Sarah Connor",
    "email": "sarah.connor@resistance.org",
    "is_vip": true
  },
  "shipping_address": {
    "street": "100 Tech City Blvd",
    "city": "Austin",
    "postal_code": "78701",
    "country": "US"
  },
  "items": [
    {
      "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "quantity": 2,
      "unit_price": 49.99
    }
  ],
  "payment_method": "credit_card",
  "notes": "Please leave package at the front porch."
}
```

### Invalid Request Example and 422 Response

If a client sends an invalid postal code, negative item quantity, and unknown field `"discount"`:

```json
{
  "customer": {
    "full_name": "Sarah Connor",
    "email": "sarah.connor@resistance.org"
  },
  "shipping_address": {
    "street": "100 Tech City Blvd",
    "city": "Austin",
    "postal_code": "INVALID_ZIP",
    "country": "US"
  },
  "items": [
    {
      "product_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "quantity": -3,
      "unit_price": 49.99,
      "discount": 0.10
    }
  ],
  "payment_method": "credit_card"
}
```

FastAPI automatically halts execution and returns HTTP 422 with a structured report:

```json
{
  "detail": [
    {
      "type": "string_pattern_mismatch",
      "loc": ["body", "shipping_address", "postal_code"],
      "msg": "String should match pattern '^\\d{5}(-\\d{4})?$'",
      "input": "INVALID_ZIP",
      "ctx": {
        "pattern": "^\\d{5}(-\\d{4})?$"
      }
    },
    {
      "type": "greater_than",
      "loc": ["body", "items", 0, "quantity"],
      "msg": "Input should be greater than 0",
      "input": -3,
      "ctx": {
        "gt": 0
      }
    },
    {
      "type": "extra_forbidden",
      "loc": ["body", "items", 0, "discount"],
      "msg": "Extra inputs are not permitted",
      "input": 0.1
    }
  ]
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does FastAPI determine whether a route parameter comes from the URL path, query string, or request body?**

FastAPI inspects the parameter name, its type annotation, and its default value during route registration:
1. **Path Parameter:** If the parameter name appears inside the route path template (e.g. `/users/{user_id}`), FastAPI treats `user_id` as a path parameter regardless of type.
2. **Body Parameter:** If the parameter type is a subclass of Pydantic's `BaseModel`, a dataclass, or is explicitly declared using `Body(...)`, FastAPI maps it to the incoming JSON request body.
3. **Query Parameter:** If the parameter is a singular scalar type (like `int`, `str`, `float`, `bool`, `UUID`, `list[str]`) and is not present in the path string, FastAPI defaults to extracting it from the URL query string (`?key=value`).
4. **Header / Cookie / Form / Depends:** If the parameter uses explicit parameter markers like `Header()`, `Cookie()`, `File()`, `Form()`, or `Depends()`, FastAPI binds it to that respective source.

**Q: What is the exact difference between a single Pydantic model parameter and using `Body(embed=True)`?**

When you declare a single Pydantic model in a handler (e.g., `def create_item(item: Item)`), FastAPI expects the JSON payload to match the model's fields at the root of the JSON body: `{"name": "Desk", "price": 100}`. 

When you add `item: Item = Body(..., embed=True)`, you instruct FastAPI to expect the JSON body to be wrapped under a top-level key matching the parameter name: `{"item": {"name": "Desk", "price": 100}}`. 

`Body(embed=True)` is used when API design guidelines require consistent root wrapping for all payloads, or when transitioning a single-model endpoint to accept multiple models in future iterations without breaking the JSON payload contract.

**Q: What happens when an endpoint expects multiple Pydantic models in its signature?**

If a route handler accepts multiple Pydantic models (e.g., `def update(user: User, profile: Profile)`), FastAPI automatically requires the request body to be a JSON object containing keys corresponding to each parameter name:

```json
{
  "user": { "username": "john" },
  "profile": { "bio": "Software Engineer" }
}
```

FastAPI parses the single incoming JSON body, extracts the sub-dictionary under `"user"` for the `User` model, and extracts the sub-dictionary under `"profile"` for the `Profile` model. If either key is missing or malformed, a 422 error is returned.

**Q: How does FastAPI handle validation errors, and how do you customize the 422 error response structure across an entire application?**

When Pydantic fails validation during request parsing, FastAPI catches the `RequestValidationError` (or `pydantic.ValidationError`) before invoking the endpoint function. By default, it serializes the error list into a JSON response with status code 422 and a `"detail"` array containing `loc`, `msg`, `type`, and `input`.

To standardize or customize error responses (e.g., matching an enterprise envelope format like `{"success": false, "errors": [...]}`), you register a custom exception handler on the FastAPI app instance:

```python
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

app = FastAPI()

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    formatted_errors = [
        {
            "field": " -> ".join(str(loc) for loc in err["loc"] if loc != "body"),
            "message": err["msg"],
            "code": err["type"],
        }
        for err in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"success": False, "errors": formatted_errors},
    )
```

**Q: How do you prevent clients from submitting arbitrary or unmapped fields in the request body?**

By default in Pydantic V2, extra fields are ignored and stripped (`extra="ignore"`). To strictly forbid undeclared fields, configure `model_config = ConfigDict(extra="forbid")` on your Pydantic model. 

When `extra="forbid"` is active, any key in the incoming JSON that does not match an explicit model field immediately fails validation with an `extra_forbidden` error. This is crucial for preventing typos in configuration payloads and blocking mass-assignment attacks where attackers attempt to inject fields like `is_admin: true` into general update endpoints.

**Q: Can you validate request body data asynchronously (e.g., checking if a username is already taken in the database during Pydantic validation)?**

No, Pydantic field validators (`@field_validator`) and model validators (`@model_validator`) are synchronous functions. You should never execute blocking database queries or async I/O inside Pydantic validators.

In FastAPI, asynchronous validation against external systems (like databases, Redis, or third-party APIs) belongs in **FastAPI Dependencies (`Depends()`)** or within the **Service Layer**. Pydantic handles structural and syntactic validation (types, formats, ranges, lengths), while FastAPI dependencies and services handle semantic and stateful business validation (existence, uniqueness, authorization).

## 6. The Traps — What Goes Wrong

### Trap 1: Assuming `Optional[str] = None` Allows Any Type
A common misconception is thinking `Optional[str] = None` (or `str | None = None`) makes the field completely unvalidated. It makes the field **optional to provide**, but if the client provides a value, that value **must still be a valid string** (or `null`). If a client sends `{"notes": 12345}`, Pydantic will either attempt coercion or fail validation if strict mode is enabled. It does not mean `Any`.

### Trap 2: The `Body(embed=True)` Contract Mismatch
When developers switch an endpoint from taking multiple scalar fields to a single Pydantic model, they often forget that a single model defaults to expecting a flat JSON body (`{"title": "..."}`). If the frontend was sending `{"article": {"title": "..."}}`, the API will immediately reject the request with `{"loc": ["body", "title"], "msg": "Field required"}` because it looks for `title` at the root. Use `article: Article = Body(embed=True)` to preserve the nested key wrapper.

```python
# BROKEN: Expects {"title": "..."} at root, but client sends {"article": {"title": "..."}}
@app.post("/articles")
def create_article(article: Article):
    ...

# FIXED: Explicitly matches {"article": {"title": "..."}}
@app.post("/articles")
def create_article(article: Annotated[Article, Body(embed=True)]):
    ...
```

### Trap 3: Heavy I/O or Async Calls Inside Pydantic Validators
Placing database calls (e.g., `db.query(User).filter_by(email=value).first()`) inside Pydantic's `@field_validator` is a dangerous anti-pattern. Pydantic validators are strictly synchronous. Running blocking database queries inside them stalls the Python asyncio event loop, severely degrading API throughput under load. Always delegate database existence checks to FastAPI dependencies or service functions.

```python
# DANGEROUS ANTI-PATTERN: Blocking I/O inside Pydantic
class UserCreate(BaseModel):
    email: EmailStr

    @field_validator("email")
    def check_unique(cls, v):
        # STALLS THE EVENT LOOP! DO NOT DO THIS!
        if sync_database_check_email_exists(v):
            raise ValueError("Email already registered")
        return v
```

### Trap 4: Reusing Database ORM Models Directly as Request Body Schemas
Directly exposing database ORM models (e.g., SQLAlchemy or Tortoise models) as request bodies in route handlers creates severe security vulnerabilities:
- **Mass Assignment:** A malicious client can pass `is_superuser=True`, `verified=True`, or internal foreign keys in the request body.
- **Leaked Internals:** Changes to database column names immediately break the public API contract.
- **Validation Coupling:** Database column types cannot represent complex input validation constraints like regex patterns, password confirmation matching, or custom parsing.

Always maintain dedicated Pydantic input schemas (e.g., `UserCreate`, `UserUpdate`) completely decoupled from internal database models.

### Trap 5: Mutable Default Values in Field Declarations
In Python, mutable default arguments in functions are evaluated once. In Pydantic models, declaring `tags: list[str] = []` is technically handled by Pydantic V2, but the standard and robust pattern for dynamic defaults is using `Field(default_factory=list)` or `Field(default_factory=dict)` to guarantee an isolated instance is generated for every validated request.

```python
# Fragile / Non-idiomatic
class Post(BaseModel):
    tags: list[str] = []

# Idiomatic & Safe
class Post(BaseModel):
    tags: list[str] = Field(default_factory=list)
```

## 7. Compare With Related Concepts

| Feature / Concept | FastAPI Request Body Validation | Query / Path Parameter Validation | Database ORM Models (SQLAlchemy) | Manual Dict Parsing (`request.json`) |
| :--- | :--- | :--- | :--- | :--- |
| **Data Source** | HTTP Request Body (`application/json`) | URL Path segments (`/items/{id}`) and Query String (`?page=1`) | Database tables / Rows / Records | Raw parsed JSON dictionary |
| **Tooling / Engine** | Pydantic `BaseModel` & `Body()` | Pydantic types, `Query()`, `Path()` | SQLAlchemy / SQLModel / Peewee ORM | Plain Python standard library / dict methods |
| **Payload Structure** | Hierarchical, nested objects, lists, complex types | Flat scalar types, simple lists of primitives | Relational tables, foreign keys, columns | Untyped nested dictionaries and lists |
| **Validation Timing** | At request intake, before handler execution | At request intake, before handler execution | During database session commit / flush | Inside the route handler function body |
| **Error Handling** | Automatic HTTP 422 with precise `loc` pointers | Automatic HTTP 422 with parameter location | Database exceptions (`IntegrityError`), HTTP 500 if unhandled | Manual `if/else` checks returning manual HTTP 400 |
| **OpenAPI Docs** | Generates interactive JSON Schema in `/docs` | Generates query/path parameter docs in `/docs` | No API documentation generation | No automated documentation |

### When to Use Which:
- **Use Pydantic Request Body (`BaseModel`):** For all state-changing operations (`POST`, `PUT`, `PATCH`) that send complex, structured, or nested data.
- **Use `Query()` / `Path()`:** For resource identification (`/users/{id}`) and read-only filtering, sorting, or pagination (`/items?limit=20&sort=desc`).
- **Use `Body(embed=True)`:** When an endpoint accepts a single model but your API design requires a named wrapper key in the JSON body.
- **Use `ConfigDict(extra='forbid')`:** On public-facing or security-critical mutation schemas where unexpected attributes must be rejected immediately.

## 8. 🧠 The Memory Hook

> **The Blueprint at the Gate:** Pydantic is your intake scanner. If the incoming payload deviates from the blueprint by even a single nested property, FastAPI rejects it at the perimeter with an exact 422 coordinate map—your business logic only ever touches clean, typed, and guaranteed data.

