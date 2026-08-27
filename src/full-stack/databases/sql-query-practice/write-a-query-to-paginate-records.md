# Write a Query to Paginate Records in SQL: Offset vs Keyset Pagination

## 1. What the Interviewer Is Really Testing

This looks like a syntax question — do you know `LIMIT` and `OFFSET`? It is not. Every junior can write `LIMIT 20 OFFSET 40`. The interviewer is listening for whether you have felt pagination break in production and know why.

What they actually score is whether you understand three tradeoffs that only show up at scale. First, `OFFSET` does not jump. It scans and throws away rows, so deep pages get slow in a straight line. Second, offset pages drift when someone inserts or deletes a row while the user clicks Next — you get duplicates or missing rows. Third, the fix is not just different syntax. It is a different index strategy: keyset pagination with `WHERE id > last_id ORDER BY id LIMIT N` that turns a scan into a seek. If you can explain when to use each one and what you give up with each choice, you sound senior. If you only recite offset, you sound like you have only paginated a hundred rows in dev.

## 2. Think Before You Code — The Senior Dev Thought Process

The first thing I notice is the sort key and the page-jump requirement. If the interviewer says "page 3, page size 20" and the UI has numbered buttons, my brain goes to offset because only offset lets you jump to any page number with math: `OFFSET = (page - 1) * page_size`. So `LIMIT 20 OFFSET 40` gets page 3. Simple, flexible.

Then I ask how big the table is. On a small table this is fine. On a table with millions of rows, offset falls apart. A B-Tree index is not an array with O(1) random access. To serve `OFFSET 100000 LIMIT 20` the engine must walk the index from the start, visit 100,020 entries, check visibility for each one, and discard the first 100,000. Page 1 takes 2ms, page 5000 takes hundreds of milliseconds and burns the buffer pool. It is a classic linear slowdown, and I have seen it take down an API that allowed `?page=10000` with no cap.

My next thought is data stability. Imagine a feed ordered newest first. A user loads page 1 (rows 1-20). While they read, five new posts land at the top. Now the old row 16 is at position 21. When the user asks for `OFFSET 20`, they get rows that include what they already saw, plus they miss nothing but see duplicates. Deletes cause the opposite — skipped rows. Any list that changes while you page will wobble under offset.

So I reach for the pattern that fixes both speed and stability: keyset pagination, also called seek or cursor pagination. Instead of saying "skip N rows," I say "give me rows after the last one I saw." With a unique, ordered column like `id` that becomes `WHERE id > :last_id ORDER BY id ASC LIMIT 20`. The database seeks directly to that id in the index and reads the next 20 leaf entries. Same cost on page 1 and page 1,000,000, and new inserts at the top do not shift the cursor because the filter is anchored to a value, not a position.

The catch I check next is uniqueness of the sort key. If we sort by `created_at`, that value is not unique — three rows can share the same timestamp. Then `WHERE created_at > :last_created_at` alone would skip siblings. I need a tiebreaker that makes the order deterministic, almost always the primary key: `WHERE (created_at, id) > (:last_created_at, :last_id)` or its expanded OR form, with `ORDER BY created_at, id`. And that order must match a composite index exactly or the seek becomes a sort.

Finally I decide which tool for which job. Infinite scroll, feeds, and high-scale APIs → keyset with `id` seek. Admin panels that truly need "jump to page 842" → offset, but with guardrails like a max page cap or a deferred join that pages inside the index first. The tradeoff is clear: offset buys random access and pays with speed and stability, keyset buys speed and stability and pays with no random jumps.

## 3. The Solution — Fully Explained Code

All queries below run on SQLite and on PostgreSQL/MySQL with the same syntax except where noted. Assume this tiny table for runnable examples:

```sql
-- Runnable setup: works in sqlite3 :memory: and PostgreSQL
CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL  -- ISO-8601 string; use TIMESTAMP in production
);

INSERT INTO items (id, name, created_at) VALUES
  (1, 'Item A', '2026-08-26 09:50:00'),
  (2, 'Item B', '2026-08-26 10:00:00'),
  (3, 'Item C', '2026-08-26 10:00:00'),
  (4, 'Item D', '2026-08-26 10:00:00'),
  (5, 'Item E', '2026-08-26 10:04:00'),
  (6, 'Item F', '2026-08-26 10:05:00');
```

