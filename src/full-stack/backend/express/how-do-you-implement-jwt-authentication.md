# How do you implement JWT authentication

## 1. The Real-World Problem — When You Actually Hit This

Your Express app has been running happily for months with session-based login. Sessions live in the server's memory. Then traffic grows, ops puts a second instance behind a load balancer, and support tickets start pouring in: users get logged out every few clicks. What's happening? The load balancer sends each request to whichever instance is free. Your login lives on instance one, so instance two has never heard of that user and answers with 401. You now need a shared session store just to stay logged in — extra infrastructure, extra latency, extra failure modes.

Mobile apps and SPAs hit the same wall differently. A phone app calling your API doesn't naturally carry browser cookies well across domains and platforms, and every microservice behind your gateway needs to answer the same question — "who is this request from?" — without phoning a central session store on every call.

JWT authentication is the standard answer to both problems: put the identity proof *in the request itself*, signed so nobody can fake it, so any server can trust it without asking anyone. Interviewers love this topic because the implementation is only ten lines — what they're really testing is whether you understand what you gain by going stateless and exactly what you give up in return.

## 2. The Analogy — Make the Mechanic Obvious

Think of a school hall pass system run by the front office.

At the start of the day, a student walks into the office and shows their ID card. The office checks it against their records — *once*. After that, the office writes out a hall pass: "Name: Ravi. Class: 10-B. Allowed in hallways until 3:15 PM." Then they press the official school stamp onto it.

Now watch what makes this system work:

- **The pass text is visible to everyone.** Anyone who grabs the pass can read Ravi's name and the time on it. Nothing is hidden. That's fine, because a hall pass contains nothing secret — its job is to be shown, not hidden.
- **Only the office owns the stamp.** Students see stamped passes all day, but owning a stamped pass is not the same as owning the stamp. Without the physical stamp, you cannot produce a new genuine pass. The stamp is the whole security model.
- **Every teacher can verify a pass alone, in two seconds.** Here's the clever part: a teacher takes the pass, looks at the text on it, presses her own trusted copy of the school stamp on a scratch pad next to it, and compares the two impressions. Genuine text plus the real stamp always produces the exact same pattern. If someone changed even one letter of "10-B" to "12-A," the fresh impression won't match the one on the pass anymore, and the forgery is caught on the spot. Notice what the teacher did *not* do: she never ran back to the office to ask "is this kid allowed out?" She checked everything locally.
- **The expiry time is written right on the pass.** A perfect stamp means nothing at 3:16 PM. The teacher reads the time and the clock together before deciding.
- **The office cannot take a pass back.** If Ravi gets suspended at 2:00 PM, his pass still says "valid until 3:15," and every teacher in the building will honor it — none of them knows about the suspension. The only instant kill switch the office has is destroying every stamp copy in the school, which instantly voids *everyone's* passes, including the innocent ones.

That last point is not a flaw in the analogy — it's the exact trade-off you accept when you adopt JWTs. Hold onto it; we'll come back to it.

## 3. The Full Explanation — How It Actually Works

A JSON Web Token (JWT) is the hall pass: a compact string the server hands you after login, which you present on every later request, and which any server instance can verify entirely on its own.

