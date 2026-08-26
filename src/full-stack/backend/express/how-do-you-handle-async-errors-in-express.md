# How do you handle async errors in Express

## 1. The Real-World Problem — When You Actually Hit This

Your checkout endpoint has been live for months. Quiet, boring, reliable. Then one afternoon the database replica takes ten seconds to fail over, `Order.findById` rejects for a couple of requests... and the entire Node process dies. Not just those requests — the process. Every user mid-request gets a connection reset, your restart manager boots a fresh process into cold caches, and for a minute everything is slow. The log says `UnhandledPromiseRejectionError`. Nothing in your route ever mentioned a try/catch.

Or the quieter version: a database call fails, your code never calls `res.json` and never calls `next(err)`, and that one request just... hangs. The user stares at a spinner until the browser gives up. No error in the logs. Nothing.

Both failures share one root cause: in Express 4, an async operation that fails does **not** automatically reach your error handling. Somebody has to physically carry the bad news. This page is about who carries it, and how.

## 2. The Analogy — Make the Mechanic Obvious

Think of your Express server as a restaurant.

The route handler is a waiter. He takes your order to the kitchen and — this is the key part — he leaves. He goes back to serving other tables. That is exactly what an `async` function does: it returns immediately with a pending promise ("your order's in"), and the real work finishes later.

The kitchen is your database or any external service. Separate, slow, and able to fail on its own schedule.

The head chef standing right at the counter is a synchronous `try/catch`. If the kitchen explodes *while the waiter is standing there*, the chef sees it instantly. That's why Express catches plain synchronous `throw`s just fine — the throw happens during the handler's execution, inside Express's watch window.

The manager's office at the back is your error-handling middleware. It's the one place authorized to decide what the customer hears (the 500 response). Any staff member can walk a problem there — that walk is `next(err)`.

Here's the gap: in Express 4, once the waiter has left and the kitchen burns down *afterwards*, nobody's job is to carry that news to the manager. The promise rejects and nobody is listening. Depending on your Node version, that unheard alarm either rots the request silently (a hung socket) or burns down the whole building (a process crash).

Express 5 wires a buzzer from every kitchen station straight to the manager's office. A rejected promise rings the error handler automatically. Nobody has to remember to walk anywhere.

## 3. The Full Explanation — How It Actually Works

Follow one request through Express 4 and you'll see exactly where errors fall through.

When a request matches a route, Express calls your handler wrapped in its own synchronous `try/catch`. If your handler `throw`s directly — synchronously — Express catches it and calls `next(err)` for you. Solid.

But an `async` handler doesn't behave that way. The moment it hits its first `await`, it pauses, hands back a pending promise, and returns to Express. From Express's point of view your handler "finished" instantly with no error, and its try/catch exits cleanly. Ten milliseconds later the database rejects, the promise settles as rejected, and Express 4 has kept no connection to that promise — it never looked at the return value. Now it's a rejected promise with zero listeners: an **unhandled promise rejection**. On Node v15 and newer, that kills the process by default.

So the rule in Express 4 is brutal and simple: every async code path must personally deliver its outcome. Success reaches `res.send(...)` or `next()`. Failure reaches `next(err)`. If a path delivers neither, the socket stays open and the request hangs. If a rejection is delivered to nobody, the process dies. There is no third option where Express rescues you.

Three standard ways to make sure delivery happens:

**Manual try/catch.** Wrap the awaited work; in the catch block, call `next(err)`. Explicit and bulletproof, but you repeat it in every route.

**A wrapper function (the `asyncHandler` pattern).** A tiny higher-order function that takes your async handler and returns a normal-looking handler whose whole job is: call yours, take the returned promise, attach `.catch(next)`. Now a rejection reaches `next` mechanically, even if you forget. Using `Promise.resolve(...)` inside the wrapper also converts a synchronous `throw` into a rejection, so both failure styles funnel down the same channel.

