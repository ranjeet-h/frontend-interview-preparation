# What is limit

## 1. Why This Exists — The Problem First

Your activity feed API calls `db.activities.find({ userId })` with no size cap. A power user with 50,000 events gets all of them in one response. The Node process allocates hundreds of megabytes, the JSON serializer blocks the event loop, and the mobile client crashes trying to parse a 40 MB payload. PagerDuty fires because p99 latency jumped from 80 ms to 12 seconds — not because MongoDB is slow, but because nobody told the query how many documents to return.

`limit()` is the simplest guardrail in MongoDB: cap how many documents a read returns. It does not replace good schema design or indexes, but without it every list endpoint is a potential denial-of-service against your own database.

## 2. The Analogy — Make It Obvious

Picture a library where a patron asks for "every book about JavaScript."

Without a limit, the librarian wheels out a cart with 3,000 volumes. The patron cannot carry them, the checkout line freezes, and the reading room is blocked.

With a limit of 20, the librarian brings 20 books and says, "Here are the first 20 — tell me if you want the next batch."

`limit(n)` is that cap. MongoDB still finds matching documents (using indexes when available), but it stops handing results to your application after `n` documents. The database does not magically know you only wanted a page — you must say so explicitly.

## 3. How It Actually Works — The Full Explanation

`limit()` is a cursor method in MongoDB. You attach it to `find()`, `aggregate()` pipelines (via `$limit`), or other operations that return a cursor.

**On `find()`:**

```js
db.orders.find({ status: "open" }).limit(25)
```

MongoDB applies the filter, walks the result set (ideally via an index), and stops after 25 documents. The cursor may still exist server-side, but your driver only pulls 25 unless you iterate further.

**Default behavior:** There is no implicit limit. `find()` without `limit()` returns every matching document until the cursor is exhausted or you hit BSON/document size limits (16 MB per document, practical batch limits on wire protocol).

**Interaction with `sort()`:** Order matters in the API chain but MongoDB optimizes the pipeline. You almost always want:

```js
db.products.find({ category: "shoes" }).sort({ price: 1 }).limit(10)
```

so you get the cheapest 10 shoes, not 10 arbitrary shoes from an unordered scan.

**In aggregation:** `$limit` is a pipeline stage. It can appear after `$match`, `$sort`, `$group`, etc. Putting `$limit` early does not always reduce work — if it comes before `$sort`, you may limit before sorting and get wrong results. Typical pattern: `$match` → `$sort` → `$limit`.

**`limit(0)`:** In the shell, `limit(0)` is equivalent to no limit (legacy behavior). Do not use it in application code expecting "return nothing."

**Hard limits:** MongoDB drivers and server enforce maximum batch sizes. A single `limit(1000000)` still tries to return a million docs — memory and network become your problem. Application-level caps (e.g. max page size 100) are still required.

**Not a security boundary alone:** `limit(10)` on `find({})` still scans if there is no selective filter. Limit caps output size, not work done.

## 4. Real Code — See It Working

Run in `mongosh` against a `shop` database:

```js
use shop

// Seed sample orders
db.orders.deleteMany({})
db.orders.insertMany([
  { _id: 1, customer: "alice", total: 42 },
  { _id: 2, customer: "bob", total: 18 },
  { _id: 3, customer: "carol", total: 99 },
  { _id: 4, customer: "dave", total: 7 },
  { _id: 5, customer: "erin", total: 55 }
])

// Top 3 orders by total
db.orders.find().sort({ total: -1 }).limit(3)

// API-style: never trust client page size
const pageSize = Math.min(Number(req.query.limit) || 20, 100)
db.orders.find({ status: "open" }).sort({ createdAt: -1 }).limit(pageSize)

// Aggregation: cheapest products in a category
db.products.aggregate([
  { $match: { category: "shoes", inStock: true } },
  { $sort: { price: 1 } },
  { $limit: 10 },
  { $project: { name: 1, price: 1 } }
])
```

**With `skip()` for offset pagination** (see [What is skip](./what-is-skip.md)):

```js
const page = 2
const pageSize = 20
db.orders.find({ status: "open" })
  .sort({ createdAt: -1 })
  .skip((page - 1) * pageSize)
  .limit(pageSize)
```

Offset pagination uses both; deep pages make `skip` expensive even when `limit` is small.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does `limit()` do in MongoDB?**

It caps the number of documents returned by a cursor. On `find()`, you chain `.limit(n)` after filters and sort. In aggregation, `$limit` is a pipeline stage. It controls output size, not which documents match — matching is still driven by the query filter and indexes.

**Q: Does `limit()` make queries faster?**

Sometimes, but not automatically. If MongoDB can use an index to satisfy `sort` + `limit` (e.g. index on `{ createdAt: -1 }` with `sort({ createdAt: -1 }).limit(20)`), it may stop after 20 index entries without scanning the whole collection. If there is no useful index, it may still examine many documents before finding enough matches. Limit reduces data transferred and application memory; index design determines scan cost.

**Q: What is a safe default page size for APIs?**

Common choices: 20–50 for UI lists, with a hard server max (often 100). Reject or clamp client-provided limits. Document the max in your API contract so frontend teams do not request `limit=10000`.

**Q: `limit()` vs `$limit` in aggregation — same thing?**

Same cap on document count flowing through the pipeline at that stage. Placement matters: `$limit` before `$sort` gives different results than after. `$limit` after `$group` limits groups, not input rows.

**Q: Can you use `limit()` without `sort()`?**

Yes, but order is undefined unless you sort. "First 20" without sort means "20 arbitrary matching docs," which breaks pagination consistency if data changes between requests.

## 6. The Traps — What Goes Wrong

**Trap: No limit on list endpoints**

Every `GET /users` that runs `User.find()` without limit will eventually OOM or timeout. Fix: always `.limit()` plus index on sort field.

**Trap: Trusting client `limit`**

`?limit=999999` bypasses UI intent. Clamp: `Math.min(parsed, MAX_PAGE_SIZE)`.

**Trap: `limit` without `sort` in pagination**

Page 2 may repeat or skip rows when inserts happen between requests. Fix: stable sort key (timestamp + `_id`).

**Trap: Assuming `limit` fixes slow queries**

A `find({ unindexedField: "x" }).limit(1)` can still COLLSCAN millions of docs. Fix: index the filter fields; use `explain("executionStats")`.

**Trap: `$limit` before `$sort` in aggregation**

You sort the wrong subset. Always `$match` → `$sort` → `$limit` when you want "top N by field."

## 7. Compare With Related Concepts

| Concept | What it does | When to use |
|---|---|---|
| **`limit()`** | Caps documents returned | Every list/read API |
| **`skip()`** | Skips first N results | Shallow offset pagination only |
| **`$slice`** | Limits array elements inside a document | Embedded arrays (e.g. last 5 comments) |
| **Cursor / keyset pagination** | `find({ _id: { $gt: lastId } }).limit(20)` | Deep lists, live feeds |
| **BSON 16 MB doc limit** | Max document size | Different problem — embedding vs referencing |

Rule: **`limit` controls how many; indexes and pagination strategy control how hard the database works.**

## 8. 🧠 The Memory Hook — What Sticks

`limit()` is the bouncer at the door: MongoDB can match thousands of documents, but only N leave the club. Without it, your API ships the whole crowd; with it but no index, the bouncer still checks every ID in the city before letting N through — so pair limit with sort and indexes, especially on production list endpoints.
