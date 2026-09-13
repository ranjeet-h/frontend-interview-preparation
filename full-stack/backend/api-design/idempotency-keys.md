# Idempotency Keys in API Design: Distributed Locks, Payload Signatures, and Replay Caching

## 1. Why This Exists — The Problem First

Imagine you are building a checkout system. A user on a spotty mobile connection taps "Pay $250". Their phone sends a `POST /v1/charges` to your API. 

Your server receives the request, validates the credit card, contacts the upstream payment gateway (like Stripe), and successfully debits $250 from the customer's bank account. But right as your server attempts to send the `200 OK` response back over the cellular network, the customer's phone switches towers or passes through a tunnel. The TCP connection abruptly dies with a socket timeout (`ECONNRESET`).

From the mobile client's perspective, the request timed out. The user sees a spinning wheel that turns into an error message: "Network error. Please try again." The user taps "Pay $250" a second time. 

Without idempotency controls, your server processes that second `POST` as a brand-new transaction. The customer gets charged $250 twice ($500 total) for a single purchase. Support tickets flood in, dispute fees pile up, and customer trust evaporates.

Standard HTTP semantics cannot solve this alone. While HTTP specifies that methods like `GET`, `PUT`, and `DELETE` are naturally idempotent (calling them multiple times produces the exact same server-side state), mutations handled by `POST` and `PATCH` are not. 

The IETF `Idempotency-Key` specification exists to fix this fundamental flaw in distributed systems. It gives non-idempotent operations a unique, client-generated identity so that network retries execute **at most once** while returning the **exact original response**.

## 2. The Analogy — Make It Obvious

Think of an idempotency key like a **bank teller counterfoil and transaction reference number**.

Suppose you walk into a bank branch to wire $10,000 to an escrow account. 

1. **Unique Reference:** You fill out a wire transfer form and stamp a unique voucher number on it: `WIRE-9942`.
2. **The Teller Lock (In Progress):** You hand the form through the teller window. The teller stamps `WIRE-9942` into their ledger as `IN_PROGRESS` and begins counting cash and communicating with the central clearing house.
3. **Concurrent Duplicate Detection:** If your business partner panics, runs to the adjacent teller window with a duplicate copy of `WIRE-9942`, and hands it over, the second teller looks at the ledger, sees `WIRE-9942` is currently `IN_PROGRESS`, and says: *"Hold on, this exact wire is currently being counted at window 1. You cannot execute it twice."* This is your `409 Conflict`.
4. **Network Drop & Replay:** Before teller 1 can hand you your printed receipt, a thunderstorm knocks out the branch lights for thirty seconds. You never received your receipt. Once the power returns, you hand `WIRE-9942` back to the teller.
5. **The Cached Receipt:** The teller looks up `WIRE-9942` in the ledger, sees `STATUS: COMPLETED`, and retrieves the carbon-copy receipt generated at 10:02 AM. The teller does **not** deduct another $10,000 from your account. They simply hand you the printed receipt from the original transaction.
6. **Payload Tamper Detection:** If you hand the teller `WIRE-9942` but changed the destination account to your personal offshore account, the teller compares the form against the original entry, flags the mismatch, and rejects the request as a fraudulent reuse of an existing voucher.

## 3. How It Actually Works — The Full Explanation

An idempotency key layer acts as an API gateway middleware that intercepts mutating requests before they hit your core domain logic, managing a distributed state machine backed by a fast, atomic data store like Redis.

