# Designing Webhook Systems: Delivery Guarantees, Exponential Backoff, and Dead-Letter Queues

## 1. Why This Exists — The Problem First

Imagine an e-commerce platform processing thousands of checkouts per minute. When an order completes, the backend needs to notify external merchants so they can reserve warehouse inventory and print shipping labels.

A developer implements this notification synchronously inside the database transaction:

```typescript
await db.transaction(async (tx) => {
  await tx.orders.update({ id: orderId, status: 'PAID' });
  // Calling an external customer URL directly inside the DB transaction
  await axios.post(merchant.webhookUrl, { event: 'order.completed', orderId });
});
```

On Black Friday, Merchant B's server experiences high load. Its webhook endpoint hangs for 30 seconds before timing out. Because the external HTTP call sits inside the database transaction, PostgreSQL holds row locks and keeps database connections open for the full 30 seconds. Within two minutes, your application connection pool is completely exhausted. Checkouts across the entire platform grind to a halt, affecting every merchant—even those whose servers are completely healthy.

If Merchant B's server responds with an HTTP 500 or terminates the connection, the transaction aborts and rolls back the database update. The customer's credit card was charged, but your database rolls back the paid status.

If you move the HTTP call right after the transaction commit (`await tx.commit(); await axios.post(...)`), another catastrophic failure occurs: if your application server restarts or crashes between the database commit and the HTTP call, the order is saved in the database, but the merchant never receives the webhook notification. The event is permanently lost with zero audit trail.

Webhooks are asynchronous, distributed notifications across untrusted, unpredictable public networks. You have zero control over the latency, uptime, or capacity of subscriber servers. Designing a reliable webhook engine requires decoupling event creation from delivery, establishing cryptographic trust boundaries, guaranteeing delivery without blocking internal workflows, and engineering for eventual consistency.

## 2. The Analogy — Make It Obvious

Think of a webhook delivery platform as a **Certified Registered Mail Dispatch Center**:

**Dropping off the Parcel (The Domain Transaction):** When a customer drops off a package at the post office, the postal clerk records the package in the official ledger and places it in a secure outbox vault. The clerk stamps your receipt and hands it to you in three seconds. The clerk does not ask you to wait at the counter while a courier drives across the country to deliver the box.

**The Outbox Vault (Transactional Outbox):** The secure room where stamped packages wait for delivery. Even if power cuts out or dispatchers are on lunch, the parcels are safely recorded in the ledger and will not be lost.

**The Sorter Relay (Outbox Processor):** Sorters continuously take packages from the outbox vault, sort them by destination, and load them onto specialized delivery trucks (message queues).

**The Delivery Courier (Dispatch Worker):** The courier drives to the recipient's doorstep with strict instructions: knock on the door, wait at most 5 seconds for a signature, and hand over the parcel.

**Cryptographic Wax Seal (HMAC-SHA256 Signature):** The package is sealed with a tamper-evident wax seal stamped with the sender's unique signet ring and the exact departure timestamp. The recipient checks the seal and timestamp before opening the box to ensure nobody tampered with the contents or re-delivered an old package.

**Retry Schedule (Exponential Backoff with Jitter):** If the recipient is not home (merchant server returns 500 or times out), the courier does not hammer on the door every 200 milliseconds. The courier leaves a notice and schedules redelivery with widening intervals: 10 seconds, 1 minute, 5 minutes, 30 minutes, 2 hours, 24 hours. The courier also adds random jitter (a few seconds variation) so hundreds of delivery trucks do not arrive at the exact same driveway simultaneously.

**Dead-Letter Office (DLQ & Quarantine):** If redeliveries fail repeatedly after 10 attempts over 48 hours, the package is moved to the Dead-Letter Office shelf. An automated alert notifies the merchant administrator. The postal system temporarily stops sending trucks to that broken address until the merchant verifies their mailbox is repaired.

## 3. How It Actually Works — The Full Explanation

A production-grade webhook infrastructure consists of two distinct sides: the **Publisher (Outbound Delivery Engine)** and the **Subscriber (Inbound Webhook Consumer)**.

