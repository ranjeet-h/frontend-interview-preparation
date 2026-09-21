# 21. Design Instagram

[← Medium examples](index.md)

**Why interviewers ask** — Tests whether you can split a social product into read-heavy feeds, write-heavy media uploads, and real-time engagement without one path blocking the other.

**Core insight** — Photos are immutable blobs served from CDN; the hard part is feed fanout (push to followers vs pull at read time) and keeping likes/comments fast without locking the feed.

**Architecture**

```txt
Client → API Gateway → [User | Photo | Feed | Social] services
                              ↓           ↓         ↓
                         PostgreSQL    S3 + CDN   Redis feed cache
                              ↓
                         Kafka → search index, notifications, analytics
```

- **User service** — profiles, follow graph in relational DB, cached in Redis.
- **Photo service** — upload to object storage, async resize/compress, serve via CDN.
- **Feed service** — hybrid fanout: push posts into follower feed caches for normal users; pull/merge for celebrities with huge follower counts.
- **Social layer** — likes/comments as separate counters; WebSocket or push for live updates.

**Key decisions** — Push fanout for low-latency home feed vs pull for celebrity posts; eventual consistency on feed is acceptable; denormalize follower lists for fanout workers; shard by user ID.

**Scale & failure** — Shard user and media metadata; read replicas for profiles; CDN absorbs image traffic; if fanout queue backs up, degrade to pull-based feed for affected users; idempotent post IDs prevent duplicate feed entries.

**Deep link** — [Social media feed](../../backend-designs/design-a-social-media-feed.md) · [Comments](../../backend-designs/design-a-comments-system.md) · [Image upload](../../backend-designs/design-an-image-upload-and-resize-service.md)

**Memory hook** — Store photos in S3, serve from CDN, fanout feeds in Redis — celebrities break push, so hybrid.
