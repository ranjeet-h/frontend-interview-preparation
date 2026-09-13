# How do you secure Express app

## 1. The Real-World Problem — When You Actually Hit This

Your API has been in production for eight quiet months. Then one week it all arrives at once. Tuesday, 2am: the Node process climbs to 2GB of memory and dies. Kubernetes restarts it, it dies again, and your on-call phone becomes an alarm clock. The logs show thousands of POSTs carrying ~300MB JSON bodies — and `express.json()` dutifully buffered every single byte into RAM before any of your code got a say. Nobody ever set a body limit, because it worked fine when nobody was attacking it. Thursday: the pentest report lands, and one finding reads like a confession — `/login` accepted over 10,000 password guesses in an hour, all from one IP address, and the server answered every one of them politely. Friday: GitHub flags a known vulnerability in a transitive dependency you have never heard of, pulled in by a package you installed in month one.

Here is the part worth sitting with: these three incidents have nothing to do with each other. Fixing the memory crash would not have stopped the password guessing. Adding a login rate limit would not have patched the dependency. Each one was an unattended door, and attackers do not pick one door — they try all of them, because apps are rarely attacked the way developers defend them.

That is the real lesson of this page. Securing an Express app is not one setting, one library, or one clever trick. It is a checklist of independent defenses where each item is aimed at a specific, named attack — and each item is built on the honest assumption that every other item will eventually fail.

## 2. The Analogy — Make the Mechanic Obvious

Think of a busy container port.

A ship arrives carrying thousands of metal boxes, and the port has no idea — and no way to know — whether any of them holds something dangerous. So the port does not rely on trust or on any single inspection. It relies on a series of different barriers, each one catching what the previous one missed.

First, the berth itself refuses ships beyond a certain size. There is no negotiation and no "let it dock and we'll figure it out" — cargo above the limit simply never enters, because unloading it would crush the dock. Next comes everything you see from the air: fences, floodlights, cameras, patrols. None of that inspects a single box. It just makes every ordinary attack technique harder, all the time, for everyone. At the road gate, a guard counts trucks per carrier per hour; past the count, no more trucks enter today, whether the jam is an attack or an accident. Inside, customs officers open containers — and notice they open *all* of them. Not the suspicious ones. Not "everyone except our shipping line of fifteen years." Every box is checked against a manifest of what is allowed to exist, and anything not on that manifest is refused, no matter how trustworthy the paperwork looks. Deeper in, workers wear zone badges: stevedores cannot walk into the customs office, badges expire, and a report of a stolen badge kills it at every reader instantly. And finally there is the thing everyone forgets: the port did not build its own cranes. Vendors delivered them, assembled. A sabotaged crane part walks past every checkpoint above, because the port invited it in — which is why ports vet their suppliers and act on recall notices.

Two principles make this whole system work, and they are exactly the two principles of Express security. Every layer assumes the previous one failed — customs does not wave a box through because the shipper has been reliable for a decade. And the layers are ordered cheapest-and-broadest first: berth limits and truck counting cost almost nothing, so they run on everything, while the expensive container-by-container inspection only happens after the cheap filters already passed.

## 3. The Full Explanation — How It Actually Works

In Express, every one of those port layers is just middleware or configuration in one pipeline, and the order you register them in *is* your defense strategy. Requests flow through in registration order; each layer either rejects the request outright, strips something dangerous out of it, or attaches verified information for later layers to trust. Let's walk the checklist — and for every layer, name the attack it exists to stop, because "add helmet" means nothing until you know what it catches.

**Body size limits — stops memory-exhaustion denial of service.** When `express.json()` runs, it reads the incoming request stream into memory and then parses it. By default it gives up at 100kb and returns a 413 error — which is a great default that people routinely destroy by writing `{ limit: "50mb" }` globally to make one upload route work. That one line reopens the door from our opening story: an attacker can now park hundreds of megabytes in your process's memory, per connection, concurrently, and Node dies without a single "hacked" flag in any log. The fix is shaped like the port: a tight default for the whole app, and a wider allowance mounted only on the specific routes that genuinely need it. Two footnotes matter in interviews: file uploads usually arrive as multipart forms handled by Multer with its own limits (so the JSON limit is not the knob to turn), and compressed requests still burn CPU being decompressed before the size cap applies — which is why reverse proxies typically reject oversized bodies before they reach Node at all.

