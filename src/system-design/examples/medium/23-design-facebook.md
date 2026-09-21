# 23. Design Facebook

[← Medium examples](index.md)

**Why interviewers ask** — Goes beyond Twitter: richer graph (friends, groups, pages), ranked feed, and real-time notifications at billion-user scale.

**Core insight** — The social graph is the product; newsfeed is graph traversal plus ranking, not just chronological fanout.

**Architecture**

```txt
Client → API → Graph service (friends, groups) → graph store / custom index
            → Feed aggregator → candidate posts → ranking ML → cached feed
            → Notification service → WebSocket + message queue
            → Search (people, posts)
```

- **Graph layer** — Store relationships; run BFS-style candidate generation for "friends + groups" posts.
- **Ranking** — Score candidates by recency, engagement, affinity; precompute features offline.
- **Notifications** — Queue events (likes, comments, tags); push via WebSocket with FCM/APNs fallback.

**Key decisions** — Separate graph store from feed store; rank at read time or pre-rank top candidates; notification delivery is at-least-once with dedup keys.

**Scale & failure** — Partition graph by user ID; cache ranked feed slices; notification storms get throttled and batched; search lags primary graph slightly.

**Deep link** — [Social media feed](../../backend-designs/design-a-social-media-feed.md) · [Notification system](../../backend-designs/design-a-notification-system.md)

**Memory hook** — Graph for who you see, rank for what you see first, queue for what pings you.
