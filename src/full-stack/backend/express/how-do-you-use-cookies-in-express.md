# How do you use cookies in Express

## 1. The Real-World Problem — When You Actually Hit This

It's Friday evening. Your team ships the new SPA. Login works perfectly in Postman — you can see the `Set-Cookie` header in the response, you celebrate, you go home. Monday morning, QA says users get logged out every time they refresh the page. Same endpoints, same credentials, same everything. Postman stays logged in; the browser refuses to.

So someone "fixes" it by storing the token in localStorage instead, and for three months everything is fine — until a marketing script gets injected through a comment widget, reads localStorage, and ships 40,000 session tokens to an attacker's server. Two different incidents, one root cause: nobody on the team actually understood how a cookie travels between a browser and Express, what each of its settings really does, or when a cookie is even allowed to be set.

That gap shows up in interviews constantly, because it's the difference between "I used res.cookie()" and "I know why my auth survives refresh but dies cross-origin."

## 2. The Analogy — Make the Mechanic Obvious

Think about how a hospital identifies you after admission.

When you're admitted, the registration desk prints a paper bracelet and snaps it onto your wrist. You didn't ask for it. You can't easily remove it. After ten minutes you stop noticing it's there.

From that moment on, something important happens at every single interaction: before a nurse gives you medication, before the phlebotomist draws blood, before X-ray wheels you in — they scan your bracelet. Nobody ever asks you to state your name from memory or show your ID. Scanning the wrist is built into their routine. Your job is literally nothing — the scan happens because the workflow demands it, not because you did anything.

Now look at what's actually printed on it: just your name and a medical record number. Not your chart, not your history, not your allergies. The bracelet is a pointer, not a record. The real data sits in the hospital's system, and staff pull it up using the number.

Every cookie setting has a matching detail here:

- **The desk snapping the bracelet on** is the server sending a `Set-Cookie` response header. It happens once, at login.
- **The bracelet staying on your wrist** is the browser storing the cookie in its jar. You (the JavaScript app) don't manage it.
- **Every department scanning your wrist automatically** is the browser attaching the `Cookie` header to every matching request. The client does zero work per request.
- **The record number instead of the full chart** is a session ID. The sensitive data stays server-side; the cookie only says "look me up."
- **A discharge date printed on long-term bands** is `maxAge`. When it passes, scanners reject the band even though it's still physically on your wrist.
- **The barcode matching the printed line** is signing. If someone scratches off the number and writes a bigger one, the barcode no longer matches and the scanner flags it. Note what this is: proof it wasn't altered — not secrecy. Anyone can still read the name printed on the band.
- **Some hospitals use sealed RFID chips instead of printed text**: visitors can see a band exists but can't read what's inside; only hospital equipment can. That's `httpOnly`.
- **The band being valid only inside this hospital** — the clinic across town issues its own — is `domain`/`path` scoping.
- **Hospital policy about third-party requests** ("a courier claims Mrs. Smith sent him for her meds") is `sameSite`: strict hospitals act only on scans done face-to-face within their own walls; lax ones accept it if you personally walked up to the window; none means couriers are fine too — but then the band must be tamper-sealed (`secure`).

And `cookie-parser`? That's the scanning step itself. A raw bracelet is just a smudged barcode string; the scanner turns it into structured fields the chart system can use. Without a scanner bolted into the workflow, staff are stuck squinting at raw barcodes all day.

Keep this picture. Every technical term below is just naming a part of it.

## 3. The Full Explanation — How It Actually Works

In our analogy, the desk snaps the bracelet on once and every department scans it forever after. In HTTP terms:

1. Your Express route calls `res.cookie('sid', 'abc123')`. All this does is append a header to the response: `Set-Cookie: sid=abc123`. Nothing is stored server-side by that call — you've only given the browser an instruction.
2. The browser receives the response, and if it accepts the cookie (more on refusal soon), it files it in its cookie jar, keyed by domain and path.
3. From then on, for every request whose URL matches that scope, the browser adds a header before sending: `Cookie: sid=abc123`. Automatically. No fetch option needed, no code in your app. That automatic behavior is the entire reason cookies exist as a concept.

