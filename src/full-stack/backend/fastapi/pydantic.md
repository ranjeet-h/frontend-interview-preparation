# Pydantic

## Detailed explanation

Pydantic validates and serializes data using Python type hints and models. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Pydantic turns type hints into runtime data contracts.

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

#### What is Pydantic and why does FastAPI use it?
- **The Engine Mechanism (Why it behaves this way):** Pydantic is a data validation library that uses Python type hints to define data schemas. When you define a `BaseModel` with typed fields, Pydantic parses incoming data (dicts, JSON, ORM objects), validates types, applies constraints, coerces compatible values (e.g., string "42" to int 42), and produces a validated model instance. FastAPI uses Pydantic for request body parsing, query/path parameter validation, and response serialization. Pydantic v2 uses `pydantic-core`, a Rust-based engine, for high-performance validation.
- **The Unforgettable Mental Model:** The **Bouncer at the Club**. Pydantic checks everyone's ID (data) at the door. If the ID matches the dress code (type hints), they get in and get a wristband (validated model). If not, they get a detailed rejection slip (validation error) explaining exactly what's wrong.
- **The Trap:** Thinking Pydantic is just type hints. Type hints alone are ignored at runtime by Python. Pydantic actively parses, coerces, and validates data against those hints — it's runtime enforcement, not static analysis.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Pydantic is a data validation library that uses Python type hints as runtime contracts. FastAPI uses it to parse and validate all incoming request data, and to serialize outgoing responses. Pydantic v2's Rust-based core makes validation extremely fast, and its constraint system (min_length, regex, gt/lt) eliminates manual validation code."

#### How does Pydantic validate data?
- **The Engine Mechanism (Why it behaves this way):** When you call `Model(**data)` or FastAPI parses a request body, Pydantic: (1) iterates through each field defined in the model, (2) looks up the corresponding key in the input data, (3) validates the value against the field's type annotation, (4) applies any constraints (validators, Field constraints), (5) coerces compatible types (strings to ints, dicts to nested models), (6) applies default values for missing optional fields, and (7) raises `ValidationError` with detailed messages if any field fails. The validation is recursive for nested models.
- **The Unforgettable Mental Model:** The **Assembly Line Inspector**. Each field is a station on the assembly line. The inspector checks: does the part exist? Is it the right shape (type)? Does it meet specifications (constraints)? If it passes, it moves to the next station. If it fails, the whole product is rejected with a defect report.
- **The Trap:** Assuming Pydantic rejects all type mismatches. Pydantic performs coercion — a string "42" becomes int 42, a dict becomes a nested model. This is convenient but can mask data quality issues if the source is sending wrong types.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Pydantic validates data field-by-field against type annotations, applying constraints, coercing compatible types, and filling defaults. If any field fails, it raises a ValidationError with a detailed list of all errors — not just the first one. This means clients get comprehensive feedback on what needs to be fixed in a single request."

#### What is the difference between Pydantic v1 and v2?
- **The Engine Mechanism (Why it behaves this way):** Pydantic v2 rewrote the validation engine in Rust as `pydantic-core`, achieving 5-50x speed improvements. Key changes: (1) `class Config` replaced by `model_config = ConfigDict(...)`, (2) `@validator` replaced by `@field_validator`, (3) `@root_validator` replaced by `@model_validator`, (4) `.dict()` replaced by `.model_dump()`, (5) `.parse_obj()` replaced by `.model_validate()`, (6) `orm_mode = True` replaced by `from_attributes = True`, (7) stricter type coercion by default. FastAPI supports both but recommends v2.
- **The Unforgettable Mental Model:** The **Engine Swap**. Pydantic v1 is a car with a reliable but slow engine. v2 is the same car body with a completely new racing engine — same controls, different internals, much faster. Some dashboard buttons moved (API changes), but the driving experience is the same.
- **The Trap:** Mixing v1 and v2 syntax in the same project. They are not fully compatible. When upgrading, you must update all model definitions, validators, and method calls.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Pydantic v2 uses a Rust-based core for dramatically faster validation. The API changed — ConfigDict replaces class Config, field_validator replaces validator, model_dump replaces dict. I always use v2 syntax in new projects and use the pydantic migration guide when upgrading existing codebases."