```
Client Request (POST /v1/charges)
  [Header: Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d]
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Extract Key & Compute Payload Signature (SHA-256)        │
│    Hash = SHA-256(Method + Path + Body + UserID)            │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
              ┌─────────────────────────────────┐
              │ Check Storage (Redis Key Lookup)│
              └────────────────┬────────────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       ▼                       ▼                       ▼
[Key Not Found]         [Key Exists: STARTED]   [Key Exists: EXECUTED]
  │                       │                       │
  │ Acquire Lock          │ Concurrent request    │ Compare Payload Hash
  │ (SET NX EX 120s)      │ Return 409 Conflict   ├──────────────┬─────────────┐
  │                       │ (or wait on Pub/Sub)  ▼              ▼             ▼
  ▼                                              [Hash Match] [Hash Mismatch]
Execute Domain Logic / DB Transaction                 │              │
  │                                                   │ Replay Cached│ Return 422
  ├─── Success ─────────► Save Response (TTL 72h)    │ Response     │ Unprocessable
  │                       (200 OK + JSON Body)        │ (200 OK)     │ Entity
  │                                                   ▼              ▼
  └─── Server 5xx ──────► Delete Lock (Allow Retry)  Done           Done
```

### The IETF HTTP Header Standard
The standard header name is `Idempotency-Key` (or historically `X-Idempotency-Key`). The client generates a unique string (typically a UUID v4 or ULID) for every distinct mutation intent. The client reuses that exact same key whenever it retries due to network timeouts, 502/503/504 gateway drops, or client app restarts.

### Payload Signature Verification (Tamper Protection)
Never trust an idempotency key alone. A buggy or malicious client might send the same idempotency key for two completely different operations (e.g., creating an order for $10, then reusing that key to create an order for $500).

To prevent accidental key reuse and data corruption, the server generates a cryptographic fingerprint of the incoming request:
```
PayloadSignature = SHA-256(HTTP_METHOD + ":" + PATH + ":" + CANONICAL_JSON(BODY) + ":" + AUTHENTICATED_USER_ID)
```
When an existing key is found in storage:
- If the incoming signature **matches** the stored signature, the server proceeds with replay.
- If the incoming signature **differs**, the server immediately aborts and returns `422 Unprocessable Entity` with an error indicating that the idempotency key was reused for a different payload.

### The 4-State Lifecycle & State Machine
An idempotency record moves through four concrete states:

1. **`STARTED` (Distributed Lock Acquired):**
   - The server atomically claims the key in Redis using `SET key payload_hash:STARTED NX EX 120`.
   - The short TTL (30 to 120 seconds) ensures that if the server dies or crashes mid-execution, the lock auto-expires rather than creating a permanent distributed deadlock.
   - If a duplicate request arrives while the key is in `STARTED`, the server returns `409 Conflict` (or optionally pauses on a Redis Pub/Sub channel to wait for the leader request to finish).

2. **`EXECUTED` (Response Cached):**
   - Once the database transaction and downstream gateway calls succeed, the server saves the complete response (HTTP status code, response headers, and serialized response body) in storage with a long TTL (typically 24 to 72 hours).
   - Any future request with the same key and payload signature bypasses the database and payment gateway entirely, returning the cached response with a header such as `Idempotent-Replayed: true`.

3. **`FAILED_UNRETRYABLE` (Client Errors Cached):**
   - If the request fails with a client-side validation error (`400 Bad Request`, `422 Unprocessable Entity`, `403 Forbidden`), this failure is deterministic.
   - The error response is cached under `EXECUTED` or `FAILED_UNRETRYABLE` with the standard 24–72 hour TTL. Retrying the exact same invalid payload will never succeed.

4. **`FAILED_RETRYABLE` (Transient Server Errors Released):**
   - If the server suffers an infrastructure failure (`500 Internal Server Error`, database connection drop, downstream gateway timeout), the operation did not complete cleanly.
   - The middleware explicitly deletes the Redis lock (`DEL key`), allowing immediate client retries with the same idempotency key.

### Storage Topologies: Redis vs. Relational Database
In high-throughput architectures, teams choose between two storage patterns:
- **Fast Path (Redis-First):** Redis handles the atomic `SET NX` locks and caches responses. It delivers sub-millisecond overhead and native TTL expiration.
- **Strict Transactional Path (PostgreSQL/MySQL Table):** An `idempotency_keys` table resides inside the primary relational database. The lock row is written inside the exact same database transaction as the business entity (`INSERT INTO orders ...; INSERT INTO idempotency_keys ...; COMMIT;`). This provides 100% ACID consistency between business state and idempotency tracking at the expense of higher database write load.

