# Open Redirects

## 1. Why This Exists — The Problem First

After a successful login, users should land on the page they originally wanted. A common implementation adds `?next=/checkout` to the login URL and redirects there after authentication. The bug appears when the application treats that value as an instruction instead of untrusted input: an attacker changes it to `https://phishing.example`, sends the link through the trusted application's domain, and lets the application deliver the victim to the fake site.

The server might be perfectly healthy and no script might execute on the real site. The failure is that the application lends its trusted name to a destination chosen by someone else. That is an **open redirect**. It is especially dangerous around login, password-reset, OAuth, payment, and logout flows, where users expect a redirect and are less likely to question it.

## 2. The Analogy — Make It Obvious

Imagine a hotel receptionist who accepts a guest's requested room number from a note attached to a hotel-branded invitation. The receptionist is allowed to guide guests through the hotel, but the note says “take this guest to a building across town.” If the receptionist follows it without checking, the hotel has become a trusted transport service for a stranger's destination.

The mapping is direct:

- The hotel-branded invitation is the link to the real application.
- The note is the user-controlled `next`, `returnUrl`, or `redirect` parameter.
- The receptionist is the frontend or backend redirect code.
- The room or building is the URL destination.
- The hotel's reputation is what makes the malicious link believable.

A safe receptionist accepts an internal room number, or checks an external building against an approved guest list. The receptionist does not decide that a building is safe because its name merely contains the hotel's name. URL validation must inspect the parsed destination, not trust a convincing-looking string.

## 3. How It Actually Works — The Full Explanation

An open redirect is a source-to-sink problem. Untrusted data comes from a query parameter, form field, cookie, or stored record. The application passes it to a navigation sink such as `window.location.assign()`, `window.location.replace()`, an anchor's `href`, or an HTTP `Location` response header without proving that the destination is allowed.

Consider this link:

```text
https://app.example/login?next=https%3A%2F%2Fphishing.example%2Flogin
```

The browser first requests `app.example/login`. The login handler reads `next`. If authentication succeeds and the handler emits `Location: https://phishing.example/login` (or the client assigns that value to `window.location`), the browser performs a second navigation to `phishing.example`. The first host was trusted, but it did not make the second host trustworthy.

**The browser's URL parsing matters.**

The browser does not treat a URL as an ordinary string. It parses scheme, username, password, hostname, port, path, query, and fragment into separate components. A substring check cannot reproduce that grammar:

```text
https://app.example.evil.example/       hostname: evil.example
https://evil.example/app.example        hostname: evil.example
//evil.example/path                     protocol-relative external URL
```

`new URL(candidate, base)` resolves a relative reference against the base and exposes the result's `origin`. That makes it useful for checking the property that matters: whether the final parsed destination has the same origin as the application, or belongs to a deliberately approved set. The constructor can throw for malformed input, so validation must handle that failure.

A leading double slash deserves special attention. `//evil.example/path` is not an internal path; it is a protocol-relative URL. With an HTTPS base, the browser resolves it as `https://evil.example/path`. Therefore, “starts with `/`” is not a sufficient internal-path policy.

**Relative paths and external destinations are different policies.**

The safest login redirect policy is usually “accept only an internal path.” For example, `/orders/42` has no host of its own and resolves on the current origin. If the product genuinely needs to send users to a partner, use a small allowlist of exact origins and protocols, or better, accept a short server-issued key that maps to a destination. Do not let every caller provide arbitrary full URLs.

An origin is the combination of scheme, host, and port. Comparing `parsed.origin` avoids mistakes such as accepting `app.example.evil.example` because it starts with `app.example`. If a product allows a subdomain, allowlist that exact origin and define whether userinfo, ports, paths, and redirects from the partner are permitted. A broad suffix rule like `hostname.endsWith("example.com")` can admit `evil-example.com` and needs a carefully defined boundary.

**The backend remains the security boundary.**

Client-side validation can prevent an ordinary user from being sent somewhere unexpected, but a user can remove or replace the bundle and call the backend directly. A server that accepts `returnUrl` and emits it in a 3xx `Location` header is vulnerable even if the React router checks the value first. Validate the destination again at every backend endpoint that redirects, and apply the same policy to OAuth callbacks, password reset completion, logout, and framework helpers.

For a flow with a fixed set of destinations, the strongest design is often a key-to-destination mapping:

```text
next=checkout  ->  /checkout
next=profile   ->  /account/profile
```

The server owns the mapping. The caller can choose a known key, not invent a URL. If the destination is user-specific, the server must also check that the authenticated user is authorized to reach it. This prevents open redirects and avoids turning a redirect parameter into an access-control bypass.

