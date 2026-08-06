# Design an audit log system

## Detailed explanation

Design an audit log system is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, design an audit log system affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is an audit log and how does it differ from application logs?
- **The Engine Mechanism (Why it behaves this way):** An audit log is an immutable, append-only record of who did what, when, and to which resource. It captures: actor (user/service), action (create, update, delete, login), resource (entity type and ID), timestamp, source IP, and before/after state (for mutations). Unlike application logs (which track system behavior for debugging), audit logs track business events for compliance, security investigation, and accountability. Audit logs must be tamper-proof — once written, they cannot be modified or deleted. They are stored in a separate, write-only data store with strict access controls.
- **The Unforgettable Mental Model:** The **Bank Vault Ledger**. Every transaction (action) is recorded in a permanent ledger (audit log) with who made it (actor), what they did (action), which account was affected (resource), and when (timestamp). The ledger is locked in a vault (immutable storage) — no one can erase or alter entries, not even the bank manager.
- **The Trap:** Storing audit logs in the same database as application data with normal CRUD permissions. An attacker (or disgruntled employee) with database access could delete audit entries. Audit logs must be in a separate, append-only store.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: An audit log is an immutable, append-only record of business events — who did what, when, and to which resource. Unlike application logs that track system behavior for debugging, audit logs track user actions for compliance, security, and accountability. Each entry captures actor, action, resource, timestamp, source IP, and before/after state. Audit logs are stored in a separate, write-only data store (like an append-only table or S3 with object lock) with strict access controls. They must be tamper-proof — once written, never modified or deleted."

#### How do you ensure audit logs are tamper-proof?
- **The Engine Mechanism (Why it behaves this way):** Tamper-proofing uses multiple strategies: (1) Append-only storage — the database user that writes audit logs has INSERT-only permissions, no UPDATE or DELETE; (2) Cryptographic chaining — each audit entry includes a hash of the previous entry (like a blockchain), so modifying any entry breaks the chain; (3) Write-ahead logging — audit entries are written to a separate WAL before the main transaction commits, ensuring they exist even if the transaction rolls back; (4) Immutable storage — S3 Object Lock or WORM storage prevents deletion/modification for a retention period; (5) External shipping — audit logs are streamed to an external system (Splunk, Datadog) in real-time, so even if the primary store is compromised, a copy exists elsewhere.
- **The Unforgettable Mental Model:** The **Chain-Linked Diary**. Each page (audit entry) contains a fingerprint (hash) of the previous page. If someone tears out or alters a page, the fingerprints don't match and the tampering is obvious. The diary is kept in a glass case (immutable storage) where you can add pages but never remove them. A photocopy is sent to a lawyer (external system) in real-time.
- **The Trap:** Relying only on database permissions for tamper-proofing. A database admin with root access can bypass permissions. Always use cryptographic chaining or external shipping as an additional layer.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd implement defense in depth. First, the audit log database user has INSERT-only permissions — no UPDATE or DELETE. Second, each entry includes a SHA-256 hash of the previous entry, creating a cryptographic chain that detects any tampering. Third, audit entries are written via write-ahead logging before the main transaction commits. Fourth, logs are streamed in real-time to an external system (Splunk) via Kafka. Finally, for compliance, logs are archived to S3 with Object Lock enabled. Even a database admin can't tamper with the full chain."

#### How do you capture before/after state for data mutations?
- **The Engine Mechanism (Why it behaves this way):** Before/after state is captured at the application level or database level. Application-level: the service fetches the current state (before), performs the mutation, captures the new state (after), and writes both to the audit log. Database-level: use database triggers or change data capture (CDC) with Debezium to capture row-level changes from the WAL. CDC is more reliable because it captures all changes regardless of how they're made (application, direct SQL, migration). The before/after state is stored as JSON, with sensitive fields redacted. For large objects, store only the changed fields (diff) instead of the full state to save space.
- **The Unforgettable Mental Model:** The **Before/After Photo**. A photographer takes a picture of the room before renovation (before state), the renovation happens (mutation), then another picture after (after state). The comparison shows exactly what changed. For efficiency, the photographer could just photograph the changed wall (diff) instead of the entire room.
- **The Trap:** Storing full before/after state for every mutation. For large records (a user profile with 50 fields), this wastes massive storage. Store only the changed fields (diff) or use column-level tracking.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use CDC (Change Data Capture) with Debezium at the database level because it captures all changes regardless of source — application code, direct SQL, or migrations. Debezium reads the database WAL and streams row-level changes to Kafka, where an audit consumer formats them into audit entries. For application-level control, I'd capture before state before the mutation and after state after, storing both as JSON. To save space, I'd store only the diff (changed fields) for large records. Sensitive fields (passwords, SSNs) are always redacted."

