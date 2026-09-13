# Designing High-Performance Search APIs: Faceted Filtering, Full-Text Inverted Indexes, and Query DSLs

## 1. Why This Exists — The Problem First

You launch an e-commerce catalog with a few thousand items. A simple SQL query powers your search bar:

```sql
SELECT * FROM products 
WHERE title ILIKE '%shoes%' OR description ILIKE '%running%';
```

In development with 200 products, this query returns in 4 milliseconds. Then your catalog grows to 1.5 million products, and thousands of concurrent shoppers hit the site during a promotion. 

Every single search query triggers a full table scan across gigabytes of unindexed string data. The database CPU hits 100%, disk I/O saturates, and search queries slow down to 3.8 seconds. If a shopper types "runing shoes" with a typo, the query returns zero rows. If someone searches for "lightweight running shoes", a product with the exact phrase "shoes for running that are lightweight" gets the exact same priority as a random pair of formal leather shoes that happens to have the word "running" buried in a footnote. 

When your frontend team adds a filtering sidebar showing live facet counts—like `Brand: Nike (45), Adidas (32), Puma (18)`—your backend has to run multiple heavy `COUNT(DISTINCT ...)` group-by queries across the entire filtered dataset on every keystroke, taking down the transactional database.

Search APIs exist to solve four fundamental problems that traditional relational CRUD APIs fail at: sub-50 millisecond text matching via inverted indexes, relevance-based ranking (BM25), fuzzy typo tolerance, and real-time multi-dimensional faceted aggregations without degrading primary transactional workloads.

## 2. The Analogy — Make It Obvious

Imagine walking into a massive central library containing 2 million books, searching for any book discussing "quantum computing".

The naive relational SQL `LIKE '%quantum%'` approach is like hiring a librarian who walks down every single aisle, opens Book 1, reads every single page from cover to cover to see if the word "quantum" is printed anywhere, closes it, and repeats that process for all 2 million books. It finds every match, but it takes three weeks and locks the librarian from helping anyone else.

Now imagine using the back-of-the-book index—an inverted index. At the back of the library catalog, there is an alphabetically sorted master dictionary of every unique word across all books:

- Under **C**, you find **"computing"** $\rightarrow$ pointing to `[Book #12, Book #42, Book #991]`
- Under **Q**, you find **"quantum"** $\rightarrow$ pointing to `[Book #42, Book #108, Book #550]`

To find books discussing "quantum computing", the librarian looks up those two words in the index, intersects their document lists to find `Book #42` in milliseconds, and checks how many times each word appears on the page to rank the best match at the top.

Faceted search is like pre-sorted color-coded index cards. While holding the matching books in hand, the librarian glances at their metadata tags and instantly tells you: "There are 3 books in Science, 1 in History, and 2 available in Hardcover"—without rescanning the library shelves.

## 3. How It Actually Works — The Full Explanation

**The Text Analysis Pipeline**

Before text can be searched efficiently, raw strings must pass through an analysis pipeline during document ingestion and at query time:

1. **Character Filtering**: Strips HTML tags, converts special symbols (e.g., `&` to `and`), or normalizes Unicode characters.
2. **Tokenization**: Splits continuous text into individual term tokens (e.g., `"High-performance running shoes!"` becomes `["High", "performance", "running", "shoes"]`).
3. **Token Filtering**:
   - **Lowercasing**: Converts all tokens to lowercase so queries are case-insensitive.
   - **Stop-word Removal**: Drops ultra-common, low-information words like "a", "the", "in", and "of" to save memory.
   - **Stemming / Lemmatization**: Reduces words to their linguistic root using algorithms like the Porter Stemmer. "Running", "runs", and "ran" all reduce to the root term `"run"`.
   - **Synonym Expansion**: Maps domain terms (e.g., "sneakers" $\rightarrow$ "shoes", "fast" $\rightarrow$ "speed").

