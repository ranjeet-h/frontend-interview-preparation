# Query Parameters

## Detailed explanation

Query parameters capture optional URL filters, pagination, and sorting values. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Query params shape list and read behavior.

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

#### What are query parameters in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Query parameters are key-value pairs appended to the URL after `?` (e.g., `/items?skip=0&limit=10`). In FastAPI, any function parameter that is not a path parameter, body parameter, or dependency is automatically treated as a query parameter. FastAPI extracts the value from the query string, validates it against the type annotation, applies defaults if the parameter is missing, and passes it to the endpoint. Query parameters are optional by default when a default value is provided, and required when no default is given.
- **The Unforgettable Mental Model:** The **Remote Control**. The URL path is the TV (the resource), and query parameters are the remote control buttons — volume (limit), channel (category), brightness (sort). They adjust how you experience the content without changing what the content is.
- **The Trap:** Making query parameters required without a default. A required query parameter means the endpoint cannot be called without it, which may break clients that expect optional filtering.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Query parameters are function parameters that FastAPI extracts from the URL's query string. They're optional when a default is provided and required when no default exists. I use them for filtering, sorting, and pagination — never for resource identification, which is what path parameters are for."

#### How do you make query parameters optional?
- **The Engine Mechanism (Why it behaves this way):** A query parameter is optional when the function parameter has a default value. `skip: int = 0` means the client can omit `skip` from the URL and FastAPI will use 0. `category: str | None = None` means the parameter can be omitted or explicitly set to null (no value after `=`). `category: str = Query(default=None)` is the explicit form. Without a default, the parameter is required and FastAPI returns a 422 error if it's missing.
- **The Unforgettable Mental Model:** The **Default Settings**. Like a phone's default ringtone — if you don't change it, the default applies. If you explicitly set it to "silent" (None), that's a conscious choice. If the phone requires a ringtone (no default), you must pick one.
- **The Trap:** Using `Optional[str]` without a default value. `category: Optional[str]` is still required — the client must provide a value (which can be null). Use `Optional[str] = None` to make it truly optional.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I make query parameters optional by providing a default value. skip: int = 0 means the client can omit it. category: str | None = None means it can be omitted or set to null. I always provide sensible defaults so clients aren't forced to specify every parameter."

#### How do you handle list query parameters?
- **The Engine Mechanism (Why it behaves this way):** Use `list[T]` as the type annotation: `categories: list[str] = Query(default=[])`. FastAPI parses repeated query parameters (`?categories=books&categories=electronics`) into a list. You can also use `Query(default=None)` with `list[str] | None` for optional lists. For comma-separated values in a single parameter (`?categories=books,electronics`), use a custom parser with `Annotated` and a validator, or accept a string and split it manually.
- **The Unforgettable Mental Model:** The **Shopping List**. Instead of making one trip per item, you write all items on a single list. The store (FastAPI) reads the list and gathers everything at once.
- **The Trap:** Assuming comma-separated values are automatically parsed into lists. FastAPI parses repeated parameters (`?a=1&a=2`) into lists, not comma-separated values (`?a=1,2`). For comma-separated, you must parse manually.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For list query params, I use list[str] type annotation. FastAPI parses repeated parameters into a list: ?tags=python&tags=fastapi becomes ['python', 'fastapi']. For comma-separated values, I parse manually with a validator. I always cap the list length to prevent abuse."

#### How do you add validation to query parameters?
- **The Engine Mechanism (Why it behaves this way):** Use the `Query()` function from FastAPI to add constraints: `skip: int = Query(default=0, ge=0)`, `limit: int = Query(default=10, ge=1, le=100)`, `search: str = Query(default=None, min_length=1, max_length=100)`. Constraints include `gt`, `ge`, `lt`, `le` for numerics, `min_length`, `max_length`, `pattern` for strings. You can also use `Annotated` syntax: `skip: Annotated[int, Query(ge=0)] = 0`. Invalid values return 422 with detailed error messages.
- **The Unforgettable Mental Model:** The **Speed Bumps**. Query parameter constraints are like speed bumps on a road — they prevent clients from going too fast (large limits), going backwards (negative skips), or entering restricted areas (invalid patterns).
- **The Trap:** Not capping numeric query parameters. An uncapped `limit` parameter can be set to millions, causing memory exhaustion. Always set a maximum with `le` or `le`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use Query() to add constraints like ge=0 for non-negative values, le=100 for maximum limits, and pattern for format validation. I always cap pagination limits and validate search string lengths. These constraints protect the server from abuse and provide clear error messages to clients."

