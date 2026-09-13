# How do you split routes

## 1. The Real-World Problem — When You Actually Hit This

Your Express app starts small. Five endpoints in `app.js`. Life is good.

Eight months later, `app.js` is 2000 lines long. Every route for every feature lives there: users, orders, payments, admin reports, webhooks. Three teams are editing the same file, so every PR has merge conflicts. Nobody can answer "where is the code for the orders API?" without scrolling and searching. Worse, someone added an auth middleware "just for admin routes" but attached it with `app.use()`, so now it silently runs on every single request — including your public health check that your load balancer pings, which now fails because the balancer doesn't send auth headers.

This is the exact moment you need to split routes. Not for tidiness — because one flat list of routes cannot scale past a few hundred lines without hurting correctness, testing, and team speed. Express gives you a first-class tool for this: `express.Router()`.

## 2. The Analogy — Make the Mechanic Obvious

Think of your Express app as an office building, and think of a router as one department on one floor.

The building has a reception desk at the entrance. Everyone passes through it. That reception is your app-level middleware — `express.json()`, CORS, logging. It applies to every visitor no matter where they're going.

Each department sits on its own floor. To reach the Users department, you take the elevator and get off at "Floor 3". The floor number is your mount prefix — `app.use('/api/users', usersRouter)`. Notice something important: once you step out of the elevator, every room number inside that floor is *relative to the floor*. Room 104 on Floor 3 isn't "Floor 3, Room 104" written on the door — the door just says "104". Inside a router, route paths work the same way: they are relative to where the router was plugged in.

Now, each department also has its own front desk just off the elevator. Anyone visiting this department gets checked there, and only there. That's router-level middleware — `router.use(requireAuth)`. Visitors to other floors never pass through it. This scoping is the whole superpower of routers.

Some departments have sub-teams down internal corridors. The Orders sub-team inside the Users department is a nested router — a router mounted on another router. And here's the badge rule: when you walk from the department into the sub-team corridor, you either carry your visitor badge (which says who you came to see) or you don't. Carrying the badge is `mergeParams: true`. Without it, the sub-team has no idea which user you originally asked about, because the context was left at the corridor door.

Every mechanic in this analogy maps to real code: reception = app middleware, floor number = mount prefix, room numbers relative to floor = route paths relative to mount point, department front desk = `router.use`, sub-team corridors = nested routers, the badge = `mergeParams`.

## 3. The Full Explanation — How It Actually Works

`express.Router()` returns a complete, isolated mini routing system. It has the same methods as your app: `.get()`, `.post()`, `.put()`, `.delete()`, `.use()`, even `.param()`. What it doesn't have is `.listen()` — a router never accepts connections itself. It exists to be plugged into something that does.

Here's the mental shift: **the app and each router each hold their own ordered list of middleware and routes.** When a request arrives, Express walks the app's list from top to bottom. Global middleware runs first, in registration order. When the walk reaches a line like `app.use('/api/users', usersRouter)`, Express checks whether the URL starts with `/api/users` (on path-segment boundaries, so `/api/users` and `/api/users/42` match, but `/api/usersx` does not). If it matches, the router takes over and walks *its own* list, using whatever is left of the URL after stripping the mount prefix.

That last sentence explains almost every interview question about route splitting, so let's slow down on it:

**Path math.** The final URL is mount path + route path. Mount at `/api/users`, define `router.get('/:id')` → the real endpoint is `/api/users/:id`. Define `router.get('/')` → it serves `/api/users` itself. Inside the router, handlers see `req.url` with the prefix already stripped, and `req.path` likewise — which is why tests against a bare router use `/` instead of `/api/users`.

**Middleware scoping.** You get three scopes, and picking the right one is most of the design work. App-level (`app.use(...)`) runs for every request — put body parsing, CORS, and request logging here. Router-level (`router.use(...)`) runs only for requests that entered that router — put domain auth here, like "all user routes require a session". Route-level (a handler passed between the path and the final handler) runs for exactly one route — put validation here, like "this POST needs a valid email".

**Order matters twice.** Across mounts: `app.use('/api', apiRouter)` registered before `app.use('/api/admin', adminRouter)` will swallow admin requests first, because the walk stops at the first match that responds. Within a router: `router.get('/me')` must be registered before `router.get('/:id')`, or a request to `/users/me` matches `:id` with the value `"me"`.

