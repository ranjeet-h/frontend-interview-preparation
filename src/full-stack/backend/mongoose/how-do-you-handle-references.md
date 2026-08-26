# How do you handle references in Mongoose?

## 1. The Real-World Problem — When You Actually Hit This

An order document often needs to point to the customer, products, and shipping address that live in other collections. Copying every detail into the order makes reads easy at first, but customer updates leave old copies behind and large documents become expensive to maintain. Storing only an identifier keeps ownership clear, but the API now has to decide when and how to fetch the related data.

That is the references problem in Mongoose: represent a relationship with an `ObjectId`, then choose deliberately whether the request should fetch the referenced document with `populate()`, issue a separate query, or return only the ID.

## 2. The Analogy — Make the Mechanic Obvious

Think of an order as a paper form that records a customer number, not the customer's entire file. The number is the reference. The customer file remains in its own cabinet, so changing an address changes one source of truth.

`populate()` is the records clerk fetching the customer file before handing you the form. It is convenient when the caller needs a small, known view of the customer. But the clerk is not changing the paper form, and the customer file is not embedded into the database record. It is a read-time join-like operation performed by Mongoose through additional queries.

## 3. The Full Explanation — How It Actually Works

Declare the relationship in the schema with `type: Schema.Types.ObjectId` and `ref` naming the Mongoose model. MongoDB stores a BSON ObjectId value in that field; `ref` is Mongoose metadata that tells `populate()` which collection/model to query. MongoDB itself does not enforce a foreign-key constraint, so application code must handle invalid, deleted, or unauthorized references.

```js
import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
	{
		customer: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		lines: [
			{
				product: {
					type: mongoose.Schema.Types.ObjectId,
					ref: 'Product',
					required: true,
				},
				quantity: { type: Number, min: 1, required: true },
			},
		],
	},
	{ timestamps: true }
);
```

A query such as `Order.findById(id).populate('customer', 'name email')` first finds the order and then fetches the matching `User` document. The selected fields matter: populating a whole user record can accidentally expose password hashes, internal roles, or private profile data. Treat population as a database read, not as an authorization check.

Population has a boundary. It can replace an ID in the returned Mongoose document, but it does not guarantee that the referenced record exists forever, does not cascade deletes, and does not prove that the current user may see it. If the referenced document is missing, a single populated path normally becomes `null`; a populated array omits documents that cannot be found. The parent query can still succeed.

For authorization, constrain the parent query to the current principal whenever possible. For example, a user reading an order should query both `_id` and `customer`, rather than loading by `_id` and checking the customer later. For references that have their own access rules, fetch the related document with an explicit tenant or owner predicate. A valid ObjectId is only syntactically valid input; it is not permission.

References also create query-shape choices. One populate call may issue extra queries and a list of orders can become an N+1 pattern if each item is populated separately in application code. Use projection, limits, and a measured query plan. If a read always needs a small immutable snapshot, embedding that snapshot may be better. If the related data is large, private, or independently updated, keep it referenced and load only the fields the endpoint needs.

## 4. See It In Practice — Real Code or Queries

A production-style read scopes the order to its owner and exposes only safe customer fields:

```js
export async function getMyOrder({ orderId, userId }) {
	if (!mongoose.isValidObjectId(orderId)) {
		const error = new Error('Invalid order id');
		error.statusCode = 400;
		throw error;
	}

	const order = await Order.findOne({ _id: orderId, customer: userId })
		.select('status createdAt lines customer')
		.populate({
			path: 'customer',
			select: 'name email',
		})
		.populate({
			path: 'lines.product',
			select: 'name sku',
		})
		.lean()
		.exec();

	if (!order) {
		// Deliberately avoid revealing whether another user's order exists.
		const error = new Error('Order not found');
		error.statusCode = 404;
		throw error;
	}

	return order;
}
```

For a required relationship, validate the target while creating the parent. This produces a clear application error instead of silently creating an order that can never be displayed correctly:

```js
const product = await Product.findOne({ _id: productId, isActive: true })
	.select('_id')
	.lean()
	.exec();

if (!product) {
	const error = new Error('Product is unavailable');
	error.statusCode = 422;
	throw error;
}

await Order.create({ customer: userId, lines: [{ product: product._id, quantity }] });
```

