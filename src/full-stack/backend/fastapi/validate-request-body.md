# Validate Request Body

## Detailed explanation

Request body validation uses Pydantic models, constraints, nested schemas, and custom validators. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Validate body before business logic.

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

#### What is the complete request body validation flow in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** When a POST/PUT/PATCH request arrives, FastAPI: (1) reads the raw HTTP body bytes, (2) parses them as JSON into a Python dict, (3) passes the dict to Pydantic's model validator, (4) Pydantic checks each field's type, applies constraints (min_length, pattern, gt/lt), runs custom validators (@field_validator, @model_validator), coerces compatible types, fills defaults, (5) if all fields pass, a validated model instance is passed to the endpoint, (6) if any field fails, Pydantic raises ValidationError with all errors collected, (7) FastAPI catches this and returns 422 with structured error details. The endpoint only runs with fully validated data.
- **The Unforgettable Mental Model:** The **Airport Security Full Scan**. Your luggage (request body) goes through: X-ray (JSON parsing), metal detector (type checking), explosive trace (constraint validation), manual inspection (custom validators). Only cleared luggage reaches the gate (endpoint).
- **The Trap:** Adding manual validation inside the endpoint. Since FastAPI validates before the endpoint runs, any `if not item.name:` check inside the handler is redundant dead code.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI's validation flow is: read body → parse JSON → Pydantic validation (types, constraints, custom validators) → endpoint receives validated model. If validation fails, 422 is returned immediately. This means my endpoint code never sees invalid data — no manual validation needed."

#### How do you validate complex business rules in request bodies?
- **The Engine Mechanism (Why it behaves this way):** For cross-field validation (e.g., "end_date must be after start_date"), use `@model_validator(mode='after')` which receives the fully validated model instance and can raise `ValueError` if business rules are violated. For single-field complex validation, use `@field_validator` with custom logic. For validation that requires database lookups (e.g., "this SKU must exist"), use a dependency that validates after Pydantic parsing — Pydantic handles shape validation, dependencies handle business rule validation.
- **The Unforgettable Mental Model:** The **Two-Stage Inspection**. Stage 1 (Pydantic): does the form look right — all fields filled, correct formats? Stage 2 (custom validators/dependencies): does the content make sense — dates in order, references valid, business rules satisfied?
- **The Trap:** Putting database-dependent validation in Pydantic validators. Pydantic validators should be pure (no I/O). Database lookups belong in dependencies, which have access to the DB session.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use @model_validator for cross-field rules like date ranges, @field_validator for complex single-field rules, and dependencies for database-dependent validation like 'this ID exists'. Pydantic handles shape validation; dependencies handle business rules. This separation keeps validators pure and testable."

#### How do you handle partial updates with request body validation?
- **The Engine Mechanism (Why it behaves this way):** For PATCH endpoints, use a Pydantic model where all fields are optional (`field: str | None = None`). When the client sends only the fields they want to update, Pydantic validates only those fields — missing fields are set to None. The endpoint then updates only the non-None fields. Alternatively, use `model_dump(exclude_unset=True)` to get only the fields the client explicitly sent, distinguishing between "not sent" and "sent as null."
- **The Unforgettable Mental Model:** The **Renovation Plan**. You don't rebuild the entire house (PUT) — you update specific rooms (PATCH). The contractor (endpoint) only works on the rooms you specified, leaving everything else untouched.
- **The Trap:** Using the same model for both POST (create) and PATCH (update). Create requires all fields; update allows partial. Use separate models or make all fields optional with careful None handling.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For PATCH, I use a model with all optional fields (str | None = None). I use model_dump(exclude_unset=True) to distinguish between 'not sent' and 'sent as null'. Only fields the client explicitly sends are updated. I use separate models for create (required fields) and update (all optional)."

#### How do you validate request bodies with file uploads?
- **The Engine Mechanism (Why it behaves this way):** Use `UploadFile` from FastAPI for file parameters. You can combine it with a Pydantic model for JSON fields and `UploadFile` for the file: `def upload(data: ItemCreate = Form(...), file: UploadFile = File(...))`. For pure file uploads, validate file type via `file.content_type`, file size via reading the file or checking headers, and file content via custom validation after reading. Pydantic doesn't validate UploadFile directly — you validate it in the endpoint or a dependency.
- **The Unforgettable Mental Model:** The **Package Inspection**. The form data (Pydantic model) is the shipping label — validated automatically. The file (UploadFile) is the actual package — you need to open it, weigh it, and check its contents manually.
- **The Trap:** Reading the entire file into memory for validation. Large files can cause memory exhaustion. Stream the file or check size headers before reading.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I combine Pydantic models for JSON fields with UploadFile for file data. I validate file type, size, and content in the endpoint or a dependency — Pydantic doesn't validate UploadFile directly. For large files, I stream validation instead of loading everything into memory."

