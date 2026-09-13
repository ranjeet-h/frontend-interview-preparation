# Designing Payment Callback & Webhook APIs: HMAC Signatures, Replay Protection, and Event Deduplication

## 1. Why This Exists — The Problem First

Imagine you launch an e-commerce platform. A customer checks out a $5,000 laptop, and your frontend redirects them to a payment gateway like Stripe, Razorpay, or PayPal. When the transaction completes, the gateway sends an asynchronous HTTP `POST` webhook to your backend endpoint `/api/webhooks/payment` with a JSON payload announcing that the payment succeeded.

Now consider what happens if you treat this endpoint like a regular REST route and blindly parse `req.body`:

First, an attacker discovers your public webhook URL. They craft an unauthenticated `POST` request containing `{"event": "payment.succeeded", "amount": 500000, "user_id": "attacker_99"}`. Because the route has no session cookie and performs no cryptographic verification, your backend marks the order as paid, and the attacker walks away with $5,000 in free goods.

Second, suppose your database experiences a brief 2-second lock contention or your transactional email provider lags while processing the webhook synchronously. Your handler takes 12 seconds to respond. The payment gateway hits its strict 5-second timeout, assumes your server crashed, and retries the webhook 5 times over the next hour. Because your handler lacks atomic deduplication, it executes five separate times, crediting the customer's wallet balance five times or provisioning five duplicate software licenses.

Third, an attacker intercepts a legitimate, signed webhook payload on an insecure network or extracts it from debug logs. Two days later, they replay the exact same HTTP request to your endpoint. If your server verifies the cryptographic signature but ignores the timestamp header, the signature check succeeds, and your system fulfills the order a second time.

Payment webhooks operate over the public internet with at-least-once delivery guarantees. You are exposing a public, unauthenticated HTTP endpoint that directly modifies critical financial state. Without cryptographic signature verification, replay protection, raw body preservation, and idempotent asynchronous processing, you risk severe revenue loss, duplicate fulfillment, and corrupted financial ledgers.

## 2. The Analogy — Make It Obvious

Think of a payment webhook API as a **High-Security Bank Vault Intake Desk receiving Wax-Sealed, Time-Stamped Courier Orders with a Central Registry**.

Foreign banks need to instruct your vault to transfer funds to local merchants. Because anyone can walk into your bank lobby pretending to represent a foreign bank, you enforce strict intake rules:

- **The Shared Wax Seal (HMAC-SHA256 Signature):** The foreign bank writes the exact transfer details on parchment and stamps it with an unbroken wax seal made using a private, shared signet stamp known only to both institutions. If a rogue courier opens the envelope, changes "$50" to "$50,000", or even alters a single punctuation mark, the wax seal shatters. When you test the seal against your reference mold, it fails to match, and you discard the letter immediately.
- **The Military Postmark (Replay Attack Protection):** The sender stamps the exact minute of dispatch directly into the wax seal. When the courier arrives, your intake clerk checks the clock. If the letter is postmarked more than 5 minutes ago, the clerk burns it on the spot—even if the seal is genuine. This prevents a thief from stealing an old, legitimate letter from last month and presenting it again to drain the vault twice.
- **The Master Intake Ledger (Idempotency and Event Deduplication):** Every transfer letter contains a globally unique dispatch serial number (`event_id`). Before touching any gold, the clerk looks up the serial number in a permanent master ledger. If serial `#TX-9842` is already marked as "Processed" or "In Progress", the clerk hands the courier a receipt saying "Already received!" and touches zero gold.
- **The Front Desk Intake vs. The Vault Crew (Fast Acknowledgement and Queue):** The foreign courier refuses to wait around while your bank audits inventories, packages gold bars into crates, and dispatches armored carriages. If the courier waits longer than 30 seconds, their dispatch manager assumes the courier was ambushed and sends duplicate couriers with the same order. So the front desk clerk simply checks the seal, validates the timestamp, records the serial number, hands the courier a stamped receipt (`200 OK`) in 2 seconds flat, and drops the raw work order onto a motorized conveyor belt (a background queue) for the vault crew to process safely in the background.

