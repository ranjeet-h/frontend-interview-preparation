# HTTP Cache Headers: Directives, Freshness Lifecycles, and Validation Mechanics

## 1. Why This Exists — The Problem First

Imagine you push a critical hotfix to production to repair a broken checkout button. Your continuous delivery pipeline deploys cleanly within two minutes. Yet for the next week, customer support receives thousands of tickets from angry users who still cannot complete their purchases. Why? Because your server served `app.js` with `Cache-Control: max-age=31536000` (one year) and no content hash in the filename. The browsers of your existing users see that the local file is "fresh" for another 364 days, so they never make a network request to your server. Your only options are waiting a full year or begging millions of users to manually clear their browser cache.

Now imagine the inverse disaster: an e-commerce backend returns `/api/account/billing` containing a user's home address, order history, and masked credit card numbers. A developer carelessly adds `Cache-Control: public, max-age=300` to speed up the page. An intermediate corporate forward proxy or a public edge CDN happily caches that response for the generic URL. Five seconds later, another customer on the same office network visits their billing page, hits the proxy cache, and sees the first customer's full identity and payment details.

Without HTTP cache headers, the web faces two extremes: either every single page load re-downloads megabytes of unchanged JavaScript, CSS, and images—crushing servers and draining mobile batteries—or intermediary caches store dynamic and sensitive user data blindly, leading to devastating security breaches and zombie application bugs. Cache headers exist to give servers precise, granular control over where data is stored, how long it remains fresh, and how clients verify whether it has changed.

## 2. The Analogy — Make It Obvious

Think of HTTP caching as managing documents between your personal desk drawer, the hallway bulletin board, and the central company archives.

```txt
[Client Browser]             [Edge CDN / Proxy]             [Origin Server]
 Personal Desk Drawer   →    Hallway Bulletin Board   →    Central Archives
 (Private Cache)             (Public / Shared Cache)       (Source of Truth)
```

- **The Personal Desk Drawer (Private Browser Cache):** This is your local, isolated workspace. Only you have access to it. It is the fastest place to grab a document (0ms latency), and it is safe to store private notes here.
- **The Hallway Bulletin Board (Shared / CDN Cache):** This is an intermediary location that anyone walking down the corridor can see and read. Storing a public company handbook here saves everyone a trip to the archives. But if you pin your private payroll slip here, the entire office will see it.
- **The Central Archives (Origin Server):** This is the authoritative building across town. It holds the original master records. Visiting the archives takes time and effort (network round-trip time, database lookups, server CPU).

Here is how the cache directives map to this office workflow:

- `public`: "Pin this document to the hallway bulletin board; anyone is allowed to read and reuse this copy."
- `private`: "Keep this document in your personal desk drawer only. Do not pin it to the hallway board."
- `no-store`: "Classified information. Read it once and shred it immediately. Do not put it in your drawer, and do not leave it on the bulletin board."
- `no-cache`: "You may keep a copy in your desk drawer, but every single time you need to use it, you must call the archivist first to verify that no amendments were made."
- `max-age=300`: "This document is guaranteed accurate for 5 minutes. During those 5 minutes, read your desk copy without calling the archivist."
- `s-maxage=3600`: "The hallway bulletin board can hold onto this for 1 hour, even if individual employees refresh their desks more frequently."
- `immutable`: "This document has a permanent version number stamped on it (`policy-v2.pdf`). Its text will never change. Even if your boss tells you to double-check everything, do not call the archives."
- `ETag` (Entity Tag): A unique digital wax seal stamped on the document. When your copy expires, you don't ask the archivist to re-send all 500 pages; you just radio over the seal code: "I have seal `#x9f2`. Is that still the latest?" (`If-None-Match`). If the archivist confirms the seal hasn't changed, they reply with two words: "Still good!" (`304 Not Modified`).

## 3. How It Actually Works — The Full Explanation

HTTP caching operates across a three-stage lifecycle: **Storage Rules**, **Freshness Checks**, and **Validation**.

