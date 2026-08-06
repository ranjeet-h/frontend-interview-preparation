# Webhook APIs

## Detailed explanation

Expose event receiver endpoints with signature verification, idempotency, async processing, and retry-safe responses. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Webhook APIs accept external event delivery and turn it into internal work safely.

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

In production, webhook apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for webhooks?
- **The Engine Mechanism (Why it behaves this way):** A generic `POST /api/webhooks/:provider` endpoint that routes to provider-specific handlers based on the URL parameter. Each provider has its own signature verification, event parsing, and processing logic. Admin endpoints: `GET /api/admin/webhooks` (list received events), `POST /api/admin/webhooks/replay` (reprocess failed events).
- **The Unforgettable Mental Model:** The **Universal Mail Sorting Facility**. Mail arrives from different senders (providers), each with their own envelope format (signature), and is sorted into the correct processing lane (handler) based on the sender's label (provider name).
- **The Trap:** Creating a single monolithic webhook handler — different providers have different signature formats, event structures, and retry behaviors that require separate handling.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use `POST /api/webhooks/:provider` to route to provider-specific handlers. Each provider has its own signature verification, event parsing, and processing logic. I also provide admin endpoints for monitoring and replaying failed events. The routing pattern keeps provider-specific code isolated and maintainable."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** Request: provider-specific payload (varies by provider). Response on success: `200 OK` with `{ received: true }`. Response on failure: `400` for invalid signature/malformed payload, `500` for processing errors (triggers retry). The response is minimal and fast — processing happens asynchronously via a queue.
- **The Unforgettable Mental Model:** The **Quick Acknowledgment**. You receive a package, sign for it immediately (200), and process it later. If you can't sign (error), the courier returns (retry).
- **The Trap:** Returning detailed error responses to webhook callers — providers don't parse error bodies, they only check the status code to decide whether to retry.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The request body is provider-specific. The response is always minimal: 200 with `{ received: true }` on success, 400 for invalid input, 500 for processing failures. Providers only check the status code — they don't parse error bodies. The response must be fast, with heavy processing offloaded to a queue."

#### What validations are required for webhook APIs?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Signature verification — provider-specific (HMAC, RSA, etc.); (2) Event type allowlist — only process expected events; (3) Idempotency — event ID deduplication; (4) Timestamp validation — reject stale events; (5) Payload size limits; (6) Content-Type validation — ensure JSON; (7) Provider routing validation — provider must be configured.
- **The Unforgettable Mental Model:** The **Multi-Layer Security Check**. Identity verified (signature), purpose checked (event type), not a duplicate (idempotency), recent enough (timestamp), right size (payload limit), correct format (content type).
- **The Trap:** Not validating the Content-Type — some attacks send webhooks with unexpected content types that can exploit parsing vulnerabilities.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I verify the provider-specific signature, validate the event type against an allowlist, check idempotency via event ID, reject stale events, enforce payload size limits, validate Content-Type is JSON, and ensure the provider is configured. Signature verification is the most critical — it's the only trust boundary."

#### What status codes can webhook APIs return?
- **The Engine Mechanism (Why it behaves this way):** `200 OK` for successful processing, `400 Bad Request` for invalid signature or malformed payload (no retry), `500 Internal Server Error` for processing failures (triggers retry), `503 Service Unavailable` for temporary issues. `404 Not Found` for unknown providers. The status code determines retry behavior.
- **The Unforgettable Mental Model:** The **Traffic Signal for Retries**. Green (200) = done, red (400) = stop, no retry, flashing red (500) = retry, road closed (503) = retry later, wrong address (404) = stop.
- **The Trap:** Returning 400 for processing failures — 400 tells the provider not to retry, so the event is permanently lost. Use 500 for retriable errors.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 200 means processed successfully. 400 means invalid input — the provider won't retry. 500 means processing failed — the provider will retry. 503 means temporarily unavailable. 404 means unknown provider. The key distinction: 400 errors are not retried, 500 errors are. Choose the status code based on whether retry is appropriate."

#### How do you secure webhook APIs?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Signature verification — provider-specific cryptographic verification; (2) Secret management — webhook secrets in environment variables or secrets manager; (3) Idempotency — event ID deduplication; (4) Rate limiting — per-provider rate limits; (5) Payload validation — size, content type, schema; (6) Audit logging — all events recorded; (7) Secret rotation — periodic webhook secret rotation.
- **The Unforgettable Mental Model:** The **Secure Receiving Dock**. Every delivery is authenticated (signature), logged (audit), checked for duplicates (idempotency), and the receiving codes are changed regularly (secret rotation).
- **The Trap:** Hardcoding webhook secrets — they must be in environment variables or a secrets manager, and rotated periodically to limit exposure.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I verify provider-specific signatures, store secrets in a secrets manager, implement idempotency via event ID deduplication, rate-limit per provider, validate payloads, and log all events. I support secret rotation. The signature verification is the primary security control — everything else is defense in depth."

