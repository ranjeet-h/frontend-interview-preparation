# 29. Design Dropbox

[← Medium examples](index.md)

**Why interviewers ask** — Sync across devices with conflicts, offline edits, and deduplication — harder than simple upload/download.

**Core insight** — Sync at block level, not file level: content-addressed chunks dedupe storage; metadata tracks versions and per-device sync state.

**Architecture**

```txt
Client (sync agent) → Metadata API → file tree, versions, permissions
                   → Block API → content-addressed blob store (hash = block ID)
                   → Sync engine → delta detection, conflict resolution
```

- **Upload** — Split file into blocks; hash each block; upload only missing blocks.
- **Metadata** — File path, version vector, block list in SQL/NoSQL.
- **Sync** — Compare local vs remote block lists; download deltas; notify other devices via push/long poll.
- **Conflicts** — Last-write-wins or create "conflicted copy" for user merge.

**Key decisions** — Block-level dedup saves storage; metadata is source of truth for structure; clients do heavy lifting to reduce server work.

**Scale & failure** — Cross-DC replication for blocks; metadata DB sharded by account; partial upload resumes via block manifest; conflict copies beat silent data loss.

**Deep link** — [File upload service](../../backend-designs/design-a-file-upload-service.md)

**Memory hook** — Files are lists of hashes; sync means diff the hash lists.
