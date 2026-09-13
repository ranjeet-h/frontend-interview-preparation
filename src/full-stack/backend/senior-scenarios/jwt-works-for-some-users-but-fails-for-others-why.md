# JWT Works for Some Users but Fails for Others — Why

## 1. The Real-World Problem — When You Actually Hit This

It is Friday at 4pm. Your auth has been live for months. Then support pings you: "About 15% of users keep getting logged out. Same endpoint, same app version, same code." You try it on your laptop — works perfectly. You try with your own account on staging — works perfectly. Logs show a mix of `jwt expired`, `invalid signature`, and `invalid audience` — but only for some users, not all.

This is what makes JWT selective failures so nasty. If auth was completely broken, you would find it in five minutes. When it works for most people and fails for a few, the bug is not in the code path — it is in the assumptions around the token. Different users have tokens minted at different times, with different keys, different sizes, different clocks, and different browsers sending them differently. A senior debug starts from that: do not ask "is JWT broken?" Ask "what is different about the failing users' tokens, clocks, keys, and request transport compared to the working ones?"

## 2. The Analogy — Make the Mechanic Obvious

Think of a JWT like a festival wristband.

The wristband has three parts printed on it. The top strip says what material it is made of — paper, plastic, fabric. That is the header, it says `alg: RS256` or `HS256`. The middle section has your name, what day it expires, which stage you can access, and which venue issued it. That is the payload with claims like `exp`, `nbf`, `iss`, `aud`, and your permissions. The bottom has a hologram stamp that only the festival office can make. That is the signature.

At the gate, the checker does not call the office. They just look at the wristband and check: is the material one we accept? Can I verify the hologram with the stamp I have today? Is the expiry date still in the future according to my watch? Is the venue name on the wristband the same as this gate? Is the wristband small enough to fit through the scanner?

If any single check fails, you are turned away — even though the wristband looks fine to you and worked at a different gate yesterday. Selective JWT failures are exactly this: the token is not globally valid or invalid, it is valid against one set of checks and invalid against another. Your job is to figure out which check is failing and for whom.

In our analogy, the festival material is the algorithm, the hologram key is the secret or public key, your watch versus the printed expiry is clock skew and `exp`/`nbf`, changing the stamp overnight is secret rotation, a wristband covered in extra badges that no longer fits through the scanner is token size, keeping the wristband in your pocket where anyone can steal it versus locked on your wrist is storage, the rule about which gates allow which wristbands through is CORS, and the venue name printed on it is issuer and audience.

## 3. The Full Explanation — How It Actually Works

A JWT is not encrypted. It is just `base64url(header) + "." + base64url(payload) + "." + signature`. Anyone can read the header and payload. The only thing that proves it is real is the signature, which is created with a secret or private key on the auth server and verified with that same secret or the matching public key on the API server.

When a request comes in, the server does this in order. You need to know this order because different users fail at different steps:

First it parses the token and looks at the header. It checks the `alg` field. This says which algorithm was used to make the signature. The server must only accept algorithms it actually supports. If the token says `RS256` but the server is configured with an `HS256` secret, verification will always fail. If the server accidentally accepts `none`, an attacker can forge tokens. So the first selective failure is alg mismatch. Users whose tokens were minted by an older service still using `HS256` will fail against a new service that only knows `RS256`, while newer users pass.

Next it finds the right key to verify with. With symmetric `HS256`, there is one shared secret. With asymmetric `RS256` or `ES256`, there are many public keys, picked by the `kid` (key id) in the header. The server looks up `kid` in a JWKS — a small JSON file of public keys. If you rotated keys last night and some users still hold tokens signed by the old key whose `kid` you already deleted, those users get `invalid signature` while users who logged in after rotation get a new `kid` and pass. This is the most common "some users" cause after a deploy.

