# How do you handle refresh tokens in MERN

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce app has been running fine for months. Users can browse, add to cart, and check out without issues. Then one day you start getting support tickets: "I was in the middle of checkout and suddenly got kicked to the login page." You check the logs and see a pattern — the access token expires after 15 minutes, and if a user takes longer than that to complete checkout, the next API call returns 401 and your React app has no way to recover.

A junior developer on your team suggests an easy fix: "Just make the access token valid for 30 days instead of 15 minutes." That sounds simple, but now you've created a much worse problem. If an attacker manages to steal that access token through an XSS vulnerability, they have full access to the user's account for a month. You've traded user experience for a massive security hole.

You try again. This time you implement refresh tokens — long-lived tokens that can get new access tokens. But a week later, your security team finds that stolen refresh tokens are still working for their full 7-day lifetime. You never implemented token rotation, so once a refresh token is stolen, the attacker can keep generating fresh access tokens until the original expires. Logout only clears the cookie on the client side, but the stolen token is still valid on the server.

This is the exact moment you realize refresh tokens need more than just existence — they need rotation, storage, reuse detection, and a coordinated frontend strategy. A refresh token sitting in localStorage or a long-lived access token are both security disasters. The right approach keeps the user logged in smoothly while limiting the damage window if anything gets stolen.

## 2. The Analogy — Make the Mechanic Obvious

Think of a coworking space. When you arrive each day, you get a day pass at the front desk. This pass lets you into meeting rooms, the printer area, and the kitchen. But it expires at 6 PM — you can't use it tomorrow. That's your access token: short-lived, gives you access to everything you need today, but useless tomorrow.

Now, imagine you're a member with a monthly plan. Instead of showing your ID and payment proof every single morning, you have a membership card. You walk up to the desk, swipe your card, and they hand you a fresh day pass. No ID check, no payment — just show the card, get a new pass. That's your refresh token: it doesn't give you direct access, but it proves you're a member so you can get a new access pass without the full verification process.

Here's where the security matters: Your membership card stays in a locked drawer at the front desk, not in your pocket where anyone can photograph it. When you swipe it to get a new day pass, the front desk logs that swipe in their system. And here's the key — when they give you a new day pass, they also void your old membership card and give you a new one. The old card won't work anymore, even if someone stole it.

If someone tries to use a voided card — one that was already used to get a replacement — the front desk knows something is wrong. They assume theft, cancel all your cards, and require you to come in person with ID to get a new membership. That's reuse detection: once a token is used to get a replacement, any attempt to use the old one triggers a security lockdown.

In MERN terms: the access token is the day pass (JWT in memory, 15 minutes), the refresh token is the membership card (httpOnly cookie, 7 days), the front desk log is the MongoDB hash, the voiding is rotation, and the security lockdown is revoking all refresh tokens when reuse is detected.

## 3. The Full Explanation — How It Actually Works

**When the user logs in**

