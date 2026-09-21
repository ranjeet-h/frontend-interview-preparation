# 39. Design Booking.com

[← Medium examples](index.md)

**Why interviewers ask** — Travel inventory search across hotels with date-range availability and zero double-booking tolerance.

**Core insight** — Each property-night is inventory; search must filter unavailable dates before ranking; booking is a short hold then confirm with payment.

**Architecture**

```txt
Search → geo + date availability index → ranked hotel results
Book   → hold room-night rows (TTL) → payment → confirm → supplier notification
       → review aggregation (post-stay)
```

- **Inventory** — Per hotel, per room type, per night availability counter.
- **Search** — Inverted index on location + precomputed availability bitmaps for date ranges.
- **Booking** — Serializable transaction or row lock on inventory decrement; hold expires in 15–30 min.

**Key decisions** — Pessimistic locking on scarce inventory; search index refreshed async from inventory DB; cancellation restores inventory with policy rules.

**Scale & failure** — Regional inventory shards; hold TTL prevents ghost blocks; payment failure rolls back hold; overbooking triggers compensation workflow.

**Deep link** — [Booking system](../../backend-designs/design-a-booking-system.md)

**Memory hook** — Filter by available nights first, lock the night, then charge the card.
