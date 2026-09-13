# Design a Distributed Rate Limiter

## 1. Understand the Problem First — Clarify Before Designing

Imagine a third-party developer integrates with your e-commerce platform, writes a buggy retry loop in their webhook consumer, and accidentally fires 150,000 requests per second against your `/v1/checkout` endpoint. Or consider a competitor running a distributed scraping botnet across tens of thousands of residential proxies to pull your entire pricing catalog every hour. Or a free-tier user discovering an unmetered AI completion route and generating a $50,000 GPU cloud bill over a single weekend.

Without a rate limiter, your database connection pool exhausts in seconds, thread pools starve, cascading timeouts take down unrelated microservices, and paying customers get `504 Gateway Timeout` errors. A rate limiter is the defensive shield that enforces fair usage, shields downstream infrastructure from saturation, and protects API monetization tiers.

Before sketching boxes or choosing databases on a whiteboard, a senior engineer always pauses to establish concrete constraints through clarifying questions:

- **What identity are we rate limiting on?** Are we limiting by IP address (essential for unauthenticated endpoints, DDoS mitigation, and scrapers), authenticated User ID or API Key (essential for multi-device users and paid tenant tiers), or a composite key such as `{UserID, Endpoint}`?
- **What is the traffic scale and latency budget?** If we are designing for 100 million active users processing 100,000 requests per second at peak, every rate-limiting check sits directly on the critical request path. The evaluation must complete in under 2 to 5 milliseconds without becoming a single-point-of-failure bottleneck.
- **What rate limiting rules and granularity do we need?** Are rules static (e.g., 100 requests per minute) or dynamic and tiered (e.g., Free Tier: 60 req/min, Enterprise Tier: 10,000 req/min with burst allowances)? Are there global limits or route-specific limits (e.g., `/auth/login` allowing 5 attempts per minute versus `/search` allowing 50 per second)?
- **What is our consistency versus availability tradeoff?** In the event of a cache outage or network partition, should the system fail open (allow requests through to protect user experience) or fail closed (block requests to protect vulnerable backend databases)? Is soft 99.9% throttling accuracy acceptable, or do we require hard mathematical financial-grade enforcement?
- **Where does enforcement live?** Is this an edge-layer reverse proxy plugin (Envoy/Cloudflare), an API gateway middleware, or a localized library embedded in application services?

## 2. The Core Insight — The Decision Everything Else Flows From

The fundamental engineering challenge of a distributed rate limiter is not counting numbers. It is solving the **atomic state coordination problem at microsecond latency across stateless servers**.

In a production environment, hundreds of stateless API gateways handle incoming traffic behind a round-robin load balancer. If User A has a limit of 100 requests per minute and fires 50 concurrent requests that land simultaneously across 50 different gateway instances, no individual gateway can make an isolated decision based on local memory without under-counting by a factor of 50. Conversely, if all 50 gateways attempt to synchronize state by querying a traditional relational database with transactions and row locks, the database will instantly lock up and collapse under the overhead of locking writes on every single incoming HTTP request.

Everything in a distributed rate limiter flows from the decision of how and where to maintain shared counter state:

1. **Centralized In-Memory Store with Atomic Primitives:** We store counter states in an ultra-fast in-memory data store (Redis Cluster) and execute updates using atomic operations (Redis Lua scripts). This ensures all distributed gateways evaluate against the exact same real-time counter in a single network round-trip (< 2ms) without race conditions.
2. **Passive Mathematical Replenishment over Background Timers:** Instead of running millions of active cron jobs or background threads to "refill" tokens or reset windows for idle users, we calculate token replenishment on-demand on each incoming request using timestamp deltas (`elapsed_time * refill_rate`). This reduces CPU overhead to $O(1)$ and storage to just two numbers per tracked entity.

## 3. High-Level Architecture — Components and Why Each Exists

To handle high-throughput traffic with minimal latency overhead, the system separates rule configuration, real-time enforcement, atomic counter storage, and asynchronous telemetry.

