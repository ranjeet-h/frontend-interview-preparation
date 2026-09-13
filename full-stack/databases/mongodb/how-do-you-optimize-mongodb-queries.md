# How do you optimize MongoDB queries

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce app launched three months ago. Order history queries were instant in development with a few hundred documents. Now you have 500,000 orders and users are complaining that loading their past orders takes 5-8 seconds. You check the database logs and see your query is doing a full collection scan—MongoDB is reading every single document to find the ones matching the user's ID. The CPU on your database server spikes to 90% every time someone clicks "Order History." This is the moment you realize that MongoDB doesn't magically make queries fast. You have to design your queries and indexes to match how your application actually uses the data.

## 2. The Analogy — Make the Mechanic Obvious

Think of MongoDB like a warehouse with millions of boxes stored on shelves. If you ask a worker to "find all boxes that belong to customer 42," and the boxes are in random order, the worker has to walk through the entire warehouse checking every box one by one. That's a full collection scan—slow and painful.

Now imagine you give that worker a notebook that lists every box by customer ID, sorted alphabetically. The worker can flip straight to customer 42's section and grab only those boxes in seconds. That notebook is your index. The index takes up space (you have to store and maintain the notebook), but it makes lookups dramatically faster.

But here's the catch: if you have a different notebook for every possible search—customer ID, date, product type, shipping status—your workers spend all their time updating notebooks instead of actually moving boxes. Too many indexes slow down writes. Optimization is about choosing the right indexes for the queries you actually run, not indexing everything.

## 3. The Full Explanation — How It Actually Works

MongoDB query optimization comes down to three things: matching the right index, structuring the query to use that index effectively, and balancing read performance against write performance.

**Index matching:** When MongoDB receives a query, it looks at available indexes to see if any can satisfy the query. An index is a sorted data structure (typically a B-tree) that stores field values in order. If your query filters on a field that's indexed, MongoDB can jump directly to the matching values instead of scanning the whole collection. If you have a compound index on `{userId: 1, createdAt: -1}`, MongoDB can use it for queries that filter on userId alone, or on both userId and createdAt in that order. It cannot use that index efficiently for queries that filter only on createdAt or that filter on createdAt before userId—the index order matters.

**Query structure:** Even with an index, you can write queries that don't use it well. Using `$ne` (not equal), `$nin` (not in), regular expressions without anchors, or `$or` across different fields often forces MongoDB to scan multiple index ranges or fall back to a collection scan. The `$exists` operator is similarly expensive. Similarly, if you filter on an indexed field but then sort on a different unindexed field, MongoDB has to do an in-memory sort, which is slow and memory-intensive for large result sets.

**The covered query optimization:** If your query only needs fields that are present in the index itself, MongoDB never has to look at the actual documents. This is called a covered query. For example, if you have an index on `{userId: 1, status: 1}` and you query for those two fields only, MongoDB can answer the query entirely from the index. This is dramatically faster because it avoids disk I/O for the documents.

**Write performance trade-off:** Every index you add makes writes slower. When you insert, update, or delete a document, MongoDB has to update every index that includes the affected fields. A document with ten indexes is ten times more expensive to write than a document with one index. Optimization isn't about maximizing indexes—it's about indexing the queries that run frequently and are expensive without an index, while accepting that some queries will be slower to keep writes fast.

**Explain plans:** MongoDB provides the `explain()` method to show exactly how a query executes. It tells you whether the query used an index, which index it used, how many documents it examined, how long it took, and whether it did a collection scan. This is your diagnostic tool—you can't optimize what you can't measure.

**Sharding considerations:** In a sharded cluster, queries that include the shard key can be routed to the specific shard that holds the data. Queries without the shard key have to be broadcast to all shards (scatter-gather), which is much slower. Your indexing strategy must align with your sharding key for optimal performance.

## 4. See It In Practice — Real Code or Queries

