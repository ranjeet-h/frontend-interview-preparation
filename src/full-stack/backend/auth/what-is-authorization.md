# What is authorization

## Detailed explanation

What is authorization is a core auth topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is authorization by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, what is authorization affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is authorization?
- **The Engine Mechanism (Why it behaves this way):** Authorization is the process of determining whether an authenticated identity has permission to perform a specific action or access a specific resource. The engine receives an identity (from authentication), an action (read, write, delete), and a resource (user profile, admin panel), then evaluates these against a policy model (RBAC, ABAC, ACL) to return allow or deny.
- **The Unforgettable Mental Model:** The **VIP Section Rope**. Authentication got you into the club (you proved your identity). Authorization is the velvet rope inside — just because you're in the building doesn't mean you can enter the VIP area. The bouncer checks your wristband level against the area's access requirements.
- **The Trap:** Confusing authorization with authentication. Authentication = "Are you who you say you are?" Authorization = "Are you allowed to do what you're trying to do?" A user can be fully authenticated but have zero authorization to access admin endpoints.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Authorization is the process of determining whether an authenticated identity has permission to perform a specific action on a specific resource. It takes the identity established by authentication and evaluates it against a policy — whether that's role-based, attribute-based, or access-control lists — to produce an allow or deny decision. It always comes after authentication in the request lifecycle."

#### Why does authorization matter in backend/full-stack systems?
- **The Engine Mechanism (Why it behaves this way):** Without authorization, any authenticated user can access any resource. This means user A could read user B's data, regular users could access admin panels, and service accounts could perform destructive operations. Authorization enforces the principle of least privilege — each identity gets only the permissions it needs.
- **The Unforgettable Mental Model:** The **Office Building Keycard System**. Everyone with a badge can enter the building (authentication), but only HR can enter the payroll room, only IT can enter the server room, and only executives can enter the boardroom. Without keycard-level access control, the building is secure but the rooms inside are not.
- **The Trap:** Implementing authorization only on the frontend. Frontend UI hiding (conditional rendering) is not authorization — it's cosmetic. The backend must enforce authorization on every request because frontend code can be bypassed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Authorization is critical because authentication alone doesn't protect resources — it only identifies who's asking. Authorization enforces the principle of least privilege, ensuring each user can only access what they need. It prevents horizontal privilege escalation (accessing other users' data) and vertical privilege escalation (regular users accessing admin functions). It must be enforced on the backend, not just hidden in the frontend UI."

#### What is a simple authorization implementation?
- **The Engine Mechanism (Why it behaves this way):** A minimal implementation uses middleware that runs before route handlers: (1) Extract the user's identity from the request (JWT payload, session data), (2) Look up the user's roles or permissions, (3) Check if the required permission for the route is in the user's permission set, (4) Allow the request to proceed or return 403 Forbidden.
- **The Unforgettable Mental Model:** The **Checklist at the Gate**. Before you enter each room, someone checks your badge against a posted list of who's allowed in. If your badge has the right clearance, you pass. If not, you're turned away.
- **The Trap:** Hardcoding role checks in every route handler (`if (user.role !== 'admin') return 403`). This scatters authorization logic, makes it hard to audit, and leads to inconsistencies. Use middleware or a centralized policy engine instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A simple authorization implementation uses middleware that intercepts requests before they reach route handlers. The middleware extracts the user's identity, resolves their roles or permissions, and checks whether the required permission for the requested resource is granted. I prefer centralized authorization — either as middleware for route-level checks or as a policy service for fine-grained resource-level checks — rather than scattering role checks throughout handlers."

