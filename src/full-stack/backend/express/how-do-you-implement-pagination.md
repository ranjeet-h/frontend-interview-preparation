# How do you implement pagination

## 1. The Real-World Problem — When You Actually Hit This

You ship `GET /api/products` on day one. It returns everything. With 80 products it feels fine. Two months later the catalog has 40,000 items. The same endpoint now sends 18 MB of JSON, the database holds a cursor open for seconds, the frontend tries to render 40,000 cards and freezes, and a user discovers they can add `?limit=1000000` and pin your Node process at 100% memory.

You patch it with `?page=2&limit=20` and `skip/limit` in Mongoose. It works until marketing runs a campaign. Page 1 is fast. Page 400 takes 1.8 seconds. The app has real-time inventory, so between your request for page 2 and page 3 a new product is inserted at the top, and the user sees the same item twice and misses another entirely. A product manager asks for "showing 1-20 of 42,183" and you add `countDocuments()` on every request, which is now your slowest query. Each of those failures is what pagination is trying to prevent: limiting how much work the database, server, and client have to do at once, while keeping the result stable and safe when the data is changing underneath.

## 2. The Analogy — Make the Mechanic Obvious

Think of your collection as a 60-mile wilderness trail with a photo viewpoint every few feet. A hiker radios the ranger station asking for photos.

Offset pagination is mile markers. The hiker says "send me mile 40 to mile 41." The ranger has to walk past miles 0 through 39 to count, then copy the next mile. The farther the mile, the longer the walk, even if you only want one mile of photos. And if the trail crew re-grades the trail and adds a new viewpoint at mile 1 while you are still asking for miles, every mile marker after that shifts by one. You will get a duplicate photo and miss another.

Cursor pagination is a GPS breadcrumb. The hiker says "my last photo has waypoint 38.4123,-122.0912 at 10:42am, give me the next 20 viewpoints after that exact point." The ranger does not count from the start. The ranger jumps straight to that coordinate and walks forward 20 steps. The work is always 20 steps, whether you are at mile 2 or mile 52. But this only works if everyone agrees on how the trail is ordered. If you order by timestamp and two photos share the same second, you need a tie-breaker like the photo ID, or that duplicate timestamp will still cause slips.

Limit and capping is the pack weight rule. The ranger says "you can carry 50 photos at most per request, no matter what you ask for." Otherwise one hiker asks for 10,000 and collapses.

Total count is "how long is the entire trail?" To answer exactly, the ranger has to survey all 60 miles. You can do it for a 5-mile trail, but for 60 miles you stop answering exactly on every radio call and instead say "there is more trail ahead" or you post a pre-measured sign that gets updated nightly.

Stable ordering is "the trail direction sign is bolted down." You must pick one direction, like newest first by `createdAt`, and stick to it with a unique tie-breaker. If you let hikers ask for "sort by any field they want" without a fixed order, the trail rearranges between requests and the breadcrumb points to the wrong place.

## 3. The Full Explanation — How It Actually Works

Pagination is an Express problem at the HTTP layer and a database problem underneath. Express parses and sanitizes the query, the database returns a window, and the response contract tells the client how to ask for the next window.

Offset pagination says "skip N items, then take M." The math is `skip = (page - 1) * limit`. In MongoDB that is `.skip(skip).limit(limit)`, in SQL it is `LIMIT $limit OFFSET $skip`, but both mean the database still has to walk past the skipped rows. With an index on the sort field the walk is index entries, without one it is an in-memory sort followed by a walk. Either way the cost grows with the page number. Offset is simple and supports "jump to page 47," which cursor cannot do cheaply. Use it when users need numbered pages and the collection is modest or bounded to a few hundred pages.

