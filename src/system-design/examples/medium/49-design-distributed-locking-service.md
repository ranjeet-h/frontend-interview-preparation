# 49. Design Distributed Locking Service

[← Medium examples](index.md)

**Why interviewers ask** — Mutual exclusion across processes: leader election, critical sections, and avoiding split-brain.

**Core insight** — A lock is a lease with expiry — holder must renew; fencing tokens prevent stale holder from writing.

**Architecture**

```txt
Client → SET key NX EX ttl (Redis) or ephemeral znode (ZooKeeper) or lease (etcd)
      → critical work
      → release (compare-and-delete Lua / version check)
Watchers → notify on lock release for election
```

- **Redis** — Fast; `SET NX EX` plus Lua unlock; risk if holder pauses past TTL.
- **ZooKeeper/etcd** — Consensus-backed; sequential nodes for fair queue; watches for failover.
- **Fencing** — Monotonic token passed to storage so late writer cannot commit.

**Key decisions** — Always set TTL (deadlock prevention); lock scope minimal; prefer etcd/ZK when correctness > speed.

**Scale & failure** — TTL expiry frees zombie locks; fencing prevents stale leader writes; network partition may split locks — design for minority partition unavailability.

**Memory hook** — Locks are leases with expiry; fencing beats stale leaders.