```txt
PUBLISHER SIDE:
[API Request]
      │
      ▼
┌────────────────────────────────────────────────────────┐
│  Atomic Database Transaction                           │
│  ├─ 1. Write Domain Entity (e.g. orders, invoices)     │
│  └─ 2. Write Outbox Record (outbox_events table)       │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼ (CDC / Polling Relay)
┌────────────────────────────────────────────────────────┐
│  Outbox Relay Worker                                   │
│  └─ Reads pending outbox events -> Publishes to Queue  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Delivery Message Broker (RabbitMQ / SQS / Redis)      │
│  └─ Partitioned by subscriber / tenant                 │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Dispatch Workers (HTTP Client)                        │
│  ├─ Compute HMAC-SHA256 signature + timestamp header   │
│  ├─ POST to subscriber URL with 5s timeout             │
│  ├─ 2xx Success -> Mark delivered                      │
│  └─ Failure -> Exponential Backoff + Jitter / DLQ      │
└────────────────────────────────────────────────────────┘
                           │  HTTP POST (X-Signature, X-Timestamp)
                           ▼
SUBSCRIBER SIDE:
┌────────────────────────────────────────────────────────┐
│  Webhook Ingestion Endpoint                            │
│  ├─ 1. Verify HMAC-SHA256 signature using raw body     │
│  ├─ 2. Validate timestamp freshness (reject replay)    │
│  ├─ 3. Deduplicate via unique event_id index           │
│  ├─ 4. Push payload to internal background worker      │
│  └─ 5. Return HTTP 200 OK immediately (< 500ms)        │
└────────────────────────────────────────────────────────┘
```

**The Outbound Webhook Delivery Architecture**

1. **The Dual-Write Problem and the Transactional Outbox Pattern:** If an application attempts to update the database and directly publish a message to an external message broker or HTTP endpoint, one of the two operations will eventually fail. If you write to the database first and the broker is unreachable, the event is never sent. If you publish to the broker first and the database transaction fails to commit, downstream subscribers receive phantom events for actions that never occurred. The Transactional Outbox Pattern solves this by storing the domain update and the webhook event in the same relational database using a single ACID transaction. The `outbox_events` table stores the destination, event type, serialized payload, status (`PENDING`, `PROCESSING`, `DELIVERED`, `FAILED`), and attempt count.

2. **Outbox Processor and Relay:** An independent background process reads pending events from the outbox table and forwards them to a dedicated delivery broker. In high-throughput architectures, this uses either Polling with Row Locks (`SELECT * FROM outbox_events WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 100 FOR UPDATE SKIP LOCKED`) or Change Data Capture (CDC tools like Debezium reading the PostgreSQL Write-Ahead Log directly into Kafka or RabbitMQ with sub-millisecond latency).

3. **Partitioned Delivery Queues and Dispatch Workers:** Events are routed into partitioned queues. Partitioning by subscriber or destination endpoint prevents a single failing merchant from starving worker threads and delaying deliveries to all other subscribers. Dispatch workers pull jobs from the queue and perform outbound HTTP `POST` requests. Workers enforce strict network timeouts (connect timeout of 2 seconds, read timeout of 5 seconds) and per-tenant concurrency caps (e.g., maximum 10 simultaneous connections per subscriber).

**Delivery Guarantees, Retries, and Dead-Letter Queues**

1. **At-Least-Once Delivery vs. Exactly-Once:** In distributed systems operating over unreliable networks, exactly-once delivery is impossible due to the Two Generals Problem. If a subscriber processes a webhook successfully, but a network disconnect drops the HTTP 200 response on the return trip, the dispatch worker experiences a socket timeout. The publisher must assume delivery failed and retry, causing the subscriber to receive the event a second time. Because network delivery is at-least-once, the publisher guarantees events are never lost, and the subscriber guarantees idempotent event processing.

