# Design a File Upload Service

## 1. Understand the Problem First — Clarify Before Designing

When teams treat file uploads like standard JSON API requests, production outages follow quickly. A user attempts to upload a 2 GB 4K video or a batch of high-resolution design files over an unstable mobile connection. The API server accepts the incoming `multipart/form-data` stream, tries to buffer the file in memory or write it to a temporary local `/tmp` folder, and instantly exhausts server memory. The operating system's Out-Of-Memory (OOM) killer terminates the process, dropping hundreds of unrelated concurrent user requests with `502 Bad Gateway` errors. To make matters worse, if the upload fails at 98%, the user has to restart from byte zero.

Before drawing any boxes or picking tools on a whiteboard, clarify the exact functional and non-functional requirements with the interviewer:

- **File sizes and types:** What is the range of file sizes? Are we handling 2 MB profile photos, 50 MB PDFs, or 10 GB raw videos? (Design for files ranging from 1 KB up to 10 GB).
- **Scale and throughput:** What is the daily active volume? How many concurrent uploads at peak? (Assume 10 million uploads per day, ~2,000 concurrent uploads at peak, requiring around 500 TB of new storage per month).
- **Resumability and network reliability:** Must uploads survive dropped cellular connections without restarting from the beginning? (Yes, chunked multipart uploads with state resumption).
- **Processing pipeline:** Do files require synchronous processing before confirmation, or asynchronous workflows like virus scanning, thumbnail generation, and video transcoding? (Strictly asynchronous).
- **Read patterns and access control:** How are uploaded files accessed? Are they public assets served through a CDN or private documents requiring time-limited signed access? (Private by default, served via pre-signed download URLs or CDN edge token validation).
- **Security guarantees:** What prevents users from uploading ransomware, executable scripts disguised as images, or exploiting cross-site scripting (XSS) via SVG files? (Strict zero-trust quarantine pipeline, magic-byte inspection, and isolated storage domains).

## 2. The Core Insight — The Decision Everything Else Flows From

The central insight of a high-scale file upload service is the complete separation of the **control plane** from the **data plane**.

Never allow raw, multi-gigabyte file bytes to pass through your application API servers. Application servers exist to handle business logic, verify authentication, enforce storage quotas, and manage relational metadata. Cloud object storage systems (such as AWS S3, Google Cloud Storage, or Azure Blob Storage) are distributed, purpose-built storage engines engineered specifically to ingest, replicate, and serve massive binary streams reliably at scale.

By having the client obtain short-lived pre-signed upload URLs from your lightweight API server and then stream the binary chunks directly to object storage, you remove application memory pressure, eliminate network bandwidth bottlenecks on your gateway, and scale storage independently from compute.

## 3. High-Level Architecture — Components and Why Each Exists

To handle millions of uploads reliably, the system divides responsibilities among dedicated components:

- **Client Application (Web / Mobile):** Splits large files into deterministic chunks (e.g., 5 MB to 10 MB each), calculates client-side checksums (MD5 or SHA-256), requests upload permits, and uploads chunks concurrently with retry logic.
- **API Gateway & Metadata Service:** Authenticates the user, validates upload permissions, enforces user storage quotas, generates unique upload IDs and pre-signed S3 URLs, tracks chunk completion, and writes file metadata to the database.
- **Metadata Database (PostgreSQL):** Stores structured records including file owners, file names, MIME types, overall sizes, upload states (`INITIATED`, `UPLOADING`, `PROCESSING`, `ACTIVE`, `QUARANTINED`, `FAILED`), and chunk part manifests.
- **Session & Chunk Cache (Redis):** Tracks temporary in-flight chunk upload progress, caches active upload session states, and manages token-bucket rate limiters for upload initiations.
- **Quarantine Object Storage (S3 Quarantine Bucket):** Serves as an isolated landing zone where direct client chunk uploads land. Files here are strictly non-public and cannot be read by other users until validated.
- **Message Broker (Kafka / AWS SQS):** Ingests upload completion events and distributes processing jobs to worker pools asynchronously, insulating the upload API from heavy downstream processing tasks.
- **Asynchronous Processing Workers:** Pull jobs from the queue, inspect binary magic bytes to detect spoofed file types, run antivirus scans (ClamAV), generate thumbnails or transcoded renditions, and promote clean files to the production storage bucket.
- **Production Object Storage & CDN (CloudFront / Cloudflare):** Stores verified, safe files and caches them geographically close to end users for low-latency downloads.
- **Real-Time Notification Service (WebSockets / SSE):** Pushes asynchronous processing completion events back to the client so the UI updates without aggressive polling.

