# 51. Design Key-Value Store (Dynamo/Cassandra style)

[← Medium examples](index.md)

**Why interviewers ask** — Partitioning, replication, quorum reads/writes, and eventual consistency with anti-entropy — core NoSQL distributed storage.

**Core insight** — Consistent hashing places keys on ring; replicate to N nodes; R + W quorum trades consistency vs availability.

**Architecture**

```txt
Client → coordinator → consistent hash → replica nodes (RF=3)
                    → write: W acks, read: R acks
                    → gossip (membership, failure detection)
                    → hinted handoff + read repair + Merkle anti-entropy
```

- **Partitioning** — Hash ring with virtual nodes for even load.
- **Replication** — Preference list; write to N replicas; read from R of them.
- **Consistency** — Vector clocks resolve conflicts; quorum: R + W > RF for strong read-your-writes.
- **Repair** — Read repair on mismatch; background Merkle tree compare.

**Key decisions** — Tunable consistency per query; eventual default for availability; hinted handoff for temporary replica down.

**Scale & failure** — Add nodes with minimal key movement (virtual nodes); replica failure reduces W temporarily; network partition → stale reads unless quorum; gossip detects failures.

**Deep link** — [Cache layer](../../backend-designs/design-a-cache-layer.md) · [Foundation: consistent hashing](../../foundations/consistent-hashing.md)

**Memory hook** — Ring picks replicas, quorum picks freshness, gossip spreads failure news.
