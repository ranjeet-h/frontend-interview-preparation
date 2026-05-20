# Cache-Control

## Detailed explanation

Cache-Control is the primary HTTP header for controlling who may cache a response and for how long.

## 1. One-line mental model

Cache-Control sets freshness and privacy rules for HTTP caching.

## 2. Problem it solves

Wrong cache-control can leak private data or waste bandwidth by disabling useful caching.

## 3. Core idea

- `public` allows shared caches.
- `private` restricts to user-specific cache.
- `no-store` avoids storing sensitive data.
- `max-age` sets freshness lifetime.
- `stale-while-revalidate` allows temporary stale responses while refreshing.

## 4. Visual / analogy

```txt
Storage instruction sticker.
```

## 5. Minimal example

```txt
Cache-Control: private, no-store
```

## 6. Real-world example

Bank account API uses no-store; public image asset uses long max-age.

## 7. Common interview questions

1. What is Cache-Control?
2. Why does Cache-Control matter in backend systems?
3. How would you explain Cache-Control in an interview?
4. What bugs happen when Cache-Control is handled poorly?
5. How does Cache-Control affect frontend clients?
6. How would you test Cache-Control?

## 8. Active recall test

1. Explain Cache-Control without looking at notes.
2. Give one production bug related to Cache-Control.
3. Give one API or backend example where Cache-Control matters.
4. Explain how a frontend client should react to Cache-Control.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Cache-Control is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Cache-Control in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Cache-Control in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
