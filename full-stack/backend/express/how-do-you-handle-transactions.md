# How Do You Handle Transactions in Express?

## 1. The Real-World Problem — When You Actually Hit This

You ship an order checkout. A user clicks Buy. Your handler does three things: charge the payment, create the Order document, and decrement inventory for each product. It worked in development every time.

In production, the payment succeeds, the Order is created, and then the server crashes while updating the third product's stock. Or the inventory check passes, you create the order, but the stock update fails because another order just bought the last unit. Now you have a paid order with wrong inventory, or an order row with no stock deduction, or money taken with no order at all. Support is reconciling spreadsheets at midnight and you are writing a manual fix script that you hope does not make it worse.

The problem is not that MongoDB is unreliable. The problem is that you treated three separate writes as if they were one. Without a boundary that says "all of this commits together or none of it does," any crash or concurrent write between step one and step three leaves your data half-written. That is the exact moment you need a transaction. And there are just as many outages from using transactions everywhere as from using them nowhere, because a badly held transaction locks data and slows everything down.

## 2. The Analogy — Make the Mechanic Obvious

Think of a real-estate closing at a title company.

If you buy a coffee, you hand over cash and get coffee in one motion. No paperwork, no escrow. That is a single-document operation. MongoDB can do that atomically on its own. Either the one document updates or it does not. No coordinator needed.

Buying a house is different. Three things must move together or the deal is void: the buyer's money to the seller, the deed to the buyer, and the old lien payoff to the bank. You do not do those as three independent trips to three counters. You do them at one closing table inside one escrow file.

The escrow officer is the session. When you call `mongoose.startSession()`, you hire the officer. The escrow file she opens when you call `session.startTransaction()` is the transaction. Every document you slide across the table has to be stamped with the escrow file number. That stamp is `{ session }` on each Mongoose operation. If you forget the stamp on even one document, that document gets filed outside escrow. It becomes permanent immediately, even if the rest of the closing is later shredded.

While the closing is open, nothing is public yet. The deed and the payment sit on the table, invisible to anyone outside the room. That is isolation. If all signatures land, the officer walks the stack to the county recorder and it all becomes official at once. That is `commitTransaction`. If anyone walks away or a check bounces, she shreds the whole stack and nothing ever hit the county books. That is `abortTransaction`. She then closes the file and goes home. That is `endSession` in `finally`. If she left the file open on her desk, the office would run out of desks.

The county building itself has to support closings. A lone desk in a field cannot do escrow. That is why MongoDB transactions require a replica set, not a standalone node. The replica set is the building that provides the shared log that makes rollbacks recoverable.

And the little helper `session.withTransaction()` is the officer who also handles retries herself. If the county clerk says "try again, we had two closings touch the same deed at once," she automatically re-runs the whole closing instead of making you start over manually.

Hold onto this closing table. Everything below is just who stamps what, when to open escrow at all, and what happens when someone trips on the way to the recorder.

## 3. The Full Explanation — How It Actually Works

Start with the easy case, because most operations belong there. A single MongoDB document update is atomic by itself. If you do `updateOne` with `$inc`, `$set`, `$push` together on one document, Mongo either applies all of those field changes to that document or none of them. No other writer can see a half-updated document. For a single document, you do not need a transaction. A well-shaped atomic update is faster, simpler, and holds no cross-document locks.

You need a transaction only when correctness depends on two or more documents or collections changing together and a partial change would be wrong. Classic examples are order creation that touches orders plus multiple product stock counts, moving money between two account documents, or creating a user and its default workspace where either alone without the other breaks the app. If a crash between those writes would leave you needing a manual fix, that is your signal. If one document holds everything that must change together, redesign the document instead of adding a transaction.

A Mongoose transaction is a session that groups operations. The sequence is always the same. You create a session with `await mongoose.startSession()`. You call `session.startTransaction()` to open the atomic window. Every read or write that must be inside the boundary gets the session, either as `{ session }` in the options or chained as `.session(session)` for queries. Operations without the session are not part of the transaction at all. They commit immediately outside it, which is the most common source of half-written data when someone forgets one stamp. While the transaction is open, its writes are not visible to other clients. They are staged inside the session.

Then you resolve the transaction. If all steps succeeded, you call `await session.commitTransaction()`. That is when Mongo makes the staged writes visible together. If any step failed or you threw, you call `await session.abortTransaction()` and Mongo discards everything staged. Either way, you must call `session.endSession()` to free the server resource. The only place that guarantees it runs after both commit and abort is a `finally` block. Missing the finally is a session leak. Enough leaks exhaust the connection pool and new requests start queuing for a connection that never comes back.

