# HTTP Methods: Semantics, Safety, and Idempotency

## 1. Why This Exists — The Problem First

In the early 2000s, an engineering team built an internal administration dashboard. To make it quick and easy for moderators to delete spam accounts, they put a standard hyperlink on every user row: `<a href="/admin/users/42/delete">Delete User</a>`. It worked in manual testing. 

Then Googlebot and a popular browser extension with pre-fetching enabled were introduced to the corporate network. 

The web crawler automatically followed every `<a>` tag it could find to index the pages. The browser pre-fetcher silently issued background `GET` requests for every link on the screen to speed up navigation. Within twenty minutes, thousands of customer accounts and database records were wiped clean. The crawlers did not do anything wrong—they were operating under the fundamental architectural guarantee of the World Wide Web: **an HTTP GET request is safe and must never alter server state**.

```txt
┌────────────────┐     GET /admin/users/42/delete      ┌─────────────────────────┐
│ Googlebot /    │ ──────────────────────────────────> │ Backend Server          │
│ Browser        │ <────────────────────────────────── │ Deletes user #42 in DB! │
│ Pre-fetcher    │         200 OK (Purged)             │ (Violates HTTP spec)    │
└────────────────┘                                     └─────────────────────────┘
```

Around the same time, e-commerce websites suffered from the infamous "double-charge" bug. A customer clicked "Pay $100", but their Wi-Fi dropped for three seconds before receiving the server's response. The user saw a frozen screen and clicked "Refresh" or "Back". The browser popped up a dialog box: *"Confirm Form Resubmission: To display this page again, the browser must send the information you entered previously."* The user clicked "OK", and the browser resent the `POST` request. The backend blindly processed it a second time, charging the customer's credit card $200 instead of $100.

These disasters happen when developers treat HTTP methods as arbitrary aesthetic labels or casual route prefixes rather than rigid architectural contracts. HTTP methods exist so that clients, intermediary proxies, Content Delivery Networks (CDNs), search crawlers, browser engines, and API gateways can make safe, automated decisions about **caching**, **pre-fetching**, **request retries**, and **error recovery** without knowing your application's business logic.

---

## 2. The Analogy — Make It Obvious

Think of an HTTP API as a **Bank Vault and Teller Counter**:

```txt
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BANK TELLER COUNTER                              │
├───────────────────┬─────────────────────────────────────────────────────────┤
│ GET               │ Look through the glass window at your safety deposit    │
│                   │ box. Inspecting it leaves the contents unchanged.       │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ HEAD              │ Ask the teller: "Is box #42 present and what is its     │
│                   │ weight ticket?" You get metadata, not the box.          │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ OPTIONS           │ Look at the board on the wall listing which services    │
│                   │ this teller window supports (Withdraw, Deposit, Close). │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ PUT               │ Hand the teller a brand-new box to completely replace   │
│                   │ whatever was inside slot #42. Repeat it 5 times with    │
│                   │ the same box, and slot #42 still holds that exact box.  │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ PATCH             │ Hand the teller a sticker to change just the phone      │
│                   │ number tag on box #42. The rest of the box stays as is. │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ DELETE            │ Order the teller to shred box #42. Once shredded,       │
│                   │ ordering them to shred it again leaves it shredded.     │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ POST              │ Drop an envelope with $50 cash into the night deposit   │
│                   │ chute. Every time you drop an envelope, another $50     │
│                   │ deposit record is created and processed.                │
└───────────────────┴─────────────────────────────────────────────────────────┘
```

- **Looking through the glass (GET)** is completely **Safe** and **Idempotent**. You can look once, look ten times, or have 50 people look at the same time. The vault state never changes.
- **Checking the weight ticket (HEAD)** gives you the exact dimensions, timestamp, and metadata without pulling the heavy metal box out of storage.
- **Swapping out the whole box (PUT)** changes what is inside the vault (not safe), but if the receipt blows away in the wind and you repeat the exact same box swap, the vault still ends up with that identical replacement box (**Idempotent**).
- **Shredding the box (DELETE)** destroys the record (not safe), but repeating the destruction command leaves the box just as gone as it was after the first command (**Idempotent**).
- **Dropping cash envelopes down the chute (POST)** creates a new independent transaction every single time. If your hand slips and you drop three envelopes, you create three separate deposits (**Neither Safe nor Idempotent**).