One request-response round trip sets it; every later request carries it. In our analogy: snapped on once, scanned at every door.

Here's the part that bites people: **Express does not parse incoming cookies for you.** Without any middleware, `req.cookies` doesn't exist. What you get is the raw header, one flat string:

```txt
Cookie: sid=abc123; theme=dark
```

If you want `req.cookies.sid`, somebody has to split that string on semicolons, split each pair on `=`, decode the URL-encoding, and build an object. Doing that in every route would be madness, so it's done once, in middleware, before your routes run:

```js
app.use(cookieParser());
```

Now every request arrives at your handlers already parsed: `req.cookies.theme === 'dark'`. This is exactly the kind of job Express deliberately leaves to middleware — the framework routes requests and gives you a pipeline; parsing bodies, cookies, and headers are stations you bolt on. (That pipeline model is covered properly in [how-does-express-middleware-work](how-does-express-middleware-work.md).) Registration order matters: `cookieParser()` must sit above any route that reads `req.cookies`, because middleware runs top to bottom — a route never waits for a station registered below it. The full ordering rules live in [what-is-request-response-lifecycle-in-express](what-is-request-response-lifecycle-in-express.md).

Next: the settings that decide whether the bracelet works at all. A bare cookie like `res.cookie('sid', 'abc123')` is a paper bracelet with everything printed in public and no discharge date. Real apps set attributes, and each attribute answers one security question.

**httpOnly — who can read it?**
With `httpOnly: true`, the browser stores the cookie but blocks `document.cookie` from reading it. Page JavaScript — including malicious injected scripts — simply cannot see the value. Requests still carry it; the server still reads it. Be precise about what it is and isn't: httpOnly blocks *scripts on your page*, not curiosity. A user can open DevTools and read the value in the Network tab, so httpOnly is not encryption — it removes the XSS theft path, nothing more. But that path is the big one, which is why auth cookies are essentially always httpOnly.

**secure — where may it travel?**
With `secure: true`, the browser only sends the cookie over HTTPS and only accepts a `Set-Cookie` over HTTPS. Without it, the same coffee-shop Wi-Fi that sees your traffic could see the session ID. One honest dev caveat: modern Chrome and Firefox treat `localhost` as secure even over plain http, so `secure: true` usually works locally — but Safari doesn't always cooperate, so if a teammate reports "cookies broken in local Safari," this is why.

**sameSite — which requests trigger the scan?**
This is the CSRF setting, and the one people explain worst. The question it answers: *when a request to your API originates from a different site, should the browser attach this cookie at all?*

- `'strict'`: never attach on cross-site requests. Maximum safety, but also breaks legit flows — a user clicking a link from email to your site arrives without their session and appears logged out until they navigate again.
- `'lax'`: attach when the user themselves navigates to your site at the top level (clicked a link), skip it for cross-site subresource requests and POSTs (form posts from evil.com, embedded fetches). This kills most CSRF while keeping normal links working. Modern Chrome defaults to Lax when you say nothing, but don't rely on defaults — say it explicitly.
- `'none'`: always attach, cross-site included. Browsers refuse `sameSite: 'none'` unless `secure: true` is also set — silently refuse: the Set-Cookie header arrives and the cookie just never gets stored.

In bracelet terms: strict means staff only act on face-to-face scans; lax means walking up to the window yourself counts, phone requests on your behalf don't; none means couriers are accepted too, but only with a sealed band.

**maxAge — when does it expire?**
`maxAge` is in milliseconds in Express (`maxAge: 900000` = 15 minutes); it becomes an `Expires` date on the wire. No expiry set? Then it's a *session cookie*: the browser drops it when the browsing session ends. And there's a hospital-style gotcha in reverse: pasting an expiry onto the cookie does nothing to the server-side session. The bracelet saying "review by March 3" doesn't update the chart. Cookie lifetime and session-store lifetime are two clocks; production logout means expiring both.

