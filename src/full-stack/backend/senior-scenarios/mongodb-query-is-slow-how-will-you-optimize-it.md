# MongoDB query is slow. How will you optimize it

## 1. The Real-World Problem — When You Actually Hit This

Your app shipped and felt fast for months. Then one user with two years of order history opens their account page and the spinner runs for eight seconds. In development you had 100 test orders. In production you have two million. The query is the same — `db.orders.find({ userId: "abc", status: "shipped" }).sort({ createdAt: -1 })` — but the database is suddenly reading every single document to find the twenty that match.

This is when you learn MongoDB does not warn you when a query is slow. It just does what you asked. If you asked without the right index, it scans. If you asked for a sort without an index that supports it, it loads everything into memory and sorts there. If you put that query inside a loop over 50 users, you just ran 50 slow queries instead of one fast aggregation. The page feels broken, the database CPU spikes, and other users start seeing timeouts too. You cannot fix this by adding more RAM or adding Redis. You have to see what the query is actually doing and give MongoDB a fast path to the data.

## 2. The Analogy — Make the Mechanic Obvious

Think of a library with no card catalog.

The collection is the shelves. Each document is a book lying on the shelf in the order it was returned, not sorted by author or title. A query is a request at the desk: "find all books by this author, published last month, sorted by date."

Without an index, the librarian has to walk every aisle, pick up every book, check if it matches, make a pile, then sort the pile on a table. That is a collection scan. If there are two million books, that walk takes forever.

An index is a separate card catalog drawer. One drawer is sorted by author. Each card says "author X — aisle 4, shelf 2" so the librarian can go straight to the right books without walking the whole library. That is an index scan. A compound index is a drawer sorted by two things at once — author first, then date inside each author — so the request "author X sorted by date" is already in order and needs no table sorting. A covered query is when the card itself already has all the information you asked for, so you do not even need to walk to the shelf.

But every new drawer costs something. Someone has to file a new card every time a book arrives or moves. That is why too many indexes slow down writes. And if you ask for "all books sorted by date" but your drawer is sorted by author-then-date, that drawer does not help — you are using the wrong drawer. That is the leftmost prefix rule.

Profiling is the library's security camera that only records visits that took longer than 100 milliseconds, so you can see which requests made the librarian walk the whole building. And the N+1 problem is sending your friend back to the desk 50 times — "now get author 1, now get author 2" — instead of handing over one list of 50 authors at once.

## 3. The Full Explanation — How It Actually Works

MongoDB stores documents on disk and keeps indexes as separate B-tree structures. Think of a B-tree as a super-sorted list that lets MongoDB jump to the right range in a few hops instead of scanning. When you run a query, the query planner looks at your filter, sort, and available indexes and picks what it thinks is the cheapest plan. You cannot guess that plan. You have to ask MongoDB with `explain()`.

Running `db.collection.find(query).explain("executionStats")` tells you what actually happened, not what you hoped. The two words to read first are the winning stage name. `COLLSCAN` means it read every document in the collection. `IXSCAN` means it used an index. If you see `COLLSCAN` on a collection with millions of documents, you found your problem. The stats also show `nReturned` versus `totalDocsExamined` and `totalKeysExamined`. A good query has those numbers close together. If `nReturned` is 20 but `totalDocsExamined` is 2,000,000, you scanned the whole thing to return 20. If `totalKeysExamined` is much larger than `nReturned`, your index is not selective enough.

An index makes reads fast but makes writes slower. Every insert, update, or delete that touches an indexed field must also update the B-tree. Each index also takes RAM. MongoDB tries to keep the working set of indexes in memory. If you create ten indexes and only use two, you are paying write and memory cost for eight useless structures. Create indexes you can prove you need from slow query logs, not indexes you guess you might need.

