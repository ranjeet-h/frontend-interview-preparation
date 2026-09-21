# 40. Design Payment System

[← Medium examples](index.md)

**Why interviewers ask** — Money must be correct under retries, duplicates, and partial failures — correctness beats speed.

**Core insight** — Ledger is source of truth; every charge is idempotent; external gateway calls are async with reconciliation.

**Architecture**

```txt
Client → Payment API (idempotency key) → ledger DB (ACID, double-entry)
                                      → gateway adapter (Stripe/PayPal)
                                      → fraud scoring (rules + ML)
                                      → settlement/reconciliation batch jobs
```

- **Ledger** — Debit/credit entries; immutable audit trail; never update in place.
- **Idempotency** — Same key returns same result on retry; prevents double charge.
- **Gateway** — Tokenize cards; PCI scope minimized; webhook confirms async status.
- **Fraud** — Velocity checks, device fingerprint, block before capture.

**Key decisions** — Strong consistency on ledger; at-least-once webhooks with dedup; saga for multi-step refunds; never fail open on fraud.

**Scale & failure** — Shard ledger by merchant; gateway timeout → pending state + reconciliation; chargebacks are async dispute workflow; audit log immutable.

**Deep link** — [Payment system](../../backend-designs/design-a-payment-system.md)

**Memory hook** — Idempotency key at the door, ledger never lies, webhooks finish the story.
