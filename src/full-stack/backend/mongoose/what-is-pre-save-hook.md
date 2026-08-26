# Pre-Save Hook

## 1. The Real-World Problem — When You Actually Hit This

You ship a user registration feature. In development, everything works perfectly. A week after launch, security finds plaintext passwords in your database. Your authentication library bcrypt is installed, but the developer who wrote the signup route forgot to call it before saving. Or worse: they did call it, but someone added a new admin creation script that bypasses the route and saves directly to the database. Now you have a breach and a compliance nightmare.

This is the exact moment you wish you had put password hashing inside the database layer itself, not in the API route. A pre-save hook would have caught every single save operation—route-based, script-based, or migration-based—and hashed the password automatically before it ever touched the database.

## 2. The Analogy — Make the Mechanic Obvious

Think of a pre-save hook like the quality control checkpoint at a factory loading dock. Before any product leaves the factory and gets loaded onto a truck, it passes through this checkpoint. The inspector checks the product, applies final packaging, adds required labels, and can reject it if something is wrong.

The factory workers (your API routes, scripts, admin tools) don't need to remember to do these final steps. They just hand the product to the loading dock. The checkpoint handles the consistent final processing every single time, regardless of who sent the product or how it got there.

In Mongoose, the document being saved is the product, and the pre-save hook is that checkpoint. It runs automatically before every save operation, no matter where that save originated from.

## 3. The Full Explanation — How It Actually Works

A pre-save hook is Mongoose middleware that executes right before a document is persisted to MongoDB. It runs synchronously or asynchronously, and it has access to the document through `this`. You can modify the document, validate it, compute derived fields, or prevent the save entirely by passing an error to the `next()` callback.

The hook fires on methods that trigger a database write: `save()`, `create()`, `insertMany()`, and any operation that calls these internally. It does not fire on `updateOne()`, `findOneAndUpdate()`, or bulk updates—those use different hooks.

When the hook runs, `this` refers to the document being saved. For async operations like password hashing or external API calls, you make the hook async and await the operation. If you call `next(new Error('reason'))`, Mongoose aborts the save and rejects with that error. If you call `next()` without arguments, the save proceeds.

A critical detail: pre-save hooks run after schema validation but before the actual database write. This means validation has already passed, so you can assume required fields exist and types are correct. But it also means if your hook modifies a field that has a validator, that validator won't run again unless you explicitly trigger it.

## 4. See It In Practice — Real Code or Queries

Here's a practical example showing password hashing and a computed slug field:

```javascript
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  slug: { type: String, unique: true }
});

// Pre-save hook for password hashing
userSchema.pre('save', async function(next) {
  // Only hash if password was modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save hook for generating a URL-friendly slug
userSchema.pre('save', function(next) {
  if (this.isModified('email') && !this.slug) {
    this.slug = this.email
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

const User = mongoose.model('User', userSchema);

// These both trigger the hooks:
await User.create({ email: 'user@example.com', password: 'plain123' });
// OR
const user = new User({ email: 'user@example.com', password: 'plain123' });
await user.save();
```

Here's an example that prevents invalid state by blocking the save:

```javascript
const orderSchema = new mongoose.Schema({
  items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Item' }],
  total: Number,
  status: { type: String, default: 'pending' }
});

orderSchema.pre('save', function(next) {
  if (this.items.length === 0 && this.status !== 'cancelled') {
    return next(new Error('Cannot create an order with no items'));
  }
  if (this.total < 0) {
    return next(new Error('Order total cannot be negative'));
  }
  next();
});
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a pre-save hook in Mongoose and when would you use it?**

A pre-save hook is middleware that runs before a document is saved to the database. You use it whenever you need to modify, validate, or enrich data consistently across all save operations. Common use cases include password hashing, generating slugs or default values, computing derived fields, enforcing business rules that validation can't express, and ensuring data consistency regardless of where the save originates from.

**Q: Do pre-save hooks run on `findOneAndUpdate()` or `updateMany()`?**

No. Pre-save hooks only run on `save()`, `create()`, and methods that internally call `save()`. For update operations like `findOneAndUpdate()`, `updateOne()`, and `updateMany()`, you need to use `pre('updateOne')` or `pre('findOneAndUpdate')` hooks instead. This is a common trap—developers add a pre-save hook and expect it to fire on all updates, but it only catches document saves.

**Q: How do you prevent a pre-save hook from running multiple times on the same document?**

Use `isModified()` to check whether the field you care about actually changed. For example, in a password hashing hook, check `if (!this.isModified('password')) { return next(); }`. This prevents re-hashing an already-hashed password when other fields on the document are updated. You can also use `isNew` to detect whether this is a new document versus an update to an existing one.

**Q: Can pre-save hooks be asynchronous?**

Yes. Make the hook function async and use await for async operations like password hashing, external API calls, or database queries. Mongoose waits for the async hook to resolve before proceeding with the save. If the async operation throws or you pass an error to `next()`, the save is aborted.

**Q: What's the difference between pre-save hooks and schema validators?**

Validators run before pre-save hooks and check whether the data matches the schema rules (required, min/max, enum, custom validators). Pre-save hooks run after validation passes and can modify data, compute derived values, or enforce business logic that validators can't express. Validators are for schema-level correctness; pre-save hooks are for data transformation and application-level rules.

## 6. The Traps — What Goes Wrong in Production

**The update-operation trap:** You add a pre-save hook to hash passwords or update timestamps, but then someone uses `findOneAndUpdate()` in a migration script or admin tool. The hook never fires, and you end up with plaintext passwords or stale timestamps. Always match the hook type to the operation: pre-save for `save()`/`create()`, pre-update for update operations.

**The infinite loop trap:** Your pre-save hook modifies a field that triggers the same hook again. For example, a hook that updates a `updatedAt` timestamp every time the document changes— but if you're not careful, setting `updatedAt` itself counts as a modification and re-triggers the hook. Use `isModified()` to check whether the relevant fields actually changed before taking action.

**The validation bypass trap:** Your pre-save hook modifies a field that has a validator, but the validator already ran before your hook. The modified value might be invalid, but it gets saved anyway because validation doesn't re-run. If your hook modifies validated fields, explicitly call `this.validate()` or restructure to use a pre-validate hook instead.

**The this-binding trap:** In pre-save hooks, `this` refers to the document being saved. But if you use an arrow function instead of a regular function, `this` won't be bound correctly and you'll get undefined or the wrong context. Always use regular function syntax for Mongoose hooks: `schema.pre('save', function(next) { ... })`, not arrow functions.

**The async/await trap:** You make your hook async but forget to await an operation, or you mix callbacks with promises. If you use async/await, don't call `next()` at all—just let the function resolve or throw. If you use callbacks, don't make the function async. Mixing both causes unpredictable behavior where the save might proceed before your async work finishes.

## 7. Compare With Related Concepts

**Pre-save vs. Pre-validate:** Pre-validate hooks run before schema validation, while pre-save hooks run after validation. Use pre-validate when you need to normalize data before validation checks it (like trimming strings or setting default values). Use pre-save when you need to transform data after validation passes (like hashing passwords or computing derived fields).

**Pre-save vs. Post-save:** Pre-save hooks run before the document hits the database and can modify or block the save. Post-save hooks run after the successful database write and are useful for side effects like sending welcome emails, clearing caches, or updating related documents. If you need to prevent invalid data, use pre-save. If you need to react to a successful save, use post-save.

**Pre-save vs. Instance Methods:** Instance methods are functions you call explicitly on a document instance, like `user.hashPassword()`. Pre-save hooks run automatically on every save. Use instance methods when you want explicit, optional behavior. Use pre-save hooks when you need mandatory, consistent behavior across all saves.

**Pre-save vs. Middleware in Express:** Express middleware runs during the HTTP request lifecycle. Pre-save hooks run during the database persistence lifecycle. Express middleware is for request/response concerns—auth, parsing, logging. Pre-save hooks are for data concerns—validation, transformation, consistency. Put password hashing in a pre-save hook, not Express middleware, so it runs even from scripts and CLI tools.

## 8. 🧠 The Memory Hook

Pre-save hooks are the loading dock checkpoint: every document passes through before leaving for the database, guaranteed final processing regardless of which worker sent it.
