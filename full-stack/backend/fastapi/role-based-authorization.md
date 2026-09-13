# Role-Based Authorization (RBAC) in FastAPI: Role Checkers, Permissions, and Scopes

## 1. Why This Exists — The Problem First

Imagine building an API for a team collaboration platform. On day one, your system has two kinds of users: standard users and administrators. Whenever an endpoint needs admin-only privileges, you write a quick check directly inside the route function:

```python
@app.delete("/projects/{project_id}")
async def delete_project(project_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    # delete project logic...
```

Six months later, your product team expands. They introduce five new roles: `team_lead`, `billing_manager`, `external_auditor`, `compliance_officer`, and `read_only_guest`. Suddenly, deleting a project can be performed by either a `superadmin` or a `team_lead` of that specific department, but never a `billing_manager`. An `external_auditor` needs read access to invoices and logs across all teams, but zero access to project source code.

Because authorization checks were scattered inside 80 individual route handlers across 15 router files, updating access rules turns into a high-stakes scavenger hunt. A developer updates 79 endpoints but forgets one legacy export route. Another engineer writes `if current_user.role == "user": raise HTTPException(403)`, accidentally granting full access to `read_only_guest` because the guest's role string does not equal `"user"`. 

The result is privilege escalation, broken security audits, and leaked customer data.

FastAPI's role-based authorization patterns solve this by pulling access control out of the business logic and placing it into declarative, reusable dependency pipelines. Instead of hand-rolling if-statements in every handler, you define parameterized dependency factories and permission matrices once, attaching them cleanly to routes or whole routers.

## 2. The Analogy — Make It Obvious

Think of an international airport and its secure facility access:

When you enter the terminal building, airport security checks your passport and boarding pass. They verify your identity. If your passport is fake or missing, security turns you away at the front door. That is **Authentication** (HTTP 401 Unauthorized: *We do not know who you are*).

Once inside, everyone holds an identification badge with different clearance levels. That badge controls which doors open when tapped against an electronic reader. This is **Authorization** (HTTP 403 Forbidden: *We know who you are, but you cannot enter this room*).

- **Coarse Role-Based Access Control (RBAC):** Your badge has a giant label stamped on it: `PILOT`, `FLIGHT_ATTENDANT`, `PASSENGER`, or `MECHANIC`. The cockpit door reader is programmed to unlock only if the badge says `PILOT`.
- **Fine-Grained Permission-Based Access Control (PBAC):** Instead of checking job titles, doors check for specific capabilities stamped on a digital chip inside the badge: `door:cockpit_enter`, `cargo:load`, `fuel:dispense`. A flight engineer might not have the title `PILOT`, but their badge chip holds the `door:cockpit_enter` permission.
- **Context-Aware Attribute-Based Access Control (ABAC):** Even if a pilot has the `PILOT` title and the `door:cockpit_enter` capability, the scanner checks dynamic context: *Is this pilot assigned to flight AA123 departing at 14:00 from Gate B12 right now?* If they try to enter a different aircraft at Gate D5, the door stays locked.
- **OAuth2 Scopes:** You are a delivery driver bringing catering to the aircraft. You are given a temporary visitor badge stamped with specific destination zones: `["terminal_b", "gate_b12"]`. If you wander toward the VIP lounge, the guard inspects the scopes on your visitor pass and stops you.

In FastAPI, dependency injection acts as the electronic badge reader installed directly onto the door frame of each endpoint before the handler code is ever reached.

## 3. How It Actually Works — The Full Explanation

FastAPI handles authorization as a multi-stage dependency pipeline during the HTTP request lifecycle. When an incoming HTTP request hits a protected endpoint, FastAPI resolves the dependency graph from the outside in:

1. **Authentication Step (`get_current_user`):** The dependency extracts the Bearer token from the `Authorization` header, verifies its cryptographic signature, checks expiration, and retrieves the user record (either from token claims or a database query). If the token is invalid or missing, it immediately raises an `HTTPException(status_code=401)`.
2. **Authorization Step (The Role or Permission Dependency):** FastAPI passes the resolved `current_user` into an authorization dependency. This dependency compares the user's roles, permissions, or token scopes against the route's requirements. If the user does not qualify, it raises an `HTTPException(status_code=403)`.
3. **Route Handler Execution:** The actual route handler function only executes if all dependencies in the chain resolve cleanly without raising exceptions.

