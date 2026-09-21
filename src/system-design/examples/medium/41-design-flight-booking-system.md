# 41. Design Flight Booking System

[← Medium examples](index.md)

**Why interviewers ask** — Same as hotel booking but seat-level inventory, GDS integration, and strict no-overbook rules.

**Core insight** — A seat on a flight is a finite resource; reservation must atomically decrement seat count or fail; payment confirms the hold.

**Architecture**

```txt
Search → flight schedule + seat availability cache (by flight + class)
Reserve → lock seat row (pessimistic) or optimistic with retry → payment → ticket issue
        → PNR record → email/itinerary
Timeout → release held seats after 15–30 min
```

- **Inventory** — Seats per flight segment and fare class; separate from schedule metadata.
- **Booking** — Two-phase: hold seats, then pay; hold has TTL.
- **Ticketing** — Immutable ticket record after payment; changes are rebooking flows.

**Key decisions** — Pessimistic lock for last seats on full flights; optimistic OK when plenty of capacity; idempotent booking reference (PNR).

**Scale & failure** — Hot routes shard inventory; hold expiry job releases seats; payment failure must release hold in same transaction; airline API outage queues retry.

**Deep link** — [Booking system](../../backend-designs/design-a-booking-system.md) · [Payment system](../../backend-designs/design-a-payment-system.md)

**Memory hook** — Hold the seat with a timer, pay or lose it, PNR is the receipt.
