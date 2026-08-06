# Design a ride booking backend

## Detailed explanation

Design a ride booking backend is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, design a ride booking backend affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you match riders with nearby drivers?
- **The Engine Mechanism (Why it behaves this way):** Driver locations are stored in a geospatial index (Redis GEO, PostGIS) updated every 3-5 seconds via WebSocket. When a rider requests a ride, the system queries for drivers within a radius (e.g., 3km) using a geospatial search (GEORADIUS in Redis). Drivers are ranked by distance, ETA, rating, and acceptance rate. The closest driver is sent a ride request. If they don't accept within 15 seconds, the request goes to the next driver. The search radius expands incrementally if no driver accepts. Driver availability status (online, on_trip, offline) filters the search.
- **The Unforgettable Mental Model:** The **Ripple in a Pond**. Drop a stone (ride request) in the pond. The ripple expands outward (search radius). The first fish (driver) it reaches gets the request. If that fish doesn't bite (no accept), the ripple expands further to reach the next fish.
- **The Trap:** Searching all drivers in the city. This is O(n) and slow. Use a geospatial index (Redis GEO, PostGIS) for O(log n) radius-based search. Only search active, available drivers.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Driver locations are stored in Redis GEO with updates every 3-5 seconds via WebSocket. When a ride is requested, I query for available drivers within a 3km radius using GEORADIUS. Drivers are ranked by distance, ETA, rating, and acceptance rate. The closest driver gets the request with a 15-second accept window. If they decline or timeout, the request goes to the next driver and the radius expands. Only online, available drivers are included in the search. This gives sub-100ms matching latency."

#### How do you calculate ride pricing dynamically?
- **The Engine Mechanism (Why it behaves this way):** Pricing uses a formula: base_fare + (per_km_rate × distance) + (per_min_rate × duration) + surge_multiplier. Distance and duration are estimated using a routing engine (OSRM, Google Maps API). Surge pricing activates when demand exceeds supply in a geographic area — the surge multiplier is calculated as demand/supply ratio, capped at a maximum (e.g., 3x). Surge zones are hexagonal grid cells (H3 index) that update every 5 minutes. The price is quoted to the rider upfront and locked for a TTL (2 minutes). Actual price may differ slightly if the route changes, but the rider is notified of significant deviations.
- **The Unforgettable Mental Model:** The **Taxi Meter with Smart Pricing**. The meter calculates fare based on distance and time. But during rush hour (high demand), the meter applies a multiplier (surge) because there are more passengers than taxis. The surge zone is like a neighborhood — surge applies only where demand is high, not city-wide.
- **The Trap:** Calculating surge pricing per-request. This is inconsistent — two riders in the same area at the same time could get different surge multipliers. Pre-calculate surge per zone and apply uniformly.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Pricing is base_fare + per_km × distance + per_min × duration + surge_multiplier. Distance and ETA come from a routing engine (OSRM). Surge pricing uses H3 hexagonal zones — each zone has a demand/supply ratio calculated every 5 minutes, capped at 3x. The price is quoted upfront and locked for 2 minutes. Surge is pre-calculated per zone, not per-request, ensuring consistency. If the actual route deviates significantly from the estimate, the rider is notified and the price is adjusted within a tolerance threshold."

#### How do you handle real-time trip tracking?
- **The Engine Mechanism (Why it behaves this way):** During a trip, the driver's location is streamed to the server every 3 seconds via WebSocket. The server publishes the location to a Redis Pub/Sub channel keyed by trip_id. The rider's app subscribes to this channel and receives real-time location updates. The server also stores location checkpoints in the database for trip reconstruction and dispute resolution. ETA is recalculated every 30 seconds using the routing engine. If the driver deviates from the route, an alert is triggered. The trip status (started, in_progress, completed) is tracked and published to both rider and driver.
- **The Unforgettable Mental Model:** The **Live GPS Tracker**. The driver's phone sends a dot on the map every 3 seconds (location stream). The rider sees the dot moving in real-time (WebSocket push). The system also records key points along the way (checkpoints) like breadcrumbs. If the driver goes off-route, an alarm sounds (deviation alert).
- **The Trap:** Storing every location point in the database. A 30-minute trip at 3-second intervals generates 600 points. Store checkpoints (every 30 seconds or at significant turns) and stream real-time points only via WebSocket without persisting all of them.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: During a trip, the driver's location streams to the server every 3 seconds via WebSocket. The server publishes to a Redis Pub/Sub channel (trip_id) for the rider's real-time display. I store checkpoints every 30 seconds in the database for trip reconstruction, not every point. ETA is recalculated every 30 seconds via the routing engine. Route deviation detection compares the driver's actual path to the planned route and alerts if they diverge by more than 500 meters. Trip status transitions are published to both parties."

