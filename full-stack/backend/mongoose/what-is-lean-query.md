# What is Lean Query

## 1. The Real-World Problem — When You Actually Hit This

Your API returns a list of 5,000 products for a catalog page. The query itself runs in 15 milliseconds against MongoDB, but the Node.js endpoint takes 800 milliseconds to respond. Memory usage spikes, garbage collection fires frequently, and under load the server starts throwing `JavaScript heap out of memory` errors. You look at the code and see `Product.find().sort({ createdAt: -1 })` — a standard Mongoose query. The database is fast, but Mongoose is turning every row into a heavy object with change tracking, methods, and hooks you never use. This is the moment you need to understand what a lean query actually is.

## 2. The Analogy — Make the Mechanic Obvious

Imagine you run a warehouse shipping department. When someone orders a product, you have two ways to pull it from the shelf:

**Normal Mongoose query:** You take the item, put it in a special tracked container with a clipboard, write down every time someone touches it, attach a return label, and assign a staff member to monitor it. Great if the customer might return it and you need full tracking.

**Lean query:** You hand over the item in a plain cardboard box. Same product, faster handoff, no tracking overhead. If the customer just wants to receive and inspect it, you don't need the clipboard system.

A lean query is the plain cardboard box — same data from MongoDB, none of the Mongoose document overhead.

## 3. The Full Explanation — How It Actually Works

When you run a Mongoose query like `User.find()` or `Order.findById()`, Mongoose doesn't just give you the raw data from MongoDB. It **hydrates** each result into a Document instance — a JavaScript object with extra machinery:

- Change tracking so Mongoose knows what changed when you call `.save()`
- Getters and setters that transform values on read/write
- Virtual properties that compute values on access
- Instance methods like `user.comparePassword()`
- Middleware hooks that run before and after save operations
- Internal state like `$isNew` and `$__` that power all of the above

All of this is useful when you need to mutate and persist documents. But for read-only operations — listing orders, loading user profiles for display, exporting data, feeding analytics — this overhead is pure cost.

A **lean query** tells Mongoose: skip the hydration step. Return plain JavaScript objects (POJOs) directly from the MongoDB driver, with no Document wrapper.

What happens when you chain `.lean()`:

1. The MongoDB query executes exactly the same way — same indexes, same filtering, same projection
2. Instead of `new Document(rawData)` for each result, Mongoose returns the raw object
3. No change tracking, no `.save()` method, no document instance methods
4. Virtuals and getters don't run by default (Mongoose 6+ has options to enable them)
5. Memory usage drops because there's no per-document object overhead

The data shape is identical — same field names, same values. What changes is the JavaScript type and capabilities.

## 4. See It In Practice — Real Code or Queries

**Default hydrated query — full document with methods**

```javascript
const user = await User.findById('507f1f77bcf86cd799439011');

// This is a Mongoose Document instance
user.email = 'new@example.com';
await user.save(); // Works — change tracking + save hooks run

user.comparePassword('rawpassword'); // Works — instance method exists
```

**Lean query — plain object, no document methods**

```javascript
const user = await User.findById('507f1f77bcf86cd799439011').lean();

// This is a plain JavaScript object
user.email = 'new@example.com';
await user.save(); // ERROR — user.save is not a function

// Fix: use Model.updateOne for mutations
await User.updateOne(
  { _id: '507f1f77bcf86cd799439011' },
  { $set: { email: 'new@example.com' } }
);
```

**Lean query for a read-only list API**

```javascript
async function getProductsList({ category, limit = 50 }) {
  const products = await Product.find({ category })
    .select('name price sku inStock')
    .sort({ price: 1 })
    .limit(limit)
    .lean(); // Skip hydration for read-only JSON response

  return products; // Plain objects, ready for res.json()
}
```

**Lean with virtuals enabled (Mongoose 6+)**

```javascript
const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
});

userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual won't appear in lean results by default
const user = await User.findById(id).lean();
console.log(user.fullName); // undefined

// Enable virtuals in lean results
const user = await User.findById(id).lean({ virtuals: true });
console.log(user.fullName); // 'John Doe'
```

**Lean with populate**

