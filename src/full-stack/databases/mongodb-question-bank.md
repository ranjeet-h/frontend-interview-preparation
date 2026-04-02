# MongoDB Interview Question Bank

> **50 most-asked MongoDB interview questions** — covering core concepts, schema design, indexing, aggregation, replication, sharding, transactions, and MongoDB Atlas. Answers are concise, practical, and interview-ready.

---

## Question Index

| # | Question | Group |
|---|----------|-------|
| 1 | What is MongoDB and how does it differ from relational databases? | Core Concepts |
| 2 | What is a document in MongoDB? | Core Concepts |
| 3 | What is a collection? How does it differ from a SQL table? | Core Concepts |
| 4 | What is BSON? Why does MongoDB use it over plain JSON? | Core Concepts |
| 5 | What are the main MongoDB data types? | Core Concepts |
| 6 | When should you embed documents vs. reference them? | Schema Design |
| 7 | What is the 16 MB document size limit and how do you work around it? | Schema Design |
| 8 | What is the Bucket Pattern? | Schema Design |
| 9 | What is the Outlier Pattern? | Schema Design |
| 10 | How do you model a many-to-many relationship in MongoDB? | Schema Design |
| 11 | What is an index in MongoDB and why is it important? | Indexes |
| 12 | What types of indexes does MongoDB support? | Indexes |
| 13 | What is a compound index and how does field order matter? | Indexes |
| 14 | What is a covered query? | Indexes |
| 15 | What is a TTL index and when would you use it? | Indexes |
| 16 | What is the aggregation pipeline? | Aggregation |
| 17 | What are the most commonly used aggregation stages? | Aggregation |
| 18 | How does `$lookup` work and what are its limitations? | Aggregation |
| 19 | What is `$facet` and when is it useful? | Aggregation |
| 20 | How do you optimize a slow aggregation pipeline? | Aggregation |
| 21 | How does MongoDB handle reads: cursors, projection, and sorting? | Query |
| 22 | What is the `explain()` method and how do you use it? | Query |
| 23 | What is the ESR rule for index field ordering? | Query |
| 24 | What is a collation and when do you need one? | Query |
| 25 | How do `$elemMatch` and dot-notation differ for array queries? | Query |
| 26 | What are read concerns in MongoDB? | Read/Write Concerns |
| 27 | What are write concerns in MongoDB? | Read/Write Concerns |
| 28 | What is journaling in MongoDB? | Read/Write Concerns |
| 29 | What is the difference between `majority` and `local` read concern? | Read/Write Concerns |
| 30 | When should you use `w: majority` write concern? | Read/Write Concerns |
| 31 | What is a replica set? | Replication |
| 32 | How does replica set election work? | Replication |
| 33 | What is oplog? | Replication |
| 34 | What is a hidden or delayed replica set member? | Replication |
| 35 | How do you handle replica set failover in your application? | Replication |
| 36 | What is sharding in MongoDB? | Sharding |
| 37 | What is a shard key and how do you choose one? | Sharding |
| 38 | What is a chunk and how does balancing work? | Sharding |
| 39 | What is a scatter-gather query? | Sharding |
| 40 | What is zone sharding? | Sharding |
| 41 | Does MongoDB support ACID transactions? | Transactions |
| 42 | How do multi-document transactions work in MongoDB? | Transactions |
| 43 | What are the performance trade-offs of using transactions? | Transactions |
| 44 | What is retryable writes? | Transactions |
| 45 | What is snapshot isolation in MongoDB? | Transactions |
| 46 | What are change streams? | Change Streams & Atlas |
| 47 | How do change streams differ from oplog tailing? | Change Streams & Atlas |
| 48 | What is MongoDB Atlas Search? | Change Streams & Atlas |
| 49 | What is Atlas Data Federation? | Change Streams & Atlas |
| 50 | How does MongoDB Atlas handle backups and point-in-time recovery? | Change Streams & Atlas |

---

## Group 1 — Core Concepts

### Q1. What is MongoDB and how does it differ from relational databases?

**Summary:** MongoDB is a document-oriented NoSQL database that stores data as BSON documents instead of rows in tables.

**Details:**
- Schema-less by default: each document in a collection can have different fields.
- Horizontal scale-out (sharding) is a first-class feature vs. the vertical-scale bias of most RDBMS.
- No JOINs at the storage layer; you either embed related data or use `$lookup` in the aggregation pipeline.
- MongoDB supports rich querying, secondary indexes, and multi-document ACID transactions (since v4.0).

**Key difference table:**

| Concept | RDBMS | MongoDB |
|---------|-------|---------|
| Storage unit | Row | Document (BSON) |
| Schema | Fixed (DDL) | Flexible |
| Joins | SQL JOIN | `$lookup` / embedding |
| Scale | Vertical | Horizontal (sharding) |
| Transactions | Built-in | Multi-doc since v4.0 |

**Interview takeaway:** Lead with the document model flexibility and horizontal scaling, but acknowledge that transactions exist for when you need them.

---

### Q2. What is a document in MongoDB?

**Summary:** A document is a JSON-like (BSON) record that is the basic unit of data in MongoDB, analogous to a row in SQL.

**Details:**
- Documents are stored as BSON (Binary JSON) and can nest sub-documents and arrays.
- Every document must have a unique `_id` field (auto-generated as `ObjectId` if omitted).
- A single document can represent a complete entity including related data, avoiding joins.

**Example:**
```js
{
  _id: ObjectId("64f1a2b3c4d5e6f7a8b9c0d1"),
  name: "Alice",
  email: "alice@example.com",
  address: {
    city: "New York",
    zip: "10001"
  },
  tags: ["admin", "user"]
}
```

**Pitfall:** Deeply nested documents can make updates verbose. Prefer at most 2–3 levels of nesting for documents you update frequently.

---

### Q3. What is a collection? How does it differ from a SQL table?

**Summary:** A collection is a grouping of MongoDB documents — the rough equivalent of a SQL table, but without a fixed schema.

**Details:**
- Collections are created implicitly on first insert; no `CREATE TABLE` required.
- Documents in the same collection can have completely different shapes (polymorphic data).
- Schema validation can be optionally enforced with `$jsonSchema` validators.
- Collections support indexes, just like SQL tables.

**Example (schema validation):**
```js
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      required: ["name", "email"],
      properties: {
        email: { bsonType: "string", pattern: "^.+@.+$" }
      }
    }
  }
})
```

**Interview takeaway:** Mention schema validation — it shows you know how to impose structure when needed without sacrificing flexibility.

---

### Q4. What is BSON? Why does MongoDB use it over plain JSON?

