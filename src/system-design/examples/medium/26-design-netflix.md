# 26. Design Netflix

[← Medium examples](index.md)

**Why interviewers ask** — YouTube plus DRM, regional licensing, and personalization where buffering kills retention.

**Core insight** — Playback must start fast with adaptive quality; content rights and DRM constrain what can play where; recommendations drive what users press play on.

**Architecture**

```txt
Client → CDN (encrypted streams, per-device keys) ← encoding pipeline
      → Catalog + license service (region, subscription tier)
      → Recommendation API ← offline ML features + real-time signals
      → Download manager (offline encrypted cache)
```

- **Streaming** — Pre-encoded ladders per title; client ABR; Open Connect-style CDN placement.
- **DRM** — License server ties playback to device; keys rotate.
- **Catalog** — Regional availability rules enforced at API layer.
- **Recommendations** — Blend collaborative filtering with session context.

**Key decisions** — CDN closer to users than origin; offline downloads are encrypted with expiry; separate control plane (catalog) from data plane (bytes).

**Scale & failure** — Edge cache warms popular titles; license check failure blocks play cleanly; recommendation stale is OK; failover CDN region on outage.

**Deep link** — [Recommendation backend](../../backend-designs/design-a-recommendation-backend.md)

**Memory hook** — Bytes on CDN, keys from DRM, titles from license rules, order from ML.
