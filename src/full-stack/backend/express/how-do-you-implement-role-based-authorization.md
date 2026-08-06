# How do you implement role-based authorization

## Detailed explanation

How do you implement role-based authorization is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you implement role-based authorization by linking what it is, why it exists, and how it fails in production.

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
Work   -> apply Express.js rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you implement role-based authorization affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you implement role-based authorization in Express?
- **The Engine Mechanism (Why it behaves this way):** After authentication (JWT middleware sets `req.user`), authorization middleware checks if `req.user.role` has permission for the route. Create a factory function: `const authorize = (...allowedRoles) => (req, res, next) => { if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' }); next(); };`. Use it on routes: `app.delete('/users/:id', authenticate, authorize('admin'), deleteUser)`. The `authenticate` middleware runs first (verifies identity), then `authorize` runs (checks permissions). Roles are typically stored in the JWT payload or looked up from the database.
- **The Unforgettable Mental Model:** The **VIP Section**. Authentication checks if you're on the guest list (valid token). Authorization checks if you're on the VIP list (has the right role). Both checks are separate — being on the guest list doesn't guarantee VIP access.
- **The Trap:** Confusing authentication (who are you?) with authorization (what can you do?). Auth middleware verifies identity; authorization middleware checks permissions. Both are needed, and in that order.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement role-based authorization as middleware that runs after authentication. It's a factory function that accepts allowed roles and returns middleware checking if req.user.role is in that list. If not, it returns 403 Forbidden. I apply it per-route: authenticate first, then authorize('admin'), then the handler. Roles come from the JWT payload for speed, but for sensitive operations, I re-check roles from the database to catch role changes mid-session."

#### What's the difference between RBAC and ABAC?
- **The Engine Mechanism (Why it behaves this way):** RBAC (Role-Based Access Control) grants permissions based on predefined roles: admin, editor, viewer. It's simple and works for most apps. ABAC (Attribute-Based Access Control) grants permissions based on attributes: user attributes (department, clearance level), resource attributes (owner, sensitivity), and environment attributes (time, location). ABAC is more flexible but more complex. Example: RBAC says "editors can edit articles." ABAC says "users can edit articles they own, during business hours, from the office network."
- **The Unforgettable Mental Model:** **Job Title vs. Context**. RBAC is like a job title — "managers can approve expenses." ABAC is like context-aware rules — "you can approve expenses under $1000, during work hours, for your own department."
- **The Trap:** Over-engineering with ABAC when RBAC is sufficient. Most apps only need 3-5 roles. ABAC adds complexity that's only justified for enterprise-grade access control.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: RBAC uses predefined roles like admin, editor, viewer — simple and sufficient for most apps. ABAC uses attributes like user department, resource ownership, and time of day — more flexible but significantly more complex. I start with RBAC and only move to ABAC if the business requirements demand fine-grained, context-aware permissions. For most Express apps, RBAC with a few roles covers 95% of use cases."

#### How do you handle resource-level authorization (ownership)?
- **The Engine Mechanism (Why it behaves this way):** Beyond roles, you often need to check if a user owns a specific resource. Pattern: `const requireOwnership = async (req, res, next) => { const resource = await Resource.findById(req.params.id); if (resource.ownerId.toString() !== req.user.id) return res.status(403).json({ error: 'Not authorized' }); req.resource = resource; next(); };`. This checks that the authenticated user is the owner of the resource being accessed. Combine with role checks: `authorize('admin', 'user')` allows admins (who can access anything) and the resource owner.
- **The Unforgettable Mental Model:** The **House Key**. Having a key to the building (role) doesn't mean you can enter every apartment (resource). You need the specific key for your apartment (ownership), unless you're the building manager (admin).
- **The Trap:** Only checking roles without checking ownership. An authenticated user with the 'user' role could access any other user's resources if ownership isn't verified.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Role checks aren't enough — I also verify resource ownership. After authentication, I check if the resource's ownerId matches req.user.id. I combine this with role checks so admins can access everything but regular users can only access their own resources. I fetch the resource in the authorization middleware and attach it to req.resource so the handler doesn't need to fetch it again."

