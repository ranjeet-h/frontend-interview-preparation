# Design a Webhook Ingestion and Dispatch System

## 1. Understand the Problem First — Clarify Before Designing

Imagine this production nightmare: your platform receives payment notifications from Stripe. During Black Friday, Stripe bursts 40,000 webhook events per second at your ingestion endpoint. Your backend runs synchronous database writes, sends customer confirmation emails, and updates inventory inside the HTTP request handler. Within 5 seconds, database connection pools are exhausted, web server worker threads lock up, and your servers return HTTP 504 Gateway Timeouts. Stripe marks your endpoint as failing, pauses deliveries, and your customers' orders sit stranded in limbo.

Or flip the scenario around: you run a developer platform like GitHub or Shopify, and you dispatch webhooks to 100,000 external customer URLs whenever repository pushes or checkout events happen. One customer's server goes down and takes 30 seconds to time out on every HTTP POST. Another customer misconfigures a server to return HTTP 500 errors. Your outbound worker pool gets completely bogged down waiting on those slow or broken servers, exhausting available sockets and delaying webhook delivery for every other customer on your platform. Meanwhile, your naive retry loop hammers the struggling customer server with millions of retransmissions, creating a self-inflicted DDoS attack.

Webhooks are not ordinary REST API calls. They cross administrative and network boundaries over the public internet between two completely independent systems that do not share memory, transaction context, or uptime guarantees.

Before drawing any boxes on a whiteboard, a senior engineer clarifies both the ingestion side (receiving webhooks from third parties) and the outbound dispatch side (sending webhooks to customer endpoints), along with exact scale and constraints:

**Clarifying Questions to Align With the Interviewer:**

- **Scope & Directionality:** Are we designing the **Ingestion system** (consuming events from providers like Stripe/Twilio), the **Outbound Dispatch system** (publishing events to developer webhooks), or an end-to-end platform covering both? (A complete senior design covers the two-sided lifecycle, because both share foundational reliability primitives: durable buffering, idempotency, retry policies, and cryptographic verification).
- **Scale & Traffic Profile:** What is the average throughput and peak burst volume? Let's assume a baseline of 10,000 events/sec, bursting up to 100,000 events/sec during major flash events.
- **Delivery Guarantees:** Is at-least-once delivery acceptable? In distributed systems, network partitions make exactly-once physical delivery across public HTTP impossible. We must guarantee at-least-once delivery and enforce idempotency on both ends.
- **Latency SLAs:** For ingestion, return HTTP `202 Accepted` within 20ms. For outbound dispatch, attempt initial delivery within 5 seconds of the event being produced under p99 conditions.
- **Retry Policy & Retention:** How long do we retry failed endpoints? For example, 5 to 10 retry attempts over 24 to 72 hours using exponential backoff with jitter, after which failed payloads drop into a Dead-Letter Queue (DLQ) accessible via a developer replay portal.
- **Security & Protection:** How do we authenticate incoming payloads (HMAC signatures and timestamp verification to prevent replay attacks)? How do we protect our outbound infrastructure against Server-Side Request Forgery (SSRF) when making HTTP requests to arbitrary user-supplied URLs?

## 2. The Core Insight — The Decision Everything Else Flows From

The central insight that governs this entire architecture is: **never allow an external third-party's latency or failure to dictate the latency, throughput, or availability of your own core systems.**

Because you cannot control an external server's health, processing speed, or network route, synchronous processing across an external boundary is an existential flaw.

This insight splits the system into two strict decoupled pipelines:

1. **Ingestion Rule:** The webhook receiver must act as an ultra-lean ingestion proxy. It verifies the cryptographic HMAC signature, extracts or generates an idempotency key, immediately writes the raw payload to a distributed durable log (like Kafka), and returns HTTP `202 Accepted` within milliseconds. All business logic, database transactions, and third-party API interactions occur asynchronously in downstream consumers.
2. **Outbound Dispatch Rule:** Treat every subscriber endpoint as fragile, slow, and potentially adversarial. Outbound dispatching must never use a single global queue. Deliveries must be isolated into per-subscriber rate-limited virtual queues with independent concurrency limits, circuit breakers, and exponential backoff with jitter. A single customer's endpoint timing out at 30 seconds must only pause their own queue without consuming resources needed by any other tenant.

## 3. High-Level Architecture — Components and Why Each Exists

Here is the architectural data flow for both Ingestion and Outbound Dispatch:

```txt
=== INGESTION PIPELINE (Receiving Webhooks from Third Parties) ===

External Sender (Stripe/GitHub)
       │ HTTP POST (Payload + HMAC Signature + Timestamp)
       ▼
[ Edge API Gateway / Load Balancer ]
       │ TLS Termination & Rate Limiting
       ▼
[ Webhook Ingestion Service ] ── (Verify HMAC Signature & Timestamp Window)
       │ Fast Write to Log (p99 < 20ms)
       ├─────────────────────────────────► Returns HTTP 202 Accepted to Sender
       ▼
[ Ingestion Kafka Topic ] (Partitioned by Entity/Account ID for FIFO order)
       ▼
[ Ingestion Worker Pool ]
       ├── 1. Atomic Idempotency Check (Redis SET NX / DB Record)
       ├── 2. Parse & Validate Payload Schema
       ├── 3. Execute Business Logic / Update Primary Database
       └── 4. Ack Kafka Message Offset


=== OUTBOUND DISPATCH PIPELINE (Sending Webhooks to Subscribers) ===

Internal Microservices (Billing, Order Service, Auth)
       │ Emit Domain Event (e.g. order.created)
       ▼
[ Outbound Event Kafka Topic ]
       ▼
[ Dispatch Router & Fanout Engine ] ── (Lookup Subscribed URLs & Secrets)
       │ Shard & Route to Per-Subscriber Queues
       ▼
[ Per-Subscriber Queues & Rate Limiters ] (Token Bucket / Concurrency Capped)
       ▼
[ Dispatch Worker Pool ] ── (Signs Payload with HMAC-SHA256)
       │ Outbound HTTP POST via Egress Proxy (SSRF Protected)
       ├──► [ External Subscriber Endpoint ]
       │         │
       │         ├── 2xx Success ──► Ack Message, Record Delivery Log
       │         │
       │         └── 4xx/5xx/Timeout ──► Route to Retry Engine
       ▼
[ Tiered Retry Queues ] (Exponential Backoff with Full Jitter: 1m, 5m, 30m, 2h, 24h)
       │
       ├── Retries Exhausted ──► [ Dead-Letter Queue (DLQ) & Archive Storage ]
       │                                     │
       │                                     ▼
       │                              [ Customer Portal: Manual Replay & Debug Log ]
       └── Consecutive Failure Threshold ──► Trip Circuit Breaker & Auto-Disable Endpoint
```

**Why Each Component Exists:**

- **Edge API Gateway:** Terminates TLS, enforces DDoS protection, rate-limits abusive IPs, and routes incoming webhook traffic to the Ingestion Service.
- **Webhook Ingestion Service:** A lightweight, stateless service built to maximize throughput and minimize latency. It validates the cryptographic signature, checks timestamp skew, pushes the event directly into Kafka, and responds with HTTP `202 Accepted`. It does zero database querying or heavy compute.
- **Ingestion Kafka Topic:** Provides durable, distributed buffering. It absorbs massive burst traffic without dropping events, protecting downstream database clusters from being overwhelmed.
- **Ingestion Workers & Idempotency Store:** Scalable consumer groups that process raw webhooks. They check Redis or the database for previously processed message IDs before executing business logic, ensuring safe replay and at-least-once deduplication.
- **Dispatch Router & Fanout Engine:** Consumes internal application events, queries the subscriber metadata cache (Redis/PostgreSQL), determines which subscribers signed up for this specific event type, and creates individual delivery tasks.
- **Per-Subscriber Queues & Rate Limiters:** Separates traffic so that each subscriber has its own concurrency limit (e.g., maximum 10 parallel in-flight HTTP requests) and rate limit (e.g., 50 requests/sec). This prevents noisy neighbors from starving the system.
- **Egress Proxy (SSRF Guard):** A hardened proxy layer in an isolated network segment that performs strict DNS resolution, blocks private and loopback IP addresses (RFC 1918, link-local, cloud metadata APIs), and prevents DNS rebinding attacks before initiating the outbound TCP connection.
- **Tiered Retry Queues & Scheduler:** Handles transient network failures by scheduling retries across delayed topics or queues with exponential backoff and randomized jitter.
- **Dead-Letter Queue (DLQ) & Developer Portal:** Stores un-deliverable payloads after max retries have been exhausted, allowing developers to inspect failure reasons (HTTP status code, response body, latency) and trigger manual re-deliveries once their servers recover.

## 4. Key Technical Decisions — With Real Tradeoffs

