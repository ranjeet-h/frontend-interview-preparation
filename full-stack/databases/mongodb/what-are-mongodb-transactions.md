# MongoDB Transactions

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce app has been running fine for months. Users place orders, you deduct inventory, you create order records, you charge their credit card. Each operation works fine on its own. Then one Friday evening, the payment gateway times out halfway through processing an order. The inventory was already deducted. The order record was created. But the payment failed. Now you have a customer who was charged for inventory they never received, or worse — inventory deducted for an order that was never paid for. Your database is now in an inconsistent state that customer support has to clean up manually. This is the exact moment you realize you needed transactions.

## 2. The Analogy — Make the Mechanic Obvious

Think of a bank transfer between two accounts. You have Account A with $100 and Account B with $50. You want to move $20 from A to B. The transfer has two steps: subtract $20 from A, then add $20 to B. If the power goes out after the subtraction but before the addition, $20 has vanished from the system. That's unacceptable.

A transaction is like a banker who locks both ledgers, makes both changes privately, checks that everything balances, and only then unlocks the ledgers for everyone else to see. If anything goes wrong at any point, the banker erases all the private changes and acts like nothing happened. The outside world never sees a half-finished transfer.

In MongoDB, the transaction is that banker. It locks the documents involved, makes all changes in private, and only commits them when every operation succeeds. If any operation fails, it rolls everything back.

## 3. The Full Explanation — How It Actually Works

MongoDB transactions give you ACID guarantees across multiple documents and collections. Before MongoDB 4.0, you only got atomicity on a single document. If you needed to update two documents consistently, you had to design your schema around embedding everything in one document. Multi-document transactions changed that.

Here's what actually happens when you run a transaction:

First, you start a transaction on a session. That session tracks all operations within the transaction. MongoDB then begins the transaction internally — it doesn't lock anything yet, but it starts recording your operations.

When you perform operations (insert, update, delete) within that transaction, MongoDB doesn't immediately apply those changes to the data. Instead, it writes them to a private, isolated view. Other connections reading the same documents see the old data. Your transaction sees the new data. This is called snapshot isolation.

When you call commit, MongoDB checks a few things: are all the operations valid? Did any write conflict with another transaction? Is the replica set healthy? If everything checks out, MongoDB applies all your changes atomically — either all of them happen, or none do. Other connections can now see the new data.

If any operation fails, or if you explicitly abort, or if a conflict occurs, MongoDB rolls back everything. The database state is exactly as it was before the transaction started. No partial changes, no orphaned data.

There are real costs to this. Transactions consume resources on the primary node. They can cause write conflicts if two transactions try to modify the same document simultaneously. They have a time limit — if a transaction runs too long (default 60 seconds), MongoDB will abort it. And they require a replica set with a primary — transactions don't work on standalone MongoDB instances.

The transaction must also respect causal consistency. If you read a document in a transaction, then update another document based on that read, MongoDB ensures that other sessions don't see the update without seeing the read that caused it. This prevents weird ordering bugs in distributed systems.

## 4. See It In Practice — Real Code or Queries

Here's a real e-commerce order scenario using the MongoDB Node.js driver:

```javascript
const { MongoClient } = require('mongodb');

async function placeOrder(userId, items, paymentDetails) {
  const client = new MongoClient('mongodb://localhost:27017');

  try {
    await client.connect();
    const session = client.startSession();

    // Start the transaction
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' }
    });

    const db = client.db('ecommerce');
    const users = db.collection('users');
    const orders = db.collection('orders');
    const inventory = db.collection('inventory');

    try {
      // Step 1: Check user exists and is active
      const user = await users.findOne(
        { _id: userId, status: 'active' },
        { session }
      );

      if (!user) {
        throw new Error('User not found or inactive');
      }

      // Step 2: Reserve inventory for each item
      for (const item of items) {
        const result = await inventory.updateOne(
          {
            productId: item.productId,
            quantity: { $gte: item.quantity }
          },
          {
            $inc: { quantity: -item.quantity, reserved: item.quantity }
          },
          { session }
        );

        if (result.matchedCount === 0) {
          throw new Error(`Insufficient inventory for ${item.productId}`);
        }
      }

      // Step 3: Create the order record
      const orderResult = await orders.insertOne(
        {
          userId,
          items,
          status: 'pending_payment',
          createdAt: new Date(),
          total: calculateTotal(items)
        },
        { session }
      );

      // Step 4: Process payment (this would call an external API)
      const paymentSuccess = await processPayment(paymentDetails);

      if (!paymentSuccess) {
        throw new Error('Payment failed');
      }

      // Step 5: Update order status to confirmed
      await orders.updateOne(
        { _id: orderResult.insertedId },
        { $set: { status: 'confirmed' } },
        { session }
      );

      // All operations succeeded — commit the transaction
      await session.commitTransaction();
      console.log('Order placed successfully');
      return orderResult.insertedId;

    } catch (error) {
      // Something went wrong — abort and roll back everything
      await session.abortTransaction();
      console.error('Transaction aborted:', error.message);
      throw error;
    } finally {
      await session.endSession();
    }

  } finally {
    await client.close();
  }
}
```

