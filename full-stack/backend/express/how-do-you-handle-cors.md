# How do you handle CORS

## 1. The Real-World Problem — When You Actually Hit This

It's Friday afternoon. The frontend deploys to `https://app.example.com`, calls the API at `https://api.example.com`, and the console floods red: "has been blocked by CORS policy." You open your backend logs and every request shows a clean 200. You curl the endpoint and get perfect JSON back. Your PM asks the question that makes this topic famous: "If the API says 200, why is the site broken?"

Nothing is wrong with your endpoint logic. The server received the request, processed it, and sent a correct response. The browser looked at the response, didn't find the permission slip it wanted, and hid the entire response from your JavaScript. That gap — server says yes, browser refuses to hand over the answer — is CORS, and the fix lives in your Express configuration, not in your route handlers.

Every developer hits this within weeks of their first separated frontend and backend, and almost everyone's first debugging session goes badly because the error messages point at headers they've never configured and tools that behave differently than their code. Understanding CORS once — really understanding who enforces it and when requests actually fire — turns a week of mysterious failures into a two-minute diagnosis.

## 2. The Analogy — Make the Mechanic Obvious

Picture a gated neighborhood of private homes, and you're a resident who never drives yourself anywhere. Every trip you take is driven by your family chauffeur. You hand him a note, he drives, he comes back and reports.

Your JavaScript is that resident. The chauffeur is the browser. You never talk to another house directly — every HTTP request goes through the driver.

Each house posts a sign at its own gate listing which addresses it welcomes visitors from. That sign is the `Access-Control-Allow-Origin` header. The house decides what the sign says; the API server decides which origins it permits.

Here's the twist that makes everything click: the sign belongs to the destination, but the enforcement belongs to YOUR chauffeur. If the gate has no sign naming your address, your driver still knocks, the household may still answer, letters may still be delivered — but on the way home, your driver silently shreds the reply and hands you an empty envelope. The visit happened. You just never got to read anything. That is exactly what a "failed" CORS request is: often the server processed it fully, and the browser withheld the response from your code.

Two kinds of trips exist. A postcard is a simple request — ordinary mail anyone could send. The chauffeur delivers it without asking first, and only the reply gets shredded if the sign doesn't cover you. Moving heavy equipment in with special tools is different: before that trip, the chauffeur drives over empty-handed and asks the gatekeeper directly — "This address wants to bring in a crane and a toolbox marked 'Authorization.' Do you accept deliveries like that?" That advance call is the preflight: an automatic `OPTIONS` request announcing the method and headers the real request intends to use. The gatekeeper replies in writing — which methods are accepted, which tools are allowed, and how long this written answer stays valid. Your driver files the note in the glovebox so he doesn't have to ask again on every trip; that filing time is `Access-Control-Max-Age`.

Some parcels need a signature and can't be left with anyone. For those, two extra rules apply. First, the gate sign must name your address explicitly — a lazy "welcome, everyone!" sign doesn't count when signatures are involved, because a stranger could collect your parcel. Second, you must have told your chauffeur in advance that these trips should carry your ID card. If either side skips their part, the signature trip fails. That is credentials: cookies that travel with the request, requiring an explicit origin on the server and `credentials: 'include'` on the client.

Last thing about the neighborhood: burglars don't use chauffeurs. A thief hops the fence directly — that's curl, Postman, or any server-to-server call. They never meet your driver, never read signs, and the signs were never meant for them. The signs exist to stop residents of OTHER gated communities from using their drivers to snoop on this neighborhood's households using a borrowed garage remote. Hold onto that: the policy is written at the destination, enforced by your own driver, and irrelevant to anyone driving alone.

## 3. The Full Explanation — How It Actually Works

Browsers wall off web pages from each other by default. A page loaded from one origin — scheme plus host plus port, all three counted separately — is not allowed to read responses from a different origin. This default block is called the same-origin policy, and its purpose is protecting users: without it, any random page could quietly read your Gmail or your bank balance in your logged-in session. CORS — Cross-Origin Resource Sharing — is the official escape hatch. The server declares, in response headers, which other origins the browser may share its responses with. The declaration is server-side; the enforcement is entirely inside the browser.