**Decision 1: Asynchronous Queue-First Ingestion vs Synchronous Inline Processing**
- *Choice:* Verify signature, drop raw payload into Kafka, and return HTTP `202 Accepted` immediately (under 20ms).
- *Rejected Alternative:* Executing database transactions and third-party API calls inside the incoming HTTP request.
- *Tradeoff:* We give up the ability to return synchronous business errors (like "insufficient inventory") to the webhook sender. However, we gain near-infinite burst tolerance, rock-solid availability, and complete decoupling of our database load from external traffic spikes. Since senders like Stripe and Shopify only care if you safely received the event (200/202 vs 500), asynchronous acceptance is the industry standard.

**Decision 2: Message Broker Architecture: Kafka Log Partitioning vs Traditional Task Queues (RabbitMQ/SQS)**
- *Choice:* Kafka for high-throughput ingestion and event fanout; dedicated delayed retry topics (or Redis/SQS delayed queues) for exponential backoff retries.
- *Rejected Alternative:* Relying solely on RabbitMQ or SQS for everything.
- *Tradeoff:* Kafka provides unbeatable ingestion throughput (millions of events per second), zero data loss durability, and the ability to rewind and replay consumer offsets after a bug fix. However, Kafka lacks native single-message delay timers (you cannot tell Kafka to hold one specific message for 15 minutes). We solve this by using Kafka for the primary pipeline and dedicated delayed retry queues (or time-bucketed topics like `retry-1m`, `retry-5m`, `retry-30m`) for failed deliveries.

**Decision 3: Outbound Concurrency Isolation: Shared Global Worker Pool vs Per-Subscriber Virtual Queues**
- *Choice:* Partitioned dispatching where workers pull tasks governed by per-subscriber token-bucket rate limiters and strict concurrency caps (e.g., max 5 concurrent in-flight requests per subscriber).
- *Rejected Alternative:* A single shared FIFO worker queue where workers pop whatever job is next.
- *Tradeoff:* Per-subscriber rate limiting requires a coordination layer (such as Redis Redis-cell/Lua scripts or partitioned Kafka keys). However, a shared global queue suffers from fatal "head-of-line blocking": if Customer A's server hangs for 30 seconds, Customer A's retries fill up the entire worker pool, causing catastrophic delivery delays for all other customers. Concurrency isolation ensures Customer A's failure only affects Customer A.

**Decision 4: Delivery Semantics: At-Least-Once with Idempotency vs Exactly-Once**
- *Choice:* At-least-once delivery backed by persistent idempotency keys.
- *Rejected Alternative:* Distributed 2-Phase Commit (2PC) or assuming networks never fail.
- *Tradeoff:* Every webhook receiver and internal consumer must store and check idempotency keys to handle duplicate deliveries gracefully. In exchange, the system remains completely available, resilient to network drops, and avoids high-latency distributed locks.

## 5. Deep Dives — The Parts That Actually Matter

**Deep Dive 1: Cryptographic Verification, Timestamp Skew, and SSRF Prevention**

On Ingestion (HMAC Signature Verification):
Webhooks arrive over the public internet. Attackers can forge payloads or intercept and replay legitimate ones. We enforce HMAC-SHA256 signature verification with timestamp hashing:

```txt
Incoming Header: Stripe-Signature: t=1700000000,v1=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```

1. Extract the timestamp `t` and the signature `v1`.
2. Check timestamp skew: if `|currentTime - t| > 300 seconds` (5 minutes), reject the request immediately with HTTP 400. This prevents replay attacks where an attacker sniffs an old valid payload and replays it.
3. Compute expected signature: `HMAC_SHA256(secretKey, t + "." + rawBody)`.
4. Use constant-time string comparison (`crypto.timingSafeEqual` in Node.js or `hmac.compare_digest` in Python) to compare the computed signature against `v1`. A standard `===` comparison allows attackers to deduce the signature byte-by-byte via timing attack vulnerabilities.

On Outbound Dispatch (SSRF — Server-Side Request Forgery Defense):
When you allow customers to register webhook URLs (e.g., `https://api.customer.com/webhooks`), a malicious actor could register internal infrastructure URLs:
- `http://169.254.169.254/latest/meta-data/` (AWS/GCP instance metadata containing IAM credentials)
- `http://10.0.0.5:8080/admin/delete-db` (Internal VPC services)
- `http://127.0.0.1:6379` (Internal Redis instances)

To eliminate SSRF, implement a strict 5-layer egress defense:

```txt
[ Outbound Dispatch Worker ]
            │
            ▼
[ Custom DNS Resolver & Validator ]
      ├── 1. Resolve domain to IP addresses via DNS.
      ├── 2. Inspect all resolved IPs against Denied CIDRs:
      │      - 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (RFC 1918 Private)
      │      - 127.0.0.0/8 (Loopback / Localhost)
      │      - 169.254.0.0/16 (Link-Local / Cloud Instance Metadata)
      │      - ::1, fc00::/7 (IPv6 Local & Private)
      │      If matched -> Reject URL & Flag Account.
      │
      ├── 3. Pin validated IP address to the TCP socket (Prevents DNS Rebinding).
      ├── 4. Enforce HTTPS only (Port 443) and disable HTTP redirects (No 301/302 following).
      │
      ▼
[ Dedicated Egress Proxy in Isolated Subnet / DMZ ]
      └── Direct Outbound HTTP POST to Public Internet Only (No route to internal VPC)
```

**Deep Dive 2: Handling Out-of-Order Deliveries and State Reversals**

In a distributed network with retries, event deliveries can arrive out of chronological sequence. Consider an e-commerce order:
1. Event A (`order.created`) occurs at `T=0`.
2. Event B (`order.cancelled`) occurs at `T=1`.
3. Event A experiences a network hiccup, fails, and gets scheduled for a retry at `T=5`.
4. Event B succeeds immediately at `T=2`.
5. Event A's retry arrives at `T=5`.

If your consumer naively updates the order status based on the latest received payload, Event A overwrites Event B, setting the status of a cancelled order back to `CREATED`!

To prevent this state corruption:

- **Monotonically Increasing Sequence / Version Numbers:** Every entity emits a `version` or integer `sequence_id` with its event payload (e.g., `version: 4`). When writing to the database, use conditional optimistic locking:
  ```sql
  UPDATE orders
  SET status = 'CREATED', version = 4
  WHERE id = 'ord_123' AND version < 4;
  ```
  If a newer version (e.g., `version: 5` from `order.cancelled`) has already been committed, the update affects 0 rows and is safely acknowledged and discarded.
- **Strict State Machine Validation:** Implement an explicit state transition graph in your application layer. A transition from `CANCELLED` to `CREATED` is illegal and rejected.
- **Partition Key by Entity ID:** On Kafka ingestion, partition by `accountId` or `orderId`. This guarantees that under normal operation, all events for a specific entity are assigned to the exact same Kafka partition and consumed in strict FIFO order by a single worker thread.

**Deep Dive 3: Retries with Full Jitter, Tiered Backoff, and Circuit Breakers**

When an external subscriber endpoint fails (e.g., HTTP 500, 502, 503, 504, or network timeout), retrying immediately or at static intervals creates synchronized waves of traffic called a **Thundering Herd**, driving the struggling server completely offline.

We use **Exponential Backoff with Full Jitter**:

```txt
Formula: SleepTime = UniformRandom(0, Min(MaxBackoff, BaseInterval * 2^AttemptNumber))

Attempt 1: Random between 0 and 10 seconds
Attempt 2: Random between 0 and 20 seconds
Attempt 3: Random between 0 and 40 seconds
Attempt 4: Random between 0 and 80 seconds
Attempt 5: Random between 0 and 160 seconds
...
Attempt 10: Max backoff cap (e.g., 24 hours)
```

Jitter spreads out retry attempts uniformly across the timeline, allowing the degraded server to recover gracefully without experiencing cyclical spikes.

**Circuit Breakers & Automatic Endpoint Pausing:**
If an endpoint fails continuously (e.g., returns 5xx errors or timeouts for 50 consecutive deliveries over a 30-minute window):
1. Trip the circuit breaker for that subscriber URL.
2. Stop active delivery attempts and immediately route incoming events for that subscriber straight to the Dead-Letter Queue (DLQ).
3. Send an automated email/dashboard alert to the developer: *"Your webhook endpoint has been paused due to continuous failures. Fix your server and click Resume in your dashboard."*
4. When the developer clicks "Resume" or updates their URL, the system sends a lightweight health-check ping. Once verified, it drains the DLQ in controlled batches.

## 6. Failure Modes and Resilience

**1. Sudden 10x Ingestion Traffic Spike (e.g. Flash Sale Burst)**
- *What Breaks:* API gateway and ingestion service CPU spikes; database write bottlenecks.
- *How We Handle It:* The ingestion service is purely stateless. Horizontal Pod Autoscalers (HPA) scale ingestion pods based on CPU and open TCP connections. Ingestion pods write raw payloads to high-throughput Kafka partitions without touching the database. Kafka easily handles millions of writes per second. Downstream workers process the queue at a controlled, sustainable rate that matches primary database capacity.

