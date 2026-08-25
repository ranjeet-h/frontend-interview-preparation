# Design an Audit Log System

## 1. Understand the Problem First — Clarify Before Designing

Imagine a disgruntled senior database administrator with root database credentials who logs into production PostgreSQL at 2:00 AM, adjusts their account balance, changes access roles for an offshore entity, and runs `DELETE FROM activity_logs WHERE user_id = 'admin_42'`. When the finance team notices millions of dollars missing weeks later, the database shows the current mutated state, but every trace of who executed the change, when it occurred, what the previous values were, and which network IP originated the request is gone forever. 

Or imagine a healthcare SaaS facing a SOC2 Type II and HIPAA compliance audit. The auditor requests the complete provenance of every change made to electronic health records (EHR) over the last three years. If your application records mutations in mutable database rows or relies on standard debugging logs that rotate out after 14 days, you fail the audit instantly, facing regulatory shutdown and multimillion-dollar penalties.

An audit log is fundamentally different from application logging and observability metrics:

```txt
┌───────────────────────────────────────────────────────────────────────────────────┐
│ APPLICATION LOGS (ELK / Datadog)                                                 │
│ • Ephemeral, semi-structured text for developer debugging                         │
│ • Droppable under high load; rotated and deleted after 7–30 days                   │
│ • Mutable permissions; developers and DBAs can truncate logs                      │
├───────────────────────────────────────────────────────────────────────────────────┤
│ AUDIT LOGS (Compliance & Security Flight Recorder)                                │
│ • Legally binding, structured business event records (Who, What, When, Where, Why) │
│ • Zero loss tolerance (Loss = Compliance Failure or Unpunished Fraud)             │
│ • Append-only, cryptographically verifiable, immutable (WORM storage)            │
│ • Multi-year retention (1–7+ years based on SOC2, HIPAA, SOX, PCI-DSS)           │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### Scale and Operating Constraints

Before drawing boxes on the whiteboard, establish concrete baseline metrics with the interviewer:

- **Write Volume:** 100 million audit events per day (~1,200 events/sec average, peaking at 10,000 events/sec during business hours).
- **Payload Size:** Average ~1 KB per structured event including JSON diffs $\rightarrow$ ~100 GB/day uncompressed $\rightarrow$ ~36.5 TB/year.
- **Read/Write Asymmetry:** Extreme write-heavy workload (99.9% writes, 0.1% reads). Reads occur only during compliance audits, security breach investigations, or customer-facing "Activity Feed" UI queries.
- **Read Latency:** Sub-second search (<500ms) for recent tenant-filtered events (last 90 days); asynchronous batch export (minutes to hours) for multi-year compliance archives.
- **Durability & Immutability:** Zero data loss. Audit records must be cryptographically tamper-evident and impossible to delete or modify, even by a compromised cloud root administrator.

### Clarifying Questions to Ask the Interviewer

1. **What is the consistency guarantee between the business action and the audit log?** Can audit recording be asynchronous, or must the business transaction abort if the audit log fails to persist?
2. **What compliance frameworks apply?** (e.g., SOC2 requires 1 year of logs, HIPAA requires 6 years, PCI-DSS requires 1 year with 3 months immediately searchable).
3. **What is the threat model?** Are we defending against unauthorized external attackers, rogue internal software developers, or superusers/DBAs with direct database access?
4. **How do we handle GDPR/CCPA "Right to be Forgotten"?** If a user demands complete data deletion, how do we honor the erasure request when audit logs are legally required to be immutable?
5. **Is this system multi-tenant?** Does each enterprise customer need a tenant-isolated activity feed with custom role-based access control?

---

## 2. The Core Insight — The Decision Everything Else Flows From

The single most critical mistake in audit log design is treating audit logging as a secondary database insert or a background API call inside your application code:

```typescript
// ❌ THE FATAL DUAL-WRITE PATTERN
async function transferFunds(fromAcc: string, toAcc: string, amount: number) {
  // Step 1: Mutate business data
  await db.query("UPDATE accounts SET balance = balance - $1 WHERE id = $2", [amount, fromAcc]);
  await db.query("UPDATE accounts SET balance = balance + $1 WHERE id = $2", [amount, toAcc]);
  
  // Step 2: Write audit log via HTTP / message queue / secondary DB
  await auditQueue.publish({ actor: "user_1", action: "TRANSFER", amount }); 
  // 💣 IF THIS CRASHES: Money moved, but NO audit record exists (Audit Gap).
  // 💣 IF STEP 1 CRASHES AFTER LOG: Audit record exists, but no money moved (Phantom Log).
}
```

The core insight that dictates the entire architecture is: **The operational write path must be atomically coupled to the business state change at the database engine level via the Transactional Outbox pattern or Write-Ahead Log (WAL) Change Data Capture (CDC), while completely decoupling the high-throughput, append-only cold storage from the indexed search layer.**

Everything in this design flows from three foundational invariants:

1. **Atomic Ingestion (Zero Dual-Write Gaps):** The audit event is captured within the exact same atomic transaction boundary as the state mutation. If the business transaction fails, no phantom audit is generated. If it commits, the audit event is guaranteed to be emitted.
2. **Cryptographic Tamper-Evidence (WORM Immutability):** Logs are stored in Write Once Read Many (WORM) storage (e.g., S3 Object Lock in Compliance Mode) and chained using SHA-256 block hashing / Merkle trees. Altering a historical record invalidates every downstream cryptographic hash.
3. **Storage Tiering (Separation of Search vs Preservation):** The raw source of truth is stored as compressed append-only Parquet objects on cold immutable storage. A secondary read-optimized index (OpenSearch/ClickHouse) is populated asynchronously to serve low-latency customer and compliance queries without endangering the primary archive.

---

## 3. High-Level Architecture — Components and Why Each Exists

```txt
  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │ 1. TRANSACTIONAL WRITE PATH                                                             │
  │                                                                                         │
  │  Client ──► API Gateway ──► Microservices (Payments, IAM, Core)                         │
  │                                     │                                                   │
  │                                     ▼ (Atomic ACID Transaction)                         │
  │                        ┌───────────────────────────────┐                                │
  │                        │ Primary OLTP Database         │                                │
  │                        │  • Business State Tables      │                                │
  │                        │  • outbox_events Table        │                                │
  │                        │  • Write-Ahead Log (WAL)      │                                │
  │                        └───────────────┬───────────────┘                                │
  └────────────────────────────────────────┼────────────────────────────────────────────────┘
                                           │ CDC (Debezium / Kafka Connect)
                                           ▼
  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │ 2. INGESTION & PROCESSING STREAM                                                        │
  │                                                                                         │
  │                     ┌─────────────────────────────────────┐                             │
  │                     │ Apache Kafka (Partitioned by Tenant)│                             │
  │                     └──────────────────┬──────────────────┘                             │
  │                                        │                                                │
  │                                        ▼                                                │
  │                     ┌─────────────────────────────────────┐                             │
  │                     │ Audit Ingestion Workers             │                             │
  │                     │  • Schema Validation (Protobuf/JSON)│                             │
  │                     │  • PII Crypto-Shredding Tokenizer   │                             │
  │                     │  • SHA-256 Hash Chaining Calculator │                             │
  │                     └──────────┬──────────────────┬───────┘                             │
  └────────────────────────────────┼──────────────────┼─────────────────────────────────────┘
                                   │                  │
               Batch Flush (Parquet)                  │ Micro-batch Stream
                                   ▼                  ▼
  ┌────────────────────────────────────────┐ ┌──────────────────────────────────────────────┐
  │ 3. COLD / IMMUTABLE STORAGE            │ │ 4. HOT / WARM SEARCH LAYER                   │
  │                                        │ │                                              │
  │ AWS S3 Object Lock (Compliance WORM)   │ │ OpenSearch / ClickHouse Cluster              │
  │ • Retained for 1–7 Years               │ │ • Time-series index partitioned by Tenant ID │
  │ • Root account cannot delete or modify │ │ • Retained for 90–180 Days (Hot search)      │
  │ • Hourly Merkle Root Notarization      │ │ • Serves Dashboard & Security Queries        │
  └────────────────────────────────────────┘ └──────────────────────┬───────────────────────┘
                                                                    │
  ┌─────────────────────────────────────────────────────────────────┼───────────────────────┐
  │ 5. QUERY & EXPORT INTERFACE                                     │                       │
  │                                                                 ▼                       │
  │  Auditor / Security Admin / Tenant UI ◄── Audit Query API ◄─────┘                       │
  │                                            • RBAC Enforcement                           │
  │                                            • Tamper Verification Engine                 │
  │                                            • Long-Term Athena/DuckDB Export             │
  └─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown and Why Each Exists