**The Inverted Index Structure**

The output of the analysis pipeline is written into an Inverted Index. Instead of mapping `Document ID -> Content` (forward index), it maps `Term -> Posting List`:

```txt
Term       | Posting List (Doc IDs, Term Frequency [TF], Positions)
----------------------------------------------------------------------
"cushion"  | Doc #3 (TF: 1, pos: [4]), Doc #7 (TF: 2, pos: [1, 9])
"marathon" | Doc #1 (TF: 1, pos: [3]), Doc #3 (TF: 2, pos: [2, 8])
"run"      | Doc #1 (TF: 3, pos: [1, 5, 10]), Doc #3 (TF: 1, pos: [1])
"shoe"     | Doc #1 (TF: 2, pos: [2, 6]), Doc #7 (TF: 1, pos: [3])
```

When a user searches for `"marathon running shoes"`, the engine analyzes the query into `["marathon", "run", "shoe"]`, fetches the three posting lists, and calculates the union or intersection using bitsets or skip lists in memory.

**Relevance Scoring: BM25 (Best Matching 25)**

Search engines do not just find matching records; they rank them by relevance score. Modern engines (Elasticsearch, OpenSearch, Meilisearch) use **BM25**, an evolution of TF-IDF:

- **Term Frequency (TF)**: How often the search term appears in this specific document. The more times "marathon" appears, the more relevant the document is. However, BM25 uses an asymptotic curve: the 10th mention of a word gives much less additional boost than the 1st mention, preventing keyword stuffing.
- **Inverse Document Frequency (IDF)**: How rare the term is across the entire corpus of documents. If "shoes" appears in 90% of your products but "marathon" appears in only 1%, matches on "marathon" receive a much higher score multiplier.
- **Field-Length Normalization**: If "marathon" appears once in a 5-word product title, that document scores higher than a 500-word product description where "marathon" appears once by accident.

**Typo Tolerance and Fuzzy Matching**

Typo tolerance uses **Levenshtein Distance** (the minimum number of single-character insertions, deletions, substitutions, or transpositions required to transform one word into another).

For example, `"runing"` $\rightarrow$ `"running"` is an edit distance of 1 (one insertion). At search time, engines walk a **Finite State Transducer (FST)** dictionary in memory to find valid terms within a distance of 1 or 2 edits without evaluating every word in the dictionary.

**Faceted Filtering and Drill-Down Aggregations**

Faceted search allows users to explore search results across structured attributes (categories, brands, price ranges, ratings).

A search engine computes facets by taking the matched Document IDs from the inverted index and intersecting them with **Doc Values** (columnar data structures stored on disk for fast aggregations). This allows the engine to return both the paginated product records and the dynamic filter bucket counts in a single round-trip.

**Relational Database FTS vs. Dedicated Search Engines**

- **PostgreSQL Full-Text Search**: Uses `to_tsvector()` for document parsing, `to_tsquery()` for query parsing, and **GIN (Generalized Inverted Index)** for inverted index storage. It handles up to a few million rows reliably within your existing database, offering full ACID transactions and zero sync lag.
- **Dedicated Search Engines (Elasticsearch, OpenSearch, Meilisearch)**: Built on distributed Lucene or custom C++/Rust engines. They provide horizontal sharding, sub-10ms distributed aggregations, out-of-the-box typo tolerance, vector embeddings for hybrid search, and custom analyzer pipelines.

**Data Synchronization Strategies**

When using a dedicated search engine alongside a primary SQL or NoSQL database, you must synchronize data without corrupting state or losing writes:

1. **Dual-Write (Anti-Pattern)**: The application writes to PostgreSQL and Elasticsearch in the same request. If the Elasticsearch call fails or times out, the search index drifts out of sync with the primary database.
2. **Transactional Outbox + Async Worker**: The application saves the entity and an `outbox_events` record inside the same SQL transaction. A background poller or worker reads the outbox and indexes documents into search.
3. **Change Data Capture (CDC with Debezium & Kafka)**: A CDC connector tails the PostgreSQL Write-Ahead Log (WAL) or MySQL Binary Log. Every row insert, update, and delete is emitted to a Kafka topic and consumed by search indexers. This guarantees eventual consistency, decouples ingestion throughput, and eliminates dual-write bugs.

## 4. Real Code — See It Working

**Example 1: PostgreSQL Full-Text Search with GIN Index and Faceting**

This runnable PostgreSQL schema demonstrates how to set up generated `tsvector` columns, index them with GIN, rank results with `ts_rank`, and compute facet aggregations in one query.

```sql
-- 1. Create the products table with structured attributes and text
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    -- Generated tsvector column that automatically stays updated on writes
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED
);

-- 2. Create a GIN index on the precomputed tsvector column for fast lookups
CREATE INDEX idx_products_search_vector ON products USING GIN(search_vector);

-- 3. Create B-Tree indexes on filterable facet fields
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_price ON products(price);

-- 4. Seed sample data
INSERT INTO products (title, description, category, brand, price) VALUES
('Nike Air Zoom Pegasus', 'Responsive daily running shoes with breathable mesh', 'Footwear', 'Nike', 130.00),
('Nike Vaporfly Next', 'Elite marathon racing shoes engineered for maximum speed', 'Footwear', 'Nike', 250.00),
('Adidas Ultraboost Light', 'Comfortable running sneakers with energy-returning foam', 'Footwear', 'Adidas', 190.00),
('Puma Velocity Nitro', 'Lightweight daily road running shoes with nitrogen foam', 'Footwear', 'Puma', 120.00),
('Garmin Forerunner 265', 'GPS running smartwatch with training readiness metrics', 'Electronics', 'Garmin', 450.00);

-- 5. Search query: Match "running", filter by price, rank by relevance, and aggregate facets
WITH matched_items AS (
    SELECT 
        id, 
        title, 
        brand, 
        category, 
        price,
        ts_rank(search_vector, websearch_to_tsquery('english', 'running')) AS relevance_score
    FROM products
    WHERE search_vector @@ websearch_to_tsquery('english', 'running')
      AND price BETWEEN 100 AND 300
)
SELECT 
    (SELECT json_agg(items) FROM (
        SELECT id, title, brand, category, price, relevance_score
        FROM matched_items 
        ORDER BY relevance_score DESC 
        LIMIT 10 OFFSET 0
    ) items) AS search_results,
    (SELECT json_object_agg(brand, count) FROM (
        SELECT brand, count(*) AS count 
        FROM matched_items 
        GROUP BY brand
    ) brand_counts) AS brand_facets,
    (SELECT json_object_agg(category, count) FROM (
        SELECT category, count(*) AS count 
        FROM matched_items 
        GROUP BY category
    ) category_facets);
```

**Example 2: Node.js / Express Search API with Elasticsearch/OpenSearch Query DSL**

This Express handler implements a production Search API contract supporting free-text search, multi-faceted filtering, price ranges, BM25 ranking with typo fuzziness, and faceted aggregations.