---

## 3. How It Actually Works — The Full Explanation

Every HTTP request begins with a request line containing three parts: the method verb, the request target (URI), and the HTTP version protocol:

```http
POST /api/v1/orders HTTP/1.1
Host: api.example.com
Content-Type: application/json
Content-Length: 48

{"item_id": "laptop-99", "quantity": 1, "usd": 1200}
```

The method verb communicates the client's intent and establishes the mathematical guarantees of the transaction.

### The Full HTTP Method Taxonomy (RFC 9110 & RFC 5789)

```txt
                              HTTP METHODS
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
      Safe Methods                                    Unsafe Methods
(Read-only, Zero state mutation)                 (State-mutating operations)
   GET, HEAD, OPTIONS, TRACE                      PUT, PATCH, DELETE, POST, CONNECT
           │                                                 │
           ▼                                                 ▼
   All Safe Methods are                               Idempotent?
     ALWAYS Idempotent                                 ┌─────┴─────┐
                                                       ▼           ▼
                                                  Idempotent   Non-Idempotent
                                                  PUT, DELETE    POST, PATCH*
                                               (*PATCH can be made idempotent)
```

1. **`GET`**: Requests a representation of the target resource. A GET request must have no state-altering side effects on the server. It can be cached by CDNs and browsers, prefetched in the background, and bookmarked.
2. **`HEAD`**: Identical to `GET`, but the server **must not** return a response message body. It returns only the headers (like `Content-Length`, `ETag`, `Last-Modified`). Clients use it to check if a file changed or to determine download size before committing network bandwidth.
3. **`OPTIONS`**: Discovers the communication options and capabilities supported by the web server or a specific resource URI (e.g. CORS preflight checks). The server responds with supported verbs in the `Allow` or `Access-Control-Allow-Methods` header.
4. **`POST`**: Submits an entity to the target resource for processing according to the resource's own specific semantics. Commonly used to create subordinate resources (where the server assigns the ID) or to trigger non-idempotent business operations (like processing a credit card charge or triggering a webhook).
5. **`PUT`**: Creates or completely replaces the resource at the target URI with the payload sent in the request. If you send `{ "name": "Alice" }` to a resource that previously had `{ "name": "Alice", "age": 30, "city": "Seattle" }`, the resulting resource becomes `{ "name": "Alice" }`—all missing fields are overwritten or reset.
6. **`PATCH` (RFC 5789)**: Applies partial modifications to a resource. The payload contains a set of change instructions or replacement fields (delta). Unlike PUT, omitted fields remain untouched.
7. **`DELETE`**: Requests that the server remove the target resource representation.
8. **`TRACE`**: Performs a message loop-back test along the path to the target resource. The server reflects the exact request back to the client. *Production note:* Almost all modern production servers disable TRACE to eliminate Cross-Site Tracing (XST) vulnerabilities where attackers steal HTTP-only cookies.
9. **`CONNECT`**: Converts the request connection into a transparent two-way TCP/IP tunnel, primarily used by HTTP forward proxies to establish TLS/SSL encrypted sessions (HTTPS).

---

### The Two Core Mathematical Guarantees

When designing backend architectures, distributed systems, and REST APIs, every design choice hinges on two mathematical concepts: **Safety** and **Idempotency**.

```txt
┌───────────────┬───────────────────────────────────┬────────────────────────────┐
│ Property      │ Mathematical Formalism            │ Distributed System Impact  │
├───────────────┼───────────────────────────────────┼────────────────────────────┤
│ Safety        │ State(after) == State(before)     │ Caching, pre-fetching, and │
│               │ (Zero side effects on resources)  │ web crawling are 100% safe │
├───────────────┼───────────────────────────────────┼────────────────────────────┤
│ Idempotency   │ f(f(x)) == f(x)                   │ Automated network retries  │
│               │ (N executions produce identical   │ will never create duplicate│
│               │ server resource state)            │ records or side effects    │
└───────────────┴───────────────────────────────────┴────────────────────────────┘
```

#### 1. Safe Methods (`GET`, `HEAD`, `OPTIONS`, `TRACE`)
A method is safe if calling it does not alter server state visible to the client. 
- The server may still update access logs, increment Prometheus metrics, or write to cache tables when handling a `GET` request, but the **resource state** remains unchanged.
- Because safe methods cause no mutations, browsers can aggressively pre-render pages, and search crawlers can index links without confirmation dialogs.

