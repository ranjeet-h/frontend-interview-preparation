# Users Are Getting Logged Out Randomly — How Will You Debug It

## 1. The Real-World Problem — When You Actually Hit This

It is Tuesday afternoon. No deploy went out this morning. Then support starts pinging you: "Customers say they get kicked to the login page in the middle of checkout." It is not every user, and it is not every request. One person adds three items to the cart, clicks pay, and lands back on login with an empty cart. Another person you watch over Zoom is clicking around fine, then she refreshes the page and is suddenly logged out. Your monitoring shows a spike in 401s but no spike in errors. The API is up. The database is up.

This is the worst kind of auth bug. It does not crash the server. It just quietly decides a valid user is no longer valid. And when you cannot tell whether the browser stopped sending the credential, the server stopped accepting it, or the credential itself expired early, every guess feels right and every fix feels like a guess. This page is the checklist you run so you stop guessing and start reading evidence.

## 2. The Analogy — Make the Mechanic Obvious

Think of your auth system like a hotel that gives every guest a timed wristband.

When you check in, the front desk prints a wristband that says "valid until 3pm" and a second slip for the front desk drawer that says "you may ask for a new wristband until Friday." The wristband is your access token. The slip in the drawer is your refresh token. Every door scanner checks the time printed on the wristband against the hotel clock.

Now map the failures:

The wristband that expires too quickly is a short token expiry. If the hotel prints wristbands that last only five minutes and the hallway to the pool is long, guests are constantly walking back to the front desk. If the app never learned to walk back automatically, the guest just gets stuck outside.

The hotel clock being ten minutes fast is clock skew. Your wristband says 2:05pm, your watch says 2:00pm, but the door scanner says 2:10pm — "expired" — and it is right according to its clock, even though you just got the band.

The rules printed on the back of the wristband are your cookie attributes. "Only valid inside the main tower" is `Domain`. "Only valid if you entered through the front door, not the side gate" is `SameSite`. "Only visible under UV light" is `Secure` — it only works over HTTPS. Get one rule wrong and the guest is wearing a valid wristband that the scanner never sees, so it looks like they have no wristband at all.

Throwing the wristband in the trash is storage being cleared. A browser extension, an incognito window, or a frontend bug that calls `localStorage.clear()` is the guest taking it off and losing it. The front desk still thinks they are checked in.

Two friends taking the same renewal slip to two different front desks at the same time is a rotation race. The hotel punches a hole in the slip after first use so it cannot be reused. Whichever friend arrives a split second second gets told "this slip was already used, you might have stolen it — everyone in this room is now checked out for safety." That is refresh token reuse detection logging the whole family out.

The hotel blacklist is revocation. You checked out, you changed your password, or an admin banned the token family. Your wristband looks fine but the scanner now checks a list at the door.

Two copies of the same wristband on the same guest is multiple tabs. Tab A logs out and cuts its band. If the app does not tell tab B, tab B keeps showing a room number that no longer exists until the next request fails.

Three entrances with three different master keys is load balancer secret mismatch. Entrance A printed your wristband with key 1. Entrance B only knows key 2, so it says "fake wristband" even though entrance A just made it. That is two API servers with different `JWT_SECRET` env vars, or a rolling deploy where half the fleet still signs with the old secret.

Debugging is learning to ask: did the guest lose the band, did the rule hide the band, did the clock lie, or did the door change its lock?

## 3. The Full Explanation — How It Actually Works

Random logouts mean the browser stopped proving who it is on some requests. There are only three places to look: what the browser sends, what the server accepts, and what time both sides think it is.

Token expiry that is too short is the most common cause and the easiest to misread. Most modern apps use a short access token, often 5 to 15 minutes, and a longer refresh token, often 7 to 30 days. The access token rides on every API call. When it expires, the frontend should silently use the refresh token to get a new access token and retry the failed request. If the refresh logic is missing, has a bug, or only runs on one route, the user feels a random logout every few minutes. In plain words, the wristband timed out and nobody taught the app how to walk back to the front desk without making the user log in again.

