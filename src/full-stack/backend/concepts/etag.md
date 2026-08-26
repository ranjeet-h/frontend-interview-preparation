# ETag (Entity Tag): Conditional Validation and Optimistic Concurrency Control

## 1. Why This Exists — The Problem First

Imagine running an e-commerce platform where a mobile app fetches a 2.5 MB product catalog and configuration payload every time a user opens a screen. Over a million daily users, that single endpoint transfers petabytes of redundant data every month, draining mobile batteries, driving up cloud bandwidth bills, and stalling screen render times—even when not a single product price changed for three weeks. If you slap a blind `Cache-Control: max-age=86400` on it, you eliminate the bandwidth waste, but you create a new emergency: when a pricing error or critical flash sale occurs, your users are stuck looking at stale data for 24 hours with no way to invalidate their local caches.

Now look at the opposite disaster: the "Lost Update" concurrency bug. Two store administrators, Alice and Bob, open the edit screen for product #402 at 10:00:00 AM. Alice changes the description and clicks save at 10:00:05 AM. Bob changes the price and clicks save at 10:00:08 AM. Because Bob's form was rendered with the old description, Bob's save silently overwrites Alice's description with the stale original value. Alice's work vanishes without an error, without a conflict warning, and with zero audit trace in the database.

HTTP Entity Tags (ETags) exist to solve both problems with a single architectural mechanism: giving every version of a resource a unique fingerprint token that clients and servers use to validate freshness and prevent concurrent write collisions.

## 2. The Analogy — Make It Obvious

Think of an ETag like a wax seal stamped with an edition hash on an archival museum document.

You are a remote researcher holding a 500-page historical manuscript labeled with wax seal `#X9K2`. The central museum in London holds the master copy.

**Scenario 1: Bandwidth Optimization (Conditional Validation)**
Instead of ordering the museum to ship you all 500 pages in a heavy freight crate every morning, you send a quick postcard: *"I hold copy `#X9K2`. Has the master document changed?"* If the archivist checks the master and sees the seal is still `#X9K2`, they mail back a one-line index card: *"Unchanged. Keep using your copy."* You spent pennies on a postcard instead of hundreds of dollars on freight shipping, and you got your answer in seconds.

**Scenario 2: Preventing Lost Edits (Concurrency Control)**
You decide to submit a scholarly correction to page 42. You mail your page edit inside an envelope stamped: *"Apply this revision only if the master is still on version `#X9K2`."* If another researcher submitted a correction five minutes before you, the archivist already updated the master seal to `#M7B4`. When your letter arrives, the archivist rejects it on the spot: *"Conflict! The document has moved to `#M7B4` since you drafted this edit. Review the latest copy before resubmitting."* Alice's work is protected, and Bob is forced to merge rather than overwrite.

## 3. How It Actually Works — The Full Explanation

An ETag is an HTTP response header returned by an origin server or reverse proxy containing an arbitrary quoted string (e.g., `ETag: "686897696a7c7647"` or `ETag: W/"prod-402-v14"`). This string acts as an opaque version identifier for the specific state and representation of that resource.

ETags operate across two core HTTP workflows: conditional GET requests for cache validation, and conditional mutation requests (PUT/PATCH/DELETE) for optimistic concurrency control.

**Workflow 1: Conditional GET Requests (If-None-Match and 304 Not Modified)**

When a client requests a resource for the first time:
1. The client sends `GET /api/products/402`.
2. The server generates the JSON payload, computes an ETag (such as a hash of the content or a database row version), and sends a `200 OK` response with headers:
   `ETag: "v14"`
   `Cache-Control: no-cache`
3. The browser or client caches the body alongside the ETag `"v14"`.
4. On the next visit, the client does not blindly re-download the data. It sends a conditional request containing the `If-None-Match` header:
   `GET /api/products/402`
   `If-None-Match: "v14"`