#### How do you add custom validation in Pydantic?
- **The Engine Mechanism (Why it behaves this way):** Pydantic v2 provides `@field_validator` for single-field validation and `@model_validator` for cross-field validation. `@field_validator` receives the field value and can transform or reject it by raising `ValueError`. `@model_validator(mode='before')` runs before field validation on raw input data; `mode='after'` runs after all fields are validated on the model instance. You can also use `Annotated` with `AfterValidator` for inline validators. FastAPI automatically converts validation errors into 422 responses with structured error details.
- **The Unforgettable Mental Model:** The **Quality Control Lab**. Standard type checking is the visual inspection. Custom validators are the lab tests — checking chemical composition (field_validator), testing how parts interact together (model_validator), and running specialized assays (Annotated validators).
- **The Trap:** Using `@field_validator` without `mode='before'` or `mode='after'` correctly. In v2, validators run after type coercion by default. If you need to validate raw input before coercion, use `mode='before'`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use @field_validator for single-field rules like 'email must contain @' and @model_validator for cross-field rules like 'end_date must be after start_date'. Validators raise ValueError to reject invalid data, and FastAPI automatically converts these into structured 422 responses."

#### How does Pydantic handle nested models?
- **The Engine Mechanism (Why it behaves this way):** Pydantic models can contain other Pydantic models as field types. When validating, Pydantic recursively validates nested models — if `User` has a field `address: Address`, Pydantic validates the address dict against the `Address` model, which may itself have nested models. Validation errors include the full path to the failing field (e.g., `body.user.address.zip_code`). This enables complex, hierarchical API contracts with full validation at every level.
- **The Unforgettable Mental Model:** The **Russian Doll Inspection**. Each nested model is a doll inside a doll. The inspector opens each doll, checks its contents, then opens the next doll inside. If any doll has a defect, the report says exactly which doll and which part is wrong.
- **The Trap:** Creating deeply nested models that are hard to maintain. More than 3 levels of nesting often indicates the API contract is too complex. Consider flattening or using separate endpoints.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Pydantic validates nested models recursively, with error paths showing the full location of failures. I keep nesting to 2-3 levels maximum — beyond that, I split into separate endpoints or flatten the schema. Deep nesting makes validation errors hard to interpret and APIs hard to use."

#### How does Pydantic serialize data for responses?
- **The Engine Mechanism (Why it behaves this way):** When FastAPI uses `response_model`, it passes the endpoint's return value through Pydantic's serialization. Pydantic calls `model_dump()` (v2) or `dict()` (v1) to convert the model to a dict, filtering out fields not in the response model, applying serialization rules (e.g., datetime to ISO string), and handling nested models recursively. With `from_attributes=True` (v2), Pydantic can serialize ORM objects directly by reading attributes instead of dict keys. The serialized dict is then JSON-encoded by FastAPI.
- **The Unforgettable Mental Model:** The **Gift Wrapper**. The endpoint produces a raw product (ORM object, dict, or model). Pydantic's response_model wraps it — removing internal components (passwords, internal IDs), adding the right packaging (type formatting), and sealing it for delivery (JSON encoding).
- **The Trap:** Returning ORM objects without `from_attributes=True` in the response model. Pydantic v2 reads dict keys by default; ORM objects have attributes, not dict keys. Without `from_attributes=True`, serialization fails.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Pydantic serializes response data by converting models to dicts, filtering fields based on the response_model, and applying type-specific formatting. For ORM objects, I set from_attributes=True so Pydantic reads object attributes instead of dict keys. This ensures only intended fields reach the client and internal data stays hidden."

## 8. Active recall test

1. **What does Pydantic do that Python type hints alone cannot?**
   - **Explanation:** Python type hints are ignored at runtime. Pydantic actively parses, validates, and coerces data against type hints at runtime, raising detailed ValidationError if data doesn't match the schema.

2. **What is pydantic-core?**
   - **Explanation:** pydantic-core is the Rust-based validation engine in Pydantic v2. It provides 5-50x faster validation compared to v1's pure Python implementation.

3. **What replaced @validator in Pydantic v2?**
   - **Explanation:** @field_validator replaces @validator for single-field validation. @model_validator replaces @root_validator for cross-field validation.

4. **How does Pydantic handle type coercion?**
   - **Explanation:** Pydantic automatically converts compatible types — string "42" to int 42, string "true" to bool True, dict to nested model. This is convenient but can mask data quality issues.

5. **What does from_attributes=True do in a response model?**
   - **Explanation:** It tells Pydantic to read data from object attributes (like SQLAlchemy models) instead of dict keys. Required when serializing ORM objects directly.

6. **How are nested model validation errors reported?**
   - **Explanation:** Error paths show the full location, e.g., "body.user.address.zip_code". This makes it easy for clients to identify exactly which nested field failed validation.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Pydantic should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Pydantic, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Pydantic.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
