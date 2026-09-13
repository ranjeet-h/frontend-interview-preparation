# Designing Secure Logout APIs: Token Invalidation, Cookie Clearing, and Global Session Revocation

## 1. Why This Exists — The Problem First

A user logs into their banking or company dashboard on a shared terminal at a library or internet cafe. When they finish, they click "Log Out". The frontend clears the `accessToken` variable in memory, deletes the token string from `localStorage`, redirects to `/login`, and displays a toast message: "You have been logged out."

The user walks away. Ten seconds later, another person sits down at the exact same computer, opens the browser history or developer tools network tab, retrieves the JWT access token from the previous requests, and starts querying the backend API.

The API gateway receives the token, checks the cryptographic HMAC or RSA signature, verifies that the expiration timestamp has not passed, and happily returns confidential customer data. The backend had no idea a logout ever happened. Because the token was self-contained and stateless, deleting it from the client did nothing to destroy its validity in the eyes of the server.

Another common production breakdown happens with `HttpOnly` cookies. An engineering team stores refresh tokens inside secure `HttpOnly` cookies to protect them from cross-site scripting (XSS). When building the logout flow, a frontend engineer attempts to clear the cookie using client-side JavaScript: `document.cookie = "refreshToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT"`. Because the browser strictly forbids JavaScript from accessing `HttpOnly` cookies, the statement fails silently. The cookie remains completely intact in the browser jar, continuously sent on every subsequent request.

Finally, consider a security emergency: a user notices an unauthorized login from an unknown country and clicks "Log out of all devices." If the backend only deletes the local cookie on the current request and has no mechanism to revoke issued tokens across distributed services, the attacker's active session remains fully functional.

A secure logout API is not a simple UI redirect or client-side storage cleanup. It is an explicit, server-side revocation of trust across the browser, network, caching layer, and database.

## 2. The Analogy — Make It Obvious

Think of modern authentication like a hotel access system.

When you check into a hotel, the front desk creates a reservation record in their central computer database (the **Session / Refresh Token**). They hand you an electronic RFID room keycard with a built-in microchip programmed to open Room 402 until 11:00 AM tomorrow (the **Stateless JWT Access Token**).

The electronic lock on your hotel room door is offline; it does not query the front desk computer every time you tap the card. It simply reads the cryptographic signature and expiration timestamp programmed onto the card's chip. If the chip says "Valid for Room 402 until 11:00 AM" and the hotel's digital signature matches, the door unlocks instantly.

Now, imagine what happens during a naive "client-only logout": you drop your keycard into the hallway trash can. You personally no longer possess the keycard, but anyone who picks it up can walk right into Room 402 until 11:00 AM tomorrow.

Here is how a real hotel handles the three levels of checkout:

- **Single-Device Checkout:** You walk to the front desk and return your keycard. The clerk deletes your active reservation record from the central computer so no new keys can be issued, physically takes your card, and throws it in the shredder (**Clearing the HttpOnly Cookie**). Because your room door lock is offline, your short-lived keycard will naturally expire in a few minutes, after which no one can enter.
- **Emergency Room Re-keying / Global Logout ("Log out all devices"):** You lose your wallet and phone. You panic and call the front desk. The manager updates the master room configuration in the central system, advancing the room's lock epoch (**Token Versioning**). When any keycard is presented to an access checkpoint or when anyone asks for a renewed keycard, the system sees that the keycard belongs to the old version and refuses access immediately.
- **Targeted Device Revocation:** The hotel front desk dashboard shows three issued keycards: Key A (given to you), Key B (given to your spouse), and Key C (given to the repair technician). You tell the front desk: "Deactivate Key C for the technician." The clerk cancels the authorization record for Key C specifically, leaving Key A and Key B active.

## 3. How It Actually Works — The Full Explanation

Designing a robust logout architecture requires solving three distinct problems: handling the three types of logout workflows, invalidating stateless tokens without killing database performance, and properly commanding the browser to destroy stored credentials.