5. The server calculates or looks up the current ETag for product #402. If it is still `"v14"`, the server immediately terminates the response and returns:
   `HTTP/1.1 304 Not Modified`
   `ETag: "v14"`
   The body payload is exactly 0 bytes. The client's HTTP stack intercepts the 304 and serves the cached body to the application instantly.
6. If the product was modified in the database, the server generates `ETag: "v15"` and returns `200 OK` with the new body.

**Workflow 2: Optimistic Concurrency Control (If-Match and 412 Precondition Failed)**

When multiple clients modify shared state:
1. Client A fetches `GET /api/products/402` and receives `ETag: "v14"`.
2. Client B fetches `GET /api/products/402` and also receives `ETag: "v14"`.
3. Client A edits the title and sends a mutation request with the `If-Match` precondition header:
   `PUT /api/products/402`
   `If-Match: "v14"`
   `{"title": "New Title", "price": 99.99}`
4. The server verifies that the database record is currently on version `"v14"`. Because it matches, the update executes, the version increments to `"v15"`, and the server returns `200 OK` with `ETag: "v15"`.
5. A moment later, Client B tries to save their price edit with their stale snapshot:
   `PUT /api/products/402`
   `If-Match: "v14"`
   `{"title": "Old Title", "price": 79.99}`
6. The server compares the request's `If-Match: "v14"` with the current database state (`"v15"`). Because they do not match, the server aborts the transaction before touching the database and returns:
   `HTTP/1.1 412 Precondition Failed`
   `{"error": "Resource has been modified. Please refetch before saving."}`
7. Client B's application catches the 412 status code, informs the user of the conflict, and re-fetches the current state without destroying Client A's title change.

**Strong vs Weak ETags**

HTTP/1.1 defines two validation categories for entity tags:

- **Strong ETags** (e.g., `ETag: "33a64df5514aa0"`): Guarantees byte-for-byte identical representation across all headers and content. If a single whitespace byte changes or if the server compresses the file with gzip instead of brotli, the strong ETag changes. Strong ETags are mandatory for byte-range requests (`Range: bytes=0-1024`), where a partial download requires exact binary alignment.
- **Weak ETags** (e.g., `ETag: W/"33a64df5514aa0"`): Prefixed with `W/`. Guarantees semantic equivalence. The underlying data model and meaning are identical, even if the byte presentation differs due to whitespace normalization, JSON key ordering, or compression algorithms (gzip vs uncompressed). Weak ETags are the standard choice for dynamic REST APIs and microservices.

**ETag Generation Strategies**

1. **Content Hashing (MD5/SHA-1/Murmur3)**: The server runs a cryptographic or fast hashing algorithm over the serialized response buffer. This is standard in web frameworks (like Express or Rails), but requires the server to build the full response in memory first. It saves network egress bandwidth, but does not save server CPU or database query time.
2. **Database Versioning / Sequence Numbers**: Each database row has a `version` integer (e.g., `version: 14`) or UUID updated on every write. The ETag is constructed directly as `W/"v14"`. This allows ultra-fast conditional checks: the server can run a lightweight query for just the `version` column, returning a 304 without ever querying, assembling, or serializing the full object tree.
3. **High-Resolution Timestamp + Resource ID**: Combining the entity ID with microsecond-level `updated_at` timestamps (e.g., `W/"402-1718902800123"`).

## 4. Real Code — See It Working

Here is a production-grade Node.js and Express API demonstrating both automated 304 conditional revalidation with Weak ETags and optimistic concurrency locking with `If-Match` and `412 Precondition Failed`.