## 3. How It Actually Works — The Full Explanation

A bulletproof payment webhook ingestion pipeline relies on four architectural pillars operating in strict sequence:

```txt
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               PAYMENT GATEWAY (Stripe / Razorpay)                       │
│  Payload: {"id": "evt_101", "type": "payment_intent.succeeded", "amount": 5000}         │
│  Header:  Stripe-Signature: t=1724750000,v1=9f83ab...                                   │
└────────────────────────────────────────┬────────────────────────────────────────────────┘
                                         │ HTTP POST (Raw Body Stream)
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        WEBHOOK INGESTION ENDPOINT (Fast Path < 200ms)                   │
│                                                                                         │
│  1. CAPTURE RAW BODY       ──> Extract untouched Buffer before JSON parsing             │
│  2. REPLAY CHECK           ──> Assert |CurrentTime - HeaderTime| <= 300 seconds         │
│  3. CRYPTOGRAPHIC CHECK    ──> crypto.timingSafeEqual(HMAC_SHA256(rawBody, secret), v1) │
│  4. ATOMIC DEDUPLICATION   ──> Redis SET webhook:lock:evt_101 NX EX 30 / DB Insert      │
│  5. ENQUEUE JOB            ──> Push {eventId, payload} to BullMQ / RabbitMQ             │
│  6. ACKNOWLEDGE            ──> Return HTTP 200 {"received": true}                       │
└────────────────────────────────────────┬────────────────────────────────────────────────┘
                                         │ Asynchronous Job Message
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         BACKGROUND WORKER (Reliable Heavy Path)                         │
│                                                                                         │
│  1. DB TRANSACTION BEGIN                                                                │
│  2. Check Order Status     ──> Ensure transition is valid (e.g. PENDING -> PAID)        │
│  3. Update Order & Ledger  ──> Mark Order PAID, create payment audit records            │
│  4. Mark Event COMPLETED   ──> Set webhook_events.status = 'COMPLETED'                  │
│  5. DB TRANSACTION COMMIT                                                               │
│  6. SIDE EFFECTS           ──> Dispatch customer receipt email, trigger warehouse fulfillment │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

The system operates across these critical requirements:

**Pillar 1: Cryptographic Signature Verification (HMAC-SHA256)**

Payment providers establish mutual trust using symmetric Hash-based Message Authentication Codes (HMAC). When you configure a webhook endpoint in your payment dashboard, the provider generates a high-entropy shared secret key (e.g., `whsec_...`).

When an event occurs:
1. The gateway concatenates the current UNIX timestamp `t` and the raw request body string: `signed_payload = t + "." + raw_body`.
2. The gateway calculates the SHA-256 hash using the shared secret: `signature = HMAC_SHA256(signed_payload, secret)`.
3. The gateway includes this in the request headers, such as `Stripe-Signature: t=1724750000,v1=5257a869e7...`.

When your server receives the request, it recomputes the expected HMAC using its local copy of the secret key. It then compares the computed signature against the header signature using a constant-time equality check (`crypto.timingSafeEqual`). Constant-time comparison ensures that comparison duration does not leak byte-matching progress, preventing timing side-channel attacks.

**The Raw Body Preservation Hazard**

The most common implementation bug in webhook systems is verifying signatures against parsed or re-serialized JSON.

When standard web middleware like `express.json()` processes an incoming HTTP stream, it parses the bytes into an in-memory JavaScript object. If you later call `JSON.stringify(req.body)` to compute the HMAC, the resulting string will almost certainly differ from the original raw bytes sent over the wire:
- Key ordering in JSON objects is non-deterministic in many parsers.
- Insignificant whitespace, tab characters, and line breaks are stripped or formatted differently.
- Unicode character encodings and floating-point representations may be subtly normalized.

Because SHA-256 exhibits the avalanche effect—where a single flipped bit completely scrambles the output hash—re-stringified JSON produces a mismatched signature and causes valid payment notifications to be rejected with HTTP 400. Webhook routes must capture the raw, untouched `Buffer` directly from the incoming network stream before any JSON body parser runs.

**Pillar 2: Replay Attack Mitigation (Timestamp Tolerance)**

If an attacker intercepts a legitimate webhook payload along with its valid `Stripe-Signature` header, the signature alone is insufficient. Because the signature matches the payload, the attacker could resend the exact same HTTP request repeatedly to trigger repeated fulfillment.

To mitigate replay attacks, gateways embed the dispatch timestamp `t` inside the signature header and include that timestamp in the HMAC calculation.

Your server extracts `t` from the header and compares it against the server's current system clock:
`drift = Math.abs(current_unix_time - header_timestamp)`

If `drift > tolerance` (standard practice is 300 seconds / 5 minutes), your server rejects the request immediately. An attacker cannot modify `t` to bypass this check because altering `t` invalidates the HMAC signature over `t + "." + raw_body`.

**Pillar 3: Idempotency and Event Deduplication**

Payment gateways operate on distributed messaging networks that guarantee **at-least-once delivery**. A single payment will often generate duplicate webhook deliveries due to network retries, gateway server failovers, or temporary connection hiccups.

Your system must guarantee that processing an event multiple times produces the exact same state as processing it once.

This is handled through a two-tiered deduplication strategy:
1. **Immediate Ingestion Lock (Redis or SQL):** When the webhook arrives, check if the gateway's unique `event_id` (e.g., `evt_3MswQ...`) has already been recorded. An atomic `SET webhook:lock:{event_id} "PROCESSING" NX EX 30` in Redis or an `INSERT INTO webhook_events (event_id, status) VALUES (?, 'PROCESSING') ON CONFLICT DO NOTHING` in SQL determines whether this is a fresh event.
2. **State Machine Validation in the Database:** If an event is already marked `COMPLETED`, the handler immediately returns `200 OK` and exits. Furthermore, the domain entity (the order or subscription) must maintain a strict state machine. An order can transition from `PENDING` to `PAID`, but an event attempting to transition a `PAID` order to `PAID` again simply acts as a no-op within a database transaction.

**Pillar 4: Fast Acknowledgement and Asynchronous Offloading**

Payment providers enforce strict timeout limits (typically 5 to 10 seconds). If your server fails to respond within this window, the gateway marks the delivery as failed and queues an automated retry with exponential backoff.

If your webhook handler executes heavy operations synchronously—such as generating PDF invoices, making outbound calls to third-party shipping APIs, updating CRM records, or sending customer confirmation emails—any downstream latency spike causes the webhook handler to time out. The gateway then fires retries, compounding server load and creating a cascading failure (a "retry storm").

The rule for webhook ingestion is absolute:
- The HTTP handler performs only signature verification, timestamp validation, deduplication recording, and message enqueueing.
- It immediately returns `200 OK` with `{ received: true }` in under 200 milliseconds.
- A background worker pool (powered by BullMQ, RabbitMQ, SQS, or Celery) consumes the queue and performs business logic, database mutations, and third-party notifications with dedicated retry and dead-letter queue (DLQ) policies.

## 4. Real Code — See It Working

Here is a complete, production-grade implementation in TypeScript using Express, Node.js built-in `crypto`, and a background job queue.

**1. Webhook Signature Verifier (`verifyWebhook.ts`)**

```typescript
import crypto from 'node:crypto';

