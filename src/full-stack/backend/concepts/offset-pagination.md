# Offset-Based Pagination: Mechanics, SQL Costs, and Pitfalls

## 1. Why This Exists — The Problem First

Imagine launching an e-commerce platform with 10 million orders. In local testing with 50 rows, your order history endpoint returns in 2 milliseconds. But six months into production, a scraping bot or curious customer navigates to page 250,000 using `?page=250000&limit=20`. 

Your database CPU instantly spikes to 100%, memory climbs, connection pools saturate, and the query takes 16 seconds to finish. The database didn't crash because the query was complex—it crashed because SQL had to locate, parse, and discard 5,000,000 rows from disk just to return the 20 rows at the very end.

At the exact same time, a support agent on page 1 of the customer dashboard reviews recent tickets. While they look at ticket #20 at the bottom of their screen, a new high-priority ticket is created. The agent clicks "Next Page" to see tickets #21 through #40. Because the new ticket pushed every row down by one slot, ticket #20 has shifted into slot #21. The agent sees ticket #20 twice, gets confused, and misses ticket #21 entirely.

Without pagination, returning millions of rows crashes the server with out-of-memory errors and freezes the client browser. With naive offset pagination, you get catastrophic database slow-downs at depth and data inconsistency during live writes. Understanding how offset pagination works under the hood is what lets you know when to use it, how to optimize it, and when to abandon it.

## 2. The Analogy — Make It Obvious

Think of a paper filing cabinet with 1,000,000 folders arranged alphabetically by customer name, managed by a filing clerk.

You walk up to the clerk and say: "I want folders 500,001 through 500,020."

The clerk cannot magically teleport their fingers to folder #500,001. The filing cabinet has no direct index for physical folder counts. So the clerk starts at folder #1:
1. Pulls folder #1, counts "1", drops it on the floor.
2. Pulls folder #2, counts "2", drops it on the floor.
3. Repeats this tedious process 500,000 times until a mountain of 500,000 discarded folders covers the room.
4. Finally pulls folders 500,001 through 500,020, hands them to you, and cleans up the mess.

Now imagine that while the clerk was counting folder #250,000, someone walked past and dropped a brand-new folder into the "A" drawer. Every single folder behind it shifts back by one position. When the clerk reaches folder #500,001, they are handing you a folder you already inspected on your previous visit.

In SQL:
- The filing cabinet is your table data on disk.
- The clerk counting and dropping folders is the database engine reading rows and discarding them to satisfy `OFFSET`.
- The shifting drawer is concurrent data insertion causing page drift.

## 3. How It Actually Works — The Full Explanation

Offset-based pagination calculates a numeric position in a sorted result set, skips a specified number of rows (`OFFSET`), and returns a fixed batch size (`LIMIT`).

The client provides two numbers:
- `page`: The requested page index (1-indexed in UI, e.g., page 3).
- `limit` (or `pageSize`): How many records to return per page (e.g., 20).

The server calculates the offset:
$$\text{OFFSET} = (\text{page} - 1) \times \text{limit}$$

The resulting SQL query looks like this:

```sql
SELECT id, customer_id, total_amount, created_at
FROM orders
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 40;
```

**The Internal SQL Execution Flow**

When a relational database (PostgreSQL, MySQL, SQLite) executes an `OFFSET N LIMIT M` query, it follows these exact steps:
1. Evaluates any `WHERE` filter clauses.
2. Sorts matching rows according to the `ORDER BY` clause (using an index if available, or a memory/disk sort buffer).
3. Reads each row from the index and/or table heap.
4. Increments an internal row counter.
5. If counter $\le N$, the row is immediately discarded from memory.
6. If $N <$ counter $\le N + M$, the row is added to the result buffer.
7. Once $M$ rows are collected, execution stops and the buffer is sent over the network.

The time complexity of this operation is $O(N + M)$. If $N = 10$, cost is negligible. If $N = 5,000,000$, the database must perform $5,000,000$ read-and-discard operations.

**The Two Inherent Flaws of Offset Pagination**

**Flaw 1: Deep Pagination Latency ($O(N)$ Disk and I/O Waste)**
When skipping 5,000,000 rows with `SELECT *`, the database must fetch the full row tuples (all columns, including large text or JSON fields) from disk into the buffer pool just to throw them away. This causes severe buffer pool churn, evicting frequently cached hot pages and dragging down the entire database server.

