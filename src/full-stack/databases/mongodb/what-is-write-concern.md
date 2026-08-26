# What is Write Concern

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce app has been running fine for months. Users place orders, payments go through, and the order gets saved to MongoDB. Then one Tuesday afternoon, your primary database server crashes hard — disk failure, complete data loss on that node. You flip to a secondary, but when you check the order records, you discover that 47 users were told their orders were successful but those orders never made it to the replica set. Their payments are processed, but their orders are gone. This is the exact moment you realize you didn't understand write concern — your application was acknowledging success before MongoDB actually guaranteed the data was safe.

## 2. The Analogy — Make the Mechanic Obvious

Think of write concern like a certified mail receipt. When you send regular mail, you drop it in the box and walk away — you don't know if it arrived. That's like writing to MongoDB with weak write concern. When you send certified mail, the postal service gets a signature from the recipient and sends you back a receipt. You don't consider the job done until you have that receipt in hand. MongoDB write concern is exactly that receipt — it tells your application "yes, we actually wrote this data to the places you asked us to, and it's safe now."

The levels of write concern map to how many signatures you require. One signature from the local post office is fast but risky if the post office burns down. Signatures from three different regional hubs is slower but much safer. You choose based on how bad it would be if the mail got lost.

## 3. The Full Explanation — How It Actually Works

Write concern is the guarantee MongoDB gives your application about when a write operation is considered complete. It controls three things: how many nodes must acknowledge the write, whether the write must be written to disk (journaling), and how long the driver waits before giving up.

The levels work like this:

- `w: 1` means the primary node acknowledges the write. This is the default and the fastest, but if the primary crashes before replicating, the data is lost.
- `w: 0` means fire and forget — the driver doesn't even wait for acknowledgment. Fastest of all, but you have no idea if the write happened.
- `w: "majority"` means a majority of replica set members must acknowledge. This is the safe default for most production systems because it guarantees the write survives a single node failure.
- `w: <number>` means that many specific nodes must acknowledge, like `w: 3` in a 5-node replica set.
- `j: true` adds a requirement that the write must be written to the on-disk journal before acknowledgment, not just memory. This protects against power loss or OS crashes, but it's slower.
- `wtimeout: <ms>` is how long your driver waits before throwing an error. If the timeout expires, you don't know if the write succeeded or not — you have to handle that ambiguity.

The tradeoff is straightforward: stronger write concern = slower writes but safer data. Weaker write concern = faster writes but risk of data loss. Your application's business logic should dictate this choice, not default settings.

In a replica set, writes always go to the primary first. The primary applies the write locally, then replicates it to secondaries. Write concern controls when your application gets the "success" response — after the primary acknowledges, after some secondaries acknowledge, or after journaling completes. If you don't specify write concern, MongoDB uses `w: 1` with no journaling requirement by default.

## 4. See It In Practice — Real Code or Queries

Here's how you set write concern in different contexts:

```javascript
// In a MongoDB driver connection string
const client = new MongoClient('mongodb://localhost:27017', {
  w: 'majority',
  j: true,
  wtimeout: 5000
});

// On a specific operation
await db.orders.insertOne(order, {
  writeConcern: { w: 'majority', j: true }
});

// In Mongoose
await new Order(orderData).save({ writeConcern: { w: 1 } });

// Weaker concern for non-critical data (like analytics logs)
await db.analytics.insertOne(logEntry, {
  writeConcern: { w: 0 } // Fire and forget
});

// Stronger concern for financial transactions
await db.payments.updateOne(
  { _id: paymentId },
  { $set: { status: 'completed' } },
  { writeConcern: { w: 'majority', j: true, wtimeout: 10000 } }
);
```

The wtimeout parameter is crucial. Without it, if a node is down or slow, your application might hang indefinitely waiting for acknowledgment. Set it based on your SLA — if your API needs to respond within 200ms, don't set wtimeout to 30 seconds.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is write concern in MongoDB?**

Write concern is the level of guarantee MongoDB provides about when a write operation is considered successful. It controls how many replica set members must acknowledge the write and whether the write must be persisted to disk before the driver returns success to your application.

