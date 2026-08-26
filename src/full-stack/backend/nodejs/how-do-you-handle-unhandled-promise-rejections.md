# How do you handle unhandled promise rejections

## 1. Why This Exists — The Problem First

Your Express route handler is `async` — someone forgets `try/catch`, the database call rejects, and the error silently vanishes. In Node.js 14, you get a warning in the logs. In Node.js 18 (your production runtime), the process crashes. PM2 restarts it, but three seconds of downtime per crash adds up when a background job fires every minute with a missing `.catch()`.

Async/await made Node.js code readable, but it also made a whole class of errors invisible — rejected promises that nobody catches. They're the most common cause of mysterious production crashes in modern Node.js services.

## 2. The Analogy — Make It Obvious

You toss a ball to a teammate and walk away without watching.

If they catch it, fine. If they drop it and nobody notices, the ball rolls into traffic. An unhandled promise rejection is the dropped ball — the `reject()` happened, but no `.catch()` or `try/catch` was waiting.

The global `unhandledRejection` handler is the coach on the sideline who yells "someone dropped the ball!" But the real fix isn't a louder coach — it's teaching every player to catch at the point of the throw. Handle rejections where the promise is created, not just at the process level.

## 3. How It Actually Works — The Full Explanation

A promise rejection becomes "unhandled" when:

1. A promise rejects
2. No `.catch()` is attached
3. No `await` is wrapped in `try/catch`
4. Node's microtask queue drains without any handler registered

Node.js emits `unhandledRejection` on `process`:

```javascript
process.on('unhandledRejection', (reason, promise) => { ... });
```

**Node.js version behavior (critical for production):**

| Version | Behavior |
|---|---|
| < 15 | Warning logged, process continues |
| 15+ | Terminates process by default (same as uncaught exception) |

You can override with `--unhandled-rejections=warn` or `strict`, but the default in modern Node is crash — treat unhandled rejections as fatal.

**Three layers of defense:**

1. **Source handling (primary)** — catch where the async work happens
   - `try/catch` around `await`
   - `.catch()` on promise chains
   - Express `asyncHandler` wrapper that calls `next(err)`

2. **Framework middleware (secondary)** — Express error-handling middleware catches errors passed to `next(err)`

3. **Global safety net (last resort)** — `process.on('unhandledRejection')` logs, reports, and triggers graceful shutdown

The global handler is a smoke alarm, not a substitute for wiring catch blocks. If it fires in production, you have a bug to fix — not a feature working as designed.

Common sources of unhandled rejections:

- `async` route handlers without error wrapper (Express 4 doesn't catch async throws automatically)
- `async` event listeners — `emitter.on('event', async () => { ... })` — errors don't propagate to the emitter
- Fire-and-forget promises — `doSomethingAsync()` without `await` or `.catch()`
- `Promise.all()` where one rejection rejects the entire batch without a surrounding catch

## 4. Real Code — See It Working

**The bug — unhandled rejection in an async route**

```javascript
// BAD: Express 4 does not catch rejected promises from async handlers
app.get('/api/orders/:id', async (req, res) => {
  const order = await db.orders.findById(req.params.id); // rejects if not found logic throws
  res.json(order);
});
```

**Fix 1 — asyncHandler wrapper**

```javascript
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.get('/api/orders/:id', asyncHandler(async (req, res) => {
  const order = await db.orders.findById(req.params.id);
  if (!order) throw new NotFoundError('Order not found');
  res.json(order);
}));

app.use((err, req, res, next) => {
  logger.error({ err, method: req.method, path: req.path });
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal Server Error' });
});
```

**Fix 2 — try/catch in the handler**

```javascript
app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await db.orders.findById(req.params.id);
    res.json(order);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
```

**Global safety net — log, report, shutdown**

```javascript
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production: log, send to Sentry, trigger graceful shutdown
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdown('uncaughtException');
});
```

**Async event listener — wrap in try/catch**

```javascript
// BAD
eventBus.on('order.created', async (order) => {
  await sendConfirmationEmail(order); // rejection is unhandled
});

// GOOD
eventBus.on('order.created', async (order) => {
  try {
    await sendConfirmationEmail(order);
  } catch (err) {
    logger.error({ err, orderId: order.id });
    await deadLetterQueue.add({ order, err });
  }
});
```

**Promise.all vs Promise.allSettled**

```javascript
// BAD: one failure rejects everything, and if no outer catch → unhandled
const results = await Promise.all(users.map((u) => sendEmail(u)));

// GOOD: collect successes and failures separately
const results = await Promise.allSettled(users.map((u) => sendEmail(u)));
const failed = results.filter((r) => r.status === 'rejected');
if (failed.length) logger.warn({ failedCount: failed.length });
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What happens to unhandled promise rejections in modern Node.js?**

Node.js 15+ terminates the process by default — same severity as an uncaught exception. Earlier versions only logged a warning. Production services on Node 18/20 must treat unhandled rejections as fatal.

**Q: How do you handle them properly?**

Handle at the source: `try/catch` around `await`, `.catch()` on chains, `asyncHandler` wrapper for Express routes. Add a global `unhandledRejection` handler as a safety net that logs, reports, and triggers graceful shutdown. When the global handler fires, fix the root cause.

**Q: Why doesn't Express catch errors from async route handlers?**

Express 4 middleware is synchronous — it doesn't `await` your handler. An `async` function returns a promise; if that promise rejects, Express never sees it unless you explicitly forward the error with `next(err)` or an `asyncHandler` wrapper. Express 5 improves this, but most production apps still use Express 4.

**Q: What's wrong with `.catch(() => {})`?**

It silently swallows errors — no log, no metric, no alert. The rejection is "handled" so the process doesn't crash, but the bug is invisible. Always log or re-throw in catch blocks.

**Q: How do async event listeners cause unhandled rejections?**

Event emitters don't await async listeners. The listener returns a promise that nobody attaches `.catch()` to. Wrap the body in `try/catch` or attach `.catch()` to the returned promise.

**Q: What's the difference between unhandledRejection and uncaughtException?**

`unhandledRejection` — a promise rejected with no handler. `uncaughtException` — a synchronous throw with no try/catch. Both are fatal in modern Node. Prevention strategy differs: promises need `.catch()`/`try-catch`; sync code needs try/catch or route-level wrappers.

## 6. The Traps — What Goes Wrong

**Fire-and-forget async calls.**

```javascript
function processOrder(order) {
  sendReceipt(order); // returns a promise nobody catches
  return { status: 'accepted' };
}
```

Fix: `await sendReceipt(order)` or `sendReceipt(order).catch(logger.error)`.

**Empty catch blocks.**

```javascript
fetchData().catch(() => {}); // silent failure
```

**Assuming Express handles async errors.** It doesn't in Express 4 without a wrapper. This is the #1 source of unhandled rejections in Node APIs.

**Top-level await without try/catch in scripts.** A rejected `await` at module top level in a worker or script file crashes the process immediately.

**Promise.all without outer catch.** One failed email in a batch of 1,000 rejects the whole operation. Use `Promise.allSettled` when partial success is acceptable.

**Relying only on the global handler.** Catching at the process level and continuing (pre-Node-15 style) hid bugs. Modern Node crashes anyway — fix the source.

## 7. Compare With Related Concepts

**Unhandled rejections vs Express error middleware.** Error middleware handles errors you deliberately forward with `next(err)`. Unhandled rejections are errors that never reach middleware. The `asyncHandler` wrapper bridges the gap.

**Unhandled rejections vs uncaught exceptions.** Sync vs async error paths. Both fatal in Node 15+. Register handlers for both; prevent both with proper route-level handling.

**`.catch()` vs `try/catch`.** Functionally equivalent for async/await code. `try/catch` reads better for sequential logic with multiple awaits. `.catch()` fits promise chains.

**Global handler vs linting rules.** ESLint `no-floating-promises` and `@typescript-eslint/no-misused-promises` catch unhandled rejections at build time. Combine linting (prevention) with global handler (safety net).

## 8. 🧠 The Memory Hook — What Sticks

Every `await` needs a net — either `try/catch` around it or an `asyncHandler` that calls `next(err)`. The global `unhandledRejection` handler is the smoke alarm; if it goes off in production, you fix the code that dropped the ball, not the alarm.
