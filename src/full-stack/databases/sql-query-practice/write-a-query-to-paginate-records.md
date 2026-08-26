# Write a Query to Paginate Records in SQL: Offset vs Keyset Pagination

## 1. What the Interviewer Is Really Testing

On the surface, this question asks for basic SQL syntax using `LIMIT` and `OFFSET`. In reality, the interviewer is evaluating whether you understand how relational database storage engines, B-Tree indexes, and disk I/O operate when datasets scale to millions of rows.

A senior engineer is evaluated on four specific insights:

1. **The $O(N)$ Performance Cliff of `OFFSET`:** Do you understand that `OFFSET 100000 LIMIT 20` does not jump directly to row 100,000? The database must scan, sort, and process 100,020 rows through the query engine, only to discard 100,000 of them before returning 20.
2. **Data Drift and Phantom Reads Under Concurrent Writes:** In production systems with active write traffic, offset pagination causes user-visible data anomalies. When new records are inserted while a user navigates between pages, rows shift downward, causing the user to see duplicate records on subsequent pages or miss records entirely.
3. **Keyset / Cursor-Based Pagination ($O(1)$ Seek):** Can you implement an index-backed pagination query using a deterministic cursor and tiebreaker columns that converts a slow sequential scan into an instant index seek?
4. **Deferred Joins for Deep Offsets:** When user interface constraints strictly demand jumping to arbitrary page numbers (e.g., an internal admin portal requiring "Jump to Page 5,000"), do you know how to minimize row lookups by paging over primary key indexes first before joining back to wide table rows?

## 2. Think Before You Code — The Senior Dev Thought Process

When an interviewer asks how to paginate a table with millions of records, here is the structured thought process of a senior database engineer:

The first impulse is classic offset pagination: `SELECT * FROM items ORDER BY created_at DESC LIMIT 20 OFFSET 40;`. It is intuitive, maps directly to page numbers in a UI (`page 3` with `page_size = 20` means `OFFSET 40`), and allows clients to jump to any arbitrary page.

However, I immediately consider the storage engine mechanics. An index is a balanced tree (B-Tree) of ordered keys, not a flat contiguous array in memory where row 100,000 resides at a pre-calculated byte offset. To fulfill `OFFSET 100000 LIMIT 20`, the database engine must traverse the B-Tree root to leaf, step through 100,020 index entries or table pages, verify visibility under MVCC (Multi-Version Concurrency Control), and throw 100,000 rows into the garbage. As the user navigates deeper, page load times degrade linearly from 2ms on page 1 to 5,000ms on page 5,000, while blowing out database buffer pool caches.

The second critical issue is data stability. If a user is viewing page 1 (rows 1 to 20) and five new records are inserted at the top of the table, requesting page 2 with `OFFSET 20` will fetch rows that were previously at positions 16 through 20. The user sees duplicate items. If records are deleted, rows get skipped without the user ever seeing them.

To achieve constant $O(1)$ time complexity and rock-solid consistency, I switch to **Keyset Pagination** (also known as Cursor Pagination). Instead of instructing the database *how many rows to skip*, I instruct it *where we left off* by passing the last observed record's sort values as a filter: `WHERE created_at < :last_created_at LIMIT 20`.

Next, I identify the uniqueness trap: timestamps are rarely unique in high-throughput tables. If three items share the exact same `created_at` timestamp, a naive `WHERE created_at < :last_created_at` will skip sibling rows created at that identical millisecond. Therefore, every keyset query must include a deterministic unique tiebreaker column—almost always the primary key `id`.

Finally, if product requirements strictly mandate jumping to random page numbers (where keyset cannot be used because intermediate cursors are unknown), I reach for a **Deferred Join** optimization. This allows the database to perform the expensive offset scan purely inside a compact covering index, loading heavy table rows and unindexed columns only for the final 20 matched IDs.

## 3. The Solution — Fully Explained Code

**Pattern 1: Classic Offset Pagination (Baseline)**

Used for small datasets or low-traffic administrative tools where arbitrary page jumping is mandatory.

```sql
-- Offset Pagination: Simple, but scales as O(N)
SELECT id, name, created_at
FROM items
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 100000;
```

