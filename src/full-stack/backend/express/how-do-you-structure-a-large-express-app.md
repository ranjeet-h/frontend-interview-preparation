# How do you structure a large Express app

## 1. The Real-World Problem — When You Actually Hit This

Your team built an Express API three years ago. It started as five endpoints in one file, which was fine. Today it has forty-plus endpoints, and the pricing logic lives in three different places: the checkout route calculates the total one way, the quote endpoint calculates it slightly differently, and the admin refund route re-implements parts of both. Last quarter someone fixed a coupon bug in checkout and nobody knew the quote endpoint had the same bug. Marketing sent an email promising a price the checkout would never honor. Support spent a week apologizing.

Then a new hire gets asked to add an "export my orders" feature. She reads the checkout route to learn how prices work and finds 200 lines mixing query params, business rules, database queries, and JSON shaping. To test whether her change broke pricing, she has to boot the whole server, connect a real MongoDB, seed users and orders, and fire HTTP requests at it — because the pricing math has never existed anywhere except inside HTTP handlers.

And then the quiet disaster: an audit finds `process.env.JWT_SECRET` being read in fourteen different files, one of which falls back to a hardcoded string when the variable is missing. Staging booted without the variable last month. Nobody noticed, because the app happily started anyway — and for two weeks, anyone who knew the fallback could mint valid login tokens.

None of these are Express bugs. They are structure bugs. This page is about the shape of the app that makes them impossible by construction.

## 2. The Analogy — Make the Mechanic Obvious

Picture a busy auto repair shop.

A car rolls in off the street. Before anything else, it passes an intake checklist that applies to every vehicle: photos taken, license plate logged, keys tagged. That intake is your global middleware — body parsing, logging, request IDs. Nobody skips it, no matter which bay they're headed to.

At the counter sits the service advisor. The customer says "it makes a grinding noise when I brake." The advisor's job is translation: turn human words into a precise written work order — "inspect front brake pads, measure rotor thickness, replace if below spec." The advisor does not pick up a wrench. Ever. Their entire skill is understanding the customer side and writing clear orders.

The work order goes to a mechanic in a bay. The mechanic does the actual work — measuring, machining, deciding how to fix the problem — using expertise that has nothing to do with customers or paperwork. When the job needs parts, the mechanic sends a runner to the parts room, the one place in the building that knows the inventory. Mechanics don't wander the aisles of other shops borrowing inventory, and they never take phone calls from customers mid-job.

Finished work travels back up the same path: mechanic signs the work order, the advisor takes the keys out front and explains the fix in customer language again. The customer never talks to the mechanic directly, and the mechanic never has to learn how to answer a phone.

Two more shop rules matter. First, the manager's binder: hours, supplier contacts, alarm codes — filled out and checked against a mandatory checklist once, at 8am, before the doors open. If any line is blank, the shop does not open. It does not open with guesses scribbled in. Second, hiring works because of these boundaries: you can evaluate a mechanic by handing them a written work order in an empty bay — no customer, no phone system, no counter needed. And if you ever switch phone systems or remodel the waiting room, not one wrench moves.

That shop is a well-structured Express app, part for part.

## 3. The Full Explanation — How It Actually Works

Map the shop onto the code. The intake checklist is app-level middleware (`express.json()`, CORS, request logging). The counter advisor is the **controller** — it speaks HTTP fluently: reads `req`, writes `res`, translates both directions. The mechanic in the bay is the **service** — plain functions holding the actual business rules: pricing, eligibility, orchestration. The parts room is the **model** layer — the only code that knows how data is stored and fetched. The manager's binder is the **config module** — environment variables read and validated once, at startup.

Now the single most important idea on this page: **dependencies point one way, downhill**.

Routes point at controllers. Controllers point at services. Services point at models. Nothing below the HTTP boundary knows Express exists — no `req`, no `res`, no `next()` in a service or model. If you remember only one sentence for your interview, remember that one. Everything good about a large app falls out of it.

