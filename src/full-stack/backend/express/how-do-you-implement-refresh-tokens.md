# How do you implement refresh tokens

## 1. The Real-World Problem — When You Actually Hit This

Your team ships JWT authentication. Login signs a token that lives for seven days, the SPA tucks it in localStorage, and everything works. Three months later a user installs a shady browser extension. The extension finds one XSS hole, reads localStorage, and walks away with that user's week-long JWT. The user notices weird activity and changes their password. Nothing changes — the token doesn't care about the password. Your PM storms over and asks, "Can we log that attacker out right now?" And the honest answer is no. A JWT is self-validating: any server can check the signature offline, so no server can un-sign it. You watch the attacker browse the account until the clock runs out.

So you do the obvious fix: shorten the token to five minutes. Now the attack window is tiny — and every user gets logged out mid-task, every five minutes, all day. Support tickets explode. Security wants short-lived tokens; humans want to stay logged in. Those two demands look impossible to satisfy together.

Refresh tokens are the thing that makes both possible, and interviewers love this topic because explaining it well proves you understand *why* statelessness has a cost. The job breaks into five concrete decisions: how long each token lives, where each one is stored, how one gets exchanged for the other, how you rotate the exchange ticket so a stolen copy dies fast, and how you revoke everything when something smells wrong.

## 2. The Analogy — Make the Mechanic Obvious

Think of how a prescription works at a pharmacy.

You visit the doctor once. She examines you, writes a prescription, and the pharmacy hands you your first bottle of medicine. That bottle sits in your cabinet at home, and you take your doses every day without calling anybody. Nobody checks anything when you open it. That bottle is the **access token**: self-contained, checked nowhere, usable immediately, and finite — it runs out.

But the bottle isn't the whole deal. Behind the pharmacy counter there's a record: "this patient has 5 refills left on prescription #4821." That record is the **refresh token**. It's useless if you wave it at the shelf — you can't swallow a database entry. Its entire power is at one place: the counter. That counter is the `/auth/refresh` endpoint — the single endpoint that consults the central record.

Watch how the security model falls out of this:

- **Bottles already handed out can't be recalled.** If someone steals a bottle from your cabinet, they get whatever doses were in it. The pharmacy can't phone your medicine back. That's exactly why the bottle should be small — a short supply, not a year's worth. Short-lived access tokens bound the damage of theft.
- **Refills can be cancelled instantly.** One call from the doctor and the counter refuses every future refill, even though bottles already sold keep working until they run out. That's the revocation asymmetry: you can't revoke what's been issued, but you can revoke what would be issued *next*.
- **Each refill gives you a new slip, and the old slip becomes void.** The counter updates the record every time: "refill 3 done on Tuesday, current slip is #S-9." If somebody walks in on Wednesday trying to use slip #S-8 — the one that was already consumed — the pharmacist doesn't just refuse. An already-spent slip coming back means a copy is floating around, so the pharmacist freezes *every* refill on your file until you show up in person. That's **rotation with reuse detection**, and it's the heart of this whole page.
- **Where do you keep your slip number?** Pinning it to the outside of the medicine cabinet means every visitor, babysitter, and cleaner who walks past can read it — that's storing it in localStorage, readable by any script in the page. Better: the pharmacy holds the slip itself, verifies your identity when you appear, and pulls your own record for you. You never carry the sensitive thing around — that's an httpOnly cookie the browser holds on your behalf.
- **Prescriptions expire completely after twelve months**, no matter how many refills were unused. At that point you must see the doctor again. That's the absolute session cap — without it, a constantly-active user could slide forward forever and never re-authenticate.

Keep this picture. Every technical decision below is just this pharmacy wearing a hoodie.

## 3. The Full Explanation — How It Actually Works

**Two tokens, two jobs.** On login the server issues a pair. The access token is a JWT signed with your secret, living 5–15 minutes, sent on every API call in the `Authorization` header. The refresh token is a long random string (not a JWT — more on why later), living 7–30 days, sent only to one endpoint. They are deliberately asymmetric: the access token optimizes for cheap checking, the refresh token optimizes for control.

