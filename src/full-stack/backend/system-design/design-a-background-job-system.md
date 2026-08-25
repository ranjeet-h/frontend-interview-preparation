# Design a Distributed Background Job System (Sidekiq / Celery / BullMQ)

## 1. Understand the Problem First — Clarify Before Designing

Imagine your e-commerce API server receiving a checkout request. Inside the HTTP request-response cycle, the handler needs to charge the credit card, generate a 20-page PDF tax invoice, resize three high-resolution product photos, sync the customer record with a third-party CRM, and send a confirmation email. If you run all of that synchronously, the HTTP request takes 12 seconds. When the invoice generator hits an Out Of Memory (OOM) error or the CRM API hangs, the entire checkout request fails with a 504 Gateway Timeout, leaving the user unsure whether their card was charged.

Now imagine moving those tasks to an asynchronous background worker, but without robust lifecycle management. A worker picks up a PDF rendering job, runs out of memory, and Linux instantly terminates the process with `SIGKILL`. Because the worker used a destructive pop operation from a basic message list, the job vanishes into thin air. Alternatively, a malformed webhook payload arrives, crashes worker after worker in an infinite retry loop, and takes down your entire 50-node worker cluster in minutes.

A distributed background job system offloads time-consuming, resource-intensive, or deferred work away from the user-facing request path while guaranteeing that work gets reliably executed, retried on failure, and quarantined when corrupted.

Before sketching any architecture on the whiteboard, clarify the operational constraints with the interviewer:

- **Job Profiles and Latency SLAs:** Are these short I/O-bound jobs (sending emails or dispatching webhooks taking 50–200ms) or long compute-heavy jobs (video transcoding or monthly data aggregations taking 5–30 minutes)? What is the target end-to-end execution latency?
- **Scale and Throughput:** What is the peak ingestion rate (e.g., 50,000 jobs enqueued per second vs. 500 jobs per second)? How many total jobs execute daily?
- **Execution Timing:** Do we need immediate execution, delayed execution (e.g., "remind user in 2 hours"), recurring cron schedules (e.g., "run every midnight UTC"), or multi-step dependent Directed Acyclic Graph (DAG) workflows?
- **Delivery and Execution Guarantees:** Do we guarantee at-least-once or at-most-once execution? (Physical network partitions make true distributed exactly-once execution impossible at the queue layer; handlers must be idempotent).
- **Priority and Concurrency Limits:** Do we require multi-tiered priority queues (Critical, Default, Low)? Do we need tenant-level rate limiting or concurrency caps so one enterprise customer running a massive batch import does not monopolize all workers and starve transactional password resets?

## 2. The Core Insight — The Decision Everything Else Flows From

The foundational insight of a production-grade background job system is this: **A job queue is not a simple FIFO pipe; it is a distributed state machine managing temporary leases over untrusted, crash-prone workers.**

Every major architectural decision stems from treating worker nodes as inherently unreliable:

```txt
┌───────────┐      Enqueue      ┌───────────┐     Lease (Atomic)     ┌───────────┐
│ Scheduled │ ────────────────▶ │   Ready   │ ─────────────────────▶ │  Active   │
│  (ZSET)   │  Score <= Now     │  (Queue)  │    Visibility Timeout  │ (In-Prog) │
└───────────┘                   └───────────┘                        └─────┬─────┘
                                                                           │
               ┌───────────────────────┬───────────────────────────────────┤
               │ Succeeded (ACK)       │ Failed (NACK / Retry)             │ Lease Expired
               ▼                       ▼                                   ▼
        ┌─────────────┐         ┌─────────────┐                     ┌─────────────┐
        │  Completed  │         │ Retry Delay │ (Backoff < Max)     │ Auto-Reap / │
        │  (Deleted)  │         │   (ZSET)    │                     │ Re-enqueue  │
        └─────────────┘         └──────┬──────┘                     └─────────────┘
                                       │ Attempts >= Max
                                       ▼
                                ┌─────────────┐
                                │ Dead Letter │
                                │ (DLQ / S3)  │
                                └─────────────┘
```

