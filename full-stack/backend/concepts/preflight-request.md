# CORS Preflight Requests: OPTIONS Handshake, Latency Optimization, and Caching

## 1. Why This Exists — The Problem First

You deploy a Single Page Application on `https://app.example.com` that communicates with an API backend hosted on `https://api.example.com`. On high-latency 4G or mobile connections with 150ms round-trip times, your users report that every single button click—saving a profile, updating an item, or deleting a record—feels sluggish and takes over 400ms. When you open Chrome DevTools Network tab, you notice something strange: every single `POST`, `PUT`, and `DELETE` request is duplicated. Right before each actual API call, the browser fires an automatic HTTP `OPTIONS` request. Your application is literally making two network round trips for every single mutation, doubling your network latency across the entire user experience.

Even worse, your team adds a standard JSON Web Token (JWT) authentication middleware on the backend to verify the `Authorization` header on incoming traffic. Immediately after deployment, every cross-origin API call from the frontend crashes with a generic `TypeError: Failed to fetch` in the browser console. The server logs reveal `401 Unauthorized` errors on endpoints that previously worked. The backend rejected the browser's automatic `OPTIONS` preflight request because preflight requests deliberately do not carry credentials or authorization headers. Because the preflight failed with a 401, the browser aborted immediately and never sent the real request.

Why does the browser put developers through this complexity? When the Cross-Origin Resource Sharing (CORS) specification was designed, the web was already filled with millions of legacy servers, internal enterprise portals, and intranet routers created in the 1990s and 2000s. Those legacy systems were written under the assumption that a web browser could only send cross-origin requests through standard HTML `<form>` submissions (`GET` and `POST` with urlencoded or multipart data). If modern browsers had suddenly allowed JavaScript running on any arbitrary website (`https://malicious-site.com`) to send raw `DELETE /api/users/1` or `PUT /transfer` with `Content-Type: application/json` directly to an internal server behind a corporate firewall, those older servers would blindly parse the HTTP method, mutate their databases, and execute destructive operations before realizing the origin was untrusted.

The CORS Preflight Request was created as a defensive safety handshake. Before the browser allows JavaScript to send a non-standard, potentially destructive cross-origin HTTP request, it sends a lightweight `OPTIONS` probe. It asks the destination server: "Do you understand CORS, and do you explicitly allow this HTTP method and these custom headers from this origin?" Only when the server explicitly replies with approval does the browser release the real request.

## 2. The Analogy — Make It Obvious

Think of a CORS Preflight Request like sending a hazardous materials freight shipment across an international border checkpoint.

Imagine your logistics company wants to transport an oversized cargo container carrying specialized chemicals. The container requires a heavy hydraulic crane to unload (HTTP method: `PUT` or `DELETE`) and comes with custom tamper-evident security seals (Custom header: `Authorization: Bearer token`).

Instead of dispatching the full 18-wheeler truck directly across the border—where an unprepared destination warehouse might accidentally mishandle the chemicals or cause a disaster—the shipping protocol requires sending a lightweight courier on a motorcycle ahead of time.

The courier arrives at the customs gate and presents a flight manifest ticket (The `OPTIONS` request). The ticket says: "I represent Company A (`Origin: https://app.example.com`). We want to send a truck using hydraulic crane unloading (`Access-Control-Request-Method: PUT`) with custom chemical security seals (`Access-Control-Request-Headers: Authorization, Content-Type`). Do you accept this?"

The customs officer checks their rulebook. If the warehouse supports this operation, the officer stamps an official clearance certificate (The `200 OK` or `204 No Content` response) stating: "Yes, Company A is permitted (`Access-Control-Allow-Origin`). We allow crane unloading (`Access-Control-Allow-Methods`) and chemical seals (`Access-Control-Allow-Headers`). Furthermore, this clearance pass is valid for the next 2 hours (`Access-Control-Max-Age: 7200`), so you don't need to send another courier for subsequent trucks today."

The courier radios back to the depot. The full 18-wheeler cargo truck (the actual `PUT` request with payload and auth credentials) departs and delivers the cargo safely.

If the customs officer says "No", doesn't know what a chemical seal is, or crashes, the cargo truck never leaves the depot. The destination warehouse is completely protected from an unexpected delivery.

Meanwhile, standard consumer envelopes carrying ordinary postcards (Simple Requests: standard `GET` requests or basic form submissions) do not require a courier scout because every mailbox in the world has safely handled ordinary letters since the beginning of the postal system.

