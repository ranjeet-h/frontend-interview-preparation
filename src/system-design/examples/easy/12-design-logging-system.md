# 12. Design Logging System

[← Easy examples](index.md)

**Why interviewers ask:** Operators need to search logs across thousands of instances. This tests ingestion throughput, indexing strategy, retention tiers, and query latency — the ELK-shaped pipeline interviewers know well.

**Core insight:** Separate ingest (high volume, loss-tolerant with buffering), storage (time-series friendly, indexed by timestamp + keywords), and query UI — retention and cardinality are design inputs, not afterthoughts.

**Architecture**

```txt
App instances → Log agent (Filebeat / Fluentd)
              ↓
         Logstash / ingest pipeline (parse, enrich)
              ↓
         Elasticsearch cluster (indexed log documents)
              ↓
         Kibana / Grafana (search, dashboards)
              ↓ optional
         Alerting rules → on-call
```

- **Collection agents:** Tail files or receive syslog on each host; batch and compress before ship — avoid per-line HTTP from app threads.
- **Ingest pipeline:** Parse JSON/logfmt, extract fields (service, trace_id, level), drop noisy debug in prod if needed.
- **Elasticsearch:** Stores inverted indexes for full-text search; shard by time index (daily) for easy retention drops.
- **Query layer:** Kibana for ad-hoc search; structured queries on `trace_id` for request debugging.
- **Alerting:** Threshold or anomaly on error rate — links log signal to paging.

**Key decisions**

- **Elasticsearch vs columnar (ClickHouse):** ES wins interactive search; columnar wins cheap analytics at petabyte scale — many teams use both.
- **Retention tiers:** Hot 7d on fast disks, warm 30d, cold archive to S3 — cost control is mandatory at volume.
- **Structured vs raw logs:** JSON logs with trace ids — pays off in search speed vs grep-ing unstructured blobs.

**Scale & failure:** Ingest burst during incidents overwhelms indexing throughput first. Mitigation: buffering queue (Kafka), dynamic shard scaling, and sampling for debug-level floods while preserving errors.

**Deep link:** [Design a logging system](../../backend-designs/design-a-logging-system.md)

**Memory hook:** Logs are a firehose into a searchable lake — agents collect, pipeline shapes, index makes grep instant, TTL deletes old water.
