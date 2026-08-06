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

#### When should you use cursor pagination vs offset pagination?
- **The Engine Mechanism (Why it behaves this way):** The choice depends on the dataset size, change frequency, and UI requirements. Offset pagination is simpler to implement, supports page-number navigation, and works well for small, stable datasets like admin tables. Cursor pagination is faster for deep pages (uses index lookups instead of scanning skipped rows), stable when data changes between requests, and ideal for infinite scroll and large changing datasets like social feeds. The backend implements offset with SQL LIMIT/OFFSET and cursor with WHERE clause + index. The decision is architectural — it affects the API contract, database queries, and frontend UI pattern.
- **The Unforgettable Mental Model:** Offset = **page numbers in a book** (good for jumping around). Cursor = **a bookmark** (good for reading sequentially).
- **The Trap:** Defaulting to offset pagination for everything because it's simpler. For large datasets or feeds, offset's performance degradation and inconsistency become production issues.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I choose offset pagination for small, stable datasets where users need page-number navigation — admin tables, search results, settings pages. I choose cursor pagination for large or frequently changing datasets where users scroll sequentially — activity feeds, notification lists, message threads. Offset is simpler but degrades for deep pages and shows duplicates when data changes. Cursor is faster and stable but doesn't support page numbers. The choice is driven by the UI pattern and dataset characteristics."

#### Why does the pagination choice matter for backend systems?
- **The Engine Mechanism (Why it behaves this way):** The pagination choice directly impacts database query performance, API response consistency, and frontend UX. Offset pagination with large offsets causes full table scans that slow down the database and increase response times. Cursor pagination with proper indexes uses O(log n) lookups that stay fast regardless of depth. When data changes frequently, offset pagination returns inconsistent results (duplicates, missing records), while cursor pagination remains stable. The wrong choice leads to slow APIs, confused users, and database performance issues that are hard to fix after the API contract is established.
- **The Unforgettable Mental Model:** Pagination choice is like **choosing between an elevator and stairs**. For a few floors (small datasets), either works. For 50 floors (large datasets), the elevator (cursor) is the only practical choice.
- **The Trap:** Choosing pagination based on what's easiest to implement rather than what fits the use case. The API contract is hard to change once clients depend on it.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The pagination choice matters because it directly impacts database performance, response consistency, and user experience. Offset pagination degrades for deep pages and shows duplicates when data changes. Cursor pagination stays fast with indexes and remains stable during data changes. The wrong choice leads to slow APIs and confused users. Since the pagination style is part of the API contract, it's hard to change once clients depend on it. I choose based on dataset size, change frequency, and whether the UI needs page numbers or infinite scroll."

#### What bugs happen when the wrong pagination style is chosen?
- **The Engine Mechanism (Why it behaves this way):** Using offset for a social feed causes slow queries as users scroll deeper (page 100 requires scanning 2,000 rows), and duplicate posts appear when new posts are inserted between page requests. Using cursor for an admin table frustrates users who expect page numbers and can't jump to a specific page. Using offset for a notification list shows the same notification multiple times as new notifications arrive. Using cursor for a search results page prevents users from bookmarking or sharing a specific page number.
- **The Unforgettable Mental Model:** Wrong pagination is like **using a magnifying glass to read a billboard** — technically possible but completely impractical for the use case.
- **The Trap:** Not considering data change frequency. A dataset that's small and stable today may become large and dynamic tomorrow. Design for the expected future state.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Using offset for a social feed causes slow queries on deep pages and duplicate posts when new content arrives. Using cursor for an admin table frustrates users who need page numbers. The most common bug is choosing offset for a feed that grows over time — it works fine at launch but degrades as the dataset grows. I design for the expected future state: if a dataset will grow beyond a few thousand records or change frequently, I use cursor pagination from the start."

#### How does the pagination choice affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Offset pagination gives the frontend page numbers, total count, and total pages — enabling numbered pagination UI, "jump to page" functionality, and progress indicators. Cursor pagination gives the frontend next/previous cursors — enabling infinite scroll, "load more" buttons, and sequential navigation but no page jumping. The frontend's pagination component must match the API's pagination style. Mixing them (cursor API with page-number UI) requires the frontend to simulate page numbers, which is unreliable.
- **The Unforgettable Mental Model:** Offset = **numbered chapters** (jump anywhere). Cursor = **continuous scroll** (keep reading).
- **The Trap:** Building a page-number UI on top of a cursor API. The frontend would need to fetch all pages sequentially to calculate page numbers, which defeats the purpose of pagination.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Offset pagination enables page-number UI with total counts and jump-to-page functionality. Cursor pagination enables infinite scroll and load-more buttons but no page jumping. The frontend's pagination component must match the API's style. I don't mix them — building page numbers on a cursor API requires fetching all pages sequentially, which defeats pagination. I choose the pagination style based on the UI pattern the product needs, then implement the API accordingly."

#### How would you test pagination style decisions?
- **The Engine Mechanism (Why it behaves this way):** Testing pagination decisions involves performance benchmarks and consistency tests. For offset, test query performance at increasing offsets (page 1, 10, 100, 1000) and measure response time growth. For cursor, test query performance at increasing depths and verify response time stays constant. Test consistency by inserting and deleting records between page requests — offset should show duplicates/misses, cursor should remain stable. Test the UI pattern — page numbers work with offset, infinite scroll works with cursor. Load test both approaches with realistic dataset sizes.
- **The Unforgettable Mental Model:** Testing pagination is like **stress-testing two bridge designs**. One works for light traffic (offset for small datasets), the other handles heavy traffic (cursor for large datasets). Test both under load.
- **The Trap:** Only testing with small datasets. Pagination bugs appear at scale — test with the expected production dataset size.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test pagination decisions with performance benchmarks and consistency tests. For offset, I measure query time at increasing offsets to identify the degradation point. For cursor, I verify response time stays constant at any depth. I test consistency by inserting and deleting records between page requests — offset shows duplicates, cursor stays stable. I load test with realistic dataset sizes. The key is testing at the expected production scale, not just with small test datasets where both approaches perform fine."

## 8. Active recall test

1. **Explain cursor vs offset pagination without looking at notes.**
   - **Explanation:** Offset uses page numbers and LIMIT/OFFSET — simple, supports page navigation, but slow for deep pages and inconsistent when data changes. Cursor uses opaque cursors and WHERE clause lookups — fast at any depth, stable with changing data, but only supports sequential navigation. Choose offset for admin tables, cursor for feeds.

2. **Give one production bug from choosing the wrong pagination style.**
   - **Explanation:** Using offset pagination for a social feed causes page 100 to take 5 seconds because the database scans 2,000 rows. As the feed grows, response times increase linearly, eventually timing out and causing frontend errors.

3. **Give one API example where the choice matters.**
   - **Explanation:** A notification list: offset shows duplicate notifications when new ones arrive between page requests. Cursor anchors to the last seen notification, so new notifications appear at the top without duplicating existing ones.

4. **Explain how the frontend adapts to each pagination style.**
   - **Explanation:** Offset: frontend renders page numbers, total count, and jump-to-page buttons. Cursor: frontend implements infinite scroll or load-more buttons, stores the nextCursor, and appends new records sequentially. The UI pattern must match the API's pagination style.

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
