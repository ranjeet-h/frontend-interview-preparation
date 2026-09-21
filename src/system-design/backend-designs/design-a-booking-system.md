# Design a Booking System (Hotels / Concert Seats)

## 1. Understand the Problem First — Clarify Before Designing

Picture 100,000 concert fans opening a ticket map at 10:00:00 AM on a Friday. In the first 50 milliseconds, 8,000 distinct requests hit the exact same front-row seat (Section A, Row 1, Seat 4). If your backend runs a naive `SELECT status FROM seats WHERE id = 4` followed by an `UPDATE seats SET status = 'booked'`, you will double-sell that seat dozens of times, drown your database connection pool in row lock contention, and spend the next week issuing chargebacks and apology emails.

Now consider the hotel variation: two travelers search for a boutique hotel with only 5 "Ocean View Suites" for the dates July 10 to July 15. Both users see availability, both get redirected to checkout, and both submit credit card payments at 10:02 AM. Only one physical room exists.

Before drawing components on a whiteboard, clarify the operational constraints with five direct questions:

- **1. Inventory Type (Discrete Seats vs. Fungible/Pooled Rooms):** Are we booking distinct physical entities (Seat 12B on Flight 304, Room 302 at a hotel) or fungible inventory pools (any 2 General Admission tickets, any "Standard Deluxe King" room out of 50 identical units)? Distinct entities require unique key leases; pooled inventory requires atomic counters.
- **2. Scale & Traffic Profile:** Are we designing for a steady read-heavy travel portal (10 million daily searches, 50,000 bookings/day, 1000:1 read-to-write ratio) or a flash-sale ticketing platform (50,000 stadium seats sold out in 90 seconds, with 100,000 writes/second at peak)?
- **3. Hold Duration & Abandonment Rules:** When a user selects a seat, how long do we hold it before payment completes? (Industry standard: 10 to 15 minutes). What happens if they close the browser tab or their card is declined?
- **4. Consistency vs. Availability Priorities:** Under CAP theorem, the booking write path is strictly CP (Consistency and Partition Tolerance). You can never sacrifice consistency to stay available—double-booking a physical seat or room is a business and legal failure. However, search and discovery can tolerate eventual consistency (AP) with a few seconds of cache lag.
- **5. Scope Boundaries:** The core system must handle availability search, atomic temporary hold leases, payment checkout integration, booking finalization, and automated hold expiration. Ancillary features like customer reviews, loyalty programs, and recommendations are explicitly out of scope.

## 2. The Core Insight — The Decision Everything Else Flows From

A booking system is not a database insert problem; it is a distributed two-phase state machine managing contested scarce inventory under extreme concurrency with time-bounded leases.

The fundamental trap is hitting the primary relational database to manage active lock contention during high-traffic selection. If 50,000 users race for 100 hot seats, running `SELECT FOR UPDATE` or serializable transactions in SQL will instantly exhaust database connection pools, spike query latency to tens of seconds, and crash the service.

The entire architecture flows from one structural decision: **Split inventory management into two isolated tiers**:

1. **The Ephemeral Lease Tier (Hot Path in Memory):** Fast in-memory storage (Redis) handles high-velocity race conditions using atomic Lua scripts and time-to-live (TTL) keys. Only one user wins the temporary lease; the other 7,999 contending requests get an immediate, sub-millisecond "Seat currently held by another user" response without a single database query.
2. **The Durable Source-of-Truth Tier (Cold Path in Relational Storage):** Once payment succeeds, the booking commits to PostgreSQL within an ACID transaction. The database enforces strict mathematical barriers—such as PostgreSQL GiST exclusion constraints (`daterange`) for hotel dates or unique constraints on `(event_id, seat_id)`—serving as the unbreakable zero-trust safety net.

## 3. High-Level Architecture — Components and Why Each Exists

