# Role-Based Access Control (RBAC) in API Design: Granular Permissions, Hierarchies, and ABAC Hybrid Models

## 1. Why This Exists — The Problem First

Imagine building an enterprise billing platform. At launch, you create two roles: `admin` and `member`. Inside your route handlers, you scatter checks like `if (req.user.role === 'admin')` across 120 different API endpoints. It works cleanly for three months.

Then reality strikes. The operations team hires Customer Support representatives who need to view user invoices and issue partial refunds up to $50, but must never delete user accounts, alter subscription plans, or export company financial reports. Next, the sales team hires Account Managers who need to create custom invoices for their assigned clients but cannot touch anyone else's data.

Because your routes check raw role names, you are forced to manually find, modify, test, and redeploy dozens of route files to replace `if (req.user.role === 'admin')` with fragile checks like `if (['admin', 'support_lead'].includes(req.user.role))`. Two weeks later, a support agent executes `DELETE /api/v1/organizations/42` because a newly merged endpoint checked `if (req.user.role !== 'member')`.

Worse, what happens when Alice is the `Owner` of Organization A (her personal startup) but a `Viewer` in Organization B (her client's enterprise workspace)? A flat `role: "admin"` claim inside a single JWT token either leaks god-mode privileges across every organization or crashes under multi-tenant isolation.

Hardcoding role strings into API endpoints leads directly to privilege escalation vulnerabilities, role explosion, and fragile codebases. Robust API authorization separates **Roles** (identity bundles assigned to users) from **Permissions** (granular actions executed on resources), evaluates context attributes like ownership and tenancy at the service layer, and enforces safety boundaries all the way down to the database.

## 2. The Analogy — Make It Obvious

Think of an international commercial airport.

**The Naive Role Approach (The Master Key):**
Imagine handing employees physical keys labeled "Pilot Key" or "Cleaner Key". Every door in the airport has a lock fitted specifically for the "Pilot Key". When the airport hires Flight Attendants who need access to the aircraft cabin and briefing rooms—but not the engine maintenance bay—the airport locksmith must re-key hundreds of doors across five terminals just to accept a new "Flight Attendant Key".

**The Granular Permission System (The RFID Badge Reader):**
Instead, modern airports install electronic RFID scanners at every single door. The scanner at the jet bridge does not care what your job title is; it only checks for one specific capability: `aircraft:board`. The scanner at the runway gate checks for `runway:enter`. The scanner at the baggage carousel checks for `baggage:load`.

**Roles as Bundles:**
Your job title is simply a credential profile stored in the central security registry:
- The **Captain** role is assigned permissions: `[runway:enter, aircraft:board, flight_deck:operate, briefing_room:access]`.
- The **Flight Attendant** role is assigned permissions: `[aircraft:board, briefing_room:access]`.
- When airline policy changes to allow flight attendants into the crew lounge, the security administrator adds `lounge:access` to the "Flight Attendant" role in the central computer. Not a single door lock or badge scanner is modified.

**Role Hierarchies (Clearance Tiers):**
The Airport Director role inherits all permissions granted to Terminal Managers, who inherit all permissions granted to Gate Supervisors, who inherit all permissions granted to Gate Agents. Higher tiers automatically possess the capabilities of lower tiers without duplicating permission definitions.

**Attribute-Based Control / ABAC (Context Scanners):**
Having the `aircraft:board` permission on your badge gives you the right to board *an* airplane in theory. But the biometric scanner at Gate B12 checks the flight roster attributes:
1. Is this pilot assigned to Flight 402 departing from Gate B12 today? (`flight.crew_ids.includes(pilot.id)`)
2. Is the departure time within the next 90 minutes? (`currentTime between departure - 90m and departure`)
3. Is Gate B12 located in Terminal 2 where this pilot cleared customs? (`pilot.cleared_terminal === gate.terminal`)

A pure role grants capability; attributes ensure that capability is executed only on the right resource, at the right time, inside the right organizational boundary.

## 3. How It Actually Works — The Full Explanation

Designing authorization for production APIs requires a structured progression: moving from raw roles to granular permissions, layering role inheritance, scoping access to multi-tenant boundaries, and combining RBAC with Attribute-Based Access Control (ABAC).

**The Golden Rule: Authorize Permissions, Never Roles**
API routes must never check what a user *is* (e.g., `role === 'admin'`). APIs must only check what a user *can do* (e.g., `can('invoices:refund')`).

In a clean relational or document model, authorization is structured across four distinct entities:
1. **Users:** The authenticated subjects (`user_id: "usr_123"`).
2. **Permissions:** The atomic units of capability, formatted as `<resource>:<action>` (e.g., `documents:create`, `documents:read`, `documents:delete`, `billing:export`).
3. **Roles:** Named collections of permissions (e.g., `Editor` = `['documents:create', 'documents:read', 'documents:edit']`).
4. **User_Roles Mapping:** The assignment linking a user to one or more roles.

When a client makes a request to `POST /api/v1/invoices/inv_99/refund`, the route guard middleware checks whether the requesting user possesses the `invoices:refund` permission. It does not know or care if that permission came from a `SuperAdmin`, `BillingManager`, or `SupportSpecialist` role.

**Hierarchical RBAC (Inheritance Trees)**
Managing enterprise authorization with flat roles causes massive permission duplication. If an `Admin` needs everything a `Manager` has, and a `Manager` needs everything a `Staff` member has, editing a basic permission requires updating three separate role definitions.

Hierarchical RBAC models roles as a Directed Acyclic Graph (DAG) or a parent-child inheritance tree:
- `Viewer`: `['reports:read', 'dashboards:view']`
- `Editor` (inherits `Viewer`): `['reports:create', 'reports:edit']` + inherited Viewer permissions
- `Admin` (inherits `Editor`): `['reports:delete', 'members:invite']` + inherited Editor and Viewer permissions

When resolving permissions at runtime, the authorization engine flattens the user's role hierarchy using a depth-first or breadth-first traversal (or reads a precomputed, cached permission set from Redis) to produce a single normalized array of allowed actions.

**Multi-Tenant Organization Scoping**
In modern SaaS architectures, authorization is almost never global. A single user account belongs to multiple organizations or workspaces, holding entirely different privileges in each:
- Alice in Workspace "Acme Corp": Role is `Admin`.
- Alice in Workspace "Beta Labs": Role is `Viewer`.

The user-role assignment table must always be scoped by tenant:
```sql
CREATE TABLE tenant_user_roles (
    tenant_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    role_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (tenant_id, user_id, role_id)
);
```

Every incoming API request must establish its tenant context before authorization runs:
1. Extract tenant identifier from the path parameter (`/api/v1/orgs/:orgId/...`), a custom header (`X-Tenant-ID: org_abc`), or the verified JWT claims.
2. Verify that the authenticated user is an active member of that specific tenant.
3. Load the user's permissions *specifically for that tenant*.

**The RBAC + ABAC Hybrid Model**
RBAC answers coarse capability questions: "Does this user have permission to edit documents in this organization?"
RBAC cannot answer fine-grained instance questions: "Can this user edit *this specific document* when it is marked as 'Under Review', belongs to Project Alpha, and was created by someone else?"

Trying to solve instance-level rules with pure RBAC leads to role explosion (e.g., creating roles like `ProjectAlphaDocumentEditor`, `DepartmentFinanceViewer`). Instead, production systems combine RBAC with ABAC (Attribute-Based Access Control) using a two-step policy check:

1. **Step 1: RBAC Route Guard (Fast Gate):**
   Does the user have the base permission `documents:edit`? If no, return `403 Forbidden` immediately without touching the database.
2. **Step 2: ABAC Policy Evaluation (Context Gate):**
   Evaluate business context attributes:
   - **Subject Attributes:** `user.id`, `user.department`, `user.clearance_level`.
   - **Resource Attributes:** `resource.owner_id`, `resource.status`, `resource.tenant_id`, `resource.is_locked`.
   - **Action Attributes:** `action: 'edit'`.
   - **Environment Attributes:** `request.ip`, `request.timestamp`, `request.is_vpn`.

Policy rule: A user can edit a document if:
`(user.hasPermission('documents:edit') AND resource.tenant_id === user.active_tenant_id) AND (resource.owner_id === user.id OR user.hasPermission('documents:edit_all') OR (user.department === resource.department AND resource.status === 'draft'))`.

**The Three Enforcement Layers (Defense in Depth)**
A secure API enforces authorization across three distinct boundaries:

1. **Layer 1 — API Gateway / Route Guard:**
   Validates authentication (JWT/session), resolves tenant identity, and verifies static permission claims (e.g., `documents:read`). Drops unauthorized requests at the perimeter before allocating application memory.
2. **Layer 2 — Application / Service Layer (IDOR Prevention):**
   Loads the target entity and evaluates dynamic ABAC policies, object ownership, state machine rules, and business invariants (`document.is_archived === false`).
3. **Layer 3 — Database Layer (Row-Level Security & Parameterized Scoping):**
   Ensures queries always include tenant and ownership predicates (`WHERE tenant_id = :tenant_id AND (owner_id = :user_id OR :can_view_all)`), or enforces PostgreSQL Row-Level Security (RLS) policies. Even if a developer forgets an application-level check, cross-tenant data leakage is physically blocked by the database engine.

**Real-Time Revocation & Token Strategy**
Embedding full permission lists inside stateless JWT access tokens creates a serious vulnerability: when an admin revokes a rogue employee's privileges, the employee's JWT remains valid until expiration (e.g., 1 hour).

Production architectures solve this with a hybrid caching strategy:
- Keep JWT access tokens short-lived (5 to 15 minutes).
- Store a `token_version` or `permissions_hash` on the user record in Redis.
- The API gateway verifies the cryptographic signature of the JWT, then performs an O(1) Redis check: does `jwt.token_version === redis.get(user:123:version)`?
- When an admin changes a user's role or revokes access, the API increments `token_version` in Redis. On the user's very next HTTP request, the gateway detects the version mismatch and rejects the request with `401 Unauthorized`, forcing immediate re-authentication.

## 4. Real Code — See It Working

Here is a complete, runnable TypeScript implementation showing the permission registry, role inheritance, route middleware, ABAC policy evaluator, and multi-tenant service layer.

```typescript
import { Request, Response, NextFunction } from 'express';

// ============================================================================
// 1. Types & Permission Registry
// ============================================================================

export type Permission =
  | 'documents:read'
  | 'documents:create'
  | 'documents:edit'
  | 'documents:delete'
  | 'documents:admin'
  | 'billing:view'
  | 'billing:manage';

export type RoleName = 'viewer' | 'editor' | 'manager' | 'admin';

interface RoleDefinition {
  inherits?: RoleName[];
  permissions: Permission[];
}

// Role registry defining permissions and inheritance hierarchy
export const ROLE_DEFINITIONS: Record<RoleName, RoleDefinition> = {
  viewer: {
    permissions: ['documents:read', 'billing:view'],
  },
  editor: {
    inherits: ['viewer'],
    permissions: ['documents:create', 'documents:edit'],
  },
  manager: {
    inherits: ['editor'],
    permissions: ['documents:delete'],
  },
  admin: {
    inherits: ['manager'],
    permissions: ['documents:admin', 'billing:manage'],
  },
};

// Flatten role hierarchy into a distinct set of permissions
export function resolveRolePermissions(role: RoleName): Set<Permission> {
  const resolved = new Set<Permission>();
  const visitedRoles = new Set<RoleName>();

  function traverse(currentRole: RoleName) {
    if (visitedRoles.has(currentRole)) return;
    visitedRoles.add(currentRole);

    const definition = ROLE_DEFINITIONS[currentRole];
    if (!definition) return;

    for (const perm of definition.permissions) {
      resolved.add(perm);
    }

    if (definition.inherits) {
      for (const parent of definition.inherits) {
        traverse(parent);
      }
    }
  }

  traverse(role);
  return resolved;
}

// ============================================================================
// 2. Request Context & Models
// ============================================================================

export interface AuthenticatedUser {
  id: string;
  email: string;
  // Multi-tenant membership: maps tenant_id -> assigned role
  tenantRoles: Record<string, RoleName>;
}

export interface DocumentResource {
  id: string;
  tenantId: string;
  ownerId: string;
  title: string;
  status: 'draft' | 'under_review' | 'published' | 'archived';
  department: string;
}

// Extend Express Request with authenticated and scoped context
export interface ScopedRequest extends Request {
  user?: AuthenticatedUser;
  tenantId?: string;
  userPermissions?: Set<Permission>;
}

// ============================================================================
// 3. Layer 1: Route Guard Middleware (Coarse RBAC Check)
// ============================================================================

export function requirePermission(requiredPermission: Permission) {
  return (req: ScopedRequest, res: Response, next: NextFunction): void => {
    // 1. Ensure user is authenticated
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' }
      });
      return;
    }

    // 2. Extract tenant context (from header or path param)
    const tenantId = (req.headers['x-tenant-id'] as string) || req.params.tenantId;
    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT_CONTEXT', message: 'X-Tenant-ID header is required' }
      });
      return;
    }

    // 3. Resolve role within this specific tenant
    const roleInTenant = req.user.tenantRoles[tenantId];
    if (!roleInTenant) {
      res.status(403).json({
        success: false,
        error: { code: 'TENANT_ACCESS_DENIED', message: 'User is not a member of this organization' }
      });
      return;
    }

    // 4. Resolve permissions for the tenant-scoped role
    const permissions = resolveRolePermissions(roleInTenant);
    req.tenantId = tenantId;
    req.userPermissions = permissions;

    // 5. Authorize required permission
    if (!permissions.has(requiredPermission)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Missing required permission: ${requiredPermission}`
        }
      });
      return;
    }

    next();
  };
}