Clock skew is the same symptom with a different root cause. A JWT carries `iat` (issued at), `nbf` (not before), and `exp` (expires at) as Unix timestamps. Servers compare those against their own system clock. If a server is even two minutes ahead, a token that is valid for five more minutes on your laptop is already expired on that server. If the issuer and verifier are different machines, their clocks must be synced with NTP. You see this as "works on staging, fails in production" or "fails only on one pod out of ten" because only that pod drifted.

Cookie attribute mismatch makes a valid credential invisible. If you set a cookie with `Secure` but your frontend calls `http://localhost` in development, the browser simply never sends it. If you set `SameSite=Lax` and your frontend lives on `app.example.com` while your API is on `api.example.com`, a cross-site POST from the frontend may not carry the cookie unless you use `SameSite=None; Secure` and the request is made with `credentials: include`. If you set `Domain=example.com` but set the cookie from `api.example.com` without the leading dot, some browsers scope it narrowly. If you set `Path=/api`, requests to `/checkout` will not carry it. The cookie is correct, it is just attached to the wrong door. Open DevTools > Application > Cookies and DevTools > Network > Request Headers and you will see the cookie missing on the very request that returned 401.

Storage being cleared is the frontend losing its own credential. If you store tokens in `localStorage`, any `localStorage.clear()`, a user clearing site data, Safari's Intelligent Tracking Prevention in an iframe, or a browser extension that wipes storage will delete it mid-session. If you store tokens in `sessionStorage`, closing the tab deletes them by design. If you store them in memory only, a full page reload deletes them. This logout feels random because it depends on what the user or their browser did, not what your server did.

Rotation race is the subtle distributed bug. To limit theft, many backends rotate refresh tokens: every time you use a refresh token, the server invalidates that token and returns a new pair. If two requests fire at the same time when the access token just expired — say two tabs both try to refresh, or the app fires three parallel API calls that all get 401 and all try to refresh — only the first refresh wins. The second one presents a token that was just invalidated. Good servers treat that as possible theft and revoke the whole token family, which logs the user out on all devices. You see it as "I clicked quickly and got logged out" or "it happens when I have two tabs open."

Revocation is the intended logout that looks like a bug when you do not log it. When a user changes their password, clicks "log out on all devices," or an admin bans a user, the backend should invalidate all refresh token families and put active access tokens on a denylist until they naturally expire, usually in Redis with a TTL equal to the token's remaining life. If you do not surface "revoked" as a distinct reason in your auth middleware, the frontend just sees another 401 and thinks the token expired.

Multiple tabs share the same storage but not the same brain. If tab A logs out and removes the token from `localStorage`, tab B still holds the old token in memory and keeps sending it until it fails. If tab B then successfully refreshes a split second before tab A revokes, you get a ping-pong. The fix is cross-tab communication — `BroadcastChannel` or the `storage` event — so a logout in one tab immediately clears the others.

Load balancer secret mismatch is the infrastructure version of "it works sometimes." If you run three API servers behind a load balancer and each has its own `JWT_SECRET` in its env file, a token signed by server 1 will fail verification on server 2. With round-robin balancing, every third or fourth request fails. You also see this during rolling deploys when you rotate the secret: old tokens signed with the old secret are suddenly invalid on new pods. The right pattern is one secret shared via a secret manager, or better, asymmetric keys where you publish a JWKS and verify with a public key so rotation is explicit, or at minimum support two valid secrets during a rotation window.

How you debug it without guessing is the same every time. First, make the server tell you why. Log the exact auth failure reason on every 401 — `missing_token`, `expired_at`, `nbf_in_future`, `signature_invalid`, `revoked_jti`, `reuse_detected`, `cookie_not_sent` — with `userId`, `jti`, `requestId`, and the hour of `exp`. Second, decode the token the client actually sent. Paste the JWT into jwt.io or run a local decode and read `exp`, `iat`, and `kid` yourself. If `exp` is in the past, it is expiry or clock skew. If verification fails with `invalid signature`, it is a secret mismatch. If the cookie is not even in the request headers, it is a cookie attribute problem. Third, open the browser: Application > Cookies to see if the cookie was set with the right Domain, Path, Secure, and SameSite, and Network > Headers to see if it was actually sent. That three-way check — server reason, token content, browser view — narrows it from eight guesses to one answer in minutes.

