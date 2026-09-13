# How do you handle high traffic

## Detailed explanation

How do you handle high traffic is a senior backend scenario that checks how you debug, reason, prioritize, and design a safe fix under production constraints. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you handle high traffic affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle high traffic on a backend system?
- **The Engine Mechanism (Why it behaves this way):** High traffic handling requires a multi-layered approach: horizontal scaling (add more server instances behind a load balancer), caching (CDN for static content, Redis for dynamic data), database optimization (read replicas, connection pooling, query optimization), rate limiting (prevent abuse, protect resources), and async processing (offload non-critical work to background jobs). Each layer absorbs a portion of the traffic, preventing any single component from becoming a bottleneck.
- **The Unforgettable Mental Model:** The **Highway System**. One lane (single server) handles 100 cars/hour. Add lanes (horizontal scaling), add express lanes (caching), add on-ramp meters (rate limiting), and redirect trucks to freight routes (async processing). Each layer increases total capacity.
- **The Trap:** Scaling only one layer. Adding more web servers won't help if the database is the bottleneck. Scale all layers proportionally.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle high traffic through a layered approach. First, horizontal scaling — add server instances behind a load balancer. Second, caching at multiple levels — CDN for static content, Redis for API responses. Third, database optimization — read replicas for read-heavy workloads, connection pooling, and query optimization. Fourth, rate limiting to prevent abuse. Fifth, async processing to offload non-critical work. The key is identifying and scaling the bottleneck layer, not just adding web servers."

#### How does horizontal scaling work?
- **The Engine Mechanism (Why it behaves this way):** Horizontal scaling adds more server instances behind a load balancer that distributes incoming requests across instances. The load balancer uses algorithms like round-robin, least connections, or weighted distribution. Each instance is stateless — session data is stored in Redis or the database, not in local memory. Auto-scaling adjusts the number of instances based on metrics (CPU, memory, request count). The key requirement is statelessness — any instance can handle any request.
- **The Unforgettable Mental Model:** The **Bank Tellers**. One teller serves 10 customers/hour. Add 10 tellers, and you serve 100 customers/hour. But each teller needs access to the same vault (shared state) — they can't have separate vaults.
- **The Trap:** Storing session state in local memory. When a user's next request goes to a different instance, their session is lost. Use Redis or database-backed sessions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Horizontal scaling adds server instances behind a load balancer that distributes requests. Each instance must be stateless — session data stored in Redis or the database, not local memory. I use auto-scaling to adjust instance count based on CPU, memory, or request metrics. The load balancer uses round-robin or least-connections algorithms. The key insight is that statelessness enables horizontal scaling — any instance can handle any request."

#### How do read replicas help with high traffic?
- **The Engine Mechanism (Why it behaves this way):** Read replicas are copies of the primary database that handle read queries. The primary handles writes and replicates changes to replicas asynchronously. Read-heavy workloads (100 reads per write) benefit enormously — replicas absorb read traffic, reducing load on the primary. The application routes read queries to replicas and write queries to the primary. Replication lag (delay between write and replica update) is the trade-off — reads may return slightly stale data.
- **The Unforgettable Mental Model:** The **Photocopier**. The original document (primary) is kept safe for edits. Copies (replicas) are distributed to readers. Everyone reads from copies, leaving the original free for writing. Copies might be a few seconds behind the latest edit.
- **The Trap:** Reading from replicas immediately after writing. Replication lag means the replica might not have the latest write yet. Read-your-writes consistency requires reading from the primary.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Read replicas absorb read traffic, reducing load on the primary database. For read-heavy workloads, I route reads to replicas and writes to the primary. The trade-off is replication lag — replicas may be slightly behind the primary. I handle this by reading from the primary immediately after writes (read-your-writes consistency) and accepting eventual consistency for other reads. I monitor replication lag and alert if it exceeds a threshold."

#### How does rate limiting protect high-traffic systems?
- **The Engine Mechanism (Why it behaves this way):** Rate limiting controls how many requests a client can make within a time window. Algorithms: fixed window (count requests per minute), sliding window (count requests in the last N seconds), token bucket (tokens replenish at a fixed rate, each request consumes a token), and leaky bucket (requests queue and process at a fixed rate). Rate limiting prevents abuse (DDoS, scraping), protects resources (database, external APIs), and ensures fair usage. Implement at the API gateway, load balancer, or application level.
- **The Unforgettable Mental Model:** The **Theme Park Queue**. Without rate limiting, everyone rushes the entrance at once (DDoS). With rate limiting, people enter at a controlled rate — the park stays enjoyable for everyone, and the rides (resources) don't break down.
- **The Trap:** Rate limiting too aggressively. Legitimate users get blocked during traffic spikes. Use graduated limits (soft limits with warnings before hard blocks) and whitelist trusted clients.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Rate limiting controls request volume per client using algorithms like token bucket or sliding window. I implement it at the API gateway level for efficiency. It prevents abuse, protects downstream resources, and ensures fair usage. I use graduated limits — soft limits with warnings before hard blocks — to avoid blocking legitimate users during traffic spikes. I also whitelist trusted clients and monitor rate limit hits to adjust thresholds."