// ============================================================================
// 4. Layer 2: Service Layer & ABAC Policy Evaluator
// ============================================================================

export interface PolicyContext {
  user: AuthenticatedUser;
  tenantId: string;
  permissions: Set<Permission>;
  resource: DocumentResource;
}

export class DocumentPolicy {
  /**
   * ABAC Rule for Document Updates:
   * A user can update a document IF:
   * 1. The document belongs to the active tenant AND is not archived.
   * 2. AND either:
   *    a) User has 'documents:admin' permission (override).
   *    b) User is the document owner AND document is in 'draft' or 'under_review'.
   */
  static canUpdate(ctx: PolicyContext): { allowed: boolean; reason?: string } {
    // Multi-tenant boundary check
    if (ctx.resource.tenantId !== ctx.tenantId) {
      return { allowed: false, reason: 'Cross-tenant access forbidden' };
    }

    // Lifecycle invariant
    if (ctx.resource.status === 'archived') {
      return { allowed: false, reason: 'Archived documents cannot be modified' };
    }

    // Admin override
    if (ctx.permissions.has('documents:admin')) {
      return { allowed: true };
    }

    // Ownership check
    const isOwner = ctx.resource.ownerId === ctx.user.id;
    const isMutableState = ctx.resource.status === 'draft' || ctx.resource.status === 'under_review';

    if (isOwner && isMutableState) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Only the document owner can edit non-archived drafts'
    };
  }
}

