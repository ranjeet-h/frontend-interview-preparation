# How do you design auth in MERN

## 1. The Real-World Problem — When You Actually Hit This

Your app has been running fine for months. Users log in, they see their dashboard, everything works. Then one day you get a panicked email from a customer — someone posted as them on your public forum, deleted their data, and changed their email address. You check the logs and see the requests came from a legitimate token, but the user claims they never logged in from that device.

You dig deeper and realize your JWTs live in `localStorage`. A few weeks ago, one of your frontend dependencies had a known XSS vulnerability. An attacker injected a script that read every user's tokens and sent them to an external server. Those tokens don't expire for 30 days, so the attacker can keep using them until you force everyone to re-login.

At the same time, you discover your admin routes only had React route guards — no actual Express middleware. The attacker didn't even need the stolen tokens for admin actions; they just called `/api/admin/delete-user` directly with curl.

This is the moment you realize authentication in MERN is not "store a token and check it on the frontend." It's a complete system of password hashing, short-lived tokens, refresh rotation, server-side enforcement, and revocation — and getting any piece wrong breaks your security.

## 2. The Analogy — Make the Mechanic Obvious

Think of authentication like checking into a hotel.

**Registration** is creating a guest profile in the hotel's ledger. The front desk writes down your name and stores your room key signature. They don't write down your actual key — they store a scrambled version that proves you have the right key when you return.

**Login** is the front desk verifying your identity and giving you two things: a day pass that gets you into the building for a few hours, and a reservation stub that lets you get new day passes without showing ID again. The day pass is temporary and easy to lose, but the reservation stub is more valuable and needs to be protected.

**Protected areas** like the gym or executive floor have security at the elevator. You show your day pass, they verify it's real and not expired, and they let you through. The pass doesn't say who you are — it just proves the front desk issued it to someone with access.

**Authorization** is which floors your key card actually opens. You might have a day pass, but if your card only opens floors 1-5, security stops you at floor 6. This check happens at every restricted elevator, not just at the building entrance.

**Refresh** is when your day pass expires. You go back to the front desk, show your reservation stub, and they issue a new day pass. They also give you a new reservation stub and invalidate the old one — so if someone stole your old stub, it's now useless.

**Logout** is returning your reservation stub. The front desk marks it as used in their system, so even if someone finds it later, they can't get new day passes with it.

React is like the hotel directory in your room — it shows you which floors you're allowed to visit, but it doesn't actually stop you from walking to the wrong floor. Express middleware is the actual security at every elevator.

## 3. The Full Explanation — How It Actually Works

**Registration starts with password hashing.**

When a user registers, React sends their email and password to Express. The server first validates the input with something like Zod — check that the email is actually an email, that the password meets your complexity rules. Then it checks if the email already exists in MongoDB. If everything passes, it hashes the password with bcrypt before storing it.

Bcrypt is slow on purpose. It adds a computational cost factor (usually 10-12) so that hashing a password takes about 100-250ms. This makes brute-force attacks impractical — an attacker trying millions of password combinations would need massive computing power. bcrypt also automatically salts the hash, so two users with the same password get different hashes.

You never store the plain password. You never send it back to the client. The only thing you can do with the stored hash is verify whether a submitted password matches it.

**Login is password verification plus token issuance.**

When a user logs in, Express finds their document by email, then uses `bcrypt.compare` to check the password. If it matches, you issue two tokens: an access token and a refresh token.

The access token is a JWT signed with a secret only your server knows. It lives for 5-15 minutes — short enough that if it's stolen, the attacker has a limited window. The payload only contains the user's ID (`sub`) and their role. Never put secrets, passwords, or PII in a JWT payload because it's just base64-encoded — anyone can read it.

The refresh token is a random string you generate with `crypto.randomBytes`. You hash it with SHA-256 and store that hash in MongoDB (or Redis for better performance at scale). You send the raw refresh token to the client as an httpOnly cookie. The httpOnly flag means JavaScript cannot read it — only the browser sends it automatically with requests. In production, you also set `secure: true` so it only travels over HTTPS, and `sameSite: 'strict'` or `'none'` to prevent CSRF attacks.

The access token goes back in the JSON response body. The client stores it in memory — React state or context — not in localStorage. Memory is cleared when the tab closes, and XSS cannot easily read from React state.

**Protected routes use middleware, not frontend checks.**