## 3. How It Actually Works — The Full Explanation

The browser's Same-Origin Policy strictly isolates documents and scripts loaded from different origins (where an origin is defined by the exact combination of Scheme, Hostname, and Port). When client-side JavaScript uses `fetch()` or `XMLHttpRequest` to call a different origin, the browser's CORS engine evaluates the request before putting bytes on the wire.

The browser classifies every cross-origin request into one of two categories: a Simple Request or a Preflighted Request.

A request is classified as a Simple Request if and only if it meets all of the following four conditions simultaneously:

First, the HTTP method must be one of `GET`, `HEAD`, or `POST`. Any other method—such as `PUT`, `PATCH`, `DELETE`, or `CONNECT`—immediately triggers a preflight.

Second, the request headers must only contain user-agent automatically set headers (like `User-Agent`, `Host`, `Connection`) or headers from the CORS-safelisted request header list: `Accept`, `Accept-Language`, `Content-Language`, and `Content-Type`. Setting custom application headers like `Authorization`, `X-Api-Key`, `X-Request-ID`, `sentry-trace`, or `baggage` immediately disqualifies the request from being simple.

Third, if the `Content-Type` header is set, its MIME type must strictly be one of three legacy form formats: `application/x-www-form-urlencoded`, `multipart/form-data`, or `text/plain`. Setting `Content-Type: application/json` or `application/xml` is the single most common reason modern web requests require a preflight.

Fourth, no event listeners are registered on any `XMLHttpRequestUpload` object used in the request, and no `ReadableStream` object is used as the request body.

If a request violates even one of these criteria, the browser intercepts the call and executes the Preflight Protocol before dispatching the real payload.

The Preflight Wire Protocol proceeds through five sequential steps:

Step 1: Detection and Pause. The browser's network layer detects a non-simple cross-origin request. For example, your app executes `fetch('https://api.example.com/orders/42', { method: 'DELETE', headers: { 'Authorization': 'Bearer secret123', 'Content-Type': 'application/json' } })`. The browser pauses the execution of this `DELETE` operation.

Step 2: Dispatching the OPTIONS Probe. The browser crafts an HTTP `OPTIONS` request to the target URL. The browser automatically attaches three critical probing headers:
- `Origin: https://app.example.com` tells the server the exact origin of the calling script.
- `Access-Control-Request-Method: DELETE` tells the server which HTTP verb the real request wants to execute.
- `Access-Control-Request-Headers: authorization, content-type` tells the server which custom headers the real request will include.

Crucially, the preflight request is completely anonymous. It does not carry cookies, it does not send the `Authorization` header value, and it has an empty body (`Content-Length: 0`).

Step 3: Server Verification. The server's CORS layer intercepts the `OPTIONS` request. It checks whether `https://app.example.com` is in its whitelist of permitted origins, whether `DELETE` is in its list of allowed methods, and whether `Authorization` and `Content-Type` are in its list of allowed headers.

