# BookMyShow

A BookMyShow-like system helps people discover movies and shows, inspect a seat map, temporarily reserve selected seats, pay, receive one confirmed booking, and later cancel under the venue's policy. This interview design deliberately separates the read-heavy discovery experience from the transaction-protected inventory path. It covers movie, theatre, show, seat-map, hold, payment, confirmation, cancellation, and refund flows; it excludes theatre operations, dynamic pricing algorithms, and a payment-network implementation.

The central invariant is: **a seat for a show has at most one active owner.** Show-seat inventory is the source of truth for availability. Inventory changes require strong consistency; search, recommendations, cached discovery, and analytics may be eventually consistent.

## 1. Clarify requirements

Functional requirements:

- A customer can browse movies by city, date, language, theatre, and show time, then view a seat map.
- A customer can hold one or more available seats for a short lease, pay for that hold, and receive one confirmed booking or a clear failure result.
- A customer can retrieve booking status, cancel an eligible booking, and receive a refund outcome.
- The system releases expired or abandoned holds automatically and prevents two customers from buying the same show seat.

Non-functional interview assumptions: availability shown in discovery can be briefly stale, but hold and confirmation decisions must be correct at the inventory authority; an accepted confirmation must survive retries and service crashes; payment is handled by an external provider; and the system can reject or queue requests for an exceptionally hot show rather than oversell it.

## 2. Estimate scale

Use explicit interview assumptions:

- Assume 20 million daily active customers, 100 million discovery requests per day, and 2 million seat-map requests per day.
- Assume 500,000 booking attempts per day. That is about 6 attempts per second on average; assume a peak multiplier of 100, so size the transactional hold path for about 600 attempts per second.
- Assume 100,000 concurrently active seat holds at a peak, and assume each hold has a 5-minute lease.
- Assume a popular theatre screen has 300 seats and a blockbuster can cause 10,000 customers to refresh one show’s seat map per minute.
- Assume seat inventory plus hold and booking metadata averages 1 KB per show seat over its lifecycle; discovery images and trailers are stored separately in object storage and a CDN.

These are interview assumptions, not production measurements. They make discovery cache-first and independently scalable while treating a single show’s inventory as a contention-sensitive transactional partition.

## 3. Define APIs

Discovery APIs are read-oriented and may return a freshness timestamp:

```text
GET /cities/{cityId}/movies?date=2026-08-28
GET /movies/{movieId}/shows?cityId=blr&date=2026-08-28
GET /shows/{showId}/seat-map
```

The seat-map response contains `seatId`, label, price tier, and an availability hint. The client must still create a hold before treating a seat as reserved.

```json
POST /shows/show_91/holds
Idempotency-Key: client-request-8c7
{
  "seatIds": ["A7", "A8"],
  "customerId": "user_42"
}

201 Created
{
  "holdId": "hold_71",
  "status": "ACTIVE",
  "expiresAt": "2026-08-28T10:05:00Z",
  "amount": { "currency": "INR", "minorUnits": 60000 }
}
```

```text
POST /holds/{holdId}/payment-attempts
POST /holds/{holdId}/confirm
GET  /bookings/{bookingId}
POST /bookings/{bookingId}/cancellations
GET  /payment-attempts/{paymentAttemptId}
```

`POST /holds/{holdId}/confirm` includes the payment-provider reference and an idempotency key. It returns the existing booking on a retry, returns `409` for an expired or no-longer-active hold, and never creates a second booking for the same payment or seats.

## 4. Define the data model

```text
Movie(movieId, title, language, duration, releaseState)
Theatre(theatreId, cityId, name, address, state)
Screen(screenId, theatreId, name, layoutVersion)
Seat(seatId, screenId, label, row, tier, active)
Show(showId, movieId, screenId, startsAt, pricingVersion, state)

ShowSeat(showId, seatId, price, state, activeOwnerType, activeOwnerId, version)
SeatHold(holdId, showId, customerId, status, expiresAt, idempotencyKey, totalAmount)
SeatHoldItem(holdId, showId, seatId)
Booking(bookingId, showId, customerId, status, confirmedAt, cancellationState)
BookingItem(bookingId, showId, seatId, price)
PaymentAttempt(paymentAttemptId, holdId, provider, providerReference, status, amount, idempotencyKey)
```

