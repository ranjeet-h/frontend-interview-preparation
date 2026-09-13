# MongoDB `$project`

## 1. The Real-World Problem — When You Actually Hit This

An orders endpoint starts returning whole MongoDB documents: internal notes, supplier cost, audit metadata, and a large embedded history array. The response is slower and larger than it needs to be, and one careless API change can expose a field that the customer must never see. MongoDB needs a deliberate way to shape each aggregation result before it crosses the service boundary. That is the job of the `$project` stage.

## 2. The Analogy — Make the Mechanic Obvious

Think of a records clerk preparing a copy of a file for a customer. The original folder stays intact, but the clerk chooses which pages to copy, can calculate a new total on the cover sheet, and can label a page with a customer-friendly name. `$project` is that copy step: it creates the next document in the aggregation pipeline with selected fields and expressions.

The clerk's copy is not the source file, and it is not an authorization decision. A manager must still decide whether the customer is allowed to receive the file at all. Likewise, `$project` shapes pipeline output, while application authorization must decide whose data the request may read.

## 3. The Full Explanation — How It Actually Works

`$project` changes the shape of documents flowing through an aggregation pipeline. It can include existing fields, exclude fields, compute new values, and rename a field by assigning its path to another output name. It does not update the stored document.

MongoDB supports two projection styles. In inclusion mode, set fields to `1` (or `true`) and only those fields are kept, along with `_id` by default. In exclusion mode, set fields to `0` (or `false`) and those fields are removed while the other fields remain. You may exclude `_id` alongside included fields, but you cannot mix ordinary inclusion and exclusion in the same `$project` specification. Computed expressions use inclusion-style projection.

For example, this keeps only the public order shape and removes the default identifier:

```javascript
{
	$project: {
		_id: 0,
		orderNumber: 1,
		status: 1,
		total: 1
	}
}
```

This is exclusion mode:

```javascript
{
	$project: {
		_id: 0,
		internalNotes: 0,
		supplierCost: 0
	}
}
```

Expressions let the output contain values that were not stored under that exact name. A computed field can add tax, format a value, or derive a boolean. A renamed field is simply an expression that reads another path:

```javascript
{
	$project: {
		_id: 0,
		id: "$_id",
		customerName: "$customer.name",
		grandTotal: { $add: ["$subtotal", "$shipping"] },
		hasDiscount: { $gt: ["$discount", 0] }
	}
}
```

The stage sees the document produced by the previous stage. Therefore `$match` commonly comes first to reduce the number of documents, and `$project` later shapes the result for the API. Moving `$project` early can make the pipeline easier to reason about, but it does not automatically make every aggregation faster: MongoDB may already optimize field use, and later stages may still need fields you removed. Never project away a field that a later `$match`, `$sort`, `$group`, or expression needs.

Projection is useful for payload control and accidental-exposure reduction, but it is not a complete security boundary. The query must first be constrained by the authenticated user's tenant or ownership rules, and the service should expose a deliberately designed response schema. A role-based policy may choose a different projection for an administrator, but the client must not be allowed to request arbitrary sensitive paths.

## 4. See It In Practice — Real Code or Queries

The following `mongosh` example assumes an `orders` collection with fields such as `_id`, `customer`, `subtotal`, `shipping`, `internalNotes`, and `supplierCost`:

```javascript
db.orders.aggregate([
	// Filter by ownership before shaping the response.
	{ $match: { tenantId: "tenant-42", customerId: "customer-7" } },
	{
		$project: {
			_id: 0,
			orderId: { $toString: "$_id" },
			customerName: "$customer.name", // Rename a nested stored field.
			status: 1,
			total: { $add: ["$subtotal", "$shipping"] },
			hasDiscount: { $gt: ["$discount", 0] }
		}
	}
])
```

An input document might produce this response:

```javascript
{
	orderId: "65f1c2a1e8b9c00123456789",
	customerName: "Asha Rao",
	status: "shipped",
	total: 54.5,
	hasDiscount: true
}
```

For a simple removal-only pipeline, use exclusion mode consistently:

```javascript
db.orders.aggregate([
	{
		$project: {
			_id: 0,
			internalNotes: 0,
			supplierCost: 0,
			auditTrail: 0
		}
	}
])
```

