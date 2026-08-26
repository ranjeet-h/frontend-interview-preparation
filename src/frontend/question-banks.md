# Frontend Questions

This is a **study bank**, not a checklist. Each section below is one skill area interviewers probe at senior frontend rounds. Read the opening context first so you know *why* the topic matters, then work through the five questions out loud as if you're in the room — predict your answer, then read the full explanation.

Do not memorize scripts. If you can explain the mechanic in your own words after one read, you are done with that section.

Source: `Frontend_Questions.csv` (deduplicated). Deep dives for individual HTML/CSS/web topics live in the [Frontend Fundamentals](index.md) chapters.

## Question index

| # | Skill area | Questions |
|---|---|---|
| 1 | [JavaScript fundamentals](#1-javascript-fundamentals) | 5 |
| 2 | [JavaScript advanced](#2-javascript-advanced) | 5 |
| 3 | [DOM and browser](#3-dom-and-browser) | 5 |
| 4 | [React core](#4-react-core) | 5 |
| 5 | [React hooks](#5-react-hooks) | 5 |
| 6 | [State management](#6-state-management) | 5 |
| 7 | [Data libraries](#7-data-libraries-tanstack-query-axios) | 5 |
| 8 | [Performance tuning](#8-performance-tuning) | 5 |
| 9 | [Git](#9-git) | 5 |
| 10 | [CSS core](#10-css-core) | 5 |
| 11 | [Routing](#11-routing) | 5 |
| 12 | [API and data fetching](#12-api-and-data-fetching) | 5 |
| 13 | [Performance metrics](#13-performance-metrics) | 5 |
| 14 | [Security](#14-security) | 5 |
| 15 | [Testing](#15-testing) | 5 |
| 16 | [Build tools](#16-build-tools) | 5 |
| 17 | [Architecture](#17-architecture) | 5 |
| 18 | [Accessibility](#18-accessibility) | 5 |
| 19 | [Frontend system design](#19-frontend-system-design) | 5 |

---

## 1. JavaScript fundamentals

**Why interviewers care:** Almost every frontend round still tests whether you understand how JavaScript actually runs — not syntax trivia, but scope, async order, and `this`. Mess these up and you'll mis-debug React effects, closures in handlers, and race conditions.

**Core idea:** JavaScript is single-threaded with lexical scope. Functions remember where they were created. `this` is decided at call time. Async work queues on the event loop after the current stack clears.

### Questions and answers

**Q: Explain scope with an example.**

Scope is where a variable can be read. JavaScript uses **lexical scope** — a function sees variables from the text block where it was written, not where it is called. Inner functions can read outer bindings; outer functions cannot read inner locals.

```javascript
function outer() {
  const message = "hello";
  function inner() {
    console.log(message); // "hello" — inner sees outer's binding
  }
  inner();
}
```

Block scope with `let`/`const` limits variables to `{ }` blocks. `var` is function-scoped and hoisted — a common source of bugs in loops.

**Q: What is a closure and a real use case?**

A closure is a function plus the variables it still has access to after its outer function finished. The inner function "closes over" those bindings.

Real uses: private state (counter factory), event handlers that remember config, debounce/throttle timers, React hooks holding state between renders. If you see a function defined inside another function and returned or passed as a callback, you are probably looking at a closure.

**Q: How does hoisting work for let, var, and functions?**

During compilation, declarations are registered before execution runs. **`var`** is hoisted and initialized to `undefined` — you can read it before the line, but it is `undefined`. **Function declarations** are fully hoisted — you can call them before their line in the source. **`let` and `const`** are hoisted but stay in the **temporal dead zone** until their declaration line runs — reading them early throws `ReferenceError`.

**Q: Explain `this` binding in different contexts.**

`this` is set by **how** a function is called, not where it is written (except arrow functions). Default call: `this` is `undefined` in strict mode (or `window` in sloppy mode). Method call: `this` is the object before the dot. `call`/`apply`/`bind`: you set `this` explicitly. `new`: `this` is the new instance. **Arrow functions** don't have their own `this` — they use `this` from the enclosing scope. That is why arrow handlers in React class components were popular, and why arrow callbacks in `useEffect` dependencies behave differently from regular functions.

**Q: Explain the event loop with async/await.**

Synchronous code runs on the call stack until it is empty. `Promise.then` and `await` schedule **microtasks** — they run before the next timer or DOM event (**macrotask**). So `async/await` reads like sync code but still yields: everything after `await` is a microtask. Two `await` lines run in order; they do not block the main thread for I/O — the network happens in the background and the continuation queues when the promise settles.

**Traps:** Saying closures "copy values" — they capture **bindings** (live variables), which is why loop bugs happen with `var`. Confusing `this` in callbacks passed to `setTimeout`. Thinking `await` runs on a new thread — it does not.

**Memory hook:** Scope is lexical, `this` is call-site, async is stack-then-microtasks. Draw the call stack and one microtask queue and you can answer half the JS fundamentals round.

---

## 2. JavaScript advanced

**Why interviewers care:** Senior roles expect you to implement or reason about utilities the ecosystem gives you for free — debounce, bind, memoization — and to understand prototypes without reciting class syntax.

**Core idea:** Functions are objects with a prototype chain. Patterns like currying and memoization trade memory for reuse or fewer executions.

### Questions and answers

**Q: What is currying and why is it useful?**

Currying turns `f(a, b, c)` into `f(a)(b)(c)` — each call fixes one argument until all are supplied. Useful for partial application: `const add5 = curry(add)(5)` then `add5(3)` → 8. Libraries use it for configurable pipelines and typed function composition. In interviews, mention reuse and cleaner APIs, not currying for its own sake.

**Q: Explain debounce or throttle.**

**Debounce:** wait until calls stop for `delay` ms, then run once. Search-as-you-type, resize end, autosave. **Throttle:** run at most once per `delay` ms while events keep firing. Scroll position, parallax, high-frequency mouse move. Debounce = "when they're done"; throttle = "not more than every N ms."

**Q: Memoization use case.**

Cache results of a **pure** function by input key. Expensive filter/sort on big lists, recursive fibonacci, React `useMemo` for derived data. Only helps when the same inputs repeat; costs memory. Useless if inputs are always unique objects unless you key by a stable id.

**Q: How does the prototype chain work?**

Objects have an internal `[[Prototype]]` link. Property lookup walks the chain: own properties first, then prototype, then its prototype, until `null`. `Array.prototype.push` works on every array because arrays delegate to `Array.prototype`. `class` syntax is sugar over constructor functions and prototypes.

**Q: How would you implement custom `bind`?**

Return a new function that calls the original with a fixed `this` and optional preset args. Must handle `new` — if called with `new`, the bound `this` is ignored and a new instance is created. `call` and `apply` invoke immediately; `bind` returns a function for later.

**Traps:** Memoizing impure functions. Debounce without `clearTimeout` on each call. Forgetting `bind` must support `new`.

**Memory hook:** Currying fixes args one at a time; debounce waits for quiet; throttle caps rate; prototype is the lookup chain; bind returns a delayed `call` with locked `this`.

---

## 3. DOM and browser

**Why interviewers care:** You touch the DOM through frameworks, but bugs still show up as wrong event targets, layout jank, and mystery reflows. Senior devs know what the browser is doing under React.

**Core idea:** Events flow capture → target → bubble. Rendering is parse → style → layout → paint → composite. Prefer delegation and observers over polling.

### Questions and answers

**Q: Difference between bubbling and capturing?**

Capturing goes from `window` down to the target; bubbling goes back up. Most code uses bubbling (`addEventListener('click', fn)` — third arg `false` by default). Capturing is useful when you need to intercept early. `event.stopPropagation()` stops further travel.

**Q: Event delegation with example.**

Attach one listener on a parent; use `event.target` or `event.target.closest('button')` to see which child was clicked. Works for dynamic children, fewer listeners, less memory. Lists, tables, and menus are classic cases.

**Q: What causes reflow and repaint?**

**Reflow (layout):** geometry changes — width, height, position, DOM insert/remove, reading layout properties after writes. **Repaint:** visual-only changes like `color`. Reflow is usually costlier. Batch reads and writes; avoid interleaving `offsetHeight` with style changes in loops.

**Q: Explain the browser rendering pipeline.**

HTML → DOM. CSS → CSSOM. Combined render tree → layout (compute geometry) → paint (pixels) → composite (layers). JS can force sync layout if you read layout after mutating style. Critical path optimization: less blocking CSS/JS before first paint.

**Q: When would you use IntersectionObserver?**

When you need to know if an element entered the viewport — lazy-load images, infinite scroll, pause off-screen video, analytics visibility. Better than scroll listeners: browser optimizes, callback runs when intersection changes, not every pixel scrolled.

**Traps:** Assuming `event.target` is always the button (might be a child span). Using `innerHTML` with user content. One scroll listener doing heavy work every frame.

**Memory hook:** Events ride down then up; layout is expensive so batch DOM work; observers beat scroll polling for visibility.

---

## 4. React core

**Why interviewers care:** React is still the default SPA stack. They want ownership of data, render model, and forms — not API memorization.

**Core idea:** UI = f(state). Props down, events up. Reconciliation uses element type and keys to diff trees.

### Questions and answers

**Q: Difference between props and state?**

Props are inputs from parent — read-only for the child. State is owned by the component and triggers re-render when updated. If data changes over time inside a component, it is state (or derived from state). If it comes from outside, props.

**Q: How does React re-render work?**

State or props change → component function runs again → React builds a new element tree → reconciles with previous → commits DOM updates where needed. Parent re-render usually re-renders children unless memoized. Render ≠ DOM update every time.

**Q: Why are keys important in lists?**

Keys tell React which item is which across updates. Stable unique ids preserve component state and avoid bugs when reordering. Index as key breaks when list order changes — wrong row state, bad animations.

**Q: Controlled vs uncontrolled components?**

Controlled: value in React state (`value` + `onChange`). Single source of truth, easy validation. Uncontrolled: DOM holds value (`ref`, `defaultValue`). Fine for simple forms or file inputs. Controlled is default for most app forms.

**Q: How did hooks replace class components?**

Hooks put state and effects in functions — same model as render, easier to extract logic into custom hooks, less `this` binding pain, smaller bundles. Classes still work but hooks are the idiomatic pattern for new code.

**Traps:** Mutating state directly. Keys from random `Math.random()`. Lifting state too high "just in case."

**Memory hook:** Props in, events out, state owns change, keys are identity, controlled means React owns the input value.

---

## 5. React hooks

**Why interviewers care:** `useEffect` bugs ship to production constantly — stale closures, missing deps, race conditions. Senior candidates explain synchronization, not lifecycle charts.

**Core idea:** Hooks run each render. Effects sync with external systems after paint. Dependencies must list every value from render that the effect reads.

### Questions and answers

**Q: Explain `useEffect` lifecycle.**

After render commits to screen, React runs effects. Cleanup runs before the next effect run and on unmount. Use for subscriptions, timers, DOM sync, fetching (with abort). Not for deriving state from props — do that in render.

**Q: Common dependency array mistakes.**

Missing deps → stale values. Unstable deps (`{}`, inline functions) → infinite loops. Empty `[]` when you meant to react to prop changes. Fix: list honest deps, stabilize with `useCallback`/`useMemo` when justified, or move logic into event handlers.

**Q: `useMemo` vs `useCallback` in detail.**

`useMemo` caches a **computed value** between renders when deps unchanged. `useCallback` caches a **function reference**. Use when passing callbacks to memoized children or expensive calculations — not everywhere. Measure first.

**Q: How does the cleanup function work?**

Returned function from effect runs before re-running the effect and on unmount. Cancel fetch (`AbortController`), clear intervals, unsubscribe websockets. Prevents updates after unmount and stale request races.

**Q: How to create custom hooks?**

Extract stateful logic into `function useX() { ... return ... }`. Must follow rules of hooks — only call at top level of React functions. Share behavior, not UI. `useFetch`, `useLocalStorage`, `useMediaQuery` are patterns.

**Traps:** `useEffect` for everything. No cleanup on fetch. `useMemo` on cheap operations.

**Memory hook:** Effects sync after paint; deps are a contract; cleanup cancels work; custom hooks are shared state machines.

---

## 6. State management

**Why interviewers care:** Apps fail when server cache, UI state, and URL state are one tangled blob. Seniors separate concerns and pick the smallest tool that works.

### Questions and answers

**Q: What is lifting state up?**

Move shared state to the closest common ancestor of components that need it. Pass value down, pass updater callbacks up. When drilling hurts, consider context or a store — but try colocating state down first.

**Q: Context API vs Redux?**

Context: simple broadcast of stable-ish values (theme, locale, auth snapshot). Every consumer re-renders on value change unless split contexts or memoized. Redux/Zustand: frequent updates, middleware, devtools, selectors, normalized entities. Don't put fast-changing server lists in Context alone.

**Q: How is async state handled?**

Model `idle | loading | success | error` explicitly. Never store raw promises in state. TanStack Query owns server async state — caching, deduping, retries. UI state stays local or in a small client store.

**Q: Client state vs server state?**

Client: modal open, form draft, selected tab. Server: data from API, can go stale, should be cached and invalidated. Mixing them makes invalidation impossible to reason about.

**Q: Why is normalization important?**

Nested API JSON duplicated across components leads to inconsistent updates. Store entities by id `{ users: { byId, allIds } }` — update one place, selectors derive views. Redux Toolkit and many apps use this shape.

**Memory hook:** Lift until it hurts, Context for slow-changing globals, query library for server data, normalize nested API sludge.

---

## 7. Data libraries (TanStack Query, axios)

**Q: Why use TanStack Query?**  
It is a server-state cache: dedupes requests, handles stale/fresh, retries, background refetch, loading/error flags. Stops every component reinventing fetch + useEffect.

**Q: How does caching work in React Query?**  
Query keys identify cache entries. `staleTime` = how long data is fresh without refetch. `gcTime` (formerly cacheTime) = how long unused data stays in memory. `invalidateQueries` after mutations refreshes related data.

**Q: Axios vs fetch?**  
Axios: interceptors, automatic JSON, timeouts, wider browser story in older apps. `fetch`: built-in, need manual `res.ok` check and `res.json()`. Both fine; axios wins for cross-cutting auth/error layers.

**Q: Handling loading and error states?**  
Explicit UI for each: skeleton while loading, retry on error, empty state when success but no data. Centralize API error shape in one client layer.

**Q: Managing stale data?**  
Tune `staleTime`, show cached data while revalidating (`isFetching`), invalidate on mutation success, optimistic updates with rollback on failure.

---

## 8. Performance tuning

**Q: Route-based code splitting?**  
`React.lazy` + `Suspense` per route — initial bundle excludes unvisited pages. Vite/webpack emit separate chunks automatically.

**Q: List virtualization?**  
Render only visible rows (+ overscan). Constant DOM size for 10k items. `@tanstack/react-virtual`, `react-window`.

**Q: How component splitting helps?**  
Smaller trees re-render less when state is local. Easier to lazy load and test.

**Q: Causes of unnecessary re-renders?**  
New object/function props each render, context value changing every render, state too high in tree. Fix: move state down, memoize children, split context.

**Q: How do you profile?**  
React Profiler, Performance tab, Web Vitals in field data. Fix measured bottleneck.

---

## 9. Git

**Q: Merge vs rebase?**  
Merge preserves branch topology with a merge commit. Rebase replays commits on new base — linear history, rewrites commits. Rebase locally; merge (or squash merge) on shared main.

**Q: Resolve conflicts?**  
Open conflicted files, understand both sides, keep correct combined behavior, run tests, commit resolution.

**Q: Pull request workflow?**  
Small branches, clear description, CI green, review, squash or merge per team policy.

**Q: Revert vs reset?**  
Revert = new commit undoing a change (safe on shared branches). Reset moves branch pointer (destructive if pushed).

**Q: Release strategy?**  
Tags, changelog, feature flags, ability to roll back. Trunk-based or release branches depending on team.

---

## 10. CSS core

See also: [Box Model](css/box-model.md), [Flexbox and Grid](css/layout-flexbox-grid.md), [Specificity](css/specificity.md), [Positioning](css/positioning.md).

**Q: CSS box model?**  
Content, padding, border, margin. `border-box` makes `width` include padding and border — use it.

**Q: Flexbox vs Grid?**  
Flex: one axis alignment. Grid: rows and columns together. Component vs page layout.

**Q: Specificity calculation?**  
Inline > ID > class/pseudo-class/attribute > element. Ties → later rule wins. Avoid `!important` arms races.

**Q: Positioning types?**  
`static`, `relative`, `absolute`, `fixed`, `sticky` — absolute needs positioned ancestor; sticky needs threshold and scroll room.

**Q: Mobile-first vs desktop-first?**  
Mobile-first: base styles for small screens, `min-width` media queries add complexity. Usually better performance and simpler CSS than shrinking desktop layouts.

---

## 11. Routing

**Q: Client-side routing?**  
Intercept link clicks, `history.pushState`, render matching component without full reload. State persists; faster navigation.

**Q: Dynamic routes?**  
`/users/:id` — read param, fetch entity. Same component, different data.

**Q: Nested routes?**  
Parent layout stays mounted; child swaps in `<Outlet>`. Dashboards, settings tabs.

**Q: Protect routes?**  
Check auth before render; redirect to login. Guard APIs too — client guard is UX, not security.

**Q: URL and state sync?**  
Filters, pagination, tabs in query params — shareable, back button works. URL as source of truth for bookmarkable UI state.

---

## 12. API and data fetching

**Q: REST principles?**  
Resources as nouns, HTTP verbs with meaning, stateless requests, consistent status codes.

**Q: Common HTTP status codes?**  
200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Validation, 429 Rate limit, 500 Server error.

**Q: Global API error handling?**  
One client wrapper normalizes errors, handles 401 redirect, retries transient failures, logs correlation ids.

**Q: Pagination strategies?**  
Offset/limit — simple, bad on shifting data. Cursor — stable next page with `nextCursor` token.

**Q: Caching and retries?**  
Cache GETs with TTL; retry idempotent requests with exponential backoff and jitter.

---

## 13. Performance metrics

**Q: Memoization?**  
Cache pure function results or React computed values when recalculation is costly and inputs repeat.

**Q: Code splitting?**  
Separate bundles loaded on demand — routes, heavy modals, editors.

**Q: Lazy vs eager loading?**  
Lazy: load when needed (below fold, on navigation). Eager: upfront — use for critical path only.

**Q: Reduce bundle size?**  
Tree-shake, analyze bundle, remove dead deps, dynamic import, avoid shipping all locales/icons.

**Q: LCP, CLS, INP?**  
LCP: largest content visible ≤2.5s. CLS: layout shift ≤0.1. INP: interaction responsiveness ≤200ms. See [Core Web Vitals](web/core-web-vitals.md).

---

## 14. Security

See [Web Security](web/security.md).

**Q: How JWT works?**  
Signed token (header.payload.signature). Server verifies signature; payload can hold claims. Stateless auth — watch expiry and refresh flow.

**Q: Where to store tokens?**  
HttpOnly Secure SameSite cookies for session/refresh — not localStorage if XSS is a risk.

**Q: Prevent XSS?**  
Escape output, sanitize HTML, CSP, avoid `innerHTML` with user data.

**Q: CSRF?**  
Trick browser into authenticated request. SameSite cookies, CSRF tokens, check Origin.

**Q: CORS?**  
Browser blocks reading cross-origin responses unless server sends allow headers. Not a substitute for auth.

---

## 15. Testing

**Q: Unit vs integration?**  
Unit: one function/component isolated. Integration: several pieces together. Test behavior users see; integration catches wiring bugs.

**Q: What to test in frontend?**  
User flows, edge cases, a11y roles, error/loading states. Not implementation details like internal state variable names.

**Q: Testing async?**  
`findBy*`, `waitFor`, fake timers for debounce. Await UI update before assert.

**Q: Mocking?**  
Replace network, clock, module boundaries — not the logic under test.

**Q: When E2E?**  
Critical paths: login, checkout, core workflow. Fewer, slower, high confidence. Playwright/Cypress.

---

## 16. Build tools

**Q: What happens in `npm install`?**  
Read package.json + lockfile, resolve dependency tree, download tarballs, write `node_modules`, run lifecycle scripts.

**Q: Important package.json fields?**  
`scripts`, `dependencies`, `devDependencies`, `engines`, `type`, `exports`, `sideEffects` (affects tree-shaking).

**Q: Vite vs Webpack?**  
Vite: native ESM dev server, fast HMR, Rollup build. Webpack: highly configurable, mature ecosystem. Greenfield often Vite; legacy often Webpack.

**Q: Role of Babel?**  
Transpile JSX and modern JS to targets browsers support. Compiler, not bundler.

**Q: Build-time vs runtime config?**  
Build-time baked into bundle (`import.meta.env` at build). Runtime read from `window.__ENV__` or server — same artifact, different deploy envs.

---

## 17. Architecture

**Q: Design reusable components?**  
Small API, composition (`children`), sensible defaults, no hidden global deps.

**Q: Separation of concerns?**  
Fetch in hooks/services, presentation in components, routing in router layer.

**Q: Scale frontend apps?**  
Feature folders, lazy routes, clear shared vs feature code, consistent state boundaries.

**Q: Anti-patterns?**  
God components, prop drilling everything, duplicating server cache, business logic in every leaf.

**Q: Folder structure?**  
`features/`, `shared/`, `components/`, colocate tests. Scale by feature, not by file type only.

---

## 18. Accessibility

**Q: Why accessibility matters?**  
Legal, ethical, and UX — keyboard users, screen readers, low vision, motor impairments. Better for everyone (captions, focus order).

**Q: Keyboard navigation?**  
Logical tab order, visible focus, interactive elements are real `<button>`/`<a>`, Escape closes modals.

**Q: ARIA roles?**  
Fill gaps when native HTML insufficient. First rule: use native elements.

**Q: Focus management?**  
Trap focus in modal, return focus on close, move focus to errors.

**Q: Color contrast?**  
WCAG AA minimum 4.5:1 normal text. Don't convey meaning by color alone.

---

## 19. Frontend system design

See [Rendering Patterns](web/rendering-patterns.md).

**Q: SPA vs SSR tradeoffs?**  
SPA: fast after load, rich interaction, weaker first paint/SEO. SSR/SSG: faster first content, better SEO, more server complexity.

**Q: Hydration?**  
Client JS attaches to server HTML. Mismatch if server and client render differ (`Date.now()`, random ids).

**Q: When micro-frontends?**  
Multiple teams, independent deploys, org scale — not default for small products. Operational cost is real.

**Q: Role of CDN?**  
Cache static assets at edge — lower latency, less origin load.

**Q: Frontend caching strategy?**  
Hashed filenames long-cache; HTML short-cache; API via query library stale times; service worker for offline if PWA.

---

## How to use this bank in one sitting

1. Pick one section. Close the answers.
2. Answer all five questions out loud in 15 minutes.
3. Read the section and fix gaps in understanding, not wording.
4. Next day, one section cold recall — only the memory hook first, then expand.

**Memory hook for the whole bank:** Fundamentals (scope, async), React (data ownership, effects), platform (DOM, security, metrics), delivery (git, build, architecture). Map every question to one of those four buckets and you always know where to start explaining.