**Nesting and parameters.** A router can mount another router, which is how you build URLs like `/api/users/:userId/orders`. Each matched parameter gets collected into `req.params` as the request descends through the layers. But by default, a child router receives a *fresh* params object containing only the parameters matched in its own mount path and routes. Create the child with `express.Router({ mergeParams: true })` and the parent's `:userId` flows into the child's `req.params` too.

**What you gain and what you pay.** You gain isolation: each file owns one domain, teams stop colliding, middleware intent becomes explicit, and each router can be tested without booting the whole app. You pay a little indirection — to know the real URL of a handler you have to look at two places instead of one, and a misconfigured mount produces confusing 404s. For anything beyond a toy service, that trade is lopsided in favor of splitting. The failure mode to avoid is the opposite extreme: a router per single route, or five levels of nesting, which just moves the confusion around. One router per resource or feature area is the sweet spot.

## 4. See It In Practice — Real Code or Queries

First, the disease. This is the shape that hurts at scale — everything stacked in one file:

```js
// app.js — BEFORE: works at 100 lines, dies at 2000
const express = require('express');
const app = express();

app.use(express.json());

app.get('/api/users', listUsers);
app.get('/api/users/:id', getUser);
app.post('/api/orders', createOrder);
app.get('/api/orders/:id', getOrder);
app.post('/api/payments', createPayment);
// ...1900 more lines, mixed with middleware and business logic

function listUsers(req, res) { res.json([]) }
function getUser(req, res) { res.json({}) }
function createOrder(req, res) { res.json({}) }
function getOrder(req, res) { res.json({}) }
function createPayment(req, res) { res.json({}) }

app.listen(3000);
```

Now the fix. One file per domain, each exporting a plain router. Note the paths inside are *relative* — no `/api/users` anywhere:

```js
// routes/users.router.js
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { validateCreateUser } = require('../middleware/validateUser');
const usersService = require('../services/users');

const router = express.Router();

// Router-scoped middleware: runs ONLY for requests that reached this router,
// so we don't force auth onto health checks or public marketing endpoints.
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    // Serves GET /api/users (mount prefix + '/')
    const users = await usersService.list(req.query);
    res.json(users);
  } catch (err) {
    next(err); // forward to the central error handler, never crash the process here
  }
});

// Must be registered BEFORE '/:id', otherwise "me" gets captured as an id
router.get('/me', async (req, res, next) => {
  try {
    res.json(await usersService.getById(req.user.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const user = await usersService.getById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// Route-scoped middleware: validation runs for this POST only
router.post('/', validateCreateUser, async (req, res, next) => {
  try {
    const created = await usersService.create(req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

A nested router showing `mergeParams`. The goal: `GET /api/users/:userId/orders`.

```js
// routes/userOrders.router.js
const express = require('express');

// mergeParams: true is REQUIRED to see :userId matched by the parent mount below.
// Without it, req.params here would be {} and userId would be undefined.
const router = express.Router({ mergeParams: true });
const ordersService = require('../services/orders');

