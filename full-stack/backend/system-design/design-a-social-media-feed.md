# Design a Social Media Feed (Twitter / Instagram)

## 1. Understand the Problem First — Clarify Before Designing

Imagine launching a social media application with a standard relational database. During internal testing with 100 accounts, everything runs smoothly. In production, a user following 1,200 active creators opens their app. The backend runs a relational query joining the `follows` table with the `posts` table across 80 million rows, sorts the results by creation timestamp, and takes 9.4 seconds to respond. Meanwhile, a global sports star with 110 million followers posts a victory photo. If your system naively iterates through every follower to write the post into their inbox, your message broker spikes to 110 million queued jobs in seconds, Redis CPU saturates at 100%, memory exhausts, and ordinary users stop seeing new posts for the next 40 minutes.

Designing a social media feed requires structuring data and asynchronous pipelines so that generating a customized, fresh timeline takes milliseconds regardless of whether a user follows 5 people or 5,000, or whether an author has 10 followers or 100 million.

Before sketching architecture or choosing databases, clarify these essential dimensions with the interviewer:

- **Feed Ordering & Logic:** Is this a reverse-chronological timeline (newest first, like early Twitter or Mastodon) or an algorithmic, ranked feed (personalized by engagement, relevance, and affinity, like Instagram, TikTok, or modern X)?
- **Scale & Traffic Profiles:** What is the Daily Active User (DAU) count? For this design, let us assume **300 million DAU**. Social media systems are heavily read-skewed, typically between **100:1 and 500:1 read-to-write ratio**. If 300 million users check their feed 5 times a day, that generates **1.5 billion feed views per day (~17,500 queries per second average, ~35,000 peak read QPS)**. If 50 million users post once per day, that is **50 million posts per day (~600 writes per second average, ~2,000 peak write QPS)**.
- **Latency & Availability Targets:** Read latency P99 must stay under **200 milliseconds** for the first page (top 20 posts). Write ingestion should return an acknowledgment to the author within **500 milliseconds**, with new posts appearing in follower feeds within **5 seconds**.
- **Consistency vs Availability (CAP):** Availability and low latency strictly trump strong consistency. Eventual consistency is completely acceptable: if a follower sees a post 3 seconds later than another follower, user experience remains unaffected. Returning a 500 error or a blank screen is unacceptable.

## 2. The Core Insight — The Decision Everything Else Flows From

The foundational architectural challenge of a social feed is the **Asymmetric Fan-Out Problem**: writes are cheap for ordinary users and disastrous for celebrities, whereas reads are fast if precomputed and painfully slow if generated dynamically across thousands of followees on every request.

Two extreme strategies exist, and both fail when applied across the entire user base:

- **Pure Fan-Out on Write (Push Model):** When an author publishes a post, a background worker pushes that `post_id` directly into the precomputed timeline cache of every single follower. Reads become an instantaneous O(1) cache lookup. However, when an account with 80 million followers posts, the system must perform 80 million cache writes. This causes write amplification, message queue lag, and massive memory waste for inactive followers who may not open the app for months.
- **Pure Fan-Out on Read (Pull Model):** When an author publishes, the system writes the post only to the author's own timeline. When a user requests their feed, the system looks up all accounts they follow, queries the latest posts from all those accounts, merges the lists in memory, sorts them, and returns the top 20. Writes are O(1), but reads become an expensive scatter-gather operation across hundreds of database shards, driving latency past several seconds for users with large follow graphs.

The decision that anchors this entire system is the **Threshold-Based Hybrid Fan-Out Architecture**:

- **Standard Users (< 25,000 followers):** Use **Fan-Out on Write**. When they post, their new post ID is immediately pushed into their active followers' Redis timeline caches.
- **Celebrities & High-Follower Accounts (> 25,000 followers):** Use **Fan-Out on Read**. Their posts are written only to their personal post stream. They are never pushed to millions of follower caches. Instead, when a follower requests their feed, the feed service pulls the precomputed timeline from Redis, queries the recent posts of any followed celebrities, and merges them in memory at read time.
- **Active vs Inactive User Filter:** Feed caches are maintained exclusively for **active users** (users who logged in within the past 7 days). Inactive users have no timeline in Redis; their feed is reconstructed on demand only when they open the app.