2. **Exponential Backoff with Full Jitter:** When a subscriber returns a non-2xx status code (e.g., 500, 502, 503) or times out, the engine schedules a retry. Retrying at fixed intervals causes the Thundering Herd Problem: if an offline subscriber recovers, all accumulated retries hit the server at the exact same instant, crashing it immediately. Exponential backoff increases the delay exponentially with each attempt, while jitter adds random entropy to distribute the traffic evenly:
`Interval = min(MaxInterval, BaseInterval * 2^(attempt - 1))`
`Delay = random_between(0, Interval)`
A standard production schedule spans 10 attempts over 48 hours (e.g., immediate, 15s, 1m, 5m, 30m, 2h, 6h, 12h, 24h, 48h).

3. **Dead-Letter Queues (DLQ) and Endpoint Circuit Breaking:** When all retry attempts are exhausted, the event transitions to `FAILED` status in a Dead-Letter Queue table. If an endpoint fails 50 consecutive deliveries across multiple events or fails continuously for 72 hours, the engine automatically flips the endpoint status to `DISABLED`, preventing wasted worker compute. An automated email alerts the subscriber's technical team with failure logs.

**Cryptographic Security: Signatures, Timestamps, and Secret Rotation**

1. **HMAC-SHA256 Signature Verification:** When a webhook subscription is created, the publisher generates a cryptographically secure random secret (e.g., `whsec_a8f9c2...`). Before dispatching, the publisher creates a signature payload containing the current Unix timestamp and the raw JSON payload: `signature_payload = timestamp + "." + raw_body`. The publisher computes `HMAC_SHA256(secret, signature_payload)` and sends headers: `X-Signature: t=1719500000,v1=6d4d12...`, `X-Webhook-ID: evt_01J2...`, and `X-Webhook-Timestamp: 1719500000`.

2. **Preventing Replay Attacks:** An attacker intercepting a valid signed request could resend the same payload to duplicate actions. The subscriber mitigates this by extracting `t` from the signature header, verifying that `|current_time - t| <= 300 seconds` (5 minutes tolerance), and verifying the unique `X-Webhook-ID` against a database of recently processed event IDs.

3. **Zero-Downtime Secret Rotation:** When a subscriber rotates their webhook secret, the publisher retains both the active secret (`v2`) and the previous secret (`v1`) during a 24-hour transition window, sending both in the signature header: `X-Signature: t=1719500000,v1=sig_old,v2=sig_new`. The subscriber updates their secret in production without dropping incoming deliveries.

**Webhook Management APIs**

A robust webhook platform exposes administrative REST endpoints:
- `POST /api/v1/webhooks` — Register a webhook URL with event topic filters (e.g., `['order.created', 'invoice.paid']`).
- `GET /api/v1/webhooks/:id/deliveries` — Inspect delivery logs, HTTP status codes, latencies, and response bodies for debugging.
- `POST /api/v1/webhooks/:id/test` — Dispatch a synthetic ping event to verify consumer endpoint connectivity during setup.
- `POST /api/v1/webhooks/:id/rotate-secret` — Generate a new signing secret with a dual-signature grace period.
- `POST /api/v1/webhooks/:id/replay` — Trigger redelivery of dead-lettered events after resolving an outage.

## 4. Real Code — See It Working

**Publisher: Transactional Outbox, HMAC Signer, and Resilient Dispatcher**