Every Express route that requires authentication wraps in `requireAuth` middleware. This middleware pulls the token from the `Authorization` header (which should be `Bearer <token>`), verifies the JWT signature with your secret, checks that it's not expired, and attaches the decoded payload to `req.user`. If anything fails, it returns 401 immediately.

The middleware is reusable — you put it before your route handlers. The route handler then trusts that `req.user` exists and contains valid data.

**Authorization is a separate layer.**

Authentication proves who someone is. Authorization proves what they're allowed to do. You need separate middleware for this — like `requireRole('admin')` that checks `req.user.role` after authentication runs. Or resource ownership checks where you verify that `req.user.id` matches the `userId` on the document they're trying to modify.

This check must run on the server for every sensitive operation. React can hide admin buttons or redirect unauthorized users, but that's only for user experience — not security.

**Refresh keeps users logged in without long-lived tokens.**

When the access token expires (after 5-15 minutes), the client gets a 401 response. The client then POSTs to `/auth/refresh`. The browser automatically sends the httpOnly refresh cookie. The server hashes the incoming refresh token and looks it up in the database. If it exists and hasn't expired, the server issues a new access token and a new refresh token, invalidates the old refresh token (delete it from the DB or mark it used), and sends back the new access token in JSON and the new refresh token as a fresh httpOnly cookie.

This rotation means a stolen refresh token can only be used once. When the real user refreshes, the stolen token is already invalidated.

**Logout is server-side revocation.**

When a user logs out, the client POSTs to `/auth/logout`. The server deletes the refresh token from the database and clears the httpOnly cookie by setting it with an expired date. The access token is still valid until it expires naturally, but it's only 5-15 minutes old, so the risk window is small. If you need immediate revocation, you can maintain a blacklist of access tokens in Redis, but that adds complexity and database load.

**Frontend auth state is for UX, not security.**

React tracks whether the user is logged in using context or state. When the app loads, it calls `/auth/me` with the current access token to get the user's profile. If that fails, it redirects to login. Protected routes in React check this state and redirect if the user isn't authenticated.

This is purely for user experience — it prevents showing admin UI to regular users, or redirecting to a dashboard when the user isn't logged in. But any attacker can bypass React entirely by calling your API directly with curl or Postman. That's why server middleware is the real security boundary.

## 4. See It In Practice — Real Code or Queries

**User model with bcrypt comparison**

```js
// server/models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
  },
  { timestamps: true }
);

// Instance method to compare password - bcrypt handles the salting internally
userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

module.exports = mongoose.model("User", userSchema);
```

**Refresh token model for rotation and revocation**

```js
// server/models/RefreshToken.js
const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Index to clean up expired tokens automatically
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
```

**Login route with access token and refresh token**

```js
// server/routes/auth.js
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");

// Sign access token - short-lived, contains minimal data
function signAccess(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" }
  );
}

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    // Use generic error message to prevent email enumeration
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
      });
    }

    // Generate short-lived access token
    const accessToken = signAccess(user);

    // Generate random refresh token and hash it for storage
    const refreshRaw = crypto.randomBytes(40).toString("hex");
    const refreshHash = crypto.createHash("sha256").update(refreshRaw).digest("hex");

    // Store hash in DB for revocation and rotation
    await RefreshToken.create({
      userId: user._id,
      tokenHash: refreshHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    // Set httpOnly cookie - JavaScript cannot read this
    res.cookie("refreshToken", refreshRaw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS only in production
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Return access token in body (client stores in memory)
    res.json({
      data: {
        accessToken,
        user: { id: user._id, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    next(err);
  }
});
```

**Refresh endpoint with token rotation**

```js
router.post("/refresh", async (req, res, next) => {
  try {
    const refreshRaw = req.cookies.refreshToken;
    if (!refreshRaw) {
      return res.status(401).json({
        error: { code: "MISSING_REFRESH", message: "Refresh token required" },
      });
    }

    const refreshHash = crypto.createHash("sha256").update(refreshRaw).digest("hex");
    const tokenRecord = await RefreshToken.findOne({ tokenHash: refreshHash });

    if (!tokenRecord || new Date() > tokenRecord.expiresAt) {
      return res.status(401).json({
        error: { code: "INVALID_REFRESH", message: "Invalid or expired refresh token" },
      });
    }

    const user = await User.findById(tokenRecord.userId);
    if (!user) {
      return res.status(401).json({
        error: { code: "USER_NOT_FOUND", message: "User not found" },
      });
    }

    // Issue new access token
    const accessToken = signAccess(user);

    // Rotate refresh token - invalidate old, issue new
    await RefreshToken.deleteOne({ _id: tokenRecord._id });

    const newRefreshRaw = crypto.randomBytes(40).toString("hex");
    const newRefreshHash = crypto.createHash("sha256").update(newRefreshRaw).digest("hex");

    await RefreshToken.create({
      userId: user._id,
      tokenHash: newRefreshHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.cookie("refreshToken", newRefreshRaw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ data: { accessToken } });
  } catch (err) {
    next(err);
  }
});
```

