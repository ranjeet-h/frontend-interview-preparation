# Payment Webhook Called Multiple Times — How to Handle It

## 1. The Real-World Problem — When You Actually Hit This

Your checkout works perfectly in testing. A user pays $49, Stripe calls your webhook, you mark the order as paid, you send the confirmation email. You ship the product.

Then one Tuesday your logs show the same payment webhook arrived three times within 40 seconds. Your handler ran three times. You credited the user's wallet three times. Or you sent three shipping orders. Or your database threw a duplicate error and now the provider keeps retrying every hour and spamming your alert channel.

This is not a bug in the payment provider. It is expected behavior. Webhooks are delivered at-least-once by design. The provider will retry if your server is slow, if the network drops after you processed the event but before you returned 200, if their system does a replay for debugging, or if two delivery workers race. If your endpoint is not idempotent, every retry becomes a duplicate side effect. If you return 500 on a duplicate instead of 200, you create an infinite retry loop. If you skip signature verification, an attacker can replay a fake event and you will credit them for free.

The interview question is really: can you make a money handler that is correct the first time and harmless the next ten times?

## 2. The Analogy — Make the Mechanic Obvious

Think of a courier delivering a signed letter with a tracking number.

The courier's rule is simple: I must make sure you get this letter at least once. If you do not sign for it quickly, I will come back and try again. If I am not sure you signed, I will come back again. I may even knock twice on purpose.

Your job at the door has four steps.

First, check the signature on the envelope. If the signature does not match the courier's real signature, you throw it away. That is signature verification.

Second, check the tracking number. You keep a small ledger by the door where you write down every tracking number you have already accepted. If this tracking number is already in the ledger, you smile, sign the receipt, and throw away the copy. You do not open the letter again. That is deduplication via event_id.

Third, you sign the receipt immediately, even if you still need time to read the letter inside. That is returning 200 fast and processing longer work in the background.

Fourth, if you have to send a receipt to someone else, you write it down in your ledger before you hand it over, so even if you crash on the way to the post office you can still send it later. That is the outbox pattern for work you produce.

The same tracking number, the same signature check, and the same ledger make ten knocks harmless. Without them, every extra knock creates another order.

## 3. The Full Explanation — How It Actually Works

Start with the guarantee. Most payment providers promise at-least-once delivery, never exactly-once. Exactly-once is impossible over a network where either side can fail after work is done but before the acknowledgement arrives. The provider cannot know if you processed it unless you say so with a 2xx. So they retry on any non-2xx, any timeout, any network error. That means duplicates are normal. Your system must expect them.

Handling that correctly comes down to five pieces that fit together.

Signature verification comes first and it must happen before any business logic. The provider signs the raw request body with a secret you both share, usually an HMAC like Stripe's `Stripe-Signature` header which contains a timestamp and an hmac. You recompute the HMAC with your secret and do a timing-safe compare. You also reject if the timestamp is too old, usually more than five minutes, to prevent replay attacks where an attacker resends a valid old webhook. If you parse JSON first and then stringify it to verify, the signature will not match because whitespace changed. You need the raw body bytes for verification.

Deduplication is next. Every webhook event has a unique id like `evt_1Q...`. You store that id in a table with a unique constraint. Before you do any business work, you try to insert the id. If the insert succeeds, you are the first handler and you proceed. If it fails with a unique violation, this is a replay and you return 200 without doing business work. This has to be atomic. Checking `SELECT` then `INSERT` has a race where two concurrent deliveries both think they are first. Use the database's uniqueness guarantee. That table is tiny: `webhook_events(event_id PRIMARY KEY, type, received_at, status)`. Some teams also store the raw payload for debugging.

Business work itself must be idempotent too, not just the dedup table. Say the event is `payment_intent.succeeded` for order 42. You should not blindly add $49 again. You update the order only if it is still in `pending` state. In SQL that is `UPDATE orders SET status = 'paid' WHERE id = 42 AND status = 'pending'`. The `WHERE` condition is your safety net. If the order is already paid, the update touches zero rows and you do nothing. For wallet credits, you insert a ledger entry keyed by event_id, not increment a counter blindly.

