# How Do You Implement Pagination in MERN?

## 1. The Real-World Problem — When You Actually Hit This

An orders screen works perfectly with 200 records. Then production grows to 20 million. Page 1 is fast, but page 20,000 makes MongoDB walk past hundreds of thousands of records before it can return 25. At the same time, new orders arrive: an offset-based page can now repeat an order or skip one the user never saw.

This is two problems. First, you need to limit the amount of data sent to the browser so you don't crash the network or the React component. Second, you need a stable way to define which records belong on the next page. In a MERN app, that choice affects the React request, the Express route, the MongoDB query, and the index that makes it fast.

## 2. The Analogy — Make the Mechanic Obvious

Offset pagination is like asking a librarian, "Start at book 10,001 and give me the next 25." The librarian still has to walk past the first 10,000 books to reach that position. The request is easy to understand, and it works fine when you only need page 1 or page 2. But the work grows with the offset — asking for page 20,000 means walking past 500,000 books.

Cursor pagination is like leaving a bookmark after the last book you read. The next request says, "Give me the next 25 after this bookmark." The librarian can walk directly to that bookmark spot and start counting from there instead of from the library entrance. The bookmark has to describe the full position — if books are arranged by author and then by publication date, the bookmark needs both the author name and the date. A bookmark with just the author isn't enough because multiple books share that author.

## 3. The Full Explanation — How It Actually Works

Offset pagination uses page numbers. The client sends `page=3` and `limit=25`. The server calculates how many records to skip:

```txt
skip = (page - 1) * limit
```

So page 3 with a limit of 25 means skip 50 records and return the next 25. The server validates both values, applies the same filter and sort every time, then runs `find(filter).sort(sort).skip(skip).limit(limit)`. An optional `countDocuments(filter)` gives the UI `totalPages` so it can show "Page 3 of 120". But counting is extra work, and it's often unnecessary for a "load more" feed.

The problem is that deep `skip` values become slow. MongoDB has to advance past the skipped index entries or documents. Skipping 50 records is fast. Skipping 500,000 records is not, even with an index.

Cursor pagination avoids page numbers entirely. The API returns a token containing the last returned document's sort keys. The next request sends that token, and the query asks for documents after it in the chosen order. The token is a cursor — it marks where you left off.

Instead of `countDocuments`, the server fetches `limit + 1` records. If the 26th record exists, there's another page. The server returns only the first 25 records and uses the extra one to set `hasMore` to true. This avoids an extra count query.

The sort must be deterministic. If you sort only by `createdAt`, you have a problem: multiple records can share the same timestamp. Which one comes first when timestamps are equal? The database might return them in a different order on the next query. That means you could see the same record twice or miss one.

This is why you add a unique tie-breaker. For a descending date feed, sort by `createdAt` descending, then by `_id` descending. `_id` is a MongoDB ObjectId, which is unique and roughly time-ordered. The pair gives every document one stable position. The next-page predicate for a descending feed is:

```js
{
  $or: [
    { createdAt: { $lt: cursor.createdAt } },
    { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }
  ]
}
```

Read this as: "Give me records where the created date is before the cursor's date, OR where the created date equals the cursor's date but the ID is before the cursor's ID." For an ascending feed, you'd use `$gt` instead of `$lt`.

A cursor is tied to its filter and sort. Never reuse a cursor from one search with another filter. If a user was looking at "open" orders and switches to "closed" orders, the old cursor no longer makes sense. Reject malformed cursors and cap the requested limit on the server.

The index must match the real query. For an orders feed filtered by status and sorted by date, `{ status: 1, createdAt: -1 }` supports the status equality filter and the primary `createdAt` range and order. The `_id` is only a tie-breaker in the sort and cursor — it doesn't need to be in the compound index. Verify the plan with `explain("executionStats")` to confirm the index is actually being used.

Use `.select()` to keep each page small by returning only the fields the frontend needs. Use `.lean()` to avoid creating Mongoose document wrappers for read-only responses — this saves memory and processing time.

Offset pagination works well for small, mostly stable tables where users need page numbers and total counts. Cursor pagination is better for large feeds, infinite scroll, and data that changes while the user is browsing. Neither method freezes the database — inserts or deletes can still change what a user sees. Cursor pagination prevents the drift problem where offset pages repeat or skip records under writes, but a record inserted above the cursor will only appear when the user refreshes from the beginning.

