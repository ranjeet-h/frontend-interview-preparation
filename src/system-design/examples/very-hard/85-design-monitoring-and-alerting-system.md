# 85. Design Monitoring & Alerting System

[← Very Hard examples](index.md)

**Why interviewers ask** — Operators need signal not noise at scale. Interviewers expect ingestion pipelines, cardinality control, alert routing, and on-call workflows that move from metric to action.

**Core insight** — Separate collection, storage, query, visualization, and alerting; treat retention and label cardinality as first-class inputs; alerts tie to runbooks and symptoms (SLO breach), not raw CPU spikes.

**Architecture**

```txt
Apps/infra → exporters (metrics / logs / traces) → ingestion gateway
                                            → TSDB (Prometheus / Influx)
                                            → recording rules / aggregations
         Grafana dashboards ← query API
         Alertmanager ← rule engine (threshold + anomaly)
                      → on-call routing (PagerDuty) → escalation → incident tracker
```

- **Metrics collection** — Pull scrapes or push gateway; standardized labels (service, env); RED/USE framework per service.
- **Storage** — Time-series append-only blocks; retention tiers (raw 15d, downsampled 1y); federation for multi-cluster views.
- **Alerting** — Threshold (error rate > 1%) and anomaly detection; alert grouping to reduce pages; severity and ownership labels.
- **Visualization** — Dashboards per SLO; drill alert → metric → trace → log via shared correlation IDs.
- **On-call** — Rotation schedules, escalation policies, incident lifecycle (ack → resolve → postmortem).

**Key decisions** — Pull vs push collection tradeoffs; cardinality limits (never `user_id` as a metric label); alert on user-visible symptoms where possible, not infrastructure noise.

**Scale & failure** — Cardinality explosion, alert fatigue from noisy rules, and ingestion lag hiding incidents break observability first. Mitigation: label allowlists, SLO burn-rate alerts, HA ingest with remote-write buffering.

**Deep link** — [Design an analytics dashboard backend](../../backend-designs/design-an-analytics-dashboard-backend.md) · [Real-time metrics system](../easy/13-design-real-time-metrics-system.md)

**Memory hook** — Collect cheaply, label lightly, alert on user pain, route to a human with a runbook.
