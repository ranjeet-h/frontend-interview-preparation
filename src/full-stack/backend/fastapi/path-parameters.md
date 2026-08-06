# Path Parameters

## Detailed explanation

Path parameters capture values from the URL path and validate them with type hints. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Path params identify a specific resource.

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

#### What are path parameters in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Path parameters capture values from the URL path using `{name}` syntax in the route decorator. FastAPI extracts the value from the URL, validates it against the type annotation in the function signature, and passes it as a keyword argument. For example, `@app.get("/items/{item_id}")` with `def get_item(item_id: int)` extracts `item_id` from the URL, converts it to an integer, and validates it. If the conversion fails (e.g., `/items/abc`), FastAPI returns a 422 error. Path parameters are always required — they're part of the URL structure.
- **The Unforgettable Mental Model:** The **Address Label**. The URL path is like a mailing address — the street number (item_id) tells the post office (FastAPI) exactly which house (resource) to deliver to. If the number is invalid, the mail can't be delivered.
- **The Trap:** Using path parameters for optional data. Path parameters are part of the URL structure and are always required. Use query parameters for optional filters.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Path parameters capture values from the URL path using {name} syntax. FastAPI extracts, type-converts, and validates them before calling the endpoint. They're always required — part of the URL structure. I use them for resource identifiers like item_id, user_id, or slug."

#### How does FastAPI validate and convert path parameter types?
- **The Engine Mechanism (Why it behaves this way):** FastAPI uses the type annotation to validate and convert path parameters. For `item_id: int`, it attempts to convert the string from the URL to an integer. If successful, the endpoint receives an `int`. If not (e.g., the URL contains letters), FastAPI returns a 422 error. Supported types include `int`, `float`, `bool`, `str`, `UUID`, `date`, `datetime`, `enum.Enum` subclasses, and custom types with Pydantic validators. For enums, FastAPI validates that the value is one of the enum members and returns the enum instance.
- **The Unforgettable Mental Model:** The **Shape Sorter**. Each path parameter is a shape that must fit through a specific hole (type). Circle (int) goes through the circle hole, square (str) through the square hole. If the shape doesn't fit, it's rejected with an explanation.
- **The Trap:** Assuming all string-to-type conversions are safe. `int("99999999999999999999999999")` works but may cause issues downstream. Always validate ranges with constraints.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI converts path parameters to their annotated types — int, float, bool, UUID, enum, etc. If conversion fails, it returns 422. I use enum types for constrained values (like status=active|inactive) and UUID types for opaque identifiers. For integers, I add range constraints with Path(gt=0)."

#### How do you add constraints to path parameters?
- **The Engine Mechanism (Why it behaves this way):** Use the `Path()` function from FastAPI to add constraints: `item_id: int = Path(gt=0, description="The ID of the item")`. Constraints include `gt`, `ge`, `lt`, `le` for numerics, `min_length`, `max_length`, `pattern` (regex) for strings, and `title`, `description`, `examples` for documentation. The `Path()` function is the first positional argument after the type annotation. For Python 3.9+, you can use `Annotated[int, Path(gt=0)]` for cleaner syntax.
- **The Unforgettable Mental Model:** The **Gatekeeper Rules**. The gatekeeper (Path()) doesn't just check if you have an ID — it checks if the ID is positive, within range, and matches the expected format. Invalid IDs are turned away at the gate.
- **The Trap:** Forgetting that `Path()` must be the default value in the function signature. `item_id: int = Path(gt=0)` is correct; `item_id: Path(gt=0) = int` is not.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use Path() to add constraints like gt=0 for positive IDs, pattern for format validation, and description for docs. I prefer Annotated syntax when possible: item_id: Annotated[int, Path(gt=0)]. This keeps the type annotation clean and constraints separate."