**Logout with server-side revocation**

```js
router.post("/logout", async (req, res, next) => {
  try {
    const refreshRaw = req.cookies.refreshToken;
    if (refreshRaw) {
      const refreshHash = crypto.createHash("sha256").update(refreshRaw).digest("hex");
      await RefreshToken.deleteOne({ tokenHash: refreshHash });
    }

    // Clear cookie by setting it with expired date
    res.clearCookie("refreshToken");
    res.json({ data: { message: "Logged out successfully" } });
  } catch (err) {
    next(err);
  }
});
```

**Authentication middleware for protected routes**

```js
// server/middleware/requireAuth.js
const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Missing authorization token" },
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({
      error: { code: "TOKEN_EXPIRED", message: "Invalid or expired token" },
    });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Insufficient permissions" },
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
```

**Using middleware in protected routes**

```js
// server/routes/users.js
const router = require("express").Router();
const { requireAuth, requireRole } = require("../middleware/requireAuth");
const User = require("../models/User");

// Public route
router.get("/public", (req, res) => {
  res.json({ data: { message: "Anyone can see this" } });
});

// Protected route - requires authentication
router.get("/profile", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-passwordHash");
  res.json({ data: user });
});

// Admin-only route - requires authentication + admin role
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ data: { message: "User deleted" } });
});

module.exports = router;
```

**React auth provider for frontend state**

