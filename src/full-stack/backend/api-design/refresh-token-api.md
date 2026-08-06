# Refresh Token API

## Detailed explanation

Issue a new access token using a valid refresh token while supporting rotation, revocation, and replay detection. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Refresh keeps sessions alive without making access tokens long-lived.

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

In production, refresh token api should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for token refresh?
- **The Engine Mechanism (Why it behaves this way):** A single `POST /api/auth/refresh` endpoint reads the refresh token from an httpOnly cookie, validates it, and returns a new access token. With refresh token rotation, it also returns a new refresh token and invalidates the old one. The endpoint requires no request body — the cookie provides authentication.
- **The Unforgettable Mental Model:** The **Casino Chip Exchange**. You hand in your old chip (refresh token), the cashier verifies it's genuine, gives you a fresh chip (new refresh token), and some cash for the table (new access token). The old chip is destroyed.
- **The Trap:** Accepting the refresh token in the request body or URL — it must come from an httpOnly cookie to prevent XSS theft.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I expose `POST /api/auth/refresh` which reads the refresh token from an httpOnly cookie. It validates the token, checks it hasn't been revoked, and returns a new access token. With rotation enabled, it also issues a new refresh token and invalidates the old one. No request body is needed — the cookie carries the authentication."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** Request: empty body (refresh token comes from cookie). Response on success: `{ success: true, data: { accessToken, expiresIn } }` with Set-Cookie header for new refresh token (if rotating). Response on failure: `{ success: false, error: { code: "INVALID_REFRESH_TOKEN" | "TOKEN_EXPIRED" | "TOKEN_REVOKED" } }` with 401 status.
- **The Unforgettable Mental Model:** The **Automatic Vending Machine**. You don't insert anything visible (token is in the cookie slot), the machine checks your loyalty card internally, and dispenses a fresh product (new access token).
- **The Trap:** Returning the refresh token in the JSON response body — it should only be set via Set-Cookie header to maintain httpOnly protection.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The request has no body — the refresh token comes from the httpOnly cookie. On success, I return a new access token in the response body and set a new refresh token via Set-Cookie header if rotating. On failure, I return a 401 with a specific error code so the frontend knows whether to redirect to login or retry."

#### What validations are required for token refresh?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Token exists in cookie; (2) Token signature is valid (JWT verification or database lookup for opaque tokens); (3) Token is not expired; (4) Token is not revoked (check revocation list/flag); (5) Token belongs to an active (non-suspended) user; (6) With rotation, the old token is atomically invalidated and a new one issued. Replay detection: if a rotated token is reused, revoke the entire token family.
- **The Unforgettable Mental Model:** The **Passport Control**. They check the passport exists (token present), the stamp is genuine (signature valid), it hasn't expired (expiry check), it's not reported stolen (revocation check), and the holder isn't on a watch list (active user).
- **The Trap:** Not implementing replay detection with rotation — if a rotated refresh token is stolen and used, the system must detect the reuse and revoke all related tokens.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate the token's existence, signature, expiry, and revocation status. I check the associated user account is still active. With rotation, I atomically swap the old token for a new one. Critically, I implement replay detection — if a previously-rotated token is reused, I revoke the entire token family, which signals a potential theft and forces re-authentication."

#### What status codes can the refresh API return?
- **The Engine Mechanism (Why it behaves this way):** `200 OK` on success, `401 Unauthorized` for invalid/expired/revoked tokens, `403 Forbidden` if the user account is suspended, `500 Internal Server Error` for unexpected failures. No 400 needed since there's no request body to validate.
- **The Unforgettable Mental Model:** The **Security Gate**. 200 means you pass through, 401 means your badge doesn't work, 403 means you've been banned from the building, 500 means the gate mechanism is broken.
- **The Trap:** Returning 400 for an expired token — 401 is more semantically correct since the authentication credential is invalid.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Success returns 200. Invalid, expired, or revoked tokens return 401. Suspended user accounts return 403. Since there's no request body, 400 isn't needed. The frontend uses these codes to decide: retry with new token (200), redirect to login (401), or show account suspended message (403)."

#### How do you secure the refresh token API?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) httpOnly, Secure, SameSite=Strict cookies — prevents XSS and CSRF; (2) Refresh token rotation — each use generates a new token, invalidating the old; (3) Replay detection — reused rotated tokens trigger family revocation; (4) Short refresh token lifetime — 7-30 days maximum; (5) IP/device binding — optional, ties tokens to specific clients; (6) Rate limiting — prevents token enumeration; (7) Revocation list — supports logout and compromise response.
- **The Unforgettable Mental Model:** The **Rolling Combination Lock**. Every time you open it (use the token), the combination changes (rotation). If someone tries the old combination (replay), the lock self-destructs (family revocation).
- **The Trap:** Not rotating refresh tokens — a stolen token remains valid until its natural expiry, giving attackers a long window.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I store refresh tokens in httpOnly, Secure, SameSite cookies. I implement rotation — each refresh issues a new token and invalidates the old. Replay detection catches stolen token reuse and revokes the entire token family. Tokens have a maximum 30-day lifetime. I maintain a revocation list for logout and compromise scenarios. And I rate-limit the endpoint to prevent enumeration."

