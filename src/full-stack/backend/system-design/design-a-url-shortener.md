# Design a URL shortener

## Detailed explanation

Design a URL shortener is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Design data flow, APIs, storage, scaling, failure handling, and observability together.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Clarify requirements and scale.
- Define APIs and data model.
- Choose storage, cache, queues, and workers.
- Plan consistency, failure handling, and security.
- Add observability and rollout strategy.

## 4. Visual / analogy

```txt
Clients -> API -> services -> database/cache/queue -> observability
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply backend system design rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, design a url shortener affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you generate a unique short code for a URL?
- **The Engine Mechanism (Why it behaves this way):** Short codes are generated using one of three strategies: (1) Hash-based — apply MD5/SHA-256 to the original URL, take the first 6-8 characters of the hex digest; (2) Counter-based — use a distributed ID generator (Snowflake, database sequence, or Redis INCR) and encode the integer in Base62 (a-z, A-Z, 0-9); (3) Random — generate a random string and check for collisions in the database, retrying if found. Base62 encoding of a 64-bit integer yields ~11 characters; a 6-character Base62 code gives 62^6 ≈ 56.8 billion combinations.
- **The Unforgettable Mental Model:** The **License Plate Factory**. Each car (URL) gets a unique plate (short code). You can assign plates sequentially (counter), derive them from the car's VIN (hash), or hand out random plates and check the registry for duplicates (random).
- **The Trap:** Using only a hash without collision handling. MD5 collisions are rare but possible; SHA-1 is broken. Always implement a collision detection and retry loop, or use a counter-based approach that guarantees uniqueness.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use a Base62-encoded distributed counter as the primary strategy because it guarantees uniqueness without collision checks. A 64-bit Snowflake ID encoded in Base62 gives us an 11-character code with 2^64 possible values — effectively collision-free. If we want shorter codes, I'd use a 6-character random string with a database uniqueness constraint and retry on collision. The hash-based approach (taking the first N characters of an MD5/SHA digest) is simple but carries collision risk, so I'd only use it with a collision-detection fallback."

#### How do you handle the redirect efficiently at scale?
- **The Engine Mechanism (Why it behaves this way):** The redirect flow is: client requests short URL → API server looks up the code in a cache (Redis/Memcached) → if cache hit, return HTTP 301/302 with the original URL as the Location header → if cache miss, query the database, populate the cache, then redirect. HTTP 301 (permanent) tells browsers/CDNs to cache the redirect forever; HTTP 302 (temporary) forces the server to be hit every time, enabling analytics tracking. At scale, a CDN (CloudFront, Cloudflare) caches the 301 responses at edge locations, reducing origin load by 90%+.
- **The Unforgettable Mental Model:** The **Library Card Catalog**. Instead of walking to the stacks every time someone asks for a book (database query), the librarian keeps a small index card at the front desk (cache). If the card exists, they give directions instantly. If not, they walk to the stacks, create a card, and next time it's fast.
- **The Trap:** Using 301 redirects when you need analytics. A 301 is cached by the browser permanently, so subsequent visits never hit your server — you lose click tracking. Use 302 if you need to count every visit, or use 301 with client-side beacon tracking.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The redirect path is the hottest read in the system, so I'd optimize it with a multi-layer cache. First, a CDN at the edge caches 301 responses for maximum throughput. Behind that, a Redis cluster holds the most-accessed mappings with a TTL. On a cache miss, we query the primary database and backfill the cache. For analytics, I'd use 302 redirects to ensure every visit hits our servers, or alternatively use 301 with an asynchronous analytics event fired before the redirect. The key is keeping the redirect latency under 50ms."

#### What database would you choose and why?
- **The Engine Mechanism (Why it behaves this way):** A URL shortener is a simple key-value lookup: short_code → original_url. This maps perfectly to NoSQL key-value stores (DynamoDB, Cassandra, Redis) or even a relational database with an index on the short_code column. DynamoDB offers single-digit millisecond reads with automatic scaling. PostgreSQL works well for moderate scale with a simple two-column table. The choice depends on scale: under 10M URLs, PostgreSQL is fine; above 100M, DynamoDB or Cassandra; for pure read speed, Redis as primary with persistence.
- **The Unforgettable Mental Model:** The **Phone Book vs. Dictionary**. A relational database is like a phone book — organized, queryable, great for complex lookups. A key-value store is like a dictionary — you know the exact word (key), flip directly to it, and get the definition (value). For URL shortening, you always know the exact key, so the dictionary wins.
- **The Trap:** Over-engineering with a complex schema. You only need two columns: short_code (primary key) and original_url. Adding unnecessary fields (created_at, user_id, click_count) in the hot path slows down the redirect. Store metadata in a separate table or update it asynchronously.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For a URL shortener, the access pattern is a simple key-value lookup, so I'd choose DynamoDB for its single-digit millisecond latency and automatic horizontal scaling. The table would have short_code as the partition key and original_url as an attribute. For moderate scale, PostgreSQL with a B-tree index on short_code works perfectly. If read throughput is the primary concern, I'd use Redis as the primary store with AOF persistence, falling back to the database on cache misses."

#### How do you handle expiration and custom short URLs?
- **The Engine Mechanism (Why it behaves this way):** Expiration is handled by adding an expires_at column and either (1) filtering expired URLs at read time with a WHERE clause, (2) running a background worker that deletes expired entries, or (3) using Redis TTL for automatic expiration. Custom short URLs require checking availability before assignment: attempt an INSERT with the custom code, catch the unique constraint violation, and return an error to the user. A rate limiter prevents users from squatting on desirable codes.
- **The Unforgettable Mental Model:** The **Hotel Reservation System**. Rooms (short codes) have check-out dates (expires_at). The front desk (read path) checks if a room is still occupied before assigning it. A housekeeping crew (background worker) cleans out expired reservations. VIP guests (premium users) can request specific room numbers (custom codes), but only if they're available.
- **The Trap:** Deleting expired URLs synchronously during the redirect path. This adds latency to the hot path. Always handle expiration asynchronously — either with a TTL-based cache, a scheduled cleanup job, or a lazy deletion pattern where expired entries are removed on next access.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For expiration, I'd add an expires_at column and use a combination of approaches: Redis TTL for automatic cache expiration, and a background worker that runs nightly to purge expired database entries. For custom short URLs, I'd attempt an INSERT with a UNIQUE constraint on the short_code column. If it fails with a duplicate key error, I return a 409 Conflict to the user. I'd also add rate limiting on custom URL creation to prevent code squatting attacks."

#### How do you design the API?
- **The Engine Mechanism (Why it behaves this way):** The API has two primary endpoints: POST /shorten accepts { url, custom_code?, expires_at? } and returns { short_code, short_url }. GET /{short_code} performs the redirect. Optional endpoints: GET /{short_code}/stats for analytics, DELETE /{short_code} for removal. The POST endpoint validates the URL format, checks for existing mappings (to avoid duplicate short codes for the same URL), generates the short code, persists to the database, and caches the mapping. Rate limiting applies to POST to prevent abuse.
- **The Unforgettable Mental Model:** The **Post Office Counter**. You bring a long address (original URL) to the counter (POST /shorten), and the clerk gives you a PO Box number (short code). Anyone can mail to that PO Box (GET /{short_code}), and the post office forwards it to the real address. You can also ask how many letters went through your PO Box (stats endpoint).
- **The Trap:** Not validating the original URL. Malicious users can submit javascript: URLs, internal network addresses (SSRF), or extremely long URLs that break storage. Always validate URL format, block dangerous schemes, and enforce a maximum length.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The API has two core endpoints. POST /shorten accepts a JSON body with the original URL, optional custom code, and optional expiration. It validates the URL, generates or assigns the short code, persists it, and returns the shortened URL. GET /{short_code} performs a cache-then-database lookup and returns an HTTP 301 or 302 redirect. I'd also add GET /{short_code}/stats for click analytics and DELETE /{short_code} for URL management. All endpoints would be rate-limited, and the POST endpoint would validate URL format and block SSRF-prone addresses."

#### How do you prevent abuse and handle security?
- **The Engine Mechanism (Why it behaves this way):** Abuse prevention involves: (1) Rate limiting on URL creation (token bucket or sliding window per IP/user); (2) URL validation — reject javascript:, data:, and internal IP addresses to prevent SSRF; (3) Malware/phishing detection — scan the destination URL against threat intelligence APIs; (4) Authentication for custom URLs and analytics; (5) Content-Type enforcement — only accept application/json on POST; (6) HTTPS enforcement for all redirects to prevent man-in-the-middle attacks.
- **The Unforgettable Mental Model:** The **Bouncer at a Club**. The bouncer (security layer) checks IDs (authentication), limits how many people enter per minute (rate limiting), pats down for weapons (URL validation), and checks a blacklist (threat intelligence) before letting anyone in.
- **The Trap:** Only securing the creation endpoint. The redirect endpoint is equally important — without rate limiting on redirects, an attacker can use your service as a DDoS amplification tool by creating millions of short URLs pointing to a victim's server.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Security has multiple layers. On creation, I'd rate-limit POST requests per IP, validate URLs to block javascript: schemes and internal addresses (SSRF prevention), and optionally scan against threat intelligence APIs for known malware. For the redirect path, I'd implement rate limiting to prevent DDoS amplification, enforce HTTPS, and add a preview page for suspicious URLs. Custom URLs and analytics would require authentication. I'd also maintain a blocklist of known malicious destination URLs and refuse to shorten them."

#### How do you scale the system to handle billions of URLs?
- **The Engine Mechanism (Why it behaves this way):** Scaling involves: (1) Horizontal sharding of the database by short_code hash — each shard holds a range of codes; (2) Read replicas for the redirect path, since reads outnumber writes 100:1 or more; (3) Multi-region deployment with a global CDN caching redirects at edge locations; (4) Asynchronous analytics pipeline — write click events to Kafka, process with stream consumers, and store aggregated stats in a time-series database; (5) Cache warming for popular URLs; (6) Consistent hashing for shard assignment to minimize data movement during rebalancing.
- **The Unforgettable Mental Model:** The **Franchise Restaurant Chain**. One restaurant (single server) can't serve a whole city. So you open multiple branches (shards) in different neighborhoods, each handling a specific zip code range. You add delivery drivers (CDN) who carry food from the kitchen to customers. Popular dishes (hot URLs) are pre-made and kept warm (cache warming). Customer feedback (analytics) is collected separately so it doesn't slow down food service.
- **The Trap:** Scaling the write path before the read path. URL shorteners are read-heavy (99%+ reads). Prematurely sharding for writes adds complexity without benefit. Start with a single primary + read replicas, then shard when write throughput becomes the bottleneck.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Since URL shorteners are extremely read-heavy, I'd scale the read path first: add a CDN layer for edge caching, then Redis clusters for in-memory lookups, then database read replicas. For writes, I'd start with a single primary and shard only when write throughput exceeds a single node's capacity. Sharding would use consistent hashing on the short_code to distribute load evenly. Analytics would be decoupled via Kafka — click events stream to Kafka, consumers aggregate them, and results land in a time-series database. This keeps the hot redirect path fast while handling billions of URLs across regions."

## 8. Active recall test

1. **What are the three strategies for generating short codes?**
   - **Explanation:** (1) Hash-based: apply MD5/SHA to the URL and take first N characters; (2) Counter-based: use a distributed ID generator (Snowflake/Redis INCR) and encode in Base62; (3) Random: generate random strings and check for collisions with retry.

2. **Why would you choose HTTP 302 over 301 for redirects?**
   - **Explanation:** HTTP 301 is cached permanently by browsers and CDNs, which means subsequent visits bypass your server entirely. Use 302 when you need to track every click for analytics, since 302 forces the request to hit your server each time.

3. **What is the optimal database choice for a URL shortener?**
   - **Explanation:** A key-value store like DynamoDB or Redis, since the access pattern is a simple lookup by short_code. For moderate scale, PostgreSQL with an index on short_code works well. The schema is just two columns: short_code (PK) and original_url.

4. **How do you handle URL expiration without impacting redirect latency?**
   - **Explanation:** Use Redis TTL for automatic cache expiration, and run a background worker to purge expired entries from the database. Never check expiration synchronously in the redirect hot path.

5. **What security measures prevent a URL shortener from being weaponized?**
   - **Explanation:** Rate limiting on both creation and redirect endpoints, URL validation to block javascript: and internal addresses (SSRF prevention), threat intelligence scanning for malware/phishing URLs, HTTPS enforcement, and a blocklist of known malicious destinations.

6. **How does a CDN improve redirect performance?**
   - **Explanation:** A CDN caches HTTP 301 responses at edge locations worldwide. When a user requests a short URL, the nearest edge server returns the cached redirect without hitting the origin, reducing latency to <10ms and offloading 90%+ of traffic from the origin servers.

7. **What is the read-to-write ratio in a URL shortener and how does it affect architecture?**
   - **Explanation:** Reads outnumber writes 100:1 or higher. This means the architecture should prioritize read optimization: CDN caching, Redis layers, and read replicas. Write scaling (sharding) is only needed at very high volume.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design a URL shortener in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design a URL shortener in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
