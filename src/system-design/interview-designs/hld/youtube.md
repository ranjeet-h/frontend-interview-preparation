# YouTube

YouTube is an **ingest-and-serve** system: rare, large uploads become many small segments, and those segments are served to an enormous number of viewers through a CDN. The pressure is the asymmetry — a few uploads per second against millions of views per second — plus the heavy, asynchronous transcoding pipeline in between.

This design is an interview scope, not a product claim. It covers resumable upload, object storage, a transcoding pipeline, metadata, CDN delivery, privacy, moderation, and playback manifests. Recommendations, ads, and live streaming are extensions.

## 1. Clarify requirements

Functional requirements:

- Creators **upload** a video, resumably, over an unreliable connection.
- The system **transcodes** it into multiple renditions (resolutions/bitrates).
- Viewers **stream** it with adaptive bitrate through a CDN.
- Metadata (title, visibility, duration) is queryable.
- Privacy (public/unlisted/private) and **moderation** states are enforced.

Non-functional requirements (interview assumptions):

- Views vastly outnumber uploads (millions/s vs a few/s).
- Upload must be **durable and resumable**; a dropped connection resumes, not restarts.
- Transcoding is **asynchronous** and CPU-heavy; playback must not wait for all renditions.
- Playback start latency target: under ~1 s to first segment.

Out of scope: recommendations, ads, live streaming, and DRM key management.

## 2. Estimate scale

Useful numbers, labelled as assumptions:

- 1B views/day → ~**100k+ segment requests/s** at peak (a view fetches many segments).
- 500 hours uploaded per minute globally → a few **uploads/s**.
- Each upload fans out to **~5 renditions** → transcoding jobs scale with uploads × renditions, not with views.
- Storage grows with uploads × renditions × duration, not with views.

The read path is **CDN-dominated**; the write path is **transcoding-dominated**. They scale independently.

## 3. Define APIs

```http
POST /videos/upload/initiate        -> { uploadId, partUrls[] }      # resumable
PUT  /videos/upload/{uploadId}/part/{n}   (raw bytes)
POST /videos/upload/{uploadId}/complete   -> { videoId }
GET  /videos/{videoId}              -> metadata, manifestUrl
GET  /videos/{videoId}/manifest.m3u8  (served by CDN)
POST /videos/{videoId}/visibility   { "public" | "unlisted" | "private" }
```

Upload is chunked and resumable; playback fetches a **manifest** that lists segment URLs per rendition.

## 4. Define the data model

- `Video` — id, owner, title, visibility, duration, status.
- `UploadSession` — id, videoId, parts received, checksum, expiresAt.
- `Rendition` — videoId, resolution, bitrate, codec, status.
- `Segment` — renditionId, index, objectKey, duration.
- `Manifest` — videoId → rendition list + segment URLs.
- `Moderation` — videoId, state (pending/approved/blocked), reason.

Raw uploads and transcoded segments live in **object storage**; metadata and manifests live in a durable metadata store.

## 5. Draw the high-level architecture

```text
Creators ──resumable upload──► Upload service ──► Object storage (raw)
                                     │
                                     └─► Transcode queue ─► Transcode workers ─► Object storage (renditions)
                                                                  │
                                                                  └─► Metadata + Manifest
Viewers ──► CDN edge ──(miss)──► Origin (object storage)        ▲
     └────► Metadata service (manifest, visibility) ────────────┘
```

Upload and transcoding are asynchronous and off the playback path; the CDN carries the view load and only misses reach the origin.

## 6. Walk through the main request flow

**Upload:** the creator initiates a resumable session, uploads parts (each acknowledged and checksummed), and completes it. The raw object is durable in object storage, the `Video` is `UPLOADED`, and a transcode job is enqueued.

**Transcode:** workers pull the job, produce renditions as segments, write them to object storage, and update `Rendition`/`Manifest`. When the first rendition is ready the video can be played; later renditions fill in.

**Playback:** a viewer fetches metadata and the manifest (visibility and moderation checked), the player requests segments from the nearest CDN edge, and only cache misses reach the origin.

## 7. Identify bottlenecks

- **Transcoding CPU** — the hard, expensive bottleneck; a backlog delays publishing.
- **Upload bandwidth** — large payloads over unreliable links; needs resumability.
- **CDN capacity and origin egress** — popular videos are cheap on the CDN; a cold or blocked video hits the origin.
- **Metadata hot keys** — a viral video's metadata is requested far more than others.
- **Manifest generation** — must not be on the per-segment path.

