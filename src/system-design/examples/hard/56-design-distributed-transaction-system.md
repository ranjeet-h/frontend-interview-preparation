# 56. Design Distributed Transaction System

[← Hard examples](index.md)

**Why interviewers ask** — Every microservice owns its own database; they want to hear how you keep cross-service updates correct without pretending one giant ACID database still exists.

**Core insight** — Distributed transactions are a consistency model choice: 2PC for rare all-or-nothing commits, sagas for long-running workflows, event sourcing when auditability matters more than immediate read consistency.

**Architecture**

```txt
Client → API → Transaction coordinator (or saga orchestrator)
            → Service A (local TX) → DB A
            → Service B (local TX) → DB B
            → Event log / outbox → async consumers + compensations
```

- **2PC path** — Coordinator sends prepare to all participants, waits for votes, then commit or abort; holds locks during prepare.
- **Saga path** — Chain of local transactions; each step publishes an event; failed step triggers compensating actions in reverse order.
- **Event sourcing** — Append-only event log is source of truth; projections rebuild state; replay enables recovery and audit.
- **Outbox pattern** — Write business row and outbound event in same local transaction; relay publishes to message bus.

**Key decisions** — 2PC blocks under coordinator or partition failure (not partition-tolerant); choreography sagas are simpler but harder to debug than orchestration; idempotency keys on every step prevent duplicate side effects.

**Scale & failure** — Coordinator is a single point of failure unless clustered; saga timeouts need explicit compensation; event replay must be deterministic; monitor in-doubt transactions and stuck compensations.

**Deep link** — [Strong vs eventual consistency](../../foundations/strong-vs-eventual-consistency.md) · [CAP theorem](../../foundations/cap-theorem.md)

**Memory hook** — 2PC locks everyone in a room; sagas undo step by step; events never forget.