**The sign flow — issuing the pass.** When the user logs in, the server checks the credentials against the database once, then builds a small object of facts worth carrying around: who this is (`sub` — subject, the user's ID), what role they have, and when this stops being valid (`exp`). The `jsonwebtoken` library takes three inputs — that payload, a signing secret, and options like `{ expiresIn: '15m' }` — and produces a token that looks like this:

```txt
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1XzQyIiwicm9sZSI6ImFkbWluIn0.kP0vHqE2nTzLmYwBfXaO9cDgJrUxN4sKlVvQeZtRjM8
```

Three parts separated by dots. Part one is the header — Base64URL-encoded JSON naming the algorithm, here `{"alg":"HS256","typ":"JWT"}`. Part two is the payload — Base64URL-encoded JSON of your claims. Base64URL is an encoding, not encryption; it's the alphabet, not a lock. Run the payload through any decoder and the JSON falls out in plain sight, exactly like reading the face of the hall pass. Part three is the signature: the library concatenates the encoded header and encoded payload, feeds that string plus the secret into HMAC-SHA256, and the digest that comes out is the signature. Only someone holding the secret could have produced it — that's the stamp pressed onto the text.

**Claims — what's written on the pass.** Each field in the payload is called a claim. Some are standardized: `sub` (who), `iat` (issued-at timestamp, added automatically), `exp` (expiry timestamp), `iss` (issuer), `aud` (intended audience). You can add custom ones like `role`. Two rules govern claims. First, keep them small — the entire token rides along in the `Authorization` header of *every single request*, so a bloated payload taxes your bandwidth forever. Second, keep them clean — anything you put in there is readable by anyone holding the token, and it stays frozen at whatever value it had at sign time (if you promote a user mid-hour, their old token still says the old role until it expires).

**Secret management — where the stamp lives.** The signing secret is everything. It must be long random bytes (at least 32), generated once with something like `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, and stored in an environment variable or a secrets manager — never hardcoded, never committed, never logged. Every server instance that needs to *verify* tokens needs a copy of the same secret, because with HS256 signing and verifying share one key. That's the locked drawer in the teachers' lounge: convenient, but anyone who gets the drawer open can print passes. If the secret leaks, an attacker can mint perfectly valid tokens claiming any user ID and any role — the response is immediate rotation, and rotation has a side effect worth knowing: every outstanding token dies at once, everywhere.

**The verify flow — the teacher checking the pass.** On each protected request, the client sends the token in the header `Authorization: Bearer <token>`. Middleware runs before your route handler and does four things in order. It parses the header and rejects anything that doesn't start with `Bearer `. It calls `jwt.verify(token, secret)`, which internally rebuilds the HMAC from the received header-plus-payload using its local copy of the secret and compares it to the signature that arrived — the recompute-and-compare from the analogy. Any alteration anywhere in the first two parts makes the recomputed digest differ, and verification fails. If the signature matches, the library then checks the time-based claims: expired token, wrong issuer, wrong audience — each failure throws its own typed error. Only after all of that does it hand back the decoded payload. The middleware attaches that payload to `req.user` and calls `next()` — from here downstream, the handler trusts `req.user.sub` and `req.user.role` precisely *because* the server signed that data, not the client.

Notice the shape of this: there was no session store, no lookup table, no "phone the office." Verification is pure computation. That's why adding server instances fixes nothing and breaks nothing — every instance holds the same secret and verifies locally. This property is called **stateless authentication**, and it cuts both ways. You gain effortless horizontal scaling and simple service-to-service trust. You lose immediate revocation: between sign time and expiry, the token is valid everywhere and recallable nowhere, because no server is keeping the kind of list that would let it say "ignore this one." Short lifetimes shrink the damage window; deliberate mechanisms (blocklists, refresh-token rotation, secret rotation) buy revocation back at the price of reintroducing some state. That tension is the senior-level heart of this topic.

If a verify failure should do more than return 401 — log structured events, rate-limit repeated failures — that belongs in your central error handler, whose mechanics are covered in [what-is-error-handling-middleware.md](./what-is-error-handling-middleware.md).

## 4. See It In Practice — Real Code or Queries

Assumptions: Node 18+, Express 4, `jsonwebtoken@^9`, `bcryptjs`. In production `User` is your Mongoose/SQL model — swap the lookup accordingly. Note the login handler is wrapped in `asyncHandler` below on purpose: in Express 4, a rejected `await` inside a bare async handler never reaches your error middleware — it becomes an unhandled rejection that can kill the process. [how-do-you-handle-async-errors-in-express.md](./how-do-you-handle-async-errors-in-express.md) builds that wrapper step by step.

**Login — validate once, sign the pass:**

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// A rejected DB call or bcrypt failure must reach next(err).
// Without this wrapper, Express 4 turns the rejected promise into an
// unhandled rejection instead of a clean 500 from your error handler.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const app = express();
app.use(express.json());

app.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  // One identical error for "no such user" and "wrong password",
  // so attackers can't probe which emails are registered.
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Minimal, non-sensitive claims only — this JSON is readable
  // by anyone who ever sees the token.
  const token = jwt.sign(
    { sub: String(user._id), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  res.json({ token });
}));
```

**The auth middleware — checking the pass at every door:**

```js
// middleware/authenticate.js
const jwt = require('jsonwebtoken');

module.exports = function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';

  // Guard the shape before slicing — a raw .split() on garbage
  // yields undefined and turns a clean 401 into a crash-driven 500.
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    // verify() = recompute signature AND enforce exp/iss/aud.
    // Pinning algorithms closes off algorithm-confusion attacks.
    // Using jwt.decode() here instead would skip ALL of these checks.
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
    });

    // Identity now comes from data we signed, never from
    // anything the client sent in plain fields.
    req.user = payload;
    next();
  } catch (err) {
    // Distinct reasons let the frontend decide: refresh, or full re-login.
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

**Protecting routes — and separating "who are you" from "what may you do":**

```js
const express = require('express');
const authenticate = require('./middleware/authenticate');

const app = express();
app.use(express.json());

// Everything mounted below runs only after successful verification.
app.use('/api', authenticate);

app.get('/api/me', (req, res) => {
  // req.user is the exact payload we signed at login.
  res.json({ id: req.user.sub, role: req.user.role });
});

// Authentication passed ≠ authorization granted: wrong role is 403, not 401.
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  res.json({ deleted: req.params.id });
});

