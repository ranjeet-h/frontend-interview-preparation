# Payment System

A payment system is a **correctness** system, not a throughput one. The pressure is that money must move **exactly once**, the ledger must be immutable and auditable, and every external gateway is unreliable — it may time out after charging, or send the same webhook twice. Getting this wrong loses real money.

This design is an interview scope, not a product claim. It covers charging a customer, idempotency, the payment state machine, an immutable ledger, gateway abstraction, webhooks, and reconciliation. Multi-currency FX, payouts, and card-network certification are extensions.

## 1. Clarify requirements

Functional requirements:

- Create a **payment** to charge a customer via a gateway.
- Guarantee **no double charge**, even on retries.
- Track the payment through a **state machine**.
- Record every money movement in an **immutable ledger**.
- Receive and process gateway **webhooks**.
- **Reconcile** our records against the gateway's.

Non-functional requirements (interview assumptions):

- Correctness over availability: fail closed rather than risk a double charge.
- The ledger is **append-only** and auditable; balances are derived.
- Retries and webhooks are **idempotent**.
- Gateway calls are rate-limited and can be slow or time out.

Out of scope: FX, payouts, chargebacks workflow, and PCI card storage (tokenized by the gateway).

## 2. Estimate scale

Useful numbers, labelled as assumptions:

- Payment volume is **low** compared to a social app — thousands per second at peak, not millions.
- Each payment is a small number of ledger entries (double-entry: debit + credit).
- The hard constraints are **gateway rate limits** and **webhook bursts**, not raw QPS.
- Ledger storage grows with payments and is never mutated.

So the design optimizes for **exactly-once correctness**, not horizontal throughput.

## 3. Define APIs

```http
POST /payments                       Idempotency-Key: <uuid>
                                     { "amount": ..., "currency": ..., "method": ... }
                                     -> { paymentId, status }
GET  /payments/{id}                  -> status, attempts, ledger refs
POST /payments/{id}/refund           Idempotency-Key: <uuid>
POST /webhooks/{gateway}             (signed callback from the gateway)
```

The `Idempotency-Key` header is the contract that makes client retries safe.

## 4. Define the data model

- `Payment` — id, amount, currency, customer, status, idempotencyKey.
- `PaymentAttempt` — paymentId, gateway, gatewayRef, status, error.
- `LedgerEntry` — id, account, amount, direction, paymentId, createdAt. **Append-only.**
- `IdempotencyKey` — key → stored response, so a retry returns the same result.
- `WebhookEvent` — gateway, eventId, payload, processedAt.
- `Refund` — paymentId, amount, status.

The **ledger is the source of truth** for money; the `Payment` row is the workflow state; the gateway holds the actual charge.

## 5. Draw the high-level architecture

```text
Client ──Idempotency-Key──► Payment service ──► Idempotency store (key → response)
                                   │
                                   ├─► Ledger (append-only, strongly consistent)
                                   └─► Gateway adapter ──► external gateway
                                                                │ webhook (signed)
                                                                ▼
                                          Webhook handler ──► Ledger (settle)
                                                   ▲
                                   Reconciliation ─┘ (sweep gateway vs ledger)
```

The payment service writes an intent to the ledger, calls the gateway through an adapter, and waits for the webhook to settle. Reconciliation is the backstop.

## 6. Walk through the main request flow

1. Client calls `POST /payments` with an `Idempotency-Key`.
2. The service checks the idempotency store. If the key exists, it returns the **stored response** — no second charge.
3. Otherwise it creates a `Payment` in `PENDING`, writes a **ledger intent**, and calls the gateway adapter.
4. The gateway may respond synchronously or later. If it times out, the payment stays `PENDING` — we do **not** assume failure.
5. The gateway sends a **signed webhook**; the handler deduplicates by `eventId`, marks the payment `SUCCEEDED`/`FAILED`, and writes the **settling ledger entries**.
6. Reconciliation periodically compares gateway records with the ledger and fixes drift.

## 7. Identify bottlenecks

- **Gateway rate limits** — the external ceiling on how fast we can charge.
- **Webhook bursts** — a gateway can deliver a spike of callbacks.
- **Ledger writes** — must stay strongly consistent and ordered per account.
- **Hot accounts** — a merchant account with many concurrent payments.
- **Retry storms** — naive retries amplify load and risk double charges.

## 8. Scale each component

