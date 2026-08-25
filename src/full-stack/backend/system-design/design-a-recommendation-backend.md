# Design a Recommendation Backend (Netflix / E-Commerce)

## 1. Understand the Problem First — Clarify Before Designing

A user opens Netflix or Amazon on their phone. The homepage has a strict 50ms latency budget to return 20 hyper-personalized recommendations. Behind the scenes, the catalog contains 10 million items, the user has 5 years of click history, and 3 seconds ago they clicked on a mechanical keyboard.

If your backend tries to run a deep learning model across 10 million items in real time, the request times out after computing 500 items, burning CPU and destroying user retention. If you precompute recommendations in an offline batch job every night, the user buys a keyboard at 2:00 PM and gets shown keyboards for the rest of the week because the system is blind to real-time session intent. On top of that, you face the cold start problem (a brand-new user with zero history or a brand-new product with zero ratings) and feedback loops (the algorithm only recommends previously clicked items, starving 95% of your catalog).

Before sketching any architecture, clarify these requirements with the interviewer:

**Scale and Throughput:**
- How large is the item catalog (e.g., 10 million items) and active user base (e.g., 100 million monthly active users, 10 million daily active users)?
- What is the peak read traffic (e.g., 50,000 requests per second) and latency SLA (e.g., p99 < 50ms)?

**Signals and Feedback Type:**
- Are we processing explicit feedback (5-star ratings, thumbs up, reviews) or implicit feedback (clicks, impressions, watch time percentage, add-to-cart, bounce rate)? Implicit signals arrive at 100x higher volume and require stream processing.

**Freshness and Personalization Horizon:**
- Does the system need instant within-session adaptation (reacting to clicks within 2 to 5 seconds) or is hourly/daily batch personalization acceptable?

**Optimization Objective:**
- Are we optimizing for single-click CTR, conversion/purchase rate, session watch time, or long-term retention ($P(\text{click}) \times P(\text{conversion})$)?

## 2. The Core Insight — The Decision Everything Else Flows From

You cannot score 10 million items with a complex machine learning model in 50 milliseconds. The entire system design flows from a multi-stage funnel that trades computational complexity for candidate volume at each step, combined with a three-speed time architecture (Offline, Near-line, Online).

The recommendation funnel works in three progressive stages:

1. **Candidate Retrieval (10,000,000 $\to$ 500 items in ~10ms):** Fast, coarse filtering across multiple sources. We use Approximate Nearest Neighbors (ANN) vector search on dual embeddings (Two-Tower models) alongside collaborative filtering and popularity heuristics. High recall is the goal; precision does not matter yet as long as relevant candidates are not dropped.
2. **Heavy Ranking / Scoring (500 $\to$ 50 items in ~25ms):** Complex scoring models (Gradient Boosted Decision Trees like LightGBM or Deep Learning Ranking Models like DLRM/Transformers) evaluate hundreds of real-time contextual and cross features to compute fine-grained probabilities like $P(\text{click}) \times P(\text{purchase})$.
3. **Re-Ranking & Diversity Filtering (50 $\to$ 20 items in ~5ms):** Deterministic business logic, deduplication of already-consumed items, category diversity algorithms (Maximal Marginal Relevance), sponsored item injection, and exploration bandits.

This funnel is powered by three data planes operating at different speeds:
- **Offline Plane (Hours/Days):** Batch training of deep neural networks on petabytes of historical logs, matrix factorization, and bulk pre-computation of item embeddings.
- **Near-line / Streaming Plane (Seconds):** Ingesting clickstreams via Kafka and Apache Flink to update user real-time state in a feature store within 3 seconds of an interaction.
- **Online Plane (Milliseconds):** Low-latency orchestration that fetches candidate IDs, hydrates features from memory, scores candidates, applies business rules, and responds under 50ms.

## 3. High-Level Architecture — Components and Why Each Exists

