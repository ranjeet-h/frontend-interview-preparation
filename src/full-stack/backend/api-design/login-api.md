# Login API

## Detailed explanation

Verify credentials, create an authenticated session or token pair, and return safe user/session metadata. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Login exchanges proof of identity for a short-lived authenticated state.

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

In production, login api should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for login?
- **The Engine Mechanism (Why it behaves this way):** A login API exposes `POST /api/auth/login` which accepts credentials and returns an access token (JWT or opaque) plus a refresh token. The access token is short-lived (15-30 min), the refresh token is long-lived (7-30 days) and stored in an httpOnly cookie. Some systems also expose `POST /api/auth/login/mfa` for multi-factor authentication completion.
- **The Unforgettable Mental Model:** The **Hotel Check-In**. You show your ID and credit card (credentials), get a room key card (access token) that expires at checkout, and a loyalty card (refresh token) that lets you get a new room key without re-verifying everything.
- **The Trap:** Returning tokens in the response body for the frontend to store in localStorage. Access tokens should be short-lived; refresh tokens must be httpOnly cookies to prevent XSS theft.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I expose `POST /api/auth/login` that accepts email and password, validates credentials, and returns an access token plus sets an httpOnly refresh token cookie. The access token is short-lived (15 minutes) for API calls. The refresh token is long-lived and stored securely. If MFA is enabled, the first login returns a challenge, and `POST /api/auth/login/mfa` completes authentication."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** Request: `{ email, password, mfaCode? }`. Response on success: `{ success: true, data: { accessToken, user: { id, email, name, role }, expiresIn } }` with Set-Cookie header for refresh token. Response on failure: `{ success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } }` — note the generic message to avoid email enumeration.
- **The Unforgettable Mental Model:** The **Vending Machine**. You insert coins (credentials), it validates them internally, and either dispenses your product (tokens) or shows a generic "insufficient funds" message — it never tells you exactly which coin was wrong.
- **The Trap:** Returning different error messages for "email not found" vs "wrong password" — this allows attackers to enumerate valid emails.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The request accepts email and password. On success, I return an access token, user metadata (id, name, role), and set an httpOnly refresh token cookie. On failure, I return a generic 'Invalid email or password' message — never revealing which field was wrong to prevent email enumeration attacks."

#### What validations are required for login?
- **The Engine Mechanism (Why it behaves this way):** Validations include: email format check, password presence, account status verification (not locked/suspended/banned), MFA requirement check if enabled, and rate limiting per account and per IP. After failed attempts, exponential backoff is applied. The password comparison uses a constant-time function to prevent timing attacks.
- **The Unforgettable Mental Model:** The **Multi-Lock Door**. First key fits the lock format (email format), second key turns (password check), third key confirms you're allowed in (account status), and a guard watches how many times you've tried (rate limiting).
- **The Trap:** Not using constant-time comparison for password hashing — attackers can use timing analysis to guess passwords character by character.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate email format and password presence, check account status (not locked or banned), enforce rate limiting per IP and per account, and use constant-time comparison for password verification to prevent timing attacks. After repeated failures, I apply exponential backoff and optionally lock the account temporarily."

