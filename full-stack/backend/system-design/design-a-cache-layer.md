# Design a Distributed Caching Layer (Redis / Memcached)

## 1. Understand the Problem First — Clarify Before Designing

Imagine you run an e-commerce flash sale or a breaking news platform. Everything works smoothly until your distributed cache restarts with empty memory. In less than 300 milliseconds, 60,000 requests per second bypass the cache layer and slam directly into your primary PostgreSQL or MySQL database. Database CPU spikes to 100%, connection pools exhaust, active queries queue up indefinitely, and your entire backend fleet cascades into 504 Gateway Timeouts.

Or imagine a celebrity with 90 million followers publishes a post. Every single read query requests the exact same cache key across your cluster. Because consistent hashing maps that key to one specific Redis shard, that single node's network interface card (NIC) saturates and its CPU redlines, while the remaining 95% of your Redis cluster sits completely idle at 2% utilization.

Or consider a banking app where a user transfers funds, but an application thread updates the database and overwrites the cache with stale data due to a concurrent write race. The user refreshes their page and panics because their cached balance still shows their pre-transfer balance.

These are the real-world production disasters a properly architected caching layer must prevent. Before drawing boxes on a whiteboard, a senior engineer clarifies the boundaries and operational requirements:

- **Read vs. Write Ratio:** Is the workload 99:1 read-heavy (such as product catalogs, news feeds, or user profiles) or write-heavy (such as IoT telemetry, metrics ingestion, or live chat)?
- **Latency SLA:** What are our latency budgets? Are we targeting sub-millisecond p99 lookups (requiring local in-process memory) or sub-5ms p99 lookups over the network (distributed Redis)?
- **Working Set & Data Volume:** How much total data lives in the database versus the hot working set that generates 80–90% of traffic? (For instance, 20 TB in primary storage, but a 500 GB active hot set).
- **Consistency Tolerances:** Can the business tolerate eventual consistency (data stale by 1–5 seconds), or is strong consistency strictly required (such as ticket seat reservations or account balances)?
- **Durability & Persistence:** Is the cache strictly an ephemeral accelerator where losing a node causes no data loss, or does it hold write-behind dirty records that must survive power failure?
- **Eviction & Memory Ceilings:** What happens when RAM fills up? Which keys are discarded, and how do we prevent memory fragmentation?

## 2. The Core Insight — The Decision Everything Else Flows From

Caching is never just "putting Redis in front of a database." A cache is an explicit trade of memory cost and consistency guarantees in exchange for reduced latency and massive read throughput.

The foundational insight of distributed caching is that **all caching architectures are governed by two fundamental tensions: Invalidation Freshness and Partition Locality.**

If you mutate data in the database, ensuring that every subsequent read receives the updated state requires coordination. If you coordinate synchronously across distributed cache nodes, you destroy the very latency and throughput advantages you built the cache for. If you do not coordinate, you serve stale or corrupted state.

Furthermore, if you hash keys across a cluster, hashing distributes keys uniformly, but user traffic is never uniform. A single viral entity will concentrate massive traffic onto a single shard.

Therefore, every component in this design—from using a two-tier L1/L2 cache topology to probabilistic early expiration (XFetch), Bloom filters, SingleFlight deduplication, and key salting—exists to guarantee one core invariant: **the primary database must remain fully insulated from raw traffic spikes, regardless of cache misses, key expirations, traffic skew, or node restarts.**

## 3. High-Level Architecture — Components and Why Each Exists

To deliver sub-millisecond read latency while protecting backend databases from hot keys and cache stampedes, we use a multi-tier caching architecture.

