# CDN Caching

## Detailed explanation

CDN caching stores responses near users at edge locations to reduce latency and backend load.

## 1. One-line mental model

Serve cacheable content from edge servers close to users.

## 2. Problem it solves

Global users experience slow responses if every static asset or public API response must travel to one origin server.

## 3. Core idea

- Best for static assets, images, public pages, and safe public API responses.
- Cache key may include path, query, headers, or locale.
- Invalidation/purging must be planned.
- Private personalized data needs careful rules.
- CDN can also protect from traffic spikes.

## 4. Visual / analogy

```txt
Mini warehouses near every city.
```

## 5. Minimal example

```txt
Cache-Control: public, s-maxage=300
```

## 6. Real-world example

Public product listing cached at CDN for 5 minutes.

## 7. Common interview questions

#### What is CDN caching?
- **The Engine Mechanism (Why it behaves this way):** A CDN (Content Delivery Network) caches responses at edge servers located geographically close to users. When a user requests a resource, the CDN checks its edge cache. If found (cache hit), it serves the response immediately from the nearby edge server. If not found (cache miss), it fetches from the origin server, caches the response at the edge, and serves it. CDN caching is controlled by HTTP cache headers (Cache-Control, ETag) and CDN-specific configurations (cache keys, purge rules, TTL overrides). CDNs are best for static assets (JS, CSS, images), public API responses, and content that is cacheable and shared across users. The CDN cache key typically includes the URL path, query parameters, and selected headers.
- **The Unforgettable Mental Model:** CDN caching is like **mini warehouses in every city**. Instead of shipping from one central warehouse (origin server), products are stored locally (edge servers) for fast delivery.
- **The Trap:** Caching personalized API responses at the CDN. A CDN caches responses by cache key — if the key doesn't include user identity, User A's personalized response gets served to User B.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: CDN caching stores responses at edge servers close to users for fast delivery. When a user requests a resource, the CDN checks its edge cache first — if found, it serves immediately from the nearby edge. If not, it fetches from the origin, caches at the edge, and serves. CDN caching is controlled by HTTP cache headers and CDN-specific configurations. I use CDNs for static assets, public API responses, and shared content. I never cache personalized data at the CDN unless the cache key includes user identity. CDNs also provide DDoS protection and traffic spike absorption."

#### Why does CDN caching matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** CDN caching matters because it reduces origin server load, improves global response times, and absorbs traffic spikes. By serving cached responses from edge servers, the CDN reduces the number of requests reaching the origin server, allowing it to handle more unique requests with fewer resources. Edge servers are geographically distributed, so users worldwide get fast responses regardless of the origin server's location. CDNs also provide security benefits — DDoS mitigation, WAF (Web Application Firewall), and bot protection. For static assets, CDN caching eliminates origin server involvement entirely after the initial cache population.
- **The Unforgettable Mental Model:** CDN caching is like a **franchise model**. Instead of one central store serving the entire country, franchise locations (edge servers) serve local customers, reducing travel time and central store load.
- **The Trap:** Assuming CDN caching eliminates the need for origin server optimization. CDN cache misses still hit the origin, and cache invalidation requires origin coordination. The origin must still be performant.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: CDN caching matters because it reduces origin server load, improves global response times, and absorbs traffic spikes. Edge servers serve cached responses locally, reducing requests to the origin. This allows the origin to handle more unique requests with fewer resources. CDNs also provide DDoS protection and WAF. I use CDNs for static assets and public content, with appropriate Cache-Control headers. The origin must still be performant for cache misses, and I plan cache invalidation strategies for content updates."

#### What bugs happen when CDN caching is handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor CDN caching causes several production issues. Caching personalized responses without user-specific cache keys serves wrong data to wrong users globally — once cached at an edge, the wrong data serves all users hitting that edge. Not purging CDN cache after content updates serves stale content until TTL expires, even though the origin has fresh data. Not including query parameters in the cache key serves the same response for different query variations. Setting TTL too long serves stale content; too short causes excessive origin requests. Not handling cache purging properly means content updates take hours to propagate across all edge locations.
- **The Unforgettable Mental Model:** Poor CDN caching is like **a franchise that stocks the wrong products**. Once the wrong product is on the shelf (cached at edge), every customer at that location gets the wrong item until the shelf is restocked (purged).
- **The Trap:** Forgetting that CDN cache is distributed across hundreds of edge locations. Purging one edge doesn't purge all — you need to purge globally or wait for TTL expiration.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor CDN caching serves wrong data to wrong users from personalized responses cached without user-specific keys, serves stale content after updates without proper purging, and causes excessive origin requests from short TTLs. The most dangerous bug is caching personalized data at the CDN — once cached at an edge, it serves all users hitting that edge. I ensure cache keys include all relevant context, set appropriate TTLs, implement cache purging for content updates, and never cache authenticated or personalized responses at the CDN unless the cache key includes user identity."

