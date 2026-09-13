# Browser Storage and Token Risks

## 1. Why This Exists — The Problem First

An SPA needs to stay signed in after a reload, and a developer wants an easy way to attach credentials to API calls. Putting an access token in `localStorage` makes the happy path simple. Then one XSS bug, compromised dependency, or unsafe third-party script can read that token and send it away. Moving the same token into a cookie changes the main risk: the browser may now attach it automatically to a request the user never intended to make.

The real question is not “Which browser storage API is safest?” It is “Who can read this credential, when is it sent, how long is it useful, and which server checks make misuse fail?” Storage choice is one part of an authentication design, not a substitute for XSS prevention, CSRF defenses, HTTPS, or server-side authorization.

## 2. The Analogy — Make It Obvious

Imagine a hotel guest with two things: a short-lived room key and a membership card used to get a replacement key.

- `localStorage` is a note pinned to the hotel room door. Every script running in the room can read it. It survives the guest leaving and returning, which is convenient, but anyone who gets into the room can copy it.
- `sessionStorage` is a note on a whiteboard inside one meeting room. It normally disappears when that tab closes, but a malicious script already running in that tab can still read it. Shorter lifetime is not the same as a stronger access boundary.
- An `HttpOnly` cookie is a card in a locked hotel envelope. The browser can present it to the hotel server on matching requests, but page JavaScript cannot open the envelope to read the value. A malicious script may still ask the browser to perform actions as the guest, so the envelope does not make the room safe from every attack.
- An in-memory access token is the temporary room key in the guest’s hand. It disappears when the page’s JavaScript context is destroyed. A separate refresh/session credential can let the server issue a new short-lived key after a reload.

The hotel’s front desk is the backend. It must check every request and decide whether the credential is valid and authorized; hiding a page or route in the browser is not a lock on the hotel’s rooms.

## 3. How It Actually Works — The Full Explanation

### First separate the threats

An XSS attacker runs JavaScript as part of your origin. That code gets the same ordinary script privileges as your application: it can read `localStorage`, `sessionStorage`, IndexedDB, non-`HttpOnly` cookies, DOM data, and API responses visible to the page. It cannot read an `HttpOnly` cookie through `document.cookie`, but it can often make authenticated requests from the page and read whatever those requests return.

CSRF is different. The attacker may not need to read a response or steal a token. If the browser automatically sends a cookie to your server, a malicious site can try to cause a state-changing request. The server must require an appropriate CSRF defense, such as a robust `SameSite` policy plus request validation or an anti-CSRF token. CORS is not the primary CSRF defense: it controls whether browser JavaScript can read a cross-origin response, not whether every cross-origin request is harmless.

### What each location actually means

All Web Storage areas are keyed by origin: scheme, host, and port. Same-origin JavaScript can access them; a different origin cannot. That boundary does not protect a token from XSS on the application’s own origin.

| Location | JavaScript can read it? | Sent automatically? | Lifetime and main trade-off |
|---|---:|---:|---|
| `localStorage` | Yes | No | Persists until removed; easy to use, poor place for bearer secrets |
| `sessionStorage` | Yes | No | Usually tied to one tab’s page session; XSS exposure remains |
| IndexedDB | Yes | No | Async, structured, and larger; not a secret vault |
| in-memory variable | Code that can reach the runtime may access or influence it | No | Lost on reload/navigation; less persistent theft surface |
| `HttpOnly` cookie | No, through page script APIs | Yes, when cookie rules match | Browser-managed; requires CSRF and cookie-policy design |
| ordinary cookie | Yes, through `document.cookie` | Yes, when cookie rules match | Combines XSS-readable storage with automatic sending |

Cookies are attached according to domain, path, secure-transport, and same-site rules. They are small and travel with requests, so they are a poor general data store. Web Storage is not automatically sent to the server, but the application can copy its contents into a request—and any same-origin script can do that too.

### What the cookie attributes do

