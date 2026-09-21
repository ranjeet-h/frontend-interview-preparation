# Design an Image Upload and Resize Service

## 1. Understand the Problem First — Clarify Before Designing

Imagine a user uploading a 48-megapixel vacation photo—a 15MB HEIC file straight from an iPhone—into a standard web app. If that file hits a typical Node.js API server endpoint directly:
1. The server buffers 15MB of raw multipart data in memory.
2. The server spins up an unthrottled image-processing tool to resize it.
3. Node's single-threaded event loop starves, CPU spikes to 100%, memory balloons by 250MB during raster decoding, health checks time out, and the container crashes.
4. Meanwhile, mobile clients on 4G download that same uncompressed 15MB file to render a 60px circular avatar, burning user cellular data and stalling the feed.

Designing an image upload and resize service is fundamentally about **decoupling heavy compute from API servers** and **delivering optimized bytes to diverse screens at global scale**.

Before putting boxes on a whiteboard, clarify the operational constraints with your interviewer:

- **Scale and Traffic Profile**:
  - *Write throughput*: How many uploads per day? (e.g., 10 million uploads/day ≈ 115 uploads/sec average, ~500/sec peak).
  - *Read throughput*: What is the read-to-write ratio? Image systems are notoriously read-heavy (typically 50:1 to 100:1). 100:1 means 1 billion image reads/day ≈ 11,500 requests/sec average, ~50,000/sec peak.
- **Image Specifications**:
  - *Max upload size*: e.g., 50MB raw input.
  - *Input formats*: JPEG, PNG, WebP, HEIC/HEIF, TIFF, SVG.
  - *Output targets*: Modern formats (AVIF, WebP) with legacy fallback (JPEG/PNG), in various viewport sizes and aspect ratios.
