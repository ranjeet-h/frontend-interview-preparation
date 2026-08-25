# Design a Food Delivery Backend (DoorDash / UberEats)

## 1. Understand the Problem First — Clarify Before Designing

A food delivery system is not standard e-commerce with a courier attached. In e-commerce, goods sit in a warehouse, shipping happens in batches, and a 30-minute delay is invisible. In food delivery, you are orchestrating a real-time, physical, three-sided marketplace—Customer, Restaurant (Merchant), and Courier (Delivery Partner)—around a perishable product that degrades in quality within minutes of leaving the kitchen.

If your backend dispatches a driver too early, the driver sits idle in a crowded parking lot for 20 minutes without pay while the food cooks, leading to driver churn. If you dispatch too late, hot food sits on a counter turning cold and soggy, resulting in customer refunds. If a restaurant runs out of rice during the dinner rush and cannot instantly toggle that item off across thousands of active browsing sessions, orders fail at checkout and kitchens get overwhelmed.

Before sketching components or selecting databases, clarify the operational boundaries with the interviewer:

- **Actors and Core Workflows:** Are we designing for all three actors? Yes: Customers (discover restaurants, customize menus, checkout, track live delivery), Restaurants (manage menus, toggle item availability, accept orders, signal preparation progress), and Drivers (stream GPS location, receive dispatch offers, navigate pickup and dropoff).
- **Scale and Traffic Profile:** Let us assume 10 million Daily Active Users (DAU), 1 million completed orders per day, 200,000 active restaurants, and 500,000 active drivers. Order volume is heavily bursty: 70% of traffic concentrates into two 2-hour windows (lunch 12:00–14:00 and dinner 18:00–20:00). Peak throughput reaches 15,000 requests per second for browsing and 2,500 orders per second at peak rush.
- **Latency and Freshness SLAs:** Driver location streaming must accept pings every 3–5 seconds per active courier with sub-second ingestion. Customer tracking updates must lag physical courier movement by no more than 3 seconds. Checkout transactions must be strictly consistent, while menu search and store listings can tolerate eventual consistency of 1–2 seconds.
- **Scope Boundaries:** We will focus on core marketplace coordination: dynamic ETA prediction, Just-In-Time dispatch optimization, real-time menu management with instant item 86'ing, order lifecycle state transitions, and live telemetry tracking. We will treat payment gateway processing and route calculation algorithms (e.g. OSRM or Google Maps API) as external black-box services.

## 2. The Core Insight — The Decision Everything Else Flows From

The foundational decision of a food delivery architecture is that **order acceptance must be completely decoupled from driver dispatch through an asynchronous, dynamic ETA-driven scheduling engine**.

In ride-hailing (like Uber or Lyft), the marketplace is two-sided: rider and driver meet at a curb immediately. Matching happens the moment the rider taps "Request". In food delivery, you have an intermediate, physical, variable-duration phase: **Kitchen Preparation Time ($T_{prep}$)**.

```txt
Ride-Hailing:    [ Rider Requests ] ------------> [ Dispatch Nearest Driver ]
                                                        |
                                                        v
                                                  (Driver Picks Up)

Food Delivery:   [ Order Placed ] -> [ Kitchen Prepares ($T_{prep}$) ] -> [ Food Ready ]
                                                    ^
                                                    | (Delayed JIT Dispatch)
                                                    v
                                     [ Dispatch Driver ($T_{travel}$) ] -> [ Driver Arrives ]
```

If you immediately match the nearest driver when an order is placed, and a pizza takes 35 minutes to bake while the driver is 5 minutes away, you waste 30 minutes of driver capacity.

Instead, the entire system is built around a calculated dispatch time:

$$T_{dispatch} = \text{Order Placed Time} + T_{prep} - T_{driver\_travel}$$

Everything in the system—the geospatial driver indexing, the order lifecycle state machine, the real-time telemetry pipelines, and the event-driven message bus—exists to keep kitchen readiness synchronized with courier arrival at the curb.

