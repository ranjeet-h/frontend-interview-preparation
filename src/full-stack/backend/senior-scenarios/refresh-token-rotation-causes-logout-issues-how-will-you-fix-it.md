# Refresh Token Rotation Causes Logout Issues — How Will You Fix It

## 1. The Real-World Problem — When You Actually Hit This

Your app worked perfectly before you turned on refresh token rotation. Then on a random Tuesday afternoon, support tickets start coming in: "I was just browsing and got kicked out." Not everyone, not consistently, just sometimes. You check the logs and see a weird pattern. A user loads their dashboard and the frontend fires four API calls at once. Their short-lived access token happens to be expired at that exact moment. All four calls get a 401, all four try to refresh at the same instant with the same refresh token, and only one succeeds. The other three fail because the token was already used. Your frontend sees those failures and assumes the session is dead, so it logs the user out. They re-login and it happens again later that day.

It gets worse if you added reuse detection too aggressively. One of those competing refreshes looks like a replay attack to your backend, so you do what the security guide told you to do: you revoke the entire token family. Now even the one that succeeded is dead. The user is definitely logged out and confused.

That is the moment this topic stops being theory. Rotation is supposed to make stolen tokens useless, but if you implement it naively it creates a concurrency bug that punishes honest users more than attackers.

## 2. The Analogy — Make the Mechanic Obvious

Think of a coat check at a busy museum.

You hand your coat in and get paper ticket #42. When you want to step out and come back, you hand ticket #42 to the clerk, they give you your coat plus a brand new ticket #43, and they tear up #42 so no one can reuse it. Next time you come back, you use #43 to get #44. That tearing-up-and-replacing is rotation. The security win is clear: if someone stole a photo of your old ticket #42, it is already shredded when they try to use it, and the clerk knows something is wrong.

Every ticket has two numbers on it. One is its own serial number, like #42 — that is the `jti` (JWT ID). The other is the coat's family number, like coat family F-99, that ties every ticket for that same coat together across exchanges. That is the `familyId`. As long as you use tickets in order, F-99 stays valid and you keep getting new serial numbers.

Now imagine you have three friends and you all photocopied ticket #42 before anyone used it, then all four of you walk up to four different clerks at the exact same second and hand over copies of #42. The first clerk processes #42, shreds it, and hands back #43. The other three clerks look at their copy of #42, see it was already shredded, and say "invalid." If those clerks are paranoid, they do not just reject the copy — they call security and void the entire F-99 family, assuming someone stole the ticket. That is reuse detection killing the family because of a race, not a real theft.

The fix is a grace window. The head clerk tells the team: "If someone hands in a recently-shredded ticket within 10 seconds of when it was shredded, and it came from the same person, do not call security. Just hand them the same #43 you already issued. It is probably just a photocopy race." That small window is what stops honest parallel requests from looking like an attack, while still catching a real thief who tries to use #42 an hour later from a different device.

The other decision is where you keep the ticket. You can keep it folded in your pocket where anyone who bumps into you can steal it — that is `localStorage`, accessible to any JavaScript on the page. Or you can keep it in a sealed pouch the museum staff holds and you can never open yourself — that is an `httpOnly` cookie, invisible to JavaScript but automatically sent with requests. XSS can reach the pocket, it cannot reach the pouch, but the pouch needs extra rules so someone does not trick you into handing it over (CSRF protection).

## 3. The Full Explanation — How It Actually Works

Refresh tokens exist because you do not want your access token to live long. An access token is a short-lived JWT, usually 5 to 15 minutes, that your API can verify without hitting a database. It is fast and stateless. A refresh token is a longer-lived credential, usually hours or days, that can mint new access tokens. Rotation says: every time you use a refresh token, you burn it and get a new pair.

Here is the flow step by step in plain language before we add the hard parts.

When the user logs in, you create a family for that session. You generate an access token with a `jti` and a refresh token with its own `jti` and a shared `familyId`. You store a hashed version of the refresh token in your database or Redis, tied to the user, the family, and an expiry. You never store the raw token, just like you never store a raw password. You send the refresh token to the browser as an `httpOnly`, `Secure`, `SameSite=Lax` (or Strict) cookie. The access token can be in memory on the frontend.

