# Design an Authentication System

## 1. Understand the Problem First — Clarify Before Designing

Picture 2:00 AM on a Friday: an automated botnet launches a distributed credential stuffing attack against your `/login` endpoint, hammering it with 500,000 username-password pairs leaked from a third-party breach across 20,000 residential IP addresses. At the exact same moment, an enterprise security admin notices an employee's laptop was stolen and demands an immediate, single-click session revocation across all active devices. If your system was built on pure stateless JSON Web Tokens (JWTs) with 24-hour lifetimes, that stolen laptop retains complete access to your microservices for another 22 hours unless you take down your API gateway or push an emergency database migration. If your system was built on pure database-backed sessions, every single microservice call across your fleet makes a synchronous round-trip to a centralized database or cache, turning your authentication store into your biggest bottleneck and primary single point of failure.

Before drawing boxes on a whiteboard, a senior engineer always pins down the requirements, scale, and operational boundaries:

- **Traffic Scale & Throughput:** Are we designing for 50 million Daily Active Users (DAU), 100 million registered accounts, a peak login rate of 5,000 requests per second (RPS), and a downstream token verification load of 150,000 RPS across hundreds of internal services?
- **Authentication Modalities:** Do we support traditional email and password, federated Single Sign-On (OAuth 2.0 / OpenID Connect with Google, GitHub, Apple, and enterprise SAML/Okta), Multi-Factor Authentication (TOTP via authenticator apps, SMS OTP fallback, WebAuthn/FIDO2 hardware passkeys), and machine-to-machine API keys?
- **Client Diversity:** Will clients be Single-Page Applications in browsers (React, Vue), mobile native applications (iOS Keychain, Android Keystore), server-side rendered applications (Next.js), or third-party API consumers?
- **Performance & Availability SLAs:** We need sub-200ms latency on compute-heavy password hashing, sub-5ms latency on token verification at the gateway, and 99.999% availability for API request authorization.
- **Security & Threat Model:** Zero plain-text password exposure (even during memory dumps or SQL injection), defense against Cross-Site Scripting (XSS) and Cross-Site Request Forgery (CSRF), automated token replay detection, instant session revocation, strict rate limiting to defeat brute force, and audit logging compliant with SOC 2 and GDPR.

## 2. The Core Insight — The Decision Everything Else Flows From

The central dilemma of modern authentication architecture is the tension between **Verification Latency vs. Instant Revocation**.

Stateless tokens (JWTs) eliminate database lookups at the edge, scaling horizontally to hundreds of thousands of requests per second. However, because they are self-contained, they cannot be natively revoked before they expire. Stateful server-side sessions give you instant revocation and granular device management, but force every single microservice request to hit a centralized session store, creating massive latency overhead and a crippling single point of failure.

The architectural decision that unlocks both requirements is a **Hybrid Tiered Token Architecture**:

1. **Short-Lived Asymmetric Access Tokens (JWTs):** Valid for 5 to 15 minutes. Signed using an asymmetric private key (RS256 or Ed25519) by the Auth Service. Downstream microservices and API gateways verify signatures locally and completely statelessly in memory using the cached public key set (JWKS). Zero database hits on the hot path.
2. **Opaque, Stateful Refresh Tokens with Token Rotation:** Valid for 7 to 30 days. Cryptographically random strings stored securely in an `HttpOnly`, `Secure`, `SameSite` cookie on the web (and hardware-backed keystores on mobile). The refresh token maps to a session record in a fast distributed store (Redis / PostgreSQL) and is exchanged for a new access token when the short-lived token expires.
3. **Out-of-Band Revocation and Token Versioning:** For high-security events (password reset, account compromise, admin ban), the system updates a numeric `token_version` on the user record and broadcasts it to edge gateway caches. Tokens presenting an outdated version are rejected immediately without checking the primary database on every call.

Every other component in this design—browser storage strategies, cryptographic key distribution, token theft detection, and rate limiting—is built around making this hybrid model bulletproof.

## 3. High-Level Architecture — Components and Why Each Exists

