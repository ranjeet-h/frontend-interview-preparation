# Designing Notification APIs: Multi-Channel Fanout, User Preferences, and Rate-Limited Queues

## 1. Why This Exists — The Problem First

Imagine an e-commerce customer placing an order during a Black Friday flash sale. In a naive backend, the checkout handler does everything synchronously in a single request:

```typescript
// The naive synchronous trap inside an order completion endpoint
app.post("/api/v1/orders/checkout", async (req, res) => {
  const order = await db.orders.create(req.body);
  
  // Synchronous third-party HTTP calls directly blocking the user's response
  await sendgrid.sendEmail({ to: req.user.email, template: "order_receipt", order });
  await twilio.sendSMS({ to: req.user.phone, body: `Order #${order.id} confirmed!` });
  await fcm.sendPushNotification({ token: req.user.fcmToken, title: "Order Confirmed" });
  await db.inAppNotifications.create({ userId: req.user.id, message: "Order placed" });
  
  res.status(201).json({ success: true, orderId: order.id });
});
```

Here is how this breaks in production within forty-eight hours:

1. **Cascading Latency & Gateway Timeouts:** SendGrid experiences a transient 6-second API latency spike. Twilio rate-limits your account with a `429 Too Many Requests`. The checkout endpoint hangs for 9 seconds. The user's mobile app hits a network timeout, so the user frantically taps "Place Order" three more times. Your database now has duplicate orders, the user is charged three times, and your payment support queue explodes.
2. **Priority Starvation (The OTP Crisis):** Marketing launches a promotional campaign broadcasting 500,000 flash sale push notifications. All notifications sit in a single shared queue. In the middle of this blast, another user tries to log in with two-factor authentication (2FA). Their 6-digit SMS verification code is queued behind 400,000 marketing messages. The user waits 18 minutes for a code that expires in 5 minutes, permanently locked out of their account.
3. **The Push Notification Storm (User Churn):** A user publishes a viral video or post. Over the next three minutes, 80 people leave a comment. The backend blindly fires 80 individual push notifications to the author's smartphone. The phone vibrates uncontrollably in their pocket for two minutes straight until the user angrily disables all notifications for your app in iOS settings—or uninstalls the app entirely.
4. **The Stale Preference Race Condition:** A user unchecks "Marketing Emails" in their account settings at 2:00 PM. A marketing batch job that fetched user records at 1:55 PM still dispatches promotional emails to them at 2:05 PM. The user flags your email as spam, destroying your domain reputation and violating GDPR/CAN-SPAM regulations.
5. **Database Meltdown on Badge Counts:** To show the little red unread badge icon in the app navigation bar, the frontend fires `GET /api/v1/notifications/unread-count`. The backend executes `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`. For an active user with 15,000 notifications accumulated over two years, this query scans thousands of rows on every single page navigation, locking database buffer pools and dragging down overall throughput.

Notification APIs exist to solve this entire web of operational failures. They decouple event ingestion from delivery side effects, orchestrate multi-channel fanout (Email, SMS, Push, In-App), enforce granular user preference matrices, aggregate rapid-fire events into digests, protect downstream third-party quotas with priority queues, and deliver instant in-app feeds without database degradation.

---

## 2. The Analogy — Make It Obvious

Think of a production notification system as a **Modern Central Postal Logistics Hub & Personalized Delivery Switchboard**:

```txt
[ Business Event ] ──────► [ Intake Counter (202 Accepted) ]
                                   │
                                   ▼
                         [ Sorting Switchboard ]
                         ├── Checks Preference Matrix & DND
                         ├── Checks Aggregation Holding Trays
                         └── Checks Rate Limits & Frequency Caps
                                   │
                    ┌──────────────┼──────────────┬──────────────┐
                    ▼              ▼              ▼              ▼
              [Diamond Lane] [Express Van] [Cargo Truck] [P.O. Box]
                 (Tier 0)       (Push)        (Email)       (In-App)
                 2FA / OTP     APNs / FCM    SendGrid/SES   WebSocket
```

1. **The Intake Counter (The Ingestion API):** When a customer drops off a package at the postal counter, the clerk does not personally drive across the country to deliver it before helping the next customer. The clerk stamps the parcel with a unique tracking barcode (`idempotency_key`), hands the customer an immediate receipt stamped "Accepted for processing" (`202 Accepted`), and drops the package onto a high-speed conveyor belt. The transaction finishes in 20 milliseconds.
2. **The Recipient Preference Ledger (The Preference Engine):** Before any mail carrier leaves the building, the parcel passes an automated scanner that checks the recipient's registered rules. Did the recipient opt out of paper advertisements? Is it 3:00 AM in the recipient's timezone and they have "Quiet Hours" enabled? If it is a promotional flyer, the sorter holds or shreds it. But if the parcel is marked **"URGENT: Legal / Security Document" (2FA OTP)**, it bypasses all holds and opt-outs immediately.
3. **The Aggregation Holding Tray (The Debounce Engine):** If 30 postcards arrive for the same resident within ten minutes, the postal hub does not dispatch 30 separate delivery vans to ring the resident's doorbell 30 times in a row. Instead, the sorter places incoming postcards into a temporary holding tray for five minutes. When the timer expires, the sorter bundles all 30 postcards into a single envelope ("Alex and 29 others sent you cards") and dispatches one single delivery.
4. **The Specialized Delivery Fleet (Channel Workers):**
   - **The Supersonic Courier (SMS / Twilio):** High priority, instant, but expensive per unit. Used for time-critical alerts.
   - **The Freight Transport (Email / SendGrid / SES):** Heavyweight payloads carrying rich HTML layouts and invoices. Higher latency, bulk capacity.
   - **The Local Bicycle Dispatch (Mobile Push / APNs & FCM):** Lightweight, immediate, but requires valid device registration tokens.
   - **The Private Lobby Pigeonhole (In-App Feed & WebSockets):** Slips a notice into the user's personal lockbox in the lobby, turning a physical counter wheel to update their unread badge count instantly.
5. **The Diamond Lane vs the Cargo Lane (Priority Queues):** Emergency medical dispatches (2FA login codes) travel in a dedicated, uncongested express lane. Thousands of bulky holiday sales catalogs (marketing broadcasts) travel in a separate cargo lane throttled to protect highway capacity.

---

## 3. How It Actually Works — The Full Explanation

A production notification architecture operates across five distinct phases: Ingestion, Orchestration & Fanout, Aggregation, Channel Execution, and In-App Feed Management.

```txt
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 NOTIFICATION ARCHITECTURE PIPELINE                                     │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘

 [ Client / Upstream Service ]
              │
              │ POST /api/v1/notifications/dispatch (Idempotency-Key: "evt_987")
              ▼
 ┌───────────────────────────┐
 │   Ingestion API Gateway   │ ──► Verify API Key / HMAC Signature
 │     (Returns 202)         │ ──► Check Idempotency Key in Redis (SET NX EX)
 └─────────────┬─────────────┘
               │ Enqueue Raw Event
               ▼
 ┌───────────────────────────┐
 │   Ingestion Queue/Kafka   │
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐      ┌──────────────────────────────┐
 │   Fanout Orchestrator     │ ◄──► │ User Preferences & DB Cache  │
 │     Worker Pool           │      │ (Channel x Category Matrix)  │
 └─────────────┬─────────────┘      └──────────────────────────────┘
               │
   ┌───────────┴───────────────────────┬──────────────────────────────┐
   │                                   │                              │
   ▼ (Aggregatable?)                   ▼ (Evaluate Preferences)       ▼ (Direct Push)