```txt
                         [Control Plane: Request Pre-signed URLs]
  Client ──────────────────────────────────────────────────────────► API Gateway / Metadata Service
    │                                                                           │
    │ (Direct Data Plane: Raw Chunk Uploads)                                    │ (Validate Quota & Issue Tokens)
    ▼                                                                           ▼
Object Storage (S3 / GCS) ◄───────────────────────────────────────────── Metadata DB & Redis
 (Quarantine Bucket)                                                           │
    │                                                                           │
    │ [Upload Completed Event]                                                  │
    ▼                                                                           ▼
Message Queue (Kafka / SQS) ──────────────────────────────────────► Async Processing Workers
                                                                                │ (Scan, Transcode, Move)
                                                                                ▼
Client ◄──────────────── Notification Service (SSE/WS) ◄──────── Clean Production S3 & CDN
```

A standard upload flows end-to-end through these steps:

1. **Upload Initiation:** The client sends file metadata (name, total size, declared MIME type, file checksum) to `POST /api/v1/uploads/initiate`. The Metadata Service checks authorization and storage quotas, initiates an S3 Multipart Upload to get an S3 `UploadId`, creates a database record with `status: INITIATED`, and returns an `upload_id` along with pre-signed S3 upload URLs for the expected chunks.
2. **Direct Chunk Ingestion:** The client uploads chunks directly to the S3 Quarantine Bucket using HTTP `PUT` requests against the pre-signed URLs. Each chunk includes its `Content-MD5` header. S3 validates data integrity on arrival and returns an `ETag` (hash) for each chunk.
3. **Completion Assembly:** When all chunks finish, the client calls `POST /api/v1/uploads/{id}/complete`, passing the list of part numbers and corresponding `ETag` values. The Metadata Service calls S3's `CompleteMultipartUpload` API to assemble the chunks into a single object inside the quarantine bucket and updates the database status to `PROCESSING`.
4. **Asynchronous Security & Processing:** The Metadata Service publishes a message to SQS/Kafka. Background workers consume the message, verify magic bytes against declared headers, stream the file through ClamAV, generate image thumbnails or video manifests, and copy the clean file to the production bucket.
5. **Client Notification:** The worker updates the database status to `ACTIVE` and triggers the Notification Service, which sends an event over WebSocket or Server-Sent Events to inform the frontend that the asset is ready.

## 4. Key Technical Decisions — With Real Tradeoffs

**Decision 1: Direct-to-S3 Pre-signed URLs vs. Streaming Through an API Gateway**
- **Choice:** Direct-to-S3 uploads using time-limited pre-signed URLs.
- **Rejected:** Streaming the file body through an Nginx proxy and Node.js/Go API gateway servers.
- **Rationale:** Proxying gigabytes of file data consumes TCP connection slots, saturates network interfaces, and increases server memory footprints. Direct uploads leverage AWS/GCP's hyper-scaled edge infrastructure, keeping your API tier stateless, lightweight, and low-cost.
- **Tradeoff Accepted:** The backend cannot synchronously inspect or reject malicious bytes while they are being transmitted. You must adopt an asynchronous quarantine-and-scan model.

**Decision 2: Chunked Multipart Uploads vs. Single Monolithic Upload**
- **Choice:** S3 Multipart Uploads with 5 MB to 10 MB chunks and client-side retry logic.
- **Rejected:** Single HTTP `POST`/`PUT` requests for entire files.
- **Rationale:** On cellular or unstable home connections, a 1% packet loss rate makes uploading a 1 GB file in a single connection nearly impossible. Slicing files into 5–10 MB chunks ensures that a dropped connection only requires re-transmitting the single failed 10 MB chunk, saving up to 99% of bandwidth on retries and allowing parallel chunk uploads.
- **Tradeoff Accepted:** Increased architectural complexity on both client and server (managing part numbers, tracking ETags, handling timeouts, and cleaning up incomplete parts).

**Decision 3: PostgreSQL for Metadata vs. Pure NoSQL Document Store**
- **Choice:** PostgreSQL with JSONB columns for media metadata.
- **Rejected:** Pure NoSQL document database like MongoDB.
- **Rationale:** File uploads require strict ACID transactional integrity when checking and updating user storage quotas, verifying file ownership, and transitioning lifecycle states (`INITIATED` -> `PROCESSING` -> `ACTIVE`). PostgreSQL handles these atomic updates cleanly with row-level locks, while `JSONB` fields store dynamic media metadata (EXIF tags, dimensions, codecs) without migration overhead.
- **Tradeoff Accepted:** Requires connection pool management (e.g., PgBouncer) and vertical scaling or read replicas under heavy read traffic compared to distributed key-value stores.

