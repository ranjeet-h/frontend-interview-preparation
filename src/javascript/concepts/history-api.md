# History API

## 1. Why This Exists — The Problem First

An SPA can replace the screen with a user profile without asking the browser to load a new document. That feels fast, but it creates a confusing failure: the address bar still says `/dashboard`, the Back button may leave the application entirely, and refreshing `/users/42` can return a server 404 even though the client router knows that route.

The History API lets the application record those same-document navigations in the browser's session history. The browser keeps one document alive while the application changes the URL and renders the matching view; later, a Back or Forward traversal gives the application a chance to restore the corresponding view.

## 2. The Analogy — Make It Obvious

Imagine a museum with one building and a visitor's paper itinerary.

- The building is the current `Document`. Staying in the building means no full document navigation or page teardown.
- Each exhibit visit is a session-history entry: it has a URL and optional application state describing what should be restored.
- `pushState()` adds another line to the itinerary. The visitor can later go Back to the previous exhibit.
- `replaceState()` edits the current line. It is useful when the current exhibit changes its filter or when the app wants to record the initial state without creating an extra Back stop.
- Back and Forward are itinerary traversal. The browser moves the active line and emits `popstate`, which tells the application to render what that line represents.

The museum staff still need a front desk. If a visitor arrives from outside with `/users/42` written on a ticket, the web server must first hand them the SPA's entry document. Only then can the client router read that URL and take them to the right exhibit.

## 3. How It Actually Works — The Full Explanation

The browser exposes one `History` object as `window.history`. It represents the session history for the current tab or frame, not a list that JavaScript may freely inspect: scripts can navigate backward and forward, but they cannot enumerate arbitrary previous URLs or clear the entire history.

There are two different operations that developers often blur together:

1. **Mutating the active entry.** `history.pushState(state, unused, url)` creates a new same-document entry. `history.replaceState(state, unused, url)` changes the current entry in place. The URL must be valid and same-origin. Neither method fetches the URL, checks whether a server route exists, or reloads the document.
2. **Traversing entries.** `history.back()`, `history.forward()`, and `history.go(delta)` ask the browser to move to another entry asynchronously. A user clicking Back or Forward does the same thing. During that traversal, `location` may already reflect the destination while the `Document` is not fully updated yet. In navigation sequences where a `pageshow` event applies, it occurs before `popstate`; `popstate` is near the end of the sequence and comes before the browser restores persisted user state such as scroll position or form values. When the active entry changes, the browser can dispatch `popstate` to the active document; `event.state` is the stored state for that entry, or `null` when no state was recorded.

The crucial event rule is easy to remember: calling `pushState()` or `replaceState()` does **not** call the `popstate` listener. The code that performs a programmatic route change must render the new route itself. The listener exists for browser traversal (and for `history.back()`/`forward()`/`go()`), where the browser changes the active entry outside the router's normal click handler.

The `state` argument is stored using the structured-serialization rules. The object you pass is not a live reference that the browser keeps pointing at; when the entry is later activated, `history.state` and `event.state` expose a deserialized copy. Functions, DOM nodes, and other non-serializable values can cause `DataCloneError`, and browsers may impose implementation limits on how much state can be stored. Store a small route identifier or filter snapshot, not an application store or secret.

The URL and the state object solve different problems. The URL is visible, bookmarkable, shareable, and sent as the request target on a later document load. The state object is convenient for restoring same-document UI, but it is not a server-backed source of truth and should not be required for a cold load. A robust router can reconstruct the view from `location.pathname`, `location.search`, and server data even when `event.state` is `null`.

An SPA usually follows this sequence:

1. Intercept an eligible internal link and call `preventDefault()` so the browser does not perform a full navigation.
2. Call `pushState()` for a meaningful route transition, or `replaceState()` for a correction/initialization/filter update that should not add a Back stop.
3. Render or fetch data for the new URL because History API methods do not render anything.
4. Listen for `popstate`, read `location` (and optionally `event.state`), and render the route selected by the now-active entry.

Traversal is not the same as reloading. A hard reload is a document load: the browser requests and initializes the document again, so it does not fire `popstate` merely because the page was reloaded. `popstate` belongs to history traversal, such as same-document Back or Forward after `pushState()`/`replaceState()` entries have been created. A cross-document Back or Forward can load another document; any `popstate` behavior then belongs to the history-entry activation sequence in that document, not to the reload itself.

On a hard refresh or direct visit, the browser sends an HTTP request for the path before the SPA exists. The server or CDN therefore needs a fallback that serves `index.html` for application routes while still returning real assets and API responses normally. This fallback is a deployment requirement, not a feature provided by `pushState()`.

