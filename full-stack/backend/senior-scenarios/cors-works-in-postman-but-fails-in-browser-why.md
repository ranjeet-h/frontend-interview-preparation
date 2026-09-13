# CORS Works in Postman but Fails in Browser — Why

## 1. The Real-World Problem — When You Actually Hit This

You ship a new API. You test it in Postman — `GET https://api.yourapp.com/users` returns 200 instantly. You wire up `fetch("https://api.yourapp.com/users")` from `https://yourapp.com` in the browser, open DevTools, and see red:

```
Access to fetch at 'https://api.yourapp.com/users' from origin
'https://yourapp.com' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

Or worse, the simple GET works but a `POST` with `Content-Type: application/json` fails. The network tab shows an `OPTIONS` request that returned 403, and your real request never even fired. Postman never complained. Your backend logs show the handler was never reached for that OPTIONS call.

This is the moment every full-stack developer hits. No amount of frontend retry logic fixes it — the browser is refusing to send the request at all, and the fix lives on the server. Understanding why Postman succeeds and the browser blocks you is understanding how CORS actually works.

## 2. The Analogy — Make the Mechanic Obvious

Think of the browser as a bouncer at an exclusive club, and every web page as a guest.

- Your frontend at `https://yourapp.com` is a guest who walked in with a wristband that says "I belong to yourapp.com."
- When that guest tries to call a friend at `https://api.yourapp.com` to fetch data, the bouncer steps in: "Hold on — is that other club on your guest list?"
- The bouncer checks with the other club: "Hey, do you allow visitors from yourapp.com?" The other club replies with a guest list — the `Access-Control-Allow-Origin` header.
- If `yourapp.com` is on the list, the bouncer lets the call through. If not, the call is blocked right there at the door — even though the other club's phone line works fine.

Postman is like calling that same friend from your personal phone at home. There is no bouncer. You dial directly — no wristband, no guest list check, no blocked call. `curl` and Postman don't enforce the browser's security policy. That is why the same request works in Postman and fails in the browser — it was never the server that was broken, it was the bouncer saying no.

For trickier requests (like a `POST` with JSON or a custom header), the bouncer does a "phone-ahead" check first — an `OPTIONS` preflight — asking "if I send this kind of request, will you allow it?" Only if the other club says yes to the method, headers, and origin does the real request go through.

## 3. The Full Explanation — How It Actually Works

CORS is a browser policy, not a server firewall. CORS (Cross-Origin Resource Sharing) is enforced entirely by the browser. The server just declares who is allowed via response headers. No browser means no enforcement — which is exactly why Postman, curl, mobile apps, and server-to-server calls are unaffected.

The Same-Origin Policy (SOP) is the default: a page at `https://yourapp.com` cannot read responses from `https://api.yourapp.com` unless the API explicitly opts in via CORS headers. The origin is the triple of scheme + host + port — `https://yourapp.com:443` and `http://yourapp.com:3000` are different origins, even though the domain looks similar.

The browser sends Origin, the server replies with Allow-Origin. Every cross-origin request from a browser automatically includes an `Origin` header:

```
Origin: https://yourapp.com
```

The server must echo back whether that origin is allowed:

```
Access-Control-Allow-Origin: https://yourapp.com
```

If that header is missing or doesn't match the request origin, the browser blocks the response from reaching your JavaScript — even though the HTTP response arrived. You see the failure in DevTools, not in server logs.

Simple requests vs preflighted requests. Not every cross-origin request triggers a preflight. The browser splits them into two paths:

**Simple requests** go straight through (no OPTIONS). They must satisfy all three:

- Method is `GET`, `HEAD`, or `POST`
- Only allowed headers: `Accept`, `Accept-Language`, `Content-Language`, `Content-Type` (but only `application/x-www-form-urlencoded`, `multipart/form-data`, or `text/plain`)
- No custom headers, no `ReadableStream` body tricks

**Everything else triggers a preflight** — an automatic `OPTIONS` request the browser sends before the real one:

```
OPTIONS /users HTTP/1.1
Origin: https://yourapp.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: content-type, authorization
```

The server must respond with:

```
Access-Control-Allow-Origin: https://yourapp.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400
```

If the preflight fails (missing headers, 403, 404, redirect), the browser never sends the real request. `POST` with `application/json` always triggers a preflight because `application/json` is not in the simple content-type allowlist — this is why "GET works but POST fails" is so common.

Credentials change the rules. When your frontend sends cookies or uses `fetch(..., { credentials: "include" })` or `withCredentials: true`, two strict rules apply:

- `Access-Control-Allow-Origin` cannot be `*`. It must be an explicit origin like `https://yourapp.com`.
- `Access-Control-Allow-Credentials: true` must be present.

If either is wrong, the browser blocks the response even if the preflight looked fine. This is the most common production CORS mistake after deploying auth.

Why Postman has no origin check. Postman and curl set no `Origin` by default and don't validate responses. They show you exactly what the server returned. The server may have returned `200` with no CORS headers at all — Postman shows success, the browser shows a CORS error for the same response. If you manually add `Origin: https://yourapp.com` in Postman, you'll see the missing headers yourself:

```bash
curl -H "Origin: https://yourapp.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS --verbose \
     https://api.yourapp.com/users
```

If this returns no `Access-Control-Allow-Origin`, you've reproduced the browser failure without a browser.

Where the fix lives. CORS is configured on the server that receives the request — the API, not the frontend. Three common fix locations:

- **API framework middleware** (Express `cors`, FastAPI `CORSMiddleware`) — the right place for most apps.
- **Reverse proxy** (Nginx, CloudFront, API Gateway) — when the proxy strips or overrides headers.
- **Frontend dev proxy** (Vite/Webpack proxying `/api` to the backend) — only hides the problem in development by making the request same-origin. It does not fix production.

Fixing it means: handle `OPTIONS` correctly, return the right `Allow-Origin` for the requesting origin, list allowed methods and headers, and handle credentials without a wildcard.

## 4. See It In Practice — Real Code or Queries

Express (Node.js) — correct CORS setup.

```js
// server.js — Express API at https://api.yourapp.com
import express from "express";
import cors from "cors";

const app = express();

// Allow only your real frontend origins, handle preflight, support cookies
const allowedOrigins = ["https://yourapp.com", "http://localhost:5173"];

app.use(cors({
  origin(origin, callback) {
    // Allow same-origin / non-browser tools with no Origin header (curl, Postman, health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // sets Access-Control-Allow-Credentials: true
  maxAge: 86400,      // cache preflight for 24h so browser skips OPTIONS next time
}));

app.use(express.json());

app.get("/users", (req, res) => {
  res.json([{ id: 1, name: "Asha" }]);
});

app.post("/users", (req, res) => {
  // This POST with application/json always triggers a preflight before reaching here
  res.status(201).json({ id: 2, ...req.body });
});

// Important: handle OPTIONS for every route (cors middleware does this above,
// but if you write manual headers, add an explicit handler)
app.options("*", cors());

app.listen(4000, () => console.log("API on :4000"));
```

```js
// frontend — https://yourapp.com
// Without credentials (no cookies)
fetch("https://api.yourapp.com/users")
  .then((r) => r.json())
  .then(console.log)
  .catch(console.error); // CORS error lands here if headers missing

// With cookies/auth — requires credentials: "include" AND server credentials: true
fetch("https://api.yourapp.com/users", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Asha" }),
});
```

FastAPI (Python) — correct CORS setup.

```python
# main.py — FastAPI API at https://api.yourapp.com
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

allowed_origins = [
    "https://yourapp.com",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,       # explicit list — never ["*"] when cookies are used
    allow_credentials=True,              # sends Access-Control-Allow-Credentials: true
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=86400,
)

@app.get("/users")
def list_users():
    return [{"id": 1, "name": "Asha"}]

@app.post("/users")
def create_user(payload: dict):
    # Browser sends OPTIONS first for this route because of application/json
    return {"id": 2, **payload}
```