## 3. High-Level Architecture — Components and Why Each Exists

To handle the independent scaling requirements of high-frequency GPS tracking, heavy read-traffic for menus, and strict transactional consistency for orders, the architecture is split into targeted domain services.

```txt
+---------------------------------------------------------------------------------------------------+
|                                            CLIENT LAYER                                           |
|   [ Customer Mobile / Web ]           [ Restaurant Tablet App ]            [ Driver Mobile App ]  |
+-------------------+-------------------------------+-----------------------------------+-----------+
                    |                               |                                   |
                    | HTTPS / WSS                   | HTTPS / WSS                       | gRPC / WSS (GPS)
                    v                               v                                   v
+---------------------------------------------------------------------------------------------------+
|                                 API GATEWAY & LOAD BALANCER                                       |
|                            (Auth, Rate Limiting, TLS, Dynamic Routing)                            |
+---------+-------------------+---------------------+---------------------+-------------------------+
          |                   |                     |                     |
          v                   v                     v                     v
+-------------------+ +-------------------+ +-------------------+ +-------------------+
| Restaurant & Menu | |  Order Lifecycle  | |  Driver Location  | | Dispatch & Match  |
|      Service      | |      Service      | |  & Telemetry Svc  | |      Engine       |
+---------+---------+ +---------+---------+ +---------+---------+ +---------+---------+
          |                     |                     |                     |
          | Redis Menu Cache    | PostgreSQL (ACID)   | Redis H3 Spatial    | Delayed Task Queue
          | ElasticSearch Store | Outbox Table        | Time-Series Store   | Match Evaluator
          v                     v                     v                     v
+---------------------------------------------------------------------------------------------------+
|                                 DISTRIBUTED EVENT LOG (Apache Kafka)                              |
|          Topics: order.placed | order.accepted | food.ready | driver.assigned | order.completed    |
+-------------------------------------+-------------------------------------+-----------------------+
                                      |                                     |
                                      v                                     v
                            +-------------------+                 +-------------------+
                            | Real-Time Gateway |                 |  Dynamic ETA & ML |
                            | (WebSocket Pods)  |                 | Prediction Engine |
                            +-------------------+                 +-------------------+
```

**API Gateway (Envoy / Kong):** Terminates TLS, validates JWT tokens, handles path routing, and applies rate limiting per client IP and user ID to prevent scraping and denial-of-service during flash promotions.

**Restaurant & Menu Service:** Serves restaurant catalog data, operating hours, categories, items, and modifier options. Read traffic is 99% cached in Redis. Writes update the primary relational store and instantly invalidate cache entries.

**Order Lifecycle Service:** The single source of truth for order transitions. Executes atomic transactions for checkout, cancellation, and status updates. Uses PostgreSQL with row-level locks and the Transactional Outbox Pattern to guarantee that state updates and corresponding event notifications remain consistent.

**Driver Location & Telemetry Service:** Ingests raw GPS telemetry pings (latitude, longitude, bearing, speed) from active drivers every 3–5 seconds over persistent gRPC / WebSocket connections. Indexes driver locations in-memory using Uber H3 hexagonal spatial grids in Redis.

**Dispatch & Matching Engine:** Consumes order readiness events and runs matching algorithms within spatial batches. Evaluates candidate drivers within local H3 cells, scores them, and pushes time-bounded delivery offers (30-second window) to driver devices.

**Dynamic ETA & Prediction Engine:** Considers historical restaurant prep speeds, current ticket backlog, weather, traffic conditions, and courier transport mode (bicycle, scooter, car) to calculate $T_{prep}$ and $T_{travel}$.

**Real-Time Gateway (WebSocket Cluster):** Maintains persistent bidirectional connections with customer, merchant, and driver apps. Subscribes to Redis Pub/Sub channels keyed by `order_id` or `user_id` to fan out order status changes and driver coordinate streams.

