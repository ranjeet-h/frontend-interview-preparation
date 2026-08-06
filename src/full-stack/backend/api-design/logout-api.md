# Logout API

## Detailed explanation

End a user session by clearing cookies and revoking refresh/session records server-side. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Logout must invalidate server-side trust, not only delete frontend state.

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

In production, logout api should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for logout?
- **The Engine Mechanism (Why it behaves this way):** A single `POST /api/auth/logout` endpoint that revokes the current refresh token/session, clears the httpOnly cookie, and optionally revokes all sessions for the user. Some systems also expose `DELETE /api/auth/sessions/:id` for revoking specific sessions and `DELETE /api/auth/sessions` for revoking all sessions.
- **The Unforgettable Mental Model:** The **Hotel Checkout**. You return your room key (token revocation), the front desk clears your reservation (cookie clearing), and you can choose to log out all devices (cancel all reservations).
- **The Trap:** Making logout a GET request — it's a state-changing action that must use POST or DELETE. GET requests can be preloaded by browsers, accidentally triggering logout.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I expose `POST /api/auth/logout` to revoke the current session and clear the refresh token cookie. I also provide `DELETE /api/auth/sessions/:id` for revoking specific sessions and `DELETE /api/auth/sessions` for revoking all sessions across devices. Logout must be POST or DELETE, never GET."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** Request: empty body or optional `{ allDevices: boolean }` to revoke all sessions. Response on success: `{ success: true, message: "Logged out successfully" }` with Set-Cookie header to clear the refresh token (expires in the past). Response on failure: `{ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }` with 401.
- **The Unforgettable Mental Model:** The **Return Receipt**. You hand back the key (request), the desk confirms it's processed (response), and stamps your checkout time (cookie expiry in the past).
- **The Trap:** Not clearing the cookie server-side — if the frontend only deletes the token client-side, the server-side session remains valid.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The request is minimal — an optional flag to revoke all sessions. On success, I return a 200 with a confirmation message and set the refresh token cookie to expire in the past, effectively clearing it. The server-side session revocation is the critical part — client-side cleanup alone is insufficient."

#### What validations are required for logout?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Check if a valid session/token exists (logout without authentication should still succeed idempotently); (2) Verify the token belongs to the requesting user; (3) If revoking all sessions, verify user identity; (4) Ensure the cookie clearing header is set regardless of server-side state. Logout should be idempotent — calling it multiple times should not error.
- **The Unforgettable Mental Model:** The **Universal Exit Door**. Whether you're inside or outside the building, pushing the exit door works the same way — it's always safe to leave.
- **The Trap:** Returning an error when an unauthenticated user calls logout — this breaks idempotency and causes frontend errors when the token has already expired.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Logout should be idempotent. If the user is authenticated, I revoke their session and clear the cookie. If they're already logged out or the token is expired, I still return 200 — it's always safe to call logout. This prevents frontend errors when the token has already expired on the server side."

#### What status codes can the logout API return?
- **The Engine Mechanism (Why it behaves this way):** `200 OK` on success (always, due to idempotency), `500 Internal Server Error` for unexpected failures. Even if the user is not authenticated, return 200 — the desired state (logged out) is already achieved. No 401 needed for logout.
- **The Unforgettable Mental Model:** The **Always-Open Exit**. No matter your status inside, the exit door always opens (200). The only time it fails is if the building itself is on fire (500).
- **The Trap:** Returning 401 when the user is not authenticated — the user is already in the desired state (logged out), so 200 is correct.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Logout always returns 200, even if the user is already logged out or the token is expired. This is because logout is idempotent — the desired end state is 'not authenticated,' and if that's already true, the operation succeeded. Only unexpected server errors return 500."

#### How do you secure the logout API?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Server-side session revocation — the token is marked invalid in the database/Redis; (2) Cookie clearing — Set-Cookie with maxAge=0 or expires in the past; (3) CSRF protection — logout must be protected against cross-site request forgery; (4) Audit logging — log who logged out and when; (5) All-devices logout requires re-authentication for sensitive operations.
- **The Unforgettable Mental Model:** The **Nuclear Deactivation**. The key is destroyed (cookie cleared), the access code is removed from the system (session revoked), and a record is kept of who deactivated it (audit log).
- **The Trap:** Only clearing the cookie without revoking the server-side session — the token remains valid if someone captured it before logout.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I revoke the session server-side in the database or Redis, clear the httpOnly cookie with an expiry in the past, and protect the endpoint with CSRF tokens. I log the logout event for audit purposes. For 'logout all devices,' I revoke all sessions for that user, which requires the user to be currently authenticated."

