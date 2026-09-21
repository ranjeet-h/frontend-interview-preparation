# 35. Design Notification System

[← Medium examples](index.md)

**Why interviewers ask** — Multi-channel delivery (push, email, SMS) with templates, scheduling, retries, and user preferences at high volume.

**Core insight** — Producers fire events; notification service routes to channel workers asynchronously — never block the caller on SMTP or FCM latency.

**Architecture**

```txt
App event → Notification API → template render → priority queue (Kafka)
                            → [email | SMS | push] workers → provider APIs
                            → delivery status store + DLQ for failures
```

- **API** — Accept event + user + channel prefs; return immediately after enqueue.
- **Templates** — Parameterized per locale; versioned in DB.
- **Workers** — Per-channel retry with exponential backoff; dead letter after N attempts.
- **Analytics** — Track sent, delivered, opened, clicked per campaign.

**Key decisions** — At-least-once delivery with dedup keys; user preference opt-out honored before enqueue; separate queues per channel for isolation.

**Scale & failure** — Kafka partitions by user ID; provider rate limits trigger backoff; DLQ for manual replay; idempotent notification IDs prevent duplicate pushes.

**Deep link** — [Notification system](../../backend-designs/design-a-notification-system.md) · [Distributed notification](../../backend-designs/design-a-distributed-notification-service.md)

**Memory hook** — Enqueue fast, deliver slow, retry with dedup keys.