#### How do you handle hierarchical roles?
- **The Engine Mechanism (Why it behaves this way):** Define a role hierarchy where higher roles inherit permissions from lower roles: `{ admin: ['admin', 'editor', 'viewer'], editor: ['editor', 'viewer'], viewer: ['viewer'] }`. The authorization middleware checks if the user's role level is >= the required level: `const roleHierarchy = { admin: 3, editor: 2, viewer: 1 }; const authorize = (minRole) => (req, res, next) => { if (roleHierarchy[req.user.role] < roleHierarchy[minRole]) return res.status(403).json({ error: 'Insufficient permissions' }); next(); };`. This way, `authorize('editor')` allows both editors and admins.
- **The Unforgettable Mental Model:** The **Military Ranks**. A coloncan (admin) can do everything a captain (editor) can do, and a captain can do everything a private (viewer) can do. Higher rank inherits all lower rank permissions.
- **The Trap:** Hardcoding role checks in every route (`if (req.user.role !== 'admin' && req.user.role !== 'editor')`). This scatters permission logic and makes it hard to modify the hierarchy.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a role hierarchy with numeric levels — admin is 3, editor is 2, viewer is 1. The authorization middleware compares the user's level against the required minimum level. This means higher roles automatically inherit lower role permissions. I define the hierarchy in one place, making it easy to add new roles or change the structure. This is cleaner than checking multiple roles in every route."

#### How do you test authorization middleware?
- **The Engine Mechanism (Why it behaves this way):** Test three scenarios per authorization rule: (1) **Authorized user** — user with correct role/ownership should get 200. (2) **Unauthorized role** — user with wrong role should get 403. (3) **Unauthenticated** — no token should get 401. Use supertest with mocked JWT verification: `jest.spyOn(jwt, 'verify').mockReturnValue({ id: 'user1', role: 'admin' })`. Test ownership by creating resources with different owners and verifying access. Also test edge cases: deleted users, revoked tokens, and role changes mid-session.
- **The Unforgettable Mental Model:** The **Three-Key Test**. For every lock (authorization rule), test: the right key works (authorized), the wrong key doesn't (unauthorized role), and no key at all doesn't work (unauthenticated).
- **The Trap:** Only testing the happy path (authorized user). Authorization bugs are almost always in the denial paths — making sure unauthorized users are properly blocked.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test authorization with three scenarios per rule: authorized user gets 200, wrong role gets 403, and no token gets 401. I mock jwt.verify() to simulate different user roles and IDs. For ownership tests, I create resources with different owners and verify cross-user access is blocked. I also test edge cases like role changes and deleted users. Authorization tests are critical because a bug here means data leaks."

## 8. Active recall test

1. **What's the difference between authentication and authorization?**
   - **Explanation:** Authentication verifies identity (who are you?) — typically via JWT. Authorization verifies permissions (what can you do?) — typically via role checks. Auth comes first, authorization second.

2. **How do you create a reusable role-checking middleware?**
   - **Explanation:** Factory function: `const authorize = (...roles) => (req, res, next) => { if (!roles.includes(req.user.role)) return res.status(403).json(...); next(); }`. Apply after authenticate middleware.

3. **How do you check if a user owns a resource?**
   - **Explanation:** Fetch the resource from the database, compare its ownerId with req.user.id. If they don't match, return 403. Attach the resource to req for the handler to use.

4. **How do you implement role hierarchy?**
   - **Explanation:** Assign numeric levels to roles (admin: 3, editor: 2, viewer: 1). Authorization compares user's level against required minimum level, so higher roles inherit lower permissions.

5. **What HTTP status code for authorization failure?**
   - **Explanation:** 403 Forbidden — the user is authenticated but lacks permission. 401 Unauthorized is for missing/invalid authentication (no valid token).

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you implement role-based authorization in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you implement role-based authorization in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