router.get('/', async (req, res, next) => {
  try {
    const { userId } = req.params;
    res.json(await ordersService.listForUser(userId));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

```js
// routes/users.router.js (addition at the bottom)
const userOrdersRouter = require('./userOrders.router');

// Mounted INSIDE the users router, so the full path is
//   '/api/users' + '/:userId/orders' + '/'
router.use('/:userId/orders', userOrdersRouter);
```

And the app file shrinks back to what it should always have been — wiring, not features:

```js
// app.js — AFTER: readable wiring plus global cross-cutting concerns
const express = require('express');
const app = express();

// App-level middleware: everyone passes reception
app.use(express.json());

// Mount routers at prefixes. Specific prefixes should come before generic ones.
app.use('/api/users', require('./routes/users.router'));
app.use('/api/orders', require('./routes/orders.router'));

// 404 for anything no router claimed — placed AFTER all mounts
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler: signature order matters (err, req, res, next)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;

// server.js stays a separate entry point so tests can import app without listening
// const app = require('./app');
// app.listen(3000);
```

Finally, the payoff for testing. Supertest accepts any request handler, and a router is one:

```js
// __tests__/users.router.test.js
const request = require('supertest');
const usersRouter = require('../src/routes/users.router');
const app = require('../src/app');

test('bare-router test: fast, no full app boot', async () => {
  // Paths here are relative to the router root — '/' not '/api/users'
  const res = await request(usersRouter).get('/');
  expect(res.status).toBe(200);
});

test('integration test: full app, real prefixes and global middleware', async () => {
  // Here the mount prefix applies, so the path IS '/api/users'
  await request(app).get('/api/users').expect(200);
});
```

One subtlety visible right in those two tests: `express.json()` was attached to the app, not the router. A bare-router test that posts JSON won't have `req.body` populated unless the test attaches a JSON parser too. Isolation has that cost — you opt into whichever middleware you want under test.

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you split routes in Express?**

By feature, using `express.Router()`. Each domain — users, orders, payments — gets its own file that creates a router, defines all of that domain's routes and router-scoped middleware, and exports it. The main app file imports each router and mounts it at a prefix with `app.use('/api/users', usersRouter)`. Cross-cutting concerns (JSON parsing, CORS, logging) stay at the app level; domain concerns (auth for user routes) go on the router; per-request rules (validation for one endpoint) go on the individual route. The result is that adding a feature touches one new file plus one mounting line, instead of one shared 2000-line file.

**Q: What is express.Router() and how does it work?**

It creates a complete, standalone routing layer — essentially a mini Express app without `.listen()`. Internally it maintains its own ordered stack of middleware and route handlers, exactly like the app does. When you mount it with `app.use(prefix, router)` and a request's path matches that prefix (at segment boundaries), the router takes over: it strips the prefix from the URL and walks its own stack against the remainder. Because it's a real handler function, it can be mounted anywhere an app could use one — on the app, on another router, even handed directly to Supertest in tests.

**Q: If I mount a router at /api/users and define router.get('/:id'), what URL does that handle?**

`GET /api/users/:id` — the final path is the mount prefix plus the route path. This trips people constantly in both directions: they define `router.get('/api/users/:id')` *and* mount at `/api/users`, producing the absurd real path `/api/users/api/users/:id`; or they define `router.get('/users/:id')` expecting it to be absolute. Inside a router, every path is relative to the mount point. Say that sentence in the interview and you've answered the underlying question they're really asking.

**Q: How do you organize routes across multiple files?**

A `routes/` directory with one file per resource, each exporting a router. For larger apps, group by area: `routes/admin/`, `routes/public/`, each with its own index that mounts its children. Two rules keep it healthy. First, routers import services/controllers — never the app instance — so you don't create circular dependencies. Second, mounting happens in exactly one place (usually `app.js` or a `routes/index.js`), so anyone can read the whole URL map of the API in ten lines. Some teams add a `routes/index.js` that gathers all routers so `app.js` has a single `app.use('/api', apiRouter)` line; that's fine as long as specific prefixes are still registered before generic ones.

**Q: How does middleware scoping work when routes are split?**

Three levels, chosen by who needs it. App-level via `app.use()` runs for every request — body parsing, CORS, request IDs. Router-level via `router.use()` runs only for requests that matched that router's mount prefix — domain auth, feature-wide rate limits. Route-level — middleware passed inline like `router.post('/', validateUser, handler)` — runs for one endpoint. The common production bug is scope leakage in either direction: auth attached at the app level "for admin routes" ends up blocking your health check, while auth intended globally gets attached to one router and some endpoints go out unprotected. Scoping is the actual reason routers exist; the file organization is a side benefit.

**Q: Why is splitting routes good for testing, and how do you test one router alone?**

Because a router is a self-contained handler function, Supertest can drive it directly: `request(usersRouter).get('/')`. No port, no server boot, no unrelated middleware — fast, focused unit tests where you can inject fake services easily. Keep integration tests that hit the fully assembled app too, because isolation hides two classes of bugs: conflicts between routers (two mounts fighting over the same prefix) and missing global middleware (the classic one being `req.body` undefined in a bare-router test because `express.json()` lives on the app).

**Q: What does mergeParams: true do, and when does it bite you?**

When routers nest, each level normally gets a fresh `req.params` containing only its own matches. So in `app.use('/api/users/:userId', userOrdersRouter)`, the child router handling `/orders/:orderId` sees `{ orderId }` — the `userId` is gone unless the child was created with `express.Router({ mergeParams: true })`, which merges ancestor params into its own. It bites in a sneaky way: nothing errors. The route works, the response is just wrong — queries filter by `undefined` and return everything or nothing. Any time you mount a router under a path containing a parameter, say the option name out loud in code review.

**Q: Does the order of mounting matter?**

Yes, twice over. Between mounts, Express walks registrations top-down, so `app.use('/api', ...)` before `app.use('/api/admin', ...)` means admin requests never reach the admin router — the generic mount answers first. Inside a router it's the same walk: register `router.get('/users/me')` before `router.get('/users/:id')`, or "me" becomes an id and your lookup fails with a cast error or a 404. Rule of thumb: most specific first, catch-alls last — and put your final 404 and error handlers after every mount.

## 6. The Traps — What Goes Wrong in Production

**The double prefix.** The most common split-routes bug. Someone mounts `app.use('/api/users', usersRouter)` and then writes full paths inside the router: `router.get('/api/users/:id')`. The real URL is now `/api/users/api/users/:id`. Nothing crashes; the frontend just gets 404s, and debugging is miserable because the code "clearly" defines the right path. The rule: mount path lives in exactly one place — the `app.use` line — and route files contain only relative paths. Fixing it after the fact usually means updating the frontend's base URL too, since the accidental long paths were sometimes already in production.

**Missing mergeParams in nested routers.** Described above, worth restating as a pattern: it fails silently. The nested route returns 200 with empty data, or worse, `listForUser(undefined)` returns *every* row in the table — a data-leak bug wearing a correctness costume. Whenever a mount path contains `:something`, the immediate child router needs `{ mergeParams: true }` if it reads that param.

**Route-order capture.** `/:id` registered before `/me` turns `GET /users/me` into a database lookup for the string `"me"`. With Mongoose that's a CastError; with Postgres it's a 404 or worse, a row that happens to exist. Always define static segments before dynamic ones in the same router.

**Scope leakage of middleware.** Auth on the app level when it was meant for one domain blocks health checks and public endpoints — your orchestrator or uptime monitor suddenly sees 401s and restarts healthy instances. The inverse is scarier: an admin router relies on `requireAdmin` that was attached at the app level during a refactor cleanup, and now every admin endpoint is public. After any middleware move, grep for the old attachment and test one protected and one public endpoint per router.

**Testing a bare router and trusting the green checkmark.** The isolated test passes, then integration fails in staging: the bare router never had `express.json()`, helmet, or the tenant middleware that the app provides. Isolation tests prove the router's logic; only the assembled-app tests prove the contract. Keep both, and when a bare-router test needs body parsing, attach `express.json()` in the test setup explicitly so the dependency is visible.

**Circular imports.** A route file does `require('../app')` to reach a helper or to add one more route, while `app.js` requires that route file. Node hands one side a half-finished export, and you get `undefined is not a function` at startup or subtly dead routes. Routers should receive everything they need through their own imports of services and middleware; the app imports routers, never the reverse.

## 7. Compare With Related Concepts

**Router vs the app itself.** Same API surface — verbs, `use`, `param` — different role. The app is the process edge: it listens on a port and owns truly global concerns. A router is an internal organizer: no listening, scoped middleware, relative paths. One-line rule: if it should apply to literally every request, app-level; if only to one feature, a router.

**Splitting by feature vs splitting by verb or file-per-route.** Organizing files as `get-users.js`, `post-users.js` fragments one cohesive operation across many files and makes middleware scoping awkward — where does "auth for all user routes" live? Feature-first (one users router owning its CRUD) keeps related behavior together. One-line rule: one router per resource or bounded feature, not per HTTP method.

**App-level vs router-level middleware.** They're the same mechanism at different points of the walk. The difference is purely positional: middleware registered on the app runs for everyone; middleware registered on a router runs only for traffic routed through it. Choose by blast radius — parsing affects everyone, "orders require a subscription" affects one router.

**Routers vs controllers/services.** Express has no controller concept — a router is just where HTTP meets functions. Mature apps treat the router as a thin translation layer (parse request, call service, shape response) and push business rules into a service layer the router imports. That separation is why routers stay testable: swap the service, not the HTTP plumbing. One-line rule: routers decide *how requests map to operations*; services decide *what the operations do*.

**Mounting a router vs string-concatenating paths.** You could skip routers and hand-write `app.get('/api/orders/:id', ...)`, but you lose scoped middleware, standalone testability, and the ability to move or version a whole API by changing one mount line (`/api/v1` → `/api/v2`). Manual prefixes scale linearly with pain.

## 8. 🧠 The Memory Hook

A router is a full mini-app that never listens — it waits to be plugged into a path, and once plugged in, everything inside it is relative to that plug point: paths, middleware, even its params. Remember the office building: reception checks everyone, the floor number comes off in the elevator, and the sub-team only knows who sent you if you carry the badge — `mergeParams: true`.