Pattern A is classic offset. Easy to write, easy to jump anywhere, but it scans.

```sql
-- Pattern A: Offset pagination (baseline)
-- Good for small tables or internal tools with a hard page cap
SELECT id, name, created_at
FROM items
ORDER BY id ASC
LIMIT 20 OFFSET 40;  -- page 3 when page_size = 20: (3-1)*20 = 40

-- Same idea ordered by creation time, with deterministic tiebreaker
SELECT id, name, created_at
FROM items
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 100000;
-- Why ORDER BY includes id: without it, rows tied on created_at
-- can appear in any order and you get flicker between pages.
```

Pattern B is the production standard: seek by id. This is the one line interviewers want to see.

```sql
-- Pattern B: Keyset / seek pagination on a unique ordered column
-- Client sends the last id it saw; server seeks directly there
SELECT id, name, created_at
FROM items
WHERE id > :last_id       -- :last_id is the id of the last row on previous page
ORDER BY id ASC
LIMIT 20;

-- First page has no cursor, so no WHERE clause:
SELECT id, name, created_at
FROM items
ORDER BY id ASC
LIMIT 20;

-- Why this is fast: with an index on id (primary key already has one),
-- the engine does a B-Tree seek to :last_id and reads the next 20 leaf entries.
-- No rows are scanned and discarded.
```

Pattern B with a non-unique sort needs a composite seek. Ordering by time is common, but time alone is not unique.

```sql
-- Pattern B with composite key: created_at + id tiebreaker
-- Expanded boolean form: works everywhere (SQLite, Postgres, MySQL)
SELECT id, name, created_at
FROM items
WHERE (created_at > :last_created_at)
   OR (created_at = :last_created_at AND id > :last_id)
ORDER BY created_at ASC, id ASC
LIMIT 20;

-- Row-constructor shorthand: same logic, nicer to read
-- Works in PostgreSQL, MySQL 8+, SQLite
SELECT id, name, created_at
FROM items
WHERE (created_at, id) > (:last_created_at, :last_id)
ORDER BY created_at ASC, id ASC
LIMIT 20;

-- The index must match the ORDER BY direction exactly, or the engine must sort
CREATE INDEX idx_items_created_at_id ON items (created_at ASC, id ASC);
-- For DESC ordering, create (created_at DESC, id DESC) instead
```

Pattern C is the compromise when product insists on random page jumps on a big table. You still pay the offset scan, but you keep it inside a narrow index.

```sql
-- Pattern C: Deferred join for deep offsets when you must support ?page=N
-- The inner query scans only the index (id + sort keys), then joins the 20 full rows
SELECT items.id, items.name, items.created_at
FROM items
INNER JOIN (
  SELECT id
  FROM items
  ORDER BY created_at DESC, id DESC
  LIMIT 20 OFFSET 100000
) AS page_keys USING (id)
ORDER BY items.created_at DESC, items.id DESC;
-- Why it helps: naive OFFSET reads all columns (including wide TEXT/JSON) for 100,020 rows.
-- Deferred join reads only 8-byte ids for the first 100,000, then fetches 20 full rows.
```

Time complexity: offset pagination is O(offset + limit) — the engine must visit every row up to the offset, so page 5000 does ~100x the work of page 1. Keyset pagination is O(log M + limit) where M is table size — one B-Tree seek to the cursor plus a sequential read of limit rows, so page 1 and page 5000 cost the same.

Space complexity: offset can use O(offset + limit) sort buffer if no index covers the ORDER BY; keyset uses O(limit) — just the result rows — because the index delivers rows already sorted.

## 4. Dry Run — Walk Through a Real Example

Use the six rows we inserted, ordered by `id ASC`, page size 2. We will fetch two pages with keyset and contrast with offset under a concurrent insert.

Start with keyset. First page has no cursor:

```sql
SELECT id, name FROM items ORDER BY id ASC LIMIT 2;
```

