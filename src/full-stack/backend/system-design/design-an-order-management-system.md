# Design an order management system

## Detailed explanation

Design an order management system is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, design an order management system affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you design the order state machine?
- **The Engine Mechanism (Why it behaves this way):** Orders follow a strict state machine: pending → confirmed → processing → shipped → delivered → completed. Cancellation is allowed from pending/confirmed. Refunds create a parallel state: refund_requested → refund_processing → refund_completed. Each state transition is validated — you can't go from "pending" directly to "delivered." Transitions are recorded in an order_events table (order_id, from_state, to_state, timestamp, actor) for auditability. State transitions are triggered by events (payment confirmed, inventory allocated, carrier pickup) and processed asynchronously via a message queue.
- **The Unforgettable Mental Model:** The **Assembly Line**. A product moves through stations: raw materials (pending) → quality check (confirmed) → assembly (processing) → packaging (shipped) → delivery (delivered). You can't skip stations. At any point before packaging, you can pull the product off the line (cancel). Each station change is logged on the product's travel card (order_events).
- **The Trap:** Allowing arbitrary state transitions. Without a state machine, bugs can cause orders to jump from "pending" to "delivered" without payment or shipping. Always enforce valid transitions with a state machine library or database constraint.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd model orders as a finite state machine with states: pending → confirmed → processing → shipped → delivered → completed. Each transition is validated against a transition table — only allowed moves are permitted. Cancellation is allowed from pending and confirmed states. All transitions are logged in an order_events table for auditability. State changes are triggered by events (payment confirmed, inventory allocated) and processed asynchronously via Kafka. Invalid transitions throw an error and are logged for investigation."

#### How do you handle inventory reservation during order placement?
- **The Engine Mechanism (Why it behaves this way):** When an order is placed, inventory is temporarily reserved (not deducted) for a TTL (15-30 minutes). This prevents overselling while the payment is processed. Reservation uses a separate inventory_reservations table (product_id, quantity, order_id, expires_at). The available quantity = total_stock - reserved_quantity - sold_quantity. If payment succeeds, the reservation is converted to a sale (reserved → sold). If payment fails or expires, the reservation is released (reserved → available). A background job cleans up expired reservations. Optimistic locking or SELECT FOR UPDATE prevents race conditions when multiple orders try to reserve the same item.
- **The Unforgettable Mental Model:** The **Restaurant Table Reservation**. When you book a table (reserve inventory), it's held for you for 15 minutes. If you show up and pay (payment succeeds), the table is yours. If you don't show (payment fails/expires), the table is released for others. The host (system) tracks reserved vs. available tables to prevent double-booking.
- **The Trap:** Deducting inventory immediately on order placement. If the payment fails, you've lost inventory that's actually still available. Use reservation with TTL instead of immediate deduction.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use a reservation model. When an order is placed, inventory is reserved (not deducted) with a 15-minute TTL. Available quantity = total - reserved - sold. If payment succeeds, the reservation converts to a sale. If payment fails or expires, the reservation is released. A background job cleans up expired reservations. I'd use SELECT FOR UPDATE or optimistic locking on the inventory row to prevent race conditions. This prevents overselling while not permanently deducting inventory for failed payments."

#### How do you handle concurrent order placement for the same item?
- **The Engine Mechanism (Why it behaves this way):** Concurrent orders for limited-stock items require serialization. Options: (1) Database row-level locking (SELECT FOR UPDATE) on the inventory row — only one transaction can modify it at a time; (2) Redis distributed lock — acquire a lock on the product_id before checking/reserving inventory; (3) Queue-based serialization — all order requests for a product go through a FIFO queue, processed one at a time; (4) Optimistic concurrency control — use a version column on the inventory row, and retry if the version changed between read and write. The chosen approach depends on contention level — high contention (flash sales) needs queue-based serialization, moderate contention uses row-level locking.
- **The Unforgettable Mental Model:** The **Single-Lane Bridge**. Only one car (order) can cross the bridge (modify inventory) at a time. Cars line up (queue) and cross in order. If two cars arrive simultaneously, one waits (lock) until the other finishes. A traffic light (optimistic locking) lets cars go but sends them back if another car crossed while they were preparing.
- **The Trap:** Using check-then-act without locking. Reading available quantity, checking if sufficient, then reserving — without locking — allows two concurrent orders to both see sufficient stock and both succeed, causing overselling.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For moderate contention, I'd use SELECT FOR UPDATE on the inventory row — it serializes access at the database level. For high contention scenarios like flash sales, I'd use a Redis-based FIFO queue per product — all order requests are enqueued and processed sequentially. As a lighter alternative, optimistic concurrency control with a version column works well — if the version changed between read and write, the transaction retries. The key is ensuring that the check (is stock available?) and the act (reserve stock) are atomic."

