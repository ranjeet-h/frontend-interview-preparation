# How do you serve static files

## 1. The Real-World Problem — When You Actually Hit This

You deployed your React app behind an Express API. Everything worked on your machine. Then three bug reports land on the same morning.

A user refreshes the page while sitting on `/orders/42` and gets a bare `Cannot GET /orders/42`. Another user says the site looks broken — their browser is still running last week's JavaScript because their cached `app.js` never expired, but the new `index.html` loaded fine. And during a security review, someone types `/​.env` into the address bar of your staging server and your database password shows up on screen.

None of these are bugs in React or in your API code. They're all failures of one job you quietly gave to Express without understanding it: serving static files. That job sounds trivial — read file from disk, send it back — but it has four sharp edges (path safety, cache headers, index handling, and fallback routing), and every one of them cuts real apps in production. Let's understand the whole mechanism so none of these ever surprise you again.

## 2. The Analogy — Make the Mechanic Obvious

Picture the lending desk of a large public library.

Every book on the shelves was printed before you walked in. The librarian never writes a book while you wait — she either finds the exact copy your catalog number points to, or she tells you it doesn't exist. That's the core promise of static file serving: the files already exist on disk, and the server's whole job is fetching and handing over, not generating content.

The analogy maps almost line by line onto what `express.static` does:

- **Your catalog slip (URL path)** is matched against the shelf layout (the folder structure). Ask for catalog number `/assets/app.js` and the clerk walks exactly that path through the stacks.
- **The wing sign ("Fiction")** is stripped off before searching the shelves inside. If you mounted the fiction collection at a prefix, the prefix just tells you *which room* to search — the book itself isn't stored with "Fiction" written on its spine. Same with `app.use('/static', express.static('public'))`: the `/static` part is used up finding the right middleware; the rest of the path finds the file.
- **The genre label on each book's spine** (`text/css`, `image/png`) comes from what kind of item it is. The clerk doesn't read the book to classify it — she checks the label. Express checks the file extension.
- **"You've already read this edition?"** — before handing over a heavy tome, the clerk glances at your borrowing card. If you've read this exact edition, she waves you off instead of hauling it over. That's a conditional request answered with `304 Not Modified`.
- **The return-by date stamped on the cover** is the `Cache-Control` header: how long you can keep your copy at home without coming back to ask.
- **The staff-only room behind the desk** holds the things that aren't for the public — personnel files, master keys. Any request pointing outside the public shelves gets refused at the desk, even if someone crafts a clever catalog number like `../../staff-room`. That's path traversal protection.
- **The free map brochure at the front desk**: any visitor who asks for something that clearly isn't a book — "where's the poetry reading?", "where's meeting room B?" — gets handed the same map brochure, which tells them how to navigate the building themselves. That brochure is `index.html` for an SPA, and the visitor navigating with the map is your client-side router.

Keep this library in mind. Every technical term in the rest of this page is just the official name for something you already visualize.

## 3. The Full Explanation — How It Actually Works

**What you're actually mounting.** `express.static` is not a plugin with magic powers. Calling it returns an ordinary piece of middleware — the same kind of function you'd write yourself, as covered in [how-does-express-middleware-work.md](./how-does-express-middleware-work.md). Underneath, it wraps the well-tested `serve-static` package, which wraps the low-level `send` module. So when you write:

```js
app.use(express.static('public'));
```

you've inserted one more station into your app's request pipeline — the fixed, ordered list described in [what-is-request-response-lifecycle-in-express.md](./what-is-request-response-lifecycle-in-express.md). Every request flows through it in registration order, and the static station has one rule: *if the URL maps to a real file in my folder, I answer and end the response; otherwise I call `next()` and pretend I was never here.*

That second half matters more than people realize. Static middleware that doesn't match does **not** error and **not** respond — it falls through. A request for `/api/users` passes straight through a static middleware mounted on `public/`. This fall-through behavior is exactly what makes the ordering tricks later in this page work.

**One request, step by step.**

Say the app has `app.use('/static', express.static('public'))` and the browser asks for `/static/css/app.css`. Here is what actually happens inside that middleware:

1. **Strip the mount prefix.** Express's router consumed `/static` to select this middleware, so the middleware only sees `/css/app.css`.
2. **Decode and normalize.** The path is URL-decoded (so `%2e%2e%2f` becomes `../`) and cleaned up. Then the joined result — `public/css/app.css` — is resolved to an absolute path and checked against one invariant: **the resolved path must still live inside the root folder**. If climbing directories escaped `public/`, the request dies right there with a 403 or 404. This single containment check is your path-traversal defense, and it happens before any disk access.
3. **Check dotfiles.** Files starting with a dot are special-cased. The default behavior refuses them — a request for `/.env` gets treated as "file not found," which we verified: Express answers 404 rather than leaking the file. You can flip this with the `dotfiles` option (`'allow'`, `'deny'`, `'ignore'`), though the safer habit is simply keeping secrets out of the served folder entirely.
4. **Stat the file.** The middleware asks the filesystem: does this exist, and when was it last modified? Directory requests get special treatment — asking for `/` makes it look for `index.html` (configurable or disable-able via the `index` option), and asking for `/assets/sub` without a trailing slash earns a clean 301 redirect to `/assets/sub/`, so relative links inside pages keep working.
5. **Maybe answer "you've already got it."** Two validators go out with every response: an `ETag` (a short fingerprint of the file contents) and a `Last-Modified` timestamp. On the next visit, the browser sends those back with `If-None-Match` / `If-Modified-Since`. If nothing changed, Express skips reading and sending the body entirely and replies `304 Not Modified` — a response with headers but no payload. We tested this against a real Express server: same ETag sent back, `304` received, zero bytes transferred.
6. **Stream the file with correct labels.** Finally the file is opened and piped to the socket in chunks — not slurped into memory all at once. Along the way it stamps the shipping labels: `Content-Type` derived from the extension (`.css` → `text/css`; an unknown or missing extension falls back to `application/octet-stream`, which makes browsers download instead of display), `Content-Length`, `Accept-Ranges` (so video scrubbing and resumed downloads work via `206 Partial Content`), and whatever caching policy you configured.

**The cache headers, done properly.**

By default Express serves everything with `Cache-Control: public, max-age=0`. That looks useless but isn't: it means "cache it, but revalidate every time" — every visit triggers step 5's cheap fingerprint check, and unchanged files cost one tiny 304 round trip.

The senior-level move is splitting your files into two castes:

- **Hashed assets** (`app.a3f9c2.js`, `style.8b1e4d.css`) produced by Vite/Webpack builds. Their *content* is baked into the *name*, so a new deploy produces new filenames and the old URLs stay valid forever. These deserve `max-age=31536000, immutable` — cache for a year, never even come back to revalidate. `express.static(dist, { maxAge: '1y', immutable: true })` produces exactly that header.
- **`index.html`**, whose entire job is pointing at the current hashed filenames. Caching it long-term is how you get the stuck-user bug from our opening story: new HTML referencing old JS that no longer exists, or old HTML referencing JS that was deleted from the server. HTML should be `no-cache` — always revalidate, download fresh when changed.

One subtlety we verified by running it: the `setHeaders` callback runs *after* the built-in cache headers are applied, so whatever you set there wins. That's how you serve both castes from one middleware — set `maxAge` globally, then override to `no-cache` inside `setHeaders` when the file ends in `.html`.

One thing `express.static` does *not* do: compress. Gzip/Brotli either comes from the `compression` middleware or — far better — from Nginx or the CDN sitting in front.

**Serving an SPA: the fallback contract.**

A client-side-routed app has URLs like `/dashboard/42` that correspond to no file anywhere on disk. The deal you make with the browser is: *any* navigation request that isn't an asset and isn't an API call gets `index.html`. Once it loads, React Router (or Vue Router, etc.) reads the URL and renders the right screen. That's the map brochure from our analogy.

This creates the strictest rule on this page: **registration order is everything.** Your stack must be, in this order: API routes first, then static middleware, then the catch-all fallback last. Because Express walks the stack top-down and the first matcher wins, a catch-all registered early swallows every later route. We proved it: with the fallback registered first, `GET /api/users` came back as HTML with status 200 — the JSON handler below it was unreachable.

