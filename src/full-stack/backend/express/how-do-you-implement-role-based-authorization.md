# How do you implement role-based authorization in Express?

## 1. The Real-World Problem — When You Actually Hit This

Your app has been live for months. Login works, tokens work, everyone's happy. Then a support ticket lands: customer A is seeing customer B's invoices. You dig into the logs while security pulls the access history, and things get worse — some regular `'user'`-role account has been calling `DELETE /api/users/:id`. Successfully. With a 200 response. Your admin endpoint just let an ordinary user delete accounts.

You open the route file and find the problem immediately:

```js
app.delete('/users/:id', authenticate, deleteUser);
```

There's authentication — the server knew exactly who was calling. There was just nothing checking whether that person was *allowed*. The React admin panel hid the delete button from normal users, so everyone assumed the endpoint was safe. But the button being invisible in a browser means nothing to anyone with `curl` and a valid token.

This is the moment you learn the lesson the hard way: authentication and authorization are two different locks, and having only one of them protects you against exactly half the threat. Authentication proves who is knocking. Authorization decides whether that particular person may open this particular door. Role-based authorization is how most Express apps build the second lock.

## 2. The Analogy — Make the Mechanic Obvious

Think about how access works on a film studio backlot.

When you arrive for your first day, you report to the production office. A clerk checks your ID against the crew list, confirms you're really you, and hands you a laminated lanyard. Printed on it, in big letters, is your access level: `SET`, `OFFICE`, or `ALL`. From this moment on, nobody anywhere on the lot asks for your ID again — they trust the lanyard, because the production office issued it.

Every interior door has a guard, and beside each door hangs a taped-up list of which lanyard levels may pass. The guard doesn't phone HR, doesn't re-interview you, doesn't inspect your face. They glance at the laminate, compare it to their list, and either wave you through or stop you. Two completely different failures exist here:

- You show up with **no lanyard at all** — you never even made it past the production office. That's not a permission problem. Nobody knows who you are. Turned away at the source.
- You have a valid `OFFICE` lanyard and try to walk onto the sound stage. The guard knows exactly who you are — and the answer is still no, because `OFFICE` isn't on the stage's list. Different refusal, different reason.

Two more details make the analogy complete. First, guards **refuse by default**: if your level isn't written on the tape, you're out — nobody squints and says "well, `SET` is sort of like `STAGE`, come on in." Second, some doors need more than a lanyard. Stage 3 today is shooting a closed set: even with a `SET` pass, if your name isn't on today's call sheet for Stage 3, you stay outside. The lanyard gets you into the *category* of places; the call sheet decides the *specific* place.

Now map every piece:

| On the film lot | In Express |
|---|---|
| Production office checking ID and issuing the lanyard | `authenticate` middleware verifying the JWT |
| Access level printed on the lanyard | `req.user.role` attached to the request |
| Door guard with a taped-up list | `authorize(...roles)` middleware |
| Guard refusing when the level isn't on the list | Deny-by-default allow-list check returning 403 |
| No lanyard at all | 401 — identity never established |
| Wrong level on a valid lanyard | 403 — identity known, permission denied |
| Today's call sheet for a specific stage | Ownership check against the specific resource |

Keep this picture. Everything below is just giving names to things you now already understand.

## 3. The Full Explanation — How It Actually Works

In plain words: role-based authorization means each route carries its own short list of acceptable roles, and a small piece of middleware refuses anyone whose role isn't on that list. The check runs **after** authentication, because it reads the identity that authentication produced. You cannot check someone's lanyard before the production office has issued one.

**The chain, physically.** Here's the part people underestimate: middleware order in Express isn't a concept, it's a sequence of actual function calls. When you write:

```js
app.delete('/users/:id', authenticate, authorize('admin'), deleteUser);
```

Express builds an internal queue of those three functions plus the handler. An incoming request walks them strictly left to right. Each one receives `(req, res, next)` and either calls `next()` to push the request to the following function, or ends the request itself with a response. So `authenticate` runs fully first — it verifies the token and attaches `req.user` — and only then does `authorize` execute, at which point `req.user` actually exists. Swap the two and `authorize` reads `req.user.role` on a request where `req.user` is still `undefined`. Nothing mystical warns you; you get a crash (TypeError reading `.role` of undefined) or, if you "fixed" the crash with optional chaining, a route that denies literally everyone including real admins.

**Why the factory shape.** You'll see authorization written as a function that returns a function:

