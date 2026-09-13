# Designing Bulk Update APIs: Batching Mechanics, Partial Success (207 Multi-Status), and Concurrency Control

## 1. Why This Exists — The Problem First

Imagine an enterprise dashboard where an operations manager selects 1,000 inventory items, changes their discount status to "Active", and clicks **Save**. 

If the frontend fires 1,000 separate `PATCH /api/v1/items/:id` HTTP requests in parallel, the browser immediately chokes. Modern browsers limit concurrent HTTP/1.1 connections to roughly 6 per domain. Requests queue up in client memory, latency spikes into tens of seconds, and the sudden flood of TCP handshakes and TLS negotiations exhausts server sockets and thrashes the backend connection pool.

```txt
NAIVE CLIENT FLOOD (1,000 Individual HTTP Requests):
Browser [6-socket limit] ──(994 requests queued)──> Network Congestion ──> Socket Exhaustion
                                                                             │
                                                                             ▼
Database Connection Pool Exhausted (1,000 separate connection checkouts & queries)
```

The team decides to fix this by creating a single bulk endpoint: `PATCH /api/v1/items`. The frontend sends an array of 1,000 items in a single JSON payload. But now, two new production disasters occur:

1. **The All-or-Nothing Freeze:** Item #947 fails validation because a sku is missing a required prefix. If the backend wraps the entire batch in a single database transaction, the entire batch rolls back. The server returns a generic `400 Bad Request`. The user is left staring at an unhelpful error message, having no clue which record was invalid, while 999 perfectly valid updates were thrown away.
2. **The Database N+1 Loop & Row Lock Contention:** If the backend processes the array using `for (const item of items) { await db.query('UPDATE ...') }`, the server executes 1,000 sequential database round trips within an open connection. The transaction holds database row locks open for seconds, causing lock starvation, query timeouts, and cascading server failure across the entire application.

```txt
THE NAIVE SINGLE BULK TRAPS:
Trap A (All-or-Nothing):  [999 valid + 1 invalid] ──> Single DB Tx Rollback ──> 400 Bad Request (User baffled)
Trap B (App-Layer N+1):   for (item of 1000) { await db.update(item) }     ──> Holds locks for 8s, pool dry
```

Bulk Update APIs exist to solve this exact dilemma: transferring and applying state changes to multiple resources in minimal network round-trips while managing partial failures, row-level validation, multi-row database performance, and concurrency conflicts.

---

## 2. The Analogy — Make It Obvious

Think of an enterprise shipping manager dropping off 100 international packages at a central postal sorting hub with an itemized intake manifest:

```txt
POSTAL MANIFEST INTAKE:
[ 100 Boxes + Manifest Sheet ] ──> Intake Agent scans each box against Manifest
                                    │
                                    ├── Box #1-#98: Cleared & Stamped      ──> [200 OK per line]
                                    ├── Box #99:    Missing Customs Form   ──> [422 Unprocessable]
                                    └── Box #100:   Restricted Destination ──> [403 Forbidden]
                                    │
                                    ▼
[ Itemized Manifest Receipt ] <── Handed back with exact status for each individual tracking ID
```

- **The Naive Approach (Individual Requests):** The delivery driver stands in line 100 times, doing a full checkout conversation for each individual box. The post office line grinds to a halt.
- **The Broken All-or-Nothing Approach:** The clerk inspects 99 boxes successfully, finds that box #100 has a torn shipping label, and throws all 100 boxes into the dumpster while shouting "Invalid Batch!"
- **The Real Bulk API Pattern (Multi-Status Manifest):** The driver submits all 100 boxes together with a single manifest. The clerk verifies each parcel: 98 parcels are stamped, sorted, and routed for delivery. Box #99 is set aside with a tag: *"Missing Customs Invoice"*. Box #100 is flagged: *"Restricted Country Code"*. The clerk hands the driver a detailed intake receipt listing the exact outcome for every box.

The driver leaves knowing 98 shipments are en route and exactly what needs fixing for the remaining 2.

