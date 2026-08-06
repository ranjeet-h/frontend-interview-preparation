# Role-Based Authorization in FastAPI

## Detailed explanation

Role-based authorization checks user roles before allowing route actions. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

RBAC dependencies reject users without required role.

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

#### What is role-based authorization (RBAC) in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** RBAC checks if the authenticated user has the required role before allowing access to a route. After authentication (JWT verification), an authorization dependency checks the user's role: `def require_role(required_role: str): def checker(current_user: User = Depends(get_current_user)): if required_role not in current_user.roles: raise HTTPException(403, "Forbidden"); return current_user; return checker`. Routes use it: `@app.delete("/items/{id}", dependencies=[Depends(require_role("admin"))])`. If the user lacks the role, 403 is returned. RBAC separates authentication (who you are) from authorization (what you can do).
- **The Unforgettable Mental Model:** The **Clearance Levels**. Authentication verifies your identity (you are John). Authorization checks your clearance level (John has admin clearance). The vault (route) requires admin clearance — regular users are denied even if authenticated.
- **The Trap:** Confusing 401 and 403. 401 means "not authenticated" (no valid token). 403 means "authenticated but not authorized" (valid token, wrong role). They require different client responses.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: RBAC checks the authenticated user's role before allowing access. After JWT verification, an authorization dependency checks if the user has the required role. If not, 403 is returned. I separate authentication (who you are) from authorization (what you can do) — 401 for unauthenticated, 403 for unauthorized."

#### How do you implement a role-checking dependency?
- **The Engine Mechanism (Why it behaves this way):** Create a factory function that returns a dependency: `def require_role(role: str): def checker(current_user: User = Depends(get_current_user)): if role not in current_user.roles: raise HTTPException(status_code=403, detail=f"Role {role} required"); return current_user; return checker`. Use it on routes: `@app.delete("/users/{id}", dependencies=[Depends(require_role("admin"))])`. The factory pattern allows parameterized dependencies — the same dependency logic with different role requirements. For multiple roles, use `if not any(r in current_user.roles for r in required_roles)`.
- **The Unforgettable Mental Model:** The **Custom Key Maker**. The factory (require_role) creates a custom key (dependency) for each lock (route). The admin lock needs an admin key, the editor lock needs an editor key. Same mechanism, different specifications.
- **The Trap:** Hardcoding role checks in every endpoint. This duplicates logic and makes role changes difficult. Use a parameterized dependency.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create a factory function that returns a role-checking dependency. The factory takes the required role as a parameter and returns a dependency that checks the user's roles. I use it on routes with Depends(require_role('admin')). This avoids duplicating role check logic across endpoints."

#### How do you handle multiple roles for a single route?
- **The Engine Mechanism (Why it behaves this way):** Accept a list of roles and check if the user has any of them: `def require_any_role(*roles: str): def checker(current_user: User = Depends(get_current_user)): if not any(r in current_user.roles for r in roles): raise HTTPException(403); return current_user; return checker`. Use: `@app.put("/items/{id}", dependencies=[Depends(require_any_role("admin", "editor"))])`. This allows admin OR editor access. For AND logic (user must have ALL roles), use `all(r in current_user.roles for r in roles)`.
- **The Unforgettable Mental Model:** The **Multiple Keys**. The door accepts any of several keys (OR) — admin key OR editor key opens it. Some doors require multiple keys turned simultaneously (AND) — admin AND security keys.
- **The Trap:** Using multiple `require_role` dependencies for OR logic. `dependencies=[Depends(require_role("admin")), Depends(require_role("editor"))]` requires BOTH roles (AND), not either. Use require_any_role for OR.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For OR logic (admin OR editor), I use a require_any_role dependency that checks if the user has any of the required roles. For AND logic, I check that the user has all required roles. I don't chain multiple require_role dependencies — that creates AND logic, not OR."

