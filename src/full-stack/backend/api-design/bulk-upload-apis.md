# Designing Bulk Upload APIs: Presigned S3 URLs, Asynchronous Ingestion, and Streaming Validation

## 1. Why This Exists — The Problem First

An enterprise merchant logs into an e-commerce platform and uploads a 500MB CSV file containing 100,000 product rows with updated inventory, pricing, and variant descriptions.

In a naive architecture, the browser sends this file as a standard `multipart/form-data` HTTP `POST` request directly to the backend web server. What happens next is a catastrophic production outage:

1. **Memory Exhaustion (OOM Crash):** The web server receives the 500MB file. If using standard middleware like `multer.memoryStorage()` or parsing the entire payload into memory as JSON/objects, the raw text decompresses into 2GB to 4GB of runtime heap allocations. The Node.js or Python process runs out of memory and crashes instantly, taking down all concurrent user traffic.
2. **Reverse Proxy Timeouts (504 Gateway Timeout):** Parsing 100,000 rows, running schema validation, and executing database queries takes several minutes. Long before the server finishes, Cloudflare, AWS ALB, or Nginx terminates the idle socket after 30 to 60 seconds.
3. **Database Connection & Lock Starvation:** The server attempts to insert 100,000 rows in one massive transaction or loops through 100,000 sequential `INSERT` queries. The database connection pool is drained, write locks stall other queries, and the database CPU pegs at 100%.
4. **The "Black Box" State Disaster:** The client receives a generic `504 Gateway Timeout`. The merchant does not know if 0 rows, 45,000 rows, or all rows were imported. If they click "Upload" again, they risk creating duplicate records or corrupting foreign key relationships.

Synchronous HTTP request-response cycles are designed for sub-second, lightweight transactions. Handling massive data ingestion inside a standard request thread violates the fundamental principles of scalable API design. Bulk upload requires decoupling file intake from file processing through cloud object storage, asynchronous worker queues, streaming chunk parsers, and explicit job state machines.

## 2. The Analogy — Make It Obvious

Imagine a corporate bank headquarters handling document deliveries.

**The Naive Way (Direct Server Upload):**
A customer arrives at the front desk with 50 heavy wooden shipping crates filled with 100,000 paper loan applications and dumps them directly onto the receptionist's small desk. The receptionist tries to open every crate, inspect every page, verify signatures, and file them into the metal filing cabinet one by one while 200 other customers wait in line. Within ten minutes, the desk collapses under the physical weight, the receptionist passes out from exhaustion, the lobby is completely blocked, and hundreds of loose documents are scattered across the floor.

**The Bulk Upload Architecture Way (Presigned URL + Async Ingestion):**
1. **The Reception Desk Gate Pass (Step 1 — Presigned URL):** The customer walks up to the front desk and says, "I have 50 crates of documents to deliver." The receptionist does not touch the crates. Instead, the receptionist stamps a signed security gate pass with an expiration time of 15 minutes and hands it to the customer along with a tracking ticket number (`job_id`).
2. **Direct Delivery to the Warehouse Dock (Step 2 — Direct-to-S3 Upload):** The customer drives around back to the high-capacity Cargo Dock (Cloud Object Storage / Amazon S3). The gate guard validates the signed pass and lets the customer unload all 50 crates directly into Warehouse Bay 4. The front office remains completely clean, fast, and unburdened.
3. **The Work Ticket & Sorting Line (Step 3 — Queue & Streaming Ingestion):** Once the crates are on the dock, the warehouse supervisor drops a job ticket into the night-shift processing queue (Celery / BullMQ).
4. **Chunked Processing:** Dedicated warehouse workers pick up one crate at a time (streaming chunk of 1,000 records). They inspect the forms. Valid forms are placed into the central archive in batches of 1,000. Defective forms (missing signature, invalid tax ID) are stamped with an exact red error reason and placed in a "Correction Binder."
5. **The Tracking Kiosk (Progress & Error Reporting):** At any point, the customer visits the electronic tracking kiosk with their ticket number (`GET /jobs/:id`). The kiosk displays: *"42% complete — 42,000 processed, 18 rejected."* When finished, the customer downloads the "Correction Binder" (Error CSV) showing the exact line numbers and reasons for failed rows so they can fix and re-submit only the invalid items.