**Helmet — stops the browser-side classics: clickjacking, MIME confusion, protocol downgrade, and free ammunition for XSS.** Helmet is one middleware that sets HTTP response headers telling the user's browser how to treat your pages and APIs. Each header maps to a concrete attack. `X-Content-Type-Options: nosniff` stops the browser from guessing a file's type — without it, an uploaded "text file" served from your domain can be reinterpreted and executed as a script. `X-Frame-Options: DENY` (and the modern CSP `frame-ancestors` equivalent) stops your pages being embedded in invisible iframes overlaid with fake buttons — clickjacking. `Strict-Transport-Security` tells browsers "HTTPS only from now on," killing attempts to downgrade connections and read traffic or steal cookies. `Content-Security-Policy` declares which sources may load scripts into your pages, so even an XSS hole has far less room to detonate. `Referrer-Policy` keeps URLs — sometimes containing tokens — from leaking to third-party sites. Because helmet works on responses, it is nearly free, and it goes first so every response carries the headers. Current versions also deliberately send `X-XSS-Protection: 0`: browsers retired that old filter, and CSP is the real control now. Installing helmet is thirty seconds; tuning CSP to your actual frontend is the part people skip.

**Rate limiting — stops brute force, credential stuffing, and flooding.** A counter per client within a time window; over the limit, answer 429 and stop spending resources. This is the truck-counting gate. It earns its place twice over: globally, to cap what any single client can make your app do, and much more strictly on sensitive routes — ten login attempts per fifteen minutes makes online password guessing computationally hopeless. But two implementation details decide whether your limiter actually works, and interviewers love both. First, identity: behind a reverse proxy, Express needs `trust proxy` configured correctly to know the real client IP. Get it wrong in one direction and every visitor shares the proxy's IP, so one attacker locks out your entire user base; get it wrong the other direction (trusting the header blindly) and attackers rotate fake `X-Forwarded-For` values to get a fresh bucket every request. Second, storage: the default in-memory counter lives in one process. Run four replicas behind a load balancer and your "100 per minute" quietly becomes 400 per minute, and every deploy wipes the counters clean. Shared state across instances means Redis or similar — the mechanics live in [how do you rate limit APIs](how-do-you-rate-limit-apis.md).

**Input validation — stops injection, mass assignment, prototype pollution, and type-confusion bypasses.** This is customs opening every container: the paperwork lies. `Content-Type: application/json` says nothing about what is inside; a field named `email` proves nothing about being an email; and an attacker crafting raw `curl` requests sends whatever shape benefits them. A schema validator checks the payload against an allowlist of what may exist, rejects or strips the rest, and — critically — hands your handler the *parsed* result rather than the raw body. That parsed-copy step is where several attack classes die mechanically: `"role": "admin"` smuggled into a signup body never reaches `Model.create(req.body)` because it is not on the manifest (mass assignment); MongoDB's `{"$gt": ""}` login-bypass object dies because the schema demands a string and receives an object (type confusion — more in [how do you prevent NoSQL injection](how-do-you-prevent-nosql-injection.md)); unknown keys are stripped wholesale (prototype pollution payloads included). Validation sits after the body parser and before the handler, per-route, with one schema per endpoint — the full mechanics are in [how do you validate request body](how-do-you-validate-request-body.md).

**Auth hygiene — stops broken access control, credential theft, and privilege escalation.** This is not one technique but a bundle of practices, each closing a specific door. Store passwords with bcrypt or argon2, never reversible hashes — the reasoning is its own page in [how do you hash passwords](how-do-you-hash-passwords.md). Answer failed logins identically whether the account exists or the password is wrong — "invalid credentials," same words, same status — because differing replies let attackers harvest real emails. Keep tokens out of `localStorage` (any injected script can read it) and prefer `httpOnly`, `Secure`, `SameSite` cookies, which JavaScript cannot touch — the trade-offs live in [how do you use cookies in Express](how-do-you-use-cookies-in-express.md) and [how do you implement JWT authentication](how-do-you-implement-jwt-authentication.md). Keep access tokens short-lived with rotating refresh tokens, so a stolen badge dies fast ([how do you implement refresh tokens](how-do-you-implement-refresh-tokens.md)). And check authorization explicitly on every protected route against tables that fail closed — an unknown role is a denial, never an accident of a missing lookup (the pattern is in [how do you implement role-based authorization](how-do-you-implement-role-based-authorization.md)).