When the access token expires, the frontend calls `POST /auth/refresh`. You read the cookie, verify the JWT signature, hash it, look it up in storage, check that the family is not revoked and the `jti` is the current active one. If it is valid, you atomically mark that `jti` as used, create a new `jti` for the next refresh token, update the family pointer to the new `jti`, set the new refresh cookie, and return a new access token. The old refresh token is now single-use and dead.

That atomic step is the whole bug surface.

The race on parallel requests happens because browsers do not serialize refreshes. If three API calls fail with 401 at once, a naive axios interceptor fires three independent `POST /auth/refresh` requests with the same cookie. On the backend, three workers try to consume the same `jti`. Without protection, one wins, two get "token already used," the frontend gets two failures and logs out. The fix has two halves, one on each side.

On the frontend, you queue refresh. You keep a single in-flight promise. The first 401 creates `refreshPromise`. The other two requests wait on that same promise instead of firing new refreshes. When it resolves, they all retry with the new access token.

On the backend, you add a grace window, also called a reuse leeway. For a short period after rotation, say 5 to 30 seconds, you allow the old `jti` to be presented again, but you do not create a new family branch. You simply return the same new tokens you already issued. The implementation is: store `replacedBy` and `rotatedAt` on the old token row. If a request comes in with an old `jti` where `rotatedAt` is within the window and the family was not marked stolen, return the same new token set idempotently. After the window, reuse means theft.

Reuse detection is your theft alarm. If a refresh token that was already consumed outside the grace window is presented again, you assume it was stolen and replayed. An attacker got an old token and the legitimate user already rotated it. In that case you revoke the entire family — mark `family.revoked = true`, blocklist all `jti`s in that family, and force the user to re-authenticate. You also want observability here: log the `jti`, `familyId`, IP, and user-agent of both uses so you can distinguish a real theft from a clock-skew bug.

The `jti` family model makes both features possible. A family is one login session. It starts with one `jti`. Each rotation adds a child `jti` that points to its parent. Your storage table looks like `refresh_tokens(id, family_id, jti, user_id, parent_jti, hashed_token, expires_at, rotated_at, replaced_by, revoked)`. Index on `jti` for lookup and `family_id` for revocation. The current valid token in a family is the leaf `jti`. Everything else is either used and in grace or revoked. Cleanup is a background job that deletes expired families, because this table grows forever if you do not prune it.

Storage choices matter. You can store this table in Postgres for durability and query flexibility, or in Redis for speed and automatic TTL. Many teams do both: Postgres as source of truth, Redis as a hot cache and blocklist for revoked families so the refresh endpoint does not do a heavy query every time. Do not put this in an unsynced in-memory Map if you run more than one server, because another instance will not know a `jti` was already used. Hashing matters too. Store `SHA-256(refresh_token)` or similar, never plaintext. If your database leaks, plaintext refresh tokens are session hijacks.

The `httpOnly` cookie versus `localStorage` decision is a security tradeoff. `httpOnly` means JavaScript cannot read the cookie at all, so an XSS payload cannot steal it. That is the biggest reason to prefer it. The cost is you now need CSRF protection, because the browser sends cookies automatically. You handle that with `SameSite=Lax` or `Strict`, and for stricter setups a double-submit token or `Origin` check on the refresh endpoint. `localStorage` is the opposite: no CSRF problem because you attach the token manually via header, but any XSS can read it and exfiltrate it. Since XSS is more common and more damaging than CSRF, the industry default is `httpOnly` cookie for the refresh token plus short-lived access token in memory.

Revocation is the last piece. Rotation alone does not handle logout or password change. You need explicit revocation paths: on logout, delete or revoke the family for that device. On password change, revoke all families for that user. On admin "revoke sessions," revoke everything for that user. On detected reuse, revoke the family as described. Because access tokens are stateless JWTs, you cannot revoke them instantly without giving up stateless verification. The compromise everyone uses is keep access tokens very short, so a revoked user's access dies within minutes, and enforce revocation only on the refresh path. If you truly need instant access-token revocation, you need a Redis denylist of `jti`s checked on every request, which adds latency and cost and you only do it for sensitive apps.

Put together, a correct rotation system has five properties: single in-flight refresh on the client, atomic consume-and-rotate on the server, a short grace window for races, family-wide revocation on true reuse, and hashed stored tokens in `httpOnly` cookies with `SameSite` protection.