MongoDB has several index types for different jobs. A single-field index on `{ userId: 1 }` speeds up equality on that field. A compound index like `{ userId: 1, createdAt: -1 }` speeds up queries that filter on `userId` and sort or filter on `createdAt`. This compound index can also serve a query on just `userId` alone, but it cannot serve a query on just `createdAt` alone. That is the leftmost prefix rule — MongoDB can only use a compound index from left to right without gaps. So `{ userId: 1, status: 1, createdAt: -1 }` helps `{ userId, status }` and `{ userId, status, createdAt }` but not `{ status, createdAt }` without `userId`. For sort-heavy queries, the index direction matters. If your query does `.sort({ createdAt: -1 })`, the index should have `createdAt: -1` in that direction or MongoDB will still need an in-memory sort, which you will see as a `SORT` stage and which fails if it exceeds 32MB.

A covered query is the fastest possible read. If your index contains every field your query needs, MongoDB never fetches the document at all. You see this as `totalDocsExamined: 0` and `IXSCAN` only, with a `PROJECTION_COVERED` stage. This happens when you project only indexed fields: `db.orders.find({ userId: "abc" }, { _id: 0, userId: 1, createdAt: 1 })` with an index on `{ userId: 1, createdAt: 1 }` can be covered. As soon as you request a field outside the index, it must fetch documents.

The ESR rule keeps compound indexes efficient for real queries. Put Equality fields first, then Sort fields, then Range fields. For `find({ userId: "abc", status: { $gte: "a" } }).sort({ createdAt: -1 })`, an index of `{ userId: 1, createdAt: -1, status: 1 }` is better than putting the range field `status` before the sort, because MongoDB can keep the sort order intact.

Two more specialized indexes show up a lot. A multikey index is automatically created when you index an array field — it indexes each array element separately — which is how queries like `tags: "mongodb"` stay fast. A text index is for word search with `$text`, and a TTL index automatically deletes documents after a time, which is useful for sessions or temporary logs but not for normal business data.

When you do not know which queries are slow, turn on profiling. `db.setProfilingLevel(1, { slowms: 100 })` tells MongoDB to write every operation slower than 100ms into `system.profile`. You can also watch the logs, run `db.currentOp()` for long-running ops, or use `mongostat` and Atlas Performance Advisor. Profiling shows the real query shape, how many times it runs, and whether it was a `COLLSCAN`. Never leave profiling at level 2 in production — it logs everything and adds overhead.

The last common killer is N+1. This is not a missing index. It is a code shape problem. You fetch 50 orders, then loop and call `User.findById(order.userId)` 50 times, or with Mongoose you `populate` inside a loop. Each of those 50 queries may even be indexed and still be slow because you pay 50 round trips. The fix is to fetch in bulk — one `$in` query, one `$lookup` aggregation, or one `populate` on the whole array — so the database does one fast indexed batch instead of many small hits.

MongoDB indexes also interact with the rest of your system. Writes become slower, so do not index every field on a write-heavy collection. Unique and sparse indexes enforce correctness, which matters for auth and idempotency. Building an index on a huge collection blocks unless you build it in the background or with a rolling build on replica sets. And a query that is fast on a healthy replica can still be slow if your read preference sends it to a lagging secondary.

## 4. See It In Practice — Real Code or Queries

Start by proving the problem. Never guess. Run explain first.

```javascript
// A query that feels slow in production
db.orders.find({ userId: "abc", status: "shipped" })
  .sort({ createdAt: -1 })
  .explain("executionStats")
```

Look at the output shape and learn to read it:

```javascript
// What a bad plan looks like — full collection scan
{
  winningPlan: { stage: "SORT", inputStage: { stage: "COLLSCAN" } },
  executionStats: {
    nReturned: 20,
    totalDocsExamined: 2000000,  // read everything to return 20
    totalKeysExamined: 0,        // used no index
    executionTimeMillis: 3200
  }
}

// What a good plan looks like — index scan, no extra sort
{
  winningPlan: { stage: "FETCH", inputStage: { stage: "IXSCAN", indexName: "userId_1_createdAt_-1" } },
  executionStats: {
    nReturned: 20,
    totalDocsExamined: 20,       // only touched what it returned
    totalKeysExamined: 20,
    executionTimeMillis: 4
  }
}
```

Fix it by creating the right index. Match the filter and the sort.