#### 2. Idempotent Methods (`GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`)
An operation is idempotent if executing it multiple times leaves the system in the exact same state as executing it once ($f(f(x)) = f(x)$).

- **Why `PUT` is idempotent**: If you send `PUT /users/42` with `{ "email": "a@test.com" }` once, user 42's email is `a@test.com`. If you send it 50 times, user 42's email is still `a@test.com`.
- **Why `DELETE` is idempotent**: If you send `DELETE /orders/99`, order 99 is deleted. If you send `DELETE /orders/99` again, order 99 is still deleted. Even if the first call returns `204 No Content` and the second returns `404 Not Found`, the **server state** is identical: order 99 does not exist.
- **Why `POST` is NOT idempotent**: If you send `POST /orders` with `{ "amount": 100 }`, the server creates a new row with auto-increment ID `101`. If you send it again, the server creates row `102`. The database state has changed from 1 order to 2 orders.

---

### Why Network Reliability Demands Idempotency

In distributed systems and microservices, networks are inherently unreliable. When a client sends a request, three distinct failure points exist:

```txt
Client ──[ 1. Request lost in transit ]──> Server (Never executed)
Client ──[ 2. Server crashes during exec ]─> Server (Partially executed)
Client <─[ 3. Response lost in transit ]── Server (Successfully executed!)
```

If a network timeout occurs, the client **cannot know** whether the server never received the request or if the server executed the request but the response packet was dropped.

- If the operation is **Idempotent** (`PUT`, `DELETE`, `GET`), the client or API Gateway can safely **auto-retry** the request immediately. If the server already executed it, repeating it causes zero damage.
- If the operation is **Non-Idempotent** (`POST`), auto-retrying risks duplicate charges, double orders, or repeated notifications. To make a POST safe for retries, the engineering team must implement an **Idempotency Key pattern** (using Redis distributed locks and unique request tokens).

---

### HEAD vs GET: Bandwidth Optimization

When an application needs to verify if a large remote file (such as a 10 GB dataset or video file) has changed or check its size, issuing a `GET` request wastes gigabytes of bandwidth.

```http
HEAD /downloads/dataset-2026.csv HTTP/1.1
Host: data.example.com

HTTP/1.1 200 OK
Content-Type: text/csv
Content-Length: 10737418240
ETag: "w/33a64df551425fcc55e4d42a148795d9f25f89d4"
Last-Modified: Wed, 26 Aug 2026 08:30:00 GMT
```

The response includes the exact headers that a `GET` would produce, but the body is truncated. The client compares the `ETag` or `Last-Modified` against its local cache before deciding whether to trigger a full `GET`.

---

### OPTIONS and the CORS Preflight Dance

When a frontend JavaScript application running on `https://my-app.com` sends a cross-origin mutation (such as a `PUT`, `DELETE`, or a `POST` with `Content-Type: application/json`) to `https://api.backend.com`, the browser refuses to send the payload immediately.

Instead, the browser injects an automatic **preflight** `OPTIONS` request to verify server permissions:

```txt
Browser (my-app.com)                                API Server (api.backend.com)
      │                                                         │
      │ 1. OPTIONS /api/users/42                                │
      │    Origin: https://my-app.com                           │
      │    Access-Control-Request-Method: DELETE                │
      │    Access-Control-Request-Headers: Authorization        │
      │ ──────────────────────────────────────────────────────> │
      │                                                         │
      │ 2. 204 No Content                                       │
      │    Access-Control-Allow-Origin: https://my-app.com      │
      │    Access-Control-Allow-Methods: GET, POST, PUT, DELETE │
      │    Access-Control-Allow-Headers: Authorization          │
      │    Access-Control-Max-Age: 86400                        │
      │ <────────────────────────────────────────────────────── │
      │                                                         │
      │ 3. (Permission Granted) DELETE /api/users/42            │
      │    Authorization: Bearer xyz123                         │
      │ ──────────────────────────────────────────────────────> │
```

If the server does not support `OPTIONS` or omits the correct `Access-Control-Allow-Methods` headers, the browser cancels the request before the state-altering `DELETE` payload ever reaches your backend code.

