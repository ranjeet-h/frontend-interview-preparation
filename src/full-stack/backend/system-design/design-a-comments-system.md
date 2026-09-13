# Design a Nested Comments System (Reddit / Hacker News / YouTube)

## 1. Understand the Problem First — Clarify Before Designing

You build a relational database schema where each comment has a `parent_id` pointing to another comment. It runs smoothly in development with 20 test comments. Then you deploy to production, a post goes viral with 65,000 comments nested 15 levels deep, and your API server executes 15 recursive roundtrips or a massive recursive CTE query that pins database CPU at 100% and times out. When a user scrolls to page 3, newly inserted replies shift the offset, causing duplicate and skipped comments. And when a user deletes a top comment with 500 active discussion replies, a naive cascade delete wipes out the entire conversation branch.

Before drawing architectural boxes on a whiteboard, clarify these operational requirements:

1. **Threading Model & Depth:** Is the system supporting unlimited arbitrary nesting (like Reddit or Hacker News), fixed 2-level nesting (like YouTube or Instagram: top-level comments plus 1 level of replies), or bounded depth (e.g., max 10 levels)?
2. **Scale & Traffic Profiles:** What are the read and write volumes? A typical system might handle 20M daily active users, 100M comment reads per day, and 5M new comments per day (~20:1 read-to-write ratio). However, on viral posts or breaking news threads, write spikes can exceed 2,000 comments per second with 50,000 reads per second on a single thread.
3. **Sorting & Ranking:** How are comments displayed? Chronological (Newest/Oldest), Top (absolute upvotes minus downvotes), or Algorithmic/Decay (Hacker News time-decay gravity, Reddit Hot, or Wilson score interval)?
4. **Deletion & Moderation Semantics:** When a parent comment is deleted or banned, what happens to its descendant tree? Does it delete all children, orphan them, or preserve thread continuity using a tombstone placeholder (`[deleted]`)?
5. **Real-time Requirements:** Must replies appear instantly via WebSocket/Server-Sent Events (SSE), or is near-real-time polling / on-refresh pagination acceptable?
6. **Latency SLA:** What is the latency target? p99 read latency under 100ms for fetching any paginated comment slice, even on threads with 100,000+ comments.

## 2. The Core Insight — The Decision Everything Else Flows From

A comment thread is a directed tree graph, but production databases and key-value stores store flat rows and key-value pairs, not graph trees.

The entire architecture depends on one foundational decision: **How you encode hierarchical tree relationships into flat database rows so that fetching any paginated subtree requires a single indexed range scan instead of recursive database queries, without destroying write throughput when users post replies.**

If you pick the wrong tree data model, no amount of caching, Redis sharding, or connection pooling will save you. Every other design element—pagination cursors, cache invalidation boundaries, ranking calculations, and tombstone handling—flows directly from how the tree is represented in storage.

## 3. High-Level Architecture — Components and Why Each Exists

```txt
[ Client (Web / Mobile App) ]
              │
              ▼
   [ CDN / Edge Gateway ] ── (Static assets, edge rate limiting, DDoS shield)
              │
              ▼
    [ API Load Balancer ]
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Comment Gateway / API Tier                  │
│   - JWT Auth & Permissions    - Input Validation / Sanitizer│
│   - Rate Limiting (Token Bucket per User / IP)              │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
       (Read / Fetch Thread)           (Write / Post Reply)
               │                               │
               ▼                               ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│      Comment Read Service    │ │    Comment Write Service    │
│  - Slice / Tree Assembly     │ │  - Path / Node Generator    │
│  - Vote Count Hydration      │ │  - Transactional DB Insert  │
│  - Cursor Pagination Filter  │ │  - Event Publisher          │
└──────┬───────────────┬───────┘ └─────────────┬───────────────┘
       │               │                       │
       ▼               ▼                       ▼
┌──────────────┐ ┌──────────────┐       ┌──────────────────────┐
│ Redis Cache  │ │ PostgreSQL / │       │ Apache Kafka Event   │
│ - Hot Slices │ │ Distributed  │       │ Stream               │
│ - Vote Hash  │ │ SQL Replicas │       └──────────┬───────────┘
└──────────────┘ └──────────────┘                  │
                                       ┌───────────┴───────────┐
                                       ▼                       ▼
                             ┌───────────────────┐   ┌─────────────────┐
                             │ Ranking Worker    │   │ Async Worker    │
                             │ (Score & Decay    │   │ (Toxicity Scan, │
                             │  Recalculation)   │   │  Notifications, │
                             │                   │   │  Search Index)  │
                             └───────────────────┘   └─────────────────┘
```

