# How Do You Implement Global Error Handling in Express?

## 1. The Real-World Problem — When You Actually Hit This

You ship an Express API. For a week everything looks fine. Then a frontend teammate reports that error responses are random: one endpoint returns `{ error: "User not found" }`, another returns an HTML stack trace, another returns nothing and the request just hangs. A mobile client starts crashing because it tried to parse an HTML error page as JSON. On call at 2am you see your logs are scattered — some routes log with `console.log`, some not at all, and one `await` inside a route that threw an exception killed the whole Node process because nobody caught it. The bug was not a missing try/catch. The bug was that you had no single place that owns errors.

Without a central handler every route invents its own error shape, sensitive details leak to clients, 404s get mixed with real failures, and a single unhandled async rejection can bring the service down. You need one place at the end of the line that catches everything, decides the status code, decides what the client is allowed to see, logs the full truth internally, and never crashes itself. That place is the global error handler.

## 2. The Analogy — Make the Mechanic Obvious

Think of your Express app as a long expressway with a line of toll plazas.

Each car is a request. Each plaza is a middleware or route handler, in the exact order you added them with `app.use` and `app.get`. A plaza can do its work and wave the car on with `next()`, or it can flag a problem by handing the car an orange breakdown slip and sending it down a special breakdown lane with `next(err)`.

At the very end of the expressway, after every normal plaza and every exit, there are two final booths. The first is the Exit Not Found booth. If a car drove the whole road and no plaza claimed it, that booth catches it and writes a slip that says 404 — no matching route. The second, last booth is the breakdown yard. It is the only booth with four orange cones out front. Regular booths have three cones. Express uses that cone count to know who is who: three parameters `(req, res, next)` means regular booth, four parameters `(err, req, res, next)` means breakdown yard. Only the four-cone yard can handle breakdown slips.

The yard does not fix the car. It reads the slip, translates the code on it into a response status, writes a full incident report for the internal log, and hands the driver a clean, safe slip. If the slip says 400 or 404 it hands back the specific message. If it says 500 or has no code, it hands back a generic "Something went wrong" so internal details do not leak. If the yard is configured for development, it staples the full stack trace to the internal report and optionally to the driver slip. In production it keeps the stack inside and never shows it.

Two details matter. If the car already received its final paperwork and left the gate (headers already sent), the yard cannot hand it a second slip — it has to wave it to the default highway patrol with `next(err)`. And the breakdown yard has to be last. Put it before the plazas and cars with breakdown slips have not reached it yet — it catches nothing.

Error classes are the standardized breakdown slips. Instead of scribbling random notes, every part of the app fills the same printed form: a message, a statusCode, and a checked box that says whether this was an expected operational problem like validation or a programmer bug. That box tells the yard how to respond.

## 3. The Full Explanation — How It Actually Works

Express is a linear stack. When a request arrives, Express walks the stack top to bottom. Each function either ends the response with `res.send` or `res.json`, or calls `next()` to go to the next function, or calls `next(err)` to jump straight to error handling.

Regular middleware has the signature `(req, res, next)`. Error-handling middleware has the signature `(err, req, res, next)`. Express detects which one you meant by counting parameters — its function arity. If you write `(err, req, res, next)` Express treats it as an error handler. If you write `(req, res, next)` or `(err, req, res)` by mistake, it will never be called for errors. This is why the handler must have exactly four parameters even if you do not use `next` inside it.

Placement is not a style preference, it is how the walk works. You register routes and normal middleware first, then the 404 catch-all, then the error handler as the very last `app.use`. A request that matches no route falls through all routes, hits the 404 handler, which creates an error and calls `next(error)`. A request that threw inside a route or called `next(err)` skips any remaining normal middleware and jumps to the first error handler after where the error occurred. If the error handler is above the routes, the jump has already passed it, so it is never reached.

The 404 catch-all is not an error handler. It is normal middleware with three parameters. Its job is to turn "no route matched" into an error object so the central handler can log and format it the same way as any other error. If the 404 handler sends a response directly with `res.status(404).json(...)`, you bypass central logging and formatting and now have two places that shape error responses. The cleaner pattern is to create an operational error with status 404 and call `next(err)` so everything flows through one pipeline. See the request lifecycle notes in [how Express middleware walks the stack](./how-does-express-middleware-work.md) and [what error-handling middleware is](./what-is-error-handling-middleware.md) — this page builds on them and does not re-teach the walk.

