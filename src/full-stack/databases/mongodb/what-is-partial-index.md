# What is Partial Index

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce app has 10 million orders. Only about 100,000 of them are "pending" at any given time — the rest are completed, cancelled, or refunded. You add a regular index on `status` and `createdAt` to power the customer's "my pending orders" query. The index works, but it's huge — it contains entries for all 10 million orders even though only 1% are ever queried. Write performance slows down because every insert has to update this massive index. Memory pressure increases on your replica set.

Or worse: you try to add a unique index on `email` but you have millions of historical records with missing or null email fields from a legacy migration. The unique index fails because MongoDB treats all those nulls as duplicates.

Partial indexes solve the "index everything when you only need a subset" problem.

## 2. The Analogy — Make the Mechanic Obvious

A partial index is like a VIP guest list at a club that only includes people who actually bought tickets.

Regular index: the bouncer writes down every single person who walks past the club, whether they're going in or not. The list grows forever with irrelevant names.

Partial index: the bouncer only writes down people who show a VIP ticket. If you don't have a ticket, you're not on the list. The list stays small and contains only the people the bouncer actually cares about checking.

When someone asks "is this person on the VIP list?", the bouncer can quickly check the small VIP list. But if someone asks "show me everyone who is NOT on the VIP list," the bouncer has to look at everyone in the city — those people were never written down anywhere.

## 3. The Full Explanation — How It Actually Works

A partial index in MongoDB is an index that only includes documents matching a specific filter condition. You define the condition using `partialFilterExpression` when creating the index:

```javascript
db.orders.createIndex(
  { status: 1, createdAt: -1 },
  { partialFilterExpression: { status: "pending" } }
)
```

**What actually happens:**

- MongoDB evaluates the `partialFilterExpression` for each document
- Only documents that match the condition get an entry in the index
- Documents that don't match are completely absent from the index structure
- The index remains much smaller because it only contains the subset you care about

**What you gain:**

- Smaller index size — less RAM usage, less disk space
- Faster index builds — fewer documents to process
- Lower write cost — inserts/updates on non-matching documents don't touch this index
- Unique constraints on a subset — you can enforce uniqueness only on documents that match your filter

**What you pay:**

- Queries must include the filter condition to use the index — if you query `{ status: "completed" }`, MongoDB cannot use the partial index filtered on `{ status: "pending" }`
- The query planner must recognize that your query shape matches the partial filter — if your filter doesn't match, MongoDB falls back to a collection scan
- You need to understand your query patterns upfront — partial indexes are opinionated about what queries they support

**Partial vs sparse:** Sparse indexes skip documents where the indexed field is missing. Partial indexes skip documents based on any predicate you choose — status values, date ranges, boolean flags, nested field conditions. Partial is more expressive.

**Partial with unique:** This is a powerful combination. You can enforce uniqueness only on documents that match your filter. For example, unique email only for active users, while allowing historical records to have duplicate or null emails.

## 4. See It In Practice — Real Code or Queries

```javascript
// mongosh
db.orders.drop();

// Sample data: mostly completed, few pending
db.orders.insertMany([
  { _id: 1, customerId: "C1", status: "completed", createdAt: new Date("2024-01-01") },
  { _id: 2, customerId: "C1", status: "completed", createdAt: new Date("2024-01-15") },
  { _id: 3, customerId: "C1", status: "pending", createdAt: new Date("2024-02-01") },
  { _id: 4, customerId: "C2", status: "completed", createdAt: new Date("2024-01-20") },
  { _id: 5, customerId: "C2", status: "pending", createdAt: new Date("2024-02-05") },
  { _id: 6, customerId: "C3", status: "cancelled", createdAt: new Date("2024-01-10") },
]);

// Regular index: indexes ALL 6 documents
db.orders.createIndex(
  { status: 1, createdAt: -1 },
  { name: "status_createdAt_regular" }
);

// Partial index: only indexes pending orders (documents 3 and 5)
db.orders.createIndex(
  { status: 1, createdAt: -1 },
  {
    name: "status_createdAt_pending_partial",
    partialFilterExpression: { status: "pending" }
  }
);

// Query that USES the partial index
db.orders.find({ status: "pending" }).sort({ createdAt: -1 });

// Query that CANNOT use the partial index — falls back to regular index or scan
db.orders.find({ status: "completed" });

// Query that USES the partial index — includes the filter condition
db.orders.find({
  status: "pending",
  customerId: "C1"
}).sort({ createdAt: -1 });
```

**Partial index with unique constraint:**

```javascript
db.users.drop();

db.users.insertMany([
  { _id: 1, email: "alice@example.com", active: true },
  { _id: 2, email: null, active: false },           // inactive, no email
  { _id: 3, email: null, active: false },           // inactive, no email
  { _id: 4, email: "bob@example.com", active: true }
]);

// Unique only on ACTIVE users — allows duplicate/null for inactive
db.users.createIndex(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { active: true }
  }
);

// Succeeds — inactive user, not covered by unique constraint
db.users.insertOne({ email: null, active: false });

// Fails — duplicate email among active users
db.users.insertOne({ email: "alice@example.com", active: true });
```