Return the right status code quickly. If you did work or you already did it before, return 200. Only return 4xx or 5xx if you truly could not verify or could not store the event. If you return 500 on a duplicate, the provider will retry forever. If your work takes longer than a second or two, acknowledge first and process later. The pattern is: verify, insert event_id, return 200, then run the heavy work in a background job or queue. Or do the insert and state transition inside one transaction and queue the side effects like email.

Retries from your side also need backoff. When you call downstream systems after a webhook, or when you are the sender that needs to deliver webhooks to others, retries must use exponential backoff with jitter. That means wait 1 second, then 2, then 4, then 8, and add random jitter so a fleet of retries does not thundering herd the same second. Stripe does this for you when it sends to you. When you send to your own consumers, you do it.

The outbox pattern belongs on the provider side. If your service updates the database and then tries to send a webhook directly, you can update but crash before sending and lose the event, or send but crash before marking it sent and send it twice without a record. The outbox fixes this by writing the event to an `outbox` table inside the same database transaction that updates your business state. A separate reliable worker reads that table and delivers the webhooks with retries. Either both the business change and the outbox row commit, or neither does. No lost events.

Replays deserve special handling. Some are accidental duplicates, some are intentional. A dashboard operator may click replay on the same event_id, or the provider may send the same logical payment under a new event_id. Your dedup catches same event_id. For same payment with different event_ids, your business idempotency catches it because the order is already paid. Treat replay after success as success and return 200. Log it so you can see how often it happens.

Finally, think about ordering. Providers do not guarantee strict order. You can receive `payment.succeeded` before `payment.created`. Do not assume sequence. Make each handler handle any state: if a later event arrives early, store it and let the earlier one become a no-op when it arrives.

## 4. See It In Practice — Real Code or Queries

Here is a complete shape of a safe handler. The ideas matter more than the framework, but the code is runnable.

First, the database pieces. Both the dedup table and the idempotent update matter.

```sql
-- Postgres: dedup table for received webhooks
CREATE TABLE webhook_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Outbox table for webhooks YOU send to others
CREATE TABLE outbox_events (
  id BIGSERIAL PRIMARY KEY,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  delivered BOOLEAN NOT NULL DEFAULT false,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_outbox_next_attempt ON outbox_events (next_attempt_at) WHERE delivered = false;

-- Orders table uses state guard for idempotency
-- UPDATE orders SET status = 'paid' WHERE id = $1 AND status = 'pending'
```

Node.js with Express. The key is raw body for signature and atomic insert for dedup.

```js
import express from 'express';
import crypto from 'crypto';
import { Pool } from 'pg';

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET; // whsec_...
const TOLERANCE_SEC = 300; // 5 minutes

// Need raw body bytes to verify signature, not parsed JSON
app.post('/webhooks/payments',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) return res.status(400).send('missing signature');

    // 1. Verify signature before anything else
    let event;
    try {
      event = verifyStripeSignature(req.body, signature, WEBHOOK_SECRET, TOLERANCE_SEC);
    } catch (err) {
      console.warn('webhook signature failed', err.message);
      return res.status(400).send('invalid signature');
    }

    // 2. Dedup via event_id with unique constraint — atomic
    // If two deliveries race, only one insert succeeds
    try {
      await pool.query(
        `INSERT INTO webhook_events (event_id, type, payload) VALUES ($1, $2, $3)`,
        [event.id, event.type, JSON.stringify(event)]
      );
    } catch (err) {
      if (err.code === '23505') { // Postgres unique_violation
        console.info('duplicate webhook ignored', event.id);
        return res.status(200).send('already processed');
      }
      throw err;
    }

    // 3. Return 200 fast, or do minimal transactional work then return 200
    // Here we do the idempotent state transition inside a transaction
    // and queue side effects instead of doing them inline
    try {
      await handlePaymentEvent(event);
      await pool.query(
        `UPDATE webhook_events SET status = 'processed' WHERE event_id = $1`,
        [event.id]
      );
      return res.status(200).send('ok');
    } catch (err) {
      // Do not return 500 for a duplicate business state — that is still success
      // Only 500 if we truly failed and want the provider to retry
      console.error('webhook processing failed, will retry', event.id, err);
      await pool.query(
        `UPDATE webhook_events SET status = 'failed' WHERE event_id = $1`,
        [event.id]
      );
      return res.status(500).send('retry');
    }
  }
);

function verifyStripeSignature(rawBody, header, secret, toleranceSec) {
  // Stripe header looks like: t=1492774577,v1=5257a869...,v0=...
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const timestamp = parseInt(parts.t, 10);
  const expectedSig = parts.v1;

  const age = Math.floor(Date.now() / 1000) - timestamp;
  if (age > toleranceSec) throw new Error('timestamp outside tolerance');

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const hmac = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  // timingSafeEqual prevents timing attacks
  const a = Buffer.from(hmac, 'hex');
  const b = Buffer.from(expectedSig, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('signature mismatch');
  }
  return JSON.parse(rawBody.toString('utf8'));
}

async function handlePaymentEvent(event) {
  if (event.type === 'payment_intent.succeeded') {
    const orderId = event.data.object.metadata.order_id;
    // Idempotent business update: only transition if still pending
    const result = await pool.query(
      `UPDATE orders SET status = 'paid', paid_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [orderId]
    );
    if (result.rowCount === 0) {
      console.info('order already paid or not found', orderId);
      return;
    }
    // Side effects like email or fulfillment go via outbox or queue, not inline
    await pool.query(
      `INSERT INTO outbox_events (aggregate_id, event_type, payload)
       VALUES ($1, 'order.paid', $2)`,
      [orderId, JSON.stringify({ orderId, eventId: event.id })]
    );
  }
}