Step 4: Server Preflight Response. If allowed, the server responds with an HTTP status `204 No Content` (or `200 OK`) and returns the CORS approval headers:
- `Access-Control-Allow-Origin: https://app.example.com` (or `*` if the resource is public and does not require credentials).
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS` specifies which methods the client can execute.
- `Access-Control-Allow-Headers: Authorization, Content-Type, X-Request-ID` specifies which custom headers are accepted.
- `Access-Control-Allow-Credentials: true` indicates whether the browser may send cookies or authorization credentials with the actual request.
- `Access-Control-Max-Age: 7200` instructs the browser to cache this preflight approval for 7,200 seconds (2 hours).

Step 5: Browser Validation and Actual Request. The browser receives the `OPTIONS` response and verifies the headers against its pending request. If every requested method and header is explicitly permitted, the browser releases the paused request. The real `DELETE` request with its `Authorization` header and payload is finally transmitted across the network. If the server returned an error (such as a 403 or 500), omitted the CORS headers, or rejected the origin, the browser aborts immediately, blocks the real `DELETE` request from ever leaving the machine, and throws a CORS error in the JavaScript runtime.

Preflight Caching and Latency Optimization:

Because preflight requests add an entire network round trip before every mutation, preflight caching is critical for production performance. When the server includes `Access-Control-Max-Age: <seconds>`, the browser caches the preflight response in an internal CORS cache keyed by the tuple of `(Origin, Target URL)`.

During this cache window, subsequent non-simple requests from the same origin to that specific URL skip the `OPTIONS` probe entirely and fire the actual request immediately.

However, browsers enforce strict hard-coded maximum limits on `Access-Control-Max-Age` to ensure security policies can be revoked in a reasonable timeframe:
- Chromium browsers (Google Chrome, Microsoft Edge, Brave, Opera) cap `Access-Control-Max-Age` at a maximum of 7,200 seconds (2 hours). If your server sends `Access-Control-Max-Age: 86400` (24 hours), Chrome internally caps it to 7,200 seconds.
- WebKit (Apple Safari) caps `Access-Control-Max-Age` at 600 seconds (10 minutes) on standard configurations.
- Gecko (Mozilla Firefox) allows up to 86,400 seconds (24 hours).
- Setting `Access-Control-Max-Age: 0` or `-1` disables the preflight cache, forcing an `OPTIONS` handshake on every single request.

Architectural Strategies to Eliminate Preflight Requests:

In latency-sensitive applications, you can eliminate preflight overhead altogether using two primary architectural patterns:

The Backend For Frontend (BFF) or Reverse Proxy Pattern: Configure your edge routing layer (NGINX, AWS CloudFront, Cloudflare, or Traefik) to host your frontend assets and proxy your API under the exact same origin. For example, the web app lives at `https://example.com` and all API requests target `https://example.com/api/*`. Because the request is same-origin, the browser's CORS subsystem never activates, eliminating 100% of preflight requests.

Edge Preflight Termination: If your API must remain on a separate subdomain (`https://api.example.com`), handle and terminate `OPTIONS` requests directly at the CDN or API Gateway edge (such as Cloudflare Workers, AWS API Gateway, or NGINX) with a static `204 No Content` response and `Access-Control-Max-Age: 7200`. This prevents preflight requests from ever touching your application instances or serverless cold starts.

## 4. Real Code — See It Working

Below are complete, production-ready server implementations in Node.js (Express) and Python (FastAPI) showing how to handle preflight requests correctly, configure caching, and avoid authentication middleware deadlocks.

```javascript
// server.js - Express.js Production CORS & Preflight Setup
const express = require('express');
const app = express();

// Whitelist of allowed origins
const ALLOWED_ORIGINS = new Set([
  'https://app.example.com',
  'https://staging.example.com'
]);

// 1. CORS & Preflight Middleware (MUST be registered before any auth middleware)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Validate incoming origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, X-Request-ID'
    );
    // Cache preflight permissions in browser for 2 hours (Chromium max cap)
    res.setHeader('Access-Control-Max-Age', '7200');
    // Tell intermediate proxies that response varies based on Origin header
    res.setHeader('Vary', 'Origin');
  }

  // Intercept and fast-path OPTIONS preflight requests immediately
  if (req.method === 'OPTIONS') {
    // Preflight requests do NOT need body parsing, database lookups, or auth
    return res.status(204).end();
  }

  next();
});

// Parse JSON bodies only for actual application requests
app.use(express.json());

// 2. Authentication Middleware (Only executes for real requests, never OPTIONS)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  // Simulated token verification
  if (token !== 'valid-production-jwt') {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  req.user = { id: 'usr_42', role: 'admin' };
  next();
};

// 3. Protected Resource Route (Triggers preflight due to PUT + JSON + Auth header)
app.put('/api/orders/:id', authenticateToken, (req, res) => {
  res.json({
    message: 'Order updated successfully',
    orderId: req.params.id,
    updatedBy: req.user.id,
    payload: req.body
  });
});

app.listen(3000, () => {
  console.log('API Server running on port 3000 with CORS Preflight handling');
});
```

```python
# main.py - FastAPI Production CORS & Preflight Setup
from fastapi import FastAPI, Depends, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Order Service API")

# List of permitted web origins
origins = [
    "https://app.example.com",
    "https://staging.example.com",
]

# FastAPI's CORSMiddleware intercepts incoming requests before route dependencies.
# It automatically responds to OPTIONS preflights with 200 OK and max_age caching.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    max_age=7200,  # Browser preflight cache duration in seconds
)

class OrderUpdate(BaseModel):
    status: str
    quantity: int

def verify_jwt_token(authorization: str = Header(None)):
    """
    Route dependency for authentication.
    Because CORSMiddleware runs first, preflight OPTIONS requests are
    resolved immediately and never trigger this dependency.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing"
        )
    
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token != "valid-production-jwt":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid authentication credentials"
        )
    return {"user_id": "usr_42"}

@app.put("/api/orders/{order_id}")
async def update_order(
    order_id: str,
    update: OrderUpdate,
    user: dict = Depends(verify_jwt_token)
):
    return {
        "order_id": order_id,
        "new_status": update.status,
        "updated_by": user["user_id"]
    }
```