**What login actually stores.** Here's the detail most answers miss: you never store the raw refresh token in your database. You generate 32+ random bytes with `crypto.randomBytes`, give the raw string to the client, and store only its SHA-256 hash next to the user ID and an expiry date. Why? If your database leaks, the attacker gets hashes — and a SHA-256 of 96 random bytes cannot be reversed into anything usable. The same logic as password hashing, applied to a credential. The lookup index is the hash column, so finding a token from a request is one indexed query.

**Everyday requests stay stateless.** Your auth middleware verifies the access JWT's signature and expiry locally — zero database hits. This is the speed you bought by going stateless, and it's also the prison: because verification touches no server state, no server action can cancel a live access token. Accept this. The fix is not "make access tokens revocable," it's "make access tokens short." A stolen access token is a 15-minute problem; a stolen password is a much bigger one. The short lifetime is what converts "we can't revoke it" from a disaster into an acceptable risk.

**The expiry moment.** Fifteen minutes in, the client's call comes back 401. The client — usually an axios interceptor, not your route code — catches it and fires `POST /auth/refresh`. The browser attaches the httpOnly refresh cookie automatically; the body stays empty. The server hashes the cookie value, finds the matching row, confirms it's unspent and unexpired, then returns a fresh access token. From the user's perspective nothing happened. The detailed frontend choreography — interceptors, retry queues, single-flight refresh across tabs — lives in [how-do-you-handle-refresh-tokens-in-mern](../mern/how-do-you-handle-refresh-tokens-in-mern.md); this page owns the server side.

**Rotation turns a static secret into a tripwire.** Without rotation, one stolen refresh token is good for its entire 7-day life — logout doesn't help, because logout only deletes *your* copy. With rotation, every successful refresh marks the old row as spent (`rotatedAt`) and issues a brand-new random token. Now here's the clever part: the legitimate client always holds exactly one refresh token — the newest. So when a request arrives carrying a token whose row is already marked spent, you know something is deeply wrong. Either a duplicated request slipped through, or someone is replaying a stolen copy. The safe response treats it as theft: delete *all* refresh tokens belonging to that user. The attacker loses everything, the real user gets one annoying re-login. Note what rotation did there — it converted "maybe stolen" into a detectable event. A non-rotating token produces no signal when copied.

