# 13. Design Real-time Metrics System

[← Easy examples](index.md)

**Why interviewers ask:** Metrics differ from logs — numeric time series, high cardinality risk, aggregation windows, and dashboard queries. Interviewers expect Prometheus-style pull or push, downsampling, and alert evaluation.

**Core insight:** Collect numeric samples with timestamps, aggregate in rolling windows, store time-series efficiently, query recent data fast — cardinality control is as important as ingestion rate.

**Architecture**

```txt
Servers / apps → Metrics exporter (Prometheus scrape or push gateway)
              ↓
         Time-series DB (Prometheus / InfluxDB)
              ↓ recording rules (pre-aggregate)
         Grafana dashboards
              ↓
         Alertmanager (threshold + routing)
```

- **Collection:** Pull model scrapes `/metrics` endpoints on interval; push gateway for short-lived jobs — each sample is `(name, labels, value, timestamp)`.
- **Aggregation:** Recording rules compute rates, histogram quantiles, and rollups — dashboards query aggregates, not raw billions of points.
- **Time-series storage:** Prometheus local TSDB or Influx — optimized append-only blocks per metric series.
- **Query layer:** PromQL / Flux for range queries — p99 latency, error rate over 5m windows.
- **Visualization:** Grafana dashboards per service SLO; drill from alert to graph to logs via shared labels.

**Key decisions**

- **Pull vs push:** Pull simplifies service discovery and avoids unauthenticated push floods; push needed for batch jobs and edge devices.
- **Cardinality limits:** Unbounded label values (user_id on every metric) explode storage — cap labels to service, endpoint, status code.
- **Retention vs cost:** Raw 15s resolution for days, downsampled 5m for months — balances incident debug vs disk.

**Scale & failure:** Cardinality explosion or slow queries on unaggregated high-volume metrics break storage and dashboards first. Mitigation: label discipline, recording rules, and federation for multi-cluster views.

**Deep link:** [Design an analytics dashboard backend](../../backend-designs/design-an-analytics-dashboard-backend.md)

**Memory hook:** Metrics are heartbeat samples on a timeline — scrape often, label lightly, aggregate before the dashboard asks hard questions.