To handle authentication at scale securely and reliably, the system separates the compute-intensive identity operations from the high-throughput authorization verification hot path.

```txt
                           +-------------------------------------------------------------+
                           |                     Client Applications                     |
                           |  - Web Browser (HttpOnly Cookies)   - Mobile Native (Keychain) |
                           +------------------------------+------------------------------+
                                                          |
                                                          | HTTPS (Credentials / Bearer)
                                                          v
                           +-------------------------------------------------------------+
                           |               WAF & API Gateway / Edge Proxy                |
                           |  - DDoS & Bot Mitigation  - Rate Limiter (Token Bucket)     |
                           |  - Stateless Access Token (JWT) Verification via local JWKS |
                           |  - Local Revocation Cache Check (Redis / Bloom Filter)      |
                           +--------------+------------------------------+---------------+
                                          |                              |
                  (Auth Routes: /login,   |                              | (Protected API Routes:
                   /refresh, /oauth, /mfa)|                              |  /orders, /billing)
                                          v                              v
                           +------------------------------+       +----------------------+
                           |         Auth Service         |       | Downstream Services  |
                           |  - Password Hashing (Argon2) |       | (Orders, Billing,    |
                           |  - MFA Engine (TOTP/FIDO2)   |       |  User Profile, etc.) |
                           |  - Token Issuer & Rotator    |       |                      |
                           |  - OAuth2/OIDC Orchestrator  |       +----------------------+
                           +-------+--------------+-------+
                                   |              |
                      +------------+              +------------+
                      |                                        |
                      v                                        v
+------------------------------------------+  +------------------------------------------+
|          Redis Distributed Cache         |  |         Primary Relational DB            |
|  - Refresh Token Families & Metadata     |  |         (PostgreSQL Cluster)             |
|  - Revocation Denylist / Token Versions  |  |  - Users & Roles Tables                  |
|  - Rate Limiting Counters & Sliding Logs |  |  - Salted Password Hashes (Argon2id)    |
|  - Transient MFA Handshake States (TTL)  |  |  - Active Devices & Audit Trail Logs     |
+------------------------------------------+  +------------------------------------------+
                      |
                      v (Security Audit Events & Notifications)
+----------------------------------------------------------------------------------------+
|      Message Queue (Kafka)  -->  Worker Fleet  -->  Transactional Email / SMS / Alerts |
+----------------------------------------------------------------------------------------+
```

Here is why each component exists and what breaks if you remove it:

- **Client Applications (Web & Mobile):** Web browsers hold session cookies configured with `HttpOnly` (blocks JavaScript XSS access), `Secure` (ensures transit over HTTPS only), and `SameSite=Lax` or `Strict` (neutralizes cross-site CSRF attacks). Mobile apps store tokens in hardware-backed storage (iOS Keychain / Android Keystore) and transmit tokens via standard `Authorization: Bearer <token>` headers.
- **WAF & API Gateway (Cloudflare / Envoy / Kong):** Acts as the entry point for all incoming traffic. Terminates TLS, runs distributed rate-limiting algorithms, inspects request headers, and performs fast in-memory signature verification on incoming JWT access tokens. If the access token is valid and unexpired, the gateway injects trusted identity headers (such as `X-User-Id`, `X-User-Roles`, `X-Tenant-Id`) and proxies the request directly to downstream services. Downstream microservices never parse raw cookies or re-verify cryptographic signatures.
- **Auth Service (Identity Provider):** A dedicated microservice cluster responsible for identity workflows: user registration, password verification using memory-hard hashing, MFA challenge orchestration, OAuth2/OIDC authorization code exchange, session lifecycle management, and token issuance. It holds the asymmetric private signing keys and is isolated from general application business logic.
- **Primary Relational Database (PostgreSQL with Read Replicas):** Stores core user identities, email addresses, password hashes (with individual salts), user permission tables, and immutable security audit logs. Relational ACID transactions are critical here to prevent race conditions during account creation (such as duplicate email registrations).
- **Distributed Cache & Session Store (Redis Cluster):** Houses mutable, time-sensitive state: active refresh token records organized into token family trees, sliding-window rate limit counters, temporary MFA challenge tokens (with 5-minute TTLs), and global user revocation timestamps. Redis provides sub-millisecond lookups for token refresh operations.
- **Message Queue & Asynchronous Workers (Kafka / RabbitMQ + Worker Fleet):** Decouples slow, non-blocking side-effects from the user login path. When a user logs in from a new device, resets a password, or fails authentication multiple times, the Auth Service publishes an event to Kafka. Background workers handle transactional email delivery, SMS OTP dispatch, Slack security webhooks, and analytics ingestion without adding milliseconds to the login response.