Then it verifies the cryptographic signature. If that passes, it checks time. Two claims matter here. `exp` is when the token expires. `nbf` is "not before" — the token is not valid before that time. Both are compared against the server's clock, not the user's device. If the server's clock is 90 seconds ahead, a token that expires in 60 seconds is already expired on arrival. If a user's token has `nbf` set to now but the auth server's clock is slightly ahead of the API server's clock, that token looks like it is from the future. We fix this with a small leeway, usually 30 to 60 seconds, where we allow `exp + leeway` and `nbf - leeway`. Without leeway, users whose requests hit a server with a skewed clock fail, and it looks random.

Then it checks `iss` (issuer — who made the token) and `aud` (audience — who the token is for). These are strings like `iss: "https://auth.yourapp.com"` and `aud: "api.yourapp.com"`. If your app has two environments, or two audiences like web and mobile, or you changed issuer URL from `http` to `https`, tokens minted for the old value fail the check while new ones pass. This also bites in multi-tenant systems where `aud` includes tenant id.

Then transport checks happen, and they also look like auth failures but are not. The API may never even see the token. If the frontend stores the JWT in `localStorage` and sends it as `Authorization: Bearer <token>`, the browser must be allowed to send that header — the server must return `Access-Control-Allow-Headers: Authorization` and handle the OPTIONS preflight. If CORS is misconfigured, the browser drops the header silently for cross-origin requests. Users on `app.yourapp.com` talking to `api.yourapp.com` fail, while users on `localhost` during development or on same-origin pass. Same for cookies: if you store the JWT in an `httpOnly` cookie with `SameSite=Lax` and `Secure`, cross-site POSTs will not send it, and Safari's stricter third-party cookie handling will fail while Chrome passes.

Finally there is size. A JWT is sent on every request. If you stuff it with permissions, groups, or feature flags, it grows. Browsers and servers have header limits around 8KB, and cookies have a 4KB limit. A user with 200 permissions gets a 6KB token that trips `431 Request Header Fields Too Large`, while a normal user with 5 permissions has a 800 byte token and passes. This is another classic "works for some roles but not others" pattern.

So selective failure is not one bug. It is a checklist: whose token, which key, what time, what audience, what size, and how it was sent.

## 4. See It In Practice — Real Code or Queries

Here is what proper verification looks like in Node.js. The important parts are the options you pass, not just calling verify.

```js
// verify.js — runs on your API server
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// For RS256 we fetch the public key that matches the token's kid
const client = jwksClient({
  jwksUri: 'https://auth.yourapp.com/.well-known/jwks.json',
  cache: true,
  rateLimit: true,
});

function getKey(header, callback) {
  // header.kid tells us which key signed this specific user's token
  // If this kid was rotated out, this is where old users fail
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

export function verifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        // Only accept the algorithm you actually use.
        // Without this, a token with alg:none could slip through on some libs.
        algorithms: ['RS256'],

        // Small leeway fixes clock skew between auth server and API server.
        // Without it, a token that expires right now fails for users on a fast clock.
        clockTolerance: 60, // seconds

        // These two are why some tenants or envs fail while others pass
        issuer: 'https://auth.yourapp.com',
        audience: 'api.yourapp.com',
      },
      (err, payload) => {
        if (err) {
          // Log the exact reason — do not just return 401
          // err.name is TokenExpiredError, JsonWebTokenError, NotBeforeError
          console.warn('jwt verify failed', {
            reason: err.name,
            message: err.message,
            // header.kid and exp help you spot rotation and clock issues
          });
          return reject(err);
        }
        resolve(payload);
      }
    );
  });
}
```

Handling rotation safely — keep old keys readable for a while:

```js
// auth-service — when you rotate, do not delete the old key immediately
// publish both keys in JWKS with different kids for a few days
{
  "keys": [
    { "kid": "2024-08-a", "kty": "RSA", "n": "...old key...", "alg": "RS256" },
    { "kid": "2024-08-b", "kty": "RSA", "n": "...new key...", "alg": "RS256" }
  ]
}
// mint new tokens with kid 2024-08-b, but keep verifying 2024-08-a
// until the longest-lived token with that kid has expired
```