**Summary:** BSON (Binary JSON) is MongoDB's binary-encoded serialization format that extends JSON with additional data types and improves encode/decode performance.

**Details:**
- **Extra types:** `ObjectId`, `Date`, `BinData`, `Decimal128`, `Int32`, `Int64`, `Timestamp`, `Regex`.
- **Performance:** BSON is faster to traverse because field lengths are encoded — the driver can skip to any field without parsing the whole document.
- **Size:** BSON can be slightly larger than JSON due to metadata, but the performance trade-off is worth it at scale.
- Drivers serialize your language objects to BSON transparently; you work with JSON-like syntax.

**Pitfall:** `Date` in BSON stores as UTC milliseconds. Always store and query dates in UTC; convert to local time only at the presentation layer.

---

### Q5. What are the main MongoDB data types?

**Summary:** MongoDB supports a rich set of BSON types beyond what JSON offers.

**Common types:**

| Type | Example |
|------|---------|
| `String` | `"hello"` |
| `Int32 / Int64` | `42`, `NumberLong(9999999999)` |
| `Double` | `3.14` |
| `Decimal128` | `NumberDecimal("9.99")` for currency |
| `Boolean` | `true` / `false` |
| `Date` | `new Date()` |
| `ObjectId` | `ObjectId("...")` |
| `Array` | `["a", "b"]` |
| `Embedded Document` | `{ city: "NY" }` |
| `Binary (BinData)` | Image bytes, UUIDs |
| `Null` | `null` |
| `Regex` | `/^foo/i` |
| `Timestamp` | Internal replication use |

**Pitfall:** Use `Decimal128` for monetary values — `Double` loses precision. Using plain JavaScript `number` for currency is a common bug.

---

## Group 2 — Schema Design

### Q6. When should you embed documents vs. reference them?

**Summary:** Embed when data is accessed together and ownership is clear (1-to-few). Reference when data is large, shared, or frequently updated independently.

**Embed when:**
- The sub-document is only meaningful in the context of the parent (e.g., address inside a user).
- You always read parent + child together.
- The child set is bounded (< ~100 items).

**Reference when:**
- The child documents are large or unbounded (e.g., all orders for a user).
- Multiple parents share the same child (e.g., many products reference the same category).
- Child documents are updated frequently without touching the parent.

**Example — embed (address):**
```js
{ _id: 1, name: "Bob", address: { city: "LA", zip: "90001" } }
```

**Example — reference (orders):**
```js
// orders collection
{ _id: ObjectId("..."), userId: 1, total: 99.99 }
```

**Interview takeaway:** The golden rule: model data the way your application accesses it, not the way it "logically" relates.

---

### Q7. What is the 16 MB document size limit and how do you work around it?

**Summary:** MongoDB enforces a hard 16 MB BSON document limit. For large data, use GridFS or the Bucket Pattern.

**Details:**
- The limit exists to encourage good schema design and prevent runaway documents.
- **GridFS:** MongoDB's built-in spec for storing files > 16 MB. It splits files into 255 KB `chunks` and stores metadata in a `files` collection. Used for images, videos, PDFs.
- **Bucket Pattern:** For time-series or log data, group many small records into "buckets" (e.g., one doc per hour of sensor readings as an array). Reduces document count and improves range scan performance.
- **Restructure:** If a document grows unbounded (e.g., appending to an array forever), split into child documents.

**GridFS example (Node.js driver):**
```js
const bucket = new mongodb.GridFSBucket(db);
fs.createReadStream('./photo.jpg').pipe(bucket.openUploadStream('photo.jpg'));
```

**Pitfall:** Don't try to store raw binary blobs in regular documents. Even if they fit under 16 MB, BSON overhead and memory pressure during processing will hurt you.

---

### Q8. What is the Bucket Pattern?

**Summary:** The Bucket Pattern groups a stream of fine-grained documents into larger "bucket" documents to reduce collection size and improve time-range queries.

**Details:**
- Common in IoT, time-series, and analytics workloads.
- Instead of one document per sensor reading, store N readings per document (e.g., per hour).
- MongoDB 5.0+ has native time-series collections that implement a similar strategy automatically.

**Example — without bucket (1 doc per reading):**
```js
{ deviceId: "d1", ts: ISODate("2024-01-01T00:01:00Z"), temp: 22.1 }
{ deviceId: "d1", ts: ISODate("2024-01-01T00:02:00Z"), temp: 22.3 }
```

**Example — with bucket (1 doc per hour):**
```js
{
  deviceId: "d1",
  hour: ISODate("2024-01-01T00:00:00Z"),
  count: 60,
  readings: [
    { ts: ISODate("2024-01-01T00:01:00Z"), temp: 22.1 },
    { ts: ISODate("2024-01-01T00:02:00Z"), temp: 22.3 }
    // ... up to 60 entries
  ]
}
```

**Pitfall:** Bucket documents must be capped. Use a `count` field and `$push` with a max size check to prevent buckets from exceeding 16 MB.

---

### Q9. What is the Outlier Pattern?

**Summary:** The Outlier Pattern handles documents that have unusually large arrays by overflow-flagging them and storing the excess in separate documents.

**Details:**
- Useful when most documents have small arrays (e.g., 50 followers) but a small percentage have huge arrays (e.g., a celebrity with 10M followers).
- The "typical" path reads only the main document. The "outlier" path follows overflow references.

**Example:**
```js
// Typical user
{ _id: 1, name: "Bob", followers: [2, 3, 4], has_extras: false }

// Outlier user
{ _id: 100, name: "Celebrity", followers: [2, 3, ...], has_extras: true }
// Overflow doc
{ userId: 100, followers: [50001, 50002, ...] }
```

**Interview takeaway:** Brings up the topic of data access patterns driving schema design — interviewers love this pattern because it shows you think about edge cases.

---

### Q10. How do you model a many-to-many relationship in MongoDB?

**Summary:** Use an array of references in one or both documents, or a junction collection, depending on query patterns.

**Option 1 — Array of IDs (most common):**
```js
// students collection
{ _id: 1, name: "Alice", courseIds: [10, 20, 30] }

// courses collection
{ _id: 10, title: "MongoDB 101" }
```
Query: find all courses for a student with one `$in` query on the `courses` collection.

**Option 2 — Bidirectional arrays (denormalized):**
```js
// courses collection also stores studentIds
{ _id: 10, title: "MongoDB 101", studentIds: [1, 2, 3] }
```
Fast lookups from both sides, but updates must touch both documents.

**Option 3 — Junction collection:**
```js
{ studentId: 1, courseId: 10, enrolledAt: ISODate("2024-01-15") }
```
Use when the relationship has its own attributes (e.g., enrollment date, grade).