Engine seeks to the start of the primary key index and reads leaf entries 1, 2. Returns `1: Item A`, `2: Item B`. Client remembers `:last_id = 2`.

Second page uses the cursor:

```sql
SELECT id, name FROM items WHERE id > 2 ORDER BY id ASC LIMIT 2;
```

Engine seeks to the index entry for 2, steps to the next leaf, reads 3 and 4. Returns `3: Item C`, `4: Item D`. Notice it never counted or skipped rows — it jumped straight to 2 and read forward.

Now the same walk with offset, and insert a new row between pages to see drift. Rewind: table has rows 1-6 sorted by `created_at DESC, id DESC` so newest first: 6, 5, 4, 3, 2, 1. Page size 2.

Page 1 with offset:

```sql
SELECT id FROM items ORDER BY created_at DESC, id DESC LIMIT 2 OFFSET 0;
-- Returns 6, 5. Client will ask for OFFSET 2 next.
```

Before the next request, two new rows arrive: id 7 and 8 at `10:10:00`, which now sit at the very top. New order is 8, 7, 6, 5, 4, 3, 2, 1.

Page 2 with offset:

```sql
SELECT id FROM items ORDER BY created_at DESC, id DESC LIMIT 2 OFFSET 2;
-- With new rows, OFFSET 2 means skip 8 and 7, then return 6, 5 again
-- User sees 6 and 5 twice. A delete would have caused skipped rows instead.
```

Page 2 with keyset avoids this entirely. Cursor from page 1 was `:last_created_at = 10:04:00` (for id 5) and `:last_id = 5`. Query:

```sql
SELECT id FROM items
WHERE (created_at < '2026-08-26 10:04:00')
   OR (created_at = '2026-08-26 10:04:00' AND id < 5)
ORDER BY created_at DESC, id DESC
LIMIT 2;
```

Evaluation row by row in index order 8, 7, 6, 5, 4, 3, 2, 1: 8 and 7 have `created_at 10:10:00` which is not `< 10:04:00`, skipped. 6 is also `10:05:00`, skipped. 5 is the cursor itself (`id 5` is not `< 5`), skipped. 4 has `10:00:00 < 10:04:00`, matched. 3 is next, matched. Returns 4, 3 — exactly the unseen rows, no duplicates, no skips, even though the table grew.

Now show the tie handling. Without a tiebreaker, `WHERE created_at < '10:00:00'` after seeing id 4 would have skipped ids 3 and 2 that share `10:00:00`. With the OR tiebreaker, both `10:00:00` siblings with `id < 4` are correctly included, as you saw above.

## 5. Edge Cases — The Ones That Break Naive Solutions

Page beyond the end of data. When the client asks for a cursor past the last row, or offset beyond the table size, the correct behavior is an empty result set, not an error. `SELECT ... WHERE id > 999999 LIMIT 20` returns zero rows. Your API should return `[]` with `hasNextPage: false`, not a 404. Same for `OFFSET 100000` on a 500-row table. Make sure the UI shows an empty state instead of crashing, and do not treat empty as a failure that retries forever.

Tie on the sort key. Sorting by `created_at`, `price`, or `status` without a unique tiebreaker loses rows. Three products share `created_at = 10:00:00`. After returning id 4, a naive `WHERE created_at < '10:00:00'` silently drops ids 3 and 2 at the same instant because they are not strictly less. Always add `id` as the final `ORDER BY` column and include it in the WHERE logic: `WHERE (created_at < :last) OR (created_at = :last AND id > :last_id)`. And create the composite index in the same order or the engine resorts in memory.

Large offset slowness. `OFFSET 100000` is not just slower — it holds locks longer, churns the shared buffer pool by pulling in thousands of pages you discard, and can push response times from 5ms to 500ms or seconds on wide rows with TEXT columns. On production Postgres or InnoDB, explain shows the same plan visiting `offset + limit` rows. The fix is either switch to keyset when the UX allows it, or enforce product guardrails: cap page numbers (e.g., deny `page > 1000`), rate-limit deep pages, or use a deferred join so the scan stays index-only. Never expose uncapped `?offset=999999` to the public API — it is an easy way to DOS your own database.

