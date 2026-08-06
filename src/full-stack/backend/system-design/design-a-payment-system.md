# Design a payment system

## Detailed explanation

Design a payment system is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, design a payment system affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you prevent double-charging in a payment system?
- **The Engine Mechanism (Why it behaves this way):** Double-charging is prevented through idempotency. Each payment request includes a client-generated idempotency key (UUID). The server stores this key in a unique-constrained database column. When a duplicate request arrives (same idempotency key), the server returns the original response without re-processing the payment. The payment provider (Stripe, PayPal) also supports idempotency keys at their API level. Database transactions ensure that the idempotency key check and payment creation are atomic — either both succeed or both fail. Optimistic locking (version column) prevents concurrent updates to the same payment record.
- **The Unforgettable Mental Model:** The **Stamped Receipt**. When you pay, the cashier stamps your receipt with a unique number (idempotency key). If you try to pay again with the same receipt, the cashier sees the stamp and says "this was already processed." The stamp is recorded in the register (database) so even a different cashier can see it.
- **The Trap:** Relying only on the payment provider's idempotency. If your server crashes after charging the provider but before recording the result, a retry will charge again. Always implement idempotency at your own application layer first.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd implement idempotency at multiple layers. First, at the application level — each payment request includes an idempotency key stored in a unique-constrained column. Duplicate keys return the original response without re-processing. Second, at the database level — payment creation is wrapped in a transaction with the idempotency check, ensuring atomicity. Third, at the provider level — I'd pass the same idempotency key to Stripe's API. Optimistic locking on the payment record prevents concurrent modifications. This three-layer approach ensures no double-charging even under network retries and server crashes."

#### How do you handle payment provider failures and retries?
- **The Engine Mechanism (Why it behaves this way):** Payment provider failures are categorized: transient (network timeout, 5xx error) are retried with exponential backoff; permanent (declined card, invalid amount) are not retried and return an error to the user. The payment state machine tracks status: pending → processing → succeeded/failed. If the provider doesn't respond (timeout), the payment stays in "pending" and a reconciliation job checks the provider's API for the actual status. Webhooks from the provider asynchronously update payment status. Idempotent webhook handlers ensure that duplicate webhook deliveries don't cause issues. A reconciliation job runs periodically to detect and fix discrepancies between local state and provider state.
- **The Unforgettable Mental Model:** The **Package Delivery with Confirmation**. You send a package (payment request) and wait for delivery confirmation. If the courier doesn't respond (timeout), you check with the depot (reconciliation) to see if it was delivered. If the address is wrong (declined card), you don't resend — you notify the sender. The delivery confirmation (webhook) arrives independently and updates your records.
- **The Trap:** Retrying declined payments. A declined card won't suddenly become valid on retry. Only retry transient failures (timeouts, 5xx errors). Retrying declines can trigger fraud detection at the payment provider.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd implement a payment state machine with statuses: pending, processing, succeeded, failed. Transient provider failures (timeouts, 5xx) are retried with exponential backoff up to 3 times. Permanent failures (declines, invalid amounts) are not retried. If a provider times out, the payment stays 'pending' and a reconciliation job queries the provider's API to determine the actual status. Webhooks asynchronously update payment status, and webhook handlers are idempotent. A periodic reconciliation job detects and fixes any state discrepancies between our database and the provider."

#### How do you design the payment data model?
- **The Engine Mechanism (Why it behaves this way):** Core tables: payments (id, idempotency_key, user_id, amount, currency, status, provider, provider_payment_id, created_at, updated_at), payment_methods (id, user_id, type, last_four, expiry, provider_token), invoices (id, user_id, total_amount, status, due_date), and line_items (id, invoice_id, description, amount, quantity). The payments table tracks the full lifecycle. Amounts are stored as integers (cents) to avoid floating-point precision issues. Currency is stored as ISO 4217 codes. The provider_payment_id links to the external provider's record for reconciliation. All monetary calculations use decimal arithmetic, never floats.
- **The Unforgettable Mental Model:** The **Accounting Ledger**. Each transaction (payment) is recorded with who paid (user_id), how much (amount in cents), in what currency, and the current status. The payment method is like the payment instrument on file (card ending in 4242). The invoice is the bill, and line items are the individual charges on the bill. Everything is tracked in whole cents — no rounding errors.
- **The Trap:** Storing amounts as floating-point numbers (e.g., 19.99). Floats have precision issues — 0.1 + 0.2 ≠ 0.3 in floating-point arithmetic. Always store amounts as integers (cents) or use a decimal type.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The core table is payments with id, idempotency_key, user_id, amount (stored as integer cents), currency (ISO 4217), status, provider, and provider_payment_id. Payment methods are stored separately with tokenized card details (never raw card numbers). Invoices and line items track billing. All monetary values are integers to avoid floating-point precision issues. The status field follows a state machine: pending → processing → succeeded/failed. The provider_payment_id enables reconciliation with the external provider. Sensitive data (card numbers) is never stored — only provider tokens and last-four digits."