FastAPI gotcha: `CORSMiddleware` must be added before other middleware that might short-circuit the response, and `allow_origins=["*"]` combined with `allow_credentials=True` will raise an error at startup by design — it refuses to create the insecure combination.

The credentials + wildcard trap — broken vs fixed.

```js
// BROKEN — browser will block this even though Postman shows 200
app.use(cors({
  origin: "*",               // wildcard
  credentials: true,         // credentials need an explicit origin
}));
fetch("https://api.yourapp.com/users", { credentials: "include" });
// Console: "The value of 'Access-Control-Allow-Origin' must not be '*'
//           when credentials mode is 'include'"

// FIXED — echo the requesting origin explicitly
app.use(cors({
  origin: ["https://yourapp.com"],
  credentials: true,
}));
```

Manual headers without a library — use only if you understand preflight.

```js
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin"); // critical for caches — prevents cached * response leaking
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
    return res.sendStatus(204); // preflight response has no body
  }
  next();
});
```

Missing `Vary: Origin` when echoing origins is a real production bug — a CDN caches the response for one origin and serves it to another.

Dev proxy — hides CORS locally, not in production.

```js
// vite.config.js — makes /api same-origin in dev only
export default {
  server: {
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
};
// fetch("/api/users") works in dev because browser sees same origin,
// but https://yourapp.com -> https://api.yourapp.com still needs real CORS in prod.
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Why does the same API work in Postman but fail in the browser with a CORS error?**

Because CORS is enforced only by the browser. Postman and curl don't implement the Same-Origin Policy — they just show whatever the server returned. The browser, on the other hand, checks the `Access-Control-Allow-Origin` header on every cross-origin response before it lets your JavaScript see it. If that header is missing or doesn't match the page's origin, the browser blocks access and logs a CORS error. The server responded fine — the browser refused to hand the response to your code.

**Q: What is the Same-Origin Policy and how does CORS relate to it?**

The Same-Origin Policy is the browser's default rule: a page at one origin (scheme + host + port) cannot read responses from a different origin. It exists to prevent one site from silently reading your bank's data using your cookies. CORS is the controlled exception — the server sends headers like `Access-Control-Allow-Origin` to tell the browser "I intentionally allow `https://yourapp.com` to read my responses." Without those headers, SOP stays in effect and the read is denied.

**Q: What triggers a preflight (OPTIONS) request and what does it do?**

Any cross-origin request that isn't "simple" triggers a preflight. That includes `PUT`, `DELETE`, `PATCH`, any request with `Content-Type: application/json`, any custom header like `Authorization`, and requests with credentials in some flows. The browser automatically sends an `OPTIONS` request first with `Access-Control-Request-Method` and `Access-Control-Request-Headers` to ask the server "will you allow this kind of request from this origin?" Only if the server responds with matching `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` does the browser send the real request. If the preflight returns 403, 404, or missing headers, the real request never fires.

**Q: What is a simple request and why does `POST` with JSON still trigger a preflight?**

A simple request must use `GET`, `HEAD`, or `POST`, only allowlist headers (`Accept`, `Accept-Language`, etc.), and only three content types: `application/x-www-form-urlencoded`, `multipart/form-data`, or `text/plain`. `application/json` is not on that list, so every `POST` or `PUT` with a JSON body triggers a preflight. That is why `GET /users` can work while `POST /users` with a JSON body is blocked — they take different CORS paths.

**Q: How do you fix CORS on an Express or FastAPI backend?**

On Express, use the `cors` middleware with an explicit allowlist and handle `OPTIONS`. On FastAPI, use `CORSMiddleware` with `allow_origins` as an explicit list. In both cases you must set allowed methods, allowed headers, and `credentials` correctly, ensure `OPTIONS` returns 204 with the right headers, and never use a wildcard origin when sending cookies. The fix is always on the API server (or the proxy in front of it), not in frontend code. For Express, allow non-browser requests that send no `Origin` if you have health checks; for FastAPI, put `CORSMiddleware` first so it isn't skipped by other middleware.