┌───────────────────────┐   ┌───────────────────────────────┐   ┌──────────────────────────┐
│  Redis Debounce Tray  │   │   Frequency Capping Check     │   │   In-App Notification    │
│ (Sliding Window TTL)  │   │  (Sliding Window Push Limit)  │   │   Database Insert        │
└──────────┬────────────┘   └──────────────┬────────────────┘   └────────────┬─────────────┘
           │ Trigger Digest                │ Pass Throttle                   │
           └───────────────────────┬───────┘                                 ▼
                                   │                             ┌─────────────────────────┐
                                   │ Enqueue by Channel/Priority │ Redis Atomic Counter    │
                                   ▼                             │ (INCR unread_count)     │
┌────────────────────────────────────────────────────────────┐   └───────────┬─────────────┘
│                   CHANNEL PRIORITY QUEUES                  │               │
│  [Tier 0: Critical/OTP] ──► SMS Workers (Twilio/Infobip)   │               ▼
│  [Tier 1: Transactional] ─► Push Workers (APNs / FCM)      │   ┌─────────────────────────┐
│  [Tier 2: Social/Feed] ───► Email Workers (SendGrid/SES)   │   │ WebSocket / SSE Server  │
│  [Tier 3: Marketing/Bulk] ─► Webhook Workers (HTTP POST)   │   │ (Push to Active Client) │
└────────────────────────────────────────────────────────────┘   └─────────────────────────┘
```

---

### Phase 1: Ingestion API & Idempotency Pipeline

The ingestion API acts as a high-throughput, non-blocking gateway. It validates payloads, verifies security, guarantees idempotency, and immediately acknowledges receipt.

1. **HTTP Handshake:** The client sends `POST /api/v1/notifications/dispatch` with an `Idempotency-Key` header.
2. **Idempotency Check:** The gateway executes an atomic Redis command:
   ```txt
   SET idempotency:notification:evt_987 "PROCESSING" NX EX 86400
   ```
   If the key already exists, the server returns the cached response or a `409 Conflict / 202 Accepted` to prevent duplicate processing.
3. **Immediate Acknowledgement:** The gateway publishes the unparsed event to an ingestion message broker (Kafka topic or Redis/RabbitMQ queue) and returns `202 Accepted` with a tracking payload:
   ```json
   {
     "status": "accepted",
     "trackingId": "notif_01J8K3M9Z4X7Q",
     "createdAt": "2026-08-27T10:15:30.000Z"
   }
   ```
   The upstream caller is unblocked within 15–25 milliseconds.

---

### Phase 2: Fanout Orchestrator & User Preference Matrix

The Fanout Orchestrator is the central brain. It consumes raw events from the ingestion queue and resolves the delivery plan:

```txt
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 USER PREFERENCE MATRIX                                       │
├─────────────────────┬──────────────┬──────────────┬──────────────┬──────────────┬────────────┤
│ Category            │ In-App Feed  │ Mobile Push  │ Email        │ SMS          │ Bypasses?  │
├─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼────────────┤
│ SECURITY_ALERT / OTP│ ALWAYS ON    │ ALWAYS ON    │ ALWAYS ON    │ ALWAYS ON    │ YES (Hard) │
│ BILLING_TRANSACTION │ Enabled      │ Enabled      │ Enabled      │ Opt-In       │ Partial    │
│ SOCIAL_ACTIVITY     │ Enabled      │ Opt-In       │ Opt-Out      │ Opt-Out      │ NO         │
│ MARKETING_PROMO     │ Opt-Out      │ Opt-Out      │ Opt-In       │ Opt-Out      │ NO         │
└─────────────────────┴──────────────┴──────────────┴──────────────┴──────────────┴────────────┘
```

1. **Critical Category Bypass:** If `category === 'SECURITY_ALERT'` or `'2FA_OTP'`, all opt-out toggles and quiet hour checks are completely bypassed. Security notifications cannot be suppressed.
2. **Preference Resolution at Execution Time:** Preferences are evaluated at worker runtime, not when the event was originally enqueued. If a job sat in a queue for 30 seconds while the user toggled off SMS alerts, the worker checks the latest preference snapshot and suppresses the SMS.
3. **Timezone-Aware Quiet Hours:** Users can configure "Do Not Disturb" (e.g., 10:00 PM to 8:00 AM). The worker calculates the user's local time using their stored IANA timezone (`America/Los_Angeles`). If the current time falls inside quiet hours and the event is non-critical, the job is re-scheduled to a delayed queue for delivery at 8:01 AM local time.
4. **Frequency Capping (Anti-Fatigue Filter):** To prevent push fatigue, the orchestrator checks a Redis sliding window counter:
   ```txt
   ZREMRANGEBYSCORE push_rate:user_123 0 (now - 3600)
   ZCARD push_rate:user_123
   ```
   If the user has received more than 4 non-critical push notifications in the last 60 minutes, subsequent social push notifications are dropped or converted to silent in-app feed items.

---

### Phase 3: Notification Aggregation & Digest Engine (Smart Debouncing)

When multiple related events happen within a short timeframe (e.g., 20 people liking your photo), sending 20 push notifications damages user experience. The aggregation engine collapses them into one:

```txt
Event 1: "Alice liked your post"   ──┐
Event 2: "Bob liked your post"     ──┼──► [ Redis Sliding Window ] ──► "Alice, Bob, and 18 others
Event 3: "Charlie liked your post" ──┘       (5 Minute Window)             liked your post"
```

1. **The Aggregation Key:** When an aggregatable event occurs, the worker derives a grouping key:
   `digest:{userId}:{resourceType}:{resourceId}:{action}` (e.g., `digest:user_42:post_991:like`).
2. **Atomic Set Ingestion:** The worker adds the actor's ID to a Redis Set:
   ```txt
   SADD digest:user_42:post_991:like "actor_101"
   EXPIRE digest:user_42:post_991:like 300
   ```
3. **Delayed Dispatch Timer:** If this is the first item added to the set (detected via return value of `SADD` or checking a companion lock key), the worker schedules an aggregation flush job in BullMQ/Celery with a 5-minute delay (`delay: 300000`).
4. **Digest Generation:** When the delayed job fires:
   - It reads all actors using `SMEMBERS digest:user_42:post_991:like`.
   - If count is 1: *"Alice liked your post."*
   - If count is 2: *"Alice and Bob liked your post."*
   - If count is 20: *"Alice, Bob, and 18 others liked your post."*
   - Deletes the Redis key and dispatches a single rendered notification across enabled channels.

---

### Phase 4: Priority Queues, Worker Pools, and Provider Resilience

Channel workers communicate with external third-party APIs (Twilio, SendGrid, Apple APNs, Firebase Cloud Messaging). These third-party APIs introduce rate limits, network partitions, and token invalidations.

```txt
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                PRIORITY QUEUE LANES                                    │
├─────────────────┬──────────────────────────────┬──────────────────┬────────────────────┤
│ Priority Tier   │ Notification Type            │ Concurrency Pool │ Max Target Latency │
├─────────────────┼──────────────────────────────┼──────────────────┼────────────────────┤
│ Tier 0: Critical│ 2FA OTP, Password Reset, Fraud│ Dedicated / High │ < 1 second         │
│ Tier 1: High    │ Order Confirmations, Receipts│ Standard         │ < 5 seconds        │
│ Tier 2: Normal  │ Comments, Mentions, Follows  │ Dynamic Autoscaled│ < 30 seconds      │
│ Tier 3: Low     │ Marketing, Weekly Digests    │ Throttled / Batch│ < 30 minutes       │
└─────────────────┴──────────────────────────────┴──────────────────┴────────────────────┘
```

1. **Provider Rate Limiting (Token Bucket):** SMS carriers restrict throughput per phone number (e.g., 10 SMS/sec for 10DLC long codes; 100 SMS/sec for short codes). Channel workers enforce client-side token bucket limiters to ensure outgoing requests never exceed provider thresholds.
2. **Circuit Breakers & Automatic Failover:** If SendGrid begins returning `500 Internal Server Error` or times out on 25% of requests over a 30-second window, the circuit breaker opens and reroutes outgoing email traffic to a secondary provider (e.g., AWS SES or Postmark).
3. **Exponential Backoff with Jitter:** Transient network failures trigger retries with truncated exponential backoff and randomized jitter to prevent the "thundering herd" problem against provider APIs:
   $$t_{\text{retry}} = \min(t_{\text{max}}, t_{\text{base}} \times 2^{\text{attempt}}) + \text{random\_jitter}$$
4. **Dead Letter Queue (DLQ):** After 5 failed attempts, the job is moved to a DLQ for operational inspection, triggering an alert if DLQ volume spikes.
5. **The Device Token Feedback Loop:** When sending push notifications via Apple APNs (HTTP/2 API) or FCM:
   - If APNs returns `410 Gone` or FCM returns `UNREGISTERED` / `INVALID_ARGUMENT`, it means the user has uninstalled the app or the token has rotated.
   - The worker must immediately flag the device token in PostgreSQL as `is_active = false` or delete it.
   - Failure to purge dead tokens degrades push deliverability scores and burns provider bandwidth.

---

### Phase 5: In-App Feed Architecture & Unread Badge Counts

The In-App Notification Feed requires both persistent storage and real-time delivery to active web/mobile clients.

```txt
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              IN-APP NOTIFICATION DATA MODEL                            │
├───────────────────┬────────────────────────────────────────────────────────────────────┤
│ Column            │ Type & Constraints                                                 │
├───────────────────┼────────────────────────────────────────────────────────────────────┤
│ id                │ UUIDv7 / ULID (Time-sortable primary key)                          │
│ user_id           │ UUID (Indexed, tenant/user partition)                              │
│ actor_id          │ UUID (Optional: who triggered the notification)                    │
│ category          │ VARCHAR(32) ('transactional', 'social', 'system')                  │
│ title             │ VARCHAR(255)                                                       │
│ body              │ TEXT                                                               │
│ action_url        │ VARCHAR(512)                                                       │
│ is_read           │ BOOLEAN DEFAULT FALSE (Indexed composite: user_id, is_read)        │
│ read_at           │ TIMESTAMPTZ NULL                                                   │
│ created_at        │ TIMESTAMPTZ NOT NULL (Indexed composite: user_id, created_at DESC) │
└───────────────────┴────────────────────────────────────────────────────────────────────┘
```

1. **Denormalized Unread Badge Counter:**
   - Querying `SELECT COUNT(*) WHERE user_id = $1 AND is_read = false` on every page load is an anti-pattern that causes massive I/O bottlenecks.
   - Instead, the unread count is maintained in an atomic Redis integer: `user:{userId}:unread_count`.
   - When a new in-app notification is inserted, the backend runs `INCR user:{userId}:unread_count`.
   - When a single item is marked read, the backend runs `DECR user:{userId}:unread_count` (flooring at 0).
   - When "Mark All Read" is invoked, the backend executes an atomic `SET user:{userId}:unread_count 0`.
2. **Cursor-Based Feed Pagination:**
   - Feeds use cursor-based pagination using the time-sortable primary key (UUIDv7/ULID) or `(created_at, id)` tuple:
     ```sql
     SELECT id, title, body, action_url, is_read, created_at
     FROM notifications
     WHERE user_id = $1 AND (created_at, id) < ($2, $3)
     ORDER BY created_at DESC, id DESC
     LIMIT 20;
     ```
   - This prevents page drifting and duplicate items when new notifications arrive while the user scrolls.
3. **Real-Time Push via WebSockets / SSE:**
   - When a new notification row is committed, an event is published to Redis Pub/Sub (`PUBLISH user_channel:{userId} notification_payload`).
   - The WebSocket/SSE server cluster listening on that channel receives the message and immediately pushes a lightweight payload to the user's active client connection:
     ```json
     {
       "event": "NOTIFICATION_RECEIVED",
       "unreadCount": 5,
       "notification": {
         "id": "01J8K5P9X7Q1M2N3B4V5C6X7Z8",
         "title": "New Comment",
         "body": "Sarah replied to your thread",
         "actionUrl": "/threads/442#comment-89",
         "createdAt": "2026-08-27T10:20:00.000Z"
       }
     }
     ```

---

## 4. Real Code — See It Working

Here is a production-grade implementation in TypeScript with Express, PostgreSQL schema design, Redis atomic caching, and decoupled queue processing.

### 1. Database Schema & Migration (PostgreSQL)

```sql
-- 1. Notifications Table
CREATE TABLE notifications (
    id VARCHAR(36) PRIMARY KEY, -- ULID or UUIDv7 for natural time-ordering
    user_id UUID NOT NULL,
    actor_id UUID NULL,
    category VARCHAR(32) NOT NULL, -- 'security', 'billing', 'social', 'marketing'
    channel VARCHAR(32) NOT NULL,  -- 'in_app', 'push', 'email', 'sms'
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    action_url VARCHAR(512) NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compound index for lightning-fast cursor-paginated feed queries
CREATE INDEX idx_notifications_user_feed 
ON notifications (user_id, created_at DESC, id DESC);

-- Partial index for unread notifications count fallback/reconciliation
CREATE INDEX idx_notifications_user_unread 
ON notifications (user_id) 
WHERE is_read = FALSE;

-- 2. User Notification Preferences Table
CREATE TABLE user_notification_preferences (
    user_id UUID NOT NULL,
    category VARCHAR(32) NOT NULL,
    in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, category)
);