---

## 4. Real Code — See It Working

Below is a complete, production-ready Express API demonstrating strict HTTP method semantics, idempotency verification, 405 Method Not Allowed handling with mandatory `Allow` headers, and standard status codes (`201`, `204`, `405`).

```javascript
// server.js - Node.js Express implementation of strict HTTP method semantics
const express = require('express');
const app = express();

app.use(express.json());

// In-memory data store for resources
const articles = new Map([
  [1, { id: 1, title: 'Mastering HTTP', content: 'HTTP semantics matter.', views: 100 }],
  [2, { id: 2, title: 'Distributed Systems', content: 'Handling failures.', views: 45 }]
]);

// In-memory cache for POST idempotency keys (in production, use Redis with TTL)
const idempotencyStore = new Map();

// Helper to generate next ID
let nextId = 3;

// ==========================================
// 1. COLLECTION ROUTE: /api/articles
// ==========================================

// GET /api/articles - SAFE & IDEMPOTENT (Reads all items)
app.get('/api/articles', (req, res) => {
  const list = Array.from(articles.values());
  res.status(200).json({ data: list });
});

// HEAD /api/articles - SAFE & IDEMPOTENT (Returns headers only, no body)
app.head('/api/articles', (req, res) => {
  const payload = JSON.stringify({ data: Array.from(articles.values()) });
  // Calculate headers manually for HEAD requests
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'ETag': `"articles-collection-v${articles.size}"`
  });
  // Send empty body with 200 OK
  res.status(200).end();
});

// POST /api/articles - UNSAFE & NON-IDEMPOTENT (Creates resource with Idempotency Key protection)
app.post('/api/articles', (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'];
  const { title, content } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  // Check if this exact request was already processed
  if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
    const cachedResponse = idempotencyStore.get(idempotencyKey);
    return res.status(cachedResponse.status).set('X-Cache-Lookup', 'HIT').json(cachedResponse.body);
  }

  // Create the new subordinate resource
  const newArticle = {
    id: nextId++,
    title,
    content,
    views: 0
  };
  articles.set(newArticle.id, newArticle);

  const responsePayload = { data: newArticle };

  // Cache response if idempotency key was provided
  if (idempotencyKey) {
    idempotencyStore.set(idempotencyKey, {
      status: 201,
      body: responsePayload
    });
  }

  // 201 Created MUST include the Location header pointing to the new resource URI
  res.status(201)
    .location(`/api/articles/${newArticle.id}`)
    .json(responsePayload);
});

// OPTIONS /api/articles - SAFE & IDEMPOTENT (Capability discovery)
app.options('/api/articles', (req, res) => {
  res.set('Allow', 'GET, HEAD, POST, OPTIONS');
  res.status(204).end();
});

// ==========================================
// 2. SINGLE ITEM ROUTE: /api/articles/:id
// ==========================================

// GET /api/articles/:id - SAFE & IDEMPOTENT
app.get('/api/articles/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const article = articles.get(id);

  if (!article) {
    return res.status(404).json({ error: 'Article not found' });
  }

  res.status(200).json({ data: article });
});

// PUT /api/articles/:id - UNSAFE & IDEMPOTENT (Full resource replacement)
app.put('/api/articles/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { title, content } = req.body;

  // PUT requires the complete representation; missing fields are reset
  if (!title || !content) {
    return res.status(400).json({ error: 'PUT requires full representation (title and content)' });
  }

  // Pure PUT replaces the whole object (views resets to 0 because it was omitted)
  const replacedArticle = {
    id,
    title,
    content,
    views: 0 // Explicitly overwritten/reset
  };

  articles.set(id, replacedArticle);

  // 200 OK with the new representation (or 204 No Content if returning nothing)
  res.status(200).json({ data: replacedArticle });
});

// PATCH /api/articles/:id - UNSAFE (Partial resource update)
app.patch('/api/articles/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = articles.get(id);

  if (!existing) {
    return res.status(404).json({ error: 'Article not found' });
  }

  // PATCH merges only the provided fields; omitted fields remain untouched
  const updatedArticle = {
    ...existing,
    ...(req.body.title !== undefined && { title: req.body.title }),
    ...(req.body.content !== undefined && { content: req.body.content }),
    ...(req.body.views !== undefined && { views: req.body.views })
  };

  articles.set(id, updatedArticle);
  res.status(200).json({ data: updatedArticle });
});

// DELETE /api/articles/:id - UNSAFE & IDEMPOTENT (Removes resource)
app.delete('/api/articles/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  // If item existed, delete it. If it was already gone, state is still "deleted"
  articles.delete(id);

  // 204 No Content is the standard response for successful deletion without response payload
  res.status(204).end();
});

// OPTIONS /api/articles/:id - SAFE & IDEMPOTENT
app.options('/api/articles/:id', (req, res) => {
  res.set('Allow', 'GET, PUT, PATCH, DELETE, OPTIONS');
  res.status(204).end();
});

// ==========================================
// 3. RFC-COMPLIANT 405 METHOD NOT ALLOWED HANDLER
// ==========================================
// When a client sends a method not supported on an existing route (e.g. DELETE /api/articles),
// RFC 9110 strictly requires a 405 status code WITH the mandatory 'Allow' header.
app.all('/api/articles', (req, res) => {
  res.set('Allow', 'GET, HEAD, POST, OPTIONS');
  res.status(405).json({
    error: `Method ${req.method} not allowed on /api/articles. Supported: GET, HEAD, POST, OPTIONS.`
  });
});

app.all('/api/articles/:id', (req, res) => {
  res.set('Allow', 'GET, PUT, PATCH, DELETE, OPTIONS');
  res.status(405).json({
    error: `Method ${req.method} not allowed on /api/articles/:id. Supported: GET, PUT, PATCH, DELETE, OPTIONS.`
  });
});

// Start the server if run directly
if (require.main === module) {
  app.listen(3000, () => console.log('HTTP Methods API running on http://localhost:3000'));
}

module.exports = app;
```