**The Three Types of Logout Architecture**

1. **Single-Device Logout:**
   The user clicks "Log Out" on their current browser or mobile app. The server invalidates the current device's refresh token/session record in the database or Redis, instructs the client browser to delete its cookies via HTTP response headers, and blacklists the current short-lived access token if immediate invalidation is required.
2. **Global Logout ("Log out of all devices"):**
   The user changes their password or clicks "Sign out everywhere" after a suspected breach. The system must invalidate every active refresh token and access token across every browser, phone, tablet, and smart TV associated with that user account.
3. **Targeted Device Logout (Session Management):**
   The user views a "Security & Active Sessions" dashboard listing every active device (for example: "Chrome on macOS - San Francisco", "iOS App - London"). The user can revoke access for an old phone without logging out of their current laptop. Each session has a unique `session_id` stored in the database or Redis that can be deleted individually.

```txt
┌─────────────────────────────────────────────────────────────────────────┐
│                        LOGOUT TOPOLOGY OVERVIEW                         │
├──────────────────────────────┬──────────────────────────────────────────┤
│ Single-Device Logout         │ DELETE /api/auth/sessions/current        │
│                              │ - Revokes current refresh token in Redis │
│                              │ - Sends Set-Cookie Max-Age=0             │
├──────────────────────────────┼──────────────────────────────────────────┤
│ Targeted Device Logout       │ DELETE /api/auth/sessions/:sessionId     │
│                              │ - Revokes specific session row by ID     │
│                              │ - Target device gets 401 on next refresh │
├──────────────────────────────┼──────────────────────────────────────────┤
│ Global Logout (All Devices)  │ POST /api/auth/logout-all                │
│                              │ - Increments user.token_version in DB    │
│                              │ - Deletes all session keys for user_id   │
│                              │ - Instantly invalidates all JWTs         │
└──────────────────────────────┴──────────────────────────────────────────┘
```

**The Dilemma of Stateless JWT Invalidation**

JWT access tokens are designed to be verified statelessly by checking their cryptographic signature using a public key or shared secret. By design, the verification does not query a central database. However, this means once a JWT is issued, it cannot be revoked before its `exp` (expiration) timestamp without adding a stateful check.

Production systems solve this dilemma using three complementary patterns:

1. **Short Access Token TTL (Defense in Depth):**
   Access tokens are given very short lifetimes (5 to 15 minutes), while refresh tokens live for days or weeks in a stateful store (PostgreSQL or Redis). When a single-device logout occurs, the server revokes the refresh token. The client can no longer obtain new access tokens, and the existing access token naturally dies within minutes. This limits the blast radius of a discarded token without requiring stateful lookups on every single read request.
2. **Redis Token Blocklist with JWT ID (`jti`):**
   When immediate, zero-delay revocation of an access token is required, every JWT is issued with a unique `jti` (JWT ID) UUID claim. Upon logout, the server extracts the `jti` and calculates the token's remaining lifetime: `remainingTTL = exp - currentTime`. The server writes `SETEX blocklist:<jti> <remainingTTL> "revoked"` into Redis.
   API gateways or protected routes check Redis (`EXISTS blocklist:<jti>`) during authentication. When the token's natural expiration time arrives, Redis automatically evicts the key, preventing unbounded memory growth.
3. **User-Level Token Versioning (Epoch Invalidation for Global Logout):**
   Instead of storing millions of individual blacklisted `jti` entries in Redis when performing a global logout, each user record in the database maintains an integer column: `token_version` (defaulting to `1`).
   When an access token is minted, the payload includes the claim `{ "userId": "123", "tokenVersion": 1 }`.
   When a user clicks "Log out of all devices" or changes their password, the database executes:
   ```sql
   UPDATE users SET token_version = token_version + 1 WHERE id = '123';
   ```
   The user's current `token_version` is cached in Redis. During JWT verification, if `token.tokenVersion !== cachedUser.tokenVersion`, the token is rejected immediately. One atomic integer increment revokes hundreds of outstanding tokens across all devices simultaneously.

