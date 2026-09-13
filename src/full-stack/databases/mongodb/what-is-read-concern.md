# What is Read Concern

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce app has been running fine for months. Users place orders, they see their order history, everything works. Then one day during a flash sale, the database is under heavy load. A user places an order, gets redirected to the order confirmation page, and... sees nothing. The order was written to the database, but the read that loaded the confirmation page hit a secondary node that hadn't replicated the write yet. The user refreshes, sees the order, but the experience is broken. This is the moment you realize you needed to understand read concern.

Or worse: a financial system where a user transfers money, the transfer succeeds, but when they immediately check their balance, they still see the old amount. They transfer again, thinking the first one failed. Now they've double-spent. This is a consistency problem that read concern controls.

## 2. The Analogy — Make the Mechanic Obvious

Think of read concern like choosing how fresh your news source needs to be.

Imagine you're reading news about a live sports game. You have options:

- **"local"** is like standing outside the stadium hearing people shout updates. You hear what happened moments ago, but you might miss things or get rumors. Fast, but not guaranteed accurate.

- **"available"** is like checking any news website that might have cached the score from 5 minutes ago. You get something, but it might be old.

- **"majority"** is like waiting until multiple reputable sources all report the same score. You're confident it's correct because most sources agree. Slower, but reliable.

- **"linearizable"** is like calling the official scorekeeper directly and waiting for them to confirm the exact play-by-play order. You get the absolute truth, but you wait longer for it.

- **"snapshot"** is like taking a photo of the scoreboard at one moment and reading that photo consistently, even while the game continues. You see a consistent view from that point in time.

Read concern is exactly this: you tell MongoDB how fresh and consistent the data needs to be for your read operation, and MongoDB waits until that condition is met before returning results.

## 3. The Full Explanation — How It Actually Works

Read concern controls the consistency and isolation properties of read operations in MongoDB. It determines what data a read operation is allowed to return and whether it must wait for certain conditions to be satisfied.

MongoDB has five read concern levels:

**local** (default for standalone and replica sets) returns data from the node that responds fastest. It doesn't wait for any replication. If you read from a secondary, you might get stale data. If you read from the primary after a write, you might even read your own write before it's durable—because the write is in memory but not yet on disk. This is the fastest but least consistent option.

**available** is similar to local but with a key difference: it doesn't raise an error if the node is in a state where it can't serve reads (like during initial sync or recovering). It returns whatever it has, even if that's nothing. This is useful for monitoring or diagnostic queries where you'd rather get partial data than an error.

**majority** waits until the data has been written to a majority of replica set members (the write concern majority level) before returning it. This guarantees that the data you read is durable—it won't be rolled back if there's a failover. If a majority of nodes haven't acknowledged the write yet, the read waits or times out. This is slower but provides strong consistency guarantees.

**linearizable** is the strictest level. It reads data that reflects all successful writes with a majority write concern, and it does so in a way that appears to all clients as if they happened in a single total order. MongoDB reads from a single, up-to-date primary to ensure this. This is essential for operations like reading after a write where you must see your own write, or for financial operations where ordering matters. It's the slowest because it may involve waiting and coordinating across nodes.

**snapshot** is used with multi-document transactions. It reads from a consistent snapshot of the data at the transaction's start time or at a provided timestamp. All reads within the transaction see the same data, even if other writes are happening concurrently. This prevents phantom reads and provides isolation similar to SERIALIZABLE in relational databases.

The key trade-off is consistency versus latency. Lower read concern levels return data faster but may return stale or non-durable data. Higher levels guarantee consistency and durability but may be slower because they involve waiting for replication coordination.

Read concern works with read preference (which node to read from) and write concern (how many nodes must acknowledge a write). Together, they form MongoDB's consistency model. For example, you might read from the primary with linearizable read concern for critical financial reads, but read from secondaries with local read concern for analytics queries where stale data is acceptable.