```javascript
// Single-field index — good for simple equality
db.orders.createIndex({ userId: 1 })
// Helps: db.orders.find({ userId: "abc" })

// Compound index — equality first, sort second (ESR in action)
db.orders.createIndex({ userId: 1, createdAt: -1 })
// Helps: db.orders.find({ userId: "abc" }).sort({ createdAt: -1 })
// Helps: db.orders.find({ userId: "abc", status: "shipped" }) partially, but status is not in the index

// Compound index that covers filter + sort together
db.orders.createIndex({ userId: 1, status: 1, createdAt: -1 })
// Helps: db.orders.find({ userId: "abc", status: "shipped" }).sort({ createdAt: -1 })
// Also helps: db.orders.find({ userId: "abc" })  — leftmost prefix
// Does NOT help: db.orders.find({ status: "shipped" })  — missing leftmost field userId

// Covered query — project only fields in the index, avoid fetching documents
db.orders.createIndex({ userId: 1, createdAt: -1 })
db.orders.find(
  { userId: "abc" },
  { _id: 0, userId: 1, createdAt: 1 }
).explain("executionStats")
// Ideal: totalDocsExamined: 0 because data came from index alone

// Verify your index actually gets used
db.orders.find({ userId: "abc" }).sort({ createdAt: -1 }).explain("executionStats")
```

Turn on profiling to find slow queries you did not know about.

```javascript
// Log every operation slower than 100ms
db.setProfilingLevel(1, { slowms: 100 })

// See recent slow operations — check op, millis, planSummary
db.system.profile.find().sort({ ts: -1 }).limit(5).pretty()

// What's running right now (kill or investigate long ops)
db.currentOp({ "active": true, "secs_running": { $gt: 3 } })

// Turn profiling back off when you are done investigating
db.setProfilingLevel(0)
```

Fix N+1 at the code level. The database can have perfect indexes and still be slow if your code fans out.

```javascript
// ❌ N+1 — 1 query for orders + N queries for users (even if indexed, 50 round trips)
const orders = await Order.find({ status: "shipped" }).limit(50)
for (const order of orders) {
  order.user = await User.findById(order.userId) // 50 separate queries
}

// ✅ One bulk fetch with $in — 2 queries total
const orders2 = await Order.find({ status: "shipped" }).limit(50).lean()
const userIds = [...new Set(orders2.map(o => o.userId))]
const users = await User.find({ _id: { $in: userIds } }).lean()
const userById = new Map(users.map(u => [String(u._id), u]))
for (const order of orders2) order.user = userById.get(String(order.userId))

// ✅ Or let the database join once with aggregation
const ordersWithUsers = await Order.aggregate([
  { $match: { status: "shipped" } },
  { $sort: { createdAt: -1 } },
  { $limit: 50 },
  { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
  { $unwind: "$user" }
])

// ✅ With Mongoose, populate the whole array at once, not inside a loop
const ordersPopulated = await Order.find({ status: "shipped" })
  .sort({ createdAt: -1 })
  .limit(50)
  .populate("userId") // single batched query, not N
```

Other index types you will reach for when the shape calls for it:

```javascript
// Multikey — indexing an array field (MongoDB creates this automatically)
db.posts.createIndex({ tags: 1 })
// Helps: db.posts.find({ tags: "mongodb" })

// Text search — for word-based search, not exact match
db.articles.createIndex({ title: "text", body: "text" })
db.articles.find({ $text: { $search: "query optimization" } })

// TTL — auto-delete after a time (for sessions, caches, temp tokens)
db.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 })

// Unique + sparse — enforce correctness without indexing nulls
db.users.createIndex({ email: 1 }, { unique: true, sparse: true })
```

## 5. Interview Questions — All of Them, Done Properly

**Q: My MongoDB query is slow. Where do you start?**

I do not guess at an index. I measure first. I run `.explain("executionStats")` on the exact query shape from production and read whether it did a `COLLSCAN` or `IXSCAN`, plus `totalDocsExamined` versus `nReturned` and `executionTimeMillis`. Then I check profiling — `system.profile` or logs with `slowms` — to see how often the slow shape runs and whether it is one bad query or an N+1 loop. Only after that do I add or change an index, and I re-run explain to prove the plan is now `IXSCAN` and `totalDocsExamined` is close to `nReturned`.