**Distributed Event Log (Apache Kafka):** Serves as the asynchronous backbone. Decouples state changes from downstream side effects (push notifications, accounting entries, analytics ingestion, dispatch scheduling).

**End-to-End Request Flow: From Hunger to Delivery**

1. **Browsing and Cart Creation:** The customer queries the Menu Service. The menu is returned directly from Redis in under 15ms. The customer builds a cart locally.
2. **Checkout and Order Submission:** The customer submits the order. The Order Lifecycle Service opens a database transaction: validates item availability and prices against the real-time availability cache, authorizes payment through the Payment Gateway, inserts the order with status `PENDING_RESTAURANT`, and writes an `order.placed` record to the database Outbox table.
3. **Restaurant Acceptance:** An Outbox relay publishes `order.placed` to Kafka. The Real-Time Gateway pushes the order to the restaurant's tablet via WebSocket. The kitchen manager accepts the order and confirms or adjusts the estimated prep time ($T_{prep} = 22\text{ minutes}$). The Order Service transitions the order to `PREPARING` and emits `order.accepted`.
4. **Just-In-Time Dispatch Scheduling:** The Dynamic ETA Engine evaluates courier availability and traffic. If the estimated courier travel time to the restaurant is 6 minutes, the Dispatch Engine creates a scheduled trigger set for $22 - 6 = 16\text{ minutes}$ in the future.
5. **Driver Matching and Assignment:** When the timer triggers, the Dispatch Engine queries Redis H3 cells around the restaurant for available drivers. It ranks candidates by distance, acceptance history, and route efficiency. It sends an offer to the top-ranked driver. The driver accepts within 20 seconds. The order transitions to `DRIVER_ASSIGNED`.
6. **Pickup:** The driver arrives at the restaurant as the kitchen packages the meal. The restaurant staff taps "Order Ready", or the driver confirms pickup in the app. The order transitions to `IN_TRANSIT`.
7. **Live Tracking and Dropoff:** The driver's app streams GPS coordinates every 3 seconds to the Telemetry Service. The Telemetry Service publishes coordinates to a Redis Pub/Sub channel. The Real-Time Gateway pushes these coordinates down to the customer's open tracking screen. Once the driver arrives at the dropoff coordinates, they complete the delivery (with photo proof/PIN), transitioning the order to `DELIVERED`. The payment is captured, the driver's ledger is credited, and the order closes.

## 4. Key Technical Decisions — With Real Tradeoffs

**Decision 1: PostgreSQL with Partitioning and Outbox Pattern vs NoSQL (MongoDB/DynamoDB) for Order Lifecycle**
- *Choice:* PostgreSQL with date-range and regional partitioning, utilizing row-level optimistic locking (`version` column) and an Outbox table.
- *Considered and Rejected:* MongoDB or DynamoDB for the core order lifecycle.
- *Tradeoff:* In an order lifecycle, race conditions create financial liability. If a customer cancels an order at the exact millisecond a restaurant accepts it, or two dispatch workers try to assign the same courier, a document store with eventual consistency or complex multi-document transaction semantics risks phantom states. PostgreSQL provides strict ACID transactions and serialized isolation where needed. The tradeoff is horizontal write scalability; however, by partitioning order tables by region (e.g., `orders_us_east_nyc`) and active vs archived status (orders older than 7 days moved to cold storage), a single relational cluster easily handles thousands of writes per second while guaranteeing financial integrity.

