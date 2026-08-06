# Bulk Update APIs

## Detailed explanation

Apply many updates with validation, authorization, partial failure handling, and auditability. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Bulk update changes many records while preserving correctness per record.

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

In production, bulk update apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for bulk update?
- **The Engine Mechanism (Why it behaves this way):** `PATCH /api/resources/bulk` or `POST /api/resources/bulk-update` accepts an array of update operations. For async processing: `POST /api/bulk-operations` (initiate), `GET /api/bulk-operations/:id/status` (check), `GET /api/bulk-operations/:id/results` (get results). The sync approach works for small batches (<100 records); async is needed for larger operations.
- **The Unforgettable Mental Model:** The **Mass Mail Update Service**. You submit a list of address changes (bulk update), the post office processes them all at once, and sends you a report of which updates succeeded and which failed.
- **The Trap:** Using individual update endpoints in a loop from the client — this creates N requests instead of one, causing performance and consistency issues.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For small batches, I use `PATCH /api/resources/bulk` with an array of updates. For larger operations, I use an async workflow: initiate the operation, poll for status, and retrieve results. The sync approach works for under 100 records; beyond that, async prevents timeouts and allows progress tracking."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** Sync request: `{ updates: [{ id, fields: { ... } }] }`. Sync response: `{ success: true, data: { total, succeeded, failed, errors: [{ id, field, message }] } }`. Async initiate response: `{ success: true, data: { operationId, status: "processing" } }`. Results: `{ success: true, data: { total, succeeded, failed, errors: [...] } }`.
- **The Unforgettable Mental Model:** The **Batch Update Report**. You submit changes, and get a summary: "100 submitted, 95 updated, 5 failed" with details on each failure.
- **The Trap:** Returning only a success/failure boolean — the client needs per-item results to know which specific records were updated and which failed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The request accepts an array of update operations, each with an ID and the fields to change. The response includes total, succeeded, and failed counts, plus per-item error details. For async operations, the initiate response returns an operation ID, and results are retrieved separately. Per-item results are essential for the client to handle partial failures."

#### What validations are required for bulk update?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Each update has a valid ID; (2) Fields to update exist and are updatable; (3) Authorization — user can update each target record; (4) Field values pass individual validation rules; (5) Batch size limit — maximum records per request; (6) Conflict detection — no duplicate IDs in the batch; (7) Optimistic locking — version check for concurrent updates.
- **The Unforgettable Mental Model:** The **Quality Check Assembly Line**. Each item is inspected: ID verified (exists), fields checked (valid), permissions confirmed (authorized), values validated (correct format), and no duplicates in the batch.
- **The Trap:** Not checking authorization per record — a user might be authorized to update some records but not others in the batch.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate each record ID exists, the fields are updatable, the user has authorization for each target record, field values pass validation, the batch size is within limits, there are no duplicate IDs, and optimistic locking versions are checked. Authorization must be checked per record, not just for the batch as a whole."

#### What status codes can bulk update APIs return?
- **The Engine Mechanism (Why it behaves this way):** Sync: `200 OK` with per-item results (even if some failed), `400 Bad Request` for malformed input, `413 Payload Too Large` for oversized batches, `403 Forbidden` for authorization failures on all records. Async: `202 Accepted` for initiate, `200 OK` for status/results. Partial authorization failures still return 200 with per-item error details.
- **The Unforgettable Mental Model:** The **Batch Processing Scorecard**. The overall operation succeeds (200), but individual items may have failed — the scorecard shows the breakdown.
- **The Trap:** Returning 400 when some items fail — the batch operation itself succeeded (it processed all items), so 200 is correct with per-item error details.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The bulk operation returns 200 with per-item results, even if some items failed. The operation itself succeeded — it processed all items. 400 is reserved for malformed input. 413 for oversized batches. 403 only if the user has no authorization for any record. Partial failures are reported in the response body, not through status codes."

#### How do you secure bulk update APIs?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Per-record authorization — check ownership/permissions for each target; (2) Batch size limits — prevent resource exhaustion; (3) Field allowlist — only allow updating specific fields; (4) Rate limiting — bulk operations per user per time window; (5) Audit logging — log each individual update; (6) Input validation — sanitize all field values.
- **The Unforgettable Mental Model:** The **Secure Bulk Processing Center**. Each document is checked for clearance (authorization), only certain fields can be modified (allowlist), the batch size is capped (limits), and every change is recorded (audit).
- **The Trap:** Not limiting which fields can be updated in bulk — allowing bulk updates to sensitive fields like "role" or "status" could enable mass privilege escalation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I check authorization per record, limit batch size, restrict updatable fields to a safe allowlist, rate-limit bulk operations, and audit-log each individual update. Field allowlisting is critical — bulk-updating sensitive fields like roles or statuses could enable mass privilege escalation or data corruption."

