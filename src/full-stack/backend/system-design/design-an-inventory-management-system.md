# Design an inventory management system

## Detailed explanation

Design an inventory management system is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, design an inventory management system affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you track inventory across multiple warehouses?
- **The Engine Mechanism (Why it behaves this way):** Inventory is tracked per warehouse with a warehouse_stock table (product_id, warehouse_id, quantity, reserved_quantity, reorder_threshold). The total available quantity for a product is the sum across all warehouses. When an order is placed, the system selects the optimal warehouse based on: proximity to the customer, stock availability, and shipping cost. Stock transfers between warehouses are tracked as separate events (transfer_out, transfer_in) with a transfer_id linking them. Real-time stock levels are maintained in Redis for fast queries, with the database as the source of truth. Periodic reconciliation ensures Redis and database are in sync.
- **The Unforgettable Mental Model:** The **Chain Store Inventory**. Each store (warehouse) has its own stockroom. The headquarters (system) knows what's in each store. When a customer orders, the system picks the closest store with the item. If one store runs low, items are transferred from another store. The central dashboard (Redis) shows real-time stock across all stores.
- **The Trap:** Only tracking total inventory without per-warehouse breakdown. This makes it impossible to determine which warehouse should fulfill an order or to detect warehouse-specific stock discrepancies. Always track per-warehouse quantities.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd track inventory per warehouse in a warehouse_stock table with product_id, warehouse_id, quantity, and reserved_quantity. Total availability is the sum across warehouses. Order fulfillment selects the optimal warehouse based on proximity, stock, and shipping cost. Stock transfers between warehouses are tracked as linked events. Redis caches real-time stock levels for fast queries, with the database as the source of truth. A periodic reconciliation job ensures cache and database are in sync."

#### How do you prevent overselling during high-concurrency sales?
- **The Engine Mechanism (Why it behaves this way):** Overselling is prevented by serializing inventory modifications. For high-concurrency scenarios (flash sales), use a Redis-based inventory counter with Lua scripts for atomic decrement. The Lua script checks if quantity >= requested, decrements if yes, and returns success/failure — all in a single atomic operation. For lower contention, use database row-level locking (SELECT FOR UPDATE) with a reservation model. The key insight: the check (is stock available?) and the act (decrement stock) must be atomic. Distributed locks (Redlock) can also serialize access but add latency.
- **The Unforgettable Mental Model:** The **Ticket Booth**. There are 100 tickets (inventory). Each buyer (concurrent request) asks for tickets. The booth operator (Lua script) checks if enough tickets remain, hands them over, and updates the count — all in one motion. Two buyers can't get the same ticket because the operator handles one at a time atomically.
- **The Trap:** Using separate read and write operations for inventory. Reading stock, checking availability, then updating — without atomicity — allows two concurrent requests to both see sufficient stock and both succeed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For flash sales, I'd use Redis with Lua scripts for atomic inventory decrement. The Lua script checks available quantity and decrements in a single atomic operation — no race conditions possible. For normal traffic, I'd use database row-level locking (SELECT FOR UPDATE) with a reservation model. The critical principle is that the availability check and the stock modification must be atomic. I'd also implement a hard cap — never allow inventory to go below zero, even under extreme concurrency."

#### How do you handle stock reconciliation and discrepancy detection?
- **The Engine Mechanism (Why it behaves this way):** Stock discrepancies occur due to: system bugs, physical damage, theft, or counting errors. Reconciliation involves: (1) Cycle counting — regularly count a subset of SKUs (ABC analysis: A items counted monthly, B quarterly, C annually); (2) Full physical inventory — annual count of all items; (3) System reconciliation — compare physical count to system quantity and create adjustment entries; (4) Discrepancy investigation — track discrepancies by warehouse, product category, and time to identify patterns. Adjustment entries are logged in an inventory_adjustments table (product_id, warehouse_id, adjustment_quantity, reason, operator_id, timestamp) for auditability.
- **The Unforgettable Mental Model:** The **Bank Audit**. The bank (system) says it has $1M in the vault. The auditor (cycle count) physically counts the cash. If there's a difference (discrepancy), it's recorded in an adjustment ledger with the reason (counting error, theft, damage). High-value items (A items) are counted more frequently than low-value ones.
- **The Trap:** Not logging inventory adjustments. Without an audit trail, discrepancies can't be investigated and patterns can't be identified. Every adjustment must be logged with reason, operator, and timestamp.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd implement cycle counting with ABC analysis — high-value items (A) counted monthly, medium (B) quarterly, low (C) annually. Physical counts are compared to system quantities, and discrepancies create adjustment entries in an inventory_adjustments table with reason, operator, and timestamp. Full physical inventory happens annually. I'd track discrepancy patterns by warehouse, category, and time to identify systemic issues like theft or process problems. All adjustments require manager approval above a threshold."

