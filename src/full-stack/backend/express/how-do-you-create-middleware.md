# Creating Middleware in Express

## 1. The Real-World Problem — When You Actually Hit This

It's 5pm on a Friday. Someone ships a "tiny" change: a logging middleware that counts API traffic. Ten minutes later the whole backend is down. Not slow — frozen. Every request to every route just spins. Health checks time out, the orchestrator kills the pods, fresh pods start with the same bad code and freeze the same way. The rollback takes forty minutes and ruins someone's weekend.

The cause was six lines. The middleware logged the request, kicked off an async metrics call, and then... did nothing. It never called `next()` and never sent a response. Every incoming request walked into that function and stood there forever, holding open sockets, waiting for an answer no one would ever give.

This is the power you hold when you write middleware. It runs for potentially every request that enters your server. Written well, it's where authentication, body parsing, logging, and rate limiting live. Written badly, one function can hang the entire service — or crash the Node process outright. Interviews drill this topic hard because the `(req, res, next)` signature looks trivial and absolutely isn't. They want to know whether you understand what that little function promises the framework.

## 2. The Analogy — Make the Mechanic Obvious

Think of an international airport, and follow one passenger trying to get from the entrance to their gate.

The passenger is the request. They carry everything about themselves in one place: passport, boarding pass, luggage. That's the `req` object — one object carrying all of the request's data, moving through the whole process.

Each security or passport checkpoint is a middleware function. Here's what makes the analogy click: every checkpoint deals with the *same* passenger and the same documents. Immigration stamps something into the passport; the gate agent reads that stamp later. When your auth middleware writes `req.user`, the route handler reads `req.user` later. Same object, passed hand to hand down the line.

At every checkpoint, the officer has exactly three possible moves:

Wave the passenger through to the next checkpoint. That's calling `next()` — control moves to whatever you registered after this function.

Turn the passenger away right there. That's sending a response with `res` — `res.status(401).json(...)`. The journey ends at this checkpoint. Nobody downstream ever runs.

Escalate to the supervisor. That's calling `next(err)` with an error. The passenger gets pulled out of the normal line and taken to the complaints desk — we'll see how that desk works, because it's special.

The failure modes map perfectly too. An officer who neither waves the passenger through nor turns them away leaves that person standing at the checkpoint indefinitely. That's the Friday-night outage: middleware that calls neither `next()` nor sends a response. And an officer who waves the passenger through *and* simultaneously puts them on a plane has made two contradictory announcements — that's calling `next()` and also responding, which is how you get Express's famous "Cannot set headers after they are sent."

Finally, the layout. Entrance screening that every single passenger passes through is application-level middleware — `app.use()`. Extra screening that only exists at Gate C22 for one specific flight is route-scoped or router-level middleware — it only touches passengers headed that way. And the complaints desk is error-handling middleware: a different room entirely, recognizable by a different staffing roster (four parameters instead of three), and it only becomes relevant when something upstream escalates to it.

## 3. The Full Explanation — How It Actually Works

Strip away the framework magic and Express is very simple. When a request arrives, Express holds an ordered list of every function you registered, in the order you registered them. It walks that list, handing the same `req` and `res` objects to each function in turn. That's the entire engine — how it walks that list internally is its own deep topic; this page is about building and wiring the functions inside it. "Middleware" is just the name for a function in that list that isn't the final responder.

A middleware function is any function with the signature `(req, res, next)`. Nothing more. No base class, no interface. This:

```js
function requestLogger(req, res, next) {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
}
```

is a complete, legitimate middleware. The three parameters are the whole contract:

`req` is the request — URL, headers, parsed body, query string, plus anything earlier middleware attached to it. You may read it and modify it; adding properties to `req` is the official way middleware shares data downstream.

`res` is the response. Write to it and the request is finished — `res.json(...)`, `res.status(403).send(...)`, whatever fits.

`next` is the baton. Call it with no argument to pass control to the next function in the list, or call it with an error to jump straight to the error handler.

One iron rule follows: every middleware must do exactly one of "respond" or "`next()`". Respond and stop. Or pass the baton and trust someone downstream to respond. Doing neither leaves the client hanging. Doing both sends contradictory answers.

Registration is just appending to that ordered list, and where you append decides scope:

```js
app.use(logger);                  // runs for EVERY request, any method
app.use('/admin', requireAdmin);  // runs for every request under /admin/*
app.get('/health', handler);      // GET /health only — usually the end of the line
```

