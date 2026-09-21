# Google Drive

Google Drive is a **sync** system. The pressure is that the metadata (the file tree, permissions, versions) is read constantly by every device, the content is large blobs that must be uploaded resumably, and all devices must converge on the same tree through cursors — even when two of them edit the same file at once.

This design is an interview scope, not a product claim. It covers chunked upload, metadata vs blob storage, permissions, sync cursors, conflict handling, versioning, and sharing. Real-time co-editing (Docs) and full-text search are extensions.

## 1. Clarify requirements

Functional requirements:

- Upload and download files, **resumably**, in chunks.
- A **folder tree** with move/rename/delete.
- **Sharing and permissions** (owner, editor, viewer; share links).
- **Sync** across a user's devices via a change cursor.
- **Versioning** and **conflict handling** when two devices edit.
- Deduplication of identical content.

Non-functional requirements (interview assumptions):

- Metadata is **read-heavy**: every device polls for changes frequently.
- Content is **large** and stored as blobs, not in the metadata DB.
- Sync convergence target: a change propagates to other devices within seconds.
- Consistency: strong **per file**, eventual **across devices**.

Out of scope: real-time collaborative editing, OCR/search indexing internals, and enterprise DLP.

## 2. Estimate scale

Useful numbers, labelled as assumptions:

- Metadata/sync reads dwarf writes (devices poll the change feed continuously).
- Uploads are rare but large; a file is many **chunks** (e.g., 8 MB chunks).
- Storage grows with content × versions, not with reads.
- Change feed grows monotonically and must be partitioned.

So the metadata store and the **change feed** carry the read load; the blob store carries the write bytes.

## 3. Define APIs

```http
GET  /files?parentId=...            -> children metadata
POST /files                         -> create file/folder metadata
PATCH /files/{id}                   { "name": ..., "parentId": ..., "version": n }
POST /files/{id}/upload/initiate    -> { uploadId, partUrls[] }     # resumable
PUT  /files/{id}/upload/{uploadId}/part/{n}
POST /files/{id}/upload/{uploadId}/complete
GET  /changes?cursor=...            -> { changes[], nextCursor }    # sync
POST /files/{id}/share              { "principal": ..., "role": ... }
```

`GET /changes?cursor` is the heart of sync: each device stores a cursor and replays changes since it.

## 4. Define the data model

- `File` — id, name, parentId, owner, type, size, contentHash, version.
- `Version` — fileId, version, blobId, createdBy, createdAt.
- `Chunk` / `Blob` — content-addressed blocks in object storage.
- `Permission` — fileId, principal, role (owner/editor/viewer), link sharing.
- `Change` — a monotonic entry (fileId, type, version, timestamp) in the change feed.
- `Cursor` — a position in the change feed per device.

Metadata (tree, versions, permissions) is small and structured; content lives in **blob storage**, referenced by hash.

## 5. Draw the high-level architecture

```text
Clients ──► Sync service ──► Metadata store (tree, versions, permissions)
                 │
                 ├─► Change feed (append-only, partitioned) ──► clients poll with a cursor
                 └─► Blob storage (content-addressed chunks; CDN for downloads)
```

The sync service reads/writes metadata, appends to the change feed, and streams content to blob storage. Devices poll the change feed with a cursor.

## 6. Walk through the main request flow

**Upload:** the client initiates a resumable session, uploads chunks (each hashed and acknowledged), and completes it. Chunks are deduplicated by hash into blob storage; a new `Version` and a `Change` entry are written.

**Sync:** a device calls `GET /changes?cursor`. The service returns changes after the cursor and a `nextCursor`. The device applies them to its local tree; on the next poll it continues from the new cursor.

**Conflict:** two devices edit the same file. The first write wins at version `n+1`; the second, based on version `n`, is rejected with a version conflict and the service stores it as a **conflict copy** rather than silently overwriting.

## 7. Identify bottlenecks

- **Metadata reads** — every device polling for changes.
- **Change feed** — append-only and monotonically growing; must be partitioned per user/tenant.
- **Blob writes** — large uploads consume bandwidth and storage.
- **Hot folders** — a shared folder with many collaborators multiplies metadata and permission checks.
- **Permission checks** — every access must be authorized, and revoked shares must take effect.

## 8. Scale each component

