# 19. Design File Upload System

[← Easy examples](index.md)

**Why interviewers ask:** Large uploads cannot stream through your API servers reliably. Interviewers expect chunked upload, direct-to-object-store paths, resume support, virus scan async, and access control on the final object.

**Core insight:** Client uploads chunks directly to temporary storage or presigned S3 URLs; API tracks upload session state; on complete, assemble, scan, move to final bucket with ACL.

**Architecture**

```txt
Client → Upload API (init session → presigned URLs per chunk)
              ↓ direct
         Temp storage / S3 multipart upload
              ↓ complete callback
         Upload coordinator (verify chunks, finalize object)
              ↓ async
         Virus scan worker → quarantine or promote
              ↓
         Final storage (S3) + metadata DB (owner, ACL, size)
         Download API checks ACL before presigned GET
```

- **Chunk-based upload:** Split file into parts; parallel upload; resume by re-requesting missing chunk ids — survives mobile disconnects.
- **Temporary storage:** Staging bucket or multipart upload state — auto-expire incomplete uploads after 24h.
- **Virus scanning:** Scan staging copy before promoting to public bucket — block or delete on malware match.
- **Final storage:** S3 with versioning optional; metadata in DB for listing user's files without listing entire bucket.
- **Access control:** Object ACL or app-level check — download only via short-lived presigned URL after permission verify.

**Key decisions**

- **Through API vs presigned direct:** Presigned direct to S3 — saves API bandwidth and scales uploads horizontally.
- **Sync vs async virus scan:** Async promote — user sees "processing" until scan passes; sync only for small trusted uploads.
- **Single region vs cross-region:** Start single region; cross-region replication for durability geo-requirements — adds cost and consistency lag.

**Scale & failure:** Incomplete multipart uploads filling storage or virus scan queue lag blocking promotion breaks operations first. Mitigation: lifecycle rules on temp prefix, scan worker autoscaling, and upload size quotas per tier.

**Deep link:** [Design a file upload service](../../backend-designs/design-a-file-upload-service.md)

**Memory hook:** Upload is moving boxes — API tracks the manifest, client ships chunks to the warehouse door, scan before stocking, ACL before opening the box for others.
