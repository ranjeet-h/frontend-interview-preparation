# How do you handle transactions in Mongoose

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce app has been running fine for months. Users place orders, payments get processed, inventory gets deducted, everything works. Then one Friday night, the payment gateway times out halfway through an order. The payment succeeded on their end, but your server crashed before you could deduct the inventory and save the order. Now you have a user who was charged but has no order in your system, and your inventory numbers are wrong. The user is angry, support is overwhelmed, and you're manually reconciling databases at midnight.

This is the exact moment you realize that operations that touch multiple documents or collections need to either all succeed together or all fail together. MongoDB transactions in Mongoose give you that guarantee.

## 2. The Analogy — Make the Mechanic Obvious

Think of a transaction like a bank transfer. When you move money from checking to savings, the bank doesn't just subtract from checking and hope the add to savings works. They do both operations as a single unit: if the debit succeeds but the credit fails, they roll back the debit. Your money never disappears into the void—it's either in one account, the other, or both, but never lost.

Mongoose transactions work the same way. You start a transaction, run multiple database operations, and then either commit (all changes are permanent) or abort (all changes are discarded). If anything fails midway, the entire transaction is rolled back automatically.

## 3. The Full Explanation — How It Actually Works

MongoDB introduced multi-document transactions in version 4.0, and Mongoose wraps this functionality to make it work with your schemas and models. A transaction in Mongoose is a session that groups multiple operations across one or more collections into an atomic unit.

Here's what actually happens:

1. **Start a session**: You create a MongoDB client session using `mongoose.startSession()`. This session tracks all operations that belong to the transaction.

2. **Begin the transaction**: You call `session.startTransaction()` to mark the start of your atomic operations. From this point, any operation that uses this session is part of the transaction.

3. **Run your operations**: You perform your database operations—creates, updates, deletes—passing the session to each one. These operations are staged but not yet visible to other clients.

4. **Commit or abort**: If everything succeeds, you call `session.commitTransaction()` to make all changes permanent. If anything fails, you call `session.abortTransaction()` to roll back all changes.

5. **End the session**: Finally, you call `session.endSession()` to clean up resources.

The key insight is that other database clients cannot see your changes until you commit. If your application crashes midway, MongoDB will automatically abort the transaction when it detects the abandoned session. This is what gives you the all-or-nothing guarantee.

Transactions in MongoDB require a replica set—you cannot use transactions on a standalone MongoDB instance. This is because transactions rely on the replication log for consistency and recovery. In development, you can run a single-node replica set, but in production you need a proper replica set.

Mongoose makes this pattern cleaner with the `withTransaction` helper, which handles commit, abort, and session cleanup automatically. You pass it an async function that receives the session, and it commits if your function completes successfully or aborts if it throws.

## 4. See It In Practice — Real Code or Queries

Here's a complete example of handling an order with inventory deduction using Mongoose transactions:

```javascript
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define your schemas
const productSchema = new Schema({
  name: String,
  quantity: { type: Number, min: 0 }
});

const orderSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  products: [{
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    quantity: Number
  }],
  total: Number,
  status: { type: String, default: 'pending' }
});

const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);

async function createOrder(userId, cartItems) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Calculate total and validate inventory
    let total = 0;
    const orderProducts = [];

    for (const item of cartItems) {
      const product = await Product.findById(item.productId).session(session);

      if (!product) {
        throw new Error(`Product ${item.productId} not found`);
      }

      if (product.quantity < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }

      // Deduct inventory within the transaction
      product.quantity -= item.quantity;
      await product.save({ session });

      total += product.price * item.quantity;
      orderProducts.push({
        product: product._id,
        quantity: item.quantity
      });
    }

    // Create the order within the same transaction
    const order = await Order.create([{
      user: userId,
      products: orderProducts,
      total: total,
      status: 'confirmed'
    }], { session });

    // If we get here, everything succeeded—commit the transaction
    await session.commitTransaction();

    return order[0];

  } catch (error) {
    // Anything went wrong—abort the transaction
    await session.abortTransaction();
    throw error; // Re-throw so the caller can handle it
  } finally {
    // Always end the session to clean up
    await session.endSession();
  }
}
```

Using the `withTransaction` helper for cleaner code:

```javascript
async function createOrderWithHelper(userId, cartItems) {
  const session = await mongoose.startSession();

  try {
    const order = await session.withTransaction(async () => {
      let total = 0;
      const orderProducts = [];

      for (const item of cartItems) {
        const product = await Product.findById(item.productId).session(session);

        if (!product || product.quantity < item.quantity) {
          throw new Error('Invalid product or insufficient stock');
        }

        product.quantity -= item.quantity;
        await product.save({ session });

        total += product.price * item.quantity;
        orderProducts.push({
          product: product._id,
          quantity: item.quantity
        });
      }

      const order = await Order.create([{
        user: userId,
        products: orderProducts,
        total: total,
        status: 'confirmed'
      }], { session });

      return order[0];
    });

    return order;

  } finally {
    await session.endSession();
  }
}
```

The critical parts are:
- Every operation that should be atomic gets `{ session }` passed to it
- `session.startTransaction()` begins the atomic block
- `session.commitTransaction()` makes changes permanent
- `session.abortTransaction()` (or an error in `withTransaction`) rolls back everything
- `session.endSession()` always runs in a `finally` block to prevent session leaks

## 5. Interview Questions — All of Them, Done Properly

**Q: When should you use transactions in Mongoose?**