```txt
Incoming Request for Resource
           │
           ▼
 Is resource in cache? ────► NO ────► Fetch from Origin Server (HTTP 200)
           │
          YES
           │
           ▼
 Is it within max-age? ────► YES ───► Serve from Cache (0ms, Memory/Disk)
           │
          NO (Stale or no-cache)
           │
           ▼
 Send Conditional Request
 (If-None-Match: ETag / If-Modified-Since: Date)
           │
     ┌─────┴─────────────────────────┐
     ▼                               ▼
Server ETag matches?          Server ETag differs?
     ▼                               ▼
HTTP 304 Not Modified          HTTP 200 OK (Full Payload)
(Serve cached copy,            (Update cache,
 reset freshness clock)         serve fresh payload)
```

### 1. Freshness and Expiration

When a client or proxy receives a response, it calculates how long the content can be served directly from memory or disk without speaking to the server.

- `Cache-Control: max-age=<seconds>`: Defines the freshness lifetime relative to the time of the request. For example, `max-age=3600` means the cache can serve this response for the next hour.
- `Cache-Control: s-maxage=<seconds>`: "Shared max-age". Overrides `max-age` specifically for public/shared caches (like Cloudflare, Fastly, or corporate reverse proxies), while client browsers continue honoring standard `max-age`.
- `Expires: <HTTP-Date>`: The legacy HTTP/1.0 header specifying an absolute expiration date (e.g., `Expires: Wed, 26 Aug 2026 12:00:00 GMT`). If a response contains both `max-age` and `Expires`, modern clients completely ignore `Expires`. Relying on `Expires` is dangerous because client clocks can be out of sync with server clocks.
- `Age: <seconds>`: A response header added by intermediary caches (like CDNs) indicating how many seconds the object has already spent sitting inside the edge cache.

### 2. Validation and Conditional Requests

When an asset's `max-age` expires, or when an asset is tagged with `no-cache`, the cached copy becomes **stale**. Instead of downloading the entire file from scratch, the client performs a **conditional request** to see if the content actually changed.

There are two validation mechanisms:

#### A. Hash-Based Validation (ETag & If-None-Match)
The server computes a fingerprint (often a cryptographic hash like MD5/SHA-1 or a combination of file size and timestamp) and returns it in the `ETag` header:
```http
HTTP/1.1 200 OK
ETag: "33a64df551425fcc55e4d42a148795d9f25f89d4"
Cache-Control: no-cache
```
When the client needs that resource again, it sends the stored hash back inside an `If-None-Match` request header:
```http
GET /api/products HTTP/1.1
If-None-Match: "33a64df551425fcc55e4d42a148795d9f25f89d4"
```
If the server calculates the hash of the current data and it matches `If-None-Match`, it skips generating or sending the response body and replies immediately with `304 Not Modified`:
```http
HTTP/1.1 304 Not Modified
ETag: "33a64df551425fcc55e4d42a148795d9f25f89d4"
```
The browser uses its locally cached body. Bandwidth drops from megabytes to a few hundred bytes of headers.

**Strong vs Weak ETags:**
- Strong ETag (`"xyz123"`): Guarantees byte-for-byte identity. If even one byte or header changes, the ETag changes.
- Weak ETag (`W/"xyz123"`): Guarantees semantic equivalence. The visual content or JSON data is identical, but the byte encoding or whitespace may differ (common when on-the-fly Gzip or Brotli compression is applied).

#### B. Time-Based Validation (Last-Modified & If-Modified-Since)
The server returns the file's last modified timestamp via `Last-Modified: Wed, 20 Aug 2026 08:30:00 GMT`. On revalidation, the client sends `If-Modified-Since: Wed, 20 Aug 2026 08:30:00 GMT`. If the file on disk hasn't been touched since that second, the server returns `304 Not Modified`. ETags are strictly superior because timestamps have 1-second resolution (missing sub-second changes) and file system touch events can alter timestamps without changing content.

### 3. Cache Key Modifiers: The Vary Header

Caches index stored responses by a **Cache Key**, which defaults to the HTTP method and URL (e.g., `GET https://example.com/api/data`).

What happens if mobile devices receive mobile-optimized HTML while desktop users receive full desktop HTML from the same URL? Or what if modern browsers request Brotli compression (`Accept-Encoding: br`) while legacy tools request uncompressed text?

