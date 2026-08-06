# Role-Based Access APIs

## Detailed explanation

Expose APIs that assign, remove, and enforce roles while preventing privilege escalation. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

RBAC APIs manage permissions as sensitive admin actions.

## 2. Problem it solves

This design prevents inconsistent client behavior, duplicated backend logic, unclear errors, security gaps, and production-only workflow bugs.

## 3. Core idea

- Define the resource or workflow clearly.
- Validate input at the API boundary.
- Enforce authentication, authorization, and ownership checks.
- Return consistent success and error shapes.
- Plan idempotency, retries, logging, and monitoring for production behavior.

## 4. Visual / analogy

```txt
Client request
  -> auth/validation
  -> domain rules
  -> database/cache/queue
  -> serialized response/error
  -> frontend behavior
```

## 5. Minimal example

```txt
REQUEST  /api/example
CHECK    auth + validation + domain rules
WRITE    database or enqueue job
RETURN   status code + response body
```

## 6. Real-world example

In production, role-based access apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for role-based access?
- **The Engine Mechanism (Why it behaves this way):** RBAC APIs expose: `GET /api/users/:id/roles` (list roles), `POST /api/users/:id/roles` (assign role), `DELETE /api/users/:id/roles/:roleName` (remove role), `GET /api/roles` (list available roles), `POST /api/roles` (create role, admin only), `PUT /api/roles/:id/permissions` (update role permissions). All mutation endpoints require admin authorization.
- **The Unforgettable Mental Model:** The **HR Department**. HR can hire (assign roles), fire (remove roles), and define job descriptions (create roles with permissions). Employees can view their own job title but can't change it.
- **The Trap:** Allowing users to assign roles to themselves — this is privilege escalation. Role mutations must always require higher-level authorization.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I expose endpoints for listing, assigning, and removing user roles, plus role management for admins. All mutation endpoints require admin authorization. Users can view their own roles but cannot modify them. The key principle is that role changes are always performed by someone with higher privileges than the target role."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** Assign role request: `{ role: "admin" }`. Response: `{ success: true, data: { userId, roles: ["user", "admin"], updatedAt } }`. Remove role response: `{ success: true, data: { userId, roles: ["user"], updatedAt } }`. Error: `{ success: false, error: { code: "PRIVILEGE_ESCALATION" | "ROLE_NOT_FOUND" | "LAST_ADMIN" } }`.
- **The Unforgettable Mental Model:** The **Badge Exchange**. You request a new badge (role assignment), the system checks if you're authorized to issue it, and confirms the exchange with an updated badge list.
- **The Trap:** Not preventing removal of the last admin role — this could lock out all administrators from the system.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The assign request accepts a role name. The response returns the user's updated role list. I include specific error codes like PRIVILEGE_ESCALATION when a user tries to grant themselves higher privileges, and LAST_ADMIN when someone tries to remove the final admin role. The response always reflects the current state after the operation."

#### What validations are required for RBAC APIs?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Requester has admin or higher role; (2) Requester cannot assign a role higher than their own; (3) Target user exists; (4) Role exists in the system; (5) Removing last admin is blocked; (6) Duplicate role assignment is idempotent; (7) Role-permission mappings are validated against the permission registry.
- **The Unforgettable Mental Model:** The **Chain of Command**. A sergeant can promote someone to corporal but not to general. The system checks rank before every promotion or demotion.
- **The Trap:** Not validating that the requester's role is higher than the role being assigned — a regular user could assign themselves admin if this check is missing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate that the requester has sufficient privileges, cannot assign roles higher than their own, and that the target user and role exist. I prevent removal of the last admin. Role assignment is idempotent — assigning an existing role is a no-op. All role-permission mappings are validated against a central permission registry."

#### What status codes can RBAC APIs return?
- **The Engine Mechanism (Why it behaves this way):** `200 OK` on success, `201 Created` when a new role is created, `400 Bad Request` for invalid role names or duplicate assignments, `403 Forbidden` for insufficient permissions or privilege escalation attempts, `404 Not Found` for nonexistent users or roles, `409 Conflict` when trying to remove the last admin, `500 Internal Server Error` for unexpected failures.
- **The Unforgettable Mental Model:** The **Security Clearance Board**. Green (200) means access granted, red (403) means you don't have clearance, yellow (409) means that action would break the system.
- **The Trap:** Returning 401 instead of 403 for authorization failures — 401 means "not authenticated," 403 means "authenticated but not authorized."
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Success returns 200 or 201 for new role creation. Insufficient permissions return 403 Forbidden — not 401, since the user is authenticated but lacks authorization. Invalid inputs return 400. Nonexistent resources return 404. Attempting to remove the last admin returns 409 Conflict. The status codes clearly distinguish between authentication and authorization failures."

