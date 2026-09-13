# Designing Refresh Token APIs: Rotation Mechanics, Cookie Security, and Breach Detection

## 1. Why This Exists — The Problem First

Imagine you build an authentication system where access tokens are standard stateless JSON Web Tokens (JWTs) valid for 30 days so users never get annoyed by login prompts. One afternoon, a third-party npm package in your frontend bundle gets compromised, injecting an XSS payload that reads the token from `localStorage` and exfiltrates it to an attacker's server. Because your JWTs are stateless and verified purely by cryptographic signature without querying a database, the attacker now owns that user's identity for a full month. You cannot revoke the token without writing expensive global blacklist lookups into Redis for every single API request across your entire fleet, destroying the performance benefits of stateless JWTs.

If you react by shortening token lifetimes to 10 minutes, your users get abruptly kicked out in the middle of writing a form or completing a checkout unless you introduce an automated background renewal mechanism.

This creates a fundamental dilemma: how do you maintain short-lived access credentials without disrupting the user experience, while ensuring that the renewal credential itself cannot be stolen, reused, or replayed indefinitely? Simply issuing a permanent refresh token stored in `localStorage` fails because XSS extracts it just as easily. Moreover, if your backend blindly rotates refresh tokens without handling concurrency, opening four browser tabs simultaneously triggers a race condition where parallel refresh requests invalidate each other, falsely flagging the session as hacked and kicking the legitimate user out. 

The Refresh Token API pattern with **Refresh Token Rotation (RTR)**, **Token Families**, **HttpOnly Cookie Isolation**, and **Concurrency Grace Windows** exists to solve this exact set of security and distributed state challenges.

---

## 2. The Analogy — Make It Obvious

Think of an office building with a strict security protocol:

```txt
┌─────────────────────────────────────────────────────────────────────────┐
│                        THE EMBASSY PASS SYSTEM                          │
├────────────────────────────────┬────────────────────────────────────────┤
│ Real World                     │ Authentication Architecture            │
├────────────────────────────────┼────────────────────────────────────────┤
│ 15-Minute Visitor Badge        │ Short-Lived Access Token (JWT)         │
│ Serialized Keycard in Briefcase│ Refresh Token in HttpOnly Cookie       │
│ Badge Desk Keycard Exchange    │ POST /api/v1/auth/refresh              │
│ Destroying Old Card & Issuing  │ Refresh Token Rotation (RTR)           │
│ Card Lineage & Security Alarm  │ Token Family & Replay Breach Detection │
│ Courier Grace Window           │ Concurrency Jitter Window (5-10s)      │
└────────────────────────────────┴────────────────────────────────────────┘
```

