# XSS, CSRF, CORS, and CSP

## 1. Why This Exists — The Problem First

A team can have authentication, HTTPS, and a React frontend and still ship a serious browser-security bug. A comment rendered with `innerHTML` can let an attacker run code as the application; a hidden form can make a logged-in browser submit a transfer; a CORS change can expose private API responses to an untrusted origin; and a weak CSP can provide almost no useful backup. These incidents look similar in a security review because they all involve “another site,” but they are different failures at different browser boundaries.

The production question is therefore not “Which one security header do we need?” It is: **what is the attacker trying to make the browser do, and which boundary is supposed to stop that behavior?** XSS is about code execution in the trusted page. CSRF is about causing an authenticated state change without the user's intent. CORS is about whether browser JavaScript may read a cross-origin response. CSP is about which resources and execution mechanisms the page may use.

## 2. The Analogy — Make It Obvious

Imagine a bank branch with four separate controls:

- **XSS is a forged instruction slipped into the bank's own forms.** If the clerk treats a customer's free-text note as an instruction to operate the vault, the attacker has made the bank execute their words inside its trusted workflow. In a browser, an unsafe HTML, URL, or script sink gives untrusted data more power than plain data should have.
- **CSRF is a forged withdrawal request carrying a real customer's signature.** The customer is already authenticated, and the browser automatically supplies the cookie signature. The attacker does not need to read the account; they need the bank to accept an action the customer did not intend.
- **CORS is the archive-room reader list.** A visitor from another branch may ask the archivist for a document, but the browser decides whether JavaScript from that visitor's origin is allowed to receive and inspect the response. The server may still receive the request; CORS is not an authentication gate.
- **CSP is the branch's equipment and delivery policy.** Even if suspicious instructions reach a page, the browser will only load or execute scripts, images, frames, and other resources allowed by the page's policy. That policy reduces blast radius; it does not make unsafe input handling correct.

The controls overlap as defense in depth, but they do not substitute for one another: an archive reader list does not validate a withdrawal, and an equipment policy does not prove that a form came from the customer.

## 3. How It Actually Works — The Full Explanation

**Start with the browser's origin boundary.**

An **origin** is the tuple of scheme, host, and port. `https://app.example.com` and `https://api.example.com` are different origins because their hosts differ; `http://localhost:3000` and `http://localhost:5000` are different origins because their ports differ. The Same-Origin Policy (SOP) is the browser's default isolation rule: a document's JavaScript should not freely read another origin's private responses or DOM.

SOP is not “all cross-origin traffic is blocked.” Cross-origin navigation, form submission, and many resource embeddings are allowed. What is restricted by default is, among other things, script access to response data. CORS is the controlled way for a server to relax that read restriction for a specific origin.

**XSS: untrusted data becomes executable in the application's origin.**

XSS needs two ingredients: attacker-influenced data and a code/markup/URL context that interprets that data with too much power. The important distinction is where the data enters:

- **Reflected XSS** comes back immediately in a server-generated response, often from a query parameter.
- **Stored XSS** is persisted by the application and later rendered to other users.
- **DOM-based XSS** is created by client-side code, such as reading `location.hash` and assigning it to `innerHTML`; the server may never see the payload.

The browser does not treat all strings alike. `textContent` creates a text node, so `<img>` remains visible text. `innerHTML` parses a string as HTML. URL attributes, event-handler attributes, `document.write`, `insertAdjacentHTML`, and dynamic code APIs such as `eval` are other contexts that require special care. If attacker code executes, it runs as part of the vulnerable origin: it may read page data and local storage, alter the UI, and send requests with the page's credentials. An `HttpOnly` cookie cannot be read through `document.cookie`, but XSS can still issue requests and the browser may attach that cookie.

The primary defense is context-appropriate output encoding or safe APIs. If the product intentionally supports a restricted subset of rich HTML, sanitize it with a maintained, narrowly configured sanitizer immediately before the rich-HTML sink. A strict CSP using nonces or hashes is a backup layer, and Trusted Types can require approved values at supported script injection sinks. None of these makes server authorization optional.

