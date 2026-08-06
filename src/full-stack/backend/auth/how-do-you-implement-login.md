# How do you implement login

## Detailed explanation

How do you implement login is a core auth topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you implement login by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, how do you implement login affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you implement a login endpoint?
- **The Engine Mechanism (Why it behaves this way):** A login endpoint accepts credentials (email + password), looks up the user by email, compares the submitted password against the stored hash using bcrypt.compare() (constant-time), and on success generates an access token and refresh token. The access token is returned (or set as httpOnly cookie), and the refresh token is set as an httpOnly, secure, sameSite cookie. On failure, it returns a generic error message without revealing whether the email or password was wrong.
- **The Unforgettable Mental Model:** The **Bank Teller**. You hand over your ID (email) and PIN (password). The teller checks the ID exists, verifies the PIN matches, and if correct, gives you a banking card (access token) and a PIN reset card (refresh token). If wrong, they just say "cannot verify" — they don't tell you which part was wrong.
- **The Trap:** Returning different error messages for "user not found" vs "wrong password." This enables email enumeration — attackers can discover which emails are registered by testing different responses.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A login endpoint accepts email and password, looks up the user, and compares the password against the stored hash using bcrypt. On success, it generates an access token and a refresh token, setting the refresh token as an httpOnly cookie. On failure, it returns a generic 'invalid credentials' message regardless of whether the email or password was wrong, preventing email enumeration. The endpoint should also be rate-limited to prevent brute force attacks."

#### How do you prevent timing attacks on login?
- **The Engine Mechanism (Why it behaves this way):** Timing attacks exploit differences in response time to infer information. If the server returns faster for "user not found" than "wrong password," attackers can determine which emails exist. Defenses: (1) Use constant-time password comparison (bcrypt.compare is constant-time), (2) Return the same error message for both cases, (3) Add a consistent delay for both failure paths so response times are indistinguishable.
- **The Unforgettable Mental Model:** The **Metronome Response**. Whether the answer is "no such person" or "wrong password," the server takes exactly the same amount of time to respond — like a metronome keeping steady rhythm regardless of the answer.
- **The Trap:** Only fixing the error message but not the timing. Even with identical messages, the database lookup time difference between "user exists" and "user doesn't exist" can leak information.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prevent timing attacks by using constant-time password comparison (bcrypt handles this), returning identical error messages for all failure cases, and ensuring both failure paths take similar time. Some implementations add a small artificial delay to normalize response times. The goal is that an attacker measuring response time can't distinguish between 'email not found' and 'wrong password'."

#### How do you handle rate limiting on login?
- **The Engine Mechanism (Why it behaves this way):** Rate limiting tracks login attempts per identifier (email, IP, or both) and blocks excessive attempts. Implementation: use a sliding window counter in Redis — increment a counter for each failed attempt, set a TTL (e.g., 15 minutes), and block when the threshold is reached (e.g., 5 attempts). Return 429 Too Many Requests with a Retry-After header.
- **The Unforgettable Mental Model:** The **ATM PIN Attempts**. After 3 wrong PIN attempts, the ATM locks the card. You must wait or call the bank. Rate limiting works the same way — too many wrong attempts triggers a cooldown.
- **The Trap:** Only rate limiting by IP. Attackers using distributed botnets can rotate IPs to bypass IP-based limits. Combine IP and email-based rate limiting.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement rate limiting on login using a sliding window counter in Redis, tracking attempts by both email and IP. After 5 failed attempts within 15 minutes, I return 429 with a Retry-After header. Tracking by email prevents credential stuffing against specific accounts; tracking by IP prevents brute force from single sources. For distributed attacks, I also use anomaly detection — sudden spikes in login failures across the system trigger broader protective measures."

#### What should the login response look like?
- **The Engine Mechanism (Why it behaves this way):** On success: 200 OK with access token (in body or httpOnly cookie) and refresh token (in httpOnly cookie). Include minimal user data (ID, name, roles). On failure: 401 Unauthorized with a generic error message `{"error": "Invalid credentials"}`. Never include stack traces, database errors, or hints about which field was wrong.
- **The Unforgettable Mental Model:** The **Vending Machine**. Success: you get your product (token) and a receipt (user info). Failure: "Item unavailable" — no explanation of whether the item doesn't exist or your money was wrong.
- **The Trap:** Returning the user's full profile on login. Only return what the frontend needs immediately. Detailed profile data should come from a separate /me endpoint.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: On success, I return 200 with the access token (typically in an httpOnly cookie) and minimal user data — ID, name, roles. The refresh token is set as a separate httpOnly cookie. On failure, I return 401 with a generic 'Invalid credentials' message. I never return stack traces, database errors, or hints about which field was wrong. Detailed user profile data comes from a separate /me endpoint, keeping the login response lean and secure."

