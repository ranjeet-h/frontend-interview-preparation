# URL Shortener

A URL shortener turns a short, stable code into a destination URL. The pressure in an interview is not the mapping itself; it is serving an enormous, read-heavy redirect workload with very low latency while keeping each mapping durable and safe.

This design is an interview scope, not a product claim. It covers creating links, redirecting them, optional expiry or deletion, and asynchronous click analytics. Custom branded domains, detailed abuse-review workflows, and billing are useful extensions rather than the main path.

## 1. Clarify requirements

Functional requirements:

- Create a short link for a valid destination with `POST /short-links`.
- Redirect a visitor with `GET /r/{code}`.
- Support an owner, an optional expiry, and an optional owner-authorized delete operation.
- Record click events for later analytics without delaying the redirect.

The key invariant is **immutable mapping**: once a `code` has been successfully assigned, it always identifies the same destination until the link expires or is deleted. Reusing a retired code would let an old bookmark point at a different destination, so this design never reuses codes.

Non-functional interview assumptions: redirects target sub-20 ms at the service boundary, mappings are durable before a create response succeeds, and analytics may be eventually consistent.

## 2. Estimate scale

All values below are interview assumptions:

- Roughly 100 million new links per month is about 39 creates/second on average.
- Roughly 10 billion redirects per month is about 3,900 redirects/second on average; design for several times that rate during campaigns or viral events.
- The read-to-write ratio is near 100:1, so the redirect path deserves the simplest and fastest design.
- A seven-character Base62 code space has `62^7`, about 3.5 trillion combinations. It is an illustrative capacity calculation, not a promise that every code will be usable.

At 100 million links per month, that nominal space lasts for thousands of years before accounting for reserved, blocked, or deliberately unused codes. Storage is modest compared with serving reads: mappings are compact, whereas redirect latency and hot keys drive the architecture.

## 3. Define APIs

```http
POST /short-links
Authorization: Bearer <token>
Content-Type: application/json

{
  "destination": "https://example.com/articles/long-path",
  "expiresAt": "2027-08-28T00:00:00Z",
  "redirectType": "temporary"
}
```

```json
201 Created
{
  "code": "aZ89kL2",
  "shortUrl": "https://short.example/r/aZ89kL2",
  "expiresAt": "2027-08-28T00:00:00Z"
}
```

`GET /r/{code}` returns a redirect with a `Location` header. A revocable link (one that can expire, be owner-deleted, or be taken down) returns `302 Found` with `Cache-Control: no-store`, so a later request reaches the service and can enforce the current state. It returns `404 Not Found` for an absent, expired, or deleted link, and may return `410 Gone` when the product wants to reveal an intentionally retired link. `DELETE /short-links/{code}` is optional and requires the owning user or an administrator; it makes the code permanently unavailable.

## 4. Define the data model

The durable mapping record is:

```text
ShortLink(
  code,
  destination,
  ownerId,
  createdAt,
  expiresAt,
  redirectType
)
```

`code` is the primary lookup key and has a unique index. `expiresAt` is nullable for non-expiring links. `redirectType` is normally `temporary`; it maps to a revocable `302` response. A `permanent` type is allowed only for a product-guaranteed irrevocable mapping with no expiry and no owner deletion or takedown path; it maps to `301`. A separate append-only click-event stream holds code, timestamp, referrer class, and privacy-reviewed client metadata; it is not joined into the redirect response.

## 5. Draw the high-level architecture

```text
Create:  Client -> API service -> ID generator -> durable mapping store
                                 \-> cache warm

Redirect: Client -> edge/CDN -> redirect service -> cache -> mapping store
                                      |              |
                                      |              \-> fill cache on miss
                                      \-> click-event queue -> analytics workers -> analytics store
```

An edge cache may absorb globally popular **irrevocable** redirects. Revocable links always reach the redirect service, whose internal distributed cache still provides a cache-first mapping lookup while preserving expiry, deletion, and takedown checks. The durable mapping store is the source of truth. The click-event queue accepts best-effort asynchronous events, and analytics workers batch them into an analytics-oriented store.

