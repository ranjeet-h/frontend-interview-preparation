# Design an Asynchronous Report Generation System

## 1. Understand the Problem First — Clarify Before Designing

Imagine a finance manager clicks **"Export All Transactions (2020–2025) to CSV"** on an analytics dashboard.

In a naive synchronous architecture, the browser sends a `GET /api/reports/export` request. The API server executes a `SELECT *` query across 15 million rows against the primary transactional database, fetches every row into server memory, transforms the records into a massive CSV string, and tries to stream it back in the HTTP response body.

Here is what happens in production:
1. **API Gateway & Load Balancer Timeouts:** After 30 seconds, the load balancer cuts the connection with a `504 Gateway Timeout`.
2. **Server Out-Of-Memory (OOM) Crash:** Buffering 15 million JSON records in Node.js or Python memory balloons memory consumption past 2 GB, triggering an immediate OS `OOMKill` or V8 heap crash.
3. **Database Starvation:** The unindexed table scan locks rows, pins CPU at 100%, exhausts connection pools, and blocks active customer checkouts on the primary OLTP database.
4. **User Frustration Loop:** Seeing the 504 error, the user frantically clicks "Export" 10 more times, launching 10 parallel catastrophic table scans.

To design a resilient system, clarify the core operational parameters before sketching architecture:

- **Volume and File Formats:** Are we generating lightweight tabular streams (CSV, TSV), binary spreadsheets (XLSX), or complex rendered documents (PDFs with charts and custom pagination)? Exporting 500,000 rows to CSV requires simple text serialization; generating a 200-page formatted PDF requires CPU-heavy headless browser rendering (Puppeteer/Chromium).
- **Scale and Concurrency:** How many reports are requested daily? What is peak concurrency (e.g., end-of-month financial closing where 5,000 corporate clients trigger large exports simultaneously)?
- **Latency and SLA:** Is the user waiting actively in the UI (expected delivery < 15 seconds) or is this an asynchronous batch export (acceptable delivery within 2–10 minutes)?
- **Data Freshness and Source:** Must the report reflect real-time uncommitted transactions, or can we query an analytics read replica or data warehouse (ClickHouse, Snowflake, BigQuery) synced with a 1-minute lag?
- **Delivery and Security:** How should the user receive the file? In-browser direct download, email notification, or webhook? How long should generated files persist, and what access controls govern the download links?

## 2. The Core Insight — The Decision Everything Else Flows From

The central insight of report generation is that **report generation is an asynchronous batch data pipeline, never an HTTP request-response cycle.**

Every architectural decision flows from three non-negotiable principles:

1. **Decouple Request from Execution:** The web tier must never generate reports. The API immediately validates the request, records a pending job metadata record, pushes a message to a background queue, and returns an HTTP `202 Accepted` with a tracking `jobId`.
2. **Zero-Memory Streaming Pipeline ($O(1)$ RAM):** The background worker must never buffer the entire dataset in memory or write massive temporary files to local disk. Data must flow as a continuous backpressured stream: `Database Cursor Stream -> Format Transformation Stream -> S3 Multipart Upload Stream`. Memory usage stays constant at roughly 30 MB whether exporting 1,000 rows or 50,000,000 rows.
3. **Strict Query Isolation:** Analytical queries must never touch the primary OLTP database. Heavy reads run against dedicated read replicas or columnar OLAP stores to guarantee zero performance impact on live customer writes.

## 3. High-Level Architecture — Components and Why Each Exists

```txt
┌────────┐        1. POST /reports         ┌──────────────┐    2. Acquire Dedup Lock     ┌─────────────┐
│ Client │ ──────────────────────────────> │ Report API   │ ───────────────────────────> │ Redis       │
│ (Web)  │ <────────────────────────────── │ Gateway      │ <─────────────────────────── │ (Lock/State)│
└────────┘       202 Accepted {jobId}      └──────┬───────┘                              └─────────────┘
    │                                             │
    │ 8. Real-time Status / Event                 │ 3. Enqueue Job
    │    (WebSocket / SSE / Polling)              ▼
    │                                      ┌──────────────┐
    │                                      │ Job Queue    │ (SQS / RabbitMQ)
    │                                      │ (Priority)   │
    │                                      └──────┬───────┘
    │                                             │ 4. Pull Job
    │                                             ▼
    │                                      ┌──────────────┐
    │                                      │ Report       │
    │                                      │ Worker Fleet │
    │                                      └──────┬───────┘
    │                                             │
    │                   ┌─────────────────────────┴─────────────────────────┐
    │                   │ 5. Stream Cursor Query                            │ 6. Streaming Multipart Upload
    │                   ▼                                                   ▼
    │          ┌───────────────────┐                               ┌───────────────────┐
    │          │ Read Replica /    │                               │ Object Storage    │
    │          │ Data Warehouse    │                               │ (AWS S3)          │
    │          │ (PostgreSQL/OLAP) │                               └─────────┬─────────┘
    │          └───────────────────┘                                         │
    │                                                                        │ 7. Pre-Signed URL
    │                                                                        ▼
    │                                                              ┌───────────────────┐
    └─────────────────────── 9. Direct Download ──────────────────>│ CDN / S3 Edge     │
                             (Bypasses API Servers)                └───────────────────┘
```

