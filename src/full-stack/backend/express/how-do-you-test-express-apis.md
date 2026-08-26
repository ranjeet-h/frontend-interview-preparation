# How do you test Express APIs

## 1. The Real-World Problem — When You Actually Hit This

You shipped a small Express service. Users can sign up, log in, and list their orders. You clicked through it with curl and Postman, everything looked fine, you deployed on Friday.

Monday brings two surprises. First, someone added a validation rule that rejects orders with a negative quantity, but a frontend change started sending quantity as a string and the rule silently stopped working. No test caught it because there was no test for bad input. Second, a refactor moved the auth check one line down and for one endpoint it stopped running before the handler. For six hours any logged-in user could fetch anyone else's orders. Again, no test caught it because the only tests you had spun up a real server on port 3001, sometimes failed with EADDRINUSE in CI, and were disabled as flaky.

Then you tried to add tests after the fact and the database fought you. Test one creates a user called Alice. Test two also creates Alice, now the unique-index fails. Test three reads from the database and sometimes sees leftovers from test one, sometimes not. You start adding `await sleep(200)` to fix timing and now CI takes four minutes.

This is the moment you actually need a testing strategy. You need a way to hit your Express app without binding a real port, to decide what should be real and what should be faked, to prove auth works for the right token and fails for the wrong one, to verify errors never leak stack traces, and to keep every test isolated so the order they run does not change the outcome. That is what testing Express APIs is really about.

## 2. The Analogy — Make the Mechanic Obvious

Think of your Express app as a pro football team's preseason training camp.

The `app` object exported from `app.js` is the entire training complex built and ready: the practice field is lined, the playbook is installed, the coaching staff is in place, and the play clock hangs above the field. Everything works, but the stadium gates are still locked and no tickets have been sold. Calling `app.listen` is unlocking those gates and opening the stadium on a real street address and port so fans can pour in. A training camp scrimmage is more useful for testing than opening day precisely because you do not need a sold-out stadium to run it.

Supertest is the scrimmage coordinator who runs the playbook without opening the gates. He does not sell tickets, he does not start a public bus route to the stadium, and he does not need the city traffic network at all. He places the ball directly on the line of scrimmage, the offense and defense run the assigned play top to bottom, and he reads back exactly what the scoreboard would have shown to the stands. No gate conflicts, no leftover crowd traffic, and the play runs at the speed of the players alone. That is `request(app).get(...)`.

Unit tests are one position group drilling alone on an empty half-field. You want to know if the quarterback can hit the out route under pressure, so you replace the defense with tackling dummies that stay exactly where you put them. That dummy is a mock. `jest.spyOn(userService, 'findById').mockResolvedValue(fakeUser)` is you placing the dummy at five yards and telling the return crew exactly what to throw back so you can test the quarterback's footwork alone, fast, with no full field needed.

Integration tests are the full-squad live scrimmage on the real field. Eleven on eleven, refs in stripes, the play clock running, and the turf either real grass or the closest replica you can grow without tearing up the game-day stadium. That is supertest driving the real middleware, real routes, the real play clock and penalty flags, and either dummy tacklers you positioned on purpose or a fresh sod field that behaves like game day (`mongodb-memory-server`) for the plays where footing actually decides the outcome. You run it because a perfect quarterback drill does not prove the left tackle picked up the blitz.

The dummy versus real turf choice maps directly to mocking services versus using a memory DB. Dummies are cheap, repeatable, and let you force one exact look: third and long every time, defense always blitzing. Real replica turf is heavier to lay and water, but it catches what dummies never will: a receiver slipping on a bad patch, a bad snap caused by wet sod, a route that fails because the field was painted wrong. If you only use dummies, you will miss ground-truth errors. If you only use replica turf, every drill takes an hour to prepare. Use dummies when you care about the call on the scoreboard, use replica turf when the route and the footing are the point.

Auth in camp is the sideline credential check before anyone steps onto the field. You do not issue real season passes that expire at midnight and require the league office. You hand the gate guard a laminated practice badge that looks real enough to test the checkpoint. Sometimes you mock `jwt.verify` to tell the guard this badge is valid for Alice the starting safety who wears the green dot, sometimes you print a real badge with the same test-office stamp the real guard reads and let the actual scanner decide. Both work if you control the badge stock, neither works if you depend on a pass you laminated last month that has already expired.