```js
function authorize(...allowedRoles) {
  return (req, res, next) => { /* ... */ };
}
```

The reason is that each route needs a *different* list, but middleware must have the exact `(req, res, next)` signature. The outer call — `authorize('admin')` — captures the list in a closure and returns an inner function with the right signature. Each route's `authorize(...)` call freezes its own private copy of the list. `authorize('editor')` and `authorize('admin')` are two different middleware functions sharing one body. Without the factory, you'd be stuck writing one bespoke middleware per route or passing config through `res.locals` hacks.

**Deny-by-default: the one non-negotiable design rule.** Look closely at the comparison direction in the check:

```js
if (!allowedRoles.includes(req.user.role)) {
  return res.status(403).json({ error: 'Insufficient permissions' });
}
```

This is an **allow-list**: "refuse unless the role is named here." Its mirror image — `if (req.user.role === 'viewer') return res.status(403)...` — is a **block-list**, and block-lists are how real breaches happen. The day a teammate adds a new `"support"` role with broader powers, the allow-list keeps it locked out until someone deliberately grants access; the block-list silently waves it through, because nobody thought to add it to the ban pile. Allow-lists fail closed. Block-lists fail open. Security code should always fail closed: any surprise — a missing role field, a renamed role, a malformed token payload — lands on the "denied" side, never the "allowed" side. Notice that `undefined.includes` aside, `!['admin'].includes(undefined)` evaluates to `true`, so a request that somehow reached `authorize` without a usable role gets refused, not admitted.

**Where the role comes from — and the freshness trade-off.** The role value usually starts life inside the signed JWT. That choice has a real cost profile: zero extra queries per request (the role rides along in the token), which is why it's the default — but the token is a snapshot. Issue an admin a 7-day token, then fire them Monday morning, and for up to seven days their lanyard still says `ALL`. The standard mitigations, in increasing strictness: keep token lifetimes short and lean on [refresh tokens](./how-do-you-implement-refresh-tokens.md) so roles re-enter every token within minutes; re-read the role from the database (or a short-lived cache) for sensitive operations like payments or deletions; or maintain a token-version/denylist checked per request, which buys instant revocation at the price of a lookup on every call. Pick per sensitivity — a blog's `editor` role can tolerate staleness that a payment API cannot.

**Beyond roles: the call-sheet check (ownership).** A role check is coarse. `authorize('user')` says "any logged-in user may hit `GET /orders/:id`" — including other people's orders. That bug class is so common it tops OWASP's list as Broken Access Control, and in penetration reports it's called IDOR (Insecure Direct Object Reference): the identifier in the URL is the only thing selecting whose data comes back. The fix is an object-level check: fetch the resource, compare its owner to `req.user.id`, and refuse strangers. Do the fetch inside the authorization middleware and attach the document to `req` — the handler then gets a pre-vetted object without paying for a second query. Role gets you past the stage door; ownership is the call sheet for the specific stage.

**Hierarchies, briefly.** Real apps accumulate roles where some should inherit others (`admin` can do everything `editor` can). Map each role to a number and compare levels — and guard *both* lookups, because they fail in opposite directions. An unknown **user** role should score below every real role so a renamed or tampered value is denied; an unknown **required** role (a typo like `'editer'`) has to throw at startup, because an unresolved minimum quietly turns every comparison false and opens the gate to everyone. One table, defined once, imported everywhere — never scatter `role === 'admin' || role === 'editor'` strings across route files, because that's how the "who can actually delete users?" audit becomes archaeology.

**401 vs 403 — the two refusals get different numbers.** The status codes exist precisely because the film-lot failures are different situations. **401 Unauthorized** confusingly means *unauthenticated*: no credential presented, or the credential failed verification. The server never learned who you are. (The name is a historical wart — think "401 Unauthenticated." Technically the response should include a `WWW-Authenticate` header telling the client what credential scheme to retry with.) **403 Forbidden** means *authenticated, not permitted*: identity established and confirmed, request still refused. The distinction isn't academic — clients branch on it. A 401 tells a frontend "try to refresh the token or bounce to login"; a 403 tells it "you're logged in fine, render a 'no access' screen." Return the wrong one and you send logged-in users into infinite login loops, or you teach token-refresh logic to fire on what is actually a permissions bug. Some APIs deliberately go further and return 404 instead of 403 for resources the caller doesn't own — a 403 confirms the resource exists, and confirming existence is sometimes information you'd rather not leak. That's a product decision, not an accident; make it consciously.