This check is not a substitute for a transaction when several writes must succeed together. It also does not prevent a later product deletion unless the application uses soft deletion or coordinates deletion with the order lifecycle.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is the difference between an embedded document and a referenced document in Mongoose?**

An embedded document is stored inside its parent document, so one read gets the whole bounded object and one write owns both pieces. A reference stores an ObjectId pointing to another collection, which avoids duplication and keeps independently changing data separate. Embed data that is small, belongs to the parent, and is read together. Reference data that has its own lifecycle, is shared by many parents, or could make the parent unbounded.

**Q: What does `ref` do, and does MongoDB enforce it?**

`ref` tells Mongoose which model to use when resolving a path with `populate()`. MongoDB stores only the ObjectId and does not enforce a foreign key, cascade deletion, or referential integrity because of that declaration. The service must validate targets and define behavior for deletion and missing references.

**Q: Is `populate()` a database join?**

It provides join-like application behavior, but it is not a server-side MongoDB `$lookup` by default. Mongoose runs the parent query and then queries the referenced model, mapping the results back onto the parent documents. That convenience can mean extra round trips and more data than the endpoint needs. For aggregation-heavy reporting, compare `populate()` with an aggregation pipeline using `$lookup` and measure both query shapes.

**Q: What happens when a referenced document has been deleted?**

The parent document can still be returned. A singular populated path is generally `null`, while missing members of a populated array are not returned. The API should decide whether that is acceptable, omit the broken relationship, return an explicit domain error, or prevent the situation with soft deletion and lifecycle rules.

**Q: How do you secure populated references?**

Authorization must happen in the query or in a clearly enforced service boundary. Scope the parent by the current user or tenant, and use `select` to whitelist fields from populated documents. Never assume that possession of an ObjectId grants access, and never populate sensitive fields merely because they are convenient for an internal model.

**Q: How do you avoid performance problems with references?**

Inspect the query count and latency for list endpoints. Select only needed fields, index the parent filter such as `{ customer: 1, createdAt: -1 }`, limit or paginate results, and avoid populating large nested graphs. If the endpoint repeatedly needs the same stable fields, denormalized read data or a purpose-built projection may be cheaper than resolving many references on every request.

## 6. The Traps — What Goes Wrong in Production

- **Assuming `ref` creates a foreign key.** It does not. A deleted user leaves an ObjectId behind unless the service prevents or handles that state.
- **Using `populate()` as authorization.** Population answers “which document matches this ID?” It does not answer “may this caller see it?” Scope the query by owner, tenant, or another policy before returning data.
- **Populating everything.** Deep population can fetch private fields, large documents, and several levels of relationships. Use explicit paths and field projections, and make each endpoint choose its response shape.
- **Creating an N+1 query.** Loading a list and then calling `findById()` inside a loop turns one request into many database round trips. Use one controlled populate, `$lookup`, or a batched query depending on the response and measurements.
- **Treating a valid ID as an existing target.** `isValidObjectId()` checks input shape only. Query the target and handle not-found or inactive records as a domain error.
- **Confusing a missing reference with an empty result.** The order may still exist even when its customer is gone. Decide whether the endpoint can return a partial relationship and test that behavior explicitly.
- **Expecting deletes to cascade.** Mongoose does not automatically remove every document that points at a deleted document. Use soft deletion, explicit cleanup, or a transaction/workflow where the invariant truly requires it.

## 7. Compare With Related Concepts

**References vs embedding:** embed small, bounded data that belongs to one parent and is read with it; reference shared or independently changing data. The rule is ownership and read shape, not “NoSQL means never normalize.”

**`populate()` vs `$lookup`:** use `populate()` for straightforward model reads with Mongoose document behavior; use `$lookup` when the join belongs inside a larger aggregation, needs pipeline filtering, or must be handled by the database in one aggregation command.

**`populate()` vs a separate service query:** use populate when the data is in the same database and the relationship is simple; use an explicit query when you need different authorization rules, caching, failure handling, or a response assembled from independent services.

**ObjectId validation vs authorization:** validation checks whether an input has an acceptable identifier shape; authorization checks whether this caller may act on the identified resource. Always do both at the correct boundary.

## 8. 🧠 The Memory Hook

An ObjectId is a phone number written on the form, not the person standing in front of you. `populate()` can fetch the file, but your service still decides whether the file exists, which fields are safe, and whether this caller is allowed to read it.