**Q: What are the different levels of write concern?**

The main levels are: `w: 0` (no acknowledgment, fire and forget), `w: 1` (primary acknowledgment only, default), `w: "majority"` (majority of replica set members acknowledge), and `w: <number>` (specific number of nodes). You can also add `j: true` to require journaling to disk and `wtimeout` to set a maximum wait time.

**Q: When would you use w: 0 versus w: "majority"?**

Use `w: 0` for data where losing some writes is acceptable — like analytics logs, telemetry, or non-critical event tracking where speed matters more than perfect accuracy. Use `w: "majority"` for data that must survive a node failure — user accounts, financial transactions, orders, anything where data loss would cause real problems. The default `w: 1` is a middle ground but still risks data loss if the primary crashes before replication completes.

**Q: What happens if write concern is not satisfied within the timeout?**

The driver throws a write concern error. The critical problem is that you don't know whether the write actually succeeded or not — it might have been applied but the acknowledgment didn't reach your driver in time. Your application needs to handle this ambiguity, usually by checking whether the document exists and retrying or compensating if needed.

**Q: How does write concern affect performance?**

Stronger write concern is slower. `w: 0` is fastest because the driver doesn't wait. `w: 1` waits for one network round-trip to the primary. `w: "majority"` waits for the primary plus enough secondaries to form a majority, which means multiple network round-trips. Adding `j: true` adds disk I/O wait time. The performance impact depends on your network latency and disk speed, but `w: "majority"` with journaling can be significantly slower than `w: 1` without journaling.

**Q: What is the relationship between write concern and read concern?**

Write concern controls write guarantees, read concern controls read guarantees. They work together — if you write with `w: "majority"` and read with `readConcern: "majority"`, you're guaranteed to read your own writes even after a failover. If you use weak write concern but strong read concern, you might read stale data because the write might not have actually been replicated.

## 6. The Traps — What Goes Wrong in Production

The most common trap is using the default write concern without thinking about it. The default is `w: 1` without journaling, which means if your primary node crashes before replicating to secondaries, you lose data. Most applications should explicitly set `w: "majority"` with `j: true` for important data.

Another trap is not setting wtimeout. If a secondary is down or network partitioned, your application might hang indefinitely waiting for acknowledgment. Always set a timeout based on your application's SLA.

A subtle trap is treating write concern errors as normal errors. When a write concern timeout happens, you don't know if the write succeeded. Naively retrying might create duplicate data if the first write actually succeeded. You need idempotent operations or a check-before-write pattern to handle this safely.

The performance trap is overusing strong write concern. Logging every user action with `w: "majority"` and `j: true` will slow your application dramatically. Use appropriate write concern per operation — strong for critical data, weak for telemetry.

## 7. Compare With Related Concepts

**Write concern vs Read concern:** Write concern controls when a write is considered complete (how many nodes acknowledge). Read concern controls what data a read operation can see (how stale the data can be). They're independent but related — strong write concern enables strong read concern guarantees.

**Write concern vs Journaling:** Journaling is a MongoDB server feature that writes operations to an on-disk journal before applying them to the data files. Write concern with `j: true` requires journaling to complete before acknowledgment. You can have journaling enabled on the server but not require it in write concern, or require it even if journaling is disabled (in which case the write fails).

**Write concern vs Replication:** Replication is the process of copying data from primary to secondaries. Write concern controls how much replication must complete before acknowledging the write. Replication happens regardless of write concern, but write concern determines when your application is told "it's done."

**Write concern vs Transactions:** Multi-document transactions in MongoDB use write concern internally for each operation in the transaction. The transaction as a whole commits with a specific write concern level. Transactions add ACID semantics across multiple documents, but write concern still controls the durability guarantee for those writes.

## 8. 🧠 The Memory Hook — What Sticks

Write concern is your receipt — it tells you when the mail is actually delivered, not just when you dropped it in the box. Strong receipt = safe but slow. No receipt = fast but risky.