```javascript
// client.js - Frontend fetch call showing what the browser sends
async function updateOrder() {
  // This fetch call violates simple request rules (Method: PUT, Content-Type: json, Custom Header: Authorization)
  // Step 1: Browser automatically sends:
  //   OPTIONS /api/orders/101 HTTP/1.1
  //   Origin: https://app.example.com
  //   Access-Control-Request-Method: PUT
  //   Access-Control-Request-Headers: authorization, content-type
  //
  // Step 2: Server responds with 204 No Content + Access-Control-Allow-* + Max-Age: 7200
  //
  // Step 3: Browser sends the real payload:
  //   PUT /api/orders/101 HTTP/1.1
  //   Origin: https://app.example.com
  //   Authorization: Bearer valid-production-jwt
  //   Content-Type: application/json
  //   {"status": "shipped", "quantity": 5}
  
  const response = await fetch('https://api.example.com/api/orders/101', {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer valid-production-jwt',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'shipped', quantity: 5 })
  });

  const data = await response.json();
  console.log('Order update response:', data);
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why does the browser send an OPTIONS request before certain cross-origin requests instead of just sending the request and letting the server check the origin?**

The preflight request exists to protect legacy backend servers that were written before CORS was created. Before CORS, web browsers strictly prevented cross-origin JavaScript from sending custom HTTP methods (like `DELETE`, `PUT`, `PATCH`) or arbitrary content formats (like `application/json`) to external servers. Servers built during that era assumed that any incoming `DELETE` or JSON payload had to come from a trusted server-side script or an internal tool, not from an untrusted third-party browser tab.

If modern browsers simply dispatched a cross-origin `DELETE /api/account` directly and only checked the response headers after the fact, the legacy server would receive the `DELETE` request, process the deletion inside its database, and commit the transaction before returning a response. Even if the browser refused to let JavaScript read the 200 OK response due to missing CORS headers, the destructive mutation would already have occurred on the database. The preflight `OPTIONS` handshake acts as a safety probe: it ensures that no mutating request ever reaches the server's business logic unless the server explicitly confirms it understands and authorizes the cross-origin caller.

**Q: What exact conditions make an HTTP request a "Simple Request", and why is `Content-Type: application/json` not simple?**

An HTTP request is classified as a Simple Request only if it satisfies four strict conditions simultaneously:
1. The HTTP method must be `GET`, `HEAD`, or `POST`.
2. The headers must only include automatically generated browser headers or CORS-safelisted headers (`Accept`, `Accept-Language`, `Content-Language`, `Content-Type`).
3. The `Content-Type` header, if present, is restricted exclusively to `application/x-www-form-urlencoded`, `multipart/form-data`, or `text/plain`.
4. No event listeners are attached to `XMLHttpRequestUpload` and no streams are used in the body.

`Content-Type: application/json` is not considered simple because standard HTML `<form>` elements could never natively encode and transmit raw JSON payloads when the web standards were established. HTML forms could only submit data as urlencoded key-value pairs, multipart binary streams, or plain text. Because legacy servers never expected cross-origin web pages to submit structured JSON documents, browsers mandate a preflight handshake before allowing any cross-origin JSON payload.

**Q: Why do preflight requests frequently fail with a 401 Unauthorized error, and how do you architect the backend to prevent this?**

Preflight `OPTIONS` requests fail with `401 Unauthorized` when backend developers register an authentication middleware (like JWT verification, session checking, or API key validation) globally across all routes before handling CORS.

By W3C and WHATWG specification design, preflight `OPTIONS` requests are completely unauthenticated and anonymous. The browser deliberately strips all cookies, credentials, and custom headers—including the `Authorization` header—from the preflight request. When an auth middleware intercepts the `OPTIONS` request and searches for a token, none exists, causing the middleware to immediately reject the request with `401 Unauthorized`. The browser treats this non-2xx status as a CORS handshake rejection and aborts before dispatching the real request.

The correct architectural solution is to position CORS middleware at the very top of your server's request pipeline, ahead of all authentication, rate limiting, and body parsing middleware. The CORS middleware must identify `req.method === 'OPTIONS'`, attach the appropriate `Access-Control-Allow-*` headers, and terminate the request immediately with a `204 No Content` or `200 OK` status without attempting to authenticate the client.

**Q: How does `Access-Control-Max-Age` work, and why does setting it to 86400 seconds (24 hours) have no effect in Chrome?**

The `Access-Control-Max-Age` response header instructs the browser's networking stack to cache the outcome of a successful preflight handshake for a specified duration in seconds. While this entry is cached, subsequent cross-origin requests to that exact resource that share the same origin, HTTP method, and requested headers bypass the `OPTIONS` request entirely and fire the actual request immediately, saving one full network round trip.

However, browser vendors enforce hard internal caps on `Access-Control-Max-Age` to balance performance against security agility (such as revoking CORS access after a security incident). Chromium-based engines (Chrome, Edge, Brave) enforce a strict upper limit of 7,200 seconds (2 hours). If your server sends `Access-Control-Max-Age: 86400`, Chrome silently caps the cache duration to 7,200 seconds. Firefox allows up to 86,400 seconds (24 hours), while Safari (WebKit) defaults to a 600-second (10-minute) cap. Setting the header to `-1` or `0` completely invalidates the cache, requiring a fresh preflight for every individual non-simple request.

**Q: If a cross-origin request fails due to a CORS error, did the backend execute the request or not?**

The answer depends entirely on whether the request was a Simple Request or a Preflighted Request:

If the request was a Simple Request (such as a `POST` with `Content-Type: text/plain` or standard form urlencoding), the browser sent the request directly to the server. The server parsed the body, executed the route logic, mutated database records, and generated an HTTP response. However, when the response returned to the browser, the browser checked for `Access-Control-Allow-Origin`. Finding none, the browser blocked client JavaScript from reading the response and threw a CORS error. In this scenario, the database mutation occurred despite the frontend error.

If the request was a Non-Simple Preflighted Request (such as a `DELETE` or a `POST` with `application/json`), the browser sent only the `OPTIONS` probe first. Because the `OPTIONS` request failed CORS validation, the browser aborted the operation immediately. The real `DELETE` or `POST` request was never placed on the network, and the backend server never executed any route handler or database mutation.

**Q: What are the most effective engineering techniques to completely avoid preflight request latency in production?**

There are three primary production techniques:

1. Reverse Proxy / Same-Origin Routing: Place a reverse proxy or CDN (such as NGINX, Cloudflare, or AWS CloudFront) in front of your infrastructure. Map your web client to `https://example.com` and route API traffic to `https://example.com/api/*`. Because all network traffic is same-origin, CORS is completely bypassed, eliminating 100% of preflight requests.

