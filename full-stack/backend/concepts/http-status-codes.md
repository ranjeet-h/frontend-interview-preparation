# HTTP Status Codes: Semantics, Classes, and Error Modeling

## 1. Why This Exists — The Problem First

Imagine shipping an e-commerce checkout endpoint where every failure is caught by a blanket `try/catch` block that returns `res.status(200).json({ success: false, error: "Payment gateway down" })`.

Within hours, production descends into chaos across three separate layers:

First, your content delivery network (CDN) sees `200 OK`, assumes the page loaded successfully, and caches that "Payment gateway down" error for every customer worldwide for the next ten minutes.

Second, your frontend application uses Axios or React Query with standard interceptors. Because the HTTP status is `200`, the client code executes the success branch. It attempts to read `response.data.order.id`, hits `undefined`, and crashes the entire checkout page with an unhandled JavaScript `TypeError`.

Third, your Datadog and Sentry observability dashboards report 100% uptime with zero 5xx errors. The on-call engineer is never alerted because your monitoring monitors HTTP status codes, not arbitrary JSON bodies. You only find out payments have been failing when customers start posting on social media.

Now consider the reverse failure: a junior developer lets a missing form field throw an unhandled validation exception, returning `500 Internal Server Error`. Your logging system fires high-severity alerts at 3 AM for simple typos. Smart mobile clients configured with exponential backoff see a `500` error, assume a transient server glitch, and immediately hammer the server with five automatic retries, turning a minor validation typo into a self-inflicted denial-of-service attack.

HTTP status codes exist to solve this exact communication contract. They are not cosmetic labels for humans. They are the universal, machine-readable control protocol that allows browsers, mobile apps, load balancers, reverse proxies, CDNs, API gateways, and monitoring tools to coordinate behavior without needing to parse a single byte of your response body.

## 2. The Analogy — Make It Obvious

Think of an HTTP interaction as sending a package through a global postal and courier service:

**1xx (Informational — The Counter Handshake):** You walk up with a massive 500-pound shipping container. Before you heave it onto the scale, the clerk checks your paperwork and says, "Paperwork looks valid, proceed to load the cargo at Bay 4" (`100 Continue`). Or they say, "We are switching this shipment from ground truck to cargo plane right now" (`101 Switching Protocols`).

**2xx (Success — The Delivery Receipt):** Everything went smoothly.
- `200 OK`: The courier handed the package directly to the recipient and got a signature.
- `201 Created`: The courier delivered the package, placed it in a brand-new storage locker, and handed you a claim ticket with the exact address (`Location: /lockers/982`).
- `202 Accepted`: The courier dropped your package onto a long-haul conveyor belt. It has not arrived yet, but it is in the queue; here is a tracking number to poll for updates.
- `204 No Content`: You asked the courier to shred an old document. They shredded it. It is done, so there is nothing to mail back to you.

**3xx (Redirection — The Forwarding Address):** The package arrived at the building, but the recipient is not there.
- `301 Moved Permanently`: The tenant permanently moved to a new city. The postal system tells you to update your address book forever.
- `307 Temporary Redirect`: The tenant is at a beach house for the weekend. Deliver this package there, but keep sending future mail to their home address.
- `304 Not Modified`: You call to ask if the recipient's daily schedule changed. They reply, "No, your copy from yesterday is still exact." Zero fuel wasted shipping duplicate paper.