**The Callable Class Dependency Factory:**
A common beginner mistake is writing a separate standalone function for every single role check: `def require_admin()`, `def require_manager()`, `def require_editor()`. This duplicates code and fails when routes allow multiple roles (e.g., both admins and managers).

In Python, a class that implements the `__call__` dunder method is an instance that can be invoked just like a standard function. FastAPI's `Depends()` accepts any callable object. This enables the Callable Class Dependency Factory pattern:
1. The class `__init__` receives the access configuration when the app starts (for example, a list of allowed roles or required permissions).
2. The `__call__` method acts as the actual FastAPI dependency executed at request time, receiving `current_user = Depends(get_current_user)`.
3. If the user's role is not present in the preconfigured allowed list, `__call__` raises `HTTPException(status_code=403)`.

This pattern gives you parameterized dependencies with full type safety and zero code duplication.

**Coarse RBAC vs. Fine-Grained PBAC:**
As an application scales, coarse roles (like `admin`, `editor`, `viewer`) run into role explosion. You end up creating dozens of niche roles like `billing_editor`, `content_admin_no_billing`, and `auditor_read_only`.

Senior architectures decouple roles from permissions:
- Permissions represent discrete business actions: `users:create`, `users:read`, `users:delete`, `billing:export`, `analytics:view`.
- Roles become simple containers (bundles) of permissions assigned to users. For example, the `manager` role contains `{"users:read", "billing:export", "analytics:view"}`.
- Route endpoints guard on permissions, not raw roles. The dependency takes required permissions, resolves the user's assigned role through a permission mapping matrix, and verifies that all required permissions are present. When product requirements change, you simply adjust the permission matrix in one configuration file without touching route handlers.

**OAuth2 Scopes and Security():**
FastAPI provides native support for OAuth2 scopes through `fastapi.Security` and `fastapi.security.SecurityScopes`.

While RBAC defines what a user is allowed to do, OAuth2 scopes limit what a third-party client or token is permitted to do on the user's behalf. For example, a user might be a full admin, but when they generate a personal access token for a CI/CD pipeline, they give it only the `deployments:write` scope.

When an endpoint uses `Security(get_current_user_with_scopes, scopes=["users:write"])`, FastAPI automatically passes a `SecurityScopes` object into the dependency. The dependency verifies that the token's granted scopes satisfy every required scope for that route. Additionally, FastAPI inspects these scopes to automatically generate accurate OpenAPI and Swagger UI documentation, showing lock icons and exact scope requirements per endpoint.

**Multi-Tenant Organization RBAC:**
In modern B2B SaaS platforms, authorization is rarely global. A single user might be an `admin` in Organization A (their company) and a simple `viewer` in Organization B (a client company).

To handle multi-tenancy, the authorization dependency must inspect both the authenticated user and the request path parameters (such as `org_id`):
1. The dependency extracts `org_id` from the route path: `/orgs/{org_id}/invoices`.
2. It looks up the user's role specifically within that organization's membership table or JWT tenant claims.
3. It validates that the user's tenant-scoped role satisfies the endpoint's requirements.

## 4. Real Code — See It Working

Here is a complete, production-grade implementation of Role-Based and Permission-Based authorization in FastAPI using Enums, callable class factories, OAuth2 scopes, and multi-tenant context.