#### How do you use caching to handle high traffic?
- **The Engine Mechanism (Why it behaves this way):** Caching reduces the load on backend systems by serving pre-computed responses. CDN caching handles static assets and cacheable API responses at the edge (closest to users). Redis caching handles dynamic API responses, session data, and computed results. Browser caching reduces repeat requests from the same user. With a 90% cache hit ratio, only 10% of requests reach the backend, dramatically increasing effective capacity. Cache invalidation ensures freshness.
- **The Unforgettable Mental Model:** The **Vending Machine Network**. Instead of everyone going to the factory (backend) for snacks, vending machines (caches) are placed everywhere. 90% of people get their snack from the nearest machine. Only 10% need something the machines don't stock.
- **The Trap:** Caching everything without invalidation strategy. Stale cached data causes bugs. Always define TTLs and invalidation rules for each cache layer.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use caching at multiple layers to handle high traffic. CDN caching at the edge for static content and cacheable API responses. Redis for dynamic API responses, session data, and computed results. Browser caching for repeat visits. With a high cache hit ratio, only a fraction of requests reach the backend. The key is defining clear TTLs and invalidation strategies for each cache layer to balance performance with data freshness."

#### How do you handle traffic spikes (flash crowds)?
- **The Engine Mechanism (Why it behaves this way):** Traffic spikes require proactive and reactive strategies. Proactive: pre-warm caches, pre-scale infrastructure before known events (product launches, sales), implement queue-based request processing (accept requests, process when capacity allows), and use CDN caching for as much content as possible. Reactive: auto-scaling (takes minutes to provision new instances), rate limiting (protect resources), graceful degradation (disable non-critical features), and fallback to cached/stale data when backend is overwhelmed.
- **The Unforgettable Mental Model:** The **Concert Venue**. Before a popular show, you open extra doors (pre-scale), set up overflow screens (CDN), and have standby staff (auto-scaling). When the crowd rushes in, you control the flow (rate limiting) and prioritize VIP sections (graceful degradation).
- **The Trap:** Relying solely on auto-scaling. New instances take minutes to provision — by then, the spike may have overwhelmed the system. Pre-scale for known events.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For traffic spikes, I use both proactive and reactive strategies. Proactively, I pre-warm caches, pre-scale infrastructure before known events, and maximize CDN caching. Reactively, I rely on auto-scaling (though it takes minutes), rate limiting to protect resources, graceful degradation to disable non-critical features, and fallback to cached data when the backend is overwhelmed. The key is having a plan for known events and resilience for unknown spikes."

#### How do you monitor a high-traffic system?
- **The Engine Mechanism (Why it behaves this way):** Monitoring requires tracking metrics at every layer: request rate, error rate, latency percentiles (p50, p95, p99) at the API layer; cache hit ratio, memory usage, and eviction rate at the cache layer; query rate, connection pool usage, and replication lag at the database layer; and CPU, memory, and instance count at the infrastructure layer. Set up alerts on thresholds (error rate > 1%, p99 latency > 2s, replication lag > 10s). Use distributed tracing to track requests across services.
- **The Unforgettable Mental Model:** The **Air Traffic Control Tower**. Controllers monitor every plane's position (metrics), altitude (latency), and speed (throughput). Alarms trigger when planes get too close (error rate spikes) or deviate from course (latency degradation).
- **The Trap:** Monitoring only averages. Average latency hides outliers. Monitor percentiles (p95, p99) to catch the worst user experiences.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor high-traffic systems at every layer. API layer: request rate, error rate, and latency percentiles (p50, p95, p99). Cache layer: hit ratio, memory usage, eviction rate. Database layer: query rate, connection pool usage, replication lag. Infrastructure: CPU, memory, instance count. I set alerts on thresholds and use distributed tracing to track requests across services. The key is monitoring percentiles, not averages, to catch the worst user experiences."

## 8. Active recall test

1. **What are the key layers for handling high traffic?**
   - **Explanation:** Horizontal scaling (add server instances), caching (CDN + Redis), database optimization (read replicas, connection pooling), rate limiting (prevent abuse), and async processing (offload non-critical work).

2. **Why must horizontally scaled instances be stateless?**
   - **Explanation:** Any instance can handle any request. If session state is stored locally, a user's next request might go to a different instance and lose their session. Store session data in Redis or the database.

3. **How do read replicas help with high traffic?**
   - **Explanation:** They absorb read traffic, reducing load on the primary database. Route reads to replicas, writes to primary. Trade-off: replication lag means reads may return slightly stale data.

4. **What rate limiting algorithms exist?**
   - **Explanation:** Fixed window (count per time period), sliding window (count in last N seconds), token bucket (tokens replenish at fixed rate), and leaky bucket (queue and process at fixed rate).

5. **How do you handle traffic spikes?**
   - **Explanation:** Proactively: pre-warm caches, pre-scale infrastructure, maximize CDN caching. Reactively: auto-scaling, rate limiting, graceful degradation, and fallback to cached data.

6. **How does caching increase effective capacity?**
   - **Explanation:** With a 90% cache hit ratio, only 10% of requests reach the backend. A system that handles 100 requests/second effectively handles 1000 requests/second with caching.

7. **What metrics are critical for high-traffic monitoring?**
   - **Explanation:** Request rate, error rate, latency percentiles (p50, p95, p99), cache hit ratio, connection pool usage, replication lag, CPU, memory, and instance count. Alert on thresholds.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle high traffic in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle high traffic in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
