# 24. Design WhatsApp

[← Medium examples](index.md)

**Why interviewers ask** — Proves you understand persistent connections, message ordering, delivery guarantees, and E2E encryption under massive concurrent load.

**Core insight** — Messages must arrive in order per chat with at-least-once delivery; online users get WebSocket push, offline users get store-and-forward plus push notification.

**Architecture**

```txt
Client ↔ WebSocket gateway (connection pool) → Message service → Cassandra (messages)
                                            → Presence (Redis)
                                            → Media service → encrypted blob storage
                                            → Notification service (FCM/APNs)
```

- **Connection service** — Long-lived WebSocket per device; route by user ID to the right gateway node.
- **Message service** — Write to durable log keyed by chat; ack pipeline: sent → delivered → read.
- **Presence** — Heartbeat every few seconds; Redis for online status.
- **Media** — Encrypt client-side, upload ciphertext, decrypt on recipient device.

**Key decisions** — Cassandra for write-heavy chat history; message queue for offline delivery retries; E2E means server stores ciphertext only; per-chat ordering via sequence numbers.

**Scale & failure** — Shard chats across nodes; reconnect replays missed sequence range; exponential backoff on push; never drop without durable write first.

**Deep link** — [Real-time chat](../../backend-designs/design-a-real-time-chat-system.md) · [Notification system](../../backend-designs/design-a-notification-system.md)

**Memory hook** — WebSocket if online, queue if offline, sequence numbers keep chat order.
