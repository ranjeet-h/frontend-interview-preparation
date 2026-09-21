# 59. Design Real-time Analytics Platform

[← Hard examples](index.md)

**Why interviewers ask** — Product teams want dashboards that update in seconds while the event firehose runs at millions of events per second.

**Core insight** — Separate the write path (append-only stream ingestion) from the read path (pre-aggregated OLAP slices); never scan raw events at query time.

**Architecture**

```txt
Producers → Kafka (partitioned by event type / tenant)
         → Stream processor (Flink / Spark Streaming) → rollups
         → OLAP store (ClickHouse / Druid) + materialized views
Query API → dashboards (Grafana) + ad-hoc SQL with time + dimension filters
```

- **Ingestion** — Schema registry, validation, dead-letter queue for bad events.
- **Stream processing** — Sliding/tumbling windows for counts, sums, percentiles; watermarks handle late events.
- **Storage** — Columnar format, partition by date, sort key matches common filters.
- **Serving** — Precompute hot metrics; cache dashboard queries in Redis.

**Key decisions** — At-least-once ingestion with idempotent aggregations; lambda architecture (batch + speed layer) only if you need historical correction; dimension cardinality limits what you pre-aggregate.

**Scale & failure** — Kafka partitions scale ingest; processor backpressure sheds or samples non-critical events; OLAP replicas for query QPS; late data triggers recomputation windows.

**Deep link** — [Analytics dashboard backend](../../backend-designs/design-an-analytics-dashboard-backend.md) · [Apache Kafka](../../foundations/apache-kafka.md)

**Memory hook** — Stream to aggregate, OLAP to query — never grep the firehose at read time.