OWASP's [Unvalidated Redirects and Forwards Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html) recommends avoiding user-controlled destinations where possible, preferring server-side keys, and using an allowlist when input cannot be avoided. MDN's [`URL()` constructor documentation](https://developer.mozilla.org/en-US/docs/Web/API/URL/URL) shows why protocol-relative references must be treated as URLs rather than as ordinary paths.

## 4. Real Code — See It Working

**Prefer an internal path.**

This browser-compatible helper accepts only a root-relative path whose parsed result stays on the current origin. It returns a safe fallback instead of navigating when validation fails.

```js
const window = {
  location: {
    origin: "https://app.example",
    search: "?next=%2Fcheckout",
    assign(destination) {
      console.log(`Navigating to ${destination}`);
    },
  },
};

function getSafeInternalPath(candidate, origin = window.location.origin) {
  if (typeof candidate !== "string" || !candidate.startsWith("/")) {
    return "/";
  }

  // A double slash is a protocol-relative URL, not an application path.
  if (candidate.startsWith("//")) {
    return "/";
  }

  try {
    const parsed = new URL(candidate, origin);

    // Comparing the parsed origin catches encoded, host-like, and backslash
    // tricks that a string prefix check would miss.
    return parsed.origin === origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/";
  } catch {
    // Invalid URL input must not become a navigation decision.
    return "/";
  }
}

const next = new URLSearchParams(window.location.search).get("next");
window.location.assign(getSafeInternalPath(next));
```

The helper keeps the path, query, and fragment after parsing, rather than returning the original spelling. That means the navigation uses the browser's normalized same-origin result. In a real application, call this only at the point where the redirect is intended, and make the server enforce the same policy.

**Allow a small set of partner origins.**

If external navigation is a real product requirement, compare parsed origins exactly. Do not allow arbitrary subdomains or protocols by pattern accident.

```js
const window = {
  location: {
    origin: "https://app.example",
    search: "?redirect=https%3A%2F%2Fbilling.example%2Finvoices",
    assign(destination) {
      console.log(`Navigating to ${destination}`);
    },
  },
};

const allowedOrigins = new Set([
  "https://billing.example",
  "https://support.example",
]);

function getAllowedDestination(candidate, baseOrigin = window.location.origin) {
  if (typeof candidate !== "string") {
    return null;
  }

  try {
    const parsed = new URL(candidate, baseOrigin);

    // The allowlist contains complete origins, including the protocol.
    return allowedOrigins.has(parsed.origin) ? parsed.href : null;
  } catch {
    return null;
  }
}

const destination = getAllowedDestination(
  new URLSearchParams(window.location.search).get("redirect"),
);

if (destination) {
  window.location.assign(destination);
} else {
  window.location.assign("/");
}
```

**Use a server-owned key instead of a raw URL.**

The server-side shape is intentionally simple. The important property is that the client sends a key and the server chooses the URL.

```js
const request = { query: { next: "orders" } };
const response = {
  redirect(status, destination) {
    console.log(`HTTP ${status} Location: ${destination}`);
  },
};

const destinations = new Map([
  ["orders", "/orders"],
  ["profile", "/account/profile"],
]);

function destinationForKey(key) {
  return destinations.get(key) ?? "/";
}

// A real HTTP handler would send this value in a 303 Location header only
// after authentication and authorization have succeeded.
const location = destinationForKey(request.query.next);
response.redirect(303, location);
```

The handler still needs normal authentication, authorization, and response handling. A key is not permission by itself; it is only a safer destination selector.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is an open redirect, and why is it a security issue?**

It is a redirect whose destination can be chosen by untrusted input. The attacker creates a URL on a legitimate domain, adds a destination such as `https://phishing.example`, and relies on the application to perform the redirect. The main impact is phishing and loss of trust; in some flows it can also help bypass checks or make OAuth and password-reset journeys confusing. It is not the same as XSS: the redirect changes where the browser goes, while XSS executes attacker-controlled code in the application's origin.

**Q: Why is `nextUrl.startsWith("/")` not enough?**

Because `//evil.example` starts with a slash but is a protocol-relative URL. The browser resolves it using the current protocol and sends the user to `https://evil.example` on an HTTPS page. A safe internal-path policy rejects the double slash and then parses the candidate against a known base origin.

**Q: Why is `includes("app.example")` or `startsWith("https://app.example")` unsafe?**

Those checks inspect spelling, not the parsed hostname. `https://app.example.evil.example` can pass a prefix check while its actual host is `evil.example`; `https://evil.example/app.example` can pass a substring check for the same reason. Parse the URL and compare the complete origin, or use an exact server-owned key.

**Q: Is comparing `parsed.origin` always enough?**

It is a strong check for a same-origin policy, provided the candidate is parsed with a trusted absolute base and parse failures are rejected. For an external allowlist, compare against exact approved origins and separately define allowed protocols, ports, paths, and partner behavior. Validation must match the product policy; parsing alone does not tell you whether a destination is authorized for this user or flow.

**Q: Is frontend validation enough?**

No. The frontend runs in an environment the user controls and can be bypassed. The backend must validate any redirect input before emitting a 3xx `Location` header or invoking a framework redirect helper. Client-side validation is still useful for a clean user experience, but it is not the security boundary.

**Q: When should an application use a destination key instead of a URL?**

Use a key when the application knows a finite set of destinations, such as `profile`, `orders`, or `checkout`. The server maps the key to a path or approved URL, so callers cannot invent arbitrary destinations. This is often easier to audit than maintaining a broad URL parser policy, but the key still needs authorization checks and should not expose sensitive destination enumeration.

**Q: What is the difference between `location.assign()` and `location.replace()` here?**

Both navigate to the supplied URL, so both require the same validation. `assign()` leaves the current page in session history, while `replace()` replaces the current history entry, which can be useful after a one-time login or logout transition. The history difference changes user experience, not the open-redirect risk; an unsafe value is unsafe with either method.

## 6. The Traps — What Goes Wrong

**Trap: trusting a parameter because it came from your own login page.**

The attacker controls the link before the victim opens it. A query parameter is untrusted whether it arrived through your UI, an email, or a form. Treat `next`, `url`, `target`, `goto`, and `returnUrl` as data that needs a policy.

**Trap: accepting every single-slash-looking value.**

`//evil.example` is the classic bypass, but hand-written string rules also miss URL parsing behavior such as backslashes, encoded characters, credentials, ports, and scheme changes. Parse with the platform URL parser and verify the resulting origin. If the policy is “internal root-relative paths only,” enforce that policy before and after parsing.

**Trap: using a blocklist.**

Blocking `evil.example` does not block the next attacker domain, a spelling variant, or an alternate protocol. A narrow allowlist states what the application actually supports. If external destinations are not required, do not accept them at all.

**Trap: checking only the browser router.**

An attacker can call the login or OAuth endpoint directly and receive the server's redirect. Test every redirect-producing layer, including framework middleware and error paths. The server should return a fixed fallback or a structured error when the destination is invalid, and it should log rejection signals without logging sensitive tokens.

**Trap: assuming an open redirect directly steals cookies.**

A normal cross-origin redirect does not grant the destination access to the original site's same-origin DOM or cookies. Its danger is the trusted-link and trusted-flow abuse: users may enter credentials on the destination, and a redirect can make a phishing or authorization flow appear legitimate. Keep the impact accurate while still treating the redirect as a real security defect.

## 7. Compare With Related Concepts

| Concept | Key difference | Use this rule |
|---|---|---|
| Open redirect vs DOM-based XSS | An open redirect changes the browser's destination; DOM XSS executes attacker-controlled content in the current origin through a dangerous sink | Validate navigation targets separately from HTML/script sinks; fixing one does not fix the other |
| Open redirect vs CSRF | An open redirect moves the user; CSRF causes an authenticated request using credentials the browser already sends | Use redirect validation for destinations and SameSite/CSRF defenses for state-changing requests |
| Relative path vs absolute URL | A relative path has no independent origin; an absolute URL names a scheme and host, and a protocol-relative URL gets its scheme from the base | Prefer root-relative paths when the destination is inside the application |
| Allowlist vs blocklist | An allowlist names the small set of permitted destinations; a blocklist tries to enumerate everything bad | Choose an allowlist when external navigation is necessary |
| Client-side guard vs server-side validation | The client improves UX but is modifiable; the server controls the HTTP redirect and is the enforcement point | Validate at the server, then mirror the rule in the client for immediate feedback |
| Raw URL vs server-owned key | A raw URL lets the caller choose a destination; a key lets the server choose from known mappings | Use a key for finite, business-controlled redirect choices |

## 8. 🧠 The Memory Hook — What Sticks

An open redirect is a trusted hotel receptionist obeying a stranger's note about where to take the guest. Never decide that a destination is safe from how its string looks: parse it, compare it with the exact allowed origin or server-owned key, and make the server enforce the same rule.