**Proper HTTP Cookie Clearing Protocol**

Browsers store cookies in an isolated storage engine keyed by name, domain, and path. To delete a cookie, the server cannot send a "delete" command; instead, it sends a `Set-Cookie` response header with an expiration date in the past (`Thu, 01 Jan 1970 00:00:00 GMT`) or `Max-Age=0`.

For the browser to accept the deletion, all security attributes (`Path`, `Domain`, `Secure`, `SameSite`) must match the attributes used when the cookie was originally created:

```http
HTTP/1.1 200 OK
Content-Type: application/json
Set-Cookie: refreshToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Strict

{
  "success": true,
  "message": "Logged out successfully"
}
```

If the cookie was created with `Path=/` and the logout handler sends `Set-Cookie: refreshToken=; Path=/api/v1/auth`, the browser will create a new empty cookie for `/api/v1/auth` and leave the root cookie `/` completely untouched.

**HTTP Semantics, Idempotency, and CSRF**

- **Method:** Logout must use `POST` or `DELETE`, never `GET`. Modern browsers routinely prefetch links found on a page or predict user navigation from the address bar. If logout is a `GET` endpoint, a browser pre-fetching `<link rel="prefetch" href="/api/logout">` will log the user out without their knowledge.
- **Idempotency and Status Codes:** Logout must be idempotent and return `200 OK` (or `204 No Content`). If a user double-clicks the logout button, or if a user clicks logout when their session has already expired, the API must not return `401 Unauthorized`. The user's intended end state is "unauthenticated"; if they are already unauthenticated, the operation succeeded.
- **CSRF Protection:** If authentication relies on cookies, attackers can embed malicious scripts or forms on third-party sites that trigger logout requests against your application, creating a denial-of-service annoyance (Forced Logout Attack). Logout endpoints must validate anti-CSRF tokens or enforce `SameSite=Strict`/`Lax` with custom request header checks (`X-Requested-With` or `Origin` header validation).

## 4. Real Code — See It Working

Here is a complete, production-grade Express and TypeScript implementation illustrating single-device logout, global logout, targeted session revocation, and high-performance token verification using Redis and JWTs.

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

const JWT_SECRET = process.env.JWT_SECRET || 'super-secure-jwt-secret';
const REFRESH_COOKIE_NAME = 'refreshToken';

// Standard cookie options matching creation and deletion
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/', // Critical: must match across login and logout
};

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    sessionId: string;
    tokenVersion: number;
    jti: string;
    exp: number;
  };
}

// 1. Single-Device Logout: Revokes current session & blacklists current access token
export async function handleLogout(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    // If an authenticated context exists, clean up server-side state
    if (user) {
      // Revoke the specific session associated with this refresh token
      await redisClient.del(`session:${user.userId}:${user.sessionId}`);

      // Blacklist the access token's JTI for its remaining lifetime
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const remainingTTL = user.exp - nowInSeconds;
      if (remainingTTL > 0) {
        await redisClient.setEx(`blacklist:${user.jti}`, remainingTTL, 'revoked');
      }
    } else if (refreshToken) {
      // If access token was expired but refresh cookie exists, parse and revoke session
      try {
        const decoded = jwt.decode(refreshToken) as { userId?: string; sessionId?: string };
        if (decoded?.userId && decoded?.sessionId) {
          await redisClient.del(`session:${decoded.userId}:${decoded.sessionId}`);
        }
      } catch {
        // Ignore malformed token during logout
      }
    }

    // Always clear the cookie by setting an expiration date in the past
    res.cookie(REFRESH_COOKIE_NAME, '', {
      ...COOKIE_OPTIONS,
      expires: new Date(0),
      maxAge: 0,
    });

    // Idempotent: Always return 200 OK
    res.status(200).json({
      success: true,
      message: 'Logged out successfully from current device',
    });
  } catch (error) {
    console.error('Logout error:', error);
    // Even on server error, clear the client cookie to allow recovery
    res.cookie(REFRESH_COOKIE_NAME, '', {
      ...COOKIE_OPTIONS,
      expires: new Date(0),
      maxAge: 0,
    });
    res.status(500).json({ success: false, message: 'Internal server error during logout' });
  }
}