Test isolation is the field crew raking the turf between reps. If Rep 1 leaves a tackling sled on the 30 and tears up the near hash, Rep 2 starting on a clean sheet will fail because a sled is in the way, not because the play is wrong. You rake every divot, reset every cone, and put the ball back on the 25 before the next whistle. In code that is `beforeEach` clearing the collections, or wrapping each test in a transaction you roll back, or giving each test file its own freshly built app and freshly sodded database.

## 3. The Full Explanation — How It Actually Works

Start with the one architectural decision that unlocks everything else. Do not call `listen` in the file that defines your app. Define `app` in `app.js` and export it. Start the process in a different file, `server.js`, that imports `app` and calls `app.listen`. Sorting this out means tests can import `app` and never touch the network. Supertest takes that `app` function and injects a fake request straight into the Express stack, no socket, no port, no DNS. What comes back is the real status, headers, and body your handler produced. It is fast enough to run hundreds of cases without flaky port logic and accurate enough to prove middleware ordering still matters.

Understanding what supertest actually does helps you avoid two wrong mental models. It does not start a hidden server. It does not use `fetch` over localhost. It invokes the app as a function `app(req, res)` after building compatible `req` and `res` shims. That means anything Express touches normally still runs: body parsers, CORS, auth middleware, routers, 404 handling, and your global error handler. If your auth middleware is registered after your routes in `app.js`, supertest will prove that bug exactly as production would.

Where you draw the boundary between unit and integration shapes speed and confidence. A unit test for Express means testing a single layer with every collaborator replaced. Common units are services like `createOrder`, validation helpers, and pure middleware functions. You mock the database client and any HTTP calls your code would make. The test runs in milliseconds and when it fails you know exactly which function broke. The cost is divergence: your mock can promise the database returns `{ id: '1' }` while the real database would throw on that shape, and the unit test will stay green while production breaks.

An integration test for Express means running the full Express stack. Supertest makes the request, Express runs the chain, and something database-shaped answers. This is the only level that can catch ordering mistakes, missing `next(err)` calls, a 404 handler that swallows errors before they reach the error formatter, or a validation middleware that was simply not mounted. It is slower and noisier, so you run fewer of them. The working rule most senior teams use is the pyramid. Many fast unit tests for business logic, a healthy band of integration tests for every route and error branch, and a handful of end-to-end checks that really hit a deployed URL. If you only keep one shape, keep the integration band for an API: a passing unit suite with untested routes is the classic false confidence pattern.

Choosing what to fake inside an integration test is where people get stuck. Two honest options exist, and the right answer is usually both in different places.

Option one is mocking services. You keep Express and its middleware real, but you intercept the data layer at the model or repository boundary with `jest.spyOn(Model, 'find').mockResolvedValue(...)` or `jest.mock('../services/payment')`. This is cheap, deterministic, and lets you force edge cases like a payment service that always throws. Use it when the thing you are testing is routing, status codes, and response shape, and the database shape is not what you are trying to prove.

Option two is a real database that is cheap to create and throw away. The common tool in the Node Mongo world is `mongodb-memory-server`, which boots an actual Mongo binary in memory for that test run. The alternative in Postgres stacks is a throwaway database per test run, or `testcontainers` that boots a real Postgres in Docker. This costs more in time and memory but catches real query mistakes, schema mismatches, index errors, and transaction behavior that a mock will never show you. Use it when the route's job is mostly data, when a query is complex, or when confidence matters more than speed, like checkout or permission checks.

Auth setup in tests has the same two-track choice. Invalid auth must fail closed. That means if token verification fails for any reason, the request is rejected with 401 or 403, not allowed in with a default user. Never write auth code that treats a missing or malformed token as anonymous success.

To prove that, each protected route deserves at least three supertest cases. No token at all fails with 401. Wrong token, expired token, or badly signed token fails with 401. Right token for the right user succeeds with 200 and the handler sees `req.user`. For authorization you need a fourth shape: right user but wrong role gets 403. Flipped expectations are a real production hole: a 200 that should have been 403 is a data leak, and a 401 that should have been 200 is what breaks the frontend.

