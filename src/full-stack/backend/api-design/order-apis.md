# Designing Order Processing APIs: State Machines, Distributed Transactions, and Pessimistic Inventory Locking

## 1. Why This Exists — The Problem First

Imagine launching a high-demand flash sale where 2,000 customers hit the checkout button in the exact same 100-millisecond window for the last 5 iPhone units. If your backend simply reads the inventory count (`stock = 5`), sees that it is greater than zero, authorizes the payment via Stripe, and writes back `stock = stock - 1`, congratulations: all 2,000 concurrent requests saw `stock > 0`. You just charged 2,000 credit cards for 5 physical phones, leaving your business with -1,995 inventory, thousands in non-refundable payment processing fees, chargebacks, and regulatory penalties.

Another disaster happens when a customer's credit card is successfully debited $1,200, but a transient network timeout disconnects the client right before your API can return a response. The order row remains stuck in `PENDING_PAYMENT`. The customer sees a red error toast, clicks "Pay Now" two more times, gets charged three times, and customer support gets flooded with angry dispute calls.

Or consider what happens when a customer clicks "Cancel Order" on their dashboard while the warehouse packaging line has already printed the shipping label and handed the parcel to the delivery driver. If your order endpoint was built as a naive `PATCH /api/orders/:id` with `{ status: "cancelled" }` without state machine validation, your system issues a full refund while the physical package travels straight to the customer's doorstep for free.

Order processing APIs are not simple CRUD endpoints. They are distributed, stateful financial coordination workflows. Concurrency is brutal, network partitions and third-party gateway failures are standard operating conditions, and real money and physical inventory are constantly on the line.

## 2. The Analogy — Make It Obvious

Think of an upscale restaurant operating a packed dinner service.

The coat check ticket (Idempotency Key): When you submit an order, the host hands you a unique ticket number stamped on your slip. If your waiter trips and accidentally asks the kitchen twice for table 4's dinner, the expediter sees ticket #104 is already on the board and ignores the second slip. You never get billed twice for one dinner.

The locked pantry safe (Pessimistic Row Lock & Atomic Inventory): The restaurant has exactly 5 portions of prime Wagyu steak left in a locked refrigerator. When a cook wants a steak, they physically unlock the fridge, take one steak, and adjust the chalk counter on the door. If five cooks rush the fridge simultaneously, they form a strict line. The sixth cook opens an empty safe and immediately tells the table it is sold out. Nobody sells a steak that is not physically inside the safe.

The 15-minute table hold timer (Reserve-on-Checkout TTL): When a patron calls to reserve a rare bottle of wine, the sommelier places a reserve tag on the bottle with a 15-minute kitchen timer. If the guest sits down and pays within 15 minutes, the bottle is opened. If the timer rings and nobody has paid, the sommelier removes the tag and puts the bottle back in the open cellar before the night ends.

The kitchen expediter's ticket rail (Finite State Machine): Tickets move strictly from left to right along slots on a metal rail: `DRAFT` -> `PENDING_PAYMENT` -> `PAID` -> `PROCESSING` -> `SHIPPED` -> `DELIVERED`. A line cook cannot slide a ticket backward from `DELIVERED` to `PENDING_PAYMENT`, nor can a waiter rip up a ticket if the dish has already left the kitchen doors.

The expediter's rollback protocol (Saga Pattern & Compensating Actions): If the kitchen reserves the steak and pours the wine, but the customer's credit card is declined at the table, the expediter triggers compensating steps: recork the wine, return the steak to available inventory, void the table ticket, and log the decline.

## 3. How It Actually Works — The Full Explanation

**1. The Order Lifecycle Finite State Machine (FSM)**

An order is not a generic database record with a mutable status column; it is a formal Finite State Machine (FSM). Every state change must be a valid, deterministic transition triggered by a verified domain event.

The standard e-commerce lifecycle contains six core forward states and three terminal or exit states:

- `DRAFT`: The customer is assembling their cart, selecting shipping options, and calculating taxes.
- `PENDING_PAYMENT`: Checkout is initiated. Inventory is temporarily reserved, payment intent is created with the payment gateway, and a timer starts.
- `PAID`: Payment gateway confirms successful capture. The order is legally binding and ready for fulfillment.
- `PROCESSING`: The warehouse has received the order. Items are picked, packed, and boxed. Cancellation is locked.
- `SHIPPED`: Carrier has picked up the package and assigned a tracking number.
- `DELIVERED`: Carrier webhook confirms successful dropoff at the customer's address (Terminal Success).
- `CANCELLED`: Terminal exit state. Allowed only from `DRAFT`, `PENDING_PAYMENT`, or `PAID` (before warehouse lock). Releases any reserved inventory.
- `EXPIRED`: Terminal exit state. Triggered when the payment window timer (e.g., 15 minutes) elapses without successful payment.
- `REFUNDED`: Terminal financial exit state. Occurs after payment capture (from `PAID`, `CANCELLED`, or post-delivery return).

```txt
[ DRAFT ] ───────────► [ PENDING_PAYMENT ] ───────────► [ PAID ] ───────────► [ PROCESSING ] ───────────► [ SHIPPED ] ───────────► [ DELIVERED ]
   │                          │                            │                        │
   ▼                          ▼                            ▼                        ▼
[ CANCELLED ]          [ EXPIRED / CANCELLED ]       [ CANCELLED / REFUNDED ]   [ REFUNDED ] (Post-return)
```

The server must reject any request that attempts an illegal jump—such as attempting to cancel an order that is already `SHIPPED` or marking an order `PAID` when it is in `DRAFT`. Such requests must immediately return `409 Conflict` or `422 Unprocessable Entity`.

**2. Inventory Allocation & Concurrency Strategies**

Handling inventory under high concurrency requires selecting the right locking strategy based on traffic profile and business constraints.

- Strategy A: Atomic Conditional SQL Update (Direct Decrement)
The simplest and fastest approach for single-item checkouts. Instead of reading stock into application memory, the database executes an atomic write conditioned on available stock:
`UPDATE products SET stock = stock - :qty WHERE id = :id AND stock >= :qty;`
The database engine acquires an exclusive row-level write lock for microseconds during the update. If the query affects 0 rows, the server knows inventory is depleted and aborts checkout without ever overselling.

- Strategy B: Pessimistic Row Locking (`SELECT ... FOR UPDATE`)
When an order contains multiple distinct items that must all be purchased atomically, conditional updates can leave carts partially fulfilled. Pessimistic row locking acquires exclusive locks on all product rows inside a single database transaction:
`SELECT id, stock, price FROM products WHERE id IN (:id1, :id2) ORDER BY id ASC FOR UPDATE;`
Every concurrent transaction attempting to read or write those rows is placed in a queue until the holding transaction issues `COMMIT` or `ROLLBACK`.
Crucial Rule: To prevent cyclic deadlocks (where Transaction 1 locks Product A and waits for Product B, while Transaction 2 locks Product B and waits for Product A), all product IDs must be sorted in ascending order before acquiring locks.

- Strategy C: Reserve-on-Checkout with TTL (Two-Phase Inventory)
High-volume platforms cannot hold database locks while a user spends 3 minutes typing credit card details into a checkout form. Instead, inventory is split into three buckets: `available_stock`, `reserved_stock`, and `sold_stock`.
When the customer clicks "Proceed to Checkout", the server moves items from `available_stock` to `reserved_stock` and writes an expiration timestamp (`expires_at = NOW() + INTERVAL '15 minutes'`).
If payment succeeds within 15 minutes, `reserved_stock` moves to `sold_stock`. If payment fails or the timer expires, a background reaper or Redis TTL event shifts `reserved_stock` back to `available_stock`.

**3. Idempotency & Duplicate Order Prevention**

Network requests are inherently unreliable. When a client experiences a timeout while waiting for `POST /api/v1/orders`, it cannot know if the server crashed before processing, during processing, or after charging the card.

Idempotency guarantees that submitting the same request multiple times produces the exact same side effects as submitting it once.

- Step 1: The client generates a unique `Idempotency-Key` (UUIDv4) and sends it in the HTTP request header.
- Step 2: The server attempts to store the key in Redis or PostgreSQL using an atomic lock: `SET idempotency:user_123:key_abc "PROCESSING" NX EX 120`.
- Step 3: If the key already exists with state `PROCESSING`, another identical request is currently executing; the server returns `409 Conflict` or asks the client to retry in a moment.
- Step 4: If the key already exists with state `COMPLETED`, the server retrieves the cached HTTP status code and JSON response body from the idempotency store and returns it immediately without re-executing business logic or re-charging payment.
- Step 5: If the key is new, the server processes the order, saves the resulting order ID, HTTP status code, and response body into the idempotency table, marks status as `COMPLETED`, and returns `201 Created`.