**Pitfall:** Bidirectional embedding breaks atomicity — an update must write to two documents. Use transactions or accept eventual consistency.

---

## Group 3 — Indexes

### Q11. What is an index in MongoDB and why is it important?

**Summary:** An index is a data structure (B-tree by default) that stores a subset of the collection's data in an ordered form, enabling the query engine to avoid full collection scans.

**Details:**
- Without an index, MongoDB must scan every document (COLLSCAN) — O(n).
- With an appropriate index, the engine does an IXSCAN — O(log n) for point lookups, efficient range scans.
- Every collection has a default index on `_id`.
- Indexes consume disk space and RAM (working set), and slow down writes.

**Create an index:**
```js
db.users.createIndex({ email: 1 })          // ascending
db.users.createIndex({ score: -1 })         // descending
db.users.createIndex({ email: 1 }, { unique: true })
```

**Pitfall:** Adding too many indexes hurts write performance. A well-chosen compound index is almost always better than multiple single-field indexes.

---

### Q12. What types of indexes does MongoDB support?

**Summary:** MongoDB supports single-field, compound, multikey, text, geospatial (2d / 2dsphere), hashed, wildcard, and partial/sparse/TTL indexes.

| Type | Use Case |
|------|----------|
| **Single-field** | Simple equality / range on one field |
| **Compound** | Queries filtering/sorting on multiple fields |
| **Multikey** | Indexing array fields (auto-activated) |
| **Text** | Full-text search (`$text` operator) |
| **2dsphere** | GeoJSON geo queries |
| **Hashed** | Shard key for hash-based sharding |
| **Wildcard** | Dynamic schemas with unknown field names |
| **Partial** | Index a subset of documents (filter condition) |
| **Sparse** | Only index docs where the field exists |
| **TTL** | Auto-expire documents after a time period |

**Example — partial index (index only active users):**
```js
db.users.createIndex(
  { lastLogin: 1 },
  { partialFilterExpression: { status: "active" } }
)
```

**Pitfall:** Multikey indexes cannot be compound-indexed on two array fields in the same document.

---

### Q13. What is a compound index and how does field order matter?

**Summary:** A compound index covers multiple fields. Field order determines which queries the index can support via the **Equality → Sort → Range (ESR) rule**.

**Details:**
- The index `{ status: 1, createdAt: -1 }` supports queries that filter on `status`, or filter on `status` AND sort/range on `createdAt`, but NOT queries that only filter on `createdAt`.
- The leftmost prefix rule: an index on `(a, b, c)` supports queries on `a`, `(a, b)`, and `(a, b, c)` — but not `(b, c)` alone.

**Example:**
```js
db.orders.createIndex({ status: 1, userId: 1, createdAt: -1 })

// Uses index:
db.orders.find({ status: "shipped", userId: 42 }).sort({ createdAt: -1 })

// Does NOT efficiently use index (skips leftmost prefix):
db.orders.find({ createdAt: { $gte: ISODate("2024-01-01") } })
```

**Interview takeaway:** Explaining the leftmost prefix rule clearly is a strong signal of MongoDB index expertise.

---

### Q14. What is a covered query?

**Summary:** A covered query is one where all fields in the query predicate AND the projection are present in the index — MongoDB never touches the actual documents.

**Details:**
- The query is satisfied entirely from index data (IXSCAN with no FETCH stage in `explain()`).
- Significantly faster because it avoids random I/O to the collection.
- To cover a query, the index must include all queried fields AND all projected fields.
- Exclude `_id` from the projection if it is not in the index (`{ _id: 0 }`).

**Example:**
```js
db.users.createIndex({ email: 1, name: 1 })

// Covered — all fields in index, _id excluded
db.users.find({ email: "a@b.com" }, { _id: 0, email: 1, name: 1 })
```

**Verify with explain:**
```js
db.users.find(...).explain("executionStats")
// Look for: "stage": "PROJECTION_COVERED" — no FETCH stage
```

**Pitfall:** Forgetting `_id: 0` is the most common reason a query that looks covered still fetches documents.

---

### Q15. What is a TTL index and when would you use it?

**Summary:** A TTL (Time-To-Live) index auto-expires documents a specified number of seconds after a `Date` field's value, without any application-level cron job.

**Details:**
- Must be a single-field index on a `Date`-type field.
- A background TTL thread runs every 60 seconds, so deletion is not instant.
- Cannot be compound; cannot be on arrays of dates (unless you want the minimum date to trigger expiry).

**Example — expire sessions after 1 hour:**
```js
db.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 })
```

**Example — expire at a specific time (set `expireAfterSeconds: 0`, store the expiry in the date field):**
```js
db.jobs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
// Document: { task: "send_email", expiresAt: ISODate("2024-06-01T12:00:00Z") }
```

**Pitfall:** TTL does not guarantee immediate deletion. Do not rely on it for hard real-time security token invalidation — check expiry in application code too.

---

## Group 4 — Aggregation

### Q16. What is the aggregation pipeline?

**Summary:** The aggregation pipeline is MongoDB's data-processing framework — a sequence of stages that transform documents as they flow through, similar to Unix pipes.

**Details:**
- Each stage takes documents in, transforms them, and passes results to the next stage.
- Runs server-side; much more efficient than fetching all documents and processing in application code.
- Can use indexes in early stages (`$match`, `$sort`) to reduce the working set.
- Replaced the older `mapReduce` function (deprecated in v5.0).

**Basic structure:**
```js
db.orders.aggregate([
  { $match: { status: "completed" } },        // filter
  { $group: { _id: "$userId", total: { $sum: "$amount" } } }, // group
  { $sort: { total: -1 } },                   // sort
  { $limit: 10 }                              // top 10
])
```

**Interview takeaway:** Mention that `$match` and `$sort` should be as early as possible in the pipeline to leverage indexes and minimize document throughput.

---

### Q17. What are the most commonly used aggregation stages?

**Summary:** The most common stages are `$match`, `$group`, `$sort`, `$project`, `$lookup`, `$unwind`, `$limit`, `$skip`, `$addFields`, and `$out`/`$merge`.

| Stage | Purpose |
|-------|---------|
| `$match` | Filter documents (like `WHERE`) |
| `$group` | Group and aggregate (`GROUP BY`) |
| `$sort` | Sort results |
| `$project` | Include/exclude/reshape fields |
| `$lookup` | Left outer join to another collection |
| `$unwind` | Deconstruct an array into multiple docs |
| `$limit` / `$skip` | Pagination |
| `$addFields` | Add computed fields without removing others |
| `$out` | Write results to a new collection |
| `$merge` | Merge results into an existing collection |
| `$facet` | Run multiple sub-pipelines in parallel |
| `$bucket` | Categorize docs into buckets |