- **Latency & User Experience**:
  - Upload acknowledgement must be fast (< 1s from the client's perspective).
  - Image delivery from CDN edge must be sub-50ms globally; uncached on-demand transformation under 500ms.
- **Storage & Durability**:
  - Originals must never be lost (11 9s durability like AWS S3 / Google Cloud Storage).
  - Derivatives can be regenerated if lost, but caching them saves compute costs.

---

## 2. The Core Insight — The Decision Everything Else Flows From

The single most critical architectural insight for image systems is:

> **Never let binary image payloads pass through your application servers, and never transcode images synchronously on the web request path.**

An image system splits cleanly into two independent lifecycles:

1. **Ingestion (Upload Plane)**: The API server acts only as an authentication and authorization gatekeeper. It generates a cryptographically signed upload ticket (e.g., AWS S3 Pre-Signed URL or GCS Signed URL). The client uploads raw binary data directly to object storage. The API server never buffers the binary stream.
2. **Transformation & Delivery (Read Plane)**: Image decoding and transcoding are memory- and CPU-bound operations. You either process standard sizes asynchronously using an event-driven queue, or transform arbitrary sizes on-the-fly using dedicated, memory-isolated edge/serverless image proxies backed by aggressive CDN caching.

Every component in this architecture exists to protect your core application servers from binary I/O and transcoding compute.

---

## 3. High-Level Architecture — Components and Why Each Exists

```txt
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                 UPLOAD WORKFLOW                                  │
└──────────────────────────────────────────────────────────────────────────────────┘

   1. Request Upload Ticket      ┌──────────────────┐   2. Issue Pre-Signed URL
 ┌──────────────────────────────►│    API Server    ├─────────────────────────┐
 │                               │ (Auth & Metadata)│                         │
 │                               └────────┬─────────┘                         │
 │                                        │                                   ▼
┌┴────────┐ 3. PUT Raw Binary             │ Record Pending              ┌───────────┐
│ Client  ├───────────────────────────────┼────────────────────────────►│ S3 Bucket │
└─────────┘ (Direct to S3)                │                             │ (Original)│
                                          ▼                             └─────┬─────┘
                                 ┌──────────────────┐                         │ 4. S3 Event:
                                 │   Metadata DB    │                         │ ObjectCreated
                                 │ (PostgreSQL/DDB) │                         ▼
                                 └────────▲─────────┘                  ┌──────────────┐
                                          │                            │  SQS Queue   │
                                          │ 6. Update Status (READY)   └──────┬───────┘
                                          │                                   │ 5. Pull Job
                                   ┌──────┴──────────┐                        ▼
                                   │ Derivative S3   │◄─────────────────┌─────────────┐
                                   │     Bucket      │  Upload Variants │ Transcode   │
                                   └─────────────────┘                  │ Worker Pool │
                                                                        └─────────────┘

┌──────────────────────────────────────────────────────────────────────────────────┐
│                                DELIVERY WORKFLOW                                 │
└──────────────────────────────────────────────────────────────────────────────────┘

 ┌────────┐ 1. GET /images/xyz/w_600.webp   ┌─────────────┐ Cache Hit (<30ms)
 │ Client ├───────────────────────────────►│  Edge CDN   ├───────────────────────┐
 └────────┘                                │(CloudFront/ ◄───────────────────────┘
                                           │ Cloudflare) │
                                           └──────┬──────┘
                                                  │
                                                  │ Cache Miss (Origin Request)
                                                  ▼
                                      ┌───────────────────────┐
                                      │  Image Transform      │
                                      │  Service / Edge Worker│
                                      └───────────┬───────────┘
                                                  │
                             ┌────────────────────┴────────────────────┐
                             │                                         │
                             ▼ Fetch Original                          ▼ Fetch Pre-generated
                     ┌───────────────┐                         ┌───────────────┐
                     │   S3 Origin   │                         │ Derivative S3 │
                     │ (Raw Originals)                         │    Bucket     │
                     └───────────────┘                         └───────────────┘
```

### Component Breakdown

1. **API Server (Control Plane)**:
   - Authenticates the user and verifies upload permissions and quotas.
   - Validates file constraints (expected MIME type, maximum byte length).
   - Generates a short-lived Pre-Signed S3 URL and creates an image record in the database with status `PENDING`.
2. **Object Storage (AWS S3 / Cloud Storage)**:
   - **Original Bucket**: Private, highly durable store holding unmodified raw files with versioning enabled.
   - **Derivative Bucket**: Stores generated presets (thumbnails, standard web dimensions). Can use cheaper lifecycle tiers since derivatives are reproducible.
3. **Event Notification & Queue (S3 Event -> SQS)**:
   - When the client finishes uploading directly to S3, S3 automatically publishes an `ObjectCreated` event to an SQS queue. This completely decouples ingestion from processing.
4. **Asynchronous Transcoding Worker Pool**:
   - Auto-scaling fleet of compute-optimized instances or containers running high-performance C-based image libraries (`libvips` via Node.js `Sharp` or Go `bimg`).
   - Pulls jobs from SQS, downloads original, validates magic bytes, strips dangerous EXIF metadata, resizes to core presets, writes derivatives back to the Derivative S3 bucket, and marks metadata status as `READY`.
5. **On-Demand Edge Transformation Proxy**:
   - A stateless proxy (e.g., AWS Lambda@Edge, Cloudflare Workers, or dedicated `imgproxy` instances) for dynamic or custom aspect ratios requested by clients.
   - Resizes on-the-fly, sends the response back to the CDN edge, and caches the result.
6. **Content Delivery Network (CDN)**:
   - Global points of presence (CloudFront, Cloudflare, Fastly) that cache images at the edge.
   - Handles format content negotiation via the HTTP `Accept` header (serving AVIF or WebP automatically to browsers that support it).
7. **Metadata Database (PostgreSQL or DynamoDB)**:
   - Stores `image_id`, `owner_id`, `original_filename`, `mime_type`, `byte_size`, `dimensions`, `blurhash` (for instant UI placeholders), and processing `status`.

---

## 4. Key Technical Decisions — With Real Tradeoffs

### Decision 1: Direct Pre-Signed Uploads vs. Uploading via API Server

| Strategy | Pros | Cons | Verdict |
|---|---|---|---|
| **API Server Proxy** (Client -> API -> S3) | Centralized validation; easy to enforce rate limits before storage. | Sockets tied up during slow mobile uploads; doubled network bandwidth cost; API memory pressure. | **Rejected** for high-scale systems. |
| **Pre-Signed S3 URLs** (Client -> S3 directly) | Zero load on API servers; unlimited upload concurrency; resumes multi-part uploads natively to S3. | Two-step API handshake; requires S3 event wiring to know when upload finishes. | **Selected**. Scales effortlessly to millions of concurrent uploads. |

### Decision 2: Pre-Generating Variants vs. On-The-Fly (On-Demand) Resizing vs. Hybrid

- **Batch Pre-Generation at Upload Time**:
  - *How it works*: Worker generates all possible sizes (e.g., 50px, 150px, 300px, 600px, 1200px across JPEG, WebP, AVIF = 15 files) immediately after upload.
  - *Tradeoff*: Instant delivery on first read, but massive storage waste. If users only view 20% of uploaded photos, 80% of generated files sit unused forever. If UI designs change (e.g., new 450px card layout), you must run multi-day batch backfills across petabytes of data.
- **Pure On-Demand (Lazy) Transformation**:
  - *How it works*: Only the original is stored. When a user requests `/images/id/w_300,h_200.webp`, an edge proxy resizes it in real time, serves it, and caches it in the CDN.
  - *Tradeoff*: Zero wasted storage. Infinite flexibility for UI changes. However, the first user to view any image variant pays a 200–500ms compute latency penalty ("cold start"), and a viral post can cause a cache stampede.
- **The Hybrid Strategy (Recommended Production Pattern)**:
  - Pre-generate the **2 most critical standard presets** on upload: the tiny avatar/thumbnail (150x150) and the primary feed size (600px). These cover 90% of user-facing views with zero cold-start latency.
  - All uncommon, dynamic, or device-specific sizes are generated **on-demand** by the image transformation proxy and cached indefinitely at the CDN edge.

### Decision 3: Image Processing Library — `Sharp` / `libvips` vs. `ImageMagick`

- `ImageMagick` / `GraphicsMagick`: Historically popular, but loads full uncompressed pixel buffers into memory and spawns subprocesses. High memory footprint, slower execution, and a history of critical vulnerabilities (e.g., ImageTragick).
- `Sharp` (`libvips` C library binding): Operates as a streaming pipeline. It processes image pixels row-by-row in C/C++ memory without loading the entire uncompressed image into Node's V8 heap. It is **4x to 8x faster** and consumes a fraction of the RAM.

### Decision 4: Cache Key Strategy & URL Design

Use deterministic, path-based URLs with immutable content hashes or version IDs:

```http
GET https://cdn.example.com/media/u1298/img_987abc/w_800,q_80,f_auto/photo.webp
```

- **Path-based vs. Query Parameters**: CDNs and proxy caches handle path-based URLs more reliably without parameter reordering issues.
- **Immutable Cache Headers**: Since images are keyed by unique IDs or hashes, send `Cache-Control: public, max-age=31536000, immutable`. Never overwrite an image in place; issue a new ID on update. This eliminates the need for expensive, unreliable CDN cache purges.

---

## 5. Deep Dives — The Parts That Actually Matter

### Deep Dive 1: Security and Abuse Defense (Decompression Bombs & EXIF Leaks)

#### The "Pixel Flood" / Decompression Bomb Attack
An attacker crafts a tiny 50KB JPEG file with metadata claiming dimensions of `100,000 x 100,000` pixels. When a naive worker allocates memory for the raw bitmap (`100,000 * 100,000 * 4 bytes RGBA`), it demands **40 GB of RAM**, instantly causing an Out-Of-Memory (OOM) kernel panic and taking down worker nodes.

**The Fix: Pre-flight Header Inspection & Memory Caps**
Before allowing the decoder to allocate full frame buffers, inspect the file's header stream (first few kilobytes) to read dimension tags:

```typescript
import sharp from 'sharp';

async function validateAndProcessImage(fileBuffer: Buffer) {
  // 1. Probe metadata without full decompression
  const metadata = await sharp(fileBuffer, { failOnError: true }).metadata();

  const MAX_WIDTH = 8192;
  const MAX_HEIGHT = 8192;
  const MAX_PIXELS = 40_000_000; // 40 Megapixels

  if (!metadata.width || !metadata.height) {
    throw new Error('MALFORMED_IMAGE_HEADER');
  }

  if (
    metadata.width > MAX_WIDTH ||
    metadata.height > MAX_HEIGHT ||
    metadata.width * metadata.height > MAX_PIXELS
  ) {
    throw new Error('IMAGE_DIMENSIONS_EXCEED_SAFETY_LIMIT');
  }

  // 2. Strip EXIF (GPS coordinates, camera serials) to protect privacy
  // 3. Convert color space to sRGB and transcode to WebP
  return sharp(fileBuffer)
    .rotate() // Auto-orient based on EXIF before stripping
    .withMetadata(false) // Strips GPS and camera metadata
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}
```

#### Magic Byte Validation
Never rely on the client's `Content-Type` header or file extension (e.g., an executable named `malicious.png`). Check the binary header bytes (magic numbers):
- JPEG: `FF D8 FF`
- PNG: `89 50 4E 47 0D 0A 1A 0A`
- WebP: `52 49 46 46 ... 57 45 42 50`

---

### Deep Dive 2: CDN Edge Content Negotiation & Modern Formats

Modern formats like **AVIF** and **WebP** reduce payload size dramatically compared to legacy JPEG:
- WebP: ~25–35% smaller than JPEG at identical structural similarity (SSIM).
- AVIF: ~50% smaller than JPEG and ~20% smaller than WebP, especially at low-to-medium bitrates.

```txt
┌────────────────────────────────────────────────────────┐
│               HTTP Content Negotiation                 │
└────────────────────────────────────────────────────────┘

Client Request:
GET /media/img_123/w_600 HTTP/2
Accept: image/avif,image/webp,image/apng,image/svg+xml,*/*

                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│ CDN Edge Normalization:                                │
│ 1. Browser supports AVIF?   -> Select format: avif     │
│ 2. Else supports WebP?      -> Select format: webp     │
│ 3. Fallback?                -> Select format: jpeg     │
│                                                        │
│ Internal Edge Cache Key:                               │
│ hash("img_123" + "w_600" + "fmt_avif")                 │
└────────────────────────────────────────────────────────┘
```

#### The Cache Splitting Trap
If your CDN caches the response without accounting for the `Accept` header, a Chrome user requesting the image first will populate the cache with an AVIF file. When an older Safari or embedded mobile webview requests that same URL, the CDN will serve the cached AVIF, resulting in a broken image.

**Solution**:
1. Either normalize the `Accept` header at the edge and append the negotiated format directly to the cache key (`Vary: Accept`).
2. Or use client-facing URLs with explicit extensions (`.webp`, `.avif`, `.jpg`) and leverage HTML `<picture>` elements:

```html
<picture>
  <source type="image/avif" srcset="https://cdn.example.com/img_123/w_600.avif 1x, https://cdn.example.com/img_123/w_1200.avif 2x">
  <source type="image/webp" srcset="https://cdn.example.com/img_123/w_600.webp 1x, https://cdn.example.com/img_123/w_1200.webp 2x">
  <img src="https://cdn.example.com/img_123/w_600.jpg" alt="User avatar" loading="lazy" decoding="async">
</picture>
```

---

### Deep Dive 3: Preventing Cache Stampedes & Origin DoS (HMAC & Request Collapsing)

When an uncached image goes viral or an attacker scans arbitrary query parameters (`?w=101`, `?w=102`, `?w=103`), your on-demand transformation workers can be overwhelmed by redundant compute.

#### 1. Request Collapsing (Singleflight / Origin Shielding)
CDNs and origin proxies must implement request collapsing. If 5,000 requests arrive simultaneously for `img_123/w_400.webp` on a cold cache, the CDN forwards **exactly one request** to the resizing worker. The remaining 4,999 requests wait in a queue at the edge and are served from the newly populated cache the moment the single worker finishes.

#### 2. HMAC URL Signature Tokenization
To prevent malicious bots from generating millions of unique image dimension combinations that bypass the CDN cache and exhaust CPU:

```txt
URL Pattern:
https://cdn.example.com/media/img_123/w_600,h_400/sig_9a8f7b2c/photo.webp
                                               ▲
                                               │ HMAC-SHA256(secret_key, "img_123/w_600,h_400")
```

The transformation service computes `HMAC-SHA256(secret, params)` and immediately returns `403 Forbidden` if the signature is invalid, without touching the image decoding pipeline.

---

## 6. Failure Modes and Resilience

### 1. Client Abandons Upload After Pre-Signed URL Issued
- **Failure**: The client obtains a Pre-Signed URL, database marks record as `PENDING`, but the user loses network connection or cancels the upload. S3 accumulates partial multipart uploads, and the DB has orphaned pending rows.
- **Mitigation**:
  - Configure an **S3 Lifecycle Rule** to abort incomplete multipart uploads after 24 hours.
  - A lightweight cleanup worker periodically queries for `status = 'PENDING'` older than 2 hours and deletes the stale database metadata.

### 2. Worker OOM / Crash on Malformed File
- **Failure**: A corrupt image or unsupported color profile causes `libvips` to segfault or run out of memory.
- **Mitigation**:
  - Run transcoders in isolated, memory-bounded containers (e.g., 512MB RAM cap per worker process).
  - SQS message visibility timeout triggers a retry. If a job fails 3 times, move it to a **Dead Letter Queue (DLQ)**.
  - The DLQ consumer marks the image status as `FAILED_PROCESSING` in the DB and notifies the user with a structured error ("File format damaged or unreadable").

### 3. S3 Storage Outage or Degraded Regional Performance
- **Failure**: Transient network timeouts connecting to the origin S3 bucket during on-demand resizing.
- **Mitigation**:
  - Configure CDN edge caching with `stale-while-revalidate` and `stale-if-error` HTTP cache control directives. The CDN continues serving cached derivative images even if the origin object storage is temporarily unreachable.

### 4. Color Shift / Washed-out Image Output
- **Failure**: Professional photos uploaded with AdobeRGB or CMYK color profiles look grey and washed out when converted to sRGB for web browsers.
- **Mitigation**:
  - The pipeline must detect embedded ICC color profiles, convert color spaces using LittleCMS inside `libvips` to standard `sRGB`, and then strip the heavy profile metadata to save bytes.

---

## 7. What Makes a Great Answer vs an Average One

| Dimension | Average / Junior Answer | Senior / Staff Answer |
|---|---|---|
| **Upload Pipeline** | Sends binary multipart payload directly to API servers (`multer` in Express), saving to local disk or proxying to S3. | Direct-to-S3 uploads via **Pre-Signed URLs**, completely bypassing API server memory and I/O. |
| **Resizing Strategy** | Synchronously resizes during the upload request, blocking the response until finished. | **Decoupled hybrid pipeline**: Asynchronous SQS + Sharp workers for standard presets; edge-cached on-demand transformation for dynamic sizes. |
| **Processing Engine** | Mentions ImageMagick without understanding memory or performance implications. | Specifies `Sharp`/`libvips` streaming pipeline to avoid buffer allocation bottlenecks; explains row-by-row decoding. |
| **Abuse & Security** | Validates only file extensions (`.jpg`). | Details **decompression bomb defense** (pre-reading headers for dimension caps), magic byte sniffing, EXIF privacy stripping, and HMAC URL signing. |
| **Delivery & CDN** | "Put a CDN in front of S3." | Explains **Accept header content negotiation** for AVIF/WebP, immutable cache keys, Origin Shielding, and Request Collapsing against stampedes. |
| **Frontend Contract** | Returns a single image URL string. | Returns image ID and dimensions, enabling frontend `<picture>` / `srcset` generation and `blurhash` for zero layout shift (CLS). |

---

## 8. 🧠 The Memory Hook

> **Direct to storage, asynchronous in the pipe, edge at the cache.**
>
> Never let raw image bytes touch your application servers. The client uploads directly to S3 via pre-signed tickets, background workers grind out core presets via queues and streaming `libvips`, and edge CDNs sign and cache dynamic transforms so your origin compute barely ever wakes up.
