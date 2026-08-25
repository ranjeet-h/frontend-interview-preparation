# DOM-Based XSS

## 1. Why This Exists — The Problem First

An application can ship an entirely harmless HTML document and still become vulnerable after its JavaScript starts running. A search page reads a query string, a help panel reads a URL fragment, or a comment widget reads data from storage; one careless DOM write can turn that data into markup or a navigable URL. The server may never receive the fragment at all, so server-side validation cannot repair this particular path. The production failure is not “the browser is evil”; it is that application data crossed a boundary into a browser API that interprets strings as code or markup.

DOM-based cross-site scripting (DOM XSS) is the name for that client-side source-to-sink failure. An attacker who can make a victim open a crafted URL, or who can influence data already in the page, may get JavaScript executing with the page's origin and the victim's current privileges.

## 2. The Analogy — Make It Obvious

Imagine a hotel with a concierge desk. Guests can bring notes from outside: a booking reference, a message, or an address. The concierge should copy a guest's words onto a plain noticeboard. But if the concierge instead hands the note to a contractor who interprets every formatting instruction and builds doors, switches, and loudspeakers from it, a guest can smuggle in instructions that change the hotel.

- The guest note is untrusted data: `location.hash`, `location.search`, `document.referrer`, storage, or API data.
- The concierge is application JavaScript moving that data through the page.
- A plain noticeboard is a text sink such as `textContent`; the note remains words.
- The contractor is an injection sink such as `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, or an unsafe URL/navigation context; the browser gives the string extra meaning.
- Sanitization is a controlled renovation service that parses rich markup and removes unsafe elements and attributes according to an explicit policy.
- CSP and Trusted Types are building-level controls. They reduce what may execute and, with enforcement, make selected sinks reject ordinary strings, but neither excuses the concierge from handling untrusted notes correctly.

The key is the handoff. The same input is harmless when displayed as text and dangerous when delivered to a component that interprets it as markup, script, or a URL.

## 3. How It Actually Works — The Full Explanation

The useful way to reason about DOM XSS is a data-flow graph:

```text
untrusted source -> transformation -> browser sink -> interpretation/execution
location.hash   -> slice/decode    -> innerHTML   -> HTML parsing and handlers
```

**Sources are inputs, not automatically attacks**

Common sources include `location.search`, `location.hash`, `document.referrer`, `window.name`, `localStorage`, `postMessage` data, clipboard content, and server/API responses. A source is not itself a vulnerability. It becomes a vulnerability when code allows the value to reach a context with more authority than the data deserves. URL fragments are especially easy to miss: the browser keeps the fragment client-side and does not include it in the HTTP request sent to the server.

**Sinks give strings a context**

`textContent` creates or replaces a text node, so characters such as `<` are displayed literally. `innerHTML`, `outerHTML`, `insertAdjacentHTML`, and `document.write` invoke HTML parsing. The parser can create elements and attributes; event-handler attributes and dangerous URL-bearing attributes can then create executable behavior. An injected `<script>` element assigned through `innerHTML` is not a reliable demonstration because browsers generally do not execute those script elements in that insertion path. That does not make the sink safe: attacker-controlled elements, attributes, URLs, SVG/MathML contexts, or later application code can still make the result executable.

Other sinks have different contexts. `eval()` and the `Function` constructor compile strings as JavaScript. `setTimeout("...", delay)` has the same string-compilation hazard. Assigning attacker-controlled data to `href`, `src`, `formAction`, or `location` can be dangerous when protocols such as `javascript:` are accepted or when the destination is not validated. Safe handling must therefore match the output context; HTML escaping is not a universal fix for a URL or JavaScript string.

**The browser's execution boundary**

When code assigns a string to `innerHTML`, the browser parses that string into nodes and attributes, then inserts the resulting fragment. If a resulting element causes a handler or script-capable URL to run, the code executes in the document's origin. It can read anything that same-origin JavaScript can read, send requests as the user, alter the visible page, and abuse non-`HttpOnly` credentials. An `HttpOnly` cookie cannot be read with `document.cookie`, but XSS can still issue requests from the page and the browser may attach that cookie automatically.

The fix is to keep data in the least powerful context that satisfies the feature:

1. Render plain user content with `textContent`, DOM node creation, or a framework's ordinary escaped interpolation.
2. If rich HTML is a real requirement, sanitize with a maintained, context-appropriate sanitizer and keep the allowed element/attribute policy narrow.
3. Validate URL destinations with URL parsing and an allowlist of permitted protocols/origins; do not rely on substring checks.
4. Enforce server-side authorization independently. XSS defenses reduce script execution; they do not make client-side route guards or API permissions trustworthy.
5. Use CSP as defense in depth. A policy can restrict script sources and inline execution, but a weak policy, an allowed trusted script with a gadget, or a browser without a particular feature can leave residual risk.

Trusted Types can add a browser-enforced review point for supported injection sinks. With a CSP directive such as `require-trusted-types-for 'script'`, a raw string assignment to a protected sink can throw instead of silently proceeding. A Trusted Types policy is only as good as its transformation function, so the policy should delegate to a reviewed sanitizer and be constrained with `trusted-types`; creating a policy does not magically make arbitrary HTML safe.

For the broader boundary between XSS, CSRF, CORS, and CSP, see [XSS, CSRF, CORS, and CSP](xss-csrf-cors-csp.md). For URL navigation validation, see [Open Redirects](open-redirects.md). The canonical browser chapter is [Browser, DOM & Performance](../browser-dom-perf.md). The [OWASP DOM-based XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html) and [MDN's XSS guide](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/XSS) provide the security background.

## 4. Real Code — See It Working

**Dangerous source-to-sink flow (browser)**

This complete browser snippet reads a fragment and inserts it as HTML. The fixture is static trusted markup; the fragment is not. Do not open it with an attacker-controlled value outside a disposable test page.

```js
document.body.innerHTML = `
  <main>
    <p id="preview"></p>
  </main>
`;