## 3. High-Level Architecture — Components and Why Each Exists

A production social feed separates the write path (post creation and fan-out distribution) from the read path (feed generation, merge, ranking, and hydration).

```txt
[ WRITE PATH ]
Client ──► API Gateway ──► Post Ingestion Service ──► Post Storage DB (Cassandra / Scylla)
                                  │
                       Emits PostCreatedEvent
                                  ▼
                            Apache Kafka
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
      [Standard Creator Path]           [Celebrity Creator Path]
         Fan-Out Workers                   Celebrity Post Stream
                 │                                 │
     Pushes post_id into active                    │ (Saved to author stream only)
     follower Redis ZSET caches                    │
                 │                                 │
                 ▼                                 ▼
         Redis Timeline Cache              Celebrity Timeline DB
         (User Inbox ZSET)                 (Partitioned by Author)

─────────────────────────────────────────────────────────────────────────────────

[ READ PATH ]
Client ──► CDN (Media/Static)
   │
   └──► API Gateway ──► Feed Aggregation Service
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
       Read Active User Inbox           Read Followed Celebrities
       (Redis ZSET: Top IDs)            (Recent Post IDs from DB/Cache)
               │                               │
               └───────────────┬───────────────┘
                               ▼
                    In-Memory Merge & Dedupe
                               ▼
                    Ranking & Scoring Engine
                               ▼
                   Hydration Service (MGET)
                   (Fetches text, author, media)
                               ▼
                   Client (JSON + Thumbnails)
```

Each component fulfills a dedicated responsibility:

- **API Gateway & CDN:** Handles SSL termination, JWT authentication, rate limiting, and request routing. The CDN caches user avatars, image thumbnails, and static assets at edge locations close to users.
- **Post Ingestion Service:** Validates post text and media signatures, writes the durable post record to the database, uploads raw media references to object storage, and emits an asynchronous event to the message broker.
- **Apache Kafka (Event Broker):** Decouples post ingestion from the fan-out process. Kafka partitions events by `author_user_id` so that an author's posts are processed in strict chronological order while worker pools scale horizontally.
- **Social Graph Service (Followers DB):** Maintains the directed follow relationships (`follower_id`, `followee_id`, `created_at`). Uses a distributed graph store or relational database with a read cache (Redis Set) to return follower lists in milliseconds.
- **Fan-Out Workers:** Consumes `PostCreatedEvent`. Queries the Social Graph Service. If the author is under the follower threshold, workers fetch active follower IDs and insert the `post_id` into each follower's Redis Sorted Set. If over the threshold, workers skip fan-out.
- **Redis Timeline Cache Cluster:** Stores a Sorted Set (`ZSET`) per active user. The member is the `post_id` and the score is the creation timestamp (or initial ranking score). Each set is capped to the most recent 800 items to bound memory usage.
- **Feed Aggregation & Generation Service:** Coordinates the read path. It queries the user's Redis `ZSET`, looks up the user's followed celebrities, fetches recent celebrity post IDs, merges both streams, runs them through ranking filters, and coordinates hydration.
- **Hydration Service & Post Cache:** Resolves the top 20 post IDs into full UI payloads (post text, author username, avatar URL, like count, comment count, and thumbnail URLs) via a single Redis `MGET` or primary database lookup.
**End-to-End Request Walkthroughs:**

**The Write Path (Creating a Post):**
1. The user publishes a post via `POST /api/v1/posts`. The API Gateway authenticates the request and forwards it to the Post Ingestion Service.
2. The service saves the post metadata and content to Post Storage DB (e.g., Cassandra / PostgreSQL), generates a unique 64-bit Snowflake ID, and returns HTTP 201 Created to the client with the created post object.
3. Simultaneously, the service publishes a `PostCreatedEvent(post_id, author_id, timestamp, follower_count)` to Kafka.
4. Fan-Out Workers consume the event. If `follower_count < 25,000`, the worker fetches the author's follower list from the Social Graph Service, filters for active users (last seen < 7 days), and dispatches batch pipeline commands (`ZADD` and `ZREMRANGEBYRANK`) to Redis timeline shards. If `follower_count >= 25,000`, the worker writes the post ID only to the author's public post list and terminates.

