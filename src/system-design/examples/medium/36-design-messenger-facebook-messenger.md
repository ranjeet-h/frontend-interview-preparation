# 36. Design Messenger (Facebook Messenger)

[← Medium examples](index.md)

**Why interviewers ask** — Chat at Facebook scale with social features, lighter encryption than WhatsApp, and platform integration.

**Core insight** — Same chat backbone as messaging apps (persistent connection, durable store, delivery acks) plus social graph for presence, read receipts, and rich media.

**Architecture**

```txt
Client ↔ WebSocket cluster → Message service → message store (Cassandra/Scylla)
                          → Presence + typing indicators (Redis)
                          → Media service → CDN
                          → Social graph for contact discovery
                          → Push notification fallback
```

- **Messaging** — 1:1 and group chats; sequence numbers per conversation.
- **Realtime** — Typing, online status, read receipts over same socket.
- **Media** — Thumbnails async; full res on CDN.
- **Integration** — Facebook identity, friend list import.

**Key decisions** — Transport encryption in transit; server-readable for moderation/search unlike WhatsApp E2E; group fanout similar to feed fanout.

**Scale & failure** — Shard by conversation ID; gateway sticky sessions; store-then-ack; push when socket disconnected.

**Deep link** — [Real-time chat](../../backend-designs/design-a-real-time-chat-system.md)

**Memory hook** — WhatsApp bones, Facebook graph skin, server can read for safety.