Let us trace a complete request end-to-end for a user logging in and accessing their dashboard:

1. **The Login Step:** The user submits their email and password over HTTPS to `/api/v1/auth/login`. The API Gateway checks the IP-based rate limit in Redis. The Auth Service fetches the user record from PostgreSQL, extracts the stored salt, computes the Argon2id hash of the submitted password, and performs a constant-time comparison.
2. **The MFA Challenge:** If the user has TOTP enabled, the Auth Service issues a temporary, short-lived `mfa_token` (stored in Redis with a 5-minute TTL) and prompts for a 6-digit TOTP code. The client posts the code back to `/api/v1/auth/mfa/verify`. The Auth Service computes the expected HMAC-SHA1 code for the current 30-second time step using the user's encrypted secret.
3. **Token Issuance:** Upon verification, the Auth Service generates a 15-minute asymmetric JWT access token signed with its private key (RS256) and a cryptographically random 32-byte opaque refresh token. The refresh token's SHA-256 hash is saved to Redis under a new Token Family identifier. The refresh token is returned in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, while the access token is returned in the JSON payload or a separate short-lived cookie.
4. **Accessing Protected Resources:** When the client fetches `/api/v1/orders`, the API Gateway intercepts the request. It extracts the JWT from the `Authorization` header, validates the signature against its in-memory public key cache, checks that `exp` is in the future, verifies that the user's `token_version` in local cache matches the token claim, adds `X-User-Id: 10842` to the request headers, and routes it to the Orders Service.
5. **Silent Token Refresh:** After 15 minutes, the access token expires. The client's HTTP interceptor receives a 401 Unauthorized, pauses outgoing requests, and calls `/api/v1/auth/refresh`. The Auth Service validates the refresh token against Redis, invalidates the old refresh token, issues a brand new access token and a brand new refresh token, and updates the token family tree.

## 4. Key Technical Decisions — With Real Tradeoffs

Every architectural choice in an authentication system comes with explicit tradeoffs between security, latency, complexity, and operational cost.

**Decision 1: Asymmetric JWT Access Tokens (RS256/EdDSA) vs Symmetric Tokens (HS256) vs Pure Stateful Sessions**
- **Chosen:** Asymmetric signed JWTs for access tokens + Opaque tokens for refresh sessions.
- **Alternatives Considered:**
  - *Symmetric JWTs (HS256):* Requires sharing the identical private secret key with every single microservice and API gateway in the company. If one internal reporting service is compromised, the attacker gains the ability to forge valid authentication tokens for any user across the entire platform.
  - *Pure Stateful Sessions (Redis on every request):* Eliminates JWT complexity and makes revocation instant, but introduces a hard network dependency on Redis for every single HTTP request across all microservices, multiplying latency and creating a critical cluster-wide failure point.
- **Why We Chose Asymmetric JWTs:** The Auth Service holds the private key and signs tokens. All edge gateways and internal services only need the public key (distributed via a JWKS endpoint) to verify tokens. Services can verify tokens locally in CPU memory without sharing sensitive secrets or executing remote network calls.
- **Tradeoff Accepted:** Access tokens cannot be revoked instantaneously in a purely stateless manner. We mitigate this by enforcing ultra-short lifetimes (10 to 15 minutes) and using lightweight token versioning for emergency administrative revocations.

