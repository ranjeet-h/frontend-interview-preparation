# 7. Design Distributed Job Scheduler

[← Easy examples](index.md)

**Why interviewers ask:** Cron at scale needs durable schedules, exactly-once-ish execution, worker coordination, and retries. Interviewers test leader election, idempotent workers, and how you avoid duplicate runs after crashes.

**Core insight:** Persist every schedule and run state; one active scheduler dispatches work to a queue; workers claim jobs with leases; retries and heartbeats recover from partial failure.

**Architecture**

```txt
Scheduler service (leader via election) → reads job definitions + cron
              ↓ enqueue
         Task queue (Kafka / SQS)
              ↓ claim with lease
         Worker pool (idempotent handlers)
              ↓ heartbeat + status
         State DB (job id, run id, status, next_run_at)
```

- **Scheduler service:** Computes next fire time from cron/interval; only the elected leader dispatches — avoids duplicate enqueue from multiple schedulers.
- **Task queue:** Buffers jobs between schedule tick and execution; absorbs burst; supports visibility timeout for retries.
- **Worker pool:** Pulls jobs, executes business logic, reports success/failure; must be idempotent — at-least-once delivery implies duplicates possible.
- **State database:** Tracks definitions, last run, next run, attempt count — source of truth for observability and recovery.
- **Heartbeat mechanism:** Workers extend lease while running; expired lease allows another worker to reclaim stuck jobs.

**Key decisions**

- **DB polling vs queue-driven:** Queue-driven scales better — scheduler only enqueues; workers scale horizontally without polling a central table.
- **At-least-once + idempotency vs distributed locks:** Prefer idempotent workers with dedupe keys — locks add coordination pain and deadlock risk.
- **Leader election:** Required if multiple scheduler instances — etcd/ZooKeeper or cloud leader lease; single dispatcher invariant.

**Scale & failure:** Queue backlog or poison jobs stall worker throughput first. Mitigation: dead-letter queue, per-job retry caps with backoff, and isolated worker pools for heavy vs light jobs.

**Deep link:** [Design a background job system](../../backend-designs/design-a-background-job-system.md)

**Memory hook:** Scheduler is an alarm clock with a ledger — one leader sets the alarm, queue holds the to-do, workers do the task twice-safe with idempotency keys.