You get those tokens in tests by controlling the verification step. The fast path is mocking `jwt.verify` or whatever verification function your auth middleware calls: `jest.spyOn(jwt, 'verify').mockReturnValue({ id: 'u1', role: 'admin' })`. This makes auth deterministic and removes expiry and secret management from most tests. The realistic path is minting a real token using the same secret your test app uses: `jwt.sign({ id: 'u1', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' })` and sending it as `Authorization: Bearer <token>`. Pick one per test file and be consistent. Do not copy a token from a local run and paste it into source; it will expire and the test becomes date-dependent. Do not read the production secret into tests.

Test isolation is the discipline that makes the other choices matter. A test that leaks state creates successes and failures that only happen in a particular run order, which means CI is green today and red tomorrow with no code change. Isolation has three places to enforce.

First, per-test data. Before each test, empty the collections or tables that test touches. After all tests, close connections. For Mongo with `mongodb-memory-server` that is `await Model.deleteMany({})` in a `beforeEach` and `await mongoose.connection.close()` in an `afterAll`. For Postgres that is truncating tables or wrapping each test in a transaction that you roll back. Avoid `beforeAll` seeding unless you truly want shared data, because shared data means shared coupling.

Second, per-test mocks. Call `jest.clearAllMocks()` or `jest.restoreAllMocks()` between tests if you used `jest.spyOn`. A mock configured for `findById` to resolve once will stay resolved for the next test if you do not reset, and you will test ghost behavior.

Third, per-test app instance. If you mutate `app` or attach stateful middleware that accumulates between requests, build a fresh `app` per test file with a factory like `buildApp()`. Supertest's agent pattern also helps isolate cookies: `request.agent(app)` keeps a jar for that agent only.

Async handling on the page under test matters too. If a route awaits IO and rejects, that error must reach your error handler. In Express 4 that only happens if the handler is wrapped with a tiny helper that does `Promise.resolve(fn(req,res,next)).catch(next)` or uses `express-async-handler`, because Express 4 does not forward rejected promises itself. In Express 5 Express forwards rejections automatically, so the wrapper becomes optional. Either way state which version you are on. Security checks must fail closed in both regimes, and your tested error handler must hide stacks and internal details in production, returning one consistent JSON shape.

Put together, the mental checklist for a well tested Express API looks like this. App is exported without listening so supertest can use it. Most routes have both a unit for the service and an integration for the HTTP contract. Auth is proved in its three plus one shapes. Errors are proved for 400 validation, 404 not found, 401 or 403 auth, and 500 server error, and you assert that the error body has no `stack` in the default path. Mock and real database coverage exists for different reasons, isolation is enforced mechanically, and the error middleware from [how Express middleware walks the stack](./how-does-express-middleware-work.md) and [global error handling](./how-do-you-implement-global-error-handling.md) is exercised rather than bypassed. For the exact rejection mechanics see [handling async errors](./how-do-you-handle-async-errors-in-express.md).

## 4. See It In Practice — Real Code or Queries

All snippets are Node 18+, Express 4, Jest, and Supertest. Any async handler that awaits IO is wrapped with the `ah` helper below, or the page states Express 5 handling. Each snippet is a standalone file, imports included, syntax-checked.

**The shape that makes testing possible: export without listening**

```js
// app.js
const express = require('express');
const AppError = require('./errors/AppError');

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get(
  '/users/:id',
  ah(async (req, res) => {
    const user = await findUserById(req.params.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    res.json({ data: user });
  })
);

app.use((req, res, next) => {
  next(new AppError('Not found', 404));
});

// four args is what makes Express treat this as error middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const body = isProd && status === 500
    ? { error: 'Internal server error' }
    : { error: err.message };
  res.status(status).json(body);
});

async function findUserById(id) {
  return { id, name: 'Ada' };
}

module.exports = app;
```

```js
// server.js
const app = require('./app');

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log('listening on ' + port);
});
```

This split is the whole trick. `app.js` is what supertest imports. Only `server.js` binds a port. Nothing in `app.js` calls `listen`, so tests never compete for ports.

**Unit test: a pure service with the database mocked**

Unit is the right boundary for business logic that does not need Express at all.

```js
// services/userService.test.js
const userService = require('./userService');
const User = require('../models/User');

jest.mock('../models/User');

describe('userService.findActive', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns only active users', async () => {
    const fakeRows = [{ id: '1', name: 'Alice', active: true }];
    User.find.mockResolvedValue(fakeRows);

    const result = await userService.findActive();

    expect(User.find).toHaveBeenCalledWith({ active: true });
    expect(result).toEqual(fakeRows);
  });

  it('fails closed when the database throws', async () => {
    User.find.mockRejectedValue(new Error('db down'));

    await expect(userService.findActive()).rejects.toThrow('db down');
  });
});
```

