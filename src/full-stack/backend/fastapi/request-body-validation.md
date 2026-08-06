# FastAPI Request Body Validation

## Detailed explanation

FastAPI validates request bodies by parsing JSON into Pydantic models and returning structured validation errors. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Typed models become API input validation.

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

#### How does FastAPI validate request bodies?
- **The Engine Mechanism (Why it behaves this way):** When a route parameter is annotated with a Pydantic model (e.g., `def create(item: Item)`), FastAPI automatically treats it as a request body. It reads the raw HTTP body, parses it as JSON, and passes the resulting dict to Pydantic for validation. Pydantic checks each field against type annotations and constraints, coerces compatible types, and either returns a validated model instance or raises `ValidationError`. FastAPI catches validation errors and returns a 422 response with a structured error body listing every validation failure.
- **The Unforgettable Mental Model:** The **Customs Declaration**. You submit a form (JSON body). The customs officer (Pydantic) checks every item: is it declared correctly (type)? Is it within limits (constraints)? Is anything prohibited (custom validators)? If everything passes, you proceed. If not, you get a detailed list of violations.
- **The Trap:** Assuming the endpoint runs even with invalid data. If Pydantic validation fails, the endpoint function is never called — the 422 response is returned immediately.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI validates request bodies by parsing JSON into Pydantic models before the endpoint runs. If validation fails, FastAPI returns a 422 response with structured error details and never calls the endpoint. This means business logic only ever receives valid, typed data — no manual validation needed inside the handler."

#### What happens when request body validation fails?
- **The Engine Mechanism (Why it behaves this way):** When Pydantic raises `ValidationError`, FastAPI catches it and returns an HTTP 422 (Unprocessable Entity) response with a JSON body containing: `detail` — a list of error objects, each with `loc` (location path like `["body", "name"]`), `msg` (human-readable error message), `type` (error type like `string_type`, `missing`, `greater_than`), and optionally `ctx` (context with constraint values). The endpoint function is never executed. This structured error format allows frontend clients to display field-specific error messages.
- **The Unforgettable Mental Model:** The **Graded Exam**. Instead of just saying "fail," the examiner returns a marked paper showing exactly which questions were wrong, what the correct answer should be, and why. The student knows precisely what to fix.
- **The Trap:** Returning generic "bad request" errors instead of leveraging FastAPI's structured 422 responses. The default error format is frontend-friendly — don't override it with vague messages.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI returns a 422 response with a detail array containing loc, msg, and type for each validation error. The loc field shows the exact path to the failing field, which frontend forms can use to highlight specific inputs. I never suppress these errors — they're the contract between backend and frontend."

#### How do you add constraints to request body fields?
- **The Engine Mechanism (Why it behaves this way):** Pydantic's `Field()` function adds constraints to model fields: `min_length`, `max_length`, `gt`, `ge`, `lt`, `le`, `pattern` (regex), `min_items`, `max_items`, and more. You can also use `Annotated` with constraint types: `Annotated[str, Field(min_length=3, max_length=50)]`. Pydantic validates these constraints during parsing and includes them in error messages. Custom validation uses `@field_validator` for single-field logic and `@model_validator` for cross-field logic.
- **The Unforgettable Mental Model:** The **Recipe Requirements**. A recipe doesn't just say "add flour" — it says "add 200-250g of sifted flour." Constraints are the measurement ranges that ensure the result is correct every time.
- **The Trap:** Using Python assertions for validation. `assert len(name) > 0` is stripped in optimized Python (`python -O`) and doesn't produce structured API errors. Always use Pydantic constraints.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use Pydantic's Field() function for constraints like min_length, max_length, pattern, and numeric ranges. For complex rules, I use @field_validator or @model_validator. These constraints are enforced at parse time and produce structured 422 errors — no manual if/else validation code needed."