// 2. Global Logout: Increments user token_version and deletes all active sessions
export async function handleLogoutAllDevices(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required for global logout' });
      return;
    }

    // Atomically increment user token_version in cache / database
    // This immediately invalidates ALL access tokens carrying older versions
    const newVersion = await redisClient.incr(`user_token_version:${user.userId}`);

    // In production, also persist to primary SQL database:
    // await db.query('UPDATE users SET token_version = $1 WHERE id = $2', [newVersion, user.userId]);

    // Find and delete all session keys for this user
    const userSessionKeys = await redisClient.keys(`session:${user.userId}:*`);
    if (userSessionKeys.length > 0) {
      await redisClient.del(userSessionKeys);
    }

    // Clear local browser cookie
    res.cookie(REFRESH_COOKIE_NAME, '', {
      ...COOKIE_OPTIONS,
      expires: new Date(0),
      maxAge: 0,
    });

    res.status(200).json({
      success: true,
      message: 'All active sessions and tokens have been revoked successfully',
      tokenVersion: newVersion,
    });
  } catch (error) {
    console.error('Global logout error:', error);
    res.status(500).json({ success: false, message: 'Failed to revoke all sessions' });
  }
}

// 3. Targeted Device Logout: Revoke a specific session ID
export async function handleRevokeSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    const { sessionId } = req.params;

    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Security check: Ensure the user owns this session
    const sessionKey = `session:${user.userId}:${sessionId}`;
    const exists = await redisClient.exists(sessionKey);

    if (!exists) {
      // Idempotent: If it's already gone, treat as successful deletion
      res.status(200).json({ success: true, message: 'Session revoked or already inactive' });
      return;
    }

    await redisClient.del(sessionKey);

    // If the user revoked their own CURRENT session, clear their cookie as well
    if (user.sessionId === sessionId) {
      res.cookie(REFRESH_COOKIE_NAME, '', {
        ...COOKIE_OPTIONS,
        expires: new Date(0),
        maxAge: 0,
      });
    }

    res.status(200).json({
      success: true,
      message: `Session ${sessionId} successfully revoked`,
    });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ success: false, message: 'Failed to revoke targeted session' });
  }
}

// 4. Token Verification Middleware: Checks signature, token_version, and JTI blocklist
export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    res.status(401).json({ success: false, message: 'Missing access token' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      sessionId: string;
      tokenVersion: number;
      jti: string;
      exp: number;
    };

    // Fast Check 1: Is this specific JTI blacklisted in Redis?
    const isBlacklisted = await redisClient.exists(`blacklist:${decoded.jti}`);
    if (isBlacklisted) {
      res.status(401).json({ success: false, message: 'Token has been revoked' });
      return;
    }

    // Fast Check 2: Does the token version match current user version in Redis?
    const currentVersionStr = await redisClient.get(`user_token_version:${decoded.userId}`);
    const currentVersion = currentVersionStr ? parseInt(currentVersionStr, 10) : 1;

    if (decoded.tokenVersion < currentVersion) {
      res.status(401).json({ success: false, message: 'Session expired due to global logout or password reset' });
      return;
    }

    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid or expired access token' });
  }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why can't you just delete the token from frontend localStorage or memory and consider the user logged out?**

Deleting a token on the client side only stops that specific frontend instance from sending the token on future requests. It does nothing to invalidate the token itself. 

If the token is stored in `localStorage`, any script, browser extension, or person with physical access to the device can copy the string before deletion or recover it from browser process memory or network cache. Because JWTs are cryptographically self-contained, any server receiving that token will continue to honor it until its `exp` timestamp passes. 