#### What edge cases can break authorization?
- **The Engine Mechanism (Why it behaves this way):** Authorization failures occur through: IDOR (Insecure Direct Object Reference — changing `userId` in URL to access other users' data), missing authorization on new endpoints, race conditions in permission updates, cached authorization decisions that don't reflect revocations, and overly broad permissions granted during development that persist to production.
- **The Unforgettable Mental Model:** The **Unlocked Window**. You locked the front door (authenticated the main endpoints), but forgot to lock the bathroom window (a new API endpoint). Or you gave someone a master key during construction (dev permissions) and never took it back.
- **The Trap:** Assuming that because an endpoint requires authentication, it's automatically authorized. Authentication is the gate; authorization is the room-by-room access. Every new endpoint needs explicit authorization, not just authentication.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Authorization breaks most commonly through IDOR vulnerabilities where resource IDs are user-controllable without ownership checks, missing authorization on newly added endpoints, stale cached permissions that don't reflect real-time revocations, and permission creep where users accumulate access they no longer need. The defense is defense-in-depth: middleware for route-level checks, resource-level ownership validation in handlers, and regular permission audits."

#### How would you test authorization?
- **The Engine Mechanism (Why it behaves this way):** Authorization testing requires matrix testing: (1) Each role against each endpoint (admin can access X, user cannot), (2) Resource ownership tests (user A cannot access user B's data), (3) Edge cases — unauthenticated requests, expired tokens, malformed permissions, (4) Permission boundary tests — users with partial permissions, (5) Negative tests — ensure 403 is returned, not 500 or 200 with empty data.
- **The Unforgettable Mental Model:** The **Permission Grid**. Draw a spreadsheet: rows are roles, columns are endpoints. Every cell must be explicitly marked allow or deny. Testing means verifying every cell matches the expected value.
- **The Trap:** Only testing that authorized users can access resources. The critical tests are the negative ones — verifying that unauthorized users are denied. A test that passes because it got a 200 is less valuable than a test that passes because it correctly got a 403.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test authorization using a role-permission matrix. For each endpoint, I test it with every role type: admins should succeed, regular users should get 403, and unauthenticated requests should get 401. I also test resource ownership — user A accessing user B's data must be denied. The most important tests are the negative ones: confirming denial, not just confirming access. I also test edge cases like expired tokens, revoked permissions, and malformed requests."

#### How does authorization affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** The frontend uses authorization data to: conditionally render UI elements (hide admin buttons from regular users), disable actions (gray out delete buttons), route users away from unauthorized pages, and display appropriate error messages when API returns 403. The frontend should never be the sole enforcement point.
- **The Unforgettable Mental Model:** The **Menu at a Restaurant**. The menu shows you what you can order (UI visibility), but the kitchen still checks your payment method before serving (backend enforcement). The menu is a courtesy, not a guarantee.
- **The Trap:** Relying on frontend authorization as security. Hiding an admin button doesn't prevent a user from directly calling the admin API. Frontend authorization is UX; backend authorization is security.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Authorization on the frontend is primarily about user experience — showing the right UI, hiding unauthorized actions, and providing clear feedback when access is denied. But it's never a security boundary. The frontend should optimistically render based on known permissions, but always handle 403 responses gracefully since the backend is the ultimate authority. I also ensure that error messages don't leak information about what permissions exist."

#### What would you monitor in production for authorization?
- **The Engine Mechanism (Why it behaves this way):** Key metrics include: 403 response rates by endpoint and user role (detects misconfigured permissions), authorization decision latency (policy evaluation time), permission cache hit/miss rates, authorization failures by user (detects potential abuse or misconfiguration), and permission audit log completeness (every allow/deny decision should be logged).
- **The Unforgettable Mental Model:** The **Access Log Book**. Every time someone tries to enter a room, you record who, what room, and whether they were let in. Over time, patterns emerge: too many denials at one door means the lock is misconfigured; one person trying many doors means they're probing for weaknesses.
- **The Trap:** Not logging authorization decisions. Without an audit trail, you can't investigate security incidents, debug permission issues, or prove compliance. Every allow and deny should be logged with identity, resource, action, and timestamp.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor authorization from three angles: security signals like 403 rates by endpoint and user (spikes indicate misconfiguration or probing), performance metrics like policy evaluation latency and cache hit rates, and compliance requirements like complete audit logging of every authorization decision. I alert on unusual patterns — a user hitting many 403s in sequence suggests either misconfigured permissions or an attacker probing for access."

## 8. Active recall test

1. **What is the difference between authentication and authorization?**
   - **Explanation:** Authentication verifies identity (who you are); authorization determines permissions (what you can do). Authentication always precedes authorization in the request lifecycle.
2. **What does IDOR stand for and why is it an authorization vulnerability?**
   - **Explanation:** Insecure Direct Object Reference. It occurs when an API uses user-supplied IDs to access resources without verifying ownership. Changing `userId=123` to `userId=124` grants access to another user's data.
3. **What HTTP status code indicates authorization failure?**
   - **Explanation:** 403 Forbidden. The user is authenticated but lacks permission for the requested resource. 401 Unauthorized means the user isn't authenticated at all.
4. **Why must authorization be enforced on the backend?**
   - **Explanation:** Frontend code can be modified or bypassed by anyone with browser dev tools. Backend enforcement is the only reliable security boundary. Frontend authorization is UX, not security.
5. **What is the principle of least privilege?**
   - **Explanation:** Each user or service should have only the minimum permissions necessary to perform its function. This limits the damage from compromised accounts or bugs.
6. **What is a role-permission matrix and why is it useful for testing?**
   - **Explanation:** A grid mapping each role to each endpoint with explicit allow/deny values. It ensures comprehensive test coverage — every role-endpoint combination is tested, preventing gaps.
7. **Why should authorization decisions be logged?**
   - **Explanation:** For security auditing, incident investigation, compliance requirements, and debugging permission issues. Every allow/deny with identity, resource, action, and timestamp creates a forensic trail.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is authorization in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is authorization in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
