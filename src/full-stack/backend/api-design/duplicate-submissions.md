# Prevent Duplicate Submissions

## Detailed explanation

Prevent double-clicks, retries, and repeated callbacks from creating duplicate side effects. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Duplicate prevention makes repeated intent safe.

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

In production, prevent duplicate submissions should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What causes duplicate submissions?
- **The Engine Mechanism (Why it behaves this way):** Duplicate submissions occur from: (1) Double-clicking — user clicks submit button twice; (2) Network retries — browser or proxy retries failed requests; (3) Page refresh — user refreshes after submission; (4) Back button — user navigates back and resubmits; (5) Payment provider retries — webhooks delivered multiple times; (6) Client-side bugs — multiple event handlers firing. Each source requires a different prevention strategy.
- **The Unforgettable Mental Model:** The **Echo Chamber**. A single voice (user intent) bounces off walls (network issues, UI bugs, provider retries) and returns as multiple echoes (duplicate requests). The system must recognize the original voice and ignore the echoes.
- **The Trap:** Only preventing double-clicks on the frontend — network retries and provider webhooks bypass frontend controls entirely.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Duplicate submissions come from double-clicking, network retries, page refreshes, back button resubmissions, payment provider webhook retries, and client-side bugs. Frontend prevention alone is insufficient — network retries and provider webhooks bypass frontend controls. Backend-level deduplication is the authoritative defense."

#### How do you prevent duplicate submissions on the frontend?
- **The Engine Mechanism (Why it behaves this way):** Frontend prevention: (1) Disable submit button after first click; (2) Show loading state immediately; (3) Use form submission state management; (4) Implement request deduplication (AbortController for duplicate in-flight requests); (5) Navigate away after successful submission; (6) Use POST-redirect-GET pattern to prevent refresh resubmission. Frontend prevention improves UX but is not security-grade.
- **The Unforgettable Mental Model:** The **One-Way Turnstile**. Once you pass through (submit), the turnstile locks (button disabled) and shows a "processing" sign (loading state). You can't go back through until processing completes.
- **The Trap:** Relying solely on frontend prevention — JavaScript can be bypassed, and network retries happen below the application layer.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I disable the submit button after the first click, show a loading state, use AbortController to cancel duplicate in-flight requests, navigate away after success, and use the POST-redirect-GET pattern to prevent refresh resubmission. But frontend prevention is UX improvement, not security — backend deduplication is the authoritative defense."

#### How do you prevent duplicate submissions on the backend?
- **The Engine Mechanism (Why it behaves this way):** Backend prevention: (1) Idempotency keys — client-supplied unique key stored and checked before processing; (2) Database unique constraints — prevent duplicate records; (3) Optimistic locking — version checks prevent concurrent duplicates; (4) Distributed locks — Redis-based locks for critical operations; (5) Token-based prevention — single-use submission tokens. Idempotency keys are the most flexible and widely applicable approach.
- **The Unforgettable Mental Model:** The **Stamped Receipt System**. Each submission gets a unique receipt number (idempotency key). If the same receipt number is presented again, the system returns the original result instead of processing again.
- **The Trap:** Not storing idempotency keys atomically with the operation — a race condition between key check and operation execution can still create duplicates.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use idempotency keys as the primary defense — the client supplies a unique key, and the backend stores it atomically with the operation result. Database unique constraints provide a safety net. Distributed locks handle concurrent requests. The key is atomic storage — checking for the key and executing the operation must happen in a single transaction to prevent race conditions."

#### How do idempotency keys work?
- **The Engine Mechanism (Why it behaves this way):** Idempotency key flow: (1) Client generates a unique key (UUID) for the operation; (2) Client sends key in `Idempotency-Key` header; (3) Backend checks if key exists in storage; (4) If yes, return cached result; (5) If no, process operation, store key + result atomically, return result; (6) Keys expire after a TTL (24-48 hours). The key must be unique per operation, not per client.
- **The Unforgettable Mental Model:** The **Claim Check**. You hand in your coat and get a numbered ticket (idempotency key). If you present the same ticket again, you get the same coat back — the coatroom doesn't process a new coat.
- **The Trap:** Reusing the same idempotency key for different operations — the key must be unique per operation, or the second operation will return the first operation's cached result.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The client generates a UUID for each operation and sends it in the Idempotency-Key header. The backend checks if the key exists — if yes, it returns the cached result. If no, it processes the operation and stores the key with the result atomically. Keys expire after 24-48 hours. The key must be unique per operation — reusing keys causes incorrect cached results to be returned."

#### How do you handle idempotency for webhook callbacks?
- **The Engine Mechanism (Why it behaves this way):** Webhook idempotency: (1) Use the provider's event ID as the idempotency key; (2) Store processed event IDs with a unique constraint; (3) Before processing, check if event ID exists — if yes, return 200 immediately; (4) Process and store atomically; (5) Event IDs are naturally unique per event from the provider. This is the simplest and most reliable idempotency pattern.
- **The Unforgettable Mental Model:** The **Delivery Log**. Each package has a tracking number (event ID). If the tracking number is already in the log, the package was already processed — acknowledge receipt and move on.
- **The Trap:** Not using a unique constraint on event IDs — concurrent webhook deliveries can race between the check and the insert, causing duplicate processing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use the provider's event ID as the idempotency key, store it with a unique constraint, and check before processing. If the event ID exists, return 200 immediately. If not, process and store atomically. The unique constraint is critical — concurrent webhook deliveries can race between the check and insert, and the constraint prevents duplicates."