#### What status codes can the login API return?
- **The Engine Mechanism (Why it behaves this way):** `200 OK` on success (login is not creating a resource, it's an action), `400 Bad Request` for malformed input, `401 Unauthorized` for invalid credentials, `403 Forbidden` for locked/suspended accounts, `429 Too Many Requests` for rate limiting, `500 Internal Server Error` for unexpected failures. Note: 200 not 201 because login is an action, not resource creation.
- **The Unforgettable Mental Model:** The **Club Entry System**. 200 means you're in, 400 means your ID is unreadable, 401 means wrong password, 403 means you're on the blacklist, 429 means too many people are trying to enter.
- **The Trap:** Returning 404 for "user not found" — this reveals that the email doesn't exist in the system. Always use 401 for any credential failure.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Success returns 200 OK since login is an action, not resource creation. Invalid credentials return 401 Unauthorized with a generic message. Locked accounts return 403 Forbidden. Malformed input returns 400. Rate limiting returns 429. I never return 404 for a missing email — that would allow email enumeration."

#### How do you secure the login API?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Rate limiting — progressive delays after failed attempts; (2) Account lockout — temporary lock after N failures; (3) httpOnly cookies for refresh tokens — prevents XSS theft; (4) Short-lived access tokens — limits damage if stolen; (5) MFA support — adds a second factor; (6) IP-based anomaly detection — flags logins from unusual locations; (7) Generic error messages — prevents enumeration; (8) CSRF protection on cookie-based auth.
- **The Unforgettable Mental Model:** The **Bank Vault**. Multiple locks (rate limiting, lockout, MFA), security cameras (anomaly detection), and the vault door never reveals which combination digit was wrong (generic errors).
- **The Trap:** Storing access tokens in localStorage — any XSS vulnerability can steal them. httpOnly cookies are the only safe storage for sensitive tokens.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I apply multiple security layers. Rate limiting with progressive delays prevents brute force. Account lockout after repeated failures stops sustained attacks. Refresh tokens are stored in httpOnly cookies to prevent XSS theft. Access tokens are short-lived. MFA adds a second factor. Error messages are generic to prevent enumeration. And I use CSRF tokens for cookie-based authentication."

#### How do you avoid duplicate or unsafe login operations?
- **The Engine Mechanism (Why it behaves this way):** Login is inherently idempotent — logging in twice with the same credentials produces the same result (a valid session). The risk is session proliferation: each login creates a new session record. To manage this, implement session limits (max N active sessions per user), session rotation on login, and proper session cleanup on logout.
- **The Unforgettable Mental Model:** The **Parking Garage**. Each car (login) gets a ticket (session), but there's a maximum capacity. When you enter, old tickets from the same owner can be invalidated (session rotation).
- **The Trap:** Not limiting active sessions — a user could have hundreds of sessions across devices, increasing the attack surface if any token is compromised.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Login is naturally idempotent, but I manage session proliferation by enforcing a maximum number of active sessions per user, rotating sessions on each login, and providing a way for users to view and revoke active sessions. Failed login attempts are tracked separately to trigger lockout mechanisms."

#### How do you test the login API?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Valid credentials → 200 with tokens; (2) Wrong password → 401 generic error; (3) Nonexistent email → 401 same generic error; (4) Locked account → 403; (5) Rate limiting → 429 after N failures; (6) MFA flow → challenge then completion; (7) Token expiration → access token expires correctly; (8) Concurrent logins → session management works; (9) XSS/SQL injection → inputs are sanitized.
- **The Unforgettable Mental Model:** The **Obstacle Course**. Every possible path through the login flow is tested — the correct path, every wrong turn, the blocked paths, and the emergency exits.
- **The Trap:** Only testing with valid credentials. The security-critical paths are the failure cases: wrong passwords, enumeration attempts, and rate limit bypasses.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test the happy path with valid credentials, then every failure path: wrong password, nonexistent email (both returning identical 401), locked accounts, rate limiting enforcement, MFA flows, token expiration behavior, concurrent session management, and injection attempts. The failure paths are where security bugs hide."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: login attempt (email, IP, timestamp, outcome, user agent), session created, session expired, account locked. Metrics: login success rate, failure rate by reason, average latency, concurrent sessions per user, rate limit triggers, MFA adoption rate. Alerts: spike in failed logins (credential stuffing), unusual geographic patterns, high account lockout rate.
- **The Unforgettable Mental Model:** The **Airport Security Dashboard**. Every passenger screening is logged, anomalies trigger alerts, and the security team watches for patterns that suggest coordinated attacks.
- **The Trap:** Logging passwords or full request bodies. Log only the email (for audit), IP, outcome, and metadata — never secrets.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log login attempts with email, IP, outcome, and timestamp — never passwords. Metrics track success/failure rates, latency, and rate limit triggers. I alert on failed login spikes that suggest credential stuffing, unusual geographic patterns, and high lockout rates. These metrics help detect attacks before they succeed."

## 8. Active recall test

1. **What HTTP method and endpoint handles login?**
   - **Explanation:** `POST /api/auth/login` — it's an authentication action, not a resource operation, so POST is appropriate.

2. **What status code is returned for invalid credentials?**
   - **Explanation:** `401 Unauthorized` — the credentials provided are not valid for authentication.

3. **Why should login error messages be generic?**
   - **Explanation:** To prevent email enumeration — if the API says "email not found" vs "wrong password," attackers can discover which emails are registered.

4. **Where should refresh tokens be stored?**
   - **Explanation:** In httpOnly, Secure, SameSite cookies — this prevents JavaScript access (XSS protection) and ensures cookies are only sent over HTTPS.

5. **How long should access tokens be valid?**
   - **Explanation:** 15-30 minutes — short enough to limit damage if stolen, long enough for normal API usage. Refresh tokens handle longer sessions.

6. **What prevents timing attacks on password comparison?**
   - **Explanation:** Constant-time comparison functions — they take the same duration regardless of how many characters match, preventing attackers from inferring password correctness through response timing.

7. **What happens after too many failed login attempts?**
   - **Explanation:** Progressive rate limiting and eventual account lockout — the delay between attempts increases exponentially, and after a threshold, the account is temporarily locked.

8. **What status code indicates a locked account?**
   - **Explanation:** `403 Forbidden` — the credentials may be valid, but the account is not permitted to log in due to security policy.

9. **Why is login considered idempotent?**
   - **Explanation:** Calling login multiple times with the same credentials produces the same authenticated state — each call creates a valid session, so repeating it doesn't cause harmful side effects.

10. **What metric would detect a credential stuffing attack?**
    - **Explanation:** A sudden spike in failed login attempts across many different email addresses from the same IP range or with similar patterns.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Login API.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
