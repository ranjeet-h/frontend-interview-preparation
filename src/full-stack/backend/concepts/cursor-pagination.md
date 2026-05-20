# Cursor-Based Pagination

## Detailed explanation

Cursor pagination returns records after or before a stable cursor, usually based on an indexed sort key like timestamp plus id.

## 1. One-line mental model

Continue from the last item you saw.

## 2. Problem it solves

Offset pagination breaks down for large or changing feeds because deep skips are slow and records can move between pages.

## 3. Core idea

- Cursor should be opaque to clients.
- Sort order must be stable and indexed.
- Use compound cursor fields when ties are possible.
- Works well for infinite scroll and feeds.
- Harder to jump to arbitrary page number.

## 4. Visual / analogy

```txt
Bookmark in a long list.
```

## 5. Minimal example

```txt
GET /orders?limit=20&after=eyJjcmVhdGVkQXQiOiIyMDI2...
```

## 6. Real-world example

Activity feed loads next page after the last visible event id.

## 7. Common interview questions

1. What is Cursor-Based Pagination?
2. Why does Cursor-Based Pagination matter in backend systems?
3. How would you explain Cursor-Based Pagination in an interview?
4. What bugs happen when Cursor-Based Pagination is handled poorly?
5. How does Cursor-Based Pagination affect frontend clients?
6. How would you test Cursor-Based Pagination?

## 8. Active recall test

1. Explain Cursor-Based Pagination without looking at notes.
2. Give one production bug related to Cursor-Based Pagination.
3. Give one API or backend example where Cursor-Based Pagination matters.
4. Explain how a frontend client should react to Cursor-Based Pagination.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Cursor-Based Pagination is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Cursor-Based Pagination in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Cursor-Based Pagination in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