```txt
Client Request (with API Key / Auth Token / IP)
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  API Gateway / Envoy Reverse Proxy (Enforcement Layer)      │
│  - Extracts Rate Limit Key (e.g. `rl:user_981:tier_pro`)    │
│  - Reads Cached Rule Schema (Local In-Memory Cache)         │
└──────────────┬───────────────────────────────┬──────────────┘
               │ (1) Atomic Lua Script Check   │ (2) Periodic Rule Sync
               ▼                               ▼
    ┌──────────────────────┐         ┌────────────────────────┐
    │ Redis Cluster (RAM)  │         │ Rule Store / Config DB │
    │ - In-Memory Counters │         │ (etcd / PostgreSQL)    │
    │ - Sub-2ms Evaluation │         └────────────────────────┘
    └──────────┬───────────┘
               │ Returns: [allowed (0/1), remaining, reset_epoch]
               ▼
     Is Request Allowed?
     ├── NO  ──► Return HTTP 429 Too Many Requests
     │           Headers: `Retry-After: 12`, `RateLimit-Remaining: 0`
     │           Async Telemetry Event to Kafka / Prometheus
     │
     └── YES ──► Add Headers: `RateLimit-Remaining: 42`
                 Forward Request to Downstream Microservices
                 (Auth Service, Billing, Product Catalog, DB)
```

Each component has a strictly defined responsibility:

- **Client / Application:** Sends standard authentication headers (`Authorization: Bearer <token>` or `X-API-Key`) and inspects standardized HTTP response headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`) to implement exponential backoff and client-side pacing.
- **Enforcement Layer (API Gateway / Reverse Proxy):** Sits at the edge (e.g., Envoy, Kong, or Nginx). It intercepts every incoming HTTP request before it reaches backend services, extracts the client identifier, looks up the active rate-limiting policy from local memory, and queries the counter layer.
- **Rule Configuration Store:** A persistent database (such as PostgreSQL or etcd) storing tenant tiers, route limits, and whitelist/blacklist policies. Gateways subscribe to change events or poll every 30 seconds to keep local rule definitions cached in gateway RAM.
- **Distributed In-Memory Cache (Redis Cluster):** The high-speed state backend. It maintains the real-time token counts, sliding logs, or counters in memory, distributed across shards using consistent hashing on the rate limit key.
- **Asynchronous Analytics Pipeline (Kafka / Prometheus / Grafana):** Emits rate-limiting metrics (allowed requests, dropped requests, top throttled keys) asynchronously without blocking the request pipeline. Feeds security dashboards for bot detection and capacity planning.

Here is the exact lifecycle of a request:

1. A request hits the API Gateway.
2. The gateway extracts the identity key (e.g., `user:8492` or `ip:198.51.100.24`) and matches the requested route against cached routing rules (e.g., `POST /v1/payments` allows max 10 requests per minute).
3. The gateway issues an atomic evaluation command to Redis via a pre-compiled Lua script passing the key, bucket capacity, refill rate, and current epoch timestamp.
4. Redis computes the updated state, writes the new value, refreshes the key TTL, and returns three values: `[is_allowed, remaining_tokens, reset_epoch_timestamp]`.
5. If `is_allowed == 1`: The gateway attaches `RateLimit-Remaining` and `RateLimit-Limit` headers to the request, forwards it to the payment microservice, and returns the response to the client.
6. If `is_allowed == 0`: The gateway immediately terminates the request, returns `HTTP 429 Too Many Requests` with a `Retry-After: <seconds>` header, and emits a drop metric. The payment microservice never executes.

## 4. Key Technical Decisions — With Real Tradeoffs

Choosing the right rate limiting algorithm and storage pattern requires evaluating memory footprint, computational complexity, burst tolerance, and boundary accuracy.

**Algorithm 1: Token Bucket**
- **Mechanic:** A bucket holds up to $B$ tokens. Tokens refill continuously at a rate of $r$ tokens per second. Each request consumes 1 token. If the bucket has tokens, the request passes; if empty, it drops.
- **Memory Footprint:** Extremely small. Only 2 fields per tracked entity: `last_refill_timestamp` (8 bytes) and `token_count` (4 bytes). Total memory per user is under 32 bytes in Redis.
- **Pros:** Handles bursts gracefully up to bucket capacity $B$ while maintaining an average long-term rate of $r$. Computation is $O(1)$.
- **Cons:** Parameter tuning requires careful thought ($B$ vs $r$). Does not guarantee perfectly smooth inter-request spacing.
- **Best Used For:** General-purpose REST APIs, user-tier quotas (e.g., Stripe, AWS, GitHub).

**Algorithm 2: Leaky Bucket (Traffic Shaping)**
- **Mechanic:** Requests drop into a FIFO queue of capacity $B$. Requests leak out of the queue and are processed by downstream services at a constant, fixed rate $r$. If the queue is full, new requests overflow and drop.
- **Memory Footprint:** $O(B)$ if storing actual queued request payloads, or $O(1)$ if tracking queue depth counters.
- **Pros:** Smooths out bursts into a perfectly flat, predictable stream of downstream traffic. Prevents shock loads on fragile backend databases.
- **Cons:** Introduces latency for bursty requests waiting in the queue. Fresh requests may be delayed even if downstream servers currently have idle CPU capacity.
- **Best Used For:** E-commerce checkout processing, asynchronous background job dispatching, third-party webhook delivery.

**Algorithm 3: Fixed Window Counter**
- **Mechanic:** Time is sliced into fixed windows (e.g., 12:00:00–12:01:00, 12:01:00–12:02:00). A counter increments per request and resets at the boundary.
- **Memory Footprint:** 1 integer counter per window (~8 bytes).
- **Pros:** Ultra-simple, $O(1)$ `INCR` in Redis with an `EXPIRE` equal to window duration.
- **Cons:** The "Boundary Double-Burst Vulnerability". If the limit is 100 req/min, a malicious client can send 100 requests at 12:00:59 and another 100 requests at 12:01:01. In that 2-second rolling span, 200 requests pass through, completely defeating the 100 req/min limit and doubling load on downstream systems.
- **Best Used For:** Low-risk, coarse-grained daily or monthly reset quotas where boundary spikes do not threaten server health.

**Algorithm 4: Sliding Window Log**
- **Mechanic:** Keeps a timestamped log of every request inside a Redis Sorted Set (`ZSET`). When a request arrives, remove all timestamps older than `(now - window_size)` with `ZREMRANGEBYSCORE`, check `ZCARD`, and append `now` with `ZADD` if under capacity.
- **Memory Footprint:** $O(N)$ where $N$ is the number of requests in the window. Storing 1,000 requests in a window takes ~16 KB per user. For 10 million active users, this demands hundreds of gigabytes of expensive RAM.
- **Pros:** 100% mathematically exact rate limiting. Zero boundary burst vulnerabilities.
- **Cons:** Catastrophic memory explosion at high scale. Expensive Redis write operations ($O(\log N)$) on every single request.
- **Best Used For:** Critical high-security operations with small request volumes (e.g., credit card transaction authorizations, password reset triggers).

**Algorithm 5: Sliding Window Counter (Approximation)**
- **Mechanic:** Combines the counter of the previous fixed window with the counter of the current fixed window using a weighted formula based on the current time position:
  $$\text{Estimated Requests} = \text{Current Window Count} + \left(\text{Previous Window Count} \times \left(1 - \frac{\text{Elapsed Time in Current Window}}{\text{Window Size}}\right)\right)$$
- **Memory Footprint:** Only 2 integer counters per key (~16 bytes total).
- **Pros:** Eliminates the boundary double-burst problem while consuming negligible memory. $O(1)$ runtime complexity. Assuming traffic in the previous window was evenly distributed, error rate is below 0.05% in practice.
- **Cons:** Assumes uniform request distribution across the previous window, which is an approximation rather than an exact historical replay.
- **Best Used For:** High-throughput public API platforms (Cloudflare, Cloud Endpoints) balancing precision and RAM cost.

| Algorithm | Time Complexity | Memory per Key | Handles Bursts? | Boundary Safe? | Implementation Complexity |
|:---|:---|:---|:---|:---|:---|
| **Token Bucket** | $O(1)$ | ~30 Bytes | Yes (up to bucket $B$) | Yes | Low (Lua script) |
| **Leaky Bucket** | $O(1)$ | ~30 Bytes | No (shapes to fixed rate) | Yes | Medium |
| **Fixed Window** | $O(1)$ | ~8 Bytes | Yes (uncontrolled) | **No (2x burst)** | Very Low |
| **Sliding Log** | $O(\log N)$ | $O(N)$ (KB per key) | Yes | Yes (Exact) | High (ZSET management) |
| **Sliding Counter** | $O(1)$ | ~16 Bytes | Smoothed | Yes (99.9% accurate) | Low |

## 5. Deep Dives — The Parts That Actually Matter

**Deep Dive 1: Atomic Concurrency and the Redis Lua Token Bucket**

A common production disaster occurs when engineers write rate-limiting logic across separate application calls:

```txt
1. count = redis.get(key)
2. if count > limit: return 429
3. redis.set(key, count + 1)
```

Under concurrent load, two requests arrive at Gateway 1 and Gateway 2 at the exact same millisecond when `count = 99` (limit 100). Both execute step 1 and read `99`. Both pass step 2. Both execute step 3 and write `100`. In total, 101 requests passed. At 10,000 concurrent requests, limits are routinely overshot by 300%.

We eliminate race conditions by running an atomic Lua script directly inside the single-threaded Redis execution engine. The script below calculates token replenishment on the fly without background timers:

```lua
-- KEYS[1]: Rate limit key (e.g., "rl:user:1029:checkout")
-- ARGV[1]: Bucket Capacity (max tokens, e.g., 100)
-- ARGV[2]: Refill Rate (tokens per millisecond, e.g., 0.00166 for 100/min)
-- ARGV[3]: Current Timestamp (epoch milliseconds)
-- ARGV[4]: Requested Tokens (usually 1)

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