2. Edge Preflight Termination: If maintaining separate subdomains (e.g. `api.example.com`) is unavoidable, terminate `OPTIONS` preflights at the CDN edge (via Cloudflare Workers, CloudFront Functions, or an API Gateway). The edge server returns static CORS headers and `Access-Control-Max-Age: 7200` with sub-10ms response times, preventing preflights from traveling to origin application servers.

3. Maximizing Preflight Cache (`Access-Control-Max-Age`): Ensure your backend CORS configuration always sends `Access-Control-Max-Age: 7200` so that users only incur a preflight penalty on their initial API call, with subsequent requests hitting the local browser CORS cache.

## 6. The Traps — What Goes Wrong

The most frequent production bug occurs when authentication middleware is mounted ahead of CORS middleware. A backend engineer creates a global route guard that extracts JWT bearer tokens or session cookies from every incoming request. When the frontend attempts a `POST` with `application/json`, the browser sends an `OPTIONS` request. Because preflight requests intentionally do not carry `Authorization` headers or cookies, the auth guard returns `401 Unauthorized`. The browser immediately fails the preflight, logs a cryptic CORS policy violation in the DevTools console, and never sends the actual `POST`. The fix is ensuring that CORS middleware runs first and terminates all `OPTIONS` requests before auth guards execute.

