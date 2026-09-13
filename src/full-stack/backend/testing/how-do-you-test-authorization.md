# How do you test authorization

## Detailed explanation

How do you test authorization is a core backend testing topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you test authorization by linking what it is, why it exists, and how it fails in production.

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
Work   -> apply backend testing rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you test authorization affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you test authorization?
- **The Engine Mechanism (Why it behaves this way):** Authorization testing verifies that users can only access resources they're permitted to access, based on their roles, permissions, or ownership. You test: role-based access control (admin vs. user vs. guest), resource-level permissions (can user A edit resource B?), ownership checks (can users only edit their own resources?), hierarchical permissions (manager can access subordinate data), and denial of access for unauthorized actions. Tests use mock user contexts with different roles and verify that each role can or cannot perform specific actions.
- **The Unforgettable Mental Model:** The **Office Building Access Card**. The CEO card opens all doors, the manager card opens their floor, the employee card opens only their office, and the visitor card opens only the lobby. You test every card against every door.
- **The Trap:** Only testing that authorized access works. The critical test is that unauthorized access is denied — testing the "no" is more important than testing the "yes."
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test authorization by creating test users with different roles and permissions, then verifying each can access only what they're allowed to. I test role-based access, resource-level permissions, ownership checks, and hierarchical access. The most important tests are the denial cases — verifying that a regular user cannot access admin endpoints, and that user A cannot access user B's data."

#### Why does authorization testing matter?
- **The Engine Mechanism (Why it behaves this way):** Authorization bugs are security vulnerabilities. Insecure Direct Object Reference (IDOR) vulnerabilities, privilege escalation, and broken access control consistently rank in the OWASP Top 10. Authorization testing catches bugs where users can access other users' data, regular users can perform admin actions, or deleted users retain access. These bugs can lead to data breaches, compliance violations, and legal liability.
- **The Unforgettable Mental Model:** The **Bank Vault**. It doesn't matter how strong the vault door is if the wrong people have combinations. Authorization testing verifies that only the right people have the right combinations to the right vaults.
- **The Trap:** Assuming authentication implies authorization. Just because someone is logged in doesn't mean they should have access to everything.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Authorization bugs are security vulnerabilities — IDOR, privilege escalation, and broken access control are in the OWASP Top 10. Authorization testing catches bugs where users access other users' data, perform admin actions, or retain access after deletion. Authentication proves who you are; authorization determines what you can do. They're separate concerns and both need testing."

#### What is a simple authorization test?
- **The Engine Mechanism (Why it behaves this way):** A basic authorization test creates two users (admin and regular), seeds a resource owned by the regular user, then verifies: admin can access the resource (200), regular user can access their own resource (200), a third user cannot access the resource (403), and an unauthenticated user cannot access the resource (401). The test also verifies that the regular user cannot perform admin actions like deleting other users' resources.
- **The Unforgettable Mental Model:** The **Permission Matrix**. Draw a grid with users as rows and actions as columns. Fill each cell with "allowed" or "denied." The test verifies every cell matches the expected value.
- **The Trap:** Testing only one role. You need to test the full matrix of roles × resources × actions to catch authorization gaps.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A basic authz test creates users with different roles, seeds resources, and verifies the full permission matrix: admin can access everything, users can access their own resources, users cannot access others' resources, and unauthenticated users get 401. I test the full matrix of roles × resources × actions, not just one role or one action."

#### What edge cases can break authorization?
- **The Engine Mechanism (Why it behaves this way):** Common edge cases include: users with multiple roles (role precedence), deleted or suspended users retaining access, resource ownership transfer, bulk operations bypassing per-resource checks, API endpoints missing authorization middleware, GraphQL queries that expose unauthorized nested data, and race conditions where permissions change during a request. Authorization tests should also verify that URL manipulation (changing resource IDs) doesn't bypass access controls.
- **The Unforgettable Mental Model:** The **Swiss Cheese Model**. Each authorization check is a slice of cheese with holes (edge cases). When you stack enough slices, the holes align and unauthorized access slips through. Testing finds and plugs the holes.
- **The Trap:** Forgetting to test GraphQL nested resolvers. The top-level query might check authorization, but nested fields might not.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test edge cases like users with multiple roles, deleted users retaining access, ownership transfers, bulk operations bypassing per-resource checks, missing auth middleware on new endpoints, and GraphQL nested resolvers exposing unauthorized data. I also test URL manipulation — changing resource IDs in the URL shouldn't bypass access controls. Each new endpoint needs authorization testing."

