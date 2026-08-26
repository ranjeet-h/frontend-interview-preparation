# How do you handle CORS in MERN

## 1. The Real-World Problem — When You Actually Hit This

The React app worked locally because it called `http://localhost:5000` from a page served at `http://localhost:3000`. After deployment, the page is at `https://app.example.com` and the API is at `https://api.example.com`. The login request now fails in the browser, often before the Express route runs, and the console reports a CORS error.

This is confusing when `curl` or Postman still works. The API may be healthy; the browser is refusing to expose its response to a page from an unapproved origin. The production fix is an explicit origin policy on Express, with cookie and preflight settings that agree with the frontend.

## 2. The Analogy — Make the Mechanic Obvious

Think of the browser as a mailroom protecting a tenant's private mail. A React page from one address asks the mailroom to fetch a letter from an API at another address. The API can attach a permission slip saying which page address may read the letter.

Express owns the allowlist and writes the permission headers. A normal request is delivered first and checked before its response is shown. A request that needs special handling first sends an `OPTIONS` preflight, like asking whether a later package with a particular method and headers will be accepted. The preflight approves only the origin, method, and headers named in that request.

## 3. The Full Explanation — How It Actually Works

An origin is the exact combination of scheme, host, and port. `http://localhost:3000` and `http://localhost:5000` differ by port, while `https://app.example.com` and `https://api.example.com` differ by host. The browser's same-origin policy prevents a page from freely reading cross-origin responses. CORS is the server response policy that lets the browser make a specific exception.

For an allowed request, Express commonly sends `Access-Control-Allow-Origin` with the requesting origin. If cookies or other browser credentials are part of the design, it also sends `Access-Control-Allow-Credentials: true`. Credentialed CORS cannot use `Access-Control-Allow-Origin: *`; the browser requires one explicit origin. `credentials: true` concerns cookies and other browser-managed credentials. It is not required merely because a request contains a bearer `Authorization` header, although that header must be listed in `Access-Control-Allow-Headers` when the request is preflighted.

Some requests are simple enough to send directly. A `PUT`, `DELETE`, JSON request, or request with a non-safelisted header commonly causes a preflight. The browser sends `OPTIONS` with `Origin`, `Access-Control-Request-Method`, and possibly `Access-Control-Request-Headers`. The server must answer with compatible allow-origin, allow-methods, and allow-headers values. Only then does the browser send the real request. `app.use(cors(options))` handles these preflights when registered before the routes.

The server still authenticates and authorizes every request. CORS is not an API firewall: another server can call the endpoint directly, and `curl` does not enforce browser CORS. Browser enforcement protects a user's browser from letting an untrusted page read a response. It does not make an endpoint private.

Cookie authentication adds separate rules. The frontend must opt in with `credentials: 'include'` or Axios `withCredentials: true`; Express must allow credentials; and the cookie attributes must fit the deployment. Separate subdomains such as `app.example.com` and `api.example.com` are cross-origin but same-site when they use the same scheme and registrable domain, so `SameSite=Lax` can be appropriate. A genuinely cross-site cookie needs `SameSite=None; Secure`, which requires HTTPS. `HttpOnly` prevents page JavaScript from reading the cookie but does not by itself stop CSRF, so cookie-authenticated state-changing routes also need CSRF protection or an appropriate same-site design.

## 4. See It In Practice — Real Code or Queries

This CommonJS example uses the `cors` and `cookie-parser` packages. Set `FRONTEND_ORIGINS` to a comma-separated allowlist.

```javascript
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // A missing Origin is common for non-browser clients; API auth still applies.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions)); // Register before routes so OPTIONS is handled.
app.use(express.json());
app.use(cookieParser());

app.get('/api/profile', (req, res) => {
  res.json({ userId: 'user-123' });
});

app.listen(5000, () => console.log('API listening on port 5000'));
```

For a cookie-based refresh token, the browser and server settings must agree:

```javascript
// Demo stub; replace with the application's signed, persisted refresh-token flow.
function issueRefreshToken(email) {
  return `demo-refresh-token:${email}`;
}

app.post('/api/login', (req, res) => {
  const refreshToken = issueRefreshToken(req.body.email);

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_CROSS_SITE === 'true',
    sameSite: process.env.COOKIE_CROSS_SITE === 'true' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({ ok: true });
});
```

The React request opts into cookies. A bearer-token request would still need `Authorization` in the server's allowed headers, but it does not need `credentials: 'include'` just because that header exists.

