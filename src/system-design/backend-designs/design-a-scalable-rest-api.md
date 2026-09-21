# Design a Scalable, High-Availability REST API Platform

## 1. Understand the Problem First — Clarify Before Designing

Imagine this production nightmare: your team rolls out a minor backend refactor that renames `user_id` to `userId`. Within minutes, thousands of legacy mobile apps worldwide crash on launch. You cannot force mobile users to update their apps instantly, leaving hundreds of thousands of active customers stranded on broken builds for weeks.

Meanwhile, a downstream recommendation microservice suffers a memory leak and its response latency degrades from 20ms to 4000ms. Because your API gateway lacks isolation, incoming requests queue up, consume every available socket and thread in the connection pool, and drag down the entire platform—taking authentication, order placement, and payment processing down with it. To make matters worse, frantic mobile users mash the "Submit Order" button on frozen screens, triggering un-throttled retries that double-charge their credit cards.

Designing a scalable, high-availability REST API platform is not just about choosing HTTP verbs and routing JSON payloads. It is about building an unbreakable contract between diverse clients and backend services that can survive traffic spikes, network partitions, dependency failures, and decades of schema evolution.

Before sketching architecture on a whiteboard, a senior engineer always clarifies constraints, traffic profiles, and availability SLAs:

### Clarifying Questions to Ask the Interviewer

1. **Traffic Scale & Shape:**
   - What is the peak throughput in requests per second (RPS)? (*Assumption: 100,000 peak RPS total; 80,000 read RPS and 20,000 write RPS — an 80:20 read-heavy system.*)
   - Are there sudden traffic spikes (e.g., flash sales, push notifications) or is it steady baseline traffic?
2. **Latency & Availability Targets:**
   - What are our latency SLAs? (*Assumption: p95 latency < 50ms for cached reads, p99 latency < 150ms for mutations.*)
   - What is the availability SLA? (*Assumption: 99.99% "four nines" uptime, allowing under 53 minutes of total downtime per year.*)
3. **Clients & Ecosystem:**
   - Who consumes this API? (First-party web SPAs, native iOS/Android mobile apps, and third-party developer integrations via public API keys.)
4. **Consistency & Idempotency Requirements:**
   - Can reads be eventually consistent, or do we require strict read-your-own-writes consistency?
   - Do payment and mutation operations require end-to-end distributed idempotency guarantees?

---

## 2. The Core Insight — The Decision Everything Else Flows From

The foundational insight of scalable API architecture is **strict protocol-level separation of concerns combined with stateless compute and defensive isolation of failure domains**.

```txt
[Edge Traffic Hygiene]  ──▶  [Stateless Compute Fleet]  ──▶  [Defensively Isolated Storage & Services]
(DDoS, TLS, Rate Limits,     (Share-nothing workers,          (Circuit breakers, Bulkheads,
 Edge Caching, Auth tokens)   Horizontally autoscaled)         Cache-aside, Read replicas)
```

Everything in this architecture stems from three non-negotiable rules:

1. **Compute must be completely stateless:** API worker instances must share zero state, store no local sessions, and write no persistent files to local disk. Any node can handle any request from any user at any millisecond. This makes autoscaling, rolling deployments, and self-healing trivial.
2. **Offload cross-cutting concerns to the edge and ingress gateway:** Business logic microservices should never spend CPU cycles terminating TLS handshakes, parsing JWT cryptography, filtering DDoS attacks, or enforcing rate-limit token buckets. The edge layer and API Gateway strip away infrastructure noise so services focus purely on domain logic.
3. **Protect dependencies defensively at the boundary:** A slow database, cache failure, or dying downstream microservice must never cause upstream thread starvation. Every external dependency is wrapped in circuit breakers, timeouts, and bulkheads.

---

## 3. High-Level Architecture — Components and Why Each Exists

Here is the complete end-to-end architecture for a platform handling 100,000+ RPS across global clients:

```txt
                              [Clients]
                 (Web SPA, iOS, Android, 3rd-Party)
                                 │
                                 ▼
                     [Global Anycast DNS / Geo-DNS]
                                 │
                                 ▼
         [Edge CDN / WAF (Cloudflare / AWS CloudFront)]
           ├── Absorbs Layer 7 DDoS & enforces IP rules
           └── Serves static & public cached API responses (Cache-Control / ETag)
                                 │
                                 ▼
          [Layer 4 Load Balancer (AWS NLB / HAProxy / IPVS)]
           └── Ultra-fast TCP/UDP packet routing across Availability Zones
                                 │
                                 ▼
          [Layer 7 Reverse Proxy / Ingress (Envoy / ALB)]
           └── HTTP/2 & HTTP/3 multiplexing, TLS termination, path routing
                                 │
                                 ▼
            [API Gateway Cluster (Envoy / Kong / Apisix)]
           ├── Authentication (JWT signature validation / API key lookup)
           ├── Distributed Rate Limiting (Redis Token Bucket)
           ├── Request Validation & Schema Enforcement
           ├── Telemetry & Distributed Tracing (OpenTelemetry traceparent injection)
           └── Dynamic Service Discovery & Routing
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
[Auth Service]         [Order Service]          [Product Catalog Service]
 (Stateless fleet)      (Stateless fleet)        (Stateless fleet)
        │                        │                        │
        │                  ┌─────┴──────────┐             │
        │                  ▼                ▼             ▼
  [Auth DB]          [Redis Cluster]   [Message Queue] [Redis Cache]
(PostgreSQL)         (Locks/Idemp)    (Kafka/RabbitMQ) (Cache-Aside)
                           │                │             │
                           ▼                ▼             ▼
                      [Primary DB]    [Async Workers]  [Read Replicas]
                      (PostgreSQL)    (Invoices/Emails)(Elasticsearch)
```

### Component Walkthrough

1. **Global Anycast DNS & Edge CDN (Cloudflare / CloudFront):** Routes client requests to the nearest edge Point of Presence (PoP). Edge caches intercept public reads with HTTP headers (`Cache-Control`, `ETags`), answering up to 60-70% of read traffic without touching backend data centers. The integrated Web Application Firewall (WAF) mitigates SQL injection, XSS, and volumetric Layer 7 DDoS attacks.
2. **Layer 4 Load Balancer (AWS NLB):** Operates at the transport layer (TCP). It terminates no HTTP connections; it routes raw IP packets with microsecond latency, distributing millions of concurrent TCP streams across multiple availability zones.
3. **Layer 7 Load Balancer & Ingress (Envoy / ALB):** Operates at the application layer. Terminates TLS, negotiates HTTP/2 and HTTP/3 multiplexing, and forwards decrypted HTTP traffic to the API Gateway.
4. **API Gateway Fleet (Envoy / Kong):** The single ingress control plane. It validates auth tokens (JWTs) locally using public keys, checks distributed rate limits in Redis, validates request JSON schemas, injects W3C `traceparent` headers for distributed tracing, and routes requests to downstream microservices.
5. **Stateless Service Fleet:** Containerized application services (e.g., Node.js, Go, Java) orchestrated by Kubernetes. Horizontal Pod Autoscalers (HPA) scale pods dynamically based on CPU utilization and incoming HTTP request queue depth.
6. **In-Memory Cache & Locking Tier (Redis Cluster):** Stores distributed locks for idempotency keys, rate limit sliding window counters, and cached domain entities using the cache-aside pattern.
7. **Persistence Tier (Relational & Search Stores):** Primary transactional database (e.g., PostgreSQL with Aurora Multi-AZ) for ACID-compliant writes, paired with asynchronous read replicas and specialized read engines (e.g., Elasticsearch for full-text search).
8. **Asynchronous Message Broker & Workers (Kafka / SQS):** Decouples write operations from slow side effects (sending email receipts, running fraud analysis, updating search indexes).

---

## 4. Key Technical Decisions — With Real Tradeoffs

