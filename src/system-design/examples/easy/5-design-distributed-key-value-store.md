# 5. Design Distributed Key-Value Store

[← Easy examples](index.md)

**Why interviewers ask:** This is the infrastructure layer under caches, metadata stores, and coordination services. Interviewers want partitioning, replication, consistency levels, and recovery without pretending you need full linearizability everywhere.

**Core insight:** Partition keys across nodes with consistent hashing, replicate each partition for fault tolerance, accept eventual consistency on reads unless the client asks for stronger guarantees.

**Architecture**

```txt
Client → Routing layer (partition key → responsible nodes)
              ↓
         Replica set (typically 3 nodes per partition)
              ↓ read/write
         Local storage (LSM / B-tree per node)
              ↓ background
         Gossip (membership) + read repair + Merkle anti-entropy
```

- **Routing layer:** Maps key to partition via consistent hashing; clients or a proxy know which nodes own a key range; rebalancing when nodes join/leave.
- **Partition storage:** Each node stores a slice of keys; get/put target one primary + replicas; O(1) expected latency per key locally.
- **Replication:** Write to N replicas (e.g. 3); read from any replica with optional quorum (R + W > N for strong read-your-writes variants).
- **Gossip protocol:** Nodes exchange membership and health — no single coordinator required for liveness discovery.
- **Anti-entropy:** Merkle trees compare replica digests; read repair fixes divergence on access; full sync heals offline nodes.

**Key decisions**

- **Consistent hashing vs range partitioning:** Consistent hashing minimizes key movement on node add/remove; range partitioning helps range scans but hot ranges hurt.
- **Eventual vs quorum consistency:** Eventual default for speed; quorum reads/writes when application needs fewer stale reads — PACELC: latency vs consistency under partition.
- **Replication factor 3:** Industry default — survives one failure with reads still available; RF=2 is cheaper but fragile during simultaneous failures.

**Scale & failure:** Hot keys on one partition node saturate first. Mitigation: key splitting, local caching on clients, or dedicated hot-key replication layers.

**Memory hook:** KV store is a ring of filing cabinets — hash picks the cabinet, three copies of each file, gossip is how cabinets learn who is still standing.