#### How do query parameters affect OpenAPI documentation?
- **The Engine Mechanism (Why it behaves this way):** FastAPI automatically documents query parameters in the OpenAPI schema with their type, default value, required status, and constraints. The `Query()` function's `description`, `title`, `examples`, and `deprecated` parameters are included in the schema. Swagger UI displays query parameters as input fields with type validation, default values pre-filled, and constraint hints. `enum` types render as dropdowns. This makes the API self-documenting — frontend developers can explore and test endpoints without reading separate documentation.
- **The Unforgettable Mental Model:** The **Control Panel Labels**. Each button on a control panel has a label explaining what it does, its range, and its default setting. Query parameters in Swagger UI are the same — labeled, constrained, and ready to use.
- **The Trap:** Not adding descriptions to query parameters. Without descriptions, clients must guess what each parameter does. Always add `description="..."` to Query() for clarity.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI documents query parameters automatically with type, defaults, and constraints. I add descriptions to Query() calls so Swagger UI shows helpful text. Enum types render as dropdowns, and constraints show as validation hints. This makes the API self-documenting for frontend developers."

#### How do you handle boolean query parameters?
- **The Engine Mechanism (Why it behaves this way):** Use `bool` as the type annotation: `include_deleted: bool = False`. FastAPI accepts several truthy values (`true`, `True`, `TRUE`, `1`, `yes`, `on`) and falsy values (`false`, `False`, `FALSE`, `0`, `no`, `off`). The conversion is case-insensitive. If the parameter is omitted, the default value is used. For explicit presence/absence (not true/false), use `bool | None = None` — the parameter is `True` if present (even without a value), `False` if absent, and `None` if explicitly not provided.
- **The Unforgettable Mental Model:** The **Light Switch**. `true`/`false` is like a standard switch — on or off. But FastAPI also understands "yes", "1", "on" as on, and "no", "0", "off" as off — like different languages for the same switch.
- **The Trap:** Assuming only "true" and "false" work. FastAPI accepts many truthy/falsy representations. If you need strict "true"/"false" only, use a string parameter with validation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI accepts multiple truthy/falsy representations for bool query params — true/false, 1/0, yes/no, on/off. I use bool with a default for simple toggles. If I need strict parsing, I use a string with pattern validation. I always document the accepted values in the parameter description."

## 8. Active recall test

1. **How does FastAPI distinguish query parameters from other parameters?**
   - **Explanation:** Any function parameter that is not a path param, body param (Pydantic model), or dependency (Depends()) is automatically treated as a query parameter.

2. **How do you make a query parameter optional?**
   - **Explanation:** Provide a default value: `skip: int = 0` or `category: str | None = None`. Without a default, the parameter is required.

3. **How does FastAPI parse list query parameters?**
   - **Explanation:** Repeated parameters (`?a=1&a=2`) are parsed into a list when typed as `list[T]`. Comma-separated values (`?a=1,2`) must be parsed manually.

4. **Why should you cap query parameter limits?**
   - **Explanation:** To prevent abuse — an uncapped limit can cause memory exhaustion and slow responses. Use `le=100` or similar to enforce a maximum.

5. **What truthy values does FastAPI accept for bool query params?**
   - **Explanation:** true, True, TRUE, 1, yes, on (and their falsy counterparts: false, False, FALSE, 0, no, off). Case-insensitive.

6. **How do you add a description to a query parameter in the docs?**
   - **Explanation:** Use `Query(description="...")`: `skip: int = Query(default=0, ge=0, description="Number of items to skip")`.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Query Parameters should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Query Parameters, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Query Parameters.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