### Decision 1: API Gateway Architecture (Envoy/Kong vs In-App Monolithic Middleware)

- **Choice:** Dedicated API Gateway cluster (Envoy / Kong) acting as the single front door.
- **Alternative Considered:** Implementing auth, rate limiting, and telemetry inside each microservice via shared library code.
- **Tradeoff Analysis:**
  - *Why this choice:* Eliminates code duplication across polyglot microservices. Heavy operations like TLS termination, JWT public-key cryptography, and IP rate limiting happen before requests hit application runtimes.
  - *What we give up:* Adds an additional network hop (~1-2ms). The gateway cluster becomes a critical operational component that requires dedicated monitoring and configuration management.

### Decision 2: Layer 4 vs Layer 7 Load Balancing Split

- **Choice:** Two-tier load balancing — L4 (NLB) facing the public internet, passing traffic to L7 (ALB / Envoy) in private subnets.
- **Alternative Considered:** Routing internet traffic directly to an L7 load balancer.
- **Tradeoff Analysis:**
  - *Why this choice:* L4 provides massive throughput (millions of concurrent TCP connections) with static Anycast IP anchoring and zero TLS decryption CPU overhead. L7 provides intelligent content-based routing (e.g., `/v1/orders` vs `/v1/catalog`), header rewriting, and gRPC/HTTP2 multiplexing.
  - *What we give up:* Slight increase in infrastructure cost and configuration complexity.

### Decision 3: Stateless Service Architecture (Twelve-Factor App Compliance)

- **Choice:** Strict share-nothing stateless service processes.
- **Alternative Considered:** Storing user session states in memory on individual API server instances with sticky sessions on the load balancer.
- **Tradeoff Analysis:**
  - *Why this choice:* Any instance can die or be replaced instantly without losing user state. Deployments can occur continuously with zero downtime using canary or rolling update strategies.
  - *What we give up:* Services must fetch user metadata or session tokens from Redis or decrypt self-contained JWTs on every request, adding a minor cache lookup overhead (< 1ms).

### Decision 4: API Versioning Strategy (URI Path vs Header vs Query Parameter)

- **Choice:** URI Path Versioning (`/v1/resource`) for major contract-breaking changes, combined with strict additive evolution for non-breaking changes.
- **Alternative Considered:** Header versioning (`Accept: application/vnd.company.v1+json`) or Query parameters (`/orders?version=1`).
- **Tradeoff Analysis:**
  - *Why this choice:* URI versioning is explicit, transparent in server access logs, easily cached across CDNs and intermediate proxies, and simple for third-party developers to test in browsers/cURL.
  - *What we give up:* Purist REST compliance (a URI theoretically identifies a resource, not a schema representation). However, in production engineering, operational clarity and CDN compatibility outweigh theoretical purity.

---

## 5. Deep Dives — The Parts That Actually Matter

### Deep Dive 1: Multi-Layer Caching & HTTP Conditional Requests

A high-scale REST API must never query the database if the data has not changed. We implement a three-tier caching hierarchy:

```txt
Client Request ──▶ [Tier 1: Edge CDN] ──▶ [Tier 2: API Gateway / App Redis] ──▶ [Tier 3: Database]
                   (TTL: 60s, ETag)       (Cache-Aside, Redis Cluster)           (Source of Truth)
```