// ============================================================================
// 5. Controller & Database Layer Integration
// ============================================================================

// Mock database repository
const mockDatabase = {
  findDocumentById: async (id: string, tenantId: string): Promise<DocumentResource | null> => {
    // Database query strictly includes tenant_id in WHERE clause (Layer 3)
    if (id === 'doc_123') {
      return {
        id: 'doc_123',
        tenantId: 'tenant_acme',
        ownerId: 'usr_alice',
        title: 'Q3 Financial Strategy',
        status: 'draft',
        department: 'Finance',
      };
    }
    return null;
  },
  updateDocument: async (id: string, tenantId: string, title: string): Promise<DocumentResource> => {
    return {
      id,
      tenantId,
      ownerId: 'usr_alice',
      title,
      status: 'draft',
      department: 'Finance',
    };
  }
};

export async function updateDocumentController(req: ScopedRequest, res: Response): Promise<void> {
  const { documentId } = req.params;
  const { title } = req.body;

  // We are guaranteed req.user, req.tenantId, and req.userPermissions exist from middleware
  const tenantId = req.tenantId!;
  const user = req.user!;
  const permissions = req.userPermissions!;

  // 1. Fetch resource with strict tenant boundary (Layer 3 check)
  const document = await mockDatabase.findDocumentById(documentId, tenantId);
  if (!document) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Document not found' }
    });
    return;
  }

  // 2. Evaluate ABAC Policy at Service Layer (Layer 2 check)
  const decision = DocumentPolicy.canUpdate({
    user,
    tenantId,
    permissions,
    resource: document,
  });

  if (!decision.allowed) {
    res.status(403).json({
      success: false,
      error: { code: 'POLICY_VIOLATION', message: decision.reason }
    });
    return;
  }

  // 3. Perform mutation
  const updated = await mockDatabase.updateDocument(documentId, tenantId, title);

  res.status(200).json({
    success: true,
    data: updated
  });
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why should backend APIs authorize permissions instead of raw roles?**