```typescript
// publisher.ts
import crypto from 'node:crypto';

export interface OutboxEvent {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  destinationUrl: string;
  secret: string;
  attempt: number;
  maxAttempts: number;
}

export class WebhookPublisher {
  /**
   * Generates HMAC-SHA256 signature with timestamp.
   * Format: t={timestamp},v1={hex_hash}
   */
  public static signPayload(secret: string, payloadString: string, timestamp: number): string {
    const signaturePayload = `${timestamp}.${payloadString}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signaturePayload);
    const hash = hmac.digest('hex');
    return `t=${timestamp},v1=${hash}`;
  }

  /**
   * Calculates exponential backoff with full jitter in milliseconds.
   */
  public static calculateBackoffWithJitter(attempt: number, baseMs = 1000, maxMs = 86400000): number {
    // Exponential calculation: base * 2^(attempt - 1)
    const exponentialLimit = Math.min(maxMs, baseMs * Math.pow(2, attempt - 1));
    // Full Jitter: random value between 0 and exponentialLimit
    return Math.floor(Math.random() * exponentialLimit);
  }

  /**
   * Dispatches an outbound webhook with strict 5s timeout.
   */
  public static async dispatchEvent(event: OutboxEvent): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyString = JSON.stringify(event.payload);
    const signatureHeader = this.signPayload(event.secret, bodyString, timestamp);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5000ms strict timeout

    try {
      const response = await fetch(event.destinationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'WebhookEngine-Dispatcher/1.0',
          'X-Webhook-ID': event.id,
          'X-Webhook-Event': event.eventType,
          'X-Webhook-Timestamp': String(timestamp),
          'X-Signature': signatureHeader,
        },
        body: bodyString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { success: true, statusCode: response.status };
      }

      return {
        success: false,
        statusCode: response.status,
        error: `HTTP status ${response.status}`,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const errorMessage = err instanceof Error ? err.message : 'Unknown network failure';
      return { success: false, error: errorMessage };
    }
  }
}
```

**Subscriber: Signature Verification, Idempotency Guard, and Fast Ingestion**

```typescript
// subscriber.ts
import crypto from 'node:crypto';

// In-memory mock store representing a relational database table with UNIQUE constraint
const processedEventStore = new Set<string>();

export interface WebhookVerificationResult {
  valid: boolean;
  reason?: string;
}

export class WebhookReceiver {
  /**
   * Verifies HMAC signature using timing-safe buffer comparison.
   * NEVER parse JSON before verifying the signature.
   */
  public static verifySignature(
    rawBodyBuffer: Buffer,
    headerValue: string,
    secret: string,
    toleranceSeconds = 300
  ): WebhookVerificationResult {
    // Header format: t=1719500000,v1=hash_value
    const elements = headerValue.split(',');
    const timestampPart = elements.find((el) => el.startsWith('t='));
    const signaturePart = elements.find((el) => el.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      return { valid: false, reason: 'Malformed signature header format' };
    }

    const timestamp = parseInt(timestampPart.split('=')[1], 10);
    const signature = signaturePart.split('=')[1];
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // 1. Validate timestamp to prevent replay attacks
    if (Math.abs(currentTimestamp - timestamp) > toleranceSeconds) {
      return { valid: false, reason: 'Timestamp outside tolerance window (replay protection)' };
    }

    // 2. Recompute HMAC against raw unparsed body
    const signaturePayload = `${timestamp}.${rawBodyBuffer.toString('utf8')}`;
    const expectedHmac = crypto.createHmac('sha256', secret);
    expectedHmac.update(signaturePayload);
    const expectedHash = expectedHmac.digest('hex');

    // 3. Timing-safe equality check to prevent timing side-channel attacks
    const signatureBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedHash, 'utf8');

    if (signatureBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(signatureBuf, expectedBuf)) {
      return { valid: false, reason: 'HMAC signature verification failed' };
    }

    return { valid: true };
  }

  /**
   * Handles incoming webhook request safely.
   */
  public static async handleIncomingWebhook(
    eventId: string,
    rawBody: Buffer,
    signatureHeader: string,
    secret: string,
    enqueueToBackgroundWorker: (data: unknown) => Promise<void>
  ): Promise<{ status: number; body: { received: boolean; message?: string } }> {
    // 1. Signature Verification
    const verification = this.verifySignature(rawBody, signatureHeader, secret);
    if (!verification.valid) {
      return { status: 401, body: { received: false, message: verification.reason } };
    }

    // 2. Idempotency Check
    if (processedEventStore.has(eventId)) {
      // Return 200 OK immediately if already processed. Do not re-execute work.
      return { status: 200, body: { received: true, message: 'Event already processed (idempotent)' } };
    }

    // 3. Mark event as recorded atomically
    processedEventStore.add(eventId);

    // 4. Offload heavy processing to internal queue asynchronously
    const parsedPayload = JSON.parse(rawBody.toString('utf8'));
    await enqueueToBackgroundWorker(parsedPayload);

    // 5. Acknowledge receipt within milliseconds
    return { status: 200, body: { received: true } };
  }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why is exactly-once webhook delivery mathematically impossible across the internet, and how must systems be designed around this reality?**

