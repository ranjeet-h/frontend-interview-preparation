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

#### What is cursor-based pagination?
- **The Engine Mechanism (Why it behaves this way):** Cursor pagination returns records after or before a stable cursor value, typically an encoded combination of a sort key (like timestamp) and a unique identifier (like ID). Instead of skipping N records, the database queries `WHERE created_at < cursor_timestamp OR (created_at = cursor_timestamp AND id < cursor_id) ORDER BY created_at DESC, id DESC LIMIT 20`. The cursor is opaque to clients — usually a base64-encoded string — and represents the position of the last record in the previous page. The response includes a `nextCursor` (and optionally `prevCursor`) for navigating forward and backward.
- **The Unforgettable Mental Model:** Cursor pagination is like **a bookmark in a book**. Instead of saying "go to page 50," you say "continue from where this bookmark is."
- **The Trap:** Using only a timestamp as the cursor without a tiebreaker ID. If multiple records share the same timestamp, the cursor can't distinguish between them, causing duplicates or skipped records.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Cursor pagination uses a cursor value — typically an encoded timestamp plus ID — to continue from the last record seen. Instead of skipping N records like offset pagination, the database queries for records after the cursor position using a WHERE clause. The cursor is opaque to clients, usually base64-encoded. This approach is fast for deep pagination because it uses index lookups instead of scanning skipped rows. It's ideal for infinite scroll, feeds, and large changing datasets where offset pagination would be slow or inconsistent."

#### Why does cursor pagination matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** Cursor pagination solves two problems that offset pagination can't handle well. First, performance: offset pagination gets slower as the offset increases because the database must scan and skip more rows. Cursor pagination uses index lookups that are O(log n) regardless of depth. Second, consistency: when records are inserted or deleted between page requests, offset pagination shows duplicates or misses records. Cursor pagination is stable because it queries relative to a specific record position, not an absolute offset.
- **The Unforgettable Mental Model:** Cursor pagination is like **following a trail of breadcrumbs**. Each breadcrumb leads to the next, regardless of how many new breadcrumbs are added behind you.
- **The Trap:** Using cursor pagination when clients need page-number navigation. Cursors don't support "go to page 50" — they only support "next" and "previous." Choose the right pagination style for the use case.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Cursor pagination matters because it solves offset pagination's two biggest problems: performance and consistency. Offset gets slower for deep pages because the database scans skipped rows; cursor uses index lookups that are fast at any depth. Offset shows duplicates when data changes between requests; cursor is stable because it queries relative to a specific record. I use cursor pagination for infinite scroll, activity feeds, and large datasets. I use offset for admin tables where page numbers are needed."

#### What bugs happen when cursor pagination is handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor cursor pagination causes several issues. Using only a timestamp without an ID tiebreaker causes duplicates when multiple records share the same timestamp. Not encoding the cursor properly exposes internal data structure to clients. Forgetting to handle the case where the cursor points to a deleted record — the query returns nothing and the client is stuck. Not including both forward and backward cursors limits navigation to "next only." Using a non-indexed column as the cursor sort key causes full table scans instead of index lookups.
- **The Unforgettable Mental Model:** Poor cursor pagination is like **a bookmark that only says the chapter name**. If multiple pages are in the same chapter, you don't know exactly where to resume.
- **The Trap:** Returning the raw timestamp as the cursor instead of encoding it. This exposes internal data structure and makes it easy for clients to manipulate the cursor in unexpected ways.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor cursor pagination causes duplicates from timestamp-only cursors without ID tiebreakers, stuck clients when cursors point to deleted records, and slow queries from non-indexed sort columns. The most common bug is using only a timestamp as the cursor — if multiple records share the same timestamp, the query can't distinguish between them. I always use a compound cursor (timestamp + ID), encode it opaquely, handle deleted-record cursors gracefully, and ensure the sort columns are indexed."

#### How does cursor pagination affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients use cursor pagination differently from offset. Instead of page numbers, the client stores the `nextCursor` from each response and sends it with the next request. For infinite scroll, the client appends new records to the list and updates the cursor. The client cannot jump to a specific page — it can only navigate forward and backward. The frontend must handle the "end of data" case when no `nextCursor` is returned. Some implementations also provide `prevCursor` for backward navigation.
- **The Unforgettable Mental Model:** The frontend is like a **film reel** — it plays forward frame by frame, and can rewind, but can't jump to frame 500 without counting from the start.
- **The Trap:** Trying to implement page numbers with cursor pagination. Cursors don't support random access — they only support sequential navigation. If the UI needs page numbers, use offset pagination.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: With cursor pagination, the frontend stores the nextCursor from each response and sends it with the next request. For infinite scroll, new records are appended to the list and the cursor is updated. The client can't jump to a specific page — it only navigates forward and backward. The frontend handles the end-of-data case when no nextCursor is returned. If the UI needs page numbers, I use offset pagination instead. Cursor pagination is best for infinite scroll where sequential navigation is the expected behavior."

#### How would you test cursor pagination?
- **The Engine Mechanism (Why it behaves this way):** Testing cursor pagination involves verifying correct navigation across edge cases. Test the first page returns records without a cursor. Test the second page uses the nextCursor and returns the correct subsequent records. Test that records don't overlap between pages. Test with records inserted between page requests — new records should not cause duplicates. Test with records deleted between requests — the cursor should gracefully handle missing records. Test the end-of-data case where no nextCursor is returned. Test that the cursor is opaque and cannot be manipulated to access unauthorized data.
- **The Unforgettable Mental Model:** Testing cursor pagination is like **testing a treasure hunt**. Each clue (cursor) leads to the next location. Test that the clues work even if new landmarks are added or old ones removed.
- **The Trap:** Only testing sequential page requests without simulating data changes between requests. The real value of cursor pagination is handling changing data — test that scenario.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test cursor pagination by verifying the first page returns records without a cursor, subsequent pages use the nextCursor correctly, and records don't overlap. I test with data changes between requests — inserting new records shouldn't cause duplicates, and deleting records shouldn't break navigation. I test the end-of-data case where no nextCursor is returned. I also verify the cursor is opaque and can't be manipulated. The key test is simulating real-world data changes between page requests to ensure consistency."

## 8. Active recall test

1. **Explain cursor-based pagination without looking at notes.**
   - **Explanation:** Cursor pagination uses an opaque cursor value (typically encoded timestamp + ID) to continue from the last record seen. The database queries WHERE sort_key < cursor_value with an index lookup, making it fast at any depth. It's stable when data changes and ideal for infinite scroll, but doesn't support page-number navigation.

2. **Give one production bug related to cursor pagination.**
   - **Explanation:** Using only a timestamp as the cursor without an ID tiebreaker causes duplicate records when multiple entries share the same timestamp. The WHERE clause can't distinguish between them, so the same records appear on consecutive pages.

3. **Give one API example where cursor pagination matters.**
   - **Explanation:** An activity feed: `GET /feed?limit=20&after=eyJjcmVhdGVkQXQiOiIyMDI2...` returns the next 20 events after the cursor position. New events added while the user scrolls don't cause duplicates because the cursor anchors to a specific record.

4. **Explain how a frontend client should handle cursor pagination.**
   - **Explanation:** The frontend stores the nextCursor from each response and sends it with the next request. For infinite scroll, it appends new records and updates the cursor. It handles end-of-data when no nextCursor is returned. It cannot jump to specific pages — only sequential navigation is supported.

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