#### Can path parameters contain slashes?
- **The Engine Mechanism (Why it behaves this way):** By default, path parameters do not match slashes — `/items/a/b` would not match `/items/{item_id}` because the slash is a path separator. To capture paths with slashes, use a catch-all pattern: `/items/{item_id:path}`. The `:path` converter tells FastAPI to match everything including slashes. This is useful for file paths, proxy routes, or hierarchical identifiers. The captured value includes the slashes (e.g., `item_id="a/b"`).
- **The Unforgettable Mental Model:** The **Folder Path**. Normal path params are like a single filename. The `:path` converter is like a full directory path — it captures everything, including subdirectories (slashes).
- **The Trap:** Using `:path` when you don't need it. Catch-all paths can shadow more specific routes. Always define specific routes before catch-all patterns.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: By default, path params don't match slashes. To capture paths with slashes, I use the :path converter: {item_id:path}. This is useful for file serving or proxy routes. But I'm careful with route ordering — catch-all paths can shadow specific routes if defined first."

#### How do you use enum types for path parameters?
- **The Engine Mechanism (Why it behaves this way):** Define a Python `enum.Enum` subclass with allowed values, then use it as the type annotation: `class ModelName(str, Enum): alexnet = "alexnet"; resnet = "resnet"`. In the route: `@app.get("/models/{model_name}")` with `def get_model(model_name: ModelName)`. FastAPI validates that the URL value matches one of the enum members, converts it to the enum instance, and includes the allowed values in the OpenAPI schema. Invalid values return 422 with a list of allowed options.
- **The Unforgettable Mental Model:** The **Menu Card**. The enum is the menu — only listed items are available. If a customer orders something not on the menu, the waiter says "we only serve these items" (422 with allowed values).
- **The Trap:** Not inheriting from `str` in string enums. Without `str` inheritance, the enum value in the URL won't match correctly. Always use `class MyEnum(str, Enum)` for string-based enums.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use enum.Enum subclasses for path parameters with a fixed set of values. For string enums, I inherit from both str and Enum so the values match URL strings correctly. FastAPI validates against the enum members and includes allowed values in the OpenAPI docs."

#### How do path parameters differ from query parameters?
- **The Engine Mechanism (Why it behaves this way):** Path parameters are part of the URL path (`/items/42`) and identify a specific resource. They are always required and have a fixed position in the URL. Query parameters are optional key-value pairs after the `?` (`/items?category=books&sort=price`) and filter, sort, or paginate results. Path parameters use `{name}` syntax in the route; query parameters are function parameters without `Path()`, `Body()`, or `Depends()`. Semantically, path params identify "which resource" and query params specify "how to process it."
- **The Unforgettable Mental Model:** The **Library Catalog**. Path params are the book's shelf location (Aisle 3, Shelf 2, Book 42) — precise and required. Query params are the search filters (genre=mystery, year>2020, sort=rating) — optional and flexible.
- **The Trap:** Using path parameters for filters. `/items/books` suggests "books" is a resource identifier, not a filter. Use `/items?category=books` for filtering.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Path parameters identify a specific resource and are required — they're part of the URL structure. Query parameters filter, sort, or paginate results and are optional. I use path params for resource IDs and query params for search criteria. This follows REST conventions and makes APIs intuitive."

## 8. Active recall test

1. **What happens if a path parameter type conversion fails?**
   - **Explanation:** FastAPI returns a 422 error with a validation error message. The endpoint function is never called.

2. **How do you make a path parameter accept values with slashes?**
   - **Explanation:** Use the `:path` converter: `{param_name:path}`. This matches everything including slashes, useful for file paths or proxy routes.

3. **How do you constrain a path parameter to be a positive integer?**
   - **Explanation:** Use `item_id: int = Path(gt=0)` or `item_id: Annotated[int, Path(gt=0)]`. This rejects zero and negative values with a 422 error.

4. **Why should enum path params inherit from str?**
   - **Explanation:** Without str inheritance, the enum's value won't match the string from the URL correctly. `class MyEnum(str, Enum)` ensures proper string comparison.

5. **When should you use path parameters vs query parameters?**
   - **Explanation:** Path parameters identify a specific resource (required, part of URL structure). Query parameters filter, sort, or paginate results (optional, after the ?).

6. **What types does FastAPI support for path parameters?**
   - **Explanation:** int, float, bool, str, UUID, date, datetime, enum.Enum subclasses, and any Pydantic-compatible type with custom validators.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Path Parameters should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Path Parameters, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Path Parameters.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