## 4. See It In Practice — Real Code or Queries

Here's an Express/Mongoose route that implements cursor pagination for orders filtered by status. The cursor is a base64url-encoded JSON object containing the last record's sort keys. In a real application, you might sign the token to prevent clients from changing its meaning, but the server must still validate the decoded values regardless.

```js
import express from "express";
import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  status: { type: String, enum: ["open", "closed"], required: true },
  customerName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// This index supports the status filter and the primary createdAt range/order.
// _id is the tie-breaker in the sort but doesn't need to be in the index.
orderSchema.index({ status: 1, createdAt: -1 });

const Order = mongoose.model("Order", orderSchema);
const app = express();
const MAX_LIMIT = 50;

class PaginationValidationError extends Error {}

// Encode the last record's sort keys into a base64url token.
// We include the status and sort contract to detect when a cursor
// is reused with a different filter or sort order.
function encodeCursor(order, status) {
  return Buffer.from(JSON.stringify({
    createdAt: order.createdAt.toISOString(),
    id: order._id.toString(),
    status: status ?? null,
    sort: "createdAt-desc-id-desc"
  })).toString("base64url");
}

// Decode and validate the cursor. Reject it if the status or sort
// contract doesn't match the current request — this prevents using
// a cursor from one filter with another filter.
function decodeCursor(value, expectedStatus) {
  if (!value) return null;
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new PaginationValidationError("Invalid cursor");
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new PaginationValidationError("Invalid cursor");
  }
  if (
    !mongoose.isValidObjectId(decoded.id) ||
    Number.isNaN(Date.parse(decoded.createdAt)) ||
    decoded.status !== (expectedStatus ?? null) ||
    decoded.sort !== "createdAt-desc-id-desc"
  ) {
    throw new PaginationValidationError("Invalid cursor");
  }
  return {
    createdAt: new Date(decoded.createdAt),
    id: new mongoose.Types.ObjectId(decoded.id)
  };
}

app.get("/api/orders", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), MAX_LIMIT);
    const status = req.query.status;
    if (status && !["open", "closed"].includes(status)) {
      return res.status(400).json({ error: "status must be open or closed" });
    }

    const filter = status ? { status } : {};
    const cursor = decodeCursor(req.query.cursor, status);
    if (cursor) {
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }
      ];
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .select("customerName status createdAt")
      .limit(limit + 1)
      .lean();

    const hasMore = orders.length > limit;
    const data = hasMore ? orders.slice(0, limit) : orders;
    res.json({ data, nextCursor: hasMore ? encodeCursor(data[data.length - 1], status) : null, hasMore });
  } catch (error) {
    if (error instanceof PaginationValidationError) {
      return res.status(400).json({ error: "Invalid pagination request" });
    }
    console.error("Failed to fetch orders", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

await mongoose.connect(process.env.MONGODB_URI);
app.listen(3000);
```

The first request is `GET /api/orders?status=open&limit=20`. The next request uses the returned token: `GET /api/orders?status=open&limit=20&cursor=<nextCursor>`. The filter stays the same, and the cursor points to the last item from the previous response.

For a page-number UI, the equivalent MongoDB/Mongoose query is straightforward but has the deep-offset cost:

```js
const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
const filter = { status: "open" };
const [data, total] = await Promise.all([
  Order.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean(),
  Order.countDocuments(filter)
]);

res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
```

The React side should treat the server response as the source of truth. A minimal "load more" flow keeps the cursor and appends only responses requested from the current cursor. Disable the button while a request is in flight, and reset both items and cursor when the filter changes.

