# Browser event loop vs Node.js event loop

## 1. Why This Exists — The Problem First

You ship isomorphic code—utilities shared between React client and Next.js server. It works in Node tests. In the browser, `setImmediate` is undefined. On the server, `requestAnimationFrame` does not mean what you expect. SSR renders HTML on Node; hydration runs in Chrome; subtle timing differences cause "Text content does not match" warnings.

Full-stack developers often learn **one** event loop story (usually the browser's) and apply it everywhere. The two loops share ideas—stack, queues, microtasks—but differ in phases, APIs, and what happens between turns. Confusing them produces bugs that only appear in production, under SSR, or when load order changes.

## 2. The Analogy — Make It Obvious

Two cities run traffic with **roundabouts**, but the street layout differs.

**Browser city:**

- One main road (macrotasks): `setTimeout`, network events, user clicks.
- A side alley (microtasks): Promises, `queueMicrotask`.
- Every lap: **one car** from the main road, then **all cars** from the alley, then a **paint crew** refreshes billboards (render frame).

**Node.js city (libuv):**

- Six districts visited in fixed order each lap: timers, pending, idle, prepare, poll (I/O), check (`setImmediate`), close.
- A **VIP lane** ([`process.nextTick`](./what-is-process-nexttick.md)) runs before the alley (Promises) **between every district**.
- No paint crew—servers do not render pixels.
- A **warehouse crew** (thread pool) handles some loads off the main road.

Same language (JavaScript), different traffic laws. Driving in London with New York's map causes crashes.

## 3. How It Actually Works — The Full Explanation

Both environments:

- Run JavaScript on a **single main thread** (per window/tab in browser; per Node process by default).
- Use a **call stack** for synchronous execution.
- Schedule async work via **queues** when the stack empties.

They diverge in **what queues exist** and **processing order**.

### Browser event loop (simplified)

1. Run one **macrotask** (task): e.g. `setTimeout` callback, `message` event, I/O callback.
2. Run **all microtasks**: Promise reactions, `queueMicrotask`, `MutationObserver`.
3. **Update rendering** if needed: `requestAnimationFrame`, style/layout/paint.
4. Repeat.

No `setImmediate`. No libuv poll phase. User input and rendering compete with your JS on the same thread—long tasks cause jank.

### Node.js event loop (libuv)

Documented in [What is the Node.js event loop](./what-is-node-js-event-loop.md) and [event loop phases](./what-are-event-loop-phases.md):

1. Phases: timers → pending → idle/prepare → **poll** → check → close.
2. Between each phase: drain `process.nextTick`, then Promise microtasks.
3. `setImmediate` runs in **check**, after poll I/O callbacks.
4. [libuv](./what-is-libuv.md) thread pool handles some async work; browser has no equivalent exposed to JS.

### API availability

| API | Browser | Node.js |
|-----|---------|---------|
| `setTimeout` / `setInterval` | Yes (macrotask) | Yes (timers phase) |
| `Promise` / `queueMicrotask` | Yes (microtask) | Yes (microtask) |
| `requestAnimationFrame` | Yes (before paint) | No (no DOM render) |
| `setImmediate` | No | Yes (check phase) |
| `process.nextTick` | No | Yes (before microtasks) |

### Ordering differences that bite

**Main module in Node:**

```txt
sync → nextTick → Promise → setTimeout → setImmediate
```

**Browser (no nextTick/setImmediate):**

```txt
sync → Promise → setTimeout → (render) → rAF
```

**Inside I/O callback in Node:** `setImmediate` often before `setTimeout` on the next turn—poll phase already passed timers for that iteration.

### SSR and hydration

Server render runs on Node's loop—no rAF, no layout. Client hydration uses browser loop with rendering. If server HTML depends on `Date.now()` or random IDs without matching client, mismatch is a **data** bug—but async timing during SSR (fetch order) can also produce different HTML if code assumes browser-only ordering.

### Performance implications

- **Browser:** Block main thread > 50ms → long task, bad INP, janky scroll.
- **Node:** Block main thread → event loop lag, slow APIs for all clients. No frame budget, but SLA latency matters.

## 4. Real Code — See It Working

**Node.js ordering** — save as `node-loop.js`, run `node node-loop.js`:

```js
console.log('sync');

process.nextTick(() => console.log('nextTick'));
Promise.resolve().then(() => console.log('promise'));
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
```

**Browser ordering** — paste in DevTools console or save as `browser-loop.html`:

```html
<script>
  console.log('sync');
  Promise.resolve().then(() => console.log('promise'));
  setTimeout(() => console.log('timeout'), 0);
  requestAnimationFrame(() => console.log('rAF'));
</script>
```

Typical browser output:

```
sync
promise
timeout
rAF
```

**Cross-environment safe deferral:**

```js
// defer.js — works in modern browser and Node
function defer(fn) {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn);
  } else {
    Promise.resolve().then(fn);
  }
}

defer(() => console.log('deferred safely'));
```

Avoid `setImmediate` and `process.nextTick` in shared isomorphic modules unless guarded:

```js
function deferNodeCheck(fn) {
  if (typeof setImmediate === 'function') {
    setImmediate(fn);
  } else {
    setTimeout(fn, 0);
  }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between the browser and Node.js event loops?**

Both use a single main thread and async queues. The browser processes one macrotask, then all microtasks, then rendering. Node uses libuv's phased loop (timers, poll, check, etc.), runs `process.nextTick` before Promise microtasks between phases, includes `setImmediate`, and has no render step. Node also uses a libuv thread pool for some I/O.

**Q: Is `setImmediate` available in browsers?**

No. It is Node-specific (check phase). Use `setTimeout(fn, 0)` or `queueMicrotask` for cross-environment deferral, understanding timing still differs.

**Q: What is `process.nextTick` and where does it run?**

Node-only API scheduling callbacks before Promise microtasks and before the event loop continues to the next phase. Highest priority user scheduling in Node. Not available in browsers. See [What is process.nextTick](./what-is-process-nexttick.md).

**Q: How does SSR bridge both event loops?**

Server components and SSR run JavaScript on Node—libuv phases, no DOM. The browser hydrates with its own loop and rendering. Shared code must avoid Node-only APIs and avoid assuming identical async ordering. Hydration mismatches come from different HTML output or client-only branches (`window` checks).

**Q: What causes janky UI in the browser?**

Long synchronous JavaScript on the main thread blocks input and paint. Measure with Performance panel, Long Tasks API, Web Vitals (INP). Fix by chunking work, `requestIdleCallback`, workers, or moving work off critical path.

**Q: What causes slow APIs on the server?**

Event loop blocking and lag—same single-threaded constraint, different symptoms (latency not frame drops). Monitor `monitorEventLoopDelay`.

**Q: Does `setTimeout(fn, 0)` behave the same in both?**

Both defer past current sync code. In Node it enters timers phase; in browser it is a macrotask after microtasks. Neither means "instant." Neither runs before pending Promise microtasks.

**Q: Why does this distinction matter for full-stack developers?**

You write async code in both environments daily. Wrong assumptions break isomorphic utilities, SSR, test mocks (jsdom approximates browser, not Node), and debugging when logs order differently on server vs client.

## 6. The Traps — What Goes Wrong

**Trap: Using `setImmediate` in client bundles.**

Runtime error or bundler polyfill with different timing. Guard or use `queueMicrotask`.

**Trap: Using `process.nextTick` in shared code.**

Undefined in browser. Same fix as above.

**Trap: Assuming jsdom tests prove Node server behavior.**

jsdom simulates browser APIs and loop-ish behavior; it does not emulate libuv phases or `setImmediate` ordering exactly like Node.

**Trap: "SSR bug = React bug only."**

Often environment mismatch—`window`, `localStorage`, random IDs, or fetch timing on server vs client.

**Trap: Ignoring browser long tasks while optimizing only server p99.**

Users feel client jank even when APIs are fast.

**Trap: Expecting `requestAnimationFrame` on the server.**

Some SSR code accidentally branches on rAF; server path must use different scheduling.

## 7. Compare With Related Concepts

| Topic | Browser | Node |
|-------|---------|------|
| Macrotasks | task queue | phase queues (timers, poll, etc.) |
| Microtasks | Promise, queueMicrotask | Promise + nextTick (first) |
| Rendering | rAF, layout, paint | none |
| Extra scheduling | — | setImmediate, nextTick |
| I/O model | browser internals | libuv + thread pool |

**Related pages:**

- [Node.js event loop](./what-is-node-js-event-loop.md)
- [Event loop phases](./what-are-event-loop-phases.md)
- [process.nextTick vs setImmediate](./process-nexttick-vs-setimmediate.md)
- [Microtask queue](./what-is-microtask-queue.md)

**Rule:** Server = phases + nextTick + no render. Browser = macrotask/microtask + render. Shared code = `queueMicrotask` / Promises, no Node-only schedulers.

## 8. 🧠 The Memory Hook — What Sticks

Two cities, same JavaScript drivers: the **browser** pauses for **paint** between laps; **Node** visits **six districts** and has a **VIP lane** (`nextTick`) with no billboards to update. Code that runs in both cities must not use street names that only exist in one map.
