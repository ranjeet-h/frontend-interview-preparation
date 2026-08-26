# What is sparse index

## 1. The Real-World Problem — When You Actually Hit This

Your `users` collection has 5 million documents. Only 50,000 premium users have a `loyaltyNumber` field. You add `createIndex({ loyaltyNumber: 1 }, { unique: true })` to enforce uniqueness for premium accounts.

Index build finishes and suddenly inserts fail for regular users — MongoDB treats missing `loyaltyNumber` as `null`, and you can only have one document with a missing/null value in a unique index. Or the index is huge because it indexed 5 million entries when only 50,000 matter.

Sparse indexes fix the "index everyone for a rare field" problem.

## 2. The Analogy — Make the Mechanic Obvious

A sparse index is a guest list that only includes people who actually RSVP'd.

If you did not RSVP, you are not on the list. The door staff (MongoDB) does not record "no RSVP" as a row for every person in the city — only attendees get entries. Queries that need "everyone without an RSVP" cannot use that list efficiently because absent guests were never indexed.

## 3. The Full Explanation — How It Actually Works

A sparse index **skips documents where the indexed field is missing** or, for most index types, where the field is `null` (behavior for `null` depends on index type and version — treat missing vs null as something you verify in tests).

`createIndex({ field: 1 }, { sparse: true })`

**What you gain:**

- Smaller index — only documents with the indexed field present are indexed.
- Unique sparse indexes allow **multiple documents without the field** while still enforcing uniqueness among documents that **do** have the field.

**What you pay:**

- Queries that filter on `{ field: null }` or `{ field: { $exists: false } }` often **cannot use** the sparse index efficiently because those documents are not in the index.
- If your query pattern needs "find users without loyaltyNumber," a sparse index on `loyaltyNumber` is the wrong tool.

**Sparse vs missing-only semantics:** In practice, sparse means the index entry exists only when the indexed field has a value MongoDB considers indexable. For unique sparse indexes, multiple docs can lack the field; only one doc can have `null` if null is indexed — know your data shape.

**Modern alternative:** Partial indexes (`partialFilterExpression`) often replace sparse indexes with clearer intent: "index only `status: 'premium'` users."

## 4. See It In Practice — Real Code or Queries

```javascript
// mongosh
db.users.drop();
db.users.insertMany([
  { name: "Alice", loyaltyNumber: "L-1001" },
  { name: "Bob", loyaltyNumber: "L-1002" },
  { name: "Carol" },           // no loyaltyNumber
  { name: "Dave" }             // no loyaltyNumber
]);

// Without sparse: unique index blocks multiple docs missing the field
// With sparse: only docs WITH loyaltyNumber are in the index
db.users.createIndex(
  { loyaltyNumber: 1 },
  { unique: true, sparse: true, name: "loyalty_sparse_unique" }
);

// Works — Carol and Dave both lack the field
db.users.insertOne({ name: "Eve" });

// Fails — duplicate loyalty number among indexed docs
db.users.insertOne({ name: "Frank", loyaltyNumber: "L-1001" });

// Query that CAN use the sparse index
db.users.find({ loyaltyNumber: "L-1001" });

// Query that likely COLLECTION SCAN — missing field not in index
db.users.find({ loyaltyNumber: { $exists: false } });
```

**Inspect index size benefit:**

```javascript
db.users.aggregate([
  { $indexStats: {} }
]);
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a sparse index?**

An index that only includes documents where the indexed field exists (has an indexable value). Documents missing that field are omitted from the index.

**Q: Why use sparse with unique?**

To enforce uniqueness on an optional field — many users without `loyaltyNumber`, but no two premium users share the same number.

**Q: Can a sparse index help a query for missing fields?**

Generally no. If documents without the field are not indexed, equality/`$exists: false` queries scan the collection.

**Q: Sparse vs partial index?**

Sparse is field-presence based. Partial is predicate-based (`partialFilterExpression: { status: "active" }`). Partial is usually clearer when you know the filter upfront.

**Q: Does sparse reduce write cost for all inserts?**

Writes to documents without the field skip index updates for that sparse index — modest win. Main win is smaller index size and correct unique semantics on optional fields.

## 6. The Traps — What Goes Wrong in Production

**Unique without sparse on optional fields.** First user without `phone` succeeds; second user without `phone` hits duplicate key on null.

**Assuming sparse covers `$exists: false` queries.** It does not. You need a different data model or accept collection scans for "missing field" reports.

**Null vs missing confusion.** Some queries on `{ field: null }` may match missing and null differently. Test with your driver and MongoDB version.

**Replacing sparse with partial incorrectly.** `partialFilterExpression: { loyaltyNumber: { $exists: true } }` is often clearer than `sparse: true` and gives explicit planner hints.

**Over-indexing rare fields without query proof.** Sparse shrinks the index but is useless if production queries never filter on that field.

## 7. Compare With Related Concepts

**Sparse index vs partial index:** Sparse = "field exists." Partial = "document matches expression." Partial is more expressive (active users, premium tier, non-deleted rows).

**Sparse index vs normal index:** Normal indexes every document (null/missing still get index entries). Sparse skips absent fields — smaller, but narrower query support.

**Sparse unique vs compound unique:** Compound unique still indexes all documents in the compound key unless partial/sparse rules apply — do not assume optional-field uniqueness without sparse or partial.

**Rule:** Sparse for optional unique fields you query by value; partial when you can state the subset rule explicitly.

## 8. 🧠 The Memory Hook

Sparse = only documents with the field enter the index — perfect for optional unique fields, useless for "find everyone missing the field."