```tsx
// client/src/auth/AuthProvider.tsx
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/apiClient";

type User = { id: string; email: string; role: string };

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  logout: () => void;
}

const AuthCtx = createContext<AuthContextType>({
  user: null,
  accessToken: null,
  setAccessToken: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Fetch user profile whenever access token changes
  useEffect(() => {
    if (!accessToken) {
      setUser(null);
      return;
    }

    api<{ data: User }>("/auth/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => setUser(r.data))
      .catch(() => {
        setUser(null);
        setAccessToken(null);
      });
  }, [accessToken]);

  const logout = () => {
    api.post("/auth/logout").catch(() => {});
    setAccessToken(null);
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, accessToken, setAccessToken, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Walk through the complete authentication flow in a MERN application.**

Registration starts with React sending email and password to Express. The server validates input, checks for duplicate emails, hashes the password with bcrypt, and stores the hash in MongoDB. Login does the reverse — Express finds the user by email, uses bcrypt.compare to verify the password, then issues two tokens: a short-lived access JWT (5-15 minutes) returned in the JSON body, and a refresh token sent as an httpOnly cookie. The refresh token hash is stored in MongoDB for rotation and revocation. Protected routes use Express middleware to verify the JWT from the Authorization header, attaching the decoded user to req.user. When the access token expires, the client calls /auth/refresh — the httpOnly cookie is sent automatically, the server validates it against the DB, issues a new access token and a new refresh token while invalidating the old one. Logout deletes the refresh token from the DB and clears the cookie. React maintains auth state in context for UX, but all security enforcement happens on the server.

**Q: What's the difference between authentication and authorization in MERN?**

Authentication answers "who is this user?" — it's the process of verifying identity, typically through login, token verification, and middleware like requireAuth that ensures the request comes from a valid user. Authorization answers "what is this user allowed to do?" — it's checking permissions after you know who they are, like requireRole('admin') or verifying that req.user.id matches the resource owner. Both must run on Express middleware. React can hide UI elements based on permissions for better UX, but that doesn't enforce security — an attacker can always call your API directly.

**Q: Where should you store passwords, access tokens, and refresh tokens?**

Passwords should never be stored in plain text. Hash them with bcrypt (cost factor 10-12) and store only the hash in MongoDB. Access tokens are short-lived JWTs — store them in React memory (state or context), never in localStorage, because XSS can read localStorage. Refresh tokens are long-lived secrets — store them in httpOnly, secure, sameSite cookies so JavaScript cannot read them, and store a hash of each refresh token in MongoDB or Redis for rotation and revocation. The hash allows you to validate tokens without storing the raw value, and lets you invalidate tokens by deleting the hash.

**Q: Why use short access tokens with refresh tokens instead of one long-lived token?**

Short access tokens limit the damage if they're stolen. A token that expires in 15 minutes gives an attacker a very small window. Refresh tokens allow users to stay logged in without constantly re-entering passwords, but they're protected differently — stored in httpOnly cookies (harder to steal via XSS) and rotated on every use. If you used one long-lived token (like a 30-day JWT in localStorage), stealing it gives the attacker full access for a month with no way to revoke it. The short-access + refresh pattern gives you the security of short-lived tokens with the UX of long-lived sessions.

**Q: How do you handle "remember me" functionality?**

"Remember me" just means longer refresh token TTL — instead of 7 days, you might use 30 days. The security trade-off is that a stolen refresh token remains valid longer. You can mitigate this by adding device or IP fingerprinting to the refresh token record, so a refresh request from an unknown device triggers additional verification (like re-entering password or 2FA). You should also provide a "revoke all sessions" feature in user settings that deletes all refresh tokens for that user, forcing them to log in again everywhere. The core pattern doesn't change — you still rotate refresh tokens and store hashes server-side.

**Q: What happens if an attacker steals a refresh token?**

If you're not rotating refresh tokens, the attacker can keep getting new access tokens until the refresh token expires. That's why rotation is critical — when the real user refreshes, the server issues a new refresh token and invalidates the old one. The attacker's stolen token stops working immediately. If the attacker uses the stolen token before the real user does, they invalidate the real user's session — the real user will be forced to log in again, which is annoying but not a security breach. This is the "detect and respond" pattern: token theft causes a logout, not permanent compromise. You can add heuristics like detecting refresh from a new IP or device and requiring re-authentication, but rotation is the baseline protection.

**Q: Should you put user data in the JWT payload?**

Only put minimal, non-sensitive data in JWT payloads — things like user ID (`sub`) and role are fine. Never put passwords, email addresses, PII, or any secrets. JWT payloads are just base64-encoded, not encrypted — anyone who has the token can decode and read the payload. Also, larger payloads mean larger tokens on every request. If you need user data on the client, fetch it from an endpoint like `/auth/me` after validating the token. The JWT should only contain what the middleware needs to attach to req.user.

## 6. The Traps — What Goes Wrong in Production

**Storing JWTs in localStorage is the most common security hole.**

Many developers put access tokens in localStorage because it's easy — it persists across page reloads and you can access it from any tab. But any XSS vulnerability, including compromised npm dependencies, can read localStorage and exfiltrate tokens. The attacker then has full access until the token expires. If you're using long-lived tokens (days or weeks), the damage window is huge. The fix is short access tokens in memory and refresh tokens in httpOnly cookies.

**Skipping server-side refresh token revocation.**

If you issue refresh tokens but don't store them server-side, you can't revoke them. A stolen refresh token works until it naturally expires. If a user reports suspicious activity or changes their password, you have no way to invalidate their existing sessions. The fix is storing hashed refresh tokens in MongoDB or Redis, deleting them on logout, and optionally providing a "revoke all sessions" button that wipes all tokens for that user.

**Putting sensitive data in JWT payloads.**

Developers sometimes put email, name, or other user data in JWTs to avoid database lookups. But JWTs are not encrypted — they're just signed. Anyone with the token can decode the payload and read everything. This leaks PII and makes debugging easier for attackers. Only put the minimum data needed for authorization: user ID and role. Everything else should come from the database.

**Only protecting routes on the frontend.**

React Router can redirect unauthorized users away from admin pages, but that's just UX. An attacker can call `/api/admin/delete-user` directly with curl, and React never runs. Every sensitive route must have Express middleware checking authentication and authorization. The frontend guards are for user experience only — they prevent showing UI the user can't use, but they don't enforce security.

**Trusting role or user ID from the client.**

Never accept `role` or `userId` from request bodies or query parameters. An attacker can send `{ role: 'admin' }` in their request and promote themselves. Always read these values from the verified JWT payload or from the database after authentication. The middleware should attach `req.user` from the token, and all authorization checks should use that.

**Using the same secret for access and refresh tokens.**

Access tokens and refresh tokens should use different signing secrets. If an attacker somehow steals your signing secret (through a server breach or misconfigured environment variable), they can forge both token types. Using separate secrets limits the blast radius — compromising one doesn't automatically compromise the other.

**Not rotating refresh tokens.**

If you use the same refresh token indefinitely, stealing it gives permanent access until expiry. Every refresh request should issue a new refresh token and invalidate the old one. This way, a stolen token can only be used once — either the attacker uses it (invalidating the real user's session) or the real user uses it (invalidating the attacker's token). Either way, the theft is detected and contained.

**Sending access tokens in cookies instead of Authorization headers.**

If you put access tokens in cookies, you lose the ability to easily set different lifetimes, and you're more vulnerable to CSRF attacks. The Authorization header pattern is standard and easier to control. Keep access tokens in memory and send them via the Bearer header. Only refresh tokens go in httpOnly cookies.

**Forgetting to set secure and sameSite on cookies.**

In production, cookies must have `secure: true` so they only travel over HTTPS. Without this, a man-in-the-middle attacker on the same network can intercept cookies. The `sameSite` attribute prevents CSRF attacks by restricting when cookies are sent with cross-site requests. In production, use `sameSite: 'none'` if your frontend and backend are on different domains, or `'strict'` if they're on the same domain.

**Using generic error messages that leak information.**

Returning "User not found" on login tells attackers which emails exist in your system. Use the same message for both "user not found" and "wrong password" — something like "Invalid email or password." This prevents email enumeration attacks where attackers try many emails to find valid accounts.

## 7. Compare With Related Concepts

**JWT access tokens vs session-based authentication**

JWTs are stateless — the server doesn't need to store them or look them up in a database. This scales horizontally because any server instance can verify the signature using the shared secret. But JWTs are hard to revoke before they expire, and you can't invalidate them without maintaining a blacklist. Session-based auth stores a session ID in a cookie and the session data in a database or Redis. This makes revocation easy (just delete the session), but every request requires a database lookup, which can become a bottleneck at scale. The MERN hybrid pattern — short JWTs for access, server-stored refresh tokens for rotation — gives you the scaling benefits of JWTs with the revocation capability of sessions.

**OAuth (Google/GitHub login) vs email/password auth**

OAuth doesn't replace your auth system — it just replaces the identity verification step. When a user logs in with Google, Google tells you "this person is who they say they are," but you still need to issue your own access and refresh tokens, store a user record in MongoDB, and enforce your own authorization rules. The flow is: user clicks "Login with Google" → redirect to Google → user approves → Google redirects back with an authorization code → your server exchanges that code for user info → you create or find the user in MongoDB → you issue your own tokens. OAuth reduces your responsibility for password storage and recovery, but your backend auth architecture doesn't change much.

**Passport.js vs custom authentication middleware**

Passport.js is a library that standardizes authentication strategies — it has pre-built strategies for local passwords, OAuth providers, SAML, and more. It handles the boilerplate of callback URLs, token exchange, and session management. For simple email/password with JWT, custom middleware is often simpler and gives you more control. But if you need multiple authentication methods (password, Google, GitHub, SAML) or you're using OAuth, Passport saves a lot of work. The underlying pattern — verify credentials, issue tokens, protect routes with middleware — is the same either way.

**bcrypt vs other password hashing algorithms**

bcrypt is the default choice because it's deliberately slow and includes a built-in work factor you can adjust as hardware gets faster. Argon2 is newer and considered more secure against GPU-based attacks, but bcrypt is still widely used and battle-tested. SHA-256 or MD5 are wrong choices for passwords — they're too fast, making brute-force attacks trivial. Never roll your own password hashing. bcrypt with a cost factor of 10-12 is the standard for MERN apps.

**Authorization at the route level vs at the resource level**

Route-level authorization uses middleware like `requireRole('admin')` on entire route groups. This is simple but coarse-grained — all routes under that prefix require the same role. Resource-level authorization checks ownership per request — like verifying that `req.user.id === post.authorId` before allowing a post update. You often need both: route-level checks for broad permissions (admin area, user dashboard) and resource-level checks for fine-grained permissions (users can only edit their own posts). Never rely solely on route-level checks if users can access resources they don't own.

## 8. 🧠 The Memory Hook

Auth is hotel check-in: bcrypt ledger for passwords, 15-minute day pass (access JWT in memory), reservation stub (refresh token in httpOnly cookie + DB hash). React shows which elevator buttons exist for UX, but Express middleware owns the actual locks.
