# 34. Design Rate Limiter

[← Medium examples](index.md)

**Why interviewers ask** — Every API needs fair usage and abuse protection; they want algorithm knowledge plus distributed counter design.

**Core insight** — Rate limiting is atomic counter math on a shared store; algorithm choice trades burst tolerance vs memory vs boundary accuracy.

**Architecture**

```txt
Request → API gateway → rate limit middleware → Redis (atomic INCR / Lua token bucket)
                     → allowed → upstream service
                     → denied  → 429 + Retry-After
```

- **Token bucket** — Allows bursts; refill rate caps average; most common in production APIs.
- **Leaky bucket** — Smooths output rate; good for protecting downstream.
- **Sliding window** — Accurate but memory-heavy; hybrid counter approximates cheaply.
- **Fixed window** — Simple but double-burst at boundary.

**Key decisions** — Enforce at gateway edge; key = user ID or API key; Redis cluster for distributed counts; fail-open vs fail-closed on Redis outage.

**Scale & failure** — Lua scripts for atomic check-and-decrement; local cache for coarse global limits; per-tenant tiers in config service; monitor throttle rate for abuse signals.

**Deep link** — [Rate limiter](../../backend-designs/design-a-rate-limiter.md) · [Foundation: algorithms](../../foundations/rate-limiter.md)

**Memory hook** — Token bucket for bursts, Redis Lua for atomic, gateway for enforcement.