- `HttpOnly` prevents JavaScript from reading the cookie value through `document.cookie` and related page APIs. It does not stop JavaScript from issuing a request whose matching cookie is attached.
- `Secure` tells the browser to send the cookie only over HTTPS, apart from development-specific localhost behavior. It protects the transport path; it does not stop XSS or a stolen credential used elsewhere.
- `SameSite=Strict` or `Lax` limits when the cookie is sent in cross-site contexts. `Lax` commonly permits cookies on top-level, safe navigations, so it is not a blanket “no cross-site cookies” rule. `SameSite=None` permits cross-site use and requires `Secure`.
- `Path`, `Domain`, and expiry attributes limit where and how long a cookie is used. Narrow scope reduces accidental exposure but does not replace server authorization.

Cookie “site” and origin are related but not identical concepts. A request between two different subdomains can be cross-origin while still being same-site under the site definition used by cookie rules. That is why a CORS policy and a `SameSite` policy must be reasoned about separately.

### A practical token design

For a browser application, a common design is:

1. Keep the access token short-lived and send it in an `Authorization` header from runtime state, or use a server-managed session cookie instead.
2. Keep the long-lived refresh/session credential in a `Secure`, `HttpOnly` cookie with an intentional `SameSite` and narrow `Path`.
3. On startup or access-token expiry, call a refresh endpoint with the right credentials policy. The server validates the cookie, rotates or revokes the session as appropriate, and returns a fresh access token or establishes a new session.
4. Make the refresh operation single-flight on the client so several simultaneous `401` responses do not produce competing refresh requests.
5. Enforce authorization at the API for every protected operation. A valid token proves authentication; it does not automatically grant every action.

This is a trade-off, not a universal recipe. A same-origin server-rendered app may use only an opaque session cookie. A cross-origin SPA may need `credentials: "include"`, explicit CORS response headers, and an anti-CSRF mechanism. An application that cannot make its XSS risk acceptable should not pretend that moving a token between client-controlled locations solves the root problem.

For the storage APIs themselves, see [Browser Storage](../../frontend/web/browser-storage.md). For the injection and request threats this page separates, see [DOM-based XSS](dom-based-xss.md) and [XSS, CSRF, CORS, and CSP](xss-csrf-cors-csp.md).

## 4. Real Code — See It Working

### Keep ordinary preferences in Web Storage, not credentials

```js
// Minimal localStorage fixture so this example also runs in Node or a console.
const localStorage = (() => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
})();

const THEME_KEY = "theme";

function readTheme() {
  // A preference is recoverable and non-sensitive, so persistence is useful here.
  return localStorage.getItem(THEME_KEY) ?? "light";
}

function saveTheme(theme) {
  if (theme !== "light" && theme !== "dark") {
    throw new Error("Unsupported theme");
  }
  localStorage.setItem(THEME_KEY, theme);
}

saveTheme("dark");
console.log(readTheme()); // dark
```

This code is not a token vault. A script running on the same origin can execute `localStorage.getItem(THEME_KEY)`—and could execute the same operation for any token stored there.

### A short-lived in-memory access token with one refresh request

```js
// Local fetch fixture: the cookie jar is browser-owned and only the mock can inspect it.
const mockFetch = (() => {
  const refreshCookie = "fixture-refresh-cookie";
  let firstUserRequest = true;

  return async (url, options = {}) => {
    if (options.credentials !== "include") {
      return { ok: false, status: 403, json: async () => ({}) };
    }

    if (url === "/auth/refresh" && refreshCookie) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ accessToken: "fixture-access-token" }),
      };
    }

    if (url === "/api/me") {
      if (firstUserRequest) {
        firstUserRequest = false;
        return { ok: false, status: 401, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 1, name: "Fixture User" }),
      };
    }

    return { ok: false, status: 404, json: async () => ({}) };
  };
})();

let accessToken;
let refreshInFlight;

async function refreshAccessToken() {
  // Reuse one promise so five simultaneous 401s do not rotate the session five times.
  if (!refreshInFlight) {
    refreshInFlight = mockFetch("/auth/refresh", {
      method: "POST",
      credentials: "include", // lets the browser send the HttpOnly refresh cookie
    })
      .then((response) => {
        if (!response.ok) throw new Error("Refresh failed");
        return response.json();
      })
      .then(({ accessToken: nextToken }) => {
        accessToken = nextToken;
        return nextToken;
      })
      .finally(() => {
        refreshInFlight = undefined;
      });
  }

  return refreshInFlight;
}

async function getUser() {
  let response = await mockFetch("/api/me", {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: "include",
  });

  if (response.status === 401) {
    const nextToken = await refreshAccessToken();
    response = await mockFetch("/api/me", {
      headers: { Authorization: `Bearer ${nextToken}` },
      credentials: "include",
    });
  }

  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

Promise.all([getUser(), getUser()]).then(console.log);
```

