# Same-Origin Policy (SOP): Browser Isolation, Origin Tuples, and Security Boundaries

## 1. Why This Exists — The Problem First

Imagine you open your web browser on a Monday morning. In Tab A, you log into your online banking portal at `https://mybank.com`. Your browser authenticates you and stores your active session cookie. In Tab B, you click a link from a forum to play a browser game at `https://sketchy-arcade.com`. Both web pages run JavaScript simultaneously inside the exact same browser process and memory on your laptop.

If the browser did not enforce origin boundaries, the JavaScript executing on `https://sketchy-arcade.com` could create an invisible iframe pointing to `https://mybank.com/dashboard`, reach directly into `iframe.contentDocument.body.innerText`, and read your bank account balance, account numbers, and recent transactions. It could read your bank's session cookies or `localStorage` auth tokens directly, make background requests to `https://mybank.com/api/transfer`, and inspect the JSON response to confirm a fraudulent wire transfer.

Without strict boundaries, every single tab in your browser would have full read and write access to the memory, storage, and private sessions of every other tab. Online banking, cloud consoles, corporate email, and e-commerce would be impossible in a multi-tab web.

The Same-Origin Policy (SOP) is the foundational security boundary of the web platform. It guarantees that scripts running on one website can only read data and access resources from that exact same origin, isolating untrusted third-party code from your sensitive applications.

## 2. The Analogy — Make It Obvious

Think of your browser as a modern commercial office tower, and each website as an independent tenant leasing a private office suite.

Every suite's identity is defined strictly by three elements on the door placard: the Building Wing (**Protocol**), the Suite Name (**Domain**), and the Door Number (**Port**). If any one of these three changes, it is considered a completely different company with zero authority over neighboring rooms.

Inside Suite A (`https://mybank.com:443`), employees have private filing cabinets (**localStorage**, **IndexedDB**, **document.cookie**) and internal whiteboard discussions (**the DOM tree**, **window variables**). Suite B (`https://sketchy-arcade.com:443`) is across the hall. Suite B cannot open Suite A's door, rummage through their filing cabinets, or listen to their whiteboard conversations. The building security guards (**the Browser Engine**) physically block Suite B employees at the door.

What about sending letters? Suite B can drop a sealed envelope into the public hallway mail chute addressed to Suite A. The mail carrier delivers it. But Suite B is physically barred from entering Suite A's mailroom to read the reply letter. Only Suite A can read their own mail, unless Suite A explicitly attaches an authorized visitor badge (**CORS headers**) stating that Suite B is permitted to read that specific reply.

If two suites legitimately need to collaborate—such as a parent portal embedding a payment processor—they install a secured intercom tube between the suites (**window.postMessage**). However, for security to hold, the receiving company must inspect the sender's security badge on every single message before acting on what comes through.

## 3. How It Actually Works — The Full Explanation

The Same-Origin Policy is enforced entirely by client-side browser engines (V8 in Chrome/Node, JavaScriptCore in WebKit/Safari, SpiderMonkey in Firefox). It does not exist in server runtimes, curl, or Postman.

**The Origin Tuple Definition**

The browser calculates an origin as a three-part tuple: **`(Protocol / Scheme, Hostname / Domain, Port)`**.

Two URLs share the same origin if and only if all three components match identically. Path names, query parameters, and URL fragments do not alter the origin.

Consider `https://example.com:443/app/dashboard?user=42` as our baseline:

- `https://example.com/app/profile` -> **Same Origin** (Protocol is HTTPS, Host is example.com, default port is 443; paths differ, which is allowed).
- `https://example.com:443/api/data` -> **Same Origin** (Explicit port 443 matches default HTTPS port).
- `http://example.com/app` -> **Cross-Origin** (Different protocol: HTTP vs HTTPS).
- `https://api.example.com/app` -> **Cross-Origin** (Different host: subdomain `api.example.com` vs root `example.com`).
- `https://example.com:8080/app` -> **Cross-Origin** (Different port: 8080 vs 443).
- `https://sub.app.example.com` vs `https://app.example.com` -> **Cross-Origin** (Subdomains are distinct origins).

**What the Same-Origin Policy Blocks**

SOP enforces three strict isolation boundaries across different origins:

1. **DOM and Window Hierarchy Access:** JavaScript in Origin A cannot access the DOM, global variables, or window context of Origin B when embedded inside an `<iframe>`, opened via `window.open()`, or accessed through `window.parent`. Attempting to read `iframe.contentDocument` or access properties on a cross-origin `window` object immediately throws a `DOMException: Blocked a frame with origin from accessing a cross-origin frame`.
2. **Network Response Reading:** JavaScript in Origin A can dispatch an asynchronous request (`fetch` or `XMLHttpRequest`) to Origin B. However, the browser prevents Origin A's JavaScript from reading the response headers, status code, and response body unless Origin B explicitly returns valid Cross-Origin Resource Sharing (CORS) headers allowing Origin A.
3. **Client-Side Storage and Cookies:** `localStorage`, `sessionStorage`, and `IndexedDB` databases are strictly sandboxed per origin. Scripts running on `https://shop.example.com` have zero access to keys stored by `https://checkout.example.com`. For cookies, the browser restricts JavaScript access via `document.cookie` based on the cookie's domain and path attributes, and blocks cross-origin reading outright.

**What the Same-Origin Policy Permits by Default (Cross-Origin Embedding)**

The early web was designed around hyperlinking and embedding remote assets. Therefore, SOP permits **cross-origin embedding and writing**, while restricting **cross-origin reading**.

The browser freely allows the following cross-origin resources to load and render:

- Embedding images via `<img src="https://cdn.other.com/photo.jpg">`.
- Executing scripts via `<script src="https://cdn.other.com/bundle.js">` (the script runs in the host page's origin context, but the host page cannot read the script's raw source file as data).
- Applying stylesheets via `<link rel="stylesheet" href="https://cdn.other.com/theme.css">`.
- Playing media via `<video src="...">` and `<audio src="...">`.
- Embedding remote pages in an `<iframe>` (the frame renders visually, but the parent document cannot read or alter the frame's internal DOM).
- Submitting HTML forms via `<form action="https://api.target.com/submit" method="POST">`.

**The Critical Asymmetry: Why CSRF Exists Despite SOP**

A common point of confusion is why Cross-Site Request Forgery (CSRF) exists if the browser has a Same-Origin Policy.

The critical rule is: **SOP blocks reading responses, not sending requests.**

When a malicious website initiates a cross-origin HTML form POST or triggers an image request to `https://bank.com/transfer?amount=1000`, the browser sends the HTTP request to the bank's server and attaches any unexpired ambient credentials (such as cookies without `SameSite=Strict`). The bank server receives the request, sees a valid session cookie, processes the state mutation, and returns a response.

SOP successfully prevents the malicious site from reading the bank's response HTML or confirmation JSON. But the damage is already done: the mutation executed on the backend. This is why CSRF defenses (anti-CSRF tokens, `SameSite=Lax/Strict` cookie attributes, and validating the `Origin`/`Referer` headers on the server) are mandatory.

**Mechanisms to Selectively Relax or Bridge Origins**

When legitimate business applications span multiple origins (such as a micro-frontend architecture or a decoupled frontend SPA on `app.example.com` calling an API on `api.example.com`), browsers provide specific, controlled communication channels:

- **CORS (Cross-Origin Resource Sharing):** The server sends HTTP response headers (such as `Access-Control-Allow-Origin: https://app.example.com` and `Access-Control-Allow-Credentials: true`) that instruct the browser to grant the client's JavaScript permission to read the response.
- **`window.postMessage()`:** Enables safe, asynchronous, message-based communication between different windows or iframes. Security is maintained because the sender specifies a strict target origin, and the recipient verifies `event.origin` before processing any payload.
- **WebSockets (`ws://` and `wss://`):** WebSockets are not restricted by SOP's AJAX read rules. During the initial HTTP handshake upgrade, the browser automatically sends the caller's `Origin` header. The WebSocket server must inspect this header and reject unauthorized origins.
- **`document.domain` (Deprecated):** Historically, two pages sharing a common parent domain (like `auth.example.com` and `app.example.com`) could both set `document.domain = 'example.com'` to allow direct DOM access. Modern browsers have disabled this behavior by default because it creates security vulnerabilities across subdomains.

## 4. Real Code — See It Working

Here are three production examples demonstrating how the browser enforces origin boundaries, how to communicate securely across origins, and how cross-origin read restrictions differ from write requests.

**Example 1: DOM and Storage Isolation in Action**

This example demonstrates how an application running on `https://portal.company.com` is completely blocked from reading the DOM and localStorage of an embedded cross-origin iframe (`https://external-service.com`).

```html
<!-- Hosted at https://portal.company.com/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SOP DOM Isolation Demo</title>
</head>
<body>
  <h1>Portal Dashboard (Origin: https://portal.company.com)</h1>
  <iframe id="service-frame" src="https://external-service.com/embed.html" width="400" height="200"></iframe>

  <script>
    const iframe = document.getElementById('service-frame');

    iframe.addEventListener('load', () => {
      // 1. Attempting to inspect the cross-origin iframe DOM
      try {
        // The browser immediately throws a DOMException because the origin tuple differs
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        console.log('Iframe title:', iframeDoc.title);
      } catch (err) {
        // Output: SecurityError: Failed to read the 'contentDocument' property from 'HTMLIFrameElement': 
        // Blocked a frame with origin "https://portal.company.com" from accessing a cross-origin frame.
        console.error('DOM access blocked by SOP:', err.message);
      }

      // 2. Attempting to access cross-origin storage
      try {
        // localStorage is strictly bound to the origin of the current execution context
        // This only accesses portal.company.com storage, never external-service.com storage
        localStorage.setItem('portalUser', 'engineer_42');
        console.log('Portal storage saved.');

        // Attempting to reach into the iframe window's localStorage
        const remoteStorage = iframe.contentWindow.localStorage;
        console.log('Remote storage item:', remoteStorage.getItem('secretToken'));
      } catch (err) {
        // Throws SecurityError: Blocked from accessing cross-origin window object properties
        console.error('Cross-origin storage access blocked by SOP:', err.message);
      }
    });
  </script>
</body>
</html>
```

**Example 2: Safe Cross-Origin Communication via `window.postMessage`**

When a parent portal needs to exchange messages with an embedded payment iframe on a different origin, `window.postMessage` provides a secure bridge with bidirectional origin verification.

```html
<!-- Parent Window: Hosted on https://checkout.myshop.com -->
<script>
  const paymentFrame = document.getElementById('payment-gateway-frame');
  const TRUSTED_GATEWAY_ORIGIN = 'https://pay.secure-processor.com';

  // Sending data: ALWAYS specify the exact target origin instead of '*'
  function initiatePayment(orderId, amountCents) {
    const payload = {
      type: 'INIT_TRANSACTION',
      orderId: orderId,
      amountCents: amountCents
    };

    // The browser delivers the message ONLY if the iframe is currently on TRUSTED_GATEWAY_ORIGIN
    paymentFrame.contentWindow.postMessage(payload, TRUSTED_GATEWAY_ORIGIN);
  }

  // Receiving responses: ALWAYS validate event.origin before trusting the data
  window.addEventListener('message', (event) => {
    // Drop messages from any unexpected origin
    if (event.origin !== TRUSTED_GATEWAY_ORIGIN) {
      console.warn('Rejected untrusted message from origin:', event.origin);
      return;
    }

    const { type, status, transactionId } = event.data;

    if (type === 'TRANSACTION_COMPLETE' && status === 'SUCCESS') {
      console.log(`Payment confirmed! Transaction ID: ${transactionId}`);
      window.location.href = `/order-confirmation?tx=${transactionId}`;
    }
  });
</script>
```

```html
<!-- Iframe Window: Hosted on https://pay.secure-processor.com -->
<script>
  const TRUSTED_SHOP_ORIGIN = 'https://checkout.myshop.com';

  window.addEventListener('message', (event) => {
    // 1. Strict origin validation: Ignore messages from rogue websites embedding this iframe
    if (event.origin !== TRUSTED_SHOP_ORIGIN) {
      console.error('Unauthorized sender origin:', event.origin);
      return;
    }

    // 2. Validate payload structure
    if (event.data?.type === 'INIT_TRANSACTION') {
      const { orderId, amountCents } = event.data;
      
      // Process payment internally...
      const confirmation = {
        type: 'TRANSACTION_COMPLETE',
        status: 'SUCCESS',
        transactionId: 'tx_99882244'
      };

      // 3. Send response back specifically to the shop's origin
      event.source.postMessage(confirmation, event.origin);
    }
  });
</script>
```

**Example 3: Demonstrating the SOP Asymmetry (Fetch Read Block vs Form Write Execution)**

This example contrasts how SOP blocks an unauthorized AJAX read response while permitting a cross-origin form POST request to reach the server.

```javascript
// Running on https://attacker-site.com

// 1. Cross-Origin AJAX Read Request (Blocked by SOP)
async function attemptStealBalance() {
  try {
    // Browser sends the request, but blocks JavaScript from reading the response body
    // because https://mybank.com does not include Access-Control-Allow-Origin: https://attacker-site.com
    const response = await fetch('https://mybank.com/api/account/balance', {
      method: 'GET',
      credentials: 'include' // Attaches session cookies if permitted
    });

    const data = await response.json();
    console.log('Balance stolen:', data);
  } catch (err) {
    // Fails in the browser console with:
    // "Access to fetch at 'https://mybank.com/api/account/balance' from origin 'https://attacker-site.com' 
    // has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource."
    console.error('SOP blocked JavaScript from reading the response:', err);
  }
}

// 2. Cross-Origin Form POST (Request SENDS and executes on server, top-level navigation occurs)
function triggerMaliciousTransfer() {
  const form = document.createElement('form');
  form.action = 'https://mybank.com/transfers/execute';
  form.method = 'POST';

  const recipientInput = document.createElement('input');
  recipientInput.name = 'toAccount';
  recipientInput.value = 'attacker_bank_account_99';
  form.appendChild(recipientInput);

  const amountInput = document.createElement('input');
  amountInput.name = 'amount';
  amountInput.value = '5000';
  form.appendChild(amountInput);

  document.body.appendChild(form);
  
  // Browser submits the form to mybank.com with cookies attached.
  // SOP does NOT prevent the server from receiving and executing the POST!
  form.submit();
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the Same-Origin Policy, and what exact tuple defines an origin?**

The Same-Origin Policy (SOP) is a fundamental browser security mechanism that isolates documents, scripts, and storage across different websites. It prevents client-side code running under one origin from reading private data (such as DOM nodes, cookies, local storage, or network responses) belonging to another origin.

An origin is defined strictly as the three-part tuple **`(Protocol, Hostname, Port)`**. Two URLs are same-origin if and only if all three components match identically. For example, `https://example.com:443` is cross-origin to `http://example.com` (different protocol), `https://api.example.com` (different subdomain host), and `https://example.com:8080` (different port). Paths and query parameters have no effect on origin calculation.

**Q: If the Same-Origin Policy exists, why do Cross-Site Request Forgery (CSRF) attacks still work?**

SOP blocks client-side JavaScript from **reading** responses from other origins; it does not block the browser from **sending** requests or executing cross-origin writes.

When a user visits a malicious page, that page can trigger a cross-origin request (such as an HTML `<form action="https://bank.com/transfer" method="POST">` or an image tag). The browser dispatches the HTTP request to the target server along with the user's ambient session cookies for that domain. The target server processes the mutation because it sees valid session cookies. SOP prevents the attacker's script from reading the bank's response, but the transfer has already occurred on the server. To defend against CSRF, applications must use anti-CSRF synchronization tokens, verify the `Origin` and `Referer` headers on mutating requests, or configure session cookies with `SameSite=Lax` or `SameSite=Strict`.

**Q: Does SOP block network requests from reaching the server, or does it block the browser from reading the response?**

For simple cross-origin GET and POST requests without custom headers, the browser actually sends the HTTP request across the wire to the destination server. The server receives the request, processes its internal logic, and sends back an HTTP response with headers and a body.

When the response arrives at the browser, the browser engine inspects the HTTP response headers. If it does not find an `Access-Control-Allow-Origin` header matching the requesting page's origin, the browser prevents the JavaScript engine from reading the response body and throws a network/CORS error in the client console. For complex requests (like those with `Content-Type: application/json` or custom headers like `Authorization`), the browser sends an `OPTIONS` preflight request first to verify permissions before sending the actual request.

**Q: Why do Postman, curl, and backend microservices never encounter CORS or SOP errors?**

Same-Origin Policy and CORS are client-side browser constructs enforced entirely by browser engines to protect users from untrusted code running in other browser tabs.

CLI tools like `curl`, API clients like Postman, and backend servers (e.g. a Node.js or Python service calling another API) do not run an arbitrary sandbox of untrusted third-party scripts, nor do they share ambient user sessions across tabs. They make direct TCP/TLS connections to HTTP endpoints and parse whatever response bytes the server sends. CORS headers in HTTP responses are completely ignored by non-browser clients.

**Q: How does `window.postMessage` enable safe cross-origin communication without violating SOP?**

`window.postMessage` provides an explicit, opt-in message-passing channel between windows or iframes on different origins without granting direct DOM or memory access.

It maintains security through two mandatory checks:
1. **Target Origin Specification:** When the sender calls `targetWindow.postMessage(data, targetOrigin)`, the browser will only deliver the event if the target window currently matches `targetOrigin`. This prevents sensitive data from leaking if the iframe navigates to an unexpected domain.
2. **Sender Origin Verification:** When the receiver listens to `window.addEventListener('message', (event) => ...)`, the browser populates `event.origin` with the verified origin of the sending window. The receiver must validate `if (event.origin !== 'https://trusted.com') return;` before parsing or acting upon `event.data`.

**Q: Why does the browser allow `<script>`, `<img>`, and `<link>` tags to load cross-origin resources by default?**

The web was architected from its inception in the early 1990s as an open, hyperlinked web of documents that could embed external images, fonts, and stylesheets without centralized permission. When JavaScript was introduced, CDN hosting for shared libraries (like jQuery or fonts) became standard practice.

To preserve backward compatibility, browsers allow **cross-origin embedding**:
- `<script src="...">` executes in the host page's scope, but the page cannot read the script's raw source file as a readable string variable unless served with CORS.
- `<img>` renders pixels onto the screen, but if the script draws a cross-origin image onto an HTML5 `<canvas>`, the canvas becomes "tainted", blocking calls to `canvas.toDataURL()` or `ctx.getImageData()` to prevent exfiltrating sensitive image data.

**Q: What happens when an origin draws a cross-origin image to an HTML5 `<canvas>`?**

When a cross-origin image (loaded without CORS approval) is drawn to an HTML5 `<canvas>` using `ctx.drawImage()`, the browser marks the canvas as **tainted**.

Once a canvas is tainted, its internal pixel data is locked down. Any subsequent JavaScript call to `canvas.toDataURL()`, `canvas.toBlob()`, or `ctx.getImageData()` will immediately throw a `SecurityError` DOMException. This prevents malicious websites from loading private user images (such as a profile picture or a rendered document preview from an internal corporate portal) and extracting the raw pixel bytes to send to an attacker's server.

## 6. The Traps — What Goes Wrong

**Trap 1: Treating CORS as an API Firewall or Backend Security Mechanism**

- *The Wrong Assumption:* Thinking that configuring CORS on your backend protects your API endpoints from unauthorized access or malicious scraping.
- *Why It Fails:* CORS is a browser-only read permission instruction. An attacker does not use a browser console with SOP restrictions; they write a 5-line Python script using `requests`, a Go scraper, or `curl`. These tools bypass SOP entirely and will read all endpoint data regardless of what `Access-Control-Allow-Origin` returns.
- *The Fix:* Secure your backend with robust authentication (JWTs, session tokens, mTLS), authorization checks, rate limiting, and input validation. CORS only manages browser client permissions.

**Trap 2: Adding `{ mode: 'no-cors' }` in Frontend Fetch to "Fix" CORS Errors**

- *The Wrong Assumption:* A developer sees a CORS error in the browser console when calling `fetch('https://api.thirdparty.com/data')`, searches for a quick fix, and adds `{ mode: 'no-cors' }` to the fetch options.
- *Why It Fails:* `mode: 'no-cors'` tells the browser to make a restricted request that yields an **opaque response** (`response.type = 'opaque'`). The HTTP status code is set to `0`, response headers are empty, and the response body is completely inaccessible. Attempting to call `await response.json()` will fail with a parsing error because JavaScript is forbidden from reading the opaque stream.
- *The Fix:* Either configure the remote server to return the appropriate `Access-Control-Allow-Origin` header, or route the request through your own backend reverse proxy (`/api/proxy/data`), which fetches the data server-to-server and returns it to your frontend under the same origin.

**Trap 3: Assuming Subdomains Share the Same Origin**

- *The Wrong Assumption:* Assuming that because `app.example.com` and `api.example.com` share the root domain `example.com`, they are same-origin and can freely access each other's `localStorage`, DOM, and cookies.
- *Why It Fails:* The host component of the origin tuple must match character-for-character. `app.example.com` and `api.example.com` have different hostnames and are completely separate origins. `localStorage` written on `app.example.com` is completely invisible to `api.example.com`.
- *The Fix:* Use standard CORS headers for cross-subdomain API calls, use cookies configured with `Domain=.example.com` for shared session state, or use `postMessage` for iframe-based communication.

**Trap 4: Using Wildcards `*` and Omitting Origin Checks in `postMessage`**

- *The Wrong Assumption:* Sending messages via `iframe.contentWindow.postMessage(data, '*')` or receiving messages with `window.addEventListener('message', (e) => handle(e.data))` without inspecting `e.origin`.
- *Why It Fails:* If a parent window uses `*` as the target origin, any malicious site that manages to redirect the iframe can intercept sensitive tokens or user payloads. Conversely, if a listener does not verify `event.origin === 'https://trusted.com'`, any malicious website embedding your page in an iframe can post forged payloads and trigger privileged actions.
- *The Fix:* Always pass an explicit target origin string to `postMessage()`, and always begin message event listeners with a strict origin equality check against an allowlist.

**Trap 5: Relying on Deprecated `document.domain` Relaxation**

- *The Wrong Assumption:* Setting `document.domain = 'example.com'` in both `parent.example.com` and `child.example.com` to bypass SOP for direct DOM access.
- *Why It Fails:* Modern browsers (Chrome 115+, Safari, Firefox) have actively deprecated and disabled the ability to alter `document.domain` because it undermines the origin boundary across shared hosting environments.
- *The Fix:* Replace all legacy `document.domain` workarounds with `window.postMessage()` or Channel Messaging APIs (`MessageChannel`).

## 7. Compare With Related Concepts

**Same-Origin Policy (SOP) vs Cross-Origin Resource Sharing (CORS)**

- *The Difference:* SOP is the default restrictive sandbox built into the browser that blocks cross-origin reading. CORS is an HTTP-header-based protocol that allows servers to explicitly declare authorized exceptions to SOP, instructing the browser to let specific origins read responses.
- *Rule of thumb:* SOP is the locked security gate; CORS is the guest list issued by the building owner.

**Same-Origin Policy (SOP) vs Content Security Policy (CSP)**

- *The Difference:* SOP provides **inter-site isolation**, preventing external origins from reading your application's data. CSP provides **intra-site defense-in-depth**, allowing a website to restrict which domains its own pages are permitted to load scripts, styles, images, and network connections from (mitigating Cross-Site Scripting / XSS and data exfiltration).
- *Rule of thumb:* SOP protects your site from unauthorized external sites; CSP protects your site from unauthorized scripts executing inside itself.

**Same-Origin Policy (SOP) vs Cookie `SameSite` Attribute**

- *The Difference:* SOP governs JavaScript access to DOM, storage, and response bodies in the browser. The cookie `SameSite` attribute (`Strict`, `Lax`, `None`) governs whether the browser automatically includes stored cookies in cross-site requests and top-level link navigations.
- *Rule of thumb:* SOP stops scripts from reading responses across origins; `SameSite` stops browsers from sending credential cookies on cross-origin requests.

**Same-Origin Policy (SOP) vs Cross-Origin Embedder Policy (COEP) & COOP**

- *The Difference:* SOP allows embedding cross-origin resources like images, scripts, and iframes by default. Cross-Origin Opener Policy (COOP) and Cross-Origin Embedder Policy (COEP) provide strict process isolation to prevent cross-origin side-channel timing attacks (like Spectre), required to unlock high-precision browser timers and `SharedArrayBuffer`.
- *Rule of thumb:* SOP isolates DOM and data access; COOP/COEP isolates OS-level memory processes and threads.

## 8. 🧠 The Memory Hook

SOP is the browser's **one-way security glass**: cross-origin sites can throw a rock through the mail slot (send a write request or render media), but they can never look through the glass to read your files, DOM, or reply letters unless you hand them an explicit CORS key.