**Flaw 2: Page Drift (Data Inconsistency Under Concurrent Writes)**
Offset pagination is stateless. It does not snapshot the table at page 1.
- **Insertions cause duplicate reads:** If a new record is inserted at index 0 while the user moves from page 1 to page 2, all records shift down by one. Record #20 moves to position #21 and is returned again on page 2.
- **Deletions cause skipped records:** If record #5 is deleted while the user is on page 1, all following records shift up by one. Record #21 shifts into position #20. When the user requests page 2 (`OFFSET 20`), the database skips records 1–20, completely missing the original record #21.

**The Hidden Bottleneck: Total Count Queries**

UI pagination bars require total count metadata (`totalPages`, `totalCount`) to render buttons like `[1] [2] [3] ... [100]`.
To generate this, servers run:

```sql
SELECT COUNT(*) FROM orders WHERE status = 'completed';
```

In databases with Multi-Version Concurrency Control (MVCC) like PostgreSQL, `COUNT(*)` cannot read a single cached number because row visibility depends on the current transaction snapshot. The database must scan every matching row or index tuple, turning every page request into two expensive full-scans.

**How to Optimize Offset Pagination**

**1. Deferred Joins (Late Row Lookup)**
Instead of reading all table columns while skipping rows, force the database to skip rows inside the lightweight B-Tree index using only the primary key, and join back to the main table only for the final $M$ rows:

```sql
SELECT o.id, o.customer_id, o.total_amount, o.created_at, o.notes
FROM orders o
JOIN (
    SELECT id
    FROM orders
    ORDER BY created_at DESC, id DESC
    LIMIT 20 OFFSET 100000
) AS page_keys ON o.id = page_keys.id
ORDER BY o.created_at DESC, o.id DESC;
```
Because the subquery only reads `(created_at, id)` from a covering index, it skips 100,000 tiny index entries in memory without loading full table rows from disk. The outer query then fetches full row data for only the 20 matched IDs.

**2. Approximate or Cached Counts**
For tables over 100,000 rows, never run `COUNT(*)` on every request:
- Cache the count in Redis with a 5-minute TTL.
- In PostgreSQL, read catalog metadata for estimates: `SELECT reltuples::bigint FROM pg_class WHERE relname = 'orders';`
- Stop showing exact page numbers past page 10 and replace them with a simple "Next" indicator.

**3. Hard Capping Maximum Pages**
Limit the maximum allowable offset in application code (e.g., maximum page 100, or `max_offset = 2000`). This prevents crawlers and malicious users from triggering deep pagination DOS attacks.

**When Offset Pagination Is the Right Choice**
- Admin dashboards with small to moderate datasets ($< 50,000$ rows).
- UIs where jumping directly to an arbitrary page (e.g., "Jump to page 7") is an explicit product requirement.
- Static or rarely mutated data catalogs where real-time page drift is impossible.

## 4. Real Code — See It Working

Here is a complete, production-ready Node.js / Express implementation demonstrating input sanitization, the deferred join optimization, total count caching, and standardized metadata formatting.