export interface WebhookVerificationOptions {
  rawBody: Buffer;
  signatureHeader: string;
  webhookSecret: string;
  toleranceInSeconds?: number;
}

export interface VerifiedWebhookPayload {
  eventId: string;
  eventType: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export function verifyWebhookSignature({
  rawBody,
  signatureHeader,
  webhookSecret,
  toleranceInSeconds = 300,
}: WebhookVerificationOptions): VerifiedWebhookPayload {
  if (!signatureHeader || !webhookSecret) {
    throw new Error('Missing signature header or webhook secret.');
  }

  // Header format: "t=1724750000,v1=9f83ab7...,v0=..."
  const headerParts = signatureHeader.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) {
      acc[key.trim()] = value.trim();
    }
    return acc;
  }, {} as Record<string, string>);

  const timestampStr = headerParts['t'];
  const providedSignature = headerParts['v1'];

  if (!timestampStr || !providedSignature) {
    throw new Error('Malformed signature header: missing timestamp or v1 signature.');
  }

  const timestamp = Number.parseInt(timestampStr, 10);
  if (Number.isNaN(timestamp)) {
    throw new Error('Invalid timestamp format in signature header.');
  }

  // 1. Replay Attack Mitigation: check timestamp freshness
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const timeDifference = Math.abs(currentTimestamp - timestamp);

  if (timeDifference > toleranceInSeconds) {
    throw new Error(
      `Timestamp drift (${timeDifference}s) exceeds tolerance (${toleranceInSeconds}s). Possible replay attack.`
    );
  }

  // 2. Compute expected HMAC-SHA256 over: timestamp + "." + rawBody
  const hmac = crypto.createHmac('sha256', webhookSecret);
  hmac.update(`${timestamp}.`);
  hmac.update(rawBody);
  const expectedSignatureHex = hmac.digest('hex');

  const expectedBuffer = Buffer.from(expectedSignatureHex, 'utf8');
  const providedBuffer = Buffer.from(providedSignature, 'utf8');

  // 3. Prevent Timing Attacks using constant-time comparison
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new Error('Cryptographic signature mismatch. Untrusted webhook payload.');
  }

  // Parse raw body to JSON only AFTER successful cryptographic verification
  const parsed = JSON.parse(rawBody.toString('utf8'));

  return {
    eventId: parsed.id,
    eventType: parsed.type,
    data: parsed.data?.object || parsed.data || {},
    timestamp,
  };
}
```

**2. Webhook Ingestion Controller (`webhookServer.ts`)**

```typescript
import express, { Request, Response } from 'express';
import { verifyWebhookSignature } from './verifyWebhook.js';

