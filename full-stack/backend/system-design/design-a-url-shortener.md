# Design a URL Shortener

## 1. Understand the Problem First — Clarify Before Designing

Imagine your marketing team sends a promotional SMS campaign to 50 million customers containing a link. If the URL shortener takes 500ms to resolve or throws a 500 error under the burst, users bounce, conversion collapses, and customer support gets flooded. Long URLs break SMS character limits, wrap poorly in messaging apps, look suspicious to users, and expose internal backend routing structures.

Before sketching any architecture on the whiteboard, an experienced engineer asks targeted clarifying questions to establish scope, scale, and hard constraints:

- **What is the read-to-write ratio?** URL shorteners are overwhelmingly read-heavy. A typical enterprise system processes around 100 million new URLs created per month (~38 writes/second) but handles 10 billion redirects per month (~3,850 reads/second average, with peak traffic reaching 40,000+ reads/second). The read-to-write ratio is roughly 100:1.
- **What is the short code length and character set?** Using alphanumeric characters `[a-z, A-Z, 0-9]` gives a Base62 encoding space. A 7-character string provides $62^7 \approx 3.52\text{ trillion}$ unique combinations. At 100 million writes per month, 3.52 trillion codes will last over 2,900 years without running out of keys.
- **What are the latency and availability requirements?** Redirection must be ultra-fast: P99 latency under 20ms. High availability (99.99%) is critical because a broken short URL means a broken destination for every user clicking that link globally. Strong consistency is not required between writes and reads—if a newly created short link takes 100ms to become globally resolvable, that is acceptable, but once persisted, a mapping must never be lost.
- **Do links expire, and can users choose custom aliases?** Default links should have a configurable time-to-live (for example, 5 years), with support for custom vanity aliases (like `short.link/launch-event`) that require uniqueness validation.
- **Do we need analytics?** Yes. Businesses require click tracking, referrer domain, user agent, geolocation, and timestamps.
- **What is the storage footprint?**
  - 100 million writes/month $\times$ 12 months $\times$ 10 years = 12 billion total records.
  - Each record stores: `short_code` (7 bytes), `original_url` (average 500 bytes), `user_id` (16 bytes), `created_at` (8 bytes), and `expires_at` (8 bytes) $\approx$ 550 bytes per entry.
  - Total 10-year storage: $12\text{ billion} \times 550\text{ bytes} \approx 6.6\text{ TB}$. This is a very modest data footprint that easily fits across a standard database cluster. The primary engineering bottleneck is read throughput and low-latency lookups, not disk capacity.

## 2. The Core Insight — The Decision Everything Else Flows From

A URL shortener is fundamentally an extreme read-heavy, low-latency key-value mapping service paired with a distributed unique token generation problem.

The entire architecture flows from two core insights:

1. **Decouple the write path from the read path entirely.** The read path (redirection) is in the critical user path and must never touch a relational disk table under normal conditions. It should be resolved entirely in memory via edge CDNs and distributed caches. Analytics tracking must be completely asynchronous via event streams so counting a click never adds a single millisecond to the user's redirect latency.
2. **Eliminate write-time coordination for unique code generation.** If multiple application servers must query the database or coordinate with locks to ensure a 7-character code is unique during URL creation, writes will slow down and fail under load. Generating short codes must be collision-free and lock-free by design using a pre-allocated ID buffer or a dedicated Key Generation Service.

## 3. High-Level Architecture — Components and Why Each Exists

```txt
[Client Browser / Mobile App]
             │
             ▼
   [DNS / Anycast Routing]
             │
             ▼
   [Edge CDN (Cloudflare / CloudFront)]
             │
             │ (Cache Miss)
             ▼
   [API Gateway & Rate Limiter]
      │                      │
      │ (POST /shorten)      │ (GET /{code})
      ▼                      ▼
[Write Service]        [Redirect Service] ─── (Emit Click Event) ───► [Kafka Event Stream]
   │       ▲                 │                                                │
   │       │ Fetch Batch     ▼                                                ▼
   │   [Key Generation]  [Redis Cache Cluster]                        [Analytics Worker]
   │   [Service (KGS) ]      │                                                │
   ▼                         ▼ (Cache Miss)                                   ▼
[Primary Key-Value Store (DynamoDB / Cassandra)] ───────────────► [ClickHouse / OLAP DB]
```

### Component Breakdown

