# Designing Secure Login APIs: Credential Verification, Rate Limiting, and Session Issuance

## 1. Why This Exists — The Problem First

Imagine deploying a seemingly clean login endpoint: `POST /api/auth/login`. It queries the database by email, checks `if (!user) return res.status(404).json({ error: "User not found" })`, executes a synchronous password check `bcrypt.compareSync(password, user.passwordHash)`, and returns a 30-day JSON Web Token (JWT) in the response body that the frontend saves to `localStorage`. To prevent brute-force attacks, you add a rule: "Lock the account after 5 failed attempts."

Within forty-eight hours of launching, three distinct production disasters strike:

First, a distributed botnet targets your endpoint with credential stuffing, firing 100,000 requests per minute across rotating residential IP addresses. Because `bcrypt.compareSync` blocks Node's single-threaded event loop for ~100ms per call, four concurrent requests saturate the CPU. The server stops responding to health checks, reverse proxies start dumping 504 Gateway Timeouts, and your entire application crashes.

Second, security researchers notice a timing discrepancy. When an email does not exist in your database, your server returns in 4ms with `404 User not found`. When the email exists, password hashing takes 98ms before returning `401 Wrong password`. Using automated timing probes, attackers enumerate your entire user base and harvest valid corporate emails without guessing a single password.

Third, an attacker exploits your "lock account after 5 attempts" logic. By submitting five garbage passwords for the email addresses of the CEO, senior executives, and system administrators, they lock every administrative user out of the platform on demand. Meanwhile, a compromised third-party analytics script executes an XSS payload in the browser, reads the 30-day JWT directly from `localStorage`, and exfiltrates persistent administrative sessions that you have no mechanism to revoke.

A production login API is not a simple database lookup. It is a high-stakes cryptographic gateway, a rate-limiting defense perimeter, and a secure session issuance boundary.

```txt
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 PRODUCTION LOGIN FLOW                                  │
└────────────────────────────────────────────────────────────────────────────────────────┘

  Client Request: POST /api/auth/login { email, password }
         │
         ▼
  ┌────────────────────────────────────────────────────────┐
  │ 1. Rate Limiter (Redis Sliding Window)                 │
  │    - Check IP velocity (e.g., max 20 req/min)          │
  │    - Check Account velocity (e.g., max 5 fails/15 min) │
  │    - Trigger CAPTCHA challenge if fails >= 3           │
  └──────────────────────────┬─────────────────────────────┘
                             │ Passes Rate Check
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 2. Account Lookup & Constant-Time Defense              │
  │    - Query user by normalized email                    │
  │    - If user NOT found: load DUMMY_HASH                │
  │    - Execute Argon2id/Bcrypt in threadpool (async)     │
  └──────────────────────────┬─────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
     Hash Matches? (No)                Hash Matches? (Yes)
            │                                 │
     Record Failure in Redis                  ▼
     Return 401:                       Is MFA Enabled?
     "Invalid email or password"              │
     (Uniform 100ms timing)         ┌─────────┴─────────┐
                                    ▼                   ▼
                                  (Yes)                (No)
                                    │                   │
                        Return 200 + mfa_token          ▼
                        (No session created yet)   Issue Dual Tokens:
                                                   - Access Token (JSON body, 15m)
                                                   - Refresh Token (HttpOnly Cookie, 7d)
                                                   - Store Refresh Session in Redis/DB
```

## 2. The Analogy — Make It Obvious

Think of a production login API like the **security checkpoint at a high-security embassy**:

1. **The Outer Gatekeeper (Rate Limiting & Abuse Prevention):** Before you even reach the verification booth, an officer monitors the perimeter. If someone presses the intercom twenty times in ten seconds, the gate locks them out. If three incorrect visitors ask for the ambassador in a row, the guard does not bar the ambassador from ever entering their own embassy (Account Lockout DoS); instead, they require anyone else claiming that name to present an extra physical entry permit or solve an on-the-spot verification test (CAPTCHA).
2. **The Blindfolded Screener (Constant-Time Verification & Dummy Hashing):** When you step up to the booth and present your name and secret passphrase, the screener looks at a massive ledger. If your name is on the list, they spend exactly two minutes verifying your cryptographic seal. If your name is **not** on the list, the screener does not dismiss you in three seconds. They pull out a fake dummy seal and spend the exact same two minutes checking it anyway. An observer standing outside with a stopwatch learns zero information about whether that person is in the building's directory.
3. **The Back-Office Verification Staff (Worker Threadpool):** The screener does not freeze the entire entrance line while inspecting the intricate physical seal. They slide the document to a dedicated back-room team (worker threads / asynchronous crypto execution) so the front lobby continues greeting visitors without grinding to a halt.
4. **The Stepped Escort (MFA Challenge):** If your primary passphrase matches and you have dual-clearance enabled, the guard does not hand you master building keys. They give you a temporary yellow lanyard (MFA Token) that is only valid for walking into Room 2 to scan your hardware key or phone authenticator.
5. **The Two-Badge Protocol (Access Token vs. Refresh Token):** Once cleared, you receive a temporary green badge that clips to your shirt and self-destructs after 15 minutes (Access Token). For extended access, the embassy does not ask for your primary passport and passphrase every 15 minutes. Instead, they deposit an encrypted, tamper-proof credential into an ironclad embassy vault locker that only embassy personnel can open (`HttpOnly`, `Secure` Cookie). Whenever your green badge expires, the embassy checks that locker to issue a fresh badge.

## 3. How It Actually Works — The Full Explanation

Designing a production-grade login API requires engineering across four interconnected layers: abuse prevention, constant-time authentication, stepped authorization, and secure session lifecycle management.

### Layer 1: Abuse Prevention and Rate-Limiting Strategy

Authentication endpoints are prime targets for automated attacks. We apply layered rate limiting using Redis sliding windows:

1. **IP-Level Throttling:** Restrict any individual IP to a reasonable threshold (e.g., 20 login attempts per minute). This stops crude brute-force scripts originating from a single host.
2. **Account-Level Velocity Tracking:** Track failed attempts against a normalized identifier (`rate_limit:account:<normalized_email>`).
3. **Progressive Delays vs. CAPTCHA vs. Account Lockout:**
   - **Hard Account Lockout:** Locking an account after 5 failed attempts is an anti-pattern for public APIs. It weaponizes your login system into a Denial-of-Service tool where attackers lock out legitimate users by deliberately submitting invalid passwords for targeted emails.
   - **Adaptive Friction (The Production Standard):**
     - Attempts 1–2: Standard instant response.
     - Attempt 3+: Return a requirement for a CAPTCHA token (e.g., Cloudflare Turnstile or reCAPTCHA v3) alongside credentials.
     - Attempt 10+: Enforce progressive backoff (exponential delay) and send a security alert email to the registered address with a one-click magic login link or password reset option.

### Layer 2: Constant-Time Execution and User Enumeration Defense

To prevent attackers from compiling a directory of valid users, the login API must eliminate both **data leaks** and **timing leaks**:

1. **Uniform Error Responses:** The API must return an identical HTTP status code (`401 Unauthorized`) and identical payload (`{"error": "Invalid email or password"}`) whether the email does not exist, the password is wrong, or the account is unverified. Never return `404 User Not Found` or `"Incorrect password for this user"`.
2. **Eliminating the Timing Channel via Dummy Hashes:**
   - Password hashing algorithms (Argon2id, Bcrypt) are intentionally slow (consuming 50–150ms of CPU time to thwart offline cracking).
   - If an existing user query takes 100ms (database lookup + password hash comparison), but a non-existent user query returns immediately after the database lookup (5ms), attackers measure response latency to deduce email existence with 99% accuracy.
   - **The Fix:** When the database lookup returns `null`, the server must continue execution by running the password verification against a pre-computed static `DUMMY_HASH` (a valid hash of an arbitrary fixed string). Both branches consume virtually identical CPU time before returning the 401 error.