Frontend transport — why CORS and storage matter:

```js
// frontend — sending the token
// Option A: Authorization header (most common for SPAs)
fetch('https://api.yourapp.com/orders', {
  headers: {
    Authorization: `Bearer ${token}`, // must be allowed by CORS
  },
});

// Option B: httpOnly cookie — browser sends it automatically, JS cannot read it
// Set-Cookie: jwt=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600
fetch('https://api.yourapp.com/orders', {
  credentials: 'include', // without this, cross-origin cookies are not sent
});
```

```js
// Express — CORS must explicitly allow the Authorization header
import cors from 'cors';

app.use(cors({
  origin: 'https://app.yourapp.com',
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'], // miss this and browser strips the header
}));
```

Quick check for token size issues:

```js
// middleware — catch oversized tokens before they waste work
app.use((req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
  if (token.length > 4000) {
    console.warn('token too large', { userId: req.user?.sub, bytes: token.length });
    // this user probably has too many claims — trim permissions, use lookup instead
  }
  next();
});
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Users report JWT works for some people but not others. Where do you start?**

You do not guess, you narrow. First, find what the failing users have in common. Is it the same error message? Open logs and group by verification error: `TokenExpiredError` means clock or exp issue, `invalid signature` means key or alg, `invalid audience` means iss/aud. Then compare a working token and a failing token decoded on jwt.io — look at `kid`, `alg`, `iss`, `aud`, `exp`, `nbf`, and raw size. Check when failing tokens were minted — right before a deploy or rotation? Check where the request came from — same origin or cross-origin? That table of differences usually points to one row in the checklist above. Then reproduce with curl using the exact failing token, not a fresh one from your account.

**Q: What is clock skew and how do exp and nbf cause selective failures?**

Every JWT has `exp` (expiry) and optionally `nbf` (not before), both as seconds since epoch in UTC. The API server compares them against its own clock. If the API clock is ahead, tokens look expired early. If the auth server clock is ahead of the API clock, a newly minted token can have `nbf` in the API's future, so it is rejected as "not yet valid." This only hits users whose tokens are near the boundary — most users with fresh tokens are fine. The fix is to not rely on perfectly synced clocks: set `clockTolerance` or `leeway` of 30 to 60 seconds on verification, and keep NTP synced on all servers. Also keep token lifetime reasonable — a 15 minute access token with skew of 60 seconds is fine, a 10 second token with 90 seconds skew is not. Never compare against the user's device clock.

**Q: How does an algorithm mismatch cause it to work for some users?**

The header says `alg`. If your auth service at one point minted `HS256` tokens and you later moved to `RS256` without migrating, old users still hold `HS256` tokens. A server configured to only verify `RS256` will reject them with `invalid algorithm` or `invalid signature`, while new users pass. The scarier version is the server that does not whitelist algorithms — an attacker sends `alg: none` and some libraries will accept it. The correct fix is to always pass `algorithms: ['RS256']` explicitly on verify, and during a migration accept both for a window while you force re-login or rotation.

**Q: Why does secret or key rotation break some users and not others?**

With `HS256` there is one secret. If you change it, every existing token signed with the old secret becomes invalid instantly. With `RS256` you have many public keys identified by `kid`. If you publish a new key and start minting tokens with a new `kid`, but remove the old `kid` from JWKS before all old tokens expire, any user who has not refreshed since rotation fails. The safe way is to publish both keys, mint with the new one, keep verifying with both until the max lifetime of old tokens has passed, then remove the old key. On the frontend, rotation also means the silent refresh or retry logic must handle a 401 by fetching a new token, not by showing a hard logout for old sessions.

**Q: Why does token size cause selective failures?**

A JWT is sent on every request in a header or cookie. Headers have server limits, often 8KB, and cookies have a 4KB limit per cookie. If you put roles, permissions, or org memberships inside the token, an admin with many permissions gets a much larger token than a regular user. Once it crosses the limit, the server returns `431` or the browser silently drops the cookie, and only that role fails. The fix is to keep the JWT small — put only `sub`, `exp`, `iss`, `aud` inside, and look up permissions from a cache or DB on the server side. If you must include claims, compress the shape and avoid duplicate data.

**Q: Where should the frontend store the JWT, and why does storage choice cause some users to fail?**

Two real options. `localStorage` plus `Authorization: Bearer` header is simple but readable by any JavaScript, so an XSS bug means token theft. `httpOnly` cookie is not readable by JavaScript, so XSS cannot steal it, but now the browser controls when it is sent — `SameSite`, `Secure`, and third-party cookie blocking apply. Safari's Intelligent Tracking Prevention is stricter than Chrome, so a cookie that works in Chrome can be blocked in Safari, making it look like "fails for some browsers." The rule is: if your API and app are same-site, `httpOnly` cookie with `SameSite=Lax` and `Secure` is the safest default. If they are cross-site or you need mobile clients, use Authorization header with short-lived access token in memory and a httpOnly refresh token. Never store a long-lived JWT in localStorage without a strong reason.

**Q: How does CORS make a valid JWT fail for some users?**

CORS only applies to browser cross-origin requests. If your frontend is at `app.yourapp.com` and API at `api.yourapp.com`, that is cross-origin. The browser will not send `Authorization` unless the server's CORS response says `Access-Control-Allow-Headers: Authorization` and the preflight OPTIONS succeeds, and it will not send cookies unless `fetch` uses `credentials: include` and the server returns `Access-Control-Allow-Credentials: true` with a specific origin, not `*`. If CORS is misconfigured, the browser strips the header before the request even reaches your verify code, so the server sees no token and returns 401. Users testing on same-origin localhost never hit CORS, so it works for devs but fails in production for real users. Check the network tab: if you see a failed OPTIONS request or no Authorization header on the wire, it is CORS, not JWT.

**Q: What are issuer and audience, and when do they cause selective breakage?**

`iss` says who issued the token, like `https://auth.yourapp.com`. `aud` says who it is for, like `api.yourapp.com` or `mobile`. The verifier checks that both match exactly. If you changed your issuer URL, added a trailing slash, moved from `http` to `https`, or have separate audiences for web and mobile, tokens minted for the old value fail while new ones pass. In multi-tenant apps where `aud` includes tenant id, a user switched to a different tenant will send the wrong audience. The fix is to verify both fields explicitly and keep the expected values in config per environment, not hardcoded. Log the expected versus actual on failure so you can spot a one-character mismatch.