```txt
[ Client App ]
       │ (1) GET /recommendations?user_id=123&context=homepage
       ▼
[ Recommendation Orchestrator ] ────────────────────────┐
       │                                                │
       ├─► (2) Vector DB (Milvus / Qdrant)              │ (3) Online Feature Store
       │       [ANN Vector Search: 10M -> 500 items]    │     (Feast over Redis / Aerospike)
       │       ◄─ Returns 500 Candidate IDs             │     ◄─ Real-time User & Item Features
       │                                                │
       ├─► (4) Ranking Service (Triton / TorchServe) ◄──┘
       │       [Heavy ML Model: 500 -> 50 scored items]
       │
       ├─► (5) Re-Ranking & Diversity Engine
       │       [MMR Diversity, Deduplication, Business Rules: 50 -> 20 items]
       │
       ▼ (6) Return 20 JSON recommendations (Latency < 50ms)
[ Client App ]

═════════════════════ BACKGROUND STREAMING & OFFLINE PLANES ═════════════════════
[ Client Clickstream ] ──► [ Kafka ] ──► [ Apache Flink ] ──► [ Online Feature Store ]
                                  │                                    │
                                  ▼                                    ▼
                          [ Data Lake (S3) ] ──► [ Spark / Airflow ] ──► [ Model Training ]
```

**Recommendation Orchestrator (API Gateway):**
Coordinates the end-to-end recommendation lifecycle. It enforces strict per-stage timeout budgets, parallelizes candidate retrieval queries across multiple engines, aggregates candidate sets, dispatches scoring payloads to inference clusters, and applies fallback tiers if downstream services degrade.

**Vector Database / ANN Retrieval Engine (Milvus / Qdrant / Faiss):**
Stores pre-computed dense vector embeddings for all 10 million items. When given a query vector representing the user's recent taste, it uses Hierarchical Navigable Small World (HNSW) graph indexing to return the 500 closest item vectors in under 5ms.

