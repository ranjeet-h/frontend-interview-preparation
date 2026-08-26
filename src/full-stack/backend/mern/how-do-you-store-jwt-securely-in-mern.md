# How do you store JWT securely in MERN

## 1. The Real-World Problem — When You Actually Hit This

Your MERN app works in development, then a security review finds the access and refresh tokens in `localStorage`. One XSS bug, compromised dependency, or injected analytics script can read both values and send them to an attacker. A stolen access token works until it expires, while a stolen refresh token can keep producing new access tokens unless the server tracks and revokes it.

The storage decision is therefore a security boundary, not a React preference. You want JavaScript to handle short-lived API credentials without giving JavaScript the long-lived credential that can rebuild a session.

## 2. The Analogy — Make the Mechanic Obvious
In the browser, memory is the openly carried room key. An XSS payload can see it while the page is running, but a reload discards it. An `HttpOnly` cookie is the locked drawer: the browser can send it to the refresh endpoint, but page JavaScript cannot read it. `localStorage` is a photocopy left on the front desk; every script running in the page can copy it, and it remains after reload.

## 3. The Full Explanation — How It Actually Works

Use two credentials with different jobs and lifetimes:

- **Access token:** a signed JWT with a short lifetime, often 5 to 15 minutes. Return it once after login and keep it in JavaScript memory. Send it in an `Authorization: Bearer ...` header. Because the browser does not attach that header by itself, this API style is not vulnerable to ordinary cross-site form CSRF, but an active XSS bug can still use the token while the app is open.
- **Refresh token:** a high-entropy opaque random value, not a JWT the client needs to inspect. Put it in an `HttpOnly; Secure` cookie and never return it in JSON. Store only a hash of it in MongoDB, along with the user, expiry, session/device id, and whether it has been revoked. Hashing means a database read does not immediately reveal a usable token.

On login, the server issues both. On a page reload, React starts with no access token and calls `POST /auth/refresh`; the browser sends the cookie, and the server returns a new short-lived access token. On every successful refresh, rotate the refresh token: invalidate the presented record and issue a new random value. If an already-used refresh token appears again, treat it as replay, revoke the whole token family/session, and require login. This closes the useful window after a refresh token is copied.

Cookies are **ambient credentials**: the browser sends them automatically. Protect every cookie-authenticated state-changing endpoint, including refresh and logout, against CSRF. Prefer `SameSite: "lax"` or `"strict"` when the deployment allows it. Use `SameSite: "none"` only when the browser must send the cookie in a cross-site deployment, and pair it with `Secure: true`; add a CSRF token validated from a custom header, plus an exact CORS allowlist and `credentials: true`. “Cross-origin” does not automatically mean “cross-site,” so choose the setting from the actual site relationship and browser behavior.

Set `Secure` in production, scope the cookie with `Path: "/auth/refresh"`, and use an explicit expiry. `HttpOnly` blocks JavaScript reads; it does not stop XSS from making requests as the user while the victim is logged in. XSS prevention still needs output encoding, safe DOM APIs, dependency controls, a strong Content Security Policy, and careful third-party script review. JWT signatures provide integrity, not revocation: short access-token expiry and a server-side refresh-token store provide the operational control.

## 4. See It In Practice — Real Code or Queries

The following Express example uses `jsonwebtoken`, `cookie-parser`, and a Mongoose-like `RefreshSession` model. `hashToken` should be a SHA-256 digest, `createRefreshSession` should persist the hash and family id, and `rotateRefreshSession` should atomically invalidate the old record before creating its replacement.

**Login: access token in JSON, refresh token only in a cookie**

```js
import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

const hashToken = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const csrfCookieName = "csrf_token";
const csrfHeaderName = "X-CSRF-Token";

function issueCsrfCookie(req, res, next) {
  if (!req.cookies[csrfCookieName]) {
    res.cookie(csrfCookieName, crypto.randomBytes(32).toString("base64url"), {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
  next();
}

function requireCsrfHeader(req, res, next) {
  const cookieValue = req.cookies[csrfCookieName];
  const headerValue = req.get(csrfHeaderName);
  if (!cookieValue || !headerValue) return res.sendStatus(403);

  const cookieBytes = Buffer.from(cookieValue);
  const headerBytes = Buffer.from(headerValue);
  if (
    cookieBytes.length !== headerBytes.length ||
    !crypto.timingSafeEqual(cookieBytes, headerBytes)
  ) {
    return res.sendStatus(403);
  }
  next();
}

app.use(cookieParser());
app.use(issueCsrfCookie);

app.post("/auth/login", async (req, res, next) => {
  try {
    const user = await verifyPassword(req.body.email, req.body.password);
    const refreshToken = crypto.randomBytes(48).toString("base64url");
    await RefreshSession.create({
      userId: user.id,
      role: user.role,
      tokenHash: hashToken(refreshToken),
      familyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth/refresh",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const accessToken = jwt.sign(
      { sub: user.id, role: user.role },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: "10m", issuer: "mern-api", audience: "mern-web" }
    );
    res.json({ accessToken });
  } catch (error) {
    next(error);
  }
});
```

**Refresh: validate, rotate, and return only a new access token**

```js
app.post("/auth/refresh", requireCsrfHeader, async (req, res) => {
  const presented = req.cookies.refresh_token;
  if (!presented) return res.sendStatus(401);

  const session = await RefreshSession.findOne({
    tokenHash: hashToken(presented),
    revokedAt: null,
  });
  if (!session || session.expiresAt <= new Date()) return res.sendStatus(401);

  const replacement = crypto.randomBytes(48).toString("base64url");
  const rotated = await rotateRefreshSession(session, hashToken(replacement));
  if (!rotated) {
    await RefreshSession.revokeFamily(session.familyId); // replay detected
    return res.sendStatus(401);
  }

  res.cookie("refresh_token", replacement, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/refresh",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({
    accessToken: jwt.sign(
      { sub: session.userId, role: session.role },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: "10m", issuer: "mern-api", audience: "mern-web" }
    ),
  });
});
```

