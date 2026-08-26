# What is error-handling middleware

## 1. The Real-World Problem — When You Actually Hit This

It's 2am. Your payments API has been running fine for months. Then one user pastes a malformed order id into the URL, some code in your route blows up, and nobody anywhere catches it. So Express falls back to its built-in emergency answer: an HTML page containing your full stack trace — file paths, line numbers, the shape of your whole backend. Your mobile client was expecting JSON. It calls `JSON.parse` on that HTML and crashes. Now the bug report says "app displays random code," and every attacker probing your API just learned what your directory layout looks like.

Same night, second incident, nastier. A database call rejects inside an async handler on another endpoint. Express 4 does not watch promises, so nobody catches that rejection. On any recent Node version, an unhandled rejection kills the entire process. Not one request — every request, for every user, until someone restarts the server.

Both incidents share one root cause: nobody told Express where errors should go. Error-handling middleware is exactly that instruction — one function, placed correctly, that catches anything going wrong upstream and turns it into a clean, safe response. The interview skill here isn't reciting the signature. It's understanding how Express physically moves an error from the point of failure to the code that handles it, because nearly every real-world mistake with this comes from misunderstanding that movement.

## 2. The Analogy — Make the Mechanic Obvious

Picture a factory assembly line. A product enters at one end and travels down a fixed sequence of workstations, each doing its job and passing the piece along. Those are your regular middleware. At certain points along the line sit quality-control benches. Those are your error handlers — dormant while production runs clean, waiting for something to go wrong.

How does the line know which benches are QC? Not by the nameplate, not by the location. A bench is classified purely by its construction: standard workstations are built with three clamps — hold the unit, do the work, pass it on — while QC benches are built with four: hold the unit, hold the defect report, do the work, pass it on. Counting clamps IS the classification. A brilliant repair bench built with only three clamps is, to the conveyor system, just another workstation; it will never receive a single tagged unit. In Express, counting clamps means counting function parameters: `(err, req, res, next)` versus `(req, res, next)`.

Now the rule people get wrong most often: tagged units only travel forward. The moment a unit gets a red defect tag, it leaves the normal flow, skips every remaining workstation, and rides ahead to the first four-clamp bench DOWNSTREAM from where it was tagged. A QC bench installed near the start of the line, before the stations it's supposed to cover, is dead equipment for those stations — no tag can ever reach it backwards. That's the registration-order rule, and it's not a convention; it's how the conveyor physically works.

What can a QC bench do with a tagged unit? Two options. Fix and finish it — repair, box, ship — which is sending the response; the unit leaves the line with a definite outcome. Or decide this defect isn't its specialty and send the unit further downstream, tag still attached, to the next four-clamp bench — that's `next(err)`. Specific benches first: this one handles warped casings, that one electrical faults. General salvage sits last. Whoever sits LAST in the chain must give the unit a final outcome. A tagged unit never just stops mid-line while everyone pretends it will keep moving.

Notice too what each bench says externally versus what it records internally. The shipping label gets something calm and short: "defect corrected" or "scrapped." The full inspection report — measurements, root cause, which station was responsible — goes into the factory records, never onto the label. Stack traces live in your logs, not in your responses.

Even the three ways a defect gets discovered fit the picture. Either a worker spots the flaw and attaches the tag themselves (`next(err)`), or the unit jams its station on the spot and the line's own safety mechanism sweeps it off and tags it automatically (a synchronous `throw` — Express converts it for you), or the flaw only shows up later at the test rig, after the unit already moved on (an async failure). Express 4 ignores that last case unless someone promised in advance to carry the tag forward; Express 5 auto-tags it. And if a tagged unit reaches the end of the line without ever meeting a four-clamp bench, the line's built-in disposal point takes over — shipping it out with a bare complaint form, inspection report stapled to the outside.

## 3. The Full Explanation — How It Actually Works

Plain version first. Express keeps one ordered list of functions, built at startup from your `app.use`, `app.get`, and friends calls. Every incoming request walks that list from top to bottom. Most functions on the list are normal middleware with three parameters: `(req, res, next)`. Error-handling middleware looks almost identical except it has four: `(err, req, res, next)`.