**Dependency risk — stops supply-chain compromise.** The uncomfortable truth: your cranes came from vendors. A vulnerability in a transitive dependency is already running inside your process with full privileges, and no header, validator, or firewall sees it, because you installed it. Hygiene here is unglamorous and effective: commit your lockfile and install with `npm ci` so builds are reproducible; wire `npm audit` or Dependabot into CI so known advisories fail the build; upgrade deliberately, with tests, because blind auto-upgrades swap a CVE for a regression; and delete packages you stopped using — the smallest attack surface is the code that does not exist.

Around those six, three pieces of connective tissue complete the picture. TLS is usually terminated at your reverse proxy, but the app still owns HSTS and `Secure` cookie flags so nothing downstream downgrades. Secrets come from environment variables, validated at startup so the app fails fast instead of silently running with a default password. And your final error middleware logs the full failure internally while handing clients a generic message — because stack traces are free reconnaissance (that contract is explained in [what is error handling middleware](what-is-error-handling-middleware.md)).

Put together, the pipeline order mirrors the port: response headers first, tight body limit, global rate limit, then parse, authenticate, validate, handle — with the error catcher registered last. Cheap and broad on the outside, expensive and specific on the inside, and every layer comfortable with the idea that the others might fail.

## 4. See It In Practice — Real Code or Queries

**The hardened app: pipeline order plus a login endpoint done properly.**

```js
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const app = express();

// Trust exactly one proxy hop, so req.ip is the real client address —
// zero hops means everyone shares the proxy's IP; `true` means anyone
// can spoof fresh rate-limit identities with a fake header.
app.set("trust proxy", 1);

// Response-side hardening first, so every response carries the headers.
app.use(helmet());

// Tight global body limit: oversized requests die before touching RAM.
app.use(express.json({ limit: "100kb" }));

// Broad global bucket: what any single client may ask of us per minute.
// (`limit` was called `max` in express-rate-limit v6 and earlier.)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Strict bucket for the one route attackers love: guessing passwords.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "Too many attempts. Try again later." },
});

// Login schemas stay loose on purpose: policy rules like minimum length
// belong at signup. Here we only enforce type and size, so hostile shapes
// (objects where strings belong, prototype-pollution keys) die at the door.
const credentialsSchema = z.object({
  email: z.string().max(254),
  password: z.string().max(128),
});

// Assumed to exist: your data-access layer using parameterized queries.
function findUserByEmail(email) {
  return db.users.findByEmail(email);
}

// Burn identical bcrypt work for missing users as for real ones, so
// response timing cannot reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer", 12);

app.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      // Uniform reply: no hints about which field failed or why.
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const { email, password } = parsed.data;
    const user = await findUserByEmail(email);
    const passwordOk = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, DUMMY_HASH);

    if (!user || !passwordOk) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Session issuance omitted — see the JWT and cookies pages.
    res.json({ ok: true });
  } catch (err) {
    // Express 4 does not catch rejected promises from handlers —
    // walk the failure to the error middleware yourself.
    next(err);
  }
});
```

Notice the layering in that one route: the limiter rejected floods before we spent a millisecond hashing; the schema guaranteed `password` was a string before it reached bcrypt; the uniform failure told an attacker nothing; and the `catch` guarantees even a database outage produces a proper 500 instead of a hung socket.

**Authorization tables must fail closed.**

```js
// Which path prefixes each role may reach. The table is the whole policy.
const ROLE_PREFIXES = {
  admin: ["/admin", "/reports"],
  editor: ["/posts"],
};

export function canReach(role, urlPath) {
  const allowed = ROLE_PREFIXES[role];
  // Fail closed: unknown roles, missing users, and typo'd keys are ALL
  // denials. A lookup that falls through to "allowed" is a breach waiting
  // for its first new role name.
  if (!Array.isArray(allowed)) return false;
  return allowed.some((p) => urlPath === p || urlPath.startsWith(p + "/"));
}
```

**The last station: an error handler that gives away nothing.**