**Decision 2: Uber H3 Hexagonal Hierarchical Indexing in Redis vs PostGIS Spatial Queries for Driver Matching**
- *Choice:* In-memory spatial indexing using Uber H3 discrete hexagonal cells stored in Redis Set data structures.
- *Considered and Rejected:* Executing spatial SQL queries (`ST_DWithin`) against a PostGIS database for real-time driver matching.
- *Tradeoff:* 500,000 active drivers sending GPS coordinates every 3 seconds generate over 150,000 writes per second. Executing point-in-polygon or distance queries on a relational disk database at this write frequency causes massive I/O contention and lock thrashing. Uber H3 converts continuous latitude/longitude coordinates into a 64-bit integer representing a fixed hexagonal cell (e.g., Resolution 8, covering ~0.7 square kilometers). Driver locations are stored in Redis as `HSET driver:locations {driver_id} "{h3_index}:{lat}:{lng}"` with reverse lookup sets `SADD h3:drivers:{h3_index} {driver_id}`. Finding nearby drivers requires computing the $k$-ring neighbor hexagons in application memory ($O(1)$) and running `SMEMBERS` across those few Redis keys. This achieves sub-5ms lookup latencies at the cost of managing dual-index synchronization in memory.

**Decision 3: WebSockets with Redis Pub/Sub vs Client HTTP Polling for Live Telemetry Tracking**
- *Choice:* Long-lived WebSocket connections managed by a stateless gateway cluster, backed by Redis Pub/Sub for room-based message distribution.
- *Considered and Rejected:* Short HTTP polling (e.g. client requesting `/orders/{id}/location` every 3 seconds) or Server-Sent Events (SSE).
- *Tradeoff:* With 1 million concurrent active users tracking deliveries, short polling generates over 330,000 HTTP requests per second. Every HTTP request requires header parsing, TLS negotiation overhead, and authentication validation, saturating API gateway CPU. Persistent WebSockets maintain an established TCP socket where payload frames are small raw JSON blobs (< 100 bytes). WebSockets also provide a full-duplex channel, allowing the driver app to stream location telemetry upstream while simultaneously receiving incoming order offers downstream over the same connection. The cost is stateful connection management: when a WebSocket pod restarts, thousands of clients reconnect at once, requiring backoff jitter to prevent thundering herd problems.

**Decision 4: Just-In-Time (JIT) Staged Scheduling vs Immediate Greedy Matching**
- *Choice:* Dynamic delayed dispatch scheduling driven by restaurant preparation estimates and routing distance.
- *Considered and Rejected:* Immediate Greedy Matching (assigning the nearest available courier the moment the customer checks out).
- *Tradeoff:* Immediate matching is trivial to implement—it is a simple queue consumer. However, it severely damages marketplace efficiency. Couriers spend an average of 15 to 20 minutes standing inside restaurants waiting for meals, slashing their hourly earnings and causing them to reject future orders. JIT dispatch increases algorithmic complexity: the system must manage delayed timers, handle changing prep time estimates mid-cook, and absorb the risk that a courier might not be immediately available 15 minutes later. However, JIT dispatch cuts driver wait time to under 4 minutes, maximizing fleet utilization and food temperature quality.

## 5. Deep Dives — The Parts That Actually Matter

**Deep Dive 1: The Just-In-Time Dispatch Engine & Batch Matching Algorithm**

Instead of matching single orders to single drivers in isolation (which creates sub-optimal local maximums), modern dispatch engines use **Batch Window Optimization**.

```txt
+---------------------------------------------------------------------------------------------------+
| 10-SECOND DISPATCH EPOCH                                                                          |
|                                                                                                   |
|  Unassigned Orders Ready for Dispatch             Available Candidate Drivers in Spatial Cluster  |
|  [ Order A (Pizza) - Ready in 4m ]                [ Driver 1 (Car) - 3m from A, 8m from B ]       |
|  [ Order B (Sushi) - Ready in 2m ]                [ Driver 2 (Bike) - 5m from A, 2m from B ]      |
|  [ Order C (Burger) - Ready in 5m ]               [ Driver 3 (Scooter) - 1m from C ]              |
|                                                                                                   |
|                     +---------------------------------------+                                     |
|                     | BIPARTITE MATCHING OPTIMIZATION MATRIX |                                     |
|                     | Maximize: Courier Utilization & Speed  |                                     |
|                     | Minimize: Total Delivery & Wait Time   |                                     |
|                     +-------------------+-------------------+                                     |
|                                         |                                                         |
|                     Match Results:      v                                                         |
|                     Order A <---> Driver 1  (Arrival in 3m ~ Prep 4m)                             |
|                     Order B <---> Driver 2  (Arrival in 2m ~ Prep 2m)                             |
|                     Order C <---> Driver 3  (Arrival in 1m ~ Prep 5m, bundled with dropoff)       |
+---------------------------------------------------------------------------------------------------+
```

