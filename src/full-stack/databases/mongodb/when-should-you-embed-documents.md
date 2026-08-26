# When Should You Embed Documents?

## 1. The Real-World Problem — When You Actually Hit This

Your product page needs to show a product and its small set of options in one request. If options live in a separate collection, every page load may need another query, a join-like `$lookup`, or application-side assembly. But embedding every related record is not automatically better: a popular product can grow without bound, and changing one shared value in thousands of embedded copies becomes an operational problem.

The decision is therefore not “MongoDB has nested objects, so nest everything.” It is a data-modeling choice: keep data together when it is naturally part of one aggregate, has bounded growth, and is usually read and changed together.

## 2. The Analogy — Make the Mechanic Obvious

Think of a travel folder. A boarding pass belongs inside the folder for one trip because it is small, has no useful life outside that trip, and is normally opened with the rest of the itinerary. A country-wide airport directory does not belong in every folder: it is large, shared, and updated independently.

An embedded document is the boarding pass. The parent document is the trip folder. Reading the parent brings the child along in one operation, and updating the parent can update both pieces atomically. A referenced document is the airport directory: the folder stores an ID, then the application fetches the shared record separately. The analogy breaks when a “boarding pass” can grow into a suitcase, so bounded size matters as much as ownership.

## 3. The Full Explanation — How It Actually Works

Embedding stores related data inside the same BSON document, usually as a nested object or an array. For example, a product can contain its own bounded option values:

```js
{
	_id: ObjectId("..."),
	name: "Trail shoes",
	options: [
		{ sku: "TRAIL-42-BLK", size: 42, color: "black", stock: 8 },
		{ sku: "TRAIL-43-BLK", size: 43, color: "black", stock: 3 }
	]
}
```

MongoDB reads the document as one record, so this shape is a good fit when the application normally asks for the product and its options together. It also lets a single-document update change fields in that aggregate atomically. That does not make a multi-document workflow atomic; if an order, inventory record, and payment record must change together, use a transaction or redesign the workflow.

Use embedding when the child has a strong “belongs to this parent” relationship, the number of children is bounded or has a firm operational limit, and the child is not independently queried or shared across many parents. Common examples are an address snapshot on an order, a small set of product options, or a user’s bounded preferences.

Avoid embedding when the array can grow indefinitely, when children are large, when children are frequently read without the parent, or when the same current value must be updated everywhere. MongoDB documents have a 16 MiB maximum size, but reaching that limit is not the only failure: very large documents increase network payloads, memory use, write amplification, and the chance that one hot parent becomes a write bottleneck.

The read and write pattern decides the shape. Embedding makes a parent read cheap and local, but updating one array element still rewrites part of the parent document and can create contention when many clients update the same parent. Referencing makes independently paginated or frequently changing children easier to manage, but reads become multiple queries or an aggregation with `$lookup`. Measure the dominant access paths instead of choosing from relationship vocabulary alone.

Duplication is sometimes the correct trade-off. An order should usually embed the shipping address used at purchase time, because that historical snapshot must not change when the customer edits their profile. The same customer’s current address can remain in a user document. This is intentional duplication with different meanings, not an accidental copy of one source of truth. If an embedded value is merely a cache of shared data, define which copy is authoritative and how stale copies are refreshed.

## 4. See It In Practice — Real Code or Queries

This schema embeds bounded options and uses one document update to reserve stock for a specific SKU:

```js
db.products.insertOne({
	name: "Trail shoes",
	options: [
		{ sku: "TRAIL-42-BLK", size: 42, color: "black", stock: 8 },
		{ sku: "TRAIL-43-BLK", size: 43, color: "black", stock: 3 }
	]
});

db.products.findOneAndUpdate(
	{ _id: productId, options: { $elemMatch: { sku: "TRAIL-42-BLK", stock: { $gt: 0 } } } },
	{ $inc: { "options.$.stock": -1 } },
	{ returnDocument: "after" }
);
```

The stock predicate and decrement apply to one product document. If two clients race, the `$gt: 0` condition prevents a successful update after stock reaches zero. The application must still handle a `null` result as “not found or no stock”; it should not assume the update succeeded.

An order embeds a snapshot rather than referencing a mutable user address:

```js
db.orders.insertOne({
	userId,
	items: [{ sku: "TRAIL-42-BLK", name: "Trail shoes", quantity: 1, unitPrice: 89.99 }],
	shippingAddress: {
		line1: "10 Market Street",
		city: "Bristol",
		postalCode: "BS1 1AA",
		country: "GB"
	},
	placedAt: new Date()
});
```

A product’s reviews are a poor embedding candidate if they can grow indefinitely or need their own moderation and pagination. In that case, store `productId` on review documents and query reviews separately, while keeping only bounded summary data such as `reviewCount` and `averageRating` on the product if that read is important.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is the main rule for deciding whether to embed?**

Embed when related data is owned by one parent, bounded in size, and commonly read or written with that parent. Reference when it grows without a reliable bound, is shared, has an independent lifecycle, or is commonly queried on its own.

**Q: Does embedding make reads faster?**

Often, for the access pattern it was designed for. A product and its embedded options can be fetched with one document read instead of assembling data from several collections. The trade-off is a larger payload and less flexible independent querying. An unbounded embedded array can make reads slower, not faster.

**Q: When is duplication acceptable?**

When the duplicated value represents a deliberate snapshot or read-optimized projection, and the application has a clear authority and update policy. An order’s shipping address should preserve what was used at checkout. A copied current profile field needs a refresh strategy if it must stay current.

**Q: How does embedding affect atomicity?**

MongoDB guarantees atomic writes at the single-document level. Fields in one embedded aggregate can be changed together without a multi-document transaction. Embedding does not provide atomicity across separate documents, services, or external systems.

**Q: Why not embed an unbounded one-to-many relationship?**

The parent can approach the 16 MiB document limit, updates become more expensive, and one parent can become a contention hotspot. Independent pagination, moderation, retention, and indexing also become awkward. Store the children separately and keep bounded counters or summaries on the parent when useful.

**Q: How would you change the model if both parent and child reads dominate?**

Use references, or use a hybrid model. Keep independently queried child documents in their own collection and embed a small summary or snapshot in the parent. The correct answer follows measured query shapes and freshness requirements, not a universal normalization rule.

## 6. The Traps — What Goes Wrong in Production

- **Embedding an unbounded array:** It works in development, then a single popular parent grows toward the document limit. Put a hard bound on the embedded collection, archive old entries, or reference the entries separately.
- **Treating shared data as owned data:** Copying a mutable category name or permission set into many parents creates stale and contradictory values. Reference shared records, or explicitly maintain a projection when stale data is acceptable.
- **Confusing one-document atomicity with a transaction:** Updating an embedded order field and a separate inventory document is still a multi-document operation. Use a transaction where the invariant requires it, or design an idempotent workflow that tolerates partial progress.
- **Ignoring write contention:** Many updates to different array elements still target the same parent document. If one parent is a hot counter or inventory bucket, partition the writes into separate documents.
- **Using a snapshot without naming it:** A historical address or price should be intentionally immutable after the event. Store the snapshot and current source separately so later readers do not mistake history for live profile data.
- **Choosing based only on fewer queries:** One large document read can be worse than two targeted reads when most callers need only a small child subset. Check payload size, selectivity, update frequency, and latency under realistic data volume.

## 7. Compare With Related Concepts

**Embedding vs referencing:** Embedding optimizes an aggregate read and single-document atomic updates. Referencing optimizes independent lifecycle, unbounded growth, sharing, and targeted queries. Use embedding for bounded owned data; use references for independently managed or growing data.

**Embedding vs `$lookup`:** Embedding stores the relationship together ahead of time. `$lookup` assembles referenced documents at query time. Use `$lookup` when the data must remain separate, and accept its query and indexing cost rather than using it to hide a poor access pattern.

**Embedding vs denormalization:** Embedding is one form of denormalization, but denormalization can also mean copying selected fields between separate documents. Use embedding when the copied data belongs to the parent aggregate; use a separate projection when it is a read model with its own refresh behavior.

**Embedding vs a transaction:** Embedding can remove the need for a transaction when the invariant fits inside one document. A transaction is for a coordinated change across multiple documents or collections. Do not add a transaction to compensate for an aggregate that should have been modeled together, and do not embed data merely to avoid every transaction.

## 8. 🧠 The Memory Hook

Put the boarding pass in the trip folder: bounded, owned, and usually opened together. If it grows into luggage, is shared by many trips, or changes on its own, give it its own record and keep only the small snapshot or summary the parent actually needs.