#### How do you secure RBAC APIs?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Admin-only access — only users with admin or super-admin roles can modify roles; (2) Role hierarchy enforcement — users cannot assign roles at or above their own level; (3) Last-admin protection — system always maintains at least one admin; (4) Audit logging — every role change is recorded with who, what, when; (5) Immutable system roles — built-in roles like "super-admin" cannot be deleted; (6) Rate limiting — prevent rapid role changes.
- **The Unforgettable Mental Model:** The **Nuclear Launch Protocol**. Multiple checks ensure no single person can escalate privileges: rank verification, peer review (audit log), and a failsafe that always keeps one authorized person in control.
- **The Trap:** Not having a super-admin role that bypasses the hierarchy — if all admins are locked out, there must be a recovery mechanism.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I enforce a strict role hierarchy where users can only assign roles below their own level. System roles like super-admin are immutable. The last admin cannot be removed. Every role change is audit-logged with full context. I also maintain a super-admin recovery mechanism for lockout scenarios, accessible only through a secure out-of-band process."

#### How do you avoid duplicate or unsafe RBAC operations?
- **The Engine Mechanism (Why it behaves this way):** Role assignment is idempotent — assigning an existing role is a no-op. Role removal is also idempotent — removing a non-existent role succeeds silently. The last-admin check prevents unsafe removals. All mutations use database transactions to ensure consistency between role assignments and permission checks.
- **The Unforgettable Mental Model:** The **Light Switch Panel**. Turning on an already-on light does nothing (idempotent assignment). Turning off a non-existent light also does nothing (idempotent removal). But there's a master switch that can never be turned off (last admin protection).
- **The Trap:** Not making role assignment idempotent — retrying a failed role assignment could cause errors or duplicate database entries.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Role assignment and removal are both idempotent. Assigning an existing role returns success without duplicating the entry. Removing a non-existent role also succeeds. The last-admin check prevents dangerous removals. All operations use database transactions to maintain consistency between the roles table and the permission evaluation system."

#### How do you test RBAC APIs?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Admin assigns role → success; (2) Non-admin assigns role → 403; (3) User assigns higher role to self → 403 privilege escalation; (4) Remove last admin → 409; (5) Assign existing role → idempotent success; (6) Remove non-existent role → idempotent success; (7) Role hierarchy enforcement → correct permission checks; (8) Audit log entries → every mutation logged.
- **The Unforgettable Mental Model:** The **Security Penetration Test**. Every possible privilege escalation path is tested, every boundary condition is probed, and the audit trail is verified.
- **The Trap:** Not testing the privilege escalation path — the most critical security test is verifying that a user cannot grant themselves higher privileges.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test admin operations succeed, non-admin operations are rejected with 403, privilege escalation attempts are blocked, the last admin cannot be removed, assignment and removal are idempotent, role hierarchy is enforced correctly, and every mutation creates an audit log entry. The privilege escalation test is the most critical."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: role assigned/removed (actor, target user, role name, timestamp, IP), privilege escalation attempt (blocked), last-admin removal attempt (blocked). Metrics: role change frequency, privilege escalation attempt count, admin count, role distribution across users. Alerts: privilege escalation attempts, admin count dropping to 1, unusual role change patterns.
- **The Unforgettable Mental Model:** The **Security Operations Dashboard**. Every access change is tracked, attempted breaches are flagged, and system health (admin count) is monitored.
- **The Trap:** Not alerting when admin count drops to 1 — this is a critical system risk that needs immediate attention.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log every role change with full context: who made the change, who was affected, what role, when, and from where. I log blocked privilege escalation attempts. Metrics track role change frequency and admin count. I alert on privilege escalation attempts and when admin count drops to 1, which is a critical system risk."

## 8. Active recall test

1. **Who should be allowed to assign roles?**
   - **Explanation:** Only users with admin or higher-level roles — role assignment is a privileged operation that requires elevated authorization.

2. **What prevents a user from assigning themselves an admin role?**
   - **Explanation:** Role hierarchy enforcement — the API checks that the requester's role is higher than the role being assigned, blocking self-escalation.

3. **What happens if someone tries to remove the last admin?**
   - **Explanation:** The operation is blocked with a 409 Conflict — the system must always maintain at least one admin to prevent lockout.

4. **Is role assignment idempotent?**
   - **Explanation:** Yes — assigning a role that the user already has is a no-op that returns success without creating a duplicate entry.

5. **What status code indicates insufficient permissions for role changes?**
   - **Explanation:** `403 Forbidden` — the user is authenticated but does not have the required authorization level to perform the operation.

6. **Why audit-log every role change?**
   - **Explanation:** For compliance, debugging, and security investigation — knowing who changed what role and when is essential for accountability.

7. **What is a role hierarchy?**
   - **Explanation:** A ranking system where higher-level roles can manage lower-level roles, but not vice versa — e.g., admins can manage users, but users cannot manage admins.

8. **What should happen to a user's permissions immediately after a role change?**
   - **Explanation:** Permissions should be recalculated on the next request — either by invalidating the user's cached permissions or by checking the database on each request.

9. **What metric would indicate a security concern in RBAC?**
   - **Explanation:** A spike in privilege escalation attempt blocks — this suggests users or attackers are trying to gain unauthorized access levels.

10. **Why must system roles be immutable?**
    - **Explanation:** Built-in roles like "super-admin" define the security foundation of the system — if they can be deleted or modified, the entire access control system could be compromised.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Role-Based Access APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