**2. Subscriber Endpoint Slow LORIS / Hanging Connections**
- *What Breaks:* Outbound workers wait indefinitely on open sockets, exhausting the operating system's file descriptors and thread pool.
- *How We Handle It:* Enforce aggressive HTTP client timeouts: a 2-second connection timeout and a 5-second socket read timeout. Run workers using non-blocking asynchronous I/O (e.g., Node.js event loop, Go goroutines, or Java Netty). If an endpoint exceeds 5 seconds, terminate the TCP socket, record a `TIMEOUT` status, and schedule the event in the retry queue.

**3. Hot Partitioning in Kafka (One Mega-Merchant Generates 60% of All Events)**
- *What Breaks:* All events for that single merchant route to one partition, creating a massive lag on that specific consumer while other consumer workers sit idle.
- *How We Handle It:* Use a composite partition key: `merchant_id + ":" + (event_id % 10)` or dedicated high-volume topics for enterprise tenants. This distributes the heavy merchant's workload across multiple Kafka partitions while maintaining strict parallelism.

**4. Worker Crash Mid-Processing (Partial Writes / Duplicate Processing)**
- *What Breaks:* A worker pulls a batch of events, executes business logic, but crashes before committing its Kafka consumer offset. Upon restart, a new worker re-consumes the same batch.
- *How We Handle It:* Idempotency keys. Every event carries a unique `eventId` or `idempotencyKey`. Before processing, the worker attempts an atomic insert into an idempotency table or Redis:
  ```sql
  INSERT INTO processed_events (event_id, processed_at)
  VALUES ('evt_abc123', NOW())
  ON CONFLICT (event_id) DO NOTHING;
  ```
  If 0 rows are inserted, the worker knows this event was already processed, acknowledges the Kafka offset, and skips execution.

**5. Malformed Payload / Poison Pill Message**
- *What Breaks:* An unparseable or corrupted payload causes the worker deserializer to throw an uncaught exception, crashing the worker in an infinite loop and stalling the entire partition.
- *How We Handle It:* Wrap JSON parsing in strict error boundaries. If a message cannot be parsed or validated against schema, log the raw payload, tag it as `CORRUPTED_PAYLOAD`, push it directly to a Poison-Pill DLQ for engineer inspection, and advance the Kafka partition offset immediately.

## 7. What Makes a Great Answer vs an Average One

**Ingestion Response Time:**
- *Average Answer:* "The server receives the webhook, verifies the user, updates the database, sends an email, and returns 200 OK." (Fails under any real-world load).
- *Great Answer:* "The ingestion service verifies HMAC and timestamp skew, pushes the raw event into a distributed log (Kafka), and returns HTTP `202 Accepted` in under 20 milliseconds. All database mutations and business side-effects run asynchronously."

**Outbound Blast Radius & Isolation:**
- *Average Answer:* "We have an outbound worker queue that sends HTTP POST requests to customer URLs." (Ignores noisy neighbor problem).
- *Great Answer:* "We isolate dispatch traffic using per-subscriber token-bucket rate limiters and strict concurrency caps (e.g., maximum 5 in-flight requests per endpoint). One broken customer taking 30 seconds to time out will never starve workers or delay deliveries for other subscribers."

**Security & SSRF Defense:**
- *Average Answer:* "We sign the payload with an API key."
- *Great Answer:* "We implement mutual security: on ingestion, HMAC-SHA256 with timestamp skew checks and constant-time comparison to prevent replay and timing attacks. On outbound dispatch, a dedicated egress proxy with pre-connect DNS validation, blocking of private CIDRs (RFC 1918, link-local, metadata APIs), pinned socket IPs to defeat DNS rebinding, and strictly disabled 3xx redirects."

**Retries and Resilience:**
- *Average Answer:* "If the webhook fails, we retry it 3 times."
- *Great Answer:* "We use Exponential Backoff with Full Jitter across tiered retry queues over 72 hours to prevent thundering herds. We track consecutive failures with circuit breakers to automatically pause dead endpoints, routing terminal failures to a Dead-Letter Queue (DLQ) with a self-serve developer replay dashboard."

**Ordering & Idempotency:**
- *Average Answer:* "Kafka guarantees FIFO ordering."
- *Great Answer:* "Kafka guarantees ordering only within a single partition under happy paths; network retries inherently cause out-of-order deliveries. We enforce monotonically increasing version numbers with database optimistic locks and explicit state machine validation to prevent late-arriving events from reversing newer state."

## 8. 🧠 The Memory Hook

**Accept in milliseconds, buffer in Kafka, dispatch with tenant isolation, and treat every external endpoint like it's down, slow, or trying to attack you.**
