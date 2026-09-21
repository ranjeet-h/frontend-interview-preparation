# 74. Design GraphQL API

[← Hard examples](index.md)

**Why interviewers ask** — Clients want flexible queries; you must prevent malicious deep queries, solve N+1 fetches, and explain caching tradeoffs vs REST.

**Core insight** — GraphQL shifts complexity to the server: one endpoint, client-specified shape — protect with query cost analysis and DataLoader batching.

**Architecture**

```txt
Client → GraphQL gateway → resolvers per type/field
                        → DataLoader (batch + cache per request)
                        → backing REST/DB services
Query validator → depth limit, complexity score, timeout
```

- **Schema** — Types, queries, mutations; federation for multi-team ownership.
- **N+1 fix** — DataLoader batches field resolves into single DB/API call per tick.
- **Complexity limits** — Reject queries exceeding depth/cost budget before execution.
- **Caching** — HTTP caching harder; use persisted queries or CDN for public read-heavy fields.

**Key decisions** — GraphQL for mobile/clients with varied data needs; REST for simple CRUD and cache-friendly public APIs; subscriptions over WebSocket for live data.

**Scale & failure** — Query timeout kills runaway resolvers; partial errors in GraphQL response; rate limit per API key.

**Deep link** — [Scalable REST API](../../backend-designs/design-a-scalable-rest-api.md)

**Memory hook** — Client picks the shape, server batches the fetches, complexity limits guard the door.
