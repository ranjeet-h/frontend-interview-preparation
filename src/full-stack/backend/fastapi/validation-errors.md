# FastAPI Validation Errors

## Detailed explanation

FastAPI returns 422 responses when request data fails validation. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Validation errors are structured client input failures.

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

#### What is the structure of FastAPI's validation error response?
- **The Engine Mechanism (Why it behaves this way):** When Pydantic validation fails, FastAPI returns HTTP 422 with a JSON body containing a `detail` array. Each error object has: `loc` (location path like `["body", "name"]` or `["query", "skip"]`), `msg` (human-readable message like "field required" or "value is not a valid integer"), `type` (error type like `missing`, `int_parsing`, `string_too_short`), and optionally `ctx` (context with constraint values like `{"min_length": 3}`). This structured format allows frontend clients to map errors to specific form fields and display targeted messages.
- **The Unforgettable Mental Model:** The **Graded Test Paper**. Instead of just "F," the teacher marks exactly which questions were wrong (loc), what the correct answer should be (msg), what type of mistake it was (type), and what the grading rubric said (ctx).
- **The Trap:** Assuming the error format is customizable without overriding the handler. The default format is built into FastAPI's RequestValidationError handler. To change it, you must register a custom exception handler.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI returns 422 with a detail array containing loc, msg, type, and optionally ctx for each validation error. The loc shows the exact path to the failing field — body.name, query.skip, path.item_id. This structure lets frontend forms highlight specific inputs with targeted error messages."

#### How does FastAPI collect all validation errors instead of failing on the first one?
- **The Engine Mechanism (Why it behaves this way):** Pydantic validates all fields in a model before raising ValidationError. It collects every field's validation failures into a single error list. FastAPI then wraps this list in the 422 response. This means clients get comprehensive feedback — all invalid fields are reported in one response, not one at a time. This is more efficient than iterative validation where the client fixes one error, resubmits, and discovers the next error.
- **The Unforgettable Mental Model:** The **Full Home Inspection**. The inspector doesn't stop at the first defect — they check the entire house and give you a complete report of all issues. You can fix everything at once instead of one problem at a time.
- **The Trap:** Assuming custom validators run after all field validation. @field_validator runs per-field during validation; @model_validator runs after all fields are validated. Custom validators that raise errors contribute to the collected error list.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Pydantic validates all fields before raising ValidationError, collecting every failure into a single error list. FastAPI returns all errors in one 422 response. This is more efficient than iterative validation — clients fix all issues at once instead of discovering them one at a time."