---

## 3. How It Actually Works — The Full Explanation

Designing a production-ready Bulk Update API requires addressing five distinct layers: payload contract design, ingestion boundaries, database write optimization, concurrency control, and asynchronous execution.

```txt
BULK UPDATE REQUEST LIFECYCLE:
Client Payload
  │
  ▼
[Ingress Boundary] ──> Batch size capped (<= 100)? ──No──> 413 Payload Too Large
  │ Yes
  ▼
[Duplicate Check]  ──> Duplicate IDs in payload?   ──Yes─> 400 Bad Request
  │ No
  ▼
[Batch Authorization] ──> Fetch tenant records & verify ownership in 1 query
  │
  ▼
[Processing Engine]
  │
  ├── Small Batch (< 100 items): Synchronous Execution
  │     ├── Mode A: Atomic Transaction (BEGIN ... COMMIT) ──> 200 OK or 400/422
  │     └── Mode B: Partial Success Multi-Row Execution   ──> HTTP 207 Multi-Status
  │
  └── Large Batch (> 500 items): Asynchronous Execution
        └── Enqueue Job ──> Return 202 Accepted (Location: /jobs/:id) ──> Background Worker
```

### 1. Bulk Update Patterns: Atomic vs. Partial Success

There are two primary behavioral contracts for bulk updates:

| Dimension | Pattern A: Atomic All-or-Nothing | Pattern B: Partial Success (Multi-Status) |
| :--- | :--- | :--- |
| **HTTP Semantics** | `PATCH /api/v1/resources` | `PATCH /api/v1/resources` or `POST /api/v1/resources/bulk` |
| **HTTP Status Code** | `200 OK` (all passed) or `400/422/409` (all rolled back) | `207 Multi-Status` (RFC 4918 / RFC 5789) |
| **Database Strategy** | Single transaction (`BEGIN ... COMMIT`) | Multi-row update with per-row status reporting or savepoints |
| **Ideal Use Case** | Financial ledger entries, inventory transfers, interdependent graph nodes | Independent entity edits (e.g., updating statuses on 50 support tickets) |
| **Client Complexity** | Low (binary success/fail) | Medium (must parse per-item response envelope and highlight errors) |

#### The HTTP 207 Multi-Status Contract
When records are independent, partial success is the standard. Originally defined in RFC 4918 (WebDAV) and adopted across modern REST architectures, HTTP `207 Multi-Status` signals that the response payload contains independent status codes for multiple distinct operations.

```json
// HTTP/1.1 207 Multi-Status
// Content-Type: application/json
{
  "summary": {
    "total": 3,
    "succeeded": 2,
    "failed": 1
  },
  "results": [
    {
      "id": "item_101",
      "status": 200,
      "data": { "id": "item_101", "status": "active", "version": 2 }
    },
    {
      "id": "item_102",
      "status": 409,
      "error": {
        "code": "CONCURRENCY_CONFLICT",
        "message": "Resource was modified by another transaction. Provided version: 1, current version: 3."
      }
    },
    {
      "id": "item_103",
      "status": 200,
      "data": { "id": "item_103", "status": "active", "version": 4 }
    }
  ]
}
```

---

### 2. Ingestion Boundaries and Request Sanitization

Before touching the database, the API gateway or controller must enforce three strict ingress invariants:

1. **Max Batch Size Enforcement:** Never allow unbounded batch payloads. A single request trying to update 50,000 items will block Node event loops during JSON parsing, trigger memory pressure, and hold database table locks. Cap synchronous batches at a strict limit (e.g., maximum 100 items). Return `413 Payload Too Large` if `items.length > 100`.
2. **Intra-Batch Duplicate ID Detection:** If the client sends `[{ id: 5, price: 10 }, { id: 5, price: 20 }]` in the same batch, the database behavior becomes non-deterministic and can trigger deadlocks depending on execution order. The server must reject requests containing duplicate IDs upfront with `400 Bad Request`.
3. **Field Whitelisting:** Prevent mass assignment vulnerabilities. Bulk update payloads must only allow explicitly mutable fields (e.g., `status`, `assigned_to`). System fields like `id`, `tenant_id`, `created_at`, or `role` must be stripped or rejected.