#### How do you avoid duplicate or unsafe refresh operations?
- **The Engine Mechanism (Why it behaves this way):** With rotation, the refresh operation is NOT idempotent — each call produces a new token. To handle concurrent refresh calls (e.g., multiple tabs), implement a token request queue or use the same access token until it expires. Alternatively, use non-rotating refresh tokens (simpler but less secure) where the same token can be used repeatedly.
- **The Unforgettable Mental Model:** The **Single-File Cabinet**. Only one person can access the file at a time. If two people try simultaneously, one waits. The file content changes each time it's accessed, so reading it twice gives different results.
- **The Trap:** Multiple tabs calling refresh simultaneously with rotation — the second call gets a 401 because the first call already invalidated the token, causing a cascade of failed requests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: With rotation, refresh is not idempotent, which creates a challenge with multiple tabs. I handle this by implementing a token request lock — if a refresh is already in progress, other requests wait for the result. Alternatively, I use a non-rotating strategy for simpler systems where the same refresh token remains valid until expiry or explicit revocation."

#### How do you test the refresh token API?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Valid token → new access token; (2) Expired token → 401; (3) Revoked token → 401; (4) Missing cookie → 401; (5) Rotation → old token invalidated, new token works; (6) Replay after rotation → 401 + family revocation; (7) Suspended user → 403; (8) Concurrent refresh → no race conditions; (9) Token family tree — verify all related tokens are revoked on replay detection.
- **The Unforgettable Mental Model:** The **Stress Test Lab**. Every possible token state is tested — valid, expired, revoked, stolen, duplicated, and the system's response to each is verified.
- **The Trap:** Not testing the replay detection scenario — this is the most critical security feature of rotation and the most likely to have bugs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test valid token refresh, expired and revoked token rejection, missing cookie handling, rotation behavior (old token invalidated), replay detection (family revocation on reused rotated token), suspended user rejection, and concurrent refresh handling. The replay detection test is the most important — it validates the core security mechanism of rotation."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: refresh attempt (user ID, IP, timestamp, outcome, rotation event), token revoked, family revoked (replay detected). Metrics: refresh success rate, rotation count per user, replay detection count, average latency, token expiry distribution. Alerts: high replay detection rate (active token theft), unusual refresh frequency (compromised client), spike in revocations.
- **The Unforgettable Mental Model:** The **Bank Fraud Monitor**. Every transaction is logged, patterns are analyzed, and anomalies trigger immediate investigation.
- **The Trap:** Logging the actual token values — tokens in logs are a security risk. Log only metadata: user ID, IP, outcome, and event type.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log refresh attempts with user ID, IP, outcome, and rotation events — never the actual token values. Metrics track success rate, rotation frequency, and replay detection counts. I alert on high replay detection rates, which indicate active token theft, and unusual refresh patterns that suggest compromised clients."

## 8. Active recall test

1. **What endpoint handles token refresh?**
   - **Explanation:** `POST /api/auth/refresh` — reads the refresh token from an httpOnly cookie and returns a new access token.

2. **What is refresh token rotation?**
   - **Explanation:** Each time a refresh token is used, it's invalidated and replaced with a new one — this limits the window of opportunity for stolen tokens.

3. **What happens if a rotated refresh token is reused?**
   - **Explanation:** Replay detection triggers — the entire token family is revoked, forcing the user to re-authenticate, as reuse indicates potential theft.

4. **Why must refresh tokens be stored in httpOnly cookies?**
   - **Explanation:** httpOnly cookies cannot be accessed by JavaScript, protecting them from XSS attacks that could steal tokens from localStorage.

5. **What status code is returned for an expired refresh token?**
   - **Explanation:** `401 Unauthorized` — the authentication credential is no longer valid.

6. **How do you handle concurrent refresh calls from multiple tabs?**
   - **Explanation:** Implement a token request lock — if a refresh is in progress, other requests wait for the result to avoid invalidating the token mid-flight.

7. **What is a token family?**
   - **Explanation:** A chain of refresh tokens linked by rotation — each new token is a child of the previous one. If any token in the family is reused, all are revoked.

8. **What is the maximum recommended lifetime for a refresh token?**
   - **Explanation:** 7-30 days — long enough for user convenience but short enough to limit exposure if the token is compromised.

9. **Why is refresh with rotation NOT idempotent?**
   - **Explanation:** Each call produces a different result (new token) and invalidates the previous token, so calling it twice gives different outcomes.

10. **What metric would indicate active token theft?**
    - **Explanation:** A high replay detection count — rotated tokens being reused means an attacker has captured and is attempting to use old tokens.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Refresh Token API.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