Because workers can crash, hang on network I/O, or run out of memory at any arbitrary millisecond, the queue engine must never destructively remove a job when a worker begins processing it. Instead, the engine grants a time-bounded **lease** (often called a **visibility timeout**). The worker must continuously renew this lease via heartbeats while it works. If the worker silently dies, the lease expires, and a reaper process automatically returns the orphaned job to the ready queue. If the job fails repeatedly due to a fatal bug, an exponential backoff controller diverts it into a Dead Letter Queue (DLQ) to protect the worker fleet from crash loops.

## 3. High-Level Architecture — Components and Why Each Exists

A production background job system consists of seven dedicated subsystems, each addressing a distinct lifecycle requirement:

```txt
[ API / Web Servers (Producers) ] ───────┐
                 │                       │ Enqueue Job
                 ▼                       │ (Payload + Metadata)
┌────────────────────────────────────────┴────────────────────────────────────────┐
│                        Job Broker & State Coordinator                           │
│                                                                                 │
│   ┌────────────────────────┐                    ┌───────────────────────────┐   │
│   │ Delayed & Retry Set    │                    │ Priority Ready Queues     │   │
│   │ Redis Sorted Set       │──[Time Dispatch]──▶│ Redis Lists / Streams     │   │
│   │ (Score = Run Timestamp)│                    │ [Critical] [Default] [Low]│   │
│   └────────────────────────┘                    └─────────────┬─────────────┘   │
│                                                               │                 │
│   ┌────────────────────────┐                                  │ Atomic Lease    │
│   │ Dead Letter Queue (DLQ)│                                  │ (BRPOPLPUSH)    │
│   │ (Poison Pill Storage)  │                                  ▼                 │
│   └────────────────────────┘                    ┌───────────────────────────┐   │
│                                                 │ Active In-Progress Registry│  │
│   ┌────────────────────────┐                    │ Redis Hash + Lease Expiry │   │
│   │ Orphan Job Reaper      │◀──[Sweep Expired]──│ (Worker ID, Leased Until) │   │
│   │ (Heartbeat Supervisor) │                    └─────────────┬─────────────┘   │
└───┴────────────────────────┴──────────────────────────────────┼─────────────────┘
                                                                │
                   ┌────────────────────────────────────────────┴─────────────┐
                   │ Worker Fleet (Consumers)                                 │
                   │                                                          │
                   ▼                                                          ▼
    ┌──────────────────────────────┐                           ┌──────────────────────────────┐
    │ Worker Instance 1            │                           │ Worker Instance N            │
    │  - Pull Loop (BRPOPLPUSH)    │                           │  - Pull Loop (BRPOPLPUSH)    │
    │  - Task Execution Thread     │                           │  - Task Execution Thread     │
    │  - Heartbeat Lease Renewer   │                           │  - Heartbeat Lease Renewer   │
    │  - Graceful SIGTERM Trap     │                           │  - Graceful SIGTERM Trap     │
    └──────────────┬───────────────┘                           └──────────────┬───────────────┘
                   │                                                          │
                   └────────────────────────────┬─────────────────────────────┘
                                                │
                                                ▼ Update Job State & Result
                               ┌─────────────────────────────────┐
                               │ Metadata DB (Postgres / Dynamo) │
                               │ Stores status, history, logs    │
                               └─────────────────────────────────┘
```

