# Design a file upload service

## Detailed explanation

Design a file upload service is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Design data flow, APIs, storage, scaling, failure handling, and observability together.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Clarify requirements and scale.
- Define APIs and data model.
- Choose storage, cache, queues, and workers.
- Plan consistency, failure handling, and security.
- Add observability and rollout strategy.

## 4. Visual / analogy

```txt
Clients -> API -> services -> database/cache/queue -> observability
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply backend system design rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, design a file upload service affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle large file uploads without running out of memory?
- **The Engine Mechanism (Why it behaves this way):** Large files should never be loaded entirely into server memory. Instead, use streaming uploads: the server receives the request body as a stream and pipes it directly to object storage (S3, GCS) or disk. For multipart uploads, the client splits the file into chunks (5-100MB each), uploads each chunk independently, and the server assembles them. Pre-signed URLs allow the client to upload directly to S3, bypassing your application server entirely and eliminating memory concerns.
- **The Unforgettable Mental Model:** The **Bucket Brigade**. Instead of one person carrying the entire bucket of water (loading file into memory), people form a line and pass buckets hand-to-hand (streaming). Each person only holds water for a moment, so no one gets overwhelmed.
- **The Trap:** Reading the entire file into memory with `req.body` or `file.buffer` before processing. A 2GB file will crash your server. Always use streams or pre-signed URLs for files larger than a few megabytes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For large files, I'd use streaming uploads where the request body is piped directly to object storage without buffering in memory. For files over 100MB, I'd implement multipart uploads — the client splits the file into chunks, uploads each independently, and the server assembles them. The best approach for scale is pre-signed URLs: the server generates a temporary S3 upload URL, the client uploads directly to S3, and then notifies the server via webhook. This completely removes the file from our application server's memory path."

#### How do you implement resumable uploads?
- **The Engine Mechanism (Why it behaves this way):** Resumable uploads track which chunks have been successfully received. The client sends a unique upload ID with each chunk. The server stores chunk metadata (upload_id, chunk_number, size, etag) in a database or Redis. When a upload is interrupted, the client queries the server for received chunks and resumes from the last successful chunk. S3's multipart upload API natively supports this — each part has an ETag, and the CompleteMultipartUpload call assembles all parts. The Tus protocol is an open standard that formalizes this with HEAD requests to check upload progress.
- **The Unforgettable Mental Model:** The **Bookmark in a Novel**. If you stop reading at page 200, you don't start over — you open to page 200 and continue. The bookmark (chunk metadata) remembers exactly where you left off.
- **The Trap:** Not handling partial chunk corruption. If a chunk is partially uploaded (network drops mid-chunk), the server might record it as complete but the data is corrupt. Always verify chunk integrity with checksums (MD5/SHA256) before marking a chunk as received.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd implement resumable uploads using S3's multipart upload API. Each file gets a unique upload ID. The client splits the file into 10MB chunks and uploads each with a part number. The server tracks received parts in Redis. If the upload fails, the client sends a HEAD request to check which parts were received, then resumes from the last successful part. I'd also implement the Tus protocol for a standardized approach, which handles chunk verification with checksums and provides a clean API for upload resumption."

#### How do you secure file uploads against malicious files?
- **The Engine Mechanism (Why it behaves this way):** Security involves multiple layers: (1) File type validation — check MIME type from Content-Type header AND file magic bytes (first few bytes of the file), not just the extension; (2) File size limits — reject files exceeding a configured maximum; (3) Virus scanning — integrate ClamAV or a cloud scanning service (S3 Object Lambda, Google Cloud DLP) to scan files before they're served; (4) Content-Disposition headers — serve files with Content-Disposition: attachment to prevent browser execution; (5) Separate storage domains — store user uploads on a different domain than your app to prevent XSS via SVG/HTML files; (6) Image reprocessing — for images, re-encode them to strip embedded metadata and malicious payloads.
- **The Unforgettable Mental Model:** The **Airport Security Checkpoint**. Files go through multiple checkpoints: ID check (MIME type validation), weight limit (size check), X-ray scan (virus scanning), and if it's suspicious, it gets opened manually (image reprocessing). Even after passing, it's escorted to a separate terminal (separate domain) so it can't cause trouble in the main building.
- **The Trap:** Only checking file extensions. An attacker can rename malware.exe to malware.jpg and bypass extension-based validation. Always validate magic bytes and use content-type detection from the actual file content.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd implement defense in depth. First, validate file type using magic bytes, not just extensions or Content-Type headers which are easily spoofed. Enforce strict size limits. For virus scanning, I'd use ClamAV or a cloud scanning service in an async pipeline — files go to a quarantine bucket first, get scanned, and only move to the public bucket if clean. I'd serve all user uploads from a separate domain with Content-Disposition: attachment headers to prevent XSS. For images specifically, I'd re-encode them to strip any embedded malicious payloads in metadata."

#### How do you design the API for file uploads?
- **The Engine Mechanism (Why it behaves this way):** The API has several endpoints: POST /uploads/initiate returns an upload ID and pre-signed URL(s); PUT /uploads/{id}/chunks accepts chunk uploads; POST /uploads/{id}/complete finalizes the upload and triggers processing; GET /uploads/{id}/status returns upload progress; DELETE /uploads/{id} cancels an upload. The initiate endpoint validates file metadata (size, type), generates the upload ID, and creates pre-signed URLs. The complete endpoint verifies all chunks arrived, assembles the file, and triggers async processing (virus scan, thumbnail generation, metadata extraction).
- **The Unforgettable Mental Model:** The **Shipping Warehouse**. You first register your package (initiate), get a tracking number (upload ID), drop it at the loading dock (upload chunks), confirm delivery (complete), and can check its status anytime (status endpoint). If you change your mind, you can cancel the shipment (delete).
- **The Trap:** Making the upload endpoint synchronous. Large file uploads take time — the client will timeout if the server processes the file before responding. Always return immediately with an upload ID and process asynchronously.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The API follows an initiate-upload-complete pattern. POST /uploads/initiate validates the file metadata and returns an upload ID with pre-signed S3 URLs. The client uploads chunks directly to S3 using those URLs. POST /uploads/{id}/complete verifies all chunks, assembles the file, and kicks off async processing — virus scanning, thumbnail generation, metadata extraction. GET /uploads/{id}/status lets the client poll for progress. All operations are asynchronous to prevent timeouts on large files."

#### How do you handle concurrent uploads from the same user?
- **The Engine Mechanism (Why it behaves this way):** Each upload gets a unique upload ID (UUID v4), so concurrent uploads don't conflict. Rate limiting is applied per-user (not per-upload) to prevent a single user from consuming all resources. A token bucket algorithm allows N concurrent uploads with a queue for excess requests. Storage quotas enforce per-user limits (total size, total file count). The database tracks active uploads per user, and the API rejects new uploads when the quota is exceeded.
- **The Unforgettable Mental Model:** The **Highway Toll Booth**. Each car (upload) gets its own lane (upload ID). The toll booth has a limited number of lanes (concurrent upload limit). If all lanes are full, cars wait in a queue (rate limiter). The highway has a maximum capacity (storage quota) — once full, no more cars enter.
- **The Trap:** Not enforcing per-user quotas. Without quotas, a single user can upload thousands of files, consuming all storage and processing resources, causing denial of service for other users.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Each upload gets a UUID, so concurrent uploads are naturally isolated. I'd enforce per-user limits using a token bucket rate limiter (e.g., 5 concurrent uploads per user) and storage quotas (e.g., 10GB total). When a user exceeds their quota, the API returns a 429 Too Many Requests with a Retry-After header. The database tracks active uploads and total storage per user, and a background job enforces quotas by cleaning up abandoned uploads after a TTL."

#### How do you generate thumbnails and process files asynchronously?
- **The Engine Mechanism (Why it behaves this way):** After upload completion, an event is published to a message queue (SQS, Kafka, RabbitMQ). Worker processes consume the event and perform processing: image resizing (Sharp, ImageMagick), video transcoding (FFmpeg), document conversion, virus scanning, and metadata extraction. Processed files are stored in a separate bucket/prefix. The database is updated with processing status and output file URLs. Webhooks or Server-Sent Events notify the client when processing completes. Failed processing jobs are retried with exponential backoff and moved to a dead-letter queue after max retries.
- **The Unforgettable Mental Model:** The **Photo Lab**. You drop off your film (upload complete event) at the counter. Behind the scenes, technicians (workers) develop the photos, make prints in different sizes (thumbnails), check for defects (virus scan), and file the results. When ready, they call you (webhook/notification) to pick them up.
- **The Trap:** Processing files synchronously in the upload request handler. This blocks the response, causes timeouts, and ties up server resources. Always decouple processing with a message queue.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use an event-driven architecture. When an upload completes, an event is published to SQS or Kafka. Worker processes consume events and handle image resizing with Sharp, video transcoding with FFmpeg, and virus scanning. Each processing step updates the database status. On completion, a webhook notifies the client. Failed jobs retry with exponential backoff and land in a dead-letter queue after 3 attempts. This keeps the upload path fast and scales processing independently by adding more workers."

#### How do you monitor and debug file upload issues in production?
- **The Engine Mechanism (Why it behaves this way):** Key metrics include: upload success/failure rate, average upload duration (p50, p95, p99), bytes uploaded per second, active concurrent uploads, processing queue depth, processing success/failure rate, and storage utilization. Logs should capture upload ID, user ID, file size, file type, start/end timestamps, and error details. Distributed tracing (OpenTelemetry) tracks the full lifecycle from initiate → chunk upload → complete → processing → notification. Alerts fire on: high failure rates, queue backlog, storage approaching capacity, and processing latency spikes.
- **The Unforgettable Mental Model:** The **Control Tower**. Air traffic controllers (monitoring dashboard) watch every plane's (upload's) position, speed, and status. They see bottlenecks (queue depth), emergencies (failures), and runway capacity (storage limits). Alarms sound when something deviates from the norm.
- **The Trap:** Only monitoring success rate without tracking latency percentiles. A 99% success rate hides the fact that the 1% of failures might be your largest, most important uploads. Always track p95 and p99 latency.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd track upload success rate, latency percentiles (p50/p95/p99), bytes per second, and processing queue depth. Every upload gets a trace ID that flows through the entire lifecycle — from initiation through chunk uploads to processing completion. Logs capture upload ID, user ID, file metadata, and timestamps. I'd set alerts on failure rate spikes, queue backlog exceeding thresholds, and storage approaching capacity. Distributed tracing with OpenTelemetry lets me debug slow uploads by seeing exactly which stage is the bottleneck."

## 8. Active recall test

1. **How do you prevent large file uploads from crashing the server?**
   - **Explanation:** Use streaming uploads that pipe the request body directly to object storage without buffering in memory. For very large files, use pre-signed URLs so the client uploads directly to S3, bypassing the application server entirely.

2. **What makes an upload resumable?**
   - **Explanation:** The file is split into chunks, each uploaded independently with a part number. The server tracks received chunks in a database or Redis. On reconnection, the client queries for received chunks and resumes from the last successful one.

3. **Why is checking file extensions insufficient for security?**
   - **Explanation:** Attackers can rename malicious files with safe extensions (malware.exe → malware.jpg). Always validate magic bytes (the file's actual binary signature) and use content-type detection from the file content itself.

4. **What is the initiate-upload-complete pattern?**
   - **Explanation:** POST /uploads/initiate validates metadata and returns an upload ID with pre-signed URLs. The client uploads chunks directly to storage. POST /uploads/{id}/complete verifies all chunks and triggers async processing.

5. **How do you prevent one user from consuming all upload resources?**
   - **Explanation:** Enforce per-user rate limits (token bucket for concurrent uploads) and storage quotas (max total size and file count). Return 429 when limits are exceeded and clean up abandoned uploads with a TTL.

6. **Why should file processing be asynchronous?**
   - **Explanation:** Processing (virus scanning, resizing, transcoding) takes seconds to minutes. Doing it synchronously blocks the response and causes timeouts. Use a message queue to decouple upload from processing.

7. **What metrics are critical for monitoring a file upload service?**
   - **Explanation:** Upload success/failure rate, latency percentiles (p50/p95/p99), bytes per second, processing queue depth, and storage utilization. Every upload should have a trace ID for end-to-end debugging.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design a file upload service in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design a file upload service in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
