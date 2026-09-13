# Backend Caching: Patterns, Invalidation Strategies, and Cache Stampede Resilience

## 1. Why This Exists — The Problem First

Picture a flash sale starting at noon. Your e-commerce product catalog endpoint receives 50,000 requests per second. Every single incoming request executes a complex SQL query with four table joins across products, inventory, categories, and ratings against a relational database stored on disk. Within three seconds, the database connection pool is completely exhausted, disk I/O hits 100%, CPU spikes to the ceiling, response latencies jump from 20 milliseconds to 15 seconds, and the primary database crashes under the load.

Now picture you add a basic distributed cache in front of that database with a hardcoded 10-minute expiration time. Everything runs smoothly until 12:10:00 PM, when the hot product key expires. In that exact millisecond, 10,000 concurrent requests miss the cache simultaneously. Every single one falls through to execute that expensive SQL query at the exact same moment. This is a cache stampede, and it takes down your database just as fast as having no cache at all.

Databases are optimized for durability, transactional consistency, and complex indexing on persistent storage. RAM, by contrast, is orders of magnitude faster than NVMe SSDs, but server memory is finite and expensive. Backend caching exists to place frequently requested, expensive-to-compute data in high-speed volatile memory, acting as a defensive shield for your primary database while slashing API response times from tens of milliseconds to sub-millisecond speeds.

## 2. The Analogy — Make It Obvious

Think of a busy restaurant kitchen during dinner rush.

The deep-freeze basement storage room across the street is your primary database. It holds every ingredient the restaurant owns, neatly cataloged in heavy locked vaults. Walking across the street, unlocking the vault, hauling a sack of onions back up the stairs, and chopping them takes fifteen minutes per order. The basement doorway is narrow: only four cooks can walk through at a time before they get stuck in a bottleneck.

The countertop prep station right next to the head chef's stove is your in-memory cache. At the start of the shift, the kitchen preps a bowl of diced onions and sets it on the counter. When an order for french onion soup comes in, the chef reaches out and grabs a handful in two seconds without leaving the stove.

What happens when the bowl runs out of onions mid-rush? If twenty cooks notice the empty bowl at the same instant and all sprint across the street to the basement, they collide in the doorway and the entire kitchen halts. That is a cache stampede. A well-run kitchen solves this by having one designated apprentice lock the basement door, grab a fresh sack, and refill the bowl while other cooks wait for the refill or serve orders from remaining prep.

What if a customer walks in and repeatedly orders dragon meat? If the chef checks the prep bowl, finds nothing, and runs down to the basement each time to search every shelf before confirming dragon meat doesn't exist, the kitchen still grinds to a halt. That is cache penetration. The smart kitchen puts a sign at the front desk saying "We only serve beef, chicken, and vegetarian" so the request is rejected before anyone touches the kitchen, or places a small card on the counter labeled "Dragon meat: Out of stock" for the rest of the evening.

## 3. How It Actually Works — The Full Explanation

Caching operates on the principle of locality: data accessed once is very likely to be accessed again soon (temporal locality), and related data is often accessed together (spatial locality). Understanding backend caching requires mastering three dimensions: where the cache lives, how data moves through it, and how to defend against production disasters.

**Caching Tiers: In-Memory Process vs Distributed**

An In-Memory Process Cache stores data directly inside the application runtime heap (for example, a JavaScript `Map` or an LRU cache object inside a Node.js process). Reading from process memory takes nanoseconds because it requires zero network serialization and zero socket communication. However, this cache is isolated to a single server instance. When you run ten replica pods behind a load balancer, each pod has its own fragmented cache with inconsistent state, and restarting a pod wipes its entire cache clean.

A Distributed Cache stores data in a dedicated, external in-memory data store like Redis or Memcached shared across all application instances. Reading from Redis introduces a network hop over TCP or Unix domain sockets, yielding latencies around 1 to 3 milliseconds. In exchange, every application pod reads and writes the exact same shared data, cache state survives application restarts, and the cache cluster can be scaled, partitioned, and replicated independently from application servers.

High-throughput systems often implement Multi-Tier Caching (L1/L2): L1 is a tiny, short-lived in-process cache in local application RAM for ultra-hot keys, while L2 is a centralized Redis cluster.

**The Four Core Caching Patterns**

