# What is MongoDB Indexing

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce app launched three months ago. Everything was fast with a few thousand orders. Now you have 500,000 orders. A customer clicks "View My Orders" and the page takes 12 seconds to load. The API is timing out. You check the query—it's just finding orders by `userId`. The database is doing a collection scan, reading every single document to find the ones that belong to that user. This is the moment you realize you needed an index on `userId`.

## 2. The Analogy — Make the Mechanic Obvious

Think of a MongoDB collection like a library with 500,000 books scattered randomly on shelves. When someone asks for "all books by author J.K. Rowling," you have to walk through every single book, checking the author name on each one. That's a collection scan—slow and painful.

Now imagine you've created an index card catalog. It's a separate set of cards, sorted alphabetically by author. Each card has the author name and the shelf location of every book they wrote. When someone asks for J.K. Rowling, you flip straight to the "R" section in the catalog, grab all the cards for that author, and go directly to those shelf locations. You never look at books by other authors. That's an index—sorted, separate data that points to the real data.

## 3. The Full Explanation — How It Actually Works

MongoDB stores indexes as B-tree data structures separate from your documents. A B-tree is a balanced tree where each node holds multiple keys and pointers to child nodes. The tree stays balanced as data grows, so lookups are always O(log n) instead of O(n).

When you create an index on a field like `userId`, MongoDB builds a sorted structure where every unique `userId` value points to all documents that have that value. The index is stored in its own files on disk, separate from the collection data.

When you run a query like `db.orders.find({ userId: "user123" })`, MongoDB checks if an index exists on `userId`. If it does, it traverses the B-tree to find that value, retrieves the document identifiers (called `_id` values), and then fetches only those specific documents from the collection. Instead of scanning 500,000 documents, it might touch only 15.

MongoDB automatically creates an index on the `_id` field of every collection. That's why you can quickly find a document by its `_id` without creating your own index.

You can create compound indexes on multiple fields, like `{ userId: 1, createdAt: -1 }`. The order matters—this index supports queries that filter by `userId` alone, or by both `userId` and `createdAt`, but not queries that filter only by `createdAt`. The `1` means ascending, `-1` means descending.

Indexes consume disk space and RAM. Every index you add is another data structure MongoDB must maintain. When you insert, update, or delete a document, MongoDB has to update every index that includes the changed fields. More indexes mean slower writes.

MongoDB has several index types: single field, compound, multikey (for arrays), text (for string search), geospatial (for location data), hashed (for sharding), and wildcard (for all fields). Each serves a specific query pattern.

The query planner decides whether to use an index. Sometimes a collection scan is actually faster—like when you need most of the documents anyway, or when the index would require so many random disk reads that a sequential scan wins. MongoDB tracks query statistics and can change its plan over time.

## 4. See It In Practice — Real Code or Queries

First, let's see the slow path without an index:

```javascript
// Start with a collection of orders
db.orders.insertMany([
  { userId: "user1", total: 100, createdAt: new Date("2024-01-01") },
  { userId: "user2", total: 200, createdAt: new Date("2024-01-02") },
  { userId: "user1", total: 150, createdAt: new Date("2024-01-03") },
  // ... imagine 500,000 more documents
])

// This query does a collection scan - slow with large data
db.orders.find({ userId: "user1" })

// Check the execution plan to see what happened
db.orders.find({ userId: "user1" }).explain("executionStats")
// Look for "stage": "COLLSCAN" - that means it scanned everything
```

Now create an index and see the difference:

```javascript
// Create a single-field index on userId
db.orders.createIndex({ userId: 1 })
// This builds a B-tree sorted by userId values

// Run the same query again
db.orders.find({ userId: "user1" })

// Check the execution plan
db.orders.find({ userId: "user1" }).explain("executionStats")
// Now you'll see "stage": "IXSCAN" - index scan, much faster
// And "docsExamined" will be much smaller than total documents
```

Create a compound index for a common query pattern:

```javascript
// Your app frequently queries orders by user and date range
db.orders.find({
  userId: "user1",
  createdAt: { $gte: new Date("2024-01-01"), $lte: new Date("2024-01-31") }
})

// Create a compound index that supports this
db.orders.createIndex({ userId: 1, createdAt: -1 })
// The -1 on createdAt means descending order, useful for "newest first" queries

// This index supports:
// - { userId: "user1" } ✓
// - { userId: "user1", createdAt: { ... } } ✓
// - { createdAt: { ... } } ✗ (userId must come first)
```

Multikey index for array fields:

```javascript
// Documents with tags as an array
db.products.insertMany([
  { name: "Laptop", tags: ["electronics", "computers"] },
  { name: "Phone", tags: ["electronics", "mobile"] },
  { name: "Desk", tags: ["furniture"] }
])

// Create a multikey index - MongoDB indexes each array element separately
db.products.createIndex({ tags: 1 })

// Now this is fast
db.products.find({ tags: "electronics" })
```

Covered queries that don't need to fetch the full document:

```javascript
// If your index includes all the fields you need, MongoDB can answer from the index alone
db.orders.createIndex({ userId: 1, status: 1, total: 1 })

// This query is "covered" - all fields are in the index
db.orders.find(
  { userId: "user1", status: "completed" },
  { _id: 0, status: 1, total: 1 } // projection only uses indexed fields
)
// Execution plan will show "stage": "IXSCAN" with no fetching stage
```

List all indexes on a collection:

```javascript
db.orders.getIndexes()
// Shows the default _id index plus any you created
```

Drop an index you no longer need:

```javascript
db.orders.dropIndex("userId_1")
// Or by index specification
db.orders.dropIndex({ userId: 1 })
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you decide which fields to index in MongoDB?**

Look at your actual query patterns. Use the profiler or check slow queries to see what fields you filter on, sort by, or use in aggregations. Index fields that appear in WHERE clauses, sort operations, and join conditions. Don't index everything—each index slows down writes and uses memory. Start with the queries that run most frequently or are the slowest.

**Q: What's the difference between a single-field index and a compound index?**

A single-field index indexes one field, like `{ userId: 1 }`. A compound index indexes multiple fields in a specific order, like `{ userId: 1, createdAt: -1 }`. The order in a compound index matters—it can support queries that use the prefix fields. A compound index on `{ userId, createdAt }` supports queries filtering by `userId` alone, or both `userId` and `createdAt`, but not queries filtering only by `createdAt`.

**Q: Why does the ESR rule matter for compound indexes?**

ESR stands for Equality, Sort, Range. When designing a compound index, put equality fields first (exact matches), then sort fields (for ordering), then range fields (for `$gt`, `$lt`, etc.). This order lets MongoDB use the index most efficiently. If you put a range field before a sort field, MongoDB can't use the index for sorting and has to do an in-memory sort, which is slower and has memory limits.

**Q: What is a covered query and why is it useful?**

A covered query is one where all the fields needed (both in the query filter and the projection) are part of an index. MongoDB can answer the query entirely from the index without looking up the actual documents in the collection. This is faster because it avoids random disk I/O to fetch documents. It's especially useful when your documents are large but you only need a few fields.

**Q: How do indexes affect write performance?**

Every insert, update, or delete operation must update all indexes that include the affected fields. If a document has 5 indexes and you update a field that's indexed in 3 of them, MongoDB has to modify 3 index structures. More indexes mean slower writes. The write penalty is why you don't index everything—you index the fields that give you the biggest read performance boost for the write cost you can accept.

**Q: What is a multikey index?**

A multikey index is created on an array field. MongoDB indexes each element of the array separately, so you can efficiently query for any value that appears in the array. If you have `{ tags: ["red", "large"] }` and index `tags`, MongoDB creates index entries for both "red" and "large" pointing to that document. There's a limit—you can't have more than one multikey index in a compound index, and you can't index arrays of arrays in some cases.

**Q: When would you use a text index instead of a regular index?**

Use a text index when you need to search within string content, like finding documents that contain specific words regardless of exact position. Regular indexes match exact values or prefixes. Text indexes support stemming, stop words, and ranking by relevance. They're useful for search features, blog content search, or product descriptions. They're heavier than regular indexes, so use them only when you actually need text search capabilities.

**Q: How does MongoDB's query planner choose whether to use an index?**

The query planner evaluates multiple possible execution plans. It considers which indexes are available, the selectivity of the index (how many documents match), the expected cost of index lookups versus collection scans, and statistics from previous query executions. Sometimes it chooses a collection scan because retrieving random documents via an index would be more expensive than reading sequentially. The planner can re-evaluate and change plans based on actual performance.

## 6. The Traps — What Goes Wrong in Production

**Indexing fields that aren't selective enough**

If you index a field like `status` that only has three values (pending, completed, cancelled), the index isn't very useful. A query for `{ status: "completed" }` still returns a third of your documents. The planner might ignore the index and do a collection scan anyway. You wasted disk space and write performance for an index that rarely gets used. Index fields with high cardinality—many unique values—like IDs, timestamps, or email addresses.

**Creating too many indexes**

Every index slows down writes. If you have 20 indexes on a collection, every insert updates 20 data structures. Every update that touches indexed fields updates multiple indexes. In high-write systems, this becomes a bottleneck. Delete indexes you're not actually using. Check with `db.collection.getIndexes()` and use the profiler to identify unused indexes.

**Ignoring the ESR rule in compound indexes**

If you create `{ status: 1, userId: 1, createdAt: 1 }` but your query sorts by `createdAt` and filters by `userId`, MongoDB can't use the index for sorting. It will use the index for the filter but then do an in-memory sort, which fails if the result set exceeds 32MB of memory. Order your compound indexes to match your query patterns: equality fields first, then sort fields, then range fields.

**Forgetting that array fields create multikey indexes**

When you index an array field, it becomes a multikey index automatically. This means each array element gets its own index entry. If you have large arrays with hundreds of elements, the index becomes huge. Every update that modifies the array requires updating hundreds of index entries. Be careful indexing array fields that grow large.

**Not indexing foreign keys for lookups**

If you reference users in your orders collection via `userId`, and you frequently query `orders.find({ userId: someId })`, you need an index on `userId`. Without it, every user request to view their orders does a full collection scan. This is one of the most common performance problems in MongoDB applications—missing indexes on foreign key-like fields.

**Using `$or` without proper indexes**

Queries with `$or` can use multiple indexes, but only if each part of the `$or` has its own index. If you query `{ $or: [{ status: "pending" }, { priority: "high" }] }`, you need indexes on both `status` and `priority` for it to be efficient. Without those indexes, MongoDB does multiple collection scans or falls back to a slow plan.

**Assuming indexes automatically make queries fast**

An index on `{ userId: 1 }` doesn't help with `{ userId: { $ne: "user1" } }` (not equal) or regex patterns that don't start with a prefix. These operations often can't use indexes efficiently. Also, indexes don't help with queries that return most of the collection—sometimes a collection scan is faster than hopping through the index to fetch nearly every document anyway.

**Not monitoring index size and memory pressure**

Indexes live in RAM for best performance. If your total index size exceeds available RAM, MongoDB starts paging to disk and performance collapses. Monitor index size with `db.collection.stats()` and ensure your indexes fit in memory. If they don't, consider removing unused indexes or upgrading RAM.

**Missing indexes on sort operations**

If you frequently query and sort, like `db.orders.find({ userId: "user1" }).sort({ createdAt: -1 })`, you need a compound index that includes the sort field. Without it, MongoDB fetches the matching documents and then sorts them in memory. This fails if the result set is large (over 32MB by default). Include sort fields in your compound index to avoid in-memory sorts.

## 7. Compare With Related Concepts

**Indexing vs. sharding**

Indexing optimizes queries within a single collection on a single server. Sharding distributes data across multiple servers to scale horizontally. You still need indexes within each shard. Sharding chooses a shard key, and that shard key must be indexed. Indexing solves query performance; sharding solves data volume and write throughput.

**MongoDB indexes vs. SQL indexes**

Both use B-tree structures and serve the same purpose—fast lookups. MongoDB indexes are on fields within documents; SQL indexes are on columns. MongoDB automatically indexes `_id`; SQL typically requires explicit primary key indexes. MongoDB has multikey indexes for arrays; SQL typically requires join tables or special array types. MongoDB compound indexes support the ESR rule similar to SQL composite indexes.

**Single-field vs. compound vs. multikey indexes**

Single-field indexes one field. Compound indexes multiple fields in order, supporting queries on prefixes of that order. Multikey indexes array elements, creating one index entry per array element. Use single-field for simple lookups, compound for common multi-field query patterns, and multikey when you need to search within arrays.

**Covered query vs. regular query**

A covered query fetches all needed data from the index alone, never touching the collection documents. A regular query uses the index to find documents but then fetches the full documents. Covered queries are faster because they avoid random document lookups. They require that all fields in both the query and projection are part of the index.

**Hashed index vs. regular index**

A hashed index computes a hash of the field value and indexes the hash. It's used for sharding to ensure even distribution. It supports equality queries but not range queries or sorting. Regular indexes support equality, range, and sort operations. Use hashed indexes only for shard keys where distribution matters more than query flexibility.

## 8. 🧠 The Memory Hook

Index is a sorted catalog separate from your data—flip to the right page, grab the locations, fetch only what you need.
