# DOM-Based XSS

## Detailed explanation
DOM-based XSS happens when frontend JavaScript takes untrusted data and writes it into DOM as executable HTML/JS. Server may return safe page, but client-side code creates vulnerability.

Common risky sinks: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, unsafe URL assignment, and `eval`.

## 1. One-line mental model
DOM-based XSS = frontend code turns attacker-controlled input into executable DOM.

## 2. Problem it solves
Developers need know XSS can be introduced entirely in client code.

## 3. Core idea
- Source = URL/user/API data.
- Sink = dangerous DOM write.
- Prefer `textContent`.
- Sanitize trusted-rich HTML.
- Use CSP as defense-in-depth.

## 4. Visual / analogy
Bad input enters pipe and comes out as script.

```txt
location.hash -> innerHTML -> script executes
```

## 5. Minimal example

```js
element.innerHTML = location.hash.slice(1); // dangerous
```

## 6. Real-world example

```js
element.textContent = userInput;
```

Safe text rendering.

## 7. Common interview questions

#### What is DOM-based XSS?
- **The Engine Mechanism (Why it behaves this way):** DOM-based Cross-Site Scripting (DOM XSS) is a security vulnerability that occurs when a client-side JavaScript application dynamically resolves data from an untrusted "source" and pipes it into an execution "sink" inside the DOM. Under the hood, during standard page loads, the server sends static markup. However, once loaded, the client-side JavaScript engine parses inputs like `location.search` or `location.hash` (the sources) and passes them to APIs like `element.innerHTML` or `eval()` (the sinks). When the browser's HTML parser receives these strings, it tokenizes them. If the string contains `<script>` blocks or inline event handlers (`<img src=x onerror=...>`), the HTML parser allocates script resources, halts DOM rendering, compiles the attacker's script payload, and pushes it onto the Call Stack, executing arbitrary JavaScript inside the victim's session.
- **The Unforgettable Mental Model:** A security guard at a club door checking bags (server filtering) vs. a club bartender who takes a glass of liquor handed over by a random guest, assumes it's safe water, and pours it straight into the ice machine (client-side script putting untrusted input into DOM). The server had nothing to do with it; the bartender (front-end script) created the poison stream locally.
- **The Trap:** Believing that because your server-side API validates all incoming data, your application is 100% immune to XSS. If a front-end script reads directly from client-side state parameters (like the URL hash `window.location.hash`) and writes it using `innerHTML`, the server never sees this fragment (as fragments are never sent to the server in HTTP requests), but the application is fully vulnerable to DOM-based XSS.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'DOM-based XSS is an entirely client-side security vulnerability where the application's JavaScript reads data from an untrusted source—such as the URL or local storage—and passes it to a dangerous DOM execution sink. Unlike reflected or stored XSS, the malicious payload never needs to touch the server; it is parsed and executed directly by the browser's DOM rendering engine via unsafe client-side scripting.'"

#### Why is `innerHTML` dangerous?
- **The Engine Mechanism (Why it behaves this way):** The `innerHTML` setter triggers the browser's full C++ HTML parser engine on the provided string. The parser tokenizes the string, builds a DOM fragment, and inserts it into the document tree. If the parsed string contains HTML tags, they are fully rendered. While modern browsers prevent executing inline `<script>` tags injected via `innerHTML` (by W3C specification), attackers easily bypass this protection by injecting tags with inline, self-triggering event handlers, such as `<img src="invalid" onerror="alert(1)">` or `<iframe src="javascript:alert(1)">`. The browser's layout engine executes the `onerror` handler synchronously on the Call Stack during the layout paint cycle.
- **The Unforgettable Mental Model:** A wood chipper. You feed in branches (HTML strings), and it spits them out as fine wood chips (DOM tree). If someone feeds in a live hand grenade (an image with an `onerror` script), the wood chipper processes it anyway, causing a devastating explosion (XSS).
- **The Trap:** Thinking that you can sanitize input for `innerHTML` by doing a simple string replacement of `<script>` and `</script>`. Attackers are highly creative and will bypass this using casing (`<sCrIpT>`), nested tags (`<scr<script>ipt>`), or purely visual DOM hooks like SVGs (`<svg onload=...>`) and interactive links.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: '`innerHTML` is highly dangerous because it invokes the browser's raw HTML parsing engine on arbitrary strings. Although modern browsers suppress `<script>` tag execution inside `innerHTML`, they immediately execute script commands attached to inline event hooks like `onerror` or `onload`. If user-controlled strings are set via `innerHTML`, we expose the application to immediate token theft and session hijacking.'"