`app.use()` is the general pipe: method-blind, and a mount path acts as a prefix, so `/admin` also matches `/admin/users` and `/admin/stats`. `app.get()`, `app.post()` and friends are method-aware and are normally where a request finally gets answered. Router-level middleware is the same mechanism scoped to a sub-app: build an `express.Router()`, attach middleware and routes to it, then mount the whole thing with `app.use('/orders', ordersRouter)`. Everything attached to that router runs only for requests under `/orders`. Same mechanics, smaller blast radius.

Errors have their own lane, and the detail interviewers listen for is *how Express recognizes it*. When any middleware calls `next(err)`, Express stops walking the normal list immediately, skips every remaining normal middleware and route handler, and jumps to the next function in the list that has *four* parameters: `(err, req, res, next)`. That arity is literally how an error handler is identified — a function with three parameters sitting in the list is treated as normal middleware and never receives errors, no matter what you name it. Two consequences follow. Error handlers must be registered after the routes whose errors they should catch, because Express only looks forward. And if no error handler exists at all, Express's built-in default responds instead — including printing the error stack in development mode, which becomes an information leak in production if you leave it on.

Asynchronous middleware has one extra wrinkle, and it has caused a thousand production incidents. Express 4 does not catch rejected promises. If an `async` middleware awaits something that fails and you didn't wrap it, the rejection escapes into Node as an unhandled rejection — and on Node 15 and later the default behavior is to kill the process. Not that one request: the whole server, every user, mid-flight. Express 5 forwards rejected promises to the error handler automatically, but plenty of production systems still run Express 4, so the manual discipline stays relevant.

Two tradeoffs round out the picture. Everything mounted globally is paid for by every request: a middleware awaiting a slow third-party call adds its latency to the whole API, and one doing heavy synchronous CPU work blocks the event loop for everyone. Keep the global pipeline lean and scope anything expensive. And order is correctness, not style: a JSON parser must run before anything reads `req.body`, authentication must run before anything trusts `req.user`, and CORS must run above your error handler so error responses still carry CORS headers.

## 4. See It In Practice — Real Code or Queries

All examples below assume a plain Node project with `npm install express jsonwebtoken` and an `app` created with `express()`, as in the first snippet.

**The smallest complete setup** — one middleware, one route:

```js
const express = require('express');
const app = express();

// Any function with (req, res, next) is middleware.
app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

app.get('/ping', (req, res) => {
  res.json({ pong: true });
});

app.listen(3000);
```

Run this, hit `http://localhost:3000/ping`, and watch the log print before the response arrives. That ordering *is* the middleware lifecycle: pipeline first, handler last.

**Auth middleware exercising all three decisions** — do work, then respond, escalate, or wave through:

```js
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    // Decision 1: end the cycle ourselves. Answer, and do NOT call next().
    return res.status(401).json({ error: 'missing token' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) {
      // Decision 2: escalate. Jump straight to the error handler.
      return next(err);
    }
    // Stamp the passport: everything downstream can now read req.user.
    req.user = payload;
    // Decision 3: wave it through to the next middleware / handler.
    next();
  });
}

app.use('/admin', requireAuth);

app.get('/admin/stats', (req, res) => {
  res.json({ viewer: req.user.email }); // works because auth set req.user
});
```

Notice the `return` in front of each response. It's not decoration — it guarantees this function makes exactly one of the three decisions and can never fall through into a second one.

**Configurable middleware via a factory.** Real apps need the same logic with different settings — roles, rate limits, upload sizes. A function that returns a middleware solves it:

```js
// Configure once at startup, get back ready-made middleware.
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'authenticate first' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

// Same factory, different configs, zero duplication.
app.delete('/users/:id', allowRoles('admin'), removeUser);
app.post('/posts', allowRoles('admin', 'editor'), createPost);
```

This is exactly how `express.json()` and `helmet()` work internally — they're factories. That's why you *call* them: `express.json()` returns the middleware, and `app.use()` registers whatever it returns.

**Async middleware in Express 4** — the dangerous way and the safe way:

```js
// BROKEN in Express 4: if redis.get rejects, nobody catches it.
// Node turns it into an unhandled rejection and exits the process.
app.use(async (req, res, next) => {
  const raw = await redis.get(`session:${req.get('x-session-id')}`);
  req.session = raw ? JSON.parse(raw) : null;
  next();
});

// FIXED: wrap async functions so rejections become next(err) automatically.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

app.use(asyncHandler(async (req, res, next) => {
  const raw = await redis.get(`session:${req.get('x-session-id')}`);
  req.session = raw ? JSON.parse(raw) : null;
  next();
}));
```

