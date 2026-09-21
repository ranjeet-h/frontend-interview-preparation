# 79. Design GDPR-Compliant System

[← Hard examples](index.md)

**Why interviewers ask** — Privacy by design: right to erasure, portability, consent, and audit trails — not a legal checklist bolted on later.

**Core insight** — Personal data must be discoverable, deletable, and exportable across all stores; design data maps and deletion cascades before you accumulate years of logs.

**Architecture**

```txt
User request → identity verification → data map lookup (all PII locations)
            → erasure workflow (hard delete + anonymize analytics)
            → export job (JSON bundle of user data)
Consent service → granular opt-in/out → propagates to marketing, analytics
Audit log → immutable record of access, deletion, consent changes
```

- **Right to erasure** — Soft delete with grace period, then hard delete; anonymize irreplaceable aggregates.
- **Portability** — Machine-readable export within SLA (e.g. 30 days).
- **Consent** — Versioned consent records; block processing without valid consent.
- **Privacy by design** — Minimize collection, encrypt at rest, pseudonymize analytics IDs.

**Key decisions** — Data inventory (what, where, why); cascade delete across DB, S3, backups, search index; legal hold overrides erasure.

**Scale & failure** — Async deletion jobs for large accounts; verify deletion with audit scan; backup retention policy aligned with erasure requests.

**Deep link** — [Audit log system](../../backend-designs/design-an-audit-log-system.md)

**Memory hook** — Map every copy, delete them all, prove you did — consent gates the rest.
