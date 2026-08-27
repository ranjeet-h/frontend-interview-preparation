# MySQL Query Cache: Mechanics, Concurrency Bottlenecks, and Why It Was Removed in MySQL 8.0

## 1. The Real-World Problem — When You Actually Hit This

Imagine deploying a 64-core database server to handle a surge of 3,000 queries per second on your e-commerce platform. You notice identical `SELECT` queries hitting the database over and over to fetch catalog categories and homepage banners. In an effort to optimize, you enable the MySQL Query Cache and allocate 2 GB of RAM to it, expecting near-instant responses.

Instead of speeding up, production immediately melts down.

Query latency spikes from 3 milliseconds to over 400 milliseconds. CPU core utilization drops while system lock waits skyrocket. Throughput collapses by 80%. Every time a customer places an order or updates a shopping cart, the entire database stalls.

The culprit was a fundamental architectural bottleneck: the MySQL Query Cache relied on a single global mutex lock and coarse-grained, table-level invalidation. Every single write — even updating a single counter on a single row — forced MySQL to lock the entire cache, scan through memory, and evict every single cached query referencing that table. On modern multi-core processors, concurrent threads spent more time waiting in line to acquire the cache lock than it would have taken to execute the queries directly against the storage engine.

Understanding why the Query Cache failed and why it was completely stripped out in MySQL 8.0 is a quintessential milestone for senior engineers. It demonstrates how naive caching inside a relational database engine can destroy concurrency, and clarifies how modern systems properly separate storage engines, memory pools, and application caching layers.

## 2. The Analogy — Make the Mechanic Obvious

Think of a busy restaurant kitchen with 32 chefs (representing 32 CPU cores) cooking meals for hundreds of guests.

In the middle of the kitchen hangs a single chalkboard (the Query Cache) where completed dish recipes and plated food trays are stored. In front of that chalkboard stands a single security guard holding a single master key (the global mutex lock). Only one chef at a time is allowed to use the key.

When Chef A receives an order for `"Spaghetti Carbonara"`, Chef A waits in line for the key, unlocks the chalkboard, checks if an identical plate is already sitting there, grabs it, and serves it immediately. That feels fast when only one chef is working.

However, two fatal rules govern this kitchen:

1. **Character-for-Character Matching:** If the ticket reads `"spaghetti carbonara"` in lowercase, or has an extra space typed at the end, Chef A cannot use the tray labeled `"Spaghetti Carbonara"`. Chef A must ignore the board and cook from scratch.
2. **Total Table Invalidation:** If a prep cook chops a single sprig of parsley and adds it to the kitchen's inventory (representing a single row `INSERT` or `UPDATE` on a table), the security guard halts all 32 chefs. The guard grabs the chalkboard eraser and wipes out every single recipe and prepared dish on the board that uses *any* ingredient from that inventory.

Under heavy dinner rush, all 32 chefs spend their entire evening standing in a single-file line waiting for the security guard's key — either trying to see if a dish is ready or waiting for the board to be erased. Cooking dishes from scratch using fresh ingredients from the refrigerator (the InnoDB Buffer Pool) would have been dramatically faster.

## 3. The Full Explanation — How It Actually Works

The MySQL Query Cache operated at the MySQL Server layer (above the storage engines like InnoDB or MyISAM). Its goal was to bypass the SQL parser, pre-processor, optimizer, and storage engine entirely.

```txt
Client Query
     │
     ▼
┌────────────────────────────────────────────────────────┐
│ MySQL Server Layer                                     │
│                                                        │
│   Incoming SQL String ───► [ Hash Lookup ]             │
│                                   │                    │
│                     ┌─────────────┴─────────────┐      │
│                     │                           │      │
│             Cache Hit (Lock Mutex)      Cache Miss     │
│                     │                           │      │
│                     ▼                           ▼      │
│            Stream Cached Bytes            SQL Parser   │
│             to Client Socket                    │      │
│                                                 ▼      │
│                                           Query Optimizer
│                                                 │      │
└─────────────────────────────────────────────────┼──────┘
                                                  ▼
                                      ┌──────────────────────┐
                                      │ Storage Engine       │
                                      │ (InnoDB Buffer Pool) │
                                      └──────────────────────┘
```