1. **Transactional Outbox / Database WAL:** Guarantees that business mutations and audit records are created atomically. If the database crashes mid-operation, partial writes never leak.
2. **Debezium CDC + Apache Kafka:** Reads committed transactions directly from the database Write-Ahead Log (WAL) and publishes them to Kafka topics partitioned by `tenant_id`. This decouples the audit pipeline with zero performance overhead on the application.
3. **Audit Ingestion Workers:** Stateless microservices that validate canonical schemas, anonymize sensitive personal identifiable information (PII) using crypto-shredding keys, and compute continuous SHA-256 hash chains.
4. **AWS S3 Object Lock (WORM Storage):** The legal source of truth. Configured in *Compliance Mode*, meaning no IAM user, role, or AWS root account holder can delete or overwrite objects until the retention timer expires.
5. **OpenSearch / ClickHouse Cluster:** The analytical search plane. Provides fast filtering, free-text search, and multi-tenant aggregations across millions of events within milliseconds.
6. **Audit Query API & Verification Engine:** Enforces tenant isolation, verifies cryptographic hash integrity on the fly during audits, and orchestrates ad-hoc deep queries against cold S3 storage via Amazon Athena or DuckDB.

---

## 4. Key Technical Decisions — With Real Tradeoffs

### Decision 1: Capture Mechanism — Transactional Outbox + CDC vs Application-Level Event Dispatching

