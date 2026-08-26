# Cursor-Based Pagination (Keyset Pagination): Mechanics, B-Tree Indexing, and Implementation

## 1. Why This Exists — The Problem First

Picture an engineering team running a fast-growing social feed with 10 million posts. The application launched with traditional offset pagination: `SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 200000`. In development with 500 rows, every page loaded in 2 milliseconds. But in production, as active users scroll past page 50 or automated search indexers crawl deep pages, database CPU utilization hits 100%, disk I/O bottlenecks, and queries take 4.5 seconds to return.

The database is not slow because the data is large; it is slow because `OFFSET` forces the storage engine to read, traverse, and discard hundreds of thousands of valid rows before returning a single result. 

At the same time, users complain about a frustrating user experience: while scrolling through their feed, the same post appears twice, and other posts disappear entirely without ever being seen. Whenever other users publish new posts or delete old ones, the entire dataset shifts beneath the reader's feet, causing page drift. 

Cursor-based pagination (also known as keyset pagination) was created to solve both problems simultaneously. It turns deep list retrieval from an $O(N)$ row-discard scan into an $O(1)$ indexed pointer seek, while guaranteeing absolute data stability regardless of concurrent writes.

## 2. The Analogy — Make It Obvious

Think of reading a 1,000-page dictionary looking for specific words.

**Offset pagination** is like telling someone: *"Start at page 1. Count 450,000 words one by one with your finger, throw them all away, and read me the next 20 words."* If someone tapes a new page into the front of the dictionary while you are counting, your position shifts, and you end up reading words you already saw on the previous page.

**Cursor pagination** is like handing someone a bookmark that says: *"Last word read: 'Network', Entry ID #8491"*. 

The reader does not count from page 1. They flip directly to the alphabetical thumb notch for 'N' on the side of the book (the B-Tree index), locate the word 'Network' at ID #8491 in one swift motion, and immediately read the next 20 words that follow. If another writer inserts 100 new entries under the letter 'A' at the front of the dictionary, it does not move 'Network'. You never skip an entry, and you never read the same word twice.

In software:
- **The Bookmark Coordinates:** The cursor value (an encoded tuple of the sort column and a unique ID, such as `created_at` + `id`).
- **The Alphabetical Thumb Notches:** The composite B-Tree database index `(created_at DESC, id DESC)`.
- **Flipping Directly to the Bookmark:** A fast $O(\log N)$ tree seek to locate the leaf record, followed by a direct $O(1)$ sequential scan of only the requested items.

## 3. How It Actually Works — The Full Explanation

Instead of specifying how many rows to skip (`OFFSET 20000`), cursor pagination asks the database for rows that exist *after* or *before* a specific boundary value using a `WHERE` clause.

**The Core SQL Mechanism: Keyset Filtering**

Assume we want to paginate through posts in reverse chronological order (newest first). The query seeks records created before the last post seen on the previous page:

```sql
SELECT id, title, created_at
FROM posts
WHERE (created_at, id) < ('2026-08-26 14:30:00.000', 48921)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

In databases that do not support or optimize tuple comparison syntax `(col1, col2) < (val1, val2)`, this is expanded into equivalent disjunctive boolean logic:

```sql
SELECT id, title, created_at
FROM posts
WHERE created_at < '2026-08-26 14:30:00.000'
   OR (created_at = '2026-08-26 14:30:00.000' AND id < 48921)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

**Under the Hood: B-Tree Index Seeking**

To understand why this is fast, look at how a database storage engine (like PostgreSQL's Postgres Heap or MySQL's InnoDB) executes both approaches on a B-Tree index configured on `(created_at DESC, id DESC)`:

1. **How `OFFSET 100000 LIMIT 20` executes ($O(N)$ row scan):**
   - The engine opens the index root node.
   - It descends to the very first leaf node in the index.
   - It steps through 100,000 index pointers one by one across hundreds of disk pages, reading each row header and discarding it.
   - Only on item 100,001 does it begin collecting the 20 rows to return.
   - The work scales linearly with page depth. Page 1,000 takes 1,000 times more disk I/O and CPU than Page 1.

