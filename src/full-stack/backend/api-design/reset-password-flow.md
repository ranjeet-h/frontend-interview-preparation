# Reset Password Flow

## Detailed explanation

Accept a valid reset token, set a new hashed password, invalidate token/session state, and notify the user. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Reset password consumes a one-time proof to replace credentials safely.

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

In production, reset password flow should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for reset password?
- **The Engine Mechanism (Why it behaves this way):** A single `POST /api/auth/reset-password` endpoint that accepts a reset token and new password. It validates the token (exists, not expired, not used), hashes the new password, updates the user record, invalidates the token, and optionally revokes all existing sessions. Some systems split this into a token validation step `POST /api/auth/reset-password/validate` and the actual reset.
- **The Unforgettable Mental Model:** The **Safe Combination Change**. You present the emergency override code (reset token), the safe verifies it's valid and unused, you set a new combination (new password), the old code is destroyed, and all previous keys are deactivated (session revocation).
- **The Trap:** Not revoking existing sessions after password reset — if the account was compromised, the attacker's active sessions remain valid.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I expose `POST /api/auth/reset-password` that accepts a reset token and new password. It validates the token, hashes the new password, updates the user record, invalidates the token, and revokes all existing sessions. Session revocation is critical — if the account was compromised, the attacker's sessions must be terminated."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** Request: `{ token: string, password: string, confirmPassword?: string }`. Response on success: `{ success: true, message: "Password has been reset successfully" }` with 200. Response on failure: `{ success: false, error: { code: "INVALID_TOKEN" | "TOKEN_EXPIRED" | "TOKEN_USED" | "WEAK_PASSWORD" } }` with 400 or 401.
- **The Unforgettable Mental Model:** The **Password Reset Kiosk**. You enter your code and new password, the machine validates everything, and confirms the change — or tells you exactly what went wrong.
- **The Trap:** Returning the user object or authentication tokens in the reset response — the user should be redirected to login with their new credentials.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The request accepts the reset token, new password, and optionally a confirmation password for frontend validation. On success, I return a simple confirmation message — no tokens or user data. The user must log in with their new credentials. On failure, I return specific error codes so the frontend can display appropriate messages."

#### What validations are required for reset password?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Token exists and is not expired; (2) Token has not been used; (3) Password meets complexity requirements (length, character types); (4) Password is not in breach databases; (5) Password is not the same as the current password (optional); (6) Token-user association is verified; (7) Atomic operation — token invalidation and password update happen in a single transaction.
- **The Unforgettable Mental Model:** The **Multi-Checkpoint Gate**. Each checkpoint verifies one thing: the pass is valid (token check), hasn't been used (single-use), the new uniform meets standards (password rules), and the change is recorded all at once (atomic transaction).
- **The Trap:** Not using a database transaction — if the password updates but the token isn't invalidated, the token can be reused for another reset.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate the token exists, is not expired, and hasn't been used. The new password must meet complexity requirements and not be in breach databases. Critically, I wrap the password update and token invalidation in a single database transaction — if either fails, neither succeeds. I also revoke all existing sessions after the reset."

#### What status codes can the reset password API return?
- **The Engine Mechanism (Why it behaves this way):** `200 OK` on success, `400 Bad Request` for invalid token, expired token, used token, or weak password, `401 Unauthorized` if the token is invalid (alternative to 400), `429 Too Many Requests` if rate limited, `500 Internal Server Error` for unexpected failures.
- **The Unforgettable Mental Model:** The **Reset Station**. Green light (200) means password changed, red light (400) means something's wrong with your input, flashing red (429) means slow down.
- **The Trap:** Returning 404 for an invalid token — this reveals information about token validity. Use 400 with a generic error code instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Success returns 200. Invalid, expired, or used tokens return 400 with specific error codes. Weak passwords return 400. Rate limiting returns 429. I avoid 404 for invalid tokens to prevent information leakage. The frontend uses the error code to display the right message: 'Link expired,' 'Link already used,' or 'Password too weak.'"

#### How do you secure the reset password API?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Token validation — exists, not expired, not used; (2) Password hashing — bcrypt/argon2id with appropriate cost; (3) Session revocation — all existing sessions invalidated after reset; (4) Rate limiting — prevent token brute forcing; (5) Breach checking — reject passwords found in known breaches; (6) Notification — email the user that their password was changed; (7) Audit logging — all reset attempts recorded.
- **The Unforgettable Mental Model:** The **Bank Account Recovery**. The bank verifies your identity code, lets you set a new PIN, cancels all existing cards, sends you a confirmation letter, and records everything for the audit trail.
- **The Trap:** Not notifying the user after a password reset — if an attacker successfully resets the password, the legitimate user should be alerted immediately.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate the token thoroughly, hash the new password with bcrypt or argon2id, revoke all existing sessions, and send a notification email to the user confirming the password change. I rate-limit the endpoint to prevent token brute forcing. Every attempt is logged. The notification email is critical — it alerts the legitimate user if their account was compromised."

