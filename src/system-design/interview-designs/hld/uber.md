# Uber

Uber is a real-time **matching** system wearing a map. The pressure is not drawing cars; it is ingesting a continuous stream of driver locations, answering "who is near this rider?" in milliseconds, and turning a match into a trip whose state is never lost or double-assigned.

This design is an interview scope, not a product claim. It covers drivers going online and streaming location, riders requesting a ride, matching to a nearby driver, dispatch and acceptance, the trip lifecycle, and fare estimation. Pooling, scheduled rides, and food delivery are extensions.

## 1. Clarify requirements

Functional requirements:

- A driver goes **online/offline** and continuously streams location.
- A rider requests a ride from a pickup point to a destination.
- The system **matches** a nearby available driver and **dispatches** the request.
- The driver **accepts or rejects**; the rider sees status.
- A **trip** progresses through states to completion, with a **fare**.

Non-functional requirements (interview assumptions):

- Match latency target: p99 under ~2 s from request to dispatch.
- Location updates: every ~4 s per online driver; tolerate staleness of seconds.
- Availability over consistency for **location**; strong consistency for **trip assignment and payment**.
- One driver serves **at most one active trip** at a time.

Explicitly out of scope: pooling, scheduled rides, surge ML, and payments internals (separate design).

## 2. Estimate scale

Useful numbers, labelled as assumptions:

- 5M online drivers, each pinging every 4 s → **1.25M location writes/s** globally.
- 50k ride requests/s at peak.
- Match ratio: requests are far rarer than location pings (~1:25 here).
- Location is **ephemeral**: only the latest position per driver matters, so storage is small and hot (in-memory), not a growing log.
- Trip records are durable and grow with completed trips.

The dominant load is **location writes**, not rides. That single fact drives the architecture.

## 3. Define APIs

Driver:

```http
POST /drivers/{id}/status        { "online": true }
POST /drivers/{id}/location      { "lat": ..., "lng": ..., "ts": ... }
POST /drivers/{id}/dispatch/{matchId}/respond  { "accept": true }
```

Rider:

```http
POST /rides                      { "pickup": {...}, "dropoff": {...} }
GET  /rides/{rideId}             -> status, driver, eta
POST /rides/{rideId}/cancel
GET  /fare/estimate?pickup=..&dropoff=..
```

Location uses a lightweight, high-frequency path (HTTP keep-alive or a persistent stream) because it is the hottest write.

## 4. Define the data model

- `Driver` — id, status (offline/online/on-trip), vehicle.
- `DriverLocation` — driverId, lat/lng, timestamp, **geohash/H3 cell**. Ephemeral; latest-only.
- `Ride` — id, riderId, pickup, dropoff, status, fareEstimate.
- `Match` — id, rideId, candidateDriverId, state (offered/accepted/expired), expiresAt.
- `Trip` — id, rideId, driverId, startTime, endTime, distance, fare, status.
- `Fare` — rule inputs and the computed amount.

The **geospatial index** (geohash, H3, or S2) maps a cell → the drivers currently in it. It is the core data structure; the durable stores hold rides and trips.

## 5. Draw the high-level architecture

```text
Drivers ──location stream──► Location ingest ──► Geospatial index (in-memory, sharded by city)
                                                         ▲
Riders ──ride request──► Matching service ──────────────┘ (query nearby)
                              │
                              ├─► Dispatch (notify candidates) ─► driver responds
                              ├─► Trip store (durable, strongly consistent)
                              └─► Pricing service (fare estimate)
```

Ingest writes positions into a sharded in-memory geo index; matching reads that index to find candidates; dispatch offers the ride; the trip store is the durable, consistent record.

## 6. Walk through the main request flow

1. Rider calls `POST /rides` with pickup and dropoff; the service creates a `Ride` in `REQUESTED`.
2. Matching queries the geo index for available drivers within an expanding radius of the pickup.
3. It ranks candidates (distance, ETA, rating) and creates a `Match` offered to the top driver with a **short expiry**.
4. Dispatch pushes the offer to the driver's device; the driver **accepts** or **rejects** within the window.
5. On accept, the system **atomically** assigns the driver to the trip (`Match` → `ACCEPTED`, driver → `on-trip`), and the ride becomes `DRIVER_ASSIGNED`.
6. Trip progresses `ARRIVED → IN_PROGRESS → COMPLETED`; fare is computed from distance/time and the trip store is updated.
7. If the offer expires or is rejected, matching retries with the next candidate.

## 7. Identify bottlenecks

- **Location ingest** — the hottest write path (1.25M/s); a single ingest tier or a single index shard cannot hold it.
- **Geospatial index hot cells** — a dense downtown cell receives vastly more updates and queries than a rural cell.
- **Matching fanout** — expanding-radius searches multiply read load exactly when supply is scarce.
- **Dispatch delivery** — pushing offers to many drivers can spike.
- **Trip store writes** — low volume but must be strongly consistent.
- **Cross-region coordination** — matching must be local to a city to stay fast.