And a warning if you upgrade to Express 5: the old catch-all syntax `app.get('*', ...)` throws at startup with `Missing parameter name at index 1: *`, because the underlying `path-to-regexp` no longer accepts bare `*`. Use a bare `app.use((req, res) => ...)` as your final middleware — same effect, valid in both versions.

**Why production usually takes this job away from Node.** Here's a correction to something interview candidates say constantly: "express.static blocks the event loop." It doesn't. File reads are streamed asynchronously — a large download does *not* freeze your other requests the way a busy synchronous loop would.

The real argument for moving static files to Nginx or a CDN is economics, not blocking. Every static request still costs your Node process CPU for TLS, header handling, and stream plumbing — capacity you'd rather spend on API work. Nginx serves files with kernel-level `sendfile()` and never touches your app. A CDN goes further: copies sit in edge locations near users, so a user in Mumbai fetches your bundle from Mumbai, not from your Virginia data center. For small internal tools, `express.static` is genuinely fine. For customer-facing traffic, it's the wrong tool holding the right tool's job.

## 4. See It In Practice — Real Code or Queries

Both snippets below were run against a real Express 5 server and the responses shown are what it actually returned.

First, hardened static serving with the two-caste cache strategy:

```js
const express = require('express');
const path = require('path');

const app = express();
const DIST = path.join(__dirname, 'client/dist');

// Hashed build assets get a one-year cache. The filename hash is what makes
// this safe: new deploys produce NEW names, so a cached old file can never
// masquerade as the latest version.
app.use(express.static(DIST, {
  maxAge: '1y',
  immutable: true,
  // setHeaders runs AFTER the built-in Cache-Control is applied,
  // so this override wins for HTML — verified on Express 5.2.1:
  //   GET /          -> Cache-Control: no-cache
  //   GET /style.css -> Cache-Control: public, max-age=31536000, immutable
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));
```

Second, the complete SPA wiring with correct ordering and a smarter fallback:

```js
// 1. API FIRST — otherwise the fallback below swallows these requests.
//    Keeping every endpoint under one prefix gives us a cheap way to
//    recognize "this wanted JSON, not the map brochure."
const api = express.Router();
api.get('/users', (req, res) => res.json([{ id: 1 }]));
api.get('/orders/:id', (req, res) => res.json({ id: req.params.id }));
app.use('/api', api);

// 2. STATIC ASSETS — unmatched requests fall through silently.
app.use(express.static(DIST));

// 3. FALLBACK LAST — plain middleware, not a '*' route, so this works on
//    Express 4 AND 5 (Express 5 throws on app.get('*')).
app.use((req, res, next) => {
  // Only hand the brochure to real navigations. A request for a missing
  // .js/.css file should be an honest 404, not index.html wearing a 200 —
  // see the traps section for the blank-screen bug this prevents.
  const wantsHtml = (req.headers.accept || '').includes('text/html');
  if (!wantsHtml || req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  // sendFile demands an absolute path (or a { root } option) — a relative
  // one throws at request time, not startup.
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(3000);
```

With this wiring, verified end to end: `GET /api/users` → `application/json`; `GET /dashboard/42` on refresh → `200` with `index.html`; `GET /missing.js` → honest `404` JSON instead of fake-HTML.

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you serve static files in Express?**

`express.static(root)` returns middleware that maps incoming URL paths onto files under `root`. You mount it like any middleware — `app.use(express.static('public'))` serves `public/style.css` for a request to `/style.css`. For each matching request it resolves the path, guards that the resolved file stays inside the root, then streams the file out with a `Content-Type` guessed from the extension, an `ETag` and `Last-Modified` for revalidation, and whatever cache policy you configured. Non-matching requests fall through to the next middleware, which is what lets you layer API routes and static serving in one app. The same middleware also handles `Range` requests for partial downloads and serves `index.html` for directory paths — details interviewers like hearing unprompted.

**Q: What does mounting at a prefix actually do — `app.use('/static', express.static('public'))`?**

