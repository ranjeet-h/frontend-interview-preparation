# 38. Design Twitch (Live Streaming)

[← Medium examples](index.md)

**Why interviewers ask** — Sub-5-second live latency, one-to-many video fanout, and synchronized chat at massive concurrent viewer counts.

**Core insight** — Ingest once, transcode to multiple bitrates, fan out via CDN; chat is separate real-time path from video bytes.

**Architecture**

```txt
Broadcaster → ingest (RTMP/WebRTC) → transcode ladder → CDN origin → edge viewers
Viewers     → CDN (HLS low-latency) + chat WebSocket → chat service → message fanout
            → clip/VOD storage (post-stream)
```

- **Ingest** — Single upstream per stream; failover encoder node.
- **Transcode** — Real-time ladders (360p–1080p); LL-HLS for low latency.
- **Distribution** — CDN absorbs viewer scale; origin shield for popular streams.
- **Chat** — Partitioned room per channel; rate limit and moderation bots.

**Key decisions** — Trade latency vs buffer (LL-HLS vs standard HLS); chat never blocks video; VOD is async record of live session.

**Scale & failure** — Viral stream adds CDN capacity; chat shard by channel; ingest failure kills stream — alert broadcaster; donate/events are idempotent webhooks.

**Deep link** — [File upload](../../backend-designs/design-a-file-upload-service.md) · [Real-time chat](../../backend-designs/design-a-real-time-chat-system.md)

**Memory hook** — One ingest, many CDN edges, chat rides a separate socket.
