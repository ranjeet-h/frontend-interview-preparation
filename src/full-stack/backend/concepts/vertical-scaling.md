# Vertical Scaling

## Detailed explanation

Vertical scaling increases capacity by giving one server more CPU, memory, disk, or network resources.

## 1. One-line mental model

Scale up by making one machine bigger.

## 2. Problem it solves

Some bottlenecks are simpler to solve with bigger resources before adding distributed complexity.

## 3. Core idea

- Easy to apply for databases and small apps.
- Has hardware and cost limits.
- Does not improve availability by itself.
- Can reduce immediate CPU or memory pressure.
- Often combined with horizontal scaling later.

## 4. Visual / analogy

```txt
Replace small truck with bigger truck.
```

## 5. Minimal example

```txt
Move database from 2 vCPU/4GB RAM to 8 vCPU/32GB RAM.
```

## 6. Real-world example

Slow analytics API improves after adding memory for larger working set.

## 7. Common interview questions

1. What is Vertical Scaling?
2. Why does Vertical Scaling matter in backend systems?
3. How would you explain Vertical Scaling in an interview?
4. What bugs happen when Vertical Scaling is handled poorly?
5. How does Vertical Scaling affect frontend clients?
6. How would you test Vertical Scaling?

## 8. Active recall test

1. Explain Vertical Scaling without looking at notes.
2. Give one production bug related to Vertical Scaling.
3. Give one API or backend example where Vertical Scaling matters.
4. Explain how a frontend client should react to Vertical Scaling.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Vertical Scaling is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Vertical Scaling in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Vertical Scaling in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