// Simulated Redis client interface
interface RedisClient {
  set(key: string, value: string, mode: string, duration: number, flag: string): Promise<string | null>;
  get(key: string): Promise<string | null>;
}

// Simulated Queue interface (e.g. BullMQ)
interface PaymentQueue {
  add(jobName: string, data: unknown, opts: { jobId: string; attempts: number }): Promise<void>;
}

export function createWebhookApp(
  webhookSecret: string,
  redis: RedisClient,
  paymentQueue: PaymentQueue
) {
  const app = express();

  // CRITICAL: Preserve raw request body stream for HMAC calculation
  app.post(
    '/api/webhooks/payment',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response): Promise<void> => {
      const signatureHeader = req.headers['stripe-signature'] as string;
      const rawBody = req.body as Buffer;

      if (!rawBody || !Buffer.isBuffer(rawBody)) {
        res.status(400).json({ error: 'Missing or non-buffer request body.' });
        return;
      }

      let verifiedEvent;
      try {
        // Step 1 & 2: Cryptographic validation and timestamp tolerance verification
        verifiedEvent = verifyWebhookSignature({
          rawBody,
          signatureHeader,
          webhookSecret,
          toleranceInSeconds: 300,
        });
      } catch (err: any) {
        // Signature failures get 400 Bad Request (provider will not retry forged requests)
        console.warn(`[Webhook Rejected] ${err.message}`);
        res.status(400).json({ error: 'Invalid webhook signature or expired timestamp.' });
        return;
      }

      const { eventId, eventType, data } = verifiedEvent;

      try {
        // Step 3: Atomic Deduplication Lock using Redis SET NX EX (300 seconds TTL)
        // Returns "OK" if key was set, null if key already existed
        const lockAcquired = await redis.set(
          `webhook:event:${eventId}`,
          'PROCESSING',
          'EX',
          300,
          'NX'
        );

        if (!lockAcquired) {
          // Event was already ingested or is currently processing -> Return 200 OK immediately
          console.info(`[Webhook Duplicate] Event ${eventId} already received. Skipping.`);
          res.status(200).json({ received: true, duplicate: true });
          return;
        }

        // Step 4: Enqueue heavy business logic to background worker
        // Using eventId as the jobId guarantees deduplication at the queue level as well
        await paymentQueue.add(
          eventType,
          { eventId, eventType, data },
          {
            jobId: eventId,
            attempts: 5, // Worker will retry with backoff if database is transiently down
          }
        );

        // Step 5: Fast Acknowledgement (< 100ms)
        res.status(200).json({ received: true });
      } catch (queueError: any) {
        // If internal infrastructure (Redis/Queue) fails, return 500 so the gateway retries
        console.error(`[Webhook Ingestion Error] Failed to enqueue event ${eventId}:`, queueError);
        res.status(500).json({ error: 'Internal queue failure. Gateway should retry.' });
      }
    }
  );

  return app;
}
```

**3. Asynchronous Worker with DB Transactions (`paymentWorker.ts`)**

```typescript
interface DatabasePool {
  query(sql: string, params: any[]): Promise<any>;
  transaction<T>(callback: (client: any) => Promise<T>): Promise<T>;
}