That fourth parameter isn't decoration — it's the detection mechanism. Express decides what kind of function it's holding purely by counting its declared parameters: four means "give this function errors," three means "give this function requests." Not the function name, not where it's registered, not some interface it implements. Just the count. This is why you must declare all four parameters even if you don't use the last one — drop one and Express silently reclassifies your handler as ordinary middleware.

There are exactly three ways an error enters this system:

1. Someone calls `next(err)` with a truthy first argument. This is the explicit handoff, and it works anywhere in the pipeline.
2. Code throws synchronously inside a route or middleware. Express wraps every handler invocation in its own internal `try/catch`, catches the exception, and performs `next(err)` on your behalf. You never see this machinery, but it's why a bare `throw` in a normal route doesn't kill the server.
3. A promise rejects inside an async handler. Here's the version-dependent part. Express 4 does not inspect returned promises — a rejection simply evaporates: nobody awaits it, the client waits forever, and on modern Node the unhandled rejection takes the whole process down. Express 5 fixed this: it awaits handler results and forwards rejections to error handling automatically. On Express 4, you survive with a tiny wrapper (shown in the code section) or `try/catch` in every handler.

So what happens once an error exists? Express freezes the normal tour at the exact layer where the error surfaced, then scans the list FORWARD — skipping every remaining route and normal middleware — until it finds the first function with four parameters. Everything between the failure point and that function is bypassed. Crucially, the scan only looks ahead. An error handler registered before the route that failed is unreachable for that route, no matter how correct its code is.

If the scan reaches the end without finding any four-parameter function, Express uses its built-in default handler. That default reads `err.status` or `err.statusCode` (falling back to 500), and it responds with `text/html`: outside production, the body is your full stack trace; in production, a terse generic message. Either way it's never JSON — which is precisely the "API client receives an HTML page" pain from the opening story.

Several consequences fall straight out of this design:

- Registration order defines coverage. Handlers belong after every route whose errors they should catch. A common layout: module-level handler at the end of each router for local concerns, one final app-level handler as the global net.
- Errors can be relayed. An error handler that calls `next(err)` passes the error to the next four-parameter function downstream. That's how you build a chain: a specific handler for known cases first, a general safety net last. Each handler must either send a response or call `next(err)`. Doing neither leaves the request hanging forever.
- The `headersSent` escape hatch. If the response has already started streaming and an error arrives, you can no longer set a status code — attempting it crashes with `ERR_HTTP_HEADERS_SENT`. The documented pattern: check `res.headersSent` and, if true, delegate with `next(err)` unconditionally so Express's default handler aborts the connection cleanly.
- Errors created by you versus errors created by the runtime deserve different treatment. Expected failures — validation, not-found, expired tokens — are called operational errors. Bugs — undefined variable references, a driver imploding — are programmer errors. Operational errors can carry a real status code and a message the client benefits from reading. Programmer errors should produce a generic 500 to the client and a loud, fully detailed internal log with request context: method, URL, user id, correlation id. A small custom error class carrying `status` and `isOperational` makes this split trivial inside the handler.

The tradeoffs are real. Centralizing means every failure in the app gets one consistent format, one logging policy, and your routes stay free of try/catch confetti. The cost is an invisible jump: when you're debugging, control suddenly leaps across half your file, and if you don't know the skip-forward rule, the flow looks haunted. Also know the boundary: this whole system covers the request/response world only. A crashed background job or a timer callback exploding never touches Express routing and needs its own handling.

One more thing worth naming: error responses are an attack surface. Messages like "email already registered" confirm account existence; stack traces reveal internals. The rule is simple — rich detail inward, minimal detail outward.

## 4. See It In Practice — Real Code or Queries

**The smallest correct setup.** One route that throws synchronously, one error handler built with all four parameters, registered last:

```js
const express = require('express');
const app = express();

app.use(express.json());

// A normal route. This throw is synchronous, so Express itself catches it
// and forwards it to the error handler below. No try/catch needed here.
app.get('/orders/:id', (req, res) => {
  if (req.params.id === 'bad') {
    throw new Error('invalid order id');
  }
  res.json({ id: req.params.id });
});

// The four parameters ARE the classification. This is how Express recognizes
// this function as an error handler instead of regular middleware.
// It sits AFTER every route whose errors it should catch.
app.use((err, req, res, next) => {
  console.error(err.stack); // full detail goes to our logs...
  res.status(500).json({ error: 'Something went wrong' }); // ...never to the client
});

app.listen(3000, () => console.log('listening on 3000'));
```