In distributed computing, the Two Generals Problem proves that it is impossible for two systems to agree on a state change with 100% certainty over an unreliable communication channel. When a publisher sends an HTTP `POST` request, three things can happen: the network drops the request before reaching the consumer; the consumer crashes while processing; or the consumer processes the payload successfully, but the network drops the HTTP 200 response on the return trip.

Because the publisher cannot distinguish between a dropped request and a dropped response, it must assume failure and retry. This creates an **At-Least-Once Delivery** guarantee.

Architecturally, this shifts the responsibility of idempotency to the subscriber. The publisher must send a unique, immutable event identifier (`X-Webhook-ID`), and the subscriber must maintain an idempotency table or unique database index on `(event_id)`. When a duplicate delivery arrives, the subscriber identifies the existing record, skips duplicate business execution, and returns `200 OK` immediately.

**Q: How does the Transactional Outbox Pattern prevent the dual-write problem when publishing webhooks?**

The dual-write problem occurs when an application needs to update a database and publish an event to a message broker. If either step fails independently, data becomes permanently inconsistent.

The Transactional Outbox Pattern solves this by storing domain state changes (e.g., `orders`, `users`) and the outgoing webhook events (`outbox_events`) in the same relational database inside a single atomic ACID transaction:

```sql
BEGIN;
  UPDATE orders SET status = 'COMPLETED' WHERE id = 'ord_123';
  INSERT INTO outbox_events (id, event_type, payload, status, created_at)
  VALUES ('evt_456', 'order.completed', '{"orderId":"ord_123"}', 'PENDING', NOW());
COMMIT;
```

Because both operations occur within the same database transaction, they either both commit or both roll back. An asynchronous relay process (using change data capture or polled queries with `SKIP LOCKED`) reads the outbox table and delivers the events. Even if the application crashes or restarts at any moment, zero events are lost.

**Q: How does HMAC-SHA256 signature verification work, and why must the consumer verify against the raw byte buffer?**

HMAC-SHA256 uses a pre-shared secret key between publisher and subscriber along with a cryptographic hash function. The publisher concatenates the Unix timestamp and the exact raw string representation of the request body (`timestamp + "." + raw_body`), computes the SHA-256 HMAC, and transmits it via the `X-Signature` header.

The subscriber must verify the signature against the **raw byte buffer** prior to any JSON parsing. If an HTTP framework parses the request body into a JavaScript object and then re-serializes it with `JSON.stringify()`, key ordering can change, whitespace and newlines are stripped, and Unicode characters may be escaped differently. Even a single differing byte causes the computed cryptographic hash to change completely, resulting in false signature verification failures.

Furthermore, verification must use timing-safe comparison (`crypto.timingSafeEqual`) rather than standard string comparison (`===`) to prevent attackers from inferring valid signature characters via timing side-channel analysis.

**Q: Why must retry backoff algorithms include random jitter, and what happens to a recovering server without it?**

When a subscriber endpoint goes down during peak traffic, the publisher's dispatch engine queues up thousands of failed delivery tasks.

If retries follow a deterministic exponential backoff schedule (e.g., retry all failed events at exactly 10s, 30s, 60s), every failed delivery from the outage window calculates the exact same retry time. When the subscriber comes back online, thousands of dispatch workers fire simultaneous HTTP requests in synchronized waves. This massive spike—the Thundering Herd—overwhelms the subscriber's newly restarted database and web servers, causing an immediate crash.

