# CORS (Cross-Origin Resource Sharing): Security Model, Preflight Mechanics, and Configuration

## 1. Why This Exists — The Problem First

Picture a junior frontend engineer building a dashboard on `http://localhost:5173`. They write a standard `fetch('http://localhost:8000/api/users')` to load customer profiles. The browser immediately halts the request and spits out a wall of red in the developer console:

`Access to XMLHttpRequest at 'http://localhost:8000/api/users' from origin 'http://localhost:5173' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`

Panic sets in. The engineer asks the backend team for help. A developer finds a quick fix on an online forum and applies a wildcard header across all API endpoints:

`Access-Control-Allow-Origin: *`

The red error disappears, everyone celebrates, and the code goes to production.

Two weeks later, the company suffers a major data breach. Here is what actually happened: a customer logged into their bank account on `https://banking.example.com`, receiving an active session cookie. While keeping that tab open, they clicked a phishing link leading to `https://evil-hacker.com`. The malicious site executed background JavaScript calling `https://banking.example.com/api/transfers`. Because the backend had disabled origin protections with wildcards and broken credential handling, the attacker's script silently executed financial transfers and exfiltrated private customer records directly through the victim's authenticated browser session.

CORS exists because the web is built on an open architecture where any webpage can instruct a user's browser to send an HTTP request to any server in the world. Without a strict security boundary, every authenticated service on the internet would be vulnerable to immediate data theft whenever a user visited an untrusted website.

## 2. The Analogy — Make It Obvious

Think of your browser as a bonded, hyper-vigilant **armored courier** hired by a client.

* **The Origin:** Your client's home address (for example, `Apartment 5173 on Port Street`).
* **The Target Server:** A private bank vault (`Building 8000 on Enterprise Avenue`).
* **The Same-Origin Policy (SOP):** The courier's foundational contract: *"I will only deliver sensitive packages and bring back documents between rooms inside the same building. If a client from Apartment 5173 tells me to fetch financial records from Building 8000, I will not let Apartment 5173 read those records unless Building 8000 explicitly hands me a signed letter of authorization naming Apartment 5173."*
* **The Simple Request:** The client asks the courier to drop off a standard letter at Building 8000. The courier delivers the letter. Building 8000 reads it and hands back an envelope of records. The courier inspects the outside of the envelope. If Building 8000 did not write *"Approved for Apartment 5173"* on the front, the courier instantly shreds the envelope. The bank processed the letter, but the client who ordered the delivery never sees the contents.
* **The Preflight (`OPTIONS`):** The client asks the courier to deliver a complex package containing special custom keys (`Authorization: Bearer token`) and instructions to modify account settings (`DELETE` or `PUT`). The courier refuses to bring the package immediately. Instead, the courier runs a quick advance scouting trip with zero cargo: *"Hey Building 8000, client Apartment 5173 wants to send a DELETE command with custom security keys. Do you accept this?"* Building 8000 checks its guest list and replies: *"Yes, Apartment 5173 is authorized for DELETE operations and custom keys for the next 24 hours."* Only after receiving this permission slip does the courier return home, pick up the actual payload, and deliver it.

## 3. How It Actually Works — The Full Explanation

CORS (Cross-Origin Resource Sharing) is a browser-enforced HTTP header protocol that gives servers a mechanism to selectively relax the browser's default **Same-Origin Policy (SOP)**.

To understand CORS, you must understand four foundational building blocks: what constitutes an origin, who CORS actually protects, how browsers categorize requests, and how the critical CORS headers coordinate access.

**What Is an Origin?**

An origin is strictly defined by the three-part tuple of **Protocol (Scheme) + Hostname (Domain) + Port**:

`https://api.example.com:443`

If any single component differs between the caller and the target, the request is cross-origin:

* `http://example.com` vs `https://example.com` $\rightarrow$ **Cross-Origin** (Different protocol: HTTP vs HTTPS)
* `https://example.com` vs `https://api.example.com` $\rightarrow$ **Cross-Origin** (Different subdomain/host)
* `http://localhost:3000` vs `http://localhost:8000` $\rightarrow$ **Cross-Origin** (Different port)
* `https://example.com/users` vs `https://example.com/orders` $\rightarrow$ **Same-Origin** (Paths do not alter origin)