```javascript
// Schema: orders collection with documents like:
// {
//   _id: ObjectId(...),
//   userId: "user123",
//   status: "completed",
//   total: 149.99,
//   createdAt: ISODate("2024-01-15T10:30:00Z"),
//   items: [...]
// }

// BAD: Full collection scan - no index on userId
db.orders.find({ userId: "user123" })
// This scans every document in the collection.

// GOOD: Create an index on the field you filter on
db.orders.createIndex({ userId: 1 })

// Now the same query uses the index
db.orders.find({ userId: "user123" })
// MongoDB jumps directly to user123's documents.

// Compound index for queries that filter on multiple fields
db.orders.createIndex({ userId: 1, createdAt: -1 })

// This query uses the compound index efficiently
db.orders.find({ userId: "user123", createdAt: { $gte: new Date("2024-01-01") } })
// MongoDB narrows by userId, then scans only that user's documents in date order.

// This query CANNOT use the compound index efficiently
db.orders.find({ createdAt: { $gte: new Date("2024-01-01") } })
// The index starts with userId, so filtering only on createdAt requires a scan.

// Covered query - all fields in the index
db.orders.find(
  { userId: "user123" },
  { _id: 0, userId: 1, status: 1 }  // projection uses only indexed fields
)
// If you have an index on {userId: 1, status: 1}, this never touches the documents.

// Explain a query to see the execution plan
db.orders.find({ userId: "user123" }).explain("executionStats")
// Look for:
// - "stage": "IXSCAN" (used index) vs "COLLSCAN" (full scan)
// - "docsExamined": how many documents were read
// - "executionTimeMillis": actual time taken

// Sorting with an index
db.orders.find({ userId: "user123" }).sort({ createdAt: -1 })
// If you have {userId: 1, createdAt: -1}, this uses the index for the sort.
// Without that index, MongoDB does an in-memory sort (slow for large results).

// Expensive operators that often cause collection scans
db.orders.find({ status: { $ne: "cancelled" } })  // $ne is hard to index efficiently
db.orders.find({ $or: [{ status: "pending" }, { total: { $gt: 100 } }] })  // $or across different fields
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you decide which fields to index in MongoDB?**

Index the fields that appear frequently in your query filters and that significantly benefit from indexed lookups. Look at your slow query logs first—those are your actual bottlenecks. For each slow query, identify the equality filters (fields you match exactly with `userId: value`) and put those first in a compound index. Then add range filters and sort fields to the index in the order they appear in your query. Don't index fields just because they exist—every index slows down writes. Focus on the read-heavy, frequently-executed queries where the performance difference matters.

**Q: What is a covered query in MongoDB and why is it faster?**

A covered query is one where all the fields needed to satisfy the query are present in the index itself. MongoDB can answer the query without ever loading the full documents from disk—it reads only the index. This is faster because indexes are typically smaller and more cache-friendly than the full documents, and it avoids the random disk I/O of fetching each document. To achieve a covered query, create an index that includes all the fields you filter on and all the fields you project in your output, then use a projection that excludes `_id` and any non-indexed fields.

**Q: Why does the order of fields in a compound index matter?**

MongoDB can use a compound index for queries that filter on the leading fields of the index. If you have an index on `{userId: 1, status: 1, createdAt: -1}`, it can efficiently serve queries that filter on `userId` alone, `userId` and `status`, or all three fields in that order. It cannot efficiently serve queries that filter only on `status` or `createdAt`, or that filter on `createdAt` before `userId`. The index is sorted first by userId, then by status within each userId, then by createdAt within each status. A query that doesn't specify the earlier fields can't navigate that sorted structure efficiently.

**Q: How do you use explain() to diagnose slow queries?**

Run your query with `.explain("executionStats")` to get detailed execution statistics. Look at the `stage` field—`IXSCAN` means it used an index, `COLLSCAN` means it did a full collection scan (bad). Check `docsExamined` to see how many documents MongoDB actually read—if it's much larger than your result count, your query isn't selective enough. Look at `executionTimeMillis` for the actual time. The `winningPlan` shows which index was used (if any). If you see `FETCH` followed by `IXSCAN`, it means MongoDB used an index but still had to fetch documents—consider a covered query if you only need indexed fields.

**Q: What are the trade-offs of adding more indexes?**

More indexes improve read performance for the queries they support, but they degrade write performance. Every insert, update, or delete must update all indexes that include the modified fields. A document with five indexes takes roughly five times longer to write than a document with one index. Indexes also consume disk space and RAM—if your indexes don't fit in memory, MongoDB has to read them from disk, which defeats the purpose. The right balance is indexing the queries that run frequently and are expensive without an index, while accepting that some infrequent queries will be slower.

**Q: How does sharding affect query optimization?**

In a sharded cluster, queries that include the shard key can be routed to a single shard, which is fast. Queries without the shard key must be scattered to all shards and gathered back (scatter-gather), which is much slower. Your indexing strategy should align with your shard key—if you shard by `userId`, then queries filtering on `userId` are efficient. Compound indexes should typically start with the shard key so that queries use both the routing efficiency and the index. Also, ensure your indexes are created on each shard—they don't automatically replicate across shards in the same way as data.

## 6. The Traps — What Goes Wrong in Production

**Indexing everything:** The most common trap is treating indexes as free and adding them for every field. This tanks write performance and can make your database slower overall because the index maintenance overhead exceeds the read benefits. Only index what you actually query and what is actually slow without an index.

**Ignoring the equality-first rule:** Many developers put range filters before equality filters in compound indexes. This is wrong—equality filters should come first in the index because they allow MongoDB to jump directly to a narrow range. Range filters then scan within that range. An index on `{createdAt: 1, userId: 1}` is useless for a query filtering on `userId` only, but `{userId: 1, createdAt: 1}` works perfectly.

**Forgetting about sort:** If you filter on an indexed field but sort on a different unindexed field, MongoDB has to do an in-memory sort. This fails or becomes extremely slow for large result sets. Include the sort field in your compound index after your filter fields, in the same order as your query's sort.

**Using `$or` incorrectly:** A query like `$or: [{userId: "a"}, {status: "b"}]` where the conditions are on different fields often cannot use a single index efficiently. MongoDB may have to scan multiple indexes or fall back to a collection scan. Consider rewriting as two separate queries or restructuring your data if this pattern is common.

**Not monitoring index usage:** Over time, your application's query patterns change. Old indexes may become unused but still slow down every write. Use `$indexStats` to track which indexes are actually being used and remove the ones that aren't.

**Large documents in covered queries:** If your documents are very large and you only need a few fields, a covered query is dramatically faster. But many developers don't think to project only the fields they need, so MongoDB loads entire documents even when an index could have answered the query.

**Neglecting the `_id` index:** MongoDB automatically indexes `_id`, and that index is always there. But if your primary access pattern is by a different field (like `userId`), you need an explicit index on that field. Relying on `_id` lookups by doing application-side joins is a performance trap.

## 7. Compare With Related Concepts

**MongoDB indexes vs SQL indexes:** The core concept is the same—both use sorted data structures to avoid full table scans. But MongoDB indexes are on documents, not rows, and they can index nested fields and arrays natively. SQL indexes are typically on columns and require more explicit structure for multi-column indexes. MongoDB's explain output is also more accessible to developers than SQL's execution plans in many databases.

**Embedding vs referencing for performance:** Embedding related data in a single document can make queries faster because you retrieve everything in one operation. But it can lead to data duplication and larger documents. Referencing (normalizing) keeps documents smaller but requires multiple queries or `$lookup` aggregations. The performance choice depends on your access pattern—read-heavy, rarely-changing data is a good candidate for embedding; frequently-updated data often works better referenced.

**Aggregation framework vs map-reduce:** MongoDB's aggregation pipeline is generally more efficient and easier to optimize than the older map-reduce system. Aggregations can use indexes on the initial `$match` stage, and the pipeline is optimized by the query engine. Map-reduce is slower and more complex—use aggregation unless you have a specific need for map-reduce's flexibility.

**MongoDB transactions vs individual operations:** Multi-document transactions in MongoDB have performance overhead because they involve locking and coordination across documents. If you can model your data to avoid needing transactions (by embedding related data or using atomic operations on a single document), your writes will be faster. Use transactions only when you genuinely need multi-document ACID guarantees.

## 8. 🧠 The Memory Hook

**Index the equality fields first, then the range fields, then the sort fields—and only index what actually runs slowly.**