#### How do you design the order API?
- **The Engine Mechanism (Why it behaves this way):** The API includes: POST /orders creates an order (validates cart, reserves inventory, creates payment intent); GET /orders/{id} returns order details with current status; POST /orders/{id}/cancel cancels an order (if allowed by state machine); GET /users/{id}/orders lists user's orders with pagination; POST /orders/{id}/refund initiates a refund. The create endpoint is idempotent (idempotency key in header). Order creation is asynchronous — the endpoint returns immediately with order_id and "pending" status, while the actual processing (inventory reservation, payment) happens in the background. The client polls GET /orders/{id} or receives a webhook when status changes.
- **The Unforgettable Mental Model:** The **Restaurant Order System**. You place an order (POST /orders), get an order number (order_id), and the kitchen starts preparing (async processing). You can check your order status (GET /orders/{id}), cancel before it's cooked (POST /cancel), or request your order history (GET /users/{id}/orders). The order number is your tracking reference.
- **The Trap:** Making order creation synchronous and waiting for payment to complete. Payment can take 10+ seconds. The API should return immediately with a pending status and process asynchronously.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The API has POST /orders for creation (idempotent with idempotency key), GET /orders/{id} for status, POST /orders/{id}/cancel for cancellation, and GET /users/{id}/orders for history. Order creation is async — the endpoint validates the cart, reserves inventory, creates a payment intent, and returns immediately with order_id and 'pending' status. Background workers process payment and update status. The client polls for status updates or receives webhooks. All endpoints require authentication, and order access is scoped to the owning user."

#### How do you handle order fulfillment and shipping integration?
- **The Engine Mechanism (Why it behaves this way):** When an order reaches "processing" status, a fulfillment worker picks items from inventory, packs them, and creates a shipping label via a carrier API (UPS, FedEx, DHL). The shipping API returns a tracking number, which is stored on the order. The order status transitions to "shipped." Webhooks from the carrier update the order status to "out_for_delivery" and "delivered." For multi-warehouse setups, the fulfillment service selects the optimal warehouse based on proximity to the customer and stock availability. Partial shipments are supported — an order can have multiple shipment records, each with its own tracking number.
- **The Unforgettable Mental Model:** The **Warehouse Dispatch Center**. Orders arrive at the center (processing status). Workers pick items from shelves (inventory), pack them (packing), and hand them to the shipping company (carrier API). The shipping company gives a tracking number. You can track the package's journey (webhooks) until it arrives at your door (delivered).
- **The Trap:** Not handling partial shipments. If an order has 3 items and only 2 are in stock at the nearest warehouse, the system should either split the shipment or wait for restock. Always support multiple shipment records per order.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Fulfillment is triggered when an order reaches 'processing' status. A worker picks items, creates a shipment record, and calls the carrier API for a shipping label and tracking number. The order status moves to 'shipped.' Carrier webhooks update the status through 'out_for_delivery' to 'delivered.' For multi-warehouse setups, I'd implement a warehouse selection algorithm based on proximity and stock. Partial shipments are supported — an order can have multiple shipment records, each with its own tracking. Failed label generation retries with exponential backoff."