Complexity & Performance Profile:
- **Time Complexity:** $O(N + K)$ where $N$ is the offset depth (100,000) and $K$ is the page limit (20). The database must scan $N + K$ rows.
- **Space / Memory Complexity:** $O(N + K)$ working memory in `work_mem` / sort buffers if an index cannot satisfy the sort order.
- **I/O Cost:** High disk page reads and high buffer cache churn.

---

**Pattern 2: Keyset / Cursor Pagination (Production Standard)**

Used for feeds, infinite scrolling, high-scale APIs, and large public datasets. Requires the client to pass the `(created_at, id)` of the last item received on the previous page.

```sql
-- Method A: Expanded Boolean Logic (Universal across PostgreSQL, MySQL, SQLite, SQL Server)
SELECT id, name, created_at
FROM items
WHERE (created_at < :last_created_at)
   OR (created_at = :last_created_at AND id < :last_id)
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- Method B: Row Constructor / Tuple Comparison Syntax (PostgreSQL, MySQL 8.0+, SQLite)
SELECT id, name, created_at
FROM items
WHERE (created_at, id) < (:last_created_at, :last_id)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

The Essential Supporting Index:

Keyset pagination requires a composite B-Tree index whose column order and sort direction match the `ORDER BY` clause exactly:

```sql
-- Composite index enabling direct B-Tree index seek
CREATE INDEX idx_items_created_at_id ON items (created_at DESC, id DESC);
```

Complexity & Performance Profile:
- **Time Complexity:** $O(\log M + K)$ where $M$ is total table row count and $K$ is page limit (20). The B-Tree search takes $\log M$ to find the cursor position, then sequentially reads exactly 20 adjacent index leaf entries.
- **Space / Memory Complexity:** $O(K)$ working memory to hold the 20 returned records.
- **I/O Cost:** Negligible. Accesses only the few index and table leaf pages holding the target 20 rows. Page 1,000,000 executes in the exact same millisecond timeframe as Page 1.

---

**Pattern 3: Deferred Join Optimization for Deep Offsets**

When you cannot use keyset pagination because users must jump directly to arbitrary page numbers (e.g., page 5,000 in a back-office tool), use a deferred join. The subquery performs the offset scan using an index-only scan (fast and compact in memory), deferring the expensive full row lookup until after the offset is applied.

```sql
-- Deferred Join: Offsets inside index-only scan, joins only the target 20 rows
SELECT items.id, items.name, items.created_at, items.description, items.payload
FROM items
INNER JOIN (
    -- Subquery scans ONLY the lightweight composite index
    SELECT id
    FROM items
    ORDER BY created_at DESC, id DESC
    LIMIT 20 OFFSET 100000
) AS page_keys ON items.id = page_keys.id
ORDER BY items.created_at DESC, items.id DESC;
```

Complexity & Performance Profile:
- **Time Complexity:** $O(N)$ index-only scan + $O(K)$ primary key seeks on the base table.
- **Why it is faster than naive offset:** Naive offset reads all table columns (including wide `TEXT` or `JSONB` fields) for all 100,020 rows from disk into memory. The deferred join reads only 8-byte integers inside RAM cache for the first 100,000 rows, performing disk lookups for only the 20 rows that will actually be returned.

## 4. Dry Run — Walk Through a Real Example

Let us trace how keyset pagination guarantees data correctness across multiple pages, even when identical timestamps and concurrent writes occur.

Consider the following `items` table ordered by `created_at DESC, id DESC`:

| `id` | `name` | `created_at` | Notes |
| :--- | :--- | :--- | :--- |
| **6** | Item F | `2026-08-26 10:05:00` | Newest item |
| **5** | Item E | `2026-08-26 10:04:00` | |
| **4** | Item D | `2026-08-26 10:00:00` | *Identical timestamp tie* |
| **3** | Item C | `2026-08-26 10:00:00` | *Identical timestamp tie* |
| **2** | Item B | `2026-08-26 10:00:00` | *Identical timestamp tie* |
| **1** | Item A | `2026-08-26 09:50:00` | Oldest item |

We configure a page size of 3 (`LIMIT 3`).

**Step 1: Requesting Page 1 (Initial Request)**

The client sends a request without a cursor:

```sql
SELECT id, name, created_at
FROM items
ORDER BY created_at DESC, id DESC
LIMIT 3;
```

Result Returned to Client:
1. `id = 6` (`10:05:00`)
2. `id = 5` (`10:04:00`)
3. `id = 4` (`10:00:00`)

The client receives these 3 records and extracts the cursor values from the last item: `:last_created_at = '2026-08-26 10:00:00'`, `:last_id = 4`.

**Step 2: Requesting Page 2 (Resolving Timestamp Ties)**

The client passes `:last_created_at = '2026-08-26 10:00:00'` and `:last_id = 4` to fetch the next 3 records:

```sql
SELECT id, name, created_at
FROM items
WHERE (created_at < '2026-08-26 10:00:00')
   OR (created_at = '2026-08-26 10:00:00' AND id < 4)
