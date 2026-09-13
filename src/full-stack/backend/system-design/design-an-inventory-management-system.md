# Design an Inventory Management System

## 1. Understand the Problem First — Clarify Before Designing

Imagine launching a flash sale at midnight for 10 units of a limited-edition sneaker. In the first three seconds, 40,000 customers hit the checkout button simultaneously. If your backend uses a standard database update like `UPDATE products SET stock = stock - 1 WHERE id = 123`, one of two catastrophic failures happens. Either your database threads suffer extreme row-level lock contention and exhaust the connection pool—bringing down the entire site—or race conditions slip through, allowing 400 people to pay for 10 pairs of shoes. You now have negative inventory, angry customers, furious customer support teams, and expensive payment refund fees.

An inventory management system is not a simple database counter. It is a distributed state engine that must guarantee zero overselling under extreme write contention while remaining resilient to abandoned carts, network timeouts, multi-warehouse routing, and physical warehouse shrinkage.

Before sketching boxes on a whiteboard, a senior engineer always clarifies five operational boundaries with the interviewer:

- **Traffic and Scale Profile:** What are our normal and peak requests per second (RPS)? Are we designing for everyday catalog browsing (read-heavy, 5,000 RPS) or a viral drop where a single SKU experiences 50,000 write RPS in two seconds?
- **Reservation Lifecycle:** What happens between adding an item to cart and completing payment? Do we hold stock immediately when the user clicks "Checkout", and for how long (e.g., a 10-minute hold with a countdown timer)?
- **Fulfillment Topology:** Is stock stored in a single centralized facility, or distributed across dozens of regional fulfillment centers and retail stores? Do we support split shipments if an order contains items from different warehouses?
- **Consistency Constraints:** Can catalog pages show slightly stale stock badges (e.g., "Only 3 left" cached for 5 seconds), or must stock availability be strictly consistent at the moment of checkout? (Answer: Eventual consistency for browsing, strict serializability for checkout reservation).
- **Physical vs. Digital Stock:** Are SKUs strictly physical goods with physical bin locations and barcode audits, or do we also manage digital license quotas?

```txt
Scale Baseline for this Design:
- Total SKUs: 1,000,000 active items across 50 regional warehouses.
- Read Volume: 20,000 queries/sec (Browsing, search, product detail pages).
- Peak Write Volume: 50,000 reservations/sec during flash sale events on hot SKUs.
- SLA: < 50ms latency for reservation checks, 99.999% correctness on zero overselling.
```

## 2. The Core Insight — The Decision Everything Else Flows From

The foundational insight of modern inventory design is that **inventory allocation must be split into a two-phase state machine with an immutable double-entry ledger**.

Phase 1 is an ephemeral, in-memory **Soft Reservation**. When a customer proceeds to checkout, the system claims a time-to-live (TTL) lease on that item inside a high-throughput, in-memory store like Redis using atomic operations. This protects user intent for 10 minutes without touching relational database locks or risking lock contention.

Phase 2 is a durable, transactional **Hard Deduction**. Once the payment gateway confirms successful capture, the system writes an immutable audit record to a relational database ledger and marks the reservation as fulfilled.

If the user abandons the checkout or payment fails, the volatile lease simply expires and returns the item to the available pool automatically. You never run database transactions during the volatile shopping cart phase, and you never rely on memory counters as your financial source of truth.

## 3. High-Level Architecture — Components and Why Each Exists

To handle millions of reads, tens of thousands of concurrent reservations, and strict financial auditability, the system separates fast volatile locks from durable persistent storage.

