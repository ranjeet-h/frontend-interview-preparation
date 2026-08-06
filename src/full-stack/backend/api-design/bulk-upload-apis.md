# Bulk Upload APIs

## Detailed explanation

Accept large batches or files, validate records, process asynchronously, and report per-row success/failure. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Bulk upload is a job workflow, not one giant request handler.

## 2. Problem it solves

This design prevents inconsistent client behavior, duplicated backend logic, unclear errors, security gaps, and production-only workflow bugs.

## 3. Core idea

- Define the resource or workflow clearly.
- Validate input at the API boundary.
- Enforce authentication, authorization, and ownership checks.
- Return consistent success and error shapes.
- Plan idempotency, retries, logging, and monitoring for production behavior.

## 4. Visual / analogy

```txt
Client request
  -> auth/validation
  -> domain rules
  -> database/cache/queue
  -> serialized response/error
  -> frontend behavior
```

## 5. Minimal example

```txt
REQUEST  /api/example
CHECK    auth + validation + domain rules
WRITE    database or enqueue job
RETURN   status code + response body
```

## 6. Real-world example

In production, bulk upload apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for bulk upload?
- **The Engine Mechanism (Why it behaves this way):** Bulk upload is a multi-step workflow: `POST /api/uploads` (initiate upload, returns upload ID), `PUT /api/uploads/:id/chunks` (upload file chunks for large files), `POST /api/uploads/:id/process` (trigger processing), `GET /api/uploads/:id/status` (check processing status), `GET /api/uploads/:id/results` (get per-row results). This async pattern prevents request timeouts on large files.
- **The Unforgettable Mental Model:** The **Factory Assembly Line**. Raw materials arrive (file upload), are queued for processing (async job), move through quality control (validation), and finished products are inspected (results).
- **The Trap:** Processing the upload synchronously — large files take too long, causing gateway timeouts and lost progress.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Bulk upload is an async workflow, not a single request. I expose endpoints to initiate the upload, upload file chunks, trigger processing, check status, and retrieve results. The file is uploaded first, then processed asynchronously via a job queue. This prevents timeouts and allows progress tracking."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** Initiate request: `{ fileName, mimeType, recordCount? }`. Response: `{ success: true, data: { uploadId, uploadUrl, chunkSize } }`. Status response: `{ success: true, data: { status: "uploading" | "processing" | "completed" | "failed", progress, startedAt, completedAt } }`. Results response: `{ success: true, data: { total, succeeded, failed, errors: [{ row, field, message }] } }`.
- **The Unforgettable Mental Model:** The **Job Ticket System**. You submit a job (initiate), get a tracking number (upload ID), check the status board (status), and pick up the results when done.
- **The Trap:** Returning all row-level errors in a single response — large uploads can have thousands of errors. Paginate errors or provide a downloadable error report.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The initiate request returns an upload ID and upload URL. Status responses show the current state and progress. Results include total, succeeded, failed counts, and paginated errors. For large error sets, I provide a downloadable CSV error report rather than returning everything in the JSON response."

#### What validations are required for bulk upload?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) File type — only allowed formats (CSV, XLSX); (2) File size — maximum limit (e.g., 100MB); (3) Schema validation — column headers match expected format; (4) Row-level validation — each row validated against the record schema; (5) Duplicate detection — check for duplicates within the file and against existing data; (6) Rate limiting — concurrent upload limits per user.
- **The Unforgettable Mental Model:** The **Border Control for Data**. Documents checked (file type), weight limit enforced (file size), forms verified (schema), each traveler inspected (row validation), and no duplicates allowed (duplicate detection).
- **The Trap:** Not validating within-file duplicates — the same record appearing twice in the upload file can cause data corruption.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate file type and size upfront, then validate the schema (column headers) before processing. Each row is validated against the record schema, and I check for duplicates both within the file and against existing data. I enforce concurrent upload limits per user. Schema validation happens early to fail fast before expensive row-level processing."

#### What status codes can bulk upload APIs return?
- **The Engine Mechanism (Why it behaves this way):** Initiate: `201 Created`. Chunk upload: `200 OK` or `206 Partial Content`. Process trigger: `202 Accepted`. Status check: `200 OK`. Results: `200 OK`. Validation errors: `400 Bad Request`. File too large: `413 Payload Too Large`. Authorization errors: `403 Forbidden`. Processing in progress: `202 Accepted` for results.
- **The Unforgettable Mental Model:** The **Processing Pipeline Signals**. Job created (201), piece received (200), job started (202), status available (200), results ready (200), file too big (413).
- **The Trap:** Returning 200 when processing is still in progress — 202 Accepted correctly indicates the request is accepted but not yet complete.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Initiate returns 201. Chunk uploads return 200. Processing trigger returns 202 Accepted. Status and results return 200. If results are requested before processing completes, I return 202 with the current status. File size violations return 413. The 202 status is key for async operations — it tells the client to check back later."

