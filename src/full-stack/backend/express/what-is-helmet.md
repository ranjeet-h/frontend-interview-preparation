# What is Helmet

## 1. The Real-World Problem — When You Actually Hit This

Two incidents, same app, three weeks apart.

First: the penetration test comes back. Your authentication is solid, your inputs are validated, your queries are parameterized — and the report still lists nine "missing security header" findings. Clickjacking exposure. MIME confusion. No transport strictness. Nobody on the team knows which header the reviewer means, so the ticket sits in the backlog for a quarter.

Second: someone finally reads the report, installs Helmet, and ships it on a Friday afternoon. By Monday half the frontend is dead. The React bundle loads, but a third-party chat widget never boots. Google Fonts vanish. Analytics flatline. The browser console fills with `Content-Security-Policy` violation messages nobody has ever read. Emergency rollback, a hotfix meeting, and a new team rule: "nobody touches the security stuff."

Both incidents come from the same blind spot. Almost every frontend attack — XSS payloads, clickjacking, MIME confusion — executes in the user's browser, not on your server. And once a response leaves your Express process, your server cannot reach into that browser and stop anything. The only channel you control is the response itself: a handful of header lines the browser has agreed to obey. Helmet writes those lines. Used blindly, it either protects nothing or breaks everything. Used with understanding, it is the cheapest security win in your entire stack.

## 2. The Analogy — Make the Mechanic Obvious

Think of your Express app as a factory that ships chemicals in steel drums.

The drums leaving your plant are HTTP responses. Your factory floor can be spotless and safe — great auth, validated inputs — but the moment a drum rolls out the gate, it travels through territory you don't control: carrier trucks, transfer stations, other people's warehouses. That's your response traveling across networks into the user's browser, where attackers inject things and mishandling happens.

The receiving warehouses run automated handling machines that are contractually required to obey one specific label standard. Not judgment calls, not suggestions — the machines are built to read certain printed codes and mechanically comply. Browsers are those warehouses, and security headers are those label codes. `X-Frame-Options: SAMEORIGIN` reads like "display only inside our own showroom." `X-Content-Type-Options: nosniff` reads like "contents are certified — do not taste-test to identify them." `script-src 'self'` on a CSP reads like "approved power tools only." The browser reads each code off the shipment and enforces it, because that obedience is baked into the browser specification.

Helmet is the label-printing station bolted onto your production line. It guards nothing itself. Its whole job is stamping the right codes onto every drum that leaves — and it does that one job reliably, for all twelve-ish standard codes, in one line of setup.

Three parts of the analogy carry real interview weight:

- **Install the labeler before the loading dock.** If the label station sits after the loading dock on the line, some drums roll out unmarked. In Express terms: register Helmet before your routes, static file serving, and error handlers, or those responses leave without headers.
- **A wrong label stops legitimate customers.** Stamp "industrial solvent only" on a drum a bakery needs for food-grade syrup, and the bakery walks. That's the default CSP blocking your inline startup script or your analytics vendor.
- **You can trial-print a new label.** Print the proposed label with "DRAFT — do not enforce yet, report conflicts," collect complaints for a week, fix the wording, then enforce. That's `Content-Security-Policy-Report-Only`.

One place the analogy needs sharpening: real warehouses could ignore labels, and often do. Browsers can't. Honoring these exact headers is written into their specs, which is precisely why this mechanism works at all — and why a typo'd or missing header quietly equals "no protection," not "partial protection."

## 3. The Full Explanation — How It Actually Works

Strip away the marketing and Helmet is a bundle of small middleware functions, each of which writes exactly one HTTP response header (or removes one), packaged behind a single `app.use(helmet())`. Current versions set about a dozen headers by default and strip Express's self-advertising `X-Powered-By` header. The exact list shifts between major versions — older blog posts mention headers like `Expect-CT` that recent releases dropped — so learn what each header *does* rather than memorizing a count.

