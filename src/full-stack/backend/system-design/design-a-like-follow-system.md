# Design a Like and Follow Graph System (Instagram / Twitter)

## 1. Understand the Problem First — Clarify Before Designing

Imagine it is Super Bowl Sunday or Lionel Messi posting a photo after winning the World Cup. Within sixty seconds, that single photo receives 500,000 likes per second.

If your backend executes a standard database transaction like `UPDATE posts SET like_count = like_count + 1 WHERE id = :post_id` alongside `INSERT INTO post_likes (user_id, post_id) VALUES (...)`, your relational database will collapse instantly. Row-level locks on that single post record queue up tens of thousands of connections, pool limits are exceeded within 200 milliseconds, and connection timeouts cascade across every microservice sharing that database cluster.

At the exact same moment, millions of users open the app and trigger graph queries: "Does Alice follow Bob?", "Who are our mutual followers?", and "List everyone following this celebrity account." If your system tries to execute a relational `JOIN` across a 50-billion-row social graph table on every feed load, query latencies skyrocket from 10 milliseconds to 15 seconds.

Before drafting any architecture on the whiteboard, establish the operational boundaries:

- **Core Actions:** Users can like/unlike posts (and comments), follow/unfollow users, view aggregated like and follower counts, check whether they personally liked/followed an entity, and view mutual follow relationships ("Followed by Sarah, Alex, and 12 others you follow").
- **Traffic Scale:** 500 million Daily Active Users (DAU). Average write load of 50,000 likes/sec and 10,000 follows/sec, with peak viral bursts reaching 500,000+ writes/sec on a single post.
- **Read-to-Write Ratio:** Overwhelmingly read-heavy (100:1 for like checks and counts during feed scrolling; 1,000:1 for profile follower views).
- **Latency SLAs:** Like/Follow action p99 < 50ms; Count and status reads p99 < 10ms.
- **Consistency vs. Availability:** High Availability (AP in CAP theorem). An aggregate like count lagging by 3 likes for five seconds during a viral spike is completely acceptable (eventual consistency). However, individual user state ("Did I like this?") must be immediately consistent for the acting user (read-your-own-writes consistency), and actions must be strictly idempotent to prevent duplicate likes or follows on network retries.

## 2. The Core Insight — The Decision Everything Else Flows From

The foundational mistake in social graph design is treating a relationship action as a single atomic database record.

A like or follow consists of two completely different data access patterns disguised as one:
1. **The Directed Graph Edge:** A discrete, binary relationship between two entity IDs (`User A -> liked -> Post B` or `User A -> follows -> User B`). This requires fast point-lookups ($O(1)$) and set intersection capabilities.
2. **The Aggregate Counter:** A high-velocity numeric integer (`like_count`, `follower_count`) that experiences extreme write contention on hot keys.

The decision everything else flows from is **complete architectural decoupling of the Edge Store from the Counter Aggregator**.

Graph edge persistence and verification is routed to a distributed partitionable storage engine, while counter increments are absorbed purely in-memory through high-throughput caching buffers and flushed asynchronously to long-term storage in micro-batches. You never lock a database row to increment a counter.

## 3. High-Level Architecture — Components and Why Each Exists

To handle millions of reads alongside intense write bursts, the system separates fast-path edge validation and in-memory aggregation from durable asynchronous persistence.

```txt
Write Flow (Like / Follow Action):
Client ──> API Gateway (Auth & Rate Limit) ──> Like / Follow Service
                                                    │
             ┌──────────────────────────────────────┴──────────────────────────────────────┐
             ▼                                                                             ▼
   Redis Cache Cluster                                                            Kafka Message Broker
   • Edge Check (Set / Bitfield)                                                  • Topic: 'entity-actions'
   • In-Memory Counter (INCRBY / DECRBY)                                                   │
             │                                                                             ▼
             ▼                                                                    Async Write-Back Workers
   Fast HTTP 200 Response to Client                                                        │
   (~15ms total latency)                                                          ┌────────┴────────┐
                                                                                  ▼                 ▼
                                                                            Primary DB         Notification
                                                                            (Edge Store)       & Feed Engine

Read Flow (Feed & Profile Queries):
Client ──> API Gateway ──> Read Service ──> Redis Cluster ──(Cache Miss)──> Primary DB / Replicas
                               (Count & Status)
```

Each component fulfills a distinct responsibility:

- **API Gateway & Rate Limiter:** Authenticates requests via JWT, terminates TLS, and enforces token-bucket rate limits per `user_id` to block automated spam bots and click-flooding.
- **Like / Follow Service (Stateless):** Receives the mutation, generates or validates an `Idempotency-Key`, immediately updates the fast in-memory cache, and emits an immutable event payload to the message broker.
- **Redis Cluster (In-Memory Hot Layer):**
  - Acts as the first-line read cache for `has_liked(user_id, post_id)` and `is_following(src, dst)`.
  - Maintains real-time numeric counters using atomic `INCRBY` / `DECRBY` operations.
  - Houses active user relationship sets for instant set intersection (`SINTER`) on mutual follow queries.