// Separate worker delivers outbox events with exponential backoff + jitter
async function deliverOutbox() {
  const { rows } = await pool.query(
    `SELECT * FROM outbox_events
     WHERE delivered = false AND next_attempt_at <= now()
     ORDER BY next_attempt_at LIMIT 10`
  );
  for (const row of rows) {
    try {
      await fetch('https://consumer.example.com/webhooks', {
        method: 'POST',
        body: JSON.stringify(row.payload),
        headers: { 'Content-Type': 'application/json' }
      });
      await pool.query(`UPDATE outbox_events SET delivered = true WHERE id = $1`, [row.id]);
    } catch (err) {
      const attempt = row.attempt_count + 1;
      const backoffSec = Math.min(3600, Math.pow(2, attempt)) + Math.random() * 5;
      await pool.query(
        `UPDATE outbox_events
         SET attempt_count = $1, next_attempt_at = now() + $2 * INTERVAL '1 second'
         WHERE id = $3`,
        [attempt, backoffSec, row.id]
      );
    }
  }
}
```

Python with FastAPI uses the same principles. The raw body detail is the same trap.

```python
import hmac, hashlib, time, json
from fastapi import FastAPI, Request, HTTPException
import asyncpg

app = FastAPI()
WEBHOOK_SECRET = "whsec_..."
TOLERANCE = 300

@app.post("/webhooks/payments")
async def payments_webhook(request: Request):
    raw = await request.body()  # must be raw bytes for verification
    sig_header = request.headers.get("stripe-signature", "")

    # 1. Verify
    try:
        event = verify_signature(raw, sig_header, WEBHOOK_SECRET, TOLERANCE)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 2. Dedup
    try:
        await db.execute(
            "INSERT INTO webhook_events (event_id, type, payload) VALUES ($1, $2, $3)",
            event["id"], event["type"], json.dumps(event)
        )
    except asyncpg.UniqueViolationError:
        return {"status": "already_processed"}

    # 3. Idempotent business transition
    rowcount = await db.execute(
        "UPDATE orders SET status = 'paid', paid_at = now() "
        "WHERE id = $1 AND status = 'pending'",
        event["data"]["object"]["metadata"]["order_id"]
    )
    # rowcount == 0 means already paid — still a success
    return {"status": "ok"}

def verify_signature(raw_body: bytes, header: str, secret: str, tolerance: int):
    parts = dict(p.split("=") for p in header.split(",") if "=" in p)
    ts = int(parts.get("t", "0"))
    if abs(time.time() - ts) > tolerance:
        raise ValueError("timestamp outside tolerance")
    signed = f"{ts}.{raw_body.decode()}".encode()
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, parts.get("v1", "")):
        raise ValueError("signature mismatch")
    return json.loads(raw_body)