**Decision 2: Client Token Storage — HttpOnly SameSite Cookies vs Web LocalStorage**
- **Chosen:** `HttpOnly`, `Secure`, `SameSite=Lax` cookies for browser clients; Hardware Keystore for mobile clients.
- **Alternatives Considered:**
  - *HTML5 LocalStorage / SessionStorage:* Extremely easy to implement in client JavaScript (`localStorage.setItem('token', jwt)`), but completely accessible to any JavaScript running on the origin. If a third-party npm package, CDN script, or user-input vulnerability creates a Cross-Site Scripting (XSS) exploit, the attacker can silently extract the token and hijack the user's session permanently.
- **Why We Chose HttpOnly Cookies:** The browser prevents client-side JavaScript from ever reading or modifying `HttpOnly` cookies. The browser automatically attaches the cookie to outbound requests. Setting `SameSite=Lax` (or `Strict`) combined with standard custom headers (such as `X-Requested-With` or custom CSRF tokens) prevents malicious third-party websites from executing Cross-Site Request Forgery attacks.
- **Tradeoff Accepted:** Cookies require precise domain and path configuration across multiple subdomains (e.g. `api.domain.com` vs `app.domain.com`), and require handling CORS `credentials: include` headers properly.

**Decision 3: Password Hashing — Argon2id vs bcrypt vs PBKDF2 vs SHA-256**
- **Chosen:** Argon2id (Memory cost: 64 MB, Time cost: 3 iterations, Parallelism: 4 threads) with unique per-user 16-byte cryptographically random salt and an application-wide Pepper stored in a secret manager.
- **Alternatives Considered:**
  - *SHA-256 / SHA-512 / MD5:* General-purpose cryptographic hash functions designed for speed. A modern GPU cluster can compute over 100 billion SHA-256 hashes per second, making cracked passwords trivial via brute-force or dictionary attacks.
  - *Bcrypt:* A battle-tested password hashing algorithm with configurable CPU work factors. However, bcrypt has a fixed memory footprint (4 KB) and a hard 72-byte password length truncation limit. Because it is not memory-hard, high-end FPGA and ASIC hardware can crack bcrypt hashes significantly faster than Argon2id.
- **Why We Chose Argon2id:** Argon2id is the winner of the Password Hashing Competition. It combines memory-hardness (defeating GPU/ASIC parallel brute-forcing by requiring dedicated RAM per thread) with resistance against side-channel timing attacks.
- **Tradeoff Accepted:** High server CPU and RAM consumption per login attempt (~150ms to 250ms of CPU compute). If left unprotected, attackers can flood the login endpoint to cause CPU exhaustion Denial of Service (DoS). We counteract this with aggressive edge rate limiting and dedicated worker thread isolation.

**Decision 4: Session Invalidation and Revocation Strategy — Token Versioning + Redis Denylist**
- **Chosen:** Hybrid Revocation using User Token Versioning and a JTI (JWT ID) Denylist in Redis.
- **Alternatives Considered:**
  - *No Revocation (Wait for JWT expiry):* Unacceptable for enterprise security standards.
  - *Database query on every single request:* Defeats the entire performance purpose of using stateless tokens.
- **Why We Chose Hybrid Revocation:**
  - *Global / Device Revocation (Password change, "Log out all devices"):* We increment a numeric `token_version` on the user record in the primary DB and sync it to Redis (`user:10842:version = 5`). The user's access token carries `tver: 4`. The API Gateway checks this cached integer in local memory. Since `4 < 5`, the token is rejected immediately.
  - *Single Token Revocation (Standard logout):* The token's unique ID (`jti`) is placed into a Redis Denylist with an automatic TTL equal only to the remaining lifespan of that specific access token (maximum 15 minutes). Redis memory usage remains tiny because expired entries are automatically evicted.
- **Tradeoff Accepted:** Requires edge proxies and gateways to maintain a fast connection to a Redis cache, but keeps the hot-path lookup to sub-millisecond speeds.

**Decision 5: Federated Identity — OAuth 2.0 / OpenID Connect Authorization Code Flow with PKCE**
- **Chosen:** OAuth 2.0 Authorization Code Flow with Proof Key for Code Exchange (PKCE, RFC 7636) for all client types.
- **Alternatives Considered:**
  - *OAuth 2.0 Implicit Flow:* Previously popular for browser SPAs, where the identity provider returned tokens directly in the URL fragment hash. This flow is officially deprecated by OAuth 2.1 because tokens leak in browser history, HTTP Referer headers, and server logs.
