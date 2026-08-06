# Idempotency Keys

## Detailed explanation

Use client-generated operation keys to return one result for repeated create/action requests. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Idempotency keys give unsafe operations a stable identity.

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

In production, idempotency keys should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What are idempotency keys and why are they needed?
- **The Engine Mechanism (Why it behaves this way):** An idempotency key is a client-supplied unique identifier (usually UUID) for an operation. When the same key is sent multiple times, the backend returns the same result without re-executing the operation. They're needed because networks are unreliable — retries, timeouts, and duplicate deliveries are inevitable. Idempotency keys make unsafe operations (POST, PATCH) safe to retry.
- **The Unforgettable Mental Model:** The **Receipt Number**. When you make a purchase, you get a receipt number. If you show the same receipt number again, the cashier says "already processed" and gives you the same receipt — they don't charge you twice.
- **The Trap:** Thinking idempotency is only for payments — any operation with side effects (creating orders, sending emails, charging cards) benefits from idempotency keys.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: An idempotency key is a client-supplied unique identifier for an operation. When the same key is sent multiple times, the backend returns the same result without re-executing. They're needed because networks are unreliable — retries, timeouts, and duplicate deliveries are inevitable. Idempotency keys make unsafe operations safe to retry, which is critical for payments, order creation, and any operation with side effects."

#### How do you implement idempotency keys?
- **The Engine Mechanism (Why it behaves this way):** Implementation: (1) Client generates UUID and sends in `Idempotency-Key` header; (2) Backend checks key in storage (Redis/DB); (3) If found, return cached response; (4) If not found, process operation, store key + response atomically, return response; (5) Set TTL on key storage (24-48 hours); (6) Key must be scoped to the endpoint and request body — same key on different endpoints is a different operation.
- **The Unforgettable Mental Model:** The **Processing Ledger**. Each operation is recorded with its unique reference number. Before processing, the ledger is checked — if the reference exists, the previous result is returned. If not, the operation is processed and recorded.
- **The Trap:** Not scoping keys to the request body — the same key with different request bodies should be treated as different operations, or the first body's result is incorrectly returned.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The client generates a UUID and sends it in the Idempotency-Key header. The backend checks storage — if found, return cached response. If not, process, store key + response atomically, and return. Keys have a 24-48 hour TTL. Keys should be scoped to the endpoint and request body hash — the same key with different bodies is a different operation and should be rejected or treated separately."

#### How do you handle idempotency key collisions?
- **The Engine Mechanism (Why it behaves this way):** Collision handling: (1) Validate request body matches the stored operation — if different, return 409 Conflict; (2) Store request body hash with the key for comparison; (3) If body matches, return cached result; (4) If body differs, reject with clear error message. This prevents accidental key reuse from returning incorrect results.
- **The Unforgettable Mental Model:** The **Fingerprint Match**. The receipt number (key) is checked against the fingerprint (body hash). If they match, the original transaction is returned. If they don't match, the system rejects the request — someone is trying to reuse a receipt for a different purchase.
- **The Trap:** Returning the cached result for a key with a different request body — this silently returns incorrect data and is very hard to debug.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I store the request body hash with the idempotency key. When a duplicate key arrives, I compare the body hash — if it matches, return the cached result. If it differs, return 409 Conflict with a clear error message. Returning cached results for different bodies is a silent data corruption bug that's extremely hard to debug."

#### How do you store idempotency keys efficiently?
- **The Engine Mechanism (Why it behaves this way):** Storage options: (1) Redis — fast, TTL support, ideal for high-throughput; (2) Database table — persistent, queryable, good for audit; (3) Hybrid — Redis for fast path, DB for audit. Key structure: `{ key, endpoint, bodyHash, response, status, createdAt, expiresAt }`. Use key prefixing for namespacing: `idempotency:{endpoint}:{key}`.
- **The Unforgettable Mental Model:** The **Two-Tier Archive**. The front desk (Redis) handles quick lookups for recent requests. The back archive (database) keeps permanent records for audit and compliance.
- **The Trap:** Storing full response bodies in Redis — large responses consume memory. Store only essential fields or use compression for large responses.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use Redis for fast idempotency checks with automatic TTL, and optionally a database table for audit. The key structure includes the key, endpoint, body hash, response, status, and timestamps. I namespace keys with prefixes. For large responses, I store only essential fields or use compression to avoid consuming excessive Redis memory."

#### How do you handle idempotency for async operations?
- **The Engine Mechanism (Why it behaves this way):** Async idempotency: (1) Store key immediately with "processing" status; (2) Return 202 Accepted with operation ID; (3) Process operation asynchronously; (4) Update stored result with final status; (5) Subsequent requests with same key return current status or final result; (6) Polling endpoint checks operation status. This handles long-running operations safely.
- **The Unforgettable Mental Model:** The **Order Tracking System**. You place an order and get a tracking number (key). Checking the same tracking number shows the current status (processing, shipped, delivered) — you don't place a new order.
- **The Trap:** Not storing the key before starting async processing — if the client retries before the key is stored, a duplicate operation is created.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For async operations, I store the idempotency key immediately with a 'processing' status and return 202 Accepted. The operation processes asynchronously, and the stored result is updated with the final status. Subsequent requests with the same key return the current status or final result. Storing the key before starting processing is critical — otherwise, retries before storage create duplicates."

