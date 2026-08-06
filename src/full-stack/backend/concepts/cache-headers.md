# Cache Headers

## Detailed explanation

Cache headers tell browsers, CDNs, and proxies how a response may be stored and reused.

## 1. One-line mental model

Cache headers are instructions for HTTP caches.

## 2. Problem it solves

Without cache headers, static files may reload too often or private API responses may be cached incorrectly.

## 3. Core idea

- `Cache-Control` defines storage and freshness rules.
- `ETag` validates whether content changed.
- `Last-Modified` supports time-based validation.
- Private data should use `private` or `no-store` as appropriate.
- Static assets can use long max-age with hashed filenames.

## 4. Visual / analogy

```txt
Label on food: store how long, recheck when stale.
```

## 5. Minimal example

```txt
Cache-Control: public, max-age=31536000, immutable
```

## 6. Real-world example

Hashed JS bundle cached for a year; user profile response uses `private, no-store`.

## 7. Common interview questions

#### What are cache headers?
- **The Engine Mechanism (Why it behaves this way):** Cache headers are HTTP response headers that instruct browsers, CDNs, and proxies how to store and reuse a response. The primary headers are `Cache-Control` (storage and freshness rules), `ETag` (content fingerprint for validation), `Last-Modified` (timestamp for validation), `Expires` (absolute expiry time, legacy), and `Vary` (which request headers affect the response). When a cached response is fresh (within max-age), the cache serves it without contacting the server. When stale, the cache may revalidate with the server using `If-None-Match` (ETag) or `If-Modified-Since` (Last-Modified), and the server returns 304 Not Modified if the content hasn't changed.
- **The Unforgettable Mental Model:** Cache headers are like **food storage labels**. "Use by" date (max-age), "check if still good" (ETag validation), "store in fridge not freezer" (private vs public).
- **The Trap:** Setting the same cache headers for all responses. Static assets, user profiles, and API responses have different caching needs — one-size-fits-all headers cause either stale data or unnecessary server load.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Cache headers are HTTP response headers that tell browsers, CDNs, and proxies how to store and reuse responses. Cache-Control defines storage rules and freshness lifetime. ETag provides a content fingerprint for validation. Last-Modified supports time-based validation. When a cached response is fresh, the cache serves it without contacting the server. When stale, the cache revalidates with the server, which returns 304 if unchanged. I set different cache headers for different response types — long max-age for static assets, no-store for sensitive data, and short max-age with validation for API responses."

