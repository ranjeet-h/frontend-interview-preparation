# Design a Payment System

## 1. Understand the Problem First — Clarify Before Designing

Imagine Black Friday at 11:59 PM. A customer clicks "Pay $150" for an order. The mobile network stutters right as the backend contacts the payment gateway. The customer sees a spinning wheel, panics, and taps "Pay" three more times. Did the bank charge the card once, four times, or zero times? Did the merchant record the order? A week later, the finance team discovers $40,000 in ghost charges, uncredited accounts, and dropped webhooks where cards were debited but orders were never shipped.

In most systems, a 99.9% success rate is acceptable. In payments, a 0.1% error rate on 1,000,000 daily transactions means 1,000 angry customers every single day with missing money or duplicate debits. You cannot build a payment system like a standard CRUD app.

Before drawing architecture boxes on the whiteboard, establish the operational boundaries and clarifying questions with the interviewer:

- **Core Capabilities (Functional Scope):**
  - **Pay-in flow:** Accept payments from buyers via credit cards, debit cards, and digital wallets.
  - **Pay-out flow:** Disburse funds to sellers, merchants, or partners.
  - **Ledger:** Record an auditable, immutable double-entry record of every cent moving through the platform.
  - **Reconciliation:** Match internal transaction records against external payment gateway and bank settlement files.
- **Scale and Traffic Profile:**
  - Scale: 10,000,000 transactions per day (~115 transactions per second average, with peak flash sale spikes of 3,000 to 5,000 TPS).
  - Data retention: Financial records must be retained for at least 7 years under legal and audit regulations.
- **Hard Constraints & Invariants:**
  - **Exactly-once processing:** A payment must never be executed twice, regardless of network retries, client double-clicks, or backend crashes.
  - **Zero data loss & high auditability:** Financial records must balance to the cent (`Debits = Credits`).
  - **PCI-DSS Compliance:** The system must never store or transmit raw credit card numbers (PANs) or CVVs directly on merchant application servers. Card capture must be isolated via hosted fields and tokenization.

## 2. The Core Insight — The Decision Everything Else Flows From

A payment system is not an API that wraps an external gateway; it is a distributed state machine coupled with an immutable accounting ledger that orchestrates untrusted, asynchronous third parties.

In distributed computing, networks are unreliable, servers crash mid-execution, and third-party Payment Service Providers (PSPs like Stripe or Adyen) take unpredictable amounts of time to respond. If your server dies after charging a customer's card but before saving the confirmation to your database, you cannot simply retry the charge on reboot without double-billing the user.

Therefore, the foundational decision that dictates the entire architecture is:

**Never update account balances in place, and never treat third-party network calls as atomic database transactions.**

Every single financial action must be driven by deterministic, client-originated idempotency keys, managed through distributed state machine transitions, and committed as balanced debit and credit entries in an immutable ledger. If a network timeout occurs, the system must never guess the outcome — it marks the state as pending, queries the provider deterministically, and relies on asynchronous reconciliation to guarantee ultimate consistency.

## 3. High-Level Architecture — Components and Why Each Exists

To handle payments reliably, the system separates card tokenization, payment orchestration, ledger recording, and background reconciliation into distinct components.

```txt
[Client App (Web / Mobile)] -- (1. Tokenize Card Data) ---------> [PSP (Stripe / Adyen)]
     |                                                                   ^
     | (2. Submit Payment with Token + Idempotency-Key)                  |
     v                                                                   |
[API Gateway & Rate Limiter]                                             |
     |                                                                   |
     v                                                                   |
[Payment Service (Orchestrator)] <--- (4. Authorize / Capture Charge) ---+
     |   |
     |   +---> [Payment DB (State Machine + Unique Idempotency Keys)]
     |   |
     |   +---> [Double-Entry Ledger DB (Immutable Debits & Credits)]
     |
     +-------> [Message Bus (Kafka / RabbitMQ)]
                     |
                     +---> [Fulfillment Service (Unlock Goods / Orders)]
                     +---> [Notification Service (Customer Receipts)]

[PSP Webhooks] ---> [Webhook Ingestion Service] ---> [Message Bus] ---> [Payment Service]

[PSP Settlement Files (SFTP/S3)] ---> [Reconciliation Service] <---> [Ledger DB]
```

