# Partial Failure in Bulk APIs

## Detailed explanation

Report per-item outcomes and safely retry failed items when some records succeed and others fail. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Bulk APIs need item-level truth, not only whole-request success.

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

In production, partial failure in bulk apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What is partial failure in bulk APIs?
- **The Engine Mechanism (Why it behaves this way):** Partial failure occurs when a bulk operation processes multiple items and some succeed while others fail. Instead of rolling back everything (all-or-nothing) or failing entirely, the API reports per-item outcomes. The response includes total count, succeeded count, failed count, and per-item error details. This allows the client to handle failures granularly.
- **The Unforgettable Mental Model:** The **Batch Quality Report**. Out of 100 items processed, 95 passed inspection and 5 failed. The report lists exactly which 5 failed and why, so they can be fixed and resubmitted without reprocessing the 95 that passed.
- **The Trap:** Returning a single success/failure for the entire bulk operation — this forces the client to either retry everything (wasting resources on already-succeeded items) or give up entirely.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Partial failure means some items in a bulk operation succeed while others fail. Instead of all-or-nothing, I report per-item outcomes: total, succeeded, failed counts, and per-item error details. This allows the client to handle failures granularly — resubmitting only the failed items without reprocessing the successful ones."

#### How do you design the response for partial failures?
- **The Engine Mechanism (Why it behaves this way):** Response structure: `{ success: true, data: { total: 100, succeeded: 95, failed: 5, results: [{ index: 0, status: "success", id: "prod_1" }, { index: 1, status: "error", error: { code: "VALIDATION_ERROR", message: "Invalid SKU", field: "sku" } }] } }`. Each result entry has an index (matching the request array position), status, and either the created/updated ID or error details.
- **The Unforgettable Mental Model:** The **Graded Exam Paper**. Each question (item) is marked individually — correct answers get points (success with ID), wrong answers get specific feedback (error with code and message). The total score shows overall performance.
- **The Trap:** Not including the index in results — without it, the client can't map results back to the original request items, especially when the request array has no unique identifiers.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The response includes total, succeeded, and failed counts, plus a results array where each entry has an index matching the request position, a status (success/error), and either the resource ID or error details. The index is critical — it allows the client to map results back to the original request items, even when items lack unique identifiers."

#### How do you handle partial failures at the database level?
- **The Engine Mechanism (Why it behaves this way):** Database handling: (1) Process each item in its own transaction — successful items commit, failed items don't; (2) Use savepoints for rollback of individual items within a larger transaction; (3) Collect errors without stopping processing; (4) Return aggregated results after all items are processed. This ensures partial success is persisted while failures are isolated.
- **The Unforgettable Mental Model:** The **Assembly Line with Quality Gates**. Each item moves through the line independently. Items that pass all gates are packaged (committed). Items that fail at any gate are set aside with a defect tag (error). The line keeps running regardless.
- **The Trap:** Wrapping all items in a single transaction — if one item fails, everything rolls back, which defeats the purpose of partial failure handling.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I process each item in its own transaction — successful items commit independently, failed items are isolated. I use savepoints for rollback of individual items within a larger transaction when needed. I collect errors without stopping processing and return aggregated results. Wrapping everything in one transaction defeats partial failure handling — a single failure would roll back all successes."

#### What status codes do you return for partial failures?
- **The Engine Mechanism (Why it behaves this way):** Status codes: `200 OK` if at least one item succeeded (the operation itself completed), `207 Multi-Status` (WebDAV standard for mixed results), or `400 Bad Request` if all items failed. The choice depends on convention — 200 with per-item details is most common, 207 is more semantically precise but less widely supported.
- **The Unforgettable Mental Model:** The **Mixed Results Board**. Mostly green (200 — operation completed with some successes), all red (400 — everything failed), or a mixed board (207 — explicitly multi-status).
- **The Trap:** Returning 500 when some items fail — 500 indicates a server error, not a partial success. The server processed the request correctly; some items just had validation or business rule failures.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I return 200 OK if at least one item succeeded — the operation completed successfully, even if some items failed. 207 Multi-Status is more semantically precise but less widely supported. 400 Bad Request if all items failed. I never return 500 for partial failures — 500 indicates a server error, not item-level validation or business rule failures."

#### How do you allow clients to retry failed items?
- **The Engine Mechanism (Why it behaves this way):** Retry support: (1) Include failed items in the response with their original data and error details; (2) Provide a retry endpoint that accepts the failed items; (3) Support idempotency keys for retry operations; (4) Optionally auto-retry transient failures (database locks, timeouts); (5) Include a `retryable` flag in each error to indicate whether retry is appropriate.
- **The Unforgettable Mental Model:** The **Resubmission Tray**. Failed items are placed in a tray with their original data and error notes. The client reviews the notes, fixes what they can, and resubmits the tray. Some items can be retried as-is (retryable: true), others need fixing first.
- **The Trap:** Not including original data in the error response — the client has to reconstruct the failed item from the original request, which is error-prone.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I include failed items in the response with their original data and error details, provide a retry endpoint, support idempotency keys for retries, and include a retryable flag in each error. Including original data is critical — without it, the client has to reconstruct failed items from the original request, which is error-prone."