**Inspect which index was used:**

```javascript
db.orders.find({ status: "pending" }).sort({ createdAt: -1 }).explain("executionStats");
```

Look for `indexName` in the `winningPlan` to confirm the partial index was selected.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a partial index in MongoDB?**

An index that only includes documents matching a specific filter condition defined in `partialFilterExpression`. Documents that don't match are omitted from the index entirely, which reduces index size and write cost.

**Q: When would you use a partial index instead of a regular index?**

Use a partial index when your queries consistently filter on a specific subset of data. Common cases: indexing only active users, only pending orders, only non-deleted documents, only documents from the last 30 days. If you regularly query the whole collection without that filter, a regular index is usually better.

**Q: Can a partial index enforce uniqueness on a subset of documents?**

Yes. Combine `unique: true` with `partialFilterExpression`. MongoDB enforces uniqueness only among documents that match the filter. Documents outside the filter are not subject to the unique constraint.

**Q: What happens if I query without including the partial filter condition?**

MongoDB cannot use the partial index for that query. It will either use another available index or fall back to a collection scan. The query planner does not magically rewrite your query to match the partial filter — your query must explicitly include the condition.

**Q: Partial index vs sparse index — what's the difference?**

Sparse indexes skip documents where the indexed field is missing. Partial indexes skip documents based on any predicate you define: status values, date ranges, boolean flags, nested conditions. Partial is more flexible and expressive. Sparse is a special case of partial where the predicate is `{ field: { $exists: true } }`.

**Q: Do partial indexes reduce write performance for all inserts?**

No. Only inserts or updates that affect documents matching the partial filter trigger an index update. Documents outside the filter skip index maintenance entirely, which is a significant win when the filtered subset is small relative to the full collection.

**Q: How do you verify which index a query is using?**

Use `.explain("executionStats")` on your query and check the `winningPlan` section for `indexName`. If the partial index is not being used when you expect it to, your query may not include the filter condition, or the planner may prefer another index.

## 6. The Traps — What Goes Wrong in Production

**Query doesn't include the filter, expects index to work.** You create a partial index on `{ status: "pending" }` but then query `{ status: { $in: ["pending", "processing"] } }`. The planner cannot use the partial index because your query doesn't match the filter exactly. Test with `explain()` to verify index usage.

**Assuming partial index covers all queries on that field.** Partial indexes are not a drop-in replacement for regular indexes. They only support queries that include the filter condition. If your application queries multiple status values, you may need multiple partial indexes or a regular index.

**Partial filter expression doesn't match the actual query shape.** You filter on `{ status: "pending", archived: false }` in the index but query only `{ status: "pending" }`. The planner may not use the index because the predicates don't align. Keep the partial filter aligned with your actual query patterns.

**Using partial index when the subset is large.** If 80% of your documents match the filter, a partial index doesn't save much space or write cost. Partial indexes shine when the subset is small — the 1% to 20% range is where they're most effective.

**Forgetting that partial indexes don't help with "find missing" queries.** Just like sparse indexes, partial indexes cannot efficiently find documents that don't match the filter. If you need to query "all non-pending orders," a partial index on pending orders won't help — those documents aren't in the index.

**Unique partial index without considering historical data.** You add a unique partial index on `email` for active users, but your database already has millions of inactive records with duplicate emails. The index build succeeds, but when you try to reactivate a user, you hit a duplicate key error because the historical record still exists. Clean up data before adding unique constraints.

**Not testing the query plan after adding the partial index.** The planner may choose a different index than you expect, or may not use the partial index at all if statistics are stale. Always verify with `explain()` in a staging environment that matches your production data shape.

## 7. Compare With Related Concepts

**Partial index vs regular index:** Regular indexes every document in the collection. Partial indexes only documents matching a filter. Partial = smaller, cheaper writes, but only supports queries that include the filter. Regular = larger, more expensive writes, but supports any query on the indexed fields.

**Partial index vs sparse index:** Sparse = field-existence based (`{ field: { $exists: true } }`). Partial = any predicate (`{ status: "active" }`, `{ createdAt: { $gte: ... } }`). Partial is more expressive. Use sparse for optional fields; use partial when you know the specific subset rule.

**Partial index vs compound index:** Compound indexes multiple fields together (`{ status: 1, createdAt: -1 }`). Partial can be combined with compound — you can have a compound partial index. The concepts are orthogonal: compound describes what fields are indexed; partial describes which documents are indexed.

**Partial unique vs regular unique:** Regular unique applies to all documents. Partial unique applies only to documents matching the filter. Partial unique allows duplicates or nulls outside the filtered subset, which is essential for enforcing uniqueness on optional fields or historical data cleanup scenarios.

**Rule:** Use partial indexes when you consistently query a small, well-defined subset of your collection and want to save index size and write cost. Use regular indexes when you need broad query support across the entire collection.

## 8. 🧠 The Memory Hook

Partial index = index only the documents that matter, and only queries that ask for that subset can use it.