**Example — `$unwind` then `$group`:**
```js
db.orders.aggregate([
  { $unwind: "$items" },
  { $group: { _id: "$items.sku", total: { $sum: "$items.qty" } } }
])
```

**Pitfall:** `$unwind` on a large array multiplies document count. Always `$match` before `$unwind` to reduce the input size.

---

### Q18. How does `$lookup` work and what are its limitations?

**Summary:** `$lookup` performs a left outer join between the current collection and a foreign collection in the same database.

**Basic syntax:**
```js
db.orders.aggregate([
  {
    $lookup: {
      from: "products",
      localField: "productId",
      foreignField: "_id",
      as: "product"
    }
  }
])
```

**Pipeline `$lookup` (more powerful):**
```js
{
  $lookup: {
    from: "inventory",
    let: { orderId: "$_id" },
    pipeline: [
      { $match: { $expr: { $eq: ["$orderId", "$$orderId"] } } },
      { $project: { qty: 1 } }
    ],
    as: "inventory"
  }
}
```

**Limitations:**
- Both collections must be in the **same database**.
- Cannot join across shards efficiently (sharded `from` collection supported since v5.1 with caveats).
- No indexes are used on `localField` — only the `foreignField` is indexed by the join.
- Result is an array; use `$unwind` + `$replaceRoot` to flatten if you need a single document.

**Pitfall:** `$lookup` in a sharded cluster can cause scatter-gather if the `from` collection is sharded on a different key. Prefer embedding for high-frequency joins.

---

### Q19. What is `$facet` and when is it useful?

**Summary:** `$facet` runs multiple independent sub-pipelines on the same input documents in a single aggregation pass, perfect for multi-dimensional analytics or faceted search UIs.

**Use cases:**
- E-commerce search: simultaneously compute category counts, price range buckets, and brand counts from one query.
- Dashboard: return total count, paginated results, and summary stats in one round-trip.

**Example:**
```js
db.products.aggregate([
  { $match: { inStock: true } },
  {
    $facet: {
      byCategory: [
        { $group: { _id: "$category", count: { $sum: 1 } } }
      ],
      byPriceRange: [
        { $bucket: { groupBy: "$price", boundaries: [0, 50, 100, 500], default: "500+" } }
      ],
      totalCount: [
        { $count: "count" }
      ]
    }
  }
])
```

**Pitfall:** All sub-pipelines inside `$facet` share the same input. They cannot include `$out`, `$merge`, `$indexStats`, or `$facet` (no nesting).

---

### Q20. How do you optimize a slow aggregation pipeline?

**Summary:** Move `$match` and `$sort` as early as possible, project away unused fields early, use indexes, and break large pipelines into `$out`/`$merge` materialized views.

**Checklist:**
1. **Put `$match` first** — reduces document count entering subsequent stages, enabling index use.
2. **Put `$sort` before `$group`** — allows sort to use an index; after `$group` there is no index.
3. **Use `$project` / `$addFields` early** — remove fields you don't need to reduce memory pressure.
4. **Avoid `$unwind` on huge arrays** — pre-filter with `$match` on array elements using `$elemMatch`.
5. **Use `allowDiskUse: true`** — for large aggregations that exceed the 100 MB RAM limit per stage.
6. **Check with `explain("executionStats")`** — look for COLLSCAN stages and high `nReturned` vs. `nScanned` ratios.
7. **Materialize with `$out`/`$merge`** — for expensive recurring aggregations, cache results in a separate collection.

**Example — diagnosis:**
```js
db.orders.explain("executionStats").aggregate([
  { $match: { status: "pending" } },
  { $group: { _id: "$userId", count: { $sum: 1 } } }
])
```

**Pitfall:** Forgetting `allowDiskUse: true` on a large aggregation causes a cryptic "Exceeded memory limit" error in production.

---

## Group 5 — Query

### Q21. How does MongoDB handle reads: cursors, projection, and sorting?

**Summary:** `find()` returns a cursor — a lazy iterator. Projection limits returned fields. Sorting can use an index or requires an in-memory sort.

**Cursor basics:**
```js
const cursor = db.users.find({ active: true });
cursor.forEach(doc => console.log(doc));
// Or: cursor.toArray(), cursor.next()
```

**Projection (include/exclude fields):**
```js
db.users.find({}, { name: 1, email: 1, _id: 0 })  // include only name, email
db.users.find({}, { password: 0 })                 // exclude password
// Cannot mix include and exclude (except _id)
```

**Sort + limit for pagination:**
```js
db.products.find({ category: "books" })
  .sort({ price: 1 })
  .skip(20)
  .limit(10)
```

**Pitfall:** Deep `skip()` pagination is expensive — MongoDB must still scan and discard skipped docs. Use range-based pagination (`_id > lastSeenId`) for large datasets.

---

### Q22. What is the `explain()` method and how do you use it?

**Summary:** `explain()` returns the query plan chosen by the query planner, showing whether indexes are used, how many documents were scanned, and execution time.

**Three verbosity levels:**
```js
db.users.find({ email: "a@b.com" }).explain()                // "queryPlanner" (default)
db.users.find({ email: "a@b.com" }).explain("executionStats") // adds actual execution metrics
db.users.find({ email: "a@b.com" }).explain("allPlansExecution") // shows rejected plans too
```

**Key fields to look at:**
- `winningPlan.stage`: Should be `IXSCAN`, not `COLLSCAN`.
- `executionStats.nReturned`: Documents returned.
- `executionStats.totalDocsExamined`: Documents examined. If this >> `nReturned`, add an index.
- `executionStats.executionTimeMillis`: Latency.

**Example output clue:**
```json
"winningPlan": { "stage": "COLLSCAN" }  // BAD — no index used
"winningPlan": { "stage": "IXSCAN" }    // GOOD
```

**Pitfall:** The planner caches plans. After adding an index, run `db.collection.getPlanCache().clear()` if the old plan is still being used.

---

### Q23. What is the ESR rule for index field ordering?

**Summary:** ESR stands for **Equality → Sort → Range**: place equality filter fields first, sort fields next, and range filter fields last in a compound index.

**Why it matters:**
- Equality fields narrow the index scan to a specific value — maximally selective.
- Sort fields allow the engine to return results in order without an in-memory sort.
- Range fields (like `$gte`, `$lte`, `$in`) are placed last because they don't preserve sort order.

**Example query:**
```js
db.events.find({ type: "click", ts: { $gte: t1, $lte: t2 } }).sort({ userId: 1 })
```