Because `localhost:3000`, `localhost:5173`, and `127.0.0.1:3000` differ in port or host, your Vite dev server calling your local API is already cross-origin. That's why CORS pain usually starts on day one of development, not just in production.

Every cross-origin browser request takes one of two paths, decided before anything is sent. The browser sorts requests into simple requests and everything else. A simple request uses GET, HEAD, or POST, carries no custom headers beyond the classics (`Accept`, `Accept-Language`, `Content-Language`, and a restricted `Content-Type`), and if it has a body, the body type must be one a plain HTML form could produce: `application/x-www-form-urlencoded`, `multipart/form-data`, or `text/plain`. That list looks arbitrary until you realize what it is: it's exactly what a 2005-era HTML form could submit without asking anyone's permission. Anything a pre-CORS web form couldn't do to a server — PUT, DELETE, JSON bodies, an `Authorization` header — needs clearance first.

On the simple path, the browser just sends the real request immediately, adding an `Origin` header stating which page launched it. The server processes the request completely and responds normally. Before handing the response to your JavaScript, the browser checks `Access-Control-Allow-Origin` in the response. If it matches the requesting origin exactly, or is the wildcard `*`, your code receives the data. If not, the browser throws a `TypeError: Failed to fetch`, and the response is discarded. Notice what did NOT happen: the request was not blocked. A cross-origin POST that "fails CORS" still hit your handler. Side effects fired. Rows were inserted. Only the reading was prevented. Interviewers love candidates who know this.

Everything else takes the preflight path. Before sending the real request, the browser automatically fires an `OPTIONS` request to the same URL with three things attached: an `Origin` header, `Access-Control-Request-Method` naming the intended method, and — if custom headers are involved — `Access-Control-Request-Headers` naming them. The preflight carries no cookies, no `Authorization` header, no body. It's pure paperwork. To pass, the server must respond with a direct 2xx status — redirects fail it — and headers that cover what was asked: `Access-Control-Allow-Origin` matching the origin, `Access-Control-Allow-Methods` including the requested method, `Access-Control-Allow-Headers` including each requested field, plus `Access-Control-Allow-Credentials: true` if the eventual request will carry cookies. Once the preflight passes, the browser sends the actual request, and its response faces the same origin check as any simple request.

The paperwork would double latency if repeated forever, so the browser caches a passing preflight for the duration in `Access-Control-Max-Age`, measured in seconds. Browsers cap this regardless of what you send — roughly two hours in Chromium, twenty-four in Firefox. Set it high enough that routine navigation doesn't re-preflight, low enough that a deliberate change to your CORS policy propagates within a day. A JSON `POST` prefights precisely because `application/json` isn't on the form-era safelist; the same POST with form encoding sails straight through.

In Express, you almost never set these headers by hand. The `cors` middleware package computes them for every passing request, and for incoming `OPTIONS` requests it answers the preflight itself with a 204 and the right allow-lists, ending the response there — the preflight never reaches your routes. Configuration maps one-to-one onto the concepts: `origin` takes a string, an array of strings, or a function `(origin, callback)` for dynamic checking; `methods` sets the preflight's allow-methods list; `allowedHeaders` pins the allow-headers list (omit it and the middleware reflects whatever the browser asked for — handy in development, too permissive to ship unreviewed); `exposedHeaders` names response headers JavaScript may read; `credentials` adds the allow-credentials flag; `maxAge` sets the cache window.