Adding **Full Jitter** randomizes the delay uniformly across the interval: `delay = random(0, min(max_backoff, base * 2^attempt))`. This breaks up synchronized waves, smoothing out request throughput into a flat, manageable flow that allows the recovering server to process backlogged events steadily.

**Q: How should a high-volume webhook consumer be architected to handle bursts of events without dropping requests or timing out?**

A high-volume webhook consumer must follow the **Buffer-and-ACK** pattern:
1. **Minimal Ingestion Handler:** The HTTP handler does only three tasks: verifies the HMAC signature, checks timestamp freshness, and appends the raw payload into a high-throughput message queue or ingestion table (e.g., Redis Stream, RabbitMQ, SQS, or Kafka).
2. **Fast Return:** The handler returns `HTTP 200 OK` with `{ "received": true }` within 50 milliseconds. It does not perform database queries, call third-party APIs, or execute complex business logic within the request-response cycle.
3. **Decoupled Worker Processing:** Background worker pools pull events from the queue at a controlled, sustainable rate, utilizing database transactions and idempotency deduplication checks to process the business logic.

This design prevents the consumer from exceeding the publisher's 5-second HTTP timeout and isolates external webhook traffic spikes from internal database capacity limits.

**Q: How do you implement zero-downtime webhook secret rotation?**

If a publisher immediately replaces an old secret with a new secret, every in-flight webhook will fail verification on subscriber servers that have not yet deployed the updated environment variable.

Zero-downtime secret rotation requires a dual-signing grace period:
1. **Secret Generation:** The publisher generates a new secret (`whsec_new`) while marking the existing secret (`whsec_old`) as expiring in 24 hours.
2. **Dual Signing:** The publisher calculates signatures for both secrets and sends both in the signature header: `X-Signature: t=1719500000,v1=hash_old,v2=hash_new`.
3. **Subscriber Compatibility:** The subscriber's verification logic checks if any valid signature matches its configured secret.
4. **Subscriber Update:** The subscriber updates their environment variable to `whsec_new` at their own pace within the 24-hour window.
5. **Retirement:** After 24 hours, the publisher revokes `whsec_old` and only sends `v2` signatures.

## 6. The Traps — What Goes Wrong

**Trap 1: Verifying HMAC Signatures on Parsed JSON Instead of Raw Request Buffers**

When an HTTP body parser converts JSON text into an in-memory object, it strips whitespace, reorders object keys, and standardizes number formatting. Re-stringifying that object never guarantees byte-for-byte fidelity with the sender's original transmission.

```typescript
// WRONG: Express parses JSON first, altering whitespace and key ordering
app.use(express.json());
app.post('/webhook', (req, res) => {
  const reconstructedBody = JSON.stringify(req.body); // Serialization differs from original raw bytes
  const isValid = verifyHmac(reconstructedBody, req.headers['x-signature'], SECRET); // Always FALSE!
});

// CORRECT: Preserve raw Buffer before body parsing
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf; // Save exact raw byte buffer
    },
  })
);
app.post('/webhook', (req, res) => {
  const isValid = verifyHmac((req as any).rawBody, req.headers['x-signature'], SECRET);
});
```

**Trap 2: Synchronous Processing Inside the Inbound Webhook Route**

Publishers enforce strict HTTP response timeouts (typically 5 seconds). Performing synchronous database migrations, PDF generation, or third-party API calls inside the webhook endpoint guarantees timeout errors, triggering unnecessary retries and duplicate workload cascades.

```typescript
// WRONG: Heavy business logic executed during the HTTP handler
app.post('/webhook', async (req, res) => {
  const event = req.body;
  await generatePdfInvoice(event); // Takes 4 seconds
  await syncToSalesforceCrm(event); // Takes 3 seconds
  res.status(200).send('OK'); // Publisher timed out after 5s and marked delivery as FAILED!
});

// CORRECT: Store, enqueue, and respond immediately
app.post('/webhook', async (req, res) => {
  await queue.push('process-webhook', req.body);
  res.status(200).json({ received: true }); // Responds in 20ms
});
```

**Trap 3: Returning HTTP 400 for Retriable Backend Failures**