**Components and their responsibilities:**

- **Report API Service:** Validates input parameters (date ranges, filters, column permissions), verifies user authorization, checks Redis for duplicate running requests, inserts a job record into PostgreSQL with status `PENDING`, pushes the task to the message broker, and returns HTTP `202 Accepted`.
- **Redis (Deduplication Lock & Job Cache):** Enforces distributed locks to prevent duplicate submissions when users spam the export button. Caches report status and short-lived query metadata.
- **Message Broker (RabbitMQ / AWS SQS):** Decouples API servers from workers. Organizes jobs into priority queues (e.g., `reports.high` for small on-demand files, `reports.low` for massive multi-million row exports).
- **Report Worker Fleet:** Stateless auto-scaling workers that consume queue messages, establish streaming cursors to read replicas, pipe data through format serializers, upload parts to S3, and emit progress heartbeats.
- **Data Source (Read Replica / OLAP Store):** An isolated database instance (PostgreSQL Read Replica or ClickHouse/Snowflake) configured with streaming cursor support (`FETCH FORWARD` / server-side cursor) to eliminate lock contention on OLTP writes.
- **Object Storage (AWS S3 / Google Cloud Storage):** Stores the finished report artifacts with bucket lifecycle policies (e.g., auto-delete after 7 days).
- **Notification & Event Service:** Publishes progress updates (25%, 50%, 100%) and completion events via WebSockets, Server-Sent Events (SSE), or transactional email (SendGrid/SES) with secure download links.

**End-to-End Execution Walkthrough:**

1. **Submission:** User submits an export request with custom filters.
2. **Deduplication Check:** API computes a SHA-256 hash of `tenantId + userId + filters + format`. It attempts a Redis `SET lock:report:<hash> <timestamp> NX EX 300`. If the key exists, it returns the existing `jobId` instead of creating duplicate workload.
3. **Enqueuing:** API writes a row to `reports` table (`status = 'PENDING'`) and sends the payload to SQS. API immediately returns `202 Accepted` with `{ jobId: "rep_8f93a", status: "PENDING", pollUrl: "/api/reports/rep_8f93a" }`.
4. **Worker Pickup:** An available worker pulls the message, changes status to `PROCESSING`, and sets visibility heartbeat timers.
5. **Streaming Execution:** Worker initiates a streaming query to the Read Replica. As rows arrive in 1000-row chunks, the worker transforms them to the requested format (CSV/Excel) and streams the chunks directly into an S3 Multipart Upload pipeline.
6. **Finalization:** S3 confirms upload completion. Worker generates a time-limited Pre-Signed S3 Download URL (valid for 24 hours), updates the database record to `COMPLETED`, records the file size and S3 key, and releases the Redis lock.
7. **Client Notification & Download:** The system pushes a `REPORT_COMPLETED` event over WebSocket/SSE (or sends an email if the user disconnected). The client downloads the file directly from S3/CloudFront CDN via the pre-signed URL, keeping all heavy download traffic off the application servers.

## 4. Key Technical Decisions — With Real Tradeoffs

**1. Delivery Notification: Polling vs. WebSockets/SSE vs. Email**
- *Option A: Short / Long Polling.* Client polls `GET /api/reports/:id` every 3–5 seconds. Simple and stateless, works behind all firewalls, but creates empty HTTP traffic when millions of clients poll simultaneously.
- *Option B: WebSockets / Server-Sent Events (SSE).* Real-time, instant UI progress bar updates. Ideal for interactive dashboard sessions, but requires persistent socket connection management.
- *Option C: Email Notification with Pre-signed Link.* Worker sends an email with a download link once complete. Best for long-running reports (taking > 1 minute) or offline users.
- *Decision:* **Hybrid Model.** The API provides an SSE/WebSocket channel for instant dashboard feedback, falls back to lightweight polling if the connection drops, and automatically dispatches an email if the job duration exceeds 30 seconds or the user navigates away.