#### 1. Edge & Browser Caching via HTTP Headers
For public or semi-static resources (e.g., product catalog items), the API emits precise cache directives:

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=30
ETag: W/"d41d8cd98f00b204e9800998ecf8427e"
```

- `max-age=60`: Browser caches the response for 60 seconds.
- `s-maxage=300`: Shared CDN edge caches hold the response for 5 minutes.
- `stale-while-revalidate=30`: When the CDN cache expires, it serves the stale cached response immediately to the client while asynchronously fetching fresh data from the origin backend.

#### 2. Conditional Requests (`ETag` / `If-None-Match`)
When a client needs to revalidate its local cache, it sends the stored entity tag:

```http
GET /v1/products/item_9876 HTTP/1.1
Host: api.platform.com
If-None-Match: W/"d41d8cd98f00b204e9800998ecf8427e"
```

If the resource hash has not changed, the server immediately returns:
```http
HTTP/1.1 304 Not Modified
```
This payload has zero body, saving network bandwidth, serialization CPU, and database pressure.

#### 3. Application-Level Cache-Aside Pattern
For authenticated, personalized reads, the application fleet uses Redis with deterministic key namespacing:

```typescript
// Production Cache-Aside Implementation with Jitter
async function getProductById(productId: string): Promise<Product> {
  const cacheKey = `product:v1:${productId}`;

  // 1. Check in-memory / distributed cache
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // 2. Cache Miss: Query Database
  const product = await db.products.findUnique({ where: { id: productId } });
  if (!product) {
    // Cache null with short TTL (60s) to prevent Cache Penetration attacks
    await redisClient.set(cacheKey, JSON.stringify(null), 'EX', 60);
    throw new NotFoundError(`Product ${productId} not found`);
  }

  // 3. Populate Cache with TTL + Random Jitter (prevents Cache Stampede)
  const baseTTL = 3600; // 1 hour
  const jitter = Math.floor(Math.random() * 300); // 0-300 seconds
  await redisClient.set(cacheKey, JSON.stringify(product), 'EX', baseTTL + jitter);

  return product;
}
```

---

### Deep Dive 2: Distributed Idempotency Keys for Mutation Endpoints

In an unreliable distributed network, `POST /v1/orders` requests can time out even after the database successfully commits the transaction. If the mobile client retries the request, the user could be billed twice.

To guarantee **exactly-once processing semantics**, every mutation endpoint requires an `Idempotency-Key` header (usually a client-generated UUIDv4).

```txt
Client (POST /orders with Idempotency-Key: "uuid-123")
   │
   ▼
[API Server / Middleware]
   │
   ├──▶ Check Redis for Key: "idemp:uuid-123"
   │      │
   │      ├── [Case A: Key exists & Status = "COMPLETED"]
   │      │     └── Immediately return cached HTTP status & body (e.g. 201 Created)
   │      │
   │      ├── [Case B: Key exists & Status = "IN_PROGRESS"]
   │      │     └── Return 409 Conflict ("Request currently processing. Please retry.")
   │      │
   │      └── [Case C: Key does not exist]
   │            └── Atomically acquire lock (SETNX) with status "IN_PROGRESS" (TTL: 120s)
   │
   ├──▶ Execute Database Transaction & Payment
   │
   └──▶ Atomically update Redis key to Status = "COMPLETED", store response payload (TTL: 24h)
```

#### Production-Grade Idempotency Middleware

```typescript
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

interface IdempotencyRecord {
  status: 'IN_PROGRESS' | 'COMPLETED';
  statusCode?: number;
  body?: any;
}

