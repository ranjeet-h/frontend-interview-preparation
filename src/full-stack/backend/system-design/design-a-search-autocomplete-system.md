# Design a Search Autocomplete System

## 1. Understand the Problem First — Clarify Before Designing

Every keystroke typed into a modern search bar is a high-stakes distributed query. When a user types `"macbook pro 16"` (15 keystrokes) at a natural typing cadence of 4 to 5 keys per second, that single user can generate 15 distinct backend queries within three seconds.

At a global scale of 100 million daily active users performing 10 searches a day, you are not handling 1 billion queries a day—you are handling 4 to 5 billion prefix lookups a day. Peak traffic surges to over 100,000 queries per second (QPS). The human brain perceives interface lag at around 100 milliseconds; accounting for mobile network round-trips (40–80ms), your backend has a strict budget: **server-side P99 latency must stay under 15ms to 20ms**.

If you execute a relational database query like `SELECT query, frequency FROM search_terms WHERE query LIKE 'mac%' ORDER BY frequency DESC LIMIT 5`, your database will lock up within seconds under I/O bottlenecks and index thrashing. Even traditional inverted-index search engines like Elasticsearch encounter heavy CPU and memory cache contention when performing raw wildcard/prefix scans across millions of terms at 100k QPS.

### Clarifying Questions to Establish Scope

Before sketching components, establish the boundary constraints with the interviewer:

1. **Query Character Set and Prefix Length:**
   - Are we supporting ASCII / lowercase alphanumeric queries, or full multilingual Unicode (Chinese, Japanese, Arabic)?
   - *Assumption:* Lowercase ASCII/alphanumeric for core design, max prefix matching length capped at 20 characters (most searches find suggestions within 20 keystrokes).
2. **Suggestion Output:**
   - How many suggestions should be returned?
   - *Assumption:* Top 5 suggestions matching the prefix.
3. **Ranking Criteria:**
   - Are suggestions ranked strictly by historical search frequency, or do we require real-time trending boosts and personalized user history?
   - *Assumption:* Primary ranking is historical frequency with time-decay; secondary layer handles sudden breaking trending queries.
4. **Freshness vs. Real-Time Ingestion:**
   - Do new searches need to appear in autocomplete suggestions within milliseconds of someone searching for them?
   - *Clarification:* Absolutely not. Autocomplete suggestions represent aggregate human search trends. Suggestions can be updated hourly or daily without degrading user experience. This realization decouples the read path from the write path entirely.
5. **System Scale & Constraints:**
   - **Daily Active Users (DAU):** 100 million.
   - **Search Volume:** 10 searches/user/day = 1 billion completed searches/day.
   - **Prefix Request Volume:** ~4 requests per search (with client debounce) = 4 billion prefix requests/day.
   - **Average Read QPS:** $4 \times 10^9 / 86,400 \approx 46,000$ QPS; **Peak Read QPS:** $100,000$ QPS.
   - **Unique Search Terms Dataset:** ~100 million unique normalized queries. Average query length: 30 bytes.
   - **Data Volume:** $100\text{M} \times 30\text{ bytes} \approx 3\text{ GB}$ of raw text data. With pointers, metadata, and precomputed Top-K lists, in-memory Trie storage requires approximately 20–30 GB of RAM.
   - **SLA:** P99 Latency $< 20\text{ms}$, Availability $99.99\%$.

---

## 2. The Core Insight — The Decision Everything Else Flows From

The central architectural decision is:

**Completely isolate the Read Path from the Write Path using an In-Memory Trie with Precomputed Top-K at every node, updated via an Asynchronous Offline Batch & Streaming Pipeline.**

```txt
┌─────────────────────────────────────────────────────────────────────────┐
│ READ PATH (Low Latency, High QPS, Zero Locking)                         │
│ Client -> CDN -> API Gateway -> In-Memory Trie Shard (O(L) Top-5 lookup)│
└─────────────────────────────────────────────────────────────────────────┘
                                   ▲
                          (Hourly Snapshot Swap)
                                   │
┌─────────────────────────────────────────────────────────────────────────┐
│ WRITE PATH (High Throughput, Asynchronous, Heavy Compute)               │
│ Completed Searches -> Kafka -> Flink/Spark -> DB -> Offline Trie Builder│
└─────────────────────────────────────────────────────────────────────────┘
```

