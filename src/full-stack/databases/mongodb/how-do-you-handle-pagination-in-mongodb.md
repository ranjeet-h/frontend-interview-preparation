# How do you handle pagination in MongoDB

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce site launches with a product catalog endpoint using `skip((page - 1) * 20).limit(20)`. With 5,000 products, every page loads in under 50 ms. Six months later, the catalog grows to 200,000 products. Page 1 is still fast, but a customer browsing page 500 waits 4 seconds. Your database CPU spikes because MongoDB must scan and discard 9,980 documents just to return the next 20. Meanwhile, new products are being added, so page 2 shows different items when the customer refreshes. The pagination that "worked in dev" is now slow and inconsistent.

This is the moment you realize offset pagination doesn't scale. You need a different strategy.

## 2. The Analogy — Make the Mechanic Obvious

Imagine a library with books numbered 1 to 100,000 on a single long shelf.

**Offset pagination (`skip` + `limit`)** is like a librarian who starts at book 1, counts each book aloud, and stops counting after reaching the requested starting point. For page 5,000 (starting at book 100,000), the librarian counts 1, 2, 3... all the way to 99,999 before finally picking up the next 20 books. The counting takes longer the deeper you go, even though you only want 20 books.

**Cursor pagination (keyset)** is like a bookmark. After reading page 1, you place a bookmark at the last book you saw. For page 2, the librarian walks directly to the bookmark and picks up the next 20 books. No counting from the start. Page 100 takes the same time as page 2.

The tradeoff: with a bookmark, you can't jump directly to page 500 — you have to flip through each page to get there. With counting, you can say "start at 100,000" instantly, but the counting cost grows with the number.

## 3. The Full Explanation — How It Actually Works

Pagination in MongoDB is about how you ask for "the next N items" from a large result set. There are three main strategies, each with different performance and consistency characteristics.

**Offset pagination (`skip` + `limit`)**

This is the classic page-number approach. You request page `p` with size `s` using:

```js
db.products.find()
  .sort({ createdAt: -1, _id: -1 })
  .skip((p - 1) * s)
  .limit(s)
```

MongoDB applies the filter, sorts, then walks through and discards the first `(p - 1) * s` documents before returning `s` results. The cost is proportional to the offset, not the page size. Page 10,000 with `limit(20)` still requires skipping ~199,980 documents. Even with an index on the sort key, MongoDB must traverse index entries to reach the skip position.

Offset pagination also has consistency problems. If a new document is inserted at the front of the sorted order between page requests, all subsequent offsets shift. A user might see the same item on page 2 and page 3, or miss an item entirely.

**Cursor (keyset) pagination**

Instead of counting from the start, you remember the last item you saw and ask for "items after this one." For a sort on `{ createdAt: -1, _id: -1 }`, you store the last `createdAt` and `_id` values and query:

```js
db.products.find({
  $or: [
    { createdAt: { $lt: lastCreatedAt } },
    { createdAt: lastCreatedAt, _id: { $lt: lastId } }
  ]
})
  .sort({ createdAt: -1, _id: -1 })
  .limit(20)
```

The `$or` handles the compound sort correctly: items with an earlier `createdAt` come first, and for equal timestamps, items with a smaller `_id` come next. MongoDB uses the index to jump directly to the position after the last seen values. The cost is O(limit) regardless of which "page" you're on — page 1 and page 10,000 take the same time.

Cursor pagination is stable under inserts. New items at the front don't shift the cursor position because you're always querying "after this specific value," not "at position N."

The downside: you lose random page access. You can't jump to page 50 directly — you must page through sequentially or build a separate index-based navigation. Cursors also require a stable, indexed sort order with a unique tie-breaker (usually `_id`).

**Range-based pagination on `_id`**

For simple cases where `_id` order is acceptable, you can paginate on `_id` alone:

```js
// First page
db.products.find().sort({ _id: 1 }).limit(20)

// Next page
db.products.find({ _id: { $gt: lastId } }).sort({ _id: 1 }).limit(20)
```

This is a simple form of cursor pagination. It's fast and consistent, but `_id` order is not meaningful to users — it's roughly insertion order but not guaranteed. Use this for internal batch processing, not user-facing lists.