ORDER BY created_at DESC, id DESC
LIMIT 3;
```

Evaluation Step-by-Step:
- `id = 6`: `created_at` is `10:05:00` (Not `< 10:00:00`, not `= 10:00:00`). Skipped.
- `id = 5`: `created_at` is `10:04:00` (Not `< 10:00:00`, not `= 10:00:00`). Skipped.
- `id = 4`: `created_at = 10:00:00`, but `id = 4` is not `< 4`. Skipped.
- `id = 3`: `created_at = 10:00:00` and `id = 3 < 4`. Matched (Row 1).
- `id = 2`: `created_at = 10:00:00` and `id = 2 < 4`. Matched (Row 2).
- `id = 1`: `created_at = 09:50:00 < 10:00:00`. Matched (Row 3).

Result Returned to Client:
1. `id = 3` (`10:00:00`)
2. `id = 2` (`10:00:00`)
3. `id = 1` (`09:50:00`)

Every single row with timestamp `10:00:00` was processed without duplicates or omissions.

**Step 3: Demonstrating Immunity to Concurrent Writes**

Suppose while the user was reading Page 1, two new items (`id = 7` and `id = 8`) were inserted at `10:10:00`.

- **Under Offset Pagination (`OFFSET 3 LIMIT 3`):** The entire table shifted down by 2. Offset 3 would now land on `id = 5`, `id = 4`, `id = 3`. The user would see items 5 and 4 for a second time.
- **Under Keyset Pagination:** The query evaluates against the immutable cursor `:last_created_at = '10:00:00', :last_id = 4`. The newly inserted items have timestamps of `10:10:00`, which fail the filter. Page 2 correctly returns `id = 3`, `id = 2`, `id = 1` with zero duplication.

## 5. Edge Cases — The Ones That Break Naive Solutions

**1. Non-Unique Sort Columns Without a Tiebreaker**

If a table is ordered by a non-unique column (like `created_at`, `status`, or `price`) and you only filter by that column (`WHERE created_at < :last_created_at`), any items sharing the exact same value as the page boundary item are permanently skipped and lost from the user's view.

Always append a guaranteed unique column (such as the primary key `id` or UUIDv7) as the final tiebreaker in both the `WHERE` condition and the `ORDER BY` clause.

**2. Nullable Sort Columns**

If you paginate by a column that contains `NULL` values (e.g., `completed_at`), standard SQL comparison operators (`<`, `>`, `=`) evaluate to `UNKNOWN` (which acts as `FALSE`), causing all rows with `NULL` to be completely excluded from the result set.

Furthermore, SQL engines treat `NULL` sorting differently by default:
- PostgreSQL places `NULL` values first when sorting `DESC`.
- MySQL treats `NULL` values as smaller than any non-null value, placing them last when sorting `DESC`.

Ensure sort columns are `NOT NULL`, or explicitly handle null ordering using `NULLS LAST` / `NULLS FIRST` with coalesced cursor logic:

```sql
-- Explicitly controlling NULL sorting in PostgreSQL
SELECT id, completed_at
FROM tasks
WHERE (completed_at < :last_completed_at)
   OR (:last_completed_at IS NULL AND completed_at IS NOT NULL)
   OR (completed_at = :last_completed_at AND id < :last_id)