Why does one-way flow matter so much? Because each layer changes for a *different reason*. The HTTP shape of your API changes when the frontend needs something — a field renamed, an endpoint versioned. Business rules change when the company changes its mind — coupons, taxes, refund windows. Storage changes when the data grows — new indexes, a moved collection. When each reason lives in its own layer, each kind of change touches one layer instead of rippling through everything. That duplicated-pricing bug from the intro is what happens when business rules have no dedicated home: the rule exists in three copies, and copies drift.

It also buys testability, exactly like evaluating a mechanic in an empty bay. A service is a plain function taking plain arguments and returning plain results, so a test calls it directly — no server, no port, no HTTP mocks. And reuse becomes trivial: the same `ordersService.createOrder(userId, items)` can sit behind a REST route today and a queue consumer or CLI command tomorrow, untouched.

So what physically lives where?

**Routes** are pure wiring. A route file maps URLs and methods to controllers and attaches middleware scoped to that domain — nothing else. The mechanics of splitting, mounting, prefixes, and `mergeParams` live on the [route-splitting page](./how-do-you-split-routes.md); here we only care that route files stay thin enough to read like a table of contents.

**Controllers** own four verbs: read the request (params, body, the user that auth middleware attached), call one service, shape the response, and get errors to the error pipeline. A good controller is boring. If you can read one aloud and it sounds like "take the user from the token, hand the items to the service, return 201 with the result," it's right. Any `if` that encodes a *business* decision is a smell — that decision belongs downhill.

**Services** hold decisions: totals, state transitions, permission checks that need data, multi-step operations. They accept and return plain JavaScript values. They may import models and other services. They may never import Express, controllers, or routes — that's what keeps gravity pointing down.

**Models** own persistence: schemas, queries, indexes. With Mongoose this is the schema files; with SQL it's whatever wraps the pooled connection. Deeper mechanics live on the [connection-pooling page](../performance/how-do-you-use-connection-pooling.md) — structurally, all you need here is that models are the only layer that touches the driver.

Around these four sit two supporting pieces. **Middleware** holds cross-cutting concerns — auth, validation, rate limiting, and the final error handler whose four-argument contract is explained on the [error-handling middleware page](./what-is-error-handling-middleware.md). Middleware differs from controllers in scope: it runs for many requests and usually doesn't produce a response body; controllers serve exactly one endpoint and always do.

And **config** is one module, not a habit. Every `process.env.X` read lives in `src/config`, gets checked against a list of required variables, and the app refuses to start if something essential is missing — the binder checklist. This is deliberately *fail closed*: a missing `JWT_SECRET` crashing boot is a five-minute annoyance; a missing `JWT_SECRET` silently falling back to a known string is a security incident. Freeze the exported object too, so nothing downstream mutates configuration at runtime. The Node-side mechanics of env vars are covered in [how-do-you-manage-environment-variables](../nodejs/how-do-you-manage-environment-variables.md).

Finally, split boot from build: `app.js` creates and wires the Express app and *exports* it; `server.js` loads config, connects the database, and listens. The reason is the empty-bay trick — a test can require `app.js` and drive the fully configured app through Supertest with no port and no database. It costs four lines of discipline and pays back every single day.

Where does this stop scaling, and where do people go too far? The honest ladder looks like this. Under roughly ten endpoints, flat files are genuinely fine — structure you don't need is just indirection. Past that, introduce the layers. When multiple teams own different domains, flip from layer-folders to feature-folders (`modules/orders/` containing its own routes/controller/service/model) so a team owns a directory instead of a stratum. What does *not* appear on this ladder at typical scale: an interface plus factory per service, six-layer "clean architecture" ceremonies, dependency-injection containers, or a repository class wrapping every model. Those solve problems of enormous codebases and dozens of engineers; bolted onto a normal app early, they bury every feature under five hops of indirection and convince the next developer that structure is overhead. Section 6 covers the specific over-engineering traps.