If the server doesn't use the `Vary` header, the first user who requests the URL populates the cache for everyone else. A desktop user might get mobile markup, or a client lacking Brotli support might get served compressed binary garbage.

The `Vary` header instructs caches: "Do not reuse this response unless the incoming request headers match these exact header values."
```http
Vary: Accept-Encoding, Accept-Language, Authorization
```
This tells the CDN to maintain separate cache bins per encoding, language, and auth state.

### 4. Modern Resilience Directives

- `immutable`: Tells modern browsers that this asset's bytes will NEVER change during its `max-age`. When a user presses F5 or Cmd+R (refresh), standard browser behavior is to send conditional `304` requests for every image and script. `immutable` tells the browser to skip revalidation entirely even on page reload.
- `stale-while-revalidate=<seconds>`: Solves the latency penalty of expired caches. If an asset is stale, the cache serves the stale copy to the user immediately (instant 0ms response) while quietly triggering an asynchronous background fetch to the origin server to refresh the cache for subsequent visits.
- `stale-if-error=<seconds>`: Provides high availability. If the cache copy is stale and the origin server suddenly throws a 500/502/503 error or times out, the cache continues serving the stale response instead of displaying a broken error screen to the user.

### 5. The Two Golden Rules of Production Web Caching

Modern web architecture boils down to two distinct patterns:

```txt
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. HASHED / FINGERPRINTED STATIC ASSETS (JS, CSS, Images, Fonts)       │
│    URL: /assets/main.a8f9c1.js                                          │
│    Header: Cache-Control: public, max-age=31536000, immutable           │
│    Rule: Content changes -> Hash changes -> New URL. Cache forever.     │
├─────────────────────────────────────────────────────────────────────────┤
│ 2. DYNAMIC ENTRYPOINTS & SENSITIVE DATA (HTML, User APIs)               │
│    URL: /index.html                                                     │
│    Header: Cache-Control: no-cache + ETag                               │
│    Rule: Always revalidate before serving to pick up new hashed assets. │
│                                                                         │
│    URL: /api/me /api/checkout                                           │
│    Header: Cache-Control: private, no-store                             │
│    Rule: Never allow shared or disk caching of personalized data.       │
└─────────────────────────────────────────────────────────────────────────┘
```

## 4. Real Code — See It Working

Here is a complete, runnable Node.js / Express application demonstrating production-grade cache header handling for fingerprinted static assets, dynamic HTML with custom ETag validation and 304 handling, and private API routes.

```javascript
// server.js - Production HTTP Caching Implementation
const express = require('express');
const crypto = require('crypto');

const app = express();

// Helper: Generate a strong ETag from string or buffer content
function generateETag(body) {
  return `"${crypto.createHash('sha1').update(body, 'utf8').digest('hex')}"`;
}

// --------------------------------------------------------------------------
// 1. Hashed Static Assets (Bundler outputs: main.7f8b9a.js, vendor.4c1d2e.css)
// --------------------------------------------------------------------------
app.get('/static/:assetName', (req, res) => {
  const { assetName } = req.params;

  // Verify that the asset name contains a build hash (e.g. main.a8f9c1.js)
  const isFingerprinted = /\.[a-f0-9]{8,}\.(js|css|png|woff2)$/i.test(assetName);

  if (isFingerprinted) {
    // 1 Year TTL + public CDN sharing + immutable (no revalidation on page reload)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    // Unhashed fallback assets must revalidate frequently
    res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
  }

  res.setHeader('Content-Type', 'application/javascript');
  res.send(`console.log("Loaded static asset: ${assetName}");`);
});

// --------------------------------------------------------------------------
// 2. Dynamic Entrypoint (index.html) with ETag Revalidation (HTTP 304)
// --------------------------------------------------------------------------
app.get('/', (req, res) => {
  // Simulating an HTML document referencing the latest hashed asset bundles
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Fast Application</title>
        <link rel="stylesheet" href="/static/bundle.8f2d1e.css" />
      </head>
      <body>
        <div id="root">Hello Caching World</div>
        <script src="/static/app.a8f9c1.js"></script>
      </body>
    </html>
  `.trim();

  const etag = generateETag(htmlContent);

  // Set headers: Cache allowed, but client MUST revalidate with origin every time
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('ETag', etag);
  res.setHeader('Vary', 'Accept-Encoding');

  // Check conditional request header sent by the browser
  const clientETag = req.headers['if-none-match'];

  if (clientETag === etag) {
    // Content has not changed! Return 304 with no body to save bandwidth
    return res.status(304).end();
  }

  // Content changed or first-time load: return full 200 payload
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(htmlContent);
});