HTTP status code semantics dictate publisher retry behavior:
- `4xx Client Error` (e.g., 400, 401, 404, 422): Tells the publisher the request payload is malformed or unauthorized. Publishers will **not retry** 4xx responses (except 429 Too Many Requests). If your database is temporarily down and your handler returns `400 Bad Request`, the publisher assumes the payload is permanently invalid and drops the event forever.
- `5xx Server Error` (e.g., 500, 502, 503, 504): Tells the publisher your server experienced a temporary failure. The publisher schedules an exponential backoff retry.
- **Rule:** Return `401` only for invalid cryptographic signatures. Return `500` or `503` when internal databases or queues are unavailable so the publisher retries later.

**Trap 4: Missing Timestamp Verification Permitting Replay Attacks**

If your receiver only verifies `HMAC_SHA256(secret, body) === signature` without checking the timestamp header, an attacker who intercepts a single legitimate `order.refunded` webhook can replay that exact HTTP request to your endpoint 100 times. Because the payload and signature match, your server would accept and process every duplicate replay. Always include a timestamp in the signed payload and reject requests older than 300 seconds.

**Trap 5: Lack of Per-Subscriber Concurrency Limits on the Publisher**

A publisher running 500 worker threads might dispatch events across 100 subscribers. If Subscriber A's server slows down and begins taking 4.9 seconds per request, all 500 publisher threads will rapidly get stuck waiting on Subscriber A. As a result, events destined for Subscribers B, C, and D are delayed in the queue. Publishers must enforce per-subscriber rate and concurrency limits so a single sluggish destination cannot monopolize global worker capacity.

## 7. Compare With Related Concepts

**Webhooks vs. Polling (Short & Long Polling)**
- **Webhooks (Push):** The event producer initiates an HTTP `POST` request to the subscriber immediately when an event occurs. Zero idle network traffic, instant notification, but requires the subscriber to expose a public internet endpoint with SSL and authentication.
- **Polling (Pull):** The consumer periodically calls `GET /api/events` every N seconds to check for new records. Incurs continuous network overhead, server CPU load on empty checks, and introduces latency equal to the polling interval.
- **Decision Rule:** Use Webhooks for server-to-server event notifications across organizations. Use Polling only when the consumer sits behind a strict corporate firewall and cannot expose an inbound public HTTP port.

**Webhooks vs. WebSockets & Server-Sent Events (SSE)**
- **WebSockets / SSE:** Persistent, stateful TCP connections maintained between client and server. Designed for real-time browser-to-server communication (e.g., live chat, collaborative editing, real-time dashboards). Highly sensitive to connection drops and requires complex connection state management across load balancers.
- **Webhooks:** Stateless, discrete HTTP `POST` requests designed for asynchronous server-to-server integration across organizational boundaries. No persistent connections required.
- **Decision Rule:** Use WebSockets/SSE when streaming real-time UI updates to client browsers. Use Webhooks for business event distribution between independent backend infrastructures.

**Webhooks vs. Distributed Message Brokers (Kafka, RabbitMQ, SQS)**
- **Message Brokers:** High-throughput, low-latency binary protocols (AMQP, Kafka protocol) designed for internal communication within a trusted virtual private cloud (VPC). Feature zero payload signing, assumption of high network reliability, and shared protocol dependencies.
- **Webhooks:** Standard HTTP/HTTPS protocol designed for cross-company communication over the public internet with cryptographic signatures, varying payload formats, and aggressive retry/quarantine policies.
- **Decision Rule:** Use Message Brokers between internal microservices you control. Use Webhooks when delivering events to third-party developers, customers, or external vendors.

## 8. 🧠 The Memory Hook

Webhooks are **push notifications for servers**: save events to a **transactional outbox** first, deliver them over a **dedicated queue** with an **HMAC cryptographic seal** and strict 5-second timeout, **retry with backoff and jitter**, and require the receiver to enforce **idempotency** because over an unreliable internet, at-least-once delivery guarantees duplicates will happen.