#### How do you test idempotency key implementation?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Same key twice → same result; (2) Same key, different body → 409 Conflict; (3) Different keys → different results; (4) Key expiry → treated as new operation; (5) Concurrent same key → only one processes; (6) Async operation → status progression correct; (7) Key storage atomicity → no duplicates under load; (8) Response caching → cached response matches original.
- **The Unforgettable Mental Model:** The **Idempotency Stress Test**. Every key scenario is tested: reuse, collision, expiry, concurrency, async processing, and atomicity under load.
- **The Trap:** Not testing concurrent requests with the same key — this is where atomicity bugs surface and where the implementation is most likely to fail.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test same-key reuse (same result), key-body mismatch (409 Conflict), different keys (different results), key expiry, concurrent same-key requests (only one processes), async operation status progression, atomicity under load, and response caching accuracy. Concurrent testing is critical — atomicity bugs only surface under simultaneous requests."

#### What logs and metrics would you add for idempotency keys?
- **The Engine Mechanism (Why it behaves this way):** Logs: idempotency key checked/matched/stored (key, endpoint, timestamp, cache hit/miss), body hash mismatch detected, key expired, concurrent request detected. Metrics: idempotency cache hit rate, duplicate request rate, body mismatch rate, key storage size, average key TTL remaining. Alerts: high body mismatch rate (client bug), storage growth spike, cache hit rate drop.
- **The Unforgettable Mental Model:** The **Idempotency Monitor**. Tracks how often keys are reused (cache hits), how often mismatches occur (client bugs), and whether storage is healthy.
- **The Trap:** Not monitoring body mismatch rate — a high rate indicates clients are reusing keys incorrectly, which is a client-side bug that needs fixing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log idempotency key checks with cache hit/miss status, body hash mismatches, key expirations, and concurrent request detections. Metrics track cache hit rate, duplicate request rate, body mismatch rate, and storage size. I alert on high body mismatch rates (client bug), storage growth spikes, and cache hit rate drops. Body mismatch rate is the key client health indicator."

#### How do idempotency keys differ from deduplication?
- **The Engine Mechanism (Why it behaves this way):** Idempotency keys are client-supplied and return the same response for the same key. Deduplication is server-side and detects duplicate operations based on content (e.g., same email to same recipient). Idempotency is about safe retries; deduplication is about preventing unintended duplicates. Both can be used together — idempotency keys for retry safety, deduplication for content-level duplicate detection.
- **The Unforgettable Mental Model:** The **Two-Layer Filter**. Idempotency keys are the first filter (same reference number = same result). Deduplication is the second filter (same content = skip). Together, they catch both retry duplicates and content duplicates.
- **The Trap:** Confusing idempotency with deduplication — they solve different problems and require different implementations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Idempotency keys are client-supplied identifiers that ensure the same key returns the same result — they're about safe retries. Deduplication is server-side content-based detection that prevents unintended duplicates — like sending the same email twice. They solve different problems and can be used together: idempotency for retry safety, deduplication for content-level duplicate prevention."

## 8. Active recall test

1. **What is an idempotency key?**
   - **Explanation:** A client-supplied unique identifier (UUID) for an operation that ensures the same key returns the same result without re-executing the operation.

2. **Why are idempotency keys needed?**
   - **Explanation:** Networks are unreliable — retries, timeouts, and duplicate deliveries are inevitable. Idempotency keys make unsafe operations safe to retry.

3. **What happens when the same idempotency key is sent with a different request body?**
   - **Explanation:** Return 409 Conflict — the body hash doesn't match the stored operation, indicating key misuse.

4. **Where should idempotency keys be stored for performance?**
   - **Explanation:** Redis with TTL — fast key-value lookups with automatic expiry, optionally backed by a database for audit.

5. **How do you handle idempotency for async operations?**
   - **Explanation:** Store the key immediately with "processing" status, return 202 Accepted, process asynchronously, and update the stored result when complete.

6. **What is the recommended TTL for idempotency keys?**
   - **Explanation:** 24-48 hours — long enough to cover retry windows but short enough to prevent unbounded storage growth.

7. **Why store the request body hash with the idempotency key?**
   - **Explanation:** To detect key misuse — if the same key is used with a different body, the hash mismatch triggers a 409 Conflict instead of returning incorrect cached data.

8. **What is the difference between idempotency and deduplication?**
   - **Explanation:** Idempotency uses client-supplied keys for safe retries. Deduplication is server-side content-based detection for preventing unintended duplicates.

9. **What test scenario is most critical for idempotency?**
   - **Explanation:** Concurrent requests with the same key — this is where atomicity bugs surface and the implementation is most likely to fail.

10. **What metric indicates client-side idempotency key misuse?**
    - **Explanation:** High body mismatch rate — clients are reusing keys for different operations, which is a client-side bug that needs fixing.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Idempotency Keys.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
