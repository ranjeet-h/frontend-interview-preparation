# 15. Design Leaderboard

[← Easy examples](index.md)

**Why interviewers ask:** Leaderboards need fast rank queries and fast score updates — classic Redis sorted-set territory. Interviewers test O(log n) rank vs full table scans and how you handle global vs friend leaderboards.

**Core insight:** Keep scores in a sorted set for real-time rank and top-N; optionally persist to DB for durability; batch extreme write bursts through a queue if needed.

**Architecture**

```txt
Game client → Score API (report score delta)
              ↓
         Redis sorted set (member= user_id, score= points)
              ↓ optional burst
         Message queue → batch score updater
              ↓ durability
         DB snapshot (periodic or on milestone)
         Read API: ZREVRANK / ZRANGE top N
```

- **Redis sorted set:** `ZADD` updates score O(log n); `ZRANGE` top 100 O(log n + N); `ZREVRANK` user rank O(log n) — ideal for live boards.
- **Score API:** Validates anti-cheat basics (max delta, rate limit); applies increment to sorted set.
- **Batch path:** Extreme QPS games enqueue score events; worker batches `ZADD` to reduce Redis command storms.
- **DB snapshot:** Periodic export for historical seasons and recovery if Redis restarts — leaderboard can rebuild from event log.
- **Scoped boards:** Separate sorted set keys per game mode, region, or weekly season — avoids one giant set.

**Key decisions**

- **Redis only vs Redis + DB:** Redis for live board; DB for history — pure Redis risks data loss on crash unless AOF/RDB tuned.
- **Exact rank vs approximate:** Exact rank for top 1000 users; approximate (HyperLogLog / bucketing) for "you beat X% of players" at huge scale.
- **Global cache top 100:** Precompute `ZRANGE 0 99` every second for homepage — sub-ms read for spectators.

**Scale & failure:** Single global sorted set with millions of members makes rank queries slower and memory heavy first. Mitigation: shard by league/region, trim inactive players to cold storage, and cache top-N separately.

**Memory hook:** Leaderboard is a live exam ranking — sorted set is the score sheet, ZADD moves you up, ZRANGE reads the podium.