`ShowSeat` is the source of truth. Its key is `(showId, seatId)` and its row records whether the active owner is a hold or confirmed booking. `SeatHoldItem` and `BookingItem` have unique `(showId, seatId)` constraints appropriate to their active state. A transactional outbox records hold, confirmation, expiry, cancellation, and refund events only after their authoritative write commits.

## 5. Draw the high-level architecture

```text
Discovery
Customer -> CDN / API gateway -> Discovery API -> cache -> catalogue/search read models
                                      |                    ^
                                      v                    |
                              movie/theatre/show source ---+-- event projection

Booking
Customer -> API gateway -> Booking API -> inventory transaction store
                                  |             |        |
                                  |             |        +-> transactional outbox -> cache invalidator / analytics
                                  |             v
                                  |        Hold + Booking records
                                  v
                           Payment orchestrator <-> payment provider
                                  |
                                  v
                         confirmation / refund workers
```

The catalogue source and its search/read projections serve discovery. The inventory transaction store owns `ShowSeat`, holds, and bookings for a show. The payment provider never changes inventory directly: the booking service conditionally confirms an active hold after it verifies the provider result.

## 6. Walk through the main request flow

1. The customer discovers a movie and theatre through CDN and discovery caches, then reads `GET /shows/{showId}/seat-map`. This is an availability hint, so a stale cache can show a seat that another customer just selected.
2. The customer calls `POST /shows/{showId}/holds` with selected seats and an idempotency key. The Booking API validates the show, customer, seat selection, and requested price policy.
3. In one strongly consistent transaction, the inventory store conditionally changes every requested `ShowSeat` from `AVAILABLE` to `HELD(holdId)` only if each row is still available, creates `SeatHold` with its lease expiry, writes hold items, and writes an outbox event. If any conditional update fails, the transaction rolls back and reports the unavailable seats.
4. The client starts payment using the returned `holdId`. The payment orchestrator creates one idempotent `PaymentAttempt`, redirects or tokens the client for the provider, and records provider callbacks. A payment success alone is not a booking confirmation.
5. The client or callback calls `POST /holds/{holdId}/confirm`. In one transaction, the service verifies that the payment is successful for the exact amount, the hold is still `ACTIVE`, and every `ShowSeat` is still owned by that `holdId`; it changes those rows to `BOOKED(bookingId)`, creates the booking, marks the hold confirmed, and writes an outbox event.
6. A background expiry worker conditionally changes seats from `HELD(holdId)` to `AVAILABLE` only when the hold is still active and expired. It marks the hold expired and emits an invalidation event. A late payment callback sees the expired hold and triggers payment reconciliation or refund instead of resurrecting seats.
7. For cancellation, the service checks booking and venue policy, then atomically changes eligible booked seats to `AVAILABLE` or a venue-specific blocked state, records cancellation, and requests an idempotent provider refund. The booking reports `CANCELLING` until the provider result is reconciled.

## 7. Identify bottlenecks

The main bottleneck is a hot show: many customers may contend for the same few `ShowSeat` rows, producing conditional-write failures, lock waits, retries, and seat-map refresh storms. A hot show is not solved by placing inventory in a cache, because cached writes cannot preserve the ownership invariant.

Discovery can bottleneck on popular movie and city searches, while seat-map caches can stampede after an inventory invalidation. Payment-provider latency and callback retries can leave many holds in uncertain states. Expiry scans can become expensive when they repeatedly inspect every active hold rather than directly finding leases due for release.

## 8. Scale each component

Scale CDN, API gateways, Discovery API, search projections, and catalogue read replicas horizontally. Partition discovery by city, movie, or date according to the read model; updates from the source catalogue can reach those projections asynchronously.

