# How do you rate-limit APIs

## 1. The Real-World Problem — When You Actually Hit This

It's 2pm on a Tuesday and your order API starts timing out. Nothing deployed, no errors in the logs — just requests piling up. After twenty confusing minutes you find it: someone's price-scraper has been hitting `GET /api/products` forty times a second all afternoon. Every scrape opens database queries, the connection pool is exhausted, and now *paying* customers time out too. One script with zero budget took down the service for everyone, because your Express app happily did expensive work for whoever asked, as many times as they asked.

So you add rate limiting with sensible-looking defaults and ship it. The next morning the support channel is on fire, and this time **you** caused it. Two separate complaints, both about being blocked. First: a customer's whole office is locked out, because their two hundred employees share one company internet connection and your limiter counted them as one client. Second, worse: almost *everyone* is blocked, because your app sits behind a new load balancer, and without extra configuration every request arrives looking like it came from the balancer's own address — one giant shared bucket that filled up in minutes and shut the door on the entire internet.

That Tuesday and that Wednesday morning contain everything this topic is really testing. Rate limiting looks like "add middleware, get protection," but it's three decisions stacked together: who gets counted together (the key), where the tally lives (the store), and when the tally resets (the window). Get any one of them wrong and either the scraper wins again or you take your own service down. Interviewers love this question because each wrong answer exposes a different production outage.

## 2. The Analogy — Make the Mechanic Obvious

Think about how an ATM enforces your bank's daily withdrawal limit.

The limit attaches to your **account**, not to you personally. The machine doesn't measure your face or your jacket — it asks for the card, because the card number is the thing the bank decided counts. That's the **key**: the identity a limit is tallied against. Pick a bad key and the limit means nothing — limit people by shoe size and everyone wearing 42 shares one allowance.

Every ATM in the country enforces the same limit, because no machine keeps its own tally. Each one calls the **same central ledger** before dispensing cash: has this account already withdrawn today? If every ATM kept a paper counter in its drawer, you could drive to ten machines and withdraw ten times the cap. That's exactly what happens with a per-process in-memory store running behind multiple servers — each instance counts separately, so the effective limit multiplies.

The ledger **resets at midnight**. That sounds clean until you notice the loophole: withdraw your full limit at 11:58pm, another at 12:01am, and you've pulled double the money in three minutes while technically never exceeding the daily cap at any single moment. That's the fixed-window problem, and it's why some banks instead look back over a **rolling 24 hours** of transactions — the sliding window — which closes the loophole at the cost of more bookkeeping.

Now the painful parts. A **joint account**: your roommate spends the entire daily limit at noon, and at 3pm your perfectly reasonable withdrawal is refused. You were limited by a key you share with someone else — precisely what happens when you rate-limit logged-in users by IP address. An **interbank network**: when a withdrawal comes through a partner network, the ledger trusts that network to report honestly which terminal originated it; if any terminal could claim any origin ID it wanted, an abuser could rotate claimed origins forever and never trip a limit — which is the exact danger of trusting spoofable forwarding headers behind a reverse proxy. And when the link to the core ledger goes down, ATMs don't shrug and dispense free uncounted cash — they **stop dispensing entirely**, because for withdrawals the banks chose failing closed over failing open. Your rate limiter forces the same availability-versus-abuse decision, and even the refusal message teaches the HTTP contract: "daily limit reached, try again after midnight" is temporary with a known retry time — that's a 429 with `Retry-After`. "This card is reported stolen" is a completely different category — that's a 403.

## 3. The Full Explanation — How It Actually Works

Strip away the middleware packaging and a rate limiter is a tiny algorithm that runs before your route handler: compute a key for this request, add one to that key's tally, check the tally against the limit, and either reject immediately or call `next()`. Everything interesting hides in those three nouns — key, tally, clock.

Start with **placement**, because it decides whether the limiter protects anything. Express walks its middleware chain top to bottom (that pipeline is covered properly in [how-does-express-middleware-work](how-does-express-middleware-work.md)), so a limiter registered early rejects abusive requests *before* they cost you anything. Mount it above body parsing and above file-upload handling and you've turned away the flood before reading megabytes of garbage. But there's a tension: the cheapest limiter keys on IP and needs no authentication, while the *fairest* limiter needs to know who the caller is. Real apps usually solve this with layers — a coarse IP-based limiter near the very top as a flood brake, and finer per-user limits applied later on routes where authentication has already run.