```txt
                           [ Users / Browsers / Apps ]
                                        │
                                        ▼
                     [ Edge CDN & Virtual Waiting Room ]
                                        │
                                        ▼
                            [ API Gateway / Envoy ]
                            │                     │
          (Search & Browse) │                     │ (Hold / Book / Pay)
                            ▼                     ▼
              [ Search & Availability Service ]  [ Reservation & Hold Service ]
                            │                     │             │
            ┌───────────────┴──────────────┐      │             │ (Atomic Lua + TTL)
            ▼                              ▼      │             ▼
    [ ElasticSearch / DB Replicas ] [ Redis Bitmaps ]    [ Redis Cluster (Holds) ]
                                                                │
                                                                │ (Hold Created)
                                                                ▼
                                                  [ Booking / Order Service ]
                                                  │             ▲
                          (Initiate Charge)       │             │ (Async Webhooks)
                          ┌───────────────────────┘             │
                          ▼                                     │
               [ Payment Service (Stripe/PSP) ] ────────────────┘
                          │
                          │ (ACID Commit)
                          ▼
             [ Primary PostgreSQL (ACID + GiST) ]
                          │
                          │ (CDC / Transactional Outbox)
                          ▼
             [ Kafka / Delayed Queue Workers ] ──► [ Expiration & Release Worker ]
```

**Why each component exists:**

- **Edge CDN & Virtual Waiting Room:** Placed at Cloudflare/Envoy to protect downstream systems during flash drops. When traffic exceeds safe thresholds, excess incoming users enter a FIFO token-bucket waiting room, receiving queue position updates over SSE (Server-Sent Events) until capacity is ready.
- **Search & Availability Service:** Offloads 99% of read volume away from the primary transactional database. Uses Redis Bitmaps (for discrete stadium seat availability) and read replicas/Elasticsearch (for multi-filter hotel queries).
- **Reservation & Hold Service:** The high-concurrency coordinator. Manages temporary inventory leases using a Redis Cluster. Executes atomic Lua scripts to verify availability, allocate ownership, and attach a strict 10-minute TTL.
- **Booking / Order Service:** Orchestrates lifecycle state transitions (`AVAILABLE` -> `HELD` -> `CONFIRMED`). Creates pending order records with secure signed hold tokens and idempotency keys.
- **Payment Service & Webhook Ingestor:** Handles third-party payment service providers (Stripe, Adyen). Uses asynchronous webhook ingestion with dedicated idempotency tables to prevent duplicate charges or dropped confirmations.
- **Primary Relational Database (PostgreSQL):** The permanent financial ledger. Holds finalized bookings, customer billing records, and strict structural constraints preventing overlapping reservations.
- **Expiration & Release Worker:** Handles cart abandonment. Listens to delayed message queues (Kafka delayed topics or Redis sorted sets) to actively release expired holds, re-enable inventory, and broadcast seat availability changes over WebSockets.

**End-to-End Request Walkthrough:**

1. **Availability Query:** The client searches available seats. The Search Service queries the Redis Bitmap for the event and returns seat statuses in under 5 milliseconds.
2. **Hold Request:** The user selects Seat A42. The Reservation Service runs an atomic Lua script in Redis. Redis verifies the key `hold:event_101:seat_A42` does not exist, sets it with `user_uuid` and a 600-second TTL, and sets bit 42 to `1` (unavailable). The service creates a `HELD` order record in the database and returns a signed `hold_token`.
3. **Checkout Initiation:** The user navigates to the payment screen. The client submits the payment request with `order_id`, `hold_token`, and a client-generated `idempotency_key`.
4. **Asynchronous Payment:** The Payment Service initiates a charge with Stripe. The user completes 3D Secure verification. Stripe processes the charge and emits a `payment_intent.succeeded` webhook to our API.
5. **Final Confirmation:** The Webhook Ingestor verifies the webhook signature, loads the order record, verifies the hold has not expired, and executes a database transaction: updates order status to `CONFIRMED`, inserts the permanent booking row, and flags the Redis hold key as permanent.
6. **Live Broadcast:** An event publishes to Redis Pub/Sub, triggering WebSocket gateways to notify the buyer of instant confirmation and refresh the venue map for all connected users.

## 4. Key Technical Decisions — With Real Tradeoffs

**Decision 1: Primary Storage Engine — PostgreSQL vs. NoSQL (DynamoDB/Cassandra)**
- *Choice:* PostgreSQL with connection pooling (PgBouncer).
- *Rejected:* DynamoDB / Cassandra for core booking records.
- *Rationale:* Bookings require relational integrity across users, properties, payments, and inventory. More importantly, PostgreSQL provides GiST exclusion constraints (`btree_gist`) capable of preventing overlapping date ranges at the database kernel level. NoSQL stores lack cross-item multi-row transaction isolation and require complex application-level lock coordination that is prone to edge-case bugs under network partitions.
- *Tradeoff:* We give up trivial multi-region active-active multi-master writes. We accept vertical scaling with read replicas for read scaling, which easily handles 5,000+ confirmed write transactions per second with proper indexing.

