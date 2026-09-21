# 16. Design Search Autocomplete

[← Easy examples](index.md)

**Why interviewers ask:** Autocomplete is prefix search under strict latency (sub-100ms) with frequency ranking and typo tolerance. Interviewers expect trie or prefix index, caching top queries, and batch vs real-time index updates.

**Core insight:** Precompute prefix → top suggestions offline or incrementally; serve reads from memory/cache; accept slightly stale popularity counts for speed.

**Architecture**

```txt
User typing → Autocomplete API (prefix + limit)
              ↓
         Redis (top prefixes → suggestion list)
              ↓ miss
         Trie / prefix index in memory per shard
              ↓ fallback
         Elasticsearch prefix query
              ↓ background
         Batch job updates frequencies from search logs
```

- **Trie data structure:** Nodes per character; leaf lists hold top-k terms per prefix — fast prefix walk.
- **Frequency data:** Counts from query logs drive ranking — "ap" → apple beats aperture if apple searched more.
- **Redis cache:** Hot prefixes (e.g. first 2 chars) map to serialized top-10 lists — absorbs majority traffic.
- **Elasticsearch fallback:** Handles typos (fuzzy) and rare prefixes trie does not cover — higher latency path.
- **Update pipeline:** Nightly batch rebuild or streaming counter increments — trade freshness vs write amplification on trie.

**Key decisions**

- **Real-time vs batch index updates:** Batch is simpler and stable for ranking; streaming counters + periodic trie merge for fresher trends.
- **Trie in memory vs ES only:** Memory trie for p99 latency; ES alone often misses <100ms at scale without dedicated prefix indexes.
- **Personalization:** Optional second rank signal (user history) — keep default global trie for cold users.

**Scale & failure:** Memory per trie shard or ES cluster load on rare long prefixes breaks latency first. Mitigation: max prefix length for trie, shard by first character, and aggressive Redis caching for head prefixes.

**Deep link:** [Design a search autocomplete system](../../backend-designs/design-a-search-autocomplete-system.md)

**Memory hook:** Autocomplete is a pre-read mind — trie stores "if they typed this far, they probably want that," cache the first two letters hardest.