Run it, hit `/orders/bad`, and the terminal shows the stack while the client gets clean JSON with a 500. Hit `/orders/42` and the error handler never runs — it stays dormant on the happy path.

**The three roads an error can take** (written for Express 4, where road 3 needs help):

```js
const express = require('express');
const app = express();

// Wraps an async handler so any rejection becomes next(err).
// On Express 4 this wrapper is survival, not style.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Road 1: we detect the problem ourselves and hand it over explicitly.
app.get('/users/:id', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    const err = new Error('user id must be an integer');
    err.status = 400;
    return next(err); // skips everything between here and the error handler
  }
  res.json({ id });
});

// Road 2: a synchronous throw. Express catches it and calls next(err) for us.
app.get('/crash', () => {
  throw new Error('boom');
});

// Road 3: async work fails. The wrapper above does the catching.
// Bare Express 4 would let this rejection vanish entirely.
app.get('/reports', asyncHandler(async (req, res) => {
  throw new Error('db timeout'); // inside an async function this is a rejected promise
}));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
  });
});

app.listen(3000);
```

On Express 5, roads 2 and 3 behave identically — the router awaits results and forwards rejections — so the wrapper becomes optional. Keeping it is still fine, especially when you want extra behavior (timeouts, cancellation) in one place.

**The production-shaped version.** A custom error class, a 404 catcher, two chained handlers, and the `headersSent` guard:

```js
const express = require('express');
const app = express();

// Our own error type. It carries the HTTP status and a flag meaning
// "this failure was expected" — the handler uses that to decide
// how much detail the client is allowed to see.
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.isOperational = true;
  }
}

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ---------- routes ----------
app.get('/products/:id', asyncHandler(async (req, res) => {
  const product = await findProduct(req.params.id);
  if (!product) {
    throw new ApiError(404, 'Product not found'); // operational: safe to show
  }
  res.json(product);
}));

// ---------- 404 catcher ----------
// THREE parameters on purpose: this is normal middleware. It only runs when
// no route matched and no error happened. We convert "nothing matched" into
// an error so the client gets the same JSON shape as every other failure.
app.use((req, res, next) => {
  next(new ApiError(404, `No route for ${req.method} ${req.originalUrl}`));
});

// ---------- error handlers, consulted top to bottom ----------

// Specific handler: normalize known library errors first.
app.use((err, req, res, next) => {
  if (err.name === 'CastError') {
    // e.g. Mongoose was handed a malformed ObjectId
    return res.status(400).json({ error: 'Malformed identifier' });
  }
  next(err); // not ours to judge — pass it down the chain
});

// General handler: the safety net. This one ALWAYS answers.
app.use((err, req, res, next) => {
  if (res.headersSent) {
    // Bytes already streamed — setting a status now would crash.
    // Delegate to Express's default handler, which aborts the connection.
    return next(err);
  }

  const status = err.status || 500;
  const operational = err.isOperational === true;

  console.error(
    JSON.stringify({
      msg: err.message,
      stack: err.stack,
      operational,
      method: req.method,
      url: req.originalUrl,
    })
  );

  res.status(status).json({
    // Real messages only for errors WE created. Anything unknown is
    // treated as a bug: generic response outward, loud log inward.
    error: operational ? err.message : 'Internal server error',
  });
});

app.listen(3000, () => console.log('listening on 3000'));

// Stubbed data access so the whole file is copy-paste runnable.
async function findProduct(id) {
  return id === '42' ? { id: '42', name: 'Keyboard' } : null;
}
```

Trace one request end to end. `GET /products/nope`: route throws an `ApiError(404)`, Express skips forward past everything, the specific handler doesn't recognize it and calls `next(err)`, the general handler logs it and answers `{ error: 'Product not found' }` with status 404. `GET /definitely-not-a-route`: no route matches, no error exists, so the three-parameter catcher runs, manufactures the 404, and the same two-handler chain produces identical JSON. One error shape for the entire frontend, however the request failed.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is error-handling middleware in Express?**

