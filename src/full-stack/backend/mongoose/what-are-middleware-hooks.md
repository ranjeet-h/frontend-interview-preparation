# What are middleware hooks

## 1. The Real-World Problem — When You Actually Hit This

You're building a user registration system. The requirements are simple: hash passwords before saving, set a createdAt timestamp, and send a welcome email after the user is created. In your first iteration, you handle all of this in the controller route handler. It works fine.

Then you add an admin import feature that bulk-creates users. Someone forgets to hash the passwords. Then you add a CLI script for seeding test data. It also forgets to hash. Then another developer adds a user creation endpoint for mobile apps and forgets the timestamp.

Suddenly you have plaintext passwords in production, inconsistent timestamps across different creation paths, and welcome emails that sometimes don't fire. The problem isn't that your code is wrong — it's that the business logic is scattered across every place where a user gets created. Mongoose middleware hooks solve this by letting you attach logic directly to the schema, so it runs automatically no matter how the document is saved.

## 2. The Analogy — Make the Mechanic Obvious

Think of middleware hooks like the security checkpoints at an airport. Before you board a plane (save a document), you go through multiple checkpoints: ID check, baggage scan, metal detector. Each checkpoint is a pre-boarding step that must pass before you're allowed to continue. After you land (after the document is saved), you might go through customs — a post-arrival step that happens after the main operation is complete.

In Mongoose, each operation like `save()`, `findOneAndUpdate()`, or `deleteOne()` is like a flight. The hooks are the checkpoints. Some run before the operation takes off (pre hooks), some run after it lands (post hooks). No matter which gate you use — the web API, a bulk import script, or a CLI tool — you always go through the same checkpoints. This ensures consistent behavior across your entire application.

## 3. The Full Explanation — How It Actually Works

Mongoose middleware hooks are functions that run at specific points during the lifecycle of a document or query operation. They're attached to your schema and execute automatically when you perform actions on that schema's model.

There are four types of middleware in Mongoose:

**Document middleware** runs on document operations like `init`, `validate`, `save`, and `remove`. These hooks have access to the document instance via `this`. For example, a pre-save hook can modify the document before it's written to MongoDB.

**Query middleware** runs on query operations like `count`, `find`, `findOne`, `findOneAndUpdate`, `findOneAndDelete`, and `updateOne`. These hooks don't have direct access to the document — they work on the query object itself. This is important because query operations can affect multiple documents at once.

**Model middleware** runs on model-level operations like `insertMany`, `bulkWrite`, and `create`. These are useful for operations that don't fit neatly into the document or query categories.

**Aggregate middleware** runs on aggregation pipelines. It's less commonly used but powerful for modifying aggregation behavior.

Hooks are defined with two flavors: pre hooks run before the operation, post hooks run after. Pre hooks can control whether the operation proceeds — you can call `next()` to continue or throw an error to stop it. Post hooks always run after the operation completes, and they have access to the result.

The execution order matters. For a `save()` operation, Mongoose runs validation first, then pre-save hooks, then the actual database write, then post-save hooks. For query operations like `findOneAndUpdate()`, the pre hook runs before the query executes, and the post hook runs after MongoDB returns the result.

Hooks are synchronous by default, but you can make them asynchronous by passing an options object with `{ sync: false }` or by using async/await. This is crucial for operations like sending emails or calling external APIs — you don't want to block the database write while waiting for an email service.

## 4. See It In Practice — Real Code or Queries

Here's a practical example showing different types of hooks:

```javascript
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: String,
  accountStatus: { type: String, default: 'active' },
  lastLogin: Date
})

// Pre-save hook: hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash if password is modified (or new)
  if (!this.isModified('password')) return next()

  try {
    const hashedPassword = await bcrypt.hash(this.password, 10)
    this.password = hashedPassword
    next()
  } catch (error) {
    next(error) // This will prevent the save from completing
  }
})

// Post-save hook: send welcome email after successful save
userSchema.post('save', function(doc, next) {
  // This runs after the document is saved to MongoDB
  // doc is the saved document
  sendWelcomeEmail(doc.email, doc.name)
    .then(() => next())
    .catch(err => {
      // Log error but don't block — email failure shouldn't prevent save
      console.error('Failed to send welcome email:', err)
      next()
    })
})

// Pre-find hook: filter out deleted accounts
userSchema.pre('find', function() {
  // this is the query object
  this.where({ accountStatus: { $ne: 'deleted' } })
})

// Pre-update hook: add updatedAt timestamp
userSchema.pre('findOneAndUpdate', function() {
  this.set({ updatedAt: new Date() })
})

// Post-remove hook: cleanup related data
userSchema.post('findOneAndDelete', function(doc, next) {
  // Remove user's sessions, notifications, etc.
  cleanupUserData(doc._id)
    .then(() => next())
    .catch(err => next(err))
})

const User = mongoose.model('User', userSchema)
```

Here's an example showing async hook control flow:

```javascript
// Using async/await in a pre hook
orderSchema.pre('save', async function(next) {
  // Check inventory before saving order
  const product = await Product.findById(this.productId)
  if (product.stock < this.quantity) {
    const error = new Error('Insufficient stock')
    next(error) // This stops the save operation
  } else {
    // Deduct from inventory
    product.stock -= this.quantity
    await product.save()
    next() // Continue with the save
  }
})
```

And here's how hooks work with query middleware specifically:

```javascript
// Query middleware: 'this' refers to the query, not the document
userSchema.pre('findOneAndUpdate', function() {
  // Log who is updating what
  console.log('Updating user:', this.getFilter())
  
  // Automatically set updatedAt
  this.set({ updatedAt: new Date() })
})

// This hook fires for both findOneAndUpdate and findOneAndDelete
userSchema.pre(/^findOneAnd/, function() {
  console.log(' findOneAnd operation detected')
})
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What's the difference between document middleware and query middleware in Mongoose?**

Document middleware runs on document methods like `save()`, `remove()`, and `validate()`. In these hooks, `this` refers to the document instance, so you can access and modify the document's fields directly. Query middleware runs on query methods like `find()`, `findOneAndUpdate()`, and `updateOne()`. In query middleware, `this` refers to the query object, not the document. This distinction matters because query operations can affect multiple documents and don't have a single document instance to work with.

**Q: When should you use pre hooks vs post hooks?**

Use pre hooks when you need to modify data before the operation or prevent the operation from happening. Examples: hashing passwords, validating business rules, checking inventory, setting timestamps. Use post hooks when you need to do something after the operation succeeds and you might need the result. Examples: sending emails, logging analytics, updating caches, triggering notifications. Post hooks always run after the operation completes, so they can't prevent the operation — they can only react to it.

**Q: What happens if a pre hook throws an error or calls next with an error?**

The operation stops and the error is passed back to your calling code. For example, if a pre-save hook calls `next(new Error('Invalid data'))`, the `save()` method will reject with that error and nothing will be written to MongoDB. This is how you implement custom validation or business logic constraints that go beyond schema validation.

**Q: Can you use hooks with insertMany or bulk operations?**

Yes, but the behavior is different. `insertMany` triggers `save` hooks for each document by default, but you can disable this with `{ rawResult: true }` for better performance on large bulk inserts. For `bulkWrite`, hooks don't run automatically — you need to handle any pre/post logic manually before or after calling the bulk operation. This is a common trap when performance-tuning bulk imports.

**Q: How do you prevent infinite loops when a hook modifies the document and triggers another save?**

Use the condition check pattern. For example, in a pre-save hook that hashes passwords, always check `if (!this.isModified('password')) return next()`. This ensures the hook only runs when the password actually changes, not when the document is saved for other reasons. Without this check, modifying the document inside a pre-save hook would trigger another save, which would trigger the hook again, creating an infinite loop.

## 6. The Traps — What Goes Wrong in Production

**Forgetting that query middleware doesn't have document access.** A common mistake is trying to access `this.password` in a `findOneAndUpdate` pre hook. In query middleware, `this` is the query object, not the document. You need to use `this.getUpdate()` to see what's being updated, and you can't read the current document values without an extra query.

**Blocking async operations in post hooks.** If you make a post hook async and don't handle errors properly, a failed email send or cache update can cause the entire operation to fail. For post hooks that do non-critical work like logging or sending notifications, wrap the async work in a try-catch and always call `next()` even if the side effect fails. The document is already saved — don't let a side effect break the main operation.

**Creating infinite loops with document modifications.** Modifying a document inside a pre-save hook without checking what changed triggers another save, which runs the hook again. Always use `isModified()` or `isNew` to guard your hook logic. The same applies to update hooks that modify the same fields they're updating.

**Assuming hooks run in all contexts.** Hooks don't run when you use native MongoDB operations through `Model.collection` or when you bypass Mongoose entirely. If you have performance-critical code that uses direct MongoDB driver access, you need to manually handle whatever logic your hooks would normally do.

**Overusing hooks for complex business logic.** Hooks are great for data consistency tasks like hashing, timestamps, and validation. But they're not the right place for complex multi-document transactions or external service calls that might fail. If your hook needs to query other collections, call external APIs, or implement complex workflows, consider moving that logic to a service layer instead. Hooks should be focused on the document they're attached to.

**Missing error handling in async hooks.** If an async pre hook throws an unhandled promise rejection instead of calling `next(error)`, the operation might hang or the error might be swallowed. Always use try-catch with `next(error)` in async hooks, or use the async/await pattern with proper error propagation.

## 7. Compare With Related Concepts

**Middleware hooks vs schema validators:** Validators run during the validation phase and check if data matches your schema rules. Hooks run before or after the actual database operation and can modify data or trigger side effects. Use validators for data shape constraints (required fields, string length, enum values). Use hooks for business logic and data transformations (hashing, timestamps, derived fields).

**Middleware hooks vs virtuals:** Virtuals are computed properties that don't exist in the database but appear on your document when accessed. Hooks are functions that run at specific points in the document lifecycle. Use virtuals when you need a derived value on read (like `fullName` from `firstName` and `lastName`). Use hooks when you need to transform data before it's saved or trigger actions after save.

**Middleware hooks vs instance methods:** Instance methods are functions you attach to the schema that you call explicitly on a document instance (like `user.generateResetToken()`). Hooks run automatically in response to Mongoose operations. Use instance methods for intentional actions the caller decides to perform. Use hooks for automatic behavior that should always happen regardless of who's calling the operation.

**Middleware hooks vs Express middleware:** They share the name and the pre/post concept, but operate at different layers. Express middleware runs during the HTTP request/response cycle and has access to req/res. Mongoose middleware runs during the database operation lifecycle and has access to documents and queries. Express middleware is for API-level concerns (auth, logging, parsing). Mongoose middleware is for data-level concerns (validation, transformation, consistency).

## 8. 🧠 The Memory Hook

**Pre hooks are gatekeepers, post hooks are cleanup crew.** Pre hooks stand at the door and decide whether the operation can proceed — they can modify the data or stop it entirely. Post hooks run after the operation is done and handle side effects like emails, logging, or cache updates. Every operation goes through the gatekeeper, then does its work, then the cleanup crew takes over.
