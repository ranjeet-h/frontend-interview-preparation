# What is RBAC

## Detailed explanation

What is RBAC is a core auth topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is rbac by linking what it is, why it exists, and how it fails in production.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define the concept in backend terms.
- Explain the problem it solves.
- Show where it appears in real services.
- Call out security, performance, or reliability impact.
- Compare it with nearby concepts.

## 4. Visual / analogy

```txt
Request/API/service -> concept applied -> safer production behavior
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply auth rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, what is rbac affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is RBAC (Role-Based Access Control)?
- **The Engine Mechanism (Why it behaves this way):** RBAC is an authorization model where permissions are assigned to roles, and roles are assigned to users. Instead of granting permissions directly to users, you create roles (admin, editor, viewer) with specific permissions, then assign users to roles. When a request arrives, the system checks the user's roles, resolves their permissions, and determines if the requested action is allowed.
- **The Unforgettable Mental Model:** The **Job Title System**. In a company, your job title (role) determines what you can do — managers can approve expenses, developers can deploy code, interns can read docs. You don't get individual permissions; you inherit them from your title.
- **The Trap:** Creating too many granular roles (role explosion). If you have 50 roles for 50 slightly different permission sets, RBAC becomes as complex as direct permission assignment. Use roles for natural groupings, not for every edge case.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: RBAC is an authorization model where permissions are assigned to roles, and users are assigned to roles. Instead of managing permissions per user, you manage them per role — admin, editor, viewer — and users inherit permissions from their roles. This simplifies permission management, especially at scale. When a request arrives, the system resolves the user's roles to their permissions and checks if the requested action is allowed."

#### What are the core components of RBAC?
- **The Engine Mechanism (Why it behaves this way):** RBAC has four core components: (1) Users — the identities requesting access, (2) Roles — named groups of permissions (admin, editor), (3) Permissions — specific actions on resources (read:document, write:document), and (4) Role assignments — the mapping of users to roles. Some implementations add (5) Role hierarchies — where senior roles inherit permissions from junior roles (admin inherits editor permissions).
- **The Unforgettable Mental Model:** The **Org Chart**. Users are people, roles are positions on the org chart, permissions are the responsibilities of each position, and role assignments are who holds which position. The org chart defines who can do what.
- **The Trap:** Confusing roles with permissions. A role is a group (admin); a permission is an action (delete:user). Roles contain permissions; they are not permissions themselves.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: RBAC has four core components: users (identities), roles (named permission groups), permissions (specific actions on resources), and role assignments (user-to-role mappings). Optionally, role hierarchies allow senior roles to inherit permissions from junior roles. The key design principle is that permissions are assigned to roles, not directly to users. This indirection simplifies management — changing a role's permissions affects all users with that role."

#### How do you implement RBAC in a backend?
- **The Engine Mechanism (Why it behaves this way):** Database schema: `users` table, `roles` table, `permissions` table, `user_roles` junction table, and `role_permissions` junction table. On each request, middleware extracts the user's roles, joins to get permissions, and checks if the required permission exists. For performance, cache the user's permissions in the JWT or session to avoid database joins on every request.
- **The Unforgettable Mental Model:** The **Permission Lookup Table**. When someone requests access, you look up their role in the table, find what that role allows, and check if the requested action is on the list. It's a simple table lookup.
- **The Trap:** Doing database joins on every request to resolve permissions. This is slow and doesn't scale. Cache permissions in the token or session, and invalidate the cache when role assignments change.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement RBAC with a normalized schema: users, roles, permissions, and junction tables for user-role and role-permission mappings. On each request, middleware resolves the user's permissions — but I cache them in the JWT or session to avoid database joins on every request. When role assignments change, I invalidate the cache or issue a new token. For the authorization check, I use middleware that compares the required permission against the user's resolved permissions."

#### What is role hierarchy in RBAC?
- **The Engine Mechanism (Why it behaves this way):** Role hierarchy allows roles to inherit permissions from other roles. For example, `admin` inherits all permissions from `editor`, which inherits from `viewer`. This creates a tree where senior roles automatically get all permissions of junior roles. Implementation: store parent-child relationships in a `role_hierarchy` table and resolve permissions recursively.
- **The Unforgettable Mental Model:** The **Military Rank System**. A general (admin) can do everything a colonel (editor) can do, and a colonel can do everything a sergeant (viewer) can do. Higher rank inherits all lower-rank privileges.
- **The Trap:** Creating circular hierarchies (admin inherits editor, editor inherits admin). This causes infinite recursion during permission resolution. Validate hierarchy integrity on creation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Role hierarchy allows roles to inherit permissions from parent roles. Admin inherits editor, which inherits viewer. This reduces permission duplication — you only define unique permissions at each level. I implement it with a parent-child relationship table and resolve permissions recursively. I validate against circular hierarchies on creation and cache the resolved permission set to avoid recursive lookups on every request."

#### What are the limitations of RBAC?
- **The Engine Mechanism (Why it behaves this way):** RBAC limitations: (1) Cannot express context-dependent permissions (e.g., "can edit only documents they own"), (2) Role explosion when many granular permission sets are needed, (3) Difficult to handle temporary or conditional access, (4) Doesn't scale well for fine-grained resource-level authorization. For these cases, ABAC (Attribute-Based Access Control) or ReBAC (Relationship-Based Access Control) is more appropriate.
- **The Unforgettable Mental Model:** The **One-Size-Fits-All Uniform**. RBAC gives everyone in a role the same uniform (permissions). But what if someone needs the uniform modified for a specific situation? RBAC can't handle contextual variations well.
- **The Trap:** Trying to solve every authorization problem with RBAC. When you need "can edit only their own documents" or "can access only during business hours," RBAC becomes awkward. These are ABAC problems.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: RBAC is great for coarse-grained authorization — admin vs editor vs viewer. But it struggles with context-dependent permissions like 'can edit only documents they own' or 'can access only during business hours.' These require ABAC (Attribute-Based Access Control) or resource-level ownership checks. RBAC also suffers from role explosion when you need many granular permission sets. I use RBAC as the foundation and layer ABAC or ownership checks on top for fine-grained control."

#### How does RBAC affect the frontend?
- **The Engine Mechanism (Why it behaves this way):** The frontend uses RBAC data to: conditionally render UI elements (show admin panel only to admins), disable unauthorized actions, route users away from unauthorized pages, and display role-appropriate navigation. The user's roles or permissions are included in the auth response (JWT claims or /me endpoint) and stored in the frontend state.
- **The Unforgettable Mental Model:** The **Customized Dashboard**. When you log in, the dashboard rearranges itself based on your role — admins see all widgets, editors see content tools, viewers see read-only panels. The same app, different views.
- **The Trap:** Using frontend RBAC as the security boundary. Frontend role checks are for UX only. The backend must enforce RBAC on every request.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend uses RBAC for UX — showing role-appropriate UI, hiding unauthorized actions, and routing users to relevant pages. The user's roles come from the auth response (JWT claims or /me endpoint) and are stored in frontend state. But frontend RBAC is purely cosmetic — the backend enforces authorization on every request. I design the frontend to handle 403 responses gracefully since the backend is the ultimate authority."

#### What would you monitor for RBAC?
- **The Engine Mechanism (Why it behaves this way):** Monitor: permission check failure rates (403s by role and endpoint), role assignment changes (audit trail), role distribution (how many users per role), permission resolution latency, and orphaned roles (roles with no users or no permissions). Alert on unusual permission failure patterns or role assignment anomalies.
- **The Unforgettable Mental Model:** The **Access Control Dashboard**. You're watching who's being denied access (403 rates), how roles are being assigned (assignment changes), and whether the role structure is healthy (orphaned roles, distribution).
- **The Trap:** Not monitoring role assignment changes. Unauthorized role elevation (a user gaining admin role) is a critical security event that should be logged and alerted.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor RBAC health through 403 rates by role and endpoint, role assignment changes (with audit logging), role distribution, and permission resolution latency. I alert on unusual permission failure patterns (which indicate misconfiguration) and role assignment anomalies (which could indicate privilege escalation). I also track orphaned roles — roles with no users or no permissions — to keep the role structure clean and auditable."

## 8. Active recall test

1. **What is RBAC?**
   - **Explanation:** Role-Based Access Control — an authorization model where permissions are assigned to roles, and users are assigned to roles. Users inherit permissions from their roles.
2. **What are the core components of RBAC?**
   - **Explanation:** Users, roles, permissions, and role assignments (user-to-role mappings). Optionally, role hierarchies for permission inheritance.
3. **How do you implement RBAC efficiently?**
   - **Explanation:** Normalized database schema with junction tables. Cache resolved permissions in JWT/session to avoid database joins on every request. Invalidate cache on role changes.
4. **What is role hierarchy?**
   - **Explanation:** A parent-child relationship between roles where child roles inherit permissions from parent roles. Admin inherits editor, which inherits viewer.
5. **What are RBAC's main limitations?**
   - **Explanation:** Cannot express context-dependent permissions (ownership, time-based), suffers from role explosion with granular needs, and doesn't scale for fine-grained resource-level authorization.
6. **What is role explosion?**
   - **Explanation:** When too many roles are created for slightly different permission sets, making RBAC as complex as direct permission assignment. Caused by trying to model every edge case as a role.
7. **How does the frontend use RBAC data?**
   - **Explanation:** For UX — conditionally rendering UI, hiding unauthorized actions, and routing. Frontend RBAC is cosmetic; backend enforcement is the security boundary.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is RBAC in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is RBAC in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