app.listen(3000);
```

**Proof that "encoded" is not "encrypted" — run this yourself:**

```js
const jwt = require('jsonwebtoken');

const token = jwt.sign(
  { sub: 'u_42', role: 'admin' },
  'dev-only-secret',
  { expiresIn: '15m' }
);

// Three dot-separated parts:
console.log(token.split('.'));

// Anyone can read the payload with zero keys:
const payload = JSON.parse(
  Buffer.from(token.split('.')[1], 'base64url').toString()
);
console.log(payload); // { sub: 'u_42', role: 'admin', iat: ..., exp: ... }

// But change one character of the signature and verification dies:
const tampered = token.slice(0, -3) + 'aaa';
try {
  jwt.verify(tampered, 'dev-only-secret');
} catch (err) {
  console.log(err.name); // JsonWebTokenError — invalid signature
}
```

That last block is the entire security story in six lines: reading is free, forging is impossible without the secret.

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you implement JWT authentication in Express?**

Walk it as three pieces. Login: a `POST /login` route checks credentials against the database (password compared against its hash, never plaintext), then signs a minimal payload — user ID and role — with `jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' })` and returns the token. Transport: the client sends `Authorization: Bearer <token>` on every subsequent request. Verification: an `authenticate` middleware parses the header, calls `jwt.verify()` — which recomputes the HMAC signature and enforces expiry — attaches the decoded payload to `req.user`, and calls `next()`, or returns 401 on any failure. The details that separate a senior answer: why claims stay minimal and non-sensitive, why the secret lives only in environment variables, why access tokens are short-lived, and the fact that this design is stateless — any server instance with the secret can verify without a shared store, which is the actual reason you chose JWTs.

**Q: What is the structure of a JWT?**

Three Base64URL-encoded segments joined by dots: header, payload, signature. The header is JSON naming the algorithm and type, like `{"alg":"HS256","typ":"JWT"}`. The payload carries the claims — `sub`, `iat`, `exp`, plus whatever custom fields you added. The signature is `HMAC_SHA256(base64url(header) + "." + base64url(payload), secret)`. The crucial nuance: the first two segments are merely encoded, so decoding requires nothing; the third segment is what makes the token trustworthy, because reproducing it requires the secret. Integrity comes from part three; readability is a property of parts one and two.

**Q: Are JWTs encrypted? Can I put sensitive data in the payload?**