The wrapper is four lines and most teams keep one in a shared utils file. It works because calling an `async` function always returns a promise — so `.catch(next)` converts any rejection into the error lane. In Express 5 the wrapping is unnecessary; rejections reach the error handler natively.

**Router-level scoping** — a pipeline for one section of the API only:

```js
const ordersRouter = express.Router();

ordersRouter.use(requireAuth); // guards ONLY this router's routes

ordersRouter.get('/', listOrders);
ordersRouter.get('/:id', getOrderDetail);

app.use('/orders', ordersRouter); // mounted under the /orders prefix
```

A request to `/products` never touches anything inside `ordersRouter`. That's how you keep auth on the money routes without taxing the health check.

**The error handler** — registered last, recognized by arity:

```js
// FOUR arguments is the marker Express looks for.
// Registered AFTER every route whose errors it should catch.
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'internal error' });
});
```

Any `next(err)` from anywhere above it lands here. Without such a handler, Express's default one responds instead and leaks stack traces in development mode — one more reason this block sits at the bottom of every real app.

## 5. Interview Questions — All of Them, Done Properly

**Q: What exactly is middleware in Express, and how do you create one?**

It's any function with the signature `(req, res, next)`. That's the entire definition — no base class, no special type. You create one by writing such a function and registering it with `app.use()`, an `app.METHOD()` call, or `router.use()`. Inside the function you can inspect or modify `req`, and then you make a decision: respond with `res` to finish the request, or call `next()` to hand control to the next registered function. Because every middleware receives the same `req` object, a common pattern is enrichment — auth middleware sets `req.user`, and every handler after it reads `req.user`. The pattern exists so cross-cutting concerns like parsing, auth, and logging are written once instead of pasted into every route handler.

**Q: What's the difference between `app.use()` and `app.get()` for registering middleware?**

`app.use()` is method-blind and path-prefix based. `app.use('/admin', fn)` runs `fn` for every HTTP method on `/admin` and anything under it, like `/admin/users`. `app.get('/admin', fn)` only fires for GET requests matching that path, and it's normally the terminal step — where a response gets sent. Mentally model `app.use()` as building the pipeline and `app.get()`/`app.post()` as endpoints at the end of it. A typical app parses bodies with `app.use(express.json())` near the top, guards routes with mounted middleware, and answers in method handlers at the bottom.

**Q: What happens if a middleware never calls `next()` and never sends a response?**

The request hangs. Express has no idea a middleware is "done" — there's no return value that means finished; the only signals are calling `next()` or writing to `res`. So the socket stays open, the client waits for a response that never comes, and eventually something external gives up: the browser times out, the load balancer cuts the connection after 30 or 60 seconds, or Node's own server timeout fires. While it hangs you're leaking sockets and memory — and if health checks route through it, your pod gets killed. The tell-tale debugging sign: your logs show the middleware's own output, then silence. The fix is making sure every code path in a middleware ends in exactly one of "respond" or `next()`, with early `return`s guaranteeing it.

**Q: What are the types of middleware in Express?**

Five categories. Application-level: registered on the `app` instance via `app.use()` or `app.METHOD()`. Router-level: the same thing bound to an `express.Router()` instance, affecting only routes mounted under that router. Error-handling: the four-parameter `(err, req, res, next)` variant that receives forwarded errors. Built-in: shipped with Express — `express.json()`, `express.urlencoded()` for bodies, `express.static()` for files. Third-party: npm packages following the same contract — `cors`, `helmet`, `morgan`, `compression`, `multer`. The category matters less than the contract: all five are just functions in the ordered list, differing only in how and when they're inserted into it.

**Q: How does error-handling middleware work, and why does it need exactly four arguments?**

Express identifies error handlers purely by function length: four parameters means error handler, three means normal middleware. Names are irrelevant. When any middleware or handler calls `next(err)`, Express abandons the normal chain at that point, skips everything ordinary ahead in the list, and invokes the next four-argument function it finds. That's why placement matters: an error handler registered *before* your routes never sees their errors, because Express only searches forward. Inside the handler, respond with the right status and a safe message — never echo raw stack traces to clients in production. If an error handler itself calls `next(err)`, the search continues to any further error handler down the list, which is how teams chain specialized handlers (JSON parse errors first, then everything else).

**Q: How do you handle errors in async middleware?**