- **Client App & Tokenization (Cardholder Data Isolation):** The user enters card numbers into an iframe or mobile SDK hosted directly by the PSP. The PSP returns a temporary payment token to the client. This keeps raw card details completely off our servers, reducing our compliance footprint to the lowest PCI-DSS tier (SAQ A).
- **API Gateway & Rate Limiter:** Authenticates requests, inspects client headers for mandatory `Idempotency-Key` UUIDs, and throttles abusive traffic before hitting payment workers.
- **Payment Service (Orchestrator):** The core engine. It manages the lifecycle state machine of each payment (`CREATED`, `PENDING`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `REFUNDED`), persists state transitions, and coordinates external calls.
- **Payment DB:** Relational database storing payment records, state transitions, and idempotency key locks with strict ACID guarantees.
- **Double-Entry Ledger Service & DB:** An append-only financial record tracking the movement of money across all customer, merchant, platform fee, and clearing accounts.
- **Payment Service Provider (PSP) Gateway Layer:** An abstraction layer that translates internal payment commands into provider-specific API calls (Stripe, Adyen, PayPal), handling retries, circuit breakers, and response parsing.
- **Webhook Ingestion Service:** An independently scalable endpoint that receives asynchronous event notifications from PSPs, verifies cryptographic HMAC signatures, deduplicates events, and enqueues them for worker processing.
- **Message Bus (Kafka):** Provides durable event streaming to decouple downstream actions (sending receipt emails, updating warehouse inventory, triggering merchant balance updates) from the critical payment path.
- **Reconciliation Engine:** A batch processing service that runs daily to download bank settlement files, matching external charges line-by-line with internal ledger entries to find and fix discrepancies.

**End-to-End Request Flow:**

1. The client tokenizes the credit card with the PSP and receives a token (e.g., `tok_123`).
2. The client submits a checkout request to our API Gateway with the token, amount, currency, and a client-generated UUID `Idempotency-Key`.
3. The Payment Service starts a database transaction: it inserts an idempotency record and creates a payment entry in `PENDING` state. If the key already exists, it returns the existing status without re-executing.
4. The Payment Service calls the external PSP API to authorize and capture the charge, forwarding the idempotency key.
5. Upon receiving a successful response from the PSP, the Payment Service updates the payment status to `CAPTURED`, writes matching debit and credit rows to the Ledger DB, and emits a `PaymentCompleted` event to the message bus.
6. Downstream consumers read the event to trigger inventory reservation and email the receipt to the customer.

## 4. Key Technical Decisions — With Real Tradeoffs

**1. Storage Engine: Relational Database (PostgreSQL) vs NoSQL (DynamoDB / Cassandra)**

- **Choice:** PostgreSQL with multi-AZ replication, strict ACID transactions, and row-level locking.
- **Rejected:** NoSQL document or wide-column stores.
- **Tradeoff:** NoSQL databases offer trivial horizontal partitioning and high write availability, but they provide eventual consistency and lack multi-table transactional guarantees. In payments, absolute consistency and serializability trump infinite write scale. At 10M transactions/day (~115 TPS), a properly configured, partitioned relational database handles the load easily without risking split-brain balances or phantom ledger rows.

**2. Financial Accounting: Double-Entry Bookkeeping vs Single Mutable Balances**

- **Choice:** Immutable double-entry bookkeeping ledger (every transaction records paired debit and credit lines; current balances are the sum of historical lines).
- **Rejected:** Mutable column updates (`UPDATE accounts SET balance = balance - 100 WHERE id = 1`).
- **Tradeoff:** Double-entry bookkeeping consumes significantly more disk storage and requires multi-row inserts for every transaction. However, mutating balances in place makes it impossible to audit where money came from or identify why a balance is incorrect after a race condition. Double-entry guarantees mathematically that money is neither created nor destroyed, providing a complete audit trail.