Every 10 seconds (the dispatch epoch), the engine gathers all orders within an urban zone whose target dispatch time falls within the next window ($T_{dispatch} \le T_{now} + 30s$).

For each order $O_i$ and candidate driver $D_j$, the engine calculates a matching score:

$$\text{Cost}(O_i, D_j) = w_1 \cdot T_{travel}(D_j \to R_i) + w_2 \cdot |T_{arrival}(D_j) - T_{ready}(O_i)| + w_3 \cdot (1 - \text{AcceptanceRate}_{D_j}) - w_4 \cdot \text{BatchBonus}$$

- $T_{travel}(D_j \to R_i)$: Courier transit time to the restaurant.
- $|T_{arrival}(D_j) - T_{ready}(O_i)|$: Penalty for arriving either too early (driver waits) or too late (food gets cold).
- $\text{AcceptanceRate}$: Favors reliable couriers who rarely reject or let timers expire.
- $\text{BatchBonus}$: High negative cost (strong reward) if driver $D_j$ is already picking up another order at the same restaurant or delivering to the same residential building (stacked orders).

The resulting cost matrix is solved as a **Global Bipartite Matching Problem** (using the Hungarian Algorithm or Min-Cost Max-Flow solver) to minimize total platform cost across the entire cohort.

**Handling Concurrent Offers and Race Conditions:**
When an offer is made to a driver:
1. The engine acquires a distributed lock in Redis: `SET lock:driver:offer:{driver_id} {order_id} NX PX 30000`.
2. An offer notification is sent via WebSocket with a 30-second expiry countdown.
3. If the driver accepts, the assignment is written to PostgreSQL inside a transaction checking that the order is still unassigned (`UPDATE orders SET driver_id = :d_id, status = 'DRIVER_ASSIGNED' WHERE id = :o_id AND driver_id IS NULL`).
4. If the driver rejects or the 30-second Redis key expires, the lock is released, and the order returns to the candidate pool for the next 10-second dispatch epoch with an increased search radius.

**Deep Dive 2: Dynamic ETA Prediction Engine**

Delivery ETA consists of four distinct temporal segments:

$$\text{Total ETA} = T_{prep} + T_{pickup\_travel} + T_{handoff\_buffer} + T_{dropoff\_travel}$$

```txt
[ Order Placed ]
       |
       +---> T_prep (Kitchen cooking time)
       |
       +---> T_pickup_travel (Courier driving to restaurant)
       |
       +---> T_handoff_buffer (Parking, elevator, counter pickup delay)
       |
       +---> T_dropoff_travel (Courier driving to customer + walking to door)
       |
[ Food at Door ]
```

1. **Kitchen Prep Time ($T_{prep}$):** Predicted via gradient-boosted decision trees (or a rolling regression model) using:
   - Specific menu items ordered (e.g. fried appetizers = 6 min; well-done steak = 25 min).
   - Current active ticket count in the restaurant's kitchen (kitchen load factor).
   - Historical prep performance of that restaurant at the current hour and day of week.
2. **Travel Times ($T_{pickup\_travel}, T_{dropoff\_travel}$):** Queried from a routing service using real-time traffic conditions, adjusted for driver vehicle type (bicycles perform faster in dense urban cores; cars perform faster in suburbs).
3. **Handoff Buffers ($T_{handoff\_buffer}$):** Historical learning models identify physical real-world friction: finding parking outside a downtown mall restaurant takes 6 minutes, whereas a drive-thru suburban restaurant takes 1 minute. Similarly, high-rise apartment deliveries add an average 4-minute elevator transit time.
4. **Dynamic Adjustment:** The ETA is not static. If the restaurant hits a "Need 10 More Minutes" button on their tablet, an event triggers an immediate recalculation, shifting the dispatch timer and pushing an updated delivery window to the customer's device.