export function idempotencyMiddleware(redis: Redis) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only enforce idempotency on mutation endpoints
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      return next(); // Or return 400 Bad Request if mandatory for financial APIs
    }

    const redisKey = `idemp:${req.user?.id || 'anon'}:${idempotencyKey}`;

    // Atomic acquisition using SET key value NX EX
    // NX = Only set if key does not exist; EX = Auto-expire in 120s if process crashes
    const acquired = await redis.set(
      redisKey,
      JSON.stringify({ status: 'IN_PROGRESS' }),
      'EX',
      120,
      'NX'
    );

    if (!acquired) {
      // Key already exists — fetch state
      const existing = await redis.get(redisKey);
      if (!existing) {
        return res.status(500).json({ error: 'Idempotency state error' });
      }

      const record: IdempotencyRecord = JSON.parse(existing);
      if (record.status === 'IN_PROGRESS') {
        return res.status(409).json({
          code: 'CONCURRENT_REQUEST',
          message: 'A request with this idempotency key is already being processed.',
        });
      }

      // Replay stored response
      return res.status(record.statusCode!).json(record.body);
    }

    // Intercept res.json to capture response body before sending to client
    const originalJson = res.json.bind(res);
    res.json = (body: any): Response => {
      // Save completed response in Redis with a 24-hour retention TTL
      const completedRecord: IdempotencyRecord = {
        status: 'COMPLETED',
        statusCode: res.statusCode,
        body: body,
      };

      redis.set(redisKey, JSON.stringify(completedRecord), 'EX', 86400).catch(console.error);

      return originalJson(body);
    };

    next();
  };
}
```

---

### Deep Dive 3: Circuit Breakers and Bulkhead Isolation

When a downstream service slows down or crashes, upstream services must fail fast rather than exhausting thread pools waiting on socket read timeouts.

```txt
                 ┌──────────────────────────────────────────────┐
                 │                                              │
                 ▼                                              │
         ┌──────────────┐   Failure rate > 50%   ┌────────────┐ │ Recovery verified
         │    CLOSED    │ ─────────────────────▶ │    OPEN    │ │ (Success > 95%)
         │ (Normal Ops) │                        │(Fail Fast) │ │
         └──────────────┘                        └────────────┘ │
                 ▲                                      │       │
                 │              Wait cooldown (15s)     │       │
                 │                                      ▼       │
                 │                              ┌───────────────┴──┐
                 └───────────────────────────── │    HALF-OPEN     │
                                                │ (Trial Requests) │
                                                └──────────────────┘