#### How prevent DOM XSS?
- **The Engine Mechanism (Why it behaves this way):** The primary prevention strategies operate by disabling structural HTML parsing on untrusted data:
  1. **Prefer Safe APIs:** Use `element.textContent` or `element.innerText` instead of `innerHTML`. These APIs treat input strictly as a DOMString literal. Under the hood, the engine converts character symbols into raw text nodes, rendering `<`, `>`, and `&` as literal text without invoking the HTML tokenizer or compilation loops.
  2. **Safe Navigation Sinks:** Avoid assigning dynamic strings to URL parameters like `location.href` or `iframe.src` without validating the protocol. Force target strings to begin strictly with `https://` or `http://` to prevent `javascript:` and `data:` schemes from executing.
  3. **Trusted Types API:** In modern browsers, enable Trusted Types via CSP headers. This forces the browser engine to throw a runtime Type Error if a developer attempts to pass a raw string to a dangerous sink like `innerHTML`, requiring them to pass a pre-sanitized `TrustedHTML` object instead.
- **The Unforgettable Mental Model:** An automated border control scanner. Instead of looking at a paper visa (unsafe strings), every visitor must pass their biometric passport through a highly regulated electronic scanner (Trusted Types) that blocks entry if even a single security signature is missing.
- **The Trap:** Thinking React's JSX is completely safe. While React escapes strings placed in braces by default, React developers are highly vulnerable to XSS if they use the dangerous backdoor property `dangerouslySetInnerHTML={{ __html: userInput }}` or bind dynamic hrefs to anchors `href={userInput}` without validation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'We prevent DOM XSS by avoiding dangerous sinks entirely, favoring secure APIs like `textContent` and `setAttribute` which treat inputs strictly as un-parsed text string data. If rich HTML rendering is an absolute business requirement, we must pass the input through a robust, battle-tested sanitization library like DOMPurify, and leverage browser-enforced security mechanisms like Trusted Types to statically block unsafe string assignments at the engine level.'"

#### What is sanitization?
- **The Engine Mechanism (Why it behaves this way):** Sanitization is the process of parsing an untrusted HTML string into an in-memory DOM tree in a decoupled document fragment, scanning all elements, attributes, and styles against a strict safelist, stripping away any unsafe tokens (like `<script>`, `<iframe>`, `onerror`, `onload`, or `javascript:` protocols), and serializing the cleaned DOM tree back into a safe HTML string. This ensures that the resulting string contains only benign structural elements (like `<b>`, `<i>`, or `<p>`) and can be safely piped into `innerHTML`.
- **The Unforgettable Mental Model:** A security decontamination chamber. You place raw, muddy clothing (untrusted HTML string) into a sealed chamber. The machine sanitizes it, washing off all chemicals, dirt, and hazardous items (scripts, onerror hooks), returning perfectly clean, safe clothing you can put on without getting sick.
- **The Trap:** Trying to write your own custom regex or string replacements for sanitization. HTML is a highly complex, context-sensitive language that cannot be safely parsed or validated using regular expressions. Attackers will always find bypasses. You must use DOMPurify or the built-in browser Sanitizer API.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'Sanitization is the systematic parsing and filtration of HTML strings against an explicit schema whitelist. It decomposes the string into a temporary, isolated document fragment, strips out executable nodes and dangerous event-handler attributes, and returns a clean, safe HTML subset. We must never use custom regex for this; we should always rely on highly optimized, industry-standard libraries like DOMPurify.'"