**4xx (Client Error — The Sender's Mistake):** The courier cannot deliver because you made an error.
- `400 Bad Request`: You wrote the address in unreadable, garbled scribbles.
- `401 Unauthorized`: You forgot to show your postal identification badge.
- `403 Forbidden`: You showed your ID badge, but your badge is for standard mail and you tried to walk into the high-security bank vault.
- `404 Not Found`: You wrote an address for a street that does not exist.
- `409 Conflict`: You tried to claim locker #12, but another sender just locked it a fraction of a second before you.
- `422 Unprocessable Entity`: Your envelope is pristine, the address is legible, but inside you put a cheque for negative fifty dollars. The format is valid, but the data violates business rules.
- `429 Too Many Requests`: You dumped 500 packages onto the counter in three seconds. The clerk points at the clock and says, "Wait 60 seconds before sending another" (`Retry-After: 60`).

**5xx (Server Error — The Post Office's Mistake):** You did everything right, but the delivery infrastructure broke down.
- `500 Internal Server Error`: The automated sorting robot caught fire and crashed.
- `502 Bad Gateway`: The local branch clerk picked up the phone to call the central distribution warehouse, but the warehouse line returned a dead tone or hung up immediately.
- `503 Service Unavailable`: The entire distribution center is undergoing scheduled maintenance or is evacuated due to a power surge; try again in five minutes.
- `504 Gateway Timeout`: The local branch clerk called the central warehouse, but the warehouse worker left them on hold for ten minutes until the call dropped.

## 3. How It Actually Works — The Full Explanation

Every HTTP response begins with a status line consisting of the HTTP protocol version, a three-digit integer status code, and a human-readable reason phrase (such as `HTTP/1.1 201 Created`).

The three-digit code is divided into five standardized classes based on the first digit. The first digit establishes the category of the outcome, while the remaining two digits provide fine-grained semantics.

**The 5 Status Code Classes:**

**1xx Informational (Protocol-level signaling):**
- `100 Continue`: Sent by a server when a client sends large request payloads with the header `Expect: 100-continue`. The server validates authentication and headers first. If allowed, it sends `100 Continue`, signaling the client to begin streaming the large body. If rejected (e.g., `401 Unauthorized`), the client avoids uploading megabytes of useless data.
- `101 Switching Protocols`: Sent during connection upgrades, such as transitioning an HTTP/1.1 connection to a real-time WebSocket connection via `Upgrade: websocket`.

**2xx Success (Request received, understood, and fulfilled):**
- `200 OK`: Standard response for successful `GET`, `PUT`, or `PATCH` requests where data is returned.
- `201 Created`: Returned for successful `POST` or `PUT` operations that mint a new resource. The server should include a `Location` header pointing to the URI of the newly created resource (e.g., `Location: /api/v1/users/42`).
- `202 Accepted`: The request has been accepted for processing, but processing has not completed (often queued in Redis/BullMQ, Celery, or Kafka). The response typically includes a polling URL or job ID.
- `204 No Content`: The action succeeded, but the server intentionally returns an empty response body (common for `DELETE` operations or `PUT`/`PATCH` updates where the client does not need the updated entity). The server must not include a message body or `Content-Type` header.

**3xx Redirection (Further action needed to complete the request):**
- `301 Moved Permanently`: The resource has permanently relocated to a new URL. Search engine crawlers transfer SEO ranking to the new target. Crucially, browsers historically mutated `POST` requests to `GET` requests when following a `301`.
- `302 Found`: Temporary redirection. Historically, browsers also converted `POST` to `GET` upon following a `302`.
- `307 Temporary Redirect` (HTTP/1.1): A modern temporary redirect that strictly forbids changing the HTTP method or body. If a client sent a `POST` with a JSON payload to `/api/v1/charge`, the client must send that exact same `POST` and JSON payload to the redirected URL.
- `308 Permanent Redirect` (RFC 7538): A modern permanent redirect that, like `307`, strictly preserves the original HTTP method and body across redirects while instructing caches and search engines to treat the move as permanent.
- `304 Not Modified`: Conditional cache validation. When a client performs a `GET` request with `If-None-Match: "etag_hash"` or `If-Modified-Since`, the server checks if the resource changed. If unchanged, the server returns `304` with no body, instructing the browser to serve the locally cached copy from disk.

**4xx Client Errors (The client sent invalid syntax, invalid state, or lacked credentials):**
- `400 Bad Request`: Malformed request syntax, unparseable JSON, or corrupted query parameters. The server cannot understand the request envelope.
- `401 Unauthorized`: Semantically means **Unauthenticated**. The client has not supplied valid authentication credentials (missing token, expired JWT, invalid API key). Must include a `WWW-Authenticate` header.
- `403 Forbidden`: The client is authenticated and their identity is known, but they do not possess the required permissions or roles to access the resource (e.g., a standard user requesting `DELETE /api/admin/users/1`).
- `404 Not Found`: The requested URI does not map to any existing resource. It is also used intentionally to hide the existence of restricted resources from unauthorized users.
- `405 Method Not Allowed`: The URL exists, but the HTTP verb used is not supported (e.g., sending `DELETE` to `/api/login`). The response must include an `Allow` header listing supported methods (e.g., `Allow: POST, OPTIONS`).
- `409 Conflict`: The request cannot be completed due to a conflict with the current state of the target resource. Common in optimistic locking failures (version mismatch) or unique constraint violations (e.g., attempting to register with an email that is already taken).
- `422 Unprocessable Entity` (RFC 9110): The request payload syntax is valid JSON, but the semantic contents fail validation rules (e.g., `age: -10` or a missing required field in a valid JSON object).
- `429 Too Many Requests` (RFC 6585): Rate limiter triggered. The client has sent too many requests in a given time window. The server should provide a `Retry-After` header indicating how many seconds to wait before retrying.

**5xx Server Errors (The server failed to fulfill an otherwise valid request):**
- `500 Internal Server Error`: An unhandled exception or crash occurred in the application layer (e.g., null pointer exception, uncaught database connection error).
- `502 Bad Gateway`: The edge server, reverse proxy (NGINX, Envoy, Cloudflare), or load balancer acted as a gateway and received an invalid response, connection refusal (`ECONNREFUSED`), or abrupt TCP reset from the upstream application instance. The upstream application is crashed, dead, or not listening on the expected port.
- `503 Service Unavailable`: The server is currently unable to handle the request due to temporary overloading or scheduled maintenance. Often returned by circuit breakers or load balancers with a `Retry-After` header.
- `504 Gateway Timeout`: The reverse proxy connected to the upstream application server, but the upstream application took longer to respond than the proxy's configured read timeout (e.g., NGINX `proxy_read_timeout 60s` expired while a complex SQL query took 90s).

**The Reverse Proxy Mechanics: 502 vs 504**

Understanding the exact boundary between `502` and `504` is critical for diagnosing backend production outages:

```txt
Client ---> [ Reverse Proxy / NGINX ] ---> [ Upstream App / Node.js ] ---> [ Database ]
                    |
                    +--- Connection Refused / Process Crashed  ======> 502 Bad Gateway
                    |
                    +--- Connection OK, but App Took >60s     ======> 504 Gateway Timeout
```

When NGINX receives a request from a client:
1. It attempts to open a TCP socket to the upstream app server (e.g., `localhost:3000`). If the app process crashed or ran out of memory, the OS kernel immediately sends a TCP `RST` (Reset) packet or rejects the connection. NGINX instantly returns **502 Bad Gateway**.
2. If NGINX successfully connects and forwards the HTTP request, but the upstream application hangs on a slow database query or CPU-heavy task and exceeds NGINX's `proxy_read_timeout`, NGINX drops the upstream connection and returns **504 Gateway Timeout**.

**Standardized Error Modeling: RFC 7807 / RFC 9457 Problem Details**

In the early days of REST APIs, every company invented their own error JSON format (`{ "err": "msg" }` vs `{ "status": "failed", "message": "..." }`). This forced frontend and integration teams to write custom parsing code for every third-party service.

IETF standardized error modeling in **RFC 7807** (updated in **RFC 9457**) titled *Problem Details for HTTP APIs*. It defines the standard MIME type `application/problem+json` and five core properties:

1. `type` (string URI): An absolute or relative URI reference that identifies the problem type. Clients use this as the stable machine-readable identifier.
2. `title` (string): A short, human-readable summary of the problem type. It should not change between occurrences of the same problem.
3. `status` (number): The HTTP status code generated by the origin server for this occurrence.
4. `detail` (string): A human-readable explanation specific to this exact occurrence of the problem.
5. `instance` (string URI): A URI reference that identifies the specific occurrence of the problem (e.g., `/orders/992/errors/1` or a distributed correlation trace ID).
6. Extension Members: Custom domain-specific metadata, such as an array of field-level validation errors (`invalid_params`).

## 4. Real Code — See It Working

Here is a complete, production-grade error handling system in Node.js/Express that models domain errors and maps them to HTTP status codes following the RFC 7807 standard.

```javascript
// error-types.js - Domain error classes with HTTP status mappings
class AppError extends Error {
  constructor(message, statusCode, problemType, detail, extensions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.problemType = problemType;
    this.detail = detail || message;
    this.extensions = extensions;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(invalidParams, detail = "The request payload failed validation.") {
    super(
      "Validation Failed",
      422,
      "https://api.example.com/probs/validation-error",
      detail,
      { invalid_params: invalidParams }
    );
  }
}

class ResourceNotFoundError extends AppError {
  constructor(resource, id) {
    super(
      "Resource Not Found",
      404,
      "https://api.example.com/probs/resource-not-found",
      `The requested ${resource} with identifier '${id}' does not exist.`
    );
  }
}

class ConflictError extends AppError {
  constructor(detail) {
    super(
      "Resource Conflict",
      409,
      "https://api.example.com/probs/state-conflict",
      detail
    );
  }
}

class RateLimitError extends AppError {
  constructor(retryAfterSeconds) {
    super(
      "Too Many Requests",
      429,
      "https://api.example.com/probs/rate-limit-exceeded",
      `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
      { retryAfter: retryAfterSeconds }
    );
  }
}
```

Now, we wire these domain errors into an Express application with global error handling and route implementations:

```javascript
// server.js - Express application with RFC 7807 compliant error middleware
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Simulated In-Memory Database
const orders = new Map();