```javascript
import express from 'express';

const app = express();
app.use(express.json());

// In-memory data store with explicit version tracking
const productDatabase = new Map([
  [
    '402',
    {
      id: '402',
      title: 'Noise-Canceling Studio Headphones',
      price: 299.99,
      stock: 45,
      version: 1,
      updatedAt: '2026-08-25T10:00:00.000Z'
    }
  ]
]);

// Helper to generate a semantic Weak ETag from database entity metadata
function buildResourceETag(product) {
  // Using resource ID and monotonic version integer avoids hashing large payloads
  return `W/"prod-${product.id}-v${product.version}"`;
}

// 1. GET /api/products/:id — Conditional Validation (If-None-Match -> 304)
app.get('/api/products/:id', (req, res) => {
  const product = productDatabase.get(req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const currentETag = buildResourceETag(product);

  // Set caching and ETag headers
  res.setHeader('ETag', currentETag);
  // no-cache forces the client/proxy to revalidate with the server before using cached copy
  res.setHeader('Cache-Control', 'no-cache');

  const ifNoneMatch = req.headers['if-none-match'];

  // Check if client already holds this exact version
  if (ifNoneMatch && (ifNoneMatch === currentETag || ifNoneMatch === '*')) {
    // 304 Not Modified sends ZERO body payload across the network
    return res.status(304).end();
  }

  // If stale or first request, send full 200 payload
  return res.status(200).json(product);
});

// 2. PUT /api/products/:id — Optimistic Concurrency Control (If-Match -> 412)
app.put('/api/products/:id', (req, res) => {
  const product = productDatabase.get(req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const ifMatch = req.headers['if-match'];

  // Enforce precondition: mutations require explicit version snapshot
  if (!ifMatch) {
    return res.status(428).json({
      error: 'Precondition Required: Missing If-Match header with resource ETag'
    });
  }

  const currentETag = buildResourceETag(product);

  // If another transaction incremented the version, reject the stale write
  if (ifMatch !== currentETag && ifMatch !== '*') {
    return res.status(412).json({
      error: 'Precondition Failed: Resource has been updated by another client',
      currentVersion: currentETag
    });
  }

  // Safe to apply update: update fields and increment version counter
  const { title, price, stock } = req.body;
  if (title !== undefined) product.title = title;
  if (price !== undefined) product.price = price;
  if (stock !== undefined) product.stock = stock;

  product.version += 1;
  product.updatedAt = new Date().toISOString();

  const newETag = buildResourceETag(product);
  res.setHeader('ETag', newETag);

  return res.status(200).json(product);
});

// Example Client Test Flows (Simulated Requests)
// Step 1: Initial Fetch -> GET /api/products/402 returns 200 OK + ETag: W/"prod-402-v1"
// Step 2: Revalidation -> GET /api/products/402 with If-None-Match: W/"prod-402-v1" returns 304 Not Modified
// Step 3: Alice updates -> PUT /api/products/402 with If-Match: W/"prod-402-v1" returns 200 OK + ETag: W/"prod-402-v2"
// Step 4: Bob updates -> PUT /api/products/402 with If-Match: W/"prod-402-v1" returns 412 Precondition Failed
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the fundamental difference between an ETag and Cache-Control max-age?**

`Cache-Control: max-age=N` is a time-based expiration model, whereas `ETag` is a representation-based validation model. With `max-age`, the client or CDN completely bypasses the origin server for `N` seconds; if data changes on second 5 of a 3600-second window, the client serves stale data for 59 minutes and 55 seconds with zero server contact. Once `max-age` expires, the client must discard the cache or perform a revalidation. ETags provide the revalidation mechanism: the client contacts the server with `If-None-Match`, allowing the server to confirm whether the content actually changed. If unchanged, the server returns `304 Not Modified`, preserving bandwidth while ensuring 100% data freshness. In production, they are used together: `Cache-Control: public, max-age=300, stale-while-revalidate=60` combined with an `ETag`.

**Q: What is the difference between a Strong ETag and a Weak ETag?**

A Strong ETag (formatted as `"hash"`) mandates that the response representation is byte-for-byte identical at the binary level. If the server enables gzip or brotli compression, changes header ordering, or tweaks character encoding, the strong ETag must change. Strong ETags are required for HTTP range requests (`Range: bytes=0-500`) where partial byte offsets must align across chunks. A Weak ETag (prefixed with `W/"hash"`) guarantees semantic equivalence—the logical entity attributes and values are identical, even if whitespace, field order, or wire compression methods differ. RESTful JSON APIs should almost always use Weak ETags.

**Q: How do ETags prevent the "Lost Update" problem in REST APIs?**

The lost update problem happens when two concurrent transactions read the same resource state, modify it locally, and push their changes back via `PUT` or `PATCH`, causing the later save to overwrite the earlier save blindly. ETags solve this via HTTP conditional mutations using the `If-Match` header. When Client A reads product #1 at `ETag: "v1"`, it sends its update with `If-Match: "v1"`. The server applies the update and bumps the version to `"v2"`. When Client B sends its update with `If-Match: "v1"`, the server compares the incoming header with the current database version (`"v2"`). Detecting a mismatch, the server aborts the write and immediately responds with `412 Precondition Failed`. This forces Client B to refresh, resolve the conflict, and resubmit without destroying Client A's data.

**Q: Why does default ETag generation in Express save network bandwidth but fail to reduce database and CPU load? How do you optimize it?**

By default, Express uses the `etag` middleware (or `res.send()`), which serializes the entire response object into a JSON string in memory, runs a CRC32 or MD5 hash over the buffer, attaches the ETag, and compares it against `req.headers['if-none-match']`. If they match, Express discards the body buffer and sends a 304. While this saves network egress bandwidth between the server and client, your backend still executed database queries, ORM hydration, and JSON stringification. To save database and CPU load, you must implement application-level ETag checks: store a `version` column or `updated_at` timestamp in the database or Redis, query only that column first, check `req.headers['if-none-match']`, and return `304` immediately before executing expensive queries or serializations.

**Q: Why is an ETag preferred over the Last-Modified and If-Modified-Since headers?**

`Last-Modified` timestamps have three fundamental architectural flaws that ETags resolve:
1. **Resolution limit**: HTTP `Last-Modified` dates use RFC 1123 timestamps, which have a granularity of exactly 1 second. In high-throughput distributed systems where multiple writes happen per millisecond, sub-second mutations share identical timestamps, causing `If-Modified-Since` to miss updates.
2. **False cache busts**: Background cron jobs, schema migrations, or operational scripts often touch record timestamps without altering any field data. `Last-Modified` forces full cache invalidation and re-downloads, whereas an ETag content hash recognizes the payload is unchanged.
3. **Distributed clock skew**: Across global server clusters with slightly unsynchronized system clocks (NTP drift), timestamp comparisons produce inconsistent validation results depending on which server handles the request. ETags are deterministic tokens unaffected by clock drift.

**Q: What HTTP status codes are directly tied to ETag flows?**

- `200 OK`: Returned on initial fetch or when the resource has changed, returning the full body and new `ETag`.
- `304 Not Modified`: Returned when a `GET`/`HEAD` request with `If-None-Match` matches the server's current ETag. Contains no response body.
- `412 Precondition Failed`: Returned when a `PUT`/`PATCH`/`DELETE` request with `If-Match` specifies an ETag that does not match the server's current version, signaling a write conflict.
- `428 Precondition Required`: Returned when the server requires optimistic locking headers (`If-Match`), but the client sent an unconditional write request.

## 6. The Traps — What Goes Wrong

**Trap 1: The Middleware Inefficiency Trap (Generating the Entire Payload to Return 304)**
The most common backend mistake is relying solely on framework middleware for dynamic endpoints. If an endpoint joins 12 tables and generates a 5 MB JSON payload, hashing the resulting buffer in Express or Django saves egress bytes over the wire, but your database CPU and memory remain saturated.
*The Fix:* Check entity version numbers or Redis cache keys early in your controller lifecycle. If `req.headers['if-none-match'] === \`W/"v\${record.version}"\`, return `res.status(304).end()` before initiating heavy queries or serialization.

**Trap 2: Including Timestamps or Non-Deterministic Values in the ETag**
Developers often generate ETags by concatenating a timestamp or random token: `ETag: \`item-\${id}-\${Date.now()}\``. Because `Date.now()` evaluates to a new value on every single request, the ETag never matches `If-None-Match`. The browser is forced to download a full `200 OK` response every time, completely breaking caching and multiplying server load.
*The Fix:* ETags must be purely deterministic. Base them strictly on content hashes, database sequence numbers, or database `updated_at` columns that only change when the data changes.