```js
// Registered LAST, after every route. Four parameters is what makes
// Express treat this function as the error catcher rather than a
// workstation on the normal path.
app.use((err, req, res, next) => {
  console.error(err); // full detail goes to your logs, never the client
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? "Internal server error" : err.message,
  });
});
```

Clients get a fixed phrase for anything server-side; your logs get the stack trace, the query, the file paths — everything you need to debug and nothing an attacker can weaponize.

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you secure an Express application?**

This question is really testing one thing: whether you think in layers or look for a magic setting. The strong answer walks the checklist and names the attack behind each item. Body size limits stop memory-exhaustion denial of service. Helmet's headers stop clickjacking, MIME sniffing, downgrade attacks, and shrink XSS blast radius. Rate limiting stops brute force and flooding. Schema validation stops injection, mass assignment, and type-confusion bypasses. Auth hygiene — slow password hashing, uniform login failures, httpOnly cookies, short-lived tokens, fail-closed authorization — stops broken access control and credential theft. Dependency auditing stops supply-chain compromises that are already inside your process. Then land the senior point: no single layer is trusted to hold. Each layer is designed assuming the others fail, which is why fixing one incident in isolation never prevents the next one.

**Q: What security headers should you set, and what does each one stop?**

Start with helmet's defaults, then explain the big five individually. `X-Content-Type-Options: nosniff` stops browsers from guessing file types, which is what turns an uploaded file into executed script. `X-Frame-Options: DENY` plus CSP's `frame-ancestors` stops clickjacking — your UI rendered invisibly under an attacker's button. `Strict-Transport-Security` enforces HTTPS for future visits, closing downgrade attacks. `Content-Security-Policy` whitelists where scripts may load from, so an injection bug has far less room to cause damage. `Referrer-Policy` stops full URLs — sometimes carrying tokens — leaking to third parties via the Referer header. The nuance worth volunteering: CSP is simultaneously the most powerful and the most fiddly; teams either leave it disabled (losing most of the value) or copy a template that breaks their frontend. Start restrictive, watch the console, allow what the app genuinely loads.

**Q: Why do you need input validation if you already use an ORM?**

Because they defend different boundaries. An ORM parameterizes queries, which neutralizes SQL injection *at the storage layer* — but it will happily persist any shape you hand it. `Model.create(req.body)` with an attacker-controlled body is mass assignment: whatever extra keys the attacker sent become document fields. The ORM also cannot tell you that `quantity` arrived as `"banana"` or as `{"$gt": ""}` — driver-level type confusion is exactly what validation kills before the data reaches any query builder. Validation expresses what your business accepts at the boundary; the ORM guards how accepted data is stored. You want both, in that order.

**Q: Where should rate limiting live — in the app or at the proxy?**

Both, doing different jobs. The proxy or edge layer handles volumetric defense: it sheds floods and oversized bodies before they consume application memory or CPU, and it can react to patterns across all routes at once. The application layer enforces limits the proxy cannot know about, because they depend on business meaning — ten attempts per account on `/login`, three password resets per hour per email, stricter budgets on endpoints that trigger expensive queries. The app-level limiter also needs correct `trust proxy` configuration (or every client shares the proxy IP and you lock out the world) and a shared store like Redis when you run multiple instances, because per-process counters multiply your limits by replica count and evaporate on every deploy.

**Q: How do you handle secrets and environment variables?**

Secrets never live in source. Locally, a gitignored `.env` loaded via dotenv or Node's `--env-file`; in production, platform-provided env vars or a secret manager like AWS Secrets Manager or Vault, which add rotation and audit trails. Validate required secrets at startup and refuse to boot if one is missing — an app that starts with `JWT_SECRET=undefined` fails much worse later. The historical detail that shows depth: a secret that touched git even once is compromised permanently, because it lives in history forever. Deleting the file does nothing; rotating every exposed credential is the only remedy, and pre-commit secret scanning is how you avoid learning this firsthand.

**Q: How do you prevent information leakage in error responses?**

One central error-handling middleware, registered last with the four-parameter signature, owns every failure response. It logs the complete error internally — stack, query, context — and replies to the client with a generic message in production: "Internal server error," status 500. Expected, operational failures (a validation miss, a missing record) carry their safe, intentional messages with their proper 4xx status. The leak happens when `err.stack`, `err.message`, or driver errors reach the response: stack traces expose file layout and library versions, and raw database errors expose schema details — free reconnaissance for the next attack. Switch verbosity on `NODE_ENV` so development stays debuggable. The full mechanism is in [what is error handling middleware](what-is-error-handling-middleware.md).