Authorizing raw roles like `if (user.role === 'admin')` couples business logic directly to organizational titles. In a real company, job titles and operational responsibilities evolve continuously. If you hardcode role names across 100 endpoints, introducing a new role (like `BillingAuditor` or `ComplianceOfficer`) requires finding, modifying, testing, and redeploying dozens of route handlers.

When you authorize granular permissions instead (e.g., `requirePermission('invoices:refund')`), the API routes remain completely decoupled and static. An endpoint only asserts the capability it requires. Roles become nothing more than administrative configuration bundles in a database table. Giving a `ComplianceOfficer` access to audit logs becomes a single database write adding `audit_logs:read` to their role definition—requiring zero code changes and zero server deployments.

**Q: What is the difference between RBAC and ABAC, and when do you need a hybrid model?**

RBAC (Role-Based Access Control) grants access based purely on the subject's role and static permissions. It answers: "Does this user have the general right to execute `documents:edit`?" It is coarse-grained, fast to compute, and easy to audit.

ABAC (Attribute-Based Access Control) grants access based on dynamic attributes of the subject (department, location, clearance), the resource (creator, classification, lifecycle state, tenant), the action (read, update), and the environment (IP address, time of day, device health).

You need a hybrid model because pure RBAC cannot handle instance-level or state-dependent access without causing "role explosion" (e.g., creating hundreds of hyper-specific roles like `MarketingDraftArticleEditor`). In a hybrid model, RBAC acts as a fast perimeter guard at the API route layer to block unauthorized actions, while ABAC evaluates contextual conditions (e.g., `doc.owner_id === user.id && doc.status === 'draft'`) at the service layer before executing business logic.