**Deep Dive 3: Menu Caching, Price Invariants, and Instant "86-ing" (Item Out-of-Stock)**

A major production challenge is balancing extreme read performance for browsing against sub-second consistency when a restaurant runs out of an ingredient. In restaurant terminology, marking an item out-of-stock is known as **"86'ing"** an item.

```txt
+---------------------------------------------------------------------------------------------------+
| RESTAURANT TABLET                                                                                 |
| Chef taps "86 Salmon Roll" (Item Out of Stock)                                                    |
+---------------------------------+-----------------------------------------------------------------+
                                  |
                                  v
+---------------------------------------------------------------------------------------------------+
| RESTAURANT & MENU SERVICE                                                                         |
| 1. DB Write: UPDATE menu_items SET is_available = false WHERE id = 'item_42';                     |
| 2. Redis Hash Update: HSET menu:avail:rest_101 item_42 0                                          |
| 3. Invalidate Structured Cache: DEL menu:full:rest_101                                            |
| 4. Publish Event to Kafka/Redis PubSub: { rest_id: 101, item_id: 'item_42', status: 'OUT' }       |
+---------------------------------+-----------------------------------------------------------------+
                                  |
            +---------------------+---------------------+
            |                                           |
            v                                           v
+-----------------------+                   +-----------------------+
| REAL-TIME GATEWAY     |                   | CHECKOUT ATOMIC GUARD |
| Pushes WebSocket      |                   | Intercepts in-flight  |
| notification to users |                   | carts attempting to   |
| currently viewing     |                   | place orders with     |
| Restaurant 101:       |                   | item_42:              |
| UI greys out Salmon   |                   | Returns HTTP 409      |
+-----------------------+                   +-----------------------+
```

- **Structured Menu Cache:** Full menus (categories, descriptions, modifier groups, prices) are serialized as JSON and stored in Redis under `menu:full:{restaurant_id}` with a TTL of 1 hour.
- **Availability Bitset/Hash:** A separate, lightweight Redis Hash `menu:avail:{restaurant_id}` stores only item availability flags (`item_id -> 1 or 0`).
- **The Instant 86 Flow:** When the chef toggles an item off:
  1. The Menu Service updates the PostgreSQL database (`is_available = false`).
  2. It updates the Redis availability hash `HSET menu:avail:{restaurant_id} {item_id} 0` (takes < 1ms).
  3. It deletes the cached full menu JSON `DEL menu:full:{restaurant_id}`.
  4. It publishes an invalidation event to Redis Pub/Sub.
  5. Connected customer clients viewing that restaurant's storefront receive a lightweight WebSocket event disabling the item in their client state without reloading the page.
- **The Checkout Guard (Price & Availability Invariant):**
  A customer may add an item to their cart, leave the phone open for 15 minutes, and attempt to check out after the item has been 86'd or its price changed. The checkout endpoint **never trusts client cart state**.
  During checkout processing inside the Order Service transaction:
  ```sql
  -- Atomic validation query during checkout
  SELECT id, price, is_available
  FROM menu_items
  WHERE id = ANY(:cart_item_ids)
  FOR SHARE;
  ```
  If any item is marked `is_available = false` or the submitted cart price does not match the active database price, the transaction aborts and returns an explicit `409 Conflict` with the updated menu payload, prompting the user to review changes before payment authorization.

**Deep Dive 4: Order State Machine and Transactional Outbox Pattern**

The lifecycle of an order involves multiple independent external systems. A robust finite state machine prevents illegal state hops (e.g. an order cannot transition to `DELIVERED` before `PICKED_UP`).

