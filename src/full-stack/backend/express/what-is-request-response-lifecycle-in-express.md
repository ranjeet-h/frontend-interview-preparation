# What Is the Request-Response Lifecycle in Express

## 1. The Real-World Problem — When You Actually Hit This

It's Friday night, your checkout endpoint `/api/checkout` is getting hammered, and three different things go wrong at once.

Some customers report the spinner that never stops. Your logs show the payment code ran fine, the charge went through, but the browser just hangs there. Other customers trigger a crash in your error tracker: `ERR_HTTP_HEADERS_SENT`. And then, worst of all, one pod of your server dies completely — every user connected to that instance gets their connection dropped mid-request, and your pager lights up.

When you dig in Monday morning, none of these are database bugs or bad code logic. They're all the same root cause: nobody on the team had a precise mental model of the journey a request takes through Express. One developer wrote middleware that forgot to call `next()`, so requests quietly stalled forever. Another sent a response in two branches of an `if` without a `return` between them. And a third wrote an `async` route handler whose rejected promise nobody caught — which, in Express 4 on modern Node, kills the entire process and takes down every request currently in flight.

You cannot debug any of those failures from reading the handler code alone. You need to know the whole road: where a request enters, what touches it and in what order, when it leaves, and all the places it can get stuck, get answered twice, or blow up the server. That road is the request-response lifecycle.

## 2. The Analogy — Make the Mechanic Obvious

Think of your Express server as an air traffic control tower, and think of every incoming request as an aircraft arriving into your airspace.

The tower has **one controller** managing every aircraft at once. The controller never flies a plane personally — they read the situation, issue one instruction, move attention to the next radio call, and come back when the answer arrives. That single controller is the Node event loop. Many requests are "in the air" at the same time, even though one person is coordinating all of them.

Every aircraft must follow a **published arrival procedure**, in a fixed order that was printed long before any flight arrived: enter the airspace, contact approach control, pass the reporting points, reach final approach. That printed procedure is your middleware stack, registered once at startup with `app.use()` and `app.get()`. The order it was written down in is the order every flight flies it in. Registration order is execution order.

At each reporting point, the controller has exactly two choices: **clear the flight to continue** (call `next()`), or **handle it right here and turn it away** — "you don't have a landing slot, divert to your alternate" — which is a short-circuit. Auth middleware failing a request and replying `401` is exactly that diversion: the flight never reaches the runway, and that's correct behavior.

The **assigned gate at the end of the procedure** is your route handler. That's where the actual work happens — the DB query, the payment charge, the business logic. While that work waits on slow things (a database answering), the controller doesn't sit and stare at it; they handle other flights and come back when the result arrives. But if the controller decides to personally do one flight's paperwork for twenty minutes without looking up, every other aircraft in the sky is left hanging. Synchronous CPU-heavy work in a handler does exactly that to your server.

Here is the part that bites teams in production: **a landed plane is not a delivered passenger.** The pilot completing the checklist means nothing to the traveler until someone explicitly says "cleared to gate" and hands over the clearance. In Express, your handler finishing its work is not a response. Until you explicitly transmit — `res.json(...)`, `res.send(...)` — the client is still circling, burning fuel. A handler that computes a result and returns without sending leaves the request in a holding pattern forever.

And there's a **dedicated emergency lane**: if something catches fire at any point — an exception, a failed query — the flight skips every remaining normal procedure and goes straight to the emergency-handling crew waiting at the very end of the line. Those are your error-handling middleware functions. Regular stations never see the flight again.

Even after a plane lands, the **radio channel stays open** for a bit rather than being torn down and renegotiated for the next exchange — that's a keep-alive TCP connection being reused for the next request.

Map check: one controller = the event loop; printed procedure = middleware stack in registration order; clearing to continue = `next()`; turning a flight away on the spot = short-circuiting with a response; assigned gate = matched route handler; explicit clearance = explicit `res.send`; circling without clearance = hung request; emergency lane = error middleware; open radio channel = keep-alive connection.

## 3. The Full Explanation — How It Actually Works

Let's walk one real request from wire to wire. Plain words first, official names after.