**3. Distributed Transaction Coordination: Orchestrated Saga vs Two-Phase Commit (2PC)**

- **Choice:** Orchestrated Saga pattern driven by the Payment Service state machine with explicit compensating transactions.
- **Rejected:** Two-Phase Commit (2PC) across microservices and external gateways.
- **Tradeoff:** 2PC locks database resources across all participating services until the transaction finishes. If an external PSP or network link is slow, 2PC holds locks, exhausts connection pools, and cascades failures across the entire system. The Saga pattern trades immediate atomic rollback for eventual consistency: each step executes locally, and if a downstream step fails (e.g., inventory out of stock), the orchestrator executes compensating actions (e.g., issuing an automated refund via the PSP).

**4. Processing Model: Synchronous Auth-Capture vs Asynchronous Webhook-Driven Finality**

- **Choice:** Hybrid approach — synchronous initial authorization with asynchronous webhook and reconciliation finality.
- **Rejected:** Pure synchronous processing where client waits for full bank settlement.
- **Tradeoff:** Bank clearing protocols (ACH, SEPA, credit card settlement batches) take hours to days to reach final settlement. Holding an HTTP connection open is impossible. Synchronously authorizing funds provides instant UI feedback to the buyer, while asynchronous webhooks and batch settlement files finalize the actual transfer of money.

## 5. Deep Dives — The Parts That Actually Matter

**Deep Dive 1 — The Three-Layer Idempotency Engine**

Network failures are inevitable. If a client sends a request and the connection drops before receiving the response, the client will retry. The system must guarantee that 1 request and 10 identical retries produce the exact same outcome.

Idempotency is implemented across three coordinated layers:

```txt
Layer 1: Client Gateway Key Check
  [Client] -- (Idempotency-Key: UUID-v4 + Payload Hash) --> [API Gateway]
                                                                  |
                                              [Check Redis / Key Cache]
                                              - Found & In-Flight -> 409 Conflict / Retry Later
                                              - Found & Completed  -> Return Cached Response

Layer 2: Database Unique Constraint & State Lock
  [Payment DB]
  INSERT INTO idempotency_keys (key, request_hash, status, response_body)
  VALUES ('key_abc', 'hash_123', 'PROCESSING', NULL)
  ON CONFLICT (key) DO NOTHING;
  --> If 0 rows inserted: Another worker owns the request.

Layer 3: Downstream PSP Forwarding
  [Payment Service] -- (Stripe-Idempotency-Key: 'key_abc') --> [PSP API]
  --> PSP guarantees external charge executes exactly once.
```

1. **Request Hashing:** When the API Gateway receives an `Idempotency-Key`, it computes a SHA-256 hash of the request payload (`user_id`, `amount`, `currency`, `order_id`). If the same idempotency key arrives with a *different* payload hash, the request is immediately rejected with a `400 Bad Request` to prevent key reuse fraud.
2. **Database Atomic Lock:** The service attempts an insert into the `idempotency_keys` table inside a short database transaction.
   - If the insert succeeds, the state is set to `PROCESSING` with a lease timeout (e.g., 60 seconds).
   - If a duplicate insert occurs while state is `PROCESSING`, the second request receives a `409 Conflict` or waits on a polling latch.
   - If the record already exists with status `SUCCEEDED`, the service skips processing entirely and returns the saved `response_body` directly from the database.
3. **PSP Idempotency Propagation:** The internal idempotency key is passed directly in the HTTP header to the PSP (e.g., `Idempotency-Key: key_abc`). Even if our backend crashes mid-call and retries after a restart, the PSP recognizes the key and returns the existing charge object instead of debiting the card a second time.

**Deep Dive 2 — Double-Entry Bookkeeping Ledger**

In real financial systems, money never sits in an isolated column. Money moves from one account to another. Every transaction consists of at least two ledger entries: a debit and a credit.

The fundamental accounting invariant that must hold true at every millisecond is:

$$\sum \text{Debits} = \sum \text{Credits}$$

Consider a customer paying $100 for an item, where the platform takes a $3 fee and the merchant receives $97:

| Entry ID | Transaction ID | Account | Type | Amount | Currency |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ent_101` | `txn_5001` | `Asset:PSP_Clearing` | **Debit** | $100.00 | USD |
| `ent_102` | `txn_5001` | `Liability:Merchant_Payable` | **Credit** | $97.00 | USD |
| `ent_103` | `txn_5001` | `Revenue:Platform_Fee` | **Credit** | $3.00 | USD |

- **Asset Account (`PSP_Clearing`):** Represents money owed to the platform by the payment processor. A debit increases this asset by $100.
- **Liability Account (`Merchant_Payable`):** Represents money the platform owes to the seller. A credit increases this liability by $97.
- **Revenue Account (`Platform_Fee`):** Represents earned platform income. A credit increases revenue by $3.
- **Sum Check:** Total Debits ($100) = Total Credits ($97 + $3 = $100). The ledger is balanced.

Ledger tables are strictly **append-only**. If a customer is refunded $100, the system never deletes rows `ent_101` through `ent_103`. Instead, it appends three compensating entries: credit `PSP_Clearing` ($100), debit `Merchant_Payable` ($97), and debit `Platform_Fee` ($3).

**Deep Dive 3 — The Daily Reconciliation Engine**

Webhooks can fail, network sockets can drop, and third-party systems can have internal bugs. You cannot rely on real-time API responses alone for 100% financial correctness. Reconciliation is the asynchronous verification layer that guarantees eventual consistency between your internal system and the banking world.

```txt
                    [Daily Batch Window (02:00 UTC)]
                                   |
         +-------------------------+-------------------------+
         |                                                   |
         v                                                   v
[Fetch Internal Ledger Entries]                   [Download PSP Settlement File]
  - Query transactions for T-1                      - Parse CSV/JSON from SFTP/S3
         |                                                   |
         +-------------------------+-------------------------+
                                   |
                                   v
                    [Three-Way Match Engine]
                                   |
         +-------------------------+-------------------------+
         |                         |                         |
         v                         v                         v
   [Exact Match]          [Discrepancy: Ghost Charge]   [Discrepancy: Missing Settlement]
   - Mark record          - PSP charged card, but       - Internal DB shows success,
     as RECONCILED          internal DB failed            PSP settlement missing
                                   |                         |
                                   v                         v
                          [Auto-Credit / Refund]      [Alert Finance & Operations]
