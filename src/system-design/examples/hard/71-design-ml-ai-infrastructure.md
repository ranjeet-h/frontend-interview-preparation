# 71. Design ML/AI Infrastructure

[← Hard examples](index.md)

**Why interviewers ask** — ML is not just a model file; they want the full lifecycle: data pipelines, training at scale, serving with low latency, and monitoring for drift.

**Core insight** — Separate offline training (batch, GPU clusters, experiment tracking) from online inference (low-latency, versioned, monitored) with a feature store bridging both.

**Architecture**

```txt
Data sources → ingestion + validation → feature store (online + offline)
              → training pipeline (distributed GPUs) → model registry
Inference API → model server (batching, GPU pool) → A/B shadow traffic
Monitoring → drift detection, latency, prediction distribution alerts
```

- **Data pipeline** — Versioned datasets, schema validation, feature engineering jobs (Airflow/Spark).
- **Training** — Distributed training, hyperparameter search, experiment tracking (MLflow).
- **Serving** — Model versioning, canary deploy, batching for GPU utilization.
- **Monitoring** — Data drift, concept drift, performance degradation triggers retrain.

**Key decisions** — Feature store ensures train-serve consistency; batch inference for offline vs real-time API for online; model registry gates promotion.

**Scale & failure** — GPU autoscaling on queue depth; fallback to previous model version on error rate spike; training job checkpointing for spot instance preemption.

**Deep link** — [Recommendation backend](../../backend-designs/design-a-recommendation-backend.md)

**Memory hook** — Features feed training, registry gates serving, monitors trigger retrain.