```typescript
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();
const db = new Pool({ connectionString: process.env.DATABASE_URL });

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number | null;
    totalPages: number | null;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

interface OrderRecord {
  id: string;
  customerId: string;
  totalAmount: number;
  createdAt: Date;
  status: string;
}

// In-memory or Redis cache for expensive total counts
const countCache = new Map<string, { count: number; expiresAt: number }>();

async function getEstimatedOrCachedCount(status: string): Promise<number> {
  const cacheKey = `count:orders:${status}`;
  const cached = countCache.get(cacheKey);
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached.count;
  }

  // Run count query only when cache misses
  const countResult = await db.query(
    'SELECT COUNT(*) AS total FROM orders WHERE status = $1',
    [status]
  );
  
  const total = parseInt(countResult.rows[0].total, 10);
  countCache.set(cacheKey, { count: total, expiresAt: Date.now() + 60_000 }); // 60s TTL
  return total;
}

router.get('/orders', async (req: Request, res: Response) => {
  try {
    // 1. Sanitize and clamp inputs to prevent negative offsets or huge memory allocations
    const rawPage = parseInt(req.query.page as string, 10);
    const rawLimit = parseInt(req.query.limit as string, 10);
    const status = (req.query.status as string) || 'completed';

    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

    // Hard ceiling on offset to prevent deep-scan DOS attacks
    const MAX_ALLOWED_PAGE = 500;
    if (page > MAX_ALLOWED_PAGE) {
      return res.status(400).json({
        error: `Page number exceeds maximum allowed limit of ${MAX_ALLOWED_PAGE}. Please refine filters.`
      });
    }

    const offset = (page - 1) * limit;

    // 2. Fetch total count and paginated rows in parallel
    // We use Deferred Join SQL to avoid loading large table columns during the offset skip
    const deferredJoinQuery = `
      SELECT 
        o.id,
        o.customer_id AS "customerId",
        o.total_amount AS "totalAmount",
        o.created_at AS "createdAt",
        o.status
      FROM orders o
      JOIN (
        SELECT id 
        FROM orders
        WHERE status = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3
      ) AS matched_keys ON o.id = matched_keys.id
      ORDER BY o.created_at DESC, o.id DESC;
    `;

    const [count, queryResult] = await Promise.all([
      getEstimatedOrCachedCount(status),
      db.query<OrderRecord>(deferredJoinQuery, [status, limit, offset])
    ]);

    const totalPages = Math.ceil(count / limit);

    const response: PaginatedResponse<OrderRecord> = {
      data: queryResult.rows,
      pagination: {
        page,
        limit,
        totalCount: count,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Pagination query failed:', error);
    return res.status(500).json({ error: 'Internal server error fetching orders.' });
  }
});

export default router;
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why does `OFFSET 1000000 LIMIT 10` perform so poorly in relational databases?**

The database engine cannot index row positions directly because relational tables are unordered heaps of tuples subject to continuous insertions, deletions, and updates. To satisfy `OFFSET 1000000`, the query planner must scan through 1,000,010 matching index or table entries in sort order, evaluate transaction visibility for every single row under MVCC, increment an internal counter, and discard the first 1,000,000 rows. The time and I/O cost scale linearly $O(N)$ with offset depth, saturating disk throughput and evicting cached pages from the buffer pool.

**Q: What is data drift (or page drift) in offset pagination, and how does it happen?**

Data drift occurs when mutations happen concurrently while a client paginates through records. Because offset pagination relies strictly on numeric row index positions rather than unique record markers:
- If a new row is inserted ahead of the current viewport, all following rows shift down by 1. When the client requests the next page, the last item from the previous page is returned again as a duplicate.
- If an existing row ahead of the viewport is deleted, all following rows shift up by 1. The client skips over an unread record on the next page request.
Offset pagination has no snapshot isolation across independent HTTP requests.

**Q: How does a Deferred Join optimize deep offset pagination queries?**

A standard `SELECT * FROM table ORDER BY created_at LIMIT 20 OFFSET 100000` must retrieve full row records—including text fields, JSON blobs, and secondary columns—from table storage for all 100,020 rows before throwing away 100,000 of them. 

A deferred join moves the `LIMIT` and `OFFSET` into a subquery that selects only the indexed primary key (`SELECT id FROM table ORDER BY created_at LIMIT 20 OFFSET 100000`). The database resolves the offset entirely within the compact B-tree index in memory without touching row heap pages. Once the 20 target IDs are identified, the outer query joins back to the primary table to fetch the full column payload for only those 20 rows.

**Q: Why is `SELECT COUNT(*)` often slower than the pagination query itself, and how do you mitigate it?**

In MVCC databases like PostgreSQL, row visibility depends on the requesting transaction's active snapshot. As a result, the database cannot simply read a single global count integer; it must perform an index or sequential scan across the table to count visible rows. On a table with 20 million rows, `COUNT(*)` can take several seconds.

Mitigations include:
1. Caching count results in Redis with a short TTL (e.g., 30–60 seconds).
2. Using database catalog statistics (`pg_class.reltuples` in Postgres) for approximate counts when exact numbers are not legally required.
3. Omitting total counts entirely in the API contract, returning only a `has_more` boolean determined by querying `LIMIT + 1` rows.

**Q: Why is a tie-breaker column mandatory in the `ORDER BY` clause when paginating?**

If you sort by a non-unique column such as `created_at` or `status`, multiple rows will share identical sort values. Relational databases do not guarantee deterministic row ordering for identical keys across queries; the order depends on physical disk layout, index scans, or parallel worker allocation. Without a secondary unique tie-breaker (such as `ORDER BY created_at DESC, id DESC`), the database may return the same row on page 1 and page 2, or skip rows entirely, even when no writes have occurred.

**Q: When should you choose offset pagination over cursor pagination?**

Offset pagination is preferred when:
1. The UI explicitly requires jumping directly to arbitrary pages (e.g., "Go to page 14" in an administrative audit tool).
2. The total dataset size is bounded and small ($< 10,000$ rows).
3. The data is static or updated in scheduled batches, eliminating the risk of page drift.
4. Complex dynamic sorting across multiple arbitrary columns makes cursor-based comparison predicates too difficult to construct.

## 6. The Traps — What Goes Wrong

**Trap 1: Sorting on Non-Unique Columns Without a Tie-Breaker**
- *The Mistake:* Writing `ORDER BY created_at DESC LIMIT 20 OFFSET 20` where thousands of records share the exact same timestamp.
- *Why It Breaks:* The SQL standard specifies that ordering among equal keys is non-deterministic. PostgreSQL may return rows in order `[A, B, C]` on page 1, and after a vacuum or checkpoint, return order `[B, A, C]` on page 2. Record `A` appears on both pages.
- *The Fix:* Always append a unique, immutable column as the final tie-breaker: `ORDER BY created_at DESC, id DESC`.

**Trap 2: Unbounded `limit` or `pageSize` Parameter (Memory DoS)**
- *The Mistake:* Accepting `req.query.limit` directly without upper bounds: `SELECT * FROM users LIMIT $1 OFFSET $2`.
- *Why It Breaks:* An attacker sends `?limit=1000000`. The server attempts to allocate memory for 1,000,000 JSON objects simultaneously, triggering garbage collection thrashing or an immediate out-of-memory crash.
- *The Fix:* Enforce a strict server-side clamp: `const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);`.

**Trap 3: Running Synchronous `COUNT(*)` on Every Infinite Scroll Request**
- *The Mistake:* Querying `SELECT COUNT(*)` on every scroll tick for a mobile infinite scroll feed.
- *Why It Breaks:* Infinite feeds do not render page numbers; they only need to know whether more data exists. Running a full table count on every scroll action wastes massive database CPU.
- *The Fix:* Query for `LIMIT + 1` rows (e.g., request 21 items when page size is 20). If 21 rows return, slice the array to 20 items and set `hasNext = true`. Never run a count query for infinite scroll.

**Trap 4: Off-By-One Offset Calculations in UI and Backend**
- *The Mistake:* Inconsistent 0-indexed vs 1-indexed page math between frontend and backend.
- *Why It Breaks:* Frontend sends `page=0`, backend computes `(0 - 1) * 20 = -20`, causing SQL syntax errors; or frontend sends `page=1` and backend computes `1 * 20 = OFFSET 20`, accidentally skipping the first page entirely.
- *The Fix:* Standardize on 1-indexed pages in public APIs and validate explicitly: `const offset = (Math.max(page, 1) - 1) * limit;`.

**Trap 5: Filtered Pagination Without Composite Indexes**
- *The Mistake:* Querying `WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20 OFFSET 100` with separate single-column indexes on `status` and `created_at`.
- *Why It Breaks:* The query planner must perform an index merge or scan the `status` index, fetch heap tuples, and sort them in memory.
- *The Fix:* Create a composite index matching the filter and sort order: `CREATE INDEX idx_orders_status_created ON orders (status, created_at DESC, id DESC);`.

## 7. Compare With Related Concepts

**Offset Pagination vs. Keyset / Cursor Pagination**
- *The Difference:* Offset pagination skips records by numerical count (`OFFSET 100000`), forcing the database to scan and discard preceding rows. Keyset pagination filters records by value using indexed comparison predicates (`WHERE (created_at, id) < ('2026-08-01', 4920) LIMIT 20`), jumping directly to the starting record in $O(\log N)$ index lookup time.
- *Rule of Thumb:* Use offset pagination for admin tools requiring direct page-number jumping on small tables ($< 50,000$ rows); use cursor pagination for high-volume data, infinite scroll feeds, and large public APIs.

**Offset Pagination vs. Time-Bucket (Windowed) Pagination**
- *The Difference:* Offset pagination partitions results by arbitrary row counts. Time-bucket pagination partitions results by discrete time intervals (e.g., `WHERE created_at >= '2026-08-01 00:00:00' AND created_at < '2026-08-02 00:00:00'`).
- *Rule of Thumb:* Use time-bucket pagination for time-series logs, analytics metrics, and audit event streams where queries naturally align with calendar intervals rather than item quantities.

**Offset Pagination vs. Streaming / WebSockets**
- *The Difference:* Offset pagination requires repeated pull requests over HTTP, repeatedly re-evaluating query state. Streaming pushes continuous live updates or query cursors over a persistent connection.
- *Rule of Thumb:* Use offset pagination for standard on-demand data viewing; use WebSockets or Server-Sent Events (SSE) when the UI requires a live real-time stream of incoming events.

## 8. 🧠 The Memory Hook

> **Offset is a bouncer who makes 10,000 people wait in line and inspects every single ID just to throw them out and let person 10,001 inside. Never pay your database to read records it is instructed to discard.**