**Trap 3: CDN and Reverse Proxy Compression Mismatches**
When a client sends `Accept-Encoding: gzip`, an origin server might generate a Strong ETag `"abc123"`. If a CDN (such as Cloudflare or Nginx) compresses the response with brotli (`Accept-Encoding: br`) on the fly, the byte stream changes. A strict reverse proxy will either strip the ETag or convert it to a weak ETag (`W/"abc123"`). If your client application strictly looks for exact strong ETag matches or uses strong ETags for range requests across different CDNs, revalidation fails.
*The Fix:* Use Weak ETags (`W/"..."`) for all dynamically compressed API endpoints, and ensure reverse proxies are configured to preserve weak ETags during on-the-fly transcoding.

**Trap 4: Multi-Server Inodes and Non-Deterministic Serialization**
In Apache or older Nginx static configurations, default ETags were generated using the file's inode number on disk. In a load-balanced cluster of 4 servers, the identical file has 4 different inodes on 4 different hard drives. A user whose first request hit Server A received ETag A; their next request hit Server B with `If-None-Match: ETag A`, which Server B rejected with a full 200 re-download. A similar issue occurs in Node.js when serializing unordered JavaScript object keys into JSON.
*The Fix:* Ensure ETags depend solely on file content hashes or shared database versions, never machine-specific filesystem metadata or non-deterministic object serialization.