-- 3. User Registered Devices Table
CREATE TABLE user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    platform VARCHAR(16) NOT NULL, -- 'ios', 'android', 'web'
    device_token VARCHAR(512) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_devices_active 
ON user_devices (user_id) 
WHERE is_active = TRUE;
```

---

### 2. Ingestion Endpoint with Idempotency & Validation

```typescript
// src/api/notification-ingestion.ts
import { Router, Request, Response } from "express";
import { z } from "zod";
import Redis from "ioredis";
import { Queue } from "bullmq";

const router = Router();
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const rawIngestionQueue = new Queue("raw-notifications", { connection: redis });

// Strict payload validation schema
const DispatchNotificationSchema = z.object({
  recipientId: z.string().uuid(),
  category: z.enum(["security_alert", "billing", "social_activity", "marketing"]),
  priority: z.enum(["tier0_critical", "tier1_high", "tier2_normal", "tier3_low"]),
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(2000),
  actionUrl: z.string().url().optional(),
  aggregationKey: z.string().optional(), // e.g. "post_123:likes"
  actorId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

type DispatchPayload = z.infer<typeof DispatchNotificationSchema>;

router.post("/api/v1/notifications/dispatch", async (req: Request, res: Response) => {
  const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
  
  if (!idempotencyKey) {
    return res.status(400).json({
      error: "MISSING_IDEMPOTENCY_KEY",
      message: "Idempotency-Key header is strictly required for notification dispatch."
    });
  }

  // 1. Validate payload schema
  const validationResult = DispatchNotificationSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(422).json({
      error: "VALIDATION_FAILED",
      details: validationResult.error.format()
    });
  }

  const payload: DispatchPayload = validationResult.data;
  const lockKey = `idempotency:dispatch:${idempotencyKey}`;

  // 2. Atomic Redis lock to prevent duplicate concurrent ingestion
  // Returns 'OK' if set, null if key already exists
  const acquired = await redis.set(lockKey, "PROCESSING", "EX", 86400, "NX");
  if (!acquired) {
    // Already received this exact idempotency key within 24 hours
    return res.status(200).json({
      status: "duplicate_ignored",
      message: "Notification event already accepted for processing."
    });
  }

  // 3. Enqueue raw event for asynchronous fanout orchestration
  const trackingId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  await rawIngestionQueue.add(
    "orchestrate-fanout",
    { ...payload, trackingId, idempotencyKey },
    {
      jobId: idempotencyKey, // Prevents duplicate BullMQ jobs
      priority: payload.priority === "tier0_critical" ? 1 : 5, // Lower number = higher priority
      removeOnComplete: 1000,
      removeOnFail: 5000,
    }
  );

  // 4. Return 202 Accepted immediately — total latency ~15ms
  return res.status(202).json({
    status: "accepted",
    trackingId,
    timestamp: new Date().toISOString()
  });
});

export default router;
```

---

### 3. Fanout Orchestrator & Aggregation Engine Worker

```typescript
// src/workers/fanout-orchestrator.ts
import { Worker, Job, Queue } from "bullmq";
import Redis from "ioredis";
import { Pool } from "pg";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Channel-specific queues
const pushQueue = new Queue("channel-push", { connection: redis });
const emailQueue = new Queue("channel-email", { connection: redis });
const smsQueue = new Queue("channel-sms", { connection: redis });

interface FanoutJobData {
  recipientId: string;
  category: "security_alert" | "billing" | "social_activity" | "marketing";
  priority: "tier0_critical" | "tier1_high" | "tier2_normal" | "tier3_low";
  title: string;
  body: string;
  actionUrl?: string;
  aggregationKey?: string;
  actorId?: string;
  trackingId: string;
}

export const fanoutWorker = new Worker(
  "raw-notifications",
  async (job: Job<FanoutJobData>) => {
    const { recipientId, category, priority, title, body, actionUrl, aggregationKey, actorId, trackingId } = job.data;

    // -------------------------------------------------------------
    // Step 1: Notification Aggregation (Debounce Logic)
    // -------------------------------------------------------------
    if (aggregationKey && actorId) {
      const digestRedisKey = `digest:${recipientId}:${aggregationKey}`;
      const isFirstItem = await redis.sadd(digestRedisKey, actorId);
      await redis.expire(digestRedisKey, 300); // 5-minute sliding aggregation window

      if (isFirstItem === 1) {
        // Schedule the delayed aggregation flusher job
        await rawIngestionQueue.add(
          "flush-digest",
          { recipientId, aggregationKey, category, priority, actionUrl, titleTemplate: title },
          { delay: 300000 } // 5 minutes delay
        );
      }
      // Aggregation captured in Redis set; exit early to wait for batch flush
      return { status: "aggregated_in_digest" };
    }

    // -------------------------------------------------------------
    // Step 2: Evaluate User Preferences & Dynamic Channels
    // -------------------------------------------------------------
    const isCritical = category === "security_alert";

    // Query user preferences (cached or from PostgreSQL)
    const prefResult = await db.query(
      `SELECT in_app_enabled, push_enabled, email_enabled, sms_enabled 
       FROM user_notification_preferences 
       WHERE user_id = $1 AND category = $2`,
      [recipientId, category]
    );

    // Default settings if no custom row exists
    const prefs = prefResult.rows[0] || {
      in_app_enabled: true,
      push_enabled: category !== "marketing",
      email_enabled: true,
      sms_enabled: false,
    };

    // -------------------------------------------------------------
    // Step 3: In-App Feed Creation & Real-Time Push
    // -------------------------------------------------------------
    if (isCritical || prefs.in_app_enabled) {
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Insert in-app notification row
      await db.query(
        `INSERT INTO notifications (id, user_id, actor_id, category, channel, title, body, action_url, created_at)
         VALUES ($1, $2, $3, $4, 'in_app', $5, $6, $7, NOW())`,
        [notifId, recipientId, actorId || null, category, title, body, actionUrl || null]
      );

      // Atomically increment unread counter in Redis
      const newUnreadCount = await redis.incr(`user:${recipientId}:unread_count`);

      // Publish to WebSocket gateway via Redis Pub/Sub
      await redis.publish(
        `ws:user:${recipientId}`,
        JSON.stringify({
          type: "NEW_IN_APP_NOTIFICATION",
          unreadCount: newUnreadCount,
          notification: { id: notifId, title, body, actionUrl, createdAt: new Date().toISOString() }
        })
      );
    }

    // -------------------------------------------------------------
    // Step 4: Mobile Push Dispatch with Frequency Capping
    // -------------------------------------------------------------
    if (isCritical || prefs.push_enabled) {
      // Frequency Capping: check non-critical push volume in the last hour
      let allowPush = true;
      if (!isCritical) {
        const hourAgo = Date.now() - 3600000;
        await redis.zremrangebyscore(`push_rate:${recipientId}`, 0, hourAgo);
        const pushCount = await redis.zcard(`push_rate:${recipientId}`);
        
        if (pushCount >= 5) {
          allowPush = false; // Cap exceeded: prevent push spam
        } else {
          await redis.zadd(`push_rate:${recipientId}`, Date.now(), `${trackingId}`);
          await redis.expire(`push_rate:${recipientId}`, 3600);
        }
      }

      if (allowPush) {
        // Fetch active device tokens
        const devices = await db.query(
          `SELECT platform, device_token FROM user_devices WHERE user_id = $1 AND is_active = TRUE`,
          [recipientId]
        );

        for (const device of devices.rows) {
          await pushQueue.add("send-push", {
            token: device.device_token,
            platform: device.platform,
            title,
            body,
            actionUrl,
            priority: isCritical ? "high" : "normal"
          });
        }
      }
    }

    // -------------------------------------------------------------
    // Step 5: Email & SMS Channel Enqueueing
    // -------------------------------------------------------------
    if (isCritical || prefs.email_enabled) {
      await emailQueue.add("send-email", {
        recipientId,
        title,
        body,
        category,
        trackingId
      });
    }

    if (isCritical || prefs.sms_enabled) {
      await smsQueue.add("send-sms", {
        recipientId,
        body,
        priority: isCritical ? "tier0_critical" : "tier2_normal",
        trackingId
      });
    }

    return { status: "fanout_completed" };
  },
  { connection: redis, concurrency: 20 }
);
```

---

### 4. In-App Notification Feed & Mark-Read REST API

```typescript
// src/api/notification-feed.ts
import { Router, Request, Response } from "express";
import { Pool } from "pg";
import Redis from "ioredis";

const router = Router();
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

// Middleware to mock authenticated user context
interface AuthRequest extends Request {
  user?: { id: string };
}

// 1. GET /api/v1/notifications — Cursor-based paginated feed with unread count
router.get("/api/v1/notifications", async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const cursorCreatedAt = req.query.cursorCreatedAt as string | undefined;
  const cursorId = req.query.cursorId as string | undefined;
  const filter = req.query.filter as string | undefined; // 'unread' or 'all'

  // Fetch unread count from Redis O(1) cache
  let unreadCountStr = await redis.get(`user:${userId}:unread_count`);
  let unreadCount = unreadCountStr !== null ? parseInt(unreadCountStr) : null;

  // Fallback to DB count if Redis key expired
  if (unreadCount === null) {
    const countRes = await db.query(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );
    unreadCount = countRes.rows[0].count;
    await redis.set(`user:${userId}:unread_count`, unreadCount, "EX", 3600);
  }

  // Build cursor SQL query
  let query = `
    SELECT id, category, title, body, action_url, is_read, read_at, created_at
    FROM notifications
    WHERE user_id = $1
  `;
  const params: unknown[] = [userId];

  if (filter === "unread") {
    query += ` AND is_read = FALSE`;
  }

  if (cursorCreatedAt && cursorId) {
    params.push(cursorCreatedAt, cursorId);
    query += ` AND (created_at, id) < ($${params.length - 1}, $${params.length})`;
  }

  params.push(limit + 1);
  query += ` ORDER BY created_at DESC, id DESC LIMIT $${params.length}`;

  const { rows } = await db.query(query, params);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const nextCursor = hasMore && items.length > 0 ? {
    cursorCreatedAt: items[items.length - 1].created_at,
    cursorId: items[items.length - 1].id
  } : null;

  return res.json({
    data: items,
    unreadCount,
    pagination: {
      hasMore,
      nextCursor
    }
  });
});