**Decision 2: Temporary Reservation Locks — Redis Atomic Lua Scripts vs. SQL `SELECT FOR UPDATE`**
- *Choice:* Redis Lua scripts with automatic key expiration (TTL) on the hot path, with PostgreSQL constraints as the final backstop.
- *Rejected:* Acquiring pessimistic row locks (`SELECT ... FOR UPDATE`) directly in PostgreSQL during initial seat selection.
- *Rationale:* When 100,000 users compete for 500 front-row seats, relational row locks create deep lock wait queues, connection pool exhaustion, and cascading timeouts across all API endpoints. Redis executes in-memory single-threaded Lua scripts in sub-millisecond time, filtering out 99.9% of failing requests before they ever touch the database.
- *Tradeoff:* Redis is an in-memory store; an ungraceful master node crash during replication could theoretically lose an in-flight hold key. We accept this small risk because PostgreSQL constraints permanently prevent double-selling on the final commit.

**Decision 3: Inventory Modeling — Discrete Seats vs. Pooled/Fungible Rooms**
- *Choice:* Dedicated modeling strategies tailored to inventory characteristics:
  - *Discrete Inventory (Concert Seats / Specific Hotel Rooms):* Individual Redis keys (`hold:event_id:seat_id`) paired with Redis Bitmaps for lightning-fast seat map visualization.
  - *Pooled/Fungible Inventory (e.g., 80 Standard King Rooms across a date range):* Atomic Redis counter hashes (`HINCRBY hotel:hotel_id:date:YYYY-MM-DD standard_king -1`) checking that the remaining count stays `>= 0` across all consecutive days of the stay.
- *Tradeoff:* Discrete keys require tracking individual item identifiers, while pooled counters require multi-key atomic rollbacks if any single night in a 5-night stay is unavailable.

**Decision 4: Payment Confirmation Lifecycle — Asynchronous Webhooks vs. Synchronous Blocking HTTP**
- *Choice:* Asynchronous payment processing using webhooks, transactional outboxes, and client-side status polling or WebSocket updates.
- *Rejected:* Holding the client's HTTP connection open while waiting for third-party payment gateway network calls.
- *Rationale:* Payment gateways take 3 to 10 seconds to authorize cards, execute fraud checks, and resolve bank OTP challenges. Holding backend server threads and database connections open during third-party HTTP calls exhausts server resources. If the user's mobile connection drops during checkout, a synchronous request leaves the transaction in an undefined orphan state.
- *Tradeoff:* The frontend must handle intermediate `PENDING` states with spinners, polling, or WebSocket subscriptions.

## 5. Deep Dives — The Parts That Actually Matter

**Deep Dive 1: Preventing Double-Booking with Atomic Lua & PostgreSQL GiST Constraints**

To guarantee absolute correctness, race conditions are blocked at both layers of the system.

First, the in-memory hold is acquired via an atomic Redis Lua script. This eliminates the classic "check-then-act" race condition where two requests both check availability and both find it open:

```lua
-- KEYS[1]: hold key (e.g., "hold:event:808:seat:A42")
-- ARGV[1]: hold_token (e.g., "user_uuid:order_uuid")
-- ARGV[2]: ttl_seconds (e.g., "600")

if redis.call('EXISTS', KEYS[1]) == 1 then
    -- Seat is already held or confirmed by someone else
    return 0
else
    -- Atomically claim seat with expiration lease
    redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
    return 1
end
```

Second, on the database write path, hotel room bookings spanning date ranges are vulnerable to overlapping dates (e.g., Guest A books July 1–5; Guest B attempts July 3–7). Standard SQL `UNIQUE(room_id, check_in, check_out)` fails because the exact dates differ, yet the stay ranges conflict.

We enforce range exclusion at the PostgreSQL engine level using the `btree_gist` extension:

```sql
-- Enable btree_gist extension to combine integer and range types
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE room_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id INT NOT NULL,
    user_id INT NOT NULL,
    stay_dates DATERANGE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- The GiST constraint guarantees zero overlapping dates for active reservations
    CONSTRAINT no_overlapping_room_bookings
    EXCLUDE USING gist (
        room_id WITH =,
        stay_dates WITH &&
    ) WHERE (status IN ('HELD', 'CONFIRMED'))
);
```

For discrete concert seats, a unique composite index guarantees the invariant:

```sql
CREATE TABLE seat_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id INT NOT NULL,
    seat_id INT NOT NULL,
    user_id INT NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_active_seat_booking UNIQUE (event_id, seat_id)
);
```

**Deep Dive 2: The Two-Phase Reservation State Machine & The Late Payment Race**

The reservation lifecycle transitions across strictly defined operational states:

```txt
               [ User selects seat ]
                         │
                         ▼
                     ( HELD ) ───[ TTL Expires / User Abandons ]───► ( EXPIRED )
                         │                                                 │
                         │ [ Payment Success within TTL ]                  ▼
                         ▼                                        [ Released to Pool ]
                   ( CONFIRMED )
                         │
                         │ [ User requests cancellation ]
                         ▼
                   ( CANCELLED ) ──► [ Refund Issued & Released ]
```

*How Cart Abandonment is Handled:*
1. **Passive Expiration:** Redis TTL naturally expires the hold key after 600 seconds. Subsequent queries instantly see the key is absent.
2. **Active Expiration:** Upon hold creation, a delayed message is pushed to a delayed queue (e.g., Redis Sorted Set scored by expiration timestamp `NOW() + 600s`, or a Kafka delayed topic). The Expiration Worker consumes expired items, updates the database order status from `HELD` to `EXPIRED`, and emits a WebSocket broadcast notifying waiting users that the inventory is available again.

*The 9:59 Payment Race Condition (The "Late Webhook" Trap):*
Consider this critical edge case:
- At T = 0s, User A holds Seat 10. Hold expires at T = 600s.
- At T = 595s, User A clicks "Pay $150".
- At T = 600s, User A's hold expires in Redis.
- At T = 601s, User B spots Seat 10 open, acquires a fresh hold, and enters checkout.
- At T = 603s, Stripe's webhook arrives for User A: `payment_intent.succeeded`.
If unhandled, both users will believe they own the seat.

*The Resolution Algorithm:*
When the payment webhook arrives, the worker enters a database transaction with a pessimistic lock on the hold record: `SELECT * FROM orders WHERE id = :order_id FOR UPDATE`.
1. The worker checks if the order's hold timestamp has expired and if the inventory was already claimed by another user's active hold/booking.
2. If the hold is valid, the order status transitions to `CONFIRMED`, and the permanent seat record is written.
3. If the hold expired and the seat was claimed by User B, the system marks User A's order as `EXPIRED_PAYMENT_OVERFLOW`, records the transaction in an audit table, and immediately triggers Stripe's Refund API to automatically refund User A's card with an explanatory notification email.

**Deep Dive 3: Availability Search at Scale via Redis Bitmaps**

In a 60,000-seat stadium, querying a relational database every time any user pans or zooms the seating chart causes massive IOPS degradation.

We represent each stadium section as an in-memory **Redis Bitmap**:
- Key: `event:808:section:101:bitmap`
- Offset: Seat Number (0 to 999).
- Value: `0` = Available, `1` = Held / Booked.

*Operational advantages:*
- **Instant Lookup:** Checking if Seat 42 is available is `GETBIT event:808:section:101:bitmap 42` (Execution time: < 50 microseconds).
- **Fast Capacity Calculation:** Getting total remaining available seats in a section is `BITCOUNT event:808:section:101:bitmap` subtracted from total capacity.
- **Minimal Memory Footprint:** 60,000 seats take less than 8 kilobytes of memory per event.

## 6. Failure Modes and Resilience