**Q: How do you handle authorization in a multi-tenant SaaS API where a user has different roles in different organizations?**

You must never store a single global role on the user record or JWT. Instead, model user-role relationships as a ternary mapping: `(user_id, tenant_id, role_id)`.

On every API request, authorization follows three strict steps:
1. **Tenant Context Extraction:** Extract the target tenant from a path parameter (`/api/v1/workspaces/:workspaceId/...`) or a mandatory request header (`X-Tenant-ID`).
2. **Membership & Role Resolution:** Verify that the authenticated `user.id` has an active entry in `tenant_user_roles` for that specific `tenant_id`, and resolve the permissions assigned to that role.
3. **Tenant-Scoped Execution:** Attach the resolved `tenantId` and `permissions` set to the request context. Every downstream database query must inject `WHERE tenant_id = :tenantId` into its SQL filter to prevent Broken Object-Level Authorization (BOLA/IDOR).

**Q: Where in the request lifecycle should authorization checks be executed (Gateway vs Route Guard vs Service vs Database)?**

Authorization must be implemented as defense in depth across all layers:
- **API Gateway / Route Guard:** Enforces authentication and coarse-grained permissions (e.g., does the user have `reports:view` for this tenant?). Drops unauthorized traffic at the edge before wasting backend compute resources.
- **Service / Domain Layer:** Enforces business logic and ABAC rules. This is where IDOR/BOLA checks occur (verifying the user owns the record, verifying status is mutable, evaluating departmental access rules).
- **Database Layer:** Enforces physical isolation using parameterized tenant filters or PostgreSQL Row-Level Security (RLS). This ensures that even if an application bug bypasses a service layer check, the database engine will not return records belonging to another tenant.

**Q: How do you handle real-time permission revocation without hammering the database on every single API request?**

Stateless JWT tokens cannot be revoked before expiration without extra architecture. Fetching full user permissions from a relational database on every HTTP request creates an unacceptable database bottleneck.

The industry-standard solution uses a hybrid cache with token versioning:
1. Issue short-lived access JWTs (5 to 15 minutes) containing the `user_id`, active `tenant_id`, and a `token_version` integer (e.g., `1`).
2. Cache the user's active permissions and current `token_version` in Redis with a fast in-memory key like `user:usr_123:session`.
3. On incoming API requests, the gateway verifies the JWT signature cryptographically and checks that `jwt.token_version === redis.get('user:usr_123:token_version')` (an O(1) in-memory lookup taking < 1ms).
4. When an administrator revokes a user's role, demotes their access, or locks their account, the backend updates the database and increments the `token_version` in Redis (or invalidates `user:usr_123:permissions`).
5. On the user's next API request, the gateway detects the version mismatch, immediately rejects the request with `401 Unauthorized`, and refuses to accept the old token.

**Q: How do you design APIs to safely assign and revoke roles without privilege escalation?**