#### How do you avoid duplicate or unsafe webhook operations?
- **The Engine Mechanism (Why it behaves this way):** Idempotency via event ID storage with a unique constraint. Before processing, check if the event ID exists — if yes, return 200 immediately. Processing uses database transactions for atomic state updates. Event handlers are pure functions that produce the same result regardless of how many times they're called with the same event.
- **The Unforgettable Mental Model:** The **Duplicate Stamp Machine**. Every document gets a unique stamp. If the stamp already exists on the document, it's rejected. The processing is like a calculator — same input, same output, every time.
- **The Trap:** Not making event handlers idempotent — if the handler updates a counter or appends to a list, repeated calls produce different results.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I store event IDs with a unique constraint for deduplication. Event handlers are designed as idempotent functions — they produce the same result regardless of how many times they're called. State updates use database transactions. The combination of event ID deduplication and idempotent handlers ensures safe processing even with aggressive provider retries."

#### How do you test webhook APIs?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Valid webhook → 200, processed; (2) Invalid signature → 400; (3) Duplicate event → 200, idempotent; (4) Unknown event type → 200, ignored; (5) Malformed payload → 400; (6) Provider retry simulation → idempotent; (7) Queue offloading → response is fast; (8) Failed processing → 500, retry triggered; (9) Unknown provider → 404; (10) Payload size limit → 400.
- **The Unforgettable Mental Model:** The **Full Stress Test**. Every webhook scenario is simulated: valid, invalid, duplicate, malformed, slow processing, and the system's response to each is verified.
- **The Trap:** Not testing with real provider payloads — synthetic payloads may not cover edge cases that real provider events contain.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test valid processing, signature rejection, duplicate idempotency, unknown event handling, malformed payload rejection, provider retry simulation, queue offloading, failed processing behavior, unknown provider routing, and payload size limits. I also test with real provider payloads from their documentation to ensure compatibility."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: webhook received (provider, event ID, type, timestamp, outcome), processing errors, duplicate detected, queue enqueued. Metrics: webhooks per provider per hour, processing success rate, average latency, duplicate rate, queue depth, retry count. Alerts: signature failure spike, processing failure rate increase, queue depth growth, provider-specific error patterns.
- **The Unforgettable Mental Model:** The **Multi-Channel Operations Dashboard**. Each provider's webhook stream is monitored separately, processing health is tracked, and anomalies trigger provider-specific alerts.
- **The Trap:** Not monitoring queue depth — if the queue grows faster than it's processed, events are backing up and will eventually be lost or delayed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log webhook events with provider, event ID, type, and outcome. Metrics track volume per provider, success rate, latency, duplicate rate, and queue depth. I alert on signature failure spikes, processing failure increases, queue depth growth, and provider-specific error patterns. Queue depth monitoring is critical — it detects processing bottlenecks before events are lost."

## 8. Active recall test

1. **What endpoint pattern handles webhooks from multiple providers?**
   - **Explanation:** `POST /api/webhooks/:provider` — the provider parameter routes to provider-specific handlers for signature verification and event processing.

2. **Why must webhook handlers be idempotent?**
   - **Explanation:** Providers retry failed deliveries, so the same event may be received multiple times. Idempotent handlers ensure processing the same event twice produces the same result.

3. **What status code tells the provider to retry?**
   - **Explanation:** `500 Internal Server Error` — providers interpret this as a temporary failure and retry with exponential backoff.

4. **How are webhook secrets stored securely?**
   - **Explanation:** In environment variables or a secrets manager (e.g., AWS Secrets Manager, Vault) — never hardcoded in source code.

5. **What prevents processing the same webhook event twice?**
   - **Explanation:** Event ID deduplication — event IDs are stored in a database with a unique constraint, and duplicate IDs are rejected before processing.

6. **Why offload webhook processing to a queue?**
   - **Explanation:** To respond quickly (within provider timeout) and handle heavy operations asynchronously. Slow responses cause provider retries.

7. **What happens when an unknown event type is received?**
   - **Explanation:** Return 200 and log it — unknown types should be ignored gracefully, not cause errors, as providers may add new event types over time.

8. **What metric would indicate a processing bottleneck?**
   - **Explanation:** Growing queue depth — if events are enqueued faster than they're processed, the queue grows and events may be delayed or lost.

9. **Why validate Content-Type on webhook endpoints?**
   - **Explanation:** To prevent attacks that send unexpected content types which can exploit parsing vulnerabilities in the request body parser.

10. **What admin capability is important for webhook management?**
    - **Explanation:** Event replay — the ability to reprocess failed events manually, which is essential for recovering from temporary outages or bugs.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Webhook APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