Two surrounding concerns round out the picture. Enforcement is **server-side only**: anything the frontend does — hiding buttons, gating routes — is UX polish, not security, and the API must assume every endpoint will be called directly. And denials are **signals**: log 403s with the user id, route, and attempted action, because a spike in denials is either a probing attacker or a frontend shipping with the wrong role assumptions — either way you want to know the same day, not at the next audit.

## 4. See It In Practice — Real Code or Queries

A complete, minimal setup: authentication first, the `authorize` factory second, both applied per route.

```js
const express = require('express');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

// ---- Stage 1: authentication — establishes WHO is calling -------------
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    // No credential at all: identity never established -> 401.
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Verifies signature AND expiry in one step. The decoded payload
    // becomes req.user — the laminated lanyard every later check trusts.
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next(); // identity proven; continue down the chain
  } catch {
    // A credential was shown but didn't verify -> still 401,
    // because "invalid proof of identity" is an authentication failure.
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---- Stage 2: authorization — decides WHAT that identity may do -------
// Factory: authorize('admin') captures its role list in a closure and
// returns a fresh (req, res, next) middleware unique to that route.
function authorize(...allowedRoles) {
  return (req, res, next) => {
    // Allow-list, not block-list: any role NOT named here — including
    // roles invented next quarter, or undefined — is refused. Fail closed.
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Order is physical, left to right: prove identity, then check permission.
app.delete(
  '/users/:id',
  authenticate,        // sets req.user, or stops here with 401
  authorize('admin'),  // reads req.user.role, or stops here with 403
  async (req, res, next) => {
    try {
      await User.findByIdAndDelete(req.params.id);
      res.json({ deleted: true });
    } catch (err) {
      next(err); // async failures travel to error-handling middleware
    }
  }
);

app.get('/admin/stats', authenticate, authorize('admin'), (req, res) => {
  res.json({ totalUsers: 12000 });
});

app.get('/profile', authenticate, (req, res) => {
  // Authenticated-only route: no authorize() — any valid identity passes.
  res.json(req.user);
});
```

Same pattern, hierarchy edition — one table replaces per-route role lists, and higher roles inherit lower ones automatically:

```js
const ROLE_LEVELS = { viewer: 1, editor: 2, admin: 3 };

function requireRole(minimumRole) {
  // Resolve the REQUIRED level once, at route-registration time.
  // A misspelled role ('editer') looks up as undefined here — and
  // `userLevel < undefined` is ALWAYS false, which would silently wave
  // every caller through. A config typo must crash at boot, not fail open.
  const requiredLevel = ROLE_LEVELS[minimumRole];
  if (requiredLevel === undefined) {
    throw new Error(`Unknown role '${minimumRole}' passed to requireRole()`);
  }

  return (req, res, next) => {
    // Unknown or missing USER role scores 0 — below every real role — so
    // a renamed role or tampered payload can never sneak upward.
    const userLevel = ROLE_LEVELS[req.user.role] ?? 0;

    if (userLevel < requiredLevel) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Editors AND admins pass; viewers get 403.
app.put('/articles/:id', authenticate, requireRole('editor'), updateArticle);
```

The call-sheet check — object-level authorization that combines with roles, fetches once, and hands the vetted document downstream:

```js
async function requireOrderAccess(req, res, next) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      // Missing resource is a 404, not a permission failure.
      return res.status(404).json({ error: 'Order not found' });
    }

    const isOwner = order.userId.toString() === req.user.id;
    // Admins may reach any row; everyone else must OWN this exact row.
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your order' });
    }

    req.order = order; // attach the fetched doc — handler skips a re-query
    next();
  } catch (err) {
    next(err);
  }
}

app.get('/orders/:id', authenticate, requireOrderAccess, (req, res) => {
  res.json(req.order); // already fetched, ownership already verified
});
```

And the test that pins the whole contract down — three requests, three status codes, one rule:

```js
const request = require('supertest');
const jwt = require('jsonwebtoken');

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });

test('DELETE /users/:id enforces authentication then role', async () => {
  // No token -> never authenticated -> 401.
  await request(app).delete('/users/u1').expect(401);

  // Valid token, wrong role -> authenticated, not permitted -> 403.
  const viewer = signToken({ id: 'u9', role: 'viewer' });
  await request(app)
    .delete('/users/u1')
    .set('Authorization', `Bearer ${viewer}`)
    .expect(403);

  // Valid token, right role -> both locks open -> 200.
  const admin = signToken({ id: 'u2', role: 'admin' });
  await request(app)
    .delete('/users/u1')
    .set('Authorization', `Bearer ${admin}`)
    .expect(200);
});
```

