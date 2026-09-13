# How Will You Design a Backend That Supports Mobile and Web Clients

## 1. The Real-World Problem — When You Actually Hit This

You shipped one clean REST API for your web app. It works great. Then the mobile team shows up. They say the `/products` response is 85KB of nested JSON you never noticed on fast wifi, but on a 3G phone it takes two seconds and kills the battery because the app fetches it every time the user opens the feed. They need a smaller payload — just `id`, `title`, and `thumb` — plus offline sync so the app works on the subway. Meanwhile the web team wants server-side rendering for SEO, so they need the same data but fully expanded with HTML-friendly fields and they can refetch any time because they are always online.

You try to please both with one endpoint. You add `?fields=...` query params. You add `?isMobile=true` hacks. Within two sprints that one API is a branching mess, every mobile fix risks breaking the web, and you cannot ship a breaking change because old app versions live on users' phones for months — you cannot force an update the way you can redeploy a website. This is the exact moment you need a real strategy for serving multiple clients from one backend.

## 2. The Analogy — Make the Mechanic Obvious

Think of one kitchen serving two restaurants.

The kitchen is your core backend — the real domain services, the database, the business rules for orders, users, payments. It does not care who is eating.

Up front you have two dining rooms. One is a full sit-down restaurant. That is the web. Guests have big tables, fast service, strong lights. They can order a giant platter and keep asking for refills — they are always connected and they have screen space to show a lot.

The other is a food truck. That is mobile. Space is tiny, the road is bumpy, the customer may drive through a tunnel and lose signal. You need compact lunch boxes, light to carry, easy to eat with one hand, and you need to pack something they can eat later if they go offline.

You would never make one single waiter plate food the same way for both rooms. That is the single generic API — one waiter trying to remember who wants what and adding `if mobile` checks to every plate.

What you do instead is put a dedicated plating station — an expediter — in front of each dining room. The kitchen still cooks the same food, but each expediter plates it for its room. Small boxes for the truck. Big platters for the restaurant. That expediter is the Backend For Frontend, the BFF. Each client gets a thin backend that speaks its language, while the kitchen stays clean.

Versioning is the menu version printed on the wall. You cannot rip the old menu out of the truck customers' hands — they took it home. You keep serving the old menu while you add a new one. GraphQL is letting the customer walk up and say "just rice and one piece of chicken, no sides" instead of forcing a fixed platter. Pagination is serving that platter one small plate at a time so the truck customer does not spill it. Feature flags are the daily special board you can flip on for one room without reprinting the whole menu. Auth is the wristband for the club vs the paper ticket for the truck — different proof that works for that room.

## 3. The Full Explanation — How It Actually Works

Start with the simplest wrong design so you can see why it breaks.

A single shared API that tries to serve everyone with flags like `?client=mobile` turns into the least common denominator. Web pays for mobile compromises and mobile pays for web bloat. Over-fetching — sending fields the client does not need — wastes bandwidth and battery. Under-fetching — not sending enough so the client makes five extra calls — wastes round trips. Both are painful on mobile where every radio wake-up costs battery. Coupling is the bigger tax: one handler with branching logic is hard to test, hard to deploy, and a bug for one client becomes a bug for all.

The fix is to separate two jobs that you were forcing into one layer: the core business logic and the client-specific presentation logic.

Keep your core services pure and client-agnostic. They expose domain operations like `getUser(id)`, `listProducts(filter)`, `createOrder(payload)` and they own consistency, transactions, and rules. They change only when the business changes.

Then add a thin adaptation layer per client family. The classic name for this is Backend For Frontend — BFF. You end up with `bff-web` and `bff-mobile`. Each BFF owns the shape of data for its client, aggregates calls to core services, handles client-specific auth, and evolves on that client's release cycle. Web can deploy daily. Mobile can release every two weeks without them stepping on each other. If you are small, you might start with one API plus disciplined content negotiation, but the moment branching logic or release coupling hurts, you split into BFFs. The tradeoff is real: you now run two more services to monitor and deploy, and you must avoid turning each BFF into a mini-monolith that reimplements business logic. The rule is BFFs orchestrate and reshape, they do not own rules.

