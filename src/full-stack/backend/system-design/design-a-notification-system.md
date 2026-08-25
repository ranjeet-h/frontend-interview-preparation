# Design a Notification System

## 1. Understand the Problem First — Clarify Before Designing

Imagine a flash sale campaign triggers 50 million promotional marketing emails at 10:00 AM on Black Friday. If your notification system uses a single shared queue, that massive marketing burst creates an enormous backlog. Five minutes later, a customer attempts to sign in from a new device and requests a two-factor authentication (OTP) code. That critical OTP gets stuck behind 40 million promotional flyers in the queue. The SMS arrives 45 minutes later—long after the login session has expired and the customer has abandoned their purchase.

Alternatively, consider what happens when a downstream vendor like Twilio or SendGrid suffers a 15-minute partial outage. Without strict idempotency keys and circuit breaking, uncoordinated worker retries flood the failing provider, duplicate millions of push notifications to users' phones in the middle of the night, and generate tens of thousands of dollars in wasted SMS fees.

Before drawing architectural boxes on a whiteboard, clarify the exact functional and scale requirements:

**Functional Requirements to Clarify:**
- **Supported Channels:** Mobile Push (iOS APNs, Android FCM), SMS (Twilio, AWS SNS), Email (SendGrid, AWS SES), and In-App real-time alerts (WebSockets/SSE) backed by a persistent notification center inbox.
- **User Preferences & Compliance:** Can users opt out of specific channels or categories (e.g., mute marketing but keep security alerts)? Do we enforce quiet hours (e.g., no non-critical alerts between 10:00 PM and 8:00 AM in the user's local timezone)?
- **Notification Aggregation (Smart Collapsing):** If 50 people like a user's post in 5 minutes, do we send 50 individual push notifications, or aggregate them into "Alice and 49 others liked your post"?
- **Multi-Device Support:** Can a single user have multiple registered devices (iPhone, iPad, Android phone, web browser), and how do we handle invalid/uninstalled device tokens?

**Scale & Latency SLAs:**
- **Scale:** 10 million Daily Active Users (DAU), 100 million total notifications per day (~1,200/sec average, with marketing bursts peaking at 35,000–50,000/sec).
- **Latency SLAs:**
  - *High-Priority (Transactional, OTP, Security Alerts, Payment Confirmations):* Under 2 seconds p99 delivery.
  - *Low-Priority (Marketing blasts, weekly digests, recommendations):* Minutes to hours is acceptable.
- **Delivery Guarantee:** At-least-once delivery to external gateways, paired with end-to-end deduplication to ensure an effective exactly-once user experience. Zero message loss for transactional notifications.

---

## 2. The Core Insight — The Decision Everything Else Flows From

The foundational insight of a distributed notification platform is that **notifications are not a single pipeline; they are an asynchronous, multi-priority routing graph decoupled from upstream business services.**

Upstream services (Auth, Checkout, Social, Billing) must never call third-party notification vendors synchronously, and they must never share a single message queue. An upstream service simply emits a standardized notification request (`POST /v1/notifications/send` or an internal Kafka domain event) and receives a `202 Accepted` response in under 10 milliseconds.

Everything that follows—user preference resolution, quiet-hour calculations, multi-device fan-out, template compilation, localized rendering, rate limiting, deduplication, priority queue routing, provider failover, and delivery tracking—executes asynchronously across isolated, independently scaled worker pools.

If a marketing blast fires 20 million messages or SendGrid experiences an outage, the high-priority OTP pipeline continues processing at sub-second latency with zero queue contention.

---

## 3. High-Level Architecture — Components and Why Each Exists

```txt
[ Upstream Services ] (Auth, Payments, Social, Marketing)
         │
         ▼  (gRPC / HTTP REST API with Idempotency Key)
[ Notification Ingestion API Gateway ]
         │ ── Token Bucket Rate Limiting (Redis)
         │ ── Atomic Idempotency Check (Redis SETNX)
         │ ── Request Validation & Auth
         ▼
[ Notification Dispatcher & Rule Engine ]
         ├── Lookup [ User Preferences & Quiet Hours (PostgreSQL / Redis Cache) ]
         ├── Lookup [ Active Device Tokens (DynamoDB / PostgreSQL) ]
         ├── Lookup [ Localized Template Engine (S3 / In-Memory Cache) ]
         ▼
[ Partitioned Priority Message Queues (Kafka / AWS SQS) ]
  ├── [ High-Priority Queue ]    (OTP, Security, Password Reset, Payment)
  ├── [ Medium-Priority Queue ]  (Direct Messages, Mentions, Order Tracking)
  └── [ Low-Priority Queue ]     (Marketing Blasts, Newsletter, Weekly Digest)
         │
         ▼
[ Channel Worker Fleets (Independent Auto-scaling Pools) ]
  ├── [ Push Workers ]   ──► APNs (Apple) / FCM (Google)
  ├── [ SMS Workers ]    ──► Twilio / AWS SNS (with Circuit Breaker & Failover)
  ├── [ Email Workers ]  ──► SendGrid / AWS SES / Postmark
  └── [ In-App Workers ] ──► Redis Pub/Sub ──► WebSocket Gateway Fleet ──► Active Client Apps
         │
         ▼
[ Tracking, Observability & Resilience ]
  ├── [ Delivery Status & Inbox DB (DynamoDB / PostgreSQL) ]
  ├── [ Analytics & Audit Log (ClickHouse) ]
  └── [ Dead-Letter Queue (DLQ) & Retry Worker (Exponential Backoff + Jitter) ]
```

**How Data Flows End-to-End:**

1. **Notification Ingestion API Gateway:** Upstream services call `POST /v1/notifications/send` with a unique `idempotency_key`, target `user_id`, notification `type`, `priority`, and dynamic `payload_data`. The gateway validates the request, runs a fast Redis idempotency check, writes an initial tracking record, and immediately returns `202 Accepted` with a `notification_id`.
2. **Notification Dispatcher & Rule Engine:**
   - Checks the **User Preference Matrix** to confirm whether the user has enabled this channel/category.
   - Checks the **Quiet Hours Engine** against the recipient's local timezone. If it is currently quiet hours and the notification is not marked `HIGH_PRIORITY`, the job is scheduled for future delivery via a delayed queue.
   - Applies **Smart Collapsing / Aggregation** if multiple related events arrive within a debounce window.
   - Resolves active device tokens for the user and renders localized templates with dynamic payload parameters.
3. **Partitioned Priority Message Queues:** The dispatcher routes compiled notification tasks into physically isolated queues based on priority (`High`, `Medium`, `Low`). High-priority queues have strict queue-depth alarms and dedicated consumer pools that are never touched by bulk marketing traffic.
4. **Channel-Specific Worker Fleets:** Stateless worker pools consume from their designated channel queues. Each worker formats the vendor-specific payload (e.g., APNs HTTP/2 headers, SendGrid JSON body), applies client-side circuit breakers, manages rate-limiting against provider quotas, and executes the external network call.
5. **In-App Real-Time Gateway:** For in-app notifications, worker nodes write the notification to the user's persistent inbox table and publish a lightweight event to a Redis Pub/Sub backplane. Horizontally scaled WebSocket servers listen to the user's channel and push the badge/toast directly to active mobile/web sessions.
6. **Delivery Tracker & Dead-Letter Queue (DLQ):** Downstream vendors deliver asynchronous delivery receipts via webhooks. Tracking workers update notification states (`QUEUED` -> `SENT` -> `DELIVERED` -> `READ` or `FAILED`). Messages that fail repeatedly due to transient errors enter an exponential backoff retry loop; unrecoverable poison pills are routed to a Dead-Letter Queue for alerting and manual triage.

---

## 4. Key Technical Decisions — With Real Tradeoffs

**1. Queue Architecture: Physically Segregated Priority Queues vs. Single Shared Broker**
- *Choice:* Partitioned message queues strictly segregated by SLA tier (`High`, `Medium`, `Low`) with separate worker autoscaling policies.
- *Alternatives Considered:* A single shared Kafka topic using priority headers or single RabbitMQ queue with message priority integers.
- *Why:* In a single queue with priority levels, high-volume bursts of millions of low-priority messages still cause head-of-line broker ingestion pressure, partition lag, and resource contention. Physical queue isolation guarantees that even if the low-priority queue has a 20-million-message backlog, high-priority OTPs flow through completely unimpeded.
- *Tradeoff:* Requires managing separate queue topics, monitoring distinct lag metrics, and maintaining independent worker clusters.

**2. Deduplication Strategy: Two-Tier In-Memory Lock + Storage Constraint**
- *Choice:* Fast atomic deduplication in Redis (`SET key value NX EX <ttl>`) at the ingestion layer, backed by a unique composite database index `(user_id, idempotency_key, time_window)`.
- *Alternatives Considered:* Performing a SQL `SELECT` before every `INSERT` or relying solely on client-side debouncing.
- *Why:* Duplicate requests often arrive within milliseconds of each other (e.g., a user double-clicking a "Send OTP" button or an upstream network retry). Redis `SETNX` intercepts duplicate calls in under 1 millisecond without locking relational database rows.
- *Tradeoff:* Consumes Redis memory for storing key hashes over a rolling 24-hour TTL window. If Redis experiences a node restart, the underlying database unique constraint acts as the safety net.

**3. Storage Engine: Polyglot Persistence (PostgreSQL + DynamoDB + ClickHouse)**
- *Choice:* PostgreSQL for relational configuration (user preferences, notification templates, channel rules); DynamoDB for user notification inbox feeds; ClickHouse for time-series delivery analytics and audit logs.
- *Alternatives Considered:* Storing everything in a single PostgreSQL database or using MongoDB for all data.
- *Why:* User preferences are relational, read-heavy, and require ACID transactional consistency during updates. In-app notification inboxes, however, are high-throughput time-series feeds partitioned cleanly by `user_id`. Delivery audit logs generate hundreds of millions of append-only rows daily, which would rapidly bloat relational tables and degrade indexing performance.
- *Tradeoff:* Managing three distinct database systems increases operational overhead and infrastructure complexity, but prevents analytics reporting from degrading production user preference lookups.

**4. In-App Notification Delivery: WebSockets with Redis Pub/Sub vs. Client HTTP Polling**
- *Choice:* Persistent WebSockets managed by stateful gateway servers backed by Redis Pub/Sub for real-time notification push, combined with cursor-based REST API pagination for inbox history.
- *Alternatives Considered:* Client short-polling (e.g., polling every 5 seconds) or long-polling.
- *Why:* At 10 million DAU, client polling generates tens of thousands of wasted HTTP requests every second, placing unnecessary load on databases and API gateways. WebSockets deliver instant notifications with zero client polling overhead.
- *Tradeoff:* Maintaining millions of concurrent idle WebSocket connections requires careful connection management, heartbeat ping/pongs, and graceful connection draining during server deployments.

---

## 5. Deep Dives — The Parts That Actually Matter

### Deep Dive 1: Deduplication and Idempotency at Scale

Duplicate notifications destroy user trust and cost money (especially on SMS). Deduplication must happen at two distinct points: at the **Ingestion Gateway** and at the **Channel Worker**.

```typescript
import { Redis } from 'ioredis';
import crypto from 'crypto';

interface NotificationRequest {
  userId: string;
  eventType: string;
  entityId: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

class IngestionDeduplicator {
  constructor(private redis: Redis) {}

  // Generate a deterministic idempotency hash if the client did not provide one
  private generateDeduplicationKey(req: NotificationRequest): string {
    if (req.idempotencyKey) {
      return `idemp:${req.userId}:${req.idempotencyKey}`;
    }
    // Time-bucketed hash (e.g. 60-second window for rapid duplicate actions)
    const timeBucket = Math.floor(Date.now() / 60000);
    const rawSignature = `${req.userId}:${req.eventType}:${req.entityId}:${timeBucket}`;
    const hash = crypto.createHash('sha256').update(rawSignature).digest('hex');
    return `idemp:${req.userId}:${hash}`;
  }

  async shouldProcessNotification(req: NotificationRequest): Promise<{ shouldProcess: boolean; trackingId: string }> {
    const key = this.generateDeduplicationKey(req);
    const trackingId = crypto.randomUUID();

    // Atomic SET if Not Exists with a 24-hour expiration (86400 seconds)
    const acquired = await this.redis.set(key, trackingId, 'EX', 86400, 'NX');

    if (!acquired) {
      // Duplicate detected! Return existing tracking ID to caller
      const existingTrackingId = await this.redis.get(key);
      return { shouldProcess: false, trackingId: existingTrackingId || 'DUPLICATE' };
    }

    return { shouldProcess: true, trackingId };
  }
}
```

At the **Channel Worker level**, before calling an external vendor (like Twilio or Stripe), the worker passes the `idempotencyKey` directly in the vendor's API request header. If the worker crashes immediately after sending the network call but before acknowledging the message queue, the subsequent retry will send the identical idempotency key to Twilio, preventing double-billing and duplicate SMS transmission.

### Deep Dive 2: Preference Matrices, Quiet Hours & Smart Collapsing

A notification cannot be sent simply because an event occurred. It must pass through a multi-layer evaluation pipeline:

```txt
Incoming Event
      │
      ▼
[ 1. User Preference Check ] ── Opted out of channel/category? ──► DROP
      │ (Allowed)
      ▼
[ 2. Critical Priority Check ] ── Is OTP / Security alert? ─────► SEND IMMEDIATELY
      │ (Non-Critical)
      ▼
[ 3. Quiet Hours Check ] ────── Is 10 PM - 8 AM in user TZ? ───► DELAY QUEUE (Schedule for 8:00 AM)
      │ (Within Active Hours)
      ▼
[ 4. Smart Aggregation Check ] ─ Multiple likes/comments? ─────► DEBOUNCE & COLLAPSE
      │ (Ready)
      ▼
[ Enqueue to Channel Worker ]
```

**1. The Preference Matrix:**
Stored in PostgreSQL with an in-memory Redis cache layer. The schema maps `user_id × notification_category × channel` with inheritance:
- Global Switch: Master mute on/off.
- Category Level: `MARKETING = OFF`, `TRANSACTIONAL = ON`, `SOCIAL = ON`.
- Channel Level: `SMS = OFF`, `PUSH = ON`, `EMAIL = ON`.

**2. Timezone-Aware Quiet Hours:**
For non-critical notifications, the dispatcher looks up the recipient's timezone offset (e.g., `America/New_York` or `UTC+5:30`). If the current local time falls between 22:00 and 08:00:
- The system calculates the target Unix timestamp for 08:05 AM in the user's local timezone.
- The notification job is inserted into a Redis Sorted Set (`ZADD scheduled_notifications <target_timestamp> <payload_json>`) or an AWS SQS Delayed Message.
- A background scheduler periodically queries `ZRANGEBYSCORE scheduled_notifications 0 <current_timestamp>` and releases matured jobs into the active queue.

**3. Smart Collapsing (Notification Debouncing):**
When a high-frequency social event occurs (e.g., 20 users liking a photo within 3 minutes), sending 20 push notifications causes user fatigue.
- When like event #1 arrives: Enqueue an aggregation job with a 5-minute delay and store `post:123:likes = [user_1]` in Redis.
- When like events #2 through #20 arrive: Simply append `post:123:likes` in Redis (`RPUSH`).
- When the 5-minute timer expires: The worker reads the list length, formats a single consolidated message ("Alice, Bob, and 18 others liked your post"), and dispatches 1 push notification.

### Deep Dive 3: Multi-Provider Failover and Circuit Breaking

Third-party notification vendors experience downtime, elevated latency, and rate-limiting 429s. If a worker fleet makes blocking HTTP calls to a degraded provider, worker threads exhaust their connection pools, causing the entire notification service to stall.

```typescript
enum CircuitState {
  CLOSED,   // Normal operation: traffic flows to Primary Provider
  OPEN,     // Provider degraded: traffic automatically diverted to Secondary Provider
  HALF_OPEN // Testing recovery: sending small canary sample to Primary
}

class ProviderCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private readonly failureThreshold = 10;
  private readonly resetTimeoutMs = 30000;
  private lastStateChange = Date.now();

  constructor(
    private primarySender: (msg: unknown) => Promise<void>,
    private secondarySender: (msg: unknown) => Promise<void>
  ) {}

  async sendWithFailover(message: unknown): Promise<void> {
    this.evaluateState();

    if (this.state === CircuitState.OPEN) {
      // Primary is down; route directly to secondary vendor (e.g., AWS SNS instead of Twilio)
      return await this.secondarySender(message);
    }

    try {
      await this.primarySender(message);
      if (this.state === CircuitState.HALF_OPEN) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
      }
    } catch (err) {
      this.failureCount++;
      if (this.failureCount >= this.failureThreshold) {
        this.state = CircuitState.OPEN;
        this.lastStateChange = Date.now();
      }
      // Fallback immediately on failure
      await this.secondarySender(message);
    }
  }

  private evaluateState(): void {
    if (this.state === CircuitState.OPEN && Date.now() - this.lastStateChange > this.resetTimeoutMs) {
      this.state = CircuitState.HALF_OPEN;
    }
  }
}
```

### Deep Dive 4: Device Token Lifecycle & Invalidation

Users upgrade phones, uninstall apps, or revoke push permissions. When APNs or FCM attempts to deliver a push notification to an invalid token, they return specific status codes:
- Apple APNs: HTTP `410 Gone` (Device token is no longer active for the topic) or HTTP `400 BadDeviceToken`.
- Google FCM: `UNREGISTERED` or `INVALID_ARGUMENT`.

If the system continues sending push notifications to dead tokens, APNs and FCM will throttle your entire organization's API quota.
- When a push worker receives a `410 Gone` or `UNREGISTERED` status, it immediately publishes a `TokenInvalidatedEvent(userId, deviceToken)`.
- An asynchronous token cleanup consumer flags `is_active = false` or deletes the token record from the `user_devices` database table.
- Future push dispatches for that user will bypass the dead device until the user logs in and registers a fresh APNs/FCM token.

---

## 6. Failure Modes and Resilience

**1. Downstream 3rd-Party Provider Outage (e.g., SendGrid / Twilio Outage)**
- *What Breaks:* Provider APIs return HTTP 500/503 or experience 10-second connection timeouts. Workers get stuck waiting for responses.
- *User Impact:* SMS and emails fail to deliver or arrive significantly delayed.
- *Resilience:* The client-side circuit breaker trips after 10 consecutive failures and automatically shifts traffic to a secondary vendor (e.g., Twilio -> AWS SNS; SendGrid -> AWS SES). Transient failures are requeued with exponential backoff and randomized jitter (`delay = min(max_delay, base * 2^attempt + random_jitter)`).

**2. Head-of-Line Queue Blocking During Marketing Blasts**
- *What Breaks:* A sudden broadcast of 30 million promotional push notifications fills the queue.
- *User Impact:* Critical security alerts, password resets, and two-factor authentication codes get stuck at the back of the queue for hours.
- *Resilience:* Strict physical isolation of queues. High-priority messages travel on dedicated message topics with independent compute pools. The high-priority queue depth is monitored independently; if lag exceeds 500 messages, alerts trigger immediately.

**3. Poison Pill Messages (Malformed Payloads / Unhandled Template Crashes)**
- *What Breaks:* A notification payload contains invalid JSON or missing template variables that trigger an unhandled runtime exception in the worker. The worker crashes, restarts, re-reads the same message from the queue, and crashes again in an infinite loop.
- *User Impact:* The entire consumer partition stalls, blocking valid messages behind the corrupted one.
- *Resilience:* The message envelope carries a `retry_count` metadata header. If `retry_count >= 3`, the worker catches the error, wraps the message with the stack trace, routes it to a **Dead-Letter Queue (DLQ)**, and acknowledges the message on the primary queue to advance the partition offset.

**4. Reconnection Storm on WebSocket Gateway Failure**
- *What Breaks:* A WebSocket server hosting 200,000 active connections crashes. All 200,000 clients simultaneously attempt to reconnect to the remaining gateway fleet.
- *User Impact:* The flood of simultaneous TLS handshakes, token authentications, and unread notification queries overwhelms the API gateways and databases (thundering herd).
- *Resilience:* Mobile and web clients implement reconnect logic with **Exponential Backoff and Full Jitter**. Unread notification counts are cached as integer counters in Redis (`user:123:unread_count`), allowing clients to fetch badge counts in O(1) time without triggering heavy SQL queries upon reconnection.

**5. Consumer Crash After Provider Delivery (Duplicate Delivery Risk)**
- *What Breaks:* A worker successfully triggers an SMS via Twilio, but crashes or suffers a network partition before it can acknowledge the message in Kafka/SQS. The broker redelivers the message to another worker.
- *User Impact:* The user receives duplicate text messages and the company gets billed twice.
- *Resilience:* Workers store a short-lived execution lock in Redis (`SET sent:notif_id 1 EX 86400 NX`) immediately before firing the vendor request. Furthermore, the vendor request includes a unique `Idempotency-Key` header so third-party gateways recognize and ignore the redundant request.

---

## 7. What Makes a Great Answer vs an Average One

| Evaluation Axis | Average Answer | Great Senior Answer |
|---|---|---|
| **Queue Architecture** | Draws a single generic queue connecting the API to workers; assumes priority is just an integer field. | Segregates queues physically into High, Medium, and Low priority tiers with dedicated worker autoscaling groups to prevent marketing blasts from blocking 2FA/OTPs. |
| **Deduplication** | Mentions "we will deduplicate" without explaining where or how it is enforced. | Details a two-tier strategy: in-memory atomic Redis `SETNX` at the ingestion gateway, plus vendor-level idempotency keys to prevent duplicate billing during worker crash retries. |
| **Provider Resilience** | Treats third-party APIs (APNs, Twilio, SendGrid) as 100% reliable black boxes. | Implements automated circuit breaking, multi-vendor failover (Twilio <-> AWS SNS, SendGrid <-> SES), exponential backoff with jitter, and dead-letter queues for poison pills. |
| **User Experience & Compliance** | Treats all notifications as instant push events. | Incorporates user preference matrices (category x channel), timezone quiet hours with delayed queue rescheduling, and smart aggregation/collapsing for high-frequency social events. |
| **Device & Token Management** | Assumes a user equals a phone number or single device. | Handles multi-device fan-out per user, listens to APNs/FCM feedback loops (`410 Gone`, `Unregistered`), and asynchronously prunes dead tokens to prevent provider quota throttling. |
| **Storage Architecture** | Puts all notifications, logs, and preferences into a single SQL database. | Applies polyglot persistence: PostgreSQL for relational preferences and templates, DynamoDB for high-throughput inbox feeds, and ClickHouse for delivery analytics and audit logs. |

---

## 8. 🧠 The Memory Hook

**"Isolate by priority, deduplicate with keys, failover by circuit breaker."**

Think of a notification system as an **Airport Priority Lane**: VIP passengers (critical 2FA OTPs and security alerts) move through an open, dedicated express lane with zero waiting, while tourist charter flights (promotional marketing blasts) board through the main terminal with strict luggage quotas. If a runway is blocked (third-party provider outage), air traffic control immediately diverts planes to an alternate airstrip (secondary backup vendor) without ever grounding the fleet.
