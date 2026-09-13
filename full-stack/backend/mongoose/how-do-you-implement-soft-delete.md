# How do you implement soft delete

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce app has been running fine for months. Users can delete their accounts, and you've been using `deleteOne` to remove user documents from MongoDB. Then one day, a customer who deleted their account six months ago contacts support — they accidentally deleted the wrong account and want it restored. You check your database backups, but the last backup before their deletion is three weeks old. Their order history, payment records, and shipping addresses are gone forever. That's when you realize hard delete was a mistake.

Or worse: a user deletes their account, but their referenced data in other collections — orders, reviews, comments — still exists. Now your database has orphaned records pointing to non-existent users. Reports break, foreign key-like checks fail, and your analytics show ghost data. This is the exact moment you understand why soft delete exists.

## 2. The Analogy — Make the Mechanic Obvious

Think of soft delete like moving a file to your computer's trash can instead of permanently deleting it. When you drag a file to the trash, the file doesn't disappear — it just gets marked as "deleted" and moved to a special folder. You can still see it in the trash, restore it if you made a mistake, and empty the trash later when you're absolutely sure you don't need it anymore.

Hard delete is like shredding a document. Once it's shredded, you can never get it back. Soft delete is like filing the document in a "deleted" cabinet. It's still there if you need it, but it's not in your main filing cabinet where you do your daily work.

In MongoDB terms, hard delete removes the document entirely. Soft delete just adds a timestamp saying "this was deleted at this time" and then filters it out of normal queries. The data stays in the database until you decide to actually remove it.

## 3. The Full Explanation — How It Actually Works

Soft delete is a pattern where you don't actually remove documents from your database. Instead, you mark them as deleted by adding a field — usually called `deletedAt` — that stores the timestamp when the delete happened. Then, every query that retrieves data needs to filter out documents where `deletedAt` is not null.

Here's what happens step by step:

When a user "deletes" something, your application doesn't call `deleteOne` or `deleteMany`. Instead, it runs an update operation that sets `deletedAt` to the current timestamp. The document stays in the collection, fully intact, but now it carries this deletion marker.

When your application queries for data, it automatically adds a filter condition: `deletedAt: null` or `deletedAt: { $exists: false }`. This ensures that "deleted" documents don't appear in normal results. They're still in the database, but they're invisible to your application under normal circumstances.

For this to work reliably, you need to implement it at the schema level in Mongoose. You can use a plugin, middleware, or default query scopes to automatically apply the `deletedAt` filter. If you rely on developers to remember to add the filter in every query, someone will forget, and deleted data will leak into your application.

The trade-off is straightforward: you gain the ability to restore data and maintain referential integrity, but you pay for it with slightly larger collections and the need to be careful about indexes. Your queries need to account for the `deletedAt` field, and you need to decide what to do with truly old deleted data — keep it forever, archive it, or eventually hard delete it.

## 4. See It In Practice — Real Code or Queries

Here's a complete Mongoose implementation using a plugin approach:

```javascript
const softDeletePlugin = (schema) => {
  // Add the deletedAt field to the schema
  schema.add({
    deletedAt: {
      type: Date,
      default: null,
      index: true // Important for query performance
    }
  });

  // Create a static method for soft delete
  schema.statics.softDelete = function(filter) {
    return this.updateMany(filter, { deletedAt: new Date() });
  };

  // Create a static method to restore
  schema.statics.restore = function(filter) {
    return this.updateMany(filter, { deletedAt: null });
  };

  // Add a query helper to filter out deleted documents
  schema.query.notDeleted = function() {
    return this.where({ deletedAt: null });
  };

  // Pre-find hook to automatically filter deleted documents
  schema.pre(/^find/, function(next) {
    // Only apply if the query doesn't explicitly include deleted docs
    if (!this.getOptions().includeDeleted) {
      this.where({ deletedAt: null });
    }
    next();
  });
};

// Apply the plugin to your schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  createdAt: { type: Date, default: Date.now }
});

userSchema.plugin(softDeletePlugin);

const User = mongoose.model('User', userSchema);

// Usage examples:

// Soft delete a user
await User.softDelete({ _id: userId });

// This automatically filters out deleted users
const activeUsers = await User.find();

// If you need to include deleted users
const allUsers = await User.find().setOptions({ includeDeleted: true });

// Restore a deleted user
await User.restore({ _id: userId });

// Using the query helper explicitly
const activeUsers = await User.find().notDeleted();
```

If you don't want to use a plugin, here's a simpler approach with a schema method:

```javascript
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  deletedAt: { type: Date, default: null, index: true }
});

userSchema.methods.softDelete = function() {
  this.deletedAt = new Date();
  return this.save();
};

userSchema.methods.restore = function() {
  this.deletedAt = null;
  return this.save();
};

// Remember to add the filter in every query
const activeUsers = await User.find({ deletedAt: null });
const deletedUsers = await User.find({ deletedAt: { $ne: null } });
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is soft delete and why would you use it instead of hard delete?**

Soft delete is a pattern where you mark documents as deleted by setting a timestamp field instead of actually removing them from the database. You use it when you need to preserve data for audit trails, allow users to undo deletions, maintain referential integrity across collections, or comply with data retention requirements. Hard delete is permanent — once the document is gone, you can't get it back without a restore from backup. Soft delete gives you a safety net while keeping deleted data out of your application's normal flow.

**Q: How do you implement soft delete in Mongoose?**

The most reliable way is to use a schema plugin that adds a `deletedAt` field, modifies delete operations to update that field instead of removing documents, and adds a pre-find hook to automatically filter out deleted documents. You should also add static methods like `softDelete` and `restore` for explicit control, and index the `deletedAt` field for query performance. The key is making it automatic at the schema level so developers don't have to remember to add the filter in every query.

**Q: What are the downsides of soft delete?**

The main downsides are increased storage usage — deleted documents stay in your database until you clean them up — and the need to be careful with indexes and queries. Every query needs to account for the `deletedAt` field, which can make indexes larger and queries slightly slower. You also need a strategy for eventually cleaning up old deleted data, or your collections will grow indefinitely. There's also a security consideration: if your query filtering fails, deleted data might leak into your application.

**Q: How do you handle unique indexes with soft delete?**

This is a tricky one. If you have a unique index on `email` and you soft delete a user, then try to create a new user with the same email, the unique index will block it because the old document still exists. The solution is to use a partial unique index that only applies to documents where `deletedAt` is null: `db.users.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } })`. This way, the uniqueness constraint only applies to active documents.

**Q: Should you soft delete everything or just some data?**

You should soft delete data that has business value when deleted — user accounts, orders, content that might need to be restored, or anything involved in audit trails. You might hard delete things like temporary cache data, session records, or logs that have explicit retention policies and no restoration need. The decision comes down to: if someone deletes this by mistake or if you need it for compliance later, soft delete it. If it's truly disposable and you're confident it will never be needed, hard delete is fine.

## 6. The Traps — What Goes Wrong in Production

The most common trap is forgetting to filter deleted documents in some queries. If you use manual filtering instead of schema-level hooks, it's almost guaranteed that someone will write a query that forgets the `deletedAt: null` condition. Suddenly, deleted users appear in search results, deleted products show up in catalogs, or deleted comments render on posts. This is why pre-find hooks or query helpers are essential — they make the filtering automatic.

Another trap is not indexing the `deletedAt` field. Without an index, queries that filter on `deletedAt` will scan more documents than necessary. As your collection grows, this gets slower. Add a compound index if you frequently query on other fields plus `deletedAt`, like `{ email: 1, deletedAt: 1 }`.

The unique index problem catches people off guard. You soft delete a user with email `john@example.com`, then try to create a new user with that same email. The create fails because the unique index still sees the old document. The fix is a partial unique index, but many developers don't know about this feature and waste time debugging the "duplicate key" error.

Performance can degrade if you never clean up old deleted documents. Your collections grow indefinitely, indexes get larger, and backups take longer. You need a background job or cron job to actually hard delete documents that have been soft-deleted for longer than your retention period — say, 90 days for most data, longer for compliance requirements.

Finally, aggregation pipelines are another place where soft delete filtering gets missed. Aggregations don't automatically use your Mongoose schema hooks, so you need to add a `$match` stage at the beginning: `{ $match: { deletedAt: null } }`. Forget this, and your aggregations will include deleted data.

## 7. Compare With Related Concepts

**Soft delete vs hard delete:** Soft delete marks documents as deleted but keeps them in the database with a timestamp. Hard delete permanently removes documents. Use soft delete when you need to restore data, maintain referential integrity, or keep audit trails. Use hard delete for truly disposable data like caches or temporary records where you're confident restoration will never be needed.

**Soft delete vs archiving:** Soft delete keeps deleted data in the same collection, just filtered out. Archiving moves old or deleted data to a separate collection or database. Archiving is better when you have large volumes of old data that you want to keep but don't need in your active queries. Soft delete is simpler for smaller datasets where the overhead of keeping deleted documents is manageable.

**Soft delete vs versioning:** Soft delete is a binary state — deleted or not deleted. Versioning keeps multiple versions of a document over time, allowing you to see the full history of changes. Versioning is more complex and storage-intensive but gives you audit trails for every modification. Soft delete only tracks deletion, not the full change history.

## 8. 🧠 The Memory Hook

Soft delete is the trash can: documents are marked as deleted and filtered from normal queries, but they remain in the database until you explicitly empty the trash.
