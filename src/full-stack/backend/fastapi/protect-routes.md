# Protect Routes in FastAPI

## Detailed explanation

Protected routes use dependencies to require current user, scopes, roles, or permissions. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Protection is dependency-enforced access control.

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

#### How do you protect routes in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Protect routes by adding authentication dependencies: `@app.get("/protected", dependencies=[Depends(get_current_user)])` or as a parameter: `def protected(current_user: User = Depends(get_current_user))`. The `get_current_user` dependency extracts and verifies the JWT token, looks up the user, and returns the user object. If verification fails, it raises HTTPException(401), preventing the endpoint from running. Routes without the dependency are public; routes with it require authentication. Router-level dependencies (`APIRouter(dependencies=[Depends(get_current_user)])`) protect all routes in the router.
- **The Unforgettable Mental Model:** The **Lock on the Door**. Public routes have no lock — anyone enters. Protected routes have a lock (dependency) — only people with the right key (valid token) can enter.
- **The Trap:** Forgetting to add the dependency to a route that should be protected. A missing dependency means the route is public. Use router-level dependencies for domain-wide protection.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I protect routes by adding auth dependencies — either as endpoint parameters for value injection or as router-level dependencies for domain-wide protection. The dependency verifies the token and returns the current user. If verification fails, 401 is returned and the endpoint never runs."

#### What's the difference between dependencies=[] and parameter injection?
- **The Engine Mechanism (Why it behaves this way):** `dependencies=[Depends(get_current_user)]` runs the dependency for its side effect (auth check) but doesn't inject the return value into the endpoint. `current_user: User = Depends(get_current_user)` runs the dependency AND injects the return value. Use `dependencies=[]` when you only need to verify auth (the endpoint doesn't need the user object). Use parameter injection when the endpoint needs the user object (e.g., to filter by user ID). Both protect the route — the difference is whether the endpoint receives the user.
- **The Unforgettable Mental Model:** The **Bouncer vs. the Concierge**. The bouncer (dependencies=[]) checks your ID and lets you in — but doesn't tell the host who you are. The concierge (parameter injection) checks your ID AND introduces you to the host (endpoint).
- **The Trap:** Using dependencies=[] when the endpoint needs the user object. The endpoint won't have access to the current user. Use parameter injection when you need the user.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: dependencies=[] runs the dependency for side effects only — good for auth checks where the endpoint doesn't need the user. Parameter injection runs the dependency AND injects the return value — use when the endpoint needs the current user. Both protect the route."

#### How do you protect all routes in a router?
- **The Engine Mechanism (Why it behaves this way):** Use the `dependencies` parameter on `APIRouter`: `router = APIRouter(prefix="/admin", dependencies=[Depends(get_current_user), Depends(require_admin)])`. All routes registered on this router require both authentication and admin role. The dependencies run before each route's own dependencies. This is DRY — you don't repeat the auth dependency on every route. You can also add router-level dependencies when including: `app.include_router(admin_router, dependencies=[Depends(get_current_user)])`.
- **The Unforgettable Mental Model:** The **Gated Community**. Instead of checking ID at every house (endpoint), you check it at the community gate (router). Everyone inside the community is verified.
- **The Trap:** Assuming router-level dependencies inject values into endpoints. They run for side effects only. If the endpoint needs the user, also declare it as a parameter.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use APIRouter's dependencies parameter to protect all routes in a router. This is DRY — no repeating auth on every route. Router-level dependencies run for side effects; if the endpoint needs the user, I also declare it as a parameter."