const preview = document.querySelector("#preview");
const fragment = decodeURIComponent(location.hash.slice(1));

// The sink parses fragment as HTML, so this is a DOM XSS boundary.
preview.innerHTML = fragment;
```

**Safe plain-text rendering**

The same feature should usually display the value as text. This example is runnable in the same kind of browser page and preserves the user's characters literally.

```js
document.body.innerHTML = `<main><p id="preview"></p></main>`;

const preview = document.querySelector("#preview");
const fragment = decodeURIComponent(location.hash.slice(1));

// textContent creates text, not elements or event-handler attributes.
preview.textContent = fragment;
```

**Rich HTML: sanitize at the boundary**

When a product intentionally supports a limited subset such as bold text and links, pass the value through a maintained sanitizer before the HTML sink. The exact configuration is a product security decision; never replace this with a regular expression.

```js
const untrustedHtml = "<p><strong>Hello</strong> from the editor</p>";

// This tiny parser-based fixture is for this runnable example only; it is not
// a production sanitizer. Use the maintained `dompurify` project dependency
// in a real application and review its policy and configuration.
function sanitizeTeachingFixture(rawHtml) {
  const template = document.createElement("template");
  template.innerHTML = rawHtml;

  const allowedTags = new Set(["P", "STRONG", "EM", "A"]);
  const output = document.createElement("div");

  function copyNode(node, parent) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.append(document.createTextNode(node.nodeValue));
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    if (!allowedTags.has(node.tagName)) {
      [...node.childNodes].forEach((child) => copyNode(child, parent));
      return;
    }

    const cleanElement = document.createElement(node.tagName.toLowerCase());

    if (node.tagName === "A") {
      const href = node.getAttribute("href");
      if (href) {
        const url = new URL(href, window.location.href);
        if (url.protocol === "http:" || url.protocol === "https:") {
          cleanElement.setAttribute("href", url.href);
        }
      }
    }

    [...node.childNodes].forEach((child) => copyNode(child, cleanElement));
    parent.append(cleanElement);
  }

  [...template.content.childNodes].forEach((node) => copyNode(node, output));
  return output.innerHTML;
}

