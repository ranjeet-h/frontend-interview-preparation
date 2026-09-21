# 45. Design Google Docs

[← Medium examples](index.md)

**Why interviewers ask** — Real-time collaborative editing with conflict resolution — OT or CRDT — plus version history at scale.

**Core insight** — Single document is a sequence of operations; concurrent edits merge via OT (transform against concurrent ops) or CRDT (merge without central ordering).

**Architecture**

```txt
Client ↔ WebSocket → collaboration server → apply/transform ops → document state
                  → broadcast ops to other clients in same doc
                  → snapshot + op log storage (periodic snapshot + incremental ops)
                  → version history API (replay ops or diff snapshots)
```

- **Sync** — Client sends ops (insert/delete with position/identifier); server orders and transforms.
- **Storage** — Snapshot every N ops plus append-only op log; GC old ops after snapshot.
- **Presence** — Cursor and selection per user via same channel.

**Key decisions** — OT needs central server ordering; CRDT allows offline but different data model; snapshot interval trades storage vs replay cost.

**Scale & failure** — Shard collaboration server by document ID; reconnect replays missed ops from version vector; large docs split into segments; conflict-free intent is the goal.

**Memory hook** — Ops not snapshots over the wire; transform or CRDT, then persist the log.
