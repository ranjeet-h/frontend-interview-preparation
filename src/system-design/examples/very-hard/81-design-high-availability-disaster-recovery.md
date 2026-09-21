# 81. Design High-Availability Disaster Recovery

[← Very Hard examples](index.md)

**Why interviewers ask** — Region outages, bad deploys, and ransomware are inevitable. Interviewers test whether you translate business SLAs into concrete RPO/RTO targets and pick backup, replication, or multi-region strategies that actually meet them.

**Core insight** — DR is not "more backups" — define how much data loss (RPO) and downtime (RTO) the business accepts, then build standby capacity and automated failover to hit those numbers; untested plans are fiction.

**Architecture**

```txt
Primary region (active) → sync/async replication → standby (warm/hot)
Periodic snapshots → immutable object storage (cross-region, encrypted)
Health monitor → failover controller → DNS/global LB shift → promote replica
Quarterly game days: restore drill → measure actual RPO/RTO achieved
```

- **RPO** — Max acceptable data loss window; drives backup frequency and replication mode (sync ≈ zero loss, async = bounded lag).
- **RTO** — Max acceptable outage; drives hot standby vs cold restore (minutes vs hours).
- **Backup & recovery** — Full/incremental snapshots to durable storage; versioned; restore tested on schedule.
- **Replication** — Streaming replica in same or cross-region; automatic failover with leader election and fencing.
- **Multi-region** — Active-active or active-passive; global traffic routing; survive full region failure.

**Key decisions** — Sync replication for tight RPO on money data; async for cost/latency tradeoff; hot standby for low RTO; backups alone only when hours of downtime are acceptable.

**Scale & failure** — Split-brain during failover, replication lag exceeding RPO, and restore drills that fail in production break DR first. Mitigation: quorum fencing, lag alerts with write freeze, mandatory game days.

**Memory hook** — RPO is how much history you can lose; RTO is how long the lights stay off; rehearsals prove the plan is real.