Route all inventory writes for a show to one transactional shard or strongly consistent partition. Partition `ShowSeat`, holds, bookings, and their transaction records by `showId` so the multi-seat hold transaction is local. A show is intentionally the coordination boundary: cross-show cart checkout is either multiple independent bookings or a separately designed saga, not an attempt to make unrelated screens one giant transaction.

For hot shows, add per-show admission control, bounded queues, per-customer rate limits, request coalescing for seat-map reads, and fair retries with jitter. Scale expiry workers by expiry-time buckets and use a lease index such as `(status, expiresAt)`; each worker claims a due hold before releasing it. Keep payment webhooks on a durable queue so provider bursts do not overload inventory writes.

## 9. Caching strategy

Cache movie, theatre, show-time, and search results aggressively because they change comparatively infrequently. Use CDN caching for posters and trailers. Versioned catalogue events invalidate or replace cache entries; a delayed update affects discovery freshness, not ownership correctness.

Cache seat maps with a short TTL and a `seatMapVersion`, but mark them as availability hints. On a hold, confirmation, expiry, or cancellation, publish an outbox event to invalidate or refresh that show’s seat-map cache. The hold endpoint always bypasses the cache and checks `ShowSeat` in the transaction store. For hot shows, use request coalescing, TTL jitter, and a bounded stale-while-revalidate window only for the displayed map; never use stale cache data to grant a hold.

## 10. Database scaling and consistency

A strongly consistent relational database or transactional distributed store is suitable for `ShowSeat`, `SeatHold`, `Booking`, and `PaymentAttempt`, because the design needs conditional multi-row state changes, uniqueness, and auditability. The final authority is an atomic conditional update or row lock transaction, not a cache, queue, or payment callback.

For example, a hold can issue an update equivalent to `UPDATE ShowSeat ... WHERE showId = ? AND seatId IN (...) AND state = 'AVAILABLE'`, verify every requested row changed, then commit the hold in the same transaction. An optimistic `version` check works as an alternative when the store supports compare-and-set. A unique active booking-seat record adds a second guard against implementation mistakes.

Search indexes, show-time read replicas, recommendation data, seat-map cache invalidations, notifications, and revenue analytics consume outbox events and are eventually consistent. If a just-confirmed booking must be read immediately, `GET /bookings/{bookingId}` reads the booking authority or a read-your-writes replica rather than an arbitrary lagging projection.

## 11. Handle concurrency

The invariant is: **a seat for a show has at most one active owner.** `AVAILABLE -> HELD(holdId) -> BOOKED(bookingId)` is a guarded state machine. A hold transaction succeeds only if all selected seats are available; it never partially grants a requested group. Conflicting customers race at the inventory authority, where one transaction wins and the other gets an explicit conflict result.

Every externally retryable command has a durable idempotency key. Repeating a hold request returns the original active hold if it is still valid; repeating confirmation returns the same booking; repeating a cancellation returns the same cancellation operation; and duplicate payment webhooks resolve to the existing `PaymentAttempt`. Provider references are unique so one successful charge cannot be attached to different bookings.

Confirmation rechecks ownership and expiry under the same transaction that writes `Booking`. This closes the race between the expiry worker, a late callback, and a customer confirmation request. A payment captured after expiry is a payment-reconciliation case, not permission to rebook the released seats.

## 12. Reliability and failure handling

Use a transactional outbox for every inventory state transition. If the API crashes after committing a hold or booking but before publishing an event, the outbox relay later emits cache invalidation, notification, analytics, and reconciliation work. Consumers are idempotent by event ID and entity version.

If the payment request times out, the client checks `GET /payment-attempts/{paymentAttemptId}` or retries with the same idempotency key; the orchestrator queries the provider before declaring failure. If a provider callback is delayed, the hold may expire; reconciliation then refunds or records credit according to policy, never guesses that the seats remain owned.

The expiry worker uses conditional release, so duplicate jobs and worker crashes are safe. A sweeper repairs holds whose expiry event was missed, while a reconciliation job finds a `HELD` seat with a missing/terminal hold, a successful payment with no booking, or a booking without its expected seat ownership. Back up the authoritative store and test point-in-time recovery; caches and analytics can be rebuilt from source records and outbox history.