**2. Memory Architecture: In-Memory Buffering vs. Temp Disk Files vs. Pure Streaming**
- *Option A: In-Memory Buffering.* Load all rows into an array, serialize, upload. Rejected: $O(N)$ memory complexity leads to fatal server OOM crashes.
- *Option B: Temp File on Local Disk.* Stream database rows to `/tmp/report-123.csv`, then upload the finished file to S3. Solves RAM limits, but introduces disk I/O bottlenecks and risks filling worker container ephemeral storage in Kubernetes.
- *Option C: Pure Streaming Pipeline (Cursor -> Serializer -> S3 Multipart Upload).* Uses Node.js/Go/Python backpressured streams with a fixed buffer window.
- *Decision:* **Pure Streaming Pipeline.** Keeps worker memory usage constant ($O(1) \approx 30\text{ MB}$) regardless of dataset size, avoids local disk limits, and begins uploading parts to S3 while downstream database rows are still being evaluated.

**3. Query Routing: OLTP Primary vs. PostgreSQL Read Replica vs. Columnar OLAP**
- *Option A: Primary OLTP DB.* Rejected: Heavy table scans cause lock escalation, connection pool exhaustion, and degradation of user-facing write transactions.
- *Option B: Dedicated Read Replica.* Acceptable for small-to-medium relational queries with indexed date ranges. Read-only, isolated from write operations.
- *Option C: Columnar Data Warehouse (ClickHouse / Snowflake).*
- *Decision:* **Read Replica for operational/transactional exports; Columnar OLAP for aggregated analytical reports.** Analytical exports run against ClickHouse/Snowflake where vectorized column scans process 100M rows in seconds with high compression ratios.

**4. File Serving: App Server Proxy vs. S3 Pre-Signed URLs**
- *Option A: App Server Proxy.* Client downloads via `GET /api/reports/:id/download`; API streams file from S3 through server to client. Rejected: Wastes API server bandwidth, holds open web connections, and degrades API throughput.
- *Option B: S3 Pre-Signed URLs.* API returns a cryptographically signed S3 URL with a 24-hour expiration (`https://bucket.s3.amazonaws.com/reports/xyz.csv?AWSAccessKeyId=...&Signature=...`).
- *Decision:* **S3 Pre-Signed URLs with CloudFront CDN.** Offloads 100% of network egress and bandwidth costs to cloud object storage infrastructure.

## 5. Deep Dives — The Parts That Actually Matter

### Deep Dive 1: The Zero-Memory Streaming Pipeline

The core engineering challenge is maintaining continuous backpressure between the database, the transformation engine, and the object store. If the database streams rows faster than S3 can receive chunks, memory must not grow uncontrollably.

In Node.js or Go, this is achieved using a piped stream architecture:

```javascript
// Worker execution: Streaming DB cursor directly to S3 multipart upload
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import QueryStream from "pg-query-stream";
import { Transform, PassThrough } from "stream";
import { stringify } from "csv-stringify";

async function generateCsvReportStream(job, dbPool, s3Client) {
  const client = await dbPool.connect();

  try {
    // 1. Open server-side streaming cursor (batch size: 1000 rows)
    const sql = "SELECT id, user_id, amount, status, created_at FROM transactions WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3";
    const queryStream = new QueryStream(sql, [job.tenantId, job.startDate, job.endDate], { batchSize: 1000 });
    const cursor = client.query(queryStream);

    // 2. Transform Stream: Row objects to formatted CSV text
    const csvSerializer = stringify({
      header: true,
      columns: ["id", "user_id", "amount", "status", "created_at"]
    });

    // 3. Pipe to a PassThrough stream that feeds the S3 upload manager
    const passThroughStream = new PassThrough();

    // 4. Managed S3 Multipart Upload (handles 5MB part splitting automatically)
    const parallelUpload = new Upload({
      client: s3Client,
      params: {
        Bucket: "company-report-storage",
        Key: `tenants/${job.tenantId}/reports/${job.id}.csv`,
        Body: passThroughStream,
        ContentType: "text/csv"
      },
      queueSize: 4, // Max concurrent upload parts
      partSize: 1024 * 1024 * 5 // 5 MB minimum part size for S3
    });

    // Connect pipeline with automated backpressure handling
    cursor.pipe(csvSerializer).pipe(passThroughStream);

    // Await upload completion
    const uploadResult = await parallelUpload.done();
    return uploadResult.Location;
  } finally {
    client.release();
  }
}
```