Operational errors versus programmer errors drive what you send. An operational error is something you expected could happen: bad input, unauthorized, not found, conflict, rate limited. A programmer error is a bug: a null reference, a failed assertion, a missing environment variable. You want a custom error class that carries a statusCode and a flag like `isOperational`. The error handler checks that flag. For operational errors it trusts the message and status and sends them. For programmer errors or any error without a status, it logs the full stack internally and sends a generic 500 with a safe message. Any security-related lookup that fails should fail closed — if you cannot decide whether an error is safe to expose, treat it as 500 and hide details.

Environment gating prevents leaks. In development you want the stack trace in the response to move fast. In production you must not send it. The handler reads `process.env.NODE_ENV` and only includes `err.stack` when not in production. The log, however, always gets the full error, the stack, the request method, url, and a correlation id like `req.requestId` so you can tie the client error back to the server log.

The `headersSent` guard prevents a crash inside the crash handler. If part of the response was already flushed — for example a route streamed some bytes and then threw — you cannot send a second status or JSON body. Node will throw "Cannot set headers after they are sent." The correct check is `if (res.headersSent) return next(err);` which delegates to the built-in Express default handler. Without it the error handler itself throws while handling an error, which can terminate the process.

Async errors are the classic Express 4 pitfall. In Express 4, if an async route handler returns a rejected promise and you do not catch it, Express does not route it to the error handler — it becomes an unhandled promise rejection. The fix is a tiny wrapper: `const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);` — every async route that awaits IO is wrapped with it, or you state that you are on Express 5 where rejections are routed automatically. Wrapping is cheap and explicit. Without it a single database timeout in one route can crash the whole process if your process has `unhandledRejection` set to terminate.

The error handler itself must be the most boring, reliable code in the service. It should not do database queries or call other services. It should log and respond. If you must do async logging, fire it without awaiting in a way that a logging failure cannot block the response. Wrap its own body in a try/catch as a last resort and fall back to a hard-coded `res.status(500).json({ error: "Internal server error" })` so the client always gets something. Keep the shape of success and error responses consistent so the frontend can rely on one contract — for example always `{ error: string, details?: unknown }` for errors and never sometimes HTML.

## 4. See It In Practice — Real Code or Queries

The examples below use Express 4. If you are on Express 5 you can drop the `asyncHandler` wrapper because Express 5 routes rejected promises to the error handler itself — the rest of the pattern stays the same.

A shared error class that carries a status and an operational flag. This file has no external imports — it only extends the built-in Error.

```js
// errors/AppError.js
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    // remove constructor from stack trace for cleaner logs
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = AppError;
```

A one-line wrapper that keeps async rejections from crashing the process. Any async handler that awaits IO must go through this in Express 4.

```js
// utils/asyncHandler.js
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
```

The 404 catch-all and the central error handler. Note the four parameters, the headersSent check, the env-gated stack, and the operational versus programmer split.

```js
// middleware/errorHandler.js
const AppError = require('../errors/AppError');

function notFoundHandler(req, res, next) {
  // turn "no route matched" into an operational error
  // so logging and shaping stays central
  next(new AppError('Not found', 404));
}

// central handler - arity 4 is how Express recognizes it
// eslint-disable-next-line no-unused-vars
function globalErrorHandler(err, req, res, next) {
  // if headers already flushed, delegate to Express default
  if (res.headersSent) {
    return next(err);
  }

  const status = err.statusCode || 500;
  const isOperational = err.isOperational === true;

  // always log the full truth internally
  // use your logger - console here for brevity
  console.error({
    message: err.message,
    stack: err.stack,
    status,
    method: req.method,
    url: req.originalUrl,
    requestId: req.requestId,
  });

  // fail closed on unknown errors - hide details in production
  const isProd = process.env.NODE_ENV === 'production';

  if (!isOperational || status === 500) {
    const body = { error: isProd ? 'Internal server error' : err.message };
    if (!isProd && err.stack) body.stack = err.stack;
    return res.status(500).json(body);
  }

  // operational error - safe to expose message
  const body = { error: err.message };
  if (!isProd && err.stack) body.stack = err.stack;
  return res.status(status).json(body);
}

module.exports = { notFoundHandler, globalErrorHandler };
```

Wiring it all together. Order is the contract: routes first, then 404, then error handler last.