// 2. PATCH /api/v1/notifications/:id/read — Idempotent single mark-read
router.patch("/api/v1/notifications/:id/read", async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const notificationId = req.params.id;

  // Update only if owned by caller AND currently unread
  const result = await db.query(
    `UPDATE notifications 
     SET is_read = TRUE, read_at = NOW() 
     WHERE id = $1 AND user_id = $2 AND is_read = FALSE
     RETURNING id`,
    [notificationId, userId]
  );

  // If a row was actually updated from unread to read, decrement Redis counter
  if (result.rowCount && result.rowCount > 0) {
    const updatedCount = await redis.decr(`user:${userId}:unread_count`);
    // Ensure counter never dips below 0
    if (updatedCount < 0) {
      await redis.set(`user:${userId}:unread_count`, 0);
    }
  } else {
    // Check if notification exists under another user to avoid information leakage
    const checkExists = await db.query(`SELECT id, user_id FROM notifications WHERE id = $1`, [notificationId]);
    if (!checkExists.rows.length || checkExists.rows[0].user_id !== userId) {
      // Return 404 instead of 403 to prevent resource enumeration
      return res.status(404).json({ error: "NOT_FOUND", message: "Notification not found." });
    }
  }

  return res.json({ success: true, id: notificationId, isRead: true });
});