```

#### 1. Circuit Breaker State Machine (Resilience4j / Hystrix Pattern)
- **Closed State:** Normal operation. Requests pass through to downstream dependencies. Rolling error rates and latencies are measured in a sliding time window (e.g., last 100 requests).
- **Open State:** If the failure rate exceeds the threshold (e.g., > 50% errors or p99 latency > 2000ms), the circuit trips to `OPEN`. All incoming requests fail immediately with an instant HTTP `503 Service Unavailable` or a cached fallback response without making any network calls.
- **Half-Open State:** After a cooldown sleep window (e.g., 15 seconds), the breaker lets a limited number of trial requests through (e.g., 10 requests). If they succeed, the breaker resets to `CLOSED`. If any fail, it trips back to `OPEN`.

#### 2. Bulkhead Isolation
Named after the watertight compartments in ships: if one section floods, the ship does not sink.

In API design, we allocate **dedicated connection pools and execution threads per dependency**:
- Payment Service Pool: Max 20 concurrent connections.
- Recommendation Service Pool: Max 10 concurrent connections.
- Order Service Pool: Max 50 concurrent connections.

If the Recommendation service hangs, it can only exhaust its 10 allocated connections. It cannot starve the Payment or Order pools, ensuring critical revenue paths remain 100% operational.

---

### Deep Dive 4: Backward Compatibility and Contract Evolution

Mobile apps live in the wild for months or years without updating. Breaking an API contract is catastrophic.

#### 1. Strict Contract Invariants
- **Additive Changes Only:** You may add new fields to a response payload, but you must NEVER delete an existing field, rename a field, or change its data type (e.g., changing `price: 49.99` to `price: { amount: 4999, currency: "USD" }`).
- **Tolerant Reader Pattern:** Client parsers must ignore unknown JSON fields instead of throwing deserialization errors.
- **Optional Request Fields:** Any new request parameters introduced in a live version must be marked optional with safe server-side default values.

#### 2. Deprecation Lifecycle via Standard RFC Headers
When an endpoint or version must be retired, communicate the deprecation transparently via HTTP standard headers (RFC 8594):

```http
HTTP/1.1 200 OK
Content-Type: application/json
Deprecation: @1735689600
Sunset: Wed, 01 Jul 2026 00:00:00 GMT
Link: <https://api.platform.com/docs/v2-migration>; rel="sunset"
```

Monitoring tools scrape these headers to alert API teams which legacy client user-agents are still calling deprecated routes before physical decommission.

---

## 6. Failure Modes and Resilience

| Failure Scenario | Immediate Impact on System | Root Cause | Engineering Defense & Recovery |
| :--- | :--- | :--- | :--- |
| **Cache Stampede (Thundering Herd)** | Database CPU spikes to 100%, connection pool exhausted, cascading timeouts. | A high-traffic cache key (e.g., homepage banner) expires simultaneously across all nodes under 50k RPS. | **1. Probabilistic Early Expiration (XFetch)**.<br>**2. Single-flight Mutex Locking:** First worker acquires lock to recompute; all other concurrent requests wait or read stale data (`stale-while-revalidate`).<br>**3. TTL Jitter:** Add random variance (±10%) to all cache TTLs. |
| **Cascading Slow Dependency Collapse** | Upstream API Gateway threads become exhausted; entire API returns HTTP 504. | Downstream service latency degrades; callers block indefinitely without timeouts. | **1. Strict Socket & Connection Timeouts:** Hard cap at 200ms.<br>**2. Circuit Breakers:** Trip open at 50% error rate.<br>**3. Bulkhead Pools:** Isolate connection limits per downstream service. |
| **Poison Pill Request** | Worker processes crash in a continuous restart loop (CrashLoopBackOff). | A malformed or maliciously nested JSON payload triggers quadratic regex backtracking (ReDoS) or memory exhaustion during JSON parsing. | **1. Request Payload Size Limits:** Enforce `client_max_body_size = 2MB` at gateway.<br>**2. Schema Validation at Ingress:** Validate against strict OpenAPI schemas before passing to compute nodes.<br>**3. Process Sandboxing:** Run workers in memory-capped cgroups. |
| **Redis Cluster Partition / Outage** | Rate limiters and caches fail; inability to verify auth or throttle traffic. | Network split or node crash in the caching tier. | **1. Fail-Open Strategy:** If Redis times out (>20ms), bypass the rate limiter, log an alert, and allow the request through.<br>**2. Multi-AZ Redis Sentinel / Replication:** Automatic failover within 5 seconds. |

---

## 7. What Makes a Great Answer vs an Average One

### The Average Answer
- Draws a standard 3-box diagram: `Client -> Load Balancer -> Server -> Database`.
- Says "I would use an API gateway and Redis for caching" without explaining *what* is cached, *how* invalidation works, or *what happens when Redis crashes*.
- Ignores network unreliability, assuming all `POST` requests succeed on the first try.
- Suggests updating database schemas directly without considering legacy mobile app versions.
- Treats microservice dependencies as 100% reliable.

### The Great Answer
- **Articulates Network-Aware API Invariants:** Explains distributed idempotency keys (`SETNX` locks in Redis) to guarantee safe retries for payment mutations.
- **Distinguishes L4 vs L7 Ingress:** Clarifies why Layer 4 NLBs handle raw TCP packet volume and Anycast IPs, while Layer 7 proxies handle TLS termination, HTTP/2 multiplexing, and path routing.
- **Deep Knowledge of HTTP Semantics:** Leverages conditional revalidation (`ETag` / `If-None-Match`), `Cache-Control` directives (`s-maxage`, `stale-while-revalidate`), and standard deprecation headers (`Sunset`).
- **Defensive Engineering & Blast Radius Control:** Implements Circuit Breakers, Bulkheads, and Fallbacks so a failing recommendation service cannot bring down checkout.
- **Real-World Client Empathy:** Explains why mobile clients demand additive backward compatibility and why breaking changes require strict multi-year migration lifecycles.

---

## 8. 🧠 The Memory Hook

> **"Stateless in the middle, defensive at the edge, isolated at the bottom."**
>
> Keep your compute fleet 100% stateless so it scales horizontally on command. Let the edge filter traffic hygiene, terminate TLS, and absorb cached reads. Protect your databases and downstream services with circuit breakers, bulkheads, and idempotency locks so one failing dependency never sinks the entire fleet.