Two hard environment facts matter. First, MongoDB multi-document transactions require a replica set. That has been true since MongoDB 4.0 for replica sets and 4.2 for sharded clusters. On a standalone `mongod` you will get an error saying transactions are not supported. In development you run a single-node replica set to keep this honest. In production you are already on a replica set, but your connection string and tests need to reflect it or every transaction test fails for a reason that looks like a code bug. Second, transactions hold locks and write to the oplog. A long-running transaction blocks other writers on the same documents and creates contention. Keep the transaction short. Do validation, price calculations, and external API calls before you open it, then do only the database writes inside it. Never hold a transaction open while calling a payment gateway or doing file I/O.

Mongoose gives you a second shape that removes most manual error handling. `session.withTransaction(async () => { ... })` starts the transaction, runs your function, commits if it returned without throwing, aborts if it threw, and retries automatically on transient errors like a write conflict where two transactions touched the same document at once. That retry is the reason to prefer `withTransaction` when you can. With the manual `startTransaction` plus try/catch shape, you have to decide yourself whether a `TransientTransactionError` is worth retrying and how many times, and you have to remember that even `commitTransaction` itself can throw. A commit failure does not mean the writes are half-applied. It means the transaction is still pending and you must abort. That is why the commit call must live inside the `try`, not after it. If it were after the try and it threw, the catch that aborts would never run.

Inside an Express route, the same Express rules from the middleware and async-error pages still apply. Any async handler that awaits IO must be wrapped so a rejection reaches the central error handler, or the page must state it assumes Express 5 where rejections are forwarded automatically. This page shows the wrapper so the pattern is safe on both versions. See [how Express middleware walks the stack](./how-does-express-middleware-work.md) for the walk and [how async errors reach the handler](./how-do-you-handle-async-errors-in-express.md) for the wrapper mechanic, and see the detailed Mongoose session lifecycle in [how Mongoose handles transactions](../mongoose/how-do-you-handle-transactions-in-mongoose.md) — this page does not re-teach that walk, it applies it to the route.

Failing closed is part of the contract. If any lookup inside the transaction cannot confirm stock, ownership, or price, abort and return a safe operational error via `AppError` from [global error handling](./how-do-you-implement-global-error-handling.md) — it sets `statusCode` and `isOperational = true` so the central handler surfaces the intended 400 or 409 instead of masking it as a generic 500. Do not commit a partial order because you think you can fix it later with a compensating write. Also decide status codes by the cause. A stock conflict is 409, bad input is 400, auth failure is 401, and an unexpected database error is 500 with a generic message. The commit versus abort decision and the HTTP status decision are separate but both live in the same catch.

Transactions do not solve cross-service consistency. A MongoDB transaction lives inside one replica set and one database. If your flow spans two services or two different databases, you cannot stretch one transaction across them. That case needs a different pattern, usually a saga with compensating actions, not a longer lock.

## 4. See It In Practice — Real Code or Queries

All snippets use Node 18+, Mongoose 7 or 8, and MongoDB 4.2+. Transactions require a replica set connection string, even in tests (for example a single-node replica set via `mongodb-memory-server` with `replSet` enabled). The examples use Express 4 with an `asyncHandler` wrapper so every async route that awaits IO is safe without relying on Express 5's automatic promise forwarding.

The first snippet shows when you do not need a transaction at all. One document, one atomic update.

```js
// single-document atomic operation - no session needed
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: String,
  quantity: { type: Number, min: 0 },
  price: Number
});
const Product = mongoose.model('Product', productSchema);

// decrement stock atomically if enough stock exists
// either this one document changes or it does not - no half state
async function decrementStock(productId, qty) {
  const updated = await Product.updateOne(
    { _id: productId, quantity: { $gte: qty } },
    { $inc: { quantity: -qty } }
  );
  // updated.modifiedCount === 0 means not enough stock or not found
  return updated.modifiedCount === 1;
}
```

The second snippet is the workhorse you will actually copy. An Express checkout route that touches two collections atomically with manual abort handling. Every operation that must be atomic carries `{ session }` or `.session(session)`. Operational failures like missing product or insufficient stock throw `new AppError(message, status)` — the shared class from [global error handling](./how-do-you-implement-global-error-handling.md) that sets `isOperational = true` so the central handler returns the intended 400 or 409 instead of masking it as 500. Commit can throw, so it stays inside the try. Abort runs on any failure. EndSession runs in finally no matter what.