**API contract implications**

Offset pagination exposes a simple numeric page parameter to the frontend. Cursor pagination exposes an opaque token (base64-encoded cursor) that the frontend stores and sends back. The cursor contains the last seen sort values and must be validated server-side — never trust client-constructed cursors.

**Index requirements**

All pagination strategies require an index on the sort fields. For cursor pagination, the index must include all fields in the sort predicate to support the range query. A compound index like `{ createdAt: -1, _id: -1 }` serves both the sort and the cursor query.

**Choosing the right strategy**

Use offset pagination for small, stable datasets (admin tables, rarely-changed reference data, logs under ~100k rows). Use cursor pagination for user-facing lists with potential for deep navigation (activity feeds, product catalogs, notification lists). Use range-based `_id` pagination for batch jobs and internal processing where order doesn't matter to humans.

## 4. See It In Practice — Real Code or Queries

These examples use `mongosh` syntax against a `products` collection with fields `_id`, `name`, `price`, `createdAt`, and `category`.

```js
use shop

// Seed data
db.products.deleteMany({})
db.products.insertMany(
  Array.from({ length: 1000 }, (_, i) => ({
    name: `Product ${i + 1}`,
    price: (i % 100) + 10,
    category: i % 3 === 0 ? 'electronics' : 'clothing',
    createdAt: new Date(Date.now() - i * 1000)
  }))
)

// Create index for cursor pagination
db.products.createIndex({ createdAt: -1, _id: -1 })
```

**Offset pagination — simple but doesn't scale deep**

```js
// Page 5, page size 20
const page = 5
const pageSize = 20

db.products.find({ category: 'electronics' })
  .sort({ createdAt: -1, _id: -1 })
  .skip((page - 1) * pageSize)
  .limit(pageSize)
```

This works fine for early pages. Check the cost with `explain("executionStats")` — deep pages show large `docsExamined` even when `nReturned` is small.

**Cursor pagination — stable at any depth**

```js
// First page request
const firstPage = db.products.find({ category: 'electronics' })
  .sort({ createdAt: -1, _id: -1 })
  .limit(20)
  .toArray()

// Extract cursor values for next page
const lastItem = firstPage[firstPage.length - 1]
const lastCreatedAt = lastItem.createdAt
const lastId = lastItem._id

// Next page using cursor
const nextPage = db.products.find({
  category: 'electronics',
  $or: [
    { createdAt: { $lt: lastCreatedAt } },
    { createdAt: lastCreatedAt, _id: { $lt: lastId } }
  ]
})
  .sort({ createdAt: -1, _id: -1 })
  .limit(20)
  .toArray()
```

The `$or` handles the compound sort: it finds items either with an earlier timestamp, or the same timestamp but a smaller `_id`. This preserves the exact order.

**API-style cursor encoding**

In a real API, encode the cursor as an opaque token:

```js
// Server: encode cursor
const cursor = Buffer.from(JSON.stringify({
  createdAt: lastItem.createdAt.toISOString(),
  _id: lastItem._id.toString()
})).toString('base64')

// Server: decode and validate cursor
const decoded = JSON.parse(Buffer.from(clientCursor, 'base64').toString())
const lastCreatedAt = new Date(decoded.createdAt)
const lastId = new ObjectId(decoded._id)

// Apply validation: check dates are reasonable, IDs exist, etc.
// Then use in query as shown above
```

Never let clients construct the query object directly — they could request arbitrary ranges or inject malicious filters.

**Previous page navigation**

For bidirectional cursor pagination, store both the last and first seen values:

```js
// Going backward: query "before" the first item on current page
const firstItem = currentPage[0]
const prevPage = db.products.find({
  category: 'electronics',
  $or: [
    { createdAt: { $gt: firstItem.createdAt } },
    { createdAt: firstItem.createdAt, _id: { $gt: firstItem._id } }
  ]
})
  .sort({ createdAt: 1, _id: 1 })  // ascending for "before"
  .limit(20)
  .toArray()

// Reverse to match descending order
prevPage.reverse()
```

**Filtering with cursors**

When you add filters, they must be part of the index prefix for best performance:

```js
// Index: { category: 1, createdAt: -1, _id: -1 }
db.products.createIndex({ category: 1, createdAt: -1, _id: -1 })

// Query with filter + cursor
db.products.find({
  category: 'electronics',
  $or: [
    { createdAt: { $lt: lastCreatedAt } },
    { createdAt: lastCreatedAt, _id: { $lt: lastId } }
  ]
})
  .sort({ createdAt: -1, _id: -1 })
  .limit(20)
```

The filter on `category` uses the index prefix, then the cursor continues from the position within that filtered subset.

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you implement pagination in MongoDB?**

The basic approach is `skip((page - 1) * pageSize).limit(pageSize)` for offset pagination. This works for small datasets but degrades at deep offsets because MongoDB must traverse and discard the skipped documents. For large, user-facing lists, use cursor (keyset) pagination: store the last seen sort key values and query for documents after that position using a range filter. This gives consistent O(limit) performance regardless of depth and is stable under inserts.

**Q: Why is `skip()` slow for large offsets?**

`skip(n)` tells MongoDB to discard the first `n` matching documents. Even with an index on the sort key, MongoDB must walk through `n` index entries to reach the skip position. The work is proportional to the offset, not the page size. A request for page 10,000 with `limit(20)` still skips ~199,980 entries. Cursor pagination avoids this by jumping directly to the position after the last seen value.

**Q: What is cursor or keyset pagination?**

Cursor pagination uses the last seen sort key values as a bookmark. Instead of saying "skip 100 items and give me 20," you say "give me 20 items after this specific timestamp and ID." The query uses a range filter like `{ createdAt: { $lt: lastValue } }` or a compound `$or` for multi-field sorts. Each page takes the same time to fetch because MongoDB uses the index to seek directly to the cursor position.

**Q: When should you use offset vs cursor pagination?**

Use offset pagination for small, stable datasets where users rarely go beyond page 10–20: admin tables, reference data, logs under ~100k rows. Use cursor pagination for large, changing lists where users might navigate deeply: product catalogs, activity feeds, notification lists, comment threads. Cursor pagination is also necessary when data changes frequently during a user's session, to avoid duplicates or missing items.

**Q: How do you handle consistency when data changes between page requests?**

Offset pagination is inconsistent under inserts and deletes. If a new item is inserted at the front of the sorted order, all subsequent offsets shift. Page 2 might show an item that was also on page 1, or skip an item entirely. Cursor pagination is stable because it references absolute values (timestamp + ID) rather than relative positions. New items at the front don't affect the cursor's "after this point" semantics.

**Q: What index do you need for cursor pagination?**

You need a compound index that includes all sort fields in the same order. For a sort on `{ createdAt: -1, _id: -1 }`, create `{ createdAt: -1, _id: -1 }`. If you also filter by a field like `category`, include it as a prefix: `{ category: 1, createdAt: -1, _id: -1 }`. The index lets MongoDB seek directly to the cursor position within the filtered subset.

**Q: How do you encode cursors in an API?**

Encode the cursor values as an opaque base64 token, not as separate query parameters. For example, base64-encode a JSON object containing the last `createdAt` and `_id`. Decode server-side, validate the values are reasonable and exist in your data, then construct the range query. Never let clients construct the filter object directly — this prevents injection and arbitrary range requests.

**Q: Can you jump to arbitrary pages with cursor pagination?**

Not directly. Cursor pagination is inherently sequential — you can go to the next page, previous page, or restart from the beginning, but you can't jump to page 50 without traversing pages 1–49 first. If you need random page access (e.g., a paginated table with a page number input), you either use offset pagination (with its performance limits) or build a separate navigation structure like pre-computed page boundaries.

**Q: How do you handle sorting with multiple fields in cursor pagination?**

Use a compound `$or` filter that respects the sort order. For `{ createdAt: -1, _id: -1 }`, the cursor query is:

```js
$or: [
  { createdAt: { $lt: lastCreatedAt } },
  { createdAt: lastCreatedAt, _id: { $lt: lastId } }
]
```

This says: "items with an earlier timestamp, OR the same timestamp but a smaller ID." The logic must match the sort direction exactly. Test thoroughly — wrong direction in the `$or` clause causes incorrect results or infinite loops.

