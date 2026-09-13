# What Is `$unwind`?

## 1. The Real-World Problem — When You Actually Hit This

An orders endpoint stores each order's line items in an array because the items belong to that order. That is convenient for writes and for returning a complete order, but it becomes awkward when the report asks for one row per item: “How many units of each SKU were sold?” A normal projection still returns one order with one array. If you accidentally count orders instead of items, the report looks plausible while being wrong.

MongoDB's `$unwind` solves that shape mismatch. It turns each array element into its own pipeline document, so later stages such as `$match`, `$group`, and `$sort` can work at item level. The cost is that one input document can become many output documents, which can increase query work and change the response shape.

## 2. The Analogy — Make the Mechanic Obvious

Think of an order as a folder containing several receipts. Before unpacking it, the reporting clerk sees one folder. `$unwind` opens the folder and makes a separate work item for every receipt inside it. The order fields are copied onto each work item, while the array field is replaced by the one element represented by that item.

If order `A100` contains three line items, the pipeline receives three documents for `A100` after `$unwind`. A later grouping stage can now add quantities per SKU. An empty folder produces no work item by default; `preserveNullAndEmptyArrays: true` tells the clerk to keep the folder even when there is no receipt, which is useful for reports that must include orders with no items.

## 3. The Full Explanation — How It Actually Works

`$unwind` is an aggregation stage that deconstructs an array field. Given this document:

```js
{
	_id: "A100",
	customerId: "c-42",
	items: [
		{ sku: "pen", quantity: 2 },
		{ sku: "notebook", quantity: 1 }
	]
}
```

`{ $unwind: "$items" }` emits two pipeline documents:

```js
{ _id: "A100", customerId: "c-42", items: { sku: "pen", quantity: 2 } }
{ _id: "A100", customerId: "c-42", items: { sku: "notebook", quantity: 1 } }
```

The stage does not mutate the stored order. It only changes the stream flowing through the current aggregation. Fields outside `items` are repeated in each emitted document. This is why `$unwind` is useful before item-level grouping, and also why it can multiply memory, CPU, and network work.

The long form lets you preserve documents whose array is missing, `null`, or empty and lets you record the original position:

```js
{
	$unwind: {
		path: "$items",
		includeArrayIndex: "itemIndex",
		preserveNullAndEmptyArrays: true
	}
}
```

For a normal non-empty array, `itemIndex` is `0`, `1`, and so on. For a missing, `null`, or empty field that is preserved, there is no real array position, so application code should treat that index as absent or `null` rather than assuming it is a number.

The default is `preserveNullAndEmptyArrays: false`. That means documents with a missing, `null`, or empty `items` field are removed at this stage. A non-array value is generally treated as a single-element input when it is present and non-null, so schema validation still matters if the pipeline assumes an array.

Stage order controls both meaning and cost. Put a selective `$match` before `$unwind` when it can reject whole documents, such as matching `status: "paid"`. If the condition is about individual array elements, `$unwind` followed by `$match` is straightforward, while `$filter` can sometimes avoid creating unwanted intermediate documents. An index can help an eligible early `$match`; `$unwind` itself is not an index lookup and does not make the array indexed.

## 4. See It In Practice — Real Code or Queries

**One output document per array element**

```js
db.orders.aggregate([
	{ $match: { status: "paid" } },
	{ $unwind: "$items" },
	{
		$group: {
			_id: "$items.sku",
			unitsSold: { $sum: "$items.quantity" }
		}
	},
	{ $sort: { unitsSold: -1, _id: 1 } }
]);
```

The initial `$match` removes unpaid orders before fan-out. After `$unwind`, `$group` sees one item at a time, so summing `items.quantity` counts units rather than orders.

**Keep orders that have no items**

```js
db.orders.aggregate([
	{
		$unwind: {
			path: "$items",
			preserveNullAndEmptyArrays: true
		}
	},
	{
		$project: {
			orderId: "$_id",
			sku: "$items.sku",
			hasItem: { $ne: [{ $ifNull: ["$items", null] }, null] }
		}
	}
]);
```

This produces one row for every item and retains an order with no item as a row whose `sku` is missing. The `hasItem` field makes that distinction explicit for an API or report instead of asking the client to guess from a missing value.

**Capture the original position**

```js
db.playlists.aggregate([
	{
		$unwind: {
			path: "$tracks",
			includeArrayIndex: "position"
		}
	},
	{
		$project: {
			_id: 0,
			playlistId: "$_id",
			trackId: "$tracks",
			position: { $add: ["$position", 1] }
		}
	}
]);
```