**The Read Path (Loading the Feed):**
1. The user requests their feed via `GET /api/v1/feed?cursor=1719283847291_984321&limit=20`.
2. The Feed Aggregation Service queries Redis for the user's precomputed `ZSET` to retrieve the latest 100 post IDs below the cursor.
3. Concurrently, the service checks the user's follow list for celebrity accounts. For each followed celebrity, it pulls their recent post IDs from a dedicated celebrity cache.
4. The service merges the two lists, removes duplicates, and trims the candidate pool to ~100 items.
5. The candidates pass through the Ranking & Diversity Filter, which computes final scores and selects the top 20 items.
6. The Hydration Service fetches the full post entities and author summaries using a multi-key batch read (`MGET`) against the Post Cache.
7. The API Gateway serializes and delivers the hydrated 20-post response with a `next_cursor` token to the client.

## 4. Key Technical Decisions — With Real Tradeoffs

Every major architectural choice in a high-scale feed involves deliberate tradeoffs between write complexity, read latency, memory footprint, and system resilience.

**Decision 1 — Fan-Out Strategy: Hybrid Fan-Out over Pure Push or Pure Pull**

- **Choice:** Threshold-based hybrid model. Accounts with fewer than 25,000 followers use Fan-Out on Write. Accounts with 25,000 or more followers use Fan-Out on Read.
- **Alternatives Considered:** Pure Push (every author fans out to all followers) and Pure Pull (every feed request aggregates all followees live).
- **Tradeoff Analysis:** Pure push offers fastest reads (O(1)) but collapses under celebrity posts (100M writes per post) and wastes terabytes of cache for dormant users. Pure pull eliminates fan-out write queues entirely, but forces every feed load to perform a distributed multi-shard scan and sort across hundreds of accounts, making sub-200ms P99 latencies impossible. The hybrid model maintains lightning-fast reads for 99.9% of user interactions while capping maximum write amplification per post to exactly 25,000 operations. The penalty is minor CPU overhead on the read path to merge celebrity arrays in memory.

**Decision 2 — Timeline Cache Architecture: Redis Sorted Sets (`ZSET`) Storing IDs Only**

- **Choice:** Redis Cluster storing timeline caches as `ZSET` data structures, containing only 64-bit integer `post_id`s scored by Unix timestamp in milliseconds.
- **Alternatives Considered:** Storing complete serialized post JSON objects inside Redis Lists (`LPUSH` / `LRANGE`), or querying relational database indexes on every read.
- **Tradeoff Analysis:** Storing complete JSON objects inside each follower's feed cache multiplies memory consumption by 50x–100x (a 1 KB post duplicated across 1,000 followers consumes 1 MB instead of 16 KB of raw IDs). Storing only IDs keeps memory per active user timeline under 10 KB (800 post IDs × 8 bytes + Redis overhead ≈ 8–10 KB). 100 million active users require less than 1 TB of total Redis RAM across the cluster. The tradeoff is a two-step read path: fetch IDs first, then hydrate post bodies via batch `MGET`. Because hydration reads against an in-memory post cache with high cache hit rates (>98%), the added latency is under 5ms.

**Decision 3 — Pagination: Deterministic Cursor-Based over Offset-Based**