**React client: memory storage and refresh recovery**

```js
let accessToken = null;

export async function api(path, init = {}) {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  let response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && path !== "/auth/refresh") {
    const refresh = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "X-CSRF-Token": readCsrfTokenCookie() },
      credentials: "include",
    });
    if (!refresh.ok) {
      accessToken = null;
      return response;
    }
    accessToken = (await refresh.json()).accessToken;
    headers.set("Authorization", `Bearer ${accessToken}`);
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  }
  return response;
}
```

The CSRF cookie issued by `issueCsrfCookie()` is deliberately not `HttpOnly`; it contains no authentication secret. The server compares its value with the `X-CSRF-Token` header in `requireCsrfHeader()` and rejects requests without the expected pair. CORS must allow that header only for the real frontend origin. On logout, revoke the refresh-session record or family, clear the cookie with the same `path`, and set the in-memory access token to `null`.

The browser helper reads only the non-sensitive CSRF cookie; it cannot read the `HttpOnly` refresh cookie:

```js
const csrfCookieName = "csrf_token";

function readCsrfTokenCookie() {
  const prefix = `${csrfCookieName}=`;
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Where should access and refresh tokens live in a MERN SPA?**

Keep a short-lived access token in memory and a long-lived refresh token in an `HttpOnly; Secure` cookie. Store a hash of the refresh token server-side. This limits JavaScript exposure while keeping reload recovery and revocation possible. A BFF can go further by keeping both credentials server-side and giving the browser only a session cookie.

**Q: Does `HttpOnly` make a cookie safe from XSS?**

It prevents JavaScript from reading the cookie, which blocks the easiest token-exfiltration path. It does not make the account safe from an active XSS payload: that payload can call same-origin endpoints, and the browser will attach the cookie. XSS defenses and short access-token lifetimes are still required.

**Q: Why is CSRF still relevant if the refresh cookie is `HttpOnly`?**

`HttpOnly` controls reading, not automatic sending. A malicious site can try to cause the victim's browser to send a cookie-authenticated request. SameSite restrictions reduce that risk, but the application should also require and validate a CSRF token on state-changing cookie-authenticated routes. The access-token API itself uses an explicit header, so it does not rely on an ambient browser credential.

**Q: Why rotate refresh tokens, and what happens when one is reused?**

Rotation makes each refresh token single-use. The server atomically marks the presented token used or revoked and replaces it. If that old value appears again, the server cannot know whether the client or a thief has it, so it revokes the token family and forces a new login. Without rotation, a copied refresh token remains useful until its expiry.

**Q: Does a JWT support logout or immediate revocation by itself?**

No. A valid signed JWT remains valid until its `exp` time unless every request checks a denylist, which removes much of the statelessness benefit. Keep access tokens short-lived, revoke refresh sessions on logout or password reset, and use a denylist only when the risk and latency cost justify it.

## 6. The Traps — What Goes Wrong in Production

**Putting either token in `localStorage` or `sessionStorage`.** Both are readable by any JavaScript that runs in the page. `sessionStorage` disappearing with the tab does not change the XSS exposure; use memory for the access token and an `HttpOnly` cookie for the refresh token.

**Using `SameSite: "none"` by default.** `None` is for cross-site cookie delivery and requires `Secure`; it increases CSRF exposure and can be rejected on insecure local development. Start with `lax` or `strict` when the frontend and API are same-site, and add an explicit CSRF defense when `none` is necessary.

**Treating CORS as CSRF protection.** CORS controls which browser JavaScript may read a response. It does not by itself prevent every cross-site request from being sent with cookies. Use SameSite and CSRF tokens for cookie-authenticated mutations, and configure CORS with a specific origin rather than `*` when credentials are enabled.

**Returning the refresh token in the login response.** The moment frontend code puts that value in storage, an XSS bug can steal the credential with the longest lifetime. Set it as a cookie on the server and return only the access token.

**Rotating without an atomic update.** Two concurrent refresh requests can both accept the same old token if validation and invalidation are separate operations. Use a conditional update or transaction so only one request consumes the token; revoke the family when reuse is detected.

**Assuming logout revokes an access JWT.** Clearing a cookie does not invalidate an already-issued bearer token. The client should discard its memory copy, while the server revokes refresh state and relies on the short access-token TTL or an explicit denylist for immediate invalidation.

## 7. Compare With Related Concepts

**Memory vs `sessionStorage`:** memory is lost on reload and is still visible to XSS while the page runs; `sessionStorage` survives reloads within a tab but is equally readable by page JavaScript. Use memory when reducing token persistence matters.

**Cookie authentication vs bearer authentication:** cookies are attached automatically and therefore need CSRF defenses; bearer tokens in an `Authorization` header are not automatically attached but must be protected from XSS. Choose the boundary deliberately rather than calling one universally safe.

**JWT vs opaque session id:** a JWT can be verified locally and carries claims, but revocation is harder and claims become stale. An opaque id needs a server lookup but gives straightforward session invalidation. Choose opaque sessions when central control matters more than local verification.

**Refresh token rotation vs token renewal:** renewal extends the same credential; rotation invalidates the old credential and issues a new one. Use rotation when replay detection and session theft response matter.

## FORMAT E — The Memory Hook — What Sticks

Carry the short room key in memory, and keep the document that can print new keys in the browser's locked `HttpOnly` drawer. The server must remember which documents are valid, rotate them one use at a time, and treat an old document reappearing as a break-in signal.