Why headers at all? Because of where attacks live. Your server processes requests and sends bytes back. The dangerous stuff — running scripts, framing your page, sniffing file contents, downgrading your HTTPS — happens afterward, inside the browser. The browser is also the only party positioned to stop those things, and it will, but only if you tell it what rules to enforce. Response headers are that instruction channel: tiny, cacheable by the browser, applied per response, costing your server essentially nothing. The trade-off you accept is real though: these are *instructions*, and a strict instruction blocks attackers and legitimate code alike. Most of the operational work around Helmet is tuning that balance.

Walk through the important defaults, grouped by the job each one does.

**Controlling who loads what — `Content-Security-Policy`.** This is the heavyweight. XSS happens when attacker-controlled text ends up executing as code in your page — the full attack playbook is on [how do you prevent XSS](how-do-you-prevent-xss.md). Sanitizing input reduces the chance of injection; CSP limits the blast radius when something slips through. It works by allowlisting where the page may load resources from: which script sources, which style sources, which image hosts, which endpoints `fetch` may talk to. An injected `<script src="evil.com">` dies on arrival because `evil.com` is not on the list. Helmet's default policy allows scripts only from your own origin (`script-src 'self'`), blocks plugins (`object-src 'none'`), restricts who may embed the page (`frame-ancestors 'self'`), and upgrades HTTP URLs to HTTPS. Note what the default deliberately permits: styles may be inline (`style-src ... 'unsafe-inline'`) because so many frameworks rely on it — but inline *scripts* are blocked, which is exactly the default that whitescreens apps on deploy day.

**Refusing to be framed — `X-Frame-Options` and `frame-ancestors`.** In a clickjacking attack, the attacker's page loads your site in a transparent iframe stacked invisibly on top of a decoy interface. The victim thinks they're clicking "win a prize"; they're really clicking your logged-in "confirm transfer" button, because their browser attaches their session cookie to your page inside that iframe. Both headers answer one question: who is allowed to embed this page in a frame? `SAMEORIGIN` says only your own origin. Modern CSP expresses this as `frame-ancestors`; the legacy `X-Frame-Options` header survives because old browsers never learned the newer syntax. Helmet sets both.

**Trust the label, not the smell — `X-Content-Type-Options: nosniff`.** Decades ago, many servers lied about or omitted the `Content-Type` header, so browsers grew a survival habit: peek at the bytes and guess what the content really is ("MIME sniffing"). Guessing is an attack surface. An attacker who can upload files to your domain serves up `malware.txt` — but the browser sniffs HTML inside, renders it, and now that script runs on your origin with your cookies. `nosniff` orders the browser to trust the declared type strictly and refuse anything that doesn't match. It's a one-line fix for a whole class of upload-related attacks, and it pairs naturally with serving uploads defensively as covered in [how do you handle file uploads](how-do-you-handle-file-uploads.md).

**Locking the transport — `Strict-Transport-Security` (HSTS).** On hostile Wi-Fi, an attacker can intercept your users' first HTTP attempt and proxy it, keeping them on plaintext while reading everything — an "SSL-strip" downgrade attack. HSTS flips the burden: once your response carries `Strict-Transport-Security: max-age=31536000; includeSubDomains`, the browser *remembers* for a year that this host is HTTPS-only and rewrites any future `http://` attempt to `https://` before the request even leaves the device. Notice the stickiness — unlike other headers, this one persists across visits, which makes it powerful and slightly dangerous. `includeSubDomains` extends the lock to every subdomain, ready or not, and the optional `preload` directive feeds permanent browser-baked lists that are famously painful to leave. Helmet's default max-age changed across majors (180 days in v7, 365 days in v8), another reason to check the docs for your installed version.

**Leaking less — `Referrer-Policy`.** Every navigation away from your page can carry a `Referer` header containing the full source URL — sometimes including tokens or personal data sitting in query strings. Helmet defaults to `no-referrer`, meaning outbound navigations announce nothing about where they came from. Pure privacy win, occasional friction if a partner genuinely depended on receiving full referrer URLs.

