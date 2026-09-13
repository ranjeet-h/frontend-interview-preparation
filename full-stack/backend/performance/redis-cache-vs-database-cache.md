# Redis cache vs database cache

## Detailed explanation

Redis cache vs database cache is a senior backend scenario that checks how you debug, reason, prioritize, and design a safe fix under production constraints. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Diagnose with evidence first, then isolate cause, reduce impact, fix safely, and prevent recurrence.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Confirm symptoms with logs, metrics, and traces.
- Find blast radius and reduce user impact.
- Form hypotheses and test them with data.
- Ship the smallest safe fix.
- Add monitoring, tests, or process guardrails.

## 4. Visual / analogy

```txt
Symptom -> evidence -> hypothesis -> fix -> prevention
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply backend performance rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, redis cache vs database cache affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is the difference between Redis cache and database cache?
- **The Engine Mechanism (Why it behaves this way):** Redis is a dedicated in-memory data store designed specifically for caching and fast data access. It operates as a separate process/service, supports rich data structures (strings, hashes, lists, sets, sorted sets), provides pub/sub, and offers persistence options. Database cache (like MySQL query cache, PostgreSQL shared buffers) is built into the database engine — it caches query results or data pages in the database's memory. Redis is shared across application instances, while database cache is tied to a single database instance. Redis offers more control over eviction policies, TTLs, and data structures.
- **The Unforgettable Mental Model:** The **Personal Assistant vs. the Filing Cabinet**. Redis is a personal assistant who remembers everything you tell them, organizes it creatively, and can share information with your whole team. Database cache is the filing cabinet's top drawer — it holds recently used files for quick access, but only the person using the cabinet benefits.
- **The Trap:** Assuming database cache eliminates the need for Redis. Database cache helps the database perform better, but Redis provides application-level caching that reduces database load entirely.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Redis is a dedicated in-memory cache service shared across all application instances, offering rich data structures, flexible eviction policies, and fine-grained TTL control. Database cache is built into the database engine — it caches query results or data pages to speed up database operations, but it doesn't reduce database load the way Redis does. I use Redis for application-level caching (API responses, session data, computed results) and rely on database cache for internal database performance optimization."

#### When should you use Redis over database cache?
- **The Engine Mechanism (Why it behaves this way):** Use Redis when you need: cross-instance caching (multiple app servers share the same cache), complex data structures (counters, leaderboards, rate limiting), pub/sub messaging, session storage, or fine-grained TTL and eviction control. Redis reduces database load by serving requests before they reach the database. Database cache is sufficient for single-instance applications with simple caching needs, or when you want to minimize infrastructure complexity.
- **The Unforgettable Mental Model:** The **Shared Whiteboard vs. Personal Notebook**. Redis is a shared whiteboard everyone can see and update — perfect for team coordination. Database cache is your personal notebook — useful for your own work but invisible to others.
- **The Trap:** Using Redis for everything. If your application runs on a single server with modest traffic, database cache may be sufficient. Adding Redis adds operational complexity (another service to monitor, backup, and scale).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use Redis when I need cross-instance caching, complex data structures like sorted sets for leaderboards, pub/sub for real-time features, or fine-grained control over eviction and TTLs. Redis is essential for distributed systems where multiple app servers need to share cached data. For single-instance applications with simple caching needs, database cache may be sufficient. The decision comes down to scale, data structure needs, and infrastructure complexity tolerance."

#### How does Redis caching reduce database load?
- **The Engine Mechanism (Why it behaves this way):** Redis sits between the application and the database. When a request arrives, the application checks Redis first. On a cache hit, Redis returns the data in sub-millisecond time without touching the database. On a miss, the application queries the database, stores the result in Redis, and returns it. With a high cache hit ratio (90%+), 90% of requests never reach the database, dramatically reducing query volume, connection pool usage, and CPU/memory pressure on the database.
- **The Unforgettable Mental Model:** The **Receptionist**. Instead of every visitor walking directly to the CEO's office (database), they check with the receptionist (Redis) first. The receptionist handles 90% of questions from memory, so the CEO only deals with the 10% that require deeper knowledge.
- **The Trap:** Not measuring cache hit ratio. If your hit ratio is 20%, Redis is adding latency (extra network hop) without meaningfully reducing database load.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Redis reduces database load by serving requests before they reach the database. With a 90% cache hit ratio, 90% of requests are served by Redis in sub-millisecond time, never touching the database. This reduces query volume, connection pool usage, and CPU pressure. The key is achieving a high hit ratio through smart cache key design, appropriate TTLs, and caching the right data — frequently accessed, expensive-to-compute, and slowly changing data."

#### What are the trade-offs of using Redis as a cache?
- **The Engine Mechanism (Why it behaves this way):** Redis advantages: sub-millisecond latency, rich data structures, cross-instance sharing, flexible eviction policies, pub/sub, and atomic operations. Trade-offs: additional infrastructure to deploy, monitor, and scale; network latency between app and Redis (though minimal); memory cost (data must fit in RAM); cache warming on startup (cold cache); and consistency challenges (cache can become stale if invalidation fails). Redis is also a single point of failure unless configured with replication or clustering.
- **The Unforgettable Mental Model:** The **Sports Car vs. Sedan**. Redis is a sports car — incredibly fast, but requires premium fuel (RAM), regular maintenance (monitoring), and a dedicated garage (infrastructure). The database is a sedan — slower but more practical for everyday use.
- **The Trap:** Treating Redis as a database. Redis is optimized for caching, not durability. If Redis restarts without persistence configured, cached data is lost. Don't store critical data only in Redis.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Redis offers sub-millisecond latency, rich data structures, and cross-instance caching, but it adds infrastructure complexity, memory costs, and consistency challenges. I treat Redis as a cache — the database remains the source of truth. I design for cache misses (the system works without Redis), use appropriate TTLs to limit staleness, and monitor hit ratios to ensure the cache is providing value. For critical data, I never rely solely on Redis."

#### How do database internal caches work?
- **The Engine Mechanism (Why it behaves this way):** Database caches operate at multiple levels. Buffer pool/shared buffers cache data pages in memory — when a query reads a page, it's loaded into the buffer pool so subsequent reads are memory-fast. Query cache (MySQL, deprecated in 8.0) cached entire query results — invalidated on any table change. Plan cache stores compiled query execution plans to avoid re-parsing. These caches are managed automatically by the database and improve performance without application changes, but they're limited to a single database instance and don't reduce query volume.
- **The Unforgettable Mental Model:** The **Chef's Prep Station**. The buffer pool is like keeping frequently used ingredients within arm's reach — faster than walking to the pantry. The plan cache is like remembering how to cook a dish — no need to re-read the recipe. But if the kitchen closes (database restarts), everything resets.
- **The Trap:** Relying on MySQL query cache for performance. It was deprecated because it invalidates on any table write, making it ineffective for write-heavy workloads. Modern databases favor buffer pool caching over query result caching.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Database caches work at multiple levels. The buffer pool caches data pages in memory, so repeated reads of the same data are fast. The plan cache stores compiled query plans to avoid re-parsing. These are managed automatically and improve database performance, but they don't reduce query volume — every query still reaches the database. For application-level caching that actually reduces database load, I use Redis or a similar external cache."

#### Can you use both Redis and database cache together?
- **The Engine Mechanism (Why it behaves this way):** Yes, and this is the recommended approach. They operate at different layers: Redis provides application-level caching (reducing database query volume), while database cache provides internal optimization (speeding up queries that do reach the database). Redis handles the first line of defense — serving cached responses without database involvement. Database cache handles the second line — speeding up queries that miss the Redis cache. Together, they provide defense in depth.
- **The Unforgettable Mental Model:** The **Two-Stage Filter**. The first filter (Redis) catches 90% of impurities before water reaches the second filter (database cache). The second filter polishes what gets through. Both work together to deliver clean water.
- **The Trap:** Thinking they compete. They complement each other — Redis reduces query volume, database cache speeds up the queries that do run.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use both together because they operate at different layers. Redis provides application-level caching — it serves requests before they reach the database, reducing query volume by 90%+. Database cache provides internal optimization — it speeds up the 10% of queries that do reach the database by caching data pages and query plans. Together, they provide defense in depth: Redis handles the broad strokes, database cache polishes the rest."

#### How do you choose the right eviction policy for Redis?
- **The Engine Mechanism (Why it behaves this way):** Redis eviction policies determine which keys to remove when memory is full. LRU (Least Recently Used) removes the least recently accessed keys — good for general caching. LFU (Least Frequently Used) removes the least frequently accessed keys — good when access patterns are skewed. TTL-based removes keys closest to expiration. Random removes random keys — simple but unpredictable. No eviction returns errors on write — use only when memory is guaranteed sufficient. Choose based on access patterns: LRU for uniform access, LFU for skewed access, TTL for time-sensitive data.
- **The Unforgettable Mental Model:** The **Closet Cleanup**. LRU is removing clothes you haven't worn in months. LFU is removing clothes you rarely wear (even if you wore them recently). TTL is removing seasonal clothes when the season ends. Each strategy fits different wardrobe patterns.
- **The Trap:** Using no-eviction in production. When Redis runs out of memory, write commands fail. Always configure an eviction policy or set maxmemory appropriately.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I choose eviction policies based on access patterns. LRU is my default for general caching — it removes the least recently accessed keys. LFU works better when access patterns are skewed — a few hot keys get most traffic. For time-sensitive data, I rely on TTL expiration rather than eviction. I always configure maxmemory and an eviction policy in production to prevent write failures when memory fills up. I monitor eviction rates to ensure the cache is sized correctly."

## 8. Active recall test

1. **What is the key difference between Redis and database cache?**
   - **Explanation:** Redis is a dedicated external in-memory cache shared across app instances with rich data structures and fine-grained control. Database cache is internal to the database engine, caching data pages or query results to speed up database operations but not reducing query volume.

2. **When should you choose Redis over database cache?**
   - **Explanation:** When you need cross-instance caching, complex data structures (sorted sets, pub/sub), fine-grained TTL/eviction control, or when you want to reduce database query volume. Database cache is sufficient for single-instance apps with simple needs.

3. **How does Redis reduce database load?**
   - **Explanation:** By serving requests before they reach the database. With a 90% hit ratio, 90% of requests are served by Redis in sub-millisecond time, reducing query volume, connection pool usage, and CPU pressure on the database.

4. **What are the main trade-offs of using Redis?**
   - **Explanation:** Additional infrastructure complexity, memory costs (data must fit in RAM), network latency (minimal), cache warming on startup, consistency challenges (staleness), and single point of failure without replication.

5. **How do database internal caches work?**
   - **Explanation:** Buffer pool caches data pages in memory for fast repeated reads. Plan cache stores compiled query execution plans. These improve database performance but don't reduce query volume — every query still reaches the database.

6. **Should you use Redis and database cache together?**
   - **Explanation:** Yes — they operate at different layers. Redis provides application-level caching (reducing query volume), database cache provides internal optimization (speeding up queries that do reach the database). Together they provide defense in depth.

7. **How do you choose a Redis eviction policy?**
   - **Explanation:** LRU for general caching (removes least recently accessed), LFU for skewed access patterns (removes least frequently accessed), TTL-based for time-sensitive data. Always configure maxmemory and an eviction policy in production.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Redis cache vs database cache in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Redis cache vs database cache in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