It's the same middleware mechanism you already know, with a different assignment. Normal middleware receives `(req, res, next)` and moves the request along the pipeline. Error-handling middleware receives `(err, req, res, next)` and sits in the very same ordered stack, but stays dormant while requests succeed. The moment anything upstream signals a failure, Express bypasses all remaining normal middleware and hands the error to it. Its job is the last mile of every failure: log what happened internally, decide an HTTP status, and send a safe, consistent response — or pass the error onward to another handler if it isn't the right one to decide.

**Q: How does Express tell an error handler apart from regular middleware?**

By counting parameters. A function declared with four parameters — `(err, req, res, next)` — is classified as an error handler. Three parameters means regular middleware. That's the whole test; nothing about names, exports, or position participates. The practical consequence: you must declare all four arguments even if your handler never touches `next`, because dropping one changes what Express thinks the function is. Arrow functions, named functions, class methods — the arity rule applies to all of them equally.

**Q: How does an error actually reach the handler? What can trigger it?**

Three roads. First, explicit: any code in the pipeline calls `next(err)`. Second, a synchronous `throw` inside a route handler or middleware — Express wraps handler invocations in an internal try/catch and converts the exception into `next(err)` for you. Third, an async failure: in Express 4, a rejected promise is invisible to the framework, so you must catch it yourself and call `next(err)` — typically via a small `asyncHandler` wrapper applied to every async route. Express 5 closes that gap and forwards rejections automatically. Once the error exists, the movement is the same in every case: Express abandons the normal sequence at that point and scans forward for the first four-parameter function.

**Q: Why must error handlers be registered after routes? What happens if one is registered before them?**

Because the search for a handler is strictly forward-only, starting from the point of failure. A handler registered before your routes is behind, not ahead, so errors from those routes can never land in it. The failure is completely silent: the app boots, happy-path tests pass, and the first real error sails past your carefully written handler into Express's default one — which, outside production, happily ships your stack trace to whoever caused it. This is why "define it last" is physics, not style: registration position draws the coverage boundary.

**Q: What's different about error handling in Express 4 versus Express 5?**

Synchronous throws were always caught by both. The difference is promises. Express 4 ignores a rejected promise returned from a handler: the rejection becomes unhandled, the client hangs waiting for a response that never comes, and on modern Node versions the process itself dies. Teams survived with `asyncHandler` wrappers or try/catch in every route. Express 5 awaits handler results internally, so a rejected promise is forwarded to error handling exactly like a thrown error. If an interviewer asks, the sharp addition is that Express 5 didn't change the skip-forward search or the arity rule at all — it only automated road number three.

**Q: What should a production error handler actually do?**

Four things, in order. Log everything: full stack plus request context — method, URL, authenticated user, correlation id — into your real logging service, because that record is all you'll have when a user reports "it didn't work yesterday." Classify: is this an operational error you anticipated, or a programmer error you didn't? Respond accordingly: operational errors earn their true status code and a message the client can act on; programmer errors get a generic 500 outward while the detailed stack lives only in the logs. Keep the contract stable: one JSON error shape across the whole API so frontend code handles failure once, in one place. And guarantee an answer: every path through the handler ends in a response or a deliberate `next(err)` — never silence.

**Q: How do you handle different error types without turning the handler into spaghetti?**

Create your own error class — `ApiError extends Error` carrying `status` and `isOperational` — and throw it from routes whenever the failure is expected: validation, not-found, permission. Inside the handler, `err.isOperational === true` means "I made this error deliberately; its message is client-safe." Anything else is assumed to be a bug: generic 500 out, full stack in the log. Library-generated errors get normalized in dedicated chained handlers placed before the general one — a Mongoose `CastError` becomes a 400, a JWT `JsonWebTokenError` becomes a 401 — each ending in either a response or `next(err)`. The rule that keeps messages safe: only errors constructed by your own code are allowed to speak to the client verbatim.

**Q: Can you have multiple error handlers? How does the chain work?**