#### How do you secure bulk upload APIs?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Authentication required — only authorized users can upload; (2) File type validation — prevent executable uploads; (3) File size limits — prevent DoS; (4) Content scanning — scan for malware in uploaded files; (5) Rate limiting — concurrent upload limits; (6) Storage isolation — uploaded files stored in isolated, temporary locations; (7) Cleanup — temporary files deleted after processing or timeout.
- **The Unforgettable Mental Model:** The **Secure Document Intake**. Only authorized personnel can submit (auth), only paper documents accepted (file type), weight limit enforced (size), documents scanned for contraband (malware scan), and temporary holding areas are cleaned regularly.
- **The Trap:** Not cleaning up temporary files — abandoned uploads consume storage and may contain sensitive data that should be deleted.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I require authentication, validate file types and sizes, scan for malware, rate-limit concurrent uploads, store files in isolated temporary locations, and clean up after processing or timeout. The cleanup is critical — temporary files contain user data and must be deleted to prevent storage bloat and data exposure."

#### How do you avoid duplicate or unsafe bulk upload operations?
- **The Engine Mechanism (Why it behaves this way):** Each upload gets a unique upload ID. Re-processing the same upload is idempotent — the system checks if results already exist and returns them. Duplicate detection within the file prevents the same record from being inserted twice. Database transactions ensure each row's insert is atomic. Partial failure handling means some rows succeed while others fail.
- **The Unforgettable Mental Model:** The **Batch Processing Ledger**. Each batch has a unique reference number. Re-submitting the same batch returns the existing results. Within the batch, each item is processed independently, and a running tally tracks successes and failures.
- **The Trap:** Not handling partial failures — if row 50 of 100 fails, rows 1-49 should still be committed, not rolled back entirely.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Each upload has a unique ID, and re-processing is idempotent. I detect duplicates within the file and against existing data. Each row is processed in its own transaction, so partial failures don't roll back successful rows. The results report shows exactly which rows succeeded and which failed, with specific error messages for each failure."

#### How do you test bulk upload APIs?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Valid file → upload, process, results; (2) Invalid file type → 400; (3) File too large → 413; (4) Schema mismatch → validation errors; (5) Partial failure → some rows succeed, some fail; (6) Duplicate records → deduplication works; (7) Status polling → correct progress updates; (8) Large file → chunked upload works; (9) Concurrent uploads → rate limiting enforced; (10) Cleanup → temporary files deleted.
- **The Unforgettable Mental Model:** The **Full Production Run Test**. Every stage of the upload pipeline is tested: intake, processing, quality control, results, and cleanup.
- **The Trap:** Not testing partial failure scenarios — this is where the most complex logic lives and where bugs are most likely.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test the full workflow: file upload, processing, and results retrieval. I test invalid file types, oversized files, schema mismatches, partial failures, duplicate detection, status polling, chunked uploads, concurrent upload rate limiting, and temporary file cleanup. The partial failure test is the most complex — it validates that successful rows are committed while failed rows are reported with specific errors."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: upload initiated/processed/completed (user ID, upload ID, file size, record count, outcome), validation errors, processing errors, cleanup events. Metrics: uploads per day, average file size, processing time, success rate, error rate by type, queue depth. Alerts: processing time spike, high error rate, queue backup, storage usage growth.
- **The Unforgettable Mental Model:** The **Factory Production Monitor**. Every batch is tracked, processing times are measured, defect rates are monitored, and bottlenecks trigger alerts.
- **The Trap:** Not monitoring processing time — slow processing indicates performance issues that will worsen as file sizes grow.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log upload lifecycle events with user ID, upload ID, file size, record count, and outcome. Metrics track upload volume, average file size, processing time, success rate, and queue depth. I alert on processing time spikes, high error rates, queue backups, and storage growth. Processing time is the key metric — it directly impacts user experience."

## 8. Active recall test

1. **Why is bulk upload an async workflow, not a single request?**
   - **Explanation:** Large files take too long to process synchronously, causing gateway timeouts. Async processing with status polling prevents timeouts and allows progress tracking.

2. **What endpoint pattern handles the bulk upload workflow?**
   - **Explanation:** Multiple endpoints: POST /api/uploads (initiate), PUT /api/uploads/:id/chunks (upload), POST /api/uploads/:id/process (trigger), GET /api/uploads/:id/status (check), GET /api/uploads/:id/results (retrieve).

3. **What status code indicates processing has started but isn't complete?**
   - **Explanation:** `202 Accepted` — the request has been accepted for processing, but the result is not yet available.

4. **How are partial failures handled in bulk uploads?**
   - **Explanation:** Each row is processed in its own transaction — successful rows are committed, failed rows are recorded with error details, and the results report shows both.

5. **What prevents processing the same upload twice?**
   - **Explanation:** Upload ID idempotency — if results already exist for an upload ID, re-processing returns the existing results instead of creating duplicates.

6. **What validation happens before row-level processing?**
   - **Explanation:** Schema validation — column headers are checked against the expected format to fail fast before expensive row-level processing begins.

7. **Why clean up temporary upload files?**
   - **Explanation:** To prevent storage bloat and data exposure — temporary files contain user data and should be deleted after processing or after a timeout period.

8. **What metric indicates a processing bottleneck?**
   - **Explanation:** Increasing processing time or queue depth growth — both indicate the system is struggling to keep up with upload volume.

9. **How should large error sets be returned to the client?**
   - **Explanation:** Paginated in the JSON response or as a downloadable CSV error report — returning thousands of errors in a single response is impractical.

10. **What security check prevents malicious file uploads?**
    - **Explanation:** File type validation (only CSV/XLSX), file size limits, and malware scanning — these prevent executable files and oversized uploads from reaching the processor.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Bulk Upload APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