// --------------------------------------------------------------------------
// 3. Semi-Dynamic API with stale-while-revalidate & CDN control (s-maxage)
// --------------------------------------------------------------------------
app.get('/api/public-feed', (req, res) => {
  const feedData = JSON.stringify({
    items: ['Breaking News 1', 'Breaking News 2'],
    generatedAt: new Date().toISOString()
  });

  const etag = generateETag(feedData);

  // Browser caches for 10s; CDN edges cache for 60s; serve stale for up to 5 mins while fetching fresh
  res.setHeader(
    'Cache-Control',
    'public, max-age=10, s-maxage=60, stale-while-revalidate=300, stale-if-error=86400'
  );
  res.setHeader('ETag', etag);
  res.setHeader('Vary', 'Accept-Encoding');

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(feedData);
});

// --------------------------------------------------------------------------
// 4. Sensitive User Account API (Zero Persistence, Strict Privacy)
// --------------------------------------------------------------------------
app.get('/api/user/billing', (req, res) => {
  // Never write to disk or cache storage in browsers, proxies, or CDNs
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache'); // HTTP/1.0 backward compatibility
  res.setHeader('Expires', '0');       // Immediate expiration fallback

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    userId: 'usr_8821',
    creditCardMasked: '****-****-****-4242',
    balanceDue: '$120.00'
  });
});

// --------------------------------------------------------------------------
// Verification Test
// --------------------------------------------------------------------------
if (require.main === module) {
  const server = app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
    console.log('Test with:');
    console.log('  curl -i http://localhost:3000/');
    console.log('  curl -i -H \'If-None-Match: "<ETag_from_above>"\' http://localhost:3000/');
    console.log('  curl -i http://localhost:3000/api/user/billing');
    server.close(); // Clean shutdown for testing
  });
}

module.exports = app;
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the exact difference between `no-cache` and `no-store`?**

This is one of the most commonly failed questions in senior frontend and backend interviews.

`no-cache` does **not** mean "do not cache." It means the browser or CDN **is allowed to cache the response**, but it **must revalidate with the origin server** using an `ETag` or `Last-Modified` header before using the cached copy to satisfy any request. If the server returns `304 Not Modified`, the cached copy is served.

`no-store` means **do not store this response under any circumstances**. Caches must not write the payload to local disk, temporary memory, or shared proxy storage. Every single request must trigger a full round-trip to origin and download the complete response body. `no-store` is mandatory for sensitive personal, financial, and authentication endpoints.

**Q: How does conditional validation work with `ETag` and `If-None-Match`, and what is the difference between strong and weak ETags?**

When a client first requests a resource, the server computes a fingerprint of the payload and sends it back in the `ETag` response header. The client caches both the payload and the `ETag`.

When the resource's freshness window expires, the client issues a conditional request by attaching the stored fingerprint inside the `If-None-Match` header. The server inspects this header against the current resource state:
- If the content has not changed, the server sends a lightweight `304 Not Modified` header-only response without a body. The client re-uses its local cached copy and resets its freshness timer.
- If the content has changed, the server returns a standard `200 OK` with the new body and new `ETag`.

A **strong ETag** (e.g. `ETag: "12345"`) guarantees that the resource is identical byte-for-byte at the binary level. A **weak ETag** (prefixed with `W/`, e.g. `ETag: W/"12345"`) guarantees semantic equivalence—the meaningful data or visual display is identical, but byte-level representations (like gzip vs brotli compression or header whitespace) may differ.

**Q: What is the `Vary` header, why is it critical for CDNs, and what disastrous bug happens if you omit `Vary: Accept-Encoding`?**

The `Vary` header tells intermediary caches which incoming request headers must be included as part of the cache lookup key alongside the URL.

