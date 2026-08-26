# What is a model

## 1. The Real-World Problem — When You Actually Hit This

You defined a beautiful schema in one file. Your routes import `{ UserSchema }` and call `mongoose.connection.db.collection('users').insertOne(...)` because someone said "the native driver is faster." Validation never runs. Passwords skip hashing. A cron job uses a typo'd collection name `user` instead of `users`. Half your codebase talks to Mongoose documents; half talks to raw BSON. Bugs show up only in production edge paths.

The missing piece is not the schema — it is the **model**: the compiled bridge between your schema and a specific MongoDB collection, with static query methods and document constructors every part of the app should import.

## 2. The Analogy — Make the Mechanic Obvious

If the schema is a **cookie recipe**, the model is the **bakery station** stamped with that recipe's name.

The recipe lists ingredients and steps (paths, validators, hooks). The station is where work actually happens: "make a batch of `User` cookies," "find all chocolate-chip cookies from Tuesday," "throw away stale ones." You do not re-read the recipe book from scratch every time — you work at the station labeled `User`.

Calling `mongoose.model('User', userSchema)` registers that station. `User.find()` and `new User()` both go through it.

## 3. The Full Explanation — How It Actually Works

**What a model is.** A model is a **constructor function** (class) compiled from a schema. It maps to exactly one MongoDB collection (default: lowercased, pluralized model name — `'User'` → `users` collection).

```js
const User = mongoose.model('User', userSchema);
// equivalent explicit: mongoose.model('User', userSchema, 'users');
```

**Two roles in one object:**

1. **Static methods (collection-level)** — query and mutate many documents:
   - `User.find({ role: 'admin' })`
   - `User.create({ email, password })`
   - `User.updateOne({ _id }, { $set: { name } })`
   - `User.aggregate([...])`

2. **Constructor (instance-level)** — create one [document](./what-is-a-document.md):
   - `const u = new User({ email: 'a@b.com' })`
   - `await u.save()` — runs validators and middleware

**Model registration and reuse:**

```js
// First call compiles schema → model
mongoose.model('User', userSchema);

// Later files: retrieve without re-passing schema
const User = mongoose.model('User');
```

Passing a **new** schema to an already-registered name throws — prevents accidental redefinition in hot reload or duplicate imports.

**Models vs connections.** In multi-tenant or multi-DB setups, use `connection.model('User', userSchema)` on a specific connection instead of the global `mongoose.model`.

**What models do under the hood:**

- Cast filters and update payloads against the schema (in strict query mode)
- Hydrate BSON results into document instances (unless `.lean()`)
- Attach schema middleware to `save`, `validate`, etc.
- Expose `populate()` for referenced paths

**What models do not do:**

- Guarantee collection exists before first write (MongoDB creates lazily)
- Enforce schema on writes that bypass the model API
- Replace indexes until you build them (`syncIndexes`, migrations)

See [How do you structure Mongoose models](./how-do-you-structure-mongoose-models.md) for file layout in larger apps.

## 4. See It In Practice — Real Code or Queries

```js
// models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  },
  { timestamps: true }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const bcrypt = require('bcrypt');
  this.password = await bcrypt.hash(this.password, 12);
});

// Static helper — lives on the model, not each document
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
```

```js
// routes/signup.js
const User = require('../models/user');

async function signup(req, res) {
  try {
    // Static: create + validate + pre-save hook in one call
    const user = await User.create({
      email: req.body.email,
      password: req.body.password,
    });

    // Instance document — password hidden (select: false)
    res.json({ id: user._id, email: user.email, role: user.role });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email taken' });
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    throw err;
  }
}

async function login(req, res) {
  // Must opt in to load password field
  const user = await User.findByEmail(req.body.email).select('+password');
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  // bcrypt.compare(user.password, req.body.password) ...
}
```

Every path imports `User` — not the raw collection — so hooks and validators always run.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a Mongoose model?**

A model is a class compiled from a schema that represents a MongoDB collection. It provides static methods for queries and updates and constructs document instances for individual records. It is the primary API developers use to read and write data through Mongoose.

**Q: How does Mongoose pick the collection name?**

By default, Mongoose pluralizes and lowercases the model name: model `'User'` → collection `users`. Pass a third argument to `mongoose.model(name, schema, collectionName)` to override.

**Q: What is the difference between `Model.create()` and `new Model()` + `save()`?**

Both run validation and save middleware. `create()` is shorthand for instantiating and saving (can accept an array for bulk). `new Model()` lets you mutate the instance before `save()` and is clearer when building up a document across multiple steps.

**Q: Can one schema have multiple models?**

Yes — compile the same schema with different model names and collection names for polymorphic storage or archive tables. Uncommon but valid.

**Q: What happens if you call `mongoose.model('User')` before defining the schema?**

It throws — the model is not registered yet. Convention: define schema and export model from one module; other files require that module.

## 6. The Traps — What Goes Wrong in Production

**Recompiling models on every hot reload in dev.** Use `mongoose.models.User || mongoose.model('User', schema)` pattern to avoid OverwriteModelError.

**Querying with the model but updating via `collection.updateMany`.** Bypasses middleware and validation. Refunds missing audit hooks; passwords skip hashing.

**Assuming `findOneAndUpdate` runs save middleware.** It does not run full `save` hooks by default — use `{ runValidators: true }` and know that `pre('save')` does not fire. Use `pre('findOneAndUpdate')` or migrate to `doc.save()`.

**Exporting schema but not model.** Teammates import schema and invent their own `mongoose.model` calls with slightly different options — duplicate registrations or inconsistent collection names.

**Giant god models.** Thousands of lines in one file with every static method. Split by domain; keep models thin, services orchestrate.

## 7. Compare With Related Concepts

**Model vs schema**

- Schema: definition only
- Model: executable API bound to a collection
- Rule: define once on schema; import model everywhere else

**Model vs MongoDB collection**

- Collection: server-side bucket of BSON documents
- Model: client-side class mapping to that bucket
- Rule: one model per collection per connection in typical apps

**Mongoose model vs SQL table ORM entity**

- SQL entity: row in fixed table, joins are first-class
- Mongoose model: document in flexible collection, references need populate or aggregation
- Rule: do not expect SQL join semantics from `find()` alone

## 8. 🧠 The Memory Hook

The **schema is the recipe; the model is the kitchen station** with the name on it. You never sprinkle flour directly on the warehouse floor — you work at `User` or `Order` so validation, hooks, and collection mapping happen every time.