**ESR index:**
```js
db.events.createIndex({ type: 1, userId: 1, ts: 1 })
// Equality: type
// Sort: userId
// Range: ts
```

**Anti-pattern:**
```js
db.events.createIndex({ ts: 1, type: 1, userId: 1 })  // range first — breaks sort optimization
```

**Interview takeaway:** ESR is one of the most practical and testable MongoDB index concepts. Memorize the acronym and be ready with an example.

---

### Q24. What is a collation and when do you need one?

**Summary:** Collation specifies language-specific string comparison rules — including case sensitivity, accent handling, and locale — for queries, indexes, and sorts.

**Details:**
- By default, MongoDB string comparisons are binary (byte-by-byte), which is locale-unaware.
- Collation allows case-insensitive queries or locale-aware sorting (e.g., French accent rules).
- If you create an index with a collation, queries must specify the same collation to use it.

**Example — case-insensitive unique index:**
```js
db.users.createIndex(
  { email: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
)

// Query must also specify collation to use this index:
db.users.find({ email: "Alice@Example.com" }).collation({ locale: "en", strength: 2 })
```

**`strength` levels:** 1 = base characters only, 2 = base + accents, 3 = base + accents + case (default binary).

**Pitfall:** A query without collation will not use a collation index, falling back to a COLLSCAN. Always match the collation in both index creation and query.

---

### Q25. How do `$elemMatch` and dot-notation differ for array queries?

**Summary:** Dot-notation checks conditions on array elements independently across the array; `$elemMatch` requires a single element to satisfy all conditions simultaneously.

**Example:**
```js
// Documents
{ scores: [{ type: "math", val: 90 }, { type: "eng", val: 60 }] }
{ scores: [{ type: "math", val: 50 }, { type: "eng", val: 95 }] }

// Dot-notation — matches doc 1 (math=90 in one element, eng=60 in another)
// ALSO matches doc 2! (val >= 60 exists, type "math" exists — separately)
db.students.find({ "scores.type": "math", "scores.val": { $gte: 90 } })

// $elemMatch — only matches doc 1 (one element must have BOTH type=math AND val>=90)
db.students.find({ scores: { $elemMatch: { type: "math", val: { $gte: 90 } } } })
```

**Pitfall:** This is one of the most common sources of subtle MongoDB query bugs. When querying arrays of subdocuments with multiple conditions, almost always use `$elemMatch`.

---

## Group 6 — Read/Write Concerns

### Q26. What are read concerns in MongoDB?

**Summary:** Read concern controls how consistent and up-to-date the data returned by a read operation is relative to the replica set.

| Read Concern | Returns |
|--------------|---------|
| `local` | Most recent data on the queried node (default; may be rolled back) |
| `available` | Like `local` but for sharded clusters; may return orphaned docs |
| `majority` | Data acknowledged by a majority of replica set members (durable) |
| `linearizable` | Reflects all majority-acknowledged writes before the read (strongest) |
| `snapshot` | Consistent snapshot of majority-committed data (used in transactions) |

**Example:**
```js
db.orders.find({ status: "placed" }).readConcern("majority")
```

**Interview takeaway:** `majority` is the safe default for financial or critical reads. `local` is fine for low-stakes reads where speed matters more than consistency.

---

### Q27. What are write concerns in MongoDB?

**Summary:** Write concern specifies how many replica set members must acknowledge a write before it is considered successful.

| Write Concern | Meaning |
|---------------|---------|
| `{ w: 0 }` | Fire and forget — no acknowledgment |
| `{ w: 1 }` | Acknowledged by the primary (default) |
| `{ w: "majority" }` | Acknowledged by majority of voting members |
| `{ w: N }` | Acknowledged by N members |
| `{ j: true }` | Also wait for the write to be written to the on-disk journal |
| `{ wtimeout: ms }` | Timeout if acknowledgment takes too long |

**Example:**
```js
db.payments.insertOne(
  { amount: 500, userId: 1 },
  { writeConcern: { w: "majority", j: true, wtimeout: 5000 } }
)
```

**Pitfall:** `w: 0` (unacknowledged) should never be used for data that matters. Even `w: 1` without `j: true` can lose data on a primary crash before the journal is flushed.

---

### Q28. What is journaling in MongoDB?

**Summary:** Journaling is a write-ahead log (WAL) that records write operations before they are applied to the data files, ensuring durability on crash recovery.

**Details:**
- MongoDB's storage engine (WiredTiger) maintains a journal.
- By default, the journal is synced every 50 ms (configurable).
- On crash, MongoDB replays unfinished journal entries on startup.
- `{ j: true }` in write concern means the operation waits until the journal has been flushed to disk.
- On replica sets, journaling is enabled by default on all members.

**Trade-off:** `j: true` adds latency because it waits for a disk fsync. For high-throughput, low-criticality writes, you might omit it — but accept the small window of data loss.

**Interview takeaway:** "Journaling ensures crash consistency; `j: true` in write concern ensures your application knows the write survived a crash."

---

### Q29. What is the difference between `majority` and `local` read concern?

**Summary:** `local` reads the most recent data on the queried node (may include not-yet-replicated or roll-back-able data). `majority` reads only data confirmed by a majority of the replica set (durable).

**Concrete scenario:**
1. Primary writes doc A with `w: 1`.
2. Primary crashes before replication.
3. A new primary is elected; doc A never existed on it.
4. Doc A is rolled back.

- A `local` read during step 2 would return doc A.
- A `majority` read would not return doc A (it was never majority-acknowledged).

**Performance:** `majority` reads have slightly higher latency because MongoDB must determine the "majority commit point" timestamp.

**When to use each:**
- `local`: Analytics, caches, non-critical reads where speed > consistency.
- `majority`: User-facing financial data, session data, anything that must be durable.

---

### Q30. When should you use `w: majority` write concern?

**Summary:** Use `w: majority` whenever a write must survive a primary failover without being rolled back — financial transactions, user account changes, inventory deductions.

**Practical rules:**
- Always pair `w: majority` with `r: majority` (or `snapshot` in transactions) for true linearizable consistency.
- For batch ETL or log ingestion where some loss is acceptable, `w: 1` is fine and significantly faster.
- In replica sets of 3 members, `w: majority` requires acknowledgment from 2 members.

**Example — payment service:**
```js
await db.collection("payments").insertOne(
  { userId, amount, createdAt: new Date() },
  { writeConcern: { w: "majority", j: true } }
)
```

**Pitfall:** Using `w: majority` in a single-node deployment causes writes to timeout (no majority possible). Always check your topology configuration when setting write concerns.

