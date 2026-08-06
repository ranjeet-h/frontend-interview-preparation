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

#### What is offset-based pagination?
- **The Engine Mechanism (Why it behaves this way):** Offset pagination uses `LIMIT` and `OFFSET` (or `page` and `pageSize`) to return a slice of ordered records from a dataset. The database skips the first N records (offset) and returns the next M records (limit). SQL translates `page=3&pageSize=20` to `OFFSET 40 LIMIT 20`. The backend calculates offset as `(page - 1) * pageSize`. The response typically includes the data array, total count, current page, and total pages. This approach is simple to implement and supports page-number navigation in UIs.
- **The Unforgettable Mental Model:** Offset pagination is like **reading a book by page number**. Page 5 means you skip the first 4 pages and read from page 5 onward.
- **The Trap:** Assuming offset pagination scales well. For deep pages (page 10,000), the database must scan and skip 199,980 records before returning 20 — this gets progressively slower.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Offset pagination uses LIMIT and OFFSET to return a slice of ordered records. The client sends a page number and page size, and the backend calculates the offset as (page - 1) * pageSize. The database skips that many records and returns the next batch. It's simple to implement and supports page-number navigation. However, it becomes slow for deep pages because the database must scan and skip all preceding records. It's best for small datasets or admin interfaces where users don't page deeply."

#### Why does offset pagination matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** Without pagination, APIs return all records in a single response, which is slow, memory-intensive, and unstable for large datasets. Pagination limits the response size, reduces database load, and provides a predictable API contract. Offset pagination specifically matters because it's the simplest pagination approach — it maps directly to SQL's LIMIT/OFFSET, requires no special indexing beyond the sort column, and is universally understood by frontend developers. It's the default choice for small datasets and admin interfaces.
- **The Unforgettable Mental Model:** Pagination is like **serving food in portions** instead of dumping the entire buffet on one plate. Offset is the simplest portioning method — just count and skip.
- **The Trap:** Using offset pagination for large, frequently changing datasets like social feeds. The performance degrades with depth, and records can shift between pages when data changes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Offset pagination matters because it's the simplest way to limit API response sizes. It maps directly to SQL LIMIT/OFFSET, requires minimal implementation, and supports page-number navigation that users understand. It works well for small datasets, admin tables, and search results where users don't page deeply. But it has known limitations — performance degrades for deep pages, and records can shift when data changes between requests. I use it for admin interfaces and switch to cursor pagination for large or changing datasets."

#### What bugs happen when offset pagination is handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor offset pagination causes several issues. Missing stable sort order leads to inconsistent results — the same page request returns different records because the database's default sort is non-deterministic. Deep pagination (page 10,000) causes slow queries as the database scans thousands of skipped rows. Duplicate or missing records occur when data is inserted or deleted between page requests — a new record at position 5 pushes all subsequent records down, so page 2 shows a record from page 1. Returning total count with every page requires an expensive COUNT query that slows responses.
- **The Unforgettable Mental Model:** Poor offset pagination is like **counting people in a moving crowd**. If people join or leave while you're counting, your count is wrong, and skipping to position 50 lands on a different person each time.
- **The Trap:** Not adding a stable sort order. `SELECT * FROM users LIMIT 20 OFFSET 40` without ORDER BY returns different results each time because the database's default order is undefined.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor offset pagination causes duplicate or missing records when data changes between page requests, slow queries for deep pages, and inconsistent results without stable sort order. The most common bug is forgetting ORDER BY — without it, the database returns records in an undefined order, so the same page request gives different results. Another bug is running a COUNT(*) query on every page request, which scans the entire table and slows responses. I always add a stable sort, cap the maximum offset, and consider caching the total count."

#### How does offset pagination affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients use offset pagination data to render page numbers, "next" and "previous" buttons, and total record counts. The response includes `page`, `pageSize`, `totalCount`, and `totalPages`, which the frontend uses to build pagination UI. The client calculates which page to request next based on user interaction. For infinite scroll, the client increments the page number on each scroll event. The frontend must handle edge cases like requesting a page beyond the total or receiving an empty page.
- **The Unforgettable Mental Model:** The frontend is like a **book reader with page numbers**. It knows the total pages, shows the current page, and lets the user jump to any page.
- **The Trap:** Assuming totalCount is always accurate. If records are deleted between requests, the total pages may decrease, and the last page request may return empty.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend uses offset pagination data to render page numbers, navigation buttons, and total counts. The response includes page, pageSize, totalCount, and totalPages, which drive the pagination UI. For infinite scroll, the client increments the page number on each scroll. The frontend must handle edge cases — requesting a page beyond the total returns empty data, and the totalCount may change if records are added or deleted between requests. I design the frontend to gracefully handle empty pages and changing totals."

#### How would you test offset pagination?
- **The Engine Mechanism (Why it behaves this way):** Testing offset pagination involves verifying correct slicing behavior across edge cases. Test page 1 returns the first N records, page 2 returns the next N, and the last page returns the remainder. Test that records don't overlap between pages. Test with an empty dataset (page 1 returns empty array). Test with fewer records than pageSize (page 1 returns all records, page 2 returns empty). Test stable sort order by inserting records between page requests and verifying consistent ordering. Test performance with large offsets to identify slow queries.
- **The Unforgettable Mental Model:** Testing pagination is like **testing a deck of cards dealt in hands**. Deal 5 cards (page 1), then 5 more (page 2) — no duplicates, no gaps, and the order is consistent.
- **The Trap:** Only testing the happy path with a full dataset. Edge cases — empty datasets, partial pages, deep offsets — are where pagination bugs hide.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test offset pagination across multiple scenarios. Page 1 returns the first N records with correct sort order. Page 2 returns the next N with no overlap. The last page returns the remainder. Empty datasets return empty arrays. Datasets smaller than pageSize return all records on page 1. I also test stable sort by inserting records between page requests and verifying consistent ordering. For performance, I test with large offsets to identify slow queries and ensure the maximum offset cap works."

## 8. Active recall test

1. **Explain offset-based pagination without looking at notes.**
   - **Explanation:** Offset pagination uses LIMIT and OFFSET (or page and pageSize) to return a slice of ordered records. The database skips (page-1)*pageSize records and returns the next pageSize records. It's simple, supports page-number navigation, but degrades for deep pages and can show duplicates when data changes.

2. **Give one production bug related to offset pagination.**
   - **Explanation:** Without a stable ORDER BY clause, the same page request returns different records because the database's default sort is non-deterministic. Users see different data each time they refresh page 2 of a list.

3. **Give one API example where offset pagination matters.**
   - **Explanation:** An admin user table with 2,000 users: `GET /admin/users?page=3&pageSize=20` returns users 41-60. The response includes totalCount: 2000 and totalPages: 100 for the pagination UI.

4. **Explain how a frontend client should handle offset pagination.**
   - **Explanation:** The frontend renders page numbers and navigation buttons using page, pageSize, totalCount, and totalPages from the response. It handles edge cases like empty pages (show "no results") and changing totals (update page count dynamically). For infinite scroll, it increments the page number on each scroll event.

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