#### How do you handle inventory for products with variants (size, color)?
- **The Engine Mechanism (Why it behaves this way):** Products with variants use a parent-child model: the parent product defines common attributes (name, description), and child SKUs represent each variant (product_id, sku, size, color, price, stock). Each SKU has its own inventory record in the warehouse_stock table. The product detail page aggregates stock across variants to show "in stock" status. When a variant goes out of stock, it's marked as unavailable but the parent product remains visible with other variants. Low-stock alerts are per-SKU, not per-product. The SKU is the unique inventory tracking unit, not the product.
- **The Unforgettable Mental Model:** The **Clothing Store Rack**. The rack (parent product) holds "T-Shirt" with different sizes and colors (child SKUs). Each size-color combination has its own stock count. The rack sign says "In Stock" if any combination is available. When Medium-Red sells out, that specific combination is marked unavailable, but the rack still shows other options.
- **The Trap:** Tracking inventory at the product level instead of the SKU level. A product with 3 sizes and 4 colors has 12 SKUs — each with independent stock. Product-level tracking would show "in stock" even if the customer's preferred variant is sold out.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use a parent-child model where the parent product defines common attributes and each variant is a child SKU with its own inventory record. The SKU is the inventory tracking unit — each size-color combination has independent stock. The product page aggregates variant availability to show overall 'in stock' status. When a variant sells out, it's marked unavailable but the product remains visible with other variants. Low-stock alerts and reorder thresholds are per-SKU. This gives granular inventory control while maintaining a clean product catalog."

#### How do you implement low-stock alerts and automatic reordering?
- **The Engine Mechanism (Why it behaves this way):** Each SKU has a reorder_threshold and reorder_quantity in the inventory record. When stock falls below the threshold (after a sale or adjustment), an event is published to a queue. A reorder worker consumes the event, checks if a purchase order already exists for this SKU (to prevent duplicate orders), and creates a purchase order if needed. The purchase order is sent to the supplier via API or email. When the supplier delivers, the receiving process updates inventory (quantity += received_quantity). For predictive reordering, use historical sales data to forecast demand and adjust reorder thresholds dynamically.
- **The Unforgettable Mental Model:** The **Smart Thermostat**. When the temperature (stock) drops below the set point (reorder_threshold), the thermostat automatically turns on the heat (creates a purchase order). It doesn't turn on the heat again if it's already running (duplicate check). A smart thermostat (predictive reordering) learns your patterns and adjusts the set point based on seasonal changes.
- **The Trap:** Creating duplicate purchase orders. If multiple sales trigger the low-stock event simultaneously, multiple purchase orders could be created. Use a deduplication check (existing purchase order for this SKU) before creating a new one.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Each SKU has a reorder_threshold and reorder_quantity. When stock drops below the threshold, an event is published to a queue. A reorder worker checks for existing purchase orders (deduplication) and creates one if needed. The PO is sent to the supplier via API. On delivery, inventory is updated. For advanced systems, I'd implement predictive reordering using historical sales data and seasonality to dynamically adjust thresholds. This prevents both stockouts and overstocking."