## 8. Scale each component

CDN edges scale globally and absorb the view load. Object storage scales horizontally and is effectively unbounded. Transcode workers scale on **queue depth**, with priority lanes (a large creator or a live-event upload). Metadata shards by `videoId` with read replicas; manifests are cached at the edge. Upload service is stateless behind a load balancer.

## 9. Caching strategy

The CDN is the cache: popular segments are served at the edge with a long TTL (segments are immutable once written). Manifests are cached briefly and revalidated on visibility change. Metadata is cached with a short TTL and invalidated on update. Because segments are **immutable**, cache invalidation is trivial — new content gets new keys.

## 10. Database scaling and consistency

Object storage is the durable source for bytes; the metadata store is the source for `Video`/`Rendition`/`Manifest`. Metadata is **eventually consistent** for view-facing fields (view counts) and **strongly consistent** for ownership and visibility changes. Transcoding is asynchronous, so "video exists" and "video is playable" are distinct states. Shard metadata by `videoId`; use read replicas for hot metadata.

## 11. Handle concurrency

Upload sessions are **idempotent per part** (a retried part does not duplicate). Transcode jobs are deduplicated by `(videoId, rendition)` so a retried job does not produce two renditions. Manifest updates are atomic swaps of an immutable manifest object so a player never sees a half-written manifest.

## 12. Reliability and failure handling

- **Dropped upload:** resume from the last acknowledged part; never restart.
- **Transcode worker crash:** the job returns to the queue; idempotent outputs prevent duplicates.
- **Poison input:** after N failures, move to a dead-letter queue for inspection.
- **Origin outage:** the CDN serves cached segments; playback degrades gracefully.
- **Moderation failure:** fail closed for public visibility; keep the video private until reviewed.

## 13. Availability versus consistency trade-offs

Playback is **AP**: serve from the CDN and tolerate slightly stale metadata (a view count is eventually consistent). Ownership, visibility, and moderation are **CP**: a takedown must propagate and be enforceable, so those changes are strongly consistent and short-TTL cached. So one system, two guarantees by data type.

## 14. Security

Authenticate creators; authorize uploads and visibility changes. Serve segments through **signed, expiring URLs** so private/unlisted content is not guessable. Encrypt at rest and in transit; support DRM for premium content. Run **moderation** (automated + human) before public exposure, and treat abuse reports as a first-class workflow.

## 15. Monitoring and observability

Track upload success and resume rate, transcode **queue depth and job latency**, rendition completion time, CDN **hit ratio** and origin egress, playback start latency and rebuffer rate, manifest/metadata latency, and moderation backlog. Alert on rising transcode lag, falling CDN hit ratio, and playback error spikes.

## 16. Discuss trade-offs

| Choice | Why | Alternative | Trade-off |
|---|---|---|---|
| Immutable segments | Trivial CDN caching and invalidation | Mutable files | Simpler storage, but cache invalidation becomes hard |
| Async transcoding | Upload returns fast; playback starts on the first rendition | Synchronous transcode | Simple flow, but upload blocks for minutes |
| CDN-first delivery | Absorbs millions of views/s | Origin-direct | Simple, but origin egress is prohibitive |
| Sharded metadata | Scales reads for hot videos | Single metadata DB | Simple, but a hot video saturates it |
| Signed URLs | Private content is not guessable | Public object URLs | Simple, but leaks private content |

## 17. Future improvements

Add live streaming, better adaptive-bitrate ladders, per-title encoding, multi-region origin failover, smarter prefetching, and richer moderation (ML classifiers + appeals). Move to a content-addressed store to improve dedup and cacheability.

## Interactive Visualizer

Raise the view rate and watch the read path (CDN → origin) dwarf the write path, while uploads drive the transcoding pipeline and metadata. Press **Scale up** to add CDN edges, origin shards, transcode workers, metadata nodes, or upload nodes and see what failed, what changed, and what improved.

<div
  id="youtube-hld"
  class="hld youtube-hld-visualizer"
></div>

## Interview recap

The interview answer is: "uploads are resumable and durable into object storage; transcoding is an asynchronous, queue-driven fan-out into immutable segments; and playback is served from the CDN, with only misses reaching the origin."

Likely follow-ups:

- Why are segments immutable, and how does that simplify caching?
- Upload returns before transcoding finishes — how does the video become playable?
- A transcode worker crashes mid-job — how do you avoid duplicate renditions?
- Why is playback eventually consistent but a takedown strongly consistent?
