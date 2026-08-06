# Backend Caching

## Detailed explanation

Caching stores computed or fetched data so later requests can be served faster and with less load.

## 1. One-line mental model

Reuse expensive results instead of recomputing every time.

## 2. Problem it solves

APIs become slow and expensive when every request hits databases or remote services unnecessarily.

## 3. Core idea

- Cache can live in browser, CDN, reverse proxy, app memory, Redis, or database layer.
- Choose TTL and invalidation strategy carefully.
- Cache only safe or correctly scoped data.
- Use cache keys that include tenant/user/context when needed.
- Measure hit rate and stale data risk.

## 4. Visual / analogy

```txt
Keep frequently used items on desk, not in warehouse.
```

## 5. Minimal example

```txt
const cached = await redis.get(key); if (cached) return JSON.parse(cached);
```

## 6. Real-world example

Product catalog list cached for 60 seconds to reduce database load.

## 7. Common interview questions

#### What is backend caching?
- **The Engine Mechanism (Why it behaves this way):** Backend caching stores computed or fetched data so later requests can be served faster without repeating expensive operations. When a request arrives, the backend first checks the cache (Redis, Memcached, in-memory) for a matching key. If found (cache hit), it returns the cached data immediately. If not found (cache miss), it fetches from the database or external service, stores the result in the cache with a TTL (time-to-live), and returns it. Caching can happen at multiple levels: browser cache, CDN cache, reverse proxy cache, application cache, and database query cache. The cache key must include all inputs that affect the result — user ID, query parameters, filters — to avoid serving wrong data.
- **The Unforgettable Mental Model:** Caching is like a **chef's prep station**. Instead of chopping onions from scratch for every order, the chef preps a batch and keeps them ready. Fast service, but they expire and need refreshing.
- **The Trap:** Caching user-specific data without including the user ID in the cache key. User A's profile gets cached, and User B receives User A's data because the cache key was just `user:profile` instead of `user:123:profile`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Backend caching stores computed or fetched data so later requests can be served faster. When a request arrives, the backend checks the cache first — if found, it returns cached data immediately. If not, it fetches from the source, stores the result with a TTL, and returns it. I cache at multiple levels — Redis for application cache, CDN for static assets, and database query cache. The cache key must include all inputs that affect the result — user ID, query params, filters — to avoid serving wrong data to the wrong user."

#### Why does backend caching matter?
- **The Engine Mechanism (Why it behaves this way):** Caching matters because database queries and external API calls are expensive — they add latency, consume resources, and become bottlenecks under load. Caching reduces database load by serving repeated reads from memory, improves response times from milliseconds to microseconds, and enables the system to handle more concurrent requests with the same infrastructure. For read-heavy workloads (product catalogs, user profiles, static content), caching can reduce database queries by 80-95%. Caching also provides a buffer during database outages — cached data continues to be served even if the database is temporarily unavailable.
- **The Unforgettable Mental Model:** Caching is like a **library's reference desk**. Instead of sending every patron to the stacks (database), the desk keeps frequently requested books ready for immediate handout.
- **The Trap:** Caching everything without strategy. Caching write-heavy data, highly personalized data, or data that changes every second wastes cache memory and provides no benefit.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Caching matters because it reduces database load, improves response times, and enables higher throughput. For read-heavy workloads, caching can reduce database queries by 80-95%. It also provides resilience during database outages — cached data continues serving while the database recovers. I cache strategically — read-heavy, frequently accessed, and slowly changing data. I don't cache write-heavy data, highly personalized data, or rapidly changing data. The cache hit rate is the key metric I monitor to ensure caching is effective."

#### What bugs happen when caching is handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor caching causes several production issues. Stale cache serves outdated data after database updates — users see old prices, old profiles, or deleted records. Cache key collisions serve wrong data to wrong users when the key doesn't include all relevant context. Cache stampede occurs when a popular cache entry expires and hundreds of simultaneous requests all miss the cache and hit the database simultaneously. Not invalidating cache on writes causes inconsistency between cache and database. Caching sensitive data without isolation leaks data between users. Setting TTL too long serves stale data; too short provides no benefit.
- **The Unforgettable Mental Model:** Poor caching is like a **whiteboard that nobody erases**. Old information stays visible long after it's been updated, and everyone acts on outdated data.
- **The Trap:** Not invalidating cache on writes. The database is updated, but the cache still serves the old value until TTL expires. Users see stale data and lose trust in the application.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor caching causes stale data after writes, cache key collisions serving wrong data to wrong users, cache stampede on popular entry expiry, and data leaks from insufficient key scoping. The most common bug is not invalidating cache on writes — the database updates but the cache serves old data until TTL expires. I use cache-aside pattern with write-through invalidation, include all context in cache keys, use short TTLs with stale-while-revalidate for resilience, and implement cache stampede protection with locking or probabilistic early expiration."

