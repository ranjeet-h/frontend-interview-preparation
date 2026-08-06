# Forgot Password Flow

## Detailed explanation

Start password recovery without revealing whether an account exists and send a time-limited reset channel. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Forgot password creates a safe recovery attempt, not a login bypass.

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

In production, forgot password flow should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for forgot password?
- **The Engine Mechanism (Why it behaves this way):** A single `POST /api/auth/forgot-password` endpoint that accepts an email address, generates a time-limited reset token, stores it hashed in the database, and sends a reset link via email. The endpoint returns the same response whether the email exists or not to prevent enumeration. No separate "check email" endpoint is needed.
- **The Unforgettable Mental Model:** The **Lost Key Service**. You tell the locksmith which door you locked yourself out of (email), they prepare a temporary key (reset token), mail it to the address on file (email delivery), and tell everyone "a key has been sent" — without confirming whether you actually live there.
- **The Trap:** Creating a separate endpoint to check if an email exists — this enables email enumeration attacks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I expose a single `POST /api/auth/forgot-password` endpoint. It accepts an email, generates a time-limited reset token, stores it hashed, and sends a reset link via email. The response is identical whether the email exists or not — 'If an account with that email exists, a reset link has been sent.' This prevents email enumeration."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** Request: `{ email: string }`. Response on success: `{ success: true, message: "If an account with that email exists, a reset link has been sent" }` — always 200, even for nonexistent emails. Response on validation failure: `{ success: false, error: { code: "INVALID_EMAIL", message: "Please enter a valid email address", field: "email" } }` with 400.
- **The Unforgettable Mental Model:** The **Anonymous Mail Drop**. You drop a letter in the box (email), and the system always says "letter received" — it never confirms whether the recipient actually exists.
- **The Trap:** Returning different messages or response times for existing vs nonexistent emails — timing differences alone can enable enumeration.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The request accepts only an email address. The response is always 200 with the same message regardless of whether the email exists. This is critical for security — even response timing should be consistent. I add a small artificial delay when the email doesn't exist to match the processing time of sending an email."

#### What validations are required for forgot password?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Email format validation; (2) Rate limiting — 3-5 requests per hour per email and per IP; (3) Token generation — cryptographically secure random token (32+ bytes), hashed before storage; (4) Token expiry — 1-2 hours maximum; (5) Single-use tokens — invalidated after use; (6) Email deliverability check — if email service is down, log and alert rather than silently failing.
- **The Unforgettable Mental Model:** The **Emergency Exit System**. The door only opens for valid requests (email format), limits how often it can be triggered (rate limiting), uses a one-time code (token), and the code expires quickly (TTL).
- **The Trap:** Not rate limiting — attackers can flood a user's inbox with reset emails, causing harassment or masking a real attack.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate email format and enforce strict rate limiting — 3-5 requests per hour per email and per IP. Reset tokens are cryptographically random, hashed before storage, expire within 1-2 hours, and are single-use. I also add an artificial delay for nonexistent emails to prevent timing-based enumeration."

#### What status codes can the forgot password API return?
- **The Engine Mechanism (Why it behaves this way):** `200 OK` for both existing and nonexistent emails (same response), `400 Bad Request` for invalid email format, `429 Too Many Requests` when rate limited, `500 Internal Server Error` for unexpected failures. The key insight: 200 is always returned for valid-format emails, regardless of existence.
- **The Unforgettable Mental Model:** The **Universal Acknowledgment**. Every properly formatted request gets a polite "received" — the system never reveals whether it found a matching record.
- **The Trap:** Returning 404 for nonexistent emails — this directly confirms the email doesn't exist in the system.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Valid email format always returns 200 with the same message, whether the email exists or not. Invalid format returns 400. Rate limiting returns 429. Server errors return 500. The critical point is that 200 is returned for both existing and nonexistent emails to prevent enumeration."

#### How do you secure the forgot password API?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Rate limiting per email and per IP; (2) Token hashing — store SHA-256 hash of token, not the raw token; (3) Short token TTL — 1-2 hours; (4) Single-use tokens — invalidated immediately after use; (5) Consistent response timing — add delay for nonexistent emails; (6) Email content security — reset link uses HTTPS, token is in URL path not query params; (7) Audit logging — all reset attempts logged.
- **The Unforgettable Mental Model:** The **Time-Limited Safe Deposit Box**. The box (token) can only be opened once (single-use), expires quickly (TTL), the combination is stored as a hash (not plain text), and the bank vault has cameras watching every attempt (audit log).
- **The Trap:** Storing the reset token in plain text in the database — if the database is compromised, attackers can use active tokens to hijack accounts.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I hash reset tokens before storage using SHA-256, set a 1-2 hour expiry, enforce single-use, and rate limit to 3-5 requests per hour. I add artificial delays for nonexistent emails to prevent timing attacks. Reset links use HTTPS with tokens in the URL path. Every attempt is logged for audit and anomaly detection."

