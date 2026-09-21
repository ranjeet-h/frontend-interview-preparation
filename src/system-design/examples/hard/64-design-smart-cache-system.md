# 64. Design Smart Cache System

[← Hard examples](index.md)

**Why interviewers ask** — Caching is easy to add and hard to do well; they want eviction policy, prediction, and multi-tier reasoning beyond "put Redis in front."

**Core insight** — A smart cache predicts what will be hot next and places it before the miss — combining admission, eviction, and tier placement beats a single LRU.

**Architecture**

```txt
Client → L1 (in-process) → L2 (Redis cluster) → L3 (CDN / edge)
                      ↓ miss
                   Origin DB / API
Prediction service ← access logs + ML features → prefetch queue
```

- **Admission** — Bloom filter or ML classifier rejects one-hit wonders before they pollute cache.
- **Eviction** — ARC balances recency and frequency; LFU for skewed Zipf workloads.
- **Prefetch** — Lookahead on session patterns (cart → checkout items); async warm on publish events.
- **Invalidation** — TTL + pub/sub on writes; versioned keys for gradual rollout.

**Key decisions** — Multi-tier: hot in-process, shared in Redis, static at CDN; separate cache namespaces per tenant; stampede protection with request coalescing.

**Scale & failure** — Redis cluster shards by key; cache miss storm on expiry — use jittered TTLs; stale reads OK for many workloads — document max staleness.

**Deep link** — [Cache layer](../../backend-designs/design-a-cache-layer.md)

**Memory hook** — Admit wisely, evict smartly, prefetch before the miss hurts.