- **Kafka Message Broker:** Buffers high-velocity action events (`post_id`, `user_id`, `action_type`, `timestamp`). Absorbs sudden traffic spikes without passing load directly to persistent disks.
- **Async Write-Back Workers:** Pull batches of events from Kafka (e.g., 2,000 events per chunk or every 200ms), execute bulk upserts or deletes into the persistent graph database, and flush aggregated counter deltas.
- **Primary Graph Edge Store:** Long-term durable source of truth storing directed edges and baseline counts across distributed partitions.
- **Downstream Fan-Out Consumers:** Independent consumer groups listening to Kafka to trigger push notifications ("Alice liked your photo") and feed distribution jobs without impacting mutation latency.

A standard Like request executes end-to-end in milliseconds:
1. The mobile client sends `POST /v1/posts/88492/likes` with header `Idempotency-Key: c9a4b872` and the user's auth token.
2. The service checks Redis: atomically adds `user_id` to the post's active likers set and executes `INCR post:88492:likes`.
3. The service publishes `{post_id: 88492, user_id: 104, action: "LIKE", timestamp: 1718002000}` to the Kafka topic `post-likes`.
4. The service immediately returns HTTP 200 with the new cached count to the client.
5. The client flips the UI heart icon to active state instantly (optimistic UI update).
6. In the background, Write-Back workers pull the message from Kafka and execute a batched SQL `INSERT INTO post_likes VALUES (88492, 104) ON CONFLICT DO NOTHING;` to guarantee durability.

## 4. Key Technical Decisions — With Real Tradeoffs

### Decision 1: High-Throughput Counter Aggregation — Redis Write-Back Buffering vs. Sharded SQL Counters

- **Option Considered:** Sharded Counters in SQL. The system creates $N$ counter rows per post (e.g., 20 shards) and randomizes increments across shards (`UPDATE post_like_shards SET count = count + 1 WHERE post_id = :id AND shard_id = FLOOR(RAND() * 20)`). Total count equals `SUM(count)`.
- **Option Chosen:** Redis In-Memory Counter (`INCRBY`) backed by Kafka Asynchronous Batch Write-Back.
- **Reasoning:** Even with 20 SQL shards, a viral event of 500,000 writes/sec still routes 25,000 locking disk writes per second to each shard, saturating database disk I/O and replication pipelines. In-memory `INCRBY` in Redis executes in sub-millisecond single-threaded memory operations without disk write locks.
- **Tradeoff Accepted:** If a Redis node dies before Kafka writes are processed by workers, there could be a minor discrepancy between the cache count and database records. This is resolved via periodic background reconciliation jobs that sync the database count with Redis.

### Decision 2: Graph Edge Storage — Wide-Column Store vs. Graph Database vs. Sharded Relational SQL

- **Option Considered:** Graph Database (e.g., Neo4j). Graph databases excel at complex multi-hop pathfinding (e.g., "Find friends of friends who work at Company X"), but they suffer severe write-throughput bottlenecks and poor horizontal sharding under tens of billions of simple directed edges.
- **Option Considered:** Single Relational Table with B-Tree Indexes. `likes (post_id, user_id, created_at)`. At 50 billion rows, B-tree reindexing on high-volume inserts causes massive write amplification and lock escalation.
- **Option Chosen:** Distributed Wide-Column Store (Cassandra / ScyllaDB) or Horizontally Sharded PostgreSQL partitioned by `entity_id`.
  - For Follows: Cassandra table `user_following` with Partition Key `user_id` and Clustering Key `following_user_id`; paired with a reverse index table `user_followers` with Partition Key `user_id` and Clustering Key `follower_user_id`.
  - For Likes: Wide-column table with Partition Key `post_id` and Clustering Key `user_id`.
- **Tradeoff Accepted:** Dual-writing to both `user_following` and `user_followers` tables requires application-level coordination or asynchronous queue workers to keep both sides of the directed edge in sync.

### Decision 3: "Did I Like / Follow?" Status Checks — Redis Sets vs. Bloom Filters vs. Direct Edge Lookups