In a standard Trie, finding the top 5 suggestions for prefix `"ca"` requires traversing down to node `'a'`, then exploring every child branch (millions of potential words like `"cat"`, `"car"`, `"cake"`, `"california"`) and sorting them in a Min-Heap. This traversal is $O(P + M \log K)$—where $P$ is prefix length, $M$ is total nodes in the subtree, and $K$ is 5. When $M$ is large, this destroys latency.

By **precomputing and storing the Top-5 query strings and frequencies directly on each node**, lookup complexity collapses to $O(L)$ where $L$ is the prefix length (at most 20 character pointer traversals). The query never traverses the subtree during a user request.

Furthermore, updating Trie node frequencies in real time would require read-write mutexes on Trie nodes. Under 100k QPS, lock contention would halt reads. Treating the runtime Trie as an **immutable, read-only data structure** loaded via background snapshot swaps gives zero-lock, lightning-fast reads.

---

## 3. High-Level Architecture — Components and Why Each Exists

```txt
[ Browser / Mobile Client ] (Debounce 200ms + Local Cache)
             │
             ▼ (HTTPS / HTTP/2)
   [ CDN / Edge POPs ] (Caches 1-2 char high-volume prefixes)
             │
             ▼
   [ API Gateway / LB ] (Rate Limiting, TLS Termination, Route)
             │
      ┌──────┴──────────────────────────────────────┐
      │ (Read Path: < 15ms)                         │ (Write Path: Async)
      ▼                                             ▼
[ Query Service ]                          [ Search Ingestion API ]
      │                                             │
      ▼                                             ▼
[ Distributed Trie Cluster ]               [ Kafka Event Stream ]
(In-Memory Sharded Tries                            │
 with Precomputed Top-5)                            ▼
                                           [ Flink / Spark Aggregator ]
                                           (Windowed frequency aggregation)
                                                    │
                                                    ▼
                                           [ Analytics DB / S3 Lake ]
                                           (Aggregated query counts)
                                                    │
                                                    ▼
                                           [ Offline Trie Builder ]
                                                    │
                                                    ▼
                                           [ Trie Snapshot Store (S3) ]
                                                    │
                                    (Distribute & Atomic Pointer Swap)
                                                    ▼
                                           [ Distributed Trie Cluster ]
```

### Component Breakdown

1. **Client Browser / App (Frontend Layer):**
   - **Debouncing:** Delays API dispatch by 200–300ms after the user stops typing, reducing prefix traffic by up to 60%.
   - **In-Memory Client Cache:** Caches responses locally using an LRU cache or HTTP `Cache-Control: private, max-age=3600`. Backspacing or retyping `"mac"` hits client RAM instantly with 0ms network latency.
2. **CDN / Edge Cache:**
   - Caches responses for extremely common 1-character and 2-character prefixes (`"a"`, `"am"`, `"go"`, `"yo"`). Since 2-character English combinations number only $26 \times 26 = 676$, edge hit rates for initial keystrokes exceed 95%, absorbing massive traffic spikes.
3. **API Gateway & Load Balancer:**
   - Enforces per-IP rate limiting (e.g., max 20 keystrokes/sec per client), terminates TLS, and forwards requests to the Query Service.
4. **Autocomplete Query Service (Stateless):**
   - Normalizes input (lowercasing, trimming whitespace, removing illegal punctuation).
   - Identifies which Trie shard hosts the prefix and retrieves the precomputed Top-5 list.
5. **Distributed In-Memory Trie Cluster:**
   - Holds the precomputed Trie shards entirely in RAM.
   - Responds to prefix queries in $< 2\text{ms}$ with zero disk lookups.
6. **Search Ingestion API & Kafka Stream (Write Path):**
   - When a user actually submits a search (presses Enter or clicks a suggestion), the event is posted asynchronously to Kafka. Keystrokes are not logged to Kafka—only completed searches.
7. **Stream / Batch Processing Pipeline (Flink / Spark):**
   - Aggregates search frequencies over tumbling windows (e.g., hourly and daily counts). Applies time-decay weighting so yesterday's trends decay and current trends rise.
8. **Offline Trie Builder:**
   - A scheduled batch worker that reads aggregated term frequencies, constructs a fresh serialized Trie data structure with Top-5 precomputed at each node, and publishes the serialized snapshot to object storage (S3).
9. **Snapshot Distributor:**
   - Downloads the new Trie snapshot onto Trie cluster nodes, which load it into memory and execute an atomic pointer swap with zero downtime.

---

## 4. Key Technical Decisions — With Real Tradeoffs

### Decision 1: In-Memory Trie with Top-K vs. Inverted Index (Elasticsearch) vs. Relational SQL