**An npm package.** `express-async-handler` is exactly that wrapper, maintained and importable. Same mechanic, zero code of your own.

Whoever receives the error needs to exist. Error-handling middleware is a function with **four** parameters — `(err, req, res, next)`. Express identifies it purely by that arity, and it only runs if registered **after** the routes that can produce errors, because Express walks middleware strictly in registration order. If you register none, Express falls back to its built-in default handler: a 500 that prints the full stack trace in development and hides it in production.

Two edge behaviors worth knowing cold. First, if the error arrives after headers were already sent (say, mid-stream), Express can't send a fresh response, so the default handler destroys the socket — the client sees a truncated connection, which is the only honest option, since inventing a second response is impossible. Second, calling `next()` after `next(err)` doesn't "continue normally": once you delegate an error, that handler's turn is over, and pushing further risks writing a second body to an already-answered request (`ERR_HTTP_HEADERS_SENT`).

And Express 5? It closed the gap at the framework level. When a handler or middleware returns a promise, Express 5 attaches its own rejection listener and forwards any rejection to `next(err)` on your behalf. Your existing try/catch blocks and wrappers still work — they're just no longer load-bearing. Express 5 went stable in late 2024 and became what `npm install express` gives you by default in 2025, so on new projects this entire class of bug disappears at the source.

## 4. See It In Practice — Real Code or Queries

**The bug — what ships when nobody knows this topic:**

```js
app.get('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id); // if this rejects...
  res.json(user);
});
// ...nothing in Express 4 is listening. Unhandled rejection → process exits.
```

**Prove the mechanism to yourself — Express 4's actual watch window, distilled. Run it with plain `node`:**

```js
function pretendExpress(handler) {
  try {
    handler({}, {}, () => {}); // Express calls your handler inside a try/catch
  } catch (err) {
    console.log('Express saw:', err.message);
  }
}

pretendExpress(() => { throw new Error('sync boom'); });
// caught: "Express saw: sync boom"

pretendExpress(async () => { throw new Error('async boom'); });
// NOT caught — the async function returned a pending promise first,
// so the try/catch completed before the rejection happened.
// The rejection lands with no listener: on modern Node, the process exits.
```

**Fix 1 — manual try/catch with `next(err)`:**

```js
app.get('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      const err = new Error('User not found');
      err.status = 404;
      return next(err); // a missing row is a business failure, not a 500
    }
    res.json(user);
  } catch (err) {
    next(err); // hand the raw failure to the error middleware below
  }
});

// Registered LAST — after every route it should cover.
// Four parameters is what makes Express treat this as the error handler.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});
```

**Fix 2 — the `asyncHandler` wrapper (write it once, every route benefits):**

```js
// asyncHandler.js
const asyncHandler = (fn) => (req, res, next) =>
  // Promise.resolve also converts a sync throw into a rejection,
  // so BOTH failure styles end up at the same .catch(next)
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
```

```js
const asyncHandler = require('./asyncHandler');

app.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err; // the wrapper converts this into next(err) for you
  }
  res.json(user);
}));
```

**Async middleware follows the identical law:**

```js
const authMiddleware = async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) {
      const err = new Error('Missing token');
      err.status = 401;
      return next(err);
    }
    req.user = await verifyToken(token); // async work — same rules as routes
    next();
  } catch (err) {
    err.status = 401;
    next(err);
  }
};

app.use(authMiddleware);
// or identically: app.use(asyncHandler(authMiddleware));
```

**Express 5 — the same "buggy-looking" route from earlier, now safe:**

