# Payment Callback APIs

## Detailed explanation

Receive payment provider callbacks securely, verify signatures, handle retries, and update payment/order state idempotently. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Payment callbacks are untrusted repeated events that must be verified and deduplicated.

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

In production, payment callback apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for payment callbacks?
- **The Engine Mechanism (Why it behaves this way):** A single `POST /api/webhooks/payment` endpoint that receives payment provider callbacks (Stripe, PayPal, etc.). The endpoint verifies the webhook signature, processes the event (payment succeeded, failed, refunded), updates order/payment state idempotently, and returns a 200 response quickly. Processing is offloaded to a queue for heavy operations.
- **The Unforgettable Mental Model:** The **Bank Notification Wire**. The bank sends a notification (webhook), the teller verifies it's genuine (signature check), updates your account balance (state update), and sends an acknowledgment (200 response) — all within seconds.
- **The Trap:** Processing the callback synchronously with heavy operations — this causes timeouts, and the payment provider will retry, creating duplicate processing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I expose `POST /api/webhooks/payment` that receives payment provider events. It verifies the webhook signature, processes the event idempotently, and returns 200 quickly. Heavy operations like sending emails or updating analytics are offloaded to a background queue. The endpoint must respond within the provider's timeout window (usually 5-30 seconds)."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** Request: provider-specific payload (e.g., Stripe sends `{ id, type, data: { object: { ... } } }`). Response on success: `200 OK` with `{ received: true }` — minimal and fast. Response on failure: `400 Bad Request` for invalid signature, `500 Internal Server Error` for processing failures (triggers provider retry). The response must be fast — processing happens asynchronously.
- **The Unforgettable Mental Model:** The **Delivery Receipt**. The courier hands you a package (webhook), you sign for it (200 response), and process it later. If you can't sign (error), the courier will come back (retry).
- **The Trap:** Returning 200 when processing fails — this tells the provider not to retry, and the event is lost. Return 500 to trigger retry.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The request body is provider-specific. On success, I return 200 with a minimal `{ received: true }` response — fast and simple. On signature validation failure, I return 400. On processing failure, I return 500 to trigger the provider's retry mechanism. The key is responding quickly and letting the retry mechanism handle transient failures."

#### What validations are required for payment callbacks?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Webhook signature verification — HMAC with provider's secret; (2) Event type validation — only process expected event types; (3) Idempotency check — event ID already processed; (4) Order/payment existence — referenced order exists; (5) State transition validity — can't mark paid order as paid again (idempotent); (6) Timestamp validation — reject events older than a threshold (replay protection).
- **The Unforgettable Mental Model:** The **Authenticated Courier**. The delivery person shows ID (signature), the package is expected (event type), it hasn't been delivered before (idempotency), the address exists (order exists), and the delivery is recent (timestamp check).
- **The Trap:** Not verifying the webhook signature — without it, anyone can send fake payment confirmations and get orders fulfilled for free.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I verify the webhook signature using HMAC with the provider's secret key — this is non-negotiable. I validate the event type, check idempotency by event ID, verify the referenced order exists, validate state transitions, and reject stale events. Signature verification is the most critical — without it, the endpoint is completely untrusted."

#### What status codes can payment callback APIs return?
- **The Engine Mechanism (Why it behaves this way):** `200 OK` for successful processing, `400 Bad Request` for invalid signature or malformed payload, `500 Internal Server Error` for processing failures (triggers retry), `503 Service Unavailable` for temporary downstream issues. Never return 200 for a failed processing — the provider must retry.
- **The Unforgettable Mental Model:** The **Acknowledgment System**. Got it (200), bad package (400), processing error — try again (500), system temporarily down — try again later (503).
- **The Trap:** Returning 200 when the order update fails — this prevents the provider from retrying, and the payment event is permanently lost.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 200 means the event was processed successfully. 400 means the signature is invalid or the payload is malformed — the provider won't retry these. 500 means processing failed — the provider will retry with exponential backoff. 503 means temporary unavailability. The critical rule: never return 200 for a failed processing, or the event is lost."

#### How do you secure payment callback APIs?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Signature verification — HMAC with provider secret, using constant-time comparison; (2) IP allowlisting — only accept from provider's known IPs (optional, as IPs can change); (3) Idempotency — event ID deduplication prevents double-processing; (4) Rate limiting — prevent abuse; (5) Payload size limits — prevent DoS; (6) Secret rotation — periodically rotate webhook secrets; (7) Audit logging — all webhook events recorded.
- **The Unforgettable Mental Model:** The **Secure Mailroom**. Every package is verified (signature), comes from known senders (IP allowlist), is logged (audit), and duplicates are rejected (idempotency).
- **The Trap:** Storing webhook secrets in source code — they should be in environment variables or a secrets manager, and rotated periodically.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I verify webhook signatures using HMAC with the provider's secret, stored in environment variables. I implement idempotency via event ID deduplication. I rate-limit the endpoint, enforce payload size limits, and log all events. I also support secret rotation. IP allowlisting is optional since provider IPs can change. The signature verification is the primary security control."

