# When Should You Reference Documents?

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce application stores orders, and each order points to a customer and a set of products. The first version embeds everything in the order document because it makes the order page fast. Six months later, a customer updates their email address, and support needs to know which orders were affected. The product team changes prices weekly, and now nobody can agree whether an order's embedded price should be historical or current.

The opposite incident happens elsewhere: a chat application embeds every message inside a user document. A popular user with thousands of messages hits MongoDB's 16 MiB document limit, and their profile can no longer be updated. Another user wants to search their messages across conversations, but the embedded structure makes that query impossible without a full collection scan.

Referencing is the design choice that keeps related data in separate documents and connects them with identifiers. The problem is knowing when this independence is worth the extra query cost and consistency complexity.

## 2. The Analogy — Make the Mechanic Obvious

Think of a library catalog. The catalog has one card for each book, listing title, author, and location. Many borrowers can have the same book checked out over time, but the catalog card remains the single authoritative record. A borrower's checkout history stores book IDs, not full book details. When the library relocates a book or changes its classification, only the catalog card needs updating. The checkout history stays correct because it only ever stored a reference.

If the checkout history had copied the entire book description, a classification change would require updating thousands of individual records, and some would inevitably be missed. That is what happens when you embed shared data instead of referencing it.

The card catalog is the referenced document. The checkout history is the parent that stores the reference. The book ID is the join key. Looking up a book by its ID is the reference query. The key insight is that shared, independently changing data should have one authoritative source and be referenced everywhere else.

## 3. The Full Explanation — How It Actually Works

Referencing stores related data in a separate MongoDB document and keeps its `_id` or another unique identifier in the parent document. To read the complete data, the application either performs multiple queries or uses an aggregation pipeline with `$lookup` to join the documents at query time.

```javascript
// orders collection
{
  _id: ObjectId("64b000000000000000000001"),
  customerId: ObjectId("64b000000000000000000002"),
  status: "paid",
  total: 149.97,
  itemIds: [
    ObjectId("64b000000000000000000010"),
    ObjectId("64b000000000000000000011")
  ],
  createdAt: ISODate("2024-01-15T10:30:00Z")
}

// customers collection
{
  _id: ObjectId("64b000000000000000000002"),
  name: "Asha Rao",
  email: "asha@example.com",
  address: {
    line1: "10 Market Street",
    city: "Bristol",
    postalCode: "BS1 1AA"
  }
}

// products collection
{
  _id: ObjectId("64b000000000000000000010"),
  name: "Wireless Mouse",
  price: 29.99,
  category: "Electronics"
}
```

Referencing is the right choice when the related data has an independent lifecycle, is shared across many parents, can grow without a practical bound, or needs to be queried and updated separately. The customer record exists before any orders and continues to exist after orders are archived. The product catalog is shared by every order and changes independently of any single purchase. Comments on a post can grow indefinitely and need their own pagination and moderation.

The tradeoffs are real. A referenced design requires more work to read data: either multiple round trips to the database or a `$lookup` aggregation that must be indexed correctly. Updates across documents are not automatically atomic—changing a customer's email and recalculating their order history spans multiple documents. MongoDB does not enforce foreign key constraints, so the application must handle missing or invalid references explicitly.

Use references when:

1. **The child is shared by many parents.** A product or customer record is referenced by thousands of orders. Updating one authoritative copy is easier than updating thousands of embedded copies.
2. **The child has an independent lifecycle.** Customers exist before orders and persist after orders. Products are managed in a catalog system separate from order processing.
3. **The relationship is many-to-many.** A student enrolls in many courses; a course has many students. Embedding in either direction creates duplication or unbounded arrays.
4. **The child can grow without bound.** Comments, reviews, events, logs, or audit trails should be separate documents with their own pagination and retention policies.
5. **The child needs its own indexes and queries.** You frequently query products by category or customers by region. Keeping them in their own collection with appropriate indexes is more efficient than searching inside embedded arrays.
6. **Access patterns are separate.** Users view their profile on one screen and their order history on another. The data is not always read together, so embedding is not a clear performance win.