| Storage Option | Read Latency | Memory / Disk Profile | Write Complexity | Decision |
| :--- | :--- | :--- | :--- | :--- |
| **SQL Database (`LIKE 'prefix%'`)** | High (50–500ms) | Disk-bound; indexes thrash under wildcard scans | Simple atomic writes | **Rejected:** Cannot sustain 100k QPS or meet sub-20ms P99. |
| **Search Engine (Elasticsearch / Lucene)** | Moderate (15–40ms) | High RAM and CPU for edge n-gram inverted index | Near-real-time index updates | **Rejected for Primary:** Great for typo tolerance and multi-field text search, but resource-heavy at pure prefix scale. |
| **In-Memory Trie with Precomputed Top-K** | Extremely Low (1–3ms) | Fits in RAM (~25 GB for 100M terms with compression) | Asynchronous snapshot rebuilding | **Chosen:** Maximum possible throughput, deterministic $O(L)$ latency, zero read contention. |

### Decision 2: Trie Traversal on Query vs. Precomputed Top-K at Each Node

- **Runtime Traversal:** Storing terms only at leaf nodes saves memory. But every prefix query requires traversing all descendant branches and maintaining a heap of top elements. A prefix like `"s"` could require scanning millions of nodes at query time.
- **Precomputed Top-K:** Storing an array of `TopK [{term, score}]` at every intermediate node increases memory consumption by approximately $3\times$ to $4\times$, but reduces query execution to finding the prefix node and immediately returning its pre-stored array in $O(L)$ time.
- **Tradeoff:** We gladly trade $20\text{ GB}$ of extra RAM across our cluster to achieve sub-millisecond query performance.

### Decision 3: Sharding Strategy — Prefix Range vs. Consistent Hashing

- **Prefix Range Sharding (e.g., Shard 1: `a-c`, Shard 2: `d-f`):**
  - *Problem:* Severe hot spotting. In English, queries starting with `"s"`, `"c"`, `"m"`, and `"t"` receive $10\times$ the volume of queries starting with `"x"`, `"q"`, or `"z"`. Server `s` burns while server `x` sits idle.
- **Consistent Hashing on Prefix:**
  - *Strategy:* Hash the normalized prefix string using consistent hashing: $\text{ShardID} = \text{Hash}(prefix) \pmod N$.
  - *Problem:* If every single prefix is hashed independently, the Trie cannot be stored contiguously as a tree.
  - *Solution (Hierarchical Partitioning):* Partition the Trie based on the **first 2 characters** of the search term. Create 676 logical partitions (`"aa"` through `"zz"`), and distribute these logical partitions across physical servers using Consistent Hashing.

### Decision 4: Update Mechanism — In-Place Live Mutation vs. Immutable Double-Buffering

- **Live Mutation:** Updating node scores directly in a running Trie requires fine-grained locking or lock-free atomic pointer swaps per node. This causes cache-line invalidations across CPU cores and potential deadlocks.
- **Double-Buffering & Atomic Pointer Swap:** The Trie server runs two memory spaces: Active Trie (`Trie A`) and Background Buffer (`Trie B`). The server downloads the new snapshot into `Trie B`, warms its internal caches, and updates an atomic root pointer:
  ```cpp
  std::atomic<Trie*> active_trie;
  active_trie.store(trie_b, std::memory_order_release);
  ```
  Old queries finish reading from `Trie A`, after which `Trie A` is garbage-collected. This guarantees 100% lock-free reads.

---

## 5. Deep Dives — The Parts That Actually Matter

### Deep Dive 1: Trie Node Data Structure & Memory Optimization

A naive Trie representation stores 26 child pointers (or a hash map) per node plus full string copies of each top query:

```txt
Naive Trie Node:
┌─────────────────────────────────────────────────────────────┐
│ Character: 'a'                                              │
│ Children: [Pointer * 26] (26 * 8 bytes = 208 bytes)         │
│ IsEndOfWord: bool (1 byte)                                  │
│ TopK: Array of 5 strings (5 * 30 bytes + overhead ≈ 200 B)  │
└─────────────────────────────────────────────────────────────┘
Total per node ≈ 420+ bytes. For 100M nodes ≈ 42 GB.
```

#### Memory Optimizations for Production:

1. **Term ID Indirection (Global Dictionary Array):**
   Instead of storing string literals like `"macbook pro"` inside thousands of ancestor nodes (`"m"`, `"ma"`, `"mac"`), assign every unique search query a 4-byte integer `TermID`.
   Nodes store only 5 pairs of `(TermID, Score)` (8 bytes each = 40 bytes total). A single global array maps `TermID` back to its string representation.
2. **Compact Prefix Tree (Radix Tree / Patricia Trie):**
   Chains of single-child nodes are merged into single edges (e.g., `'m' -> 'a' -> 'c'` becomes a single node `'mac'`). This reduces total node count by 40–50%.
3. **Dynamic Child Storage:**
   Replace the fixed 26-pointer array with a compact array of dynamic entries `struct Child { char c; uint32_t node_offset; }`. Leaf and near-leaf nodes typically have only 1 or 2 children, dropping pointer overhead from 208 bytes to 10 bytes per node.

```txt
Optimized Trie Node Layout:
┌──────────────────────────────────────────────────────────────┐
│ ChildCount: uint8_t (1 byte)                                 │
│ Flags: uint8_t (1 byte)                                      │
│ Children: Dynamic array of {char c, uint32_t child_idx}      │
│ TopK: [ {uint32_t term_id, uint32_t frequency} x 5 ] (40 B)  │
└──────────────────────────────────────────────────────────────┘
```

---

### Deep Dive 2: Hot Shard Mitigation & Tiered Caching

Even with consistent hashing, specific prefixes experience immense real-world skew:

```txt
Query Prefix Traffic Distribution:
"a"  ████████████████████████████████ (Massive hot spot)
"am" ████████████████████
"ama"██████████████
"amazon prime" ██
```

If every `"a"` or `"am"` hit the backend Trie shards, those specific partitions would experience CPU starvation.

```txt
[ Keystroke: "a" ]
       │
       ▼
[ Client Browser Cache ] ──(Hit: 0ms)──► Return cached Top-5
       │ (Miss)
       ▼
[ CDN Edge Cache ] ──────(Hit: 5ms)──► Return edge cached Top-5
       │ (Miss)
       ▼
[ Query Service Redis ] ─(Hit: 8ms)──► Return Redis cached Top-5
       │ (Miss)
       ▼
[ Trie Server Shard ] ───(Compute: 12ms)──► Return from Trie RAM
```

1. **Client Tier:** The frontend caches every keystroke response in a Map keyed by prefix. Backspacing or typing familiar prefixes never leaves the device.
2. **Edge POP Tier:** Edge CDNs store responses for all prefixes with length $\le 2$ with a TTL of 1 hour. Because there are only $26^2 = 676$ possible two-letter combinations, edge cache hit rate for short prefixes is over 95%.
3. **Dedicated Hot Shard Replicas:** Shards responsible for high-frequency letter prefixes are provisioned with additional read replicas.

---

### Deep Dive 3: Real-Time Trending Queries (The Breaking News Problem)

Batch aggregation works well for historical stability, but fails when a sudden news event occurs (e.g., `"earthquake in tokyo"` or `"world cup final"`). A purely offline pipeline would take hours to suggest these breaking queries.

```txt
                     [ Real-Time Search Event Stream ]
                                     │
                        ┌────────────┴────────────┐
                        ▼                         ▼
            [ Standard Pipeline ]      [ Streaming Spike Detector ]
            (Hourly/Daily Spark)       (Flink Sliding Window: 5 min)
                        │                         │
                        ▼ (Stable)                ▼ (Surge detected)
            [ Base Trie Snapshot ]     [ Trending Overrides Cache (Redis) ]
                        │                         │
                        └────────────┬────────────┘
                                     ▼
                        [ Query Service Merger ]
                        (Boost trending terms into Top-5)
```

1. **Sliding Window Spike Detection (Apache Flink):**
   Flink monitors completed search submissions over a 5-minute sliding window. It computes query velocity:
   $$\text{Velocity} = \frac{\text{Current 5-min frequency}}{\text{Baseline 7-day average frequency}}$$
2. **Trending Overrides Cache:**
   When a query's velocity exceeds a dynamic threshold (e.g., $50\times$ normal volume), it is published to a high-speed in-memory Redis cluster storing prefix-to-trending mappings.
3. **Query Time Merge:**
   When the Query Service fetches the Top-5 list from the Trie shard, it also checks the Trending Overrides cache for that prefix. If a trending entry exists, it is merged into the top position of the suggestion list, providing real-time adaptability without touching the immutable base Trie structure.

---

## 6. Failure Modes and Resilience

