# How do you optimize Mongoose queries

## 1. The Real-World Problem — When You Actually Hit This

Your API endpoint returns a list of orders for a user. In development with 50 test orders, it responds in 80 milliseconds. Six months later, you have 200,000 orders in production. The same endpoint now takes 4 seconds and frequently times out. Users are complaining, your monitoring charts show MongoDB queries taking forever, and you're not sure why — the query worked fine when you wrote it.

The problem isn't that MongoDB is slow. The problem is that Mongoose is doing work you didn't ask it to do, and MongoDB is scanning data it shouldn't need to touch. Every field selection, every population, every index choice matters when your data grows from hundreds to millions of rows.

## 2. The Analogy — Make the Mechanic Obvious

Imagine you need to find a specific book in a library. There are two ways to do this:

**The slow way:** You walk into the library, go to the first shelf, and look at every single book until you find the one you want. If the library has 100,000 books, you might walk past 99,999 of them before finding yours.

**The fast way:** You walk to the card catalog, look up the book's call number, go directly to that shelf, and grab it. You never even look at the other 99,999 books.

Unoptimized Mongoose queries are like the slow way — they ask MongoDB to scan every document to find the ones that match. Optimized queries are like the fast way — they use indexes (the card catalog) to jump directly to the right documents, and they only ask for the fields they actually need (you check out just the book, not the entire shelf).

## 3. The Full Explanation — How It Actually Works

Mongoose is an ORM that sits between your Node.js code and MongoDB. When you write a query like `User.find({ email: 'test@example.com' })`, Mongoose translates that into a MongoDB query, sends it to the database, receives the results, and then runs those results through your schema — applying getters, setters, virtuals, and defaults.

The performance bottleneck usually happens in three places:

**First, the query itself.** If you query by a field that has no index, MongoDB must perform a collection scan — it looks at every document to see if it matches. With 100 documents, this is trivial. With 10 million documents, it's slow. Adding an index creates a sorted data structure that lets MongoDB find matching documents in logarithmic time instead of linear time.

**Second, the data returned.** Mongoose returns full documents by default. If a document has 50 fields but you only need 3, you're wasting network bandwidth, memory, and serialization time. Using `.select()` or projection tells MongoDB to only return the fields you actually need.

**Third, what Mongoose does after the query.** Mongoose hydrates each document into a full Mongoose model instance with getters, setters, virtuals, and change tracking. This overhead is useful when you need to modify and save documents, but it's unnecessary if you're just reading data. Using `.lean()` returns plain JavaScript objects instead, which is significantly faster and uses less memory.

Other optimizations include:
- **Compound indexes** for queries that filter on multiple fields
- **`$in` vs multiple queries** — one query with `$in` is usually faster than many separate queries
- **Population limits** — when using `.populate()`, select only the fields you need from the referenced documents
- **Cursor-based pagination** instead of `skip()`/`limit()` for large datasets, because `skip()` still has to scan and skip documents
- **Connection pooling** to avoid creating new database connections for every request

The key insight is that every optimization is about reducing work — either reducing the work MongoDB does (indexes), reducing the data transferred over the network (projection), or reducing the work Node.js does after the query (lean queries).

## 4. See It In Practice — Real Code or Queries

Here's a slow query and how to optimize it:

```javascript
// SLOW: No index, returns all fields, no lean
const users = await User.find({ status: 'active', age: { $gte: 25 } });
```

```javascript
// FAST: Compound index, projection, lean
const users = await User
  .find({ status: 'active', age: { $gte: 25 } })
  .select('name email age')  // Only return fields we need
  .lean();                    // Skip Mongoose model overhead
```

**Adding the index in your schema:**

```javascript
const userSchema = new Schema({
  name: String,
  email: { type: String, index: true },  // Single field index
  status: String,
  age: Number
});

// Compound index for queries that filter on both status and age
userSchema.index({ status: 1, age: 1 });
```

**Optimizing population:**

```javascript
// SLOW: Populates entire referenced documents
const orders = await Order.find({ userId })
  .populate('userId')
  .populate('productId');

// FAST: Select only needed fields from populated documents
const orders = await Order.find({ userId })
  .populate('userId', 'name email')  // Only these fields from User
  .populate('productId', 'name price');  // Only these from Product
```

**Cursor-based pagination instead of skip/limit:**

```javascript
// SLOW: skip() scans and skips documents
const page = await User.find({})
  .skip(1000)
  .limit(20);

// FAST: Use cursor-based pagination with _id
const page = await User.find({ _id: { $gt: lastId } })
  .limit(20);
```

**Using `$in` instead of multiple queries:**