```js
// routes/orders.manual.js - manual session shape inside an Express route
const express = require('express');
const mongoose = require('mongoose');

const AppError = require('../errors/AppError');
const Order = require('../models/Order');
const Product = require('../models/Product');

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const router = express.Router();

router.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const cartItems = req.body.items; // [{ productId, quantity }]

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      let total = 0;
      const orderProducts = [];

      for (const item of cartItems) {
        // read inside the transaction so we see a consistent snapshot
        const product = await Product.findById(item.productId).session(session);

        if (!product) {
          throw new AppError('Product ' + item.productId + ' not found', 400);
        }
        if (product.quantity < item.quantity) {
          throw new AppError('Insufficient stock for ' + product.name, 409);
        }

        // every write that must be atomic gets the session stamp
        product.quantity -= item.quantity;
        await product.save({ session });

        total += product.price * item.quantity;
        orderProducts.push({ product: product._id, quantity: item.quantity });
      }

      const docs = await Order.create(
        [{ user: userId, products: orderProducts, total, status: 'confirmed' }],
        { session }
      );

      // commit can throw (conflict, network) - must be inside try
      await session.commitTransaction();

      res.status(201).json({ data: docs[0] });
    } catch (err) {
      // abort discards every staged write - no partial order or stock change remains
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        // abort itself can fail if the transaction already expired - log and keep the original error
        console.error('abortTransaction failed', abortErr);
      }
      // fail closed - do not leak stack, pass to central handler
      if (!err.statusCode) err.statusCode = 500;
      throw err;
    } finally {
      // always free the session - leak here exhausts the pool
      session.endSession();
    }
  })
);

module.exports = router;
```

The third snippet shows the same route with `withTransaction`, which is shorter and retries transient conflicts automatically. You still stamp every operation, still throw `new AppError` for operational cases so `isOperational` stays true, and still end the session in finally. The function you pass to `withTransaction` is what gets retried, so keep it free of side effects like sending emails or charging cards. Do those outside the transaction.

```js
// routes/orders.helper.js - withTransaction shape with automatic retry
const express = require('express');
const mongoose = require('mongoose');

const AppError = require('../errors/AppError');
const Order = require('../models/Order');
const Product = require('../models/Product');

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const router = express.Router();

router.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const cartItems = req.body.items;

    const session = await mongoose.startSession();
    let createdOrder = null;

    try {
      await session.withTransaction(async () => {
        let total = 0;
        const orderProducts = [];

        for (const item of cartItems) {
          const product = await Product.findById(item.productId).session(session);

          if (!product) {
            throw new AppError('Product ' + item.productId + ' not found', 400);
          }
          if (product.quantity < item.quantity) {
            throw new AppError('Insufficient stock for ' + product.name, 409);
          }

          product.quantity -= item.quantity;
          await product.save({ session });

          total += product.price * item.quantity;
          orderProducts.push({ product: product._id, quantity: item.quantity });
        }

        const docs = await Order.create(
          [{ user: userId, products: orderProducts, total, status: 'confirmed' }],
          { session }
        );
        createdOrder = docs[0];
        // no explicit commit - withTransaction commits if this function returns cleanly
      });

      res.status(201).json({ data: createdOrder });
    } finally {
      // withTransaction already handled commit or abort, but the session still needs closing
      session.endSession();
    }
  })
);

module.exports = router;
```

A few things to notice across the snippets. The atomic `updateOne` with `{ $gte: qty }` plus `$inc` eliminates a separate read-then-write race for the single-product case. In the multi-product transaction, the `findById` plus `save` pattern is intentional for teaching the session flow. In a high-contention store you would replace the read-then-save with guarded `updateOne` calls inside the transaction as well. Every call that should be inside the boundary carries the session. A missing session means that write commits outside the escrow and survives an abort, which is exactly the midnight-reconciliation bug.

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you handle database transactions in Express with MongoDB and Mongoose?**

You use a Mongoose session. Inside the route you get a session with `await mongoose.startSession()`, call `session.startTransaction()`, then pass `{ session }` or `.session(session)` to every operation that must be atomic together. If everything works you `await session.commitTransaction()`, otherwise you `await session.abortTransaction()`. You always call `session.endSession()` in `finally` so the session is freed even when something throws. In current Mongoose you can also use `await session.withTransaction(async () => { ... })`, which starts the transaction, commits on clean return, aborts on throw, and retries transient conflicts automatically. The route itself is an async Express handler, so on Express 4 you wrap it with the standard `asyncHandler` that does `Promise.resolve(fn(req,res,next)).catch(next)` so any rejection that escapes the transaction still reaches your central error handler.