Authorization bugs almost always hide in the *denial* paths — the happy path works even when the guard is asleep. These three assertions are the minimum honest test for any protected route.

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you implement role-based authorization in Express?**

As a middleware factory that runs after your authentication middleware. The factory takes the route's allowed roles — `authorize('admin')` — and closes over them, returning a standard `(req, res, next)` middleware that compares `req.user.role` against that list. Match means `next()`; miss means a 403 with a JSON error. You mount it per route, always after `authenticate`: `app.delete('/users/:id', authenticate, authorize('admin'), handler)`. The two properties that make this production-grade rather than tutorial-grade are that it's an allow-list (anything unnamed is denied, so it fails closed) and that it lives in the route declaration, so one glance at the routes file shows the entire permission surface of the API.

**Q: Why must the authorization middleware run after authentication?**

Because authorization consumes the output of authentication. The role check reads `req.user.role`, and `req.user` only exists after the token has been verified and attached. Middleware executes strictly in registration order, so placing `authorize` first means it inspects a request where identity hasn't been established yet. Depending on how defensively you wrote the check, that either crashes with a TypeError (500 for everyone) or — worse, with optional chaining — politely denies every caller including legitimate admins. The order encodes the logical dependency: you can't decide what someone may do before you know who they are.

**Q: What's the difference between 401 and 403?**

401 means "I don't know who you are" — no token, malformed token, expired signature, wrong secret. Identity was never established, so the client should obtain or refresh a credential. 403 means "I know exactly who you are, and the answer is no" — authentication succeeded, the permission check failed, and refreshing the token a hundred times won't change the answer. Clients branch on this distinction: 401 triggers the re-auth flow, 403 renders a "no access" state. Mixing them up produces real symptoms — returning 401 for permission failures sends logged-in users into login redirects they can never escape, and returning 403 for bad tokens breaks refresh-token logic. Small footnote worth mentioning: despite the name, 401 really means *unauthenticated*, and a spec-strict response includes a `WWW-Authenticate` header.

**Q: Should roles live in the JWT payload or be looked up from the database per request?**

It's a freshness-versus-cost trade-off, and the right answer depends on how much staleness the operation tolerates. In the JWT: zero extra queries, the role travels with every request, but it's frozen at issue time — revoke someone's admin and they keep admin powers until the token expires. In the database: always current, instant revocation, at the price of a query (or cache hit) on every request. Most systems take the middle path: short-lived access tokens plus refresh tokens, so a role change propagates within minutes; sensitive endpoints (payments, deletions, role management itself) additionally re-verify from the database. If the business requires immediate revocation, add a token version or denylist check — that's a per-request lookup again, just a targeted one.

**Q: What's the difference between RBAC and ABAC?**

RBAC assigns permissions through fixed roles — `admin`, `editor`, `viewer` — and asks one question: is your role on this route's list? ABAC evaluates attributes: user attributes (department, clearance), resource attributes (owner, sensitivity), environment attributes (time, network). RBAC says "editors edit articles"; ABAC says "users edit articles they own, during business hours, from the office VPN." RBAC is simple to reason about, cheap to enforce, and auditable — you can print every rule on one page. ABAC is far more expressive but the policy surface becomes its own program with its own bugs. Practical guidance: start with RBAC, and reach for ABAC only when real requirements demand context — which in most products turns out to mean sprinkling a few attribute checks (ownership, tenant id) onto an RBAC backbone rather than building a full attribute engine.

**Q: How do you handle resource-level authorization — like letting users edit only their own posts?**

With an ownership check layered on top of the role check, because they answer different questions. The role check is category-level: is this kind of caller allowed to touch this kind of route at all? Ownership is instance-level: is this specific row theirs? Concretely: a middleware (or service function) loads the resource by the id in the URL, compares its `userId` with `req.user.id`, and returns 403 on mismatch — admins excepted if the product says so. Load it once and attach it to `req`, so the handler uses the already-vetted document instead of querying again. Skip this layer and you've built the classic IDOR vulnerability: the role gate opens the stage door, and the URL's `:id` alone decides whose data walks out.

**Q: How do you model role hierarchies so editors also get viewer abilities?**

