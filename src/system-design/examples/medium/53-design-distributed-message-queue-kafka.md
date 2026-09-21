# 53. Design Distributed Message Queue (Kafka)

[← Medium examples](index.md)

**Why interviewers ask** — Durable ordered logs, consumer groups, partitioning — backbone of modern event-driven systems.

**Core insight** — Log is the abstraction: producers append to partitions; consumers track offset; ordering guaranteed per partition only.

**Architecture**

```txt
Producer → partition (by key or round-robin) → broker leaders + followers
Consumer group → each partition consumed by one member → commit offset
ZooKeeper/KRaft → controller, leader election, metadata
```

- **Topics** — Split into partitions for parallelism; key hash keeps related events ordered.
- **Replication** — Leader serves reads/writes; ISR followers replicate; acks=all for durability.
- **Consumer groups** — Rebalance on member join/leave; at-least-once by default.

**Key decisions** — Partition count sets max consumer parallelism; retention by time/size; idempotent producer + transactional writes for exactly-once semantics when needed.

**Scale & failure** — Broker failure elects new partition leader from ISR; consumer lag alerts backlog; disk-bound — sequential write is the performance win.

**Deep link** — [Foundation: Apache Kafka](../../foundations/apache-kafka.md)

**Memory hook** — Append-only log, order inside partition, consumer offset is the bookmark.