#### How do you handle trip state management and edge cases?
- **The Engine Mechanism (Why it behaves this way):** Trip states: requested → matched → driver_en_route → arrived → in_progress → completed → paid. Each transition is validated. Edge cases: driver cancels after matching (re-match with next driver), rider cancels (cancellation fee if driver is en-route), driver goes offline mid-trip (alert support, reassign), network disconnect (grace period, auto-complete if driver reaches destination). A state machine enforces valid transitions. All transitions are logged in a trip_events table. A background job handles stuck trips (in_progress for >4 hours → auto-complete with manual review).
- **The Unforgettable Mental Model:** The **Board Game with Rules**. The game piece (trip) moves along a path (states) following strict rules. You can't jump from "requested" to "completed." If a player drops out (driver cancels), the game finds a replacement. If the game gets stuck (no moves for hours), the referee (background job) intervenes.
- **The Trap:** Not handling stuck trips. If a driver's app crashes mid-trip, the trip stays "in_progress" forever. Always have a background job that detects and resolves stuck trips.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Trips follow a state machine: requested → matched → driver_en_route → arrived → in_progress → completed → paid. Each transition is validated. Edge cases are handled: driver cancellation triggers re-matching, rider cancellation applies fees based on driver proximity, driver going offline mid-trip alerts support. A background job detects stuck trips (in_progress > 4 hours) and auto-completes them for manual review. All transitions are logged in trip_events for auditability and dispute resolution."

#### How do you handle payment for rides?
- **The Engine Mechanism (Why it behaves this way):** Payment is processed after trip completion. The rider's default payment method is charged automatically. The fare is calculated from the actual distance and duration, with the upfront quote as a reference. If the payment fails, the rider's account is flagged and they can't book new rides until the balance is settled. The driver's earnings are credited to their wallet immediately (platform commission deducted). A payment receipt is generated and sent to the rider. Disputed charges are handled through a support ticket system with trip data (route, timestamps) as evidence.
- **The Unforgettable Mental Model:** The **Automatic Toll Booth**. As you exit the highway (complete the trip), the toll booth automatically charges your transponder (payment method). If the transponder fails, you get a bill in the mail (account flagged). The toll operator (driver) gets their cut immediately minus the highway fee (commission).
- **The Trap:** Charging the rider before trip completion. If the trip is cancelled or interrupted, you'd need to issue a refund. Always charge after completion based on actual distance and duration.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Payment is processed after trip completion. The actual fare is calculated from distance and duration, compared to the upfront quote, and charged to the rider's default payment method. If payment fails, the rider's account is flagged and booking is blocked until settled. Driver earnings are credited to their wallet immediately with platform commission deducted. A receipt is generated and emailed. Disputes are handled through support with full trip data (route, timestamps, GPS checkpoints) as evidence."

#### How do you scale the matching system for a large city?
- **The Engine Mechanism (Why it behaves this way):** Scaling involves: (1) Geographic sharding — divide the city into zones, each handled by a matching service instance; (2) Redis GEO clusters — partition driver locations by zone; (3) WebSocket connection servers — stateless servers handling driver/rider connections, scaled independently; (4) Message broker — Kafka for matching events, location updates, and notifications; (5) Routing engine — multiple OSRM instances behind a load balancer for ETA calculations; (6) Database — trip data sharded by city and date. The matching service is stateless and scales horizontally. Zone boundaries use H3 hexagonal grids for clean partitioning.
- **The Unforgettable Mental Model:** The **Air Traffic Control Network**. The city is divided into sectors (zones). Each control tower (matching service) handles flights (rides) in its sector. Towers communicate via radio (Kafka). Radar (Redis GEO) tracks all planes (drivers). If one sector gets busy, another tower helps (horizontal scaling).
- **The Trap:** Using a single matching service for the entire city. This becomes a bottleneck as driver count grows. Always shard geographically — each zone handles its own matching independently.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd shard geographically using H3 hexagonal zones. Each zone has its own matching service instance and Redis GEO partition. WebSocket connection servers are stateless and scale independently. Kafka handles inter-zone communication (driver crossing zone boundaries). Multiple OSRM instances handle ETA calculations behind a load balancer. Trip data is sharded by city and date. The matching service is stateless — adding more instances increases capacity linearly. Zone boundaries are clean with H3, and drivers near boundaries are visible to adjacent zones."

