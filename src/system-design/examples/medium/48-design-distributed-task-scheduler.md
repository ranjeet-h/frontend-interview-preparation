# 48. Design Distributed Task Scheduler

[← Medium examples](index.md)

**Why interviewers ask** — Cron at scale: trigger jobs on time, distribute to workers, handle failures without duplicate side effects.

**Core insight** — Scheduler owns when; queue owns delivery; workers own execution — idempotency prevents duplicate runs.

**Architecture**

```txt
Scheduler (time wheel / priority queue) → task queue (Kafka/SQS)
                                     → worker pool → execute + report status
                                     → state DB (pending/running/succeeded/failed)
                                     → execution history + retry policy
```

- **Scheduler** — Leader-elected; scan due tasks; push to queue with visibility timeout.
- **Workers** — Pull tasks; heartbeat; at-least-once delivery means idempotent handlers.
- **Dependencies** — DAG scheduler for job chains; skip downstream on parent failure.

**Key decisions** — At-least-once + idempotency, not exactly-once magic; lease/timeout requeues stuck jobs; separate queues by priority.

**Scale & failure** — Scheduler failover via leader election; poison messages to DLQ; backpressure when workers saturated; clock skew handled with NTP and grace windows.

**Deep link** — [Background job system](../../backend-designs/design-a-background-job-system.md)

**Memory hook** — Scheduler rings the bell, queue holds the ticket, workers need idempotent hands.
