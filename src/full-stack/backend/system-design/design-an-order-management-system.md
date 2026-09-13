# Design an Order Management System (OMS)

## 1. Understand the Problem First — Clarify Before Designing

Imagine launching a flash sale for a limited sneaker drop or console release. Fifty thousand buyers slam the "Place Order" button in the exact same second for 500 units in stock. What happens if your system isn't bulletproof?

You charge 2,000 credit cards for 500 items, causing a massive overselling disaster. A network blip hits mid-checkout, leaving hundreds of customers charged with no order record created because a downstream inventory service crashed mid-flight. Webhooks from payment gateways arrive out of order or double-fire, spawning duplicate orders or double refunds. Customers call support furious, payment processors threaten chargeback penalties, and warehouse teams pack duplicate boxes.

An Order Management System (OMS) is the central nervous system of commerce. It orchestrates the entire lifecycle of a purchase from cart checkout, stock reservation, payment capture, and fraud evaluation, to warehouse picking, parcel shipping, delivery tracking, cancellations, and returns.

Before sketching boxes on the whiteboard, ask the interviewer these clarifying questions:

- **Scale and Traffic Patterns:** What is our peak throughput? Are we designing for a steady 500 orders per second, or do we need to absorb 10,000 orders per second during flash sales with 10 million active orders tracked daily?
- **Inventory and Fulfillment Model:** Is inventory centralized in a single warehouse, or distributed across multiple regional fulfillment centers? Can a single order be split into multiple shipments from different locations?
- **Checkout Latency vs. Consistency:** Is order placement synchronous (client waits for payment and inventory confirmation) or asynchronous (client receives an instant `202 Accepted` with an Order ID and receives status updates via WebSockets or polling)?
- **Payment Lifecycle:** Do we support two-phase payments (authorization at checkout, capture at fulfillment) or instant capture? What is the grace period for customer cancellations?
- **Audit and Retention:** Do we need a tamper-proof audit log of every state transition for financial compliance and disputes?

## 2. The Core Insight — The Decision Everything Else Flows From

The central challenge of an Order Management System is distributed state orchestration across unreliable network boundaries under extreme concurrency.

An order is not a single database row that you update inside a local ACID transaction. It is a long-running distributed workflow spanning checkout frontends, third-party payment gateways, distributed inventory caches, warehouse management systems, and shipping carrier APIs. Any of these systems can time out, crash, or reply out of order. Two-phase commit (2PC) distributed database transactions are out of the question because locking databases across network boundaries destroys availability and throughput.

The foundational design decision is to model the order lifecycle as an **Explicit Finite State Machine (FSM)** driven by an **Orchestrated Saga with a Transactional Outbox**.

Instead of letting individual services talk directly to each other in an uncoordinated chain, a central Order Saga Orchestrator drives state transitions forward step by step. Every transition is strictly validated against allowed state paths and recorded immutably in an append-only event ledger. If a downstream step fails (like a declined credit card), the orchestrator executes automated compensating transactions (releasing reserved stock) to return the system to a clean, consistent state.

## 3. High-Level Architecture — Components and Why Each Exists

Here is how the end-to-end order processing architecture fits together:

```txt
[Client Browser / Mobile App]
            │ (1) POST /api/v1/orders [Idempotency-Key: UUID]
            ▼
[API Gateway & Rate Limiter]
            │
            ▼
[Order Ingestion API] ──(2) Atomic DB Write──► [Order DB (PostgreSQL)]
                                                    │ (Orders + Outbox Table)
                                                    ▼ (CDC / Debezium)
                                            [Event Bus (Kafka)]
                                                    │
     ┌──────────────────────────────────────────────┴──────────────────────────────────────────────┐
     ▼                                                                                             ▼
[Order Saga Orchestrator]                                                               [Notification Service]
     │                                                                                             │
     ├─► (3) Step 1: Reserve Stock (Atomic TTL Hold) ──► [Inventory Service / Redis]               ▼
     │                                                                                        [WebSockets / Push]
     ├─► (4) Step 2: Authorize & Capture Payment     ──► [Payment Service / Stripe]
     │
     ├─► (5) Step 3: Hard Deduct & Allocate Stock    ──► [Inventory DB Ledger]
     │
     └─► (6) Step 4: Dispatch Fulfillment & Label    ──► [Warehouse WMS & Carriers]
```

**Why each component exists:**

