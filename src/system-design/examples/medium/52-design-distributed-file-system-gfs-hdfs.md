# 52. Design Distributed File System (GFS/HDFS)

[← Medium examples](index.md)

**Why interviewers ask** — Large-file storage for batch analytics: master metadata, chunk servers, replication — classic data-plane split.

**Core insight** — Files split into large immutable chunks (64–128 MB); master holds namespace; clients read/write chunks directly from chunkservers.

**Architecture**

```txt
Client → Master (file → chunk mapping, lease for writes)
      → Chunkservers (replicate chunks, default RF=3)
Write: primary chunkserver serializes mutations, replicates chain
Read: client asks master for chunk locations, then parallel read
```

- **Master** — In-memory namespace; periodic checkpoint to disk; not on data path for reads.
- **Chunks** — Large size amortizes metadata; append-only for writes (WORM bias).
- **Replication** — Rack-aware placement; re-replicate on node failure.

**Key decisions** — Single master (with standby) simplifies design; large chunks suit sequential scan; leases coordinate concurrent writers to same chunk.

**Scale & failure** — Master failover to shadow; chunkserver heartbeat to master; missing replica re-replicated; master is bottleneck — keep metadata only, not bytes.

**Memory hook** — Master knows names, chunkservers hold bytes, big chunks amortize metadata.
