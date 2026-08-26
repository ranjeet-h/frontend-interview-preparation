# Web Security (XSS, CSRF, Clickjacking)

## 1. Why This Exists — The Problem First

Your app is "just a frontend." Then someone posts a comment with a script tag and every user who views that comment has their session stolen. Or a malicious site tricks a logged-in user's browser into POSTing a money transfer while they're still authenticated. Or an invisible iframe sits on top of your "Delete account" button.

Security isn't only the backend's job. The browser runs **your** JavaScript with **your** user's cookies. If you render untrusted HTML, store tokens wrong, or forget headers, you built the hole the attacker walks through.

## 2. The Analogy — Make It Obvious

Your web app is a **nightclub**.

**XSS** — someone forges a VIP wristband that lets them walk behind the bar and pour their own drinks (run code in your site's context). They use your club's reputation to rob other guests.

**CSRF** — someone tricks a regular who already has a valid wristband into **ordering drinks for the attacker's table** without realizing it. The club trusts the wristband; the request looks legitimate.

**Clickjacking** — someone puts a **one-way mirror** over your club's door so guests think they're signing a guestbook but they're actually agreeing to something else underneath.

Different attacks. Different locks on the door.

## 3. How It Actually Works — The Full Explanation

**XSS — Cross-Site Scripting**

Attacker injects JavaScript that runs in **your origin's context**. Can read cookies (if not HttpOnly), localStorage, DOM, make requests as the user.

Types:
- **Stored** — malicious script saved in DB (comment, profile), served to all viewers
- **Reflected** — script in URL/query echoed in response (phishing links)
- **DOM-based** — JS writes user input to DOM unsafely (`innerHTML`, `document.write`) without server round-trip

**Prevention:**
- **Escape output** — treat user data as text, not HTML (`textContent`, templating auto-escape)
- **Sanitize** when HTML is required (DOMPurify, strict allowlist)
- **Content-Security-Policy (CSP)** header — whitelist script sources, block inline scripts (`script-src 'self'`)
- **HttpOnly cookies** — JS can't read session cookie even if XSS exists
- Never `eval()`, `innerHTML` with user input, or `dangerouslySetInnerHTML` without sanitization

**CSRF — Cross-Site Request Forgery**

User is logged into `bank.com`. They visit `evil.com`, which auto-submits a form or image request to `bank.com/transfer`. Browser sends **cookies automatically** — server thinks it's the user.

**Prevention:**
- **SameSite cookies** — `Lax` or `Strict` limits cross-site cookie send
- **CSRF tokens** — unpredictable token in form/header server validates
- **Custom headers** — `X-Requested-With` or `Authorization` (not sent on simple cross-site form POST from evil site — CORS applies to reads; cookies still sent on simple requests — use tokens)
- **Re-authentication** for sensitive actions

**Clickjacking**

Your site loaded in invisible iframe on attacker's page. User clicks visible button; actually clicks your hidden "Confirm delete."

**Prevention:**
- **`X-Frame-Options: DENY` or `SAMEORIGIN`**
- **CSP `frame-ancestors 'none'` or `'self'`**
- JavaScript frame-busting (weak alone — use headers)

**Other essentials (brief):**
- **HTTPS everywhere** — `Secure` cookies, HSTS
- **CORS** — browser blocks *reading* cross-origin responses; doesn't stop CSRF with cookies
- **Subresource Integrity (SRI)** — hash on CDN scripts

## 4. Real Code — See It Working

React — safe vs dangerous:

```jsx
// Safe — React escapes by default
<p>{userComment}</p>

// Dangerous without sanitization
<div dangerouslySetInnerHTML={{ __html: userComment }} />
```

Sanitize when HTML required:

```javascript
import DOMPurify from 'dompurify';

element.innerHTML = DOMPurify.sanitize(untrustedHtml);
```

CSP header (server):

```
Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'self';
```

CSRF token in fetch:

```javascript
await fetch('/api/transfer', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getCsrfTokenFromMetaOrCookie(),
  },
  body: JSON.stringify({ amount: 100 }),
  credentials: 'include',
});
```

```html
<meta name="csrf-token" content="server-generated-token">
```

Cookie hardening:

```
Set-Cookie: session=...; HttpOnly; Secure; SameSite=Lax; Path=/
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is XSS and how do you prevent it?**

Injecting script that runs in victim's browser on your site. Prevent: escape output, sanitize HTML if needed, CSP, HttpOnly cookies for sessions, avoid unsafe DOM APIs with user data.

**Q: What is CSRF and how do you prevent it?**

Forging requests from another site using victim's cookies. Prevent: SameSite cookies, CSRF tokens, require custom headers or re-auth for sensitive ops.

**Q: What is clickjacking?**

Tricking users to click hidden iframe of your site. Prevent: X-Frame-Options, CSP frame-ancestors.

**Q: Does CORS prevent CSRF?**

No. CORS restricts reading cross-origin responses. CSRF exploits automatic cookie sending on requests. Different problem — tokens and SameSite help CSRF.

**Q: Why not store JWT in localStorage?**

XSS steals it. HttpOnly cookie isn't readable by JS — defense in depth (still need XSS mitigation for actions on page).

## 6. The Traps — What Goes Wrong

**"We use React so we're safe from XSS."** Only if you never use `dangerouslySetInnerHTML`, `href="javascript:..."`, or pass unsanitized HTML.

**CORS `*` on API with cookie auth** — confused with security; validate origins properly.

**SameSite=None without Secure** — browser rejects; needed for cross-site embeds with care.

**CSP with `unsafe-inline`** — defeats much of CSP's value.

**Trusting client-side validation only** — attacker bypasses; server must validate everything.

## 7. Compare With Related Concepts

**XSS vs CSRF.** XSS runs code in your origin. CSRF tricks browser into making requests with your cookies. XSS can steal tokens; CSRF abuses existing session without reading cookie (for HttpOnly).

**Authentication vs authorization.** Being logged in (authn) vs allowed to do action (authz). CSRF breaks authz assumptions.

**CSP vs CORS.** CSP controls what your page loads/runs. CORS controls cross-origin API access from browser JS.

## 8. 🧠 The Memory Hook — What Sticks

XSS forges your club's wristband and runs behind your bar. CSRF tricks a guest with a real wristband into ordering for someone else. Clickjacking is a mirror over your door. Lock with escape/sanitize, SameSite + tokens, and frame-ancestors.
