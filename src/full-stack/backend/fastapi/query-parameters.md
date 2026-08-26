# Query Parameters in FastAPI: Optional Defaults, `Query()` Validation, and List Collections

## 1. Why This Exists — The Problem First

In raw WSGI/ASGI frameworks like early Flask or raw Starlette, query strings are delivered as an unparsed dictionary of raw strings inside `request.args` or `request.query_params`. When a user requests `GET /items?limit=-100&offset=abc&active=yes&tags=python&tags=fastapi`, the application server receives only text: `{"limit": "-100", "offset": "abc", "active": "yes", "tags": "fastapi"}`.

This raw string parsing creates three dangerous production failure modes:

First, without automatic type coercion and validation, a negative `limit=-100` or a non-numeric `offset=abc` causes an unhandled `ValueError` in your route handler or gets passed directly to your database driver (`LIMIT -100`), crashing the query or causing a 500 internal server error. Even worse, if an attacker sends `limit=50000000`, a missing upper boundary forces the database to scan and serialize millions of rows into server memory, crashing your worker with an Out-of-Memory (OOM) kill.

Second, multi-value query strings are a notorious source of silent data loss. In standard HTTP dictionary lookups, accessing `request.args["tags"]` returns only the last occurrence (`"fastapi"`), silently dropping `"python"`. Unless the engineer remembers to call a specialized framework method like `getlist("tags")` and manually loops through and casts every element, data disappears without throwing an exception.

Third, boolean query string parameters are notoriously inconsistent across client platforms. One frontend client sends `?active=true`, another sends `?active=1`, an iOS app sends `?active=yes`, and a shell script sends `?active=on`. Manually parsing every variation with string comparisons introduces boilerplate bugs across every endpoint.

FastAPI solves these problems at the architectural boundary. By inspecting Python type annotations and the `Query()` metadata class, FastAPI extracts query parameters, coerces data types, enforces numeric and regex boundaries, handles multi-value collections, normalizes boolean representations, and generates OpenAPI documentation before your endpoint logic ever executes. If any parameter fails validation, FastAPI short-circuits the request with a structured `422 Unprocessable Entity` response detailing the exact field and validation error.

## 2. The Analogy — Make It Obvious

Imagine a busy coffee shop with a digital order-taking screen.

The **Path Parameter** is the primary item on the menu: `/drinks/latte` or `/drinks/espresso`. It defines the core identity of the product you are ordering.

The **Query Parameters** are the customizable modifiers on the side ticket: `?shots=2&milk=oat&syrup=vanilla&extra_hot=true&addons=cinnamon&addons=cocoa`.

Here is how the coffee shop expediter (FastAPI) processes your order modifiers:

- **Optional Defaults:** If you do not specify `milk`, the kitchen defaults to `whole_milk`. If you don't specify `shots`, it defaults to `1`.
- **Validation Bounds (`Query(ge=1, le=4)`):** If a customer attempts to order `shots=-5` or `shots=50`, the order terminal immediately beeps and rejects the order at the counter (`422 Unprocessable Entity`). The barista at the espresso machine never even sees the invalid ticket.
- **Collection Modifiers (`list[str]`):** If you request multiple toppings (`addons=cinnamon&addons=cocoa`), the terminal collects them onto a single toppings tray (`['cinnamon', 'cocoa']`) rather than keeping only the cocoa and throwing away the cinnamon.
- **Flexible Switches (Boolean parsing):** Whether you say "yes", "1", or "true" for `extra_hot`, the register recognizes it as an activated switch and turns on the steamer temperature boost.

## 3. How It Actually Works — The Full Explanation

FastAPI uses Python's runtime type introspection (via Pydantic and type annotations) to inspect endpoint function signatures during application startup. It builds an internal routing and parameter resolution map that runs on every incoming HTTP request.

**1. The Parameter Resolution Rules**

When an HTTP request arrives, FastAPI inspects each parameter in your route function to determine where its value must come from:

- If the parameter name matches a placeholder in the route path (such as `{item_id}` in `@app.get("/items/{item_id}")`), it is extracted as a **Path Parameter**.
- If the parameter type is a Pydantic `BaseModel` (or declared with `Body(...)`), it is extracted from the JSON **Request Body**.
- If the parameter is wrapped in `Depends(...)`, it is resolved via the **Dependency Injection** system.
- If the parameter is wrapped in `Header(...)` or `Cookie(...)`, it is extracted from the HTTP headers or cookie jar.
- **Everything else**—any singular scalar parameter (`int`, `str`, `float`, `bool`, `UUID`, `datetime`, `Enum`, or `list` of scalars) not declared in the URL path—is automatically resolved from the URL **Query String**.

