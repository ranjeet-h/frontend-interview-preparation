# What is Compound Index

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce app has been running fine for months. Users can search products by category and price range. The queries are fast enough in development with a few thousand products. Then you hit production with 2 million products and a common user query starts taking 8 seconds:

```javascript
db.products.find({
  category: "electronics",
  price: { $gte: 100, $lte: 500 }
}).sort({ createdAt: -1 })
```

You have a single-field index on `category` and another on `price`. Neither one helps much because MongoDB can only use one index per query efficiently. The database scans thousands of electronics documents, then checks each one's price manually. This is the exact moment you realize you need a compound index — an index that combines multiple fields so MongoDB can narrow down results using all of them at once.

## 2. The Analogy — Make the Mechanic Obvious

Think of a compound index like a phone book organized by last name, then first name.

If you want to find "John Smith," you don't scan every page looking for "John." You flip to the "S" section (last name), then within that section, you find "John" (first name). The phone book is sorted primarily by last name, then secondarily by first name.

Now imagine you try to find someone by first name only. The phone book is useless for that — you'd have to scan every page. That's exactly how compound indexes work in MongoDB. The order of fields in your index matters. An index on `{ lastName: 1, firstName: 1 }` can efficiently find `{ lastName: "Smith", firstName: "John" }` but cannot efficiently find `{ firstName: "John" }` alone.

The phone book analogy also explains why the query field order doesn't matter but the index field order does. If you ask for "Smith, John," the phone book works. If you ask for "John, Smith," the phone book still works because you can mentally rearrange it. But the phone book itself is still organized last-name-first.

## 3. The Full Explanation — How It Actually Works

A compound index in MongoDB is an index that contains multiple fields. MongoDB stores the index entries in sorted order based on the field order you specify. When you create a compound index like `{ category: 1, price: 1, createdAt: -1 }`, MongoDB builds a B-tree where documents are first sorted by `category`, then within each category by `price`, and within each price by `createdAt` in descending order.

The critical rule of compound indexes is **field order matters**. MongoDB can use a compound index for queries that include the leading fields of the index, in order, but it cannot efficiently skip fields. This is called the "prefix" rule.

If your index is `{ a: 1, b: 1, c: 1 }`:
- Query on `{ a: 5 }` — uses the index
- Query on `{ a: 5, b: 3 }` — uses the index
- Query on `{ a: 5, b: 3, c: 7 }` — uses the index
- Query on `{ b: 3 }` — does NOT use the index efficiently (requires an index scan)
- Query on `{ c: 7 }` — does NOT use the index efficiently

MongoDB can also use the index for sort operations if the sort fields match a prefix of the index. Query on `{ a: 5 }` with sort `{ b: 1 }` works because both the filter and sort are prefixes of the index.

There's also the **ESR rule** (Equality, Sort, Range) for optimal compound index design: place equality fields first, then sort fields, then range fields. This maximizes the portion of the index MongoDB can use for filtering before it has to start scanning.

Compound indexes consume more disk space and memory than single-field indexes because they store multiple field values per index entry. Every write operation that modifies any indexed field also updates the compound index, so there's a write performance cost. The trade-off is dramatic read performance improvement for multi-field queries.

## 4. See It In Practice — Real Code or Queries

```javascript
// Create a compound index on products collection
// Field order: category (equality), price (range), createdAt (sort)
db.products.createIndex(
  { category: 1, price: 1, createdAt: -1 }
)

// This query uses the index efficiently
// Filter on category (equality), then price (range), then sort by createdAt
db.products.find({
  category: "electronics",
  price: { $gte: 100, $lte: 500 }
}).sort({ createdAt: -1 })

// This query also uses the index (prefix match)
db.products.find({ category: "electronics" })

// This query uses the index for filtering but NOT for sorting
// The sort field (price) is after a range field (createdAt breaks the prefix)
db.products.find({
  category: "electronics",
  createdAt: { $gte: new Date("2024-01-01") }
}).sort({ price: 1 })

// This query does NOT use the compound index efficiently
// Missing the leading field (category)
db.products.find({
  price: { $gte: 100, $lte: 500 }
}).sort({ createdAt: -1 })

// Better index for this query would be { price: 1, createdAt: -1 }
```

```javascript
// ESR rule example: Optimal index for this query
// Query filters on status (equality), sorts by priority, ranges on dueDate
db.tasks.find({
  status: "pending",
  dueDate: { $lte: new Date() }
}).sort({ priority: -1 })

// Optimal index following ESR: Equality first, then Sort, then Range
db.tasks.createIndex(
  { status: 1, priority: -1, dueDate: 1 }
)

// This lets MongoDB:
// 1. Jump directly to status = "pending" in the index
// 2. Within that range, documents are already sorted by priority
// 3. Within each priority, scan only up to the dueDate range
```