- **Edge CDN (Cloudflare / CloudFront):** Terminates TLS close to the user and serves cached redirects directly from edge locations for viral links, bypassing the origin server entirely.
- **API Gateway & Rate Limiter:** Handles authentication, validates incoming URL payloads, applies IP/token bucket rate limits to prevent spam, and routes traffic between write and redirect services.
- **Write Service:** Validates the destination URL against security blocklists, claims a pre-generated short code from the local memory buffer, persists the mapping to the database, writes the key to the cache, and returns the short URL.
- **Key Generation Service (KGS):** Generates unique Base62 short codes in advance and feeds them in sequential or random blocks to Write Service nodes. This removes collision checking from the write path.
- **Redirect Service:** The high-throughput read worker. It takes incoming short codes, queries the distributed Redis cache, falls back to the database on a cache miss, immediately issues an HTTP redirect, and drops an analytics event onto an event bus.
- **Distributed Cache (Redis Cluster):** In-memory key-value store holding the most frequently accessed `short_code -> original_url` mappings to ensure sub-millisecond lookup latency.
- **Primary Database (DynamoDB / Cassandra / Partitioned PostgreSQL):** Persistent, durable source of truth storing all URL mappings, metadata, and owner records.
- **Asynchronous Analytics Pipeline (Kafka + Analytics Workers + ClickHouse):** Decouples real-time click telemetry from the HTTP response loop. Redirect workers emit lightweight events to Kafka; consumers batch-write them to an analytical columnar store for reporting.

### Request Flow Walkthrough

**The Write Flow (Creating a Short Link):**
1. The user sends a `POST /api/v1/shorten` request with `{ "original_url": "https://example.com/very/long/path", "custom_alias": null }`.
2. The API Gateway validates the URL format, sanitizes against malicious schemes, and enforces rate limits.
3. The Write Service requests a unique 7-character token from its in-memory block (supplied by the Key Generation Service).
4. The service writes `{ short_code, original_url, user_id, created_at, expires_at }` to the primary database.
5. The service writes the mapping into the Redis cache with an active TTL.
6. The client receives `201 Created` with `{ "short_url": "https://sho.rt/aZ89kL2" }`.

**The Read Flow (Redirection):**
1. The user clicks `https://sho.rt/aZ89kL2`, triggering a `GET /aZ89kL2`.
2. The request hits the nearest CDN edge. If cached, the CDN returns an immediate redirect.
3. If not cached at the edge, the request reaches the Redirect Service through the API Gateway.
4. The Redirect Service performs an O(1) lookup in Redis. If found, it returns an HTTP `302 Found` with `Location: https://example.com/very/long/path`.
5. On a cache miss, the service queries the primary database, populates Redis asynchronously, and returns the `302 Found`.
6. Simultaneously, the Redirect Service pushes a non-blocking message to Kafka containing the click metadata `{ short_code, timestamp, ip, user_agent, referrer }`.

## 4. Key Technical Decisions — With Real Tradeoffs

### 1. Short Code Generation: Base62 vs Hashing vs Pre-Generated Keys (KGS)

- **Approach A — Hash of URL (MD5 / SHA-256) truncated to 7 characters:**
  - *How it works:* Hash the original URL, take the first 42 bits of the digest, and encode in Base62.
  - *Tradeoff:* Different long URLs can produce the exact same 7-character prefix (hash collision). To resolve collisions, the service must query the database to see if the key exists, append a salt if it does, and re-hash in a loop. Under heavy write traffic, this creates unpredictable database read amplification and latency spikes.
- **Approach B — Auto-Incrementing Counter / Snowflake ID encoded in Base62:**
  - *How it works:* A 64-bit distributed integer (such as Twitter Snowflake) is converted to Base62 (for example, ID `11157` becomes `2TX`).
  - *Tradeoff:* Zero collisions by definition. However, sequential numbers are predictable. Competitors or malicious actors can easily enumerate every URL in your database by incrementing the short code (`sho.rt/aaa1`, `sho.rt/aaa2`).
- **Approach C — Standalone Key Generation Service (KGS) with pre-generated random tokens (Chosen):**
  - *How it works:* A background worker pre-generates billions of random 7-character Base62 strings and stores them in a key-store database. When application servers start up, each server loads a batch of 5,000 keys into its local memory.
  - *Tradeoff:* Instant O(1) key assignment with zero collisions and zero write-time database coordination. If an application server crashes, the unused keys in its memory buffer are lost, but with 3.52 trillion available combinations, losing a few thousand keys is completely negligible.

### 2. HTTP 301 (Permanent) vs HTTP 302 / 307 (Temporary) Redirects

- **HTTP 301 Permanent Redirect:**
  - *Behavior:* Browsers, proxies, and intermediate CDNs cache the redirect permanently. Subsequent clicks from that user never hit your server again—the browser redirects instantly from local disk cache.
  - *Tradeoff:* Maximum reduction in origin server load and fastest possible user experience. However, because subsequent requests bypass your servers, you cannot collect accurate click analytics, track unique visitors, or modify/revoke the destination URL.
