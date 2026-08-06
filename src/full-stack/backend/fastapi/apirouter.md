# APIRouter

## Detailed explanation

`APIRouter` groups routes by feature, prefix, tags, dependencies, and version. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

APIRouter keeps large apps modular.

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

#### What is APIRouter and why use it?
- **The Engine Mechanism (Why it behaves this way):** `APIRouter` is a FastAPI class that groups routes by feature, domain, or version. You create a router (`router = APIRouter()`), define routes on it (`@router.get("/items")`), and include it in the main app (`app.include_router(router, prefix="/api/v1")`). Routers support prefix (URL path prefix), tags (OpenAPI grouping), dependencies (applied to all routes), and default response models. This keeps large applications modular — each router is a self-contained module that can be developed, tested, and maintained independently.
- **The Unforgettable Mental Model:** The **Department Structure**. A company (FastAPI app) has departments (routers) — HR, Engineering, Sales. Each department has its own processes (routes), manager (dependencies), and office location (prefix). The CEO (app) coordinates them all.
- **The Trap:** Creating too many small routers. One router per endpoint defeats the purpose. Group by domain or feature — items router, users router, orders router.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: APIRouter groups routes by domain or feature. Each router has its own prefix, tags, dependencies, and routes. I include routers in the main app with app.include_router(). This keeps large apps modular — each router is independently developable and testable."

#### How does APIRouter prefix work?
- **The Engine Mechanism (Why it behaves this way):** The `prefix` parameter on `include_router` prepends a path to all routes in the router. If a router defines `@router.get("/items")` and is included with `prefix="/api/v1"`, the full path becomes `/api/v1/items`. Prefixes can be nested — a router included in another router inherits both prefixes. Prefixes should not end with a trailing slash (use `/api/v1`, not `/api/v1/`). Empty prefix (`prefix=""`) is valid and adds no prefix.
- **The Unforgettable Mental Model:** The **Area Code**. The router's routes are phone numbers. The prefix is the area code — it's prepended to every number. `/items` becomes `/api/v1/items` just like 555-1234 becomes (212) 555-1234.
- **The Trap:** Double slashes from prefix + route path. `prefix="/api/v1/"` + `"/items"` = `/api/v1//items`. Don't end prefixes with a slash.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Prefix prepends a path to all router routes. I use prefixes for versioning (/api/v1) and domain grouping (/users, /items). I never end prefixes with a trailing slash to avoid double slashes. Prefixes can be nested when including routers within routers."

#### How do tags work in APIRouter?
- **The Engine Mechanism (Why it behaves this way):** The `tags` parameter groups routes in the OpenAPI documentation. Routes with the same tag appear together in Swagger UI's grouped sections. Tags are strings: `APIRouter(prefix="/items", tags=["Items"])`. You can set tags at the router level (applies to all routes) or per-route (`@router.get("/items", tags=["Admin"])`). Tags also appear in the OpenAPI schema's `tags` array, where you can add descriptions via `app.openapi_tags`.
- **The Unforgettable Mental Model:** The **File Folders**. Tags are folder labels in a filing cabinet. All routes tagged "Items" go in the Items folder. Swagger UI displays the folders as collapsible sections.
- **The Trap:** Using inconsistent tag names. `tags=["items"]` and `tags=["Items"]` create separate groups. Standardize tag names across the application.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Tags group routes in Swagger UI. I set tags at the router level for consistency — all item routes get tags=['Items']. I standardize tag names across the app and add descriptions via app.openapi_tags for better documentation."