#### How do you avoid duplicate or unsafe bulk update operations?
- **The Engine Mechanism (Why it behaves this way):** Each update in the batch is processed independently with its own transaction. Duplicate IDs within the batch are detected and rejected. Optimistic locking prevents concurrent update conflicts. The operation is idempotent — running the same bulk update twice produces the same final state. Partial failures don't roll back successful updates.
- **The Unforgettable Mental Model:** The **Independent Processing Lanes**. Each item goes through its own lane (transaction), duplicate items are caught at the entrance (ID check), and if one lane has a problem, the others keep running (partial failure).
- **The Trap:** Wrapping the entire batch in a single transaction — if one record fails, all updates are rolled back, which is often not the desired behavior.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Each update in the batch is processed in its own transaction, so partial failures don't roll back successful updates. I detect duplicate IDs within the batch and reject them. Optimistic locking prevents concurrent conflicts. The operation is idempotent — running it twice produces the same result. I avoid wrapping the entire batch in one transaction because partial failure handling requires independent commit per record."

#### How do you test bulk update APIs?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) All valid updates → all succeed; (2) Mixed valid/invalid → partial success with errors; (3) Duplicate IDs in batch → rejected; (4) Unauthorized records → per-record 403 in results; (5) Batch size exceeded → 413; (6) Optimistic locking conflict → version mismatch error; (7) Empty batch → 400; (8) Nonexistent IDs → per-record 404 in results; (9) Async workflow → status progression correct; (10) Idempotency → running twice produces same state.
- **The Unforgettable Mental Model:** The **Full Batch Stress Test**. Every combination is tested: all good, all bad, mixed, duplicates, unauthorized, oversized, and the system's handling of each is verified.
- **The Trap:** Not testing mixed success/failure scenarios — this is the most common production case and the most complex to handle correctly.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test all-valid updates, mixed valid/invalid for partial success, duplicate ID rejection, per-record authorization failures, batch size limits, optimistic locking conflicts, empty batch handling, nonexistent IDs, async workflow progression, and idempotency. The mixed success/failure test is the most important — it validates the core partial failure handling logic."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: bulk operation initiated/completed (user ID, operation ID, record count, outcome), per-record update results, authorization failures, validation errors. Metrics: bulk operations per day, average batch size, processing time, success rate, error rate by type, partial failure rate. Alerts: high partial failure rate, processing time spike, batch size anomalies.
- **The Unforgettable Mental Model:** The **Batch Operations Dashboard**. Every bulk operation is tracked, success rates are monitored, and anomalies like high partial failure rates trigger investigation.
- **The Trap:** Not tracking partial failure rate — a high rate indicates data quality issues or authorization problems that need attention.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log bulk operation lifecycle events and per-record results. Metrics track operation volume, average batch size, processing time, success rate, and partial failure rate. I alert on high partial failure rates, processing time spikes, and unusual batch sizes. The partial failure rate is the key quality metric — it indicates data or authorization issues."

## 8. Active recall test

1. **What endpoint handles bulk updates?**
   - **Explanation:** `PATCH /api/resources/bulk` for sync processing of small batches, or an async workflow with POST /api/bulk-operations for larger operations.

2. **Why return 200 even when some items fail?**
   - **Explanation:** The bulk operation itself succeeded — it processed all items. Individual failures are reported in the response body, not through the status code.

3. **How are partial failures handled?**
   - **Explanation:** Each update is processed in its own transaction — successful updates are committed, failed ones are recorded with error details in the results.

4. **Why check authorization per record, not per batch?**
   - **Explanation:** A user may have permission to update some records but not others in the batch — authorization must be evaluated for each target individually.

5. **What prevents duplicate IDs within a batch?**
   - **Explanation:** Pre-processing validation detects duplicate IDs in the request and rejects the batch or the duplicate entries before processing begins.

6. **Why use optimistic locking in bulk updates?**
   - **Explanation:** To detect concurrent modification conflicts — if another process updated a record between the client's read and the bulk update, the version mismatch prevents overwriting.

7. **What is the maximum recommended batch size for sync processing?**
   - **Explanation:** Around 100 records — beyond this, request processing time increases and the risk of timeouts grows. Larger batches should use async processing.

8. **Why not wrap the entire batch in a single transaction?**
   - **Explanation:** A single transaction would roll back all updates if any one fails. Independent transactions per record allow partial success, which is usually the desired behavior.

9. **What metric indicates data quality issues in bulk updates?**
   - **Explanation:** High partial failure rate — if many items in bulk updates are failing, it suggests data quality problems or misconfigured permissions.

10. **Why restrict which fields can be bulk-updated?**
    - **Explanation:** To prevent mass modification of sensitive fields like roles, statuses, or permissions — bulk-updating these could cause widespread security or data integrity issues.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Bulk Update APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