Yes, and the ordering works like everything else in Express: top to bottom. When an error handler calls `next(err)`, Express continues its forward scan and lands in the next four-parameter function below it. The idiomatic arrangement is specific handlers first — known library errors, domain errors — and a general catch-all last that logs and answers with a 500. The iron rule for every member of the chain: either finish the response yourself, or hand the error onward. A handler that does neither strands the request — the socket stays open, the client spins, and eventually its timeout fires while your server believes everything is fine.

**Q: What happens if you don't define any error handler at all?**

You get Express's built-in default handler, and it explains both classic production scars. It derives a status from `err.status` or `err.statusCode`, defaulting to 500, and responds as `text/html`: outside production the body contains your full stack trace; in production a terse generic message. It is never JSON. So in development the leak feels harmless, and in production it feels "safe enough" — until the first API consumer that expects JSON meets an HTML error page and falls over parsing it. Defining your own final handler isn't gold-plating; it's replacing an HTML page meant for humans with a contract meant for machines.

**Q: An error occurs after the response has already started streaming. What now?**

You cannot send another response — status and headers are locked the moment bytes hit the wire. Attempting `res.status(500)` at that point crashes with `ERR_HTTP_HEADERS_SENT`, which means your error handler itself just threw, and now you're handling the handler's error. The documented pattern is the guard: if `res.headersSent` is true, call `next(err)` unconditionally. Express's default handler knows the situation and aborts the connection instead of trying to write. Ugly for that one client, correct for everyone else.

**Q: Is a 404 handled by error-handling middleware?**

Not by default, and this trips people constantly. An unmatched URL is not an error: the request simply finishes walking the whole stack without meeting anything, and Express's default answers with its plain "Cannot GET /whatever" page. No `err` ever existed. The idiomatic fix is a three-parameter catcher registered after all routes — it only runs when nothing matched and nothing failed — and its one job is manufacturing the error: `next(new ApiError(404, ...))`. From there your real error chain produces the standard JSON shape. So the mental split is: missing route is converted INTO an error by you; actual failure IS an error already.

**Q: What's the difference between `next()`, `next(err)`, and `next('route')`?**

Three different signals. `next()` with no arguments says "I'm done, continue with the next normal middleware." `next(err)` with a truthy error says "something failed" — Express flips into error mode and jumps forward to the first four-parameter function. `next('route')` is the polite one: "this particular handler can't serve this request, but maybe the next handler bound to this same route can" — it abandons only the remaining callbacks of the current route and is legal only inside `app.get`-style route definitions, not `app.use`. One historical footgun worth knowing: any truthy string other than `'route'` passed to `next` is treated as an error by legacy code, so `next('skip')` doesn't skip — it errors.

## 6. The Traps — What Goes Wrong in Production

**Registering the handler before the routes it protects.** The most common mistake, and the quietest. Express only scans forward from the failure, so this arrangement can never fire:

```js
// BROKEN ORDER: registered BEFORE the routes it should cover.
app.use((err, req, res, next) => res.status(500).json({ error: 'handled' }));
app.get('/pay', () => { throw new Error('payment failed'); }); // never reaches it
```

Nothing crashes at boot. Tests on the happy path pass. The first genuine error falls through to the default handler and its stack-leaking HTML page — usually discovered by a user before you. Fix: always the last `app.use` calls in the file, after every route and router.

**Declaring three parameters instead of four.** Drop the `next` parameter — "I don't need it anyway" — and Express reclassifies your handler as normal middleware. Worse than never firing: it starts FIRING on the happy path. Placed after all your routes, a three-parameter function runs for every request that matched nothing — it silently becomes your accidental 404 responder, answering legitimate misses with a bogus 500:

```js
// Intended as an error handler. Is not. Three parameters.
app.use((req, res, next) => {
  res.status(500).json({ error: 'handled' });
});
```

Count the parameters like Express does: four or it isn't an error handler.

**Async failure with no wrapper on Express 4.** The rejection escapes the framework entirely:

```js
// Express 4: nobody catches this. The rejection vanishes.
app.get('/stats', async (req, res) => {
  const rows = await db.query('SELECT ...'); // rejects -> request hangs, process may die
  res.json(rows);
});
```

