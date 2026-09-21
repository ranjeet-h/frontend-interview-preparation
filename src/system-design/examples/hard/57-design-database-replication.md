# 57. Design Database Replication

[← Hard examples](index.md)

**Why interviewers ask** — Reads outgrow a single primary; they want failover, read scaling, and an honest answer about replication lag.

**Core insight** — Replication trades write latency and consistency for availability and read throughput; the replication mode (sync vs async) defines what users see after a write.

**Architecture**

```txt
Writes → Primary → replication stream (binlog/WAL) → Replica pool
Reads  → load balancer → replicas (or primary for read-your-writes)
Failover → health checks → promote replica → update DNS/proxy target
```

- **Master-slave** — Single write primary; async replicas serve reads; simple but failover requires promotion and brief write outage.
- **Master-master** — Multi-primary writes; needs conflict resolution (last-write-wins, vector clocks, or app-level merge).
- **Leaderless** — Quorum reads and writes (Dynamo-style); tunable consistency via R + W > N.
- **Semi-sync** — Ack after one replica persists; balances durability with latency.

**Key decisions** — Async replication for scale (accept stale reads) vs sync for financial data; route critical reads to primary; use replication lag metrics to shed stale replica traffic.

**Scale & failure** — Read replicas scale horizontally; split-brain on failover needs fencing (STONITH) or consensus-based leader election; replica lag can serve minutes-old data after bursts.

**Deep link** — [Strong vs eventual consistency](../../foundations/strong-vs-eventual-consistency.md) · [PACELC theorem](../../foundations/pacelc-theorem.md)

**Memory hook** — Primary writes, replicas read — lag is a feature you must name, not hide.