#### How do you handle refunds and partial refunds?
- **The Engine Mechanism (Why it behaves this way):** Refunds are tracked in a refunds table linked to the original payment: refunds (id, payment_id, amount, reason, status, provider_refund_id, created_at). A refund cannot exceed the original payment amount — the system tracks total_refunded on the payment record and validates refund_amount + total_refunded <= original_amount. Partial refunds are supported by allowing multiple refund records per payment. The refund status follows its own state machine: pending → processing → succeeded/failed. Refunds are processed via the payment provider's refund API with idempotency keys. Reconciliation ensures the provider's refund status matches the local record.
- **The Unforgettable Mental Model:** The **Return Counter**. You can return the entire purchase (full refund) or just some items (partial refund). The counter tracks how much you've already returned — you can't return more than you bought. Each return gets its own receipt (refund record) linked to the original purchase.
- **The Trap:** Not tracking total_refunded on the payment record. Without this, concurrent refund requests could each check the remaining amount simultaneously and both succeed, resulting in over-refunding. Use a database constraint or row-level locking.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Refunds are stored in a separate table linked to the original payment. Each refund has its own idempotency key and status machine. The payment record tracks total_refunded, and a database constraint ensures refund_amount + total_refunded <= original_amount. I'd use SELECT FOR UPDATE (row-level locking) when processing refunds to prevent concurrent over-refunding. Partial refunds are supported by allowing multiple refund records per payment. Refunds are processed through the provider's API with idempotency, and reconciliation ensures provider and local state match."

#### How do you handle multi-currency payments?
- **The Engine Mechanism (Why it behaves this way):** Multi-currency support requires: (1) Store amounts in the original currency with the currency code; (2) Use an exchange rate service (fixer.io, Open Exchange Rates) to convert between currencies for reporting; (3) Store the exchange rate used at the time of transaction for audit purposes; (4) Handle currency-specific rules — some currencies have no decimal places (JPY), some have 3 (BHD); (5) Payment providers handle currency conversion at their end — you specify the charge currency, and the provider handles cardholder currency conversion. For reporting, convert all amounts to a base currency (USD) using the stored exchange rate. Never store amounts in a single currency — always preserve the original.
- **The Unforgettable Mental Model:** The **Currency Exchange Booth**. You pay in your local currency (original currency), the booth records both the amount and the exchange rate that day. For the company's books, everything is converted to USD (base currency) using the recorded rate. Different countries have different coin systems (currency precision) — Japan uses whole yen, Bahrain uses 3 decimal places.
- **The Trap:** Converting amounts to a base currency at display time using current exchange rates. This changes the historical value of transactions. Always store the exchange rate used at transaction time for accurate historical reporting.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd store all amounts in their original currency with the ISO 4217 currency code. At transaction time, I'd record the exchange rate used for conversion to the base currency (USD). Currency-specific precision is handled — JPY has 0 decimals, BHD has 3. The payment provider handles cardholder currency conversion. For reporting, I convert to the base currency using the stored historical exchange rate, not current rates. Exchange rates are fetched from a reliable service and cached with a short TTL. This ensures accurate historical financial reporting."

