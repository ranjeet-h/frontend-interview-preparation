# 83. Design Real-time Bidding (Ad Tech)

[← Very Hard examples](index.md)

**Why interviewers ask** — Ad auctions must close in under 100ms across millions of QPS with complex targeting — the latency budget is the product.

**Core insight** — Page load triggers parallel bid requests to SSPs/DSPs; highest eligible bid wins before a hard timeout; the hot path uses precomputed profiles and CDN creatives, not synchronous DB joins.

**Architecture**

```txt
Publisher page → ad tag → SSP auction server
                        → parallel bid fanout to N DSPs (<80ms wall clock)
                        → each DSP: profile lookup (Redis) + targeting + bid price
                        → second-price auction → winner creative from CDN
                        → impression pixel + async billing stream (Kafka)
```

- **Bid flow** — OpenRTB-style request with user context; parallel HTTP to bidders; timeout returns house ad or no-bid.
- **Latency** — Profile and segment data in memory; pre-approved creatives on CDN; zero heavy DB on auction path.
- **Targeting** — Geo, device, interests compiled offline into key-value profiles; boolean filter in auction worker.
- **Throughput** — Horizontally scaled auction tier; connection pools to bidders; drop late bids past deadline.

**Key decisions** — Separate real-time auction from campaign management UI; frequency caps in Redis; fraud and billing async; second-price auction reduces bid-shading games.

**Scale & failure** — Slow DSP poisoning auction latency, profile store outage stripping targeting, and timeout storms causing blank ads break revenue first. Mitigation: per-DSP circuit breakers, cached fallback segments, strict auction wall clock.

**Deep link** — [Advertising platform](../medium/44-design-advertising-platform.md)

**Memory hook** — Fan out bids in parallel, cut at the deadline, bill impressions after the ad is already on screen.