**Q: Why does `Access-Control-Allow-Origin: *` fail when you use `credentials: "include"`?**

When credentials (cookies, HTTP auth, client certs) are involved, the spec forbids a wildcard origin because it would be equivalent to saying "any site on the internet can read this user's authenticated response." The browser enforces this strictly: if `fetch` used `credentials: "include"` and the response has `Allow-Origin: *`, the browser blocks it regardless of the status code. You must echo the specific requesting origin and also send `Access-Control-Allow-Credentials: true`.

**Q: Why does `GET` work but `PUT`/`DELETE` fail, or why does the preflight return 403?**

Often because the server or a proxy only handles `GET`/`POST` and either returns 403 for `OPTIONS` or doesn't include `PUT`/`DELETE` in `Access-Control-Allow-Methods`. Common culprits: Nginx or an API gateway blocking `OPTIONS` before it reaches the app, the framework handling `OPTIONS` as a regular route that hits auth middleware and rejects it, or a missing `Access-Control-Allow-Headers` for the headers the frontend actually sends. The fix is to ensure `OPTIONS` is handled before auth, returns 204 with the right allow headers, and is not swallowed by a WAF or proxy rule.

**Q: Is CORS an authentication or security mechanism? Can it be bypassed?**

CORS is not authentication and not a security boundary for the server — it's a browser-side restriction that protects the user from a malicious site reading cross-origin responses. It can be bypassed by anything that isn't a browser (curl, Postman, a server, a native app). A misconfigured CORS that allows `*` or reflects any `Origin` without thought does not give attackers server access, but it does allow a malicious site to trick the browser into reading authenticated responses from your API via the user's cookies — which is a real data leak. So CORS matters for confidentiality of responses in the browser context, but it never replaces auth.

**Q: How do you debug a CORS failure?**

First open DevTools Network tab and look for the failing request or its preflight `OPTIONS` — the error message names the missing header. Then reproduce without the browser:

```bash
curl -H "Origin: https://yourapp.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS --verbose \
     https://api.yourapp.com/users
```

Check that the response includes `Access-Control-Allow-Origin` matching your frontend origin, the right methods, and `Allow-Credentials` if needed. If the preflight is missing, check whether a proxy (Nginx, CloudFront, API Gateway), WAF, or auth middleware is intercepting `OPTIONS` before your app. Also check that `Vary: Origin` is set when echoing origins, so a CDN doesn't serve a cached response from a different origin.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: `Allow-Origin: *` with `Allow-Credentials: true`.**
This is the most frequent production CORS bug after shipping auth. It looks correct because the server did return the origin header, but the browser rejects the wildcard + credentials combination outright. The API returns 200, Postman shows success, the browser shows a CORS error, and the frontend team thinks the backend is broken. Fix: switch from `*` to an explicit allowlist and echo the requesting origin.

**Trap 2: Preflight handled after auth middleware.**
If your auth middleware runs before CORS, the automatic `OPTIONS` request has no `Authorization` header yet (the browser strips it from preflights) and gets rejected with 401. The real request never fires and the error looks like a CORS failure. Fix: handle `OPTIONS` / CORS before auth, and let preflight return 204 without requiring authentication.

**Trap 3: Proxy or CDN stripping CORS headers.**
You configure CORS correctly in Express/FastAPI, but Nginx, CloudFront, or API Gateway sits in front and either doesn't forward `Origin` to the app or strips the `Access-Control-*` headers on the way back. Locally everything works; in production CORS is broken. Fix: configure the proxy to forward/return CORS headers, or move CORS handling to the proxy layer itself, not both.

**Trap 4: Missing `Vary: Origin` with dynamic origins.**
When you echo `Access-Control-Allow-Origin: https://yourapp.com` per-request, caches (CDN, Nginx, Cloudflare) may cache that response and serve it to `https://evil.com`. Without `Vary: Origin`, the cache key doesn't include the origin. Fix: always set `Vary: Origin` when reflecting origins.

