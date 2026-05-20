# Health Check Endpoint

## Detailed explanation

A health check endpoint reports whether a service is alive and ready to receive traffic.

## 1. One-line mental model

Health checks tell infrastructure whether to route traffic to an instance.

## 2. Problem it solves

Load balancers and orchestrators need automated signals to restart or remove unhealthy app instances.

## 3. Core idea

- Liveness means process is alive.
- Readiness means app can serve traffic.
- Check critical dependencies carefully.
- Keep health endpoints fast.
- Do not expose sensitive internals publicly.

## 4. Visual / analogy

```txt
Doctor check before joining game.
```

## 5. Minimal example

```txt
GET /healthz -> 200 OK
```

## 6. Real-world example

Load balancer removes instance when readiness check fails database connectivity.

## 7. Common interview questions

1. What is Health Check Endpoint?
2. Why does Health Check Endpoint matter in backend systems?
3. How would you explain Health Check Endpoint in an interview?
4. What bugs happen when Health Check Endpoint is handled poorly?
5. How does Health Check Endpoint affect frontend clients?
6. How would you test Health Check Endpoint?

## 8. Active recall test

1. Explain Health Check Endpoint without looking at notes.
2. Give one production bug related to Health Check Endpoint.
3. Give one API or backend example where Health Check Endpoint matters.
4. Explain how a frontend client should react to Health Check Endpoint.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Health Check Endpoint is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Health Check Endpoint in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Health Check Endpoint in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