```txt
                      +-------------------+
                      |   Client / Web    |
                      +---------+---------+
                                |
                                v
                      +-------------------+
                      |    API Gateway    |
                      +---------+---------+
                                |
                                v
                   +-------------------------+
                   |  Inventory Service API  |
                   +----+---------------+----+
                        |               |
       [1. Fast Atomic  |               | [2. ACID Ledger &
        Soft Hold (TTL)]|               |  Hard Commit]
                        v               v
           +----------------+       +-------------------------+
           |  Redis Cluster |       | PostgreSQL (Primary DB) |
           | (Lua Scripts)  |       | - warehouse_stock       |
           +----------------+       | - inventory_ledger      |
                   ^                | - transactional_outbox  |
                   |                +------------+------------+
                   |                             |
         [Reconciliation Worker]                 | (CDC / Debezium)
                   |                             v
           +-------+--------+       +-------------------------+
           | Reconciliation | <-----+   Kafka Message Broker  |
           |     Engine     |       +------------+------------+
           +----------------+                    |
                                                 v
                                    +-------------------------+
                                    | Downstream Consumers    |
                                    | - Warehouse WMS Routing |
                                    | - Search Index Sync     |
                                    | - Supplier Reorder Bot  |
                                    +-------------------------+
```

Every component in this architecture has a specific, non-negotiable responsibility:

- **API Gateway & Rate Limiter:** Protects the internal inventory cluster from abusive bots, enforces token-bucket rate limits per user ID, and routes requests to healthy inventory service pods.
- **Inventory Service (Stateless API):** Exposes gRPC and REST endpoints for availability lookups, reservations, commits, and cancellations. Being stateless, it scales horizontally behind a load balancer.
- **Redis Cluster (Soft Reservation Engine):** Keeps in-memory stock counters and active reservation hashes. Runs atomic Lua scripts to evaluate availability and deduct items in single-digit milliseconds without distributed locking overhead.
- **PostgreSQL Database (Source of Truth):** The durable relational database storing warehouse catalog balances, active reservation states, and an append-only transaction ledger.
- **Transactional Outbox Table:** Lives inside the PostgreSQL database. Every state change writes an event record inside the exact same ACID database transaction, eliminating dual-write inconsistencies.
- **Change Data Capture (CDC / Debezium) & Kafka:** Streams committed events from the PostgreSQL write-ahead log directly into Kafka topics (`inventory.reserved`, `inventory.deducted`, `inventory.released`).
- **Warehouse Routing & Allocation Engine:** Evaluates shipping addresses, warehouse stock levels, carrier cut-off times, and shipping costs to assign order items to the optimal fulfillment facility.
- **Reconciliation Engine:** A background worker that continuously audits in-memory Redis counters against the relational ledger to catch and fix drift.

Here is the life of a typical checkout request end-to-end:

1. **Availability Check:** User views the product page. The browser queries the catalog cache (Redis read replica), returning cached stock availability in under 10ms.
2. **Soft Reservation:** User clicks "Proceed to Payment". The client sends a reservation request with an `idempotency_key`. The Inventory Service executes a Redis Lua script. Redis atomically checks if `available >= requested_qty`, decrements `available_stock`, increments `reserved_stock`, and stores a reservation record with a 10-minute TTL.
3. **Payment Processing:** The user enters credit card details on the client. The payment service talks to Stripe/Adyen. The inventory database is not locked or touched during this 3-to-5 second payment wait.
4. **Hard Deduction:** Payment succeeds. Payment service calls `POST /inventory/commit`. The Inventory Service starts a PostgreSQL transaction: it writes an immutable debit to `inventory_ledger`, updates `warehouse_stock`, marks the reservation as `FULFILLED`, and inserts an `InventoryDeducted` event into the `transactional_outbox`. The transaction commits.
5. **Downstream Fulfillment:** Debezium detects the outbox record and emits an event to Kafka. The Warehouse Management System (WMS) consumes the event, generates a pick-and-pack list for warehouse workers, and updates shipping carriers.

## 4. Key Technical Decisions — With Real Tradeoffs

### Decision 1: Concurrency Control Strategy
- **Option A: Relational Pessimistic Locking (`SELECT ... FOR UPDATE`).**
  - *Tradeoff:* Guaranteed consistency at the database level. However, under high write concurrency, incoming requests queue behind the locked row. 5,000 concurrent requests will cause connection pool starvation, transaction timeouts, and database CPU spikes to 100%. Rejected for high-traffic reservations.
