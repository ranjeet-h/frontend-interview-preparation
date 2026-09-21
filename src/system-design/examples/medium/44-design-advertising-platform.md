# 44. Design Advertising Platform

[← Medium examples](index.md)

**Why interviewers ask** — Real-time ad serving, billing, click fraud, and campaign management — latency and money both matter.

**Core insight** — Ad request must resolve targeting, auction, and creative serve in tens of milliseconds; billing and attribution are async.

**Architecture**

```txt
Publisher page → ad server → user profile + context → auction (RTB bids)
                          → winner creative from CDN → impression/click trackers
Campaign DB ← billing (CPM/CPC) ← click/conversion stream (Kafka)
Fraud service ← anomaly detection on click patterns
```

- **Campaign manager** — Advertisers set budget, targeting, creatives.
- **Ad server** — Match eligible ads; run second-price or unified auction.
- **Tracking** — Pixel fires on impression/click; dedupe fraudulent clicks.
- **Billing** — Aggregate events into invoices; pacing prevents budget blowout.

**Key decisions** — Separate hot ad serve path from cold reporting; frequency capping in Redis; fraud blocks before billing.

**Scale & failure** — CDN for creatives; auction timeout returns house ad; click spam triggers account freeze; budget exhaustion stops serve in real time.

**Deep link** — [Analytics dashboard backend](../../backend-designs/design-an-analytics-dashboard-backend.md)

**Memory hook** — Auction in milliseconds, bill in batches, fraud watches clicks.