**Q: When should you use transactions versus a single-document atomic operation?**

Use a single-document atomic operation whenever the invariant lives inside one document. Mongo guarantees that one document's update with operators like `$inc`, `$set`, `$push` is all-or-nothing without any session. That is cheaper, faster, and holds no cross-document locks. Use a transaction only when two or more documents or collections must change together and a partial change would be wrong. If you are reaching for a transaction for a single document, check whether a different update shape or a better embedded schema removes the need. A good rule is to design documents so the most common consistent change fits in one document, and reserve transactions for the genuinely cross-document cases like order plus inventory.

**Q: How do you handle transactions with async/await correctly, especially around commit failures?**

Wrap the whole transaction in try/catch/finally and keep the commit inside the try. The shape is `const session = await mongoose.startSession(); try { session.startTransaction(); /* ops with session */ await session.commitTransaction(); } catch (err) { await session.abortTransaction(); throw err; } finally { session.endSession(); }`. The reason commit must be inside the try is that `commitTransaction` itself can throw, from a write conflict or a network blip. If it were outside the try, a commit failure would skip the abort and leave the transaction unresolved. With `withTransaction` the helper does this for you, including retry on transient errors, but you still end the session in finally. In either shape, every awaited operation that must be atomic carries the session.

**Q: How do you handle transactions that span multiple services?**

You do not stretch a MongoDB transaction across services. A MongoDB transaction lives inside one replica set and one database. Across services you switch patterns. The most practical is the saga pattern, where each service does its own local transaction and publishes an event. If a later step fails, you run a compensating action for each earlier step that already committed. For example, if inventory deduction succeeded but payment failed, the compensation restores the stock. You can also queue the work and retry until each step acknowledges. Two-phase commit across heterogeneous services exists but is heavy and couples availability, so most teams choose sagas or eventual consistency with idempotent consumers. In a MERN app the simpler win is to keep related consistent writes inside one service and one database so a native transaction covers them.

**Q: How do you test transactional code?**

You test three paths, not just the happy one, against a real MongoDB. Use `mongodb-memory-server` configured as a replica set so transactions are actually supported. First, the happy path: all operations succeed, commit runs, and you assert the order exists and stock decreased. Second, failure mid-transaction: make one product lookup or save throw, assert `abortTransaction` was called and that no order exists and no stock changed. Third, commit failure: mock `session.commitTransaction` to throw a transient error, assert abort runs and that a retry via `withTransaction` eventually succeeds or that your manual retry logic handles `TransientTransactionError` and `UnknownTransactionCommitResult` correctly. After each test, check counts: `expect(await Order.countDocuments()).toBe(0)` after an abort proves no partial data leaked. Tests that only check the happy path miss the exact bugs transactions exist to prevent.

**Q: Do I need a replica set just to use transactions locally?**

Yes. Even for a single write that you want in a transaction, the driver checks for a replica set. Start a single-node replica set in development or use `mongodb-memory-server` with `replSet` enabled in tests. A connection to a standalone `mongod` will reject `startSession` or `startTransaction` with an error about transactions requiring a replica set. That error is not a code bug in your handler. It is an environment mismatch.

**Q: What does a commit that fails mean? Is data half-written?**

No half state is visible. If `commitTransaction` throws, either the commit did not happen and the transaction is still open (so your abort discards it), or Mongo is unsure whether it committed and throws `UnknownTransactionCommitResult`. In both cases treat it as not confirmed, abort if possible, and retry the whole transaction from the top if it was a transient conflict. Never assume a commit throw means some documents made it and others did not. The transaction is still all-or-nothing.

## 6. The Traps — What Goes Wrong in Production

Forgetting the session on one operation. You pass `{ session }` to five calls and miss the sixth. That sixth call commits outside the transaction immediately. When you later abort, the five are rolled back but the one outside survives, leaving a dangling order or a stock deduction with no order. Review every call in the transaction for the stamp. A helper that takes the session once and threads it is safer than remembering it five times.

Putting commit outside the try. If `commitTransaction` is after the try block and it throws a write conflict, the catch that aborts never runs. The transaction sits open until it times out. That window holds locks and looks like a slow database in metrics. Keep commit inside the try so any commit failure lands in the catch that aborts.