```

1. **Settlement File Ingestion:** Every night at 02:00 UTC, the PSP drops an encrypted settlement file (CSV or JSON via SFTP / S3) containing every transaction that cleared the banking network in the previous 24 hours.
2. **Three-Way Matching Algorithm:** The engine streams settlement lines and performs a join against:
   - The Payment Service records (`payments` table).
   - The Double-Entry Ledger entries (`ledger_entries` table).
   - The PSP settlement report lines.
3. **Discrepancy Classification & Resolution:**
   - **Matched:** Transaction ID, amount, and currency match across all three sources. Status is updated to `RECONCILED`.
   - **Ghost Charge (Charged at PSP, missing in internal DB):** The PSP successfully billed the user, but our server crashed before persisting. The reconciliation job detects the external charge, generates an internal payment record, creates corresponding ledger entries, and notifies the order service to fulfill the purchase or automatically issues a refund.
   - **Missing Settlement (Internal DB marked paid, missing at PSP):** The internal system marked an order paid, but the PSP settlement report has no record of funds clearing. The engine marks the transaction as `DISPUTED` and pages the finance engineering team.
   - **Fee Discrepancy:** The PSP charged a different processing fee than estimated. The engine posts an adjusting ledger entry to the `Expense:PSP_Fees` account.

## 6. Failure Modes and Resilience

**Failure Mode 1: PSP Call Socket Timeout (The Black Box State)**

- **The Problem:** The Payment Service issues an HTTP POST to the PSP. The PSP charges the card, but before the HTTP response reaches our server, the network link drops or our server crashes. Our server does not know if the charge succeeded or failed.
- **The Mitigation:** The service must never assume failure and must never retry with a new key. The payment record remains in `PENDING` state. A background retry worker queries the PSP status using `GET /charges?idempotency_key=key_123` with exponential backoff and jitter. If the charge succeeded, the worker advances the state to `CAPTURED`. If the PSP confirms no charge was ever recorded for that key, the worker marks the payment `FAILED`.

**Failure Mode 2: Webhooks Delivered Out of Order or Duplicated**

- **The Problem:** A customer authorizes a payment, and shortly after requests a cancellation. The PSP sends two webhooks: `payment.authorized` and `payment.canceled`. Due to network routing, `payment.canceled` arrives *before* `payment.authorized`.
- **The Mitigation:** The Payment Service enforces a strict state machine with monotonic transition rules:
  - Allowed transitions: `CREATED -> PENDING -> AUTHORIZED -> CAPTURED -> REFUNDED`.
  - Illegal transitions (e.g., `REFUNDED -> AUTHORIZED` or `CAPTURED -> PENDING`) are rejected.
  - Every webhook is saved in a `processed_webhooks` table keyed on the PSP's unique `event_id`. Duplicate webhook deliveries are acknowledged with `200 OK` immediately and ignored by workers.

**Failure Mode 3: Downstream Service Failure During Saga Execution**

- **The Problem:** The customer is charged $100 successfully by the PSP, but when the Payment Service calls the Inventory Service to reserve the product, the inventory service crashes or reports that the item is out of stock.
- **The Mitigation:** The Saga Orchestrator triggers an automated compensating transaction. It dispatches an immediate API call to the PSP's `/refunds` endpoint using a deterministic refund idempotency key (`refund_key_123`), records the compensating ledger entries, marks the payment `REFUNDED`, and alerts the customer that the order could not be fulfilled and their money was returned.

**Failure Mode 4: Double Refund Race Conditions**

- **The Problem:** Two customer support agents open the same order simultaneously and both click "Issue Full Refund" of $100 at the exact same second.
- **The Mitigation:** The database schema tracks `amount_captured` and `amount_refunded` on the payment record. When executing a refund, the service uses row-level locking (`SELECT ... FOR UPDATE`) inside a database transaction and enforces a check constraint: `amount_refunded + new_refund <= amount_captured`. The second transaction attempts to refund, sees the remaining refundable balance is $0, and fails cleanly.

## 7. What Makes a Great Answer vs an Average One

| Dimension | Average Answer | Great Answer |
| :--- | :--- | :--- |
| **PCI Compliance** | Assumes the server accepts credit card numbers, CVVs, and expiry dates directly in an API request payload. | Isolates card data using PSP Hosted Fields and SDK tokenization, keeping the backend out of PCI-DSS scope entirely. |
| **Idempotency** | Mentions adding an `idempotency_key` column to a table without explaining race conditions or gateway propagation. | Explains the three-layer idempotency defense: request hashing, database unique constraint locks with state leases, and forwarding keys to the PSP. |
| **Ledger Model** | Uses a single mutable column: `balance = balance - amount`. | Implements an immutable double-entry bookkeeping ledger where every transaction creates balanced debit and credit entries (`Debits = Credits`). |
| **Distributed Failures** | Assumes API calls to payment gateways always return a clean HTTP 200 or 400. | Designs for socket timeouts, out-of-order webhooks, saga compensations, and in-flight pending state reconciliation. |
| **Settlement & Auditing** | Considers the payment complete the moment the gateway returns HTTP 200. | Details daily asynchronous three-way reconciliation against bank settlement files to catch ghost charges and uncredited funds. |

## 8. 🧠 The Memory Hook

In payments, you never mutate a balance and you never guess the outcome of a network call.

**Idempotency stops duplicates at the front door, double-entry ledgers track every cent through the house, and daily reconciliation catches the truth out back.**