#### Why do cache headers matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** Cache headers matter because they control the entire HTTP caching ecosystem — browsers, CDNs, reverse proxies, and intermediate caches all follow these headers. Proper cache headers reduce server load by serving cached responses, improve response times by eliminating round trips, save bandwidth by avoiding redundant data transfer, and ensure data freshness through validation. Without cache headers, every request hits the server, wasting resources on responses that haven't changed. With incorrect cache headers, stale data is served (too aggressive) or caching is disabled entirely (too conservative).
- **The Unforgettable Mental Model:** Cache headers are like **traffic signals for the caching ecosystem**. Green (cache it), yellow (revalidate first), red (don't cache). Without signals, chaos.
- **The Trap:** Not setting cache headers at all. Without explicit headers, browsers and proxies use their own heuristics, which may cache responses that shouldn't be cached or fail to cache responses that should be.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Cache headers matter because they control the entire HTTP caching ecosystem — browsers, CDNs, and proxies all follow them. Proper headers reduce server load, improve response times, and save bandwidth. Without headers, caches use their own heuristics, which may cache sensitive data or fail to cache static assets. I set explicit cache headers for every response type: long max-age with immutable for hashed static assets, no-store for authenticated API responses, and short max-age with ETag validation for semi-static content."

#### What bugs happen when cache headers are handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor cache headers cause several production issues. Caching authenticated responses with `public` leaks user data to other users sharing a CDN or proxy cache. Not setting cache headers for static assets causes every page load to re-download CSS, JS, and images, slowing the site. Setting `max-age` too long serves stale content until users hard-refresh. Not using `Vary` with Accept-Encoding causes compressed and uncompressed versions to be served incorrectly. Not using `immutable` for versioned assets causes unnecessary revalidation requests. Using `no-cache` when you mean `no-store` — `no-cache` allows caching but requires revalidation, while `no-store` prevents caching entirely.
- **The Unforgettable Mental Model:** Poor cache headers are like **mislabeling food in a shared fridge**. "Public" labels on personal meals mean anyone can eat them. "No expiry" labels mean nobody knows when food has gone bad.
- **The Trap:** Using `Cache-Control: no-cache` thinking it means "don't cache." It actually means "cache but revalidate before serving." Use `no-store` to prevent caching entirely.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor cache headers cause data leaks from caching authenticated responses publicly, slow sites from not caching static assets, stale content from excessive max-age, and incorrect compression from missing Vary headers. The most common bug is confusing no-cache with no-store — no-cache allows caching with revalidation, no-store prevents caching entirely. I set explicit headers for each response type: public with long max-age for static assets, private with no-store for authenticated data, and short max-age with ETag for semi-static API responses."

#### How do cache headers affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients experience cache headers through browser caching behavior. With `max-age`, the browser serves cached responses without network requests until the cache expires. With `ETag`, the browser sends `If-None-Match` on subsequent requests and receives 304 Not Modified if unchanged, saving bandwidth. With `no-store`, the browser never caches the response and always fetches fresh data. The frontend can also programmatically control caching through fetch options (`cache: 'no-store'`, `cache: 'force-cache'`) and service workers. Cache headers affect perceived performance — cached responses are instant, while uncached responses have network latency.
- **The Unforgettable Mental Model:** Cache headers for the frontend are like a **personal assistant's memory**. Good memory (proper caching) means instant answers for repeated questions. Bad memory (no caching) means asking the same question every time.
- **The Trap:** The frontend not handling 304 responses correctly. Some HTTP libraries treat 304 as an error instead of a successful cache validation response.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend experiences cache headers through browser caching behavior. With max-age, the browser serves cached responses instantly without network requests. With ETag, the browser revalidates and receives 304 if unchanged, saving bandwidth. With no-store, the browser always fetches fresh data. The frontend can also control caching programmatically through fetch options and service workers. I design the frontend to work with the backend's cache strategy — using service workers for offline caching, handling 304 responses correctly, and respecting no-store for sensitive data."

#### How would you test cache headers?
- **The Engine Mechanism (Why it behaves this way):** Testing cache headers involves verifying the correct headers are set and that caching behavior works as expected. Test that static assets return `Cache-Control: public, max-age=31536000, immutable`. Test that authenticated responses return `Cache-Control: private, no-store`. Test that semi-static responses return `Cache-Control: public, max-age=60` with an ETag. Test that a second request for the same resource returns 304 Not Modified when the content hasn't changed. Test that CDN caches respect `s-maxage` for shared caching. Test that `Vary` headers are set correctly for responses that vary by Accept-Encoding or Accept-Language.
- **The Unforgettable Mental Model:** Testing cache headers is like **testing a vending machine's inventory system**. Verify items are stocked (cached), verify expired items are replaced (TTL), and verify the right item goes to the right person (private vs public).
- **The Trap:** Only checking response headers without testing actual caching behavior. Headers may be correct, but the actual cache behavior (304 responses, CDN caching) may not work as expected.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test cache headers by verifying the correct headers are set for each response type and that actual caching behavior works. I verify static assets get long max-age, authenticated responses get no-store, and API responses get short max-age with ETag. I test that second requests return 304 when content hasn't changed. I test CDN caching with s-maxage. I verify Vary headers are correct. I use browser dev tools and curl to inspect headers and caching behavior. The key is testing both the headers and the actual caching behavior."

## 8. Active recall test

1. **Explain cache headers without looking at notes.**
   - **Explanation:** Cache headers are HTTP response headers (Cache-Control, ETag, Last-Modified, Vary) that instruct browsers, CDNs, and proxies how to store and reuse responses. Cache-Control defines storage rules and freshness. ETag enables validation. Proper headers reduce server load, improve performance, and ensure data freshness.

2. **Give one production bug related to cache headers.**
   - **Explanation:** Caching authenticated user profile responses with `Cache-Control: public` causes a CDN to serve User A's profile to User B when they share a CDN edge cache. Personal data leaks between users through the shared cache.

3. **Give one API example where cache headers matter.**
   - **Explanation:** A hashed JS bundle: `Cache-Control: public, max-age=31536000, immutable` — cached for a year because the filename changes when content changes. A user profile: `Cache-Control: private, no-store` — never cached because it's personalized and sensitive.

4. **Explain how a frontend client experiences cache headers.**
   - **Explanation:** The browser serves cached responses instantly when fresh (within max-age), revalidates with 304 when stale but unchanged, and always fetches fresh when no-store. The frontend can also control caching via fetch options and service workers.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Cache Headers is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Cache Headers in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Cache Headers in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
