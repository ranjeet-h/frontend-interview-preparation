# Design a role-based access system

## Detailed explanation

Design a role-based access system is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Design data flow, APIs, storage, scaling, failure handling, and observability together.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Clarify requirements and scale.
- Define APIs and data model.
- Choose storage, cache, queues, and workers.
- Plan consistency, failure handling, and security.
- Add observability and rollout strategy.

## 4. Visual / analogy

```txt
Clients -> API -> services -> database/cache/queue -> observability
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply backend system design rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, design a role-based access system affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you model roles and permissions in a database?
- **The Engine Mechanism (Why it behaves this way):** The standard RBAC model uses four tables: users (id, email), roles (id, name), permissions (id, resource, action), and two join tables: user_roles (user_id, role_id) and role_permissions (role_id, permission_id). This many-to-many design allows a user to have multiple roles and a role to have multiple permissions. For hierarchical roles (admin > manager > viewer), add a parent_role_id to the roles table. For fine-grained access, add an attribute-based layer (ABAC) that evaluates conditions like "user.department == resource.department". Queries check permissions by joining user → user_roles → role_permissions → permissions.
- **The Unforgettable Mental Model:** The **Office Building Access System**. Each employee (user) has badges (roles) — "Floor 3 Access," "Server Room Access." Each badge opens specific doors (permissions) — "Door 301: Read," "Door 302: Write." An employee can have multiple badges, and each badge opens multiple doors. The master key (admin role) opens all doors.
- **The Trap:** Storing permissions directly on users instead of through roles. This creates a maintenance nightmare — changing a permission requires updating every user. Roles act as a permission grouping layer that makes management scalable.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use the standard RBAC model with four core tables: users, roles, permissions, and two join tables (user_roles, role_permissions). Permissions are granular — {resource: 'document', action: 'read'} — not coarse roles like 'admin.' This allows fine-grained access control. For hierarchical roles, I'd add a parent_role_id to enable role inheritance. For complex scenarios, I'd layer ABAC on top to evaluate contextual conditions like ownership, department, or time-based access."

#### How do you check permissions efficiently on every request?
- **The Engine Mechanism (Why it behaves this way):** Permission checks happen in middleware/guards that intercept requests before they reach the handler. The user's permissions are loaded once during authentication and cached in the session or a JWT claim. For each request, the middleware extracts the required permission (e.g., "document:write"), checks it against the cached permission set (O(1) with a Set data structure), and either allows or denies the request. For large permission sets, cache the resolved permissions in Redis with a TTL. Invalidate the cache when roles or permissions change. Avoid database queries on every request by caching aggressively.
- **The Unforgettable Mental Model:** The **Airport Security Pre-Check**. Instead of checking your credentials from scratch every time you enter a terminal (database query), you get a Pre-Check stamp (cached permissions) that security guards verify instantly. The stamp expires after a set time, and if your status changes, the stamp is revoked.
- **The Trap:** Querying the database for permissions on every request. This adds 10-50ms of latency to every API call. Always cache resolved permissions and invalidate on changes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd resolve the user's full permission set during authentication and cache it — either in the JWT as claims or in Redis with a 5-minute TTL. The authorization middleware extracts the required permission from the route definition, checks it against the cached Set in O(1) time, and allows or denies the request. When a role or permission changes, I'd invalidate the cache by updating a permission_version in the user record or explicitly deleting the Redis key. This keeps authorization checks under 1ms."

#### How do you handle hierarchical role inheritance?
- **The Engine Mechanism (Why it behaves this way):** Role inheritance means a role inherits all permissions from its parent role. This is modeled with a parent_role_id column in the roles table, creating a tree structure. To resolve a user's effective permissions, traverse the role tree upward (recursively or with a recursive CTE in SQL) collecting all permissions from the role and all its ancestors. For deep hierarchies, pre-compute and cache the effective permission set. Materialized paths (storing the full path as a string like "/admin/manager/viewer") enable efficient subtree queries. Closure tables store all ancestor-descendant pairs for O(1) lookups.
- **The Unforgettable Mental Model:** The **Corporate Org Chart**. A VP inherits all the access rights of a Director, who inherits from a Manager, who inherits from an Employee. You don't need to list every permission for the VP — it flows down from the hierarchy automatically.
- **The Trap:** Infinite recursion in role hierarchies. If role A inherits from B, and B inherits from A, permission resolution enters an infinite loop. Always validate the hierarchy for cycles before saving, and use a visited-set during traversal.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd model inheritance with a parent_role_id in the roles table and resolve effective permissions using a recursive CTE that traverses upward collecting all permissions. To prevent infinite loops, I'd validate for cycles before saving any role change. For performance, I'd pre-compute effective permissions and cache them in Redis, invalidating the cache when any role in the hierarchy changes. For very deep hierarchies, I'd use a closure table that stores all ancestor-descendant pairs for O(1) permission resolution."

#### How do you implement attribute-based access control (ABAC) on top of RBAC?
- **The Engine Mechanism (Why it behaves this way):** ABAC adds contextual conditions to permission checks beyond just roles. A policy engine (OPA/Cedar, Casbin) evaluates rules like: "Allow if user.role == 'editor' AND document.owner == user.id AND document.status == 'draft'." The policy is defined in a declarative language, and the engine evaluates it against the request context (user attributes, resource attributes, environment). RBAC handles the "who" (roles), ABAC handles the "under what conditions." The policy engine can be embedded in the application or run as a sidecar service.
- **The Unforgettable Mental Model:** The **Smart Lock**. RBAC is the key — it gets you to the door. ABAC is the smart lock that also checks the time of day, your location, and whether the room is occupied before opening. You need both the right key AND the right conditions.
- **The Trap:** Putting ABAC logic in the application code scattered across handlers. This makes policies hard to audit and change. Use a dedicated policy engine (OPA, Casbin) with centralized policy definitions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd layer ABAC on top of RBAC using a policy engine like Open Policy Agent (OPA) or Casbin. RBAC handles coarse-grained access — does this user have the 'editor' role? ABAC handles fine-grained conditions — is this user the document owner? Is the document in draft status? Is it business hours? Policies are defined declaratively in a central location, making them auditable and changeable without code deployments. The policy engine evaluates all conditions and returns allow/deny."

#### How do you handle permission changes in a distributed system?
- **The Engine Mechanism (Why it behaves this way):** When a permission changes, all services that cache permissions need to be notified. Options: (1) Cache invalidation via pub/sub — publish a "permission_changed" event to Redis Pub/Sub or Kafka, and all services invalidate their local cache; (2) Short TTLs — set cache TTL to 1-5 minutes so stale permissions auto-expire; (3) Version-based invalidation — store a permission_version in the user record; each cached permission set includes the version; if the cached version doesn't match the current version, re-fetch; (4) Push-based — the auth service pushes updated permissions to all services via a streaming connection.
- **The Unforgettable Mental Model:** The **Town Crier System**. When a law changes (permission update), the town crier (pub/sub event) announces it in every square (service). Each citizen (service) updates their understanding. If someone misses the announcement, they'll learn the new law at the next town meeting (cache TTL expiration).
- **The Trap:** Not propagating permission changes to all services. A user's permission is revoked in the auth service, but a cached copy in the API gateway still grants access. Always use cache invalidation or short TTLs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use a combination of version-based cache invalidation and short TTLs. Each user has a permission_version that increments on any role or permission change. Cached permission sets include this version. On each request, the service checks if the cached version matches the current version — if not, it re-fetches. Additionally, I'd publish permission change events to Kafka so services can proactively invalidate caches. The cache TTL is set to 5 minutes as a safety net. This ensures permission changes propagate within seconds, not minutes."

#### How do you design the API for role and permission management?
- **The Engine Mechanism (Why it behaves this way):** The admin API includes: CRUD for roles (POST/GET/PATCH/DELETE /roles), CRUD for permissions (POST/GET/PATCH/DELETE /permissions), assign role to user (POST /users/{id}/roles), remove role from user (DELETE /users/{id}/roles/{roleId}), set role hierarchy (PATCH /roles/{id}/parent), and check permission (GET /users/{id}/permissions). The API validates that role assignments don't create cycles, that permissions reference valid resources/actions, and that only users with appropriate admin permissions can manage roles. All changes are logged in an audit trail.
- **The Unforgettable Mental Model:** The **HR Department**. HR creates job titles (roles), defines what each title can do (permissions), assigns titles to employees (user_roles), and sets the reporting structure (role hierarchy). Every change is documented in the employee's file (audit log).
- **The Trap:** Allowing any authenticated user to manage roles. Role management itself must be protected — only users with the "role_admin" or "super_admin" permission can create, modify, or assign roles.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The management API has endpoints for CRUD on roles and permissions, assigning roles to users, and setting role hierarchies. All endpoints require 'role_admin' permission themselves. The API validates role assignments for cycles, ensures permissions reference valid resource:action pairs, and logs every change to an audit trail. I'd also add a GET /users/{id}/permissions endpoint that returns the resolved effective permission set, useful for frontend UI rendering (showing/hiding buttons based on permissions)."

#### How do you test an RBAC system thoroughly?
- **The Engine Mechanism (Why it behaves this way):** Testing covers: (1) Unit tests for permission resolution logic — verify that role inheritance, permission combinations, and ABAC conditions resolve correctly; (2) Integration tests for the full auth flow — create users, assign roles, make requests, verify allow/deny; (3) Edge case tests — users with no roles, users with conflicting roles, circular role inheritance, deleted roles, expired permissions; (4) Performance tests — permission check latency with 1000+ roles, cache invalidation propagation time; (5) Security tests — privilege escalation attempts, token manipulation, cache poisoning. Use a test matrix: every role × every resource × every action = expected result.
- **The Unforgettable Mental Model:** The **Fire Drill**. You don't just test that the fire alarm works (happy path). You test what happens when the power is out (no roles), when multiple alarms conflict (conflicting roles), when the alarm is broken (deleted roles), and when someone tries to trigger it maliciously (privilege escalation).
- **The Trap:** Only testing the happy path (user has role, role has permission, access granted). The most critical bugs are in edge cases: what happens when a role is deleted mid-session, or when a user has two roles with conflicting permissions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd test across multiple dimensions. Unit tests cover permission resolution — role inheritance, permission combinations, ABAC conditions. Integration tests verify the full flow from role assignment to access decision. Edge cases are critical: users with no roles, conflicting roles, circular inheritance, deleted roles mid-session. I'd use a test matrix covering every role × resource × action combination. Performance tests verify that permission checks stay under 1ms even with 1000+ roles. Security tests attempt privilege escalation and cache poisoning."

## 8. Active recall test

1. **What are the four core tables in an RBAC model?**
   - **Explanation:** users, roles, permissions, and two join tables: user_roles (maps users to roles) and role_permissions (maps roles to permissions). This many-to-many design allows flexible role assignment and permission grouping.

2. **Why cache permissions instead of querying the database on every request?**
   - **Explanation:** Database queries add 10-50ms latency to every API call. Caching resolved permissions in a Set enables O(1) permission checks in under 1ms. Cache invalidation or short TTLs ensure stale permissions are refreshed.

3. **How do you prevent infinite loops in role hierarchies?**
   - **Explanation:** Validate for cycles before saving any role hierarchy change using graph cycle detection (DFS with visited set). During permission resolution, use a visited set to prevent infinite recursion if a cycle somehow exists.

4. **What is the difference between RBAC and ABAC?**
   - **Explanation:** RBAC controls access based on roles ("editors can edit documents"). ABAC adds contextual conditions ("editors can edit documents they own, in draft status, during business hours"). ABAC is layered on top of RBAC for fine-grained control.

5. **How do you propagate permission changes across distributed services?**
   - **Explanation:** Use version-based cache invalidation (permission_version in user record), publish change events via Kafka/Redis Pub/Sub for proactive cache invalidation, and set short cache TTLs (5 minutes) as a safety net.

6. **What permission should protect the role management API itself?**
   - **Explanation:** Only users with a 'role_admin' or 'super_admin' permission should be able to create, modify, or assign roles. Role management must be self-protecting to prevent privilege escalation.

7. **What edge cases are most important to test in an RBAC system?**
   - **Explanation:** Users with no roles, conflicting roles, circular inheritance, deleted roles mid-session, expired permissions, and privilege escalation attempts. The test matrix should cover every role × resource × action combination.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design a role-based access system in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design a role-based access system in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