Most enterprise systems use Redis for the API gateway middleware layer, combined with database unique constraints at the storage layer as a secondary defense.

## 4. Real Code — See It Working

Here is a production-grade TypeScript middleware for Express using `ioredis` and Node's built-in `crypto` module.

```typescript
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import crypto from 'crypto';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface IdempotencyRecord {
  status: 'STARTED' | 'EXECUTED';
  signature: string;
  statusCode?: number;
  headers?: Record<string, string>;
  body?: any;
}

const LOCK_TTL_SECONDS = 120; // Auto-unlock if server crashes mid-flight
const CACHE_TTL_SECONDS = 86400; // Cache completed responses for 24 hours

/**
 * Deterministically serialize JSON to guarantee identical hashes 
 * regardless of object key insertion order.
 */
function canonicalizeJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalizeJson).join(',')}]`;
  }
  const sortedKeys = Object.keys(obj).sort();
  const keyValues = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalizeJson(obj[key])}`
  );
  return `{${keyValues.join(',')}}`;
}

function computePayloadSignature(req: Request, userId: string): string {
  const payloadString = `${req.method}:${req.baseUrl + req.path}:${canonicalizeJson(req.body)}:${userId}`;
  return crypto.createHash('sha256').update(payloadString).digest('hex');
}

export function idempotencyMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only apply idempotency to mutating HTTP verbs
    if (!['POST', 'PATCH', 'PUT'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      return next(); // Pass through if client didn't supply key (or enforce 400 if required)
    }

    // Always scope the key to the authenticated tenant/user
    const userId = (req as any).user?.id || 'anonymous';
    const redisKey = `idempotency:${userId}:${idempotencyKey}`;
    const signature = computePayloadSignature(req, userId);

    try {
      // Step 1: Attempt to acquire the atomic lock
      const initialRecord: IdempotencyRecord = {
        status: 'STARTED',
        signature,
      };

      // SET NX returns "OK" if key was set, or null if key already exists
      const lockAcquired = await redis.set(
        redisKey,
        JSON.stringify(initialRecord),
        'EX',
        LOCK_TTL_SECONDS,
        'NX'
      );

      if (!lockAcquired) {
        // Step 2: Key already exists. Fetch record to inspect state
        const rawData = await redis.get(redisKey);
        if (!rawData) {
          res.status(500).json({ error: 'Lock acquisition race condition occurred.' });
          return;
        }

        const existingRecord: IdempotencyRecord = JSON.parse(rawData);

        // Trap check: Did the client send the same key with a different body?
        if (existingRecord.signature !== signature) {
          res.status(422).json({
            error: 'Idempotency key reused with different request payload.',
          });
          return;
        }

        // Check if previous request is still currently in-flight
        if (existingRecord.status === 'STARTED') {
          res.set('Retry-After', '2');
          res.status(409).json({
            error: 'A request with this idempotency key is currently in progress.',
          });
          return;
        }

        // Request was previously completed. Replay cached response!
        res.set('Idempotent-Replayed', 'true');
        if (existingRecord.headers) {
          for (const [headerKey, headerVal] of Object.entries(existingRecord.headers)) {
            res.set(headerKey, headerVal);
          }
        }
        res.status(existingRecord.statusCode || 200).send(existingRecord.body);
        return;
      }

      // Step 3: We hold the lock. Hook into response stream to capture output
      const originalSend = res.send.bind(res);
      const originalJson = res.json.bind(res);

      let responseSent = false;

      const cacheResponse = async (bodyContent: any, statusCode: number) => {
        if (responseSent) return;
        responseSent = true;

        if (statusCode >= 500) {
          // Transient failure: Release the lock completely so client can retry immediately
          await redis.del(redisKey);
          return;
        }

        // Cache both 2xx successes and 4xx fatal client validation errors
        const completedRecord: IdempotencyRecord = {
          status: 'EXECUTED',
          signature,
          statusCode,
          headers: {
            'Content-Type': res.get('Content-Type') || 'application/json',
          },
          body: bodyContent,
        };

        await redis.set(
          redisKey,
          JSON.stringify(completedRecord),
          'EX',
          CACHE_TTL_SECONDS
        );
      };

      res.send = (body: any): Response => {
        cacheResponse(body, res.statusCode).catch((err) => {
          console.error('Failed to cache idempotency record:', err);
        });
        return originalSend(body);
      };

      res.json = (body: any): Response => {
        cacheResponse(body, res.statusCode).catch((err) => {
          console.error('Failed to cache idempotency record:', err);
        });
        return originalJson(body);
      };

      next();
    } catch (error) {
      console.error('Idempotency middleware error:', error);
      next(error);
    }
  };
}
```