#### How do you implement resource-level authorization?
- **The Engine Mechanism (Why it behaves this way):** Resource-level authorization checks if the user owns or has permission for a specific resource: `def get_item_or_404(item_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)): item = db.query(Item).filter(Item.id == item_id).first(); if not item: raise HTTPException(404); if item.owner_id != current_user.id and "admin" not in current_user.roles: raise HTTPException(403); return item`. This combines resource lookup with permission check. The user can access their own resources or all resources if admin.
- **The Unforgettable Mental Model:** The **Property Deed**. You can enter your own house (own resource) regardless of your clearance level. But to enter someone else's house, you need special clearance (admin role).
- **The Trap:** Checking role before checking resource ownership. A user should access their own resources even without admin role. Check ownership first, then role.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Resource-level authorization checks if the user owns the resource or has admin role. I combine resource lookup with permission check in a single dependency. The user can access their own resources or all resources if admin. I check ownership before role — users shouldn't need admin role for their own data."

#### How do you test role-based authorization?
- **The Engine Mechanism (Why it behaves this way):** Test with users of different roles: `admin_token = create_token({"sub": "admin", "roles": ["admin"]}); user_token = create_token({"sub": "user", "roles": ["user"]})`. Test admin accessing admin routes (200), user accessing admin routes (403), and unauthenticated access (401). Override the auth dependency with mock users of different roles: `app.dependency_overrides[get_current_user] = lambda: User(id=1, roles=["admin"])`. Test each role combination for each protected route.
- **The Unforgettable Mental Model:** The **Role-Playing Test**. You test the system as different characters — the admin, the regular user, the stranger without credentials. Each should have the correct level of access.
- **The Trap**: Only testing with admin users. Test with regular users, users with wrong roles, and unauthenticated users. Each should get the appropriate response.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test RBAC with users of different roles — admin, regular user, wrong role, and unauthenticated. I verify admin gets 200, wrong role gets 403, and unauthenticated gets 401. I override get_current_user with mock users of different roles for fast, isolated tests."

#### How does RBAC scale for complex permission systems?
- **The Engine Mechanism (Why it behaves this way):** For simple apps, role-based checks work well. For complex systems, consider: (1) **Permission-based** — check specific permissions instead of roles (`can_delete_items` instead of `admin`), (2) **Attribute-based (ABAC)** — check resource attributes, user attributes, and environment conditions, (3) **Policy engines** — use OPA (Open Policy Agent) or Casbin for centralized policy management. RBAC is a good starting point — migrate to more complex systems only when role combinations become unmanageable.
- **The Unforgettable Mental Model:** The **Key Ring**. RBAC is a key ring with a few keys (admin, editor, viewer). As the building grows, you need more keys (permissions) and a key management system (policy engine). Start simple, scale when needed.
- **The Trap**: Over-engineering permissions for a small app. RBAC handles most use cases. Don't add a policy engine until you have 10+ roles with complex combinations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: RBAC handles most use cases well. For complex systems, I consider permission-based checks (specific actions instead of roles) or policy engines (OPA, Casbin). But I start with RBAC and only migrate when role combinations become unmanageable. Premature complexity is worse than simple roles."

## 8. Active recall test

1. **What is role-based authorization?**
   - **Explanation:** Checks if the authenticated user has the required role before allowing access. Returns 403 if the user lacks the role. Separates authentication (who) from authorization (what).

2. **How do you implement a role-checking dependency?**
   - **Explanation:** Create a factory function that takes the required role and returns a dependency. The dependency checks the user's roles and raises 403 if the required role is missing.

3. **How do you handle OR logic for multiple roles?**
   - **Explanation:** Use a require_any_role dependency that checks if the user has any of the required roles. Don't chain multiple require_role dependencies — that creates AND logic.

4. **How do you implement resource-level authorization?**
   - **Explanation:** Check if the user owns the resource OR has admin role. Combine resource lookup with permission check in a single dependency. Check ownership before role.

5. **What's the difference between 401 and 403?**
   - **Explanation:** 401 means unauthenticated (no valid token). 403 means authenticated but not authorized (valid token, wrong role or insufficient permissions).

6. **When should you move beyond RBAC?**
   - **Explanation:** When role combinations become unmanageable (10+ roles with complex overlaps). Consider permission-based checks or policy engines like OPA or Casbin.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Role-Based Authorization in FastAPI should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Role-Based Authorization in FastAPI, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Role-Based Authorization in FastAPI.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
