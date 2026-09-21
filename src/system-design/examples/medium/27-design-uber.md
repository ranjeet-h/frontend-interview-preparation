# 27. Design Uber

[← Medium examples](index.md)

**Why interviewers ask** — Real-time geospatial matching, ETA accuracy, surge pricing, and payments in one flow where seconds matter.

**Core insight** — Driver location is high-churn ephemeral state; matching is a geospatial nearest-neighbor problem; pricing and payment must be correct even when GPS jitters.

**Architecture**

```txt
Rider/Driver apps → Location service (WebSocket, geohash index)
                 → Matching service (quadtree/geohash, rank by ETA)
                 → Trip state machine → Payment service
                 → Pricing (surge by supply/demand zone)
                 → Maps/ETA (routing API + ML)
```

- **Location** — Drivers ping every ~4s; index by geohash cell in Redis or spatial DB.
- **Matching** — Query nearby available drivers; rank by ETA, rating, acceptance rate.
- **Trip lifecycle** — requested → matched → in-progress → completed; idempotent state transitions.
- **Surge** — Partition city into zones; multiply fare when demand/supply ratio exceeds threshold.

**Key decisions** — Eventual consistency OK for driver position; strong consistency for trip state and payment; geohash prefix for shard routing.

**Scale & failure** — Regional data centers; stale driver location may miss match — refresh and retry; payment retries with idempotency keys; surge caps prevent runaway fares.

**Deep link** — [Ride booking backend](../../backend-designs/design-a-ride-booking-backend.md) · [Payment system](../../backend-designs/design-a-payment-system.md)

**Memory hook** — Geohash finds the car, state machine runs the trip, idempotency saves the fare.