Furthermore, if the application uses `HttpOnly` cookies, JavaScript cannot delete them at all. A genuine logout requires a network handshake with the server to revoke the server-side refresh token/session record, push the access token's `jti` to an ephemeral blocklist, and send an explicit `Set-Cookie` header instructing the browser's networking stack to delete the cookie jar entry.

**Q: How do you handle logout when using stateless JWT access tokens without querying the database on every single API request?**

There are three architectural layers used together:

1. **Short Access Token Lifespan (5–15 minutes):** We keep the access token valid for only a few minutes. Single-device logout immediately deletes the stateful refresh token stored in Redis or the database. Once the refresh token is dead, the client cannot refresh its session, and the access token naturally dies within minutes. For 95% of standard web applications, this acceptable time window eliminates the need for per-request database queries.
2. **Redis Ephemeral JTI Blacklist (for immediate revocation):** If instant revocation is mandatory for high-security endpoints (like payments or administrative actions), we store the access token's unique `jti` in Redis with an exact TTL equal to the token's remaining lifespan (`exp - now`). Checking Redis via an in-memory `EXISTS` command takes under 0.5 milliseconds, keeping gateway latency near zero while allowing Redis to auto-evict the key the moment the token expires.
3. **Token Version Epochs (for global logout):** For revoking all devices, each user has a `token_version` integer in their cached profile. When the user logs out globally, we increment this version by one. Any token carrying an older `token_version` in its decrypted payload is rejected immediately.

**Q: Why must the logout endpoint use POST or DELETE instead of GET?**

HTTP `GET` requests are defined by the RFC 7231 standard to be "safe" and "idempotent" — meaning they must only retrieve data without changing server state. 

If logout is exposed via `GET /api/logout`:
- Modern web browsers pre-fetch links in the background when a user hovers over a button, when typing in the address bar, or during DNS pre-resolution. A pre-fetch request will silently log the user out.
- Web crawlers, search engine indexers, and antivirus URL scanners routinely follow `GET` links found in web pages or email links, triggering unexpected logouts.
- `GET` requests are cached by browser caches, intermediate proxies, and CDNs. A cached `GET /logout` response can cause weird client bugs where future requests are blocked or swallowed.

State-changing operations must always use `POST` or `DELETE`.

**Q: What HTTP status code should the logout endpoint return if the user's token is already expired or missing?**

The logout endpoint must return `200 OK` (or `204 No Content`), never `401 Unauthorized`.

Logout is designed to transition the client from "potentially authenticated" to "unauthenticated". If a user opens a laptop after two weeks of sleep, their tokens are already expired. If clicking "Log Out" returns a `401 Unauthorized` error, naive frontend error handlers will intercept the response, display an error popup ("Session expired, please log in"), fail to clear local application state, and trap the user in a broken UI state. 

Because the desired end-state ("the user is not logged in") is already satisfied, the operation is a complete success. The backend should clear the cookie headers and return `200 OK` unconditionally.

**Q: How do you implement "Log out of all devices" efficiently for a system with 50 million active users?**

Storing individual blacklisted tokens for 50 million users would quickly overwhelm Redis memory and create massive database write contention.

The industry standard pattern is **User Token Versioning (Epoch Invalidation)**:
1. Every user row in PostgreSQL/MySQL has an integer column `token_version INT DEFAULT 1`.
2. When any access token is generated, the payload embeds `{ "userId": 42, "tokenVersion": 1 }`.
3. The current `token_version` is cached in a distributed cache (Redis) under the key `user:42:token_version`.
4. When the user triggers "Log out of all devices", the server runs an atomic update:
   `UPDATE users SET token_version = token_version + 1 WHERE id = 42;`
   and updates the Redis cache value.
5. In addition, the server executes a single batch delete for all stateful session records:
   `DELETE FROM user_sessions WHERE user_id = 42;`
6. When the user's other devices make API requests, the gateway checks the token's embedded `tokenVersion` against the cached version. Because the token has version `1` and the cache has version `2`, every device is instantly rejected without needing to store individual token IDs.

**Q: Why does the logout endpoint require CSRF protection if all it does is terminate a session?**