1. **Job Producer (API Servers & Web Services):** Generates job payloads containing a unique `job_id`, task type, parameters, idempotency token, and priority. Pushes immediate jobs to Ready Queues and deferred jobs to the Delayed Set.
2. **Delayed & Scheduled Store (Redis Sorted Set `ZSET`):** Holds jobs scheduled for future execution (e.g., payment retries or cron runs). The sorted set score is the exact target execution timestamp in milliseconds (`epoch_ms`).
3. **Priority Ready Queues (Redis Lists or Streams):** Fast FIFO holding areas for jobs ready to be picked up immediately by available workers. Partitioned into multiple queues (e.g., `queue:critical`, `queue:default`, `queue:low`).
4. **Active Processing Registry:** Tracks jobs currently checked out by workers along with their worker ID, start timestamp, and lease expiration timestamp. Prevents job loss if a worker crashes mid-task.
5. **Scheduler / Dispatcher Daemon:** A lightweight periodic process (running every 50–100ms) that evaluates the `ZSET`, extracts jobs whose scheduled execution time is past (`score <= now`), and moves them atomically into their target Ready Queue.
6. **Distributed Worker Fleet:** Stateless consumer nodes running long-polling loops to lease jobs, execute user application logic, periodically send heartbeat renewals, and acknowledge completion upon success.
7. **Heartbeat Supervisor & Orphan Reaper:** Scans the Active Processing Registry for expired leases where no heartbeat renewal was received. Reschedules orphaned jobs back to the Ready Queue and increments their retry count.
8. **Autoscaling Controller (e.g., KEDA):** Monitors queue length, queue latency (time-in-queue for the oldest job), and consumer lag to scale the worker fleet up or down based on workload demand rather than raw CPU utilization.

### End-to-End Request Lifecycle

1. **Submission:** An API client triggers a background task. The web server generates a unique UUID `job_id`, constructs a lean JSON payload containing only resource IDs (e.g., `{"order_id": 98124}`), and pushes it to Redis.
2. **Scheduling:** If `run_at` is set to 15 minutes in the future, the job enters `delayed_jobs` with `score = current_time + 900000`. Once 15 minutes elapse, the Scheduler transfers it to `queue:default`.
3. **Leasing:** An idle worker invokes an atomic fetch operation (`BRPOPLPUSH` or a Redis Lua script). The job moves atomically from `queue:default` to `active_jobs`, setting a visibility lease of 30 seconds.
4. **Execution & Heartbeating:** The worker executes the task handler. If the task takes longer than 10 seconds, a background timer on the worker extends the lease in Redis (`SET active_job:job_123:lease 30 EX 30`).
5. **Completion:** Upon successful return, the worker removes the job from `active_jobs`, clears the lease key, and writes a success record to the persistent metadata database.

## 4. Key Technical Decisions — With Real Tradeoffs

### Decision 1: Queue Engine — In-Memory Store (Redis) vs. Relational Database (PostgreSQL `SKIP LOCKED`) vs. Managed Message Bus (AWS SQS)

- **Option A: Redis Data Structures + Lua (Selected for high throughput, low latency):**
  - *How it works:* Native Redis Lists (`LPUSH`/`BRPOPLPUSH`), Sorted Sets (`ZADD`/`ZRANGEBYSCORE`), and Hashes with custom Lua scripts for atomic multi-key state transitions.
  - *Tradeoffs:* Delivers sub-millisecond enqueue/dequeue latencies and supports 50,000+ ops/sec per node. However, it is memory-constrained and requires careful persistence tuning (AOF with `appendfsync everysec` and Redis Sentinel or Redis Cluster for failover).
- **Option B: PostgreSQL with `SELECT ... FOR UPDATE SKIP LOCKED`:**
  - *How it works:* Workers query the relational jobs table with `FOR UPDATE SKIP LOCKED` to lock and fetch available job rows without blocking concurrent worker transactions.
  - *Tradeoffs:* Gives complete ACID transactional consistency with existing business data (the Transactional Outbox pattern without distributed coordination). However, high-throughput job queueing creates heavy table and index bloat, vacuum overhead, and connection pool exhaustion above 5,000–10,000 jobs/sec.
- **Option C: AWS SQS:**
  - *How it works:* Fully managed distributed queue with native visibility timeouts and DLQ integration.
  - *Tradeoffs:* Zero infrastructure maintenance and virtually infinite automatic scaling. However, standard SQS has no native support for complex dynamic priority ordering or fine-grained workflow orchestrations, and FIFO SQS imposes strict throughput caps (3,000 msg/s with batching) and high costs at massive scale.