- **HTTP 302 Found / 307 Temporary Redirect (Chosen):**
  - *Behavior:* Tells the browser not to cache the redirection permanently, forcing every subsequent click to hit your server or edge infrastructure.
  - *Tradeoff:* You maintain 100% visibility over all traffic for analytics, billing, fraud prevention, and real-time link editing. The tradeoff is higher origin request volume, which is mitigated using distributed Redis caching.

### 3. Database Choice: NoSQL Key-Value vs Relational

- **Relational DB (PostgreSQL / MySQL):**
  - *Pros:* Strict ACID compliance, relational integrity for user accounts, billing, and team workspaces.
  - *Cons:* At tens of thousands of writes/second and billions of rows, horizontal scaling requires manual sharding logic based on the short code hash. Cross-shard queries and re-sharding add operational overhead.
- **Distributed NoSQL Key-Value Store (DynamoDB / Cassandra) (Chosen for URL mappings):**
  - *Pros:* The access pattern is exclusively point lookups by primary key (`short_code`). DynamoDB provides predictable single-digit millisecond latency at any scale, automatic horizontal partitioning, and built-in global replication across availability zones.
  - *Cons:* No relational JOINs. Secondary indexes for filtering by user or creation date require separate partition configurations.

### 4. Caching Strategy: The 80/20 Working Set in Redis

According to the Pareto principle, roughly 20% of shortened links generate 80% of all redirect traffic.

- **Daily read volume:** 10 billion reads/month $\approx$ 330 million reads/day.
- **Hot working set:** $330\text{ million} \times 20\% = 66\text{ million URLs}$.
- **RAM required:** $66\text{ million} \times 500\text{ bytes} \approx 33\text{ GB}$.
- A small 3-node Redis cluster with 16 GB RAM per node can hold the entire daily active working set in memory with headroom.
- **Eviction policy:** `volatile-lru` or `allkeys-lru` (Least Recently Used), automatically evicting cold links when memory fills while retaining viral links.

## 5. Deep Dives — The Parts That Actually Matter

### Deep Dive 1: Key Generation Service (KGS) Architecture

To guarantee that no two servers hand out the same short code under heavy concurrent write load, we decouple key generation from URL creation:

```txt
┌────────────────────────────────────────────────────────┐
│               Key Generation Service (KGS)             │
│  - Pre-computes random 7-character Base62 strings       │
│  - Stores in dedicated KeyDB (Two tables: Free / Used)  │
└──────────────────────────┬─────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           │ Dispatches Key Blocks         │
           ▼ (e.g., Keys 100,000-105,000)  ▼ (e.g., Keys 105,001-110,000)
┌──────────────────────┐        ┌──────────────────────┐
│ Write Server Node 1  │        │ Write Server Node 2  │
│ [Memory Buffer: 5k]  │        │ [Memory Buffer: 5k]  │
└──────────────────────┘        └──────────────────────┘
```

1. KGS maintains a database with two tables: `available_keys` and `allocated_keys`.
2. When a Write Service instance boots, it requests a block of keys (e.g., 5,000 keys) from KGS.
3. KGS marks that block as `allocated` in a single atomic transaction and hands the range to the server.
4. The Write Service serves creation requests directly from its local in-memory queue. Key assignment takes microseconds with zero database queries.
5. If the Write Service instance crashes, any remaining keys in its local 5,000-key buffer are discarded. Because our key space is 3.52 trillion, burning a few thousand keys has zero practical impact on system longevity.

### Deep Dive 2: Cache Penetration and Cache Stampede Mitigation

When running a high-throughput read system, two cache failure patterns can overwhelm the underlying database:

1. **Cache Penetration (Requests for Non-Existent Keys):**
   - *The Problem:* Attackers flood the service with millions of random, non-existent short codes (e.g., `sho.rt/zz99x1`). Because these keys do not exist in Redis, every single request bypasses the cache and hits the primary database.
   - *The Solution:* Place a **Bloom Filter** in front of Redis. The Bloom Filter is a space-efficient probabilistic data structure that stores all valid short codes. If the Bloom Filter reports that a key does not exist, the Redirect Service returns an immediate `404 Not Found` without touching Redis or DynamoDB. For any false positives that pass the filter, cache the null result (`short_code -> NULL`) in Redis with a short 60-second TTL.
2. **Cache Stampede / Thundering Herd:**
   - *The Problem:* When a viral short code expires from the cache or is evicted, thousands of concurrent requests miss the cache at the exact same millisecond and all query the database simultaneously for the same record.
   - *The Solution:* Implement **Mutex Locking (Single-Flight Pattern)** in the Redirect Service. When a cache miss occurs, only the first thread acquires a distributed lock (or local process mutex) to fetch the URL from the database and populate Redis; all other concurrent requests for that key wait for the lock or read the populated cache immediately upon release.