**Q: What happens if you don't include a unique tie-breaker in the sort?**

If multiple documents have the same sort key value (e.g., the same `createdAt`), MongoDB doesn't guarantee their relative order. Without `_id` or another unique field in the sort, pages can have inconsistent ordering, and cursor pagination may skip or duplicate items at the boundaries. Always include a unique field like `_id` as the final sort field.

## 6. The Traps — What Goes Wrong in Production

**Using offset pagination on user-facing catalogs**

A product catalog with 500,000 items using `skip()` becomes unusably slow around page 5,000. Users abandoning slow pages isn't just UX — it's lost revenue. Fix: switch to cursor pagination for all user-facing lists, reserving offset only for small admin tables.

**Sorting by timestamp without a unique tie-breaker**

If your sort is only `{ createdAt: -1 }` and multiple documents share the same timestamp, cursor pagination boundaries are ambiguous. You might see the same item on two pages or miss one entirely. Fix: always sort by `{ timestamp: -1, _id: -1 }` or another unique field.

**Trusting client-constructed cursors**

If the API accepts separate `lastCreatedAt` and `lastId` parameters, a client can send arbitrary values to probe your data or request huge ranges. Fix: encode cursors as an opaque token, validate server-side, and reject malformed or out-of-bounds values.

**Missing indexes on sort fields**

Cursor pagination without an index on the sort fields forces a collection scan for each page. This is worse than offset pagination because you lose the index benefit while adding complexity. Fix: create compound indexes matching your common filter + sort patterns.

**Using cursor pagination for random page access**

If your UI has a "go to page" input but the backend uses cursors, you can't fulfill the request without sequentially fetching all previous pages. Either change the UI to sequential navigation only, or use offset pagination with a documented depth limit.

**Forgetting to reverse direction for "previous page"**

When implementing backward navigation, the range filter and sort direction must flip. A common mistake is using the same "less than" logic for both directions, which returns the wrong items. Fix: for "previous page" in a descending sort, query "greater than" the first item's values, sort ascending, then reverse the results.

**Infinite scroll with offset pagination**

Mobile apps that increment `skip` on each "load more" call eventually hit performance cliffs as the offset grows. The UX degrades gradually — page 10 is fine, page 50 is slow, page 200 times out. Fix: use cursor pagination for infinite scroll so each request costs the same.

**Caching paginated responses without versioning**

If you cache `GET /products?page=5` and use offset pagination, inserts shift the cache contents. A user might see stale or inconsistent data. With cursor pagination, caches are more stable because the cursor references absolute values. Fix: include cursor or a data version in cache keys.

## 7. Compare With Related Concepts

| Approach | Performance | Consistency | Random Access | Use Case |
|----------|-------------|-------------|---------------|----------|
| **Offset (`skip` + `limit`)** | O(offset) — degrades at depth | Duplicates/skips under writes | Yes — jump to any page | Small admin tables, stable data |
| **Cursor (keyset)** | O(limit) — constant time | Stable under inserts/deletes | No — sequential only | Large catalogs, feeds, user lists |
| **Range on `_id`** | O(limit) with index | Stable, but meaningless order | No — sequential only | Batch jobs, internal processing |
| **Aggregation `$facet` for totals** | Extra cost per request | N/A | N/A | When you need total count + page |

**Rule:** Offset for small, stable, admin tools. Cursor for large, changing, user-facing lists. Range on `_id` for backend batch jobs where order doesn't matter to humans.

**Related but different:**

- **`$slice`** limits elements within an embedded array (e.g., last 5 comments on a post). Pagination operates across documents, not within a single document.
- **`limit()` alone** is just a cap on results. Without `skip()` or a cursor, it only gives you the first page.
- **Server-side rendering of page numbers** is natural with offset pagination but requires pre-computation or boundary queries with cursor pagination.

## 8. 🧠 The Memory Hook

Offset pagination is counting every person in line from the front — correct, but page 8,000 means counting 399,950 people before serving the next 20. Cursor pagination is a bookmark: walk directly to where you left off, grab the next batch, and place a new bookmark. If users can scroll forever, give them a bookmark, not a bigger offset.
