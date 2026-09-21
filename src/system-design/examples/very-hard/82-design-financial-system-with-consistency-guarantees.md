# 82. Design Financial System with Consistency Guarantees

[← Very Hard examples](index.md)

**Why interviewers ask** — Money must never be wrong under concurrency, retries, or partial failures. Interviewers test ACID ledger design, double-entry bookkeeping, immutable audit trails, and when you sacrifice availability for consistency.

**Core insight** — Ledger is immutable source of truth; every transfer is double-entry balanced; external gateway calls are idempotent and reconciled async — correctness always beats speed.

**Architecture**

```txt
Client → Payment API (idempotency key) → ledger DB (ACID, serializable)
                                      → fraud scoring (velocity + rules + ML)
                                      → gateway adapter (async webhook confirm)
                                      → reconciliation batch + immutable audit log
```

- **ACID transactions** — Balance updates in one txn; rollback on any failure; isolation prevents double-spend races.
- **Double-entry** — Every debit paired with credit; account sums invariant always holds.
- **Audit trail** — Append-only journal; who/when/what; regulatory export; never mutate balance without a matching entry.
- **Fraud detection** — Pre-authorization scoring; velocity limits; block before capture not after.
- **Distributed money** — Saga or outbox over 2PC across services; local txn plus async completion and nightly reconciliation.

**Key decisions** — Strong consistency on ledger shard; idempotency keys on all writes; pessimistic lock or serializable isolation on balance rows; eventual reads only for non-money views with explicit staleness bounds.

**Scale & failure** — Hot-account lock contention, duplicate webhook delivery, and gateway timeout with unknown state break money flows first. Mitigation: shard ledger by account, webhook dedup table, pending state plus reconciliation jobs.

**Deep link** — [Payment system](../../backend-designs/design-a-payment-system.md)

**Memory hook** — Ledger never lies; idempotency key at the door; reconcile what you cannot confirm synchronously.