#### How do router-level dependencies work?
- **The Engine Mechanism (Why it behaves this way):** The `dependencies` parameter on `APIRouter` applies dependencies to all routes in the router: `APIRouter(dependencies=[Depends(require_auth)])`. These dependencies run for every request to any route in the router. They're useful for domain-level auth (all admin routes require admin auth), rate limiting per domain, or logging. Router-level dependencies run before endpoint-level dependencies. If a router dependency raises an exception, the endpoint is never called.
- **The Unforgettable Mental Model:** The **Department Security Badge**. Instead of each room (endpoint) having its own lock, the entire department (router) has a badge reader. You need the badge to enter any room in the department.
- **The Trap:** Assuming router dependencies replace endpoint dependencies. Router dependencies run for side effects; endpoint dependencies inject values. Use both when you need both protection and value injection.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Router-level dependencies run for all routes in the router. I use them for domain-level auth — all admin routes require admin auth via a router dependency. They run before endpoint dependencies and can block access to all routes in the router if they raise an exception."

#### How do you nest APIRouters?
- **The Engine Mechanism (Why it behaves this way):** You can include a router within another router: `parent_router.include_router(child_router, prefix="/child")`. The child router's routes inherit both the child's prefix and the parent's prefix. This enables hierarchical organization: `app.include_router(v1_router, prefix="/api/v1")` and `v1_router.include_router(items_router, prefix="/items")` produces routes at `/api/v1/items/...`. Dependencies and tags also inherit through the hierarchy.
- **The Unforgettable Mental Model:** The **Franchise Model**. The parent company (app) has regional offices (v1_router), which have local branches (items_router). Each level adds its own address component (prefix) and rules (dependencies).
- **The Trap:** Over-nesting routers. More than 2-3 levels of nesting makes route paths hard to understand and debug. Keep the hierarchy shallow.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I nest routers for hierarchical organization — app includes version routers, version routers include domain routers. Prefixes and dependencies accumulate through the hierarchy. I keep nesting to 2-3 levels maximum to maintain readability."

#### How does APIRouter improve testability?
- **The Engine Mechanism (Why it behaves this way):** Each router is a self-contained module that can be tested independently. You can create a TestClient with just the router (by mounting it on a temporary app) to test routes in isolation. Router-level dependencies can be overridden per-test. This enables focused tests that verify a single domain's behavior without the complexity of the full application. Routers also make it easy to mock or stub entire domains during integration testing.
- **The Unforgettable Mental Model:** The **Unit Test Lab**. Instead of testing the entire factory (full app), you test one assembly line (router) in isolation. You can swap out machines (dependencies) and verify that line's output independently.
- **The Trap:** Testing only the full app and never testing individual routers. Full-app tests are slow and hard to debug. Router-level tests are fast and focused.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: APIRouter enables modular testing — I test individual routers in isolation by mounting them on temporary test apps. Router-level dependencies can be overridden per-test. This gives fast, focused tests for each domain, plus full-app integration tests for end-to-end confidence."

## 8. Active recall test

1. **What is APIRouter?**
   - **Explanation:** A FastAPI class that groups routes by feature or domain. Routers support prefix, tags, dependencies, and can be included in the main app with app.include_router().

2. **How does prefix work on include_router?**
   - **Explanation:** It prepends a path to all routes in the router. Routes defined as "/items" with prefix="/api/v1" become "/api/v1/items". Don't end prefixes with trailing slashes.

3. **What do tags do in OpenAPI documentation?**
   - **Explanation:** Tags group routes in Swagger UI as collapsible sections. Routes with the same tag appear together. Set tags at the router level for consistency.

4. **How do router-level dependencies differ from endpoint dependencies?**
   - **Explanation:** Router-level dependencies run for all routes in the router but don't inject values (unless also declared in the endpoint). They're for side effects like auth checks.

5. **Can you nest APIRouters?**
   - **Explanation:** Yes. Include a router within another router. Prefixes and dependencies accumulate through the hierarchy. Keep nesting to 2-3 levels for readability.

6. **How does APIRouter improve testability?**
   - **Explanation:** Each router is independently testable. Mount routers on temporary test apps for focused domain tests. Router dependencies can be overridden per-test.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

APIRouter should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain APIRouter, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define APIRouter.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
