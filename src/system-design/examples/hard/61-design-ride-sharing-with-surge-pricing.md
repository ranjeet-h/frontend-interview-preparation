# 61. Design Ride-Sharing with Surge Pricing

[← Hard examples](index.md)

**Why interviewers ask** — Combines real-time geospatial matching with dynamic pricing economics — supply, demand, and fairness in one system.

**Core insight** — Surge is a feedback loop: raise price where demand exceeds supply to pull more drivers in and throttle riders until the market rebalances.

**Architecture**

```txt
Rider app → trip request → geospatial index (drivers near pickup)
                        → matching service → assign driver
                        → pricing service (demand/supply ratio per geo-cell)
Driver app → location pings → cell aggregator → surge multiplier cache
```

- **Matching** — Geohash cells index available drivers; greedy or batch assignment minimizes wait time.
- **Surge calculation** — `multiplier = f(active_riders / available_drivers)` per cell; refresh every 30–60s; cap max multiplier.
- **Price prediction** — Historical patterns pre-warm surge for events (concerts, rain).
- **Trip state** — Locked fare at request time or live adjustment — pick one and document it.

**Key decisions** — Show surge before confirm to avoid bait-and-switch; smooth multipliers to prevent flicker; separate cells small enough to be fair, large enough for stable supply.

**Scale & failure** — Partition by city/region; stale driver locations cause bad matches — TTL evict idle pins; gaming (wait for surge drop) needs rate limits and minimum fare floors.

**Deep link** — [Ride booking backend](../../backend-designs/design-a-ride-booking-backend.md) · [Payment system](../../backend-designs/design-a-payment-system.md)

**Memory hook** — Cells count riders vs drivers — price is the valve that balances the market.