**Q: What is the difference between COLLSCAN and IXSCAN?**

`COLLSCAN` means MongoDB read every document in the collection and checked each one against your filter. It is like searching without the card catalog. `IXSCAN` means it walked the B-tree index to jump straight to matching keys. If the query returns 20 documents but `totalDocsExamined` is two million and the stage is `COLLSCAN`, that is the root cause. An `IXSCAN` is not automatically fast though — if the index is not selective and `totalKeysExamined` is still huge, you need a better index or a more selective filter.

**Q: What makes a good compound index? How does the leftmost prefix rule work?**

A good compound index matches how your queries filter and sort. MongoDB can only use a compound index from the left without skipping fields. So `{ userId: 1, status: 1, createdAt: -1 }` can serve a query on `{ userId }` and a query on `{ userId, status }` and a query on `{ userId, status }` sorted by `createdAt`. It cannot serve a query that filters only on `{ status }` or only on `{ createdAt }` because the leftmost field `userId` is missing. That is the trap most people hit — they build one big index and assume it helps every combination. It does not. Build compound indexes for your real query shapes, order fields by ESR — equality fields first, sort next, range last — and let queries that share the same left prefix reuse the same index.

**Q: What is a covered query and why does it matter?**

A covered query is when every field the query needs — both the filter and the projection — is already inside the index. MongoDB never fetches the document off disk. You see `totalDocsExamined: 0` and the index alone satisfies the read. It is the fastest read because it avoids document fetch and can often live entirely in memory. But it only works if you do not project extra fields. As soon as you ask for a field outside the index, MongoDB must fetch, and you lose the covered benefit.

**Q: Do indexes have downsides? When would you not add one?**

Yes. Every index speeds up reads and slows down writes, because each insert, update, and delete must also update the index. Each index also uses RAM and disk. If you add five indexes on a write-heavy collection to speed up five rare admin queries, you are slowing every user write for queries that barely matter. I would not add an index for a query that runs once a day on a small collection, for a field with very low selectivity where the index barely helps, or when the query can be removed entirely by fixing an N+1 loop. I also would not add an index blindly on a huge production collection without building it in the background or rolling across replica set members, because a foreground build can block operations.

**Q: What is the N+1 problem and how do you fix it in MongoDB?**

N+1 is when your code runs one query to get N items, then loops and runs another query for each item — so 1 + N queries. Classic example is fetching 50 orders then calling `User.findById` 50 times. Each individual query might be indexed and fast, but 50 round trips are still slow and hammer the database. The fix is to batch: collect all the IDs and do one `find({ _id: { $in: ids } })`, or use a single aggregation with `$lookup`, or with Mongoose call `.populate()` once on the whole result set. One indexed bulk query is almost always faster than many indexed single queries.

**Q: How do you find slow queries in production without explain?**

With profiling and observability. `db.setProfilingLevel(1, { slowms: 100 })` writes slow ops to `system.profile` with the query shape, time, and `planSummary` showing `COLLSCAN` or `IXSCAN`. The MongoDB logs also flag slow queries. `db.currentOp()` shows queries currently running past a threshold. In Atlas there is the Performance Advisor and slow query analyzer that actually suggest indexes. These tools catch the queries you did not think to explain — the cron job, the admin dashboard, the edge case that only happens for power users.

**Q: What is the ESR rule?**

Equality, Sort, Range — the order that makes a compound index most useful. Put fields you filter with exact equality first, then the field you sort by, then fields you filter with a range operator like `$gt`, `$lt`, `$in`. This lets MongoDB use the index for both the filter and the sort without an in-memory `SORT` stage. If you put the range field before the sort field, MongoDB can filter but has to sort in memory, which is slow and can fail with "Sort exceeded memory limit."

## 6. The Traps — What Goes Wrong in Production

The most common trap is indexing the wrong thing because you never ran explain. You assume `{ status: 1 }` helps, but your query is `find({ userId: "abc", status: "shipped" }).sort({ createdAt: -1 })` and that index does not cover the sort or the equality. You still get a `SORT` stage or a `COLLSCAN`. The fix is to always explain before and after the index change and verify `IXSCAN` and low `totalDocsExamined`.