Role management endpoints (`POST /api/v1/users/:id/roles`, `DELETE /api/v1/users/:id/roles/:roleId`) are the highest-risk endpoints in any backend system. They require specific safeguards:
1. **Hierarchy Boundary Checks:** A user can only assign or revoke roles strictly lower than their own rank. An `Admin` cannot assign the `SuperAdmin` role; a `Manager` cannot promote a coworker to `Manager`.
2. **Self-Escalation Prevention:** Users cannot modify their own roles. A user cannot call the role-assignment endpoint with their own `userId` in the target payload.
3. **Last Admin Protection:** Deleting a user or removing an `Admin` role must run inside a database transaction that counts active administrators for that tenant. If `active_admin_count <= 1`, the API must reject the operation with `409 Conflict` (`LAST_ADMIN_CANNOT_BE_REMOVED`) to prevent workspace lockout.
4. **Immutable System Roles:** Built-in system roles (`Owner`, `SuperAdmin`) cannot be deleted or stripped of core permissions via the API.
5. **Structured Audit Logging:** Every role assignment, demotion, and permission change must write an immutable audit log containing actor ID, target user ID, role changes, timestamp, and client IP address.

## 6. The Traps — What Goes Wrong

**Trap 1: Authorizing by Raw Role Names in Route Handlers**
- **The Wrong Assumption:** Checking `if (req.user.role === 'admin')` inside route controllers is fast and easy to read.
- **Why It Fails:** It causes instant role explosion and makes maintenance impossible. When you introduce intermediate roles (`moderator`, `billing_agent`, `auditor`), you have to hunt through hundreds of route handlers to update array inclusion lists. Any missed route becomes an immediate security vulnerability.
- **The Fix:** Create a central permission registry. Map roles to permissions, and have your route middleware authorize permissions exclusively (`requirePermission('users:delete')`).

```typescript
// ❌ WRONG: Hardcoding raw role strings in route handlers
app.delete('/api/v1/users/:id', authenticate, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Admins only' });
  }
  // delete user...
});

// ✅ CORRECT: Authorizing an abstract permission via reusable middleware
app.delete(
  '/api/v1/users/:id',
  authenticate,
  requirePermission('users:delete'),
  deleteUserController
);
```

**Trap 2: Passing Route Guards but Failing Object-Level Authorization (BOLA / IDOR)**
- **The Wrong Assumption:** If a user passes the `requirePermission('invoices:read')` route guard, they are authorized to read any invoice requested by ID.
- **Why It Fails:** This is OWASP API #1: Broken Object-Level Authorization (BOLA). A user with a valid `Member` role in Organization A has the `invoices:read` permission. If they send `GET /api/v1/invoices/inv_org_B_999`, a route guard alone will let them pass. If the service layer queries `SELECT * FROM invoices WHERE id = :id` without checking the tenant ID or ownership, User A can view all of Organization B's private financial data.
- **The Fix:** Route guards only check capability. The service layer and database query must explicitly filter by `tenant_id` and evaluate resource ownership.

```typescript
// ❌ WRONG: Querying solely by resource ID after passing route guard
async function getInvoice(invoiceId: string) {
  return db.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
}

// ✅ CORRECT: Scoping the database query strictly to the verified tenant context
async function getInvoice(invoiceId: string, tenantId: string) {
  const invoice = await db.query(
    'SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2',
    [invoiceId, tenantId]
  );
  if (!invoice) throw new NotFoundError('Invoice not found');
  return invoice;
}
```

**Trap 3: Storing Full Permissions in Long-Lived JWTs without Revocation Mechanisms**
- **The Wrong Assumption:** Encoding all permissions directly inside a JWT payload makes the API completely stateless and avoids all database lookups.
- **Why It Fails:** If an employee is fired or demoted from `Admin` to `Viewer`, their signed JWT is still cryptographically valid until its expiration timestamp (e.g., 24 hours). The fired employee can continue executing administrative API requests using their cached JWT. Furthermore, if a user has 200 permissions, the JWT cookie or header balloons to several kilobytes, degrading network performance.
- **The Fix:** Issue short-lived access tokens (5 to 15 minutes) with tenant-scoped role names or minimal claims. Check a fast in-memory store (Redis) for session/token version validity, and resolve granular permissions on the fly or from an in-memory cache.