// 3. POST /api/v1/notifications/mark-all-read — Bulk mark-read
router.post("/api/v1/notifications/mark-all-read", async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  await db.query(
    `UPDATE notifications 
     SET is_read = TRUE, read_at = NOW() 
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );

  // Reset Redis badge count to 0
  await redis.set(`user:${userId}:unread_count`, 0, "EX", 86400);

  return res.json({ success: true, unreadCount: 0 });
});

export default router;
```

---

## 5. The Interview Questions — All of Them, Done Properly

### Q: How do you design an asynchronous multi-channel notification pipeline that handles millions of events without stalling user-facing APIs?

**Answer:**
You decouple the ingestion API from the delivery pipeline using an asynchronous, event-driven message queue.

1. **Non-blocking Ingestion:** The client calls `POST /api/v1/notifications/dispatch` with an `Idempotency-Key` header. The ingestion gateway validates the schema, verifies that the idempotency key is not already cached in Redis (`SET lock NX EX`), pushes the raw event into an ingestion broker (Kafka topic or BullMQ/RabbitMQ queue), and immediately responds with `202 Accepted` and a tracking ID within 15–20ms.
2. **Decoupled Orchestration:** A pool of Fanout Orchestrator workers consumes raw events and queries the user's preference matrix (cached in Redis), device registrations, and quiet-hour schedules.
3. **Dedicated Channel Queues:** Instead of calling third-party APIs (SendGrid, Twilio, APNs, FCM) sequentially, the orchestrator divides the event into independent channel-specific jobs (e.g., `email-queue`, `sms-queue`, `push-queue`, `inapp-queue`).
4. **Independent Autoscaling:** If SendGrid experiences an outage or slows down, only the `email-queue` backs up. Push notifications, SMS OTPs, and in-app feeds continue processing with zero latency impact.

---

### Q: How do you implement notification aggregation (e.g., "Alice and 4 others liked your photo") without sending 5 separate push alerts?

**Answer:**
You implement a **sliding-window debouncing mechanism backed by Redis Sets and delayed queues**:

1. **Aggregation Key:** When an event occurs (e.g., user $B$ likes post $P$ owned by user $A$), derive a deterministic aggregation key: `digest:{recipientId}:{resourceType}:{resourceId}:{action}` (e.g., `digest:user_A:post_P:like`).
2. **Atomic Set Addition:** The worker runs `SADD digest:user_A:post_P:like "user_B"` and sets a TTL of 5 minutes (`EXPIRE key 300`).
3. **Schedule Delayed Worker:** If `SADD` returns `1` (indicating this is the first like in the current window), the orchestrator enqueues a delayed flush job scheduled for `now + 5 minutes`. Subsequent likes within those 5 minutes add actor IDs to the Redis set but do not schedule extra jobs.
4. **Flush & Template Rendering:** When the delayed job executes 5 minutes later, it calls `SMEMBERS` to retrieve all actor IDs. If the set contains 1 actor, it renders *"Alice liked your post"*. If it contains 5 actors, it renders *"Alice, Bob, and 3 others liked your post"*. It dispatches a single push notification and deletes the Redis key.

---

### Q: How do you model and enforce user preferences across multiple channels and categories with zero race conditions?

**Answer:**
You model user preferences as a **Channel $\times$ Category Matrix** and evaluate rules at **worker execution time**, backed by an immutable critical category override.

1. **Schema Design:** Store preferences in a table keyed by `(user_id, category)` with boolean columns for `in_app_enabled`, `push_enabled`, `email_enabled`, and `sms_enabled`.
2. **Immutable Critical Override:** Define categories like `SECURITY_ALERT` and `2FA_OTP` in code as non-negotiable. Even if a malicious or buggy database query sets all preference columns to `FALSE` for a user, the fanout worker checks `if (category === 'SECURITY_ALERT') return true;` before checking user settings.
3. **Execution-Time Evaluation:** Upstream business logic does not decide which channels to send to. Upstream merely emits `category: "social_activity"`. The fanout worker reads the latest preference snapshot from Redis/PostgreSQL right when the message is processed. If a user unchecks "Email" while 500 jobs sit in a background queue, when the worker picks up the job 10 seconds later, it sees the updated opt-out and skips the email dispatch.

---

### Q: How do you maintain an accurate unread notification count and feed at scale without `SELECT COUNT(*)` killing the database?

**Answer:**
You combine **denormalized atomic Redis counters** for O(1) badge lookups with **cursor-based database pagination** for the feed list.

1. **Denormalized Redis Counter:** Maintain an atomic counter at `user:{id}:unread_count`. When a new in-app notification row is inserted into PostgreSQL, execute `INCR user:{id}:unread_count`. When an item is marked as read, execute `DECR user:{id}:unread_count`. When "Mark All Read" is invoked, run `SET user:{id}:unread_count 0`. The client reads the badge count in $O(1)$ time without touching PostgreSQL.
2. **Reconciliation Fallback:** If the Redis key expires or the cache is evicted, query PostgreSQL using a partial index:
   ```sql
   SELECT COUNT(*)::int FROM notifications WHERE user_id = $1 AND is_read = FALSE;
   ```
   Cache the result back in Redis with a 1-hour TTL.
3. **Cursor Pagination for the Feed:** The feed API (`GET /api/v1/notifications`) avoids `OFFSET / LIMIT` (which scans and discards preceding rows) and uses composite cursor pagination: `WHERE user_id = $1 AND (created_at, id) < ($cursorCreatedAt, $cursorId) ORDER BY created_at DESC, id DESC LIMIT 20`, leveraging a multi-column B-tree index.

---

### Q: How do you handle third-party provider failures, rate limits, and invalid device tokens (e.g., APNs/FCM/Twilio)?

**Answer:**
You address third-party instability using a combination of **Token Bucket rate limiters, Circuit Breakers, Exponential Backoff with Jitter, and a Device Token Feedback Loop**:

1. **Token Bucket Rate Limiting:** Third-party providers enforce strict throughput caps (e.g., Twilio 10–100 TPS). Workers pull jobs through a token bucket limiter to prevent triggering HTTP 429 penalties.
2. **Circuit Breakers with Secondary Failover:** If a primary provider (e.g., SendGrid) returns 5xx errors or timeouts exceeding a 20% threshold over 30 seconds, trip the circuit breaker and route outgoing traffic to a secondary vendor (e.g., AWS SES).
3. **Exponential Backoff & DLQ:** Transient errors (network timeouts, 502s) retry with exponential backoff and randomized jitter: $t_{\text{wait}} = 2^{\text{attempt}} \times 1000\text{ms} + \text{jitter}$. After 5 failed attempts, the message moves to a Dead Letter Queue (DLQ) for alerting.
4. **Token Feedback Loop:** When APNs responds with `410 Gone` or FCM responds with `UNREGISTERED`, the push worker immediately executes an asynchronous database update: `UPDATE user_devices SET is_active = FALSE WHERE device_token = $token`. This stops the system from wasting bandwidth sending to dead tokens on subsequent broadcasts.

---

### Q: Why return 404 Not Found instead of 403 Forbidden when a user attempts to view or mark another user's notification as read?

**Answer:**
To prevent **Resource Enumeration and Information Leakage (IDOR defense)**.

If user $A$ attempts to access `PATCH /api/v1/notifications/notif_999/read` and the server returns `403 Forbidden`, the API confirms to an attacker that `notif_999` exists in the database and belongs to someone else. An attacker can write a script to enumerate IDs (`notif_1`, `notif_2`, ...) and map out user activity or ID formats.

Returning `404 Not Found` reveals nothing: from the caller's perspective, the resource does not exist in their accessible universe. The backend checks `WHERE id = $id AND user_id = $authUserId`. If zero rows are returned, it returns `404 Not Found`.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Synchronous Third-Party Dispatch in the Request Path
- **The Wrong Assumption:** Calling SendGrid, Twilio, or APNs inside the main API handler is fine because "the HTTP request only takes 200ms."
- **Why It's Wrong:** Third-party providers experience latency spikes, maintenance windows, and outages. An 8-second delay from Twilio ties up the Node.js/Java/Python thread pool, exhausts connection limits, and causes complete upstream gateway timeouts.
- **What Happens Instead:** The client app times out and retries, triggering duplicate credit card charges or duplicate database records.
- **The Fix:** The main API must only insert a record or publish an event to an internal queue and return `202 Accepted`. All third-party communication must happen inside decoupled background workers.

---

### Trap 2: Evaluating Preferences at Ingestion Time Instead of Execution Time
- **The Wrong Assumption:** Upstream services check if the user has email enabled, resolve the email address, and drop an `EmailJob` directly onto the email queue.
- **Why It's Wrong:** If 100,000 marketing jobs sit in a queue for 10 minutes and a user unsubscribes during that window, the job will still send the email because the preference was evaluated before enqueuing.
- **What Happens Instead:** You send unwanted promotional emails to users who already opted out, triggering spam reports and regulatory fines.
- **The Fix:** Upstream sends generic domain events (`category: "marketing"`). Channel workers evaluate the user's latest preference state from the database/cache immediately prior to dispatching to the third-party provider.

---

### Trap 3: `SELECT COUNT(*) WHERE is_read = false` Table Scan Explosion
- **The Wrong Assumption:** Counting unread notifications with a SQL query is fast because `user_id` is indexed.
- **Why It's Wrong:** As users accumulate tens of thousands of historical notifications, a B-tree index lookup must still traverse every matching unread index leaf. Under high concurrent page loads, hundreds of simultaneous `COUNT(*)` queries saturate CPU and disk I/O.
- **What Happens Instead:** The dashboard API slows from 50ms to 2.5 seconds, locking buffer pools.
- **The Fix:** Maintain a denormalized atomic Redis counter (`user:{id}:unread_count`). Update it via `INCR` on new notifications and `DECR` / `SET 0` on read actions. Use SQL only as an hourly/daily reconciliation fallback.

---

### Trap 4: Missing Idempotency in Channel Workers Causing Double Billing
- **The Wrong Assumption:** Once a worker pulls a job from BullMQ or SQS, it will only process it once.
- **Why It's Wrong:** Message queues guarantee *at-least-once* delivery, not *exactly-once*. If a worker delivers an SMS via Twilio but crashes or suffers a network timeout right before acknowledging the message to the queue, the broker reassigns the message to another worker.
- **What Happens Instead:** The second worker sends the SMS again, double-charging the customer's credit card and sending duplicate texts to the user.
- **The Fix:** Channel workers must use provider-level idempotency keys or record dispatch attempts in Redis with an atomic lock before invoking the external API.

---

### Trap 5: Ignoring APNs/FCM Token Feedback Loops (Zombie Tokens)
- **The Wrong Assumption:** Once a mobile device token is saved to the database, it remains valid forever.
- **Why It's Wrong:** Users frequently delete apps, switch phones, or wipe devices. APNs and FCM invalidate these tokens immediately.
- **What Happens Instead:** When marketing blasts 1,000,000 push notifications, 30% of them target dead tokens. APNs/FCM rate-limits or temporarily bans your server API key for spamming invalid endpoints, and worker throughput drops by 80%.
- **The Fix:** Capture `410 Gone` (APNs) and `UNREGISTERED` (FCM) responses in the push worker and immediately mark `is_active = FALSE` in the `user_devices` table.

---

### Trap 6: Monolithic Single Queue Priority Starvation
- **The Wrong Assumption:** Putting all notifications into a single Redis/RabbitMQ queue named `notifications` is clean and simple.
- **Why It's Wrong:** A marketing campaign with 2,000,000 messages will flood the queue. A time-critical 2FA login OTP generated two seconds later sits at position 2,000,001.
- **What Happens Instead:** Users trying to log in or complete high-value bank wire transfers wait 20 minutes for their 6-digit verification code, causing massive drop-offs.
- **The Fix:** Implement multi-tier priority queues (`tier0_critical`, `tier1_transactional`, `tier2_normal`, `tier3_marketing`) with dedicated worker pools that prioritize Tier 0 unconditionally.

---

## 7. Compare With Related Concepts

| Feature / Dimension | Notification API (Multi-Channel) | Audit Log API | In-App Activity Feed API | Webhook Delivery System |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Consumer** | End Users (Mobile, Web, Email, SMS) | Compliance Officers, Security Auditors | End Users browsing an app feed | Third-Party Developer Servers |
| **Core Goal** | Alert users, drive engagement, deliver critical codes | Immutability, non-repudiation, tamper evidence | Content discovery, chronological history | Programmatic B2B event synchronization |
| **Delivery Model** | Push fanout across heterogeneous channels | Append-only batch ingestion into WORM storage | Pull (cursor pagination) + WebSocket live updates | Outbound HTTP POST with HMAC signing & retries |
| **State Mutation** | `is_read`, `read_at`, preferences editable | **Strictly Immutable** (No UPDATE/DELETE allowed) | `is_read`, `is_bookmarked`, reaction states | Delivery attempts, failure status, endpoint state |
| **Latency SLA** | Tier 0 < 1s; Marketing < 30min | Sub-second ingestion; querying is asynchronous | Feed query < 50ms; real-time push < 500ms | < 5 seconds per retry attempt |
| **Retention Policy** | Typically 30–90 days for in-app feeds | 1 to 7+ years (Legal & regulatory compliance) | Indefinite or sliding window (e.g. 1 year) | 7 to 30 days of delivery attempt logs |

### Rule of Thumb: When to Use Which
- Use a **Notification API** when you need to alert a human being across multiple delivery channels (Email, SMS, Push, In-App) while respecting their personal communication preferences and quiet hours.
- Use an **Audit Log API** when you must record an unalterable, tamper-evident forensic record of *who did what and when* for security and compliance.
- Use an **In-App Activity Feed** when users need a persistent, scrollable, interactive UI ledger of events inside your web or mobile application.
- Use a **Webhook System** when your platform needs to notify another company's server programmatically about state changes (e.g., Stripe charging a credit card).

---

## 8. 🧠 The Memory Hook

> **"Acknowledge fast with 202, route through priority queues, check preferences at worker runtime, and never let marketing delay a 2FA OTP."**
> 
> *Think of the postal hub: stamp the intake receipt in 20ms, drop 2FA into the supersonic express lane, bundle burst likes into a 5-minute digest tray, and keep the unread badge counter in Redis so PostgreSQL never has to count 10,000 unread rows.*