```js
// app.js
const express = require('express');
const AppError = require('./errors/AppError');
const asyncHandler = require('./utils/asyncHandler');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(express.json());

// attach a request id early so the error handler can log it
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || Math.random().toString(36).slice(2);
  next();
});

app.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    // simulate IO that can fail
    const user = await findUserById(req.params.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    res.json({ data: user });
  })
);

app.post(
  '/users',
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      throw new AppError('Valid email is required', 400);
    }
    const created = await createUser({ email });
    res.status(201).json({ data: created });
  })
);

// synchronous throw is also caught by Express
app.get('/sync-crash', (req, res) => {
  throw new AppError('Something broke synchronously', 500);
});

// 404 catch-all - after all routes, before error handler
app.use(notFoundHandler);

// global error handler - very last, arity 4
app.use(globalErrorHandler);

async function findUserById(id) {
  // placeholder IO - replace with real DB call
  return null;
}

async function createUser(data) {
  // placeholder IO
  return { id: '1', ...data };
}

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => {
    console.log('listening on ' + port);
  });
}

module.exports = app;
```

What this gives you: every error — thrown synchronously, passed via `next(err)`, or rejected from an `asyncHandler`-wrapped route — lands in one place. That place logs fully, maps status, hides stacks in production, respects headersSent, and returns one consistent JSON shape. The frontend never has to guess whether an error is JSON or HTML.

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you implement global error handling in Express?**

You register a four-parameter middleware as the last `app.use` in the stack, after all routes and after a 404 catch-all. It looks like `app.use((err, req, res, next) => { ... })`. Inside you read `err.statusCode` or default to 500, log the full error with request context, and send a JSON response with a safe message. You check `res.headersSent` first and call `next(err)` if headers are already sent. In production you return a generic message and keep the stack only in logs. For async routes on Express 4 you wrap every handler that awaits IO with an `asyncHandler` that does `Promise.resolve(fn(req,res,next)).catch(next)` so rejections reach this handler. On Express 5 that wrapping is no longer required because rejections are routed automatically, but the handler itself is still last.

**Q: Why must the error handler have four parameters?**

Because that is how Express identifies it. Express looks at `function.length` — the declared parameter count. A function with four parameters is classified as an error handler and will only be called when `next(err)` was used or a sync throw happened. A function with three parameters is regular middleware and will be skipped during the error jump. If you forget `next` and write `(err, req, res)` the handler will never run for errors, and errors will fall through to the default Express handler which sends HTML.

**Q: What is the difference between a 404 handler and an error handler, and what order do they go in?**

The 404 handler catches requests that matched no route. It is regular three-parameter middleware. The error handler catches errors that happened while handling a matched route — via `next(err)` or throws. The order is routes, then 404 handler, then error handler. The 404 handler should not send a response directly. It should create an operational error like `new AppError('Not found', 404)` and call `next(err)` so the request flows into the central handler. That keeps logging, metrics, and the response shape in one place. If the 404 handler sends directly you have reproduced error formatting in two places and lost central observability.

**Q: How do you create a custom error class and why bother?**

You extend `Error` and add the data the handler needs to decide: `class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; this.isOperational = true; } }`. Always call `super(message)` first so the stack and message are set correctly, and optionally call `Error.captureStackTrace(this, this.constructor)` to keep the stack clean. You use it like `throw new AppError('User not found', 404)`. The value is consistency. Call sites say what went wrong and with what status, and the central handler decides how to render it. Without it every route sets status and shape differently and you leak internal messages on programmer bugs because you cannot tell an expected 404 from an unexpected null reference.

**Q: How do you handle errors in async route handlers?**

On Express 4, wrap every async handler that awaits IO with `asyncHandler`. The wrapper returns a function that executes your handler and forwards any rejected promise to `next`. Without it a rejected promise is not caught by Express and becomes an unhandled rejection that can crash the process. On Express 5 Express itself catches async rejections and forwards them, so the wrapper is not strictly needed, but stating which version you are on and showing you understand the difference is what interviewers look for. Never rely on a bare try/catch in each route as your only plan — it is easy to forget one route, and the wrapper makes the guarantee systematic.

**Q: How do you keep the error handler from crashing?**

You make it boring and defensive. Check `res.headersSent` before responding. Default the status with `err.statusCode || 500`. Never throw inside it. Never do database queries or HTTP calls inside it that could themselves fail — log and respond only. Wrap its body in a try/catch that falls back to a hard-coded 500 JSON response if anything unexpected happens. Log asynchronously or at least ensure a logging failure does not prevent sending the response. The error handler is the last lifeboat — if it sinks, the process sinks.

**Q: How do you avoid leaking stack traces or internal details?**

You gate by environment. Inside the handler you check `process.env.NODE_ENV === 'production'`. In production, for any non-operational error or any 500, you send `{ error: 'Internal server error' }` and keep `err.stack` only in the server log. In development you can include `err.stack` in the JSON to move fast. For operational errors like 400 or 404 where the message is safe by construction, you can send the specific `err.message` even in production because it was written to be user-facing.

## 6. The Traps — What Goes Wrong in Production