## 4. See It In Practice — Real Code or Queries

Here's how you set read concern in MongoDB operations:

```javascript
// Using the MongoDB Node.js driver
const { MongoClient } = require('mongodb');

async function readWithReadConcern() {
  const client = await MongoClient.connect('mongodb://localhost:27017');
  const db = client.db('ecommerce');
  const orders = db.collection('orders');

  // Default read concern (local)
  const fastRead = await orders.findOne({ orderId: '12345' });
  // Returns quickly, but might be stale if reading from secondary

  // Majority read concern - waits for majority replication
  const consistentRead = await orders.findOne(
    { orderId: '12345' },
    { readConcern: { level: 'majority' } }
  );
  // Slower, but data is guaranteed durable across majority of nodes

  // Linearizable read concern - for critical reads after writes
  const criticalRead = await orders.findOne(
    { orderId: '12345' },
    { readConcern: { level: 'linearizable' } }
  );
  // Reads from primary, guarantees seeing all majority writes

  // Snapshot read concern within a transaction
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const products = db.collection('products');
      // All reads in this transaction see the same snapshot
      const product = await products.findOne(
        { productId: 'abc' },
        { session, readConcern: { level: 'snapshot' } }
      );
    });
  } finally {
    await session.endSession();
  }

  await client.close();
}
```

In Mongoose, you can set read concern at the schema, query, or transaction level:

```javascript
// Schema-level default
const orderSchema = new Schema({
  orderId: String,
  amount: Number
}, {
  readConcern: 'majority' // All queries use majority by default
});

// Override per query
const order = await Order.findOne({ orderId: '12345' })
  .readConcern('local')
  .exec();

// Within a transaction
const session = await Order.startSession();
session.startTransaction({
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' }
});
try {
  const order = await Order.findOne({ orderId: '12345' }).session(session);
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
} finally {
  await session.endSession();
}
```

From the MongoDB shell:

```javascript
// Set read concern for a specific operation
db.orders.find(
  { orderId: '12345' },
  { readConcern: { level: 'majority' } }
)

// Set default read concern for the connection
db.getMongo().setReadConcern('majority')
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is read concern in MongoDB and why does it matter?**

Read concern controls the consistency and isolation level of read operations. It determines whether a read operation can return stale data, whether it must wait for data to be replicated, and whether it must reflect all previous writes. It matters because it directly affects data correctness in your application—without the right read concern, users might see inconsistent data, miss their own writes, or make decisions based on outdated information.

**Q: What are the different read concern levels in MongoDB?**

MongoDB has five read concern levels: local (default, returns data from the node with lowest latency, no consistency guarantees), available (similar to local but doesn't error if the node can't serve reads), majority (waits for data to be replicated to a majority of nodes, guarantees durability), linearizable (strictest, reads reflect all majority writes in total order, reads from primary), and snapshot (used with transactions, reads from a consistent snapshot at a point in time).

**Q: When would you use majority read concern versus local?**

Use majority when data correctness is critical—financial transactions, order confirmations, inventory checks, any scenario where reading stale or non-durable data could cause business logic errors. Use local for analytics, logging, dashboards, or any read-heavy workload where slight staleness is acceptable and latency is more important than absolute consistency.

**Q: What is linearizable read concern and when is it necessary?**

Linearizable read concern guarantees that reads reflect all successful writes with majority write concern, and that these reads appear to happen in a single total order. It's necessary for scenarios where you must read your own write immediately after writing it, or when the ordering of operations matters—for example, reading a bank balance immediately after a transfer, checking inventory after placing an order, or any operation where the next read depends on the previous write being visible.

**Q: How does read concern interact with write concern?**

Read concern and write concern work together to provide consistency guarantees. Write concern controls how many nodes must acknowledge a write before it's considered successful. Read concern controls what data a read is allowed to return based on replication state. For example, if you use write concern majority and read concern majority, you're guaranteed that any read after a write will see that write (provided you read from a node that has it). If you use write concern 1 (default) and read concern majority, the read might wait indefinitely for data that was only written to one node.

**Q: What happens if you use linearizable read concern with a secondary node?**

Linearizable read concern requires reading from the primary. If you try to use linearizable with a read preference that directs reads to secondaries, MongoDB will either ignore the read preference and read from the primary, or it will return an error depending on the driver version and configuration. Linearizable reads must go through the primary to guarantee the total ordering of operations.

## 6. The Traps — What Goes Wrong in Production

**Using the default local read concern for critical reads**: Many developers never change the default, which means critical operations like checking account balances after transfers might read stale data from secondaries. This can cause users to see inconsistent state and make incorrect decisions.

**Not understanding that local doesn't guarantee your own write**: Even if you read from the primary immediately after a write with local read concern, you might not see your own write if the write is still in memory and not yet replicated or acknowledged. The write succeeded from the client's perspective, but the read might not see it yet.

**Using linearizable everywhere for "safety"**: Linearizable is slow because it involves coordination and waiting. Using it for all reads, including non-critical ones like product catalogs or user profiles, adds unnecessary latency and can become a bottleneck under load.

**Forgetting that majority read concern can timeout**: If your replica set is unhealthy or replication is lagging, majority read concern can cause queries to hang or timeout. You need proper error handling and fallback logic for these cases, not just set it and assume it always works fast.

**Mixing read concern levels without understanding the implications**: Using local for some operations and majority for others in the same workflow can lead to confusing behavior where some parts of your application see fresh data while others see stale data. This is especially problematic in multi-step operations like checkout flows.

**Not setting read concern in transactions**: When using multi-document transactions, you should explicitly set read concern to snapshot to get consistent isolation. Otherwise, you might get the default behavior which could vary based on server configuration.

**Assuming read concern replaces the need for proper indexing**: Read concern doesn't make slow queries fast. If your queries aren't indexed, adding read concern won't help—it might make them slower because of the additional waiting. Read concern is about consistency, not performance.

## 7. Compare With Related Concepts

**Read concern vs Write concern**: Read concern controls what data reads can return based on replication state. Write concern controls how many nodes must acknowledge a write before it's considered successful. They work together—write concern determines when data is "available" at different consistency levels, and read concern determines when reads are allowed to see that data.

**Read concern vs Read preference**: Read concern is about data consistency and freshness. Read preference is about which node to read from (primary, secondary, nearest). You can combine them—for example, read from secondaries with majority read concern to get consistent data from a nearby node, or read from primary with local read concern for low-latency reads that might be stale.

**Read concern vs Causal consistency**: Causal consistency is a session-based consistency model that guarantees causal ordering of operations within a session. Read concern is per-operation. Causal consistency is built on top of read concern and write concern—it uses them internally but provides a higher-level guarantee that operations within a session maintain their causal relationship.

**Read concern majority vs Linearizable**: Majority guarantees that data has been replicated to a majority of nodes and is durable. Linearizable provides the majority guarantee plus total ordering—all operations appear to happen in a single order across all clients. Linearizable is stricter and slower, necessary only when ordering matters.

**Snapshot read concern vs SERIALIZABLE isolation**: Snapshot in MongoDB provides similar guarantees to SERIALIZABLE in relational databases—reads within a transaction see a consistent snapshot. However, MongoDB's snapshot is implemented differently using its replication log and timestamps, and it applies specifically to multi-document transactions, not all reads.

## 8. 🧠 The Memory Hook — What Sticks

Read concern is your "freshness guarantee" knob—turn it up for critical data where correctness beats speed, turn it down for analytics where speed beats perfect consistency. The five levels are how many sources must confirm the news before you believe it: one shout (local), any website (available), most sources agree (majority), call the official directly (linearizable), or take a photo at one moment (snapshot).