**4. Distributed Transactions: The Saga Pattern**

In microservice architectures, an order workflow spans multiple independent databases: Inventory Service, Payment Service, Fulfillment Service, and Notification Service. Traditional Two-Phase Commit (2PC / XA) distributed transactions create long-lived database locks across network boundaries, destroying availability and throughput.

The industry standard is the Saga Pattern: a sequence of local ACID transactions where each service updates its own database and triggers the next step.

- Orchestration-based Saga: A centralized Order Orchestrator service commands each participant:
  1. Step 1: Execute `InventoryService.reserveStock(orderId, items)`
  2. Step 2: Execute `PaymentService.chargeCustomer(orderId, amount)`
  3. Step 3: Execute `FulfillmentService.createShipment(orderId, address)`
  4. Step 4: Execute `NotificationService.sendReceipt(orderId, email)`

- Compensating Transactions (The Undo Mechanism):
If any step fails (e.g., Step 2 Payment Declined, or Step 3 Warehouse Allocation Error), the Orchestrator executes backward compensating transactions in reverse order:
  - Compensate Step 2: Refund payment if authorized (`PaymentService.refund`)
  - Compensate Step 1: Release reserved stock (`InventoryService.releaseStock`)
  - Mark order state as `CANCELLED` or `FAILED`.

## 4. Real Code — See It Working

Here is a complete, production-grade implementation of an Order State Machine, an Idempotency Guard, and an Atomic Checkout Transaction using TypeScript, Node.js, and PostgreSQL.

**1. The Order State Machine Definition & Transition Guard**

```typescript
// types/order-fsm.ts
export type OrderState =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED';

export type OrderEvent =
  | 'CHECKOUT_INITIATED'
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_EXPIRED'
  | 'FULFILLMENT_STARTED'
  | 'CARRIER_SHIPPED'
  | 'PACKAGE_DELIVERED'
  | 'USER_CANCELLED'
  | 'MERCHANT_REFUNDED';

// Transition table enforcing valid lifecycle pathways
const STATE_TRANSITIONS: Record<OrderState, Partial<Record<OrderEvent, OrderState>>> = {
  DRAFT: {
    CHECKOUT_INITIATED: 'PENDING_PAYMENT',
    USER_CANCELLED: 'CANCELLED',
  },
  PENDING_PAYMENT: {
    PAYMENT_SUCCEEDED: 'PAID',
    PAYMENT_FAILED: 'CANCELLED',
    PAYMENT_EXPIRED: 'EXPIRED',
    USER_CANCELLED: 'CANCELLED',
  },
  PAID: {
    FULFILLMENT_STARTED: 'PROCESSING',
    USER_CANCELLED: 'CANCELLED',
    MERCHANT_REFUNDED: 'REFUNDED',
  },
  PROCESSING: {
    CARRIER_SHIPPED: 'SHIPPED',
    MERCHANT_REFUNDED: 'REFUNDED', // Emergency refund before carrier pickup
  },
  SHIPPED: {
    PACKAGE_DELIVERED: 'DELIVERED',
  },
  DELIVERED: {
    MERCHANT_REFUNDED: 'REFUNDED', // Post-delivery return
  },
  CANCELLED: {}, // Terminal state
  EXPIRED: {},   // Terminal state
  REFUNDED: {},  // Terminal state
};

export class IllegalStateTransitionError extends Error {
  constructor(public currentState: OrderState, public event: OrderEvent) {
    super(`Invalid transition: Cannot apply event '${event}' to order in state '${currentState}'`);
    this.name = 'IllegalStateTransitionError';
  }
}

export function getNextOrderState(currentState: OrderState, event: OrderEvent): OrderState {
  const allowedTransitions = STATE_TRANSITIONS[currentState];
  const nextState = allowedTransitions ? allowedTransitions[event] : undefined;

  if (!nextState) {
    throw new IllegalStateTransitionError(currentState, event);
  }

  return nextState;
}
```

**2. Atomic Checkout Route with Deterministic Row Locking & Idempotency**