#### What is CSP role?
- **The Engine Mechanism (Why it behaves this way):** Content Security Policy (CSP) is an HTTP response header or HTML meta tag that enables developers to configure a strict declarative sandbox within the browser's security rendering engine. During page evaluation, the engine parses the CSP rules (e.g., `default-src 'self'; script-src 'self' https://trusted.com;`). When the engine encounters a script tag or inline script (whether legitimate or injected via XSS), it checks the source domain against the CSP list. If the source is not explicitly whitelisted, or if CSP bans inline scripts (via omitting `'unsafe-inline'`), the engine blocks script execution, halts download of the resource, and dispatches a violation report to a configured telemetry endpoint.
- **The Unforgettable Mental Model:** A strict security guard checking names on a VIP guest list at the door of a theater. Even if an attacker manages to slip a fake ticket into your bag (injects an inline script via innerHTML), the guard at the stage doors (CSP) checks the script's domain, doesn't find it on the pre-approved whitelist, and refuses to let them perform.
- **The Trap:** Relying on CSP as your primary line of defense instead of securing your code. If your CSP contains lenient directives like `unsafe-inline` or loads scripts from broad, user-controlled CDNs, an attacker can easily bypass the policy. CSP is a safety net (defense-in-depth), not a replacement for writing secure code.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: 'Content Security Policy serves as a critical defense-in-depth safety net. It operates at the browser execution layer to restrict where scripts can be loaded from and bans the execution of inline script tags or dynamic code evaluation like `eval()`. While it doesn't prevent inputs from being injected into the DOM, it halts injected scripts from running, effectively neutralizing the payload even if a developer introduces an XSS sink vulnerability.'"

## 8. Active recall test

#### 1. What is a source?
- **Explanation/Answer:** A source is an untrusted entry point from which user-controlled data enters the application (e.g., `location.search`, `location.hash`, `document.referrer`, or API responses).

#### 2. What is a sink?
- **Explanation/Answer:** A sink is a dangerous DOM API or function that evaluates and renders strings as executable markup (e.g., `innerHTML`, `outerHTML`, `document.write`, `eval()`, `setTimeout()`).

#### 3. Safe text API?
- **Explanation/Answer:** `textContent` (or `innerText`) is the safe API because it forces the browser to render inputs as literal strings, bypassing the HTML parsing engine entirely.

#### 4. When to sanitize?
- **Explanation/Answer:** You should sanitize whenever you are forced to render user-controlled rich text or HTML layout markup inside a raw HTML sink (like `innerHTML`).

#### 5. Why is CSP not enough alone?
- **Explanation/Answer:** Because a loose or misconfigured CSP (e.g., one that allows `'unsafe-inline'` or wildcards) can be easily bypassed by attackers, and because CSP is a mitigation layer that blocks payload execution but does not fix the underlying code bug that leaks the data.

## 9. Mistakes / traps
- Trusting URL params.
- Sanitizing then modifying HTML unsafely.
- Using `innerHTML` for plain text.
- Thinking React protects manual DOM writes.

## 10. Compare with related concepts
- **DOM XSS vs reflected XSS:** client sink vs server response reflection.
- **Escaping vs sanitizing:** encode text vs allow safe HTML subset.
- **CSP vs prevention:** mitigation layer vs primary fix.

## 11. Summary from memory
Explain how URL hash can become DOM XSS through `innerHTML`.

## 12. Spaced revision prompts
- 1 day: Define DOM XSS.
- 3 days: List dangerous sinks.
- 7 days: Replace `innerHTML`.
- 14 days: Explain CSP role.