```txt
┌────────┐ 1. POST /uploads/initiate (file metadata) ┌──────────────┐
│        ├───────────────────────────────────────────►│  API Gateway  │
│        │◄──────────────────────────────────────────┤   (Backend)  │
│        │ 2. Return Presigned S3 URL + Job ID       └──────┬───────┘
│ Client │                                                  │ Enqueue
│        │ 3. Direct HTTP PUT (Stream 500MB file)           ▼
│        ├───────────────────────────────────────────►┌─────────────┐
│        │                                            │ Job Queue   │
│        │ 4. GET /jobs/:id (Poll progress)           │ (Redis/SQS) │
│        ├─────────────────────────────┐              └──────┬──────┘
└────────┘                             │                     │ Dequeue
                                       ▼                     ▼
                             ┌─────────────────┐    ┌─────────────────┐
                             │  Object Storage │◄───┤ Worker Process  │
                             │  (AWS S3 / GCS) ├────► (Stream & Chunk)│
                             └─────────────────┘    └────────┬────────┘
                                                             │
                                                             ▼ Batch Insert
                                                    ┌─────────────────┐
                                                    │ PostgreSQL / DB │
                                                    └─────────────────┘
```

## 3. How It Actually Works — The Full Explanation

Designing a production-grade bulk upload API involves three architectural layers: the 3-step ingestion lifecycle, memory-bounded stream processing, and granular error isolation.

### The 3-Step Asynchronous Upload Lifecycle

**Step 1: Upload Initiation (`POST /api/v1/uploads/initiate`)**
The client never sends the file payload to the backend server. Instead, it sends lightweight JSON metadata describing the upload intent:
- Request body: `{ "fileName": "products_q3.csv", "fileSizeBytes": 524288000, "mimeType": "text/csv", "entityType": "PRODUCT_CATALOG" }`.
- The API server verifies authentication, user permissions, and tenant quotas.
- It validates the declared file size against business limits (e.g., max 500MB) and validates the MIME type.
- The server generates a unique UUID `job_id` and records a row in the database table `upload_jobs` with status `PENDING_UPLOAD`.
- The server invokes the cloud storage SDK (AWS S3, Google Cloud Storage, or Azure Blob) to generate a **Presigned Upload URL**. This URL contains a cryptographically signed signature that allows the client to upload an object directly to a specific bucket path (e.g., `s3://app-uploads/tenant-99/job-abc-123/raw.csv`) within a strict time window (e.g., 15 minutes).
- The API responds with HTTP `201 Created`: `{ "jobId": "job-abc-123", "uploadUrl": "https://s3.amazonaws.com/app-uploads/...", "expiresInSeconds": 900 }`.

**Step 2: Direct Client-to-Cloud Upload**
The client takes the `uploadUrl` and performs an HTTP `PUT` request directly to the object storage endpoint, streaming the binary file from local disk/browser memory.
- The backend API server handles zero network traffic and zero byte buffering for this step.
- Object storage natively handles multi-gigabyte transfers, TLS termination, network retries, and high-throughput ingestion without consuming application server compute.
- Modern browser clients track native upload progress events via `XMLHttpRequest.upload.onprogress` or the Fetch Streams API to show a real-time progress bar to the user.

**Step 3: Ingestion Trigger & Background Enqueueing**
Once the direct upload completes with HTTP `200 OK` from S3:
- The client notifies the backend via `POST /api/v1/uploads/:jobId/process` (or an S3 ObjectCreated Event Notification triggers an SQS queue / AWS Lambda automatically).
- The backend verifies that the file exists in the designated S3 bucket and that its byte size matches the registered metadata.
- The job status in the database transitions from `PENDING_UPLOAD` to `QUEUED`.
- A message containing `{ "jobId": "job-abc-123", "s3Key": "tenant-99/job-abc-123/raw.csv" }` is pushed onto an asynchronous distributed message queue (such as BullMQ on Redis, RabbitMQ, or AWS SQS).
- The API immediately responds with HTTP `202 Accepted`: `{ "jobId": "job-abc-123", "status": "QUEUED" }`.

### Memory-Bounded Streaming & Chunked Parsing

When an asynchronous worker node picks up the job from the queue, it must not download the entire 500MB file into memory or call `fs.readFileSync()`. Parsing a 500MB CSV file in one shot can allocate multiple gigabytes of JavaScript or Python objects, causing the worker itself to suffer an out-of-memory crash.