-- Fetch current bucket state: [tokens, last_updated_time]
local data = redis.call("HMGET", key, "tokens", "last_updated")
local tokens = tonumber(data[1])
local last_updated = tonumber(data[2])

if tokens == nil then
    -- First time seeing this key: initialize to full capacity
    tokens = capacity
    last_updated = now
else
    -- Compute replenished tokens based on elapsed wall-clock time
    local elapsed = math.max(0, now - last_updated)
    local generated_tokens = elapsed * refill_rate
    tokens = math.min(capacity, tokens + generated_tokens)
    last_updated = now
end

-- Check if enough tokens exist
if tokens >= requested then
    tokens = tokens - requested
    -- Save state and set a TTL (e.g. 2x the time it takes to fill from empty to save RAM)
    local ttl_seconds = math.ceil((capacity / (refill_rate * 1000)) * 2)
    redis.call("HMSET", key, "tokens", tokens, "last_updated", last_updated)
    redis.call("EXPIRE", key, math.max(60, ttl_seconds))
    
    -- Return [allowed (1), remaining_tokens, reset_ms]
    local reset_ms = math.ceil((capacity - tokens) / refill_rate)
    return {1, math.floor(tokens), reset_ms}
else
    -- Request denied
    local reset_ms = math.ceil((requested - tokens) / refill_rate)
    return {0, math.floor(tokens), reset_ms}