The Cache-Aside (Lazy Loading) pattern leaves the application code in full control of coordinating the cache and database. When reading, the application queries the cache first. On a cache hit, it returns the data immediately. On a cache miss, the application queries the database, writes the fetched data into the cache with an expiration time, and returns the result. When writing data, the application updates the database and then deletes (invalidates) the matching key from the cache. This is the most common pattern in web applications because it is resilient: if the cache cluster crashes, the application can still fall back directly to the database.

The Read-Through pattern places the cache between the application and the database. The application treats the cache as the primary data store and issues all read requests directly to the cache library or middleware. If the key is missing, the cache itself fetches the missing data from the database, populates its own store, and returns the value to the application. This centralizes caching logic and keeps application code clean, but requires a cache framework that supports custom data loaders.

The Write-Through pattern executes writes synchronously through the cache to the database. When the application updates a record, it writes to the cache, and the cache immediately writes to the database within the same operation before confirming success. This guarantees that the cache is never stale and reads are always fast, but every write pays the latency penalty of two sequential network operations, and data that is rarely read still occupies precious cache memory.

The Write-Behind (Write-Back) pattern accepts writes into the cache immediately, acknowledges success to the client in sub-milliseconds, and queues the write to be flushed to the database asynchronously in background batches. This pattern delivers massive write throughput and absorbs extreme traffic spikes (such as video view counters, click tracking, or real-time IoT telemetry). The critical tradeoff is the risk of permanent data loss: if the cache node crashes before dirty writes are persisted to the database, unwritten data is lost forever.

**Eviction Policies: Managing Finite Memory**

When cache memory fills up, the cache engine must discard existing keys to make room for new ones according to a defined eviction policy:

LRU (Least Recently Used) tracks when items were last accessed and discards the item that has sat untouched for the longest time. It is the gold standard default for most general web traffic.

LFU (Least Frequently Used) tracks an access counter for each key and discards items with the lowest total request count. This prevents a sudden burst of scans on cold data from evicting steady, highly popular items, but requires frequency decay mechanisms so historically popular items that become obsolete eventually get evicted.

FIFO (First-In, First-Out) evicts keys strictly in the order they were inserted, regardless of how often or recently they were read.

TTL-based eviction (such as Redis `volatile-lru` or `volatile-ttl`) restricts eviction strictly to keys configured with an explicit Time-To-Live, preserving permanent configuration keys while discarding transient data.

**The Three Production Caching Disasters and Defenses**

Cache Stampede (Thundering Herd) happens when a high-traffic key expires or is evicted, causing thousands of concurrent worker threads or asynchronous requests to miss the cache at the exact same instant and overload the database with identical queries. You defend against stampedes using three strategies:
- Distributed Mutex Locking: The first request that discovers a cache miss acquires an atomic distributed lock in Redis (`SET lock:key token NX PX 5000`). Only the lock holder queries the database and repopulates the cache; all other concurrent requests wait briefly and re-read the freshly populated cache.
- Probabilistic Early Expiration (XFetch algorithm): Background reads calculate an eviction probability as the key nears its TTL based on query execution time and access frequency. If the probabilistic threshold is crossed, a single background request silently refreshes the cache before the key ever officially expires.
- Stale-While-Revalidate: The cache returns slightly stale data immediately to incoming clients while triggering an asynchronous background job to fetch fresh data and update the cache.

Cache Penetration occurs when clients repeatedly request non-existent keys (such as negative IDs or random hashes generated by scrapers). Because the data does not exist in the database, the cache is never populated, and every single request punches straight through to the database. You defend against this by caching empty results (storing `null` or `{}` with a short TTL like 30 seconds) or by deploying a Bloom Filter—a space-efficient probabilistic data structure that can definitively tell you if an ID does NOT exist before you query either the cache or the database.

Cache Avalanche occurs when thousands of distinct cache keys are written at the same time with identical TTLs (for example, a batch job warming the cache with 1-hour TTLs at 2:00 AM). Exactly one hour later at 3:00 AM, every single key expires in the same second, dropping the entire cache hit rate to zero and slamming the database with a massive sudden surge. You defend against avalanches by adding TTL Jitter: adding a randomized delta to every key's expiration time (for example, `baseTTL + random(0, 300)` seconds) so expirations are smoothed evenly over time.