---

### 3. Database Write Optimization (Eliminating the N+1 Loop)

Processing 100 updates via 100 sequential queries takes $100 \times \text{network latency}$ (e.g., $100 \times 3\text{ms} = 300\text{ms}$ of pure wire overhead, plus query execution time). 

To execute bulk updates in a single round-trip, use multi-row SQL patterns:

#### Pattern A: Multi-Row `UPDATE ... FROM (VALUES ...)` (PostgreSQL / MySQL 8.0+)
Instead of 100 queries, construct a single parameterized query that joins the target table against a virtual values table:

```sql
UPDATE items AS i
SET 
    price = v.price,
    status = v.status,
    version = i.version + 1,
    updated_at = NOW()
FROM (VALUES
    ('item_101'::uuid, 29.99::numeric, 'active'::text, 1::int),
    ('item_103'::uuid, 49.99::numeric, 'archived'::text, 3::int)
) AS v(id, price, status, expected_version)
WHERE i.id = v.id 
  AND i.tenant_id = 'tenant_abc'
  AND i.version = v.expected_version
RETURNING i.id, i.version, i.updated_at;
```

#### Pattern B: Multi-Row `UPDATE ... CASE WHEN`
For databases that do not support `UPDATE FROM VALUES`:

```sql
UPDATE items
SET 
    price = CASE id
        WHEN 'item_101' THEN 29.99
        WHEN 'item_103' THEN 49.99
    END,
    status = CASE id
        WHEN 'item_101' THEN 'active'
        WHEN 'item_103' THEN 'archived'
    END,
    version = version + 1
WHERE id IN ('item_101', 'item_103')
  AND tenant_id = 'tenant_abc';
```

#### Performance Comparison:

```txt
DATABASE ROUND-TRIP OVERHEAD (100 Records):
Sequential Loop:  [App] ──(100 separate round trips)──> [DB]  => ~300ms - 800ms total
Multi-Row VALUES: [App] ──(1 single SQL statement)───> [DB]  => ~8ms - 15ms total
```

---

### 4. Concurrency Control: Optimistic Locking in Bulk Writes

In high-concurrency environments, two operators or background tasks might bulk-update overlapping sets of records simultaneously. Without concurrency control, Operator B will silently overwrite Operator A's changes (the Lost Update anomaly).

To guarantee safety:
1. Every record has an integer `version` or timestamp `updated_at` column.
2. The client provides the `version` it read when submitting the update payload.
3. The SQL update specifies `WHERE id = :id AND version = :expected_version`.
4. If a row in the database currently has `version = 3`, but the payload supplied `version = 2`, the `WHERE` condition matches 0 rows.
5. In an atomic transaction, this raises a `409 Conflict` rolling back the batch. In a partial-success API, the item is marked as status `409` in the `207 Multi-Status` response while unaffected rows commit cleanly.

---

### 5. Asynchronous Bulk Jobs (The $>500$ Record Pattern)

When bulk operations involve large datasets (e.g., updating 5,000 users or importing a 20,000-row CSV), holding a synchronous HTTP connection open will trigger edge proxy timeouts (AWS ALB default: 60s, Cloudflare default: 100s).

The architecture transitions to an **Asynchronous Job Pattern**:

```txt
ASYNC BULK WORKFLOW:
1. Client ─── POST /api/v1/bulk-jobs ───> API Gateway
2. Client <── HTTP 202 Accepted (Location: /jobs/job_999) ── API Gateway
                                            │
                                      (Enqueues Task)
                                            │
                                            ▼
                                   [Message Queue / Redis]
                                            │
                                      (Worker Pops)
                                            │
                                            ▼
                                   [Background Worker]
                                   (Processes in chunks of 100)
                                            │
3. Client ─── GET /api/v1/bulk-jobs/job_999 ───> Polling Status (25% -> 75% -> 100%)
4. Client ─── GET /api/v1/bulk-jobs/job_999/results ──> Retrieves Full Itemized Manifest
```

