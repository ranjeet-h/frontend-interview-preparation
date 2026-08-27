# Handling Partial Failures in Bulk APIs: 207 Multi-Status, Individual Error Isolation, and Retry Contracts

## 1. Why This Exists — The Problem First

Imagine a mobile field-service application syncing 500 customer records updated by a technician while offline in a remote facility. When connectivity is restored, the client issues a single `POST /api/v1/customers/bulk` request containing all 500 records. At item #412 in the array, a customer's updated email violates a unique constraint because another agent modified it earlier in the day.

If the API is designed as an all-or-nothing transaction, the database rolls back the entire batch. All 499 completely valid customer updates are aborted. The server returns a generic `400 Bad Request` or `500 Internal Server Error`. The mobile client has no way to tell which item was defective, so its background sync engine retries the entire 500-item batch thirty seconds later. The request fails at #412 again. The client is trapped in an infinite retry loop, draining the device battery, starving the server of database connections, and preventing 499 legitimate customer records from ever updating.

If the API uses naive sequential execution without isolation or structured reporting, the situation is even worse. The server commits items 0 through 411, hits the error on #412, crashes or aborts execution, and returns a top-level error. The client assumes the whole batch failed and resends all 500 items. Without strict idempotency, items 0 through 411 are created or updated a second time—triggering duplicate billing events, duplicate onboarding notifications, corrupted inventory counters, and cascading unique-key conflicts.

Bulk operations require a resilient communication contract. The server must isolate individual record failures so valid operations persist, return granular itemized statuses with exact correlation back to the original request payload, and provide unambiguous retry semantics so clients only resubmit what actually failed.

## 2. The Analogy — Make It Obvious

Think of a bulk API as dropping off 500 packages at a commercial shipping depot with an intake manifest.

In an **all-or-nothing system**, the shipping clerk inspects the 500 packages in your crate. Package #412 is missing a postal code. The clerk refuses the entire crate, pushes all 500 packages back to your truck, and says "Batch rejected." You have to haul all 500 packages back to your warehouse, inspect every single box by hand to find the bad postal code, and bring all 500 back tomorrow.

In an **uncoordinated system**, the clerk stamps 411 packages, loads them onto an airplane, encounters the bad postal code on #412, drops their stamp, and screams "Error!" without giving you a receipt. You have no idea which 411 packages made it onto the plane and which 89 are still in the building. If you send another shipment of 500 packages tomorrow, 411 customers will receive duplicate orders.

In a **proper partial-failure contract (RFC 4918 Multi-Status)**, the clerk takes your manifest listing items 0 through 499. The clerk applies postage to 499 valid packages, loads them onto the plane, sets defective package #412 aside in an exception bin, and hands you an official stamped Manifest Receipt:
- Total Packages: 500
- Succeeded: 499
- Failed: 1
- Line 412: Rejected — Reason: "Missing Postal Code" (Non-Retryable without edit)

You leave the depot knowing 499 shipments are safely en route. You open your clipboard, fix the address on package #412, and send *only package #412* back to the counter.

## 3. How It Actually Works — The Full Explanation

Designing a production-grade bulk API requires coordinating HTTP status semantics, response payload schemas, transaction isolation boundaries, bounded concurrency, and deterministic retry contracts.

**1. The HTTP Status Code Decision: RFC 4918 `207 Multi-Status`**

When a single HTTP request executes multiple independent operations that yield different results (some 200/201, some 400/409/422), returning a top-level `200 OK` can be misleading because it conceals item-level errors from generic HTTP monitors and caching layers. Returning a top-level `400 Bad Request` or `500 Internal Server Error` is equally incorrect because valid records were successfully persisted.

RFC 4918 defines HTTP status code `207 Multi-Status`. Originally created for WebDAV, `207 Multi-Status` has become the standard REST convention for bulk and batch operations. It explicitly informs API gateways, client libraries, and network proxies: *"The batch container request was received and processed successfully, but the enclosed operations produced distinct individual HTTP statuses. Inspect the response body envelope to determine the fate of each record."*

