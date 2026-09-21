# 42. Design Google Search

[← Medium examples](index.md)

**Why interviewers ask** — The full search stack: crawl, index, rank, query — tests understanding of inverted indexes and scale.

**Core insight** — Offline batch builds the index; online path is milliseconds of index lookup plus ranking — crawl never blocks query.

**Architecture**

```txt
Crawler → URL frontier → fetch → parse → index builders (MapReduce)
Query   → query parser (spell, expand) → retrieve from inverted index → rank (PageRank + relevance)
       → snippet generation → results page
```

- **Crawler** — Distributed frontier; politeness per domain; dedup via bloom filter.
- **Index** — Inverted index: term → posting list of (doc, positions); sharded by term.
- **Ranking** — Static scores (PageRank) plus query-dependent signals (BM25, clicks).
- **Serving** — Replicated index shards; query fanout to shards then merge top-K.

**Key decisions** — Batch index rebuild plus incremental updates; spelling correction before retrieval; freshness vs quality tradeoff for news queries.

**Scale & failure** — Billions of docs sharded across clusters; crawler respects robots.txt; index replica failover; stale index better than down.

**Deep link** — [Search autocomplete](../../backend-designs/design-a-search-autocomplete-system.md)

**Memory hook** — Crawl offline, index inverted, query online in milliseconds.
