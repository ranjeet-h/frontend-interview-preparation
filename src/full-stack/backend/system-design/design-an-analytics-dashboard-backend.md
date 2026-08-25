# Design an Real-Time Analytics Dashboard Backend

## 1. Understand the Problem First — Clarify Before Designing

Imagine it is 9:00 AM on Black Friday. Your e-commerce company launches a flash sale, and the executive team gathers in the war room. They open the real-time analytics dashboard to monitor revenue, conversion rates, and unique active shoppers.

The dashboard UI makes 24 simultaneous requests to the backend. Each request executes queries like:

```sql
SELECT
    country,
    device_type,
    COUNT(DISTINCT user_id) AS unique_visitors,
    SUM(order_total) AS gross_merchandise_value,
    AVG(checkout_latency_ms) AS p50_latency
FROM raw_events
WHERE event_timestamp >= NOW() - INTERVAL '30 days'
GROUP BY country, device_type;
```

In a traditional transactional database (PostgreSQL or MySQL), this query triggers a sequential scan across 600 million rows. Disk I/O spikes to 100%, memory buffer pools saturate, write locks cascade to the checkout service, and the database crashes. The dashboard throws `504 Gateway Timeout` errors, and the engineering team spends the morning dealing with an outage caused by read-only reporting queries.

Before drawing architectural boxes on the whiteboard, a senior engineer stops and asks clarifying questions to pin down the actual requirements and boundaries:

*   **Ingestion Scale & Peak Throughput:** How many events per second are we ingesting?
    *   *Scale target:* 100,000 events/sec at peak. At ~200 bytes per event, that is 20 MB/sec network ingestion (~1.7 TB raw data per day, ~50 TB/month).
*   **Query Latency & Freshness SLA:** What is the acceptable delay between an event happening on a device and it showing up on the dashboard (data freshness lag)? How fast must dashboard charts load?
    *   *SLA target:* Data freshness lag $\le$ 2 seconds. Dashboard query response time (p99) $\le$ 500 ms for any standard 7-day, 30-day, or 90-day time window.
*   **Query Patterns & Dimensionality:** Are queries fixed (pre-canned KPI tiles) or ad-hoc (arbitrary filtering and grouping by 15+ dimensions like `utm_source`, `browser`, `country`, `user_tier`)?
    *   *Target:* Both. Standard dashboard tiles load pre-canned metrics, but power users slice-and-dice across arbitrary dimension combinations.
*   **Cardinality & Precision Requirements:** Do unique user metrics (`COUNT(DISTINCT user_id)`) require 100% exact ledger precision, or is statistical approximation (e.g., 99% accuracy with $<1\%$ error) acceptable for UI visualizations?
    *   *Target:* Approximate counting ($<1\%$ standard error) is acceptable for large-scale cardinality metrics, while financial sums (`revenue`) must remain exact.
*   **Read vs. Write Concurrency:** We have 100k writes/sec continuously. How many concurrent dashboard viewers exist?
    *   *Target:* ~500 concurrent internal analysts and merchant dashboard users (~50–200 QPS on the query layer).

---

## 2. The Core Insight — The Decision Everything Else Flows From

The single architectural decision that governs real-time analytics is **the absolute separation of OLTP from OLAP, coupled with Streaming Pre-Aggregation and Columnar Storage**.

```txt
               ┌─────────────────────────────────────────────────────────┐
               │                  THE CORE BOTTLENECK                    │
               │  Row-Oriented OLTP (Postgres):                          │
               │  Reads 100% of data from disk (all columns) to compute  │
               │  an aggregate on just 2 columns.                        │
               └────────────────────────────┬────────────────────────────┘
                                            │
                                            ▼
               ┌─────────────────────────────────────────────────────────┐
               │                  THE OLAP BREAKTHROUGH                  │
               │  Columnar Storage (ClickHouse/Pinot):                   │
               │  Only scans the requested columns. Employs SIMD vector   │
               │  execution, scan speeds of billions of rows/sec, and    │
               │  data compression ratios of 5:1 to 10:1.                │
               └────────────────────────────┬────────────────────────────┘
                                            │
                                            ▼
               ┌─────────────────────────────────────────────────────────┐
               │                STREAMING PRE-AGGREGATION                │
               │  Never scan 500 million rows on demand.                 │
               │  Aggregate events in-flight into minute/hour rollups;   │
               │  estimate uniques with HyperLogLog sketches.            │
               └─────────────────────────────────────────────────────────┘
```