**Why spent rows must linger.** Tempting shortcut: delete the old row on rotation instead of marking it. Then a replayed token is just "unknown" — indistinguishable from garbage — and reuse detection silently disappears. Keep spent rows until their original expiry (MongoDB's TTL index cleans them up automatically at that point), and the replay signal survives for exactly as long as the old token could possibly do harm.

**Concurrent refreshes are a race you must win atomically.** Two tabs, two simultaneous 401s, two refresh calls in flight with the same cookie. If your handler does find-then-update in two steps, both requests can read "unspent," both rotate, and you've minted two parallel chains — now the client holds one of them and the other looks exactly like a replay, locking the user out. Fix it with a single atomic conditional update: `findOneAndUpdate({ tokenHash, rotatedAt: { $exists: false } }, { $set: { rotatedAt: now } })`. Exactly one request wins the claim; the loser sees `null` and takes the replay path (or the frontend prevents the second call entirely with a shared in-flight promise).

**Revocation is a menu, not a switch.** Single logout: delete the row matching the presented token. "Log me out everywhere" or "laptop stolen": delete every row for that user — one indexed `deleteMany`. Emergency brake for access tokens already in the wild: add a `tokenVersion` to the user document, embed it in the JWT payload, and reject mismatches. But notice the price — checking the version requires a database read per request, which surrenders the statelessness you built all this for. Most teams keep the version check only on sensitive routes, or accept the per-request read on high-security systems. Choose knowingly; don't pretend it's free.

**Absolute cap.** If every refresh slides the expiry forward, a daily user never logs in again for years. Cap total lifetime: the refresh row carries a hard `expiresAt` that rotation copies forward unchanged (or a `sessionStartedAt` you compare against). When the cap hits, the user sees the doctor again — a real login.

**The payoff.** Blast radius on a stolen access token: minutes. Detection on a stolen refresh token: the first replay. Revocation: instant, per-device or per-user. UX: the user never re-logs-in inside the cap. That's the whole design — the pharmacy, running in Express.

## 4. See It In Practice — Real Code or Queries

Assumptions: Node.js with Express 4, `jsonwebtoken`, `cookie-parser`, `bcryptjs`, and Mongoose talking to MongoDB. Everything below is ordinary CommonJS you can paste into a service; the DB calls follow Mongoose's real API.

**The model — a spent flag and a TTL index do most of the heavy lifting:**

```js
// models/RefreshToken.js
const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  rotatedAt: { type: Date }, // present = this token has been spent
});

// MongoDB deletes the doc once expiresAt passes. Spent rows survive until
// THEIR OWN expiry, keeping replay detection alive exactly as long as an
// old stolen token could still hurt us.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
```

**Shared pieces — hashing, cookie flags, signing:**

```js
// auth/tokenService.js
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_TTL = '15m';                    // short on purpose
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;    // 7 days
const SESSION_CAP_MS = 90 * 24 * 60 * 60 * 1000;   // hard re-login ceiling

// The raw token is 96 hex chars of CSPRNG output — nothing to brute-force —
// so a fast unsalted hash is fine. We hash so a leaked database does not
// hand attackers ready-to-use credentials.
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function setRefreshCookie(res, raw) {
  res.cookie('refresh_token', raw, {
    httpOnly: true,       // invisible to page JavaScript — XSS-proof
    secure: true,         // HTTPS only in production
    sameSite: 'strict',   // no cross-site sends — closes the CSRF door
    path: '/auth',        // browser only carries it to auth endpoints
    maxAge: REFRESH_TTL_MS,
  });
}

function createRefreshRecord(userId) {
  const raw = crypto.randomBytes(48).toString('hex');
  return { raw, doc: {
    userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  }};
}

module.exports = {
  ACCESS_TOKEN_TTL, REFRESH_TTL_MS, SESSION_CAP_MS,
  hashToken, signAccessToken, setRefreshCookie, createRefreshRecord,
};
```

**The safety net — every route below awaits database calls, so first the one wrapper that keeps an Express 4 process alive when MongoDB hiccups:**

```js
// middleware/asyncHandler.js
// Express 4 does not catch rejections from async handlers on its own —
// one failed await would otherwise become an unhandled rejection and take
// the whole process down. This turns every rejection into next(err).
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
```

**Login — issue the pair, store only the hash:**

```js
// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const asyncHandler = require('../middleware/asyncHandler');
const {
  hashToken, signAccessToken, setRefreshCookie, createRefreshRecord,
} = require('../auth/tokenService');

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
  const ok = user && await bcrypt.compare(req.body.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const accessToken = signAccessToken(user);
  const { raw, doc } = createRefreshRecord(user.id);
  await RefreshToken.create(doc);

  setRefreshCookie(res, raw);        // refresh token: httpOnly cookie
  res.json({ accessToken });          // access token: response body
}));
```

**The stateless guard — note what is absent: no database call:**

```js
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  try {
    // Signature + expiry checked locally. This speed is WHY access tokens
    // must be short: nothing here can stop a leaked one.
    req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    next();
  } catch {
    // Interceptor on the client sees this 401 and drives POST /auth/refresh.
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
}
```

**The refresh endpoint — rotation, reuse detection, and the race, all in one:**

```js
router.post('/refresh', asyncHandler(async (req, res) => {
  const raw = req.cookies.refresh_token;
  if (!raw) return res.status(401).json({ error: 'No refresh token' });

  // Atomic claim: only ONE of several simultaneous refreshes can flip an
  // unspent row to spent. Losers fall through to the replay branch below
  // instead of silently minting a second parallel token chain.
  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash: hashToken(raw), rotatedAt: { $exists: false } },
    { $set: { rotatedAt: new Date() } }
  );

  if (!claimed) {
    const existing = await RefreshToken.findOne({ tokenHash: hashToken(raw) });

    if (existing) {
      // Row exists but is already spent. A legit client only ever holds the
      // newest token, so an OLD one arriving means a copy is in circulation.
      // Treat as theft: burn the whole family.
      await RefreshToken.deleteMany({ userId: existing.userId });
      res.clearCookie('refresh_token', { path: '/auth' });
      return res.status(401).json({ error: 'Token reuse detected. Please log in again.' });
    }

    return res.status(401).json({ error: 'Unknown refresh token' });
  }

  if (claimed.expiresAt < new Date()) {
    await claimed.deleteOne();
    return res.status(401).json({ error: 'Refresh token expired' });
  }

  const user = await User.findById(claimed.userId);
  if (!user) {
    await RefreshToken.deleteMany({ userId: claimed.userId });
    return res.status(401).json({ error: 'Account no longer exists' });
  }

  // Rotate: fresh access token AND a fresh refresh token. The spent row
  // stays put until its own expiry — that lingering corpse is the tripwire.
  const accessToken = signAccessToken(user);
  const { raw: newRaw, doc } = createRefreshRecord(user.id);
  await RefreshToken.create(doc);
  setRefreshCookie(res, newRaw);

  res.json({ accessToken });
}));
```

**Logout — deletion, not clearing the cookie:**

```js
router.post('/logout', asyncHandler(async (req, res) => {
  const raw = req.cookies.refresh_token;
  if (raw) {
    // Deleting the ROW is what actually kills the session. clearCookie
    // alone only removes the client's copy — a thief keeps theirs.
    await RefreshToken.deleteOne({ tokenHash: hashToken(raw) });
  }
  res.clearCookie('refresh_token', { path: '/auth' });
  res.json({ ok: true });
}));

// "Log me out everywhere" / stolen laptop: one indexed delete ends every
// device's session for this user.
router.post('/logout-all', requireAuth, asyncHandler(async (req, res) => {
  await RefreshToken.deleteMany({ userId: req.user.sub });
  res.clearCookie('refresh_token', { path: '/auth' });
  res.json({ ok: true });
}));
```

Centralizing the 401 responses and unexpected errors through your error handler rather than scattering `res.status(...)` calls is covered in [what-is-error-handling-middleware](what-is-error-handling-middleware.md); the signing primitives themselves are in [how-do-you-implement-jwt-authentication](how-do-you-implement-jwt-authentication.md); and why the `asyncHandler` wrapper looks the way it does — including what Express 5 changes — lives in [how-do-you-handle-async-errors-in-express](how-do-you-handle-async-errors-in-express.md).

## 5. Interview Questions — All of Them, Done Properly

**Q: Walk me through implementing refresh tokens in Express.**

Login verifies credentials, then issues a pair: a 15-minute access JWT for the `Authorization` header, and a 48-byte random refresh token delivered as an httpOnly cookie scoped to `/auth`. Only the SHA-256 hash of the refresh token is stored — in a collection keyed by hash, holding the user ID, an expiry date, and a spent marker. Every API request verifies the access JWT locally with zero database reads. When it expires, the client's interceptor posts to `/auth/refresh`; the server hashes the incoming cookie, claims the row with one atomic conditional update, marks it spent, mints a new pair, and sets the new cookie. Reuse of an already-spent token triggers deleting every refresh token for that user. Logout deletes the row — deleting the cookie alone accomplishes nothing against a thief.

**Q: Why do you need both tokens? Why not one long-lived access token?**

Because the two properties you want — instant offline validation and instant revocability — cannot live in the same token. A JWT validates anywhere with the public verifying material but can't be revoked; a database-backed credential is revocable but costs a lookup on every request. So split the jobs. The short-lived access token makes the un-revocable credential's worst case a fifteen-minute window. The long-lived refresh token carries the revocable half of the system, and it's only presented at one endpoint, so its per-request cost lands once every 15 minutes instead of on every call. Users stay logged in; breaches stay small. One long-lived access token gives you the seven-day disaster from the opening story: valid until expiration, no way back.

**Q: Why is the access token short-lived specifically?**

Because its entire defense is its lifetime. Stateless verification means no server can cancel a token that's been issued — the signature checks out until `exp`. Shortening the life is the only lever that shrinks the window between "stolen" and "useless." The reason this is affordable at all is the refresh token: the user never feels the short lifetime, because renewal is automatic. Short access life plus automatic refresh is the trick — short life *without* refresh is the five-minute logout nightmare.

**Q: Explain token rotation. What does it buy you?**

Rotation replaces the refresh token with a fresh random one on every use and permanently spends the old value. Its real product isn't the replacement — it's the *signal*. A client that plays by the rules holds exactly one refresh token, the newest. When a spent token shows up at the endpoint, you've caught either a buggy retry or a replayed stolen credential, and you respond as if it's theft: wipe every refresh token for that user. Without rotation, a copied refresh token is silently good for its full remaining life and you never find out. Rotation converts copying from an undetectable event into a detectable one.

**Q: Two tabs refresh at the same moment. What happens?**

With naive find-then-save code, both requests read the row as unspent and both succeed, creating two parallel token chains. The client keeps one; the orphan chain's first replay looks like theft and nukes the user's session — a mysterious lockout bug. The server-side cure is making the spend atomic: `findOneAndUpdate` with `rotatedAt: { $exists: false }` in the filter. Exactly one request wins; the loser takes the replay path. The complementary client-side cure is single-flight refresh — a shared promise so concurrent 401s trigger one network call — which the MERN page covers in depth.

**Q: A refresh token got stolen. What actually happens?**

Best case: the thief sits on the token while the real user refreshes normally. Rotation spends it, so the thief's copy is dead weight — and if the thief tries it anyway, reuse detection burns the whole family and forces a fresh login. Worst case: the thief uses the token *first*. They get one exchange before the real user's next refresh exposes the theft, so the damage window is one rotation cycle, not seven days. Then recovery: `deleteMany` on the user's refresh tokens ends every device, the user re-authenticates, and you audit what the one access token touched. This asymmetry — thief-first versus user-first — is the strongest argument for rotation in an interview.

**Q: Where should the refresh token be stored? Web versus mobile?**

Browser: httpOnly, Secure, SameSite cookie — ideally `path`-scoped to the auth endpoints. httpOnly puts it beyond the reach of page JavaScript, so an XSS hole can't exfiltrate it; Secure keeps it off plaintext HTTP; SameSite blocks other origins from triggering sends with it. localStorage is disqualified outright: any script on the page can read it, and XSS is the single most common web vulnerability class. Mobile: there are no browser-managed cookies, so use the platform's encrypted storage — iOS Keychain, Android Keystore/EncryptedSharedPreferences. The invariant is identical on both platforms: the token must not be readable by arbitrary code running in your execution context.

**Q: Can you revoke a JWT access token?**

Not while it's valid, by design — verification is purely local. Your options, in order of cost: keep access tokens short so revocation means waiting minutes; maintain a denylist of revoked `jti`s checked per request (works, but reintroduces a database read on every call — you've partially re-built sessions); or embed a `tokenVersion` claim and bump it on the user record for an instant global kill, accepting the same per-request lookup. Sensitive systems combine short TTLs with the version check on privileged routes only. The junior answer is "you can't"; the senior answer is "you can't for free, so you pick which requests pay the lookup."