```javascript
const post = await Post.findById(id)
  .populate('authorId', 'name email')
  .lean(); // Both post and populated author are plain objects

// post.authorId is a plain object, not a Document instance
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a lean query in Mongoose?**

A lean query is a Mongoose query with `.lean()` chained to it, which tells Mongoose to return plain JavaScript objects instead of full Document instances. The MongoDB query runs identically, but Mongoose skips the hydration step that adds change tracking, methods, middleware, and other document features.

**Q: What is the difference between a normal Mongoose query result and a lean query result?**

A normal query returns Document instances with `.save()`, change tracking, instance methods, virtuals, getters, and middleware hooks. A lean query returns plain JavaScript objects with no methods, no change tracking, and no automatic virtuals unless explicitly enabled. Lean results are faster and use less memory but cannot be mutated with `.save()`.

**Q: When should you use `.lean()`?**

Use `.lean()` on read-only code paths: list endpoints, search results, data exports, analytics feeds, any query where you serialize to JSON and never call `.save()`. Do not use it when you need to mutate and persist the document in the same request, rely on instance methods, or depend on default virtual/getter behavior.

**Q: Does `.lean()` change the MongoDB query?**

No. The query sent to MongoDB is identical — same filters, same projection, same indexes. Lean only affects what Mongoose does with the results after MongoDB returns them.

**Q: Can you use `.lean()` with `.populate()`?**

Yes. When you lean a query, populated fields are also returned as plain objects rather than Document instances. This is often desirable for API responses since you're serializing to JSON anyway.

**Q: What happens to virtuals on lean results?**

In Mongoose 6+, virtuals do not appear on lean results by default. You can enable them with `.lean({ virtuals: true })`. Getters also require `.lean({ getters: true })` to run.

## 6. The Traps — What Goes Wrong in Production

**Calling `.save()` on a lean result.** Lean results are plain objects without a `.save()` method. This throws a runtime error. Use `Model.updateOne()`, `findByIdAndUpdate()`, or re-fetch without lean if you need to save.

**Expecting virtuals in API responses.** If your schema has virtuals like `fullName` and you switch to lean queries, those fields disappear from the JSON response unless you enable `virtuals: true`. This breaks frontend contracts silently.

**Using lean everywhere by default.** For single-document detail pages where you might update in place, lean adds no meaningful performance benefit but removes useful document features. Apply lean selectively to read-heavy paths.

**Assuming lean fixes N+1 query problems.** Lean reduces hydration overhead but does not reduce the number of queries `populate()` executes. Fix N+1 with `$lookup` aggregation, careful populate selection, or manual batching.

**Forgetting that lean objects have no type casting.** Mongoose documents automatically cast values to the correct schema types on assignment. Plain objects from lean queries don't have this protection — if you manipulate them before sending to MongoDB, ensure types match.

**Missing lean options in Mongoose 5 vs 6.** The `virtuals: true` and `getters: true` options for lean were added in Mongoose 6. In earlier versions, virtuals simply don't work with lean.

## 7. Compare With Related Concepts

**Lean query vs `.select()`**

`.select()` controls which **fields** MongoDB returns in the query. `.lean()` controls the **JavaScript type** of the results. Use them together: `.select('name email').lean()` for efficient read-only queries that return only needed fields as plain objects.

**Lean query vs raw MongoDB driver**

The MongoDB Node.js driver always returns plain objects — it has no concept of hydration. Mongoose lean queries get you closer to driver performance while keeping the schema validation, query builder, and middleware on write operations. Lean is a middle ground: Mongoose API with driver-like result speed.

**Lean query vs `toObject()`**

`toObject()` converts a hydrated Document to a plain object after hydration. This means you paid the hydration cost, then convert it. `.lean()` skips hydration entirely, so it's faster and uses less memory for large result sets.

**Lean query vs aggregation**

`Model.aggregate()` always returns plain objects — it's inherently lean. For complex read pipelines with joins, grouping, and computation, aggregation may be faster than `find().lean()` because the work happens in MongoDB rather than Node.js.

## 8. 🧠 The Memory Hook

A lean query is **raw data from MongoDB, plain and simple** — no document wrapper, no change tracking, no methods. Same query, same result, but Mongoose stops wrapping every row in an object with superpowers. Read-only path? Lean it. Need to save? Keep the document.
