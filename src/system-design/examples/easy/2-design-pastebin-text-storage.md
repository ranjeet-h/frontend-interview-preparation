# 2. Design Pastebin (Text Storage)

[← Easy examples](index.md)

**Why interviewers ask:** Pastebin is content-addressed storage with optional TTL — similar shape to URL shortener but with larger payloads and expiry. Interviewers want to hear how you store blobs, assign IDs, and clean up without breaking links mid-read.

**Core insight:** Generate a unique paste ID, store content durably (DB or object store for large pastes), serve reads through cache for popular snippets, and expire with TTL jobs rather than synchronous deletes.

**Architecture**

```txt
Client → API (create paste / fetch by ID)
              ↓
         Paste service
              ↓ write              ↓ read
    MongoDB (metadata + small text)  Redis (hot pastes)
              ↓ large content
         Object store (S3) + pointer in DB
              ↓ TTL
         Cleanup worker (scheduled scan / bucket lifecycle)
```

- **API layer:** `POST` accepts text + optional expiry; `GET /{id}` returns content or raw view; enforce max size limits at the edge.
- **NoSQL metadata store:** Flexible schema for paste metadata (id, size, created_at, expires_at, syntax language); good fit for variable fields.
- **Object storage:** Pastes above a threshold (e.g. 64KB) go to blob storage; DB holds only a pointer — keeps DB rows small and queries fast.
- **Cache layer:** Popular public pastes cached by ID; invalidate on expiry or admin delete.
- **TTL cleanup:** Background job or object-store lifecycle rules delete expired content; reads after expiry return 404 consistently.

**Key decisions**

- **DB inline vs object store:** Inline text in DB for small pastes (simpler); S3 for large pastes — trade simplicity on small reads vs storage cost at scale.
- **UUID vs Snowflake IDs:** Snowflake gives time-sortable, dense IDs without a central counter; UUID is fine at moderate scale with less coordination.
- **Public vs private pastes:** Optional password or signed URL — store hash of password, never plaintext; unlisted IDs act as capability tokens.

**Scale & failure:** Large paste uploads saturate API bandwidth and storage write throughput first. Mitigation: direct-to-S3 upload with presigned URLs, size caps, and rate limits per IP.

**Memory hook:** Paste ID is the address — metadata in DB, fat content in object store, cache the hits, TTL sweeps the graveyard.