```typescript
import express, { Request, Response } from 'express';
import { Client } from '@opensearchproject/opensearch';

const app = express();
app.use(express.json());

const searchClient = new Client({
  node: process.env.SEARCH_ENGINE_URL || 'http://localhost:9200',
});

interface SearchQueryParams {
  q?: string;
  category?: string;
  brand?: string;
  min_price?: string;
  max_price?: string;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest';
  page?: string;
  limit?: string;
}

app.get('/api/v1/products/search', async (req: Request<{}, {}, {}, SearchQueryParams>, res: Response) => {
  try {
    const {
      q = '',
      category,
      brand,
      min_price,
      max_price,
      sort = 'relevance',
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const from = (pageNum - 1) * pageSize;

    // Build OpenSearch / Elasticsearch Query DSL
    const mustClauses: any[] = [];
    const filterClauses: any[] = [];

    // 1. Full-text search clause with multi-match boosting and typo tolerance
    if (q.trim().length > 0) {
      mustClauses.push({
        multi_match: {
          query: q.trim(),
          fields: ['title^3', 'description^1', 'brand^2'], // Title matches score 3x higher
          fuzziness: 'AUTO',                                 // Enables Levenshtein distance for typos
          operator: 'and',
        },
      });
    } else {
      mustClauses.push({ match_all: {} });
    }

    // 2. Exact structured filters (Filter context: cached, does not affect score)
    if (category) {
      filterClauses.push({ term: { 'category.keyword': category } });
    }

    if (brand) {
      const brands = brand.split(',').map((b) => b.trim());
      filterClauses.push({ terms: { 'brand.keyword': brands } });
    }

    // 3. Numeric range filter
    if (min_price || max_price) {
      const range: { gte?: number; lte?: number } = {};
      if (min_price) range.gte = parseFloat(min_price);
      if (max_price) range.lte = parseFloat(max_price);
      filterClauses.push({ range: { price: range } });
    }

    // 4. Determine sort criteria
    let sortConfig: any[] = ['_score'];
    if (sort === 'price_asc') sortConfig = [{ price: { order: 'asc' } }];
    if (sort === 'price_desc') sortConfig = [{ price: { order: 'desc' } }];
    if (sort === 'newest') sortConfig = [{ created_at: { order: 'desc' } }];

    // 5. Execute search with multi-bucket aggregations
    const response = await searchClient.search({
      index: 'products',
      body: {
        from,
        size: pageSize,
        query: {
          bool: {
            must: mustClauses,
            filter: filterClauses,
          },
        },
        sort: sortConfig,
        highlight: {
          fields: {
            title: {},
            description: {},
          },
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
        },
        aggs: {
          brand_facets: {
            terms: { field: 'brand.keyword', size: 20 },
          },
          category_facets: {
            terms: { field: 'category.keyword', size: 20 },
          },
          price_stats: {
            stats: { field: 'price' },
          },
        },
      },
    });

    // 6. Format the client response contract
    const totalHits = typeof response.body.hits.total === 'number'
      ? response.body.hits.total
      : response.body.hits.total.value;

    const items = response.body.hits.hits.map((hit: any) => ({
      id: hit._id,
      ...hit._source,
      _score: hit._score,
      highlight: hit.highlight || {},
    }));

    const facets = {
      brands: response.body.aggregations.brand_facets.buckets.map((b: any) => ({
        value: b.key,
        count: b.doc_count,
      })),
      categories: response.body.aggregations.category_facets.buckets.map((b: any) => ({
        value: b.key,
        count: b.doc_count,
      })),
      price_range: {
        min: response.body.aggregations.price_stats.min,
        max: response.body.aggregations.price_stats.max,
        avg: response.body.aggregations.price_stats.avg,
      },
    };

    return res.status(200).json({
      success: true,
      data: {
        items,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total_items: totalHits,
          total_pages: Math.ceil(totalHits / pageSize),
        },
        facets,
      },
    });
  } catch (error) {
    console.error('Search query execution failed:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SEARCH_ENGINE_ERROR',
        message: 'Unable to complete search request.',
      },
    });
  }
});
```

**Example 3: Change Data Capture (CDC) Worker Ingesting into Search Index**

This worker consumes change events emitted by a database WAL connector (e.g., Debezium via Kafka) and keeps the search index synchronized without application-level dual-writes.