#### How do you handle order cancellations and refunds?
- **The Engine Mechanism (Why it behaves this way):** Cancellation is allowed only in certain states (pending, confirmed). The cancellation flow: (1) Validate current state allows cancellation; (2) Release inventory reservations; (3) If payment was captured, initiate a refund via the payment provider; (4) Update order status to "cancelled"; (5) Log the cancellation event. Refunds follow the payment system's refund flow — idempotent, with status tracking. If the order has already shipped, cancellation is blocked and the user must initiate a return instead. A cancellation reason is stored for analytics. Concurrent cancellation and fulfillment are handled with row-level locking.
- **The Unforgettable Mental Model:** The **Return Policy Counter**. You can cancel before the product ships (pending/confirmed). The counter releases the reserved item back to the shelf (inventory release) and returns your money (refund). Once the product has shipped, you can't cancel — you must return it through the returns process instead.
- **The Trap:** Not releasing inventory on cancellation. If an order is cancelled but the inventory reservation isn't released, that stock is permanently unavailable. Always release reservations as part of the cancellation transaction.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Cancellation is allowed from pending and confirmed states. The flow is: validate state, release inventory reservations, initiate refund if payment was captured, update status to cancelled, and log the event. All steps are in a database transaction with row-level locking to prevent race conditions with fulfillment. If the order has shipped, cancellation is blocked and the user must use the returns flow. Refunds are processed through the payment provider with idempotency. Cancellation reasons are stored for analytics."

#### How do you scale order processing during peak events (Black Friday)?
- **The Engine Mechanism (Why it behaves this way):** Peak scaling involves: (1) Queue-based order processing — orders are enqueued and processed by workers at a controlled rate; (2) Inventory pre-warming — cache hot product inventory in Redis; (3) Payment provider rate limiting — distribute across multiple payment provider accounts; (4) Database read replicas — offload order status queries to replicas; (5) Circuit breakers — if the payment provider is overwhelmed, fail fast and queue orders for later processing; (6) Graceful degradation — allow order placement but show "processing may take longer than usual"; (7) Auto-scaling — add more worker instances based on queue depth. The key is decoupling order acceptance from order processing.
- **The Unforgettable Mental Model:** The **Amusement Park Ride**. During peak times, the park (system) lets people enter the queue (order queue) even if the ride (processing) is at capacity. The ride operator (workers) processes people at a steady rate. If the ride breaks (payment provider down), new people are still queued and the ride resumes when fixed. Extra operators (auto-scaled workers) are called in when the queue gets long.
- **The Trap:** Trying to process orders in real-time during peak events. The payment provider will rate-limit or timeout, causing order failures. Always queue orders and process at a sustainable rate.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd decouple order acceptance from processing. Orders are enqueued in Kafka and processed by workers at a controlled rate. Hot product inventory is pre-warmed in Redis. Payment requests are distributed across multiple provider accounts with circuit breakers — if a provider is overwhelmed, orders are queued for retry. Database read replicas handle status queries. Workers auto-scale based on queue depth. The frontend shows 'order received, processing' instead of 'order confirmed' during peak times. This ensures no orders are lost even if processing is delayed."

## 8. Active recall test

1. **What are the typical states in an order state machine?**
   - **Explanation:** pending → confirmed → processing → shipped → delivered → completed. Cancellation is allowed from pending/confirmed. Each transition is validated and logged in an order_events table for auditability.

2. **Why reserve inventory instead of deducting it immediately?**
   - **Explanation:** Reserving holds inventory for a TTL (15-30 min) while payment processes. If payment fails, the reservation is released and stock becomes available again. Immediate deduction would lose stock for failed payments.

3. **How do you prevent overselling when multiple orders target the same item?**
   - **Explanation:** Use SELECT FOR UPDATE (row-level locking) or a Redis distributed lock to serialize inventory checks and reservations. For flash sales, use a FIFO queue per product to process orders sequentially.

4. **Why make order creation asynchronous?**
   - **Explanation:** Payment processing can take 10+ seconds. A synchronous API would timeout. Instead, return immediately with order_id and "pending" status, then process inventory reservation and payment in the background.

5. **How do you handle partial shipments?**
   - **Explanation:** An order can have multiple shipment records, each with its own tracking number. This supports scenarios where items ship from different warehouses or some items are backordered.

6. **What happens during order cancellation?**
   - **Explanation:** Validate state allows cancellation, release inventory reservations, initiate refund if payment was captured, update status to cancelled, and log the event. All in a transaction with row-level locking.

7. **How do you handle peak event traffic (Black Friday)?**
   - **Explanation:** Decouple order acceptance from processing via a queue. Pre-warm hot inventory in Redis. Distribute payment requests across multiple providers. Auto-scale workers based on queue depth. Use circuit breakers for graceful degradation.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design an order management system in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design an order management system in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