export async function processPaymentEvent(
  job: { eventId: string; eventType: string; data: any },
  db: DatabasePool
) {
  const { eventId, eventType, data } = job;

  await db.transaction(async (trx) => {
    // 1. Permanent SQL idempotency table check with row lock
    const existing = await trx.query(
      'SELECT status FROM webhook_events WHERE event_id = $1 FOR UPDATE',
      [eventId]
    );

    if (existing.rows.length > 0 && existing.rows[0].status === 'COMPLETED') {
      console.info(`[Worker] Event ${eventId} already completed in DB. Exiting.`);
      return;
    }

    if (existing.rows.length === 0) {
      await trx.query(
        'INSERT INTO webhook_events (event_id, event_type, status, created_at) VALUES ($1, $2, $3, NOW())',
        [eventId, eventType, 'PROCESSING']
      );
    }

    // 2. Domain state machine transition
    if (eventType === 'payment_intent.succeeded') {
      const orderId = data.metadata?.orderId || data.order_id;
      const amountPaid = data.amount_received || data.amount;

      // Select order FOR UPDATE to prevent race condition with manual cancellations
      const orderRes = await trx.query(
        'SELECT id, status, total_amount FROM orders WHERE id = $1 FOR UPDATE',
        [orderId]
      );

      if (orderRes.rows.length === 0) {
        throw new Error(`Order ${orderId} not found for payment event ${eventId}`);
      }

      const order = orderRes.rows[0];

      // If order is already paid (e.g. from synchronous return URL or duplicate job), safe no-op
      if (order.status !== 'PAID') {
        if (order.total_amount !== amountPaid) {
          throw new Error(`Payment amount mismatch for order ${orderId}`);
        }

        await trx.query(
          'UPDATE orders SET status = $1, paid_at = NOW(), updated_at = NOW() WHERE id = $2',
          ['PAID', orderId]
        );

        await trx.query(
          'INSERT INTO audit_ledger (order_id, event_id, amount, action) VALUES ($1, $2, $3, $4)',
          [orderId, eventId, amountPaid, 'PAYMENT_CONFIRMED']
        );
      }
    }

    // 3. Mark webhook event as COMPLETED in the same atomic transaction
    await trx.query(
      'UPDATE webhook_events SET status = $1, updated_at = NOW() WHERE event_id = $2',
      ['COMPLETED', eventId]
    );
  });

  // 4. Non-transactional side effects executed AFTER database commit
  // If email fails, the payment state remains safe and uncorrupted
  if (eventType === 'payment_intent.succeeded') {
    try {
      // await sendReceiptEmail(data.customer_email, data.metadata.orderId);
    } catch (emailErr) {
      console.error('[Worker] Non-critical email dispatch failed:', emailErr);
    }
  }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why must webhook signature verification use the raw byte buffer rather than `JSON.stringify(req.body)`?**

When HTTP clients transmit JSON over the network, it travels as a raw byte sequence. The payment provider calculates its HMAC-SHA256 signature against those exact raw bytes. When your web framework's JSON body parser parses that stream into a JavaScript object, it loses all information about original property key order, whitespace characters, line breaks, and raw escape sequences. Calling `JSON.stringify(req.body)` creates a brand new string that differs in byte composition from what was signed. Because cryptographic hashing algorithms produce completely different outputs for even a single byte change, signature verification over re-stringified JSON will fail intermittently or under specific payload structures. The raw body buffer must be captured directly from the network stream before parsing.

**Q: How do you prevent replay attacks if an attacker intercepts a valid webhook payload and its valid signature?**

Signatures prevent payload tampering, but they do not prevent an attacker from capturing an untouched payload and resending it. To defeat replay attacks, modern payment gateways include a UNIX timestamp in the signature header and concatenate that timestamp into the signed payload string (`timestamp + "." + raw_body`). Your ingestion handler parses this timestamp and verifies that $|t_{\text{current}} - t_{\text{header}}| \le 300\text{ seconds}$ (5 minutes). If the timestamp is older than 5 minutes or set in the future, the request is rejected with HTTP 400. An attacker cannot simply modify the timestamp header because doing so invalidates the cryptographic signature over the combined string.

**Q: Why should a webhook endpoint respond with HTTP 200 immediately before performing heavy business logic?**

Payment gateways enforce aggressive HTTP timeout limits, typically between 5 and 10 seconds. If your webhook handler executes heavy operations synchronously—such as generating PDF receipts, interacting with inventory warehouses, calling third-party CRM APIs, or sending transactional emails—any transient network slowdown in those downstream services will cause your handler to exceed the gateway's timeout window. When a timeout occurs, the gateway records a delivery failure and initiates automated retries with exponential backoff. This results in duplicate deliveries and multiplies incoming traffic when your backend is already under stress. Responding with `200 OK` in under 200ms after enqueueing the raw event to an asynchronous background worker isolates your ingestion availability from downstream processing latency.

**Q: How do you guarantee exact-once business execution when the payment provider provides at-least-once delivery?**

Exact-once processing in distributed systems is achieved by combining at-least-once delivery with idempotent consumers. Every payment webhook event includes a globally unique identifier (`event_id`). To achieve idempotency:
1. Maintain an atomic deduplication store (such as Redis `SET NX` or a relational `webhook_events` table with a unique primary key on `event_id`).
2. When an event is received, attempt to register the `event_id`. If it already exists with status `COMPLETED` or `PROCESSING`, return `200 OK` immediately without reprocessing.
3. Within the background worker, wrap domain state mutations (e.g. updating order status from `PENDING` to `PAID`) and the event completion status update inside a single ACID database transaction.
4. Enforce strict state machine transitions in SQL (`UPDATE orders SET status = 'PAID' WHERE id = $1 AND status = 'PENDING'`). If the query updates 0 rows because the order is already `PAID`, the worker completes gracefully without duplicate side effects.

**Q: What HTTP status code should you return if your internal database fails while saving the webhook event, versus when the signature is invalid?**

You must distinguish between client/payload errors and internal transient failures:
- **Signature verification failure or expired timestamp:** Return `400 Bad Request` or `401 Unauthorized`. This signals to the gateway that the payload is invalid, tampered with, or unauthenticated. Gateways do not retry 4xx errors because retrying a forged request will never succeed.
- **Internal database failure or message queue outage:** Return `500 Internal Server Error` or `503 Service Unavailable`. This signals to the gateway that your server is experiencing a transient operational failure. The gateway will retain the event in its retry queue and attempt delivery again later with exponential backoff.
- **Legitimate duplicate event received:** Return `200 OK`. Returning 4xx or 5xx for a duplicate will cause the gateway to keep retrying an event you have already processed.

**Q: What happens if two webhook events for the same customer arrive out of order (e.g., a refund event arrives before the initial payment confirmation)?**

Distributed networks do not guarantee in-order delivery. If network latency delays `payment_intent.succeeded` while `charge.refunded` arrives first, a naive handler that blindly overwrites status could leave an order in the `PAID` state after it was already refunded.
To handle out-of-order deliveries:
1. Use state machine guards on all database updates. Never execute blind `UPDATE orders SET status = event.status`. Instead, define allowed transitions: `PENDING -> PAID -> REFUNDED`. A `PAID` event cannot overwrite a `REFUNDED` status.
2. Store event versioning or timestamps from the provider (`created_at` or event sequence numbers). Reject or ignore events whose timestamp is older than the currently recorded state timestamp on the target record.
3. If a dependent entity does not exist yet (e.g., a refund arrives for an order ID your database hasn't recorded), throw an error to trigger a worker retry with exponential backoff, giving the preceding event time to arrive and complete.

**Q: How should you handle secret rotation for webhook signing keys without causing downtime or rejected webhooks?**

When rotating webhook secrets in production:
1. Generate the new webhook endpoint and secret in the payment provider's dashboard alongside the old secret (dual-secret support).
2. Update your backend application configuration to accept an array of active secrets: `WEBHOOK_SECRETS = [NEW_SECRET, OLD_SECRET]`.
3. In your signature verification logic, iterate through the list of secrets. If the signature matches any active secret in the list, accept the request.
4. Once the payment gateway has been switched entirely to the new secret and traffic on the old secret drops to zero, remove the old secret from your backend configuration.

**Q: Should you rely on IP allowlisting to secure payment webhooks?**

IP allowlisting can serve as a defense-in-depth layer, but it should never be your primary security mechanism. Payment providers frequently scale their infrastructure, add new edge IP ranges, or route traffic through third-party CDNs, making static IP lists brittle and prone to breaking during provider maintenance. Furthermore, IP headers can be spoofed if reverse proxies or load balancers are misconfigured. Cryptographic HMAC-SHA256 signature verification over the raw body is mandatory and serves as the definitive zero-trust security boundary.

## 6. The Traps — What Goes Wrong

- **The Stringification Trap (Broken HMAC):**
  - *The mistake:* Using standard `express.json()` and calling `JSON.stringify(req.body)` to compute the HMAC.
  - *Why it fails:* JSON key ordering is non-deterministic in JavaScript runtimes, and whitespace is stripped. A single altered byte changes the SHA-256 hash entirely.
  - *What happens:* Legitimate payment notifications fail signature checks and get rejected with HTTP 400 in production, leaving orders stuck in "Pending".
  - *The fix:* Use `express.raw({ type: 'application/json' })` or a body-parser `verify` hook to capture the pristine `Buffer` directly from the network stream.

- **The Timing Attack Trap (`===` on Signatures):**
  - *The mistake:* Comparing cryptographic signatures using standard string equality: `if (headerSig === computedSig)`.
  - *Why it fails:* Standard string comparison terminates on the first non-matching character. An attacker can send millions of requests and measure microsecond response latency differences to guess the signature byte by byte.
  - *What happens:* An attacker can potentially forge valid signatures without knowing the secret key.
  - *The fix:* Always use `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` which executes in constant time regardless of where mismatches occur.

- **The 200-on-Internal-Crash Trap:**
  - *The mistake:* Wrapping the entire webhook handler in a blanket `try/catch` block that catches database connection failures and returns `200 OK` to prevent the gateway from reporting an alert.
  - *Why it fails:* Returning 200 tells the payment gateway: "This event was successfully processed and committed to disk; do not send it again."
  - *What happens:* If your database crashed or the queue was unreachable, the payload is permanently dropped. The gateway will never retry, and the customer is charged without receiving their goods.
  - *The fix:* Only return 200 when the event is verified and successfully persisted to your queue or database. Return 500 on internal failures so the gateway retries.

- **The Synchronous Side-Effect Cascade (Timeout Storm):**
  - *The mistake:* Sending confirmation emails, generating invoices, or calling third-party fulfillment APIs directly inside the webhook HTTP request-response cycle.
  - *Why it fails:* Third-party APIs occasionally experience multi-second latency spikes. When your handler exceeds the gateway's timeout (5–10s), the gateway marks the delivery as failed and fires automated retries.
  - *What happens:* Your server becomes overwhelmed handling retried duplicate webhooks while waiting on slow external APIs, resulting in server-wide thread exhaustion and cascading downtime.
  - *The fix:* Decouple ingestion from execution. The HTTP route only verifies, records, enqueues, and returns 200. Heavy operations run in a background worker.

- **The Non-Atomic Deduplication Race Condition:**
  - *The mistake:* Checking for duplicates using a non-atomic `SELECT` followed by an `INSERT` (`const exists = await db.find(...); if (!exists) await db.create(...)`).
  - *Why it fails:* If two identical webhook retries hit different server instances simultaneously, both execute the `SELECT` query at the same instant, both see no existing record, and both proceed to process the payment.
  - *What happens:* Duplicate credits are issued, duplicate orders are shipped, or balance ledgers double-count funds.
  - *The fix:* Use atomic primitives: Redis `SET key value NX EX` or SQL unique constraints with `INSERT ... ON CONFLICT DO NOTHING` and `SELECT ... FOR UPDATE` row locks.

- **The Out-of-Order State Machine Regression:**
  - *The mistake:* Updating order status blindly from the incoming webhook payload: `order.status = event.data.status`.
  - *Why it fails:* Network jitter can cause a delayed `payment_intent.succeeded` event to arrive *after* a `charge.refunded` event has already been processed.
  - *What happens:* A refunded or canceled order gets reverted back to "Paid", resulting in unauthorized product delivery.
  - *The fix:* Implement unidirectional state machines in domain logic (`PENDING -> PAID -> REFUNDED`). Never allow a state transition to revert to a prior state without explicit administrative intervention.

## 7. Compare With Related Concepts

- **Webhooks (Push Notifications) vs. Polling (Pull Queries):**
  - *The Difference:* Webhooks push event data from the payment gateway to your server over HTTP in real time as events occur. Polling requires your backend to run a scheduled cron job querying the gateway API (`GET /v1/charges/ch_123`) periodically to check status changes.
  - *Rule of Thumb:* Use Webhooks as the primary mechanism for real-time, event-driven state updates. Use Polling as a secondary, scheduled reconciliation job (e.g., hourly or daily) to catch webhooks lost to permanent infrastructure outages.

- **HMAC Signatures (Symmetric) vs. Public/Private Key Signatures (Asymmetric RSA/ECDSA):**
  - *The Difference:* HMAC uses a single pre-shared secret key known to both the payment gateway and your backend to generate and verify hashes. Asymmetric signing uses a private key held by the provider to sign and a public key (or JWKS URL) published by the provider for consumers to verify.
  - *Rule of Thumb:* Use HMAC when integrating with direct payment gateways (Stripe, Razorpay, GitHub) where secrets can be securely established in a private dashboard. Use Asymmetric signatures when receiving broadcasts from multi-tenant identity providers or decentralized event meshes.

- **Webhook Callbacks (Server-to-Server) vs. Client Redirect URLs (Return URLs):**
  - *The Difference:* A client return URL is a browser redirect (`GET /checkout/success?session_id=...`) triggered after the user pays on the checkout page. The user can close their laptop, lose mobile signal, or tamper with query parameters before the redirect completes. A webhook callback is an asynchronous, direct, cryptographically signed HTTP `POST` from gateway servers to your backend servers.
  - *Rule of Thumb:* Use Client Redirect URLs only to display a visual "Processing your order..." UI to the customer. NEVER fulfill orders, provision subscriptions, or grant digital goods based on client redirects—only fulfill upon verified webhook receipt.

- **Outbound Idempotency Keys vs. Inbound Webhook Deduplication:**
  - *The Difference:* An outbound idempotency key (`Idempotency-Key: uuid`) is generated by your backend and sent in header requests *to* the payment provider to prevent charging a customer twice during network timeouts. Inbound deduplication is enforced *by your webhook handler* using the provider's `event_id` to prevent processing the same payment notification multiple times.
  - *Rule of Thumb:* Use Outbound Idempotency Keys when your server initiates financial mutations; use Inbound Deduplication when your server consumes incoming financial notifications.

## 8. 🧠 The Memory Hook

A payment webhook is an unauthenticated, public doorbell that can ring multiple times with fake, delayed, or replayed messages. Secure it with the **4 V's**:

1. **Verify** the raw byte HMAC signature in constant time.
2. **Validate** the timestamp header freshness within 300 seconds.
3. **Verify & Deduplicate** the event ID with an atomic lock before touching state.
4. **Vent** heavy processing into an asynchronous background queue and return `200 OK` in milliseconds.