Without CSRF protection, an attacker can construct a malicious web page with an auto-submitting form or cross-origin script targeting `https://yourbank.com/api/auth/logout`.

When a victim visits the attacker's page while logged into their bank, the victim's browser automatically attaches their `HttpOnly` session cookies to the cross-origin request. The bank's server processes the request, revokes the user's active session, and logs them out.

While this does not expose user data, it is a well-known Denial of Service vulnerability called a **Forced Logout Attack**. Attackers use it to repeatedly kick users out of real-time trading dashboards, auctions, collaborative document editing sessions, or checkout flows. Protecting logout endpoints with CSRF tokens or requiring custom non-simple HTTP headers (such as `X-Requested-With` or `Content-Type: application/json` validated against `SameSite=Strict`/`Lax`) prevents cross-origin sites from triggering unwanted logouts.

**Q: How do you clear an HttpOnly cookie during logout, and what causes the silent bug where cookies fail to clear?**

Because JavaScript running in the browser cannot read or modify cookies marked with the `HttpOnly` flag, the server must instruct the browser to delete the cookie via the `Set-Cookie` HTTP response header.

The server does this by returning the cookie with an expiration date in the past (`Expires=Thu, 01 Jan 1970 00:00:00 GMT`) or with `Max-Age=0`.

The notorious production bug where cookies fail to delete occurs because the browser treats cookies as unique tuples of `(Name, Domain, Path)`. If the cookie was originally set with:
`Set-Cookie: refreshToken=abc; Path=/; Domain=api.example.com; HttpOnly; Secure`
but the logout endpoint attempts to clear it with:
`Set-Cookie: refreshToken=; Path=/auth; HttpOnly` (missing the root Path or Domain),
the browser will interpret this as a directive to create a brand-new, empty cookie for `/auth` while leaving the original cookie for `Path=/` completely intact. To guarantee deletion, every attribute (`Path`, `Domain`, `Secure`, `SameSite`) on the deletion header must exactly mirror the attributes used at creation.

## 6. The Traps — What Goes Wrong

**Trap 1: The Subpath Cookie Mismatch**

A backend application sets the authentication cookie during login using a global middleware:
```typescript
res.cookie('refreshToken', token, { path: '/', httpOnly: true });
```
Later, the logout handler is placed inside a sub-router mounted at `/api/v1/auth/logout`. The developer calls Express's built-in helper without specifying the path:
```typescript
res.clearCookie('refreshToken'); // Defaults to path: '/api/v1/auth'
```
The browser receives `Set-Cookie: refreshToken=; Path=/api/v1/auth`. The original cookie at `Path=/` is never deleted. Every future request from the frontend still includes the original `refreshToken`. The user appears permanently logged in.

*The Fix:* Always define a single, shared configuration constant for cookie options and reuse it across both `res.cookie()` and `res.clearCookie()`.

**Trap 2: Returning 401 Unauthorized When Logging Out an Expired Session**

A developer writes an authentication guard middleware that runs on all endpoints, including logout:
```typescript
app.post('/api/logout', requireAuthMiddleware, logoutHandler);
```
If a user closes their laptop for two days and opens it again, their access token has expired. They click the "Log Out" button to switch accounts. The `requireAuthMiddleware` intercepts the request, detects the expired token, and immediately aborts with `HTTP 401 Unauthorized`.

The frontend code never reaches `logoutHandler`, the cookie is never cleared, and the frontend error listener displays an error alert. The user is stuck in a loop where they cannot log out because their session is invalid.

*The Fix:* The logout endpoint should either bypass strict authentication guards or use an optional authentication middleware that catches expired tokens, extracts whatever user metadata is available, clears the cookies, and returns `200 OK`.

**Trap 3: Unbounded Memory Leaks in Redis Token Blacklists**

