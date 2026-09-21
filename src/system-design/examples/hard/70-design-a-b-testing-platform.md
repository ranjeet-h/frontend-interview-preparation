# 70. Design A/B Testing Platform

[← Hard examples](index.md)

**Why interviewers ask** — Experiment assignment must be consistent, metrics trustworthy, and bad experiments stoppable — statistics meets production engineering.

**Core insight** — Deterministic bucketing assigns users to variants; event pipeline computes significance offline; guardrails catch harm before the p-value looks good.

**Architecture**

```txt
SDK / API → assignment service (hash(user_id + experiment_id) → variant)
         → exposure event → analytics pipeline
User actions → conversion events → metric aggregator
Analysis service → significance tests (t-test, chi-square) + confidence intervals
Dashboard → experiment status, early stopping, guardrail alerts
```

- **Assignment** — Sticky bucketing so user always sees same variant; stratify by segment if needed.
- **Metrics** — Primary (conversion) vs guardrail (latency, error rate, revenue); pre-register hypotheses.
- **Statistics** — Sequential testing or fixed horizon; correct for multiple comparisons; minimum sample size before peeking.
- **Lifecycle** — Draft → running → paused → concluded; feature flag integration for code deployment.

**Key decisions** — Hash bucketing over random per request; intent-to-treat analysis; kill switch on guardrail breach regardless of primary metric.

**Scale & failure** — Assignment is stateless and cacheable; event loss biases results — at-least-once with dedup keys; overlapping experiments need mutual exclusion groups.

**Deep link** — [Analytics dashboard backend](../../backend-designs/design-an-analytics-dashboard-backend.md)

**Memory hook** — Hash picks the variant, events prove the lift, guardrails kill the harm.