## 13. Availability versus consistency trade-offs

Discovery favors availability and low latency: a customer may see a cached seat availability hint that is slightly behind the inventory store. Search and analytics can be eventually consistent because they do not allocate a scarce seat.

Inventory favors strong consistency. If the authoritative partition for a show is unavailable, reject a new hold or return a retryable error rather than grant a potentially duplicate seat. During a cache outage, discovery can fall back to read models and booking can continue only if the inventory authority is healthy. This gives up some booking availability for the no-oversell guarantee.

Payment availability is separate from inventory consistency. A provider outage means no new confirmed bookings, but it must not corrupt active holds; leases bound the temporary reservation and allow capacity to recover after abandoned checkout.

## 14. Security

Authenticate customers and authorize access to their holds, bookings, cancellations, and refund status. Do not trust a client-provided price, hold expiry, customer ID, payment status, or seat state; derive each from server-side records. Use signed, verified provider webhooks with replay protection and retain a minimal audit trail for disputes.

Apply rate limits, bot detection, queueing, and per-account purchase limits to hot shows. Protect payment tokens and personal data with TLS in transit, encryption at rest, scoped service credentials, and redacted logs. Use role-based access and auditable actions for theatre operators who create shows, change layouts, or mark a show cancelled.

## 15. Monitoring and observability

Trace a request by correlation ID through discovery, hold, payment attempt, provider callback, conditional confirmation, booking response, cache invalidation, cancellation, and refund. Log state transitions and entity IDs, but not payment secrets or unnecessary personal data.

Monitor discovery latency, cache hit rate, search-projection lag, seat-map refresh rate, inventory transaction latency, conditional-hold conflict rate, lock wait time, holds created/expired/confirmed, abandoned-hold rate, payment success and timeout rate, webhook lag, confirmation failures after payment success, oversell-invariant violations, refund age, outbox age, and consumer lag. Alert on a nonzero invariant violation, an unusually hot show partition, expired holds accumulating, or a growing population of paid-but-unconfirmed attempts.

## 16. Discuss trade-offs

| Choice | Why | Alternative | Trade-off |
|---|---|---|---|
| Strongly consistent show-seat transaction | Enforces one active owner | Cache or eventually consistent reservation writes | Lower availability under a shard outage, but no oversell |
| Expiring hold lease | Gives payment time without permanently blocking inventory | Lock seats until payment outcome | Some paid-after-expiry cases need reconciliation, but abandoned carts recover |
| Short-lived cached seat map | Reduces read load | Always read inventory | UI can be briefly stale, but the hold write remains authoritative |
| Provider success plus conditional confirm | Separates payment proof from inventory ownership | Mark booked immediately on webhook | Adds a state transition, but handles late callbacks and expiry safely |
| Transactional outbox | Makes secondary effects recoverable | Direct dual write to database and queue | Adds relay operation, but avoids lost invalidations and notifications |
| Per-show transactional partition | Keeps a seat group atomic | Global inventory transaction | A hot show needs admission control, but unrelated shows remain independent |

## 17. Future improvements

Add venue-specific cancellation windows and partial refunds, waitlists that are offered seats through the same hold API, accessible-seat policies, group booking, loyalty credits, fraud scoring, and measured adaptive admission control for launches. Add multi-region disaster recovery with a clearly defined show home region and tested failover semantics before offering cross-region inventory writes.

## Likely follow-ups

- How would you sell a family package where adjacent seats are required but one selected seat disappears?
- What happens when payment succeeds after the hold lease expires?
- How would you handle a show cancelled by the theatre after thousands of bookings exist?
- Why is a seat-map cache acceptable but a cache-based hold unsafe?

## Interview recap

The answer is: **cache movie and show discovery, but make `ShowSeat` the strongly consistent source of truth; acquire an expiring hold atomically, hand payment off idempotently, and conditionally confirm only while that hold still owns every seat.** Search and analytics may lag, while no oversell is allowed.

For a related backend-oriented discussion, see the existing [booking-system deep dive](../../../backend/system-design/design-a-booking-system.md).