### 1. Trie Shard Node Failure / Crash
- **Risk:** A Trie server crashes or runs out of memory, rendering an entire prefix partition unavailable.
- **Resilience:**
  - **Replication:** Each shard runs as an Active-Active replica group across multiple Availability Zones.
  - **Memory-Mapped Snapshots (`mmap`):** Trie snapshots are stored on local NVMe drives in a pre-compiled binary format. When a failed node restarts, it memory-maps (`mmap`) the snapshot into its address space instantly in $< 500\text{ms}$ without parsing text files or triggering garbage collection loops.

### 2. Frontend Race Conditions (Out-of-Order Network Responses)
- **Risk:** The user types `"ca"` (Request 1), then quickly types `'t'` producing `"cat"` (Request 2). Because of network routing variance, Request 1's response arrives *after* Request 2's response, overwriting the dropdown with outdated suggestions for `"ca"`.
- **Resilience:**
  - **Client-Side Request Cancellation:** The browser uses `AbortController` to cancel previous in-flight autocomplete requests before dispatching a new one:
    ```javascript
    let currentAbortController = null;

    async function fetchAutocomplete(prefix) {
      if (currentAbortController) {
        currentAbortController.abort();
      }
      currentAbortController = new AbortController();

      try {
        const response = await fetch(`/api/autocomplete?q=${encodeURIComponent(prefix)}`, {
          signal: currentAbortController.signal
        });
        const suggestions = await response.json();
        renderDropdown(suggestions);
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
      }
    }
    ```
  - **Sequence / Timestamp Tagging:** Each request carries a monotonic client sequence ID. The frontend discards any response whose sequence ID is lower than the latest rendered sequence ID.

### 3. Toxic, Explicit, or PII Data Pollution
- **Risk:** Malicious actors attempt SEO spam or coordinate bot attacks searching for offensive terms to force them into autocomplete suggestions.
- **Resilience:**
  - **Query Filtering Stage:** The offline aggregation pipeline cross-references terms against an automated Content Safety Classifier and a curated Blocklist / Denylist.
  - **Emergency Real-Time Filter:** A high-speed Bloom Filter and Redis Blacklist sit directly on the Query Service to immediately suppress compromised keywords without requiring a full Trie rebuild.

### 4. Cold Start & Cache Stampede during Snapshot Deployment
- **Risk:** When all Trie servers simultaneously reload a new 25 GB snapshot, memory usage doubles during the load and CPU spikes, causing latency degradation.
- **Resilience:**
  - **Staggered Rolling Deployment:** Update replicas sequentially (Node A in AZ-1, then Node B in AZ-2).
  - **Pre-Warming:** Before switching the active atomic pointer to the new Trie, the server runs a pre-warming script that executes the top 50,000 historical queries to populate CPU L1/L2/L3 caches and memory pages.

---

## 7. What Makes a Great Answer vs an Average One

| Evaluation Area | Average Answer | Great Senior Answer |
| :--- | :--- | :--- |
| **Data Structure** | Recommends a standard Trie, but describes traversing all subtrees and sorting with a min-heap on every keystroke. | Proposes an **In-Memory Trie with precomputed Top-K at every node** for guaranteed $O(L)$ constant-time lookups. |
| **Write Handling** | Attempts to update the Trie live on every search, causing write-lock contention under 100k QPS. | Decouples read/write: **asynchronous stream aggregation (Kafka + Flink)** with periodic immutable snapshot swapping. |
| **Memory Optimization** | Calculates raw Trie sizes without considering pointer overhead, dynamic child arrays, or Term ID indirection. | Details memory optimization: **Patricia/Radix tree compaction, Term ID mapping, and `mmap` zero-overhead startup**. |
| **Network & Edge** | Focuses only on backend databases; ignores frontend network chatter. | Implements **client debouncing, local LRU caching, CDN edge caching for 1–2 char prefixes, and `AbortController`**. |
| **Handling Extremes** | Treats all queries equally; ignores hot-shard distribution and breaking news events. | Designs **hierarchical 2-character partition routing** and a **Lambda/Kappa dual-path pipeline** for real-time trending spikes. |

---

## 8. 🧠 The Memory Hook

> **"Precompute at the nodes, separate reads from writes."**
>
> Autocomplete is not a search problem—it is a **precomputed prefix lookup problem**. Put the Top-5 answers directly on each Trie node so reads are pure $O(L)$ pointer steps. Collect searches asynchronously via Kafka, aggregate frequencies offline, and deploy immutable memory snapshots with atomic pointer swaps.