**CSRF: the browser supplies credentials to an unwanted action.**

CSRF primarily targets ambient credentials, especially cookies. Suppose a user is logged in to `bank.example` and then visits `attacker.example`. A malicious page can submit a cross-site HTML form to `https://bank.example/transfer`. The browser may include eligible `bank.example` cookies automatically, so the bank sees a syntactically valid authenticated request. The attacker's page generally does not need to read the response; causing the state change is enough.

The server must require evidence that an intended client could supply but a blind cross-site form cannot. Common layers are:

1. A server-generated, unpredictable CSRF token tied to the session or otherwise validated by the server. In an SPA, a same-site script can read a non-`HttpOnly` CSRF cookie and copy it into a custom header; an attacker origin cannot normally set that header without passing the browser's cross-origin checks.
2. `SameSite=Lax` or `Strict` cookies where the product flow allows it. `SameSite=None` explicitly permits cross-site sending and requires `Secure`, so it needs stronger token/origin defenses.
3. Server validation of the `Origin` header, and where appropriate `Sec-Fetch-Site`, with careful handling of absent headers and legacy clients.
4. Normal authentication and authorization on every state-changing endpoint. CSRF defenses answer “did this request come from an intended browser context?”; authorization answers “may this user perform this action?”

Bearer tokens in an `Authorization` header are not automatically CSRF-vulnerable when the attacker cannot read the token and cannot cause the browser to add that header. But a JWT stored in a cookie is still an ambient credential and needs CSRF protection. Also, CORS configuration is not the fundamental CSRF defense: simple cross-origin requests such as forms can be sent without a preflight, and a permissive CORS policy with credentials can make cross-origin reading easier.

**CORS: the browser decides whether script may read the response.**

For a cross-origin `fetch`, the browser attaches an `Origin` request header. The server may reply with `Access-Control-Allow-Origin: https://app.example.com`. If the value does not authorize the caller, the browser prevents that page's JavaScript from receiving the response. `curl`, Postman, and a server-side attacker do not enforce CORS, so the API still needs authentication, authorization, validation, rate limiting, and other server-side controls.

Some requests are “simple” under the CORS rules. The browser sends them and checks the response afterward. A request using methods, headers, or content types outside that simple set usually triggers an `OPTIONS` **preflight** first. The server must answer with compatible `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, and `Access-Control-Allow-Headers` values before the browser sends the actual request.

Credentials add another constraint. If cookies or other credentials are intended, the client must opt in (for example, `credentials: "include"`), and the server must return `Access-Control-Allow-Credentials: true` plus one explicit allowed origin. `Access-Control-Allow-Origin: *` cannot be combined with credentialed CORS. CORS also does not turn two origins into one; it only grants selected browser capabilities.

**CSP: the response policy limits resource loading and execution.**

The server sends a `Content-Security-Policy` response header, such as `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-RANDOM_PER_RESPONSE'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`. This inline header is explanatory; the runnable Node.js fixture in section 4 generates the nonce and sends the header.

The browser parses the directives and checks resource and execution attempts against them. `default-src` supplies a fallback; `script-src`, `style-src`, `img-src`, `connect-src`, `font-src`, `frame-src`, and `frame-ancestors` narrow particular behaviors. A nonce must be unpredictable and generated for that response, then attached only to the legitimate inline script. A hash authorizes an exact inline script body. Avoid `'unsafe-inline'`, broad wildcards, and unnecessary `'unsafe-eval'`, because they weaken the policy's value.

CSP is defense in depth. It can block an injected script that lacks the expected nonce and can disable inline handlers or `eval`, but it does not remove the malicious data, repair an unsafe sink, stop every data leak, or enforce backend authorization. Roll out a policy with `Content-Security-Policy-Report-Only` first when compatibility is uncertain, then enforce a policy that matches the application's actual resource graph.