### Using the Middleware in an Express Route

```typescript
import express from 'express';
import crypto from 'crypto';
import { idempotencyMiddleware } from './idempotencyMiddleware';

const app = express();
app.use(express.json());

// Simulated auth middleware populates req.user
app.use((req, res, next) => {
  (req as any).user = { id: 'usr_98174' };
  next();
});

app.post('/v1/charges', idempotencyMiddleware(), async (req, res) => {
  const { amount, currency } = req.body;

  // Basic validation
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid charge amount' });
  }

  // Simulate domain processing & 3rd-party payment gateway call
  const chargeId = `ch_${crypto.randomBytes(8).toString('hex')}`;
  
  return res.status(201).json({
    id: chargeId,
    amount,
    currency,
    status: 'succeeded',
    createdAt: new Date().toISOString(),
  });
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why can't we just make every endpoint use HTTP PUT or DELETE instead of introducing idempotency keys?**

`PUT` and `DELETE` are idempotent by definition under RFC 9110, but they carry strict resource-replacement semantics. `PUT /users/123` means *"make user 123 look exactly like this payload."* If you run it five times, user 123 has the same state. 

However, many real-world actions are creation events or financial commands (`POST /v1/charges`, `POST /v1/transfers`, `POST /v1/orders/checkout`). These operations do not have a client-known resource ID prior to creation, and executing them creates side effects (charging credit cards, triggering shipment webhooks, sending SMS alerts). 

Idempotency keys bridge this gap: they allow non-idempotent operations like `POST` to achieve safe retry semantics without distorting RESTful API architecture.

**Q: What exact HTTP status code should you return if a second request arrives while the first request is still being processed?**

Return **`409 Conflict`** with a `Retry-After` header (e.g., `Retry-After: 2`). 

A `409 Conflict` informs the client that the request cannot be processed right now because of a conflict with the current state of the resource (specifically, an active lock). 

Never return `200 OK` or `500 Internal Server Error` for in-flight collisions. Some high-concurrency systems implement Redis Pub/Sub so the second request pauses for up to 2 seconds waiting for the first request to complete; if the first request finishes in time, request 2 receives the `200 OK` replay directly rather than a `409`.

**Q: What should the server do if a client sends an existing Idempotency-Key with a completely different request body?**

The server must reject the request immediately with **`422 Unprocessable Entity`** (or `400 Bad Request`) and an explicit error payload: `"Idempotency key reused with different request payload"`.

If you were to return the cached response of the original request, you would silently return incorrect data to the client (e.g., paying for shoes and getting back a receipt for a laptop). If you were to process it as a new transaction, you would violate the uniqueness invariant of the key. Rejecting with 422 protects against payload tampering and client-side bugs.

**Q: How do you prevent a distributed lock deadlock if the backend server crashes halfway through processing the request?**

By enforcing a **dual TTL strategy**. 

When the initial `STARTED` lock is placed in Redis via `SET key signature:STARTED NX EX 120`, the lock is granted a short expiration (typically 60 to 120 seconds). 

If the server crashes, experiences an unhandled exception, or loses power, the lock naturally expires in Redis after 120 seconds. The client's subsequent retry will then find the lock cleared and can re-acquire it to safely re-execute the request. 

Once the request succeeds, the key is updated with `EXECUTED` and given a much longer TTL (24 to 72 hours).

**Q: How does idempotency work for asynchronous background operations that return HTTP 202 Accepted?**

For long-running tasks (e.g., video transcoding or bulk report generation), the API returns `202 Accepted` along with a job status URL (`Location: /v1/jobs/job_abc123`).

1. The client sends `POST /v1/reports` with `Idempotency-Key: k_123`.
2. The middleware stores the key in Redis with status `EXECUTED`, caching the `202 Accepted` status code and the `{ jobId: "job_abc123" }` response body.
3. If the client retries `POST /v1/reports` with `k_123`, the middleware immediately returns the cached `202 Accepted` pointing to `job_abc123`. It does **not** enqueue a duplicate background worker job.
4. The client polls `GET /v1/jobs/job_abc123` to track job progress.

**Q: Should database mutations and idempotency key updates be in the same database transaction, or is Redis enough?**

In standard web applications, Redis middleware is sufficient. However, in mission-critical banking and ledger systems, a dual-write problem exists: your database transaction might commit, but your Redis server might disconnect before the `EXECUTED` state is saved. If the client retries, the server would re-execute the database write.

To achieve strict absolute zero-duplicate guarantees:
Store the idempotency key directly inside your relational database (e.g., PostgreSQL). When inserting the order or charge, insert the idempotency record inside the **same ACID transaction**:
```sql
BEGIN;
INSERT INTO idempotency_records (user_id, key, signature, status) VALUES ('usr_1', 'k_99', 'hash_abc', 'STARTED');
INSERT INTO orders (id, amount, user_id) VALUES ('ord_123', 250, 'usr_1');
UPDATE idempotency_records SET status = 'EXECUTED', response_body = '{"id":"ord_123"}' WHERE key = 'k_99';
COMMIT;
```
If the transaction fails, everything rolls back atomically.

**Q: What metric indicates client-side idempotency key misuse in production?**

A spike in the **Payload Signature Mismatch Rate** (422 responses). 

In healthy production systems, you expect:
- High cache miss rates on initial requests.
- Low cache hit rates (1–3%) representing legitimate network retry replays.
- **Near-zero (0.01%) payload mismatch rates.**

If the 422 mismatch rate spikes, it indicates a client-side frontend/mobile bug where developers hardcoded a static idempotency key (e.g., `Idempotency-Key: "constant-key-1"`) or failed to generate a fresh UUID for distinct user checkout attempts.

## 6. The Traps — What Goes Wrong

### Trap 1: Caching 500 Internal Server Errors
If your database is temporarily unreachable or a downstream service returns a `500 Internal Server Error`, naive middleware might cache that 500 response under the idempotency key with a 24-hour TTL. 

When the downstream service recovers 5 seconds later and the client retries, your middleware intercepts the retry and immediately replays the cached `500 Internal Server Error`! You have permanently locked the client out of completing their order for the next 24 hours.
- **The Fix:** Only cache 2xx successes and 4xx client errors. On any 5xx error or unhandled exception, explicitly execute `DEL redisKey` so the client can retry cleanly.

### Trap 2: Naive `JSON.stringify` in Payload Hashing
JavaScript's default `JSON.stringify({ a: 1, b: 2 })` produces `{"a":1,"b":2}`. But if a proxy, client library, or gateway serializes it as `{"b":2,"a":1}`, standard SHA-256 hashing produces two completely different hashes for identical data. The server falsely flags a legitimate retry as a `422 Payload Mismatch`.
- **The Fix:** Always use a canonical JSON serializer that sorts object keys alphabetically before computing the SHA-256 hash.

### Trap 3: Omitting Authenticated User ID from Key Namespaces
If User A sends `Idempotency-Key: 1111-2222` and User B happens to generate the same key (or uses a predictable counter like `1`), storing keys as `idempotency:1111-2222` allows User B to either receive User A's private order confirmation or trigger a 422 conflict.
- **The Fix:** Always namespace keys with the authenticated tenant and user ID: `idempotency:<tenant_id>:<user_id>:<key>`.

### Trap 4: Replaying Response Bodies Without Headers or HTTP Status Codes
If the original request created a resource and returned `201 Created` with a `Location: /v1/orders/ord_123` header, but your replay cache only stores the raw JSON body and returns a default `200 OK` without headers, strict API client SDKs that validate status codes or parse `Location` headers will crash during retry deserialization.
- **The Fix:** Cache the full HTTP tuple: `{ statusCode, headers, body }` and replay all of them.

### Trap 5: Redis Out-Of-Memory from Large Response Payloads
If an endpoint returns large JSON payloads (e.g., a 2MB catalog import summary) and receives millions of requests, caching full response bodies in Redis for 72 hours will rapidly exhaust RAM and trigger Redis OOM evictions.
- **The Fix:** Apply snappy or gzip compression before storing large response strings in Redis, or store large payloads in S3/blob storage and only keep the blob URI in Redis.

## 7. Compare With Related Concepts

### Idempotency Keys vs. Server-Side Deduplication
- **Idempotency Keys:** Client-driven. The client supplies an explicit token (`Idempotency-Key`) to dictate which requests represent the exact same operational intent, allowing deterministic replay of cached responses.
- **Server Deduplication:** Server-driven. The backend inspects payload content (e.g., *"Did user X send an email with subject Y within the last 60 seconds?"*) to automatically suppress duplicate actions without client coordination.
- **Rule of Thumb:** Use Idempotency Keys for external API client retries on mutations. Use Server Deduplication for internal background queues and event consumers.

### Idempotency Keys vs. Optimistic Concurrency Control (ETags / `If-Match`)
- **Idempotency Keys:** Protect against duplicate **creation** or **action** requests (`POST`) across unreliable networks.
- **Optimistic Concurrency Control (OCC):** Protects against the **lost update problem** on updates (`PUT` / `PATCH`). Clients send a version number or ETag (`If-Match: "v3"`); if another client updated the resource to `v4` in the meantime, the write is rejected with `412 Precondition Failed`.
- **Rule of Thumb:** Use Idempotency Keys to prevent duplicate inserts on `POST`. Use OCC (`If-Match` / version checks) to prevent concurrent overwrites on `PUT`/`PATCH`.

### Idempotency Keys vs. HTTP Cache-Control (GET Caching)
- **Idempotency Keys:** Target unsafe mutations (`POST`), use distributed locks, verify payload signatures, and replay responses specifically across retry attempts.
- **HTTP Cache-Control (`max-age`, CDN caching):** Targets safe, read-only requests (`GET`), allowing intermediate proxies and browsers to serve cached representations to reduce server load.
- **Rule of Thumb:** `Cache-Control` is for speeding up reads; `Idempotency-Key` is for making writes safe.

### Idempotency Keys vs. Database Unique Constraints
- **Idempotency Keys:** Live at the API boundary, cache full HTTP responses, and return `200 OK` / `201 Created` with original payload replay.
- **Database Unique Constraints:** Live at the storage engine level (e.g., `UNIQUE(email)` or `UNIQUE(order_reference)`). When violated, the database throws an error (`23505 Unique Violation`) that returns a `409` or `500` error rather than replaying the original successful response.
- **Rule of Thumb:** Use both. Idempotency keys provide user-friendly response replays at the API gateway; unique constraints act as the unshakeable last line of defense in the database.

## 8. 🧠 The Memory Hook

> **Lock on start, replay on finish, erase on crash.**
>
> An idempotency key is a distributed transaction receipt: `SET NX` locks the door so twin requests can't double-charge, SHA-256 guarantees the payload wasn't tampered with, and the cached response hands back the original receipt the second the network drops.