## 4. See It In Practice — Real Code or Queries

These are small, runnable pieces you would actually add while debugging. They are Node.js and browser JavaScript because that is where this bug lives most often.

Example one — make the backend tell you the real reason instead of just "401 Unauthorized."

```js
// middleware/auth.js — Express example that logs the why
import jwt from 'jsonwebtoken';

export function auth(req, res, next) {
  const token = req.cookies?.accessToken || bearer(req);

  if (!token) {
    // This is the cookie-not-sent case — check DevTools Application > Cookies
    req.log.warn({ reason: 'missing_token', path: req.path });
    return res.status(401).json({ reason: 'missing_token' });
  }

  try {
    // Use a shared secret from your secret manager, not a per-pod env typo
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      clockTolerance: 5, // small grace for clock skew, in seconds
    });
    req.user = payload;
    return next();
  } catch (err) {
    // err.name is 'TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'
    // Logging name + message + jti + exp is what ends the guessing
    const decoded = jwt.decode(token) || {};
    req.log.warn({
      reason: err.name,
      message: err.message,
      jti: decoded.jti,
      exp: decoded.exp,
      iat: decoded.iat,
      kid: decoded.kid,
      path: req.path,
    });
    return res.status(401).json({ reason: err.name, message: err.message });
  }
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}
```

Example two — decode the token the browser actually sent, on your machine, without needing the secret.

```js
// scripts/decode-token.js — run with: node scripts/decode-token.js <jwt>
const token = process.argv[2];
if (!token) { console.error('usage: node decode-token.js <jwt>'); process.exit(1); }

// decode without verifying — safe for inspection, not for auth
const [, payloadB64] = token.split('.');
const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

const now = Math.floor(Date.now() / 1000);
console.log(payload);
console.log(`now: ${now}  exp: ${payload.exp}  diff: ${payload.exp - now}s`);
console.log(payload.exp < now ? 'EXPIRED' : 'still valid');
if (payload.nbf && payload.nbf > now) console.log(`NOT YET VALID — nbf is ${payload.nbf - now}s in the future — clock skew?`);
```

Example three — set the cookie so it is actually sent in production. The wrong line is the bug you are hunting for.

```js
// server/login.js — the Set-Cookie that works cross-subdomain over HTTPS
res.cookie('accessToken', accessToken, {
  httpOnly: true,        // browser JS cannot read it — XSS cannot steal it
  secure: true,          // only sent over HTTPS — if you test over http, it vanishes
  sameSite: 'none',      // required when frontend is on app.example.com and API on api.example.com
  domain: '.example.com',// visible to app and api subdomains — omit if same-origin only
  path: '/',             // visible to every route — '/api' would hide it from '/checkout'
  maxAge: 15 * 60 * 1000,// 15 minutes — match the JWT exp
});

// Common bug: sameSite 'lax' + cross-site fetch without credentials
// Frontend must also do: fetch('/api/me', { credentials: 'include' })
```

Example four — handle refresh correctly and survive the rotation race with a grace window and reuse detection.

