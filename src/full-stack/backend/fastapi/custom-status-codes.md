# Custom Status Codes

## Detailed explanation

FastAPI endpoints can return explicit status codes through decorators, Response, or exceptions. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Status code communicates result meaning.

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

#### How do you set custom status codes in FastAPI endpoints?
- **The Engine Mechanism (Why it behaves this way):** FastAPI provides three ways to set status codes: (1) `status_code` parameter on the route decorator: `@app.post("/items", status_code=201)` — sets the default status for successful responses, (2) `Response` parameter injection: `def create(response: Response): response.status_code = 201` — allows dynamic status code based on endpoint logic, (3) `HTTPException`: `raise HTTPException(status_code=404, detail="Not found")` — sets status for error responses. The decorator approach is most common for fixed status codes; Response injection is used for conditional status codes.
- **The Unforgettable Mental Model:** The **Traffic Light System**. Green (2xx) = success, Yellow (3xx) = redirect, Red (4xx) = client error, Flashing Red (5xx) = server error. The status code tells the client what color light to expect.
- **The Trap:** Using 200 for all responses. Different operations have different semantic meanings — create is 201, delete is 204, not found is 404. Using 200 everywhere loses important semantic information.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I set status codes three ways: status_code parameter on the decorator for fixed codes, Response injection for dynamic codes, and HTTPException for errors. I use semantic codes — 201 for create, 204 for delete, 404 for not found, 422 for validation. This gives clients meaningful information about the result."

#### What are the most important HTTP status codes for APIs?
- **The Engine Mechanism (Why it behaves this way):** Key status codes: **200 OK** — successful GET/PUT/PATCH, **201 Created** — successful POST (resource created), **204 No Content** — successful DELETE (no response body), **400 Bad Request** — malformed request (not validation), **401 Unauthorized** — missing or invalid authentication, **403 Forbidden** — authenticated but not authorized, **404 Not Found** — resource doesn't exist, **409 Conflict** — resource conflict (duplicate), **422 Unprocessable Entity** — validation error (FastAPI default), **500 Internal Server Error** — unexpected server error. Each code has a specific semantic meaning that clients rely on.
- **The Unforgettable Mental Model:** The **Restaurant Receipt**. 200 = order served, 201 = new regular customer registered, 204 = table cleared, 401 = no reservation, 403 = reserved but wrong section, 404 = menu item discontinued, 422 = order details unclear, 500 = kitchen fire.
- **The Trap:** Confusing 401 and 403. 401 means "who are you?" (not authenticated). 403 means "I know who you are but you can't do this" (not authorized). They require different client responses.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Key API status codes: 200 for success, 201 for created, 204 for no content, 401 for unauthenticated, 403 for unauthorized, 404 for not found, 409 for conflict, 422 for validation errors, 500 for server errors. Each code has a specific meaning that clients use to determine next steps."

#### How do you return a dynamic status code based on endpoint logic?
- **The Engine Mechanism (Why it behaves this way):** Inject the `Response` object as a parameter: `from fastapi import Response; @app.post("/items") def create(item: ItemCreate, response: Response): if is_duplicate(item): response.status_code = 409; return {"error": "Duplicate"}; response.status_code = 201; return {"data": item}`. The Response object allows setting the status code dynamically based on endpoint logic. Alternatively, raise `HTTPException(status_code=409)` for error cases. The decorator's `status_code` sets the default; Response injection overrides it.
- **The Unforgettable Mental Model:** The **Conditional Exit Sign**. The default exit is door A (201), but if a condition is met, the sign changes to door B (409). The Response object is the sign changer.
- **The Trap:** Setting status_code on Response after returning. The return statement ends the function — any code after it doesn't run. Set the status code before returning.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I inject the Response object and set response.status_code dynamically based on endpoint logic. For error cases, I prefer raising HTTPException — it's cleaner than setting status codes and returning error bodies. The decorator's status_code is the default; Response injection overrides it."