- **API Gateway & Rate Limiter:** Authenticates requests, enforces token-bucket rate limits per user/IP, and verifies request payloads before they reach internal microservices.
- **Order Ingestion API:** High-throughput front door. It generates unique order identifiers, validates idempotency keys, persists the initial order in `CREATED` status, and responds immediately with `202 Accepted`.
- **Order Database (PostgreSQL):** Stores order headers, line items, and the Transactional Outbox table. Relational ACID storage guarantees strong consistency for order state transitions and unique constraints.
- **Transactional Outbox & CDC (Debezium):** Reads uncommitted outbox events directly from the PostgreSQL write-ahead log (WAL) and publishes them to Kafka with zero dual-write data loss risk.
- **Message Broker (Apache Kafka):** High-throughput event log partitioned by `order_id` to guarantee strictly ordered event processing for any given order.
- **Order Saga Orchestrator:** The brain of the workflow. It listens to order events, invokes downstream services sequentially, tracks timeouts, and triggers compensating rollbacks on failure.
- **Inventory Service (Redis Cluster + SQL Ledger):** Uses in-memory Redis keys with Lua scripts for microsecond atomic reservation holds during checkout, backed by a persistent relational inventory ledger.
- **Payment Service:** Interfaces with third-party payment gateways (Stripe, Adyen). Handles payment intents, tokenized transactions, retries, and asynchronous webhook ingestion.
- **Warehouse Fulfillment (WMS) & Carrier Gateway:** Allocates stock to specific warehouse bins, coordinates item picking and packing, and generates shipping labels with tracking numbers from carrier APIs (FedEx, UPS).
- **Notification Service:** Subscribes to order lifecycle events to send push notifications, emails, and real-time WebSocket updates to the buyer.

**End-to-End Request Walkthrough:**

1. The customer clicks "Place Order". The client generates a unique `Idempotency-Key` and sends `POST /api/v1/orders`.
2. The Order Ingestion API checks the idempotency key. In a single local PostgreSQL transaction, it inserts the order in `CREATED` status and writes an `OrderCreated` event into the `outbox` table. It immediately returns `202 Accepted` with the order payload and polling/WebSocket URL.
3. Debezium captures the outbox entry and publishes it to the `order-events` Kafka topic.
4. The Order Saga Orchestrator consumes the event and issues a soft-hold reservation command to the Inventory Service. Inventory atomically decrements available stock in Redis and creates a 15-minute TTL reservation hold.
5. With stock held, the Orchestrator commands the Payment Service to charge the card using the gateway's tokenized PaymentIntent.
6. When payment succeeds, the Orchestrator commands the Inventory Service to convert the soft hold into a permanent deduction (hard deduct) in the persistent ledger and updates the order status to `CONFIRMED`.
7. The Orchestrator routes the confirmed order to the Warehouse Fulfillment Service to begin physical picking, packing, and carrier label creation (`PROCESSING` -> `SHIPPED`).
8. Throughout each transition, the Notification Service broadcasts live status updates to the customer's open app session via WebSockets.

## 4. Key Technical Decisions — With Real Tradeoffs

**1. Saga Orchestration vs. Choreography**
- *Choice:* Saga Orchestration with a dedicated workflow coordinator (e.g., Temporal or an internal state engine).
- *Rejected:* Event Choreography (services emitting events and reacting independently without a central coordinator).
- *Tradeoff:* Choreography works well for tiny 2-step workflows, but for complex order lifecycles with 8+ states, multi-warehouse routing, cancellations, and partial refunds, choreography turns into an unmaintainable "event pinball" where no single service understands the global state. Orchestration introduces a centralized coordinator service, but gives you explicit state visibility, centralized timeout handling, and deterministic rollback paths.

**2. Inventory Soft Reservation (TTL Hold) vs. Immediate Hard Deduction**
- *Choice:* Two-phase soft reservation with an expiring Time-To-Live (TTL) hold, finalized on payment confirmation.
- *Rejected:* Hard-deducting stock immediately upon clicking checkout, or waiting to check stock until payment clears.
- *Tradeoff:* Deducting stock only after payment creates massive overselling during flash sales because thousands pay for the same last 5 items simultaneously. Immediate hard deduction locks up inventory if the user abandons payment or gets declined, requiring messy inventory restock jobs. A 15-minute soft hold reserves stock exclusively for that customer during checkout and automatically expires if payment is not completed.

**3. Primary Database: Relational (PostgreSQL) vs. Document NoSQL (MongoDB/DynamoDB)**
- *Choice:* PostgreSQL with partitioned tables and JSONB columns for extensible line-item attributes.
- *Rejected:* Pure DynamoDB or MongoDB for core order lifecycle state.
- *Tradeoff:* Orders require strict ACID transactions for state transitions, unique constraints on idempotency keys, and relational joins across order headers, line items, payments, and audit logs. While NoSQL offers easy horizontal write partitioning, eventual consistency during state transitions causes severe race conditions (e.g., a customer cancels an order at the exact millisecond the warehouse marks it shipped). PostgreSQL handles tens of thousands of write TPS with connection pooling (PgBouncer) and table partitioning by date/region while guaranteeing strong serializability.