1. **Submission:** Client sends `POST /api/v1/bulk-jobs/items` with the dataset or a reference to an uploaded S3 object.
2. **Immediate Response:** Backend validates schema, stores the job record in a database, pushes a message to a queue (e.g., RabbitMQ, SQS, BullMQ), and returns `HTTP 202 Accepted` with a `Location: /api/v1/bulk-jobs/:jobId` header.
3. **Chunked Processing:** Background workers consume the job, splitting the dataset into batches of 100 rows per transaction to prevent locking the database.
4. **State Tracking:** Workers persist progress metrics (`processed`, `failed`, `total`) and item-level error details in Redis or PostgreSQL.
5. **Retrieval:** The client polls `GET /api/v1/bulk-jobs/:jobId` or receives a Webhook notification upon completion.

---

## 4. Real Code — See It Working

### Implementation: Production-Grade Bulk Update Route (Node.js / Express + PostgreSQL)

This implementation demonstrates input sanitization, duplicate ID rejection, multi-row SQL batch execution, optimistic concurrency validation, and the `207 Multi-Status` response contract.

```typescript
import { Request, Response } from 'express';
import { Pool, PoolClient } from 'pg';

interface BulkUpdateItem {
  id: string;
  price: number;
  status: 'active' | 'archived' | 'draft';
  version: number; // For optimistic locking
}

interface ItemResult {
  id: string;
  status: number;
  data?: Record<string, any>;
  error?: { code: string; message: string };
}

const dbPool = new Pool({ connectionString: process.env.DATABASE_URL });
const MAX_BATCH_SIZE = 100;

export async function handleBulkUpdateItems(req: Request, res: Response): Promise<void> {
  const tenantId = req.headers['x-tenant-id'] as string;
  const updates: BulkUpdateItem[] = req.body.updates;

  // 1. Ingress Boundary: Cap batch size to protect event loop and DB connection pool
  if (!Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ error: 'Payload must contain a non-empty "updates" array.' });
    return;
  }

  if (updates.length > MAX_BATCH_SIZE) {
    res.status(413).json({
      error: `Batch size of ${updates.length} exceeds maximum limit of ${MAX_BATCH_SIZE} items.`
    });
    return;
  }

  // 2. Intra-batch duplicate check to prevent non-deterministic updates and deadlocks
  const seenIds = new Set<string>();
  for (const item of updates) {
    if (!item.id || typeof item.version !== 'number') {
      res.status(400).json({ error: 'Each item must specify a valid "id" and integer "version".' });
      return;
    }
    if (seenIds.has(item.id)) {
      res.status(400).json({ error: `Duplicate ID "${item.id}" detected in batch payload.` });
      return;
    }
    seenIds.add(item.id);
  }

  const client: PoolClient = await dbPool.connect();
  const results: ItemResult[] = [];

  try {
    // 3. Batch Authorization & State Fetch: Fetch all existing rows in a single query
    const ids = updates.map(u => u.id);
    const existingRowsQuery = await client.query(
      `SELECT id, tenant_id, version, price, status 
       FROM items 
       WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
      [ids, tenantId]
    );

    const existingMap = new Map<string, any>();
    for (const row of existingRowsQuery.rows) {
      existingMap.set(row.id, row);
    }

    // Separate items ready for SQL execution from those failing validation or auth
    const validUpdatesForSql: BulkUpdateItem[] = [];

    for (const item of updates) {
      const existing = existingMap.get(item.id);

      // Authorization / Existence Check
      if (!existing) {
        results.push({
          id: item.id,
          status: 404,
          error: { code: 'NOT_FOUND', message: 'Item does not exist or does not belong to this tenant.' }
        });
        continue;
      }

      // Optimistic Locking Check: Detect stale versions before writing
      if (existing.version !== item.version) {
        results.push({
          id: item.id,
          status: 409,
          error: {
            code: 'VERSION_CONFLICT',
            message: `Stale version. Provided: ${item.version}, Current: ${existing.version}`
          }
        });
        continue;
      }

      // Domain Field Validation
      if (item.price < 0) {
        results.push({
          id: item.id,
          status: 422,
          error: { code: 'INVALID_PRICE', message: 'Price cannot be negative.' }
        });
        continue;
      }

      validUpdatesForSql.push(item);
    }

    // 4. Multi-Row SQL Execution: Update all valid rows in a single round-trip
    if (validUpdatesForSql.length > 0) {
      // Build parameterized VALUES clause: ($1, $2, $3, $4), ($5, $6, $7, $8)...
      const valuePlaceholders: string[] = [];
      const queryParams: any[] = [tenantId];
      let paramIndex = 2;

      for (const item of validUpdatesForSql) {
        valuePlaceholders.push(
          `($${paramIndex}::uuid, $${paramIndex + 1}::numeric, $${paramIndex + 2}::text, $${paramIndex + 3}::int)`
        );
        queryParams.push(item.id, item.price, item.status, item.version);
        paramIndex += 4;
      }

      const multiRowSql = `
        UPDATE items AS i
        SET 
          price = v.price,
          status = v.status,
          version = i.version + 1,
          updated_at = NOW()
        FROM (VALUES ${valuePlaceholders.join(', ')}) AS v(id, price, status, expected_version)
        WHERE i.id = v.id 
          AND i.tenant_id = $1
          AND i.version = v.expected_version
        RETURNING i.id, i.price, i.status, i.version, i.updated_at;
      `;

      const updateResult = await client.query(multiRowSql, queryParams);

      for (const updatedRow of updateResult.rows) {
        results.push({
          id: updatedRow.id,
          status: 200,
          data: {
            id: updatedRow.id,
            price: Number(updatedRow.price),
            status: updatedRow.status,
            version: updatedRow.version,
            updatedAt: updatedRow.updated_at
          }
        });
      }
    }

    // 5. Construct 207 Multi-Status Response Envelope
    const totalSucceeded = results.filter(r => r.status === 200).length;
    const totalFailed = results.length - totalSucceeded;

    res.status(207).json({
      summary: {
        total: updates.length,
        succeeded: totalSucceeded,
        failed: totalFailed
      },
      results
    });
  } catch (error) {
    console.error('Unhandled Bulk Update Error:', error);
    res.status(500).json({ error: 'Internal Server Error during bulk update processing.' });
  } finally {
    client.release(); // Always release connection back to pool
  }
}
```

---

### Resilient Frontend Consumer Pattern (Handling HTTP 207 Responses)

```typescript
interface BulkUpdatePayload {
  id: string;
  price: number;
  status: 'active' | 'archived' | 'draft';
  version: number;
}