```txt
                       Client Ingress / API Gateway
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ API Service Fleet (L1 In-Process Cache: Caffeine / Go Cache / LRU)     │
│ - Ultra-fast zero-network RAM lookup (~10-50 microseconds)             │
│ - SingleFlight mutex to collapse duplicate concurrent in-flight misses │
│ - Local Bloom Filter for instant non-existent key rejection            │
└───────────────┬────────────────────────────────────────▲───────────────┘
                │ (L1 Miss)                              │
                ▼                                        │ (Pub/Sub Invalidate)
┌────────────────────────────────────────────────────────┴───────────────┐
│ Distributed L2 Cache Tier (Redis Cluster / Memcached Ring)             │
│ - Consistent Hashing with Virtual Nodes across 16,384 slots            │
│ - 1-3ms p99 network RAM lookups; Shared across all API pods            │
│ - Master-Replica pairs with automatic failover (Sentinel / Raft)       │
└───────────────┬────────────────────────────────────────▲───────────────┘
                │ (L2 Miss)                              │
                ▼                                        │ (Cache-Aside Set)
┌────────────────────────────────────────────────────────┴───────────────┐
│ Primary Database (PostgreSQL / MySQL / DynamoDB)                       │
│ - System of Record & Transactional Integrity                           │
│ - Change Data Capture (CDC / Debezium) ──► Kafka Invalidation Bus     │
└────────────────────────────────────────────────────────────────────────┘
```

Each component plays a distinct role:

- **API Service Fleet with L1 In-Process Cache:** Each API node maintains a small, bounded in-memory cache (using Caffeine in the JVM, `sync.Map`/LRU in Go, or an LRU cache in Node.js). L1 handles reads in microseconds without network hops, completely absorbing hot-key traffic spikes before they ever reach the network.
- **SingleFlight / Request Coalescing Layer:** Built directly into the API service layer. When 5,000 concurrent threads miss the exact same key in L1, SingleFlight ensures that only one request is dispatched to L2 or the database. The other 4,999 requests block and wait for that single promise/future to resolve.
- **Bloom Filter Layer:** A space-efficient probabilistic data structure stored in memory. It verifies whether an ID definitely does not exist before any database query is issued, stopping cache penetration cold.
- **Distributed L2 Cache Tier (Redis Cluster):** The shared, authoritative caching layer. It holds the working set across tens or hundreds of gigabytes of RAM. Redis Cluster partitions data using consistent hashing with 16,384 hash slots, providing high availability via master-replica pairs.
- **Asynchronous Invalidation Bus (Kafka / Redis Pub/Sub):** When database records mutate, Change Data Capture (CDC via Debezium) or application event publishers emit invalidation events. These events instruct all API instances to evict the corresponding key from their local L1 caches.
- **Primary Database:** The persistent source of truth and transactional coordinator.

**End-to-End Request Lifecycle:**

1. **Read Request Flow:**
   - The API server receives a `GET /items/{id}` request.
   - It checks its local L1 cache. If present (L1 Hit), it immediately returns the value (~50µs).
   - On L1 Miss, the request enters a SingleFlight coordinator for `{id}`.
   - The single leader request checks the distributed L2 Redis Cluster. If present (L2 Hit, ~2ms), it stores the item in local L1 with a short TTL (e.g., 30 seconds) and returns.
   - On L2 Miss, the Bloom filter is queried. If the Bloom filter returns `false`, the item is guaranteed not to exist in the database; the request immediately returns a 404 without hitting storage.
   - If the Bloom filter returns `true`, the single leader request queries the Primary Database.
   - The database result is written to L2 Redis with a long TTL plus randomized jitter, stored in L1, and returned to all waiting callers.

2. **Write Request Flow:**
   - The client sends a `POST /items/{id}` update.
   - The API server writes the updated record directly to the Primary Database within a transaction.
   - Upon successful database commit, the API server **deletes** (invalidates) the key in L2 Redis.
   - An invalidation event is broadcast over the Kafka/Pub-Sub bus, causing all API fleet instances to evict `{id}` from their local L1 caches.
   - Subsequent reads lazily reload the fresh value from the database into L2 and L1.

## 4. Key Technical Decisions — With Real Tradeoffs

**1. Caching Access Patterns: Cache-Aside vs. Write-Through vs. Write-Behind vs. Refresh-Ahead**

Choosing how application code interacts with the cache dictates data consistency, write latency, and complexity:

- **Cache-Aside (Lazy Loading):**
  - *Mechanism:* The application orchestrates all reads and writes. On read, it checks cache first, then database on miss, then populates cache. On write, it writes to the database and deletes the cache entry.
  - *Pros:* Only requested data is cached (memory efficient); cache failure does not block writes; resilient to arbitrary schema updates.
  - *Cons:* Cache miss penalty on cold reads (three network hops: App -> Cache -> DB -> Cache); risk of serving stale data if an invalidation message is delayed.
  - *When to use:* The gold standard for general-purpose, read-heavy web services.

- **Write-Through:**
  - *Mechanism:* The application writes to the caching layer. The caching layer synchronously writes to the database and only returns success when both writes complete.
  - *Pros:* Cache is never stale; read operations are consistently fast because data is already in cache.
  - *Cons:* Higher write latency due to two synchronous writes; caches data that may never be read again, polluting memory unless paired with an aggressive eviction policy.
  - *When to use:* Systems where data is read immediately and frequently after being written (e.g., user session tokens, real-time status).

- **Write-Behind (Write-Back):**
  - *Mechanism:* The application writes directly to the cache, which acknowledges the write instantly. An asynchronous background worker batches dirty cache entries and writes them to the database periodically.
  - *Pros:* Ultra-low write latency; write coalescing (1,000 rapid updates to a view counter collapse into a single database `UPDATE` query).
  - *Cons:* Risk of permanent data loss if the cache node crashes before dirty writes flush to disk; high complexity in handling database write conflicts and retries.
  - *When to use:* High-volume write scenarios where losing a few seconds of updates is acceptable (e.g., video view counts, analytics telemetry, in-game leaderboards).

- **Refresh-Ahead:**
  - *Mechanism:* The cache predicts future reads based on access frequency and automatically reloads keys from the database before their TTL expires.
  - *Pros:* Eliminates read latency spikes caused by expired keys for hot items.
  - *Cons:* Wasted database queries and bandwidth if access predictions are inaccurate.
  - *When to use:* Workloads with highly predictable, recurring read patterns (e.g., periodic leaderboard refreshes, scheduled financial market openers).

**2. Cache Invalidation: Invalidation (Delete) vs. Mutation (Update)**

When mutating data in the database, should the application update the cache value or delete the cache key?

**Decision:** Always **delete** the cache key on updates.

*Why:* Updating the cache creates severe race conditions under concurrent writes. Consider two concurrent requests updating the same user profile:
1. Thread A writes `Name = Alice` to the Database.
2. Thread B writes `Name = Bob` to the Database.
3. Due to network latency, Thread B updates the Cache with `Bob`.
4. Thread A's delayed packet arrives and updates the Cache with `Alice`.

The database now holds `Bob`, but the cache permanently holds `Alice` until TTL expiration. Deleting the cache key is idempotent; both Thread A and Thread B delete the key, forcing the next read to fetch the latest committed database state cleanly.

**3. Eviction Policies: LRU vs. LFU vs. FIFO vs. TTL with Jitter**

When cache memory fills to its configured limit (`maxmemory`), the engine must evict items:

- **LRU (Least Recently Used):** Discards items not accessed for the longest duration. Implemented via a hash map combined with a doubly linked list in O(1) time. Best general-purpose policy for temporal locality.
- **LFU (Least Frequently Used):** Tracks access counts using probabilistic logarithmic counters (Morris counter). Keeps persistently popular items cached even if a temporary burst of new, rarely-accessed keys arrives. Ideal for long-tail media catalogs.
- **FIFO (First In, First Out):** Evicts the oldest written items regardless of popularity. Lowest algorithmic overhead, but frequently drops hot items.
- **TTL with Randomized Jitter:** Every key is assigned a Time-To-Live. To prevent millions of keys set at the same time from expiring simultaneously, add random jitter: `TTL = Base_TTL + UniformRandom(-Jitter, +Jitter)`.

**4. Cache Engine Selection: Redis vs. Memcached**