If a server dynamically compresses responses into Brotli or Gzip based on the client's `Accept-Encoding` header, omitting `Vary: Accept-Encoding` creates a serious bug:
1. A modern browser requests `/app.js` with `Accept-Encoding: br`.
2. The server responds with compressed Brotli binary data and caches it at the CDN edge under the key `/app.js`.
3. An older client or crawler requests `/app.js` with no compression support.
4. The CDN matches the key `/app.js`, finds the cached Brotli response, and serves the raw compressed binary stream to the old client. The client tries to parse the compressed binary as plain ASCII JavaScript and crashes with a syntax error.

Adding `Vary: Accept-Encoding` forces the CDN to store separate cached entries for `br`, `gzip`, and uncompressed variants.

**Q: What is the difference between `max-age` and `s-maxage`?**

`max-age` applies universally to all caches, including private browser caches and intermediate shared caches.

`s-maxage` ("shared max-age") explicitly overrides `max-age` for public, shared intermediary caches (such as CDNs, Cloudflare edges, and corporate reverse proxies) while leaving private browser cache behavior untouched.

This allows powerful architectural tiering: you can set `Cache-Control: public, max-age=60, s-maxage=86400`. Client browsers will check back with the network every 60 seconds, but your CDN edge will hold the cached copy for 24 hours. If you update data, you can issue an instant API purge to your CDN without worrying about browsers holding stale data for 24 hours.

**Q: How do `stale-while-revalidate` and `stale-if-error` improve performance and uptime?**

`stale-while-revalidate=<seconds>` instructs the cache to immediately return a stale cached response if one is available, eliminating user-facing network latency (0ms TTFB). Concurrently, the cache fires an asynchronous background HTTP request to the origin server to fetch the updated response and refresh the cache for the next user. It gives you the speed of a cache hit with the freshness of live data.

`stale-if-error=<seconds>` instructs the cache to continue serving stale cached content if the origin server responds with a 500, 502, 503, or 504 status code or suffers a network timeout. This prevents backend crashes or database connection pool exhaustions from cascading into user-facing outage screens.

**Q: Why should your `index.html` file never have a 1-year `max-age`? What is the ideal caching strategy for Single Page Applications (SPAs)?**

If `index.html` is cached for a year, users will never request the HTML from the server again until that year passes. When you deploy a new version of your SPA with new JavaScript chunk hashes (`app.b92c1d.js`), existing users will continue executing the old `index.html` pointing to old script URLs (`app.a8f9c1.js`). If your CI/CD deletes old build assets from the storage bucket, users experience blank screens and 404 script loading errors.

The ideal caching strategy for an SPA is:
- **`index.html`:** `Cache-Control: no-cache` with an `ETag`. The browser always asks the server if `index.html` has changed. If not, it receives an instant `304 Not Modified`. If a deployment occurred, it receives the new HTML immediately.
- **Hashed Assets (`*.a8f9c1.js`, `*.4c1d2e.css`, images):** `Cache-Control: public, max-age=31536000, immutable`. Because the hash changes whenever the code changes, these assets can be safely cached forever.

## 6. The Traps — What Goes Wrong

### Trap 1: Caching `index.html` with a Long `max-age`
- **The Mistake:** Configuring a web server (like Nginx or S3/CloudFront) with a wildcard rule `Cache-Control: public, max-age=86400` applied to all files, including `index.html`.
- **Why It Fails:** The browser caches the entrypoint. When a new frontend deployment removes old hashed chunks, existing visitors continue loading the cached HTML, try to download deleted asset chunks, and get stranded with broken SPAs.
- **The Fix:** Set explicit server rules: `no-cache` for HTML documents, long `max-age` with `immutable` only for fingerprinted assets.

### Trap 2: Using `public` on Personalized or Authenticated Routes
- **The Mistake:** Returning `Cache-Control: public, max-age=300` on an API route like `/api/user/profile` or `/dashboard`.
- **Why It Fails:** Shared CDN edges and corporate forward proxies cache the response keyed solely by the URL. The next user hitting the proxy is served the first user's cached profile, leaking personally identifiable information (PII) and auth tokens.
- **The Fix:** Authenticated or personalized endpoints must always specify `private, no-store`.

