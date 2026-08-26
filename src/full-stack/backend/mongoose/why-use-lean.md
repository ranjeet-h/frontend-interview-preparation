# Why Use `.lean()`

## 1. Why This Exists — The Problem First

Your dashboard API loads 10,000 order documents for an admin export. Each `find()` result is a full Mongoose document — change tracking, getters, virtuals, middleware hooks, and a prototype chain for every row. The endpoint that should return in 200 ms takes 4 seconds and allocates 800 MB of heap. You profile the code and MongoDB itself is fast; the bottleneck is Mongoose hydrating every BSON document into a heavy JavaScript object you never mutate.

`.lean()` tells Mongoose: **return plain JavaScript objects, skip the document machinery.** For read-only paths — list endpoints, exports, aggregations fed to JSON — that single chain call can cut memory and CPU by an order of magnitude.

## 2. The Analogy — Make It Obvious

Think of two ways to hand someone a book from a library.

- **Normal query (hydrated document):** The librarian photocopies every page, stamps a library card inside, wraps it in a tracked envelope you must return, and logs every time you open a page. Great if you will edit the book and check it back in.
- **`.lean()` query:** The librarian hands you a PDF export. Same content, no envelope, no checkout system, no edit tracking. You cannot "return" it to the shelf through the library system — but you only needed to read it.

If you are building a report from 50,000 rows and never calling `.save()`, you do not need the envelope.

## 3. How It Actually Works — The Full Explanation

By default, `Model.find()`, `findOne()`, `findById()`, and similar methods return **Mongoose documents** — class instances that wrap raw BSON data.

A hydrated document provides:

- **Change tracking** — Mongoose knows which paths were modified for `.save()`.
- **Getters and setters** — schema-defined transforms on read/write.
- **Virtuals** — computed properties like `fullName`.
- **Methods and statics** — `user.comparePassword()`.
- **Population** — `.populate()` replaces ObjectId refs with nested documents (also hydrated unless you lean those too).
- **Middleware on save** — `pre('save')` runs when you persist.

When you chain `.lean()`:

1. Mongoose still runs the query against MongoDB the same way.
2. Instead of `new Document(doc)`, it returns a **plain object** (`POJO`) — essentially what `JSON.parse(JSON.stringify(doc))` would give you, but without the double serialization cost.
3. No change tracking, no `.save()`, no document methods unless you attach them yourself.
4. Getters defined on the schema **do not run** on lean results (unless you use `lean({ getters: true })` in Mongoose 6+).
5. Virtuals **do not appear** unless you pass `virtuals: true` in the lean options (Mongoose 6+).

**When to use lean:** read-only API responses, internal batch jobs, feeding data to a template or CSV exporter, any path where you serialize to JSON and never call `.save()`.

**When not to use lean:** you need to mutate and persist, you rely on instance methods, or you depend on virtuals/getters without enabling lean options.

**Performance shape:** lean removes per-document class instantiation and internal state. On large result sets the difference is dramatic; on a single `findById` for a detail page it is often negligible — profile before optimizing micro-endpoints.

## 4. Real Code — See It Working

**Default hydrated query — full document machinery**

```js
const Order = require("./models/Order");

async function getOrderForEdit(id) {
  const order = await Order.findById(id);
  // WHY: hydrated doc — .save(), methods, and change tracking all work
  order.status = "shipped";
  await order.save();
  return order;
}
```

**Lean query — plain objects for a list API**

```js
async function listOrdersForDashboard({ status, limit = 100 }) {
  const orders = await Order.find({ status })
    .select("orderNumber total status createdAt")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean(); // WHY: read-only list — skip hydration overhead

  return orders; // plain objects, safe to res.json()
}
```

**Lean with virtuals and getters (Mongoose 6+)**

```js
const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
});

userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

async function listUsers() {
  return User.find()
    .lean({ virtuals: true, getters: true }); // WHY: keep computed fields in lean results
}
```

**Accidentally calling `.save()` on a lean result**

```js
const user = await User.findById(id).lean();
// user.save is undefined — lean returns a plain object
// FIX: either drop .lean() or use updateOne / findByIdAndUpdate
await User.updateOne({ _id: id }, { $set: { name: "Ada" } });
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What does `.lean()` do in Mongoose?**

It tells Mongoose to return plain JavaScript objects instead of full Document instances. The MongoDB query is identical, but Mongoose skips hydrating each result into a class instance with change tracking, methods, and middleware hooks. It is a read-path optimization.

**Q: When should you use `.lean()`?**

Use it on read-only code paths: list endpoints, exports, analytics feeds, anything you serialize to JSON without mutating and saving. Do not use it when you need `.save()`, instance methods, or default virtual/getter behavior without enabling lean options.

**Q: Does `.lean()` work with `.populate()`?**

Yes. Populated fields are also plain objects when the root query is lean. Population still runs separate queries (or `$lookup` if you use `populate` with `match` pipelines) — lean only affects hydration, not the number of round trips.

**Q: What do you lose with `.lean()`?**

`.save()` and change tracking, instance methods, default virtuals/getters (unless opted in), and `pre('save')` middleware on those objects. You also lose Mongoose's automatic casting on assignment — you are working with raw data.

**Q: How much faster is `.lean()`?**

It depends on result size. Single-document fetches: often single-digit percent improvement. Thousands of documents: commonly 2–5× faster with significantly lower memory. Always measure on your schema and data volume.

## 6. The Traps — What Goes Wrong

**Using `.lean()` then calling `.save()`.** Lean results are plain objects. `.save()` does not exist. Use `updateOne`, `findByIdAndUpdate`, or re-fetch without lean.

**Expecting virtuals on lean results.** `user.fullName` is `undefined` unless you pass `lean({ virtuals: true })`. Many teams discover this in production when a list endpoint drops computed fields.

**Applying `.lean()` everywhere by default.** Detail pages that update in place need hydrated documents. Blanket lean adds friction and bugs for marginal gain on single-document reads.

**Assuming lean fixes N+1 populate problems.** Lean reduces hydration cost; it does not reduce the number of queries `populate` issues. Fix N+1 with `$lookup`, `populate` with careful `select`, or batching.

**Forgetting getters for sensitive fields.** If a password field uses a `select: false` getter to redact output, lean without `getters: true` may behave differently than hydrated docs depending on schema setup. Verify redaction on lean paths.

## 7. Compare With Related Concepts

**`.lean()` vs `.select()`**

`.select()` limits which **fields** MongoDB returns. `.lean()` changes the **JavaScript type** of each result. Use both together: `.select("name email").lean()` for efficient read-only lists.

**`.lean()` vs raw MongoDB driver**

The driver always returns plain objects. Mongoose adds schema, validation, and middleware on writes; lean brings read performance closer to the driver while keeping the same query API.

**`.lean()` vs aggregation**

`Model.aggregate()` always returns plain objects. For complex read pipelines, aggregation may be faster than `find().lean()` because computation happens in MongoDB.

**When to use which**

| Need | Use |
|---|---|
| Mutate and `.save()` | Hydrated document |
| Read-only JSON API | `.lean()` |
| Complex joins/grouping | Aggregation |
| Maximum read throughput, no Mongoose features | Driver or lean |

## 8. 🧠 The Memory Hook — What Sticks

`.lean()` is the **PDF export, not the library checkout**. Same data from MongoDB, but Mongoose stops wrapping every row in an editable, tracked envelope. Read-only path? Lean. Need to save? Full document.