```txt
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Comparison: Event Capture Strategies                                                  │
├─────────────────────────┬───────────────────────────────┬──────────────────────────────┤
│ Strategy                │ Pros                          │ Cons / Risks                 │
├─────────────────────────┼───────────────────────────────┼──────────────────────────────┤
│ App-Level HTTP/Queue    │ Simple to implement; no       │ Prone to Dual-Write failures │
│ Dispatch                │ database setup needed         │ (Audit gaps or phantom logs) │
├─────────────────────────┼───────────────────────────────┼──────────────────────────────┤
│ DB Triggers             │ Captures all SQL queries;     │ Hard to maintain, leaks DB   │
│                         │ atomic with data mutation     │ logic, high CPU load on OLTP │
├─────────────────────────┼───────────────────────────────┼──────────────────────────────┤
│ Transactional Outbox    │ Guaranteed atomicity; no app  │ Requires running Kafka       │
│ + Debezium WAL CDC      │ latency; resilient to crashes │ Connect and CDC pipeline     │
└─────────────────────────┴───────────────────────────────┴──────────────────────────────┘
```

- **Chosen:** Transactional Outbox with Debezium WAL CDC.
- **Why:** In high-stakes compliance and security architectures, an audit gap is a catastrophic system failure. Writing to an `outbox_events` table inside the same local database transaction as the business entity guarantees that an event is emitted if and only if the business transaction commits.
- **Tradeoff Accepted:** Adds infrastructure complexity (Kafka Connect cluster, WAL disk consumption monitoring, schema evolution management).

### Decision 2: Tamper-Resistance — S3 Object Lock (WORM) + Cryptographic Chaining vs DB Table Permissions

- **Chosen:** Write Once Read Many (WORM) storage on S3 Object Lock (Compliance Mode) coupled with sequential SHA-256 hash chaining and Merkle tree root anchoring.
- **Rejected:** PostgreSQL table with `REVOKE UPDATE, DELETE ON audit_logs`.
- **Why:** Database role permissions protect against regular application bugs, but they offer zero protection against a rogue DBA, an attacker with root database access, or compromised cloud credentials. S3 Object Lock in Compliance Mode prevents even AWS account root users from altering or deleting objects before the retention policy expires.
- **Tradeoff Accepted:** Logs stored in S3 WORM cannot be edited for operational corrections or manual data repairs.