For further source-faithful detail, see the [canonical browser chapter](../browser-dom-perf.md), [MDN's XSS guide](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/XSS), [MDN's CORS guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS), [MDN's CSP guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP), and the [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## 4. Real Code — See It Working

**Keep ordinary user content as text.**

This browser example can be saved as `security-demo.html` and opened from a local web server. The safe path displays the characters literally; the unsafe path asks the HTML parser to interpret them.

```html
<label>
  Comment
  <input id="comment" value="<strong>hello</strong>">
</label>
<p id="safe"></p>
<p id="rich"></p>

<script>
  const comment = document.querySelector("#comment").value;

  // Plain user content has no reason to become markup.
  document.querySelector("#safe").textContent = comment;

  // Only use this boundary after a reviewed sanitizer and rich-text policy.
  // document.querySelector("#rich").innerHTML = sanitizedComment;
</script>
```

**A credentialed CORS request and its preflight.**

This is a genuinely cross-origin, dependency-free fixture for Node.js 18 or newer. The page is served from `http://127.0.0.1:3000`, while the API is served from `http://127.0.0.1:4000`. Because the browser request uses the non-simple `X-CSRF-Token` header, it sends an `OPTIONS` preflight before the credentialed `GET`.

Create a directory with these two files:

```sh
mkdir -p cors-fixture/public
cd cors-fixture
```

Save this as `server.js`:

```js
const http = require("node:http");

const appOrigin = "http://127.0.0.1:3000";
const csrfToken = "local-demo-token";

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

const api = http.createServer((request, response) => {
  const origin = request.headers.origin;

  // CORS is an explicit browser read permission, not authentication.
  if (origin !== appOrigin) {
    sendJson(response, 403, { error: "Origin not allowed" });
    return;
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": appOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };

  if (request.method === "OPTIONS") {
    if (
      request.headers["access-control-request-method"] !== "GET" ||
      request.headers["access-control-request-headers"]?.toLowerCase() !== "x-csrf-token"
    ) {
      sendJson(response, 400, { error: "Unexpected preflight" }, corsHeaders);
      return;
    }

    response.writeHead(204, {
      ...corsHeaders,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "X-CSRF-Token",
    });
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/session") {
    sendJson(response, 200, { ok: true }, {
      ...corsHeaders,
      "Set-Cookie": "session=local-demo-session; Path=/; SameSite=Lax",
    });
    return;
  }

  if (request.method === "GET" && request.url === "/profile") {
    const hasSession = request.headers.cookie?.includes("session=local-demo-session");
    const hasCsrfToken = request.headers["x-csrf-token"] === csrfToken;

    if (!hasSession || !hasCsrfToken) {
      sendJson(response, 403, { error: "CSRF validation failed" }, corsHeaders);
      return;
    }

    sendJson(response, 200, { id: 1, name: "Local fixture" }, corsHeaders);
    return;
  }

  sendJson(response, 404, { error: "Not found" }, corsHeaders);
});

const page = http.createServer((request, response) => {
  if (request.url !== "/") {
    response.writeHead(404);
    response.end();
    return;
  }

  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(require("node:fs").readFileSync("public/index.html"));
});

api.listen(4000, "127.0.0.1", () => {
  page.listen(3000, "127.0.0.1", () => {
    console.log("Open http://127.0.0.1:3000 in a browser");
  });
});
```

Save this as `public/index.html`:

```html
<!doctype html>
<title>Credentialed CORS fixture</title>
<button id="load-profile">Load profile</button>
<pre id="output"></pre>

<script>
  const apiOrigin = "http://127.0.0.1:4000";
  const csrfToken = "local-demo-token";
  const output = document.querySelector("#output");

  document.querySelector("#load-profile").addEventListener("click", async () => {
    // First establish a cookie on the API origin.
    await fetch(`${apiOrigin}/session`, { credentials: "include" });

    // The custom header causes the browser to preflight this cross-origin request.
    const response = await fetch(`${apiOrigin}/profile`, {
      credentials: "include",
      headers: { "X-CSRF-Token": csrfToken },
    });

    if (!response.ok) throw new Error(`Profile request failed: ${response.status}`);
    output.textContent = JSON.stringify(await response.json(), null, 2);
  });
</script>
```

Start the fixture and open the page in a browser:

```sh
node server.js
```

Click **Load profile**, then inspect the browser's Network panel. You should see `OPTIONS /profile` followed by `GET /profile`, with the API response containing `Access-Control-Allow-Origin: http://127.0.0.1:3000`, `Access-Control-Allow-Credentials: true`, and `Vary: Origin`; the page should display the profile JSON. The API still validates the session cookie and CSRF token. `Access-Control-Allow-Origin: *` would not be valid for this credentialed request.

**Validate a state-changing request on the server.**

This dependency-free Node.js example shows the security boundary. The real application would obtain the expected token from a session store and use a constant-time comparison where appropriate.

```js
const http = require("node:http");

const expectedCsrfToken = "server-generated-token";

const server = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/transfer") {
    const origin = request.headers.origin;
    const csrfToken = request.headers["x-csrf-token"];

    // Authentication and authorization happen here too; these checks are not UI checks.
    const validOrigin = origin === "http://127.0.0.1:3000";
    const validToken = csrfToken === expectedCsrfToken;

    if (!validOrigin || !validToken) {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "CSRF validation failed" }));
      return;
    }

    // Only after validation should the server mutate account state.
    response.writeHead(204);
    response.end();
    return;
  }

  response.writeHead(404);
  response.end();
});

server.listen(8080, "127.0.0.1", () => {
  console.log("Listening on http://127.0.0.1:8080");

  // Local success fixture: this is the origin the server allowlists above.
  const verification = http.request({
    hostname: "127.0.0.1",
    port: 8080,
    path: "/transfer",
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:3000",
      "X-CSRF-Token": expectedCsrfToken,
    },
  }, (verificationResponse) => {
    console.log(`Local request status: ${verificationResponse.statusCode}`);
    server.close();
  });
  verification.end();
});
```

Run it with `node csrf-server.js`; it prints status `204` after the accepted local request. A browser page served from `http://127.0.0.1:3000` would use the same origin value.

**Serve a nonce-based CSP.**

```js
const crypto = require("node:crypto");
const http = require("node:http");

http.createServer((request, response) => {
  const nonce = crypto.randomBytes(16).toString("base64");
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "object-src 'none'",
    "base-uri 'none'",
  ].join("; ");

  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": policy,
  });
  response.end(`<!doctype html>
    <h1>Nonce example</h1>
    <script nonce="${nonce}">console.log("approved script");</script>`);
}).listen(8081, "127.0.0.1");
```

The nonce is per response, unpredictable, and present only on the script the server intended to run. Do not reuse a fixed nonce in source control.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the one-minute difference between XSS, CSRF, CORS, and CSP?**

XSS runs attacker-controlled code in the application's origin. CSRF makes a browser send an authenticated state-changing request the user did not intend. CORS controls whether browser JavaScript from one origin may read a response from another origin. CSP tells the browser which resources and execution mechanisms the page allows. XSS and CSRF are attack classes; CORS and CSP are browser-enforced controls with different jobs.

**Q: Does `HttpOnly` prevent XSS?**

No. It prevents JavaScript from reading the cookie value, which can reduce token theft. An XSS payload can still read page content, change forms, call same-origin APIs, and cause requests for which the browser attaches the `HttpOnly` cookie. Fix the unsafe data flow and keep cookie, CSRF, and authorization defenses in place.

**Q: Does CORS stop an attacker from calling my API?**

No. CORS is enforced by participating browsers. A malicious server, `curl`, or Postman can send HTTP directly. CORS mainly prevents an untrusted web page's JavaScript from reading a protected cross-origin response. The API must enforce authentication, authorization, input validation, and abuse controls independently.

**Q: Why can a CORS error happen after the server processed the request?**

For a simple request, the browser may send the request first and reject JavaScript's access to the response afterward. The server might already have performed a mutation. A preflight can prevent some non-simple requests from being sent, but CORS should never be treated as a transaction rollback or CSRF defense.

**Q: If I use JWTs, do I still need CSRF protection?**

It depends on where the JWT travels. A JWT in an automatically attached cookie is an ambient credential and still needs CSRF defenses. A token held outside automatically sent credentials and explicitly placed in an `Authorization` header is a different threat model, but it introduces token-storage and XSS considerations. Name the transport before answering.

**Q: What is a strong CSP strategy?**

Start with report-only observation, inventory legitimate resources, then enforce a narrow policy. Prefer nonce- or hash-based `script-src`, avoid `'unsafe-inline'` and unnecessary `'unsafe-eval'`, use `object-src 'none'` and `base-uri 'none'`, and add directives such as `frame-ancestors` or `connect-src` for the product's actual needs. CSP is backup protection; output encoding, safe sinks, sanitization, and Trusted Types where appropriate remain primary controls.

**Q: Why is a client-side route guard not authorization?**

The user owns the browser and can alter the bundle, state, or navigation. A route guard can improve UX by hiding a screen, but it cannot protect an API or database record. Every API request must authenticate the caller and authorize the requested resource on the server.

## 6. The Traps — What Goes Wrong

- **“React prevents XSS.”** Ordinary escaped interpolation is a useful default, but `dangerouslySetInnerHTML`, unsafe URLs, raw DOM APIs, third-party components, and server-rendered templates can reopen the boundary. Trace data from source to sink in every rendering context.
- **“CORS is authentication.”** A correct allowlist only changes browser read permissions. It does not establish identity, check roles, or protect a direct HTTP client.
- **“CORS prevents CSRF.”** A cross-site form can make a simple state-changing request without the custom header that would trigger a preflight. Validate a CSRF token or trusted request context on the server.
- **“JWT means CSRF is impossible.”** JWT is a token format, not a transport policy. Cookie-delivered JWTs are still sent automatically.
- **“CSP fixes the vulnerability.”** A policy may block one payload while the application still exposes sensitive data, permits a trusted script gadget, or has another unsafe sink. Repair the source-to-sink bug first.
- **“`SameSite=Strict` is the entire solution.”** It is a strong cookie defense but can affect legitimate cross-site flows and does not replace server-side authorization. Treat it as a layer and verify the actual cookie context.
- **“The server can trust frontend permission checks.”** Any UI state can be modified. Security decisions belong at the backend boundary closest to the protected data or action.
- **“Escaping and sanitization are interchangeable.”** Escaping makes a value literal for a particular output context. Sanitization permits a deliberately limited rich-HTML subset. Use the least powerful operation that satisfies the feature.

## 7. Compare With Related Concepts

| Concept | Key difference | Use this rule |
|---|---|---|
| XSS vs CSRF | XSS executes code in the trusted page; CSRF causes an authenticated request without requiring page read access | Protect rendering/sinks against XSS; protect state-changing requests against CSRF |
| CORS vs CSP | CORS governs cross-origin response access by browser JavaScript; CSP governs what the current document may load or execute | Configure CORS on APIs that need selected browser origins; configure CSP on documents you serve |
| Same-Origin Policy vs CORS | SOP is the default isolation rule; CORS is a server-declared relaxation enforced by the browser | Start closed under SOP and allow only required origins with CORS |
| Escaping vs sanitization | Escaping produces literal text in one context; sanitization removes unsafe parts from allowed rich markup | Use `textContent`/escaped output for text; sanitize only intentional rich HTML |
| Cookies vs `Authorization` header | Cookies are automatically attached according to cookie rules; an authorization header is normally added explicitly by application code | Pair cookie auth with CSRF defenses; protect header tokens from theft and replay |
| Client route guard vs backend authorization | A route guard controls the user's interface; backend authorization controls access to protected data and actions | Use the guard for UX, but enforce every decision on the server |

## 8. 🧠 The Memory Hook — What Sticks

Remember four verbs: **XSS executes, CSRF submits, CORS reads, CSP restricts.** XSS gives attacker data the page's power; CSRF borrows the browser's credentials; CORS decides whether a foreign script may see the answer; CSP narrows what the page is allowed to run. Keep those verbs separate and the right defense follows.
