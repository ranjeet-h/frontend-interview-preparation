# 77. Design IoT System

[← Hard examples](index.md)

**Why interviewers ask** — Millions of constrained devices, bursty telemetry, edge processing, and time-series storage at scale.

**Core insight** — Devices are unreliable and bandwidth-poor; push intelligence to the edge, ingest via lightweight protocols, store time-series efficiently.

**Architecture**

```txt
Devices → MQTT broker cluster → stream processor → time-series DB (Influx/Timescale)
       → edge gateway (local rules, aggregation, offline buffer)
Device registry → provisioning, firmware OTA, certificate rotation
Alerting → threshold rules + anomaly detection on telemetry streams
```

- **Protocols** — MQTT for pub/sub telemetry; CoAP for constrained devices; LoRaWAN for long-range low-power.
- **Ingestion** — Partition topics by device type/region; backpressure when downstream slow.
- **Edge** — Filter, aggregate, and act locally; sync to cloud when connected.
- **Time-series DB** — Retention policies, downsampling old data, tag-based queries.

**Key decisions** — At-least-once delivery with device-side dedup; certificate-based device identity; OTA updates staged by cohort.

**Scale & failure** — MQTT broker clustering; device offline buffer with cap; command queue with TTL for actuation.

**Memory hook** — MQTT in, time-series down, edge thinks before the cloud does.