**Stage 0 — before Express even sees it.** A client opens a TCP connection to your port. The operating system accepts it and hands the raw stream of bytes to Node. Node's built-in HTTP server (started by your `app.listen(...)` call) parses those bytes according to the HTTP format and produces two objects: one describing the request — method, URL, headers, plus a readable stream for the still-arriving body — and one representing your side of the conversation, the thing you write the reply into. Node calls these `IncomingMessage` (`req`) and `ServerResponse` (`res`). Express doesn't create these objects; it *decorates* them, adding its own methods like `res.json()` and properties like `req.params` on top of what Node gave it. Everything Express does happens through those two objects.

**Stage 1 — the stack walk begins.** At startup, every `app.use(...)` and `app.get/post/put/delete(...)` call pushed one layer onto a single ordered list inside your app. That list was frozen when your process booted. For each arriving request, Express walks that list strictly top-down. A layer only participates if its method and path pattern match the request. This is why middleware order is not a style preference — the list is executed exactly in the order you registered it, every single time.

**Stage 2 — the contract at every station.** Each participating layer receives `(req, res, next)` and owes the tower one of two things: finish the conversation itself (send a response), or explicitly hand off to whatever comes next (`next()`). `next()` is not magic — it just tells Express "I didn't handle this, resume the walk at my position in the list." If a layer does neither — no response, no `next()` — the walk simply stops right there. Not errors, not falls through to a 404. Stops. The client spins until it or some proxy in front of you gives up. This is the single most silent failure mode in Express apps.

**Stage 3 — short circuits are features.** Any layer can respond on its own and end the journey early. CORS preflight answers before your routes ever run. Rate limiters reject with `429` at the door. Auth middleware rejects with `401`. Static file servers answer directly from disk for files they recognize. None of these are hacks — responding early is a designed part of the lifecycle, and it's why expensive work should always be registered *after* cheap rejection checks.

**Stage 4 — the route matches.** When the walk reaches a layer whose method and path pattern fit — say `app.post('/orders/:id')` matching `POST /orders/42` — Express extracts the dynamic parts into `req.params` and invokes the handler(s) attached to that route. A single route can have several callbacks running in sequence (auth check, validation, then the real handler), each receiving `next`. There's a special signal here: `next('route')` skips the *remaining callbacks of this route* but continues looking for other matching routes — useful for "this validator says this request isn't for us, try further down."

**Stage 5 — the handler works, and the thread stays free.** Inside the handler you typically `await` slow things: a database round trip, an external API. Here's the event loop insight the tower analogy gives you: while that promise is pending, Node's single thread is *not* blocked. It processes other connections, accepts new requests, runs other handlers. Your suspended request survives as a closure — the `req`/`res` pair is captured and alive, waiting to be resumed when the awaited result lands. The exception is synchronous CPU work: a big JSON parse, a heavy regex, an image resize done inline. That never yields the thread, so the one controller is busy and *every* other request in flight freezes with it.

