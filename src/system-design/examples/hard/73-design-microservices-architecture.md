# 73. Design Microservices Architecture

[← Hard examples](index.md)

**Why interviewers ask** — Tests service boundaries, discovery, resilience patterns, and observability — not just "split the monolith."

**Core insight** — Microservices buy independent deployability at the cost of distributed complexity; invest in API gateway, service mesh observability, and failure isolation from day one.

**Architecture**

```txt
Client → API gateway (auth, rate limit, routing)
      → Service A ↔ Service B (sync REST/gRPC)
      → Message bus (async events)
Service registry (Consul/Eureka) + config server
Observability: traces (Jaeger) + metrics (Prometheus) + logs (ELK)
```

- **Service registry** — Health-checked instances; client-side or server-side load balancing.
- **API gateway** — Single entry, TLS termination, request routing, cross-cutting auth.
- **Resilience** — Circuit breakers, retries with jitter, bulkheads per dependency.
- **Data** — Database per service; sagas for cross-service transactions.

**Key decisions** — Sync for query paths needing immediate answer; async events for decoupling; avoid distributed monolith (tight coupling).

**Scale & failure** — Circuit breaker opens on dependency failure; bulkhead limits blast radius; chaos testing validates failover paths.

**Deep link** — [Microservices vs monolith](../../foundations/microservices-vs-monolith.md) · [API gateway vs load balancer](../../foundations/api-gateway-vs-load-balancer.md)

**Memory hook** — Gateway in front, registry underneath, breakers around every call.