**The Invariant: CORS Protects Users, Not Servers**

A common point of confusion is believing CORS is a backend firewall. It is not.

When a cross-origin request is blocked by CORS, **the backend server still receives, executes, and processes the request**. The browser intercepts the server's response headers before handing the payload to client-side JavaScript. If the proper `Access-Control-Allow-Origin` header is absent, the browser suppresses the response data and raises a runtime JavaScript error.

Non-browser clients like `curl`, Postman, Python scripts, and backend microservices do not enforce the Same-Origin Policy. They bypass CORS entirely because CORS is a security contract between the **browser** and the **server** to protect the **end user** from malicious client-side scripts.

**Request Types: Simple vs Preflighted Requests**

Browsers split cross-origin network operations into two distinct workflows:

**1. Simple Requests (No Preflight)**

A request is considered "simple" if it meets all of the following criteria:
* HTTP Method is `GET`, `HEAD`, or `POST`.
* Only CORS-safelisted headers are manually set: `Accept`, `Accept-Language`, `Content-Language`, or `Content-Type`.
* `Content-Type` is limited to:
  * `application/x-www-form-urlencoded`
  * `multipart/form-data`
  * `text/plain`

Workflow:
1. The browser dispatches the HTTP request immediately, appending an `Origin` header (for example, `Origin: https://app.example.com`).
2. The server processes the request and sends the response.
3. The browser checks if `Access-Control-Allow-Origin` in the response matches the requesting origin or is `*`.
4. If yes, client JavaScript gets the data. If no, the browser blocks JavaScript from reading the response.

**2. Preflighted Requests (Pre-check with `OPTIONS`)**

If a request fails any simple request requirement, it triggers a preflight. Triggers include:
* HTTP Methods such as `PUT`, `PATCH`, `DELETE`.
* Custom headers such as `Authorization`, `X-Api-Key`, or `X-Requested-With`.
* `Content-Type` set to `application/json` (which accounts for virtually all modern REST and GraphQL APIs).

Workflow:
1. Before sending the actual payload, the browser automatically sends an HTTP `OPTIONS` request with metadata headers:
   * `Origin: https://app.example.com`
   * `Access-Control-Request-Method: DELETE`
   * `Access-Control-Request-Headers: authorization, content-type`
2. The server inspects these headers without executing any database modifications or business logic.
3. The server responds with CORS permission headers:
   * `Access-Control-Allow-Origin: https://app.example.com`
   * `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
   * `Access-Control-Allow-Headers: Authorization, Content-Type`
   * `Access-Control-Max-Age: 86400` (Cache this preflight for 24 hours)
4. If the preflight response is valid (status `200` or `204`), the browser sends the actual `DELETE` request. If the preflight fails, the actual request is never sent.

**The 6 Critical CORS Headers**

Every senior engineer must know these six headers and their exact responsibilities:

* **`Access-Control-Allow-Origin`**: Declares which requesting origin is allowed to read the response. Can be a specific origin (`https://app.example.com`) or a wildcard (`*`).
* **`Access-Control-Allow-Methods`**: Sent during preflight to declare which HTTP methods the server permits for cross-origin calls.
* **`Access-Control-Allow-Headers`**: Sent during preflight to declare which HTTP request headers the client is allowed to send.
* **`Access-Control-Allow-Credentials`**: Indicates whether the browser is allowed to expose the response to JavaScript when the request was made with credentials (cookies, HTTP basic authentication, or TLS client certificates). Must be explicitly set to `true`.
* **`Access-Control-Max-Age`**: Number of seconds the browser is permitted to cache the preflight `OPTIONS` response. Setting this (e.g. `86400`) prevents every single API call from incurring an extra roundtrip `OPTIONS` network latency penalty.
* **`Access-Control-Expose-Headers`**: By default, browsers only expose basic safelisted response headers to JavaScript (`Cache-Control`, `Content-Language`, `Content-Type`, `Expires`, `Last-Modified`, `Pragma`). If your server returns custom response headers like `X-Total-Count` or `X-RateLimit-Remaining`, you must list them here, or `response.headers.get('x-total-count')` will return `null`.