```python
from enum import Enum
from typing import Annotated, Sequence
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Path, Security, status
from fastapi.security import OAuth2PasswordBearer, SecurityScopes
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# 1. Enums and Permission Matrix
# ---------------------------------------------------------------------------

class Role(str, Enum):
    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    BILLING_MANAGER = "billing_manager"
    MEMBER = "member"
    GUEST = "guest"

class Permission(str, Enum):
    USER_READ = "users:read"
    USER_WRITE = "users:write"
    USER_DELETE = "users:delete"
    BILLING_READ = "billing:read"
    BILLING_WRITE = "billing:write"
    ANALYTICS_READ = "analytics:read"

# Centralized role-to-permission mapping matrix
ROLE_PERMISSIONS: dict[Role, set[Permission]] = {
    Role.SUPERADMIN: {
        Permission.USER_READ,
        Permission.USER_WRITE,
        Permission.USER_DELETE,
        Permission.BILLING_READ,
        Permission.BILLING_WRITE,
        Permission.ANALYTICS_READ,
    },
    Role.ADMIN: {
        Permission.USER_READ,
        Permission.USER_WRITE,
        Permission.BILLING_READ,
        Permission.ANALYTICS_READ,
    },
    Role.BILLING_MANAGER: {
        Permission.USER_READ,
        Permission.BILLING_READ,
        Permission.BILLING_WRITE,
    },
    Role.MEMBER: {
        Permission.USER_READ,
        Permission.ANALYTICS_READ,
    },
    Role.GUEST: {
        Permission.ANALYTICS_READ,
    },
}

# ---------------------------------------------------------------------------
# 2. Schemas and User Model
# ---------------------------------------------------------------------------

class OrgMembership(BaseModel):
    org_id: str
    role: Role

class User(BaseModel):
    id: str
    email: str
    global_role: Role
    org_memberships: dict[str, Role] = {}
    is_active: bool = True

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="token",
    scopes={
        "users:read": "Read user records",
        "users:write": "Create or update user records",
        "billing:write": "Manage payments and invoices",
    },
)

# Simulated database of users
FAKE_USERS_DB: dict[str, User] = {
    "alice_jwt": User(
        id="usr_1",
        email="alice@supercorp.com",
        global_role=Role.ADMIN,
        org_memberships={"org_acme": Role.ADMIN, "org_beta": Role.MEMBER},
    ),
    "bob_jwt": User(
        id="usr_2",
        email="bob@consulting.com",
        global_role=Role.MEMBER,
        org_memberships={"org_acme": Role.GUEST, "org_beta": Role.BILLING_MANAGER},
    ),
}

# ---------------------------------------------------------------------------
# 3. Base Authentication Dependency with OAuth2 Scopes
# ---------------------------------------------------------------------------

async def get_current_user(
    security_scopes: SecurityScopes,
    token: Annotated[str, Depends(oauth2_scheme)],
) -> User:
    # 401 Unauthorized is used when identity cannot be verified
    authenticate_value = (
        f'Bearer scope="{security_scopes.scope_str}"'
        if security_scopes.scopes
        else "Bearer"
    )
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": authenticate_value},
    )

    user = FAKE_USERS_DB.get(token)
    if not user or not user.is_active:
        raise credentials_exception

    # If OAuth2 scopes were specified on the endpoint, verify them against user permissions
    if security_scopes.scopes:
        user_permissions = ROLE_PERMISSIONS.get(user.global_role, set())
        for required_scope in security_scopes.scopes:
            if Permission(required_scope) not in user_permissions:
                # 403 Forbidden is used when user identity is known but token lacks required scope
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Not enough permissions. Missing scope: {required_scope}",
                    headers={"WWW-Authenticate": authenticate_value},
                )

    return user

# ---------------------------------------------------------------------------
# 4. Callable Class Dependency Factories for RBAC and PBAC
# ---------------------------------------------------------------------------

class RoleChecker:
    """Checks if current user has any of the permitted global roles."""
    def __init__(self, allowed_roles: Sequence[Role]) -> None:
        self.allowed_roles = set(allowed_roles)

    def __call__(self, current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.global_role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.global_role.value}' does not have access to this resource.",
            )
        return current_user

class PermissionChecker:
    """Checks if current user's role contains all required fine-grained permissions."""
    def __init__(self, required_permissions: Sequence[Permission]) -> None:
        self.required_permissions = set(required_permissions)

    def __call__(self, current_user: Annotated[User, Depends(get_current_user)]) -> User:
        user_permissions = ROLE_PERMISSIONS.get(current_user.global_role, set())
        missing = self.required_permissions - user_permissions
        if missing:
            missing_names = ", ".join(p.value for p in missing)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Missing: {missing_names}",
            )
        return current_user

class OrgRoleChecker:
    """Checks user role scoped to a specific organization path parameter."""
    def __init__(self, allowed_roles: Sequence[Role]) -> None:
        self.allowed_roles = set(allowed_roles)

    def __call__(
        self,
        org_id: Annotated[str, Path(description="The organization ID")],
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        user_org_role = current_user.org_memberships.get(org_id)
        if not user_org_role or user_org_role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied for organization '{org_id}'.",
            )
        return current_user

# ---------------------------------------------------------------------------
# 5. Protected Routers and Route Handlers
# ---------------------------------------------------------------------------

app = FastAPI(title="RBAC Enterprise API")

# Example A: Route-level coarse role check (Superadmin or Admin)
@app.delete(
    "/system/cache",
    dependencies=[Depends(RoleChecker([Role.SUPERADMIN, Role.ADMIN]))],
)
async def purge_cache():
    return {"status": "Cache purged successfully"}

# Example B: Route-level fine-grained permission check (PBAC)
@app.post("/billing/invoices")
async def create_invoice(
    # The dependency returns the verified user so the handler can use their details
    current_user: Annotated[User, Depends(PermissionChecker([Permission.BILLING_WRITE]))],
):
    return {"message": "Invoice created", "created_by": current_user.email}

# Example C: OAuth2 Scopes declared via Security()
@app.get("/users/me")
async def read_my_profile(
    current_user: Annotated[User, Security(get_current_user, scopes=["users:read"])],
):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.global_role,
    }

# Example D: Multi-tenant organization route
@app.get("/orgs/{org_id}/reports")
async def read_org_reports(
    org_id: str,
    current_user: Annotated[User, Depends(OrgRoleChecker([Role.ADMIN, Role.BILLING_MANAGER]))],
):
    return {
        "org_id": org_id,
        "role_in_org": current_user.org_memberships[org_id],
        "data": ["Quarterly Report Q1", "Annual Balance 2026"],
    }

# Example E: Entire Router protected by a default role policy
admin_router = APIRouter(
    prefix="/admin",
    dependencies=[Depends(RoleChecker([Role.SUPERADMIN, Role.ADMIN]))],
)

@admin_router.get("/audit-logs")
async def get_audit_logs():
    return {"logs": ["User alice deleted project 42", "User bob updated billing"]}

app.include_router(admin_router)
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the exact difference between HTTP 401 Unauthorized and HTTP 403 Forbidden in an authorization system?**

HTTP 401 Unauthorized strictly means unauthenticated. The client has either provided no credentials or provided invalid, expired, or malformed credentials. The server cannot verify who the client is. A 401 response must include a `WWW-Authenticate` response header specifying the authentication scheme (e.g., `WWW-Authenticate: Bearer`). When a frontend client receives a 401, its response interceptor should trigger a token refresh flow or redirect the user to the login screen.

HTTP 403 Forbidden means authenticated, but unauthorized. The server successfully identified the user (the JWT is valid and the user exists), but the user's role or permissions do not grant access to the requested resource. When a frontend client receives a 403, it should display an "Access Denied" or "Contact your administrator" notification. Triggering a login redirect or refresh token loop on a 403 is a critical frontend bug because re-authenticating will only yield the same insufficient privileges.

**Q: Why is a callable class (`RoleChecker`) preferred over simple nested closure functions for FastAPI dependency injection?**

A closure factory (`def require_role(roles): def dep(user=...): ... return dep`) works, but a callable class (`class RoleChecker`) provides distinct architectural advantages:
1. Type Safety and Inspection: A class instance allows IDEs and type checkers (like mypy and pyright) to infer explicit attribute types cleanly.
2. Reusability and Extensibility: You can subclass `RoleChecker` into specialized checkers (such as `OrgRoleChecker` or `HierarchicalRoleChecker`) using standard object-oriented inheritance without rewriting boilerplate.
3. Clean Debugging and Metadata: In tests and introspective tools, `type(checker)` shows a descriptive class name rather than an anonymous `<function require_role.<locals>.dep at 0x...>`, making debugging and dependency inspection straightforward.

**Q: What is the difference between RBAC, PBAC, and ABAC, and when should you transition between them?**

RBAC (Role-Based Access Control) assigns static roles (Admin, Member) to users and guards routes based on those roles. It works well for early-stage applications with 2 to 5 distinct personas.

PBAC (Permission-Based Access Control) introduces a level of indirection. Routes require specific permissions (`documents:delete`), and roles are simply named sets of permissions. This prevents role explosion when business teams want hybrid roles (e.g., a "Support Lead" who can read billing but cannot delete accounts).

ABAC (Attribute-Based Access Control) evaluates dynamic attributes at evaluation time: user attributes (department, clearance), resource attributes (document owner, project status), and environmental attributes (time of day, client IP address, geolocation). You transition to ABAC when access rules depend on context—such as "Users can only edit documents that they own and that are still in 'Draft' status during standard business hours."

**Q: How do OAuth2 Scopes in FastAPI differ from standard RBAC, and when should you use `Security()` instead of `Depends()`?**

RBAC represents the inherent authority of the human user. OAuth2 Scopes represent delegated authority granted to an application or token acting on the user's behalf. A user who is a Superadmin might generate an API key with only `reports:read` scope to connect a reporting widget. Even though the user has admin rights, the token itself is constrained by its scopes.

In FastAPI, you use `Depends()` for general dependency injection and standard role checks. You use `Security()` when an endpoint requires specific OAuth2 scopes. `Security()` accepts a list of `scopes` strings, injects a `SecurityScopes` object into the underlying dependency, and automatically documents the required scopes in the OpenAPI/Swagger specification with interactive lock badges.

**Q: How do you implement resource-level authorization where a user can edit their own resource, but only an administrator can edit anyone's resource?**

Resource-level authorization requires fetching the specific database entity before deciding access. The cleanest pattern in FastAPI is a dedicated dependency that loads the resource, inspects ownership, and falls back to role checks:

```python
async def get_editable_document(
    doc_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Document:
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    is_owner = (doc.owner_id == current_user.id)
    is_admin = (current_user.global_role == Role.ADMIN)
    
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You do not have permission to edit this document")
    
    return doc
```

This ensures that endpoint handlers receive a fully validated, authorized object, preventing IDOR (Insecure Direct Object Reference) vulnerabilities.

**Q: How do you mock or override role-based dependencies in automated integration tests?**

FastAPI provides the `app.dependency_overrides` dictionary, which allows you to replace any dependency function or callable class instance during testing without spinning up mock authentication servers or generating real JWTs:

```python
from fastapi.testclient import TestClient

client = TestClient(app)

def test_admin_route_as_regular_user_fails():
    # Mock current user as a standard member
    app.dependency_overrides[get_current_user] = lambda: User(
        id="mock_user",
        email="test@user.com",
        global_role=Role.MEMBER,
    )
    
    response = client.delete("/system/cache")
    assert response.status_code == 403
    
    # Always clean up overrides after test completion
    app.dependency_overrides.clear()
```

For testing individual role checkers, you can also override the exact checker instance itself.

## 6. The Traps — What Goes Wrong

**The Accidental AND Dependency Chain (Chaining Depends for OR logic):**
When developers want an endpoint accessible by either an `Admin` OR a `BillingManager`, they sometimes write:
```python
# BROKEN: This requires the user to be BOTH Admin AND BillingManager simultaneously
@app.get("/invoices", dependencies=[Depends(RoleChecker([Role.ADMIN])), Depends(RoleChecker([Role.BILLING_MANAGER]))])
```
FastAPI executes all dependencies in the list sequentially. If the first dependency fails, it immediately raises a 403 exception, aborting the request before the second dependency is ever evaluated. To express OR logic, pass multiple roles to a single dependency factory: `Depends(RoleChecker([Role.ADMIN, Role.BILLING_MANAGER]))`.

**The Stale Token Claims Trap (JWT Revocation Lag):**
Storing roles exclusively inside JWT claims avoids database lookups, but creates a severe authorization lag. If an employee is fired or demoted, their issued JWT continues to carry the `admin` role until the token expires (often 1 to 24 hours). 

In high-security environments, you must either:
- Keep JWT lifetimes very short (5 to 15 minutes) paired with refresh token validation.
- Store a `token_version` or `role_version` integer in the database or cache. The dependency checks if `jwt.role_version == user.current_role_version`. When a user's role is modified, incrementing their version invalidates all existing active tokens instantly.

**Insecure Direct Object Reference (IDOR) from Relying Solely on Coarse RBAC:**
A common security failure is assuming that protecting an endpoint with `RoleChecker([Role.MEMBER])` makes it secure:
```python
# VULNERABLE: Any authenticated member can read ANY user's private medical report by guessing the ID
@app.get("/reports/{report_id}", dependencies=[Depends(RoleChecker([Role.MEMBER]))])
async def get_report(report_id: str, db: Session = Depends(get_db)):
    return db.query(Report).filter(Report.id == report_id).first()
```
Coarse RBAC only validates that the caller is a logged-in member. It does not verify that the report actually belongs to them. Always enforce entity-level ownership checks inside a dependency or service layer when querying specific IDs.

**Leaking Resource Existence via 403 on Non-Existent Resources:**
If a route checks permissions after querying an entity by ID, an attacker can discover valid object IDs:
- Querying `/documents/doc_123` (exists, but unauthorized) returns `403 Forbidden`.
- Querying `/documents/doc_999` (does not exist) returns `404 Not Found`.

By observing the difference between 403 and 404, an attacker can enumerate private resource IDs. In sensitive multi-tenant systems, either perform tenant scoping directly in the SQL WHERE clause (`WHERE id = :id AND org_id = :user_org_id`) returning 404 in both cases, or evaluate authorization policies uniformly before returning entity-specific errors.

**Accidental Router-Level Lockouts:**
Applying a role checker to an `APIRouter(dependencies=[Depends(RoleChecker([Role.ADMIN]))])` secures every route on that router. However, developers often forget that child routes or health checks added to that router inherit the dependency. If you mount a webhook callback or public summary route on the same router, external services will receive unexpected 403 errors. Keep administrative and public routes in strictly separated router instances.

## 7. Compare With Related Concepts

- **Authentication vs. Authorization:** Authentication (`get_current_user`) verifies identity (*"Who are you?"*), returning 401 when invalid. Authorization (`RoleChecker`) verifies permission (*"What are you allowed to do?"*), returning 403 when insufficient.
- **RBAC (Role-Based) vs. PBAC (Permission-Based):** RBAC matches user roles directly to routes (`admin -> /admin-panel`). PBAC matches user roles to granular action keys (`admin -> [users:delete]`), and routes guard against the action keys. PBAC prevents role explosion as permissions multiply.
- **FastAPI `Depends()` vs. FastAPI `Security()`:** Both inject dependencies and resolve request lifecycles. `Security()` additionally takes a `scopes` list, injects `SecurityScopes` into the callable, and exposes scope requirements directly into OpenAPI/Swagger docs.
- **Endpoint-Level Authorization vs. Database Row-Level Security (RLS):** Endpoint checks guard route execution in Python. Database RLS (e.g., PostgreSQL policies) enforces access constraints at the storage engine level, ensuring that even if a developer writes a buggy SQL query without a tenant filter, the database will never return rows belonging to another organization.

## 8. 🧠 The Memory Hook

Authentication asks **"Who are you?"** (401 if you have no badge). Authorization asks **"What doors can you unlock?"** (403 if your badge lacks clearance). 

Never hardcode the security guard inside the room with `if user.role != 'admin'`. Install a parameterized `RoleChecker` dependency lock directly on the door frame.