#### How does request body validation interact with dependency injection?
- **The Engine Mechanism (Why it behaves this way):** Dependencies are resolved before the endpoint runs, but the order relative to body validation depends on declaration. Path and query parameters are validated first, then dependencies are resolved, then the body is validated. If a dependency needs access to validated body data, it can declare the body model as its own parameter. More commonly, dependencies validate auth/permissions while Pydantic validates the body — they work in parallel, both completing before the endpoint runs.
- **The Unforgettable Mental Model:** The **Parallel Inspection Lanes**. At customs, one lane checks your passport (dependency/auth), another scans your luggage (body validation). Both must clear before you enter the country (endpoint).
- **The Trap:** Assuming dependencies run after body validation. Dependencies and body validation both complete before the endpoint, but their relative order is implementation-dependent. Don't create dependencies that depend on body data unless explicitly declared.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Dependencies and body validation both complete before the endpoint runs. Dependencies handle auth, permissions, and shared setup; Pydantic handles body shape and type validation. They work in parallel — both must pass for the endpoint to execute. I keep them separate: dependencies for request context, Pydantic for data contracts."

#### What production issues does proper body validation prevent?
- **The Engine Mechanism (Why it behaves this way):** Proper body validation prevents: (1) **Database corruption** — invalid types or missing required fields cause ORM errors or bad data, (2) **Security vulnerabilities** — unexpected input can trigger injection attacks or exploit edge cases, (3) **Application crashes** — type errors (calling methods on None, iterating over non-lists) cause 500 errors, (4) **Inconsistent state** — partial updates with missing fields leave records in invalid states, (5) **Support overhead** — vague "bad request" errors generate support tickets; structured 422 errors tell clients exactly what to fix.
- **The Unforgettable Mental Model:** The **Dam**. Body validation is a dam that holds back a flood of bad data. Without it, invalid data flows into your database, business logic, and responses, causing damage at every level.
- **The Trap:** Assuming validation prevents all security issues. Validation ensures data shape and type, but you still need parameterized queries (ORM), authorization checks, rate limiting, and input sanitization for complete security.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Proper body validation prevents database corruption, type errors, security vulnerabilities from unexpected input, and inconsistent state. The structured 422 responses also reduce support overhead. But validation is just one layer — I also use ORMs for SQL injection prevention, dependencies for authorization, and middleware for rate limiting."

## 8. Active recall test

1. **What happens to the request body before the endpoint runs?**
   - **Explanation:** FastAPI reads the raw body, parses it as JSON, validates it against the Pydantic model (types, constraints, custom validators), and only passes a validated model instance to the endpoint. Invalid bodies get a 422 response.

2. **How do you validate cross-field rules like "end_date > start_date"?**
   - **Explanation:** Use `@model_validator(mode='after')` which receives the validated model instance and can raise ValueError if the cross-field rule is violated.

3. **How do you handle PATCH (partial update) requests?**
   - **Explanation:** Use a model with all optional fields (str | None = None) and `model_dump(exclude_unset=True)` to distinguish between "not sent" and "sent as null". Only update fields the client explicitly sent.

4. **Where should database-dependent validation go?**
   - **Explanation:** In dependencies, not Pydantic validators. Pydantic validators should be pure (no I/O). Dependencies have access to the DB session and can check existence, permissions, etc.

5. **How do you validate file uploads in request bodies?**
   - **Explanation:** Use UploadFile for file parameters. Validate content_type, size, and content in the endpoint or a dependency. Pydantic doesn't validate UploadFile directly.

6. **What production issues does body validation prevent?**
   - **Explanation:** Database corruption, type errors/crashes, security vulnerabilities from unexpected input, inconsistent state from partial updates, and support overhead from vague error messages.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Validate Request Body should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Validate Request Body, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Validate Request Body.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