#### How do you test partial failure handling?
- **The Engine Mechanism (Why it behaves this behavior):** Test scenarios: (1) All items succeed → all success results; (2) All items fail → appropriate error; (3) Mixed success/failure → correct per-item results; (4) Specific error types → correct error codes per item; (5) Database transaction isolation → successful items committed, failed items not; (6) Large batch → performance acceptable; (7) Retry failed items → only failed items reprocessed; (8) Idempotent retry → same results.
- **The Unforgettable Mental Model:** The **Partial Failure Lab**. Every combination is tested: all good, all bad, mixed, specific errors, transaction isolation, large batches, retries, and idempotent behavior.
- **The Trap:** Not testing transaction isolation — verifying that successful items are committed while failed items are rolled back requires database-level verification, not just response checking.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test all-success, all-failure, mixed results, specific error types per item, database transaction isolation (successful items committed, failed items not), large batch performance, retry behavior, and idempotent retries. Transaction isolation testing is critical — I verify the database state directly, not just the API response."

#### How do you handle cascading failures in partial failure scenarios?
- **The Engine Mechanism (Why it behaves this way):** Cascading failure prevention: (1) Process items independently — one item's failure doesn't affect others; (2) Use circuit breakers for external dependencies; (3) Set per-item timeout limits; (4) Implement backpressure for database load; (5) Monitor error rate during processing — if too many items fail, stop early and return results so far. This prevents one failing item from taking down the entire batch.
- **The Unforgettable Mental Model:** The **Firewall System**. Each item is in its own compartment (independent processing). If one compartment catches fire (fails), the firewall (circuit breaker) contains it. If too many compartments catch fire, the system shuts down safely (early return).
- **The Trap:** Not setting per-item timeouts — a single slow item can block the entire batch processing, causing a timeout for all items.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I process items independently so one failure doesn't affect others, use circuit breakers for external dependencies, set per-item timeouts, implement backpressure for database load, and monitor error rates during processing — stopping early if too many items fail. Per-item timeouts are critical — a single slow item shouldn't block the entire batch."

#### What logs and metrics would you add for partial failure handling?
- **The Engine Mechanism (Why it behaves this way):** Logs: bulk operation completed (total, succeeded, failed, duration), per-item errors (index, error code, field), retry attempts, early termination events. Metrics: partial failure rate, average success rate per batch, most common error codes, retry success rate, batch processing time. Alerts: high partial failure rate, batch processing time spike, specific error code spike.
- **The Unforgettable Mental Model:** The **Batch Processing Dashboard**. Success rates, error patterns, retry effectiveness, and processing times are tracked for every bulk operation.
- **The Trap:** Not tracking the most common error codes — this data reveals systemic issues (e.g., a specific validation rule causing many failures) that can be addressed proactively.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log bulk operation results with total, succeeded, failed counts and duration, plus per-item error details. Metrics track partial failure rate, average success rate per batch, most common error codes, retry success rate, and processing time. I alert on high partial failure rates, processing time spikes, and error code spikes. Common error code tracking reveals systemic issues that can be addressed proactively."

## 8. Active recall test

1. **What is partial failure in bulk APIs?**
   - **Explanation:** When some items in a bulk operation succeed while others fail — the API reports per-item outcomes instead of all-or-nothing.

2. **Why include the index in each result entry?**
   - **Explanation:** So the client can map results back to the original request items, especially when items lack unique identifiers.

3. **What status code is returned when some items succeed and some fail?**
   - **Explanation:** `200 OK` (most common) or `207 Multi-Status` — the operation completed, even though some items failed.

4. **How are successful and failed items handled at the database level?**
   - **Explanation:** Each item is processed in its own transaction — successful items commit independently, failed items are isolated and don't affect others.

5. **Why include original data in the error response for failed items?**
   - **Explanation:** So the client can retry failed items without reconstructing the original request data, which is error-prone.

6. **What does the retryable flag indicate?**
   - **Explanation:** Whether the failed item can be retried as-is (transient error) or needs fixing first (validation error, business rule violation).

7. **Why set per-item timeouts in bulk processing?**
   - **Explanation:** To prevent a single slow item from blocking the entire batch — each item has its own timeout limit.

8. **What metric reveals systemic issues in bulk operations?**
   - **Explanation:** Most common error codes — if a specific error code appears frequently, it indicates a systemic issue that can be addressed.

9. **Why not wrap all bulk items in a single transaction?**
   - **Explanation:** A single transaction would roll back all items if any one fails, defeating the purpose of partial failure handling.

10. **What prevents cascading failures during bulk processing?**
    - **Explanation:** Independent item processing, circuit breakers for external dependencies, per-item timeouts, and early termination if error rate is too high.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Partial Failure in Bulk APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