### Layer 3: Asynchronous Password Hashing in the Runtime

Password hashing algorithms are CPU-bound. In single-threaded runtimes like Node.js, running synchronous cryptographic functions blocks the event loop entirely.

- **Bcrypt / Argon2 Asynchronous Execution:** Always use asynchronous bindings (`bcrypt.compare()` or `argon2.verify()`). These offload the cryptographic computation to the underlying libuv worker threadpool (or native threadpool), freeing the event loop to handle concurrent I/O operations.
- **Threadpool Sizing:** In Node.js, the default `UV_THREADPOOL_SIZE` is 4. Under high login volume, 4 concurrent password verifications will saturate the threadpool, queuing file system and DNS calls. Production services with high auth throughput must scale `UV_THREADPOOL_SIZE` (e.g., `UV_THREADPOOL_SIZE=16` or `64`) or isolate authentication into a dedicated microservice.

### Layer 4: Multi-Factor Authentication (MFA / 2FA) Challenge Flow

When an account has MFA enabled, primary credential verification is only step one:

1. Validate email and password.
2. If credentials match and MFA is enabled, **do not issue access or refresh tokens**.
3. Generate a short-lived, cryptographically signed intermediate token (`mfa_token`, TTL = 5 minutes). The payload contains `{ "sub": user.id, "purpose": "mfa_pending" }`.
4. Return HTTP 200 with `{ "mfa_required": true, "mfa_token": "..." }`.
5. The client transitions to the MFA entry screen and sends `{ "mfa_token": "...", "totp_code": "123456" }` to `POST /api/auth/mfa/verify`.
6. Only upon successful verification of the second factor are the true session tokens issued.

### Layer 5: Dual-Token Architecture & Secure Cookie Issuance

To balance stateless scalability with revocation control, use a dual-token pattern:

1. **Access Token (Short-Lived):**
   - **Lifespan:** 10 to 15 minutes.
   - **Format:** Signed JWT or lightweight opaque token containing user ID, tenant ID, and permissions.
   - **Storage:** Kept in frontend JavaScript memory (e.g., React state / module variable). Never stored in `localStorage` or `sessionStorage` where it is vulnerable to cross-site scripting (XSS) extraction.
2. **Refresh Token (Long-Lived):**
   - **Lifespan:** 7 to 30 days.
   - **Format:** Cryptographically secure random 256-bit string stored in the database/Redis with associated device metadata, user agent, IP, and family ID.
   - **Storage:** Delivered via `Set-Cookie` header with the following mandatory security flags:
     - `HttpOnly`: Prevents client-side scripts from reading `document.cookie` (mitigates XSS token theft).
     - `Secure`: Ensures the browser only transmits the cookie over encrypted TLS/HTTPS connections.
     - `SameSite=Strict` (or `Lax`): Prevents the browser from sending the cookie in cross-site requests (neutralizes Cross-Site Request Forgery / CSRF attacks).
     - `Path=/api/auth/refresh`: Scopes cookie transmission strictly to the token refresh endpoint, avoiding overhead on general API calls.
3. **Refresh Token Rotation with Reuse Detection:**
   - Every time a refresh token is used to generate a new access token, the old refresh token is invalidated and a new refresh token is issued.
   - If an attacker steals a refresh token and uses it *after* the legitimate user has already rotated it, the server detects token reuse (presenting an already-consumed token). The server immediately invalidates the entire session family, kicking both the attacker and the victim out and requiring re-authentication.

## 4. Real Code — See It Working

Here is a production-ready implementation of a secure login controller in TypeScript with Express, Redis rate limiting, constant-time dummy hashing, and secure cookie issuance.