**Decision 4: Asynchronous Processing via Message Queues vs. Synchronous Worker Execution**
- **Choice:** Event-driven worker pool powered by Kafka or SQS with Dead Letter Queues (DLQs).
- **Rejected:** Executing virus scanning, thumbnail extraction, and transcoding inside the HTTP completion handler.
- **Rationale:** Antivirus scanning and video transcoding take anywhere from 3 seconds to several minutes depending on file size. Running these synchronously blocks HTTP threads, leads to gateway timeout errors (HTTP 504), and makes the API vulnerable to resource exhaustion.
- **Tradeoff Accepted:** The user experience is eventually consistent. The frontend must display a "Processing..." state and rely on WebSocket events or polling until the asset becomes active.

## 5. Deep Dives — The Parts That Actually Matter

**Algorithmic Chunk Management and Resumability Protocol**

Designing a robust resumable upload protocol requires tight bounds on chunk sizing and state coordination.

S3 enforces strict multipart upload rules: maximum 10,000 parts per file, minimum part size of 5 MB (except the final part), and maximum object size of 5 TB. If you pick a fixed 5 MB chunk size for a 100 GB file, you would need 20,000 parts, violating S3's 10,000-part limit.

To prevent this, the client and server calculate dynamic chunk sizes:
`chunkSize = Math.max(10 * 1024 * 1024, Math.ceil(fileSize / 10000))`

For a 1 GB file, this yields 10 MB chunks (100 total chunks). The client reads the file using the browser `File.slice()` API, uploads 3 to 5 chunks in parallel over HTTP/2, and computes an MD5 checksum for each chunk to send in the `Content-MD5` header.

If the network disconnects at chunk 64:
1. The client catches the network failure, pauses, and initiates exponential backoff with jitter.
2. Upon reconnecting, the client calls `GET /api/v1/uploads/{id}/progress`.
3. The server queries S3's `ListParts` API or checks Redis to retrieve the list of already completed part numbers and their verified ETags.
4. The server returns the list of completed parts. The client compares this list with its local manifest and immediately resumes uploading starting from chunk 65, without re-transmitting chunks 1 through 64.

**The Zero-Trust Security and Malware Pipeline**

Accepting user-supplied files is one of the highest-risk operations in backend engineering. Attackers exploit file upload endpoints using file extension spoofing (renaming `malware.exe` to `invoice.pdf`), polyglot files (valid JPEG headers combined with executable PHP payloads), and cross-site scripting (XSS) embedded within SVG XML tags.

A production-grade pipeline defends against these vectors through multiple layers:

1. **Quarantine Storage Isolation:** Raw client uploads land in a strictly private `quarantine-bucket`. IAM policies deny public read access and cross-service access to this bucket.
2. **Magic Byte Verification:** The declared `Content-Type` header and file extension from the browser are treated as untrusted user input. Background workers read the initial 512 bytes of the raw file stream to inspect magic numbers (e.g., `%PDF-` for PDFs, `\xFF\xD8\xFF` for JPEGs, `\x89PNG\r\n\x1a\n` for PNGs, `PK\x03\x04` for ZIP/DOCX). If the magic bytes mismatch the declared type, the file is rejected immediately.
3. **Asynchronous Virus & Malware Scanning:** Workers run ClamAV or cloud-native scanning daemons (e.g., AWS Object Lambda scanner) against the quarantine object. If a virus signature is detected, the worker deletes the object, records the incident, alerts the security team, and marks the database record as `QUARANTINED`.
4. **Sanitization and Image Re-encoding:** For images, workers re-encode the bitmap using libraries like `Sharp` or `ImageMagick`. Re-encoding strips malicious EXIF metadata, neutralizes embedded polyglot scripts, and normalizes color profiles.
5. **Domain Separation and Safe Serving Headers:** Clean files are copied to the `production-bucket` and served from a dedicated domain (e.g., `user-content-app.com` instead of `app.com`). This ensures that even if an attacker uploads a malicious HTML/SVG file, the browser executes it in an isolated sandbox with zero access to session cookies, JWTs, or local storage of the primary application. When serving non-image files, the response must include `Content-Disposition: attachment; filename="safe.pdf"` and `X-Content-Type-Options: nosniff`.

**Managing Incomplete Uploads and Preventing Storage Cost Bleed**

In production, between 5% and 15% of initiated uploads are abandoned by users closing browser tabs, experiencing dead batteries, or canceling uploads midway. In S3, uploaded multipart parts are retained and billed at standard storage rates until the upload is explicitly completed or aborted. Without automated cleanup, gigabytes of orphaned parts accumulate daily, quietly ballooning storage bills.