**Q: How do you keep dependencies from becoming your breach point?**

Treat your supply chain as part of your attack surface, because it is: a vulnerable transitive package runs inside your process with full privileges, past every perimeter control you configured. Practically: commit the lockfile and install with `npm ci` so every build gets exactly the tree you tested; gate CI on `npm audit` and enable Dependabot so advisories surface as actionable pull requests; upgrade deliberately with tests rather than `npm audit fix --force`, which happily jumps majors and trades a CVE for a downtime incident; and prune dependencies you no longer use, since unused packages are pure risk with zero benefit. For the packages your security actually rests on — express, bcrypt, jsonwebtoken-class libraries — watching their release notes directly is reasonable diligence.

**Q: Should tokens live in localStorage or cookies?**

Cookies, configured properly — this is auth hygiene, not preference. Anything in `localStorage` is readable by every script on the page, so a single XSS hole anywhere converts directly into session theft. An `httpOnly` cookie is invisible to JavaScript entirely; `Secure` keeps it off plaintext connections; `SameSite` blunts cross-site sending, which addresses the classic cookie weakness, CSRF. Cookies' cost is CSRF exposure and bandwidth on every request; localStorage's cost is total theft on first injection. Since XSS is the more common and more damaging failure, the cookie wins in most designs — the detailed trade-offs are in [how do you use cookies in Express](how-do-you-use-cookies-in-express.md) and [how do you implement JWT authentication](how-do-you-implement-jwt-authentication.md).

**Q: Is HTTPS an Express concern?**

Mostly no, partly yes — and saying precisely which part is the senior answer. TLS termination usually happens at your reverse proxy or load balancer, so Express never sees certificates. What remains the app's job: send HSTS so browsers refuse to downgrade future visits; mark cookies `Secure` so they never ride plaintext; configure `trust proxy` so `req.protocol` and rate-limit identities reflect reality behind the proxy; and never assume "we have HTTPS" covers anything beyond transport — encryption in transit does nothing against injection, bad dependencies, or leaked secrets.

## 6. The Traps — What Goes Wrong in Production

**Raising the body limit globally to fix one route.** Someone hits a payload limit on an avatar upload, googles, and writes `express.json({ limit: "50mb" })` at the top of the app. Every endpoint now buffers 50mb per request, and your memory-exhaustion door swings wide again — the original incident, restored. Fix: keep the global default tight and mount a wider parser only on routes that need it:

```js
// Global default stays tight:
app.use(express.json({ limit: "100kb" }));

// Only this route pays for a bigger ceiling. (True multipart uploads go
// through Multer, which enforces its own per-file and per-request limits.)
app.post(
  "/uploads/avatar",
  express.raw({ type: "image/*", limit: "5mb" }),
  handleAvatarUpload
);
```

**Misconfigured `trust proxy`, in either direction.** Set to zero behind a proxy, every request appears to come from the proxy's IP — one shared rate-limit bucket, so a single abuser gets everyone blocked. Set to blindly trust the `X-Forwarded-For` header, clients forge a new identity per request and your limiter watches a parade of fake IPs. The correct setting names how many trusted hops sit in front of the app — usually one. express-rate-limit detects obvious mistakes and warns loudly in the logs; treat those warnings as fires, not noise.

**Per-process rate-limit counters in a multi-instance deployment.** The default memory store counts per process. Four replicas behind a round-robin balancer means your "100 requests per minute" is really 400, and every rolling deploy resets the counters mid-window — attackers love deploy minutes. Anything running more than one instance, or restarting often, needs a shared store such as Redis.

**Treating "helmet installed" as security finished.** Helmet sets headers; it does not make an app secure, and two failure modes hide inside it. Teams leave CSP at the most permissive setting and lose most of the protection. Or they copy a strict CSP template that silently breaks their production frontend — analytics dead, styles unloaded — and the only signal is a browser console nobody opens. Headers are one layer; roll out CSP gradually and monitor violations.

**`Model.create(req.body)` with an unvalidated body.** The handler looks innocent, but the client decides which fields exist, so `"role": "admin"` or `"isVerified": true` sails straight into the database — mass assignment. The schema's parsed output (`parsed.data`) is the only object that should ever reach model constructors, because unknown keys were stripped at the door.