- **Why We Chose PKCE:** PKCE generates a dynamic cryptographic verifier and challenge (`code_verifier` and `code_challenge`) for every login request. Even if a malicious app or man-in-the-middle intercepts the authorization code returned by Google or Okta, they cannot exchange it for an access token without knowing the original secret verifier.

## 5. Deep Dives — The Parts That Actually Matter

**Deep Dive 1: Refresh Token Rotation and Automated Token Theft Detection**

The biggest vulnerability of long-lived refresh tokens is that if an attacker intercepts one, they can maintain persistent access indefinitely. We eliminate this with **Refresh Token Rotation with Replay Detection**:

```txt
[ Normal Flow ]
1. User logs in        --> Family F1 created. Issues RefreshToken_1.
2. 15 mins later       --> Client presents RefreshToken_1.
3. Server validates    --> Invalidates RefreshToken_1. Issues RefreshToken_2 (Family F1).
4. 15 mins later       --> Client presents RefreshToken_2.
5. Server validates    --> Invalidates RefreshToken_2. Issues RefreshToken_3 (Family F1).

[ Attack / Theft Detected ]
1. Attacker intercepted RefreshToken_1 earlier.
2. Legitimate client already used RefreshToken_1 to get RefreshToken_2.
3. Attacker presents RefreshToken_1 to /auth/refresh.
4. Server checks Redis --> Finds RefreshToken_1 is marked "ALREADY_USED" in Family F1!
5. SECURITY ALERT TRIGGERED:
   - Immediate invalidation of entire Family F1 (RefreshToken_2 and RefreshToken_3 destroyed).
   - Increment user's token_version in PostgreSQL and Redis.
   - All active access tokens for this user are now rejected across all gateways.
   - Security event logged to Kafka; automated alert email sent to user.
```

How this is structured in Redis:

- Every session is assigned a `family_id` (UUIDv4).
- When a refresh token is issued, its cryptographic SHA-256 hash is stored as a key in Redis: `auth:refresh:<token_hash>`.
- The value contains `{ "user_id": 10842, "family_id": "fam_99", "status": "ACTIVE", "expires_at": 1740000000 }`.
- When exchanged, the Auth Service executes an atomic Redis transaction (using a Lua script): it checks if the token status is `ACTIVE`. If yes, it flips the status to `USED`, sets a 60-second grace-period TTL on the old token (to prevent race conditions from concurrent network retries), and creates a new key for the new token.
- If a request arrives with a token whose status is `USED` past the grace period, the Lua script instantly deletes all keys matching `auth:family:fam_99:*`, effectively terminating the session for both the attacker and the victim and forcing a secure re-authentication.

**Deep Dive 2: Multi-Layered Defense Against Credential Stuffing and Brute Force**

Authentication endpoints are the primary target for automated abuse. Protecting them requires a multi-layered filter:

```txt
Incoming Request --> [Layer 1: Edge WAF & IP Rate Limiting]
                              | (Pass)
                              v
                     [Layer 2: Sliding Window Account-Level Rate Limiter]
                              | (Pass)
                              v
                     [Layer 3: Constant-Time Credential Validation]
                              | (Pass)
                              v
                     [Layer 4: Anomaly Detection & Adaptive Challenges]
```

- **Layer 1: Edge IP & ASN Token Bucket:** The API Gateway enforces a rate limit of 10 requests per minute per IP on `/api/v1/auth/login`. Requests exceeding this threshold receive HTTP 429 Too Many Requests immediately at the edge without touching backend application servers.
- **Layer 2: Per-Account Sliding Window Log in Redis:** Attackers bypass IP limits by rotating through 50,000 residential proxies (distributed brute force). We track failed attempts by targeted email address: `auth:failed_attempts:<email_hash>`. If an account experiences 5 failed attempts within 15 minutes, the system triggers progressive friction:
  - Attempt 1–3: Standard response.
  - Attempt 4–5: Mandatory invisible CAPTCHA verification (Cloudflare Turnstile).
  - Attempt 6+: Temporary 15-minute account lock. The user receives a security notification with a magic link to unlock their account immediately.