#### How do you design the inventory API?
- **The Engine Mechanism (Why it behaves this way):** The API includes: GET /inventory/{sku} returns stock levels across warehouses; GET /inventory/{sku}/availability checks if a SKU is available for a given quantity and location; POST /inventory/{sku}/reserve reserves stock for an order; POST /inventory/{sku}/release releases a reservation; POST /inventory/adjust creates a stock adjustment (requires approval); GET /inventory/low-stock returns SKUs below reorder threshold. The reserve and release endpoints are idempotent. Stock queries are served from Redis cache with the database as fallback. The API supports bulk operations for efficiency (check availability for multiple SKUs in one request).
- **The Unforgettable Mental Model:** The **Warehouse Control Panel**. The panel shows current stock levels (GET /inventory), lets you reserve items for orders (POST /reserve), release them if orders are cancelled (POST /release), adjust counts after physical inventory (POST /adjust), and see what needs reordering (GET /low-stock). You can check one item or a whole list (bulk operations).
- **The Trap:** Not supporting bulk operations. Checking availability for a cart with 20 items requires 20 API calls without bulk support. Always provide a bulk endpoint for common multi-item operations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The API has endpoints for stock lookup (GET /inventory/{sku}), availability checking (GET /availability), reservation (POST /reserve), release (POST /release), adjustments (POST /adjust), and low-stock alerts (GET /low-stock). Reserve and release are idempotent. Stock queries are served from Redis cache. I'd also provide bulk endpoints — POST /inventory/availability-check accepts an array of SKUs and quantities, returning availability for all in one request. This is critical for cart validation where multiple items need checking simultaneously."

#### How do you handle inventory for digital vs. physical products?
- **The Engine Mechanism (Why it behaves this way):** Physical products have finite stock tracked in the warehouse_stock table. Digital products (e-books, software licenses, subscriptions) have unlimited or quota-based stock. The inventory system handles both through a product_type field: "physical" products require warehouse stock tracking, "digital" products have unlimited stock (or a license quota). For digital products with quotas (e.g., 1000 software licenses), a separate digital_stock table tracks remaining licenses. The order processing flow branches based on product type — physical products trigger fulfillment and shipping, digital products trigger license key generation or account provisioning.
- **The Unforgettable Mental Model:** The **Store with Two Sections**. The physical section (warehouse) has shelves with finite items — when they're gone, they're gone. The digital section (cloud) has unlimited copies — like a song you can download infinitely. But some digital items have a limited edition run (quota) — like 1000 signed digital prints.
- **The Trap:** Treating digital products the same as physical products. Digital products don't need warehouse tracking, shipping, or stock reservations. Always differentiate product types in the inventory model.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd differentiate product types with a product_type field. Physical products use the warehouse_stock table with reservations and fulfillment. Digital products have unlimited stock by default, or a quota-based digital_stock table for limited licenses. Order processing branches by type — physical triggers warehouse picking and shipping, digital triggers license key generation or account provisioning. This keeps the inventory model clean and avoids unnecessary complexity for digital products."

## 8. Active recall test

1. **How do you track inventory across multiple warehouses?**
   - **Explanation:** Use a warehouse_stock table with product_id, warehouse_id, quantity, and reserved_quantity. Total availability is the sum across warehouses. Redis caches real-time levels. Order fulfillment selects the optimal warehouse by proximity and stock.

2. **How do you prevent overselling during flash sales?**
   - **Explanation:** Use Redis with Lua scripts for atomic inventory decrement — the availability check and decrement happen in a single atomic operation. For normal traffic, use database row-level locking (SELECT FOR UPDATE) with reservations.

3. **What is cycle counting and ABC analysis?**
   - **Explanation:** Cycle counting regularly counts a subset of SKUs. ABC analysis categorizes items by value: A items (high value) counted monthly, B quarterly, C annually. Discrepancies are logged in an audit trail with reason and operator.

4. **How do you handle product variants (size, color) in inventory?**
   - **Explanation:** Use a parent-child model. The parent product defines common attributes; each variant is a child SKU with independent inventory. The SKU is the inventory tracking unit, not the product.

5. **How do you prevent duplicate purchase orders during low-stock alerts?**
   - **Explanation:** When a low-stock event triggers, the reorder worker checks if a purchase order already exists for that SKU before creating a new one. Events are processed from a queue to ensure sequential handling.

6. **Why provide bulk inventory API endpoints?**
   - **Explanation:** Checking availability for a cart with multiple items requires many API calls without bulk support. A bulk endpoint (POST /inventory/availability-check) accepts an array of SKUs and returns availability for all in one request.

7. **How do digital products differ from physical products in inventory?**
   - **Explanation:** Physical products have finite stock tracked in warehouse_stock with reservations and fulfillment. Digital products have unlimited stock or quota-based tracking. Order processing branches by type — physical ships, digital provisions licenses.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design an inventory management system in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design an inventory management system in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