**Isolation — `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Origin-Agent-Cluster`.** These are the modern process-isolation family, blunting side-channel attacks (Spectre-class) and cross-window tricks. `COOP: same-origin` cuts the connection between your page and cross-origin windows it opens — which is a security win until it breaks an OAuth popup flow that relied on reaching its opener; the escape hatch is `same-origin-allow-popups`. `CORP: same-origin` stops other sites from embedding your resources — good against hotlinking and leak attacks, awkward if a partner legitimately hot-links your images.

**Deliberately turning protection OFF — `X-XSS-Protection: 0`.** This one looks like a mistake and isn't. Old browsers shipped a heuristic XSS auditor that scanned responses for reflected payloads; it was buggy, could be abused to *introduce* vulnerabilities, and is obsolete next to a real CSP. Setting `0` explicitly switches that legacy filter off. Interviewers love this one, because candidates who recite header names without understanding confidently call it "the XSS protection header."

The remaining defaults — `X-DNS-Prefetch-Control: off` (privacy over prefetch speed), `X-Download-Options: noopen` (an Internet Explorer 8 relic), `X-Permitted-Cross-Domain-Policies: none` (a Flash/Acrobat relic) — cost nothing, help marginally in corners, and mainly signal that your stack is maintained.

Finally, the mechanics inside Express, because placement questions always follow. Each Helmet sub-middleware is ordinary middleware: when a request passes through it, it synchronously writes its header onto the response object and calls `next()`. Headers attach to the *request's* journey inward, so the eventual response — whether produced by a route handler or by your error middleware — carries them. But requests never flow backward. Anything mounted above Helmet skips it and responds unlabeled: static files served before `helmet()`, health checks routed around it, 404s from an earlier catch-all. The ordering rules fall out of the middleware-chain mechanics covered in [how does Express middleware work](how-does-express-middleware-work.md): put Helmet at the very top, before CORS, body parsing, routes, and error handlers. The full request journey, including the moment headers become locked, is in [what is the request-response lifecycle in Express](what-is-request-response-lifecycle-in-express.md).

What Helmet does *not* do deserves equal airtime. It authenticates nobody, validates nothing, refuses no request — a request carrying a SQL injection payload sails through a Helmet-protected app untouched. Rate limiting, input validation, auth, and hashing passwords remain separate layers; the broad checklist lives in [how do you secure an Express app](how-do-you-secure-express-app.md). Cookie-based apps should also treat cookie attributes (`HttpOnly`, `Secure`, `SameSite`) as part of the same defense — that story is in [how do you use cookies in Express](how-do-you-use-cookies-in-express.md). Helmet raises the cost of successful attack; it does not remove the attacker.

## 4. See It In Practice — Real Code or Queries

Assumptions for every snippet: Node 18+, `npm i express helmet`, Helmet 8.x, CommonJS so each file stands alone under `node`. Snippets use Express 4-style handlers; where async work appears, errors are explicitly forwarded with `next(err)` so the code is correct under Express 4 *and* 5 (Express 5 auto-forwards rejected promises to error middleware; the wrapper mechanics live in [how do you handle async errors in Express](how-do-you-handle-async-errors-in-express.md)).

Baseline setup, in the correct position:

```js
// server.js — npm init -y && npm i express helmet && node server.js
const express = require("express");
const helmet = require("helmet");

const app = express();

// First line of the stack: every response this app produces gets labeled,
// including 404s, static files, and error responses generated later on.
app.use(helmet());

app.use(express.json());

app.get("/api/orders", (req, res) => {
  res.json({ orders: [{ id: 1, total: 42 }] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`listening on ${PORT}`));
```

Verify with `curl -i http://localhost:3000/api/orders` (output abbreviated):

```txt
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self';base-uri 'self';font-src 'self' https: data:;
  form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';
  script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';
  upgrade-insecure-requests
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 0
```

That `Content-Security-Policy` value is what broke the fictional frontend in section 1. Here's the incident, then the fix. The app loads its bundle from a CDN, pulls fonts from Google, and reports to an analytics host. All three violate `script-src 'self'`-style defaults, so the browser blocks them and the console fills with violations. Directives you set merge *into* Helmet's default policy — you only declare your deltas:

```js
const helmet = require("helmet");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // These MERGE with the defaults; anything not listed stays strict.
        "script-src": ["'self'", "https://cdn.jsdelivr.net"],
        "style-src": ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'", "https://api.analytics.example.com"],
      },
    },
  }),
);
```

Roll out a tightened CSP without betting production on it — the draft-label trick:

```js
// Violations log to the browser console; NOTHING is blocked yet.
// Watch reports for a week, fix the gaps, then drop reportOnly.
app.use(
  helmet({
    contentSecurityPolicy: {
      reportOnly: true,
      directives: {
        "script-src": ["'self'"],
      },
    },
  }),
);
```

Environment-aware configuration with a fail-closed shape. Unknown `NODE_ENV` values fall through to the strictest posture, never a loose one:

```js
// helmet-config.js
const helmet = require("helmet");

const helmetConfigByEnv = {
  development: {
    // Keep http://localhost usable: Safari upgrades localhost otherwise.
    contentSecurityPolicy: {
      directives: { "upgrade-insecure-requests": null },
    },
    strictTransportSecurity: false, // don't pin your dev browser to https://localhost
  },
  test: {
    contentSecurityPolicy: false, // meaningless for JSON assertions; keeps output clean
  },
  production: {}, // full defaults — the strictest configuration lives here
};

function buildHelmet(env) {
  const config = helmetConfigByEnv[env];
  if (config === undefined) {
    // Unknown environment -> strongest default, not the weakest.
    return helmet();
  }
  return helmet(config);
}

module.exports = { buildHelmet };
```

When you genuinely need inline scripts, skip `'unsafe-inline'` and use a per-request nonce instead. Helmet accepts a function inside a directive array; it runs per request, so each response carries a fresh value:

```js
// nonce-server.js
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");

const app = express();

// Runs BEFORE helmet: mint one unpredictable nonce per request
// and park it on res.locals where both sides can read it.
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("hex");
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // Function values are evaluated per request.
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
      },
    },
  }),
);

app.get("/", (req, res) => {
  // Only a script carrying THIS response's nonce will execute.
  res.send(`
    <h1>Checkout</h1>
    <script nonce="${res.locals.cspNonce}">
      document.body.dataset.booted = "true";
    </script>
  `);
});

app.listen(3000);
```

And proof that registration position pays off on the worst day — error responses stay labeled. Even the 404 path carries the full header set, because Helmet already ran during the request's inbound trip:

```js
// error-path.js — curl -i http://localhost:3000/api/orders/nope
const express = require("express");
const helmet = require("helmet");

const app = express();

app.use(helmet()); // registered before anything that can fail

// Wrapped: in Express 4 an unwrapped rejection never reaches the error
// middleware, so we forward failures ourselves. Correct in Express 5 too.
app.get("/api/orders/:id", async (req, res, next) => {
  try {
    const order = await db.findOrder(req.params.id); // stand-in for a real DB call
    if (!order) {
      const err = new Error("order not found");
      err.status = 404;
      return next(err);
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// Four parameters — that arity is what makes this the error handler.
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(3000);
```

```txt
HTTP/1.1 404 Not Found
Content-Security-Policy: default-src 'self';...
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
{"error":"order not found"}
```

One honest caveat to volunteer in interviews: Helmet performs almost no validation of your CSP strings — a typo'd directive silently weakens the policy. Run your finished policy through a checker like Google's CSP Evaluator before it ships.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is Helmet, and what problem does it solve?**

It's Express middleware — internally a bundle of small header-setting middleware functions — whose job is attaching browser-enforced security instructions to every HTTP response. The problem it solves is structural: attacks like XSS, clickjacking, and MIME confusion execute in the user's browser, where your server has no reach. The only lever you control is the response itself, and the browser has committed to honoring specific headers as policy. Without Helmet, every response leaves with default (trust-everything) behavior; with it, each response tells the browser exactly what's allowed. The crucial framing: Helmet doesn't block attacks against your server — it hardens what the browser does with your pages.

**Q: Which headers does Helmet set by default, and what attack does each mitigate?**