```jsx
import { useState } from "react";

export function Orders() {
  const [orders, setOrders] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  async function loadNextPage() {
    if (loading || !hasMore) return;
    setLoading(true);
    const params = new URLSearchParams({ status: "open", limit: "20" });
    if (nextCursor) params.set("cursor", nextCursor);
    try {
      const response = await fetch(`/api/orders?${params}`);
      if (!response.ok) throw new Error("Request failed");
      const page = await response.json();
      setOrders((current) => [...current, ...page.data]);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } finally {
      setLoading(false);
    }
  }

  return <button onClick={loadNextPage} disabled={loading || !hasMore}>
    {loading ? "Loading..." : hasMore ? "Load more" : "No more orders"}
  </button>;
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: When would you choose offset pagination over cursor pagination?**

Choose offset when the dataset is small or users genuinely need numbered pages and total counts. It is simple to link to `page=4`, jump to a page, and show `Page 4 of 30`. Choose a cursor for deep lists, infinite scroll, or frequently changing data. Cursor pagination is less convenient for jumping to an arbitrary page and usually does not provide a cheap exact total.

**Q: Why is `skip()` slow on deep pages?**

MongoDB still has to advance past the skipped documents or index entries. An index can make filtering and sorting efficient, but it does not make skipping 500,000 positions free. Cursor pagination turns that work into an indexed range starting at a known key.

**Q: Why are both `createdAt` and `_id` in the sort and cursor?**

`createdAt` gives the useful chronological order, but timestamps can tie. `_id` is a unique tie-breaker. The query, sort, index, and cursor must all use the same pair or records can be duplicated or omitted at a page boundary.

**Q: Why fetch `limit + 1` records?**

The extra record answers whether another page exists. The server returns only the first `limit` records and uses the extra one to set `hasMore`. This avoids an additional count query for an infinite-scroll endpoint.

**Q: How do filters affect cursor pagination?**

The filter must be applied to every request, including the request after a cursor. Bind the cursor to the filter and sort contract, then reject a cursor from `status=open` when the request asks for `status=closed` (as the example route does). The relevant filter and primary sort field should be reflected in a compound index; `_id` remains only the sort/cursor tie-breaker and is not added to that index. Changing a filter should reset the frontend list and cursor.

**Q: Should every pagination endpoint return a total count?**

No. A total is useful for numbered pages, but `countDocuments()` adds database work and can be expensive for complex filters. A cursor endpoint can return `hasMore` and `nextCursor`; use an exact count only when the product needs it. An estimated count is not a substitute when the count must match a filter.

## 6. The Traps — What Goes Wrong in Production

**Unbounded `limit`:** A client can request a million records and exhaust memory or bandwidth. Parse it, enforce a positive minimum, and cap it on the server.

**Sorting without a unique tie-breaker:** `sort({ createdAt: -1 })` leaves equal timestamps in an unstable order. Add `_id` to the sort and cursor, but keep it out of the supporting compound index.

**Changing the filter while retaining the cursor:** The cursor describes a position in the old result set. Clear it when search, status, tenant, or sort changes.

**Returning a raw MongoDB cursor token:** A raw ObjectId-only cursor is insufficient when the list is sorted by date, and an unsigned token can be edited. Encode the complete key, validate it, and sign it when clients must not alter query semantics.

**Using a cursor with the wrong comparison:** For descending `(createdAt, _id)`, the next page uses `$lt`. For ascending order it uses `$gt`. Mixing direction and operator causes gaps or repeated rows.

**Rendering duplicate pages in React:** Double-clicks, retries, or out-of-order requests can append the same page twice. Disable the request control, serialize page loads, and deduplicate by `_id` if concurrent loading is possible.

**Assuming an index fixes every query:** An index on `createdAt` does not automatically support a tenant or status filter. `{ status: 1, createdAt: -1 }` supports the filter and primary sort field; `_id` is only the sort/cursor tie-breaker, not another compound-index field. Build and verify the index for the actual predicate and sort with `explain("executionStats")`.

## 7. Compare With Related Concepts

| Choice | Best fit | Main cost or limitation |
| --- | --- | --- |
| Offset (`page` + `skip`) | Small, stable tables and numbered pages | Deep pages do increasing skip work and can drift under writes |
| Cursor/keyset | Large feeds, infinite scroll, changing data | Harder to jump to page N and usually no exact total |
| `countDocuments()` | An exact filtered total is required | Adds query work; it is separate from fetching the page |
| `estimatedDocumentCount()` | Approximate total collection size | Ignores filters, so it cannot describe a filtered result set |
| ObjectId-only cursor | Lists ordered only by `_id` | Not enough for a primary date sort or tied sort keys |
| `(createdAt, _id)` cursor | Chronological lists with stable ties | Cursor must preserve both values and matching sort direction |

Use offset for shallow, page-oriented screens. Use keyset pagination when depth and write activity matter more than arbitrary page jumps.

## 8. 🧠 The Memory Hook

Offset pagination counts from the library entrance every time. Cursor pagination leaves a bookmark, but a reliable bookmark contains the whole sort position: for a descending feed, `(createdAt, _id)`. Keep the filter, sort, index, cursor, and frontend state aligned, and each page has a clear place to begin.