## 4. Real Code — See It Working

Here is a production-grade Node.js and Express implementation of the Cache-Aside pattern using Redis. It features distributed mutex locking for stampede protection, randomized TTL jitter against avalanches, negative caching against penetration, and graceful fallback if Redis goes down.

```javascript
import express from 'express';
import Redis from 'ioredis';
import crypto from 'crypto';

const app = express();
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: 6379,
  // Automatically retry commands on transient connection drops
  retryStrategy: (times) => Math.min(times * 50, 2000),
  // Fail fast on network errors so the app can fall back to the database
  maxRetriesPerRequest: 1,
});

// Mock database simulating an expensive relational query with table joins
async function fetchProductFromDatabase(productId) {
  // Simulate 120ms disk I/O and query execution latency
  await new Promise((resolve) => setTimeout(resolve, 120));

  const mockDatabase = {
    'prod-101': { id: 'prod-101', name: 'Mechanical Keyboard', price: 149.99, stock: 42 },
    'prod-102': { id: 'prod-102', name: 'Ergonomic Chair', price: 399.00, stock: 15 },
  };

  return mockDatabase[productId] || null;
}

// Generates a base TTL with random jitter to prevent Cache Avalanche
function getJitteredTtl(baseSeconds = 300, jitterRangeSeconds = 60) {
  const jitter = Math.floor(Math.random() * jitterRangeSeconds);
  return baseSeconds + jitter;
}

// Sleeps for a given millisecond duration
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Core Cache-Aside fetcher with stampede, avalanche, and penetration protection
async function getProductWithCache(productId) {
  const cacheKey = `cache:product:${productId}`;
  const lockKey = `lock:product:${productId}`;
  const lockToken = crypto.randomUUID();
  const lockTtlMs = 3000; // Hold lock for max 3s to prevent deadlocks if process crashes

  try {
    // 1. Attempt to read from distributed cache
    const cachedData = await redis.get(cacheKey);

    if (cachedData !== null) {
      const parsed = JSON.parse(cachedData);
      // Sentinel value '__NULL__' indicates a cached negative result (Cache Penetration defense)
      if (parsed === '__NULL__') {
        return null;
      }
      return parsed;
    }
  } catch (err) {
    // Graceful degradation: log Redis failure and fall back directly to DB without crashing
    console.error('Redis read error, falling back to database:', err.message);
    return fetchProductFromDatabase(productId);
  }

  // 2. Cache Miss: Acquire a distributed mutex lock to prevent Cache Stampede (Thundering Herd)
  let lockAcquired = false;
  try {
    // SET lockKey token NX PX lockTtlMs ensures atomic lock acquisition across all pods
    const lockResult = await redis.set(lockKey, lockToken, 'PX', lockTtlMs, 'NX');
    lockAcquired = lockResult === 'OK';
  } catch (err) {
    console.error('Redis lock error, bypassing lock:', err.message);
  }

  if (!lockAcquired) {
    // Another concurrent request is already fetching from the DB and rebuilding the cache.
    // Wait briefly and re-read the cache instead of hitting the database.
    await sleep(60);
    try {
      const retryCache = await redis.get(cacheKey);
      if (retryCache !== null) {
        const parsed = JSON.parse(retryCache);
        return parsed === '__NULL__' ? null : parsed;
      }
    } catch (err) {
      // If retry fails, fall back to DB
    }
    // Fall back to DB if cache still empty after waiting
    return fetchProductFromDatabase(productId);
  }

  // 3. We hold the lock: Fetch from primary database
  try {
    const freshProduct = await fetchProductFromDatabase(productId);

    if (freshProduct === null) {
      // Protect against Cache Penetration: cache the negative result with a short 30s TTL
      await redis.set(cacheKey, JSON.stringify('__NULL__'), 'EX', 30);
      return null;
    }

    // Cache the fresh record with TTL jitter (e.g., 300-360 seconds) to prevent Avalanche
    const ttl = getJitteredTtl(300, 60);
    await redis.set(cacheKey, JSON.stringify(freshProduct), 'EX', ttl);

    return freshProduct;
  } finally {
    // 4. Release lock safely using a Lua script so we only release our own lock token
    const releaseLockScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    try {
      await redis.eval(releaseLockScript, 1, lockKey, lockToken);
    } catch (err) {
      console.error('Failed to release lock:', err.message);
    }
  }
}

// Route: Get product by ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await getProductWithCache(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ data: product });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Route: Update product (Cache Invalidation on write)
app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    // 1. Update the authoritative database first
    // await db.products.update(id, updates);

    // 2. Invalidate the cache key so the next read fetches fresh data
    // Deleting is far safer than updating the cache directly to avoid write race conditions
    const cacheKey = `cache:product:${id}`;
    await redis.del(cacheKey);

    res.json({ success: true, message: 'Product updated and cache invalidated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Product service running on port ${PORT}`);
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between Cache-Aside, Write-Through, and Write-Behind caching, and when do you choose each?**