**Trap 5: Forgetting `Allow-Headers` for `Authorization` or custom headers.**
The frontend sends `Authorization: Bearer ...` but the server only allows `Content-Type`. The preflight asks for `Authorization` and the server doesn't list it, so the browser blocks the request. Fix: explicitly list every header the frontend actually sends, including custom ones like `X-Request-Id` or `X-CSRF-Token`.

**Trap 6: Redirects killing CORS headers.**
If the API redirects `http` to `https` or adds a trailing-slash redirect, the redirect response typically has no CORS headers. The browser treats the redirect itself as a CORS failure. Fix: ensure CORS headers are present on redirect responses too, or avoid cross-origin redirects entirely.

**Trap 7: Thinking a Vite/Webpack dev proxy is a production fix.**
`vite.config` proxy makes `/api` same-origin in development so CORS disappears locally. Deployed, the frontend at `https://yourapp.com` still calls `https://api.yourapp.com` cross-origin and CORS is back. Fix: treat the dev proxy as a dev-only convenience and configure real CORS on the production API.

**Trap 8: Over-permissive `Allow-Headers: *` or reflecting any origin.**
Allowing every header or echoing `*` for `Allow-Headers` works in some browsers but not all (older browsers reject `*` for `Allow-Headers` on credentialed requests). Reflecting any `Origin` that arrives (`res.setHeader("Allow-Origin", req.headers.origin)`) without an allowlist effectively disables the Same-Origin Policy for your API. Fix: use an explicit allowlist for both origins and headers.

## 7. Compare With Related Concepts

**CORS vs Same-Origin Policy (SOP).**
SOP is the default rule — "no cross-origin reads." CORS is the opt-in exception — "this server explicitly allows these origins to read." You can't understand CORS errors without knowing SOP is what's blocking you in the first place. Rule: SOP is the wall; CORS is the signed permission slip taped to it.

**CORS vs CSRF (Cross-Site Request Forgery).**
They sound similar because both involve cross-origin requests, but they protect opposite things. CORS prevents a malicious site from reading your API's response in the browser. CSRF prevents a malicious site from making a state-changing request (like a `POST /transfer`) using the user's cookies without their knowledge — and CORS does not prevent that. A CSRF attacker doesn't need to read the response; they just need the request to succeed. Rule: use CORS for read confidentiality; use CSRF tokens or `SameSite` cookies for write protection. You need both.

**CORS vs `SameSite` cookies / `Content-Security-Policy`.**
`SameSite` controls whether the browser sends cookies on cross-site requests at all (mitigates CSRF). CSP controls which origins the page itself is allowed to load resources from (scripts, frames). CORS controls whether the page is allowed to read the response from a cross-origin fetch. They are three independent browser gates. Rule: CORS = "can I read the response?"; SameSite = "do cookies even travel?"; CSP = "what can this page load?"

**Simple vs preflighted requests.**
Simple requests skip the OPTIONS check and go straight to the server; the browser only checks headers on the response. Preflighted requests ask permission first via OPTIONS, then send the real request only if allowed, and then check response headers again. Rule: if the request has JSON, custom headers, or a method beyond GET/POST/HEAD, expect a preflight.

**Dev proxy vs real CORS.**
A dev proxy rewrites the request so the browser thinks it's same-origin — no CORS check at all. Real CORS leaves the cross-origin call as-is and adds server headers so the browser allows it. Rule: proxy for local DX; real headers for production.

## 8. 🧠 The Memory Hook — What Sticks

The browser is the bouncer, not the API. Postman has no bouncer — it calls direct. The server's CORS headers are the guest list. If your fetch is blocked but Postman sees 200, don't fix the frontend — fix the guest list: handle `OPTIONS`, echo the real origin (never `*` with cookies), and add `Vary: Origin`.