```txt
+---------+     Payment Auth      +--------------------+     Merchant Accept     +-------------+
| CREATED | --------------------> | PENDING_RESTAURANT | ----------------------> |  PREPARING  |
+----+----+                       +---------+----------+                         +------+------+
     |                                      |                                           |
     | Payment Failed                       | Restaurant Rejects / Timeout              | Food Ready
     v                                      v                                           v
+----+----+                       +---------+----------+                         +------+------+
| FAILED  |                       |     REJECTED       |                         | READY_FOR_PU|
+---------+                       +--------------------+                         +------+------+
                                                                                        |
+-----------+     Driver Dropoff      +------------+     Driver Pickup                  |
| DELIVERED | <---------------------- | IN_TRANSIT | <----------------------------------+
+-----------+                         +------------+
```

To guarantee that database state changes and Kafka messages never diverge (avoiding the dual-write problem), we use the **Transactional Outbox Pattern**.

```txt
+-------------------------------------------------------------------------------+
| DATABASE TRANSACTION (PostgreSQL)                                             |
|                                                                               |
| 1. UPDATE orders SET status = 'PREPARING', updated_at = NOW() WHERE id = 101; |
| 2. INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)  |
|    VALUES ('ORDER', 101, 'ORDER_ACCEPTED', '{"prep_time": 20, ...}');        |
|                                                                               |
| [ COMMIT TRANSACTION ]                                                        |
+---------------------------------------+---------------------------------------+
                                        |
                                        v Change Data Capture (Debezium / Poller)
                               +-----------------+
                               | Kafka Publisher |
                               +--------+--------+
                                        |
                                        v
                           +-------------------------+
                           | Topic: `order.accepted` |
                           +-------------------------+
```

Inside a single ACID transaction, the Order Service updates the order record and writes the event payload into an `outbox_events` table. A dedicated Change Data Capture (CDC) process (like Debezium reading PostgreSQL Write-Ahead Logs) or an ultra-fast outbox poller reads the event and publishes it to Kafka. This guarantees **at-least-once delivery** of order events without risking split-brain database/message broker states. Downstream consumers employ idempotency keys (`order_id + target_status`) to safely ignore duplicate event deliveries.

## 6. Failure Modes and Resilience

**1. The "Ghost Driver" (Courier Drops Out While Food Is Cooking)**
- *Failure:* A driver accepts a dispatch offer, heads toward the restaurant, but crashes their scooter, suffers a dead phone battery, or cancels 2 minutes before pickup while the food is already boxed and hot.
- *Detection:* The Telemetry Service tracks driver heartbeat. If no GPS ping is received for 60 seconds from an assigned courier, or if the courier's location vector moves away from the restaurant for 3 consecutive minutes, a health monitor marks the courier connection as `UNRESPONSIVE`.
- *Mitigation:* The system triggers an automated emergency re-dispatch. The order is injected into the head of the current matching epoch with an `URGENT` priority flag, prioritizing nearby available drivers over unassigned new orders. The customer's tracking view updates with a message ("Re-routing your courier"), and the restaurant tablet receives a reassurance notification.

**2. The "Kitchen Meltdown" (Sudden Restaurant Overload)**
- *Failure:* A rainy evening triggers a 400% surge in orders to a popular ramen restaurant. The kitchen runs out of counter space, tickets back up by 50 orders, and preparation times explode from 15 minutes to 75 minutes, causing a cluster of angry couriers to crowd the restaurant lobby.
- *Detection:* The Order Service tracks active unfulfilled tickets per merchant. If the active queue exceeds a configured limit, or if the rolling average time between `ACCEPTED` and `READY_FOR_PICKUP` exceeds historical baseline by more than 50%, an automated throttle activates.
- *Mitigation:* The system engages **Auto-Snooze / Capacity Throttling**:
  1. The restaurant's storefront is temporarily hidden from the top-level search feed or displayed as "Currently Busy - Unavailable for 20 mins".
  2. Delivery radiuses for that merchant are dynamically contracted (e.g. from 5km to 2km) to reduce inbound demand.
  3. Estimated prep times displayed on remaining in-flight checkout screens are automatically padded to set realistic expectations.