- **Option B: Relational Optimistic Locking (`WHERE version = current_version`).**
  - *Tradeoff:* Does not hold database locks. But in a flash sale with 10,000 requests contending for 10 items, 9,990 transactions will fail validation and rollback. This causes massive wasted compute and application-level retry storms.
- **Option C: In-Memory Atomic Reservation via Redis Lua Scripts (Chosen).**
  - *Tradeoff:* Redis single-threaded event loop processes Lua scripts atomically with zero mutex locks. Can easily process 80,000 operations per second per shard with sub-millisecond response times. The tradeoff is maintaining synchronization between Redis memory state and PostgreSQL disk state.

### Decision 2: Ledger Design (Mutable Balance vs. Immutable Double-Entry)
- **Option A: Single Mutable Balance Column (`UPDATE warehouse_stock SET qty = qty - 1`).**
  - *Tradeoff:* Simple queries, minimal storage. But when physical inventory drifts (due to damage, loss, or race conditions), there is zero historical trace of why the number changed. Auditing is impossible.
- **Option B: Immutable Double-Entry Ledger (Chosen).**
  - *Tradeoff:* Every stock change is an immutable row in `inventory_ledger` with an amount, reference ID (order ID, return ID, purchase order ID), and event type (`HOLD`, `PURCHASE`, `RESTOCK`, `DAMAGE_WRITE_OFF`). The current stock balance is the sum of ledger entries, backed by periodic materialized snapshots. This mirrors banking systems and guarantees full regulatory and operational auditability.

### Decision 3: Cross-Service Communication (Direct Dual-Write vs. Transactional Outbox)
- **Option A: Direct Dual-Write (Update DB, then call `kafkaProducer.send()`).**
  - *Tradeoff:* If the service crashes or Kafka experiences a network glitch after the database transaction commits, the event is lost forever. Downstream warehouse systems never pack the order.
- **Option B: Transactional Outbox Pattern with CDC (Chosen).**
  - *Tradeoff:* The event is stored in an `outbox` table within the same database transaction that updates the ledger. A Debezium connector reads the PostgreSQL Write-Ahead Log (WAL) and publishes guaranteed at-least-once events to Kafka. Tradeoff: requires managing CDC infrastructure, but completely eliminates distributed data corruption.

## 5. Deep Dives — The Parts That Actually Matter

### Deep Dive 1: Atomic Soft Reservation via Redis Lua Script

When multiple items sit in a shopping cart, reserving inventory must be an atomic all-or-nothing operation. If a user tries to buy a shirt and pants together, we cannot reserve the shirt, find the pants out of stock, and leave the shirt stranded.

The Redis Lua script below checks availability for all requested items in the cart and atomically holds them with an auto-expiring lease:

```lua
-- KEYS: List of stock keys, e.g., ['stock:SKU-100:WH-1', 'stock:SKU-200:WH-1']
-- ARGV: [reservation_id, ttl_seconds, qty1, qty2, ...]

local reservation_id = ARGV[1]
local ttl = tonumber(ARGV[2])
local num_items = #KEYS

-- Step 1: Check availability for all requested SKUs
for i = 1, num_items do
    local requested_qty = tonumber(ARGV[2 + i])
    local current_stock = tonumber(redis.call('HGET', KEYS[i], 'available') or '0')
    if current_stock < requested_qty then
        -- Return failure with index of the out-of-stock item
        return {0, KEYS[i], current_stock}
    end
end

-- Step 2: All items available -> Deduct available and increase reserved
for i = 1, num_items do
    local requested_qty = tonumber(ARGV[2 + i])
    redis.call('HINCRBY', KEYS[i], 'available', -requested_qty)
    redis.call('HINCRBY', KEYS[i], 'reserved', requested_qty)
end

-- Step 3: Record reservation details with expiration
local res_key = 'reservation:' .. reservation_id
for i = 1, num_items do
    local requested_qty = tonumber(ARGV[2 + i])
    redis.call('HSET', res_key, KEYS[i], requested_qty)
end
redis.call('EXPIRE', res_key, ttl)

return {1, reservation_id}
```

Because Redis executes Lua scripts as a single atomic unit, no other read or write can intervene between the availability check and the counter decrement. Race conditions are mathematically eliminated.