**Stage 6 — the response is transmitted, explicitly.** Calling `res.status(201).json(order)` does several things in one motion: sets the status code, sets `Content-Type` and `Content-Length` (if you haven't already), serializes the object to a JSON string, writes headers and body out to the socket. From the moment headers are flushed, `res.headersSent` is `true`, and the reply is locked — a second attempt to send throws `ERR_HTTP_HEADERS_SENT`. After `res.end()` (which `.send()`/`.json()` call internally), `res.writableEnded` reports `true`. Older material references `res.finished` for this — that flag is deprecated; use `res.headersSent` and `res.writableEnded`. Once the response ends, the TCP connection usually stays open anyway (HTTP/1.1 keep-alive), ready for the next request to reuse it.

**Stage 7 — falling off the end of the list.** Suppose every layer called `next()` and no route matched and nobody responded. Express does *not* leave the client hanging here — it has a built-in final handler that replies with a plain-text `Cannot GET /whatever` and status `404`. That default exists, but it's ugly and inconsistent with a JSON API, which is why every real app registers its own catch-all *after* all routes: by that position, reaching it means nothing above claimed the request. Two different failure shapes, keep them separate in your head: *stack exhausted with no response* → built-in 404; *walk stopped mid-way because someone forgot `next()`* → silent hang.

**Errors ride a separate lane.** If a handler *throws synchronously*, Express catches the throw during the stack walk and reroutes it as if you'd called `next(err)`. But if your handler is `async` and its promise rejects, Express 4 does not notice — it never awaited your promise. The rejection becomes an *unhandled rejection*, and modern Node (v15+) treats that as fatal: the process exits, dropping every in-flight request. This is why disciplined Express 4 code wraps async handlers in `try/catch` and forwards with `next(err)`, or mounts a wrapper library that does it globally. Express 5 fixes the root cause: it awaits handler promises and forwards rejections to the error path automatically.

Once an error enters that lane, `next(err)` behaves differently: Express skips *all* remaining regular layers and looks for the first function registered with exactly four parameters — `(err, req, res, next)`. That four-argument signature is literally how Express recognizes error handlers; register a three-argument "error handler" and Express will treat it as normal middleware that never runs for errors. Error handlers belong at the bottom of the stack, below the catch-all 404, because they must see errors from everything above them. Multiple error handlers can chain by calling `next(err)` again. One edge case worth knowing cold: if an error fires *after* headers were already sent, Express can't send a clean error response anymore, so its default handler abandons the exchange and closes the socket.

**How this connects to everything around it.** Behind a reverse proxy or load balancer, the TCP peer you see is the proxy, not the user — configure `trust proxy` or `req.ip` logs the wrong source and rate limiting keys off the proxy. Put your request logger and correlation-ID middleware *first*, so every later stage logs with the same ID, and hook `res.on('finish', ...)` for timing, since it fires after the response is flushed regardless of which layer ended it. Cap request bodies early — `express.json()` defaults to rejecting bodies over about 100 KB — so a giant payload is refused before it reaches a handler. And place security checks before money-touching routes: the lifecycle guarantees you an ordering tool; only correct use of it protects you.

## 4. See It In Practice — Real Code or Queries

A small but production-shaped app that exposes the whole journey. Every stage from the explanation above is marked.

```js
// app.js — run with: node app.js
const express = require('express');
const app = express();

// STAGE 1+3: first-registered layer, runs for every request.
// It never responds — it observes, then hands off with next().
app.use((req, res, next) => {
  const startedAt = Date.now();
  // 'finish' fires after the response is flushed to the network,
  // no matter WHICH layer ended up sending it. Perfect for logging.
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt}ms)`);
  });
  next(); // delete this line and EVERY request hangs. Try it locally.
});

// Body parsing: buffers the request's byte stream into req.body,
// refusing payloads over ~100KB by default.
app.use(express.json());

// STAGE 3: short-circuit middleware. Bad key -> response HERE,
// and the request never reaches any route below.
function requireApiKey(req, res, next) {
  if (req.get('x-api-key') !== 'secret123') {
    return res.status(401).json({ error: 'unauthorized' }); // return + send: chain over
  }
  next();
}

// STAGE 4+5: first matching method+path wins; :id lands in req.params.
app.get('/orders/:id', requireApiKey, (req, res) => {
  res.json({ id: req.params.id, items: ['coffee', 'mug'] }); // STAGE 6: explicit send
});

// STAGE 5: async handler in Express 4 — WE own error forwarding.
app.post('/orders', requireApiKey, async (req, res, next) => {
  try {
    const order = { id: Date.now(), items: req.body.items };
    // imagine: await db.orders.insert(order)
    res.status(201).json(order);
  } catch (err) {
    next(err); // without this, a rejection here kills the whole process (Node >= 15)
  }
});

// STAGE 7: catch-all 404 — AFTER all routes. Reaching me means
// nothing above responded.
app.use((req, res) => {
  res.status(404).json({ error: `no route: ${req.method} ${req.originalUrl}` });
});

// ERROR LANE: LAST, and exactly 4 parameters — that arity is how
// Express recognizes it. Skipped for happy requests, target for next(err).
app.use((err, req, res, next) => {
  console.error(err);
  // Never leak stack traces to clients in production.
  res.status(500).json({ error: 'internal error' });
});

app.listen(3000, () => console.log('listening on :3000'));
```

Exercise it with three requests and watch the lifecycle make the decisions:

```txt
$ curl -i localhost:3000/orders/42 -H "x-api-key: wrong"
HTTP/1.1 401 Unauthorized            # short-circuit at requireApiKey — route never ran

$ curl -i localhost:3000/orders/42 -H "x-api-key: secret123"
HTTP/1.1 200 OK                      # walked past auth, matched route, explicit send
{"id":"42","items":["coffee","mug"]}

$ curl -i localhost:3000/nope
HTTP/1.1 404 Not Found               # stack exhausted with no response -> our catch-all
{"error":"no route: GET /nope"}