**Q: Why hash refresh tokens in the database? Aren't they already random?**

Defense in depth against a different attack than forgery. Randomness protects against guessing; hashing protects against *leakage* — a SQL injection, a misconfigured backup, a dumped replica. Hashed, the dump yields strings that authenticate to nothing; the attacker can't present a hash where the raw token belongs. Salting is unnecessary because 48 bytes of CSPRNG output is already unguessable, so rainbow tables have nothing to chew on. It's the password-hashing instinct applied where a cheap unsalted hash suffices.

**Q: Isn't a refresh token just a server-side session with extra steps?**

Honestly — it's close, and saying so scores points. Both are opaque server-side records you validate on arrival. Differences that matter: rotation gives sessions a property classic session IDs lack (replay detection); the pairing lets you keep per-request authorization stateless and fast while the renewable credential hides in one slow endpoint; and multi-client support falls out naturally — phone, web, and laptop each hold their own refresh row, so "log out the iPhone" doesn't touch the desktop. A bare session cookie can be architected to do similar things; refresh tokens are the standardized vocabulary — inherited from OAuth2 — for doing it deliberately.

## 6. The Traps — What Goes Wrong in Production

**Storing the refresh token in localStorage because cookies feel complicated.** Any XSS — a compromised npm package, a vulnerable rich-text editor, a third-party script — reads it and exfiltrates it. With rotation and reuse detection the stolen copy dies at the next legit refresh, but between theft and detection the attacker owns the account. The fix is boring and non-negotiable: httpOnly cookie on web, Keychain/Keystore on mobile.