### Deep Dive 2: Relational Data Model & Immutable Ledger

The durable storage layer in PostgreSQL uses a strict schema separating current location balances from immutable audit logs:

```sql
-- Warehouse Stock: Current snapshot per physical warehouse location
CREATE TABLE warehouse_stock (
    sku_id VARCHAR(64) NOT NULL,
    warehouse_id VARCHAR(32) NOT NULL,
    available_qty INT NOT NULL CHECK (available_qty >= 0),
    reserved_qty INT NOT NULL CHECK (reserved_qty >= 0),
    safety_stock_qty INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (sku_id, warehouse_id)
);

-- Active Reservations: Tracks the state of all customer holds
CREATE TABLE inventory_reservations (
    reservation_id UUID PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL, -- PENDING, COMMITTED, EXPIRED, CANCELLED
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Immutable Ledger: Append-only financial source of truth
CREATE TABLE inventory_ledger (
    entry_id BIGSERIAL PRIMARY KEY,
    sku_id VARCHAR(64) NOT NULL,
    warehouse_id VARCHAR(32) NOT NULL,
    delta_qty INT NOT NULL, -- Negative for outbound/sales, positive for inbound/returns
    balance_after INT NOT NULL,
    event_type VARCHAR(32) NOT NULL, -- 'SALE', 'RESERVATION_HOLD', 'RESTOCK', 'CYCLE_COUNT_ADJUST'
    reference_id VARCHAR(64) NOT NULL, -- Order ID, Return ID, or PO Number
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactional Outbox for guaranteed downstream event streaming
CREATE TABLE transactional_outbox (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(32) NOT NULL, -- 'INVENTORY'
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL, -- 'InventoryDeducted'
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ledger_sku_wh ON inventory_ledger (sku_id, warehouse_id, created_at DESC);
CREATE INDEX idx_reservations_status_expires ON inventory_reservations (status, expires_at) WHERE status = 'PENDING';
```

### Deep Dive 3: Multi-Warehouse Routing & Order Allocation

When a customer orders multiple items, the system determines which warehouse fulfills each item. The warehouse allocation engine balances three competing constraints:

1. **Split-Shipment Minimization:** Shipping an order in two separate boxes from different warehouses doubles courier fees and degrades customer experience.
2. **Geographic Proximity (Latency & Cost):** Fulfilling from the warehouse closest to the customer's delivery ZIP code reduces transit days and zone shipping surcharges.
3. **Safety Stock Buffer:** If Warehouse A has only 1 unit remaining and Warehouse B has 50 units, routing to Warehouse B avoids regional stockouts for local walk-in or same-day deliveries.

```txt
Fulfillment Allocation Algorithm:
1. Identify all warehouses with stock for the requested SKUs.
2. Find candidate subsets of warehouses that can fulfill the complete order:
   - Priority 1: Single warehouse that has ALL items in stock (Zero split).
   - Priority 2: Two warehouses with minimum total distance to shipping address.
3. If multiple candidates exist at the same split level, rank by:
   Score = (Distance_km * 0.4) + (Shipping_Cost * 0.4) - (Warehouse_Remaining_Stock * 0.2)
4. Select the highest-scoring warehouse plan and issue the reservation.
```

### Deep Dive 4: Deadlock Prevention in Multi-Item Checkouts

When two users concurrently purchase the same set of items in different order, database deadlocks can occur:
- User 1's transaction locks SKU-A, then attempts to lock SKU-B.
- User 2's transaction locks SKU-B, then attempts to lock SKU-A.
- Result: Database deadlock exception, aborting one or both transactions.

**The Solution:** Global Deterministic Lock Ordering.
Before acquiring any locks or executing reservation scripts across multiple SKUs, the application code sorts the SKU identifiers in ascending alphanumeric order (`SKU-001`, `SKU-002`, `SKU-003`). Both User 1 and User 2 will attempt to acquire locks in the exact same sequence (`SKU-A` then `SKU-B`). User 2 will simply block cleanly until User 1 finishes, completely eliminating circular lock wait graphs.