## 6. The Traps — What Goes Wrong in Production

The first trap is treating all 401s as one bug. A JWT can fail for eight different reasons, and the status code is the same. If your server just returns `401 Unauthorized` with no error name, you are blind. Always log `err.name` from the verify library — `TokenExpiredError`, `NotBeforeError`, `JsonWebTokenError` with message `invalid signature` or `invalid audience` — and return a specific error code to yourself in logs even if the client only sees 401. That one log line turns a mystery into a checklist.

The second trap is not whitelisting algorithms. Some libraries default to accepting any algorithm the token claims. If you call verify without `algorithms: ['RS256']`, a token with `alg: none` or `alg: HS256` can be crafted to pass against an RS256 key. The selective part is that only an attacker or a misconfigured issuer hits this, so normal users pass and you think it is fine. Always pin the algorithm.

The third trap is rotating keys without an overlap window. You push a new secret or new `kid`, delete the old one, and forget that access tokens live for 15 minutes and refresh tokens for days. Every user who has not refreshed since deploy gets logged out at once, but because refresh is staggered, it looks like random failures over an hour. Keep both keys valid until the longest old token expires, then remove.

The fourth trap is ignoring leeway. Teams set `exp` to 5 minutes for security, then run API servers whose clocks drift by a minute. Near the boundary, requests fail. Adding `clockTolerance: 60` is not weakening security in any meaningful way, it is acknowledging that two clocks will never be perfectly in sync.