Credentials deserve their own careful paragraph because they break more production deploys than everything else combined. Cookies are attached to cross-origin requests only if two independent conditions hold: the client opted in with `credentials: 'include'` in fetch (or `withCredentials: true` in axios — the default behavior sends no cookies cross-origin at all), and the server responded with `Access-Control-Allow-Credentials: true` plus an `Access-Control-Allow-Origin` that names the specific origin. The wildcard is forbidden in this combination — browsers reject `*` alongside credentials outright. And beware the tempting shortcut: configuring the middleware to reflect whatever origin arrives (`origin: true`) while credentials are on is worse than the wildcard, because now every site on the internet passes the check and gets credentialed reads. Note also that an `Authorization` header is not a credential in this sense: it travels only when your code attaches it, needs to be listed in `Allow-Headers` because it triggers a preflight, but does not itself require the allow-credentials flag.

Where does the middleware sit? Early. Registration order is everything in Express — a request flows through middleware in the order registered, and the preflight `OPTIONS` must survive to reach `cors()` before anything else kills it. An auth guard mounted first will reject cookie-less, token-less OPTIONS requests with a 401, the preflight fails, and the browser reports a CORS error that has nothing to do with your origin configuration. Put `cors()` at the top of the stack, before `express.json()`, before rate limiters, before authentication.

The tradeoffs are worth naming plainly. Pinned origin lists cost you an ops step whenever a new frontend domain launches but give you an auditable security boundary. Reflection costs nothing operationally and hands every site a pass. High `maxAge` values cut preflight traffic but delay policy changes behind cached answers. And choose exactly one enforcement point — the Express middleware or your reverse proxy — because setting the same header in both produces duplicates, and duplicated `Access-Control-Allow-Origin` values are themselves a browser-rejected failure.

Finally, calibrate what CORS actually protects. It stops a malicious PAGE from reading your users' data through their own browsers. It does nothing against curl, scripts, mobile apps, or any non-browser client — those never consult the signs. Real API protection is authentication, authorization, and rate limiting. There's even a hole CORS leaves open on purpose: a cross-site form POST or credentialed fetch can still trigger state changes on your server even when the attacker can't read the response. Defending against triggered-but-unread actions is CSRF territory — `SameSite` cookies and anti-CSRF tokens — which is why CORS and CSRF always get discussed together but solve different halves of the problem.

When you're debugging, trust the console message text — it names exactly which check failed — and reproduce the preflight mechanically with curl, sending the same `Origin` and `Access-Control-Request-*` headers the browser sent. The deep-dive walkthrough of common failures lives in [how-do-you-debug-cors-errors](../observability/how-do-you-debug-cors-errors.md).

## 4. See It In Practice — Real Code or Queries

A locked-down production configuration — explicit on every axis, nothing reflected, nothing wildcarded:

```js
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  // Exact origin match: scheme + host + port, spelled out.
  // No wildcard here because we enable credentials below.
  origin: 'https://app.example.com',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  // Pin the list. Omitting this reflects whatever the browser asks for,
  // which quietly approves header names you never reviewed.
  allowedHeaders: ['Content-Type', 'Authorization'],
  // Without this, the browser hides X-Request-Id from JS even though
  // curl and DevTools can see it perfectly well.
  exposedHeaders: ['X-Request-Id'],
  credentials: true,
  maxAge: 86400,
}));

app.get('/api/orders', (req, res) => {
  res.set('X-Request-Id', req.headers['x-request-id'] ?? crypto.randomUUID());
  res.json({ orders: [] });
});

app.listen(4000);
```

Multiple frontends — a static allowlist from the environment, failing closed on anything unknown:

```js
const express = require('express');
const cors = require('cors');

// Unknown origins are DENIED, not tolerated. An empty or mistyped env var
// yields an empty set, which denies everyone loudly - that is the safe
// direction for a misconfiguration to fail in.
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
);

const corsOptions = {
  credentials: true,
  maxAge: 86400,
  origin(origin, callback) {
    // No Origin header means the caller is not a browser page:
    // curl, Postman, another backend. CORS cannot apply to them anyway,
    // so let them through to normal authentication.
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    // Deny by withholding CORS headers: callback(null, false).
    // The browser then blocks the read; the server never leaks openness.
    return callback(null, false);
  },
};

const app = express();
app.use(cors(corsOptions));
```