The key parts here: `session.startTransaction()` begins the transaction, every operation passes `{ session }` to participate in it, `commitTransaction()` makes the changes permanent, and `abortTransaction()` rolls everything back if anything fails.

Here's the same pattern using Mongoose:

```javascript
const mongoose = require('mongoose');

async function placeOrderWithMongoose(userId, items, paymentDetails) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const user = await User.findOne({ _id: userId, status: 'active' }).session(session);
    if (!user) throw new Error('User not found or inactive');

    for (const item of items) {
      const inventory = await Inventory.findOneAndUpdate(
        {
          productId: item.productId,
          quantity: { $gte: item.quantity }
        },
        {
          $inc: { quantity: -item.quantity, reserved: item.quantity }
        },
        { session, new: true }
      );

      if (!inventory) throw new Error(`Insufficient inventory for ${item.productId}`);
    }

    const order = await Order.create([{
      userId,
      items,
      status: 'pending_payment',
      createdAt: new Date(),
      total: calculateTotal(items)
    }], { session });

    const paymentSuccess = await processPayment(paymentDetails);
    if (!paymentSuccess) throw new Error('Payment failed');

    order[0].status = 'confirmed';
    await order[0].save({ session });

    await session.commitTransaction();
    return order[0]._id;

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}
```

Mongoose's `create()` with an array returns an array, hence `order[0]`. The pattern is the same: start, operate, commit or abort, end.

## 5. Interview Questions — All of Them, Done Properly

**Q: When should you use MongoDB transactions vs. individual operations?**

Use transactions when you need to maintain consistency across multiple documents or collections. The classic example is moving money between accounts — both the debit and credit must succeed or fail together. Or an order workflow: reserve inventory, create order, process payment, confirm order. If the payment fails, you don't want to keep the inventory reserved.

Don't use transactions for single-document operations. MongoDB already gives you atomicity at the document level. If you can design your schema so that related data lives in one document, you don't need a transaction. That's often faster and simpler.

Also avoid transactions for long-running operations. Transactions have a time limit and holding locks too long hurts performance. If an operation takes seconds, consider an async pattern with eventual consistency instead.

**Q: What are the performance implications of using transactions?**

Transactions are slower than individual operations. MongoDB has to do more work: it maintains isolation, tracks operations for rollback, validates everything at commit time, and may need to retry on write conflicts. The overhead is real but manageable for most applications.

Write conflicts are the main performance killer. If two transactions try to modify the same document concurrently, one will fail and need to retry. In high-contention scenarios, this can cause significant slowdowns. Design your data access patterns to minimize contention — avoid hot documents that many transactions need to update.

Transactions also consume memory and oplog space on the primary. Long-running transactions or many concurrent transactions can pressure these resources. Monitor transaction duration and abort long-running ones before they hit the timeout.

**Q: What happens if a transaction fails partway through?**

MongoDB rolls back all changes made within that transaction. The database returns to the exact state it was in before the transaction started. No partial updates are visible to other sessions. This is the "A" in ACID — atomicity.

Your application code needs to handle the failure gracefully. Catch the error, call `abortTransaction()` if it hasn't already aborted, and decide what to tell the user. For an order that failed payment, you might show "Payment failed, please try again" rather than "System error."

**Q: Do MongoDB transactions work across different databases?**

No. Transactions are scoped to a single database. You can't start a transaction, update a document in the `ecommerce` database, then update a document in the `analytics` database, and commit them together. Each database would need its own transaction.

If you need cross-database consistency, you need a different pattern — maybe a saga pattern with compensating transactions, or a distributed transaction coordinator. MongoDB doesn't provide built-in cross-database transactions.

**Q: What isolation level do MongoDB transactions use?**

MongoDB uses snapshot isolation. When a transaction starts, it sees a consistent snapshot of the data. Other concurrent transactions don't affect the data your transaction sees. When your transaction commits, its changes become visible to others, but it still sees its own snapshot.

This prevents dirty reads (reading uncommitted changes from other transactions) and non-repeatable reads (reading different values on subsequent reads within the same transaction). It doesn't prevent phantom reads in all cases, but snapshot isolation is strong enough for most applications.

**Q: Can you read from a secondary in a transaction?**