- **Layer 3: Constant-Time Execution and Elimination of User Enumeration:** If an attacker attempts to log in with an email that does not exist, a naive system returns immediately with `User not found` in 5ms, whereas a valid user takes 200ms for password hashing. Attackers use this timing difference to harvest valid email lists. To eliminate timing attacks:
  - The Auth Service always executes an identical dummy Argon2id calculation against a fixed static salt when an email does not exist in the database.
  - The response for both invalid password and non-existent user is strictly identical: `{"error": "invalid_credentials"}`.
  - Password reset requests always respond with: `"If an account exists with this email, a reset link has been sent."`
- **Layer 4: Breached Password Screening (Have I Been Pwned Integration):** During user registration and password changes, the Auth Service hashes the candidate password with SHA-1, extracts the first 5 characters (the prefix), and queries the Have I Been Pwned API using the k-Anonymity model. The external API returns all hash suffixes matching that 5-character prefix without ever learning the user's password. If the user's full hash matches a known breached password, registration is rejected with an instruction to choose a stronger password.

**Deep Dive 3: Cryptographic Key Rotation Without Downtime (JWKS)**

In production, cryptographic signing keys must be rotated regularly (e.g., every 90 days) or immediately if a private key is suspected of compromise. The system must support key rotation without logging out millions of active users or dropping in-flight API requests.

The Auth Service exposes a public JSON Web Key Set (JWKS) at `https://auth.example.com/.well-known/jwks.json`.

```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "key-2026-q1",
      "n": "u1W3b...[base64-encoded public modulus]...",
      "e": "AQAB"
    },
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "key-2026-q2",
      "n": "v8K2x...[base64-encoded new public modulus]...",
      "e": "AQAB"
    }
  ]
}
```

Every issued JWT includes a Key ID (`kid`) in its header: `{"alg": "RS256", "typ": "JWT", "kid": "key-2026-q1"}`.

Here is the zero-downtime key rotation lifecycle:

1. **Phase 1 (Preparation):** Generate new key pair `key-2026-q2`. Publish its public key to `jwks.json` alongside `key-2026-q1`.
2. **Phase 2 (Propagation):** API Gateways and microservices poll `jwks.json` periodically (or fetch on unknown `kid` with in-memory caching) and load the new public key into memory.
3. **Phase 3 (Active Signing Switch):** Update the Auth Service configuration to sign all newly issued access tokens with the private key of `key-2026-q2`.
4. **Phase 4 (Coexistence):** Existing active tokens signed with `key-2026-q1` continue to verify successfully at all gateways because `key-2026-q1` is still present in the cached JWKS public set.
5. **Phase 5 (Retirement):** After the maximum access token TTL has elapsed (15 minutes), no valid tokens signed with `key-2026-q1` remain in circulation. Safely remove `key-2026-q1` from `jwks.json` and destroy its private key.

## 6. Failure Modes and Resilience

When designing an authentication system, you must plan for what happens when core infrastructure dependencies degrade or fail entirely.

- **Failure Mode 1: Redis Cluster Outage or Network Partition**
  - *What Happens:* The system cannot write new session states, refresh tokens cannot be rotated, and distributed rate limiting counters become inaccessible.
  - *System Resilience & Recovery:* The hot-path access token verification at the API Gateway continues working at 100% capacity because JWT cryptographic signature verification is purely stateless and relies only on in-memory public keys. Existing logged-in users continue accessing protected resources seamlessly until their 15-minute access tokens expire. For refresh and login routes, the Auth Service falls back to an emergency read-replica database check or temporarily serves a graceful HTTP 503 while the Redis cluster executes automatic failover via Redis Sentinel / Cluster replication.