#### How do validation errors differ from HTTPException errors?
- **The Engine Mechanism (Why it behaves this way):** Validation errors (422) are raised automatically by FastAPI/Pydantic when request data doesn't match the schema. They're client input errors — the client sent bad data. HTTPException errors are raised manually by the developer in endpoint or dependency code. They're application-level errors — the data was valid, but the operation couldn't complete (not found, unauthorized, conflict). Validation errors have structured detail arrays; HTTPException has a single detail string or dict.
- **The Unforgettable Mental Model:** The **Two Types of Rejection**. Validation error is "your form is filled out wrong" (client's fault). HTTPException is "your form is correct but we can't process it" (server's decision — not found, not authorized, conflict).
- **The Trap:** Using HTTPException for validation errors. If the client sent bad data, return 422 (validation error), not 400 (HTTPException). 422 tells the client exactly what's wrong; 400 is vague.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Validation errors (422) are automatic — Pydantic catches bad input data. HTTPException is manual — I raise it for application-level issues like not found, unauthorized, or conflict. I use 422 for client input errors and HTTPException for business logic errors. They have different response structures and meanings."

#### How do you customize validation error messages?
- **The Engine Mechanism (Why it behaves this way):** Override the RequestValidationError handler: `@app.exception_handler(RequestValidationError) async def custom_validation_handler(request: Request, exc: RequestValidationError): return JSONResponse(status_code=422, content={"error": "Validation failed", "details": [{"field": ".".join(str(l) for l in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]})`. Alternatively, use Pydantic's error message customization via `model_config = ConfigDict(error_messages={"...": "..."})` in v2.10+. For field-level custom messages, use `Field(json_schema_extra={"error_messages": {"...": "..."}})`.
- **The Unforgettable Mental Model:** The **Translator**. Pydantic speaks technical error messages. The custom handler translates them into client-friendly language — "value is not a valid integer" becomes "age must be a number."
- **The Trap:** Overcomplicating the custom error format. Keep it simple — field name and message. Frontend developers need predictable, parseable errors, not creative formatting.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I customize validation errors by overriding the RequestValidationError handler. I transform Pydantic's technical messages into client-friendly formats with field names and clear messages. I keep the format simple and predictable so frontend can parse it reliably."

#### How do validation errors affect API versioning?
- **The Engine Mechanism (Why it behaves this way):** The validation error response format is part of the API contract. If you change the format (custom handler), all clients must update their error handling. When versioning APIs, keep the validation error format consistent across versions — clients expect the same error structure regardless of API version. If you must change the format, do it as a major version change with migration guidance.
- **The Unforgettable Mental Model:** The **Universal Emergency Signal**. Regardless of which building (API version) you're in, the fire alarm (validation error) sounds the same way. Changing the alarm sound confuses everyone.
- **The Trap:** Changing the validation error format between minor versions. Clients parse the error structure programmatically — any change breaks their error handling.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The validation error format is part of the API contract. I keep it consistent across API versions — clients expect the same error structure. If I need to change it, I treat it as a breaking change and migrate clients with clear documentation."

#### How do you test validation error responses?
- **The Engine Mechanism (Why it behaves this way):** Send invalid requests with TestClient and assert on the 422 status code and error structure: `response = client.post("/items", json={"name": 123}); assert response.status_code == 422; errors = response.json()["detail"]; assert any(e["loc"] == ["body", "name"] for e in errors)`. Test various invalid inputs: missing required fields, wrong types, constraint violations (too short, out of range), and nested model errors. Assert on loc, msg, and type to ensure the error format is correct and frontend-compatible.
- **The Unforgettable Mental Model:** The **Stress Test**. Instead of testing what happens when everything works, test what happens when everything breaks. The system should fail gracefully with clear error messages.
- **The Trap:** Only testing happy paths. Validation error tests are as important as success tests — they ensure the API contract is enforced and clients get useful feedback.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test validation errors by sending invalid requests with TestClient and asserting on 422 status and error structure. I test missing fields, wrong types, constraint violations, and nested errors. I assert on loc, msg, and type to ensure frontend-compatible error responses."

## 8. Active recall test

1. **What is the structure of a FastAPI validation error response?**
   - **Explanation:** HTTP 422 with a detail array. Each error has loc (path to failing field), msg (human-readable message), type (error type), and optionally ctx (constraint values).

2. **Why does FastAPI report all validation errors at once?**
   - **Explanation:** Pydantic validates all fields before raising ValidationError, collecting every failure. This lets clients fix all issues in one round trip instead of discovering errors iteratively.

3. **What's the difference between 422 and 400 errors?**
   - **Explanation:** 422 (validation error) means the client sent data that doesn't match the schema — structured error details. 400 (HTTPException) means the request is bad for other reasons — vague detail string.

4. **How do you customize validation error messages?**
   - **Explanation:** Override the RequestValidationError handler with @app.exception_handler(RequestValidationError). Transform Pydantic's errors into your preferred format.

5. **Should validation error format change between API versions?**
   - **Explanation:** No. The error format is part of the API contract. Keep it consistent across versions. Changes break client error handling.

6. **How do you test validation errors?**
   - **Explanation:** Send invalid requests with TestClient, assert 422 status, and verify the error structure (loc, msg, type) for each expected validation failure.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

FastAPI Validation Errors should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain FastAPI Validation Errors, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define FastAPI Validation Errors.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