---

## Group 7 — Replication

### Q31. What is a replica set?

**Summary:** A replica set is a group of MongoDB instances (nodes) that maintain the same dataset through asynchronous replication, providing high availability and data redundancy.

**Architecture:**
- **Primary:** Receives all writes; replicates to secondaries.
- **Secondary (1+):** Applies operations from the primary's oplog; can serve reads if configured.
- **Arbiter (optional):** Votes in elections but holds no data — used to achieve an odd member count cheaply.

**Minimum recommended:** 3 data-bearing members (primary + 2 secondaries) for true majority quorum.

```
Client ──▶ Primary ──▶ Secondary 1
                  └──▶ Secondary 2
```

**Automatic failover:** If the primary becomes unreachable, secondaries hold an election and elect a new primary within ~10–12 seconds (default `electionTimeoutMillis: 10000`).

**Pitfall:** An even number of voting members can cause split-brain. Always have an odd number of voting members (3, 5, 7…).

---

### Q32. How does replica set election work?

**Summary:** When a primary is unavailable, eligible secondaries campaign for election. The candidate with the highest oplog position and priority wins via a majority vote.

**Steps:**
1. A secondary detects it cannot reach the primary (heartbeat timeout ~10s).
2. It increments the **term** number and requests votes.
3. Each eligible member votes yes to at most one candidate per term.
4. The candidate with votes from a majority of voting members becomes the new primary.
5. It writes a no-op entry to the oplog, and secondaries replicate from it.

**Election factors:**
- **Priority:** Members with higher `priority` are preferred candidates (0 = never primary).
- **Oplog position:** The most up-to-date member is preferred.
- **Votes:** Each member has 1 vote by default (configurable 0 or 1).

**Pitfall:** During the election window (~10s), the replica set has no primary and **writes are rejected**. Application code must implement retry logic with exponential backoff.

---

### Q33. What is the oplog?

**Summary:** The oplog (operations log) is a special capped collection (`local.oplog.rs`) on each replica set member that records all data-changing operations in an idempotent form.

**Details:**
- Secondaries continuously tail the primary's oplog and replay operations to stay in sync.
- The oplog is **idempotent**: applying an entry multiple times produces the same result.
- Operations are stored as CRUD operations, not SQL statements.
- Oplog size is configurable (`--oplogSize`). Default is 5% of free disk space, capped at 50 GB.

**Viewing the oplog:**
```js
use local
db.oplog.rs.find().sort({ $natural: -1 }).limit(5)
// Fields: ts (timestamp), op (i=insert, u=update, d=delete), ns (namespace), o (document)
```

**Pitfall:** If a secondary falls behind and the primary's oplog wraps around (overwrites), the secondary enters **RECOVERING** state and requires a full resync. Monitor `rs.printReplicationInfo()` for oplog window.

---

### Q34. What is a hidden or delayed replica set member?

**Summary:** A hidden member is invisible to drivers (never chosen for reads) and cannot become primary, often used for dedicated reporting. A delayed member replicates with a time lag, serving as a rolling backup.

**Hidden member:**
```js
// rs.reconfig — set hidden: true, priority: 0
{ _id: 3, host: "mongo3:27017", hidden: true, priority: 0, votes: 1 }
```
Use: Analytics queries that shouldn't compete with production traffic.

**Delayed member:**
```js
{ _id: 4, host: "mongo4:27017", priority: 0, votes: 0,
  hidden: true, secondaryDelaySecs: 3600 }  // 1 hour delay
```
Use: Protection against accidental bulk deletes — gives a 1-hour window to recover before the change propagates to the delayed member.

**Pitfall:** A delayed member with `votes: 1` can still participate in elections, potentially delaying them. Set `votes: 0` for non-critical delayed members.

---

### Q35. How do you handle replica set failover in your application?

**Summary:** Use the official driver's built-in retry logic, configure appropriate `serverSelectionTimeoutMS`, and implement application-level retryable writes.

**Driver-level:**
- Enable **Retryable Writes** (default `true` since driver v3.6): the driver automatically retries one transient write failure.
- Set `serverSelectionTimeoutMS` (default 30s): how long the driver waits to find an available server.

**Connection string settings:**
```
mongodb://host1,host2,host3/?replicaSet=myRS&retryWrites=true&w=majority
```

**Application-level:**
```js
async function withRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientError(err) || i === retries - 1) throw err;
      await sleep(100 * 2 ** i); // exponential backoff
    }
  }
}
```

**Pitfall:** Retryable writes protect single-statement operations but not multi-document transactions. Transactions must be retried at a higher level (the transaction function itself).

---

## Group 8 — Sharding

### Q36. What is sharding in MongoDB?

**Summary:** Sharding is MongoDB's horizontal scaling strategy — it distributes data across multiple servers (shards), each holding a subset of the data.

**Components:**
- **Shard:** A replica set that holds a partition of the data.
- **mongos:** A routing process that acts as the query router for client applications.
- **Config servers:** A replica set storing the cluster metadata (chunk map).

```
Client ──▶ mongos ──▶ Shard 1 (replica set)
                 └──▶ Shard 2 (replica set)
                 └──▶ Shard 3 (replica set)
```

**When to shard:**
- Data exceeds the storage or RAM capacity of a single server.
- Write throughput exceeds what a single primary can handle.
- Geographic distribution is required.

**Pitfall:** Sharding adds operational complexity. Always scale vertically first, then shard. Resharding (changing shard key) is supported since v5.0 but is still expensive.

---

### Q37. What is a shard key and how do you choose one?

**Summary:** The shard key is the field(s) MongoDB uses to distribute documents across shards. A good shard key has high cardinality, even distribution, and supports your most common query patterns.

**Good shard key properties:**
1. **High cardinality:** Many distinct values (not a boolean or status field).
2. **Even distribution:** Avoids "hot shards" where one shard receives all writes.
3. **Query isolation:** Common queries include the shard key so they hit one shard (targeted, not scatter-gather).
4. **Not monotonically increasing:** `ObjectId` or timestamps cause all inserts to hit the last shard. Use hashed shard key for write-heavy collections.

**Examples:**
```js
// Hashed — good for write distribution on high-insert collections
sh.shardCollection("mydb.events", { _id: "hashed" })

// Compound — good for user-scoped multi-tenant apps
sh.shardCollection("mydb.orders", { tenantId: 1, createdAt: 1 })
```

**Pitfall:** You cannot change a shard key field (only refine it since v4.4). Choose carefully before going to production.

---

### Q38. What is a chunk and how does balancing work?