end
```

Because Redis executes this script atomically, no two requests can interleave. The state read, math calculation, token deduction, and hash update occur in a single execution step taking under 0.5ms.

**Deep Dive 2: Multi-Region Scale and Local Batch Synchronization**

When your application runs across multiple geographic regions (e.g., `us-east`, `eu-central`, `ap-southeast`), querying a single global Redis cluster introduces cross-ocean network latency (100–200ms round trips), completely destroying API response times.

We solve this with one of two architectures based on strictness requirements:

```txt
┌───────────────────────── US-EAST ─────────────────────────┐
│ Gateway Node A               Gateway Node B               │
│ [Local Token Cache: 20]      [Local Token Cache: 15]      │
│         │                             │                   │
│         ▼                             ▼                   │
│   Local In-Memory               Local In-Memory           │
│   Deduction (0ms)               Deduction (0ms)           │
│         │                             │                   │
│         └──────────────┬──────────────┘                   │
│                        │ Async Batch Sync (every 500ms)   │
│                        ▼                                  │
│             Regional Redis Cluster                        │
└────────────────────────┬──────────────────────────────────┘
                         │ Asynchronous Periodic Token Rebalancing
                         ▼
┌───────────────────────── EU-WEST ─────────────────────────┐
│             Regional Redis Cluster                        │
└───────────────────────────────────────────────────────────┘
```

1. **Geo-Partitioning by User Identity (Deterministic Routing):** If a user's requests are consistently routed to their home region via Anycast DNS, rate limits are stored purely in that region's local Redis cluster. Zero cross-region calls needed.
2. **Local Token Batch Leasing (Hybrid Edge-Central):** For globally active users, the gateway does not call Redis on every request. Instead, each local gateway node requests a batch lease of tokens (e.g., 50 tokens) from the regional Redis. The gateway fulfills requests locally in 0ms out of its thread-safe memory bucket. When its local balance falls below 10 tokens, it asynchronously requests another batch lease. If a gateway crashes, at most 50 leased tokens are lost, preserving safety while eliminating network overhead on 95% of requests.

**Deep Dive 3: The HTTP Client Contract and Header Standards**

A rate limiter must actively communicate state so well-behaved clients can self-throttle before triggering errors. The IETF standard headers must be returned on every response:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 1718928345
Retry-After: 15

{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Quota of 100 requests per minute exceeded. Please retry after 15 seconds.",
    "retry_after_seconds": 15
  }
}
```

- `RateLimit-Limit`: Maximum requests permitted in the configured time window.
- `RateLimit-Remaining`: Number of available requests left in the current window.
- `RateLimit-Reset`: Unix epoch timestamp (in seconds) when the full quota resets.
- `Retry-After`: Number of seconds the client must wait before making another request (essential for automated retry handlers).

On the client side, robust SDKs must implement **Exponential Backoff with Full Jitter** to prevent a "thundering herd" from hammering the server the exact second `Retry-After` elapses:

$$\text{Sleep Time} = \text{random}(0, \; \min(\text{MaxBackoff}, \; \text{BaseInterval} \times 2^{\text{attempt}}))$$

## 6. Failure Modes and Resilience

When operating a rate limiter at scale, the rate limiter itself must never become the cause of a total system outage.

- **Failure Mode 1: Redis Cluster Outage or Network Partition**
  - *Risk:* Redis nodes crash, memory saturates, or a network partition isolates the API gateways from Redis.
  - *Mitigation:* The API Gateway wraps all Redis calls in a **Circuit Breaker** with a strict 5ms timeout. If calls timeout or fail repeatedly, the breaker trips.
  - *Decision: Fail-Open vs Fail-Closed:*
    - **Fail-Open (Standard Choice):** Allow traffic through to downstream services unmetered. Recommended for user-facing consumer web applications (e.g., social feeds, video streaming) where degraded rate protection is far better than showing a broken white screen to 100% of legitimate users.
    - **Fail-Closed (Security Choice):** Reject incoming traffic with `503 Service Unavailable` or `429 Too Many Requests`. Mandatory for expensive pay-per-call AI inference routes, banking transaction endpoints, and `/login` authentication endpoints where letting unmetered traffic through allows credential stuffing or bankrupting GPU bills.
