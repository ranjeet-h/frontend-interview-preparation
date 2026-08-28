# HLD Interview Designs

Use this loop to turn an ambiguous product prompt into a structured system-level answer. Start with the constraints that shape the architecture, then make the main flow, failure behavior, and trade-offs easy to follow.

## 17-point answer loop

1. Clarify requirements
2. Estimate scale
3. Define APIs
4. Define the data model
5. Draw the high-level architecture
6. Walk through the main request flow
7. Identify bottlenecks
8. Scale each component
9. Caching strategy
10. Database scaling and consistency
11. Handle concurrency
12. Reliability and failure handling
13. Availability versus consistency trade-offs
14. Security
15. Monitoring and observability
16. Discuss trade-offs
17. Future improvements

## Designs

| Design | Interview focus |
|---|---|
| [URL Shortener](url-shortener.md) | Durable mapping and cache-first redirects |
| [Rate Limiter](rate-limiter.md) | Distributed policy enforcement and atomic counters |
| [Notification System](notification-system.md) | Durable intent and multi-channel delivery |
| [WhatsApp](whatsapp.md) | Real-time messaging, ordering, and offline delivery |
| [Twitter Feed](twitter-feed.md) | Feed fanout, ranking, and celebrity traffic |
| [BookMyShow](bookmyshow.md) | Seat inventory, holds, and booking consistency |
| [Uber](uber.md) | Location ingestion, matching, and trip state |
| [YouTube](youtube.md) | Video upload, processing, and delivery |
| [Google Drive](google-drive.md) | File storage, sync, and collaboration |
| [Payment System](payment-system.md) | Payment orchestration, idempotency, and ledgers |