Because the database is replaced, this suite runs in milliseconds and isolates the branching logic inside `findActive`. It cannot prove the route is wired, the middleware ordering is correct, or the error handler returns JSON.

**Integration test: supertest against the app with no listening**

This is the band that proves the HTTP contract. Note the app is imported and never started on a port.

```js
// tests/users.test.js
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');

jest.mock('../models/User');

describe('GET /users/:id', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns user with 200', async () => {
    User.findById = jest.fn().mockResolvedValue({ id: 'u1', name: 'Ada' });

    const res = await request(app).get('/users/u1').expect(200);

    expect(res.body).toEqual({ data: { id: 'u1', name: 'Ada' } });
  });

  it('returns 404 with one error shape when missing', async () => {
    User.findById = jest.fn().mockResolvedValue(null);

    const res = await request(app).get('/users/missing').expect(404);

    expect(res.body).toEqual({ error: 'User not found' });
    expect(res.body).not.toHaveProperty('stack');
  });

  it('returns generic 500 without leaking internals', async () => {
    User.findById = jest.fn().mockRejectedValue(new Error('db down'));
    process.env.NODE_ENV = 'production';

    const res = await request(app).get('/users/u1').expect(500);

    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(res.body).not.toHaveProperty('stack');
  });
});
```

Each request flows through JSON parsing, routing, async wrapping, and the central error handler. Assertions check status, body shape, and that sensitive fields never leak.

**Mocking services versus using a real in-memory database**

Pick per test intent. Mock when you want a forced edge. Use a real in-memory store when the query itself matters.

```js
// tests/users.mock-service.test.js
const request = require('supertest');

const mockFindById = jest.fn();

jest.mock('../models/User', () => ({
  findById: (...args) => mockFindById(...args),
}));

const app = require('../app');

describe('mocked service doubles', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('lets you force a not-found branch cheaply', async () => {
    mockFindById.mockResolvedValue(null);

    const res = await request(app).get('/users/ghost').expect(404);

    expect(res.body.error).toBe('User not found');
  });
});
```

```js
// tests/users.with-memory-db.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');

let mongo;

function buildTestApp() {
  // keep a factory if createApp caches connections per call
  // here we reuse the shared app but point it at the memory DB
  return require('../app');
}

describe('with a real in-memory Mongo', () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const uri = mongo.getUri();
    await mongoose.connect(uri);
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
    if (mongo) await mongo.stop();
  });

  it('catches a real schema and query mistake a mock would miss', async () => {
    const app = buildTestApp();
    await User.create({ name: 'Ada', active: true });

    const res = await request(app).get('/users').expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
```

The first file is a service double. The second boots a real Mongo in memory, connects mongoose to it, and lets the real model run. The second catches missing required fields, unique violations, and wrong query operators. The first is faster. Keep both for different layers.

**Auth: three plus one shapes, without expiry-sensitive tokens**

```js
// tests/profile.auth.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');

jest.mock('jsonwebtoken');

describe('GET /profile - auth', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('rejects when no token is sent (401)', async () => {
    const res = await request(app).get('/profile').expect(401);

    expect(res.body.error).toMatch(/auth/i);
  });

  it('rejects when token is invalid (401)', async () => {
    jwt.verify.mockImplementation(() => {
      const err = new Error('invalid token');
      err.name = 'JsonWebTokenError';
      throw err;
    });

    const res = await request(app)
      .get('/profile')
      .set('Authorization', 'Bearer bad.token.here')
      .expect(401);

    expect(res.body.error).toMatch(/auth/i);
  });

  it('succeeds when token is valid (200)', async () => {
    jwt.verify.mockReturnValue({ id: 'u1', role: 'user' });

    const res = await request(app)
      .get('/profile')
      .set('Authorization', 'Bearer valid.token.here')
      .expect(200);

    expect(res.body.data.id).toBe('u1');
  });

  it('rejects a valid login with wrong role (403)', async () => {
    jwt.verify.mockReturnValue({ id: 'u2', role: 'user' });

    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', 'Bearer valid.token.here')
      .expect(403);

    expect(res.body.error).toMatch(/forbidden|not allowed/i);
  });
});
```

