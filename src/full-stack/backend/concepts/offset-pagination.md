# Offset-Based Pagination

## Detailed explanation

Offset pagination uses `limit` and `offset` or `page` and `pageSize` to return a slice of ordered records.

## 1. One-line mental model

Skip N records, then return the next page.

## 2. Problem it solves

APIs need pagination because returning all records is slow, expensive, and unstable for large datasets.

## 3. Core idea

- Simple to implement with SQL `LIMIT` and `OFFSET`.
- Works well for small or admin datasets.
- Can become slow for deep pages.
- Can show duplicates or miss records when data changes while paging.
- Needs stable sorting for predictable results.

## 4. Visual / analogy

```txt
Book pages: page 5 means skip previous pages.
```

## 5. Minimal example

```txt
SELECT * FROM orders ORDER BY created_at DESC LIMIT 20 OFFSET 40;
```

## 6. Real-world example

Admin table with 2,000 users can use page-based pagination.

## 7. Common interview questions

1. What is Offset-Based Pagination?
2. Why does Offset-Based Pagination matter in backend systems?
3. How would you explain Offset-Based Pagination in an interview?
4. What bugs happen when Offset-Based Pagination is handled poorly?
5. How does Offset-Based Pagination affect frontend clients?
6. How would you test Offset-Based Pagination?

## 8. Active recall test

1. Explain Offset-Based Pagination without looking at notes.
2. Give one production bug related to Offset-Based Pagination.
3. Give one API or backend example where Offset-Based Pagination matters.
4. Explain how a frontend client should react to Offset-Based Pagination.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Offset-Based Pagination is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Offset-Based Pagination in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Offset-Based Pagination in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