### Deep Dive 3: Security, Abuse Prevention, and SSRF Protection

Public URL shorteners are prime targets for malicious actors seeking to disguise phishing URLs, bypass spam filters, or launch internal attacks:

- **Server-Side Request Forgery (SSRF) Prevention:** Users might attempt to shorten internal network addresses (e.g., `http://169.254.169.254/latest/meta-data` or `http://10.0.0.1/admin`). The Write Service must perform DNS resolution on the target URL before saving it, verifying that the destination IP does not fall within private IPv4/IPv6 ranges (RFC 1918, link-local, or loopback).
- **Phishing & Malware Screening:** Integrate an asynchronous URL scanning worker with services like Google Safe Browsing API. While the initial creation succeeds, flagged URLs are immediately marked `is_malicious = true` in the database and purged from the cache. Clicking a flagged link redirects the user to a safety warning interstitial instead of the destination.
- **Link Squatting & Brute-Force Scanning:** Rate limit the `POST /shorten` endpoint using a Token Bucket algorithm per user account and IP address. For custom vanity URLs, restrict creation privileges to authenticated accounts and enforce reserved keyword blocklists (`/admin`, `/login`, `/api`).

## 6. Failure Modes and Resilience

| Failure Scenario | Immediate System Impact | Detection Mechanism | Automated Mitigation & Recovery |
| :--- | :--- | :--- | :--- |
| **Primary Database Down** | Writes fail; reads miss cache and fail. | Spiking 5xx error rate and DB health check alerts in Datadog/Prometheus. | Failover to multi-AZ read replica. 95%+ of read traffic continues operating normally from Redis cache and edge CDNs. |
| **Redis Cache Node Crash** | Cache hit ratio drops; traffic spikes on primary DB. | Redis cluster node failure alerts; DB read IOPS threshold alarm. | Redis Cluster automatically promotes a replica node to master in seconds. Circuit breakers on DB lookups shed non-critical load if DB CPU exceeds 80%. |
| **Hot Key / Viral Link Congestion** | Single Redis node CPU saturates under 100k+ RPS for one link. | Single-partition latency alerts in Redis; hotkey monitoring telemetry. | Local in-process memory cache (e.g., Go `ristretto` or Node in-memory LRU) on each redirect server with a 30-second TTL to absorb the spike before hitting Redis. |
| **KGS Service Unreachable** | Write servers cannot replenish their local key buffers when depleted. | KGS heartbeat check fails; write server key buffer capacity alert (< 20%). | Write servers maintain a 5,000-key local buffer (hours of runway). Standby KGS replica promotes via Raft/leader election before buffers run empty. |
| **Analytics Kafka Queue Lag** | Click events buffer in memory on redirect nodes; data loss risk if unhandled. | Consumer group lag monitoring in Kafka. | Redirect workers drop non-critical telemetry to a local disk buffer with backpressure rather than blocking the user's redirect response. |

## 7. What Makes a Great Answer vs an Average One

| Dimension | Average Answer | Great Senior Answer |
| :--- | :--- | :--- |
| **Requirements & Scale** | Starts drawing boxes immediately without numbers or constraints. | Calculates read/write ratios (100:1), establishes 7-character Base62 capacity ($62^7 = 3.52\text{T}$), and sizes the Redis working set (33 GB for 80/20 rule). |
| **Key Generation** | Suggests MD5 hashing and truncating to 6 characters, ignoring hash collisions. | Explains the collision-loop flaw of truncated hashes and presents a dedicated Key Generation Service (KGS) with memory block pre-allocation. |
| **HTTP Redirection** | Chooses HTTP 301 without recognizing it breaks analytics tracking. | Explains the exact tradeoff: HTTP 301 caches permanently in the browser (zero origin load, no analytics), while HTTP 302/307 ensures every click hits infrastructure for metrics. |
| **Analytics Architecture** | Updates a `click_count` column directly in the database during the redirect request. | Decouples analytics entirely using an asynchronous event stream (Kafka) and a columnar store (ClickHouse), keeping redirect latency sub-20ms. |
| **Abuse & Reliability** | Mentions basic rate limiting only. | Identifies SSRF attack vectors via internal IPs, Bloom filters for cache penetration defense, and circuit breakers for database protection. |

## 8. 🧠 The Memory Hook

Pre-allocate the keys, decouple the paths: the write path claims collision-free Base62 tokens from an in-memory buffer, while the read path is a pure in-memory 302 cache lookup that fires an asynchronous telemetry event on its way out.