For the realistic-token variant, replace the `jest.mock` call with `jwt.sign({ id: 'u1', role: 'admin' }, process.env.JWT_SECRET)` inside `beforeAll` and let the real middleware verify. Both approaches must fail closed on any verification error.

**Isolation: clean the database and mocks between tests, and isolate cookies**

```js
// tests/orders.isolation.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Order = require('../models/Order');

let mongo;

describe('orders - isolation', () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  beforeEach(async () => {
    await Order.deleteMany({});
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await mongoose.connection.close();
    if (mongo) await mongo.stop();
  });

  it('creates an order', async () => {
    const app = require('../app');
    const res = await request(app)
      .post('/orders')
      .send({ item: 'lamp', quantity: 1 })
      .expect(201);

    expect(res.body.data.item).toBe('lamp');
  });

  it('starts clean, no ghost order from previous test', async () => {
    const app = require('../app');
    const res = await request(app).get('/orders').expect(200);

    expect(res.body.data).toHaveLength(0);
  });

  it('keeps cookies isolated per agent', async () => {
    const app = require('../app');
    const alice = request.agent(app);
    const bob = request.agent(app);

    await alice.post('/login').send({ user: 'alice' }).expect(200);
    // bob never logged in, so this must not see alice session
    await bob.get('/profile').expect(401);
  });
});
```

Raking the field between reps, resetting mock state, and using per-agent cookie jars together remove the three classic leak vectors.

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you test Express APIs?**

Import the app without starting a server and use Supertest to make fake HTTP requests against it. Your test looks like `request(app).get('/users/123').expect(200)` and gets back the real status and JSON your error handler would send in production. Keep the app definition in `app.js` and export `app`. Only `server.js` should call `app.listen`. Supertest does not bind a port, does not open a socket, and does not need a running process. It builds a synthetic request and passes it into your Express stack directly, which means every middleware, route, and error handler still runs. That is why it catches ordering bugs and missing middleware that a plain function test would miss.

**Q: Why not just start a real HTTP server in tests and hit localhost?**

You can, but you are buying back problems you already solved. Each test file needs a unique free port or you race on `EADDRINUSE` in parallel CI. You need to wait for `listen` and later call `close`, which adds timing. Shutdown is lazy and leaves keep-alive sockets behind. Supertest removes all of that by avoiding the network. The only reason to hit a real URL is at the very top of the pyramid, like a smoke test against staging to prove infra routing, TLS, and load balancer config, which is no longer an Express middleware question.

**Q: What is the difference between unit and integration tests for Express, and when do you use each?**

Unit tests check one layer alone with everything else replaced. A service function with `User.find` mocked is the canonical example. They are the fastest feedback and pinpoint failures to one file. Integration tests check a real Express request end to end with supertest: parsing, auth, routing, validation, handler, and error formatting all real, database either mocked or replaced with a real in-memory store. They are slower but they are the only tests that can prove an auth check actually runs before the handler, that the error handler returns JSON in production, or that a missing `next(err)` does not hang a request. Run both. Put business rules and branching heavily in fast unit tests. Put every route and every error branch through an integration test, even if the service itself was unit tested elsewhere.

**Q: How do you mock database calls? Should you use mocks or a real database?**

Two tools, two jobs. `jest.spyOn(User, 'find').mockResolvedValue([...])` or a `jest.mock` at the module boundary replaces a call with a canned result. This lets you force 404s, 500s, and empty arrays without setup and without touching Mongo or Postgres. Use it when the thing you care about is HTTP status and body shape. `mongodb-memory-server` boots a real Mongo in memory that Mongoose talks to exactly like production. Use it when the query complexity is the point: filters, pagination, indexes, population, transactions. Real databases catch wrong field names, missing required fields, and bad operators that a mock will accept silently. Cost is time and memory. At senior level the answer is you keep both and can say which file uses which and why. In that memory suite you also need hygiene: `beforeEach` clearing, `afterAll` closing the connection and stopping the server, and `jest.clearAllMocks` if the same suite also touches service doubles.

**Q: How do you test authentication and authorization?**