- **Choice:** Cursor-based pagination where the cursor is an opaque base64-encoded token containing `(timestamp_ms, post_id)`.
- **Alternatives Considered:** SQL-style `OFFSET` and `LIMIT` (e.g., `LIMIT 20 OFFSET 100`).
- **Tradeoff Analysis:** Offset pagination suffers from two fatal flaws in dynamic feeds:
  1. **Performance degradation:** As a user scrolls deeper (e.g., `OFFSET 10000`), the database or cache must scan and discard 10,000 records before returning 20, turning an O(1) query into an O(N) scan.
  2. **Page drift (duplicate & skipped items):** If 5 new posts are published while a user is reading page 1, requesting page 2 with `OFFSET 20` shifts the window, causing the user to see the last 5 posts from page 1 a second time.
  Cursor pagination uses `ZREVRANGEBYSCORE` or `WHERE (score, id) < (cursor_score, cursor_id) ORDER BY score DESC, id DESC LIMIT 20`. It delivers constant O(log N) lookup time regardless of scroll depth and remains immune to new item insertions.

**Decision 4 — Asynchronous Ingestion: Apache Kafka over Synchronous Worker Calls**

- **Choice:** Event-driven message broker (Apache Kafka) sitting between post ingestion and fan-out workers.
- **Alternatives Considered:** Synchronous HTTP/gRPC calls from Post Ingestion Service to Fan-Out Workers, or direct database triggers.
- **Tradeoff Analysis:** Synchronous fan-out couples the post creation API latency to downstream network health and follower graph sizes; a sudden burst of posts would exhaust API server threads and fail client requests. Kafka acts as an elastic buffer that absorbs traffic spikes without backpressure on the client. Partitions keyed by `author_user_id` guarantee that an individual creator's posts are processed strictly in sequence. The tradeoff is operational complexity in managing Kafka clusters and consumer group lag monitoring.

## 5. Deep Dives — The Parts That Actually Matter

**Deep Dive 1 — The Modern Ranking Pipeline: From Candidates to Renderable Feed**

A production social feed rarely displays pure chronological order; it ranks content to maximize relevance, safety, and engagement. Ranking 10 million total posts in real time is computationally impossible, so modern feed architectures split ranking into a multi-stage funnel:

```txt
[ 10,000,000+ Total Posts in System ]
                   │
                   ▼  Stage 1: Candidate Generation (Retrieval)
 [ 500 Candidates: 400 from Redis ZSET + 80 from Celebrities + 20 Explore ]
                   │
                   ▼  Stage 2: Feature Extraction & Scoring Model
 [ 500 Scored Candidates: Point-in-time Affinity + Recency + Engagement ]
                   │
                   ▼  Stage 3: Business Logic, Diversity & Safety Filter
 [ Top 20 Candidates: Deduplicated, Author-Spread, Muted-Filtered, Ads Injected ]
                   │
                   ▼  Stage 4: Batch Hydration
 [ 20 Fully Formatted Post UI Objects Delivered to Client ]
```

- **Stage 1 — Candidate Generation (Retrieval):** The Feed Aggregator pulls candidate post IDs from three sources: the user's Redis `ZSET` (400 items), followed celebrity timelines (80 items), and an Explore/Recommendation embedding service (20 discovery items). The candidate pool is bounded to ~500 IDs.
- **Stage 2 — Feature Extraction & Scoring:** Each candidate post is evaluated against real-time signals:
  `RankingScore = w1 * Recency(t) + w2 * AuthorAffinity(u, a) + w3 * ContentTypePreference(u, c) + w4 * SocialProof(p)`
  - `Recency(t)` applies exponential time decay: `e^(-lambda * delta_hours)` to ensure fresh content surfaces.
  - `AuthorAffinity(u, a)` measures direct interactions: direct messages, profile visits, comment replies, and past like frequency between viewer `u` and author `a`.
  - `ContentTypePreference(u, c)` adjusts for user consumption habits (e.g., higher weights for short-form video vs text).
  - `SocialProof(p)` incorporates real-time like velocity, repost velocity, and comment depth.
- **Stage 3 — Diversity, Safety, and Ad Injection:** The top-scoring posts pass through deterministic business rules:
  - **Author Diversity:** No more than 2 consecutive posts from the same author to prevent feed dominance.
  - **Safety & Moderation:** Filter out posts flagged by trust-and-safety classifiers or originating from blocked/muted accounts.
  - **Monetization Insertion:** Insert sponsored/ad posts at deterministic intervals (e.g., slot 3, slot 11, slot 19).