Versioning is how you survive app stores. Web clients always run your latest code after a deploy. Mobile clients are frozen in time on old binaries you cannot update. If you break the contract, old apps crash. You need additive, non-breaking evolution by default — add optional fields, never rename or remove without a version. For breaking changes, version the contract. The practical default most teams land on is URL versioning for major breaks like `/api/v1/products` and `/api/v2/products`, with header or query-param negotiation for minor variations. It is easy to route, easy to cache, easy to see in logs. Keep old versions running with a sunset policy — announce deprecation, add `Deprecation` and `Sunset` headers, monitor usage per version, then remove after a defined window. Internally, version at the BFF boundary, not deep in the core service, so core stays clean while BFFs translate.

GraphQL vs REST is a per-client choice, not a religion. REST is simple, cacheable, and fits web SSR well — you can hit `GET /products` and get a predictable shape, cache it at the CDN, and render on the server. Mobile benefits more from GraphQL because it lets the client ask for exactly five fields on a list screen and the full 30 fields on a detail screen without new endpoints. That saves payload and round trips. The cost is complexity: you need query depth limiting, persisted queries, per-field authorization, and harder HTTP caching. A proven hybrid is GraphQL at the BFF layer sitting on top of REST or gRPC core services. The BFF exposes `query { products { id title thumb } }` to mobile while internally calling the same core `productService`. Do not give GraphQL directly to untrusted clients without limits — an unbounded nested query can become a DoS.

Pagination must be different per client because the UIs are different. Mobile scrolls an infinite feed on a small screen and poor network — you need small pages, fast first paint, and no jumps when data changes. Cursor-based pagination is the right default there. The client passes `?cursor=ey...&limit=20` and the server returns a stable next cursor, usually an opaque base64 of `(createdAt, id)`. It avoids duplicates and skips that offset pagination suffers when rows are inserted between pages. Web admin tables with page numbers can still use offset `?page=3&perPage=50` because jumping to page 47 is expected, but prefer cursor for any feed. In both cases compress, paginate images separately, and never send 500 full objects when 20 lightweight stubs will do. Include `hasNext` and `nextCursor` rather than total count when count is expensive.

Feature flags let you decouple deploy from release. Put a flag service or table behind the BFF — flags like `newCheckout` with rules per client, version, and percentage. The BFF resolves flags for that request and either includes the new shape or hides it. Mobile reads flags on app start or via a lightweight `/flags` poll, web reads them server-side per request. This lets you ship to production behind a flag, roll out to 5% of iOS users, keep Android off, and kill it instantly without a new binary. Keep flag evaluation fast and cached in memory, and clean up old flags — flag debt is real.

Auth has to respect the client's storage. Web can use httpOnly, Secure, SameSite cookies for server-rendered pages — the browser sends them automatically and JavaScript cannot read them. That helps against XSS stealing tokens. But cookies bring CSRF, so you need anti-CSRF tokens for mutations. Many teams now use a short-lived access token in memory plus a httpOnly refresh token hybrid for web. Mobile cannot rely on cookies well — apps store tokens in the OS keychain or secure storage, send `Authorization: Bearer <short-lived-access-token>` on every call, and rotate with a long-lived refresh token stored securely on device. Never embed a secret in the app binary — anything in the binary is public. Bind refresh tokens to a device fingerprint and allow server-side revocation so a stolen token can be killed. Both clients get rate limiting, but mobile needs more generous retry guidance because it will retry on flaky networks.

Offline sync is the mobile-only hard part. The pattern is a local queue plus a sync token. The app writes to a local DB immediately for optimistic UI, queues the mutation, and syncs when online with `POST /sync` carrying `lastSyncToken` or versions. The server applies changes idempotently using an `Idempotency-Key` so a retry on a tunnel exit does not create two orders. For conflict resolution, start simple with last-write-wins plus version numbers. If two edits overlap, the newer version wins and you return the merged state. If you need true collaborative editing, you reach for CRDTs, but most product feeds do not need that.

All of this needs observability split by client. Log `x-client: web@2.4.1` vs `x-client: ios@5.1.0`, trace per BFF, and alert on per-client error budget — a 1% error rate may be all mobile v4 users blocked by a missing field.