Prove four cases for every protected route and make each assert a distinct status. No token at all returns 401. Badly signed, expired, or random token returns 401. Good token for the correct user returns 200 and the handler sees `req.user`. Good token for the wrong role returns 403. Wire that in two equivalent ways. Mock path: `jest.spyOn(jwt, 'verify').mockReturnValue({ id: 'u1', role: 'admin' })` so validity is under your control. Real-token path: create a JWT with the same secret you configured the app with in the test environment, `jwt.sign({ id: 'u1', role: 'admin' }, process.env.JWT_SECRET)`, and send it as `Authorization: Bearer <token>`. Never use a token you copied from a live session because expiry will flip the test tomorrow. And always assert that a failed credential check fails closed: the route does not fall through to a default guest user, it stops the chain in auth middleware with 401 or 403.

**Q: How do you test error handling and make sure you do not leak internals?**

Treat error paths as first class routes. Write one supertest case for each operational status your API promises: 400 for validation, 404 for missing resource, 401 or 403 for auth, and 500 for an unexpected failure. For 500, force a rejection, `jest.spyOn(User, 'findById').mockRejectedValue(new Error('db down'))`, then assert three things: the status is 500, the body shape is your single production shape like `{ error: 'Internal server error' }`, and the body does not contain `stack`, `path`, or any string that includes a file path. Also assert that any error that reaches the handler gets logged once with a correlation id, somewhere you can find it. The error-handler file is tested indirectly by these cases plus the middleware pages that describe its construction in detail. If your routes use async handlers on Express 4, the integration test is the proof that every handler was actually wrapped with `ah` or that the framework forwarding is in place. An unwrapped rejection will crash the process in Express 4 rather than return a 500, and the test run with Jest will surface that as an unhandled promise rejection.

**Q: How do you keep tests isolated so they do not pollute each other?**

Three resets, every run. Clear persisted data before each test, usually `await Model.deleteMany({})` or truncating tables, or the rollback-transaction variant if your helper supports it. Clear mock state with `afterEach(() => jest.clearAllMocks())` so a previous `mockResolvedValueOnce` does not ghost into the next test. Give each test file its own app and, if needed, isolated cookie handling with `request.agent(app)` so a login that sets a session cookie in one agent does not leak to a bare `request(app)` call in the next test. Run the suite in random order at least once in CI to prove isolation is real, not accidental.

## 6. The Traps — What Goes Wrong in Production

**Binding a real port in tests and then ignoring the flakes.** Starting `app.listen(3000)` inside `beforeAll` feels explicit, but in parallel CI some worker already owns that port, or `close` has not fully released it by the next file, and you get intermittent `EADDRINUSE` that you silence by running serially. Serial runs hide the bug but cost time every commit. Silence in CI is not green if it came from retry. Let supertest inject directly into `app` and reserve real URLs for a small deploy check outside the unit run.

**Only testing happy paths and memorizing status codes.** The schedule says `GET /users/123` returns 200 and your suite proves that for a seeded row. It never tries `GET /users/not-an-id` or `POST /orders` with `quantity: -1`. Production then reveals that validation was never mounted, or mounted after the route, and bad input flows straight to the handler. Every endpoint needs its bad-input sibling.

**Over-mocking until the tests pass but the app fails.** Mocking `User.findOne` to return anything you ask makes every handler test green, then the real query filters on `user_id` while the schema stores `userId` and nobody noticed because no test ever asked a real database. Mocks are meant to replace collaborators you have already tested elsewhere, not to replace the thing you are trying to prove. When the query is load-bearing, give that suite a real in-memory database.

**Leaking database state between tests.** The suite creates Alice in test one and Bob in test two. Test two now asserts pagination returns one row, but it sees two and flickers between green and red with run order. Or an earlier test inserts a record with a unique email and the next test tries to insert the same email and throws `E11000 duplicate key`. The fix is mechanical, not vigilant: `beforeEach` deletes or truncates, after each test mocks are cleared, after all connections are closed.

**Sharing a single global app with accumulating state.** If `buildApp` caches a connection or mutates a global object, importing `app` once at file top means one test can monkey patch `app.locals` or mount extra middleware that survives to the next file in watch mode. Prefer a factory that returns a fresh app per file, or at least re-import inside a fresh `beforeAll`.

**Auth tests with real production secrets or pasted tokens.** Using `process.env.JWT_SECRET` from the deployed environment in local tests couples test correctness to env that you do not own. Pasting a real JWT copied from Postman into source makes expiry the test's author. Generate tokens with the test secret inside `beforeAll` if you want real verification coverage, otherwise mock `jwt.verify` so validity is just `mockReturnValue`. Both prove the 401 versus 403 boundary. A pasted token proves only what time it was when you pasted it.