| Dimension | Redis | Memcached |
|---|---|---|
| **Data Types** | Strings, Hashes, Lists, Sets, Sorted Sets, Bitmaps, Streams | Pure binary/string Key-Value only |
| **Threading Model** | Single-threaded core event loop (with multi-threaded I/O for network) | Fully multi-threaded architecture (scales vertically across many CPU cores) |
| **Clustering & HA** | Native Redis Cluster (16,384 hash slots), Sentinel auto-failover | Client-side consistent hashing across independent nodes; no native clustering |
| **Memory Efficiency** | Higher memory overhead per key due to rich object metadata | Extremely high memory efficiency with slab allocation (avoids fragmentation) |
| **Persistence** | Supported (RDB snapshots, AOF append logs) | None (purely ephemeral in-memory) |
| **Advanced Features** | Pub/Sub, Lua scripting, Geospatial, Transactions | Simple Get/Set/Add/CAS (Check-and-Set) |

**Verdict:** Use Redis for complex data structures, atomic sorted sets/counters, pub/sub invalidation, and built-in cluster failover. Use Memcached for massive, pure key-value caching where multi-threaded vertical scaling and simple slab allocation are the sole requirements.

## 5. Deep Dives — The Parts That Actually Matter

**Deep Dive 1: Cache Topologies — The Two-Tier L1 Local + L2 Distributed Pattern**

Relying exclusively on a distributed Redis cluster still incurs a network round-trip (typically 1–3ms over TCP) and serializes data through network interfaces. At 500,000 queries per second, network bottlenecks on Redis nodes become the primary failure point.

The solution is a hybrid two-tier cache topology:

1. **L1 Local In-Process Cache:**
   - Lives in the application process heap (Caffeine in Java, Go in-memory cache, Node.js LRU).
   - Lookups take 10 to 50 nanoseconds with zero serialization and zero network overhead.
   - Sized small (e.g., 500 MB to 2 GB per pod) to store only the absolute hottest 1% of entities.

2. **L2 Distributed Cache:**
   - Centralized Redis Cluster holding the entire working set (e.g., 200 GB to 1 TB).
   - Shared across all 100+ application pods, ensuring that a cold start on a single application pod does not trigger a database hit.

3. **L1/L2 Synchronization via Invalidation Bus:**
   - When any API pod writes to the database, it publishes an eviction message: `{"action": "EVICT", "key": "user:1042"}` to a lightweight pub/sub channel.
   - All other API pods receive this event and evict the key from their local L1 heap within 5ms.
   - As a safety net against dropped pub/sub messages, all L1 entries have a hard maximum TTL of 30–60 seconds.

**Deep Dive 2: The Four Critical Cache Pathologies & Production Defenses**

```txt
┌────────────────────────────────────────────────────────────────────────┐
│                        THE 4 CACHE PATHOLOGIES                         │
├──────────────────────────────────┬─────────────────────────────────────┤
│ 1. CACHE STAMPEDE (Thundering)   │ 2. CACHE PENETRATION                │
│ Hot key expires under heavy QPS; │ Queries for non-existent keys miss  │
│ 10,000 threads hit DB at once.   │ cache and hammer DB continuously.   │
│ ──► Defense: SingleFlight/XFetch │ ──► Defense: Bloom Filter / Nulls   │
├──────────────────────────────────┼─────────────────────────────────────┤
│ 3. CACHE AVALANCHE               │ 4. HOT-KEY BOTTLENECK               │
│ Massive batch of keys expire at  │ Millions of reads hit 1 key;        │
│ the same second; DB melts down.  │ single Redis shard NIC saturates.   │
│ ──► Defense: TTL Jitter / Warmup │ ──► Defense: L1 Cache / Key Salting │
└──────────────────────────────────┴─────────────────────────────────────┘
```

**1. Cache Stampede (Thundering Herd):**
- **The Failure:** A high-traffic key (e.g., homepage configuration or breaking news article getting 25,000 QPS) expires or gets deleted. In the 50ms it takes for one thread to query the database and repopulate the cache, 1,250 concurrent requests experience a cache miss and all execute the identical heavy query on the database simultaneously.
- **Defenses:**
  - **SingleFlight / Distributed Mutex:** When a cache miss occurs, the application attempts to acquire a mutex (or in-memory SingleFlight lock). Only the lock winner queries the database. All other threads block and wait for the winner to populate the cache, or subscribe to the leader's completion promise.
  - **Probabilistic Early Expiration (XFetch Algorithm):** Instead of waiting for a hard TTL expiration, reading threads compute a probabilistic formula on every read:
    $$\Delta \cdot \beta \cdot \ln(\text{random}()) > (\text{expiry} - \text{now})$$
    Where $\Delta$ is the time it takes to compute the database query and $\beta > 0$ is an aggressiveness constant. As the key approaches expiration, the probability of a thread triggering an asynchronous background recomputation before the key actually expires approaches 100%. The cache is refreshed in the background, and users never experience a cold miss.