- **Failure Mode 2: CPU Exhaustion Attack via Password Hashing Floods**
  - *What Happens:* Because Argon2id consumes ~200ms of CPU compute per hash, an attacker bypassing edge filters could exhaust all available CPU cores across the Auth Service cluster, causing cascading timeouts for legitimate logins.
  - *System Resilience & Recovery:* The Auth Service runs inside an isolated container cluster equipped with strict CPU resource limits and autoscaling policies. Password hashing tasks are executed on a dedicated thread worker pool decoupled from the HTTP connection event loop. The edge API Gateway implements aggressive IP rate limiting and introduces mandatory Proof-of-Work / Cloudflare Turnstile challenges the moment CPU utilization exceeds 70%.
- **Failure Mode 3: Clock Drift Across Distributed Microservices**
  - *What Happens:* If the Auth Service clock drifts 30 seconds ahead of an API Gateway or downstream service, newly minted JWTs will be rejected immediately by the gateway with `Token not yet valid (nbf)` or will expire 30 seconds earlier than expected.
  - *System Resilience & Recovery:* All physical and virtual host instances synchronize continuously against an authoritative Network Time Protocol (NTP) pool (such as Amazon Time Sync Service). Additionally, all JWT verification libraries across the company are configured with a mandatory 60-second clock skew tolerance leeway (`clockTolerance: 60`).
- **Failure Mode 4: Primary Relational Database Outage During Login Spikes**
  - *What Happens:* Users cannot register, update passwords, or complete initial credential logins.
  - *System Resilience & Recovery:* The Auth Service routes read-only credential lookups to PostgreSQL Read Replicas across multiple Availability Zones. Connection pooling is managed by PgBouncer to prevent database thread starvation. User login events and security audits are pushed to a fault-tolerant Kafka buffer so that downstream analytical and notification workers continue processing without locking database rows.

## 7. What Makes a Great Answer vs an Average One

In a senior-level system design interview for an authentication platform, interviewers listen for the difference between textbook memorization and battle-tested production engineering.

- **Average Candidates:** Suggest storing JWTs in browser `localStorage` with a 7-day expiration so they "don't need a database."
- **Great Candidates:** Point out immediately that storing tokens in `localStorage` creates severe XSS vulnerabilities, and that 7-day stateless JWTs make instant session revocation impossible. They recommend short-lived (15-minute) JWTs verified statelessly at the edge, paired with opaque, rotating refresh tokens stored in `HttpOnly`, `Secure`, `SameSite` cookies with replay attack detection.
- **Average Candidates:** Propose using SHA-256 or standard MD5 to hash passwords "because it's encrypted."
- **Great Candidates:** Explain that hashing is not encryption (it is a one-way mathematical function), and that fast algorithms like SHA-256 are disastrous for password storage because GPUs can compute billions of guesses per second. They advocate for memory-hard algorithms like Argon2id (or bcrypt with cost factor 12+), complete with unique per-user salts and an application pepper stored in a dedicated Key Management Service (KMS).
- **Average Candidates:** Treat OAuth2 and OpenID Connect as simple third-party button widgets.
- **Great Candidates:** Explain the exact cryptographic handshake of the OAuth 2.0 Authorization Code Flow with PKCE, detailing why the Implicit Flow was deprecated and how the authorization code is securely exchanged for an identity token (`id_token`) and access token on the backend server.
- **Average Candidates:** Only design the happy path where a user enters the right password.
- **Great Candidates:** Spend substantial time designing the defensive posture: constant-time password comparisons to stop timing attacks, distributed rate limiting with sliding logs in Redis to defeat credential stuffing botnets, k-Anonymity password breach screening, and zero-downtime asymmetric key rotation using JWKS.

## 8. 🧠 The Memory Hook

**The Passport and the Border Registry**: An access token is like a **Passport**—stamped with your identity and cryptographically signed by the government so any border guard (microservice) can verify it in five milliseconds without calling capital headquarters. A refresh token is like your **Master Registry File at the Embassy**—kept under lock and key, checked only when your passport expires, and shredded immediately along with all your travel privileges the moment an imposter attempts to present a recycled copy.
*Short-lived stateless keys for the high-speed hot path; stateful rotating secrets in secure cookies for the lifecycle.*