```js
// server/refresh.js — rotation with reuse detection
// refreshTokens table: { jti, userId, familyId, expiresAt, revokedAt }
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

export async function refresh(req, res) {
  const oldToken = req.cookies?.refreshToken;
  if (!oldToken) return res.status(401).json({ reason: 'missing_refresh' });

  const decoded = jwt.verify(oldToken, process.env.REFRESH_SECRET);
  const stored = await db.refreshTokens.findOne({ jti: decoded.jti });

  if (!stored) {
    return res.status(401).json({ reason: 'unknown_jti' });
  }
  if (stored.revokedAt) {
    // Token was already rotated — someone reused an old token. Revoke the family.
    await db.refreshTokens.updateMany(
      { familyId: stored.familyId },
      { $set: { revokedAt: new Date() } }
    );
    res.clearCookie('refreshToken'); res.clearCookie('accessToken');
    return res.status(401).json({ reason: 'reuse_detected' });
  }

  // Allow a 10-second grace where the old token still looks valid
  // so a parallel request that started just before rotation does not get killed
  // (alternative: frontend queues refresh so only one call ever refreshes)
  const familyId = stored.familyId;
  const newJti = randomUUID();

  await db.refreshTokens.updateOne({ jti: decoded.jti }, { $set: { revokedAt: new Date() } });
  await db.refreshTokens.insertOne({ jti: newJti, userId: decoded.sub, familyId, expiresAt: futureDate(30) });

  const accessToken = signAccess({ sub: decoded.sub, jti: randomUUID() });
  const refreshToken = jwt.sign({ sub: decoded.sub, jti: newJti, familyId }, process.env.REFRESH_SECRET, { expiresIn: '30d' });

  res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'none', domain: '.example.com', path: '/' });
  res.cookie('accessToken', accessToken, { httpOnly: true, secure: true, sameSite: 'none', domain: '.example.com', path: '/' });
  return res.json({ ok: true });
}
```

Example five — tell other tabs right away when one tab logs out.

```js
// frontend/auth-sync.js — keep tabs in sync
const channel = new BroadcastChannel('auth');

export function notifyLogout() {
  localStorage.removeItem('accessToken');
  channel.postMessage({ type: 'logout' });
}

channel.onmessage = (e) => {
  if (e.data.type === 'logout') {
    // Do not try to refresh — just redirect. The family is gone.
    window.location.href = '/login?reason=logged_out_elsewhere';
  }
};

// Fallback for browsers without BroadcastChannel
window.addEventListener('storage', (e) => {
  if (e.key === 'accessToken' && e.newValue === null) {
    window.location.href = '/login?reason=logged_out_elsewhere';
  }
});
```

When you run through these five, the bug stops being random. The log says `TokenExpiredError` every 5 minutes — fix the refresh. The log says `JsonWebTokenError: invalid signature` on 30 percent of pods — fix the secret. The Network tab shows no Cookie header at all — fix SameSite, Secure, Domain, or `credentials: include`. The refresh log shows `reuse_detected` bursts on double-click — fix the race.

## 5. Interview Questions — All of Them, Done Properly

**Q: Users report random logouts. Where do you start?**

Start where evidence is cheapest. First ask how often it happens and who it affects — all users or some, all routes or some, after a fixed time or at random clicks. Then open three windows at once. One, server logs filtered to 401s, grouped by `reason` — do you see `TokenExpiredError` clustering every 5 minutes, `invalid signature` on certain pods, or `missing_token` with no cookie header. Two, decode the JWT the client sent on a failed request and read `exp`, `iat`, `nbf`, and `kid` yourself. Three, open DevTools on a reproducing session and check Application > Cookies to see if the cookie was set with the right Domain, Path, Secure, and SameSite, and Network > Request Headers to see if it was sent. That triangle — server reason, token content, browser view — tells you in minutes whether the browser lost the credential, hid it, or the server rejected it.

**Q: The token looks valid but the server returns 401. What are the likely causes?**

Three usual suspects. One, the token expired and the clock you are reading it with is not the server clock — check `exp` against the server's `Date` header plus any `clockTolerance`. Two, the signature does not match — the token was signed with a different secret or private key than the verifier knows, which happens with per-pod env mismatches or a rolling deploy where only half the fleet knows the new secret. Three, the token was revoked — the user changed their password, logged out elsewhere, or refresh reuse detection invalidated the whole family, but the API still reports it as a generic 401. Logging `jti` and `kid` on every auth failure makes this obvious.

**Q: What cookie settings silently cause logouts and how do you spot them?**

