# Split Routes in FastAPI

## Detailed explanation

Large FastAPI apps split routes into routers per feature or domain. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Split routes by ownership, not by random files.

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

#### Why should you split routes in a FastAPI application?
- **The Engine Mechanism (Why it behaves this way):** As a FastAPI application grows, putting all routes in a single `main.py` file becomes unmanageable. Splitting routes into separate modules (one per domain or feature) using `APIRouter` improves: (1) **Readability** — each file is focused and small, (2) **Maintainability** — changes to one domain don't affect others, (3) **Team collaboration** — different developers can work on different route files without merge conflicts, (4) **Testing** — individual route modules can be tested in isolation, (5) **Code organization** — related schemas, dependencies, and services live near their routes.
- **The Unforgettable Mental Model:** The **Library Organization**. A library with all books in one pile is useless. Organized by sections (fiction, science, history), each with its own shelf (router), it's easy to find and manage books (routes).
- **The Trap:** Splitting routes too early. For small apps (under 10 routes), a single file is simpler. Split when the file becomes hard to navigate or when multiple developers need to work on different domains.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I split routes by domain using APIRouter — items_router.py, users_router.py, orders_router.py. Each router is included in the main app with a prefix. This keeps files focused, enables parallel development, and makes testing easier. I split when the main file exceeds ~50 routes or when the team grows."

#### How do you organize split routes in a project?
- **The Engine Mechanism (Why it behaves this way):** Common organization patterns: (1) **By domain** — `routers/items.py`, `routers/users.py`, each with its own routes, schemas, and dependencies, (2) **By layer** — `routes/`, `schemas/`, `dependencies/`, `services/` as separate directories, (3) **Hybrid** — `routers/items/` with `routes.py`, `schemas.py`, `dependencies.py` inside. The main `app.py` imports and includes all routers. The hybrid approach scales best for large apps — each domain is self-contained with its routes, schemas, and dependencies together.
- **The Unforgettable Mental Model:** The **Apartment Building**. Each apartment (domain) has its own kitchen, bedroom, and bathroom (routes, schemas, dependencies). The building (app) connects them all. You can renovate one apartment without affecting others.
- **The Trap:** Creating circular imports between route files. If items routes import from users routes and vice versa, Python fails. Structure dependencies to flow in one direction.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a hybrid organization — routers/items/ with routes.py, schemas.py, and dependencies.py inside each domain folder. The main app imports and includes all routers. This keeps related code together and avoids circular imports by structuring dependencies in one direction."

#### How do you include split routers in the main app?
- **The Engine Mechanism (Why it behaves this way):** Import each router and include it with `app.include_router()`: `from app.routers import items, users; app.include_router(items.router, prefix="/api/v1/items", tags=["Items"]); app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])`. Each router's routes are mounted at the specified prefix. The order of `include_router` calls determines route priority — earlier routers match first. OpenAPI docs automatically include all routes from all routers.
- **The Unforgettable Mental Model:** The **Plug-in System**. The main app is the console. Each router is a game cartridge — you plug it in (include_router), and it's ready to play. The console knows about all plugged-in games.
- **The Trap:** Importing routers that import the app, creating circular imports. Routers should import from shared modules (schemas, dependencies), not from the main app file.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I import each router and include it with app.include_router(), specifying prefix and tags. Routers should not import the main app to avoid circular imports. The order of include_router matters for route priority — specific routes before catch-alls."

#### How do split routes affect dependency management?
- **The Engine Mechanism (Why it behaves this way):** Shared dependencies (get_db, get_current_user) should live in a common module (e.g., `dependencies/common.py`) that all routers import. Domain-specific dependencies live in the router's directory. This prevents duplication and ensures consistency. Router-level dependencies (`APIRouter(dependencies=[...])`) apply to all routes in that router. Dependencies can be composed — a domain dependency can depend on a common dependency.
- **The Unforgettable Mental Model:** The **Shared Infrastructure**. Water and electricity (common dependencies) serve all apartments. Each apartment has its own appliances (domain dependencies) that plug into the shared infrastructure.
- **The Trap:** Duplicating dependencies across router files. If each router defines its own get_db, you have multiple session factories. Centralize shared dependencies.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Shared dependencies live in a common module that all routers import. Domain-specific dependencies live in the router's directory. I never duplicate dependencies — get_db, get_current_user are defined once and imported everywhere. Router-level dependencies apply domain-wide protections."

#### How do split routes affect testing?
- **The Engine Mechanism (Why it behaves this way):** Split routes enable focused testing. You can test individual routers by creating a temporary FastAPI app that includes only that router: `test_app = FastAPI(); test_app.include_router(items.router)`. This tests the router in isolation without other domains' complexity. You can also test the full app for integration tests. Dependency overrides work the same way — override shared dependencies once and they apply to all routers.
- **The Unforgettable Mental Model:** The **Component Testing**. Instead of testing the entire car (full app), you test the engine (items router), the transmission (users router), and the brakes (orders router) separately. Then you test the whole car.
- **The Trap:** Only testing the full app. Full-app tests are slow and make it hard to identify which domain caused a failure. Router-level tests are fast and focused.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test individual routers by mounting them on temporary test apps for fast, focused tests. I also test the full app for integration confidence. Dependency overrides apply across all routers. This gives both speed (unit-level router tests) and confidence (full-app integration tests)."

#### When should you NOT split routes?
- **The Engine Mechanism (Why it behaves this way):** Don't split routes when: (1) The app is small (under 10-15 routes) — a single file is simpler, (2) The team is solo — splitting adds overhead without collaboration benefits, (3) The domains are tightly coupled — if items and orders always change together, splitting creates artificial boundaries, (4) You're prototyping — split after the API shape is stable. Premature splitting adds file navigation overhead without meaningful benefits.
- **The Unforgettable Mental Model:** The **Studio Apartment**. A studio doesn't need walls between rooms — everything is within reach. Adding walls (splitting) makes it harder to navigate, not easier. Build walls only when the space grows.
- **The Trap:** Following "best practices" blindly. Splitting routes is a scaling technique, not a requirement. Small apps are simpler with fewer files.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I don't split routes for small apps (under 15 routes), solo projects, or prototypes. Splitting is a scaling technique — it adds file overhead that small apps don't need. I split when the main file becomes hard to navigate or when the team grows and needs parallel development."

## 8. Active recall test

1. **Why split routes in FastAPI?**
   - **Explanation:** Improves readability, maintainability, team collaboration, and testability. Each domain gets its own focused module with routes, schemas, and dependencies.

2. **What is the recommended project structure for split routes?**
   - **Explanation:** Hybrid approach: routers/items/ with routes.py, schemas.py, dependencies.py inside each domain folder. Main app imports and includes all routers.

3. **How do you avoid circular imports with split routes?**
   - **Explanation:** Routers should import from shared modules (schemas, dependencies), not from the main app file. Structure dependencies to flow in one direction.

4. **Where should shared dependencies live?**
   - **Explanation:** In a common module (e.g., dependencies/common.py) that all routers import. Domain-specific dependencies live in the router's directory.

5. **How do you test an individual router in isolation?**
   - **Explanation:** Create a temporary FastAPI app and include only that router: `test_app = FastAPI(); test_app.include_router(items.router)`. Test with TestClient.

6. **When should you NOT split routes?**
   - **Explanation:** For small apps (under 15 routes), solo projects, prototypes, or tightly coupled domains. Splitting adds overhead that small apps don't need.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Split Routes in FastAPI should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Split Routes in FastAPI, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Split Routes in FastAPI.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
