# 69. Design Document Management System

[← Hard examples](index.md)

**Why interviewers ask** — Files plus metadata, versioning, collaboration, and permissions — the Dropbox/Google Docs problem without hand-waving conflict resolution.

**Core insight** — Blob storage holds content; metadata DB holds versions, ACLs, and pointers; real-time collaboration needs operational transform or CRDT on a sync channel.

**Architecture**

```txt
Client → upload API → object storage (S3) + metadata DB (version graph)
       → sync service (WebSocket) → OT/CRDT merge → broadcast deltas
       → search indexer (full-text extract) ← async pipeline
Permission service → ACL check on every read/write
```

- **Versioning** — Immutable blobs per version; metadata points to head; diff storage for text docs.
- **Collaboration** — WebSocket room per document; server orders operations; periodic snapshot to storage.
- **Search** — Async text extraction (PDF, DOCX); index title + body + tags.
- **Sharing** — Link tokens with expiry; inherit folder ACLs; audit who accessed what.

**Key decisions** — Last-write-wins for simple files; OT/CRDT for concurrent edits; chunk large uploads with resumable multipart.

**Scale & failure** — CDN for download; storage tiering for old versions; conflict on offline edit resolved on reconnect with user prompt if OT cannot auto-merge.

**Deep link** — [File upload service](../../backend-designs/design-a-file-upload-service.md) · [Role-based access](../../backend-designs/design-a-role-based-access-system.md)

**Memory hook** — Blobs are immutable versions, metadata is the map, OT keeps editors from clobbering each other.
