# 63. Design Real-time Multiplayer Game Server

[← Hard examples](index.md)

**Why interviewers ask** — Sub-100ms latency, authoritative state, and cheat prevention — the server is the referee, not a message relay.

**Core insight** — Server simulates truth; clients predict locally and reconcile; send deltas, not full world state, prioritized by relevance.

**Architecture**

```txt
Matchmaker → assign players to regional game server instance
Game server (authoritative) ← client inputs (UDP)
                          → state deltas → clients (interest management)
Anti-cheat → server validates physics bounds, rate limits actions
Persistence → async checkpoint of match results / inventory
```

- **State sync** — Fixed tick rate (e.g. 20–60 Hz); serialize only changed entities in player's AOI (area of interest).
- **Latency hiding** — Client-side prediction for movement; server rewind for hit detection.
- **Matchmaking** — Skill-based queues (ELO/MMR), region preference, party grouping.
- **Scaling** — One process per match; lobby service routes players; shard by game mode.

**Key decisions** — UDP for gameplay, TCP for lobby/meta; server authoritative over client claims; compression and quantization for positions.

**Scale & failure** — Game server crash ends match with refund/compensation policy; replay logs for dispute resolution; bot backfill when queues are thin.

**Memory hook** — Server is truth, client predicts, deltas only — never broadcast the whole world.