The fixture models a browser-owned refresh cookie; application JavaScript never receives its string. The access token is still available to the page because the page must place it in an `Authorization` header. A real client also needs bounded retries, logout behavior, and protection against retrying a failed refresh forever.

### Set a session cookie on the server

```js
// Minimal response fixture implementing the Express `res.cookie` method.
const res = {
  cookies: [],
  cookie(name, value, options) {
    this.cookies.push({ name, value, options });
  },
};

// In a real server this comes from a session store; here it is a local fixture.
const sessionId = "fixture-session-id";

res.cookie("session", sessionId, {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 8 * 60 * 60 * 1000,
});

console.log(res.cookies[0]);
```

The server should store or otherwise be able to revoke the session represented by `sessionId`. Do not put a raw API master key in browser code or a browser cookie; anything needed to authorize the browser is potentially usable by the browser’s user or by code operating in that browser.

## 5. The Interview Questions — All of Them, Done Properly

**Q: Where should a browser application store its tokens?**

There is no answer independent of the threat model and authentication protocol. A strong default for a web app is an opaque server session in a `Secure`, `HttpOnly` cookie, with deliberate `SameSite`, CSRF, expiry, rotation, and revocation rules. If the architecture needs a bearer access token in JavaScript, keep it short-lived in memory and protect the longer-lived refresh credential in an `HttpOnly` cookie. Avoid putting refresh or access bearer tokens in `localStorage` merely for convenience.

**Q: Why is `localStorage` risky for tokens?**

Every script running under the origin can read it synchronously. An XSS payload, compromised dependency, or unsafe third-party script can read the token and exfiltrate it, after which the attacker can use the bearer credential from another client until it expires or is revoked. The same-origin policy prevents unrelated origins from reading the storage area; it does not distinguish your trusted bundle from injected code in your own origin.

**Q: Is `sessionStorage` safer than `localStorage`?**

It has a narrower lifetime and tab scope, which may reduce persistence after a tab closes. It is not safer against XSS: JavaScript in that tab can read it while the page is alive. Choose it for temporary, non-sensitive tab state—not as a token security boundary.

**Q: What does `HttpOnly` protect, and what does it not protect?**

It prevents page JavaScript from reading the cookie value. That makes direct token theft through `document.cookie` much harder. It does not prevent XSS from changing the page, reading visible data, or calling `/api/delete-account`; the browser may attach the cookie to that request. Prevent XSS and use CSRF defenses as well.

**Q: Does `SameSite` completely prevent CSRF?**

Not in every deployment. `Strict` and `Lax` reduce cross-site cookie sending, but `Lax` has navigation exceptions, and some products require `SameSite=None` for legitimate cross-site flows. Use safe HTTP methods, validate an anti-CSRF token or trusted request signal where required, check origin-related headers when appropriate, and enforce authorization on the server. Never make a state change on a cookie-authenticated `GET` just because a policy is usually `Lax`.

**Q: Why use a short-lived access token and a refresh token?**

The access token limits the useful lifetime of a stolen bearer credential. The refresh credential preserves a session without asking the user to log in every few minutes and can be rotated or revoked by the server. The design adds complexity: refresh races, expired sessions, replay detection, logout, and failure states must be handled explicitly.

**Q: Does encrypting a token before putting it in `localStorage` solve the problem?**