Here is the exact step-by-step lifecycle of how it operated and why it broke down under real workloads.

**1. The exact hash lookup before parsing.** When a client sends a SQL query string over the TCP socket, MySQL performs a case-sensitive hash of the incoming raw query bytes *before* parsing the SQL syntax. To produce a cache hit, the incoming query must match the cached query byte-for-byte: character case matters (`SELECT * FROM users` does not match `select * from users`), whitespace and comments matter (`SELECT * FROM users;` does not match `SELECT  *  FROM users;`), and connection context matters (database name, client protocol capabilities, character set, and transaction isolation level must match identically). If the query string contains non-deterministic elements, MySQL flags it as non-cacheable immediately. Functions like `NOW()`, `CURRENT_TIMESTAMP()`, `RAND()`, `UUID()`, `CONNECTION_ID()`, references to user-defined variables (`@my_var`), or queries on temporary tables automatically bypass the cache.

**2. The global mutex lock contention.** The Query Cache structure was protected by a single global lock: `query_cache_mutex`. Whenever any client thread wanted to check whether its query existed in the cache (read), store a new query result in the cache (write), or invalidate cache entries due to a table change (eviction), that thread had to acquire the single `query_cache_mutex`. On multi-socket, multi-core servers, dozens of CPU cores competed for this exact memory location. This caused severe CPU cache-line bouncing across hardware cores, turning parallel execution threads into a serialized bottleneck.

**3. Coarse-grained table-level invalidation.** The Query Cache had no row-level awareness or primary key tracking. It maintained an internal lookup table mapping table names to the cached query results that referenced them. If a table had 50,000 different `SELECT` query results cached in memory and any transaction executed `UPDATE orders SET updated_at = NOW() WHERE id = 99482;`, MySQL acquired the global mutex, traversed the dependency list, and purged all 50,000 cached query entries for the `orders` table. Even if 49,999 of those queries were completely unrelated to order #99482, they were instantly deleted. On any system with regular write traffic, the cache hit ratio plummeted toward zero, while the server paid the full overhead of continuously allocating, locking, and deallocating memory blocks.

**4. Memory fragmentation and allocation stalls.** The Query Cache allocated variable-length memory blocks to hold serialized query results. As queries produced results of different sizes and invalidations punched holes in memory, the cache suffered from extreme memory fragmentation. When storing a large result set, MySQL often had to pause and prune smaller cache entries or run memory compaction under the global mutex lock, introducing random latency spikes of hundreds of milliseconds (known as "cache pruning stalls").

**5. Why MySQL 8.0 completely removed it.** In MySQL 5.6 and 5.7, the Query Cache was disabled by default (`query_cache_type = 0`). In MySQL 5.7.20, it was formally deprecated. In MySQL 8.0, the engineering team completely removed the Query Cache from the codebase. The reasoning was decisive: hardware evolved from single-core CPUs with slow spinning disks to 64+ core CPUs with high-throughput NVMe SSDs, and a single global mutex fundamentally prevents modern CPUs from scaling horizontally. Multi-Version Concurrency Control (MVCC) in InnoDB allows concurrent transactions to read consistent snapshots without blocking writers — the Query Cache broke this concurrency model by imposing global locks. Better, specialized caching layers evolved: the InnoDB Buffer Pool handles low-latency disk page caching, while distributed caches (Redis, Memcached) and intelligent proxies (ProxySQL) handle result-set caching without locking the database kernel.

## 4. See It In Practice — Real Code or Queries

**Inspecting Query Cache status on MySQL 5.7 and earlier.** In legacy MySQL versions, you inspect the Query Cache configuration and runtime metrics using system variables and status counters:

```sql
-- Check if Query Cache is enabled and its configured size
SHOW VARIABLES LIKE 'query_cache%';

-- Output example:
-- +------------------------------+----------+
-- | Variable_name                | Value    |
-- +------------------------------+----------+
-- | have_query_cache             | YES      |
-- | query_cache_limit            | 1048576  | -- Max size of a single result set (1 MB)
-- | query_cache_min_res_unit     | 4096     | -- Minimal memory block allocated (4 KB)
-- | query_cache_size             | 67108864 | -- Total memory allocated (64 MB)
-- | query_cache_type             | ON       | -- ON, OFF, or DEMAND
-- | query_cache_wlock_invalidate | OFF      |
-- +------------------------------+----------+

-- Check real-time cache performance and lock contention
SHOW STATUS LIKE 'Qcache%';

-- Output example:
-- +-------------------------+----------+
-- | Variable_name           | Value    |
-- +-------------------------+----------+
-- | Qcache_free_blocks      | 1120     | -- High count indicates memory fragmentation
-- | Qcache_free_memory      | 45218816 | -- Remaining memory in bytes
-- | Qcache_hits             | 18420    | -- Number of cache hits
-- | Qcache_inserts          | 52310    | -- Queries added to cache
-- | Qcache_lowmem_prunes    | 14200    | -- Queries evicted due to memory pressure
-- | Qcache_not_cached       | 4120     | -- Non-cacheable queries (e.g., using NOW())
-- | Qcache_queries_in_cache | 3400     | -- Total active queries in cache
-- | Qcache_total_blocks     | 8200     |
-- +-------------------------+----------+
```

**Demonstrating exact byte sensitivity and non-deterministic bypasses.**

```sql
-- Query 1: Seed entry into cache
SELECT id, username, email FROM users WHERE status = 'active';

-- Query 2: CACHE MISS! Lowercase keywords change the hash
select id, username, email from users where status = 'active';

-- Query 3: CACHE MISS! Extra trailing space changes the hash
SELECT id, username, email FROM users WHERE status = 'active' ;

-- Query 4: NEVER CACHED! NOW() makes the query non-deterministic
SELECT id, username FROM users WHERE last_login > NOW() - INTERVAL 1 DAY;

-- Query 5: NEVER CACHED! Uses user session variable
SET @min_score = 100;
SELECT id, username FROM users WHERE score > @min_score;
```

**The invalidation chain reaction.**

```sql
-- Step 1: Client A executes a heavy analytical query (takes 120ms first time, gets cached)
SELECT category_id, COUNT(*), AVG(price) 
FROM products 
GROUP BY category_id;

-- Step 2: Client B executes a completely different query on products (gets cached)
SELECT * FROM products WHERE sku = 'TECH-99128';

-- Step 3: Client C updates a single inventory count on an unrelated product
UPDATE products SET stock_quantity = stock_quantity - 1 WHERE id = 14;

-- WHAT HAPPENS INTERNALLY:
-- 1. MySQL acquires query_cache_mutex.
-- 2. It identifies that the `products` table was modified.
-- 3. It invalidates BOTH Query 1 and Query 2, along with every other cached query touching `products`.
-- 4. Next time Client A or Client B queries, both suffer a full cache miss and must re-execute.
```

**The modern alternative: application-level cache-aside pattern.** Instead of relying on the database engine to cache result sets, modern production architectures use an external, in-memory store like Redis with fine-grained keys:

```typescript
import { createClient } from 'redis';
import mysql from 'mysql2/promise';

const redis = createClient({ url: 'redis://localhost:6379' });
const db = await mysql.createConnection({ host: 'localhost', user: 'app', database: 'ecommerce' });

interface Product {
  id: number;
  name: string;
  price: number;
  stock_quantity: number;
}

// Fine-grained Cache-Aside pattern
async function getProductById(productId: number): Promise<Product | null> {
  const cacheKey = `product:${productId}`;

  // 1. Check Redis (O(1) in-memory lookup, non-blocking to MySQL)
  const cachedData = await redis.get(cacheKey);
  if (cachedData) {
    return JSON.parse(cachedData) as Product;
  }

  // 2. Cache Miss: Query MySQL using indexed primary key lookup
  const [rows] = await db.execute<mysql.RowDataPacket[]>(
    'SELECT id, name, price, stock_quantity FROM products WHERE id = ?',
    [productId]
  );

  if (rows.length === 0) return null;

  const product = rows[0] as Product;

  // 3. Populate Redis with a defined TTL (e.g., 3600 seconds)
  // This isolates this product; changing another product does NOT invalidate this cache entry
  await redis.setEx(cacheKey, 3600, JSON.stringify(product));

  return product;
}

async function updateProductStock(productId: number, newStock: number): Promise<void> {
  // 1. Update the database within a transaction
  await db.execute(
    'UPDATE products SET stock_quantity = ? WHERE id = ?',
    [newStock, productId]
  );

  // 2. Evict ONLY this specific product's cache key in Redis
  // All other cached products remain intact in memory!
  await redis.del(`product:${productId}`);
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What was the MySQL Query Cache and how did it determine a cache hit?**

The MySQL Query Cache was an internal subsystem in MySQL 5.7 and earlier that stored the exact text of a `SELECT` query along with its serialized result set in RAM. When a client sent a query, MySQL hashed the raw incoming string before parsing or optimizing it. A cache hit occurred only if the incoming query matched the cached query byte-for-byte, including case, whitespace, database schema, character set, and client flags. If matched, MySQL skipped parsing and disk access entirely, streaming the pre-packaged result bytes directly back to the client socket.

**Q: Why was the Query Cache completely removed in MySQL 8.0 instead of being improved or partitioned?**

The Query Cache was removed because its architecture fundamentally conflicted with modern multi-core, high-concurrency systems. It suffered from two unsolvable design flaws. First, global lock contention: all reading, writing, and invalidation operations required acquiring a single global mutex (`query_cache_mutex`), causing massive lock waits and CPU cache-line bouncing across multi-core processors. Second, coarse table-level invalidation: any write (`INSERT`, `UPDATE`, `DELETE`) to a table invalidated *all* cached queries referencing that table, regardless of which rows were modified. The MySQL engineering team determined that partitioning the mutex or attempting row-level invalidation inside the server layer would introduce unacceptable complexity and overhead, especially when storage engines like InnoDB already provide efficient memory caching via the Buffer Pool, and external caches like Redis handle result-set caching far more effectively.

**Q: What is the difference between the MySQL Query Cache and the InnoDB Buffer Pool?**

The Query Cache operated at the MySQL Server layer above the engines, caching exact SQL query strings mapped to raw result sets. It bypassed parsing and the optimizer, but invalidated entire tables on any write and locked globally. The InnoDB Buffer Pool operates inside the storage engine layer, caching raw 16 KB data and index pages in memory. It does not cache query result sets; instead, it caches physical disk blocks. When queries execute, InnoDB reads pages from RAM at microsecond speeds, utilizing row-level locking, MVCC snapshots, and multi-threaded buffer pool instances without any global table invalidation.

**Q: If a table has 10 million rows and you update one non-indexed column on one row, what happened to the Query Cache?**

MySQL acquired the global `query_cache_mutex`, inspected the registration table for that specific table name, and immediately evicted 100% of all cached query results referencing that table from memory. It did not matter that only one row was altered out of 10 million; table-level invalidation purged every single cached query on that table.

**Q: Why do queries with functions like `NOW()`, `UUID()`, or `RAND()` bypass the Query Cache?**

These functions are non-deterministic: their return values change on every execution. If MySQL cached the result of `SELECT * FROM events WHERE event_time <= NOW()`, subsequent calls within the same second or hour would return stale, incorrect data matching the timestamp of the first execution. To preserve query correctness, the MySQL parser explicitly identifies non-deterministic functions and flags the query as uncacheable.

**Q: What are the best practices for caching database queries in modern systems?**

First, size the InnoDB Buffer Pool properly: set `innodb_buffer_pool_size` to 60–80% of available server RAM so hot table and index pages stay resident in memory. Second, use application-level caching (Redis/Memcached): cache parsed objects or domain entities by explicit ID (e.g., `user:101`) with explicit TTLs and cache-aside or write-through invalidation. Third, use database proxies (e.g., ProxySQL): for read-heavy legacy applications where application code cannot be easily modified, deploy ProxySQL in front of MySQL. ProxySQL provides rule-based query caching with configurable TTLs without locking the MySQL database kernel.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Allocating a huge `query_cache_size` to "fix" performance.** The wrong assumption is "our server has 128 GB of RAM, so giving 16 GB to `query_cache_size` will ensure almost all our queries are cached and super fast." Why it fails: the larger the Query Cache memory pool, the worse it performs. When a table invalidation occurs, MySQL must traverse a massive memory structure under the global mutex lock to free blocks. Memory allocation and deallocation times scale with cache size. On large caches (over 256 MB), a single `UPDATE` can hold the global mutex for hundreds of milliseconds, freezing all other database connections. The fix: in MySQL 5.7, if enabled at all, keep `query_cache_size` small (under 64 MB–128 MB) and use `DEMAND` mode with `SQL_CACHE` hints. In MySQL 8.0, allocate that memory to `innodb_buffer_pool_size`.

**Trap 2: Believing prepared statements or ORMs work seamlessly with Query Cache.** The wrong assumption is "our ORM formats queries consistently, so we will get a near 100% Query Cache hit rate." Why it fails: parameterized prepared statements (`PREPARE` / `EXECUTE` protocol) in older MySQL versions did not use the Query Cache in the same way as standard text queries. Furthermore, minor differences in generated SQL — such as column ordering, aliases, dynamic whitespace, or varying `IN (?, ?, ?)` parameter counts — create completely distinct hash keys, resulting in constant cache misses. The fix: do not rely on server-side query text caching. Use application-level caching keyed on domain entity IDs.

**Trap 3: Confusing query result caching with execution plan caching.** The wrong assumption is "the MySQL Query Cache caches the compiled query execution plan, like PostgreSQL, Oracle, or SQL Server." Why it fails: the MySQL Query Cache stored raw result set payloads, not compiled execution plans. If a query missed the cache, MySQL still had to parse, lex, and optimize the execution plan from scratch every single time. MySQL 8.0 introduced statement digest tracking and improved internal query optimization, but does not feature a generic shared plan cache like Oracle. Ensure efficient indexes are present so the optimizer resolves plans in sub-millisecond time.

**Trap 4: Enabling Query Cache on mixed read/write workloads.** The wrong assumption is "our application is 85% reads and only 15% writes, so the Query Cache will easily pay for itself." Why it fails: even a 5% write ratio on active tables will continuously flush the Query Cache. The system incurs the overhead of computing hashes, acquiring mutexes, storing result sets, and immediately invalidating them, resulting in net-negative throughput compared to having the cache completely disabled. This is the most common production mistake — expecting it to help a write-heavy or even moderately write-mixed workload. The fix: completely disable Query Cache (`query_cache_type = 0` and `query_cache_size = 0`) on any database that experiences frequent write traffic.

## 7. Compare With Related Concepts

| Feature / Metric | MySQL Query Cache (Legacy) | InnoDB Buffer Pool | Application Cache (Redis / Memcached) | ProxySQL Query Cache |
| :--- | :--- | :--- | :--- | :--- |
| **Where It Lives** | MySQL Server layer | Storage Engine layer (InnoDB) | External dedicated service | Network proxy layer |
| **What It Caches** | Exact SQL string → Raw result set | Physical 16 KB data and index pages | Structured domain objects, JSON, strings | SQL regex match → Result set |
| **Invalidation Granularity** | Entire Table (coarse-grained) | LRU page eviction / dirty page flushing | Specific Key / TTL (fine-grained) | Configurable TTL |
| **Locking Mechanism** | Single global mutex (`query_cache_mutex`) | Mutex per Buffer Pool instance / page latch | Multi-threaded or epoll non-blocking event loop | Independent proxy memory locks |
| **Multi-Core Scaling** | Degrades severely with concurrency | Scales across cores via multiple instances | Scales linearly with CPU / network | Scales independently of DB |
| **Status in MySQL 8.0** | **Removed completely** | **Core active mechanism** | **Industry standard practice** | **Active production tool** |

**Crisp decision rules:** If you need fast data access with ACID guarantees and row-level concurrency, rely on the InnoDB Buffer Pool. If you need to cache expensive API responses, user sessions, or aggregated domain entities, use an external Redis cluster. If you have an unmodifiable legacy application with heavy duplicate read queries that need edge caching, place ProxySQL in front of MySQL.

## 8. 🧠 The Memory Hook

The MySQL Query Cache was a single-locked chalkboard that stored raw query strings against raw results, erased entirely whenever a single row changed anywhere on the table. It died in MySQL 8.0 because modern multi-core servers cannot afford a global mutex that turns parallel CPUs into a single-file queue.