#### How do you avoid duplicate or unsafe reset password operations?
- **The Engine Mechanism (Why it behaves this way):** The reset token is single-use and invalidated atomically with the password update in a database transaction. If the same token is submitted twice, the second attempt fails because the token is already marked as used. Rate limiting prevents rapid-fire attempts.
- **The Unforgettable Mental Model:** The **One-Time Pad**. Once the code is used, it's burned. Submitting it again produces nothing — the paper is already ash.
- **The Trap:** Not using a transaction — a race condition between two concurrent reset attempts with the same token could allow both to succeed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a database transaction to atomically invalidate the token and update the password. This prevents race conditions where two concurrent requests with the same token could both succeed. The token is marked as used in the same transaction as the password update, so a second attempt always fails."

#### How do you test the reset password API?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Valid token + strong password → 200, password updated, token invalidated, sessions revoked; (2) Expired token → 400; (3) Used token → 400; (4) Weak password → 400; (5) Concurrent reset attempts → only one succeeds; (6) Password hashing → stored hash differs from input; (7) Session revocation → old tokens rejected; (8) Notification email → sent with correct content.
- **The Unforgettable Mental Model:** The **Full Security Audit**. Every path through the reset flow is tested, including the race condition scenarios and the aftermath (session revocation, notifications).
- **The Trap:** Not testing concurrent reset attempts — this is where race condition bugs surface and where the transaction requirement is validated.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test valid resets, expired/used token rejection, weak password rejection, concurrent attempt handling (only one succeeds), password hashing verification, session revocation confirmation, and notification email delivery. The concurrent test is critical — it validates the atomic transaction requirement."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: reset attempt (token ID hash, IP, timestamp, outcome), password changed, sessions revoked, notification sent. Metrics: reset success rate, token expiry rate, weak password rejection rate, average latency, session revocation count. Alerts: high reset failure rate (token guessing attack), reset without prior forgot-password request (token leakage).
- **The Unforgettable Mental Model:** The **Security Operations Center**. Every access attempt is monitored, success and failure patterns are tracked, and anomalies trigger immediate investigation.
- **The Trap:** Logging the raw reset token — tokens in logs can be used to hijack accounts. Log only the token's hash or ID.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log reset attempts with token ID (hashed), IP, timestamp, and outcome — never the raw token. Metrics track success rate, expiry rate, and weak password rejections. I alert on high failure rates that suggest token guessing, and resets that don't follow a forgot-password request, which could indicate token leakage."

## 8. Active recall test

1. **What endpoint handles password reset?**
   - **Explanation:** `POST /api/auth/reset-password` — accepts a reset token and new password, validates the token, and updates the user's password.

2. **Why must password update and token invalidation be in a single transaction?**
   - **Explanation:** To prevent race conditions — without a transaction, two concurrent requests with the same token could both succeed, allowing multiple password changes.

3. **What should happen to existing sessions after a password reset?**
   - **Explanation:** All existing sessions should be revoked — if the account was compromised, the attacker's active sessions must be terminated.

4. **What status code is returned for an expired reset token?**
   - **Explanation:** `400 Bad Request` with an error code like "TOKEN_EXPIRED" — the token is invalid for use.

5. **Why send a notification email after password reset?**
   - **Explanation:** To alert the legitimate user that their password was changed — if they didn't initiate the reset, they know their account was compromised.

6. **What prevents a reset token from being used twice?**
   - **Explanation:** The token is marked as "used" in the database atomically with the password update — a second attempt finds the token already invalidated.

7. **Should the reset API return authentication tokens?**
   - **Explanation:** No — the user should be redirected to the login page and authenticate with their new credentials. Returning tokens would bypass the login flow.

8. **What password checks should be performed during reset?**
   - **Explanation:** Complexity requirements (length, character types), breach database check (HaveIBeenPwned), and optionally checking it's not the same as the current password.

9. **What happens if two users submit the same reset token simultaneously?**
   - **Explanation:** Only one succeeds due to the atomic database transaction — the second request finds the token already marked as used and fails.

10. **What metric would indicate a token brute force attack?**
    - **Explanation:** A high reset failure rate with many different tokens being tried, especially from a single IP or targeting a single account.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Reset Password Flow.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