### Decision 3: Storage Engine Tiering — Hybrid S3 Parquet + OpenSearch vs Single Relational Database

- **Chosen:** Dual-path storage:
  - **Preservation Tier (Cold):** Snappy/ZSTD-compressed Apache Parquet files on S3 Object Lock partitioned by `/year/month/day/tenant_id/`.
  - **Query Tier (Hot):** OpenSearch / ClickHouse cluster keeping 90 days of indexed data.
- **Rejected:** Single PostgreSQL/MySQL instance storing all audit logs for 7 years.
- **Why:** Storing hundreds of millions of JSON audit records in a relational database bloats B-tree indexes, explodes disk costs, and degrades operational query performance. Parquet on S3 costs ~$0.023 per GB/month (or ~$0.004 in Glacier), while OpenSearch delivers sub-second keyword search for active investigations.
- **Tradeoff Accepted:** Asynchronous replication lag between the write stream and the search index (~1–3 seconds), which is fully acceptable for audit workloads.

### Decision 4: Event Payload Format — JSON Patch Diffs vs Full Row Snapshots

```json
// Example: Canonical RFC 6902 JSON Diff Payload
{
  "event_id": "aud_01HXYZ789ABC",
  "version": 1,
  "timestamp": "2026-08-25T14:32:00.123Z",
  "tenant_id": "org_enterprise_99",
  "actor": {
    "id": "usr_sec_456",
    "type": "USER",
    "ip_address": "198.51.100.42",
    "user_agent": "Mozilla/5.0...",
    "session_id": "sess_8823"
  },
  "action": "IAM_ROLE_UPDATE",
  "resource": {
    "type": "USER_MEMBERSHIP",
    "id": "mem_7890"
  },
  "changes": [
    { "op": "replace", "path": "/role", "old_value": "MEMBER", "new_value": "ADMIN" },
    { "op": "add", "path": "/permissions/can_export", "old_value": null, "new_value": true }
  ],
  "reason": "Promotion approved by Director under Ticket SEC-402",
  "prev_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "current_hash": "9f83c605...a45b"
}
```

- **Chosen:** Structured RFC 6902 JSON Diff format with strict schema validation.
- **Why:** Storing full snapshots of database rows on every minor update wastes over 80% of storage and makes identifying what actually changed difficult during an audit review. JSON diffs clearly display the exact fields mutated.

---

## 5. Deep Dives — The Parts That Actually Matter

### Deep Dive 1: Cryptographic Hash Chaining and Merkle Notarization

To prove beyond doubt in a court of law or compliance audit that not a single log entry was inserted, removed, or modified, each audit record is chained to its immediate predecessor:

$$\text{Hash}_N = \text{SHA256}(\text{Hash}_{N-1} + \text{Timestamp} + \text{TenantID} + \text{ActorID} + \text{Action} + \text{ResourceID} + \text{Payload})$$

```txt
┌─────────────────────────┐       ┌─────────────────────────┐       ┌─────────────────────────┐
│ Audit Event #101        │       │ Audit Event #102        │       │ Audit Event #103        │
├─────────────────────────┤       ├─────────────────────────┤       ├─────────────────────────┤
│ PrevHash: 4a8f...9b12   │◄──────┼ PrevHash: 7c3d...110a   │◄──────┼ PrevHash: 2b9e...ff41   │
│ Data: Actor=usr_1 ...   │       │ Data: Actor=usr_2 ...   │       │ Data: Actor=usr_3 ...   │
│ Hash: 7c3d...110a       │       │ Hash: 2b9e...ff41       │       │ Hash: 8f4a...66e2       │
└─────────────────────────┘       └─────────────────────────┘       └─────────────────────────┘
```

#### How Tamper-Evidence Works in Practice

1. If an attacker gains physical disk access and alters `Actor=usr_1` to `Actor=usr_99` in Event #101, recomputing the SHA-256 hash of Event #101 produces a mismatch against Event #101's stored `Hash`.
2. Even if the attacker updates Event #101's stored `Hash`, Event #102 contains the original hash in its `PrevHash` field.
3. The chain breaks immediately at the first tampered node.

#### Hourly Merkle Tree Notarization