- **Option Considered:** Storing full Redis Sets for all posts (`SADD post:{id}:likers {user_id}`).
- **Why it Fails for Viral Posts:** A post with 50 million likes would create a single Redis Set key containing 50 million integer IDs (~400MB). Reading or modifying that single key creates network bottlenecks and memory allocation stalls in Redis.
- **Option Chosen:** Hybrid Edge Checking:
  - For general users and normal posts: Cache the user's active following/liked IDs in Redis Sets with a reasonable cardinality limit (e.g., up to 5,000 recent entries).
  - For viral posts and cache misses: Point-lookup against the partitioned database cluster querying primary key `(post_id, user_id)`. Because `post_id` is the partition key, this is a single-disk-seek $O(1)$ query that executes in < 2ms.
  - On the client side: Maintain a local SQLite/IndexedDB cache of items the logged-in user has liked during their active session.

## 5. Deep Dives — The Parts That Actually Matter

### Deep Dive 1: Absorbing Hot-Key Celebrity Spikes with In-Memory Micro-Batching

When a global celebrity with 100 million followers publishes a post or goes live, hundreds of thousands of users hit the "Like" button concurrently. Even sending 500,000 independent network requests per second to a single Redis instance will saturate the Redis server's network interface card (NIC) and CPU core.

To survive extreme hot-key bursts, implement a **Two-Tier Aggregation Buffer**:

```txt
500k Likes/sec ──> [ 50 Stateless API Web Nodes ]
                         │
                         ├─ Node 1: In-Memory ConcurrentHashMap collects likes for Post #99 for 100ms
                         │          Local Buffer: Post #99 Delta = +420 likes
                         │
                         ├─ Node 2: Local Buffer: Post #99 Delta = +380 likes
                         │
                         ▼ (Flushed every 100ms via Redis Pipeline)
                    [ Redis Master Node ]
                    Executes: INCRBY post:99:likes 420
                              INCRBY post:99:likes 380
                    (Reduces 500,000 network commands/sec down to 500 batch commands/sec!)
```

Each stateless API container holds an in-memory thread-safe buffer (e.g., `ConcurrentHashMap<PostId, LongAdder>`).
Instead of sending every single like directly over the network to Redis, the API server increments its local in-memory counter. Every 100 milliseconds, a background timer thread drains the map and executes a single Redis `INCRBY post:{id}:likes {local_delta}` command using Redis pipelining.

This technique collapses write amplification by a factor of 1,000x before the traffic ever touches the cache infrastructure.

### Deep Dive 2: Fast Mutual Follows Calculation (Set Intersections at Scale)

Calculating "Mutual Follows" requires computing the mathematical intersection between two sets:
$$\text{Mutual}(A, B) = \text{Following}(A) \cap \text{Followers}(B)$$

If User A visits User B's profile, how do we render "Followed by Alice, David, and 8 others you follow" in under 10ms?

**Case A: Both Users have Normal Follower Counts (< 5,000):**
The service queries Redis directly using `SINTER`:
```txt
SINTER user:A:following user:B:followers
```
Redis executes set intersection in $O(N \times M)$ worst case, but internally optimizes by iterating through the smaller set and performing $O(1)$ hash lookups in the larger set ($O(K)$ where $K = \min(|A|, |B|)$). For sets under 5,000 items, this computation takes less than 1 millisecond.

**Case B: The Asymmetric Celebrity Problem (User B has 80 Million Followers):**
Loading 80 million follower IDs into a Redis set is impossible. Trying to compute `SINTER` against an 80-million-element set will block Redis's single-threaded event loop and take down the cluster.

Instead, invert the query direction using the client's bounded context:
1. User A follows an average of 400 people. We load User A's 400 `following_ids` from Redis (a tiny 3KB payload).
2. We query the durable Cassandra/ScyllaDB follower table using a multi-key partition query:
```sql
SELECT follower_id FROM user_followers
WHERE user_id = :celebrity_B_id
  AND follower_id IN (400 IDs from User A's following list);
```
3. Cassandra routes this query directly to the partition for Celebrity B and scans only the 400 requested clustering keys.
4. The database returns the matching IDs in ~5ms without ever materializing the 80-million follower list in memory.

### Deep Dive 3: Idempotent State Transitions and Race Condition Handling

Network instability on mobile devices causes users to double-tap buttons or trigger rapid retries. Furthermore, a user can rapidly toggle Like $\rightarrow$ Unlike $\rightarrow$ Like within 500 milliseconds. If network packets arrive out of order, an older "Unlike" packet could arrive *after* a newer "Like" packet, leaving the user's feed in a corrupted state.

To guarantee strict idempotency and eliminate race conditions:

1. **Client Event Monotonic Timestamps:** Every action packet includes a client-generated monotonic epoch timestamp and an idempotency token (`UUIDv4`).
2. **Atomic Set Operations for State:** In Redis, we do not use simple strings; we use Redis Sets or Sorted Sets where the score is the action timestamp:
```txt
ZADD post:88492:liked_users 1718002000 user:104
```
3. **Database Conditional Upserts:** In PostgreSQL or Cassandra, writes use conditional clauses based on timestamp versioning:
```sql
-- Adding a Like
INSERT INTO post_likes (post_id, user_id, created_at)
VALUES (:post_id, :user_id, :timestamp)
ON CONFLICT (post_id, user_id)
DO UPDATE SET created_at = EXCLUDED.created_at
WHERE post_likes.created_at < EXCLUDED.created_at;

-- Removing a Like (Unlike)
DELETE FROM post_likes
WHERE post_id = :post_id
  AND user_id = :user_id
  AND created_at <= :timestamp;
```
If an out-of-order "Unlike" event arrives with timestamp $T_1$ while the database record already holds a newer "Like" timestamp $T_2$ ($T_1 < T_2$), the `DELETE` query matches zero rows and safely no-ops.

## 6. Failure Modes and Resilience

### 1. Redis Cache Node Crash and Thundering Herd
- **Failure:** A primary Redis node holding hot counters and active edge sets crashes. Thousands of incoming read requests simultaneously miss the cache and hammer the persistent database layer.
- **Mitigation:**
  - **Singleflight Pattern (Mutex Caching):** When a cache miss occurs, the API service acquires a short-lived distributed lock (or in-process mutex) for that specific `entity_id`. Only one worker queries the database and repopulates Redis; all other concurrent requests wait on that single promise.
  - **Probabilistic Early Expiration (XFetch):** Background routines refresh expiring cache keys before they fully hit TTL based on access frequency.

### 2. Kafka Consumer Lag and Write-Back Backpressure
- **Failure:** A massive surge of 20 million likes causes Kafka consumer lag to grow. In-memory Redis counters reflect real-time counts, but durable database rows lag behind by hours. If Redis experiences catastrophic eviction, counts cannot be recovered from the database.
- **Mitigation:**
  - Partition Kafka topics by `post_id % num_partitions`. This guarantees that all mutations for a specific post land on the same consumer worker, maintaining write order while scaling consumers horizontally across hundreds of partitions.
  - Workers use bulk multi-row inserts (`INSERT INTO ... VALUES (...), (...), (...)`) up to 1,000 rows per transaction, increasing write throughput by over 40x compared to single-row statements.

### 3. Partition Hotspots on Celebrity Follower Records (Cassandra Wide Rows)
- **Failure:** Storing 100 million follower IDs under a single Cassandra partition key (`user_id = celebrity_id`) causes that partition to exceed Cassandra's recommended 100MB partition limit, causing garbage collection pauses and node disk exhaustion.
- **Mitigation:**
  - **Virtual Bucket Partitioning:** Shard the celebrity's followers across multiple sub-partitions using a compound key:
    $$\text{Partition Key} = (\text{user\_id}, \text{bucket\_id})$$
    where $\text{bucket\_id} = \text{hash}(\text{follower\_user\_id}) \pmod{100}$.
  - This spreads the 100 million followers evenly across 100 physical nodes in the storage cluster, eliminating individual hot storage nodes.

## 7. What Makes a Great Answer vs an Average One

| Evaluation Dimension | Average Candidate Answer | Senior Architect Answer |
|---|---|---|
| **Counter Architecture** | Uses relational `UPDATE posts SET like_count = like_count + 1` or suggests running `SELECT COUNT(*)` on query load. | Decouples counters into in-memory Redis buffers (`INCRBY`) with API-tier micro-batching and asynchronous Kafka write-back to avoid row locks. |
| **Social Graph Modeling** | Suggests a pure Graph DB (Neo4j) without addressing its write-throughput and sharding limits at tens of billions of edges. | Selects distributed wide-column storage (Cassandra/ScyllaDB) with dual-table indexing (`following` and `followers`) partitioned for sub-millisecond lookups. |
| **Hot-Key / Celebrity Traffic** | Assumes all users have similar traffic patterns; stores full follower lists in single Redis keys. | Identifies partition limits; implements virtual bucket sharding for celebrity nodes and avoids materializing multi-million-element sets in cache. |
| **Mutual Graph Intersection** | Suggests expensive SQL self-joins (`JOIN user_followers f1 ... JOIN user_followers f2`). | Explains $O(K)$ set intersections using Redis `SINTER` for normal accounts and inverts queries via multi-key partition scans for asymmetric celebrity accounts. |
| **Data Consistency & Race Conditions** | Ignores out-of-order delivery and double-taps; assumes network requests arrive sequentially. | Implements monotonic timestamp fencing, idempotency keys, and conditional SQL upserts to guarantee safe out-of-order reconciliation. |

## 8. 🧠 The Memory Hook

**Decouple the graph edge from the counter integer.** Buffer the burst in memory, batch the durable edge to disk, and bucket the celebrity partition.