Instead, the worker implements a streaming pipeline that guarantees **$O(1)$ constant memory usage** regardless of whether the file contains 1,000 rows or 10,000,000 rows:

```txt
S3 Readable Stream ──► CSV Chunk Parser ──► 1,000-Row Buffer ──► Schema Validation
                                                                        │
                         ┌──────────────────────────────────────────────┴───────────┐
                         ▼ Valid Rows                                               ▼ Invalid Rows
                Batch SQL INSERT/UPSERT                                    Write to Errors CSV Stream
              (INSERT INTO ... ON CONFLICT)                               (s3://.../job-123/errors.csv)
```

1. **Streaming Download:** The worker opens an HTTP/TCP readable byte stream directly from S3 (`s3.getObject().createReadStream()`).
2. **Streaming CSV Parsing:** Bytes flow through a transform stream that parses comma-separated lines on the fly (e.g., Node.js `csv-parser` or Python generator `csv.reader`).
3. **Batch Accumulation:** The worker collects parsed row objects into an in-memory batch buffer of fixed size (e.g., 1,000 rows).
4. **Batch Schema Validation:** The 1,000 rows are validated against the entity schema (using Zod, Joi, or Pydantic).
5. **Bulk Database Persistence:** Valid rows are inserted into the database using a single multi-row `INSERT` statement or SQL `UNNEST` / `COPY` command with `ON CONFLICT DO UPDATE` (upsert) to handle idempotency.
6. **Garbage Collection Release:** Once the batch write finishes, the in-memory array is cleared, allowing the runtime garbage collector to reclaim the memory before the next 1,000 rows are read from the network stream. The memory footprint remains bounded around 50MB–100MB for the entire lifecycle.

### State Machine, Progress Tracking, and Error Isolation

A robust bulk upload API models the operation as a state machine:

```txt
[PENDING_UPLOAD] ──► [QUEUED] ──► [PROCESSING] ──┬──► [COMPLETED] (0 errors)
                                                 ├──► [PARTIALLY_FAILED] (some errors)
                                                 └──► [FAILED] (fatal system error)
```

- **Progress Updates:** As the worker processes every 1,000-row batch, it updates a progress counter in Redis (or updates the database record every $N$ batches). The client polls `GET /api/v1/jobs/:jobId` (or listens via Server-Sent Events / WebSockets) to display a live progress bar with percentage, rows processed, and error count.
- **Partial Failure Isolation:** In real-world enterprise data, finding 20 invalid rows out of 100,000 should not roll back the 99,980 valid rows unless strict transactional atomicity was explicitly requested. Valid rows are committed per batch.
- **The Error CSV Report:** Invalid rows are not returned as a massive 50MB JSON array in the status endpoint. Instead, the worker streams every failed row with its row number, rejected field, and error message into a secondary `errors.csv` file written to S3. When the job finishes with `PARTIALLY_FAILED`, the API provides a presigned download link for the error CSV.

## 4. Real Code — See It Working

Here is a complete, production-grade implementation in TypeScript using Express, AWS SDK v3, BullMQ, and Zod.

### 1. API Endpoints: Initiation and Process Trigger