- **Stage 4 — Hydration & Assembly:** The final 20 post IDs are batched and hydrated with author metadata, high-resolution media URLs, and localized strings before serialization.

**Deep Dive 2 — Handling Deletions, Edits, and Privacy Graph Changes**

When a creator with 500,000 followers deletes a post, iterating through 500,000 Redis timeline caches to execute `ZREM` causes severe write amplification and locks cache shards.

- **Tombstones & Read-Time Elimination:** Deletion never triggers an immediate fan-out sweep. Instead, the post status is set to `is_deleted = true` in the primary Post Storage DB and updated in the centralized Redis Post Metadata Cache. When any follower loads their feed, the Hydration Service inspects the post status during batch retrieval. If `is_deleted === true`, the item is silently dropped from the response list. A lazy background cleaner removes dead IDs from individual user `ZSET`s over time.
- **Post Edits:** Because timeline caches store only immutable `post_id`s and timestamps, post text edits require zero updates to any follower's feed cache. The edit updates only the single record in Post Storage and invalidates the cached post entity in the Post Cache.
- **Unfollows and Blocks:** If user A blocks or unfollows user B, cleaning user B's historical posts out of user A's Redis cache synchronously is expensive. Instead, user A's active block/unfollow set is stored in a fast local cache (or Redis Set). The Feed Aggregation Service filters out posts from blocked authors on the read path during Stage 3 filtering.

**Deep Dive 3 — Cold Start and Inactive User Lifecycle**

Memory is the most expensive operational component of a timeline cache. Storing 800 post IDs for 500 million total registered users requires massive RAM, even though only 300 million are active.

- **Active Cache Eviction:** Each user's Redis `ZSET` key is assigned a Time-To-Live (TTL) of 7 days. Every time a user requests their feed or opens the app, the TTL is renewed. If a user becomes inactive for 7 consecutive days, Redis automatically evicts their timeline key via standard expiration.
- **On-Demand Reconstruction for Returning Users:** When an inactive user opens the app after 3 months:
  1. The Feed Service detects a cache miss on the user's `ZSET` key in Redis.
  2. The Feed Service queries the Social Graph Service to retrieve the user's followed accounts.
  3. A fast SQL/Cassandra query pulls the most recent 2 posts from each followed account, sorted by timestamp, and returns the top 20 posts directly to the user to keep the first load under 300ms.
  4. Concurrently, an asynchronous background job is enqueued to pull the top 800 historical posts, populate a fresh Redis `ZSET`, set the 7-day TTL, and warm the cache for subsequent pagination requests.

## 6. Failure Modes and Resilience

A resilient social feed system must withstand extreme traffic spikes, cache failures, and downstream database degradation without causing cascading outages.

```txt
┌──────────────────────────────────────┬──────────────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Failure Point                        │ User & System Impact                     │ Detection & Mitigation Strategy                        │
├──────────────────────────────────────┼──────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Celebrity Mega-Post Spike            │ Write queues back up; fan-out lag spikes │ Threshold check routes >25k follower accounts to       │
│                                      │ to tens of minutes for all users.        │ read-path pull. Fan-out workers ignore celebrity       │
│                                      │                                          │ followers. Rate limit author posting frequency.        │
├──────────────────────────────────────┼──────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Redis Timeline Shard Outage          │ Cache misses spike for millions of       │ Redis Cluster with Master-Replica auto-failover        │
│                                      │ users; fallback DB queries risk collapse.│ (Sentinel). Read-path circuit breaker throttles DB     │
│                                      │                                          │ fallback; serves degraded chronological feeds.         │
├──────────────────────────────────────┼──────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Kafka Consumer Lag Buildup           │ New posts take minutes to appear in      │ Horizontal Pod Autoscaling (HPA) triggered on consumer │
│                                      │ follower timelines.                      │ group lag metric. Priority worker queues for active    │
│                                      │                                          │ users over offline users.                              │
├──────────────────────────────────────┼──────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Cache Stampede (Thundering Herd)     │ Viral post or mass login event causes    │ Single-flight request coalescing (e.g., Go singleflight│
│                                      │ simultaneous cache miss queries to DB.   │ or Redis mutex locks); return stale cached data        │
│                                      │                                          │ during background refresh.                             │
├──────────────────────────────────────┼──────────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Hydration Service Database Saturation│ Feed aggregation succeeds, but fetching  │ Read replicas with connection pooling; Multi-tiered    │
│                                      │ post text/media metadata times out.      │ caching (L1 App In-Memory Cache + L2 Redis Cluster)    │
│                                      │                                          │ for hot posts; fallback to minimal payload.            │
└──────────────────────────────────────┴──────────────────────────────────────────┴────────────────────────────────────────────────────────┘
```