**1. Redis Master Crash During Hold (Replication Lag)**
- *Failure Scenario:* User A acquires a 10-minute hold on Seat 12 on the Redis Master. Before asynchronous replication syncs the key to the Redis Replica, the Master suffers a hardware crash. The Replica is promoted to Master without the hold key. User B requests a hold on Seat 12 and succeeds.
- *Impact:* Two users hold the same seat in memory.
- *Mitigation:* When both users submit payment, the requests arrive at PostgreSQL. The first transaction commits and inserts the `seat_reservations` row. The second transaction encounters a `UNIQUE CONSTRAINT VIOLATION` on `(event_id, seat_id)` and fails. The database rolls back the second transaction, and the Payment Service executes an automated refund for User B. Redis provides throughput; PostgreSQL provides unbreachable safety.

**2. Duplicate & Out-of-Order Payment Webhooks**
- *Failure Scenario:* Network jitter causes Stripe to retry delivering the same `payment_intent.succeeded` webhook three times over 30 seconds.
- *Impact:* Duplicate database writes, double inventory decrements, or corrupted metrics.
- *Mitigation:* Implement a dedicated `processed_webhooks` table with a unique constraint on `webhook_event_id`. The Webhook Ingestor processes all actions within a single database transaction:
  ```sql
  INSERT INTO processed_webhooks (event_id, processed_at)
  VALUES ('evt_stripe_12345', NOW());
  ```
  If a duplicate webhook arrives, the unique constraint immediately fails, and the server returns an HTTP 200 to Stripe without executing downstream logic.

**3. Thundering Herd on Batch Hold Expiry**
- *Failure Scenario:* A high-profile concert drops 10,000 tickets. Exactly 10 minutes later, 2,000 abandoned holds expire at the same second. Thousands of automated bots and users standing by reload the page simultaneously.
- *Impact:* Sudden spike in cache invalidation and query bursts, choking the application servers.
- *Mitigation:*
  - Add a randomized **TTL jitter** (e.g., 600s + uniform random 0–30s) so holds expire over a smooth time window rather than an identical timestamp.
  - Stagger WebSocket availability broadcast notifications across small micro-batches (100ms intervals).
  - Enforce edge rate limiting and token bucket throttling at the API Gateway.

**4. Database Connection Pool Exhaustion under Heavy Checkout Spikes**
- *Failure Scenario:* High volumes of checkout completions initiate long-running database transactions, exhausting the connection pool and causing HTTP 500 errors across all routes.
- *Mitigation:*
  - Deploy **PgBouncer** in transaction pooling mode between application workers and PostgreSQL.
  - Separate connection pools: dedicate 70% of connections to checkout/payment transactions and 30% to read-only queries.
  - Keep database transactions as small as possible—never make external API calls (e.g., calling Stripe, sending emails) inside a SQL transaction block.

## 7. What Makes a Great Answer vs an Average One

| Dimension | Average Candidate Answer | Senior Candidate Answer |
|---|---|---|
| **Inventory Modeling** | Treats all bookings as a basic SQL table with `status = 'available' \| 'booked'`. | Differentiates discrete seats (unique IDs, Redis Bitmaps) from pooled/fungible inventory (atomic counter hashes with range bounds). |
| **Concurrency Control** | Uses simple `SELECT` followed by `UPDATE` queries, or relies entirely on heavy database `SELECT FOR UPDATE` locks. | Decouples fast in-memory leases (Redis Lua scripts with TTL) from durable relational constraints (PostgreSQL GiST exclusion constraints). |
| **Hold Lifecycle & Expiry** | Suggests running a cron job every minute scanning `WHERE expires_at < NOW()`, or relies on a frontend JavaScript timer. | Designs a two-phase state machine with passive Redis TTL eviction and active delayed queue workers (Kafka/Redis ZSET), fully resilient to browser drop-offs. |
| **Payment Edge Cases** | Assumes payment is synchronous; ignores late webhooks arriving after hold expiration. | Models the 9:59 payment race condition; designs automated refund reconciliation and idempotent webhook ingestion with database locking. |
| **System Resilience** | Mentions adding more servers or caching blindly. | Details failure mitigation: handling Redis replication loss via SQL constraints, jittering TTLs to prevent thundering herds, and using edge waiting rooms. |

## 8. 🧠 The Memory Hook

A booking system is a **two-phase lease machine**: protect the hot write path with **atomic Redis TTL leases** so thousands of users can contend in memory without melting your database, and guard the finish line with **PostgreSQL exclusion constraints** so even if Redis burns to the ground, two people can never own the same seat.