The fifth trap is bloating the token. It is tempting to put roles, teams, and feature flags inside the JWT so you do not need a DB lookup. One admin with 150 groups gets a 7KB token that exceeds header limits, while 95% of users are fine. Keep the JWT minimal and fetch authorization details server-side or keep a short cache.

The sixth trap is picking the wrong storage and blaming JWT. Storing a JWT in `localStorage` and then being surprised by XSS theft, or storing it in a cookie and being surprised that cross-origin requests do not send it, are both storage problems that surface as auth failures for some browsers. Choose one story: same-site app gets httpOnly cookie, cross-site or mobile gets Authorization header with memory storage plus httpOnly refresh token, and test in Safari, not just Chrome.

The seventh trap is forgetting CORS and cookie attributes. Missing `Access-Control-Allow-Headers: Authorization`, missing `credentials: include`, setting `SameSite=Strict` so the token is not sent on the first navigation, or setting `Secure` on http localhost so the cookie is never set locally — all of these look like valid-token 401s but the token never arrived. Check the request headers on the wire before blaming verification.

The eighth trap is hardcoding `iss` or `aud`. An auth URL with a trailing slash in one environment and without in another, or an audience that changed from `api` to `api.yourapp.com`, will pass in staging and fail in production for tokens minted before the change. Put expected values in environment config and log mismatches explicitly.

## 7. Compare With Related Concepts

**JWT versus opaque session token.** A JWT is self-contained — the server can verify it without a DB lookup, which is fast but means you cannot revoke it before `exp` without a denylist. An opaque session token is just a random string, the server must look it up in Redis or a DB, which is one extra hop but revocation is instant. Use JWT when you need stateless verification across many services and revocation delay is acceptable. Use opaque sessions when instant logout and simple revocation matter more than avoiding a lookup. Selective failure wise, JWT fails on key, clock, and claims, opaque fails on store availability and replication lag.

**HS256 versus RS256.** HS256 uses one shared secret to both sign and verify. Every API server needs the secret, and rotation invalidates all tokens at once. RS256 uses a private key to sign and a public key to verify. Only the auth service holds the private key, APIs hold public keys, and rotation can keep multiple public keys live via `kid`. Choose RS256 when multiple services verify tokens and you want clean rotation. Choose HS256 for a single service where sharing a secret is simple and you can handle the hard rotation cutover.

**JWT in Authorization header versus JWT in httpOnly cookie.** Header is explicit — JavaScript reads the token and sets the header, works cross-origin with CORS, but XSS can steal it. Cookie is automatic — browser sends it, JavaScript cannot read it, XSS is less useful, but CORS, SameSite, and third-party blocking control delivery. Use cookie when frontend and API are same-site and you want XSS protection. Use header when you have cross-site or native clients and you handle XSS with CSP and sanitization.

**JWT format versus OAuth2 flow.** JWT is a token format. OAuth2 is a flow for getting tokens. You can have OAuth2 with opaque tokens or with JWT access tokens. Do not compare "JWT vs OAuth." The real question is whether the JWT was obtained through a proper OAuth2 flow with refresh tokens and scopes, or just minted by a login endpoint. OAuth2 adds the safe rotation, scoping, and audience handling that makes selective failures less likely.

## 8. 🧠 The Memory Hook

A JWT is a wristband with a hologram, an expiry time, and a venue name. If it works for some guests and not others, do not blame the wristband — check which check failed: whose watch is fast, whose venue name changed, whose stamp is old, and whether the wristband even made it through the gate.