```typescript
import express, { Request, Response } from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { db } from './database';

const router = express.Router();
const s3 = new S3Client({ region: process.env.AWS_REGION });
const uploadQueue = new Queue('bulk-upload-processing', {
  connection: { host: 'localhost', port: 6379 }
});

const BUCKET_NAME = process.env.UPLOADS_S3_BUCKET || 'production-app-uploads';

// Step 1: Client requests a Presigned S3 Upload URL
router.post('/uploads/initiate', async (req: Request, res: Response) => {
  const { fileName, fileSizeBytes, mimeType, entityType } = req.body;

  // Enforce file size limit (max 500MB) and allowed MIME types
  if (fileSizeBytes > 500 * 1024 * 1024) {
    return res.status(413).json({ error: 'File size exceeds maximum 500MB limit.' });
  }
  if (!['text/csv', 'application/vnd.ms-excel'].includes(mimeType)) {
    return res.status(400).json({ error: 'Invalid file format. Only CSV files are allowed.' });
  }

  const jobId = uuidv4();
  const s3Key = `uploads/tenants/${req.user.tenantId}/${jobId}/source.csv`;

  // Create upload job record in PostgreSQL
  await db.query(
    `INSERT INTO bulk_upload_jobs (id, tenant_id, user_id, file_name, file_size_bytes, s3_key, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'PENDING_UPLOAD')`,
    [jobId, req.user.tenantId, req.user.id, fileName, fileSizeBytes, s3Key]
  );

  // Generate Presigned S3 PUT URL (valid for 15 minutes)
  const putCommand = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(s3, putCommand, { expiresIn: 900 });

  return res.status(201).json({
    jobId,
    uploadUrl,
    expiresInSeconds: 900,
    s3Key,
  });
});

// Step 3: Client notifies backend that S3 direct upload completed
router.post('/uploads/:jobId/process', async (req: Request, res: Response) => {
  const { jobId } = req.params;

  const jobResult = await db.query(
    `SELECT * FROM bulk_upload_jobs WHERE id = $1 AND tenant_id = $2`,
    [jobId, req.user.tenantId]
  );

  if (jobResult.rows.length === 0) {
    return res.status(404).json({ error: 'Upload job not found.' });
  }

  const job = jobResult.rows[0];
  if (job.status !== 'PENDING_UPLOAD') {
    return res.status(400).json({ error: `Job is already in ${job.status} state.` });
  }

  // Update status to QUEUED
  await db.query(`UPDATE bulk_upload_jobs SET status = 'QUEUED', updated_at = NOW() WHERE id = $1`, [jobId]);

  // Enqueue job for background processing
  await uploadQueue.add('process-csv-job', {
    jobId: job.id,
    tenantId: job.tenant_id,
    s3Key: job.s3_key,
  });

  return res.status(202).json({
    jobId,
    status: 'QUEUED',
    statusUrl: `/api/v1/jobs/${jobId}`,
  });
});

// Status Polling Endpoint
router.get('/jobs/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;

  const result = await db.query(
    `SELECT id, status, total_rows, processed_rows, success_rows, error_rows, error_s3_key, created_at, completed_at
     FROM bulk_upload_jobs WHERE id = $1 AND tenant_id = $2`,
    [jobId, req.user.tenantId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  const job = result.rows[0];
  let errorDownloadUrl = null;

  // Generate presigned GET download URL if errors were written
  if (job.error_s3_key && job.error_rows > 0) {
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: job.error_s3_key,
    });
    errorDownloadUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });
  }

  return res.status(200).json({
    jobId: job.id,
    status: job.status,
    progressPercentage: job.total_rows > 0 ? Math.round((job.processed_rows / job.total_rows) * 100) : 0,
    totalRows: job.total_rows,
    processedRows: job.processed_rows,
    successRows: job.success_rows,
    errorRows: job.error_rows,
    errorReportUrl: errorDownloadUrl,
    completedAt: job.completed_at,
  });
});
```

### 2. Client-Side Direct Upload to S3

```typescript
// Browser-side script uploading directly to AWS S3 using the Presigned URL
async function performBulkUpload(file: File) {
  // 1. Request Presigned URL from Backend
  const initResponse = await fetch('/api/v1/uploads/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      fileSizeBytes: file.size,
      mimeType: file.type || 'text/csv',
      entityType: 'PRODUCT_CATALOG',
    }),
  });

  if (!initResponse.ok) {
    throw new Error('Failed to initiate bulk upload.');
  }

  const { jobId, uploadUrl } = await initResponse.json();

  // 2. Direct HTTP PUT upload to S3 bypassing backend servers
  const s3UploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'text/csv',
    },
    body: file, // Stream the raw File object directly
  });

  if (!s3UploadResponse.ok) {
    throw new Error('Failed to upload file to cloud storage.');
  }

  // 3. Notify backend to enqueue background ingestion
  const processResponse = await fetch(`/api/v1/uploads/${jobId}/process`, {
    method: 'POST',
  });

  return await processResponse.json(); // Returns { jobId, status: 'QUEUED', statusUrl }
}
```

### 3. Background Worker: Streaming CSV Ingestion in $O(1)$ Memory