## 4. See It In Practice — Real Code or Queries

The layout first — every folder earns its existence by answering one question:

```txt
my-app/
  src/
    config/
      index.js               # every env var, validated once at startup
    routes/
      index.js               # mounts all routers - the whole URL map in one file
      orders.routes.js       # URL wiring only
      users.routes.js
    controllers/
      orders.controller.js   # HTTP in, service call, response out
    services/
      orders.service.js      # business rules - no Express anywhere in here
    models/
      order.model.js         # schemas and queries - the only DB-aware layer
    middleware/
      auth.js                # cross-cutting concerns
      validate.js
      errorHandler.js
    utils/
      asyncHandler.js
    app.js                   # builds and configures the app, exports it
    server.js                # connects the DB, then listens - the only entry point
  package.json
```

Config: one module, validated, frozen, failing closed.

```js
// src/config/index.js
// The ONLY file allowed to read process.env. Everyone else imports from here.
const required = ['PORT', 'MONGO_URI', 'JWT_SECRET'];

for (const name of required) {
  if (!process.env[name]) {
    // Fail closed: refuse to boot rather than run with a guessed value.
    // A missing JWT_SECRET must crash startup, not quietly weaken auth.
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

module.exports = Object.freeze({
  port: Number(process.env.PORT),
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  // A non-secret dev convenience is acceptable as a default; secrets never get one.
  nodeEnv: process.env.NODE_ENV || 'development',
});
```

The model — the only file that knows storage exists.

```js
// src/models/order.model.js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [{ sku: String, qty: Number, priceCents: Number }],
    status: { type: String, enum: ['PENDING', 'PAID', 'SHIPPED'], default: 'PENDING' },
    totalCents: { type: Number, required: true, min: 0 },
  },
  { timestamps: true } // adds createdAt/updatedAt, which the service sorts by
);

module.exports = mongoose.model('Order', orderSchema);
```

The service — notice what is *absent*: no express, no `req`, no `res`. Plain arguments in, plain promises out.

```js
// src/services/orders.service.js
const Order = require('../models/order.model');

async function createOrder(userId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    // Attach statusCode so the error middleware can map this to a 400
    // without the service knowing anything about HTTP responses.
    const err = new Error('An order needs at least one item');
    err.statusCode = 400;
    throw err;
  }

  // THE pricing rule. One home. Three endpoints calling this service
  // cannot disagree about the total, because there is one copy of the math.
  const totalCents = items.reduce((sum, item) => sum + item.qty * item.priceCents, 0);

  return Order.create({ userId, items, totalCents });
}

async function listOrdersForUser(userId) {
  return Order.find({ userId }).sort({ createdAt: -1 }).limit(50);
}

module.exports = { createOrder, listOrdersForUser };
```

The async wrapper — mandatory plumbing for Express 4, because an unwrapped rejection in a handler crashes the whole process instead of reaching your error middleware. (Express 5 forwards rejected handlers automatically; if your team pins Express 4, wrap.) The full failure anatomy is on the [async-errors page](./how-do-you-handle-async-errors-in-express.md).

```js
// src/utils/asyncHandler.js
// Calls your async handler and routes any rejection to next(err),
// so forgetting try/catch can never crash the process.
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

The controller — HTTP concerns only. Read it aloud; it should sound like the advisor writing a work order.

```js
// src/controllers/orders.controller.js
const asyncHandler = require('../utils/asyncHandler');
const ordersService = require('../services/orders.service');

exports.createOrder = asyncHandler(async (req, res) => {
  // req.userId was attached upstream by auth middleware - the controller
  // trusts the chain and never parses tokens itself.
  const order = await ordersService.createOrder(req.userId, req.body.items);
  res.status(201).json(order);
});

