# Preventing Duplicate Submissions in Web APIs: Idempotency Keys, State Locks, and Token Buckets

## 1. Why This Exists — The Problem First

A mobile user stands in a crowded train station with a fluctuating cellular connection and taps "Pay $250" to buy concert tickets. The mobile client sends a `POST /api/v1/checkout` request. The backend server receives the request, processes the credit card charge, and writes the confirmed reservation to the database. But before the server can return the `200 OK` response, the train enters a tunnel. The cellular connection drops, and the TCP socket abruptly breaks.

From the client's perspective, the request simply timed out. The mobile app's networking library automatically retries failed requests in the background. Meanwhile, the anxious user taps "Pay $250" a second time. That retry hits a different backend instance behind the load balancer. Without duplicate prevention, the second server processes another $250 payment, creating a duplicate order, double-charging the customer's credit card, and corrupting the accounting ledger.

Distributed networks are inherently unreliable and operate under "at-least-once" delivery semantics. Packets get dropped, retried by proxies like Cloudflare or Envoy, delayed in transit, or re-sent by browsers when users double-click. If your backend treats every incoming `POST` as a brand-new intent, every routine network hiccup becomes a critical data corruption event. Duplicate prevention transforms chaotic, repeated network retries into safe, deterministic operations.

## 2. The Analogy — Make It Obvious

Think of a luxury hotel valet with a numbered claim ticket system.

When you pull up to the hotel entrance and hand your car keys to the valet, the attendant does not just jump into the car. First, they tear a claim ticket from a booklet, hand you the physical stub labeled `#8492`, and place the matching stub into a wooden organizer board at the valet desk.

Inside the valet office, the board has three distinct states for slot `#8492`:
- **Step 1: The Yellow Tag ("PARKING IN PROGRESS").** The attendant places a yellow tag in slot `#8492` along with a note describing your vehicle: "Blue 2024 Honda Civic." If your spouse walks up to a different valet attendant five seconds later holding ticket `#8492` in a panic, that attendant looks at the board, sees the yellow tag, and says: *"We are already parking this car right now; please wait."* They do not dispatch a second driver to hunt down a car that is already moving.
- **Step 2: The Green Card ("PARKED — Spot B-14").** Once the car is safely parked, the driver replaces the yellow tag with a permanent green receipt card: *"Parked at Spot B-14, Key in Drawer 3."*
- **Step 3: The Cached Retrieval.** If you return three hours later and hand your stub `#8492` to the desk, the valet looks at slot `#8492`, reads the green card, and retrieves your car from Spot B-14. If you ask again ten minutes later, they don't park another car or charge you another fee; they read the exact same card.
- **Step 4: The Fraud / Mismatch Check.** If someone brings ticket `#8492` but claims they checked in a "Red Ferrari," the attendant compares the description to the original log ("Blue Honda Civic") and immediately rejects the request.

In web APIs:
- The ticket stub `#8492` is the client-generated `Idempotency-Key` (UUIDv4).
- The valet board is Redis.
- The yellow tag is an atomic distributed state lock (`IN_PROGRESS`).
- The green receipt card is the cached HTTP response code and payload (`COMPLETED`).
- The vehicle description match is a cryptographic payload hash (SHA-256).

## 3. How It Actually Works — The Full Explanation

### HTTP Method Semantics: Safe vs. Idempotent

HTTP methods have precise mathematical guarantees defined in RFC 9110:

- **Safe Methods (`GET`, `HEAD`, `OPTIONS`)**: These methods are strictly read-only and must never produce side effects on the server. Calling `GET /orders/123` ten thousand times will never modify order state. Safe methods are inherently idempotent.
- **Idempotent Methods (`PUT`, `DELETE`)**: Calling these methods $N > 0$ times produces the exact same server state as calling them once. `PUT /users/42` with `{ "name": "Alice" }` replaces the resource; repeating it ten times leaves the name as "Alice". `DELETE /users/42` removes the user; the first call returns `200` or `204`, and subsequent calls return `404`, but the end state (user 42 does not exist) is identical. However, `PUT` and `DELETE` are not safe because they modify state.
- **Non-Idempotent Methods (`POST`, `PATCH`)**: By default, `POST /orders` creates a new resource on every invocation. Calling it three times creates three orders. `PATCH /accounts/10` with `{ "increment": 50 }` adds $150 across three retries.