**The Wildcard and Credentials Collision**

A foundational security rule enforced by all modern browsers:

**You cannot combine `Access-Control-Allow-Origin: *` with `Access-Control-Allow-Credentials: true`.**

If a client sends an authenticated request with cookies (`credentials: 'include'`) and the server responds with `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Credentials: true`, the browser immediately blocks the response. The browser demands that authenticated responses specify an explicit, single origin in `Access-Control-Allow-Origin`.

**Dynamic Origin Reflection and `Vary: Origin`**

Because `Access-Control-Allow-Origin` only accepts a single origin or `*` (it does **not** accept a comma-separated list like `https://a.com, https://b.com`), servers supporting multiple frontends must dynamically check the incoming `Origin` against an allowlist and reflect that specific origin back.

Whenever you reflect the origin dynamically, you **must** send the HTTP response header:

`Vary: Origin`

This instructs intermediate CDNs, reverse proxies, and browser caches that the response headers vary based on who requested them. Without `Vary: Origin`, a CDN might cache the response for `https://allowed-a.com` and serve it to `https://allowed-b.com`, causing random CORS failures for users across the world.

## 4. Real Code — See It Working

**Production-Grade Node.js / Express Implementation**

Here is a hardened Express implementation demonstrating dynamic allowlist validation, credentials support, preflight caching, exposed headers, and CDN cache protection:

```javascript
import express from 'express';

const app = express();

// Allowed origins whitelist (loaded from environment config in production)
const ALLOWED_ORIGINS = new Set([
  'https://dashboard.example.com',
  'https://admin.example.com',
  'http://localhost:5173', // Local frontend development
]);

// Production CORS Middleware
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;

  // 1. Check if the incoming request origin is in our explicit whitelist
  if (requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)) {
    // Reflect the verified origin specifically (never use wildcard with credentials)
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);

    // Allow cookies and authorization headers across origins
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Crucial for CDNs: prevents caching response under one origin and serving to another
    res.setHeader('Vary', 'Origin');
  }

  // 2. Handle the preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    // Declare allowed methods for preflight
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );

    // Declare allowed custom headers sent by the client
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, X-Correlation-ID'
    );

    // Cache preflight response in browser for 24 hours (86400 seconds) to cut latency
    res.setHeader('Access-Control-Max-Age', '86400');

    // Respond immediately with 204 No Content for preflight without hitting route handlers
    return res.status(204).end();
  }

  // 3. Expose custom headers so frontend JS can read pagination/rate-limit metadata
  res.setHeader(
    'Access-Control-Expose-Headers',
    'X-Total-Count, X-RateLimit-Limit, X-RateLimit-Remaining'
  );

  next();
});

app.use(express.json());

// Example protected business route
app.get('/api/users', (req, res) => {
  res.setHeader('X-Total-Count', '1420');
  res.json({ users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] });
});

app.listen(8000, () => {
  console.log('API Server running on port 8000 with secure CORS configuration');
});
```

**Production Python / FastAPI Implementation**

Using FastAPI's built-in `CORSMiddleware` with explicit configuration:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Secure API")

# Explicit whitelist of allowed origins
origins = [
    "https://dashboard.example.com",
    "https://admin.example.com",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,              # Explicit origin matching
    allow_credentials=True,             # Allow cookies and Authorization headers
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "X-Correlation-ID",
    ],
    expose_headers=[
        "X-Total-Count",
        "X-RateLimit-Remaining",
    ],
    max_age=86400,                      # Cache preflight for 24 hours
)

@app.get("/api/users")
async def get_users():
    return {"users": [{"id": 1, "name": "Alice"}]}