No. Transactions must use the primary node. Secondaries are eventually consistent by design, and transactions require strong consistency. If you try to read from a secondary within a transaction, MongoDB will throw an error.

This is important for read preference. Your application might use secondaries for read-heavy workloads to reduce load on the primary. But any operation inside a transaction must go to the primary, regardless of your normal read preference.

## 6. The Traps — What Goes Wrong in Production

**Forgetting to abort on error**

The most common bug is starting a transaction, running operations, catching an error, but forgetting to call `abortTransaction()`. The transaction will eventually time out and abort automatically, but you've held locks and resources longer than necessary. Always use try/catch/finally to ensure cleanup:

```javascript
try {
  session.startTransaction();
  // operations
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction(); // Don't forget this
  throw error;
} finally {
  await session.endSession();
}
```

**Mixing transactional and non-transactional operations**

Once you start a transaction on a session, all operations on that session should be within the transaction. If you perform an operation without passing the session, it runs outside the transaction and commits immediately. This breaks atomicity — the non-transactional operation can't be rolled back. Always pass `{ session }` to every operation that should be part of the transaction.

**Long-running transactions**

Transactions have a default time limit of 60 seconds. If your transaction takes longer, MongoDB aborts it. This often happens when developers put external API calls inside a transaction — like calling a payment gateway or sending an email. Those operations are slow and unreliable. Do the database work in the transaction, then handle external calls after commit. If the external call fails, use a compensating transaction to undo the database changes.

**Not handling write conflicts**

When two transactions try to modify the same document, one will fail with a write conflict error. Many applications don't handle this and just crash. Implement retry logic with exponential backoff:

```javascript
async function executeWithRetry(operation, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code === 112 && i < maxRetries - 1) {
        // Write conflict — retry
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
      } else {
        throw error;
      }
    }
  }
}
```

**Using transactions on standalone MongoDB**

Transactions require a replica set. If you're developing locally with a standalone MongoDB instance, transactions won't work. Always use a replica set in development, even if it's just a single-node replica set, to match production behavior.

**Ignoring read and write concerns**

Transactions have default read and write concerns that may not match your application's needs. The default read concern is `local`, which reads from the primary but doesn't wait for replication. The default write concern is `w: 1`, which waits for acknowledgment from the primary but not from secondaries. For stronger guarantees, specify `readConcern: { level: 'majority' }` and `writeConcern: { w: 'majority' }` when starting the transaction.

## 7. Compare With Related Concepts

**MongoDB transactions vs. SQL transactions**

Both provide ACID guarantees, but there are differences. SQL databases have had transactions for decades — they're mature, well-understood, and highly optimized. MongoDB added multi-document transactions in 4.0, so they're newer and have different performance characteristics.

SQL transactions can span multiple tables and databases in some systems. MongoDB transactions are scoped to a single database. SQL transactions often have more isolation level options (read committed, repeatable read, serializable). MongoDB uses snapshot isolation.

The biggest difference is schema philosophy. SQL databases normalize data across many tables, so cross-table transactions are essential. MongoDB encourages embedding related data in single documents, reducing the need for transactions. Use transactions in MongoDB when embedding isn't feasible, not as a default pattern.

**MongoDB transactions vs. individual document atomicity**

Every single document operation in MongoDB is atomic. If you update one document with multiple field changes, either all field changes apply or none do. You don't need a transaction for single-document operations.

Use individual document atomicity when possible — it's faster, simpler, and has no transaction overhead. Use multi-document transactions only when you need to update multiple documents or collections atomically.

**MongoDB transactions vs. two-phase commit**

Before MongoDB 4.0, developers used a two-phase commit pattern to simulate transactions across documents. You'd create a "transaction" document with state "pending", perform your operations, then update the state to "committed" or "aborted". Application code had to handle cleanup of orphaned pending transactions.

Real transactions are much simpler — MongoDB handles the complexity. You don't need to design and maintain your own transaction state. The two-phase commit pattern is now largely obsolete unless you need cross-database transactions.

**MongoDB transactions vs. sagas**

Sagas are a pattern for managing distributed transactions across multiple services. Instead of one big transaction that locks everything, you break the operation into steps, each with a compensating action to undo it if a later step fails. For an order, you'd: reserve inventory (compensate: release), charge payment (compensate: refund), create order (compensate: cancel). If payment fails, you run the compensate for inventory.

Sagas don't provide strong consistency — you might have temporary inconsistencies during the saga. But they scale better across services and don't require distributed locks. Use MongoDB transactions within a single service/database, and sagas across multiple services.

## 8. 🧠 The Memory Hook

Transactions are an all-or-nothing promise to your database: every operation succeeds together, or none do. Like a banker who locks both ledgers until every entry balances, then opens the doors — or erases everything and walks away if the math doesn't work.