Name the ones that matter and pair each with its attack — that pairing is what separates understanding from recitation. `Content-Security-Policy` allowlists resource sources, capping XSS blast radius. `X-Frame-Options: SAMEORIGIN` plus CSP's `frame-ancestors 'self'` refuse foreign framing, killing clickjacking. `X-Content-Type-Options: nosniff` stops MIME-sniffing abuse of mislabeled files. `Strict-Transport-Security` pins browsers to HTTPS, defeating SSL-strip downgrade attacks. `Referrer-Policy: no-referrer` stops URL leakage on outbound navigation. `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` isolate your page and resources from cross-origin contexts, blunting side-channel and embedding attacks. `X-XSS-Protection: 0` deliberately disables the buggy legacy auditor. The rest — DNS prefetch control, IE-era download options, Flash-era cross-domain policies, removing `X-Powered-By` — are cheap relics and hygiene. Mention that the exact roster changes between major versions and that you check the docs for your installed one; that admission lands better than a memorized list that's slightly stale.

**Q: How do you configure Content-Security-Policy with Helmet?**

Pass `contentSecurityPolicy.directives`, and know that your entries merge into Helmet's sensible defaults — you declare deltas, not the whole world. Start from `default-src 'self'`, then open narrow doors per resource type: `script-src` for code sources, `style-src` for stylesheets, `font-src`, `img-src`, and `connect-src` for `fetch`/XHR destinations. Two rules separate seniors from juniors here. First, never paper over breakage with `'unsafe-inline'` in `script-src` — that reopens most of what CSP closes; use per-request nonces instead (Helmet supports function-valued directives for exactly this). Second, roll out via `reportOnly: true`, watch console violations until they hit zero, then enforce. Also admit Helmet won't validate your policy for you — run it through a CSP Evaluator.

**Q: Can Helmet break your application? Give a concrete example.**

Yes, and having a war story here is worth more than the theory. The classic: deploy Helmet with defaults, and the SPA goes partially dark — inline bootstrap scripts blocked by `script-src 'self'`, CDN assets and analytics refused, Google Fonts missing. Second classic: `upgrade-insecure-requests` (on by default inside CSP) makes Safari upgrade `http://localhost` to HTTPS, quietly wrecking local development — disable that directive per-environment. Third: HSTS with `includeSubDomains` locks browsers into HTTPS for subdomains that weren't TLS-ready yet, and `preload` is close to irreversible once browsers bake it in. Fourth: `COOP: same-origin` severs `window.opener` for cross-origin popups, breaking OAuth flows that depend on it — switch to `same-origin-allow-popups`. Fifth: `CORP: same-origin` blocks partners from legitimately embedding your images. The pattern behind all five: defaults encode a strict posture, and strictness collides with real integrations. Test in staging, stage CSP in report-only mode, relax only what evidence demands.

**Q: Where should Helmet sit in the middleware stack, and why?**

At the very top, before CORS, body parsing, routes, and error handlers. The reason is mechanical, not stylistic. Helmet writes headers as the request passes *through it inward*; a response inherits whichever headers were stamped during its request's journey. Middleware and routes registered above Helmet receive requests first and can respond without Helmet ever running — those responses ship unlabeled. That includes static-file serving mounted early and catch-all 404 handlers. Meanwhile error middleware sits last by design, so if Helmet sat anywhere below the top, error-generated responses would lose their headers precisely on the responses attackers probe most. Order: Helmet, CORS, parsers, logging, auth, routes, error handler.

**Q: Why does Helmet set `X-XSS-Protection: 0`? Turning off XSS protection sounds insane.**

Because that header controls a retired, harmful feature, not modern protection. Legacy browsers shipped a heuristic "XSS auditor" that tried to spot reflected payloads in responses. In practice it was exploitable itself — researchers showed ways its blocking behavior introduced new holes — and it offered nothing that a real CSP provides. Modern browsers removed the auditor entirely; they ignore the header. Helmet sends `0` to explicitly switch it off where it still exists. The deeper lesson an interviewer wants: header names lie. Read what each header actually instructs the browser to do, never trust the label.

**Q: What's the difference between `X-Frame-Options` and CSP `frame-ancestors`?**