Two more worth knowing briefly: `domain` widens sharing across subdomains (`domain: '.example.com'` lets shop.example see api.example.com's cookie; default is host-only), and `path` narrows where the browser sends it.

That leaves one more mechanic: proving the bracelet wasn't rewritten. Pass a secret to the parser and mark a cookie signed:

```js
app.use(cookieParser(process.env.COOKIE_SECRET));
res.cookie('theme', 'dark', { signed: true });
```

Express now sends the value plus an HMAC signature — on the wire it looks like `s:dark.Kx8f...`. On the way back, cookie-parser recomputes the signature; match means the value is exactly what we sent, mismatch means someone edited it, and the value lands in `req.signedCookies.theme` as `false`.

Two things interviewers probe here. First: **signed is integrity, not confidentiality.** The value rides along in plaintext next to its signature — anyone can read `theme=dark`; they just can't change it undetected. Never put a secret *inside* a signed cookie. Second: **why sign at all if you validate server-side anyway?** For values the client legitimately holds but must not choose — "which UI theme," "which A/B group," "already-shown-banner flag" — signing lets the server trust the value without storing anything, which is precisely the stateless trick JWTs industrialize (see [how-do-you-implement-jwt-authentication](how-do-you-implement-jwt-authentication.md)).

Now step back and look at the whole trade-offs ledger, because cookies buy you the auto-scan and charge you for it:

- Every matching request carries them — including image, font, and static asset requests on the same domain. Dead weight unless those assets live elsewhere.
- Around 4KB per cookie. Fine for an ID, hopeless for a shopping cart — keep the bracelet thin and put data in the chart.
- Auto-sending cuts both ways: the browser sends the cookie even when a cross-site attacker triggers the request. That's exactly CSRF — which is why sameSite isn't optional garnish, it's the counterweight to the convenience.
- httpOnly means your own frontend JS can't read the token either. That's the deal: give up client-side access, gain XSS immunity for the token.

Notice the shape of that ledger: cookies trade *XSS exposure* for *CSRF exposure* compared to tokens-in-JavaScript. Section 7 makes that trade explicit.

## 4. See It In Practice — Real Code or Queries

A complete, runnable mini-app — login, a protected route, logout — with every setting doing real work:

```js
const crypto = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');

const app = express();

// Sessions live HERE, server-side. The cookie carries only the ID —
// the bracelet holds a record number, not the chart.
const sessions = new Map();

// Must be registered above every route that touches req.cookies.
app.use(cookieParser());

app.post('/login', (req, res) => {
  const sid = crypto.randomUUID();
  sessions.set(sid, { userId: 42 });

  // res.cookie only appends a Set-Cookie header — legal only while
  // headers are open. After res.send() this line throws.
  res.cookie('sid', sid, {
    httpOnly: true,                    // document.cookie can't steal it
    secure: true,                      // travels over HTTPS only
    sameSite: 'lax',                   // follows real link clicks, refuses cross-site POSTs
    maxAge: 1000 * 60 * 60 * 24 * 7,   // milliseconds: one week
    path: '/',
  });
  res.json({ loggedIn: true });
});

function requireSession(req, res, next) {
  const sid = req.cookies.sid;
  // A cookie existing proves nothing by itself — anyone can send
  // any value. Validity comes from the lookup, not from presence.
  if (!sid || !sessions.has(sid)) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  req.userId = sessions.get(sid).userId;
  next();
}

app.get('/orders', requireSession, (req, res) => {
  res.json({ forUser: req.userId, orders: [] });
});

app.post('/logout', (req, res) => {
  sessions.delete(req.cookies.sid);
  // Options must match how it was set (at minimum path/domain),
  // or some browsers keep a stale copy alive.
  res.clearCookie('sid', { path: '/' });
  res.json({ loggedIn: false });
});

app.listen(3000, () => console.log('on :3000'));
```

What cookie-parser saves you from — reading the raw string yourself:

```js
app.get('/debug', (req, res) => {
  // Without the middleware this is all Express gives you:
  console.log(req.headers.cookie); // -> "sid=abc123; theme=dark"

  // ...so somebody has to do this. cookie-parser is this loop,
  // run once per request, before your routes.
  const cookies = Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .filter((part) => part.includes('='))
      .map((part) => {
        const eq = part.indexOf('=');
        return [part.slice(0, eq).trim(), decodeURIComponent(part.slice(eq + 1))];
      })
  );
  res.json(cookies); // -> { sid: 'abc123', theme: 'dark' }
});
```

Signed cookies — tamper detection in action:

```js
const express = require('express');
const cookieParser = require('cookie-parser');

const app = express();

// One secret, two jobs: signs outgoing cookies marked signed:true,
// verifies incoming ones into req.signedCookies.
app.use(cookieParser(process.env.COOKIE_SECRET));

app.post('/preferences', (req, res) => {
  // Wire format: "s:dark.<hmac>" — readable value PLUS signature.
  res.cookie('theme', 'dark', { signed: true, httpOnly: true, sameSite: 'lax' });
  res.json({ saved: true });
});

app.get('/page', (req, res) => {
  const theme = req.signedCookies.theme;
  if (theme === undefined) return res.json({ theme: 'light' });        // never set
  if (theme === false) return res.status(400).json({ error: 'modified cookie rejected' });
  res.json({ theme }); // signature matched: unaltered since we sent it
});
```

Cross-origin cookies — the three-part alignment from section 5, question five:

```js
const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();

// Part 1 — server: allow THIS origin with credentials.
// origin:'*' is illegal alongside credentials:true.
app.use(cors({ origin: 'https://shop.example', credentials: true }));
app.use(cookieParser());

app.post('/login', (req, res) => {
  // Part 2 — the cookie: None permits cross-site sending,
  // and browsers reject None without Secure.
  res.cookie('sid', crypto.randomUUID(), {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });
  res.json({ ok: true });
});
```

```js
// Part 3 — browser: explicitly opt in, or no cookies move.
await fetch('https://api.example.com/login', {
  method: 'POST',
  credentials: 'include', // axios equivalent: withCredentials: true
});
```

All three parts or nothing — any one missing produces exactly the Friday-night bug from section 1.

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you set, read, and delete a cookie in Express?**

Setting is `res.cookie(name, value, options)` — it appends a `Set-Cookie` header and must run before the body is written. Reading requires `app.use(cookieParser())` registered before your routes, after which values are on `req.cookies.name`; with a secret passed to the parser, verified signed cookies land in `req.signedCookies`. Deleting is `res.clearCookie(name)` with the same path/domain options used to set it — it works by sending an expired `Set-Cookie`, and browsers only overwrite the original if scope matches. The one-line summary hiding underneath: set and clear write response headers, reading parses a request header, and those are two different directions of the same round trip.

**Q: What does cookie-parser actually do? Could you skip it?**

It reads `req.headers.cookie` — one raw string like `sid=abc123; theme=dark` — splits, decodes, and attaches the result as `req.cookies` (and `req.signedCookies` when given a secret), once per request before your handlers run. You can absolutely skip it: parse `req.headers.cookie` yourself, and that's genuinely reasonable in tiny services or edge runtimes. What you'd lose is battle-tested decoding, the signed-cookie HMAC verification, and consistency. Interviewers like hearing that it's ordinary middleware, not magic — nothing about cookies is built into Express core.

**Q: Walk me through httpOnly, secure, sameSite, and maxAge. What real attack does each blunt?**

httpOnly blunts XSS token theft: injected JavaScript can't read the cookie via `document.cookie`, though the request still carries it and DevTools still shows it — it's script-blocking, not encryption. secure blunts network interception and downgrade tricks: the cookie only moves over HTTPS, so plain-HTTP hops never leak it. sameSite blunts CSRF: the browser declines to attach the cookie to cross-site-initiated requests, so evil.com's form post arrives credential-less; `lax` keeps normal top-level link clicks working, `strict` refuses everything cross-site, `none` allows all but forces `secure`. maxAge bounds replay time: a stolen cookie dies with the clock rather than living forever. Then land the senior point: these overlap but aren't interchangeable — httpOnly does nothing against CSRF, sameSite does nothing against XSS, and neither authenticates anything by itself.

**Q: How do signed cookies work? Are they encrypted?**

With a secret configured, `signed: true` makes Express append an HMAC-SHA256 of the value to the cookie (`s:value.signature`). On read, cookie-parser recomputes the HMAC; a mismatch means the value was modified in transit or storage, and you get `false` instead of the tampered data. They are not encrypted — the value sits in plaintext beside its signature, so anyone can read it and no secret may live inside it. Use signed cookies for values the client may hold but not author: theme choice, experiment bucket, dismissal flags. The moment a value must be hidden, encrypt it or keep it server-side behind an opaque ID.

**Q: Frontend at shop.example, API at api.example.com — why does login "not stick," and what fixes it?**

Because three independent gates each silently block the cookie, and passing one tells you nothing about the others. Gate one: the cookie itself needs `sameSite: 'none', secure: true` — Lax or Strict cookies don't attach to cross-site requests, and `none` without `secure` is discarded by the browser without an error. Gate two: CORS must be configured with `credentials: true` and a specific origin — `Access-Control-Allow-Origin: '*'` cannot be combined with credentials. Gate three: the frontend must ask with `credentials: 'include'` on fetch (or `withCredentials: true` on axios), otherwise the browser neither sends nor accepts cookies for that call. Miss any one and Postman still works fine, which is why the bug survives testing. The senior kicker: the cheapest fix is often DNS — serve the API on the same site (`api.shop.example`) and Lax cookies just work.

**Q: Cookies versus Authorization headers for tokens — how do you choose?**

They fail in opposite directions. Cookies are attached automatically by the browser, which is why they survive refreshes, SSR, and plain links — and exactly why CSRF exists: the attachment happens even when the request wasn't the user's intent, so you lean on sameSite and CSRF tokens. Authorization headers (`Authorization: Bearer ...`) are attached manually by your own code, so no request ever carries credentials unintentionally — CSRF is structurally impossible — but now the token must live somewhere JavaScript can reach (memory or localStorage), which hands the XSS problem a readable copy. Header-token APIs suit mobile clients, third-party integrations, and CDNs that never forward cookies; cookie sessions suit browser-first apps with server-rendered pages. Most real systems pick per threat model, and hybrid setups exist — refresh token in an httpOnly cookie, short-lived access token in memory — precisely to take half of each side.

**Q: Why not just store the token in localStorage?**

Because localStorage is readable by every script on the page, forever, with no scoping rules. Any XSS — a compromised npm dependency, a bad ad script, an unsanitized comment — exfiltrates it with one line, and unlike a cookie it can't be marked unreadable to scripts. An httpOnly cookie faces the same XSS attempt and comes up empty-handed. The honest cost accounting: localStorage saves you from CSRF entirely and hands you an XSS catastrophe; httpOnly cookies accept CSRF risk (manageable with sameSite/lax) and close the XSS-theft hole. For auth tokens the second trade is almost always right — this is expanded in [why-is-localstorage-risky-for-tokens](../auth/why-is-localstorage-risky-for-tokens.md).

**Q: Session cookies versus persistent cookies — and maxAge versus Expires?**

No expiry attribute means a session cookie: the browser holds it only for the browsing session and discards it at shutdown — appropriate for "log out when the browser closes" behavior. `Expires` takes an absolute date; `maxAge` takes a relative lifetime, and Express's `res.cookie` speaks `maxAge` in milliseconds, converting it for you on the wire. Setting both is redundant — maxAge wins in modern browsers. One nuance worth volunteering: several browsers now restore session cookies when tabs are restored, so "session cookie" means "no promised lifetime," not "guaranteed death at midnight."

**Q: A user reports being randomly logged out. How do you debug it?**

Resist guessing; interrogate the round trip in DevTools → Network. First: does the login response contain `Set-Cookie`, and is there a warning triangle on it? Browsers annotate rejections — `SameSite=None` without `Secure`, secure-cookie-over-http, or a `Domain` mismatch all show right there. Second: does the *next* request carry `Cookie:`? Missing header points at scope (path/domain), a different site calling the API, or fetch without `credentials`. Third: is the server rejecting a cookie the browser faithfully sends? Then it's your session store — restart-happy dev servers wiping an in-memory Map, Redis eviction under pressure, or load-balanced instances without shared session storage. Fourth: check clocks and maxAge math — `maxAge` misread as seconds instead of milliseconds produces cookies that die in seconds. The habit this demonstrates: the cookie either wasn't set, wasn't sent, or wasn't accepted server-side, and each failure lives at a different hop you can observe.

**Q: Does httpOnly protect against CSRF? Does sameSite protect against XSS?**

Neither — and saying so crisply is the point of the question. Threat models differ by who initiates the request. CSRF is a *forged request* attack: the attacker makes the victim's browser fire a request at your API, and the browser helpfully auto-attaches the cookie. httpOnly is irrelevant there — the attacker never needs to read the cookie, only to get it sent. XSS is a *code execution* attack on your page: the attacker's script runs where your app runs, and sameSite is irrelevant because the script happily sends same-site requests carrying every cookie, httpOnly or not — well, httpOnly still hides the value itself from that script, but the script can make authenticated requests regardless. Each setting guards one direction of travel: httpOnly against reading, sameSite against unwanted sending. Mature answers stack both plus secure, then note the residual risks honestly — sameSite=lax still allows top-level GET navigations, so never put state changes on GET.

## 6. The Traps — What Goes Wrong in Production

**Reading `req.cookies` without registering cookie-parser.** The wrong assumption: Express populates cookies because it's a web framework. Reality: `req.cookies` is undefined, and the first person to notice is whichever route crashes with "Cannot read properties of undefined." Fix: `app.use(cookieParser())` above every cookie-consuming route — order is position, not intention.

**Calling `res.cookie()` after the body is sent.** The wrong assumption: response methods are a bag of independent tools. Reality: headers are locked the instant body bytes start moving, so `res.send('ok'); res.cookie(...)` throws `ERR_HTTP_HEADERS_SENT`. In async code this hides until a slow path triggers it. Fix: set every cookie before writing the body — the lifecycle ordering rules are in [what-is-request-response-lifecycle-in-express](what-is-request-response-lifecycle-in-express.md).

**`sameSite: 'none'` without `secure: true`.** The wrong assumption: invalid option combinations throw errors. Reality: the browser discards the cookie in silence — your response looks perfect, the jar stays empty, and only the little warning icon in DevTools reveals it. This is the single most common "works in Postman, dead in the browser" cause.

**Clearing a cookie with mismatched options.** The wrong assumption: `clearCookie('sid')` deletes *the* cookie. Reality: deletion is an overwrite with an expired cookie scoped by path/domain; set it with `{ path: '/api' }` and clear it with default scope, and the browser treats them as different cookies — the original survives logout. Users click "Log out," watch it succeed, and stay logged in. Security incident material. Fix: mirror the exact options, and kill the server-side session too.

**Treating a signed cookie as a hidden one.** The wrong assumption: "signed" means protected content. Reality: `s:dark.<hmac>` is plaintext plus a checksum — anyone can read `dark`. Teams have shipped API keys inside signed cookies and called it secure. Fix: signatures prove integrity only; secrets go in server-side storage behind an opaque ID.

**Trusting cookie presence as authentication.** The wrong assumption: if `req.cookies.sid` exists, the user is logged in. Reality: crafting and sending any cookie value takes a curl one-liner — presence proves nothing, and unsigned cookies prove less than nothing. Fix: validity comes from looking the ID up in your store (or verifying a signature), never from finding a value in the header. Notice `requireSession` above checks `sessions.has(sid)`, not merely `sid`.

**Stuffing data into cookies.** The wrong assumption: cookies are a small database. Reality: ~4KB per cookie hard ceiling, and every byte rides along on every matching request — a 2KB preferences blob multiplies your traffic on images, fonts, and XHRs alike, and browsers cap total cookies per domain besides. Fix: the bracelet carries the record number; the chart stays in Redis or the database.

**Expecting `res.cookie()` to show up in `req.cookies` immediately.** The wrong assumption: the cookie object is shared state. Reality: `req.cookies` describes what the *incoming* request carried; your outgoing `Set-Cookie` lands in the browser first and comes back on the *next* request. Code that sets a flash message and tries to read it back in the same handler reads stale air. Fix: pass the value directly in-process; the cookie is for the future request, not this one.

**State-changing GET endpoints under Lax.** The wrong assumption: `sameSite: 'lax'` means CSRF handled. Reality: lax allows cookies on top-level GET navigations — `<a href="https://api.example.com/transfer?funds=all">` clicked from a forum still arrives wearing the user's cookie. Fix: GET stays read-only, full stop; mutations ride on POST/PUT/DELETE where lax blocks cross-site initiations.

**Assuming `secure: true` will break localhost.** Half-trap, half-relief: older advice insists you must drop `secure` in development, but modern Chrome and Firefox accept Secure cookies on `http://localhost`. Safari may not. Dropping `secure` "for dev" risks shipping a dev config to prod; the better fix is keeping config identical and testing in a browser that cooperates.

## 7. Compare With Related Concepts

**Cookie vs. Authorization header.** Same goal — the request proves who it belongs to — opposite delivery. The browser attaches cookies automatically; your code attaches headers explicitly. So cookies win on zero-client-effort and SSR friendliness but own the CSRF problem; headers eliminate CSRF by construction but force the token into JS-reachable storage and thus the XSS problem. Rule of thumb: browser-facing session apps lean cookie, programmatic/API-client access leans header, hybrids split refresh and access roles.

**Cookie vs. localStorage/sessionStorage.** Cookies travel; web storage sits. A cookie is a courier — present on every matching request whether you like it or not; localStorage is a locker — bigger (~5–10MB), script-only, never auto-sent. Auth data goes in the courier specifically so scripts can't touch it (httpOnly); UI preferences and caches belong in the locker. Deeper treatment: [why-is-localstorage-risky-for-tokens](../auth/why-is-localstorage-risky-for-tokens.md).

**Cookie vs. session.** People say "session" meaning both sides of one handshake. The session is the server-side record — the hospital chart; the cookie is the pointer to it — the bracelet with the MRN. Destroy the chart and a valid-looking bracelet scans as logged-out; forge the bracelet and the lookup fails. The architectural consequences of putting state in either place are compared in [jwt-vs-session](../auth/jwt-vs-session.md).

**Signed cookie vs. JWT.** Both are "value plus signature" and both verify without a server-side lookup — JWT is the industrial version, with structured claims, standards-based verification, and expiry baked in. A signed cookie is the lightweight cousin for one-off client-held values. A JWT can even ride *inside* a cookie, combining self-contained identity with auto-send. When the token itself must answer "who is this user," that's JWT territory ([how-do-you-implement-jwt-authentication](how-do-you-implement-jwt-authentication.md)); when you merely need one untamperable flag, a signed cookie is enough.

**cookie-parser vs. express-session.** Adjacent names, different floors. cookie-parser only translates: raw `Cookie` header in, object out — no state, no storage, no opinions. express-session sits on top of cookies: it reads a session-ID cookie, loads (or creates) a server-side session object, exposes `req.session`, and persists via a store. Choosing is simple: need raw cookie values, maybe signed? parser alone. Need login state managed for you? express-session — which quietly depends on cookie mechanics you now understand end to end.

**Set-Cookie vs. custom response headers.** A custom header like `X-Request-Id` is inert data — the client must actively read, store, and resend it. `Set-Cookie` is an instruction with special standing: browsers parse it, enforce its attributes, store it, and re-dispatch it autonomously per scope and lifetime rules. That's why auth via custom headers requires application code on every call, while cookies keep working in plain links, redirects, and full page loads.

## 8. 🧠 The Memory Hook

Every HTTP request walks into your server with its wrist already held out — the browser snapped whatever band your API issued onto itself and offers it at every door without being asked. Your whole job in Express is deciding what's printed on that band: who's allowed to read it (httpOnly), where it may travel (secure), which doors trigger showing it (sameSite), when it expires (maxAge), and whether the barcode proves it hasn't been rewritten (signed) — while cookie-parser stands at reception turning smudged barcodes into chart entries.
