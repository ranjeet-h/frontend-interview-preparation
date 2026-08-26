# How do you handle timestamps

## 1. The Real-World Problem — When You Actually Hit This

Your order history is sorted by `createdAt`, but some orders have no timestamp, some were written with local time, and an admin edit silently changes the original creation time. A customer in London and a worker in New York now see different dates for the same event. Pagination also becomes unreliable because two records share a timestamp and the API has no tie-breaker.

This is why timestamps need a deliberate persistence policy. In Mongoose, `timestamps: true` gives documents `createdAt` and `updatedAt`, but it does not decide what those fields mean, repair old records, or make every direct MongoDB write safe.

## 2. The Analogy — Make the Mechanic Obvious

Think of each document as a parcel moving through a warehouse. `createdAt` is the date printed when the parcel first enters the warehouse. `updatedAt` is the latest scan showing when its label or contents changed.

The intake desk prints the first date once. Every later Mongoose write can create a new scan, but it must not rewrite the intake date. A shipment report can sort by both scans and parcel ID, while the customer-facing app converts the stored instant into the viewer's local timezone. A manual database edit that skips the desk is like changing a label without a scan: it may be possible, but the audit trail is no longer trustworthy.

## 3. The Full Explanation — How It Actually Works

With this schema option:

```js
const orderSchema = new mongoose.Schema(
	{ status: String, totalCents: Number },
	{ timestamps: true }
);
```

Mongoose adds `createdAt` and `updatedAt` as `Date` paths. On insert, both receive the current instant. On normal document saves, `updatedAt` is refreshed and `createdAt` is treated as immutable. The values are stored by MongoDB as BSON dates, not as formatted strings.

Timestamp behavior depends on the operation:

- `Model.create()`, `new Model().save()`, and `insertMany()` set both fields for new documents.
- `save()` refreshes `updatedAt` when the document is saved.
- `updateOne()`, `updateMany()`, and `findOneAndUpdate()` automatically add timestamp updates when timestamps are enabled. Use `{ timestamps: false }` to suppress automatic timestamp changes during a deliberate historical repair, but remember that it does not bypass immutable `createdAt`; use `{ overwriteImmutable: true }` or a controlled direct database migration when repairing that field.
- Query updates do not run full `save` middleware. If an update needs business logic beyond timestamps, use the appropriate query middleware or load the document and call `save()`.
- `replaceOne()` and `findOneAndReplace()` replace the whole document. Replacement operations need extra care because replacement data can define timestamp values; do not use them casually when `createdAt` must remain immutable.

You can rename the fields when the API or legacy schema requires it:

```js
{ timestamps: { createdAt: 'created_on', updatedAt: 'updated_on' } }
```

JavaScript `Date` values represent an instant as milliseconds from the Unix epoch. MongoDB stores that instant in UTC. UTC is the storage and comparison rule; timezone conversion belongs at the presentation boundary. Keep business-local concepts such as the store's trading day explicit with a timezone-aware application rule instead of assuming the server's local timezone.

Timestamps are useful for ordering, cache validators, retention, and debugging, but they are not automatically an audit log. `updatedAt` tells you when the current document changed, not who changed it, which fields changed, or what the previous values were. Add actor and change-history data when those facts matter.

## 4. See It In Practice — Real Code or Queries

This example assumes Mongoose 7 or later and a MongoDB instance at `mongodb://127.0.0.1:27017/time-demo`. It demonstrates inserts, document saves, atomic updates, and JSON serialization.

```js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
	{
		customerId: { type: String, required: true },
		status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
		totalCents: { type: Number, required: true, min: 0 },
	},
	{ timestamps: true }
);

// The pair supports recent-order queries and gives equal timestamps a tie-breaker.
orderSchema.index({ customerId: 1, createdAt: -1, _id: -1 });

const Order = mongoose.model('Order', orderSchema);

async function main() {
	await mongoose.connect('mongodb://127.0.0.1:27017/time-demo');

	const order = await Order.create({ customerId: 'customer-7', totalCents: 2499 });
	console.log(order.createdAt instanceof Date); // true
	console.log(order.createdAt.getTime() <= order.updatedAt.getTime()); // true

	const originalCreatedAt = order.createdAt.getTime();
	order.status = 'paid';
	await order.save(); // refreshes updatedAt, preserves createdAt
	console.log(order.createdAt.getTime() === originalCreatedAt); // true

	await Order.updateOne(
		{ _id: order._id },
		{ $set: { totalCents: 2999 } }
	); // Mongoose updates updatedAt for this query operation

	const recentOrders = await Order.find({ customerId: 'customer-7' })
		.sort({ createdAt: -1, _id: -1 })
		.lean();
	console.log(JSON.stringify(recentOrders)); // Date values serialize as ISO strings

	await mongoose.disconnect();
}

main().catch(async (error) => {
	console.error(error);
	await mongoose.disconnect();
	process.exitCode = 1;
});
```

For a legacy collection, backfill missing values with an explicit UTC instant. A migration should be idempotent and should not pretend that the chosen backfill time is the historical creation time:

```js
// Run in mongosh during a controlled migration.
const backfillTime = new Date('2026-08-25T00:00:00.000Z');

db.orders.updateMany(
	{
		$or: [
			{ createdAt: { $exists: false } },
			{ updatedAt: { $exists: false } }
		]
	},
	[
		{
			$set: {
				createdAt: { $ifNull: ['$createdAt', backfillTime] },
				updatedAt: { $ifNull: ['$updatedAt', backfillTime] }
			}
		}
	]
);
```

Build the index after checking its cost and the query shape. The compound index above lets MongoDB seek to one customer and read newest orders in order. Confirm with `explain('executionStats')`; declaring an index in a schema does not prove that a production query uses it.

## 5. Interview Questions — All of Them, Done Properly

**Q: What does `timestamps: true` do in Mongoose?**

It adds `createdAt` and `updatedAt` date paths and manages them for supported create, save, and update operations. It is application-layer behavior. MongoDB does not know about the Mongoose option, and writes through another driver can bypass it.

**Q: Is `createdAt` really immutable?**

For normal Mongoose document and query updates, Mongoose protects `createdAt` and refreshes `updatedAt`. That protection is not a universal database constraint: replacement operations and direct MongoDB writes can change the fields. If immutability is a hard invariant, restrict write access and use database or migration controls as well.

**Q: Does `updatedAt` change when nothing meaningful changes?**

It can change whenever an update operation runs, even if the resulting value is effectively the same. Treat it as the last persistence update, not a perfect semantic change detector. If cache invalidation depends on meaningful changes, compare or version the relevant fields explicitly.

**Q: Do timestamps run for `updateOne()` and `findOneAndUpdate()`?**

Yes, Mongoose adds timestamp updates to these operations when the schema has timestamps enabled. They still do not run document `save` middleware. Use `{ runValidators: true }` when update validators are required, and use `{ timestamps: false }` only when bypassing timestamp changes is intentional.

**Q: Why store UTC instead of local time?**

UTC gives every service one unambiguous instant for ordering and comparison. Local time depends on a region and daylight-saving rules. Convert UTC to a user's or business location's timezone only when formatting or applying a clearly defined local-calendar rule.

**Q: How would you index timestamps?**

Index the complete access pattern, not `createdAt` by habit. For recent orders per customer, `{ customerId: 1, createdAt: -1, _id: -1 }` supports the equality filter, ordering, and deterministic pagination. Verify with `explain()` and account for the write and storage cost of every index.

## 6. The Traps — What Goes Wrong in Production

**Using formatted strings as stored timestamps.** Strings sort lexicographically and may contain different offsets or formats. Store BSON `Date` values and serialize them as ISO strings only at the API boundary.

**Assuming timestamps protect native-driver or shell writes.** A script using `db.orders.updateOne()` does not pass through Mongoose. Centralize writes, restrict database permissions, and add MongoDB-side controls or audits where multiple writers are unavoidable.

**Treating `updatedAt` as an audit history.** It cannot answer who changed a price or what the previous price was. Use an append-only audit collection or change stream when history and actor identity are requirements.

**Sorting only by `createdAt`.** Millisecond precision does not guarantee uniqueness. Add `_id` as a stable tie-breaker and include the same pair in keyset-pagination cursors.

**Backfilling with the migration's current time and calling it historical truth.** A backfill can restore a required field, but it cannot recover an unknown event time. Record the assumption in the migration and keep provenance if consumers need to distinguish estimated values.

**Letting replacement updates rewrite creation time.** `findOneAndReplace()` replaces the document shape and can behave differently from `$set` updates. Prefer targeted operators for edits, or preserve and validate the original `createdAt` explicitly during a replacement migration.

**Using server-local time for date boundaries.** A daily report built with the host timezone changes meaning after deployment to another region. Define the reporting timezone, convert its boundaries to UTC, and query with an inclusive start and exclusive end.

## 7. Compare With Related Concepts

**`createdAt` vs `updatedAt`:** `createdAt` is the first persistence instant; `updatedAt` is the latest timestamp Mongoose applied during a write. Use `createdAt` for age and initial ordering, and `updatedAt` for freshness or cache revalidation.

**Mongoose timestamps vs an audit log:** timestamps keep two summary fields on the current document; an audit log keeps a sequence of changes, usually with actor, operation, and before/after data. Use timestamps for ordinary lifecycle metadata and an audit log for traceability or compliance.

**UTC `Date` vs a formatted ISO string:** a BSON date is a typed instant that MongoDB can compare and index; an ISO string is a transport representation. Store the date, then produce an ISO string in JSON or an explicitly localized display value for clients.

**`save()` vs `updateOne()`:** `save()` works with a hydrated document and runs document validation and save middleware; `updateOne()` is an atomic query update and can update timestamps without loading the document, but it does not run save middleware. Use the operation whose lifecycle guarantees match the invariant you need.

## 8. 🧠 The Memory Hook

`createdAt` is the parcel's first intake stamp; `updatedAt` is its latest scan. Keep both as UTC instants, never confuse the latest scan with a full history, and always ask whether every write path is visiting the same warehouse desk.
