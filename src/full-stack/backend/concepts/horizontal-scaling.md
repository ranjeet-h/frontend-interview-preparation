# Horizontal Scaling

## Detailed explanation

Horizontal scaling increases capacity by adding more machines, containers, or workers.

## 1. One-line mental model

Scale out by adding instances.

## 2. Problem it solves

Traffic growth eventually exceeds one server, and horizontal scaling improves capacity and availability.

## 3. Core idea

- Needs stateless app workers or shared state.
- Requires load balancing.
- Shared stores handle sessions, cache, and queues.
- Database may become next bottleneck.
- Autoscaling can respond to traffic.

## 4. Visual / analogy

```txt
Add more checkout counters.
```

## 5. Minimal example

```txt
kubectl scale deployment api --replicas=6
```

## 6. Real-world example

Node API scales from 2 to 10 containers during sale traffic.

## 7. Common interview questions

1. What is Horizontal Scaling?
2. Why does Horizontal Scaling matter in backend systems?
3. How would you explain Horizontal Scaling in an interview?
4. What bugs happen when Horizontal Scaling is handled poorly?
5. How does Horizontal Scaling affect frontend clients?
6. How would you test Horizontal Scaling?

## 8. Active recall test

1. Explain Horizontal Scaling without looking at notes.
2. Give one production bug related to Horizontal Scaling.
3. Give one API or backend example where Horizontal Scaling matters.
4. Explain how a frontend client should react to Horizontal Scaling.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Horizontal Scaling is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Horizontal Scaling in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Horizontal Scaling in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
