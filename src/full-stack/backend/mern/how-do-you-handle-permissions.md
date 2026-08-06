# How do you handle permissions

## Detailed explanation

How do you handle permissions is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Make frontend and backend agree on auth, data contracts, errors, retries, and state.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define frontend-backend contract.
- Handle auth, cookies/tokens, CORS, and errors.
- Prevent duplicate or stale requests.
- Map backend validation to frontend UX.
- Keep contracts versioned and testable.

## 4. Visual / analogy

```txt
React UI -> API client -> backend endpoint -> response/error contract -> UI state
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply MERN backend rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you handle permissions affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle permissions in a MERN app?
- **The Engine Mechanism (Why it behaves this way):** Permissions control what actions a user can perform on specific resources. Two approaches: (1) **Role-Based (RBAC)** — permissions are tied to roles: admin can do everything, editor can edit, viewer can read. Check: `if (!['admin', 'editor'].includes(req.user.role)) return res.status(403).json(...)`. (2) **Permission-Based (PBAC)** — users have explicit permissions: `user.permissions = ['user:read', 'user:write', 'post:delete']`. Check: `if (!req.user.permissions.includes('post:delete')) return res.status(403).json(...)`. Store permissions in the JWT payload for fast checks, but re-check from the database for sensitive operations. For resource-level permissions, check ownership: `if (post.authorId.toString() !== req.user.id && req.user.role !== 'admin') return res.status(403).json(...)`.
- **The Unforgettable Mental Model:** The **Key Ring**. RBAC is like having a master key for your role (admin key opens all doors). PBAC is like having specific keys for specific doors (key for room 101, key for room 202). Ownership is like having a key to your own apartment.
- **The Trap:** Only checking roles without checking resource ownership — an editor could edit any post, not just their own. Always check both role and ownership.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle permissions with a combination of role-based and resource-level checks. RBAC controls broad access — admins can do everything, editors can edit, viewers can read. Resource-level checks control specific access — users can only edit their own posts. I store permissions in the JWT payload for fast checks but re-check from the database for sensitive operations. For complex apps, I use explicit permission lists (PBAC) instead of roles for finer-grained control."

#### How do you implement resource-level permissions (ownership)?
- **The Engine Mechanism (Why it behaves this way):** Check if the user owns the resource or has admin role: `const requireOwnership = async (req, res, next) => { const resource = await Resource.findById(req.params.id); if (!resource) return res.status(404).json({ error: 'Not found' }); if (resource.authorId.toString() !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Not authorized' }); req.resource = resource; next(); };`. For shared resources (team projects), check membership: `const team = await Team.findById(resource.teamId); if (!team.members.includes(req.user.id) && req.user.role !== 'admin') return res.status(403).json(...)`. Attach the resource to req so the handler doesn't need to fetch it again.
- **The Unforgettable Mental Model:** The **Apartment Key**. Having a building key (role) doesn't mean you can enter every apartment. You need the specific key for your apartment (ownership), unless you're the building manager (admin).
- **The Trap:** Fetching the resource twice — once in the ownership check and once in the handler. Attach the resource to req in the middleware so the handler can reuse it.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement resource-level permissions by checking if the user owns the resource or has admin role. I fetch the resource in the middleware, check ownership, and attach it to req so the handler doesn't need to fetch it again. For shared resources, I check team membership. The middleware returns 404 if the resource doesn't exist (hiding its existence from unauthorized users) and 403 if it exists but the user can't access it."

#### How do you implement dynamic permissions (permission-based access control)?
- **The Engine Mechanism (Why it behaves this way):** Instead of fixed roles, users have explicit permissions stored in the database: `userSchema.add({ permissions: [{ type: String, enum: ['user:read', 'user:write', 'post:read', 'post:write', 'post:delete', 'admin:access'] }] })`. Check permissions: `const requirePermission = (permission) => (req, res, next) => { if (!req.user.permissions.includes(permission)) return res.status(403).json({ error: 'Insufficient permissions' }); next(); };`. Usage: `app.delete('/posts/:id', authenticate, requirePermission('post:delete'), deletePost)`. Permissions can be combined: `requirePermission('post:write')` allows both create and update. Roles can map to default permissions: `const rolePermissions = { admin: ['*'], editor: ['post:read', 'post:write'], viewer: ['post:read'] };`.
- **The Unforgettable Mental Model:** The **Permission Slip**. Instead of a job title (role), each user has a list of specific permissions on their slip. The guard checks the slip for the specific permission needed, not just the title.
- **The Trap:** Storing permissions in the JWT without refreshing them — if permissions change, the JWT still has the old permissions. Re-check from the database for sensitive operations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For dynamic permissions, I store explicit permission strings in the user document (user:read, post:write, etc.). I create a requirePermission middleware factory that checks if the user has the specific permission. Roles map to default permissions for easy setup, but individual permissions can override role defaults. I store permissions in the JWT for fast checks but re-check from the database for sensitive operations to catch permission changes mid-session."

#### How do you handle permission inheritance (hierarchical permissions)?
- **The Engine Mechanism (Why it behaves this way):** Define a permission hierarchy where higher permissions include lower ones: `const permissionHierarchy = { 'post:delete': ['post:write', 'post:read'], 'post:write': ['post:read'], 'admin:access': ['*'] };`. Check function: `const hasPermission = (userPermissions, required) => { if (userPermissions.includes('*') || userPermissions.includes(required)) return true; return false; };`. For role-based hierarchy: `const roleLevels = { admin: 3, editor: 2, viewer: 1 }; const hasRole = (userRole, minRole) => roleLevels[userRole] >= roleLevels[minRole];`. This way, admin inherits all editor and viewer permissions.
- **The Unforgettable Mental Model:** The **Corporate Ladder**. A VP (admin) can do everything a manager (editor) can do, and a manager can do everything an employee (viewer) can do. Higher positions inherit all lower position permissions.
- **The Trap:** Hardcoding permission checks in every route (`if (role === 'admin' || role === 'editor')`). Use a hierarchy system so adding a new role doesn't require updating every check.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement permission inheritance with a hierarchy system. For roles, I assign numeric levels and compare — higher levels inherit lower level permissions. For explicit permissions, I define a hierarchy map where higher permissions include lower ones. This keeps permission checks clean and makes it easy to add new roles or permissions without updating every route. I centralize the hierarchy definition so it's the single source of truth."

#### How do you test permissions?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios per permission: (1) **No auth** — expect 401. (2) **Wrong role/permission** — expect 403. (3) **Correct role but not owner** — expect 403. (4) **Correct role and owner** — expect 200. (5) **Admin accessing any resource** — expect 200. Mock jwt.verify() to simulate different users: `jest.spyOn(jwt, 'verify').mockReturnValue({ id: 'user1', role: 'editor', permissions: ['post:read'] })`. Test with supertest: `await request(app).delete(`/posts/${otherPostId}`).set('Authorization', 'Bearer token').expect(403)`. Test permission changes mid-session by mocking database lookups.
- **The Unforgettable Mental Model:** The **Access Matrix**. Test every combination of user type (none, viewer, editor, admin) and resource type (own, others', non-existent). Each cell in the matrix should have the expected result (401, 403, 404, or 200).
- **The Trap:** Only testing the happy path (authorized user accessing own resource). Permission bugs are almost always in the denial paths — making sure unauthorized users are properly blocked.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test permissions with a matrix of user types and resource types. For each endpoint, I test: no auth (401), wrong role (403), correct role but not owner (403), correct role and owner (200), and admin accessing any resource (200). I mock jwt.verify() to simulate different users and supertest to make requests. Permission tests are critical because bugs here mean data leaks or unauthorized access."

## 8. Active recall test

1. **What's the difference between RBAC and PBAC?**
   - **Explanation:** RBAC ties permissions to roles (admin, editor, viewer). PBAC gives users explicit permissions (user:read, post:write). RBAC is simpler; PBAC is more flexible.

2. **How do you check resource ownership?**
   - **Explanation:** Fetch the resource, compare its authorId/ownerId with req.user.id. Allow access if they match or if the user has admin role. Attach resource to req for the handler.

3. **How do you implement dynamic permissions?**
   - **Explanation:** Store permission strings in the user document. Create a requirePermission middleware factory that checks if the user has the specific permission. Roles map to default permissions.

4. **How do you handle permission inheritance?**
   - **Explanation:** Assign numeric levels to roles (admin: 3, editor: 2, viewer: 1). Higher levels inherit lower level permissions. For explicit permissions, define a hierarchy map.

5. **How do you test permissions?**
   - **Explanation:** Test a matrix of user types and resource types: no auth (401), wrong role (403), correct role but not owner (403), correct role and owner (200), admin accessing any resource (200).

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle permissions in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle permissions in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
