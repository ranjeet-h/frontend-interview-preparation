# 32. Design Airbnb

[← Medium examples](index.md)

**Why interviewers ask** — Geospatial search, inventory calendars with no double-booking, reviews, and payments in a marketplace.

**Core insight** — Listings are searchable inventory with date-level availability; booking must be atomic per listing-night; trust comes from reviews and verified identity.

**Architecture**

```txt
Guest → Search (geo + filters + availability index) → listing detail
     → Booking service (hold → confirm → pay) → calendar (per-night inventory)
     → Payment escrow → host payout
     → Review service (post-stay, bilateral)
```

- **Listings** — Host CRUD, photos on CDN, geospatial index for "near me."
- **Calendar** — Each night is inventory unit; pessimistic lock or compare-and-swap on book.
- **Search** — Pre-filter by date range availability before ranking results.

**Key decisions** — Booking hold with TTL (15–30 min) before payment; strong consistency on calendar writes; search index eventually consistent with availability.

**Scale & failure** — Shard listings by region; double-booking prevented by row-level lock or serializable transaction; payment failure releases hold; review spam filtered async.

**Deep link** — [Booking system](../../backend-designs/design-a-booking-system.md) · [Payment system](../../backend-designs/design-a-payment-system.md)

**Memory hook** — Search finds nights, calendar locks nights, payment confirms nights.