### Trap 3: Confusing `no-cache` with `no-store` on Sensitive Data
- **The Mistake:** Using `Cache-Control: no-cache` on a credit card payment confirmation page, believing it prevents storage.
- **Why It Fails:** `no-cache` saves the page to disk and revalidates on next navigation. If a user logs out and clicks the browser's "Back" button, the browser may read the cached confirmation page from disk or memory without revalidating.
- **The Fix:** Use `Cache-Control: no-store` whenever data must never persist on client or proxy storage.

### Trap 4: Missing `Vary: Accept-Encoding` on Dynamically Compressed Content
- **The Mistake:** Enabling Gzip/Brotli compression in an API gateway without sending the `Vary: Accept-Encoding` header.
- **Why It Fails:** A proxy caches the Brotli-compressed binary stream under the URL. A client lacking Brotli support requests the same URL, receives the compressed stream, and fails to parse the response.
- **The Fix:** Always attach `Vary: Accept-Encoding` when compression depends on request headers.

### Trap 5: Omitting `immutable` on Hashed Static Assets
- **The Mistake:** Serving fingerprinted assets with `Cache-Control: public, max-age=31536000` but omitting `immutable`.
- **Why It Fails:** When users press Cmd+R / F5 (reload), browsers by default send conditional requests (`If-None-Match`) for every single script and image on the page. On a page with 80 assets, this generates 80 round-trips to the server just to receive 80 `304 Not Modified` responses.
- **The Fix:** Add `immutable` so browsers skip network round-trips entirely on page refresh.

### Trap 6: Relying on `Expires` Instead of `Cache-Control: max-age`
- **The Mistake:** Setting `Expires: Thu, 01 Jan 2027 00:00:00 GMT` without `Cache-Control`.
- **Why It Fails:** `Expires` relies on absolute timestamps. If the client device's clock is set incorrectly (skewed by a few hours or years), the client may consider fresh responses instantly expired or expired responses perpetually fresh.
- **The Fix:** Use `Cache-Control: max-age` which calculates freshness relative to the time the response was received.

## 7. Compare With Related Concepts

| Concept | Primary Location | Purpose | Invalidation Mechanism |
| :--- | :--- | :--- | :--- |
| **HTTP Caching (`Cache-Control`)** | Browser, CDNs, Forward/Reverse Proxies | Eliminates network round-trips and reduces origin server load for HTTP requests. | Content-addressable URLs (hashes), `max-age` expiration, and `ETag` conditional revalidation. |
| **Server-Side Data Caching (Redis/Memcached)** | Internal Backend Infrastructure | Caches database query results, computed sessions, and heavy API computations in RAM. | Key TTL expiration, explicit cache purges/mutations (`cache.del(key)`), LRU eviction. |
| **Service Worker Cache (`CacheStorage` API)** | Client Browser (JavaScript Layer) | Programmatic offline asset and request interception controlled by client-side scripts. | Manual JavaScript lifecycle management (`caches.open()`, `caches.delete()`). |
| **ETag Validation** | Origin Server & Client HTTP Stack | Cryptographic validation of content equivalence returning `304 Not Modified`. | Generated from content hashing or file modification metadata on the server. |

### Key Differences:
- **HTTP Cache vs Redis:** HTTP caching prevents the request from ever reaching your backend application servers. Redis speeds up processing once the request has already reached your backend servers.
- **`ETag` vs `Last-Modified`:** `ETag` is hash-based and resilient to sub-second edits and clock drift; `Last-Modified` is timestamp-based and susceptible to 1-second resolution limits and file touch false positives.
- **`no-cache` vs `no-store`:** `no-cache` stores the response but requires an `ETag` round-trip before reuse; `no-store` forbids any persistence on disk or memory.

## 8. 🧠 The Memory Hook

> **Hash your assets and cache them forever (`immutable`). Never cache your `index.html` (`no-cache`). Never store private user data (`no-store`).**
>
> Remember the kitchen rule: **`no-cache`** means *"you can keep leftovers in the fridge, but smell them before eating"*; **`no-store`** means *"toxic waste—do not put it in the fridge at all."*
