# React Security, Build Tools & Web Platform

## 1. Why This Exists — The Problem First

A React component is only one part of a production boundary. The browser executes the JavaScript that the build publishes, stores data under rules the server cannot fully control, applies security policy sent by the server, and lays out pixels using platform behavior. A secure, fast, usable application therefore needs more than correct JSX.

The central question is: **which layer owns this guarantee?** React can escape a string before placing it in a text position. It cannot make an untrusted HTML document safe, authorize a request, hide a value shipped to the browser, configure a response header, or make a third-party dependency trustworthy. Those guarantees belong to a combination of React, the browser, the server, the build tool, the CDN, and the team’s release process.

The same boundary applies to performance. A component may render efficiently, but a bundler can still ship every route in the first download; a cache header can still serve stale JavaScript; a CSS rule can still force layout; and a screen can still be unusable to keyboard or assistive-technology users.

This note connects the layers that an interviewer expects a frontend engineer to distinguish:

- **Rendering safety:** escaping, dangerous HTML, sanitization, CSP, and dependency supply chain.
- **Browser security:** cookies, storage, tokens, origin boundaries, and browser platform behavior.
- **Build and delivery:** bundling, tree shaking, code splitting, source maps, cache invalidation, and deployment.
- **UI platform quality:** CSS isolation and themes, semantic accessibility, layout/paint/compositing, workers, and observers.

## 2. The Analogy — Make It Obvious

Imagine a restaurant that serves meals through a delivery app.

- React is the plating station: it assembles trusted ingredients into a UI and escapes text placed on the plate.
- Sanitization is the ingredient inspection performed before a recipe is allowed to contain controlled raw HTML.
- The server is the restaurant manager: it authorizes orders, sets security headers, and keeps secrets in the kitchen.
- The browser is the customer’s building: it enforces origin rules, cookie flags, storage behavior, layout, accessibility APIs, and the event loop.
- The bundler is the packing line: it removes unused ingredients, separates rarely ordered meals into boxes, and labels what ships.
- The CDN is the delivery network: it caches boxes and must know when a new label invalidates an old one.

React cannot repair a secret that was packed into the delivery, a manager who failed to check authorization, or a cached box with an old lock. Every layer has a different job.

~~~mermaid
flowchart LR
  Source["React source"] --> Build["Bundler\ntransforms + chunks"]
  Build --> CDN["CDN / cache"]
  CDN --> Browser["Browser\nDOM + CSS + platform"]
  Browser --> User["Accessible UI"]
  Browser --> API["Server API"]
  API --> Data["Server / database"]
  ServerPolicy["CSP, cookies, auth"] --> Browser
  Dependencies["Dependencies"] --> Build
~~~

## 3. How It Actually Works — The Full Explanation

**Text escaping and XSS.** JSX text and ordinary attribute values are escaped by React. If `comment` contains `<img onerror=...>`, rendering `{comment}` produces visible text rather than an executable element. This is a context-specific protection, not a general security system. It does not protect a manually constructed URL, a CSS injection context, an unsafe third-party widget, or a server response that is already trusted incorrectly.

Cross-site scripting (XSS) means attacker-controlled script runs in the application’s origin. Stored XSS comes from persisted content, reflected XSS from a request echoed into a response, and DOM XSS from unsafe client-side DOM construction. Prevent it with output encoding, safe DOM APIs, input validation where useful, a carefully configured Content Security Policy (CSP), dependency review, and server-side authorization. Validation is not a substitute for output encoding: input may be valid in one context and dangerous in another.

**Dangerous HTML and sanitization.** `dangerouslySetInnerHTML` deliberately bypasses React’s normal text escaping. Use it only when an actual product requirement needs a restricted HTML subset, and sanitize immediately before insertion with a maintained, correctly configured sanitizer such as DOMPurify. Treat sanitizer configuration as security-sensitive. Do not sanitize once and then concatenate new content afterward. URLs, styles, SVG, event attributes, embeds, and custom elements need special scrutiny. Sanitization reduces markup capability; it does not authorize the content or make every surrounding integration safe.