Same question, two generations of grammar. Both answer "who may embed this page in a frame?" — the clickjacking defense. `X-Frame-Options` is the legacy header with only `DENY` and `SAMEORIGIN` (its `ALLOW-FROM` variant is unsupported and dead). `frame-ancestors` is the CSP directive: richer (explicit ancestor lists), and it correctly ignores `ALLOW-FROM`-era semantics. Rule: set both — Helmet's default does — because modern browsers use `frame-ancestors` while ancient ones only understand `X-Frame-Options`.

**Q: How does HSTS work, and what are its footguns?**

Mechanic: the response header tells the browser to remember, for `max-age` seconds, that this host speaks HTTPS only — every future navigation rewrites `http://` to `https://` client-side, before any network request, which is what defeats SSL-strip attackers on hostile networks. Footguns follow directly from the stickiness. `includeSubDomains` extends the lock to subdomains that may not be TLS-capable yet. Long max-ages plus `preload` (submission to browser-baked lists) are extremely hard to undo — treat preload as a one-way decision. And never enable HSTS on plain-HTTP local development, or your browser pins itself to `https://localhost`. Standard practice: modest max-age initially, raise it once you're confident, keep `preload` off unless the whole org is committed.

**Q: Is Helmet enough to secure my Express app?**

No, and saying so plainly is the senior move. Helmet shapes browser behavior after a response leaves; it inspects nothing coming in. Input validation, authentication, authorization, rate limiting, password hashing, dependency patching, and safe error handling are separate mandatory layers — Helmet composes with them, it doesn't replace them. Defense in depth is the frame: CSP assumes some XSS slipped past sanitization and caps the damage; `nosniff` assumes a mislabeled upload escaped validation and refuses to render it. Each layer shrinks the blast radius of the previous layer's failure.

**Q: My backend is a pure JSON API consumed by a mobile app. Do I still need Helmet?**

Mostly yes, with honest trimming. Mobile clients never parse your responses as web documents, so CSP is nearly irrelevant to them — some teams disable it for API-only services or manage it at the edge instead. But `nosniff` still protects browser-facing endpoints (uploads, redirects, anything a browser might touch), HSTS still matters if the domain ever serves browsers, and the isolation headers cost nothing. Reasonable answer: keep Helmet, disable CSP with a stated reason (`contentSecurityPolicy: false`), and revisit the moment the domain starts serving HTML.

**Q: Should I set these headers in nginx or my CDN instead of in Express?**

Either works; pick one owner. The failure mode of "both" is subtle: when a browser receives two CSP headers, it enforces the intersection — the most restrictive combination — so a stale proxy policy silently blocks resources your app policy allows, producing violations that look inexplicable from the app's logs. Putting ownership in Express keeps headers versioned, reviewed, and deployed with the code that depends on them; putting it at the proxy guarantees coverage even when app servers bypassed (rare, and itself a smell). Whichever you choose, document it and add a header-check to your deploy verification so drift gets caught.

## 6. The Traps — What Goes Wrong in Production