Leaking the session by skipping finally. You call `session.endSession()` only after commit and forget the abort path. Every failed request leaks a session. Under load that exhausts the pool and new requests wait forever for a connection. The only safe home for `endSession` is `finally`. With `withTransaction` you still need the finally, because the helper handles commit and abort but not session cleanup.

Overusing transactions where a single atomic update would do. You wrap a single `updateOne` with `$inc` in a full session. That adds lock overhead, oplog work, and a round trip for no correctness gain. It also makes a fast path artificially slow under contention. Let single-document atomicity do its job and reserve sessions for genuinely multi-document invariants.

Holding a transaction open while doing slow work. You start the transaction, then call a payment API or run a big loop, then write. The transaction holds locks the whole time and blocks other checkouts touching the same products. The p95 stays flat until a burst hits and then it cliffs. Validate and call external services before `startTransaction`, then keep the transaction to just the database writes.

Running against a standalone in development and assuming it works. The code looks right, the route is wrapped, but every test says transactions not supported. The fix is not in the route. It is in the connection. Boot the dev database as a single-node replica set and configure the test helper to do the same. Otherwise you ship code that has never actually exercised the commit and abort paths.

Not handling transient conflicts. Two checkouts buy the last unit at the same instant. One commits, the other gets a write conflict. If you treat that conflict as a permanent 500, that user sees an error where a retry would have shown an honest out-of-stock after the first checkout committed. With `withTransaction` the driver retries automatically. With a manual shape you need to catch the transient label and retry the whole transaction a small number of times with backoff, then return a clean 409.

Doing non-idempotent side effects inside the retried transaction. You send a confirmation email or charge a card inside the `withTransaction` function. On a transient conflict that function runs twice, so the user gets two emails or two charges. Keep side effects outside the retried function. Do the database transaction first, then on confirmed commit run the side effect once, or make the side effect idempotent with a client-supplied idempotency key.

## 7. Compare With Related Concepts

**Multi-document transaction versus single-document atomic operation.** A single-document update is atomic without any session and visible immediately. It is the fastest path and the default. A transaction groups multiple documents and makes them visible together, but it costs a session, lock hold time, and a replica set requirement. Rule: if the invariant fits in one document, use an atomic update. If the invariant spans documents and partial success would corrupt meaning, use a transaction.

**Manual `startTransaction` plus try/catch/finally versus `withTransaction` helper.** Both guarantee all-or-nothing. The manual shape gives explicit control but you must remember that commit can throw, that abort can fail, and that transient errors deserve a retry. The helper hides that ceremony and retries transient conflicts automatically. Rule: prefer `withTransaction` for most routes. Reach for the manual shape only when you need custom retry policy or when you want to return different status codes based on which operation inside failed before deciding to abort.

**MongoDB transaction versus SQL transaction.** The promise is the same, all-or-nothing, and isolated writes, but the plumbing differs. In SQL the transaction is often tied to the connection and autocommit semantics. In MongoDB you create an explicit client session object and thread it to each operation, and isolation is provided via the replica set oplog and snapshot reads. Both hold locks, both dislike long duration, and both need retry handling for conflicts. Rule: do not carry SQL assumptions about implicit transactions into Mongoose. If you do not pass the session, you are not in the transaction.

**Native MongoDB transaction versus saga pattern across services.** A native transaction is one database, one replica set, synchronous, and all-or-nothing by the database itself. A saga is multiple services each owning its own local transaction, coordinated by events and undone by compensating actions when a later step fails. Native is simpler and stronger when the data lives together. Saga is what you need when the data lives apart. Rule: colocate data so native transactions cover the real invariant. Use sagas only when domain boundaries force distribution, and make each compensating action idempotent.

**Transaction versus optimistic concurrency with a version field.** Optimistic concurrency adds a `version` or `updatedAt` check and retries the single write if the version changed under you. A transaction locks the involved documents for the window and either commits all or none. Optimistic is lighter for low-contention single-document races. A transaction is clearer when the race involves multiple documents whose versions would all need checking. Rule: for one counter, atomic `$inc` or version check is enough. For a bundle of documents that must agree, a transaction states the intent directly.

## 8. 🧠 The Memory Hook

A MongoDB transaction is a closing at the title company. The session is your escrow officer, every stamped document is `{ session }`, and nothing hits the county recorder until `commitTransaction`. Forget the stamp on one document and it files outside escrow and survives the shred. One coffee needs no escrow at all. One house closing needs the whole table.
