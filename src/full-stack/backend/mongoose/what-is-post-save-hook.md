# Mongoose Post-Save Hook

## 1. The Real-World Problem — When You Actually Hit This

You just deployed a new user registration feature. Everything works great in development. Then a week later, your support team starts getting reports: "I signed up but never got the welcome email," "My profile doesn't show up in search," and "The analytics dashboard says we have 50 signups but the database shows 100."

What happened? You saved the user document to MongoDB, but you forgot to send the welcome email, update the search index, and push the analytics event. Or worse, you did all that inline in your controller, and when the email service timed out, the entire registration failed even though the user was already saved to the database.

You need a way to automatically run side effects after a document is saved — without coupling them to your API controllers and without letting their failures break the save operation itself.

## 2. The Analogy — Make the Mechanic Obvious

Think of a post-save hook like the automatic confirmation steps after you complete an online purchase.

When you click "Place Order," the system first saves your order to the database. That's the core operation — if that fails, nothing happens. But once the order is saved, a whole chain of automatic tasks kicks in: the system sends you a confirmation email, updates the inventory count, notifies the warehouse to pack your items, and logs the sale for analytics.

The important part: if the email server is down or the warehouse notification fails, your order is still saved. You still bought the item. The confirmation steps are important, but they're not critical to the purchase itself. They run after the fact, and their failures don't undo what already succeeded.

In Mongoose, a post-save hook is exactly this — a function that runs automatically after a document is successfully saved to the database, perfect for side effects that should happen but shouldn't block the save.

## 3. The Full Explanation — How It Actually Works

A post-save hook is Mongoose middleware that executes after a document has been successfully written to MongoDB. It runs on the document instance and has access to the saved data, so you can use it to trigger related operations.

Mongoose supports four types of middleware: document middleware (like `save`, `validate`), query middleware (like `find`, `update`), aggregate middleware, and model middleware. Post-save hooks are document middleware — they run on individual document instances, not on queries.

When you call `doc.save()`, Mongoose runs through a sequence: pre-validation hooks, validation itself, pre-save hooks, the actual database write, and then post-save hooks. If the save fails for any reason (validation error, database connection issue, constraint violation), the post-save hooks never run. They only execute on successful saves.

Post-save hooks receive the document as `this`. In the hook, `this` is the saved document with all its fields, including any defaults or middleware-generated values. This means you can access `_id`, timestamps, computed fields, and anything else that was set during the save process.

The hook function is async, so you can await database operations, API calls, or other async tasks. However, what happens when the hook fails depends on how you handle errors. If you throw an error or reject a promise in a post-save hook, the error is emitted but it does not roll back the database save — the document is already in MongoDB. This is intentional: post-save hooks are for side effects, not for transactional operations.

There's an important distinction between `post('save')` and `post('save', false)`. By default, post-save hooks run on both `doc.save()` and `Model.create()`. If you pass `false` as the second argument, the hook won't run on `create()` calls, which can be useful when you want different behavior for programmatic saves versus bulk creation.

Mongoose also supports `post('insertMany')` hooks for bulk operations, which receive an array of documents rather than a single document. This is useful when you need to process multiple saved documents at once, like bulk indexing or batch notifications.

## 4. See It In Practice — Real Code or Queries

Here's a realistic example of a user schema with post-save hooks for common side effects:

```javascript
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Post-save hook to send welcome email
userSchema.post('save', async function(doc, next) {
  try {
    // Only send email for new users (not updates)
    if (doc.isNew) {
      await sendWelcomeEmail(doc.email, doc.name);
      console.log(`Welcome email sent to ${doc.email}`);
    }
    next();
  } catch (error) {
    // Log the error but don't block — the user is already saved
    console.error('Failed to send welcome email:', error);
    // We still call next() so the save completes successfully
    next();
  }
});

// Post-save hook to update search index
userSchema.post('save', async function(doc, next) {
  try {
    await searchIndex.indexUser({
      id: doc._id,
      name: doc.name,
      email: doc.email,
      createdAt: doc.createdAt
    });
    next();
  } catch (error) {
    console.error('Search index update failed:', error);
    // Optionally enqueue for retry rather than failing
    await retryQueue.add('indexUser', { userId: doc._id });
    next();
  }
});

// Post-save hook for analytics
userSchema.post('save', async function(doc, next) {
  try {
    if (doc.isNew) {
      await analytics.track('user_signed_up', {
        userId: doc._id,
        email: doc.email,
        timestamp: doc.createdAt
      });
    }
    next();
  } catch (error) {
    // Analytics failures should never block user operations
    console.error('Analytics tracking failed:', error);
    next();
  }
});

const User = mongoose.model('User', userSchema);

// Usage in your controller
async function registerUser(req, res) {
  try {
    const user = await User.create({
      email: req.body.email,
      name: req.body.name
    });
    // By the time we get here, all post-save hooks have run
    res.status(201).json({ userId: user._id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
```

