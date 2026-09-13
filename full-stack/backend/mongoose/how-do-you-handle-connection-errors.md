# How do you handle connection errors

## 1. The Real-World Problem — When You Actually Hit This

Your app deployed successfully. Users are signing up, orders are being placed, everything looks great. Then at 3 AM on a Saturday, the MongoDB instance restarts for maintenance. Your Node.js server didn't get the memo. Every incoming request now tries to query a database connection that's dead. Users see 500 errors. Your logs fill with "MongoNetworkError" and "Topology destroyed." The connection pool isn't reconnecting. Your server keeps accepting requests it can't fulfill. By the time you wake up, you've lost hours of traffic and customer trust.

This is what happens when you don't handle connection errors properly in Mongoose. The default behavior isn't enough for production — you need explicit error handling, reconnection logic, and graceful degradation.

## 2. The Analogy — Make the Mechanic Obvious

Think of your database connection like a phone call to a customer support line. If the line drops mid-call, you don't just sit there with a dead phone — you redial. But you also don't redial infinitely without telling anyone what's happening. You:

1. Notice the call dropped (detect the error)
2. Tell the customer "hold on, the line dropped, let me call back" (log/monitor)
3. Redial automatically (reconnection logic)
4. If redialing fails repeatedly, stop trying and tell the customer to call back later (circuit breaker)

Mongoose connection errors work the same way. You need to detect when the connection breaks, attempt to reconnect, handle reconnection failures, and decide when to stop trying so your server doesn't hang forever.

## 3. The Full Explanation — How It Actually Works

Mongoose manages connections to MongoDB through a connection pool. When you call `mongoose.connect()`, it establishes a TCP connection to MongoDB and maintains a pool of sockets that your application reuses for queries. This is efficient — you don't want to open a new connection for every single request.

But connections fail. MongoDB can restart. Network can glitch. Credentials can expire. The connection pool can become exhausted. When any of this happens, Mongoose emits connection error events that you can listen to.

Here's what actually happens under the hood:

**Initial connection:** When you call `mongoose.connect(uri)`, Mongoose attempts to establish a connection. If it fails immediately (wrong URI, network down, auth failure), the promise rejects and you get an error in your `.catch()` handler.

**Runtime connection loss:** After a successful connection, if MongoDB restarts or the network drops, the existing connection becomes invalid. Mongoose attempts to reconnect automatically by default — it keeps trying indefinitely. This sounds helpful, but it can be dangerous if the database is permanently gone.

**Connection events:** Mongoose emits several events you should listen to:
- `connected`: Successfully connected
- `disconnected`: Lost connection (trying to reconnect)
- `error`: Connection error occurred
- `reconnected`: Successfully reconnected after a disconnect

**The critical gap:** Most developers only handle the initial connection error with `.catch()`. They don't set up event listeners for runtime disconnections. So when MongoDB restarts at 3 AM, the server doesn't know anything is wrong until a query actually fails — and even then, it might not handle that gracefully.

**Graceful degradation:** In production, you want your server to detect connection problems early and either:
- Reject new requests with a 503 (service unavailable) while reconnecting
- Queue requests and retry them when the connection returns
- Switch to a read-only cache mode if you can't write to the database

The exact strategy depends on your application, but the point is: you must have a strategy, not just hope reconnection works.

## 4. See It In Practice — Real Code or Queries

Here's a complete Mongoose connection setup with proper error handling:

```javascript
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;

// Set up event listeners BEFORE connecting
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
  // In production, you might send this to your monitoring service
  // and trigger an alert
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
  // You might want to set a flag that your routes check
  // to return 503 instead of 500
});

// Reconnection handling
mongoose.connection.on('reconnected', () => {
  console.log('Mongoose reconnected to MongoDB');
});

// Attempt initial connection
mongoose.connect(uri, {
  // These options help with connection stability
  serverSelectionTimeoutMS: 5000, // Stop trying after 5 seconds
  maxPoolSize: 50, // Maintain up to 50 socket connections
  minPoolSize: 10, // Keep at least 10 connections ready
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  family: 4 // Use IPv4, skip trying IPv6
})
  .then(() => {
    console.log('Initial connection successful');
  })
  .catch((err) => {
    console.error('Initial connection failed:', err);
    // This is where you might exit the process if you can't start
    // without the database, or switch to a degraded mode
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('Mongoose connection closed through app termination');
  process.exit(0);
});
```

For Express route handling with connection awareness:

```javascript
const express = require('express');
const app = express();

// Middleware to check connection status
app.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Database connection issue'
    });
  }
  next();
});

// Your routes
app.get('/users', async (req, res, next) => {
  try {
    const users = await User.find({});
    res.json(users);
  } catch (err) {
    // Distinguish between connection errors and query errors
    if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
      return res.status(503).json({
        error: 'Database unavailable'
      });
    }
    next(err);
  }
});
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What happens if MongoDB goes down while your Node.js server is running?**

By default, Mongoose will attempt to reconnect automatically and indefinitely. Your server won't crash, but any queries attempted during the disconnection will fail with network errors. The problem is that your application keeps accepting requests it can't fulfill, leading to a poor user experience. You should listen for the `disconnected` event and either return 503 errors or implement a retry strategy.

**Q: How do you distinguish between initial connection failures and runtime disconnections?**

Initial connection failures are caught by the `.catch()` handler on `mongoose.connect()`. These happen immediately when you try to connect — wrong URI, network down, authentication failure. Runtime disconnections happen after a successful connection and are caught by event listeners: `disconnected`, `error`, and `reconnected`. You need both: the promise catch for startup failures, and event listeners for runtime issues.

**Q: Should you crash your process if the database connection fails?**

It depends on your application. If your app cannot function at all without the database (no cache, no fallback), then yes — crashing and letting your process manager restart it is reasonable. If your app has degraded functionality (read-only mode, cached responses), you might stay alive but limit functionality. The key is making an intentional decision rather than letting requests fail silently.

**Q: What's the difference between `connected` and `reconnected` events?**

`connected` fires when the initial connection succeeds. `reconnected` fires when Mongoose successfully reconnects after a disconnection. This distinction matters for monitoring — frequent reconnection events might indicate an unstable network or database configuration issue that you should investigate.

**Q: How do you handle connection errors in serverless environments like AWS Lambda?**

In serverless, connections don't persist between invocations. You should connect once per invocation and close the connection before the handler returns. But to avoid the overhead of connecting every time, you can reuse connections across warm invocations by checking if `mongoose.connection.readyState` is already connected before calling `connect()`. Also, set shorter connection timeouts since serverless functions have strict execution time limits.

## 6. The Traps — What Goes Wrong in Production

**Trap: Only handling the initial connection error**

You write `.catch()` after `mongoose.connect()` and think you're done. But that only catches startup failures. When MongoDB restarts at 3 AM, your server doesn't know — it only discovers the problem when a query fails, and even then it might return a generic 500 instead of a meaningful 503. Always set up event listeners for `disconnected`, `error`, and `reconnected`.

**Trap: Letting Mongoose reconnect indefinitely**

By default, Mongoose tries to reconnect forever. If your database is permanently gone (wrong URI after deployment, deleted instance), your server hangs indefinitely trying to reconnect. Set `serverSelectionTimeoutMS` to a reasonable value and handle the case where reconnection fails — either exit the process or switch to a degraded mode.

**Trap: Not distinguishing connection errors from query errors**

All your errors go to a generic error handler that returns 500. But a connection error is different from a validation error or a "not found" error. Connection errors should return 503 (service unavailable) so clients know to retry later. Query errors should return 400 or 404. Check the error name — `MongoNetworkError`, `MongoTimeoutError`, and `MongoServerSelectionError` are connection issues.

**Trap: Forgetting to close connections on shutdown**

When your container or process is terminated, connections aren't closed gracefully. This can cause issues in production where you have many containers scaling up and down — the database might run out of available connections. Always listen for `SIGINT` and `SIGTERM` and call `mongoose.connection.close()` before exiting.

**Trap: Not monitoring connection state in your routes**

Your routes assume the database is connected. When it's not, queries fail with confusing errors. Add middleware that checks `mongoose.connection.readyState` and returns 503 if the connection isn't healthy. This gives users a clear error message instead of a cryptic database error.

## 7. Compare With Related Concepts

**Connection errors vs Query errors**

Connection errors mean your application can't reach the database at all — network down, MongoDB down, wrong credentials. Query errors mean the connection is fine but your operation failed — validation error, duplicate key, document not found. Connection errors should trigger reconnection logic and return 503. Query errors should be handled based on the specific error type and return appropriate 4xx codes.

**Connection errors vs Transaction errors**

Connection errors happen at the TCP/transport layer — the database isn't reachable. Transaction errors happen at the application layer — the connection is fine, but the transaction failed (conflict, timeout, constraint violation). You handle connection errors by reconnecting. You handle transaction errors by retrying the transaction or aborting it.

**Mongoose connection handling vs Native MongoDB driver**

Mongoose wraps the native MongoDB driver and adds its own connection management. The native driver gives you more direct control but requires more manual setup. Mongoose's automatic reconnection is convenient but can mask issues if you don't set up proper event listeners. With the native driver, you have to implement reconnection logic yourself, which means you're more likely to think about the failure modes.

**Connection errors vs Connection pool exhaustion**

Connection errors mean you can't reach the database. Connection pool exhaustion means you reached the maximum number of open connections, and new requests are waiting for a connection to become available. Pool exhaustion often indicates a connection leak — you're opening connections but not closing them, or your queries are taking too long. The fix is different: tune pool size, fix slow queries, or ensure connections are properly released.

## 8. 🧠 The Memory Hook

**Connection errors = phone dropped = redial with limits, or tell the customer to call back.**

Don't just let it ring forever. Detect the drop, log it, retry smartly, and know when to stop trying.