Use transactions whenever you need to maintain consistency across multiple documents or collections. The classic cases are: transferring funds between accounts (debit one, credit another), order processing (deduct inventory, create order, update user stats), and any workflow where partial success would leave your data in an invalid state. If you're only updating a single document, you don't need a transaction—MongoDB's single-document atomicity is sufficient.

**Q: What are the requirements for using MongoDB transactions?**

You need MongoDB 4.0 or later, and your deployment must be a replica set (not a standalone instance). Transactions rely on the replica set's oplog for consistency and recovery. In development, you can configure a single-node replica set for testing, but production requires a proper replica set with at least three nodes for fault tolerance.

**Q: What happens if your application crashes during a transaction?**

MongoDB will automatically abort the transaction when it detects that the session has been abandoned without a commit or abort. The transaction timeout (default 60 seconds) also causes automatic abort if the transaction runs too long. This is the safety mechanism that prevents "zombie" transactions from holding locks indefinitely.

**Q: How do transactions affect performance?**

Transactions have overhead. They acquire locks, write to the oplog, and require additional coordination between replica set members. Long-running transactions can block other operations and cause contention. Keep transactions as short as possible—do the minimum work needed, and avoid holding a transaction open while waiting for external APIs or doing slow computations.

**Q: Can you read documents created within the same transaction?**

Yes, within the same transaction session, you can read documents you've created or modified, even though they're not visible to other clients yet. This is called "read your own writes" consistency. However, be aware that reads inside a transaction use snapshot isolation in some configurations, so you might not see writes from other concurrent transactions.

**Q: How do you handle retries when transactions fail due to conflicts?**

MongoDB transactions can fail with write conflicts if multiple transactions try to modify the same documents simultaneously. The pattern is to catch the specific error (often a `MongoWriteConflictError` or similar) and retry the entire transaction with exponential backoff. Mongoose's `withTransaction` helper actually has built-in retry logic for transient errors, but you may want to implement custom retry logic for specific use cases.

## 6. The Traps — What Goes Wrong in Production

**Forgetting to pass the session to every operation**

This is the most common mistake. If you start a transaction but forget to pass `{ session }` to even one operation, that operation runs outside the transaction. It commits immediately, while the rest of your operations are still pending. When you later abort the transaction, the operations without the session are not rolled back, leaving you with partial data corruption.

```javascript
// WRONG: create() doesn't get the session
await Product.updateOne({ _id: id }, { $inc: { quantity: -1 } }).session(session);
await Order.create(orderData); // Missing .session(session)!
await session.commitTransaction(); // Order is saved, product update is rolled back on error
```

**Not ending the session in a finally block**

If your code throws an error before `session.endSession()`, the session remains open on the server. Sessions consume server resources and can exhaust your connection pool if you leak enough of them. Always wrap session cleanup in a `finally` block to ensure it runs regardless of success or failure.

**Running transactions for too long**

Holding a transaction open while making HTTP requests, doing file I/O, or running slow computations is a performance killer. The transaction holds locks on the documents it touches, blocking other operations. Keep the transaction boundary tight—do all your external validation and preparation before starting the transaction, then execute only the database operations inside it.

**Assuming transactions replace the need for proper schema design**

Transactions fix atomicity, not bad data modeling. If you have denormalized data that needs to stay in sync across multiple documents, transactions help keep writes consistent, but reads can still see inconsistent state depending on your read concern. Think carefully about whether you should normalize your schema instead of relying on transactions to patch denormalization problems.

**Using transactions when single-document operations suffice**

If you're only updating one document, MongoDB's single-document atomicity is already guaranteed. Adding a transaction adds overhead without benefit. Use transactions only when you need to coordinate changes across multiple documents or collections.

**Not handling transaction-specific errors**

Transactions can fail with specific errors like `TransientTransactionError` (temporary failure that might succeed on retry) or `UnknownTransactionCommitResult` (the commit happened but the server couldn't confirm). Your error handling should distinguish these from application errors and apply appropriate retry logic rather than treating all errors as permanent failures.

## 7. Compare With Related Concepts

**Transactions vs Single-Document Atomicity**

MongoDB guarantees that a single document operation is atomic. If you update one document with `$inc`, `$set`, and `$push` in one operation, either all modifications happen or none do. You don't need a transaction for single-document changes. Transactions are only needed when you need atomicity across multiple documents or collections.

**Transactions vs Two-Phase Commit**

Before MongoDB 4.0, the pattern for multi-document atomicity was "two-phase commit"—a design pattern where you manually implement transaction-like behavior using a separate transaction document and status flags. This was complex and error-prone. Native transactions replace this pattern with a built-in, ACID-compliant solution.

**Transactions vs Optimistic Concurrency Control**

Optimistic concurrency uses version numbers or timestamps to detect conflicts after they happen and retry. Transactions use pessimistic locking to prevent conflicts by acquiring locks upfront. Transactions are simpler to reason about but can have more contention under high write volume. Optimistic concurrency can scale better for contentious workloads but requires more complex retry logic.

**Mongoose Transactions vs SQL Transactions**

The concept is the same—atomic, consistent, isolated, durable operations—but the implementation differs. SQL transactions often autocommit by default and are more tightly integrated with the connection. MongoDB transactions require explicit session management and a replica set. SQL transactions are generally faster for simple cases but less flexible for document structures.

## 8. 🧠 The Memory Hook

A transaction is a promise: either everything happens, or nothing happens. Think of it as wrapping your database operations in an "all-or-nothing" bubble—if anything pops the bubble (an error), everything inside disappears.