### Decision 2: Delivery Semantics — At-Least-Once Delivery with Idempotent Workers

- **Why Not Exactly-Once?** Two-phase commit across a network under physical partitions (the Two Generals' Problem) makes transport-level exactly-once execution impossible. If a worker completes an invoice generation task and charges the customer, but the network drops right before it sends the completion `ACK` to Redis, the supervisor will time out the lease and reassign the job to another worker.
- **The Solution:** Enforce **at-least-once delivery** at the infrastructure layer and mandate **idempotency** at the application handler layer. Every job payload contains an `idempotency_key`. Before performing side effects, the worker checks a persistent store or uses atomic database operations:

```sql
-- Atomic conditional execution: ensures a payment job executes exactly once
UPDATE invoices
SET status = 'PAID', paid_at = NOW(), transaction_id = :txn_id
WHERE id = :invoice_id AND status = 'PENDING';
```

If the rows updated is 0, the worker knows this job was already completed by a previous attempt, skips the external charge, and acknowledges the job safely.

### Decision 3: Consumer Model — Pull (Long Polling) vs. Push (Broker-Dispatched)

- **Chosen Approach:** Pull-based consumers using long polling (`BRPOPLPUSH` with a timeout of 5–20 seconds).
- **Rationale:** Push-based brokers (like raw WebSockets or push notifications) can easily overwhelm workers during traffic spikes, causing memory exhaustion and process thrashing. With long polling, workers pull work only when they have free execution slots. Long polling eliminates the CPU waste of tight busy-wait polling loops while providing immediate job dispatch the moment a new task is enqueued.

### Decision 4: Payload Size — Thin Reference Pointers vs. Fat Embedded Data

- **Chosen Approach:** Thin Reference Pointers (`Pass-by-Reference`).
- **Rationale:** Embedding a 10MB CSV file or an entire customer JSON dump directly inside the queue payload bloats Redis memory, exhausts network bandwidth during worker polling, and creates race conditions if the database state changes between enqueue time and execution time. Payloads must contain only primitive IDs and metadata:

```json
{
  "job_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "task": "reports.generate_monthly_summary",
  "payload_ref": {
    "account_id": "acc_88192",
    "month": "2026-07",
    "s3_raw_data_url": "s3://analytics-bucket/raw/acc_88192_2026_07.parquet"
  },
  "attempt": 1,
  "max_retries": 5,
  "enqueued_at": 1785002400000
}
```

## 5. Deep Dives — The Parts That Actually Matter

### Deep Dive 1: Delayed Job Scheduling Engine via Redis Sorted Sets (`ZSET`)

A primary requirement of background systems is scheduling jobs for future execution (e.g., sending an abandoned cart email in 2 hours).

1. When a deferred job is enqueued, the producer writes it to a Redis Sorted Set named `delayed_jobs`:
   ```redis
   ZADD delayed_jobs 1785009600000 '{"job_id":"job_101","queue":"emails",...}'
   ```
2. The score is the Unix epoch timestamp in milliseconds.
3. A dedicated Scheduler process runs an atomic Lua script every 50ms. The script queries all entries with a score less than or equal to the current time, removes them from the sorted set, and pushes them to their corresponding ready queue:

```lua
-- Atomically migrate ready scheduled jobs to the target ready queue
local delayed_queue = KEYS[1]
local ready_queue = KEYS[2]
local current_time = ARGV[1]
local batch_size = ARGV[2]

-- Find jobs whose run_at timestamp has passed
local ready_jobs = redis.call('ZRANGEBYSCORE', delayed_queue, '-inf', current_time, 'LIMIT', 0, batch_size)

if #ready_jobs > 0 then
    -- Remove them from the delayed ZSET
    for i, job in ipairs(ready_jobs) do
        redis.call('ZREM', delayed_queue, job)
        redis.call('LPUSH', ready_queue, job)
    end
end

return #ready_jobs
```

Because Redis executes Lua scripts atomically on a single thread, multiple scheduler instances can run concurrently across different nodes without race conditions or duplicate enqueueing.

### Deep Dive 2: Two-Phase Job Leasing, Heartbeating, and Orphan Recovery

A naive `RPOP` command removes the job from Redis immediately. If the worker process crashes 50ms later, the job is permanently lost.

To provide fault tolerance, the worker fleet uses a two-phase lease pattern:

```txt
Step 1: Atomic Fetch & Lease
  Worker ────────▶ BRPOPLPUSH queue:ready queue:active:worker_1 ──▶ Redis
                   (Moves job to active queue, returns payload)

Step 2: Periodic Heartbeat (Background Thread)
  Worker ────────▶ SET job:101:lease "worker_1" EX 30 ─────────────▶ Redis
                   (Renews 30s TTL every 10s while running)

Step 3: Completion & ACK
  Worker ────────▶ LREM queue:active:worker_1 1 payload ──────────▶ Redis
                   DEL job:101:lease
```

```python
import time
import threading

class Worker:
    def __init__(self, redis_client, worker_id, queue_name):
        self.redis = redis_client
        self.worker_id = worker_id
        self.ready_queue = f"queue:{queue_name}"
        self.active_queue = f"active:{queue_name}:{worker_id}"
        self.running = True

    def process_loop(self):
        while self.running:
            # Block up to 5 seconds waiting for a job, atomically moving it to our active queue
            job_raw = self.redis.brpoplpush(self.ready_queue, self.active_queue, timeout=5)
            if not job_raw:
                continue

            job = parse_json(job_raw)
            lease_key = f"lease:{job['job_id']}"

            # Set initial visibility lease of 30 seconds
            self.redis.set(lease_key, self.worker_id, ex=30)

            # Start background heartbeat thread to renew lease for long-running jobs
            stop_heartbeat = threading.Event()
            heartbeat_thread = threading.Thread(
                target=self._heartbeat,
                args=(lease_key, stop_heartbeat)
            )
            heartbeat_thread.start()

            try:
                # Execute the actual business logic
                self.execute_task(job)

                # Success: Acknowledge and remove from active queue
                stop_heartbeat.set()
                heartbeat_thread.join()
                self.redis.lrem(self.active_queue, 1, job_raw)
                self.redis.delete(lease_key)
            except Exception as exc:
                stop_heartbeat.set()
                heartbeat_thread.join()
                self.handle_failure(job, job_raw, exc)

    def _heartbeat(self, lease_key, stop_event):
        while not stop_event.wait(timeout=10.0):
            # Extend lease by 30 seconds every 10 seconds
            self.redis.set(lease_key, self.worker_id, ex=30)
```

**Orphan Job Reaper:** If a worker suffers a hard crash, its heartbeat thread dies immediately. A separate Reaper process queries all `active:*` queues. If `lease:{job_id}` has expired and does not exist in Redis, the Reaper removes the job from the dead worker's active list, increments its `attempt` counter, and moves it back to `queue:ready`.

### Deep Dive 3: Priority Queuing Without Starvation

If you use naive strict priority (`BRPOP queue:critical queue:default queue:low`), the worker will always drain all critical jobs before looking at default or low queues. If your platform receives a steady stream of critical transactional jobs, low-priority jobs (e.g., weekly summary emails) will sit in the queue for days and **starve**.

Two production strategies solve queue starvation:

1. **Weighted Fair Polling (Probabilistic Round-Robin):**
   Workers draw a random number on each poll iteration to determine which queue to query:
   - 60% probability: check `queue:critical`
   - 30% probability: check `queue:default`
   - 10% probability: check `queue:low`
   This guarantees that low-priority queues always make forward progress regardless of high-priority load.

2. **Dedicated Worker Fleet Allocation:**
   Rather than having all workers poll all queues, partition the worker fleet:
   - Fleet A (50 workers): Dedicated exclusively to `queue:critical`
   - Fleet B (30 workers): Dedicated to `queue:default`
   - Fleet C (10 workers): Dedicated to `queue:low`
   During off-peak hours, unutilized workers from Fleet C can be dynamically reassigned to Fleet A via autoscaling rules.

### Deep Dive 4: Poison Pill Detection, Exponential Backoff with Jitter, and Dead Letter Queues

A **poison pill** is a job with corrupted data or an unexpected edge case that causes the worker process to crash or throw an unhandled exception every time it executes. Without quarantine mechanisms, the job will fail, get re-enqueued, fail again, and consume 100% of the worker fleet's compute capacity.

To prevent this:

1. **Exponential Backoff with Full Jitter:** When a transient error occurs (e.g., third-party API rate limit), do not retry immediately. Schedule the retry in the `delayed_jobs` sorted set with exponentially increasing delays plus randomness (jitter) to prevent thundering herd spikes on downstream databases:

$$\text{Delay} = \min\left(\text{MaxDelay}, \text{BaseDelay} \times 2^{\text{attempt} - 1}\right) + \text{rand}(0, \text{Jitter})$$

```python
import random

def calculate_retry_delay(attempt: int, base_delay: float = 1.0, max_delay: float = 300.0) -> float:
    # Exponential backoff
    raw_backoff = min(max_delay, base_delay * (2 ** (attempt - 1)))
    # Full jitter: uniformly random delay between 0 and raw_backoff
    return random.uniform(0, raw_backoff)
```

2. **Dead Letter Queue (DLQ) Quarantine:** Each job tracks `attempt`. If `attempt >= max_retries` (e.g., 5 attempts), the worker halts retry attempts, moves the payload into `queue:dead_letter`, and stores the full exception stack trace and execution context in the metadata database. On-call engineers receive an alert when the DLQ ingestion rate exceeds a threshold, allowing them to inspect, fix the bug, and replay the dead-lettered jobs safely via an admin API.

### Deep Dive 5: Worker Autoscaling on Queue Lag (KEDA) & Graceful Shutdown

Scaling worker pods based on CPU or memory utilization fails completely for background job systems. A fleet of 10 workers running I/O-bound email dispatch jobs might only consume 5% CPU while a backlog of 2,000,000 jobs accumulates in Redis. Conversely, 10 workers rendering complex 3D graphics might run at 95% CPU with only 10 jobs in the queue.

Workers must scale based on **Queue Depth** and **Consumer Lag**:

```yaml
# KEDA (Kubernetes Event-driven Autoscaling) ScaledObject for Redis Queue
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: email-worker-scaler
spec:
  scaleTargetRef:
    name: email-worker-deployment
  minReplicaCount: 2
  maxReplicaCount: 100
  triggers:
    - type: redis
      metadata:
        address: redis-cluster.internal:6379
        listName: queue:emails
        targetListLength: "50" # Scale up 1 worker pod for every 50 pending jobs
```

#### Graceful Shutdown (`SIGTERM` Trapping)

When deploying new code or scaling down worker pods, Kubernetes sends a `SIGTERM` signal to the worker container before issuing a `SIGKILL` after a grace period (e.g., 30 seconds).

The worker process must intercept `SIGTERM`:
1. Stop accepting new jobs from `BRPOPLPUSH`.
2. Allow currently executing jobs to finish if their remaining time is under the grace period.
3. If an in-flight job cannot complete before the shutdown deadline, atomically return the job to `queue:ready` and release the lease so another active worker can claim it immediately without waiting for lease timeout expiration.

## 6. Failure Modes and Resilience

```txt
┌───────────────────────────────────┬───────────────────────────────────┬──────────────────────────────────────────┐
│ Failure Point                     │ Production Impact                 │ Mitigation Strategy                      │
├───────────────────────────────────┼───────────────────────────────────┼──────────────────────────────────────────┤
│ Worker OOM / Hard Node Crash      │ Job stuck in "active" state;      │ Visibility timeout with heartbeat expiry.│
│                                   │ thread destroyed mid-execution.   │ Orphan Reaper reclaims un-heartbeated    │
│                                   │                                   │ jobs back to Ready Queue.                │
├───────────────────────────────────┼───────────────────────────────────┼──────────────────────────────────────────┤
│ Poison Pill Job Payload           │ Worker fleet enters cascading     │ Strict max retry limit (e.g., 5). Route  │
│                                   │ crash loop; burns 100% compute.   │ directly to Dead Letter Queue (DLQ).     │
├───────────────────────────────────┼───────────────────────────────────┼──────────────────────────────────────────┤
│ Downstream Dependency Outage      │ Thousands of jobs fail            │ Circuit Breaker pattern. Automatically   │
│ (e.g., Payment Gateway 503s)      │ simultaneously; retries exhaust   │ pause queue consumption and back off all │
│                                   │ immediately and dump to DLQ.      │ workers until health checks pass.        │
├───────────────────────────────────┼───────────────────────────────────┼──────────────────────────────────────────┤
│ Redis Memory Eviction             │ Redis reaches max memory; drops   │ Configure `maxmemory-policy noeviction`. │
│                                   │ delayed sets or ready jobs.       │ Store only thin pointer payloads; upload │
│                                   │                                   │ large blobs to S3/GCS object storage.    │
├───────────────────────────────────┼───────────────────────────────────┼──────────────────────────────────────────┤
│ Network Partition Split-Brain     │ Worker A finishes job after its   │ Database-level idempotency checks with   │
│                                   │ lease expired; Worker B also runs │ fencing tokens (`WHERE status='PENDING'`)│
│                                   │ it, causing duplicate execution.  │ preventing double execution.             │
└───────────────────────────────────┴───────────────────────────────────┴──────────────────────────────────────────┘
```

## 7. What Makes a Great Answer vs an Average One

| Area | Average Candidate | Senior Candidate |
|---|---|---|
| **Queue Primitives** | Mentions using `LPUSH` and `RPOP` in Redis or a basic RabbitMQ exchange. | Explains that destructive `RPOP` loses jobs on worker crashes. Uses two-phase leasing (`BRPOPLPUSH` / Redis Streams) with visibility timeouts and heartbeat lease renewal. |
| **Scheduling** | Suggests a cron job querying a relational database table with `WHERE run_at <= NOW()` every minute. | Uses a Redis Sorted Set (`ZSET`) with millisecond timestamps as scores and atomic Lua scripts to batch-migrate ready tasks into priority queues with sub-second precision. |
| **Execution Guarantees** | Claims the system guarantees "strictly exactly-once delivery." | Acknowledges the physical impossibility of distributed exactly-once transport; designs for at-least-once delivery combined with application-level idempotency keys and fencing tokens. |
| **Priority Handling** | Implements strict FIFO priority queues, ignoring the resulting starvation of low-priority workloads. | Designs weighted round-robin polling or dedicated worker pool partitioning to ensure low-priority background tasks make steady forward progress. |
| **Autoscaling** | Suggests scaling worker pods based on CPU/Memory utilization. | Points out that I/O-bound workers consume minimal CPU while queues overflow; configures autoscaling based on queue depth, oldest message age, and consumer lag via KEDA. |
| **Operational Lifecycle** | Ignores worker deployment mechanics and crash handling. | Details `SIGTERM` graceful shutdown handling, lease surrender on drain timeouts, exponential backoff with full jitter, and Dead Letter Queue monitoring. |

## 8. 🧠 The Memory Hook

Workers will crash, networks will partition, and corrupted payloads will poison your fleet. **A background job system is not a FIFO pipe—it is a distributed lease manager with heartbeats, atomic Lua scheduling, exponential backoff with jitter, and a Dead Letter Queue quarantine backed by idempotent workers.**