**4. Event Reliability: Transactional Outbox Pattern vs. Dual Writing**
- *Choice:* Transactional Outbox with Change Data Capture (CDC via Debezium) streaming to Kafka.
- *Rejected:* Dual writing directly to PostgreSQL and Kafka in the application code.
- *Tradeoff:* Dual writing inevitably fails due to the dual-write problem: the database transaction commits, but the network dies before publishing to Kafka (or Kafka receives the event, but the DB rollback occurs), creating phantom or lost orders. The Outbox pattern writes the event into an `outbox` table in the exact same database transaction as the order record. Debezium tails the database transaction log and guarantees at-least-once delivery to Kafka.

## 5. Deep Dives — The Parts That Actually Matter

**The Order Finite State Machine (FSM) and Concurrency Control**

An order must move strictly through validated transitions. Skipping states or jumping backward without an explicit compensation path leads to corrupted business data.

The core order states are:
- `CREATED`: Order record initialized; awaiting stock reservation.
- `INVENTORY_RESERVED`: Stock temporarily locked under a TTL hold.
- `PAYMENT_PENDING`: Payment authorization/capture in flight.
- `CONFIRMED`: Payment captured and stock permanently allocated.
- `PROCESSING`: Transmitted to warehouse; picking and packing in progress.
- `SHIPPED`: Carrier tracking label generated; package in transit.
- `DELIVERED`: Carrier confirmed drop-off.
- `COMPLETED`: Return window elapsed; order finalized.

The terminal and compensation states are:
- `PAYMENT_FAILED`: Payment declined; inventory reservation released back to pool.
- `CANCELLED`: User or system initiated cancellation before warehouse dispatch.
- `RETURN_REQUESTED` / `REFUNDED`: Post-delivery return workflow.

To prevent concurrent race conditions (such as a customer clicking "Cancel" at the exact moment a payment webhook marks the order "Confirmed"), the database uses optimistic concurrency control with a `version` column:

```sql
-- Atomic state transition with version check
UPDATE orders
SET status = 'CONFIRMED',
    version = version + 1,
    updated_at = NOW()
WHERE id = 'ord_100293'
  AND status = 'PAYMENT_PENDING'
  AND version = 3;
```

If a competing process updated the row first, the row count returned is 0. The losing process fails the compare-and-swap check, re-reads the updated state from the database, and evaluates whether the transition is still valid according to the FSM transition matrix.

**High-Contention Inventory: The Flash Sale Engine**

When 50,000 requests per second target a single product with 100 units of stock, running `SELECT stock FROM inventory WHERE product_id = X FOR UPDATE` in SQL will lock the row, saturate database connection pools, and crash the database.

To handle high-contention inventory, split inventory into a fast in-memory reservation tier and an asynchronous database ledger:

1. *In-Memory Atomic Decrement:* Pre-warm inventory counts in Redis. Execute reservation via an atomic Lua script that verifies available stock, decrements the counter, and sets an expiring reservation key in a single atomic Redis operation:

```lua
-- Keys: KEYS[1] = product_stock_key, KEYS[2] = reservation_hold_key
-- Args: ARGV[1] = quantity, ARGV[2] = ttl_seconds
local available = tonumber(redis.call('get', KEYS[1]))
local requested = tonumber(ARGV[1])

if available and available >= requested then
    redis.call('decrby', KEYS[1], requested)
    redis.call('setex', KEYS[2], tonumber(ARGV[2]), requested)
    return 1 -- Reservation Successful
else
    return 0 -- Out of Stock
end
```

2. *Asynchronous Ledger Sync:* Successful Redis reservations push an `InventoryReserved` event into Kafka. Background workers consume the queue in batches and write the reservations into the PostgreSQL inventory ledger.
3. *TTL Sweeper / Release:* If the 15-minute payment window expires without confirmation, an active sweeper job (or Redis keyspace notification) increments the Redis stock counter and marks the ledger reservation as `EXPIRED`, making the units instantly available to other shoppers.

**End-to-End Idempotency and Webhook Handling**

Networks are unreliable, and clients retry aggressively. Every state-altering API endpoint and webhook consumer must be strictly idempotent.

1. *Client Request Idempotency:* Clients send a unique UUID in the `X-Idempotency-Key` header. The OMS maintains an `idempotency_keys` table:

```sql
CREATE TABLE idempotency_keys (
    key VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'IN_PROGRESS', 'COMPLETED'
    response_body JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (key, user_id)
);
```

When a request arrives:
- Attempt to insert `(key, user_id, 'IN_PROGRESS')`.
- If insertion fails on unique constraint: If status is `COMPLETED`, immediately return the cached `response_body` with HTTP `200/202`. If status is `IN_PROGRESS`, return HTTP `409 Conflict` or wait for completion.
- Process the order, update status to `COMPLETED` with the response body, and commit.