**Summary:** MongoDB divides each shard's key space into chunks (default 128 MB). The balancer migrates chunks across shards to keep data evenly distributed.

**Details:**
- A chunk is a contiguous range of shard key values, e.g., `{ userId: [100, 200) }`.
- When a chunk grows beyond the max chunk size, MongoDB splits it.
- The **balancer** runs in the background, migrating chunks from shards with more chunks to shards with fewer.
- Chunk migrations can cause I/O spikes; schedule the balancing window during off-peak hours if needed.

**Check balancer status:**
```js
sh.getBalancerState()     // true/false
sh.isBalancerRunning()    // currently migrating?
sh.status()               // full cluster status including chunk counts
```

**Disable balancer window:**
```js
db.getSiblingDB("config").settings.updateOne(
  { _id: "balancer" },
  { $set: { activeWindow: { start: "23:00", stop: "06:00" } } },
  { upsert: true }
)
```

**Pitfall:** A monotonically increasing shard key (like `ObjectId`) causes all chunks to land on one shard — the balancer can't keep up with the write rate.

---

### Q39. What is a scatter-gather query?

**Summary:** A scatter-gather query is one that the mongos must broadcast to all shards because the query predicate does not include the shard key — all shards respond and results are merged.

**Targeted vs. scatter-gather:**
```js
// Targeted — includes shard key (userId)
db.orders.find({ userId: 42, status: "shipped" })   // hits 1 shard

// Scatter-gather — no shard key
db.orders.find({ status: "shipped" })               // hits ALL shards
```

**Performance impact:**
- Scatter-gather queries have latency proportional to the slowest shard.
- They consume resources on every shard.
- Fine for infrequent reporting queries; problematic for high-frequency operational queries.

**Mitigation:**
- Design shard key around your most frequent queries.
- Use **zone sharding** to route specific query patterns to specific shards.
- For analytics, use Atlas Data Federation or secondary reads on a dedicated analytics node.

---

### Q40. What is zone sharding?

**Summary:** Zone sharding (formerly tag-aware sharding) lets you map shard key ranges to specific shards, enabling data locality, geographic distribution, and tiered storage.

**Use cases:**
- **Multi-tenancy:** Route each tenant's data to a dedicated shard.
- **Geographic compliance:** Store EU user data only on EU-region shards.
- **Tiered storage:** Route hot recent data to NVMe shards, cold data to HDD shards.

**Example — geographic zones:**
```js
// Tag shards with zones
sh.addShardToZone("shard1", "EU")
sh.addShardToZone("shard2", "US")

// Map key ranges to zones
sh.updateZoneKeyRange(
  "mydb.users",
  { region: "EU", _id: MinKey },
  { region: "EU", _id: MaxKey },
  "EU"
)
sh.updateZoneKeyRange(
  "mydb.users",
  { region: "US", _id: MinKey },
  { region: "US", _id: MaxKey },
  "US"
)
```

**Pitfall:** Zone sharding requires the shard key to include the zone-discriminator field (e.g., `region`). Queries without `region` will still scatter-gather.

---

## Group 9 — Transactions

### Q41. Does MongoDB support ACID transactions?

**Summary:** Yes. Since v4.0, MongoDB supports multi-document ACID transactions on replica sets. Since v4.2, they extend to sharded clusters.

**ACID in MongoDB:**
| Property | How MongoDB delivers it |
|----------|------------------------|
| **Atomicity** | All operations in a transaction commit or all roll back |
| **Consistency** | Schema validators run; application invariants enforced by app code |
| **Isolation** | Snapshot isolation — reads see a consistent point-in-time snapshot |
| **Durability** | Combined with `w: majority` + `j: true` write concern |

**Caveat:** MongoDB is designed around single-document atomicity (operations on one document are always atomic). Multi-document transactions are available but have overhead — don't overuse them.

**Interview takeaway:** MongoDB had single-document atomicity from v1.0. Multi-doc transactions were added to satisfy complex use cases, not as the primary design pattern.

---

### Q42. How do multi-document transactions work in MongoDB?

**Summary:** Start a session, begin a transaction, perform operations, then commit or abort. All operations in the transaction see a consistent snapshot and are atomic.

**Node.js example:**
```js
const session = client.startSession();
try {
  session.startTransaction({
    readConcern: { level: "snapshot" },
    writeConcern: { w: "majority" }
  });

  await accounts.updateOne(
    { _id: fromId },
    { $inc: { balance: -amount } },
    { session }
  );
  await accounts.updateOne(
    { _id: toId },
    { $inc: { balance: amount } },
    { session }
  );

  await session.commitTransaction();
} catch (err) {
  await session.abortTransaction();
  throw err;
} finally {
  await session.endSession();
}
```

**Key rules:**
- All operations must pass the **same session object**.
- Transactions have a max runtime of 60 seconds (default `transactionLifetimeLimitSeconds: 60`).
- Collections/databases accessed in a transaction must exist before the transaction starts.

---

### Q43. What are the performance trade-offs of using transactions?

**Summary:** Multi-document transactions have higher latency, increased lock contention, and require more oplog space — use them sparingly and only when necessary.

**Costs:**
1. **Latency:** Two-phase commit protocol adds round-trips. `w: majority` makes it worse.
2. **Lock contention:** Transactions hold document-level locks for their entire duration, blocking concurrent writes to the same documents.
3. **Oplog size:** Transaction operations are written as a batch to the oplog at commit time, creating larger oplog entries.
4. **Retry complexity:** Transient errors (write conflict, session expiry) require full transaction retry.
5. **64-operation write limit** per transaction (no actual limit, but performance degrades).

**Best practice:**
- Keep transactions short and touch as few documents as possible.
- Prefer single-document operations with careful schema design (embedding) over transactions.
- Use `withTransaction()` helper in the official drivers — it handles retry logic automatically.

```js
await session.withTransaction(async () => {
  // operations here; automatically retried on transient errors
});
```

---

### Q44. What is retryable writes?

**Summary:** Retryable writes allow the MongoDB driver to automatically retry a single write operation once if a transient network error or primary failover occurs, without duplicating the write.

**How it works:**
- The driver attaches a unique `txnNumber` and `lsid` (logical session ID) to each write.
- If the server receives the same `(lsid, txnNumber)` twice, it deduplicates and returns the original result.
- This makes retries safe for `insert`, `update`, `delete`, and `findAndModify`.

**Enable (default since driver v3.6+):**
```
mongodb://host/?retryWrites=true
```

**Limitations:**
- Only retries once — a second failure is surfaced to the application.
- Does not retry multi-statement transactions (only the individual operations inside).
- Requires a replica set or sharded cluster (standalone MongoDB does not support retryable writes).