// POST /api/v1/orders - Creates a new order (201 Created)
app.post('/api/v1/orders', (req, res, next) => {
  try {
    const { orderId, amount, customerEmail } = req.body;

    // Field-level validation
    const invalidParams = [];
    if (!orderId || typeof orderId !== 'string') {
      invalidParams.push({ name: 'orderId', reason: 'Must be a non-empty string.' });
    }
    if (typeof amount !== 'number' || amount <= 0) {
      invalidParams.push({ name: 'amount', reason: 'Must be a positive number.' });
    }
    if (!customerEmail || !customerEmail.includes('@')) {
      invalidParams.push({ name: 'customerEmail', reason: 'Must be a valid email address.' });
    }

    if (invalidParams.length > 0) {
      throw new ValidationError(invalidParams);
    }

    // State conflict check
    if (orders.has(orderId)) {
      throw new ConflictError(`Order with ID '${orderId}' already exists.`);
    }

    const newOrder = { orderId, amount, customerEmail, createdAt: new Date().toISOString() };
    orders.set(orderId, newOrder);

    // 201 Created requires a Location header pointing to the new resource URI
    const resourceLocation = `/api/v1/orders/${orderId}`;
    res.setHeader('Location', resourceLocation);
    return res.status(201).json({
      data: newOrder
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/orders/:id - Fetches an order (200 OK or 404 Not Found)
app.get('/api/v1/orders/:id', (req, res, next) => {
  try {
    const order = orders.get(req.params.id);
    if (!order) {
      throw new ResourceNotFoundError('Order', req.params.id);
    }
    return res.status(200).json({ data: order });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/orders/:id - Deletes an order (204 No Content)
app.delete('/api/v1/orders/:id', (req, res, next) => {
  try {
    const exists = orders.has(req.params.id);
    if (!exists) {
      throw new ResourceNotFoundError('Order', req.params.id);
    }
    orders.delete(req.params.id);

    // 204 No Content: Must send no body and no Content-Type
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// RFC 7807 / RFC 9457 Global Error Handling Middleware
app.use((err, req, res, next) => {
  // Generate unique trace ID for correlation between client and server logs
  const traceId = crypto.randomUUID();

  // Differentiate known domain errors vs unexpected 500 crashes
  const isAppError = err instanceof AppError;
  const status = isAppError ? err.statusCode : 500;
  const title = isAppError ? err.message : 'Internal Server Error';
  const type = isAppError ? err.problemType : 'https://api.example.com/probs/internal-error';
  const detail = isAppError ? err.detail : 'An unexpected server error occurred. Please contact support.';

  // Special header handling for specific status codes
  if (status === 429 && err.extensions && err.extensions.retryAfter) {
    res.setHeader('Retry-After', err.extensions.retryAfter);
  }

  // Construct standard RFC 7807 problem details response body
  const problemDetails = {
    type,
    title,
    status,
    detail,
    instance: req.originalUrl,
    traceId,
    ...(isAppError ? err.extensions : {})
  };

  // Log internal 500 errors with full stack trace for internal debugging
  if (status === 500) {
    console.error(`[CRITICAL] TraceID: ${traceId} Uncaught Exception:`, err.stack);
  }

  res.setHeader('Content-Type', 'application/problem+json');
  return res.status(status).json(problemDetails);
});
```

Here is the corresponding client-side consumption using Axios with an interceptor that automates retry and error behavior based on the status classes:

```javascript
// client-api.js - Intelligent HTTP client handling status codes
const axios = require('axios');

const apiClient = axios.create({
  baseURL: 'https://api.example.com',
  timeout: 5000
});

apiClient.interceptors.response.use(
  (response) => {
    // 2xx Success: Simply return the unpacked response data
    return response.data;
  },
  async (error) => {
    if (!error.response) {
      // Network drop, DNS resolution failure, or TCP timeout
      console.error("Network connection failed. Check your internet.");
      return Promise.reject(error);
    }

    const { status, headers, data } = error.response;

    // 401: Authentication expired -> Redirect to login or execute refresh token
    if (status === 401) {
      console.warn("Session expired. Triggering re-authentication flow...");
      // window.location.href = '/login';
      return Promise.reject(data);
    }

    // 422: Form validation error -> Return structured invalid_params to UI form
    if (status === 422) {
      console.warn("Form validation errors:", data.invalid_params);
      return Promise.reject(data);
    }

    // 429 or 503: Rate limited or temporarily unavailable -> Read Retry-After and retry
    if ((status === 429 || status === 503) && error.config && !error.config._isRetry) {
      error.config._isRetry = true;
      const retryAfterSeconds = parseInt(headers['retry-after'], 10) || 2;
      console.info(`Rate limited. Backing off for ${retryAfterSeconds}s before retry...`);

      await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000));
      return apiClient(error.config);
    }

    // 5xx: Server issue -> Display user-friendly notification with traceId
    if (status >= 500) {
      console.error(`Server error (${status}). Reference ID: ${data.traceId}`);
    }

    return Promise.reject(data);
  }
);
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the exact difference between 401 Unauthorized and 403 Forbidden?**

The distinction comes down to identity (Authentication) versus permissions (Authorization).

`401 Unauthorized` is a misnomer in the original HTTP specification; it actually means **Unauthenticated**. It indicates that the client has not provided valid authentication credentials. The user's identity is unknown. Sending this response requires the server to send a `WWW-Authenticate` response header defining the authentication challenge (such as Bearer tokens or Basic auth). Providing valid credentials can turn this into a successful request.

`403 Forbidden` means **Unauthorized**. The server knows exactly who the user is (authentication succeeded), but the authenticated identity does not have sufficient access rights or roles to perform the requested action on this specific resource. Retrying the identical request with the same credentials will always fail.

**Q: Why should an API return 201 Created with a Location header instead of just 200 OK?**

Returning `201 Created` explicitly communicates to the client that a new persistent resource was successfully minted as a result of the request, distinguishing it from an update or read. 

According to RFC 9110, a `201 Created` response should include a `Location` header containing the absolute or relative URI of the newly created resource (e.g., `Location: /api/v1/documents/8841`). This allows clients and automated systems to immediately discover the canonical address of the new entity without having to parse the response body or guess how URLs are structured. It also enables HTTP caches and proxies to properly track resource creation.

**Q: What is the difference between 301, 302, 307, and 308 redirects? Why were 307 and 308 introduced?**

The difference centers on permanence and whether the HTTP request method and body are preserved across the redirect.

In early HTTP/1.0 and HTTP/1.1 specifications, `301 Moved Permanently` and `302 Found` were defined. However, major browsers implemented a non-standard behavior: if a user submitted a `POST` form that received a `301` or `302`, the browser automatically changed the subsequent request method to `GET` and dropped the request body. While convenient for website redirects, this broke REST APIs where a `POST`, `PUT`, or `DELETE` needed to be forwarded to a new endpoint with the exact same method and payload.

To fix this ambiguity without breaking backward compatibility for old websites, IETF introduced `307` and `308`:
- `301 Moved Permanently`: Permanent redirect; legacy clients may change `POST` to `GET`.
- `302 Found`: Temporary redirect; legacy clients may change `POST` to `GET`.
- `307 Temporary Redirect`: Temporary redirect; strictly guarantees that the client MUST NOT change the HTTP method or body when making the redirected request.
- `308 Permanent Redirect`: Permanent redirect; strictly guarantees that the client MUST NOT change the HTTP method or body when making the redirected request, while instructing search engines to permanently transfer index rank.

**Q: What is the exact difference between 502 Bad Gateway and 504 Gateway Timeout in a reverse proxy architecture?**

Both errors are emitted by an intermediate edge server or reverse proxy (such as NGINX, AWS Application Load Balancer, or Cloudflare) acting as a gateway to an upstream application cluster.

A `502 Bad Gateway` occurs when the reverse proxy attempts to communicate with the upstream application process and receives an immediate invalid response, a TCP connection refusal (`ECONNREFUSED`), or an unexpected socket closure (`RST`). This means the upstream application is crashed, dead, out of memory, or not running on the expected port.

A `504 Gateway Timeout` occurs when the reverse proxy successfully establishes a TCP connection to the upstream application, sends the request, but the upstream application fails to complete the computation and send back a response before the proxy's read timeout threshold expires (e.g., NGINX `proxy_read_timeout` defaults to 60 seconds, but an unindexed database query took 75 seconds).

**Q: When should you use 400 Bad Request vs 422 Unprocessable Entity?**

Use `400 Bad Request` when the request envelope or transport-level syntax is corrupted or unreadable by the server parser. Examples include malformed JSON syntax (missing closing bracket), unparseable query parameters, or missing required HTTP headers.

Use `422 Unprocessable Entity` (RFC 9110 / WebDAV RFC 4918) when the request syntax is pristine and the JSON parses perfectly, but the semantic data inside violates business logic, domain rules, or field constraints (e.g., an age field submitted as `-5`, an invalid email address format, or an end date that precedes the start date).

**Q: How does RFC 7807 / RFC 9457 improve API error handling compared to ad-hoc error bodies?**

Ad-hoc error bodies (such as `{ "error": "User not found" }` or `{ "status": "fail", "msg": "Invalid token" }`) lack consistency across different services, teams, and third-party APIs. Every frontend application must write bespoke error parsers for every endpoint.

RFC 7807 and RFC 9457 define a universal standard media type (`application/problem+json`) with guaranteed, machine-readable fields: `type` (a stable URI categorization), `title` (constant human-readable summary), `status` (HTTP status code matching the header), `detail` (specific instance explanation), and `instance` (trace/URI identifier). This enables universal SDKs, API gateways, and client interceptors to automatically extract error types, format UI validation banners, log distributed trace IDs, and handle rate-limit retry headers without custom parsing logic.

**Q: Why is returning 200 OK with `{ "success": false, "error": "..." }` considered a dangerous anti-pattern?**

It breaks the core architectural layer separation of the HTTP protocol:
1. **Caching and CDNs:** CDNs and shared HTTP proxies cache `200 OK` responses by default. Caching an error payload serves that error to subsequent users.
2. **Client Frameworks:** Standard libraries (Axios, React Query, SWR, Fetch) route responses based on status codes. A `200` triggers the success callback, forcing every single component to manually write defensive boilerplate (`if (!res.data.success)`) instead of relying on centralized global error interceptors.
3. **Observability and APM:** Monitoring systems (Datadog, New Relic, CloudWatch, Prometheus) track service health using HTTP status code ratios. Returning `200` masks critical outages, preventing alerts from waking on-call engineers during database crashes.
4. **API Gateways:** Gateways cannot enforce automated circuit breakers or failover routing if the server claims the request was a success.

**Q: When should a DELETE endpoint return 200 OK vs 204 No Content vs 202 Accepted?**

- `204 No Content`: The standard best-practice response when the resource was immediately and synchronously deleted, and the server has no data or entity to return to the client.
- `200 OK`: Used when the `DELETE` operation returns an entity payload in the response body, such as the final snapshot of the deleted item or a summary object (e.g., `{ "deleted": true, "archivedItemsCount": 4 }`).
- `202 Accepted`: Used when the deletion is asynchronous or long-running (e.g., soft-deleting a massive organization account containing millions of records). The request is placed onto a message queue, and the response body returns a job status URL.

## 6. The Traps — What Goes Wrong

**The "200 OK Error" Anti-Pattern**
- *The Mistake:* Wrapping all controller handlers in a global `try/catch` and returning `res.status(200).json({ error: err.message })`.
- *Why It Breaks:* HTTP intermediate proxies, browser caches, and client networking interceptors rely entirely on HTTP status headers. Returning `200` prevents centralized error handling, pollutes client-side cache stores with error messages, and renders uptime dashboards completely blind to production crashes.
- *The Fix:* Always set the response status code matching the semantic failure (e.g., `4xx` for user errors, `5xx` for server errors) and serialize error details into a structured body.

**Throwing 500 Internal Server Error for Client Validation Mistakes**
- *The Mistake:* Letting an ORM or schema validation library throw an unhandled exception, causing the framework to default to `500 Internal Server Error`.
- *Why It Breaks:* When mobile and frontend clients encounter a `500` error, automated retry policies treat it as a transient infrastructure hiccup and re-send the invalid payload repeatedly. This causes alert fatigue for on-call engineers and triggers retry storms that can overwhelm the backend database.
- *The Fix:* Intercept schema validation errors in middleware and translate them explicitly into `400 Bad Request` or `422 Unprocessable Entity`.

**Returning 204 No Content with a Response Body**
- *The Mistake:* Calling `res.status(204).json({ message: "Deleted successfully" })`.
- *Why It Breaks:* RFC 9110 strictly dictates that a `204 No Content` response must not contain a message body or `Content-Type` header. Some HTTP client parsers and HTTP/2 multiplexers will hang indefinitely waiting for the stream to close or fail to parse subsequent pipelined requests when bytes exist after a `204`.
- *The Fix:* When sending `204`, use `res.status(204).end()` with zero body. If you must return a confirmation message, use `200 OK`.

**Leaking Internal Stack Traces in 500 Responses**
- *The Mistake:* Returning `res.status(500).json({ error: err.stack, query: err.sql })` to the client in production.
- *Why It Breaks:* This is a severe security vulnerability. Attackers deliberately craft malformed inputs to trigger 500 errors, extracting database table names, SQL queries, internal IP addresses, and third-party library versions from the stack trace to execute targeted exploits.
- *The Fix:* Catch 500 errors in global middleware, generate an opaque `traceId`, log the full stack trace internally to your secure logging pipeline, and return only the sanitized `traceId` and a generic message to the client.

**Using 301 Permanent Redirects for Temporary Routes**
- *The Mistake:* Using `301 Moved Permanently` for temporary promotions, maintenance redirects, or routing migrations that might change next month.
- *Why It Breaks:* Browsers cache `301 Moved Permanently` responses aggressively and indefinitely in their local disk caches without re-checking the server. Even if you revert the server configuration, existing users' browsers will continue redirecting to the old destination until they manually clear their browser cache.
- *The Fix:* Use `302 Found` or `307 Temporary Redirect` for any redirect that is not guaranteed to remain permanent forever.

**Omitting the Retry-After Header on 429 and 503 Responses**
- *The Mistake:* Returning `429 Too Many Requests` or `503 Service Unavailable` with only a text message and no headers.
- *Why It Breaks:* Without a `Retry-After` header, client SDKs have no guidance on when it is safe to resume sending traffic. Naive clients will either retry immediately (worsening the server overload) or guess arbitrary backoff intervals.
- *The Fix:* Always include a `Retry-After: <seconds>` header specifying the exact cooling-off duration.

## 7. Compare With Related Concepts

**HTTP Status Codes vs Application-Level Business Error Codes**
- *The Difference:* HTTP status codes (e.g., `422 Unprocessable Entity`) represent the transport-level protocol outcome understood by every proxy, gateway, and HTTP client. Application-level business error codes (e.g., `INSUFFICIENT_FUNDS`, `CARD_EXPIRED`, `SEAT_ALREADY_RESERVED`) live inside the JSON response body to communicate domain-specific business rules.
- *The Rule:* Use HTTP status codes for generic transport and error categorization; use application error codes inside an RFC 7807 body for domain-specific logic.

**401 Unauthorized vs 403 Forbidden**
- *The Difference:* `401` means unauthenticated (the server does not know who you are; provide credentials). `403` means unauthorized (the server knows who you are, but you lack permission to perform this action).
- *The Rule:* Return `401` when credentials are missing or invalid; return `403` when a verified user tries to access a restricted resource.

**301 / 302 vs 307 / 308 Redirects**
- *The Difference:* `301` and `302` allow legacy clients to rewrite `POST`/`PUT` methods into `GET` requests upon redirecting. `307` (temporary) and `308` (permanent) strictly preserve the original HTTP method and request body.
- *The Rule:* For modern REST APIs handling `POST`, `PUT`, `PATCH`, or `DELETE` requests, always use `307` or `308` instead of `301` or `302`.

**400 Bad Request vs 422 Unprocessable Entity**
- *The Difference:* `400` indicates a syntax failure (the JSON cannot be parsed or headers are invalid). `422` indicates a semantic validation failure (the JSON is valid syntax, but values violate schema or business rules).
- *The Rule:* Use `400` when the parser crashes on the raw request; use `422` when the request parses cleanly but fails data validation.

**502 Bad Gateway vs 504 Gateway Timeout**
- *The Difference:* `502` means the reverse proxy could not connect to the upstream server or received an immediate connection reset (upstream is dead/crashed). `504` means the reverse proxy connected successfully, but the upstream took longer to compute than the proxy's read timeout limit (upstream is slow).
- *The Rule:* Check process managers (PM2, Kubernetes pods) on a `502`; check database query performance, external API calls, and timeout configs on a `504`.

**REST HTTP Status Codes vs GraphQL Single-Endpoint 200 OK Model**
- *The Difference:* REST uses the full spectrum of HTTP status codes across unique resource endpoints. GraphQL routes all operations through a single `POST /graphql` endpoint and traditionally returns `200 OK` with an `errors` array in the JSON payload, shifting error categorization from the transport layer to the application layer.
- *The Rule:* Use standard HTTP status codes for REST APIs; use `200 OK` with structured `errors` for GraphQL query/mutation execution errors (reserving 4xx/5xx only for network or gateway authentication failures).

**304 Not Modified vs 200 OK with Cache-Control**
- *The Difference:* `200 OK` transfers the entire resource payload across the wire. `304 Not Modified` is a zero-body conditional response sent when the client's `ETag` or `Last-Modified` timestamp matches the server's current version, instructing the client to reuse its cached disk copy.
- *The Rule:* Use `304 Not Modified` on conditional `GET` requests to save bandwidth and reduce response latency to near zero.

## 8. 🧠 The Memory Hook

Remember the 5 status classes with the quick five-finger rule:
- **1xx:** "Hold on, we're talking protocol."
- **2xx:** "Here is what you asked for."
- **3xx:** "Go ask over there."
- **4xx:** "You messed up your request."
- **5xx:** "I crashed trying to fulfill it."

And for reverse proxy debugging:
- **502 Bad Gateway:** *Nobody picked up the phone.* (Process dead)
- **504 Gateway Timeout:** *Left on hold forever.* (Query slow)