**Trap 4: Self-Privilege Escalation & Removing the Last Organization Admin**
- **The Wrong Assumption:** Creating a standard CRUD API for `/api/v1/organizations/:orgId/members/:userId` is sufficient for managing user roles.
- **Why It Fails:** Without defensive boundary checks, two catastrophic scenarios occur:
  1. A `Manager` calls `PUT /members/usr_self` with `{ role: 'admin' }` and promotes themselves.
  2. The sole `Owner` of an organization deletes their own account or demotes their role to `Viewer`, leaving the organization permanently orphaned with zero administrators capable of managing billing or members.
- **The Fix:** Enforce rank checks (actor rank must be strictly higher than the role being assigned), prohibit self-role mutation, and run admin deletion inside a database transaction that verifies `admin_count > 1`.

```typescript
// ✅ Safe Role Assignment Boundary Check
export async function assignRole(actor: AuthenticatedUser, targetUserId: string, newRole: RoleName, tenantId: string) {
  if (actor.id === targetUserId) {
    throw new ForbiddenError('Users cannot modify their own roles');
  }

  const actorRole = actor.tenantRoles[tenantId];
  const roleRanks: Record<RoleName, number> = { viewer: 1, editor: 2, manager: 3, admin: 4 };

  if (roleRanks[actorRole] <= roleRanks[newRole]) {
    throw new ForbiddenError('Cannot assign a role equal to or higher than your own rank');
  }

  await db.assignUserRole(tenantId, targetUserId, newRole);
}
```

**Trap 5: Relying on Frontend UI Hiding Instead of Backend Enforcement**
- **The Wrong Assumption:** Hiding the "Delete Organization" button in the React UI based on the user's role prevents non-admins from deleting organizations.
- **Why It Fails:** Frontend UI rendering is purely cosmetic for user experience; it provides zero security. Anyone can open Chrome DevTools or use `curl` / Postman to send a raw `DELETE /api/v1/organizations/42` request directly to the backend. If the backend API fails to enforce the permission independently, the resource will be deleted.
- **The Fix:** Treat the frontend as completely untrusted. The backend must enforce authentication, tenant boundary validation, route permission checks, and service-layer ABAC policies on every single HTTP request.

## 7. Compare With Related Concepts

| Authorization Model | What It Evaluates | Primary Use Case | Tradeoffs & Limitations | When to Choose |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication (AuthN)** | Verifies identity: "Who are you?" (Passkeys, passwords, JWT signature). | Perimeter entry and session validation. | Does not determine what resources or actions the identity can touch. | Must precede all authorization checks on every private API. |
| **RBAC (Role-Based Access Control)** | Static permissions assigned to roles: "What can your job title do?" | Standard enterprise dashboards, internal tools, coarse route guards. | Cannot evaluate resource ownership, dynamic status, or fine-grained context. | Best for coarse API perimeter checks and standard permission tiers. |
| **ABAC (Attribute-Based Access Control)** | Context attributes: Subject, Resource, Action, Environment. | Fine-grained business rules (ownership, draft states, departmental access). | Higher CPU overhead; complex policy definitions; difficult to audit at scale. | Best for service-layer checks on specific resource instances. |
| **ReBAC / Zanzibar (Relationship-Based)** | Graph relationships: "User X is an editor of Folder Y which contains Document Z." | Google Docs-style nested sharing, complex collaborative SaaS platforms. | Requires a dedicated graph database or centralized authorization service (e.g., Ory Keto, OpenFGA). | Best when permissions are inherited dynamically through deeply nested resource hierarchies. |
| **Row-Level Security (RLS)** | Database-level row filters based on session variables (`current_setting('app.current_tenant')`). | Database-level defense in depth; multi-tenant multi-service isolation. | Database-engine specific (Postgres); can complicate database connection pooling. | Best as a safety net in multi-tenant architectures to prevent data leakage. |

**The One-Line Selection Rules:**
- Use **Authentication (AuthN)** to establish identity before the request reaches business logic.
- Use **RBAC** at the route guard layer to verify general action capability (`invoices:refund`).
- Use **ABAC** at the service layer to verify instance ownership, lifecycle status, and business rules.
- Use **ReBAC** when authorization depends on nested resource graphs (folders inside workspaces).
- Use **Database RLS or Parameterized Tenant Queries** as the final defense layer to guarantee physical data isolation.

## 8. 🧠 The Memory Hook

> **APIs authorize Permissions, never Roles. Guard the route with RBAC (`can you do this?`), protect the resource with ABAC (`can you touch this specific one?`), and lock the database with Tenant Scoping (`you can only see your own`).**