When the API needs a stable public contract, an inclusion projection is usually safer than excluding today's known private fields. New fields added to the document will not silently appear in the response. The application still needs authorization and response validation; `$project` is one layer of the boundary, not the whole boundary.

## 5. Interview Questions — All of Them, Done Properly

**Q: What does `$project` do in a MongoDB aggregation pipeline?**

It creates the next document shape in the pipeline. It can select or remove fields and can calculate or rename output fields. It does not mutate the collection, so the stored document remains unchanged.

**Q: Can `$project` include and exclude fields at the same time?**

Not ordinary fields. A projection must use inclusion or exclusion mode. The exception is `_id`: it can be excluded while other fields are included. If a computed field is needed, use inclusion-style projection rather than mixing it with ordinary exclusions.

**Q: How do you rename a field with `$project`?**

Assign the source path to the new output name, such as `customerName: "$customer.name"`. This creates `customerName` in the pipeline result; it does not rename the field in stored documents. If the source path is missing, the output value is generally absent rather than magically filled in.

**Q: Why use `$project` instead of returning the whole document from an API?**

It reduces response size, avoids sending fields the client does not need, and creates an explicit response shape. An inclusion projection also prevents newly added database fields from leaking into an endpoint by default. Authorization must still happen separately because projection does not decide whether a user may read a document.

**Q: Where should `$project` appear relative to `$match`?**

Put the ownership and business filters in `$match` as early as practical, then project the public response. That makes the security intent visible and reduces downstream work. An early projection is valid only if it preserves every field required by later stages, and it is not a replacement for filtering.

## 6. The Traps — What Goes Wrong in Production

**Mixing inclusion and exclusion.** A developer writes `{ name: 1, internalNotes: 0 }` and expects both rules to work. MongoDB rejects this shape because it cannot infer whether the output should be an allow-list or a deny-list. Use `{ name: 1, _id: 0 }` for inclusion or `{ internalNotes: 0 }` for exclusion.

**Treating projection as authorization.** Removing `salary` from a response does not prevent a user from querying another user's document if the `$match` stage lacks an ownership or tenant predicate. Filter by the authenticated identity first, and keep sensitive field selection on the server.

**Using exclusion mode for a public contract.** `{ internalNotes: 0 }` works today, but a future `resetToken` or `supplierCost` field can appear automatically. Prefer inclusion mode for external APIs when the allowed response fields are known.

**Projecting away fields needed later.** If an early `$project` removes `customerId`, a later `$match` or `$group` that needs it cannot use it. Keep required pipeline inputs until their final consumer, then shape the output.

**Assuming `$project` always improves query performance.** It can reduce materialized output and network payload, but it does not fix an unselective `$match`, an expensive `$sort`, or a missing index. Check the whole pipeline with `explain("executionStats")` and measure response size and latency.

**Returning database names as a public contract by accident.** Renaming `_id` to `id` improves a client contract, but it does not validate that the value is safe for every client or preserve compatibility automatically. Treat the projection as part of a versioned response design.

## 7. Compare With Related Concepts

`$project` versus a normal `find()` projection: both can select fields, but `$project` belongs inside an aggregation pipeline and can compute values with aggregation expressions. Use `find()` projection for a straightforward collection read; use `$project` when the result is already part of aggregation work.

`$project` versus `$unset`: `$unset` is an aggregation-stage shorthand for removing fields and is clearer when removal is the only goal. Use `$project` when you need inclusion, renaming, or computed fields.

`$project` versus `$set` or `$addFields`: `$set` adds or replaces fields while preserving the rest of the document by default. `$project` controls the output shape. Use `$set` for intermediate calculations that later stages still need; use `$project` for the final public selection.

`$project` versus authorization: projection decides what fields leave a pipeline, while authorization decides whether the caller may access the underlying record. Use both: authorize and tenant-filter the data first, then project the permitted response shape.

## 8. 🧠 The Memory Hook

`$project` is the records clerk making a safe copy: the original stays untouched, the copy gets only the pages and calculated labels you choose. Remember the boundary: `$match` decides whose folder you opened, `$project` decides what goes in the copy, and neither one replaces authorization policy.