#### How do you avoid duplicate or unsafe payment callback operations?
- **The Engine Mechanism (Why it behaves this way):** Idempotency is achieved by storing processed event IDs in a database table with a unique constraint. Before processing, check if the event ID exists — if yes, return 200 immediately. The event processing itself uses database transactions to ensure order state updates are atomic. Payment state transitions are validated (e.g., can't go from "refunded" to "paid").
- **The Unforgettable Mental Model:** The **Stamped Envelope**. Each envelope has a unique postmark (event ID). If you've already opened one with that postmark, you ignore the duplicate. The contents are processed in a sealed room (transaction).
- **The Trap:** Not using a unique constraint on event IDs — a race condition between two concurrent webhook deliveries could process the same event twice.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I store processed event IDs in a table with a unique constraint. Before processing, I check if the event exists — if yes, return 200 immediately. The unique constraint prevents race conditions from concurrent deliveries. Order state updates happen in database transactions. Payment state transitions are validated to prevent invalid state changes."

#### How do you test payment callback APIs?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Valid webhook → 200, order updated; (2) Invalid signature → 400; (3) Duplicate event ID → 200, no double-processing; (4) Unknown event type → 200, ignored; (5) Nonexistent order → 500, triggers retry; (6) Invalid state transition → handled gracefully; (7) Malformed payload → 400; (8) Provider retry simulation → idempotent behavior; (9) Queue offloading → heavy operations don't block response.
- **The Unforgettable Mental Model:** The **Fire Drill for Payments**. Every possible webhook scenario is simulated: valid, invalid, duplicate, malformed, and the system's response to each is verified.
- **The Trap:** Not testing duplicate event processing — this is the most common production bug in webhook handlers.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test valid webhook processing, signature rejection, duplicate event idempotency, unknown event handling, missing order behavior, state transition validation, malformed payload rejection, provider retry simulation, and queue offloading. The duplicate event test is the most important — it validates the core idempotency mechanism."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: webhook received (event ID, type, timestamp, signature valid, processing outcome), order state change, duplicate detected, processing error. Metrics: webhooks per hour, processing success rate, average latency, duplicate rate, retry count from provider. Alerts: signature failure spike (possible attack), processing failure rate increase, high duplicate rate.
- **The Unforgettable Mental Model:** The **Payment Operations Monitor**. Every webhook event is tracked, processing health is monitored, and anomalies like signature failures or processing errors trigger alerts.
- **The Trap:** Logging the full webhook payload — it may contain sensitive payment data. Log only metadata: event ID, type, outcome, and sanitized references.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log webhook events with event ID, type, timestamp, signature validity, and processing outcome — never the full payload, which may contain sensitive payment data. Metrics track volume, success rate, latency, and duplicate rate. I alert on signature failure spikes that suggest attacks, processing failure increases, and high duplicate rates."

## 8. Active recall test

1. **What endpoint receives payment callbacks?**
   - **Explanation:** `POST /api/webhooks/payment` — a dedicated webhook endpoint that verifies signatures and processes payment events idempotently.

2. **Why must webhook signature verification be non-negotiable?**
   - **Explanation:** Without it, anyone can send fake payment confirmations and get orders fulfilled without paying — the endpoint is completely untrusted.

3. **How is duplicate webhook processing prevented?**
   - **Explanation:** Event IDs are stored in a database table with a unique constraint — before processing, the system checks if the event ID already exists.

4. **What status code triggers the provider to retry?**
   - **Explanation:** `500 Internal Server Error` — the provider interprets this as a processing failure and retries with exponential backoff.

5. **Why respond quickly from the webhook endpoint?**
   - **Explanation:** Payment providers have timeout windows (5-30 seconds). Slow responses cause retries. Heavy operations are offloaded to a background queue.

6. **What happens when a duplicate event ID is received?**
   - **Explanation:** The system returns 200 immediately without reprocessing — the event was already handled, so the response is idempotent.

7. **Why use a database transaction for order state updates?**
   - **Explanation:** To ensure atomicity — the order status and payment record are updated together, preventing partial updates if something fails mid-process.

8. **What should you never log in a webhook handler?**
   - **Explanation:** The full webhook payload — it may contain sensitive payment data like card numbers. Log only metadata: event ID, type, and outcome.

9. **What metric would indicate a webhook processing problem?**
   - **Explanation:** A high processing failure rate or increasing retry count from the provider — both indicate the webhook handler is not processing events successfully.

10. **How do you handle unknown event types from the provider?**
    - **Explanation:** Return 200 and log the event — unknown types should be ignored gracefully, not cause errors, as providers may add new event types.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Payment Callback APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