Another trap is creating too many indexes. One team adds an index for every slow query they see, ends up with fifteen indexes on one collection, and now writes are slow and the working set no longer fits in RAM. Only add indexes that serve a frequent, slow, proven query shape. Drop unused ones — check `db.collection.aggregate([{ $indexStats: {} }])` to see which indexes are actually hit.

The leftmost prefix misunderstanding bites hard. You build `{ status: 1, userId: 1, createdAt: -1 }` and wonder why a query on just `{ userId: "abc" }` still does a `COLLSCAN`. It is because `userId` is not the leftmost field. Reorder to `{ userId: 1, status: 1, createdAt: -1 }` if your queries always include `userId`.

In-memory sorts silently kill performance. If your index is `{ userId: 1, status: 1 }` but you sort by `createdAt`, MongoDB fetches matching docs and sorts them in memory. You see a `SORT` stage with high `executionTimeMillis`. When the sort hits 32MB it throws. Include the sort field in the index in the right direction.

The regex trap is subtle. A query like `{ name: /^abc/ }` can use an index, but `{ name: /abc/ }` or `{ name: /abc/i }` with a leading wildcard or case-insensitive without a case-insensitive index usually cannot and falls back to `COLLSCAN`. For text search use a text index and `$text`.

Hiding behind `.lean()` or blaming Mongoose misses the root cause. Mongoose `populate` is convenient but it runs extra queries under the hood. If you populate inside a loop you get N+1 even though each populate is indexed. Also, Mongoose uses strict schemas but MongoDB itself is schemaless — a field you assume is a string might be a missing field or a number in some documents, which makes the index not match as expected. Validate shapes.

Finally, fixing the query but not the load pattern. You add a perfect index but the code still runs the query 200 times per request because of a loop. Or you add the index in the foreground on a primary with millions of documents and block writes for minutes. Build indexes in the background, test on a staging copy of production data size, and fix both the index and the N+1 code shape.

## 7. Compare With Related Concepts

**MongoDB query optimization vs SQL query optimization**

Both care about the same core idea — avoid scanning all data, use an index, and prove it with explain. The mechanics differ. SQL has a strict schema, a cost-based optimizer that can use composite B-tree indexes, statistics you can update with `ANALYZE`, and tools like `EXPLAIN ANALYZE` that actually run the query and show row counts. MongoDB is document-oriented with flexible schemas, multikey indexes for arrays, text indexes for word search, and TTL indexes for auto-expiry that SQL does not have. MongoDB's compound leftmost rule feels familiar if you know SQL composite indexes — both have it — but MongoDB also has the in-memory 32MB sort limit that is more visible than in Postgres or MySQL. The bigger difference is data modeling. In SQL you normalize and join, so optimization often means fixing joins and adding indexes. In MongoDB you choose between embedding and referencing, so some slow queries are fixed not by an index but by embedding the data you always fetch together so you avoid the join entirely. Rule of thumb: if the question is about schema, joins, or strict transactions, think SQL. If it is about document shape, array fields, or scaling with sharding, think MongoDB.

**Adding an index vs adding a cache**

An index makes the actual read fast. A cache hides the slow read after the first hit but does not fix it. If you cache a `COLLSCAN` that takes three seconds, the first user still waits three seconds and every cache miss does too. Rule: fix the index first, then add caching for truly hot reads that are already fast.

**Index vs shard**

An index makes one machine find data faster. Sharding splits data across many machines. Sharding a collection that just needed one compound index is massive overengineering. Rule: if `explain` shows `COLLSCAN` and an index fixes it, you have an indexing problem, not a scaling problem.

**Profiling vs logging**

Profiling with `system.profile` and slow query logs both surface slow operations. Profiling gives structured query shapes and stats you can aggregate. Logs are easier to grep but less structured. Use both — profiling for discovery, logs for alerting.

## 8. 🧠 The Memory Hook

If explain says COLLSCAN, the database walked the whole library to find one book. Give it a card catalog that matches how you search and how you sort, prove the plan is now IXSCAN with only the books you asked for, and make sure you are not walking back to the desk fifty times to fetch one friend at a time.