Shard metadata by `ownerId`/`fileId` so a user's tree is cohesive. Partition the **change feed** per user (or tenant) and index by cursor so polling is a range read. Blob storage scales horizontally and is content-addressed for dedup; downloads go through a **CDN**. The sync service is stateless. Permission checks are cached with short TTLs and invalidated on share changes.

## 9. Caching strategy

Cache file metadata and permission results with a short TTL (revocation must be fast). Serve blob downloads from a CDN (blobs are immutable per version). Cache the device's cursor client-side; the server's change-feed reads are cheap range scans. Never cache a permission decision longer than the revocation SLA.

## 10. Database scaling and consistency

Metadata is **strongly consistent per file** (the tree and version are authoritative). The change feed is append-only and ordered per partition. Cross-device visibility is **eventually consistent** — a change appears once the device polls past its cursor. Content is immutable per version, so a blob never changes under a reader.

## 11. Handle concurrency

Each file carries a **version** (optimistic concurrency). A write must match the version it read; a mismatch is a conflict, resolved by creating a conflict copy. Chunk uploads are **idempotent by hash**, so a retried chunk does not duplicate data. The change feed is append-only, so concurrent writers produce ordered entries without locking the tree.

## 12. Reliability and failure handling

- **Dropped upload:** resume from the last acknowledged chunk.
- **Duplicate chunk:** dedup by content hash; no double storage.
- **Missed change:** the cursor is authoritative; a device that missed a poll catches up on the next one.
- **Blob loss:** content is replicated across regions; a checksum mismatch triggers re-fetch.
- **Permission revocation:** short TTLs plus feed-driven invalidation; a revoked device fails its next authorization.

## 13. Availability versus consistency trade-offs

Metadata is **CP per file**: better to reject a conflicting write than to corrupt the tree. Cross-device sync is **AP/eventual**: devices converge through the cursor and tolerate temporary divergence. Content is immutable, so reads are always safe. The conflict copy is the escape hatch that keeps the system available without losing either edit.

## 14. Security

Authorize every access against current permissions; enforce on both metadata and blob (signed, expiring URLs). Encrypt at rest and in transit; support per-file keys for shared content. Revoke share links promptly (short caches + feed invalidation). Treat file names and contents as sensitive PII.

## 15. Monitoring and observability

Track sync **lag** (cursor distance), change-feed append and read rates, upload success and resume rate, dedup ratio, conflict-copy rate, permission-check latency and error rate, and CDN hit ratio for downloads. Alert on rising sync lag, a growing change feed per partition, and permission errors.

## 16. Discuss trade-offs

| Choice | Choice rationale | Alternative | Trade-off |
|---|---|---|---|
| Metadata separate from blobs | Small structured reads vs large immutable bytes | Store content in the metadata DB | Simpler model, but the DB becomes a blob store |
| Change feed + cursor | Efficient incremental sync | Full-tree re-scan | Simple, but O(tree) per sync |
| Optimistic versioning | No locks; conflicts are rare | Pessimistic locking | Avoids conflicts, but locks hurt collaboration |
| Conflict copy | Never lose an edit; stay available | Reject the second write | Loses work, or blocks |
| Content-addressed blobs | Dedup + immutable caching | Path-addressed files | Simple paths, but no dedup and cache invalidation |

## 17. Future improvements

Add block-level (delta) sync to move only changed bytes, stronger client-side dedup, offline editing with deferred merge, server-side search/OCR, and retention/legal-hold policies. Extend to real-time co-editing with CRDTs for the files that need it.

## Interactive Visualizer

Raise the sync rate and watch the read-heavy metadata path and change feed carry the load while uploads drive chunk writes into blob storage. Press **Scale up** to add sync nodes, metadata shards, change-feed partitions, or blob shards and see what failed, what changed, and what improved.

<div
  id="google-drive-hld"
  class="hld google-drive-hld-visualizer"
></div>

## Interview recap

The interview answer is: "metadata and content are separate — a strongly-consistent, sharded metadata tree plus content-addressed blobs; devices sync by replaying a partitioned change feed from a cursor; and concurrent edits are resolved by optimistic versioning into a conflict copy."

Likely follow-ups:

- Why keep file content out of the metadata database?
- How does a device that was offline for a day catch up?
- Two devices edit the same file — what happens to each edit?
- Why is the change feed partitioned per user, and what breaks if it is not?