**Pitfall:** Retryable writes guarantee at-most-once delivery semantics but only for the retry window. Long network partitions still require application-level retry.

---

### Q45. What is snapshot isolation in MongoDB?

**Summary:** Snapshot isolation means all reads within a transaction (or a single `readConcern: snapshot` read) see a consistent point-in-time view of the data — as it was at the moment the transaction started.

**Details:**
- Other concurrent writes do not affect what the transaction sees once it has started.
- MongoDB uses WiredTiger's MVCC (Multi-Version Concurrency Control) to maintain snapshots.
- Inside a transaction, if you read a document and then another session updates it, your transaction still sees the original value — and will fail with a write conflict if you try to update it too.

**Example:**
```
T=0: Transaction A starts (snapshot taken)
T=1: Session B updates doc X { val: 1 → val: 2 }
T=2: Transaction A reads doc X → sees { val: 1 }  (snapshot)
T=3: Transaction A tries to update doc X → WriteConflict error
```

**Pitfall:** Write conflicts require the entire transaction to be retried. Design transactions to minimize overlap with concurrent workloads, or use `withTransaction()` for automatic retry.

---

## Group 10 — Change Streams & Atlas

### Q46. What are change streams?

**Summary:** Change streams provide a real-time stream of document-level change events (insert, update, replace, delete) on a collection, database, or entire deployment.

**Details:**
- Built on the oplog but exposed as a high-level, resumable API.
- Can filter events using aggregation pipeline stages (`$match`, `$project`).
- Resumable via a **resume token** — reconnect and replay missed events.
- Requires replica set or sharded cluster (not standalone).

**Example (Node.js):**
```js
const changeStream = db.collection("orders").watch([
  { $match: { operationType: "insert" } }
]);

for await (const change of changeStream) {
  console.log("New order:", change.fullDocument);
}

// To resume after disconnect:
const resumeStream = db.collection("orders").watch([], {
  resumeAfter: lastResumeToken
});
```

**Use cases:** Real-time notifications, cache invalidation, event-driven microservices, audit logs.

**Pitfall:** Change streams don't replay historical events — they only emit changes going forward from when the stream was opened (or resume token).

---

### Q47. How do change streams differ from oplog tailing?

**Summary:** Change streams are a stable, driver-native, filtered API; oplog tailing is a low-level, internal mechanism subject to format changes.

| | Change Streams | Oplog Tailing |
|--|---------------|---------------|
| **API stability** | Public, stable | Internal, undocumented format |
| **Resumability** | Resume token (high-level) | Oplog timestamp (manual) |
| **Filtering** | Aggregation pipeline | Manual filter on `local.oplog.rs` |
| **Sharding support** | Yes (unified view) | Complex — must tail per-shard |
| **Authorization** | `changeStream` privilege | Requires `local` db access |
| **Format** | Normalized change event | Raw oplog entry (op, o, o2…) |

**When you might still tail the oplog:** Very low-level tooling (e.g., building your own replication), or reading pre-change-stream MongoDB versions. Otherwise, always prefer change streams.

**Pitfall:** Oplog entries have a different format for updates than change streams (`$set`/`$unset` diff vs. full document or `updateDescription`). Change streams provide `fullDocument` option for convenience.

---

### Q48. What is MongoDB Atlas Search?

**Summary:** Atlas Search is a full-text search engine built into MongoDB Atlas, powered by Apache Lucene, allowing rich search queries directly on your MongoDB data without a separate Elasticsearch cluster.

**Features:**
- Fuzzy matching, autocomplete, phrase search, wildcard, regex.
- Relevance scoring with `$search` stage in the aggregation pipeline.
- Synonym support, custom analyzers, language-specific tokenization.
- Faceted search with `$searchMeta`.
- Near-real-time index updates as documents change.

**Example:**
```js
db.products.aggregate([
  {
    $search: {
      index: "products_search",
      text: {
        query: "wireless headphones",
        path: ["name", "description"],
        fuzzy: { maxEdits: 1 }
      }
    }
  },
  { $limit: 10 },
  { $project: { name: 1, score: { $meta: "searchScore" } } }
])
```

**Interview takeaway:** Atlas Search eliminates the need to sync data to a separate Elasticsearch cluster — a common architectural simplification for startups and mid-size apps.

---

### Q49. What is Atlas Data Federation?

**Summary:** Atlas Data Federation lets you query data across multiple sources — MongoDB Atlas clusters, AWS S3, Azure Blob, Google Cloud Storage, and HTTP URLs — using standard MongoDB query syntax.

**Details:**
- Creates a virtual **federated database instance** (formerly Data Lake).
- Supports aggregation pipeline and MongoDB Query Language across sources.
- Great for running analytics on archived cold data in S3 without importing it into MongoDB.
- Can combine live Atlas data with historical S3 archives in a single query.

**Example — query S3 data:**
```js
// After configuring an S3 data source in Atlas UI / API:
db["s3_orders_archive"].aggregate([
  { $match: { year: 2022 } },
  { $group: { _id: "$region", total: { $sum: "$revenue" } } }
])
```

**Use cases:** Multi-cloud analytics, cost-effective archival queries, cross-source reporting, GDPR data exports.

**Pitfall:** Federated queries over S3 are slower than native Atlas queries. They are optimized for batch analytics, not low-latency application queries.

---

### Q50. How does MongoDB Atlas handle backups and point-in-time recovery?

**Summary:** Atlas offers two backup tiers: **Cloud Backup** (snapshot-based) and **Continuous Cloud Backup** with point-in-time recovery (PITR) down to a 1-second granularity.

**Cloud Backup (snapshots):**
- Scheduled snapshots (hourly, daily, weekly, monthly).
- Snapshots are stored in the cloud provider's object storage.
- Restore to a new cluster, download as archive, or query a snapshot directly.

**Continuous Cloud Backup (PITR):**
- Continuously syncs the oplog to cloud storage.
- Allows restore to any second within the retention window (up to 35 days).
- Useful for "I accidentally deleted all documents 10 minutes ago" scenarios.

**Enable PITR (Atlas UI or API):**
```json
{
  "pitEnabled": true,
  "restoreWindowDays": 7
}
```

**Restore example flow:**
1. Choose cluster → Backup → Restore.
2. Select "Point in Time".
3. Choose the exact timestamp.
4. Restore to a new cluster (recommended) or overwrite existing.

**Pitfall:** PITR increases storage costs and has a slight write performance overhead (oplog syncing). Disable it for dev/test clusters to save cost. Always test restores periodically — untested backups are not backups.

---

*End of MongoDB Interview Question Bank — 50 Questions*