**3. Gateway Thundering Herd on WebSocket Reconnect**
- *Failure:* A network partition or deployment rolling update terminates 250,000 active WebSocket connections on a regional gateway cluster. All 250,000 client applications immediately attempt to reconnect simultaneously.
- *Detection:* Spike in TCP connection establishment rate and CPU saturation on API Gateway nodes with high HTTP 503 response rates.
- *Mitigation:*
  1. Client apps must implement **Truncated Exponential Backoff with Full Random Jitter**:
     $$\text{Wait} = \text{random}(0, \min(\text{MaxBackoff}, \text{BaseDelay} \cdot 2^{\text{attempt}}))$$
  2. Edge load balancers enforce strict connection-rate limits.
  3. Clients gracefully fall back to low-frequency HTTP long-polling (every 10–15 seconds) if WebSocket connection handshakes fail three consecutive times.

**4. Driver GPS Drift and Inaccurate Telemetry Noise**
- *Failure:* In urban canyons with tall skyscrapers, GPS signals bounce off glass buildings (multipath interference), reporting driver positions that jump erratically across parallel streets or show false arrival at the customer's apartment.
- *Detection:* Telemetry filtering service detects impossible physical velocities (e.g. driver moving 150 km/h between two pings 3 seconds apart).
- *Mitigation:* The Telemetry ingestion pipeline passes raw GPS coordinates through a **Kalman Filter** and a **Map-Matching Engine** (snapping raw coordinates to valid road network segments). Automatic arrival detection (geofencing) requires the driver's filtered location to remain within a 50-meter radius of the restaurant or customer destination for at least 15 continuous seconds before triggering auto-arrival webhooks.

## 7. What Makes a Great Answer vs an Average One

| Dimension | Average Candidate Answer | Senior / Staff Engineer Answer |
| :--- | :--- | :--- |
| **Marketplace Dynamics** | Treats food delivery like standard e-commerce with a driver table; dispatches immediately on checkout. | Identifies three-sided temporal coordination; models food prep time as a variable delay and implements Just-In-Time (JIT) dispatch scheduling. |
| **Driver Location Indexing** | Runs SQL queries with `ST_DWithin` on a PostGIS database every 3 seconds per driver. | Uses in-memory hierarchical hexagonal indexing (Uber H3) in Redis; separates high-throughput location ingestion from relational database transactions. |
| **Matching Architecture** | Matches 1 order to 1 nearest driver immediately (greedy matching). | Uses batch window optimization (e.g. 10-second epochs) with bipartite cost matrices to maximize global platform efficiency and support order bundling. |
| **Menu & Availability** | Caches menus with a fixed TTL; forgets about checkout race conditions. | Implements multi-tier caching with separate fast availability hashes for instant sub-second "86-ing", guarded by atomic checkout price/stock verification. |
| **Data Consistency** | Writes directly to database and sends message broker events in parallel (risking dual-write failures). | Enforces strict Finite State Machines for order progression and uses the Transactional Outbox Pattern with CDC to guarantee at-least-once event delivery. |
| **Real-World Resilience** | Assumes drivers never lose battery, GPS is always 100% accurate, and restaurants never get backed up. | Designs explicit mitigations for ghost drivers, urban GPS drift using Kalman filters, kitchen overload auto-throttling, and WebSocket reconnect thundering herds. |

## 8. 🧠 The Memory Hook

Food delivery is not e-commerce with wheels—it is a **three-sided temporal dance**. The kitchen starts first, the courier is dispatched on a calculated delay so they pull up the exact minute the food is bagged, and an atomic state machine ensures nobody eats the cost when something breaks.
