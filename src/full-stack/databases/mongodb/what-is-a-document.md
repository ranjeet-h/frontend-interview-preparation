# What is a document

## 1. The Real-World Problem — When You Actually Hit This

Your API returns a user profile: name, avatar URL, three addresses, notification preferences, and the last five orders with line items. In SQL you write a service that hits `users`, `addresses`, `preferences`, `orders`, `order_items` — or one gnarly query with four joins — then manually nests the result into JSON.

In MongoDB you store one **document** that already looks like that JSON. The mobile client gets one round trip. The bug report says "preferences.notifications.email is undefined for user 4421" — you open one document in Compass and see the whole truth.

That is the document model: the unit of storage matches the unit your application thinks in. Get the document wrong — unbounded arrays, duplicated data, missing [ObjectIds](what-is-objectid.md) — and you pay later in size limits and update pain.

## 2. The Analogy — Make the Mechanic Obvious

A document is a **complete manila folder** for one thing: one customer, one order, one blog post.

Inside you can staple sub-folders (nested objects) and clip lists (arrays). Everything about that one thing lives together until you deliberately split it into another drawer ([collection](what-is-a-collection.md)) and leave a reference slip (`userId: ObjectId("...")`).

SQL gives you one form per fact (row per address). MongoDB gives you one packet per aggregate when you design for it.

## 3. The Full Explanation — How It Actually Works

A **document** is a BSON record — a set of field names and values. It looks like JSON with extensions: `ObjectId`, `Date`, `Decimal128`, binary data, etc. Stored in a [collection](what-is-a-collection.md).

**Required piece:** `_id` — unique per document in the collection. Defaults to an [ObjectId](what-is-objectid.md) if you don't supply one.

**Field types:** strings, numbers, booleans, null, arrays, embedded objects, dates, ObjectId, and more. Arrays and nesting are first-class, not serialized strings.

**Size limit:** 16 MB per document (hard limit). Plan [embedding](when-should-you-embed-documents.md) with this ceiling.

**Atomicity:** Single-document updates are atomic. Multi-document changes need [transactions](what-are-mongodb-transactions.md) or careful idempotent design.

**Schema flexibility:** Two documents in the same collection can have different fields. Production apps still converge on a shape via code or validation.

**Immutability of `_id`:** Don't change `_id` after insert. Updates target `_id` or other indexed fields.

Documents on disk are [BSON](what-is-bson.md), not plain JSON — extra types and efficient binary encoding.

## 4. See It In Practice — Real Code or Queries

Insert a document:

```javascript
db.orders.insertOne({
  orderNumber: "ORD-9281",
  customer: {
    name: "Alice Chen",
    email: "alice@example.com"
  },
  items: [
    { sku: "WB-12", qty: 2, price: 24.5 },
    { sku: "MG-01", qty: 1, price: 89.0 }
  ],
  status: "paid",
  createdAt: new Date()
})
// MongoDB adds _id: ObjectId("...")
```

Read and update nested fields:

```javascript
db.orders.findOne({ orderNumber: "ORD-9281" })

db.orders.updateOne(
  { orderNumber: "ORD-9281" },
  { $set: { "items.0.qty": 3 }, $inc: { version: 1 } }
)
```

Array operators:

```javascript
db.orders.updateOne(
  { orderNumber: "ORD-9281" },
  { $push: { notes: { text: "Customer called", at: new Date() } } }
)
```

Projection — return part of a document:

```javascript
db.orders.findOne(
  { orderNumber: "ORD-9281" },
  { projection: { "customer.email": 1, items: 1, _id: 0 } }
)
```

Reference another document instead of embedding:

```javascript
db.orders.insertOne({
  orderNumber: "ORD-9282",
  userId: ObjectId("507f1f77bcf86cd799439011"),
  total: 149.99
})
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a document in MongoDB?**

A BSON object stored in a collection, with a unique `_id`. It's the atomic unit of storage and the usual unit of atomic updates. Structure can include nested objects and arrays.

**Q: Document vs row?**

A row fits a table schema; a document is self-describing and can nest related data. One document might represent what SQL would spread across multiple joined rows.

**Q: What is the 16 MB limit?**

Maximum BSON document size. Unbounded embedded arrays (comments, events) hit this. Use [referencing](when-should-you-reference-documents.md), bucketing, or archiving.

**Q: Are documents schema-less?**

No required fixed schema per collection, but real apps enforce shape. Optional MongoDB JSON Schema validation on insert/update.

**Q: How do you version documents?**

`version` field with optimistic locking (`updateOne` with `version: current`), or embed history in a separate collection for audit trails.

## 6. The Traps — What Goes Wrong in Production

**Documents as large blobs.** Storing PDFs or images inside documents — use GridFS or S3; keep documents metadata-sized.

**Unbounded `$push` on arrays.** Every comment appended forever — document grows until 16 MB and slow reads. Cap, bucket, or [reference](when-should-you-reference-documents.md).

**Inconsistent field names.** `userId` vs `user_id` vs `user` — breaks queries and indexes. Enforce naming in code.

**Missing `_id` in API design.** Exposing internal ObjectIds is fine; using email as `_id` blocks email changes.

**Deep nesting without query plan.** Updating `a.b.c.d.e` everywhere is painful. Flatten fields you filter on; index those paths.

## 7. Compare With Related Concepts

| Concept | Difference | Rule |
|--------|------------|------|
| [Collection](what-is-a-collection.md) | Container for many documents | One entity family per collection |
| [BSON](what-is-bson.md) | Binary encoding of documents on wire/disk | JSON-like in apps; BSON in storage |
| [ObjectId](what-is-objectid.md) | Default `_id` type | Unique, sortable by creation time roughly |
| JSON column (SQL) | One column holds JSON | Document DB makes the whole record structured data |
| [Embed vs reference](embedding-vs-referencing.md) | One doc vs linked docs | Shape one document by how you read and update it |

## 8. 🧠 The Memory Hook

A document is the whole folder for one thing your app cares about in one grab — nested lists and sub-objects included — until size or shared data forces you to split into a second folder and leave a pointer.