#### How does status_code on the decorator affect OpenAPI docs?
- **The Engine Mechanism (Why it behaves this way):** The `status_code` parameter on route decorators defines the success response status in the OpenAPI schema. Swagger UI displays this as the default response code. If you use Response injection to return different status codes dynamically, those codes won't appear in the OpenAPI docs unless you document them with the `responses` parameter: `@app.post("/items", status_code=201, responses={409: {"description": "Duplicate item"}})`. The `responses` parameter documents additional status codes for documentation purposes.
- **The Unforgettable Mental Model:** The **Menu Description**. The status_code on the decorator is the main dish listed on the menu. The responses parameter lists the possible substitutions (409, 400) that might be served instead.
- **The Trap:** Not documenting dynamic status codes. If your endpoint can return 409 but only documents 201, clients won't know to handle the 409 case.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The status_code parameter on the decorator defines the success status in OpenAPI docs. For dynamic status codes, I use the responses parameter to document them: responses={409: {'description': 'Duplicate'}}. This ensures clients know all possible responses and can handle them."

#### When should you use 204 No Content?
- **The Engine Mechanism (Why it behaves this way):** Use 204 for successful operations that don't return a response body — typically DELETE operations. In FastAPI: `@app.delete("/items/{item_id}", status_code=204) def delete(item_id: int): ...; return None`. The 204 status tells the client "the operation succeeded but there's no body to read." FastAPI automatically sets the response body to empty for 204. Don't use 204 for GET operations — GET should return the requested resource.
- **The Unforgettable Mental Model:** The **Empty Confirmation**. Like a nod instead of a verbal response — "done, nothing more to say." The action completed successfully, but there's nothing to show.
- **The Trap:** Returning a body with 204. HTTP 204 means "no content" — the client won't read the body. If you need to return data, use 200 instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use 204 for DELETE operations that don't return data. It tells the client 'success, no body to read.' I never return a body with 204 — the client won't read it. For GET operations, I always use 200 with the resource data."

#### How do status codes affect client behavior?
- **The Engine Mechanism (Why it behaves this way):** Clients use status codes to determine next steps: 2xx = proceed with the response data, 3xx = follow the redirect, 4xx = fix the request (show form errors, re-authenticate), 5xx = retry later or show error page. HTTP libraries (axios, fetch) automatically categorize responses by status code range. Proper status codes enable automatic client behavior — retry logic for 5xx, form error display for 422, redirect following for 3xx. Incorrect status codes break these automatic behaviors.
- **The Unforgettable Mental Model:** The **Road Signs**. Status codes are road signs — green arrow (2xx) means go, yellow detour (3xx) means follow the new route, red stop (4xx) means fix something, flashing red (5xx) means wait and try again.
- **The Trap:** Using 200 for errors with an error field in the body. Clients check the status code first — a 200 with {"error": "..."} in the body may be treated as success. Use proper error status codes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Status codes drive client behavior — 2xx means proceed, 4xx means fix the request, 5xx means retry. HTTP libraries categorize responses by status code range. Proper codes enable automatic retry logic, form error display, and redirect handling. I never use 200 for errors — clients check status codes first."

## 8. Active recall test

1. **What are the three ways to set status codes in FastAPI?**
   - **Explanation:** status_code parameter on the decorator (fixed), Response injection (dynamic), and HTTPException (errors).

2. **What status code should you use for a successful POST that creates a resource?**
   - **Explanation:** 201 Created. It semantically indicates a new resource was created, different from 200 OK which indicates a successful operation without creation.

3. **What's the difference between 401 and 403?**
   - **Explanation:** 401 means unauthenticated (who are you?). 403 means unauthorized (I know who you are but you can't do this).

4. **How do you document dynamic status codes in OpenAPI?**
   - **Explanation:** Use the responses parameter: `@app.post("/items", responses={409: {"description": "Duplicate"}})`. This documents codes not set by the decorator's status_code.

5. **When should you use 204 No Content?**
   - **Explanation:** For successful operations that don't return a body, typically DELETE. Never return a body with 204 — the client won't read it.

6. **Why is using 200 for errors problematic?**
   - **Explanation:** Clients check status codes first. A 200 with an error field in the body may be treated as success by HTTP libraries, breaking automatic error handling.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Custom Status Codes should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Custom Status Codes, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Custom Status Codes.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