For exact browser behavior, see [MDN's History API guide](https://developer.mozilla.org/en-US/docs/Web/API/History_API/Working_with_the_History_API), [`History`](https://developer.mozilla.org/en-US/docs/Web/API/History), and the [`popstate` event](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event).

## 4. Real Code — See It Working

**A minimal same-document router (browser page).**

Run this as a complete browser-page script. It creates its own `#app` and links, so it has no HTML or JavaScript prerequisites. The example deliberately renders in two places: the navigation function handles the route change it initiated, while the `popstate` listener handles a later Back or Forward traversal.

```js
document.body.innerHTML = `
  <nav>
    <a href="/" data-route>Home</a>
    <a href="/users" data-route>Users</a>
  </nav>
  <main id="app"></main>
`;

const app = document.querySelector("#app");

function render(url) {
  const route = `${url.pathname}${url.search}`;
  app.textContent = route === "/users"
    ? "Users view"
    : route === "/"
      ? "Home view"
      : "Not found";
}

function navigate(href, { replace = false } = {}) {
  const url = new URL(href, window.location.href);

  // Do not let a router silently turn an external URL into a local route.
  if (url.origin !== window.location.origin) return;

  const relativeUrl = `${url.pathname}${url.search}${url.hash}`;
  const method = replace ? "replaceState" : "pushState";
  history[method]({ route: relativeUrl }, "", relativeUrl);

  // pushState/replaceState do not emit popstate, so render this transition now.
  render(url);
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-route]");
  if (!link || event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  event.preventDefault();
  navigate(link.href);
});

window.addEventListener("popstate", () => {
  // location is authoritative for which URL is active after traversal.
  render(new URL(window.location.href));
});

render(new URL(window.location.href));
```

The router should usually use real `<a href>` links so copying the link, opening it in a new tab, and browser accessibility behavior still work. A production router also handles route data loading, cancellation of stale requests, scroll restoration, focus, and error states; History API calls alone provide none of those.

**Choosing `pushState` or `replaceState`.**

This fence is also self-contained: it creates the display element and local `render` helper before exercising both methods.

```js
document.body.innerHTML = `<main id="app"></main>`;
const app = document.querySelector("#app");

function render(url) {
  app.textContent = `${url.pathname}${url.search}`;
}

function openProduct(productId) {
  // A meaningful navigation should be a Back-button stop.
  const url = `/products/${encodeURIComponent(productId)}`;
  history.pushState({ kind: "product", productId }, "", url);
  render(new URL(url, location.href));
}

function updateFilter(filter) {
  const url = new URL(location.href);
  url.searchParams.set("filter", filter);

  // Typing through filter values should not require ten Back clicks.
  history.replaceState({ kind: "filter", filter }, "", url);
  render(url);
}

openProduct("42");
updateFilter("featured");
```

**Restoring state on Back/Forward.**

This fence is also self-contained: the local helpers and fixtures stand in for a real product renderer and URL-based route renderer.

```js
document.body.innerHTML = `<main id="app"></main>`;
const app = document.querySelector("#app");
const products = { "42": "Keyboard", "7": "Notebook" };

function showProduct(productId) {
  app.textContent = `Product: ${products[productId] ?? "Unknown"}`;
}

function showRouteFromUrl(url) {
  app.textContent = url.pathname === "/products"
    ? "Product list"
    : "Not found";
}

function renderRoute() {
  const url = new URL(location.href);

  // Parse the URL so a direct visit or reload works even without history.state.
  const productMatch = url.pathname.match(/^\/products\/([^/]+)$/);
  if (productMatch) {
    const productIdFromUrl = decodeURIComponent(productMatch[1]);
    showProduct(productIdFromUrl);
    return;
  }

  showRouteFromUrl(url);
}

window.addEventListener("popstate", renderRoute);
renderRoute();
```

For a real page, `showProduct` and `showRouteFromUrl` would update the DOM or start a data request. Calling `pushState()` stores the entry; it does not call either rendering function for you. The URL path is parsed rather than relying only on `history.state`: a direct visit or cold reload can arrive at `/products/42` without state created by this SPA, so state alone cannot restore the requested product.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What problem does the History API solve for an SPA?**

It lets an SPA represent meaningful client-side view changes in the browser's session history without loading a new document for every view. The application updates the URL and its own UI, while Back and Forward remain useful. It does not replace server routing: a direct visit or refresh still needs the server to return the SPA entry document.

**Q: What is the difference between `pushState()` and `replaceState()`?**

`pushState()` appends a new entry, so the previous URL remains reachable with Back. `replaceState()` edits the active entry, so it does not add another Back stop. Use push for a user-recognizable navigation such as opening a product; use replace for initialization, canonicalization, or rapidly changing state such as a filter.

**Q: Does `pushState()` reload the page or fire `popstate`?**

No. It changes the active entry's URL and optional state without fetching that URL or replacing the current `Document`. It also does not fire `popstate`. The application must render the new view immediately. A later traversal to that entry can fire `popstate`.

**Q: Does a reload fire `popstate`?**

No. Reloading is a document load, so the browser initializes the document again rather than notifying the current document about a history traversal. Same-document Back and Forward traversal is the case that normally reaches a `popstate` listener.

**Q: What is `popstate`, and what is in `event.state`?**

`popstate` is a `Window` event associated with a change of the active session-history entry, commonly caused by Back, Forward, or `history.go()`. Traversal is asynchronous: by the time the event runs, `location` may already show the new URL even though the `Document` is not fully updated. When a `pageshow` event applies in the navigation sequence, it occurs before `popstate`, and persisted user state restoration occurs after it. `event.state` is a deserialized copy of the state stored for the newly active entry, or `null` when that entry has no state. The listener should inspect the current `location` as well; the URL is part of the route contract and does not depend on a custom state object being present.

**Q: Why is `replaceState()` often used during application startup?**

The initial document entry may have no application state. Replacing it lets the app attach the initial view's small restoration state to the existing entry. When the user later goes Back to that entry, the router can restore it. This records the starting point without manufacturing an extra history entry.

**Q: What can be stored in the `state` argument?**

Any value the browser can serialize under its structured-serialization rules, subject to browser limits. It is copied rather than retained as a live object reference. Functions and DOM nodes are common failures, and large state is a poor design even if it happens to work. Prefer a small ID, route kind, or filter snapshot and refetch authoritative data when necessary.

**Q: Why does an SPA still need a server fallback?**

After a hard refresh or a bookmark to `/users/42`, the browser has not loaded the SPA yet, so it makes an HTTP request for `/users/42`. The server must serve `index.html` for that application route; then the client router can boot, read the URL, and render the view. `pushState()` cannot configure that server behavior and does not verify that the URL exists.

**Q: How is History API routing different from hash routing?**

History API routing uses ordinary paths and query strings such as `/users?sort=name`, which are cleaner and integrate naturally with server requests but require server fallback configuration. Hash routing uses the fragment after `#`; changing it stays within the document and emits `hashchange`, and servers do not receive the fragment, so fallback is simpler. Choose based on deployment constraints and URL requirements rather than assuming one is universally superior.

## 6. The Traps — What Goes Wrong

- **Expecting `pushState()` to render the page.** It only changes the history entry. Call the same route-rendering/data-loading path that a `popstate` handler uses.

- **Expecting `pushState()` to fire `popstate`.** It does not. Handle the initiating navigation synchronously in application code; reserve the listener for traversal.

- **Using `pushState()` for every keystroke.** Each call creates a Back-button stop. Use `replaceState()` for transient URL state such as a search filter, or commit the filter only when the user submits it.

- **Storing live application objects in history.** History state is serialized and copied. Functions, nodes, class instances with meaningful behavior, secrets, and large caches are either invalid or the wrong ownership model. Store identifiers and reconstruct the rest.

- **Treating `event.state` as the only route source.** An entry can have `null` state, and a user can load the URL directly. Derive the route from `location` and treat state as an optional restoration hint.

- **Assuming a pretty URL proves the server supports it.** The address bar can show `/settings` even if no server route exists. Test direct navigation and hard refreshes in the deployed environment, not only in-app clicks.

- **Intercepting every click.** Modified clicks, downloads, external links, and links targeting another browsing context should keep native browser behavior. A router must narrow its interception rules.

- **Putting authorization in the URL or history state.** Both are client-visible and can remain in browser history. Authorization must be enforced by the server; a route change is never a permission check.

## 7. Compare With Related Concepts

| Concept | Key difference | Use it when |
|---|---|---|
| `pushState()` | Creates a new same-document history entry | The user completed a meaningful navigation that Back should undo |
| `replaceState()` | Rewrites the current entry | Normalizing the current URL or updating transient state without adding a Back stop |
| `popstate` | Notification after active history traversal; it is not a navigation method | Synchronizing the UI when Back, Forward, or `history.go()` changes the active entry |
| `location.assign()` / normal link navigation | Requests a new document and runs the normal navigation lifecycle | The destination should be a real document or the app intentionally needs a full reload |
| Hash routing / `hashchange` | Stores the route in `location.hash`; fragments are not sent to the server | A deployment cannot rewrite application paths, or a fragment-based URL is acceptable |
| `URLSearchParams` | Parses and constructs query-string data; it does not create history entries | Encoding filter, sort, and pagination state before passing the URL to History API or a request |
| Application state | Live UI/data owned by the app, not automatically synchronized with browser history | Managing data that should not be bookmarkable or traversed as navigation |

The practical rule is: make the URL contain enough information to identify the view, use history state only to optimize same-document restoration, and keep the server authoritative for data and permissions.

## 8. 🧠 The Memory Hook — What Sticks

The History API is a **paper itinerary inside one museum**: `pushState` adds a stop, `replaceState` edits the current stop, and `popstate` is the staff notification when the visitor walks Back or Forward. The itinerary changes what the browser remembers, but it never builds the exhibit or the front desk—your renderer and server fallback still must do that.