#### How do you avoid duplicate or unsafe logout operations?
- **The Engine Mechanism (Why it behaves this way):** Logout is idempotent by design — revoking an already-revoked session is a no-op. The database revocation uses an upsert or soft-delete pattern: `UPDATE sessions SET revoked = true WHERE id = ? AND revoked = false`. If the session is already revoked, zero rows are affected, but the operation still succeeds.
- **The Unforgettable Mental Model:** The **Light Switch**. Flipping an already-off switch does nothing harmful — the room stays dark. The action is safe to repeat.
- **The Trap:** Throwing an error when revoking an already-revoked session — this breaks idempotency and causes issues with retry logic.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Logout is naturally idempotent. I use a conditional update that only affects rows not already revoked. If the session is already revoked, zero rows change, but the API still returns 200. This makes logout safe to retry and prevents errors from duplicate calls."

#### How do you test the logout API?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Valid session → 200, session revoked, cookie cleared; (2) Already logged out → 200, no error; (3) Expired token → 200, idempotent; (4) All devices logout → all sessions revoked; (5) Specific session revocation → only targeted session revoked; (6) CSRF protection → cross-site request rejected; (7) Cookie cleared → subsequent requests with old token fail.
- **The Unforgettable Mental Model:** The **Fire Drill**. Test the normal exit, the already-evacuated scenario, the blocked exit, and verify that after evacuation, no one can re-enter with the old key.
- **The Trap:** Not testing that the revoked token is actually rejected on subsequent API calls — the logout is only effective if the token no longer works.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test successful logout with session revocation and cookie clearing, idempotent behavior when already logged out, all-devices logout, specific session revocation, CSRF protection, and critically, I verify that the revoked token is rejected on subsequent API calls. The last test confirms the logout actually works."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: logout event (user ID, IP, timestamp, all-devices flag), session revoked count. Metrics: logout rate, average session duration before logout, all-devices logout percentage, logout failure rate. Alerts: unusual logout patterns (mass logout suggesting account compromise), high logout failure rate (system issue).
- **The Unforgettable Mental Model:** The **Building Access Log**. Every entry and exit is recorded, patterns are analyzed, and unusual activity triggers investigation.
- **The Trap:** Not logging logout events — without audit trails, you can't investigate security incidents or understand user session patterns.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log every logout with user ID, IP, timestamp, and whether it was all-devices. Metrics track logout rate, average session duration, and failure rate. I alert on unusual patterns like mass logouts, which could indicate account compromise, and high failure rates that suggest system issues."

## 8. Active recall test

1. **What HTTP method should logout use?**
   - **Explanation:** `POST` or `DELETE` — logout is a state-changing action. GET should never be used as it can be preloaded by browsers.

2. **Why should logout be idempotent?**
   - **Explanation:** Calling logout multiple times should always succeed — if the user is already logged out, the desired state is already achieved, so returning 200 is correct.

3. **What happens server-side during logout?**
   - **Explanation:** The session/refresh token is marked as revoked in the database or Redis, making it invalid for future authentication.

4. **How is the refresh token cookie cleared?**
   - **Explanation:** Set-Cookie header with the same cookie name, maxAge=0 or an expiry date in the past, which tells the browser to delete it.

5. **What status code should logout return for an unauthenticated user?**
   - **Explanation:** `200 OK` — the user is already in the desired state (logged out), so the operation is considered successful.

6. **What is the difference between logout and logout all devices?**
   - **Explanation:** Logout revokes only the current session. Logout all devices revokes every active session for that user across all devices and browsers.

7. **Why is CSRF protection important for logout?**
   - **Explanation:** Without CSRF protection, a malicious site could trigger a logout request on behalf of the user, causing a denial-of-service by forcing them to log out.

8. **What should you verify after implementing logout?**
   - **Explanation:** That the revoked token is actually rejected on subsequent API calls — logout is only effective if the token no longer authenticates.

9. **What database operation handles idempotent logout?**
   - **Explanation:** A conditional update: `UPDATE sessions SET revoked = true WHERE id = ? AND revoked = false` — affects zero rows if already revoked, but still succeeds.

10. **What metric would indicate a security incident related to logout?**
    - **Explanation:** A sudden spike in "logout all devices" events or mass logouts from a single account, which could indicate the user detected unauthorized access.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Logout API.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