**2. Required vs. Optional Query Parameters**

FastAPI determines whether a query parameter is mandatory based on whether a default value is provided in the signature:

- **Optional with a fallback value:** `skip: int = 0`. If the client calls `/items`, `skip` receives `0`.
- **Optional with `None`:** `search: str | None = None` (or `Optional[str] = None`). If omitted, `search` is `None`.
- **Required parameter:** `search: str`. When no default value is assigned, FastAPI marks the parameter as required. If the client calls `/items` without `?search=something`, FastAPI returns HTTP 422.
- **Explicitly Required with `Query(...)`:** When you need validation constraints on a required parameter, you use `Query(...)` (using Python's `...` Ellipsis object) or omit the `default` keyword: `search: str = Query(..., min_length=3)` or `search: Annotated[str, Query(min_length=3)]`.

**3. Validation Constraints with `Query()` and `Annotated`**

The `Query()` function provides rich validation metadata that Pydantic enforces before invoking your handler:

- **Numeric constraints:** `gt` (greater than), `ge` (greater than or equal to), `lt` (less than), `le` (less than or equal to). For example, `limit: int = Query(default=20, ge=1, le=100)` guarantees that your database query will never receive a negative limit or an uncapped limit that exceeds 100.
- **String constraints:** `min_length`, `max_length`, and `pattern` (regular expression). For example, `tracking_code: str = Query(..., min_length=8, max_length=12, pattern=r"^[A-Z0-9]+$")`.
- **Parameter Aliasing:** URL query strings frequently use characters that are invalid in Python variable names (such as hyphens in `?order-by=created_at` or reserved keywords in `?filter=active` or `?from=2026-01-01`). The `alias` parameter bridges this gap: `order_by: str = Query(default="id", alias="order-by")`. FastAPI reads `order-by` from the HTTP query string and assigns it to the `order_by` Python argument.
- **OpenAPI Schema Metadata:** `title`, `description`, `deprecated=True`, and `include_in_schema=False`. Marking `deprecated=True` signals to frontend teams in Swagger UI that the query parameter is slated for removal.

In modern FastAPI (Python 3.9+ / 3.10+), the recommended syntax is `typing.Annotated`, which keeps the default value assignment clean and compatible with standard Python type checkers like MyPy and Pyright:

```python
limit: Annotated[int, Query(ge=1, le=100)] = 20
```

**4. Multi-Value Query Parameters (`list[T]`)**

When an API needs to accept multiple values for the same filter (e.g. filtering a catalog by multiple category tags), declare the parameter as a list:

```python
tags: Annotated[list[str], Query()] = []
```

When a client makes a request using standard repeated keys:
`GET /products?tags=electronics&tags=audio&tags=wireless`

FastAPI extracts all matching keys from the query string and constructs the Python list `["electronics", "audio", "wireless"]`.

Furthermore, FastAPI applies type coercion to every individual element in the collection. If you define `ids: Annotated[list[int], Query()] = []` and receive `?ids=10&ids=20&ids=30`, FastAPI converts each string into an integer, resulting in `[10, 20, 30]`. If any single element cannot be coerced (e.g. `?ids=10&ids=abc`), validation fails with a 422 error indicating the exact index that failed.

**5. Boolean Query Parameter Conversion**

Query strings are always plain text over HTTP. FastAPI contains built-in case-insensitive truth table parsing for `bool` parameters.

When an endpoint defines `is_active: bool = False`:
- **Evaluated as `True`:** `"1"`, `"true"`, `"True"`, `"TRUE"`, `"on"`, `"ON"`, `"yes"`, `"YES"`, `"t"`, `"y"`
- **Evaluated as `False`:** `"0"`, `"false"`, `"False"`, `"FALSE"`, `"off"`, `"OFF"`, `"no"`, `"NO"`, `"f"`, `"n"`
- **Any other string** (e.g., `?is_active=maybe` or `?is_active=2`): Returns `422 Unprocessable Entity`.

If a query parameter is declared as `is_active: bool | None = None`, omitting the parameter from the URL leaves `is_active` as `None`, allowing your database query to distinguish between "filter for active records (`True`)", "filter for inactive records (`False`)", and "do not filter by status (`None`)".

## 4. Real Code — See It Working

Here is a complete, production-grade FastAPI application demonstrating optional defaults, `Annotated[T, Query(...)]` validation, multi-value list extraction, kebab-case aliases, comma-separated parsing, and boolean toggles.

```python
from typing import Annotated
from enum import Enum
from datetime import date
from fastapi import FastAPI, Query, status
from pydantic import BaseModel

app = FastAPI(title="Product Catalog API", version="1.0.0")


class SortOrder(str, Enum):
    ASC = "asc"
    DESC = "desc"


class ProductOut(BaseModel):
    id: int
    name: str
    price: float
    category: str
    in_stock: bool
    tags: list[str]


# In-memory mock database
PRODUCT_DATABASE: list[dict] = [
    {"id": 1, "name": "Mechanical Keyboard", "price": 120.0, "category": "peripherals", "in_stock": True, "tags": ["office", "hardware"]},
    {"id": 2, "name": "Ultra-Wide Monitor", "price": 450.0, "category": "peripherals", "in_stock": False, "tags": ["display", "office"]},
    {"id": 3, "name": "Wireless Ergonomic Mouse", "price": 75.0, "category": "peripherals", "in_stock": True, "tags": ["hardware", "wireless"]},
    {"id": 4, "name": "Python Clean Architecture Book", "price": 40.0, "category": "books", "in_stock": True, "tags": ["education", "python"]},
]


@app.get(
    "/products",
    response_model=list[ProductOut],
    status_code=status.HTTP_200_OK,
    summary="Search, filter, and paginate catalog items",
)
def list_products(
    # 1. Required Query Parameter with regex pattern and length validation
    search: Annotated[
        str | None,
        Query(
            min_length=2,
            max_length=50,
            pattern=r"^[a-zA-Z0-9\s\-]+$",
            description="Search query string matching product name",
            examples=["keyboard"],
        ),
    ] = None,
    # 2. Bounded Numeric Parameters for safe pagination (preventing DoS and negative limits)
    page: Annotated[
        int,
        Query(
            ge=1,
            description="1-based page number",
        ),
    ] = 1,
    page_size: Annotated[
        int,
        Query(
            ge=1,
            le=50,
            alias="page-size",  # Supports kebab-case in URL: ?page-size=20
            description="Number of products per page (max 50)",
        ),
    ] = 10,
    # 3. Enum validation for strict sort ordering
    sort_order: Annotated[
        SortOrder,
        Query(
            alias="sort-order",
            description="Sort direction for pricing",
        ),
    ] = SortOrder.ASC,
    # 4. Multi-value list parameter (?tags=hardware&tags=office)
    tags: Annotated[
        list[str],
        Query(
            description="Filter by one or more tags (repeated in query string)",
            examples=[["hardware", "office"]],
        ),
    ] = [],
    # 5. Tri-state boolean filter: True, False, or None (omitted)
    in_stock_only: Annotated[
        bool | None,
        Query(
            alias="in-stock-only",
            description="Filter by stock availability (accepts true/false/1/0/yes/no)",
        ),
    ] = None,
    # 6. Deprecated query parameter metadata
    legacy_category: Annotated[
        str | None,
        Query(
            alias="cat",
            deprecated=True,
            description="Deprecated category filter. Use tags instead.",
        ),
    ] = None,
):
    results = PRODUCT_DATABASE.copy()

    # Apply search filter
    if search:
        search_lower = search.lower()
        results = [p for p in results if search_lower in p["name"].lower()]

    # Apply multi-value tag filter (match any tag)
    if tags:
        results = [p for p in results if any(tag in p["tags"] for tag in tags)]

    # Apply boolean stock filter
    if in_stock_only is not None:
        results = [p for p in results if p["in_stock"] == in_stock_only]

    # Apply sorting
    reverse = sort_order == SortOrder.DESC
    results.sort(key=lambda p: p["price"], reverse=reverse)

    # Apply safe pagination slice
    start_index = (page - 1) * page_size
    end_index = start_index + page_size
    return results[start_index:end_index]


# Custom helper for APIs that must accept comma-separated list strings: ?tags_csv=python,fastapi,sql
@app.get("/products/by-csv-tags", response_model=list[ProductOut])
def list_products_by_csv_tags(
    raw_tags: Annotated[
        str | None,
        Query(
            alias="tags",
            description="Comma-separated list of tags (e.g., ?tags=office,hardware)",
            examples=["office,hardware"],
        ),
    ] = None,
):
    if not raw_tags:
        return PRODUCT_DATABASE

    # Parse and clean comma-separated values manually
    parsed_tags = {tag.strip() for tag in raw_tags.split(",") if tag.strip()}
    return [p for p in PRODUCT_DATABASE if any(tag in p["tags"] for tag in parsed_tags)]
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does FastAPI determine whether an endpoint function argument is a path parameter, query parameter, or request body?**

FastAPI determines parameter sources by inspecting the route template and type signatures during startup:

1. **Path Parameter:** Any argument whose name appears in the path format string (e.g. `item_id` in `@app.get("/items/{item_id}")`).
2. **Request Body:** Any argument typed as a Pydantic `BaseModel` or explicitly marked with `Body(...)`.
3. **Dependency / Header / Cookie:** Arguments decorated with `Depends(...)`, `Header(...)`, or `Cookie(...)`.
4. **Query Parameter:** All remaining scalar arguments (`int`, `str`, `float`, `bool`, `UUID`, `Enum`, or `list` of scalars) that are not in the URL path.

**Q: What is the exact difference between `q: str | None = None` and `q: str | None` in FastAPI?**

This is one of the most common senior interview traps. 

`q: str | None = None` gives the argument a default value of `None`. The client can completely omit `?q=` from the URL, and FastAPI will pass `q=None` to the handler function.

`q: str | None` (without `= None`) declares a union type with `None`, but **provides no default value**. In FastAPI and Pydantic, a parameter without a default value is **mandatory**. The client must supply `?q=` in the query string. If the client calls the endpoint without `?q=`, FastAPI rejects the request with a `422 Unprocessable Entity` error. Declaring `| None` without `= None` simply means the client is allowed to pass an explicit null/empty value, but the key itself must be present in the request.

**Q: How does FastAPI handle list query parameters, and what happens when a client sends comma-separated values (`?tags=a,b`) vs repeated parameters (`?tags=a&tags=b`)?**

When a parameter is typed as `tags: list[str] = Query(default=[])`, FastAPI expects the standard HTTP multi-key format: `?tags=python&tags=fastapi`. FastAPI extracts all occurrences of `tags` into the Python list `["python", "fastapi"]`.

If a client sends `?tags=python,fastapi` to a `tags: list[str]` parameter, FastAPI treats the entire query value as a single string element, resulting in `["python,fastapi"]` (a list of length 1). FastAPI does not split strings on commas automatically because commas are valid characters within string values. To support comma-separated values, you must accept a string parameter (`raw_tags: str = Query(...)`) and split it yourself, or write a custom reusable dependency validator.

**Q: How do you bind query parameters whose names are invalid Python identifiers (like `user-id` or Python keywords like `from` or `limit`)?**

You use the `alias` argument inside `Query()`. 

Python does not allow hyphens in function argument names (`def get_item(user-id: str)` is a syntax error), nor does it allow using reserved keywords (`from`, `class`, `import`) as argument names without escaping.

By defining:
```python
user_id: Annotated[int, Query(alias="user-id")]
filter_from: Annotated[date, Query(alias="from")]
```
FastAPI reads `?user-id=101&from=2026-01-01` from the incoming HTTP request and passes the parsed values into `user_id` and `filter_from` in your Python handler.

**Q: What happens if a client passes `?active=yes`, `?active=1`, or `?active=off` to a parameter typed as `active: bool`?**

FastAPI uses Pydantic's boolean parser, which evaluates standard truthy and falsy representations case-insensitively:
- `"yes"`, `"1"`, `"true"`, `"on"`, and `"t"` are coerced to Python `True`.
- `"no"`, `"0"`, `"false"`, `"off"`, and `"f"` are coerced to Python `False`.
- Any unrecognized string (such as `?active=maybe` or `?active=2`) fails validation and returns HTTP 422 with a message stating that the input is not a valid boolean.

**Q: Why is it an architectural vulnerability to omit `ge` and `le` on pagination query parameters like `limit` and `offset`?**

If a pagination parameter is defined as `limit: int = 10` without upper bounds, an external caller or malicious actor can issue requests like `GET /users?limit=10000000`. 

The server will execute a database query attempting to fetch, allocate memory for, and serialize ten million Pydantic objects into JSON. This saturates the database connection pool, exhausts server RAM, triggers garbage collection thrashing, and leads to an Out-of-Memory (OOM) crash of the worker process. Enforcing `limit: Annotated[int, Query(ge=1, le=100)] = 20` guarantees that no request can ever force the backend to process more than 100 records per round-trip.

## 6. The Traps — What Goes Wrong

**Trap 1: Assuming `Optional[T]` Makes a Parameter Optional in FastAPI**

*The misconception:* Developers coming from standard Python believe that typing `q: str | None` or `q: Optional[str]` automatically makes the parameter optional in the API.

*What actually happens:* In FastAPI parameter extraction, optionality is governed strictly by the presence of a default value. `q: str | None` without `= None` is treated as a **required** query parameter. If the client omits `?q=`, FastAPI returns a `422 Unprocessable Entity` validation error.

*The fix:* Always provide an explicit default `= None`:
```python
# BROKEN (Requires ?q= in URL):
def search(q: str | None): ...

# CORRECT (Truly optional):
def search(q: str | None = None): ...
```

**Trap 2: Expecting Automatic Comma-Separated List Parsing**

*The misconception:* Developers expect `tags: list[str] = Query(default=[])` to automatically split incoming strings like `?tags=python,fastapi,docker` into `["python", "fastapi", "docker"]`.

*What actually happens:* FastAPI assigns the raw string as the first list item: `["python,fastapi,docker"]`. Database queries using `WHERE tag IN (...)` will fail to match individual tags because they search for the exact literal string `"python,fastapi,docker"`.

*The fix:* If clients send repeated parameters, use `list[str]`. If clients send comma-separated strings, accept a `str` and split it, or use a Pydantic `field_validator` / custom dependency.

**Trap 3: Alias Incompatibilities with Keyword Arguments in Tests**

*The misconception:* When an endpoint uses an alias like `Query(alias="user-id")`, developers try calling the endpoint function directly in unit tests using the Python argument name (`list_items(user_id=123)`).

*What actually happens:* While direct Python calls work if you pass the Python variable name `user_id`, testing via FastAPI's `TestClient` or HTTP requests requires the exact alias string `?user-id=123`. If tests pass `client.get("/items", params={"user_id": 123})`, FastAPI ignores the parameter because it looks for `user-id`.

*The fix:* Ensure all HTTP integration tests and frontend client generators use the exact alias key (`user-id`).

**Trap 4: Mutable Default Argument Myth in `Query(default=[])`**

*The misconception:* In standard Python, using a mutable default argument like `def func(items=[])` creates a shared list across all function invocations. Developers worry that `tags: list[str] = Query(default=[])` will cause request cross-contamination.

*What actually happens:* FastAPI and Pydantic do not use Python's raw default mechanism at runtime. FastAPI treats `Query(default=[])` as a field specification and instantiates a brand-new list for each incoming request. However, to remain completely idiomatic and appease strict linters (like Ruff/Flake8 `B006`), use `Query(default_factory=list)` or `Annotated[list[str], Query()] = []`.

## 7. Compare With Related Concepts

| Dimension | Query Parameters (`Query(...)`) | Path Parameters (`Path(...)`) | Request Body (`Body(...)` / Pydantic Model) | Header Parameters (`Header(...)`) |
| :--- | :--- | :--- | :--- | :--- |
| **HTTP Location** | URL query string after `?` (`/items?limit=10`) | URL path segments (`/items/42`) | HTTP Request Payload (JSON/Form) | HTTP Request Headers (`Authorization: Bearer ...`) |
| **Primary Purpose** | Filtering, pagination, sorting, search modifiers | Resource identification and hierarchical scoping | Creating or updating complex structured entities | Transport metadata, auth tokens, tracing, content types |
| **Size & Limits** | Restricted by browser/server URL length limits (~2KB–8KB) | Restricted by URL path limits | Virtually unlimited (configurable on server, e.g., 10MB–100MB) | Restricted by server header buffer limits (~8KB–16KB) |
| **Visibility & Caching** | Visible in server access logs and browser history; cacheable by CDNs | Visible in server access logs; forms the cache key for GET requests | Hidden from URLs; never logged in standard access logs | Transmitted in HTTP headers; can be omitted from logs for security |
| **Method Support** | Primarily used with `GET`, `DELETE`, `HEAD` | Used across all HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) | Used with `POST`, `PUT`, `PATCH` (not allowed in standard `GET`) | Used across all HTTP methods |
| **Senior Decision Rule** | Use to **modify or filter the view** of a resource collection. | Use to **uniquely locate a specific resource** entity. | Use to **transmit complex, nested, or sensitive state** to the server. | Use for **infrastructure and cross-cutting request metadata** (auth, trace IDs). |

## 8. 🧠 The Memory Hook

**"Path names the room (`/rooms/404`), Body delivers the furniture (`POST` JSON), and Query dials the thermostat and lighting (`?temp=72&dim=true&tags=cozy`)."**

Remember: Any function argument not in the path string automatically becomes a query parameter. Without an explicit `= default` value, it is **required** by default!