Another trap is omitting custom headers from `Access-Control-Allow-Headers`. If your frontend application introduces observability, tracing, or telemetry tools (such as Sentry, OpenTelemetry, Datadog, or custom headers like `X-Request-ID`, `sentry-trace`, `baggage`, or `X-Client-Version`), the browser includes those header names in `Access-Control-Request-Headers` during the preflight. If your server's CORS configuration only allows `Content-Type, Authorization`, the browser rejects the preflight because `sentry-trace` was not explicitly permitted. Whenever adding telemetry headers to your client, you must update the server's `Access-Control-Allow-Headers` list to match.

Developers frequently believe that sending `Access-Control-Allow-Origin: *` is a universal wildcard fix for all CORS issues. However, if your frontend makes authenticated requests using `credentials: 'include'` (sending cookies or HTTP authentication), the CORS specification strictly forbids the wildcard `*`. If the server responds with both `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Credentials: true`, the browser rejects the response with an explicit security error. To support credentials, the server must dynamically echo back the exact calling origin from the incoming `Origin` header after verifying it against an internal whitelist.

A subtle performance trap is failing to set `Access-Control-Max-Age`. Without this header, browsers default to an extremely short or zero cache duration. Every single asynchronous action taken by a user—typing in an autocompleting search bar, clicking tab filters, submitting forms—fires an `OPTIONS` request immediately before the real request. On mobile connections, this doubles the network round-trip time for every user interaction and generates 100% unnecessary traffic on your backend load balancers.

Engineers often test APIs exclusively using Postman, Insomnia, or `curl` and assume their CORS implementation is working. Command-line tools and native desktop HTTP clients are not web browsers; they do not enforce the Same-Origin Policy and never generate automatic `OPTIONS` preflight requests. An endpoint may return `200 OK` in Postman with custom headers but fail completely when invoked from client-side JavaScript in a browser. All CORS and preflight testing must be verified within real browser environments.

## 7. Compare With Related Concepts

Understanding how CORS Preflight fits alongside adjacent web security and networking concepts prevents common architectural confusion:

Preflight Request vs Simple CORS Request: A Simple Request is a cross-origin call using legacy HTTP methods (`GET`, `HEAD`, `POST`) and legacy form content types (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`) without custom headers. The browser dispatches simple requests immediately without asking permission. A Preflight Request is an advance `OPTIONS` probe dispatched automatically by the browser whenever a cross-origin request uses non-simple methods (`PUT`, `DELETE`, `PATCH`), custom headers (`Authorization`, `X-Api-Key`), or structured payloads (`application/json`). Use Simple Requests only when basic form submissions suffice; use standard preflighted APIs for modern JSON-based REST and GraphQL services.

CORS Preflight (`OPTIONS`) vs Same-Origin Policy (SOP): The Same-Origin Policy is the foundational security boundary enforced by browsers that prohibits scripts on one origin from accessing data on another origin. CORS is a mechanism that allows servers to selectively relax the Same-Origin Policy for trusted origins. The Preflight Request is the specific runtime handshake within CORS that ensures non-simple cross-origin operations are vetted before execution. The rule: SOP blocks by default, CORS grants permission, and Preflight validates non-simple requests beforehand.

Preflight Caching (`Access-Control-Max-Age`) vs HTTP Response Caching (`Cache-Control`): `Access-Control-Max-Age` instructs the browser's CORS layer how long it may remember that a specific origin is permitted to send a method/header combination to an endpoint. It does not cache the actual data or response body. `Cache-Control` instructs the browser's HTTP cache whether and how long it can reuse the actual data payload returned by `GET` or `HEAD` requests. The rule: `Access-Control-Max-Age` caches permission to talk, while `Cache-Control` caches the data returned.

CORS Preflight vs HTTP Method Overriding (`X-HTTP-Method-Override`): Method Overriding is a technique where clients send an ordinary `POST` request with a custom header like `X-HTTP-Method-Override: DELETE` or `_method=DELETE` in the form body to bypass firewalls or proxies that block `DELETE` verbs. However, because `X-HTTP-Method-Override` is a custom header, sending it via cross-origin JavaScript still triggers a CORS preflight. The rule: Tunneling verbs through `POST` does not avoid preflights in modern browsers if custom headers or JSON payloads are used.

## 8. 🧠 The Memory Hook

The Preflight is the browser's advance safety scout: it sends a credential-free `OPTIONS` knock to ask "Do you accept this method and header?", waits for the signed clearance pass (which it caches via `Max-Age`), and only then dispatches the real cargo.
