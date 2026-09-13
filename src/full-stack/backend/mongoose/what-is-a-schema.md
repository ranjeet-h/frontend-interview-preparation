# What is a schema

## 1. The Real-World Problem — When You Actually Hit This

Your `orders` collection has grown for a year. One order document stores line items as an array of objects. Another stores them as a nested map keyed by SKU. A third has `total` as a string because an old API version stringified it. Your aggregation pipeline that sums revenue returns `NaN` for half of January.

Nobody planned this. MongoDB never rejected any of it. The team never wrote down what an order **should** look like — everyone assumed "we'll be consistent." Without a single blueprint, consistency dies the moment you have more than one developer and more than one write path.

A Mongoose **schema** is that blueprint: the code-level contract for one kind of document before it touches the database.

## 2. The Analogy — Make the Mechanic Obvious

A schema is a **building permit floor plan**, not the building itself.

The plan says: bedroom here, load-bearing wall there, max two stories, electrical outlet every 12 feet. The city (MongoDB) will let you build almost anything if you do not show a plan — Mongoose is the architect's drawing that gets checked **before construction starts**.

The finished house (document in MongoDB) might still be an old illegal addition from before you had plans. The schema governs **new work and renovations going through Mongoose**, not automatic retrofits of every historical document.

## 3. The Full Explanation — How It Actually Works

**What a schema is.** A `mongoose.Schema` instance defines paths (fields), their types, defaults, validators, indexes, and options for one document shape. It is plain JavaScript — not stored inside MongoDB unless you separately add MongoDB JSON Schema validation.

**Core pieces:**

```js
const orderSchema = new mongoose.Schema(
  {
    // path: type + options
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [
      {
        sku: { type: String, required: true },
        qty: { type: Number, required: true, min: 1 },
        priceCents: { type: Number, required: true },
      },
    ],
    status: { type: String, enum: ['pending', 'paid', 'shipped'], default: 'pending' },
  },
  {
    timestamps: true,       // createdAt, updatedAt
    collection: 'orders',   // explicit collection name (optional)
    strict: true,           // ignore unknown keys on save (default true)
  }
);
```

**Paths and types.** Each key maps to a [schema type](./what-are-schema-types.md) — String, Number, Date, ObjectId, subdocuments, arrays, Mixed, etc. Types drive casting: `"5"` → `5` for Number paths.

**Schema-level options that matter in production:**

| Option | Effect |
|---|---|
| `strict: true` | Strip/ignore fields not in schema on save |
| `strict: false` | Allow arbitrary extra fields — dangerous long-term |
| `timestamps: true` | Auto-manage `createdAt` / `updatedAt` |
| `toJSON` / `toObject` | Transform output (hide secrets, add virtuals) |
| `_id: false` | Omit auto ObjectId on subdocuments |

**Schema vs collection.** The schema does not create the collection. MongoDB creates a collection on first insert. The schema tells Mongoose how to interpret and validate documents for that model.

**Schema vs model.** Schema is the blueprint; [model](./what-is-a-model.md) is the compiled constructor (`mongoose.model('Order', orderSchema)`) that talks to a specific collection.

**Indexes.** You can declare indexes in the schema (`orderSchema.index({ userId: 1, createdAt: -1 })`). They sync with `Model.syncIndexes()` or your migration tooling. See [How do you define indexes in Mongoose](./how-do-you-define-indexes-in-mongoose.md).

**Subdocuments vs references.** Embed objects/arrays in the schema for one-to-few data living with the parent. Use `ObjectId` + `ref` for large or shared entities — then [populate](./what-is-populate.md) on read.

## 4. See It In Practice — Real Code or Queries