Two things, and confusing them causes real bugs. First, the prefix routes the request to this middleware only when the URL starts with `/static`. Second — and this is the part people miss — the prefix is *stripped* before the lookup: `/static/style.css` searches for `public/style.css`, **not** `public/static/style.css`. Like the library wing sign: it selects the room, it isn't printed on the books. The practical consequence is that your URLs (`/static/x.js`) don't have to match your folder layout (`public/x.js`).

**Q: How does express.static protect against path traversal?**

Before touching the filesystem it decodes the URL (turning `%2e%2e%2f` into `../`), joins it onto the root, and fully resolves the result to an absolute path. Then it enforces one invariant: that resolved path must still be inside the root directory. A request like `/assets/../../server.js` — raw or encoded — resolves to somewhere outside `public/` and gets rejected with 404/403 before any file is opened. We fired exactly those encoded attacks at a real Express instance and got clean 404s every time. Defense in depth still applies: keep `.env`, `.git`, and source files physically outside anything you mount, because the guard protects the boundary you drew, not secrets you put inside it.

**Q: How do you handle caching for static files correctly?**

Split files by how they change. Build tools give hashed filenames — content lives in the name — so those files can carry `Cache-Control: public, max-age=31536000, immutable`: the browser never even asks again for a year. `index.html` must be `no-cache`, meaning it revalidates each time (a cheap conditional request), so it always references the currently-existing hashed bundles. `express.static` supports this with `maxAge`, `immutable`, and a `setHeaders` callback that overrides the defaults for specific files. And know the difference between expiry (`max-age`) and validation (`ETag`/`Last-Modified` → `304 Not Modified`): max-age avoids the network entirely until expiry, while validation still makes contact but transfers nothing when nothing changed.

**Q: What happens when a user hits `/` — and how do you control it?**

Static middleware treats directory paths specially: it looks for a file named `index.html` inside that directory and serves it. So `/` serves `public/index.html`. You can rename the convention with `{ index: 'home.html' }` or turn it off with `{ index: false }` — useful when you want `/` handled by your own handler. Related detail worth mentioning: requesting a directory without a trailing slash (`/docs`) earns a 301 redirect to `/docs/`, which keeps relative asset links in served pages working.

**Q: How do you serve a React/Vue SPA from Express?**

Three layers, strictly ordered. API routes first (ideally all under `/api`). Then `express.static(dist)` for the hashed assets. Last, a fallback that sends `dist/index.html` for anything else, so deep links and refreshed pages like `/dashboard/42` load the app and let the client router take over. The fallback should be plain `app.use(...)` middleware — Express 5 rejects the old `'*'` route pattern at startup. And gate the fallback on the `Accept: text/html` header so missing assets get honest 404s instead of HTML pretending to be JavaScript. Order violations are the classic failure: register the fallback first and it answers your API calls with HTML.

**Q: Should Express serve static files in production?**

Usually not — but for the right reason. The popular reason ("it blocks the event loop") is wrong: files are streamed asynchronously. The real reasons are capacity and latency. Every static request burns app-server resources that API traffic could use; Nginx hands files over with kernel `sendfile()` without waking Node at all; a CDN additionally serves from edges near the user, cutting latency and shielding your origin entirely. Sensible split: `express.static` for development and small internal tools, CDN/Nginx for customer-facing traffic — often both, with the CDN pulling from object storage and your origin never seeing static requests at all.

**Q: How does Express decide the Content-Type of a served file?**

Purely from the file extension, via a mime-type lookup table: `.html` → `text/html`, `.css` → `text/css`, `.js` → `text/javascript`. Nothing about the file's *contents* is inspected. An unknown or absent extension falls back to `application/octet-stream`, which browsers treat as "download this." That's why extensionless files download instead of rendering, and why modern SPAs use `<script type="module" src="/app.js">` carefully — the type label drives browser behavior like parsing mode and downloads. If you must serve odd extensions, fix it per-file in `setHeaders`; the underlying sender also stamps `X-Content-Type-Options: nosniff`, so the browser won't second-guess your label.

## 6. The Traps — What Goes Wrong in Production