#### How do you handle driver and rider ratings?
- **The Engine Mechanism (Why it behaves this way):** After trip completion, both rider and driver can rate each other (1-5 stars) with optional feedback. Ratings are stored in a ratings table (trip_id, rater_id, ratee_id, score, feedback, created_at). Average ratings are maintained as a running average (total_score / count) updated atomically on each new rating. To prevent rating manipulation, ratings are anonymous (shown after both parties rate or after 24 hours). Low-rated drivers (<4.0) are flagged for review. Rating trends (improving/declining) are tracked. Feedback is analyzed with NLP for common themes (cleanliness, punctuality, safety).
- **The Unforgettable Mental Model:** The **Two-Way Review System**. After a stay, both the guest and host review each other. Reviews are hidden until both are submitted (or 24 hours pass) to prevent retaliation. The overall score is the average of all reviews. Consistently low scores trigger a warning.
- **The Trap:** Showing ratings immediately. If a driver sees a low rating from a rider, they might retaliate with a low rating. Always use double-blind rating — both ratings are hidden until both are submitted.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: After trip completion, both parties can rate each other 1-5 stars with optional feedback. Ratings are double-blind — hidden until both are submitted or 24 hours pass, preventing retaliation. Average ratings are maintained as running totals updated atomically. Drivers below 4.0 are flagged for review. I'd track rating trends and use NLP on feedback to identify common themes. Ratings are stored per-trip with the trip_id for auditability. The rating system is a key quality signal for both matching algorithms and user trust."

## 8. Active recall test

1. **How do you find nearby drivers for a ride request?**
   - **Explanation:** Store driver locations in Redis GEO updated every 3-5 seconds. Query with GEORADIUS for available drivers within a radius. Rank by distance, ETA, rating, and acceptance rate. Send request to closest driver with 15-second accept window, expanding radius if needed.

2. **How does surge pricing work?**
   - **Explanation:** Calculate demand/supply ratio per H3 hexagonal zone every 5 minutes. Apply as a multiplier to the base fare, capped at a maximum (e.g., 3x). Pre-calculate per zone for consistency. Quote upfront and lock for 2 minutes.

3. **How do you stream real-time trip location without overwhelming the database?**
   - **Explanation:** Stream driver location every 3 seconds via WebSocket and Redis Pub/Sub for real-time display. Store checkpoints every 30 seconds in the database for trip reconstruction, not every point. Recalculate ETA every 30 seconds.

4. **What happens if a driver's app crashes mid-trip?**
   - **Explanation:** A background job detects stuck trips (in_progress > 4 hours) and auto-completes them for manual review. The trip state machine enforces valid transitions. All transitions are logged in trip_events for auditability.

5. **When is the rider charged for a ride?**
   - **Explanation:** After trip completion, based on actual distance and duration. The upfront quote is a reference. If payment fails, the rider's account is flagged and booking is blocked. Driver earnings are credited immediately minus commission.

6. **How do you scale ride matching for a large city?**
   - **Explanation:** Shard geographically using H3 hexagonal zones. Each zone has its own matching service and Redis GEO partition. WebSocket servers scale independently. Kafka handles inter-zone events. Trip data is sharded by city and date.

7. **Why use double-blind ratings?**
   - **Explanation:** Ratings are hidden until both parties submit or 24 hours pass. This prevents retaliation — a driver won't give a low rating just because the rider rated them low first. Running averages are updated atomically.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design a ride booking backend in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design a ride booking backend in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