Manually in Express 4, because the framework doesn't catch rejected promises there. Either wrap the body in try/catch and call `next(err)` from the catch block, or use the standard wrapper — `const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)` — and register `asyncHandler(myAsyncFn)`. Skipping this isn't a lint nitpick: an escaped rejection becomes an unhandled rejection, and modern Node exits the process by default, taking every in-flight request down with it. Express 5 forwards rejected promises to the error handler on its own, which retires the wrapper. Mentioning that version distinction in an interview signals you've operated real systems, not just read docs.

**Q: Can middleware be applied conditionally?**

Yes, at several levels. At registration time, mount by path (`app.use('/admin', adminOnly)`) or apply per-route by passing middleware before the handler (`app.get('/reports', requireAuth, fetchReport)`). You can also decide at startup from the environment: `if (process.env.NODE_ENV === 'production') app.use(rateLimiter)`. And at runtime, branch inside the middleware and bail out early: `if (!req.path.startsWith('/api')) return next();` — the `return` matters, because it stops the rest of the function from running and calling `next()` twice. There's also `next('route')`, which skips the remaining callbacks attached to the current route only. One design note seniors add: if a middleware needs many branches to decide whether it applies, it's usually two middlewares wearing one coat — split it.

**Q: How do middleware pass data to each other and to route handlers?**

By attaching properties to `req`. The same request object flows through the entire chain, so auth middleware sets `req.user`, a tracing middleware sets `req.requestId`, and the handler three steps later reads both. Each request gets a fresh `req` and `res` — nothing carries over between requests, which is exactly why this is safe for per-request data. The boundary to respect: `req` is not a cache. Whatever you attach persists for the whole request lifecycle, so don't park large blobs or secrets on it that downstream code doesn't need. And sharing data *across* requests — between different users — is a job for a store like Redis, never for the request object.

**Q: Why does the order of middleware matter so much?**

Because registration order is execution order — Express walks the list top to bottom. Consequences stack fast: `express.json()` must appear above any route reading `req.body`, or the body is `undefined`; authentication must appear above anything trusting `req.user`; CORS should appear above the error handler, or error responses lack CORS headers and the browser reports them as opaque network failures instead of showing them to your frontend developer; the error handler goes last because it can only catch errors from things registered above it. Ordering is also a performance lever — putting `express.static()` above auth lets asset requests skip auth entirely. Whenever behavior seems mysteriously wrong, audit the vertical order of `app.use` calls before touching logic.

**Q: What's the difference between `next()`, `next(err)`, and `next('route')`?**

Three different signals sharing one function. `next()` with no argument continues the normal chain — the next middleware or handler in line runs. `next(err)` with any truthy value switches to the error lane: skip everything normal, invoke the next four-parameter error handler. The lone exception is the exact string `'route'` — `next('route')` does not enter the error lane; it skips the remaining callbacks attached to the *current route only* and moves on, useful when one handler in a list decides another should take over. (`next('router')` similarly exits an entire mounted router.) A subtle trap hides here: `next('user not found')` is not a log message — any truthy string other than `'route'` is treated as an error and lands in your 500 handler.

## 6. The Traps — What Goes Wrong in Production

**The forgotten `next()` — the silent outage.** The wrong assumption: "when my middleware finishes, Express moves on automatically." It doesn't. Express only moves when told — via `next()` or a response. Forget both and every request hitting that middleware stalls until some timeout somewhere surrenders. This is the nastiest middleware bug because nothing throws and nothing logs an error; it ships looking green:

```js
// BROKEN: counts the request, then... nothing. No next(), no response.
app.use((req, res, next) => {
  metrics.increment(req.path); // fire-and-forget call is fine...
  // ...but a refactor deleted the next() line. Every request hangs here.
});

// FIXED: the middleware hands control onward.
app.use((req, res, next) => {
  metrics.increment(req.path);
  next();
});
```

**Calling `next()` and responding — the double answer.** The wrong assumption: "`next()` just means done." It means *continue*, so the chain keeps running, and if a downstream handler also responds, two responses race for one socket:

```js
// BROKEN: two answers for one request.
app.use((req, res, next) => {
  if (req.query.verbose) {
    res.json({ verbose: true }); // headers go out here...
  }
  next(); // ...and the chain keeps going and tries to answer AGAIN
});
```

The visible result is `ERR_HTTP_HEADERS_SENT` — "Cannot set headers after they are sent to the client" — plus unpredictable behavior about which answer the client actually got. The fix is structural: make branches mutually exclusive with `return` — `return res.json(...)` — so a middleware physically cannot both respond and pass the baton.

