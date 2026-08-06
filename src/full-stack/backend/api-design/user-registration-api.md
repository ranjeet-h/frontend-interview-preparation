# User Registration API

## Detailed explanation

Create a new user safely with validation, duplicate checks, password hashing, and clear response/error contracts. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Registration is a controlled account-creation workflow, not just an insert into users.

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

In production, user registration api should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for user registration?
- **The Engine Mechanism (Why it behaves this way):** A registration API typically exposes a single `POST /api/auth/register` endpoint. Some systems split email verification into `POST /api/auth/register` (creates user in unverified state) and `POST /api/auth/verify-email` (confirms ownership). The endpoint accepts email, password, and optional profile fields. It returns the created user object (excluding password hash) or a 201 with a verification notice.
- **The Unforgettable Mental Model:** The **Bouncer at the Club**. The bouncer checks your ID (validation), makes sure you're not already on the guest list (duplicate check), gives you a wristband (hashed password stored), and tells you to verify your identity at the coat check (email verification) before full access.
- **The Trap:** Exposing `GET /api/users` publicly or returning the full user object with sensitive fields. Registration should only accept POST and return minimal safe data.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd expose a `POST /api/auth/register` endpoint that accepts email, password, and optional profile data. It creates the user in an unverified state, hashes the password with bcrypt or argon2, and returns a 201 with a message prompting email verification. A separate `POST /api/auth/verify-email` endpoint consumes the verification token and activates the account."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** The request body contains `{ email, password, name?, phone? }` with strict schema validation. The response on success returns `{ success: true, data: { id, email, name, createdAt }, message: "Verification email sent" }`. On failure, it returns `{ success: false, error: { code: "EMAIL_DUPLICATE", message: "...", field: "email" } }`. Password is never echoed back.
- **The Unforgettable Mental Model:** The **Application Form**. You fill out the form (request), the clerk reviews it (validation), and hands you a receipt with your application number (response) — never your social security number (password).
- **The Trap:** Returning the password hash or internal database IDs in the response. Only return safe, client-needed fields.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The request body accepts email, password, and optional fields like name. The response returns a 201 with the user ID, email, and a verification message — never the password or hash. Error responses include a machine-readable error code, a human-readable message, and the specific field that failed validation so the frontend can display inline errors."

#### What validations are required for registration?
- **The Engine Mechanism (Why it behaves this way):** Validations run in layers: (1) Schema validation — email format, password length/complexity, field types; (2) Business validation — email uniqueness via a unique DB constraint, password not in breach databases (HaveIBeenPwned API), rate limiting per IP; (3) Security validation — SQL injection sanitization, XSS-safe field encoding. All validations must run server-side regardless of frontend checks.
- **The Unforgettable Mental Model:** The **Airport Security Checkpoint**. First, your ticket format is checked (schema). Then your identity is verified against the no-fly list (business rules). Finally, your bags are scanned for hidden threats (security checks).
- **The Trap:** Relying only on frontend validation. Attackers bypass the browser and hit the API directly with curl or Postman.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate at three layers. Schema level checks email format, password minimum length, and required fields. Business level enforces email uniqueness with a database unique constraint and checks password strength. Security level applies rate limiting per IP, sanitizes all inputs against injection, and never trusts frontend validation. The database unique constraint is the final safety net against race conditions."

#### What status codes can the registration API return?
- **The Engine Mechanism (Why it behaves this way):** `201 Created` on success, `400 Bad Request` for validation failures, `409 Conflict` for duplicate email, `429 Too Many Requests` when rate limited, `500 Internal Server Error` for unexpected failures. Each code maps to a specific error structure so the frontend can handle each case differently.
- **The Unforgettable Mental Model:** The **Traffic Light System**. Green (201) means go ahead, yellow (400/409) means fix your input, red (429) means slow down, and black (500) means the road itself is broken.
- **The Trap:** Returning 200 for creation instead of 201, or returning 400 for duplicates instead of the more specific 409 Conflict.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Success returns 201 Created. Validation errors return 400 Bad Request with field-level error details. Duplicate email returns 409 Conflict. Rate limiting returns 429 Too Many Requests with a Retry-After header. Server errors return 500. The key is using the most specific HTTP status code so the frontend can display the right UX for each case."

#### How do you secure the registration API?
- **The Engine Mechanism (Why it behaves this way):** Security layers include: (1) Rate limiting — 5-10 requests per minute per IP; (2) Password hashing — bcrypt with cost factor 12+ or argon2id; (3) Input sanitization — parameterized queries, no raw SQL; (4) CORS — restrict to known frontend origins; (5) CAPTCHA — on suspicious traffic patterns; (6) Email verification — account stays unverified until email ownership is proven; (7) Audit logging — log registration attempts with IP and timestamp.
- **The Unforgettable Mental Model:** The **Castle Defense**. Moat (rate limiting), drawbridge (CORS), guards at the gate (validation), inner vault (password hashing), and a secret handshake (email verification).
- **The Trap:** Storing passwords in plain text or using weak hashing like MD5. Also, not rate limiting allows credential stuffing attacks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I apply defense in depth. Rate limiting prevents abuse at the network edge. Input validation and parameterized queries prevent injection. Passwords are hashed with bcrypt or argon2id — never stored in plain text. CORS restricts which origins can call the API. Email verification proves ownership before granting access. And every attempt is logged for audit and anomaly detection."