exports.listMyOrders = asyncHandler(async (req, res) => {
  const orders = await ordersService.listOrdersForUser(req.userId);
  res.json(orders);
});
```

Routes — a table of contents, nothing more.

```js
// src/routes/orders.routes.js
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/orders.controller');

const router = express.Router();

router.use(requireAuth); // every order route requires a logged-in user

router.post('/', controller.createOrder);
router.get('/mine', controller.listMyOrders);

module.exports = router;
```

```js
// src/routes/index.js - the entire public URL surface in one glanceable file
const express = require('express');
const apiRouter = express.Router();

apiRouter.use('/orders', require('./orders.routes'));
apiRouter.use('/users', require('./users.routes'));

module.exports = apiRouter;
```

Build vs boot. `app.js` never listens; `server.js` is the only thing that does.

```js
// src/app.js
// Builds the configured app and exports it WITHOUT listening.
// That separation is what lets tests drive the real app with no open port.
const express = require('express');
const apiRouter = require('./routes');
const errorHandler = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.use(express.json());  // global intake checks first...
  app.use('/api', apiRouter); // ...then the mounted API...

  app.use(errorHandler);    // ...four-argument error handler registered LAST

  return app;
}

module.exports = createApp;
```

```js
// src/server.js
// The only file that knows about dotenv, ports, and the database.
require('dotenv').config(); // local dev convenience; real platforms inject env vars

const mongoose = require('mongoose');
const config = require('./config');
const createApp = require('./app');

async function start() {
  await mongoose.connect(config.mongoUri); // connect ONCE, at startup

  const server = createApp().listen(config.port, () => {
    console.log(`API listening on port ${config.port}`);
  });

  const shutdown = async () => {
    await mongoose.disconnect();
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1); // the binder-checklist failure exits here
});
```

Minimal error handler so `app.js` is complete — the four-argument arity contract is [error-handling middleware's topic](./what-is-error-handling-middleware.md), shown here only in the context of structure.

```js
// src/middleware/errorHandler.js
// Exactly four parameters - arity is how Express recognizes error middleware,
// which is also why the unused next must stay.
function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;
  // Fail closed on information leakage: client mistakes (4xx) may carry their
  // message; unexpected server errors (5xx) stay vague so internals never leak.
  const message = status < 500 ? err.message : 'Something went wrong';
  res.status(status).json({ message });
}

module.exports = errorHandler;
```

The payoff — a mechanic evaluated in an empty bay. Pricing tested with zero HTTP, zero server, zero database:

```js
// test/orders.service.test.js
jest.mock('../src/models/order.model');

const Order = require('../src/models/order.model');
const service = require('../src/services/orders.service');