## 6. Walk through the main request flow

**Create flow:** validate the destination, obtain a collision-safe code, conditionally insert the mapping into the durable store, warm the cache, then return `201 Created`. The durable write happens before the response, so a returned code is recoverable after a cache loss.

**Redirect flow:**

1. A client calls `GET /r/{code}`. An edge may answer directly only for a non-expiring, irrevocable `301` link; a revocable link reaches the redirect service.
2. Otherwise the redirect service checks the distributed cache.
3. On a hit, it checks expiry and revocation metadata and sends `302 Found` with `Cache-Control: no-store` for a revocable link.
4. On a miss, it reads the durable mapping store, rejects absent or expired records, and fills the cache before or alongside the response.
5. It publishes a small click event without waiting for an acknowledgement, then returns the redirect.

`302 Found` with `Cache-Control: no-store` is the default because the chapter supports expiry, owner deletion, and abuse takedowns; browsers and intermediaries must not retain a redirect that the service may later revoke. `301 Moved Permanently` is permitted only when the product contract makes a mapping non-expiring and irrevocable, including no owner-delete or takedown path, because browser and intermediary caching can otherwise bypass enforcement. The service can use a method-preserving temporary status when that semantic is required; the interview decision is to make redirect caching behavior explicit.

## 7. Identify bottlenecks

The main bottlenecks are hot viral codes, cache misses concentrating on one mapping-store partition, edge-cache propagation after a new link, and event-queue pressure. A single celebrity or campaign link can make one code vastly hotter than the rest.

Cache stampedes are another risk: after expiry or eviction, many redirect workers can simultaneously miss and query the durable store. Code generation can bottleneck if every create coordinates on one counter, and synchronous analytics would turn an otherwise cheap redirect into a multi-service request.

## 8. Scale each component

Run stateless API and redirect services behind load balancers, scaling them horizontally. Partition the durable mapping store by a well-distributed code hash so ordinary reads and writes spread across partitions. Put popular redirects at the edge and in a regional distributed cache; hot-link traffic should ideally not reach the mapping store.

Use a collision-safe ID generator: for example, allocate non-overlapping ID ranges to generators and Base62-encode them, or generate random Base62 candidates and conditionally insert on the unique code index, retrying only on a collision. The first option avoids collision retries; the second makes codes less enumerable. Either is an example choice, not a required vendor implementation.

Partition the click-event stream and scale independent analytics consumers. If analytics falls behind, redirect capacity remains available because the redirect response does not wait for analytics.

## 9. Caching strategy

Use cache-aside for `code -> {destination, expiresAt, redirectType}`. A cache hit avoids the durable store. A cache miss loads the durable mapping, returns the redirect, and repopulates the cache with a TTL no later than the link expiry.

For hot viral irrevocable links, use CDN/edge caching plus regional cache replication. For hot revocable links, scale the redirect service and its internal mapping cache instead of response-caching the redirect at clients or intermediaries. Protect the mapping store with request coalescing (one in-flight refill per code), short-lived negative caching for truly absent codes, TTL jitter, and stale-while-revalidate where the expiry and revocation rules remain correct. Do not serve stale data beyond a known expiry or after an owner-authorized deletion.

## 10. Database scaling and consistency

The source of truth needs a unique code constraint and durable conditional creation. A partitioned SQL database is attractive when owner administration, audits, and transactional metadata queries are important; it offers familiar constraints and joins, but cross-partition growth and operational sharding need care.

A NoSQL key-value or wide-column mapping store is attractive for predictable `code` lookups and easy horizontal partitioning; it can trade joins and flexible owner queries for throughput and availability. Choose SQL for richer relational management needs, or NoSQL for a very large, simple lookup workload. In either case, a create succeeds only after the mapping is durably written, while cache and analytics propagation may be eventually consistent.

## 11. Handle concurrency

The unique code index or conditional insert is the final concurrency authority. If two generators produce the same random candidate, only one write wins and the loser retries with a new candidate. Preallocated ID ranges avoid that collision path altogether.

