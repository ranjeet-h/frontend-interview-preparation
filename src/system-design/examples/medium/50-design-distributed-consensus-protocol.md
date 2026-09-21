# 50. Design Distributed Consensus Protocol

[← Medium examples](index.md)

**Why interviewers ask** — Foundation for replicated logs (Raft/Paxos) — how replicas agree when nodes fail.

**Core insight** — Elect one leader; leader appends to replicated log; majority ack before commit — safety over liveness during partition.

**Architecture**

```txt
Followers ← heartbeat ← Leader → client writes as log entries
    ↓                      ↓
 replicate log → majority commit → apply to state machine
Leader election on timeout (randomized backoff)
```

- **Leader election** — Term numbers; vote for first candidate with up-to-date log.
- **Log replication** — Leader sends entries; followers ack; commit when majority stored.
- **Safety** — Committed entries never lost if majority survives; single leader per term.

**Key decisions** — Raft for understandability vs Paxos for theory; odd number of nodes (3 or 5); committed means durable, not just leader-local.

**Scale & failure** — Minority failure transparent; majority loss stops writes (CP); split-brain prevented by term + majority vote; leader crash triggers re-election in ~seconds.

**Memory hook** — Majority ack commits the entry; term number picks the real leader.