```js
app.get('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  res.json(user); // a rejection here auto-forwards to your error middleware
});
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you handle async errors in Express?**

In Express 4, three ways, all built on the same delivery idea — get the failure to `next(err)`. Wrap awaits in try/catch yourself, wrap the whole handler in an `asyncHandler` utility that attaches `.catch(next)`, or import `express-async-handler`, which is that same wrapper prebuilt. Then register a four-argument error middleware after your routes to turn those errors into real responses. In Express 5, rejected promises flow to the error middleware automatically, so the manual patterns become optional. What interviewers really want to hear is *why* the wrapper exists: Express 4's try/catch only spans the synchronous instant of the handler call, so anything after the first `await` is your responsibility.

**Q: Why doesn't Express 4 catch async errors automatically?**

Timing. Express 4 calls your handler inside a synchronous `try/catch`. An `async` function returns a pending promise the moment it hits its first `await` — long before any failure occurs. By the time the promise rejects, that try/catch has finished successfully, and Express 4 never inspects the handler's return value, so it never attaches anything to the promise. The rejection happens with no listener: an unhandled promise rejection. It's not negligence, it's archaeology — Express 4 predates mainstream async/await and was designed around callbacks, where errors arrive as a first argument you're expected to forward.

**Q: What actually happens when an async route rejects in Express 4 today?**

On Node v15 and newer, an unhandled promise rejection terminates the process by default. So one failed database query doesn't fail one request — it kills every in-flight request on the server, and your process manager restarts into cold caches and fresh connection pools. On older Node it was merely a warning, which meant silent rot instead. Neither is acceptable, which is why wrapper discipline is non-negotiable on Express 4.

**Q: Write the asyncHandler wrapper. Why `Promise.resolve`?**

It's three lines: take `fn`, return `(req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)`. The reasoning for `Promise.resolve`: if `fn` is `async`, calling it already produces a promise, and `.catch(next)` alone would do. But if someone passes a non-async function that throws synchronously, `fn(...)` throws before `.catch` could ever attach. Wrapping the call in `Promise.resolve` guarantees one uniform channel — every failure style becomes a rejection and lands on `next`. It makes the wrapper safe even if the caller invokes it somewhere without Express's own synchronous guard.

**Q: How do you handle async errors in middleware, not routes?**

Same law, word for word — every async code path ends at `next()` or `next(err)`, never neither. Auth middleware is the classic case: `await verifyToken(token)` inside try/catch, stamp a 401 onto the error, `next(err)`. Or skip the ceremony: `app.use(asyncHandler(middleware))`. One extra caution lives here — after you've called `next(err)`, stop. Don't fall through to another `next()`. You've handed the wheel to the error handler, and continuing risks a second response on an already-answered request.

**Q: Where must error-handling middleware go, and what marks it as special?**

Registration order and arity. It takes four parameters — `(err, req, res, next)` — and that signature is the *only* thing distinguishing it from normal middleware; a three-argument function is never an error handler no matter what it contains. It must be registered after the routes whose errors it should catch, because Express executes middleware strictly in registration order — an error handler placed before a route never sees that route's failures. Register nothing and you get Express's built-in default: stack traces in development, opaque status lines in production.

**Q: What changes in Express 5?**

Express 5 checks whether your middleware or handler returned a promise, and if so, attaches its own rejection handler that calls `next(err)` for you. Rejected promises reach error middleware natively — no wrappers, no per-route try/catch. It's backward compatible: existing patterns still work, they're just redundant for async code. Express 5 went stable in late 2024 and became npm's default in 2025, so on greenfield projects the answer shifts from "here's my wrapper discipline" to "the framework forwards rejections; I still owe you well-designed error middleware and sensible status codes." Knowing both eras is the senior signal — plenty of production systems still run Express 4.

**Q: A request hangs forever with no error in the logs. What do you suspect?**

A code path that delivered neither a response nor `next()`. Classic shapes: a callback-style call where you checked the data but ignored the `err` argument; a conditional branch that returns without responding; or a forgotten `await`, where the promise floats away unwatched — it can't fail *into* your handler anymore, and whatever response logic depended on its result never runs. The diagnostic reflex: audit every branch of every handler against the termination checklist — `res.*`, `next()`, or `next(err)` — before blaming the network.

## 6. The Traps — What Goes Wrong in Production

**Assuming a try/catch covers `await`.** People mentally file async errors under "Express catches things." Express 4's catch only spans the synchronous sliver of the handler call; everything after the first `await` happens after that window has closed. The fix is structural, not vigilance — wrappers, so that forgetting is survivable.

**Shipping an unwrapped async route on Express 4.** It looks harmless, passes review, works for months. Then one transient database hiccup becomes an unhandled rejection and the process dies, taking dozens of unrelated requests with it. On Express 4, an uncovered `async` route is a latent outage, not a style issue.

**The forgotten `await`.** Calling `validateEmail(input)` without `await` inside a handler creates a promise nobody tracks. Two failure modes at once: the handler keeps running on data that may be invalid, and when validation eventually rejects, the rejection is orphaned — crash risk with zero context about which request caused it. A linter rule like `no-floating-promises` catches this class mechanically.

**Ignoring the `err` argument in callback APIs.** `Model.findOne(filter, (err, doc) => { ... })` where you check `doc` but never `err`. On a database error, `doc` is null, you confidently 404 a perfectly healthy request — or worse, on some paths you respond to nothing and the request hangs. Branch on `err` first, always, and `next(err)` out.

**Error middleware in the wrong place or wrong shape.** Registered before the routes: it never fires, and the team concludes "Express error handling is broken" while the real bug is ordering. Written with three arguments: Express reads it as ordinary middleware that no normal request ever matches, and it silently never runs. Arity four, registered last.

**Calling `next()` after `next(err)`.** Once you delegate an error, your turn is over. Continuing writes a second response onto a request that's already answered — `ERR_HTTP_HEADERS_SENT`, corrupted flows, maddening intermittent bugs. After `next(err)`, `return`.

**Claiming Express 5 behavior on an Express 4 codebase.** "Modern Express catches rejections automatically" is true of the version you *wish* you ran. Check the lockfile. Many real systems run 4.x today, and the answer that lands in interviews is knowing which regime you're in and matching the discipline to it.

## 7. Compare With Related Concepts

**Synchronous throw vs async rejection.** A sync `throw` happens inside Express 4's watch window and is auto-forwarded to error middleware. A rejection settles later, outside the window, and Express 4 sees nothing. Rule: in Express 4, treat every `await` as unguarded until a wrapper or try/catch proves otherwise.

**Manual try/catch vs `asyncHandler` wrapper vs `express-async-handler`.** Same destination — `next(err)` — differing only in who remembers to do it. Manual is explicit but repeats in every route; your own wrapper is three lines and permanent; the package is the wrapper without owning it. Rule: past a couple of async routes, use a wrapper — write it or import it, and stop copy-pasting catch blocks.

**Normal middleware vs error middleware.** Normal is `(req, res, next)` and runs on the happy path. Error is `(err, req, res, next)` and runs only on delegated failures. Arity is the entire contract. Rule: happy-path concerns (parsing, auth, logging) go in normal middleware; a small number of error middlewares sit at the bottom of the stack.

**Per-request handling vs global safety nets.** `process.on('unhandledRejection')` and `process.on('uncaughtException')` are last-resort tripwires for bugs that escaped routing — for logging and graceful shutdown, not for generating responses, because the request context is already gone by then. Rule: wrappers guarantee per-request delivery; global handlers are the smoke detector behind the smoke detectors.

**Callbacks vs promises on error paths.** Callbacks deliver errors as a first argument you're obligated to inspect; promises deliver them as rejections you're obligated to catch. Ignored, each leaks catastrophically — one as a hung socket, the other as a dead process. Rule: whichever style you're in, decide where its errors *go* before you write the happy path.

## 8. 🧠 The Memory Hook

Express 4's safety net only covers the instant your handler is *called* — the moment you hit `await`, you step off the net, and every failure after that must be personally walked to `next(err)` (or a wrapper walks it for you). Express 5 just installed the conveyor belt: any rejected promise rides straight to your error middleware, no walking required.