```javascript
// SLOW: N+1 query problem
const orders = [];
for (const userId of userIds) {
  const userOrders = await Order.find({ userId });
  orders.push(...userOrders);
}

// FAST: Single query with $in
const orders = await Order.find({ userId: { $in: userIds } });
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you decide which fields to index?**

Index fields that appear frequently in your query filters, especially in queries that run often or return large result sets. Don't index everything — indexes use memory and slow down writes. Focus on the fields in your `find()`, `findOne()`, and `where()` clauses. For compound indexes, put the most selective field (the one with the most unique values) first, and match the order of fields in your queries.

**Q: When should you use `.lean()`?**

Use `.lean()` whenever you're reading data and don't need to modify it or use Mongoose features like virtuals, getters, setters, or default values. If you're just fetching data to send to the frontend in a JSON response, `.lean()` is almost always the right choice. Only skip `.lean()` when you need to call `.save()` on the document or use schema middleware.

**Q: Why is `skip()` slow for large datasets?**

`skip()` doesn't magically jump to a position — it still has to scan through and skip the documents. If you `skip(10000)`, MongoDB finds the first 10,000 matching documents, throws them away, and then returns the next 20. This gets slower as you paginate deeper. Cursor-based pagination using a unique field like `_id` is faster because it uses the index to find the starting point directly.

**Q: How does `.populate()` affect performance?**

Each `.populate()` triggers an additional query to MongoDB. If you populate three fields, that's four total queries (your original query plus three more). This can be fine for small datasets, but it adds up. To optimize it, select only the fields you need from the populated documents, or consider using `$lookup` in an aggregation pipeline if you need to join many documents.

**Q: What's the difference between `select()` and projection?**

They're the same thing — `select()` is Mongoose's method for MongoDB's projection. Using `.select('name email')` is equivalent to `{ name: 1, email: 1 }` in the raw MongoDB query. Projection tells MongoDB to only return those fields, which reduces data transfer and serialization overhead.

## 6. The Traps — What Goes Wrong in Production

**Trap: Indexing every field "for performance."**

Every index uses RAM and slows down write operations because MongoDB has to update each index when a document is inserted or modified. If you have more indexes than you need, you waste memory and your writes get slower. Only index fields that are actually used in query filters.

**Trap: Forgetting that Mongoose adds fields by default.**

Mongoose automatically adds `__v` (version key) to documents, and if you don't project it out, it gets sent to the frontend. Always use `.select()` or `{ __v: 0 }` to exclude internal fields from API responses.

**Trap: Using `.lean()` when you need document methods.**

If you use `.lean()` and then try to call `.save()` or use virtuals, it won't work — you get a plain JavaScript object, not a Mongoose document. Only use `.lean()` for read operations where you don't need to modify and save the document.

**Trap: Not monitoring slow queries in production.**

MongoDB has a slow query log that shows queries taking longer than a threshold (default 100ms). If you don't check this, you might have queries that are degrading over time as your data grows. Enable the slow query log and review it regularly to find queries that need indexes.

**Trap: Assuming an index will always be used.**

MongoDB's query optimizer decides whether to use an index based on statistics. Sometimes it decides a collection scan is faster, especially if the query would match a large percentage of documents. Use `.explain()` to see whether your index is actually being used and why.

## 7. Compare With Related Concepts

**Mongoose optimization vs raw MongoDB optimization:**

Mongoose adds overhead — model hydration, getters, setters, virtuals. Raw MongoDB queries don't have this overhead, but you lose the convenience of schemas and validation. The optimization principles (indexes, projection) are the same, but Mongoose requires you to be aware of the extra work it does after the query returns.

**Mongoose `.lean()` vs JSON serialization:**

`.lean()` returns plain objects immediately, skipping Mongoose's model instantiation. JSON serialization happens after Mongoose already did the work of creating the model. `.lean()` is faster because it skips that step entirely.

**Compound indexes vs multiple single-field indexes:**

A compound index supports queries that filter on multiple fields in the indexed order. Multiple single-field indexes can be used together, but MongoDB can only use one index per query in most cases. If you frequently query by `{ status, age }`, a compound index on `{ status: 1, age: 1 }` is better than two separate indexes.

**`.populate()` vs manual fetching:**

`.populate()` is convenient but runs separate queries. Manual fetching gives you more control — you can batch requests, use caching, or fetch only what you need. Use `.populate()` for simple cases, but consider manual fetching or aggregation for complex joins.

## 8. 🧠 The Memory Hook — What Sticks

Optimize Mongoose queries by reducing work at three layers: use indexes so MongoDB scans less data, use projection so MongoDB sends less data over the network, and use `.lean()` so Node.js does less work after the data arrives. Every optimization is about doing less of something.