## 4. See It In Practice — Real Code or Queries

These are not toys. Each block shows a real slice you would actually ship.

**A. Two BFFs in front of shared core services**

```js
// core/productService.js — client-agnostic, owns the rule, knows nothing about mobile or web
export async function listProducts({ filter, cursor, limit }) {
  // cursor is opaque — core just translates it to a DB query
  return db.products.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit);
}

// bff-web/routes/products.js — web BFF: big payload, good for SSR
// GET /bff/web/v1/products?limit=50
bffWeb.get('/v1/products', async (req, res) => {
  const rows = await productService.listProducts({ filter: {}, cursor: req.query.cursor, limit: 50 });
  // web gets full fields for server render
  res.json({ data: rows, hasNext: rows.length === 50, nextCursor: encodeCursor(rows.at(-1)) });
});

// bff-mobile/routes/products.js — mobile BFF: tiny payload, offline-friendly
// GET /bff/mobile/v1/products?cursor=...&limit=20
bffMobile.get('/v1/products', async (req, res) => {
  const rows = await productService.listProducts({ filter: {}, cursor: req.query.cursor, limit: 20 });
  // only what the list screen needs — saves ~70% payload on 3G
  const data = rows.map(p => ({ id: p.id, title: p.title, thumb: p.thumb.small }));
  res.json({ data, hasNext: rows.length === 20, nextCursor: encodeCursor(rows.at(-1)) });
});
```

**B. URL versioning with deprecation headers**

```js
// api gateway / BFF router — keep v1 alive while v2 rolls out
app.use('/api/v1', v1Router);
app.use('/api/v2', v2Router);

// inside v1 handler — tell clients this version is dying, but do not break them yet
app.use('/api/v1', (req, res, next) => {
  // clients and dashboards can alert on these headers before you actually remove v1
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Sat, 01 Nov 2026 00:00:00 GMT');
  res.setHeader('Sunset-Link', '</docs/migration-v2>; rel="sunset"');
  next();
});
```

**C. Cursor pagination — why mobile wants this over offset**

```js
// opaque cursor helpers — client never parses the inside
function encodeCursor(doc) {
  if (!doc) return null;
  return Buffer.from(JSON.stringify({ t: doc.createdAt, id: doc._id })).toString('base64url');
}
function decodeCursor(cursor) {
  if (!cursor) return null;
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
}

// handler using cursor — stable even if new rows are inserted between pages
app.get('/bff/mobile/v1/feed', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const cursor = decodeCursor(req.query.cursor);
  const filter = cursor ? { $or: [
    { createdAt: { $lt: cursor.t } },
    { createdAt: cursor.t, _id: { $lt: cursor.id } }
  ]} : {};

  const rows = await db.posts.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1);
  const hasNext = rows.length > limit;
  const page = hasNext ? rows.slice(0, limit) : rows;
  res.json({ data: page, hasNext, nextCursor: hasNext ? encodeCursor(page.at(-1)) : null });
});
```

**D. Feature flags resolved per client in the BFF**

```js
// flag evaluation — fast in-memory cache, refreshed every 30s from flag service
function canSeeNewCheckout(req) {
  const client = req.header('x-client'); // e.g. "ios@5.1.0" or "web@2.4.1"
  const userBucket = hash(req.user.id) % 100;
  // we need this check here because we want to hold mobile on old flow until app review passes
  if (client.startsWith('ios@')) return userBucket < 10; // 10% of iOS only
  if (client.startsWith('web@')) return true;              // all web
  return false;
}

app.get('/bff/:client/v1/checkout-config', (req, res) => {
  res.json({ newCheckout: canSeeNewCheckout(req), payWithWallet: canSeeNewCheckout(req) });
});
```

**E. Auth: web cookies vs mobile bearer tokens**