How this prevents memory blowups:
- `QueryStream` uses PostgreSQL server-side cursors (`FETCH FORWARD 1000`). It pulls only 1,000 records from the network buffer at a time.
- `csv-stringify` serializes records into text chunks and pushes them downstream.
- If S3 network bandwidth drops, `PassThrough` fills its internal buffer (`highWaterMark`), pauses the CSV serializer, which pauses the PostgreSQL cursor. Backpressure naturally propagates upstream to the database.

### Deep Dive 2: Report Deduplication & Distributed In-Flight Locking

When a user clicks "Export" multiple times, or multiple dashboard viewers request the same monthly report simultaneously, the system must not execute duplicate compute-heavy pipelines.

```txt
Incoming Request: Tenant: 42, Range: 2025-01-01 -> 2025-01-31, Format: CSV
                                  │
                                  ▼
      Generate Deterministic Hash: SHA256(tenantId + reportType + sortedFilters)
                                  │
               ┌──────────────────┴──────────────────┐
               ▼                                     ▼
     Key EXISTS in Redis?                  Key NOT in Redis
               │                                     │
     ┌─────────┴─────────┐                           ▼
     │                   │                SET lock:rep:<hash> <jobId> NX EX 600
Status: PROCESSING   Status: COMPLETED               │
     │                   │                Insert DB Record (status='PENDING')
     ▼                   ▼                           │
Return Existing     Return Cached S3      Enqueue to SQS Priority Queue
jobId (Attach UI)   Pre-Signed URL                   │
                                          Return 202 Accepted {jobId}
```

- **Deterministic Hash Generation:** The API normalizes all filter parameters into a sorted JSON string and hashes it:
  $$\text{ReportKey} = \text{SHA256}(\text{tenantId} + \text{reportType} + \text{sorted(filters)} + \text{format})$$
- **In-Flight Lock:** The API runs `SET lock:report:<ReportKey> <jobId> NX EX 600`.
  - If the lock fails (key exists), look up the existing `jobId`. If status is `PROCESSING`, return the existing `jobId` so the client listens to the already-running job.
  - If status is `COMPLETED` and the data is within an acceptable cache window (e.g., historical closed month), return the existing pre-signed URL immediately with zero database load.

### Deep Dive 3: Multi-Tenant Fair Sharing and Priority Queuing

In a multi-tenant B2B SaaS platform, a single enterprise tenant exporting 50 million records must not starve small tenants exporting 500-row receipts.

```txt
┌─────────────────────────────────────────────────────────────┐
│                       Queue Topologies                      │
├───────────────────────────────┬─────────────────────────────┤
│ Queue: reports.quick          │ Queue: reports.heavy        │
│ (Estimated rows < 50,000)     │ (Estimated rows >= 50,000)  │
│ SLA: Processed in < 10 sec    │ SLA: Processed in < 5 min   │
├───────────────────────────────┼─────────────────────────────┤
│ Dedicated Worker Pool A       │ Dedicated Worker Pool B     │
│ (Fast turn-around)            │ (Long-running stream nodes) │
└───────────────────────────────┴─────────────────────────────┘
```

1. **Query Cost Estimation:** Before enqueuing, the API uses metadata or a quick `EXPLAIN` query estimate to classify the job as `quick` or `heavy`.
2. **Dedicated Worker Pools:** `reports.quick` workers never pull from `reports.heavy`. Quick exports always have available compute slots.
3. **Per-Tenant Leaky Bucket:** Each tenant is allocated a maximum number of concurrent active jobs (e.g., maximum 3 active concurrent exports per tenant). Additional export requests remain in a `QUEUED` state until their running jobs complete.

### Deep Dive 4: PDF vs. Tabular Streaming Constraints

While CSV, TSV, and JSON formats support infinite linear streaming, PDFs and styled Excel files present architectural constraints:

- **The PDF Challenge:** PDFs cannot be easily streamed byte-by-byte because standard PDF document structures require cross-reference tables (`xref`) and catalog dictionaries written at the end of the file, alongside calculating global page counts ("Page X of Y").
- **Headless Browser Rendering:** High-fidelity PDF generation commonly uses headless Chromium (Puppeteer / Playwright) to convert HTML/CSS templates to PDF. Headless Chromium consumes massive RAM (150–400 MB per page instance) and high CPU.
- **Worker Isolation for PDF:** PDF rendering workers must run in dedicated, isolated container pools with strict concurrency limits (e.g., 2 Chromium instances per 2-core worker) and automated browser process recycling after every 50 jobs to prevent Chromium memory leaks from degrading worker nodes.

## 6. Failure Modes and Resilience

| Failure Scenario | Immediate System Impact | Detection & Mitigation Strategy |
| :--- | :--- | :--- |
| **Worker OOM / Hard Crash Mid-Stream** | Queue message remains unacknowledged; job sits in `PROCESSING` forever; S3 holds partial orphaned multipart parts. | **Heartbeat & Reaper:** Worker updates `last_heartbeat` in Redis every 10s. A reaper cron checks for jobs with expired heartbeats (> 45s), marks them `RETRYING`, and resubmits to queue.<br>**S3 Lifecycle Rule:** Set `AbortIncompleteMultipartUpload` rule (7 days) on the S3 bucket to clean up abandoned parts. |
| **Read Replica Query Timeout** | Database aborts query due to resource exhaustion or long lock contention. | **Statement Timeouts:** Set strict `statement_timeout = 10min` on replica connections. Fail gracefully with an explicit error code (`ERR_QUERY_TIMEOUT`), update status to `FAILED`, and advise the user to narrow their date filter. |
| **Poison Pill Query / Corrupt Data** | Worker crashes on a specific malformed record repeatedly every time it processes the queue message. | **Dead Letter Queue (DLQ):** Configure queue max receive count (`maxReceiveCount = 3`). If a job fails 3 times, route to DLQ, set job status to `FAILED`, log the stack trace with correlation ID, and alert on-call engineering. |
| **S3 Network Outage / Upload Failure** | Network drops mid-way through uploading Part 42 of a 100-part stream. | **Automatic Part Retries:** AWS SDK `Upload` utility automatically retries individual failed multipart chunk uploads with exponential backoff before failing the overall stream pipeline. |
| **Thundering Herd on Download Link** | 10,000 corporate employees attempt to download a company-wide annual report simultaneously. | **Edge Caching via CDN:** Point the pre-signed URL to Amazon CloudFront or Cloudflare CDN sitting in front of S3, caching the file at the edge for repeated requests. |

## 7. What Makes a Great Answer vs an Average One

**An Average Answer:**
- Treats report generation as a basic CRUD endpoint with a background thread.
- Describes loading all records into an array: `"I will fetch the data from MySQL, convert it to CSV with a library, save it to disk, and email it."`
- Does not consider database lock contention on production OLTP tables.
- Ignores worker memory limits ($O(N)$ RAM usage).
- Suggests polling the database directly without caching, deduplication, or concurrency limits.

**A Great Answer:**
- **Identifies the streaming imperative immediately:** Explains how memory must remain $O(1)$ constant by chaining server-side cursors to format transformers and S3 multipart upload streams.
- **Isolates database workloads:** Explicitly routes heavy reporting queries away from the primary OLTP database to Read Replicas or columnar OLAP stores (ClickHouse/Snowflake).
- **Addresses abuse and idempotency:** Implements deterministic SHA-256 request hashing with Redis distributed locks to eliminate duplicate jobs from impatient users.
- **Architects for multi-tenant fairness:** Separates priority queues (`quick` vs `heavy`) and enforces per-tenant concurrency limits so large enterprise jobs cannot starve small users.
- **Understands file format differences:** Distinguishes between streamable tabular formats (CSV) and resource-heavy non-streamable documents (PDF via headless Chromium).
- **Offloads network egress:** Uses S3 Pre-Signed URLs and CDN edge caching to ensure application servers never handle heavy file download bandwidth.

## 8. 🧠 The Memory Hook

> **"Stream, Don't Buffer; Replica, Don't Lock; S3, Don't Serve."**
>
> A report system is a **pipe, not a bucket**. Stream from a database read replica through an $O(1)$ memory transform into S3 multipart storage, notify the user asynchronously, and let S3 serve the download bytes.