The user enters their credentials, your Express server verifies them against MongoDB, and now you need to issue tokens. You generate two things: an access token (a JWT signed with your secret, valid for 15 minutes) and a refresh token (a cryptographically random string, at least 32 bytes, generated with Node's `crypto.randomBytes`). 

Here's the critical part: you never store the raw refresh token in your database. If your database is compromised, you don't want the attacker to get actual valid tokens. Instead, you hash it with SHA-256 and store the hash in MongoDB along with the user ID and an expiration date (typically 7 days). You also create a TTL index on the `expiresAt` field so MongoDB automatically cleans up expired tokens — you don't want manual cleanup jobs.

The raw refresh token goes into an httpOnly cookie on the response. This cookie is scoped to `/auth/refresh` path only, has `secure: true` so it only travels over HTTPS, `sameSite: 'none'` for cross-origin setups (or `strict` if your frontend and backend share a domain), and `httpOnly: true` so JavaScript cannot read it. This is crucial — XSS attacks can steal from localStorage or regular cookies, but httpOnly cookies are invisible to JavaScript.

**When the access token expires**

The user is browsing your app, 20 minutes have passed since login, and their React app makes an API call. The Express middleware validates the JWT and finds it's expired — it returns 401 Unauthorized. 

Your React axios interceptor catches this 401. Instead of redirecting to login immediately, it calls POST `/auth/refresh`. This request includes the httpOnly cookie automatically (the browser handles this), no body needed. The Express route reads the cookie value, hashes it, and looks up that hash in MongoDB.

If the hash exists, isn't expired, and hasn't been revoked, the server does two things: it generates a new access JWT for the user, and it rotates the refresh token. Rotation means generating a completely new random refresh token, hashing it, storing the new hash in MongoDB, and setting the new raw token in the httpOnly cookie. The old refresh token hash in MongoDB is marked with a `replacedBy` field pointing to the new hash — it's now invalid.

**Why rotation matters**

Without rotation, if an attacker steals a refresh token, they can use it for its entire 7-day lifetime. With rotation, the moment the legitimate user makes a refresh request, the stolen token becomes invalid. The attacker tries to use it, and the server sees that this hash has a `replacedBy` value — it was already used to get a replacement. That's the reuse detection signal.

When reuse is detected, the server assumes the token was stolen. It immediately deletes all refresh tokens for that user from MongoDB and clears the cookie. The attacker's refresh attempt fails, and the legitimate user's next API call will also fail, forcing them to log in again. This is the right trade-off: a brief inconvenience for the legitimate user vs. giving an attacker a week of access.

**When the user logs out**

Your React app calls POST `/auth/logout`. The server finds the refresh token hash from the cookie, deletes it from MongoDB, and clears the cookie with `res.clearCookie()`. The user is now fully logged out — even if they copied the cookie value before, it won't work because the hash is gone from the database.

**Handling concurrent refresh requests**

Here's a subtle race condition: the user has two tabs open. Both tabs make API calls at the same time, both get 401, and both call `/auth/refresh` simultaneously. The first request succeeds, rotates the token, and sets a new cookie. The second request is still in flight with the old cookie. When it arrives, the server might either succeed (benign race, you get two valid refresh tokens for the same user) or fail (the old hash is already marked as replaced).

Most teams handle this on the frontend with single-flight refresh: a shared promise that all 401 retries wait on. The first 401 triggers the refresh call, and subsequent 401s just wait for that same promise to resolve. They all get the same new access token, and only one refresh request hits the server. This prevents the race and reduces server load.

**Where each piece lives**

Access token: in React memory (a variable in your auth context or axios interceptor). Never stored — if the user refreshes the page, they'll need to refresh again. This is acceptable because access tokens are short-lived anyway.

Refresh token: httpOnly cookie only. JavaScript cannot read it, XSS cannot steal it, and it automatically gets sent with requests to `/auth/refresh`.

Refresh token hash: in MongoDB with userId and expiry. Never the raw token.

**The security chain**

Short access token = limited damage window if stolen via XSS.

HttpOnly cookie = refresh token invisible to XSS.

Server-side hash = database leak doesn't expose valid tokens.

Rotation = stolen refresh token becomes invalid on next legitimate use.

Reuse detection = theft triggers immediate lockdown.

## 4. See It In Practice — Real Code or Queries

**MongoDB model for refresh tokens**

```javascript
// server/models/RefreshToken.js
const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema({
  // We need to know which user this token belongs to for revocation
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  // Store the SHA-256 hash, never the raw token — if DB is compromised,
  // attacker gets hashes, not valid tokens they can use
  tokenHash: { 
    type: String, 
    required: true, 
    unique: true 
  },
  // TTL index automatically deletes expired documents — no cleanup job needed
  expiresAt: { 
    type: Date, 
    required: true, 
    index: { expireAfterSeconds: 0 } 
  },
  // When this token is rotated, we store the new token's hash here.
  // If this field is not null, it means this token was already used and is now invalid.
  // If someone tries to use a token with replacedBy set, we detect theft.
  replacedBy: { 
    type: String 
  },
});

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
```

**Express refresh endpoint with rotation and reuse detection**

```javascript
// server/routes/auth.js
const crypto = require("crypto");

// Helper: hash the raw token before storing or looking up
const hash = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

router.post("/refresh", async (req, res) => {
  // The httpOnly cookie is automatically sent by the browser
  const raw = req.cookies.refreshToken;
  
  if (!raw) {
    // No cookie means not authenticated — send them to login
    return res.status(401).json({ 
      error: { code: "NO_REFRESH", message: "Not authenticated" } 
    });
  }

  const tokenHash = hash(raw);
  const stored = await RefreshToken.findOne({ tokenHash });

  // Token doesn't exist in DB or is expired — clear the cookie and reject
  if (!stored || stored.expiresAt < new Date()) {
    res.clearCookie("refreshToken", { path: "/auth/refresh" });
    return res.status(401).json({ 
      error: { code: "INVALID_REFRESH", message: "Session expired" } 
    });
  }

  // REUSE DETECTION: If this token was already replaced, someone is trying
  // to use an old token. This likely means theft — revoke everything.
  if (stored.replacedBy) {
    // Delete ALL refresh tokens for this user, not just this one
    await RefreshToken.deleteMany({ userId: stored.userId });
    res.clearCookie("refreshToken", { path: "/auth/refresh" });
    return res.status(401).json({ 
      error: { code: "REUSE_DETECTED", message: "Please log in again" } 
    });
  }

  // Token is valid — get the user and issue a new access token
  const user = await User.findById(stored.userId);
  const accessToken = signAccess(user); // Your JWT signing function

  // ROTATION: Generate a completely new refresh token
  const newRaw = crypto.randomBytes(48).toString("base64url");
  const newHash = hash(newRaw);

  // Mark the old token as replaced by the new one
  stored.replacedBy = newHash;
  await stored.save();

  // Create a new refresh token record in MongoDB
  await RefreshToken.create({
    userId: user._id,
    tokenHash: newHash,
    expiresAt: new Date(Date.now() + 7 * 86400000), // 7 days
  });

  // Set the new refresh token as an httpOnly cookie
  res.cookie("refreshToken", newRaw, {
    httpOnly: true,    // JavaScript cannot read this
    secure: true,       // Only send over HTTPS
    sameSite: "none",  // Required for cross-origin (use "strict" if same domain)
    path: "/auth/refresh", // Only send to refresh endpoint
    maxAge: 7 * 86400000, // 7 days in milliseconds
  });

  // Return the new access token (client stores this in memory)
  res.json({ data: { accessToken } });
});
```

**React single-flight refresh to prevent concurrent refresh stampedes**

```typescript
// client/src/lib/refreshSession.ts
let refreshPromise: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  // If a refresh is already in flight, return that same promise
  // This prevents 5 tabs from sending 5 refresh requests simultaneously
  if (!refreshPromise) {
    refreshPromise = fetch(`${import.meta.env.VITE_API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include", // Required to send httpOnly cookies
    })
      .then(async (res) => {
        if (!res.ok) {
          // If refresh fails (401, reuse detected, etc.), throw to trigger login redirect
          throw new Error("refresh failed");
        }
        const { data } = await res.json();
        return data.accessToken as string;
      })
      .finally(() => {
        // Clear the promise whether success or failure — next 401 starts fresh
        refreshPromise = null;
      });
  }
  return refreshPromise;
}
```

**Using the refresh in an axios interceptor**

```typescript
// client/src/lib/apiClient.ts
import axios from "axios";
import { refreshAccessToken } from "./refreshSession";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // Required for httpOnly cookies
});