**Unwrapped async in Express 4 — the process killer.** The wrong assumption: "async failures are handled like sync failures." A synchronous `throw` inside middleware does get caught and routed to the error handler; a rejected promise in Express 4 does not. The escaped rejection becomes an unhandled rejection, and on Node 15+ the default response is to terminate the process. Blast radius: not one failed request — every request in flight, on every route, plus a restart loop until fix or rollback. Wrap async middleware with the four-line `asyncHandler` from section 4, or move to Express 5 where rejection forwarding is built in.

**The misshapen or misplaced error handler.** Two ways to silently lose all error handling. Shape: writing `(req, res, next) => { ... }` with three parameters and expecting errors — Express counts parameters, sees three, files it as normal middleware, and it never runs for errors. Place: registering the four-parameter handler *above* the routes it should protect — Express only searches forward through the list. Both bugs look identical from outside: errors bypass your clean JSON error format and hit Express's default handler, which prints stack traces in development mode. Rule: error handler goes last, always with four parameters.

**Treating `next(string)` as a message.** `'route'` is a documented control-flow keyword; any other truthy string — `next('done')`, `next('skip')` — is interpreted as an error and routed to the 500 handler. Teams have burned hours debugging why healthy requests randomly produce 500s, only to find a custom `next('finished')` deep inside some middleware. Pass real `Error` objects when you mean error, bare `next()` when you mean continue, `'route'` only when you mean skip-the-rest-of-this-route.

**Reading `req.body` before the parser ran.** The body doesn't exist as an object until `express.json()` (or equivalent) has processed the raw stream. Register the parser below your routes and every consumer sees `undefined`:

```js
// BROKEN ORDER — the route reads the body before the parser has run:
app.post('/signup', (req, res) => {
  res.json({ email: req.body.email }); // req.body is undefined
});
app.use(express.json());

// CORRECT ORDER — parse first, consume later:
app.use(express.json());
app.post('/signup', (req, res) => {
  res.json({ email: req.body.email }); // works
});
```

The same law covers `req.user` before auth middleware and CORS headers missing from error responses. Order bugs feel like data bugs; check the pipeline first.

**Global middleware that taxes every request.** Mounting with `app.use()` puts that function on the critical path of every route, health checks included. A middleware awaiting a slow third-party API adds its latency to the whole API's p99; one doing heavy synchronous work (big JSON transforms, crypto) blocks the event loop for all concurrent requests. Scope expensive middleware to the routers that actually need it and keep the global layer to cheap, universal concerns: parsing, correlation IDs, top-level logging.

## 7. Compare With Related Concepts

**Middleware vs route handler.** Mechanically identical — same `(req, res, next)` signature, same ordered list. The difference is intent: middleware does cross-cutting work and passes control along, while a handler is the terminal step that sends the response and doesn't call `next()`. Rule: if code should run for many routes, make it middleware; if it answers one route, make it a handler.

**Application-level vs router-level middleware.** Both are the same mechanism; they differ in scope. `app.use(...)` applies to every request entering the app, while middleware attached to an `express.Router()` only applies to paths mounted under that router. Rule: universal concerns (parsing, logging) go application-level; section-specific concerns (auth on `/orders`) go router-level so the rest of the API never pays for them.

**`next()` vs responding.** These are the two exits from any middleware, and exactly one must happen per request. `next()` delegates the response to someone downstream; writing to `res` ends the cycle immediately. Rule: decide at the top of each middleware which exit it owns, and use early `return`s so no path can take both or neither.

**Express's linear chain vs Koa's onion model.** In Express, control flows strictly forward: each middleware runs once, top to bottom, and there's no built-in way to run code *after* the downstream handler finishes (you'd hack it around the `finish` event on `res`). Koa composes middleware like nested layers — code after `await next()` runs on the way back out, which makes response-timing logs and post-processing natural. Rule: Express is a one-way relay; if you need true before-and-after wrapping in Express, wrap explicitly or reach for the `res.on('finish', ...)` pattern.

**Express middleware vs FastAPI dependencies.** Same goal — reusable logic around handlers — different plumbing. FastAPI dependencies are declared per-route as function parameters, can return values injected into the handler, and participate in OpenAPI generation. Express middleware attaches to `req` by convention and is scoped by registration order and mount path. Rule: in interviews, frame them as the same pipeline idea wearing each framework's idioms — declaration-based in FastAPI, order-of-registration-based in Express.

## 8. 🧠 The Memory Hook

A request walks a line of airport checkpoints. Each officer — your middleware function — gets the passenger (`req`) and the radio (`res`) and has three moves: wave them through with `next()`, turn them away with a response, or escalate with `next(err)`. Pick exactly one: do nothing and the passenger stands there forever; act twice and the tower screams that the plane already left.