Cursor pagination says "give me M items after this exact item." The reference is a cursor, usually the last item's sort key and its `_id`. The query becomes `WHERE (createdAt, _id) < (cursorCreatedAt, cursorId)` for newest-first, then `ORDER BY createdAt DESC, _id DESC LIMIT M`. Because the database can seek the index directly to the cursor position and scan forward, the cost is constant no matter how deep you are. The trade-off is you lose random access. You can only go next or previous, not "jump to page 50." Use cursor for infinite scroll, feeds, and any collection where rows are inserted at the top while the user is scrolling.

Limit and input sanitization happens before any query. Query strings are always strings. `req.query.limit` could be `"20"`, `"999999"`, `"abc"`, or `"-5"`. You parse with `Number.parseInt`, fall back to a default like 20 if the result is not a finite positive integer, and cap with `Math.min(limit, 50)`. Same for `page`, default 1, floor at 1. If you skip this, one request can ask the database to materialize a million documents and stream them as JSON. That is a denial-of-service vector, not just a performance bug.

Total count has a real cost. `countDocuments(filter)` runs a count over the matched set. For a filtered query like `{ category: "electronics" }` that is fine. For an unfiltered collection with millions of rows or a complex filter without an index, the count can be slower than the data fetch. You have three choices. Return an exact total and pay the cost when you know the collection is small or indexed. Return `estimatedDocumentCount()` for the unfiltered total, which uses collection metadata and is fast but ignores filters. Or skip the total entirely for deep or real-time views and return only `hasNextPage` or `hasMore` plus a `nextCursor`. Many production APIs do the third for feeds and keep exact totals only for admin pages where "showing 1-20 of 42,183" is required.

Stable ordering is the rule that makes both styles correct. The database must sort by a unique, deterministic order. `sort({ createdAt: -1 })` alone is not stable if many documents share the same `createdAt`. Two pages can return the same document or skip one when the insert timestamp collides. The fix is to sort by a compound key: `sort({ createdAt: -1, _id: -1 })` and use the same compound key in the cursor filter. That `_id` is unique and monotonically increasing if you use ObjectId, so the order is fully deterministic. The index must match the sort: `db.products.createIndex({ createdAt: -1, _id: -1 })`. Without that index the database sorts in memory and pagination will still be slow even with small limits.

Security boundaries sit on top of this. Filters come from query params, so you assign only known fields like `category` and cast them to strings — the injection-safe pattern is covered in [how do you prevent NoSQL injection](./how-do-you-prevent-nosql-injection.md). Sort fields come from an allowlist such as `new Set(["createdAt","price","name"])`, never directly from `req.query.sort` — see [how do you implement search](./how-do-you-implement-search.md) for the allowlisted filter and sort construction. Otherwise an attacker can sort by an unindexed large text field or probe field names. Errors must fail closed: an invalid cursor is a 400, not a 500 that leaks a stack trace, and a negative page is coerced to 1.

Operationally, log the parsed `page`, `limit`, `skip`, the filter shape, and the query time. Alert when `skip` over a threshold like 5000 or when count queries exceed a time budget. That tells you when to flip an endpoint from offset to cursor.

## 4. See It In Practice — Real Code or Queries

These examples use Express 4 with manual async wrapping and Mongoose. On Express 5 you can drop the `asyncHandler` wrapper because the router handles rejected promises. The same ideas apply to SQL with `LIMIT/OFFSET` versus keyset `WHERE (createdAt, id) < ($1, $2)`.

```js
import express from 'express';
import mongoose from 'mongoose';

const app = express();

// Minimal model for the example
const productSchema = new mongoose.Schema({
  name: String,
  category: String,
  price: Number,
  createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', productSchema);

// Express 4 needs this wrapper; Express 5 does this for you
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Shared helpers: parse and sanitize pagination inputs
function parseOffsetPagination(query) {
  let page = Number.parseInt(query.page, 10);
  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  limit = Math.min(limit, 50); // cap abuse: never let a client ask for 1M rows
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

const ALLOWED_SORT = new Set(['createdAt', 'price', 'name']);
```