let isRefreshing = false;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If we get 401 and haven't tried refreshing yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Get new access token using single-flight refresh
        const newAccessToken = await refreshAccessToken();
        
        // Update the authorization header for this and future requests
        api.defaults.headers.common["Authorization"] = `Bearer ${newAccessToken}`;
        originalRequest.headers["Authorization"] = `Bearer ${newAccessToken}`;
        
        // Retry the original request with the new token
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed — redirect to login page
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Why use refresh tokens at all instead of just making access tokens live longer?**

Access tokens are typically stored in memory or localStorage in React apps, which means they're accessible to JavaScript. If your app has an XSS vulnerability, an attacker can steal that access token and use it immediately. If the access token is valid for 30 days, the attacker has 30 days of unrestricted access.

Refresh tokens solve this by keeping the long-lived credential in an httpOnly cookie, which JavaScript cannot read. The short-lived access token (15 minutes) limits the damage window if stolen via XSS. The refresh token, which could live for 7 days, is protected from XSS by the httpOnly flag. And on the server side, we only store a hash of the refresh token, so even a database leak doesn't expose usable tokens.

**Q: How does refresh token rotation work, and why is it important?**

Rotation means that every time you use a refresh token to get a new access token, the server also issues a completely new refresh token and invalidates the old one. In the database, we mark the old token's hash with a `replacedBy` field pointing to the new token's hash.