**Distinguishable login failures.** "User not found" versus "wrong password," different status codes, or response times that differ because bcrypt only ran for existing users — each one tells attackers which emails are registered. The fixes all appeared in the login example: one generic message, one status, and a dummy hash comparison so missing accounts cost the same CPU time as real ones.

**Validating login like signup.** Requiring minimum password length at login feels consistent, but signup-time policy has no business gating sign-in — it leaks your rules and locks out legacy accounts whose passwords predate them. Login schemas should enforce only type and size (which is what stops `$gt`-style objects); policy enforcement lives where passwords are created.

**Blind dependency surgery.** `npm audit fix --force` jumping a major version has taken down plenty of Friday deploys — the vulnerability becomes an outage instead. Conversely, dismissing every "low severity" advisory ignores that attackers chain small flaws into big ones. The middle path: automated advisories, reviewed upgrades, tests on every bump, and deletion of packages you stopped using.

**Unwrapped `await` under Express 4.** Express 4 does not catch rejected promises returned from handlers. A database hiccup becomes an unhandled rejection, the request hangs until timeout, and your error middleware — beautifully written — never runs:

```js
// Express 4: this rejection belongs to nobody. Request hangs, no 500.
app.get("/orders/:id", async (req, res) => {
  const order = await Orders.find(req.params.id); // boom lands nowhere
  res.json(order);
});

// Fixed: the wrapper forwards every rejection to the error middleware.
app.get("/orders/:id", asyncWrap(async (req, res) => {
  const order = await Orders.find(req.params.id);
  res.json(order);
}));

function asyncWrap(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}
```

Express 5 forwards rejected promises to the error middleware natively — but only rely on that when your runtime is genuinely Express 5. Until then, wrap or try/catch, every handler that awaits.

## 7. Compare With Related Concepts

**Rate limiting versus input validation.** Different axes entirely: volume versus content. A request can be perfectly formed and still malicious at scale (credential stuffing), or a single request can be malformed and harmless in volume (one bad batch job). Limiting answers 429 when you ask too often; validation answers 400 when you ask wrongly. An API needs both, because neither implies the other.

**Helmet versus CORS.** Both involve headers, and people blur them constantly. Helmet sets response headers that instruct *browsers* to protect *your users* — framing, sniffing, downgrade. CORS is your server's policy about which origins may call you, enforced by the browser on behalf of your server. Two consequences follow: CORS protects nobody talking to you through curl or Postman, so it is not access control for your API — authentication is. And CORS misconfiguration ("allow all origins, allow credentials") is itself a vulnerability, not a convenience. The dedicated treatment is in [how do you handle CORS](how-do-you-handle-cors.md).

**Application-level defenses versus WAF or proxy rules.** A web application firewall sees HTTP shapes: known-bad patterns, floods, oversized bodies — generic signals, cheap to apply at the edge, useless for business logic. Your app knows what no proxy ever can: this account already requested three password resets, this coupon was redeemed twice, this role may not touch this route. Edge controls shed the volume; app controls judge the meaning. Removing either leaves a gap the other cannot fill.

**Authentication versus authorization.** Authentication establishes who the caller is; authorization decides what that caller may do. Most real breaches of "auth" are actually authorization failures — valid identity, unchecked permission — which is why per-route checks backed by fail-closed tables matter more than fancier login flows. The boundary is drawn fully in [how do you implement role-based authorization](how-do-you-implement-role-based-authorization.md).

**Validation versus sanitization.** Validation rejects — pass/fail against a schema, with reasons. Sanitization transforms — accepting input but scrubbing dangerous content, like escaping HTML in a user bio that is legitimately allowed to contain angle brackets. They compose: validate that the bio is a string under 500 characters, then sanitize its HTML before rendering. Reject what should not exist; clean what may exist.

## 8. 🧠 The Memory Hook

Secure an Express app the way a container port takes a ship: cap what can dock, light the fence, count the trucks, open every box regardless of whose paperwork it carries, badge every zone, and remember the cranes came from vendors — because each layer was designed assuming the one before it already failed. In Express those six checkpoints are just your middleware order: body limit, helmet, rate limiter, schema, auth, dependency audit.