---

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the exact difference between a "Safe" HTTP method and an "Idempotent" HTTP method?**

A safe method is read-only from the client's perspective; executing it causes zero state mutations to the underlying resource on the server (`GET`, `HEAD`, `OPTIONS`, `TRACE`). An idempotent method is one where executing it $N$ times produces the exact same server resource state as executing it once ($f(f(x)) = f(x)$). 

All safe methods are inherently idempotent because doing nothing repeatedly leaves the state unchanged. However, not all idempotent methods are safe. `DELETE` and `PUT` are idempotent because sending them 10 times results in the exact same resource state as sending them once, but they are **unsafe** because the first call alters server state (by deleting or overwriting data).

---

**Q: Why is PUT idempotent while POST is not, and how does this affect network retry strategies?**

With `PUT`, the client identifies the target resource URI (`PUT /users/42`) and provides the complete desired state. If a network timeout occurs between client and server, the client or proxy can automatically retry the `PUT` request without asking the user. If the server processed the first attempt, the second attempt merely overwrites the exact same data with the exact same values.

With `POST`, the client targets a parent collection (`POST /orders`) and asks the server to generate a subordinate resource or process a command. The server assigns the ID and creates a new database record each time. If a timeout occurs, auto-retrying a raw `POST` risks creating two separate orders and billing the customer twice. Automatic retries on `POST` are unsafe unless protected by an application-level Idempotency Key.

---

**Q: How do PUT and PATCH differ in terms of payload structure, missing fields, and idempotency guarantees?**

`PUT` is a complete resource replacement. The client must transmit the full object representation. Any fields omitted in the request body must be treated by the server as cleared, set to null, or reset to defaults. `PUT` is strictly idempotent by definition.

`PATCH` (RFC 5789) is a partial delta update. The client transmits only the fields that need mutation; all omitted fields remain unchanged on the server. While `PATCH` can be designed to be idempotent (e.g. `{ "status": "shipped" }`), it is not inherently idempotent in the specification because delta operations can express relative mutations, such as `{ "op": "increment", "value": 5 }` or appending an item to an array.

---

**Q: Why does the HTTP specification allow subsequent DELETE calls to return `404 Not Found` while still classifying DELETE as idempotent?**

Idempotency applies to the **state of the server resource**, not the returned HTTP status code. 

When you call `DELETE /users/42` the first time, the resource is removed, and the server returns `204 No Content`. When you call `DELETE /users/42` a second time, the resource is already gone, so the server returns `404 Not Found`. Despite the different status codes, the server's state after request #1 (user 42 does not exist) is identical to the server's state after request #2 (user 42 does not exist). The operation is mathematically idempotent.