This is important because if an attacker steals a refresh token, they have until the next time the legitimate user refreshes to use it. The moment the legitimate user makes a refresh request, the stolen token becomes invalid. The attacker tries to use it, the server sees the `replacedBy` field is set, and triggers a security response. Without rotation, a stolen refresh token works for its entire lifetime — 7 days of access for the attacker.

**Q: Where should the refresh token be stored on the client, and why?**

The refresh token should only be stored in an httpOnly cookie. Never in localStorage, never in sessionStorage, never in a JavaScript variable. HttpOnly cookies are automatically sent with requests but cannot be read by JavaScript, which means XSS attacks cannot steal them. The cookie should be scoped to the refresh endpoint path (`/auth/refresh`), marked `secure` so it only travels over HTTPS, and set with appropriate `sameSite` attributes for your CORS setup.

Access tokens, by contrast, are stored in memory (a variable in your React auth context or axios interceptor). They're short-lived anyway, and storing them in memory means they disappear on page refresh — the user just silently refreshes again. This is acceptable because the refresh flow is automatic and transparent.

**Q: What should the server store in the database for refresh tokens?**

The server should never store the raw refresh token. Store only the SHA-256 hash of the token, along with the user ID, expiration timestamp, and optionally a `replacedBy` field for rotation tracking. If your database is compromised, the attacker gets hashes, not valid tokens they can use to authenticate. Hashing is one-way — the attacker cannot reverse the hash to get the original token value.

You should also create a TTL index on the `expiresAt` field so MongoDB automatically deletes expired tokens. This prevents your database from accumulating millions of dead token records over time.

**Q: How does the React app recover when the access token expires?**

You implement an axios interceptor that catches 401 responses. When a 401 occurs, the interceptor calls a single-flight refresh function that POSTs to `/auth/refresh`. This function returns a promise that all concurrent 401s wait on, preventing multiple refresh requests from firing at once. The refresh endpoint uses the httpOnly cookie (no manual token handling needed) and returns a new access token. The interceptor updates the authorization header with the new token and retries the original request. If refresh fails (reuse detected, session expired, etc.), the interceptor redirects to the login page.

**Q: What happens when a refresh token is reused after rotation?**

When a refresh token is used, the server marks it as replaced and issues a new one. If someone tries to use the old token again, the server sees the `replacedBy` field is set and treats this as a theft signal. The immediate response is to delete all refresh tokens for that user from the database and clear the cookie. This forces both the legitimate user and the attacker to log in again. It's a trade-off — the legitimate user gets logged out, but you prevent the attacker from maintaining long-term access.

**Q: How do you handle concurrent refresh requests from multiple tabs?**

If a user has multiple tabs open and the access token expires in all of them simultaneously, you could get multiple refresh requests firing at once. This can cause race conditions where the second request uses an already-rotated token.