```

**Frontend Client Request: Reading Data with Credentials**

```javascript
// Fetch request with credentials and custom headers
async function fetchUserData() {
  try {
    const response = await fetch('http://localhost:8000/api/users', {
      method: 'GET',
      // 'include' ensures HTTP-only cookies are attached to cross-origin calls
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOi...',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Access-Control-Expose-Headers allows reading this custom header
    const totalCount = response.headers.get('X-Total-Count');
    console.log('Total user count header:', totalCount);

    const data = await response.json();
    console.log('User data:', data);
  } catch (error) {
    // If CORS fails, browser throws a generic TypeError: Failed to fetch
    console.error('Network or CORS failure:', error);
  }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is CORS, what core problem does it solve, and whose security does it actually protect?**

CORS (Cross-Origin Resource Sharing) is a W3C standard and browser-enforced security mechanism that allows servers to selectively relax the browser's default Same-Origin Policy (SOP).

It protects the **end user**, not the server. Without CORS, if a user logs into their email or banking service and subsequently navigates to a malicious third-party site in another tab, JavaScript on the malicious site could make background HTTP requests to the banking API. The user's browser would automatically attach their session cookies, allowing the malicious site to read private personal data.

CORS stops this by having the browser block client-side JavaScript from reading cross-origin responses unless the target server explicitly returns headers stating it trusts the requesting origin.

**Q: If a CORS request is blocked in the browser, did the server execute the backend logic?**

Yes, for simple requests.

For a simple request (e.g. a standard `POST` with `application/x-www-form-urlencoded` or a basic `GET`), the browser sends the request directly to the server. The server executes the database query, processes business logic, and returns an HTTP response. Only when the response arrives at the browser does the browser check for `Access-Control-Allow-Origin`. If the header is missing or does not match the page's origin, the browser prevents the JavaScript caller from reading the response.

However, for preflighted requests (e.g., `DELETE`, `PUT`, or `POST` with `application/json`), the browser sends an `OPTIONS` preflight first. If the server does not approve the preflight, the browser aborts before ever sending the actual payload, meaning the backend business logic does not execute.

**Q: Why does a request succeed in curl or Postman but fail with a CORS error in React?**

CORS is an enforcement mechanism implemented exclusively inside **web browsers** to sandbox client-side scripts. Command-line tools like `curl`, API clients like Postman, mobile native apps, and backend services are not browsers; they have no concept of the Same-Origin Policy and do not execute untrusted third-party JavaScript.

They send requests directly to the server and display whatever response the server returns, completely ignoring whether CORS headers are present.

**Q: What conditions trigger an OPTIONS preflight request, and how do you optimize preflight overhead in production?**

A preflight `OPTIONS` request is triggered whenever a cross-origin request is not "simple." Specifically, it is triggered if:
1. The HTTP method is anything other than `GET`, `HEAD`, or `POST` (e.g., `PUT`, `DELETE`, `PATCH`).
2. Custom headers are present (e.g., `Authorization`, `X-Api-Key`).
3. The `Content-Type` is anything other than `application/x-www-form-urlencoded`, `multipart/form-data`, or `text/plain` (most notably, `application/json`).

In production, preflights double the latency of API calls because every request requires two sequential roundtrips (`OPTIONS` followed by the actual request). You optimize this by having the server return the `Access-Control-Max-Age: <seconds>` header (e.g., `86400` for 24 hours). The browser caches the preflight permissions for that route and method combination, sending subsequent requests directly without intermediate `OPTIONS` calls.

**Q: Why does the browser reject `Access-Control-Allow-Origin: *` when `credentials: 'include'` is set on the client?**

Allowing wildcards with credentials would create an enormous security vulnerability. If `*` were allowed with credentials, any malicious site on the internet could initiate credentialed requests (passing ambient session cookies) to any API and read the resulting private user data.

To prevent this universal ambient exfiltration, the CORS specification dictates that if a request carries credentials (`Access-Control-Allow-Credentials: true`), the server must explicitly declare the exact single origin it authorizes (e.g. `Access-Control-Allow-Origin: https://dashboard.example.com`). If the server returns `*`, the browser treats it as a security violation and blocks the response from client JavaScript.

**Q: How do you support multiple allowed frontend origins when `Access-Control-Allow-Origin` cannot take a comma-separated list?**

The HTTP specification does not permit multiple origins in `Access-Control-Allow-Origin`. To support multiple domains (e.g., `app.domain.com`, `admin.domain.com`, and `localhost:5173`), the backend must implement dynamic origin reflection:
1. Read the incoming `Origin` header from `req.headers.origin`.
2. Check if that value exists in a predefined whitelist array or matches a strict regex pattern.
3. If valid, dynamically set `Access-Control-Allow-Origin` to that specific incoming origin.
4. Set `Access-Control-Allow-Credentials: true`.
5. Set `Vary: Origin` so caching layers do not serve the reflected origin to other clients.

**Q: Why is the `Vary: Origin` response header mandatory when dynamically reflecting allowed origins?**

When a server sets headers dynamically based on request properties, shared HTTP caches (like Cloudflare, AWS CloudFront, Fastly, or reverse proxies like Nginx) must know that the response body and headers depend on the incoming `Origin`.

If you omit `Vary: Origin`, a CDN might cache the response generated for user A visiting `https://dashboard.example.com` (which has `Access-Control-Allow-Origin: https://dashboard.example.com`). When user B requests the same resource from `https://admin.example.com`, the CDN serves the cached response with the dashboard's origin header. The browser running on the admin domain sees a mismatched origin header and throws a CORS error, causing widespread intermittent outages.

**Q: Why can't frontend JavaScript read custom response headers (like `X-Total-Count`) even if the request succeeds?**

By default, the CORS specification restricts browser JavaScript to accessing only seven basic "safelisted" response headers: `Cache-Control`, `Content-Language`, `Content-Length`, `Content-Type`, `Expires`, `Last-Modified`, and `Pragma`.

All other response headers are masked by the browser for security and privacy. To make custom application headers accessible to `fetch` or `axios`, the backend must explicitly whitelist them using:

`Access-Control-Expose-Headers: X-Total-Count, X-RateLimit-Remaining`

**Q: Why does authentication middleware often break CORS preflight requests with `401 Unauthorized`?**

By specification, browsers **never send credentials or Authorization headers with preflight `OPTIONS` requests**. The preflight is an anonymous metadata check.

If your backend routes all incoming requests through an authentication or JWT verification middleware before reaching the CORS handler, the middleware sees an `OPTIONS` request lacking an `Authorization` header and immediately rejects it with `401 Unauthorized` or `403 Forbidden`. Because the preflight fails with a non-2xx status, the browser refuses to send the actual authenticated request.

To fix this, CORS middleware must always be mounted **before** any authentication middleware, or the authentication middleware must explicitly pass `OPTIONS` requests through with `next()`.

## 6. The Traps — What Goes Wrong

**Trap 1: Assuming CORS Protects Your Backend From Hackers and Bots**

* **The Mistake:** Believing that because CORS is configured to only allow `https://my-frontend.com`, your backend API is safe from scrapers, automated abuse, and direct attacks.
* **Why It's Wrong:** Attackers do not use web browsers with Same-Origin Policy enforcement. They write scripts in Python, Go, Rust, or use command-line tools like `curl`. These tools never send preflight requests and ignore CORS headers completely.
* **The Reality:** CORS only protects legitimate end users browsing the web. Backend authorization, rate limiting, token validation, and input sanitization are mandatory regardless of your CORS policy.

**Trap 2: Slapping `Access-Control-Allow-Origin: *` to Silence Development Errors**

* **The Mistake:** Using wildcard origins indiscriminately on production endpoints handling sensitive user data.
* **Why It's Wrong:** If an API endpoint is public and read-only (like a CDN image or public weather feed), `*` is fine. But on an authenticated API, developers often bypass credential errors by setting up insecure custom reflection logic that blindly mirrors whatever string is passed in `Origin`.
* **The Reality:** Blindly echoing `Origin` with `Access-Control-Allow-Credentials: true` effectively re-enables wildcard credentialed access, exposing your authenticated users to cross-site data harvesting from any website on the internet. Always validate against an explicit whitelist.

**Trap 3: Mounting Authentication Middleware Before CORS Middleware**

* **The Mistake:** Ordering Express or FastAPI middleware such that auth checks run before CORS headers are attached.
* **Why It's Wrong:** When the frontend sends an `OPTIONS` preflight, it has no `Authorization: Bearer <token>` header. The auth middleware halts the pipeline with `401 Unauthorized`.
* **The Fix:** Always register CORS middleware at the very top of your application pipeline:

```javascript
// WRONG: Auth middleware blocks preflight OPTIONS requests
app.use(authenticateJWT);
app.use(corsMiddleware);

// CORRECT: CORS middleware handles OPTIONS and sets headers first
app.use(corsMiddleware);
app.use(authenticateJWT);
```

**Trap 4: Forgetting `Access-Control-Expose-Headers` on Paginated APIs**

* **The Mistake:** The backend team returns pagination metadata in `X-Total-Count` or rate-limit info in `X-RateLimit-Remaining`. In the Network tab, the developer sees the header in the raw response, but in React code, `response.headers.get('X-Total-Count')` returns `null`.
* **Why It's Wrong:** The browser hides all non-safelisted response headers from client JavaScript unless explicitly permitted by the server.
* **The Fix:** Add `Access-Control-Expose-Headers: X-Total-Count, X-RateLimit-Remaining` to the backend response.

**Trap 5: Missing `Vary: Origin` Behind a CDN or Reverse Proxy**

* **The Mistake:** Configuring dynamic origin reflection on the backend but omitting `Vary: Origin`.
* **Why It's Wrong:** The first request from `https://app.com` causes the CDN to cache the response with `Access-Control-Allow-Origin: https://app.com`. The next request from `https://admin.com` receives the cached response with the wrong origin header, causing the browser to block the response with a CORS error.
* **The Fix:** Always include `res.setHeader('Vary', 'Origin')` whenever `Access-Control-Allow-Origin` is dynamically computed.

## 7. Compare With Related Concepts

| Feature / Concept | CORS | Same-Origin Policy (SOP) | CSRF (Cross-Site Request Forgery) | CSP (Content Security Policy) |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Role** | Mechanism to selectively **relax** SOP for trusted external origins. | Default browser sandbox preventing cross-origin script reads. | Attack where malicious sites trigger unauthorized **writes** using ambient cookies. | Browser header controlling which resources a page can **load and execute**. |
| **Where Enforced** | Browser client engine. | Browser client engine. | Prevented on server via Anti-CSRF tokens / `SameSite` cookies. | Browser client engine via `Content-Security-Policy` header. |
| **What It Controls** | Can Origin A's JavaScript **read** the response from Origin B? | Can scripts on Origin A access DOM/cookies/data from Origin B? | Can Origin A trick a user's browser into executing an action on Origin B? | What scripts, styles, images, and worker connections can this page execute? |
| **Direction of Control** | Server tells browser which frontends it trusts. | Browser isolates all independent websites by default. | Server validates intent of state-changing client requests. | Server tells browser how to restrict the page's own assets. |

**CORS vs Same-Origin Policy (SOP):**
SOP is the strict default security wall built into all web browsers. CORS is the set of official doors you intentionally cut into that wall so specific trusted partners can exchange data.

**CORS vs CSRF:**
CORS prevents unauthorized cross-origin **reads**. CSRF exploits cross-origin **writes**. Because simple `POST` requests are transmitted to the server before CORS header inspection occurs, CORS alone does not protect against CSRF attacks. CSRF protection requires `SameSite=Lax/Strict` cookie attributes or anti-CSRF tokens.

**CORS vs Reverse Proxy / Backend-for-Frontend (BFF):**
CORS manages cross-origin traffic between separate domains (e.g. `frontend.com` to `api.com`). A Reverse Proxy (or BFF pattern) configures Nginx, Next.js rewrites, or Cloudflare to serve both the frontend and the API under the same domain (e.g. `app.com` and `app.com/api`), eliminating cross-origin boundaries and bypassing CORS altogether.

## 8. 🧠 The Memory Hook

**CORS is not a backend firewall that protects your server; it is a permission slip your server hands to the browser so the browser knows it is safe to let client JavaScript read the response.**

If you remember only three rules under pressure:
1. **Servers process requests; browsers block the read.**
2. **Preflight `OPTIONS` requests never carry auth tokens and must be cached with `Max-Age`.**
3. **Wildcards (`*`) and Credentials (`true`) can never be combined.**