document.body.innerHTML = `<article id="article"></article>`;
const article = document.querySelector("#article");

// Sanitization is required because the feature intentionally accepts markup.
article.innerHTML = sanitizeTeachingFixture(untrustedHtml);
```

**Validate a URL context separately**

Escaping HTML does not make a navigation destination safe. Parse the URL and allow only the protocols and destinations the feature actually needs.

```js
document.body.innerHTML = `<a id="help-link">Help</a>`;

function safeHelpLink(rawValue) {
  const url = new URL(rawValue, window.location.origin);

  if (url.origin !== window.location.origin || url.protocol !== "https:") {
    return "/help";
  }

  return url.href;
}

const link = document.querySelector("#help-link");
const untrustedDestination = "/help/getting-started";
link.href = safeHelpLink(untrustedDestination);
```

Both examples are browser snippets with local fixtures. The sanitizer fixture is intentionally minimal and illustrative; a real application should use the maintained `dompurify` project dependency, configure it narrowly, and review its policy. The URL rule above is intentionally strict: it permits only HTTPS URLs on the current origin. A real application should choose its allowlist explicitly, test it with its deployment origins, and validate the destination on the server when the server performs the redirect.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is DOM-based XSS, and how is it different from reflected or stored XSS?**

DOM-based XSS occurs when client-side code reads an untrusted source and passes it into a dangerous browser sink. The malicious value can remain entirely in the URL fragment or another client-side source, so the vulnerable transformation happens after the server response has arrived. Reflected XSS is commonly injected into a server response immediately, while stored XSS is persisted by the application and later rendered to victims. All three ultimately execute in a browser; the distinction is where the injection enters the application flow.

**Q: Why is `innerHTML` dangerous if `<script>` tags inserted with it normally do not run?**

Because `innerHTML` is an HTML parser entry point, not because every string containing `<script>` executes. The parsed result can include attacker-controlled attributes, event handlers, URLs, or markup that a later code path turns into executable behavior. The safe conclusion is to treat untrusted HTML as unsafe and use `textContent` for text. If rich markup is required, sanitize it with a reviewed policy and consider Trusted Types enforcement.

**Q: What is the safest default for displaying user input?**

Use a text-oriented API such as `textContent`, create DOM nodes with `createElement` and `append`, or use a framework's normal escaped interpolation. These choices preserve the data/text distinction. Do not select `innerHTML` merely because it is shorter, and do not assume an escaping function for one context is safe in another context.

**Q: When is sanitization appropriate, and why is regex not enough?**

Sanitization is appropriate when the product must accept a restricted subset of HTML, such as formatted comments or rich text. A sanitizer parses the markup and applies a context-aware allowlist to elements, attributes, and URL protocols. Regex cannot model HTML parsing, nesting, attribute contexts, entity decoding, and browser parsing edge cases reliably. Use a maintained sanitizer such as DOMPurify, configure it narrowly, and sanitize immediately before the rich-HTML sink.

**Q: What do CSP and Trusted Types contribute?**

CSP is a browser policy that limits where scripts and other resources may load from and can prohibit unsafe inline or dynamically compiled script. Trusted Types, enforced through CSP in supporting browsers, makes selected injection sinks accept approved trusted objects instead of arbitrary strings. They are defense-in-depth: they reduce exploitability and expose unsafe assignments, but they do not fix the data-flow bug, validate backend authorization, or make a badly written sanitizer safe.

**Q: Does an `HttpOnly` cookie prevent DOM XSS?**

No. It prevents JavaScript from directly reading that cookie's value, which can reduce token exfiltration. An XSS payload can still read page data, modify the UI, and send authenticated requests from the victim's page; the browser may attach the `HttpOnly` cookie to those requests. Prevent the XSS and use cookie attributes and CSRF defenses appropriate to the authentication design.

**Q: Is React automatically safe from DOM XSS?**

React's ordinary `{value}` rendering escapes text, but the safety boundary disappears when code uses `dangerouslySetInnerHTML`, unsafe URL values, raw DOM APIs, or a vulnerable third-party component. Framework defaults are useful guardrails, not a license to skip context-aware validation. The same source-to-sink reasoning still applies.

## 6. The Traps — What Goes Wrong

- **“The server validates all inputs, so the page is safe.”** A fragment is not sent in the HTTP request, and client-side storage or API data can be transformed unsafely after the response. Trace the value in the browser from source to sink as well as validating on the server.

- **“Removing `<script>` strings is sanitization.”** Script elements are only one possible execution path, and string replacement does not understand HTML parsing or URL/attribute contexts. Use text rendering or a maintained parser-based sanitizer.

- **“HTML escaping works everywhere.”** HTML body text, an HTML attribute, a JavaScript string, a CSS value, and a URL have different grammars. Use the API designed for the context, and avoid executable contexts when possible.

- **“`textContent` and `innerHTML` are interchangeable.”** `textContent` writes one text value; `innerHTML` replaces content by parsing markup. Choosing the latter for plain text creates an unnecessary injection boundary.

- **“CSP means the bug is fixed.”** CSP may block one payload while leaving data exposure, unsafe requests, weak allowlists, or a different execution path. Treat a CSP violation as evidence of a code path to repair, not as the primary fix.

- **“Trusted Types makes every policy safe.”** A policy can return unsanitized input. Restrict policy names, centralize policy creation, use a reviewed sanitizer, and test the policy's allowed markup and URL behavior.

- **“`href` is safe because it is not HTML.”** Navigation attributes have URL semantics. Validate protocol and origin; reject schemes and destinations the feature does not require. Do not use substring checks such as `value.includes("example.com")`.

- **“A route guard protects the data.”** Client code is controlled by the user. Authorization belongs at the API/database boundary; a hidden screen is not a permission check.

## 7. Compare With Related Concepts

| Concept | Key difference | Use this rule |
|---|---|---|
| DOM-based XSS vs reflected XSS | DOM XSS is created by client-side data flow after load; reflected XSS is commonly placed into a server-generated response | Trace the injection point to decide which code path needs repair; both need output-context defenses |
| DOM-based XSS vs stored XSS | Stored XSS persists attacker input and serves it later; DOM XSS may never be stored or sent to the server | Treat every client-side source as untrusted, even when no database is involved |
| `textContent` vs `innerHTML` | Text API creates literal text; HTML API parses markup | Use `textContent` by default; use sanitized `innerHTML` only for an intentional rich-HTML feature |
| Escaping vs sanitization | Escaping makes data literal in one output context; sanitization removes unsafe parts from an allowed rich-HTML subset | Escape plain text; sanitize only when markup is a real requirement |
| CSP vs Trusted Types | CSP broadly controls resource/script behavior; Trusted Types controls accepted values at supported injection sinks | Deploy both as layers, while fixing the source-to-sink flow |
| XSS vs CSRF | XSS runs attacker code in the trusted page; CSRF causes authenticated requests without needing to read the page | Prevent XSS with output/sink controls; prevent CSRF with cookie policy, tokens, and server checks |
| XSS vs open redirect | XSS executes code in the origin; an open redirect sends the browser to an attacker-selected destination | Validate redirect targets separately from DOM content |

## 8. 🧠 The Memory Hook — What Sticks

Every DOM XSS bug is a **power upgrade at the handoff**: plain data walks in, but a sink gives it permission to become markup, navigation, or code. Keep the note on the text board with `textContent`; only send it to the markup contractor after a deliberate, reviewed sanitization step.