```js
// web login — set httpOnly refresh cookie, return short-lived access token in body for memory use
app.post('/auth/login', async (req, res) => {
  const { accessToken, refreshToken } = await auth.issueTokens(req.body);
  res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'lax', path: '/auth' });
  res.json({ accessToken, expiresIn: 900 }); // 15 min
});

// mobile refresh — uses Authorization header, refresh token in secure storage on device
app.post('/auth/refresh', async (req, res) => {
  // we read refresh token from body here because mobile cannot send httpOnly cookies reliably
  const tokens = await auth.rotateRefreshToken(req.body.refreshToken, req.header('x-device-id'));
  res.json(tokens);
});

// protect both — one middleware that accepts either cookie or header, but knows which client it is
function authenticate(req, res, next) {
  const token = req.cookies.refreshToken // web SSR might use this path for refresh only
    ? req.header('authorization')?.replace('Bearer ', '')
    : req.header('authorization')?.replace('Bearer ', '');
  // real code verifies JWT, checks revocation list, and attaches req.user
  req.user = verifyAccessToken(token);
  next();
}
```

**F. GraphQL BFF over REST core — mobile asks only for what it needs**

```js
// bff-mobile GraphQL — thin resolver over the same productService
const typeDefs = `
  type Product { id: ID!, title: String!, thumb: String }
  type Query { products(limit: Int, cursor: String): [Product!]! }
`;

// same list screen as before, but now the client controls the shape
// query MobileFeed { products(limit: 20) { id title thumb } }
// query WebFeed    { products(limit: 50) { id title thumb description price } }
const resolvers = {
  Query: {
    products: (_, { limit, cursor }) => productService.listProducts({ filter: {}, cursor, limit })
  }
};
```

**G. Offline sync with idempotency key**

