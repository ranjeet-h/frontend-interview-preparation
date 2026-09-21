# 6. Design Distributed Cache

[← Easy examples](index.md)

**Why interviewers ask:** Every scaled system adds a cache. This problem isolates cache-specific design — sharding, eviction, TTL, replication — and forces you to state what the source of truth is and what happens on miss or node death.

**Core insight:** Cache is disposable acceleration — shard in-memory data across nodes, evict with LRU/LFU under memory pressure, replicate hot entries only if needed, and always define invalidation.

**Architecture**

```txt
App → Cache client (consistent hash → node)
              ↓
         Cache cluster (in-memory hash tables per node)
              ↓ miss
         Source of truth (DB / service)
              ↓ optional
         Replica peer (for hot key redundancy within cluster)
```

- **In-memory store:** Hash table per node; sub-millisecond get/put; no persistence — restart means cold cache.
- **Consistent hashing:** Keys map to nodes; virtual nodes smooth distribution when cluster size changes.
- **Eviction policy:** LRU or LFU when memory cap hit — track access frequency or recency per entry.
- **TTL support:** Per-key expiry for session data, rate-limit windows, or auto-refreshing entries without manual delete.
- **Cluster communication:** Health checks, failover hints, optional replication of hot entries to a secondary node.

**Key decisions**

- **Cache aside vs read-through:** Cache-aside (app loads on miss) is most common — simple failure modes; read-through centralizes logic but couples cache to DB latency.
- **Replication inside cache:** Optional for hot keys — adds memory cost; often prefer larger cluster + client retry on miss instead.
- **LRU vs LFU:** LRU for general workloads; LFU when a few keys dominate traffic and you want to protect them from one-off scans evicting hot data.

**Scale & failure:** Single hot key on one shard node — memory and CPU on that node break first. Mitigation: local secondary cache in app, key replication, or splitting hot key into sub-keys.

**Deep link:** [Design a cache layer](../../backend-designs/design-a-cache-layer.md)

**Memory hook:** Cache is a scratch pad, not the notebook — fast, losable, hash the key to the right desk, evict when the desk is full.