Scale the stateless payment service horizontally. Shard the **ledger by account** so a single account's entries stay ordered and consistent. Use a **webhook queue** with workers to absorb bursts and dedupe by `eventId`. Add gateway **connections/accounts** to raise the rate ceiling, and route by provider. The idempotency store is a fast, highly available key-value store.

## 9. Caching strategy

Cache **idempotency keys → responses** (short TTL, longer than the retry window). Do **not** cache balances or ledger state — read those from the ledger. Cache gateway configuration and routing. Cache nothing that could hide a money movement.

## 10. Database scaling and consistency

The ledger is **strongly consistent and append-only**; entries are never updated or deleted. Use **double-entry** bookkeeping: every payment writes balanced debits and credits, so the books always sum to zero. Balances are derived (or materialized with careful, auditable rebuilds). Shard by account with a single writer per account to preserve ordering. The `Payment` workflow table can be eventually consistent with the ledger, but the ledger never is.

## 11. Handle concurrency

The invariant: **a payment is charged at most once**. This is enforced by (a) the idempotency key preventing duplicate requests, and (b) the payment **state machine** allowing only legal transitions (`PENDING → SUCCEEDED` exactly once). Transitions use optimistic concurrency (compare-and-set on status) so two webhooks cannot both settle the same payment. Ledger entries are append-only, so concurrent writers add rows without contention.

## 12. Reliability and failure handling

- **Timeout after charge:** stay `PENDING`; never assume failure; let the webhook or reconciliation settle it.
- **Duplicate webhook:** dedupe by `eventId`; a replayed event is a no-op.
- **Gateway down:** retry with backoff and jitter through the adapter; respect rate limits.
- **Poison webhook:** dead-letter it for manual review.
- **Drift:** reconciliation compares the gateway's settlement report with the ledger and opens a correction entry — never edits history.

## 13. Availability versus consistency trade-offs

Money is **CP**: it is better to fail a request (return "try again") than to risk a double charge or a lost payment. The system fails **closed** — if the idempotency store or ledger is unavailable, it refuses the charge rather than guessing. Availability matters, but not at the cost of correctness.

## 14. Security

Never store raw card data; use gateway **tokenization** (PCI scope reduction). Verify **webhook signatures** and reject unsigned callbacks. Authenticate clients and authorize that a caller can only act on their own payments. Encrypt at rest and in transit; keep gateway secrets in a secrets manager; log without PII.

## 15. Monitoring and observability

Track payment success rate, end-to-end latency, **gateway error/timeout rate**, webhook processing lag and duplicate rate, idempotency-hit rate, ledger write latency, and **reconciliation drift** (gateway vs ledger). Alert on rising timeouts, a growing pending backlog, and any non-zero drift. Every money movement is auditable via the ledger.

## 16. Discuss trade-offs

| Choice | Why | Alternative | Trade-off |
|---|---|---|---|
| Idempotency keys | Safe client retries, no double charge | Best-effort retries | Simple, but double charges |
| Append-only ledger | Auditable, never lose history | Mutable balances | Simple reads, but no audit and easy to corrupt |
| Double-entry | Books always balance | Single-entry totals | Simple, but drift is undetectable |
| Async webhook settlement | Tolerates slow/timeout gateways | Block on the gateway response | Simpler, but timeouts look like failures |
| Fail closed | Correctness over availability | Fail open | More errors, but no wrong money |

## 17. Future improvements

Add multi-currency with FX, payouts, a dedicated ledger database (or an append-only log like a Kafka-backed ledger), stronger reconciliation automation, and multi-region active-active with per-account home regions. Add idempotency-key expiry policies and richer fraud signals.

## Interactive Visualizer

Raise the payment rate and watch the correctness path: the idempotency check, the strongly-consistent ledger, and the gateway adapter with its rate limit, plus the webhook handler and reconciliation backstop. Press **Scale up** to add payment nodes, ledger shards, gateway connections, webhook workers, idempotency nodes, or reconciliation workers and see what failed, what changed, and what improved.

<div
  id="payment-system-hld"
  class="hld payment-system-hld-visualizer"
></div>

## Interview recap

The interview answer is: "an idempotency key makes retries safe; the payment is a state machine that settles exactly once; the ledger is append-only double-entry and strongly consistent; the gateway sits behind an adapter; and webhooks plus reconciliation close the loop against timeouts and duplicates."

Likely follow-ups:

- The gateway times out after charging — how do you avoid charging twice?
- Why is the ledger append-only, and how do balances get computed?
- A webhook arrives twice — what happens?
- Why does the system fail closed when the ledger is unavailable?