## 4. See It In Practice — Real Code or Queries

These examples are Node.js with Express and a Postgres-like store, but the pattern is the same in any stack. The important part is not the framework, it is the atomic check and the grace window.

Schema for the refresh family. Each row is one `jti`. One family per login session or per device if you support multiple devices.

```sql
-- Postgres: families and tokens
CREATE TABLE refresh_families (
  family_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  revoked_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  jti uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES refresh_families(family_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  parent_jti uuid REFERENCES refresh_tokens(jti),
  hashed_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  replaced_by uuid REFERENCES refresh_tokens(jti),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
-- Cleanup job: delete families where every token is expired
```

Issuing tokens on login. Note the `httpOnly` cookie and hashed storage.

```js
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signRefreshToken({ userId, familyId, jti }) {
  return jwt.sign({ sub: userId, familyId, jti }, process.env.REFRESH_SECRET, {
    expiresIn: '7d',
    jwtid: jti,
  });
}

function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.ACCESS_SECRET, { expiresIn: '10m' });
}

// POST /auth/login
app.post('/auth/login', async (req, res) => {
  const user = await verifyCredentials(req.body);
  const familyId = crypto.randomUUID();
  const jti = crypto.randomUUID();

  const refreshToken = signRefreshToken({ userId: user.id, familyId, jti });
  const accessToken = signAccessToken(user.id);

  await db.query(
    `INSERT INTO refresh_families (family_id, user_id) VALUES ($1, $2)`,
    [familyId, user.id]
  );
  await db.query(
    `INSERT INTO refresh_tokens (jti, family_id, user_id, hashed_token, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '7 days')`,
    [jti, familyId, user.id, hashToken(refreshToken)]
  );

  // Refresh in httpOnly cookie — JS cannot read it
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/auth/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ accessToken });
});
```

The refresh endpoint with atomic rotation, grace window, and reuse detection. The key is the transaction and the `FOR UPDATE` lock so two parallel requests cannot both consume the same `jti`.

```js
const GRACE_WINDOW_MS = 15_000; // 15 seconds is enough for parallel-request races

// POST /auth/refresh — reads refreshToken from httpOnly cookie
app.post('/auth/refresh', async (req, res) => {
  const rawToken = req.cookies?.refreshToken;
  if (!rawToken) return res.status(401).json({ error: 'missing_refresh_token' });

  let payload;
  try {
    payload = jwt.verify(rawToken, process.env.REFRESH_SECRET);
  } catch {
    return res.status(401).json({ error: 'invalid_refresh_token' });
  }

  const { sub: userId, familyId, jti } = payload;
  const hashed = hashToken(rawToken);

  // Use a transaction with row-level locks so parallel refreshes are serialized
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Lock the family row so two workers cannot rotate the same jti concurrently
    const familyRes = await client.query(
      'SELECT revoked FROM refresh_families WHERE family_id = $1 FOR UPDATE',
      [familyId]
    );
    if (familyRes.rows.length === 0 || familyRes.rows[0].revoked) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'family_revoked' });
    }

    const tokenRes = await client.query(
      'SELECT jti, hashed_token, expires_at, rotated_at, replaced_by FROM refresh_tokens WHERE jti = $1 FOR UPDATE',
      [jti]
    );
    if (tokenRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'unknown_jti' });
    }

    const row = tokenRes.rows[0];

    // Verify this raw token matches the stored hash — prevents forged jti
    if (row.hashed_token !== hashed) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'token_mismatch' });
    }
    if (row.expires_at < new Date()) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'refresh_expired' });
    }

    // Case 1: token was already rotated — is this a grace-window replay or a theft?
    if (row.rotated_at) {
      const ageMs = Date.now() - new Date(row.rotated_at).getTime();
      if (ageMs <= GRACE_WINDOW_MS && row.replaced_by) {
        // Grace window: return the same new tokens we already issued, do not create another branch
        const nextRes = await client.query(
          'SELECT jti FROM refresh_tokens WHERE jti = $1',
          [row.replaced_by]
        );
        // Re-issue same refresh cookie by re-signing, or fetch stored token — here we re-sign
        // In production you would cache the already-issued token pair briefly in Redis
        await client.query('COMMIT');
        const newAccessToken = signAccessToken(userId);
        // For grace path, re-sign the same replacement jti so the client still rotates cleanly
        // Alternative: return the exact same refresh token you issued 2 seconds ago from a short cache
        return res.json({ accessToken: newAccessToken, reusedGrace: true });
      }

      // Outside grace window, this is reuse — revoke the whole family
      await client.query(
        'UPDATE refresh_families SET revoked = true, revoked_reason = $2 WHERE family_id = $1',
        [familyId, 'reuse_detected']
      );
      await client.query('COMMIT');
      console.warn('refresh reuse detected', { familyId, jti, userId, ip: req.ip });
      return res.status(401).json({ error: 'reuse_detected_family_revoked' });
    }

    // Case 2: fresh token — rotate atomically
    const newJti = crypto.randomUUID();
    const newRefreshToken = signRefreshToken({ userId, familyId, jti: newJti });
    const newAccessToken = signAccessToken(userId);

    await client.query(
      `INSERT INTO refresh_tokens (jti, family_id, user_id, parent_jti, hashed_token, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')`,
      [newJti, familyId, userId, jti, hashToken(newRefreshToken)]
    );
    await client.query(
      `UPDATE refresh_tokens SET rotated_at = now(), replaced_by = $2 WHERE jti = $1`,
      [jti, newJti]
    );

    await client.query('COMMIT');

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.json({ accessToken: newAccessToken });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});
```

Frontend fix: single in-flight refresh promise so three 401s do not fire three refreshes. This is the change that stops most of the user-visible logouts even before the grace window.

```js
// api.js — axios-style interceptor with queued refresh
let refreshPromise = null;

