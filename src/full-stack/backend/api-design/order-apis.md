# Order APIs

## Detailed explanation

Design order creation, payment state, status transitions, cancellation, and idempotency-safe operations. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Order APIs are state machines, not simple CRUD.

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

In production, order apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for orders?
- **The Engine Mechanism (Why it behaves this way):** Order endpoints: `POST /api/orders` (create), `GET /api/orders` (list user's orders), `GET /api/orders/:id` (read), `POST /api/orders/:id/cancel` (cancel), `GET /api/orders/:id/status` (check status). Admin endpoints: `GET /api/admin/orders` (list all), `POST /api/admin/orders/:id/refund` (refund). Orders are state machines, not simple CRUD.
- **The Unforgettable Mental Model:** The **Restaurant Order System**. You place an order (POST), check its status (GET status), cancel before cooking starts (POST cancel), and the kitchen moves it through states: pending → confirmed → preparing → shipped → delivered.
- **The Trap:** Treating orders as simple CRUD — orders have strict state transitions, inventory implications, and payment dependencies that make them far more complex.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Orders are state machines, not CRUD resources. I expose POST for creation, GET for listing and reading, and specific action endpoints like POST /orders/:id/cancel. Admin endpoints handle refunds and order management. The key design principle is that order status changes through defined transitions, not arbitrary updates."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** Create request: `{ items: [{ productId, quantity }], shippingAddress, paymentMethodId, idempotencyKey }`. Response: `{ success: true, data: { id, status: "pending", items, total, currency, createdAt }, payment: { clientSecret } }`. Status response: `{ success: true, data: { id, status, statusHistory: [{ status, timestamp }] } }`.
- **The Unforgettable Mental Model:** The **Order Receipt**. You hand in your order (request), get a receipt with order number and estimated time (response), and can check the status board (status endpoint) for updates.
- **The Trap:** Returning the full order object on every status check — only return the status and relevant metadata to minimize payload size.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The create request accepts items, shipping address, payment method, and an idempotency key. The response returns the order with a 'pending' status and payment client secret for completing payment. Status checks return only the current status and status history. The response shape is optimized for the specific use case — full details on create, lightweight on status checks."

#### What validations are required for order creation?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Items exist and are available for purchase; (2) Quantities are positive integers; (3) Inventory is sufficient (with reservation); (4) Prices are current (not stale cached prices); (5) Shipping address is valid; (6) Payment method is valid; (7) User is authenticated; (8) Order total is recalculated server-side, never trusted from client.
- **The Unforgettable Mental Model:** The **Order Verification Checklist**. Before accepting an order: item exists ✓, in stock ✓, price is current ✓, address is valid ✓, payment method works ✓, total is recalculated ✓.
- **The Trap:** Trusting the client-supplied order total — attackers can manipulate the total to pay less. Always recalculate server-side from current prices and quantities.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I validate that all items exist and are available, quantities are positive, inventory is sufficient with a reservation, prices are current, the shipping address is valid, and the payment method is active. Critically, I recalculate the order total server-side from current prices — I never trust the client-supplied total. Inventory reservation prevents overselling during the payment window."

#### What status codes can order APIs return?
- **The Engine Mechanism (Why it behaves this way):** Create: `201 Created` or `202 Accepted` (if async processing). Read: `200 OK` or `404 Not Found`. Cancel: `200 OK` or `409 Conflict` (if order is already shipped/delivered). List: `200 OK`. Validation errors: `400 Bad Request`. Authorization errors: `403 Forbidden` (viewing another user's order). Payment required: `402 Payment Required`.
- **The Unforgettable Mental Model:** The **Order Processing Board**. New order accepted (201), order being processed (202), order found (200), order not found (404), can't cancel shipped order (409), payment needed (402).
- **The Trap:** Returning 200 for an order that can't be cancelled — 409 Conflict correctly indicates the request conflicts with the current order state.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Create returns 201 or 202 for async processing. Read returns 200 or 404. Cancel returns 200 or 409 if the order state doesn't allow cancellation. I use 402 Payment Required when payment is needed. Authorization errors return 403 — users can only view their own orders. The status codes reflect the order's state machine behavior."

#### How do you secure order APIs?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Ownership enforcement — users can only access their own orders; (2) Server-side price calculation — prevent price manipulation; (3) Inventory reservation — prevent overselling; (4) Idempotency keys — prevent duplicate orders from retries; (5) Rate limiting — prevent order flooding; (6) Payment verification — webhook signature validation; (7) Audit logging — all order events recorded.
- **The Unforgettable Mental Model:** The **Secure Checkout Counter**. The cashier verifies your identity (ownership), calculates the total themselves (server-side pricing), reserves the items (inventory), and records the transaction (audit log).
- **The Trap:** Not verifying payment webhooks — without signature validation, attackers could forge payment confirmations and get orders fulfilled without paying.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I enforce strict ownership — users can only access their own orders. Prices are always calculated server-side. Inventory is reserved during the payment window. Idempotency keys prevent duplicate orders from network retries. Payment webhooks are verified with signature validation. Every order event is audit-logged for traceability."

#### How do you avoid duplicate or unsafe order operations?
- **The Engine Mechanism (Why it behaves this way):** Idempotency keys prevent duplicate order creation. Inventory reservation with a timeout prevents overselling — if payment isn't completed within the window, inventory is released. State transitions are validated: can't cancel a shipped order, can't refund an unpaid order. Database transactions ensure order creation and inventory reservation are atomic.
- **The Unforgettable Mental Model:** The **Concert Ticket System**. Each ticket purchase has a unique reference (idempotency key), seats are held temporarily (inventory reservation), and you can't refund a ticket after the concert starts (state validation).
- **The Trap:** Not releasing reserved inventory when payment fails or times out — this causes phantom stock where items appear unavailable but aren't actually sold.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use idempotency keys to prevent duplicate orders. Inventory is reserved with a timeout — if payment isn't completed within the window, the reservation expires and stock is released. State transitions are strictly validated. Order creation and inventory reservation happen in a single database transaction. A background job cleans up expired reservations."

#### How do you test order APIs?
- **The Engine Mechanism (Why it behaves this behavior):** Test scenarios: (1) Create order → 201, inventory reserved; (2) List orders → only user's orders; (3) View another user's order → 403; (4) Cancel pending order → success; (5) Cancel shipped order → 409; (6) Duplicate idempotency key → same order returned; (7) Insufficient inventory → 409; (8) Price manipulation attempt → server recalculates; (9) Payment webhook → order status updates; (10) Expired reservation → inventory released.
- **The Unforgettable Mental Model:** The **Full Order Lifecycle Test**. From creation through payment, fulfillment, cancellation, and refund — every path and edge case is verified.
- **The Trap:** Not testing the inventory reservation timeout — this is where overselling bugs occur when payment fails and stock isn't released.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test order creation with inventory reservation, ownership enforcement, state transition validation (cancel pending vs. shipped), idempotency key behavior, insufficient inventory handling, price recalculation, payment webhook processing, and inventory reservation timeout cleanup. The reservation timeout test is critical — it prevents overselling when payments fail."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: order created/cancelled/refunded (user ID, order ID, items, total, timestamp), inventory reserved/released, payment webhook received, state transitions. Metrics: orders per hour, conversion rate, average order value, cancellation rate, payment success rate, inventory reservation timeout rate. Alerts: payment failure spike, overselling detection, high cancellation rate.
- **The Unforgettable Mental Model:** The **Operations Command Center**. Every order event is tracked, conversion funnels are monitored, and anomalies like payment failures or overselling trigger immediate alerts.
- **The Trap:** Not tracking inventory reservation timeout rate — a high rate indicates the payment window is too short or the payment provider is having issues.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log all order events with full context: user ID, order ID, items, total, and timestamp. Metrics track order volume, conversion rate, average order value, cancellation rate, and payment success rate. I alert on payment failure spikes, any overselling detection, and high reservation timeout rates. These metrics directly impact revenue and customer experience."

## 8. Active recall test

1. **Why are orders state machines, not CRUD resources?**
   - **Explanation:** Orders have strict lifecycle rules — you can't cancel a shipped order or refund an unpaid one. State transitions must follow a defined flow, not arbitrary updates.

2. **What prevents duplicate order creation from network retries?**
   - **Explanation:** Idempotency keys — the client sends a unique key with each order request, and the server returns the same response for duplicate keys.

3. **Why recalculate order total server-side?**
   - **Explanation:** To prevent price manipulation — attackers could modify the client-supplied total to pay less. Server-side calculation from current prices is the source of truth.

4. **What happens to reserved inventory if payment fails?**
   - **Explanation:** The reservation expires after a timeout and inventory is released back to available stock — a background job handles the cleanup.

5. **What status code prevents cancelling a shipped order?**
   - **Explanation:** `409 Conflict` — the cancellation request conflicts with the current order state (already shipped).

6. **How do you ensure users can only see their own orders?**
   - **Explanation:** Ownership enforcement in the query layer — every order query includes a WHERE clause filtering by the authenticated user's ID.

7. **What status code is returned for async order processing?**
   - **Explanation:** `202 Accepted` — the order has been received and is being processed, but the final result is not yet available.

8. **Why verify payment webhook signatures?**
   - **Explanation:** To prevent forged payment confirmations — without signature validation, attackers could send fake webhooks to get orders fulfilled without paying.

9. **What metric indicates payment processing issues?**
   - **Explanation:** A spike in payment failure rate or high inventory reservation timeout rate — both indicate the payment flow is not completing successfully.

10. **What database pattern ensures order creation and inventory reservation are atomic?**
    - **Explanation:** A database transaction — both operations succeed or both fail, preventing orders without reserved inventory or reserved inventory without orders.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Order APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