No, and no. Base64URL is a reversible encoding — anyone with the token can read every claim, using jwt.io or one line of code. A JWT gives you integrity (tampering is detectable because the signature won't recompute) but not confidentiality. So the payload may hold identifiers and non-sensitive flags — user ID, role, maybe org ID — never passwords, tokens, personal data, or anything you'd dread seeing pasted in a screenshot. Confidentiality for the *channel* comes from HTTPS; confidentiality for the *content* would require JWE encrypted tokens, which almost nobody uses because the payload shouldn't contain secrets in the first place.

**Q: How does the auth middleware actually verify a token, step by step?**

First it reads `req.headers.authorization` and confirms it starts with `Bearer `, rejecting otherwise with 401. Then `jwt.verify(token, secret)` does the real work in two phases. Phase one, integrity: take the received header and payload segments, join them, feed them plus the local secret into HMAC-SHA256, and compare the result to the received signature — this is recomputing rather than trusting. Phase two, semantics: with the source proven genuine, check the claims — is `exp` in the future, does `iss` match, does `aud` match. Each phase can throw a distinct typed error (`TokenExpiredError`, `JsonWebTokenError`). On success the decoded payload becomes `req.user`; on failure respond 401, ideally distinguishing "expired" (frontend should refresh) from "invalid" (frontend should re-login). One more thing worth saying unprompted: `jwt.decode()` merely splits and decodes without any checking — using it in auth middleware trusts attacker-controlled data.

**Q: Why are JWTs called stateless, and what does that cost you?**

Stateless means no server-side record of issued tokens exists — validity is judged purely from the token itself: does the signature recompute, is it unexpired. The upside is scaling for free: add or remove instances, route requests anywhere, let other services verify independently — nothing shares a session store, nothing phones home. The cost is revocation. Because nobody keeps the list, there is no way to invalidate one specific token before expiry; a stolen token is good until its `exp` no matter what your database says about the account. You manage that cost three ways: keep the window tiny (short-lived access tokens), move longevity into refresh tokens that *are* stored server-side and therefore revocable, and reserve secret rotation as the break-glass option that invalidates everything at once. If a product genuinely needs instant, per-user logout enforcement, that requirement is pulling you back toward sessions or a token-blocklist — meaning some state — and admitting that in an interview lands better than pretending JWTs solve everything.

**Q: How do you log a user out with JWTs?**

Be precise about what logout can mean. Client-side logout — deleting the stored token — stops *that device* from authenticating, and for most apps that's the whole requirement. It does not stop anyone who already copied the token. Server-enforced invalidation requires introducing state: a blocklist keyed by the `jti` (token ID) claim checked on each request, which works but quietly ends the "no storage" benefit for the logout path; or refresh-token rotation, where the server deletes the stored refresh token so the client loses its ability to obtain new access tokens and the existing access token dies within fifteen minutes naturally; or rotating the signing secret, the nuclear option that logs out every user everywhere. The mature answer names the trade-off: JWTs buy scale with immediacy, and every revocation mechanism buys immediacy back with state.

**Q: Where should the client store the token — localStorage or a cookie?**

Both options carry a risk and neither is free. localStorage is trivially readable by any JavaScript on the page, so one XSS hole drains every user's token; its saving grace is that it never auto-sends, so CSRF is structurally impossible. An `httpOnly`, `Secure`, `SameSite` cookie is invisible to JavaScript — XSS can't lift it — but the browser auto-attaches it everywhere, so CSRF defenses become mandatory. The common production choice is httpOnly cookie with strict `SameSite` for browser clients, and Authorization-header tokens for mobile apps, which have no cookie jar. Whichever you pick, say the reasoning — the interviewer is probing whether you know the threat each choice invites. Deeper mechanics: [how-do-you-use-cookies-in-express.md](./how-do-you-use-cookies-in-express.md).

**Q: What happens if the signing secret leaks?**

Game over for authenticity until you rotate: anyone with the secret can sign a token claiming `sub: whoever, role: admin`, and every instance will verify it faithfully, because from the system's point of view it *is* genuine — the one thing the signature proves is possession of the secret. Response is immediate rotation, and rotation doubles as the emergency kill switch: every outstanding token instantly fails verification, logging out all users at once. Prevention is unglamorous: generate 32+ random bytes, inject via environment variables or a secrets manager, never commit or log it, keep separate secrets per environment, and fail fast at boot if it's missing rather than limping along with a default. Worth adding: weak human-chosen secrets can be brute-forced offline from a single sample token, which is why "my-secret-123" is effectively a leaked secret.

**Q: HS256 or RS256 — when does it matter?**

HS256 is symmetric: one shared secret signs and verifies. Perfect for one app that issues and verifies its own tokens; the pain begins when multiple services must verify, because every one of them now holds signing power — a leak anywhere is a forgery kit, and you can't let a read-only reporting service hold the crown jewels. RS256 is asymmetric: the private key signs, held by the auth server alone; the public key verifies, distributable to every service without enabling forgery. The rule: single service, HS256 is simpler and fine; tokens consumed across several services or issued by a central identity provider, RS256, which is what OAuth/OIDC providers use with published JWKS endpoints.

**Q: Why both an access token and a refresh token?**

Because the two jobs want opposite lifetimes. The access token rides every request, gets verified constantly, and therefore wants to be short-lived — fifteen minutes caps the misuse window of a theft while keeping the system fast and stateless. The refresh token appears rarely, only at the refresh endpoint, so it can afford to live longer — days — and, being stored server-side, it can be revoked individually. When the access token expires, verification fails with `TokenExpiredError`, the frontend calls the refresh endpoint, and a new pair is issued. You end up with theft resistance (a stolen access token dies fast), good UX (silent renewal instead of hourly re-login), and a revocation handle (delete the refresh record). Full implementation: [how-do-you-implement-refresh-tokens.md](./how-do-you-implement-refresh-tokens.md).

## 6. The Traps — What Goes Wrong in Production

**Using `jwt.decode()` instead of `jwt.verify()` in the middleware.** `decode()` just splits the string and Base64-decodes — signature unchecked, expiry unchecked, nothing checked. The middleware "works" in happy-path testing because real tokens from your own login page are valid, so the bug ships silently. Then someone crafts a payload claiming `role: admin`, and the server believes it, because the server never asked for proof. The fix is one word — `verify()` — but knowing why the distinction exists is what the interviewer wants: decode answers "what does this say," verify answers "do we believe this."

**Putting sensitive data in the payload.** Password reset markers, internal IDs, PII — all readable by anyone holding the token, forever preserved in logs, browser storage, and proxy caches along the way. People make this mistake because the payload *feels* private, sitting behind a wall of dots. It's a postcard. Rule: if you wouldn't print it on the outside of an envelope, it doesn't go in a claim.

**Weak or committed secrets.** `JWT_SECRET=supersecret` in a config file pushed to GitHub is the most common real-world JWT breach. Offline brute-force tools chew through human-chosen secrets using one captured token as an oracle, and each guess tests itself — wrong secrets produce wrong signatures. Once guessed, the attacker mints admin tokens at will. Generate 32+ random bytes, keep them in env vars or a secrets manager, and add a boot-time guard so the app refuses to start without one.

**Long-lived access tokens with no revocation story.** A seven-day access token converts every leak, shared laptop, and logged-out-but-not-really session into a week-long intrusion window you cannot close — remember, no mechanism exists to call that token back. Fifteen minutes with a refresh token behind it gives away nothing except a background request per quarter hour, which is a price nobody notices.

**Crashing on a malformed Authorization header.** `req.headers.authorization.split(' ')[1]` throws when the header is absent, Express's error machinery turns it into a 500, and suddenly scanners poking your API fill your error tracker with crashes that are really just 401s wearing a costume. Check `startsWith('Bearer ')` before slicing; reject early, respond cheaply.

**Not pinning the algorithm at verify time.** Historically, some libraries accepted a token whose header said `alg: none` — no signature at all — or let an RS256-verifying service be fed an HS256 token signed with the *public* key, which is public and therefore attacker-known. Modern `jsonwebtoken` versions closed the worst of this, but passing `algorithms: ['HS256']` explicitly costs nothing and states your intent. Security settings you leave implicit are settings attackers choose for you.

**Fat payloads.** Claims ride every request, so twenty custom fields mean kilobytes of overhead on millions of requests, plus stale-data bugs — the `role` snapshot inside a token goes stale the moment you promote the user, and stays stale until refresh. Keep identity essentials only, treat claims as cache-with-expiry rather than a live profile, and re-check anything permission-critical against the database when the action deserves it.

## 7. Compare With Related Concepts

**JWT vs session cookie.** A session stores the truth server-side and hands the client a meaningless reference ID; a JWT hands the client the truth itself, signed. Sessions revoke instantly (delete one row) but demand a shared store; JWTs scale across instances and services for free but can't recall a single token. Rule of thumb: classic server-rendered app on one stack — sessions are simpler and safer by default; API consumed by SPAs, mobile apps, or multiple services — JWTs earn their complexity. Side-by-side detail: [../auth/jwt-vs-session.md](../auth/jwt-vs-session.md).

**Access token vs refresh token.** The access token is the frequently-shown, short-lived credential; the refresh token is the rarely-shown, longer-lived credential whose only job is obtaining new access tokens, and which the server stores so it can revoke. Rule: never extend access-token lifetime to fix UX — add the refresh layer. Implementation: [how-do-you-implement-refresh-tokens.md](./how-do-you-implement-refresh-tokens.md).

**Authentication vs authorization.** Authentication answers "who are you" (the middleware, `req.user`, failures are 401); authorization answers "what may you do" (role checks, failures are 403). They fail differently and return different status codes — conflating them is an instant credibility leak in interviews. Enforcement patterns: [how-do-you-implement-role-based-authorization.md](./how-do-you-implement-role-based-authorization.md).

**Encoded vs encrypted.** Encoding transforms data for safe transport with no key and no secrecy (Base64URL); encryption transforms data so that only key-holders can read it. A JWT's payload is encoded; HTTPS encrypts the channel carrying it. Rule: never rely on encoding for confidentiality.

**Bearer token vs opaque token.** A JWT is self-describing — the verifier learns everything from the token itself. An opaque token is a random string whose meaning lives in a database lookup, which reintroduces the per-request check JWTs eliminated but restores instant revocation. Rule: self-contained verification and cross-service trust favor JWTs; instant revocation and tiny credential size favor opaque tokens backed by introspection.

## 8. 🧠 The Memory Hook

A JWT is a hall pass with the school stamp: anyone can read what it says, nobody can forge the stamp, every teacher can check it alone without asking the office — and the office can never call one pass back. It just quietly expires at the time written on it.