#### How do you implement webhooks for payment status updates?
- **The Engine Mechanism (Why it behaves this way):** Payment providers send webhooks for asynchronous events (payment succeeded, failed, refunded, disputed). The webhook endpoint: (1) Verifies the webhook signature (HMAC with provider's secret) to ensure authenticity; (2) Processes the event idempotently — checks if the event has already been processed using the provider's event ID; (3) Updates the local payment status based on the event type; (4) Triggers downstream actions (send receipt email, unlock content, update inventory); (5) Returns 200 OK quickly to acknowledge receipt. Webhook processing is decoupled — the endpoint validates and queues the event for async processing. A retry mechanism handles webhook delivery failures from the provider's side.
- **The Unforgettable Mental Model:** The **Certified Mail Delivery**. The postman (provider) delivers a letter (webhook) with a signature stamp (HMAC verification). The recipient signs for it (200 OK), then opens and processes the letter later (async processing). If the same letter arrives twice (provider retry), the recipient recognizes the tracking number (event ID) and doesn't process it again.
- **The Trap:** Processing webhooks synchronously in the endpoint handler. If downstream actions (email, inventory update) fail, the webhook times out and the provider retries, causing duplicate processing. Always validate, queue, and process asynchronously.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The webhook endpoint validates the HMAC signature, checks if the event ID has already been processed (idempotency), queues the event for async processing, and returns 200 OK immediately. The async worker updates the local payment status and triggers downstream actions (receipts, inventory, notifications). Webhook events are stored in a processed_events table keyed by provider event ID to prevent duplicate processing. I'd also implement a periodic reconciliation job that queries the provider's API to catch any missed webhooks. The endpoint responds within 500ms to avoid provider retry timeouts."

#### How do you handle payment disputes and chargebacks?
- **The Engine Mechanism (Why it behaves this way):** When a customer disputes a charge, the payment provider sends a dispute webhook. The system records the dispute in a disputes table linked to the payment: disputes (id, payment_id, reason, amount, status, evidence_submitted, created_at, resolved_at). The dispute status flows through: created → evidence_submitted → won/lost. When a dispute is created, the disputed amount is immediately deducted from the merchant's balance (provider does this automatically). The system notifies the merchant, collects evidence (receipts, delivery confirmation, communication logs), and submits it to the provider within the deadline (typically 7-30 days). Dispute analytics track win rates by reason to identify fraud patterns.
- **The Unforgettable Mental Model:** The **Court Case**. A customer files a complaint (dispute) about a charge. The court (provider) freezes the disputed amount. The merchant must present evidence (receipts, delivery proof) within a deadline. The judge rules in favor of the customer (lost) or merchant (won). The merchant tracks win rates to identify patterns and improve processes.
- **The Trap:** Not responding to disputes within the deadline. If evidence isn't submitted in time, the dispute is automatically lost and the merchant forfeits the amount plus a dispute fee. Always set internal deadlines before the provider's deadline.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Disputes are tracked in a disputes table linked to the original payment. When a dispute webhook arrives, I record it, notify the merchant, and start a evidence collection workflow. Evidence includes receipts, delivery confirmation, IP logs, and communication history. I'd set internal deadlines 3 days before the provider's deadline to ensure timely submission. Dispute analytics track win rates by reason, amount, and product category to identify fraud patterns. Lost disputes are recorded as revenue loss, and repeat disputers can be flagged for additional verification."

## 8. Active recall test

1. **How do you prevent double-charging a customer?**
   - **Explanation:** Use idempotency keys at three layers: application level (unique-constrained column), database level (atomic transaction with idempotency check), and provider level (pass key to Stripe's API). Optimistic locking prevents concurrent modifications.

2. **What happens when a payment provider times out?**
   - **Explanation:** The payment stays in "pending" status. A reconciliation job queries the provider's API to determine the actual status. Webhooks also asynchronously update status. Never retry a payment that might have succeeded — always check first.

3. **Why store payment amounts as integers instead of floats?**
   - **Explanation:** Floating-point arithmetic has precision issues (0.1 + 0.2 ≠ 0.3). Storing amounts as integer cents avoids rounding errors. Currency-specific precision (JPY=0 decimals, BHD=3) is handled by the currency code.

4. **How do you prevent over-refunding a payment?**
   - **Explanation:** Track total_refunded on the payment record. Use SELECT FOR UPDATE (row-level locking) when processing refunds. A database constraint ensures refund_amount + total_refunded <= original_amount.

5. **How do you handle multi-currency reporting accurately?**
   - **Explanation:** Store amounts in original currency with the exchange rate used at transaction time. Convert to base currency (USD) using the stored historical rate, not current rates. This preserves accurate historical financial records.

6. **How should webhook endpoints be designed?**
   - **Explanation:** Validate HMAC signature, check event ID for idempotency, queue for async processing, return 200 OK within 500ms. Process events asynchronously to avoid timeout-induced retries. Store processed event IDs to prevent duplicates.

7. **How do you handle payment disputes?**
   - **Explanation:** Record disputes in a linked table, notify the merchant, collect evidence (receipts, delivery proof, logs), and submit before the provider's deadline. Set internal deadlines 3 days early. Track win rates to identify fraud patterns.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design a payment system in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design a payment system in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