**Tokens, storage, and cookies.** JavaScript-readable `localStorage` and `sessionStorage` are exposed to any XSS running in the origin. `sessionStorage` is scoped more narrowly by tab, but it is not an XSS boundary. A long-lived bearer token in either store is therefore a high-value target. An `HttpOnly` cookie cannot be read by JavaScript, but the browser sends it automatically, so the application must address CSRF with SameSite policy, origin checks, CSRF tokens, or a suitable combination. `Secure` restricts transmission to HTTPS; `SameSite` controls cross-site sending; `__Host-` cookies add useful prefix constraints.

There is no universal “JWT storage answer.” A common browser app uses a short-lived access token in memory plus a refresh mechanism in a `Secure`, `HttpOnly`, appropriately `SameSite` cookie. A cookie-backed session can be simpler. The server must still revoke or rotate credentials, validate them on every protected request, enforce authorization, and never trust a role or hidden button from the client. Token storage changes exposure; it does not remove the need to prevent XSS and CSRF.

**Frontend environment variables and secrets.** A variable used by browser code is configuration, not a secret. Framework prefixes such as `VITE_`, `NEXT_PUBLIC_`, or similar conventions explicitly mark values for inclusion in the client bundle. Anyone can inspect JavaScript, source maps, network requests, or runtime configuration. API keys with a deliberately public restriction may be shipped; database passwords, signing keys, private API credentials, and unrestricted service tokens may not. Put sensitive operations behind an authenticated server endpoint and rotate a credential immediately if it was shipped.

**Dependencies and supply chain.** A package imported into a browser bundle runs with the application’s privileges. Review package ownership and maintenance, lock dependencies, use integrity and trusted registries where appropriate, scan transitive dependencies, monitor advisories, and keep the diff for upgrades understandable. A clean scan is evidence at one point in time, not proof that a dependency is safe. Minification also does not make malicious code safe.

**Bundling.** A bundler resolves imports, transforms JSX and TypeScript, processes CSS and assets, and emits browser-compatible chunks. Tree shaking removes code that static module analysis can prove is unused, especially with ESM. It is not magic: CommonJS, dynamic property access, side effects, and incorrectly declared package metadata can limit removal. Code splitting creates separate chunks, usually by route or feature, so the browser can defer work. It does not remove code; a user may download a split chunk later.

Use an analyzer to find large dependencies, prefer targeted imports when the library supports them, lazy-load rare routes or editors, compress assets, and avoid moving expensive parsing into the critical path. Splitting too aggressively can add request waterfalls and latency. Measure initial JavaScript, parse/compile time, long tasks, interaction latency, and real-user outcomes rather than optimizing a theoretical bundle number.

**Source maps.** Source maps map minified output back to source for debugging. Public maps improve diagnosis but may expose source, comments, internal paths, or accidentally embedded values. Keep production maps private or upload them to an error-monitoring service with access control. A source map does not make a bundle safer, and removing one does not protect a secret that is already in the emitted JavaScript.

**CSP and deployment.** CSP is a server-delivered browser policy that restricts script, style, image, connection, frame, and other sources. A nonce- or hash-based policy is generally stronger than a broad `unsafe-inline`; report-only mode helps tune a policy before enforcement. CSP is defense in depth, not a replacement for escaping, sanitization, dependency controls, or authorization. Headers must be configured by the server/CDN; React cannot set a response CSP after the page has loaded.

Hashed asset filenames allow immutable, long-lived caching for JavaScript and CSS while a small HTML entry document uses a short cache lifetime or revalidation. Deploy assets before updating the HTML reference to them. A service worker adds a programmable cache layer and can accidentally pin an old application or create an offline security problem, so version and invalidate it deliberately. Cache-Control, ETag, CDN behavior, service workers, and HTML deployment order all affect what users actually execute.