**2. Cache Penetration:**
- **The Failure:** An attacker or misbehaving client repeatedly queries keys that do not exist in the database (e.g., `GET /users/-99999` or random UUIDs). Because the keys do not exist, the cache never stores them. Every single request bypasses the cache entirely and hits the primary database.
- **Defenses:**
  - **Bloom Filters:** Maintain an in-memory Bloom filter (or Cuckoo filter) populated with all valid primary keys. Before querying the cache or database, the API checks the Bloom filter. If the filter returns `false`, the key definitely does not exist in the database; the request is rejected immediately.
  - **Cache Null Objects:** If a database query returns empty/not found, write a sentinel null value into the cache with a short TTL (e.g., `SET user:-99999 "NULL" EX 60`). Subsequent queries hit the cache and return 404 without querying storage.

**3. Cache Avalanche:**
- **The Failure:** A batch job writes 500,000 product catalog entries at midnight with a fixed TTL of exactly 8 hours. At 08:00:00 AM, all 500,000 keys expire at the exact same microsecond. The morning traffic wave hits an empty cache simultaneously, crushing the database. Alternatively, the entire Redis cluster restarts cold after an outage.
- **Defenses:**
  - **Randomized TTL Jitter:** Never set a static TTL. Always apply uniform random jitter:
    $$\text{TTL} = \text{Base\_TTL} + \text{rand}(-\text{Jitter}, +\text{Jitter})$$
    For example, an 8-hour TTL becomes $28800 \pm \text{rand}(0, 1800)$ seconds, smoothly distributing key expirations over a 30-minute window.
  - **Pre-Warming & Rate-Limited Hydration:** On cluster cold starts, background workers pre-warm the hottest keys from database snapshots before shifting live user traffic. Database connection pools must enforce strict concurrency limits and circuit breakers.

**4. Hot-Key Bottlenecks:**
- **The Failure:** An ultra-popular entity (e.g., a viral video metadata key receiving 200,000 QPS) hashes to a single hash slot on Redis Shard #4. Shard #4 hits 100% CPU and drops packets, while Shards #1, #2, and #3 remain at 2% CPU.
- **Defenses:**
  - **L1 In-Process Caching:** The API fleet caches the hot key in local RAM. If you have 50 API instances, the 200,000 QPS is divided locally, resulting in only a few dozen queries per second reaching Redis Shard #4.
  - **Key Sharding / Salting:** For write-heavy hot keys or systems without L1, duplicate the key across $N$ shards by appending a random suffix: `item:42_0`, `item:42_1`, ..., `item:42_9`. Readers randomly select a suffix: `get("item:42_" + rand(0, 9))`, distributing the read load evenly across 10 distinct Redis shards. Writers update all $N$ keys or write with short TTLs.

**Deep Dive 3: Consistent Hashing and Virtual Nodes**

In a distributed cache cluster with $N$ nodes, simple modular hashing (`hash(key) % N`) fails catastrophically when a node is added or removed: almost every key hashes to a new node, causing a cluster-wide 100% cache miss rate.

- **Consistent Hashing:** Maps both cache nodes and data keys onto a continuous circular integer range (the Hash Ring, typically $[0, 2^{32}-1]$) using a cryptographic or fast hashing algorithm like MurmurHash3 or xxHash. A key is stored on the first node whose position is greater than or equal to the key's hash position clockwise along the ring. When a node is added or removed, only $K/N$ keys need to be remapped on average (where $K$ is total keys and $N$ is total nodes), preventing cluster-wide evictions.
- **Virtual Nodes (VNodes):** To prevent non-uniform data distribution (hot spots where one physical node handles a disproportionately large arc of the ring), each physical node is mapped to multiple pseudo-random positions along the ring (e.g., 100 to 256 virtual nodes per physical machine). Virtual nodes ensure uniform key distribution across physical hardware and distribute the load of a failed machine evenly across all surviving nodes.