## 6. Failure Modes and Resilience

Every distributed system faces failure under production load. Here is how this architecture handles critical edge cases:

- **Redis Shard Crash During a Flash Sale:**
  - *Failure:* A Redis primary node crashes while holding 10,000 active soft reservations.
  - *Recovery:* Redis Sentinel or Redis Cluster promotes a replica within 3 seconds. Any reservation lost during asynchronous replication will fail gracefully at the checkout step: when the client attempts to commit payment, the backend verifies against the PostgreSQL ledger. If stock is actually unavailable, the payment is immediately voided and a user-friendly error is returned.
- **Cart Abandonment & Expired Holds (The Zombie Hold Problem):**
  - *Failure:* 1,000 users reserve sneakers and close their browser tabs. Stock is locked, preventing other users from buying.
  - *Recovery:* A lightweight Sweeper Worker runs every 30 seconds, querying `SELECT * FROM inventory_reservations WHERE status = 'PENDING' AND expires_at < NOW()`. It marks the database rows as `EXPIRED` and triggers a compensation Lua script in Redis to increment `available_stock` and decrement `reserved_stock`.
- **Payment Webhook Network Partition / Delay:**
  - *Failure:* Stripe takes 12 minutes to process a payment webhook, but the reservation TTL was 10 minutes. The reservation has expired and the stock was sold to someone else.
  - *Mitigation:* When the late payment webhook arrives, the system attempts to commit the reservation in PostgreSQL. If the reservation is already marked `EXPIRED` and `available_qty == 0`, the transaction safely rolls back and emits an `OrderFulfillmentFailed` event. The system automatically triggers an automated Stripe refund and emails the customer explaining that the item sold out due to a payment delay.
- **Cache and Database Drift (The Phantom Stock Problem):**
  - *Failure:* A network partition or missed event causes Redis counter `available` to read 15 while PostgreSQL ledger sum reads 12.
  - *Mitigation:* A background reconciliation job runs continuous cycle audits. Every hour, it calculates the true balance from PostgreSQL (`available_qty = total_physical - active_unexpired_holds`) and issues an atomic `SET` command to update the Redis counter, alerting engineers if drift exceeds 0.01%.

## 7. What Makes a Great Answer vs an Average One

In a system design interview, candidates often stay at the surface level. Here is what separates an average answer from a senior-level answer:

- **Average Answer:** "I'll store the stock in a MySQL table with a `stock` column and use `UPDATE products SET stock = stock - 1 WHERE id = 123 AND stock > 0`. For scaling, I'll put a Redis cache in front of it."
  - *Why it falls short:* Fails to address row lock contention during flash sales, does not handle cart hold timeouts, ignores multi-item checkout deadlocks, and has no auditability for lost stock.
- **Senior Answer:** Decouples volatile in-memory reservations from durable relational ledgers. Explains why Redis Lua scripts prevent race conditions during holds without distributed locks. Designs an append-only double-entry ledger for physical audit trails.
- **Average Answer:** Uses distributed locks (like Redlock) on every stock check and update.
  - *Why it falls short:* Distributed locks introduce high network latency, risk deadlock on process crashes, and crush throughput under high contention.
- **Senior Answer:** Uses atomic in-memory primitives (Lua scripts on Redis hashes) for single-node atomic execution per SKU shard, eliminating distributed lock overhead.
- **Average Answer:** Treats inventory as a single global number per product.
  - *Why it falls short:* Ignores variants (SKUs), physical fulfillment centers, shipping cost optimization, and regional split-shipment tradeoffs.
- **Senior Answer:** Models inventory at the SKU and Warehouse partition level, accounts for safety stock buffers, and explains the order-splitting allocation algorithm.

## 8. 🧠 The Memory Hook

**Hold fast in memory, commit permanently in the ledger.**

Use atomic Redis Lua scripts for high-speed, expiring soft reservations during checkout. Use an immutable PostgreSQL double-entry ledger with the transactional outbox pattern for durable, audited purchases. Always sort your SKU IDs before locking to kill deadlocks before they happen.