## 8. Scale each component

Partition everything by **city/region**, then by **geo cell** within a city. Location ingest is stateless and scales horizontally; the geo index shards by cell (or H3 parent cell) so a cell's writes and queries stay on one shard. Matching is stateless per city and reads the local index. Trip store shards by `rideId`/`cityId` with strong consistency. Dispatch uses the connection directory to reach the driver's device. Keep matching **region-local**: never match across the ocean.

## 9. Caching strategy

- The **geo index is the cache**: positions live in memory, latest-only, with a TTL so stale drivers drop out.
- Cache driver **status** and availability for fast candidate filtering.
- Cache **fare rules** and ETA estimates; they change rarely.
- Do not cache the trip's authoritative state; that belongs in the durable store.

## 10. Database scaling and consistency

- **DriverLocation**: in-memory, sharded, eventually consistent, loss-tolerant — a dropped ping is replaced 4 s later.
- **Ride/Match/Trip**: durable, sharded by city, with strong consistency for the assignment transition; a unique constraint ensures a driver is in at most one active trip.
- Fare/payment records are append-only and reconciled, like any money ledger.

## 11. Handle concurrency

The critical invariant: **a driver is assigned to at most one active ride**. The assignment is an atomic compare-and-set on the driver's status (and a unique constraint on `(driverId, activeTrip)`). Two matching workers racing for the same driver: exactly one wins; the other sees the driver taken and retries with the next candidate. Match offers carry a **lease** (`expiresAt`) so an unresponsive driver frees up automatically.

## 12. Reliability and failure handling

- **Stale location**: reject or down-weight positions older than a threshold; expand the search radius instead of trusting a stale pin.
- **Dispatch timeout**: the offer expires and matching retries; never block the rider forever.
- **Driver disconnect mid-trip**: the trip continues from the last known state; reconciliation on reconnect.
- **Ingest loss**: positions are best-effort; the next ping repairs them.
- **Trip store write failure**: the assignment is retried with an idempotency key so a retry cannot create two trips.

## 13. Availability versus consistency trade-offs

Location is **AP**: under a partition, serve the last known positions and expand search rather than fail the request. Trip assignment is **CP**: never double-assign a driver; it is better to fail a match and retry than to send two riders to one car. So the system deliberately mixes the two, per data type.

## 14. Security

Authenticate drivers and riders; authorize that a rider can only read their own ride. Treat location as sensitive PII: minimize retention of raw traces, encrypt in transit and at rest, and never expose a driver's exact position to a rider before assignment. Rate-limit the ingest path to prevent spoofed floods.

## 15. Monitoring and observability

Track **match latency** (p99 request→dispatch), match success rate, offer accept rate, **location staleness**, index shard load and hot-cell skew, supply/demand per city, trip completion rate, and fare computation errors. Alert on rising match latency, growing stale-driver fraction, and hot-cell saturation.

## 16. Discuss trade-offs

| Choice | Why | Alternative | Trade-off |
|---|---|---|---|
| City-partitioned matching | Keeps matching local and fast | Global matching | Simpler failover, but cross-region latency and hot global state |
| In-memory geo index | Sub-ms nearby queries at 1M writes/s | Durable spatial DB | Fast and cheap, but positions are lossy and must be rebuilt |
| Atomic CAS assignment | Prevents double assignment | Best-effort dispatch | Simpler, but two riders can get one driver |
| Offer lease + retry | Unresponsive drivers free quickly | Wait for a response | Faster recovery, but more retries |
| AP location / CP trip | Matches the data's real guarantees | Uniform consistency | One system, two consistency models to reason about |

## 17. Future improvements

Add pooling/route matching, scheduled rides, richer ETA prediction, surge pricing, multi-region failover for a city, and stronger driver-fraud detection. Move the geo index to a purpose-built spatial store as cell counts grow, and add cross-region trip hand-off for long trips.

## Interactive Visualizer

Raise the location-update rate and watch the hot path: driver pings flow through ingest into the sharded geospatial index, while the rarer ride requests drive matching, dispatch, the trip store, and pricing. Press **Scale up** to add ingest nodes, index shards, matching nodes, dispatch workers, trip partitions, or pricing nodes and see what failed, what changed, and what improved.

<div
  id="uber-hld"
  class="hld uber-hld-visualizer"
></div>

## Interview recap

The interview answer is: "location is a firehose of best-effort, latest-only positions into a sharded in-memory geo index; matching queries that index locally per city; and assignment is an atomic compare-and-set with a lease so a driver is never double-booked."

Likely follow-ups:

- How do you keep nearby-driver queries fast at 1M location writes/s?
- Two matching workers pick the same driver — how do you prevent a double assignment?
- A driver's location is 30 seconds stale — what do you do?
- Why is location eventually consistent while the trip is strongly consistent?