**Trap 5: Missing 428 Precondition Required on Mutations**
If you support `If-Match` for optimistic concurrency but allow clients to send unconditional `PUT /api/products/402` without the header, legacy clients or rogue scripts will bypass your concurrency checks and cause lost updates.
*The Fix:* Enforce the `428 Precondition Required` status code on all state-modifying endpoints that rely on optimistic concurrency control.

## 7. Compare With Related Concepts

**ETag vs Last-Modified / If-Modified-Since**
- *The Difference:* `Last-Modified` is a 1-second resolution timestamp of when the file was touched; `ETag` is a unique, opaque content/version fingerprint.
- *Rule of Thumb:* Use `ETag` for modern APIs and dynamic database resources; keep `Last-Modified` only as a secondary fallback for legacy HTTP/1.0 crawlers.

**ETag (If-None-Match) vs Cache-Control: max-age**
- *The Difference:* `max-age` eliminates network round trips by letting the client serve cached data without asking the server; `ETag` validates with the server to ensure zero-byte transfers when data has not changed.
- *Rule of Thumb:* Use `max-age` for static assets with content-hashed URLs (`bundle.a8f9.js`); use `ETag` with `Cache-Control: no-cache` for dynamic API data that must always be fresh.

**ETag (If-Match) vs Database Row-Level Pessimistic Locking (`SELECT FOR UPDATE`)**
- *The Difference:* `SELECT FOR UPDATE` physically locks database rows during an active transaction, blocking all other readers/writers and risking deadlocks; `ETag` is an optimistic concurrency check that locks nothing, validating versions at write time.
- *Rule of Thumb:* Use `ETag` with `If-Match` for user-facing REST APIs and web forms where human think time would hold database locks open indefinitely; use pessimistic locking inside tight, sub-millisecond database transactions for high-contention bank transfers or inventory checkout counters.

**ETag vs Content-MD5 / Digest Headers**
- *The Difference:* `Digest` / `Content-MD5` headers verify that a message payload was not corrupted in transit across the wire; `ETag` identifies the persistent revision state of a resource across separate requests.
- *Rule of Thumb:* Use `Digest` to prevent payload corruption during upload; use `ETag` to manage caching and revision control.

## 8. 🧠 The Memory Hook

An ETag is a digital fingerprint with a double life: send it with `If-None-Match` on a `GET` to save bandwidth with a `304 Not Modified`, or send it with `If-Match` on a `PUT` to prevent lost updates with a `412 Precondition Failed`.