#### How does caching affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients experience caching as faster response times for cached data and potentially stale data when cache hasn't been invalidated. The frontend may receive cached responses that are slightly outdated — a product price that changed 30 seconds ago, a user profile updated by another device. The frontend should handle stale data gracefully — showing last-updated timestamps, providing manual refresh options, and using optimistic updates for writes. HTTP cache headers (Cache-Control, ETag) also affect the frontend's browser cache behavior, determining whether the browser revalidates or uses its cached copy.
- **The Unforgettable Mental Model:** Caching for the frontend is like a **newspaper from this morning**. It's mostly accurate, but breaking news (recent changes) may not be reflected until the next edition.
- **The Trap:** The frontend assuming cached data is always current. When a user updates their profile on one device, another device may show the old cached profile until the cache expires or is invalidated.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend experiences caching as faster responses but potentially stale data. I design the frontend to handle stale data gracefully — showing last-updated timestamps, providing manual refresh, and using optimistic updates for writes. HTTP cache headers also affect the browser cache — Cache-Control determines whether the browser revalidates or uses its cached copy. For real-time data, I use WebSockets or Server-Sent Events to push updates to the frontend, bypassing cache staleness."

#### How would you test caching behavior?
- **The Engine Mechanism (Why it behaves this way):** Testing caching involves verifying cache hits and misses, data freshness, and invalidation. Test the first request is a cache miss (fetches from database) and subsequent requests are cache hits (return from cache). Test that writing to the database invalidates the cache and the next read fetches fresh data. Test that cache keys include all relevant context (user ID, filters). Test TTL expiration — after TTL, the next request should be a cache miss. Test cache stampede protection — when a popular entry expires, only one request should hit the database. Test that sensitive data is not leaked between users through cache key collisions.
- **The Unforgettable Mental Model:** Testing caching is like **testing a refrigerator**. Put food in (cache it), verify it's there later (cache hit), verify it's fresh (not stale), and verify it's removed when expired (TTL).
- **The Trap:** Only testing the happy path (cache hit). Test cache misses, TTL expiration, invalidation, and key collisions — these are where caching bugs hide.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test caching by verifying the first request is a cache miss and subsequent requests are cache hits. I test that writes invalidate the cache and the next read fetches fresh data. I test cache keys include all context — user ID, filters. I test TTL expiration and cache stampede protection. I also test that sensitive data isn't leaked between users through key collisions. I monitor cache hit rates in production to ensure caching is effective and adjust TTLs based on data freshness requirements."

## 8. Active recall test

1. **Explain backend caching without looking at notes.**
   - **Explanation:** Backend caching stores computed/fetched data so later requests are served faster. On cache hit, data returns from memory (Redis). On cache miss, data fetches from source, stores with TTL, and returns. Cache keys must include all inputs (user ID, params) to avoid serving wrong data. Reduces database load by 80-95% for read-heavy workloads.

2. **Give one production bug related to caching.**
   - **Explanation:** Not invalidating cache on writes causes stale data. A user updates their profile, but the API continues serving the old cached profile until TTL expires. The user sees their old profile on refresh and thinks the update failed.

3. **Give one API example where caching matters.**
   - **Explanation:** A product catalog endpoint: `GET /products` cached for 60 seconds in Redis. The first request fetches from the database (slow), subsequent requests return from cache (fast). When a product is updated, the cache is invalidated and the next request fetches fresh data.

4. **Explain how a frontend client should handle cached responses.**
   - **Explanation:** The frontend should handle potentially stale data gracefully — show last-updated timestamps, provide manual refresh options, and use optimistic updates for writes. For real-time data, use WebSockets or SSE to push updates. HTTP cache headers affect browser cache behavior.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Backend Caching is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Backend Caching in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Backend Caching in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