```js
const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true },
    city: { type: String, required: true },
    country: { type: String, default: 'IN' },
  },
  { _id: false } // embedded addresses don't need their own _id
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    shippingAddress: addressSchema, // subdocument — stored inside user document
    tags: [{ type: String }],       // array of strings
  },
  { timestamps: true }
);

// Virtual — not stored, computed on read (see what-are-virtuals.md)
userSchema.virtual('displayName').get(function () {
  return this.email.split('@')[0];
});

userSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const User = mongoose.model('User', userSchema);

async function demo() {
  await mongoose.connect('mongodb://127.0.0.1:27017/shop');

  const user = new User({
    email: 'buyer@shop.com',
    shippingAddress: { line1: '12 MG Road', city: 'Bengaluru' },
    tags: ['wholesale', 'vip'],
    hackerField: 'should not persist', // stripped — strict mode
  });

  await user.save();
  console.log(JSON.stringify(user.toJSON()));
  // includes displayName virtual, no __v, no hackerField in MongoDB

  await mongoose.disconnect();
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a Mongoose schema?**

A schema is a JavaScript object definition that describes the shape, types, defaults, validators, indexes, middleware, and options for documents in a collection. It is compiled into a model. Mongoose uses it to cast incoming data, run validation, and attach behavior — MongoDB itself does not read the schema file.

**Q: Does MongoDB enforce the Mongoose schema?**

No. Enforcement happens in the Mongoose layer when you create, update, or save through a model. Documents inserted by other tools bypass Mongoose rules unless you add MongoDB-level schema validation separately.

**Q: What is the difference between a schema and a model?**

The schema defines structure and rules. The model is the runtime class bound to a collection name — it provides static methods (`find`, `create`) and produces document instances. One schema compiles to one model (usually).

**Q: Can you change a schema after deployment?**

Yes — schemas are code. Adding optional fields is safe. Renaming paths, changing types, or adding `required` to existing fields needs a data migration for old documents. Mongoose does not migrate data automatically.

**Q: What is `strict` mode?**

When `strict: true` (default), fields not declared in the schema are not saved to MongoDB. When `false`, Mongoose persists unknown keys — useful for prototyping, risky in production because schema drift becomes silent.

## 6. The Traps — What Goes Wrong in Production

**Using `Schema.Types.Mixed` everywhere.** Mixed accepts any shape — you lose casting and validation on that subtree. Fine for truly dynamic metadata; toxic as a default escape hatch.

**Adding `required: true` without backfilling.** Existing documents missing the field fail on `save()` when touched. New validation rules need migration plans.

**Duplicating the same sub-schema copy-pasted in five files.** Extract shared sub-schemas (`addressSchema`, `moneySchema`) into modules. Drift is guaranteed otherwise.

**Expecting unique indexes to prevent duplicates alone.** `unique: true` in schema builds an index; race conditions on concurrent inserts can still duplicate until MongoDB raises E11000 — handle that error in code. See [How do you handle unique fields](./how-do-you-handle-unique-fields.md).

**Forgetting `ref` on ObjectId paths.** Without `ref`, populate cannot know which collection to query. The field stores an ObjectId but joins break silently or require manual `model` option every time.

## 7. Compare With Related Concepts

**Schema vs document instance**

- Schema: class-level definition, shared by all documents of that type
- Document: one hydrated object with values (`user.email = 'x'`)
- Rule: configure behavior on schema; read/write data on documents

**Mongoose schema vs MongoDB JSON Schema**

- Mongoose: Node.js, hooks, casting, developer-facing
- MongoDB JSON Schema: server-enforced on all writers
- Rule: Mongoose for app ergonomics; DB schema when polyglot writers exist

**Embedded subdocument schema vs separate collection**

- Embedded: atomic updates with parent, good for small bounded data
- Separate collection + ObjectId: good for large, shared, independently queried data
- Rule: embed when it belongs to one parent and ships together; reference when it has its own lifecycle

## 8. 🧠 The Memory Hook

A Mongoose schema is **the contract written in code** — paths, types, rules, and hooks for one document shape. MongoDB stores whatever BSON you send; the schema is how your Node app says "this is what we mean by a User/Order/Invoice" before it hits the wire.