When to use each top-level HTTP code:
- **`207 Multi-Status`**: The batch executed and produced mixed outcomes (e.g., 450 succeeded, 50 failed), or the API standardizes on 207 for all bulk endpoints to ensure predictable response parsing regardless of whether failure count is zero.
- **`200 OK`**: Often used when all items succeed, or as an alternative to 207 in environments where legacy HTTP client libraries or intermediate proxies do not recognize 207 status codes.
- **`400 Bad Request` / `422 Unprocessable Entity`**: Used at the envelope level *before* item processing begins if the entire request payload is invalid (malformed JSON, payload exceeds maximum item count, missing authentication credentials).
- **`413 Payload Too Large`**: The client sent more items than the server's configured maximum batch size (e.g., submitting 5,000 items when the limit is 500).
- **`500 Internal Server Error`**: Reserved strictly for catastrophic unhandled server crashes (e.g., database connection pool exhaustion before any transaction could be evaluated).

**2. The Canonical Itemized Response Envelope**

A robust bulk response envelope separates high-level metrics from granular item details. It consists of two primary keys: `summary` and `results`.

```json
{
  "summary": {
    "total": 500,
    "succeeded": 499,
    "failed": 1,
    "duration_ms": 142
  },
  "results": [
    {
      "index": 0,
      "correlation_id": "req-cust-001",
      "status": 201,
      "id": "cust_98734",
      "data": {
        "email": "sarah.connor@example.com",
        "name": "Sarah Connor",
        "version": 1
      }
    },
    {
      "index": 412,
      "correlation_id": "req-cust-412",
      "status": 409,
      "error": {
        "code": "EMAIL_ALREADY_EXISTS",
        "message": "A customer with email 'john.doe@example.com' already exists in organization 'org_44'.",
        "field": "email",
        "retryable": false
      }
    }
  ]
}
```

Key envelope components:
- **`summary`**: Enables O(1) decision-making for clients and telemetry dashboards. The client inspects `summary.failed === 0` to confirm full success without iterating through hundreds of result items.
- **`index`**: The zero-based integer corresponding directly to the item's position in the request array. This is critical for reconciling responses when submitted items do not yet have server-generated IDs.
- **`correlation_id` / `client_id`**: An optional client-generated unique identifier echoed back by the server. This guarantees unambiguous mapping even if asynchronous workers reorder the processing pipeline.
- **`status`**: The exact HTTP status code that this specific record would have received if submitted to a standalone single-resource REST endpoint (`201 Created`, `200 OK`, `400 Bad Request`, `404 Not Found`, `409 Conflict`, `422 Unprocessable Entity`).
- **`data`**: Present only on successful items, returning created identifiers, server timestamps, generated keys, and resource representations.
- **`error`**: Present only on failed items. Contains machine-readable error codes, human-readable explanations, targeted field names, and the `retryable` boolean flag.

**3. Database-Level Isolation: Preventing Contamination**

How does the server persist 499 records while discarding the changes of record #412?

- **Pattern A: Independent Per-Item Transactions**. The worker processes each record inside its own explicit database transaction (`BEGIN ... COMMIT`). If record #412 violates a constraint, that specific transaction executes `ROLLBACK`. The records processed before it are already safely committed; records processed after it run in their own isolated transactions.
- **Pattern B: Nested Transactions via Database Savepoints**. When processing occurs inside an overarching worker session, the engine sets a savepoint before each item: `SAVEPOINT item_savepoint`. If the item succeeds, the savepoint is released: `RELEASE SAVEPOINT item_savepoint`. If an error occurs, the engine rolls back only to that mark: `ROLLBACK TO SAVEPOINT item_savepoint`. The main connection remains healthy, preventing database driver abortion of subsequent queries.
- **Pattern C: Set-Based SQL with Conflict Clauses**. For bulk insertions of homogeneous rows, high-performance engines use relational conflict handling: `INSERT INTO customers (name, email) VALUES (...) ON CONFLICT (email) DO NOTHING RETURNING id, email`. The application compares the returned primary keys against the input array to instantly categorize which rows were inserted and which encountered conflicts, bypassing row-by-row iteration entirely.

**4. Bounded Concurrency and Resource Protection**

Executing 500 database writes concurrently using `Promise.all(items.map(...))` will immediately overwhelm the backend database connection pool (which typically has 10–50 connections), causing connection timeouts, socket hang-ups, and server crashes.

Production bulk processors enforce bounded concurrency:
- The incoming batch is partitioned into controlled concurrent worker pools (e.g., executing 10 items concurrently).
- Per-item timeouts are enforced (e.g., 2,000ms per record) so a single deadlocked row lock does not hold the entire HTTP connection open until the gateway drops with a 504 Gateway Timeout.
- Circuit breaker thresholds: If the first 20 items in a batch fail with identical authentication or database connectivity errors (100% failure rate), the server immediately aborts the remaining 480 items, returning `503 Service Unavailable` or `422 Unprocessable Entity` with partial results to prevent denial-of-service against itself.

