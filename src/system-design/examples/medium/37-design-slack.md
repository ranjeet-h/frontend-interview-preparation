# 37. Design Slack

[← Medium examples](index.md)

**Why interviewers ask** — Team chat with channels, threads, search, files, and integrations — org structure shapes the data model.

**Core insight** — Workspace is the tenancy boundary; channels index messages for search; realtime delivery plus durable log for history and compliance.

**Architecture**

```txt
Client ↔ WebSocket → Message API → append-only message log (per channel)
                → Channel/workspace ACL service
                → Search index (Elasticsearch, near-real-time)
                → File uploads → object storage
                → Integration bots → outbound webhooks + Events API
```

- **Workspaces** — Multi-tenant; roles (admin, member, guest) gate channel access.
- **Messages** — Thread replies as parent-child; edit/delete propagate to index.
- **Search** — Index message text, files, users; respect ACL at query time.
- **Files** — Upload to S3; virus scan; preview generation async.

**Key decisions** — Channel ID as partition key for message ordering; search lags writes by seconds; integrations are untrusted — rate limit and sandbox.

**Scale & failure** — Hot channels shard message log; search replicas for read; WebSocket reconnect replays from last seen timestamp; export for compliance.

**Deep link** — [Real-time chat](../../backend-designs/design-a-real-time-chat-system.md)

**Memory hook** — Workspace walls, channel logs, search catches up async.