Concurrent delete and redirect requests need a defined result. The redirect service checks durable or cache metadata including version/tombstone state; deleting a revocable link invalidates its internal cache entry, and its `Cache-Control: no-store` response prevents client/intermediary response caches from bypassing the next check. Only irrevocable `301` links can be edge-cached. Codes remain reserved after deletion, preserving the immutable mapping invariant.

## 12. Reliability and failure handling

If the cache is unavailable, redirect services fall back to the durable mapping store with rate protection; availability degrades before correctness does. If the mapping store is unavailable, return a controlled `503` rather than inventing a destination. Replicate the durable store across failure domains and back it up; cache contents are reconstructable.

Expired links are rejected at read time even if a background cleanup job has not removed them. Cleanup may later delete payload data or create a tombstone, but it must not release the code. Retry asynchronous cache fills and analytics publishing with bounded queues and dead-letter handling. A dropped click event is acceptable; a delayed or incorrect redirect is not.

## 13. Availability versus consistency trade-offs

The mapping itself favors consistency: after a successful create, the assigned code must resolve to its immutable destination, never a different one. Cache replicas and click counts can be eventually consistent. A brief delay before a newly created link appears at a far edge is acceptable if the origin can resolve it.

For deletion and abuse takedowns, favor fast invalidation and consistency over maximum cache availability; revocable links are not response-cached outside the service. For ordinary redirects during a cache outage, favor availability by reading the durable store. The interview answer should state exactly which decision is being made rather than claiming one universal consistency level.

## 14. Security

Accept only approved URL schemes such as `https` and `http`; reject `javascript:`, data URLs, malformed hosts, and unsafe internal-network destinations as policy requires. Normalize and parse URLs server-side, limit destination length, rate-limit creates, and use reputation/block-list plus abuse-review signals for phishing and malware.

Authenticate owner operations, authorize deletion by `ownerId`, and protect management APIs from enumeration. Redirect responses should use TLS, careful headers, and privacy-minimized click data. Do not treat a short URL as proof that its destination is safe: warning interstitials or takedowns are valid policy extensions.

## 15. Monitoring and observability

Track redirect latency (especially P95/P99 against the sub-20 ms interview target), edge and regional cache hit rate, mapping-store reads, create collision retries, cache refill coalescing, error rates, expiry/deletion outcomes, and redirect status-code distribution.

For analytics, monitor queue depth, consumer lag, dropped-event count, and end-to-end event freshness separately from redirect success. Use sampled, privacy-reviewed traces keyed by code or request ID so an operator can follow a cache miss through store lookup and cache fill without putting sensitive destination URLs in broad logs.

## 16. Discuss trade-offs

Preallocated sequential IDs are simple and collision-free but may be enumerable; random codes reduce predictability but require conditional-insert collision handling. A longer code expands capacity and reduces collision probability but is less compact.

`301` improves client and intermediary caching, but is valid only for a non-expiring, irrevocable mapping and can hide subsequent clicks. `302` with `Cache-Control: no-store` preserves expiry, deletion, and abuse-takedown enforcement at the cost of more service traffic. SQL makes owner and audit queries easier; NoSQL simplifies large-scale key lookup. A cache-first internal mapping path offers latency and scale, while durable-store fallback protects correctness during cache loss.

## 17. Future improvements

Add custom aliases with reserved-word checks, branded domains, QR-code generation, regional data residency, scheduled link activation, richer abuse review, and an owner analytics dashboard. Add idempotency keys to `POST /short-links` when clients may retry creates, and introduce multi-region write routing if the interview scope requires globally low create latency.

## Interview recap

The interview answer is: “generate a unique immutable key once, make redirects cache-first, keep the mapping durable, and move analytics off the hot path.”

For optional additional reading, see the existing [URL shortener backend deep dive](../../../backend/system-design/design-a-url-shortener.md).

Likely follow-ups:

- How would custom aliases and branded domains change uniqueness and abuse checks?
- When would you use `301` instead of `302`, and what analytics trade-off does that create?
- How would you contain one viral link without overwhelming a single cache or database partition?