#### How does CDN caching affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients experience CDN caching as faster response times for cached resources and potentially stale content for cached API responses. Static assets served from the CDN load quickly because they're delivered from a nearby edge server. API responses cached at the CDN may be slightly stale — the CDN serves the cached version until TTL expires or is purged. The frontend should handle CDN-cached API responses gracefully — showing last-updated timestamps, providing manual refresh options, and using cache-busting query parameters for fresh data. CDN caching also affects the frontend's asset loading strategy — hashed filenames with long max-age enable aggressive CDN caching without staleness concerns.
- **The Unforgettable Mental Model:** CDN caching for the frontend is like **a local convenience store vs. a distant supermarket**. The convenience store (CDN edge) is faster but may not have the latest products. The supermarket (origin) has everything but takes longer to reach.
- **The Trap:** The frontend not handling CDN-cached stale API responses. When the CDN serves a cached response, the frontend may show outdated data without realizing it's from the CDN cache.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend experiences CDN caching as faster responses for cached resources and potentially stale API responses. Static assets from the CDN load quickly from nearby edge servers. API responses cached at the CDN may be slightly stale. I design the frontend to handle this — showing last-updated timestamps, providing manual refresh, and using cache-busting query parameters for fresh data. For static assets, I use hashed filenames with long max-age so CDN caching is aggressive without staleness concerns. The frontend should also handle CDN cache misses gracefully — the first request after a purge may be slower as the CDN fetches from origin."

#### How would you test CDN caching behavior?
- **The Engine Mechanism (Why it behaves this way):** Testing CDN caching involves verifying cache hits and misses at the edge, TTL behavior, and cache purging. Test that the first request is a cache miss (fetches from origin) and subsequent requests are cache hits (served from edge). Verify response headers include CDN-specific headers like `X-Cache: HIT` or `CF-Cache-Status: HIT`. Test that TTL expiration causes a cache miss and re-fetch from origin. Test that cache purging removes the cached response and the next request fetches fresh data from origin. Test that cache keys include the correct components (path, query, headers). Test that personalized responses are not cached at the CDN. Test global cache propagation — purge and verify all edge locations update.
- **The Unforgettable Mental Model:** Testing CDN caching is like **testing a chain of vending machines**. Stock one machine (cache at edge), verify it dispenses the right product (cache hit), verify it restocks from the warehouse when empty (cache miss), and verify you can recall a product from all machines (purge).
- **The Trap:** Only testing from one location. CDN edges are distributed — test from multiple geographic locations to verify consistent caching behavior.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test CDN caching by verifying cache hits and misses at the edge. First request is a miss (from origin), subsequent requests are hits (from edge). I verify CDN-specific headers like X-Cache: HIT. I test TTL expiration causes re-fetch from origin. I test cache purging removes cached responses. I verify cache keys include correct components. I test from multiple geographic locations to verify consistent behavior across edges. I also test that personalized responses are not cached. The key is testing both the caching behavior and the invalidation/purge behavior."

## 8. Active recall test

1. **Explain CDN caching without looking at notes.**
   - **Explanation:** CDN caching stores responses at edge servers geographically close to users. On cache hit, the edge serves the response immediately. On cache miss, it fetches from origin, caches at the edge, and serves. Controlled by HTTP cache headers and CDN config. Best for static assets and public content. Reduces origin load and improves global response times.

2. **Give one production bug related to CDN caching.**
   - **Explanation:** Caching a personalized API response at the CDN without user-specific cache keys causes User A's data to be served to User B from the edge cache. The personalized response is cached globally and serves all users hitting that edge location.

3. **Give one API example where CDN caching matters.**
   - **Explanation:** A public product listing: `GET /api/products` cached at the CDN for 5 minutes with `Cache-Control: public, s-maxage=300`. Users worldwide get fast responses from nearby edge servers. The origin server only handles requests when the CDN cache misses or is purged.

4. **Explain how a frontend client experiences CDN caching.**
   - **Explanation:** The frontend gets faster responses for CDN-cached resources (static assets, public API responses). CDN-cached API responses may be slightly stale. The frontend should handle this with last-updated timestamps, manual refresh, and cache-busting query parameters for fresh data.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

CDN Caching is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain CDN Caching in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define CDN Caching in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