interface MultiStatusResponse {
  summary: { total: number; succeeded: number; failed: number };
  results: Array<{
    id: string;
    status: number;
    data?: any;
    error?: { code: string; message: string };
  }>;
}

export async function executeBatchUpdateWithChunking(
  allEdits: BulkUpdatePayload[],
  chunkSize = 100
): Promise<void> {
  // Split large UI state into safe chunks of 100
  const chunks: BulkUpdatePayload[][] = [];
  for (let i = 0; i < allEdits.length; i += chunkSize) {
    chunks.push(allEdits.slice(i, i + chunkSize));
  }

  for (const chunk of chunks) {
    const response = await fetch('/api/v1/items/bulk', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': 'tenant_abc'
      },
      body: JSON.stringify({ updates: chunk })
    });

    if (response.status === 207) {
      const data: MultiStatusResponse = await response.json();

      data.results.forEach(result => {
        if (result.status === 200) {
          // Update client cache / Redux / TanStack Query with fresh version
          console.log(`Successfully updated item ${result.id} to version ${result.data.version}`);
        } else if (result.status === 409) {
          // Highlight table row with conflict banner & prompt user to reload
          console.warn(`Item ${result.id} had a version conflict. Refetching latest row data.`);
        } else {
          // Display validation error tooltip on specific cell
          console.error(`Item ${result.id} failed: ${result.error?.message}`);
        }
      });
    } else {
      throw new Error(`Unexpected server error: HTTP ${response.status}`);
    }
  }
}
```

---

## 5. The Interview Questions — All of Them, Done Properly

### **Q: When should you choose an atomic (all-or-nothing) bulk update over a partial success (207 Multi-Status) bulk update?**

Choose an **atomic all-or-nothing** pattern when the records in the batch are semantically coupled or represent a single business transaction where partial application leaves the system in an illegal state. Examples include:
- Moving money between internal accounts (debiting ledger A and crediting ledger B).
- Reallocating limited stock across orders where satisfying order 1 depends on taking stock from order 2.
- Publishing a complex CMS hierarchy where child pages cannot exist without their updated parent pages.

In these cases, wrap the operations in a single database transaction (`BEGIN ... COMMIT`) and return standard HTTP codes (`200 OK` on success, `400/409/422` on rollback).

Choose **partial success (HTTP 207 Multi-Status)** when records are completely independent entities. Examples include:
- Bulk updating the status of 100 selected support tickets in a CRM.
- Updating product prices across unrelated catalog categories.
- User tagging operations in a photo gallery.

Failing 99 valid updates because 1 item has a typo creates immense user frustration and forces complex client-side retry gymnastics. Partial success commits valid rows and returns an itemized error manifest for the rest.

---

### **Q: How do you prevent the N+1 query problem on the database when updating 100 rows with completely different values?**

In naive implementations, developers run a loop executing individual `UPDATE` statements sequentially. This causes 100 network round trips to the database, exhausts connection pools, and holds transaction locks.

To eliminate N+1 queries, use one of three architectural patterns:
1. **Multi-Row `UPDATE FROM (VALUES ...)`:** Pass all updates as an array of tuples to a single parameterized query. The database treats the values as an inline temporary table and executes a single joined update query in one round trip.
2. **Bulk `UPDATE ... CASE WHEN`:** Construct dynamic `CASE WHEN id = :id THEN :val END` statements for each column within a single `WHERE id IN (...)` clause.
3. **Staging Table with Bulk Load:** For larger batches (500–5,000 rows), write the batch into a temporary staging table using high-speed bulk copy (`pg_copy` / MySQL `LOAD DATA`), then execute a single set-based update: `UPDATE target SET col = s.col FROM staging s WHERE target.id = s.id`.

---

### **Q: How do you handle concurrency conflicts (lost updates) when multiple users edit overlapping records in a bulk batch?**

Use **Optimistic Concurrency Control (OCC)**:
1. Ensure the database schema includes a `version INT NOT NULL DEFAULT 1` or `updated_at TIMESTAMP` column.
2. The client must include the current `version` of each record in the update payload.
3. During the batch write, include the version in the query predicate: `WHERE id = :id AND version = :expected_version`, and increment `version = version + 1`.
4. If another process updated the record in the interim, the version in the database will be higher, causing the `WHERE` condition to match 0 rows.
5. In a `207 Multi-Status` workflow, the server identifies rows that matched 0 records, marks their individual status as `409 Conflict`, and returns the current database state so the client can resolve the merge.

Avoid using pessimistic locking (`SELECT FOR UPDATE`) across large bulk batches because acquiring locks across dozens of rows simultaneously dramatically increases the likelihood of database **deadlocks**.

---

### **Q: Why shouldn't you process a batch of 5,000 records in a single synchronous HTTP request, and how do you architect the asynchronous alternative?**

A synchronous request for 5,000 records fails in production due to three hard infrastructure constraints:
1. **Gateway and Reverse Proxy Timeouts:** Upstream proxies (ALB, Nginx, Cloudflare) terminate idle connections if the response takes longer than 30–60 seconds.
2. **Node.js Event Loop Blocking:** Deserializing and validating massive JSON payloads blocks the single-threaded Node.js event loop, degrading latency for all other concurrent users.
3. **Database Lock Starvation:** A transaction modifying thousands of rows holds table or index locks for extended durations, blocking read/write traffic on the primary database.

#### The Asynchronous Solution:
1. The client sends `POST /api/v1/bulk-jobs` containing the payload or a presigned S3 URL pointing to a CSV/JSON file.
2. The API persists a job record (`status: "pending"`) and returns `HTTP 202 Accepted` with a `Location: /api/v1/bulk-jobs/:jobId` header in $< 50\text{ms}$.
3. A background worker (via BullMQ, Celery, or AWS SQS) consumes the job and processes the records in manageable chunks (e.g., 100 records per transaction).
4. The client polls `GET /api/v1/bulk-jobs/:jobId` to inspect a progress bar (`{ percent: 65, processed: 3250, total: 5000 }`).
5. When complete, the endpoint provides a link to download the itemized results manifest.

---

### **Q: How do you implement secure row-level authorization in bulk operations without running N individual permission queries?**

Never authorize only the first item in the batch and assume the rest belong to the same user or organization. This creates a severe **BOLA (Broken Object Level Authorization)** vulnerability where an attacker injects foreign resource IDs into the batch array.

To perform performant, secure batch authorization:
1. Extract all target IDs from the payload into an array.
2. Execute a single query to fetch matching records filtered by the authenticated user's tenant ID:
   ```sql
   SELECT id, tenant_id, owner_id, version 
   FROM items 
   WHERE id = ANY($1::uuid[]) AND tenant_id = $2;
   ```
3. In memory, compare the fetched record IDs against the requested ID array.
4. Any requested ID missing from the query results is flagged with `404 Not Found` or `403 Forbidden` in the itemized response.
5. This validates ownership for 100 items in a single query round trip with zero N+1 overhead.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Wrapping Independent Bulk Updates in a Single Database Transaction
- **The Mistake:** Placing an entire multi-item batch inside `BEGIN ... COMMIT` when processing independent resources.
- **Why It Fails:** If item 100 has a schema or constraint validation failure, the entire transaction aborts. All 99 valid updates are discarded.
- **The Fix:** For partial-success APIs, validate all rows first in application memory. Execute valid updates using a multi-row update statement that excludes invalid rows, or use database savepoints per row if complex multi-table business logic is required.

---

### Trap 2: Unbounded Batch Payload Sizes
- **The Mistake:** Omitting explicit batch size caps on bulk endpoints.
- **Why It Fails:** A client script sends 20,000 items in a 50MB JSON payload. The JSON parser blocks the event loop for 400ms, memory spikes trigger V8 garbage collection freezes, and the database query exceeds lock timeout thresholds.
- **The Fix:** Enforce strict payload limits at the routing/middleware layer:
  ```typescript
  if (req.body.updates.length > 100) {
    return res.status(413).json({ error: 'Max batch size is 100 items.' });
  }
  ```

---

### Trap 3: Intra-Batch Duplicate IDs
- **The Mistake:** Assuming every ID in the client's `updates` array is unique.
- **Why It Fails:** If the client sends `[{ id: 42, val: 'A' }, { id: 42, val: 'B' }]`, SQL engines execute updates in non-deterministic order. Furthermore, if two concurrent transactions update the same set of IDs in different orders (`[A, B]` vs `[B, A]`), the database will trigger a **deadlock**.
- **The Fix:** Deduplicate IDs before processing. Sort IDs lexicographically before acquiring database locks if multi-row transactions are required.

---

### Trap 4: Trusting Ingress Validation for Row-Level Authorization
- **The Mistake:** Verifying that the authenticated user has the "Editor" role at the top of the route, but failing to verify ownership for each individual record ID in the batch.
- **Why It Fails:** An authenticated editor from Tenant A adds item IDs belonging to Tenant B into their bulk payload. If the update query only filters by `WHERE id = :id` without checking `AND tenant_id = :tenant_id`, cross-tenant data corruption occurs.
- **The Fix:** Always enforce tenant scoping on every multi-row query:
  ```sql
  WHERE id = v.id AND tenant_id = :tenantId
  ```

---

### Trap 5: Returning HTTP 200 with Hidden Errors in a Custom Envelope
- **The Mistake:** Returning `200 OK` with `{ status: "error", message: "All items failed" }` when the entire batch is invalid.
- **Why It Fails:** Breaks HTTP semantics, disables standard gateway monitoring, confuses CDN caching layers, and requires every consuming client to implement custom body-parsing error handlers.
- **The Fix:** Use standard HTTP codes:
  - `400 Bad Request` for malformed JSON or duplicate IDs.
  - `413 Payload Too Large` when batch exceeds count limit.
  - `422 Unprocessable Entity` when all items fail domain validation.
  - `207 Multi-Status` when the batch completes with mixed success/failure outcomes.

---

## 7. Compare With Related Concepts

```txt
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BULK UPDATE ARCHITECTURES                          │
├──────────────────────────────┬──────────────────────────────────────────────┤
│ Single-Item Loop (Anti-Pattern)│ N requests, N TCP handshakes, pool exhaustion │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ Atomic Batch (200 / 400)     │ Single DB transaction, all-or-nothing rollback│
├──────────────────────────────┼──────────────────────────────────────────────┤
│ Multi-Status (207 RFC 4918)  │ 1 request, itemized success/error manifest   │
├──────────────────────────────┼──────────────────────────────────────────────┤
│ Async Job (202 Accepted)     │ Queue worker, chunked DB writes, status poll │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