When the allowlist lives in the database, the lookup is async — and an async failure must deny, never default-open. Errors passed to the callback flow into your error-handling middleware, whose parameter-count mechanics are covered in [what-is-error-handling-middleware](what-is-error-handling-middleware.md):

```js
const cors = require('cors');

function buildOriginCheck(pool) {
  // cors() calls this once per cross-origin request.
  return async function checkOrigin(origin, callback) {
    if (!origin) return callback(null, true);
    try {
      const result = await pool.query(
        'SELECT 1 FROM allowed_origins WHERE origin = $1',
        [origin]
      );
      callback(null, result.rowCount > 0);
    } catch (err) {
      // Database down => deny everyone. Failing OPEN here would turn
      // an outage into "any website can read this API."
      callback(err);
    }
  };
}
```

Registration order — why `cors()` must precede authentication, and how preflights dodge auth entirely:

```js
const express = require('express');
const cors = require('cors');

const app = express();

// FIRST. The preflight OPTIONS request carries no cookies and no
// Authorization header, so any guard registered before cors()
// rejects it with 401/404 and the preflight dies.
app.use(cors({ origin: 'https://app.example.com', credentials: true }));

app.use(express.json());

function requireAuth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  next();
}

app.delete('/api/items/:id', requireAuth, (req, res) => {
  // By the time we get here, the browser has already passed the
  // preflight for DELETE, otherwise this handler would never run.
  res.json({ deleted: req.params.id });
});

// Safety net: answer any preflight aimed at a path without its own
// OPTIONS handler. Cheap insurance against future route additions.
app.options('*', cors());

app.listen(4000);
```

What `cors()` actually does, in fifteen lines — read this once and preflights stop being magic:

```js
const express = require('express');

const app = express();

const ALLOWED_ORIGINS = ['https://app.example.com'];

function myCors(req, res, next) {
  const origin = req.headers.origin;

  if (ALLOWED_ORIGINS.includes(origin)) {
    // Echo the SPECIFIC origin, not *, so credentials stay possible.
    res.setHeader('Access-Control-Allow-Origin', origin);
    // Caches must not reuse this origin's answer for a different origin.
    // (Merge with any existing Vary value in real code.)
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    // Answer the paperwork here and stop; the real routes never see it.
    return res.sendStatus(204);
  }

  next();
}

app.use(myCors);

app.get('/api/ping', (req, res) => res.json({ pong: true }));

app.listen(4000);
```

The client half of credentials — without the opt-in below, the browser sends no cookies cross-origin no matter how the server is configured:

```js
async function loadProfile() {
  const res = await fetch('https://api.example.com/api/me', {
    credentials: 'include', // tell the chauffeur to carry the ID card
  });
  if (!res.ok) throw new Error(`profile request failed: ${res.status}`);
  return res.json();
}
```

Reproducing a preflight by hand — the single most useful CORS debugging move:

```bash
curl -i -X OPTIONS 'https://api.example.com/api/orders/42' \
  -H 'Origin: https://app.example.com' \
  -H 'Access-Control-Request-Method: DELETE' \
  -H 'Access-Control-Request-Headers: authorization'
```

You want a `204` with `Access-Control-Allow-Origin: https://app.example.com`, `Access-Control-Allow-Methods` containing `DELETE`, and `Access-Control-Allow-Headers` containing `authorization`. Whatever is missing from that response is exactly what the browser is complaining about.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is CORS and how do you handle it in Express?**

CORS is the mechanism by which a server tells browsers which other origins may read its responses, layered on top of the browser's default rule that pages can only read same-origin responses. The key framing: it's declared on the server through response headers, but enforced entirely inside the browser — the server always has the option to just send the response; whether JavaScript receives it depends on the headers. In Express I handle it with the `cors` middleware registered early in the stack, configured with explicit origins, the methods and headers my API actually uses, `credentials: true` only when cookies are involved, and a pinned `allowedHeaders` list. For multi-domain setups I use the function form of `origin` against an environment-driven allowlist that denies unknown origins. And I always add the caveat that CORS governs browser behavior only — Postman and server-to-server clients ignore it completely.

