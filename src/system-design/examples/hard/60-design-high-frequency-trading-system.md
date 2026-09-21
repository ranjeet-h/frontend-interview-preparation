# 60. Design High-Frequency Trading System

[← Hard examples](index.md)

**Why interviewers ask** — Extreme latency sensitivity separates engineers who understand hardware, kernel bypass, and failure modes from those who only know CRUD APIs.

**Core insight** — Every microsecond is a hop removed; the matching engine runs colocated with the exchange feed on bare metal with deterministic, garbage-free code paths.

**Architecture**

```txt
Market data feed (multicast) → in-memory order book → matching engine
Client orders → gateway → risk checks → matching engine → exchange ACK
                     ↓
              audit log (append-only) + compliance reporting (async)
```

- **Matching engine** — Price-time priority queue in memory; lock-free or single-threaded per instrument to avoid contention.
- **Market data** — Kernel bypass (DPDK), FPGA for feed normalization on the most latency-critical paths.
- **Risk** — Pre-trade checks (position limits, credit) on the hot path; kill switch halts trading in microseconds.
- **Persistence** — Async write-ahead log; recovery replays from last checkpoint.

**Key decisions** — C++/Rust over managed runtimes to avoid GC pauses; colocation in exchange data center; separate hot path from reporting path entirely.

**Scale & failure** — Active-passive hot standby with shared-nothing failover; clock sync (PTP) for ordering; regulatory audit trail must survive crashes without blocking trades.

**Memory hook** — Colocate, eliminate hops, never GC on the hot path.