Next, the **key** — who gets counted together. The default is `req.ip`. Where that value comes from matters enormously. With no proxy in front of you, `req.ip` is the TCP socket address — genuinely the caller. Behind a reverse proxy or load balancer, the socket address belongs to the *proxy*, so every visitor shares one key unless you tell Express how many trusted proxies sit in front via `app.set('trust proxy', ...)`. Set it correctly (usually the hop count, or your proxy's specific addresses) and Express walks the `X-Forwarded-For` chain backwards, skipping the trusted hops, and picks out the real client address. Get it wrong in either direction and you're in one of the two incidents from section 1: leave it unset and all traffic shares the balancer's single key (mass lockout); set it to blindly trust the header and attackers rotate fake values to get unlimited fresh keys (total bypass). The header is written by the *client* on the way in — only the hop your own infrastructure appended is trustworthy. Modern `express-rate-limit` versions even ship startup warnings that flag both misconfigurations.

IP has a second weakness even when measured correctly: it's the wrong unit for people. Office networks, university campuses, and mobile carriers put thousands of humans behind one public address — a joint account. Once authentication has identified the caller, key on the user or account ID (`req.user.id`) and everyone gets their own fair quota regardless of whose Wi-Fi they sit behind. One subtle modern wrinkle: IPv6 gives a single ISP customer a gigantic address block, so a device can quietly rotate through billions of addresses to look like a brand-new caller every request. Current versions of `express-rate-limit` defend by default — they collapse IPv6 addresses down to the enclosing subnet (a /56) before using them as keys, via the exported `ipKeyGenerator` helper. If you write a custom `keyGenerator` and touch `req.ip`, use that helper, or the library will warn that you've reopened the rotation hole. Whatever you choose, the key must always resolve to a stable string — a generator that sometimes returns `undefined` silently lumps every such request into one shared bucket.

Then the **store** — where the tally lives. Out of the box, `express-rate-limit` keeps a plain in-memory map inside your Node process. For local development and a single-instance deployment, that's honest and fine: the map records each key's count and a `resetTime` — and since version 7 the window is anchored *per key*: the clock for your bucket starts when your first request lands, not on a global wall-clock tick. The moment you run more than one instance — PM2 cluster mode, Kubernetes replicas, even multiple dynos — the model breaks, because each process owns a private map. Four pods configured for 100 requests each will collectively admit up to about 400 before anyone sees a 429, and the exact multiplier depends on how the load balancer distributes traffic. Worse, every deploy or crash wipes the maps, resetting every abuser's count for free. Production multi-instance setups hand the limiter a shared external store, almost always Redis: the store atomically increments a counter (`INCR`) and attaches an expiry matching the window (`EXPIRE`) on the key's first hit, so every instance across every pod consults one ledger. Atomicity isn't a nicety here — two pods processing simultaneous requests must produce count 1 then 2, never both 1. The `rate-limit-redis` package wires this up through a small `sendCommand` shim, and community stores exist for Memcached, Postgres, MongoDB, and Node cluster mode. The cost is one fast network round-trip per request — usually sub-millisecond to a couple of milliseconds — which is why nobody puts the counter in the primary database if they can help it.

Then the **window** — when the tally forgives. The default is the *fixed window*: each key accumulates hits for `windowMs` starting from its first request, then the counter expires and the next request starts fresh. Simple and cheap, with the ATM-midnight weakness: up to 2× the intended limit can slip through straddling a reset boundary. The *sliding window* fixes fairness by looking back over a rolling period — typically pruning old entries from a sorted set in Redis — so "the last 60 seconds" means exactly that at every instant. The *token bucket* family takes yet another angle, dripping capacity back at a steady refill rate while allowing controlled bursts, which fits APIs whose clients send in waves. Fixed-plus-sliding covers most interview answers; the deeper distributed design lives in [design-a-rate-limiter](../system-design/design-a-rate-limiter.md).

Finally, the **decision and the contract** that follows it. Under the limit: the middleware stamps usage onto `req.rateLimit` and calls `next()`, optionally attaching standard headers so well-behaved clients can pace themselves. Over the limit: respond **429 Too Many Requests** — the status code invented for exactly this (RFC 6585) — plus a `Retry-After` header telling the client when the door reopens. `express-rate-limit` sets `Retry-After` for you whenever you've enabled its headers, and offers three generations of standardized rate-limit headers (`standardHeaders: 'draft-6' | 'draft-7' | 'draft-8'`) alongside the older `X-RateLimit-*` legacy ones. The distinction from neighboring status codes is interview gold: 403 says "you may never do this" (an authorization verdict), 500 says "we broke," while 429 says "you may do this — later," which is actionable for a client.

One decision remains, and teams forget it exists: **what happens when the store itself dies**. If Redis is unreachable, every limiter call errors. The default behavior is *fail closed* — the error flows to `next(err)` and your [error-handling middleware](what-is-error-handling-middleware.md) answers, so clients get rejected while the store is down. Setting `passOnStoreError: true` flips it to *fail open* — requests pass through uncounted while the outage lasts. Neither is universally correct: fail closed on login and payment routes (an unguarded brute-force door during an outage is a gift to attackers), consider failing open on low-risk read traffic where blocking everyone to stop a hypothetical abuser is the worse trade. Whichever you pick, alert on it loudly — a rate limiter that silently stopped counting is invisible until something ugly happens.

## 4. See It In Practice — Real Code or Queries

Environment assumptions: Node 20+, Express 5, and `npm install express express-rate-limit rate-limit-redis redis`. Express 5 forwards rejected promises from async handlers to your error middleware automatically; the async-error wrapper story for Express 4 lives in [how-do-you-handle-async-errors-in-express](how-do-you-handle-async-errors-in-express.md).

First, the everyday setup — a generous global brake plus a strict login limiter, with the response contract made explicit:

```js
// basic-limiters.js
const express = require('express');
const { rateLimit } = require('express-rate-limit');

const app = express();

// We sit behind exactly ONE reverse proxy. Without this, req.ip is the
// proxy's address and every visitor shares a single key -> mass lockout.
// Never set this to `true`: that trusts a client-controlled header.
app.set('trust proxy', 1);

// Global flood brake: generous, keyed by client IP.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window per key...
  limit: 300,               // ...300 requests before 429s begin
  standardHeaders: 'draft-7', // RateLimit-Limit / -Remaining / -Reset / Policy
  legacyHeaders: false,       // drop the old X-RateLimit-* headers
});

// Login gets its own much stricter quota. Only FAILED attempts count,
// so a legit user mistyping twice isn't locked out by their own success.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Runs only when the limit trips. The library has already set the
  // 429 status and the Retry-After header by this point.
  handler: (req, res) => {
    const retrySeconds = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).json({
      error: 'too_many_attempts',
      retry_after_seconds: retrySeconds,
    });
  },
});

// Health checks must never be counted, or monitoring pages you
// because the limiter started blocking your own probes.
app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api', apiLimiter);
app.post('/auth/login', loginLimiter, (req, res) => {
  res.json({ token: 'pretend-jwt' });
});

app.listen(3000, () => console.log('on :3000'));
```

A client that ignores the pacing hints eventually receives this — the whole machine-readable contract in one response:

```txt
HTTP/1.1 429 Too Many Requests
Retry-After: 612
RateLimit-Policy: 300;w=900
RateLimit-Limit: 300
RateLimit-Remaining: 0
RateLimit-Reset: 612
Content-Type: application/json; charset=utf-8

{"error":"too_many_attempts","retry_after_seconds":612}
```

Second, the multi-instance fix — one shared ledger in Redis so four pods enforce 300, not 1200:

```js
// redis-store.js
const express = require('express');
const { createClient } = require('redis');
const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

async function main() {
  await redis.connect();

  const app = express();
  app.set('trust proxy', 1);

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Default is fail CLOSED: if Redis errors, next(err) fires and the
    // error middleware below answers 503. Uncomment to fail OPEN instead
    // (traffic passes uncounted during a Redis outage).
    // passOnStoreError: true,
    store: new RedisStore({
      // node-redis takes an array form. With ioredis it would be:
      //   sendCommand: (cmd, ...args) => redis.call(cmd, ...args)
      sendCommand: (...args) => redis.sendCommand(args),
      prefix: 'rl:', // namespace the keys away from other app data
    }),
  });

  app.use('/api', limiter);
  app.get('/api/ping', (req, res) => res.json({ pong: true }));

  // Fail-closed surface: store failures arrive HERE as `err`.
  app.use((err, req, res, next) => {
    console.error('rate-limit store failure:', err.message);
    res.status(503).json({ error: 'temporarily_unavailable' });
  });

  app.listen(3000, () => console.log('on :3000'));
}

main().catch((err) => {
  console.error('failed to start:', err);
  process.exit(1);
});
```

Third, the fairness fix — key by verified identity once you know it, with IPv6 handled the way the library expects:

```js
// keyed-by-user.js
const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);

// Coarse brake stays IP-keyed and sits BEFORE auth: it stops floods
// cheaply, without doing token verification for obvious garbage.
const floodBrake = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Per-user quota applies AFTER authentication, so office colleagues
// sharing one egress IP each get their own fair bucket.
const userQuota = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => {
    if (req.user && req.user.id) return `u:${req.user.id}`;
    // Unauthenticated fallback: mask IPv6 down to its /56 subnet so one
    // device can't rotate through its ISP block pretending to be new
    // callers. The library warns if a custom generator touches req.ip
    // without going through ipKeyGenerator.
    return `ip:${ipKeyGenerator(req.ip)}`;
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stand-in for real auth middleware — see
// how-do-you-implement-jwt-authentication.md for the genuine article.
function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  req.user = header.startsWith('Bearer ')
    ? { id: header.slice(7).trim() }
    : null;
  next();
}

app.use(floodBrake);
app.post('/api/orders', authenticate, userQuota, (req, res) => {
  res.status(201).json({ created: true, owner: req.user ? req.user.id : 'anonymous' });
});

app.listen(3000, () => console.log('on :3000'));
```

Finally, a peek under the hood — what "sliding window" actually computes in Redis-flavored stores. This sketch isn't a server; it exists so the words mean something concrete:

```js
// sliding-window-sketch.js
// The rolling-window algorithm behind sliding-window stores: keep one
// sorted set of timestamps per key, prune the ones older than the
// window, and count what survives.
const WINDOW_MS = 60 * 1000;
const LIMIT = 120;

async function allowRequest(redis, key) {
  const now = String(Date.now());
  const member = `${now}:${Math.random()}`; // unique entry for this hit
  try {
    // Evict timestamps that slid out of the window...
    await redis.sendCommand(['ZREMRANGEBYSCORE', key, '-inf', String(Date.now() - WINDOW_MS)]);
    const recent = Number(await redis.sendCommand(['ZCARD', key]));
    if (recent >= LIMIT) return { allowed: false };
    // ...then record this hit with an expiry as a safety net.
    await redis.sendCommand(['ZADD', key, now, member]);
    await redis.sendCommand(['PEXPIRE', key, String(WINDOW_MS)]);
    return { allowed: true };
  } catch (err) {
    // Same fail-open/closed decision as any store — here we chose open,
    // loudly. Fail closed would mean returning { allowed: false } or throwing.
    console.error('sliding-window store error:', err.message);
    return { allowed: true, degraded: true };
  }
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you rate-limit APIs in Express?**

Use the `express-rate-limit` middleware, but present it as the three decisions rather than a config dump. The key decides who's counted together — client IP by default, upgraded to user ID once authenticated. The store holds the tally — in-memory per process, Redis for anything with more than one instance. The window decides forgiveness — a fixed window of, say, 300 requests per 15 minutes by default, sliding windows when boundary bursts matter. Mounted early in the chain, the middleware increments the current key's count, lets requests under the limit through, and answers over-limit ones with 429 plus `Retry-After` and the standard `RateLimit-*` headers. Then volunteer the production scar: the defaults assume one process and no proxy, and both assumptions break the day you scale out or sit behind a load balancer.

**Q: Why doesn't the built-in memory store survive production?**

Because it lives inside one Node process, and production rarely does. Run four replicas behind a load balancer and each keeps a private map, so the effective ceiling becomes roughly four times whatever you configured — the balancer spreads each client's requests across buckets that never talk. Deployments and crashes wipe the maps entirely, handing every abuser a fresh count. Cluster mode, worker processes, even serverless instances reproduce the same split-brain. The fix is moving the tally somewhere every instance already agrees on: Redis with an atomic `INCR` plus an expiry on first hit, wired in through `rate-limit-redis`. Say also why atomicity matters — simultaneous requests on different pods must observe distinct counts, or the limit leaks.

**Q: What should the key be — IP address or user ID?**

Both, at different layers, keyed on the finest identity you can verify at that point in the pipeline. Before authentication you have nothing but the connection, so IP is the only honest key — it's the flood brake. After authentication, key on the user or account ID, because IP is the wrong unit for people: offices, campuses, and mobile carriers hide thousands of humans behind one address, and IP-only limiting turns one heavy user into a whole building's outage — the joint-account problem. Two footnotes worth adding: never key directly on a client-supplied header value like a raw `X-Forwarded-For` — it's forgeable, so attackers mint unlimited keys; and on IPv6, collapse addresses to their subnet (current `express-rate-limit` defaults to /56 via `ipKeyGenerator`) or one device can rotate addresses faster than you can count them.

**Q: How does rate limiting behave behind a load balancer or reverse proxy?**

Two separate effects, and conflating them sinks the answer. Effect one is identity: behind a proxy, the TCP peer is the proxy itself, so `req.ip` equals the balancer's address for every visitor unless Express is told which hops are trustworthy with `app.set('trust proxy', <hops-or-ips>)`. Correctly configured, Express unwinds `X-Forwarded-For` back to the real client. Misconfigured unset means one giant shared key — a site-wide self-lockout. Misconfigured as `true` means trusting whatever the client wrote, which is an unlimited-bypass coupon. Effect two is enforcement location: a limiter in your app only sees traffic that already reached Node, while gateways and CDNs can shed floods earlier and cheaper. Mature setups do both — coarse limits at the edge, identity-aware limits in the app.

**Q: Compare fixed window, sliding window, and token bucket.**

Fixed window counts hits per key from the first request until `windowMs` elapses, then resets. It's the cheapest and good enough most of the time, but it leaks up to double the limit around boundaries — a full burst just before the reset plus another just after. Sliding window keeps a rolling view — literally the last N minutes at every instant, typically a pruned sorted set in Redis — closing the boundary trick at the price of more bookkeeping per request. Token bucket reframes the whole thing as capacity that refills at a steady drip: bursts are allowed while tokens last, sustained abuse is throttled to the refill rate, and it composes beautifully in distributed designs. Rule of thumb: fixed for simple per-route brakes, sliding when fairness at the margin matters, token bucket when legitimate clients legitimately burst.

**Q: What belongs in a rate-limited response, and why 429 specifically?**

Status 429 Too Many Requests — created by RFC 6585 for exactly this meaning: "you may proceed, later." Attach `Retry-After` so the client knows when to come back, and the standard `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` headers so cooperative clients pace themselves before ever getting blocked — `express-rate-limit` emits these when you enable `standardHeaders` ('draft-6'/'draft-7'/'draft-8') and sets `Retry-After` alongside. The contrast is the senior part: 403 means authorization denies you outright with no retry implied, and 500 claims the server is broken, which pages your on-call for a client-behavior problem. Wrong-code choices aren't cosmetic — frontends and SDKs branch on them, and a 500 triggers retry-and-alert machinery meant for outages.

**Q: Redis goes down. Should your limiter fail open or closed?**

Name the trade first: fail closed rejects honest traffic to keep enforcing the cap; fail open keeps the service usable while suspending the cap. Then answer per sensitivity rather than globally. Auth, payment, and password-reset endpoints fail closed — an unguarded brute-force surface during an outage is worse than temporary rejection, and it's the default (`passOnStoreError: false` routes store errors to `next(err)`). Low-risk reads can justify `passOnStoreError: true` so a cache-tier blip doesn't become a site-wide outage. Either way: alarm loudly, because a limiter that stopped counting is silent until something exploits it, and say the recovery plan — Redis restarts with its keys intact (or repopulates fresh), and enforcement resumes without redeploying.

**Q: How do you give different endpoints different limits?**

Create separate limiter instances and mount them at different scopes — that's the whole mechanism, since each instance carries its own window, limit, key function, and handler. A strict five-per-fifteen-minutes limiter guards `/auth/login` (brute force is cheap to attempt and expensive to absorb), the general API gets a few hundred, expensive report exports get far fewer, and `skip` excludes health probes. Order matters: mount-specific limiters run after broader ones, and a request that trips the strict limiter never reaches the handler. For role-based variation — admins get more, free tier less — either branch inside a custom `handler`, or run two limiters where one's `skip` admits privileged users early. Mention `skipSuccessfulRequests` on login limiters and you've covered the detail that separates people who've operated this from people who've read about it.

**Q: How would you test rate limiting?**

Unit-level, exercise the limiter as plain middleware with mocked store state: fire `limit + 1` requests against a supertest app and assert the last one is 429 with sane `Retry-After` and `RateLimit-*` headers. Time-travel instead of sleeping — inject or mock the clock so window resets take milliseconds, or tests crawl. Integration-level against a throwaway Redis (a container or `testcontainers`), assert the shared-store property that actually caused past outages: counts persist across "instances" — two app processes pointing at one Redis must jointly exhaust the budget. And assert the negative paths: health checks skipped, successful logins not counted when `skipSuccessfulRequests` is set, and store-outage behavior matches your fail-open/closed decision. In staging, a load tool replaying realistic traffic validates the numbers you picked weren't fantasy.

**Q: What does the frontend have to do with rate limiting?**

Honor the contract, because a backend that returns 429 with `Retry-After` only works if clients obey it. An axios interceptor watching for 429 should pause and retry after `Retry-After` seconds — with jitter so a thousand synchronized clients don't all stampede at the same instant (a thundering herd you built yourself). Distinguish 429 from 401/403 in UI copy: "slow down, try again shortly" versus "you don't have access" versus "log in again." Disable submit buttons while a mutation is in flight so users can't burn their own quota, and treat `RateLimit-Remaining` as a signal to slow proactive polling. The frontend half of this question is really testing whether you see rate limiting as an API contract between two programs rather than a server-side punishment.

## 6. The Traps — What Goes Wrong in Production

**Shipping the in-memory store behind multiple instances.** The wrong assumption: "it's the default, so it must work." Each pod counts privately, so four replicas multiply the effective limit by roughly four, deployments reset every abuser's counter to zero, and the symptom is maddeningly intermittent — abuse protection that depends on which pod the balancer happened to pick. Fix: any multi-instance deployment gets a shared store (Redis is the usual choice) on day one.

**Leaving `trust proxy` unset behind a load balancer.** Every request's `req.ip` is the balancer's address, so the entire internet shares one key. The first moderately busy minute trips it, and you've built a perfect self-service denial-of-your-own-service. Symptom: 429s for everyone almost immediately after enabling limits, despite modest per-client numbers. Fix: declare your actual proxy hops (`app.set('trust proxy', 1)` for one hop, or explicit proxy addresses) so Express unwinds `X-Forwarded-For` to the real client.

**Setting `trust proxy` to `true` "to make IPs work."** Now Express believes whatever `X-Forwarded-For` claim reaches it — a header the *client* wrote. An attacker appends a random fake IP to every request and buys a brand-new bucket each time; your limiter counts ghosts while the real client rotates freely. The correct configuration trusts only infrastructure you control, by count or by address — never a blanket boolean on a public ingress.

**Ignoring the fixed-window boundary burst.** A 100-per-minute limiter admits 100 at 10:59:59 and 100 more at 11:00:00 — double the intended rate for a brief, very real window. Attackers and badly-written batch jobs find this rhythm naturally. Fix where it matters: sliding windows, or accept it consciously for endpoints where a 2× momentary overshoot is harmless — the point is making the choice, not pretending the leak doesn't exist.

**Keying logged-in users by IP only.** One employee's runaway script exhausts the shared-office bucket and two hundred colleagues start seeing 429s — the ATM joint-account problem, and support tickets write themselves ("your site is broken"). Fix: after authentication, switch the key to the user ID; keep the IP-keyed limiter as a coarse pre-auth brake only.

**Blocking your own health checks and monitors.** The platform's liveness probe, uptime checker, and metrics scraper all poll frequently from a handful of internal addresses — prime candidates to trip a limiter and start failing the service *because* it's healthy enough to be polled aggressively. Result: flapping health status and alerts that correlate with nothing. Fix: `skip` the probe routes, and exempt internal monitor ranges deliberately rather than accidentally.

**Omitting `Retry-After` (or ignoring it client-side).** A bare 429 with no retry hint makes clients guess, and clients guess "immediately" — turning one rate-limited user into a tight retry loop that hammers you harder than the original offense. Server side, enable the headers so the library sets it; client side, interceptors must sleep for the stated duration plus jitter. Rate limiting without a cooperation protocol just converts abuse into retry storms.

**Mounting the limiter after expensive middleware.** Body parsing, multipart uploads, and heavy transforms registered above the limiter mean every flooded request costs full parsing before being rejected. The whole economic point of rate limiting is rejecting cheaply. Fix: flood-brake limiters go near the very top — above parsers, above upload handling — with only logging and static trust-proxy setup ahead of them.

**Counting successful logins toward the limit.** Password managers and mobile apps retry logins aggressively; count every attempt and a normal user burns their quota on successes and locks themselves out of their own account — a gift-wrapped denial-of-service vector against your users. Fix: `skipSuccessfulRequests: true` on credential endpoints so only failures accumulate toward the brute-force threshold.

**Letting a custom `keyGenerator` return junk.** Return `undefined` for requests without a user, and every such caller merges into one shared bucket — strangers punishing each other for someone else's traffic. Return raw IPv6 addresses, and one device rotating through its /64 looks like infinite fresh clients (modern library versions warn or defend here — heed the warning and use `ipKeyGenerator`). The key is the foundation; a key function deserves tests like any other security control.

## 7. Compare With Related Concepts

**Rate limiting vs throttling.** Rate limiting refuses — hard ceiling, 429, done. Throttling slows — queueing, delaying, or degrading service quality instead of refusing. They're complementary tools on one spectrum: throttle slightly-over-limit traffic to smooth bursts, hard-limit the egregious tail. The conceptual sibling lives in [request-throttling](../concepts/request-throttling.md); the baseline vocabulary is in [rate-limiting](../concepts/rate-limiting.md).

**Rate limiting vs quotas.** Same counting machinery, different timescale and intent. A rate limit protects the system second-to-second — hundreds per minute, enforced in middleware, forgotten instantly. A quota is a business entitlement — ten thousand API calls per billing month, stored durably, surfaced in dashboards and invoices. Rule: rate limits guard stability, quotas meter commerce; big platforms enforce both, at different layers.

**Application-level vs edge/gateway limiting.** `express-rate-limit` sees everything your app sees — authenticated identity, route semantics, business context — but only after traffic has crossed your network and entered Node. Edge limiters (nginx `limit_req`, ALB/WAF rules, Cloudflare) act earlier and cheaper, shedding volumetric floods before they consume your bandwidth. Rule: coarse volumetric defense at the edge, identity-aware quotas in the app; neither alone is sufficient.

**Token bucket vs window counters.** Windows ask "how many in the last period"; the bucket asks "is there capacity in the tank, and how fast refills it." Windows are simpler to reason about and audit; buckets handle bursty-but-legitimate clients gracefully and dominate distributed rate-limiter designs. When the interviewer pushes to large-scale design, that's the doorway to the full architecture in [design-a-rate-limiter](../system-design/design-a-rate-limiter.md).

**Rate limiting vs circuit breakers.** Mirrored protections facing opposite directions: the limiter guards your service from too many inbound requests; the breaker guards your callers from hammering a dependency that's already dying. One sheds incoming load; the other stops outgoing pressure. Teams that conflate them end up with neither configured well — name the direction of protection and the difference becomes obvious.

**429 vs 503.** Both mean "not right now," but the blame differs. 429 says the client exceeded its allowance — the fix is client-side pacing, and `Retry-After` names the moment. 503 says the service can't cope — overload shedding, maintenance, or (usefully) a fail-closed rate-limit store. Choosing deliberately between them, including for your limiter's own failure mode, signals operational maturity; the wider status-code map lives in [http-status-codes](../concepts/http-status-codes.md).

## 8. 🧠 The Memory Hook

A rate limiter is an ATM's daily limit: the count attaches to a key you can verify (the card, never the face), every machine consults one shared ledger before dispensing, and the ledger forgives on a clock you chose. Get the key wrong and strangers share one allowance; get the store wrong and every ATM hands out its own; get the clock wrong and midnight pays out twice.