**CSS, accessibility, and the browser.** CSS Modules or locally generated class names reduce selector collisions; they do not create security boundaries or design tokens. Tokens centralize values such as color, spacing, and motion preferences. Themes can use CSS custom properties and a class or data attribute on a stable root. Prefer semantic HTML and native controls before adding ARIA. A custom button needs keyboard behavior, focus handling, name, state, and disabled semantics; a real `<button>` gets much of that from the platform.

The browser performs style calculation, layout (reflow), paint, and compositing. Animating `transform` and `opacity` often avoids repeated layout, but it is not a blanket guarantee: large layers can increase memory and compositing cost. Batch DOM reads and writes, virtualize genuinely large lists, reserve image dimensions, use responsive images, and measure with browser performance tools. The event loop runs JavaScript tasks and microtasks; long tasks block input and painting. A Web Worker can move CPU-heavy pure work off the main thread, but it cannot directly manipulate the DOM and message transfer has a cost. ResizeObserver, IntersectionObserver, and requestAnimationFrame are browser scheduling tools with their own lifecycle and cleanup requirements.

## 4. Real Code — See It Working

React’s default text path is safe for markup characters. This example is valid TypeScript/JSX and requires no effect:

~~~tsx
type CommentProps = { author: string; text: string };

export function Comment({ author, text }: CommentProps) {
  return (
    <article>
      <p>{author}</p>
      <p>{text}</p>
    </article>
  );
}
~~~

The browser receives text nodes for `text`; it does not interpret the value as HTML. The server must still authenticate the caller and authorize access to the comment.

If rich text is required, make the unsafe boundary narrow and explicit:

~~~tsx
import DOMPurify from "dompurify";

type RichTextProps = { htmlFromCms: string };

export function RichText({ htmlFromCms }: RichTextProps) {
  const safeHtml = DOMPurify.sanitize(htmlFromCms, {
    ALLOWED_TAGS: ["p", "strong", "em", "ul", "ol", "li", "a"],
    ALLOWED_ATTR: ["href", "title"],
  });

  return <article dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
~~~

This is not enough by itself: the sanitizer must be current, links may need URL-policy checks, and the server should send a CSP. Never pass raw query strings, comments, or API HTML directly to `__html`.

For a browser-visible configuration value, make the boundary obvious and keep secrets server-side:

~~~ts
const publicConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL as string,
  analyticsWriteKey: import.meta.env.VITE_ANALYTICS_WRITE_KEY as string,
};