Nullable sort column. If you paginate by `completed_at` that can be NULL, `WHERE completed_at > :last` evaluates to UNKNOWN for NULL rows and they vanish from all pages. Different engines also sort NULLs differently. The safe choices are to keep the paginated column `NOT NULL`, or use `NULLS FIRST/LAST` explicitly and branch the cursor logic to handle the NULL case, coalescing with a sentinel if needed.

Bidirectional paging. Keyset is inherently forward-only. To go to the previous page you cannot just flip `<` to `>` and keep `ORDER BY DESC`, or you start from the wrong end of the index. Flip both the comparator and the order, fetch limit rows, then reverse in app code: `WHERE (created_at > :first) OR (created_at = :first AND id > :first_id) ORDER BY created_at ASC, id ASC LIMIT 20` and then reverse the array before rendering. Forgetting the reverse is why some apps show the previous page backward.

## 6. Variations and Follow-ups

Seek method with composite or mixed-direction sort. Interviewers love to add "sort by priority DESC, price ASC, id ASC." Row-constructor `(priority, price, id) > (...)` only works when every column sorts the same way, so here you must expand the boolean logic by hand and the index direction must mirror the ORDER BY direction exactly:

```sql
-- Sort: priority DESC, price ASC, id ASC
-- Cursor: last_priority, last_price, last_id from previous page
SELECT id, name, priority, price
FROM products
WHERE (priority < :last_priority)
   OR (priority = :last_priority AND price > :last_price)
   OR (priority = :last_priority AND price = :last_price AND id > :last_id)
ORDER BY priority DESC, price ASC, id ASC
LIMIT 20;

-- Index must match the directions: DESC, ASC, ASC
CREATE INDEX idx_products_pri_price_id ON products (priority DESC, price ASC, id ASC);
```

If the data types differ, keep the cursor types matching the columns (integer vs text) or the comparison will silently cast and may not use the index. Always use bound parameters, never string-interpolate `created_at` into the SQL.

Total count optimization — the other question every pagination interview asks next is "how do we show 'page 3 of 12,402'?" The naive answer is `SELECT COUNT(*) FROM items` on every request. On millions of rows that is a full index or table scan and competes with your pagination query. Three senior-level approaches: first, do not count at all — infinite scroll and cursor APIs return `hasNextPage` by fetching `LIMIT + 1` rows (ask for 21, return 20, if you got 21 there is a next page, pop the extra one and set `hasNextPage = true`). Second, if you must show a total, cache it or estimate it: use `EXPLAIN` row estimates, Postgres `reltuples`, or a materialized count refreshed periodically, and accept that the estimate may be stale under concurrent writes. Third, use a window count only when the result set is already filtered to something small: `SELECT ..., COUNT(*) OVER() AS total FROM items WHERE ... ORDER BY ... LIMIT 20` still scans to count the filtered set, so avoid it on unfiltered large tables. The tradeoff to articulate is accuracy versus latency: exact counts are expensive, estimates or hasNextPage are cheap and stable.

Opaque cursors for public APIs. Do not expose raw `WHERE id > 42` in the URL. Encode the cursor as an opaque Base64 token so clients cannot guess or tamper with sort internals and you can change the sort key later without breaking callers. Server decodes, validates, then binds:

```sql
-- Client sees: GET /items?limit=20&cursor=eyJjIjoiMjAyNi0wOC0yNiAxMDowNDowMCIsImkiOjV9
-- Server decodes to { last_created_at: '2026-08-26 10:04:00', last_id: 5 }
-- Then runs the seek query above with parameterized binds
```

To support page jumps while staying on keyset, keep a short cursor history in the client or session so Back and Forward can reuse cursors; you still cannot jump to page 842 without scanning, and that is the honest tradeoff to state out loud.

## 7. 🧠 The Memory Hook

OFFSET counts from the start and throws away what it counted. Keyset remembers where you stopped and seeks there. If the interviewer asks which scales, say: offset pays per page number, keyset pays per page size — one has a bill that grows with depth, the other never does.