#### How do you avoid duplicate or unsafe forgot password operations?
- **The Engine Mechanism (Why it behaves this way):** Rate limiting prevents duplicate requests. When a new reset is requested, existing active tokens for that email are invalidated (only one active token at a time). The token generation is atomic — a new token is created and the old one is revoked in a single database transaction.
- **The Unforgettable Mental Model:** The **Single Active Key**. When a new temporary key is issued, all previous temporary keys for that lock are automatically deactivated. Only the latest key works.
- **The Trap:** Allowing multiple active reset tokens for the same email — if an old token was intercepted, it remains valid alongside newer ones.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I invalidate all existing reset tokens for an email when a new one is requested, ensuring only one active token at a time. This happens atomically in a single transaction. Rate limiting prevents rapid-fire requests. If a user requests a reset multiple times, only the latest token is valid."

#### How do you test the forgot password API?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Valid email → 200, email sent, token created; (2) Nonexistent email → 200, same response, no email sent; (3) Invalid email format → 400; (4) Rate limiting → 429 after threshold; (5) Token expiry → expired token rejected in reset flow; (6) Single-use → token invalidated after first use; (7) Timing consistency → response time similar for existing/nonexistent emails; (8) Token hashing → raw token not stored in database.
- **The Unforgettable Mental Model:** The **Security Audit**. Every possible attack vector is tested: enumeration, flooding, token theft, timing analysis, and database compromise.
- **The Trap:** Not testing timing consistency — even a 50ms difference between existing and nonexistent email responses can be exploited with enough requests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test the happy path, nonexistent email handling, invalid format rejection, rate limiting, token expiry, single-use enforcement, and critically, timing consistency between existing and nonexistent emails. I also verify that tokens are hashed in the database and that requesting a new reset invalidates previous tokens."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: reset request (email, IP, timestamp, outcome), email sent status, token expired, token used. Metrics: reset requests per hour, success rate (email delivered), rate limit triggers, token usage rate, average response time. Alerts: spike in reset requests (harassment attack), high rate limit triggers, email delivery failures.
- **The Unforgettable Mental Model:** The **Emergency Response Log**. Every alarm pull is recorded, response times are tracked, and patterns of false alarms or abuse are identified.
- **The Trap:** Logging the reset token value — tokens in logs are a security risk. Log only the email (hashed), IP, and outcome.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log reset attempts with email (hashed), IP, timestamp, and outcome — never the raw token. Metrics track request volume, email delivery success, rate limit triggers, and token usage rates. I alert on request spikes that suggest harassment attacks and email delivery failures that could leave users unable to recover their accounts."

## 8. Active recall test

1. **What endpoint handles forgot password?**
   - **Explanation:** `POST /api/auth/forgot-password` — accepts an email and initiates the password reset flow by generating and emailing a reset token.

2. **Why does the API return the same response for existing and nonexistent emails?**
   - **Explanation:** To prevent email enumeration — if the response differed, attackers could determine which emails are registered in the system.

3. **How should reset tokens be stored in the database?**
   - **Explanation:** As a SHA-256 hash — never in plain text. This way, even if the database is compromised, active tokens cannot be used.

4. **What is the recommended TTL for reset tokens?**
   - **Explanation:** 1-2 hours — short enough to limit the attack window but long enough for users to receive and act on the email.

5. **What rate limit would you set on forgot password?**
   - **Explanation:** 3-5 requests per hour per email and per IP — prevents inbox flooding while allowing legitimate users to retry if the email is delayed.

6. **What happens when a user requests a new reset token while one is already active?**
   - **Explanation:** The existing token is invalidated and a new one is generated — only one active reset token per email at any time.

7. **Why add an artificial delay for nonexistent emails?**
   - **Explanation:** To match the response time of sending an email — without it, the faster response for nonexistent emails creates a timing side-channel for enumeration.

8. **What status code is returned for a nonexistent email?**
   - **Explanation:** `200 OK` with the same message as for existing emails — the system never reveals whether the email exists.

9. **What prevents reset token reuse?**
   - **Explanation:** Tokens are marked as used/invalidated immediately after the first successful password reset — they are single-use only.

10. **What metric would indicate an email harassment attack?**
    - **Explanation:** A spike in reset requests for a single email address or from a single IP, triggering the rate limit repeatedly.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Forgot Password Flow.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