#### How do authorization tests affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients use authorization responses to determine what UI elements to show or hide. Authorization tests verify that the backend returns correct 403 responses for unauthorized actions, which the frontend uses to disable buttons, hide menus, or show error messages. The frontend should never be the sole authorization gate — the backend must enforce access control independently. Authorization tests ensure the backend is the source of truth.
- **The Unforgettable Mental Model:** The **Traffic Light System**. The frontend shows green (allowed) or red (denied) lights, but the backend is the actual traffic controller. If the frontend light is wrong, the backend still stops unauthorized traffic.
- **The Trap:** Relying on frontend authorization. UI-level access control is cosmetic; backend authorization is the real security boundary.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Authorization tests verify that the backend returns correct 403 responses, which the frontend uses to control UI elements. But the frontend should never be the sole authorization gate — the backend must enforce access control independently. The frontend's UI hints are cosmetic; the backend's 403 responses are the real security boundary. I test that the backend rejects unauthorized requests even if the frontend doesn't send them."

#### What would you monitor for authorization health?
- **The Engine Mechanism (Why it behaves this way):** Key metrics include: 403 response rate (should be low for legitimate users, high for attackers), authorization failure patterns (specific endpoints getting many 403s), privilege escalation attempts, access to deleted resources, and role assignment anomalies. You should also monitor for unusual access patterns: users accessing resources outside their normal scope, sudden role changes, and bulk data access by non-admin users.
- **The Unforgettable Mental Model:** The **Security Audit Trail**. Every access attempt is logged — who tried to access what, when, and whether they were allowed. Patterns in the logs reveal both bugs and attacks.
- **The Trap:** Not logging authorization failures. Without logs, you can't detect authorization bugs or attack attempts.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor 403 response rates, authorization failure patterns by endpoint, privilege escalation attempts, and access to deleted resources. I also watch for unusual access patterns — users accessing resources outside their scope, sudden role changes, and bulk data access by non-admins. Authorization failures are logged with user ID, resource, and action so we can detect both bugs and attacks."

## 8. Active recall test

1. **How do you test authorization?**
   - **Explanation:** Create users with different roles, seed resources, and verify the full permission matrix: who can access what. Test role-based access, resource ownership, and denial cases (403 for unauthorized).

2. **Why is authorization testing a security concern?**
   - **Explanation:** Authorization bugs (IDOR, privilege escalation, broken access control) are in the OWASP Top 10. They allow users to access data or perform actions they shouldn't, leading to data breaches.

3. **What does a basic authorization test verify?**
   - **Explanation:** Admin can access everything (200), users can access their own resources (200), users cannot access others' resources (403), and unauthenticated users get 401.

4. **What edge cases break authorization?**
   - **Explanation:** Multiple roles, deleted users retaining access, ownership transfers, bulk operations bypassing checks, missing auth middleware, GraphQL nested resolvers, and URL manipulation.

5. **Why must backend enforce authorization independently of frontend?**
   - **Explanation:** Frontend UI hints are cosmetic and can be bypassed. The backend is the real security boundary — it must reject unauthorized requests even if the frontend doesn't send them.

6. **What production metrics indicate authorization health?**
   - **Explanation:** 403 response rates, failure patterns by endpoint, privilege escalation attempts, access to deleted resources, and unusual access patterns outside normal user scope.

7. **Why test GraphQL nested resolvers for authorization?**
   - **Explanation:** The top-level query might check authorization, but nested fields might expose unauthorized data. Each resolver in the chain needs its own authorization check.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you test authorization in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you test authorization in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