```typescript
import { Kafka } from 'kafkajs';
import { Client } from '@opensearchproject/opensearch';

const kafka = new Kafka({ clientId: 'search-sync-worker', brokers: ['localhost:9092'] });
const consumer = kafka.consumer({ groupId: 'search-indexer-group' });
const searchClient = new Client({ node: 'http://localhost:9200' });

interface CDCEvent {
  op: 'c' | 'u' | 'd'; // Create, Update, Delete
  before: any | null;
  after: any | null;
}

async function startCDCSyncWorker() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'dbserver1.public.products', fromBeginning: false });

  await consumer.run({
    eachBatchAutoResolve: true,
    eachBatch: async ({ batch }) => {
      const bulkOperations: any[] = [];

      for (const message of batch.messages) {
        if (!message.value) continue;
        const event: CDCEvent = JSON.parse(message.value.toString());

        if (event.op === 'c' || event.op === 'u') {
          // Upsert document into search index
          bulkOperations.push({
            index: { _index: 'products', _id: event.after.id.toString() },
          });
          bulkOperations.push({
            id: event.after.id,
            title: event.after.title,
            description: event.after.description,
            category: event.after.category,
            brand: event.after.brand,
            price: parseFloat(event.after.price),
            updated_at: new Date().toISOString(),
          });
        } else if (event.op === 'd') {
          // Delete document from search index
          bulkOperations.push({
            delete: { _index: 'products', _id: event.before.id.toString() },
          });
        }
      }

      if (bulkOperations.length > 0) {
        const bulkResponse = await searchClient.bulk({ body: bulkOperations });
        if (bulkResponse.body.errors) {
          console.error('Errors occurred during bulk index update');
        }
      }
    },
  });
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: When designing a Search API, should you use `GET` or `POST`?**

Search operations are safe and idempotent queries that retrieve data without mutating server state. Therefore, `GET` is the primary and standard HTTP method. Using `GET` allows browsers, CDNs, and API gateways to cache search results, and lets users copy, bookmark, or share the search URL (e.g., `/search?q=shoes&brand=Nike`).

However, for complex enterprise search engines (such as advanced analytics dashboards, legal document discovery, or multi-nested boolean filter builders), query parameter strings can exceed HTTP URL length limits (typically 2,048 to 8,192 characters). In those specific scenarios, exposing a `POST /api/v1/search` endpoint that accepts a structured JSON Query DSL payload is standard practice. The response headers should include `Cache-Control: private, no-cache` unless custom caching key mechanisms are implemented.

**Q: How does BM25 score relevance, and why is it superior to basic TF-IDF?**

Classic TF-IDF calculates score as $\text{TF} \times \text{IDF}$. The flaw is that Term Frequency (TF) scales linearly: a document that repeats the word "shoes" 100 times scores 100 times higher than a document that mentions it once, making search vulnerable to keyword stuffing.

BM25 solves this with two key improvements:
1. **Term Frequency Saturation**: It uses a curve with a configurable parameter $k_1$ (typically 1.2 to 2.0). As term frequency increases in a document, the score asymptotically approaches an upper limit. Mentioning a word 5 times gives a significant boost; mentioning it 500 times provides almost no extra gain.
2. **Document Length Normalization**: It uses a parameter $b$ (typically 0.75) that scales the score based on document length relative to the average document length across the entire index. A short title matching the keyword is scored significantly higher than a 5,000-word article mentioning the keyword once in passing.

**Q: How do dynamic faceted search aggregations work without scanning every document in the database?**

Faceted aggregations in search engines (like Elasticsearch or OpenSearch) do not run full table scans or SQL `GROUP BY` operations over raw row records. 

Instead, they use **Doc Values**—a columnar data structure built at index time and memory-mapped from disk. When a search query matches 5,000 document IDs out of 10 million total documents, the engine takes that compact bitset of 5,000 matching IDs and directly reads the columnar byte arrays for the requested facet fields (like `category` or `brand`). It increments in-memory count arrays per unique term ordinal in a single sequential memory pass, returning exact bucket counts in single-digit milliseconds.

**Q: How do you prevent data inconsistency between your primary SQL database and your search index?**

Never rely on application-level dual-writing where your backend writes to SQL and immediately attempts an HTTP write to Elasticsearch. Network hiccups, process crashes, or transaction rollbacks will cause silent data drift.

The production standard is **Change Data Capture (CDC)** using a tool like Debezium connected to the primary database's Write-Ahead Log (WAL) or binlog. The database is the single source of truth. The WAL stream guarantees that every committed transaction is captured and published to an ordered message queue (Kafka). Background consumer workers consume the events and perform idempotent bulk upserts/deletes against the search index. If search goes down, the Kafka consumer group offsets pause and resume without losing data.

**Q: Why is deep pagination using `OFFSET 50000` catastrophic in search engines, and what is the fix?**

In a distributed search cluster with 5 shards, if a client requests `page=5000` with `size=10` (equivalent to `OFFSET 50000 LIMIT 10`), each of the 5 shards must retrieve, score, and sort its top 50,010 documents in memory. All 5 shards send their 50,010 candidates (250,050 documents total) to the coordinator node. The coordinator node merges, sorts, and discards 250,040 documents just to return the 10 requested items. This causes massive memory spikes, garbage collection pauses, and cluster crashes.

The fix is **Cursor-Based Search** (using `search_after` in Elasticsearch/OpenSearch). Instead of an offset number, the client sends the sort values of the last document on the previous page (e.g., `{ "last_score": 4.12, "last_id": "doc_99182" }`). Shards use the Lucene index to seek directly to the exact point in the sorted index in $O(1)$ time, returning only 10 documents per shard without allocating memory for discarded offsets.

**Q: How do you implement search permissions and multi-tenancy securely without leaking data?**

Never filter search results in application code *after* querying the search engine. Post-filtering breaks pagination limits (a page of 20 requested items might return only 3 permitted items to the user) and leaks data through facet count aggregations.

Instead, enforce authorization at the query level by injecting tenant IDs and user permission role IDs directly into the search engine's **filter context** (e.g., `filter: [{ term: { tenant_id: user.tenantId } }, { terms: { read_roles: user.roles } }]`). Filter context queries are evaluated directly against the inverted index bitsets, cached automatically in memory, and applied before scoring and facet aggregations occur.

## 6. The Traps — What Goes Wrong

**1. The Dual-Write Index Drift Trap**

The most common architectural bug occurs when developers update a SQL database and then make a secondary HTTP call to Elasticsearch inside the same API request handler:

```typescript
// DANGEROUS PATTERN: Split-brain and drift guaranteed
await db.product.update({ where: { id }, data: updatePayload });
await searchClient.update({ index: 'products', id, body: { doc: updatePayload } });
```

If the search engine is undergoing a cluster rebalance, restarts, or experiences a network timeout, the database has the updated record while the search index holds stale data. If the database transaction rolls back after the search call succeeds, the search index now indexes phantom data that does not exist in the database.

**Fix**: Use the Transactional Outbox pattern or Change Data Capture (CDC). The application writes only to the database, and asynchronous log streaming syncs the search index.

**2. The Leading Wildcard Index Bypass Trap**

When users type a query, developers often format the search query with leading and trailing wildcards:

```json
{
  "query": {
    "wildcard": { "title": "*shoe*" }
  }
}
```

A standard inverted index stores terms sorted alphabetically from left to right. When a query starts with an asterisk `*shoe*`, the engine cannot binary-search the term dictionary. It is forced to perform a full linear scan across every single unique token in the cluster. Under high concurrency, this saturates CPU and causes cluster-wide timeouts.

**Fix**: Use an **Edge N-gram** or **N-gram** token filter during indexing. Words like `"shoes"` are pre-indexed as substrings `["s", "sh", "sho", "shoe", "shoes"]`, allowing prefix queries to resolve instantly via standard inverted index lookups.

**3. The Active Facet Isolation Trap (Over-Filtering Facets)**

When a user searches for `"shoes"` and selects the filter `Brand: Nike`, naive search queries apply the `Nike` filter to the entire search request, including the facet aggregation block.

As a result, the brand facet sidebar returns:
- `Nike (45)`
- (Adidas, Puma, and New Balance disappear completely from the sidebar).

The user can no longer see what other brands exist or switch their selection to `Adidas` without clearing their filter first.

**Fix**: Use **Post-Filtering** (or `global` / `filter` sub-aggregations). The aggregation runs against the search query matching `"shoes"` to calculate counts across *all* available brands, while the `post_filter` restricts only the returned search hits to `brand: Nike`.

**4. Returning 404 for Zero Search Results**

Some developers return HTTP `404 Not Found` when a valid query returns zero matching products.

This is semantically incorrect. A `404` status means the API endpoint itself does not exist or the routing failed. A search query that returns zero matches is a completely valid execution of business logic. Returning `404` triggers false-positive error alerts in monitoring dashboards and causes frontend HTTP client interceptors to treat empty search results as network crashes.

**Fix**: Always return HTTP `200 OK` with an empty array `items: []` and `total_items: 0`.

## 7. Compare With Related Concepts

| Feature / Property | Relational FTS (PostgreSQL GIN) | Dedicated Search (Elasticsearch / OpenSearch) | Vector Search (Embeddings / HNSW) |
| :--- | :--- | :--- | :--- |
| **Primary Data Structure** | GIN (Generalized Inverted Index) | Lucene Segment Inverted Index + Doc Values | HNSW (Hierarchical Navigable Small World) Graph |
| **Matching Style** | Lexical exact token stems (`tsquery`) | Lexical BM25 + Stemming + Fuzziness | Semantic similarity (Cosine / Dot Product) |
| **Typo Tolerance** | Requires `pg_trgm` similarity joins (slow on large sets) | Native FST Levenshtein distance (sub-5ms) | Inherent (typos map to nearby semantic vector spaces) |
| **Facet Aggregations** | SQL `GROUP BY` / CTEs (heavy CPU at scale) | Columnar Doc Values (ultra-fast bitset evaluation) | Requires hybrid metadata filtering |
| **Data Consistency** | Immediate ACID consistency | Eventual consistency (indexing refresh interval) | Eventual consistency (vector indexing cost) |
| **Infrastructure Overhead** | Zero extra infrastructure needed | Requires separate cluster, JVM tuning, and CDC pipeline | Requires embedding models, GPU/high RAM vector DB |
| **Best Used When** | Catalog < 3M rows, simple queries, unified transactional DB | Large catalogs, multi-facet filtering, complex ranking, high QPS | Semantic understanding ("warm jacket for winter rain"), multimodal search |

**Offset vs. Cursor-Based Pagination**

- **Offset Pagination (`OFFSET 100 LIMIT 20`)**: Easy to implement and supports jumping to an arbitrary page number. However, it scales at $O(N)$ because every shard must read and discard all preceding records. Use only for shallow administrative tables ($< 1,000$ rows).
- **Cursor / `search_after` Pagination**: Passes the sort keys of the last seen item. It runs in $O(1)$ memory and time because the engine seeks directly to the index position. Mandatory for deep scrolling and infinite feeds.

**Dual-Write vs. Change Data Capture (CDC)**

- **Dual-Write**: Easy to write initially, but guarantees data divergence during network failures, race conditions, or partial write errors.
- **Change Data Capture**: Uses database transaction logs as the single immutable event source. Guarantees eventual consistency and zero application write coupling at the cost of deploying a streaming connector (e.g., Debezium + Kafka).

## 8. 🧠 The Memory Hook

An inverted index is just the index at the back of a textbook: instead of reading 2 million pages to find a word, you look up the word once to get the exact page numbers in milliseconds. BM25 ranks by saturation, Doc Values power the filter checkboxes, and Change Data Capture keeps the index honest without dual-write drift.