Usually no. The browser must contain the code and key—or have access to whatever operation decrypts the value—so injected code can often call the same code at the point where the plaintext is used. Client-side encryption may protect data at rest from casual inspection, but it is not a reliable boundary against code executing inside the application origin.

**Q: Does a JWT belong in one particular storage location?**

No. JWT describes a token format and verification model, not a browser storage policy. A JWT can be put in a cookie, memory, or Web Storage; each choice creates different XSS, CSRF, persistence, and revocation trade-offs. Also remember that a signed JWT is generally readable by its holder—the payload is encoded, not automatically encrypted—so do not put secrets in it.

## 6. The Traps — What Goes Wrong

- **“`HttpOnly` makes XSS harmless.”** The script cannot copy that cookie string, but it can still act through the victim’s page. Fix the injection and restrict sensitive operations; do not grade an XSS as harmless because the token is not readable.
- **“Cookies are automatically CSRF-safe.”** Cookies are automatically sent, which is why CSRF exists. Configure `SameSite` intentionally and add server-validated CSRF protection when the flow needs it.
- **“`SameSite=Lax` means no cross-site request can carry cookies.”** Top-level safe navigations are a notable exception. State-changing endpoints must not rely on a browser navigation behaving like an API authorization check.
- **“A token in memory is impossible for XSS to steal.”** It is not persistent storage, but XSS can call authenticated application behavior and observe responses. Memory reduces one easy extraction path; it does not repair an XSS vulnerability.
- **“A refresh token is just another access token.”** It is usually longer-lived and more valuable. Limit it to the refresh endpoint, rotate it where appropriate, detect reuse, and revoke the session or token family when compromise is suspected.
- **“The client route guard protects the data.”** Browser code is controlled by the user. The API must authenticate and authorize every protected resource and mutation.
- **“The token is safe because it is in a frontend environment variable.”** After bundling, frontend configuration is delivered to the browser. Treat it as public; keep server secrets on the server.
- **“Move a large object into cookies to make it available everywhere.”** Cookies are included on matching requests, increasing request size and latency, and they have tight per-cookie limits. Use IndexedDB or server-side storage for appropriate data; use cookies for small credentials or session identifiers.

## 7. Compare With Related Concepts

| Concept | Key difference | Use this rule |
|---|---|---|
| `localStorage` vs `sessionStorage` | Persistent origin storage vs tab/page-session storage; both are JavaScript-readable | Use either for non-sensitive client state, never because one is an XSS-safe token vault |
| Cookie vs `Authorization` header | Cookie is browser-attached under cookie rules; header is explicitly constructed by application code | Use cookie auth with CSRF-aware design; use a header when the client intentionally holds a short-lived access token |
| `HttpOnly` vs `Secure` | Blocks page-script reads vs restricts transmission to HTTPS | They solve different problems and are commonly used together |
| `SameSite` vs CORS | Cookie-send policy for cross-site contexts vs browser permission to read cross-origin responses | Use `SameSite`/CSRF controls for cookie request forgery; use CORS to define allowed browser reads |
| XSS vs CSRF | Attacker code runs in your origin vs attacker causes a credentialed request without needing to read it | Prevent XSS with safe sinks and CSP defense-in-depth; prevent CSRF with cookie policy and server request validation |
| Access token vs refresh/session credential | Short-lived API authorization vs longer-lived mechanism for obtaining or maintaining authorization | Keep the durable credential more protected and revocable than the short-lived credential |
| Authentication vs authorization | Proving who/what presented a credential vs deciding which operation it may perform | Check both at the backend boundary; a valid token is not permission for every resource |

## 8. 🧠 The Memory Hook — What Sticks

Ask two questions about every credential: **Can page JavaScript read it, and will the browser send it without the page choosing to?** Web Storage answers “yes, no”; an `HttpOnly` cookie answers “no, yes”—so the first trades against XSS extraction and the second demands CSRF design. The safest storage choice is the one whose failure mode your whole auth protocol is prepared to contain.