The stored zero-based array index is converted to a one-based display position only after unwinding. If the array order has business meaning, preserve it deliberately; grouping or sorting later can discard that original order.

## 5. Interview Questions — All of Them, Done Properly

**Q: What does `$unwind` do in MongoDB?**

It deconstructs an array in an aggregation pipeline and emits one document for each array element. The source collection is unchanged. Fields outside the array are copied into every emitted document, and the array field contains the current element.

**Q: What happens when the array is empty or missing?**

By default, the input document produces no output document. Set `preserveNullAndEmptyArrays: true` in the long form when the report must retain those parent documents. The preserved output has no meaningful element value, so downstream stages must handle that case.

**Q: Why does array cardinality matter?**

If there are $N$ input documents and the average array length is $K$, the unwound stream can contain roughly $N \times K$ documents before later stages reduce it. A few large arrays can dominate runtime and memory even when the collection itself is not large. Counts also change: counting after unwind counts elements, not parent documents, unless you group or count distinct parent IDs.

**Q: When would you use `$filter` instead of `$unwind`?**

Use `$filter` when you only need to keep matching elements inside each parent document and the result can remain an array. Use `$unwind` when later stages need one pipeline document per element, such as grouping each SKU across orders. `$filter` can avoid fan-out for some workloads, but it does not replace an element-level grouping shape by itself.

**Q: Can `$unwind` use an index?**

`$unwind` does not scan an index to expand array elements. An index may still help an eligible `$match` before it, and placing that selective match early can reduce the number of documents that must be unwound. Always confirm the actual plan with `explain()` for the query and data shape you operate.

**Q: How should an API expose unwound results?**

Be explicit about the new cardinality and fields. An endpoint that used to return one object per order may now return one object per item, so pagination, totals, authorization checks, and frontend types must match that contract. Keep parent identifiers in the projection so consumers can relate each item row back to its order.

## 6. The Traps — What Goes Wrong in Production

- **Counting the wrong thing:** `count` after `$unwind` counts array elements. Use a pre-unwind count for parent documents, or group by the parent ID when you need distinct orders after fan-out.
- **Dropping empty parents by accident:** The default removes missing, `null`, and empty arrays. A “customers with zero purchases” report silently omits exactly the customers it needs unless preservation is enabled.
- **Unwinding too early:** Expanding every document before filtering status, tenant, or date creates unnecessary work. Reject whole documents first when the predicate allows it.
- **Assuming one output per parent:** A document with 10 elements becomes 10 pipeline documents. This can duplicate parent-level values in a response and can make pagination misleading unless the API is intentionally item-based.
- **Losing array order:** `$unwind` can expose the index, but later `$group` stages do not preserve an order you did not model. Use `includeArrayIndex` when position matters.
- **Trusting schema shape without validation:** A scalar, missing field, `null`, and array do not all behave the same way. Validate writes and test each shape that production data can contain.
- **Creating a fan-out/fan-out explosion:** Unwinding two arrays in sequence creates combinations of their elements. If one document has 5 tags and 8 events, the naive shape can produce 40 rows. Reshape with `$filter`, `$map`, or separate pipelines when a Cartesian product is not intended.

## 7. Compare With Related Concepts

**`$unwind` vs `$filter`:** `$unwind` changes one document into many pipeline documents; `$filter` keeps one document and returns a smaller array. Use `$unwind` for element-level stages and `$filter` when the result should stay grouped under its parent.

**`$unwind` vs `$map`:** `$map` transforms every array element and returns an array. Use it to change element values without changing document cardinality; use `$unwind` when each element must participate as an independent pipeline document.

**`$unwind` vs `$lookup`:** `$lookup` brings related documents from another collection, while `$unwind` expands an array already present in the current document. A `$lookup` often returns an array and may then be followed by `$unwind` to process each joined document.

**`$unwind` vs embedding or referencing:** `$unwind` is a read-time reshaping tool. It does not decide whether data belongs embedded in a document or in another collection. Choose embedding or references based on update boundaries, document growth, and read patterns; use `$unwind` when the chosen stored shape must be analyzed element by element.

## 8. 🧠 The Memory Hook

`$unwind` is the aggregation pipeline's “one folder becomes one work item per receipt” stage: one array element in, one pipeline document out. Always ask two questions before adding it: “How many rows will this create?” and “What should happen to parents with no element?”