- **Celebrity Fan-Out Protection:** High-follower accounts are automatically flagged in the database and social graph cache. The ingestion pipeline checks the author's follower count before emitting fan-out jobs. Accounts exceeding 25,000 followers bypass the worker pool completely, eliminating write queue saturation.
- **Circuit Breaking on Fallback Paths:** If Redis crashes and the feed service falls back to generating feeds from the primary database, the database can easily be crushed by 35,000 read QPS. A circuit breaker monitors database latency and error rates. If the DB latency exceeds 500ms, the circuit trips: fallback queries are shedding, and users receive cached trending/discovery feeds from CDN edge memory until cache clusters recover.
- **Singleflight Cache Coalescing:** When a viral post with millions of views expires from the Post Cache, thousands of concurrent feed aggregation requests attempt to query the primary database for that exact same post record at the same millisecond. Using the **Singleflight pattern**, the application server ensures only one request fetches the post from the database while all other concurrent requests pause and share the single returned result.

## 7. What Makes a Great Answer vs an Average One

In a senior or staff-level system design interview, the interviewer evaluates your ability to navigate nuanced production realities rather than repeat textbook architectures.

- **Quantifying Read/Write Asymmetry:**
  - *Average:* "We need a database for posts and a cache for feeds."
  - *Great:* "Social feeds operate at a 100:1 or higher read-to-write ratio. With 300M DAU and 1.5B daily reads, write latency can be traded for read speed. We precompute feeds on write for regular users to guarantee sub-200ms O(1) reads, and switch to on-demand read-merging for high-follower creators."
- **Handling the Celebrity Edge Case:**
  - *Average:* "When a user posts, we push it to all followers in Redis."
  - *Great:* "A pure push model breaks at scale due to the 'Justin Bieber problem'—fanning out 100 million writes causes severe queue lag and memory amplification. We implement a hybrid model using a follower threshold (e.g., 25k followers) to bifurcate the write path from the read-merge path."
- **Separating Cache Indexing from Entity Hydration:**
  - *Average:* "We store the entire post object in each follower's feed list in Redis."
  - *Great:* "Storing complete JSON objects in timeline caches explodes memory footprint and makes post edits or privacy updates nearly impossible to synchronize. We store only 64-bit post IDs in Redis `ZSET`s, capping sets at 800 items, and execute a single batch `MGET` against a shared post cache only for the 20 items selected after ranking."
- **Handling Deletions & Edge Operations Cleanly:**
  - *Average:* "When a post is deleted, we find every follower's feed and delete it."
  - *Great:* "Iterating through millions of follower caches to remove a deleted post is an anti-pattern. We write a tombstone to the post entity and let the read-path hydration service discard deleted items on the fly, with lazy background scavenging."
- **Pagination Realities:**
  - *Average:* "We paginate using page numbers and SQL offset."
  - *Great:* "Offset pagination causes severe performance degradation and visible post duplication when new items insert at the top of the feed. We use deterministic cursor pagination encoding timestamp and post ID, leveraging `ZREVRANGEBYSCORE` for constant O(log N) seeking."

## 8. 🧠 The Memory Hook

**Push for the crowd, Pull for the stars, Cache only IDs, Hydrate at the gate.**

Regular creators push post IDs into follower Redis Sorted Sets; celebrities are pulled and merged dynamically at read time; feed caches store only lightweight sorted IDs to protect memory; and full post content is hydrated in a single batch right before leaving the server gate.