Do not use references merely to "normalize" MongoDB like a relational database. The goal is not to eliminate duplication at all costs. The goal is to match the data model to the actual read and write patterns. Embedding a small, bounded, read-together snapshot like an order's shipping address is often correct, even though it duplicates data that also exists in a customer profile.

## 4. See It In Practice — Real Code or Queries

This referenced schema models orders with separate customer and product documents. The order stores only identifiers, not full copies of the related data.

```javascript
// Create a customer
db.customers.insertOne({
  name: "Asha Rao",
  email: "asha@example.com",
  address: {
    line1: "10 Market Street",
    city: "Bristol",
    postalCode: "BS1 1AA"
  },
  createdAt: new Date()
})

// Create products
db.products.insertMany([
  { name: "Wireless Mouse", price: 29.99, category: "Electronics" },
  { name: "USB-C Cable", price: 12.99, category: "Electronics" }
])

// Create an order referencing the customer and products
db.orders.insertOne({
  customerId: ObjectId("64b000000000000000000002"),
  status: "pending",
  items: [
    { productId: ObjectId("64b000000000000000000010"), quantity: 2 },
    { productId: ObjectId("64b000000000000000000011"), quantity: 1 }
  ],
  total: 72.97,
  createdAt: new Date()
})
```

To read an order with its customer and product details, use `$lookup` in an aggregation pipeline. Index the join fields to make this efficient.

```javascript
db.orders.aggregate([
  { $match: { _id: ObjectId("64b000000000000000000001") } },
  {
    $lookup: {
      from: "customers",
      localField: "customerId",
      foreignField: "_id",
      as: "customer"
    }
  },
  { $unwind: "$customer" },
  { $unwind: "$items" },
  {
    $lookup: {
      from: "products",
      localField: "items.productId",
      foreignField: "_id",
      as: "product"
    }
  },
  { $unwind: "$product" },
  {
    $group: {
      _id: "$_id",
      customerId: { $first: "$customerId" },
      status: { $first: "$status" },
      total: { $first: "$total" },
      customer: { $first: "$customer" },
      items: {
        $push: {
          productId: "$items.productId",
          quantity: "$items.quantity",
          name: "$product.name",
          price: "$product.price"
        }
      }
    }
  }
])
```

Create indexes that support the access pattern:

```javascript
// Index for finding orders by customer
db.orders.createIndex({ customerId: 1, createdAt: -1 })

// Index for finding orders by status
db.orders.createIndex({ status: 1, createdAt: -1 })

// _id indexes are automatic, but ensure any custom foreign fields are indexed
db.customers.createIndex({ email: 1 })
db.products.createIndex({ category: 1, price: 1 })
```

When a customer updates their email, only one document changes:

```javascript
db.customers.updateOne(
  { _id: ObjectId("64b000000000000000000002") },
  { $set: { email: "asha.new@example.com" } }
)
```

All existing orders remain correct because they store only the customer ID, not the email. If the email had been embedded, every order would need updating, and some would inevitably be missed.

For a many-to-many relationship like students and courses, use a junction collection:

```javascript
// enrollments collection
{
  _id: ObjectId("..."),
  studentId: ObjectId("64b000000000000000000001"),
  courseId: ObjectId("64b000000000000000000005"),
  enrolledAt: ISODate("2024-01-15T00:00:00Z"),
  grade: null
}

// Find all courses for a student
db.enrollments.aggregate([
  { $match: { studentId: ObjectId("64b000000000000000000001") } },
  {
    $lookup: {
      from: "courses",
      localField: "courseId",
      foreignField: "_id",
      as: "course"
    }
  },
  { $unwind: "$course" },
  { $project: { course: 1, enrolledAt: 1, grade: 1 } }
])
```

## 5. Interview Questions — All of Them, Done Properly

**Q: When should you reference documents instead of embedding them?**

Reference when the related data is shared across many parents, has an independent lifecycle, can grow without bound, needs its own queries and indexes, or has access patterns that are separate from the parent. Common examples are product catalogs, customer records, and many-to-many relationships.

**Q: What are the downsides of referencing?**

Reads may require multiple queries or a `$lookup` aggregation, which adds latency and complexity. Updates across documents are not automatically atomic, so cross-document invariants may require transactions or careful workflow design. MongoDB does not enforce referential integrity, so the application must handle missing or dangling references.

