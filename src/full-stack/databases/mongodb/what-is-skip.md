# What is skip

## 1. Why This Exists — The Problem First

Your admin dashboard paginates audit logs with `skip((page - 1) * 50).limit(50)`. Page 1 is instant. Page 200 is fine. An investigator opens page 8,000 — `skip(399950)` — and the query runs for 45 seconds because MongoDB must walk past 399,950 documents before returning the next 50. CPU spikes, IOPS spike, and other queries queue behind a pagination pattern that "worked in development" with 500 rows.

`skip(n)` tells MongoDB to discard the first `n` matching documents. It is simple offset pagination. It does not scale to deep offsets. Understanding `skip` means knowing when it is acceptable and when you must switch to cursor-based pagination.

## 2. The Analogy — Make It Obvious

Imagine a concert queue numbered 1 to 50,000. Security asks "start serving at person 40,000."

With `skip`, security literally counts people from the front: 1, 2, 3 … 39,999, then serves the next 50. The line does not move faster for late pages — counting from the start is always required.

Cursor pagination is like a sign at position 39,999 saying "next ticket starts here." You walk directly to that spot. No recount from the entrance.

`skip` is the recount-from-the-entrance approach. Correct, but linear cost in the offset.

## 3. How It Actually Works — The Full Explanation

`skip()` is a cursor method chained after `find()` (and available in aggregation as `$skip`).

```js
db.logs.find({ level: "error" })
  .sort({ ts: -1 })
  .skip(100)
  .limit(50)
```

MongoDB applies the filter, sorts (if requested), then:

1. Advances through the result set, counting documents.
2. Discards the first 100.
3. Returns the next 50 to the client.

**Cost:** For offset `O`, MongoDB typically does O work proportional to `O + limit` in the worst case — it must reach the skip position. Deep pages are slow even with an index on the sort key, because index scans still traverse entries until the offset is consumed.

**With indexes:** An index on `{ ts: -1 }` helps `sort({ ts: -1 })` avoid in-memory sorts, but `skip(399950)` on that index still skips 399,950 index entries. Better than collection scan, but still linear in offset.

**Aggregation `$skip`:** Same mechanic at a pipeline stage. Often paired with `$limit` for offset pagination in analytics UIs.

**No `skip` on `update`/`delete`:** Bulk operations use filters, not skip. Pagination patterns apply to reads.

**Consistency:** Between page requests, inserts and deletes shift offsets. Page 2 after a delete may skip a row the user never saw or show a duplicate. Stable sort + cursor keys fix this.

## 4. Real Code — See It Working

```js
use shop

db.products.deleteMany({})
db.products.insertMany(
  Array.from({ length: 120 }, (_, i) => ({
    sku: `SKU-${i + 1}`,
    price: (i % 10) + 1
  }))
)

// Page 3, page size 25 → skip 50
const page = 3
const pageSize = 25
db.products.find()
  .sort({ sku: 1 })
  .skip((page - 1) * pageSize)
  .limit(pageSize)

// See the cost in explain
db.products.find().sort({ sku: 1 }).skip(50).limit(25).explain("executionStats")
// nReturned: 25, but totalDocsExamined / keysExamined reflects skip work

// Aggregation offset pagination
db.products.aggregate([
  { $sort: { sku: 1 } },
  { $skip: 50 },
  { $limit: 25 }
])
```

**Better pattern for deep lists — cursor on `_id` or sort key:**

```js
// First page
const first = db.products.find().sort({ _id: 1 }).limit(25).toArray()
const lastId = first[first.length - 1]._id

// Next page — no skip
db.products.find({ _id: { $gt: lastId } })
  .sort({ _id: 1 })
  .limit(25)
```

See [How do you handle pagination in MongoDB](./how-do-you-handle-pagination-in-mongodb.md) for full cursor/keyset patterns.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does `skip()` do?**

It skips the first N documents in the query result after filter and sort are applied, then returns the remainder through the cursor (usually combined with `limit`). It implements offset-based pagination: page `p` with size `s` → `skip((p-1)*s).limit(s)`.

**Q: Why is `skip` slow on large offsets?**

MongoDB must traverse and discard N documents (or index entries) before returning results. Cost grows with offset, not with page size alone. Page 10,000 with `limit 20` still skips ~199,980 rows.

**Q: When is `skip` acceptable?**

Small datasets, admin tools with shallow navigation, ETL batches where you control concurrency, or prototypes. Also acceptable when users rarely go beyond page 10–20 and collections stay under hundreds of thousands of rows with proper indexes.

**Q: What is the alternative?**

Cursor (keyset) pagination: store the last seen sort key (`_id`, `createdAt`, compound key) and query `where key > lastKey order by key limit n`. Each page is O(limit) regardless of depth.

**Q: Does `skip` work with sharded clusters?**

Yes, but mongos must merge sorted results from shards; large skips on unsharded sort keys can be especially painful. Shard key aligned with sort key helps.

## 6. The Traps — What Goes Wrong

**Trap: Offset pagination on infinite scroll feeds**

Mobile feeds with "load more" using increasing `skip` degrade as users scroll. Fix: cursor on `(createdAt, _id)`.

**Trap: `skip` without `sort`**

Undefined order makes pages inconsistent. Always sort by a stable, indexed field.

**Trap: Using `skip` for bulk processing**

Processing 10M docs via `skip(0)`, `skip(1000)`, … is slower than range queries on `_id` or `$gte` on a monotonic key.

**Trap: Assuming index eliminates skip cost**

Indexes avoid sorting in memory but not the need to walk past skipped entries.

**Trap: Page number from client without bounds**

`page=1000000` triggers huge skip. Cap page number or switch to cursors.

## 7. Compare With Related Concepts

| Concept | Deep page cost | Consistency under writes |
|---|---|---|
| **`skip` + `limit`** | O(offset) | Duplicates/skips possible |
| **Cursor / keyset** | O(limit) | Stable if sort key is unique/monotonic |
| **`limit` only** | N/A (first page) | First page only |
| **Range on `_id`** | O(limit) with index | Good for batch jobs |

Rule: **`skip` for shallow admin UIs; cursors for user-facing deep lists.**

## 8. 🧠 The Memory Hook — What Sticks

`skip` is counting every person in line from the front before serving the next batch — correct, but page 8,000 means counting 399,950 people first. If users can scroll forever, give them a bookmark (cursor), not a bigger offset.