```

What makes this correct: verification uses raw bytes, dedup uses a database unique constraint not an in-memory set, business logic guards on state, we return 200 on duplicates so the provider stops retrying, and downstream side effects go through an outbox with backoff rather than being done inline where a crash would lose them.

## 5. Interview Questions — All of Them, Done Properly

**Q: Why does a payment webhook get called multiple times? Is it a bug?**

No. Providers deliver at-least-once on purpose. They consider a delivery failed if they get no 2xx, hit a timeout, or see a network error. Your server might have processed the event but timed out before responding, so the provider retries and you see the same event again. They also do intentional replays from their dashboard. You must expect and handle duplicates on every webhook endpoint.

**Q: What is idempotent handling and how do you make a payment webhook idempotent?**

Idempotent means handling the same input multiple times has the same effect as handling it once. For webhooks you get there with two layers. First, a `webhook_events` table with `event_id` as primary key. Try to insert on arrival. If insert fails with unique violation, return 200 and do nothing. Second, make the business update itself conditional. Do not blindly add money. Use `WHERE status = 'pending'` or insert a ledger row keyed by event_id so the second attempt touches zero rows. Either layer alone is not enough because some replays use new event_ids for the same payment.

**Q: Where should you verify the webhook signature and what is the common mistake?**

Verify first, before any business work, using the raw request body bytes. Providers sign the exact bytes they send. If you parse JSON into an object and then re-stringify, whitespace and key order change and the signature will never match. Use `express.raw()` in Express or `await request.body()` in FastAPI to get bytes. Use `crypto.timingSafeEqual` or `hmac.compare_digest` for the compare. Also check the timestamp is within tolerance to block replay of old valid payloads.

**Q: What HTTP status should you return for a duplicate event?**

Return 200. A duplicate that you already processed is a success. If you return 400 or 500, the provider treats it as a failure and retries again, which creates a loop and alert noise. Only return non-2xx when you genuinely did not accept the event — bad signature, missing dedup insert due to a real DB failure, or you have not stored it safely yet.

**Q: Should you process the webhook inline or in a background job?**

Verify and dedup inline, then either return 200 immediately and queue the rest, or do a single short transaction inline and return 200. Do not hold the HTTP response open while you call email, fulfillment, and analytics. That makes you slow, which causes provider timeouts, which causes retries. The safe pattern is: verify, insert event_id in a transaction, commit, return 200, then process heavy work from a queue. If you can keep the transactional work under a couple hundred milliseconds, doing it inline before returning is also fine as long as you use the outbox for side effects.

**Q: What is the outbox pattern and when do you need it?**

You need it when you are the sender that must not lose events. Suppose you mark an order paid and need to send a webhook to a partner. If you update the DB and then call `fetch` and crash between the two, you either lost the event or sent it with no record. The outbox solves this by writing the event into an `outbox_events` table inside the same database transaction that updates the order. A separate worker poll reads undelivered rows and delivers them with retries. The transaction guarantees either both the state change and the event are stored or neither is.

**Q: How should retries with backoff work?**

Use exponential backoff with jitter. Wait `2^attempt` seconds with a cap, plus random jitter. So attempts wait roughly 1s, 2s, 4s, 8s, 16s, up to maybe an hour, each with a few seconds of randomness added. Jitter prevents thousands of failed webhooks from all retrying at the exact same second. Stripe and most providers already do this when calling you. When your outbox worker calls others, implement it there too.

**Q: How do you handle out-of-order delivery?**

Do not rely on order. You might receive `succeeded` before `created`. Make each handler tolerate any starting state. If you need ordering for a specific flow like refunds after payment, check the business state first: a refund handler should verify the payment is already marked paid, and if not, either queue itself for later or store its intent and let the payment handler finish the transition.

**Q: What would you monitor for webhook health?**

Track retry rate per event type, duplicate rate, signature failure rate, processing latency, and age of undelivered outbox rows. Alert if signature failures spike, which suggests a secret rotation problem or an attack, or if outbox rows sit undelivered for more than a threshold, which means your delivery worker is down. Log every event_id, its processing status, and its final outcome so you can answer why order 42 was paid or not.

## 6. The Traps — What Goes Wrong in Production

Deduping with an in-memory set or cache instead of a database unique constraint. It feels quick to store event ids in a Map or Redis without persistence guarantees. On restart you lose the set and replay old events get processed again. With two servers, each has its own memory and both process the duplicate. The database unique constraint is the only correct answer for money. Redis can help as a fast pre-check, but the DB is the source of truth.

Verifying the signature on parsed JSON. This is the number one implementation bug. The candidate writes `JSON.parse(req.body)` then `JSON.stringify` to verify and it never matches. You must configure raw body middleware before the JSON parser for that route. In Express that means `express.raw({ type: 'application/json' })` on the webhook route specifically.

Forgetting timing-safe compare and timestamp tolerance. Using plain `===` leaks timing information and skipping the timestamp check lets an attacker replay a valid signed payload hours later. Always use `timingSafeEqual` and reject old timestamps.

Returning 500 on duplicates. It feels logical to treat a duplicate insert error as a failure. It is not. The provider sees 500 and retries, so your error rate climbs and your logs fill up. Catch the unique violation explicitly and return 200 with already processed.

Making the business logic non-idempotent even though you have a dedup table. Some replays reuse the same payment intent under a new event_id, or the dedup row gets cleaned up too early by a retention job. If your handler does `balance += 49` without checking, a second event_id still adds money. Guard the business row with a state check or insert a ledger entry keyed by an idempotency key like payment_intent id.

Processing everything inline and timing out. If your handler sends three downstream HTTP calls before responding, you will exceed the provider's timeout, often 5 to 10 seconds. The provider retries, you get more duplicates, and now you have a feedback loop that worsens load. Verify, dedup, return 200 fast, and do heavy work via a queue.

Losing events by sending webhooks without an outbox. Updating the order and then calling `fetch` outside the transaction feels natural but is not safe. If the process crashes after the update but before the send, the downstream never learns about the payment. The outbox inside the same transaction prevents this.

Not handling concurrent delivery. Two deliveries of the same event can arrive at two servers at the same instant. A `SELECT` then `INSERT` pattern will let both through. Only `INSERT` with a unique constraint and catching the violation is safe, or a `INSERT ... ON CONFLICT DO NOTHING` followed by checking row count.

Ignoring idempotency on the fulfillment side. Even if you handle the payment webhook correctly, you might call the shipping API twice. Fulfillment calls need their own idempotency keys derived from event_id so retrying them is safe too.

## 7. Compare With Related Concepts

**Webhook vs polling.** A webhook pushes an event to you when something happens, polling makes you ask repeatedly if anything happened. Webhooks are lower latency and lower load when you need to react immediately to external events, but you inherit the at-least-once and verification burden described here. Polling is simpler to reason about and trivially idempotent because you control the cursor, but it is slower and wasteful when events are rare. Rule of thumb: use webhooks for payments and external events where latency matters, use polling when you control both sides or when the provider has no webhook with signatures.

**Webhook vs message queue.** Both deliver at-least-once and both require idempotent consumers. A queue like SQS or RabbitMQ is inside your system and you own the retry and dead-letter configuration. A webhook is over the public internet with an HTTP contract and HMAC verification. The dedup and outbox thinking is the same. Use a queue for work between your own services, use webhooks when crossing trust boundaries to an external consumer.

**Event dedup table vs business idempotency key.** The dedup table answers did I see this delivery before, keyed by provider's event_id. The business idempotency key answers did I already apply this business effect, keyed by payment_intent id or order id. You need both. The dedup table catches exact replay of the same delivery. The business guard catches same logical payment delivered under a new event_id, or a second payment attempt for the same order.

**Idempotency key vs unique constraint.** An idempotency key is the concept, a unique constraint is the enforcement mechanism. Saying we will use an idempotency key without creating a unique index is just a wish. The database constraint is what makes the key reliable under concurrency and restarts.

**Transactional outbox vs dual write.** Dual write updates the DB and then fires a network call inline. Outbox writes the intent to send into the DB inside the same transaction, then a separate worker delivers it. Dual write can lose or double send. Outbox cannot lose an event and can only double deliver, which is safe if the consumer is idempotent. For money, always prefer outbox over dual write.

**Exactly-once vs at-least-once plus idempotency.** Exactly-once delivery over a network with failures does not exist. The honest guarantee is at-least-once delivery plus exactly-once effect through idempotency. Interviewers listen for this distinction. Claiming exactly-once delivery is a red flag.

## 8. 🧠 The Memory Hook

Webhooks knock at least once, never exactly once. Check the signature on the raw envelope, write the tracking number in the ledger before you open the letter, and make opening it a second time harmless. Duplicate knocks should get a smile and a 200, not another payment.
