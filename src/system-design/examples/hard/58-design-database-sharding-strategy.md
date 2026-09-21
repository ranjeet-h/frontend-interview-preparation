# 58. Design Database Sharding Strategy

[← Hard examples](index.md)

**Why interviewers ask** — A single database hits CPU, storage, or connection limits; the shard key you pick determines pain for the next five years.

**Core insight** — Sharding partitions data across independent databases; a good shard key spreads load evenly and keeps most queries single-shard.

**Architecture**

```txt
Client → Router / proxy → shard map (consistent hash or directory)
                      → Shard 1 | Shard 2 | Shard N
Cross-shard queries → scatter-gather coordinator → merge results
Resharding → dual-write → backfill → cutover → retire old mapping
```

- **Hash-based** — `hash(tenant_id) % N` for even spread; resharding needs consistent hashing or virtual buckets.
- **Range-based** — Time or ID ranges; great for time-series, risky for hot latest range.
- **Directory-based** — Lookup table maps key → shard; flexible but lookup service is critical path.
- **Geo-sharding** — Partition by region for latency and compliance.

**Key decisions** — Avoid cross-shard joins in the hot path; colocate related entities (user + their orders); plan resharding before you need it.

**Scale & failure** — Hot shards need sub-sharding or key splitting; scatter-gather is slow and fragile; data migration during resharding uses dual-write with verification.

**Deep link** — [Vertical vs horizontal partitioning](../../foundations/vertical-vs-horizontal-partitioning.md) · [Consistent hashing](../../foundations/consistent-hashing.md)

**Memory hook** — Shard key is forever — even distribution beats clever joins.
