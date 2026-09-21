# 31. Design TikTok

[← Medium examples](index.md)

**Why interviewers ask** — Recommendation-first feed (not social-first), short-video pipeline, and viral spike handling.

**Core insight** — The For You Page is the product; upload/transcode is commodity; ranking loop (watch time, rewatches, shares) drives retention.

**Architecture**

```txt
Upload → transcode (multi-bitrate short video) → object storage + CDN
For You → candidate retrieval (billions → thousands) → real-time ranker → cache
Social  → duets/stitches (video graph), comments, likes
Analytics → engagement stream → ML training + creator dashboards
```

- **Video pipeline** — Fast transcode for short clips; music sync and effects as async jobs.
- **FYP** — Two-stage retrieval then ranking; explore/exploit for new creators.
- **Viral handling** — Auto-scale CDN; hot video replicated to more edge pops.

**Key decisions** — Optimize for watch-time, not follower graph; cache ranked feed per user with short TTL; A/B infra for ranking experiments.

**Scale & failure** — Engagement Kafka must not block playback; ranking stale by seconds is fine; transcode backlog degrades upload UX before read path.

**Deep link** — [Social media feed](../../backend-designs/design-a-social-media-feed.md) · [Recommendation backend](../../backend-designs/design-a-recommendation-backend.md) · [Comments](../../backend-designs/design-a-comments-system.md)

**Memory hook** — FYP is retrieve then rank; followers matter less than seconds watched.