```typescript
// controllers/order-controller.ts
import { Request, Response } from 'express';
import { Pool, PoolClient } from 'pg';
import Redis from 'ioredis';
import { getNextOrderState } from './order-fsm';

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);

interface CartItemInput {
  productId: string;
  quantity: number;
}

export async function createOrderHandler(req: Request, res: Response) {
  const userId = req.user.id;
  const idempotencyKey = req.headers['idempotency-key'] as string;
  const { items, shippingAddress } = req.body as { items: CartItemInput[]; shippingAddress: string };

  if (!idempotencyKey) {
    return res.status(400).json({ error: 'Missing Idempotency-Key header' });
  }

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Cart must contain at least one item' });
  }

  const redisKey = `idempotency:${userId}:${idempotencyKey}`;

  // Step 1: Acquire 2-minute processing lock for idempotency
  const lockAcquired = await redis.set(redisKey, JSON.stringify({ status: 'PROCESSING' }), 'EX', 120, 'NX');
  if (!lockAcquired) {
    const existingRecord = await redis.get(redisKey);
    if (existingRecord) {
      const parsed = JSON.parse(existingRecord);
      if (parsed.status === 'PROCESSING') {
        return res.status(409).json({ error: 'Duplicate request currently in progress. Please wait.' });
      }
      // Return cached previous response
      return res.status(parsed.statusCode).json(parsed.body);
    }
  }

  const client: PoolClient = await db.connect();

  try {
    await client.query('BEGIN');

    // Step 2: Deterministic sorting of product IDs to eliminate database deadlocks
    const sortedProductIds = items.map((i) => i.productId).sort((a, b) => a.localeCompare(b));

    // Step 3: Pessimistic row locking on inventory rows
    const { rows: products } = await client.query(
      `SELECT id, title, price_cents, stock FROM products WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE`,
      [sortedProductIds]
    );

    if (products.length !== sortedProductIds.length) {
      throw new Error('One or more products not found');
    }

    const productMap = new Map(products.map((p) => [p.id, p]));
    let calculatedTotalCents = 0;
    const orderItemsToInsert: Array<{ productId: string; quantity: number; unitPriceCents: number }> = [];

    // Step 4: Validate stock and recalculate order total server-side
    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Product ${item.productId} missing`);

      if (product.stock < item.quantity) {
        await client.query('ROLLBACK');
        const conflictResponse = { error: `Insufficient inventory for '${product.title}'. Only ${product.stock} left.` };
        await redis.del(redisKey); // Clear lock to allow user to retry with lower quantity
        return res.status(409).json(conflictResponse);
      }

      calculatedTotalCents += product.price_cents * item.quantity;
      orderItemsToInsert.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPriceCents: product.price_cents,
      });

      // Reserve inventory by decrementing stock
      await client.query(
        `UPDATE products SET stock = stock - $1 WHERE id = $2`,
        [item.quantity, item.productId]
      );
    }

    // Step 5: Advance FSM from DRAFT to PENDING_PAYMENT
    const initialState = getNextOrderState('DRAFT', 'CHECKOUT_INITIATED');
    const reservationExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute TTL

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (user_id, status, total_cents, shipping_address, reservation_expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id, status, total_cents, reservation_expires_at, created_at`,
      [userId, initialState, calculatedTotalCents, shippingAddress, reservationExpiresAt]
    );

    const order = orderRows[0];

    // Insert line items with immutable price snapshot
    for (const lineItem of orderItemsToInsert) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES ($1, $2, $3, $4)`,
        [order.id, lineItem.productId, lineItem.quantity, lineItem.unitPriceCents]
      );
    }

    await client.query('COMMIT');

    const responsePayload = {
      success: true,
      order: {
        id: order.id,
        status: order.status,
        totalCents: order.total_cents,
        reservationExpiresAt: order.reservation_expires_at,
        items: orderItemsToInsert,
      },
    };

    // Step 6: Cache completed response in Redis with 24-hour retention
    await redis.set(
      redisKey,
      JSON.stringify({ status: 'COMPLETED', statusCode: 201, body: responsePayload }),
      'EX',
      86400
    );

    return res.status(201).json(responsePayload);
  } catch (error: any) {
    await client.query('ROLLBACK');
    await redis.del(redisKey); // Clear lock on hard failure
    return res.status(500).json({ error: error.message || 'Checkout failed' });
  } finally {
    client.release();
  }
}
```

**3. Payment Webhook Handler with Compensating Restock Actions**

```typescript
// controllers/webhook-controller.ts
import { Request, Response } from 'express';
import { Pool } from 'pg';
import { getNextOrderState } from './order-fsm';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function stripeWebhookHandler(req: Request, res: Response) {
  const event = req.body; // In production, verify event with stripe.webhooks.constructEvent()

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const orderId = paymentIntent.metadata.orderId;

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Order not found' });
      }

      const nextState = getNextOrderState(rows[0].status, 'PAYMENT_SUCCEEDED');
      await client.query(`UPDATE orders SET status = $1, paid_at = NOW() WHERE id = $2`, [nextState, orderId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object;
    const orderId = paymentIntent.metadata.orderId;

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: orderRows } = await client.query(
        `SELECT status FROM orders WHERE id = $1 FOR UPDATE`,
        [orderId]
      );

      if (orderRows.length > 0 && orderRows[0].status === 'PENDING_PAYMENT') {
        const nextState = getNextOrderState(orderRows[0].status, 'PAYMENT_FAILED');
        
        // Execute Compensating Transaction: Restore reserved inventory
        const { rows: items } = await client.query(
          `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
          [orderId]
        );
        for (const item of items) {
          await client.query(
            `UPDATE products SET stock = stock + $1 WHERE id = $2`,
            [item.quantity, item.product_id]
          );
        }

        await client.query(`UPDATE orders SET status = $1 WHERE id = $2`, [nextState, orderId]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return res.status(200).json({ received: true });
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How do you guarantee that an e-commerce API will never oversell items during a high-concurrency flash sale?**

To eliminate overselling, all inventory allocation must happen strictly inside the database transaction boundary using atomic primitives rather than application-memory validation. There are two primary techniques:

First, for single-item checkouts, use atomic conditional updates: `UPDATE products SET stock = stock - :qty WHERE id = :id AND stock >= :qty;`. The database engine's row-level write lock serializes all updates to that physical record. If 1,000 requests execute simultaneously, the database decrements the counter one by one; once stock hits 0, subsequent updates return 0 affected rows, allowing the application to immediately fail those checkouts safely.

Second, for multi-item checkouts where an order requires several products simultaneously, use pessimistic row locking (`SELECT ... FOR UPDATE`) inside a transaction with deterministic product ID sorting (`ORDER BY id ASC`). This locks all required rows in a single batch, validates total quantities, and commits the decrement atomically. If any single item lacks inventory, the entire transaction rolls back cleanly, leaving zero phantom reservations.

**Q: Why is Two-Phase Commit (2PC) rarely used across microservices for order processing, and what should you use instead?**

Two-Phase Commit (2PC) requires a central transaction coordinator to hold open distributed locks across all participating services (Inventory, Payment, Shipping) until everyone agrees to commit. In internet-scale distributed systems, 2PC creates catastrophic operational problems:
1. Long-held locks destroy system throughput and exhaust database connection pools.
2. If the coordinator or any network link fails during the prepare phase, resources remain permanently locked until manual administrator intervention.
3. Third-party external services like Stripe or FedEx cannot participate in XA/2PC transactions.

Instead, production architectures use the Saga Pattern with Compensating Transactions. In a Saga, each microservice executes its own local ACID transaction immediately and releases its locks. If a subsequent step fails (e.g., Stripe rejects the payment card), the orchestrator triggers explicit compensating transactions in reverse order (e.g., calling `InventoryService.releaseStock` and `OrderService.markCancelled`).

**Q: How do you implement robust idempotency on `POST /api/v1/orders` to prevent duplicate charges when network drops occur?**

Idempotency is implemented using an `Idempotency-Key` header supplied by the client (UUIDv4) and tracked in a distributed cache like Redis or a dedicated database table. The workflow consists of three distinct phases:

1. Mutex Acquisition: When the request arrives, the server executes an atomic `SET idempotency:<userId>:<key> "PROCESSING" NX EX 120`. If the key exists with status `PROCESSING`, a duplicate concurrent request is already running; the server returns `409 Conflict`.
2. Cache Hit: If the key exists with status `COMPLETED`, the server skips order creation entirely and immediately returns the previously saved HTTP status code and response payload.
3. Execution & Storage: If the lock is acquired, the backend executes the checkout transaction. Upon successful completion, it updates the Redis key with status `COMPLETED`, the HTTP status code (`201`), and the final JSON response body with a 24-hour TTL before responding to the client. If an unhandled exception occurs, the key is deleted so the user can immediately retry.

**Q: How do you prevent database deadlocks when two users checkout carts containing the same items in different order?**

A deadlock occurs when Transaction A locks Product 1 and requests a lock on Product 2, while Transaction B concurrently locks Product 2 and requests a lock on Product 1. Both transactions wait indefinitely on each other until the database deadlock detector kills one of them with an error.

The universal architectural fix is Deterministic Lock Ordering. Before acquiring locks with `SELECT ... FOR UPDATE`, the application must sort all product IDs in a canonical order (e.g., ascending lexicographical sort on UUID or integer ID). Because both Transaction A and Transaction B are forced to acquire locks in the exact same sequence (Product 1 first, then Product 2), Transaction B is cleanly queued behind Transaction A at the first lock, making cyclic dependency mathematically impossible.

**Q: What happens if a customer's payment succeeds on Stripe, but your server crashes before updating the order status to `PAID`?**

This is the classic dual-write distributed failure problem. You cannot execute a database commit and a third-party HTTP call in a single atomic transaction.

The architecture solves this through asynchronous Webhook Ingestion and Idempotent Reconciliation:
1. The synchronous checkout endpoint creates the order in state `PENDING_PAYMENT` and returns the Stripe `client_secret` to the client.
2. The client completes payment directly with Stripe elements.
3. The source of truth for payment completion is the asynchronous Stripe Webhook (`payment_intent.succeeded`).
4. When the webhook arrives, the server transitions the order from `PENDING_PAYMENT` to `PAID`.
5. If the webhook delivery is delayed or dropped, a periodic background reconciler queries the Stripe API for all orders in `PENDING_PAYMENT` older than 5 minutes and synchronizes the state machine.

**Q: Why must product prices and order totals always be recalculated server-side during order creation?**

Client requests can be easily inspected, modified, or forged by attackers using proxies or browser developer tools. If the server accepts a payload like `{ productId: "prod_123", price: 1.00, total: 1.00 }`, an attacker can purchase a $1,500 laptop for $1.00.

The server must treat all client input as untrusted. The checkout controller must accept only `productId` and `quantity`. It must fetch the authoritative price directly from the database within the transaction, calculate line item subtotals, apply server-validated discount rules, compute taxes based on validated shipping addresses, and derive the final charge amount. The client-provided total is never used for billing.

**Q: How do you handle order cancellations when fulfillment has already started?**

Order cancellation must be governed strictly by the Finite State Machine rules and fulfillment cutoff boundaries:

1. If the order is in `PENDING_PAYMENT` or `PAID` (prior to warehouse processing), cancellation succeeds synchronously: the FSM transitions to `CANCELLED`, payment is refunded via payment gateway API, and reserved inventory is returned to available stock.
2. If the order has transitioned to `PROCESSING` or `SHIPPED`, warehouse staff are already picking, boxing, or handing off the physical goods. A synchronous cancellation request must be rejected with `409 Conflict` and an explanation that the order has passed the cancellation cutoff.
3. The API directs the user to the Post-Delivery Return Flow: once the item is delivered (`DELIVERED`), the customer initiates a return merchandise authorization (RMA). Once the physical item is received and inspected at the warehouse, the order state transitions to `REFUNDED`.

## 6. The Traps — What Goes Wrong

**1. The Random Lock Ordering Deadlock**
- The Wrong Assumption: Developers assume wrapping `SELECT ... FOR UPDATE` around all cart items in whatever order the frontend sent them will safely lock the cart.
- Why It Fails: If User 1 sends `[Item_A, Item_B]` and User 2 sends `[Item_B, Item_A]`, their transactions acquire locks in opposing directions, creating an immediate cyclic lock wait. The database aborts one transaction with error code `40P01` (`deadlock_detected`).
- The Fix: Always sort item IDs programmatically before executing queries: `items.sort((a, b) => a.id.localeCompare(b.id))`.

**2. Webhook Out-of-Order Delivery & Phantom Overwrites**
- The Wrong Assumption: Developers assume payment webhooks always arrive after the synchronous checkout API route has finished committing the order.
- Why It Fails: Under heavy load, Stripe's webhook may reach your webhook worker before your checkout database transaction completes `COMMIT`. The webhook worker queries for the order ID, receives a 404, and drops the payment confirmation. Alternatively, an older `payment_intent.payment_failed` webhook could arrive after a newer `payment_intent.succeeded` webhook due to network retries.
- The Fix: Webhook handlers must be idempotent, verify event timestamps, and use the FSM transition table. If an order is not found, the webhook worker returns `500` or `422` so Stripe retries delivery with exponential backoff until the order record becomes visible.

**3. The Forgotten Reservation Reaper (Inventory Black Hole)**
- The Wrong Assumption: Developers create temporary inventory reservations with `expires_at = NOW() + 15 minutes` but only check expiration when the user visits the checkout page again.
- Why It Fails: If 500 users abandon checkout and never return to the website, their reserved inventory remains locked in the `reserved_stock` column forever. Available stock drops to zero, genuine buyers are turned away, and the business loses sales.
- The Fix: Run a scheduled background worker (e.g., every 60 seconds) that queries `SELECT id FROM orders WHERE status = 'PENDING_PAYMENT' AND reservation_expires_at < NOW()`, atomically returns stock to `available_stock`, and transitions the orders to `EXPIRED`.

**4. Naive Status Updates via Generic PATCH Routes**
- The Wrong Assumption: Developers expose a generic `PATCH /api/orders/:id` endpoint that accepts any status string from the client payload.
- Why It Fails: A malicious or buggy client can send `{ status: "PAID" }` without paying, or send `{ status: "CANCELLED" }` on an item that has already been delivered, triggering automatic refunds while keeping the product.
- The Fix: Ban generic status updates. Expose explicit, event-driven action endpoints (e.g., `POST /api/orders/:id/cancel`, `POST /api/orders/:id/fulfill`) that enforce authentication, authorization, and the strict FSM transition matrix.

## 7. Compare With Related Concepts

**Pessimistic Locking vs. Optimistic Locking**
- Pessimistic Locking (`SELECT FOR UPDATE`): Locks the database rows immediately upon reading and prevents any other transaction from touching them until completion. Best for high-contention flash sales where collisions are guaranteed; prevents wasteful transaction rollbacks at the cost of concurrency throughput.
- Optimistic Locking (`WHERE version = :expectedVersion`): Allows concurrent reads without locking; checks if the row version has changed during write time and aborts if conflicted. Best for low-contention environments (e.g., editing user profiles); fails poorly during flash sales because 99% of transactions abort and require expensive retry storms.
- Rule of Thumb: Use Pessimistic Locking with deterministic ID sorting for high-contention inventory checkout; use Optimistic Locking for back-office catalog edits.

**Saga Pattern vs. Two-Phase Commit (2PC)**
- Two-Phase Commit (2PC): Provides synchronous, strongly consistent ACID transactions across multiple databases via a central coordinator holding open distributed locks. Brittle, slow, and incompatible with third-party SaaS APIs.
- Saga Pattern: Provides eventual consistency across distributed microservices by executing local ACID transactions chained by domain events, relying on explicit Compensating Transactions to reverse state on failure.
- Rule of Thumb: Never use 2PC across microservices or third-party gateways; always use Sagas for distributed order orchestration.

**Reserve-on-Checkout vs. Deduct-on-Payment**
- Reserve-on-Checkout: Decrements inventory the moment the user enters checkout and starts a 15-minute timer. Guarantees the customer will not get an out-of-stock error after typing their credit card details, but requires an automated TTL reaper to clean up abandoned carts.
- Deduct-on-Payment: Leaves inventory untouched until Stripe confirms payment capture. Prevents inventory locking by trolls or abandoned carts, but causes terrible user experience when a customer gets charged only to be told the item sold out 2 seconds prior.
- Rule of Thumb: Use Reserve-on-Checkout with a strict 10–15 minute TTL for modern e-commerce.

**Orchestration Saga vs. Choreography Saga**
- Orchestration Saga: A dedicated central service (e.g., Order Orchestrator) explicitly invokes each microservice via RPC/REST and coordinates compensations. Easy to debug, trace, and monitor.
- Choreography Saga: Microservices publish and listen to domain events over Kafka/RabbitMQ without a central coordinator. Highly decoupled, but difficult to visualize workflows and trace cascading failure rollbacks.
- Rule of thumb: Use Orchestration when the order workflow involves more than 3 steps or requires strict compliance auditing.

## 8. 🧠 The Memory Hook

An order is a train on a one-way track: it can never reverse into `CANCELLED` once it has passed the `SHIPPED` switch. Punch an Idempotency Ticket at the gate to prevent duplicate boarding, lock the track switches in alphabetical order so trains never deadlock, and keep a 15-minute timer on every reserved seat before releasing it back to the station.