Why each component exists in this pipeline:

- **API Gateway & Rate Limiter:** Protects against spam bots and vote manipulation. Enforces token bucket limits (e.g., maximum 5 comments per minute per user).
- **Comment Read Service:** Purely optimized for low-latency range queries. Pulls pre-sorted tree branches from cache or database read replicas, hydrates current vote tallies and user-specific upvote states, and formats the response JSON.
- **Comment Write Service:** Handles ACID transaction boundaries for comment creation. Calculates the materialized hierarchy path, writes to the primary database, and publishes an immutable `CommentCreated` event to Kafka.
- **Redis Cache Layer:** Stores top-level comments and hot thread heads using Redis Hashes and Sorted Sets. Absorbs 95%+ of read traffic for viral posts.
- **PostgreSQL / Distributed SQL:** The durable system of record using Materialized Path (e.g., PostgreSQL `ltree`) with composite B-Tree indexes for single-scan subtree retrieval.
- **Kafka Event Stream:** Decouples the fast synchronous write path from slow asynchronous tasks: toxicity scanning, spam filtering, mention notifications, elasticsearch indexing, and ranking score recalculation.

A write request flows like this:
A user submits a reply to comment `C_12`. The API gateway authenticates the request and passes it to the Comment Write Service. The service looks up `C_12`'s materialized path (`"0001.0012"`), assigns a new monotonic ID (`0045`), and generates the new path (`"0001.0012.0045"`). It inserts the row into the primary database in a single statement ($O(1)$ write), emits a `CommentCreated` event to Kafka, and returns the created comment payload to the client.

A read request flows like this:
A user loads a post with sort order `HOT`. The client passes `post_id` and an optional pagination cursor. The Comment Read Service checks Redis for the cached hot slice. If missed, it queries the database read replica with an indexed range query (`WHERE post_id = :id AND depth <= 2 ORDER BY score DESC, path ASC LIMIT 20`), fetches vote counts, constructs the tree slice, writes to Redis, and returns the response in under 20ms.

## 4. Key Technical Decisions — With Real Tradeoffs

The defining database challenge is modeling hierarchical trees. There are four established patterns:

**1. Adjacency List (`parent_id`)**
Each comment holds a foreign key pointer to its immediate parent.
```sql
CREATE TABLE comments (
    id BIGINT PRIMARY KEY,
    post_id BIGINT NOT NULL,
    parent_id BIGINT REFERENCES comments(id),
    author_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- Querying a full tree requires a recursive Common Table Expression (CTE):
```sql
WITH RECURSIVE comment_tree AS (
    SELECT id, post_id, parent_id, content, 0 AS depth, ARRAY[id] AS path
    FROM comments
    WHERE post_id = 101 AND parent_id IS NULL
    UNION ALL
    SELECT c.id, c.post_id, c.parent_id, c.content, ct.depth + 1, ct.path || c.id
    FROM comments c
    JOIN comment_tree ct ON c.parent_id = ct.id
)
SELECT * FROM comment_tree ORDER BY path;
```
- *Tradeoff:* Inserts are trivial $O(1)$ writes. But reads require $O(D)$ recursive joins (where $D$ is tree depth). On large threads, this causes high CPU usage, lock contention, and makes deterministic pagination across subtrees nearly impossible. Best only for flat 2-level systems like YouTube.

**2. Materialized Path (Path Enumeration / PostgreSQL `ltree`)**
Each comment stores its entire ancestral lineage as a dot-delimited string or binary path.
```sql
-- Using PostgreSQL ltree extension
CREATE EXTENSION IF NOT EXISTS ltree;