**5. The Client Partial Retry Contract**

The client uses the `retryable` flag to determine its automated response:
- **`retryable: false`**: Deterministic failures (validation errors, missing required fields, permission denials, duplicate keys). Retrying the exact same payload will always produce the exact same failure. The client sync engine must extract these records, mark them as "Attention Needed" in the local database, and present them to the user or admin for manual correction.
- **`retryable: true`**: Transient failures (row lock timeouts, optimistic locking version conflicts, temporary third-party downstream timeouts). The client sync engine collects only the failed items with `retryable: true`, constructs a new array containing exclusively those records, and schedules an automatic background retry using exponential backoff with jitter.

## 4. Real Code — See It Working

Here is a complete, production-grade Node.js/Express implementation demonstrating batch ingestion with input validation, bounded concurrency, database savepoint isolation, itemized RFC 207 response construction, and clear retry contracts.

```javascript
// bulk-customer-service.js
import express from 'express';

const app = express();
app.use(express.json({ limit: '2mb' })); // Protect against massive memory payloads

const MAX_BATCH_SIZE = 500;
const CONCURRENCY_LIMIT = 5;

// Mock database layer simulating transaction isolation & savepoints
const db = {
  async runWithSavepoint(item, index) {
    // Simulate database write operation
    if (!item.email || !item.email.includes('@')) {
      const err = new Error('Invalid email format');
      err.code = 'INVALID_FORMAT';
      err.field = 'email';
      err.statusCode = 422;
      err.retryable = false;
      throw err;
    }

    // Simulate a unique constraint violation on a specific duplicate email
    if (item.email === 'duplicate@example.com') {
      const err = new Error(`Email '${item.email}' is already registered to another account`);
      err.code = 'EMAIL_ALREADY_EXISTS';
      err.field = 'email';
      err.statusCode = 409;
      err.retryable = false;
      throw err;
    }

    // Simulate transient database lock contention
    if (item.email === 'locked-row@example.com') {
      const err = new Error('Database transaction lock wait timeout exceeded');
      err.code = 'LOCK_TIMEOUT';
      err.statusCode = 503;
      err.retryable = true;
      throw err;
    }

    // Success: return persisted record with server-generated ID and timestamp
    return {
      id: `cust_${Math.floor(100000 + Math.random() * 900000)}`,
      name: item.name,
      email: item.email,
      created_at: new Date().toISOString()
    };
  }
};

// Helper: Process array items with bounded concurrency
async function processInBatches(items, limit, workerFn) {
  const results = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await workerFn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// Bulk creation endpoint
app.post('/api/v1/customers/bulk', async (req, res) => {
  const startTime = Date.now();
  const { items } = req.body;

  // 1. Top-level envelope validation
  if (!Array.isArray(items)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_PAYLOAD',
        message: "The request body must contain an 'items' array."
      }
    });
  }

  if (items.length === 0) {
    return res.status(400).json({
      error: {
        code: 'EMPTY_BATCH',
        message: "The 'items' array cannot be empty."
      }
    });
  }

  if (items.length > MAX_BATCH_SIZE) {
    return res.status(413).json({
      error: {
        code: 'BATCH_SIZE_EXCEEDED',
        message: `Batch size of ${items.length} exceeds maximum limit of ${MAX_BATCH_SIZE} items.`
      }
    });
  }

  // 2. Process all records with isolated error boundaries and concurrency limits
  const results = await processInBatches(items, CONCURRENCY_LIMIT, async (item, index) => {
    try {
      const data = await db.runWithSavepoint(item, index);
      return {
        index,
        correlation_id: item.correlation_id || null,
        status: 201,
        id: data.id,
        data
      };
    } catch (err) {
      return {
        index,
        correlation_id: item.correlation_id || null,
        status: err.statusCode || 500,
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message,
          field: err.field || null,
          retryable: Boolean(err.retryable)
        }
      };
    }
  });

  // 3. Compute execution summary
  let succeededCount = 0;
  let failedCount = 0;

  for (const result of results) {
    if (result.status >= 200 && result.status < 300) {
      succeededCount++;
    } else {
      failedCount++;
    }
  }

  const responsePayload = {
    summary: {
      total: items.length,
      succeeded: succeededCount,
      failed: failedCount,
      duration_ms: Date.now() - startTime
    },
    results
  };

  // 4. Return appropriate RFC 4918 status code
  // If all succeeded: 200 OK. If partial failure or all failed: 207 Multi-Status.
  const httpStatus = failedCount > 0 ? 207 : 200;
  return res.status(httpStatus).json(responsePayload);
});

// Example Client-Side Synchronization & Selective Retry Engine
async function syncClientRecords(localRecords) {
  const payload = {
    items: localRecords.map((rec, index) => ({
      correlation_id: rec.client_uuid,
      name: rec.name,
      email: rec.email
    }))
  };

  const response = await fetch('http://localhost:3000/api/v1/customers/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const body = await response.json();

  if (response.status === 200 || response.status === 207) {
    const retryableItems = [];
    const permanentFailures = [];

    body.results.forEach((result) => {
      const originalRecord = localRecords[result.index];

      if (result.status >= 200 && result.status < 300) {
        // Mark local record as synced and store server ID
        console.log(`[Synced] Record '${originalRecord.name}' -> Server ID: ${result.id}`);
      } else {
        // Record failed: inspect retryability
        if (result.error.retryable) {
          console.warn(`[Transient Failure] Record #${result.index} (${result.error.code}). Queued for retry.`);
          retryableItems.push(originalRecord);
        } else {
          console.error(`[Permanent Error] Record #${result.index} (${result.error.code}): ${result.error.message}`);
          permanentFailures.push({ record: originalRecord, error: result.error });
        }
      }
    });

    // Automatically reschedule only the items that encountered transient errors
    if (retryableItems.length > 0) {
      console.log(`Scheduling automated retry for ${retryableItems.length} transient items...`);
      // Schedule background exponential backoff retry with retryableItems
    }

    return { synced: body.summary.succeeded, permanentFailures, retryCount: retryableItems.length };
  } else {
    // Top-level network or fatal server failure (400, 413, 500)
    throw new Error(`Bulk sync failed completely with status ${response.status}`);
  }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: When should an API return `207 Multi-Status` versus standard `200 OK` or `400 Bad Request`?**