The standard solution is single-flight refresh on the frontend: a shared promise that all 401 interceptors wait on. The first 401 triggers the refresh call, and subsequent 401s just wait for that same promise to resolve. They all get the same new access token, and only one refresh request hits the server. This eliminates the race and reduces unnecessary network traffic.

## 6. The Traps — What Goes Wrong in Production

**Storing the refresh token in the response body or localStorage**

This is one of the most common mistakes. The refresh endpoint returns the new access token in the JSON response, and developers sometimes return the new refresh token there too. The frontend then saves it to localStorage for easy access. This completely defeats the httpOnly protection — localStorage is accessible to JavaScript, so any XSS vulnerability can now steal the long-lived refresh token. The refresh token should only ever be set as an httpOnly cookie, never returned in the response body and never stored manually by the frontend.

**Not implementing token rotation**

You generate a refresh token that's valid for 7 days and you store it in an httpOnly cookie, but you never rotate it. Every time the user refreshes, you just give them a new access token and keep using the same refresh token. The problem: if an attacker steals that refresh token, they have 7 days of access. Without rotation, there's no mechanism to invalidate a stolen token before it naturally expires. Rotation is what turns a 7-day theft window into a much smaller window — the next time the legitimate user refreshes, the stolen token becomes invalid.

**Rotation without reuse detection**

You implement rotation but not reuse detection. When a refresh token is used, you mark it as replaced and issue a new one. But if someone tries to use the old token again, you just treat it as a normal invalid token and return 401. The attacker can keep trying to use the stolen token, and while it won't work, you're not detecting the theft pattern. Reuse detection is what turns "this token is invalid" into "someone is trying to use a stolen token, lock down the account." The difference is detecting the attack vs. silently failing to prevent it.

**Missing rate limiting on the refresh endpoint**

The refresh endpoint takes no request body — it just reads the cookie. This makes it tempting to skip rate limiting. But an attacker could still attempt brute force attacks if they somehow obtained a list of potential token values, or they could flood the endpoint to cause denial of service. Always rate limit the refresh endpoint just like any other authentication endpoint. Use proper token generation (at least 32 bytes of cryptographically secure random data) to make guessing infeasible, but don't rely on that alone.

**Single-flight refresh not implemented, causing duplicate token creation**

You have multiple tabs open, the access token expires, and all tabs fire a refresh request simultaneously. Without single-flight refresh, each tab gets its own new refresh token from the server. Now you have multiple valid refresh tokens for the same user in the database. This isn't necessarily a security issue, but it creates token bloat and can cause logout confusion — when the user logs out from one tab, the other tabs still have valid refresh tokens. Single-flight refresh ensures only one refresh request happens and all tabs share the result.

**Cookie path set incorrectly**

You set the httpOnly cookie without specifying a path, so it defaults to `/`. Now every single API request sends the refresh token cookie, even requests that don't need it. This increases attack surface and can cause issues with CORS preflight requests. The cookie should be scoped to `/auth/refresh` so it's only sent to the refresh endpoint where it's actually needed.

**Missing secure flag in development**

You set `httpOnly: true` but forget `secure: true` because you're testing on HTTP in development. Then you deploy to production without fixing it. Now the refresh token travels over unencrypted HTTP in production, making it vulnerable to network interception. Always use `secure: true` in production, and use HTTPS even in development to catch these issues early.

**Not clearing the cookie on logout**

Your logout endpoint deletes the refresh token from the database but forgets to call `res.clearCookie()`. The user's browser still has the cookie, and even though the database record is gone, this creates confusion and potential edge cases where the cookie might still be sent on subsequent requests. Always clear the cookie on logout to keep client and server state in sync.

**Storing the raw refresh token in the database**

For convenience during debugging, you store the raw refresh token value in MongoDB alongside the hash. This is a security disaster — if your database is compromised, the attacker gets actual valid tokens they can use immediately. Never store the raw token. Store only the hash. If you need to inspect tokens during development, log them to the console temporarily, but never commit that to production code or database schemas.

## 7. Compare With Related Concepts