async function refreshAccessToken() {
  // Only one network call even if 10 requests hit 401 at once
  if (!refreshPromise) {
    refreshPromise = fetch('/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('refresh_failed');
        const data = await res.json();
        // store new access token in memory (not localStorage)
        setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Response interceptor sketch
async function fetchWithAuth(url, opts = {}) {
  let res = await fetch(url, {
    ...opts,
    headers: { ...opts.headers, Authorization: `Bearer ${getAccessToken()}` },
  });
  if (res.status !== 401) return res;

  try {
    const newToken = await refreshAccessToken();
    // retry once with the new token
    return fetch(url, {
      ...opts,
      headers: { ...opts.headers, Authorization: `Bearer ${newToken}` },
    });
  } catch {
    // only now should you redirect to login
    redirectToLogin();
    throw new Error('session_expired');
  }
}
```

Logout and password-change revocation. These are explicit, not reuse-based.

```js
// POST /auth/logout — revoke just this device/family
app.post('/auth/logout', async (req, res) => {
  const rawToken = req.cookies?.refreshToken;
  if (rawToken) {
    try {
      const { familyId } = jwt.verify(rawToken, process.env.REFRESH_SECRET);
      await db.query('UPDATE refresh_families SET revoked = true, revoked_reason = $2 WHERE family_id = $1', [familyId, 'user_logout']);
    } catch {}
  }
  res.clearCookie('refreshToken', { path: '/auth/refresh' });
  res.json({ ok: true });
});

// On password change — revoke ALL families for the user
async function onPasswordChange(userId) {
  await db.query('UPDATE refresh_families SET revoked = true, revoked_reason = $2 WHERE user_id = $1 AND revoked = false', [userId, 'password_change']);
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: Why did enabling refresh token rotation suddenly cause random logouts?**

Because rotation makes each refresh token single-use. Before rotation, a refresh token could be used many times until it expired, so it did not matter if three parallel requests all tried to refresh with the same token. After rotation, the first request burns the token and gets a new one, and the other two are now presenting a dead token. Your backend treats them as invalid, the frontend sees failed refreshes, and it logs the user out. The fix is not to disable rotation, it is to serialize refresh on the frontend with a single in-flight promise and to add a short grace window on the backend so a just-rotated token can still be honored for a few seconds.

**Q: How do you prevent parallel requests from racing on the same refresh token?**

Two layers. On the client, you never fire multiple refresh calls. You keep a module-scoped `refreshPromise`. The first 401 creates it, every other concurrent 401 awaits it, and they all retry with the same new access token. On the server, you make the consume-and-rotate step atomic. You lock the family and token rows in a transaction (`SELECT ... FOR UPDATE`), mark the old token as rotated, and insert the new one in the same transaction. Without the lock, two workers can both read the token as unused and both try to rotate it, which either creates duplicate families or triggers false reuse detection.

**Q: What is reuse detection and when should you revoke the whole family?**

Reuse detection is the theft signal. If a refresh token's `jti` has already been marked as rotated, and someone presents it again outside the grace window, you assume the token was stolen. The legitimate user already moved forward to a new `jti`, so any reuse of an old `jti` means a second party has it. At that point you revoke the entire `familyId`, which invalidates every token in that session chain and forces re-login. You should not revoke on every reuse though. Within the grace window, you treat reuse as a benign race and return the already-issued new tokens instead of nuking the family. Revocation is for true replay, not for photocopy races.

**Q: What is the grace window and how long should it be?**

The grace window is a short period after you rotate a token during which you still accept the old `jti` idempotently. You store `rotatedAt` and `replacedBy` on the old row. If the old `jti` arrives again and `now - rotatedAt` is less than the window, you return the same new token pair you already issued instead of creating a new branch or revoking. This handles parallel requests that were in flight before the first rotation completed. Five to thirty seconds is typical. Ten to fifteen seconds covers slow networks without giving an attacker much extra time. Longer than thirty seconds weakens the theft detection benefit, shorter than five seconds may not cover tail latencies.

**Q: What does the jti and family model actually give you?**

The `jti` is a unique ID per token, the `familyId` groups every token derived from one login into a single session lineage. Together they let you answer three questions quickly: is this the current valid token, is this a recently-rotated token still in grace, or is this an old token being replayed? Without families, you would have to guess whether a token is old or current. With a family, revocation is one row update that kills the whole chain, and auditing is easy because you can trace the parent chain from any `jti` back to the login.

**Q: Where should you store refresh tokens and why hash them?**

In Postgres, Redis, or both. Postgres is durable and good for family queries and audit trails. Redis is fast and good for hot lookups and TTL expiry. Either way, the store must be shared across all your API instances so every server sees the same rotation state. You hash the raw token before storage, the same way you hash passwords, so a database dump does not give an attacker valid refresh tokens. On refresh, you hash the presented token and compare hashes. You also need a background job to delete expired families so the table does not grow forever, and indexes on `jti` and `familyId`.

**Q: Where should the refresh token live in the browser — httpOnly cookie or localStorage?**

Prefer `httpOnly`, `Secure`, `SameSite=Lax` cookie. `httpOnly` hides the token from JavaScript, so even if an attacker injects a script via XSS, they cannot read the refresh token. `localStorage` is accessible to any JS on the page, so XSS steals it immediately. The tradeoff is that cookies are sent automatically, so you need CSRF protection. You handle that with `SameSite` plus an `Origin` or `Referer` check on the refresh endpoint, or a separate double-submit CSRF token for state-changing routes. Use `SameSite=Lax` if your refresh endpoint needs to work after a top-level navigation, `Strict` if it is only called via fetch. Keep the access token in memory, not in storage, so it disappears on tab close.

**Q: How do you handle explicit revocation on logout, password change, or admin action?**

Rotation handles theft via reuse detection, but explicit revocation handles user intent. On logout, read the `familyId` from the refresh cookie and mark that one family as revoked, then clear the cookie. On password change or "log out everywhere," revoke all families for that `userId`. Because access tokens are stateless JWTs, you usually do not revoke them per-request — you let them expire in minutes and enforce revocation only at refresh time. If you need instant access-token kill, you add a Redis denylist of revoked access `jti`s checked in your auth middleware, but that adds latency to every request so you should keep the access lifetime short instead whenever possible.

## 6. The Traps — What Goes Wrong in Production

Storing refresh tokens in plaintext is the quietest disaster. It passes every test, it feels simpler, and it means a single read-only SQL injection or backup leak gives an attacker every active session. Always hash. The raw token only exists in the cookie and transiently on the server during verification.

Doing the rotation without a transaction or row lock is the classic race bug. You check "is this jti unused" and then in a separate query you mark it used. Between those two queries, a parallel request does the same check and both think they are first. Use a transaction with `SELECT ... FOR UPDATE` on the family and token rows, do the check and the update atomically, and commit once. If you are on Redis, use a Lua script or `WATCH`/`MULTI` instead of two separate commands.

Treating every reuse as an attack without a grace window is how you log out honest users. Three parallel API calls after an expiry are not three attackers, they are one browser being eager. If you revoke the family on the second concurrent use, you punish normal behavior. The grace window exists specifically to separate races from replays. Without it, your security feature becomes a reliability bug.

Using `localStorage` for the refresh token because it is easier to code is a security regression. It makes the frontend code shorter, but it hands the token to any XSS payload. An attacker who finds one XSS can steal refresh tokens and keep minting access tokens. The extra work of `httpOnly` cookies and `SameSite` handling is worth it, especially since your access token is already handled in memory.

Verifying the refresh JWT only by signature and not checking storage is another subtle mistake. JWT verification tells you the token was signed by you and has not expired, but it does not tell you whether that `jti` was already consumed or its family was revoked. You must look up the `jti` and family on every refresh. Do not skip the DB check to save a query — the refresh path is not your hot path, the access-token path is.

Making the grace window too long or infinite defeats reuse detection. If you allow an old token for hours, a stolen token is usable long after the legitimate user has moved forward. Keep it under thirty seconds. Also, make the grace response idempotent: return the same new tokens, do not mint a new family branch each time, otherwise a replay could farm many valid tokens.

Forgetting that the access token is stateless means you expect logout to instantly kill API access and are surprised when it does not. Access tokens live until expiry regardless of family revocation unless you add a denylist. That is by design for performance. The mitigation is keep access tokens at five to fifteen minutes and do revocation checks only on refresh, and document that short post-logout window for your product team.

Not cleaning up expired families makes the token table a permanent append-only log. With millions of users rotating every ten minutes, that table grows by millions of rows a week. Add a nightly job that deletes families where the newest token is expired, or use Redis TTLs that auto-evict. Also, setting `SameSite=None` without `Secure` or setting the cookie `Path` too broadly can cause the cookie not to be sent or to be sent where you did not expect. Scope the refresh cookie to `Path=/auth/refresh` if that is the only endpoint that needs it.

## 7. Compare With Related Concepts

**Rotation versus sliding sessions.** Rotation issues a new token and invalidates the old one on every use, and reuse of an old token signals theft and kills the family. A sliding session keeps the same token or session ID and just bumps its `expiresAt` forward on each request. Sliding is simpler and has no race on parallel requests because there is no invalidation, but it cannot detect theft — a stolen sliding cookie works as long as the thief keeps using it before it expires. Rotation can detect theft but needs the grace window and atomic update to avoid false positives. Rule: use rotation when you need theft detection for high-value sessions, use sliding when you want simple idle-timeout behavior and can tolerate a stolen session staying valid until expiry. Some teams combine them: rotate infrequently but slide expiry within a window.

**Rotation versus a single long-lived static refresh token.** A static token is what you had before rotation: one token lives for days or weeks and every refresh just verifies it without replacing it. There is no race and no reuse detection, but if that token is stolen, the attacker and user can both use it indefinitely until it naturally expires. Rotation fixes that by making every token single-use, so a stolen token becomes detectable the moment the legitimate user rotates it. Rule: never use a static long-lived refresh token for user sessions if you can avoid it. Rotate, hash, and keep the family.

**Rotation versus silent refresh with an iframe.** Silent refresh is a frontend trick to get new access tokens via a hidden iframe that calls the refresh endpoint in a third-party cookie context. It does not replace the backend rotation logic, it just changes how the frontend triggers it. Modern browsers block third-party cookies, so silent refresh via iframe is increasingly unreliable. Prefer a same-site `fetch` with `credentials: include` and a queued refresh promise over hidden iframes. Rule: fix the backend race and the frontend queue, do not work around it with iframes.

**Refresh token family revocation versus access token blocklisting.** Revoking a family stops future refreshes but does not stop already-issued access tokens until they expire. Blocklisting access `jti`s stops the current access token immediately but requires a Redis lookup on every API request, which is expensive. Rule: default to family revocation plus short-lived access tokens, add access blocklisting only for features that need instant kill, like "revoke all sessions now" on a compromised account.

## 8. 🧠 The Memory Hook

Rotation turns each refresh token into a single-use coat check ticket with a family serial number. Parallel requests are just photocopies racing to the counter — allow a short grace window to hand them the same new ticket, treat a late replay as theft and shred the whole family, and keep the ticket in an httpOnly pouch so scripts cannot steal it.