#### Can you validate optional request body fields?
- **The Engine Mechanism (Why it behaves this way):** Yes — using `Optional[T]` or `T | None` with a default value of `None`. Pydantic treats these fields as optional: if the key is missing from the JSON body, the field is set to `None` (or the specified default). If the key is present but the value is the wrong type, validation still fails. You can also use `Field(default=None)` with constraints that only apply when the value is present. For fields that can be omitted entirely (not sent in JSON) vs. explicitly set to null, use `...` (Ellipsis) for required fields and `None` for optional.
- **The Unforgettable Mental Model:** The **Optional Toppings**. A pizza order requires a base (required field). Toppings are optional — you can skip them (field absent), choose none (explicit null), or pick specific ones (provided value). The kitchen handles all three cases.
- **The Trap:** Confusing `Optional[str]` with "accepts any value." `Optional[str]` means the field can be missing or null, but if provided, it must be a string. `Optional[str] = None` is not the same as `Any`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use Optional[T] with a default of None for optional fields. The field can be omitted from the JSON body or explicitly set to null. If provided, it must match the type T. I also use Field(default=None) to add constraints that only apply when a value is present."

#### How do you handle nested request body validation?
- **The Engine Mechanism (Why it behaves this way):** Define nested Pydantic models as field types. When FastAPI parses the request body, Pydantic recursively validates each nested model. For example, `Order` with `items: list[OrderItem]` validates the order structure and each item within it. Validation errors include the full path: `["body", "items", 2, "quantity"]` points to the quantity field of the third item. This enables complex, hierarchical API contracts with comprehensive error reporting at every level.
- **The Unforgettable Mental Model:** The **Building Inspection**. The inspector checks the building (top-level model), then each floor (nested models), then each room (nested fields). The report says exactly which building, floor, and room has a code violation.
- **The Trap:** Over-nesting request bodies. More than 3 levels of nesting makes the API hard to use and errors hard to parse. Consider splitting into multiple endpoints or flattening the schema.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I define nested Pydantic models as field types, and Pydantic validates recursively with full error paths. I keep nesting to 2-3 levels — beyond that, I split into separate endpoints. Deep nesting makes the API contract hard to understand and validation errors hard for frontend to display."

#### How does request body validation affect production reliability?
- **The Engine Mechanism (Why it behaves this way):** Request body validation is the first line of defense against bad data. By validating at the API boundary, you prevent: (1) invalid data reaching the database (corruption), (2) type errors in business logic (crashes), (3) security issues from unexpected input (injection), (4) inconsistent state from partial updates. The structured 422 responses also reduce support tickets — clients know exactly what to fix instead of getting generic "server error" responses.
- **The Unforgettable Mental Model:** The **Firewall**. Request body validation is a firewall that blocks malformed data before it reaches your application's internal systems. Better to reject at the gate than deal with damage inside.
- **The Trap:** Assuming validation replaces all security checks. Validation ensures data shape and type, but you still need authorization checks, business rule validation, and SQL injection prevention (handled by ORMs).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Request body validation is the first security and reliability layer. It prevents invalid data from reaching the database or business logic, eliminates type errors, and provides structured error responses that reduce support overhead. Combined with authorization checks and ORM parameterization, it creates a defense-in-depth strategy."

## 8. Active recall test

1. **When does FastAPI validate the request body?**
   - **Explanation:** Before the endpoint function is called. FastAPI parses JSON, validates against the Pydantic model, and only calls the endpoint if validation succeeds. Failed validation returns 422 immediately.

2. **What HTTP status code does FastAPI return for validation errors?**
   - **Explanation:** 422 Unprocessable Entity. The response body contains a detail array with loc, msg, and type for each validation error.

3. **How do you make a request body field optional?**
   - **Explanation:** Use `Optional[T]` or `T | None` with a default value of `None`. The field can be omitted from the JSON or set to null. If provided, it must match type T.

4. **What does the loc field in a validation error contain?**
   - **Explanation:** The path to the failing field, e.g., ["body", "items", 2, "quantity"] for the quantity field of the third item in a nested list.

5. **How do you add a regex constraint to a string field?**
   - **Explanation:** Use `Field(pattern=r"^...$")` in the model field definition, e.g., `email: str = Field(pattern=r"^[^@]+@[^@]+\.[^@]+$")`.

6. **Why is request body validation important for security?**
   - **Explanation:** It prevents malformed or malicious data from reaching business logic and the database. While it doesn't replace authorization or SQL injection prevention, it's the first defense layer against bad input.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

FastAPI Request Body Validation should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain FastAPI Request Body Validation, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define FastAPI Request Body Validation.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