When you query an OLTP database for `SUM(revenue)`, the engine reads the entire row—user profile, billing address, session tokens, metadata—into RAM just to inspect one 8-byte float.

To solve this at massive scale:
1.  **Ingestion Decoupling:** Ingest raw events into an append-only distributed log (Apache Kafka) to isolate producer spikes from storage engines.
2.  **Columnar OLAP Engines:** Store event tables column-by-column (ClickHouse, Apache Pinot, or Snowflake). A query for revenue only touches the `timestamp` and `revenue` columns, reducing disk read volume by over 90%.
3.  **Stream Pre-Aggregation:** Compute rollups (1-minute, 1-hour, 1-day) as data arrives using a stream processor (Apache Flink) or OLAP materialized views. A query spanning 30 days scans 720 hourly rows instead of 500,000,000 raw events.
4.  **Probabilistic Data Structures:** Count high-cardinality values using HyperLogLog (HLL). Instead of storing 50 million UUIDs in a memory hash set, HLL stores a 12 KB register array that calculates `COUNT(DISTINCT)` in microseconds and merges across distributed shards effortlessly.

---

## 3. High-Level Architecture — Components and Why Each Exists

```txt
[Client SDKs / Apps / Microservices]
                │
                ▼ (HTTPS / Protobuf / JSON)
   [API Gateway & Event Ingestion Collector]
                │
                ▼ (Buffered Batch Producer)
         [Apache Kafka Cluster] (Partitioned by tenant_id / user_id)
                │
        ┌───────┴─────────────────────────────────────────┐
        ▼                                                 ▼
[Apache Flink Stream Workers]                   [ClickHouse OLAP Ingestion]
(Real-Time Windows: 5s, 1m, 1h)                 (Buffered Micro-batches)
  - Tumbling window aggregates                    - Raw events table (7-day TTL)
  - HyperLogLog sketch building                   - Materialized rollup views
  - Anomaly & threshold alerts                    - AggregatingMergeTree tables
        │                                                 ▲
        ▼ (Push live deltas)                              │ (Historical queries)
[Redis Pub/Sub & Cache] ─────────┐                        │
  - Hot metric cache             │                        │
  - Quantized window store       │                        │
  - Live metric deltas           │                        │
        │                        │                        │
        ▼                        ▼                        │
[WebSocket Push Gateway]   [Analytics Query API / Semantic Layer]
        │                                ▲
        ▼ (Live push updates)            │ (HTTP REST / GraphQL queries)
[Frontend Dashboard Client (React / WebGL Canvas Charts)]
```

### Component Breakdown and Purpose

1.  **Event Ingestion Collector (Stateless Golang/Rust HTTP Workers):**
    *   *Purpose:* Terminates HTTPS connections from clients, validates request payloads against schema registries (JSON Schema / Protobuf), enriches events with server-side timestamps and IP geolocation, and writes immediately to Kafka.
    *   *Why it is separated:* Keeps the ingestion entry point lightning fast ($< 5\text{ ms}$ processing time) and decoupled from downstream database load.
2.  **Distributed Message Log (Apache Kafka / Redpanda):**
    *   *Purpose:* Acts as the durable buffer and shock absorber. If ClickHouse or Flink slows down during maintenance, Kafka retains 7 days of raw events without dropping data.
    *   *Partitioning Strategy:* Partitioned by `tenant_id` or `hash(user_id)` to preserve per-entity ordering and enable parallel consumption.