#### How do you test duplicate submission prevention?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Double-click simulation → only one operation processed; (2) Concurrent identical requests → only one succeeds; (3) Same idempotency key twice → same result returned; (4) Different operations with same key → second returns first's result (bug detection); (5) Webhook duplicate delivery → idempotent processing; (6) Key expiry → old key treated as new; (7) Race condition testing → atomic key storage verified.
- **The Unforgettable Mental Model:** The **Duplicate Stress Test**. Every possible duplication scenario is simulated: double-clicks, concurrent requests, key reuse, webhook retries, and race conditions.
- **The Trap:** Not testing race conditions — duplicate prevention bugs only surface under concurrent load, which unit tests don't simulate.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test double-click simulation, concurrent identical requests, idempotency key reuse, different operations with the same key (bug detection), webhook duplicate delivery, key expiry behavior, and race conditions with concurrent load testing. Race condition testing is critical — duplicate prevention bugs only surface under concurrent load."

#### How do you handle idempotency key storage and expiry?
- **The Engine Mechanism (Why it behaves this way):** Storage: (1) Redis with TTL — fast, automatic expiry; (2) Database table with expiry column — persistent, queryable; (3) Hybrid — Redis for fast checks, database for audit. TTL of 24-48 hours balances replay protection with storage cleanup. Key storage includes: key, result, status, created_at, expires_at.
- **The Unforgettable Mental Model:** The **Temporary Filing Cabinet**. Each key is a file stored temporarily (TTL). After the retention period, the file is automatically shredded (expiry). The filing system is fast (Redis) for quick lookups.
- **The Trap:** Storing idempotency keys indefinitely — storage grows unbounded and old keys are no longer needed for replay protection.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I store idempotency keys in Redis with a 24-48 hour TTL for fast checks, with optional database storage for audit. The TTL balances replay protection with storage cleanup. Keys store the operation result, status, and timestamps. Indefinite storage is wasteful — keys are only needed for the replay window, after which they can be safely deleted."

#### What logs and metrics would you add for duplicate prevention?
- **The Engine Mechanism (Why it behaves this way):** Logs: duplicate detected (key, endpoint, timestamp, original request time), idempotency key stored, key expired, race condition detected. Metrics: duplicate submission rate, idempotency cache hit rate, average key storage size, key expiry rate, concurrent request rate. Alerts: high duplicate rate (client bug), idempotency storage growth spike, race condition detection.
- **The Unforgettable Mental Model:** The **Duplicate Detection Monitor**. Tracks how often duplicates occur, how effective the idempotency system is, and whether storage is growing as expected.
- **The Trap:** Not monitoring duplicate submission rate — a high rate indicates client-side bugs (double-clicks, retry loops) that should be fixed at the source.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log duplicate detections with key, endpoint, and timing information. Metrics track duplicate submission rate, idempotency cache hit rate, storage size, and concurrent request rate. I alert on high duplicate rates that indicate client bugs, storage growth spikes, and race condition detections. Duplicate rate monitoring helps identify client-side issues that should be fixed at the source."

## 8. Active recall test

1. **What are the main sources of duplicate submissions?**
   - **Explanation:** Double-clicking, network retries, page refreshes, back button resubmissions, payment provider webhook retries, and client-side bugs.

2. **Why is frontend duplicate prevention insufficient?**
   - **Explanation:** Network retries and provider webhooks bypass frontend controls — backend-level deduplication is the authoritative defense.

3. **What is the most flexible backend duplicate prevention method?**
   - **Explanation:** Idempotency keys — client-supplied unique keys that the backend checks before processing, returning cached results for duplicate keys.

4. **How should idempotency keys be stored?**
   - **Explanation:** Atomically with the operation result — checking for the key and executing the operation must happen in a single transaction to prevent race conditions.

5. **What is the recommended TTL for idempotency keys?**
   - **Explanation:** 24-48 hours — long enough to cover replay windows but short enough to prevent unbounded storage growth.

6. **How do you handle idempotency for webhook callbacks?**
   - **Explanation:** Use the provider's event ID as the idempotency key, store with a unique constraint, and check before processing — return 200 immediately for duplicate event IDs.

7. **Why use a unique constraint on event IDs?**
   - **Explanation:** To prevent race conditions between the check and insert — concurrent webhook deliveries could both pass the check without the constraint.

8. **What does a high duplicate submission rate indicate?**
   - **Explanation:** Client-side bugs like double-clicks, retry loops, or misconfigured retry logic — these should be fixed at the source.

9. **Where should idempotency keys be stored for fast lookups?**
   - **Explanation:** Redis with TTL — fast key-value lookups with automatic expiry, optionally backed by a database for audit purposes.

10. **What test scenario is most critical for duplicate prevention?**
    - **Explanation:** Race condition testing with concurrent load — duplicate prevention bugs only surface when multiple identical requests arrive simultaneously.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Prevent Duplicate Submissions.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
