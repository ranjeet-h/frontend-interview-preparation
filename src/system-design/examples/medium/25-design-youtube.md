# 25. Design YouTube

[← Medium examples](index.md)

**Why interviewers ask** — Combines huge blob storage, async transcoding pipelines, CDN streaming, and recommendation at planetary scale.

**Core insight** — Upload and watch are different systems: upload is async pipeline to many encoded renditions; watch is read-heavy CDN with adaptive bitrate.

**Architecture**

```txt
Upload → chunk ingest → transcode workers (480p–4K, thumbnails, captions) → object storage
Watch  → CDN (HLS/DASH segments) ← metadata DB + recommendation service
       → Search index (Elasticsearch) + trending
```

- **Upload** — Resumable chunked upload; virus scan; enqueue transcode jobs per quality level.
- **Storage** — Hot replicas for viral videos; cold tier for long tail.
- **Streaming** — ABR player picks segment quality from bandwidth; CDN at edge.
- **Discovery** — Collaborative filtering + engagement signals; separate from video bytes.

**Key decisions** — Never block upload on transcode (async); multiple renditions mandatory; search index is eventually consistent with catalog.

**Scale & failure** — 500+ hours uploaded per minute needs elastic worker pools; CDN handles view spikes; if transcode lags, serve lower quality first; dedupe identical uploads via content hash.

**Deep link** — [File upload](../../backend-designs/design-a-file-upload-service.md) · [Recommendation backend](../../backend-designs/design-a-recommendation-backend.md)

**Memory hook** — Upload is a factory line, watch is a CDN menu of quality levels.
