# Design an image upload and resize service

## Detailed explanation

Design an image upload and resize service is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Design data flow, APIs, storage, scaling, failure handling, and observability together.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Clarify requirements and scale.
- Define APIs and data model.
- Choose storage, cache, queues, and workers.
- Plan consistency, failure handling, and security.
- Add observability and rollout strategy.

## 4. Visual / analogy

```txt
Clients -> API -> services -> database/cache/queue -> observability
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply backend system design rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, design an image upload and resize service affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle image resizing on demand vs. pre-processing?
- **The Engine Mechanism (Why it behaves this way):** On-demand resizing (lazy) generates the requested size when first requested, caches it, and serves the cached version for subsequent requests. Pre-processing generates all sizes at upload time. On-demand saves storage and processing for unused sizes but adds latency to the first request. Pre-processing has higher upfront cost but instant delivery. A hybrid approach pre-processes common sizes (thumbnail, medium, large) and generates uncommon sizes on demand. Image processing uses libraries like Sharp (Node.js), libvips (C), or ImageMagick.
- **The Unforgettable Mental Model:** The **Tailor Shop**. Pre-processing is like making a suit in every size upfront — expensive but instant delivery. On-demand is like measuring and sewing when the customer arrives — slower first time, but you only make what's needed. The hybrid approach keeps common sizes on the rack and custom-sews unusual sizes.
- **The Trap:** Generating every possible size at upload time. If you support 10 sizes and a user uploads 1000 images, that's 10,000 processed images — most of which may never be viewed. This wastes CPU, storage, and money.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use a hybrid approach. At upload time, I'd pre-process the 3-4 most common sizes (thumbnail, avatar, feed, full) since these cover 90% of use cases. For uncommon sizes, I'd use on-demand resizing with an image transformation service (like imgproxy or Cloudinary). The first request for an uncached size triggers processing, the result is cached in a CDN, and subsequent requests hit the cache. This balances storage costs with delivery speed."

#### How do you store and serve multiple image sizes efficiently?
- **The Engine Mechanism (Why it behaves this way):** Store the original image in object storage (S3) as the source of truth. Processed sizes are stored with a naming convention: {original_key}/{size}.{ext} (e.g., uploads/abc123/thumb.jpg). A CDN (CloudFront, Cloudflare) sits in front and caches processed images. Cache keys include the size parameter so different sizes are cached independently. For dynamic resizing, use an image proxy service (imgproxy, Thumbor) that reads the original, resizes on the fly, and sets long Cache-Control headers. Use WebP/AVIF formats for smaller file sizes with fallback to JPEG/PNG.
- **The Unforgettable Mental Model:** The **Photo Printing Lab**. The original negative (original image) is stored safely in a vault. When someone wants a 4x6, 8x10, or wallet-size print, the lab makes it from the negative. Popular sizes are pre-printed and kept on shelves (CDN cache). The lab also offers modern printing techniques (WebP/AVIF) that use less paper.
- **The Trap:** Storing processed images in the same bucket without a clear naming hierarchy. This makes cleanup difficult — when the original is deleted, orphaned processed images remain. Always use a prefix-based structure and implement lifecycle policies.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd store the original in S3 as the source of truth, with processed images under a keyed prefix (uploads/{id}/{size}.jpg). A CloudFront CDN caches processed images with long TTLs. For on-demand resizing, I'd deploy imgproxy as a stateless service that reads the original from S3, resizes, and returns with Cache-Control: public, max-age=31536000. I'd also serve WebP/AVIF with Accept header negotiation for smaller payloads, falling back to JPEG for older browsers."

#### How do you optimize image delivery for different devices and networks?
- **The Engine Mechanism (Why it behaves this way):** Use responsive images with srcset and sizes attributes so the browser selects the appropriate resolution. Detect device capabilities via the User-Agent or Client Hints (DPR, Width, Save-Data headers) to serve optimal formats (WebP for Chrome, AVIF for newer browsers, JPEG as fallback). Implement adaptive quality — reduce JPEG quality for mobile networks (detected via Save-Data header or network type). Use lazy loading (loading="lazy") for below-the-fold images. Implement a CDN with image optimization features that automatically resize and reformat based on request headers.
- **The Unforgettable Mental Model:** The **Smart Water Delivery System**. A mansion (desktop on WiFi) gets a full-pressure pipe (high-res, high-quality). A small apartment (mobile on 3G) gets a pressure-regulated valve (lower-res, compressed). The system automatically adjusts based on the recipient's needs without anyone asking.
- **The Trap:** Serving the same high-resolution image to all devices. A 4000px image wastes bandwidth on a 375px mobile screen and slows page load. Always serve device-appropriate sizes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd implement responsive image delivery using srcset for resolution switching and picture elements for format negotiation. The CDN would use Client Hints (DPR, Width, Save-Data) to automatically serve the right size and format — WebP/AVIF for supporting browsers, JPEG fallback for others. For slow networks detected via Save-Data, I'd reduce image quality by 20-30%. Combined with lazy loading for below-the-fold images, this typically reduces image payload by 60-80% on mobile."

#### How do you handle image format conversion and quality optimization?
- **The Engine Mechanism (Why it behaves this way):** Format conversion uses libraries like Sharp or libvips to transcode between JPEG, PNG, WebP, and AVIF. Quality optimization involves: (1) Choosing the right format — JPEG for photos, PNG for graphics with transparency, WebP/AVIF for modern browsers; (2) Quality setting — JPEG quality 80-85 is visually indistinguishable from 100 but 50-70% smaller; (3) Progressive JPEG — loads a low-res version first, then sharpens; (4) Strip metadata — remove EXIF data (GPS, camera info) to reduce size; (5) Color space optimization — convert to sRGB for web, reduce bit depth for simple images.
- **The Unforgettable Mental Model:** The **Compression Packing Service**. Like a professional packer who folds clothes efficiently (quality optimization), uses vacuum bags (format conversion), and removes unnecessary items from the suitcase (metadata stripping) — the same contents, but fits in half the space.
- **The Trap:** Using PNG for photographs. PNG is lossless and produces files 5-10x larger than JPEG for photos. Always match format to content type: JPEG/WebP for photos, PNG for graphics with transparency or text.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd convert all uploads to WebP as the primary format with JPEG fallback, achieving 25-35% size reduction with equivalent quality. For photos, I'd use JPEG quality 85 with progressive encoding. For graphics, PNG with palette optimization. I'd strip all EXIF metadata to reduce size and protect privacy. The conversion pipeline would use Sharp for speed, and I'd implement content-aware format selection — detecting if an image is a photo or graphic and choosing the optimal format accordingly."

#### How do you prevent abuse of the image processing service?
- **The Engine Mechanism (Why it behaves this way):** Abuse prevention includes: (1) Rate limiting on upload and transformation requests per user/IP; (2) Maximum image dimensions — reject images larger than a threshold (e.g., 10000x10000px) to prevent memory exhaustion during processing; (3) Maximum file size limits; (4) Request validation — prevent URL-based image processing from fetching internal URLs (SSRF); (5) Quota enforcement — limit total storage and processing minutes per user; (6) Bomb protection — detect decompression bombs (tiny file that expands to gigabytes) by checking the ratio of compressed to decompressed size.
- **The Unforgettable Mental Model:** The **Gym Membership**. You can use the equipment (image processing), but there are rules: time limits per machine (rate limiting), maximum weight on the bar (size limits), and no bringing in dangerous equipment (bomb protection). The gym also caps total monthly usage (quota).
- **The Trap:** Not limiting image dimensions. An attacker can upload a 100,000x100,000 pixel image that consumes gigabytes of memory when decoded, causing OOM crashes. Always validate dimensions before processing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd implement multiple abuse prevention layers. Rate limit both uploads and transformation requests. Cap image dimensions at 10,000x10,000px to prevent memory exhaustion during decoding. Enforce file size limits (e.g., 50MB max). For URL-based transformations, validate that the source URL isn't an internal address (SSRF prevention). I'd also detect decompression bombs by checking the compressed-to-decompressed size ratio and reject files with ratios above 100:1. Per-user quotas prevent resource monopolization."

#### How do you design the image transformation API?
- **The Engine Mechanism (Why it behaves this way):** Two API patterns exist: (1) Path-based: GET /images/{id}/{width}x{height}.{format} — clean URLs, CDN-friendly, cacheable; (2) Query-based: GET /images/{id}?w=400&h=300&fmt=webp&q=80 — flexible, supports many parameters. The path-based approach is preferred for CDN caching since each unique transformation has a unique URL. The server parses the URL, fetches the original from storage, applies transformations (resize, crop, format, quality), caches the result, and serves it with appropriate Cache-Control headers. Content negotiation via Accept header can auto-select the best format.
- **The Unforgettable Mental Model:** The **Photo Order Form**. Path-based is like ordering a specific print size from a catalog — "I want photo #123 as a 4x6 JPEG." Query-based is like filling out a custom form — "I want photo #123, 400px wide, 300px tall, WebP format, 80% quality." The catalog approach is faster to process and easier to file.
- **The Trap:** Using query parameters for transformations when CDN caching is important. CDNs cache path-based URLs more reliably, and query parameters can create cache fragmentation (every unique parameter combination is a separate cache entry).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use path-based URLs like GET /images/{id}/{width}x{height}.{format} because they're CDN-friendly and each transformation gets a unique, cacheable URL. The server parses the path, fetches the original from S3, applies transformations with Sharp, caches the result in the CDN with a 1-year TTL, and serves it. I'd also support Content Negotiation — if the client sends Accept: image/webp, the server serves WebP even if the URL says .jpg. For complex transformations (crop, watermark, filters), I'd add query parameters on top of the path."

#### How do you handle image processing failures and retries?
- **The Engine Mechanism (Why it behaves this way):** Image processing can fail due to corrupt files, unsupported formats, memory limits, or transient storage errors. The processing pipeline should: (1) Validate the file before processing (magic bytes, format detection); (2) Wrap processing in try-catch with specific error types; (3) Retry transient failures (S3 read errors) with exponential backoff; (4) Move permanently failed images to a quarantine bucket with error metadata; (5) Notify the user via webhook or dashboard; (6) Log the original file hash, error type, and processing parameters for debugging. A dead-letter queue holds failed processing jobs for manual review.
- **The Unforgettable Mental Model:** The **Quality Control Line**. Each photo goes through inspection. If it's slightly smudged (transient error), it goes back through the machine (retry). If it's fundamentally damaged (corrupt file), it's set aside in a rejection bin (quarantine) and the customer is notified. Every rejection is logged with photos and notes for review.
- **The Trap:** Silently failing and serving a broken image placeholder without logging the error. This makes debugging impossible. Always log the failure with context and move the file to quarantine for investigation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd implement a resilient processing pipeline. First, validate the file's magic bytes and format before attempting processing. Wrap the transformation in error handling that distinguishes transient errors (S3 timeouts — retry with backoff) from permanent errors (corrupt file, unsupported format — quarantine). Failed jobs go to a dead-letter queue with the file hash, error type, and parameters. The user gets notified via webhook. All failures are logged with full context so the team can investigate patterns — like a specific camera model producing corrupt files."

## 8. Active recall test

1. **What is the hybrid approach to image resizing?**
   - **Explanation:** Pre-process common sizes (thumbnail, medium, large) at upload time for instant delivery. Generate uncommon sizes on-demand when first requested, then cache them in a CDN. This balances storage costs with delivery speed.

2. **Why use WebP over JPEG?**
   - **Explanation:** WebP provides 25-35% smaller file sizes than JPEG at equivalent visual quality. It supports both lossy and lossless compression, transparency, and animation. Serve WebP with Accept header negotiation and JPEG as fallback.

3. **How do you prevent image processing from crashing the server?**
   - **Explanation:** Cap maximum image dimensions (e.g., 10,000x10,000px) to prevent memory exhaustion during decoding. Detect decompression bombs by checking compressed-to-decompressed size ratios. Process images in isolated worker processes with memory limits.

4. **Why prefer path-based URLs over query parameters for image transformations?**
   - **Explanation:** Path-based URLs (GET /images/{id}/400x300.webp) are more CDN-friendly. Each unique transformation has a unique, cacheable URL. Query parameters create cache fragmentation and some CDNs don't cache URLs with query strings by default.

5. **What is the optimal JPEG quality setting for web images?**
   - **Explanation:** Quality 80-85 is visually indistinguishable from 100 but produces files 50-70% smaller. Use progressive JPEG encoding so a low-resolution version loads first and sharpens progressively.

6. **How do you handle a corrupt image in the processing pipeline?**
   - **Explanation:** Validate magic bytes before processing. If processing fails, distinguish transient errors (retry with backoff) from permanent errors (move to quarantine bucket). Log the file hash, error type, and parameters. Notify the user.

7. **What responsive image techniques reduce mobile bandwidth?**
   - **Explanation:** Use srcset for resolution switching, picture elements for format negotiation, Client Hints (DPR, Width, Save-Data) for automatic optimization, lazy loading for below-the-fold images, and reduced quality for slow networks.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design an image upload and resize service in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design an image upload and resize service in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