2. **How `WHERE (created_at, id) < ($1, $2) LIMIT 20` executes ($O(1)$ relative to depth):**
   - The engine performs a binary search down the B-Tree levels from root node to intermediate nodes to the exact leaf page containing the entry `('2026-08-26 14:30:00.000', 48921)`. On a table with 100 million rows, this tree traversal takes only 3 to 4 page lookups ($O(\log N)$).
   - Once positioned on that leaf page, it walks the leaf node's doubly-linked list sequentially to read exactly 20 rows.
   - It reads 20 rows whether you are on the first page or the ten-millionth page. Query execution time remains consistently under 5 milliseconds.

**The Deterministic Tie-Breaker Invariant**

A common pitfall is filtering only on the primary sort column: `WHERE created_at < $last_timestamp`. 

Under high-concurrency systems, multiple records often share identical timestamps down to the microsecond (for example, batch imports, automated webhook events, or high-volume transactions). If 5 posts have the exact timestamp `14:30:00.000` and the page boundary cuts off after the 2nd post, querying `WHERE created_at < '14:30:00.000'` completely skips the remaining 3 posts.

A secondary, strictly unique column (such as the primary key `id` or a UUIDv7) must always be appended to break ties deterministically. The database index must match this exact composite sequence: `CREATE INDEX idx_posts_created_at_id ON posts (created_at DESC, id DESC)`.

**Opaque Cursor Serialization**

Client applications should never know the internal SQL columns used to construct pagination. Exposing raw timestamps or database IDs leaks internal schema details, encourages clients to craft brittle custom queries, and prevents backend engineers from changing the indexing strategy later.

The server encodes the pointer values into an opaque string, typically a Base64-encoded JSON payload:

```json
{
  "id": 48921,
  "createdAt": "2026-08-26T14:30:00.000Z"
}
```

Base64 encoded representation sent to client: `eyJpZCI6NDg5MjEsImNyZWF0ZWRBdCI6IjIwMjYtMDgtMjZUMTQ6MzA6MDAuMDAwWiJ9`

When the client requests the next batch, it passes `GET /api/v1/posts?limit=20&after=eyJpZCI6NDg5Mj...`. The server decodes the string, validates the structure, and binds the parameters to the SQL query.

**Lookahead Page Detection (`LIMIT + 1`)**

How does an API know whether another page exists without running an expensive `SELECT COUNT(*)` query over millions of rows?

The standard engineering pattern is the **$N + 1$ lookahead query**:
- If the client requests `limit = 20`, the server queries the database for `LIMIT 21`.
- If the database returns 21 records, the server knows `hasNextPage = true`.
- The server slices off the 21st record, returns only the first 20 records to the client, and generates the `nextCursor` from the 20th record.
- If the database returns 20 or fewer records, `hasNextPage = false` and `nextCursor = null`.

**Bidirectional Pagination (Forward and Backward)**

A complete cursor implementation supports navigating both forward (`after`) and backward (`before`):
- **Forward navigation (`after: cursor`):** Query rows where `(created_at, id) < (cursor.createdAt, cursor.id)` ordered by `created_at DESC, id DESC LIMIT limit + 1`.
- **Backward navigation (`before: cursor`):** Query rows where `(created_at, id) > (cursor.createdAt, cursor.id)` ordered by `created_at ASC, id ASC LIMIT limit + 1`. Because the database returns items in ascending order, the server reverses the resulting array in memory before sending it back to the client so that the UI preserves descending chronological order.

## 4. Real Code — See It Working

Here is a complete, production-ready Node.js and Express implementation with SQL parameterization and opaque cursor encoding.