#### How do you handle login with MFA?
- **The Engine Mechanism (Why it behaves this way):** MFA login is a two-step flow: (1) First step validates email/password and returns a temporary "pre-auth" token indicating the user passed step 1 but needs MFA. (2) Second step accepts the MFA code (TOTP, SMS, WebAuthn) plus the pre-auth token, validates it, and issues the actual access and refresh tokens. The pre-auth token has a short expiration (5 minutes) and limited scope (only usable for MFA verification).
- **The Unforgettable Mental Model:** The **Two-Key Safe**. The first key (password) opens the outer door. The second key (MFA code) opens the inner compartment. You need both to get the valuables (access tokens).
- **The Trap:** Returning full access tokens after the first step. The pre-auth token should have limited scope — it can only be used to submit the MFA code, not to access protected resources.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: MFA login is a two-step flow. Step one validates credentials and returns a short-lived pre-auth token with limited scope — it can only be used for MFA verification. Step two accepts the MFA code and pre-auth token, validates the code, and issues the actual access and refresh tokens. The pre-auth token expires quickly (5 minutes) and can't access protected resources. This ensures that even if credentials are compromised, the attacker can't proceed without the second factor."

#### How does login affect the frontend?
- **The Engine Mechanism (Why it behaves this way):** The frontend sends credentials to the login endpoint, handles success by storing the auth state (user info, redirecting to dashboard), handles failure by displaying errors, and manages loading states during the request. After login, the frontend should redirect to the intended destination (or default dashboard) and ensure the auth state is synchronized.
- **The Unforgettable Mental Model:** The **Front Desk Check-In**. The guest provides ID (credentials), the desk clerk validates it (backend), and if valid, issues a room key (token) and directs them to their room (redirect). If invalid, politely declines without explaining why.
- **The Trap:** Storing the redirect URL in query parameters without validation. Attackers can craft login links with malicious redirect URLs (open redirect vulnerability). Validate redirect URLs against an allowlist.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend sends credentials to the login endpoint, handles the response, and manages auth state. On success, it redirects to the intended destination — but I validate redirect URLs against an allowlist to prevent open redirect attacks. On failure, it displays a generic error without revealing which field was wrong. I also manage loading states to prevent double-submission, and after login, I ensure the auth state is synchronized across the app through a global auth context or state management."

#### What would you monitor for login?
- **The Engine Mechanism (Why it behaves this way):** Monitor: login success/failure rates, failed attempts per email and IP (brute force detection), login latency (p50, p95, p99), rate limit trigger rates, MFA completion rates, and geographic anomalies (logins from unexpected locations). Alert on sudden spikes in failure rates or unusual geographic patterns.
- **The Unforgettable Mental Model:** The **Airport Security Monitor**. You're watching how many people are passing through (success rate), how many are being flagged for additional screening (failures), and whether anyone is acting suspiciously (anomalies).
- **The Trap:** Not monitoring login latency. A slow login endpoint (high p95) indicates database issues, bcrypt cost factor too high, or infrastructure problems that affect user experience.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor login from three angles: security signals like failed attempts per email/IP and geographic anomalies, performance metrics like login latency percentiles and rate limit trigger rates, and business metrics like login success rates and MFA completion rates. I alert on sudden spikes in failure rates (credential stuffing), unusual geographic patterns (compromised accounts), and latency degradation (infrastructure issues). Login monitoring is the first line of defense for auth security."

## 8. Active recall test

1. **What are the steps in a login flow?**
   - **Explanation:** Accept credentials, look up user by email, compare password against stored hash using bcrypt, on success generate access and refresh tokens, on failure return generic error. Set refresh token as httpOnly cookie.
2. **Why should login errors be generic?**
   - **Explanation:** Specific errors ("user not found" vs "wrong password") enable email enumeration. Attackers can discover registered emails by testing different error responses.
3. **How do you prevent brute force attacks on login?**
   - **Explanation:** Rate limiting — track failed attempts per email and IP using a sliding window counter in Redis. After a threshold (e.g., 5 attempts in 15 minutes), return 429 Too Many Requests.
4. **What is a timing attack on login?**
   - **Explanation:** An attack that measures response time differences to infer whether an email exists or a password is wrong. Prevented by constant-time comparison, identical error messages, and normalized response times.
5. **How does MFA login work?**
   - **Explanation:** Two-step flow: step 1 validates credentials and returns a short-lived pre-auth token. Step 2 validates the MFA code with the pre-auth token and issues actual access/refresh tokens.
6. **What should the login response include on success?**
   - **Explanation:** Access token (in httpOnly cookie or body), refresh token (in httpOnly cookie), and minimal user data (ID, name, roles). Not the full user profile.
7. **What is an open redirect vulnerability in login?**
   - **Explanation:** When the login endpoint redirects to a URL from query parameters without validation. Attackers craft links that redirect users to malicious sites after login. Prevent by validating redirect URLs against an allowlist.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you implement login in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you implement login in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