```javascript
// Compound index with covered query
// If all fields in the query and projection are in the index,
// MongoDB doesn't need to examine the documents
db.orders.createIndex(
  { customerId: 1, status: 1, total: 1 }
)

// This is a covered query - MongoDB returns results from the index alone
db.orders.find(
  { customerId: "cust123", status: "completed" },
  { _id: 0, total: 1 }
)
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a compound index in MongoDB and when would you use one?**

A compound index is an index that includes multiple fields from a document. MongoDB stores the index entries sorted by the first field, then within each value of the first field, sorted by the second field, and so on. You use a compound index when your application frequently queries or sorts on multiple fields together. For example, if users often filter products by category and price range, a compound index on `{ category: 1, price: 1 }` will be much faster than two separate single-field indexes because MongoDB can narrow down results using both fields in a single index traversal.

**Q: Why does the order of fields in a compound index matter?**

The field order determines what queries can efficiently use the index. MongoDB can only use a compound index for queries that include the leading fields of the index as a prefix. An index on `{ a: 1, b: 1, c: 1 }` can support queries on `{ a }`, `{ a, b }`, and `{ a, b, c }`, but not `{ b }` or `{ c }` alone. This is because the index is physically sorted first by `a`, then by `b`, then by `c`. Without the leading field value, MongoDB doesn't know where to start looking in the index.

**Q: What is the ESR rule for compound index design?**

ESR stands for Equality, Sort, Range. It's a guideline for ordering fields in a compound index to maximize query performance. Place fields used for equality filters first (exact matches like `{ status: "pending" }`). Then place fields used for sorting. Then place fields used for range filters (like `{ price: { $gte: 100 } }` or `{ createdAt: { $lte: date } }`). This order allows MongoDB to use the index for filtering and sorting as much as possible before it has to do a more expensive index scan for the range condition.

**Q: Can a compound index support queries that don't include all its fields?**

Yes, but only as prefixes. If you have an index on `{ a: 1, b: 1, c: 1 }`, queries on `{ a }` or `{ a, b }` can use the index efficiently. However, a query on `{ b }` or `{ c }` alone cannot use the index efficiently — MongoDB would have to scan the entire index. A query on `{ a, c }` can use the index for the `a` filter but not for `c`, because `b` is missing in between.

**Q: What is a covered query and how does it relate to compound indexes?**

A covered query is a query where all the fields needed for the query (filter, sort, and projection) are part of an index. In this case, MongoDB can satisfy the query entirely from the index without examining the actual documents. Compound indexes are often used to create covered queries because they can include multiple fields. Covered queries are extremely fast because they avoid the random disk I/O of fetching full documents.

**Q: What are the trade-offs of using compound indexes?**

Compound indexes improve read performance for multi-field queries dramatically, but they have costs. They consume more disk space and memory than single-field indexes because they store multiple field values per entry. Every write operation that modifies any indexed field must update the compound index, which adds write overhead. Compound indexes also increase the complexity of index maintenance and require careful design to match your actual query patterns. You should create compound indexes based on your actual query patterns, not preemptively for hypothetical queries.

## 6. The Traps — What Goes Wrong in Production

**Creating indexes in the wrong order for your queries**

If your most common query filters by `{ status, priority }` but you create an index on `{ priority, status }`, the index won't be used efficiently. MongoDB can't rearrange the index to match your query. Always design compound indexes based on your actual query patterns, with the most selective equality filter first, then sort fields, then range fields.

**Assuming compound indexes support queries on any subset of fields**

A common mistake is thinking that an index on `{ a, b, c }` makes queries on `{ b }` or `{ c }` fast. It doesn't. Only prefix queries benefit. If you need fast queries on `{ b }` alone, you need a separate index on `{ b }`.

**Creating too many compound indexes**

Each compound index adds overhead to every write operation. If you have a collection with 10 compound indexes covering every possible field combination, your inserts and updates will be slow because MongoDB must update all 10 indexes. Start with indexes for your hottest queries and add more only when you identify specific performance problems.

**Ignoring the impact of range fields on sort efficiency**

If your index is `{ a: 1, b: 1, c: 1 }` and your query filters on `{ a: 5, c: { $gte: 10 } }` and sorts by `{ b: 1 }`, MongoDB cannot use the index for the sort. The range filter on `c` breaks the prefix chain. For the sort to use the index, the sort fields must appear before any range fields in the index.

**Forgetting that compound indexes can't help with queries that use different operators**

Some operators like `$or`, `$nor`, and certain regex patterns cannot use compound indexes efficiently even if the fields are in the index. Also, queries that invert the sort direction of an index field (index has `{ a: 1 }` but query sorts `{ a: -1 }`) may not use the index as efficiently, though MongoDB can sometimes traverse the index backwards.

## 7. Compare With Related Concepts

**Compound index vs single-field index**

A single-field index indexes one field and supports queries and sorts on that field alone. A compound index indexes multiple fields together and supports queries that use those fields in combination. Use single-field indexes for queries on individual fields. Use compound indexes when you frequently query or sort on multiple fields together. Compound indexes can often replace multiple single-field indexes for common query patterns.

**Compound index vs multikey index**

A compound index can include array fields, which makes it a multikey index. A multikey index creates separate index entries for each array element. If a compound index includes an array field, MongoDB indexes the array elements and still maintains the sort order of the other fields. The key difference is that multikey indexes have restrictions — you cannot have more than one array field in a compound index, and array fields affect how the index is used for sorting.

**Compound index vs covered query**

A compound index is a structure that stores multiple fields in sorted order. A covered query is a query pattern where all needed fields are in an index. Compound indexes enable covered queries by including multiple fields in the index. Not all compound indexes produce covered queries — the query must project only the indexed fields for it to be covered.

**Compound index vs hash index**

Compound indexes are B-tree indexes that support range queries and sorting. Hash indexes use a hash function and only support equality comparisons. You cannot create a compound hash index in MongoDB — hash indexes are always single-field. Use compound B-tree indexes for queries with ranges, sorts, or multiple field filters. Use hash indexes only when you need fast equality lookups on a single field and don't need range or sort operations.

## 8. 🧠 The Memory Hook

Compound index = phone book sorted by last name, then first name. Field order is everything: you can find "Smith, John" but you can't efficiently find "John" alone. Design your index to match your query: equality fields first, then sort, then range (ESR).