**Refresh token rotation vs sliding session expiration**

A sliding session is a traditional server-side session where the session expiration time extends every time the user makes a request. If the session is set to expire after 30 minutes of inactivity, and the user clicks something at minute 29, the clock resets and they have another 30 minutes. This works well for traditional server-rendered apps where the session ID is in a cookie.

Refresh token rotation is different — it's an explicit token swap mechanism designed for SPAs with separate frontend and backend. Instead of extending a single session, you're literally replacing one token with another. The old token becomes invalid, and a new one takes its place. Sliding sessions don't have this replacement behavior, which means if a session cookie is stolen, it remains valid until the inactivity timer expires. Rotation gives you a proactive way to invalidate stolen credentials on the next legitimate use.

Use sliding sessions for traditional server-rendered apps where the session lives entirely on the server. Use refresh token rotation for SPAs where you need stateless JWTs for API access but still want secure long-term sessions.

**Storing refresh tokens in Redis vs MongoDB**

Redis is often a better choice for refresh token storage at scale. Redis has built-in TTL support — you set a key with an expiration time and Redis automatically deletes it when that time passes. This is more efficient than MongoDB's TTL index, which requires a background thread to scan and delete expired documents. Redis is also faster for the high-frequency read operations that refresh endpoints generate, and it's easier to implement token revocation lists (blacklists) for immediate logout across all servers.

MongoDB is perfectly fine for moderate-scale applications, and it's often simpler if you're already using MongoDB for user data. The TTL index works reliably for cleanup, and the query performance is acceptable for most use cases. The trade-off is that MongoDB TTL cleanup isn't instant — expired documents may linger briefly until the background thread runs, whereas Redis eviction is immediate.

Use Redis if you're operating at large scale, need instant revocation, or want the performance benefits of an in-memory store. Use MongoDB if your scale is moderate and you prefer keeping all user data in one database for simplicity.

**Silent refresh vs redirect to login**

Silent refresh means that when the access token expires, your app automatically calls the refresh endpoint without any user interaction. The user doesn't see anything — the API call just succeeds after a brief delay. This is the expected UX for SPAs: the user stays logged in indefinitely as long as they're active, and only sees a login prompt when their refresh token actually expires or is revoked.

Redirect to login is what happens when silent refresh fails — the refresh endpoint returns 401 because the refresh token is expired, revoked, or reuse was detected. At that point, you redirect the user to the login page because there's no way to recover their session automatically.

The key distinction: silent refresh is for routine access token expiration (which happens constantly during normal use), while redirect to login is for actual session termination (expired refresh token, logout, security lockdown). Don't redirect to login on every 401 — first try silent refresh, and only redirect if that fails.

**Refresh tokens vs long-lived JWTs**

Some developers skip refresh tokens entirely and just make access JWTs valid for 30 days. This is simpler to implement but much less secure. A long-lived JWT stored in localStorage or memory is vulnerable to XSS for its entire lifetime. There's no way to revoke it without maintaining a server-side blocklist, which defeats the stateless benefit of JWTs.

Refresh tokens give you the best of both worlds: stateless short-lived JWTs for API calls (good performance, no server-side session lookup on every request) and secure, revocable long-lived sessions via httpOnly cookies (good security, server-side control). The cost is the extra refresh endpoint and database storage, but for most applications, this trade-off is worth it.

Use long-lived JWTs only for internal tools or scenarios where security requirements are low. Use refresh tokens for any public-facing application where user security matters.

## 8. 🧠 The Memory Hook

Refresh tokens are like a gym membership card at the front desk: the card stays in a locked drawer (httpOnly cookie), not in your pocket where anyone can copy it. Every time you check in, they give you a new day pass (access token) AND they replace your membership card with a new one (rotation). If someone tries to use an old card that was already replaced, security assumes theft and cancels all your cards (reuse detection). On the frontend, all failed calls wait for one person to run to the desk (single-flight refresh), then everyone gets their new pass and tries again.