CREATE TABLE comments (
    id BIGINT PRIMARY KEY,
    post_id BIGINT NOT NULL,
    parent_id BIGINT REFERENCES comments(id),
    path LTREE NOT NULL,
    author_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    score INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_path ON comments USING GIST (path);
CREATE INDEX idx_comments_post_path ON comments (post_id, path);
```
- Inserting a child under path `0001.0004` with ID `0012` sets `path = '0001.0004.0012'`.
- Fetching an entire subtree rooted at `0001.0004` is a single indexed prefix match:
```sql
-- Single index scan retrieves root and all descendants
SELECT * FROM comments
WHERE post_id = 101 AND path <@ '0001.0004'
ORDER BY path ASC;
```
- *Tradeoff:* Inserts remain $O(1)$ (read parent path, append new ID). Reads are a lightning-fast single index range scan. Subtree queries naturally sort in depth-first traversal order. Moving subtrees requires updating child prefixes, but comments are almost never reparented. This is the optimal architecture for deep threads (Reddit / Hacker News).

**3. Closure Table (Bridge / Ancestor Table)**
Stores the tree structure in a dedicated relationship table containing every ancestor-descendant pair and their hop distance.
```sql
CREATE TABLE comments (
    id BIGINT PRIMARY KEY,
    post_id BIGINT NOT NULL,
    content TEXT NOT NULL
);

CREATE TABLE comment_ancestors (
    ancestor_id BIGINT NOT NULL REFERENCES comments(id),
    descendant_id BIGINT NOT NULL REFERENCES comments(id),
    depth INT NOT NULL,
    PRIMARY KEY (ancestor_id, descendant_id)
);
CREATE INDEX idx_descendant ON comment_ancestors(descendant_id);
```
- Inserting a comment at depth 5 requires inserting 6 rows into `comment_ancestors` (5 ancestors plus self-reference).
- Fetching all descendants of comment `12`:
```sql
SELECT c.*, ca.depth
FROM comments c
JOIN comment_ancestors ca ON c.id = ca.descendant_id
WHERE ca.ancestor_id = 12
ORDER BY ca.depth ASC;
```
- *Tradeoff:* Extremely flexible for arbitrary graph querying and strict referential integrity. However, write amplification is $O(\text{depth})$ rows per comment insert, and table size grows quadratically with deep nesting.

**4. Nested Sets (Modified Preorder Tree Traversal - `lft` / `rgt`)**
Each node stores integer intervals `lft` and `rgt` determined by a depth-first traversal of the tree.
- Querying a subtree: `WHERE lft BETWEEN parent.lft AND parent.rgt`. Fast and elegant.
- *Tradeoff:* Catastrophic insert overhead. Inserting a new comment requires updating `lft` and `rgt` on up to 50% of all existing rows in the entire thread, creating massive row locks and write bottlenecks. Never use Nested Sets for high-write comment systems.

| Data Model | Subtree Read Cost | Insert Cost | Deep Pagination | Deletion Complexity | Best Use Case |
|---|---|---|---|---|---|
| **Adjacency List** | Slow (Recursive CTE / $O(D)$ joins) | $O(1)$ | Poor | Simple | Shallow nesting (max depth 2) |
| **Materialized Path** | Fast (Single indexed range scan) | $O(1)$ | Excellent (lexicographical range cursor) | Simple | **Deep nesting (Reddit / HN / Discourse)** |
| **Closure Table** | Fast (Indexed JOIN) | $O(\text{depth})$ rows inserted | Moderate | Moderate (delete bridge rows) | Graph hierarchies with frequent node reparenting |
| **Nested Sets** | Fast (Single interval scan) | Extreme ($O(N)$ row locks) | Good | Complex table rewrites | Read-only taxonomies (e-commerce categories) |

**Storage Engine Selection: Relational vs NoSQL**
- *Choice:* PostgreSQL with `ltree` or a distributed relational database (e.g., CockroachDB / YugabyteDB) partitioned by `post_id`.
- *Why not pure DynamoDB/Cassandra?* While Cassandra excels at high-throughput flat time-series writes, querying arbitrary hierarchical subtrees with dynamic sorting (Top vs New vs Hot) requires multi-table denormalization or in-memory tree stitching on read servers. A relational store with composite indexing (`post_id`, `path`, `score`) allows consistent ACID inserts and instant range scans.

**Caching Strategy: Chunked Hybrid Caching**
- Do not cache the entire 50,000-comment tree in a single Redis string. Updating one comment would invalidate the entire multi-megabyte cache entry (causing cache stampedes).
- Instead, cache top-level comment IDs in a Redis Sorted Set keyed by `post_id` (scored by `ranking_score`).
- Store comment body and metadata in Redis Hashes keyed by `comment:{id}`.
- Fetching page 1 means grabbing the top 20 IDs from the Sorted Set ($O(\log N)$) and running a multi-get (`HMGET`) for the 20 comment bodies. Subtrees are fetched lazily on demand.

## 5. Deep Dives — The Parts That Actually Matter

### Sorting & Ranking Algorithms at Scale

Calculating scores dynamically in SQL (e.g., `ORDER BY upvotes / POW(age, 1.8)`) across 50,000 comments forces a full table scan and database crash. Ranking algorithms must be calculated incrementally and stored in an indexed `ranking_score` column.

**1. Hacker News Time-Decay Gravity**
$$Score = \frac{U - D}{(T + 2)^G}$$
Where $U$ is upvotes, $D$ is downvotes, $T$ is time in hours since posting, and $G$ is the gravity constant (default $1.8$).
As time passes, older comments decay rapidly unless they continuously receive new upvotes.

**2. Wilson Score Interval ("Best" Sorting)**
Raw percentage or simple subtraction ($U - D$) fails. A comment with 1 upvote and 0 downvotes (100% positive) should not rank higher than a comment with 1,000 upvotes and 50 downvotes (95.2% positive).
The Wilson score interval calculates the 95% confidence lower bound of the true proportion of positive votes:
$$w = \frac{\hat{p} + \frac{z^2}{2n} - z \sqrt{\frac{\hat{p}(1-\hat{p}) + \frac{z^2}{4n}}{n}}}{1 + \frac{z^2}{n}}$$
Where $n = U + D$, $\hat{p} = \frac{U}{n}$, and $z = 1.96$ for a 95% confidence level.
New comments with few votes have wide confidence intervals and start with a conservative lower bound score, preventing low-sample spam from leaping to the top.

**Production Implementation:**
Vote clicks increment an in-memory counter in Redis via `HINCRBY`. A background ranking worker flushes vote deltas to Kafka every 5 seconds, recalculates the Wilson / Gravity score, updates the database `score` column, and adjusts the comment's position in the Redis Sorted Set.

### Pagination in Deeply Nested Trees

Offset pagination (`OFFSET 40 LIMIT 20`) is unusable in nested comments because:
1. $O(N)$ row scanning degrades database performance as users scroll deeper.
2. If new comments are inserted at the top of the thread while a user is reading, the offsets shift, causing the next page to duplicate or skip comments.

**The Two-Tier Cursor Pagination Solution:**

1. **Tier 1 (Top-Level Comment Pagination):**
   Query only root comments (`depth = 0` or `parent_id IS NULL`) using a keyset cursor on `(score, id)`:
   ```sql
   SELECT * FROM comments
   WHERE post_id = 101
     AND parent_id IS NULL
     AND (score, id) < (:last_score, :last_id)
   ORDER BY score DESC, id DESC
   LIMIT 20;
   ```
2. **Tier 2 (Subtree Fetching & "Load More Replies"):**
   Along with each top-level comment, fetch only its immediate replies up to a preview threshold (e.g., max 3 replies, `depth <= 2`).
   When the user clicks "Load 25 more replies" under comment `0001.0004`:
   ```sql
   SELECT * FROM comments
   WHERE post_id = 101
     AND path <@ '0001.0004'
     AND path > :last_seen_path
   ORDER BY path ASC
   LIMIT 25;
   ```
   Because materialized paths are ordered lexicographically, the cursor `path > :last_seen_path` seeks directly to the next sibling or child in the B-Tree index without skipping or scanning preceding rows.

### Soft Deletes, Moderation, and Tombstones

When user Alice deletes comment $C_1$, but $C_1$ has 40 descendant replies:
- **Cascade Hard Delete:** Deleting the database row destroys the entire 40-reply conversation.
- **Orphaning:** Setting children's `parent_id = NULL` promotes 40 sub-replies to top-level comments, completely destroying the context of the conversation.

**The Tombstone Pattern:**
1. When a comment with active descendants is deleted, update the record:
   - `is_deleted = TRUE`
   - `author_id = NULL` (for GDPR compliance and user privacy)
   - `content = "[deleted]"`
   - Retain `id`, `parent_id`, `path`, and `created_at`.
2. The UI renders a muted placeholder: *"[Comment deleted by user]"*, preserving the branch structure so child replies remain attached.
3. **Garbage Collection Pruning:** If a leaf comment (0 children) is deleted, hard delete it immediately. If a tombstone's children are all deleted over time, an asynchronous background job recursively removes dead tombstone branches.

## 6. Failure Modes and Resilience

### 1. The Viral Breaking News Thread (Hot Partitioning)
- **Failure:** A breaking news thread generates 50,000 reads/sec and 2,000 writes/sec. All read/write requests target the same `post_id` database partition and the same Redis cache key, maxing out CPU and connection limits.
- **Resilience:**
  - *Read Path:* Implement an in-memory Local LRU Cache (e.g., 2-second TTL) inside each API gateway node. 100 API instances querying the same hot thread reduce Redis hits from 50,000/sec to 50/sec.
  - *Write Path:* Buffer high-frequency comment submissions into an ingestion Kafka partition keyed by `hash(user_id)` (distributing across brokers), then batch-insert into PostgreSQL in chunks of 100 rows.

### 2. Cache Invalidation Stampede (Thundering Herd)
- **Failure:** When a popular comment in a viral thread is edited or deleted, the cached thread slice is invalidated. 5,000 concurrent reader requests get a cache miss simultaneously and hammer the primary database with identical heavy subtree queries.
- **Resilience:** Use the **SingleFlight / Mutex Locking** pattern. On a cache miss, only the first request acquires a short-lived distributed lock (e.g., Redis `SET NX` for 500ms) to query the database and populate the cache. The other 4,999 requests wait for the cache key to be populated or receive stale data with a background async refresh (`stale-while-revalidate`).

### 3. Malicious Deep-Nesting Attack
- **Failure:** An attacker writes a script that posts comments nested 1,000 levels deep (`A -> B -> C -> ... -> 1000`). This exceeds the `ltree` or string path storage limit, and causes frontend React rendering engines to crash from maximum call stack size recursion.
- **Resilience:** Enforce a strict max depth limit at the API validation layer (e.g., `MAX_DEPTH = 10`). If a user attempts to reply to a comment at depth 10, the system automatically flattens the new comment to depth 10, converting the relationship into a visual `@mention` rather than a deeper tree node.

### 4. Out-of-Order WebSocket Delivery
- **Failure:** In real-time streaming mode, a child reply message arrives over the WebSocket connection before the client has received or rendered the parent comment.
- **Resilience:** The frontend maintains a temporary `orphan_buffer` map. If a message arrives with `parent_id` not currently present in the client's state tree, it is held in the buffer for up to 3 seconds. If the parent doesn't arrive within 3 seconds, the client issues a fallback REST call: `GET /api/v1/comments/{parent_id}`.

## 7. What Makes a Great Answer vs an Average One

| Dimension | Average Answer | Senior Architect Answer |
|---|---|---|
| **Data Modeling** | Reaches for standard SQL `parent_id` foreign keys and plans to fetch the tree using recursive loops in application memory or recursive CTEs. | Systematically compares Adjacency List, Materialized Path (`ltree`), Closure Table, and Nested Sets. Explains why Materialized Path gives $O(1)$ inserts and single-scan pre-sorted subtree reads. |
| **Tree Pagination** | Suggests `OFFSET` and `LIMIT`, ignoring that offset scanning shifts when replies arrive and that subtrees cannot be cleanly paginated without fetching ancestors. | Designs a two-tier cursor system: top-level comments paginated by `(score, id)` cursor, with deep subtrees lazy-loaded on demand using path prefix range cursors (`path > cursor`). |
| **Ranking & Decay** | Suggests running dynamic sorting formulas in SQL `ORDER BY` clauses on every read request. | Precalculates Wilson score intervals or Hacker News gravity decay via Kafka worker pipelines, storing the score in an indexed column and managing hot thread heads in Redis Sorted Sets. |
| **Deletion & Consistency** | Proposes hard deleting rows or setting children's `parent_id = NULL`. | Implements the Tombstone Pattern (`[deleted]`) with GDPR author scrubbing to preserve tree continuity, paired with asynchronous leaf-pruning garbage collection. |
| **Hotspot Handling** | Suggests "adding Redis" without explaining key structure, cache stampede prevention, or local micro-caching. | Breaks the tree into chunked cache units, applies SingleFlight mutex locks to stop thundering herds, and uses local 2-second memory caching on API nodes for viral posts. |

## 8. 🧠 The Memory Hook

To master nested comments, remember: **Model the tree in the path, paginate in two tiers, and never hard-delete a parent.**

A Materialized Path converts an expensive recursive graph traversal into a single indexed prefix scan. Top-level comments paginate by score; subtrees paginate by path. When a parent is deleted, drop a tombstone so the conversation branch stays alive.