- **Registering Helmet after routes or static files.** Wrong assumption: "middleware order barely matters for headers." Reality: requests answered above Helmet never pass through it, so those responses — static assets, early 404s, health checks — leave completely unlabeled. Fix: `app.use(helmet())` as the first line of the stack, and assert headers exist on a 404 in your integration tests.
- **Deploying default CSP against an existing frontend.** Wrong assumption: "security defaults are safe to enable anytime." Reality: `script-src 'self'` blocks inline scripts, CDN bundles, analytics, and WebSocket connections to other hosts; the app looks fine to curl and is broken for users. Fix: inventory every external origin first, express them as directive deltas, and stage the policy in report-only mode.
- **Enabling HSTS everywhere, forever, on day one.** Wrong assumption: "max HTTPS is always safer." Reality: `includeSubDomains` pins browsers to HTTPS for subdomains that aren't ready; `preload` submissions are effectively permanent; local dev browsers get stuck on `https://localhost`. Fix: start with a moderate max-age, no preload, HSTS disabled in development via environment-aware config.
- **Fixing CSP breakage with `'unsafe-inline'`.** Wrong assumption: "the console said inline is blocked, so allow inline." Reality: that single token neutralizes most of CSP's XSS protection — exactly what an attacker's injected inline script needs. Fix: per-request nonces via function-valued directives, moving scripts into external files, or hashes for genuinely static inline code.
- **Treating Helmet as "the security work."** Wrong assumption: "headers were on the pentest report, headers are installed, box ticked." Reality: a request with an injection payload, a stolen session cookie, or a brute-force login attempt interacts with Helmet zero times. Fix: keep Helmet as one layer among validation, auth, rate limiting, and logging — the layered checklist is in [how do you secure an Express app](how-do-you-secure-express-app.md).
- **Set-and-forget CSP.** Wrong assumption: "the policy is written, it stays correct." Reality: six months later someone adds a payment SDK or a font host, staging works because report-only is still on, production silently refuses it, and checkout dies. Fix: pipe CSP violation reports somewhere observable, and make new external origins a review checkpoint.
- **Copying a five-year-old config from a blog post.** Wrong assumption: "header names are stable forever." Reality: majors drop and rename options (recent versions removed `Expect-CT`; HSTS defaults moved from 180 to 365 days), and stale configs either error or quietly set nothing. Fix: read the docs tab for your installed major version, and prefer explicit named options over giant copied blobs.
- **Expecting headers to protect non-browser clients.** Wrong assumption: "CSP protects my API." Reality: mobile apps and `curl` never parse responses as documents; CSP constrains browser rendering of HTML, nothing else. Fix: scope your header strategy to the clients that actually honor each header, and say that scoping out loud in design reviews.

## 7. Compare With Related Concepts

- **Helmet versus setting headers yourself.** Nothing magical happens inside — `res.setHeader("X-Content-Type-Options", "nosniff")` is exactly what a sub-middleware does. Hand-rolling gives you full control and zero dependencies; you also inherit permanent maintenance of a moving target (versions drop and rename headers). Rule: prototype or audit with manual headers, run production on the maintained bundle — then read its docs once so you know what you're shipping.
- **Security headers versus CORS headers.** Constantly confused, opposite directions. Security headers govern how the browser treats *your own* page and resources — framing, scripting, sniffing. CORS headers (`Access-Control-Allow-Origin` and friends) govern whether JavaScript running on *other origins* may read your responses. A Helmet-protected API and a correctly configured CORS setup coexist; tightening one does nothing for the other. The CORS mechanics and pitfalls are covered in [how do you handle CORS](how-do-you-handle-cors.md).
- **CSP versus input sanitization.** Sanitization lowers the probability that malicious markup enters your system; CSP lowers the impact when it does anyway. They're sequential safety nets, not alternatives — dropping sanitization because "CSP catches it" is how single-origin script injections turn into stored XSS. The sanitization playbook is in [how do you prevent XSS](how-do-you-prevent-xss.md).
- **Helmet versus edge/proxy header management.** nginx, load balancers, and CDNs can set identical headers. The trade is ownership: app-level headers version and deploy with the code whose behavior they constrain; edge-level headers guarantee coverage regardless of app config. Mixing both risks duplicate CSPs, which browsers enforce as an intersection — the stricter union wins and debugging gets miserable. Rule: exactly one owner, verified by a post-deploy header check.
- **Helmet versus rate limiting and auth middleware.** Different threat models on the same request path. Auth decides *who may act*; rate limiting decides *how often*; Helmet decides *what the browser may do with the response*. None of the three inspects what the others inspect, which is why removing any one of them widens a distinct hole. The big-picture layering lives in [how do you secure an Express app](how-do-you-secure-express-app.md).

## 8. 🧠 The Memory Hook

Your server cannot chase its responses into the browser to guard them — so Helmet is the label station that stamps handling instructions on every drum before it rolls out the gate, and the browser's machinery enforces those labels mechanically. Unlabeled drum out the door, unprotected page in the browser: that's why Helmet goes first, and a wrong label stops your legitimate customers just as fast as it stops attackers.
