# What is a document

## 1. The Real-World Problem — When You Actually Hit This

Your API returns order details. A developer calls `order.items.push(newItem)` on the Mongoose result, forgets `await order.save()`, and the client sees the new item in memory — but refresh shows the old cart. Another developer uses `.lean()` everywhere, then tries `order.markModified('metadata')` and wonders why nothing persists. A third compares two user objects with `===` and gets false every time because each query returns a new hydrated instance.

The confusion is always the same: **a MongoDB document** (BSON on disk) is not the same thing as **a Mongoose document** (a live object in Node with methods, change tracking, and hooks). Treating them interchangeably causes silent data loss and baffling bugs.

## 2. The Analogy — Make the Mechanic Obvious

A MongoDB document is a **printed form in a filing cabinet** — ink on paper, static until someone replaces the page.

A Mongoose document is the **same form on a clipboard with a red pencil**. You can erase and rewrite (mutate fields). The clipboard tracks what you changed (`isModified`). When you hand it back to the clerk (`save()`), they run the approval steps (validators, pre-save hooks) before filing the updated page.

A **lean query** is a **photocopy** of the form — read-only convenience, no clipboard magic, lighter to carry. See [What is lean query](./what-is-lean-query.md).

## 3. The Full Explanation — How It Actually Works

**What a Mongoose document is.** An instance of a model — one record hydrated from BSON (or newly constructed) with:

- **Data paths** — `doc.email`, nested `doc.address.city`
- **Change tracking** — knows which paths changed since load
- **Methods** — instance methods from schema, built-ins like `save()`, `remove()`, `populate()`
- **Internal state** — `$__`, `$isNew`, not enumerable but power behavior

**Creating documents:**

```js
// New — not in DB until save()
const user = new User({ email: 'a@b.com' });
await user.save();

// Or atomic create (construct + save)
const user = await User.create({ email: 'a@b.com' });

// From query — hydrated from existing BSON
const user = await User.findById(id);
```

**Saving changes:**

```js
user.name = 'Ravi';
await user.save(); // runs validators + pre/post save hooks
```

Mongoose tracks modifications. For Mixed types or nested object manual edits:

```js
user.metadata.flags.admin = true;
user.markModified('metadata'); // required — Mongoose can't detect deep Mixed changes
await user.save();
```

**Documents vs plain objects:**

| Mongoose document | Plain object (`.lean()`) |
|---|---|
| `instanceof mongoose.Document` | Plain POJO |
| `.save()`, hooks, validators on save | No save — use `updateOne` |
| Virtuals on `toJSON` if configured | Virtuals absent unless `virtuals: true` lean option |
| Higher memory | Lower memory |

**JSON serialization:**

```js
res.json(user); // often calls toJSON — may strip password, add virtuals
user.toObject({ virtuals: true });
```

Configure transforms on the schema's `toJSON` / `toObject` — not scattered in routes.

**Population.** Reference fields start as ObjectIds. `.populate('authorId')` replaces them with full documents (or selected fields):

```js
const post = await Post.findById(id).populate('authorId', 'name email');
// post.authorId is now a User document (or sub-object), not just ObjectId
```

See [What is populate](./what-is-populate.md).

**Subdocuments.** Embedded array elements are documents too — `parent.children.id(childId)` finds one; `.remove()` on subdoc pulls from array.

## 4. See It In Practice — Real Code or Queries

```js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [
      {
        sku: String,
        qty: { type: Number, min: 1 },
        priceCents: Number,
      },
    ],
    status: { type: String, default: 'pending' },
  },
  { timestamps: true }
);

orderSchema.methods.totalCents = function () {
  return this.items.reduce((sum, line) => sum + line.qty * line.priceCents, 0);
};

const Order = mongoose.model('Order', orderSchema);

async function addLineItem(orderId, line) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');

  order.items.push(line);
  // Mutating array triggers change tracking on embedded paths
  console.log(order.isModified('items')); // true

  if (order.totalCents() > 500_000) {
    order.status = 'review'; // business rule before save
  }

  await order.save(); // validators + hooks + update MongoDB
  return order;
}

async function readOnlyDashboard(orderId) {
  // Read path — no mutations planned → lean POJO
  const order = await Order.findById(orderId).lean();
  console.log(order.items); // plain array, no .save()
  return order;
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a Mongoose document?**

A document is a single model instance representing one MongoDB record. It wraps BSON data with change tracking, validation on save, middleware hooks, instance methods, and helpers like populate. It is the object you get from `new Model()`, `Model.create()`, or queries without `.lean()`.

**Q: What is the difference between a MongoDB document and a Mongoose document?**

A MongoDB document is BSON stored in a collection — plain data. A Mongoose document is a JavaScript object enriched by Mongoose for ORM behavior. The latter serializes to BSON when saved.

**Q: When do you use `.save()` vs `updateOne()`?**

Use `.save()` on a hydrated document when you want full document validation, defaults, and save middleware — especially when mutating multiple fields with business logic. Use `updateOne` / `findOneAndUpdate` for atomic server-side updates without loading the document — but know save hooks do not run unless you add query middleware.

**Q: Why does mutating a lean result not persist?**

Lean returns a plain JavaScript object with no connection to Mongoose's change tracking or `save()`. You must use `Model.updateOne({ _id }, { $set: ... })` or re-fetch as a full document.

**Q: What does `isNew` mean on a document?**

`true` before the first successful save to MongoDB — Mongoose will insert rather than update on `save()`. After insert, `isNew` becomes false.

## 6. The Traps — What Goes Wrong in Production

**Mutating without saving.** The classic bug: change fields in a request handler, return JSON, never call `save()`. Data looks updated in the response only.

**Forgetting `markModified` on Mixed or manually edited nested objects.** Save succeeds but the nested change never reaches MongoDB.

**Assuming two finds return the same object reference.** Each query creates a new document instance. Stale reads if you cache documents in memory without refresh.

**Calling `save()` in a tight loop.** N round-trips. Prefer `bulkWrite`, `insertMany`, or one `updateOne` with operators for batch updates.

**Spreading a document into a plain object and back.** `{ ...doc }` loses methods and can drop virtuals. Use `toObject()` / `toJSON()` intentionally.

**Populate + save confusion.** Saving a populated path may write the full subdocument back to an ObjectId field incorrectly if you assign the wrong shape. Understand what you're persisting.

## 7. Compare With Related Concepts

**Document vs model**

- Model: collection-level class (`User.find`)
- Document: one row/instance (`user.save`)
- Rule: model for queries; document for instance lifecycle

**Hydrated document vs lean POJO**

- Hydrated: mutable, hooks, heavier
- Lean: read-only DTO, faster
- Rule: lean for read-heavy APIs; full documents when you save in the same request

**Embedded subdocument vs referenced document**

- Embedded: lives inside parent BSON, loaded together
- Referenced: separate collection, ObjectId pointer, populate on demand
- Rule: embed small bounded data; reference large or shared entities

## 8. 🧠 The Memory Hook

A Mongoose document is **one database row with superpowers** — it remembers what you changed, runs hooks when you `save()`, and dies as a plain object the moment you `.lean()`. If you mutated it and did not save, you changed the clipboard, not the filing cabinet.