**Feature Store (Feast / Redis / Aerospike + S3/Parquet):**
Maintains feature consistency between training and inference. The **Online Store** (in-memory Redis/Aerospike) delivers point-in-time features (e.g., user's last 5 clicked categories, 10-minute click velocity, item historical CTR) with sub-3ms read latency. The **Offline Store** (Parquet tables on S3) stores historical feature snapshots for model training to prevent future-data leakage.

**Ranking / Inference Cluster (Triton Inference Server / ONNX Runtime):**
Executes heavy machine learning models on GPU/CPU worker pools. It accepts 500 candidate IDs joined with their hydrated online feature vectors, evaluates a multi-task neural network or LightGBM model, and outputs calibrated engagement scores.

**Streaming Event Bus & Stream Processor (Kafka + Apache Flink):**
Captures every click, impression, video pause, and purchase. Flink aggregates raw events over sliding windows (e.g., rolling count of sci-fi movie views in the last 15 minutes) and writes updated state directly to the Online Feature Store so the next user request immediately reflects recent behavior.

**Offline Training & Workflow Engine (Spark + Airflow + Ray):**
Runs daily batch jobs on the historical data lake. It re-trains ranking models, runs matrix factorization, exports item embeddings to the vector database, and generates static fallback recommendation lists.

## 4. Key Technical Decisions — With Real Tradeoffs

**Decision 1: Approximate Nearest Neighbor (ANN) Indexing: HNSW vs IVF-PQ**
- **Choice:** HNSW (Hierarchical Navigable Small World) graphs.
- **Alternatives Considered:** IVF-PQ (Inverted File with Product Quantization) and Brute-Force Flat Search.
- **Tradeoff:** Flat search provides 100% exact recall but requires $O(N)$ dot products, taking 200ms+ for 10M items. IVF-PQ compresses vectors into small memory footprints, but its recall drops significantly on high-dimensional embeddings (256-dim). HNSW maintains a multi-layer graph that guarantees >95% recall at sub-3ms search latency. The cost is high RAM usage (holding millions of 256-dim float vectors and graph edges in memory). We accept higher infrastructure cost for latency and recall guarantees.

**Decision 2: Feature Store Split: Dual-Layer (Redis + Parquet) vs Single SQL Database**
- **Choice:** Dual-layer feature store managed by Feast (Redis for online point lookups, Parquet on S3 for offline training).
- **Alternatives Considered:** Querying primary PostgreSQL or querying data warehouse directly at inference time.
- **Tradeoff:** Running analytical feature queries against PostgreSQL during user requests causes connection exhaustion and 100ms+ latency spikes. Querying a data warehouse at request time is impossible. A dual-layer feature store guarantees sub-3ms lookups at inference while guaranteeing that the exact feature values fed to the offline training script match what the online model saw at request time, eliminating train-serve skew. The tradeoff is maintaining continuous synchronization pipelines between streaming events and batch storage.

**Decision 3: Scoring Objective: Multi-Task Ranking vs Single Click-Through Rate (CTR)**
- **Choice:** Multi-task prediction objective: $\text{Score} = P(\text{click})^{\alpha} \times P(\text{conversion})^{\beta} \times \text{WatchTime}^{\gamma}$.
- **Alternatives Considered:** Optimizing solely for $P(\text{click})$.
- **Tradeoff:** Optimizing exclusively for clicks results in clickbait recommendations (sensational titles, low-quality products) that drive high bounce rates and hurt long-term retention. Multi-task loss functions jointly predict click probability, purchase/completion probability, and expected consumption time. Tuning the exponent weights ($\alpha, \beta, \gamma$) requires continuous online A/B testing, but it aligns algorithmic output directly with business value.

**Decision 4: Dynamic Real-Time Scoring vs 100% Precomputed Feeds**
- **Choice:** Dynamic online scoring of retrieved candidates with fallback to pre-warmed candidate pools.
- **Alternatives Considered:** Generating complete user homepages in a nightly batch job and serving directly from Redis.
- **Tradeoff:** Precomputing 100% of user feeds offline is computationally efficient and simple to serve (<5ms), but it is completely blind to intra-day session behavior. If a user's intent shifts during a session, precomputed feeds cannot adapt. Dynamic online scoring evaluates real-time streaming features on the fly. We mitigate the increased compute cost and latency risk by scoring only 500 candidates rather than the entire catalog.

## 5. Deep Dives — The Parts That Actually Matter

**Two-Tower Neural Networks for Sub-5ms Vector Retrieval:**

Candidate generation cannot evaluate cross-features between users and items because that would require 10 million model evaluations per request. Instead, we decouple user representation from item representation using a Two-Tower Deep Neural Network.

```txt
USER TOWER (Online Inference)               ITEM TOWER (Offline Batch)
─────────────────────────────               ──────────────────────────
[ User ID, Demographics ]                   [ Item ID, Title, Tags ]
[ Recent 10 Clicks (IDs) ]                  [ Category, Brand, Price ]
[ Device, Time of Day    ]                  [ Historical CTR, Rating ]
          │                                             │
          ▼                                             ▼
  [ Dense Layers ]                              [ Dense Layers ]
          │                                             │
          ▼                                             ▼
[ 128-dim User Vector U ]                     [ 128-dim Item Vector I ]
          │                                             │
          │                                             ▼
          │                                  [ Index into Vector DB ]
          │                                  [ HNSW Graph Index     ]
          │                                             │
          └──────────────► [ Dot Product: U · I ] ◄─────┘
                           [ Top 500 Nearest Neighbors ]
```

**The Mathematical Foundation:**
The User Tower maps user history and current context into an embedding vector $U \in \mathbb{R}^{128}$. The Item Tower maps item metadata and static attributes into an embedding vector $I \in \mathbb{R}^{128}$. The predicted affinity is the cosine similarity or dot product:

$$\text{Affinity}(u, i) = \langle U, I \rangle = \sum_{k=1}^{128} U_k \cdot I_k$$

**The Production Trick:**
Because the Item Tower inputs do not depend on the user, we run the Item Tower offline for all 10 million items once a day (or on new item creation). We store all 10 million pre-computed vectors in an HNSW index inside Milvus or Qdrant.

When a user request arrives:
1. The orchestrator passes the user's recent clicks and context to the User Tower service, which outputs vector $U$ in ~2ms.
2. Vector $U$ is queried against the HNSW index in the vector database.
3. The vector database computes fast vector dot products along graph paths and returns the top 500 candidate item IDs in ~3ms.

**Solving the Cold Start Problem:**

Cold start occurs in two distinct scenarios: brand-new users (zero interaction history) and brand-new items (zero clicks or ratings).

**New User Cold Start:**
- **Onboarding Explicit Signals:** Prompt new users during signup to select 3 to 5 preferred genres, categories, or brands.
- **Contextual & Geographic Priors:** Use IP geolocation, device type, referral source, and time of day to map the user to a pre-computed demographic cluster (e.g., top trending electronics in Germany on mobile).
- **Exploration via Multi-Armed Bandits:** Use an $\epsilon$-greedy or Thompson Sampling strategy. For the first 20 impressions, 80% of the feed is filled with high-confidence popular items (exploitation) and 20% with diverse category probes (exploration). As soon as the user clicks a probe, the streaming Flink pipeline updates their feature vector, transitioning them out of cold start within seconds.

**New Item Cold Start:**
- **Content-Based Semantic Embeddings:** When a new product or movie is uploaded, it has zero interaction data. We pass its text description, category hierarchy, and image assets through multimodal models (e.g., CLIP or sentence transformers) to project it directly into the 128-dim item vector space.
- **Exploration Traffic Allocation:** The re-ranking engine reserves a mandatory 2% to 5% impression slice across user feeds for new items. Once an item reaches a statistical threshold of impressions (e.g., 1,000 views), its empirical CTR replaces the content-based prior, allowing organic ranking models to take over.

**Re-Ranking, Feedback Loops, and Maximal Marginal Relevance (MMR):**

If a user clicks on one Harry Potter book, a heavy ranking model will predict high click probabilities for 20 other Harry Potter books. Presenting 20 identical recommendations causes filter bubbles, creates a poor user experience, and starves the rest of the catalog.

```txt
Ranked Candidates (50 Items)
             │
             ▼
[ Re-Ranking & Diversity Engine ]
  ├─ 1. Hard Business Rules: Filter items purchased in last 30 days
  ├─ 2. Deduplication: Remove items shown in previous 3 sessions without click
  ├─ 3. MMR Diversity Algorithm: Balance relevance score against category similarity
  ├─ 4. Category Interleaving: Max 2 consecutive items from same category
  ├─ 5. Exploration Slot: Inject 1 new cold-start item at position 4
             │
             ▼
Final Feed (Top 20 Items)
```

**Maximal Marginal Relevance (MMR) Formula:**
To balance relevance with diversity, the re-ranker iteratively selects items using MMR:

$$\text{MMR}(u) = \arg\max_{d_i \in R \setminus S} \left[ \lambda \cdot \text{Score}(u, d_i) - (1 - \lambda) \max_{d_j \in S} \text{Similarity}(d_i, d_j) \right]$$

Where:
- $R$ is the set of 50 scored candidates.
- $S$ is the set of items already selected for the final feed.
- $\text{Score}(u, d_i)$ is the relevance output from the heavy ranker.
- $\text{Similarity}(d_i, d_j)$ is the cosine similarity between candidate $d_i$ and already selected item $d_j$.
- $\lambda \in [0, 1]$ is a tunable diversity dial. When $\lambda = 1$, the list is purely sorted by relevance; when $\lambda = 0.5$, diverse categories are actively prioritized.

## 6. Failure Modes and Resilience

**1. Ranking Cluster Overload or GPU Timeout (>30ms)**
- *Failure:* Under high traffic spikes, the heavy inference cluster p99 latency exceeds the 30ms budget.
- *User Impact:* Homepage requests would time out or hang, degrading the frontend experience.
- *Resilience:* The orchestrator wraps inference calls in a circuit breaker with a strict 25ms timeout. If the ranking cluster times out, the circuit opens and the orchestrator immediately falls back to candidate retrieval heuristic scores (cosine similarity from vector search), applying diversity filters and responding within budget.

**2. Online Feature Store (Redis) Partition or Outage**
- *Failure:* Redis memory pressure or network partition makes real-time user features inaccessible.
- *User Impact:* Missing dynamic features (e.g., recent clicks in the last 15 minutes).
- *Resilience:* Feature defaults and graceful imputation. The ranking model is trained with feature dropout (handling missing values via zero-imputation or global averages). If Redis fails, the system substitutes static user profile features from the local in-memory LRU cache or global medians, allowing ranking to proceed without crashing.

**3. Vector Database Shard Failure**
- *Failure:* A shard in the vector database cluster crashes, dropping candidate retrieval recall.
- *User Impact:* Retrieval returns fewer than 500 candidates.
- *Resilience:* Multi-source candidate generation. The orchestrator does not rely on vector search alone. It queries four independent candidate sources in parallel:
  - Vector ANN Search (300 candidates)
  - Collaborative Filtering Item-to-Item matrix cache (100 candidates)
  - Category Trending / Popularity cache (50 candidates)
  - Editorial / Sponsored pool (50 candidates)
  If the Vector DB fails completely, the other three sources provide 200 candidates to the ranker, ensuring the user always receives a valid feed.

**4. Feedback Loops & Catalog Starvation**
- *Failure:* The ranking model continuously boosts items that already have high impressions, creating a rich-get-richer loop where 1% of the catalog receives 99% of traffic while new or niche items are never shown.
- *Resilience:* Impression discounting and exploration bandits. Every impression without a click applies an exponential decay penalty to that item's score for that user. Additionally, 5% of all recommendation slots are reserved for randomized high-potential exploratory items to gather fresh interaction data.

**5. Four-Tier Graceful Degradation Hierarchy:**

```txt
┌─────────────────────────────────────────────────────────────────────────────┐
│ Tier 1 (Healthy, <40ms): Full Funnel                                        │
│ Two-Tower ANN Retrieval + Real-Time Feature Store + Heavy ML Ranker + MMR   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │ (Inference times out)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Tier 2 (Ranker Degraded, <20ms): Retrieval + Heuristic Rank                 │
│ Multi-Source Candidates + Vector Cosine Similarity Scoring + Business Rules │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │ (Vector DB / Feature Store down)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Tier 3 (Backend Degraded, <8ms): Precomputed Offline Feed                   │
│ Fetch precomputed user top-50 from Redis cache (generated in daily batch)   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │ (Redis cluster partition)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Tier 4 (Catastrophic Outage, <2ms): Static Global Fallback                  │
│ Static cached JSON of top trending items served directly from CDN / Edge    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 7. What Makes a Great Answer vs an Average One

**An average candidate:**
- Treats recommendation as a single black box or draws a single "Machine Learning Service" block without explaining how 10 million items are filtered in 50ms.
- Proposes running SQL queries like `SELECT * FROM items ORDER BY rating DESC` or computing dot products across all 10 million items on the live request path.
- Ignores the difference between offline model training, streaming near-line feature updates, and online low-latency inference.
- Misses the cold start problem and feedback loop traps, offering no strategy for new users, new items, or category diversity.
- Has no fallback plan for when GPU inference clusters exceed latency budgets.

**A great candidate:**
- Immediately breaks down the architecture into the **Two-Stage Funnel**: fast Candidate Retrieval (10M $\to$ 500) using Two-Tower vector search (HNSW) followed by Heavy Ranking (500 $\to$ 50) and Re-Ranking/Diversity (50 $\to$ 20).
- Clearly separates the **three time planes**: Offline (batch model training and item embedding generation), Near-line (Kafka + Flink streaming feature hydration in seconds), and Online (sub-50ms inference orchestration).
- Explains the role of **Feature Stores** (Feast over Redis and Parquet) to eliminate train-serve skew and guarantee sub-3ms point lookups.
- Demonstrates deep domain knowledge by detailing **Two-Tower Neural Networks**, **MMR diversity algorithms**, **cold-start exploration bandits**, and **impression discounting**.
- Defines a concrete **4-tier graceful degradation hierarchy** that ensures the frontend receives high-quality recommendations even when vector databases or inference clusters fail.

## 8. 🧠 The Memory Hook

Cast a wide net fast, score the catch deeply, arrange the plate for variety. You cannot cook a 5-star meal from 10 million ingredients in 50 milliseconds — retrieve 500 with vector search, score 50 with deep rankers, and serve 20 with diversity.
