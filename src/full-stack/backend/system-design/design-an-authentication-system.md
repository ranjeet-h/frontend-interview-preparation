# Design an authentication system

## Detailed explanation

Design an authentication system is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Design data flow, APIs, storage, scaling, failure handling, and observability together.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Clarify requirements and scale.
- Define APIs and data model.
- Choose storage, cache, queues, and workers.
- Plan consistency, failure handling, and security.
- Add observability and rollout strategy.

## 4. Visual / analogy

```txt
Clients -> API -> services -> database/cache/queue -> observability
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply backend system design rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, design an authentication system affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you securely store passwords?
- **The Engine Mechanism (Why it behaves this way):** Passwords must never be stored in plain text. Use a slow, adaptive hashing algorithm designed for passwords: Argon2id (recommended), bcrypt, or scrypt. These algorithms are intentionally computationally expensive and memory-hard, making brute-force attacks impractical. Each password gets a unique random salt (16+ bytes) appended before hashing, preventing rainbow table attacks. The salt is stored alongside the hash. Never use fast hash functions like MD5 or SHA-256 for passwords — they can be computed billions of times per second on GPUs.
- **The Unforgettable Mental Model:** The **Industrial Shredder**. Fast hashes (MD5) are like a paper shredder — quick but reversible with enough effort. Password hashes (Argon2id) are like an industrial incinerator — slow, thorough, and practically impossible to reverse. Each document gets mixed with unique confetti (salt) before burning.
- **The Trap:** Using SHA-256 with a salt. While better than plain SHA-256, it's still a fast hash that GPUs can compute at billions per second. Always use a password-specific algorithm (Argon2id, bcrypt) that's designed to be slow.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use Argon2id with a memory cost of at least 64MB and a time cost that targets ~200ms per hash. Each password gets a unique 16-byte random salt. The salt and hash are stored together in the database. Argon2id is resistant to both GPU brute-force attacks (memory-hard) and side-channel attacks (data-independent). If Argon2id isn't available, bcrypt with a cost factor of 12+ is the fallback. I'd never use MD5, SHA-1, or even SHA-256 for passwords."

#### JWT vs. session tokens — which should you use?
- **The Engine Mechanism (Why it behaves this way):** JWTs are self-contained tokens that carry claims (user ID, roles, expiration) and are cryptographically signed. The server validates the signature without database lookup — stateless. Session tokens are random strings that map to server-side session data stored in Redis or a database — stateful. JWTs scale horizontally without shared state but can't be revoked until expiration. Sessions can be revoked instantly but require shared session storage. JWTs are larger (hundreds of bytes vs. 32 bytes for session IDs). Short-lived JWTs (5-15 minutes) with refresh tokens combine the benefits of both.
- **The Unforgettable Mental Model:** The **Passport vs. Hotel Key Card**. A JWT is like a passport — it contains all your info, is self-validating (stamp/signature), and works anywhere without calling home. But if it's stolen, you can't cancel it until it expires. A session token is like a hotel key card — the front desk (server) checks the registry (Redis) to verify it's still valid. If you report it lost, they can deactivate it immediately.
- **The Trap:** Using long-lived JWTs (30 days) without a revocation mechanism. If a JWT is stolen, the attacker has access until expiration. Always use short-lived access tokens (15 minutes) with refresh tokens that can be revoked.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For most web applications, I'd use short-lived JWTs (15-minute access tokens) with refresh tokens stored in httpOnly, secure cookies. The access token is stateless and fast to validate. The refresh token is stored server-side in Redis, allowing revocation on logout or suspicious activity. For internal microservices, I'd use JWTs with short TTLs since service-to-service communication doesn't need instant revocation. For traditional server-rendered apps, I'd use session tokens in Redis for simplicity and instant revocation capability."

#### How do you implement secure token refresh?
- **The Engine Mechanism (Why it behaves this way):** The refresh token flow: (1) Client sends expired access token + refresh token to /auth/refresh; (2) Server validates the refresh token (signature + database/Redis lookup); (3) Server checks if the refresh token is revoked (logout, password change); (4) Server issues a new access token and optionally a new refresh token (rotation); (5) Old refresh token is invalidated. Refresh token rotation (issuing a new refresh token on each use) detects token theft — if both the old and new refresh token are used, the system knows the token was stolen and revokes all tokens for that user. Refresh tokens are stored in httpOnly, secure, SameSite=Strict cookies to prevent XSS theft.
- **The Unforgettable Mental Model:** The **Rolling Combination Lock**. Each time you open the safe (get a new access token), the combination changes (refresh token rotation). If someone tries to use the old combination, the safe locks permanently and alerts the owner (token theft detection).
- **The Trap:** Storing refresh tokens in localStorage. localStorage is accessible to JavaScript, so any XSS vulnerability exposes the refresh token. Always use httpOnly cookies that JavaScript cannot read.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd implement refresh token rotation. The refresh token is stored in an httpOnly, secure, SameSite=Strict cookie. On each refresh, the server validates the token, issues a new access token AND a new refresh token, and invalidates the old one. If a stolen refresh token is used after rotation (both old and new tokens appear), the system detects the theft and revokes all tokens for that user, forcing re-authentication. The access token lives for 15 minutes, the refresh token for 7-30 days depending on security requirements."

#### How do you handle password reset securely?
- **The Engine Mechanism (Why it behaves this way):** The secure password reset flow: (1) User requests reset with email; (2) Server generates a cryptographically random token (32+ bytes, URL-safe); (3) Token is stored in the database with an expiration (1 hour) and single-use flag; (4) Token is sent via email as a link; (5) User clicks link, enters new password; (6) Server validates the token (exists, not expired, not used), hashes the new password, invalidates the token, and optionally invalidates all existing sessions. The token must be single-use and time-limited. Rate limit reset requests per email to prevent enumeration attacks.
- **The Unforgettable Mental Model:** The **One-Time Key**. The bank (server) gives you a key (reset token) that opens the vault once and then dissolves. It also has a timer — if you don't use it within an hour, it self-destructs. Even if someone intercepts the key, they can only use it once before it's gone.
- **The Trap:** Not invalidating existing sessions after a password reset. If an attacker had access to the account, they still have valid session tokens after the password change. Always revoke all sessions on password reset.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd generate a 32-byte cryptographically random token, store it with a 1-hour expiration and single-use flag, and email it as a reset link. When the user submits their new password, I validate the token, hash the password with Argon2id, invalidate the token, and revoke all existing sessions for that user. I'd rate-limit reset requests per email to prevent enumeration, and I'd always respond with the same message whether the email exists or not to avoid user enumeration attacks."

#### How do you prevent brute-force and credential stuffing attacks?
- **The Engine Mechanism (Why it behaves this way):** Multiple layers of protection: (1) Rate limiting — exponential backoff on failed attempts per account (1s, 2s, 4s, 8s delay) and per IP (sliding window); (2) Account lockout — temporary lock after N consecutive failures (15-30 minutes); (3) CAPTCHA after N failures to block bots; (4) Credential stuffing detection — check submitted credentials against known breached password databases (Have I Been Pwned API); (5) Progressive delays — increase delay between login attempts exponentially; (6) Monitor for distributed attacks — multiple IPs trying the same account, or same IP trying multiple accounts.
- **The Unforgettable Mental Model:** The **Bank Vault with Increasing Locks**. First wrong combination: 1-second delay. Second: 2 seconds. Third: 4 seconds. After 5 attempts, the vault locks for 30 minutes and calls security (CAPTCHA, alert). The vault also recognizes if someone is trying combinations from multiple locations simultaneously.
- **The Trap:** Permanent account lockout. This enables denial-of-service attacks — an attacker can lock out any user by intentionally failing login attempts. Always use temporary lockouts with automatic expiration.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd implement progressive rate limiting — exponential backoff on failed attempts per account, with a sliding window rate limit per IP. After 5 consecutive failures, I'd require CAPTCHA and temporarily lock the account for 15 minutes. I'd also check passwords against the Have I Been Pwned API during registration and password changes. Importantly, I'd use temporary lockouts, not permanent ones, to prevent denial-of-service attacks. All failed attempts are logged with IP and user agent for anomaly detection."

#### How do you implement multi-factor authentication (MFA)?
- **The Engine Mechanism (Why it behaves this way):** MFA adds a second verification factor after password validation. Common methods: (1) TOTP (Time-based One-Time Password) — user scans a QR code to seed a shared secret in an authenticator app; the app generates a 6-digit code every 30 seconds using HMAC-SHA1; server validates by computing the same code with the shared secret and current time (with a ±1 window for clock drift); (2) SMS codes — less secure due to SIM swapping but widely used; (3) WebAuthn/FIDO2 — hardware security keys or biometrics, the most secure option. TOTP secrets are stored encrypted in the database. Backup codes (single-use) are generated for account recovery.
- **The Unforgettable Mental Model:** The **Two-Key Safe**. The first key is your password (something you know). The second key is a code that changes every 30 seconds (something you have — your phone). You need both keys to open the safe. Even if someone steals your password, they can't open it without your phone.
- **The Trap:** Implementing MFA without backup codes. If the user loses their phone, they're permanently locked out. Always generate and securely display single-use backup codes during MFA setup.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd implement TOTP as the primary MFA method using the RFC 6238 standard. During setup, the server generates a 20-byte secret, displays it as a QR code, and stores it encrypted. The authenticator app generates 6-digit codes every 30 seconds. On login, the server validates the code with a ±1 time window for clock drift. I'd also generate 10 single-use backup codes during setup and recommend WebAuthn/FIDO2 for high-security accounts. SMS-based MFA would be available but discouraged due to SIM swapping risks."

#### How do you handle logout and session invalidation?
- **The Engine Mechanism (Why it behaves this way):** For session tokens: delete the session from Redis/database — instant invalidation. For JWTs: add the token to a blocklist (Redis with TTL matching the token's expiration) — the server checks the blocklist on each request. For refresh token rotation: mark the refresh token family as revoked in the database, invalidating all tokens in that chain. On password change or security event: invalidate all sessions/refresh tokens for the user by updating a session_version field in the user record — any token with an older version is rejected.
- **The Unforgettable Mental Model:** The **Hotel Checkout**. Session logout is like returning your key card — the front desk immediately deactivates it. JWT logout is like adding your passport to a watchlist — it still looks valid, but the checkpoint (server) checks the list and denies entry. Password change is like changing all the locks — every existing key becomes useless.
- **The Trap:** Thinking JWT logout is instant without a blocklist. Since JWTs are self-contained and stateless, the server can't invalidate them without maintaining a revocation list. If you don't implement this, the JWT remains valid until expiration.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For session tokens, I simply delete the session from Redis — instant invalidation. For JWTs, I maintain a blocklist in Redis with a TTL matching the token's expiration. On logout, the access token JTI (JWT ID) is added to the blocklist. For refresh tokens, I use token family tracking — if any token in a family is used after rotation, the entire family is revoked. On password change, I increment a session_version in the user record, and all tokens with older versions are rejected. This gives me instant revocation across all token types."

## 8. Active recall test

1. **Why use Argon2id instead of SHA-256 for passwords?**
   - **Explanation:** Argon2id is memory-hard and computationally expensive (~200ms per hash), making GPU brute-force attacks impractical. SHA-256 is fast and can be computed billions of times per second on GPUs, making it unsuitable for password storage.

2. **What is the main trade-off between JWTs and session tokens?**
   - **Explanation:** JWTs are stateless (no database lookup) but can't be revoked until expiration. Session tokens can be revoked instantly but require shared session storage (Redis). Short-lived JWTs with refresh tokens combine both benefits.

3. **How does refresh token rotation detect token theft?**
   - **Explanation:** Each refresh issues a new refresh token and invalidates the old one. If both the old and new refresh tokens are used (the legitimate user has the new one, the attacker has the old), the system detects the conflict and revokes all tokens for that user.

4. **Why invalidate all sessions after a password reset?**
   - **Explanation:** If an attacker had access to the account, they still have valid session tokens after the password change. Revoking all sessions ensures the attacker is logged out immediately, even if they don't know the password changed.

5. **How do you prevent user enumeration during login?**
   - **Explanation:** Always return the same generic message ("If an account exists with that email, we've sent a reset link") whether the email exists or not. Use constant-time comparison for password hashing to prevent timing attacks.

6. **What is TOTP and how does it work?**
   - **Explanation:** Time-based One-Time Password (RFC 6238). A shared secret is seeded in both the server and authenticator app. Every 30 seconds, both compute HMAC-SHA1(secret, current_time) and extract a 6-digit code. The server validates with a ±1 time window for clock drift.

7. **How do you invalidate a JWT before its expiration?**
   - **Explanation:** Maintain a blocklist in Redis keyed by the JWT's JTI (JWT ID) with a TTL matching the token's expiration. On each request, check if the token's JTI is in the blocklist. Alternatively, use a session_version field in the user record and reject tokens with older versions.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design an authentication system in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design an authentication system in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