**The catch-all that ate the API.** Registering the SPA fallback before your API routes means the fallback matches first — permanently. We reproduced it: `/api/users` returned `index.html` with status 200, and the JSON handler became dead code. No error, no warning; the frontend just starts failing mysteriously. Fix: APIs first, static second, fallback last — the order *is* the architecture, since Express matches top-down.

**Caching index.html like an asset.** Slapping `maxAge: '1y'` on the whole dist folder feels efficient until a deploy ships. Returning users hold week-old HTML pointing at hashed files that no longer exist on your server → white screen or broken styles until their cache expires. The fix is the two-caste rule: immutable forever for hashed assets, `no-cache` for every HTML entry point. Deploy-day bugs that only affect "some users" (the returning ones) are almost always this trap.

**Mounting too much.** `express.static(__dirname)` — or any mount whose root contains `.env`, `.git`, config files, or source — turns your server into a public filing cabinet. The dotfile guard does refuse `/.env` by default (verified: 404), but it won't save `package.json`, `server.js`, or backup files like `users.json.bak`. Rule: the served directory contains *only* files built for public consumption. Secrets live outside it, always.

**The fallback masking missing assets.** With a naive `res.sendFile(index.html)` catch-all, a request for `/missing.js` — a typo'd path, a deleted chunk after a bad deploy — gets `200` with HTML. The browser then fails parsing JavaScript that is actually HTML, and the console error ("Unexpected token '<'") points nowhere helpful. Worse, some CDNs now cache that bogus 200. Gate the fallback on `Accept: text/html` as shown in the practice section, and missing assets become loud, honest 404s.

**Express 5 kills the asterisk.** Copying a v4-era snippet `app.get('*', ...)` into Express 5 crashes at startup: `Missing parameter name at index 1: *`. The router's pattern engine changed and `*` alone is no longer a legal pattern. Bare final middleware `app.use((req, res) => ...)` expresses the same intent and works on both major versions — prefer it.

**sendFile's absolute-path requirement.** `res.sendFile('index.html')` throws `TypeError: path must be absolute or specify root to res.sendFile`. It surprises people because `express.static('public')` happily accepts relative roots. They're different APIs with different contracts: pass an absolute path (`path.join(__dirname, ...)`) or `{ root: ... }`.

## 7. Compare With Related Concepts

**express.static vs res.sendFile.** Static is a standing arrangement: mount once, and every matching URL resolves automatically with caching, ranges, and ETags handled. `sendFile` is a one-off delivery: one handler, one known file, your explicit choice. Serve a folder with static; serve one specific file (an SPA entry, a generated report) with sendFile.

**express.static vs Nginx/CDN.** Same service, different economics. Express static runs in your app process and shares its fate and capacity; Nginx offloads delivery to a dedicated process; a CDN moves files geographically closer to users and absorbs traffic before it reaches your infrastructure. Development convenience versus production efficiency — most serious setups graduate left to right.

**Static middleware vs route handlers.** A route handler matches a *pattern* (`/users/:id`) and generates a response, usually from data. Static middleware matches a *filesystem path* and forwards an existing file. They compete in the same ordered pipeline, which is precisely why their registration order is a correctness requirement and not a style preference.

**Static-file caching vs server-side caching.** Browser/CDN caching (headers on this page) saves *network trips and bytes* for unchanging files. Server-side caching — Redis and friends — saves *computation and queries* for expensive dynamic responses. Different layers, different invalidation stories: hashed filenames make the former trivially safe, while the latter needs deliberate invalidation. In interviews, naming which layer you're talking about is half the answer.

On the receiving side, uploads are the mirror image of this topic: accepting files into storage is handled separately in [how-do-you-handle-file-uploads.md](./how-do-you-handle-file-uploads.md), while this page is about sending existing files out.

## 8. 🧠 The Memory Hook

A static file server is a library lending desk: every book was printed before you walked in, the wing sign on your catalog slip gets stripped before the shelf search, clever catalog numbers can't reach the staff-only room, the return-date stamp (immutable assets) and the "already read this edition?" glance (304) decide whether any book moves at all — and every lost visitor walks away with the same map brochure called index.html, handed out strictly *after* the librarian has checked whether you really wanted a book.