**Forgetting the async wrapper on Express 4 and believing Express saved you.** `app.get('/orders', async (req, res) => { await ... })` without `ah` compiles fine and serves fine until anything rejects. On Express 4 that rejection never reaches the global error handler, it becomes an unhandled promise rejection that may terminate the process. The integration suite for that route should include a forced-rejection case that asserts a 500; that case will fail if the wrapper is missing, which is exactly the signal you want. On Express 5 the wrapper is no longer required but stating which version you run is the mark of a senior answer.

**Asserting only status and not body shape or leakage.** `expect(500)` alone proves a code path threw, not that the client saw a safe, consistent shape. Production error middleware must return the same JSON envelope for every error and never include `stack` in production. The trap is checking status 500 with no body assertion, shipping a handler that returns `{ error: err.stack }` in production, and exposing file paths in every 500 until a client reports it.

**Using `beforeAll` seed that makes later tests depend on insertion order.** Seeding five users once and then asserting paginated order across three tests creates hidden coupling. Pagination, sort, and search should set up exactly the rows they care about inside each `it` so reordering or focusing one test does not change the dataset.

## 7. Compare With Related Concepts

**Supertest integration versus service unit tests.** Unit tests run `userService.findActive` with `User.find` mocked. They answer whether branching and mapping are correct, at the lowest cost to find a regression in that function. Supertest integration runs `request(app).get('/orders?page=1')` through real middleware and asserts status and JSON shape. It answers whether the contract the frontend needs is actually honored. Keep both and assign confidence accordingly. Unit says this function is right. Integration says this route is right. End to end against a deployed URL says the real infrastructure path is right, but proves it at much higher cost and with no control over data.

**Mocking with `jest.spyOn` or `jest.mock` versus `mongodb-memory-server` or testcontainers.** Mocking returns canned data instantly and lets you force a single branch in isolation: missing row, payment declined, downstream service unreachable. Memory or container databases run real engine code and catch query mistakes, missing indexes, and schema gaps that a mock happily ignores. The rule is short. When your question is status codes and envelope shape, mock. When your question is whether this query actually works against this schema, use the real in-memory engine. Most servers carry both, in separate files, so the fast suite stays fast and the realistic suite stays realistic.

**Supertest on `app` versus `fetch` against a running `server`.** Supertest avoids ports, waiting for `listen`, and closing listeners, and it avoids network variance in assertions on timing and headers. A live server via `fetch` includes those pieces and is useful as a thin health check to prove a container starts and TLS terminates, but it is the wrong place to verify per-endpoint validation or authorization at scale. If you find yourself scripting port discovery for every test file, you are using the wrong shape.

**Mocking `jwt.verify` versus minting a real JWT with the test secret.** Mocking verification says this request is this user without caring how tokens are produced. Minting a real token says the middleware decodes and checks expiry and signature with the actual secret. The real-token variant catches config bugs like the wrong secret or audience configured in test. The mock variant is deterministic and avoids clock dependence. Both are valid. The working choice is mock in most suites for speed, keep one small suite that mints real tokens to prove the config is right, and never check a pasted long-lived token into source.

**Per-test `deleteMany` versus per-test transactions versus per-file databases.** Emptying collections in `beforeEach` is simple and works across ORMs, but it costs a write before every test. Opening a transaction at the start of each test and rolling it back at the end avoids writes, but your driver and helper must support it and pass the same transaction through the code under test. Giving each test file its own database isolates files fully but burns setup time and memory. At senior level the answer is not one true way, it is naming the cost you are paying and proving you paid it with passing isolation, random-order CI, and no shared seed.

**Integration error assertions versus global error handler unit tests.** Calling the error handler as a plain function with `(err, req, res, next)` can prove its formatting for one set of inputs, but it cannot prove it is mounted last, or that routes actually forward via `next(err)`, or that the 404 handler feeds it. Supertest integration does prove mounting and forwarding, because a badly placed handler means a supertest request gets the wrong status, and that failure is exact.

## 8. 🧠 The Memory Hook

Training camp scrimmage, not opening day. Keep the gates locked and place the ball directly on the line. Let the quarterback drill alone against dummies, run the full squad on real turf, flash the gate guard both a good badge and a bad one, and rake the field after every rep so no sled from Rep 1 trips Rep 2.