For high throughput, calculating a single global sequential chain creates a concurrency bottleneck. Instead:
- Hash chaining is calculated per `tenant_id` Kafka partition.
- Every hour, an aggregation worker takes all event hashes across all tenants, builds a Merkle Tree, and notarizes the single **Merkle Root Hash** to an external, independently timestamped witness system (e.g., AWS CloudTrail immutable digest, a public blockchain like Ethereum/Bitcoin, or a Certificate Transparency log).

```txt
                       ┌─────────────────────────┐
                       │    MERKLE ROOT HASH     │ ──► Published to External
                       │       (Notarized)       │     Public Witness Log
                       └────────────┬────────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
             ┌───────────────┐             ┌───────────────┐
             │  Hash(H1+H2)  │             │  Hash(H3+H4)  │
             └───────┬───────┘             └───────┬───────┘
                     │                             │
             ┌───────┴───────┐             ┌───────┴───────┐
             ▼               ▼             ▼               ▼
         ┌───────┐       ┌───────┐     ┌───────┐       ┌───────┐
         │Event 1│       │Event 2│     │Event 3│       │Event 4│
         └───────┘       └───────┘     └───────┘       └───────┘
```

---

### Deep Dive 2: The GDPR "Right to be Forgotten" vs Audit Immutability Paradox (Crypto-Shredding)

Article 17 of the General Data Protection Regulation (GDPR) mandates that upon user request, an organization must delete all personal data (PII) associated with that user. However, financial and medical regulations (SEC, FINRA, HIPAA) mandate that audit logs must **never be deleted or modified**.

If you store `actor_email: "alice@company.com"` directly in an immutable S3 WORM audit log, complying with GDPR requires modifying an unmodifiable object.

```txt
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ THE CRYPTO-SHREDDING SOLUTION                                                           │
│                                                                                         │
│ 1. Dedicated Key Management Service (KMS):                                              │
│    Each User has an individual encryption key: Key_Alice, Key_Bob, etc.                │
│                                                                                         │
│ 2. Audit Event Ingestion:                                                               │
│    • Public ID: "usr_alice_42" (Pseudonymous identifier)                                │
│    • PII Payload: Encrypt("alice@company.com", Key_Alice) ──► "8fa7b49e1..."           │
│                                                                                         │
│ 3. On GDPR Erasure Request:                                                             │
│    • Delete `Key_Alice` from KMS permanently.                                           │
│    • Do NOT touch the audit log in S3 Object Lock.                                      │
│                                                                                         │
│ 4. Result:                                                                              │
│    • The Audit Log chain remains 100% cryptographically intact and immutable.           │
│    • Alice's PII ciphertext is rendered mathematically impossible to decrypt.           │
│    • Both GDPR Article 17 and SOC2/HIPAA immutability regulations are fully satisfied. │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Deep Dive 3: Tenant Isolation, Query Indexing, and Search Routing

Audit log systems must support multi-tenant query isolation so that Enterprise Customer A can never access or leak logs belonging to Enterprise Customer B.

```txt
                             ┌──────────────────────┐
                             │  Incoming Query API  │
                             │  (Authenticated JWT) │
                             └──────────┬───────────┘
                                        │
                         Extract & Force Tenant Filter
                         (tenant_id = 'tenant_enterprise_42')
                                        │
                                        ▼
                             ┌──────────────────────┐
                             │ OpenSearch Cluster   │
                             └──────────┬───────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
