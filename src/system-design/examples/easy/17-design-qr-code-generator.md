# 17. Design QR Code Generator

[← Easy examples](index.md)

**Why interviewers ask:** QR codes combine image generation, URL mapping (like shortener), and scan analytics. Interviewers look for cache of generated images, redirect service reuse, and tracking without slowing generation.

**Core insight:** QR encodes a short redirect URL; store mapping once; cache generated PNG/SVG by payload hash; redirect path identical to URL shortener read pattern.

**Architecture**

```txt
Client → QR API (target URL → image bytes or URL to image)
              ↓
         Mapping DB (qr_id / short code → destination URL)
              ↓
         Image cache (CDN or Redis blob cache by code)
              ↓ on scan
         Redirect service (same as shortener) → analytics event
```

- **QR API:** Validates URL, assigns short code, generates QR image (library server-side), stores mapping, returns image or CDN URL.
- **Mapping database:** Same shape as shortener — code to long URL plus optional campaign metadata.
- **Image cache:** Generated QR for a given code rarely changes — store in CDN/S3 with long TTL; regenerate only on destination change.
- **Redirect on scan:** Phone camera hits short URL; 302 redirect to destination; log scan timestamp, geo, device.
- **Analytics tracking:** Async pipeline aggregates scans per code for dashboard.

**Key decisions**

- **Generate on create vs on first scan:** Generate on create — predictable latency for API; lazy gen saves storage for unused codes.
- **Dynamic vs static QR:** Dynamic QR points to your redirect URL so destination can change without reprinting — mapping update only.
- **Reuse shortener stack:** Same Redis + DB redirect tier — QR is encode + analytics wrapper.

**Scale & failure:** Image generation CPU on uncached create bursts saturates API workers first. Mitigation: cache aggressively, offload image bytes to CDN, and rate limit generation per account.

**Memory hook:** QR is a barcode for a short link — store the link, paint the picture once, redirect and count every scan.