**Q: Does referencing mean you should never duplicate data?**

No. Some duplication is intentional and correct. An order should often embed a snapshot of the product price and customer address at the time of purchase for historical accuracy. Reference the mutable current data, but embed the historical snapshot when the business requires an audit trail.

**Q: How do you handle updates that must span multiple referenced documents?**

Use a MongoDB transaction when the invariant truly requires atomicity across documents, such as transferring funds between accounts. For other cases, design idempotent workflows that tolerate temporary inconsistency, use background jobs to reconcile state, or reshape the data model so the invariant fits within a single document.

**Q: What indexes do you need for a referenced design?**

Index the foreign key fields used in `$lookup` and application queries. For orders referencing customers, index `orders.customerId`. For enrollments referencing students and courses, index `enrollments.studentId` and `enrollments.courseId`. Also index any fields used to filter or sort the foreign collection in joins.

**Q: When would you use a junction collection?**

Use a junction collection for many-to-many relationships where neither side naturally owns the other. Students and courses, users and groups, or products and categories are typical examples. The junction document stores both foreign keys plus any relationship-specific data like enrollment date or role.

**Q: How does referencing affect pagination?**

Referencing makes pagination straightforward because each collection can be paginated independently using its own index on `_id`, `createdAt`, or another sort field. Embedded arrays require more complex pagination using `$slice` or `$elemMatch`, and they become impractical when the array is large.

## 6. The Traps — What Goes Wrong in Production

**Referencing everything to avoid duplication.** A page that needs five small records now performs five round trips or a complex aggregation. Embed data that is owned, bounded, and routinely read together. Duplicated snapshots are acceptable when they represent historical truth.

**Forgetting to index foreign keys.** A `$lookup` on an unindexed field triggers a collection scan for every document, making the join exponentially slower as data grows. Always index the fields used as foreign keys in joins.

**Assuming references are automatically valid.** A product deletion or a failed migration can leave dangling IDs in orders. Validate references when writing, define behavior for missing references when reading, and run cleanup jobs where the business invariant requires it.

**Using `$lookup` without considering cardinality.** A one-to-many join returns an array, and code that expects a single object will fail. Always handle the array shape, use `$unwind` when appropriate, and set `preserveNullAndEmptyArrays` when unmatched records must be visible.

**Ignoring the cost of cross-document updates.** Changing a customer's email is cheap when only the customer document updates. If the application must recalculate order totals, update loyalty points, or send notifications across many documents, the referenced design may become a bottleneck. Consider event sourcing or background jobs for heavy cross-document effects.

**Treating references as foreign key constraints.** MongoDB does not prevent you from inserting an order with a non-existent customer ID, nor does it cascade deletes. The application must enforce these rules through validation, transactions, or cleanup workflows.

**Embedding unbounded data to avoid joins.** A comments array that grows indefinitely will eventually cause performance problems and hit the 16 MiB document limit. Reference comments separately and paginate them, even if it means using `$lookup` or separate queries.

## 7. Compare With Related Concepts

| Choice | Key difference | Use this rule |
|---|---|---|
| Reference vs embed | Reference keeps independently managed data separate; embed keeps owned, bounded data together | Reference shared, independently growing, or separately queried data; embed bounded, parent-owned data |
| Reference vs `$lookup` | Reference is the data model; `$lookup` is the query mechanism for joining referenced data | Model with references when data should be separate; use `$lookup` when you need to join at query time |
| Reference vs junction collection | Reference is a simple one-to-many pointer; a junction collection models many-to-many with relationship metadata | Use direct reference for one-to-many; use a junction collection for many-to-many |
| Reference vs foreign key | Reference stores an ID without enforcement; a foreign key is a constraint that prevents invalid references | Use references in MongoDB and enforce validity in application code or transactions |
| Snapshot vs reference | A snapshot preserves historical values; a reference reads the current value | Reference for current mutable data; embed snapshots for historical records like order prices |

## 8. 🧠 The Memory Hook

Give data its own home when it has its own life, many owners, or unbounded growth. Store an ID and look it up when you need it. Keep a snapshot inside the parent only when you need to remember what the value was at a specific moment in time.
