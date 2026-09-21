# 84. Design Circuit Breaker Pattern

[← Very Hard examples](index.md)

**Why interviewers ask** — Cascading failure is the default when dependencies slow down. Interviewers want the closed/open/half-open state machine and how you stop retry storms from amplifying outages.

**Core insight** — Track failure rate per dependency; when threshold is exceeded, fail fast locally instead of waiting on a sick service; half-open probes recovery before restoring full traffic.

**Architecture**

```txt
Caller service → circuit breaker wrapper → downstream dependency
                      ↓ rolling failure counter
              Closed (pass) → Open (fail fast) → Half-open (limited probes)
                      ↓ open state
              Fallback (cache / default / degraded response)
```

- **States** — Closed: normal calls pass; Open: immediate failure or fallback after threshold; Half-open: limited probes test recovery.
- **Failure threshold** — Error rate or consecutive failures over a window (e.g. 50% in 10s or 5 consecutive timeouts).
- **Open timeout** — Duration before half-open trial (e.g. 30s) — prevents immediate retry storm on flapping dependency.
- **Success threshold** — Consecutive successes in half-open to close (e.g. 3 of 5 probes succeed).
- **Isolation** — Per-dependency breaker plus bulkhead — one slow endpoint must not exhaust all threads.

**Key decisions** — Breaker complements bounded retries, not infinite loops; fallbacks must be safe (stale cache OK for recommendations, not for auth); emit metrics on every state transition.

**Scale & failure** — Mis-tuned breaker blocking healthy traffic, half-open stampede when many instances probe simultaneously, and missing fallback causing user-visible errors break resilience first. Mitigation: per-endpoint tuning, jittered half-open entry, graceful degradation by design.

**Memory hook** — Breaker is a fuse — too many failures trip it open; half-open is one careful finger on the switch before full power returns.