#### How do you design the audit log query API?
- **The Engine Mechanism (Why it behaves this way):** The query API supports filtering by: actor (user_id, service_name), action (create, update, delete), resource (entity_type, entity_id), time range (from, to), and source IP. Results are paginated with cursor-based pagination. The API is read-only and requires elevated permissions (auditor role). For compliance, the API supports exporting audit logs in a standardized format (CSV, JSON) with a digital signature for verification. Query performance is ensured by indexing on (resource_type, resource_id, timestamp) and (actor_id, timestamp). For large-scale systems, use a read-optimized store (Elasticsearch, ClickHouse) fed by the audit log write stream.
- **The Unforgettable Mental Model:** The **Detective's Case File Search**. The detective (auditor) searches the case files (audit logs) by suspect name (actor), crime type (action), victim (resource), and time period. The filing system (indexes) makes searches fast. The detective can export a copy of relevant files (API export) with a notary seal (digital signature) for court.
- **The Trap:** Building the query API on the same write-optimized store. Write-optimized stores (append-only tables) are slow for complex queries. Use a separate read-optimized store (Elasticsearch) fed by the audit stream.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The query API supports filtering by actor, action, resource, time range, and source IP with cursor-based pagination. It's read-only and requires an 'auditor' role. For performance, I'd use a read-optimized store (Elasticsearch or ClickHouse) fed by the audit log write stream via Kafka. Indexes on (resource_type, resource_id, timestamp) and (actor_id, timestamp) ensure fast queries. The API supports exporting logs in CSV/JSON with a digital signature for compliance verification. The write path (append-only table) and read path (search engine) are completely separated."

#### How do you handle audit log volume for high-throughput systems?
- **The Engine Mechanism (Why it behaves this way):** High-volume audit logs are managed through: (1) Async writing — audit entries are published to Kafka and consumed by workers that batch-write to the store; (2) Partitioning — partition the audit log table by month or day for efficient pruning; (3) Compression — compress before/after state with ZSTD; (4) Sampling for high-frequency events — log every 100th read event but every write event; (5) Archival — move logs older than the compliance period to cold storage (S3 Glacier); (6) Aggregation — for high-frequency events (page views), store aggregated counts instead of individual entries. The Kafka pipeline provides backpressure handling and ensures no audit entries are lost during store outages.
- **The Unforgettable Mental Model:** The **High-Speed Assembly Line**. Products (audit entries) come off the line fast. They're sorted into bins by date (partitioning), compressed into smaller boxes (compression), and shipped to the warehouse (storage). Items older than a year go to the off-site facility (cold storage). The conveyor belt (Kafka) keeps moving even if the warehouse is temporarily full.
- **The Trap:** Writing audit entries synchronously in the request path. This adds latency to every operation and creates a bottleneck. Always write audit logs asynchronously via a message queue.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd write audit entries asynchronously via Kafka. The application publishes audit events to Kafka, and consumer workers batch-write them to the append-only store. The audit table is partitioned by month for efficient querying and archival. Before/after state is compressed with ZSTD. For very high-frequency events, I'd aggregate instead of logging individually. Logs beyond the compliance retention period are archived to S3 Glacier. The Kafka pipeline provides durability — if the store goes down, events are buffered and replayed when it recovers."

