# Browser Storage

## 1. Why This Exists — The Problem First

You need to remember the user's theme preference. You stuff a JWT in `localStorage` because it's easy. A week later there's an XSS vulnerability and every token is stolen. Or you store a 5MB JSON blob in a cookie and wonder why every API call is slow — the browser sends that cookie on every request.

Browsers offer several storage mechanisms. They look interchangeable from a tutorial. They're not. Pick the wrong one and you get security holes, size limits, or data that vanishes when the tab closes.

## 2. The Analogy — Make It Obvious

Three places to stash notes at work:

**Cookies** — sticky notes on **every outgoing mail** you send. The post room (server) sees them automatically on each letter. Tiny notes only (~4KB). Good for "session ID the server must see on every request." Bad for stuffing novels.

**sessionStorage** — a whiteboard in **one meeting room**. Everyone in that room sees it; when the meeting ends (tab closes), it's erased. Other rooms don't see it.

**localStorage** — a **personal locker** in the building. Survives you leaving and coming back. Same company (origin) only. Bigger locker (~5–10MB). Mail room never sees it unless you explicitly hand something over.

Pick the locker for client-only prefs. Pick sticky notes for server session. Pick the whiteboard for temporary single-tab state.

## 3. How It Actually Works — The Full Explanation

All three are **origin-scoped** (scheme + host + port). `https://app.example.com` cannot read `https://evil.com` storage.

**Cookies**
- Key-value strings, ~4KB per cookie, limited count per domain
- Sent on **every HTTP request** to matching domain/path (`document.cookie` or `Set-Cookie` header)
- Attributes: `HttpOnly` (no JS access — critical for session tokens), `Secure` (HTTPS only), `SameSite=Strict|Lax|None` (CSRF mitigation), `Expires`/`Max-Age`, `Domain`, `Path`
- Server sets via `Set-Cookie`; client can set via `document.cookie` (unless HttpOnly)

**localStorage**
- ~5–10MB per origin (browser-dependent)
- **Persists** until cleared by user or code (`localStorage.clear()`)
- Same for all tabs/windows of that origin
- Synchronous API — can block main thread on large reads/writes
- **Not** sent to server automatically
- Strings only — `JSON.stringify` for objects

**sessionStorage**
- Same API and size ballpark as localStorage
- **Tab/window scoped** — new tab = empty sessionStorage (unless duplicated from window.open with specific behavior)
- Cleared when tab closes

**IndexedDB** (related, often grouped in interviews)
- Async, large structured data, indexes, transactions
- Offline apps, large caches — not strings-only

**Cache API / Service Workers** — network response caching, offline PWAs. Different layer.

**When to use what:**

| Need | Choice |
|---|---|
| Server session ID | `HttpOnly` `Secure` cookie |
| Theme, language, UI prefs (non-sensitive) | localStorage |
| Multi-step form in one tab | sessionStorage |
| Large offline dataset | IndexedDB |
| Auth token | HttpOnly cookie (not localStorage) |

## 4. Real Code — See It Working

Theme preference (localStorage):

```javascript
const KEY = 'theme';

function getTheme() {
  return localStorage.getItem(KEY) ?? 'light';
}

function setTheme(theme) {
  localStorage.setItem(KEY, theme);
  document.documentElement.dataset.theme = theme;
}
```

Wizard step draft (sessionStorage — tab-local):

```javascript
sessionStorage.setItem('checkout-step', '2');

const step = Number(sessionStorage.getItem('checkout-step') ?? '1');
```

Setting a secure session cookie (server — Express example):

```javascript
res.cookie('sessionId', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
```

What NOT to do:

```javascript
// XSS on your site = game over for anything in localStorage
localStorage.setItem('accessToken', jwt);
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How can you store data in a browser?**

Cookies, localStorage, sessionStorage, IndexedDB, Cache API. Cookies go to server on requests; web storage stays client-side; IndexedDB for large structured async data.

**Q: Compare localStorage, sessionStorage, and cookies.**

localStorage — persistent, ~5–10MB, per origin, not auto-sent. sessionStorage — per tab, cleared on close. Cookies — ~4KB, sent on every request, server-readable, support HttpOnly/Secure/SameSite.

**Q: Why shouldn't you store JWTs in localStorage?**

Any XSS can read localStorage. HttpOnly cookies aren't accessible to JavaScript, shrinking XSS blast radius for session tokens (CSRF still needs mitigation).

**Q: Is web storage secure?**

Not for secrets. Same-origin policy isolates sites from each other, but malicious scripts on *your* site (XSS) have full access. Treat as public to any JS on the page.

**Q: localStorage synchronous — does it matter?**

Large serializations on main thread can jank UI. For big data use IndexedDB. For small prefs, fine.

## 6. The Traps — What Goes Wrong

**JWT in localStorage** — convenient until XSS.

**Huge data in cookies** — slows every request, size limits.

**Assuming sessionStorage shares across tabs** — it doesn't (by design).

**No JSON parse error handling** — `JSON.parse(localStorage.getItem('x'))` throws on corrupt data.

**Storing PII without thought** — GDPR, user clearing data, shared computers.

**Forgetting storage quota errors** — `setItem` throws `QuotaExceededError` in private mode or full disk.

## 7. Compare With Related Concepts

**Cookies vs Authorization header.** SPAs often use `Authorization: Bearer` from memory (lost on refresh unless refresh token flow). Cookies enable automatic send on navigation — choose based on auth architecture.

**localStorage vs React state/context.** State for runtime UI; storage for persistence across reloads.

**IndexedDB vs localStorage.** Size and async vs simplicity. Offline-first apps need IndexedDB.

## 8. 🧠 The Memory Hook — What Sticks

Cookies ride on every request — small and server-visible. localStorage is the persistent locker. sessionStorage is the tab whiteboard. Never put secrets in anything JavaScript can read.