Putting the error handler before routes. This is the most common mistake in take-home reviews. The handler is registered at the top because "global should be first" feels right. Express walks top to bottom, so a request that throws inside a route below the handler has already passed the handler — the jump forward finds nothing and the error reaches the default HTML handler. Fix: routes first, 404 next, error handler very last.

Forgetting to wrap async handlers on Express 4. One `app.get('/users', async (req, res) => { await db.query(...) })` without `asyncHandler` looks fine in a demo with a happy database. The first real timeout rejects the promise, Express 4 does not forward it, Node emits `unhandledRejection`, and if your process is configured to crash on unhandled rejections your whole service goes down from one request. Fix: wrap every async handler that awaits IO, or explicitly state you are on Express 5 where this is handled.

Having the 404 handler send directly instead of calling `next(err)`. You write `app.use((req, res) => res.status(404).json({ error: 'Not found' }))` and it works. Later you add structured logging, a correlation id, and metrics to the error handler, and 404s never appear in them because they never went through the handler. Fix: `app.use((req, res, next) => next(new AppError('Not found', 404)))` and let the central handler shape the response.

Leaking stack traces in production. You return `res.status(500).json({ error: err.message, stack: err.stack })` because it helped during development and you forgot to gate it. Clients and attackers now see file paths, query fragments, and library internals. Fix: `if (process.env.NODE_ENV !== 'production')` include the stack, otherwise omit it.

Trying to send a second response after headers were sent. A route streams part of a file, then throws. The error handler calls `res.status(500).json(...)` without checking `res.headersSent` and Node throws "Cannot set headers after they are sent" — now you have an error inside the error handler. Fix: `if (res.headersSent) return next(err);` at the top of the handler.

Doing real work inside the error handler. You add a database write to count errors or a call to a notification service inside the handler. That IO fails, throws, and you have no handler for the handler. Keep the error handler to log and respond. Put side effects like metrics increments behind fire-and-forget that cannot throw, or push them to a queue from the route layer before the error is created.

Breaking the Error chain in a custom class. You forget `super(message)` or you set `this.message` without calling super, so `err.stack` is missing and `instanceof Error` is false and your logger prints an empty object. Fix: always call `super(message)` first and set properties after.

Using inconsistent error shapes. One route returns `{ error: '...' }`, another returns `{ message: '...' }`, another returns `{ errors: [...] }`, and the frontend has to branch on all three. The error handler exists to make this consistent. Fix: decide one shape — for example always `{ error: string, details?: unknown }` — and enforce it only in the central handler.

## 7. Compare With Related Concepts

**Global error handler versus 404 handler.** The 404 handler answers "no route matched this request." The error handler answers "a matched route failed while handling the request." One is a normal three-parameter middleware that creates an error, the other is a four-parameter middleware that renders it. Use both, in that order, and let the 404 flow into the error handler so formatting stays central. Also see [global versus route-level error handling](./what-is-error-handling-middleware.md) for the base definition.

**Global error handler versus try/catch in every route.** Per-route try/catch works but is repetitive and easy to miss. The global handler is the safety net, try/catch is a local decision. Use the global handler as the guarantee and the `asyncHandler` wrapper as the systematic bridge for async routes. Reserve explicit try/catch in a route for when you need to translate a specific low-level error into an `AppError` with a different status before it reaches the center.

**Global error handler versus process-level `unhandledRejection` and `uncaughtException`.** The global handler catches request-scoped errors that Express knows about. Process-level handlers catch things that escaped Express entirely — a promise nobody awaited, a throw outside any request. You need both. The global handler shapes the HTTP response. The process handlers log and decide whether to gracefully shut down the process. Never use a process handler to try to send an HTTP response — there is no `res` there.

**Express 4 with asyncHandler versus Express 5 native async handling.** On Express 4 you must wrap async handlers that await IO or rejections are not routed to the error handler. On Express 5 Express does the routing for you and the wrapper is redundant. Choose based on the version you actually run and say which you are on in the interview. The wrapper is harmless on Express 5 but stating the reason you have it shows you understand the lifecycle.

**Central error handler versus validation middleware errors.** Validation middleware like a schema check should not send its own response either. It should create an `AppError` with status 400 and call `next(err)` so the central handler formats the validation failure the same way as any other 400. The rule is simple: only the central handler calls `res.status(...).json(...)` for errors.

## 8. 🧠 The Memory Hook

Your Express app is an expressway. The breakdown yard sits after every exit and every plaza and is marked by four cones. Regular slips come from the Exit Not Found booth, breakdown slips come from the plazas, and every slip gets read in one last yard that logs the full truth and hands the driver only what is safe to see. Four cones, very last, one shape.