`207 Multi-Status` should be returned whenever a bulk request completes its processing loop and yields mixed outcomes across individual items (e.g., 480 succeeded, 20 failed). It explicitly signals to HTTP clients and monitoring tools that the envelope contains heterogeneous per-item statuses. If 100% of items succeed, `200 OK` is standard. If the batch request itself cannot be parsed, contains an empty list, or exceeds maximum batch limits, the server must fail immediately with top-level `400 Bad Request`, `422 Unprocessable Entity`, or `413 Payload Too Large` without evaluating individual records. You should never return `500 Internal Server Error` for item-level validation or business rule failures.

**Q: How does the backend prevent a single slow or deadlocked item from exhausting server resources and hanging the entire batch?**

Two core protections are required: bounded concurrency and per-item timeouts. Rather than firing all items concurrently with unbounded promises, the server routes items through a worker pool with a fixed concurrency cap (e.g., 5 to 10 concurrent database queries). Each worker wraps individual item execution with a strict deadline (e.g., 2,000 milliseconds). If an item locks on a database row or hangs waiting on a third-party API, its timeout fires, the item is recorded as a `504 Gateway Timeout` or `503 Service Unavailable` with `retryable: true`, its savepoint is rolled back, and the worker immediately proceeds to the next record in the batch.

**Q: What is the difference between Positional Index mapping and Correlation ID mapping in bulk APIs, and when should you use each?**

Positional Index mapping means the response array includes an `index` property (0, 1, 2...) matching the exact array position in the client's request payload. This is essential for bulk imports (like CSV uploads) where submitted rows have no existing database identifiers. Correlation ID mapping allows the client to attach a unique client-generated UUID (`correlation_id` or `client_id`) to each submitted item, which the server echoes back in the response. Correlation IDs are superior in distributed or asynchronous systems because they allow the client to reconcile records even if worker queues process items out of order or return paginated stream results. Production bulk APIs typically support both: they preserve positional index order while echoing any provided correlation IDs.

**Q: How should a client handle idempotent retries when only 5 out of 100 items failed with transient errors?**