**Rotating by deleting the old row.** Feels cleaner, destroys the tripwire. After deletion a replayed token is just "unknown" — indistinguishable from a typo — so theft detection evaporates and a stolen token quietly works elsewhere while the victim sails along unaware. Mark rows spent (`rotatedAt`) and let the TTL index reap them at natural expiry; the corpse must outlive the danger.

**Non-atomic spend, then mystery lockouts.** Find-then-save lets two racing refreshes both succeed, spawning parallel chains; whichever the client doesn't hold later trips reuse detection and wipes the user's sessions. Symptom: angry tickets like "your app logged me out everywhere randomly." Cure: the atomic conditional update shown above — or prevent the race client-side with a shared in-flight refresh promise. Do both.

**Storing raw refresh tokens in the database.** One injected query or leaked backup and the attacker holds valid credentials for every active user — no cracking required. Hash them like passwords; the code is three lines.

**Cookie flags treated as optional.** Drop `sameSite` and another site can piggyback the user's cookie toward your refresh endpoint (CSRF — though your handler only rotates tokens, an attacker forcing refreshes can churn sessions or probe behavior). Drop `secure` and a café Wi-Fi capture grabs the token in transit. Set all four: `httpOnly`, `secure`, `sameSite: 'strict'`, and `path: '/auth'`. Cross-domain deployments force `sameSite: 'none'` plus `secure` — weaker, which is a genuine argument for keeping the API on a shared site.