Give every role a numeric level and compare against a required minimum instead of listing roles exhaustively: `viewer: 1, editor: 2, admin: 3`, and `requireRole('editor')` admits anyone scoring ≥ 2. Higher roles inherit lower permissions for free, and adding a role is one table entry rather than edits across dozens of routes. Three details matter: define the table once in a shared module — scattered inline comparisons are how hierarchies drift out of sync between routes; treat an unknown *user* role as level 0, so a renamed or unexpected role fails closed instead of accidentally outranking everyone; and resolve the required level once at route registration, throwing if it isn't in the table — otherwise one typo like `requireRole('editer')` compares against `undefined`, which no number is ever less than, and the gate fails open for everybody.

**Q: What does deny-by-default mean, and why does it matter?**

It means the system refuses unless access was *explicitly* granted — the check is "is your role on the allowed list," not "is your role on the banned list." The practical difference appears the day something new shows up. Add a `"support"` role next quarter: under an allow-list it's locked out until someone deliberately grants entry; under a block-list it sails straight through because nobody remembered to forbid it. Deny-by-default makes surprises fail toward safety — a missing role property, a case-sensitive typo, a renamed role, a skipped auth stage all land on "denied." The opposite orientation fails toward breach. When reviewing authorization code, this is the first thing I look at: which way does the unexpected case fall?

**Q: Is hiding the admin button in the React app enough protection?**