```javascript
import express from 'express';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const app = express();

// Helper: Serialize cursor object to opaque URL-safe Base64
function encodeCursor(payload) {
  const jsonString = JSON.stringify(payload);
  return Buffer.from(jsonString, 'utf-8').toString('base64url');
}

// Helper: Deserialize and validate opaque Base64 cursor
function decodeCursor(cursorStr) {
  try {
    const jsonString = Buffer.from(cursorStr, 'base64url').toString('utf-8');
    const parsed = JSON.parse(jsonString);
    if (!parsed.id || !parsed.createdAt) {
      throw new Error('Malformed cursor payload');
    }
    return {
      id: Number(parsed.id),
      createdAt: new Date(parsed.createdAt).toISOString()
    };
  } catch {
    throw new Error('Invalid cursor token');
  }
}

app.get('/api/v1/posts', async (req, res) => {
  try {
    const requestedLimit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const afterCursor = req.query.after ? decodeCursor(req.query.after) : null;
    const beforeCursor = req.query.before ? decodeCursor(req.query.before) : null;

    // Fetch limit + 1 to detect next/previous page existence without SELECT COUNT(*)
    const queryLimit = requestedLimit + 1;
    const values = [];
    let whereClause = '';
    let orderByClause = '';
    const isBackward = Boolean(beforeCursor);

    if (afterCursor) {
      // Forward: find records older/lower than the after cursor
      values.push(afterCursor.createdAt, afterCursor.id, queryLimit);
      whereClause = 'WHERE (created_at < $1) OR (created_at = $1 AND id < $2)';
      orderByClause = 'ORDER BY created_at DESC, id DESC';
    } else if (beforeCursor) {
      // Backward: find records newer/higher than the before cursor
      values.push(beforeCursor.createdAt, beforeCursor.id, queryLimit);
      whereClause = 'WHERE (created_at > $1) OR (created_at = $1 AND id > $2)';
      orderByClause = 'ORDER BY created_at ASC, id ASC';
    } else {
      // First page initial load
      values.push(queryLimit);
      whereClause = '';
      orderByClause = 'ORDER BY created_at DESC, id DESC';
    }

    const query = `
      SELECT id, title, content, created_at
      FROM posts
      ${whereClause}
      ${orderByClause}
      LIMIT $${values.length};
    `;

    const { rows } = await pool.query(query, values);

    // Determine if extra lookahead record was found
    const hasMore = rows.length > requestedLimit;
    const items = hasMore ? rows.slice(0, requestedLimit) : rows;

    // When paginating backward, the DB returned items in ASC order; reverse to maintain DESC
    if (isBackward) {
      items.reverse();
    }

    const firstItem = items[0] || null;
    const lastItem = items[items.length - 1] || null;

    const pageInfo = {
      hasNextPage: isBackward ? true : hasMore,
      hasPrevPage: isBackward ? hasMore : Boolean(afterCursor),
      startCursor: firstItem ? encodeCursor({ id: firstItem.id, createdAt: firstItem.created_at }) : null,
      endCursor: lastItem ? encodeCursor({ id: lastItem.id, createdAt: lastItem.created_at }) : null
    };

    return res.json({
      data: items,
      pageInfo
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why does `OFFSET` pagination degrade in performance as page depth increases, while cursor pagination remains constant?**

In relational databases, `OFFSET N` tells the query planner to skip $N$ records. Because database storage engines use B-Trees and row heaps that do not maintain an array-like direct index to the $N$-th row, the database must execute the index scan, visit $N$ index tuples, read the row data from storage or buffer pools to verify visibility under MVCC (Multi-Version Concurrency Control), and then discard them all. For `OFFSET 500000 LIMIT 20`, the engine processes 500,020 rows to deliver 20 rows ($O(N)$ work). 

Cursor pagination replaces the skip counter with a filtered boundary condition (`WHERE (created_at, id) < ($1, $2)`). The database uses the composite B-Tree index to perform an $O(\log N)$ binary tree search directly to the leaf node matching the cursor coordinate. From that exact position, it scans sequentially for only 20 rows. The time complexity to fetch a page is $O(1)$ with respect to offset depth.

**Q: Why is a tie-breaker column mandatory in cursor pagination, and what breaks if you omit it?**

If you paginate on a non-unique column like `created_at` without a tie-breaker, records sharing the exact same timestamp will cause silent data loss. For example, if 10 records are created during the same millisecond and the page size is 5, the first request returns 5 records with timestamp `T`. When the client requests the next page with `WHERE created_at < T`, the database excludes all records with timestamp equal to `T`. The remaining 5 records created at timestamp `T` are permanently skipped and never displayed to the user. Appending a unique identifier like `id` creates a strictly monotonic composite key `(created_at, id)` where every single row has a distinct, reproducible coordinate.

**Q: How does the server know if there is a next page without running `SELECT COUNT(*)`?**

Running `SELECT COUNT(*)` over large tables forces a full table scan or index scan, which ruins the performance benefits of cursor pagination. Instead, the server uses the $N+1$ lookahead technique: if the client requests 20 items, the server executes `LIMIT 21`. If the database returns 21 records, the server sets `hasNextPage = true`, removes the 21st record from the response payload, and encodes the 20th record's values into the `endCursor`. If the database returns 20 or fewer records, `hasNextPage = false`.

**Q: How do you implement bidirectional pagination (scrolling up and down) with cursor pagination?**

Bidirectional pagination requires two cursor parameters: `after` (forward) and `before` (backward). Forward pagination queries rows older than the cursor (`WHERE (created_at, id) < (cursor.created_at, cursor.id) ORDER BY created_at DESC, id DESC LIMIT limit + 1`). Backward pagination inverts both the comparison operator and the sort direction (`WHERE (created_at, id) > (cursor.created_at, cursor.id) ORDER BY created_at ASC, id ASC LIMIT limit + 1`). After retrieving the backward records from the database, the server reverses the array in memory so the client receives the records in the expected chronological display order.

**Q: Can cursor pagination be used if the user wants to sort dynamically by non-unique or user-selected columns (like price, rating, or status)?**

Yes, but every dynamically sortable field must be indexed as the leading column in a composite index alongside the unique tie-breaker. For example, to sort by product price ascending: `CREATE INDEX idx_products_price_id ON products (price ASC, id ASC)`. The query becomes `WHERE (price > $cursor_price) OR (price = $cursor_price AND id > $cursor_id) ORDER BY price ASC, id ASC LIMIT 20`. The cursor must encode both the dynamic column value and the ID: `base64({ price: 29.99, id: 1042 })`. If a user filters and sorts by fields that lack a dedicated composite B-Tree index, cursor pagination loses its index-seeking speed advantage.

**Q: What happens if the record represented by the cursor is deleted from the database before the next page is fetched?**

Cursor pagination handles deleted records gracefully because the cursor represents a value boundary, not a pointer to a physical database row. The query `WHERE (created_at, id) < ('2026-08-26 14:00:00', 500)` seeks the position where that value tuple *would* exist in the B-Tree index and continues reading the next records that satisfy the inequality. The query succeeds seamlessly without throwing an error or shifting the remaining results.

**Q: When would you deliberately choose Offset Pagination over Cursor Pagination?**

Offset pagination is the right choice when:
1. The UI strictly requires random-access numbered pagination (for example, jumping directly to Page 47 of an administrative compliance table).
2. The total dataset is small and bounded (under 10,000 rows), where the $O(N)$ skip overhead is negligible.
3. The dataset is static and does not experience concurrent insertions or deletions during reading sessions.

## 6. The Traps — What Goes Wrong

**Trap 1: The Timestamp Collision & Silent Data Loss**
- **The Mistake:** Writing pagination logic using only `WHERE created_at < $1`.
- **Why It Happens:** Developers assume timestamps are unique across records. In production, concurrent API requests, bulk database imports, or background jobs generate dozens of records with identical millisecond or microsecond timestamps.
- **The Result:** When a page boundary falls in the middle of identical timestamps, querying `< timestamp` drops all remaining records sharing that timestamp. Users report missing orders or unseen posts.
- **The Fix:** Always use a composite condition with a unique column tie-breaker: `WHERE (created_at < $1) OR (created_at = $1 AND id < $2)`.

**Trap 2: Missing the Matching Composite B-Tree Index**
- **The Mistake:** Implementing cursor logic in SQL without creating a composite index matching the exact query columns and order.
- **Why It Happens:** Developers assume having an index on `created_at` and a separate index on `id` is sufficient.
- **The Result:** The database cannot perform a single composite seek on two separate single-column indexes for tuple comparisons. The query planner falls back to an index merge or a sequential table scan, eliminating all performance benefits.
- **The Fix:** Create an explicit compound index matching the sort order: `CREATE INDEX idx_table_created_id ON table_name (created_at DESC, id DESC)`.

**Trap 3: Inverting the Sort Order in Backward Queries Without Reversing**
- **The Mistake:** Querying backward with `WHERE (created_at, id) > ($1, $2) ORDER BY created_at ASC, id ASC` and returning the raw database rows directly to the client.
- **Why It Happens:** The ASC sort is necessary so the database scans outward from the cursor toward newer items, but developers forget the client expects a consistent DESC visual feed.
- **The Result:** When scrolling up, the new batch of items renders upside down (oldest at the top of the batch, newest at the bottom), corrupting the UI feed.
- **The Fix:** Always call `.reverse()` on the retrieved rows in application memory before sending backward pagination responses.

**Trap 4: Attempting Cursor Pagination on Nullable Columns**
- **The Mistake:** Using a nullable column (such as `shipped_at` or `deleted_at`) as the primary cursor sort key.
- **Why It Happens:** Business logic demands sorting by an optional date field.
- **The Result:** In SQL ternary logic, comparisons with `NULL` evaluate to `UNKNOWN` (`NULL < '2026-08-26'` is neither true nor false). Any row where the column is `NULL` is silently omitted from the query results.
- **The Fix:** Enforce `NOT NULL` constraints with sensible defaults (like a sentinel date `'1970-01-01'`), or sort by a guaranteed non-null composite pair like `COALESCE(shipped_at, created_at)`.

**Trap 5: Leaking Internal Schema via Unencoded Cursors**
- **The Mistake:** Exposing raw parameters in API endpoints like `/posts?after_id=48921&after_time=1724682000`.
- **Why It Happens:** It appears simpler to implement than serialization utilities.
- **The Result:** Clients write hardcoded URL generation logic coupled to internal database column names. If you later change the database schema, rename fields, or switch to a multi-column sort key, client integrations break. Furthermore, users can tamper with raw values to bypass rate limits or probe IDs.
- **The Fix:** Always wrap cursor payloads in an opaque, URL-safe Base64 string or an encrypted/signed HMAC token.

## 7. Compare With Related Concepts

**Cursor Pagination vs. Offset/Limit Pagination**
- **Mechanism:** Cursor pagination uses an indexed value boundary in a `WHERE` clause ($O(1)$ time relative to depth); Offset pagination uses `OFFSET N` to scan and discard $N$ rows ($O(N)$ time).
- **Data Consistency:** Cursor pagination has zero page drift during real-time inserts/deletes; Offset pagination produces duplicate and skipped records when data changes between page fetches.
- **Random Access:** Cursor pagination only supports sequential navigation (Next / Previous); Offset pagination allows direct jumps to arbitrary page numbers (e.g. Page 5).
- **Rule of Thumb:** Use Cursor pagination for infinite scroll, mobile feeds, public APIs, and large datasets ($> 10,000$ rows); use Offset pagination for internal administrative dashboards requiring numbered page links on small, static tables.

**Cursor Pagination vs. Time-Window / Chunking Pagination**
- **Mechanism:** Cursor pagination paginates by a specific record pointer and fixed row limit; Time-window pagination queries fixed temporal blocks (e.g. `WHERE created_at BETWEEN '2026-08-01' AND '2026-08-02'`).
- **Data Volume:** Cursor pagination guarantees an exact batch size (e.g., exactly 20 items per page); Time-window pagination returns variable item counts depending on how much activity occurred in that time slice.
- **Rule of Thumb:** Use Cursor pagination for interactive user interfaces and APIs; use Time-Window chunking for background data pipelines, ETL exports, and database backups.

**Cursor Pagination vs. Client-Side Virtual Scrolling**
- **Mechanism:** Cursor pagination is a backend data-fetching strategy that limits how many rows are queried and transferred over the network; Virtual scrolling (like `react-window` or `@tanstack/virtual`) is a frontend rendering optimization that limits how many DOM nodes are mounted on screen.
- **Interaction:** They work together: the frontend uses cursor pagination to fetch subsequent 50-item batches over HTTP as the user scrolls, while the virtualized list recycles DOM nodes to keep memory usage flat.
- **Rule of Thumb:** Cursor pagination solves network payload size and database query load; Virtual scrolling solves browser DOM memory consumption and frame rate drops.

## 8. 🧠 The Memory Hook

> **Offset counts every grain of sand from the beginning of the beach; Keyset drops a pin on the map and walks from there.**