- **Failure Mode 2: The Hot-Key Sharding Imbalance in Redis**
  - *Risk:* An enterprise client or a viral scraper sends 50,000 requests per second under a single identifier (`rl:tenant:uber`). In a Redis Cluster using consistent hashing (`CRC16(key) mod 16384`), that single key maps to one specific shard. That shard's single CPU core hits 100% utilization, causing latency spikes for all other users sharing that shard.
  - *Mitigation:* Apply **Sub-Key Salt Sharding**. Instead of a single key, split the counter across $N$ sub-keys:
    $$\text{SubKey} = \text{"rl:tenant:uber:"} + \text{hash}(\text{request\_id}) \pmod N$$
    The allowed limit on each sub-key is configured to $\frac{\text{Total Limit}}{N}$. Requests randomly hash across the $N$ sub-keys, distributing the write load evenly across all Redis shards in the cluster.
- **Failure Mode 3: Clock Skew Across Distributed Application Servers**
  - *Risk:* If individual API gateway servers have drifting system clocks (NTP drift), calculations for sliding windows or token replenishment will evaluate inconsistently, causing premature drops or quota leaks.
  - *Mitigation:* Never rely on the application server's local operating system clock for rate limit math. Retrieve the authoritative time directly from Redis by calling Redis `TIME` within the Lua script or passing the centralized gateway cluster clock timestamp.
- **Failure Mode 4: Memory Exhaustion (OOM) from Abandoned Keys**
  - *Risk:* Billions of unique transient IP addresses (from botnets or web crawlers) create temporary rate limit keys in Redis. If keys lack expiration, Redis RAM fills up and crashes the instance.
  - *Mitigation:* Every Redis Lua script execution must explicitly set a short Time-To-Live (`EXPIRE`) calculated as $2\times$ the window duration whenever a key is written. Furthermore, configure the Redis eviction policy to `volatile-lru` so Redis automatically purges the least recently used keys with an expiration if memory hits 85%.

## 7. What Makes a Great Answer vs an Average One

In a system design interview, rate limiting is often perceived as a "simple" question. The interviewer uses it specifically to test whether you think like an operational systems engineer or a junior developer reciting textbook definitions.

- **Average candidates:**
  - Say "I will put a counter in Redis and increment it on every request." They completely overlook race conditions between `GET` and `SET` calls.
  - Only know the Fixed Window algorithm and fail to spot the 2x burst vulnerability at window boundaries.
  - Forget to define what happens when Redis dies, leaving the system vulnerable to total failure.
  - Assume all rate limiting happens at a single layer without distinguishing between Edge IP filtering, Gateway user throttling, and Service-level resource quotas.
  - Omit HTTP response header contracts, leaving frontend and client developers with no way to handle retries cleanly.

- **Senior candidates:**
  - Clarify the identity dimension immediately (IP vs User ID vs API Key vs Route) and define the consistency vs latency budget (< 2ms).
  - Walk through the mathematical and memory tradeoffs between **Token Bucket** and **Sliding Window Counter** with exact byte calculations.
  - Proactively write or explain an **atomic Redis Lua script** and explain why on-demand timestamp math avoids background refill threads.
  - Articulate a concrete **Fail-Open vs Fail-Closed strategy** using circuit breakers to ensure the rate limiter never takes down the entire company.
  - Address advanced distributed scaling challenges: sub-key sharding for hot tenants, multi-region token batching, and client backoff jitter.

## 8. 🧠 The Memory Hook

A rate limiter is a **water pressure valve, not a toll booth**: calculate tokens mathematically on the fly using time deltas, evaluate state inside an **atomic Redis Lua script** so distributed servers never fight over the last token, and always place a **circuit breaker** in front of your cache so a dead rate limiter never kills a live system.
