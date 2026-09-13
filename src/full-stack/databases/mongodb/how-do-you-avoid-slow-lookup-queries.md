# How do you avoid slow lookup queries

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce app launched two months ago. Users could search products by category, price range, and brand. Everything was fast with 10,000 products. Then you hit 100,000 products, and the search endpoint started timing out. Users complained. You checked the logs and found MongoDB was taking 3-5 seconds for a simple `find()` query that used to return in 50ms. The database was doing a full collection scan for every search. This is the moment you realize that without the right indexes, MongoDB has to read every single document to find the ones that match your query. At scale, that breaks your app.

## 2. The Analogy — Make the Mechanic Obvious

Imagine a library with 100,000 books, all randomly shelved. Someone asks you to find all books by "George Orwell" published after 1945. Without an index, you walk to shelf 1, pick up each book, check the author and year, put it back if it doesn't match, and repeat for all 100,000 books. This takes hours.

Now imagine the library has a card catalog sorted by author, with each card also listing the publication year. You walk to the "O" section, find Orwell, and scan only his cards to find the ones after 1945. This takes seconds.

MongoDB without indexes is the first library. With indexes, it's the second. The index is a separate data structure, sorted in a specific order, that points to the actual documents. MongoDB can use it to skip documents that can't possibly match, instead of reading every single one.

## 3. The Full Explanation — How It Actually Works

MongoDB stores documents in collections on disk. When you run a query without an index, MongoDB performs a **collection scan**: it reads every document in the collection and checks whether it matches your query filter. This is O(n) where n is the number of documents. At 10,000 documents, that's fast. At 10 million, it's unusable.

An **index** is a separate data structure that holds a subset of the document data in sorted order. Each index entry has two parts: the indexed field value(s) and a pointer to the full document. Because the index is sorted, MongoDB can use binary search (O(log n)) instead of linear scan. More importantly, MongoDB can skip entire ranges of documents that can't match your query.

There are several types of indexes in MongoDB:

- **Single-field index**: Index on one field, like `{ userId: 1 }`. Fast for equality queries on that field.
- **Compound index**: Index on multiple fields, like `{ userId: 1, createdAt: -1 }`. The order matters. This index supports queries that match on userId, or userId + createdAt, but not createdAt alone.
- **Multikey index**: Automatically created when you index an array field. Each array element gets its own index entry.
- **Text index**: For full-text search on string content.
- **Geospatial index**: For location-based queries.
- **Hashed index**: Uses a hash of the field value, good for equality but not range queries.
- **Wildcard index**: Indexes all fields in a document (use with caution — it's large).

The **ESR rule** is the key to designing compound indexes that actually get used:

1. **E**quality first: Put fields you query with exact matches (`userId: 123`) at the beginning of the index.
2. **S**ort next: Put fields you sort by (`sort({ createdAt: -1 })`) after equality fields.
3. **R**ange last: Put fields you query with ranges (`price: { $gt: 50 }`) at the end.

MongoDB can use a compound index efficiently if your query follows this pattern. If you have `{ userId: 1, createdAt: -1, price: 1 }` and you query `{ userId: 123, price: { $gt: 50 } }` while sorting by `createdAt`, MongoDB can still use the index for the equality and sort, but will have to scan for the range.

A **covered query** is when all the fields you need are in the index itself. MongoDB can answer the query without ever looking at the actual documents. This is the fastest possible query because it avoids disk I/O for the full documents. You create covered queries by including all projected fields in your index.

The **explain plan** is how you see what MongoDB is actually doing. Run `db.collection.find(query).explain("executionStats")` and it tells you whether it used an index, how many documents it examined, how long it took, and whether it did a collection scan. If you see `stage: "COLLSCAN"`, you have a slow query. If you see `stage: "IXSCAN"` with a low `docsExamined` count, your index is working.

Indexes are not free. They take up disk space and RAM. Every write operation (insert, update, delete) has to update all relevant indexes, which slows down writes. The more indexes you have, the slower your writes become. You need to balance read performance against write performance.

## 4. See It In Practice — Real Code or Queries

```javascript
// A slow query without an index
// This scans every user document to find ones with the specified email
db.users.find({ email: "user@example.com" })

// Create a single-field index on email
db.users.createIndex({ email: 1 })

// Now the same query uses the index — O(log n) instead of O(n)
db.users.find({ email: "user@example.com" })

// A compound index following ESR rule
// Query: find orders for userId 123, sort by createdAt descending, filter by price > 50
db.orders.createIndex({ userId: 1, createdAt: -1, price: 1 })

// This query uses the index efficiently
db.orders.find(
  { userId: 123, price: { $gt: 50 } }
).sort({ createdAt: -1 })

// A covered query — all fields in the index
db.users.createIndex({ email: 1, name: 1, status: 1 })

// This query never needs to read the full documents
db.users.find(
  { email: "user@example.com" },
  { _id: 0, name: 1, status: 1 }  // projection matches index fields
)

// Check what's actually happening with explain
db.users.find({ email: "user@example.com" }).explain("executionStats")

// Output shows:
// - stage: "IXSCAN" (good) vs "COLLSCAN" (bad)
// - indexName: which index was used
// - docsExamined: how many documents were read
// - executionTimeMillis: actual query time

// Multikey index on an array field
db.products.createIndex({ tags: 1 })

// This finds products with any matching tag efficiently
db.products.find({ tags: "electronics" })

// Partial index — only index documents that match a filter
// Saves space and speeds up queries by excluding irrelevant documents
db.users.createIndex(
  { email: 1 },
  { partialFilterExpression: { status: "active" } }
)

// This uses the partial index
db.users.find({ email: "user@example.com", status: "active" })

// This does NOT use the partial index (falls back to collection scan)
db.users.find({ email: "user@example.com", status: "inactive" })

// TTL index — automatically removes documents after a time
// Useful for sessions, logs, or temporary data
db.sessions.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 3600 }  // delete after 1 hour
)
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you identify slow queries in MongoDB?**

Use the database profiler or analyze slow logs. Enable profiling with `db.setProfilingLevel(1, { slowms: 100 })` to log queries taking longer than 100ms. Or check the `system.profile` collection for recorded operations. In production, you'd typically use MongoDB Atlas Performance Advisor or check the slow operation logs in the MongoDB logs. Once you identify a slow query, run `.explain("executionStats")` to see whether it's doing a collection scan, which index it's using (if any), and how many documents it's examining versus returning.

**Q: What's the difference between a single-field index and a compound index?**

A single-field index indexes one field, like `{ email: 1 }`. It's efficient for queries on that specific field. A compound index indexes multiple fields in a specific order, like `{ userId: 1, createdAt: -1 }`. The order matters because MongoDB can only use the index efficiently if your query respects the index order. A compound index on `{ a: 1, b: 1 }` supports queries on `a`, queries on `a` and `b`, and sorts on `b` when filtering on `a`. It does NOT support queries on `b` alone or sorts on `a` alone. The ESR rule helps you design compound indexes that match your actual query patterns.

**Q: When should you use a covered query?**

Use covered queries when you need extreme read performance and your query only accesses a few fields. A covered query satisfies the query entirely from the index without loading the full document from disk. To create one, include all the fields you query and all the fields you project in your index. Covered queries are especially valuable for frequent read operations in high-traffic applications. The tradeoff is that your indexes become larger, which increases memory usage and write overhead.

**Q: What happens to indexes when you update a document?**

Every update operation must update all indexes that include the modified fields. If you update a field that's indexed in five different indexes, MongoDB has to update all five. This is why indexes slow down writes. The more indexes you have, the slower your inserts and updates become. In high-write workloads, you need to be selective about which indexes you create. Sometimes you accept slower reads to keep writes fast, or you use strategies like building indexes in the background or during maintenance windows.

**Q: How do you decide which fields to index?**

Index fields that appear frequently in your query filters and sorts. Look at your actual query patterns using the database profiler or application logs. Follow the ESR rule for compound indexes: equality fields first, then sort fields, then range fields. Don't index everything — each index has a cost. Index fields that have high selectivity (many distinct values) rather than low selectivity (like boolean flags). Consider read-write ratio: if a collection is write-heavy, minimize indexes. If it's read-heavy, add more indexes to optimize reads.

**Q: What is a partial index and when would you use it?**

A partial index only indexes documents that match a specific filter expression. For example, you might index only active users: `{ email: 1 }` with `partialFilterExpression: { status: "active" }`. This saves disk space and RAM because the index doesn't include inactive users. It also speeds up queries that match the filter because the index is smaller. Use partial indexes when you frequently query a subset of documents based on some condition, like status, region, or a flag. Queries that don't include the filter condition won't use the partial index.

## 6. The Traps — What Goes Wrong in Production

**Indexing every field**: New developers often think "more indexes = faster queries" and create indexes on every field. This explodes storage usage, slows down every write, and can even make the database unusable due to memory pressure. Index strategically based on actual query patterns, not hypothetical ones.

**Ignoring the ESR rule**: Creating compound indexes in the wrong order means MongoDB won't use them efficiently. If you query `{ status: "active", createdAt: { $gt: date } }` and sort by `createdAt`, you need `{ status: 1, createdAt: 1 }`. With `{ createdAt: 1, status: 1 }`, MongoDB can't use the index for the sort efficiently. Always design compound indexes to match your query equality, sort, and range patterns.

**Forgetting to index array fields**: Array fields need multikey indexes, which MongoDB creates automatically. But if you don't explicitly create the index, queries on array fields do full collection scans. This is common with tags, categories, or any list field in documents.

**Not using explain in development**: Developers write queries and assume they're fast because the dataset is small. Then in production with millions of documents, the same queries collapse. Always run `.explain("executionStats")` on your queries during development, even with small datasets. It tells you whether an index would be used and helps you catch collection scans before they hit production.

**Overlooking write performance**: Adding indexes to fix slow reads can make writes so slow that the application times out on insert operations. Monitor write performance after adding indexes. In extreme cases, you might need to build indexes in the background or during off-peak hours.

**Not updating indexes when query patterns change**: Your application evolves. New queries appear, old ones disappear. But your indexes stay the same. Periodically review which indexes are actually being used (using `$indexStats`) and remove unused ones. Add new indexes for new query patterns. Stale indexes waste resources and can mislead future developers.

**Using `$or` without proper indexes**: Queries with `$or` can use indexes, but each branch of the `$or` needs its own index. If you have `db.find({ $or: [{ status: "active" }, { status: "pending" }] })`, you need an index on `status`. Without it, MongoDB scans the entire collection multiple times.

**Forgetting about sort operations**: Sorting without an index requires MongoDB to load all matching documents into memory and sort them. If the result set is large, this fails with an error. Always include sort fields in your indexes when sorting large result sets.

## 7. Compare With Related Concepts

**Indexing vs sharding**: Indexing optimizes queries within a single node or replica set. Sharding distributes data across multiple servers to scale horizontally. You use indexes to make individual queries fast; you use sharding when a single server can't handle the data volume or query load. Sharding requires a shard key, which is like a special index that determines how data is distributed.

**Covered queries vs projection**: Both reduce the amount of data returned, but they work differently. Projection limits which fields are returned from the document. A covered query doesn't even touch the document — it returns data directly from the index. Covered queries are faster but require careful index design. Projection is simpler but still requires reading the full document from disk (or cache).

**Compound indexes vs multiple single-field indexes**: MongoDB can use multiple single-field indexes for a query via index intersection, but this is usually slower than a well-designed compound index. A compound index encodes the relationship between fields in the index structure itself, so MongoDB can use it for filters, sorts, and range operations together. Multiple single-field indexes work independently and MongoDB has to merge results, which is more expensive.

**Partial indexes vs sparse indexes**: Both exclude some documents from the index, but differently. A partial index uses a filter expression to decide which documents to include. A sparse index only excludes documents that are missing the indexed field entirely. Partial indexes are more flexible because you can use any filter condition. Sparse indexes are a special case for missing fields.

**TTL indexes vs manual cleanup**: TTL indexes automatically expire documents based on a date field. Manual cleanup requires a background job to find and delete old documents. TTL indexes are simpler and guaranteed to run, but they have overhead (the index must be maintained). Manual cleanup gives you more control over when cleanup runs and can batch deletions, but requires code maintenance.

## 8. 🧠 The Memory Hook

**ESR Rule: Equality, Sort, Range — that's the order for compound indexes.**

Equality fields go first (exact matches), sort fields go next (how you order results), range fields go last (inequality filters). If your query doesn't follow this order, your index won't be used efficiently. Every time you design a compound index, think ESR.