2. *Payment Webhook Deduplication:* Payment gateways (Stripe, Adyen) send webhooks for `payment_intent.succeeded` with their own unique `event_id`. The payment consumer checks a `processed_events` table before processing. If already present, it acknowledges with HTTP `200 OK` without re-triggering the state machine.

**Multi-Warehouse Split Shipments**

When an order contains multiple items (e.g., a laptop and a chair) located in different regional warehouses, the OMS splits the order into multiple Child Shipment Records under a single Parent Order. Each child shipment maintains its own independent state machine (`PICKING` -> `PACKED` -> `SHIPPED` -> `DELIVERED`), carrier tracking number, and label. The parent order status reflects an aggregate roll-up (e.g., `PARTIALLY_SHIPPED` until all child shipments are marked `SHIPPED`).

## 6. Failure Modes and Resilience

**1. Payment Gateway Timeout (The Ambiguous State)**
- *Failure:* The OMS sends a charge request to Stripe. The network drops after 10 seconds before a response is received. Is the customer charged or not?
- *Resilience:* Never guess and never blindly retry a charge without an idempotency key. The Saga Orchestrator places the payment step into a `PAYMENT_AMBIGUOUS` state. A background polling worker queries the gateway's `/v1/payment_intents/{id}` status endpoint using the deterministic order payment ID. If the charge succeeded, the orchestrator proceeds to confirm the order; if it failed or does not exist, the orchestrator safely retries or cancels the reservation.

**2. Distributed Cache (Redis) Failure or Cold Restart**
- *Failure:* The Redis cluster hosting inventory reservation counters crashes or loses in-memory data during a hardware failover.
- *Resilience:* Redis is treated as an accelerator, never the ultimate source of truth. The PostgreSQL `inventory_ledger` maintains an append-only log of every physical stock addition, hard deduction, and active reservation. On Redis failover, a cache warming service queries the database sum (`total_stock - active_reservations - fulfilled_orders`) and reconstructs the Redis stock keys before reopening traffic.

**3. Poison Pill Messages in Event Consumers**
- *Failure:* A corrupted order message with malformed JSON or invalid schema crashes the Kafka consumer worker repeatedly, blocking the entire topic partition.
- *Resilience:* Implement the Dead Letter Queue (DLQ) pattern. Wrap message processing in an error handler with exponential retries (e.g., 3 attempts at 1s, 5s, 15s intervals). If processing fails permanently, route the message to `order-events-dlq` along with error stack traces and metadata, raise an alert in PagerDuty/Datadog, and acknowledge the original message so the partition continues processing healthy orders.

**4. Concurrent User Cancellation vs. Warehouse Dispatch**
- *Failure:* A user clicks "Cancel Order" on the website at the exact moment a warehouse worker scans the parcel onto a delivery truck.
- *Resilience:* Enforce physical lock barriers in the FSM. Once an order reaches `PACKED` / `DISPATCHED_TO_CARRIER`, the cancellation transition is locked and permanently rejected by the state machine. The API responds with HTTP `422 Unprocessable Entity` ("Order has already shipped and cannot be cancelled"), automatically guiding the user into the post-delivery Return and RMA (Return Merchandise Authorization) flow instead.

## 7. What Makes a Great Answer vs an Average One

**An average answer:**
- Treats an order as a single database table updated by synchronous HTTP calls (`OrderService -> PaymentService -> InventoryService`).
- Suggests Two-Phase Commit (2PC) or ignores network partition failures and partial transaction rollbacks entirely.
- Deducts inventory immediately on checkout click, leading to phantom stock loss when users abandon payments.
- Does not mention idempotency keys or assumes third-party payment APIs and webhooks never time out or duplicate.
- Uses vague, generic microservices boxes without specifying database models, state machines, or caching mechanics.

**A great answer:**
- Defines an explicit, auditable Finite State Machine (FSM) with atomic transitions, optimistic locking, and an append-only event ledger.
- Separates high-contention traffic (Redis atomic Lua reservation holds with expiring TTLs) from the persistent relational inventory ledger.
- Designs an Orchestrated Saga with explicit forward steps and automated compensating rollbacks (e.g., releasing held stock if payment fails).
- Uses the Transactional Outbox pattern with Change Data Capture (CDC) to eliminate the dual-write problem between the database and the message broker.
- Designs for real-world production edge cases: payment gateway timeouts requiring active lookup reconciliation, out-of-order webhook deduplication, multi-warehouse split fulfillment, and dead letter queues for poison pill recovery.

## 8. 🧠 The Memory Hook

An Order Management System is an **air traffic control tower for money and physical goods**: it never updates state on blind trust, never lets two planes claim the same runway at the same time (atomic Redis Lua soft holds), and if the weather turns bad mid-flight, the central saga orchestrator safely diverts the plane and refunds the passenger with compensating transactions instead of crashing the runway.