---

**Q: What is the Post/Redirect/Get (PRG) pattern and what problem does it solve in web architectures?**

The Post/Redirect/Get pattern prevents duplicate form submissions when users refresh a page after submitting data.

When a browser submits a traditional HTML form via `POST /checkout`, if the server directly responds with `200 OK` and renders the HTML receipt, hitting the browser's "Refresh" button causes the browser to resend the previous `POST` request (the browser will display the "Confirm Form Resubmission" dialog).

To prevent this, the server processes the `POST` and immediately responds with a `303 See Other` (or `302 Found`) redirect containing a `Location: /receipt/order-123` header. The browser follows the redirect using a safe `GET` request. When the user refreshes their screen, they simply re-execute the safe `GET` request on the receipt page, completely preventing duplicate order submissions.

---

**Q: Why does the browser send an OPTIONS request before certain cross-origin API calls?**

Under the Cross-Origin Resource Sharing (CORS) standard, when a web application makes a cross-domain request that is not a "simple request" (such as sending custom headers like `Authorization`, using a content type like `application/json`, or using verbs like `PUT`, `PATCH`, or `DELETE`), the browser automatically halts the operation.

Before sending the actual payload, the browser dispatches an `OPTIONS` preflight request. This asks the destination server: *"Do you permit origin `https://client.com` to send a `DELETE` request with an `Authorization` header?"* The server responds with `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers`. If the server approves, the browser dispatches the actual request; if it rejects, the browser cancels the execution before the backend data is touched.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Mutating State in GET Endpoints
- **The Mistake:** Writing routes like `GET /api/users/delete?id=5` or `GET /api/reports/generate-and-email`.
- **Why It Happens:** Developers want an easy way to trigger an action via a simple browser address bar link or `<a href>` tag.
- **The Failure:** Search engine crawlers (Googlebot), social media unfurlers (Slack, Twitter link preview scrapers), antivirus scanners, and browser pre-fetch engines automatically crawl all discoverable `GET` links. Furthermore, `GET` requests lack CSRF token protection in standard frameworks because safe methods are assumed to be side-effect free. Your application will experience mysterious data deletions and phantom emails.
- **The Fix:** Always use `DELETE` or `POST` for actions that alter state.

---

### Trap 2: Treating PUT as PATCH (Accidental Data Wiping)
- **The Mistake:** Handling a `PUT /api/users/42` request with payload `{"email": "new@test.com"}` by running an `UPDATE users SET email = :email WHERE id = 42` without checking missing fields.
- **Why It Happens:** Developers assume `PUT` is just a synonym for "update".
- **The Failure:** If a strict client sends a `PUT` expecting full replacement semantics, or if a backend developer later switches to an ORM that does full entity replacement (`db.save(user)`), all fields omitted in the payload (e.g. `phone`, `bio`, `role`) are overwritten with `null` or default values, causing catastrophic data loss.
- **The Fix:** Use `PATCH` when accepting partial updates. Use `PUT` only when replacing the entire resource representation.

---

### Trap 3: Unbounded Retries on Raw POST Requests
- **The Mistake:** Configuring an HTTP client (like Axios or an API Gateway retry policy) to automatically retry failed requests on a 504 Gateway Timeout without checking the HTTP method:

```javascript
// DANGEROUS AXIOS INTERCEPTOR
axios.interceptors.response.use(null, async (error) => {
  if (error.response?.status === 504) {
    // Retrying a POST blindly causes duplicate charges!
    return axios.request(error.config);
  }
  return Promise.reject(error);
});
```

- **The Failure:** If the payment gateway took 5.1 seconds to charge the card and the reverse proxy timed out at 5.0 seconds, the payment succeeded on the origin. The client retries the raw `POST`, resulting in a double charge.
- **The Fix:** Only auto-retry idempotent methods (`GET`, `PUT`, `DELETE`). For `POST` retries, attach an `Idempotency-Key` header with a unique UUID that the server verifies before processing.

---

### Trap 4: Returning 405 Without the Mandatory `Allow` Header
- **The Mistake:** Returning a custom error response for unsupported methods without the `Allow` header:

```javascript
// NON-COMPLIANT
app.post('/api/read-only-data', (req, res) => {
  res.status(405).json({ error: 'POST not allowed' });
});
```

- **Why It Matters:** RFC 9110 Section 15.5.6 explicitly mandates: *"The server MUST generate an Allow header field in a 405 response containing a list of the target resource's currently supported methods."* Automated API clients and OpenAPI client generators rely on this header for dynamic capability discovery.
- **The Fix:** Always set `res.set('Allow', 'GET, HEAD, OPTIONS')` when returning a `405 Method Not Allowed`.

---

## 7. Compare With Related Concepts

### HTTP Methods vs. HTTP Status Codes vs. Route Paths
- **HTTP Method (The Verb / Intent):** Describes *what action* the client wants to perform (`GET`, `POST`, `DELETE`).
- **HTTP Status Code (The Result / Outcome):** Describes *what happened* after the server processed the request (`200 OK`, `201 Created`, `404 Not Found`).
- **Route Path (The Noun / Resource):** Identifies *which entity* is being targeted (`/api/v1/orders/123`). In clean REST design, nouns belong in the URL path, while verbs belong in the HTTP method header.

---

### PUT vs. PATCH vs. POST

| Dimension | `POST` | `PUT` | `PATCH` |
|---|---|---|---|
| **Primary Purpose** | Create subordinate resource / trigger action | Full replacement of resource at URI | Partial delta update to resource |
| **URI Target** | Parent collection (`/orders`) | Specific resource (`/orders/42`) | Specific resource (`/orders/42`) |
| **Payload Requirement** | New entity or command payload | Complete entity (all fields required) | Partial delta (only mutated fields) |
| **Missing Fields** | N/A (Creates new record) | Missing fields are cleared / reset | Missing fields remain untouched |
| **Idempotent?** | ❌ No ($f(f(x)) \neq f(x)$) | ✅ Yes ($f(f(x)) == f(x)$) | ⚠️ Conditionally (Depends on delta) |
| **Safe?** | ❌ No | ❌ No | ❌ No |
| **Standard Success** | `201 Created` + `Location` | `200 OK` or `204 No Content` | `200 OK` or `204 No Content` |

---

### Complete HTTP Method Comparison Matrix

| Method | Defined Role | Request Body? | Response Body? | Safe? | Idempotent? | Cacheable? | Standard Status Codes |
|---|---|---|---|---|---|---|---|
| **`GET`** | Retrieve resource | Optional (No defined semantics) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | `200 OK`, `304 Not Modified`, `404 Not Found` |
| **`HEAD`** | Retrieve headers only | Optional (No defined semantics) | ❌ No (Must be empty) | ✅ Yes | ✅ Yes | ✅ Yes | `200 OK`, `304 Not Modified`, `404 Not Found` |
| **`OPTIONS`**| Discover allowed methods / CORS | Optional | Optional | ✅ Yes | ✅ Yes | ❌ No | `204 No Content`, `200 OK` |
| **`POST`** | Create entity / Execute action | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ⚠️ Only with explicit cache headers | `201 Created`, `200 OK`, `202 Accepted`, `204 No Content` |
| **`PUT`** | Full resource replacement | ✅ Yes | Optional | ❌ No | ✅ Yes | ❌ No | `200 OK`, `204 No Content`, `201 Created` |
| **`PATCH`** | Partial resource update | ✅ Yes | Optional | ❌ No | ⚠️ Conditional | ❌ No | `200 OK`, `204 No Content` |
| **`DELETE`** | Remove resource | Optional | Optional | ❌ No | ✅ Yes | ❌ No | `204 No Content`, `200 OK`, `202 Accepted`, `404 Not Found` |
| **`CONNECT`**| Establish proxy tunnel | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | `200 OK` (Tunnel established) |
| **`TRACE`** | Diagnostic loop-back | ❌ No | ✅ Echoed request | ✅ Yes | ✅ Yes | ❌ No | `200 OK` |

---

## 8. 🧠 The Memory Hook

> **Safe** means *look, don't touch*—server state never changes (`GET`, `HEAD`, `OPTIONS`).  
> **Idempotent** means *repeat without fear*—running it once or a hundred times leaves the exact same server state (`GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`).  
> **POST** is neither—every click drops a brand-new coin into the slot.