Here's an example showing the difference between handling errors in post-save versus pre-save hooks:

```javascript
// Pre-save hook: can block the save if validation fails
userSchema.pre('save', function(next) {
  if (this.email.includes('spam')) {
    const error = new Error('Spam emails not allowed');
    return next(error); // This blocks the save
  }
  next();
});

// Post-save hook: save already happened, can't block it
userSchema.post('save', function(doc, next) {
  // Even if this throws, the document is already in MongoDB
  someExternalService.notify(doc._id)
    .then(() => next())
    .catch(err => {
      console.error('Notification failed:', err);
      next(); // Still call next() so the save completes
    });
});
```

For bulk operations, use the `insertMany` hook:

```javascript
userSchema.post('insertMany', async function(docs, next) {
  try {
    // docs is an array of saved documents
    const userIds = docs.map(doc => doc._id);
    await searchIndex.bulkIndexUsers(userIds);
    next();
  } catch (error) {
    console.error('Bulk index failed:', error);
    next();
  }
});
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a post-save hook in Mongoose and when would you use it?**

A post-save hook is middleware that runs after a document is successfully saved to MongoDB. You use it for side effects that should happen automatically after a save but shouldn't block the save operation itself. Common use cases include sending emails, updating search indexes, caching invalidation, analytics tracking, and notifying other services. The key is that these operations are important but not critical to the save itself — if they fail, the document should still be saved.

**Q: What's the difference between pre-save and post-save hooks?**

Pre-save hooks run before the document is saved to the database. They can modify the document, run validation, or even block the save by throwing an error. Post-save hooks run after the successful save — the document is already in MongoDB. They cannot block or undo the save, and they're used for side effects rather than data transformation. If a pre-save hook fails, nothing is written to the database. If a post-save hook fails, the document is already saved.

**Q: Can post-save hooks roll back a save if something goes wrong?**

No. Post-save hooks run after the document is already written to MongoDB. If you throw an error in a post-save hook, it doesn't undo the save. The document remains in the database. If you need transactional behavior where multiple operations either all succeed or all fail, you should use MongoDB transactions or move the logic into a pre-save hook, not a post-save hook.

**Q: How do you handle errors in post-save hooks without breaking the save?**

You catch errors within the hook and still call `next()` to allow the save to complete. Typically you log the error and optionally enqueue a retry for later. The pattern is: try the operation, catch any errors, log them, and always call `next()`. This ensures that failures in side effects don't cause confusion about whether the document was actually saved.

**Q: Do post-save hooks run on both `save()` and `create()`?**

By default, yes. Both `doc.save()` and `Model.create()` trigger post-save hooks. If you want a hook to only run on `save()` but not on `create()`, you can pass `false` as the second argument: `schema.post('save', false, function(doc, next) { ... })`. This is useful when you want different behavior for individual saves versus bulk creation.

**Q: What happens if you have multiple post-save hooks on the same schema?**

They run in the order they're defined. Mongoose executes middleware in sequence, so if you define three post-save hooks, the first one runs and completes, then the second, then the third. This means you can chain side effects — for example, one hook might update a cache, another might send an email, and a third might log to analytics. They all run after the same save operation.

**Q: Can you access the document's `_id` in a post-save hook?**

Yes. By the time post-save hooks run, the document has been saved to MongoDB, so it has an `_id` (even if you didn't set one manually). The document passed to the hook is the saved document with all its fields, including auto-generated values like `_id` and timestamps. This is why post-save hooks are perfect for operations that need the document's ID, like indexing or notifications.

## 6. The Traps — What Goes Wrong in Production

**Throwing errors in post-save hooks and expecting them to block the save.** This is the most common mistake. Developers throw an error when a side effect fails, thinking it will prevent the save. But the save already happened. The error gets emitted but the document is in the database. This causes confusion because the application might report an error while the data is actually saved. Always catch errors in post-save hooks and call `next()` anyway.

**Blocking the save with slow operations.** If you put a slow operation directly in a post-save hook without proper error handling or async boundaries, it can appear to block the response even though the save technically succeeded. For example, if your email service takes 5 seconds and you don't handle the async properly, the user might wait 5 seconds for a response. Always ensure post-save hooks are properly non-blocking or offloaded to a background job queue.

**Assuming hooks run on `findOneAndUpdate` and other query methods.** Post-save hooks only run on `save()` and `create()`. They do not run on query methods like `findOneAndUpdate`, `updateOne`, or `updateMany`. If you need hooks on those operations, you need to use query middleware like `post('findOneAndUpdate')` instead. This is a common source of bugs where side effects don't happen because the update went through a query method.

**Creating infinite loops by saving inside a post-save hook.** If you call `this.save()` inside a post-save hook, you'll trigger the hook again, creating an infinite loop. This happens when developers try to update related documents by saving them in a hook. Instead, use `updateOne` or other query methods to modify other documents, or use the `findOneAndUpdate` query middleware pattern.

**Forgetting that post-save hooks don't run on validation failures.** If a document fails validation, it never gets saved, so post-save hooks never run. This is correct behavior, but it can be surprising if you expect side effects to happen even for invalid data. If you need to track validation failures, use a post-validation hook instead.

**Running post-save hooks inside transactions without handling rollback.** If you're using MongoDB transactions and a transaction is aborted, the document isn't actually saved. However, if your post-save hook already ran and performed side effects like sending an email or calling an external API, those side effects aren't automatically rolled back. You need to design your system to handle this — either by using two-phase commit patterns, idempotent operations, or by moving side effects outside the transaction boundary.

**Missing error logging in post-save hooks.** Because post-save hook errors don't block the save, it's easy for failures to go unnoticed. If your email service is down and you silently catch the error, you might not realize users aren't getting welcome emails for weeks. Always log post-save hook errors and set up monitoring to alert on repeated failures.

## 7. Compare With Related Concepts

**Post-save hook vs Pre-save hook:** Pre-save hooks run before the document is saved and can block the save by throwing an error. They're used for validation, data transformation, and checks that should prevent invalid data from being saved. Post-save hooks run after the save and cannot block it. They're used for side effects that should happen after a successful save.

**Post-save hook vs Post-find hook:** Post-save hooks run on document saves. Post-find hooks run on query operations like `find()` and `findOne()`. Post-find hooks are used to transform results after they're retrieved from the database, like decrypting fields or computing derived values. They operate on query results, not on save operations.

**Post-save hook vs Database triggers:** Mongoose post-save hooks run in your application layer, while database triggers run in the database layer. Database triggers are more reliable because they run regardless of which application modifies the data, but they're database-specific and harder to test. Mongoose hooks are portable across databases but only run when the modification goes through your Mongoose application.

**Post-save hook vs Controller logic:** Controller logic runs in your request handler and is tightly coupled to that specific API endpoint. Post-save hooks are attached to the schema and run regardless of which part of your application triggers the save. If you save a user from multiple places (registration, admin panel, migration script), post-save hooks ensure consistent side effects across all of them.

**Post-save hook vs Event emitters:** You could emit custom events after a save and have listeners handle side effects. This decouples the side effects even more than hooks, but it requires setting up an event system and managing listeners. Post-save hooks are simpler and built into Mongoose, making them a good choice for straightforward side effects that are tightly coupled to the schema.

## 8. 🧠 The Memory Hook

Post-save hooks are the "after-party" of database operations — the celebration that happens after the main event is already complete. The guest of honor (the document) is already in the database, and now you send the invitations, update the guest list, and notify the DJ. If the DJ doesn't show up, the party still happened.
