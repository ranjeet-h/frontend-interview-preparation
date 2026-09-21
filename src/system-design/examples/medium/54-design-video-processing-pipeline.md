# 54. Design Video Processing Pipeline

[← Medium examples](index.md)

**Why interviewers ask** — Async media factory: ingest, transcode, store, deliver — ties upload to playback with cost and latency tradeoffs.

**Core insight** — Video processing is a DAG of jobs per asset; prioritize fast low-res preview while high-res encodes in background.

**Architecture**

```txt
Upload (chunked) → virus scan → metadata extract → encode queue
                → workers (parallel renditions) → object storage
                → CDN publish → playback API (manifest per device)
```

- **Ingest** — Resumable multipart; validate format; enqueue by priority (live vs VOD).
- **Encoding** — Farm of workers; GPU for H.264/HEVC/AV1; thumbnail and sprite generation.
- **Storage** — Lifecycle policies; hot CDN for popular; glacier for archive.
- **DRM** — Optional packaging step before CDN.

**Key decisions** — Job DAG with retry per stage; idempotent job IDs per rendition; preview quality first for UX.

**Scale & failure** — Autoscale workers on queue depth; failed transcode retries with backoff; partial outputs never marked ready; cost cap via spot instances for batch.

**Deep link** — [File upload](../../backend-designs/design-a-file-upload-service.md) · [Image upload and resize](../../backend-designs/design-an-image-upload-and-resize-service.md)

**Memory hook** — Upload enqueues a DAG; ship low-res first, polish in the background.