## 6. Failure Modes and Resilience

**1. Redis Primary Node Crash:**
- **Symptom:** Master node fails due to hardware crash or kernel OOM. Active client TCP connections drop.
- **Detection & Recovery:** Redis Sentinel or Redis Cluster internal gossip protocol detects missing heartbeats (`PING/PONG`) within 3–5 seconds. A replica node with the highest replication offset is automatically promoted to master via majority quorum voting.
- **Application Mitigation:** API clients must use smart clustering connection pools (e.g., Jedis, Lettuce, redis-py) that listen to topology updates and retry failed reads against replicas or circuit-break gracefully to the database.

**2. Network Partition (Split-Brain):**
- **Symptom:** Network failure divides the cluster into a minority partition and a majority partition. A master in the minority partition continues accepting writes while the majority partition elects a new master for the same hash slots.
- **Mitigation:** Configure Redis with `min-replicas-to-write 1` and `min-replicas-max-lag 10`. If a master loses connection to its replicas for more than 10 seconds or cannot see at least one replica, it immediately halts accepting writes and returns an error, preventing split-brain data divergence.

**3. Redis Out-Of-Memory (OOM) Meltdown:**
- **Symptom:** Memory consumption exceeds physical host RAM. The Linux kernel invokes the OOM Killer, or Redis starts blocking commands.
- **Mitigation:**
  - Never configure `maxmemory` to 100% of host RAM. Set `maxmemory` to 70–75% of total system RAM to leave headroom for Redis copy-on-write overhead during background snapshotting (`BGSAVE`) and replication buffer allocations.
  - Set `maxmemory-policy allkeys-lru` or `volatile-lru` to guarantee automatic eviction of cold data before memory exhaustion occurs.

**4. Cache Desynchronization / Stale Data Leaks:**
- **Symptom:** Invalidation message over Kafka/Pub-Sub is dropped or delayed due to broker partition. L1 caches continue serving stale data indefinitely.
- **Mitigation:**
  - Every L1 cache entry must enforce a mandatory maximum TTL (e.g., 30 to 60 seconds) regardless of invalidation mechanisms.
  - For critical transactional data (e.g., account permissions), include a lightweight entity `version_id` in JWT tokens or API request headers. If the cached version is older than the token version, force an immediate database re-fetch.

## 7. What Makes a Great Answer vs an Average One

| Evaluation Axis | Average Answer | Senior / Great Answer |
|---|---|---|
| **Invalidation Strategy** | "I'll update the cache whenever the database updates." | "I will explicitly delete the cache key on DB update to avoid concurrent write race conditions, and back it with CDC-driven Pub/Sub invalidations for L1 fleets." |
| **Handling Cold Starts & Spikes** | "Redis handles 100,000 QPS so the system will be fast." | "I will use a two-tier L1/L2 topology with SingleFlight mutexes to collapse thundering herds, and apply the XFetch algorithm for probabilistic early recomputation of hot keys." |
| **Cache Miss Resiliency** | "If it misses the cache, it queries the database." | "I will guard against Cache Penetration using Bloom filters and null-object caching, and prevent Cache Avalanches by enforcing randomized TTL jitter." |
| **Traffic Skew (Hot Keys)** | Treats all keys as uniformly distributed across shards. | "I will address hot-key shard saturation by caching top entities in API process memory (L1) and salting high-traffic keys across multiple Redis shards." |
| **Capacity & Memory Planning** | "I'll provision a 64 GB Redis instance." | "I will size RAM based on the active 20% working set, reserve 25% host memory headroom for copy-on-write during BGSAVE/fork operations, and configure `allkeys-lru` eviction." |

## 8. 🧠 The Memory Hook

> **"A cache is a lens, not a vault: never update, always delete; never expire together, always jitter; never let a crowd through, single-flight the miss; and keep the hottest embers in L1 local memory before they ever touch the Redis ring."**