**Q: What is a preflight request and when does the browser send one?**

Before certain cross-origin requests, the browser automatically sends an `OPTIONS` request announcing what it intends to do: `Access-Control-Request-Method` for the method, `Access-Control-Request-Headers` for any non-basic headers, plus the usual `Origin`. The preflight carries no cookies, no authorization header, no body — it is purely a permission check. The server must reply with a direct 2xx and headers covering everything asked. Only then does the browser send the real request. It triggers whenever the request departs from the form-era baseline: any method besides GET, HEAD, or POST; a `Content-Type` other than form encodings or plain text — which means every JSON POST; or custom headers like `Authorization`. Browsers cache a passing preflight per URL according to `Access-Control-Max-Age`, so subsequent requests skip the paperwork until it expires.

**Q: Why does a POST with JSON trigger a preflight when a form POST doesn't?**

Because the safelist defining "simple" is deliberately frozen at what a plain HTML form could submit circa 2005: form-urlencoded, multipart, and text-plain bodies over GET/HEAD/POST. Those were the requests servers were already receiving from any web page before CORS existed, so blocking them retroactively would have broken the web. `application/json` was not something forms could send, so it requires permission. This is also the historical hint about CORS's purpose: it prevents NEW capabilities for cross-origin pages unless the server opts in, while grandfathering in what the old web could already do.

**Q: How do you configure CORS for multiple frontend domains?**

With the function form of `origin`: `(origin, callback) => ...`. I load the allowlist from environment variables into a Set at startup, look up the incoming origin, and call `callback(null, true)` only on an exact match — unknown origins get denied, which is the fail-safe direction for a security decision. Requests with no `Origin` header at all aren't browser pages, so I let them through to normal authentication; CORS can't constrain them regardless. Two hard rules I follow: never combine a wildcard with credentials because browsers reject it, and never reflect arbitrary origins while `credentials: true` is set — reflection-plus-credentials grants every website credentialed read access, which is strictly worse than the wildcard.

**Q: Which headers does the cors middleware control?**

Request-side, the browser sends `Origin` on every cross-origin request and `Access-Control-Request-Method`/`-Headers` on preflights. Response-side, the middleware manages six: `Access-Control-Allow-Origin` — the permitted origin or `*`; `Access-Control-Allow-Methods` — methods named during preflight approval; `Access-Control-Allow-Headers` — request headers permitted on the real request; `Access-Control-Allow-Credentials` — whether cookies may ride along; `Access-Control-Max-Age` — preflight cache duration; and `Access-Control-Expose-Headers` — the frequently forgotten one that makes custom RESPONSE headers readable by JavaScript. The last matters because browsers expose only a small safelist of response headers by default; without `Expose-Headers`, your `X-Request-Id` shows in curl and DevTools but reads as null in code.

**Q: Does CORS protect your API from unauthorized access?**

No, and saying so clearly is the mark of someone who understands it. CORS constrains browsers only. Any non-browser client — curl, Postman, Python scripts, other backend services — never evaluates CORS headers and can call your API regardless of configuration. Even in browsers, a "CORS-failed" request may still have executed server-side, as we covered. What CORS actually protects is your USERS: it stops a malicious page from making their browser read data from your API using their existing session. The security boundary for the API itself is authentication, authorization, input validation, and rate limiting. CORS is privacy fencing between websites, not a wall around your endpoints.

**Q: Why can't you use `origin: '*'` together with `credentials: true`?**

Because the combination defeats the entire point of credentials being opt-in and scoped. Credentials mean cookies — the browser attaches them automatically, so a wildcard grant would let ANY page make requests that carry the user's session and READ the responses. The browser enforces this on the client side: when a request's credentials mode is `include` and the response says `*` plus allow-credentials, the browser rejects it with an explicit error naming the wildcard problem. The server must instead echo the specific origin. And the mirror-image trap is doing it accidentally: `origin: true` reflects whatever origin arrived, so paired with credentials it behaves like a wildcard while looking like configuration effort.

