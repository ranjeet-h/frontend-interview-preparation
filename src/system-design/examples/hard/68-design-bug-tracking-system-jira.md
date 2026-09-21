# 68. Design Bug Tracking System (Jira)

[← Hard examples](index.md)

**Why interviewers ask** — Workflow-heavy CRUD with search, permissions, and notifications — tests whether you can model state machines and multi-tenant project isolation.

**Core insight** — Issues are stateful entities driven by configurable workflows; search and notifications are async paths off the write-critical issue service.

**Architecture**

```txt
Client → API gateway → Issue service (CRUD + workflow transitions)
                    → Project / permission service
                    → Search indexer (Elasticsearch) ← change events
                    → Notification service ← assignment / status change events
```

- **Issue model** — Type, status, assignee, priority, custom fields per project schema.
- **Workflow engine** — Valid transitions per issue type; guards (only assignee can close); post-functions (auto-notify).
- **Search** — Denormalized index updated via event stream; JQL-like query language.
- **Permissions** — Project-scoped roles; field-level visibility for sensitive custom fields.

**Key decisions** — Eventual consistency on search index is fine; optimistic locking on issue updates prevents lost edits; webhook delivery is at-least-once with retry.

**Scale & failure** — Shard issues by project; hot projects get dedicated index shards; notification storms batched and deduplicated; audit log append-only for compliance.

**Deep link** — [Background job system](../../backend-designs/design-a-background-job-system.md) · [Notification system](../../backend-designs/design-a-notification-system.md)

**Memory hook** — Issues flow through workflows, search lags slightly, notifications chase state changes.
