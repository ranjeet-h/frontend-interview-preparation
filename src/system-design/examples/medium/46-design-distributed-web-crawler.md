# 46. Design Distributed Web Crawler

[← Medium examples](index.md)

**Why interviewers ask** — Tests distributed work queues, deduplication, politeness, and scale to billions of pages without traps or duplicates.

**Core insight** — Crawling is a pipeline: frontier schedules URLs, fetchers download, parsers extract links back to frontier — dedup and politeness are first-class.

**Architecture**

```txt
URL frontier (priority queue) → fetcher pool → parser → link extractor
       ↑                                              ↓
       └──────── duplicate filter (Bloom + exact) ← storage (HDFS/S3)
```

- **Frontier** — Priority by freshness, PageRank estimate; per-domain rate limits.
- **Fetcher** — HTTP client with timeouts, redirects, robots.txt check.
- **Dedup** — Bloom filter for fast probably-seen; exact store for confirmation.
- **Storage** — Raw HTML and extracted metadata to distributed object store.

**Key decisions** — Politeness delay per domain; never crawl infinite URL traps (calendar, session IDs); distributed frontier with lease-based work stealing.

**Scale & failure** — Horizontal fetchers; frontier backpressure when storage lags; robots.txt cached; failed fetches retry with cap; trap detection via URL pattern heuristics.

**Memory hook** — Frontier schedules, fetcher obeys robots, Bloom stops déjà vu.