When implementing a token blocklist for immediate JWT revocation, a developer writes the revoked `jti` to Redis:
```typescript
await redisClient.set(`blacklist:${jti}`, 'revoked'); // Missing TTL!
```
Every time a user logs out, a new key is added to Redis without an expiration time. Over months of operation across millions of logins and logouts, Redis memory usage grows monotonically until the server crashes with an Out Of Memory (OOM) error.

*The Fix:* Calculate the exact remaining lifetime of the token (`token.exp - Math.floor(Date.now() / 1000)`) and use `SETEX` or `setEx` with that TTL. Once the token passes its natural expiration date, it cannot be accepted anyway, so Redis can safely evict it automatically.

**Trap 4: Client-Side Token Cleanup Without Awaiting the Server Response**

A frontend developer implements a logout button with this sequence:
```typescript
function handleLogout() {
  localStorage.removeItem('accessToken');
  authStore.setUser(null);
  router.push('/login');
  fetch('/api/logout', { method: 'POST' }); // Fire and forget!
}
```
Because the network call is not awaited, if the user immediately closes the browser tab or navigates away, the browser cancels the inflight `fetch` request. The server never receives the logout command, the refresh token remains active in the database, and any attacker who intercepts the refresh token can continue generating sessions.

*The Fix:* Always await the server response or use `navigator.sendBeacon()` / `fetch` with `keepalive: true` to guarantee the revocation reaches the backend even if the page unloads immediately:
```typescript
await fetch('/api/logout', { method: 'POST', keepalive: true });
```

## 7. Compare With Related Concepts

**Stateless JWT Revocation vs. Stateful Session Store**

| Dimension | Stateless JWT Invalidation | Stateful Session Store (Redis / DB) |
|---|---|---|
| **Storage Location** | Ephemeral Redis Blocklist (`jti`) or Token Version Epoch | Centralized `sessions` table in Redis or PostgreSQL |
| **Verification Cost** | Zero DB queries for regular requests; fast Redis lookup if using blocklist | 1 DB/cache query on every single authenticated request |
| **Instant Revocation** | Requires checking Redis blocklist or comparing token version claim | Immediate: simply delete the session record from the store |
| **Scalability** | Massive horizontal scale with microservices | Requires fast caching layer (Redis cluster) at high QPS |
| **Best Used For** | Distributed microservices, public APIs, high-throughput systems | Monolithic applications, traditional web apps, banking dashboards |

**Single-Device Logout vs. Global Logout vs. Targeted Revocation**

| Level | What Is Revoked | Mechanism | Impact on Other Devices |
|---|---|---|---|
| **Single-Device** | Current device's refresh token and cookie | Deletes specific refresh token in DB, clears browser cookie | Other devices remain completely unaffected |
| **Global Logout** | All tokens and sessions for the user account | Increments user `token_version`, purges all session rows | Every laptop, phone, and tablet is forced to re-authenticate |
| **Targeted Device** | One specific remote device chosen by user | Deletes targeted `session_id` from database/Redis | Only the chosen device receives a 401 on next refresh |

**Cookie Storage (`HttpOnly`) vs. `localStorage` Token Storage**

| Property | `HttpOnly; Secure; SameSite=Strict` Cookie | `localStorage` Storage |
|---|---|---|
| **XSS Vulnerability** | Immune: JavaScript cannot read or steal the token | High Risk: Any injected script can read `localStorage.getItem()` |
| **CSRF Vulnerability** | Requires `SameSite` configuration or anti-CSRF tokens | Immune to standard CSRF (must be explicitly attached in header) |
| **Logout Mechanism** | Server must return `Set-Cookie: ... Max-Age=0` | Client executes `localStorage.removeItem('token')` |
| **Multi-Domain / Native Mobile** | Difficult across different parent domains | Trivial: mobile apps easily send Bearer tokens in headers |

## 8. 🧠 The Memory Hook

> **A client can discard a key, but only the server can change the locks.**
>
> True logout is never just clearing `localStorage` or wiping memory; it is a three-way handshake: the server destroys the refresh record, updates the lock version, and commands the browser to overwrite its cookies with dates from 1970.