┌─────────────────────────────────────────┐   ┌─────────────────────────────────────────┐
│ Tenant-Specific Alias / Routing         │   │ Index Lifecycle Management (ILM)        │
│ • queries routed by `_routing=tenant_id`│   │ • Hot (0–30 days): NVMe SSD             │
│ • eliminates cluster-wide broadcast     │   │ • Warm (30–90 days): EBS gp3            │
│ • guarantees zero cross-tenant leakage  │   │ • Cold (90+ days): Purged from index,   │
│                                         │   │   queried via Athena / S3 Parquet       │
└─────────────────────────────────────────┘   └─────────────────────────────────────────┘
```

1. **Routing and Aliases:** Every document in OpenSearch is indexed with a custom routing key: `_routing = tenant_id`. When a user searches their activity logs, the query is dispatched only to the specific shard holding that tenant's records, eliminating cluster-wide scatter-gather overhead.
2. **Time-Series Index Partitioning:** Indices are rolled over daily or weekly (`audit-events-2026-w34`). When data crosses the 90-day boundary, the entire index is dropped from OpenSearch. Because the raw data already lives permanently on S3 in Parquet format, no data is lost.
3. **Cold Data Querying:** If an auditor requests records from 3 years ago, the Audit Query API executes a federated SQL query via Amazon Athena / DuckDB directly over the S3 WORM Parquet files, scanning only the requested tenant's partition prefix.

---

## 6. Failure Modes and Resilience

### 1. Ingestion Pipeline Backpressure and Kafka Consumer Lag

- **Scenario:** A massive batch import or DDoS attack causes a microservice to emit 100,000 audit events per second, exceeding the ingestion worker processing capacity.
- **System Impact:** Kafka topic lag spikes. If consumer offsets fall behind Kafka's retention window, audit logs could be dropped.
- **Mitigation:**
  - Ingestion workers are horizontally autoscaled based on Kafka consumer group lag metrics (`records-lag-max`).
  - Workers use micro-batching: instead of writing individual records to OpenSearch/S3, workers buffer records in memory and execute bulk inserts of 5,000 documents per batch.
  - S3 Parquet streaming uses local NVMe buffering before multipart uploads.

### 2. Search Engine (OpenSearch) Outage

- **Scenario:** The OpenSearch cluster experiences out-of-memory errors or storage exhaustion, rejecting write requests.
- **System Impact:** Audit Query Dashboard goes down.
- **Resilience Guarantee:** **Zero data loss on the write path.**
  - Kafka topics are configured with 7-day retention and disk-backed buffers.
  - The S3 WORM cold-storage consumer runs as an independent Kafka consumer group. Even if OpenSearch is completely offline, audit logs continue writing safely to S3.
  - Once OpenSearch is recovered, a replay consumer replays events from S3 or Kafka to rebuild the search index.

### 3. Duplicate Delivery in Distributed Streams (At-Least-Once Delivery)

- **Scenario:** A worker processes a batch of audit events, writes to S3, but crashes before committing its Kafka consumer offset. The replacement worker reprocesses the same batch.
- **System Impact:** Duplicate audit events in search indices and broken sequential hash chains.
- **Mitigation:**
  - Every audit event carries a deterministic `event_id` (UUIDv7 or Snowflake ID generated at the initial outbox transaction).
  - OpenSearch uses `event_id` as the document `_id` for idempotent upserts.
  - Hash chain verification ignores duplicate sequence numbers by deduplicating against the last recorded `event_id` per tenant stream.

---

## 7. What Makes a Great Answer vs an Average One

```txt
┌──────────────────────────────────────┬──────────────────────────────────────┐
│ AVERAGE CANDIDATE                    │ SENIOR / STAFF CANDIDATE             │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ Writes logs directly from app code   │ Uses Transactional Outbox + CDC to   │
│ via async HTTP or message queues     │ eliminate dual-write partial failures│
│ (misses the dual-write problem).     │ atomically at the database engine.   │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ Hand-waves immutability as "we set   │ Implements S3 Object Lock WORM in    │
│ read-only SQL database permissions". │ Compliance Mode + cryptographic hash │
│                                      │ chains and Merkle root notarization. │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ Ignores GDPR conflicts with          │ Proactively explains Crypto-Shredding│
│ immutable audit log retention.       │ using per-user KMS key vaults.       │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ Dumps everything into a single SQL   │ Implements storage tiering: Hot      │
│ database table for multi-year logs.  │ search (OpenSearch) + Cold (S3 WORM  │
│                                      │ Parquet queried via Athena/DuckDB).  │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ Stores full snapshot copies of entire│ Uses RFC 6902 JSON Patch diffs with  │
│ database rows on every mutation.     │ strict schema validation and redaction│
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 8. 🧠 The Memory Hook

An audit log is not an application table; it is a **notarized flight recorder** — captured atomically at the database engine level via the **Transactional Outbox**, sealed cryptographically in **WORM storage with hash chaining**, and **crypto-shredded** for privacy without ever breaking the tamper-proof chain.