test('createOrder computes the total from items before saving', async () => {
  Order.create.mockResolvedValue({ id: 'o1' });

  await service.createOrder('u1', [
    { sku: 'A', qty: 2, priceCents: 500 },
    { sku: 'B', qty: 1, priceCents: 250 },
  ]);

  expect(Order.create).toHaveBeenCalledWith(
    expect.objectContaining({ totalCents: 1250 })
  );
});
```

That test ran in milliseconds because the business rule never depended on Express in the first place. Structure made it cheap.

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you structure a large Express application?**

Layered, with dependencies pointing one way. Routes wire URLs and scoped middleware to controllers; controllers translate HTTP to plain calls and back; services hold the business rules as framework-free functions; models own persistence; middleware handles cross-cutting concerns like auth and the final error handler. Config is a single module that validates every environment variable at startup and refuses to boot on gaps. `app.js` builds and exports the configured app; `server.js` alone connects the database and listens. The invariant that makes it all work: nothing below the controller layer imports Express — services take plain arguments and return plain results. That one-way flow means a pricing change, an API-shape change, and a storage change each touch exactly one layer, and services can be unit-tested with no server at all.

**Q: What is the difference between a controller and a service?**

Different languages for different audiences. A controller speaks HTTP: it reads `req.params`, `req.body`, and the identity auth middleware attached, calls exactly one service operation, and shapes the response — status codes, JSON envelope, cache headers. A service speaks business: given a user ID and some line items, what is the total, is this transition legal, which records change. Controllers depend on services; services depend on models; services never depend on controllers or on Express. The practical test I apply in review: if a function mentions `req` or `res`, it's a controller (or middleware); if it encodes a decision the business would recognize, it's a service. Mixing them means the pricing rule can only ever be exercised through an HTTP request — untestable in isolation and unusable from a worker or CLI.

**Q: How do you keep business logic independent of Express, and why bother?**

By making services plain modules: imported functions, ordinary arguments, ordinary returns — no `req`, no `res`, no `next`. When a service needs to signal a client error, it throws an error carrying a `statusCode` property; the controller layer's error middleware maps that to an HTTP response. So the service communicates outcomes without knowing a transport exists. Why bother: three concrete payoffs. Testing — call the function directly, no supertest, no seeding through endpoints. Reuse — the same service backs a REST route, a background job, and an import script. Longevity — Express versions and even frameworks change; your pricing rules shouldn't notice. The "bother" is one discipline rule enforced in code review, and it eliminates an entire class of drift bugs where two endpoints implement one rule differently.

**Q: How do you handle configuration across environments?**

One config module is the single reader of `process.env`. At import it checks the required variables and throws immediately if any are missing — fail closed, so a misconfigured deploy dies in seconds at boot instead of running degraded for weeks. The module exports a frozen object of typed, named values (`config.jwtSecret`, `config.port`), so typos surface as undefined-property errors at the config boundary rather than silent `undefined` flowing into a signature check. Locally, dotenv feeds `process.env`; in production the platform injects variables and dotenv is skipped. The anti-pattern this replaces: `process.env.JWT_SECRET || 'devsecret'` scattered across fourteen files — each fallback a place where staging or worse can boot with a guessable secret. Non-secret conveniences like `NODE_ENV` defaults are fine; secrets never get defaults.

**Q: How do you manage database connections in a structured app?**

Connect once at startup, in the boot layer — `server.js` — never per request. The connection (or the SQL pool) is created there and every model implicitly shares it; with Mongoose, `mongoose.connect` sets the singleton pool the models use; with SQL drivers you size and create the pool explicitly at boot. Creating sockets per request exhausts the database faster than any query problem — connection storms look identical to downtime from the DB's point of view. Startup also handles failure: if the database is unreachable, the process exits nonzero so the orchestrator restarts it with backoff rather than serving instant-500s. Shutdown closes things in reverse order — stop accepting requests, drain, disconnect. Pool sizing and exhaustion debugging are their own deep dive on the [connection-pooling page](../performance/how-do-you-use-connection-pooling.md).

**Q: Should I organize folders by layer or by feature?**

By layer until the team outgrows it, then by feature. Layer-first (`controllers/`, `services/`, `models/`) is simplest while one team owns the app — every HTTP file is together, and the dependency direction is visually obvious. Its weakness appears with multiple teams: every feature change touches three shared directories, so merge conflicts and ownership blur. Feature-first fixes that — `modules/orders/` contains that domain's routes, controller, service, and model, and a team owns the directory. The dependency rule survives the flip unchanged: inside a module, flow still goes routes → controller → service → model, and modules may import each other's services, never each other's internals. Interviewers asking this want the tradeoff stated, not a religion.

**Q: How does this structure change how you test the app?**

It gives you three cheap levels instead of one expensive one. Services unit-test as pure functions with mocked models — milliseconds, no server, which is exactly why business logic lives there. Routers and controllers integration-test through Supertest against the exported `app.js`: real middleware chain, real routing, mocked or in-memory data, still no port. A thin slice of end-to-end tests exercises the booted `server.js` against a real database to prove wiring — env loading, connection, listen. Without the structure, every test is level three: boot everything, seed everything, hit HTTP, hope. That cost is why unstructured apps quietly end up untested. Details of the levels themselves are on the [Express API testing page](./how-do-you-test-express-apis.md).

**Q: What belongs in app.js versus server.js, and why split them?**

`app.js` answers "what is this API?" — middleware order, mounted routers, the error handler — and exports the app without listening. `server.js` answers "how does it run?" — load config, connect the database, listen on the port, handle shutdown signals. The split exists so tests can require the fully configured app and drive it over Supertest's mock transport: real stack, no network, no database unless the test wants one. Secondary benefits fall out for free: the same `createApp` can serve HTTP and be composed behind a parent app or mounted in another service; and boot-time concerns can't leak into request handling. If `.listen()` lives in `app.js`, every test either opens real ports or bypasses your middleware — both wrong.

**Q: When does a large Express app need dependency injection?**

Later than most tutorials imply. The common cases are covered by Node's own mechanisms: requiring a module gives you a singleton; Jest's `jest.mock` substitutes dependencies in tests; passing a service into a factory function covers the rare case where you genuinely need two instances. Reach for constructor-style injection when you have a real requirement: swapping implementations per environment (two payment providers), parallel instantiations (multi-tenant embedding), or a plugin ecosystem third parties extend. Until one of those hurts, a DI container adds a resolution layer that hides your dependency graph from grep and confuses newcomers — indirection purchased without a problem. Saying "I'd add it when a concrete swapping requirement appears, not before" is a stronger senior answer than reciting a framework.

## 6. The Traps — What Goes Wrong in Production

**Business logic in controllers.** The trap from the intro, worth dissecting because it's invisible while it forms. Someone puts a ten-line total calculation in the checkout controller. Months later the quote endpoint needs the same math, and copying feels cheaper than refactoring — now the rule has two homes. The coupon fix lands in one copy; the other keeps charging wrong amounts. Nothing errors, tests pass, the difference only shows on invoices. People make this move because controllers feel like "where the code goes" when a feature arrives. The structural fix is the rule itself: any decision the business would recognize gets a named home in a service, and controllers shrink to translation. Then the rule has one address, and "where is pricing calculated?" has a one-file answer.

**Services that know about HTTP.** The mirror-image trap: someone passes `req` into a service "just to read the user ID," then uses `res.json` deep inside it to shortcut a response. Now that business rule is welded to Express and to one request's lifetime — you cannot call it from a job, cannot unit-test it without fabricating request objects, and refactoring it means touching HTTP plumbing. The tell-tale in review is the import: if `services/something.js` contains `require('express')` or touches `req`/`res`, the dependency direction has inverted. Fix by pushing transport details back to the controller: pass `userId` as an argument, return values, let callers decide presentation.

**Fail-open configuration.** `process.env.JWT_SECRET || 'devfallback'` boots everywhere, forever, silently. The failure sequence is always the same: an environment (staging first, eventually production) misses the variable, the fallback activates, the app works perfectly — and authentication is now forgeable by anyone who read the source. The same pattern guards admin lists and webhook secrets. The rule is mechanical: required variables are asserted at startup and absence kills the process; only genuinely optional, non-security-relevant settings get defaults. Centralize the assertion in one config module so the guarantee holds app-wide instead of depending on every developer remembering.

**Unwrapped awaits in Express 4 handlers.** An `async` handler whose `await` rejects produces an unhandled promise rejection — Express 4 never sees it. Depending on your Node version you get either a hung request (client waits until timeout) or the entire process dying and every concurrent user's request dying with it. This is why the `asyncHandler` wrapper (or blanket try/catch → `next(err)`) is non-negotiable plumbing in every controller on Express 4. Express 5 forwards rejected handlers to the error pipeline automatically — if you're pinned to 4, wrap. The mechanism, including why sync throws behave differently from async rejects, is worked through on the [async-errors page](./how-do-you-handle-async-errors-in-express.md).

**Over-engineering: structure as cosplay.** The failure mode on the other side. Symptoms: a `repositories/` interface layer wrapping Mongoose models that are already data-access abstractions; a factories-and-container setup resolving twelve singletons; six architectural layers for a CRUD app where every request passes through classes that forward to the next class. Each addition was justified by "scalability" — none addressed an actual constraint. The costs are real and daily: every feature touches five files instead of two, newcomers trace three hops of forwarding to find one line of logic, and the dependency graph hides behind a container where grep can't follow it. The honest trigger points: introduce repositories when storage genuinely swaps or doubles; introduce DI when implementations swap per environment; introduce feature modules when a second team feels the layer-folder conflicts. Not before.

**Per-request connections.** A handler (or worse, a helper called per item) runs `mongoose.connect()` or opens a fresh SQL client "to be safe." Under low traffic nothing breaks. Under load, each concurrent request consumes a database socket — pools exhaust, the database hits its connection ceiling, and the app spends its time negotiating connections instead of serving. Connections are infrastructure, created once at boot and shared; the fix is structural — boot layer owns the connection, models assume it exists — plus a startup-failure policy so a dead database stops the deploy instead of producing thousands of failed requests.

## 7. Compare With Related Concepts

**Layered architecture vs MVC.** MVC is a UI-era pattern — Model, View, Controller — where the View renders output. APIs have no view; JSON shaping is the controller's job. Express apps described as "MVC" are really the layered structure on this page wearing MVC vocabulary: models persist, controllers translate HTTP, services hold rules, and the "view" is `res.json`. Say "layered architecture" and describe the dependency direction — it signals you've built real APIs, not followed a tutorial's folder names.

**Organizing by layer vs by feature.** Layer-first groups files by what they *are* (all controllers together); feature-first groups by what they *change with* (everything about orders together). Layer-first wins for clarity while one team owns everything; feature-first wins when multiple teams ship concurrently, because a change touches one owned directory. The dependency rule is identical under both. Rule of thumb: start layered, flip to features at team boundaries.

**Modular monolith vs microservices.** A well-layered monolith with feature modules already gives you the real benefits people chase with microservices — isolated domains, independent testability, clear ownership — without network calls, distributed transactions, or deployment orchestration. Splitting into services is justified by organizational scale (teams blocked deploying together) or wildly divergent scaling profiles, not by file counts. The strong senior move: keep the modular monolith until a *specific* boundary demands extraction, then lift out a module whose dependencies already point one way.

**Middleware vs controllers.** Both are `(req, res, next)` functions on the same chain, but they answer different questions. Middleware answers "what applies to many requests?" — parsing, auth, rate limits — and usually passes control along without producing a body. A controller answers "what does this one endpoint return?" and always ends the chain. Error-handling middleware is a special fourth-arity species with its own contract, covered on the [error-handling middleware page](./what-is-error-handling-middleware.md). Rule of thumb: logic reusable across endpoints becomes middleware; endpoint-specific translation stays in the controller.

**Service layer vs repository pattern.** Different altitudes. A service decides *what an operation means* (totals, permissions, orchestration); a repository abstracts *how rows come and go* (queries hidden behind `findById`, `saveFor`). Repositories earn their keep when storage swaps or when complex query construction repeats; for a typical Mongoose app the model already plays that role, and adding repositories is a wrapper around a wrapper. Rule of thumb: always have services; add repositories only when a concrete storage-boundary problem appears.

## 8. 🧠 The Memory Hook

A large Express app is an auto repair shop: the advisor at the counter never picks up a wrench, and the wrench never answers the phone. Requests flow strictly downhill — routes → controllers → services → models — and if any file below the controller layer knows what `req` is, the shop's org chart is broken; meanwhile the binder gets checked once at 8am, and if a line is blank, the doors do not open.