**Q: The backend logs 200s but the frontend sees "Network Error" — explain what's happening.**

That's the signature of CORS enforcement, not a server fault. Walk the lifecycle: the browser sent the request, the server processed it and returned 200 with a body — your logs prove it. The browser then inspected `Access-Control-Allow-Origin`, found no match for the requesting origin, and discarded the response before JavaScript could touch it. Fetch surfaces this as a generic `TypeError: Failed to fetch`; axios wraps it as "Network Error" — both hide the real reason, so people assume connectivity issues. The confirmation test is the Network tab: the request sits there with status 200 and a perfectly good response body that your code simply never received. The fix is server headers, and the corollary discipline is remembering that retries against such endpoints can double-execute non-idempotent work, because every attempt genuinely reached the server.

**Q: How is CORS different from CSRF?**

They defend opposite halves of one attack surface. CSRF is about DOING: an evil page forges a state-changing request — a transfer, a password change — relying on the browser auto-attaching the victim's cookies. CORS is about READING: ensuring the evil page cannot see responses from another origin. The uncomfortable truth connecting them is that CORS does not prevent the forged request itself — simple cross-site POSTs still reach your server, and the attacker never needed to read the reply for the damage to be done. That's why CSRF defenses exist independently: `SameSite` cookies, which suppress cookie attachment on cross-site requests, plus anti-CSRF tokens for form flows. Cookie attribute mechanics live in [how-do-you-use-cookies-in-express](how-do-you-use-cookies-in-express.md) and [what-is-samesite-cookie](../auth/what-is-samesite-cookie.md).

**Q: How do you reduce preflight overhead in a high-traffic system?**

Four levers, in order of impact. Set `Access-Control-Max-Age` generously — a day's caching eliminates repeat preflights within a session. Prefer keeping requests "simple" where the design allows: form-encoded submissions skip preflight entirely, and moving an `Authorization` header to a cookie removes both the preflight trigger and a manual-header class of bugs. Route traffic through a same-origin path — your reverse proxy serving the frontend also forwarding `/api/*` to the backend — which converts every request to same-origin and makes CORS moot in production; Vite's dev proxy provides the same trick locally. Finally, ensure the middleware answers preflights itself with a 204 short-circuit, so OPTIONS requests never consume downstream work like JSON parsing or database connections.

## 6. The Traps — What Goes Wrong in Production

**Blaming the server because the API "returns an error."** The request reached the handler, executed, returned 200 — the browser threw the response away. Teams waste hours adding logging to working endpoints. Read the console message verbatim: Chrome names the exact failed check. And remember the shadow risk — if the failing call was a POST with retries, the operation ran multiple times server-side while the frontend believed everything failed.

**Mounting `cors()` after auth or global middleware.** The preflight OPTIONS arrives carrying no cookie and no `Authorization` header. Your auth guard rejects it with 401, the preflight never gets its 2xx, and the browser reports: "Response to preflight request doesn't pass access control check: It does not have HTTP ok status." Developers misread this as an origin mismatch and start spraying `Allow-Origin` headers around, when the actual bug is middleware order. `cors()` goes first in the stack — before body parsers, rate limiters, and guards — or preflights must be explicitly exempted from them.

**Wildcard with credentials — and its sneakier cousin.** `origin: '*'` with `credentials: true` fails instantly with: "The value of 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'." Fine. But `origin: true` with `credentials: true` passes silently and is far worse: every origin on the internet is reflected and granted credentialed reads. If you reflect, reflect from a checked allowlist, never raw.

**Duplicate `Access-Control-Allow-Origin` values.** The `cors` package sets the header, someone also sets it manually in a route or a fallback middleware, and nginx adds `add_header Access-Control-Allow-Origin *` on top. The browser now reports: "...header contains multiple values '*, https://app.example.com', but only one is allowed." Pick exactly one enforcement layer — Express or the proxy — and grep the other for stray headers.

