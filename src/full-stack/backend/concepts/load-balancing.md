# Load Balancing

## Detailed explanation

Load balancing distributes requests across multiple backend instances so traffic is shared and failures are tolerated.

## 1. One-line mental model

Spread requests across healthy servers.

## 2. Problem it solves

One server cannot handle all traffic or provide high availability alone.

## 3. Core idea

- Can be layer 4 or layer 7.
- Uses algorithms like round-robin, least connections, or weighted routing.
- Requires health checks.
- Works best with stateless app instances.
- Can drain connections during deploys.

## 4. Visual / analogy

```txt
Traffic officer sends cars to open lanes.
```

## 5. Minimal example

```txt
Load balancer -> app-1/app-2/app-3
```

## 6. Real-world example

API runs 6 containers behind ALB; unhealthy containers stop receiving traffic.

## 7. Common interview questions

1. What is Load Balancing?
2. Why does Load Balancing matter in backend systems?
3. How would you explain Load Balancing in an interview?
4. What bugs happen when Load Balancing is handled poorly?
5. How does Load Balancing affect frontend clients?
6. How would you test Load Balancing?

## 8. Active recall test

1. Explain Load Balancing without looking at notes.
2. Give one production bug related to Load Balancing.
3. Give one API or backend example where Load Balancing matters.
4. Explain how a frontend client should react to Load Balancing.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Load Balancing is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Load Balancing in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Load Balancing in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