// This code can be inspected by every visitor. Do not add a database password.
export async function loadAccount() {
  const response = await fetch(`${publicConfig.apiBaseUrl}/account`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(`Account request failed: ${response.status}`);
  return response.json();
}
~~~

`credentials: "include"` may send an `HttpOnly` session cookie; the server must configure CORS, CSRF defenses, and authorization correctly. A public analytics key is only acceptable when its provider limits its capabilities and exposure.

Dynamic imports create a code-splitting boundary. Tree shaking and splitting are different operations:

~~~tsx
import { lazy, Suspense } from "react";

const AdminReport = lazy(() => import("./AdminReport"));

export function Reports({ isAdmin }: { isAdmin: boolean }) {
  if (!isAdmin) return <p role="alert">You are not allowed to view reports.</p>;

  return (
    <Suspense fallback={<p>Loading report…</p>}>
      <AdminReport />
    </Suspense>
  );
}
~~~

The authorization check must be repeated by the server. Hiding or omitting the route in React is a user-experience decision, not an access-control decision. The dynamic import can reduce initial loading, while the bundler may separately tree-shake unused exports.

A semantic, themeable control uses platform behavior instead of recreating it:

~~~tsx
export function ThemeToggle({ dark, onToggle }: {
  dark: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" aria-pressed={dark} onClick={onToggle}>
      {dark ? "Use light theme" : "Use dark theme"}
    </button>
  );
}
~~~

The parent can update its theme class or data attribute in the click handler or state owner. There is no reason for a component effect merely to mirror a prop or state value.

## 5. The Interview Questions — All of Them, Done Properly

**How does React protect against XSS?** React escapes interpolated text and normal attribute values before committing them to the DOM. That prevents many injection cases, but it does not protect intentional raw HTML, unsafe URLs, CSS/DOM APIs, compromised dependencies, server-side XSS, or authorization. Explain the exact output context and the remaining layers.

**Why is `dangerouslySetInnerHTML` dangerous?** It bypasses React’s escaping and asks the browser to parse a string as HTML. Use a maintained sanitizer for a narrowly defined rich-text requirement, constrain URL and tag policies, and add server-side controls. Never treat a value as safe merely because it came from a CMS or database.

**Where should JWTs be stored?** First decide whether a JWT is needed. A short-lived in-memory token plus a refresh/session cookie limits persistence, while a `Secure`, `HttpOnly`, appropriately `SameSite` cookie protects the token from JavaScript reads but requires CSRF defenses. `localStorage` is convenient but exposed to XSS and persistent across sessions. The answer depends on threat model, rotation, logout, CSRF strategy, and server enforcement.

**What is CSRF?** A malicious site causes a browser to send an authenticated request to another site, commonly abusing automatically attached cookies. SameSite cookies, anti-CSRF tokens, origin or referer checks, and correct CORS are defenses. A bearer token kept out of cookies changes the threat shape but does not make XSS harmless.

**What secrets can safely go in frontend environment variables?** Only values intended for every visitor, such as a restricted public endpoint or publishable key. Build-time substitution embeds them in shipped assets. Server secrets must stay on the server or behind a server-controlled operation.

**How does tree shaking work?** The bundler statically analyzes module imports and exports and removes unreachable exports, most reliably with ESM and accurate side-effect metadata. It cannot safely remove code whose execution may have side effects, and dynamic or CommonJS patterns can reduce certainty.

**How do you reduce bundle size?** Measure first; remove or replace heavy dependencies, import only needed modules, split by route/feature, lazy-load rare work, compress assets, optimize images, and keep polyfills targeted. Check parse/compile and interaction costs, not only compressed bytes. Avoid a split graph that causes waterfalls.

**Vite vs Webpack vs Rsbuild?** Compare the actual project needs rather than memorizing a winner. Vite commonly uses fast native-ESM development and a production bundler; Webpack has a mature, highly configurable ecosystem; Rsbuild emphasizes fast Rust-based tooling with a Webpack-compatible ecosystem. Evaluate plugin compatibility, module federation, SSR, library mode, build diagnostics, team familiarity, and production output.

**What are service workers?** A service worker is a browser-managed script with lifecycle and programmable interception of requests, enabling offline behavior, caching, and sometimes push. It is not the same as a Cache-Control header: it can override normal delivery decisions and persist old code. Version caches, handle activation carefully, and provide an update strategy.

**What are reflow, repaint, and composite?** Reflow/layout calculates geometry; repaint draws pixels; compositing combines layers for display. A DOM or style change can trigger one or more stages. Prefer measured batching, stable dimensions, and transforms/opacity for suitable animations, while checking memory and frame performance in DevTools.

**How would you review a React app before production?** Trace untrusted data to DOM sinks, audit raw HTML and URL handling, inspect token/cookie policy, verify server authorization, inspect emitted assets for secrets, scan dependencies, review CSP and security headers, analyze chunks and cache headers, test keyboard/screen-reader flows, and measure real loading and interaction performance. Then verify the deployed artifact, not only the development server.

## 6. The Traps — What Goes Wrong

- **“React makes the app secure.”** React’s escaping is one output-encoding defense. It does not replace sanitization, CSP, dependency controls, CSRF defenses, or server authorization.
- **“The database value is trusted.”** Stored content can have entered through an attacker, an import, or a compromised administrator. Trust boundaries matter more than storage location.
- **“A hidden button protects admin data.”** UI visibility is not authorization. Every sensitive API operation needs server-side identity and permission checks.
- **“JWT means secure.”** JWT is a token format, not a storage, rotation, revocation, or authorization policy.
- **“`localStorage` is safe because it is same-origin.”** Same-origin JavaScript, including an XSS payload, can read it.
- **“Environment variables are secret.”** Browser build variables are usually substituted into public JavaScript.
- **“Tree shaking makes the bundle small.”** It removes provably unused code; it does not defer used code or fix a large dependency that remains reachable.
- **“Code splitting always improves performance.”** Too many chunks can add network overhead and waterfalls; measure the critical path.
- **“Minified code cannot be inspected.”** The browser must execute it, and source maps may make inspection easier.
- **“A public source map is harmless.”** It can disclose source and internal details; private upload to error monitoring is often safer.
- **“A service worker is just a cache.”** It is an additional programmable deployment layer and can keep vulnerable or stale assets alive.
- **“CSS Modules provide security.”** They reduce naming collisions, not script execution or data access.
- **“ARIA fixes accessibility.”** Native semantic elements usually provide more reliable keyboard and assistive-technology behavior.
- **“Transform is always free.”** Compositing can consume memory; validate frame time and layer count.
- **“A worker can update the UI.”** Workers cannot directly touch the DOM; message overhead and serialization also matter.

## 7. Compare With Related Concepts

| Concept | What it does | What it does not do |
| --- | --- | --- |
| React escaping | Encodes text and ordinary attributes during rendering | Sanitize raw HTML, authorize APIs, or secure dependencies |
| Sanitization | Removes disallowed markup and attributes for a defined policy | Prove business authorization or secure later string concatenation |
| CSP | Restricts browser resource and script execution sources | Replace output encoding, dependency review, or server auth |
| `HttpOnly` cookie | Prevent JavaScript from reading a cookie | Stop CSRF or prevent the browser from sending it |
| Tree shaking | Removes statically provable unused module code | Defer code that is used or fix runtime network waterfalls |
| Code splitting | Emits separately loadable chunks | Remove code from the application or guarantee faster delivery |
| CSS Modules | Scope class names to reduce collisions | Create design tokens or a security boundary |
| CSS custom properties | Share theme and design values at runtime | Automatically make contrast, motion, or markup accessible |
| Cache headers | Tell browsers/CDNs freshness and reuse rules | Replace service-worker versioning or deployment ordering |
| Service worker | Programmatically intercept browser requests | Guarantee that users receive the newest deployment |
| Web Worker | Run suitable JavaScript off the main thread | Manipulate the DOM directly or eliminate message cost |

The useful interview distinction is ownership: React describes UI output, the browser enforces platform rules, the server owns secrets and authorization, and the build/deployment system controls what code is delivered and cached.

## 8. 🧠 The Memory Hook — What Sticks

Remember **PLATE**:

- **P — Parse safely:** React escapes text; raw HTML needs a narrow sanitizer policy.
- **L — Lock the server boundary:** cookies, CSRF, authorization, and secrets belong to the correct server/browser boundary.
- **A — Assemble only what is needed:** dependencies, tree shaking, chunks, source maps, and cache strategy determine shipped code.
- **T — Treat the browser as a platform:** CSS, semantics, storage, workers, observers, layout, paint, and compositing have real rules.
- **E — Examine the deployed artifact:** test the actual headers, bundles, cache behavior, accessibility, and performance users receive.

The one-sentence answer is: **React can safely describe UI, but production safety and speed depend on the browser, server, dependency graph, bundler, CSS, and deployment all honoring their boundaries.**

Before an interview, practice tracing one user comment, one login token, one lazy route, and one theme toggle through all those layers. If you can name who owns each guarantee and what can still fail, you understand the platform rather than only the component.