`Secure` means the browser only sends the cookie over HTTPS. Test on `http://localhost` and it simply disappears. `SameSite=Lax` means the browser does not send the cookie on cross-site POSTs and on many cross-site fetches. If your frontend is `app.example.com` and your API is `api.example.com`, that is cross-site, so you need `SameSite=None; Secure` and `fetch(url, { credentials: 'include' })` with CORS `Access-Control-Allow-Credentials: true` and a specific origin, not `*`. `Domain` controls which subdomains see the cookie — `Domain=api.example.com` hides it from `app.example.com`, while `Domain=.example.com` shares it. `Path=/api` hides it from routes outside `/api`. You spot it because the cookie shows in Application > Cookies but is absent from the Network > Request Headers on the failing call, and the server logs `missing_token` even though login just set the cookie.

**Q: What is refresh token rotation and why does it cause "random" logouts on fast clicks?**

Rotation means each refresh token can be used once. You present `refresh_1`, the server invalidates `refresh_1` and returns `refresh_2`. It is a security win — a stolen token is only useful until the real user refreshes. The race is when two parallel requests both see an expired access token and both try to refresh at the same time with the same `refresh_1`. The first wins and `refresh_1` is now revoked. The second looks like token reuse, which many servers treat as theft and revoke the entire family. The user gets logged out for clicking fast. The fixes are to make the frontend queue refresh so only one request refreshes and the others wait for the new token, and to make the backend either allow a short grace window where `refresh_1` is still accepted for a few seconds or return a clear `reuse_detected` reason so you can distinguish theft from a race.

**Q: Why would logouts happen only behind a load balancer or only after a deploy?**

Because different servers disagree on how to verify. Classic case is `JWT_SECRET` set as a different value on two EC2 instances or two Kubernetes pods — server A signs a token, the load balancer sends the next request to server B, signature fails, 401. You see it as roughly 1 in N requests failing where N is the number of mismatched servers. After a deploy it happens because you rotated the secret and old tokens signed with the old secret are now invalid everywhere. The fix is to store the secret in one place like AWS Secrets Manager or Vault and inject the same value to every instance, or move to asymmetric JWTs where you sign with a private key and verify with a public JWKS, and keep two keys valid during rotation. Also ensure sticky sessions are not hiding the bug in staging where you only run one server.

**Q: How do clock skew and multiple tabs cause logouts?**

Clock skew makes a valid token look expired or not yet valid. If a server is two minutes fast, a 5-minute access token is already almost expired when it arrives. You see `TokenExpiredError` or `NotBeforeError` even though your laptop clock says the token has minutes left. Fix it with NTP sync on every server and a small `clockTolerance` like 5 seconds, not 5 minutes. Multiple tabs cause a coordination problem. Tab A logs out and removes the token, tab B still thinks it is logged in until its next API call fails. Or both tabs refresh at once and trigger the rotation race above. Fix it by broadcasting `logout` and `token_refreshed` events across tabs with `BroadcastChannel` or the `storage` event so every tab updates at once.

**Q: What do you put in place after the fix so this never silently breaks again?**

Make the 401 honest and measured. Return and log a distinct `reason` for every auth failure — `missing_token`, `expired`, `nbf_in_future`, `invalid_signature`, `revoked`, `reuse_detected` — with `jti`, `familyId`, and `userId` when you have them. Alert on spikes in 401 rate grouped by reason, especially `reuse_detected` and `invalid_signature`. Add a health check that verifies all API pods share the same `kid` and that NTP is synced. Keep your token lifetimes explicit and tested — write one integration test that logs in, waits for access expiry, fires two parallel refreshed requests, and asserts only one refresh is counted and the user stays logged in. That test would have caught most of these bugs before users did.

## 6. The Traps — What Goes Wrong in Production

The first trap is returning generic 401s. If every auth failure is just `401 Unauthorized` with no reason, you cannot tell expiry from signature mismatch from revocation. You will chase the wrong fix for days. Log and return a specific reason and you cut the search space by three quarters.

The second trap is trusting your laptop clock. You decode the token, see `exp` is still in the future on your machine, and conclude the token is valid. But the server that rejected it has a different clock. Always compare `exp` to the server's time, not yours, and check NTP on the fleet.