```javascript
const response = await fetch('https://api.example.com/api/profile', {
  credentials: 'include',
  headers: { Accept: 'application/json' }
});

if (!response.ok) throw new Error(`Request failed: ${response.status}`);
const profile = await response.json();
```

If a reverse proxy serves the React files and forwards `/api` to Express on the same public origin, the browser calls `/api/profile` and no CORS exception is needed. That does not remove authentication, authorization, or CSRF responsibilities.

## 5. Interview Questions — All of Them, Done Properly

**Q: What exactly does CORS protect?**

CORS controls whether browser JavaScript from one origin may read a response from another origin. It is enforced by the browser, not by Express or MongoDB. It does not stop direct server-to-server calls, so real protection still comes from authentication, authorization, validation, rate limits, and network controls where appropriate.

**Q: How do you choose allowed origins in development and production?**

Use an explicit environment-specific allowlist. Development may include `http://localhost:3000` and `http://localhost:5173`; production should contain the exact HTTPS origins that the team operates. Do not reflect any incoming `Origin` blindly or use `*` for a private credentialed API. Origin matching includes scheme, host, and port.

**Q: What is a preflight and how do you support it?**

It is the browser's `OPTIONS` request before a non-simple cross-origin request. The request states the intended method and headers. CORS middleware must run before routes and answer with compatible allow-origin, allow-methods, and allow-headers headers. A successful preflight only permits the next request; the route must still authenticate and authorize it.

**Q: What must align for cross-origin cookies?**

The frontend must send `credentials: 'include'` or `withCredentials: true`, Express must send an explicit allowed origin plus `Access-Control-Allow-Credentials: true`, and the cookie must have compatible `SameSite`, `Secure`, domain, and path attributes. Cross-origin subdomains on the same site can use `SameSite=Lax` when the deployment uses the same scheme and registrable domain; a genuinely cross-site cookie needs `SameSite=None; Secure` over HTTPS. These settings make cookie transport work; they are not a substitute for CSRF defenses.

**Q: Why configure allowed methods and headers?**

They describe what the browser may send after a preflight. If the frontend sends `PATCH` with `Authorization` but the server allows only `GET` and `Content-Type`, the browser stops before the route. Allow only the methods and headers the application actually uses.

## 6. The Traps — What Goes Wrong in Production

`origin: '*'` with credentials is invalid for browser credentialed CORS. The browser rejects a wildcard origin when credentials are included. Use a checked allowlist and return the specific request origin only after it matches.

Adding `credentials: true` because the request has a bearer token is a category error. That option controls browser-managed credentials such as cookies; a bearer header is governed by normal API authentication and, when preflighted, `Access-Control-Allow-Headers`.

Allowing `*` for methods or headers can hide a frontend/backend mismatch and grants broader browser permission than necessary. List the methods and headers the contract needs, especially `Authorization` and `Content-Type`.

Putting CORS after the routes leaves an `OPTIONS` request without the required response headers. Register the middleware before parsing and route middleware so preflight handling is reached consistently.

Treating a CORS error as proof that the API is unreachable wastes debugging time. Inspect the browser Network panel, the `Origin` request header, the `OPTIONS` response, and the exact response headers. Then test endpoint authentication separately with server-side tools.

Assuming `localhost` is one origin causes environment bugs. Port, scheme, and host all matter, so `http://localhost:3000` is not `http://localhost:5173`, and either is not `https://localhost:3000`.

## 7. Compare With Related Concepts

**CORS vs same-origin policy:** The same-origin policy is the browser restriction. CORS is the server-controlled response mechanism that selectively relaxes it. Use CORS when separate browser origins must communicate; use a same-origin reverse proxy when that fits the deployment.

**CORS vs CSRF:** CORS governs whether a page can read a cross-origin response. CSRF is about tricking a browser that already has cookies into performing a state-changing action. Use CSRF tokens or a robust same-site cookie strategy for cookie-authenticated mutations; never treat CORS as CSRF protection.

**CORS vs authentication and authorization:** CORS answers "which browser origins may read?" Authentication answers "who is calling?" Authorization answers "what may that caller do?" Use all three at their own boundary.

**CORS vs a reverse proxy:** A reverse proxy can expose the frontend and API under one public origin, removing browser CORS work. It does not remove API security or make a bearer token or cookie trustworthy by itself. Choose it when unified routing simplifies operations; choose explicit CORS when separate origins are intentional.

## 8. 🧠 The Memory Hook

CORS is a browser permission slip, not a locked API door. The browser asks, Express names the exact origin, method, and headers it accepts, and only then may browser JavaScript read the response; authentication still guards the actual endpoint.