The client inspects the response `results` array, filters for records where `status >= 400` and `error.retryable === true`, and extracts the original payloads for only those 5 records. It constructs a new bulk request containing exclusively those 5 items and submits it with a fresh batch request ID. If the client were to resend the entire 100-item array, it would waste database compute and risk duplicate operations on non-idempotent endpoints. For absolute safety, each individual item in the retry request should maintain its original unique `correlation_id` so the backend can detect and ignore duplicate writes if a previous attempt actually succeeded right before a network disconnect.

**Q: How do you handle database transaction boundaries in bulk operations: one global transaction, per-item transactions, or batch savepoints?**

A single global transaction is unacceptable for partial failure support because any single failure forces a complete `ROLLBACK` of all records. Per-item transactions (`BEGIN` and `COMMIT` per record) provide clean isolation, ensuring committed records are immediately durable on disk, but incur high transaction overhead for large batches. Nested transactions using database savepoints (`SAVEPOINT item_k` ... `RELEASE SAVEPOINT` or `ROLLBACK TO SAVEPOINT`) offer the best balance: all operations execute within a single database connection session, isolating individual item failures without the network roundtrips of opening and closing hundreds of separate database connections.

**Q: How do you design bulk API authorization and tenant isolation when a user submits items across multiple resources?**

Authorization must occur in two phases: envelope-level and item-level. At the envelope level, the API verifies that the client has a valid authentication token and general permission to invoke the bulk endpoint. During item-level processing, the server checks resource-level ownership and tenant boundaries for each record (e.g., verifying `item.organization_id === token.user_organization_id` or verifying the user has write access to the specific target `customer_id`). If item #12 belongs to a tenant the user cannot access, that item receives an individual `403 Forbidden` status in the results array with `error.code = "FORBIDDEN"` and `retryable: false`, while items belonging to authorized tenants are processed and committed normally.

**Q: What observability metrics, logs, and alerts are critical for monitoring partial failure health in production?**

You must track metrics along four dimensions:
1. **Batch-level metrics**: Request count partitioned by top-level HTTP status (`200`, `207`, `400`, `413`, `500`), average batch size, and total batch duration distributions (p50, p95, p99).
2. **Item-level metrics**: Individual item success rate (`succeeded_items / total_items`), failure count partitioned by error code (`EMAIL_ALREADY_EXISTS`, `INVALID_FORMAT`, `LOCK_TIMEOUT`), and per-item execution latency.
3. **Structured logs**: Log a single completion event per bulk request containing `batch_id`, `total_items`, `succeeded_count`, `failed_count`, and an array of failed item indices with their error codes.
4. **Alerts**: Trigger alerts when the 207 Multi-Status error ratio spikes above normal baseline (e.g., > 5% item failure rate over 5 minutes) or when specific transient codes (like `LOCK_TIMEOUT` or database connection errors) increase, indicating systemic database contention.

## 6. The Traps — What Goes Wrong

**Trap 1: Unbounded `Promise.all()` Causing Connection Pool Starvation**
Writing `await Promise.all(items.map(processItem))` on a batch of 500 items instantly spawns 500 simultaneous database queries. In an environment with a 20-connection pool, 480 queries stall waiting for a connection. This creates massive latency spikes, exhausts Node.js event loop resources, and triggers gateway timeouts (HTTP 504) that crash the entire batch.
*The fix:* Enforce bounded concurrency using a worker pool or chunking utility that limits concurrent active database operations to a safe number (e.g., 5–10 concurrent workers).

**Trap 2: Stripping the Request Index or Omit Mapping in the Response**
Returning an array that contains only the failed records without an `index` or `correlation_id` (e.g., `[{ "error": "Invalid phone number" }]`) makes it mathematically impossible for the client to map errors back to the source rows in the UI or input file.
*The fix:* Every result object in the response array must explicitly include the original zero-based `index` and client-provided `correlation_id`.

**Trap 3: Treating 4xx Validation Errors as Retryable (Poison Pill Infinite Loops)**
If the server fails to distinguish between transient failures (database lock timeout) and deterministic domain failures (invalid email syntax), the client may automatically retry validation errors forever. This creates a "poison pill" in offline sync queues that burns CPU, wastes network bandwidth, and floods server error logs.
*The fix:* Explicitly include `"retryable": false` on all 4xx client errors (validation, format, foreign key, duplicate key) and `"retryable": true` only on transient 5xx or specific retryable 4xx errors (like `429 Too Many Requests` or `503 Lock Timeout`).