```js
// mobile sends queued mutation with same key on retry — server must not double-create
app.post('/bff/mobile/v1/orders', async (req, res) => {
  const key = req.header('Idempotency-Key'); // uuid generated on device before first try
  if (!key) return res.status(400).json({ error: 'Idempotency-Key required' });

  const existing = await db.idempotency.findOne({ key, userId: req.user.id });
  if (existing) return res.status(200).json(existing.response); // same response as first time

  const order = await orderService.createOrder(req.body);
  await db.idempotency.insertOne({ key, userId: req.user.id, response: order, createdAt: new Date() });
  res.status(201).json(order);
});
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Why not just use one REST API for both mobile and web?**

You can at the start, and many teams do. It breaks when the clients diverge on payload size, screen layout, network reliability, and release cycle. One handler accumulates `if (isMobile)` branches, response shapes bloat to cover both clients, and a change safe for web breaks an old mobile binary you cannot force to update. You end up coupling deploys — web cannot ship until mobile is ready. The fix is to keep core domain logic shared but push client shaping into a thin layer per client. That layer can be as small as a field-picking middleware at first, and a dedicated BFF service when the divergence hurts. If your mobile and web UIs are nearly identical and you have one team, a single well-versioned API is fine. If payloads, flows, or release cadences differ, split.

**Q: What is a Backend For Frontend and when should you use it?**

A BFF is a thin backend that exists for one client family — typically one for web and one for mobile. It does not own business rules. It aggregates calls to core services, reshapes data, handles client-specific auth and caching, and hides internal service topology from the client. You use it when clients need different payloads, different aggregation, or independent evolution. You avoid it when you have one small team and one similar UI — then it is extra ops cost for little win. The failure mode to avoid is a fat BFF that reimplements domain logic. If you are copying validation rules into the BFF, that rule belongs in core.

**Q: REST or GraphQL — which should mobile use?**

Mobile usually wins more with GraphQL because it can request exactly the fields for a small screen and avoid chatty round trips — list screen asks for three fields, detail screen asks for thirty, same endpoint. That saves radio time and battery. REST wins on simplicity and cacheability — a `GET /products` response caches cleanly at the CDN and is trivial to debug. For web SSR, REST is often enough. The pragmatic answer is GraphQL at the BFF over REST/gRPC cores: mobile talks GraphQL to its BFF, the BFF fans out to REST core services. If you expose GraphQL, add persisted queries, depth and cost limits, and per-field auth, because an open GraphQL endpoint lets a client craft an expensive query.

**Q: How do you version APIs without breaking old mobile apps?**

Treat breaking changes as new versions and additive changes as non-breaking. Adding an optional field is safe. Renaming, removing, or changing types is breaking and needs a new version. Prefer URL versioning for major versions like `/v1` and `/v2` because it is explicit in routing, logs, and CDN rules. Use additive evolution within a version and send `Deprecation` and `Sunset` headers on old versions with docs on migration. Keep old BFF versions running until metrics show near-zero traffic, and log `x-client` plus version so you know who is still on v1. Never version deep in core services — version at the edge or BFF so core stays clean.

**Q: How should pagination differ for mobile vs web?**

Use cursor pagination for feeds and infinite scroll — which is most mobile UIs. It gives a stable next page even when new items arrive, avoids the duplicate or missing row problem of offset, and does not require an expensive count. The cursor is an opaque token over `(sortKey, id)`. Use offset pagination only where the UI genuinely needs jump-to-page, like an admin table on web. Keep page sizes smaller for mobile — 20 vs 50 — and avoid sending total counts when they cost a full table scan. Return `hasNext` and `nextCursor` instead.

**Q: How do auth flows differ between mobile and web?**

Web can store a refresh token in an httpOnly, Secure, SameSite cookie that JavaScript cannot read, which helps against XSS, and send a short-lived access token in memory. Mutations then need CSRF protection. Mobile cannot depend on cookies — it stores tokens in the OS keychain or secure enclave and sends `Authorization: Bearer <accessToken>` on each request, refreshing with a long-lived refresh token when the access token expires. For both, keep access tokens short — 10 to 15 minutes — rotate refresh tokens, bind them to a device id, and support server-side revocation. Never ship a secret inside the mobile binary and never use localStorage for long-lived tokens on web.

**Q: How do you roll out a feature to web first and mobile later?**

Put the feature behind a flag evaluated in the BFF. Ship the code to production with the flag off. Flip it on for `web` at 100% and `ios` at 0% in your flag config, then gradually ramp iOS from 5% to 100% while monitoring per-client error rates. Mobile reads flags at app start and caches them, web evaluates per request. Because flags are separate from deploys, you can kill a bad feature instantly without a new binary or redeploy. Track flag debt — give every flag a owner and expiry issue so it does not live forever as dead branching.

**Q: What does the interviewer listen for that junior answers miss?**

A junior says "we use one REST API and add fields when mobile needs them." A senior says "we keep core services client-agnostic, shape data in per-client BFFs, version at the edge with a sunset policy, use cursor pagination for feeds, choose GraphQL where field selection pays off, handle offline with idempotency keys, and observe per client version." They name the tradeoff: BFFs add ops overhead but buy independent evolution, GraphQL saves payload but costs complexity, cursor pagination is stable but prevents jump-to-page. They also mention non-breaking evolution, token storage, and `x-client` observability without being prompted.

## 6. The Traps — What Goes Wrong in Production

**Shipping a breaking change without a version.** You rename `price` to `amount` in the same `/api/products` response. Web redeploys fine, but 40% of iOS users on last month's binary now crash on the product list because they still read `price`. The fix is additive evolution — keep `price`, add `amount`, deprecate `price` with headers, and only remove after sunset when metrics show v1 traffic near zero. Measure per `x-client` version before you delete anything.

**Over-fetching on a metered connection.** Your BFF forwards the full admin product object — 85KB with history, audit, and nested vendor — to a phone that only needs three fields. On 3G that is two seconds per screen and the radio stays hot, draining battery. The fix is mobile-specific shaping in `bff-mobile` or a GraphQL query for just `id`, `title`, `thumb`. Measure payload size per endpoint per client and set a budget, like 20KB for list pages.

**Using offset pagination for an infinite feed.** `?page=47&limit=20` works on web tables, but on a live feed a new post inserted at the top shifts every offset by one. Users see duplicates when pulling to refresh and missing posts when scrolling. If you use offset for a feed you will get bug reports you cannot reproduce locally. Use cursor pagination over a stable sort key like `(createdAt, id)` and return an opaque `nextCursor`.

**Storing auth wrong for the client.** Putting a long-lived JWT in web localStorage makes it readable to any XSS script. Putting a secret API key in the mobile binary means it is public — anyone can unpack the APK. Storing a refresh token without binding lets a stolen token be replayed from another device. Use httpOnly cookies or memory for web, OS keychain for mobile, short-lived access tokens, rotation on refresh, device binding, and a revocation list. And add CSRF tokens for cookie-authed web mutations.

**Turning the BFF into a monolith.** The mobile BFF starts aggregating `GET /products` + `GET /prices` + `GET /inventory` and someone adds business logic like "apply discount if user is premium" inside the BFF. Now the rule lives in two places and diverges from core. BFFs should reshape and orchestrate, not decide. If you see validation or pricing logic in a BFF, move it to core and have the BFF call it.

**N+1 aggregation in the BFF.** The BFF loops over 20 products and calls `userService` for each author sequentially. Twenty serial round trips turns a 50ms handler into an 800ms one. At higher fan-out it times out under load. Batch or parallelize — `Promise.all` with a concurrency limit, or a DataLoader style batcher — and add a timeout and fallback per downstream call so one slow service does not take down the whole screen.

**No client identification.** Without `x-client: ios@5.1.0` and `x-version` headers you cannot tell which client is spiking errors or still using v1. When a bug hits you are blind. Require a client header, log it, trace it, and build dashboards per client. It also powers flag targeting and graceful degradation — serve a simpler response to old clients instead of crashing them.

**Forgetting idempotency for mobile mutations.** A user on a subway taps Buy, the request times out, the app retries automatically, and without an `Idempotency-Key` you create two orders and charge twice. Mobile will retry — the network guarantees it. Require an idempotency key for every mutating call from mobile, store the first response, and return the same response for retries within a window.

## 7. Compare With Related Concepts

**BFF vs API Gateway vs single shared API.** A shared API is one handler trying to serve everyone — simple at first, coupled later. An API Gateway is a generic edge that does routing, rate limiting, and auth for all clients the same way. A BFF is client-specific shaping — it knows mobile needs smallpayloads and offline hints while web needs SSR fields. Use a gateway for cross-cutting concerns in front of BFFs. Use BFFs when client shapes diverge. Start with a single API, add a gateway when you have multiple services, add BFFs when client branching hurts. The rule is gateway for generic, BFF for specific.

**REST vs GraphQL per client.** REST gives you predictable, cacheable resources and simple debugging — good default for web. GraphQL gives you client-controlled field selection and fewer round trips — good fit for mobile where payload and round trips cost battery. GraphQL costs more to operate — schema governance, query cost analysis, harder CDN caching. If you pick GraphQL, run it at the BFF, not as a direct pass-through to the database, and add persisted queries and limits.

**URL versioning vs header versioning vs additive evolution.** Additive evolution — adding optional fields — needs no version and is always preferred. When you must break, URL versioning like `/v1` vs `/v2` is the most visible and easiest to operate. Header versioning like `Accept: application/vnd.app.v2+json` keeps URLs clean but is invisible in logs and harder to cache. Query param versioning works but pollutes URLs. Pick URL versions for major breaks and additive changes for everything else, with sunset headers to communicate the timeline.

**Cursor pagination vs offset pagination.** Offset is simple and lets users jump to page 47, but it skips or duplicates rows when data changes and gets slow for deep pages. Cursor is stable, fast for feeds, and works without a total count, but you cannot jump to an arbitrary page. Use cursor for mobile feeds and infinite scroll, offset only for back-office tables where jump matters.

**Feature flags vs config vs branching.** A long-lived branch for a feature is a merge nightmare. Config requires a redeploy. Feature flags let you deploy code dark and flip it per client, percentage, or version without a deploy. They cost flag debt — you must clean them up. The rule is deploy mainline always, release with flags.

**Cookie auth vs bearer token auth.** Cookies with httpOnly are strong for web because JavaScript cannot steal them, but they need CSRF tokens. Bearer tokens in Authorization headers are simple for mobile and do not need CSRF, but you must store them securely and handle refresh and revocation yourself. Many modern web apps use a hybrid — httpOnly refresh cookie plus short-lived bearer access token in memory.

## 8. 🧠 The Memory Hook

One kitchen, two plating stations. Core services cook the same food, each BFF plates it for its room — tiny lunch boxes for mobile, big platters for web — and you never rip the old menu out of a phone user's hand; you add a new menu and let the old one sunset.