The third trap is testing on `localhost` over HTTP and shipping `Secure` cookies. On your machine with `Secure: true` and `http://localhost`, the browser never stores the cookie. It looks like login succeeded but the next request has no credential. Test with HTTPS locally or gate `secure` on `NODE_ENV`.

The fourth trap is assuming `localStorage` is durable. Extensions, third-party cookie blockers, Safari ITP, and users clearing site data can erase it at any time. If you must store tokens in JS-accessible storage, expect loss and handle it with a clear "session expired, please log in" rather than a blank screen. Prefer `httpOnly` cookies for tokens so JS cannot accidentally delete them.

The fifth trap is fire-and-forget refresh. Three parallel API calls all get 401 and each fires its own refresh. The second and third look like reuse attacks. Queue refresh on the frontend — the first caller refreshes, the others await the same promise — or make the backend tolerant with a short reuse grace window.

The sixth trap is rotating `JWT_SECRET` without overlap. You change the env var, do a rolling deploy, and every user with a token signed by the old secret is logged out at once. Support calls this "random." It is not random, it is a forced global logout. Keep two secrets or two keys valid during rotation and include a `kid` in the JWT header so verifiers know which key to try.

The seventh trap is ignoring the load balancer. You debug on one server and everything passes. In production with four servers, one has a stale secret and fails a quarter of requests. Include the pod or instance id in your auth failure log so you can see if one node is responsible for all the failures.

The eighth trap is putting tokens in the wrong cookie scope. Setting `Path=/api` or `Domain=api.example.com` from an API that also serves the frontend on `app.example.com` hides the cookie from the very requests that need it. Keep `Path=/` and set `Domain` deliberately, and verify in DevTools that the cookie is actually attached to the failing request.

## 7. Compare With Related Concepts

**JWT stateless logout vs server-side session logout.** A JWT is self-contained — the server can tell it is valid by checking the signature and `exp` without looking anything up. That is fast, but logout is harder because there is nothing to delete on the server. You have to either wait for the short access token to expire or keep a denylist of revoked `jti`s in Redis until their `exp` passes. A server-side session, like Express `express-session` with Redis, is the opposite. The cookie is just an id, and the server looks up the session on every request. Logout is one `DEL` in Redis and the user is instantly out, but every request pays a lookup. The rule is simple. Use JWTs when you need stateless reads across many services and can live with a brief window where a logged-out token still works until its short expiry or denylist catches it. Use server sessions when instant, guaranteed revocation matters more than shaving a cache lookup.

**`localStorage` vs `httpOnly` cookie for tokens.** `localStorage` is convenient — JS can read it and attach `Authorization: Bearer` headers — but it is readable by any JS on the page, so XSS steals it, and it is cleared by storage wipes and not sent automatically. An `httpOnly` cookie cannot be read by JS, is sent automatically, and respects Secure and SameSite, but you must configure those correctly or the browser will hide it, and you must handle CSRF with `SameSite` and optionally a double-submit token. The rule is to prefer `httpOnly` + `Secure` + `SameSite` cookies for tokens in browser apps and keep `localStorage` for non-sensitive UI state.

**Refresh token rotation vs long-lived refresh token.** A non-rotating refresh token stays valid for days until it expires. Simpler, but if stolen it is useful for days. Rotation gives each use a new token and invalidates the old one, so theft is caught quickly via reuse detection, but you must handle the parallel-request race or users get logged out for innocent double clicks. The rule is to rotate when you need theft detection, but pair it with a frontend refresh queue and a short server grace window.

**401 vs 403 — both log users out in bad frontend code but mean different things.** 401 means "I do not know who you are — no valid credential." You should try to refresh or redirect to login. 403 means "I know who you are and you are not allowed." Retrying login will not help. If your interceptor logs the user out on any 401 or 403, a permissions bug will look like a session bug. Handle 401 with refresh logic and handle 403 with an "access denied" message.

## 8. 🧠 The Memory Hook

Random logouts mean the wristband, the clock, the rule, and the lock disagreed — so read all four: decode the token to see the wristband, check the server time to see the clock, open DevTools to see the cookie rule, and check which server checked the signature — and whatever story those four tell together is the real reason.