ORDER BY completed_at DESC NULLS LAST, id DESC
LIMIT 20;
```

**3. Bidirectional Navigation (Previous Page Navigation)**

In keyset pagination, clicking "Next" requests items smaller than the cursor (`<`). Clicking "Previous" requires requesting items larger than the cursor (`>`).

If you simply reverse the `WHERE` operator to `>` while keeping `ORDER BY created_at DESC`, the database starts from the top of the entire table rather than the adjacent preceding 20 items.

To fetch the previous page, invert both the comparison operator AND the `ORDER BY` direction, then reverse the final array of 20 items in your application code before sending it to the client:

```sql
-- Fetching the PREVIOUS page (items immediately preceding the current page)
SELECT id, name, created_at
FROM items
WHERE (created_at > :first_created_at)
   OR (created_at = :first_created_at AND id > :first_id)
ORDER BY created_at ASC, id ASC
LIMIT 20;
-- In application code: reverse the 20 returned rows back to DESC order.
```

**4. Direct Jump to Page $N$**

Keyset pagination cannot jump directly to Page 50 without having fetched the cursor from Page 49. If a user interface requires arbitrary page navigation buttons (`[1] [2] [3] ... [50]`), pure keyset pagination cannot be used.

Strategies to solve this:
- For public APIs and infinite feeds, replace page numbers with cursor tokens (`next_cursor`, `prev_cursor`).
- For admin panels requiring arbitrary page jumps on multi-million row tables, use **Pattern 3 (Deferred Joins)** with a maximum allowed page cap (e.g., disallowing jumps beyond page 1,000).

## 6. Variations and Follow-ups

**Variation 1: Multi-Column Sorting with Mixed Directions**

Suppose products must be sorted by `priority DESC` and then by `price ASC` with `id ASC` as the tiebreaker.

When sort directions are mixed, row constructor syntax `(priority, price, id) < (...)` cannot be used because tuple comparison requires all columns to sort in the same direction. You must use expanded boolean logic:

```sql
-- Mixed sort directions: priority DESC, price ASC, id ASC
SELECT id, name, priority, price
FROM products
WHERE (priority < :last_priority)
   OR (priority = :last_priority AND price > :last_price)
   OR (priority = :last_priority AND price = :last_price AND id > :last_id)
ORDER BY priority DESC, price ASC, id ASC
LIMIT 20;
```

Index Requirement: `CREATE INDEX idx_products_p_p_id ON products (priority DESC, price ASC, id ASC);`

---

**Variation 2: Opaque Base64 Cursors for Public APIs**

Exposing raw database columns (`created_at`, `id`) in client-facing API parameters ties frontend clients directly to internal database schema implementations.

Best Practice: Serialize the cursor values into a JSON string and encode it as an opaque Base64 token:

```json
// Serialized cursor object
{
  "c": "2026-08-26T10:00:00Z",
  "i": 4
}
```

```http
GET /api/v1/items?limit=20&cursor=eyJjIjoiMjAyNi0wOC0yNlQxMDowMDowMFoiLCJpIjo0fQ==
```

The backend server decodes the Base64 cursor, validates the schema, and securely passes the values into the parameterized SQL query.

---

**Variation 3: The GraphQL Relay Cursor Connections Specification**

In modern API architecture, cursor pagination is standardized by the GraphQL Relay Connection specification. The query returns a list of `edges` (each containing a `node` and its specific `cursor`), along with `pageInfo`:

```json
{
  "data": {
    "items": {
      "edges": [
        { "cursor": "YXJyYXljb25uZWN0aW9uOjM=", "node": { "id": "4", "name": "Item D" } },
        { "cursor": "YXJyYXljb25uZWN0aW9uOjQ=", "node": { "id": "3", "name": "Item C" } }
      ],
      "pageInfo": {
        "endCursor": "YXJyYXljb25uZWN0aW9uOjQ=",
        "hasNextPage": true,
        "hasPreviousPage": false
      }
    }
  }
}
```

To calculate `hasNextPage` without executing an extra `COUNT(*)` query, request `LIMIT + 1` (e.g., `LIMIT 21` when page size is 20). If the database returns 21 records, `hasNextPage` is `true`; pop the 21st record off the array and return the 20 records to the client.

## 7. 🧠 The Memory Hook

> **"Offset counts and discards; keyset seeks and serves."**
>
> Never ask the database how many rows to skip ($O(N)$ scan). Always tell the database the last value you saw and seek forward with an index ($O(1)$ seek).