To make `POST` and `PATCH` operations resilient to network retries, APIs introduce application-level idempotency contracts.

### The Idempotency Key Architecture

When a client initiates a mutating action (such as placing an order or authorizing a payment), it follows a structured lifecycle:

1. **Client Intent Generation**: When the user taps the final button, the client generates a unique UUIDv4 representing that specific action instance (e.g., `Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d`). This key stays constant across all automatic network retries for that single user intent.
2. **Payload Fingerprinting**: When the server receives the request, it extracts the `Idempotency-Key` and computes a cryptographic hash (SHA-256) of the request parameters: method, route, authenticated user ID, and normalized request body.
3. **Atomic State Acquisition in Redis**: The server attempts to create an idempotency record in Redis using atomic operations:
   - `SET idempotency:{userId}:{key} { status: "IN_PROGRESS", hash: "..." } NX EX 120`
   - The `NX` flag guarantees that the key is written only if it does not already exist.
   - The `EX 120` flag sets a short 2-minute lease TTL to prevent deadlocks if the server container crashes mid-execution.
4. **Branching Logic Based on Redis State**:
   - **Case A: Key Did Not Exist (Acquisition Succeeded)**: The server owns the lock. It executes the core business logic (e.g., runs the database transaction, charges the credit card). Upon completion, it updates the Redis record to `status: "COMPLETED"`, storing the response status code, headers, and body with an extended TTL (typically 24 to 48 hours).
   - **Case B: Key Exists with `status: "IN_PROGRESS"` (Concurrent Duplicate)**: Another server process is currently handling the original request. The server immediately returns HTTP `409 Conflict` with a `Retry-After: 2` header, or temporarily holds the connection waiting on a Redis Pub/Sub event for completion.
   - **Case C: Key Exists with `status: "COMPLETED"` (Replay)**: The original operation already finished. The server verifies that the incoming request's payload hash matches the stored hash:
     - If the hashes match, the server bypasses all business logic and immediately replays the cached HTTP status code and response body, adding a response header like `X-Cache: Idempotent-Replay`.
     - If the hashes differ, the client reused the same idempotency key for two different actions. The server immediately returns HTTP `422 Unprocessable Entity` or `400 Bad Request`.
   - **Case D: Transient Failure Cleanup**: If the server encounters an unhandled exception or 500 error before completing the transaction, it deletes the Redis key so the client is free to retry immediately.

### Handling the Millisecond Race Condition

If a user double-clicks and two identical requests reach two different server containers at the exact same millisecond:

```
Request 1 (Node A) --------> [ Redis: SET key IN_PROGRESS NX ] --------> Returns OK (Processes Transaction)
                                         |
Request 2 (Node B) --------> [ Redis: SET key IN_PROGRESS NX ] --------> Returns NIL (Collision Detected)
                                         |
                                         +----> Reads status: "IN_PROGRESS"
                                         +----> Returns HTTP 409 Conflict (No logic executed)
```

Because Redis commands are single-threaded and atomic, exactly one node acquires the `NX` lock. The second node is immediately halted at the door.

### Multi-Layered Defense: UI vs. Server

- **Frontend Controls (UX Ergonomics)**: Disabling buttons after the first click, showing loading spinners, applying debouncing, and using `AbortController` to cancel stale in-flight fetches improve user experience and eliminate 95% of accidental double-clicks.
- **Backend Controls (Authoritative Guarantee)**: The browser UI can be bypassed by browser extensions, network proxies, automatic mobile OS background retries, and direct API clients. Backend idempotency enforcement is the only authoritative boundary that guarantees data integrity.

## 4. Real Code — See It Working

Here is a production-grade idempotency middleware for Node.js and Express using Redis (`ioredis`) and cryptographic payload hashing:

```javascript
// idempotencyMiddleware.js
import crypto from 'crypto';

/**
 * Creates an Express middleware for API request idempotency.
 * @param {import('ioredis').Redis} redisClient - Active Redis connection instance
 * @param {Object} options - Configuration options
 * @param {number} [options.lockTtlSeconds=120] - Lock duration for in-progress operations
 * @param {number} [options.completedTtlSeconds=86400] - Retention duration for completed responses (24h)
 */
export function createIdempotencyMiddleware(redisClient, options = {}) {
  const { lockTtlSeconds = 120, completedTtlSeconds = 86400 } = options;

  return async function idempotencyMiddleware(req, res, next) {
    // Only apply idempotency to mutating HTTP methods
    if (!['POST', 'PATCH'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      // If header is absent, proceed normally (or reject if strict idempotency is mandated)
      return next();
    }

    // Validate UUID format to prevent key injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(idempotencyKey)) {
      return res.status(400).json({
        error: 'Invalid Idempotency-Key format. Must be a valid UUIDv4.',
      });
    }

    // Namespace key by authenticated user ID to prevent cross-tenant key collisions
    const userId = req.user?.id || 'anonymous';
    const redisKey = `idempotency:${userId}:${idempotencyKey}`;

    // Compute deterministic SHA-256 hash of the request signature + body
    const requestPayload = JSON.stringify(req.body || {});
    const payloadHash = crypto
      .createHash('sha256')
      .update(`${req.method}:${req.originalUrl}:${requestPayload}`)
      .digest('hex');

    const inProgressValue = JSON.stringify({
      status: 'IN_PROGRESS',
      hash: payloadHash,
      createdAt: Date.now(),
    });

    try {
      // Atomic SET NX: returns 'OK' if key was set, null if key already exists
      const acquired = await redisClient.set(
        redisKey,
        inProgressValue,
        'EX',
        lockTtlSeconds,
        'NX'
      );

      if (!acquired) {
        // Key exists: check status and handle replay or collision
        const rawRecord = await redisClient.get(redisKey);
        if (!rawRecord) {
          // Key expired between SET and GET; safe to pass through or prompt retry
          return res.status(503).json({ error: 'Idempotency state expired. Please retry.' });
        }

        const record = JSON.parse(rawRecord);

        // Verify payload integrity: reject if key is reused with altered body
        if (record.hash !== payloadHash) {
          return res.status(422).json({
            error: 'Idempotency key collision: payload does not match the original request.',
          });
        }

        // If previous request is still running, inform client to back off
        if (record.status === 'IN_PROGRESS') {
          res.setHeader('Retry-After', '2');
          return res.status(409).json({
            error: 'A request with this idempotency key is currently being processed.',
          });
        }

        // Operation completed previously: replay cached response
        if (record.status === 'COMPLETED') {
          res.setHeader('X-Cache', 'Idempotent-Replay');
          Object.entries(record.responseHeaders || {}).forEach(([header, value]) => {
            res.setHeader(header, value);
          });
          return res.status(record.statusCode).send(record.responseBody);
        }
      }

      // Lock successfully acquired. Capture original res.send to cache completed output.
      const originalSend = res.send.bind(res);

      res.send = function (body) {
        // Only cache deterministic outcomes (2xx and 4xx). Never cache 5xx server errors.
        if (res.statusCode < 500) {
          const completedValue = JSON.stringify({
            status: 'COMPLETED',
            hash: payloadHash,
            statusCode: res.statusCode,
            responseHeaders: { 'Content-Type': res.getHeader('Content-Type') || 'application/json' },
            responseBody: body,
            completedAt: Date.now(),
          });

          // Store completed response with 24-hour retention
          redisClient.set(redisKey, completedValue, 'EX', completedTtlSeconds).catch((err) => {
            console.error('Failed to cache completed idempotency record:', err);
          });
        } else {
          // If server error occurred, release lock so client can retry
          redisClient.del(redisKey).catch(() => {});
        }

        return originalSend(body);
      };

      next();
    } catch (error) {
      // On Redis failure, clean up and pass error down the chain
      await redisClient.del(redisKey).catch(() => {});
      next(error);
    }
  };
}
```

Here is the Express application consuming the middleware:

```javascript
// server.js
import express from 'express';
import Redis from 'ioredis';
import { createIdempotencyMiddleware } from './idempotencyMiddleware.js';

const app = express();
const redis = new Redis('redis://localhost:6379');

app.use(express.json());

// Mock authentication middleware
app.use((req, res, next) => {
  req.user = { id: 'usr_98765' }; // Attach authenticated identity
  next();
});

// Apply idempotency middleware to API routes
const idempotency = createIdempotencyMiddleware(redis);

app.post('/api/v1/payments', idempotency, async (req, res) => {
  const { amount, currency, recipientId } = req.body;

  // Simulate payment processing delay and ledger persistence
  await new Promise((resolve) => setTimeout(resolve, 800));

  const transactionId = `txn_${Date.now()}`;
  const responseData = {
    success: true,
    transactionId,
    amount,
    currency,
    recipientId,
    processedAt: new Date().toISOString(),
  };

  res.status(201).json(responseData);
});

app.listen(3000, () => {
  console.log('Payment API listening on port 3000');
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What causes duplicate submissions in distributed architectures?**

Duplicate requests originate from five distinct layers:
1. **User Behavior**: Double-clicking un-disabled buttons or refreshing confirmation pages.
2. **Network Failures & Timeouts**: The client's HTTP request reaches the server and executes, but the network drops before the acknowledgment packet returns. The client assumes failure and retries.
3. **Proxy & Gateway Auto-Retries**: Infrastructure components like API gateways (Kong, Envoy) or CDNs (Cloudflare) automatically retry requests on socket disconnects or 502/504 errors.
4. **Third-Party Webhook Delivery**: Webhook providers (Stripe, GitHub, Twilio) use at-least-once delivery guarantees. If your server takes 5.1 seconds to respond to a 5-second timeout, the provider marks delivery failed and resends the identical webhook.
5. **Client-Side Framework Glitches**: Multiple React component re-renders or concurrent event listener triggers firing duplicate fetch calls.

**Q: What is the exact difference between Safe and Idempotent HTTP methods?**

Safe methods (`GET`, `HEAD`, `OPTIONS`) are strictly read-only; they do not alter the server's resource state. All safe methods are inherently idempotent because calling a read-only endpoint repeatedly leaves the server in the exact same state.

Idempotent methods (`PUT`, `DELETE`) modify server state, but calling them multiple times produces the exact same end state as calling them once. `DELETE /items/10` removes item 10; ten subsequent calls still leave item 10 deleted. `PUT` and `DELETE` are idempotent, but they are not safe.

`POST` and `PATCH` are neither safe nor idempotent by default. Submitting `POST /orders` five times creates five separate orders unless explicitly protected by idempotency mechanisms.

**Q: How do you handle race conditions when two identical requests hit two different server instances at the exact same millisecond?**

You must use an atomic concurrency primitive at a shared storage layer before executing any business logic.

In Redis, use `SET key value NX EX ttl`. The `NX` (Not eXists) condition evaluates atomically in Redis's single-threaded command loop. Exactly one server receives an `OK` response and proceeds to process the request. The second server receives `nil` (null), recognizes that the operation is already `IN_PROGRESS`, and returns `409 Conflict` (or polls for completion).

In a relational database, you achieve this using an `idempotency_keys` table with a `UNIQUE` constraint on `(user_id, key)`:
```sql
INSERT INTO idempotency_keys (user_id, key, status, payload_hash)
VALUES ($1, $2, 'IN_PROGRESS', $3)
ON CONFLICT (user_id, key) DO NOTHING;
```
If zero rows are inserted, a race occurred, and the second transaction immediately aborts.

**Q: What happens if the server crashes while an idempotency key is in the `IN_PROGRESS` state?**

If a server crashes mid-execution (e.g., OOM kill, hardware failure), the key could remain stuck in `IN_PROGRESS`, permanently blocking the client from retrying.

This is mitigated by two mechanisms:
1. **Short Lease TTLs**: The initial `IN_PROGRESS` record is written with a short expiration (e.g., 60 to 120 seconds). If the server dies, Redis automatically evicts the lock once the TTL expires, allowing the client's subsequent retry to acquire a fresh lock.
2. **Explicit Error Unlocks**: All controllers and middleware wrap execution in `try...catch` / `finally` blocks. If an unhandled application exception occurs, the server explicitly deletes the Redis key before returning a `500 Internal Server Error`, ensuring no artificial lock remains.

**Q: How do you handle third-party downstream side effects (e.g., calling Stripe or an SMS gateway) inside an idempotent endpoint?**

If your server charges a card via Stripe and then crashes before committing its local database transaction, a naive retry would attempt to charge the card again.

To prevent downstream duplication:
1. **Forward Idempotency Keys**: Modern financial and communication APIs support idempotency headers. Forward your client's `Idempotency-Key` (or a deterministically derived key like `${clientKey}-stripe`) directly into the downstream API call (`stripe.charges.create({ ... }, { idempotencyKey })`). Stripe will deduplicate the call on their end.
2. **Transactional Outbox Pattern**: For non-idempotent third-party APIs (like legacy email or fulfillment systems), do not make the external network call directly inside your HTTP request handler. Instead, write an event record into an `outbox` table inside your local database transaction. A separate, single-threaded worker reads the outbox and dispatches external calls with guaranteed at-least-once delivery and deduplication tracking.

**Q: Why must you hash the request payload alongside the idempotency key?**

Payload hashing prevents key reuse bugs and parameter tampering.

If a buggy client generates a single UUID on application startup and reuses that same key for every subsequent checkout (e.g., buying a $10 book, then buying a $500 laptop), a server that checks only key existence would return the cached $10 receipt for the laptop purchase without charging the user.

By storing `SHA-256(method + path + body + userId)` alongside the key, the server verifies that the incoming request is identical to the original. If the key matches but the hash differs, the server rejects the request with `422 Unprocessable Entity`, alerting the client to a protocol misuse.

**Q: How should webhooks be handled idempotently on the receiving side?**

Webhook delivery systems operate on at-least-once semantics, meaning duplicates are guaranteed to occur eventually.

To handle them safely:
1. Extract the provider's unique event ID (e.g., `event.id` from Stripe or `X-GitHub-Delivery` from GitHub).
2. Use this event ID as the primary key or unique index in a `processed_webhook_events` database table.
3. In a single database transaction, insert the event ID and apply the business mutation:
   ```sql
   BEGIN;
   INSERT INTO processed_webhook_events (event_id, processed_at) VALUES ('evt_123', NOW());
   UPDATE subscriptions SET status = 'active' WHERE customer_id = 'cus_456';
   COMMIT;
   ```
4. If a duplicate delivery arrives, the `INSERT` throws a unique constraint violation. Catch this error and return `200 OK` immediately so the provider stops retrying.

## 6. The Traps — What Goes Wrong

### Trap 1: The Client Generates a New UUID on Every Retry Attempt

- **The Mistake**: The frontend or mobile app configures an HTTP client retry interceptor that generates a brand-new `crypto.randomUUID()` on every failed attempt.
- **Why It Fails**: If the server successfully processed the initial attempt but dropped the response, the retry arrives with a brand-new key. The server treats it as a distinct transaction and processes a duplicate payment.
- **The Correct Fix**: Generate the idempotency UUID once when the user triggers the action (e.g., on button press). Store that UUID in component state or the retry queue, and pass the exact same key across all automatic retry attempts for that action.

### Trap 2: Checking and Setting the Key Non-Atomically (Check-Then-Act Race)

- **The Mistake**: Writing non-atomic check-then-insert code:
  ```javascript
  // BUG: Classic check-then-act race condition
  const exists = await redis.get(key);
  if (exists) return res.send(cached);
  await redis.set(key, 'IN_PROGRESS'); // Two parallel requests both pass the check!
  ```
- **Why It Fails**: Under high concurrency, two identical requests can both execute `redis.get(key)` before either has executed `redis.set()`. Both read `null`, both assume they own the key, and both execute the payment logic.
- **The Correct Fix**: Always use atomic write commands (`SET key value NX EX ttl` in Redis or `INSERT ... ON CONFLICT DO NOTHING` in SQL).

### Trap 3: Globally-Scoped Idempotency Keys Without Tenant/User Isolation

- **The Mistake**: Storing idempotency keys as raw UUIDs directly in Redis: `SET idempotency:9b1deb4d-...`.
- **Why It Fails**: If User B maliciously or accidentally sends the same UUID as User A, User B could read User A's cached payment response (a serious data leak) or block User A from completing their purchase.
- **The Correct Fix**: Always namespace the storage key with the authenticated user ID: `idempotency:${req.user.id}:${clientKey}`.

### Trap 4: Caching Transient Server Errors (500/503) as Terminal Responses

- **The Mistake**: Caching all responses indiscriminately, including database connection timeouts or 500 errors.
- **Why It Fails**: If the database is momentarily restarting and returns a 500, caching that response for 24 hours means every subsequent retry by the user will immediately replay the 500 error, locking them out permanently.
- **The Correct Fix**: Only cache deterministic terminal outcomes: `2xx` success codes and client validation errors (`4xx`). On `5xx` errors, delete the idempotency lock so subsequent retries can succeed once the infrastructure recovers.

### Trap 5: Relying on Frontend Button Disabling as the Primary Defense

- **The Mistake**: Disabling the HTML `<button disabled={loading}>` and assuming duplicate submissions are solved.
- **Why It Fails**: A user on a slow mobile connection might close and reopen the app, the mobile OS might retry a background fetch, or a script could fire direct HTTP calls. UI disabling is a user convenience, not an architectural safeguard.
- **The Correct Fix**: Treat UI state as visual feedback only; enforce idempotency keys and atomic database locks on the API backend.

## 7. Compare With Related Concepts

| Concept | Primary Purpose | Scope & Mechanism | Typical Storage / Lifespan | When to Use |
| :--- | :--- | :--- | :--- | :--- |
| **Idempotency Key** | Replays exact responses and prevents duplicate side effects across retries. | API / Transport Layer: Client UUID + payload hash + cached response replay. | Redis / DB (24 to 48 hours). | Mutating HTTP endpoints (`POST`, `PATCH`) where network retries could cause duplicate transactions. |
| **Distributed Lock (e.g., Redlock)** | Guarantees mutual exclusion so only one worker modifies a resource at a time. | Concurrency Layer: Locks a specific resource ID (e.g., `lock:order:123`) during execution. | In-memory Redis (Seconds to minutes, released immediately). | Preventing race conditions when multiple workers update shared inventory or account balances. |
| **DB Unique Constraint** | Hard database-level safeguard preventing duplicate rows with identical values. | Storage Layer: B-Tree index enforcing column uniqueness (e.g., `UNIQUE(user_id, order_ref)`). | Disk / Database index (Permanent). | Authoritative last line of defense in the relational schema. |
| **Optimistic Locking** | Detects concurrent conflicting updates to an existing record. | Data Layer: Version column check (`WHERE id = :id AND version = :expected`). | Database column (Permanent). | Concurrent updates to existing records (e.g., two users editing the same document). |
| **Rate Limiter (Token Bucket)** | Protects server capacity from abuse by throttling request frequency. | Gateway Layer: Allows $N$ requests per unit time per IP/user. | Redis sliding window / counter (Seconds to minutes). | Defending APIs against DDoS, brute force, or noisy neighbors. |

### Decision Rules:
- If you need to make repeated client network calls safely return the original result without re-executing logic $\rightarrow$ **Use an Idempotency Key**.
- If you need to prevent two background workers from updating the same user account at the same second $\rightarrow$ **Use a Distributed Lock**.
- If you need to ensure an order number or email is never duplicated in your tables $\rightarrow$ **Use a Database Unique Constraint**.
- If you need to prevent two users from overwriting each other's edits on the same resource $\rightarrow$ **Use Optimistic Locking**.
- If you need to stop a client from hammering your API 1,000 times a minute $\rightarrow$ **Use Rate Limiting**.

## 8. 🧠 The Memory Hook

**Network packets are echoes, but user intent is singular.** Tag every mutating action with a one-time claim ticket: lock it while working, replay the cached receipt once finished, and reject the request if the payload changes.