# console shows one 'finish' log line per request — proof every journey ended somewhere
```

Now the three classic wounds from Section 1, in miniature — mistake first, fix beside it:

```js
// WOUND 1 — double send: both branches run, second send throws ERR_HTTP_HEADERS_SENT
app.get('/broken-discount', (req, res) => {
  if (!req.query.code) {
    res.status(400).json({ error: 'code required' });
    // BUG: no return — execution FALLS THROUGH to the send below
  }
  res.json({ discounted: true });
});

// FIX — sending must also STOP your function:
app.get('/fixed-discount', (req, res) => {
  if (!req.query.code) {
    return res.status(400).json({ error: 'code required' });
  }
  res.json({ discounted: true });
});
```

```js
// WOUND 2 — forgotten next(): no crash, no log, every request to /reports hangs
app.use('/reports', (req, res, next) => {
  console.log('entered, did nothing, told nobody');
  // no res.send, no next() — the stack walk stops dead RIGHT HERE
});

// WOUND 3 — async rejection in Express 4: takes down the ENTIRE process
app.get('/flaky4', async (req, res) => {
  throw new Error('boom'); // Express 4 never awaits me -> unhandled rejection -> process exits
});

// Express 5 handles this exact case natively: the rejection is
// forwarded to the error lane automatically. On Express 4 you MUST
// try/catch and next(err), or mount a wrapper library globally.
```

All three wounds share one property: reading the happy-path handler tells you nothing. Only the lifecycle model — who advances the walk, who ends it, what happens to a rejection — reveals them.

## 5. Interview Questions — All of Them, Done Properly

**Q: Walk me through what happens when a request hits an Express server, end to end.**

Start before Express: the OS accepts the TCP connection and hands the bytes to Node's HTTP server, which parses them into a request object (`IncomingMessage`) and a response object (`ServerResponse`). Express decorates those two objects with its own API and starts walking its middleware stack — a flat, ordered list built at boot from every `app.use()` and route registration. It visits layers top-down, and each matching layer gets `(req, res, next)` and must either respond or call `next()`. Layers like CORS, body parsing, and auth usually run here; any of them can short-circuit with its own response. When the walk hits the first layer whose method and path match the request, that's the route: params land in `req.params` and the handler executes the business logic, often `await`ing I/O — during which the single-threaded event loop happily serves other requests. Finally the handler transmits explicitly with `res.json()` or similar, headers flush, `res.headersSent` becomes true, and the response ends. If the walk instead exhausts the stack with no response, Express's built-in final handler returns a plain-text 404; if an error occurs anywhere, it's routed to the four-argument error middleware at the bottom of the stack.

**Q: What does Node own versus what does Express own in this lifecycle?**

Node owns transport and parsing: accepting the TCP connection, parsing raw bytes into `req` and `res`, streaming the request body, managing sockets, keep-alive, and timeouts. Express owns orchestration: the ordered layer stack, path matching, parameter extraction, the `next()` mechanism, response helper methods, and the error-routing convention. Nothing Express does changes the runtime model — it's still one Node thread driven by the event loop, still the same two objects Node created. That division is a great way to answer questions like "where would a bug be invisible to Express?" — anything at the transport level (slow clients, half-open connections, TLS problems at a proxy) belongs to Node's territory, not Express's.

**Q: How does Express know a request is complete? Does returning from a handler count?**

Returning never counts. The request is complete only when a response method actually writes to the socket — `res.send()`, `res.json()`, `res.sendFile()`, `res.end()`. Those serialize the data, set `Content-Type` and `Content-Length` if unset, flush headers, and mark the exchange over: afterwards `res.headersSent` is `true` and `res.writableEnded` is `true` (the older `res.finished` flag is deprecated). Any further attempt to modify headers or send again throws `ERR_HTTP_HEADERS_SENT`. This is also why observability code listens to `res.on('finish', ...)`: it fires exactly when the response has gone out, no matter which layer sent it. The practical consequence: a handler that computes a result and `return`s without sending leaves the client hanging — the framework won't send anything on your behalf.

**Q: What happens if no route matches the incoming request?**

Two sub-cases, and separating them makes you sound senior. If the walk runs to the end of the stack — every middleware called `next()`, nothing matched, nobody responded — Express's built-in final handler responds with a plain-text `Cannot GET /path` and status 404. The request does *not* hang in that case. It hangs in the *other* case: some middleware stopped the walk by neither responding nor calling `next()`. Then the stack is never exhausted, the default 404 never triggers, and the client waits until it or an intermediary times out — with zero errors logged. Because the built-in 404 is plain text and leaks nothing useful, real apps register their own catch-all after all routes (`app.use((req, res) => res.status(404).json(...))`), positioned *before* the error handler: unmatched requests reach the catch-all, genuine errors flow past it into the four-argument error handler.

**Q: How do errors propagate through the lifecycle? Why do async errors crash Express 4 apps?**

Synchronous throws inside any layer are caught by Express during the stack walk and converted into an error hand-off — equivalent to calling `next(err)`. `next(err)` flips the walk into error mode: every remaining *regular* layer is skipped, and Express lands on the first function registered with exactly four parameters, `(err, req, res, next)` — the arity is the detection mechanism. Error handlers therefore belong last; they can chain by calling `next(err)` again, and if none exists or headers were already sent, Express's default handler closes the connection. The async gap: Express 4 never awaits your handler's promise, so a rejection is invisible to it and surfaces as an unhandled rejection — which Node v15+ treats as fatal by default, exiting the process and dropping every in-flight request. Hence the Express 4 discipline: wrap async handlers in `try/catch` and forward with `next(err)`, or mount a global async wrapper. Express 5 closes the hole by design — handler promise rejections are forwarded to the error lane automatically.

**Q: Why does middleware order matter so much? Give concrete examples.**

Because the stack is executed strictly in registration order, position is semantics. Register the 404 catch-all before your routes and it swallows everything — it responds, so no route below ever runs. Register the error handler before the routes it should cover and it never sees their errors. Put `express.json()` after a route that reads `req.body` and the body is `undefined`. Put expensive checks before cheap ones and you pay for work you'd have rejected anyway — rate-limit and auth should run before anything touching a database. Put logging first and every later stage shares one correlation ID. A good closing line: Express gives you a sequencing machine; correctness comes entirely from what you put where.

**Q: Can one slow request affect others? Under what circumstances?**

Yes, in one specific and dangerous circumstance. While handlers `await` I/O, the event loop serves everyone else — ten thousand pending DB calls cost you memory, not throughput. But synchronous CPU work never yields: a huge JSON.parse, a pathological regex, an inline image resize — during those milliseconds-to-minutes, the single thread is occupied and *every* concurrent request, on every connection, stalls behind it. Health checks start failing, load balancers declare the instance dead, cascading restarts begin. The senior-sounding additions: stream large responses instead of buffering them (`res.write` chunks), push CPU-heavy work to worker threads or a queue, and watch event-loop lag metrics to detect blocking before users do.

**Q: What's the difference between `app.use()`, `app.get()`, `return`, `next()`, and `next('route')`?**

`app.use(fn)` registers a layer for every method, matching every path (or a mount prefix) — it's for pipeline-wide concerns. `app.get(path, fn)` registers a layer only for GET requests matching that exact pattern — routing. Within the pipeline: `next()` advances the walk to the next matching layer; `return` merely exits *your current function* and says nothing about the chain — that's why the idiom is `return res.send(...)` (stop my function *and* end the journey), and why `res.send(...)` without `return` inside an `if` invites the double-send crash. `next('route')` is the narrow escape hatch: abandon the remaining callbacks of *this* route but keep searching for other routes — different from `next()`, which continues into whatever layer is next, and from `next(err)`, which jumps to the error lane.

## 6. The Traps — What Goes Wrong in Production

**The double send.** The assumption: once I've called `res.json()`, my handler is done. The reality: `res.json()` ends the *response*, not your JavaScript. An `if` that sends in one branch without a `return` falls straight through into another send, and the second one throws `ERR_HTTP_HEADERS_SENT` — a 500 your users see, triggered by your own guard clause. The nastier variant is a race: two async paths both eventually respond (say, a timeout fallback and the real result), whichever loses throws. Fix: treat every send as terminal — `return` immediately after it — and know `res.headersSent` lets you check before attempting another.

**The forgotten `next()`.** Someone adds middleware, tests their feature, forgets the hand-off. Result: no exception, no log line — every request hitting that layer just freezes, and the first alert is usually a load-balancer health-check timeout minutes or hours later. This is the most expensive failure shape in Express precisely because it produces silence instead of stack traces. Fix: review any newly registered middleware for the contract — respond *or* `next()`, exactly one, always.

**The async error that kills the process.** In Express 4, an uncaught rejection in an `async` handler doesn't fail one request — it fails the *server*: Node v15+ exits on unhandled rejections by default, dropping every in-flight response at once. Teams meet this as "the pod died during peak traffic" and blame the database. Fix on Express 4: `try/catch` + `next(err)` in every async handler, or a global wrapper library mounted before routes; or move to Express 5, which forwards rejections natively.

**The error handler that isn't one.** Written with three parameters instead of four, it's silently classified as ordinary middleware — it never runs for errors, and requests die at Express's built-in handler instead: an HTML 500 page in dev (stack traces included!) or a bare connection close in prod. Related misplacement: registering the error handler *above* routes means their errors sail past it. Fix: four arguments, bottom of the stack, always after the 404 catch-all.

**The catch-all that eats the app.** Same shape as the previous trap but for 404s: a responding catch-all registered before your routes answers everything first, and every route below becomes unreachable code. The tell is eerie — "none of my endpoints exist" — because each request gets a well-formed 404. Fix: catch-all after all routes, before the error handler.

**Blocking the one thread.** A handler validates tokens with a heavy regex or converts a large CSV inline. During that synchronous work the event loop can't switch tasks, so *unrelated* requests on other connections stall too — latency spikes cluster across all endpoints at once, which is the diagnostic signature. Fix: keep handlers off the CPU (stream, chunk, or delegate to worker threads/queues) and monitor event-loop lag.

**Trusting the wrong client IP.** Behind nginx or a cloud load balancer, your server's TCP peer is the proxy — so `req.ip` is the proxy's address unless you set `trust proxy`, and rate limiting keyed on IP throttles everyone collectively or nobody effectively. The lifecycle touches the socket directly, so anything derived from connection identity needs proxy awareness. Fix: configure `trust proxy` to match your actual deployment topology.

## 7. Compare With Related Concepts

**Lifecycle versus middleware.** People use the words interchangeably; they shouldn't. The lifecycle is the whole journey — connection, parsing, walk, route, response. Middleware is one *participant* in it: a layer on the stack with the respond-or-`next()` contract. Rule: when asked about the lifecycle, describe the journey and mention middleware as its moving parts; when asked about middleware, describe the contract and its position in that journey.

**Express versus raw `http.createServer`.** Same runtime, same `req`/`res` objects, same event loop. Raw Node gives you one callback per request and nothing else; Express adds the ordered stack, routing, params, and helpers on top. Rule: reach for raw Node only when you need zero framework overhead (a proxy, a tiny internal service); otherwise Express's structure is the point.

**Express 4 versus Express 5.** The headline difference lives exactly on this page: Express 4 ignores handler promise rejections (manual forwarding required); Express 5 awaits them and routes rejections to the error lane automatically. Express 5 also tightened path matching (the router regex engine changed, breaking some exotic patterns). Rule: greenfield projects start on 5 and drop the async-wrapper ceremony; existing 4 apps need the discipline until migrated.

**Express versus Koa.** Koa's stack composes with `async`/`await`: middleware can act both before and after the downstream layers run, there's no `next(err)` convention (just `throw`), and you assign a response via `ctx.body` rather than calling send methods. Express is a linear walk with explicit hand-offs and explicit sends. Rule: Koa when you want onion-style around-each-request behavior natively; Express when you want the ecosystem, hiring pool, and linear predictability.

**Express versus Fastify.** Fastify formalizes the journey into named lifecycle *hooks* (`onRequest`, `preHandler`, `onSend`, ...) rather than one flat walk, awaits handlers, and will auto-serialize and send a value you simply `return`. Express expects you to send explicitly and build pipelines by ordering. Rule: Fastify for structured hook boundaries and schema-driven speed out of the box; Express for ubiquity and middle-of-the-road familiarity.

**`next()` versus `return`.** `next()` speaks to the *pipeline*: advance the walk. `return` speaks to *your function*: stop executing me. Orthogonal controls — which is exactly why the idioms collide (`return res.send(...)` does both jobs at once) and why forgetting either produces a different classic bug (missing `return` → double send; missing `next()` → hang).

## 8. 🧠 The Memory Hook

Your server is a control tower and every request is an aircraft: it moves only while someone calls `next()`, it lands only when you explicitly issue clearance (`res.send`), a fire skips straight to the emergency crew at the end of the line, and the one controller juggling every plane is the event loop — a handler that returns without clearance leaves passengers circling forever.
