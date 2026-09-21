# 76. Design Data Warehouse

[← Hard examples](index.md)

**Why interviewers ask** — OLAP at petabyte scale: batch + streaming ingest, columnar storage, and cost-aware query planning.

**Core insight** — Warehouse optimizes for analytical scans, not OLTP row lookups; ETL/ELT transforms raw events into dimensional models analysts can query.

**Architecture**

```txt
Sources → CDC / batch extract → staging (S3) → ELT (dbt/Spark)
         → columnar warehouse (Snowflake/BigQuery/Redshift)
         → BI tools (Tableau/Looker) + ad-hoc SQL
Query engine → partition pruning, materialized views, result cache
```

- **Ingestion** — Batch (nightly Airflow) + streaming (Kafka → Flink) for near-real-time marts.
- **Modeling** — Star/snowflake schema; fact tables for events, dimension tables for entities.
- **Storage** — Columnar, compressed, partitioned by date; sort keys match filter columns.
- **Query optimization** — MPP execution, spill to disk, workload management queues.

**Key decisions** — ELT (load raw, transform in warehouse) vs ETL; separate dev/prod warehouses; cost alerts on scan volume.

**Scale & failure** — Auto-suspend idle clusters; materialized views for hot dashboards; backfill jobs idempotent for reprocessing.

**Deep link** — [Analytics dashboard backend](../../backend-designs/design-an-analytics-dashboard-backend.md)

**Memory hook** — Land raw, model stars, scan columns — partitions are your best index.