To prevent this:
- Configure an S3 Bucket Lifecycle Rule with `AbortIncompleteMultipartUpload` set to 1 or 2 days. S3 will automatically purge abandoned parts without requiring manual deletion calls.
- Run a daily background reconciliation cron that queries the metadata database for upload records stuck in `INITIATED` or `UPLOADING` status past their expiration TTL (e.g., 24 hours) and marks them `EXPIRED`.

## 6. Failure Modes and Resilience

**Failure 1: Network Drops During In-Flight Chunk Uploads**
- **Impact:** Active TCP connections break; individual chunk uploads fail.
- **Detection & Recovery:** The client library detects HTTP connection errors or timeout responses. It uses exponential backoff with randomized jitter before retrying that specific chunk up to 5 times. If retries fail completely, it retains the upload session ID in local storage and prompts the user to resume when connectivity returns.

**Failure 2: Worker Process Crashes Mid-Processing**
- **Impact:** A worker running an intensive FFmpeg transcode or ClamAV scan crashes due to an unhandled exception or OOM event, leaving the file stuck in `PROCESSING` status forever.
- **Detection & Recovery:** The message broker (SQS/Kafka) utilizes message visibility timeouts. If a worker crashes without explicitly acknowledging (ACKing) the message, the broker makes the message visible again after the visibility timeout (e.g., 5 minutes). A healthy worker picks up the job. If the job fails 3 consecutive times, it is routed to a Dead Letter Queue (DLQ), triggering an alert, and the database status updates to `FAILED`.

**Failure 3: S3 Regional Degradation or Rate Limiting (HTTP 503 Slow Down)**
- **Impact:** High burst traffic causes S3 partition throttling or regional latency spikes.
- **Detection & Recovery:** S3 partitions prefixes automatically based on request volume. The metadata service distributes objects across partitioned S3 keys by prefixing the storage path with a hash (e.g., `/quarantine/{hash_prefix}/{upload_id}/part_1`). For cross-region resilience, the metadata service can fail over to a pre-configured secondary bucket in a different cloud region.

**Failure 4: Storage Quota and Resource Exhaustion Abuse (DDoS)**
- **Impact:** Malicious actors script millions of `initiate` requests to flood the database and exhaust storage limits.
- **Detection & Recovery:** Apply Redis-backed sliding-window rate limiters at the API Gateway (e.g., max 20 initiate requests per user per minute). Before generating pre-signed URLs, perform an atomic check against the user's total consumed storage quota in PostgreSQL. If the requested file size pushes the user over their plan limit, reject the initiation immediately with `403 Forbidden (Quota Exceeded)`.

## 7. What Makes a Great Answer vs an Average One

**An average answer sounds like this:**
"I will build an Express server with Multer. When the user sends the file, the server receives the `multipart/form-data`, saves it to `/tmp`, uses the AWS SDK to upload it to S3, and saves the S3 URL in MongoDB. Then I'll return a 200 OK."

*Why it fails:* This approach falls apart in production. It buffers multi-gigabyte files on the API server, creating massive memory leaks and OOM crashes. It lacks chunking, meaning any connection drop restarts the entire upload. It has no virus quarantine, no magic-byte validation, no protection against storage cost bleed from failed uploads, and forces synchronous processing.

**A great answer sounds like this:**
"I decouple the control plane from the data plane. The API server authenticates the request, verifies user storage quotas, and generates pre-signed multipart S3 URLs. The client slices the file into 10 MB chunks and streams them directly to an isolated S3 quarantine bucket in parallel with MD5 integrity verification, completely bypassing API server memory. Once parts land, the server calls S3's `CompleteMultipartUpload` and emits an event to SQS. Asynchronous workers inspect magic bytes, scan for malware with ClamAV, and transcode media before promoting clean files to the production bucket served via CDN. Orphaned parts are automatically purged using S3 lifecycle rules to prevent storage cost bleed."

*Key signals the interviewer listens for:*
- Clear separation of control plane (metadata/auth) from data plane (binary transfer).
- Pre-signed direct S3 upload URLs to eliminate server memory and bandwidth bottlenecks.
- Resumable multipart upload mathematics (dynamic chunk sizing respecting S3 part limits).
- Zero-trust security: quarantine buckets, magic byte validation, antivirus pipelines, and isolated media domains.
- Operational cost hygiene: S3 lifecycle rules to purge abandoned incomplete multipart uploads.

## 8. 🧠 The Memory Hook

**Keep the bytes off the backend.**

Treat your API server like an airline check-in counter: it issues the boarding pass and verifies identification (pre-signed URLs and metadata), but object storage handles the luggage directly. Once luggage lands, background security officers inspect the bags in quarantine before releasing them to the terminal.