#### How do you make some routes public and others protected?
- **The Engine Mechanism (Why it behaves this way):** Only add auth dependencies to routes that need protection. Public routes have no auth dependency: `@app.get("/public") def public(): return {"msg": "Anyone can see this"}`. Protected routes have auth dependencies: `@app.get("/protected") def protected(current_user: User = Depends(get_current_user)): return {"msg": f"Hello {current_user.name}"}`. For routers, use router-level dependencies for protected routes and a separate router (without dependencies) for public routes. Or use per-route dependencies on a shared router.
- **The Unforgettable Mental Model:** The **Museum Layout**. The lobby (public routes) is open to everyone. The exhibit halls (protected routes) require a ticket (auth). Some museums put the ticket check at the entrance (router-level); others check at each hall (per-route).
- **The Trap:** Using router-level dependencies when some routes in the router should be public. Router-level dependencies apply to ALL routes. Use per-route dependencies for mixed access.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I only add auth dependencies to routes that need protection. For routers with mixed access, I use per-route dependencies. For routers where all routes are protected, I use router-level dependencies. I separate public and protected routes into different routers when possible."

#### How do you protect routes with multiple requirements?
- **The Engine Mechanism (Why it behaves this way):** Chain multiple dependencies: `@app.get("/admin/items", dependencies=[Depends(get_current_user), Depends(require_admin)])`. Both dependencies run — if either raises an exception, the endpoint is blocked. Or compose them: `def require_admin_user(current_user: User = Depends(get_current_user)): if not current_user.is_admin: raise HTTPException(403); return current_user`. The composed dependency depends on the auth dependency, creating a dependency chain. This is cleaner than listing multiple dependencies.
- **The Unforgettable Mental Model:** The **Multi-Lock Door**. The door has two locks: the key lock (auth) and the deadbolt (role check). Both must be unlocked to enter. Or you can have a smart lock (composed dependency) that checks both conditions.
- **The Trap:** Listing dependencies that don't compose well. If dependency A depends on dependency B, listing both separately creates redundant execution. Use composed dependencies instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I chain multiple dependencies for multiple requirements, or compose them into a single dependency that depends on the others. Composed dependencies are cleaner — require_admin_user depends on get_current_user, creating a clear dependency chain."

#### How do you test protected routes?
- **The Engine Mechanism (Why it behaves this way):** Test with valid tokens: `token = create_token({"sub": "testuser"}); response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})`. Test without token (401): `response = client.get("/protected")`. Test with invalid token (401): `response = client.get("/protected", headers={"Authorization": "Bearer invalid"})`. Override the auth dependency for faster tests: `app.dependency_overrides[get_current_user] = lambda: mock_user`. Test both the auth layer and the endpoint logic separately.
- **The Unforgettable Mental Model:** The **Penetration Test**. You try every entrance: with a valid key (valid token), without a key (no token), with a fake key (invalid token). Each should behave correctly.
- **The Trap:** Only testing with valid tokens. Test unauthorized access (no token), invalid tokens, and expired tokens. Each should return 401.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test protected routes with valid tokens (200), no tokens (401), and invalid tokens (401). For faster tests, I override get_current_user with a mock user. I test both the auth layer and the endpoint logic — auth tests verify protection, endpoint tests verify business logic."

## 8. Active recall test

1. **How do you protect a route in FastAPI?**
   - **Explanation:** Add an auth dependency — either as dependencies=[Depends(get_current_user)] or as a parameter current_user: User = Depends(get_current_user). If auth fails, 401 is returned.

2. **What's the difference between dependencies=[] and parameter injection?**
   - **Explanation:** dependencies=[] runs the dependency for side effects only (no value injection). Parameter injection runs the dependency AND injects the return value into the endpoint.

3. **How do you protect all routes in a router?**
   - **Explanation:** Use APIRouter's dependencies parameter: APIRouter(dependencies=[Depends(get_current_user)]). All routes in the router require auth.

4. **How do you handle mixed public/protected routes?**
   - **Explanation:** Only add auth dependencies to protected routes. Use separate routers for public vs. protected, or per-route dependencies on a shared router.

5. **How do you protect routes with multiple requirements?**
   - **Explanation:** Chain multiple dependencies or compose them into a single dependency. Composed dependencies are cleaner — one depends on another.

6. **How do you test protected routes?**
   - **Explanation:** Test with valid tokens (200), no tokens (401), invalid tokens (401). Override get_current_user with mock for faster tests.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Protect Routes in FastAPI should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Protect Routes in FastAPI, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Protect Routes in FastAPI.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