#### How do you avoid duplicate or unsafe registration operations?
- **The Engine Mechanism (Why it behaves this way):** Database-level unique constraints on email prevent duplicates even under concurrent requests. Application-level checks query before insert, but the unique constraint is the authoritative guard. For idempotency, a client-supplied idempotency key can be stored and checked before processing. Email verification tokens are single-use and time-limited.
- **The Unforgettable Mental Model:** The **Double-Entry Ledger**. Even if two clerks try to write the same entry at the same time, the ledger's unique numbering system ensures only one gets recorded.
- **The Trap:** Relying only on an application-level "check if exists" query without a database unique constraint — race conditions between the check and insert will create duplicates.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a database unique constraint on email as the authoritative duplicate guard. The application checks first for a better error message, but the constraint catches race conditions. For unsafe retries, I accept an idempotency key from the client. Email verification tokens are single-use with a short TTL, so even if intercepted, they expire quickly."

#### How do you test the registration API?
- **The Engine Mechanism (Why it behaves this way):** Test layers: (1) Unit tests — validation logic, password hashing, email formatting; (2) Integration tests — full request/response cycle with a test database, checking success, duplicate, and validation error paths; (3) Security tests — SQL injection payloads, XSS attempts, rate limit enforcement; (4) Load tests — concurrent registrations to verify unique constraint behavior; (5) Contract tests — verify response shape matches the documented schema.
- **The Unforgettable Mental Model:** The **Car Crash Test**. Unit tests check individual parts, integration tests drive the whole car, security tests try to break in, and load tests see how it handles a traffic jam.
- **The Trap:** Only testing the happy path. Most bugs live in edge cases: duplicate emails, weak passwords, concurrent requests, and malformed input.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test at four levels. Unit tests cover validation rules and password hashing. Integration tests hit the full endpoint with a test database, covering success, duplicates, and validation errors. Security tests send injection payloads and verify rate limiting. Load tests fire concurrent registrations to confirm the unique constraint prevents duplicates under race conditions."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs capture: registration attempt (IP, email domain, timestamp, outcome), verification sent, verification completed. Metrics track: registrations per minute, success rate, duplicate rate, verification completion rate, average latency, error rate by type. Alerts trigger on: spike in registrations (bot attack), high duplicate rate (user confusion), low verification rate (email deliverability issues).
- **The Unforgettable Mental Model:** The **Factory Dashboard**. Every widget produced is counted, defects are categorized, and alarms sound when the production line behaves abnormally.
- **The Trap:** Logging sensitive data like passwords, full request bodies, or PII. Logs should contain only operational metadata.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log registration attempts with IP, email domain, and outcome — never passwords or full request bodies. Metrics track registration rate, success/failure ratio, and verification completion rate. I set alerts for traffic spikes that suggest bot attacks, high duplicate rates, and low verification rates that might indicate email deliverability problems."

## 8. Active recall test

1. **What HTTP method and endpoint handles user registration?**
   - **Explanation:** `POST /api/auth/register` — it creates a new resource (user account) and should use POST, not GET or PUT.

2. **What status code is returned on successful registration?**
   - **Explanation:** `201 Created` — it signals that a new resource was successfully created on the server.

3. **What is the most important validation rule for registration?**
   - **Explanation:** Email uniqueness enforced by a database unique constraint — this is the authoritative guard against duplicate accounts, even under concurrent requests.

4. **How should passwords be stored in the database?**
   - **Explanation:** Hashed with bcrypt (cost 12+) or argon2id — never in plain text, never with weak algorithms like MD5 or SHA1.

5. **What prevents duplicate registrations under concurrent requests?**
   - **Explanation:** A database-level unique constraint on the email column — application-level checks alone have a race condition gap between the check and the insert.

6. **What status code handles duplicate email registration?**
   - **Explanation:** `409 Conflict` — it specifically indicates that the request conflicts with an existing resource (the email is already registered).

7. **Why is email verification important in registration?**
   - **Explanation:** It proves ownership of the email address, prevents fake accounts, and provides a recovery channel. Accounts remain in an unverified state until the user clicks the verification link.

8. **What rate limit would you set on the registration endpoint?**
   - **Explanation:** 5-10 requests per minute per IP — enough for legitimate users but low enough to deter automated abuse and credential stuffing.

9. **What should never appear in the registration response?**
   - **Explanation:** The password, password hash, or any internal security tokens. Only safe fields like id, email, name, and createdAt should be returned.

10. **What metric would alert you to a bot attack on registration?**
    - **Explanation:** A sudden spike in registrations per minute, especially from a single IP range or with similar email patterns (e.g., sequential usernames).

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for User Registration API.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