In Cache-Aside, the application manually coordinates reads and writes: it reads from the cache first, falls back to the database on a miss, writes data back to the cache, and explicitly deletes cache keys on database updates. It is the industry standard for read-heavy web applications because it is resilient—if the cache goes down, the application still functions by hitting the database.

In Write-Through, the application writes data directly to the cache layer, which synchronously updates the database before confirming success to the client. This guarantees the cache is always 100% consistent with the database and eliminates cache misses on updated data, but adds write latency because every write performs two synchronous operations, and it risks caching data that may never be read again.

In Write-Behind (Write-Back), the application writes data exclusively to the cache, which acknowledges the write instantly and flushes updates to the database asynchronously in background batches. You choose Write-Behind when write throughput is the primary bottleneck—such as real-time analytics, vote counters, or video view tracking—and you can tolerate the risk of losing unpersisted writes if the cache crashes before flushing to disk.

**Q: What is a Cache Stampede (Thundering Herd) and how do you mitigate it in production?**

A cache stampede happens when a high-traffic cache key expires or is evicted while hundreds or thousands of concurrent requests are actively reading it. Because the key is missing, all those requests simultaneously fall through to query the primary database, causing an instant spike in database CPU, connection pool exhaustion, and potential system outages.

You mitigate a cache stampede using three primary techniques:
1. Mutex Locking: The first request that experiences a cache miss acquires an atomic distributed lock in Redis (`SET lock_key token NX PX 3000`). Only the single request holding the lock queries the database and writes the result to the cache. All other concurrent requests wait briefly and re-check the cache.
2. Probabilistic Early Expiration (XFetch): Instead of waiting for a hard TTL expiration, the reading application uses an algorithm that computes a probability of refreshing early as the key approaches its expiration time. Higher traffic naturally increases the chance that a single background read refreshes the key before it ever expires.
3. Stale-While-Revalidate: The cache is configured to return the existing (slightly stale) data immediately to incoming clients while triggering a background task to fetch fresh data and update the store.

**Q: What is the difference between Cache Penetration, Cache Breakdown, and Cache Avalanche?**

These three terms describe distinct caching failure modes:

Cache Penetration occurs when requests query data that does not exist in either the cache or the primary database (for example, malicious queries for IDs like `-1` or random UUIDs). Because the database has no record, the cache is never populated, and every single request penetrates straight through to the database. Defenses include caching `null` results with short TTLs and using Bloom Filters to reject non-existent keys before touching the database.

Cache Breakdown (the single-key stampede) occurs when one specific, extremely hot cache key expires under massive concurrent read volume, causing all requests for that specific key to hammer the database simultaneously. Defenses include distributed mutex locks, probabilistic early refresh, and setting hot keys to never expire with asynchronous background updating.

Cache Avalanche occurs when thousands of distinct cache keys expire at the exact same moment across the entire cluster (often because a bulk warm-up script set identical TTLs, or the cache server rebooted). The entire cache hit rate drops instantly, dumping massive collective traffic across the whole database. The primary defense is adding TTL Jitter—randomizing expiration times across a uniform distribution.

**Q: Why is deleting (invalidating) a cache key on database updates safer than updating the cached value directly?**

Updating the cache directly introduces severe race conditions when two concurrent writes occur. Consider two requests, Request A and Request B, updating the same user record at the same time:
1. Request A writes value `A` to the database.
2. Request B writes value `B` to the database.
3. Due to network jitter or scheduling delays, Request B updates the cache with value `B`.
4. Request A's delayed cache update arrives last and overwrites the cache with value `A`.

