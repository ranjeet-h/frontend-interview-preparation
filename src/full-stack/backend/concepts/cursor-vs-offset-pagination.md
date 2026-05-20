# Cursor Pagination vs Offset Pagination

## Detailed explanation

Cursor pagination is better for large changing lists; offset pagination is simpler for small stable tables and page-number navigation.

## 1. One-line mental model

Offset asks for a position number; cursor asks to continue from an item.

## 2. Problem it solves

Choosing the wrong pagination style causes slow queries, duplicate rows, or poor UX.

## 3. Core idea

- Offset is simpler and supports page numbers.
- Cursor is faster for deep pagination when backed by indexes.
- Offset can drift when rows are inserted or deleted.
- Cursor is ideal for infinite scroll.
- Offset is acceptable for small admin lists.

## 4. Visual / analogy

```txt
Offset = page number. Cursor = bookmark.
```

## 5. Minimal example

```txt
/users?page=3&pageSize=20 vs /users?after=cursor&limit=20
```

## 6. Real-world example

Use offset for settings table; use cursor for social feed.

## 7. Common interview questions

1. What is Cursor Pagination vs Offset Pagination?
2. Why does Cursor Pagination vs Offset Pagination matter in backend systems?
3. How would you explain Cursor Pagination vs Offset Pagination in an interview?
4. What bugs happen when Cursor Pagination vs Offset Pagination is handled poorly?
5. How does Cursor Pagination vs Offset Pagination affect frontend clients?
6. How would you test Cursor Pagination vs Offset Pagination?

## 8. Active recall test

1. Explain Cursor Pagination vs Offset Pagination without looking at notes.
2. Give one production bug related to Cursor Pagination vs Offset Pagination.
3. Give one API or backend example where Cursor Pagination vs Offset Pagination matters.
4. Explain how a frontend client should react to Cursor Pagination vs Offset Pagination.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Cursor Pagination vs Offset Pagination is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Cursor Pagination vs Offset Pagination in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Cursor Pagination vs Offset Pagination in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