### 1. Synchronous Bulk Updates vs. Asynchronous Jobs (`202 Accepted`)
- **Key Difference:** Synchronous bulk updates execute within the HTTP request-response cycle and return results immediately. Asynchronous jobs offload execution to a background queue worker and provide a job ticket for polling or webhook callbacks.
- **Rule of Thumb:** Use synchronous updates (`PATCH /items`) for $\le 100$ records that take $< 500\text{ms}$. Switch to asynchronous jobs (`POST /bulk-jobs`) for $> 500$ records, long-running calculations, or file imports.

---

### 2. Multi-Status (`207`) vs. Atomic Transaction (`200` / `400`)
- **Key Difference:** Atomic transactions enforce all-or-nothing consistency across the batch via `BEGIN ... COMMIT`. `207 Multi-Status` permits independent item execution, committing valid rows and reporting errors per item.
- **Rule of Thumb:** Use Atomic (`200/400`) when entities are mathematically or structurally interdependent. Use Multi-Status (`207`) when entities are completely independent business records.

---

### 3. Multi-Row SQL (`UPDATE FROM VALUES`) vs. App-Layer Loop
- **Key Difference:** An application-layer loop executes $N$ separate network round trips to the database. Multi-row SQL joins against inline values and updates $N$ rows in a single query round trip.
- **Rule of Thumb:** Never run updates in a loop in production backend services. Always use multi-row SQL syntax or staging tables.

---

### 4. Optimistic Locking vs. Pessimistic Locking in Bulk Writes
- **Key Difference:** Optimistic locking checks version predicates at write time (`WHERE version = :expectedVersion`). Pessimistic locking locks rows upfront (`SELECT FOR UPDATE`).
- **Rule of Thumb:** Use Optimistic Locking for bulk updates. Pessimistic row locking across multiple rows simultaneously creates severe database deadlock risks under concurrent traffic.

---

## 8. 🧠 The Memory Hook

> **Treat bulk updates like a courier shipping manifest: Cap the box count at the door (100 max), check for duplicate labels upfront, update all rows in a single multi-row SQL delivery run, and hand back an itemized 207 Multi-Status receipt so the sender knows exactly which packages flew and which one had a bad address.**