Offset pagination with filter, stable sort, metadata, and an index on the sort key. Note the `_id` tie-breaker so ordering is deterministic. For filter allowlisting and escaping details see [how do you implement search](./how-do-you-implement-search.md) and [how do you prevent NoSQL injection](./how-do-you-prevent-nosql-injection.md) rather than re-teaching them here.

```js
import mongoose from 'mongoose';
// Reuses app, Product, parseOffsetPagination, ALLOWED_SORT, and asyncHandler from the snippet above

// Create this index once, not per request:
// db.products.createIndex({ createdAt: -1, _id: -1 })

app.get('/api/products', asyncHandler(async (req, res) => {
  const { page, limit, skip } = parseOffsetPagination(req.query);

  const sortField = ALLOWED_SORT.has(req.query.sortBy) ? req.query.sortBy : 'createdAt';
  const sortDir = req.query.order === 'asc' ? 1 : -1;

  const filter = {};
  if (req.query.category) {
    filter.category = String(req.query.category);
  }

  // total is expensive on huge collections - see cursor alternative below
  const [total, data] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort({ [sortField]: sortDir, _id: sortDir })
      .skip(skip)
      .limit(limit)
      .select('name price category createdAt') // projection keeps payload small
      .lean()
  ]);

  const totalPages = Math.ceil(total / limit);
  res.json({
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  });
}));
```

Cursor pagination with constant-time seeking, no count, and a `nextCursor` for infinite scroll. The cursor is an opaque base64 token so clients do not build queries themselves. See [how do you implement search](./how-do-you-implement-search.md) for the full search-plus-pagination pipeline and when to switch from `skip` to cursor.

```js
import mongoose from 'mongoose';

// Reuses Product, app, and asyncHandler from the snippet above

function encodeCursor(doc) {
  const payload = { createdAt: doc.createdAt.toISOString(), _id: String(doc._id) };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor) {
  try {
    const obj = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!obj.createdAt || !obj._id) return null;
    if (!mongoose.Types.ObjectId.isValid(obj._id)) return null;
    return { createdAt: new Date(obj.createdAt), _id: new mongoose.Types.ObjectId(obj._id) };
  } catch {
    return null;
  }
}

// Index must match the sort and the range filter:
// db.products.createIndex({ createdAt: -1, _id: -1 })

app.get('/api/products/cursor', asyncHandler(async (req, res) => {
  let limit = Number.parseInt(req.query.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  limit = Math.min(limit, 50);

  const filter = {};
  if (req.query.category) filter.category = String(req.query.category);

  const rawCursor = req.query.cursor;
  let cursor = null;
  if (rawCursor) {
    cursor = decodeCursor(String(rawCursor));
    if (!cursor) return res.status(400).json({ message: 'Invalid cursor' });
    // newest-first: seek items strictly before the cursor position
    filter.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }
    ];
  }

  // fetch one extra to know if there is more
  const docs = await Product.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .select('name price category createdAt')
    .lean();

  const hasMore = docs.length > limit;
  const data = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor = hasMore ? encodeCursor(data[data.length - 1]) : null;

  res.json({ data, nextCursor, hasMore });
}));
```

Frontend handling for both shapes:

```js
// Offset: build page buttons from metadata
// pagination = { total, page, limit, totalPages, hasNextPage, hasPrevPage }
function canGoNext(p) { return p.hasNextPage; }

// Cursor: infinite scroll - keep appending
async function loadNextPage(nextCursor) {
  const url = nextCursor
    ? `/api/products/cursor?limit=20&cursor=${encodeURIComponent(nextCursor)}`
    : '/api/products/cursor?limit=20';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load');
  return res.json(); // { data, nextCursor, hasMore }
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you implement pagination in Express?**

You read `page` and `limit` from `req.query`, parse them to integers, default them, and cap `limit` to a maximum like 50. Compute `skip = (page - 1) * limit` for offset, or decode an opaque `cursor` for cursor style. Build a filter from allowlisted query fields, apply a deterministic sort that always includes `_id` as a tie-breaker, then query with `.skip(skip).limit(limit)` or with a range filter `WHERE (sortKey, _id) > cursor`. Return a consistent envelope so the frontend does not have to guess: for offset that is `{ data, pagination: { total, page, limit, totalPages, hasNextPage, hasPrevPage } }`, for cursor it is `{ data, nextCursor, hasMore }`. Wrap the handler so promise rejections go to your error middleware, and validate everything before it touches the database.

**Q: What is the difference between offset and cursor pagination, and when do you use each?**

Offset uses `skip` and `limit`. It is simple and lets you jump to any numbered page, but the database must walk past all skipped rows, so page 500 is slower than page 1 and real-time inserts can cause duplicates or gaps between pages. Cursor uses the last item's sort key and id as a bookmark and seeks the index directly: `WHERE (createdAt, _id) < cursor LIMIT 20`. The cost stays constant no matter how deep you are and inserts at the top do not shift your window. Use offset for admin tables and search results where numbered pages matter and the total size is bounded. Use cursor for feeds, infinite scroll, and any collection that grows while the user is browsing or that can have thousands of pages.

**Q: Why must you sanitize and cap `limit` and `page`?**

Query strings are untyped strings. Without parsing, `"abc"` becomes `NaN` and Mongo will throw or return surprising results, while `"-5"` can produce negative skips. Without capping, a client can send `?limit=1000000` and force the database to load a million documents into memory, serialize them to JSON, and exhaust your heap or event loop. The fix is explicit: default `limit` to 20 if the parse fails, coerce `page` to at least 1, and enforce `Math.min(limit, 50)`. Return 400 only for truly invalid structured tokens like a malformed cursor; for numeric pagination prefer coercion to safe defaults so a bad query string does not break the whole page.

**Q: Why is `total` expensive and what do you do instead?**

`countDocuments(filter)` has to count every document matching the filter. If the filter is selective and indexed it is fine. If the collection has millions of rows or the filter is unindexed, the count can dominate the request. Three practical options: keep exact `total` when you need "showing 1-20 of 42,183" on small collections, use `estimatedDocumentCount()` for an unfiltered approximate total that reads metadata instead of scanning, or drop `total` entirely and return `{ hasNextPage, nextCursor }` for feeds where the user never needs to know the final page number. When you do keep `total`, you can cache it for a few seconds or compute it in parallel with the data query via `Promise.all`, and make sure the count uses the same filter but no sort or limit.

**Q: What is stable ordering and why does pagination break without it?**

Stable ordering means every document has a unique position in the sorted result, so asking for page 2 after page 1 always continues exactly where you left off. If you sort by `createdAt` alone and ten products share the same second, the database can return those ten in any order on each query. Between two page fetches a new document with the same timestamp can appear and push a row from page 1 onto page 2, causing a duplicate or a missing row. The fix is a compound sort like `sort({ createdAt: -1, _id: -1 })` and a matching compound index. The `_id` is unique, so the order is fully deterministic. Cursor queries must mirror that sort with `WHERE createdAt < cursorTime OR (createdAt = cursorTime AND _id < cursorId)`.

**Q: How do you combine pagination with filtering and sorting safely?**

Build the filter object field by field from known query params and cast each to the expected type, rather than passing `req.query` straight into `find` — see [how do you prevent NoSQL injection](./how-do-you-prevent-nosql-injection.md) for why raw `req.query` is an operator injection surface. For sort, never use `req.query.sort` directly. Check it against an allowlist like `new Set(["createdAt","price","name"])`, default to a known field, and map order to `1` or `-1` — the full allowlisted search construction is detailed in [how do you implement search](./how-do-you-implement-search.md). Apply the sort before `skip/limit` and make sure the index supports the sort plus the filter. When using cursor pagination, the sort field must be the same field you encode in the cursor, otherwise the range filter and the order disagree and you will skip or repeat rows.

## 6. The Traps — What Goes Wrong in Production

**Leaving `limit` uncapped.** The naive `Number(req.query.limit) || 10` with no `Math.min` lets anyone request a million rows. The Node process allocates a huge array, JSON serialization blocks the event loop, and other requests starve. Always cap, and prefer `Number.parseInt` with an explicit `Number.isFinite` check so `"10abc"` does not slip through.

**Trusting query strings as numbers.** `req.query.page` is a string. `skip = (page - 1) * limit` with string `page` can coerce to `NaN` and produce `skip = NaN`, which Mongoose may ignore or throw. Parse, validate, then compute.

**Sorting by user-supplied field names.** `Product.find().sort(req.query.sort)` is a NoSQL injection surface and a performance trap. An attacker can sort by a large unindexed array field and force an in-memory sort of millions of documents. Validate against an allowlist and default to an indexed field.

**Sorting without a unique tie-breaker.** Pagination that sorts by `price` or `createdAt` alone will show duplicates and gaps when values tie and new rows are inserted between page fetches. Always add `_id` as the final sort key and index the compound `{ sortField, _id }`.

**Forgetting the index.** Pagination without an index on the sort field forces the database to sort all matched documents in memory before it can skip and limit. It feels fast with 1,000 rows and collapses at 100,000. Create the index and verify with `explain()`.

**Paying for `countDocuments` on every feed request.** Counting a multi-million row collection for every scroll event turns a fast cursor query into a slow one. For infinite scroll return only `hasMore`/`nextCursor`; reserve exact totals for admin views or cache the count.

**Using offset for deep infinite scroll.** An `offset + limit` feed where `offset` grows with every scroll makes each successive page slower. Users who scroll far will hit timeouts. Switch to cursor once depth or insertion rate matters.

**Exposing raw database values as the cursor.** Returning `{ lastId: "664..." }` and building the next query from it lets clients forge arbitrary queries. Encode the cursor as an opaque `base64url(JSON)` and validate it server-side, returning 400 on decode failure without leaking internals.

**Forgetting lean or projection.** Returning full Mongoose documents with `__v` and populated fields you do not need bloats the response and slows serialization. Use `.select` or `.project` and `.lean()` for read-only pages.

## 7. Compare With Related Concepts

**Offset vs cursor.** Offset is random-access and intuitive for "page 47 of 52" but cost grows with depth and it is unstable under concurrent inserts. Cursor is constant-time and stable but only supports next/previous. Rule: numbered pages with bounded depth use offset, deep or live feeds use cursor.

**Server-side pagination vs client-side pagination.** Client-side fetches everything once and slices in memory. It is fine for under a few hundred rows that rarely change but wastes bandwidth and cannot handle large collections. Server-side asks the database for one window at a time. Rule: if the collection can outgrow a single response or needs fresh data, paginate on the server.

**Pagination vs search with filtering.** Filtering narrows the collection before you paginate, but pagination still decides the window and the sort. A search endpoint is paginated search: you filter, then sort deterministically, then paginate — see [how do you implement search](./how-do-you-implement-search.md) for the full pipeline instead of duplicating it here. Rule: apply the same filter to the count query and the data query, and never count without the filter.

**Keyset (cursor) vs `LIMIT/OFFSET` in SQL.** They are the same tradeoff in different dialects. `OFFSET 100000 LIMIT 20` must walk 100,000 rows, `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 20` seeks the index. Rule: use keyset for deep SQL pagination just like cursor for Mongo.

**Pagination envelope vs `Link` header.** REST APIs sometimes return pagination in `Link: <.../products?page=3>; rel="next"` headers per RFC 5988, while others return a JSON envelope with `pagination` or `nextCursor`. Headers keep the body clean, envelopes are easier for SPAs. Rule: pick one shape and standardize across all paginated endpoints so clients can reuse one helper.

## 8. 🧠 The Memory Hook

Mile markers force the ranger to walk every mile from the start; a GPS breadcrumb lets the ranger jump straight to your last boot print. Cap how many photos anyone can carry, bolt down the trail order with an `_id` spike, and stop surveying the whole mountain just to say there is more trail ahead.