```typescript
import { Worker, Job } from 'bullmq';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { z } from 'zod';
import { db } from './database';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.UPLOADS_S3_BUCKET || 'production-app-uploads';
const BATCH_SIZE = 1000; // Process in chunks of 1,000 rows to keep memory constant

// Schema definition for product catalog rows
const ProductRowSchema = z.object({
  sku: z.string().min(3).max(50),
  name: z.string().min(1).max(255),
  price: z.coerce.number().positive(),
  inventory_count: z.coerce.number().int().nonnegative(),
});

type ProductRow = z.infer<typeof ProductRowSchema>;

interface RowError {
  rowNumber: number;
  rawLine: string;
  errorMessage: string;
}

new Worker('bulk-upload-processing', async (job: Job) => {
  const { jobId, tenantId, s3Key } = job.data;

  await db.query(`UPDATE bulk_upload_jobs SET status = 'PROCESSING', started_at = NOW() WHERE id = $1`, [jobId]);

  // Fetch S3 Object as a Node.js Readable Stream
  const s3Response = await s3.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }));
  const s3Stream = s3Response.Body as Readable;

  let rowCounter = 0;
  let successCounter = 0;
  let batchBuffer: ProductRow[] = [];
  const errorList: RowError[] = [];

  // Helper function to flush 1,000 valid rows to the database in a single batch
  async function flushBatch(rows: ProductRow[]) {
    if (rows.length === 0) return;

    // Construct multi-row parameterized batch INSERT with UPSERT on conflict
    const values: any[] = [];
    const placeholders: string[] = [];

    rows.forEach((r, idx) => {
      const offset = idx * 5;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
      values.push(tenantId, r.sku, r.name, r.price, r.inventory_count);
    });

    const query = `
      INSERT INTO products (tenant_id, sku, name, price, inventory_count)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (tenant_id, sku) DO UPDATE
      SET name = EXCLUDED.name,
          price = EXCLUDED.price,
          inventory_count = EXCLUDED.inventory_count,
          updated_at = NOW()
    `;

    await db.query(query, values);
    successCounter += rows.length;
  }

  // Stream parsing line by line
  await new Promise<void>((resolve, reject) => {
    s3Stream
      .pipe(csvParser())
      .on('data', async (rawRow) => {
        rowCounter++;
        const currentLineNumber = rowCounter + 1; // Accounting for CSV header

        const parseResult = ProductRowSchema.safeParse(rawRow);

        if (parseResult.success) {
          batchBuffer.push(parseResult.data);
        } else {
          errorList.push({
            rowNumber: currentLineNumber,
            rawLine: JSON.stringify(rawRow),
            errorMessage: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          });
        }

        // When batch reaches threshold, pause stream and write to DB
        if (batchBuffer.length >= BATCH_SIZE) {
          s3Stream.pause();
          try {
            await flushBatch(batchBuffer);
            batchBuffer = []; // Clear buffer to free memory immediately

            // Update progress in DB periodically
            await db.query(
              `UPDATE bulk_upload_jobs
               SET processed_rows = $1, success_rows = $2, error_rows = $3
               WHERE id = $4`,
              [rowCounter, successCounter, errorList.length, jobId]
            );
          } catch (err) {
            return reject(err);
          } finally {
            s3Stream.resume();
          }
        }
      })
      .on('end', async () => {
        try {
          // Flush remaining buffered rows
          if (batchBuffer.length > 0) {
            await flushBatch(batchBuffer);
            batchBuffer = [];
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      })
      .on('error', (err) => reject(err));
  });

  // If validation errors occurred, stream them into an error CSV on S3
  let errorS3Key: string | null = null;
  if (errorList.length > 0) {
    errorS3Key = `uploads/tenants/${tenantId}/${jobId}/errors.csv`;
    const errorCsvContent = [
      'RowNumber,ErrorMessage,RawData',
      ...errorList.map((e) => `${e.rowNumber},"${e.errorMessage.replace(/"/g, '""')}","${e.rawLine.replace(/"/g, '""')}"`),
    ].join('\n');

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: errorS3Key,
        Body: Buffer.from(errorCsvContent, 'utf-8'),
        ContentType: 'text/csv',
      })
    );
  }

  const finalStatus = errorList.length === 0 ? 'COMPLETED' : successCounter > 0 ? 'PARTIALLY_FAILED' : 'FAILED';

  await db.query(
    `UPDATE bulk_upload_jobs
     SET status = $1,
         total_rows = $2,
         processed_rows = $2,
         success_rows = $3,
         error_rows = $4,
         error_s3_key = $5,
         completed_at = NOW()
     WHERE id = $6`,
    [finalStatus, rowCounter, successCounter, errorList.length, errorS3Key, jobId]
  );
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why should clients upload large files directly to cloud object storage (S3/GCS) via presigned URLs instead of through the backend API servers?**

Passing large file uploads through backend API servers creates three severe scalability bottlenecks:
1. **Network & Thread Saturation:** A 500MB upload over a standard broadband connection occupies an API web server thread and socket connection for 30 to 120 seconds. During peak hours, a handful of concurrent uploads can exhaust the reverse proxy's connection pool, causing connection drops for all regular API requests.
2. **Double Ingestion Cost:** The backend server receives the file over the network and then must turn around and upload that file to S3, doubling total bandwidth consumption and latency.
3. **Compute Node Sizing:** Web servers must be provisioned with massive memory and disk buffers solely to handle occasional file uploads.

By issuing a presigned S3 PUT URL, the backend delegates binary transport entirely to AWS S3, which is purpose-built for multi-gigabyte throughput, edge acceleration, multi-part parallel chunking, and unlimited horizontal scale. The backend API handles only lightweight JSON metadata requests (<10ms each).

**Q: How do you handle schema and business validation on a 1,000,000-row file without running out of RAM?**

You must never load the entire file into an array or buffer in memory. The solution is a **streaming transformation pipeline with backpressure**:
1. Open a readable byte stream from S3 directly to the worker process.
2. Pipe the stream through an incremental CSV line parser that emits individual row objects as they arrive over the network.
3. Accumulate parsed rows in a fixed-size memory buffer (e.g., 1,000 items). When the buffer fills, pause the incoming S3 stream (`stream.pause()`) to apply backpressure so the network does not flood the process memory.
4. Run validation (e.g., Zod / Pydantic) on the 1,000-item batch. Valid items are saved to a batch insert array; invalid items are written to an error stream.
5. Execute the database batch write, clear the in-memory array to permit garbage collection, and resume the stream (`stream.resume()`).
This architecture operates in strict $O(1)$ constant memory regardless of whether the file size is 1MB or 50GB.

**Q: How should database writes be structured during bulk ingestion? Is one massive transaction better or worse than per-batch commits?**

Wrapping 100,000 rows in a single monolithic database transaction is an anti-pattern for bulk uploads:
- **Lock Contention & WAL Bloat:** Holding a database transaction open for minutes causes extreme table/row lock contention, bloats the Write-Ahead Log (WAL), and prevents database checkpointing.
- **Fragility:** If row 99,999 fails a uniqueness constraint, the entire transaction rolls back, destroying 20 minutes of processing and forcing the user to re-upload everything.
- **The Correct Pattern:** Chunked batch writes (1,000 to 5,000 rows per transaction) using parameterized multi-row `INSERT` statements with `ON CONFLICT DO UPDATE` (upsert). Each batch commits independently. If batch 40 fails, batches 1 through 39 remain safely committed. The system records the failed rows and continues processing subsequent batches.

**Q: How do you make asynchronous bulk ingestion idempotent so that worker retries don't corrupt data?**

Distributed queues (BullMQ, SQS) operate on "at-least-once" delivery semantics. If a worker node crashes or loses network connectivity after processing 50,000 rows, the queue will re-deliver the job to another worker. Idempotency is enforced through three mechanisms:
1. **Deterministic Unique Keys:** Database tables must enforce natural composite unique constraints (e.g., `UNIQUE(tenant_id, sku)`).
2. **SQL Upsert Semantics (`ON CONFLICT`):** Workers use `INSERT ... ON CONFLICT (tenant_id, sku) DO UPDATE SET ...` instead of plain inserts. If a re-delivered job re-processes the first 50,000 rows, it updates the existing rows to the same state rather than throwing duplicate key errors or creating duplicate entries.
3. **Job Checkpointing:** For massive files (10M+ rows), the worker can periodically write its last processed line number (`last_processed_line: 50000`) to Redis/PostgreSQL. On restart, the worker fast-forwards the stream to line 50,001.

**Q: How should the system handle and report partial failures (e.g., 500 bad rows out of 100,000)?**

Returning 500 detailed row error objects inside a polling JSON response payload degrades API performance and risks blowing HTTP response limits.
- The worker accumulates validation errors during stream execution and streams them directly into an S3 file: `s3://app-uploads/{tenant_id}/{job_id}/errors.csv`.
- The CSV file contains the original line number, the invalid column name, the exact validation error message, and the original raw input.
- When processing completes, if `error_count > 0`, the job status is set to `PARTIALLY_FAILED`.
- The `GET /jobs/:id` endpoint returns a signed S3 download URL for `errors.csv`. The user downloads the error report, fixes the 500 rejected rows in their spreadsheet editor, and re-uploads only those 500 rows.

**Q: What security controls are mandatory when implementing presigned S3 upload APIs?**

Direct-to-S3 uploads expose object storage to the public internet, requiring strict security boundaries:
1. **Enforce S3 Bucket Policies & IAM Least Privilege:** The credentials generating presigned URLs must only have permission to `s3:PutObject` on isolated tenant prefixes (`uploads/tenants/${tenantId}/${jobId}/*`).
2. **Constrain Presigned URL Parameters:** The presigned URL generation command must specify `ContentType` (forcing the client to upload the declared MIME type) and enforce short expiration windows (5 to 15 minutes).
3. **S3 Post Policy Size Constraints:** When using Presigned POST policies instead of PUT, use `content-length-range` conditions (e.g., `["content-length-range", 1024, 524288000]`) so S3 automatically rejects uploads exceeding 500MB at the edge.
4. **Antivirus & Malware Quarantine:** Files uploaded to S3 should reside in a "quarantine" bucket and must not be made publicly readable. An automated AWS Lambda / ClamAV scanner scans the object before the worker executes ingestion.
5. **CSV Formula Injection Prevention:** If uploaded data will later be exported back to CSV/Excel for human viewing, sanitize all string fields starting with `=`, `+`, `-`, or `@` (e.g., prefixing them with a single quote `'`) to prevent malicious formula execution in spreadsheet software.

## 6. The Traps — What Goes Wrong

### Trap 1: The Memory-Buffering Crash (OOM on Large Files)
- **The Mistake:** Using standard web frameworks or libraries that buffer incoming files into memory (`multer.memoryStorage()`, `req.file.buffer`, or reading the entire S3 object via `s3.getObject().promise()`).
- **Why It Fails:** A 300MB CSV file with millions of string tokens will decompress into 1.5GB–3GB of V8 heap memory. In containerized environments (Docker / Kubernetes with 1GB memory limits), the Linux OOM Killer immediately kills the process (`SIGKILL`), causing 502 Bad Gateway errors for all active users.
- **The Fix:** Never load whole files into memory. Stream directly from S3 using Node.js/Python streams, parse incrementally, and enforce batch sizes of 1,000 to 5,000 rows.

### Trap 2: The $N$-Query Database Bottleneck
- **The Mistake:** Processing a CSV row-by-row inside an asynchronous loop:
  ```typescript
  // CATASTROPHIC PERFORMANCE TRAP
  for (const row of rows) {
    await db.query('INSERT INTO products (sku, name) VALUES ($1, $2)', [row.sku, row.name]);
  }
  ```
- **Why It Fails:** Each database query incurs a network round-trip time (RTT) of 1ms–5ms. For a 100,000-row file, 100,000 sequential round-trips take **100 to 500 seconds (over 8 minutes)** purely in network idle time, pegging the database connection pool.
- **The Fix:** Accumulate rows into 1,000-row chunks and execute a single parameterized multi-row `INSERT INTO ... VALUES (...), (...), (...)` statement or use PostgreSQL `UNNEST()` / `COPY`. A 100,000-row file completes in 100 round-trips (taking 3 to 5 seconds total).

### Trap 3: Monolithic Transactions Causing Table Lockouts
- **The Mistake:** Wrapping the entire file ingestion in a single `BEGIN ... COMMIT` block to achieve "all-or-nothing" consistency.
- **Why It Fails:** Holding a database transaction open while streaming a 500MB file over the network keeps locks active for minutes. If a single row fails at line 98,000 due to a minor validation flaw, the database rolls back all 97,999 valid rows, wasting compute and frustrating the user.
- **The Fix:** Commit each 1,000-row chunk in its own independent transaction. Record failed rows into an error log or error CSV file so the user receives partial success and can re-upload only the corrected records.

### Trap 4: Presigned URL S3 Key Collisions and Bucket Hijacking
- **The Mistake:** Generating presigned URLs using raw user-provided filenames: `const s3Key = req.body.fileName;`.
- **Why It Fails:** If User A uploads `inventory.csv`, they can overwrite User B's `inventory.csv`. An attacker can specify `../../system/config.json` (path traversal) or upload executable binaries into a public bucket folder.
- **The Fix:** Always generate an immutable, server-controlled S3 key containing tenant isolation and UUIDs: `uploads/tenants/${tenantId}/${jobId}/${uuidv4()}.csv`.

### Trap 5: CSV Formula Injection (Formula / DDE Injection)
- **The Mistake:** Ingesting raw strings like `=cmd|' /C calc'!A0` or `=HYPERLINK("http://malicious.com")` from a CSV and later allowing administrators to export data back into a CSV file.
- **Why It Fails:** When the administrator opens the exported CSV file in Microsoft Excel or Google Sheets, the spreadsheet software treats cells starting with `=`, `+`, `-`, or `@` as executable macros, allowing remote code execution (RCE) on the administrator's computer.
- **The Fix:** When exporting or processing CSV data, sanitize cell values starting with formula characters (`=`, `+`, `-`, `@`, `\t`, `\r`) by prepending a single quote `'` or stripping the leading character.

## 7. Compare With Related Concepts

### Direct Server Upload vs. Presigned S3 Upload
- **Direct Server Upload:** The browser sends binary multipart data to the Node/Python backend. Simple to build, but saturates backend server memory, exhausts HTTP connections, and crashes under large files (>50MB). Use only for tiny profile avatars or single receipts (<5MB).
- **Presigned S3 Direct Upload:** The browser receives a signed URL and uploads binary data directly to object storage. The backend handles zero file payload bandwidth. Mandatory for bulk data ingestion, video uploads, and large enterprise datasets (>10MB).

### Synchronous In-Request Bulk API vs. Asynchronous Job-Based Ingestion
- **Synchronous Bulk API (`POST /api/v1/products/batch`):** Accepts an array of 50 to 500 JSON records in the request body and inserts them immediately within the HTTP request lifecycle. Best for real-time frontend batch saves (e.g., saving a multi-row grid edit).
- **Asynchronous Job Ingestion (`POST /initiate` + Worker Queue):** Accepts files with 10,000 to 10,000,000 rows. Returns an immediate `202 Accepted` job ID and processes in background workers. Mandatory whenever processing time exceeds 2 seconds or payload sizes exceed 10MB.

### Batch SQL Insert vs. PostgreSQL `COPY` Command
- **Batch Multi-Row Insert (`INSERT INTO ... VALUES (...) ON CONFLICT`):** Inserts 1,000 to 5,000 rows per query with full SQL validation and conflict handling (`DO UPDATE` / `DO NOTHING`). Moderate throughput (10,000–50,000 rows/sec), highly flexible for partial failures and per-row error tracking.
- **PostgreSQL `COPY FROM` / MySQL `LOAD DATA INFILE`:** High-speed binary protocol streaming data directly into the database engine. Maximum throughput (100,000+ rows/sec), but fails the entire operation if a single row has a formatting error and bypasses custom application-layer validation hooks.

### Decision Rule of Thumb
- **Payload < 5MB (10–500 rows):** Use synchronous JSON batch endpoints (`POST /api/v1/resources/batch`) with standard multi-row inserts.
- **Payload 5MB–500MB (1,000–1,000,000 rows):** Use Presigned S3 direct uploads with asynchronous BullMQ/Celery workers, streaming CSV parsers, and batch upserts.
- **Payload > 500MB (10,000,000+ rows):** Use Presigned S3 uploads paired with distributed data pipelines (AWS Glue, Apache Spark, or PostgreSQL `COPY` via staging tables).

## 8. 🧠 The Memory Hook — What Sticks

**Direct to S3, parse as a stream, batch to the DB, report in a sheet.**

Never let an API web thread touch a 500MB file payload. Hand the client a signed gate pass to object storage, let background workers sip the stream in 1,000-row chunks with constant memory, and isolate bad rows into an error CSV instead of killing the entire batch.