#### How do you handle audit logs for compliance (SOC2, HIPAA, GDPR)?
- **The Engine Mechanism (Why it behaves this way):** Compliance requirements dictate: (1) Retention period — SOC2 requires 1+ years, HIPAA requires 6 years, GDPR requires data minimization (delete when no longer needed); (2) Access controls — only authorized auditors can read audit logs; (3) Immutability — logs cannot be altered or deleted during the retention period; (4) Encryption — logs are encrypted at rest (AES-256) and in transit (TLS); (5) PII handling — GDPR requires the ability to anonymize or delete personal data, which conflicts with immmutability. The solution: store a hash of PII in the audit log and keep the actual PII in a separate, deletable store. Audit logs reference the hash, not the raw data.
- **The Unforgettable Mental Model:** The **Safe Deposit Box with Rules**. The box (audit log) has strict rules: keep contents for 6 years (retention), only the bank manager can look (access control), no one can change contents (immutability), and the box is in a vault (encryption). But if a customer asks to remove their name (GDPR), you replace it with a reference number (hash) instead of deleting the entry.
- **The Trap:** Storing raw PII in audit logs. GDPR's right to erasure conflicts with audit log immutability. If you store a user's name in an immutable audit log, you can't delete it when they request erasure. Store hashes or references instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For compliance, I'd implement retention policies matching regulatory requirements — 1 year for SOC2, 6 years for HIPAA. Audit logs are encrypted at rest and in transit, with strict role-based access for auditors. Immutability is enforced via append-only storage and S3 Object Lock. For GDPR, I'd avoid storing raw PII in audit logs — instead, I'd store a hash of the PII and keep the actual data in a separate, deletable store. When a user requests erasure, the PII store is deleted but the audit log retains the hash reference, preserving the audit trail while complying with erasure requests."

#### How do you monitor the health of the audit logging system itself?
- **The Engine Mechanism (Why it behaves this way):** Monitoring tracks: (1) Write latency — time from event occurrence to audit log persistence; (2) Queue depth — number of pending audit events in Kafka; (3) Write failure rate — percentage of audit entries that fail to persist; (4) Storage growth rate — GB/day of audit log storage; (5) Query latency — time to execute common audit queries; (6) Tamper detection — periodic verification of the cryptographic hash chain. Alerts fire on: write latency exceeding SLA, queue depth growing beyond threshold, write failures, and hash chain breaks. A dashboard shows real-time audit system health.
- **The Unforgettable Mental Model:** The **Security System Monitor**. The monitor shows: how fast cameras record (write latency), how many unprocessed recordings are queued (queue depth), how many cameras are offline (write failures), how much storage is used (storage growth), and whether anyone tampered with footage (hash chain verification). Alarms sound if anything goes wrong.
- **The Trap:** Not monitoring the audit system itself. If the audit logging system fails silently, you have no record of what happened during the outage — which is exactly when you need audit logs most. Monitor the audit system more rigorously than the application.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd monitor the audit system with the same rigor as the application. Key metrics: write latency (event to persistence), Kafka queue depth, write failure rate, storage growth rate, and query latency. I'd run periodic hash chain verification to detect tampering. Alerts fire on write latency exceeding 1 second, queue depth beyond 10K events, any write failures, and hash chain breaks. The audit system's health dashboard is on the primary operations dashboard — if audit logging fails, it's a P1 incident."

## 8. Active recall test

1. **What is the key difference between audit logs and application logs?**
   - **Explanation:** Audit logs track who did what to which resource (business events) for compliance and security. Application logs track system behavior for debugging. Audit logs are immutable and append-only; application logs can be rotated and deleted.

2. **How do you make audit logs tamper-proof?**
   - **Explanation:** Append-only database permissions (INSERT only), cryptographic chaining (each entry hashes the previous), write-ahead logging, immutable storage (S3 Object Lock), and real-time streaming to an external system (Splunk).

3. **What is the best way to capture before/after state for mutations?**
   - **Explanation:** Use CDC (Change Data Capture) with Debezium at the database level — it captures all changes from the WAL regardless of source. Store before/after as JSON, with sensitive fields redacted. For large records, store only the diff.

4. **Why separate the audit log write path from the read path?**
   - **Explanation:** Write-optimized stores (append-only tables) are slow for complex queries. A separate read-optimized store (Elasticsearch, ClickHouse) fed by the audit stream enables fast filtering and aggregation without impacting write performance.

5. **How do you handle GDPR's right to erasure with immutable audit logs?**
   - **Explanation:** Don't store raw PII in audit logs. Store a hash of the PII and keep actual PII in a separate, deletable store. When erasure is requested, delete the PII store but retain the hash reference in the immutable audit log.

6. **How do you handle high-volume audit log writes without impacting application performance?**
   - **Explanation:** Publish audit events asynchronously to Kafka. Consumer workers batch-write to the append-only store. Partition the audit table by month. Compress before/after state with ZSTD. Archive old logs to cold storage.

7. **What metrics indicate the audit logging system is unhealthy?**
   - **Explanation:** Write latency > 1 second, Kafka queue depth growing beyond threshold, write failures, storage growth rate spikes, query latency degradation, and cryptographic hash chain breaks (tamper detection).

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design an audit log system in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design an audit log system in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