```typescript
import { Request, Response, NextFunction } from 'express';
import argon2 from 'argon2';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Pre-computed dummy hash of a random string using Argon2id.
// Used when an email is not found to equalize verification timing.
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$dHVtbXlzYWx0c3RyaW5n$qU9r9P1O6hQ2w6xY7z8A9B0C1D2E3F4G5H6I7J8K9L0';

interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  isMfaEnabled: boolean;
  isSuspended: boolean;
}

// Simulated database lookup
async function findUserByEmail(email: string): Promise<UserRecord | null> {
  // In production: return db.users.findUnique({ where: { email } });
  return null;
}

// 1. Sliding window rate limiter helper
async function checkLoginVelocity(ip: string, email: string): Promise<{ allowed: boolean; requireCaptcha: boolean }> {
  const ipKey = `ratelimit:login:ip:${ip}`;
  const accountKey = `ratelimit:login:account:${email}`;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window

  const pipeline = redis.pipeline();
  
  // Track IP attempts in a sorted set
  pipeline.zremrangebyscore(ipKey, 0, now - windowMs);
  pipeline.zadd(ipKey, now, `${now}-${Math.random()}`);
  pipeline.zcard(ipKey);
  pipeline.expire(ipKey, 60);

  // Track failed attempts per account
  pipeline.get(accountKey);

  const results = await pipeline.exec();
  const ipAttempts = (results?.[2]?.[1] as number) || 0;
  const accountFails = parseInt((results?.[4]?.[1] as string) || '0', 10);

  // Strict rate limit: Max 20 requests per minute per IP
  if (ipAttempts > 20) {
    return { allowed: false, requireCaptcha: true };
  }

  // Progressive friction: Require CAPTCHA after 3 failed attempts on this account
  const requireCaptcha = accountFails >= 3;

  return { allowed: true, requireCaptcha };
}

// 2. Login Route Controller
export async function loginController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, captchaToken } = req.body;

    // Strict boundary validation
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // Check rate limit & abuse score
    const velocity = await checkLoginVelocity(clientIp, normalizedEmail);
    if (!velocity.allowed) {
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return;
    }

    // If CAPTCHA is required due to previous failed attempts, verify token
    if (velocity.requireCaptcha && !captchaToken) {
      res.status(403).json({
        error: 'Security challenge required',
        requireCaptcha: true
      });
      return;
    }

    // Query user by email
    const user = await findUserByEmail(normalizedEmail);

    // Constant-Time Verification Defense:
    // If user is null, verify against DUMMY_HASH so the CPU takes ~100ms regardless.
    const targetHash = user ? user.passwordHash : DUMMY_HASH;
    
    // Async verification offloaded to threadpool
    const isPasswordValid = await argon2.verify(targetHash, password);

    // Handle authentication failure
    if (!user || !isPasswordValid || user.isSuspended) {
      // Increment account-level failure counter in Redis (expires in 15 mins)
      await redis.incr(`ratelimit:login:account:${normalizedEmail}`);
      await redis.expire(`ratelimit:login:account:${normalizedEmail}`, 900);

      // Uniform error response: never reveal whether email or password was wrong
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Clear failed attempts counter upon successful credential match
    await redis.del(`ratelimit:login:account:${normalizedEmail}`);

    // Stepped MFA Challenge Flow
    if (user.isMfaEnabled) {
      const mfaSessionToken = jwt.sign(
        { sub: user.id, purpose: 'mfa_pending' },
        process.env.MFA_JWT_SECRET!,
        { expiresIn: '5m' }
      );

      res.status(200).json({
        mfaRequired: true,
        mfaToken: mfaSessionToken
      });
      return;
    }

    // Issue Dual Tokens on Complete Authentication
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email },
      process.env.ACCESS_TOKEN_SECRET!,
      { expiresIn: '15m' }
    );

    // Generate secure opaque refresh token
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const sessionId = crypto.randomUUID();

    // Store refresh session in database/Redis with metadata
    await redis.setex(
      `session:${sessionId}`,
      7 * 24 * 60 * 60, // 7 days TTL
      JSON.stringify({
        userId: user.id,
        tokenHash: refreshTokenHash,
        ip: clientIp,
        userAgent: req.headers['user-agent']
      })
    );

    // Package session identifier + raw secret into cookie payload
    const refreshCookiePayload = `${sessionId}:${rawRefreshToken}`;

    // Set HttpOnly, Secure, SameSite cookie
    res.cookie('refresh_token', refreshCookiePayload, {
      httpOnly: true,                                // Inaccessible to JavaScript (XSS defense)
      secure: process.env.NODE_ENV === 'production', // Transmit only over HTTPS
      sameSite: 'strict',                            // Blocks cross-site requests (CSRF defense)
      path: '/api/auth/refresh',                     // Scoped strictly to refresh endpoint
      maxAge: 7 * 24 * 60 * 60 * 1000               // 7 days in milliseconds
    });

    // Return Access Token and safe user metadata in JSON response body
    res.status(200).json({
      mfaRequired: false,
      accessToken,
      expiresIn: 900, // 15 minutes in seconds
      user: {
        id: user.id,
        email: user.email
      }
    });
  } catch (err) {
    next(err);
  }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why must login APIs return uniform error messages, and is a uniform message alone sufficient to stop user enumeration?**

A uniform error message (e.g., returning `401 Unauthorized` with `"Invalid email or password"` for both missing users and wrong passwords) prevents attackers from reading explicit error strings to determine if an email is registered.

However, a uniform message alone does **not** stop user enumeration because of timing side channels. Password hashing algorithms (Argon2id, Bcrypt) consume 80–120ms of computation. If a non-existent email query returns immediately after the database query (~4ms), but an existing email query runs the full password hash before returning (~100ms), attackers measure response latency to identify registered accounts. To completely seal the vulnerability, you must combine uniform error messages with **constant-time execution**: when a user is not found, the server must still run password verification against a pre-computed dummy hash before responding.

**Q: Why use a dual-token architecture (Access + Refresh) instead of a single long-lived JWT?**

A single long-lived JWT (e.g., valid for 30 days) creates an irreconcilable security paradox:
1. If the token is purely stateless, you cannot revoke it if the user changes their password, is banned, or has their credentials compromised. The attacker retains access until the 30-day expiration timer runs out.
2. If you check a database on every single API request to verify the token's validity, you have converted your stateless JWT into an expensive stateful session, defeating the performance benefits of JWTs.

The dual-token architecture solves this cleanly:
- **Access Token:** Short-lived (15 minutes), stateless, and verified cryptographically without database I/O on protected resource endpoints. If compromised, the attacker's window of opportunity is limited to minutes.
- **Refresh Token:** Long-lived (7–30 days), stateful, and checked against the database/Redis *only once every 15 minutes* when minting a new access token. This gives you instant revocation capabilities without bottlenecking regular API traffic with constant database lookups.

**Q: Where should the frontend store Access Tokens and Refresh Tokens?**

- **Access Tokens:** Must be stored in **browser memory** (such as React component state, Redux store, or a module-level variable). Memory storage ensures that if the application suffers an XSS vulnerability, the attacker cannot read persistent storage to retain access after a page reload.
- **Refresh Tokens:** Must be stored in an **`HttpOnly`, `Secure`, `SameSite=Strict` cookie** scoped with `Path=/api/auth/refresh`. Storing refresh tokens in `localStorage` or `sessionStorage` allows any injected JavaScript snippet to read and exfiltrate the token, granting the attacker persistent access to the account.

**Q: How do you prevent brute-force attacks without creating a Denial-of-Service (DoS) vector via account lockouts?**

Hard account lockouts (locking an account after $N$ failed attempts) allow an attacker with a list of target corporate emails to lock out every legitimate user by scripting invalid login attempts.

The senior architectural solution is **adaptive progressive friction**:
1. Apply rate limits per IP address to throttle distributed high-frequency requests.
2. Track failed login attempts per account in Redis.
3. After 3 failed attempts on an account, do not lock the account. Instead, trigger a mandatory **CAPTCHA challenge** (e.g., Cloudflare Turnstile). Automated bot scripts cannot solve the challenge, while a legitimate user who mistyped their password can complete the challenge and log in.
4. If failed attempts continue escalating, enforce progressive exponential response delays and dispatch an out-of-band email notification to the account owner with a secure magic login link.

**Q: How does a secure Multi-Factor Authentication (MFA) challenge flow work over REST?**

When primary credentials match for an account with MFA enabled:
1. The server generates a temporary, cryptographically signed `mfa_token` with a short lifespan (3 to 5 minutes) containing `{ "sub": user.id, "purpose": "mfa_pending" }`.
2. The server returns `200 OK` with payload `{ "mfa_required": true, "mfa_token": "..." }`. Crucially, **no access token or refresh cookie is issued**.
3. The client receives the payload, renders the TOTP/WebAuthn input form, and submits `POST /api/auth/mfa/verify` containing the `mfa_token` and the 6-digit TOTP code.
4. The server validates the signature and purpose of the `mfa_token`, verifies the TOTP code against the user's secret key, and only then issues the final Access Token and Refresh Token cookie.

**Q: Why does synchronous password verification crash Node.js servers, and how do you configure the runtime for auth workloads?**

Node.js executes application JavaScript on a single thread (the event loop). Algorithms like Bcrypt and Argon2 are intentionally CPU-intensive. Calling `bcrypt.compareSync()` locks the single thread for ~100ms. If 10 requests hit the server concurrently, the event loop is blocked for a full second, causing incoming network requests, timers, and health checks to stall.

To prevent this:
1. Always use asynchronous methods (`argon2.verify()` or `bcrypt.compare()`), which delegate CPU computation to the C++ worker threadpool managed by libuv.
2. By default, libuv allocates only 4 worker threads (`UV_THREADPOOL_SIZE=4`). Under heavy login traffic, 4 concurrent password checks occupy all worker threads, causing asynchronous file I/O and DNS lookups to queue up. For high-throughput authentication services, set `UV_THREADPOOL_SIZE=16` or `64` at process startup, or run authentication as an isolated, independently scaled microservice.

**Q: What is Refresh Token Rotation and how does it detect token theft?**

Refresh Token Rotation ensures every refresh token can be used **exactly once**. When a client presents Refresh Token $A$ to obtain a new access token, the server deletes Token $A$ and issues new Refresh Token $B$.

Each token belongs to a **Token Family ID**. If an attacker intercepts Token $A$ and tries to use it *after* the legitimate client has already exchanged it for Token $B$, the server detects that an already-consumed token is being presented. This indicates token reuse and active compromise. The server immediately revokes all refresh tokens associated with that Family ID, destroying the session across all devices and forcing re-authentication.

## 6. The Traps — What Goes Wrong

- **Trap 1: The Early-Return Timing Leak.**
  *What people do:* Check `const user = await db.findUser(email); if (!user) return res.status(401).json({ error: "Invalid credentials" });`.
  *Why it fails:* When the user does not exist, the route returns in 3ms. When the user exists, password hashing executes for 90ms before returning 401. Attackers run timing scripts to enumerate all registered user emails.
  *The fix:* If `user === null`, execute `await argon2.verify(DUMMY_HASH, password)` so latency remains identical across both outcomes.

- **Trap 2: Event Loop Starvation from `compareSync`.**
  *What people do:* Use `bcrypt.compareSync(password, hash)` inside Express route handlers.
  *Why it fails:* In Node.js, synchronous hashing locks the event loop. Under modest traffic spikes, all other routes, database queries, and WebSocket connections freeze.
  *The fix:* Always use `await argon2.verify(hash, password)` or `await bcrypt.compare(password, hash)`.

- **Trap 3: Storing Session Tokens in `localStorage`.**
  *What people do:* Send `{ accessToken, refreshToken }` in the JSON response body and save both in browser `localStorage`.
  *Why it fails:* Any third-party script, dependency injection, or XSS flaw can access `localStorage.getItem('refreshToken')` and exfiltrate permanent account access.
  *The fix:* Keep Access Tokens in JS memory only, and deliver Refresh Tokens in `HttpOnly`, `Secure`, `SameSite=Strict` cookies.

- **Trap 4: Account Lockout Denial of Service.**
  *What people do:* Set `user.isLocked = true` whenever 5 consecutive failed logins occur on an account.
  *Why it fails:* An attacker writes a script targeting corporate executives, sending 5 bad passwords per email every 15 minutes. The entire executive team is permanently locked out of the system.
  *The fix:* Use CAPTCHAs, progressive sliding-window delays, and IP-level throttling instead of hard account locks.

- **Trap 5: Issuing Full Sessions on MFA Challenge Responses.**
  *What people do:* Issue an Access Token with a claim `{ mfaCompleted: false }` and save the Refresh Token cookie during the initial credential check.
  *Why it fails:* If an attacker steals the initial credentials, they already possess the Refresh Token cookie and can attempt to hit refresh endpoints or bypass frontend MFA redirects.
  *The fix:* Never set cookies or issue access tokens on the initial credential check. Issue only an ephemeral, scoped `mfa_token` valid strictly at the `/api/auth/mfa/verify` endpoint.

- **Trap 6: Missing Cookie Scope and SameSite Protection.**
  *What people do:* Issue refresh cookies with default parameters: `res.cookie('refreshToken', token)`.
  *Why it fails:* The cookie is sent on every single HTTP request to every endpoint on the domain (bloating request headers), is readable via JavaScript (no `HttpOnly`), is transmitted over plain HTTP (no `Secure`), and is vulnerable to cross-site triggering (no `SameSite`).
  *The fix:* Always specify `{ httpOnly: true, secure: true, sameSite: 'strict', path: '/api/auth/refresh' }`.

## 7. Compare With Related Concepts

- **Direct Login API vs. OAuth2 / OIDC Authorization Code Flow:**
  - *Difference:* A Login API directly accepts user credentials (email/password) to authenticate first-party clients. OAuth2 / OIDC delegates credential handling to an identity provider (e.g., Google, Okta) and exchanges authorization codes for tokens.
  - *Rule:* Use a direct Login API for first-party applications where you own the identity store; use OAuth2/OIDC when enabling third-party integrations or enterprise Single Sign-On (SSO).

- **Stateless Dual-Token (JWT + Cookie) vs. Stateful Server-Side Sessions (Redis Session ID):**
  - *Difference:* Stateful sessions store full user state in Redis and check it on every request via a single session ID cookie. Dual-token JWTs allow resource servers to verify access tokens locally without database calls, checking Redis only during token refresh (every 15 minutes).
  - *Rule:* Choose stateful Redis sessions for monolithic web apps with strict immediate revocation requirements; choose dual-token architectures for microservices and distributed APIs requiring low latency.

- **Hard Account Lockout vs. Adaptive Rate Limiting with CAPTCHA:**
  - *Difference:* Hard lockout disables an account entirely after failed attempts. Adaptive rate limiting throttles requests by IP and introduces CAPTCHAs/progressive delays on the specific account identifier without locking legitimate users out.
  - *Rule:* Never use hard account lockouts on public authentication endpoints; use adaptive rate limiting with CAPTCHA challenges to mitigate credential stuffing without enabling DoS attacks.

- **Bcrypt vs. Argon2id:**
  - *Difference:* Bcrypt is a battle-tested, CPU-hard algorithm limited to 72-byte passwords. Argon2id is the modern winner of the Password Hashing Competition (PHC), providing configurable memory hardness and parallelism that resists GPU/ASIC cracking attacks.
  - *Rule:* Use Argon2id for all new production greenfield systems; maintain Bcrypt for legacy compatibility.

## 8. 🧠 The Memory Hook

> **The Blindfolded Bouncer with Two Badges:**
> A secure login API acts like a blindfolded bouncer: they take the exact same time to check every passport whether your name is on the list or not (constant-time dummy hashing), hand you a 15-minute disposable wristband for access (memory-only access token), and lock your permanent passport in a tamper-proof vault nobody outside can touch (`HttpOnly` refresh cookie).
