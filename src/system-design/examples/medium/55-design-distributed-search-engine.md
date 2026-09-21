# 55. Design Distributed Search Engine

[← Medium examples](index.md)

**Why interviewers ask** — End-to-end search: crawl, index, rank, serve — distributed index shards and query merge.

**Core insight** — Build inverted index offline at scale; online query fans out to shard holders, merges top results, reranks globally.

**Architecture**

```txt
Crawler → document store → index builders (MapReduce/Spark) → shard servers
Query node → parse → fanout to shards → local top-K → global merge + rank
         → spell check, query expansion, snippet highlight
```

- **Indexing** — Term → postings list; compress postings; incremental segment merge.
- **Sharding** — By term range or document ID; each shard holds slice of index.
- **Ranking** — Two-phase: cheap retrieval then ML rerank on top candidates.
- **Freshness** — Near-real-time segment for recent docs plus main index.

**Key decisions** — Batch vs incremental index; replicated shards for QPS; caching for head queries.

**Scale & failure** — Shard replica failover; slow shard timeout with partial results; index lag acceptable for non-news; query cache for popular terms.

**Deep link** — [Search autocomplete](../../backend-designs/design-a-search-autocomplete-system.md)

**Memory hook** — Shards answer locally, merger picks global winners.