No, and treating it as protection is how the opening-story breach happens. The UI is a convenience for honest users; the API is the actual border. Anyone can open dev tools, read the endpoint from the network tab, and call it directly with curl — the hidden button guards nothing. Client-side gating is UX (don't show people menus that will only frustrate them); server-side middleware is security. The correct mental split: hide the button for a clean experience, and independently enforce `authorize()` on every endpoint, assuming the frontend doesn't exist.

**Q: How do you test authorization middleware?**

Three scenarios per protected route, matching the three distinct outcomes: no token expects 401, a valid token with a disallowed role expects 403, a valid token with an allowed role expects 200. Sign real test tokens with the test secret and drive the whole stack with supertest so the test covers the actual mounting order, not a unit-tested middleware in isolation. For ownership rules, seed resources belonging to different users and assert that user B's request for user A's resource gets 403 while user A's gets 200. And weight your effort toward the denial paths deliberately — a broken happy path announces itself instantly, whereas a broken denial sits silently until someone finds it in production with a scanner.

## 6. The Traps — What Goes Wrong in Production

**Mounting `authorize` before `authenticate`.** The role check runs against a request where `req.user` is still undefined. Written naively, `req.user.role` throws a TypeError and every caller gets a 500. The tempting fix — `req.user?.role` — converts it into a quieter disaster: the route now denies absolutely everyone, including real admins, and the bug report says "admin panel broken" instead of "order is wrong." Both symptoms trace to the same root: the chain encodes a dependency (permission depends on identity) and the registration order violated it. Fix the order, and have the test suite exercise each protected route end-to-end so a swap gets caught at CI time.

**Writing a block-list instead of an allow-list.** `if (req.user.role === 'viewer') return res.status(403)` reads naturally and fails catastrophically. It enumerates who *can't* come in, so every future role defaults to *can*, and every existing role you forget to list does too — add `"trial_user"` with broad powers next sprint and it walks through every "protected" route nobody thought to bar it from. The allow-list inversion — `if (!allowedRoles.includes(role))` — flips the default so everything not explicitly granted is refused. When auditing authorization code, read the condition aloud: is this naming who gets in, or who gets kept out?

**Trusting the frontend as the gate.** Hidden buttons, guarded client routes, disabled form fields — none of it exists from the API's perspective. The classic incident: QA hides the admin panel behind a client-side role check, the release notes say "admin features secured," and the actual `GET /api/admin/stats` endpoint answers 200 for any logged-in account. Client-side checks shape the experience; server-side middleware enforces the boundary. Every endpoint needs its own `authorize()`, regardless of what the UI chooses to render.

**Swapping the two status codes.** Return 401 for a permission failure and the frontend's HTTP interceptor dutifully tries to refresh the token, fails identically, redirects to login, the user logs in successfully, hits the same wall, and loops forever. Return 403 for a bad token and the client concludes "logged in, just not allowed," never attempts refresh, and sessions die mysteriously at expiry. The rule that prevents both: 401 whenever identity wasn't established (missing, invalid, expired credential); 403 whenever identity was established but the permission check said no.

**Long-lived tokens carrying stale roles.** A 30-day JWT is a month-old photograph of someone's permissions. Demote an admin or terminate an employee and their token keeps asserting the old role until it expires — revocation happened in your database, but the lanyard in their pocket still says `ALL`. Shorten access-token lifetimes and move renewal to refresh tokens so roles re-stamp frequently; for high-sensitivity operations, re-read the current role from the database at action time; for hard immediate-revocation requirements, version or denylist tokens and check it per request.

**Checking the role but not the ownership.** `app.get('/orders/:id', authenticate, authorize('user'), ...)` passes both gates for every logged-in user — and then hands back whichever order the URL names. Coarse permission passed, specific data leaked; that gap is IDOR, and automated scanners hunt for exactly this shape by iterating ids. Any route addressing a specific resource needs the object-level check too: load the row, verify the owner matches the caller, refuse strangers.

**Case and spelling drift in role strings.** `'Admin' !== 'admin'`, and nothing in JavaScript warns you. Under an allow-list the symptom is maddening-but-safe: a legitimately promoted admin keeps getting 403 because their token says `Admin` while the route expects `admin`. The dangerous cousin is normalizing carelessly — lowercasing incoming values while the allow-list holds mixed-case entries, producing accidental matches. Define role constants in one module (`ROLES.ADMIN = 'admin'`) and reference constants everywhere; free-text role comparisons scattered across files are how both failure directions eventually happen.

**Guarding only one side of a table lookup.** The hierarchy middleware checked the *user's* role against the table with `?? 0` and called itself fail-closed — while the *required* role went in raw. `requireRole('editer')`, one keystroke from `editor`, looks up as `undefined`; `5 < undefined` (or any level versus `undefined`) is always false, so every single caller passed, admins and viewers alike, with no error anywhere. The asymmetry is the lesson: an unknown value on the **subject** side of a comparison should fall toward denial (score it lowest), but an unknown value on the **rule** side means your policy itself failed to load — that must throw at startup, when the route file registers, not fail open on every request. Any time security code indexes a config table by a hand-typed string, ask which direction the miss actually falls.

## 7. Compare With Related Concepts

**Authentication vs authorization.** Authentication answers "who are you?" — verifying the token and producing `req.user`. Authorization answers "what may you do?" — consuming `req.user` and comparing against policy. They're separate middleware, separate failure codes (401 vs 403), and separate tests. Rule: every protected request needs authentication; only routes with differentiated access need role authorization on top.

**Authorization middleware vs error-handling middleware.** Both sit in the same chain, but they're different species: authorization is ordinary middleware `(req, res, next)` that proactively refuses requests, while error-handling middleware takes four arguments `(err, req, res, next)` and only runs when something upstream called `next(err)` — Express identifies it purely by arity. A 403 from `authorize` is a *decision*, not an error; don't route permission denials through the error handler. The full mechanics of the four-argument contract live in [what-is-error-handling-middleware.md](./what-is-error-handling-middleware.md).

**RBAC vs ABAC.** RBAC keys off fixed roles assigned to users; ABAC evaluates attributes of the user, resource, and environment. Rule: RBAC by default; add attribute conditions (ownership, tenant, time) where the business genuinely demands context, rather than adopting a full attribute-policy engine.

**Roles vs permissions.** A role is a named bundle ("editor"); a permission is an atomic capability ("article.publish"). Role checks are simpler and sufficient for small apps; mapping roles to permission sets scales better once different roles start sharing partial abilities — change the bundle once instead of every route. Rule: under roughly five roles with stable meaning, plain role lists are fine; beyond that, check permissions derived from roles.

**Route-level vs object-level authorization.** Route-level (`authorize('admin')`) decides whether this category of caller may touch this endpoint at all; object-level (the ownership check) decides whether this caller may touch *this specific record*. Rule: every protected route needs the first; any route whose URL names a specific resource needs the second.

**401 vs 403.** 401: identity never proven — fix it by obtaining a credential. 403: identity proven, permission absent — no credential will help. Rule: the client can potentially recover from a 401 by re-authenticating; a 403 is final until someone's permissions change.

## 8. 🧠 The Memory Hook

Authentication is the production office printing your lanyard; every protected route is a doorway guard who reads the laminate against the taped-up list — **no lanyard, you never got in (401); lanyard not on the list, you don't pass this door (403)** — and the guard always refuses anyone the list doesn't name, because a door that admits strangers-by-default isn't guarding anything.