The client waits until its own timeout; on modern Node the unhandled rejection terminates the whole process, taking unrelated users down with it. Fix: wrap async handlers (`Promise.resolve(fn(req,res,next)).catch(next)`) or upgrade to Express 5, which forwards rejections natively.

**Sending stack traces or raw error objects to clients.** `res.status(500).send(err)` or letting the default handler run outside production hands attackers your file layout, dependency versions, and sometimes query shapes — reconnaissance delivered free. It also breaks JSON-expecting clients with HTML. Fix: full detail to logs only; client-facing bodies come from your own vocabulary, and only from errors you constructed.

**A chained handler that neither responds nor forwards.** In a multi-handler chain, a specific handler that checks one error type but forgets the `else` swallows everything else:

```js
// Neither answers nor calls next(err) for other errors. Request hangs forever.
app.use((err, req, res, next) => {
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({ error: 'Bad token' });
  }
  // no else — every other error falls off a cliff here
});
```

The socket stays open, the client times out, your logs show nothing. Fix: end every handler with either a response or `return next(err)`, no third option.

**Missing the `headersSent` guard.** When an error arrives mid-stream, writing a new response throws `ERR_HTTP_HEADERS_SENT` inside the handler itself — your safety net becomes the thrower. Fix: first line of the final handler checks `res.headersSent` and delegates with `next(err)`, letting Express abort the connection.

**Flattening every failure into a generic 500 — or flattering every bug with a friendly message.** Both directions hurt. All-500 means a client can't distinguish "fix your input" from "our fault," so validation mistakes trigger support tickets and retry storms. The inverse — returning `err.message` for unknown errors — leaks internals and hides real bugs behind polite responses nobody investigates. Fix: operational errors carry their true status and a curated message; everything unknown gets 500 plus a loud internal log.

## 7. Compare With Related Concepts

**Error-handling middleware vs regular middleware.** Same stack, same registration API, different job and different signature: `(err, req, res, next)` versus `(req, res, next)`. Regular middleware processes healthy traffic; error middleware is bypassed by healthy traffic and activated only by failure. Rule of thumb: moving a request forward takes three parameters; catching its failure takes four.

**`throw` vs `next(err)`.** Inside synchronous code they're equivalent — Express converts the throw for you — so `throw new ApiError(...)` in a route is fine and readable. In async code on Express 4, `throw` merely rejects a promise the framework never inspects; only `next(err)` (directly or via a wrapper) guarantees delivery. Rule: sync code may throw; async code always hands the error forward.

**`next(err)` vs `next('route')`.** Both skip code ahead, but to different places. `next(err)` declares failure and jumps to the next error handler, bypassing everything. `next('route')` declares "wrong handler for this request" and drops only to the next handler attached to the same route — no error involved, no error handler visited. Rule: something broke, use the error; this handler doesn't apply but another might, use `'route'`.

**Error handler vs the 404 catcher.** Two adjacent `app.use` calls with different arities and different jobs. The 404 catcher has three parameters and fires when a request matched nothing and nothing failed — it manufactures the error. Error handlers have four parameters and fire only when an error already exists. Rule: absence of a route is converted into an error; a failure already is one.

**Per-router handlers vs one global handler.** A handler appended at the end of a router catches only errors from that router and can specialize (a router serving HTML pages may want HTML error pages); uncaught errors bubble up to the parent app's handlers. A single global handler is simpler but forces one format onto every consumer. Rule: module-specific error presentation lives at the router level; the universal JSON net lives at the app level.

**Your final handler vs Express's default.** The default exists so prototypes don't hang; it speaks HTML, leaks stack traces outside production, and knows nothing about your API contract. A custom final handler speaks your JSON error shape, integrates with your logger, and never leaks. Rule: default is scaffolding — ship your own.

## 8. 🧠 The Memory Hook

Errors are red-tagged units on a one-way conveyor: from the point of failure, Express skips every remaining station and lands on the first bench built with four parameters — `(err, req, res, next)`. Tags never travel backwards, so count the parameters like the line counts clamps and check the position: three parameters, or registered behind your routes, and you haven't built a catcher — you've built another workstation.