**Sliding sessions with no ceiling.** If every refresh extends expiry from "now," an active user never authenticates again — a stolen device stays alive indefinitely as long as it pings monthly. Give the session a hard cap (`SESSION_CAP_MS`): rotation may renew the token but never pushes past the original deadline. Past the cap: real login, real credential check.

**Designing the happy path only.** The endpoint above handles six failure branches — missing cookie, unknown token, replay, expiry, deleted user, success — and success is the shortest one. Interviews and incidents both happen in those branches. If your whiteboard design has one `if`, you're not done.

## 7. Compare With Related Concepts

**Access token vs refresh token.** Access: JWT, minutes long, travels on every request, validated offline, irrevocable. Refresh: random string, days long, travels to one endpoint, validated against the database, revocable and rotating. Rule: anything that must be cheap and frequent is access; anything that must be controllable is refresh.

**Refresh token vs classic session ID.** Both are opaque server-side records, so the honest overlap is large. Sessions traditionally mean "every request pays a lookup"; refresh tokens mean "lookups happen once per access-token lifetime, and rotation adds replay detection." Rule: pure browser app with modest scale — a well-configured session is perfectly respectable; SPA plus mobile clients plus per-device logout — the refresh-token pair earns its complexity.

**Opaque refresh token vs JWT refresh token.** Since the refresh flow hits the database anyway, the JWT's statelessness buys nothing there — and a signed refresh token can't be revoked mid-life without adding the exact database check you skipped by not using one. A random string plus hash is simpler, smaller, and revocable. Rule: JWT where you need offline verification (access); opaque where you touch the store anyway (refresh).

**Refresh tokens vs sliding sessions.** A sliding session extends on activity and never re-proves identity; a capped refresh flow re-authenticates at the ceiling and detects replay along the way. Rule: internal tools may slide; user-facing accounts with payment or personal data get a cap.

**Where this page ends and neighbors begin.** Signing keys and JWT structure: [how-do-you-implement-jwt-authentication](how-do-you-implement-jwt-authentication.md). The client-side interceptor, retry queues, and cross-tab single-flight: [how-do-you-handle-refresh-tokens-in-mern](../mern/how-do-you-handle-refresh-tokens-in-mern.md). Routing repeated 401s through one error funnel: [what-is-error-handling-middleware](what-is-error-handling-middleware.md).

## 8. 🧠 The Memory Hook

A pill bottle already sold can never be recalled — so keep bottles small. All real power lives behind the pharmacy counter: every refill voids the last slip, a returning old slip means someone photocopied your chart, and one phone call from the doctor freezes every refill you have. Short bottles, counter-held slips, new slip per refill, burn the file on any replay.