**Trap 4: Global Transaction Rollback Masking Item-Level Success**
Wrapping the entire processing loop in an un-isolated database transaction so that when item #400 throws an unhandled error, the database driver automatically aborts the entire transaction. The server then attempts to return a 207 response claiming the first 399 succeeded, but none of them actually persisted to disk.
*The fix:* Ensure each item either runs in its own distinct transaction or uses explicit database savepoints (`SAVEPOINT` / `ROLLBACK TO SAVEPOINT`) so that rollbacks are strictly confined to the failing record.

**Trap 5: Returning Top-Level 500 on Item Validation Failures**
Allowing an unhandled domain exception in an individual item worker to escape into Express/FastAPI top-level middleware, causing the server to return `500 Internal Server Error`. The client assumes the service is down and does not parse the response body.
*The fix:* Wrap individual item execution in a `try/catch` block within the batch worker, translating thrown domain errors directly into item-level result entries with status codes (`422`, `409`) rather than letting exceptions bubble up to framework-level handlers.

**Trap 6: Lack of Memory Backpressure on Massive JSON Payloads**
Allowing clients to submit unbounded bulk arrays (e.g., 50,000 objects in a single 50MB JSON payload). Parsing large JSON strings blocks the Node.js event loop synchronously for hundreds of milliseconds, starving all other concurrent HTTP traffic.
*The fix:* Enforce strict maximum payload sizes in middleware (`express.json({ limit: '2mb' })`) and reject batches exceeding a hard item threshold (`MAX_BATCH_SIZE = 500`) with `413 Payload Too Large` before JSON deserialization or processing begins.

## 7. Compare With Related Concepts

Understanding how Partial Failure Bulk APIs fit into the broader landscape of distributed API design:

| Pattern | How It Works | Failure Semantics | When to Use |
| :--- | :--- | :--- | :--- |
| **Partial Failure Bulk API (RFC 207)** | Single HTTP request processing multiple independent operations synchronously, returning itemized statuses and summary metrics. | **Isolated**: Some items commit (200/201), others fail (4xx/5xx). Client retries only failed items. | High-frequency CRUD sync, CSV imports (up to ~500 items), mobile offline data reconciliation. |
| **Atomic Bulk API (All-or-Nothing)** | Single HTTP request wrapped in one global database transaction (`BEGIN ... COMMIT`). | **Atomic**: If one item fails, 100% of items are rolled back. Top-level 400/409/422 returned. | Financial ledger entries, multi-item order checkouts, double-entry bookkeeping where partial state violates domain integrity. |
| **Asynchronous Batch Job Queue** | Client submits batch, server returns `202 Accepted` with a `job_id`. Background workers process items asynchronously via queues. | **Deferred / Polling**: Client polls `GET /jobs/{id}` or receives webhook with final manifest report. | Massive datasets (> 1,000 items), heavy computation, video/image processing, third-party integrations with rate limits. |
| **GraphQL Bulk Mutations** | Single GraphQL query containing multiple aliased mutation fields or bulk mutation input type. | **Partial via `errors` Array**: GraphQL returns `{ data: {...}, errors: [...] }` containing null data for failing fields and error objects with paths. | Frontend applications already standardized on GraphQL requiring fine-grained field-level resolution across multiple entity types. |
| **HTTP/2 / HTTP/3 Multiplexed Single Calls** | Client fires 500 individual REST requests (`POST /customers`) concurrently over a single multiplexed TCP/QUIC connection. | **Naturally Isolated**: Each request is a standard independent HTTP exchange with its own status code. | Low-volume concurrent updates (< 20 items) where standardizing on a single individual REST endpoint simplifies API surface area. |

**The Decision Rules:**
1. Use an **Atomic Bulk API** when business rules require strict all-or-nothing consistency (e.g., transferring funds across accounts or submitting an order with line items).
2. Use a **Partial Failure Bulk API (207 Multi-Status)** when processing independent records (e.g., offline CRM sync, contact imports, inventory updates) where valid items should not be blocked by bad items.
3. Use an **Asynchronous Job Queue (202 Accepted)** when the batch exceeds 500 items or total processing time exceeds 3 seconds, offloading work to background workers to prevent HTTP gateway timeouts.

## 8. 🧠 The Memory Hook — What Sticks

Think of a bulk API as a certified postal delivery manifest: **never reject the entire truckload because one envelope has a typo, never hand back mystery error receipts without row numbers, and always stamp each line so the sender only has to bring back the packages that actually failed.**