3.  **Stream Processing Engine (Apache Flink):**
    *   *Purpose:* Ingests streaming events from Kafka in real time, applies watermarking for late-arriving data, computes stateful tumbling and sliding window aggregates (e.g., 5-second active users, 1-minute conversion rates), and emits live rollups.
4.  **Real-Time Columnar OLAP Database (ClickHouse / Apache Pinot):**
    *   *Purpose:* Stores both raw granular events (for arbitrary deep filtering with a 7- to 30-day retention) and pre-aggregated multi-dimensional rollup tables (retained for years). Uses vector execution on NVMe SSDs to evaluate millions of records per CPU core per second.
5.  **Analytics Query Service & Semantic Layer (Node.js / Go):**
    *   *Purpose:* Translates user UI dashboard filters into optimized OLAP SQL queries. Implements query deduplication (SingleFlight), applies row-level security per tenant, and decides whether to route queries to pre-computed cache, rollup tables, or raw data.
6.  **Distributed Cache & Time-Quantized Store (Redis):**
    *   *Purpose:* Caches completed historical time-slice results (e.g., yesterday's metrics never change) and acts as the pub/sub backbone for pushing live metric updates.
7.  **WebSocket Push Gateway:**
    *   *Purpose:* Maintains persistent duplex connections with active frontend dashboard browser sessions. Streams real-time KPI counter updates every 1 to 5 seconds so users see live counters ticking up without hammering the backend with polling requests.

---

## 4. Key Technical Decisions — With Real Tradeoffs

### Decision 1: Processing Architecture — Kappa Architecture over Lambda Architecture

```txt
LAMBDA ARCHITECTURE (Rejected):
Events ──► Speed Layer (Flink/Storm) ──► Real-Time View ──┐
       ──► Batch Layer (Hadoop/Spark)  ──► Batch View     ──┴──► Query Merge Layer (Dual codebases)

KAPPA ARCHITECTURE (Chosen):
Events ──► Apache Kafka ──► Apache Flink / ClickHouse ──► Unified Serving View (Single codebase)
```

*   **Choice:** Kappa Architecture (Single stream processing engine + Real-time OLAP).
*   **Tradeoff:** Lambda architecture runs two separate pipelines: a batch layer (e.g., Spark running hourly for exactness) and a speed layer (e.g., Flink for live estimates). This requires maintaining business logic in two different frameworks and writing complex merge logic in the query layer. Kappa uses a single stream pipeline (Kafka + Flink + ClickHouse). To reprocess historical data or fix bugs, we simply replay Kafka topics or recompute ClickHouse tables from cold Parquet archives using the exact same code.

### Decision 2: Storage Engine — Columnar OLAP (ClickHouse) over Relational OLTP (PostgreSQL) and Time-Series (TimescaleDB)

| Feature | PostgreSQL | TimescaleDB | ClickHouse / Pinot |
| :--- | :--- | :--- | :--- |
| **Storage Layout** | Row-oriented | Row-oriented chunks | Pure Columnar |
| **Scan Throughput** | ~50k–200k rows/sec | ~1M–5M rows/sec | **50M–200M rows/sec/core** |
| **Compression Ratio** | 1:1 to 1.5:1 | 3:1 to 5:1 | **5:1 to 10:1 (ZSTD / DoubleDelta)** |
| **Vectorized (SIMD) Math** | No | Limited | **Yes (Native AVX-512)** |
| **Point Mutation (UPDATE)** | Fast (ACID) | Moderate | Very Slow (Batch mutations only) |

*   **Choice:** Pure Columnar OLAP engine (ClickHouse).
*   **Tradeoff:** ClickHouse does not support traditional ACID multi-row transactions or frequent single-row `UPDATE`/`DELETE` mutations. However, analytics workloads are $99.9\%$ append-only writes and massive parallel aggregated reads. Columnar compression and SIMD vector processing make it 50x to 100x faster than PostgreSQL for aggregation queries.

### Decision 3: High-Cardinality Uniques — HyperLogLog (HLL) over Exact `COUNT(DISTINCT)`

*   **Choice:** HyperLogLog probabilistic cardinality estimation for real-time dashboards.
*   **Tradeoff:**
    *   *Exact `COUNT(DISTINCT)`:* Requires retaining a Hash Set of every distinct user ID seen in the time window. For 100 million active users with 128-bit UUIDs, the hash set requires $\ge 1.6\text{ GB}$ of RAM per query dimension slice. Merging distinct sets across multiple worker nodes requires shipping gigabytes of raw sets over the network.
    *   *HyperLogLog:* Uses fixed 12 KB memory registers per sketch ($m = 2^{14} = 16,384$ buckets), providing a standard error of $\approx \frac{1.04}{\sqrt{m}} = 0.81\%$. HLL sketches are mathematical **monoids** (associative and commutative). Merging HLL sketches across 100 distributed nodes or 30 days of data requires performing simple bitwise `MAX` operations on 12 KB arrays, completing in under 1 millisecond.

### Decision 4: Client Updates — Hybrid Model (SSE / WebSocket Push for Live Window + Polling / Caching for Historical Ranges)

*   **Choice:** WebSocket/SSE for the live rolling window (last 5 minutes); HTTP REST with Redis time-quantized cache for historical range selector queries (last 7d, 30d, 90d).
*   **Tradeoff:** Pure client polling (e.g., polling every 1 second) creates massive redundant database queries, causing cache stampedes. Pure WebSockets for all historical queries prevents standard HTTP edge caching (CDN/Redis). The hybrid approach allows historical queries to be cached immutably at the HTTP edge, while live real-time counters stream down lightweight WebSocket push channels.

---

## 5. Deep Dives — The Parts That Actually Matter

### Deep Dive 1: Real-Time Stream Aggregation & Rollups with ClickHouse `AggregatingMergeTree`

To provide sub-second responses across years of data, we use a hierarchical pre-aggregation strategy. Raw events are inserted in micro-batches into an ingestion table, and ClickHouse materialized views automatically roll up data in the background into 1-minute and 1-hour summaries.

```sql
-- 1. Raw Events Ingestion Table
CREATE TABLE raw_events (
    event_timestamp DateTime64(3, 'UTC'),
    tenant_id UInt32,
    event_name LowCardinality(String),
    country LowCardinality(String),
    device LowCardinality(String),
    user_id UInt64,
    revenue Decimal(18, 4)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_timestamp)
ORDER BY (tenant_id, event_name, event_timestamp)
TTL event_timestamp + INTERVAL 7 DAY;

-- 2. Materialized Rollup Table (1-Hour Buckets)
CREATE TABLE hourly_analytics_rollup (
    hour_bucket DateTime('UTC'),
    tenant_id UInt32,
    event_name LowCardinality(String),
    country LowCardinality(String),
    device LowCardinality(String),
    total_events SimpleAggregateFunction(sum, UInt64),
    total_revenue SimpleAggregateFunction(sum, Decimal(18, 4)),
    -- HyperLogLog state column for distinct user tracking
    unique_users_hll AggregateFunction(uniqHLL12, UInt64)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour_bucket)
ORDER BY (tenant_id, event_name, country, device, hour_bucket);

-- 3. Materialized View to Automatically Populate Rollups on Insert
CREATE MATERIALIZED VIEW mv_hourly_analytics_rollup
TO hourly_analytics_rollup AS
SELECT
    toStartOfHour(event_timestamp) AS hour_bucket,
    tenant_id,
    event_name,
    country,
    device,
    count() AS total_events,
    sum(revenue) AS total_revenue,
    uniqHLL12State(user_id) AS unique_users_hll
FROM raw_events
GROUP BY hour_bucket, tenant_id, event_name, country, device;
```

```sql
-- 4. Fast Query Across 30 Days (Executes in < 15ms)
SELECT
    country,
    sum(total_events) AS events_count,
    sum(total_revenue) AS gross_revenue,
    -- Merge thousands of HLL sketches with zero data loss
    uniqHLL12Merge(unique_users_hll) AS estimated_unique_users
FROM hourly_analytics_rollup
WHERE tenant_id = 42
  AND event_name = 'purchase'
  AND hour_bucket >= NOW() - INTERVAL 30 DAY
GROUP BY country
ORDER BY gross_revenue DESC;
```

```txt
DATA COMPACTION HIERARCHY:

Raw Events:           [ 500,000,000 Rows ]  (Full granularity, 7-day retention)
                              │
                              ▼ (Background Materialized View)
1-Minute Rollup:      [   8,000,000 Rows ]  (98.4% reduction, 90-day retention)
                              │
                              ▼ (Background Compaction)
1-Hour Rollup:        [     133,000 Rows ]  (99.97% reduction, 3-year retention)
```

---

### Deep Dive 2: The "Open Window" Query Problem (Merging Historical Rollups with Live In-Flight Stream)

Pre-aggregated tables only contain **sealed** past time buckets (e.g., fully completed hours). What happens when a user asks for "Metrics for the last 24 hours including the last 10 seconds"?

If you only query rollups, you miss the last 45 minutes of data. If you query raw events for the entire 24 hours, you scan millions of rows needlessly.

**The Solution: The Hybrid Multi-Tier Query Router**

```txt
Query: "Show me metrics from 24 Hours Ago until NOW()"

Time Horizon:
|────────────────────────────────────────────┬─────────────────────────┬──────────────|
T - 24 Hours                                T - 1 Hour                T - 60s        NOW
[ Tier 1: Hourly Rollups ]                   [ Tier 2: 1-Min Rollups ] [ Tier 3: In-Memory / Raw Buffer ]
(Scans 23 rows per dimension)               (Scans 59 rows)           (Scans latest uncommitted stream)

                           │                             │                             │
                           └─────────────────────────────┼─────────────────────────────┘
                                                         ▼
                                       [ Unified API Semantic Layer ]
                               (Merges sums, performs HLL sketch union)
                                                         │
                                                         ▼
                                       [ Single Combined Result in 20ms ]
```

1.  **Slice A (Historical Sealed Range - `[NOW - 24h, NOW - 1h]`):** Queried against `hourly_analytics_rollup`. Scans 23 aggregate rows.
2.  **Slice B (Recent Closed Range - `[NOW - 1h, NOW - 60s]`):** Queried against `minute_analytics_rollup`. Scans 59 aggregate rows.
3.  **Slice C (Open Live Window - `[NOW - 60s, NOW]`):** Queried directly from Redis memory buffers or the uncompacted head of `raw_events`.
4.  **Semantic Layer Assembly:** The backend merges scalar sums (`sum(A) + sum(B) + sum(C)`) and applies `HLL_UNION(A.hll, B.hll, C.hll)` to return an exact, seamless time series in under 20 milliseconds.

---

### Deep Dive 3: Cache Invalidation Strategy via Time Quantization

Traditional cache invalidation (`DELETE cache_key WHERE ...`) fails in analytics because data arrives continuously.

Instead, we use **Time-Quantized Window Caching**:

```typescript
// Query Service: Time-Quantized Cache Key Generation
function getAnalyticsCacheKey(
  tenantId: string,
  metric: string,
  dimensions: string[],
  startTime: Date,
  endTime: Date
): string {
  // Quantize start and end times to 1-hour boundaries for historical queries
  const quantizedStart = Math.floor(startTime.getTime() / (3600 * 1000)) * (3600 * 1000);
  const quantizedEnd = Math.floor(endTime.getTime() / (3600 * 1000)) * (3600 * 1000);

  const dimHash = crypto
    .createHash('sha256')
    .update(dimensions.sort().join(','))
    .digest('hex')
    .substring(0, 8);

  // Example: "analytics:tenant_42:revenue:a7b8c9d0:1700000000:1700259200"
  return `analytics:${tenantId}:${metric}:${dimHash}:${quantizedStart}:${quantizedEnd}`;
}
```

*   **Closed Historical Windows (e.g., yesterday):** Cached in Redis with a long TTL (7 days). They are completely immutable.
*   **Current Open Window (today/now):** Never cached in long-term Redis under a static key. Computed on the fly by combining cached historical slices with the live streaming delta.

---

## 6. Failure Modes and Resilience

### Failure Mode 1: Kafka Consumer Lag & Ingestion Backpressure

```txt
Normal Ingestion:
Producers (100k/s) ──► Kafka ──► Flink Workers (100k/s) ──► ClickHouse (Sink ok)

Spike / Downstream Slowdown:
Producers (300k/s) ──► Kafka (Lag Growing: 15M events) ──► Flink Workers (Saturated)
                             │
                             ▼
              [ Auto-Scale Consumers + Batch Sink Flush ]
```

*   **What happens:** Traffic spikes 3x. ClickHouse disk I/O throttles, causing Flink sink workers to block. Kafka consumer lag accumulates to millions of unread records. Dashboard metrics lag behind wall-clock time by 20+ minutes.
*   **Detection:** Alert on `kafka_consumer_lag_records > 500,000` or `event_timestamp_delay_seconds > 5s`.
*   **Mitigation & Recovery:**
    1.  *Strict Batch Ingestion:* Never insert single records into ClickHouse. Flink or the ingestion collector must flush in micro-batches of $\ge 50,000\text{ rows}$ or every 2–5 seconds using buffer queues.
    2.  *Consumer Group Auto-scaling:* Automatically scale Flink task managers up to the total number of Kafka topic partitions.
    3.  *Backpressure Propagation:* Flink's reactive credit-based flow control slows down Kafka consumption gracefully without crashing worker nodes.

---

### Failure Mode 2: The "Too Many Parts" Write Amplification in ClickHouse

*   **What happens:** Microservice developers configure an ingestion pipeline that executes 500 small `INSERT` statements per second, each writing 100 rows. ClickHouse writes each insert as an immutable directory ("part") on disk. Background merge threads cannot keep up, throwing the fatal error: `DB::Exception: Too many parts in all data in table (300). Merges are processing significantly slower than inserts`. All writes are rejected.
*   **Detection:** Alert on `clickhouse_table_parts_count > 150`.
*   **Mitigation:**
    1.  *Buffer Layer:* Implement an intermediate Vector / Kafka buffer that aggregates rows in memory and issues large block inserts ($10,000$ to $100,000$ rows per single `INSERT`).
    2.  *Async Inserts:* Enable ClickHouse native asynchronous batching (`SET async_insert = 1, wait_for_async_insert = 0, async_insert_busy_timeout_ms = 2000`), forcing the database to buffer micro-inserts in server RAM before flushing a single consolidated part to disk.

---

### Failure Mode 3: Cache Stampede (Thundering Herd) on Dashboard Refresh

*   **What happens:** 200 account managers open the company KPI dashboard at 9:00 AM. The cached entry for the default 30-day KPI view expires at 9:00:01 AM. All 200 requests miss the cache simultaneously and trigger identical heavy aggregate queries in ClickHouse, causing CPU spikes and query queue saturation.
*   **Mitigation (SingleFlight / Distributed Mutex):**

```typescript
// Query Service: SingleFlight Pattern to Prevent Thundering Herd
import { Mutex } from 'async-mutex';

const inFlightQueries = new Map<string, Promise<AnalyticsResult>>();

async function executeAnalyticsQuery(cacheKey: string, sqlQuery: string): Promise<AnalyticsResult> {
  // 1. Check Redis Cache
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // 2. Coalesce in-flight queries
  if (inFlightQueries.has(cacheKey)) {
    // Join the existing pending promise instead of firing a second DB query
    return inFlightQueries.get(cacheKey)!;
  }

  const queryPromise = (async () => {
    try {
      const result = await clickhouse.query(sqlQuery);
      // Cache with jitter to prevent synchronized future expiry
      const jitterTtl = 3600 + Math.floor(Math.random() * 300);
      await redis.set(cacheKey, JSON.stringify(result), 'EX', jitterTtl);
      return result;
    } finally {
      inFlightQueries.delete(cacheKey);
    }
  })();

  inFlightQueries.set(cacheKey, queryPromise);
  return queryPromise;
}
```

---

### Failure Mode 4: Clock Skew and Out-of-Order Late-Arriving Events

*   **What happens:** Mobile devices operate offline or with broken system clocks, emitting event payloads timestamped 3 days in the past or 5 hours in the future.
*   **Mitigation:**
    1.  *Dual Timestamps:* Every event records both `client_event_timestamp` and `server_ingest_timestamp`.
    2.  *Watermarking:* Flink uses a bounded out-of-orderness watermark (e.g., max allowed lateness of 10 seconds for real-time streaming).
    3.  *Dead-Letter Quarantine:* Events with `client_event_timestamp` older than 24 hours or in the future by $> 15\text{ minutes}$ are routed to a separate cold storage DLQ topic for batch reconciliation, preventing corruption of real-time streaming windows.

---

## 7. What Makes a Great Answer vs an Average One

```txt
┌───────────────────────────────────────┬──────────────────────────────────────────┐
│ AVERAGE / JUNIOR ANSWER               │ GREAT / SENIOR CANDIDATE ANSWER          │
├───────────────────────────────────────┼──────────────────────────────────────────┤
│ "We will store events in PostgreSQL    │ "OLTP cannot handle analytical scans.    │
│ or MongoDB and index the user_id and  │ We decouple writes via Kafka and route   │
│ timestamp columns."                   │ into a Columnar OLAP engine like         │
│                                       │ ClickHouse using SIMD vectorized execution."│
├───────────────────────────────────────┼──────────────────────────────────────────┤
│ "We will use COUNT(DISTINCT user_id)   │ "Exact unique counts over 100M rows      │
│ queries across the 30-day range."     │ require gigabytes of RAM. We use         │
│                                       │ HyperLogLog (HLL) sketches with fixed    │
│                                       │ 12KB registers to achieve 0.8% error in   │
│                                       │ sub-millisecond query time."             │
├───────────────────────────────────────┼──────────────────────────────────────────┤
│ "The dashboard will poll the REST API │ "We use a hybrid delivery model:         │
│ every 1 second to update the charts." │ WebSockets/SSE for rolling 5s live deltas│
│                                       │ and time-quantized Redis cached queries  │
│                                       │ for historical multi-day date ranges."   │
├───────────────────────────────────────┼──────────────────────────────────────────┤
│ "We will write each event directly to │ "We buffer writes into 50k-row micro-    │
│ the database as soon as it arrives."  │ batches to prevent ClickHouse part       │
│                                       │ fragmentation ('Too many parts' error)." │
├───────────────────────────────────────┼──────────────────────────────────────────┤
│ Ignores late data and time windows.   │ Explains the 'Open Window' query pattern:│
│                                       │ dynamically unions pre-computed hourly   │
│                                       │ rollups with raw streaming tail buffers. │
└───────────────────────────────────────┴──────────────────────────────────────────┘
```

---

## 8. 🧠 The Memory Hook

> **"Never count a billion grains of sand on demand. Weigh them in buckets as they fall through the hourglass."**
>
> In real-time analytics: Buffer in **Kafka**, aggregate streaming windows in **Flink**, store column-wise in **ClickHouse**, estimate high-cardinality uniques with **HyperLogLog**, and query pre-computed hourly rollups merged with live tail buffers.