Now the database permanently holds `B`, but the cache permanently holds `A`. The cache serves stale, corrupt data until the TTL expires.

When you invalidate (delete) the cache key on every update instead:
1. Request A writes to DB and deletes the cache key.
2. Request B writes to DB and deletes the cache key.
3. The next read encounters a cache miss, queries the database, and safely reads the authoritative final state `B`, populating the cache correctly.

**Q: What is a Bloom Filter and how does it prevent cache penetration?**

A Bloom Filter is a space-efficient, probabilistic data structure used to test whether an element is a member of a set. It uses a bit array of size $m$ and $k$ independent cryptographic or non-cryptographic hash functions. When an item is added, it is hashed $k$ times, and the corresponding bits in the array are set to `1`.

When a query arrives, the key is hashed $k$ times to inspect the bit array. If any of the $k$ bits is `0`, the item is guaranteed to not exist in the database with 100% certainty. The application can immediately return a 404 response without executing a database query or cache lookup. If all $k$ bits are `1`, the item probably exists (with a tunable false positive rate, typically 1%), and the request proceeds to the cache and database. Bloom filters use a few megabytes of RAM to index hundreds of millions of keys, acting as an ultra-fast gatekeeper.

**Q: How do you choose between an In-Memory process cache and a Distributed Redis cache?**

Choose an In-Memory Process Cache when:
- Data is read millions of times per second and cannot tolerate the 1-3ms network round-trip of an external Redis call.
- The dataset is small, static, or read-only (such as internationalization dictionaries, country lists, or configuration flags).
- You can tolerate slight data discrepancies between different server pods.

Choose a Distributed Cache (Redis) when:
- Multiple application servers or microservices need a single, consistent source of truth.
- Cached data must survive application server deployments, crashes, and autoscaling events.
- The cached dataset is larger than the available Node.js or JVM heap space.
- You need advanced data structures (Sorted Sets for leaderboards, Bitmaps, Hashes) or pub/sub capabilities.

High-scale architectures combine both: a local L1 in-memory cache with a 5-second TTL backed by an L2 Redis cluster with a 1-hour TTL.

**Q: What happens when a Redis cache runs out of memory, and how do eviction policies handle it?**

When Redis reaches its configured `maxmemory` limit, its behavior is determined by its `maxmemory-policy` setting:
- `noeviction`: Redis returns an out-of-memory error on any command that attempts to write more data (like `SET` or `HSET`), while continuing to serve read requests.
- `allkeys-lru`: Redis evicts the least recently used keys across the entire dataset to make room for new writes.
- `volatile-lru`: Redis evicts the least recently used keys only among those keys that have an explicit TTL set. Permanent keys without TTL are protected from eviction.
- `allkeys-lfu`: Redis evicts the least frequently used keys across the entire dataset.
- `volatile-ttl`: Redis evicts keys with the shortest remaining time-to-live first.

For web application caching layers, `allkeys-lru` or `volatile-lru` are the standard production choices to ensure the service remains operational without manual intervention.

## 6. The Traps — What Goes Wrong

**Trap 1: Updating Cache Values on Write Instead of Deleting**

When an application updates a record, developers often try to be helpful by immediately writing the new value into the cache: `await redis.set(key, newValue)`. Under concurrent writes, thread interleaving guarantees that a slower, earlier write will eventually overwrite a faster, later write in the cache. The database ends up with the newest value, while the cache holds the older value permanently. Always delete the cache key on writes (`await redis.del(key)`), or use transactional versioning.

**Trap 2: Unscoped Cache Keys Causing Data Leaks**

Creating cache keys like `cache:user:profile` or `cache:orders` without embedding the tenant ID, user ID, or query parameters creates catastrophic data leak bugs. If User 101 requests their profile and the result is cached under `cache:user:profile`, User 102 will hit the cache on the next request and receive User 101's private personal data. A safe cache key must always incorporate all parameter dimensions: `cache:tenant:${tenantId}:user:${userId}:profile`.

**Trap 3: Hardcoded Synchronized TTLs Causing Cache Avalanches**

Setting an identical hardcoded TTL (for example, `ttl = 3600`) across all keys during batch initialization or cache pre-warming sets up a synchronized failure countdown. When that hour passes, all keys expire in the exact same second, wiping out the cache hit rate and slamming the database with a massive spike. Always apply randomized TTL jitter: `ttl = baseTtl + Math.floor(Math.random() * jitterSpan)`.