**Missing `Vary: Origin` behind a CDN.** Your origin function returns different `Allow-Origin` values per requester, but the CDN caches the first response — including its headers — and serves it to every origin. Now some users receive an allow header for a different domain and get blocked. Dynamic origin responses must declare `Vary: Origin` so caches key on that header. The `cors` package handles this for dynamic origins; hand-rolled header code routinely forgets.

**Custom response headers reading as null.** The API dutifully returns `X-Request-Id`, curl shows it, DevTools shows it — but `response.headers.get('X-Request-Id')` is null. Default browser exposure covers only a handful of simple headers; everything else needs `exposedHeaders: ['X-Request-Id']` in the middleware config. This trap wastes whole afternoons precisely because every tool EXCEPT the running code can see the header.

**Redirects killing preflights.** The API redirects `http://api.example.com` to `https://`, or apex domain to `www`. The browser's OPTIONS request gets a 301 instead of a direct 2xx, and the console says: "...redirect is not allowed for a preflight request." Preflights must terminate successfully at the exact URL requested — no hops. Fix the client to call the final canonical origin directly, or exempt the preflight path from redirect rules.

**An empty or mistyped allowlist in production.** `ALLOWED_ORIGINS` missing from the prod environment produces an empty Set, and a correctly fail-closed checker then denies every origin — including your own frontend. The system behaved safely; the deploy checklist failed. Treat the CORS allowlist like any critical secret: verify it at boot, log the loaded origins once, and alert on an empty list.

**Testing with Postman and declaring victory.** Postman ignores CORS completely, so any configuration appears "fixed." Reproduction requires a browser. The honest test loop is: DevTools console for the exact complaint, then the curl preflight replay from section 4 to inspect raw headers without browser noise.

**Port and scheme sloppiness.** `http://localhost:3000` and `http://localhost:5173` are different origins, as are `https://example.com` and `https://www.example.com`. Allowlists padded with trailing slashes also fail, because the browser compares the serialized origin string exactly. Normalize your entries, store them bare, compare full strings.

## 7. Compare With Related Concepts

**Same-Origin Policy vs. CORS.** The policy is the default wall: a page may not read cross-origin responses. CORS is the sanctioned doorway built into that wall: the server publishes headers and the browser honors them. Rule of thumb: SOP is the behavior, CORS is the opt-out, and every CORS discussion assumes the wall already exists.

**CORS vs. CSRF.** CORS governs reading cross-origin responses; CSRF concerns forged cross-origin actions riding on ambient cookies. A request can violate CORS and still execute its side effects, which is precisely the CSRF problem CORS leaves open. Rule of thumb: configure both — CORS headers for legitimate cross-origin frontends, `SameSite`/tokens for state-changing endpoints.

**CORS vs. authentication and authorization.** CORS decides whether a browser shares a response with a page; auth decides whether the request is entitled to the data at all. One is inter-website etiquette enforced by browsers; the other is your security boundary enforced by your code. Rule of thumb: never cite CORS in a threat model for your API — attackers don't use browsers.

**The `cors` package vs. hand-rolled headers vs. reverse-proxy configuration.** All three produce identical response headers; they differ in where the logic lives and how it rots. The package keeps policy next to code and version-controlled with the app. Proxy-level config centralizes enforcement but hides it from developers reading the repo. Hand-rolled middleware teaches you the mechanic and earns its keep in edge cases, but reimplements solved problems. Rule of thumb: package in the app by default; proxy-level only when multiple backend services must share one policy — and never both.

## 8. 🧠 The Memory Hook

Your browser is a chauffeur who delivers every request and decides alone whether you get to read the reply — the destination's gate sign (`Access-Control-Allow-Origin`) sets the policy, but YOUR driver enforces it. Postcards go through anyway and come back shredded; cranes and toolboxes need an advance phone call (preflight) whose written approval sits in the glovebox (`Max-Age`). And the burglar hopping the fence — curl, Postman, any script — never met your chauffeur, which is why CORS protects users from other websites, never your API from attackers.