1. **The 15-Minute Visitor Badge (Access Token):** When you enter the building, security gives you a colored paper badge stamped with an expiration time 15 minutes away. Guards stationed outside meeting rooms only look at the badge's stamp. They do not call central dispatch or check a database. If someone steals your badge, they can roam for at most 15 minutes before guards turn them away.
2. **The Armored Briefcase (HttpOnly Cookie):** To stay in the building past 15 minutes, you carry a metal keycard inside a locked briefcase that only the security desk has the key to open. You cannot open it, and pickpockets in the hallway (JavaScript XSS scripts) cannot reach inside it.
3. **The Keycard Exchange (Refresh Token Rotation):** When your paper badge is about to expire, you walk to the central security desk. The clerk takes your old keycard (Card #1), runs it through a shredder, hands you a new keycard (Card #2), and gives you a fresh 15-minute paper badge.
4. **The Security Tripwire (Token Family & Breach Detection):** Every keycard belongs to a tracked lineage (Family `F-100`: Card #1 $\rightarrow$ Card #2 $\rightarrow$ Card #3). If an attacker intercepted a clone of Card #1 before you shredded it and tries to use Card #1 twenty minutes later, the clerk checks the ledger and sees: *"Card #1 was already retired at 10:00 AM and replaced by Card #2."* The clerk immediately triggers the building-wide lockdown alarm, revoking every single card in Family `F-100`. Both you and the attacker are locked out, and you must verify your government ID (password + MFA) to enter again.
5. **The Courier Grace Window (Jitter Allowance):** If you send three team members to the desk within 5 seconds of each other holding Card #1 because your team split up right before the badge expired, the clerk recognizes the brief 5-second handoff window, provides the new badge, and returns Card #2 without triggering the security alarm.

---

## 3. How It Actually Works — The Full Explanation

Designing a production-grade Refresh Token API requires coordinating cryptographic token design, state storage, browser cookie security policies, and concurrency control.

```txt
Browser (Client SPA)                      API Gateway / Server                   Database / Redis
        │                                          │                                     │
        │── 1. POST /api/v1/auth/refresh ─────────>│                                     │
        │      (Cookie: refresh_token=RT_1)        │── 2. SHA-256 Hash RT_1 ────────────>│
        │                                          │   Lookup Token Record               │
        │                                          │<── Return Token State ──────────────│
        │                                          │                                     │
        │                                          │── 3. Evaluate State:                │
        │                                          │      a) Revoked/Replayed?           │
        │                                          │         -> REVOKE FAMILY & 401      │
        │                                          │      b) Expired?                    │
        │                                          │         -> Return 401               │
        │                                          │      c) Valid?                      │
        │                                          │         -> Rotate & Issue new pair  │
        │                                          │                                     │
        │                                          │── 4. Atomic Update: ───────────────>│
        │                                          │      Mark RT_1 as rotated           │
        │                                          │      Store RT_2 (Family F-100)      │
        │                                          │<── Commit Transaction ──────────────│
        │                                          │                                     │
        │<── 5. Response 200 OK ───────────────────│                                     │
        │       Body: { accessToken: AT_2 }        │                                     │
        │       Set-Cookie: refresh_token=RT_2;    │                                     │
        │                   HttpOnly; Secure;      │                                     │
        │                   SameSite=Strict;       │                                     │
        │                   Path=/api/v1/auth/refresh                                    │
```

### The Dual-Token Architecture

A secure authentication system splits responsibilities between two distinct token types:

| Characteristic | Access Token | Refresh Token |
|---|---|---|
| **Primary Purpose** | Authorizes API requests | Obtains fresh access tokens |
| **Lifetime** | Short (5–15 minutes) | Long (7–30 days) |
| **State Storage** | Stateless (Self-contained JWT) | Stateful (Hashed in DB or Redis) |
| **Validation** | Fast local cryptographic signature check | Database lookup + revocation status check |
| **Storage Location** | Client memory (JavaScript variable / closure) | `HttpOnly`, `Secure`, `SameSite` Cookie |
| **Network Path** | Sent in `Authorization: Bearer <token>` on every API call | Sent exclusively to `POST /api/v1/auth/refresh` |

### Refresh Token Rotation (RTR)

In traditional static refresh token systems, a refresh token lasts 30 days and is reused repeatedly until it expires. If stolen, the attacker maintains access for up to 30 days undetected.

With **Refresh Token Rotation**, every single call to `/api/v1/auth/refresh` consumes the presented token and issues a brand-new token pair:
1. Client sends `RT_1`.
2. Server validates `RT_1`.
3. Server invalidates `RT_1` in the database.
4. Server generates `AT_2` (new access token) and `RT_2` (new refresh token).
5. Server writes `RT_2` to the database, marking it as the direct successor of `RT_1`.
6. Server sends `AT_2` in the JSON response body and `RT_2` in a replacement `Set-Cookie` header.

### Token Families & Breach Detection

A **Token Family** is a cryptographically linked lineage of tokens originating from an initial primary login (username/password or OAuth). 

When a refresh token is used, it is not immediately deleted; it is marked as `is_used = true` or `rotated_at = NOW()`, linked to its successor `replaced_by_token_id`.

If an attacker steals `RT_1`, two scenarios can occur:

```txt
SCENARIO A: Attacker refreshes before the legitimate user
1. Attacker presents RT_1 -> Server issues AT_attacker + RT_2. (RT_1 marked used).
2. Legitimate user presents RT_1 -> Server detects RT_1 is ALREADY USED.
3. BREACH DETECTED -> Server revokes Family F-100 (invalidating RT_2).
4. Both attacker and user are locked out on next request.

SCENARIO B: Legitimate user refreshes before the attacker
1. Legitimate user presents RT_1 -> Server issues AT_2 + RT_2. (RT_1 marked used).
2. Attacker presents stolen RT_1 -> Server detects RT_1 is ALREADY USED.
3. BREACH DETECTED -> Server revokes Family F-100 (invalidating RT_2).
4. Both attacker and user are locked out on next request.
```

In both cases, reuse of an invalidated refresh token acts as a high-fidelity tripwire. The server immediately revokes all tokens belonging to `family_id`, logs a security alert, and requires the user to re-authenticate with primary credentials.

### Transport Security & Cookie Flags

Storing the refresh token in `localStorage` or `sessionStorage` exposes it to cross-site scripting (XSS). Any rogue third-party script, injected ad, or compromised dependency can execute `localStorage.getItem('refreshToken')`.

To eliminate this vector, refresh tokens must be transported exclusively via HTTP cookies configured with strict flags:

- `HttpOnly`: Prevents client-side scripts from reading the cookie via `document.cookie`.
- `Secure`: Ensures the browser sends the cookie only over encrypted HTTPS connections (preventing man-in-the-middle sniffing).
- `SameSite=Strict` (or `SameSite=Lax`): Instructs the browser not to send the cookie on cross-site requests, neutralizing Cross-Site Request Forgery (CSRF).
- `Path=/api/v1/auth/refresh`: Restricts cookie transmission **only** to the refresh endpoint. The browser will not attach the refresh token cookie when fetching images, profile data, or standard API routes, reducing bandwidth overhead and minimizing exposure.

### Concurrency Grace Period (The Jitter Window)

In modern Single Page Applications (React, Vue, Angular), a dashboard page frequently fires multiple API calls in parallel on mount:

```js
// Three simultaneous requests on page load
Promise.all([
  fetchUserDashboard(),
  fetchNotifications(),
  fetchAccountBalance()
]);
```

If the access token is expired, all three requests receive a `401 Unauthorized` at almost the exact same millisecond and attempt to call `/api/v1/auth/refresh`.

Without concurrency protection:
1. Request #1 arrives with `RT_1`. Server rotates `RT_1` to `RT_2`.
2. Request #2 arrives 30ms later with `RT_1` (since it was dispatched before Request #1 finished).
3. Server sees `RT_1` has already been rotated, flags a security breach, revokes the entire token family, and logs the user out.

To solve this, the server implements a **Grace Period / Leeway Window** (typically 5 to 10 seconds):
- When `RT_1` is rotated, the server records `rotated_at = NOW()` and caches `(AT_2, RT_2)`.
- If another request arrives with `RT_1` within the 10-second window, the server recognizes it as a concurrent in-flight race, does **not** trigger breach detection, and returns the already-generated `(AT_2, RT_2)` pair.
- Any request presenting `RT_1` after the 10-second window has expired is classified as a genuine token replay breach.

---

## 4. Real Code — See It Working

Here is a complete, production-grade implementation of a Refresh Token API in Node.js/Express with TypeScript, coupled with a resilient frontend request interceptor.

### Server Implementation: Token Service & Route Handler

```typescript
import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// In-memory representation of database entity
interface RefreshTokenRecord {
  id: string;
  tokenHash: string;
  userId: string;
  familyId: string;
  isRevoked: boolean;
  rotatedAt: Date | null;
  replacedByTokenId: string | null;
  cachedAccessToken?: string;
  cachedRefreshToken?: string;
  expiresAt: Date;
  createdAt: Date;
}

// Mock Database Store
const tokenDatabase = new Map<string, RefreshTokenRecord>();

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'access-secret-key-123';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const GRACE_PERIOD_MS = 10 * 1000; // 10-second concurrency tolerance

function hashToken(rawToken: string): string {
  // Store SHA-256 hash in DB so a database leak does not expose valid tokens
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateSecureRandomToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

export async function handleRefreshToken(req: Request, res: Response): Promise<void> {
  const rawRefreshToken = req.cookies?.refresh_token;

  if (!rawRefreshToken) {
    res.status(401).json({
      success: false,
      error: { code: 'MISSING_REFRESH_TOKEN', message: 'No refresh token provided in cookie.' }
    });
    return;
  }

  const incomingHash = hashToken(rawRefreshToken);
  
  // Find token record by hash
  let foundRecord: RefreshTokenRecord | undefined;
  for (const record of tokenDatabase.values()) {
    if (record.tokenHash === incomingHash) {
      foundRecord = record;
      break;
    }
  }

  // 1. Token doesn't exist at all
  if (!foundRecord) {
    res.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Refresh token not recognized.' }
    });
    return;
  }

  // 2. Token is explicitly revoked or its family was previously nuked
  if (foundRecord.isRevoked) {
    res.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
    res.status(401).json({
      success: false,
      error: { code: 'TOKEN_REVOKED', message: 'Session has been terminated.' }
    });
    return;
  }

  const now = new Date();

  // 3. BREACH DETECTION: Token was already rotated in the past
  if (foundRecord.rotatedAt !== null) {
    const timeSinceRotation = now.getTime() - foundRecord.rotatedAt.getTime();

    // Check if within the concurrent jitter grace window
    if (timeSinceRotation <= GRACE_PERIOD_MS && foundRecord.cachedAccessToken && foundRecord.cachedRefreshToken) {
      // Benign race condition: Return the cached token pair from the earlier rotation
      res.cookie('refresh_token', foundRecord.cachedRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth/refresh',
        maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      });

      res.status(200).json({
        success: true,
        data: {
          accessToken: foundRecord.cachedAccessToken,
          expiresIn: 900 // 15 minutes in seconds
        }
      });
      return;
    }

    // Beyond grace period: This is a REPLAY ATTACK
    // Invalidate the ENTIRE token family
    for (const record of tokenDatabase.values()) {
      if (record.familyId === foundRecord.familyId) {
        record.isRevoked = true;
      }
    }

    res.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
    res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_REUSE_DETECTED',
        message: 'Security breach detected. All active sessions for this lineage have been revoked.'
      }
    });
    return;
  }

  // 4. Token expired naturally
  if (foundRecord.expiresAt < now) {
    foundRecord.isRevoked = true;
    res.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
    res.status(401).json({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Refresh token expired. Please log in again.' }
    });
    return;
  }

  // 5. HAPPY PATH: Rotate token atomically
  const newRawRefreshToken = generateSecureRandomToken();
  const newHash = hashToken(newRawRefreshToken);
  const newAccessToken = jwt.sign(
    { userId: foundRecord.userId },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const newRecordId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Create child token in the same family
  const newRecord: RefreshTokenRecord = {
    id: newRecordId,
    tokenHash: newHash,
    userId: foundRecord.userId,
    familyId: foundRecord.familyId,
    isRevoked: false,
    rotatedAt: null,
    replacedByTokenId: null,
    expiresAt,
    createdAt: now
  };
  tokenDatabase.set(newRecordId, newRecord);

  // Mark old token as rotated and cache child tokens for grace period
  foundRecord.rotatedAt = now;
  foundRecord.replacedByTokenId = newRecordId;
  foundRecord.cachedAccessToken = newAccessToken;
  foundRecord.cachedRefreshToken = newRawRefreshToken;

  // Send new refresh token in HttpOnly cookie
  res.cookie('refresh_token', newRawRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth/refresh',
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  });

  // Return new access token in response body
  res.status(200).json({
    success: true,
    data: {
      accessToken: newAccessToken,
      expiresIn: 900
    }
  });
}
```

### Client Implementation: Frontend Mutex & Axios Refresh Interceptor

Even with a backend grace period, a well-architected frontend should prevent unnecessary duplicate refresh requests by queuing concurrent 401s behind a single in-flight refresh promise.

```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true // Crucial: allows sending cookies on cross-origin requests
});

let inMemoryAccessToken: string | null = null;
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

export function setAccessToken(token: string | null) {
  inMemoryAccessToken = token;
}

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else if (token) {
      promise.resolve(token);
    }
  });
  failedQueue = [];
};

// Request Interceptor: Attach Access Token from memory
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (inMemoryAccessToken && config.headers) {
    config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
  }
  return config;
});

// Response Interceptor: Handle 401 and serialize Refresh calls
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If 401 is received and not already retried
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // Avoid infinite loop if refresh endpoint itself returns 401
      if (originalRequest.url?.includes('/auth/refresh')) {
        setAccessToken(null);
        window.location.href = '/login';
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (isRefreshing) {
        // Queue this request until the current refresh call completes
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((newAccessToken) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          }
          return apiClient(originalRequest);
        });
      }

      isRefreshing = true;

      try {
        // Cookie containing refresh_token is automatically sent by browser
        const response = await axios.post<{
          success: boolean;
          data: { accessToken: string; expiresIn: number };
        }>('/api/v1/auth/refresh', {}, { withCredentials: true });

        const { accessToken } = response.data.data;
        setAccessToken(accessToken);

        processQueue(null, accessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        setAccessToken(null);
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
```

---

## 5. The Interview Questions — All of Them, Done Properly

### **Q: Why not store refresh tokens in localStorage alongside access tokens?**
Storing refresh tokens in `localStorage` leaves them completely unprotected against Cross-Site Scripting (XSS). Any injected JavaScript—whether via an unsanitized rich-text input, a compromised third-party CDN script, or a malicious dependency—can execute `window.localStorage.getItem('refreshToken')` and exfiltrate the credential. 

By contrast, setting the refresh token in a cookie with the `HttpOnly` flag guarantees that the browser's JavaScript engine cannot access the cookie under any circumstances. Even if an attacker executes arbitrary JavaScript on your page, they cannot read the refresh token.

---

### **Q: How does Refresh Token Rotation (RTR) actually detect token theft?**
Rotation forces the token to change on every use. Because both the legitimate user and the attacker require new access tokens when the short-lived token expires, they are forced to use their copy of the refresh token.

This creates a state synchronization conflict:
1. If the **attacker refreshes first**, they receive a new token pair. The token in the victim's browser is now marked as "used/rotated" in the database. When the victim's client inevitably attempts to refresh, the server detects that an already-used token is being presented.
2. If the **victim refreshes first**, the attacker's stolen token is marked as "used". When the attacker tries to refresh, the server catches the reuse immediately.

In either sequence, the server detects that one token was used more than once. Because the server cannot know which party is the real user, it immediately revokes the **entire token family** (all descendants of that login session), terminates all sessions, and forces a full re-authentication.

---

### **Q: How do you solve the race condition when multiple tabs or concurrent API calls refresh simultaneously?**
A robust solution applies defenses on both client and server:

1. **Client-Side Request Locking (Mutex):** The frontend interceptor maintains a boolean flag (`isRefreshing`) and a promise queue. When the first 401 triggers a refresh, subsequent 401s from parallel calls or other tabs are paused and pushed into a waiting array. Once the single refresh resolves, all queued requests are executed with the new access token.
2. **Server-Side Grace Window:** Because multiple browser tabs or rapid mobile network reconnects can still bypass frontend locking, the server stores `rotatedAt` on the retired token. If an already-rotated token arrives within a 5-to-10-second grace window, the server returns the cached new tokens instead of triggering breach detection. Any presentation after the grace window triggers family revocation.

---

### **Q: Why should access tokens be short-lived (5–15 minutes) while refresh tokens are long-lived (7–30 days)?**
Access tokens are designed for high-throughput, low-latency authorization across distributed microservices. To achieve zero database overhead, microservices verify access tokens statelessly using public-key cryptography (RS256/EdDSA) or shared secrets (HS256). The downside of statelessness is that revoking an access token immediately across dozens of services is difficult without querying a central cache. Short lifetimes (e.g., 10 minutes) ensure that if an access token is leaked, the attacker's window of opportunity is strictly bounded to minutes.

The refresh token exists to provide user convenience (avoiding logins for 30 days) while keeping stateful control in the database. Because refresh calls only happen once every 10–15 minutes rather than on every API request, the database query overhead of validating and rotating refresh tokens is negligible.

---

### **Q: How do you handle "Logout from This Device" vs. "Logout from All Devices"?**
- **Logout This Device:** The client calls `POST /api/v1/auth/logout`. The server marks the specific `familyId` associated with the current refresh token as `isRevoked = true` in the database and clears the `HttpOnly` cookie via `Set-Cookie: refresh_token=; Max-Age=0`. The access token in memory is discarded.
- **Logout All Devices:** The server marks all `familyId` records belonging to that `userId` as revoked. To immediately invalidate all outstanding stateless access tokens (which might still have 10 minutes of validity left), the user record in the database maintains a `token_version` or `jwt_revoked_before` timestamp. When microservices perform high-privilege actions (or periodic token checks), they verify that `token.issued_at > user.jwt_revoked_before`.

---

### **Q: Why is `Path=/api/v1/auth/refresh` on the cookie critical?**
By default, cookies without an explicit path are sent on every single HTTP request to the domain (`Path=/`). If your application makes 100 API calls per minute to fetch images, data, and analytics, the browser transmits the refresh token cookie 100 times.

Setting `Path=/api/v1/auth/refresh` ensures the browser sends the cookie **only** when communicating with that specific endpoint. This minimizes network bandwidth, prevents the cookie from appearing in logs of unrelated microservices or static asset CDNs, and reduces the attack surface.

---

### **Q: What exact HTTP status codes and payloads should the refresh endpoint return?**
- `200 OK`: When refresh succeeds. Body: `{ success: true, data: { accessToken, expiresIn } }` with a new `Set-Cookie` header.
- `401 Unauthorized`: When the token is expired, invalid, missing, or when breach detection is triggered. Must include a distinct machine-readable code (e.g., `TOKEN_EXPIRED`, `INVALID_TOKEN`, `TOKEN_REUSE_DETECTED`) so the frontend knows whether to silently retry or immediately route to the login screen.
- `403 Forbidden`: If the user's account has been banned, suspended, or disabled by an administrator since the token was issued.
- **Avoid 400 Bad Request:** Since the refresh endpoint reads credentials from the cookie rather than a complex JSON body, authentication failures are semantic credential rejections (`401`), not client schema errors.

---

## 6. The Traps — What Goes Wrong

### 1. The False-Positive Breach Lockout
- **The Mistake:** Implementing strict Refresh Token Rotation where an old token is invalidated with zero grace period.
- **What Happens:** A user on a slow mobile 3G connection opens a dashboard with three widgets. Three requests fail with 401 and fire three simultaneous refresh calls. The server receives the first, rotates the token, and when the second arrives 80ms later, it flags a security breach, invalidates the family, and kicks the user out to the login screen.
- **The Fix:** Implement a 5-to-10-second leeway window storing the `cachedAccessToken` and `cachedRefreshToken` on the rotated record.

### 2. Returning the Refresh Token in the JSON Body
- **The Mistake:** Writing `res.json({ accessToken, refreshToken })` so the frontend SPA developer can store it in a Redux store or `sessionStorage`.
- **What Happens:** The security benefit of `HttpOnly` cookies is completely bypassed. Any XSS script on the page can inspect API responses or state trees and steal the raw token.
- **The Fix:** The refresh token must **only** be transmitted via the `Set-Cookie` HTTP header.

### 3. Infinite 401 Refresh Loops
- **The Mistake:** Writing an Axios response interceptor that catches any 401 and blindly calls `/api/v1/auth/refresh` without checking if the failed request *was* the refresh endpoint.
- **What Happens:** When the refresh token itself expires or is revoked, `/api/v1/auth/refresh` returns 401. The interceptor catches this 401, calls `/api/v1/auth/refresh` again, which returns 401, creating an infinite loop that freezes the browser and DDOSes your auth server.
- **The Fix:** Explicitly exclude the refresh URL inside the interceptor: `if (error.config.url.includes('/auth/refresh')) { redirectToLogin(); }`.

### 4. Storing Plaintext Refresh Tokens in the Database
- **The Mistake:** Storing raw refresh token strings directly in a SQL or MongoDB table.
- **What Happens:** If an attacker gains read-only access to a database backup, replica, or SQL injection point, they obtain thousands of valid, active refresh tokens and can impersonate every user in the system without cracking passwords.
- **The Fix:** Always store the cryptographic hash (SHA-256) of the refresh token in the database. When the client presents the token in the cookie, hash it on the fly and query by the hash.

### 5. Non-Atomic Database Updates During Rotation
- **The Mistake:** Updating the old token and inserting the new token in separate non-transactional database operations.
- **What Happens:** If the server crashes or the database connection drops after creating the new token but before marking the old token rotated, the system is left in a corrupted state where token lineages break or duplicate tokens are created.
- **The Fix:** Wrap token lookup, rotation marking, and new token creation in a single ACID database transaction or an atomic Redis Lua script.

---

## 7. Compare With Related Concepts

```txt
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SESSION ARCHITECTURE MATRIX                               │
├────────────────────────────┬─────────────────────────────┬─────────────────────────────┤
│ Feature                    │ Refresh Token Rotation (RTR)│ Redis Stateful Sessions     │
├────────────────────────────┼─────────────────────────────┼─────────────────────────────┤
│ Storage on Server          │ Hashed token in DB/Redis    │ Full session JSON in Redis  │
│ Verification on API calls  │ Stateless (local JWT check) │ Stateful (Redis query/call) │
│ Latency per Request        │ Sub-millisecond (CPU only)  │ 1-5ms (Network I/O)         │
│ Revocation Latency         │ At token expiry (10 mins)   │ Instantaneous (delete key)  │
│ Scalability                │ Extremely High              │ High (Redis cluster needed) │
│ Replay Detection           │ Built-in via Token Families │ N/A (single session key)    │
└────────────────────────────┴─────────────────────────────┴─────────────────────────────┘
```

### 1. Refresh Token Rotation vs. Stateful Server Sessions (Session ID + Redis)
- **The Difference:** Stateful sessions store every user interaction and permission in Redis; every incoming request requires a Redis lookup. Refresh Token Rotation pairs stateless JWTs for API calls (zero database I/O) with stateful refresh checks once every 10–15 minutes.
- **Rule of Thumb:** Use stateful Redis sessions for monolithic web apps where instant sub-second permission revocation is mandatory. Use Refresh Token Rotation for distributed microservices, mobile apps, and public APIs where per-request database I/O does not scale.

### 2. Access Token vs. Refresh Token
- **The Difference:** An access token is a self-contained passport carried by the client that proves *what* you can do right now. A refresh token is a stateful ledger key held in an armored cookie that proves *who* originally signed in.
- **Rule of Thumb:** Access tokens belong in volatile memory and are short-lived. Refresh tokens belong in `HttpOnly` cookies and are long-lived.

### 3. Server Grace Period vs. Client-Side Mutex
- **The Difference:** A client-side mutex serializes refresh requests within a single browser tab. A server grace window tolerates concurrent requests across multiple tabs, devices, or flaky network retries.
- **Rule of Thumb:** Always implement both. The client mutex minimizes unnecessary network traffic; the server grace period prevents catastrophic false-positive breach lockouts.

---

## 8. 🧠 The Memory Hook

> **Access tokens are cheap, disposable 10-minute wristbands; refresh tokens are rotating vault keys locked in an `HttpOnly` briefcase. Replaying a used key pulls the alarm, incinerating the entire token family.**