**Trap 4: Treating the Cache as a Hard Dependency Without Fallback**

Wrapping database calls inside a cache lookup without handling cache network failures will turn a minor Redis blip into a total site-wide outage. If Redis times out or drops a connection, an unhandled rejection will cause the HTTP request to fail with a 500 error. The caching layer must always wrap cache calls in try-catch blocks or circuit breakers, logging the error and gracefully degrading by fetching directly from the database.

**Trap 5: Storing Huge Uncompressed JSON Blobs**

Caching entire unindexed database rows or 5MB JSON response trees directly into Redis saturates Redis's single-threaded event loop and network interface during serialization and deserialization. A few large keys (hot mega-keys) will cause tail latencies to spike for all other lightweight keys sharing that Redis instance. Always prune unnecessary fields before caching, split massive records into smaller granular keys, or compress payloads using algorithms like Zstandard or Snappy if large objects are unavoidable.

**Trap 6: Caching Paginated Results Without Stable Sorting**

Caching database queries like `GET /items?page=2&limit=20` when the underlying SQL query lacks an explicit, deterministic `ORDER BY` clause causes items to jump between pages on cache misses. Furthermore, if a new item is inserted on page 1, page 2's cached response will become inconsistent with page 1, leading to duplicate or missing records for users browsing the catalog. For dynamic collections, cache individual items by ID and cache a list of sorted IDs separately.

## 7. Compare With Related Concepts

**Cache-Aside vs Write-Through**

Cache-Aside leaves cache management to the application code; data is loaded into the cache only upon a cache miss (lazy loading), and updated by invalidating keys on write. Write-Through forces all writes to pass synchronously through the cache to the database, ensuring the cache is always fresh at the cost of higher write latency.
- Rule: Use Cache-Aside for general read-heavy web applications where resilience against cache outages is required; use Write-Through only when data is read immediately after writing and stale reads cannot be tolerated.

**In-Memory Process Cache vs Distributed Cache (Redis)**

An In-Memory Process Cache stores data in application server RAM (Node.js heap) with zero network overhead (nanosecond access), but data is not shared across cluster pods and vanishes on pod restart. A Distributed Cache runs as an external cluster (Redis) accessible by all application pods over TCP (1-3ms latency), providing unified state and independent scalability.
- Rule: Use In-Memory Process Cache for small, immutable, or pod-local static data; use Distributed Redis Cache for shared application state, user sessions, and dynamic entity caching across multiple servers.

**Cache Invalidation vs TTL Expiration**

Cache Invalidation is an active, event-driven mechanism where the application explicitly deletes or evicts a cache key the instant the underlying database record changes. TTL Expiration is a passive, time-driven mechanism where keys are automatically discarded by the cache engine after a fixed duration has elapsed.
- Rule: Use active Cache Invalidation on writes to guarantee data freshness, and use TTL Expiration as a safety net to clean up orphaned, abandoned, or leaked keys.

**Application Caching (Redis) vs CDN Caching (Cloudflare / CloudFront)**

Application Caching sits in the data center directly in front of your database to cache processed application objects, database query results, and assembled JSON payloads. CDN Caching sits at the geographic edge of the internet close to the end user to cache static assets (images, JS/CSS bundles) and whole HTTP response bodies.
- Rule: Use CDN caching to eliminate HTTP traffic before it reaches your backend servers; use Redis application caching to accelerate backend compute and protect your database when requests must reach your API.

**Cache Stampede vs Cache Avalanche**

A Cache Stampede is triggered by the expiration of a **single, ultra-hot key** that causes thousands of concurrent requests for that specific item to hammer the database simultaneously. A Cache Avalanche is triggered by the simultaneous expiration of **thousands of distinct keys** across the system, causing a collective traffic flood across the entire database tier.
- Rule: Defend against Cache Stampedes using distributed mutex locking or probabilistic early refresh (XFetch); defend against Cache Avalanches using randomized TTL jitter.

## 8. 🧠 The Memory Hook

Treat your cache as a **defensive blast shield**, not a second database: **Delete on write** so you never store stale lies, **jitter your TTLs** so keys never die together, and **lock on cache misses** so only one worker ever wakes the database.
